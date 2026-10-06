/* ==========================================================================
   Diagramon · lenguaje de texto (diagrama como código)
   --------------------------------------------------------------------------
   Convierte texto en un diagrama y un diagrama en texto. Sin IA, sin red.

     título: Tienda online
     dirección: LR                      (LR = izquierda→derecha, TB = arriba→abajo)

     grupo aws "AWS" color=melocoton {
       api: API Gateway [aws/apigateway] "REST"
       db: RDS Postgres [rds] "Multi-AZ" badge=x2
     }
     usuarios: Usuarios [user] desc="Clientes web"

     usuarios -> api : HTTPS            (-> petición)
     api -> db : SQL                    (=> datos, ~> evento, ..> opcional)
     api ~> cola : eventos              (un nodo no declarado se crea solo)

   Nodo:     id: Nombre [tipo o icono] "detalle" color=… badge=… costo=120/mes desc="…"
             costo: número en USD + /hora, /mes, /año o /3años (sin periodo = mensual)
   Grupo:    grupo id "Nombre" icon=aws/group-vpc color=… kind=physical { … }   (se pueden anidar; icon = icono de grupo, opcional;
             kind=logical|physical / tipo=lógico|físico, opcional: sin él se deduce del icono y del nombre)
   Vista:    view: security   (vista con la que se abre: full, context, logical, physical, security, data, cost, governance/gobierno; opcional)
   Gobierno: nodo o grupo … owner="Ana Pérez" steward=… team="Data Eng" costcenter=CC-100   (en español: dueño= responsable= equipo= centro=;
             los nodos heredan cada campo del grupo más cercano que lo tenga; los valores con espacios van entre comillas)
   Conexión: a -> b -> c : etiqueta color=…   (la etiqueta va en la última flecha)
   Datos:    nodo … data=pii,pci · conexión a -> b : SQL data=pii encrypted=yes
   Linaje:   conexión a -> b : SQL datasets=orders,customers   (es: tablas= o conjuntos=; con espacios: datasets="sales orders,crm.customers")
   Residencia: nodo o grupo … region=eu-west-1 (también región=, country=/país= como alias; hereda del grupo) ·
             conexión a -> b : SQL data=pii transfer=ok (transferencia=ok: transferencia entre jurisdicciones autorizada)
   Capas:    nodo o grupo … layer=gold (capa=oro): bronze|silver|gold · bronce|plata|oro · raw|curated|serving · crudo|curado|consumo
             (los nodos heredan la capa de su grupo) · línea `layers: zones` / `capas: zonas` muestra Raw/Curated/Serving en vez de Bronze/Silver/Gold
   Comentario: líneas que empiezan por # o //

   Acepta las palabras clave en inglés y en español (title/título, group/grupo,
   cost/costo, /month/mes…). stringify(m, 'en') escribe en inglés y
   stringify(m, 'es') en español. Los errores salen en el idioma de ctx.lang.
   ========================================================================== */
