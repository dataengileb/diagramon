/* ==========================================================================
   Diagramon · motor del editor
   Normalmente no necesitas tocar este archivo: personaliza en config.js.
   API pública para extensiones: window.Diagramon (ver final del archivo).
   ========================================================================== */
(() => {
  'use strict';

  const C = window.DIAGRAMON_CONFIG;
  const I = window.DiagramonI18n, T = I.T, loc = I.loc;
  const EXAMPLES = window.DIAGRAMON_EXAMPLES || [];
  const NS = 'http://www.w3.org/2000/svg';
  const H = C.node.height;

  /* ---------- utilidades ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const snap = v => Math.round(v / C.grid.snap) * C.grid.snap;
  const clone = o => JSON.parse(JSON.stringify(o));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const store = {
    get(k, d) { try { const v = localStorage.getItem(`${C.app.storageKey}.${k}`); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(`${C.app.storageKey}.${k}`, JSON.stringify(v)); } catch { /* sin almacenamiento disponible */ } }
  };
  // Recupera lo guardado con el nombre anterior del proyecto (Nimbo)
  try {
    for (const k of ['model', 'theme', 'palette', 'anim', 'reach', 'provider', 'side', 'collapsed', 'tab']) {
      const old = localStorage.getItem(`nimbo.${k}`);
      if (old != null && localStorage.getItem(`${C.app.storageKey}.${k}`) == null) localStorage.setItem(`${C.app.storageKey}.${k}`, old);
    }
  } catch { /* sin almacenamiento disponible */ }

  /* ---------- estado ---------- */
  const S = {
    model: null,
    theme: C.themes[store.get('theme')] ? store.get('theme') : C.app.defaultTheme,
    palette: C.palettes[store.get('palette')] ? store.get('palette') : C.app.defaultPalette,
    anim: store.get('anim', C.animation.enabled) && !reducedMotion,
    reach: store.get('reach', C.focus.defaultMode),
    view: { x: 0, y: 0, k: 1 },
    sel: null, hover: null, connecting: null, drag: null, play: null, lastDown: null,
    history: [], future: [], lastType: 'compute', lastExtra: {},
    provider: store.get('provider', 'generic'),
    compare: null, verNote: ''
  };
  // Referencias a elementos SVG y medidas calculadas (nunca se guardan en el modelo)
  const R = { nodes: new Map(), edges: new Map(), groups: new Map(), width: new Map(), gbox: new Map() };

  const svg = $('#canvas'), viewport = $('#viewport'), stage = $('#stage');
  const L = { groups: $('#l-groups'), edges: $('#l-edges'), ghosts: $('#l-ghosts'), nodes: $('#l-nodes'), guides: $('#l-guides') };

  const ICON = {
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    link: '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    swap: '<svg viewBox="0 0 24 24"><path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/></svg>'
  };

  /* ---------- colores ---------- */
  const paletteKeys = () => Object.keys((C.palettes[S.palette] || Object.values(C.palettes)[0]).dark);
  // También acepta los nombres en inglés de los colores (peach, sky…)
  const COLOR_ALIAS = Object.fromEntries(Object.entries(I.COLOR_NAMES.en).map(([k, v]) => [v, k]));
  const colorVar = k => !k ? null : paletteKeys().includes(k) ? `var(--p-${k})` : COLOR_ALIAS[k] ? `var(--p-${COLOR_ALIAS[k]})` : k;
  const typeOf = n => C.types[n.type] || C.types.generic;
  const typeLabel = type => loc((C.types[type] || C.types.generic).label);
  const nodeColor = n => colorVar(n && n.color) || colorVar(typeOf(n || {}).color) || 'var(--accent)';
  const categories = () => [...new Set([...C.categories, ...Object.values(C.types).map(t => t.category || 'Otros')])];
  const typeIcon = type => `<svg viewBox="0 0 24 24">${(C.types[type] || C.types.generic).icon}</svg>`;

  /* ---------- iconos oficiales (icons/*.js, generados por tools/build-icons.py) ---------- */
  const ICONS = (C.icons?.enabled !== false && window.DIAGRAMON_ICONS) || {};
  const iconInfo = ref => {
    if (typeof ref !== 'string') return null;
    const [p, k] = ref.split('/'), set = ICONS[p], it = set?.items?.[k];
    return it ? { ...it, provider: p, providerLabel: set.label, src: set.files[it.file] } : null;
  };
  const nodeIconHtml = n => { const i = iconInfo(n.icon); return i ? `<img src="${i.src}" alt="">` : typeIcon(n.type); };

  /* ---------- costos (se escriben a mano en el inspector) ---------- */
  const COST = { currency: 'USD', locale: 'en-US', hoursPerMonth: 730, defaultYears: 3, ...C.cost };
  // Periodo → clave del nombre y del sufijo corto en i18n.js
  const PERIODS = {
    hour:  { label: 'cost.hour', short: 'cost.h' },
    month: { label: 'cost.month', short: 'cost.mo' },
    year:  { label: 'cost.year', short: 'cost.yr' },
    multi: { label: 'cost.multi', short: '' }
  };
  const hasCost = n => n.cost != null && n.cost !== '' && Number.isFinite(+n.cost);
  const periodOf = n => (PERIODS[n.costPeriod] ? n.costPeriod : 'month');
  const yearsOf = n => Math.max(1, Math.round(+n.costYears) || COST.defaultYears);
  const money = v => {
    v = +v;
    const d = Number.isInteger(v) ? 0 : Math.abs(v) < 1 ? 4 : 2;
    try { return new Intl.NumberFormat(COST.locale, { style: 'currency', currency: COST.currency, minimumFractionDigits: Math.min(d, 2), maximumFractionDigits: d }).format(v); }
    catch { return `$${v.toFixed(d)}`; }
  };
  const costText = n => {
    const p = periodOf(n), y = yearsOf(n);
    return money(n.cost) + (p === 'multi' ? `/${T('cost.years', y)}` : T(PERIODS[p].short));
  };
  const perMonth = n => {
    const c = +n.cost;
    return { hour: c * COST.hoursPerMonth, month: c, year: c / 12, multi: c / (yearsOf(n) * 12) }[periodOf(n)];
  };
  const monthlyTotal = ns => ns.filter(hasCost).reduce((s, n) => s + perMonth(n), 0);
  const round2 = v => Math.round(v * 100) / 100;
  /* ---------- clasificación de datos y cifrado en tránsito ---------- */
  const DATA = C.dataClasses || {};
  const dataTags = x => (x?.data || []).map(k => ({ k, short: loc(DATA[k]?.short) || k.toUpperCase(), label: loc(DATA[k]?.label) || k, color: colorVar(DATA[k]?.color) || 'var(--muted)' }));
  const isSensitive = x => (x?.data || []).some(k => DATA[k]?.sensitive);
  // Conexión marcada "sin cifrar" que lleva datos sensibles o une un nodo con datos sensibles
  const isInsecure = (e, byId) => e.encrypted === false && (isSensitive(e) || isSensitive(byId(e.from)) || isSensitive(byId(e.to)));
  const cleanData = v => {
    const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
    const set = new Set(list.map(k => String(k).trim().toLowerCase()).filter(Boolean));
    return [...Object.keys(DATA).filter(k => set.has(k)), ...[...set].filter(k => !DATA[k])];
  };

  /* ---------- observaciones de revisión (se levantan a mano en el inspector) ---------- */
  // review: { status: 'open' | 'resolved', note, by, raised, due, closed } con fechas AAAA-MM-DD
  // Fecha AAAA-MM-DD que existe en el calendario (2026-02-30 no vale)
  const isDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T12:00`).toISOString().slice(0, 10) === v;
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const dayDiff = (a, b) => Math.round((new Date(`${b}T12:00`) - new Date(`${a}T12:00`)) / 864e5);
  const fmtDay = v => (isDay(v) ? new Intl.DateTimeFormat(I.lang, { dateStyle: 'medium' }).format(new Date(`${v}T12:00`)) : '');
  const reviewState = r => (r.status === 'resolved' ? 'resolved' : r.due && r.due < today() ? 'overdue' : 'open');
  const REV_COLOR = { open: 'var(--p-melocoton)', overdue: 'var(--p-coral)', resolved: 'var(--p-menta)' };
  const reviewTag = r => { const st = reviewState(r); return { short: T(`rev.tag.${st}`), label: r.note || T(`rev.tag.${st}`), color: REV_COLOR[st] }; };
  const reviewHint = r => {
    const st = reviewState(r);
    if (st === 'resolved') return r.closed ? T('rev.hint.resolved', { date: fmtDay(r.closed) }) : '';
    if (!r.due) return T('rev.hint.noDue');
    const n = dayDiff(today(), r.due);
    return st === 'overdue' ? T('rev.hint.overdue', -n) : T('rev.hint.dueIn', n);
  };
  const cleanReview = v => {
    if (!v || typeof v !== 'object') return null;
    const r = { status: v.status === 'resolved' ? 'resolved' : 'open' };
    ['note', 'by'].forEach(k => { if (v[k] != null && String(v[k]).trim()) r[k] = String(v[k]); });
    ['raised', 'due', 'closed'].forEach(k => { if (isDay(v[k])) r[k] = v[k]; });
    if (r.status !== 'resolved') delete r.closed;
    return r;
  };

  // Alto ocupado por un nodo, contando el recuadro de costo de abajo
  const nodeBoxH = n => H + (hasCost(n) ? 26 : 0);

  function applyTheme() {
    const root = document.documentElement;
    root.dataset.theme = S.theme;
    const t = C.themes[S.theme];
    for (const k in t) root.style.setProperty(`--${k}`, t[k]);
    const p = C.palettes[S.palette] || Object.values(C.palettes)[0];
    for (const [k, v] of Object.entries(p[S.theme] || p.dark)) root.style.setProperty(`--p-${k}`, v);
    root.style.setProperty('--accent', `var(--p-${p.accent || 'lavanda'})`);
    root.style.setProperty('--font', C.fonts.ui);
    root.style.setProperty('--mono', C.fonts.mono);
  }

  /* ---------- medidas de texto ---------- */
  const mctx = document.createElement('canvas').getContext('2d');
  const FONT = { dtag: '800 9.5px', label: '600 13.5px', sub: '400 11.5px', tag: '700 11px', edge: '500 11px', badge: '800 10.5px', cost: '700 10.5px' };
  const textW = (t, f) => { mctx.font = `${f} ${C.fonts.ui}`; return mctx.measureText(String(t ?? '')).width; };
  const fitText = (t, f, max) => {
    t = String(t ?? '');
    if (textW(t, f) <= max) return t;
    while (t.length > 1 && textW(t + '…', f) > max) t = t.slice(0, -1);
    return t + '…';
  };
  // Con node.sameSize todos los nodos miden lo mismo; si no, crecen con el texto
  const nodeWidth = n => {
    if (C.node.sameSize !== false) return C.node.width;
    const inner = Math.max(textW(n.label, FONT.label), n.sub ? textW(n.sub, FONT.sub) : 0);
    return Math.round(clamp(64 + inner + 22, C.node.width, C.node.maxWidth));
  };
  // Parte un nombre largo en 2 líneas como máximo, cortando entre palabras:
  // elige el corte que mejor reparte el texto; si nada cabe, recorta con «…»
  const wrapText = (t, f, max) => {
    t = String(t ?? '');
    if (textW(t, f) <= max) return [t];
    const words = t.split(/\s+/);
    let best = null;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
      const wa = textW(a, f), wb = textW(b, f), over = Math.max(0, wa - max) + Math.max(0, wb - max);
      const score = [over, Math.max(wa, wb)];
      if (!best || score[0] < best.score[0] || (score[0] === best.score[0] && score[1] < best.score[1])) best = { a, b, score };
    }
    return best ? [fitText(best.a, f, max), fitText(best.b, f, max)] : [fitText(t, f, max)];
  };

  /* ---------- modelo ---------- */
  function normalize(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    const m = { title: String(raw.title || T('model.untitled')), groups: [], nodes: [], edges: [] };
    if (raw.direction === 'LR' || raw.direction === 'TB') m.direction = raw.direction;
    if (raw.routing === 'elbow') m.routing = 'elbow';
    if (raw.meta && typeof raw.meta === 'object') {
      const meta = {};
      ['author', 'version'].forEach(k => { if (raw.meta[k] != null && String(raw.meta[k]).trim()) meta[k] = String(raw.meta[k]).trim(); });
      if (Object.keys(meta).length) m.meta = meta;
    }
    const used = new Set();
    const take = (id, prefix, i) => {
      let v = id != null && id !== '' ? String(id) : `${prefix}${i + 1}`;
      while (used.has(v)) v += '_';
      used.add(v);
      return v;
    };
    const list = a => (Array.isArray(a) ? a : []).filter(x => x && typeof x === 'object');

    list(raw.groups).forEach((g, i) => m.groups.push({ ...g, id: take(g.id, 'g', i), label: String(g.label ?? g.id ?? T('model.group')) }));
    const gids = new Set(m.groups.map(g => g.id));
    m.groups.forEach(g => {
      if (g.parent == null || g.parent === '') return void delete g.parent;
      g.parent = String(g.parent);
      if (!gids.has(g.parent) || g.parent === g.id) delete g.parent;
    });
    m.groups.forEach(g => { // corta ciclos de grupos
      const seen = new Set([g.id]);
      let p = g.parent;
      while (p) {
        if (seen.has(p)) { delete g.parent; break; }
        seen.add(p);
        p = m.groups.find(x => x.id === p)?.parent;
      }
    });

    list(raw.nodes).forEach((n, i) => {
      const type = C.types[n.type] ? n.type : 'generic';
      const o = { ...n, id: take(n.id, 'n', i), type, label: String(n.label ?? typeLabel(type)) };
      if (o.group == null || o.group === '' || !gids.has(String(o.group))) delete o.group; else o.group = String(o.group);
      if (hasCost(o) && +o.cost >= 0) o.cost = +o.cost; else delete o.cost;
      if (!PERIODS[o.costPeriod] || o.costPeriod === 'month') delete o.costPeriod;
      if (o.costPeriod === 'multi' && Math.round(+o.costYears) >= 1) o.costYears = Math.round(+o.costYears); else delete o.costYears;
      if (cleanData(o.data).length) o.data = cleanData(o.data); else delete o.data;
      if (cleanReview(o.review)) o.review = cleanReview(o.review); else delete o.review;
      m.nodes.push(o);
    });
    const nids = new Set(m.nodes.map(n => n.id));
    list(raw.edges).forEach((e, i) => {
      const from = String(e.from), to = String(e.to);
      if (!nids.has(from) || !nids.has(to)) return;
      const o = { ...e, id: take(e.id, 'e', i), from, to };
      if (cleanData(o.data).length) o.data = cleanData(o.data); else delete o.data;
      const enc = typeof o.encrypted === 'string' ? (/^(yes|true|si|sí)$/i.test(o.encrypted) ? true : /^(no|false)$/i.test(o.encrypted) ? false : null) : o.encrypted;
      if (enc === true || enc === false) o.encrypted = enc; else delete o.encrypted;
      if (o.route !== 'curved' && o.route !== 'elbow') delete o.route;
      m.edges.push(o);
    });
    m.versions = normVersions(raw.versions);
    if (raw.active != null && m.versions.some(v => v.id === String(raw.active))) m.active = String(raw.active);
    return m;
  }

  // Versiones (fotos fijas) y ambientes (una copia por ambiente) guardados dentro del diagrama
  function normVersions(list) {
    const used = new Set();
    return (Array.isArray(list) ? list : []).filter(v => v && typeof v === 'object' && v.diagram && typeof v.diagram === 'object').map((v, i) => {
      const kind = v.kind === 'env' ? 'env' : 'version';
      let id = v.id != null && v.id !== '' ? String(v.id) : `${kind === 'env' ? 'env-' : 'v'}${i + 1}`;
      while (used.has(id)) id += '_';
      used.add(id);
      const o = { id, kind };
      if (kind === 'env') o.env = String(v.env || 'env'); else o.n = Math.max(1, Math.round(+v.n) || i + 1);
      if (v.note) o.note = String(v.note);
      o.savedAt = String(v.savedAt || '');
      o.diagram = v.diagram;
      return o;
    });
  }

  function ensurePositions(m) {
    const ok = n => Number.isFinite(+n.x) && Number.isFinite(+n.y) && n.x !== '' && n.y !== '' && n.x != null && n.y != null;
    const missing = m.nodes.filter(n => !ok(n));
    m.nodes.forEach(n => { if (ok(n)) { n.x = +n.x; n.y = +n.y; } });
    if (!missing.length) return;
    if (missing.length === m.nodes.length) return autoLayout(m);
    const placed = m.nodes.filter(ok), byId = new Map(m.nodes.map(n => [n.id, n]));
    const isPlaced = new Set(placed.map(n => n.id));
    const maxX = Math.max(...placed.map(n => n.x + nodeWidth(n)));
    const minY = Math.min(...placed.map(n => n.y));
    const overlaps = (x, y, w) => placed.some(p => x < p.x + nodeWidth(p) + 20 && x + w + 20 > p.x && y < p.y + H + 16 && y + H + 16 > p.y);
    missing.forEach((n, i) => {
      // Junto a un vecino ya colocado: a su derecha si recibe de él, a su izquierda si le envía
      const e = m.edges.find(e => (e.to === n.id && isPlaced.has(e.from)) || (e.from === n.id && isPlaced.has(e.to)));
      const w = nodeWidth(n);
      if (e) {
        const o = byId.get(e.to === n.id ? e.from : e.to);
        n.x = e.to === n.id ? o.x + nodeWidth(o) + C.layout.colGap : o.x - w - C.layout.colGap;
        n.y = o.y;
        while (overlaps(n.x, n.y, w)) n.y += H + C.layout.rowGap;
      } else {
        n.x = maxX + C.layout.colGap;
        n.y = minY + i * (H + C.layout.rowGap);
      }
      n.x = snap(n.x); n.y = snap(n.y);
      placed.push(n); isPlaced.add(n.id);
    });
  }

  const groupById = id => S.model.groups.find(g => g.id === id);
  function groupDepth(g, m = S.model) {
    let d = 0, p = g.parent;
    while (p && d < 50) { d++; p = m.groups.find(x => x.id === p)?.parent; }
    return d;
  }
  function inGroup(n, gid) {
    let g = n.group, i = 0;
    while (g && i++ < 50) { if (g === gid) return true; g = groupById(g)?.parent; }
    return false;
  }
  function uniqueId(prefix) {
    const used = new Set([...S.model.nodes, ...S.model.edges, ...S.model.groups].map(x => x.id));
    let i = 1;
    while (used.has(prefix + i)) i++;
    return prefix + i;
  }

  /* ---------- orden automático (capas por camino más largo) ---------- */
  function computeRanks(m) {
    const ids = m.nodes.map(n => n.id);
    const out = new Map(ids.map(id => [id, []]));
    m.edges.forEach(e => { if (e.from !== e.to) out.get(e.from).push(e.to); });
    const hasIn = new Set(m.edges.filter(e => e.from !== e.to).map(e => e.to));
    const state = new Map(), back = new Set();
    const dfs = u => {
      state.set(u, 1);
      for (const v of out.get(u)) {
        if (state.get(v) === 1) back.add(u + '\0' + v);
        else if (!state.get(v)) dfs(v);
      }
      state.set(u, 2);
    };
    ids.filter(id => !hasIn.has(id)).forEach(id => state.get(id) || dfs(id));
    ids.forEach(id => state.get(id) || dfs(id));
    const fwd = new Map(ids.map(id => [id, out.get(id).filter(v => !back.has(id + '\0' + v))]));
    const indeg = new Map(ids.map(id => [id, 0]));
    fwd.forEach(vs => vs.forEach(v => indeg.set(v, indeg.get(v) + 1)));
    const rank = new Map(ids.map(id => [id, 0]));
    const sources = ids.filter(id => indeg.get(id) === 0);
    const q = [...sources], topo = [];
    while (q.length) {
      const u = q.shift();
      topo.push(u);
      for (const v of fwd.get(u)) {
        rank.set(v, Math.max(rank.get(v), rank.get(u) + 1));
        indeg.set(v, indeg.get(v) - 1);
        if (indeg.get(v) === 0) q.push(v);
      }
    }
    // Un origen que solo consulta algo lejano (Athena → catálogo) se acerca a su destino:
    // queda justo antes del primero de sus destinos que también recibe de otros.
    const optional = new Set(m.edges.filter(e => e.style === 'optional').map(e => e.from + '\0' + e.to));
    const preds = new Map(ids.map(id => [id, []]));
    fwd.forEach((vs, u) => vs.forEach(v => preds.get(v).push(u)));
    let moved = false;
    sources.forEach(s => {
      const shared = fwd.get(s).filter(v => !optional.has(s + '\0' + v) && preds.get(v).some(u => u !== s));
      if (!shared.length) return;
      const r = Math.max(0, Math.min(...shared.map(v => rank.get(v))) - 1);
      if (r > rank.get(s)) { rank.set(s, r); moved = true; }
    });
    if (moved) topo.forEach(v => { if (preds.get(v).length) rank.set(v, Math.max(...preds.get(v).map(u => rank.get(u) + 1))); });
    return rank;
  }

  function autoLayout(m) {
    if (m.nodes.some(n => n.group && m.groups.some(g => g.id === n.group))) return groupLayout(m);
    flatLayout(m);
  }

  /* Orden con grupos: cada grupo se ordena dentro de su propia caja (por columnas según
     el flujo) y la caja entera se coloca como un elemento más en su contenedor.
     Así las cajas nunca se pisan, aunque haya grupos dentro de grupos. */
  function groupLayout(m) {
    const rank = computeRanks(m);
    const TB = (m.direction || C.layout.direction) === 'TB';
    const P = C.group.padding, LS = C.group.labelSpace;
    const gids = new Set(m.groups.map(g => g.id));
    const kids = new Map([[null, []]]);
    m.groups.forEach(g => kids.set(g.id, []));
    m.groups.forEach(g => kids.get(gids.has(g.parent) ? g.parent : null).push({ g }));
    m.nodes.forEach(n => kids.get(gids.has(n.group) ? n.group : null).push({ n }));
    // Contenedor de primer nivel de cada nodo dentro de un contenedor dado
    const owner = new Map();
    const fill = (cid, item, it) => {
      if (it.n) owner.set(it.n.id + '\0' + cid, item);
      else kids.get(it.g.id).forEach(k => fill(cid, item, k));
    };
    const preds = new Map(m.nodes.map(n => [n.id, []]));
    m.edges.forEach(e => e.from !== e.to && preds.get(e.to)?.push(e.from));

    // Devuelve el tamaño del contenido y deja en cada elemento su posición relativa
    function box(cid) {
      const items = kids.get(cid).filter(it => it.n || kids.get(it.g.id).length);
      items.forEach(it => {
        fill(cid, it, it);
        if (it.n) { it.w = nodeWidth(it.n); it.h = nodeBoxH(it.n); it.r = rank.get(it.n.id); it.ids = [it.n.id]; }
        else {
          const inner = box(it.g.id);
          it.inner = inner;
          it.w = inner.w + 2 * P; it.h = inner.h + 2 * P + LS;
          it.ids = inner.ids;
          it.r = Math.min(...it.ids.map(id => rank.get(id)));
        }
      });
      const ranks = [...new Set(items.map(it => it.r))].sort((a, b) => a - b);
      const cols = ranks.map(r => items.filter(it => it.r === r));
      const pos = new Map();
      let main = 0, maxCross = 0;
      const colSpans = cols.map(col => {
        // Orden dentro de la columna: cerca de los elementos de los que recibe
        const bary = it => {
          const ys = it.ids.flatMap(id => preds.get(id)).map(p => owner.get(p + '\0' + cid)).filter(o => o && o !== it && pos.has(o)).map(o => pos.get(o));
          return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : Infinity;
        };
        col.forEach((it, i) => { it.b = bary(it); it.i = i; });
        col.sort((a, b) => (a.b === b.b ? a.i - b.i : a.b - b.b) || (!!a.g - !!b.g));
        let cross = 0;
        col.forEach((it, i) => {
          if (i) cross += (it.g || col[i - 1].g ? C.layout.groupGap * 0.6 : C.layout.rowGap) + (TB ? 20 : 0);
          it.c = cross;
          cross += TB ? it.w : it.h;
        });
        const span = Math.max(...col.map(it => (TB ? it.h : it.w)));
        col.forEach(it => { it.m = main; });
        main += span + (TB ? C.layout.rankGapTB : C.layout.colGap);
        maxCross = Math.max(maxCross, cross);
        return cross;
      });
      // Centra cada columna respecto de la más alta
      cols.forEach((col, k) => col.forEach(it => {
        it.c += (maxCross - colSpans[k]) / 2;
        pos.set(it, it.c + (TB ? it.w : it.h) / 2);
      }));
      const w = Math.max(0, main - (TB ? C.layout.rankGapTB : C.layout.colGap));
      return { items, w: TB ? maxCross : w, h: TB ? w : maxCross, ids: items.flatMap(it => it.ids) };
    }
    const place = (b, x0, y0) => b.items.forEach(it => {
      const x = x0 + (TB ? it.c : it.m), y = y0 + (TB ? it.m : it.c);
      if (it.n) { it.n.x = snap(x); it.n.y = snap(y); }
      else place(it.inner, x + P, y + P + LS);
    });
    place(box(null), 0, 0);
  }

  function flatLayout(m) {
    const rank = computeRanks(m);
    const preds = new Map(m.nodes.map(n => [n.id, []]));
    m.edges.forEach(e => e.from !== e.to && preds.get(e.to).push(e.from));
    const gIndex = new Map(m.groups.map((g, i) => [g.id, i]));
    const gpath = n => {
      const chain = [];
      let g = n.group, i = 0;
      while (g && i++ < 50) { chain.unshift(String(gIndex.get(g)).padStart(3, '0')); g = m.groups.find(x => x.id === g)?.parent; }
      return chain.join('/');
    };
    const TB = (m.direction || C.layout.direction) === 'TB';
    const cols = [];
    m.nodes.forEach(n => (cols[rank.get(n.id)] ||= []).push(n));
    const order = new Map();
    let main = 0;
    cols.forEach(col => {
      if (!col) return;
      const bary = n => {
        const ps = preds.get(n.id).filter(p => order.has(p));
        return ps.length ? ps.reduce((s, p) => s + order.get(p), 0) / ps.length : 1e9;
      };
      const items = col.map((n, i) => ({ n, gp: gpath(n), b: bary(n), i, size: TB ? nodeWidth(n) : H }));
      items.sort((a, b) => (a.gp < b.gp ? -1 : a.gp > b.gp ? 1 : 0) || (a.b - b.b) || (a.i - b.i));
      let cross = 0, prev = null;
      const starts = items.map((it, i) => {
        if (i) cross += (TB ? C.layout.rowGap + 20 : C.layout.rowGap) + (it.gp !== prev ? C.layout.groupGap : 0);
        const s = cross;
        cross += it.size;
        prev = it.gp;
        return s;
      });
      items.forEach((it, i) => {
        const c = starts[i] - cross / 2;
        if (TB) { it.n.x = snap(c); it.n.y = snap(main); } else { it.n.x = snap(main); it.n.y = snap(c); }
        order.set(it.n.id, c + it.size / 2);
      });
      main += TB ? H + C.layout.rankGapTB : Math.max(...col.map(nodeWidth)) + C.layout.colGap;
    });
  }

  /* ---------- dibujo ---------- */
  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  const endEnter = node => node.addEventListener('animationend', ev => { if (ev.target === node) node.classList.remove('enter'); });

  function render(animate = false) {
    const m = S.model;
    for (const k in L) L[k].textContent = '';
    R.nodes.clear(); R.edges.clear(); R.groups.clear(); R.width.clear();
    m.nodes.forEach(n => R.width.set(n.id, nodeWidth(n)));
    [...m.groups].sort((a, b) => groupDepth(a) - groupDepth(b)).forEach(g => buildGroup(g, animate));
    const base = m.nodes.length * C.animation.enterStagger * 0.6;
    m.edges.forEach((e, i) => buildEdge(e, animate ? base + i * 30 : -1));
    m.nodes.forEach((n, i) => buildNode(n, animate ? i * C.animation.enterStagger : -1));
    updateGeometry();
    applyCompare();
    applyHighlight();
    updateMeta();
  }

  // Etiqueta de color con el texto corto de una clasificación (PII, PCI…)
  function dataTag(parent, x, y, t, h) {
    const w = Math.ceil(textW(t.short, FONT.dtag)) + 12;
    const g = el('g', { class: 'data-tag', style: `--tc:${t.color}` }, parent);
    el('rect', { x, y, width: w, height: h, rx: h / 2 }, g);
    el('text', { x: x + w / 2, y: y + h / 2 + 3.4, 'text-anchor': 'middle' }, g).textContent = t.short;
    return w;
  }
  // Candado cerrado (cifrado) o abierto (sin cifrar), de 10 px de ancho
  function lockIcon(parent, x, on) {
    const g = el('g', { class: `edge-lock ${on ? 'on' : 'off'}`, transform: `translate(${x} 0)` }, parent);
    el('rect', { x: 0.5, y: -2, width: 9, height: 7, rx: 1.6 }, g);
    el('path', { d: on ? 'M2.6 -2V-4.2a2.4 2.4 0 0 1 4.8 0V-2' : 'M2.6 -2V-4.9a2.4 2.4 0 0 1 4.8 0' }, g);
  }

  function buildGroup(g, animate) {
    const root = el('g', { class: 'group' + (animate ? ' enter' : ''), 'data-id': g.id }, L.groups);
    root.style.setProperty('--c', colorVar(g.color) || 'var(--muted)');
    if (animate) endEnter(root);
    const box = el('rect', { class: 'group-box', rx: C.group.radius }, root);
    const tag = el('g', { class: 'group-tag' }, root);
    const tw = Math.ceil(textW(g.label, FONT.tag) + 22);
    el('rect', { width: tw, height: 22, rx: 7 }, tag);
    el('text', { x: 10, y: 15 }, tag).textContent = g.label;
    R.groups.set(g.id, { g: root, box, tag, tw });
  }

  function buildEdge(e, delay) {
    const st = C.edgeStyles[e.style] ? e.style : 'sync', cfg = C.edgeStyles[st];
    const g = el('g', { class: `edge edge-${st}${cfg.dash ? ' edge-dashed' : ''}${delay >= 0 ? ' enter' : ''}`, 'data-id': e.id }, L.edges);
    g.style.setProperty('--c', colorVar(e.color) || nodeColor(S.model.nodes.find(n => n.id === e.from)));
    g.style.setProperty('--w', `${cfg.width}px`);
    if (delay >= 0) { g.style.animationDelay = `${delay}ms`; endEnter(g); }
    const hit = el('path', { class: 'edge-hit' }, g);
    const line = el('path', { class: 'edge-line' }, g);
    if (cfg.dash) {
      line.setAttribute('stroke-dasharray', cfg.dash);
      const dist = cfg.dash.split(/[\s,]+/).reduce((s, v) => s + (+v || 0), 0) * 4;
      g.style.setProperty('--dash-to', `${-dist}px`);
      g.style.setProperty('--dash-dur', `${(dist / (C.animation.particleSpeed * 0.5)).toFixed(2)}s`);
    }
    const arrow = el('path', { class: 'edge-arrow' }, g);
    const parts = Array.from({ length: cfg.particles || 0 }, () => el('circle', { class: 'particle', r: st === 'data' ? 2.4 : 3, cx: -9999, cy: -9999 }, g));
    // Etiqueta: candado de cifrado, texto y clasificaciones de los datos que viajan
    let label = null;
    const tags = dataTags(e), lock = e.encrypted != null;
    const byId = id => S.model.nodes.find(n => n.id === id);
    if (isInsecure(e, byId)) g.classList.add('insecure');
    if (e.label || tags.length || lock) {
      label = el('g', { class: 'edge-label' }, g);
      const items = [];
      if (lock) items.push({ w: 10, draw: x => lockIcon(label, x, e.encrypted) });
      if (e.label) items.push({ w: textW(e.label, FONT.edge), draw: x => { el('text', { x, y: 4 }, label).textContent = e.label; } });
      tags.forEach(t => items.push({ w: Math.ceil(textW(t.short, FONT.dtag)) + 12, draw: x => dataTag(label, x, -7, t, 14) }));
      const gap = 5, w = items.reduce((sum, it) => sum + it.w, 0) + gap * (items.length - 1) + 16;
      el('rect', { x: -w / 2, y: -10, width: w, height: 20, rx: 10 }, label);
      let x = -w / 2 + 8;
      items.forEach(it => { it.draw(x); x += it.w + gap; });
    }
    R.edges.set(e.id, { g, e, hit, line, arrow, label, parts, len: 0, phase: Math.random() });
  }

  function buildNode(n, delay) {
    const t = typeOf(n), w = R.width.get(n.id);
    const g = el('g', { class: 'node', 'data-id': n.id }, L.nodes);
    g.style.setProperty('--c', nodeColor(n));
    const b = el('g', { class: 'node-body' + (delay >= 0 ? ' enter' : '') }, g);
    if (delay >= 0) { b.style.animationDelay = `${delay}ms`; endEnter(b); }
    el('rect', { class: 'node-halo', x: -5, y: -5, width: w + 10, height: H + 10, rx: C.node.radius + 5 }, b);
    el('rect', { class: 'node-card', width: w, height: H, rx: C.node.radius }, b);
    const official = iconInfo(n.icon);
    if (official) {
      el('rect', { class: 'node-icon-tile', x: 12, y: (H - 40) / 2, width: 40, height: 40, rx: 10 }, b);
      el('image', { href: official.src, x: 16, y: (H - 32) / 2, width: 32, height: 32 }, b);
    } else {
      el('rect', { class: 'node-icon-bg', x: 12, y: (H - 40) / 2, width: 40, height: 40, rx: 11 }, b);
      el('g', { class: 'node-icon', transform: `translate(20 ${(H - 24) / 2})` }, b).innerHTML = t.icon;
    }
    const max = w - 64 - 16;
    // Nombre en 1 o 2 líneas y detalle debajo, todo centrado en vertical
    const lines = C.node.sameSize !== false ? wrapText(n.label, FONT.label, max) : [fitText(n.label, FONT.label, max)];
    const top = (H - lines.length * 16 - (n.sub ? 15 : 0)) / 2;
    lines.forEach((l, i) => { el('text', { class: 'node-label', x: 64, y: top + 12 + i * 16 }, b).textContent = l; });
    if (n.sub) el('text', { class: 'node-sub', x: 64, y: top + lines.length * 16 + 12 }, b).textContent = fitText(n.sub, FONT.sub, max);
    // Arriba a la izquierda: la observación de revisión (si hay) y las clasificaciones de datos
    const dt = [...(n.review ? [reviewTag(n.review)] : []), ...dataTags(n)];
    el('title', null, g).textContent = [n.sub ? `${n.label} · ${n.sub}` : n.label, ...dt.map(t => t.label)].join('\n');
    if (dt.length) {
      const dg = el('g', { class: 'node-data' }, b);
      let x = 14;
      dt.forEach(t => { x += dataTag(dg, x, -8, t, 16) + 4; });
    }
    if (n.badge != null && n.badge !== '') {
      const bw = Math.max(22, textW(n.badge, FONT.badge) + 12);
      const bg = el('g', { class: 'node-badge', transform: `translate(${w - 14} 0)` }, b);
      el('rect', { x: -bw / 2, y: -9, width: bw, height: 18, rx: 9 }, bg);
      el('text', { 'text-anchor': 'middle', y: 4 }, bg).textContent = n.badge;
    }
    if (hasCost(n)) {
      const ct = costText(n), cw = Math.ceil(textW(ct, FONT.cost) + 20);
      const cg = el('g', { class: 'node-cost', transform: `translate(${(w - cw) / 2} ${H + 6})` }, b);
      el('rect', { width: cw, height: 20, rx: 10 }, cg);
      el('text', { x: cw / 2, y: 14, 'text-anchor': 'middle' }, cg).textContent = ct;
    }
    R.nodes.set(n.id, g);
  }

  function curvePath(a, b, off) {
    const hgap = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
    const vgap = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
    if (hgap >= vgap) {
      const dir = b.x + b.w / 2 >= a.x + a.w / 2 ? 1 : -1;
      const sx = dir > 0 ? a.x + a.w : a.x, ex = dir > 0 ? b.x : b.x + b.w;
      const sy = a.y + a.h / 2 + off * dir, ey = b.y + b.h / 2 + off * dir;
      const k = Math.max(40, Math.abs(ex - sx) * 0.5);
      return `M${sx},${sy} C${sx + dir * k},${sy} ${ex - dir * k},${ey} ${ex},${ey}`;
    }
    const dir = b.y + b.h / 2 >= a.y + a.h / 2 ? 1 : -1;
    const sy = dir > 0 ? a.y + a.h : a.y, ey = dir > 0 ? b.y : b.y + b.h;
    const sx = a.x + a.w / 2 - off * dir, ex = b.x + b.w / 2 - off * dir;
    const k = Math.max(30, Math.abs(ey - sy) * 0.5);
    return `M${sx},${sy} C${sx},${sy + dir * k} ${ex},${ey - dir * k} ${ex},${ey}`;
  }
  /* ---------- conectores en ángulo recto que esquivan los nodos ---------- */
  // Prueba varios caminos de 1, 3 o 5 tramos y se queda con el más corto que no pisa ningún nodo
  function elbowPath(a, b, off, obstacles) {
    const hgap = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
    const vgap = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
    const flip = hgap < vgap; // en vertical se trabaja con x e y cambiados
    const T = flip ? q => ({ x: q.y, y: q.x, w: q.h, h: q.w }) : q => q;
    const A = T(a), B = T(b), obs = obstacles.map(T);
    const dir = B.x + B.w / 2 >= A.x + A.w / 2 ? 1 : -1;
    const sx = dir > 0 ? A.x + A.w : A.x, ex = dir > 0 ? B.x : B.x + B.w;
    const sy = A.y + A.h / 2 + off * dir, ey = B.y + B.h / 2 + off * dir;
    const M = 16, STUB = 18, pad = 10;
    const blocks = (x1, y1, x2, y2, list) => list.some(o => {
      const l = o.x - pad, t = o.y - pad, rr = o.x + o.w + pad, bb = o.y + o.h + pad;
      return Math.max(x1, x2) > l && Math.min(x1, x2) < rr && Math.max(y1, y2) > t && Math.min(y1, y2) < bb;
    });
    // El primer y el último tramo salen del nodo de origen y llegan al de destino: esos dos no cuentan
    const hits = pts => pts.slice(1).reduce((n, q, i) => n + (blocks(pts[i][0], pts[i][1], q[0], q[1], i === 0 || i === pts.length - 2 ? obs : [...obs, A, B]) ? 1 : 0), 0);
    const cands = [];
    if (Math.abs(sy - ey) < 1) cands.push([[sx, sy], [ex, ey]]);
    const lo = Math.min(sx, ex), hi = Math.max(sx, ex);
    if ((ex - sx) * dir > STUB * 2) {
      [(sx + ex) / 2, ...obs.flatMap(o => [o.x - M, o.x + o.w + M])].filter(x => x > lo + STUB - 1 && x < hi - STUB + 1)
        .forEach(x => cands.push([[sx, sy], [x, sy], [x, ey], [ex, ey]]));
    }
    const x1 = sx + dir * STUB, x2 = ex - dir * STUB;
    [A, B, ...obs].flatMap(o => [o.y - M, o.y + o.h + M]).forEach(y => cands.push([[sx, sy], [x1, sy], [x1, y], [x2, y], [x2, ey], [ex, ey]]));
    const score = pts => pts.slice(1).reduce((n, q, i) => n + Math.abs(q[0] - pts[i][0]) + Math.abs(q[1] - pts[i][1]), 0) + (pts.length - 2) * 40 + hits(pts) * 1e5;
    let best = cands[0], bs = Infinity;
    cands.forEach(c => { const v = score(c); if (v < bs) { bs = v; best = c; } });
    return roundPath(best.map(([x, y]) => (flip ? [y, x] : [x, y])));
  }
  // Une los puntos con esquinas redondeadas y quita los que sobran (repetidos o en línea recta)
  function roundPath(pts, rad = 10) {
    pts = pts.filter((q, i) => !i || Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) > 0.5);
    pts = pts.filter((q, i) => !i || i === pts.length - 1 || !((pts[i - 1][0] === q[0] && q[0] === pts[i + 1][0]) || (pts[i - 1][1] === q[1] && q[1] === pts[i + 1][1])));
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const [px, py] = pts[i - 1], [x, y] = pts[i], [nx, ny] = pts[i + 1];
      const k = Math.min(rad, Math.hypot(x - px, y - py) / 2, Math.hypot(nx - x, ny - y) / 2);
      d += ` L${x - Math.sign(x - px) * k},${y - Math.sign(y - py) * k} Q${x},${y} ${x + Math.sign(nx - x) * k},${y + Math.sign(ny - y) * k}`;
    }
    const [lx, ly] = pts[pts.length - 1];
    return `${d} L${lx},${ly}`;
  }
  const routeOf = e => e.route || S.model.routing || 'curved';

  const loopPath = a => `M${a.x + a.w - 34},${a.y} C${a.x + a.w - 34},${a.y - 56} ${a.x + a.w + 52},${a.y - 30} ${a.x + a.w},${a.y + a.h / 2 - 6}`;

  function updateGeometry() {
    const m = S.model, byId = new Map(m.nodes.map(n => [n.id, n]));
    const rect = id => { const n = byId.get(id); return { x: n.x, y: n.y, w: R.width.get(id), h: H }; };
    m.nodes.forEach(n => R.nodes.get(n.id)?.setAttribute('transform', `translate(${n.x} ${n.y})`));

    const pairs = new Set(m.edges.map(e => e.from + '\0' + e.to));
    const allRects = m.nodes.map(n => ({ id: n.id, ...rect(n.id) }));
    R.edges.forEach(r => {
      const e = r.e, a = rect(e.from), b = rect(e.to), off = pairs.has(e.to + '\0' + e.from) ? 7 : 0;
      const d = e.from === e.to ? loopPath(a)
        : routeOf(e) === 'elbow' ? elbowPath(a, b, off, allRects.filter(o => o.id !== e.from && o.id !== e.to)) : curvePath(a, b, off);
      r.hit.setAttribute('d', d);
      r.line.setAttribute('d', d);
      r.len = r.line.getTotalLength();
      const p = r.line.getPointAtLength(r.len), q = r.line.getPointAtLength(Math.max(0, r.len - 9));
      const ang = Math.atan2(p.y - q.y, p.x - q.x), c = Math.cos(ang), s = Math.sin(ang);
      const bx = p.x - 10 * c, by = p.y - 10 * s;
      r.arrow.setAttribute('d', `M${p.x},${p.y} L${bx - 5 * s},${by + 5 * c} L${bx + 5 * s},${by - 5 * c} Z`);
      if (r.label) {
        const mp = r.line.getPointAtLength(r.len / 2);
        r.label.setAttribute('transform', `translate(${mp.x} ${mp.y})`);
      }
    });

    // Cajas de grupo: de dentro hacia fuera
    R.gbox.clear();
    [...m.groups].sort((a, b) => groupDepth(b) - groupDepth(a)).forEach(g => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const add = (x, y, w, h) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h); };
      m.nodes.forEach(n => n.group === g.id && add(n.x, n.y, R.width.get(n.id), nodeBoxH(n)));
      m.groups.forEach(c => { const cb = c.parent === g.id && R.gbox.get(c.id); if (cb) add(cb.x, cb.y, cb.w, cb.h); });
      const r = R.groups.get(g.id);
      if (!r) return;
      if (x0 === Infinity) { r.g.style.display = 'none'; return; }
      r.g.style.display = '';
      const p = C.group.padding;
      const box = { x: x0 - p, y: y0 - p - C.group.labelSpace, w: Math.max(x1 - x0 + 2 * p, r.tw + 24), h: y1 - y0 + 2 * p + C.group.labelSpace };
      R.gbox.set(g.id, box);
      r.box.setAttribute('x', box.x); r.box.setAttribute('y', box.y);
      r.box.setAttribute('width', box.w); r.box.setAttribute('height', box.h);
      r.tag.setAttribute('transform', `translate(${box.x + 12} ${box.y + 10})`);
    });
    if (S.compare?.diff) drawGhosts();
  }

  /* ---------- resaltado ---------- */
  function reach(id, mode) {
    const m = S.model, nodes = new Set([id]), edges = new Set();
    if (mode === 'direct') {
      m.edges.forEach(e => { if (e.from === id || e.to === id) { edges.add(e.id); nodes.add(e.from); nodes.add(e.to); } });
      return { nodes, edges };
    }
    const walk = down => {
      const q = [id], seen = new Set([id]);
      while (q.length) {
        const u = q.shift();
        m.edges.forEach(e => {
          if ((down ? e.from : e.to) !== u) return;
          const v = down ? e.to : e.from;
          edges.add(e.id); nodes.add(v);
          if (!seen.has(v)) { seen.add(v); q.push(v); }
        });
      }
    };
    if (mode === 'down' || mode === 'both') walk(true);
    if (mode === 'up' || mode === 'both') walk(false);
    return { nodes, edges };
  }

  function applyHighlight() {
    if (S.play) return;
    const s = S.sel, m = S.model;
    let f = null, mode = '';
    if (s?.kind === 'node') { f = reach(s.id, S.reach); mode = 'focusing'; }
    else if (s?.kind === 'multi') {
      const ns = new Set(s.ids);
      f = { nodes: ns, edges: new Set(m.edges.filter(e => ns.has(e.from) && ns.has(e.to)).map(e => e.id)) };
      mode = 'focusing';
    } else if (s?.kind === 'edge') {
      const e = m.edges.find(x => x.id === s.id);
      if (e) { f = { nodes: new Set([e.from, e.to]), edges: new Set([e.id]) }; mode = 'focusing'; }
    } else if (s?.kind === 'group') {
      const ns = new Set(m.nodes.filter(n => inGroup(n, s.id)).map(n => n.id));
      f = { nodes: ns, edges: new Set(m.edges.filter(e => ns.has(e.from) && ns.has(e.to)).map(e => e.id)) };
      mode = 'focusing';
    } else if (S.hover && !S.connecting) { f = reach(S.hover, 'direct'); mode = 'hovering'; }
    svg.classList.toggle('focusing', mode === 'focusing');
    svg.classList.toggle('hovering', mode === 'hovering');
    svg.classList.toggle('connecting', !!S.connecting);
    R.nodes.forEach((g, id) => {
      g.classList.toggle('lit', !!f && f.nodes.has(id));
      g.classList.toggle('sel', s?.kind === 'node' ? s.id === id : s?.kind === 'multi' && s.ids.includes(id));
      g.classList.toggle('connect-src', S.connecting === id);
    });
    R.edges.forEach((r, id) => {
      r.g.classList.toggle('lit', !!f && f.edges.has(id));
      r.g.classList.toggle('sel', s?.kind === 'edge' && s.id === id);
    });
    R.groups.forEach((r, id) => r.g.classList.toggle('sel', s?.kind === 'group' && s.id === id));
  }

  /* ---------- partículas (bucle de animación) ---------- */
  let lastT = performance.now();
  function tick(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    if (S.anim && !document.hidden) {
      R.edges.forEach(r => {
        if (!r.parts.length || r.len < 1) return;
        const f = r.g.classList.contains('pulse') ? 3 : 1;
        r.phase = (r.phase + dt * C.animation.particleSpeed * f / r.len) % 1;
        const count = r.parts.length;
        r.parts.forEach((c, i) => {
          const t = (r.phase + i / count) % 1, p = r.line.getPointAtLength(t * r.len);
          c.setAttribute('cx', p.x.toFixed(1));
          c.setAttribute('cy', p.y.toFixed(1));
          c.setAttribute('opacity', Math.min(1, t * 6, (1 - t) * 6).toFixed(2));
        });
      });
    }
    requestAnimationFrame(tick);
  }

  /* ---------- cámara ---------- */
  function applyView() {
    const { x, y, k } = S.view;
    viewport.setAttribute('transform', `translate(${x} ${y}) scale(${k})`);
    const g = C.grid.size * k;
    stage.style.backgroundSize = `${g}px ${g}px`;
    stage.style.backgroundPosition = `${x}px ${y}px`;
    $('#zoomv').textContent = `${Math.round(k * 100)}%`;
  }
  const toWorld = (cx, cy) => {
    const r = svg.getBoundingClientRect();
    return { x: (cx - r.left - S.view.x) / S.view.k, y: (cy - r.top - S.view.y) / S.view.k };
  };
  let viewAnim = 0;
  function animateView(to, ms = C.animation.viewTween) {
    cancelAnimationFrame(viewAnim);
    if (reducedMotion || ms <= 0) { Object.assign(S.view, to); applyView(); return; }
    const from = { ...S.view }, t0 = performance.now();
    const step = now => {
      const t = clamp((now - t0) / ms, 0, 1), e = 1 - Math.pow(1 - t, 3);
      S.view.x = from.x + (to.x - from.x) * e;
      S.view.y = from.y + (to.y - from.y) * e;
      S.view.k = from.k + (to.k - from.k) * e;
      applyView();
      if (t < 1) viewAnim = requestAnimationFrame(step);
    };
    viewAnim = requestAnimationFrame(step);
  }
  function zoomTarget(f, cx, cy) {
    const r = svg.getBoundingClientRect();
    if (cx == null) { cx = r.width / 2; cy = r.height / 2; }
    const k = clamp(S.view.k * f, C.view.minZoom, C.view.maxZoom);
    return { k, x: cx - (cx - S.view.x) * (k / S.view.k), y: cy - (cy - S.view.y) * (k / S.view.k) };
  }
  function contentBox() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (x, y, w, h) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h); };
    S.model.nodes.forEach(n => add(n.x, n.y, R.width.get(n.id) || C.node.width, nodeBoxH(n)));
    R.gbox.forEach(b => add(b.x, b.y, b.w, b.h));
    return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function fitView(smooth = true) {
    const b = contentBox(), r = svg.getBoundingClientRect();
    if (!r.width) return;
    let to;
    if (!b) to = { k: 1, x: r.width / 2, y: r.height / 2 };
    else {
      const pad = 56, top = 76;
      const k = clamp(Math.min((r.width - pad * 2) / b.w, (r.height - pad - top) / b.h), C.view.minZoom, 1.25);
      to = { k, x: (r.width - b.w * k) / 2 - b.x * k, y: top + (r.height - top - pad - b.h * k) / 2 - b.y * k };
    }
    smooth ? animateView(to) : animateView(to, 0);
  }
  function centerOn(id) {
    const n = S.model.nodes.find(x => x.id === id);
    if (!n) return;
    const r = svg.getBoundingClientRect(), k = S.view.k;
    const shift = r.width > 900 ? 150 : 0;
    animateView({ k, x: r.width / 2 - shift - (n.x + R.width.get(id) / 2) * k, y: r.height / 2 - (n.y + H / 2) * k });
  }

  /* ---------- historial, guardado y sincronización ---------- */
  const snapshot = () => JSON.stringify(S.model);
  // Edición de texto: un solo paso de historial por cada sesión de escritura
  let edit = null;
  function pushHistory() {
    S.history.push(snapshot());
    if (S.history.length > 150) S.history.shift();
    S.future.length = 0;
    edit = null;
    updateUndoButtons();
  }
  const beginEdit = () => { edit = { snap: snapshot(), pushed: false }; };
  const endEdit = () => { edit = null; };
  const markEdit = () => {
    if (!edit) beginEdit();
    if (edit.pushed) return;
    S.history.push(edit.snap);
    S.future.length = 0;
    edit.pushed = true;
    updateUndoButtons();
  };
  function undo() {
    if (!S.history.length) return toast(T('toast.nothingUndo'));
    S.future.push(snapshot());
    setModel(JSON.parse(S.history.pop()));
    toast(T('toast.undone'));
  }
  function redo() {
    if (!S.future.length) return toast(T('toast.nothingRedo'));
    S.history.push(snapshot());
    setModel(JSON.parse(S.future.pop()));
    toast(T('toast.redone'));
  }
  function updateUndoButtons() {
    $('#btn-undo').disabled = !S.history.length;
    $('#btn-redo').disabled = !S.future.length;
  }

  // Además de guardar, refresca el aviso de "cambios sin guardar" de la versión abierta
  const save = debounce(() => { store.set('model', S.model); updateMeta(); renderVersions(); }, 250);

  const ORDER = {
    group: ['id', 'label', 'color', 'parent'],
    node: ['id', 'label', 'type', 'icon', 'sub', 'badge', 'group', 'color', 'x', 'y', 'cost', 'costPeriod', 'costYears', 'data', 'review', 'desc'],
    edge: ['id', 'from', 'to', 'label', 'style', 'route', 'color', 'data', 'encrypted']
  };
  function serialize(m, full = false) {
    const ordered = (o, keys) => { const r = {}; keys.forEach(k => k in o && (r[k] = o[k])); Object.keys(o).forEach(k => k in r || (r[k] = o[k])); return r; };
    const line = o => '{ ' + Object.entries(o)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify((k === 'x' || k === 'y') && typeof v === 'number' ? Math.round(v) : v)}`)
      .join(', ') + ' }';
    const arr = (name, list, keys) => list.length
      ? `  "${name}": [\n${list.map(o => '    ' + line(ordered(o, keys))).join(',\n')}\n  ]`
      : `  "${name}": []`;
    const head = [`  "title": ${JSON.stringify(m.title)}`];
    if (m.direction) head.push(`  "direction": ${JSON.stringify(m.direction)}`);
    if (m.routing) head.push(`  "routing": ${JSON.stringify(m.routing)}`);
    if (m.meta) head.push(`  "meta": ${JSON.stringify(m.meta)}`);
    const body = [...head, arr('groups', m.groups, ORDER.group), arr('nodes', m.nodes, ORDER.node), arr('edges', m.edges, ORDER.edge)];
    // El archivo exportado lleva también las versiones; el editor JSON no las muestra
    if (full && m.versions?.length) {
      if (m.active) body.push(`  "active": ${JSON.stringify(m.active)}`);
      body.push(`  "versions": [\n${m.versions.map(v => '    ' + JSON.stringify(v)).join(',\n')}\n  ]`);
    }
    return `{\n${body.join(',\n')}\n}\n`;
  }
  /* ---------- editores de código: JSON y texto ---------- */
  function setStatus(sel, ok, msg) {
    const s = $(sel);
    s.classList.toggle('err', !ok);
    s.textContent = msg;
    s.title = msg;
  }
  function refreshGutter(box, errLines) {
    const g = box.previousElementSibling;
    if (!g) return;
    const count = box.value.split('\n').length;
    g.innerHTML = Array.from({ length: count }, (_, i) => `<span${errLines?.has(i + 1) ? ' class="err"' : ''}>${i + 1}</span>`).join('\n');
    g.scrollTop = box.scrollTop;
  }
  const EDITORS = {
    json: { sel: '#json', status: '#json-status', ok: () => T('ed.json.ok'), write: () => serialize(S.model) },
    text: { sel: '#text-src', status: '#text-status', ok: () => T('ed.text.ok'), write: () => window.DiagramonText?.stringify(S.model, I.lang) ?? '' }
  };
  // Escribe el modelo en los editores; se salta el que originó el cambio y el que tiene el foco
  function writeEditors(skip, force) {
    for (const [k, ed] of Object.entries(EDITORS)) {
      const box = $(ed.sel);
      if (k === skip || (!force && document.activeElement === box)) continue;
      box.value = ed.write();
      box._errs = null;
      refreshGutter(box);
      setStatus(ed.status, true, ed.ok());
    }
  }
  const writeEditorsLater = debounce(() => writeEditors(null), 150);
  const syncEditor = now => (now ? writeEditors(null, true) : writeEditorsLater());
  // Última posición conocida de cada nodo: el texto no guarda posiciones
  const posCache = new Map();

  function setModel(raw, opts = {}) {
    stopPlay();
    if (opts.history) pushHistory();
    // El texto y el JSON del editor no incluyen las versiones: se conservan las que había
    if (opts.fromEditor && S.model && raw && typeof raw === 'object' && !Array.isArray(raw.versions)) raw = { ...raw, versions: S.model.versions, active: S.model.active };
    S.model = normalize(raw);
    ensurePositions(S.model);
    S.sel = normSel(S.sel);
    if (S.sel && !selTarget()) S.sel = null;
    if (S.connecting && !S.model.nodes.some(n => n.id === S.connecting)) cancelConnect();
    render(!!opts.animate);
    S.model.nodes.forEach(n => posCache.set(n.id, { x: n.x, y: n.y }));
    updateRouteButton();
    writeEditors(opts.fromEditor, !opts.fromEditor);
    renderInspector();
    save();
    updateUndoButtons();
    if (opts.fit) fitView(opts.fit !== 'instant');
  }

  // Tras cambiar el modelo desde el lienzo o el inspector
  function changed(structural = true) {
    if (structural) render(false); else { updateGeometry(); applyCompare(); }
    syncEditor();
    save();
    updateUndoButtons();
  }

  function updateMeta() {
    const m = S.model;
    $('#stage-h1').textContent = m.title;
    const costs = m.nodes.some(hasCost) ? `≈ ${money(round2(monthlyTotal(m.nodes)))}${T('cost.mo')}` : '';
    const byId = id => m.nodes.find(n => n.id === id), insecure = m.edges.filter(e => isInsecure(e, byId)).length;
    const open = m.nodes.filter(n => n.review && n.review.status !== 'resolved'), overdue = open.filter(n => reviewState(n.review) === 'overdue').length;
    const reviews = open.length ? T('meta.review', { n: open.length, o: overdue }) : '';
    $('#stage-meta').textContent = [T('meta.nodes', m.nodes.length), T('meta.edges', m.edges.length), m.groups.length ? T('meta.groups', m.groups.length) : '', costs, insecure ? T('meta.insecure', insecure) : '', reviews].filter(Boolean).join(' · ');
    const t = $('#title');
    if (document.activeElement !== t) t.value = m.title;
    $('#empty').hidden = m.nodes.length > 0;
    const v = activeVersion(), pill = $('#stage-ver');
    pill.hidden = !v;
    if (v) {
      pill.style.setProperty('--c', verColor(v));
      pill.innerHTML = `<span class="dot"></span>${esc(verLabel(v))}${isDirty(v) ? ` <small>· ${esc(T('ver.dirty'))}</small>` : ''}`;
    }
    document.title = `${m.title} · ${C.app.name}`;
  }

  /* ---------- acciones ---------- */
  // Selección: { kind: 'node' | 'edge' | 'group', id } o { kind: 'multi', ids: [nodos] }
  function selTarget() {
    const s = S.sel;
    if (!s || !S.model) return null;
    if (s.kind === 'multi') { const ns = S.model.nodes.filter(n => s.ids.includes(n.id)); return ns.length ? ns : null; }
    const list = s.kind === 'node' ? S.model.nodes : s.kind === 'edge' ? S.model.edges : S.model.groups;
    return list.find(x => x.id === s.id) || null;
  }
  // Una selección múltiple de 1 nodo pasa a ser simple; de 0, a ninguna
  function normSel(sel) {
    if (sel?.kind !== 'multi') return sel;
    const ids = [...new Set(sel.ids)].filter(id => S.model.nodes.some(n => n.id === id));
    return ids.length > 1 ? { kind: 'multi', ids } : ids.length ? { kind: 'node', id: ids[0] } : null;
  }
  const selIds = () => (S.sel?.kind === 'node' ? [S.sel.id] : S.sel?.kind === 'multi' ? S.sel.ids : []);
  const selNodes = () => { const ids = selIds(); return S.model.nodes.filter(n => ids.includes(n.id)); };
  function toggleInSelection(id) {
    const ids = selIds();
    select({ kind: 'multi', ids: ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id] });
  }
  function select(sel, opts = {}) {
    S.sel = normSel(sel);
    if (S.sel && !selTarget()) S.sel = null;
    applyHighlight();
    renderInspector();
    if (opts.center && S.sel?.kind === 'node') centerOn(S.sel.id);
  }

  function addNode(type, wx, wy, extra = {}) {
    S.lastType = C.types[type] ? type : 'generic';
    S.lastExtra = extra;
    if (wx == null) {
      const r = svg.getBoundingClientRect(), c = toWorld(r.left + r.width / 2, r.top + r.height / 2);
      wx = c.x + (Math.random() * 80 - 40);
      wy = c.y + (Math.random() * 80 - 40);
    }
    pushHistory();
    const n = { id: uniqueId(`${extra.icon ? extra.icon.split('/')[1] : S.lastType}-`), label: extra.label || typeLabel(type), type: S.lastType };
    if (extra.icon) n.icon = extra.icon;
    if (extra.sub) n.sub = extra.sub;
    n.x = snap(wx - nodeWidth(n) / 2);
    n.y = snap(wy - H / 2);
    // Si cae dentro de un grupo, entra en el más profundo
    let best = null, depth = -1;
    R.gbox.forEach((b, gid) => {
      if (wx >= b.x && wx <= b.x + b.w && wy >= b.y && wy <= b.y + b.h) {
        const d = groupDepth(groupById(gid));
        if (d > depth) { depth = d; best = gid; }
      }
    });
    if (best) n.group = best;
    S.model.nodes.push(n);
    changed(true);
    const body = R.nodes.get(n.id)?.firstChild;
    if (body) { body.classList.add('enter'); endEnter(body); }
    select({ kind: 'node', id: n.id });
    toast(T('toast.added', { name: n.label }));
  }

  function addEdge(from, to) {
    cancelConnect();
    if (from === to) return;
    if (S.model.edges.some(e => e.from === from && e.to === to)) { toast(T('toast.edgeExists')); return; }
    pushHistory();
    const id = uniqueId('e');
    S.model.edges.push({ id, from, to });
    changed(true);
    select({ kind: 'edge', id });
    toast(T('toast.edgeMade'));
  }

  function startConnect(id) {
    S.connecting = id;
    $('#banner').hidden = false;
    applyHighlight();
  }
  function cancelConnect() {
    if (!S.connecting) return;
    S.connecting = null;
    $('#banner').hidden = true;
    applyHighlight();
  }

  function deleteSelection() {
    const s = S.sel, t = selTarget();
    if (!t) return;
    pushHistory();
    const m = S.model;
    if (s.kind === 'node' || s.kind === 'multi') {
      const ids = new Set(selIds());
      m.nodes = m.nodes.filter(n => !ids.has(n.id));
      m.edges = m.edges.filter(e => !ids.has(e.from) && !ids.has(e.to));
    } else if (s.kind === 'edge') {
      m.edges = m.edges.filter(e => e.id !== s.id);
    } else {
      m.groups = m.groups.filter(g => g.id !== s.id);
      m.groups.forEach(g => { if (g.parent === s.id) { if (t.parent) g.parent = t.parent; else delete g.parent; } });
      m.nodes.forEach(n => { if (n.group === s.id) { if (t.parent) n.group = t.parent; else delete n.group; } });
    }
    S.sel = null; S.hover = null;
    changed(true);
    renderInspector();
    toast(T('toast.deleted'));
  }

  // Duplica los nodos elegidos y las conexiones entre ellos, debajo del original
  function duplicateSelection() {
    const ns = selNodes();
    if (!ns.length) return;
    pushHistory();
    const dy = Math.max(...ns.map(n => n.y + nodeBoxH(n))) - Math.min(...ns.map(n => n.y)) + 32;
    const ids = new Map();
    ns.forEach(n => {
      const copy = { ...clone(n), id: uniqueId(`${n.type}-`), label: `${n.label} (${T('copy.suffix')})`, x: snap(n.x + 32), y: snap(n.y + dy) };
      ids.set(n.id, copy.id);
      S.model.nodes.push(copy);
    });
    S.model.edges.filter(e => ids.has(e.from) && ids.has(e.to)).forEach(e => {
      S.model.edges.push({ ...clone(e), id: uniqueId('e'), from: ids.get(e.from), to: ids.get(e.to) });
    });
    changed(true);
    select({ kind: 'multi', ids: [...ids.values()] });
  }

  function renameNode(id) {
    const n = S.model.nodes.find(x => x.id === id);
    const v = prompt(T('prompt.node'), n.label);
    if (v == null || !v.trim() || v.trim() === n.label) return;
    pushHistory(); n.label = v.trim(); changed(true); renderInspector();
  }
  function renameGroup(id) {
    const g = groupById(id);
    const v = prompt(T('prompt.group'), g.label);
    if (v == null || !v.trim() || v.trim() === g.label) return;
    pushHistory(); g.label = v.trim(); changed(true); renderInspector();
  }
  function renameEdge(id) {
    const e = S.model.edges.find(x => x.id === id);
    const v = prompt(T('prompt.edge'), e.label || '');
    if (v == null || v.trim() === (e.label || '')) return;
    pushHistory();
    if (v.trim()) e.label = v.trim(); else delete e.label;
    changed(true); renderInspector();
  }

  function relayout() {
    if (!S.model.nodes.length) return;
    stopPlay();
    pushHistory();
    const from = new Map(S.model.nodes.map(n => [n.id, { x: n.x, y: n.y }]));
    autoLayout(S.model);
    const to = new Map(S.model.nodes.map(n => [n.id, { x: n.x, y: n.y }]));
    toast(T('toast.relayout'));
    tweenNodes(from, to, 700, () => fitView());
  }

  // Mueve nodos de `from` a `to` con una transición suave y guarda al terminar
  function tweenNodes(from, to, ms, done) {
    const finish = () => {
      S.model.nodes.forEach(n => { const b = to.get(n.id); if (b) { n.x = b.x; n.y = b.y; } });
      updateGeometry(); syncEditor(); save();
      done?.();
    };
    if (reducedMotion) return finish();
    const t0 = performance.now();
    const step = now => {
      const t = clamp((now - t0) / ms, 0, 1), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      S.model.nodes.forEach(n => { const a = from.get(n.id), b = to.get(n.id); if (a && b) { n.x = a.x + (b.x - a.x) * e; n.y = a.y + (b.y - a.y) * e; } });
      updateGeometry();
      if (t < 1) requestAnimationFrame(step); else finish();
    };
    requestAnimationFrame(step);
  }

  /* ---------- alinear y distribuir (selección múltiple) ---------- */
  const ALIGN = {
    left:    { icon: '<path d="M4 3v18"/><rect x="7" y="6" width="12" height="4" rx="1"/><rect x="7" y="14" width="7" height="4" rx="1"/>' },
    hcenter: { icon: '<path d="M12 3v18"/><rect x="5" y="6" width="14" height="4" rx="1"/><rect x="8" y="14" width="8" height="4" rx="1"/>' },
    right:   { icon: '<path d="M20 3v18"/><rect x="5" y="6" width="12" height="4" rx="1"/><rect x="10" y="14" width="7" height="4" rx="1"/>' },
    top:     { icon: '<path d="M3 4h18"/><rect x="6" y="7" width="4" height="12" rx="1"/><rect x="14" y="7" width="4" height="7" rx="1"/>' },
    vcenter: { icon: '<path d="M3 12h18"/><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="8" width="4" height="8" rx="1"/>' },
    bottom:  { icon: '<path d="M3 20h18"/><rect x="6" y="5" width="4" height="12" rx="1"/><rect x="14" y="10" width="4" height="7" rx="1"/>' },
    hdist:   { icon: '<path d="M3 4v16M21 4v16"/><rect x="9" y="7" width="6" height="10" rx="1"/>' },
    vdist:   { icon: '<path d="M4 3h16M4 21h16"/><rect x="7" y="9" width="10" height="6" rx="1"/>' }
  };
  function alignNodes(how) {
    const ns = selNodes();
    if (ns.length < 2) return;
    if ((how === 'hdist' || how === 'vdist') && ns.length < 3) return toast(T('toast.distMin'));
    const w = n => R.width.get(n.id);
    const x0 = Math.min(...ns.map(n => n.x)), x1 = Math.max(...ns.map(n => n.x + w(n)));
    const y0 = Math.min(...ns.map(n => n.y)), y1 = Math.max(...ns.map(n => n.y + H));
    const to = new Map(ns.map(n => [n.id, { x: n.x, y: n.y }]));
    const set = (n, k, v) => { to.get(n.id)[k] = Math.round(v); };
    if (how === 'hdist' || how === 'vdist') {
      // Mismo hueco entre cada par de nodos, de un extremo al otro
      const hz = how === 'hdist', size = n => (hz ? w(n) : H), pos = n => (hz ? n.x : n.y);
      const sorted = [...ns].sort((a, b) => pos(a) + size(a) / 2 - pos(b) - size(b) / 2);
      const span = (hz ? x1 - x0 : y1 - y0) - sorted.reduce((s, n) => s + size(n), 0);
      const gap = Math.max(16, span / (sorted.length - 1));
      let cur = hz ? x0 : y0;
      sorted.forEach(n => { set(n, hz ? 'x' : 'y', cur); cur += size(n) + gap; });
    } else ns.forEach(n => {
      if (how === 'left') set(n, 'x', x0);
      if (how === 'right') set(n, 'x', x1 - w(n));
      if (how === 'hcenter') set(n, 'x', (x0 + x1) / 2 - w(n) / 2);
      if (how === 'top') set(n, 'y', y0);
      if (how === 'bottom') set(n, 'y', y1 - H);
      if (how === 'vcenter') set(n, 'y', (y0 + y1) / 2 - H / 2);
    });
    if (ns.every(n => to.get(n.id).x === n.x && to.get(n.id).y === n.y)) return toast(T('toast.aligned'));
    stopPlay();
    pushHistory();
    tweenNodes(new Map(ns.map(n => [n.id, { x: n.x, y: n.y }])), to, 380);
    toast(T(`align.${how}`));
  }

  /* ---------- guías al arrastrar ---------- */
  // Busca bordes o centros de otros nodos cerca del grupo que se mueve
  function guideSnap(d, dx, dy) {
    const moving = new Set(d.orig.map(o => o.n.id)), tol = 6 / S.view.k;
    const w = n => R.width.get(n.id);
    const bx0 = Math.min(...d.orig.map(o => o.x)), bx1 = Math.max(...d.orig.map(o => o.x + w(o.n)));
    const by0 = Math.min(...d.orig.map(o => o.y)), by1 = Math.max(...d.orig.map(o => o.y + H));
    const mx = [bx0, (bx0 + bx1) / 2, bx1].map(v => v + dx), my = [by0, (by0 + by1) / 2, by1].map(v => v + dy);
    let gx = null, gy = null;
    S.model.nodes.forEach(n => {
      if (moving.has(n.id)) return;
      [n.x, n.x + w(n) / 2, n.x + w(n)].forEach(c => mx.forEach(m => { const v = c - m; if (Math.abs(v) <= tol && (!gx || Math.abs(v) < Math.abs(gx.d))) gx = { d: v, at: c, n }; }));
      [n.y, n.y + H / 2, n.y + H].forEach(c => my.forEach(m => { const v = c - m; if (Math.abs(v) <= tol && (!gy || Math.abs(v) < Math.abs(gy.d))) gy = { d: v, at: c, n }; }));
    });
    const lines = [];
    if (gx) { const ty = by0 + dy + (gy ? gy.d : 0); lines.push([gx.at, Math.min(ty, gx.n.y) - 14, gx.at, Math.max(ty + by1 - by0, gx.n.y + H) + 14]); }
    if (gy) { const tx = bx0 + dx + (gx ? gx.d : 0); lines.push([Math.min(tx, gy.n.x) - 14, gy.at, Math.max(tx + bx1 - bx0, gy.n.x + w(gy.n)) + 14, gy.at]); }
    return { x: gx ? dx + gx.d : null, y: gy ? dy + gy.d : null, lines };
  }
  function drawGuides(lines) {
    $$('.guide', L.guides).forEach(x => x.remove());
    lines.forEach(([x1, y1, x2, y2]) => el('line', { class: 'guide', x1, y1, x2, y2 }, L.guides));
  }

  /* ---------- reproducir flujo ---------- */
  function togglePlay() {
    if (S.play) return stopPlay();
    if (!S.model.nodes.length) return;
    cancelConnect();
    select(null);
    const ranks = computeRanks(S.model), max = Math.max(0, ...ranks.values());
    svg.classList.remove('focusing', 'hovering');
    svg.classList.add('playing');
    $('#btn-play').classList.add('on');
    S.play = { step: 0, timer: 0 };
    const step = () => {
      const r = S.play.step;
      R.nodes.forEach((g, id) => {
        g.classList.toggle('pulse-node', ranks.get(id) === r);
        if (ranks.get(id) === r) g.classList.add('lit');
      });
      R.edges.forEach(o => {
        const on = ranks.get(o.e.from) === r;
        o.g.classList.toggle('pulse', on);
        if (on) o.g.classList.add('lit');
      });
      S.play.step++;
      const done = S.play.step > max;
      S.play.timer = setTimeout(done ? stopPlay : step, done ? 1800 : C.animation.playStepMs);
    };
    step();
  }
  function stopPlay() {
    if (!S.play) return;
    clearTimeout(S.play.timer);
    S.play = null;
    svg.classList.remove('playing');
    $('#btn-play').classList.remove('on');
    $$('.pulse, .pulse-node', svg).forEach(n => n.classList.remove('pulse', 'pulse-node'));
    applyHighlight();
  }

  /* ---------- versiones y ambientes ---------- */
  const verLabel = v => (v.kind === 'env' ? loc(C.environments?.[v.env]?.label) || v.env.toUpperCase() : T('ver.versionN', v.n));
  const verColor = v => (v.kind === 'env' ? colorVar(C.environments?.[v.env]?.color) : null) || 'var(--accent)';
  const activeVersion = () => S.model?.versions.find(v => v.id === S.model.active) || null;
  const findVersion = id => S.model.versions.find(v => v.id === id);
  // Solo lo que se dibuja: sin versiones y con posiciones redondeadas
  const snapshotOf = m => {
    const d = clone({ title: m.title, ...(m.direction ? { direction: m.direction } : {}), ...(m.routing ? { routing: m.routing } : {}), groups: m.groups, nodes: m.nodes, edges: m.edges });
    d.nodes.forEach(n => { n.x = Math.round(n.x); n.y = Math.round(n.y); });
    return d;
  };
  const prepared = v => { const d = normalize(clone(v.diagram)); ensurePositions(d); return d; };
  const canon = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(j => [j, x[j]])) : x));
  const isDirty = v => canon(snapshotOf(prepared(v))) !== canon(snapshotOf(S.model));
  const fmtDate = iso => { const d = new Date(iso); return isNaN(d) ? '' : new Intl.DateTimeFormat(I.lang, { dateStyle: 'medium', timeStyle: 'short' }).format(d); };

  // Los cambios en las versiones van al historial: ⌘Z deshace guardar, abrir o eliminar
  function versionsChanged() {
    save();
    updateUndoButtons();
    updateMeta();
    renderVersions();
  }
  function saveVersion(kind = 'version', env) {
    const vs = S.model.versions, note = S.verNote.trim();
    if (kind === 'env' && !C.environments?.[env]) return;
    pushHistory();
    let v = kind === 'env' ? vs.find(x => x.kind === 'env' && x.env === env) : null;
    const existed = !!v;
    if (!v) {
      const n = Math.max(0, ...vs.filter(x => x.kind === 'version').map(x => x.n)) + 1;
      let id = kind === 'env' ? `env-${env}` : `v${n}`;
      while (vs.some(x => x.id === id)) id += '_';
      v = kind === 'env' ? { id, kind, env } : { id, kind, n };
      vs.push(v);
    }
    if (note) v.note = note;
    v.savedAt = new Date().toISOString();
    v.diagram = snapshotOf(S.model);
    S.model.active = v.id;
    S.verNote = '';
    versionsChanged();
    if (S.compare) applyCompare();
    toast(T(existed ? 'ver.updated' : 'ver.saved', { name: verLabel(v) }));
  }
  function openVersion(id) {
    const v = findVersion(id);
    if (!v) return;
    S.sel = null;
    setModel({ ...clone(v.diagram), versions: S.model.versions, active: v.id }, { history: true });
    toast(T('ver.opened', { name: verLabel(v) }));
  }
  function deleteVersion(id) {
    const v = findVersion(id);
    if (!v) return;
    pushHistory();
    S.model.versions = S.model.versions.filter(x => x.id !== id);
    if (S.model.active === id) delete S.model.active;
    if (S.compare?.id === id) S.compare = null;
    applyCompare();
    versionsChanged();
    toast(T('ver.deleted', { name: verLabel(v) }));
  }
  function compareVersion(id) {
    S.compare = id && S.compare?.id !== id && findVersion(id) ? { id } : null;
    applyCompare();
    renderVersions();
  }

  // Diferencias entre lo guardado (a) y el lienzo (b). La posición no cuenta como cambio.
  const DIFF_FIELDS = {
    node: ['label', 'type', 'icon', 'sub', 'badge', 'group', 'color', 'cost', 'costPeriod', 'costYears', 'data', 'review', 'desc'],
    edge: ['label', 'style', 'route', 'color', 'data', 'encrypted'],
    group: ['label', 'color', 'parent']
  };
  function diffModels(a, b) {
    const val = (f, x) => (f === 'style' ? x || 'sync' : x == null ? '' : typeof x === 'object' ? JSON.stringify(x) : String(x));
    const cmp = (A, B, key, fields) => {
      const am = new Map(A.map(x => [key(x), x])), bm = new Map(B.map(x => [key(x), x]));
      return {
        added: B.filter(x => !am.has(key(x))),
        removed: A.filter(x => !bm.has(key(x))),
        changed: B.filter(x => am.has(key(x))).map(x => ({ item: x, fields: fields.filter(f => val(f, am.get(key(x))[f]) !== val(f, x[f])) })).filter(c => c.fields.length)
      };
    };
    const d = {
      nodes: cmp(a.nodes, b.nodes, n => n.id, DIFF_FIELDS.node),
      edges: cmp(a.edges, b.edges, e => `${e.from}\0${e.to}`, DIFF_FIELDS.edge),
      groups: cmp(a.groups, b.groups, g => g.id, DIFF_FIELDS.group),
      title: a.title !== b.title ? { from: a.title, to: b.title } : null
    };
    const sum = k => d.nodes[k].length + d.edges[k].length + d.groups[k].length;
    d.count = { a: sum('added'), r: sum('removed'), c: sum('changed') + (d.title ? 1 : 0) };
    return d;
  }

  // Marca en el lienzo lo nuevo (verde) y lo cambiado (amarillo); lo eliminado se dibuja como fantasma
  function applyCompare() {
    $$('.diff-tag', L.nodes).forEach(x => x.remove());
    [...R.nodes.values(), ...[...R.edges.values()].map(r => r.g), ...[...R.groups.values()].map(r => r.g)].forEach(g => g.classList.remove('diff-add', 'diff-chg'));
    const v = S.compare && findVersion(S.compare.id);
    if (S.compare && !v) S.compare = null;
    svg.classList.toggle('comparing', !!v);
    $('#compare-bar').hidden = !v;
    if (!v) { L.ghosts.textContent = ''; return; }
    const base = prepared(v), d = diffModels(base, S.model);
    Object.assign(S.compare, { base, diff: d });
    const tag = (g, ch, color) => {
      const t = el('g', { class: 'diff-tag', style: `--dc:${color}` }, g);
      el('circle', { cx: 4, cy: 4, r: 9 }, t);
      el('text', { x: 4, y: 8, 'text-anchor': 'middle' }, t).textContent = ch;
    };
    d.nodes.added.forEach(n => { const g = R.nodes.get(n.id); if (g) { g.classList.add('diff-add'); tag(g, '+', 'var(--p-menta)'); } });
    d.nodes.changed.forEach(c => { const g = R.nodes.get(c.item.id); if (g) { g.classList.add('diff-chg'); tag(g, '~', 'var(--p-limon)'); } });
    d.edges.added.forEach(e => R.edges.get(e.id)?.g.classList.add('diff-add'));
    d.edges.changed.forEach(c => R.edges.get(c.item.id)?.g.classList.add('diff-chg'));
    d.groups.added.forEach(g => R.groups.get(g.id)?.g.classList.add('diff-add'));
    d.groups.changed.forEach(c => R.groups.get(c.item.id)?.g.classList.add('diff-chg'));
    drawGhosts();
    const bar = $('#compare-bar');
    bar.style.setProperty('--c', verColor(v));
    $('#compare-text').innerHTML = `${T('ver.comparing', { name: esc(verLabel(v)) })} · ${d.count.a + d.count.r + d.count.c ? esc(T('ver.summary', d.count)) : esc(T('ver.same'))}`;
  }
  function drawGhosts() {
    L.ghosts.textContent = '';
    const { base, diff: d } = S.compare;
    const cur = new Map(S.model.nodes.map(n => [n.id, n])), old = new Map(base.nodes.map(n => [n.id, n]));
    const rect = id => { const n = cur.get(id) || old.get(id); return n && { x: n.x, y: n.y, w: R.width.get(id) || nodeWidth(n), h: H }; };
    d.edges.removed.forEach(e => {
      const a = rect(e.from), b = rect(e.to);
      if (a && b && e.from !== e.to) el('path', { class: 'ghost-edge', d: routeOf(e) === 'elbow' ? elbowPath(a, b, 0, []) : curvePath(a, b, 0) }, L.ghosts);
    });
    d.nodes.removed.forEach(n => {
      const w = nodeWidth(n), g = el('g', { class: 'ghost', transform: `translate(${n.x} ${n.y})` }, L.ghosts);
      el('rect', { class: 'ghost-card', width: w, height: H, rx: C.node.radius }, g);
      el('text', { x: 18, y: H / 2 + 5 }, g).textContent = fitText(`− ${n.label}`, FONT.label, w - 30);
    });
  }

  function renderVersions() {
    const box = $('#versions');
    if (!box || !S.model) return;
    const vs = S.model.versions, envs = Object.entries(C.environments || {});
    const nextN = Math.max(0, ...vs.filter(v => v.kind === 'version').map(v => v.n)) + 1;
    const focused = document.activeElement?.id === 'ver-note';
    const card = v => {
      const on = v.id === S.model.active, cmp = S.compare?.id === v.id, dirty = on && isDirty(v);
      return `<div class="ver${on ? ' on' : ''}${cmp ? ' cmp' : ''}" data-id="${esc(v.id)}" style="--c:${verColor(v)}">
        <div class="ver-head"><span class="dot"></span><b>${esc(verLabel(v))}</b>${on ? `<em${dirty ? ' class="dirty"' : ''}>${esc(T(dirty ? 'ver.dirty' : 'ver.current'))}</em>` : ''}</div>
        <div class="ver-meta">${esc([fmtDate(v.savedAt), T('meta.nodes', v.diagram.nodes?.length || 0)].filter(Boolean).join(' · '))}</div>
        ${v.note ? `<div class="ver-note">${esc(v.note)}</div>` : ''}
        ${cmp && S.compare.diff ? diffList(S.compare.diff) : ''}
        <div class="ver-actions">
          <button class="btn small" data-ver="open" title="${esc(T('ver.openTip'))}">${T('ver.open')}</button>
          <button class="btn small${cmp ? ' on' : ''}" data-ver="compare" title="${esc(T('ver.compareTip'))}">${T(cmp ? 'ver.stop' : 'ver.compare')}</button>
          ${v.kind === 'env' ? `<button class="btn small" data-ver="update" title="${esc(T('ver.saveHereTip'))}">${T('ver.saveHere')}</button>` : ''}
          <button class="btn small danger icon" data-ver="delete" title="${esc(T('ver.delete'))}" aria-label="${esc(T('ver.delete'))}">${ICON.x}</button>
        </div>
      </div>`;
    };
    const section = (title, list) => (list.length ? `<div class="cat">${esc(title)}</div>${list.map(card).join('')}` : '');
    const envList = envs.flatMap(([k]) => vs.filter(v => v.kind === 'env' && v.env === k)).concat(vs.filter(v => v.kind === 'env' && !C.environments?.[v.env]));
    box.innerHTML = `<div class="ver-save">
        <div class="cat">${esc(T('ver.saveAs'))}</div>
        <button class="btn" data-save="version">+ ${esc(T('ver.versionN', nextN))}</button>
        ${envs.length ? `<div class="ver-envs">${envs.map(([k, e]) => {
          const has = vs.some(v => v.kind === 'env' && v.env === k);
          return `<button class="btn small env-btn" data-save="env" data-env="${esc(k)}" style="--c:${colorVar(e.color) || 'var(--accent)'}" title="${esc(T(has ? 'ver.updateEnv' : 'ver.saveEnv', { name: loc(e.label) || k }))}"><span class="dot"></span>${esc(loc(e.short) || k.toUpperCase())}</button>`;
        }).join('')}</div>` : ''}
        <input class="search" id="ver-note" style="padding-left:10px" value="${esc(S.verNote)}" placeholder="${esc(T('ver.note.ph'))}" aria-label="${esc(T('ver.note'))}" autocomplete="off">
      </div>
      <div class="ver-list">${section(T('ver.envs'), envList)}${section(T('ver.versions'), vs.filter(v => v.kind === 'version').sort((a, b) => b.n - a.n))}</div>
      ${vs.length ? '' : `<p class="empty-list">${esc(T('ver.empty'))}</p>`}`;
    if (focused) { const n = $('#ver-note'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
  }
  function diffList(d) {
    if (!(d.count.a + d.count.r + d.count.c)) return `<p class="ver-sum">${esc(T('ver.same'))}</p>`;
    const FIELD = { label: 'insp.name', sub: 'insp.detail', type: 'insp.type', icon: 'insp.icon', group: 'insp.group', color: 'insp.color', badge: 'field.badge',
      cost: 'cost.label', costPeriod: 'cost.period', costYears: 'cost.yearsAria', desc: 'insp.desc', style: 'insp.style', parent: 'insp.parent',
      data: 'data.label', encrypted: 'enc.label', route: 'insp.route', review: 'rev.label' };
    const fields = (fs, kind) => fs.map(f => T(kind === 'edge' && f === 'label' ? 'insp.label' : FIELD[f] || f).toLowerCase()).join(', ');
    const names = new Map([...S.compare.base.nodes, ...S.model.nodes].map(n => [n.id, n.label]));
    const edgeName = e => `${names.get(e.from) || e.from} → ${names.get(e.to) || e.to}`;
    const rows = [];
    if (d.title) rows.push(['chg', T('field.title'), d.title.to]);
    d.nodes.added.forEach(n => rows.push(['add', n.label, '', n.id]));
    d.nodes.changed.forEach(c => rows.push(['chg', c.item.label, fields(c.fields), c.item.id]));
    d.nodes.removed.forEach(n => rows.push(['del', n.label]));
    d.groups.added.forEach(g => rows.push(['add', g.label, T('ver.group')]));
    d.groups.changed.forEach(c => rows.push(['chg', c.item.label, `${T('ver.group')}: ${fields(c.fields)}`]));
    d.groups.removed.forEach(g => rows.push(['del', g.label, T('ver.group')]));
    d.edges.added.forEach(e => rows.push(['add', edgeName(e), T('ver.edge')]));
    d.edges.changed.forEach(c => rows.push(['chg', edgeName(c.item), `${T('ver.edge')}: ${fields(c.fields, 'edge')}`]));
    d.edges.removed.forEach(e => rows.push(['del', edgeName(e), T('ver.edge')]));
    return `<p class="ver-sum">${esc(T('ver.summary', d.count))}</p><ul class="diff-list">${rows.map(([k, name, extra, id]) =>
      `<li class="d-${k}"${id ? ` data-goto="${esc(id)}"` : ''}><i>${k === 'add' ? '+' : k === 'del' ? '−' : '~'}</i><span title="${esc(name)}">${esc(name)}</span>${extra ? `<em title="${esc(extra)}">${esc(extra)}</em>` : ''}</li>`).join('')}</ul>`;
  }

  const versionsBox = $('#versions');
  versionsBox.addEventListener('input', ev => { if (ev.target.id === 'ver-note') S.verNote = ev.target.value; });
  versionsBox.addEventListener('keydown', ev => { if (ev.target.id === 'ver-note' && ev.key === 'Enter') saveVersion('version'); });
  versionsBox.addEventListener('click', ev => {
    const goto = ev.target.closest('[data-goto]');
    if (goto) return select({ kind: 'node', id: goto.dataset.goto }, { center: true });
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.save) return saveVersion(b.dataset.save, b.dataset.env);
    const id = b.closest('.ver')?.dataset.id;
    if (b.dataset.ver === 'open') openVersion(id);
    else if (b.dataset.ver === 'compare') compareVersion(id);
    else if (b.dataset.ver === 'update') { const v = findVersion(id); if (v) saveVersion('env', v.env); }
    else if (b.dataset.ver === 'delete') deleteVersion(id);
  });
  $('#compare-exit').addEventListener('click', () => compareVersion(null));

  /* ---------- inspector ---------- */
  const swatches = cur => `<div class="swatches">
      <button class="sw auto${!cur ? ' on' : ''}" data-color="" title="${esc(T('insp.auto'))}"></button>
      ${paletteKeys().map(k => `<button class="sw${cur === k ? ' on' : ''}" data-color="${k}" title="${esc(I.colorName(k))}" style="--c:var(--p-${k})"></button>`).join('')}
    </div>`;
  const typeOptions = cur => categories().map(cat => {
    const ts = Object.entries(C.types).filter(([, t]) => (t.category || 'Otros') === cat);
    return ts.length ? `<optgroup label="${esc(I.category(cat))}">${ts.map(([k, t]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${esc(loc(t.label))}</option>`).join('')}</optgroup>` : '';
  }).join('');
  /* ---------- buscador de iconos con autocompletado ---------- */
  // Todos los iconos oficiales en una lista plana, con el texto donde se busca ya preparado
  let iconIndex = null;
  const allIcons = () => iconIndex || (iconIndex = Object.entries(ICONS).flatMap(([p, set]) => Object.entries(set.items).map(([k, it]) => ({
    ref: `${p}/${k}`, label: it.label, provider: set.label, category: it.category, src: set.files[it.file],
    text: fold(`${it.label} ${k} ${set.label} ${set.short || ''} ${it.category}`), name: fold(it.label)
  }))));
  // Primero los que empiezan por lo escrito, luego los que tienen una palabra que empieza así, luego el resto
  function searchIcons(q, max = 40) {
    const words = fold(q).trim().split(/\s+/).filter(Boolean);
    if (!words.length) return allIcons().slice(0, max);
    const rank = it => (it.name.startsWith(words[0]) ? 0 : it.name.split(/[\s/()-]+/).some(w => w.startsWith(words[0])) ? 1 : 2);
    return allIcons().filter(it => words.every(w => it.text.includes(w)))
      .sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label)).slice(0, max);
  }
  const iconPicker = n => {
    const cur = iconInfo(n.icon);
    return `<div class="field">${T('insp.icon')}
      <div class="ipick">
        <span class="ipick-cur${cur ? ' logo' : ''}" style="--c:${nodeColor(n)}">${nodeIconHtml(n)}</span>
        <input id="icon-q" class="ipick-in" value="${esc(cur ? `${cur.label} · ${cur.providerLabel}` : '')}" placeholder="${esc(T('icon.ph'))}" autocomplete="off" spellcheck="false"
          role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="icon-list" aria-label="${esc(T('insp.icon'))}">
        ${cur ? `<button class="ipick-clear" data-icon-clear title="${esc(T('insp.ownIcon'))}" aria-label="${esc(T('insp.ownIcon'))}">${ICON.x}</button>` : ''}
      </div>
      <div class="ipick-list" id="icon-list" role="listbox" hidden></div>
    </div>`;
  };
  function showIconList(q) {
    const list = $('#icon-list'), box = $('#icon-q');
    if (!list) return;
    const found = searchIcons(q);
    list.innerHTML = found.map((it, i) => `<div class="ipick-opt${i ? '' : ' on'}" role="option" data-ref="${esc(it.ref)}"><i><img src="${it.src}" alt=""></i><span>${esc(it.label)}</span><em>${esc(it.provider)} · ${esc(I.category(it.category))}</em></div>`).join('')
      || `<p class="ipick-none">${esc(T('icon.none'))}</p>`;
    list.hidden = false;
    list.scrollTop = 0;
    box.setAttribute('aria-expanded', 'true');
  }
  function hideIconList() {
    const list = $('#icon-list');
    if (list) list.hidden = true;
    $('#icon-q')?.setAttribute('aria-expanded', 'false');
  }
  function pickIcon(ref) {
    const t = selTarget();
    if (!t || Array.isArray(t)) return;
    pushHistory();
    if (ref && iconInfo(ref)) { t.icon = ref; t.type = iconInfo(ref).type; } else delete t.icon;
    changed(true);
    renderInspector();
  }
  const head = (c, iconHtml, kicker, title, isLogo) => `<div class="insp-head" style="--c:${c}">
      ${iconHtml ? `<span class="insp-icon${isLogo ? ' logo' : ''}">${iconHtml}</span>` : ''}
      <div class="insp-hgroup"><div class="insp-kicker">${esc(kicker)}</div><div class="insp-title">${esc(title)}</div></div>
      <button class="icon-btn" data-act="close" aria-label="${esc(T('insp.close'))}">${ICON.x}</button></div>`;

  const costHint = n => {
    if (!hasCost(n)) return T('cost.hint');
    const mo = perMonth(n);
    return `≈ ${money(round2(mo))}${T('cost.mo')} · ${money(round2(mo * 12))}${T('cost.yr')}`;
  };
  const costField = n => {
    const p = n.costPeriod === 'multi' ? 'multi' : PERIODS[n.costPeriod] ? n.costPeriod : '';
    return `<div class="field">${T('cost.label')} (${esc(COST.currency)})
      <div class="cost-row">
        <span class="money"><input data-field="cost" type="number" min="0" step="any" inputmode="decimal" placeholder="0.00" value="${hasCost(n) ? esc(n.cost) : ''}" aria-label="${esc(T('cost.label'))}"></span>
        <select data-field="costPeriod" aria-label="${esc(T('cost.period'))}">${Object.entries(PERIODS).map(([k, v]) => `<option value="${k === 'month' ? '' : k}"${(k === 'month' ? '' : k) === p ? ' selected' : ''}>${T(v.label)}</option>`).join('')}</select>
        ${p === 'multi' ? `<span class="years" data-unit="${esc(T('cost.unit'))}"><input data-field="costYears" type="number" min="1" step="1" value="${yearsOf(n)}" aria-label="${esc(T('cost.yearsAria'))}"></span>` : ''}
      </div>
      <span class="cost-hint">${costHint(n)}</span>
    </div>`;
  };

  // Chips de clasificación: encendido si todos los elegidos lo tienen; a medias si solo algunos
  const dataField = (items, edge) => {
    const cls = Object.entries(DATA), list = [].concat(items);
    if (!cls.length) return '';
    const on = cls.filter(([k]) => list.every(x => x.data?.includes(k)));
    return `<div class="field">${T(edge ? 'data.edge' : 'data.label')}<div class="dchips">${cls.map(([k, c]) => {
      const n = list.filter(x => x.data?.includes(k)).length;
      return `<button class="dchip${n === list.length ? ' on' : n ? ' some' : ''}" data-dclass="${esc(k)}" style="--c:${colorVar(c.color) || 'var(--accent)'}" title="${esc(loc(c.label) || k)}">${esc(loc(c.short) || k.toUpperCase())}</button>`;
    }).join('')}</div><span class="cost-hint">${esc(on.length ? on.map(([, c]) => loc(c.label)).join(' · ') : T(edge ? 'data.noneEdge' : 'data.none'))}</span></div>`;
  };
  const encField = e => {
    const cur = e.encrypted === true ? 'yes' : e.encrypted === false ? 'no' : '';
    const byId = id => S.model.nodes.find(n => n.id === id);
    return `<div class="field">${T('enc.label')}<div class="seg">${[['', 'enc.unset'], ['yes', 'enc.yes'], ['no', 'enc.no']].map(([k, l]) =>
      `<button data-enc="${k}" class="enc-${k || 'unset'}${cur === k ? ' on' : ''}">${T(l)}</button>`).join('')}</div>${isInsecure(e, byId) ? `<span class="enc-warn">⚠ ${T('enc.warn')}</span>` : ''}</div>`;
  };

  // Observación de revisión: la levanta a mano quien revisa (qué, quién, cuándo y para cuándo)
  const reviewField = n => {
    const r = n.review;
    if (!r) return `<div class="field">${T('rev.label')}<button class="btn rev-add" data-rev="add">⚑ ${T('rev.add')}</button></div>`;
    const st = reviewState(r);
    return `<div class="field rev-box" style="--c:${REV_COLOR[st]}">${T('rev.label')}
      <div class="rev-head"><span class="rev-pill">${esc(T(`rev.tag.${st}`))}</span><em>${esc(reviewHint(r))}</em></div>
      <label>${T('rev.note')}<textarea data-rev-field="note" rows="2" placeholder="${esc(T('rev.note.ph'))}">${esc(r.note || '')}</textarea></label>
      <label>${T('rev.by')}<input data-rev-field="by" value="${esc(r.by || '')}" placeholder="${esc(T('rev.by.ph'))}" autocomplete="off"></label>
      <label>${T('rev.raised')}<input type="date" data-rev-field="raised" value="${esc(r.raised || '')}"></label>
      <label>${T('rev.due')}<input type="date" data-rev-field="due" value="${esc(r.due || '')}"></label>
      <div class="insp-actions">
        <button class="btn small" data-rev="toggle">${T(r.status === 'resolved' ? 'rev.reopen' : 'rev.resolve')}</button>
        <button class="btn small danger" data-rev="remove">${T('rev.remove')}</button>
      </div>
    </div>`;
  };

  function renderInspector() {
    const box = $('#inspector'), t = selTarget(), m = S.model;
    if (!t) { box.hidden = true; box.innerHTML = ''; return; }
    const wasHidden = box.hidden;
    const kind = S.sel.kind;
    const nm = id => m.nodes.find(x => x.id === id);
    let html = '';

    if (kind === 'multi') {
      const tool = k => `<button class="tool" data-align="${k}" title="${esc(T(`align.${k}`))}" aria-label="${esc(T(`align.${k}`))}"><svg viewBox="0 0 24 24">${ALIGN[k].icon}</svg></button>`;
      const groupsOf = new Set(t.map(n => n.group || ''));
      const colorsOf = new Set(t.map(n => n.color || ''));
      const g1 = groupsOf.size === 1 ? [...groupsOf][0] : null;
      const priced = t.filter(hasCost);
      html = head('var(--accent)', '', T('insp.selection'), T('insp.count', t.length)) + `
        <div class="field">${T('insp.align')}<div class="tools">${['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom'].map(tool).join('')}</div></div>
        <div class="field">${T('insp.distribute')}<div class="tools two">${['hdist', 'vdist'].map(k => tool(k).replace('</svg>', `</svg>${T(k === 'hdist' ? 'insp.horizontal' : 'insp.vertical')}`)).join('')}</div></div>
        <label>${T('insp.group')}<select data-field="group">${g1 == null ? `<option value="__mixed" selected>${T('insp.mixed')}</option>` : ''}<option value=""${g1 === '' ? ' selected' : ''}>${T('insp.none')}</option>${m.groups.map(g => `<option value="${esc(g.id)}"${g.id === g1 ? ' selected' : ''}>${esc(g.label)}</option>`).join('')}<option value="__new">${T('insp.newGroup')}</option></select></label>
        <div class="field">${T('insp.color')}${swatches(colorsOf.size === 1 ? [...colorsOf][0] : '__mixed')}</div>
        ${dataField(t)}
        ${priced.length ? `<p class="cost-sum">${T('insp.selCost')} <b>≈ ${money(round2(monthlyTotal(t)))}${T('cost.mo')}</b><span>${T('insp.withCost', { a: priced.length, b: t.length })}</span></p>` : ''}
        <p class="note">${T('insp.multiNote')}</p>
        <div class="insp-actions">
          <button class="btn" data-act="dup">${T('insp.duplicate')}</button>
          <button class="btn danger" data-act="delete">${T('insp.deleteN', t.length)}</button>
        </div>`;
    } else if (kind === 'node') {
      const ty = typeOf(t);
      const outs = m.edges.filter(e => e.from === t.id), ins = m.edges.filter(e => e.to === t.id);
      const conn = (e, other) => { const o = nm(other); return `<button class="conn" data-goto="${esc(other)}" style="--c:${nodeColor(o)}"><span class="dot"></span>${esc(o.label)}${e.label ? `<em>${esc(e.label)}</em>` : ''}</button>`; };
      const modes = ['direct', 'down', 'up', 'both'].map(k => [k, T(`reach.${k}`)]);
      const off = iconInfo(t.icon);
      html = head(nodeColor(t), nodeIconHtml(t), off ? `${off.providerLabel} · ${off.label}` : `${I.category(ty.category || 'Otros')} · ${loc(ty.label)}`, t.label, !!off) + `
        <label>${T('insp.name')}<input data-field="label" value="${esc(t.label)}"></label>
        <label>${T('insp.detail')}<input data-field="sub" value="${esc(t.sub || '')}" placeholder="${esc(T('insp.detail.ph'))}"></label>
        <div class="row2">
          <label>${T('insp.type')}<select data-field="type">${typeOptions(t.type)}</select></label>
          <label>${T('insp.group')}<select data-field="group"><option value="">${T('insp.none')}</option>${m.groups.map(g => `<option value="${esc(g.id)}"${g.id === t.group ? ' selected' : ''}>${esc(g.label)}</option>`).join('')}<option value="__new">${T('insp.newGroup')}</option></select></label>
        </div>
        ${Object.keys(ICONS).length ? iconPicker(t) : ''}
        <div class="field">${T('insp.color')}${swatches(t.color)}</div>
        ${costField(t)}
        ${dataField(t)}
        ${reviewField(t)}
        <label>${T('insp.desc')}<textarea data-field="desc" rows="3" placeholder="${esc(T('insp.desc.ph'))}">${esc(t.desc || '')}</textarea></label>
        <div class="field">${T('insp.reach')}<div class="seg">${modes.map(([k, l]) => `<button data-reach="${k}" class="${S.reach === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        ${ins.length || outs.length ? `<div class="conns">
          ${ins.length ? `<div class="conn-title">${T('insp.receives')} · ${ins.length}</div>${ins.map(e => conn(e, e.from)).join('')}` : ''}
          ${outs.length ? `<div class="conn-title">${T('insp.sends')} · ${outs.length}</div>${outs.map(e => conn(e, e.to)).join('')}` : ''}
        </div>` : ''}
        <div class="insp-actions">
          <button class="btn" data-act="connect">${ICON.link}${T('insp.connect')}</button>
          <button class="btn" data-act="dup">${T('insp.duplicate')}</button>
          <button class="btn danger" data-act="delete">${T('insp.delete')}</button>
        </div>`;
    } else if (kind === 'edge') {
      const a = nm(t.from), b = nm(t.to);
      html = head(colorVar(t.color) || nodeColor(a), '', T('insp.edge'), `${a.label} → ${b.label}`) + `
        <label>${T('insp.label')}<input data-field="label" value="${esc(t.label || '')}" placeholder="${esc(T('insp.label.ph'))}"></label>
        <label>${T('insp.style')}<select data-field="style">${Object.entries(C.edgeStyles).map(([k, v]) => `<option value="${k}"${k === (C.edgeStyles[t.style] ? t.style : 'sync') ? ' selected' : ''}>${esc(loc(v.label))}</option>`).join('')}</select></label>
        <label>${T('insp.route')}<select data-field="route">${[['', T('route.default', { name: T(`route.${S.model.routing || 'curved'}`) })], ['curved', T('route.curved')], ['elbow', T('route.elbow')]]
          .map(([k, l]) => `<option value="${k}"${(t.route || '') === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
        ${encField(t)}
        ${dataField(t, true)}
        <div class="field">${T('insp.color')}${swatches(t.color)}</div>
        <div class="conns"><div class="conn-title">${T('insp.ends')}</div>
          <button class="conn" data-goto="${esc(a.id)}" style="--c:${nodeColor(a)}"><span class="dot"></span>${esc(a.label)}<em>${T('insp.source')}</em></button>
          <button class="conn" data-goto="${esc(b.id)}" style="--c:${nodeColor(b)}"><span class="dot"></span>${esc(b.label)}<em>${T('insp.target')}</em></button>
        </div>
        <div class="insp-actions">
          <button class="btn" data-act="reverse">${ICON.swap}${T('insp.reverse')}</button>
          <button class="btn danger" data-act="delete">${T('insp.delete')}</button>
        </div>`;
    } else {
      const blocked = new Set([t.id]);
      let grew = true;
      while (grew) { grew = false; m.groups.forEach(g => { if (g.parent && blocked.has(g.parent) && !blocked.has(g.id)) { blocked.add(g.id); grew = true; } }); }
      const count = m.nodes.filter(n => inGroup(n, t.id)).length;
      html = head(colorVar(t.color) || 'var(--muted)', '', T('insp.group'), t.label) + `
        <p class="note">${T('insp.groupNote', count)}</p>
        <label>${T('insp.name')}<input data-field="label" value="${esc(t.label)}"></label>
        <label>${T('insp.parent')}<select data-field="parent"><option value="">${T('insp.none')}</option>${m.groups.filter(g => !blocked.has(g.id)).map(g => `<option value="${esc(g.id)}"${g.id === t.parent ? ' selected' : ''}>${esc(g.label)}</option>`).join('')}</select></label>
        <div class="field">${T('insp.color')}${swatches(t.color)}</div>
        <div class="insp-actions"><button class="btn danger" data-act="delete">${T('insp.deleteGroup')}</button></div>`;
    }

    box.innerHTML = html;
    box.hidden = false;
    if (!wasHidden) box.style.animation = 'none';
    else box.style.animation = '';
  }

  function onField(f) {
    const t = selTarget();
    if (!t) return;
    const k = f.dataset.field, isSelect = f.tagName === 'SELECT';
    const list = Array.isArray(t) ? t : [t];
    let v = f.value;
    if (v === '__mixed') return;
    if (k === 'cost' || k === 'costYears') {
      // Números: vacío o no válido = quitar el valor
      const num = v.trim() === '' ? NaN : +v;
      v = Number.isFinite(num) && num >= 0 ? (k === 'costYears' ? Math.max(1, Math.round(num)) : num) : '';
    }
    if (isSelect) pushHistory(); else markEdit();
    if (k === 'group' && v === '__new') {
      const name = prompt(T('prompt.newGroup'), T('prompt.newGroup.def'));
      const parents = new Set(list.map(n => n.group || ''));
      if (!name || !name.trim()) { S.history.pop(); updateUndoButtons(); renderInspector(); return; }
      const id = uniqueId('grupo-'), parent = parents.size === 1 ? [...parents][0] : '';
      const keys = paletteKeys();
      S.model.groups.push({ id, label: name.trim(), color: keys[S.model.groups.length % keys.length], ...(parent ? { parent } : {}) });
      v = id;
    }
    list.forEach(x => {
      if (v === '' && k !== 'label') delete x[k]; else x[k] = v;
      // Un icono oficial trae su tipo, que da el color pastel del borde
      if (k === 'icon' && iconInfo(v)) x.type = iconInfo(v).type;
      if (k === 'costPeriod' && v !== 'multi') delete x.costYears;
    });
    changed(k !== 'desc');
    if (k.startsWith('cost') && !isSelect) $('#inspector .cost-hint').textContent = costHint(list[0]);
    if (isSelect) renderInspector();
    else if (k === 'label') $('#inspector .insp-title').textContent = S.sel.kind === 'edge' ? $('#inspector .insp-title').textContent : v;
  }

  const inspector = $('#inspector');
  inspector.addEventListener('focusin', ev => { if (ev.target.matches('input[data-field], textarea[data-field], [data-rev-field]')) beginEdit(); });
  // Buscador de iconos: escribir filtra, ↑ ↓ eligen, Enter aplica, Esc cierra
  inspector.addEventListener('focusin', ev => { if (ev.target.id === 'icon-q') { ev.target.select(); showIconList(''); } });
  // Al salir sin elegir, el campo vuelve a mostrar el icono actual
  inspector.addEventListener('focusout', ev => {
    if (ev.target.id !== 'icon-q') return;
    hideIconList();
    const t = selTarget(), cur = t && !Array.isArray(t) && iconInfo(t.icon);
    ev.target.value = cur ? `${cur.label} · ${cur.providerLabel}` : '';
  });
  inspector.addEventListener('input', ev => { if (ev.target.id === 'icon-q') showIconList(ev.target.value); });
  inspector.addEventListener('keydown', ev => {
    if (ev.target.id !== 'icon-q') return;
    const opts = $$('.ipick-opt', inspector), i = opts.findIndex(o => o.classList.contains('on'));
    const move = d => {
      if (!opts.length) return;
      const j = (i + d + opts.length) % opts.length;
      opts.forEach((o, k) => o.classList.toggle('on', k === j));
      opts[j].scrollIntoView({ block: 'nearest' });
    };
    if (ev.key === 'ArrowDown') { ev.preventDefault(); if ($('#icon-list').hidden) showIconList(ev.target.value); else move(1); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); move(-1); }
    else if (ev.key === 'Enter') { ev.preventDefault(); if (opts[i]) pickIcon(opts[i].dataset.ref); }
    else if (ev.key === 'Escape') { hideIconList(); }
  });
  // mousedown y no click: así se elige antes de que el campo pierda el foco
  inspector.addEventListener('mousedown', ev => {
    const o = ev.target.closest('.ipick-opt');
    if (o) { ev.preventDefault(); pickIcon(o.dataset.ref); }
  });
  inspector.addEventListener('input', ev => {
    const f = ev.target, n = selTarget();
    if (!f.matches('[data-rev-field]') || !n?.review) return;
    markEdit();
    const k = f.dataset.revField, v = f.value.trim();
    if (v && (k === 'note' || k === 'by' || isDay(v))) n.review[k] = k === 'note' ? f.value : v; else delete n.review[k];
    if (k === 'by' && v) store.set('reviewer', v);
    changed(true);
    const st = reviewState(n.review), box = $('#inspector .rev-box');
    box.style.setProperty('--c', REV_COLOR[st]);
    box.querySelector('.rev-pill').textContent = T(`rev.tag.${st}`);
    box.querySelector('.rev-head em').textContent = reviewHint(n.review);
  });
  inspector.addEventListener('focusout', endEdit);
  inspector.addEventListener('input', ev => { if (ev.target.matches('input[data-field], textarea[data-field]')) onField(ev.target); });
  inspector.addEventListener('change', ev => { if (ev.target.matches('select[data-field]')) onField(ev.target); });
  inspector.addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    const t = selTarget();
    if (b.dataset.color != null && t) {
      pushHistory();
      (Array.isArray(t) ? t : [t]).forEach(x => { if (b.dataset.color) x.color = b.dataset.color; else delete x.color; });
      changed(true); renderInspector();
    } else if (b.dataset.iconClear != null) {
      pickIcon(null);
    } else if (b.dataset.rev && t && !Array.isArray(t)) {
      pushHistory();
      if (b.dataset.rev === 'add') {
        t.review = { status: 'open', raised: today(), ...(store.get('reviewer', '') ? { by: store.get('reviewer', '') } : {}) };
        toast(T('toast.revAdded'));
      } else if (b.dataset.rev === 'toggle') {
        if (t.review.status === 'resolved') { t.review.status = 'open'; delete t.review.closed; } else { t.review.status = 'resolved'; t.review.closed = today(); toast(T('toast.revResolved')); }
      } else if (b.dataset.rev === 'remove') { delete t.review; toast(T('toast.revRemoved')); }
      changed(true); renderInspector();
      if (b.dataset.rev === 'add') $('#inspector [data-rev-field="note"]')?.focus();
    } else if (b.dataset.dclass && t) {
      const list = [].concat(t), k = b.dataset.dclass, all = list.every(x => x.data?.includes(k));
      pushHistory();
      list.forEach(x => { const d = cleanData([...(x.data || []).filter(j => j !== k), ...(all ? [] : [k])]); if (d.length) x.data = d; else delete x.data; });
      changed(true); renderInspector();
    } else if (b.dataset.enc != null && t) {
      pushHistory();
      if (b.dataset.enc) t.encrypted = b.dataset.enc === 'yes'; else delete t.encrypted;
      changed(true); renderInspector();
    } else if (b.dataset.align) {
      alignNodes(b.dataset.align);
    } else if (b.dataset.reach) {
      S.reach = b.dataset.reach; store.set('reach', S.reach);
      $$('.seg button', inspector).forEach(x => x.classList.toggle('on', x === b));
      applyHighlight();
    } else if (b.dataset.goto) {
      select({ kind: 'node', id: b.dataset.goto }, { center: true });
    } else switch (b.dataset.act) {
      case 'close': select(null); break;
      case 'connect': startConnect(t.id); break;
      case 'dup': duplicateSelection(); break;
      case 'delete': deleteSelection(); break;
      case 'reverse': pushHistory(); [t.from, t.to] = [t.to, t.from]; changed(true); renderInspector(); break;
    }
  });

  /* ---------- barra lateral ---------- */
  const chip = (attrs, color, iconHtml, label, isLogo) =>
    `<button class="chip" draggable="true" ${attrs} style="--c:${color}" title="${esc(label)}"><i${isLogo ? ' class="logo"' : ''}>${iconHtml}</i><span>${esc(label)}</span></button>`;

  // Lista desplegable de proveedores: el panel solo muestra los componentes del elegido
  function renderProviders() {
    const sel = $('#provider');
    const list = [['generic', T('side.generic', Object.keys(C.types).length)],
      ...Object.entries(ICONS).map(([k, s]) => [k, `${s.label} (${Object.keys(s.items).length + (C.presets?.[k]?.items.length || 0)})`])];
    if (!ICONS[S.provider]) S.provider = 'generic';
    $('#provider-wrap').hidden = list.length < 2;
    sel.innerHTML = list.map(([k, l]) => `<option value="${k}"${S.provider === k ? ' selected' : ''}>${esc(l)}</option>`).join('');
  }
  $('#provider').addEventListener('change', ev => {
    S.provider = ev.target.value;
    store.set('provider', S.provider);
    renderPalette();
    $('.pane[data-pane="components"]').scrollTop = 0;
  });

  function renderPalette() {
    const q = fold($('#search').value.trim());
    const set = ICONS[S.provider];
    if (set) {
      const groups = new Map();
      // Atajos sin icono oficial (config.js › presets), arriba de todo
      const pre = C.presets?.[S.provider];
      const preItems = (pre?.items || []).map(p => ({ ...p, sub: loc(p.sub) })).filter(p => !q || fold(`${p.label} ${p.sub || ''} ${p.keywords || ''}`).includes(q));
      if (preItems.length) groups.set(loc(pre.title), preItems.map(p => [null, p]));
      Object.entries(set.items)
        .filter(([k, it]) => !q || fold(`${it.label} ${k} ${it.category} ${I.category(it.category)}`).includes(q))
        .forEach(([k, it]) => { if (!groups.has(it.category)) groups.set(it.category, []); groups.get(it.category).push([k, it]); });
      $('#palette-list').innerHTML = [...groups].map(([cat, items]) => `<div class="cat">${esc(I.category(cat))}</div><div class="chips">${items.map(([k, it]) => k == null
        ? chip(`data-type="${esc(it.type)}" data-label="${esc(it.label)}" data-sub="${esc(it.sub || '')}"`, colorVar(it.color || (C.types[it.type] || C.types.generic).color), typeIcon(it.type), it.label)
        : chip(`data-type="${it.type}" data-icon="${S.provider}/${k}" data-label="${esc(it.label)}"`, colorVar((C.types[it.type] || C.types.generic).color), `<img src="${set.files[it.file]}" alt="">`, it.label, true)).join('')}</div>`).join('')
        || `<p class="empty-list">${T('side.none')}</p>`;
      return;
    }
    const html = categories().map(cat => {
      const items = Object.entries(C.types).filter(([k, t]) => (t.category || 'Otros') === cat && (!q || fold(`${typeof t.label === 'object' ? Object.values(t.label).join(' ') : t.label} ${k} ${t.keywords || ''} ${cat} ${I.category(cat)}`).includes(q)));
      if (!items.length) return '';
      return `<div class="cat">${esc(I.category(cat))}</div><div class="chips">${items.map(([k, t]) =>
        chip(`data-type="${k}"`, colorVar(t.color), typeIcon(k), loc(t.label))).join('')}</div>`;
    }).join('');
    $('#palette-list').innerHTML = html || `<p class="empty-list">${T('side.none.types')}</p>`;
  }
  $('#search').addEventListener('input', renderPalette);
  const chipExtra = c => (c.dataset.icon ? { icon: c.dataset.icon, label: c.dataset.label }
    : c.dataset.label ? { label: c.dataset.label, sub: c.dataset.sub || undefined } : {});
  $('#palette-list').addEventListener('click', ev => { const c = ev.target.closest('.chip'); if (c) addNode(c.dataset.type, null, null, chipExtra(c)); });
  $('#palette-list').addEventListener('dragstart', ev => {
    const c = ev.target.closest('.chip');
    if (!c) return;
    ev.dataTransfer.setData('text/diagramon-type', c.dataset.type);
    ev.dataTransfer.setData('text/diagramon-extra', JSON.stringify(chipExtra(c)));
    ev.dataTransfer.effectAllowed = 'copy';
  });

  function renderExamples() {
    $('#examples').innerHTML = EXAMPLES.map((x, i) => `<button class="ex" data-ex="${i}"><b>${esc(loc(x.name))}</b><span>${esc(loc(x.desc) || '')}</span></button>`).join('')
      || `<p class="empty-list">${T('side.noTemplates')}</p>`;
  }
  $('#examples').addEventListener('click', ev => {
    const b = ev.target.closest('.ex');
    if (!b) return;
    S.sel = null;
    setModel(I.deep(EXAMPLES[+b.dataset.ex].diagram), { history: true, animate: true, fit: true });
    toast(T('toast.template', { name: loc(EXAMPLES[+b.dataset.ex].name) }));
    if (matchMedia('(max-width: 760px)').matches) $('#main').classList.remove('open');
  });

  $$('.tab').forEach(t => t.addEventListener('click', () => {
    $$('.tab').forEach(x => x.classList.toggle('on', x === t));
    $$('.pane').forEach(p => p.classList.toggle('on', p.dataset.pane === t.dataset.tab));
    store.set('tab', t.dataset.tab);
  }));

  function codeBox(box, apply) {
    box.addEventListener('focus', beginEdit);
    box.addEventListener('blur', endEdit);
    box.addEventListener('scroll', () => { box.previousElementSibling.scrollTop = box.scrollTop; });
    box.addEventListener('input', () => refreshGutter(box, box._errs));
    box.addEventListener('input', debounce(() => apply(box), 350));
    box.addEventListener('keydown', ev => {
      if (ev.key !== 'Tab') return;
      ev.preventDefault();
      box.setRangeText('  ', box.selectionStart, box.selectionEnd, 'end');
    });
  }
  const showErrors = (box, ed, errors) => {
    box._errs = new Set(errors.map(e => e.line));
    refreshGutter(box, box._errs);
    if (!errors.length) return setStatus(ed.status, true, ed.ok());
    setStatus(ed.status, false, T('ed.line', { line: errors[0].line, msg: errors[0].msg, more: errors.length - 1 }));
  };

  codeBox($('#json'), box => {
    let raw;
    try { raw = JSON.parse(box.value); } catch (err) {
      const pos = +(String(err.message).match(/position (\d+)/) || [])[1];
      const line = +(String(err.message).match(/line (\d+)/) || [])[1] || (Number.isFinite(pos) ? box.value.slice(0, pos).split('\n').length : 0);
      return showErrors(box, EDITORS.json, [{ line, msg: err.message.replace(/^JSON\.parse: /, '') }]);
    }
    markEdit();
    setModel(raw, { fromEditor: 'json' });
    showErrors(box, EDITORS.json, []);
  });

  let textCtx = null;
  const getTextCtx = () => textCtx || (textCtx = {
    icons: Object.fromEntries(Object.entries(ICONS).flatMap(([p, set]) => Object.entries(set.items).map(([k, it]) => [`${p}/${k}`, it]))),
    types: Object.fromEntries(Object.entries(C.types).map(([k, t]) => [k.toLowerCase(), { ...t, label: loc(t.label) }])),
    providers: Object.keys(ICONS),
    dataClasses: Object.keys(DATA),
    lang: I.lang
  });
  codeBox($('#text-src'), box => {
    if (!window.DiagramonText) return;
    const { model, errors } = DiagramonText.parse(box.value, getTextCtx());
    model.nodes.forEach(n => { const p = posCache.get(n.id); if (p && n.x == null) { n.x = p.x; n.y = p.y; } });
    markEdit();
    setModel(model, { fromEditor: 'text' });
    showErrors(box, EDITORS.text, errors);
  });
  $('#btn-format').addEventListener('click', () => { syncEditor(true); toast(T('toast.formatted')); });

  /* ---------- ancho del panel lateral ---------- */
  const mainEl = $('#main');
  const sideWidth = () => $('.sidebar').getBoundingClientRect().width;
  function setSide(px, keep = true) {
    const w = Math.round(clamp(px, 240, innerWidth * 0.8));
    mainEl.style.setProperty('--side', `${w}px`);
    if (keep) store.set('side', w);
    wideLabels(w);
  }
  const wideLabels = (w = sideWidth()) => $$('[data-wide]').forEach(b => { b.textContent = T(w >= 520 ? 'side.narrow' : 'side.wide'); });
  if (store.get('side', null)) setSide(store.get('side'), false);
  $$('[data-wide]').forEach(b => b.addEventListener('click', () => setSide(sideWidth() >= 520 ? 296 : Math.min(860, innerWidth * 0.6))));
  $('#resizer').addEventListener('pointerdown', ev => {
    ev.preventDefault();
    const r = $('#resizer');
    r.setPointerCapture(ev.pointerId);
    mainEl.classList.add('resizing');
    const left = mainEl.getBoundingClientRect().left;
    const move = e => setSide(e.clientX - left, false);
    const up = () => {
      mainEl.classList.remove('resizing');
      store.set('side', Math.round(sideWidth()));
      r.removeEventListener('pointermove', move);
      r.removeEventListener('pointerup', up);
    };
    r.addEventListener('pointermove', move);
    r.addEventListener('pointerup', up);
  });

  /* ---------- barra superior ---------- */
  const titleBox = $('#title');
  titleBox.addEventListener('focus', beginEdit);
  titleBox.addEventListener('blur', endEdit);
  titleBox.addEventListener('input', () => {
    markEdit();
    S.model.title = titleBox.value;
    updateMeta(); syncEditor(); save();
  });
  titleBox.addEventListener('keydown', ev => { if (ev.key === 'Enter') titleBox.blur(); });

  $('#btn-side').addEventListener('click', () => {
    const main = $('#main');
    if (matchMedia('(max-width: 760px)').matches) main.classList.toggle('open');
    else { main.classList.toggle('collapsed'); store.set('collapsed', main.classList.contains('collapsed')); }
  });
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-redo').addEventListener('click', redo);
  $('#btn-layout').addEventListener('click', relayout);
  function toggleRouting() {
    pushHistory();
    if (S.model.routing === 'elbow') delete S.model.routing; else S.model.routing = 'elbow';
    changed(false);
    renderInspector();
    updateRouteButton();
    toast(T(S.model.routing === 'elbow' ? 'toast.elbow' : 'toast.curved'));
  }
  const updateRouteButton = () => $('#btn-route').classList.toggle('on', S.model?.routing === 'elbow');
  $('#btn-route').addEventListener('click', toggleRouting);
  $('#btn-fit').addEventListener('click', () => fitView());
  $('#btn-play').addEventListener('click', togglePlay);
  $('#btn-anim').addEventListener('click', () => {
    S.anim = !S.anim;
    store.set('anim', S.anim);
    svg.classList.toggle('anim-off', !S.anim);
    $('#btn-anim').classList.toggle('on', S.anim);
    toast(T(S.anim ? 'toast.animOn' : 'toast.animOff'));
  });
  $('#btn-new').addEventListener('click', () => {
    S.sel = null;
    setModel({ title: T('model.new') }, { history: true, fit: true });
    toast(T('toast.newCanvas'));
  });
  $('#btn-import').addEventListener('click', () => $('#file').click());
  $('#file').addEventListener('change', ev => { const fs = [...ev.target.files]; ev.target.value = ''; if (fs.length) importFiles(fs); });

  function toggleTheme() {
    S.theme = S.theme === 'dark' ? 'light' : 'dark';
    store.set('theme', S.theme);
    applyTheme();
    const b = $('#btn-theme');
    b.classList.remove('spin'); void b.offsetWidth; b.classList.add('spin');
    toast(T(S.theme === 'dark' ? 'toast.dark' : 'toast.light'));
  }
  $('#btn-theme').addEventListener('click', toggleTheme);

  /* ---------- idioma (inglés por defecto, ver i18n.js) ---------- */
  // Vuelve a pintar todo lo que tiene texto de la interfaz. El contenido del diagrama no se traduce.
  function applyLang() {
    I.apply();
    $('#lang-code').textContent = I.lang.toUpperCase();
    [...paletteSel.options].forEach(o => { o.textContent = loc(C.palettes[o.value]?.label) || o.value; });
    wideLabels();
    textCtx = null;
    renderProviders();
    renderPalette();
    renderExamples();
    if (!S.model) return;
    renderInspector();
    renderVersions();
    applyCompare();
    updateMeta();
    writeEditors(null, true);
  }
  function toggleLang() {
    I.set(I.langs[(I.langs.indexOf(I.lang) + 1) % I.langs.length]);
    applyLang();
    const b = $('#btn-lang');
    b.classList.remove('spin'); void b.offsetWidth; b.classList.add('spin');
    toast(T('lang.toast'));
  }
  $('#btn-lang').addEventListener('click', toggleLang);

  const paletteSel = $('#palette');
  paletteSel.innerHTML = Object.entries(C.palettes).map(([k, p]) => `<option value="${k}">${esc(loc(p.label) || k)}</option>`).join('');
  paletteSel.value = S.palette;
  paletteSel.addEventListener('change', () => {
    S.palette = paletteSel.value;
    store.set('palette', S.palette);
    applyTheme();
    render(false);
    renderInspector();
  });

  const exportMenu = $('#export-menu');
  // Leyenda y cajetín: la preferencia es del navegador; autor y versión van en el diagrama (meta)
  const legendBox = $('#exp-legend'), authorBox = $('#exp-author'), versionBox = $('#exp-version');
  legendBox.checked = store.get('legend', true);
  legendBox.addEventListener('change', () => store.set('legend', legendBox.checked));
  [[authorBox, 'author'], [versionBox, 'version']].forEach(([box, k]) => {
    box.addEventListener('focus', beginEdit);
    box.addEventListener('blur', endEdit);
    box.addEventListener('input', () => {
      markEdit();
      const meta = { ...S.model.meta };
      if (box.value.trim()) meta[k] = box.value.trim(); else delete meta[k];
      if (Object.keys(meta).length) S.model.meta = meta; else delete S.model.meta;
      syncEditor(); save();
    });
  });
  exportMenu.addEventListener('toggle', () => {
    if (!exportMenu.open) return;
    authorBox.value = S.model.meta?.author || '';
    versionBox.value = S.model.meta?.version || '';
    const av = activeVersion();
    versionBox.placeholder = av ? verLabel(av) : '1.0';
    const r = exportMenu.querySelector('summary').getBoundingClientRect(), pop = exportMenu.querySelector('.menu-pop');
    pop.style.top = `${r.bottom}px`;
    pop.style.right = `${Math.max(8, innerWidth - r.right)}px`;
  });
  document.addEventListener('pointerdown', ev => { if (exportMenu.open && !exportMenu.contains(ev.target)) exportMenu.open = false; });
  exportMenu.addEventListener('click', ev => {
    const b = ev.target.closest('[data-export]');
    if (!b) return;
    exportMenu.open = false;
    ({ svg: exportSVG, png: exportPNG, json: exportJSON, copy: copyJSON })[b.dataset.export]();
  });

  $('#zoom-in').addEventListener('click', () => animateView(zoomTarget(1.25), 220));
  $('#zoom-out').addEventListener('click', () => animateView(zoomTarget(1 / 1.25), 220));
  $('#zoomv').addEventListener('click', () => animateView(zoomTarget(1 / S.view.k), 260));

  /* ---------- exportar / importar ---------- */
  const fileName = ext => (fold(S.model.title).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'diagram') + '.' + ext;
  function download(data, name, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }
  /* ---------- leyenda y cajetín de las exportaciones ---------- */
  // Solo lo que el diagrama usa: estilos de conexión, candados, tipos de componente y clasificaciones
  function buildLegend() {
    const m = S.model, g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'legend');
    const cols = [], RH = 22;
    const col = (head, rows, rh = RH) => rows.length && cols.push({ head, rows, rh });
    const textRow = (x, y, txt, cls = 'legend-text') => { const t = el('text', { class: cls, x, y: y + 4 }, g); t.textContent = txt; return textW(txt, '400 12px'); };
    // Conexiones
    const styles = [...new Set(m.edges.map(e => (C.edgeStyles[e.style] ? e.style : 'sync')))];
    const conn = styles.map(st => ({ w: 46 + textW(loc(C.edgeStyles[st].label), '400 12px'), draw: (x, y) => {
      const cfg = C.edgeStyles[st], eg = el('g', { class: `edge edge-${st}${cfg.dash ? ' edge-dashed' : ''}`, style: `--c:var(--muted);--w:${cfg.width}px` }, g);
      el('path', { class: 'edge-line', d: `M${x},${y} L${x + 30},${y}`, ...(cfg.dash ? { 'stroke-dasharray': cfg.dash } : {}) }, eg);
      el('path', { class: 'edge-arrow', d: `M${x + 34},${y} L${x + 26},${y - 4} L${x + 26},${y + 4} Z` }, eg);
      textRow(x + 46, y, loc(cfg.label));
    } }));
    [[true, 'leg.encrypted'], [false, 'leg.unencrypted']].forEach(([on, key]) => {
      if (m.edges.some(e => e.encrypted === on)) conn.push({ w: 46 + textW(T(key), '400 12px'), draw: (x, y) => {
        const lg = el('g', { transform: `translate(${x + 10} ${y})` }, g);
        lockIcon(lg, 0, on);
        textRow(x + 46, y, T(key));
      } });
    });
    col(T('leg.connections'), conn);
    // Componentes: un color por tipo (los nodos con color propio no entran)
    const types = [...new Map(m.nodes.filter(n => !n.color).map(n => [n.type, n])).keys()].slice(0, 16);
    const comp = types.map(k => ({ w: 22 + textW(typeLabel(k), '400 12px'), draw: (x, y) => {
      el('circle', { cx: x + 6, cy: y, r: 6, style: `fill:${colorVar(typeOf({ type: k }).color) || 'var(--accent)'}` }, g);
      textRow(x + 22, y, typeLabel(k));
    } }));
    for (let i = 0; i < comp.length; i += 8) col(i ? '' : T('leg.components'), comp.slice(i, i + 8));
    // Datos
    const used = new Set([...m.nodes, ...m.edges].flatMap(x => x.data || []));
    col(T('leg.data'), dataTags({ data: [...used] }).map(t => ({ w: Math.ceil(textW(t.short, FONT.dtag)) + 20 + textW(t.label, '400 12px'), draw: (x, y) => {
      const tw = dataTag(g, x, y - 8, t, 16);
      textRow(x + tw + 8, y, t.label);
    } })));
    // Observaciones de revisión abiertas, con su fecha compromiso
    const findings = m.nodes.filter(n => n.review && n.review.status !== 'resolved')
      .sort((a, b) => (a.review.due || '9999').localeCompare(b.review.due || '9999')).slice(0, 8);
    col(T('leg.review'), findings.map(n => {
      const tg = reviewTag(n.review), txt = fitText([n.label, n.review.note].filter(Boolean).join(' — '), '400 12px', 260);
      const meta = [n.review.due ? `${T('rev.due')}: ${fmtDay(n.review.due)}` : '', n.review.by || ''].filter(Boolean).join(' · ');
      return { w: Math.ceil(textW(tg.short, FONT.dtag)) + 20 + Math.max(textW(txt, '400 12px'), textW(meta, '400 11.5px')), draw: (x, y) => {
        const tw = dataTag(g, x, y - 8, tg, 16);
        textRow(x + tw + 8, y - 5, txt);
        if (meta) textRow(x + tw + 8, y + 9, meta, 'legend-muted');
      } };
    }), 38);
    // Cajetín
    const av = activeVersion(), cost = m.nodes.some(hasCost) ? `≈ ${money(round2(monthlyTotal(m.nodes)))}${T('cost.mo')}` : '';
    const info = [[T('leg.author'), m.meta?.author || '—'], [T('leg.version'), m.meta?.version || (av ? verLabel(av) : '—')],
      [T('leg.date'), new Intl.DateTimeFormat(I.lang, { dateStyle: 'long' }).format(new Date())], ...(cost ? [[T('leg.cost'), cost]] : [])];
    const keyW = Math.max(...info.map(([k]) => textW(k, '400 11.5px'))) + 14;
    const infoW = Math.max(220, textW(m.title, '700 14px'), keyW + Math.max(...info.map(([, v]) => textW(v, '400 12px')))) + 4;
    const colW = c => Math.max(textW(c.head, '750 10.5px') + 10, ...c.rows.map(rw => rw.w));
    const P = 20, GAP = 34, HEAD = 26;
    const rowsH = Math.max(0, ...cols.map(c => c.rows.length * c.rh));
    const h = P * 2 + Math.max(HEAD + rowsH, 28 + info.length * 20 + 18);
    let x = P;
    cols.forEach(c => {
      if (c.head) { const t = el('text', { class: 'legend-head', x, y: P + 9 }, g); t.textContent = c.head; }
      c.rows.forEach((rw, i) => rw.draw(x, P + HEAD + i * c.rh + c.rh / 2 - 4));
      x += colW(c) + GAP;
    });
    return { g, h, colsW: x - GAP + P, infoW, info, keyW, P };
  }
  function placeLegend(lg, W) {
    const { g, h, infoW, info, keyW, P } = lg, ix = W - P - infoW;
    const panel = el('rect', { class: 'legend-panel', x: 0, y: 0, width: W, height: h, rx: 14 });
    g.insertBefore(panel, g.firstChild);
    el('line', { x1: ix - 18, y1: P - 4, x2: ix - 18, y2: h - P + 4, style: 'stroke:var(--border)' }, g);
    el('text', { class: 'legend-head', x: ix, y: P + 9 }, g).textContent = T('leg.document');
    el('text', { class: 'legend-title', x: ix, y: P + 32 }, g).textContent = S.model.title;
    info.forEach(([k, v], i) => {
      el('text', { class: 'legend-muted', x: ix, y: P + 54 + i * 20 }, g).textContent = k;
      el('text', { class: 'legend-text', x: ix + keyW, y: P + 54 + i * 20 }, g).textContent = v;
    });
    el('text', { class: 'legend-muted', x: W - P, y: h - P + 6, 'text-anchor': 'end', style: 'font-size:10.5px' }, g).textContent = T('leg.made');
  }

  function buildSVG() {
    const b = contentBox() || { x: 0, y: 0, w: 400, h: 200 };
    const pad = 40, top = 56;
    const lg = $('#exp-legend').checked ? buildLegend() : null;
    const W = Math.ceil(Math.max(b.w + pad * 2, lg ? lg.colsW + lg.infoW + 40 + pad * 2 : 0));
    const Ht = Math.ceil(b.h + pad * 2 + top + (lg ? lg.h + 28 : 0));
    const out = svg.cloneNode(true);
    out.removeAttribute('id');
    out.removeAttribute('style');
    out.setAttribute('xmlns', NS);
    out.setAttribute('width', W);
    out.setAttribute('height', Ht);
    out.setAttribute('viewBox', `0 0 ${W} ${Ht}`);
    out.classList.remove('focusing', 'hovering', 'playing', 'dragging', 'panning', 'connecting');
    out.querySelectorAll('.particle, .edge-hit, .node-halo, .guide, .marquee').forEach(n => n.remove());
    out.querySelectorAll('.lit, .sel, .pulse, .pulse-node, .enter, .connect-src').forEach(n => n.classList.remove('lit', 'sel', 'pulse', 'pulse-node', 'enter', 'connect-src'));
    const vp = out.querySelector('#viewport');
    vp.removeAttribute('id');
    vp.setAttribute('transform', `translate(${pad - b.x} ${pad + top - b.y})`);
    const t = C.themes[S.theme], p = C.palettes[S.palette];
    const vars = [...Object.entries(t).map(([k, v]) => `--${k}:${v}`), ...Object.entries(p[S.theme] || p.dark).map(([k, v]) => `--p-${k}:${v}`), `--font:${C.fonts.ui}`].join(';');
    const style = document.createElementNS(NS, 'style');
    style.textContent = `svg{${vars}}\n${$('#diagram-css').textContent}`;
    out.insertBefore(style, out.firstChild);
    out.insertBefore(el('rect', { width: W, height: Ht, fill: t.bg }), style.nextSibling);
    const title = el('text', { x: pad, y: pad + 10, fill: t.text, 'font-size': 20, 'font-weight': 700, 'font-family': C.fonts.ui });
    const av = activeVersion();
    title.textContent = av ? `${S.model.title}  ·  ${verLabel(av)}` : S.model.title;
    out.insertBefore(title, vp);
    if (lg) {
      placeLegend(lg, W - pad * 2);
      lg.g.setAttribute('transform', `translate(${pad} ${Ht - pad - lg.h})`);
      out.appendChild(lg.g);
    }
    return { str: '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(out), W, H: Ht };
  }
  function exportSVG() { download(buildSVG().str, fileName('svg'), 'image/svg+xml'); toast(T('toast.svg')); }
  function exportPNG() {
    const { str, W, H: h } = buildSVG(), img = new Image(), scale = 2;
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = W * scale; c.height = h * scale;
      const ctx = c.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, W, h);
      c.toBlob(blob => { if (blob) { download(blob, fileName('png')); toast(T('toast.png')); } else toast(T('toast.pngFail')); }, 'image/png');
    };
    img.onerror = () => toast(T('toast.pngFail'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str);
  }
  function exportJSON() { download(serialize(S.model, true), fileName('json'), 'application/json'); toast(T('toast.json')); }
  function copyJSON() {
    const txt = serialize(S.model, true);
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = txt; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast(T('toast.copied')); } catch { toast(T('toast.copyFail')); }
      ta.remove();
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(txt).then(() => toast(T('toast.copied')), fallback);
    else fallback();
  }
  // Importa un diagrama de Diagramon (JSON) o infraestructura como código (iac.js).
  // Acepta File del navegador o { name, text }.
  async function importFiles(list) {
    const files = await Promise.all([...list].map(async f => ({ name: f.name || '', text: typeof f.text === 'string' ? f.text : await f.text() })));
    if (!files.length) return;
    if (files.length === 1) {
      let raw = null;
      try { raw = JSON.parse(files[0].text); } catch { /* puede ser YAML */ }
      if (raw && typeof raw === 'object' && Array.isArray(raw.nodes)) {
        S.sel = null;
        setModel(raw, { history: true, animate: true, fit: true });
        return toast(T('toast.imported'));
      }
    }
    const IAC = window.DiagramonIaC;
    let res;
    try { res = IAC.convert(files); } catch { return toast(IAC ? T('toast.iacNone') : T('toast.badJson'), 3200); }
    if (!res.nodes) return toast(T('toast.iacEmpty', { format: res.format }), 3200);
    S.sel = null;
    setModel(res.diagram, { history: true, animate: true, fit: true });
    toast(T('toast.iac', res), 4200);
    return res;
  }

  /* ---------- interacción con el lienzo ---------- */
  svg.addEventListener('pointerdown', ev => {
    if (ev.button !== 0 && ev.button !== 1) return;
    if (S.play) stopPlay();
    const nodeEl = ev.target.closest('.node'), tagEl = ev.target.closest('.group-tag'), edgeEl = ev.target.closest('.edge');
    const p = toWorld(ev.clientX, ev.clientY), now = performance.now();
    const key = nodeEl ? 'n:' + nodeEl.dataset.id : tagEl ? 'g:' + tagEl.parentNode.dataset.id : edgeEl ? 'e:' + edgeEl.dataset.id : 'bg';
    const last = S.lastDown;
    const dbl = ev.button === 0 && last && last.key === key && now - last.t < 350 && Math.hypot(ev.clientX - last.x, ev.clientY - last.y) < 6;
    S.lastDown = dbl ? null : { key, t: now, x: ev.clientX, y: ev.clientY };

    const multiKey = ev.metaKey || ev.ctrlKey;
    if (ev.button === 1 || (!nodeEl && !tagEl && !edgeEl)) {
      if (dbl) { addNode(S.lastType, p.x, p.y, S.lastExtra); return; }
      if (ev.button === 0 && (ev.shiftKey || multiKey) && !S.connecting) {
        // Selección por área: suma lo que ya estaba elegido
        S.drag = { kind: 'box', start: p, base: selIds(), moved: false, rect: el('rect', { class: 'marquee', x: p.x, y: p.y, width: 0, height: 0 }, L.guides) };
      } else S.drag = { kind: 'pan', cx: ev.clientX, cy: ev.clientY, vx: S.view.x, vy: S.view.y, moved: false };
    } else if (nodeEl) {
      const id = nodeEl.dataset.id;
      if (dbl) { renameNode(id); return; }
      if (multiKey && !S.connecting) { toggleInSelection(id); return; }
      const from = S.connecting || (ev.shiftKey && S.sel?.kind === 'node' && S.sel.id !== id ? S.sel.id : null);
      if (from) { addEdge(from, id); return; }
      // Si el nodo es parte de una selección múltiple, se mueven todos
      const ids = selIds(), moving = ids.length > 1 && ids.includes(id) ? ids : [id];
      S.drag = { kind: 'move', start: p, orig: S.model.nodes.filter(n => moving.includes(n.id)).map(n => ({ n, x: n.x, y: n.y })), moved: false, click: { kind: 'node', id }, cost: !!ev.target.closest('.node-cost') };
    } else if (tagEl) {
      const gid = tagEl.parentNode.dataset.id;
      if (dbl) { renameGroup(gid); return; }
      S.drag = { kind: 'move', start: p, orig: S.model.nodes.filter(n => inGroup(n, gid)).map(n => ({ n, x: n.x, y: n.y })), moved: false, click: { kind: 'group', id: gid } };
    } else {
      const id = edgeEl.dataset.id;
      if (dbl) { renameEdge(id); return; }
      cancelConnect();
      select({ kind: 'edge', id });
      return;
    }
    svg.setPointerCapture(ev.pointerId);
  });

  svg.addEventListener('pointermove', ev => {
    const d = S.drag;
    if (!d) return;
    if (d.kind === 'pan') {
      const dx = ev.clientX - d.cx, dy = ev.clientY - d.cy;
      if (!d.moved && Math.hypot(dx, dy) > 3) { d.moved = true; svg.classList.add('panning'); }
      if (d.moved) { S.view.x = d.vx + dx; S.view.y = d.vy + dy; applyView(); }
      return;
    }
    const p = toWorld(ev.clientX, ev.clientY), dx = p.x - d.start.x, dy = p.y - d.start.y;
    if (d.kind === 'box') {
      if (!d.moved && Math.hypot(dx, dy) * S.view.k < 4) return;
      d.moved = true;
      const x = Math.min(d.start.x, p.x), y = Math.min(d.start.y, p.y), w = Math.abs(dx), h = Math.abs(dy);
      Object.entries({ x, y, width: w, height: h }).forEach(([k, v]) => d.rect.setAttribute(k, v));
      const hits = S.model.nodes.filter(n => n.x < x + w && n.x + R.width.get(n.id) > x && n.y < y + h && n.y + H > y).map(n => n.id);
      S.sel = normSel({ kind: 'multi', ids: [...d.base, ...hits] });
      applyHighlight();
      return;
    }
    if (!d.moved) {
      if (Math.hypot(dx, dy) * S.view.k < 4) return;
      d.moved = true;
      pushHistory();
      svg.classList.add('dragging');
    }
    // Guías: se pega a bordes y centros de otros nodos (Alt las desactiva)
    const g = d.orig.length && !ev.altKey ? guideSnap(d, dx, dy) : null;
    d.orig.forEach(o => {
      o.n.x = g?.x != null ? o.x + g.x : snap(o.x + dx);
      o.n.y = g?.y != null ? o.y + g.y : snap(o.y + dy);
    });
    drawGuides(g?.lines || []);
    updateGeometry();
  });

  const endDrag = () => {
    const d = S.drag;
    if (!d) return;
    S.drag = null;
    svg.classList.remove('panning', 'dragging');
    if (d.kind === 'pan') {
      if (!d.moved) { if (S.connecting) cancelConnect(); else if (S.sel) select(null); }
      return;
    }
    if (d.kind === 'box') { d.rect.remove(); select(S.sel); return; }
    drawGuides([]);
    if (d.moved) { syncEditor(); save(); }
    else {
      select(d.click);
      if (d.cost) $('#inspector [data-field="cost"]')?.focus();
    }
  };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  svg.addEventListener('pointerover', ev => {
    if (S.drag) return;
    const n = ev.target.closest('.node'), id = n ? n.dataset.id : null;
    if (id !== S.hover) { S.hover = id; if (!S.sel) applyHighlight(); }
  });
  svg.addEventListener('pointerleave', () => { if (S.hover) { S.hover = null; if (!S.sel) applyHighlight(); } });

  svg.addEventListener('wheel', ev => {
    ev.preventDefault();
    const r = svg.getBoundingClientRect(), cx = ev.clientX - r.left, cy = ev.clientY - r.top;
    // Rueda de ratón o pellizco = zoom; desplazamiento de trackpad = mover
    const mouse = ev.deltaMode === 1 || (ev.deltaX === 0 && Math.abs(ev.deltaY) >= 40 && Number.isInteger(ev.deltaY));
    if (ev.ctrlKey || ev.metaKey || mouse) {
      cancelAnimationFrame(viewAnim);
      Object.assign(S.view, zoomTarget(Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.012 : 0.0016)), cx, cy));
    } else {
      S.view.x -= ev.deltaX;
      S.view.y -= ev.deltaY;
    }
    applyView();
  }, { passive: false });

  stage.addEventListener('dragover', ev => {
    const types = [...ev.dataTransfer.types];
    if (types.includes('text/diagramon-type') || types.includes('Files')) { ev.preventDefault(); stage.classList.add('dropping'); }
  });
  stage.addEventListener('dragleave', ev => { if (!stage.contains(ev.relatedTarget)) stage.classList.remove('dropping'); });
  stage.addEventListener('drop', ev => {
    ev.preventDefault();
    stage.classList.remove('dropping');
    const type = ev.dataTransfer.getData('text/diagramon-type');
    if (type) {
      const p = toWorld(ev.clientX, ev.clientY);
      let extra = {};
      try { extra = JSON.parse(ev.dataTransfer.getData('text/diagramon-extra') || '{}'); } catch { /* sin icono */ }
      addNode(type, p.x, p.y, extra);
      return;
    }
    const fs = [...ev.dataTransfer.files];
    if (fs.length) importFiles(fs);
  });

  document.addEventListener('keydown', ev => {
    const typing = ev.target.closest?.('input, textarea, select, [contenteditable="true"]');
    const mod = ev.metaKey || ev.ctrlKey, k = ev.key.toLowerCase();
    if (typing) { if (ev.key === 'Escape') ev.target.blur(); return; }
    if (mod && k === 'z') { ev.preventDefault(); ev.shiftKey ? redo() : undo(); }
    else if (mod && k === 'y') { ev.preventDefault(); redo(); }
    else if (mod && k === 'd') { ev.preventDefault(); duplicateSelection(); }
    else if (mod && k === 'a') { ev.preventDefault(); select({ kind: 'multi', ids: S.model.nodes.map(n => n.id) }); }
    else if (mod) return;
    else if (ev.key === 'Delete' || ev.key === 'Backspace') { if (S.sel) { ev.preventDefault(); deleteSelection(); } }
    else if (ev.key === 'Escape') { if (S.play) stopPlay(); else if (S.connecting) cancelConnect(); else if (!S.sel && S.compare) compareVersion(null); else select(null); }
    else if (k === 'f') fitView();
    else if (k === 'p') togglePlay();
    else if (k === 't') toggleTheme();
    else if (k === 'l') toggleLang();
    else if (k === 'e') toggleRouting();
    else if (k === 'c' && S.sel?.kind === 'node') startConnect(S.sel.id);
    else if (k === '+' || k === '=') animateView(zoomTarget(1.25), 200);
    else if (k === '-') animateView(zoomTarget(1 / 1.25), 200);
    else if (ev.key.startsWith('Arrow') && selIds().length) {
      ev.preventDefault();
      const step = C.grid.snap * (ev.shiftKey ? 5 : 1);
      pushHistory();
      selNodes().forEach(n => {
        if (ev.key === 'ArrowLeft') n.x -= step;
        if (ev.key === 'ArrowRight') n.x += step;
        if (ev.key === 'ArrowUp') n.y -= step;
        if (ev.key === 'ArrowDown') n.y += step;
      });
      changed(false);
    }
  });

  /* ---------- avisos ---------- */
  let toastTimer;
  function toast(msg, ms = 1800) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  /* ---------- arranque ---------- */
  function init() {
    applyTheme();
    applyLang();
    $('#app-name').textContent = C.app.name;
    if (store.get('collapsed', false) && !matchMedia('(max-width: 760px)').matches) $('#main').classList.add('collapsed');
    const tab = store.get('tab', 'components');
    $(`.tab[data-tab="${tab}"]`)?.click();
    svg.classList.toggle('anim-off', !S.anim);
    $('#btn-anim').classList.toggle('on', S.anim);
    const saved = store.get('model', null);
    setModel(saved && Array.isArray(saved.nodes) ? saved : I.deep(EXAMPLES[0]?.diagram || { title: T('model.new') }), { animate: true });
    fitView(false);
    requestAnimationFrame(tick);
  }

  // API para extensiones futuras (consola o scripts propios)
  window.Diagramon = {
    get model() { return clone(S.model); },
    load: (raw, opts = {}) => setModel(raw, { history: true, animate: true, fit: true, ...opts }),
    addNode, addEdge, relayout, fitView, togglePlay, toggleTheme, toggleLang,
    get lang() { return I.lang; },
    select: ids => select({ kind: 'multi', ids: [].concat(ids) }), align: alignNodes,
    saveVersion, openVersion, compareVersion, deleteVersion,
    exportSVG, exportPNG, exportJSON, toggleRouting, importFiles, config: C, icons: ICONS
  };

  init();
})();
