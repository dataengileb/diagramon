/* ==========================================================================
   Diagramon · motor del editor
   Normalmente no necesitas tocar este archivo: personaliza en config.js.
   API pública para extensiones: window.Diagramon (ver final del archivo).
   ========================================================================== */
(() => {
  'use strict';

  const C = window.DIAGRAMON_CONFIG;
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
    provider: store.get('provider', 'generic')
  };
  // Referencias a elementos SVG y medidas calculadas (nunca se guardan en el modelo)
  const R = { nodes: new Map(), edges: new Map(), groups: new Map(), width: new Map(), gbox: new Map() };

  const svg = $('#canvas'), viewport = $('#viewport'), stage = $('#stage');
  const L = { groups: $('#l-groups'), edges: $('#l-edges'), nodes: $('#l-nodes'), guides: $('#l-guides') };

  const ICON = {
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    link: '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    swap: '<svg viewBox="0 0 24 24"><path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/></svg>'
  };

  /* ---------- colores ---------- */
  const paletteKeys = () => Object.keys((C.palettes[S.palette] || Object.values(C.palettes)[0]).dark);
  const colorVar = k => !k ? null : paletteKeys().includes(k) ? `var(--p-${k})` : k;
  const typeOf = n => C.types[n.type] || C.types.generic;
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
  const PERIODS = {
    hour:  { label: 'Por hora', short: '/h', word: 'hora' },
    month: { label: 'Mensual', short: '/mes', word: 'mes' },
    year:  { label: 'Anual', short: '/año', word: 'año' },
    multi: { label: 'Multianual', short: '', word: 'años' }
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
    return money(n.cost) + (p === 'multi' ? `/${y} ${y === 1 ? 'año' : 'años'}` : PERIODS[p].short);
  };
  const perMonth = n => {
    const c = +n.cost;
    return { hour: c * COST.hoursPerMonth, month: c, year: c / 12, multi: c / (yearsOf(n) * 12) }[periodOf(n)];
  };
  const monthlyTotal = ns => ns.filter(hasCost).reduce((s, n) => s + perMonth(n), 0);
  const round2 = v => Math.round(v * 100) / 100;
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
  const FONT = { label: '600 13.5px', sub: '400 11.5px', tag: '700 11px', edge: '500 11px', badge: '800 10.5px', cost: '700 10.5px' };
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
    const m = { title: String(raw.title || 'Diagrama sin título'), groups: [], nodes: [], edges: [] };
    if (raw.direction === 'LR' || raw.direction === 'TB') m.direction = raw.direction;
    const used = new Set();
    const take = (id, prefix, i) => {
      let v = id != null && id !== '' ? String(id) : `${prefix}${i + 1}`;
      while (used.has(v)) v += '_';
      used.add(v);
      return v;
    };
    const list = a => (Array.isArray(a) ? a : []).filter(x => x && typeof x === 'object');

    list(raw.groups).forEach((g, i) => m.groups.push({ ...g, id: take(g.id, 'g', i), label: String(g.label ?? g.id ?? 'Grupo') }));
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
      const o = { ...n, id: take(n.id, 'n', i), type, label: String(n.label ?? C.types[type].label) };
      if (o.group == null || o.group === '' || !gids.has(String(o.group))) delete o.group; else o.group = String(o.group);
      if (hasCost(o) && +o.cost >= 0) o.cost = +o.cost; else delete o.cost;
      if (!PERIODS[o.costPeriod] || o.costPeriod === 'month') delete o.costPeriod;
      if (o.costPeriod === 'multi' && Math.round(+o.costYears) >= 1) o.costYears = Math.round(+o.costYears); else delete o.costYears;
      m.nodes.push(o);
    });
    const nids = new Set(m.nodes.map(n => n.id));
    list(raw.edges).forEach((e, i) => {
      const from = String(e.from), to = String(e.to);
      if (nids.has(from) && nids.has(to)) m.edges.push({ ...e, id: take(e.id, 'e', i), from, to });
    });
    return m;
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
    const q = ids.filter(id => indeg.get(id) === 0);
    while (q.length) {
      const u = q.shift();
      for (const v of fwd.get(u)) {
        rank.set(v, Math.max(rank.get(v), rank.get(u) + 1));
        indeg.set(v, indeg.get(v) - 1);
        if (indeg.get(v) === 0) q.push(v);
      }
    }
    return rank;
  }

  function autoLayout(m) {
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
    applyHighlight();
    updateMeta();
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
    let label = null;
    if (e.label) {
      label = el('g', { class: 'edge-label' }, g);
      const w = textW(e.label, FONT.edge) + 16;
      el('rect', { x: -w / 2, y: -10, width: w, height: 20, rx: 10 }, label);
      el('text', { 'text-anchor': 'middle', y: 4 }, label).textContent = e.label;
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
    el('title', null, g).textContent = n.sub ? `${n.label} · ${n.sub}` : n.label;
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
  const loopPath = a => `M${a.x + a.w - 34},${a.y} C${a.x + a.w - 34},${a.y - 56} ${a.x + a.w + 52},${a.y - 30} ${a.x + a.w},${a.y + a.h / 2 - 6}`;

  function updateGeometry() {
    const m = S.model, byId = new Map(m.nodes.map(n => [n.id, n]));
    const rect = id => { const n = byId.get(id); return { x: n.x, y: n.y, w: R.width.get(id), h: H }; };
    m.nodes.forEach(n => R.nodes.get(n.id)?.setAttribute('transform', `translate(${n.x} ${n.y})`));

    const pairs = new Set(m.edges.map(e => e.from + '\0' + e.to));
    R.edges.forEach(r => {
      const e = r.e, a = rect(e.from), b = rect(e.to);
      const d = e.from === e.to ? loopPath(a) : curvePath(a, b, pairs.has(e.to + '\0' + e.from) ? 7 : 0);
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
    if (!S.history.length) return toast('Nada que deshacer');
    S.future.push(snapshot());
    setModel(JSON.parse(S.history.pop()));
    toast('Deshecho');
  }
  function redo() {
    if (!S.future.length) return toast('Nada que rehacer');
    S.history.push(snapshot());
    setModel(JSON.parse(S.future.pop()));
    toast('Rehecho');
  }
  function updateUndoButtons() {
    $('#btn-undo').disabled = !S.history.length;
    $('#btn-redo').disabled = !S.future.length;
  }

  const save = debounce(() => store.set('model', S.model), 250);

  const ORDER = {
    group: ['id', 'label', 'color', 'parent'],
    node: ['id', 'label', 'type', 'icon', 'sub', 'badge', 'group', 'color', 'x', 'y', 'cost', 'costPeriod', 'costYears', 'desc'],
    edge: ['id', 'from', 'to', 'label', 'style', 'color']
  };
  function serialize(m) {
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
    return `{\n${[...head, arr('groups', m.groups, ORDER.group), arr('nodes', m.nodes, ORDER.node), arr('edges', m.edges, ORDER.edge)].join(',\n')}\n}\n`;
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
    json: { sel: '#json', status: '#json-status', ok: 'JSON válido · se aplica al escribir', write: () => serialize(S.model) },
    text: { sel: '#text-src', status: '#text-status', ok: 'Texto válido · se aplica al escribir', write: () => window.DiagramonText?.stringify(S.model) ?? '' }
  };
  // Escribe el modelo en los editores; se salta el que originó el cambio y el que tiene el foco
  function writeEditors(skip, force) {
    for (const [k, ed] of Object.entries(EDITORS)) {
      const box = $(ed.sel);
      if (k === skip || (!force && document.activeElement === box)) continue;
      box.value = ed.write();
      box._errs = null;
      refreshGutter(box);
      setStatus(ed.status, true, ed.ok);
    }
  }
  const writeEditorsLater = debounce(() => writeEditors(null), 150);
  const syncEditor = now => (now ? writeEditors(null, true) : writeEditorsLater());
  // Última posición conocida de cada nodo: el texto no guarda posiciones
  const posCache = new Map();

  function setModel(raw, opts = {}) {
    stopPlay();
    if (opts.history) pushHistory();
    S.model = normalize(raw);
    ensurePositions(S.model);
    S.sel = normSel(S.sel);
    if (S.sel && !selTarget()) S.sel = null;
    if (S.connecting && !S.model.nodes.some(n => n.id === S.connecting)) cancelConnect();
    render(!!opts.animate);
    S.model.nodes.forEach(n => posCache.set(n.id, { x: n.x, y: n.y }));
    writeEditors(opts.fromEditor, !opts.fromEditor);
    renderInspector();
    save();
    updateUndoButtons();
    if (opts.fit) fitView(opts.fit !== 'instant');
  }

  // Tras cambiar el modelo desde el lienzo o el inspector
  function changed(structural = true) {
    if (structural) render(false); else updateGeometry();
    syncEditor();
    save();
    updateUndoButtons();
  }

  function updateMeta() {
    const m = S.model;
    $('#stage-h1').textContent = m.title;
    const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
    const costs = m.nodes.some(hasCost) ? `≈ ${money(round2(monthlyTotal(m.nodes)))}/mes` : '';
    $('#stage-meta').textContent = [plural(m.nodes.length, 'componente', 'componentes'), plural(m.edges.length, 'conexión', 'conexiones'), m.groups.length ? plural(m.groups.length, 'grupo', 'grupos') : '', costs].filter(Boolean).join(' · ');
    const t = $('#title');
    if (document.activeElement !== t) t.value = m.title;
    $('#empty').hidden = m.nodes.length > 0;
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
    const t = C.types[type] || C.types.generic;
    S.lastType = C.types[type] ? type : 'generic';
    S.lastExtra = extra;
    if (wx == null) {
      const r = svg.getBoundingClientRect(), c = toWorld(r.left + r.width / 2, r.top + r.height / 2);
      wx = c.x + (Math.random() * 80 - 40);
      wy = c.y + (Math.random() * 80 - 40);
    }
    pushHistory();
    const n = { id: uniqueId(`${extra.icon ? extra.icon.split('/')[1] : S.lastType}-`), label: extra.label || t.label, type: S.lastType };
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
    toast(`${n.label} añadido`);
  }

  function addEdge(from, to) {
    cancelConnect();
    if (from === to) return;
    if (S.model.edges.some(e => e.from === from && e.to === to)) { toast('Esa conexión ya existe'); return; }
    pushHistory();
    const id = uniqueId('e');
    S.model.edges.push({ id, from, to });
    changed(true);
    select({ kind: 'edge', id });
    toast('Conexión creada');
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
    toast('Eliminado');
  }

  // Duplica los nodos elegidos y las conexiones entre ellos, debajo del original
  function duplicateSelection() {
    const ns = selNodes();
    if (!ns.length) return;
    pushHistory();
    const dy = Math.max(...ns.map(n => n.y + nodeBoxH(n))) - Math.min(...ns.map(n => n.y)) + 32;
    const ids = new Map();
    ns.forEach(n => {
      const copy = { ...clone(n), id: uniqueId(`${n.type}-`), label: `${n.label} (copia)`, x: snap(n.x + 32), y: snap(n.y + dy) };
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
    const v = prompt('Nombre del componente', n.label);
    if (v == null || !v.trim() || v.trim() === n.label) return;
    pushHistory(); n.label = v.trim(); changed(true); renderInspector();
  }
  function renameGroup(id) {
    const g = groupById(id);
    const v = prompt('Nombre del grupo', g.label);
    if (v == null || !v.trim() || v.trim() === g.label) return;
    pushHistory(); g.label = v.trim(); changed(true); renderInspector();
  }
  function renameEdge(id) {
    const e = S.model.edges.find(x => x.id === id);
    const v = prompt('Etiqueta de la conexión (vacío para quitarla)', e.label || '');
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
    toast('Diagrama reordenado');
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
    left:    { label: 'Izquierda', icon: '<path d="M4 3v18"/><rect x="7" y="6" width="12" height="4" rx="1"/><rect x="7" y="14" width="7" height="4" rx="1"/>' },
    hcenter: { label: 'Centro horizontal', icon: '<path d="M12 3v18"/><rect x="5" y="6" width="14" height="4" rx="1"/><rect x="8" y="14" width="8" height="4" rx="1"/>' },
    right:   { label: 'Derecha', icon: '<path d="M20 3v18"/><rect x="5" y="6" width="12" height="4" rx="1"/><rect x="10" y="14" width="7" height="4" rx="1"/>' },
    top:     { label: 'Arriba', icon: '<path d="M3 4h18"/><rect x="6" y="7" width="4" height="12" rx="1"/><rect x="14" y="7" width="4" height="7" rx="1"/>' },
    vcenter: { label: 'Centro vertical', icon: '<path d="M3 12h18"/><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="8" width="4" height="8" rx="1"/>' },
    bottom:  { label: 'Abajo', icon: '<path d="M3 20h18"/><rect x="6" y="5" width="4" height="12" rx="1"/><rect x="14" y="10" width="4" height="7" rx="1"/>' },
    hdist:   { label: 'Repartir en horizontal', icon: '<path d="M3 4v16M21 4v16"/><rect x="9" y="7" width="6" height="10" rx="1"/>' },
    vdist:   { label: 'Repartir en vertical', icon: '<path d="M4 3h16M4 21h16"/><rect x="7" y="9" width="10" height="6" rx="1"/>' }
  };
  function alignNodes(how) {
    const ns = selNodes();
    if (ns.length < 2) return;
    if ((how === 'hdist' || how === 'vdist') && ns.length < 3) return toast('Elige 3 o más para repartir');
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
    if (ns.every(n => to.get(n.id).x === n.x && to.get(n.id).y === n.y)) return toast('Ya están alineados');
    stopPlay();
    pushHistory();
    tweenNodes(new Map(ns.map(n => [n.id, { x: n.x, y: n.y }])), to, 380);
    toast(ALIGN[how].label);
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

  /* ---------- inspector ---------- */
  const swatches = cur => `<div class="swatches">
      <button class="sw auto${!cur ? ' on' : ''}" data-color="" title="Automático"></button>
      ${paletteKeys().map(k => `<button class="sw${cur === k ? ' on' : ''}" data-color="${k}" title="${k}" style="--c:var(--p-${k})"></button>`).join('')}
    </div>`;
  const typeOptions = cur => categories().map(cat => {
    const ts = Object.entries(C.types).filter(([, t]) => (t.category || 'Otros') === cat);
    return ts.length ? `<optgroup label="${esc(cat)}">${ts.map(([k, t]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${esc(t.label)}</option>`).join('')}</optgroup>` : '';
  }).join('');
  const iconOptions = cur => `<option value="">Propio (según el tipo)</option>` + Object.entries(ICONS).map(([p, set]) =>
    `<optgroup label="${esc(set.label)}">${Object.entries(set.items).sort((a, b) => a[1].label.localeCompare(b[1].label))
      .map(([k, it]) => `<option value="${p}/${k}"${cur === `${p}/${k}` ? ' selected' : ''}>${esc(it.label)}</option>`).join('')}</optgroup>`).join('');
  const head = (c, iconHtml, kicker, title, isLogo) => `<div class="insp-head" style="--c:${c}">
      ${iconHtml ? `<span class="insp-icon${isLogo ? ' logo' : ''}">${iconHtml}</span>` : ''}
      <div class="insp-hgroup"><div class="insp-kicker">${esc(kicker)}</div><div class="insp-title">${esc(title)}</div></div>
      <button class="icon-btn" data-act="close" aria-label="Cerrar">${ICON.x}</button></div>`;

  const costHint = n => {
    if (!hasCost(n)) return 'Escribe el precio en dólares y elige el periodo.';
    const mo = perMonth(n);
    return `≈ ${money(round2(mo))}/mes · ${money(round2(mo * 12))}/año`;
  };
  const costField = n => {
    const p = n.costPeriod === 'multi' ? 'multi' : PERIODS[n.costPeriod] ? n.costPeriod : '';
    return `<div class="field">Costo (${esc(COST.currency)})
      <div class="cost-row">
        <span class="money"><input data-field="cost" type="number" min="0" step="any" inputmode="decimal" placeholder="0.00" value="${hasCost(n) ? esc(n.cost) : ''}" aria-label="Costo"></span>
        <select data-field="costPeriod" aria-label="Periodo">${Object.entries(PERIODS).map(([k, v]) => `<option value="${k === 'month' ? '' : k}"${(k === 'month' ? '' : k) === p ? ' selected' : ''}>${v.label}</option>`).join('')}</select>
        ${p === 'multi' ? `<span class="years"><input data-field="costYears" type="number" min="1" step="1" value="${yearsOf(n)}" aria-label="Años"></span>` : ''}
      </div>
      <span class="cost-hint">${costHint(n)}</span>
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
      const tool = k => `<button class="tool" data-align="${k}" title="${esc(ALIGN[k].label)}" aria-label="${esc(ALIGN[k].label)}"><svg viewBox="0 0 24 24">${ALIGN[k].icon}</svg></button>`;
      const groupsOf = new Set(t.map(n => n.group || ''));
      const colorsOf = new Set(t.map(n => n.color || ''));
      const g1 = groupsOf.size === 1 ? [...groupsOf][0] : null;
      const priced = t.filter(hasCost);
      html = head('var(--accent)', '', 'Selección', `${t.length} componentes`) + `
        <div class="field">Alinear<div class="tools">${['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom'].map(tool).join('')}</div></div>
        <div class="field">Repartir con el mismo espacio<div class="tools two">${['hdist', 'vdist'].map(k => tool(k).replace('</svg>', `</svg>${k === 'hdist' ? 'Horizontal' : 'Vertical'}`)).join('')}</div></div>
        <label>Grupo<select data-field="group">${g1 == null ? '<option value="__mixed" selected>Varios</option>' : ''}<option value=""${g1 === '' ? ' selected' : ''}>Ninguno</option>${m.groups.map(g => `<option value="${esc(g.id)}"${g.id === g1 ? ' selected' : ''}>${esc(g.label)}</option>`).join('')}<option value="__new">+ Nuevo grupo…</option></select></label>
        <div class="field">Color${swatches(colorsOf.size === 1 ? [...colorsOf][0] : '__mixed')}</div>
        ${priced.length ? `<p class="cost-sum">Costo de la selección <b>≈ ${money(round2(monthlyTotal(t)))}/mes</b><span>${priced.length} de ${t.length} con costo</span></p>` : ''}
        <p class="note"><kbd>⌘</kbd>+clic añade o quita · <kbd>⇧</kbd>+arrastrar en el fondo selecciona un área · las flechas mueven todo.</p>
        <div class="insp-actions">
          <button class="btn" data-act="dup">Duplicar</button>
          <button class="btn danger" data-act="delete">Eliminar ${t.length}</button>
        </div>`;
    } else if (kind === 'node') {
      const ty = typeOf(t);
      const outs = m.edges.filter(e => e.from === t.id), ins = m.edges.filter(e => e.to === t.id);
      const conn = (e, other) => { const o = nm(other); return `<button class="conn" data-goto="${esc(other)}" style="--c:${nodeColor(o)}"><span class="dot"></span>${esc(o.label)}${e.label ? `<em>${esc(e.label)}</em>` : ''}</button>`; };
      const modes = [['direct', 'Vecinos'], ['down', 'Destinos'], ['up', 'Orígenes'], ['both', 'Todo']];
      const off = iconInfo(t.icon);
      html = head(nodeColor(t), nodeIconHtml(t), off ? `${off.providerLabel} · ${off.label}` : `${ty.category || 'Otros'} · ${ty.label}`, t.label, !!off) + `
        <label>Nombre<input data-field="label" value="${esc(t.label)}"></label>
        <label>Detalle<input data-field="sub" value="${esc(t.sub || '')}" placeholder="p. ej. t3.medium · Multi-AZ"></label>
        <div class="row2">
          <label>Tipo<select data-field="type">${typeOptions(t.type)}</select></label>
          <label>Grupo<select data-field="group"><option value="">Ninguno</option>${m.groups.map(g => `<option value="${esc(g.id)}"${g.id === t.group ? ' selected' : ''}>${esc(g.label)}</option>`).join('')}<option value="__new">+ Nuevo grupo…</option></select></label>
        </div>
        ${Object.keys(ICONS).length ? `<label>Icono<select data-field="icon">${iconOptions(t.icon)}</select></label>` : ''}
        <div class="field">Color${swatches(t.color)}</div>
        ${costField(t)}
        <label>Descripción<textarea data-field="desc" rows="3" placeholder="¿Qué hace este componente?">${esc(t.desc || '')}</textarea></label>
        <div class="field">Resaltar flujo<div class="seg">${modes.map(([k, l]) => `<button data-reach="${k}" class="${S.reach === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        ${ins.length || outs.length ? `<div class="conns">
          ${ins.length ? `<div class="conn-title">Recibe de · ${ins.length}</div>${ins.map(e => conn(e, e.from)).join('')}` : ''}
          ${outs.length ? `<div class="conn-title">Envía a · ${outs.length}</div>${outs.map(e => conn(e, e.to)).join('')}` : ''}
        </div>` : ''}
        <div class="insp-actions">
          <button class="btn" data-act="connect">${ICON.link}Conectar</button>
          <button class="btn" data-act="dup">Duplicar</button>
          <button class="btn danger" data-act="delete">Eliminar</button>
        </div>`;
    } else if (kind === 'edge') {
      const a = nm(t.from), b = nm(t.to);
      html = head(colorVar(t.color) || nodeColor(a), '', 'Conexión', `${a.label} → ${b.label}`) + `
        <label>Etiqueta<input data-field="label" value="${esc(t.label || '')}" placeholder="p. ej. HTTPS, SQL, eventos"></label>
        <label>Estilo<select data-field="style">${Object.entries(C.edgeStyles).map(([k, v]) => `<option value="${k}"${k === (C.edgeStyles[t.style] ? t.style : 'sync') ? ' selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label>
        <div class="field">Color${swatches(t.color)}</div>
        <div class="conns"><div class="conn-title">Extremos</div>
          <button class="conn" data-goto="${esc(a.id)}" style="--c:${nodeColor(a)}"><span class="dot"></span>${esc(a.label)}<em>origen</em></button>
          <button class="conn" data-goto="${esc(b.id)}" style="--c:${nodeColor(b)}"><span class="dot"></span>${esc(b.label)}<em>destino</em></button>
        </div>
        <div class="insp-actions">
          <button class="btn" data-act="reverse">${ICON.swap}Invertir</button>
          <button class="btn danger" data-act="delete">Eliminar</button>
        </div>`;
    } else {
      const blocked = new Set([t.id]);
      let grew = true;
      while (grew) { grew = false; m.groups.forEach(g => { if (g.parent && blocked.has(g.parent) && !blocked.has(g.id)) { blocked.add(g.id); grew = true; } }); }
      const count = m.nodes.filter(n => inGroup(n, t.id)).length;
      html = head(colorVar(t.color) || 'var(--muted)', '', 'Grupo', t.label) + `
        <p class="note">${count} componente${count === 1 ? '' : 's'} dentro. Arrastra la etiqueta del grupo para moverlo entero.</p>
        <label>Nombre<input data-field="label" value="${esc(t.label)}"></label>
        <label>Dentro de<select data-field="parent"><option value="">Ninguno</option>${m.groups.filter(g => !blocked.has(g.id)).map(g => `<option value="${esc(g.id)}"${g.id === t.parent ? ' selected' : ''}>${esc(g.label)}</option>`).join('')}</select></label>
        <div class="field">Color${swatches(t.color)}</div>
        <div class="insp-actions"><button class="btn danger" data-act="delete">Eliminar grupo</button></div>`;
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
      const name = prompt('Nombre del nuevo grupo', 'Nuevo grupo');
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
  inspector.addEventListener('focusin', ev => { if (ev.target.matches('input[data-field], textarea[data-field]')) beginEdit(); });
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
    const count = n => `${n} ${n === 1 ? 'componente' : 'componentes'}`;
    const list = [['generic', `Genéricos · ${count(Object.keys(C.types).length)}`],
      ...Object.entries(ICONS).map(([k, s]) => [k, `${s.label} · ${count(Object.keys(s.items).length + (C.presets?.[k]?.items.length || 0))}`])];
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
      const preItems = (pre?.items || []).filter(p => !q || fold(`${p.label} ${p.sub || ''} ${p.keywords || ''}`).includes(q));
      if (preItems.length) groups.set(pre.title, preItems.map(p => [null, p]));
      Object.entries(set.items)
        .filter(([k, it]) => !q || fold(`${it.label} ${k} ${it.category}`).includes(q))
        .forEach(([k, it]) => { if (!groups.has(it.category)) groups.set(it.category, []); groups.get(it.category).push([k, it]); });
      $('#palette-list').innerHTML = [...groups].map(([cat, items]) => `<div class="cat">${esc(cat)}</div><div class="chips">${items.map(([k, it]) => k == null
        ? chip(`data-type="${esc(it.type)}" data-label="${esc(it.label)}" data-sub="${esc(it.sub || '')}"`, colorVar(it.color || (C.types[it.type] || C.types.generic).color), typeIcon(it.type), it.label)
        : chip(`data-type="${it.type}" data-icon="${S.provider}/${k}" data-label="${esc(it.label)}"`, colorVar((C.types[it.type] || C.types.generic).color), `<img src="${set.files[it.file]}" alt="">`, it.label, true)).join('')}</div>`).join('')
        || '<p class="empty-list">Sin resultados.</p>';
      return;
    }
    const html = categories().map(cat => {
      const items = Object.entries(C.types).filter(([k, t]) => (t.category || 'Otros') === cat && (!q || fold(`${t.label} ${k} ${t.keywords || ''} ${cat}`).includes(q)));
      if (!items.length) return '';
      return `<div class="cat">${esc(cat)}</div><div class="chips">${items.map(([k, t]) =>
        chip(`data-type="${k}"`, colorVar(t.color), typeIcon(k), t.label)).join('')}</div>`;
    }).join('');
    $('#palette-list').innerHTML = html || '<p class="empty-list">Sin resultados. Puedes añadir tipos en config.js.</p>';
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
    $('#examples').innerHTML = EXAMPLES.map((x, i) => `<button class="ex" data-ex="${i}"><b>${esc(x.name)}</b><span>${esc(x.desc || '')}</span></button>`).join('')
      || '<p class="empty-list">No hay plantillas. Añádelas en examples.js.</p>';
  }
  $('#examples').addEventListener('click', ev => {
    const b = ev.target.closest('.ex');
    if (!b) return;
    S.sel = null;
    setModel(clone(EXAMPLES[+b.dataset.ex].diagram), { history: true, animate: true, fit: true });
    toast(`Plantilla: ${EXAMPLES[+b.dataset.ex].name}`);
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
    if (!errors.length) return setStatus(ed.status, true, ed.ok);
    const more = errors.length > 1 ? ` (y ${errors.length - 1} más)` : '';
    setStatus(ed.status, false, `Línea ${errors[0].line}: ${errors[0].msg}${more}`);
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
    types: Object.fromEntries(Object.entries(C.types).map(([k, t]) => [k.toLowerCase(), t])),
    providers: Object.keys(ICONS)
  });
  codeBox($('#text-src'), box => {
    if (!window.DiagramonText) return;
    const { model, errors } = DiagramonText.parse(box.value, getTextCtx());
    model.nodes.forEach(n => { const p = posCache.get(n.id); if (p && n.x == null) { n.x = p.x; n.y = p.y; } });
    markEdit();
    setModel(model, { fromEditor: 'text' });
    showErrors(box, EDITORS.text, errors);
  });
  $('#btn-format').addEventListener('click', () => { syncEditor(true); toast('JSON formateado'); });

  /* ---------- ancho del panel lateral ---------- */
  const mainEl = $('#main');
  const sideWidth = () => $('.sidebar').getBoundingClientRect().width;
  function setSide(px, keep = true) {
    const w = Math.round(clamp(px, 240, innerWidth * 0.8));
    mainEl.style.setProperty('--side', `${w}px`);
    if (keep) store.set('side', w);
    $$('[data-wide]').forEach(b => { b.textContent = w >= 520 ? 'Reducir' : 'Ampliar'; });
  }
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
  $('#btn-fit').addEventListener('click', () => fitView());
  $('#btn-play').addEventListener('click', togglePlay);
  $('#btn-anim').addEventListener('click', () => {
    S.anim = !S.anim;
    store.set('anim', S.anim);
    svg.classList.toggle('anim-off', !S.anim);
    $('#btn-anim').classList.toggle('on', S.anim);
    toast(S.anim ? 'Animación activada' : 'Animación en pausa');
  });
  $('#btn-new').addEventListener('click', () => {
    S.sel = null;
    setModel({ title: 'Nuevo diagrama' }, { history: true, fit: true });
    toast('Lienzo nuevo · ⌘Z para deshacer');
  });
  $('#btn-import').addEventListener('click', () => $('#file').click());
  $('#file').addEventListener('change', ev => { const f = ev.target.files[0]; if (f) importFile(f); ev.target.value = ''; });

  function toggleTheme() {
    S.theme = S.theme === 'dark' ? 'light' : 'dark';
    store.set('theme', S.theme);
    applyTheme();
    const b = $('#btn-theme');
    b.classList.remove('spin'); void b.offsetWidth; b.classList.add('spin');
    toast(S.theme === 'dark' ? 'Modo oscuro' : 'Modo claro');
  }
  $('#btn-theme').addEventListener('click', toggleTheme);

  const paletteSel = $('#palette');
  paletteSel.innerHTML = Object.entries(C.palettes).map(([k, p]) => `<option value="${k}">${esc(p.label || k)}</option>`).join('');
  paletteSel.value = S.palette;
  paletteSel.addEventListener('change', () => {
    S.palette = paletteSel.value;
    store.set('palette', S.palette);
    applyTheme();
    render(false);
    renderInspector();
  });

  const exportMenu = $('#export-menu');
  exportMenu.addEventListener('toggle', () => {
    if (!exportMenu.open) return;
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
  const fileName = ext => (fold(S.model.title).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'diagrama') + '.' + ext;
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
  function buildSVG() {
    const b = contentBox() || { x: 0, y: 0, w: 400, h: 200 };
    const pad = 40, top = 56;
    const W = Math.ceil(b.w + pad * 2), Ht = Math.ceil(b.h + pad * 2 + top);
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
    title.textContent = S.model.title;
    out.insertBefore(title, vp);
    return { str: '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(out), W, H: Ht };
  }
  function exportSVG() { download(buildSVG().str, fileName('svg'), 'image/svg+xml'); toast('SVG exportado'); }
  function exportPNG() {
    const { str, W, H: h } = buildSVG(), img = new Image(), scale = 2;
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = W * scale; c.height = h * scale;
      const ctx = c.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, W, h);
      c.toBlob(blob => { if (blob) { download(blob, fileName('png')); toast('PNG exportado'); } else toast('No se pudo crear el PNG'); }, 'image/png');
    };
    img.onerror = () => toast('No se pudo crear el PNG');
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str);
  }
  function exportJSON() { download(serialize(S.model), fileName('json'), 'application/json'); toast('JSON exportado'); }
  function copyJSON() {
    const txt = serialize(S.model);
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = txt; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('JSON copiado'); } catch { toast('No se pudo copiar'); }
      ta.remove();
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(txt).then(() => toast('JSON copiado'), fallback);
    else fallback();
  }
  function importFile(f) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const raw = JSON.parse(r.result);
        S.sel = null;
        setModel(raw, { history: true, animate: true, fit: true });
        toast('Diagrama importado');
      } catch { toast('El archivo no es un JSON válido'); }
    };
    r.readAsText(f);
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
    const f = ev.dataTransfer.files[0];
    if (f) importFile(f);
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
    else if (ev.key === 'Escape') { if (S.play) stopPlay(); else if (S.connecting) cancelConnect(); else select(null); }
    else if (k === 'f') fitView();
    else if (k === 'p') togglePlay();
    else if (k === 't') toggleTheme();
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
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
  }

  /* ---------- arranque ---------- */
  function init() {
    applyTheme();
    $('#app-name').textContent = C.app.name;
    if (store.get('collapsed', false) && !matchMedia('(max-width: 760px)').matches) $('#main').classList.add('collapsed');
    const tab = store.get('tab', 'components');
    $(`.tab[data-tab="${tab}"]`)?.click();
    renderProviders();
    renderPalette();
    renderExamples();
    svg.classList.toggle('anim-off', !S.anim);
    $('#btn-anim').classList.toggle('on', S.anim);
    const saved = store.get('model', null);
    setModel(saved && Array.isArray(saved.nodes) ? saved : clone(EXAMPLES[0]?.diagram || { title: 'Nuevo diagrama' }), { animate: true });
    fitView(false);
    requestAnimationFrame(tick);
  }

  // API para extensiones futuras (consola o scripts propios)
  window.Diagramon = {
    get model() { return clone(S.model); },
    load: (raw, opts = {}) => setModel(raw, { history: true, animate: true, fit: true, ...opts }),
    addNode, addEdge, relayout, fitView, togglePlay, toggleTheme,
    select: ids => select({ kind: 'multi', ids: [].concat(ids) }), align: alignNodes,
    exportSVG, exportPNG, exportJSON, config: C, icons: ICONS
  };

  init();
})();
