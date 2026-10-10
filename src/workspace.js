/* ==========================================================================
   Diagramon · espacio de trabajo (una carpeta con varios diagramas)
   --------------------------------------------------------------------------
   Parte pura, sin DOM ni red: reconoce qué archivos de una carpeta son
   diagramas de Diagramon y resume cada uno (título, tamaño, versión de
   formato, docId) para listarlos sin abrirlos. La lectura de la carpeta
   (File System Access o <input webkitdirectory>) vive en app.js.
   - Diagrama: JSON con `nodes` (lista) y, si las trae, `edges` y `groups` listas.
   - Manifiesto opcional `diagramon-workspace.json`: { "name", "shared" }. `shared`
     guarda listas de interesados, decisiones (ADR) y conjuntos de datos que se
     comparten entre los diagramas: se añaden a un diagrama (sin duplicar) y se
     publican desde uno; cada diagrama sigue siendo autónomo.
   - `docId`: identificador estable del diagrama, para enlazar entre diagramas
     aunque se renombre el archivo (campo opcional, no sube formatVersion).
   - Enlaces entre diagramas: un componente puede llevar `ref: { doc, node? }`
     (docId del diagrama donde se detalla). El mapa de sistemas los junta.
   API: window.DiagramonWorkspace.{ MANIFEST, MAX_BYTES, MAX_FILES, isDiagram,
        cleanDocId, cleanRef, newDocId, summarize, scan, fileNameFor,
        systemsMap, layoutMap, SHARED_KINDS, cleanShared, mergeShared, shareOut }
   ========================================================================== */
