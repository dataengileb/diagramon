/* ==========================================================================
   Diagramon · contratos de datos (Open Data Contract Standard, ODCS, Bitol)
   --------------------------------------------------------------------------
   YAML escrito a mano (sin librerías), pensado para abrirse con cualquier
   herramienta ODCS. Versión del estándar: v3.2.0
   (github.com/bitol-io/open-data-contract-standard, última publicada).
   - toODCS(ds, m, ctx)   -> texto YAML de UN conjunto (un contrato)
   - toODCSAll(m, ctx)    -> todos los conjuntos declarados, documentos separados por `---`
   - yq(s)                -> escalar YAML (entre comillas solo si hace falta)
   m = el modelo del diagrama (nodos, interesados y fases se leen de ahí).
   ctx (opcional) = { title } (por si el modelo no lo trae).
   Correspondencia (campo de Diagramon -> campo de ODCS):
     name -> name y schema[0].name · contract.version -> version · contract.status
     (draft/agreed/deprecated) -> status (draft/active/deprecated) · domain -> domain ·
     product -> customProperties dataProduct (el campo dataProduct está obsoleto desde ODCS 3.1.0) · description -> description.purpose · contract.terms ->
     description.usage · classes -> tags · schema[] -> schema[0].properties (logicalType,
     physicalType, primaryKey/primaryKeyPosition, required, classification, description) ·
     quality[] -> quality (metric nullValues / duplicateValues / invalidValues, o type text) ·
     freshness -> slaProperties latency · volume.retentionDays -> slaProperties retention ·
     owner / steward -> team.members (Owner / Steward).
   Sin equivalente en ODCS (van a customProperties): id de Diagramon, capa, formato,
   consumidores, fase, volumen diario (GB) y el id/nombre exacto de cada regla de calidad que se pasa a texto.
   ========================================================================== */
