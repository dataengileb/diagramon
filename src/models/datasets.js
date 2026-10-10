/* ==========================================================================
   Diagramon · modelo: conjuntos de datos, catálogo y frescura (puro, sin DOM)
   --------------------------------------------------------------------------
   Movido desde src/app.js (bloque «datasetModel») sin cambios de comportamiento.
   Se usa como fábrica: no necesita nada de la app y devuelve sus funciones.
   API: window.DiagramonModels.datasets
   ========================================================================== */
window.DiagramonModels = window.DiagramonModels || {};
window.DiagramonModels.datasets = function () {
  const DS_MAX = 500, DS_COLS = 300, DS_RULES_MAX = 100, DS_DEFAULT_DAYS = 365;
  const DS_FORMATS = ['delta', 'iceberg', 'hudi', 'parquet', 'avro', 'json', 'csv', 'other'];
  const DS_RULES = ['not_null', 'unique', 'range', 'regex', 'accepted_values', 'freshness', 'custom'];
  const DS_STATUS = ['draft', 'agreed', 'deprecated'], DS_SEV = ['low', 'medium', 'high'];
  const dsK = s => String(s ?? '').trim().toLowerCase();
  const dsText = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
  const dsLong = (v, n) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, n);
  const dsYes = v => v === true || /^(true|yes|si|sí|1)$/i.test(String(v ?? '').trim());
  const dsNo = v => v === false || /^(false|no|0)$/i.test(String(v ?? '').trim());
  const dsNum = v => { const n = typeof v === 'number' || (typeof v === 'string' && v.trim() !== '') ? Number(v) : NaN; return Number.isFinite(n) && n >= 0 ? n : null; };
  const dsNextId = list => `DS-${String(Math.max(0, ...list.map(x => +String(x.id).slice(3) || 0)) + 1).padStart(3, '0')}`;
  // Limpia m.datasets contra el diagrama m (nodos y fases que existen); h = { layer(v) → clave | null, classes: [claves], formats?, rules?, normDur(v) → texto | null }
  function cleanCatalog(raw, m, h) {
    const seenId = new Set(), seenName = new Set(), items = [], nodes = new Set((m.nodes || []).map(n => n.id)), phases = new Set((m.phases || []).map(p => p.id));
    const formats = h.formats || DS_FORMATS, rules = h.rules || DS_RULES;
    (Array.isArray(raw) ? raw : []).forEach(r => {
      if (!r || typeof r !== 'object' || Array.isArray(r)) return;
      const name = dsText(r.name, 120), key = dsK(name);
      if (!name || seenName.has(key)) return;
      seenName.add(key);
      const rid = String(r.id ?? '').trim(), id = /^DS-\d+$/.test(rid) && !seenId.has(rid) ? rid : '';
      if (id) seenId.add(id);
      const o = { id, name }, put = (k, v) => { if (v) o[k] = v; };
      put('domain', dsText(r.domain, 60));
      put('layer', h.layer ? h.layer(r.layer) : '');
      put('description', dsLong(r.description, 2000));
      put('owner', dsText(r.owner, 120));
      put('steward', dsText(r.steward, 120));
      if (dsYes(r.product)) o.product = true;
      { const cl = [...new Set((Array.isArray(r.classes) ? r.classes : typeof r.classes === 'string' ? r.classes.split(/[,;]/) : []).map(dsK).filter(k => (h.classes || []).includes(k)))]; if (cl.length) o.classes = cl; }
      { const f = dsK(r.format); if (formats.includes(f)) o.format = f; }
      { const fr = r.freshness == null || r.freshness === '' ? null : h.normDur(r.freshness); if (fr != null) o.freshness = fr; }
      if (r.volume && typeof r.volume === 'object' && !Array.isArray(r.volume)) {
        const v = {}, pd = dsNum(r.volume.perDay), rd = dsNum(r.volume.retentionDays);
        if (pd != null) v.perDay = pd;
        if (rd != null) v.retentionDays = Math.round(rd);
        if (Object.keys(v).length) o.volume = v;
      }
      const schema = (Array.isArray(r.schema) ? r.schema : []).filter(c => c && typeof c === 'object' && !Array.isArray(c) && dsText(c.name, 120)).slice(0, DS_COLS).map(c => {
        const col = { name: dsText(c.name, 120) }, ty = dsText(c.type, 40), ds = dsText(c.desc, 500);
        if (ty) col.type = ty;
        if (dsYes(c.key)) col.key = true;
        if (dsYes(c.pii)) col.pii = true;
        if (dsNo(c.nullable)) col.nullable = false;
        if (ds) col.desc = ds;
        return col;
      });
      if (schema.length) o.schema = schema;
      const quality = (Array.isArray(r.quality) ? r.quality : []).filter(q => q && typeof q === 'object' && rules.includes(dsK(q.rule))).slice(0, DS_RULES_MAX).map(q => {
        const x = { rule: dsK(q.rule) }, col = dsText(q.column, 120), pa = dsText(q.param, 200), sv = dsK(q.severity);
        if (col) x.column = col;
        if (pa) x.param = pa;
        if (DS_SEV.includes(sv)) x.severity = sv;
        return x;
      });
      if (quality.length) o.quality = quality;
      if (r.contract && typeof r.contract === 'object' && !Array.isArray(r.contract)) {
        const c = r.contract, ver = dsText(c.version, 20), st = dsK(c.status), cons = [...new Set((Array.isArray(c.consumers) ? c.consumers : []).map(x => String(x ?? '').trim()).filter(x => nodes.has(x)))], terms = dsLong(c.terms, 2000);
        if (ver || DS_STATUS.includes(st) || cons.length || terms) {
          const k = { version: ver || '1.0.0', status: DS_STATUS.includes(st) ? st : 'draft' };
          if (cons.length) k.consumers = cons;
          if (terms) k.terms = terms;
          o.contract = k;
        }
      }
      { const ph = String(r.phase ?? '').trim(); if (ph && phases.has(ph)) o.phase = ph; }
      items.push(o);
    });
    items.forEach(o => { if (!o.id) o.id = dsNextId(items); });
    return items.slice(0, DS_MAX);
  }
  // Conexiones que llevan el conjunto `name` (sin distinguir mayúsculas)
  const dsEdges = (m, name) => { const k = dsK(name); return (m.edges || []).filter(e => (e.datasets || []).some(d => dsK(d) === k)); };
  // Catálogo: declarados primero (en el orden del arreglo) y después los nombres usados en conexiones sin declarar (por uso y luego alfabético)
  function catalog(m) {
    const use = new Map();
    (m.edges || []).forEach(e => [...new Set((e.datasets || []).map(dsK))].forEach(k => {
      const r = use.get(k) || { name: (e.datasets || []).find(d => dsK(d) === k), edges: 0, nodes: new Set() };
      r.edges++; r.nodes.add(e.from); r.nodes.add(e.to); use.set(k, r);
    }));
    const declared = (m.datasets || []).map(ds => { const k = dsK(ds.name), u = use.get(k); return { ds, name: ds.name, key: k, declared: true, edges: u ? u.edges : 0, nodes: u ? [...u.nodes] : [] }; });
    const known = new Set(declared.map(d => d.key));
    const rest = [...use.entries()].filter(([k]) => !known.has(k)).map(([k, u]) => ({ ds: null, name: u.name, key: k, declared: false, edges: u.edges, nodes: [...u.nodes] }))
      .sort((a, b) => b.edges - a.edges || a.name.localeCompare(b.name));
    return [...declared, ...rest];
  }
  // Frescura de extremo a extremo: el camino más lento de un origen del linaje a un consumidor, sumando edge.latency (en ms). Un salto sin latencia suma 0 y se cuenta en unknownHops.
  // Sin ninguna latencia en el camino → worst null y estado 'unknown'; sin SLA también es 'unknown'. h = { lineageOf(m, name) → { origins, consumers, nodes } | null, parseDur(v) → segundos | null }
  function e2eFreshness(m, name, h) {
    const ds = (m.datasets || []).find(d => dsK(d.name) === dsK(name)), slaS = ds?.freshness != null ? h.parseDur(ds.freshness) : null, sla = slaS == null ? null : slaS * 1000;
    const none = { worst: null, path: [], hops: 0, unknownHops: 0, sla, state: 'unknown' };
    const lin = h.lineageOf(m, name), es = dsEdges(m, name).filter(e => e.from !== e.to);
    if (!lin || !es.length) return none;
    const steps = es.flatMap(e => { const s = e.latency == null || e.latency === '' ? null : h.parseDur(e.latency), ms = s == null ? null : s * 1000; return [[e.from, e.to, ms], ...(e.both ? [[e.to, e.from, ms]] : [])]; });
    const ids = [...lin.nodes], seeds = lin.origins.length ? lin.origins : ids.slice(0, 1);
    // best[id] = el camino simple más lento hasta id; el tope de relajaciones evita que un ciclo cuelgue el cálculo (como en lineageOf)
    const best = new Map(seeds.map(id => [id, { ms: 0, unk: 0, path: [id] }])), q = [...seeds], cap = ids.length * steps.length + 8;
    for (let n = 0; q.length && n < cap; n++) {
      const u = q.shift(), b = best.get(u);
      steps.forEach(([a, c, ms]) => {
        if (a !== u || b.path.includes(c)) return;
        const cand = { ms: b.ms + (ms || 0), unk: b.unk + (ms == null ? 1 : 0), path: [...b.path, c] }, cur = best.get(c);
        if (!cur || cand.ms > cur.ms || (cand.ms === cur.ms && cand.path.length > cur.path.length)) { best.set(c, cand); q.push(c); }
      });
    }
    const ends = (lin.consumers.length ? lin.consumers : ids).filter(id => best.has(id) && best.get(id).path.length > 1);
    if (!ends.length) return none;
    const top = ends.map(id => best.get(id)).reduce((a, c) => (c.ms > a.ms || (c.ms === a.ms && c.path.length > a.path.length) ? c : a));
    const hops = top.path.length - 1, worst = top.unk === hops ? null : top.ms;
    return { worst, path: top.path, hops, unknownHops: top.unk, sla, state: worst == null || sla == null ? 'unknown' : worst > sla ? 'fail' : 'pass' };
  }
  // Almacenamiento estimado: GB guardados = al día × días de retención (365 si no se indica) y costo mensual con el precio por GB-mes de la capa. h = { prices: { default, bronze… } }
  function storageEstimate(ds, h) {
    const pd = ds?.volume?.perDay;
    if (pd == null) return null;
    const gb = pd * (ds.volume.retentionDays ?? DS_DEFAULT_DAYS), price = h.prices?.[ds.layer] ?? h.prices?.default ?? 0;
    return { gb, price, monthly: gb * price };
  }
  // Cambia el nombre de un conjunto y el de sus apariciones en las conexiones (las demás se quedan). Si el nombre nuevo choca con otro conjunto declarado, devuelve m sin tocar
  function renameDataset(m, id, newName) {
    const ds = (m.datasets || []).find(d => d.id === id), name = dsText(newName, 120);
    if (!ds || !name || (m.datasets || []).some(d => d !== ds && dsK(d.name) === dsK(name))) return m;
    const old = dsK(ds.name);
    return { ...m, datasets: m.datasets.map(d => (d === ds ? { ...d, name } : d)), edges: m.edges.map(e => {
      if (!(e.datasets || []).some(x => dsK(x) === old)) return e;
      const seen = new Set(), list = e.datasets.map(x => (dsK(x) === old ? name : x)).filter(x => !seen.has(dsK(x)) && seen.add(dsK(x)));
      return { ...e, datasets: list };
    }) };
  }
  // Avisos del catálogo, ya con textos: [{ id: 'data:<tipo>:<id|nombre>', source: 'data', rule, severity, target, title, detail?, fix }]
  // h = { T, lineageOf, parseDur, sensitive(clase), short(clase), fmtDur(segundos), edgeName(e), nodeName(id) }
  function datasetIssues(m, h) {
    const out = [], T = h.T, nodeName = h.nodeName || (id => id);
    const tgt = name => { const e = dsEdges(m, name)[0]; return e ? { kind: 'edge', id: e.id } : { kind: 'node', id: '' }; };
    const add = (rule, key, severity, name, title, detail, fix) => out.push({ id: `data:${rule}:${key}`, source: 'data', rule, severity, target: tgt(name), title, ...(detail ? { detail } : {}), fix });
    if ((m.datasets || []).length) catalog(m).filter(c => !c.declared).forEach(c => add('undocumented', c.name, 'low', c.name, T('ds.find.undocumented', { name: c.name, n: c.edges }), '', T('ds.find.undocumented.fix')));
    (m.datasets || []).forEach(d => {
      const a = { id: d.id, name: d.name };
      if (d.product && (!d.owner || !d.contract)) add('product-owner', d.id, 'medium', d.name, T(!d.owner && !d.contract ? 'ds.find.ownerContract' : !d.owner ? 'ds.find.noOwner' : 'ds.find.noContract', a), '', T('ds.find.product.fix'));
      const f = e2eFreshness(m, d.name, h);
      if (f.state === 'fail') add('freshness', d.id, 'high', d.name, T('ds.find.freshness', a), T('ds.find.freshness.d', { real: h.fmtDur(f.worst / 1000), sla: h.fmtDur(f.sla / 1000), path: f.path.map(nodeName).join(' → ') }), T('ds.find.freshness.fix'));
      if ((d.schema || []).some(c => c.pii) && !(d.classes || []).includes('pii')) add('pii-class', d.id, 'medium', d.name, T('ds.find.piiClass', a), '', T('ds.find.piiClass.fix'));
      const sens = (d.classes || []).filter(k => h.sensitive(k)), bad = sens.length ? dsEdges(m, d.name).filter(e => e.encrypted === false) : [];
      if (bad.length) add('pii-unencrypted', d.id, 'high', d.name, T('ds.find.piiUnenc', { ...a, cls: sens.map(h.short).join(', ') }), bad.map(h.edgeName).join(' · '), T('ds.find.piiUnenc.fix'));
      if (d.contract?.consumers?.length) {
        const lin = h.lineageOf(m, d.name), off = d.contract.consumers.filter(id => !lin || !lin.nodes.has(id));
        if (off.length) add('consumer-unreached', d.id, 'low', d.name, T('ds.find.unreached', { ...a, list: off.map(nodeName).join(', ') }), '', T('ds.find.unreached.fix'));
      }
      if ((d.product || d.layer === 'gold') && !(d.quality || []).length) add('no-quality', d.id, 'low', d.name, T('ds.find.noQuality', a), '', T('ds.find.noQuality.fix'));
    });
    return out;
  }
  return { DS_MAX, DS_COLS, DS_RULES_MAX, DS_DEFAULT_DAYS, DS_FORMATS, DS_RULES, DS_STATUS, DS_SEV, dsK, dsText, dsLong, dsYes, dsNo, dsNum, dsNextId, cleanCatalog, dsEdges, catalog, e2eFreshness, storageEstimate, renameDataset, datasetIssues };
};