window.DiagramonWorkspace = (() => {
  'use strict';

  const MANIFEST = 'diagramon-workspace.json';
  const MAX_BYTES = 8 * 1024 * 1024;   // un archivo más grande no se lee
  const MAX_FILES = 200;               // diagramas que se listan por carpeta
  const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
  const list = v => (Array.isArray(v) ? v : []);

  const isDiagram = raw => isObj(raw) && Array.isArray(raw.nodes) && (raw.edges == null || Array.isArray(raw.edges)) && (raw.groups == null || Array.isArray(raw.groups));
  // docId: letras, cifras y guiones; de 6 a 40 caracteres. Cualquier otra cosa se descarta
  const cleanDocId = v => (typeof v === 'string' && /^[0-9a-zA-Z-]{6,40}$/.test(v.trim()) ? v.trim() : '');
  function newDocId() {
    const c = typeof crypto !== 'undefined' ? crypto : null;
    const bytes = new Uint8Array(8);
    if (c && c.getRandomValues) c.getRandomValues(bytes); else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    return 'd-' + [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ref de un componente: { doc, node? } con un docId válido; si no, null
  function cleanRef(v) {
    if (!isObj(v)) return null;
    const doc = cleanDocId(v.doc);
    if (!doc) return null;
    const node = typeof v.node === 'string' ? v.node.trim().slice(0, 60) : '';
    return node ? { doc, node } : { doc };
  }
  const MAX_LINKS = 200;
  // Componentes de un diagrama (en bruto o ya normalizado) que apuntan a otro: [{ id, label, doc, node? }]
  function linksOf(nodes) {
    const out = [];
    list(nodes).forEach(n => {
      const r = isObj(n) ? cleanRef(n.ref) : null;
      if (r && out.length < MAX_LINKS) out.push({ id: String(n.id == null ? '' : n.id).slice(0, 60), label: str(n.label, 120), doc: r.doc, ...(r.node ? { node: r.node } : {}) });
    });
    return out;
  }

  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  function summarize(raw, name = '') {
    const fv = Math.floor(+raw.formatVersion);
    return {
      name, title: str(raw.title, 200) || name.replace(/\.json$/i, ''),
      nodes: raw.nodes.length, links: linksOf(raw.nodes), edges: list(raw.edges).length, groups: list(raw.groups).length, phases: list(raw.phases).length, versions: list(raw.versions).length,
      formatVersion: Number.isFinite(fv) && fv > 0 ? fv : 0, docId: cleanDocId(raw.docId)
    };
  }

  /* ---------- listas compartidas (manifiesto › shared) ---------- */
  const SHARED_KINDS = ['stakeholders', 'decisions', 'datasets'];
  const SHARED_MAX = { stakeholders: 200, decisions: 200, datasets: 500 };
  const SHARED_ITEM = 20000;   // tamaño máximo de un elemento (JSON, en caracteres)
  const KEY_FIELD = { stakeholders: 'name', decisions: 'title', datasets: 'name' };
  const keyOf = (kind, item) => String(item && item[KEY_FIELD[kind]] != null ? item[KEY_FIELD[kind]] : '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  // Una copia del elemento sin lo que apunta al diagrama donde nació (ids, enlaces, firmas, fases, versiones) y nada más
  function portable(kind, item) {
    const o = JSON.parse(JSON.stringify(item));
    delete o.id;
    if (kind === 'decisions') {
      ['links', 'signoffs', 'supersededBy', 'history'].forEach(k => delete o[k]);
      if (Array.isArray(o.options)) o.options.forEach(x => { if (isObj(x)) delete x.version; });
    } else if (kind === 'datasets') delete o.phase;
    return o;
  }
  const okItem = (kind, x) => isObj(x) && keyOf(kind, x) && JSON.stringify(x).length <= SHARED_ITEM;
  // → { stakeholders?, decisions?, datasets? } con solo listas no vacías, sin repetidos (por nombre o título) y con tope
  function cleanShared(v) {
    const out = {};
    if (!isObj(v)) return out;
    SHARED_KINDS.forEach(kind => {
      const seen = new Set(), l = [];
      list(v[kind]).forEach(x => { if (l.length < SHARED_MAX[kind] && okItem(kind, x) && !seen.has(keyOf(kind, x))) { seen.add(keyOf(kind, x)); l.push(portable(kind, x)); } });
      if (l.length) out[kind] = l;
    });
    return out;
  }
  // Lo compartido que el diagrama aún no tiene: → { list: existentes + nuevos (sin id: el diagrama los numera), fresh: [nuevos], skipped: n ya presentes }
  function mergeShared(kind, existing, shared) {
    const have = new Set(list(existing).map(x => keyOf(kind, x))), fresh = [];
    list(shared && shared[kind]).forEach(x => { const k = keyOf(kind, x); if (okItem(kind, x) && !have.has(k)) { have.add(k); fresh.push(portable(kind, x)); } });
    return { list: [...list(existing), ...fresh], fresh, skipped: list(shared && shared[kind]).length - fresh.length };
  }
  // Publica los elementos de un diagrama en la lista compartida: el mismo nombre o título se reemplaza, el resto se añade → { list, added, updated }
  function shareOut(kind, shared, items) {
    const cur = list(shared && shared[kind]).filter(x => okItem(kind, x)), at = new Map(cur.map((x, i) => [keyOf(kind, x), i])), out = cur.slice();
    let added = 0, updated = 0;
    list(items).forEach(x => {
      if (!okItem(kind, x)) return;
      const k = keyOf(kind, x), p = portable(kind, x);
      if (at.has(k)) { if (JSON.stringify(out[at.get(k)]) !== JSON.stringify(p)) { out[at.get(k)] = p; updated++; } }
      else if (out.length < SHARED_MAX[kind]) { at.set(k, out.length); out.push(p); added++; }
    });
    return { list: out, added, updated };
  }

  // files: [{ name, text, size? }] (solo la carpeta, sin subcarpetas) → { manifest, diagrams, skipped }
  // diagrams: resúmenes, por título; skipped: [{ name, reason }] con reason 'notJson' | 'notDiagram' | 'big' | 'many'
  function scan(files) {
    const out = { manifest: null, diagrams: [], skipped: [] };
    list(files).forEach(f => {
      const name = str(f && f.name, 255), text = f && typeof f.text === 'string' ? f.text : '';
      if (!name) return;
      if (name === MANIFEST) {
        try { const m = JSON.parse(text); if (isObj(m)) out.manifest = { name: str(m.name, 120), shared: cleanShared(m.shared) }; } catch { /* manifiesto ilegible: se ignora */ }
        return;
      }
      if (!/\.json$/i.test(name)) return;
      if ((Number.isFinite(f.size) ? f.size : text.length) > MAX_BYTES) return void out.skipped.push({ name, reason: 'big' });
      let raw = null;
      try { raw = JSON.parse(text); } catch { return void out.skipped.push({ name, reason: 'notJson' }); }
      if (!isDiagram(raw)) return void out.skipped.push({ name, reason: 'notDiagram' });
      if (out.diagrams.length >= MAX_FILES) return void out.skipped.push({ name, reason: 'many' });
      out.diagrams.push(summarize(raw, name));
    });
    const seen = new Map();
    out.diagrams.forEach(d => { if (d.docId) seen.set(d.docId, (seen.get(d.docId) || 0) + 1); });
    out.diagrams.forEach(d => { d.dupDocId = !!d.docId && seen.get(d.docId) > 1; });
    out.diagrams.sort((a, b) => a.title.localeCompare(b.title) || a.name.localeCompare(b.name));
    return out;
  }

  // Nombre de archivo para guardar un diagrama: «título.json» sin acentos ni símbolos, distinto de los que ya hay (comparación sin mayúsculas)
  function fileNameFor(title, taken) {
    const used = new Set([...(taken || [])].map(n => String(n).toLowerCase()));
    const base = String(title == null ? '' : title).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'diagram';
    let n = `${base}.json`, i = 2;
    while (used.has(n.toLowerCase()) || n === MANIFEST) n = `${base}-${i++}.json`;
    return n;
  }

  // Mapa de sistemas: un nodo por diagrama con docId (sin repetirse) y una flecha de A a B por cada componente de A que apunta a B.
  // diagrams: lo que devuelve scan(); live: el diagrama abierto { docId, title, nodes, links } (manda sobre su archivo, que puede estar desactualizado)
  // → { nodes: [{ docId, name, title, nodes, unsaved }], edges: [{ from, to, via: [etiquetas] }], missing: [{ from, doc, via }], unlinkable }
  function systemsMap(diagrams, live) {
    const all = list(diagrams), docs = all.filter(d => d.docId && !d.dupDocId);
    const nodes = docs.map(d => ({ docId: d.docId, name: d.name, title: d.title, nodes: d.nodes, unsaved: false }));
    const lv = live && cleanDocId(live.docId) ? live : null;
    if (lv) {
      const at = nodes.findIndex(n => n.docId === lv.docId);
      const me = { docId: lv.docId, name: at >= 0 ? nodes[at].name : '', title: str(lv.title, 200) || (at >= 0 ? nodes[at].title : ''), nodes: Number.isFinite(lv.nodes) ? lv.nodes : at >= 0 ? nodes[at].nodes : 0, unsaved: at < 0 };
      if (at >= 0) nodes[at] = me; else nodes.push(me);
    }
    const ids = new Set(nodes.map(n => n.docId)), edges = new Map(), missing = new Map();
    const linksFor = docId => (lv && lv.docId === docId ? list(lv.links) : (docs.find(d => d.docId === docId) || {}).links) || [];
    nodes.forEach(n => linksFor(n.docId).forEach(l => {
      const label = l.label || l.id;
      if (l.doc === n.docId) return;
      const book = ids.has(l.doc) ? edges : missing, key = `${n.docId}\0${l.doc}`;
      if (!book.has(key)) book.set(key, { from: n.docId, [book === edges ? 'to' : 'doc']: l.doc, via: [] });
      const via = book.get(key).via;
      if (label && !via.includes(label)) via.push(label);
    }));
    return { nodes, edges: [...edges.values()], missing: [...missing.values()], unlinkable: all.length - docs.length };
  }

  // Posiciones para dibujar el mapa: columnas por profundidad (de quien enlaza a lo enlazado; los ciclos no la inflan) y, dentro de cada columna, por título.
  // → { boxes: [{ docId, x, y, w, h }], arrows: [{ from, to, via, same, x1, y1, x2, y2 }], width, height }
  function layoutMap(map, o = {}) {
    const w = o.w || 200, h = o.h || 56, gx = o.gx || 80, gy = o.gy || 24, pad = o.pad || 16;
    const ns = list(map && map.nodes), es = list(map && map.edges), rank = new Map(ns.map(n => [n.docId, 0]));
    for (let pass = 0; pass < ns.length; pass++) {
      let moved = false;
      es.forEach(e => { if (rank.has(e.from) && rank.has(e.to) && rank.get(e.to) < Math.min(rank.get(e.from) + 1, ns.length - 1)) { rank.set(e.to, Math.min(rank.get(e.from) + 1, ns.length - 1)); moved = true; } });
      if (!moved) break;
    }
    const cols = new Map();
    ns.slice().sort((a, b) => String(a.title).localeCompare(String(b.title)) || String(a.docId).localeCompare(String(b.docId))).forEach(n => {
      const r = rank.get(n.docId); if (!cols.has(r)) cols.set(r, []); cols.get(r).push(n);
    });
    const boxes = [], at = new Map();
    [...cols.keys()].sort((a, b) => a - b).forEach((r, ci) => cols.get(r).forEach((n, i) => {
      const b = { docId: n.docId, x: pad + ci * (w + gx), y: pad + i * (h + gy), w, h }; boxes.push(b); at.set(n.docId, b);
    }));
    const arrows = es.filter(e => at.has(e.from) && at.has(e.to)).map(e => {
      const a = at.get(e.from), b = at.get(e.to), fwd = b.x > a.x, back = b.x < a.x, same = !fwd && !back;   // misma columna: de borde derecho a borde derecho (el dibujo la curva hacia fuera)
      return { from: e.from, to: e.to, via: e.via, same, x1: fwd ? a.x + a.w : back ? a.x : a.x + a.w, y1: a.y + a.h / 2, x2: fwd ? b.x : back ? b.x + b.w : b.x + b.w, y2: b.y + b.h / 2 };
    });
    return { boxes, arrows, width: boxes.reduce((m, b) => Math.max(m, b.x + b.w), 0) + pad + (arrows.some(x => x.same) ? 50 : 0), height: boxes.reduce((m, b) => Math.max(m, b.y + b.h), 0) + pad };
  }

  return { MANIFEST, MAX_BYTES, MAX_FILES, isDiagram, cleanDocId, cleanRef, newDocId, summarize, scan, fileNameFor, systemsMap, layoutMap, SHARED_KINDS, cleanShared, mergeShared, shareOut };
})();