(function () {
  'use strict';
  const ODCS_VERSION = 'v3.2.0';

  /* ---------- YAML ---------- */
  // Escalar: texto sin comillas solo si YAML lo lee como cadena tal cual (nada de números, fechas, true/no/null, indicadores, «: » ni « #»); si no, comillas dobles (JSON es YAML válido)
  const RESERVED = /^(true|false|yes|no|on|off|y|n|null|nil|none|~)$/i, PLAIN = /^[\p{L}\p{N}_][\p{L}\p{N}_ .\/()+@-]*$/u;
  const yq = s => {
    if (s === true || s === false) return String(s);
    if (typeof s === 'number') return Number.isFinite(s) ? String(s) : '0';
    s = String(s ?? '');
    const dateLike = /^\d{4}-\d{1,2}-\d{1,2}/.test(s), num = /\d/.test(s) && /^[-+]?[\d_,]*\.?\d*([eE][-+]?\d+)?$/.test(s) || /^[-+]?0[xo]/i.test(s) || /^[-+.]?(inf|infinity|nan)$/i.test(s);
    if (s && PLAIN.test(s) && !/\s$/.test(s) && !RESERVED.test(s) && !dateLike && !num && !/^-\s/.test(s)) return s;
    return JSON.stringify(s);
  };
  const flow = a => `[${a.map(yq).join(', ')}]`;
  // Emisor: pares clave/valor con sangría; undefined/''/[] se omiten
  const empty = v => v == null || v === '' || (Array.isArray(v) && !v.length) || (v && typeof v === 'object' && !Array.isArray(v) && !v.__flow && Object.values(v).every(empty));
  function emit(v, ind) {
    const pad = ' '.repeat(ind), out = [];
    if (Array.isArray(v)) {   // lista de objetos o de escalares
      v.forEach(it => {
        if (it && typeof it === 'object' && !Array.isArray(it)) {
          const lines = emit(it, ind + 2);
          if (lines.length) out.push(`${pad}- ${lines[0].slice(ind + 2)}`, ...lines.slice(1));
        } else out.push(`${pad}- ${yq(it)}`);
      });
      return out;
    }
    Object.entries(v).forEach(([k, x]) => {
      if (empty(x)) return;
      if (x && typeof x === 'object' && x.__flow) out.push(`${pad}${k}: ${flow(x.__flow)}`);
      else if (Array.isArray(x)) out.push(`${pad}${k}:`, ...emit(x, ind + 2));
      else if (x && typeof x === 'object') out.push(`${pad}${k}:`, ...emit(x, ind + 2));
      else out.push(`${pad}${k}: ${yq(x)}`);
    });
    return out;
  }
  const fl = a => (a && a.length ? { __flow: a } : undefined);

  /* ---------- ayudas ---------- */
  // Tipo libre («varchar(20)», «decimal(10,2)», «array<string>») → logicalType de ODCS (o undefined si no se reconoce)
  function logical(t) {
    const b = String(t || '').trim().toLowerCase().match(/^[a-z_]+/)?.[0] || '';
    if (/^(string|str|varchar|nvarchar|char|nchar|text|uuid|guid|clob)$/.test(b)) return 'string';
    if (/^(int|integer|bigint|smallint|tinyint|long|short|serial|bigserial)$/.test(b)) return 'integer';
    if (/^(decimal|numeric|number|float|double|real|money|dec)$/.test(b)) return 'number';
    if (/^(bool|boolean|bit)$/.test(b)) return 'boolean';
    if (b === 'date') return 'date';
    if (/^(timestamp|timestamptz|datetime|datetime2)$/.test(b)) return 'timestamp';
    if (b === 'time') return 'time';
    if (/^(array|list)$/.test(b)) return 'array';
    if (b === 'map') return 'map';
    if (/^(struct|object|record|json|jsonb|variant)$/.test(b)) return 'object';
    return undefined;
  }
  // Segundos → { value, unit } con la unidad más grande que lo deja entero (d, h, m, s)
  const secs = s => (s % 86400 === 0 && s ? { value: s / 86400, unit: 'd' } : s % 3600 === 0 && s ? { value: s / 3600, unit: 'h' } : s % 60 === 0 && s ? { value: s / 60, unit: 'm' } : { value: s, unit: 's' });
  const DUR = { s: 1, sec: 1, seg: 1, m: 60, min: 60, h: 3600, hr: 3600, hora: 3600, horas: 3600, hour: 3600, hours: 3600, d: 86400, dia: 86400, dias: 86400, día: 86400, días: 86400, day: 86400, days: 86400 };
  function durSecs(v) {   // «15m», «4 h», «1d» → segundos (null si no es válida); mismo formato que parseDur de la app
    const mt = String(v ?? '').trim().toLowerCase().match(/^(\d+(?:[.,]\d+)?)\s*([a-záéíóú]*)$/);
    if (!mt) return null;
    const n = +mt[1].replace(',', '.');
    if (!mt[2]) return n === 0 ? 0 : null;
    return DUR[mt[2]] ? n * DUR[mt[2]] : null;
  }
  const SEV = { low: 'info', medium: 'warning', high: 'error' };
  const STATUS = { draft: 'draft', agreed: 'active', deprecated: 'deprecated' };
  // Identificador estable (formato UUID) a partir del título del diagrama y el id del conjunto: el mismo diagrama da siempre el mismo contrato
  function uid(seed) {
    let h = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];
    for (let i = 0; i < seed.length; i++) h = h.map((x, j) => Math.imul(x ^ (seed.charCodeAt(i) + j), 16777619 + 2 * j) >>> 0);
    const hex = h.map(x => x.toString(16).padStart(8, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${'89ab'[parseInt(hex[16], 16) & 3]}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  }

  // Regla de calidad de Diagramon → regla ODCS. Con columna que existe va dentro de la propiedad; si no, al nivel del esquema
  function rule(q, hasCol) {
    const sev = SEV[q.severity], col = q.column || '', p = String(q.param || '').trim();
    const lib = (metric, dimension, extra) => ({ metric, mustBe: 0, ...(extra ? { arguments: extra } : {}), unit: 'rows', dimension, severity: sev });
    if (q.rule === 'not_null' && hasCol) return lib('nullValues', 'completeness');
    if (q.rule === 'unique' && hasCol) return lib('duplicateValues', 'uniqueness');
    if (q.rule === 'regex' && hasCol && p) return lib('invalidValues', 'conformity', { pattern: p });
    if (q.rule === 'accepted_values' && hasCol && p) return lib('invalidValues', 'conformity', { validValues: fl(p.split(',').map(x => x.trim()).filter(Boolean)) });
    // Sin equivalente en la biblioteca de ODCS (rango, frescura, personalizada) o sin columna/parámetro: regla de tipo texto
    const name = { not_null: 'not null', unique: 'unique', range: 'range', regex: 'pattern', accepted_values: 'accepted values', freshness: 'freshness', custom: 'custom' }[q.rule] || q.rule;
    return { type: 'text', description: `${name}${col ? ` (${col})` : ''}${p ? `: ${p}` : ''}`,
      dimension: { range: 'accuracy', freshness: 'timeliness', not_null: 'completeness', unique: 'uniqueness', regex: 'conformity', accepted_values: 'conformity' }[q.rule], severity: sev };
  }

  /* ---------- un contrato ---------- */
  function toODCS(ds, m, ctx) {
    m = m || {}; ctx = ctx || {};
    const nodeName = id => (m.nodes || []).find(n => n.id === id)?.label || id;
    const person = v => { const s = (m.stakeholders || []).find(x => x.id === v); return s ? (s.name || s.id) : v; };
    const phase = ds.phase ? (m.phases || []).find(p => p.id === ds.phase)?.name || ds.phase : '';
    const c = ds.contract || {}, cols = ds.schema || [], colNames = new Set(cols.map(x => x.name));
    let pk = 0;
    const properties = cols.map(col => {
      const lt = logical(col.type), rules = (ds.quality || []).filter(q => q.column === col.name).map(q => rule(q, true));
      return { name: col.name, ...(col.type ? { physicalType: col.type } : {}), logicalType: lt, primaryKey: col.key ? true : undefined, primaryKeyPosition: col.key ? ++pk : undefined,
        required: col.nullable === false ? true : undefined, classification: col.pii ? 'pii' : undefined, description: col.desc, tags: fl(col.pii ? ['pii'] : []), quality: rules };
    });
    const loose = (ds.quality || []).filter(q => !q.column || !colNames.has(q.column)).map(q => rule(q, false));
    const sla = [], f = ds.freshness != null ? durSecs(ds.freshness) : null;
    if (f != null) sla.push({ property: 'latency', ...secs(f), description: 'Freshness: maximum age of the data' });
    if (ds.volume?.retentionDays != null) sla.push({ property: 'retention', value: ds.volume.retentionDays, unit: 'd' });
    const members = [ds.owner && { username: person(ds.owner), role: 'Owner' }, ds.steward && { username: ds.steward, role: 'Steward' }].filter(Boolean);
    const cp = (property, value) => (empty(value) ? null : { property, value: Array.isArray(value) ? { __flow: value } : value });
    const doc = {
      apiVersion: ODCS_VERSION, kind: 'DataContract', id: uid(`${m.title || ctx.title || ''}|${ds.id}`), name: ds.name, version: c.version || '1.0.0', status: STATUS[c.status] || 'draft',
      domain: ds.domain,
      description: { purpose: ds.description, usage: c.terms }, tags: fl(ds.classes),
      schema: [{ name: ds.name, physicalType: 'table', description: ds.description, properties, quality: loose }],
      slaProperties: sla, team: members.length ? { name: ds.domain, members } : undefined,
      customProperties: [cp('diagramonId', ds.id), cp('dataProduct', ds.product ? true : undefined), cp('layer', ds.layer), cp('format', ds.format), cp('consumers', (c.consumers || []).map(nodeName)), cp('phase', phase),
        cp('volumePerDayGB', ds.volume?.perDay)].filter(Boolean)
    };
    return `# Open Data Contract Standard ${ODCS_VERSION} · generated by Diagramon\n${emit(doc, 0).join('\n')}\n`;
  }
  // Todos los conjuntos declarados; documentos YAML separados por `---`
  const toODCSAll = (m, ctx) => (m.datasets || []).map(d => toODCS(d, m, ctx)).join('---\n');

  window.DiagramonContract = { toODCS, toODCSAll, yq, version: ODCS_VERSION };
})();