(() => {
  'use strict';

  const ARROWS = { '->': 'sync', '~>': 'async', '=>': 'data', '..>': 'optional' };
  const ARROW_OF = { sync: '->', async: '~>', data: '=>', optional: '..>' };
  const ARROW_SPLIT = /\s*(\.\.>|~>|=>|->)\s*/;
  const HAS_ARROW = /\.\.>|~>|=>|->/;
  const ID = /^[^\s:[\]"{}]+$/;
  const NODE_KEYS = ['color', 'badge', 'desc', 'sub', 'x', 'y', 'costo', 'cost', 'data', 'datos', 'region', 'región', 'country', 'pais', 'país', 'layer', 'capa'];
  /* ---------- gobierno: dueño, responsable, equipo, centro de costo ---------- */
  const GOV_KEYS = { owner: 'owner', dueño: 'owner', dueno: 'owner', steward: 'steward', responsable: 'steward', team: 'team', equipo: 'team',
    costcenter: 'costCenter', centro: 'costCenter', centrocosto: 'costCenter', centrodecosto: 'costCenter' };
  const GOV_WORDS = ['owner', 'steward', 'team', 'costCenter'];
  const applyGov = (o, kv) => { for (const [key, v] of Object.entries(kv)) { const k = GOV_KEYS[key]; if (k && String(v).trim()) o[k] = String(v).trim(); } };
  const REGION_KEYS = ['region', 'región', 'country', 'pais', 'país']; // todas escriben en `region`
  // review id: "observación" by=… raised=AAAA-MM-DD due=AAAA-MM-DD status=open|resolved closed=AAAA-MM-DD
  const REVIEW_KEYS = { by: 'by', por: 'by', raised: 'raised', levantada: 'raised', due: 'due', compromiso: 'due', status: 'status', estado: 'status', closed: 'closed', cerrada: 'closed' };
  const isDay = v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(`${v}T12:00Z`)) && new Date(`${v}T12:00Z`).toISOString().slice(0, 10) === v;
  // Opciones al final de una conexión: a -> b : etiqueta color=… data=pii encrypted=yes
  // (el valor puede ir entre comillas: datasets="sales orders,crm.customers")
  const EDGE_OPT = /(?:^|\s)(color|data|datos|encrypted|cifrado|both|ambos|line|linea|línea|datasets|tablas|conjuntos|transfer|transferencia)=("(?:[^"\\]|\\.)*"|\S+)\s*$/i;
  /* ---------- linaje: datasets=a,b ---------- */
  const DS_KEY = { en: 'datasets', es: 'tablas' };
  const parseDatasets = v => [...new Set(String(v).replace(/^"([\s\S]*)"$/, (_, x) => { try { return JSON.parse(`"${x}"`); } catch { return x; } }).split(/[,;]/).map(s => s.trim()).filter(Boolean))];
  // curved | elbow (también curva/curvas, codo/codos, orthogonal)
  const parseRoute = v => (/^(elbows?|codos?|orthogonal|ortogonal(es)?|angle|ángulos?)$/i.test(v) ? 'elbow' : /^(curved?|curvas?)$/i.test(v) ? 'curved' : null);
  // data=pii,pci → ['pii', 'pci'] · encrypted=yes|no (también sí/no, true/false)
  const parseData = v => [...new Set(String(v).split(',').map(s => s.trim().toLowerCase()).filter(Boolean))];
  const parseBool = v => (/^(yes|y|true|si|sí|1|on)$/i.test(v) ? true : /^(no|n|false|0|off)$/i.test(v) ? false : null);

  // Palabras que escribe stringify y mensajes de error, por idioma
  const WORDS = {
    en: { title: 'title', direction: 'direction', group: 'group', cost: 'cost', hour: 'hour', month: 'month', year: 'year', years: 'years', data: 'data', encrypted: 'encrypted', both: 'both', yes: 'yes', no: 'no', lines: 'lines', line: 'line', region: 'region', transfer: 'transfer', ok: 'ok', elbow: 'elbow', curved: 'curved', elbowOne: 'elbow', curvedOne: 'curved', author: 'author', version: 'version', view: 'view', kind: 'kind', physical: 'physical', logical: 'logical',
      review: 'review', by: 'by', raised: 'raised', due: 'due', status: 'status', closed: 'closed', resolved: 'resolved', layer: 'layer', layers: 'layers', zones: 'zones',
      owner: 'owner', steward: 'steward', team: 'team', costCenter: 'costcenter',
      layerOf: { bronze: 'bronze', silver: 'silver', gold: 'gold' } },
    es: { title: 'título', direction: 'dirección', group: 'grupo', cost: 'costo', hour: 'hora', month: 'mes', year: 'año', years: 'años', data: 'datos', encrypted: 'cifrado', both: 'ambos', yes: 'sí', no: 'no', lines: 'líneas', line: 'línea', region: 'región', transfer: 'transferencia', ok: 'ok', elbow: 'codos', curved: 'curvas', elbowOne: 'codo', curvedOne: 'curva', author: 'autor', version: 'versión', view: 'vista', kind: 'tipo', physical: 'físico', logical: 'lógico',
      review: 'revisión', by: 'por', raised: 'levantada', due: 'compromiso', status: 'estado', closed: 'cerrada', resolved: 'resuelta', layer: 'capa', layers: 'capas', zones: 'zonas',
      owner: 'dueño', steward: 'responsable', team: 'equipo', costCenter: 'centro',
      layerOf: { bronze: 'bronce', silver: 'plata', gold: 'oro' } }
  };
  const MSG = {
    en: {
      icon: r => `unknown icon “${r}”`, kind: r => `unknown type or icon “${r}”`, dir: 'direction must be LR or TB',
      brace: 'extra closing brace }', groupId: id => `invalid group id “${id}”`, groupDup: id => `group “${id}” already exists`,
      edge: 'incomplete connection', id: id => `invalid id “${id || '(empty)'}”`,
      cost: v => `invalid cost “${v}” (e.g. 120/month, 0.1/hour, 1400/year, 5000/3years)`,
      data: v => `unknown data class “${v}” (e.g. pii, pci, confidential)`, enc: v => `invalid encrypted value “${v}” (use yes or no)`,
      route: v => `invalid line style “${v}” (use curved or elbow)`, transfer: v => `invalid transfer value “${v}” (use ok)`,
      day: v => `invalid date “${v}” (use YYYY-MM-DD)`, status: v => `invalid status “${v}” (use open or resolved)`,
      layer: v => `unknown layer “${v}” (use bronze, silver or gold; also raw, curated or serving)`, lnames: v => `invalid layer naming “${v}” (use medallion or zones)`,
      view: v => `unknown view “${v}”`, gkind: v => `invalid group type “${v}” (use logical or physical)`,
      line: 'cannot understand this line', open: n => `missing } to close ${n === 1 ? 'a group' : `${n} groups`}`
    },
    es: {
      icon: r => `icono desconocido «${r}»`, kind: r => `tipo o icono desconocido «${r}»`, dir: 'la dirección debe ser LR o TB',
      brace: 'sobra una llave }', groupId: id => `id de grupo no válido «${id}»`, groupDup: id => `el grupo «${id}» ya existe`,
      edge: 'conexión incompleta', id: id => `id no válido «${id || '(vacío)'}»`,
      cost: v => `costo no válido «${v}» (ej.: 120/mes, 0.1/hora, 1400/año, 5000/3años)`,
      data: v => `clasificación de datos desconocida «${v}» (ej.: pii, pci, confidential)`, enc: v => `valor de cifrado no válido «${v}» (usa sí o no)`,
      route: v => `estilo de línea no válido «${v}» (usa curvas o codos)`, transfer: v => `valor de transferencia no válido «${v}» (usa ok)`,
      day: v => `fecha no válida «${v}» (usa AAAA-MM-DD)`, status: v => `estado no válido «${v}» (usa abierta o resuelta)`,
      layer: v => `capa desconocida «${v}» (usa bronce, plata u oro; también crudo, curado o consumo)`, lnames: v => `nombres de capa no válidos «${v}» (usa medallón o zonas)`,
      view: v => `vista desconocida «${v}»`, gkind: v => `tipo de grupo no válido «${v}» (usa lógico o físico)`,
      line: 'no se entiende esta línea', open: n => `falta cerrar ${n === 1 ? 'un grupo' : `${n} grupos`} con }`
    }
  };

  // costo=120/mes · 0.1/hora · 1400/año · 5000/3años (sin periodo = mensual)
  // cost=120/month · 0.1/hour · 1400/year · 5000/3years
  function parseCost(v) {
    const m = String(v).trim().replace(/^\$/, '').match(/^(\d[\d,]*(?:\.\d+)?|\.\d+)(?:\s*\/\s*(.+))?$/);
    if (!m) return null;
    const cost = +m[1].replace(/,/g, ''), p = (m[2] || 'mes').toLowerCase();
    let y;
    if (/^(h|hr|hrs|hora|horas|hours?|hourly)$/.test(p)) return { cost, costPeriod: 'hour' };
    if (/^(m|mo|mes|meses|months?|mensual|monthly)$/.test(p)) return { cost };
    if (/^(a|año|ano|y|yr|year|anual|annual|yearly)$/.test(p)) return { cost, costPeriod: 'year' };
    if ((y = p.match(/^(\d+)\s*(a|años|anos|año|ano|y|yrs?|years?)$/))) return { cost, costPeriod: 'multi', costYears: Math.max(1, +y[1]) };
    return null;
  }
  const costValue = (n, w) => `${+n.cost}/${n.costPeriod === 'multi' ? `${n.costYears || 3}${w.years}` : w[n.costPeriod] || w.month}`;

  const quote = s => JSON.stringify(String(s));
  const bare = v => (/[\s"[\]{}]/.test(String(v)) || String(v) === '' ? quote(v) : String(v));
  const unquote = s => { try { return JSON.parse(s); } catch { return s.slice(1, -1); } };

  // Divide el resto de una línea en etiqueta, [tipo], "detalle" y clave=valor
  function tokens(rest, keys) {
    const out = { words: [], brackets: [], quotes: [], kv: {} };
    const re = /\[([^\]]*)\]|("(?:[^"\\]|\\.)*")|([A-Za-zÀ-ÿ]+)=("(?:[^"\\]|\\.)*"|\S+)|(\S+)/g;
    let m;
    while ((m = re.exec(rest))) {
      if (m[1] != null) out.brackets.push(m[1].trim());
      else if (m[2] != null) out.quotes.push(unquote(m[2]));
      else if (m[3] != null && keys.includes(m[3].toLowerCase())) out.kv[m[3].toLowerCase()] = m[4].startsWith('"') ? unquote(m[4]) : m[4];
      else out.words.push(m[0]);
    }
    return out;
  }

  // [lambda], [aws/lambda] o [db]: tipo propio, icono oficial o error
  function resolveKind(raw, ctx, msg) {
    const t = raw.trim().toLowerCase();
    if (!t) return {};
    if (t.includes('/')) return ctx.icons[t] ? { icon: t, type: ctx.icons[t].type } : { error: msg.icon(raw) };
    if (ctx.types[t]) return { type: t };
    for (const p of ctx.providers) {
      const ref = `${p}/${t}`;
      if (ctx.icons[ref]) return { icon: ref, type: ctx.icons[ref].type };
    }
    return { error: msg.kind(raw) };
  }

  function parse(src, ctx) {
    const msg = MSG[ctx.lang] || MSG.en;
    const model = { title: ctx.lang === 'es' ? 'Diagrama sin título' : 'Untitled diagram', groups: [], nodes: [], edges: [] };
    const errors = [];
    const nodes = new Map(), groups = new Set(), stack = [];
    const err = (line, msg) => errors.push({ line, msg });
    // Clasificaciones: solo las de config.js (ctx.dataClasses), si se conocen
    const checkData = (v, ln) => {
      if (v == null) return null;
      const d = parseData(v), bad = ctx.dataClasses ? d.filter(k => !ctx.dataClasses.includes(k)) : [];
      if (bad.length) err(ln, msg.data(bad[0]));
      return d.filter(k => !bad.includes(k));
    };

    // Capa: clave o alias (bronze, raw, bronce, crudo…); si se conocen las de config.js (ctx.layers), avisa de las desconocidas
    const checkLayer = (v, ln) => {
      const k = String(v).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (!ctx.layers) return k;
      if (ctx.layers[k]) return ctx.layers[k];
      err(ln, msg.layer(v));
      return null;
    };

    const nodeFor = id => {
      if (!nodes.has(id)) {
        const n = { id, label: id, type: 'generic' };
        nodes.set(id, n);
        model.nodes.push(n);
      }
      return nodes.get(id);
    };

    String(src).split(/\r?\n/).forEach((rawLine, i) => {
      const ln = i + 1, line = rawLine.trim();
      if (!line || line.startsWith('#') || line.startsWith('//')) return;

      let m;
      if ((m = line.match(/^(t[ií]tulo|title)\s*:\s*(.*)$/i))) { model.title = m[2].trim() || model.title; return; }
      if ((m = line.match(/^(direcci[oó]n|direction)\s*:\s*(\S+)\s*$/i))) {
        const d = m[2].toUpperCase();
        if (d === 'LR' || d === 'TB') model.direction = d; else err(ln, msg.dir);
        return;
      }
      if ((m = line.match(/^(l[ií]neas|lines|routing)\s*:\s*(\S+)\s*$/i))) {
        const r = parseRoute(m[2]);
        if (r === 'elbow') model.routing = 'elbow'; else if (!r) err(ln, msg.route(m[2]));
        return;
      }
      if ((m = line.match(/^(layers|capas)\s*:\s*(\S+)\s*$/i))) {
        const f = m[2].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (/^(zones?|zonas?)$/.test(f)) model.layerNames = 'zones'; else if (!/^(medallion|medallon|medalla)$/.test(f)) err(ln, msg.lnames(m[2]));
        return;
      }
      if ((m = line.match(/^(autor|author)\s*:\s*(.*)$/i))) { if (m[2].trim()) (model.meta ||= {}).author = m[2].trim(); return; }
      if ((m = line.match(/^(versi[oó]n|version)\s*:\s*(.*)$/i))) { if (m[2].trim()) (model.meta ||= {}).version = m[2].trim(); return; }
      if ((m = line.match(/^(view|vista)\s*:\s*(\S+)\s*$/i))) {
        const v = m[2].toLowerCase() === 'gobierno' ? 'governance' : m[2].toLowerCase();
        if (!ctx.views || ctx.views.includes(v)) (model.meta ||= {}).view = v; else err(ln, msg.view(m[2]));
        return;
      }
      if ((m = line.match(/^(review|revisi[oó]n)\s+([^\s:]+)\s*:\s*(.*)$/i))) {
        if (!ID.test(m[2])) return err(ln, msg.id(m[2]));
        const tk = tokens(m[3], Object.keys(REVIEW_KEYS)), r = { status: 'open' };
        const note = tk.quotes[0] ?? tk.words.join(' ');
        if (note) r.note = note;
        for (const [key, v] of Object.entries(tk.kv)) {
          const k = REVIEW_KEYS[key];
          if (k === 'by') r.by = v;
          else if (k === 'status') { if (/^(resolved|resuelta|closed|cerrada)$/i.test(v)) r.status = 'resolved'; else if (!/^(open|abierta)$/i.test(v)) err(ln, msg.status(v)); }
          else if (isDay(v)) r[k] = v; else err(ln, msg.day(v));
        }
        if (r.status !== 'resolved') delete r.closed;
        nodeFor(m[2]).review = r;
        return;
      }
      if (line === '}') { if (stack.length) stack.pop(); else err(ln, msg.brace); return; }
      if ((m = line.match(/^(grupo|group)\s+([^\s:{]+)\s*:?\s*(.*?)\s*\{\s*$/i))) {
        const id = m[2];
        if (!ID.test(id)) return err(ln, msg.groupId(id));
        if (groups.has(id)) return err(ln, msg.groupDup(id));
        const tk = tokens(m[3], ['color', 'icon', 'icono', 'kind', 'tipo', ...Object.keys(GOV_KEYS), ...REGION_KEYS, 'layer', 'capa']);
        const g = { id, label: tk.quotes[0] ?? (tk.words.join(' ') || id) };
        if (tk.kv.color) g.color = tk.kv.color;
        applyGov(g, tk.kv);
        const gi = (tk.kv.icon ?? tk.kv.icono)?.trim().toLowerCase();
        if (gi) { if (ctx.icons[gi] && gi.includes('/')) g.icon = gi; else err(ln, msg.icon(gi)); } // icono de grupo: proveedor/clave
        const gk = tk.kv.kind ?? tk.kv.tipo;
        if (gk != null) { // lógico / físico (también en inglés o español, con o sin tilde)
          const f = gk.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          if (/^(physical|fisic[oa]?)$/.test(f)) g.kind = 'physical'; else if (/^(logical|logic[oa]?)$/.test(f)) g.kind = 'logical'; else err(ln, msg.gkind(gk));
        }
        const gr = REGION_KEYS.map(k => tk.kv[k]).find(v => v != null && v.trim());
        if (gr) g.region = gr.trim();
        const gl = tk.kv.layer ?? tk.kv.capa;
        if (gl != null) { const l = checkLayer(gl, ln); if (l) g.layer = l; }
        if (stack.length) g.parent = stack[stack.length - 1];
        groups.add(id);
        model.groups.push(g);
        stack.push(id);
        return;
      }

      const colon = line.indexOf(':');
      const left = colon < 0 ? line : line.slice(0, colon);
      const right = colon < 0 ? '' : line.slice(colon + 1).trim();

      if (HAS_ARROW.test(left)) {
        const parts = left.split(ARROW_SPLIT).map(s => s.trim());
        if (parts.length < 3 || parts.length % 2 === 0) return err(ln, msg.edge);
        for (let k = 0; k < parts.length; k += 2) if (!ID.test(parts[k])) return err(ln, msg.id(parts[k]));
        let label = right, km;
        const kv = {};
        while ((km = label.match(EDGE_OPT))) { kv[km[1].toLowerCase()] = km[2]; label = label.slice(0, km.index).trim(); }
        const dsV = kv.datasets ?? kv.tablas ?? kv.conjuntos, dsets = dsV == null ? [] : parseDatasets(dsV);
        const color = kv.color, data = checkData(kv.data ?? kv.datos, ln), encV = kv.encrypted ?? kv.cifrado;
        const enc = encV == null ? null : parseBool(encV);
        if (encV != null && enc == null) err(ln, msg.enc(encV));
        const routeV = kv.line ?? kv.linea ?? kv['línea'], route = routeV == null ? null : parseRoute(routeV);
        if (routeV != null && !route) err(ln, msg.route(routeV));
        const bothV = kv.both ?? kv.ambos, both = bothV == null ? null : parseBool(bothV);
        if (bothV != null && both == null) err(ln, msg.enc(bothV));
        const trV = kv.transfer ?? kv.transferencia, tr = trV == null ? null : /^(ok|yes|y|true|si|sí|1|on)$/i.test(trV);
        if (trV != null && !tr) err(ln, msg.transfer(trV));
        // Etiqueta entre comillas (JSON) o con \n escapado = varias líneas
        if (/^".*"$/.test(label)) label = unquote(label); else label = label.replace(/\\n/g, '\n');
        for (let k = 0; k + 2 < parts.length; k += 2) {
          nodeFor(parts[k]); nodeFor(parts[k + 2]);
          const e = { from: parts[k], to: parts[k + 2] };
          const style = ARROWS[parts[k + 1]];
          if (style !== 'sync') e.style = style;
          if (k + 3 === parts.length && label) e.label = label;
          if (color) e.color = color;
          if (data?.length) e.data = data;
          if (dsets.length) e.datasets = [...dsets];
          if (enc != null) e.encrypted = enc;
          if (route) e.route = route;
          if (both) e.both = true;
          if (tr) e.transferOk = true;
          model.edges.push(e);
        }
        return;
      }

      if (colon > 0 && ID.test(left.trim())) {
        const n = nodeFor(left.trim());
        const tk = tokens(right, [...NODE_KEYS, ...Object.keys(GOV_KEYS)]);
        if (tk.brackets.length) {
          const kind = resolveKind(tk.brackets[0], ctx, msg);
          if (kind.error) err(ln, kind.error);
          if (kind.type) n.type = kind.type;
          if (kind.icon) n.icon = kind.icon;
        }
        const label = tk.words.join(' ');
        n.label = label || (n.icon && ctx.icons[n.icon].label) || (n.type !== 'generic' && ctx.types[n.type]?.label) || n.id;
        const sub = tk.kv.sub ?? tk.quotes[0];
        if (sub) n.sub = sub;
        ['color', 'badge', 'desc'].forEach(k => { if (tk.kv[k] != null) n[k] = tk.kv[k]; });
        ['x', 'y'].forEach(k => { if (tk.kv[k] != null && Number.isFinite(+tk.kv[k])) n[k] = +tk.kv[k]; });
        const cv = tk.kv.costo ?? tk.kv.cost;
        if (cv != null) { const c = parseCost(cv); if (c) Object.assign(n, c); else err(ln, msg.cost(cv)); }
        const dv = tk.kv.data ?? tk.kv.datos;
        if (dv != null) { const d = checkData(dv, ln); if (d.length) n.data = d; }
        applyGov(n, tk.kv);
        const nr = REGION_KEYS.map(k => tk.kv[k]).find(v => v != null && v.trim());
        if (nr) n.region = nr.trim();
        const lv = tk.kv.layer ?? tk.kv.capa;
        if (lv != null) { const l = checkLayer(lv, ln); if (l) n.layer = l; }
        if (stack.length) n.group = stack[stack.length - 1];
        return;
      }

      err(ln, msg.line);
    });
    if (stack.length) err(String(src).split(/\r?\n/).length, msg.open(stack.length));
    return { model, errors };
  }

  function stringify(m, lang = 'en') {
    const w = WORDS[lang] || WORDS.en;
    const out = [`${w.title}: ${m.title}`];
    if (m.direction) out.push(`${w.direction}: ${m.direction}`);
    if (m.routing === 'elbow') out.push(`${w.lines}: ${w.elbow}`);
    if (m.layerNames === 'zones') out.push(`${w.layers}: ${w.zones}`);
    if (m.meta?.author) out.push(`${w.author}: ${m.meta.author}`);
    if (m.meta?.version) out.push(`${w.version}: ${m.meta.version}`);
    if (m.meta?.view) out.push(`${w.view}: ${m.meta.view}`);
    out.push('');
    const nodeLine = n => {
      const p = [`${n.id}: ${n.label}`];
      if (n.icon) p.push(`[${n.icon}]`); else if (n.type && n.type !== 'generic') p.push(`[${n.type}]`);
      if (n.sub) p.push(quote(n.sub));
      if (n.badge != null && n.badge !== '') p.push(`badge=${bare(n.badge)}`);
      if (n.color) p.push(`color=${bare(n.color)}`);
      if (n.cost != null && n.cost !== '' && Number.isFinite(+n.cost)) p.push(`${w.cost}=${costValue(n, w)}`);
      if (n.data?.length) p.push(`${w.data}=${n.data.join(',')}`);
      GOV_WORDS.forEach(k => { if (n[k]) p.push(`${w[k]}=${bare(n[k])}`); });
      if (n.region) p.push(`${w.region}=${bare(n.region)}`);
      if (n.layer) p.push(`${w.layer}=${w.layerOf[n.layer] || n.layer}`);
      if (n.desc) p.push(`desc=${quote(n.desc)}`);
      return p.join(' ');
    };
    const groupIds = new Set(m.groups.map(g => g.id));
    const writeGroup = (g, ind) => {
      out.push(`${ind}${w.group} ${g.id} ${quote(g.label)}${g.icon ? ` icon=${bare(g.icon)}` : ''}${g.color ? ` color=${bare(g.color)}` : ''}${g.kind ? ` ${w.kind}=${w[g.kind]}` : ''}${GOV_WORDS.filter(k => g[k]).map(k => ` ${w[k]}=${bare(g[k])}`).join('')}${g.region ? ` ${w.region}=${bare(g.region)}` : ''}${g.layer ? ` ${w.layer}=${w.layerOf[g.layer] || g.layer}` : ''} {`);
      m.nodes.filter(n => n.group === g.id).forEach(n => out.push(`${ind}  ${nodeLine(n)}`));
      m.groups.filter(c => c.parent === g.id).forEach(c => writeGroup(c, ind + '  '));
      out.push(`${ind}}`);
    };
    m.groups.filter(g => !g.parent || !groupIds.has(g.parent)).forEach(g => writeGroup(g, ''));
    m.nodes.filter(n => !n.group || !groupIds.has(n.group)).forEach(n => out.push(nodeLine(n)));
    if (m.edges.length) out.push('');
    m.edges.forEach(e => {
      const arrow = ARROW_OF[e.style] || '->';
      const tail = [e.label ? (EDGE_OPT.test(e.label) || /^".*"$/.test(e.label) || /[\n\\]/.test(e.label) ? quote(e.label) : e.label) : '', e.color ? `color=${bare(e.color)}` : '',
        e.data?.length ? `${w.data}=${e.data.join(',')}` : '', e.datasets?.length ? `${DS_KEY[lang] || DS_KEY.en}=${bare(e.datasets.join(','))}` : '', e.encrypted != null ? `${w.encrypted}=${e.encrypted ? w.yes : w.no}` : '',
        e.both ? `${w.both}=${w.yes}` : '', e.transferOk ? `${w.transfer}=${w.ok}` : '', e.route ? `${w.line}=${e.route === 'elbow' ? w.elbowOne : w.curvedOne}` : ''].filter(Boolean).join(' ');
      out.push(`${e.from} ${arrow} ${e.to}${tail ? ` : ${tail}` : ''}`);
    });
    const reviewed = m.nodes.filter(n => n.review);
    if (reviewed.length) out.push('');
    reviewed.forEach(n => {
      const r = n.review, p = [`${w.review} ${n.id}: ${quote(r.note || '')}`];
      if (r.by) p.push(`${w.by}=${bare(r.by)}`);
      if (r.raised) p.push(`${w.raised}=${r.raised}`);
      if (r.due) p.push(`${w.due}=${r.due}`);
      if (r.status === 'resolved') p.push(`${w.status}=${w.resolved}`, ...(r.closed ? [`${w.closed}=${r.closed}`] : []));
      out.push(p.join(' '));
    });
    return out.join('\n') + '\n';
  }

  window.DiagramonText = { parse, stringify };
})();
