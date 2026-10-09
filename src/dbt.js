/* ==========================================================================
   Diagramon · importar un manifest de dbt (target/manifest.json)
   --------------------------------------------------------------------------
   Convierte, sin salir del navegador, el manifest de dbt (esquemas v10 a v12) en
   - un catálogo de conjuntos de datos (columnas, reglas de calidad, dueños, SLA de frescura), o
   - un diagrama con el linaje: sistemas origen → tablas por capa → dbt → exposiciones.
   Todo es puro (sin DOM, sin red). Lee con cuidado: ningún campo es obligatorio.
   Los criterios (capas, dominio, formato, severidades…) viven en config.js › datasets.dbt.
   API: window.DiagramonDbt = { detect(texto|objeto, nombre), parse(texto), toCatalog(manifest, cfg), toDiagram(manifest, cfg), merge(existentes, nuevos) }
   cfg = { ...config.js › datasets.dbt, layers: [claves de capa], aliases: { alias: capa }, classes: [claves de clase], stakeholders: [{ id, name }] }
   ========================================================================== */
window.DiagramonDbt = (() => {
  'use strict';

  const C = window.DIAGRAMON_CONFIG || {};
  const I = window.DiagramonI18n;
  const T = (k, v) => (I ? I.T(k, v) : k);
  const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
  const str = v => (typeof v === 'string' ? v : v == null || typeof v === 'object' ? '' : String(v));
  const arr = v => (Array.isArray(v) ? v : []);
  const low = v => str(v).trim().toLowerCase();
  const yes = v => v === true || /^(true|yes|si|sí|1)$/i.test(str(v).trim());
  const dflt = () => ({
    layers: Object.keys(C.dataLayers || {}), aliases: C.layerAliases || {}, classes: Object.keys(C.dataClasses || {}), stakeholders: [],
    maxBytes: 20 * 1024 * 1024, maxNodes: 5000, maxDatasets: 500, maxColumns: 300, maxRules: 100, maxExposures: 40,
    sourceLayer: 'bronze', seedLayer: 'bronze', format: 'delta', contractVersion: '1.0.0', skipMaterialized: ['ephemeral'],
    layerRules: [], domainFrom: ['meta', 'group', 'folder'], severity: { error: 'high', warn: 'medium' }, publicAccess: ['public'],
    exposureTypes: { dashboard: 'user', application: 'web', ml: 'ai', notebook: 'ai', analysis: 'user' }, exposureDefault: 'external', systemType: 'db', dbtType: 'analytics', storeType: 'storage'
  });
  const conf = cfg => ({ ...dflt(), ...(C.datasets && C.datasets.dbt), ...(cfg || {}) });

  /* ---------- detección y lectura ---------- */
  const RE = /"dbt_schema_version"\s*:\s*"[^"]*\/manifest\//;
  const isManifest = o => isObj(o) && isObj(o.metadata) && str(o.metadata.dbt_schema_version).includes('/manifest/');
  // texto (se mira el comienzo: dbt escribe «metadata» primero) u objeto ya leído
  function detect(x) {
    if (typeof x === 'string') return RE.test(x.slice(0, 200000));
    return isManifest(x);
  }
  // → { manifest } | { error: 'bad' | 'big' | 'many' | 'empty' }
  function parse(text, cfg) {
    const c = conf(cfg);
    if (typeof text !== 'string') return { error: 'bad' };
    if (text.length > c.maxBytes) return { error: 'big' };
    let m;
    try { m = JSON.parse(text); } catch { return { error: 'bad' }; }
    if (!isManifest(m)) return { error: 'bad' };
    const n = Object.keys(isObj(m.nodes) ? m.nodes : {}).length + Object.keys(isObj(m.sources) ? m.sources : {}).length;
    if (n > c.maxNodes) return { error: 'many', n };
    return { manifest: m };
  }

  /* ---------- piezas pequeñas ---------- */
  const mergedMeta = n => ({ ...(isObj(n.config) && isObj(n.config.meta) ? n.config.meta : {}), ...(isObj(n.meta) ? n.meta : {}) });
  const tagsOf = n => [...arr(n.tags), ...arr(n.config && n.config.tags)].map(low);
  const slug = s => str(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'x';
  // 'ref("dim")' / "source('a','b')" / 'dim' → nombre de la tabla
  const refName = v => { const s = str(v).trim(), q = [...s.matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]); return q.length ? q[q.length - 1] : s; };
  // 2 → 2.0.0, 2.1 → 2.1.0, 1.0.0 igual; lo que no es numérico se deja como viene
  const semver = (v, d) => { const t = str(v).trim(); if (!t) return d; const m = t.match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/); return m ? `${m[1]}.${m[2] || 0}.${m[3] || 0}` : t; };
  const PERIOD = { minute: 'm', hour: 'h', day: 'd' };
  const dur = o => {
    if (!isObj(o)) return '';
    const n = Number(o.count), p = PERIOD[low(o.period)];
    return Number.isFinite(n) && n > 0 && p ? `${n}${p}` : '';
  };
  const freshnessOf = f => (isObj(f) ? dur(f.error_after) || dur(f.warn_after) : '');
  const layerKey = (v, c) => { const k = low(v); return (c.layers || []).includes(k) ? k : (c.layers || []).includes(c.aliases && c.aliases[k]) ? c.aliases[k] : ''; };
  // Carpetas del archivo bajo models/ (sin el nombre del archivo)
  function folderOf(n) {
    const p = str(n.original_file_path || n.path).replace(/\\/g, '/').split('/').filter(Boolean);
    p.pop();
    if (low(p[0]) === 'models' || low(p[0]) === 'seeds' || low(p[0]) === 'snapshots') p.shift();
    return p.map(low);
  }
  // Capa: meta.layer manda; después las reglas de config en orden (la primera que coincide)
  function layerFor(n, name, kind, meta, c) {
    const ml = layerKey(meta.layer, c);
    if (ml) return ml;
    if (low(meta.layer)) return '';   // meta.layer con un valor que no se entiende: se deja vacía
    if (kind === 'source') return layerKey(c.sourceLayer, c);
    const fo = folderOf(n), nm = low(name);
    for (const r of arr(c.layerRules)) {
      const hit = arr(r.folders).some(f => fo.includes(low(f))) || arr(r.prefixes).some(p => nm.startsWith(low(p)));
      if (hit) return layerKey(r.layer, c);
    }
    return kind === 'seed' ? layerKey(c.seedLayer, c) : '';
  }

  /* ---------- núcleo: manifest → elementos ---------- */
  function build(man, cfg) {
    const c = conf(cfg), warn = new Map(), w = (code, n = 1, extra) => { const r = warn.get(code) || { code, n: 0, ...extra }; r.n += n; warn.set(code, r); };
    const nodes = isObj(man && man.nodes) ? man.nodes : {}, sources = isObj(man && man.sources) ? man.sources : {}, groups = isObj(man && man.groups) ? man.groups : {};
    const skipMat = arr(c.skipMaterialized).map(low), skipF = arr(c.layerRules).flatMap(r => arr(r.folders)).map(low);   // carpetas que ya dan la capa (staging, marts…) no sirven de dominio
    const out = [], byUid = new Map(), taken = new Set();
    const tests = [];
    const parents = new Map();   // uid de dbt → uids de dbt de los que depende (todos, para saltar efímeros)
    // 1) objetos que se vuelven conjuntos de datos: modelos, semillas, instantáneas y luego fuentes
    const cand = [];
    Object.entries(nodes).forEach(([uid, n]) => {
      if (!isObj(n)) return;
      const rt = low(n.resource_type);
      if (rt === 'test') { tests.push([uid, n]); return; }
      if (!['model', 'seed', 'snapshot'].includes(rt)) return;
      if (rt === 'model' && skipMat.includes(low(n.config && n.config.materialized))) { cand.push({ uid, n, kind: rt, skip: true }); return; }
      if (n.version != null && n.latest_version != null && String(n.version) !== String(n.latest_version)) { w('versions'); cand.push({ uid, n, kind: rt, skip: true }); return; }
      cand.push({ uid, n, kind: rt });
    });
    Object.entries(sources).forEach(([uid, n]) => { if (isObj(n)) cand.push({ uid, n, kind: 'source' }); });
    cand.forEach(x => { parents.set(x.uid, arr(x.n.depends_on && x.n.depends_on.nodes).map(String)); });
    const unique = (base, alt) => {
      let nm = base;
      if (taken.has(low(nm))) nm = alt;
      for (let k = 2; taken.has(low(nm)); k++) nm = `${alt}_${k}`;
      taken.add(low(nm));
      return nm;
    };
    cand.filter(x => !x.skip).forEach(({ uid, n, kind }) => {
      const meta = mergedMeta(n), name = str(n.name).trim();
      if (!name) return;
      const src = kind === 'source' ? str(n.source_name).trim() : '';
      const pkg = str(n.package_name).trim();
      const ds = unique(name, kind === 'source' ? `${src || 'source'}__${name}` : `${pkg || kind}__${name}`);
      const fo = folderOf(n), gid = str(n.group || (n.config && n.config.group)), grp = isObj(groups[`group.${pkg}.${gid}`]) ? groups[`group.${pkg}.${gid}`] : Object.values(groups).find(g => isObj(g) && g.name === gid && gid);
      const it = { uid, kind, name: ds, system: src || (kind === 'seed' ? '\0seeds' : ''), layer: layerFor(n, name, kind, meta, c), desc: str(n.description).trim() };
      // dominio: meta.domain, el grupo o la carpeta de primer nivel (en el orden de config)
      for (const f of arr(c.domainFrom)) {
        const v = f === 'meta' ? str(meta.domain).trim() : f === 'group' ? gid : f === 'folder' ? (kind === 'source' ? '' : fo.find(x => !skipF.includes(x)) || '') : '';
        if (v) { it.domain = v; break; }
      }
      // dueño: meta.owner o el dueño del grupo; si coincide con un interesado, su id
      const mo = isObj(meta.owner) ? str(meta.owner.name || meta.owner.email) : str(meta.owner);
      const go = grp && isObj(grp.owner) ? str(grp.owner.name || grp.owner.email) : '';
      const ow = (mo || go).trim();
      if (ow) { const sh = arr(c.stakeholders).find(s => low(s.name) === low(ow)); it.owner = sh ? sh.id : ow; }
      const acc = low(n.access || (n.config && n.config.access));
      if (arr(c.publicAccess).map(low).includes(acc) || yes(meta.data_product)) it.product = true;
      if (n.config && isObj(n.config.contract) && n.config.contract.enforced === true) it.contract = { version: semver(n.latest_version, c.contractVersion), status: 'agreed' };
      const fm = low(meta.format);
      it.format = fm || c.format; if (!fm) it.fmtDefault = true;
      if (kind === 'source') { const f = freshnessOf(n.freshness); if (f) it.freshness = f; }
      // clases: meta.classification y etiquetas que coinciden con una clase de config
      const cls = new Set();
      [...(Array.isArray(meta.classification) ? meta.classification : str(meta.classification).split(/[,;]/)), ...tagsOf(n)].map(low).forEach(k => { if (arr(c.classes).includes(k)) cls.add(k); });
      it.classes = cls;
      // columnas
      const cols = Object.values(isObj(n.columns) ? n.columns : {}).filter(isObj);
      it.cols = cols.map(col => {
        const cm = mergedMeta(col), cons = arr(col.constraints).map(x => low(isObj(x) ? x.type : x));
        const o = { name: str(col.name).trim(), type: str(col.data_type).trim(), desc: str(col.description).trim(), pk: cons.includes('primary_key'), nn: cons.includes('not_null') || cons.includes('primary_key'), un: cons.includes('unique') };
        o.pii = yes(cm.pii) || tagsOf(col).includes('pii');
        return o;
      }).filter(o => o.name);
      it.quality = [];
      it.deps = [];
      out.push(it); byUid.set(uid, it);
    });
    // 2) dependencias entre conjuntos, saltando los modelos efímeros y las versiones antiguas
    const skipped = new Set(cand.filter(x => x.skip).map(x => x.uid));
    const resolve = (uid, seen = new Set()) => {
      if (byUid.has(uid)) return [uid];
      if (!skipped.has(uid) || seen.has(uid)) return [];
      seen.add(uid);
      return (parents.get(uid) || []).flatMap(p => resolve(p, seen));
    };
    out.forEach(it => { it.deps = [...new Set((parents.get(it.uid) || []).flatMap(p => resolve(p)))].filter(u => u !== it.uid); });
    // 3) pruebas → reglas de calidad (y llaves / no nulos de columnas)
    tests.forEach(([, t]) => {
      const tm = isObj(t.test_metadata) ? t.test_metadata : null, kw = tm && isObj(tm.kwargs) ? tm.kwargs : {};
      const dn = arr(t.depends_on && t.depends_on.nodes).map(String);
      const target = str(t.attached_node) || dn.find(u => byUid.has(u)) || dn.map(u => resolve(u)[0]).find(Boolean) || '';
      const it = byUid.get(target) || byUid.get(resolve(target)[0] || '');
      if (!it) return;
      const name = low(tm ? tm.name : t.name) || 'test', column = str(t.column_name || kw.column_name).trim();
      const sv = low(t.config && t.config.severity) === 'warn' ? 'warn' : 'error';
      const q = { rule: ['not_null', 'unique', 'accepted_values'].includes(name) ? name : 'custom', severity: c.severity[sv] };
      if (column) q.column = column;
      if (name === 'accepted_values') q.param = arr(kw.values).map(v => str(v)).join(',');
      else if (name === 'relationships') q.param = `→ ${refName(kw.to)}.${str(kw.field)}`;
      else if (q.rule === 'custom') q.param = str(tm ? (tm.namespace ? `${tm.namespace}.${tm.name}` : tm.name) : t.name);
      it.quality.push(q);
      const col = column && it.cols.find(x => x.name === column);
      if (col) { if (name === 'not_null') col.nn = true; if (name === 'unique') col.un = true; }
    });
    // 4) exposiciones
    const exps = Object.entries(isObj(man && man.exposures) ? man.exposures : {}).filter(([, e]) => isObj(e)).map(([uid, e]) => ({
      uid, name: str(e.label).trim() || str(e.name).trim() || uid, type: low(e.type), owner: isObj(e.owner) ? str(e.owner.name || e.owner.email).trim() : '',
      deps: [...new Set(arr(e.depends_on && e.depends_on.nodes).flatMap(u => resolve(String(u))))]
    }));
    // 5) recorte a los límites del modelo de datos
    let items = out;
    if (items.length > c.maxDatasets) { w('cap.datasets', items.length - c.maxDatasets); items = items.slice(0, c.maxDatasets); }
    const kept = new Set(items.map(x => x.uid));
    items.forEach(it => { it.deps = it.deps.filter(u => kept.has(u)); });
    // 6) conjuntos finales (forma de m.datasets, sin id; cleanCatalog asigna los ids)
    const datasets = items.map(it => {
      const d = { name: it.name };
      if (it.domain) d.domain = it.domain;
      if (it.layer) d.layer = it.layer;
      if (it.desc) d.description = it.desc;
      if (it.owner) d.owner = it.owner;
      if (it.product) d.product = true;
      const cl = new Set(it.classes); if (it.cols.some(x => x.pii)) cl.add('pii');
      const ck = arr(c.classes).filter(k => cl.has(k)); if (ck.length) d.classes = ck;
      d.format = it.format; if (it.fmtDefault) d.fmtDefault = true;
      if (it.freshness) d.freshness = it.freshness;
      if (it.cols.length) {
        if (it.cols.length > c.maxColumns) w('cap.columns', it.cols.length - c.maxColumns);
        d.schema = it.cols.slice(0, c.maxColumns).map(x => {
          const o = { name: x.name };
          if (x.type) o.type = x.type;
          if (x.pk || (x.un && x.nn)) o.key = true;
          if (x.pii) o.pii = true;
          if (x.nn) o.nullable = false;
          if (x.desc) o.desc = x.desc;
          return o;
        });
      }
      if (it.quality.length) {
        if (it.quality.length > c.maxRules) w('cap.rules', it.quality.length - c.maxRules);
        d.quality = it.quality.slice(0, c.maxRules);
      }
      if (it.contract) d.contract = { ...it.contract };
      return d;
    });
    const noLayer = items.filter(x => !x.layer).length;
    if (noLayer) w('layer', noLayer);
    const byLayer = {}; items.forEach(x => { byLayer[x.layer || ''] = (byLayer[x.layer || ''] || 0) + 1; });
    const stats = { datasets: datasets.length, columns: datasets.reduce((s, d) => s + (d.schema ? d.schema.length : 0), 0), rules: datasets.reduce((s, d) => s + (d.quality ? d.quality.length : 0), 0), exposures: exps.length, byLayer };
    return { project: str(man && man.metadata && man.metadata.project_name || man && man.metadata && man.metadata.project_id), items, datasets, exposures: exps, warnings: [...warn.values()], stats, cfg: c };
  }

  const strip = d => { const { fmtDefault, ...r } = d; return r; };
  function toCatalog(man, cfg) {
    const b = build(man, cfg);
    return { project: b.project, datasets: b.datasets, warnings: b.warnings, stats: b.stats };
  }

  /* ---------- fusión con el catálogo existente ---------- */
  // existentes = m.datasets del diagrama (ya limpios); nuevos = toCatalog().datasets. Devuelve la lista completa (sin limpiar).
  // Lo que viene de dbt reemplaza (cuando dbt lo trae); lo que dbt no conoce se queda. El formato por defecto no pisa el que ya había.
  function merge(existing, incoming) {
    const key = s => str(s).trim().toLowerCase(), list = arr(existing).map(d => ({ ...d })), at = new Map(list.map((d, i) => [key(d.name), i]));
    arr(incoming).forEach(inc => {
      const i = at.get(key(inc.name)), n = strip(inc);
      if (i == null) { at.set(key(inc.name), list.length); list.push(n); return; }
      const ex = list[i], o = { ...ex };
      ['domain', 'layer', 'description', 'owner', 'freshness', 'schema', 'quality'].forEach(k => { if (n[k] != null && n[k] !== '') o[k] = n[k]; });
      if (n.product) o.product = true;
      if (n.classes && n.classes.length) o.classes = [...new Set([...arr(ex.classes), ...n.classes])];
      if (n.format && !inc.fmtDefault) o.format = n.format;
      if (n.contract) o.contract = { ...(ex.contract || {}), version: n.contract.version, status: n.contract.status };
      list[i] = o;
    });
    return list;
  }

  /* ---------- diagrama con el linaje ---------- */
  function toDiagram(man, cfg) {
    const b = build(man, cfg), c = b.cfg, items = b.items.filter(x => x.layer), byUid = new Map(items.map(x => [x.uid, x]));
    const layers = (c.layers || []).filter(k => items.some(x => x.layer === k));
    const children = new Map(items.map(x => [x.uid, []]));
    items.forEach(x => x.deps.forEach(p => { if (byUid.has(p)) children.get(p).push(x.uid); }));
    const walk = (uid, next) => { const seen = new Set(), q = [uid]; while (q.length) { const u = q.pop(); next(u).forEach(v => { if (!seen.has(v) && v !== uid) { seen.add(v); q.push(v); } }); } return seen; };
    const parentsOf = u => byUid.get(u).deps.filter(p => byUid.has(p));
    const warnings = b.warnings.slice();
    let exps = b.exposures;
    if (exps.length > c.maxExposures) { warnings.push({ code: 'cap.exposures', n: exps.length - c.maxExposures }); exps = exps.slice(0, c.maxExposures); }
    const ids = new Set(), nid = base => { let k = base, i = 2; while (ids.has(k)) k = `${base}_${i++}`; ids.add(k); return k; };
    const groups = [], nodes = [], edges = [];
    const GC = { bronze: 'melocoton', silver: 'lavanda', gold: 'limon' };
    const gSrc = 'g_src', gProc = 'g_dbt', gExp = 'g_exp';
    const systems = [...new Set(items.filter(x => x.system).map(x => x.system))];
    if (systems.length) groups.push({ id: gSrc, label: T('dbt.grp.sources'), color: 'cielo', kind: 'logical' });
    layers.forEach(k => groups.push({ id: `g_${k}`, label: T(`dbt.grp.${k}`), color: GC[k] || 'limon', kind: 'logical', layer: k }));
    groups.push({ id: gProc, label: T('dbt.grp.process'), color: 'menta', kind: 'logical' });
    if (exps.length) groups.push({ id: gExp, label: T('dbt.grp.exposures'), color: 'coral', kind: 'logical' });
    const sysId = new Map(systems.map(s => [s, nid(`src_${slug(s)}`)]));
    systems.forEach(s => nodes.push({ id: sysId.get(s), label: s === '\0seeds' ? T('dbt.seeds') : s, type: s === '\0seeds' ? c.storeType : c.systemType, group: gSrc, sub: T('dbt.sub.source') }));
    const storeId = new Map(layers.map(k => [k, nid(`st_${k}`)]));
    layers.forEach(k => nodes.push({ id: storeId.get(k), label: T(`dbt.store.${k}`), type: c.storeType, group: `g_${k}`, sub: T('dbt.sub.tables') }));
    // Un componente dbt por cambio de capa que de verdad ocurre (bronce → plata, plata → oro, y bronce → oro solo si un modelo de oro lee bronce): el grafo no tiene ciclos
    const rk = k => layers.indexOf(k), trs = [];
    items.forEach(q => q.deps.forEach(p => { const P = byUid.get(p); if (P && rk(P.layer) < rk(q.layer) && !trs.some(t => t[0] === P.layer && t[1] === q.layer)) trs.push([P.layer, q.layer]); }));
    trs.sort((x, y) => rk(x[0]) - rk(y[0]) || rk(x[1]) - rk(y[1]));
    const trId = new Map(trs.map(([x, y]) => [`${x}>${y}`, nid(`dbt_${x}_${y}`)]));
    trs.forEach(([x, y]) => nodes.push({ id: trId.get(`${x}>${y}`), label: `dbt · ${T(`dbt.lay.${x}`)} → ${T(`dbt.lay.${y}`)}`, type: c.dbtType, group: gProc, sub: b.project || '' }));
    const expId = new Map();
    exps.forEach(e => { const id = nid(`ex_${slug(e.name)}`); expId.set(e.uid, id); nodes.push({ id, label: e.name, type: c.exposureTypes[e.type] || c.exposureDefault, group: gExp, sub: e.owner || e.type }); });
    // Cada conjunto lleva por las conexiones todo su camino: sus orígenes, sus pasos por dbt y sus consumidores (anc ∪ él ∪ desc)
    const eMap = new Map();
    const put = (from, to, name, label) => { const k = `${from}>${to}`; if (!eMap.has(k)) eMap.set(k, { from, to, label, set: new Set() }); eMap.get(k).set.add(name); };
    items.forEach(d => {
      const anc = walk(d.uid, u => parentsOf(u)), desc = walk(d.uid, u => children.get(u)), up = new Set([d.uid, ...anc]), down = new Set([d.uid, ...desc]);
      [...up].map(u => byUid.get(u)).filter(x => x.system).forEach(s => put(sysId.get(s.system), storeId.get(s.layer), d.name, ''));
      [...up, ...down].forEach(u => parentsOf(u).forEach(p => {
        const P = byUid.get(p), Q = byUid.get(u);
        if (rk(P.layer) >= rk(Q.layer) || !(up.has(u) || down.has(p))) return;
        const tr = trId.get(`${P.layer}>${Q.layer}`);
        put(storeId.get(P.layer), tr, d.name, T('dbt.edge.reads'));
        put(tr, storeId.get(Q.layer), d.name, T('dbt.edge.builds'));
      }));
      exps.forEach(e => { if (e.deps.some(u => down.has(u) && byUid.has(u))) e.deps.filter(u => down.has(u) && byUid.has(u)).forEach(u => put(storeId.get(byUid.get(u).layer), expId.get(e.uid), d.name, '')); });
    });
    let n = 0;
    eMap.forEach(e => edges.push({ id: `e${++n}`, from: e.from, to: e.to, ...(e.label ? { label: e.label } : {}), style: 'data', datasets: [...e.set] }));
    // Consumidores de contrato = componentes de las exposiciones que dependen del conjunto
    const datasets = b.datasets.map((x, i) => {
      const d = strip(x);
      if (d.contract) { const cs = exps.filter(e => e.deps.includes(b.items[i].uid)).map(e => expId.get(e.uid)); if (cs.length) d.contract = { ...d.contract, consumers: cs }; }
      return d;
    });
    const diagram = { title: b.project || T('dbt.untitled'), groups, nodes, edges, datasets };   // los sin capa se quedan en el catálogo aunque no se dibujen

    return { project: b.project, diagram, datasets: diagram.datasets, warnings, stats: { ...b.stats, nodes: nodes.length, edges: edges.length } };
  }

  return { detect, parse, toCatalog, toDiagram, merge };
})();
