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

  /* ---------- tipografías (las incluidas vienen de assets/fonts/fonts.js, en base64) ---------- */
  // Familias disponibles: `system` siempre; el resto solo si tienen archivos empaquetados
  const FONTS = {};
  for (const [k, f] of Object.entries(C.fonts.families)) if (k === 'system' || window.DIAGRAMON_FONTS?.[k]) FONTS[k] = { ...f };
  for (const [k, f] of Object.entries(window.DIAGRAMON_FONTS || {})) FONTS[k] = { label: f.label, ...FONTS[k], css: f.css };
  for (const [k, f] of Object.entries(FONTS)) { f.faces = window.DIAGRAMON_FONTS?.[k]?.faces || []; f.family = window.DIAGRAMON_FONTS?.[k]?.family; }
  const fontKey = k => FONTS[k] ? k : FONTS[C.fonts.default] ? C.fonts.default : 'system';

  /* ---------- vistas: filtros de presentación del mismo modelo (reglas en config.js › views) ---------- */
  const VIEW_DEFAULTS = { groups: 'all', nodeDetail: 'full', edgeLabels: true, dataTags: true, locks: true, cost: true, zones: true, notes: true, review: true, emphasis: null, legendGroups: false, layers: true };
  const VIEWS = {};
  for (const [k, v] of Object.entries(C.views || {})) if (v && typeof v === 'object') VIEWS[k] = { ...VIEW_DEFAULTS, ...v };
  if (!VIEWS.full) VIEWS.full = { label: { en: 'Full', es: 'Completa' }, ...VIEW_DEFAULTS };
  const VIEW_KEYS = Object.keys(VIEWS);
  const VR = { dataTypes: [], dataIconCategories: [], costHeat: ['var(--sev-low)', 'var(--sev-medium)', 'var(--sev-high)', 'var(--sev-critical)'], physicalGroupIcons: [], physicalGroupName: /$^/, ...C.viewRules };
  // Vista válida: la pedida, la de config.js o `full`
  const viewKey = k => (VIEWS[k] ? k : VIEWS[C.defaultView] ? C.defaultView : 'full');
  const viewLabel = k => loc(VIEWS[k]?.label) || k;

  /* ---------- estado ---------- */
  const S = {
    model: null,
    theme: C.themes[store.get('theme')] ? store.get('theme') : C.app.defaultTheme,
    palette: C.palettes[store.get('palette')] ? store.get('palette') : C.app.defaultPalette,  // paletas retiradas caen a la por defecto
    font: fontKey(store.get('font')),
    anim: store.get('anim', C.animation.enabled) && !reducedMotion,
    reach: store.get('reach', C.focus.defaultMode),
    view: { x: 0, y: 0, k: 1 },
    sel: null, hover: null, connecting: null, drag: null, play: null, lastDown: null,
    history: [], future: [], lastType: 'compute', lastExtra: {},
    provider: store.get('provider', 'generic'),
    compare: null, verNote: '', verEdit: null,
    viewKey: viewKey(store.get('view')),  // vista activa (S.view es la cámara); viewChosen: el usuario ya eligió una en esta sesión
    viewChosen: false, flow: null,        // flow: conexión agregada elegida en la vista Contexto
    scope: null,                          // nivel C4 abierto: id del nodo cuyo diagrama interno se ve (null = nivel superior)
    phase: -1, phaseGhosts: store.get('phaseGhosts', true)   // fase elegida en la barra de fases (-1 = todas; no se guarda en el modelo) y si lo futuro se ve atenuado
  };
  // Referencias a elementos SVG y medidas calculadas (nunca se guardan en el modelo)
  const R = { nodes: new Map(), edges: new Map(), groups: new Map(), width: new Map(), gbox: new Map(), notes: new Map(), zones: new Map() };
  // Lo que la vista activa oculta o resume (se recalcula en applyViewMode / updateContext) y el último resaltado
  const VW = { dimNodes: 0, dimEdges: 0, hideNodes: new Set(), hideEdges: new Set(), hideGroups: new Set(), flows: new Map(), ctxBoxes: new Map(), ctxEdges: new Map(), gcost: null, sc: { nodes: new Set(), edges: new Set(), groups: new Set() }, xs: null, ph: null };
  const HL = { f: null, fr: null };

  const svg = $('#canvas'), viewport = $('#viewport'), stage = $('#stage');
  const L = { zones: $('#l-zones'), groups: $('#l-groups'), edges: $('#l-edges'), ctx: $('#l-ctx'), ghosts: $('#l-ghosts'), nodes: $('#l-nodes'), zoneTop: $('#l-zone-top'), notes: $('#l-notes'), guides: $('#l-guides'), scope: $('#l-scope') };

  const ICON = {
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    link: '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    swap: '<svg viewBox="0 0 24 24"><path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/></svg>',
    pencil: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>'
  };

  /* ---------- colores ---------- */
  const paletteKeys = () => Object.keys((C.palettes[S.palette] || Object.values(C.palettes)[0]).dark);
  // También acepta los nombres en inglés de los colores (peach, sky…)
  const COLOR_ALIAS = Object.fromEntries(Object.entries(I.COLOR_NAMES.en).map(([k, v]) => [v, k]));
  // Color propio muy claro u oscuro: se ajusta según el tema con variables de #diagram-css (--cfix-light / --cfix-dark),
  // así sigue leyéndose al cambiar de tema sin redibujar, y las exportaciones hacen lo mismo
  const hexLum = c => {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c).trim());
    if (!m) return null;
    const h = m[1].length === 3 ? [...m[1]].map(x => x + x).join('') : m[1];
    const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const themeSafe = c => { const L = hexLum(c); return L == null ? c : L > 0.6 ? `color-mix(in srgb, ${c}, #000 var(--cfix-light, 0%))` : L < 0.04 ? `color-mix(in srgb, ${c}, #fff var(--cfix-dark, 0%))` : c; };
  // Un color de un modelo importado acaba dentro de atributos style="…": solo se aceptan hex, nombres CSS simples
  // o una variable CSS con respaldo hex opcional (las de config.js, p. ej. las capas: var(--layer-gold, #d4a72c))
  const SAFE_COLOR = /^(#[0-9a-f]{3,8}|[a-z]{3,20}|var\(--[a-z0-9-]{1,40}(,\s?#[0-9a-f]{3,8})?\))$/i;
  const colorVar = k => !k ? null : paletteKeys().includes(k) ? `var(--p-${k})` : COLOR_ALIAS[k] ? `var(--p-${COLOR_ALIAS[k]})` : SAFE_COLOR.test(String(k).trim()) ? themeSafe(String(k).trim()) : null;
  /* ---------- tipos de conexión: los de config.js (edgeStyles) más los propios del diagrama (model.edgeTypes) ----------
     Peso (weight): 'high' | 'critical' engrosan la línea, añaden partículas y agrandan la punta; normal = sin campo.
     Un tipo propio: { id, label, dash?, color?, width?, particles? }; todo se valida aquí (el texto llega a atributos style="…"). */
  const EDGE_W = { high: 1.6, critical: 2.3 };
  const edgeMult = e => EDGE_W[e?.weight] || 1;
  const DASH_RE = /^\d{1,2}(\.\d)?( \d{1,2}(\.\d)?){0,5}$/;
  const EDGE_DASHES = ['', '6 6', '2 6', '12 4 2 4', '16 8', '4 3', '1 5', '10 3'];   // patrones del selector de tipos
  const cleanDash = v => {
    if (v == null) return null;
    const s = String(v).replace(/[,;]/g, ' ').trim().replace(/\s+/g, ' ');
    return s === '' ? '' : DASH_RE.test(s) && s.split(' ').some(x => +x > 0) ? s : null;
  };
  const cleanEdgeTypes = v => {
    const out = [], seen = new Set();
    (Array.isArray(v) ? v : []).forEach(t => {
      if (out.length >= 24 || !t || typeof t !== 'object') return;
      const id = String(t.id ?? '').trim().toLowerCase();
      if (!/^[a-z0-9-]{1,32}$/.test(id) || seen.has(id) || Object.hasOwn(C.edgeStyles, id)) return;
      seen.add(id);
      const o = { id, label: String(t.label ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) || id };
      const d = cleanDash(t.dash); if (d) o.dash = d;
      const c = t.color == null ? '' : String(t.color).trim(); if (c && colorVar(c)) o.color = c;
      const w = +t.width; if (t.width != null && t.width !== '' && Number.isFinite(w) && w >= 1 && w <= 4) o.width = Math.round(w * 10) / 10;
      const p = +t.particles; if (t.particles != null && t.particles !== '' && Number.isInteger(p) && p >= 0 && p <= 4) o.particles = p;
      out.push(o);
    });
    return out;
  };
  const customTypes = () => (Array.isArray(S.model?.edgeTypes) ? S.model.edgeTypes : []);
  // Todos los tipos: { clave: { label, dash, particles, width, color?, custom? } } (los propios van después)
  const edgeStyles = () => {
    const o = { ...C.edgeStyles };
    customTypes().forEach(t => { o[t.id] = { label: t.label, dash: t.dash || '', particles: t.particles ?? 1, width: t.width ?? 1.8, color: t.color, custom: true }; });
    return o;
  };
  const edgeKey = id => (typeof id === 'string' && (Object.hasOwn(C.edgeStyles, id) || customTypes().some(t => t.id === id)) ? id : 'sync');
  const edgeStyleOf = id => edgeStyles()[edgeKey(id)];
  const edgeCls = k => (Object.hasOwn(C.edgeStyles, k) ? `edge-${k}` : `edge-c-${k}`); // los propios con prefijo: no chocan con .edge-line, .edge-label…
  const edgeStyleLabel = id => loc(edgeStyleOf(id).label);
  // Patrón de trazos escalado al grosor (con extremos redondos, un trazo corto desaparece si la línea engorda)
  const dashFor = (cfg, mu) => (cfg.dash ? cfg.dash.split(' ').map(x => +(+x * mu).toFixed(1)).join(' ') : '');
  const arrowK = mu => 1 + (mu - 1) * 0.55;
  const maxWeight = list => (list.some(e => e.weight === 'critical') ? 'critical' : list.some(e => e.weight === 'high') ? 'high' : '');
  const typeOf = n => C.types[n.type] || C.types.generic;
  const typeLabel = type => loc((C.types[type] || C.types.generic).label);
  const nodeColor = n => colorVar(n && n.color) || colorVar(typeOf(n || {}).color) || 'var(--accent)';
  const categories = () => [...new Set([...C.categories, ...Object.values(C.types).map(t => t.category || 'Otros')])];
  const typeIcon = type => `<svg viewBox="0 0 24 24">${(C.types[type] || C.types.generic).icon}</svg>`;

  /* ---------- iconos oficiales (assets/icons/*.js, generados por tools/build-icons.py) ---------- */
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

  /* ---------- residencia y soberanía de datos ---------- */
  // Región de nodos y grupos (heredada del grupo más cercano) y detección de datos sensibles que cruzan jurisdicciones.
  // Jurisdicciones y reglas de coincidencia: config.js › residency
  const RES = C.residency || {}, JURS = RES.jurisdictions || {};
  const cleanRegion = v => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');
  const jurCache = new Map();
  // Jurisdicción de un texto de región → { key, label, short, of } o null si no se conoce
  const jurOf = region => {
    const r = cleanRegion(region);
    if (!r) return null;
    if (!jurCache.has(r)) {
      const k = Object.keys(JURS).find(j => { try { return JURS[j].match instanceof RegExp && new RegExp(JURS[j].match.source, 'i').test(r); } catch { return false; } });
      jurCache.set(r, k ? { key: k, label: loc(JURS[k].label) || k, short: JURS[k].short || k.toUpperCase(), of: loc(JURS[k].of) || loc(JURS[k].label) || k } : null);
    }
    return jurCache.get(r);
  };
  // Un código de región dentro del nombre de un grupo («Región eu-west-1 (Irlanda)»): solo palabras de 3+ letras para no confundir «es», «it»…
  const deduceRegion = label => String(label ?? '').split(/[^A-Za-z0-9-]+/).map(w => w.replace(/^-+|-+$/g, '')).find(w => w.length > 2 && jurOf(w));
  // { value, from }: from = null si es propia; si no { id, label, deduced } del grupo que la aporta. Nodo: su grupo y los de arriba; grupo: él y los de arriba
  function regionOf(x, m = S.model) {
    if (!x) return { value: '', from: null };
    const own = cleanRegion(x.region);
    if (own) return { value: own, from: null };
    const isNode = 'type' in x, chain = [];
    let g = isNode ? x.group : x.parent, i = 0;
    while (g && i++ < 50) { const gg = m.groups.find(q => q.id === g); if (!gg) break; chain.push(gg); g = gg.parent; }
    const hit = chain.find(q => cleanRegion(q.region));
    if (hit) return { value: cleanRegion(hit.region), from: { id: hit.id, label: hit.label, deduced: false } };
    // Un grupo también puede llamarse como su región
    const named = (isNode ? chain : [x, ...chain]).map(q => [q, deduceRegion(q.label)]).find(([, r]) => r);
    return named ? { value: named[1], from: { id: named[0].id, label: named[0].label, deduced: true } } : { value: '', from: null };
  }
  const regionLabel = r => { const j = jurOf(r); return j ? `${r} (${j.short})` : r; };
  // Datos sensibles que viajan por la conexión: los suyos o, sin `data`, los del origen (y del destino si es bidireccional)
  const sensClasses = (e, get) => {
    const ks = e.data?.length ? e.data : [...(get(e.from)?.data || []), ...(e.both ? get(e.to)?.data || [] : [])];
    return [...new Set(ks)].filter(k => DATA[k]?.sensitive).sort((a, b) => Object.keys(DATA).indexOf(a) - Object.keys(DATA).indexOf(b));
  };
  // null o { from: {region, jur}, to: {region, jur}, classes, approved }; byId: función o Map
  function crossBorder(e, byId) {
    const get = typeof byId === 'function' ? byId : id => byId.get(id);
    const a = get(e.from), b = get(e.to);
    if (!a || !b || e.from === e.to) return null;
    const ra = regionOf(a).value, rb = regionOf(b).value, ja = jurOf(ra), jb = jurOf(rb);
    if (!ja || !jb) return null;
    if (ja.key === jb.key && !(RES.warnSameJurisdiction && ra.toLowerCase() !== rb.toLowerCase())) return null;
    const classes = sensClasses(e, get);
    if (!classes.length) return null;
    return { from: { region: ra, jur: ja }, to: { region: rb, jur: jb }, classes, approved: e.transferOk === true };
  }
  const isXBorder = (e, byId) => { const c = crossBorder(e, byId); return !!c && !c.approved; };
  const classShorts = cs => cs.map(k => loc(DATA[k]?.short) || k.toUpperCase());
  // «⚠ PII leaves the EU → US»
  const xbWarn = cb => T('res.warn', { cls: classShorts(cb.classes).join(', '), n: cb.classes.length, from: cb.from.jur.of, to: cb.to.jur.label, same: cb.from.jur.key === cb.to.jur.key, fromR: cb.from.region, toR: cb.to.region });
  /* ---------- capas del data lake (bronze / silver / gold · raw / curated / serving) ---------- */
  const DL = C.dataLayers || {}, DL_ALIAS = C.layerAliases || {};
  // Clave válida (acepta alias: raw, plata, oro…) o null
  const cleanLayer = v => { const k = fold(v).trim(); return DL[k] ? k : DL[DL_ALIAS[k]] ? DL_ALIAS[k] : null; };
  const layerNaming = () => (S.model?.layerNames === 'zones' ? 'zones' : 'medallion');
  // Datos de una capa con el nombre elegido por el documento (layerNames): medallion = label, zones = alt
  const layerInfo = (k, naming = layerNaming()) => {
    const d = DL[k], z = naming === 'zones';
    return d ? { k, label: loc(z && d.alt ? d.alt : d.label) || k, short: (z && d.altShort) || d.short || k[0].toUpperCase(), color: colorVar(d.color) || 'var(--muted)' } : null;
  };
  // Capa efectiva de un nodo o grupo: la propia o la del grupo más cercano que la tenga. from = id de quien la define
  function layerOf(x) {
    if (x && DL[x.layer]) return { value: x.layer, from: x.id };
    let gid = x && (x.group || x.parent), i = 0;
    while (gid && i++ < 50) {
      const o = groupById(gid);
      if (!o) break;
      if (DL[o.layer]) return { value: o.layer, from: o.id };
      gid = o.parent;
    }
    return { value: null, from: null };
  }
  // Etiqueta con el nombre de una capa (borde de color, texto en mayúsculas); devuelve su ancho
  function layerPill(parent, x, y, li, h) {
    const txt = li.label.toUpperCase(), w = Math.ceil(textW(txt, FONT.dtag) + txt.length * 0.4) + 12;
    const g = el('g', { class: 'layer-pill', style: `--lc:${li.color}` }, parent);
    el('rect', { x, y, width: w, height: h, rx: h / 2 }, g);
    el('text', { x: x + w / 2, y: y + h / 2 + 3.4, 'text-anchor': 'middle' }, g).textContent = txt;
    return w;
  }
  const layerPillW = li => Math.ceil(textW(li.label.toUpperCase(), FONT.dtag) + li.label.length * 0.4) + 12;
  // Franja de color pegada al borde izquierdo de la tarjeta, con la misma curva de las esquinas, y la etiqueta abajo a la izquierda
  function drawNodeLayer(parent, li) {
    const r = C.node.radius, bw = 5, dy = r - Math.sqrt(Math.max(0, r * r - (r - bw) * (r - bw)));
    const g = el('g', { class: 'node-layer', style: `--lc:${li.color}` }, parent);
    el('path', { class: 'layer-band', d: `M${bw},${dy} A${r},${r} 0 0 0 0,${r} V${H - r} A${r},${r} 0 0 0 ${bw},${H - dy} Z` }, g);
    layerPill(g, 14, H - 8, li, 16);
  }
  // Capas en uso entre los nodos y grupos que se ven: Map clave → ids de nodos (en el orden de config.js)
  function layerUsage(nodes = visNodes(), groups = S.model.groups.filter(g => !VW.hideGroups.has(g.id))) {
    const use = new Map(Object.keys(DL).map(k => [k, []]));
    nodes.forEach(n => { const l = layerOf(n).value; if (l) use.get(l).push(n.id); });
    const used = new Set(groups.map(g => g.layer).filter(k => DL[k]));
    return [...use].filter(([k, ids]) => ids.length || used.has(k));
  }

  /* ---------- hallazgos: registro común (revisión automática, STRIDE, cumplimiento) ---------- */
  // Hallazgo = { id, source, rule, severity: 'low' | 'medium' | 'high' | 'critical', target: { kind: 'node' | 'edge' | 'group' | 'zone', id }, title, detail?, fix? }
  // `id` es estable (p. ej. `rule:sec.db-backup:node:db1`) para poder descartarlo y recordarlo. Solo avisan: nunca bloquean nada.
  // Cada fuente registra una función (modelo) → [hallazgos] con addFindingSource; allFindings las junta (una fuente que falla no tumba las demás).
  const FINDING_SOURCES = [];
  const addFindingSource = (key, fn) => { FINDING_SOURCES.push({ key, fn }); };
  function allFindings(m = S.model) {
    return m ? FINDING_SOURCES.flatMap(s => { try { return s.fn(m) || []; } catch (err) { console.error(`findings/${s.key}`, err); return []; } }) : [];
  }
  // CSV para Excel: separador coma, comillas cuando hace falta y BOM para que respete tildes
  const csvCell = v => { const t = v == null ? '' : String(v); return /[",\r\n]/.test(t) || /^[=+\-@]/.test(t) ? `"${(/^[=+\-@]/.test(t) ? "'" : '') + t.replace(/"/g, '""')}"` : t; };
  const toCSV = rows => '\ufeff' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');

  /* ---------- disposición de migración (6R): qué se hace con cada componente al migrar (config.js › migration) ---------- */
  // Un nodo puede llevar disposition: 'retain' | 'rehost' | 'replatform' | 'refactor' | 'repurchase' | 'retire' (y 'relocate' si config.js lo enciende). Sin él no hay clave: JSON y exportaciones idénticos.
  // Es del diagrama (entra en las fotos de versiones). Se acepta también el nombre en español y los alias de config.js; un valor desconocido se descarta.
  /* migration:start */
  const MGC = C.migration || {}, MGR = MGC.rules || {};
  const MG = Object.fromEntries(Object.entries(MGC.dispositions || {}).filter(([, d]) => d && d.enabled !== false));
  const mgNorm = x => fold(x).replace(/[\s_-]+/g, '');
  const MG_BY = new Map();
  Object.entries(MG).forEach(([k, d]) => [d.label?.en, d.label?.es, ...(d.alias || [])].forEach(w => { if (w) MG_BY.set(mgNorm(w), k); }));
  Object.keys(MG).forEach(k => MG_BY.set(mgNorm(k), k));   // la clave manda sobre cualquier alias
  const cleanDisposition = v => (typeof v === 'string' ? MG_BY.get(mgNorm(v)) || null : null);
  const mgInfo = k => { const d = MG[k]; return d ? { k, label: loc(d.label) || k, short: d.short || k.slice(0, 2).toUpperCase(), color: colorVar(d.color) || 'var(--muted)', hint: loc(d.hint) || '' } : null; };
  // Reparto { rehost: 3, retire: 1 } como «RH 3 · RT 1», en el orden de config.js (texto plano; el título lleva el nombre completo)
  const mgText = c => Object.keys(MG).filter(k => c?.[k]).map(k => `${mgInfo(k).short} ${c[k]}`).join(' · ');
  const mgChips = c => Object.keys(MG).filter(k => c?.[k]).map(k => { const i = mgInfo(k); return `<span class="mg-chip" style="--mg:${esc(i.color)}" title="${esc(i.label)}">${esc(i.short)} ${c[k]}</span>`; }).join(' ');
  // Avisos de coherencia entre la disposición y las fases / decisiones (config.js › migration.rules); solo avisan
  addFindingSource('migration', m => {
    if (!m.nodes.some(n => n.disposition)) return [];
    const out = [], on = id => !!MGR[id] && MGR[id].enabled !== false, sev = id => (SEVERITY.includes(MGR[id]?.severity) ? MGR[id].severity : 'low');
    const phased = !!m.phases?.length, withAdr = new Set((m.decisions || []).flatMap(d => d.links?.nodes || []));
    const add = (rule, n, title, fix) => out.push({ id: `migration:${rule}:node:${n.id}`, source: 'migration', rule: `mig.${rule}`, severity: sev(`mig.${rule}`), target: { kind: 'node', id: n.id }, title, fix });
    m.nodes.forEach(n => {
      const d = mgInfo(n.disposition);
      if (!d) return;
      if (on('mig.retire-no-until') && n.disposition === 'retire' && phased && !n.until) add('retire-no-until', n, T('mig.f.retire.t', n.label), T('mig.f.retire.fix'));
      if (on('mig.until-kept') && n.until && (MGR['mig.until-kept'].keepers || []).includes(n.disposition)) add('until-kept', n, T('mig.f.kept.t', { n: n.label, d: d.label }), T('mig.f.kept.fix'));
      if (on('mig.change-no-decision') && (MGR['mig.change-no-decision'].needsDecision || []).includes(n.disposition) && !withAdr.has(n.id)) add('change-no-decision', n, T('mig.f.adr.t', { n: n.label, d: d.label }), T('mig.f.adr.fix'));
    });
    return out;
  });
  /* migration:end */

  /* ---------- comentarios: hilos sobre un elemento (modelo) ---------- */
  // m.comments = [{ id: 'CM-001', on: { kind, id? }, author?, date?: 'AAAA-MM-DD', text, status?: 'resolved', internal?: true, source?: 'client', was?, replies?: [{ author?, date?, text }] }]
  // on.kind: node | edge | group | decision | requirement | version, o general (sin id). Un destino que ya no existe pasa a «general» y `was` guarda el id que tenía.
  // El orden del arreglo es el cronológico (el más antiguo primero). internal: nunca sale del documento (archivos compartidos, informe). Sin comentarios no hay clave: JSON y exportaciones idénticos.
  /* commentModel:start */
  const CMC = C.comments || {}, CM_MAX = CMC.max || 500, CM_REPLIES = CMC.maxReplies || 50, CM_TEXT = CMC.textMax || 4000, CMR = CMC.rules || {};
  const CM_KINDS = ['node', 'edge', 'group', 'decision', 'requirement', 'version'];
  const cmHas = (m, on) => !!on && CM_KINDS.includes(on.kind) && ({ node: m.nodes, edge: m.edges, group: m.groups, decision: m.decisions, requirement: m.requirements, version: m.versions }[on.kind] || []).some(x => x.id === on.id);
  const cmStr = (v, n) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, n);
  const cmWho = v => cmStr(v, 80).replace(/\s+/g, ' ');
  function cleanComments(raw, m) {
    const out = [], seen = new Set();
    (Array.isArray(raw) ? raw : []).forEach(c => {
      if (out.length >= CM_MAX || !c || typeof c !== 'object' || Array.isArray(c)) return;
      const text = cmStr(c.text, CM_TEXT);
      if (!text) return;
      const on0 = c.on && typeof c.on === 'object' && !Array.isArray(c.on) ? c.on : {}, oid = cmStr(on0.id, 120);
      let on = { kind: 'general' }, was = cmStr(c.was, 120);
      if (CM_KINDS.includes(on0.kind) && oid) { if (cmHas(m, { kind: on0.kind, id: oid })) { on = { kind: on0.kind, id: oid }; was = ''; } else was = oid; }
      const rid = cmStr(c.id, 40), o = { id: /^CM-\d+$/.test(rid) && !seen.has(rid) ? rid : '', on };
      if (o.id) seen.add(o.id);
      const author = cmWho(c.author);
      if (author) o.author = author;
      if (isDay(c.date)) o.date = c.date;
      o.text = text;
      if (c.status === 'resolved') o.status = 'resolved';
      if (c.internal === true) o.internal = true;
      if (c.source === 'client') o.source = 'client';
      { const imp = cmStr(c.imp, 80); if (imp) o.imp = imp; }   // de dónde se importó (id del archivo + id del comentario): importar dos veces no duplica
      if (was) o.was = was;
      const replies = (Array.isArray(c.replies) ? c.replies : []).filter(r => r && typeof r === 'object' && cmStr(r.text, CM_TEXT)).slice(0, CM_REPLIES).map(r => {
        const x = {}, a = cmWho(r.author);
        if (a) x.author = a;
        if (isDay(r.date)) x.date = r.date;
        x.text = cmStr(r.text, CM_TEXT);
        { const imp = cmStr(r.imp, 80); if (imp) x.imp = imp; }
        return x;
      });
      if (replies.length) o.replies = replies;
      out.push(o);
    });
    let n = Math.max(0, ...out.map(c => +c.id.slice(3) || 0));
    out.forEach(c => { if (!c.id) c.id = `CM-${String(++n).padStart(3, '0')}`; });
    return out;
  }
  // Archivo de comentarios del revisor (ya descifrado): contenido no confiable, se valida y se limpia; null si no es de este formato
  function cleanFeedback(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.format !== 'diagramon-feedback' || raw.v !== 1) return null;
    const out = { shareId: cmStr(raw.shareId, 40).replace(/[^0-9a-zA-Z-]/g, ''), title: cmStr(raw.title, 200), author: cmWho(raw.author), created: typeof raw.created === 'string' ? raw.created.slice(0, 30) : '', comments: [] }, seen = new Set();
    (Array.isArray(raw.comments) ? raw.comments : []).slice(0, CM_MAX).forEach(c => {
      if (!c || typeof c !== 'object') return;
      const id = cmStr(c.id, 40), text = cmStr(c.text, CM_TEXT);
      if (!id || !text || seen.has(id)) return;
      seen.add(id);
      const o = { id, author: cmWho(c.author) || out.author, date: isDay(c.date) ? c.date : '', text };
      if (typeof c.replyTo === 'string' && c.replyTo.trim()) o.replyTo = cmStr(c.replyTo, 40);
      else { const k = c.on && c.on.kind, oid = cmStr(c.on && c.on.id, 120); o.on = CM_KINDS.includes(k) && oid ? { kind: k, id: oid } : { kind: 'general' }; }
      out.comments.push(o);
    });
    return out;
  }
  // Mezcla el archivo con los comentarios del documento sin tocarlos (devuelve la lista nueva y el recuento). Cada comentario se reconoce por «id del archivo:id», así importar dos veces no duplica.
  // Una respuesta va al hilo con ese id; si ese hilo no está, entra como hilo nuevo. Los comentarios sobre elementos que ya no existen pasan a «general».
  function mergeFeedback(m, fb, day) {
    const list = (m.comments || []).map(c => ({ ...c, ...(c.replies ? { replies: c.replies.map(r => ({ ...r })) } : {}) }));
    const known = new Set(list.flatMap(c => [c.imp, ...(c.replies || []).map(r => r.imp)]).filter(Boolean)), res = { threads: 0, replies: 0, dup: 0, orphan: 0, stray: 0, capped: 0 };
    fb.comments.forEach(c => {
      const imp = `${fb.shareId}:${c.id}`;
      if (known.has(imp)) { res.dup++; return; }
      known.add(imp);
      const date = c.date || day;
      if (c.replyTo) {
        const t = list.find(x => x.id === c.replyTo);
        if (t) { t.replies = [...(t.replies || []), { author: c.author, date, text: c.text, imp }]; res.replies++; return; }
        res.stray++;
        list.push({ id: '', on: { kind: 'general' }, author: c.author, date, text: c.text, source: 'client', imp });
        res.threads++;
        return;
      }
      if (c.on.kind !== 'general' && !cmHas(m, c.on)) res.orphan++;
      list.push({ id: '', on: c.on, author: c.author, date, text: c.text, source: 'client', imp });
      res.threads++;
    });
    res.comments = cleanComments(list, m);
    res.capped = Math.max(0, list.length - res.comments.length);
    return res;
  }
  const cmOpen = (m, kind, id) => (m.comments || []).filter(c => c.status !== 'resolved' && (kind == null || (c.on.kind === kind && c.on.id === id)));
  // Hallazgos (fuente «comments»): hilos sin resolver sobre un componente, una conexión o un grupo (config.js › comments.rules)
  addFindingSource('comments', m => {
    const r = CMR['cmt.open'];
    if (!r || r.enabled === false || !m.comments?.length) return [];
    const per = new Map(), sev = SEVERITY.includes(r.severity) ? r.severity : 'low';
    cmOpen(m).filter(c => ['node', 'edge', 'group'].includes(c.on.kind)).forEach(c => { const k = `${c.on.kind}:${c.on.id}`; per.set(k, { on: c.on, n: (per.get(k)?.n || 0) + 1 }); });
    return [...per.values()].map(({ on, n }) => ({ id: `comments:open:${on.kind}:${on.id}`, source: 'comments', rule: 'cmt.open', severity: sev, target: { kind: on.kind, id: on.id }, title: T('cmt.f.t', n), fix: T('cmt.f.fix') }));
  });
  /* commentModel:end */

  /* ---------- radar tecnológico: anillo y fin de soporte de los productos usados (config.js › techRadar) ---------- */
  // Un componente se reconoce con una entrada del radar por su icono, su tipo o su texto (config.js), o se fija con radar: '<id>' ('none' lo excluye). Sin entradas no hay nada: JSON y exportaciones idénticos.
  // El diagrama puede traer sus propias entradas en m.radar (se suman a las de config.js; el mismo id las reemplaza). Es del diagrama (entra en las fotos de versiones).
  /* radar:start */
  const RDC = C.techRadar || {}, RDR = RDC.rules || {};
  const RD_KEYS = ['adopt', 'trial', 'hold', 'retire'], RD_ID = /^[A-Za-z0-9_.-]{1,40}$/, RD_MAX = 60;
  const rdRingInfo = k => { if (!RD_KEYS.includes(k)) return null; const r = RDC.rings?.[k] || {}; return { k, label: loc(r.label) || k, short: r.short || k.toUpperCase(), color: colorVar(r.color) || 'var(--muted)' }; };
  const rdFold = x => fold(x).replace(/\s+/g, ' ').trim();
  const rdDay = (y, mo, d) => `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  // Fin de soporte 'AAAA-MM' (último día de ese mes) o 'AAAA-MM-DD' → 'AAAA-MM-DD'; '' si no es una fecha válida
  const rdEos = v => {
    const r = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(v ?? '').trim());
    if (!r) return '';
    const y = +r[1], mo = +r[2], last = mo >= 1 && mo <= 12 ? new Date(Date.UTC(y, mo, 0)).getUTCDate() : 0, d = r[3] == null ? last : +r[3];
    return d >= 1 && d <= last ? rdDay(y, mo, d) : '';
  };
  const rdPhaseDay = v => { const r = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(v ?? '')); return r ? `${r[1]}-${r[2]}-${r[3] || '01'}` : ''; };
  const rdPlus = (day, n) => { const d = new Date(`${day}T12:00`); d.setMonth(d.getMonth() + n); return rdDay(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
  // Textos: simples o { en, es }; se guardan limpios y se traducen al mostrarlos
  const rdText = (v, max) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) { const o = {}; Object.entries(v).forEach(([k, t]) => { const x = /^[a-z]{2}$/.test(k) ? rdText(t, max) : ''; if (x) o[k] = x; }); return Object.keys(o).length ? o : ''; }
    return typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\s+/g, ' ').trim().slice(0, max) : '';
  };
  function cleanRadarEntry(e) {
    if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
    const id = String(e.id ?? '').trim(), ring = String(e.ring ?? '').trim().toLowerCase();
    if (!RD_ID.test(id) || !RD_KEYS.includes(ring)) return null;
    const mt = e.match && typeof e.match === 'object' ? e.match : {}, match = {};
    ['icon', 'type', 'text'].forEach(k => { const t = rdText(mt[k], 80); if (t && typeof t === 'string') match[k] = t; });
    if (!Object.keys(match).length) return null;
    const o = { id, ring, match };
    [['name', 80], ['replaceWith', 80], ['note', 200]].forEach(([k, max]) => { const t = rdText(e[k], max); if (t) o[k] = t; });
    { const eos = String(e.eos ?? '').trim(); if (rdEos(eos)) o.eos = eos; }
    return o;
  }
  function cleanRadarList(raw) {
    const seen = new Set(), out = [];
    (Array.isArray(raw) ? raw : []).forEach(x => { const e = cleanRadarEntry(x); if (e && !seen.has(e.id) && out.length < RD_MAX) { seen.add(e.id); out.push(e); } });
    return out;
  }
  // radar de un componente: un id (lo fija a esa entrada) o 'none' (false también); cualquier otra cosa no es nada
  const cleanRadarRef = v => (v === false || (typeof v === 'string' && v.trim().toLowerCase() === 'none') ? 'none' : typeof v === 'string' && RD_ID.test(v.trim()) ? v.trim() : null);
  const RD_BASE = cleanRadarList(RDC.entries);
  let rdMemo = { key: null, list: RD_BASE };
  const radarEntries = m => {
    const d = m?.radar;
    if (!d?.length) return RD_BASE;
    if (rdMemo.key !== d) rdMemo = { key: d, list: [...RD_BASE.map(b => d.find(x => x.id === b.id) || b), ...d.filter(x => !RD_BASE.some(b => b.id === x.id))] };
    return rdMemo.list;
  };
  const radarOf = (n, m) => {
    if (!n || n.radar === 'none') return null;
    const list = radarEntries(m);
    if (!list.length) return null;
    if (n.radar) return list.find(e => e.id === n.radar) || null;
    const hay = rdFold(`${n.label || ''} ${n.sub || ''}`);
    return list.find(e => (!e.match.icon || n.icon === e.match.icon) && (!e.match.type || n.type === e.match.type) && (!e.match.text || hay.includes(rdFold(e.match.text)))) || null;
  };
  // Estado del soporte: none (sin fecha) · ok · soon (termina dentro de warnMonths) · ended (la fecha ya pasó)
  const radarStatus = (e, now) => {
    const eos = e?.eos ? rdEos(e.eos) : '';
    if (!eos) return 'none';
    return eos < now ? 'ended' : eos <= rdPlus(now, Math.max(0, Math.min(60, +RDC.warnMonths >= 0 ? +RDC.warnMonths : 6))) ? 'soon' : 'ok';
  };
  const radarInfo = (n, m, now) => {
    const e = radarOf(n, m), ring = e && rdRingInfo(e.ring);
    return e && ring ? { entry: e, ring, name: loc(e.name) || e.id, eos: e.eos || '', eosDay: e.eos ? rdEos(e.eos) : '', status: radarStatus(e, now), replaceWith: loc(e.replaceWith) || '', note: loc(e.note) || '' } : null;
  };
  // Avisos del radar en Revisión (config.js › techRadar.rules); solo avisan
  addFindingSource('radar', m => {
    if (!radarEntries(m).length) return [];
    const out = [], now = today(), on = id => !!RDR[id] && RDR[id].enabled !== false, sev = id => (SEVERITY.includes(RDR[id]?.severity) ? RDR[id].severity : 'low');
    const ph = m.phases || [], phIx = id => ph.findIndex(p => p.id === id);
    m.nodes.forEach(n => {
      const i = radarInfo(n, m, now);
      if (!i) return;
      const v = { n: n.label, p: i.name, d: i.eosDay ? fmtDay(i.eosDay) : '', r: i.replaceWith };
      const add = (rule, fix = '') => out.push({ id: `radar:${rule}:node:${n.id}`, source: 'radar', rule: `rdr.${rule}`, severity: sev(`rdr.${rule}`), target: { kind: 'node', id: n.id }, title: T(`radar.f.${rule}.t`, v), fix: fix || T(i.replaceWith ? 'radar.f.fix.replace' : 'radar.f.fix.plan', v) });
      const ended = i.status === 'ended';
      if (ended) { if (on('rdr.eos-passed')) add('eos-passed'); }
      else if (i.entry.ring === 'retire') { if (on('rdr.retire')) add('retire'); }
      else if (i.status === 'soon' && on('rdr.eos-soon')) add('eos-soon');
      if (!ended && i.eosDay && ph.length && on('rdr.phase-after-eos')) {
        const last = n.until ? phIx(n.until) - 1 : ph.length - 1, pd = last >= 0 ? rdPhaseDay(ph[last].date) : '';
        if (pd && pd > i.eosDay) out.push({ id: `radar:phase-after-eos:node:${n.id}`, source: 'radar', rule: 'rdr.phase-after-eos', severity: sev('rdr.phase-after-eos'), target: { kind: 'node', id: n.id }, title: T('radar.f.phase-after-eos.t', { ...v, f: ph[last].name || ph[last].id }), fix: T('radar.f.fix.phase', v) });
      }
      if (i.entry.ring === 'hold' && n.phase && phIx(n.phase) > 0 && on('rdr.hold-added')) add('hold-added', T('radar.f.fix.hold', v));
      if (i.entry.ring === 'retire' && n.disposition === 'retain' && on('rdr.retire-retained')) add('retire-retained', T('radar.f.fix.migrate', v));
    });
    return out;
  });
  /* radar:end */

  /* ---------- cumplimiento normativo (ISO 27001, SOC 2, GDPR, HIPAA, PCI DSS) ---------- */
  // controls: { 'iso27001:A.8.24': 'met' | 'partial' | 'gap' | 'na' } en nodos y grupos; los nodos heredan de sus grupos (gana el más cercano y, al final, el propio).
  // Catálogo, sugerencias y cómo añadir marcos o controles: config.js › compliance
  const CMP = C.compliance || {}, FWS = CMP.frameworks || {};
  const CTL_STATUS = ['met', 'partial', 'gap', 'na'], CTL_ALIAS = { cumple: 'met', parcial: 'partial', brecha: 'gap', 'n/a': 'na' };
  const CTL_COLOR = { met: 'var(--p-menta)', partial: 'var(--p-limon)', gap: 'var(--p-coral)', na: 'var(--muted)' }, CTL_SYM = { met: '✓', partial: '◐', gap: '✗', na: '—' };
  const cleanCtlStatus = v => { const k = fold(v).trim(); return CTL_STATUS.includes(k) ? k : CTL_ALIAS[k] || null; };
  // Solo claves «marco:id» con estado válido; los marcos desconocidos se conservan (catálogos propios)
  const cleanControls = raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const o = {};
    Object.entries(raw).forEach(([k, v]) => { const key = String(k).trim(), i = key.indexOf(':'), s = cleanCtlStatus(v); if (i > 0 && i < key.length - 1 && s) o[key] = s; });
    return Object.keys(o).length ? o : null;
  };
  const ctlSplit = key => { const i = key.indexOf(':'); return [key.slice(0, i), key.slice(i + 1)]; };
  const ctlInfo = key => {
    const [fw, id] = ctlSplit(key), f = FWS[fw], c = f?.controls?.[id];
    return { key, fw, id, short: f?.short || fw.toUpperCase(), fwLabel: f ? loc(f.label) : fw, title: c ? loc(c.label) : '', known: !!c };
  };
  const CTL_ALL = Object.entries(FWS).flatMap(([fw, f]) => Object.keys(f.controls || {}).map(id => `${fw}:${id}`));
  // Orden: el del catálogo (marcos y controles en el orden de config.js); los desconocidos al final
  const sortCtl = keys => {
    const fws = Object.keys(FWS), rank = k => { const i = CTL_ALL.indexOf(k); return i >= 0 ? i : 1e6 + (fws.indexOf(ctlSplit(k)[0]) < 0 ? 1e3 : 0); };
    return [...keys].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, undefined, { numeric: true }));
  };
  // Controles efectivos de un nodo o grupo: Map clave → { status, from }. Primero los del grupo más lejano, luego los más cercanos y al final los propios.
  // from = null si es propio; si no, id del grupo que lo aporta
  function controlsOf(x, m = S.model) {
    const out = new Map();
    if (!x) return out;
    const chain = [];
    let g = 'type' in x ? x.group : x.parent, i = 0;
    while (g && i++ < 50) { const gg = m.groups.find(q => q.id === g); if (!gg) break; chain.push(gg); g = gg.parent; }
    chain.reverse().forEach(q => Object.entries(q.controls || {}).forEach(([k, s]) => out.set(k, { status: s, from: q.id })));
    Object.entries(x.controls || {}).forEach(([k, s]) => out.set(k, { status: s, from: null }));
    return out;
  }
  // Clases de datos que maneja un nodo: las suyas y las de sus conexiones
  const dataClassesOf = (n, m = S.model) => [...new Set([...(n.data || []), ...m.edges.filter(e => e.from === n.id || e.to === n.id).flatMap(e => e.data || [])])]
    .sort((a, b) => Object.keys(DATA).indexOf(a) - Object.keys(DATA).indexOf(b));
  const nodesUnder = (x, m = S.model) => ('type' in x ? [x] : m.nodes.filter(n => inGroup(n, x.id)));
  // Sugerencias para una lista de nodos/grupos según sus clases de datos (y las conexiones entre jurisdicciones); sin las ya marcadas en todos
  function ctlSuggest(list, m = S.model) {
    const sg = CMP.suggest || {}, byId = new Map(m.nodes.map(n => [n.id, n])), out = [];
    const add = k => { if (!out.includes(k) && ctlInfo(k).known) out.push(k); };
    const ns = [...new Set(list.flatMap(x => nodesUnder(x, m)))], cls = new Set(ns.flatMap(n => dataClassesOf(n, m)));
    Object.keys(DATA).filter(k => cls.has(k)).forEach(k => (sg[k] || []).forEach(add));
    if (ns.some(n => m.edges.some(e => (e.from === n.id || e.to === n.id) && crossBorder(e, byId)))) (sg.crossBorder || []).forEach(add);
    const effs = list.map(x => controlsOf(x, m));
    return out.filter(k => !effs.every(e => e.has(k)));
  }
  // Filas de la matriz: nodos con algún control o con datos sensibles
  const cmpRows = (m = S.model) => m.nodes.map(n => ({ n, eff: controlsOf(n, m), cls: dataClassesOf(n, m).filter(k => DATA[k]?.sensitive) })).filter(r => r.eff.size || r.cls.length);
  // { rows, keys (controles en uso, ordenados; opcionalmente de un marco), stats: Map clave → { met, partial, gap, na, unmapped } }
  function cmpModel(m = S.model, fw = '') {
    const rows = cmpRows(m), used = new Set(rows.flatMap(r => [...r.eff.keys()]));
    const keys = sortCtl([...used]).filter(k => !fw || ctlSplit(k)[0] === fw), stats = new Map(keys.map(k => [k, { met: 0, partial: 0, gap: 0, na: 0, unmapped: 0 }]));
    rows.forEach(r => keys.forEach(k => { stats.get(k)[r.eff.get(k)?.status || 'unmapped']++; }));
    return { rows, keys, stats };
  }
  const cmpFrameworks = keys => [...new Set(keys.map(k => ctlSplit(k)[0]))];
  const cmpGroupName = n => groupById(n.group)?.label || '';
  // CSV ancho (una fila por componente, una columna por control) o largo (una fila por componente × control)
  function complianceCSV(kind = 'wide', m = S.model, fw = '') {
    const { rows, keys } = cmpModel(m, fw), name = (k) => { const c = ctlInfo(k); return `${c.short} ${c.id}`; };
    if (kind === 'long') {
      const out = [[T('cmp.csv.fw'), T('cmp.csv.ctl'), T('cmp.csv.title'), T('cmp.csv.comp'), T('cmp.csv.group'), T('cmp.csv.status'), T('cmp.csv.inh'), T('cmp.csv.data')]];
      rows.forEach(r => keys.forEach(k => {
        const e = r.eff.get(k);
        if (!e) return;
        const c = ctlInfo(k);
        out.push([c.short, c.id, c.title, r.n.label, cmpGroupName(r.n), e.status, e.from ? groupById(e.from)?.label || e.from : '', dataClassesOf(r.n, m).join(' ')]);
      }));
      return toCSV(out);
    }
    return toCSV([[T('cmp.csv.comp'), 'ID', T('cmp.csv.group'), T('cmp.csv.data'), ...keys.map(name)],
      ...rows.map(r => [r.n.label, r.n.id, cmpGroupName(r.n), dataClassesOf(r.n, m).join(' '), ...keys.map(k => r.eff.get(k)?.status || '')])]);
  }
  function exportCompliance(kind = 'wide', fw = '') {
    const long = kind === 'long', csv = complianceCSV(kind, S.model, fw);
    download(csv, fileName('csv', long ? 'compliance-long' : 'compliance'), 'text/csv;charset=utf-8');
    toast(T('toast.exported', { name: T('cmp.matrix') }));
    return csv;
  }
  // API: { frameworks: [{ key, label, controls: [{ key, id, label, met, partial, gap, na, unmapped }] }], rows: [{ node, label, controls: { 'marco:id': estado } }] }
  function complianceReport(m = S.model) {
    const { rows, keys, stats } = cmpModel(m);
    return {
      frameworks: cmpFrameworks(keys).map(fw => ({ key: fw, label: ctlInfo(`${fw}:x`).fwLabel, controls: keys.filter(k => ctlSplit(k)[0] === fw).map(k => ({ key: k, id: ctlSplit(k)[1], label: ctlInfo(k).title, ...stats.get(k) })) })),
      rows: rows.map(r => ({ node: r.n.id, label: r.n.label, controls: Object.fromEntries([...r.eff].map(([k, e]) => [k, e.status])) }))
    };
  }
  // Fichas del filtro «Cumplimiento»: un marco por ficha (los que usa algún nodo, con herencia) y «Con brechas»
  function cmpOptions(m) {
    const used = new Set();
    m.nodes.forEach(n => controlsOf(n, m).forEach((e, k) => used.add(ctlSplit(k)[0])));
    return [...Object.keys(FWS).filter(f => used.has(f)), ...[...used].filter(f => !FWS[f])].map(f => ({ k: f, label: ctlInfo(`${f}:x`).short })).concat(used.size ? [{ k: '@gap', label: T('flt.gap') }] : []);
  }
  const cmpMatch = (n, v) => { const eff = controlsOf(n); return v.some(k => (k === '@gap' ? [...eff.values()].some(e => e.status === 'gap') : [...eff.keys()].some(c => ctlSplit(c)[0] === k))); };
  // Texto corto para el tooltip de un nodo: «Cumplimiento: ISO 27001 3 ✓ 1 ✗ · PCI DSS 1 ◐»
  const cmpTip = n => {
    const by = new Map();
    controlsOf(n).forEach((e, k) => { const f = ctlInfo(k).short, c = by.get(f) || {}; c[e.status] = (c[e.status] || 0) + 1; by.set(f, c); });
    return by.size ? `${T('cmp.title')}: ${[...by].map(([f, c]) => `${f} ${CTL_STATUS.filter(s => c[s]).map(s => `${c[s]} ${CTL_SYM[s]}`).join(' ')}`).join(' · ')}` : '';
  };
  // Texto escrito en el buscador del inspector → clave de control («iso27001:A.8.24 — …», «iso27001:A.8.24», «A.8.24») o null
  function resolveCtl(text) {
    const t = String(text || '').split(' — ')[0].trim(), f = fold(t);
    if (!t) return null;
    const hit = CTL_ALL.find(k => fold(k) === f);
    if (hit) return hit;
    const byId = CTL_ALL.filter(k => fold(ctlSplit(k)[1]) === f);
    if (byId.length === 1) return byId[0];
    const i = t.indexOf(':');
    return i > 0 && i < t.length - 1 ? t : null; // catálogo propio: «marco:id» libre
  }
  // Fuente de hallazgos «compliance»: brecha = media (alta si el componente maneja PCI/PHI y el marco es PCI DSS/HIPAA), parcial = baja,
  // y el control principal sugerido que falta en un componente con datos sensibles = baja. Solo cuentan los controles propios (los de un grupo se avisan una vez, en el grupo)
  addFindingSource('compliance', m => {
    const out = [];
    const sevOf = (k, cls) => { const fw = ctlSplit(k)[0]; return (fw === 'pcidss' && cls.includes('pci')) || (fw === 'hipaa' && cls.includes('phi')) ? 'high' : 'medium'; };
    const emit = (kind, x, ns) => {
      const cls = [...new Set(ns.flatMap(n => dataClassesOf(n, m)))];
      Object.entries(x.controls || {}).forEach(([k, s]) => {
        if (s !== 'gap' && s !== 'partial') return;
        // un grupo: solo si algún componente suyo sigue usando ese valor (no lo sustituye otro más cercano)
        if (kind === 'group' && ns.length && !ns.some(n => controlsOf(n, m).get(k)?.from === x.id)) return;
        const c = ctlInfo(k), ref = `${c.short} ${c.id}`;
        out.push({ id: `compliance:${s}:${kind}:${x.id}:${k}`, source: 'compliance', rule: `compliance.${s}`, severity: s === 'gap' ? sevOf(k, cls) : 'low', target: { kind, id: x.id },
          title: T(`cmp.find.${s}`, { ctl: ref, name: x.label }), detail: [c.title, T(`cmp.find.${s}.d`)].filter(Boolean).join(' · '), fix: T('cmp.find.fix') });
      });
    };
    m.groups.forEach(g => emit('group', g, m.nodes.filter(n => inGroup(n, g.id))));
    // «Sin mapear» solo para marcos que el diagrama ya usa: sin controles no hay ruido
    const inUse = new Set([...m.groups, ...m.nodes].flatMap(x => Object.keys(x.controls || {}).map(k => ctlSplit(k)[0])));
    m.nodes.forEach(n => {
      emit('node', n, [n]);
      const eff = controlsOf(n, m);
      dataClassesOf(n, m).filter(k => DATA[k]?.sensitive).forEach(k => {
        const core = (CMP.suggest?.[k] || [])[0];
        if (!core || !inUse.has(ctlSplit(core)[0]) || !ctlInfo(core).known || eff.has(core)) return;
        const c = ctlInfo(core);
        out.push({ id: `compliance:unmapped:node:${n.id}:${core}`, source: 'compliance', rule: 'compliance.unmapped', severity: 'low', target: { kind: 'node', id: n.id },
          title: T('cmp.find.unmapped', { ctl: `${c.short} ${c.id}`, cls: loc(DATA[k].short) || k.toUpperCase(), name: n.label }), detail: c.title, fix: T('cmp.find.fix') });
      });
    });
    return out;
  });

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
  // Estado de aprobación de una versión o ambiente
  const VSTATUS = { draft: 'var(--muted)', review: 'var(--p-limon)', approved: 'var(--p-menta)', rejected: 'var(--p-coral)' };
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

  const THEME_ORDER = ['light', 'dark', 'black'];
  const fontCss = () => FONTS[S.font].css;
  // Reglas @font-face de una familia (solo las caras que cubren `text`, si se da)
  const fontFaces = (key, text) => {
    const f = FONTS[key];
    const inRange = rng => {
      if (text == null) return true;
      const rs = rng.split(',').map(s => s.trim().slice(2).split('-').map(h => parseInt(h, 16)));
      return [...text].some(ch => { const c = ch.codePointAt(0); return rs.some(([a, b]) => c >= a && c <= (b ?? a)); });
    };
    return f.faces.filter(x => inRange(x.unicodeRange)).map(x => `@font-face{font-family:"${f.family}";font-style:${x.style};font-weight:${x.weight};font-display:swap;src:url(${x.src}) format("woff2");unicode-range:${x.unicodeRange}}`).join('\n');
  };
  // Inyecta las tipografías en la página y vuelve a medir y pintar cuando terminan de cargar
  function loadFonts() {
    const st = document.createElement('style');
    st.id = 'font-faces';
    st.textContent = Object.keys(FONTS).map(k => fontFaces(k)).join('\n');
    document.head.appendChild(st);
    refreshFont();
  }
  function refreshFont() {
    const f = FONTS[S.font], key = S.font;
    if (!f.family) return;
    Promise.all(['400', '500', '600', '700', '800'].map(w => document.fonts.load(`${w} 13px "${f.family}"`, 'AÁñŁ'))).catch(() => {}).then(() => {
      if (key !== S.font || !S.model) return;
      render(false);
      renderInspector();
    });
  }

  function applyTheme() {
    const root = document.documentElement;
    root.dataset.theme = S.theme;
    const t = C.themes[S.theme];
    for (const k in t) root.style.setProperty(`--${k}`, t[k]);
    const p = C.palettes[S.palette] || Object.values(C.palettes)[0];
    for (const [k, v] of Object.entries(p[S.theme] || p.dark)) root.style.setProperty(`--p-${k}`, v);
    root.style.setProperty('--accent', `var(--p-${p.accent || 'lavanda'})`);
    root.style.setProperty('--font', fontCss());
    root.style.setProperty('--mono', C.fonts.mono);
  }

  /* ---------- medidas de texto ---------- */
  const mctx = document.createElement('canvas').getContext('2d');
  const FONT = { dtag: '800 9.5px', label: '600 13.5px', sub: '400 11.5px', tag: '700 11px', edge: '500 11px', badge: '800 10.5px', cost: '700 10.5px', note: '500 12.5px', ctx: '700 16px' };
  const textW = (t, f) => { mctx.font = `${f} ${fontCss()}`; return mctx.measureText(String(t ?? '')).width; };
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

  /* ---------- versión del formato: migraciones al abrir ---------- */
  // El JSON lleva formatVersion (entero). Sin él es la versión 0: todo lo guardado antes de que existiera el campo. No confundir con meta.version, la versión del documento que escribe el autor.
  // Cada migración { to, up(doc) → doc } es pura y se aplica a la raíz y a cada foto guardada (versions[].diagram), que pueden venir en cualquier formato. Para cambiar el modelo: sube FORMAT_VERSION y añade una migración; no edites las anteriores.
  /* migrate:start */
  const FORMAT_VERSION = 1;
  const MIGRATIONS = [
    { to: 1, up: doc => doc }   // 0 → 1: sin cambios en los datos; solo estrena el campo y el mecanismo
  ];
  // → { raw, from, to, newer }. `newer` = el archivo viene de una versión más nueva que la de esta app: se abre igual, pero lo que no conoce se perderá al guardar
  function migrate(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { raw, from: 0, to: FORMAT_VERSION, newer: false };
    const v = Math.floor(+raw.formatVersion);
    const from = Number.isFinite(v) && v > 0 ? v : 0;
    if (from > FORMAT_VERSION) return { raw, from, to: from, newer: true };
    let doc = raw;
    MIGRATIONS.filter(m => m.to > from).sort((a, b) => a.to - b.to).forEach(m => {
      doc = m.up(doc);
      if (Array.isArray(doc.versions)) doc = { ...doc, versions: doc.versions.map(x => (x && typeof x === 'object' && x.diagram && typeof x.diagram === 'object' ? { ...x, diagram: m.up(x.diagram) } : x)) };
    });
    return { raw: { ...doc, formatVersion: FORMAT_VERSION }, from, to: FORMAT_VERSION, newer: false };
  }
  /* migrate:end */

  /* ---------- modelo ---------- */
  function normalize(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    const m = { formatVersion: FORMAT_VERSION, title: String(raw.title || T('model.untitled')), groups: [], nodes: [], edges: [] };
    if (raw.direction === 'LR' || raw.direction === 'TB') m.direction = raw.direction;
    if (raw.routing === 'elbow') m.routing = 'elbow';
    if (raw.layerNames === 'zones') m.layerNames = 'zones';
    { const id = window.DiagramonWorkspace?.cleanDocId(raw.docId); if (id) m.docId = id; }   // identificador estable del diagrama (espacio de trabajo); sin él no hay clave
    { const rd = cleanRadarList(raw.radar); if (rd.length) m.radar = rd; }   // entradas propias del radar tecnológico; sin ellas no hay clave
    { const ph = cleanPhases(raw.phases); if (ph.length) m.phases = ph; }
    { const es = cleanEstimation(raw.estimation); if (es) m.estimation = es; }   // imprevistos propios del diagrama; sin ellos no hay clave   // sin fases no hay clave: JSON y exportaciones idénticos
    { const et = cleanEdgeTypes(raw.edgeTypes); if (et.length) m.edgeTypes = et; }
    { const dm = cleanDismissed(raw.dismissed); if (dm) m.dismissed = dm; }
    if (raw.meta && typeof raw.meta === 'object') {
      const meta = {};
      ['author', 'version'].forEach(k => { if (raw.meta[k] != null && String(raw.meta[k]).trim()) meta[k] = String(raw.meta[k]).trim(); });
      if (VIEWS[raw.meta.view]) meta.view = raw.meta.view;  // vista por defecto al abrir
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
    m.groups.forEach(g => { if (typeof g.icon !== 'string' || !g.icon.includes('/')) delete g.icon; }); // icono opcional 'proveedor/clave'
    m.groups.forEach(g => { if (cleanRegion(g.region)) g.region = cleanRegion(g.region); else delete g.region; }); // región (residencia de datos)
    m.groups.forEach(g => { // tipo opcional: lógico o físico (sin él se deduce, ver groupKind)
      const k = fold(g.kind);
      if (/^(physical|fisic)/.test(k)) g.kind = 'physical'; else if (/^(logical|logic)/.test(k)) g.kind = 'logical'; else delete g.kind;
    });
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

    m.groups.forEach(g => { const l = cleanLayer(g.layer); if (l) g.layer = l; else delete g.layer; });
    m.groups.forEach(g => { const c = cleanControls(g.controls); if (c) g.controls = c; else delete g.controls; });
    m.groups.forEach(g => { if (g.in == null || g.in === '') delete g.in; else g.in = String(g.in); }); // nivel C4: se valida al final, cuando ya existen los nodos
    list(raw.nodes).forEach((n, i) => {
      const type = C.types[n.type] ? n.type : 'generic';
      const o = { ...n, id: take(n.id, 'n', i), type, label: String(n.label ?? typeLabel(type)) };
      if (o.group == null || o.group === '' || !gids.has(String(o.group))) delete o.group; else o.group = String(o.group);
      if (hasCost(o) && +o.cost >= 0) o.cost = +o.cost; else delete o.cost;
      if (!PERIODS[o.costPeriod] || o.costPeriod === 'month') delete o.costPeriod;
      if (o.costPeriod === 'multi' && Math.round(+o.costYears) >= 1) o.costYears = Math.round(+o.costYears); else delete o.costYears;
      if (cleanData(o.data).length) o.data = cleanData(o.data); else delete o.data;
      if (cleanReview(o.review)) o.review = cleanReview(o.review); else delete o.review;
      if (cleanRegion(o.region)) o.region = cleanRegion(o.region); else delete o.region;
      { const l = cleanLayer(o.layer); if (l) o.layer = l; else delete o.layer; }
      { const dp = cleanDisposition(o.disposition); if (dp) o.disposition = dp; else delete o.disposition; }
      { const ia = typeof o.iac === 'string' ? o.iac.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200) : ''; if (ia) o.iac = ia; else delete o.iac; }   // recurso de infraestructura como código que representa (dirección Terraform, id de CloudFormation…)
      { const rf = window.DiagramonWorkspace?.cleanRef(o.ref); if (rf) o.ref = rf; else delete o.ref; }   // enlace al diagrama donde se detalla (espacio de trabajo)
      { const ef = cleanEffort(o.effort); if (ef.length) o.effort = ef; else delete o.effort; }
      { const rr = cleanRadarRef(o.radar); if (rr) o.radar = rr; else delete o.radar; }
      { const ex = cleanExposure(o.exposure); if (ex) o.exposure = ex; else delete o.exposure; const bk = cleanBackup(o.backup); if (bk != null) o.backup = bk; else delete o.backup; }
      { const c = cleanControls(o.controls); if (c) o.controls = c; else delete o.controls; }
      { const sl = cleanSla(o.sla); if (sl != null) o.sla = sl; else delete o.sla; const rp = cleanReplicas(o.replicas); if (rp != null) o.replicas = rp; else delete o.replicas;
        ['rpo', 'rto'].forEach(k => { const d = normDur(o[k]); if (d != null) o[k] = d; else delete o[k]; }); }
      if (o.in == null || o.in === '') delete o.in; else o.in = String(o.in);
      { const k = cleanC4(o.c4); if (k) o.c4 = k; else delete o.c4; }
      m.nodes.push(o);
    });
    [...m.groups, ...m.nodes].forEach(cleanGov);
    const nids = new Set(m.nodes.map(n => n.id));
    list(raw.edges).forEach((e, i) => {
      const from = String(e.from), to = String(e.to);
      if (!nids.has(from) || !nids.has(to)) return;
      const o = { ...e, id: take(e.id, 'e', i), from, to };
      if (cleanData(o.data).length) o.data = cleanData(o.data); else delete o.data;
      const enc = typeof o.encrypted === 'string' ? (/^(yes|true|si|sí)$/i.test(o.encrypted) ? true : /^(no|false)$/i.test(o.encrypted) ? false : null) : o.encrypted;
      if (enc === true || enc === false) o.encrypted = enc; else delete o.encrypted;
      if (o.route !== 'curved' && o.route !== 'elbow') delete o.route;
      if (o.weight !== 'high' && o.weight !== 'critical') delete o.weight;
      if (o.both === true || (typeof o.both === 'string' && /^(yes|true|si|sí)$/i.test(o.both))) o.both = true; else delete o.both;
      const dsl = cleanDatasets(o.datasets); if (dsl.length) o.datasets = dsl; else delete o.datasets;
      { const lt = normDur(o.latency); if (lt != null) o.latency = lt; else delete o.latency; }   // tiempo que tarda el dato en este salto ('15m', '1h', '1d'); inválido = se descarta
      if (o.transferOk === true || (typeof o.transferOk === 'string' && /^(yes|true|ok|si|sí)$/i.test(o.transferOk))) o.transferOk = true; else delete o.transferOk;
      { const th = cleanThreats(o.threats); if (th) o.threats = th; else delete o.threats; }
      m.edges.push(o);
    });
    cleanPhaseRefs([...m.groups, ...m.nodes, ...m.edges], m.phases);   // phase / until de cada elemento: solo fases que existen, until después de phase
    m.notes = []; m.zones = [];
    list(raw.notes).forEach((n, i) => {
      const o = { id: take(n.id, 'note', i), ...cleanBox(n, 180, 110), text: String(n.text ?? '') };
      if (!hasPos(n)) UNPLACED.add(o);
      if (n.color != null && String(n.color).trim()) o.color = String(n.color).trim();
      if (n.in != null && n.in !== '') o.in = String(n.in);
      m.notes.push(o);
    });
    list(raw.zones).forEach((z, i) => {
      const o = { id: take(z.id, 'zone', i), ...cleanBox(z, 360, 220), label: String(z.label ?? ''), severity: SEVERITY.includes(z.severity) ? z.severity : 'medium' };
      if (!hasPos(z)) UNPLACED.add(o);
      if (z.kind === 'trust') { o.kind = 'trust'; delete o.severity; if (z.trust != null && String(z.trust).trim()) o.trust = String(z.trust).trim(); }
      if (z.desc != null && String(z.desc).trim()) o.desc = String(z.desc);
      if (z.in != null && z.in !== '') o.in = String(z.in);
      m.zones.push(o);
    });
    cleanScopes(m);
    { const sh = cleanStakeholders(raw.stakeholders, m); if (sh.length) m.stakeholders = sh; }   // antes que las firmas (de versiones y decisiones), que solo guardan las de interesados que existen; sin interesados no hay clave: JSON y exportaciones idénticos
    m.versions = normVersions(raw.versions);
    m.versions.forEach(v => { const so = cleanSignoffs(v.signoffs, m); if (so.length) v.signoffs = so; else delete v.signoffs; });   // firmas de la versión: solo de interesados que existen
    m.decisions = cleanDecisions(raw.decisions, m);
    { const rq = cleanRequirements(raw.requirements, m); if (rq.length) m.requirements = rq; }   // sin requisitos no hay clave: JSON y exportaciones idénticos
    m.raid = cleanRaid(raw.raid, m);   // después de los requisitos: sus ids ya están en m.requirements
    { const cm = cleanComments(raw.comments, m); if (cm.length) m.comments = cm; }   // al final: sus destinos (nodos, conexiones, grupos, decisiones, requisitos y versiones) ya están limpios; sin comentarios no hay clave
    { const ds = cleanCatalog(raw.datasets, m, dsHelpers()); if (ds.length) m.datasets = ds; }
    { const dv = cleanDeviations(raw.deviations, m); if (dv.length) m.deviations = dv; }   // después de los nodos; sin ninguna no hay clave   // después de nodos y fases (consumidores y fase deben existir); sin conjuntos no hay clave: JSON y exportaciones idénticos
    // Cada versión puede llevar las decisiones que había al guardarla (para compararlas); sus enlaces se limpian contra el diagrama de la versión
    m.versions.forEach(v => { if (v.decisions) v.decisions = cleanDecisions(v.decisions, { nodes: v.diagram.nodes || [], edges: v.diagram.edges || [], groups: v.diagram.groups || [], versions: m.versions, stakeholders: m.stakeholders }); });
    if (raw.active != null && m.versions.some(v => v.id === String(raw.active))) m.active = String(raw.active);
    return m;
  }

  // Notas adhesivas y zonas de riesgo: posición y tamaño numéricos, con un mínimo de 60×40
  const SEVERITY = ['low', 'medium', 'high', 'critical'];
  // Notas y zonas que llegan sin posición (p. ej. escritas en la pestaña Texto sin at=): ensurePositions las pone junto al contenido de su nivel
  const UNPLACED = new WeakSet();
  const hasPos = o => [o.x, o.y].every(v => v !== '' && v != null && Number.isFinite(+v));
  const cleanBox = (o, w, h) => {
    const num = (v, d) => (Number.isFinite(+v) && v !== '' && v != null ? +v : d);
    return { x: num(o.x, 0), y: num(o.y, 0), w: Math.max(60, num(o.w, w)), h: Math.max(40, num(o.h, h)) };
  };

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
      const name = String(v.name ?? '').trim().slice(0, 40);
      if (name) o.name = name;
      o.savedAt = String(v.savedAt || '');
      // Aprobación: estado, autor de la arquitectura y fechas AAAA-MM-DD (editables)
      o.status = VSTATUS[v.status] ? v.status : 'draft';
      if (v.author != null && String(v.author).trim()) o.author = String(v.author).trim();
      const saved = String(o.savedAt).slice(0, 10);
      o.created = isDay(v.created) ? v.created : isDay(saved) ? saved : today();
      o.updated = isDay(v.updated) ? v.updated : isDay(saved) ? saved : o.created;
      // Decisión (quién y cuándo), motivo del rechazo e historial de estados
      const dec = o.status === 'approved' || o.status === 'rejected';
      if (dec && v.decidedBy != null && String(v.decidedBy).trim()) o.decidedBy = String(v.decidedBy).trim();
      if (dec && isDay(v.decidedOn)) o.decidedOn = v.decidedOn;
      if (o.status === 'rejected' && v.reason != null && String(v.reason).trim()) o.reason = String(v.reason).trim();
      const hist = (Array.isArray(v.history) ? v.history : []).filter(h => h && typeof h === 'object' && VSTATUS[h.status] && isDay(h.date)).slice(-100).map(h => {
        const e = { status: h.status, date: h.date };
        if (h.by != null && String(h.by).trim()) e.by = String(h.by).trim();
        if (h.reason != null && String(h.reason).trim()) e.reason = String(h.reason).trim();
        return e;
      });
      if (hist.length) o.history = hist;
      if (Array.isArray(v.signoffs)) o.signoffs = v.signoffs;   // se limpian en normalize, cuando ya existen los interesados
      if (isDay(v.reviewSince)) o.reviewSince = v.reviewSince;
      o.diagram = v.diagram;
      if (Array.isArray(v.decisions)) o.decisions = v.decisions;
      return o;
    });
  }

  // Cada nivel C4 tiene su propio espacio de coordenadas: se ordena por separado (sin `in` en ningún lado = un solo nivel, como siempre)
  function ensurePositions(m) {
    if (!m.nodes.some(n => n.in)) ensurePositionsIn(m);
    else [...new Set(m.nodes.map(n => n.in || null))].forEach(sc => ensurePositionsIn(scopeModel(m, sc)));
    placeItems(m);
  }
  // A la derecha de los nodos de su nivel, apiladas en columna
  function placeItems(m) {
    const next = new Map();
    [...(m.notes || []), ...(m.zones || [])].filter(o => UNPLACED.has(o)).forEach(o => {
      UNPLACED.delete(o);
      const sc = o.in || null, ns = m.nodes.filter(n => (n.in || null) === sc);
      if (!next.has(sc)) next.set(sc, ns.length ? { x: snap(Math.max(...ns.map(n => n.x + nodeWidth(n))) + 60), y: snap(Math.min(...ns.map(n => n.y))) } : { x: 0, y: 0 });
      const p = next.get(sc);
      o.x = p.x; o.y = p.y; p.y = snap(p.y + o.h + 24);
    });
  }
  function ensurePositionsIn(m) {
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
  // Tipo de grupo deducido (físico si su icono o su nombre son de red, cuenta o región) y tipo efectivo
  const groupKindAuto = g => (VR.physicalGroupIcons.includes(g.icon) || VR.physicalGroupName.test(String(g.label ?? '')) ? 'physical' : 'logical');
  const groupKind = g => (g.kind === 'logical' || g.kind === 'physical' ? g.kind : groupKindAuto(g));
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
  /* ---------- niveles C4: un nodo puede tener un diagrama interno ---------- */
  // El modelo sigue plano: `in` (en nodos, grupos, notas y zonas) = id del nodo cuyo diagrama interno lo contiene; omitido = nivel superior.
  // Una conexión pertenece a un nivel cuando sus dos extremos lo hacen; con extremos en niveles distintos cruza niveles.
  const C4_KINDS = ['person', 'system', 'container', 'component', 'external'];
  const C4_ALIAS = { person: 'person', persona: 'person', system: 'system', sistema: 'system', container: 'container', contenedor: 'container', component: 'component', componente: 'component', external: 'external', externo: 'external' };
  const cleanC4 = v => C4_ALIAS[fold(v).trim()] || '';
  const scopeId = x => (x && x.in) || null;
  const inScope = (x, sc = S.scope) => scopeId(x) === sc;
  // Nivel al que pertenece un elemento (objeto, o id de nodo / grupo)
  function scopeOf(x, m = S.model) {
    if (typeof x === 'string') x = m.nodes.find(n => n.id === x) || m.groups.find(g => g.id === x);
    return scopeId(x);
  }
  // Ids desde el nivel superior hasta `id` (incluido); [] para el nivel superior
  function scopePath(id, m = S.model) {
    const out = [];
    let cur = id, i = 0;
    while (cur && i++ < 50) { const n = m.nodes.find(x => x.id === cur); if (!n) break; out.unshift(cur); cur = n.in; }
    return out;
  }
  // Lo que contiene directamente un nodo (null = nivel superior)
  function innerOf(id, m = S.model) {
    const sc = id || null, f = x => (x.in || null) === sc;
    return { nodes: m.nodes.filter(f), groups: m.groups.filter(f), notes: (m.notes || []).filter(f), zones: (m.zones || []).filter(f) };
  }
  const innerCount = (id, m = S.model) => m.nodes.reduce((a, n) => a + (n.in === id ? 1 : 0), 0);
  // Ids de todos los nodos que cuelgan de `ids`, a cualquier profundidad
  function innerDeep(ids, m = S.model) {
    const out = new Set(), q = [...ids];
    while (q.length) { const u = q.pop(); m.nodes.forEach(n => { if (n.in === u && !out.has(n.id)) { out.add(n.id); q.push(n.id); } }); }
    return out;
  }
  // La parte del modelo que se ve en un nivel (nodos, grupos y conexiones entre ellos). Sin `in` en ningún sitio = el propio modelo
  function scopeModel(m = S.model, sc = S.scope) {
    if (!sc && !m.nodes.some(n => n.in) && !m.groups.some(g => g.in)) return m;
    const f = x => (x.in || null) === sc, nodes = m.nodes.filter(f), ids = new Set(nodes.map(n => n.id));
    return { ...m, nodes, groups: m.groups.filter(f), edges: m.edges.filter(e => ids.has(e.from) && ids.has(e.to)) };
  }
  // Sanea `in`: debe apuntar a un nodo que existe, no a sí mismo ni formar ciclos; un grupo y su padre (o un nodo y su grupo) comparten nivel
  function cleanScopes(m) {
    const byId = new Map(m.nodes.map(n => [n.id, n]));
    m.nodes.forEach(n => { if (n.in && (!byId.has(n.in) || n.in === n.id)) delete n.in; });
    m.nodes.forEach(n => {
      const seen = new Set([n.id]);
      let p = n.in;
      while (p) { if (seen.has(p)) { delete n.in; break; } seen.add(p); p = byId.get(p)?.in; }
    });
    [...m.groups, ...m.notes, ...m.zones].forEach(x => { if (x.in && !byId.has(x.in)) delete x.in; });
    const gmap = new Map(m.groups.map(g => [g.id, g]));
    m.groups.forEach(g => { if (g.parent && (gmap.get(g.parent)?.in || null) !== (g.in || null)) delete g.parent; });
    m.nodes.forEach(n => { if (n.group && (gmap.get(n.group)?.in || null) !== (n.in || null)) delete n.group; });
  }
  const scopeNode = (id = S.scope) => (id ? S.model.nodes.find(n => n.id === id) || null : null);
  const c4Label = k => (C4_KINDS.includes(k) ? T(`c4.k.${k}`) : '');
  // Nivel C4 de lo que hay dentro de un nodo: 1 contexto, 2 contenedores, 3 componentes, 4 código. Manda el tipo C4 del nodo; si no, la profundidad
  function levelOf(id = S.scope) {
    const nd = scopeNode(id);
    return ({ system: 2, container: 3, component: 4 })[nd?.c4] || scopePath(id).length + 1;
  }
  const levelName = n => (n <= 4 ? T(`c4.level.${n}`) : T('c4.levelN', n));
  // Tipo C4 que se sugiere para lo nuevo dentro de un nodo
  const c4Default = id => ({ system: 'container', container: 'component' })[scopeNode(id)?.c4] || '';
  const hasLevels = (m = S.model) => m.nodes.some(n => n.in);
  // Niveles con contenido: el superior y cada nodo con diagrama interno, en profundidad
  function scopeList(m = S.model) {
    const out = [];
    const walk = (id, depth) => {
      const nodes = m.nodes.filter(n => (n.in || null) === id);
      if (id === null || nodes.length) out.push({ id, label: id ? m.nodes.find(n => n.id === id).label : T('c4.top'), depth, path: scopePath(id, m), nodes: nodes.length });
      if (depth < 20) nodes.forEach(n => walk(n.id, depth + 1));
    };
    walk(null, 0);
    return out;
  }
  // Notas y zonas del nivel abierto
  const scopeItems = k => S.model[k].filter(o => inScope(o));
  const itemInScope = (k, id) => { const o = S.model[k].find(x => x.id === id); return !o || inScope(o); };
  /* ---------- dueños y responsables: dueño, responsable de datos, equipo y centro de costo (heredan del grupo) ---------- */
  const GOV_FIELDS = ['owner', 'steward', 'team', 'costCenter'];
  const cleanGov = o => GOV_FIELDS.forEach(f => { const v = o[f] == null ? '' : String(o[f]).trim(); if (v) o[f] = v; else delete o[f]; });
  // Valor efectivo de un campo: el propio o el del grupo ancestro más cercano que lo tenga ({ value, from: id del grupo | null })
  function govOf(x, f, m = S.model) {
    const own = String(x?.[f] ?? '').trim();
    if (own) return { value: own, from: null };
    let gid = x?.group || x?.parent, i = 0;
    while (gid && i++ < 50) {
      const g = m.groups.find(y => y.id === gid), v = String(g?.[f] ?? '').trim();
      if (v) return { value: v, from: g.id };
      gid = g?.parent;
    }
    return { value: '', from: null };
  }
  const govKey = n => govOf(n, 'team').value || govOf(n, 'owner').value;
  // Equipos (o dueños, si el nodo no tiene equipo) en orden alfabético; cada uno con un color estable de la paleta
  function govTeams(m = S.model, ids = null) {
    // Colores en un orden que alterna tonos lejanos (dos equipos seguidos no quedan casi iguales)
    const pk = paletteKeys(), keys = [...['cielo', 'melocoton', 'menta', 'lila', 'limon', 'coral', 'lavanda', 'rosa'].filter(k => pk.includes(k)), ...pk.filter(k => !['cielo', 'melocoton', 'menta', 'lila', 'limon', 'coral', 'lavanda', 'rosa'].includes(k))];
    const by = new Map();
    m.nodes.forEach(n => {
      const k = govKey(n);
      if (!k || (ids && !ids.has(n.id))) return;
      if (!by.has(k)) by.set(k, { key: k, kind: govOf(n, 'team').value ? 'team' : 'owner', owners: new Set(), ids: [] });
      const t = by.get(k), o = govOf(n, 'owner').value;
      if (o && o !== k) t.owners.add(o);
      t.ids.push(n.id);
    });
    const order = [...new Set(m.nodes.map(govKey).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    by.forEach(t => { t.color = `var(--p-${keys[order.indexOf(t.key) % keys.length]})`; t.owners = [...t.owners].sort((a, b) => a.localeCompare(b)); });
    return new Map([...by].sort((a, b) => a[0].localeCompare(b[0])));
  }
  const govTip = n => GOV_FIELDS.map(f => { const v = govOf(n, f).value; return v ? `${T(`gov.${f}`)}: ${v}` : ''; }).filter(Boolean).join(' · ');

  /* ---------- revisión de seguridad automática: reglas que avisan (config.js › securityRules) ---------- */
  // Solo avisan, nunca bloquean. Una regla se apaga con `enabled: false`; el nodo puede anular lo deducido con `exposure` y `backup`.
  const SR = C.securityRules || {};
  const SR_SEV = { 'sec.unencrypted-sensitive': 'critical', 'sec.unstated-encryption': 'medium', 'sec.public-sensitive': 'high', 'sec.datastore-backup': 'medium', 'sec.cross-border': 'high', 'sec.sensitive-no-owner': 'low', 'sec.public-datastore': 'high' };
  const srOn = id => !!SR[id] && SR[id].enabled !== false;
  const srSev = id => (SEVERITY.includes(SR[id]?.severity) ? SR[id].severity : SR_SEV[id] || 'medium');
  const srRx = (re, s) => { try { return re instanceof RegExp && new RegExp(re.source, 'i').test(String(s ?? '')); } catch { return false; } };
  const cleanExposure = v => { const k = fold(v); return /^(public|publico|publica|external|externa?)$/.test(k) ? 'public' : /^(internal|interno|interna|private|privado|privada)$/.test(k) ? 'internal' : ''; };
  const cleanBackup = v => (v === true || v === false ? v : typeof v === 'string' ? (/^(yes|true|si|sí)$/i.test(v.trim()) ? true : /^(no|false)$/i.test(v.trim()) ? false : null) : null);
  // Hallazgos descartados: { [id]: { reason, by?, date } }; no se poda nada (un id viejo no estorba)
  const cleanDismissed = v => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const out = {};
    Object.entries(v).forEach(([id, d]) => {
      if (!id || !d || typeof d !== 'object') return;
      const o = { reason: String(d.reason ?? '').trim().slice(0, 300) };
      if (d.by != null && String(d.by).trim()) o.by = String(d.by).trim();
      if (isDay(d.date)) o.date = d.date;
      out[id] = o;
    });
    return Object.keys(out).length ? out : null;
  };
  // Diferencias con la infraestructura desplegada que alguien aceptó: [{ node, field, value (lo desplegado que se aceptó), reason, date? }]
  const cleanDeviations = (v, m) => {
    const ids = new Set(m.nodes.map(n => n.id)), fields = window.DiagramonDrift?.FIELDS || [], seen = new Set(), out = [];
    (Array.isArray(v) ? v : []).forEach(d => {
      if (!d || typeof d !== 'object' || Array.isArray(d) || out.length >= 200) return;
      const node = String(d.node ?? ''), field = String(d.field ?? ''), k = `${node}\0${field}`;
      if (!ids.has(node) || !fields.includes(field) || seen.has(k)) return;
      seen.add(k);
      const o = { node, field, value: String(d.value ?? '').trim().slice(0, 100), reason: String(d.reason ?? '').trim().slice(0, 300) };
      if (isDay(d.date)) o.date = d.date;
      out.push(o);
    });
    return out;
  };
  // Grupos de un nodo, del más cercano al más lejano
  const groupChain = (n, m) => { const out = []; let g = n.group, i = 0; while (g && i++ < 50) { const gg = m.groups.find(x => x.id === g); if (!gg) break; out.push(gg); g = gg.parent; } return out; };
  // Exposición: { value: 'public' | 'internal', auto, why }. Lo explícito gana; si no, se deduce del grupo o de quién le envía tráfico
  function exposureOf(n, m = S.model) {
    if (n.exposure === 'public' || n.exposure === 'internal') return { value: n.exposure, auto: false, why: T('sec.why.manual') };
    const P = SR['sec.public-sensitive'] || {}, clients = P.clientTypes || [];
    const g = groupChain(n, m).find(x => (P.publicGroupIcons || []).includes(x.icon) || srRx(P.publicGroupName, x.label));
    if (g) return { value: 'public', auto: true, why: T('sec.why.group', g.label) };
    const src = m.edges.filter(e => e.to === n.id || (e.both && e.from === n.id)).map(e => m.nodes.find(x => x.id === (e.to === n.id ? e.from : e.to))).find(x => x && x.id !== n.id && clients.includes(x.type));
    return src ? { value: 'public', auto: true, why: T('sec.why.client', src.label) } : { value: 'internal', auto: true, why: T('sec.why.none') };
  }
  const isClientNode = n => (SR['sec.public-sensitive']?.clientTypes || []).includes(n.type);
  const isDataStore = n => { const D = SR['sec.datastore-backup'] || {}; return (D.dataStoreTypes || []).includes(n.type) || (D.dataStoreIconCategories || []).includes(iconInfo(n.icon)?.category); };
  const isBackupNode = n => { const D = SR['sec.datastore-backup'] || {}; return (D.backupIcons || []).includes(n.icon) || srRx(D.backupName, n.label); };
  // Respaldo: { value: true | false, auto, why }. Lo explícito gana; si no, se deduce de un nodo de respaldo vecino o de una conexión «backup»
  function backupOf(n, m = S.model) {
    if (typeof n.backup === 'boolean') return { value: n.backup, auto: false, why: T('sec.why.manual') };
    const D = SR['sec.datastore-backup'] || {};
    for (const e of m.edges) {
      if (e.from !== n.id && e.to !== n.id) continue;
      const o = m.nodes.find(x => x.id === (e.from === n.id ? e.to : e.from));
      if (o && o.id !== n.id && isBackupNode(o)) return { value: true, auto: true, why: T('sec.why.bknode', o.label) };
      if (srRx(D.backupEdgeLabel, e.label)) return { value: true, auto: true, why: T('sec.why.bkedge', String(e.label).replace(/\s+/g, ' ')) };
    }
    return { value: false, auto: true, why: T('sec.why.nobk') };
  }
  // Clases sensibles de una conexión: las suyas y las de sus extremos (como secClass), en el orden de config.js
  const edgeSens = (e, get) => {
    const ks = [...(e.data || []), ...(get(e.from)?.data || []), ...(get(e.to)?.data || [])];
    return [...new Set(ks)].filter(k => DATA[k]?.sensitive).sort((a, b) => Object.keys(DATA).indexOf(a) - Object.keys(DATA).indexOf(b));
  };
  const nodeSens = n => [...new Set(n.data || [])].filter(k => DATA[k]?.sensitive).sort((a, b) => Object.keys(DATA).indexOf(a) - Object.keys(DATA).indexOf(b));
  function ruleFindings(m) {
    const out = [], byId = new Map(m.nodes.map(n => [n.id, n])), get = id => byId.get(id);
    // «Sin dueño» solo si el diagrama ya asigna dueños o responsables en algún sitio
    const usesGov = [...m.nodes, ...m.groups].some(x => x.owner || x.steward || x.team);
    const add = (rule, kind, o, title, detail, fix) => out.push({ id: `rule:${rule}:${kind}:${o.id}`, source: 'rule', rule, severity: srSev(rule), target: { kind, id: o.id }, title, ...(detail ? { detail } : {}), fix });
    m.edges.forEach(e => {
      const a = get(e.from), b = get(e.to);
      if (!a || !b) return;
      const cls = edgeSens(e, get), ends = { a: a.label, b: b.label }, shorts = () => classShorts(cls).join(', ');
      if (srOn('sec.unencrypted-sensitive') && isInsecure(e, get)) add('sec.unencrypted-sensitive', 'edge', e, T('sec.f.unenc.t', { cls: shorts(), n: cls.length, ...ends }), T('sec.f.unenc.d'), T('sec.f.unenc.fix'));
      if (srOn('sec.unstated-encryption') && e.encrypted == null && cls.length) add('sec.unstated-encryption', 'edge', e, T('sec.f.unst.t', { cls: shorts(), n: cls.length, ...ends }), T('sec.f.unst.d'), T('sec.f.unst.fix'));
      if (srOn('sec.cross-border')) {
        const cb = crossBorder(e, get);
        if (cb && !cb.approved) add('sec.cross-border', 'edge', e, T('sec.f.xb.t', { cls: classShorts(cb.classes).join(', '), n: cb.classes.length, fromR: cb.from.region, toR: cb.to.region, ...ends }), xbWarn(cb), T('sec.f.xb.fix'));
      }
    });
    m.nodes.forEach(n => {
      const ns = nodeSens(n), ds = isDataStore(n) && !isBackupNode(n), ex = exposureOf(n, m);
      if (srOn('sec.public-sensitive') && ns.length && !isClientNode(n) && ex.value === 'public') add('sec.public-sensitive', 'node', n, T('sec.f.pubsens.t', { n: n.label, cls: classShorts(ns).join(', '), c: ns.length }), ex.why, T('sec.f.pubsens.fix'));
      if (srOn('sec.datastore-backup') && ds && !backupOf(n, m).value) add('sec.datastore-backup', 'node', n, T('sec.f.bk.t', n.label), T('sec.f.bk.d'), T('sec.f.bk.fix'));
      if (srOn('sec.sensitive-no-owner') && usesGov && ns.length && !govOf(n, 'owner', m).value && !govOf(n, 'steward', m).value) add('sec.sensitive-no-owner', 'node', n, T('sec.f.owner.t', { n: n.label, cls: classShorts(ns).join(', '), c: ns.length }), '', T('sec.f.owner.fix'));
      if (srOn('sec.public-datastore') && ds && ex.value === 'public') add('sec.public-datastore', 'node', n, T('sec.f.pubds.t', n.label), ex.why, T('sec.f.pubds.fix'));
    });
    return out;
  }
  addFindingSource('rule', ruleFindings);
  // Observaciones de revisión manuales (abiertas o vencidas): se resuelven en el inspector, no se descartan aquí
  addFindingSource('review', m => m.nodes.filter(n => n.review && n.review.status !== 'resolved').map(n => {
    const late = reviewState(n.review) === 'overdue';
    return { id: `review:observation:node:${n.id}`, source: 'review', rule: 'observation', severity: late ? 'high' : 'medium', target: { kind: 'node', id: n.id }, title: n.review.note || T('find.rev.untitled', n.label), detail: reviewHint(n.review), fix: T('find.rev.fix') };
  }));

  /* ---------- decisiones de arquitectura (ADR): modelo ---------- */
  // m.decisions = [{ id: 'ADR-001', title, status, date, context, decision, consequences, deciders?, supersededBy?, links: { nodes?, edges?, groups?, versions? }, history?: [{ status, date, by?, note? }] }]
  // Son del documento: no entran en las fotos de versiones (snapshotOf; cada versión guarda aparte una copia en v.decisions, solo para comparar) y sobreviven al abrir una versión y a los editores.
  // history = historial de estados (el más antiguo primero); sin él se muestra una entrada implícita (estado actual + fecha). date = fecha del estado actual.
  /* adrModel:start */
  const ADR_STATUS = ['proposed', 'accepted', 'rejected', 'deprecated', 'superseded'];
  const ADR_COLOR = { proposed: 'var(--p-limon)', accepted: 'var(--p-menta)', rejected: 'var(--p-coral)', deprecated: 'var(--muted)', superseded: 'var(--p-lavanda)' };
  const ADR_ALIAS = { propuesta: 'proposed', propuesto: 'proposed', aceptada: 'accepted', aceptado: 'accepted', rechazada: 'rejected', rechazado: 'rejected', obsoleta: 'deprecated', obsoleto: 'deprecated', reemplazada: 'superseded', reemplazado: 'superseded', sustituida: 'superseded', sustituido: 'superseded', superada: 'superseded', superado: 'superseded' };
  const adrStatus = v => { const k = String(v ?? '').trim().toLowerCase(); return ADR_STATUS.includes(k) ? k : ADR_ALIAS[k] || 'proposed'; };
  const adrNum = id => { const r = /^ADR-(\d+)$/i.exec(String(id)); return r ? +r[1] : 0; };
  const adrNextId = list => `ADR-${String(Math.max(0, ...list.map(d => adrNum(d.id))) + 1).padStart(3, '0')}`;
  // Solo enlaces a ids que existen (versiones: las de m.versions)
  function cleanAdrLinks(l, m) {
    const out = {};
    l = l && typeof l === 'object' ? l : {};
    [['nodes', m.nodes], ['edges', m.edges], ['groups', m.groups], ['versions', m.versions || []]].forEach(([k, src]) => {
      const ok = new Set(src.map(x => x.id)), ids = [...new Set((Array.isArray(l[k]) ? l[k] : []).map(String).filter(id => ok.has(id)))];
      if (ids.length) out[k] = ids;
    });
    return out;
  }
  /* ---------- decisiones (ADR): opciones, criterios y puntuación ---------- */
  // Por decisión (todo opcional): area, criteria: [{ id, label, weight 1..5 }], options: [{ id, title, summary?, pros?, cons?, cost?, risk?, version?, scores?: { criterio: 1..5 } }], chosen (id de una opción)
  // Sin ellos, el JSON y las exportaciones quedan idénticos a los de antes.
  const ADR_RISK = ['low', 'medium', 'high'];
  const ADR_MAX = { options: 12, criteria: 12 };
  // Puntaje de una opción: % ponderado sobre los criterios que ya puntuó. Líder = la opción con todos los criterios puntuados y mayor %, a igualdad la primera
  function adrScore(d, o) {
    const cs = Array.isArray(d?.criteria) ? d.criteria : [], sc = o?.scores || {};
    let num = 0, den = 0, n = 0;
    cs.forEach(c => { const s = sc[c.id], w = Number.isInteger(c.weight) ? c.weight : 3; if (Number.isInteger(s) && s >= 1 && s <= 5) { num += w * s; den += w * 5; n++; } });
    return { pct: den ? Math.round(100 * num / den) : 0, scored: n, total: cs.length };
  }
  const adrFull = s => s.total > 0 && s.scored === s.total;
  function adrLeader(d) {
    let best = '', top = -1;
    (Array.isArray(d?.options) ? d.options : []).forEach(o => { const s = adrScore(d, o); if (adrFull(s) && s.pct > top) { top = s.pct; best = o.id; } });
    return best;
  }
  const adrLong = (v, n) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, n);
  function cleanAdrCriteria(raw) {
    const seen = new Set(), out = [];
    (Array.isArray(raw) ? raw : []).forEach(c => {
      if (!c || typeof c !== 'object' || Array.isArray(c)) return;
      const id = String(c.id ?? '').trim();
      if (!/^[a-z0-9-]{1,30}$/.test(id) || seen.has(id)) return;
      seen.add(id);
      const w = Math.round(Number(c.weight));
      out.push({ id, label: String(c.label ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || id, weight: Number.isFinite(w) ? Math.min(5, Math.max(1, w)) : 3 });
    });
    return out.slice(0, ADR_MAX.criteria);
  }
  function cleanAdrOptions(raw, crit, m) {
    const seen = new Set(), out = [], vids = new Set((m.versions || []).map(v => v.id));
    (Array.isArray(raw) ? raw : []).forEach(x => {
      if (!x || typeof x !== 'object' || Array.isArray(x)) return;
      const id = String(x.id ?? '').trim();
      if (!/^[A-Za-z0-9-]{1,20}$/.test(id) || seen.has(id)) return;
      seen.add(id);
      const o = { id, title: String(x.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) };
      ['summary', 'pros', 'cons'].forEach(k => { const t = adrLong(x[k], 2000); if (t) o[k] = t; });
      const cost = x.cost === '' || x.cost == null ? NaN : Number(x.cost);
      if (Number.isFinite(cost) && cost >= 0) o.cost = cost;
      if (ADR_RISK.includes(x.risk)) o.risk = x.risk;
      if (x.version != null && vids.has(String(x.version))) o.version = String(x.version);
      const sc = {};
      if (x.scores && typeof x.scores === 'object' && !Array.isArray(x.scores)) crit.forEach(c => { const r = x.scores[c.id], v = r === '' || r == null ? NaN : Number(r); if (Number.isInteger(v) && v >= 1 && v <= 5) sc[c.id] = v; });
      if (Object.keys(sc).length) o.scores = sc;
      out.push(o);
    });
    return out.slice(0, ADR_MAX.options);
  }
  function cleanDecisions(raw, m) {
    const txt = v => String(v ?? '').replace(/\r\n?/g, '\n').slice(0, 20000);
    const seen = new Set(), items = [];
    (Array.isArray(raw) ? raw : []).forEach(d => {
      if (!d || typeof d !== 'object' || Array.isArray(d)) return;
      const o = { title: String(d.title ?? '').trim().slice(0, 200), context: txt(d.context), decision: txt(d.decision), consequences: txt(d.consequences) };
      let id = String(d.id ?? '').trim().slice(0, 40);
      if (!id && !o.title && !o.context && !o.decision && !o.consequences) return;
      if (!id || seen.has(id)) id = ''; else seen.add(id);
      const hist = (Array.isArray(d.history) ? d.history : []).filter(h => h && typeof h === 'object' && isDay(h.date)).slice(-200).map(h => {
        const e = { status: adrStatus(h.status), date: h.date };
        if (h.by != null && String(h.by).trim()) e.by = String(h.by).trim().slice(0, 100);
        if (h.note != null && String(h.note).trim()) e.note = String(h.note).trim().slice(0, 500);
        return e;
      });
      const so = cleanSignoffs(d.signoffs, m);
      const crit = cleanAdrCriteria(d.criteria), opts = cleanAdrOptions(d.options, crit, m), chosen = String(d.chosen ?? '').trim();
      items.push({ ...o, hist, id, status: adrStatus(d.status), date: isDay(d.date) ? d.date : today(), deciders: String(d.deciders ?? '').trim().slice(0, 200), sup: String(d.supersededBy ?? '').trim(), links: cleanAdrLinks(d.links, m),
        area: String(d.area ?? '').replace(/\s+/g, ' ').trim().slice(0, 60), so, crit, opts, chosen: opts.some(x => x.id === chosen) ? chosen : '' });
    });
    items.forEach(o => { if (!o.id) o.id = adrNextId(items); });
    const ids = new Set(items.map(o => o.id));
    return items.map(o => {
      const r = { id: o.id, title: o.title, status: o.status, date: o.date, context: o.context, decision: o.decision, consequences: o.consequences };
      if (o.deciders) r.deciders = o.deciders;
      if (o.sup && o.sup !== o.id && ids.has(o.sup)) { r.supersededBy = o.sup; r.status = 'superseded'; }
      if (o.area) r.area = o.area;
      if (o.crit.length) r.criteria = o.crit;
      if (o.opts.length) r.options = o.opts;
      if (o.chosen) r.chosen = o.chosen;
      r.links = o.links;
      if (o.hist.length) r.history = o.hist;
      if (o.so.length) r.signoffs = o.so;
      return r;
    });
  }
  /* adrModel:end */
  // Historial a mostrar: el guardado o, en decisiones antiguas, una entrada implícita (estado actual + fecha)
  const adrHist = d => (d.history?.length ? d.history : [{ status: d.status, date: d.date }]);
  const adrAuthor = () => store.get('author', '') || S.model.meta?.author || '';
  const decisionsOf = (kind, id, m = S.model) => (m?.decisions || []).filter(d => d.links?.[kind]?.includes(id));
  // Tras borrar nodos, conexiones, grupos o versiones: quita de los enlaces los ids que ya no existen
  function pruneAdrLinks(m = S.model) { (m.decisions || []).forEach(d => { d.links = cleanAdrLinks(d.links, m); }); }
  // Hallazgos bajos (fuente «adr»): propuestas sin resolver desde hace más de C.adr.staleDays días; aceptadas con opciones y sin elegida;
  // elegida que no es la mejor puntuada cuando todas las opciones están completamente puntuadas
  addFindingSource('adr', m => {
    const days = C.adr?.staleDays ?? 30, now = Date.now(), out = [];
    const tgt = d => { const l = d.links || {}, tk = l.nodes?.[0] ? 'node' : l.edges?.[0] ? 'edge' : l.groups?.[0] ? 'group' : 'node'; return { kind: tk, id: l.nodes?.[0] || l.edges?.[0] || l.groups?.[0] || '' }; };
    (m.decisions || []).forEach(d => {
      if (days > 0 && d.status === 'proposed') {
        const age = Math.floor((now - new Date(`${d.date}T12:00`).getTime()) / 864e5);
        if (age > days) out.push({ id: `adr:stale:${d.id}`, source: 'adr', rule: 'stale', severity: 'low', target: tgt(d), title: T('adr.find.stale', { id: d.id, n: age }), detail: d.title, fix: T('adr.find.fix') });
      }
      const os = d.options || [];
      if (d.status === 'accepted' && os.length >= 2 && !d.chosen) out.push({ id: `adr:no-choice:${d.id}`, source: 'adr', rule: 'no-choice', severity: 'low', target: tgt(d), title: T('adr.find.noChoice', { id: d.id, n: os.length }), detail: d.title, fix: T('adr.find.noChoice.fix') });
      if (d.chosen && os.length >= 2 && os.every(o => adrFull(adrScore(d, o)))) {
        const lead = adrLeader(d);
        if (lead && lead !== d.chosen) {
          const c = os.find(o => o.id === d.chosen), l = os.find(o => o.id === lead);
          out.push({ id: `adr:not-leader:${d.id}`, source: 'adr', rule: 'not-leader', severity: 'low', target: tgt(d), title: T('adr.find.notLeader', { id: d.id, c: c.title || c.id, l: l.title || l.id }), detail: T('adr.find.notLeader.d', { c: adrScore(d, c).pct, l: adrScore(d, l).pct }), fix: T('adr.find.notLeader.fix') });
        }
      }
    });
    return out;
  });

  /* ---------- aprobaciones (firmas de ADR y versiones): modelo ---------- */
  // Cada decisión (m.decisions[i]) y cada versión (m.versions[i]) puede llevar signoffs: [{ by: 'SH-001', verdict: 'approve'|'reject', date, note? }], un registro que solo crece (el más antiguo primero, máx. 200).
  // Aprobadores requeridos: decisión = interesados activos con A en el área (o en '*'); versión = interesados activos con versions. Solo cuentan las firmas de la ronda actual
  // (decisión: desde la última entrada «propuesta» del historial; versión: desde reviewSince) y manda la última de cada interesado. Sin aprobadores requeridos no hay compuertas ni hallazgos.
  /* approvalModel:start */
  const SIGN_MAX = 200;
  const apprKey = v => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  function approversFor(kind, o, m) {
    const people = (m?.stakeholders || []).filter(s => s && s.id && !s.inactive);
    if (kind === 'version') return people.filter(s => s.versions === true).map(s => s.id);
    const area = apprKey(o?.area);
    return people.filter(s => s.raci?.['*'] === 'A' || (area && Object.entries(s.raci || {}).some(([k, v]) => v === 'A' && apprKey(k) === area))).map(s => s.id);
  }
  function approvalState(kind, o, m) {
    const required = approversFor(kind, o, m);
    const since = kind === 'version' ? (isDay(o?.reviewSince) ? o.reviewSince : '') : ((o?.history || []).filter(h => h.status === 'proposed').map(h => h.date).pop() || '');
    const last = new Map();
    (o?.signoffs || []).forEach(s => { if (!since || s.date >= since) last.set(s.by, s.verdict); });
    const approved = required.filter(id => last.get(id) === 'approve'), rejected = required.filter(id => last.get(id) === 'reject'), pending = required.filter(id => !last.has(id));
    return { required, approved, rejected, pending, complete: required.length > 0 && !pending.length && !rejected.length };
  }
  function cleanSignoffs(raw, m) {
    const ids = new Set((m?.stakeholders || []).map(s => s?.id)), out = [];
    (Array.isArray(raw) ? raw : []).forEach(s => {
      if (!s || typeof s !== 'object' || !ids.has(s.by) || (s.verdict !== 'approve' && s.verdict !== 'reject') || !isDay(s.date)) return;
      const e = { by: s.by, verdict: s.verdict, date: s.date };
      if (s.note != null && String(s.note).trim()) e.note = String(s.note).trim().slice(0, 500);
      out.push(e);
    });
    return out.slice(-SIGN_MAX);
  }
  /* approvalModel:end */
  const apprWho = (id, m = S.model) => { const s = (m?.stakeholders || []).find(x => x.id === id); return s ? (s.name || s.id) : id; };
  const apprNames = (ids, m = S.model) => ids.map(id => apprWho(id, m)).join(', ');
  const apprGap = st => [...st.pending, ...st.rejected];   // quién falta (sin firmar o que rechazó)
  // Nombres de quienes faltan para la aprobación completa; [] si no hay aprobación configurada o ya está completa
  const apprMissing = (kind, o, m = S.model) => { const st = approvalState(kind, o, m); return st.required.length && !st.complete ? apprGap(st).map(id => apprWho(id, m)) : []; };
  // Hallazgos (fuente «approval»): decisión aceptada sin la aprobación completa, rechazo de un aprobador requerido y versión aprobada sin la aprobación completa
  addFindingSource('approval', m => {
    const out = [], tgt = d => { const l = d.links || {}, k = l.nodes?.[0] ? 'node' : l.edges?.[0] ? 'edge' : l.groups?.[0] ? 'group' : 'node'; return { kind: k, id: l.nodes?.[0] || l.edges?.[0] || l.groups?.[0] || '' }; };
    (m.decisions || []).forEach(d => {
      const st = approvalState('decision', d, m);
      if (!st.required.length) return;
      if (d.status === 'accepted' && !st.complete) out.push({ id: `approval:adr-unsigned:${d.id}`, source: 'approval', rule: 'adr-unsigned', severity: 'medium', target: tgt(d), title: T('appr.find.adr', { id: d.id, who: apprNames(apprGap(st), m) }), detail: d.title, fix: T('appr.find.adr.fix') });
      if (st.rejected.length && (d.status === 'accepted' || d.status === 'proposed')) out.push({ id: `approval:adr-rejected:${d.id}`, source: 'approval', rule: 'adr-rejected', severity: 'high', target: tgt(d), title: T('appr.find.rej', { id: d.id, who: apprNames(st.rejected, m) }), detail: d.title, fix: T('appr.find.rej.fix') });
    });
    (m.versions || []).forEach(v => {
      const st = approvalState('version', v, m);
      if (v.status === 'approved' && st.required.length && !st.complete) out.push({ id: `approval:ver-unsigned:${v.id}`, source: 'approval', rule: 'ver-unsigned', severity: 'medium', target: { kind: 'node', id: '' }, title: T('appr.find.ver', { v: verLabel(v), who: apprNames(apprGap(st), m) }), detail: '', fix: T('appr.find.ver.fix') });
    });
    return out;
  });

  /* ---------- registro RAID (riesgos, supuestos, problemas, dependencias): modelo ---------- */
  // m.raid = [{ id: 'R-001', type: 'risk'|'assumption'|'issue'|'dependency', title, detail?, owner?, status?: 'open'|'closed' (riesgo, problema, dependencia), probability?, impact? 1..5 y mitigation? (riesgo),
  //   validation?: 'pending'|'validated'|'invalidated' (supuesto), due?, raised?, links?: { decisions?, requirements?, nodes?, edges?, groups? }, history?: [{ validation, date, by?, note? }] (supuesto) }]
  // Es del documento (como las decisiones): no entra en las fotos de versiones y sobrevive al abrir una versión y a los editores. Sin él, el JSON y las exportaciones quedan idénticos.
  // due = «validar antes de» (supuesto) o «necesario para» (problema, dependencia); el riesgo no lleva fecha. Puntaje de un riesgo = probabilidad × impacto (1..25).
  /* raidModel:start */
  const RAID_TYPES = ['risk', 'assumption', 'issue', 'dependency'];
  const RAID_PFX = { risk: 'R', assumption: 'A', issue: 'I', dependency: 'D' };
  const RAID_ALIAS = { riesgo: 'risk', supuesto: 'assumption', problema: 'issue', dependencia: 'dependency' };
  const RAID_STATUS = ['open', 'closed'], RAID_VAL = ['pending', 'validated', 'invalidated'];
  const RAID_ST_ALIAS = { abierto: 'open', abierta: 'open', cerrado: 'closed', cerrada: 'closed' };
  const RAID_VAL_ALIAS = { pendiente: 'pending', validado: 'validated', validada: 'validated', invalidado: 'invalidated', invalidada: 'invalidated' };
  const RAID_COLOR = { open: 'var(--p-limon)', closed: 'var(--muted)', pending: 'var(--p-limon)', validated: 'var(--p-menta)', invalidated: 'var(--p-coral)' };
  const RAID_TYPE_COLOR = { risk: 'var(--p-coral)', assumption: 'var(--p-lavanda)', issue: 'var(--p-melocoton)', dependency: 'var(--p-cielo)' };
  const RAID_LEVEL_COLOR = { low: 'var(--p-menta)', medium: 'var(--p-limon)', high: 'var(--p-coral)' };
  const RAID_MAX = 500, RAID_HIGH = 15, RAID_MEDIUM = 8;   // límite de entradas; puntaje desde el que un riesgo es alto / medio
  const raidType = v => { const k = String(v ?? '').trim().toLowerCase(); return RAID_TYPES.includes(k) ? k : RAID_ALIAS[k] || ''; };
  const raidStatus = v => { const k = String(v ?? '').trim().toLowerCase(); return RAID_STATUS.includes(k) ? k : RAID_ST_ALIAS[k] || 'open'; };
  const raidVal = v => { const k = String(v ?? '').trim().toLowerCase(); return RAID_VAL.includes(k) ? k : RAID_VAL_ALIAS[k] || 'pending'; };
  const raidNum = (id, p) => { const r = new RegExp(`^${p}-(\\d+)$`).exec(String(id)); return r ? +r[1] : 0; };
  const raidNextId = (list, type) => { const p = RAID_PFX[type]; return `${p}-${String(Math.max(0, ...list.map(x => raidNum(x.id, p))) + 1).padStart(3, '0')}`; };
  const raidInt = v => { const n = v === '' || v == null ? NaN : Number(v); return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 0; };
  const raidLong = (v, n) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, n);
  const raidScore = it => (it?.type === 'risk' && it.probability && it.impact ? it.probability * it.impact : 0);
  const raidLevel = s => (s >= RAID_HIGH ? 'high' : s >= RAID_MEDIUM ? 'medium' : 'low');
  // Estado a mostrar y filtrar: validación en los supuestos, abierto/cerrado en el resto
  const raidState = it => (it.type === 'assumption' ? it.validation || 'pending' : it.status || 'open');
  // Solo enlaces a ids que existen; los requisitos se buscan en `reqs` (ids) o en m.requirements, que puede no existir
  function cleanRaidLinks(l, m, reqs) {
    const out = {};
    l = l && typeof l === 'object' ? l : {};
    const rq = reqs || (m.requirements || []).map(x => x.id);
    [['decisions', (m.decisions || []).map(x => x.id)], ['requirements', rq], ['nodes', (m.nodes || []).map(x => x.id)], ['edges', (m.edges || []).map(x => x.id)], ['groups', (m.groups || []).map(x => x.id)]].forEach(([k, src]) => {
      const ok = new Set(src), ids = [...new Set((Array.isArray(l[k]) ? l[k] : []).map(String).filter(id => ok.has(id)))];
      if (ids.length) out[k] = ids;
    });
    return out;
  }
  function cleanRaid(raw, m, reqs) {
    const seen = new Set(), items = [];
    (Array.isArray(raw) ? raw : []).forEach(r => {
      if (!r || typeof r !== 'object' || Array.isArray(r)) return;
      const rid = String(r.id ?? '').trim().slice(0, 40), pre = /^([RAID])-\d+$/.exec(rid);
      const type = raidType(r.type) || (pre ? RAID_TYPES.find(t => RAID_PFX[t] === pre[1]) : '');
      if (!type) return;
      const title = String(r.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 200), detail = raidLong(r.detail, 4000);
      const id = pre && pre[1] === RAID_PFX[type] && !seen.has(rid) ? rid : '';
      if (!id && !title && !detail) return;
      if (id) seen.add(id);
      const o = { id, type, title };
      if (detail) o.detail = detail;
      const owner = String(r.owner ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
      if (owner) o.owner = owner;
      if (type === 'assumption') o.validation = raidVal(r.validation); else o.status = raidStatus(r.status);
      if (type === 'risk') {
        const p = raidInt(r.probability), i = raidInt(r.impact), mit = raidLong(r.mitigation, 2000);
        if (p) o.probability = p;
        if (i) o.impact = i;
        if (mit) o.mitigation = mit;
      } else if (isDay(r.due)) o.due = r.due;
      if (isDay(r.raised)) o.raised = r.raised;
      const links = cleanRaidLinks(r.links, m, reqs);
      if (Object.keys(links).length) o.links = links;
      if (type === 'assumption') {
        const hist = (Array.isArray(r.history) ? r.history : []).filter(h => h && typeof h === 'object' && isDay(h.date)).slice(-100).map(h => {
          const e = { validation: raidVal(h.validation), date: h.date };
          if (h.by != null && String(h.by).trim()) e.by = String(h.by).trim().slice(0, 100);
          if (h.note != null && String(h.note).trim()) e.note = String(h.note).trim().slice(0, 500);
          return e;
        });
        if (hist.length) o.history = hist;
      }
      items.push(o);
    });
    items.forEach(o => { if (!o.id) o.id = raidNextId(items, o.type); });
    return items.slice(0, RAID_MAX);
  }
  // Mapa de calor 5×5: cuenta de riesgos por [impacto - 1][probabilidad - 1]
  function raidHeat(list) {
    const g = Array.from({ length: 5 }, () => [0, 0, 0, 0, 0]);
    (list || []).forEach(it => { if (it.type === 'risk' && it.probability && it.impact) g[it.impact - 1][it.probability - 1]++; });
    return g;
  }
  // Resumen de la cabecera: riesgos abiertos (y cuántos altos), supuestos por validar y vencidos (supuestos pendientes, problemas y dependencias abiertos con fecha pasada)
  function raidSummary(m, now) {
    const l = m.raid || [], risks = l.filter(x => x.type === 'risk' && x.status === 'open');
    const late = x => x.due && x.due < now && (x.type === 'assumption' ? x.validation === 'pending' : x.type !== 'risk' && x.status === 'open');
    return { risks: risks.length, high: risks.filter(x => raidLevel(raidScore(x)) === 'high').length, toValidate: l.filter(x => x.type === 'assumption' && x.validation === 'pending').length, overdue: l.filter(late).length };
  }
  // Avisos del registro, sin textos: [{ rule, key, severity, it, d?, acc?, score? }] (los textos y el destino los pone la fuente de hallazgos)
  function raidIssues(m, now) {
    const out = [], decs = new Map((m.decisions || []).map(d => [d.id, d]));
    (m.raid || []).forEach(it => {
      const ds = it.links?.decisions || [];
      if (it.type === 'assumption') {
        if (it.validation === 'invalidated') ds.forEach(id => { const d = decs.get(id); if (d && (d.status === 'accepted' || d.status === 'proposed')) out.push({ rule: 'invalid', key: `invalid:${it.id}:${id}`, severity: 'high', it, d }); });
        else if (it.validation === 'pending' && it.due && it.due < now) out.push({ rule: 'unvalidated', key: `unvalidated:${it.id}`, severity: 'medium', it, acc: ds.filter(id => decs.get(id)?.status === 'accepted') });
      } else if (it.status === 'open') {
        if (it.type === 'risk') { const s = raidScore(it); if (s >= RAID_HIGH) out.push({ rule: 'risk', key: `risk:${it.id}`, severity: it.mitigation ? 'low' : 'high', it, score: s }); }
        else if (it.due && it.due < now) out.push({ rule: 'overdue', key: `overdue:${it.id}`, severity: 'medium', it });
      }
    });
    return out;
  }
  /* raidModel:end */
  const raidById = id => (S.model.raid || []).find(x => x.id === id);
  const raidOf = (kind, id, m = S.model) => (m?.raid || []).filter(x => x.links?.[kind]?.includes(id));
  // Tras borrar nodos, conexiones, grupos, decisiones o requisitos: quita de los enlaces los ids que ya no existen
  function pruneRaidLinks(m = S.model) {
    (m.raid || []).forEach(x => { if (!x.links) return; const l = cleanRaidLinks(x.links, m); if (Object.keys(l).length) x.links = l; else delete x.links; });
  }
  // Hallazgos (fuente «raid»): supuesto invalidado que sostiene una decisión, supuesto sin validar a tiempo, riesgo alto y problema o dependencia vencidos
  addFindingSource('raid', m => raidIssues(m, today()).map(({ rule, key, severity, it, d, acc, score }) => {
    const l = it.links || {}, dl = d?.links || {}, pick = x => (x.nodes?.[0] ? { kind: 'node', id: x.nodes[0] } : x.edges?.[0] ? { kind: 'edge', id: x.edges[0] } : x.groups?.[0] ? { kind: 'group', id: x.groups[0] } : null);
    const target = pick(l) || (d && pick(dl)) || { kind: 'node', id: '' }, base = { id: `raid:${key}`, source: 'raid', rule, severity, target };
    if (rule === 'invalid') return { ...base, title: T('raid.find.invalid', { adr: d.id, id: it.id }), detail: it.title, fix: T('raid.find.invalid.fix') };
    if (rule === 'unvalidated') return { ...base, title: T('raid.find.unvalidated', { id: it.id, due: fmtDay(it.due) }), detail: [it.title, acc.length ? T('raid.find.unvalidated.acc', acc.join(', ')) : ''].filter(Boolean).join(' · '), fix: T('raid.find.unvalidated.fix') };
    if (rule === 'risk') return { ...base, title: T('raid.find.risk', { id: it.id, s: score }), detail: it.title, fix: T(it.mitigation ? 'raid.find.risk.fix2' : 'raid.find.risk.fix') };
    return { ...base, title: T('raid.find.overdue', { id: it.id, type: T(`raid.type1.${it.type}`).toLowerCase(), due: fmtDay(it.due) }), detail: it.title, fix: T('raid.find.overdue.fix') };
  }));

  /* ---------- interesados (comité del cliente) y matriz RACI por área de decisión: modelo ---------- */
  // m.stakeholders = [{ id: 'SH-001', name, role?, org: 'client'|'partner'|'internal', raci?: { '<área>': 'R'|'A'|'C'|'I', '*': … }, versions?: true (aprueba versiones), inactive?: true (ya no está: nunca se exige, el historial se conserva) }]
  // Es del documento (como las decisiones y el RAID): no entra en las fotos de versiones y sobrevive al abrir una versión y a los editores. Sin él, el JSON y las exportaciones quedan idénticos.
  // Las claves de raci son áreas de ADR (sin distinguir mayúsculas ni espacios de más); '*' = todas las áreas.
  /* stakeholderModel:start */
  const SH_ORG = ['client', 'partner', 'internal'], SH_RACI = ['R', 'A', 'C', 'I'], SH_ORG_ALIAS = { cliente: 'client', socio: 'partner', interno: 'internal' };
  const SH_MAX = 200, SH_AREAS = 40;   // límite de interesados; claves de raci por interesado
  const shOrg = v => { const k = String(v ?? '').trim().toLowerCase(); return SH_ORG.includes(k) ? k : SH_ORG_ALIAS[k] || 'client'; };
  const shArea = a => (String(a ?? '').trim() === '*' ? '*' : String(a ?? '').replace(/[,\s]+/g, ' ').trim().slice(0, 60));   // sin comas: el texto separa las áreas con comas
  function cleanShRaci(raw) {
    const out = {}, seen = new Set();
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) Object.entries(raw).forEach(([k, v]) => {
      const a = shArea(k), r = String(v ?? '').trim().toUpperCase();
      if (!a || !SH_RACI.includes(r) || seen.has(a.toLowerCase()) || Object.keys(out).length >= SH_AREAS) return;
      seen.add(a.toLowerCase()); out[a] = r;
    });
    return out;
  }
  function cleanStakeholders(raw, m) {
    const seen = new Set(), items = [];
    (Array.isArray(raw) ? raw : []).forEach(s => {
      if (!s || typeof s !== 'object' || Array.isArray(s)) return;
      const name = String(s.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
      if (!name) return;
      let id = String(s.id ?? '').trim().slice(0, 40);
      if (!/^SH-\d+$/.test(id) || seen.has(id)) id = ''; else seen.add(id);
      items.push({ s, id, name });
    });
    const num = id => (/^SH-(\d+)$/.exec(id) || [0, 0])[1] | 0;
    items.forEach(o => { if (!o.id) o.id = `SH-${String(Math.max(0, ...items.map(x => num(x.id))) + 1).padStart(3, '0')}`; });
    return items.slice(0, SH_MAX).map(({ s, id, name }) => {
      const r = { id, name }, role = String(s.role ?? '').replace(/\s+/g, ' ').trim().slice(0, 80), raci = cleanShRaci(s.raci);
      if (role) r.role = role;
      r.org = shOrg(s.org);
      if (Object.keys(raci).length) r.raci = raci;
      if (s.versions === true) r.versions = true;
      if (s.inactive === true) r.inactive = true;
      return r;
    });
  }
  // ¿Tiene el interesado una A en esa área (o en '*')?
  const shIsA = (s, area) => !!s.raci && (s.raci['*'] === 'A' || (!!area && Object.entries(s.raci).some(([k, v]) => v === 'A' && k.toLowerCase() === String(area).trim().toLowerCase())));
  // Áreas de las decisiones (sin repetir, sin distinguir mayúsculas) y, detrás, las que solo aparecen en alguna matriz
  function shAreas(m) {
    const seen = new Map(), add = a => { a = shArea(a); if (a && a !== '*' && !seen.has(a.toLowerCase())) seen.set(a.toLowerCase(), a); };
    (m.decisions || []).forEach(d => add(d.area));
    (m.stakeholders || []).forEach(s => Object.keys(s.raci || {}).forEach(add));
    return [...seen.values()];
  }
  // Áreas usadas por alguna decisión y sin ningún aprobador (A) activo; solo si hay interesados
  function shGaps(m) {
    const act = (m.stakeholders || []).filter(s => !s.inactive), seen = new Map();
    if (!(m.stakeholders || []).length) return [];
    (m.decisions || []).forEach(d => { const a = shArea(d.area); if (a && !seen.has(a.toLowerCase())) seen.set(a.toLowerCase(), a); });
    return [...seen.values()].filter(a => !act.some(s => shIsA(s, a)));
  }
  /* stakeholderModel:end */
  const shById = id => (S.model.stakeholders || []).find(x => x.id === id);
  // ¿Tiene firmas (de ADR o de versión)? Entonces no se borra: se marca inactivo y el historial de aprobaciones queda íntegro
  const shHasSignoffs = (id, m = S.model) => [...(m.decisions || []), ...(m.versions || [])].some(o => (o.signoffs || []).some(x => x.by === id));
  // Hallazgo bajo (fuente «approval»): un área con decisiones y sin nadie que la apruebe
  addFindingSource('approval', m => shGaps(m).map(area => {
    const same = x => shArea(x.area).toLowerCase() === area.toLowerCase(), d = (m.decisions || []).find(x => same(x) && (x.links?.nodes?.[0] || x.links?.edges?.[0] || x.links?.groups?.[0])), l = d?.links || {};
    const target = l.nodes?.[0] ? { kind: 'node', id: l.nodes[0] } : l.edges?.[0] ? { kind: 'edge', id: l.edges[0] } : l.groups?.[0] ? { kind: 'group', id: l.groups[0] } : { kind: 'node', id: '' };
    return { id: `approval:no-approver:${area}`, source: 'approval', rule: 'no-approver', severity: 'low', target, title: T('people.find.noApprover', area), detail: (m.decisions || []).filter(same).map(x => x.id).join(', '), fix: T('people.find.noApprover.fix') };
  }));


  /* ---------- requisitos (impulsores, RNF, restricciones, principios) y sus controles: modelo ---------- */
  // m.requirements = [{ id: 'REQ-001', title, kind, detail?, priority?, status, source?, check?: { metric, from?, to?, target?, cls?, jur? }, links?: { decisions?, nodes?, edges?, groups? } }]
  // Son del documento (como las decisiones): no entran en las fotos de versiones y sobreviven al abrir una versión y a los editores.
  // Sin la clave (o vacía) el JSON y las exportaciones quedan idénticos. check = «función de aptitud»: se evalúa con lo que la app ya calcula (reqEval).
  /* reqModel:start */
  const REQ_KIND = ['driver', 'nfr', 'constraint', 'principle'], REQ_PRIO = ['must', 'should', 'could'], REQ_STATUS = ['draft', 'agreed', 'dropped'];
  const REQ_METRIC = ['availability', 'rpo', 'rto', 'cost', 'encryption', 'residency', 'freshness'];
  const REQ_PARAMS = { availability: ['from', 'to', 'target'], rpo: ['from', 'to', 'target'], rto: ['from', 'to', 'target'], cost: ['target'], encryption: ['cls'], residency: ['cls', 'jur'], freshness: ['ds', 'target'] };
  const REQ_ALIAS = { impulsor: 'driver', rnf: 'nfr', restriccion: 'constraint', principio: 'principle', debe: 'must', deberia: 'should', podria: 'could', borrador: 'draft', acordado: 'agreed', acordada: 'agreed', descartado: 'dropped', descartada: 'dropped',
    disponibilidad: 'availability', costo: 'cost', coste: 'cost', cifrado: 'encryption', residencia: 'residency', frescura: 'freshness' };
  const REQ_COLOR = { driver: 'var(--p-cielo)', nfr: 'var(--p-lavanda)', constraint: 'var(--p-melocoton)', principle: 'var(--p-menta)' };
  const reqEnum = (v, list) => { const k = String(v ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); return list.includes(k) ? k : list.includes(REQ_ALIAS[k]) ? REQ_ALIAS[k] : ''; };
  const reqNum = id => { const r = /^REQ-(\d+)$/i.exec(String(id)); return r ? +r[1] : 0; };
  const reqNextId = list => `REQ-${String(Math.max(0, ...list.map(r => reqNum(r.id))) + 1).padStart(3, '0')}`;
  // Solo enlaces a ids que existen (decisiones: las de m.decisions)
  function cleanReqLinks(l, m) {
    const out = {};
    l = l && typeof l === 'object' ? l : {};
    [['decisions', m.decisions || []], ['nodes', m.nodes], ['edges', m.edges], ['groups', m.groups]].forEach(([k, src]) => {
      const ok = new Set(src.map(x => x.id)), ids = [...new Set((Array.isArray(l[k]) ? l[k] : []).map(String).filter(id => ok.has(id)))];
      if (ids.length) out[k] = ids;
    });
    return out;
  }
  // Solo los parámetros que la métrica necesita; origen y destino solo si el nodo existe; objetivo numérico (disponibilidad: 0..100; el resto: 0 o más)
  function cleanReqCheck(c, m) {
    const metric = reqEnum(c?.metric, REQ_METRIC);
    if (!metric) return null;
    const out = { metric }, ps = REQ_PARAMS[metric];
    ['from', 'to'].filter(k => ps.includes(k)).forEach(k => { const v = String(c[k] ?? '').trim(); if (m.nodes.some(n => n.id === v)) out[k] = v; });
    if (ps.includes('ds')) { const v = String(c.ds ?? '').replace(/\s+/g, ' ').trim().slice(0, 120); if (v) out.ds = v; }   // nombre del conjunto de datos (como en las conexiones)
    if (ps.includes('target') && c.target != null && String(c.target).trim() !== '') { const t = Number(String(c.target).replace(',', '.')); if (Number.isFinite(t) && t >= 0 && (metric !== 'availability' || t <= 100)) out.target = t; }
    ['cls', 'jur'].filter(k => ps.includes(k)).forEach(k => { const v = String(c[k] ?? '').trim().toLowerCase().slice(0, 40); if (v) out[k] = v; });
    return out;
  }
  function cleanRequirements(raw, m) {
    const txt = v => String(v ?? '').replace(/\r\n?/g, '\n').slice(0, 4000);
    const seen = new Set(), items = [];
    (Array.isArray(raw) ? raw : []).forEach(r => {
      if (!r || typeof r !== 'object' || Array.isArray(r)) return;
      const title = String(r.title ?? '').trim().slice(0, 200), detail = txt(r.detail);
      let id = String(r.id ?? '').trim().slice(0, 40);
      if (!id && !title && !detail.trim()) return;
      if (!id || seen.has(id)) id = ''; else seen.add(id);
      const o = { id, title, kind: reqEnum(r.kind, REQ_KIND) || 'driver' };
      if (detail.trim()) o.detail = detail;
      const pr = reqEnum(r.priority, REQ_PRIO);
      if (pr) o.priority = pr;
      o.status = reqEnum(r.status, REQ_STATUS) || 'draft';
      const src = String(r.source ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
      if (src) o.source = src;
      const ck = r.check && typeof r.check === 'object' ? cleanReqCheck(r.check, m) : null;
      if (ck) o.check = ck;
      const lk = cleanReqLinks(r.links, m);
      if (Object.keys(lk).length) o.links = lk;
      items.push(o);
    });
    items.forEach(o => { if (!o.id) o.id = reqNextId(items); });
    return items;
  }
  // Cobertura: decisiones aceptadas enlazadas y componentes (nodos, conexiones, grupos) enlazados; cubierto = alguna de las dos
  function reqCover(r, m) {
    const l = r.links || {}, ds = (l.decisions || []).map(id => (m.decisions || []).find(d => d.id === id)).filter(d => d && d.status === 'accepted');
    const comps = (l.nodes || []).length + (l.edges || []).length + (l.groups || []).length;
    return { decisions: ds, comps, covered: ds.length > 0 || comps > 0 };
  }
  // Evalúa el control de un requisito → { state: 'pass' | 'fail' | 'unknown', actual, detail }. Solo corre con estado «agreed».
  // h = lo que la app ya calcula: T, availability(a, b) → { availability, rpo, rto } | null, cost(m) → mensual | null, carries(e, get, cls), crossBorder(e), sensitive(cls),
  //     nodeJur(n) → clave de jurisdicción, edgeName(e), pct(a), dur(seg), money(v), num(v)
  function reqEval(r, m, h) {
    const c = r.check, T = h.T, res = (state, actual, detail = '') => ({ state, actual, detail });
    if (!c) return res('unknown', null, T('req.chk.none'));
    if (r.status !== 'agreed') return res('unknown', null, T('req.chk.draft'));
    const miss = (REQ_PARAMS[c.metric] || []).filter(k => c[k] == null || c[k] === '');
    if (miss.length) return res('unknown', null, T('req.chk.missing', { p: miss.map(k => T(`req.chk.p.${k}`)).join(', ') }));
    const get = id => m.nodes.find(n => n.id === id), list = es => { const nm = es.slice(0, 5).map(h.edgeName).join('; '); return es.length > 5 ? `${nm}; +${es.length - 5}` : nm; };
    if (c.metric === 'availability' || c.metric === 'rpo' || c.metric === 'rto') {
      if (!get(c.from) || !get(c.to)) return res('unknown', null, T('req.chk.node'));
      const a = h.availability(c.from, c.to);
      if (!a) return res('unknown', null, T('req.chk.noRoute'));
      if (c.metric === 'availability') {
        if (a.availability == null) return res('unknown', null, T('req.chk.noSla'));
        const act = a.availability * 100, ok = act + 1e-9 >= c.target;
        return res(ok ? 'pass' : 'fail', act, T('req.chk.d.avail', { a: h.pct(a.availability), t: `${h.num(c.target)}%` }));
      }
      const sec = a[c.metric];
      if (sec == null) return res('unknown', null, T('req.chk.noDur', c.metric.toUpperCase()));
      const ok = sec <= c.target * 3600 + 1e-6;
      return res(ok ? 'pass' : 'fail', sec / 3600, T('req.chk.d.dur', { m: c.metric.toUpperCase(), a: h.dur(sec), t: h.dur(c.target * 3600) }));
    }
    if (c.metric === 'cost') {
      const tot = h.cost(m);
      if (tot == null) return res('unknown', null, T('req.chk.noCost'));
      return res(tot <= c.target + 1e-9 ? 'pass' : 'fail', tot, T('req.chk.d.cost', { a: h.money(tot), t: h.money(c.target) }));
    }
    if (c.metric === 'freshness') {   // peor frescura de extremo a extremo del conjunto (suma de las latencias del camino más lento) frente al objetivo en horas
      const f = h.e2e?.(c.ds);
      if (!f || f.worst == null) return res('unknown', null, T('req.chk.noFresh', c.ds));
      const hrs = f.worst / 3600000, ok = f.worst <= c.target * 3600000 + 1e-6;
      return res(ok ? 'pass' : 'fail', hrs, T('req.chk.d.fresh', { n: c.ds, a: h.dur(f.worst / 1000), t: h.dur(c.target * 3600) }));
    }
    if (c.metric === 'encryption') {
      const es = m.edges.filter(e => h.carries(e, get, c.cls));
      if (!es.length) return res('unknown', null, T('req.chk.noEdges', c.cls));
      const bad = es.filter(e => e.encrypted !== true);
      return res(bad.length ? 'fail' : 'pass', bad.length, bad.length ? T('req.chk.d.enc', { n: bad.length, c: c.cls, list: list(bad) }) : T('req.chk.d.encOk', { n: es.length, c: c.cls }));
    }
    if (!h.sensitive(c.cls)) return res('unknown', null, T('req.chk.notSens', c.cls));
    if (!m.nodes.some(n => h.nodeJur(n) === c.jur)) return res('unknown', null, T('req.chk.noJur', c.jur));
    const bad = m.edges.filter(e => { const cb = h.crossBorder(e); return cb && !cb.approved && cb.classes.includes(c.cls) && cb.from.jur.key === c.jur && cb.to.jur.key !== c.jur; });
    return res(bad.length ? 'fail' : 'pass', bad.length, bad.length ? T('req.chk.d.res', { n: bad.length, c: c.cls, j: c.jur, list: list(bad) }) : T('req.chk.d.resOk', { c: c.cls, j: c.jur }));
  }
  // Hallazgos de los requisitos acordados: obligatorios y recomendables sin cobertura (ni decisión aceptada ni componente enlazado) y controles que fallan
  function reqIssues(m, h) {
    const out = [];
    (m.requirements || []).forEach(r => {
      if (r.status !== 'agreed') return;
      if ((r.priority === 'must' || r.priority === 'should') && !reqCover(r, m).covered) out.push({ rule: 'uncovered', r, severity: r.priority === 'must' ? 'medium' : 'low' });
      const c = r.check && reqEval(r, m, h);
      if (c?.state === 'fail') out.push({ rule: 'fail', r, severity: r.priority === 'must' ? 'high' : 'medium', detail: c.detail });
    });
    return out;
  }
  /* reqModel:end */
  const requirementsOf = (kind, id, m = S.model) => (m?.requirements || []).filter(r => r.links?.[kind]?.includes(id));
  // Tras borrar nodos, conexiones, grupos o decisiones: quita de los enlaces (y de origen/destino del control) los ids que ya no existen
  function pruneReqLinks(m = S.model) {
    (m.requirements || []).forEach(r => {
      const l = cleanReqLinks(r.links, m);
      if (Object.keys(l).length) r.links = l; else delete r.links;
      ['from', 'to'].forEach(k => { if (r.check?.[k] && !m.nodes.some(n => n.id === r.check[k])) delete r.check[k]; });
    });
  }
  // El control con lo que la app ya calcula: disponibilidad compuesta (availability), costo mensual (monthlyTotal), cifrado y cruce de fronteras (crossBorder)
  const REQ_H = {
    T: (k, v) => T(k, v), availability: (a, b) => availability(a, b), e2e: name => e2eOf(name), cost: m => { const ns = m.nodes.filter(hasCost); return ns.length ? monthlyTotal(ns) : null; },
    carries: (e, get, cls) => (e.data?.length ? e.data : [...(get(e.from)?.data || []), ...(e.both ? get(e.to)?.data || [] : [])]).includes(cls),
    crossBorder: e => crossBorder(e, id => S.model.nodes.find(n => n.id === id)), sensitive: cls => !!DATA[cls]?.sensitive, nodeJur: n => jurOf(regionOf(n).value)?.key || '',
    edgeName: e => { const nm = id => S.model.nodes.find(n => n.id === id)?.label || id; return `${nm(e.from)} ${e.both ? '↔' : '→'} ${nm(e.to)}`; }, pct: a => fmtPct(a), dur: s => fmtDur(s), money: v => money(v), num: v => numFmt(v, 4)
  };
  const reqCheck = (r, m = S.model) => reqEval(r, m, REQ_H);
  // Hallazgos (fuente «req»): obligatorios y recomendables acordados sin cobertura (ni decisión aceptada ni componente enlazado); controles que fallan
  addFindingSource('req', m => reqIssues(m, REQ_H).map(({ rule, r, severity, detail }) => {
    const l = r.links || {}, id0 = r.check?.from || l.nodes?.[0] || '', target = id0 ? { kind: 'node', id: id0 } : l.edges?.[0] ? { kind: 'edge', id: l.edges[0] } : l.groups?.[0] ? { kind: 'group', id: l.groups[0] } : { kind: 'node', id: '' };
    return rule === 'uncovered'
      ? { id: `req:uncovered:${r.id}`, source: 'req', rule, severity, target, title: T('req.find.uncovered', { id: r.id, t: r.title }), detail: T(`req.pr.${r.priority}`), fix: T('req.find.uncovered.fix') }
      : { id: `req:fail:${r.id}`, source: 'req', rule, severity, target, title: T('req.find.fail', { id: r.id, t: r.title }), detail, fix: T('req.find.fail.fix') };
  }));

  /* ---------- fases (hoja de ruta de la arquitectura): modelo ---------- */
  // m.phases = [{ id: 'mvp', name, date?: 'AAAA-MM' | 'AAAA-MM-DD', goal? }]: el orden del arreglo ES la línea de tiempo (máx. 12).
  // En nodos, conexiones y grupos: phase = fase en la que aparece (sin él, ya estaba en la primera) y until = fase en la que se retira (ya no está desde ella; debe ir después de phase).
  // Es del diagrama (entra en las fotos de versiones). Sin fases, el JSON y las exportaciones quedan idénticos. Un id desconocido se descarta: el elemento queda «siempre presente».
  /* phaseModel:start */
  // Esfuerzo (días-persona): node.effort = [{ role, days }] (hasta 8 perfiles), phase.extra = [{ label, role, days }] (trabajo que no es un componente), m.estimation = { contingency } (% sobre el esfuerzo).
  // Un perfil que config.js no conoce se conserva (cada empresa trae los suyos); sin esfuerzo no hay clave: JSON y exportaciones idénticos.
  const EF_MAX = 8, EF_EXTRA_MAX = 20, EF_ROLE = /^[a-z][a-z0-9_-]{0,19}$/, EF_DAYS = 9999;
  const efDays = v => { const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.trim().replace(',', '.')) : NaN; return Number.isFinite(n) && n > 0 ? Math.min(EF_DAYS, Math.round(n * 100) / 100) : 0; };
  const efRole = v => { const r = String(v ?? '').trim().toLowerCase(); return EF_ROLE.test(r) ? r : ''; };
  function cleanEffort(raw) {
    const sum = new Map();
    (Array.isArray(raw) ? raw : []).forEach(e => { if (!e || typeof e !== 'object') return; const role = efRole(e.role), days = efDays(e.days); if (role && days) sum.set(role, Math.min(EF_DAYS, Math.round(((sum.get(role) || 0) + days) * 100) / 100)); });
    return [...sum].slice(0, EF_MAX).map(([role, days]) => ({ role, days }));
  }
  function cleanExtra(raw) {
    const out = [];
    (Array.isArray(raw) ? raw : []).forEach(e => { if (!e || typeof e !== 'object') return; const role = efRole(e.role), days = efDays(e.days), label = String(e.label ?? '').replace(/\s+/g, ' ').trim().slice(0, 80); if (label && role && days) out.push({ label, role, days }); });
    return out.slice(0, EF_EXTRA_MAX);
  }
  const cleanEstimation = raw => { const c = raw && typeof raw === 'object' && !Array.isArray(raw) && raw.contingency != null && raw.contingency !== '' ? Number(raw.contingency) : NaN; return Number.isFinite(c) && c >= 0 && c <= 100 ? { contingency: Math.round(c * 10) / 10 } : null; };
  const PHASE_MAX = 12, PHASE_ID = /^[A-Za-z0-9_-]{1,30}$/;
  const phaseDay = v => { const r = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(v ?? '').trim()); if (!r) return ''; const mo = +r[2], d = r[3] == null ? 1 : +r[3]; return mo >= 1 && mo <= 12 && d >= 1 && d <= new Date(Date.UTC(+r[1], mo, 0)).getUTCDate() ? String(v).trim() : ''; };
  function cleanPhases(raw) {
    const seen = new Set(), out = [];
    (Array.isArray(raw) ? raw : []).forEach(p => {
      if (!p || typeof p !== 'object' || Array.isArray(p)) return;
      const id = String(p.id ?? '').trim();
      if (!PHASE_ID.test(id) || seen.has(id)) return;
      seen.add(id);
      const o = { id, name: String(p.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) || id };
      const date = phaseDay(p.date), goal = String(p.goal ?? '').replace(/\r\n?/g, '\n').trim().slice(0, 500);
      if (date) o.date = date;
      if (goal) o.goal = goal;
      { const ex = cleanExtra(p.extra); if (ex.length) o.extra = ex; }
      out.push(o);
    });
    return out.slice(0, PHASE_MAX);
  }
  const phaseIndex = (m, id) => (m.phases || []).findIndex(p => p.id === id);
  // Deja en nodos, conexiones y grupos solo fases que existen; until debe ir después de phase (sin phase, después de la primera fase)
  function cleanPhaseRefs(els, phases) {
    const idx = new Map((phases || []).map((p, i) => [p.id, i]));
    els.forEach(x => {
      const a = x.phase == null ? -1 : idx.has(String(x.phase)) ? idx.get(String(x.phase)) : -2, b = x.until == null ? -1 : idx.has(String(x.until)) ? idx.get(String(x.until)) : -2;
      if (a >= 0) x.phase = String(x.phase); else delete x.phase;
      if (b >= 0 && b > Math.max(a, 0)) x.until = String(x.until); else delete x.until;
    });
  }
  // Estado del elemento en la fase i: 0 presente, 1 futuro (aún no aparece), -1 retirado. i < 0 («Todas») = todo presente
  const phaseState = (el, i, m) => {
    if (i < 0) return 0;
    const a = el.phase ? phaseIndex(m, el.phase) : -1, b = el.until ? phaseIndex(m, el.until) : -1;
    return b >= 0 && b <= i ? -1 : a > i ? 1 : 0;
  };
  const inPhase = (el, i, m) => phaseState(el, i, m) === 0;
  // Estado de todos los elementos en la fase i: { nodes, edges, groups } (Map id → 0 | 1 | -1).
  // Un grupo sin campos propios existe si algún nodo suyo (o de sus subgrupos) existe; si todos son futuros es futuro; si ya no queda ninguno es retirado; vacío = presente.
  // Una conexión sigue a sus extremos: retirada si cualquiera lo está, futura si cualquiera es futuro
  function phaseStates(m, i) {
    const nodes = new Map(m.nodes.map(n => [n.id, phaseState(n, i, m)])), gm = new Map(m.groups.map(g => [g.id, g]));
    const below = new Map(m.groups.map(g => [g.id, []]));
    m.nodes.forEach(n => { let g = n.group, k = 0; while (g && gm.has(g) && k++ < 50) { below.get(g).push(nodes.get(n.id)); g = gm.get(g).parent; } });
    const groups = new Map(m.groups.map(g => {
      const own = g.phase || g.until, s = below.get(g.id);
      return [g.id, own || !s.length ? phaseState(g, i, m) : s.includes(0) ? 0 : s.includes(1) ? 1 : -1];
    }));
    const edges = new Map(m.edges.map(e => { const s = [phaseState(e, i, m), nodes.get(e.from) ?? 0, nodes.get(e.to) ?? 0]; return [e.id, s.includes(-1) ? -1 : s.includes(1) ? 1 : 0]; }));
    return { nodes, edges, groups };
  }
  // Un modelo nuevo con solo lo que existe en la fase i (lo demás de m queda igual); i = -1 o sin fases = el propio m
  function phaseModel(m, i) {
    if (i < 0 || !(m.phases || []).length) return m;
    const st = phaseStates(m, i), gm = new Map(m.groups.map(g => [g.id, g]));
    const up = id => { let k = 0; while (id && k++ < 50 && !(gm.has(id) && st.groups.get(id) === 0)) id = gm.get(id)?.parent; return gm.has(id) && st.groups.get(id) === 0 ? id : undefined; };   // grupo presente más cercano
    const fix = (x, key) => { const o = { ...x }, g = up(x[key]); if (g) o[key] = g; else delete o[key]; return o; };
    return {
      ...m,
      groups: m.groups.filter(g => st.groups.get(g.id) === 0).map(g => fix(g, 'parent')),
      nodes: m.nodes.filter(n => st.nodes.get(n.id) === 0).map(n => fix(n, 'group')),
      edges: m.edges.filter(e => st.edges.get(e.id) === 0).map(e => ({ ...e })),
      ...(m.datasets ? { datasets: m.datasets.filter(d => !d.phase || phaseIndex(m, d.phase) <= i) } : {})   // un conjunto sin fase está siempre; con fase, desde esa fase
    };
  }
  // Nodos que entran y salen en la fase i respecto de la anterior (en la primera: los que declaran esa fase)
  function phaseDiff(m, i) {
    if (i < 0 || i >= (m.phases || []).length) return { added: [], retired: [] };
    if (i === 0) return { added: m.nodes.filter(n => n.phase === m.phases[0].id).map(n => n.id), retired: [] };
    const here = phaseStates(m, i).nodes, before = phaseStates(m, i - 1).nodes;
    return { added: m.nodes.filter(n => here.get(n.id) === 0 && before.get(n.id) !== 0).map(n => n.id), retired: m.nodes.filter(n => before.get(n.id) === 0 && here.get(n.id) !== 0).map(n => n.id) };
  }
  // Cifras de la fase i; h = { monthly(modelo) → costo mensual, findings(modelo) → hallazgos abiertos [{ severity }], storage?(conjunto) → { monthly } | null (almacenamiento estimado) }
  // datasets = conjuntos declarados presentes en la fase; storage = suma mensual estimada de los que tienen volumen (null si ninguno; aparte del costo escrito a mano)
  function phaseStats(m, i, h) {
    const pm = phaseModel(m, i), f = { high: 0, medium: 0, low: 0 };
    (h.findings(pm) || []).forEach(x => { const k = x.severity === 'critical' || x.severity === 'high' ? 'high' : x.severity === 'medium' ? 'medium' : 'low'; f[k]++; });
    const dss = pm.datasets || [], sto = h.storage ? dss.map(d => h.storage(d)).filter(Boolean) : [];
    const mig = {};
    pm.nodes.forEach(n => { if (n.disposition) mig[n.disposition] = (mig[n.disposition] || 0) + 1; });   // reparto 6R de los componentes presentes (sin ninguno, la clave no existe)
    return { nodes: pm.nodes.length, edges: pm.edges.length, cost: h.monthly(pm), findings: f, datasets: dss.length, storage: sto.length ? sto.reduce((s, x) => s + x.monthly, 0) : null, ...(Object.keys(mig).length ? { mig } : {}) };
  }
  // Tabla comparativa: una fila por fase (orden = línea de tiempo). cost = null si ningún componente de la fase tiene costo (h.hasCost(modelo)); dCost = cambio respecto de la fase anterior
  function phaseRows(m, h) {
    let prev = null;
    return (m.phases || []).map((p, i) => {
      const st = phaseStats(m, i, h), d = phaseDiff(m, i), cost = h.hasCost && !h.hasCost(phaseModel(m, i)) ? null : st.cost;
      const dCost = i > 0 && (cost != null || prev != null) ? (cost || 0) - (prev || 0) : null;
      prev = cost;
      return { id: p.id, name: p.name, date: p.date || '', goal: p.goal || '', nodes: st.nodes, edges: st.edges, added: d.added.length, retired: d.retired.length, addedIds: d.added, retiredIds: d.retired, cost, dCost, findings: st.findings, datasets: st.datasets, datasetIds: (phaseModel(m, i).datasets || []).map(x => x.id), storage: st.storage, ...(st.mig ? { mig: st.mig } : {}) };
    });
  }
  // Esfuerzo por fase (D8): cada componente cuenta en la fase donde aparece (phase; sin fase, la primera) y el trabajo extra, en la suya. Sin fases hay una sola fila (id '').
  // h.rate(role) = tarifa por día o null; h.contingency = % por defecto (m.estimation.contingency manda). Devuelve null si nada del diagrama tiene esfuerzo.
  // Fila: { id, name, comps, estimated, missing: [ids sin esfuerzo], days, extraDays, byRole, cost, contingency, total, daysTotal, cumulative, cumDays, unrated: [perfiles sin tarifa] }
  function phaseEffort(m, h) {
    const ph = m.phases || [], r2 = v => Math.round(v * 100) / 100;
    if (!m.nodes.some(n => n.effort?.length) && !ph.some(p => p.extra?.length)) return null;
    const pct = m.estimation?.contingency ?? (Number.isFinite(+h.contingency) ? +h.contingency : 0), cols = ph.length ? ph : [{ id: '', name: '' }], first = cols[0].id;
    let cum = 0, cumDays = 0;
    const rows = cols.map(p => {
      const here = m.nodes.filter(n => (n.phase || first) === p.id), by = {}, ex = p.extra || [];
      here.forEach(n => (n.effort || []).forEach(e => { by[e.role] = r2((by[e.role] || 0) + e.days); }));
      ex.forEach(e => { by[e.role] = r2((by[e.role] || 0) + e.days); });
      const days = r2(Object.values(by).reduce((a, d) => a + d, 0)), cost = r2(Object.entries(by).reduce((a, [role, d]) => a + d * (h.rate(role) || 0), 0)), cc = r2(cost * pct / 100), total = r2(cost + cc), daysTotal = r2(days * (1 + pct / 100));
      cum = r2(cum + total); cumDays = r2(cumDays + daysTotal);
      return { id: p.id, name: p.name, comps: here.length, estimated: here.filter(n => n.effort?.length).length, missing: here.filter(n => !n.effort?.length).map(n => n.id), days, extraDays: r2(ex.reduce((a, e) => a + e.days, 0)), byRole: by, cost, contingency: cc, total, daysTotal, cumulative: cum, cumDays, unrated: Object.keys(by).filter(role => h.rate(role) == null) };
    });
    const sum = k => r2(rows.reduce((a, r) => a + r[k], 0));
    return { pct, rows, totals: { days: sum('days'), extraDays: sum('extraDays'), cost: sum('cost'), contingency: sum('contingency'), total: sum('total'), daysTotal: sum('daysTotal') } };
  }
  /* phaseModel:end */
  /* ---------- estimación de esfuerzo (días-persona por perfil; los perfiles y tarifas vienen de config.js › estimation) ---------- */
  const EST = { hoursPerDay: 8, contingency: 0, roles: [], ...C.estimation };
  const EF_ROLES = new Map((Array.isArray(EST.roles) ? EST.roles : []).filter(r => r && efRole(r.id)).map(r => [efRole(r.id), r]));
  const efInfo = id => { const r = EF_ROLES.get(id), rate = r ? Number(r.rate) : NaN; return { id, known: !!r, label: r ? loc(r.label) || id : id, rate: Number.isFinite(rate) && rate >= 0 ? rate : null }; };
  const efDaysOf = list => round2((list || []).reduce((a, e) => a + e.days, 0));
  const effortHelpers = { rate: role => efInfo(role).rate, contingency: EST.contingency };
  const efCostOf = list => round2((list || []).reduce((a, e) => a + e.days * (efInfo(e.role).rate || 0), 0));
  // Avisos de la estimación (config.js › estimation.rules): fase con componentes sin estimar mientras otros sí, y perfil sin tarifa; solo avisan
  addFindingSource('estimation', m => {
    const ER = EST.rules || {}, on = id => !!ER[id] && ER[id].enabled !== false, sev = id => (SEVERITY.includes(ER[id]?.severity) ? ER[id].severity : 'low');
    const pe = phaseEffort(m, effortHelpers), out = [];
    if (!pe) return out;
    if (on('est.unestimated')) pe.rows.forEach(r => { if (r.estimated && r.missing.length) out.push({ id: `estimation:unestimated:${r.id || '-'}`, source: 'estimation', rule: 'est.unestimated', severity: sev('est.unestimated'), target: { kind: 'node', id: r.missing[0] }, title: T('est.f.unest.t', { n: r.missing.length, p: r.name || T('est.all') }), fix: T('est.f.unest.fix') }); });
    if (on('est.no-rate')) { const seen = new Set(); m.nodes.forEach(n => (n.effort || []).forEach(e => { if (efInfo(e.role).rate == null && !seen.has(e.role)) { seen.add(e.role); out.push({ id: `estimation:norate:${e.role}`, source: 'estimation', rule: 'est.no-rate', severity: sev('est.no-rate'), target: { kind: 'node', id: n.id }, title: T('est.f.rate.t', { r: e.role }), fix: T('est.f.rate.fix') }); } })); }
    return out;
  });
  const phaseHelpers = { monthly: m => monthlyTotal(m.nodes), hasCost: m => m.nodes.some(hasCost), findings: m => findingsOf(m).filter(f => !f.dismissed), storage: ds => storageEstimate(ds, { prices: dsPrices() }) };
  const phaseCostText = (r, k = 'cost') => (r[k] == null ? '—' : k === 'cost' ? money(round2(r.cost)) : r.dCost === 0 ? money(0) : `${r.dCost > 0 ? '+' : '−'}${money(round2(Math.abs(r.dCost)))}`);

  /* ---------- informe de estado: qué cambió desde una referencia (D6: por defecto, la última versión guardada) ---------- */
  // statusBase(m, spec, h) elige la referencia y statusModel(m, base, h) devuelve DATOS (no texto): componentes, conexiones, fases, decisiones, riesgos, costo, esfuerzo, firmas, comentarios y versiones.
  // statusText(d, T, f) los redacta con las plantillas de i18n (stat.*): misma entrada, mismo texto, sin IA ni servicio externo. Las versiones solo guardan el diagrama (no decisiones, comentarios ni firmas):
  // lo que pasó con ellas se mide por sus fechas (estrictamente después del día de la referencia) y el resto, contra la foto.
  // h = { verLabel, prepared, diff, findings, monthly, effort, pending }  (cada uno viene de la app; el bloque no toca nada más)
  /* statusModel:start */
  const ST_SNAP = ['title', 'direction', 'routing', 'layerNames', 'radar', 'phases', 'datasets', 'edgeTypes', 'dismissed', 'groups', 'nodes', 'edges', 'notes', 'zones'];
  const ST_SEV = ['critical', 'high', 'medium', 'low'], ST_MAX = 50;
  const stDay = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : '');
  // spec = { kind: 'last' } | { kind: 'version', id } | { kind: 'date', day }. Con fecha, el diagrama se compara con la última versión guardada hasta ese día (sin versiones, solo cuentan las fechas).
  function statusBase(m, spec, h) {
    const vs = (m.versions || []).filter(v => v && v.diagram), s = spec || { kind: 'last' };
    const lastOf = list => list.reduce((a, v) => (!a || (stDay(v.updated) || stDay(v.created)) >= (stDay(a.updated) || stDay(a.created)) ? v : a), null);
    const mk = v => ({ id: v.id, day: stDay(v.updated) || stDay(v.created), label: h.verLabel(v), model: h.prepared(v) });
    if (s.kind === 'version') { const v = vs.find(x => x.id === s.id); return v ? mk(v) : null; }
    if (s.kind === 'date') {
      const day = stDay(s.day);
      if (!day) return null;
      const v = lastOf(vs.filter(x => (stDay(x.updated) || stDay(x.created)) <= day));
      return v ? { ...mk(v), day, snapDay: stDay(v.updated) || stDay(v.created) } : { id: '', day, label: '', model: null };
    }
    const v = lastOf(vs);
    return v ? mk(v) : null;
  }
  function statusModel(m, base, h) {
    if (!base || !base.day) return { empty: true };
    const day = base.day, out = { baseDay: day, baseLabel: base.label || '', snapshot: !!base.model };
    const cap = a => a.slice(0, ST_MAX), id = x => ({ id: x.id, label: x.label || x.id });
    const dated = (list, key) => (list || []).filter(x => stDay(x[key]) > day);
    if (base.model) {
      const bm = { ...m, ...Object.fromEntries(ST_SNAP.map(k => [k, base.model[k]])), groups: base.model.groups || [], nodes: base.model.nodes || [], edges: base.model.edges || [], notes: base.model.notes || [], zones: base.model.zones || [] };
      const d = h.diff(bm, m), was = new Map(bm.nodes.map(n => [n.id, n])), pn = (mm, pid) => (pid ? (mm.phases || []).find(p => p.id === pid)?.name || pid : '');
      out.components = { added: cap(d.nodes.added.map(id)), removed: cap(d.nodes.removed.map(id)), changed: cap(d.nodes.changed.map(c => ({ ...id(c.item), fields: c.fields }))) };
      out.connections = { added: d.edges.added.length, removed: d.edges.removed.length, changed: d.edges.changed.length };
      const bp = new Map((bm.phases || []).map(p => [p.id, p])), cp = new Map((m.phases || []).map(p => [p.id, p]));
      out.phases = {
        added: cap([...cp.values()].filter(p => !bp.has(p.id)).map(p => ({ id: p.id, name: p.name }))), removed: cap([...bp.values()].filter(p => !cp.has(p.id)).map(p => ({ id: p.id, name: p.name }))),
        moved: cap([...cp.values()].filter(p => bp.has(p.id) && (bp.get(p.id).date || '') !== (p.date || '')).map(p => ({ id: p.id, name: p.name, from: bp.get(p.id).date || '', to: p.date || '' }))),
        components: cap(d.nodes.changed.filter(c => c.fields.includes('phase')).map(c => ({ ...id(c.item), from: pn(bm, was.get(c.item.id)?.phase), to: pn(m, c.item.phase) })))
      };
      const c0 = h.monthly(bm), c1 = h.monthly(m);
      out.cost = c0 || c1 ? { from: c0, to: c1, delta: Math.round((c1 - c0) * 100) / 100 } : null;
      const e0 = h.effort(bm), e1 = h.effort(m);
      out.effort = e0 || e1 ? { days: [e0 ? e0.totals.days : 0, e1 ? e1.totals.days : 0], total: [e0 ? e0.totals.total : 0, e1 ? e1.totals.total : 0] } : null;
      const f0 = new Map(h.findings(bm).map(f => [f.id, f])), f1 = new Map(h.findings(m).map(f => [f.id, f])), by = (a, b) => ST_SEV.indexOf(a.severity) - ST_SEV.indexOf(b.severity) || String(a.id).localeCompare(String(b.id));
      const fx = f => ({ id: f.id, title: f.title, severity: f.severity });
      out.risks = { added: cap([...f1.values()].filter(f => !f0.has(f.id)).sort(by).map(fx)), resolved: cap([...f0.values()].filter(f => !f1.has(f.id)).sort(by).map(fx)) };
    }
    const last = d => { const hist = d.history?.length ? d.history : [{ status: d.status, date: d.date }]; return hist.filter(x => stDay(x.date) > day && (x.status === 'accepted' || x.status === 'rejected')).pop(); };
    const dx = (d, e) => ({ id: d.id, title: d.title || '', date: e ? e.date : d.date, ...(e?.by ? { by: e.by } : {}) });
    const ds = m.decisions || [];
    out.decisions = {
      accepted: cap(ds.filter(d => d.status === 'accepted' && last(d)?.status === 'accepted').map(d => dx(d, last(d)))),
      rejected: cap(ds.filter(d => d.status === 'rejected' && last(d)?.status === 'rejected').map(d => dx(d, last(d)))),
      proposed: cap(ds.filter(d => d.status === 'proposed').filter(d => { const hist = d.history?.length ? d.history : [{ date: d.date }]; return stDay(hist[0].date) > day; }).map(d => dx(d)))
    };
    out.pending = cap(h.pending(m));
    const cm = (m.comments || []).filter(c => !c.internal && c.status !== 'resolved');
    out.comments = { open: cm.length, added: cm.filter(c => stDay(c.date) > day).length };
    out.versions = cap(dated(m.versions, 'created').map(v => ({ label: h.verLabel(v), status: v.status || '' })));
    const n = (...l) => l.reduce((a, x) => a + x, 0);
    out.quiet = !n(out.components ? n(out.components.added.length, out.components.removed.length, out.components.changed.length, out.connections.added, out.connections.removed, out.connections.changed, out.phases.added.length, out.phases.removed.length, out.phases.moved.length, out.risks.added.length, out.risks.resolved.length) + (out.cost?.delta ? 1 : 0) + (out.effort && (out.effort.days[0] !== out.effort.days[1] || out.effort.total[0] !== out.effort.total[1]) ? 1 : 0) : 0,
      out.decisions.accepted.length, out.decisions.rejected.length, out.decisions.proposed.length, out.pending.length, out.comments.added, out.versions.length);
    return out;
  }
  // Redacción: secciones { k, title, lines: [texto] } y una frase de apertura. T(clave, valores) = plantillas de i18n; f = { money, day, phaseDate } (formatos del idioma).
  // Las listas llevan hasta 6 nombres y «y N más»; los plurales y la conjunción salen de las plantillas.
  function statusText(d, T, f) {
    if (d.empty) return { intro: T('stat.empty'), sections: [], quiet: true };
    const list = (names, max = 6) => { const a = names.filter(Boolean), shown = a.slice(0, max), rest = a.length - shown.length; return rest > 0 ? `${shown.join(', ')} ${T('stat.more', rest)}` : shown.length > 1 ? `${shown.slice(0, -1).join(', ')} ${T('stat.and')} ${shown[shown.length - 1]}` : shown[0] || ''; };
    const intro = d.baseLabel ? T('stat.intro.v', { label: d.baseLabel, day: f.day(d.baseDay) }) : T('stat.intro.d', { day: f.day(d.baseDay) }), secs = [], add = (k, lines) => { const l = lines.filter(Boolean); if (l.length) secs.push({ k, title: T(`stat.s.${k}`), lines: l }); };
    const c = d.components, dc = d.decisions, r = d.risks, p = d.phases, sg = x => (x.severity === 'critical' || x.severity === 'high' ? `${x.title} (${T(`sev.${x.severity}`)})` : x.title);
    add('decisions', [dc.accepted.length && T('stat.dec.accepted', { n: dc.accepted.length, list: list(dc.accepted.map(x => `${x.id} ${x.title}`.trim())) }), dc.rejected.length && T('stat.dec.rejected', { n: dc.rejected.length, list: list(dc.rejected.map(x => `${x.id} ${x.title}`.trim())) }), dc.proposed.length && T('stat.dec.proposed', { n: dc.proposed.length, list: list(dc.proposed.map(x => `${x.id} ${x.title}`.trim())) })]);
    if (r) add('risks', [r.added.length && T('stat.risk.added', { n: r.added.length, list: list(r.added.map(sg)) }), r.resolved.length && T('stat.risk.resolved', { n: r.resolved.length, list: list(r.resolved.map(sg)) })]);
    if (p) add('phases', [...p.moved.map(x => T('stat.phase.moved', { name: x.name, from: x.from ? f.phaseDate(x.from) : '—', to: x.to ? f.phaseDate(x.to) : '—' })), p.added.length && T('stat.phase.added', { n: p.added.length, list: list(p.added.map(x => x.name)) }), p.removed.length && T('stat.phase.removed', { n: p.removed.length, list: list(p.removed.map(x => x.name)) }),
      ...p.components.slice(0, 6).map(x => T('stat.phase.comp', { name: x.label, from: x.from || T('stat.first'), to: x.to || T('stat.first') })), p.components.length > 6 && T('stat.phase.compMore', p.components.length - 6)]);
    if (c) add('components', [c.added.length && T('stat.comp.added', { n: c.added.length, list: list(c.added.map(x => x.label)) }), c.removed.length && T('stat.comp.removed', { n: c.removed.length, list: list(c.removed.map(x => x.label)) }), c.changed.length && T('stat.comp.changed', { n: c.changed.length, list: list(c.changed.map(x => x.label)) }),
      (d.connections.added || d.connections.removed || d.connections.changed) && T('stat.conn', d.connections)]);
    const ef = d.effort, ch = ef && (ef.days[0] !== ef.days[1] || ef.total[0] !== ef.total[1]), sgn = v => `${v > 0 ? '+' : '−'}${Math.abs(Math.round(v * 100) / 100)}`;
    add('money', [d.cost && d.cost.delta !== 0 && T('stat.cost', { from: f.money(d.cost.from), to: f.money(d.cost.to), delta: `${d.cost.delta > 0 ? '+' : '−'}${f.money(Math.abs(d.cost.delta))}` }), ch && ef.days[0] !== ef.days[1] && T('stat.effort', { from: ef.days[0], to: ef.days[1], delta: sgn(ef.days[1] - ef.days[0]) }),
      ch && ef.total[0] !== ef.total[1] && T('stat.build', { from: f.money(ef.total[0]), to: f.money(ef.total[1]) })]);
    add('pending', d.pending.map(x => T(x.kind === 'decision' ? 'stat.pend.decision' : 'stat.pend.version', { label: x.label, who: list(x.missing) })));
    add('comments', [(d.comments.open || d.comments.added) && T('stat.comments', d.comments)]);
    add('versions', d.versions.map(x => T('stat.version', { label: x.label, status: x.status ? T(`ver.st.${x.status}`) : '' })));
    return { intro, sections: secs, quiet: !!d.quiet, none: d.quiet ? T('stat.none') : '' };
  }
  // Salidas: el mismo texto en tres formas. statusDoc arma el documento que pintan reportMarkdown y reportHTML (como el informe del proyecto: mismo escapado, mismo idioma);
  // statusPlain es texto para pegar en un correo. keys = secciones elegidas (se respeta el orden fijo de statusText); o = { title, lang, date }.
  const statusPick = (t, keys) => t.sections.filter(x => !keys || keys.includes(x.k));
  function statusDoc(t, keys, o) {
    return { title: o.title, lang: o.lang, date: o.date || '', sub: [t.intro, t.none].filter(Boolean).join(' '), files: [], sections: statusPick(t, keys).map(x => ({ id: x.k, title: x.title, blocks: [{ k: 'ul', items: x.lines }] })) };
  }
  function statusPlain(t, keys, o) {
    const out = [o.title, '', [t.intro, t.none].filter(Boolean).join(' ')];
    statusPick(t, keys).forEach(x => { out.push('', x.title, ...x.lines.map(l => `- ${l}`)); });
    return `${out.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
  }
  /* statusModel:end */

  // Lo que el informe de estado necesita de la app; las firmas pendientes se calculan sobre el diagrama actual
  const statusHelpers = {
    verLabel: v => verLabel(v), prepared: v => prepared(v), diff: (a, b) => diffModels(a, b), findings: mm => findingsOf(mm).filter(f => !f.dismissed), monthly: mm => monthlyTotal(mm.nodes), effort: mm => phaseEffort(mm, effortHelpers),
    pending: mm => [...(mm.decisions || []).filter(d => d.status === 'proposed').map(d => ({ kind: 'decision', id: d.id, label: `${d.id} ${d.title || ''}`.trim(), missing: apprMissing('decision', d, mm) })),
      ...(mm.versions || []).filter(v => v.status === 'review').map(v => ({ kind: 'version', id: v.id, label: verLabel(v), missing: apprMissing('version', v, mm) }))].filter(x => x.missing.length)
  };
  // Texto, Markdown o HTML del informe de estado; o = { kind, id, day, sections, format: 'text' | 'md' | 'html' } (la referencia como en statusReport)
  function statusOutput(o = {}, m = S.model) {
    const r = statusReport({ kind: o.kind, id: o.id, day: o.day }, m), keys = Array.isArray(o.sections) ? o.sections : null, head = { title: `${m.title} · ${T('stat.title')}`, lang: I.lang, date: today() };
    return o.format === 'md' ? reportMarkdown(statusDoc(r.text, keys, head)) : o.format === 'html' ? reportHTML(statusDoc(r.text, keys, head)) : statusPlain(r.text, keys, head);
  }
  const statusFormats = { money: v => money(round2(v)), day: v => fmtDay(v), phaseDate: v => fmtPhaseDate(v) };
  // spec: { kind: 'last' } (por defecto) | { kind: 'version', id } | { kind: 'date', day: 'AAAA-MM-DD' } → { data, text } con la redacción en el idioma activo
  function statusReport(spec, m = S.model) {
    const data = statusModel(m, statusBase(m, spec, statusHelpers), statusHelpers);
    return { data, text: statusText(data, T, statusFormats) };
  }

  /* ---------- conjuntos de datos (catálogo, contrato de datos, frescura de extremo a extremo): modelo ---------- */
  // m.datasets = [{ id: 'DS-001', name (CLAVE que une con edge.datasets, sin distinguir mayúsculas), domain?, layer?, description?, owner? ('SH-003' o texto), steward?, product?: true, classes?: ['pii'],
  //   format?, freshness?: '1h' (SLA), volume?: { perDay?: GB, retentionDays? }, schema?: [{ name, type, key?, pii?, nullable?: false, desc? }], quality?: [{ rule, column?, param?, severity? }],
  //   contract?: { version, status: 'draft'|'agreed'|'deprecated', consumers?: [ids de nodos], terms? }, phase?: id de fase }] (máx. 500)
  // Es del diagrama (entra en las fotos de versiones). En conexiones: latency = tiempo que tarda el dato en ese salto. Sin conjuntos ni latencias, el JSON y las exportaciones quedan idénticos.
  // El bloque solo usa lo que recibe en `h` (cleanCatalog: layer, classes, formats, rules, normDur · e2eFreshness y datasetIssues: lineageOf, parseDur, T…).
  /* datasetModel:start */
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
  /* datasetModel:end */
  // Lo que el bloque recibe de la app
  const dsPrices = () => C.datasets?.storagePrice || { default: 0.023 };
  const dsHelpers = () => ({ layer: cleanLayer, classes: Object.keys(DATA), formats: C.datasets?.formats, rules: C.datasets?.qualityRules, normDur, lineageOf, parseDur, prices: dsPrices(), T: (k, v) => T(k, v), fmtDur: s => fmtDur(s),
    sensitive: k => !!DATA[k]?.sensitive, short: k => loc(DATA[k]?.short) || String(k).toUpperCase(), nodeName: id => S.model.nodes.find(n => n.id === id)?.label || id,
    edgeName: e => { const nm = id => S.model.nodes.find(n => n.id === id)?.label || id; return `${nm(e.from)} ${e.both ? '↔' : '→'} ${nm(e.to)}`; } });
  const e2eOf = (name, m = S.model) => e2eFreshness(m, name, dsHelpers());
  const dsById = (id, m = S.model) => (m.datasets || []).find(d => d.id === id);
  const dsFind = (v, m = S.model) => dsById(v, m) || (m.datasets || []).find(d => dsK(d.name) === dsK(v));
  // Hallazgos (fuente «data»): sin documentar, producto sin dueño o contrato, frescura que no cumple el SLA, columnas PII sin clase, clase sensible sin cifrar, consumidores fuera del linaje, sin reglas de calidad
  addFindingSource('data', m => ((m.datasets || []).length ? datasetIssues(m, dsHelpers()) : []));

  /* ---------- disponibilidad (SLA), RPO/RTO, réplicas y puntos únicos de fallo ---------- */
  const RSL = { entryTypes: ['user', 'web', 'mobile', 'external', 'client'], dataStoreTypes: ['db', 'nosql', 'storage'], dataStoreIconCategories: ['Bases de datos', 'Almacenamiento'],
    spofSeverity: 'high', singleStoreSeverity: 'medium', defaultTarget: 99.9, ...C.resilience };
  const DUR_UNITS = { s: 1, sec: 1, seg: 1, m: 60, min: 60, h: 3600, hr: 3600, hora: 3600, horas: 3600, hour: 3600, hours: 3600, d: 86400, dia: 86400, dias: 86400, day: 86400, days: 86400 };
  // Duración «15m», «4 h», «1d», «0» → segundos (o null si no es válida)
  const parseDur = v => {
    if (typeof v === 'number') return Number.isFinite(v) && v === 0 ? 0 : null;
    const mt = String(v ?? '').trim().toLowerCase().match(/^(\d+(?:[.,]\d+)?)\s*([a-záéíóú]*)$/);
    if (!mt) return null;
    const num = +mt[1].replace(',', '.');
    if (!mt[2]) return num === 0 ? 0 : null;
    const u = DUR_UNITS[fold(mt[2])];
    return u ? num * u : null;
  };
  // Texto normalizado para guardar: «15m», «4h», «1d», «30s», «0»
  const normDur = v => {
    const s = parseDur(v);
    if (s == null) return null;
    if (s === 0) return '0';
    const [u, k] = s % 86400 === 0 ? ['d', 86400] : s % 3600 === 0 ? ['h', 3600] : s % 60 === 0 ? ['m', 60] : ['s', 1];
    return `${+(s / k).toFixed(3)}${u}`;
  };
  const numFmt = (v, d = 2) => new Intl.NumberFormat(I.lang, { maximumFractionDigits: d }).format(v);
  // 900 → «15 min», 14400 → «4 h», 86400 → «1 d»
  const fmtDur = s => {
    if (s == null || !Number.isFinite(s)) return '';
    if (s === 0) return '0';
    const [k, u] = s >= 86400 ? [86400, 'd'] : s >= 3600 ? [3600, 'h'] : s >= 60 ? [60, 'min'] : [1, 's'];
    return `${numFmt(s / k, 1)} ${T(`res.u.${u}`)}`;
  };
  const cleanSla = v => {
    const x = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v.replace(/%/g, '').replace(',', '.').trim()) : NaN;
    return Number.isFinite(x) && x > 0 && x <= 100 ? +x.toFixed(6) : null;
  };
  const cleanReplicas = v => { const x = Math.round(+v); return v != null && v !== '' && Number.isFinite(+v) && x >= 2 ? x : null; };
  const hasSla = n => cleanSla(n.sla) != null;
  const replicasOf = n => cleanReplicas(n.replicas) || 1;
  const hasRes = n => hasSla(n) || n.rpo != null || n.rto != null || cleanReplicas(n.replicas) != null;
  // Disponibilidad efectiva (fracción 0–1) con réplicas en paralelo; null sin SLA
  const availOf = n => (hasSla(n) ? 1 - Math.pow(1 - cleanSla(n.sla) / 100, replicasOf(n)) : null);
  // Decimales según los nueves que importan: 99.27% · 99.99% · 99.9999% (sin ruido de cifras)
  const fmtPct = a => { const d = a >= 1 ? 2 : clamp(Math.ceil(-Math.log10(1 - a)) - 1, 2, 6); return `${numFmt(+(a * 100).toFixed(d), d)}%`; };
  // Tiempo aproximado: «4.4 h», «22 min», «32 s»
  const fmtApprox = s => {
    if (s < 1) return `<1 ${T('res.u.s')}`;
    const [k, u] = s >= 86400 ? [86400, 'd'] : s >= 3600 ? [3600, 'h'] : s >= 60 ? [60, 'min'] : [1, 's'], v = s / k;
    return `${numFmt(v, v < 10 ? 1 : 0)} ${T(`res.u.${u}`)}`;
  };
  // Parada esperada por año y por mes a partir de una disponibilidad (fracción)
  const downtime = a => {
    const year = Math.max(0, 1 - a) * 31557600, month = year / 12;
    return { year, month, text: `≈ ${fmtApprox(year)}${T('res.perYear')} · ${fmtApprox(month)}${T('res.perMonth')}` };
  };
  const resTip = n => {
    if (!hasRes(n)) return '';
    const a = availOf(n), r = replicasOf(n);
    return [a != null ? `${T('res.title')}: ${numFmt(cleanSla(n.sla), 6)}%${r > 1 ? ` ×${r} → ${fmtPct(a)}` : ''}` : '', n.rpo != null ? `RPO ${fmtDur(parseDur(n.rpo))}` : '', n.rto != null ? `RTO ${fmtDur(parseDur(n.rto))}` : ''].filter(Boolean).join(' · ');
  };
  // Texto de la pastilla bajo el nodo: «99.95% · RPO 15 min · RTO 1 h · ×2»
  const resChip = n => [hasSla(n) ? `${numFmt(cleanSla(n.sla), 6)}%` : '', n.rpo != null ? `RPO ${fmtDur(parseDur(n.rpo))}` : '', n.rto != null ? `RTO ${fmtDur(parseDur(n.rto))}` : '', cleanReplicas(n.replicas) ? `×${n.replicas}` : ''].filter(Boolean).join(' · ');
  const isEntryNode = (n, m) => RSL.entryTypes.includes(n.type) || !m.edges.some(e => e.from !== e.to && (e.to === n.id || (e.both && e.from === n.id)));
  const isResStore = n => RSL.dataStoreTypes.includes(n.type) || RSL.dataStoreIconCategories.includes(iconInfo(n.icon)?.category);
  // Puntos únicos de fallo: puntos de articulación (Tarjan) del grafo sin dirección que separan una entrada del resto y no tienen réplicas
  function spofList(m = S.model) {
    const ids = m.nodes.map(n => n.id), byId = new Map(m.nodes.map(n => [n.id, n])), adj = new Map(ids.map(id => [id, new Set()]));
    m.edges.forEach(e => { if (e.from !== e.to && adj.has(e.from) && adj.has(e.to)) { adj.get(e.from).add(e.to); adj.get(e.to).add(e.from); } });
    const disc = new Map(), low = new Map(), art = new Set();
    let t = 0;
    const dfs = (u, parent) => { // recursivo: los diagramas son pequeños
      disc.set(u, ++t); low.set(u, t);
      let kids = 0;
      adj.get(u).forEach(v => {
        if (!disc.has(v)) {
          kids++; dfs(v, u);
          low.set(u, Math.min(low.get(u), low.get(v)));
          if (parent != null && low.get(v) >= disc.get(u)) art.add(u);
        } else if (v !== parent) low.set(u, Math.min(low.get(u), disc.get(v)));
      });
      if (parent == null && kids > 1) art.add(u);
    };
    ids.forEach(id => { if (!disc.has(id)) dfs(id, null); });
    const entries = new Set(m.nodes.filter(n => isEntryNode(n, m) && adj.get(n.id).size).map(n => n.id));
    const out = [];
    art.forEach(id => {
      const n = byId.get(id);
      if (replicasOf(n) > 1 || isEntryNode(n, m)) return;
      // Componentes que quedan al quitarlo
      const comp = new Map(), comps = [];
      ids.forEach(s => {
        if (s === id || comp.has(s)) return;
        const c = [s]; comp.set(s, comps.length);
        for (let i = 0; i < c.length; i++) adj.get(c[i]).forEach(v => { if (v !== id && !comp.has(v)) { comp.set(v, comps.length); c.push(v); } });
        comps.push(c);
      });
      const ent = comps.length > 1 && [...entries].find(e => e !== id && comp.has(e));
      if (!ent) return;
      const cut = ids.filter(x => x !== id && comp.get(x) !== comp.get(ent)).length;
      out.push({ id, label: n.label, reason: T('res.spof.reason', { entry: byId.get(ent).label, n: cut }) });
    });
    return out.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  }
  // Disponibilidad compuesta entre a y b: probabilidad de que funcione AL MENOS UNA ruta (los nodos fallan de forma independiente; las aristas no fallan)
  // Fiabilidad exacta de dos terminales por nodos (factorización: se fija un nodo del camino como activo/caído y se memoiza). Con grafos muy enmallados (presupuesto de llamadas agotado)
  // cae a una cota inferior: rutas disjuntas en nodos, de más a menos probable. n nodos 0..n-1, succ[i] = sucesores, s origen, t destino, p[i] = disponibilidad (1 = sin dato)
  /* routeReliability:start */
  function routeReliability(n, succ, s, t, p, budget = 8000) {
    const out = succ.map((l, i) => (i === t ? [] : l.filter(j => j !== s && j !== i))), inn = out.map(() => []);
    out.forEach((l, i) => l.forEach(j => inn[j].push(i)));
    const reach = (from, adj) => { const seen = new Set([from]), q = [from]; for (let i = 0; i < q.length; i++) adj[q[i]].forEach(v => { if (!seen.has(v)) { seen.add(v); q.push(v); } }); return seen; };
    const F0 = reach(s, out), B0 = reach(t, inn);
    if (!F0.has(t)) return null;
    // Poda: solo los nodos que están en algún camino de s a t
    const rel = []; for (let i = 0; i < n; i++) if (F0.has(i) && B0.has(i)) rel.push(i);
    const isRel = new Set(rel), g = out.map((l, i) => (isRel.has(i) ? l.filter(j => isRel.has(j)) : [])), gi = g.map(() => []);
    g.forEach((l, i) => l.forEach(j => gi[j].push(i)));
    const w = i => (p[i] >= 1 ? 0 : -Math.log(Math.max(p[i], 1e-300))) + 1e-9;
    // Ruta más probable (Dijkstra con pesos −ln p) evitando los nodos bloqueados
    const best = blocked => {
      const d = new Map([[s, 0]]), prev = new Map(), done = new Set();
      for (;;) {
        let u = -1; d.forEach((v, k) => { if (!done.has(k) && (u < 0 || v < d.get(u))) u = k; });
        if (u < 0) return null;
        if (u === t) { const r = []; for (let x = t; x != null; x = prev.get(x)) r.unshift(x); return r; }
        done.add(u);
        g[u].forEach(v => { if (blocked && blocked.has(v)) return; const nd = d.get(u) + w(v); if (!d.has(v) || nd < d.get(v)) { d.set(v, nd); prev.set(v, u); } });
      }
    };
    const main = best(null), pos = new Map(main.map((x, i) => [x, i]));
    // ¿Una sola ruta? Solo el camino principal y ningún atajo hacia delante
    const single = rel.length === main.length && main.every((u, i) => g[u].every(v => pos.get(v) <= i + 1));
    // Nº de rutas simples (acotado)
    let steps = 0, routes = 0; const onp = new Set([s]);
    const cnt = u => { if (routes >= 100 || ++steps > 20000) return; if (u === t) { routes++; return; } g[u].forEach(v => { if (!onp.has(v)) { onp.add(v); cnt(v); onp.delete(v); } }); };
    cnt(s);
    const ends = p[s] * p[t], base = { routes: single ? 1 : Math.max(routes, 2), main, rel, single };
    if (single) { let v = 1; main.forEach(i => { v *= p[i]; }); return { ...base, value: v, exact: true }; }
    // Exacto por factorización
    const st = new Uint8Array(n), memo = new Map(); let calls = 0;
    rel.forEach(i => { if (i === s || i === t || p[i] >= 1) st[i] = 1; });
    const rec = () => {
      if (++calls > budget) throw new Error('budget');
      const F = reach2(s, g), B = reach2(t, gi);
      if (!F.has(t)) return 0;
      const key = rel.map(i => (F.has(i) && B.has(i) ? st[i] : 9)).join('');
      if (memo.has(key)) return memo.get(key);
      // Camino con menos nodos inciertos (0-1 BFS) y pivote = primer nodo incierto
      const dist = new Map([[s, 0]]), prev = new Map(), dq = [s];
      while (dq.length) {
        const u = dq.shift();
        g[u].forEach(v => { if (st[v] === 2 || !B.has(v)) return; const c = st[v] === 1 ? 0 : 1, nd = dist.get(u) + c; if (!dist.has(v) || nd < dist.get(v)) { dist.set(v, nd); prev.set(v, u); c ? dq.push(v) : dq.unshift(v); } });
      }
      let piv = -1; for (let x = t; x != null; x = prev.get(x)) if (st[x] === 0) piv = x;
      let val;
      if (piv < 0) val = 1;
      else { st[piv] = 1; const a1 = rec(); st[piv] = 2; const a0 = rec(); st[piv] = 0; val = p[piv] * a1 + (1 - p[piv]) * a0; }
      memo.set(key, val);
      return val;
    };
    const reach2 = (from, adj) => { const seen = new Set([from]), q = [from]; for (let i = 0; i < q.length; i++) adj[q[i]].forEach(v => { if (st[v] !== 2 && !seen.has(v)) { seen.add(v); q.push(v); } }); return seen; };
    try { return { ...base, value: ends * rec(), exact: true }; } catch (e) { if (e.message !== 'budget') throw e; }
    // Aproximación: rutas disjuntas en nodos inciertos → cota inferior de la fiabilidad real
    const blocked = new Set(); let fail = 1;
    for (let k = 0; k < 64; k++) {
      const r = best(blocked); if (!r) break;
      const inner = r.filter(i => i !== s && i !== t), pr = inner.reduce((a, i) => a * p[i], 1);
      fail *= 1 - pr;
      const unc = inner.filter(i => p[i] < 1); if (!unc.length) break;
      unc.forEach(i => blocked.add(i));
    }
    return { ...base, value: ends * (1 - fail), exact: false };
  }
  /* routeReliability:end */
  // Disponibilidad compuesta de a a b: combina todas las rutas (res = caminos más cortos; sirve para a, el sentido y el resultado «sin ruta»)
  // worst = el componente con menor disponibilidad de la ruta más probable; rpo/rto = máximo a lo largo de esa ruta
  function pathAvailability(m, b, res) {
    if (!res || !res.nodes.size) return null;
    const a = [...res.nodes].find(id => res.dist.get(id) === 0), ids = m.nodes.map(n => n.id), ix = new Map(ids.map((id, i) => [id, i])), byId = new Map(m.nodes.map(n => [n.id, n]));
    const succ = ids.map(() => []);
    m.edges.forEach(e => {
      if (e.from === e.to || !ix.has(e.from) || !ix.has(e.to)) return;
      succ[ix.get(e.from)].push(ix.get(e.to));
      if (!res.directed || e.both) succ[ix.get(e.to)].push(ix.get(e.from));
    });
    const p = ids.map(id => availOf(byId.get(id)) ?? 1), rr = routeReliability(ids.length, succ, ix.get(a), ix.get(b), p);
    if (!rr) return null;
    const order = rr.main.map(i => ids[i]), ns = order.map(id => byId.get(id)), known = ns.filter(n => availOf(n) != null);
    const worst = known.reduce((w, n) => (!w || availOf(n) < availOf(w) ? n : w), null);
    const mx = k => { const v = ns.map(n => (n[k] != null ? parseDur(n[k]) : null)).filter(x => x != null); return v.length ? Math.max(...v) : null; };
    const rn = rr.rel.map(i => byId.get(ids[i])), anyKnown = rn.some(n => availOf(n) != null), av = anyKnown ? Math.min(1, Math.max(0, rr.value)) : null;
    return { availability: av, downtimeYear: av == null ? null : downtime(av).year, nodes: order, unknown: rn.filter(n => availOf(n) == null).length, routes: rr.routes,
      method: rr.single ? 'single' : rr.exact ? 'exact' : 'approx', approx: !rr.exact, worst: worst ? { id: worst.id, label: worst.label, availability: availOf(worst) } : null, rpo: mx('rpo'), rto: mx('rto') };
  }
  function availability(a, b) {
    const m = S.model;
    const res = shortestPaths(m, a, b, true) || shortestPaths(m, a, b, false);
    return pathAvailability(m, b, res);
  }
  // Fragmento HTML para la barra del camino
  function pathResText(b, res) {
    const r = pathAvailability(S.model, b, res);
    if (!r) return '';
    const parts = [];
    if (r.availability != null) {
      // Con rutas alternativas, el número de rutas combinadas va pegado a la disponibilidad compuesta (no confundir con las rutas más cortas del camino)
      const alt = r.method !== 'single' && r.routes > 1 ? ` ${T('res.path.routes', { n: r.routes >= 100 ? '100+' : r.routes, approx: r.approx })}` : '';
      parts.push(T('res.path.comp', { a: fmtPct(r.availability), d: fmtApprox(r.downtimeYear) }) + alt + (r.worst ? ` · ${T('res.path.worst', { n: esc(r.worst.label), a: fmtPct(r.worst.availability) })}` : ''));
      if (r.unknown) parts.push(T('res.path.unknown', r.unknown));
    }
    if (r.rpo != null) parts.push(`RPO ${esc(fmtDur(r.rpo))}`);
    if (r.rto != null) parts.push(`RTO ${esc(fmtDur(r.rto))}`);
    return parts.length ? ` · ${parts.join(' · ')}` : '';
  }
  // Peldaño de disponibilidad efectiva para colorear (vista Resiliencia)
  const RES_TIERS = [{ k: 't4', min: 0.9999, color: 'var(--p-menta)' }, { k: 't3', min: 0.999, color: 'var(--p-limon)' }, { k: 't2', min: 0.99, color: 'var(--p-melocoton)' }, { k: 't1', min: 0, color: 'var(--p-coral)' }];
  const resTier = n => { const a = availOf(n); return a == null ? null : RES_TIERS.find(t => a >= t.min - 1e-12); };
  addFindingSource('sla', m => {
    // Solo si el diagrama ya usa datos de disponibilidad: sin ellos los servicios gestionados (CDN, colas, Lambda…) saldrían como falsos puntos únicos
    if (!m.nodes.some(n => n.sla != null || n.replicas != null || n.rpo != null || n.rto != null)) return [];
    const out = [], sp = spofList(m), spIds = new Set(sp.map(x => x.id)), sev = (k, d) => (SEVERITY.includes(RSL[k]) ? RSL[k] : d);
    const usesRto = m.nodes.some(n => n.rpo != null || n.rto != null);
    sp.forEach(x => out.push({ id: `sla:spof:node:${x.id}`, source: 'sla', rule: 'spof', severity: sev('spofSeverity', 'high'), target: { kind: 'node', id: x.id }, title: T('res.f.spof.t', x.label), detail: x.reason, fix: T('res.f.spof.fix') }));
    m.nodes.forEach(n => {
      if (!isResStore(n) || isBackupNode(n)) return;
      if (!spIds.has(n.id) && replicasOf(n) <= 1 && !(hasSla(n) && cleanSla(n.sla) >= RSL.defaultTarget))
        out.push({ id: `sla:single-store:node:${n.id}`, source: 'sla', rule: 'single-store', severity: sev('singleStoreSeverity', 'medium'), target: { kind: 'node', id: n.id }, title: T('res.f.store.t', n.label), fix: T('res.f.store.fix') });
      if (usesRto && (n.rpo == null || n.rto == null))
        out.push({ id: `sla:rpo-rto:node:${n.id}`, source: 'sla', rule: 'rpo-rto', severity: 'low', target: { kind: 'node', id: n.id }, title: T('res.f.rto.t', n.label), fix: T('res.f.rto.fix') });
    });
    return out;
  });

  function uniqueId(prefix) {
    const used = new Set([...S.model.nodes, ...S.model.edges, ...S.model.groups, ...S.model.notes, ...S.model.zones].map(x => x.id));
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

  /* ---------- rangos de flujo (reproducir y presentar): las conexiones bidireccionales se siguen en los dos sentidos ---------- */
  // Igual que computeRanks, pero un extremo "from" que solo se alcanza por la vuelta de una conexión "both" pasa a quedar
  // después de su "to" (que recibe de otros). Sin conexiones "both" devuelve exactamente computeRanks.
  function flowRanks(m) {
    const rank = computeRanks(m), bo = m.edges.filter(e => e.both && e.from !== e.to);
    if (!bo.length) return rank;
    const es = m.edges.filter(e => e.from !== e.to);
    const desc = id => { const seen = new Set([id]), q = [id]; while (q.length) { const u = q.pop(); es.forEach(e => { if (e.from === u && !seen.has(e.to)) { seen.add(e.to); q.push(e.to); } }); } return seen; };
    bo.forEach(e => {
      const f = e.from, t = e.to;
      if (es.some(x => x.to === f)) return;                                   // "from" ya recibe de otro: su rango es el normal
      const down = desc(f);
      if (!es.some(x => x.to === t && x.from !== f && !down.has(x.from))) return; // "to" solo recibe de "from": no hay vuelta que seguir
      if (rank.get(f) > rank.get(t)) return;
      rank.set(f, rank.get(t) + 1);
      // Lo que cuelga de "from" se retrasa con él (sin tocar los arcos hacia "to": no hay ciclos)
      const cap = (m.nodes.length + 1) * (es.length + 1);
      for (let n = 0, ch = true; ch && n < cap; n++) {
        ch = false;
        es.forEach(x => { if (x.to !== t && down.has(x.from) && x.from !== x.to && rank.get(x.to) < rank.get(x.from) + 1 && down.has(x.to)) { rank.set(x.to, rank.get(x.from) + 1); ch = true; } });
      }
    });
    return rank;
  }
  // ¿La conexión se ilumina en el paso r? Una "both" que llega por su "to" antes que por su "from" se recorre al revés
  const flowPulse = (e, ranks, r) => {
    const a = ranks.get(e.from), b = ranks.get(e.to);
    return e.both && b < a ? b === r : a === r;
  };

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
    viewPrep();
    drawItems();
    [...m.groups].sort((a, b) => groupDepth(a) - groupDepth(b)).forEach(g => buildGroup(g, animate));
    const base = m.nodes.length * C.animation.enterStagger * 0.6;
    m.edges.forEach((e, i) => buildEdge(e, animate ? base + i * 30 : -1));
    m.nodes.forEach((n, i) => buildNode(n, animate ? i * C.animation.enterStagger : -1));
    refreshFindings(true);
    applyViewMode();
    updateGeometry();
    applyCompare();
    applyFilter();
    applyHighlight();
    updateMeta();
  }

  // Etiqueta de color con el texto corto de una clasificación (PII, PCI…)
  function dataTag(parent, x, y, t, h, cls = '') {
    const w = Math.ceil(textW(t.short, FONT.dtag)) + 12;
    const g = el('g', { class: `data-tag${cls ? ' ' + cls : ''}`, style: `--tc:${t.color}` }, parent);
    el('rect', { x, y, width: w, height: h, rx: h / 2 }, g);
    el('text', { x: x + w / 2, y: y + h / 2 + 3.4, 'text-anchor': 'middle' }, g).textContent = t.short;
    return w;
  }
  // Etiqueta «ADR n» (lavanda) de las decisiones propuestas o aceptadas que enlazan el nodo; el tooltip las lista
  const adrTags = n => {
    const ds = decisionsOf('nodes', n.id).filter(d => d.status === 'proposed' || d.status === 'accepted');
    return ds.length ? [{ short: `ADR ${ds.length}`, label: ds.map(d => `${d.id} · ${d.title || d.id} (${T(`adr.st.${d.status}`)})`).join('\n'), color: 'var(--p-lavanda)', cls: 'dt-adr' }] : [];
  };
  // Etiqueta del radar tecnológico: solo cuando pide atención (en pausa, en retirada, o soporte terminado o por terminar); el tooltip lleva el detalle
  const radarTip = i => [`${T('radar.label')}: ${i.name} · ${i.ring.label}`, i.eosDay ? T(i.status === 'ended' ? 'radar.eos.ended' : 'radar.eos.on', fmtDay(i.eosDay)) : '', i.replaceWith ? T('radar.replace', i.replaceWith) : '', i.note].filter(Boolean).join('\n');
  const radarTags = n => {
    const i = radarInfo(n, S.model, today());
    if (!i) return [];
    const ended = i.status === 'ended', ringTag = i.entry.ring === 'retire' || i.entry.ring === 'hold';
    if (!ended && !ringTag && i.status !== 'soon') return [];
    return [{ short: ended || (i.status === 'soon' && i.entry.ring !== 'retire') ? T('radar.eol') : i.ring.short, label: radarTip(i), color: ended ? 'var(--p-coral)' : i.entry.ring === 'retire' ? i.ring.color : i.status === 'soon' ? 'var(--p-limon)' : i.ring.color, cls: 'dt-radar' }];
  };
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
    const r = { g: root, box, tag, tw: 0 };
    drawTag(g, r);
    R.groups.set(g.id, r);
  }
  // Etiqueta del grupo: icono opcional (16 px) a la izquierda; la vista Costo añade el total mensual
  function drawTag(g, r) {
    r.tag.textContent = '';
    const info = iconInfo(g.icon), ix = info ? 18 : 0, total = VW.gcost?.get(g.id);
    const label = total ? `${g.label} · ${money(round2(total))}${T('cost.mo')}` : g.label;
    // El CSS añade .04em de espaciado entre letras
    r.tw = Math.ceil(textW(label, FONT.tag) + String(label).length * 0.44 + 22 + ix);
    // Capa propia del grupo: borde de color y etiqueta junto al nombre (solo si la vista muestra capas)
    const li = DL[g.layer] && vc().layers ? layerInfo(g.layer) : null, tx = r.tw - 6;
    r.g.classList.toggle('has-layer', !!li);
    if (li) { r.g.style.setProperty('--lc', li.color); r.tw += layerPillW(li) + 2; } else r.g.style.removeProperty('--lc');
    el('rect', { width: r.tw, height: 22, rx: 7 }, r.tag);
    if (info) el('image', { href: info.src, x: 6, y: 3, width: 16, height: 16 }, r.tag);
    el('text', { x: 10 + ix, y: 15 }, r.tag).textContent = label;
    if (li) layerPill(r.tag, tx, 3, li, 16);
  }

  // Nombres de las capas para todo el documento: 'medallion' (Bronce/Plata/Oro) o 'zones' (Crudo/Curado/Consumo)
  function setLayerNames(v) {
    v = v === 'zones' ? 'zones' : 'medallion';
    if (v === layerNaming()) return;
    pushHistory();
    if (v === 'zones') S.model.layerNames = 'zones'; else delete S.model.layerNames;
    changed(true);
    renderInspector();
  }
  /* ---------- notas adhesivas y zonas de riesgo ---------- */
  const sevLabel = k => T(`sev.${k}`);
  const itemSel = () => (S.sel?.kind === 'note' || S.sel?.kind === 'zone' ? S.sel : null);
  const handle = (parent, w, h) => {
    const g = el('g', { class: 'resize-handle', transform: `translate(${w - 13} ${h - 13})` }, parent);
    el('rect', { width: 14, height: 14, rx: 4 }, g);
    el('path', { d: 'M5 11 11 5M8 11l3-3' }, g);
  };
  // Parte el texto en líneas que caben en `max`, respeta los saltos y recorta con «…» si no hay alto
  function wrapLines(t, f, max, maxLines) {
    const out = [];
    String(t ?? '').split('\n').forEach(par => {
      let line = '';
      par.split(/\s+/).filter(Boolean).forEach(w => {
        while (textW(w, f) > max) { // palabra más larga que la línea: se corta por letras
          let i = w.length - 1;
          while (i > 1 && textW(w.slice(0, i), f) > max) i--;
          if (line) { out.push(line); line = ''; }
          out.push(w.slice(0, i)); w = w.slice(i);
        }
        const next = line ? `${line} ${w}` : w;
        if (line && textW(next, f) > max) { out.push(line); line = w; } else line = next;
      });
      out.push(line);
    });
    if (out.length <= maxLines) return out;
    const cut = out.slice(0, maxLines);
    cut[maxLines - 1] = fitText(cut[maxLines - 1] + '…', f, max);
    return cut;
  }
  function buildZone(z) {
    const trust = z.kind === 'trust', sev = SEVERITY.includes(z.severity) ? z.severity : 'medium', zc = trust ? 'zone-trust' : `zone-${sev}`;
    const g = el('g', { class: `zone ${zc}`, 'data-id': z.id }, L.zones);
    el('rect', { class: 'zone-tint', width: z.w, height: z.h, rx: 14 }, g);
    if (!trust) el('rect', { class: 'zone-hatch', width: z.w, height: z.h, rx: 14, fill: `url(#hatch-${sev})` }, g);
    el('rect', { class: 'zone-line', width: z.w, height: z.h, rx: 14 }, g);
    el('rect', { class: 'zone-hit', width: z.w, height: z.h, rx: 14 }, g);
    // Etiqueta, contorno de selección y tirador van en otra capa, por encima de nodos y aristas:
    // si un diagrama tapa la zona, sigue pudiéndose agarrar. El relleno y el borde se quedan debajo.
    const top = el('g', { class: `zone zone-over ${zc}`, 'data-id': z.id }, L.zoneTop);
    el('rect', { class: 'zone-line zone-top-line', width: z.w, height: z.h, rx: 14 }, top);
    // Etiqueta abajo a la izquierda: arriba suele estar la del grupo que la zona rodea
    const tag = el('g', { class: 'zone-tag', transform: `translate(10 ${z.h - 32})` }, top);
    // El CSS añade .04em de espaciado entre letras (11px → 0,44px por carácter)
    const tagW = t => textW(t, FONT.tag) + String(t).length * 0.44;
    // Frontera de confianza: escudo con candado en vez de ⚠ y el nombre de la zona (o su nivel de confianza)
    const gl = trust ? 18 : 0, head = trust ? T('trust.tag').toUpperCase() : `⚠ ${sevLabel(sev).toUpperCase()}`, nm = trust ? z.label || z.trust || '' : z.label;
    const label = fitText(nm ? ` · ${nm}` : '', FONT.tag, Math.max(20, z.w - 24 - tagW(head) - 22 - gl));
    const tw = Math.ceil(tagW(head + label) + 22 + gl);
    el('rect', { width: tw, height: 22, rx: 7 }, tag);
    if (trust) el('path', { class: 'trust-g', transform: 'translate(8 3) scale(.67)', d: 'M12 3 4.5 6v5.5c0 4.5 3.2 8 7.5 9.5 4.3-1.5 7.5-5 7.5-9.5V6zM9.5 12.5h5V16h-5zM10.5 12.5v-1.2a1.5 1.5 0 0 1 3 0v1.2' }, tag);
    const tx = el('text', { x: 10 + gl, y: 15 }, tag);
    el('tspan', { class: 'zone-sev' }, tx).textContent = head;
    tx.appendChild(document.createTextNode(label));
    const tip = [trust ? z.trust : '', z.desc].filter(Boolean).join('\n');
    if (tip) el('title', null, top).textContent = tip;
    handle(top, z.w, z.h);
    R.zones.set(z.id, { g, top, tag, tw });
  }
  function buildNote(n) {
    const g = el('g', { class: 'note', 'data-id': n.id }, L.notes);
    g.style.setProperty('--c', colorVar(n.color) || 'var(--p-limon)');
    const F = 16, d = `M0,0 H${n.w - F} L${n.w},${F} V${n.h} H0 Z`;
    el('path', { class: 'note-paper', d }, g);
    el('path', { class: 'note-tint', d }, g);
    el('path', { class: 'note-fold', d: `M${n.w - F},0 V${F} H${n.w} Z` }, g);
    wrapLines(n.text, FONT.note, n.w - 24, Math.max(1, Math.floor((n.h - 16) / 17))).forEach((l, i) => {
      el('text', { class: 'note-text', x: 12, y: 24 + i * 17 }, g).textContent = l;
    });
    handle(g, n.w, n.h);
    R.notes.set(n.id, { g });
  }
  // Redibuja las dos capas desde el modelo (al crear, borrar, redimensionar o editar el texto)
  function drawItems() {
    L.zones.textContent = ''; L.zoneTop.textContent = ''; L.notes.textContent = '';
    R.zones.clear(); R.notes.clear();
    S.model.zones.forEach(buildZone);
    S.model.notes.forEach(buildNote);
    updateItems();
    markItems();
  }
  function updateItems() {
    [[S.model.zones, R.zones], [S.model.notes, R.notes]].forEach(([list, map]) => list.forEach(o => {
      const r = map.get(o.id), t = `translate(${o.x} ${o.y})`;
      r?.g.setAttribute('transform', t);
      r?.top?.setAttribute('transform', t);
      const out = !inScope(o); // de otro nivel C4
      r?.g.classList.toggle('v-hide', out); r?.top?.classList.toggle('v-hide', out);
    }));
  }
  const markItems = () => {
    const s = itemSel();
    R.zones.forEach((r, id) => { const on = s?.kind === 'zone' && s.id === id; r.g.classList.toggle('sel', on); r.top.classList.toggle('sel', on); });
    R.notes.forEach((r, id) => r.g.classList.toggle('sel', s?.kind === 'note' && s.id === id));
  };

  function buildEdge(e, delay) {
    const st = edgeKey(e.style), cfg = edgeStyleOf(st), mu = edgeMult(e), wt = EDGE_W[e.weight] ? e.weight : '';
    const g = el('g', { class: `edge ${edgeCls(st)}${cfg.dash ? ' edge-dashed' : ''}${wt ? ` w-${wt}` : ''}${delay >= 0 ? ' enter' : ''}`, 'data-id': e.id }, L.edges);
    g.style.setProperty('--c', colorVar(e.color) || colorVar(cfg.color) || nodeColor(S.model.nodes.find(n => n.id === e.from)));
    g.style.setProperty('--w', `${+(cfg.width * mu).toFixed(2)}px`);
    if (delay >= 0) { g.style.animationDelay = `${delay}ms`; endEnter(g); }
    const hit = el('path', { class: 'edge-hit' }, g);
    const line = el('path', { class: 'edge-line' }, g);
    if (cfg.dash) {
      const dash = dashFor(cfg, mu);
      line.setAttribute('stroke-dasharray', dash);
      const dist = dash.split(' ').reduce((s, v) => s + (+v || 0), 0) * 4;
      g.style.setProperty('--dash-to', `${-dist}px`);
      g.style.setProperty('--dash-dur', `${(dist / (C.animation.particleSpeed * 0.5)).toFixed(2)}s`);
    }
    const arrow = el('path', { class: 'edge-arrow' }, g);
    // Con punta en ambos extremos las partículas van y vienen (al menos dos, alternando sentido); el peso suma partículas (solo si el tipo ya las tiene)
    const np = cfg.particles ? cfg.particles + (wt === 'critical' ? 2 : wt === 'high' ? 1 : 0) : 0, pr = (st === 'data' || st === 'stream' ? 2.4 : 3) + (wt === 'critical' ? 1 : wt === 'high' ? 0.5 : 0);
    const parts = Array.from({ length: np ? (e.both ? Math.max(2, np) : np) : 0 }, () => el('circle', { class: 'particle', r: pr, cx: -9999, cy: -9999 }, g));
    const byId = id => S.model.nodes.find(n => n.id === id);
    if (isInsecure(e, byId)) g.classList.add('insecure');
    const r = { g, e, hit, line, arrow, label: null, parts, len: 0, phase: Math.random(), xb: null, wpx: cfg.width * mu, ak: arrowK(mu), speed: wt === 'critical' ? 1.25 : wt === 'high' ? 1.12 : 1 };
    R.edges.set(e.id, r);
    const tip = [wt && T(`wt.tip.${wt}`), e.datasets?.length && T('lin.tip', { list: e.datasets.join(', ') })].filter(Boolean).join('\n');
    if (tip) el('title', null, g).textContent = tip;
    edgeLabel(r);
    edgeDatasets(r);
    xbMarker(r);
    strideMarker(r);
  }
  /* ---------- marcador de datos fuera de su jurisdicción (solo se ve en la vista Seguridad) ---------- */
  // Un globo en el punto medio (rojo) o un ✓ gris si la transferencia está autorizada; se reconstruye con la conexión
  function xbMarker(r) {
    const cb = crossBorder(r.e, id => S.model.nodes.find(n => n.id === id));
    if (!cb) return;
    const mk = el('g', { class: `edge-xb${cb.approved ? ' ok' : ''}` }, r.g);
    el('circle', { r: 10 }, mk);
    if (cb.approved) el('path', { class: 'xb-g', d: 'M-4.5 0.5 -1.5 3.5 4.5 -3' }, mk);
    else el('path', { class: 'xb-g', d: 'M0 -6a6 6 0 1 0 0 12a6 6 0 1 0 0 -12M-6 0h12M0 -6c-3.5 3.2 -3.5 8.8 0 12M0 -6c3.5 3.2 3.5 8.8 0 12' }, mk);
    r.xb = mk;
  }

  /* ---------- STRIDE: fronteras de confianza y amenazas sugeridas ---------- */
  // Frontera de confianza = zona con kind: 'trust'. Un nodo está dentro si su centro cae en el rectángulo de la zona (las zonas pueden anidarse o solaparse).
  // Una conexión cruza cuando los conjuntos de fronteras de sus dos extremos difieren. Reglas y umbrales: config.js › stride (comentario allí).
  // Decisiones: edge.threats = { S|T|R|I|D|E: { status: 'mitigated' | 'accepted' | 'na', note? } }; abierta = sin guardar.
  const STR = { inboundSeverity: 'high', criticalClasses: ['pii', 'pci', 'phi'], storeTypes: [], storeIconCategories: [], categories: {}, ...C.stride };
  const STRIDE_KEYS = 'STRIDE'.split('');
  const THREAT_ST = ['mitigated', 'accepted', 'na'];
  const cleanThreats = v => {
    if (!v || typeof v !== 'object') return null;
    const o = {};
    STRIDE_KEYS.forEach(k => {
      const x = v[k];
      if (!x || typeof x !== 'object' || !THREAT_ST.includes(x.status)) return;
      o[k] = { status: x.status };
      if (x.note != null && String(x.note).trim()) o[k].note = String(x.note);
    });
    return Object.keys(o).length ? o : null;
  };
  const trustName = z => z.label || z.trust || T('trust.unnamed');
  // Contexto barato (solo el modelo; el ancho del nodo sale de R.width): fronteras que contienen a cada nodo
  const strideCtx = (m = S.model) => {
    const zones = m.zones.filter(z => z.kind === 'trust'), byId = new Map(m.nodes.map(n => [n.id, n])), sets = new Map();
    if (zones.length) m.nodes.forEach(n => {
      const cx = n.x + (R.width.get(n.id) || nodeWidth(n)) / 2, cy = n.y + nodeBoxH(n) / 2;
      sets.set(n.id, zones.filter(z => cx >= z.x && cx <= z.x + z.w && cy >= z.y && cy <= z.y + z.h));
    });
    return { m, zones, byId, sets };
  };
  // { from, to, enters, leaves, zones, inbound } o null si la conexión no cruza ninguna frontera
  const crossInfo = (e, c) => {
    const a = c.sets.get(e.from), b = c.sets.get(e.to);
    if (!a || !b) return null;
    const enters = b.filter(z => !a.includes(z)), leaves = a.filter(z => !b.includes(z));
    return enters.length || leaves.length ? { from: a, to: b, enters, leaves, zones: [...leaves, ...enters], inbound: enters.length > 0 } : null;
  };
  const crossings = (e, c = strideCtx()) => crossInfo(e, c)?.zones || [];
  // Amenazas sugeridas de una conexión que cruza: [{ cat, severity, why, title, mitigation, status, note, zones, e, ... }]
  function strideFor(e, c, info = crossInfo(e, c)) {
    if (!info) return [];
    const A = c.byId.get(e.from), B = c.byId.get(e.to), cls = new Set([...(e.data || []), ...(A?.data || []), ...(B?.data || [])]);
    const sens = isSensitive(e) || isSensitive(A) || isSensitive(B), crit = [...cls].some(k => (STR.criticalClasses || []).includes(k));
    const inb = info.inbound, enc = e.encrypted, sync = edgeKey(e.style) === 'sync';
    const store = !!B && ((STR.storeTypes || []).includes(B.type) || (STR.storeIconCategories || []).includes(iconInfo(B.icon)?.category));
    const out = [], add = (cat, severity, why) => { if (STR.categories[cat]) out.push({ cat, severity, why }); };
    add('S', inb ? (SEVERITY.includes(STR.inboundSeverity) ? STR.inboundSeverity : 'high') : 'medium', inb ? 'S.in' : 'S.out');
    add('T', enc === false ? 'high' : enc == null ? 'medium' : 'low', enc === false ? 'T.no' : enc == null ? 'T.unset' : 'T.yes');
    add('R', sens ? 'medium' : 'low', sens ? 'R.sens' : 'R.plain');
    if (sens) add('I', enc === true ? 'low' : enc === false && crit ? 'critical' : 'high', enc === true ? 'I.enc' : enc === false && crit ? 'I.crit' : 'I.high');
    add('D', inb && sync ? 'medium' : 'low', inb && sync ? 'D.sync' : 'D.other');
    if (inb) add('E', store ? 'high' : 'medium', store ? 'E.store' : 'E.other');
    const from = A?.label ?? e.from, to = B?.label ?? e.to, names = info.zones.map(trustName).join(', ');
    return out.map(t => {
      const cat = STR.categories[t.cat], d = e.threats?.[t.cat];
      return { ...t, e, from, to, zones: info.zones, title: T('stride.title', { cat: loc(cat.label), from, to, zones: names }), why: T(`stride.why.${t.why}`),
        mitigation: loc(cat.mitigation), status: d?.status || 'open', note: d?.note || '' };
    });
  }
  const strideAll = (m = S.model) => { const c = strideCtx(m); return c.zones.length ? m.edges.flatMap(e => strideFor(e, c)) : []; };
  addFindingSource('stride', m => strideAll(m).filter(t => t.status === 'open').map(t => ({ id: `stride:${t.cat}:edge:${t.e.id}`, source: 'stride', rule: t.cat, severity: t.severity,
    target: { kind: 'edge', id: t.e.id }, title: t.title, detail: t.why, fix: t.mitigation })));
  // Guarda la decisión de una categoría (open = quitarla); las claves quedan en orden S T R I D E
  function setThreat(e, cat, status, note) {
    const th = { ...(e.threats || {}) };
    if (status === 'open') delete th[cat]; else th[cat] = { status, ...((note ?? th[cat]?.note) ? { note: note ?? th[cat].note } : {}) };
    const o = {};
    STRIDE_KEYS.forEach(k => { if (th[k]) o[k] = th[k]; });
    if (Object.keys(o).length) e.threats = o; else delete e.threats;
  }
  // Marcador «STRIDE n» (n = amenazas abiertas) al 70 % de la conexión; solo se ve en la vista Seguridad y en conexiones que cruzan
  function strideMarker(r) {
    const mk = el('g', { class: 'edge-stride off' }, r.g);
    el('rect', { y: -8, height: 16, rx: 8 }, mk);
    el('text', { 'text-anchor': 'middle', y: 3.8 }, mk);
    r.sm = mk;
  }
  function strideMarkUpdate(r, c) {
    const mk = r.sm, info = c && crossInfo(r.e, c);
    if (!mk) return;
    if (!info) { if (!mk.classList.contains('off')) mk.classList.add('off'); return; }
    const open = strideFor(r.e, c, info).filter(t => t.status === 'open'), worst = open.reduce((a, t) => Math.max(a, SEVERITY.indexOf(t.severity)), -1);
    const txt = open.length ? `STRIDE ${open.length}` : 'STRIDE ✓', tx = mk.lastChild;
    mk.setAttribute('class', `edge-stride sev-${worst < 0 ? 'ok' : SEVERITY[worst]}`);
    if (tx.textContent !== txt) {
      const w = Math.ceil(textW(txt, FONT.dtag)) + 14, rc = mk.firstChild;
      tx.textContent = txt;
      rc.setAttribute('x', -w / 2); rc.setAttribute('width', w);
    }
    const mp = r.line.getPointAtLength(r.len * 0.7);
    mk.setAttribute('transform', `translate(${mp.x} ${mp.y})`);
  }
  // Modelo de amenazas en CSV: una fila por conexión que cruza × categoría sugerida
  function exportThreats() {
    const list = strideAll();
    if (!list.length) return toast(T('stride.none'));
    const dl = x => (x || []).map(k => DATA[k] ? loc(DATA[k].short) || k.toUpperCase() : String(k).toUpperCase());
    const rows = [[T('stride.csv.zones'), T('stride.csv.from'), T('stride.csv.to'), T('stride.csv.label'), T('stride.csv.data'), T('stride.csv.enc'), T('stride.csv.cat'), T('stride.csv.sev'), T('stride.csv.status'), T('stride.csv.note'), T('stride.csv.fix')]];
    const byId = new Map(S.model.nodes.map(n => [n.id, n]));
    list.forEach(t => rows.push([t.zones.map(trustName).join(' | '), t.from, t.to, t.e.label || '',
      [...new Set([...dl(t.e.data), ...dl(byId.get(t.e.from)?.data), ...dl(byId.get(t.e.to)?.data)])].join(' '),
      T(t.e.encrypted === true ? 'enc.yes' : t.e.encrypted === false ? 'enc.no' : 'enc.unset'),
      `${t.cat} ${loc(STR.categories[t.cat].label)}`, sevLabel(t.severity), T(`stride.st.${t.status}`), t.note, t.mitigation]));
    download(toCSV(rows), fileName('csv', 'stride'), 'text/csv;charset=utf-8');
    toast(T('toast.exported', { name: T('exp.stride') }));
  }
  // Etiqueta: candado de cifrado, texto y clasificaciones de los datos que viajan (según lo que la vista muestre)
  function edgeLabel(r) {
    const e = r.e, v = vc();
    r.label?.remove(); r.label = null;
    const tags = v.dataTags ? dataTags(e) : [], lock = v.locks && e.encrypted != null, text = v.edgeLabels && e.label;
    if (!text && !tags.length && !lock) return;
    const label = el('g', { class: 'edge-label' }, r.g);
    const items = [];
    if (lock) items.push({ w: 10, draw: x => lockIcon(label, x, e.encrypted) });
    // La etiqueta puede tener varias líneas (\n): se centran y la píldora crece con ellas
    const lines = text ? String(e.label).split('\n') : [], LH = 14;
    if (text) items.push({ w: Math.max(...lines.map(l => textW(l, FONT.edge))), draw: (x, w) => {
      const tx = el('text', { x: x + w / 2, y: 4 - (lines.length - 1) * LH / 2, 'text-anchor': 'middle' }, label);
      lines.forEach((l, i) => { el('tspan', i ? { x: x + w / 2, dy: LH } : null, tx).textContent = l; });
    } });
    tags.forEach(t => items.push({ w: Math.ceil(textW(t.short, FONT.dtag)) + 12, draw: x => dataTag(label, x, -7, t, 14) }));
    const gap = 5, w = items.reduce((sum, it) => sum + it.w, 0) + gap * (items.length - 1) + 16;
    const ph = Math.max(20, lines.length * LH + 6);
    el('rect', { x: -w / 2, y: -ph / 2, width: w, height: ph, rx: Math.min(10, ph / 2) }, label);
    let x = -w / 2 + 8;
    items.forEach(it => { it.draw(x, it.w); x += it.w + gap; });
    r.label = label;
  }

  function buildNode(n, delay) {
    const t = typeOf(n), w = R.width.get(n.id);
    const g = el('g', { class: 'node' + (n.c4 ? ` c4-${n.c4}` : ''), 'data-id': n.id }, L.nodes);
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
    const inn = innerCount(n.id), ctxt = inn ? `⊞ ${inn}` : '', cw = inn ? Math.ceil(textW(ctxt, FONT.badge)) + 14 : 0; // indicador del diagrama interno, a la derecha dentro de la tarjeta
    const max = w - 64 - 16 - (cw ? cw + 4 : 0);
    // Nombre en 1 o 2 líneas y detalle debajo, todo centrado en vertical
    const lines = C.node.sameSize !== false ? wrapText(n.label, FONT.label, max) : [fitText(n.label, FONT.label, max)];
    // Con detalle se dibujan dos variantes (completa y mínima, centradas cada una): la vista elige cuál se ve
    const sub = n.sub ? fitText(n.sub, FONT.sub, max) : n.c4 ? fitText(`[${c4Label(n.c4)}]`, FONT.sub, max) : ''; // sin detalle propio, el tipo C4 ocupa su línea
    const paint = (withSub, cls) => {
      const top = (H - lines.length * 16 - (withSub && sub ? 15 : 0)) / 2;
      lines.forEach((l, i) => { el('text', { class: `node-label${cls}`, x: 64, y: top + 12 + i * 16 }, b).textContent = l; });
      if (withSub && sub) el('text', { class: `node-sub${cls}`, x: 64, y: top + lines.length * 16 + 12 }, b).textContent = sub;
    };
    if (sub) { paint(true, ' nd-full'); paint(false, ' nd-min'); } else paint(false, '');
    // Arriba a la izquierda: la observación de revisión (si hay) y las clasificaciones de datos
    const dt = [...(n.review ? [{ ...reviewTag(n.review), cls: 'dt-review' }] : []), ...dataTags(n).map(t => ({ ...t, cls: 'dt-data' })), ...adrTags(n), ...radarTags(n)];
    const rg = regionOf(n).value;
    const ly = layerOf(n), li = ly.value ? layerInfo(ly.value) : null;
    el('title', null, g).textContent = [n.sub ? `${n.label} · ${n.sub}` : n.label, n.c4 ? `${T('c4.label')}: ${c4Label(n.c4)}` : '', inn ? T('c4.inner.tip', inn) : '', ...dt.map(t => t.label), govTip(n), cmpTip(n), li ? T('layer.tip', { l: li.label }) : '', resTip(n), rg ? T('res.tip', regionLabel(rg)) : ''].filter(Boolean).join('\n');
    if (dt.length) {
      const dg = el('g', { class: 'node-data' }, b);
      let x = 14;
      dt.forEach(t => { x += dataTag(dg, x, -8, t, 16, t.cls) + 4; });
    }
    if (n.badge != null && n.badge !== '') {
      const bw = Math.max(22, textW(n.badge, FONT.badge) + 12);
      const bg = el('g', { class: 'node-badge', transform: `translate(${w - 14} 0)` }, b);
      el('rect', { x: -bw / 2, y: -9, width: bw, height: 18, rx: 9 }, bg);
      el('text', { 'text-anchor': 'middle', y: 4 }, bg).textContent = n.badge;
    }
    if (rg) { // abajo a la derecha, a caballo del borde (solo en las vistas Seguridad y Física)
      const j = jurOf(rg), rt = j && j.short.toLowerCase() !== rg.toLowerCase() ? `${j.short} · ${rg}` : rg, rw = Math.min(w - 16, Math.ceil(textW(rt, FONT.cost) + 14));
      const rgg = el('g', { class: `node-region${j ? ` jur-${j.key}` : ''}`, transform: `translate(${w - rw - 8} ${H - 9})` }, b);
      el('rect', { width: rw, height: 18, rx: 9 }, rgg);
      el('text', { x: rw / 2, y: 12.5, 'text-anchor': 'middle' }, rgg).textContent = fitText(rt, FONT.cost, rw - 10);
    }
    if (hasCost(n)) {
      const ct = costText(n), cw = Math.ceil(textW(ct, FONT.cost) + 20);
      const cg = el('g', { class: 'node-cost', transform: `translate(${(w - cw) / 2} ${H + 6})` }, b);
      el('rect', { width: cw, height: 20, rx: 10 }, cg);
      el('text', { x: cw / 2, y: 14, 'text-anchor': 'middle' }, cg).textContent = ct;
    }
    // Gobierno: pastilla de equipo (o dueño) bajo el nodo; solo se ve en la vista Gobierno
    const gt = govOf(n, 'team').value || govOf(n, 'owner').value;
    if (gt) {
      const ot = fitText(gt, FONT.cost, w - 20), ow = Math.ceil(textW(ot, FONT.cost) + 20);
      const og = el('g', { class: 'node-own', transform: `translate(${(w - ow) / 2} ${H + 6})` }, b);
      el('rect', { width: ow, height: 20, rx: 10 }, og);
      el('text', { x: ow / 2, y: 14, 'text-anchor': 'middle' }, og).textContent = ot;
    }
    if (hasRes(n)) { // Resiliencia: pastilla «99.95% · RPO 15 min · RTO 1 h · ×2» bajo el nodo; solo se ve en la vista Resiliencia
      const rt = fitText(resChip(n), FONT.cost, w - 20), rw = Math.ceil(textW(rt, FONT.cost) + 20);
      const rgx = el('g', { class: 'node-res', transform: `translate(${(w - rw) / 2} ${H + 6})` }, b);
      el('rect', { width: rw, height: 20, rx: 10 }, rgx);
      el('text', { x: rw / 2, y: 14, 'text-anchor': 'middle' }, rgx).textContent = rt;
    }
    if (n.phase && S.model.phases?.length) { // «NUEVO»: abajo a la izquierda, a caballo del borde; solo se ve si el nodo aparece justo en la fase elegida (clase ph-new)
      const tx = T('phase.new'), pw = Math.ceil(textW(tx, FONT.badge)) + 12, pg = el('g', { class: 'node-phase', transform: `translate(10 ${H - 9})` }, b);
      el('title', null, pg).textContent = T('phase.new.tip');
      el('rect', { width: pw, height: 18, rx: 9 }, pg);
      el('text', { x: pw / 2, y: 12.5, 'text-anchor': 'middle' }, pg).textContent = tx;
    }
    const mg = n.disposition && mgInfo(n.disposition);
    if (mg) { // abajo a la derecha, a caballo del borde (se oculta en las vistas que ya usan ese sitio: región en Seguridad y Física)
      const mw = Math.ceil(textW(mg.short, FONT.badge)) + 14, mgg = el('g', { class: 'node-mig', style: `--mg:${mg.color}`, transform: `translate(${w - mw - 8} ${H - 9})` }, b);
      el('title', null, mgg).textContent = `${T('mig.label')}: ${mg.label}`;
      el('rect', { width: mw, height: 18, rx: 9 }, mgg);
      el('text', { x: mw / 2, y: 12.5, 'text-anchor': 'middle' }, mgg).textContent = mg.short;
    }
    const cmN = S.model.comments?.length ? cmOpen(S.model, 'node', n.id).length : 0;
    if (cmN) { // en el borde izquierdo, a media altura; las exportaciones no lo llevan
      const cmg = el('g', { class: 'node-cmt', transform: `translate(0 ${H / 2})` }, b);
      el('title', null, cmg).textContent = T('cmt.badge', cmN);
      el('rect', { x: -11, y: -9, width: 22, height: 18, rx: 9 }, cmg);
      el('text', { 'text-anchor': 'middle', y: 4 }, cmg).textContent = cmN > 9 ? '9+' : String(cmN);
    }
    if (li) drawNodeLayer(b, li);
    if (inn) {
      const cg = el('g', { class: 'node-inner', transform: `translate(${w - 8 - cw} ${(H - 20) / 2})` }, b);
      el('title', null, cg).textContent = T('c4.inner.tip', inn);
      el('rect', { width: cw, height: 20, rx: 10 }, cg);
      el('text', { x: cw / 2, y: 14, 'text-anchor': 'middle' }, cg).textContent = ctxt;
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
  function elbowPath(a, b, off, obstacles, eoff = off) {
    const hgap = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
    const vgap = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
    const flip = hgap < vgap; // en vertical se trabaja con x e y cambiados
    const T = flip ? q => ({ x: q.y, y: q.x, w: q.h, h: q.w }) : q => q;
    const A = T(a), B = T(b), obs = obstacles.map(T);
    const dir = B.x + B.w / 2 >= A.x + A.w / 2 ? 1 : -1;
    const sx = dir > 0 ? A.x + A.w : A.x, ex = dir > 0 ? B.x : B.x + B.w;
    const sy = A.y + A.h / 2 + off, ey = B.y + B.h / 2 + eoff;
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
  // Lado por el que sale el origen y entra el destino (misma regla que elbowPath): 'r', 'l', 'b' o 't'
  function elbowSides(a, b) {
    const hgap = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
    const vgap = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
    if (hgap >= vgap) return b.x + b.w / 2 >= a.x + a.w / 2 ? ['r', 'l'] : ['l', 'r'];
    return b.y + b.h / 2 >= a.y + a.h / 2 ? ['b', 't'] : ['t', 'b'];
  }
  // Desplazamientos centrados para n anclajes en un lado de longitud len, sin pasar de las esquinas redondeadas
  function spreadOffsets(n, len, rad, gap = 16) {
    const step = n > 1 ? Math.min(gap, Math.max(0, len - 2 * rad) / (n - 1)) : 0;
    return Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * step);
  }
  // Reparte los anclajes de los codos por nodo y lado; ordena por el centro del otro extremo para que no se crucen
  function elbowPorts(edges, rect, routeOf) {
    const sides = new Map(), out = new Map();
    edges.forEach((e, i) => {
      if (e.from === e.to || routeOf(e) !== 'elbow') return;
      const a = rect(e.from), b = rect(e.to), [ss, ts] = elbowSides(a, b);
      const add = (id, side, o) => { const k = id + '\0' + side; if (!sides.has(k)) sides.set(k, []); sides.get(k).push({ e, i, id, side, c: side === 'l' || side === 'r' ? o.y + o.h / 2 : o.x + o.w / 2 }); };
      add(e.from, ss, b); add(e.to, ts, a);
    });
    sides.forEach(list => {
      list.sort((p, q) => p.c - q.c || p.i - q.i);
      const r = rect(list[0].id), len = list[0].side === 'l' || list[0].side === 'r' ? r.h : r.w;
      const offs = spreadOffsets(list.length, len, C.node.radius);
      list.forEach((p, k) => {
        const o = out.get(p.e.id) || (out.set(p.e.id, { s: 0, t: 0 }), out.get(p.e.id));
        if (p.id === p.e.from) o.s = offs[k]; else o.t = offs[k];
      });
    });
    return out;
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

  // Punta de flecha al final de la línea (y al inicio si es bidireccional)
  function arrowD(line, len, both, k = 1) { // k > 1: punta más grande para líneas gruesas (peso)
    const p = line.getPointAtLength(len), q = line.getPointAtLength(Math.max(0, len - 9));
    const ang = Math.atan2(p.y - q.y, p.x - q.x), c = Math.cos(ang), s = Math.sin(ang);
    const bx = p.x - 10 * k * c, by = p.y - 10 * k * s;
    let ad = `M${p.x},${p.y} L${bx - 5 * k * s},${by + 5 * k * c} L${bx + 5 * k * s},${by - 5 * k * c} Z`;
    if (both) { // segunda punta en el origen, mirando hacia fuera
      const p0 = line.getPointAtLength(0), q0 = line.getPointAtLength(Math.min(len, 9));
      const a0 = Math.atan2(p0.y - q0.y, p0.x - q0.x), c0 = Math.cos(a0), s0 = Math.sin(a0);
      const bx0 = p0.x - 10 * k * c0, by0 = p0.y - 10 * k * s0;
      ad += ` M${p0.x},${p0.y} L${bx0 - 5 * k * s0},${by0 + 5 * k * c0} L${bx0 + 5 * k * s0},${by0 - 5 * k * c0} Z`;
    }
    return ad;
  }

  function updateGeometry() {
    // Las insignias numeradas del camino / linaje siguen a su nodo cuando se arrastra
    if (S.path) $$('.path-badge[data-id]', L.guides).forEach(b => { const n = S.model.nodes.find(x => x.id === b.dataset.id); if (n) b.setAttribute('transform', `translate(${n.x + 2} ${n.y + 2})`); });
    const m = S.model, byId = new Map(m.nodes.map(n => [n.id, n]));
    const rect = id => { const n = byId.get(id); return { x: n.x, y: n.y, w: R.width.get(id), h: H }; };
    m.nodes.forEach(n => R.nodes.get(n.id)?.setAttribute('transform', `translate(${n.x} ${n.y})`));
    updateItems();

    const sc = R.edges.size && m.zones.some(z => z.kind === 'trust') ? strideCtx(m) : null;
    const sm = scopeModel(); // solo el nivel abierto cuenta para los obstáculos y los anclajes de los codos
    const pairs = new Set(sm.edges.map(e => e.from + '\0' + e.to));
    const allRects = sm.nodes.map(n => ({ id: n.id, ...rect(n.id) }));
    const ports = elbowPorts(sm.edges, rect, routeOf);
    R.edges.forEach(r => {
      if (VW.sc.edges.has(r.e.id)) return;
      const e = r.e, a = rect(e.from), b = rect(e.to), off = pairs.has(e.to + '\0' + e.from) ? 7 + Math.max(0, ((r.wpx || 1.8) - 1.8) / 2) : 0, pt = ports.get(e.id);
      const d = e.from === e.to ? loopPath(a)
        : pt ? elbowPath(a, b, pt.s, allRects.filter(o => o.id !== e.from && o.id !== e.to), pt.t) : curvePath(a, b, off);
      r.hit.setAttribute('d', d);
      r.line.setAttribute('d', d);
      r.len = r.line.getTotalLength();
      r.arrow.setAttribute('d', arrowD(r.line, r.len, e.both, r.ak));
      if (r.label || r.ds) {
        const mp = r.line.getPointAtLength(r.len / 2);
        r.label?.setAttribute('transform', `translate(${mp.x} ${mp.y})`);
        r.ds?.setAttribute('transform', `translate(${mp.x} ${mp.y})`);
      }
      if (r.xb) { // si hay etiqueta, el marcador se corre hacia el origen para no taparla
        const mp = r.line.getPointAtLength(r.len * (r.label ? 0.3 : 0.5));
        r.xb.setAttribute('transform', `translate(${mp.x} ${mp.y})`);
      }
      if (r.sm) strideMarkUpdate(r, sc);
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
    updateContext();
    drawScopeFrame();
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
          const fwd = (down ? e.from : e.to) === u;
          if (!fwd && !(e.both && (down ? e.to : e.from) === u)) return;
          const v = fwd ? (down ? e.to : e.from) : (down ? e.from : e.to);
          edges.add(e.id); nodes.add(v);
          if (!seen.has(v)) { seen.add(v); q.push(v); }
        });
      }
    };
    if (mode === 'down' || mode === 'both') walk(true);
    if (mode === 'up' || mode === 'both') walk(false);
    return { nodes, edges };
  }

  /* ---------- camino entre dos componentes ---------- */
  // Caminos más cortos de a a b (BFS). Devuelve todos los nodos y aristas que están en ALGUNO de ellos.
  function shortestPaths(model, a, b, directed = true) {
    if (a === b || !model.nodes.some(n => n.id === a) || !model.nodes.some(n => n.id === b)) return null;
    // Pasos posibles desde u: [arista, vecino]; hacia atrás si rev
    const steps = (u, rev) => model.edges.flatMap(e =>
      (rev ? e.to : e.from) === u ? [[e, rev ? e.from : e.to]] : (!directed || e.both) && (rev ? e.from : e.to) === u ? [[e, rev ? e.to : e.from]] : []);
    const bfs = (src, rev) => {
      const dist = new Map([[src, 0]]), cnt = new Map([[src, 1]]), q = [src];
      while (q.length) {
        const u = q.shift();
        steps(u, rev).forEach(([, v]) => {
          if (!dist.has(v)) { dist.set(v, dist.get(u) + 1); cnt.set(v, 0); q.push(v); }
          if (dist.get(v) === dist.get(u) + 1) cnt.set(v, cnt.get(v) + cnt.get(u));
        });
      }
      return { dist, cnt };
    };
    const f = bfs(a, false), r = bfs(b, true);
    if (!f.dist.has(b)) return null;
    const hops = f.dist.get(b), nodes = new Set(), edges = new Set(), dist = new Map();
    f.dist.forEach((d, id) => { if (r.dist.has(id) && d + r.dist.get(id) === hops) { nodes.add(id); dist.set(id, d); } });
    model.edges.forEach(e => {
      const ok = (u, v) => nodes.has(u) && nodes.has(v) && dist.get(u) + 1 === dist.get(v);
      if (ok(e.from, e.to) || ((!directed || e.both) && ok(e.to, e.from))) edges.add(e.id);
    });
    return { nodes, edges, hops, count: f.cnt.get(b), dist, directed };
  }

  function showPath(a, b) {
    if (vc().groups === 'collapse-top') { toast(T('ctx.noPath')); return null; }
    const m = S.model;
    if (!m.nodes.some(n => n.id === a) || !m.nodes.some(n => n.id === b) || a === b) return null;
    if (VW.sc.nodes.has(a) || VW.sc.nodes.has(b)) { toast(T('view.hiddenHere')); return null; } // el camino solo se pide entre nodos visibles (mismo nivel C4)
    let directed = true, res = shortestPaths(m, a, b, true);
    if (!res) { directed = false; res = shortestPaths(m, a, b, false); }
    clearPath();
    S.path = { a, b, res, directed };
    const lab = id => m.nodes.find(n => n.id === id).label;
    const name = `${esc(lab(a))} → ${esc(lab(b))}`;
    const txt = !res ? T('path.none', { name })
      : (directed ? '' : T('path.undirected') + ' · ') + T('path.summary', { name, hops: res.hops, count: res.count }) + pathResText(b, res);
    const bar = $('#path-bar');
    $('#path-text').innerHTML = txt;
    bar.style.top = S.compare ? '54px' : '';
    bar.hidden = false;
    if (res) {
      res.nodes.forEach(id => {
        if (VW.hideNodes.has(id)) return;
        const n = m.nodes.find(x => x.id === id), g = el('g', { class: 'path-badge', 'data-id': id, transform: `translate(${n.x + 2} ${n.y + 2})` }, L.guides);
        el('circle', { r: 9 }, g);
        el('text', {}, g).textContent = res.dist.get(id) + 1;
      });
      fitNodes([...res.nodes]);
    }
    applyHighlight();
    return res ? { hops: res.hops, count: res.count, directed } : null;
  }
  function clearPath() {
    if (!S.path) return;
    S.path = null;
    $('#path-bar').hidden = true;
    $$('.path-badge', L.guides).forEach(x => x.remove());
    applyHighlight();
  }
  /* ---------- linaje de datos: qué tablas viajan por cada conexión y su ruta de origen a consumo ---------- */
  // Lista de nombres: admite array o texto separado por comas / punto y coma; recorta, quita vacíos y repetidos
  function cleanDatasets(v) {
    const out = [], seen = new Set();
    (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,;]/) : []).forEach(x => {
      const s = String(x ?? '').trim(), k = s.toLowerCase();
      if (s && !seen.has(k)) { seen.add(k); out.push(s); }
    });
    return out;
  }
  const dsKey = s => String(s).trim().toLowerCase();
  // Conjuntos de datos usados en el diagrama: [{ name, edges }] (primera grafía), por uso y luego alfabético
  function datasetList(model = S.model) {
    const map = new Map();
    model.edges.forEach(e => (e.datasets || []).forEach(d => {
      const k = dsKey(d), r = map.get(k) || { name: d, edges: 0 };
      r.edges++; map.set(k, r);
    }));
    return [...map.values()].sort((a, b) => b.edges - a.edges || a.name.localeCompare(b.name));
  }
  // Subgrafo de las conexiones que llevan ds. Origen = sin entrada; consumo = sin salida. Profundidad = rango más largo desde los orígenes
  function lineageOf(model, ds) {
    const k = dsKey(ds), es = model.edges.filter(e => (e.datasets || []).some(d => dsKey(d) === k));
    if (!es.length) return null;
    const name = es[0].datasets.find(d => dsKey(d) === k);
    // Pasos dirigidos u → v (las aristas "both" valen en los dos sentidos)
    const steps = es.flatMap(e => e.from === e.to ? [] : [[e.from, e.to, e.id], ...(e.both ? [[e.to, e.from, e.id]] : [])]);
    const nodes = new Set(es.flatMap(e => [e.from, e.to])), edges = new Set(es.map(e => e.id));
    const hasIn = new Set(steps.map(s => s[1])), hasOut = new Set(steps.map(s => s[0]));
    const ids = [...nodes];
    let origins = ids.filter(id => !hasIn.has(id)), consumers = ids.filter(id => !hasOut.has(id));
    // Solo ciclos (sin origen claro): se parte de los nodos con salida para que haya algo que mostrar
    const seeds = origins.length ? origins : ids.slice(0, 1);
    // Capas por BFS con tope de relajaciones: un ciclo no puede colgar el cálculo
    const dist = new Map(seeds.map(id => [id, 0])), q = [...seeds], cap = ids.length * steps.length + 8;
    for (let n = 0; q.length && n < cap; n++) {
      const u = q.shift();
      steps.forEach(([a, b]) => {
        if (a === u && dist.get(u) + 1 > (dist.get(b) ?? -1) && dist.get(u) + 1 < ids.length) { dist.set(b, dist.get(u) + 1); q.push(b); }
      });
    }
    ids.forEach(id => dist.has(id) || dist.set(id, 0));
    const hops = Math.max(0, ...dist.values());
    return { nodes, edges, dist, origins, consumers, hops, name };
  }
  // Conjuntos de datos que entran y salen de un nodo (para el inspector): [nombre]
  function datasetsOfNode(id) {
    const seen = new Map();
    S.model.edges.filter(e => e.from === id || e.to === id).forEach(e => (e.datasets || []).forEach(d => seen.has(dsKey(d)) || seen.set(dsKey(d), d)));
    return [...seen.values()];
  }
  function showLineage(ds) {
    const m = S.model, res = lineageOf(m, ds);
    if (!res) { toast(T('lin.unknown', { name: String(ds) })); return null; }
    clearPath();
    S.path = { lineage: res.name, res, directed: true };
    $('#path-text').innerHTML = T('lin.summary', { name: esc(res.name), src: res.origins.length, dst: res.consumers.length, hops: res.hops });
    const bar = $('#path-bar');
    bar.style.top = S.compare ? '54px' : '';
    bar.hidden = false;
    const badge = (key, v, x, y, dist) => {
      const g = el('g', { class: `path-badge${v.src ? ' lin-src' : ''}${v.dst ? ' lin-dst' : ''}`, [key]: v.id, transform: `translate(${x + 2} ${y + 2})` }, L.guides);
      el('circle', { r: 9 }, g);
      el('text', {}, g).textContent = dist + 1;
    };
    // Vista Contexto: los nodos de dentro de una caja cerrada se marcan en la caja (una insignia por caja)
    const boxOf = new Map(), onBox = new Map(), shown = [];
    VW.ctxBoxes.forEach((b, gid) => b.ids.forEach(id => boxOf.set(id, gid)));
    res.nodes.forEach(id => {
      const n = m.nodes.find(x => x.id === id), gid = boxOf.get(id);
      if (gid) {
        const o = onBox.get(gid) || onBox.set(gid, { id: gid, src: false, dst: false, dist: Infinity }).get(gid);
        o.src ||= res.origins.includes(id); o.dst ||= res.consumers.includes(id); o.dist = Math.min(o.dist, res.dist.get(id));
        return;
      }
      if (!n || VW.hideNodes.has(id)) return;
      shown.push(id);
      badge('data-id', { id, src: res.origins.includes(id), dst: res.consumers.includes(id) }, n.x, n.y, res.dist.get(id));
    });
    onBox.forEach((o, gid) => { const c = VW.ctxBoxes.get(gid).card; badge('data-gid', o, c.x, c.y, o.dist); });
    if (onBox.size) {
      const rs = [...shown.map(id => { const n = m.nodes.find(x => x.id === id); return { x: n.x, y: n.y, w: R.width.get(id), h: nodeBoxH(n) }; }), ...[...onBox.keys()].map(g => VW.ctxBoxes.get(g).card)];
      const x0 = Math.min(...rs.map(r => r.x)), y0 = Math.min(...rs.map(r => r.y));
      fitBox({ x: x0, y: y0, w: Math.max(...rs.map(r => r.x + r.w)) - x0, h: Math.max(...rs.map(r => r.y + r.h)) - y0 });
    } else fitNodes([...res.nodes]);
    applyHighlight();
    return res;
  }
  // Nombres de los conjuntos bajo la etiqueta de la conexión (solo se ve en la vista Datos; va en el SVG para que se exporte)
  function edgeDatasets(r) {
    r.ds?.remove(); r.ds = null;
    const ds = r.e.datasets;
    if (!ds?.length) return;
    // Debajo de la etiqueta o, si no hay, de las fichas de datos / el candado que ocupan su sitio
    const lines = r.e.label ? String(r.e.label).split('\n').length : 0, tags = r.e.data?.length || r.e.encrypted != null;
    const dy = (lines ? Math.max(20, lines * 14 + 6) / 2 : tags ? 10 : 0) + 11;
    const txt = ds.slice(0, 3).join(' · ') + (ds.length > 3 ? ` +${ds.length - 3}` : '');
    const g = el('g', { class: 'edge-ds' }, r.g);
    el('text', { y: dy, 'text-anchor': 'middle' }, g).textContent = fitText(txt, '600 10px', 240);
    r.ds = g;
  }
  // Selector de conjuntos (tecla D): ventana pequeña con filtro, ↑↓ y Intro
  const dsPick = { box: null, sel: 0, q: '' };
  function closeDatasetPicker() { dsPick.box?.remove(); dsPick.box = null; }
  function openDatasetPicker() {
    if (dsPick.box) return closeDatasetPicker();
    const box = document.createElement('div');
    box.className = 'menu-pop ds-pop'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', T('lin.picker'));
    box.innerHTML = `<input class="ds-q" type="text" placeholder="${esc(T('lin.picker.ph'))}" aria-label="${esc(T('lin.picker.ph'))}" autocomplete="off" spellcheck="false"><div class="ds-list" role="listbox"></div>`;
    document.body.appendChild(box);
    dsPick.box = box; dsPick.sel = 0; dsPick.q = '';
    const input = box.querySelector('input'), listEl = box.querySelector('.ds-list');
    const rows = () => datasetList().filter(d => dsKey(d.name).includes(dsKey(dsPick.q)));
    const draw = () => {
      const rs = rows();
      dsPick.sel = Math.min(dsPick.sel, Math.max(0, rs.length - 1));
      listEl.innerHTML = rs.length ? rs.map((d, i) => `<button role="option" aria-selected="${i === dsPick.sel}" class="${i === dsPick.sel ? 'on' : ''}" data-ds="${esc(d.name)}"><span>${esc(d.name)}</span><small>${esc(T('lin.picker.count', d.edges))}</small></button>`).join('')
        : `<p class="menu-note">${esc(T(datasetList().length ? 'lin.picker.nomatch' : 'lin.picker.empty'))}</p>`;
      listEl.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
    };
    const pick = name => { closeDatasetPicker(); showLineage(name); };
    input.addEventListener('input', () => { dsPick.q = input.value; dsPick.sel = 0; draw(); });
    input.addEventListener('keydown', ev => {
      const rs = rows();
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); if (rs.length) { dsPick.sel = (dsPick.sel + (ev.key === 'ArrowDown' ? 1 : rs.length - 1)) % rs.length; draw(); } }
      else if (ev.key === 'Enter') { ev.preventDefault(); if (rs[dsPick.sel]) pick(rs[dsPick.sel].name); }
      else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); closeDatasetPicker(); }
    });
    listEl.addEventListener('click', ev => { const b = ev.target.closest('button[data-ds]'); if (b) pick(b.dataset.ds); });
    // Se cierra al pulsar fuera
    setTimeout(() => document.addEventListener('pointerdown', function off(ev) {
      if (!dsPick.box) return document.removeEventListener('pointerdown', off, true);
      if (!dsPick.box.contains(ev.target)) { closeDatasetPicker(); document.removeEventListener('pointerdown', off, true); }
    }, true));
    const tb = $('#btn-view')?.getBoundingClientRect();
    box.style.top = `${(tb ? tb.bottom : 60) + 6}px`; box.style.left = `${Math.max(8, Math.min(innerWidth - 268, tb ? tb.left : 80))}px`;
    draw(); input.focus();
  }

  // Encuadra solo algunos nodos (suave); no aleja más de lo necesario
  function fitNodes(ids) {
    const ns = S.model.nodes.filter(n => ids.includes(n.id) && !VW.hideNodes.has(n.id)), r = svg.getBoundingClientRect();
    if (!ns.length || !r.width) return;
    const x0 = Math.min(...ns.map(n => n.x)), y0 = Math.min(...ns.map(n => n.y));
    const x1 = Math.max(...ns.map(n => n.x + R.width.get(n.id))), y1 = Math.max(...ns.map(n => n.y + nodeBoxH(n)));
    const pad = 80, top = 90, shift = r.width > 900 ? 300 : 0, w = x1 - x0, h = y1 - y0;
    const k = clamp(Math.min((r.width - shift - pad * 2) / w, (r.height - pad - top) / h), C.view.minZoom, Math.min(S.view.k, 1.25));
    animateView({ k, x: (r.width - shift - w * k) / 2 - x0 * k, y: top + (r.height - top - pad - h * k) / 2 - y0 * k });
  }

  // Encuadra un rectángulo del mundo (suave); no aleja más de lo necesario
  function fitBox(b, maxK = 1.25) {
    const r = svg.getBoundingClientRect();
    if (!b || !r.width) return;
    const pad = 80, top = 90, shift = r.width > 900 ? 300 : 0;
    const k = clamp(Math.min((r.width - shift - pad * 2) / b.w, (r.height - pad - top) / b.h), C.view.minZoom, maxK);
    animateView({ k, x: (r.width - shift - b.w * k) / 2 - b.x * k, y: top + (r.height - top - pad - b.h * k) / 2 - b.y * k });
  }

  function applyHighlight() {
    if (S.play) return;
    if (P) { if (P.sl) presentDim(P.sl.lit, P.sl.gin); return; }
    const s = S.sel, m = S.model;
    let f = null, mode = '';
    if (S.path?.res) { f = S.path.res; mode = 'focusing'; }
    else if (s?.kind === 'node') { f = reach(s.id, S.reach); mode = 'focusing'; }
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
    HL.f = f;
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
    ctxMark();
    markItems();
  }

  /* ---------- vistas ---------- */
  // Una vista no toca el modelo: decide qué se ve, con cuánto detalle y qué se resalta.
  // applyViewMode pone clases en el SVG (vw-*, data-view) y en cada elemento (v-*); el CSS está en #diagram-css,
  // así que las exportaciones SVG/PNG y el HTML cifrado se ven igual que el lienzo.
  const vc = () => VIEWS[S.viewKey] || VIEWS.full;
  // Vista Seguridad: clase de una conexión. Sin cifrar: alta (crítica si lleva datos sensibles) · sin indicar con datos sensibles: aviso · cifrada: normal
  const secClass = (e, byId) => {
    if (isXBorder(e, byId)) return 'v-hl v-crit v-xb'; // datos sensibles fuera de su jurisdicción sin transferencia autorizada
    const sens = isSensitive(e) || isSensitive(byId.get(e.from)) || isSensitive(byId.get(e.to));
    return e.encrypted === false ? (sens ? 'v-hl v-crit' : 'v-hl v-high') : e.encrypted == null ? (sens ? 'v-hl v-warn' : 'v-dim') : '';
  };
  const VCLS = ['v-hide', 'v-hl', 'v-dim', 'v-heat', 'v-crit', 'v-high', 'v-warn', 'v-hlc', 'v-own', 'v-xb', 'v-spof'];
  // De menos a más costo: tramos de VR.costHeat mezclados con color-mix
  const heatColor = t => {
    const st = VR.costHeat;
    if (st.length < 2) return st[0] || 'var(--accent)';
    const pos = clamp(t, 0, 1) * (st.length - 1), i = Math.min(st.length - 2, Math.floor(pos)), f = pos - i;
    return f < 0.02 ? st[i] : f > 0.98 ? st[i + 1] : `color-mix(in srgb, ${st[i + 1]} ${Math.round(f * 100)}%, ${st[i]})`;
  };
  // Total mensual de cada grupo (recursivo) para su etiqueta en la vista Costo
  function viewPrep() {
    VW.gcost = null;
    if (vc().emphasis !== 'cost') return;
    const tot = new Map(), gmap = new Map(S.model.groups.map(g => [g.id, g]));
    S.model.nodes.forEach(n => {
      if (!hasCost(n)) return;
      const pm = perMonth(n);
      let g = n.group, i = 0;
      while (g && gmap.has(g) && i++ < 50) { tot.set(g, (tot.get(g) || 0) + pm); g = gmap.get(g).parent; }
    });
    VW.gcost = tot;
  }
  function applyViewMode() {
    const m = S.model, v = vc(), key = S.viewKey, emph = v.emphasis, collapse = v.groups === 'collapse-top';
    [...svg.classList].filter(c => c.startsWith('vw-')).forEach(c => svg.classList.remove(c));
    svg.classList.add(...[`vw-${key}`, collapse && 'vw-collapse', v.nodeDetail === 'min' && 'vw-min', !v.dataTags && 'vw-no-dtags', !v.cost && 'vw-no-cost',
      !v.zones && 'vw-no-zones', !v.notes && 'vw-no-notes', !v.review && 'vw-no-review', emph && 'vw-emph'].filter(Boolean));
    svg.classList.toggle('vw-no-layers', !v.layers);
    svg.dataset.view = key;
    const byId = new Map(m.nodes.map(n => [n.id, n]));
    const hideN = new Set(), hideE = new Set(), hideG = new Set(), top = new Set();
    const nodeCls = new Map(), edgeCls = new Map(), nodeVar = new Map(), edgeVar = new Map(), ownVar = new Map();
    if (collapse) { // cajas cerradas: dentro de un grupo todo se oculta; las conexiones reales se sustituyen por las agregadas
      m.nodes.forEach(n => { if (n.group) hideN.add(n.id); });
      m.edges.forEach(e => hideE.add(e.id));
      m.groups.forEach(g => (g.parent ? hideG : top).add(g.id));
    } else if (v.groups === 'logical') m.groups.forEach(g => { if (groupKind(g) === 'physical') hideG.add(g.id); });
    // Nivel C4 abierto: lo de otros niveles se oculta con el mismo mecanismo que las vistas (las conexiones que cruzan niveles se dibujan aparte)
    const sc = { nodes: new Set(), edges: new Set(), groups: new Set() };
    m.nodes.forEach(n => { if (!inScope(n)) sc.nodes.add(n.id); });
    m.groups.forEach(g => { if (!inScope(g)) sc.groups.add(g.id); });
    m.edges.forEach(e => { if (sc.nodes.has(e.from) || sc.nodes.has(e.to)) sc.edges.add(e.id); });
    sc.nodes.forEach(id => hideN.add(id)); sc.edges.forEach(id => hideE.add(id)); sc.groups.forEach(id => hideG.add(id));
    VW.sc = sc;
    // Fases: lo que aún no existe en la fase elegida es un fantasma (se oculta si se apagan los fantasmas) y lo retirado se oculta; las conexiones siguen a sus extremos
    const pv = phaseView();
    pv.hide.nodes.forEach(id => hideN.add(id)); pv.hide.edges.forEach(id => hideE.add(id)); pv.hide.groups.forEach(id => hideG.add(id));
    VW.ph = pv;

    if (emph === 'security') {
      m.nodes.forEach(n => nodeCls.set(n.id, isSensitive(n) ? 'v-hl' : 'v-dim'));
      m.edges.forEach(e => edgeCls.set(e.id, secClass(e, byId)));
      m.edges.forEach(e => { if (edgeCls.get(e.id).includes('v-xb')) { nodeCls.set(e.from, 'v-hl'); nodeCls.set(e.to, 'v-hl'); } }); // extremos resaltados
    } else if (emph === 'data') {
      const rank = k => Object.keys(DATA).indexOf(k);
      const isData = n => VR.dataTypes.includes(n.type) || VR.dataIconCategories.includes(iconInfo(n.icon)?.category);
      m.nodes.forEach(n => nodeCls.set(n.id, isData(n) || n.data?.length || layerOf(n).value ? 'v-hl' : 'v-dim'));
      m.edges.forEach(e => {
        if (e.style !== 'data' && !e.data?.length && !e.datasets?.length) return edgeCls.set(e.id, 'v-dim');
        // Color de la clasificación más sensible que lleva (la propia, o la de sus extremos)
        const ks = e.data?.length ? e.data : [...(byId.get(e.from)?.data || []), ...(byId.get(e.to)?.data || [])];
        const best = ks.filter(k => DATA[k]).sort((a, b) => rank(b) - rank(a))[0];
        edgeCls.set(e.id, best ? 'v-hl v-hlc' : 'v-hl');
        if (best) edgeVar.set(e.id, colorVar(DATA[best].color));
      });
    } else if (emph === 'cost') {
      const max = Math.max(0, ...m.nodes.filter(hasCost).map(perMonth));
      m.nodes.forEach(n => {
        if (!hasCost(n)) return nodeCls.set(n.id, 'v-dim');
        nodeCls.set(n.id, 'v-hl v-heat');
        nodeVar.set(n.id, heatColor(max > 0 ? perMonth(n) / max : 0));
      });
      m.edges.forEach(e => edgeCls.set(e.id, 'v-dim'));
    } else if (emph === 'resilience') { // color por disponibilidad efectiva; los puntos únicos de fallo, resaltados
      const sp = new Set(spofList(m).map(x => x.id));
      m.nodes.forEach(n => {
        const tr = resTier(n), bad = sp.has(n.id);
        if (!tr) return nodeCls.set(n.id, bad ? 'v-hl v-spof' : 'v-dim');
        nodeCls.set(n.id, `v-hl v-heat${bad ? ' v-spof' : ''}`);
        nodeVar.set(n.id, tr.color);
      });
      m.edges.forEach(e => edgeCls.set(e.id, 'v-dim'));
    } else if (emph === 'owner') { // color por equipo efectivo (o dueño); sin ninguno, atenuado
      const tm = govTeams(m);
      m.nodes.forEach(n => {
        const k = govKey(n);
        if (!k) return nodeCls.set(n.id, 'v-dim');
        nodeCls.set(n.id, 'v-hl v-own');
        ownVar.set(n.id, tm.get(k).color);
      });
    }

    const paint = (g, id, hide, cls, vars, prop) => {
      g.classList.remove(...VCLS);
      g.style.removeProperty(prop);
      if (hide.has(id)) return g.classList.add('v-hide');
      if (cls.get(id)) g.classList.add(...cls.get(id).split(' '));
      if (vars.has(id)) g.style.setProperty(prop, vars.get(id));
    };
    R.nodes.forEach((g, id) => paint(g, id, hideN, nodeCls, nodeVar, '--heat'));
    R.nodes.forEach((g, id) => { g.style.removeProperty('--own'); if (ownVar.has(id) && !hideN.has(id)) g.style.setProperty('--own', ownVar.get(id)); });
    R.edges.forEach((r, id) => paint(r.g, id, hideE, edgeCls, edgeVar, '--vc'));
    R.groups.forEach((r, id) => r.g.classList.toggle('v-hide', hideG.has(id) || top.has(id)));
    R.nodes.forEach((g, id) => { g.classList.toggle('pghost', pv.ghost.nodes.has(id)); g.classList.toggle('ph-new', pv.fresh.has(id)); });
    R.edges.forEach((r, id) => r.g.classList.toggle('pghost', pv.ghost.edges.has(id)));
    R.groups.forEach((r, id) => r.g.classList.toggle('pghost', pv.ghost.groups.has(id)));
    VW.hideNodes = hideN; VW.hideEdges = hideE; VW.hideGroups = hideG;
    // Atenuados (no ocultos): los muestra la pastilla de la vista
    const dim = cls => [...cls].filter(([id, c]) => /\bv-dim\b/.test(c)).length;
    VW.dimNodes = dim(nodeCls); VW.dimEdges = dim(edgeCls);
    syncViewUI();
  }
  // La selección no puede apuntar a algo que esta vista oculta
  function visibleSel(sel) {
    const v = vc();
    if (!sel) return sel;
    if (sel.kind === 'node') return VW.hideNodes.has(sel.id) ? null : sel;
    if (sel.kind === 'multi') return normSel({ kind: 'multi', ids: sel.ids.filter(id => !VW.hideNodes.has(id)) });
    if (sel.kind === 'edge') return VW.hideEdges.has(sel.id) ? null : sel;
    if (sel.kind === 'group') return VW.hideGroups.has(sel.id) ? null : sel;
    if (sel.kind === 'note') return v.notes && itemInScope('notes', sel.id) ? sel : null;
    if (sel.kind === 'zone') return v.zones && itemInScope('zones', sel.id) ? sel : null;
    return sel;
  }
  // Vuelve a pintar todo con la vista activa (sin reconstruir el lienzo)
  function refreshView() {
    viewPrep();
    R.groups.forEach((r, id) => { const g = groupById(id); if (g) drawTag(g, r); });
    R.edges.forEach(r => edgeLabel(r));
    applyViewMode();
    updateGeometry();
    S.sel = visibleSel(S.sel);
    applyFilter();
    applyHighlight();
    renderInspector();
  }
  function setView(key, opts = {}) {
    if (!VIEWS[key]) return false;
    S.viewChosen = true;
    store.set('view', key);
    if (key !== S.viewKey) {
      S.viewKey = key;
      stopPlay(); clearPath();
      S.flow = null;
      refreshView();
    }
    if (opts.toast !== false) toast(T('view.toast', { name: viewLabel(key) }));
    return key;
  }
  /* ---------- selector de vistas (barra superior) y pastilla de vista activa (lienzo) ---------- */
  const viewMenu = $('#view-menu'), viewBtn = $('#btn-view'), viewList = $('#view-list'), viewPill = $('#stage-view');
  const VIEW_ICON = '<circle cx="12" cy="12" r="8"/>';
  const viewIcon = k => VIEWS[k]?.icon || VIEW_ICON;
  const viewDesc = k => { const dk = `view.desc.${k}`, d = T(dk); return d === dk ? '' : d; };
  // Lo que la vista oculta (componentes, grupos, conexiones, y zonas / notas si la vista no las muestra) y lo que atenúa.
  // En Contexto: componentes que quedan dentro de cajas cerradas.
  function viewCounts() {
    const m = S.model, v = vc();
    if (v.groups === 'collapse-top') return { ctx: [...VW.ctxBoxes.values()].reduce((a, b) => a + b.ids.length, 0), hidden: 0, dim: 0 };
    const hidden = VW.hideNodes.size - VW.sc.nodes.size + VW.hideGroups.size - VW.sc.groups.size + VW.hideEdges.size - VW.sc.edges.size + (v.zones ? 0 : scopeItems('zones').length) + (v.notes ? 0 : scopeItems('notes').length);
    return { hidden, dim: VW.dimNodes + VW.dimEdges };
  }
  function renderViewMenu() {
    viewList.innerHTML = VIEW_KEYS.map((k, i) => `<button class="vopt" role="option" tabindex="-1" data-view="${esc(k)}" aria-selected="false"><svg viewBox="0 0 24 24" aria-hidden="true">${viewIcon(k)}</svg><span><b>${esc(viewLabel(k))}</b>${viewDesc(k) ? `<em>${esc(viewDesc(k))}</em>` : ''}</span>${i < 9 ? `<kbd>${i + 1}</kbd>` : ''}</button>`).join('');
    syncViewUI();
  }
  function syncViewUI() {
    if (!S.model) return;
    const key = S.viewKey, name = viewLabel(key), tip = T('view.menu', { name });
    $('#view-ico').innerHTML = viewIcon(key);
    $('#view-lbl').textContent = name;
    viewBtn.title = tip; viewBtn.setAttribute('aria-label', tip);
    viewBtn.classList.toggle('on', key !== 'full');
    renderDocbar();  // la ficha del documento y su leyenda siguen a la vista
    viewList.querySelectorAll('.vopt').forEach(b => b.setAttribute('aria-selected', b.dataset.view === key));
    // Pastilla: solo cuando la vista no es Completa
    viewPill.hidden = key === 'full';
    if (key === 'full') return;
    const c = viewCounts(), parts = c.ctx != null ? [T('view.pill.ctx', c.ctx)] : [c.hidden && T('view.pill.hidden', c.hidden), c.dim && T('view.pill.dim', c.dim)].filter(Boolean);
    const lbl = `${T('view.pill')}: ${name}${parts.length ? ` · ${parts.join(' · ')}` : ''}`;
    viewPill.title = c.ctx != null ? '' : T('view.pill.tip', { hidden: c.hidden, dim: c.dim });
    viewPill.innerHTML = `<svg class="vi" viewBox="0 0 24 24" aria-hidden="true">${viewIcon(key)}</svg><span>${esc(lbl)}</span>${vc().emphasis === 'cost' ? `<button class="btn small cst-open" data-cst-open title="${esc(T('cst.open.tip'))}">${esc(T('cst.open'))}</button>` : ''}<button class="icon-btn" data-view-back title="${esc(T('view.back'))}" aria-label="${esc(T('view.back'))}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>`;
  }
  viewPill.addEventListener('click', ev => { if (ev.target.closest('[data-view-back]')) setView('full'); });
  const optList = () => [...viewList.querySelectorAll('.vopt')];
  function placeViewMenu() {
    const r = viewBtn.getBoundingClientRect();
    viewList.style.top = `${r.bottom}px`;
    viewList.style.right = `${Math.max(8, innerWidth - r.right)}px`;
  }
  viewMenu.addEventListener('toggle', () => {
    viewBtn.setAttribute('aria-expanded', viewMenu.open);
    if (!viewMenu.open) return;
    placeViewMenu();
    (optList().find(b => b.getAttribute('aria-selected') === 'true') || optList()[0])?.focus();
  });
  document.addEventListener('pointerdown', ev => { if (viewMenu.open && !viewMenu.contains(ev.target)) viewMenu.open = false; });
  viewList.addEventListener('click', ev => {
    const b = ev.target.closest('.vopt');
    if (!b) return;
    setView(b.dataset.view);
    viewMenu.open = false;
    viewBtn.focus();
  });
  // Teclado: ↑↓ Inicio Fin mueven, Enter elige (clic nativo del botón), Esc cierra
  viewMenu.addEventListener('keydown', ev => {
    const opts = optList(), i = opts.indexOf(document.activeElement);
    if (ev.target === viewBtn && ev.key === 'ArrowDown') { ev.preventDefault(); ev.stopPropagation(); viewMenu.open = true; return; }
    if (!viewMenu.open) return;
    const go = n => { ev.preventDefault(); ev.stopPropagation(); opts[(n + opts.length) % opts.length]?.focus(); };
    if (ev.key === 'ArrowDown') go(i + 1);
    else if (ev.key === 'ArrowUp') go(i < 0 ? opts.length - 1 : i - 1);
    else if (ev.key === 'Home') go(0);
    else if (ev.key === 'End') go(opts.length - 1);
    else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); viewMenu.open = false; viewBtn.focus(); }
    else if (ev.key === 'Tab') viewMenu.open = false;
    else if (/^[1-9]$/.test(ev.key)) viewMenu.open = false;  // el atajo numérico (global) cambia de vista; el menú se cierra
  });
  renderViewMenu();
  // Al abrir un diagrama (plantilla, archivo, nuevo): si trae meta.view y el usuario no ha elegido otra vista en esta sesión, se respeta;
  // si no, la última que eligió (guardada) o la de config.js. Deshacer, versiones y editores no la cambian.
  const adoptMetaView = m => { if (!S.viewChosen) S.viewKey = viewKey(m.meta?.view || store.get('view')); };

  /* ---------- niveles C4: abrir, salir, marco de límite y fantasmas del exterior ---------- */
  // Abre el diagrama interno de un nodo (null = nivel superior). Las posiciones de cada nivel son independientes.
  function setScope(id, opts = {}) {
    id = id && S.model.nodes.some(n => n.id === id) ? id : null;
    if (id === S.scope) { if (opts.fit) fitView(); return id; }
    stopPlay(); cancelConnect();
    $('.item-edit')?.blur();
    S.scope = id; S.flow = null; S.hover = null;
    store.set('scope', id);
    if (!opts.keepSel) S.sel = null;
    if (S.path) clearPath();
    refreshView();
    updateMeta();
    viewport.classList.remove('xs-enter'); void viewport.getBoundingClientRect(); viewport.classList.add('xs-enter');
    viewport.addEventListener('animationend', () => viewport.classList.remove('xs-enter'), { once: true });
    if (opts.fit !== false) fitView(opts.fit !== 'instant');
    return id;
  }
  const scopeUp = () => { if (S.scope) setScope(scopeNode()?.in || null); };
  // Abre el diagrama interno del nodo; si está vacío, entra igualmente y avisa de cómo empezarlo
  function openInner(id) {
    const n = S.model.nodes.find(x => x.id === id);
    if (!n) return false;
    const empty = !innerCount(id);
    setScope(id);
    if (empty) toast(T('c4.emptyHint', { name: n.label }), 3600);
    return true;
  }
  // La selección puede estar en otro nivel (un hallazgo, un vecino del inspector, el diff de versiones…): se abre ese nivel
  function revealScope(sel) {
    if (!sel || !S.model) return;
    const m = S.model, o = sel.kind === 'node' ? m.nodes.find(x => x.id === sel.id) : sel.kind === 'group' ? m.groups.find(x => x.id === sel.id)
      : sel.kind === 'note' ? m.notes.find(x => x.id === sel.id) : sel.kind === 'zone' ? m.zones.find(x => x.id === sel.id)
      : sel.kind === 'edge' ? m.nodes.find(x => x.id === m.edges.find(e => e.id === sel.id)?.from) : null;
    if (o && scopeId(o) !== S.scope) setScope(scopeId(o), { fit: false, keepSel: true });
  }
  // Migas de pan: «Superior › Sistema › Contenedor» y el nivel C4 en el que se está
  function renderCrumbs() {
    const box = $('#stage-scope');
    if (!box || !S.model) return;
    const show = !!S.scope || hasLevels();
    $('#empty-scope').hidden = !S.scope || scopeModel().nodes.length > 0;
    box.hidden = !show;
    if (!show) { box.innerHTML = ''; return; }
    const path = scopePath(S.scope), crumbs = [{ id: '', label: T('c4.top') }, ...path.map(id => ({ id, label: scopeNode(id).label }))], last = crumbs.length - 1;
    box.setAttribute('aria-label', T('c4.crumbs'));
    box.innerHTML = crumbs.map((c, i) => `${i ? '<span class="sep" aria-hidden="true">›</span>' : ''}<button class="crumb${i === last ? ' on' : ''}" data-scope="${esc(c.id)}"${i === last ? ' aria-current="location"' : ''} title="${esc(c.label)}">${esc(c.label)}</button>`).join('')
      + `<span class="lvl" title="${esc(T('c4.level.tip'))}">L${levelOf()} · ${esc(levelName(levelOf()))}</span>`;
  }
  $('#stage-scope').addEventListener('click', ev => { const b = ev.target.closest('[data-scope]'); if (b && !b.classList.contains('on')) setScope(b.dataset.scope || null); });

  // Marco de límite (C4) alrededor de lo del nivel abierto y tarjetas fantasma de lo que queda fuera pero se conecta con ello.
  // Es solo dibujo (no se guarda): va en el SVG para que se exporte.
  function drawScopeFrame() {
    L.scope.textContent = ''; VW.xs = null;
    const nd = scopeNode();
    if (!nd) return;
    const m = S.model, sm = scopeModel(), collapse = vc().groups === 'collapse-top';
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (x, y, w, h) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h); };
    sm.nodes.forEach(n => add(n.x, n.y, R.width.get(n.id) || C.node.width, nodeBoxH(n)));
    sm.groups.forEach(g => { const b = R.gbox.get(g.id); if (b) add(b.x, b.y, b.w, b.h); });
    const PAD = 44, LBL = 26, kind = c4Label(nd.c4), name = `${nd.label}${kind ? ` [${kind}]` : ''}`;
    const nameW = Math.ceil(textW(name, '700 12.5px')) + 36;
    let fr = x0 === Infinity ? { x: 0, y: 0, w: 560, h: 260 } : { x: x0 - PAD, y: y0 - PAD - LBL, w: x1 - x0 + 2 * PAD, h: y1 - y0 + 2 * PAD + LBL };
    if (fr.w < nameW) { fr.x -= (nameW - fr.w) / 2; fr.w = nameW; }
    const frame = el('g', { class: 'xs-frame' }, L.scope);
    el('rect', { class: 'xs-frame-box', x: fr.x, y: fr.y, width: fr.w, height: fr.h, rx: 18 }, frame);
    el('text', { class: 'xs-frame-label', x: fr.x + 18, y: fr.y + 24 }, frame).textContent = fitText(name, '700 12.5px', fr.w - 36);
    el('title', null, frame).textContent = name;
    // Fantasmas: lo de fuera conectado con algo de dentro (conexión entre niveles) y los vecinos del propio nodo en su nivel
    const inner = new Set(sm.nodes.map(n => n.id)), byId = new Map(m.nodes.map(n => [n.id, n])), ghosts = new Map(), links = new Map();
    const link = (gid, target, e, out) => { // out: la conexión sale del interior (o del marco) hacia el fantasma
      if (!ghosts.has(gid)) ghosts.set(gid, { n: byId.get(gid), inc: false });
      if (!out) ghosts.get(gid).inc = true;
      const k = `${gid}|${target || '*'}|${out ? 1 : 0}`, cur = links.get(k);
      if (cur) { if (e.label && !cur.label) cur.label = e.label; cur.both ||= !!e.both; return; }
      links.set(k, { gid, target, out, label: e.label || '', both: !!e.both });
    };
    m.edges.forEach(e => {
      const a = inner.has(e.from), b = inner.has(e.to);
      if (a === b) return;
      const ext = a ? e.to : e.from;
      if (ext === nd.id || !byId.has(ext)) return;
      link(ext, a ? e.from : e.to, e, a);
    });
    m.edges.forEach(e => {
      if (e.from !== nd.id && e.to !== nd.id) return;
      const other = byId.get(e.from === nd.id ? e.to : e.from);
      if (other && other.id !== nd.id && scopeId(other) === scopeId(nd)) link(other.id, null, e, e.from === nd.id);
    });
    const GAP = 110, ROW = H + 26, MAXG = 8, sides = { l: [], r: [] };
    ghosts.forEach(g => (g.inc ? sides.l : sides.r).push(g));
    const rects = new Map(), more = [];
    [['l', sides.l], ['r', sides.r]].forEach(([s, list]) => {
      const shown = list.slice(0, MAXG), top = fr.y + fr.h / 2 - shown.length * ROW / 2 + 13;
      shown.forEach((g, i) => {
        const w = nodeWidth(g.n);
        rects.set(g.n.id, { x: s === 'l' ? fr.x - GAP - w : fr.x + fr.w + GAP, y: top + i * ROW, w, h: H });
      });
      if (list.length > shown.length) more.push({ s, k: list.length - shown.length, y: top + shown.length * ROW });
    });
    const target = id => { const n = id && inner.has(id) && !VW.hideNodes.has(id) ? byId.get(id) : null; return n ? { x: n.x, y: n.y, w: R.width.get(n.id) || nodeWidth(n), h: H } : fr; };
    // Tarjetas fantasma y etiquetas ya colocadas: cada etiqueta busca el hueco que menos las pisa
    const cards = [...rects.values()].map(r => ({ x0: r.x - 4, x1: r.x + r.w + 4, y0: r.y - 4, y1: r.y + r.h + 4 })), labelBoxes = [];
    const over = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
    links.forEach(l => {
      const gr = rects.get(l.gid);
      if (!gr || collapse) return;
      const t = target(l.target), A = l.out ? t : gr, B = l.out ? gr : t;
      const d = m.routing === 'elbow' ? elbowPath(A, B, 0, []) : curvePath(A, B, 0);
      const g = el('g', { class: 'xs-edge' }, L.scope), line = el('path', { class: 'xs-edge-line', d }, g);
      el('path', { class: 'xs-edge-arrow', d: arrowD(line, line.getTotalLength(), l.both) }, g);
      if (l.label) {
        const txt = fitText(String(l.label).split('\n')[0], FONT.edge, 150), len = line.getTotalLength(), w = Math.ceil(textW(txt, FONT.edge)) + 10;
        const boxAt = (p, dy = 0) => ({ x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y - 15 + dy, y1: p.y + 4 + dy });
        // Posiciones a lo largo de la línea y desplazadas en vertical; gana la de menor solape (pisar otra etiqueta pesa más que pisar una tarjeta)
        let pos = null, best = Infinity;
        for (const dy of [0, -15, 15, -30, 30, -45, 45]) for (const f of [0.5, 0.35, 0.65, 0.25, 0.75, 0.18, 0.82]) {
          const p = line.getPointAtLength(len * f), bx = boxAt(p, dy);
          const sc = labelBoxes.reduce((a, o) => a + 4 * over(bx, o), 0) + cards.reduce((a, o) => a + over(bx, o), 0) + Math.abs(dy) * 0.5 + Math.abs(f - 0.5) * 20;
          if (sc < best) { best = sc; pos = { x: p.x, y: p.y + dy }; }
        }
        labelBoxes.push(boxAt(pos));
        el('text', { class: 'xs-edge-label', x: pos.x, y: pos.y - 4 }, g).textContent = txt;
      }
    });
    rects.forEach((r, id) => {
      const n = byId.get(id), g = el('g', { class: 'xs-ghost', 'data-xs': id, transform: `translate(${r.x} ${r.y})` }, L.scope);
      g.style.setProperty('--c', nodeColor(n));
      el('rect', { class: 'xs-ghost-card', width: r.w, height: r.h, rx: C.node.radius }, g);
      const where = scopePath(scopeId(n)).map(x => byId.get(x)?.label).filter(Boolean).join(' › '), tag = c4Label(n.c4);
      const sub = [tag ? `[${tag}]` : '', where].filter(Boolean).join(' · ');
      el('text', { class: 'xs-ghost-name', x: 16, y: sub ? r.h / 2 - 3 : r.h / 2 + 5 }, g).textContent = fitText(n.label, FONT.label, r.w - 32);
      if (sub) el('text', { class: 'xs-ghost-sub', x: 16, y: r.h / 2 + 14 }, g).textContent = fitText(sub, FONT.sub, r.w - 32);
      el('title', null, g).textContent = `${n.label}${where ? ` · ${where}` : ''}\n${T('c4.ghost.tip')}`;
    });
    more.forEach(o => {
      const w = C.node.width;
      el('text', { class: 'xs-ghost-sub', x: o.s === 'l' ? fr.x - GAP - w + 16 : fr.x + fr.w + GAP + 16, y: o.y + 14 }, L.scope).textContent = T('c4.ghost.more', o.k);
    });
    VW.xs = { frame: fr, ghosts: [...rects.values()] };
  }

  /* ---------- niveles C4: mover entre niveles ---------- */
  // Mueve nodos al diagrama interno de `target` (id de un nodo; null = nivel superior). Los grupos que quedan enteros viajan con ellos;
  // las conexiones los siguen solas. Los nodos se recolocan junto a lo que ya hay en el nivel de destino.
  function moveToScope(ids, target) {
    const m = S.model, set = new Set(ids), nodes = m.nodes.filter(n => set.has(n.id));
    target = target || null;
    if (!nodes.length) return false;
    if (target && (set.has(target) || innerDeep(ids).has(target) || !m.nodes.some(n => n.id === target))) return false;
    if (nodes.every(n => scopeId(n) === target)) return false;
    pushHistory();
    // Un grupo viaja si todos sus nodos se mueven; si no, el nodo sale de su grupo
    const gmove = new Set(m.groups.filter(g => { const mem = m.nodes.filter(n => inGroup(n, g.id)); return mem.length && mem.every(n => set.has(n.id)); }).map(g => g.id));
    const rest = m.nodes.filter(n => scopeId(n) === target && !set.has(n.id));
    const bx = Math.min(...nodes.map(n => n.x)), by = Math.min(...nodes.map(n => n.y));
    const dx = rest.length ? snap(Math.max(...rest.map(n => n.x + (R.width.get(n.id) || nodeWidth(n)))) + 80 - bx) : snap(-bx);
    const dy = rest.length ? snap(Math.min(...rest.map(n => n.y)) - by) : snap(-by);
    nodes.forEach(n => {
      n.x += dx; n.y += dy;
      if (target) n.in = target; else delete n.in;
      if (n.group && !gmove.has(n.group)) delete n.group;
    });
    m.groups.forEach(g => {
      if (!gmove.has(g.id)) return;
      if (target) g.in = target; else delete g.in;
      if (g.parent && !gmove.has(g.parent)) delete g.parent;
    });
    S.sel = null; S.hover = null;
    changed(true);
    renderInspector();
    toast(T('c4.moved', { n: nodes.length, where: target ? m.nodes.find(n => n.id === target).label : T('c4.top') }));
    return true;
  }
  const moveUp = () => { if (S.scope && selIds().length) moveToScope(selIds(), scopeNode()?.in || null); };
  // Sección «Niveles C4» del inspector (nodo o varios): tipo C4, abrir el diagrama interno y mover entre niveles
  function c4Field(items) {
    const list = [].concat(items), one = list.length === 1 && list[0], kinds = new Set(list.map(n => n.c4 || '')), k1 = kinds.size === 1 ? [...kinds][0] : null;
    const sib = scopeModel().nodes.filter(n => !list.some(x => x.id === n.id)), inner = one ? innerCount(one.id) : 0;
    return `<div class="c4-box">
      <label>${T('c4.label')}<select data-field="c4">${k1 == null ? `<option value="__mixed" selected>${T('insp.mixed')}</option>` : ''}<option value=""${k1 === '' ? ' selected' : ''}>—</option>${C4_KINDS.map(k => `<option value="${k}"${k1 === k ? ' selected' : ''}>${esc(c4Label(k))}</option>`).join('')}</select></label>
      <div class="insp-actions" style="margin-top:0">
        ${one ? `<button class="btn" data-act="c4open" title="${esc(T('c4.open.tip'))}">${T(inner ? 'c4.open' : 'c4.create')}${inner ? ` · ${inner}` : ''}</button>` : ''}
        ${S.scope ? `<button class="btn" data-act="c4up">${T('c4.moveUp')}</button>` : ''}
      </div>
      ${sib.length ? `<label>${T('c4.moveInto')}<select data-c4-into><option value="">—</option>${sib.map(n => `<option value="${esc(n.id)}">${esc(n.label)}</option>`).join('')}</select></label>` : ''}
    </div>`;
  }

  /* ---------- niveles C4: exportar todos los niveles ---------- */
  // Ejecuta fn(nivel, i) en cada nivel con contenido SIN guardar nada; al final restaura el nivel, la vista y la selección
  async function eachScope(list, fn) {
    const saved = { scope: S.scope, sel: S.sel, view: { ...S.view } };
    viewBusy = true;
    stopPlay(); clearPath();
    try {
      for (let i = 0; i < list.length; i++) {
        setScope(list[i].id, { fit: false });
        await fn(list[i], i);
      }
    } finally {
      viewBusy = false;
      setScope(saved.scope, { fit: false });
      select(saved.sel);
      Object.assign(S.view, saved.view); applyView();
    }
  }
  // Un archivo por nivel con contenido (<título>-nivel-<ruta>.png|svg): el superior y cada nodo con diagrama interno
  async function exportLevels(format = 'png') {
    format = format === 'svg' ? 'svg' : 'png';
    if (viewBusy || P || !S.model.nodes.length) return false;
    const list = scopeList().filter(s => s.nodes), slug = s => (s.id ? s.path.map(id => fold(S.model.nodes.find(n => n.id === id)?.label || id).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || id).join('-') : 'top');
    if (list.length < 2) { toast(T('c4.noLevels'), 3000); return 0; }
    let done = 0;
    try {
      await eachScope(list, async (s, i) => {
        toast(T('c4.progress', { i: i + 1, n: list.length, name: s.label }), 60000);
        const out = buildSVG(), suffix = `${T('c4.file')}-${slug(s)}`;
        if (format === 'svg') download(out.str, fileName('svg', suffix), 'image/svg+xml');
        else {
          const blob = await pngBlob(out);
          if (!blob) throw new Error('png');
          download(blob, fileName('png', suffix));
        }
        done++;
        await new Promise(r => setTimeout(r, 350));
      });
    } catch { toast(T('toast.pngFail'), 3200); return done; }
    toast(T('c4.done', done), 4200);
    return done;
  }
  // Importar infraestructura como código estando dentro de un nivel: se añade a ese nivel (no sustituye el diagrama)
  function importIntoScope(raw) {
    const d = normalize(clone(raw));
    ensurePositions(d);
    const m = S.model, used = new Set([...m.nodes, ...m.edges, ...m.groups, ...m.notes, ...m.zones].map(x => x.id)), map = new Map();
    const fresh = id => { let v = String(id); while (used.has(v)) v += '_'; used.add(v); return v; };
    [...d.groups, ...d.nodes].forEach(x => map.set(x.id, fresh(x.id)));
    const rest = scopeModel().nodes, ox = rest.length ? Math.max(...rest.map(n => n.x + (R.width.get(n.id) || nodeWidth(n)))) + 100 - Math.min(...d.nodes.map(n => n.x)) : 0, oy = rest.length ? Math.min(...rest.map(n => n.y)) - Math.min(...d.nodes.map(n => n.y)) : 0;
    pushHistory();
    d.groups.forEach(g => { const o = { ...g, id: map.get(g.id), in: S.scope }; if (o.parent) o.parent = map.get(o.parent); m.groups.push(o); });
    d.nodes.forEach(n => { const o = { ...n, id: map.get(n.id), in: S.scope, x: snap(n.x + ox), y: snap(n.y + oy) }; if (o.group) o.group = map.get(o.group); const k = c4Default(S.scope); if (k && !o.c4) o.c4 = k; m.nodes.push(o); });
    d.edges.forEach(e => m.edges.push({ ...e, id: fresh(e.id), from: map.get(e.from), to: map.get(e.to) }));
    changed(true);
    fitView();
    return d.nodes.length;
  }

  /* ---------- vista Contexto: cajas cerradas y conexiones agregadas (solo dibujo; el modelo no cambia) ---------- */
  function updateContext() {
    L.ctx.textContent = '';
    VW.ctxBoxes = new Map(); VW.ctxEdges = new Map(); VW.flows = new Map();
    if (vc().groups !== 'collapse-top') { S.flow = null; return syncViewUI(); }
    const m = S.model, gmap = new Map(m.groups.map(g => [g.id, g])), byId = new Map(m.nodes.map(n => [n.id, n]));
    const topOf = gid => { let g = gmap.get(gid), i = 0; while (g?.parent && gmap.has(g.parent) && i++ < 50) g = gmap.get(g.parent); return g; };
    // Representante visible de cada nodo: la caja cerrada de su grupo de primer nivel, o él mismo
    const reps = new Map(), repOf = new Map();
    scopeModel().nodes.filter(n => !VW.hideNodes.has(n.id)).forEach(n => {
      const tg = n.group && topOf(n.group), b = tg && R.gbox.get(tg.id), k = b ? `g:${tg.id}` : `n:${n.id}`;
      // La caja cerrada es una tarjeta compacta centrada en el centro del grupo (no del tamaño del grupo)
      const card = b && { w: Math.min(b.w, 300), h: Math.min(b.h, 128) };
      if (card) { card.x = b.x + (b.w - card.w) / 2; card.y = b.y + (b.h - card.h) / 2; }
      if (!reps.has(k)) reps.set(k, b ? { k, g: tg, r: card, ids: [], color: colorVar(tg.color) || 'var(--muted)', name: tg.label } : { k, n, r: { x: n.x, y: n.y, w: R.width.get(n.id), h: H }, ids: [], color: nodeColor(n), name: n.label });
      reps.get(k).ids.push(n.id);
      repOf.set(n.id, reps.get(k));
    });
    reps.forEach(rp => {
      if (!rp.g) return;
      const b = rp.r, g = rp.g, root = el('g', { class: 'group ctx-box', 'data-id': g.id }, L.ctx);
      root.style.setProperty('--c', rp.color);
      el('rect', { class: 'ctx-rect', x: b.x, y: b.y, width: b.w, height: b.h, rx: C.group.radius }, root);
      // Tipos principales de lo que contiene (los más frecuentes), si caben
      const cnt = new Map();
      rp.ids.forEach(id => { const t = typeLabel(byId.get(id).type); cnt.set(t, (cnt.get(t) || 0) + 1); });
      const types = b.h >= 120 ? fitText([...cnt].sort((x, y) => y[1] - x[1]).slice(0, 3).map(x => x[0]).join(' · '), FONT.sub, b.w - 24) : '';
      const info = iconInfo(g.icon), lines = wrapText(g.label, FONT.ctx, b.w - 32), LH = 20, ih = info && b.h >= 100 ? 46 : 0;
      const y0 = b.y + (b.h - (ih + lines.length * LH + 18 + (types ? 16 : 0))) / 2, cx = b.x + b.w / 2;
      if (ih) {
        el('rect', { class: 'node-icon-tile', x: cx - 20, y: y0, width: 40, height: 40, rx: 10 }, root);
        el('image', { href: info.src, x: cx - 16, y: y0 + 4, width: 32, height: 32 }, root);
      }
      lines.forEach((l, i) => { el('text', { class: 'ctx-name', x: cx, y: y0 + ih + 15 + i * LH }, root).textContent = l; });
      el('text', { class: 'ctx-count', x: cx, y: y0 + ih + lines.length * LH + 12 }, root).textContent = T('ctx.components', rp.ids.length);
      if (types) el('text', { class: 'ctx-count ctx-types', x: cx, y: y0 + ih + lines.length * LH + 28 }, root).textContent = types;
      el('title', null, root).textContent = `${g.label} · ${T('ctx.components', rp.ids.length)}`;
      VW.ctxBoxes.set(g.id, { g: root, ids: rp.ids, card: b });
    });
    // Una conexión por par de representantes: las internas de una caja se ocultan; ida y vuelta = bidireccional
    const agg = new Map();
    m.edges.forEach(e => {
      const P = repOf.get(e.from), Q = repOf.get(e.to);
      if (!P || !Q || P === Q) return;
      const fwd = P.k < Q.k, key = fwd ? `${P.k}|${Q.k}` : `${Q.k}|${P.k}`;
      let x = agg.get(key);
      if (!x) agg.set(key, x = { key, a: fwd ? P : Q, b: fwd ? Q : P, ab: 0, ba: 0, edges: [] });
      x.edges.push(e);
      if (fwd) x.ab++; else x.ba++;
      if (e.both) { if (fwd) x.ba++; else x.ab++; }
    });
    const rects = [...reps.values()].map(rp => rp.r);
    agg.forEach(x => {
      const both = x.ab > 0 && x.ba > 0, [A, B] = x.ab ? [x.a, x.b] : [x.b, x.a], list = x.edges, one = list.length === 1;
      const sts = new Set(list.map(e => edgeKey(e.style))), st = sts.size === 1 ? [...sts][0] : 'sync', cfg = edgeStyleOf(st);
      const wt = maxWeight(list), mu = EDGE_W[wt] || 1; // el peso del conjunto = el mayor de sus conexiones
      const insecure = list.some(e => isInsecure(e, id => byId.get(id)));
      const g = el('g', { class: `edge ctx-edge ${edgeCls(st)}${cfg.dash ? ' edge-dashed' : ''}${wt ? ` w-${wt}` : ''}${insecure ? ' insecure' : ''}`, 'data-key': x.key }, L.ctx);
      g.style.setProperty('--c', (one && colorVar(list[0].color)) || (sts.size === 1 && colorVar(cfg.color)) || A.color);
      g.style.setProperty('--w', `${+(cfg.width * mu + (one ? 0 : Math.min(2.4, Math.log2(list.length) * 0.7))).toFixed(2)}px`);
      const d = m.routing === 'elbow' ? elbowPath(A.r, B.r, 0, rects.filter(o => o !== A.r && o !== B.r), 0) : curvePath(A.r, B.r, 0);
      const hit = el('path', { class: 'edge-hit', d }, g), line = el('path', { class: 'edge-line', d }, g);
      if (cfg.dash) {
        const dash = dashFor(cfg, mu);
        line.setAttribute('stroke-dasharray', dash);
        const dist = dash.split(' ').reduce((sum, q) => sum + (+q || 0), 0) * 4;
        g.style.setProperty('--dash-to', `${-dist}px`);
        g.style.setProperty('--dash-dur', `${(dist / (C.animation.particleSpeed * 0.5)).toFixed(2)}s`);
      }
      const len = line.getTotalLength();
      el('path', { class: 'edge-arrow', d: arrowD(line, len, both, arrowK(mu)) }, g);
      const txt = one ? list[0].label : T('ctx.flows', list.length);
      if (txt) {
        const lines = String(txt).split('\n'), LH = 14, lw = Math.max(...lines.map(l => textW(l, FONT.edge))) + 16, ph = Math.max(20, lines.length * LH + 6), mp = line.getPointAtLength(len / 2);
        const lab = el('g', { class: 'edge-label', transform: `translate(${mp.x} ${mp.y})` }, g);
        el('rect', { x: -lw / 2, y: -ph / 2, width: lw, height: ph, rx: Math.min(10, ph / 2) }, lab);
        const tx = el('text', { x: 0, y: 4 - (lines.length - 1) * LH / 2, 'text-anchor': 'middle' }, lab);
        lines.forEach((l, i) => { el('tspan', i ? { x: 0, dy: LH } : null, tx).textContent = l; });
      }
      VW.flows.set(x.key, { A, B, both, edges: list });
      VW.ctxEdges.set(x.key, { g, ids: list.map(e => e.id), hit });
    });
    if (S.flow && !VW.flows.has(S.flow)) { S.flow = null; renderInspector(); }
    ctxMark();
    syncViewUI();
  }
  // Estado de las cajas y conexiones agregadas: foco, selección, filtro y comparación (como los elementos reales)
  function ctxMark() {
    const f = HL.f, r = HL.fr, s = S.sel, d = S.compare?.diff;
    const chg = d ? new Set([...d.nodes.added, ...d.nodes.changed.map(c => c.item)].map(n => n.id)) : null;
    VW.ctxBoxes.forEach((b, id) => {
      b.g.classList.toggle('lit', !!f && b.ids.some(x => f.nodes.has(x)));
      b.g.classList.toggle('sel', s?.kind === 'group' && s.id === id);
      b.g.classList.toggle('fdim', !!r && !r.groups.has(id));
      b.g.classList.toggle('diff-chg', !!chg && b.ids.some(x => chg.has(x)));
    });
    VW.ctxEdges.forEach((e, key) => {
      e.g.classList.toggle('lit', !!f && e.ids.some(x => f.edges.has(x)));
      e.g.classList.toggle('sel', S.flow === key);
      e.g.classList.toggle('fdim', !!r && !e.ids.some(x => r.edges.has(x)));
    });
  }
  // Una conexión agregada se "selecciona" sin tocar S.sel: el inspector es de solo lectura
  function selectFlow(key) {
    S.sel = null; S.flow = key;
    if (S.path) clearPath();
    applyHighlight();
    renderInspector();
  }
  function flowInspector(box) {
    const fl = VW.flows.get(S.flow), wasHidden = box.hidden, nm = id => S.model.nodes.find(x => x.id === id), arrow = fl.both ? '↔' : '→';
    const rows = fl.edges.map(e => {
      const a = nm(e.from), b = nm(e.to);
      const info = [e.label ? String(e.label).replace(/\n/g, ' ') : '', dataTags(e).map(t => t.short).join(' '), e.encrypted === true ? T('enc.yes') : e.encrypted === false ? T('enc.no') : ''].filter(Boolean).join(' · ');
      return `<div class="conn" style="--c:${nodeColor(a)};cursor:default"><span class="dot"></span>${esc(a.label)} ${e.both ? '↔' : '→'} ${esc(b.label)}${info ? `<em>${esc(info)}</em>` : ''}</div>`;
    }).join('');
    box.innerHTML = head(fl.A.color, '', T('ctx.flow'), `${fl.A.name} ${arrow} ${fl.B.name}`) + `
      <p class="note">${T('ctx.flowNote')}</p>
      <div class="conns"><div class="conn-title">${T('ctx.flows', fl.edges.length)}</div>${rows}</div>
      <div class="insp-actions"><button class="btn" data-act="ctxfull">${T('ctx.flowFull')}</button></div>`;
    box.hidden = false;
    box.style.animation = wasHidden ? '' : 'none';
  }
  // Doble clic en una caja cerrada: pasa a la vista Completa y encuadra ese grupo
  function openGroupFull(gid) {
    setView('full');
    select({ kind: 'group', id: gid });
    fitBox(R.gbox.get(gid));
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
        r.phase = (r.phase + dt * C.animation.particleSpeed * f * (r.speed || 1) / r.len) % 1;
        const count = r.parts.length;
        r.parts.forEach((c, i) => {
          const t = (r.phase + i / count) % 1, p = r.line.getPointAtLength((r.e.both && i % 2 ? 1 - t : t) * r.len);
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
    if (vc().groups === 'collapse-top') { // Contexto: solo lo visible (tarjetas, nodos sueltos y conexiones agregadas)
      S.model.nodes.forEach(n => { if (!VW.hideNodes.has(n.id)) add(n.x, n.y, R.width.get(n.id) || C.node.width, H); });
      VW.ctxBoxes.forEach(b => { const q = b.card; add(q.x, q.y, q.w, q.h); });
      VW.ctxEdges.forEach(e => { try { const q = e.g.getBBox(); add(q.x, q.y, q.width, q.height); } catch { /* sin medir */ } });
    } else {
    S.model.nodes.forEach(n => { if (!VW.hideNodes.has(n.id)) add(n.x, n.y, R.width.get(n.id) || C.node.width, nodeBoxH(n)); });
    R.gbox.forEach((b, id) => { if (!VW.hideGroups.has(id)) add(b.x, b.y, b.w, b.h); });
    }
    [...(vc().notes ? scopeItems('notes') : []), ...(vc().zones ? scopeItems('zones') : [])].forEach(o => add(o.x, o.y, o.w, o.h));
    if (VW.xs) { const q = VW.xs.frame; add(q.x, q.y, q.w, q.h); VW.xs.ghosts.forEach(g => add(g.x, g.y, g.w, g.h)); } // marco de límite y fantasmas del nivel C4
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
  const save = debounce(() => { store.set('model', S.model); updateMeta(); renderVersions(); renderAdr(); renderReq(); renderRaid(); }, 250);

  const ORDER = {
    group: ['id', 'label', 'icon', 'color', 'parent', 'kind', 'owner', 'steward', 'team', 'costCenter', 'region', 'layer', 'controls', 'in', 'phase', 'until'],
    node: ['id', 'label', 'type', 'icon', 'sub', 'badge', 'group', 'color', 'x', 'y', 'cost', 'costPeriod', 'costYears', 'data', 'review', 'desc', 'owner', 'steward', 'team', 'costCenter', 'region', 'layer', 'exposure', 'backup', 'controls', 'in', 'c4', 'sla', 'rpo', 'rto', 'replicas', 'disposition', 'radar', 'effort', 'ref', 'iac', 'phase', 'until'],
    edge: ['id', 'from', 'to', 'label', 'style', 'weight', 'route', 'both', 'color', 'data', 'encrypted', 'datasets', 'latency', 'transferOk', 'threats', 'phase', 'until'],
    note: ['id', 'x', 'y', 'w', 'h', 'text', 'color', 'in'],
    zone: ['id', 'x', 'y', 'w', 'h', 'label', 'severity', 'desc', 'kind', 'trust', 'in'],
    requirement: ['id', 'title', 'kind', 'detail', 'priority', 'status', 'source', 'check', 'links'],
    decision: ['id', 'title', 'status', 'date', 'deciders', 'context', 'decision', 'consequences', 'supersededBy', 'area', 'criteria', 'options', 'chosen', 'links', 'history', 'signoffs'],
    raid: ['id', 'type', 'title', 'detail', 'owner', 'status', 'probability', 'impact', 'mitigation', 'validation', 'due', 'raised', 'links', 'history']
  };
  ORDER.phase = ['id', 'name', 'date', 'goal', 'extra'];
  ORDER.dataset = ['id', 'name', 'domain', 'layer', 'description', 'owner', 'steward', 'product', 'classes', 'format', 'freshness', 'volume', 'schema', 'quality', 'contract', 'phase'];
  ORDER.dsColumn = ['name', 'type', 'key', 'pii', 'nullable', 'desc'];
  ORDER.dsRule = ['rule', 'column', 'param', 'severity'];
  ORDER.dsContract = ['version', 'status', 'consumers', 'terms'];
  // Un conjunto con las claves en el orden canónico, también las de sus columnas, reglas, volumen y contrato (ordered = el ordenador de serialize)
  function dsOrdered(d, ordered) {
    const o = ordered(d, ORDER.dataset);
    if (o.schema) o.schema = o.schema.map(c => ordered(c, ORDER.dsColumn));
    if (o.quality) o.quality = o.quality.map(q => ordered(q, ORDER.dsRule));
    if (o.volume) o.volume = ordered(o.volume, ['perDay', 'retentionDays']);
    if (o.contract) o.contract = ordered(o.contract, ORDER.dsContract);
    return o;
  }
  ORDER.stakeholder = ['id', 'name', 'role', 'org', 'raci', 'versions', 'inactive'];
  ORDER.comment = ['id', 'on', 'author', 'date', 'text', 'status', 'internal', 'source', 'imp', 'was', 'replies'];
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
    if (m.formatVersion) head.unshift(`  "formatVersion": ${m.formatVersion}`);   // normalize siempre lo pone: todo JSON que escribe la app lleva su versión de formato
    if (m.direction) head.push(`  "direction": ${JSON.stringify(m.direction)}`);
    if (m.routing) head.push(`  "routing": ${JSON.stringify(m.routing)}`);
    if (m.layerNames === 'zones') head.push(`  "layerNames": "zones"`);
    if (m.docId) head.push(`  "docId": ${JSON.stringify(m.docId)}`);
    if (m.radar?.length) head.push(`  "radar": [\n${m.radar.map(e => '    ' + JSON.stringify(e)).join(',\n')}\n  ]`);
    if (m.phases?.length) head.push(arr('phases', m.phases, ORDER.phase));
    if (m.estimation) head.push(`  "estimation": ${JSON.stringify(m.estimation)}`);
    if (m.datasets?.length) head.push(`  "datasets": [\n${m.datasets.map(d => '    ' + line(dsOrdered(d, ordered))).join(',\n')}\n  ]`);
    if (m.edgeTypes?.length) head.push(`  "edgeTypes": ${JSON.stringify(m.edgeTypes)}`);
    if (m.dismissed && Object.keys(m.dismissed).length) head.push(`  "dismissed": ${JSON.stringify(m.dismissed)}`);
    if (m.deviations?.length) head.push(`  "deviations": ${JSON.stringify(m.deviations)}`);
    if (m.meta) head.push(`  "meta": ${JSON.stringify(m.meta)}`);
    const body = [...head, arr('groups', m.groups, ORDER.group), arr('nodes', m.nodes, ORDER.node), arr('edges', m.edges, ORDER.edge)];
    if (m.notes?.length) body.push(arr('notes', m.notes, ORDER.note));
    if (m.zones?.length) body.push(arr('zones', m.zones, ORDER.zone));
    if (m.decisions?.length) body.push(arr('decisions', m.decisions, ORDER.decision));
    if (m.requirements?.length) body.push(arr('requirements', m.requirements, ORDER.requirement));
    if (m.raid?.length) body.push(arr('raid', m.raid, ORDER.raid));
    if (m.stakeholders?.length) body.push(arr('stakeholders', m.stakeholders, ORDER.stakeholder));
    if (m.comments?.length) body.push(arr('comments', m.comments, ORDER.comment));
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
    // El texto siempre trae notas, zonas, fronteras y descartados (el texto es la fuente de verdad: borrarlos del texto los borra); el JSON, si omite notas o zonas, las conserva
    if (opts.fromEditor && S.model && raw && typeof raw === 'object') {
      if (!Array.isArray(raw.notes)) raw = { ...raw, notes: S.model.notes };
      if (!Array.isArray(raw.zones)) raw = { ...raw, zones: S.model.zones };
      if (!Array.isArray(raw.requirements) && S.model.requirements) raw = { ...raw, requirements: S.model.requirements }; // igual que las decisiones: el texto siempre las trae; el JSON, si omite la clave, las conserva
      if (!Array.isArray(raw.raid)) raw = { ...raw, raid: S.model.raid };   // el texto siempre trae el registro RAID; el JSON, si omite la clave, lo conserva
      if (!Array.isArray(raw.stakeholders) && S.model.stakeholders) raw = { ...raw, stakeholders: S.model.stakeholders };   // igual: el texto siempre trae los interesados; el JSON, si omite la clave, los conserva
      if (raw.docId == null && S.model.docId) raw = { ...raw, docId: S.model.docId };   // el texto no lleva el identificador del diagrama; el JSON, si omite la clave, lo conserva
      if (!Array.isArray(raw.comments) && S.model.comments) raw = { ...raw, comments: S.model.comments };   // el texto no lleva comentarios; el JSON, si omite la clave, los conserva
      if (opts.fromEditor === 'text' && S.model.estimation && raw.estimation == null) raw = { ...raw, estimation: S.model.estimation };   // los imprevistos y el trabajo extra de cada fase solo viven en el JSON: el texto no los lleva
      if (opts.fromEditor === 'text' && Array.isArray(raw.phases) && (S.model.phases || []).some(p => p.extra)) raw = { ...raw, phases: raw.phases.map(p => { const old = p && (S.model.phases || []).find(q => q.id === p.id); return old?.extra && !p.extra ? { ...p, extra: old.extra } : p; }) };
      if (opts.fromEditor === 'text' && !Array.isArray(raw.deviations) && S.model.deviations) raw = { ...raw, deviations: S.model.deviations };   // el texto no lleva las diferencias aceptadas con la infraestructura
      if (opts.fromEditor === 'text' && Array.isArray(raw.nodes) && S.model.nodes.some(n => n.iac)) { const ic = new Map(S.model.nodes.filter(n => n.iac).map(n => [n.id, n.iac])); raw = { ...raw, nodes: raw.nodes.map(n => (n && ic.has(n.id) && n.iac == null ? { ...n, iac: ic.get(n.id) } : n)) }; }   // el texto no lleva el enlace con la infraestructura: se conserva por id
      if (opts.fromEditor === 'text' && Array.isArray(raw.nodes) && S.model.nodes.some(n => n.ref)) { const rf = new Map(S.model.nodes.filter(n => n.ref).map(n => [n.id, n.ref])); raw = { ...raw, nodes: raw.nodes.map(n => (n && rf.has(n.id) && n.ref == null ? { ...n, ref: rf.get(n.id) } : n)) }; }   // el texto no lleva los enlaces entre diagramas: se conservan por id
      if (!Array.isArray(raw.radar) && S.model.radar) raw = { ...raw, radar: S.model.radar };   // el texto solo lleva radar=<id> por componente: las entradas propias del radar se conservan
      if (!Array.isArray(raw.datasets) && S.model.datasets) raw = { ...raw, datasets: S.model.datasets };   // el texto siempre trae los conjuntos de datos; el JSON, si omite la clave, los conserva
      if (!Array.isArray(raw.decisions)) raw = { ...raw, decisions: S.model.decisions }; // el texto siempre trae las decisiones (ADR; borrarlas del texto las borra); el JSON, si omite la clave, las conserva
    }
    // Archivos, guardado local y editor JSON pasan por las migraciones. No pasan el texto del editor, las plantillas, las versiones guardadas y el diagrama nuevo (opts.current): ya vienen en el formato actual
    if (opts.fromEditor === 'json' && raw && typeof raw === 'object' && raw.formatVersion == null) raw = { ...raw, formatVersion: FORMAT_VERSION };   // JSON pegado sin el campo: se da por actual
    if (!opts.current && opts.fromEditor !== 'text') {
      const mg = migrate(raw);
      raw = mg.raw;
      if (mg.newer) toast(T('toast.newerFormat', { v: mg.from, app: FORMAT_VERSION }), 9000);
    }
    S.model = normalize(raw);
    ensurePositions(S.model);
    if (opts.animate) S.phase = -1;   // otro diagrama: se ve todo (la fase elegida es de la vista, no del modelo)
    if (opts.animate && !opts.keepScope) S.scope = null;  // otro diagrama: nivel superior; deshacer, versiones y editores conservan el nivel si sigue existiendo
    if (S.scope && !S.model.nodes.some(n => n.id === S.scope)) S.scope = null;
    store.set('scope', S.scope);
    if (opts.animate) { adoptMetaView(S.model); S.flow = null; }
    S.sel = normSel(S.sel);
    if (S.sel && !selTarget()) S.sel = null;
    if (S.connecting && !S.model.nodes.some(n => n.id === S.connecting)) cancelConnect();
    render(!!opts.animate);
    S.model.nodes.forEach(n => posCache.set(n.id, { x: n.x, y: n.y }));
    if (S.sel && visibleSel(S.sel) !== S.sel) { S.sel = visibleSel(S.sel); applyHighlight(); }
    updateRouteButton();
    writeEditors(opts.fromEditor, !opts.fromEditor);
    renderInspector();
    renderAdr(true);
    renderReq(true);
    renderRaid(true);
    renderDs(true);
    save();
    updateUndoButtons();
    if (opts.fit) fitView(opts.fit !== 'instant');
  }

  // Tras cambiar el modelo desde el lienzo o el inspector
  function changed(structural = true) {
    if (S.path) clearPath();
    if (S.model.decisions?.length) pruneAdrLinks();
    if (S.model.requirements?.length) pruneReqLinks();
    if (S.model.raid?.length) pruneRaidLinks();
    if (S.model.comments?.length) { const cm = cleanComments(S.model.comments, S.model); if (cm.length) S.model.comments = cm; else delete S.model.comments; }   // destinos que ya no existen pasan a «general»
    if (S.model.datasets?.length) { const ds = cleanCatalog(S.model.datasets, S.model, dsHelpers()); if (ds.length) S.model.datasets = ds; else delete S.model.datasets; }   // consumidores y fase que ya no existen
    if (structural) render(false); else { updateGeometry(); applyCompare(); }
    syncEditor();
    save();
    updateUndoButtons();
    renderDs();
  }

  function updateMeta() {
    const m = S.model;
    { const nb = $('#cmt-n'); if (nb) { const n = cmOpen(m).length; nb.hidden = !n; nb.textContent = n > 99 ? '99+' : n; nb.title = T('cmt.badge', n); } }   // hilos sin resolver, junto al botón de comentarios
    $('#stage-h1').textContent = m.title;
    const costs = m.nodes.some(hasCost) ? `≈ ${money(round2(monthlyTotal(m.nodes)))}${T('cost.mo')}` : '';
    const byId = id => m.nodes.find(n => n.id === id), insecure = m.edges.filter(e => isInsecure(e, byId)).length;
    const xb = m.edges.filter(e => isXBorder(e, byId)).length;
    const open = m.nodes.filter(n => n.review && n.review.status !== 'resolved'), overdue = open.filter(n => reviewState(n.review) === 'overdue').length;
    const rz = m.zones.filter(z => z.kind !== 'trust'), zc = rz.filter(z => z.severity === 'critical').length;
    const zones = rz.length ? T('meta.zones', { n: rz.length, c: zc }) : '';
    const reviews = open.length ? T('meta.review', { n: open.length, o: overdue }) : '';
    refreshFindings();
    const nFind = FC.open.filter(f => f.source === 'rule').length;
    const sm = scopeModel(m);
    const pi = phaseNow(), pst = pi >= 0 ? phaseStats(m, pi, { monthly: x => monthlyTotal(x.nodes), findings: () => [] }) : null, psm = pst ? scopeModel(phaseModel(m, pi)) : null;
    const head = pst ? [T('phase.summary', { name: m.phases[pi].name, n: psm.nodes.length, cost: pst.cost ? `≈ ${money(round2(pst.cost))}${T('cost.mo')}` : '' }), T('meta.edges', psm.edges.length)] : [T('meta.nodes', sm.nodes.length), T('meta.edges', sm.edges.length), sm.groups.length ? T('meta.groups', sm.groups.length) : '', costs];
    $('#stage-meta').textContent = [...head, insecure ? T('meta.insecure', insecure) : '', xb ? T('meta.xborder', xb) : '', zones, reviews, nFind ? T('meta.findings', nFind) : ''].filter(Boolean).join(' · ');
    const t = $('#title');
    if (document.activeElement !== t) t.value = m.title;
    $('#empty').hidden = !!S.scope || sm.nodes.length > 0;
    renderCrumbs();
    const v = activeVersion(), pill = $('#stage-ver');
    pill.hidden = !v;
    if (v) {
      pill.style.setProperty('--c', verColor(v));
      pill.innerHTML = `<span class="dot"></span>${esc(verLabel(v))}${v.status !== 'draft' ? ` <b class="ver-status" style="--s:${VSTATUS[v.status]}">${esc(T(`ver.st.${v.status}`))}</b>` : ''}${isDirty(v) ? ` <small>· ${esc(T('ver.dirty'))}</small>` : ''}`;
    }
    document.title = `${m.title} · ${C.app.name}`;
    renderDocbar();
    renderPhaseBar();
  }

  /* ---------- ficha del documento al pie del lienzo (misma fuente que el cajetín exportado) ---------- */
  function renderDocbar() {
    const box = $('#docbar'), open = store.get('docbar', true), d = docInfo(), v = d.av;
    box.classList.toggle('open', open);
    $('#docbar-toggle').setAttribute('aria-expanded', open);
    $('#docbar-toggle').title = T(open ? 'doc.hide' : 'doc.show');
    $('#docbar-title').textContent = d.title;
    const pill = $('#docbar-pill');
    pill.hidden = !v;
    if (v) { pill.style.setProperty('--s', VSTATUS[v.status]); pill.textContent = `${verLabel(v)} · ${T(`ver.st.${v.status}`)}`; }
    const types = open ? legendTypes() : [], ex = open ? viewLegend() : null, sw = c => (Array.isArray(c) && c.length > 1 ? `linear-gradient(90deg,${c.join(',')})` : [].concat(c)[0]);
    // Leyenda compacta de la vista (solo si aporta algo): niveles, escala de calor, grupos visibles
    const vrows = ex ? [...ex.conn.map(r => `<li class="sw" style="--c:${esc(r.lock ? 'var(--muted)' : sw(r.color))}"><i></i>${esc(r.label)}</li>`),
      ...(ex.heat ? [`<li><i class="heat" style="background:linear-gradient(90deg,${esc(ex.heat.stops.join(','))})"></i>${esc(`${ex.heat.min} – ${ex.heat.max}`)}</li>`, `<li>${esc(`${T('leg.total')}: ${ex.heat.total}`)}</li>`] : []),
      ...(ex.costBy || []).map(o => `<li style="--c:var(--muted)"><i></i>${esc(`${o.label} · ${o.value}`)}</li>`),
      ...(ex.owners || []).map(o => `<li style="--c:${esc(o.color)}"><i></i>${esc(o.label)} <small>(${o.n})</small></li>`),
      ...(ex.groups ? [`<li class="sw" style="--c:var(--muted)"><i></i>${esc(ex.groups)}</li>`] : [])] : [];
    // Conjuntos de datos del diagrama: cada fila es un botón que muestra su linaje
    const dsRows = open ? datasetList().map(d => `<li><button class="ds-row" data-lin="${esc(d.name)}" title="${esc(T('lin.show', { name: d.name }))}"><span>${esc(d.name)}</span><small>${d.edges}</small></button></li>`) : [];
    // Equipos del diagrama (fuera de la vista Gobierno, que ya los muestra): al pulsar uno se filtra por él
    const teams = open && vc().emphasis !== 'owner' ? [...govTeams().values()] : [];
    const lay = open && vc().layers ? layerUsage() : [];
    const tzs = open && vc().zones ? S.model.zones.filter(z => z.kind === 'trust') : [];
    const det = (k, head, rows) => `<details class="docbar-leg" data-k="${k}"${store.get(k, false) ? ' open' : ''}><summary>${esc(head)} · ${rows.length}</summary><ul>${rows.join('')}</ul></details>`;
    $('#docbar-body').innerHTML = open ? `<dl>${d.info.map(([k, x]) => `<dt>${esc(k)}</dt><dd>${esc(x)}</dd>`).join('')}</dl>${types.length ? det('docbarLeg', T('leg.components'), types.map(r => `<li style="--c:${esc(r.color)}"><i></i>${esc(r.label)}</li>`)) : ''}${lay.length ? det('docbarLegL', T('leg.layersN'), lay.map(([k, ids]) => { const li = layerInfo(k); return `<li class="layer-row" data-layer="${esc(k)}" style="--c:${esc(li.color)}" title="${esc(T('layer.filter'))}"><i></i>${esc(li.label)}<b>${ids.length}</b></li>`; })) : ''}${tzs.length ? det('docbarLegZ', T('leg.trustN'), tzs.map(z => `<li class="sw" style="--c:var(--trust)"><i></i>${esc([z.label, z.trust].filter(Boolean).join(' · ') || T('trust.unnamed'))}</li>`)) : ''}${vrows.length ? det('docbarLegV', `${T('leg.view')}: ${viewLabel(S.viewKey)}`, vrows) : ''}${teams.length ? det('docbarLegT', T('leg.teams'), teams.map(t => `<li data-gov="${esc(t.kind)}" data-k="${esc(t.key)}" style="--c:${esc(t.color)}" title="${esc(T('flt.pill'))}"><i></i>${esc([t.key, t.owners.join(', ')].filter(Boolean).join(' · '))} <small>(${t.ids.length})</small></li>`)) : ''}${dsRows.length ? det('docbarLegD', T('lin.leg'), dsRows) : ''}` : '';
  }
  // Clic en un equipo de la leyenda: filtra por él (otro clic lo quita)
  $('#docbar-body').addEventListener('click', ev => {
    const li = ev.target.closest('li[data-gov]');
    if (!li) return;
    const s = li.dataset.gov, k = li.dataset.k, cur = S.filter[s] || [];
    setFilter(cur.length === 1 && cur[0] === k ? { ...S.filter, [s]: [] } : { ...S.filter, [s]: [k] });
  });
  function toggleDocbar() { store.set('docbar', !store.get('docbar', true)); renderDocbar(); }
  $('#docbar-toggle').addEventListener('click', toggleDocbar);
  $('#docbar-body').addEventListener('click', ev => { const b = ev.target.closest('button[data-lin]'); if (b) showLineage(b.dataset.lin); });
  // Clic en una capa de la leyenda: filtra por ella (otro clic igual lo quita)
  $('#docbar-body').addEventListener('click', ev => {
    const li = ev.target.closest('li[data-layer]');
    if (!li) return;
    const k = li.dataset.layer, cur = S.filter.layer || [];
    setFilter({ ...S.filter, layer: cur.length === 1 && cur[0] === k ? [] : [k] });
  });
  $('#docbar-body').addEventListener('toggle', ev => { if (ev.target.matches('details')) store.set(ev.target.dataset.k || 'docbarLeg', ev.target.open); }, true);

  /* ---------- filtros ("lentes"): atenúan lo que no coincide ---------- */
  // Filtro: { data: [clase | '@insecure'], review: ['open','overdue'], provider, category, group, cost: ['cost'] }
  // Dentro de una sección las fichas suman (O); entre secciones se combinan (Y)
  const FLT_SECTIONS = ['data', 'review', 'provider', 'category', 'group', 'cost', 'team', 'owner', 'steward', 'costCenter', 'region', 'layer', 'disposition', 'radar', 'compliance'];
  // Sección «radar»: «requiere atención» (anillo pausa o retirada, o soporte terminado o por terminar), un anillo por cada uno usado y «sin radar» si falta en algún componente
  const radarOptions = m => {
    if (!radarEntries(m).length) return [];
    const now = today(), infos = m.nodes.map(n => radarInfo(n, m, now)), used = new Set(infos.filter(Boolean).map(i => i.entry.ring));
    return [...(m.nodes.some(n => radarTags(n).length) ? [{ k: '@attn', label: T('radar.attn') }] : []), ...RD_KEYS.filter(k => used.has(k)).map(k => ({ k, label: rdRingInfo(k).label })), ...(used.size && infos.some(i => !i) ? [{ k: '@none', label: T('radar.noneFlt') }] : [])];
  };
  const providerOf = n => { const p = String(n.icon || '').split('/')[0]; return n.icon && ICONS[p] ? p : 'generic'; };
  const topGroups = m => m.groups.filter(g => !g.parent || !m.groups.some(x => x.id === g.parent));
  // Sección «región»: una ficha por jurisdicción usada (según la región efectiva) y «sin región» si falta en algún nodo
  function regionOptions(m) {
    const keys = new Set(m.nodes.map(n => jurOf(regionOf(n, m).value)?.key || '@none'));
    return [...Object.keys(JURS).filter(k => keys.has(k)).map(k => ({ k, label: JURS[k].short || k.toUpperCase() })), ...(keys.has('@none') ? [{ k: '@none', label: T('flt.regionNone') }] : [])];
  }
  // Fichas de capa: las que usa el diagrama (con el nombre del documento) y «Sin capa» si algún nodo no tiene
  function layerOptions(m) {
    const eff = m.nodes.map(n => layerOf(n).value), used = new Set([...eff, ...m.groups.map(g => g.layer)]);
    const opts = Object.keys(DL).filter(k => used.has(k)).map(k => ({ k, label: layerInfo(k).label }));
    return opts.length && eff.some(l => !l) ? [...opts, { k: '@none', label: T('flt.noLayer') }] : opts;
  }
  // Fichas disponibles en el diagrama actual: { sección: [{ k, label }] }
  function filterOptions(m = S.model) {
    const used = new Set([...m.nodes, ...m.edges].flatMap(x => x.data || []));
    const provs = new Set(m.nodes.map(providerOf)), cats = new Set(m.nodes.map(n => typeOf(n).category || 'Otros'));
    return {
      data: [...Object.keys(DATA).filter(k => used.has(k)), ...[...used].filter(k => !DATA[k])].map(k => ({ k, label: loc(DATA[k]?.short) || k.toUpperCase() }))
        .concat([{ k: '@insecure', label: T('flt.insecure') }, { k: '@xborder', label: T('flt.xborder') }]),
      review: [{ k: 'open', label: T('flt.open') }, { k: 'overdue', label: T('flt.overdue') }],
      provider: [...Object.keys(ICONS), 'generic'].filter(p => provs.has(p)).map(p => ({ k: p, label: p === 'generic' ? T('flt.generic') : ICONS[p].label })),
      category: categories().filter(c => cats.has(c)).map(c => ({ k: c, label: I.category(c) })),
      group: topGroups(m).map(g => ({ k: g.id, label: g.label })),
      cost: [{ k: 'cost', label: T('flt.cost') }],
      ...Object.fromEntries(GOV_FIELDS.map(f => [f, govFilterOpts(m, f)])),
      region: regionOptions(m),
      layer: layerOptions(m),
      disposition: Object.keys(MG).filter(k => m.nodes.some(n => n.disposition === k)).map(k => ({ k, label: mgInfo(k).label })).concat(m.nodes.some(n => n.disposition) && m.nodes.some(n => !n.disposition) ? [{ k: '@none', label: T('mig.none') }] : []),
      radar: radarOptions(m),
      compliance: cmpOptions(m)
    };
  }
  // Fichas de dueño / equipo…: valores efectivos (heredados) usados, y «Sin asignar» (solo dueño y equipo) si a algún nodo le falta
  function govFilterOpts(m, f) {
    const vals = m.nodes.map(n => govOf(n, f, m).value), set = [...new Set(vals.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const none = (f === 'owner' || f === 'team') && set.length && vals.some(v => !v);
    return [...set.map(v => ({ k: v, label: v })), ...(none ? [{ k: '@none', label: T('flt.unassigned') }] : [])];
  }
  // Deja solo fichas que existen; `insecure: true` y `cost: true` son atajos para la API
  function cleanFilter(raw, m = S.model) {
    const opts = filterOptions(m), out = {};
    raw = { ...raw };
    if (raw.insecure) raw.data = [].concat(raw.data || [], '@insecure');
    if (raw.cost === true) raw.cost = ['cost'];
    for (const s of FLT_SECTIONS) {
      const ok = new Set(opts[s].map(o => o.k)), list = [...new Set([].concat(raw[s] || []).map(String))].filter(k => ok.has(k));
      if (list.length) out[s] = list;
    }
    return out;
  }
  // ¿El nodo cumple el filtro? `ends` = extremos de las conexiones que cumplen la sección de datos
  function matches(n, f, ends = new Set()) {
    return FLT_SECTIONS.every(s => {
      const v = f[s];
      if (!v?.length) return true;
      if (s === 'data') return (n.data || []).some(k => v.includes(k)) || ends.has(n.id);
      if (s === 'review') return v.some(k => n.review && (k === 'open' ? n.review.status !== 'resolved' : reviewState(n.review) === 'overdue'));
      if (s === 'provider') return v.includes(providerOf(n));
      if (s === 'category') return v.includes(typeOf(n).category || 'Otros');
      if (s === 'group') return v.some(g => inGroup(n, g));
      if (GOV_FIELDS.includes(s)) { const e = govOf(n, s).value; return v.some(k => (k === '@none' ? !e : k === e)); }
      if (s === 'region') return v.includes(jurOf(regionOf(n).value)?.key || '@none');
      if (s === 'layer') { const l = layerOf(n).value; return v.some(k => (k === '@none' ? !l : k === l)); }
      if (s === 'disposition') return v.some(k => (k === '@none' ? !n.disposition : k === n.disposition));
      if (s === 'radar') { const i = radarInfo(n, S.model, today()); return v.some(k => (k === '@none' ? !i : k === '@attn' ? !!radarTags(n).length : i?.entry.ring === k)); }
      if (s === 'compliance') return cmpMatch(n, v);
      return hasCost(n);
    });
  }
  // Lo que se queda normal: conjuntos de nodos, conexiones y grupos (null = sin filtro)
  function filterResult(m = S.model, f = S.filter) {
    if (!f || !Object.keys(f).length) return null;
    const byId = id => m.nodes.find(n => n.id === id), ends = new Set();
    if (f.data?.length) m.edges.forEach(e => {
      if (f.data.some(k => k === '@insecure' ? isInsecure(e, byId) : k === '@xborder' ? isXBorder(e, byId) : (e.data || []).includes(k))) { ends.add(e.from); ends.add(e.to); }
    });
    const nodes = new Set(m.nodes.filter(n => matches(n, f, ends)).map(n => n.id));
    return {
      nodes,
      edges: new Set(m.edges.filter(e => nodes.has(e.from) && nodes.has(e.to)).map(e => e.id)),
      groups: new Set(m.groups.filter(g => m.nodes.some(n => nodes.has(n.id) && inGroup(n, g.id))).map(g => g.id))
    };
  }
  S.filter = store.get('filter', {});
  const filterMenu = $('#filter-menu'), fltPill = $('#stage-flt');
  function applyFilter() {
    S.filter = cleanFilter(S.filter);
    store.set('filter', S.filter);
    const r = filterResult();
    HL.fr = r;
    svg.classList.toggle('filtering', !!r);
    R.nodes.forEach((g, id) => g.classList.toggle('fdim', !!r && !r.nodes.has(id)));
    R.edges.forEach((e, id) => e.g.classList.toggle('fdim', !!r && !r.edges.has(id)));
    R.groups.forEach((e, id) => e.g.classList.toggle('fdim', !!r && !r.groups.has(id)));
    ctxMark();
    $('#btn-filter').classList.toggle('has-dot', !!r);
    fltPill.hidden = !r;
    if (r) {
      const opts = filterOptions(), names = FLT_SECTIONS.flatMap(s => (S.filter[s] || []).map(k => opts[s].find(o => o.k === k)?.label || k));
      fltPill.innerHTML = `${esc(T('flt.pill'))}: ${esc(names.join(' · '))} · <b>${esc(T('flt.count', { n: r.nodes.size, t: S.model.nodes.length }))}</b><button class="icon-btn" data-flt="clear" title="${esc(T('flt.clear'))}" aria-label="${esc(T('flt.clear'))}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>`;
    }
    if (filterMenu.open) renderFilterMenu();
  }
  function setFilter(f) { S.filter = f || {}; applyFilter(); }
  const clearFilter = () => setFilter({});
  function renderFilterMenu() {
    const opts = filterOptions(), box = $('#filter-body');
    box.innerHTML = FLT_SECTIONS.filter(s => opts[s].length).map(s => `<div class="flt-sec"><div class="cat">${esc(T(`flt.sec.${s}`))}</div><div class="flt-chips">${
      opts[s].map(o => `<button class="flt-chip${(S.filter[s] || []).includes(o.k) ? ' on' : ''}" data-s="${s}" data-k="${esc(o.k)}" aria-pressed="${(S.filter[s] || []).includes(o.k)}">${esc(o.label)}</button>`).join('')}</div></div>`).join('');
    $('#filter-clear').hidden = !Object.keys(S.filter).length;
  }
  function placeFilterMenu() {
    const r = filterMenu.querySelector('summary').getBoundingClientRect(), pop = filterMenu.querySelector('.menu-pop');
    pop.style.top = `${r.bottom}px`;
    pop.style.right = `${Math.max(8, innerWidth - r.right)}px`;
  }
  filterMenu.addEventListener('toggle', () => { if (filterMenu.open) { renderFilterMenu(); placeFilterMenu(); } });
  document.addEventListener('pointerdown', ev => { if (filterMenu.open && !filterMenu.contains(ev.target)) filterMenu.open = false; });
  filterMenu.addEventListener('click', ev => {
    if (ev.target.closest('#filter-clear')) return clearFilter();
    const b = ev.target.closest('.flt-chip');
    if (!b) return;
    const { s, k } = b.dataset, cur = S.filter[s] || [];
    setFilter({ ...S.filter, [s]: cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k] });
  });
  fltPill.addEventListener('click', ev => { if (ev.target.closest('[data-flt="clear"]')) clearFilter(); });

  /* ---------- fases: barra del lienzo, qué se ve en cada fase y gestor (pestaña Versiones) ---------- */
  // S.phase = fase elegida (-1 = todas): es de la vista, no del modelo. Los fantasmas (lo que aún no existe) se pueden seleccionar y editar, para poder asignarles una fase desde el lienzo.
  const phaseNow = () => (S.model?.phases?.length && S.phase >= 0 ? Math.min(S.phase, S.model.phases.length - 1) : -1);
  // Qué atenúa (fantasma) y qué oculta la fase elegida; fresh = nodos que aparecen justo en ella (insignia NUEVO)
  function phaseView() {
    const out = { i: phaseNow(), ghost: { nodes: new Set(), edges: new Set(), groups: new Set() }, hide: { nodes: new Set(), edges: new Set(), groups: new Set() }, fresh: new Set() };
    if (out.i < 0) return out;
    const st = phaseStates(S.model, out.i);
    for (const k of ['nodes', 'edges', 'groups']) st[k].forEach((v, id) => { if (v === -1 || (v === 1 && !S.phaseGhosts)) out.hide[k].add(id); else if (v === 1) out.ghost[k].add(id); });
    phaseDiff(S.model, out.i).added.forEach(id => out.fresh.add(id));
    return out;
  }
  // 'AAAA-MM' → «dic 2026»; 'AAAA-MM-DD' → fecha corta
  const fmtPhaseDate = d => {
    const r = /^(\d{4})-(\d{2})$/.exec(d || '');
    if (!r) return fmtDay(d);
    try { return new Intl.DateTimeFormat(I.lang, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(+r[1], +r[2] - 1, 1))); } catch { return d; }
  };
  const phaseBar = $('#phase-bar');
  function renderPhaseBar() {
    const ph = S.model?.phases || [], cur = phaseNow();
    phaseBar.hidden = !ph.length;
    if (!ph.length) return;
    const sig = JSON.stringify([ph, cur, S.phaseGhosts, I.lang]);
    if (phaseBar._sig === sig) return;
    phaseBar._sig = sig;
    const had = phaseBar.contains(document.activeElement) ? document.activeElement.dataset?.p : null;
    const chip = (i, name, date, tip) => `<button class="ph-chip${cur === i ? ' on' : ''}" data-p="${i}" aria-pressed="${cur === i}"${tip ? ` title="${esc(tip)}"` : ''}><b>${esc(name)}</b>${date ? `<small>${esc(fmtPhaseDate(date))}</small>` : ''}</button>`;
    $('#phase-chips').innerHTML = chip(-1, T('phase.all'), '', '') + ph.map((p, i) => chip(i, p.name, p.date, p.goal)).join('');
    const g = $('#phase-ghosts');
    g.checked = !!S.phaseGhosts; g.disabled = cur < 0;
    if (had != null) phaseBar.querySelector(`[data-p="${had}"]`)?.focus();
    phaseBar.querySelector('.ph-chip.on')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }
  // i (índice) | id | null (todas); devuelve el índice resultante
  function setPhase(v) {
    const ph = S.model.phases || [];
    let i = v == null ? -1 : typeof v === 'number' ? Math.floor(v) : ph.findIndex(p => p.id === String(v));
    i = Number.isFinite(i) && i >= 0 && i < ph.length ? i : -1;
    if (i !== S.phase) {
      S.phase = i;
      stopPlay(); clearPath();
      refreshView();
      updateMeta();
    }
    renderPhaseBar(); markPhaseCmp();
    return S.phase;
  }
  const stepPhase = d => { const n = S.model.phases?.length || 0; if (n) setPhase(clamp(phaseNow() + d, -1, n - 1)); };
  phaseBar.addEventListener('click', ev => { const b = ev.target.closest('[data-p]'); if (b) setPhase(+b.dataset.p); });
  $('#phase-present').addEventListener('click', () => present({ phases: true }));
  $('#phase-ghosts').addEventListener('change', ev => { S.phaseGhosts = ev.target.checked; store.set('phaseGhosts', S.phaseGhosts); refreshView(); renderPhaseBar(); });

  // Campo «Fase» y «Se retira en» del inspector (nodos, conexiones, grupos y selección múltiple)
  const phaseField = items => {
    const m = S.model, ph = m.phases || [], list = [].concat(items);
    if (!ph.length) return '';
    const pick = k => { const v = new Set(list.map(x => x[k] || '')); return v.size === 1 ? [...v][0] : null; };
    const a = pick('phase'), b = pick('until'), lo = Math.max(0, ...list.map(x => (x.phase ? phaseIndex(m, x.phase) : 0)));
    const sel = (k, cur, empty, opts) => `<select data-phs="${k}">${cur === null ? `<option value="__mixed" selected>${T('insp.mixed')}</option>` : ''}<option value=""${cur === '' ? ' selected' : ''}>${esc(empty)}</option>${opts.map(p => `<option value="${esc(p.id)}"${cur === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`;
    return `<div class="field phase-field"><div class="row2">
      <label title="${esc(T('phase.hint'))}">${T('phase.label')}${sel('phase', a, T('phase.always'), ph)}</label>
      <label title="${esc(T('phase.untilHint'))}">${T('phase.until')}${sel('until', b, T('phase.notRetired'), ph.filter((p, i) => i > lo))}</label></div></div>`;
  };
  // Cambia fase / hasta de lo elegido; until siempre va después de phase (cleanPhaseRefs lo descarta si no)
  $('#inspector').addEventListener('change', ev => {
    const f = ev.target, k = f.dataset?.phs, t = selTarget();
    if (!k || !t || f.value === '__mixed') return;
    pushHistory();
    const list = Array.isArray(t) ? t : [t];
    list.forEach(x => { if (f.value) x[k] = f.value; else delete x[k]; });
    cleanPhaseRefs(list, S.model.phases);
    changed(true); renderInspector();
  });

  /* ---- gestor de fases ---- */
  const phaseBox = $('#phases-box');
  function renderPhases() {
    if (!phaseBox || !S.model) return;
    const act = document.activeElement;
    if (phaseBox.contains(act) && act.matches('input, textarea')) return;   // se está escribiendo: el modelo ya tiene el valor
    const ph = S.model.phases || [];
    const row = (p, i) => {
      const d = phaseDiff(S.model, i), n = ph.length;
      return `<div class="ph-row" data-id="${esc(p.id)}">
        <div class="ph-head"><span class="ph-n">${i + 1}</span><input data-phf="name" value="${esc(p.name)}" maxlength="60" aria-label="${esc(T('phase.name'))}" autocomplete="off">
          <span class="ph-cnt" title="${esc(T('phase.counts.tip', { a: d.added.length, r: d.retired.length }))}">${esc(T('phase.counts', { a: d.added.length, r: d.retired.length }))}</span>
          <span class="ver-tools">
            <button class="btn small icon" data-phb="up" title="${esc(T('phase.up'))}" aria-label="${esc(T('phase.up'))}"${i === 0 ? ' disabled' : ''}>↑</button>
            <button class="btn small icon" data-phb="down" title="${esc(T('phase.down'))}" aria-label="${esc(T('phase.down'))}"${i === n - 1 ? ' disabled' : ''}>↓</button>
            <button class="btn small danger icon" data-phb="del" title="${esc(T('phase.delete'))}" aria-label="${esc(T('phase.delete'))}">${ICON.x}</button></span></div>
        <div class="ph-body"><label>${T('phase.date')}<input data-phf="date" value="${esc(p.date || '')}" maxlength="10" placeholder="2026-12" title="${esc(T('phase.date.tip'))}" autocomplete="off"></label>
          <label>${T('phase.goal')}<textarea data-phf="goal" rows="2" placeholder="${esc(T('phase.goal.ph'))}">${esc(p.goal || '')}</textarea></label></div></div>`;
    };
    phaseBox.innerHTML = `<div class="ph-man"><div class="ph-title"><div class="cat">${esc(T('phase.title'))}</div><button class="btn small" data-phb="add">${esc(T('phase.add'))}</button></div>
      ${ph.length ? ph.map(row).join('') : `<p class="empty-list">${esc(T('phase.empty'))}</p>`}${ph.length ? phaseCompare() : ''}${ph.length ? phaseEstimate() : ''}</div>`;
    markPhaseCmp();
  }
  // Estimación por fase bajo la comparación: componentes estimados, días, costo de construcción con imprevistos, acumulado y, para comparar, el costo mensual de operarla
  function phaseEstimate() {
    const pe = phaseEffort(S.model, effortHelpers);
    if (!pe) return '';
    const run = phaseRows(S.model, phaseHelpers), hasRate = pe.rows.some(r => r.cost > 0), roleTitle = r => Object.entries(r.byRole).map(([k, d]) => `${efInfo(k).label}${efInfo(k).known ? '' : ' ⚠'}: ${d}`).join(' · ');
    const body = pe.rows.map((r, i) => `<tr><th scope="row">${esc(r.name)}${r.unrated.length ? `<small title="${esc(T('est.unrated.tip', r.unrated.join(', ')))}">⚠ ${esc(T('est.unrated'))}</small>` : ''}</th><td>${r.estimated}/${r.comps}</td><td title="${esc(roleTitle(r))}">${r.days}${r.extraDays ? `<small>+${r.extraDays} ${esc(T('est.extra'))}</small>` : ''}</td>
      ${hasRate ? `<td>${esc(money(r.total))}${r.contingency ? `<small>${esc(T('est.incl', money(r.contingency)))}</small>` : ''}</td><td>${esc(money(r.cumulative))}</td>` : ''}<td>${esc(phaseCostText(run[i]))}</td></tr>`).join('');
    const t = pe.totals;
    return `<div class="ph-cmp"><div class="cat">${esc(T('est.title'))}${pe.pct ? ` · ${esc(T('est.cont', pe.pct))}` : ''}</div><div class="ph-cmp-box"><table><thead><tr><th>${esc(T('phase.cmp.phase'))}</th><th title="${esc(T('est.comps.tip'))}">${esc(T('est.comps'))}</th><th title="${esc(T('est.days.tip'))}">${esc(T('est.days'))}</th>${hasRate ? `<th>${esc(T('est.build'))}</th><th>${esc(T('est.cum'))}</th>` : ''}<th title="${esc(T('est.run.tip'))}">${esc(T('est.run'))}</th></tr></thead><tbody>${body}</tbody>
      <tfoot><tr><th scope="row">${esc(T('est.sum'))}</th><td></td><td>${t.days}</td>${hasRate ? `<td>${esc(money(t.total))}</td><td></td>` : ''}<td></td></tr></tfoot></table></div></div>`;
  }
  // Comparación de fases bajo la lista: componentes, altas, bajas, costo mensual, cambio de costo y hallazgos abiertos; clic en una fila = elegir esa fase en el lienzo
  function phaseCompare() {
    const rows = phaseRows(S.model, phaseHelpers), hasDs = !!S.model.datasets?.length, hasSto = rows.some(r => r.storage != null), hasMig = rows.some(r => r.mig), f = (n, k) => `<span class="ph-f sev-${k}${n ? '' : ' zero'}" title="${esc(sevLabel(k))}">${n}</span>`;
    const body = rows.map((r, i) => `<tr data-pc="${i}" tabindex="0" role="button" title="${esc(T('phase.cmp.pick'))}"><th scope="row">${esc(r.name)}${r.date ? `<small>${esc(fmtPhaseDate(r.date))}</small>` : ''}</th><td>${r.nodes}</td><td class="up">${r.added ? '+' + r.added : '0'}</td><td class="dn">${r.retired ? '−' + r.retired : '0'}</td>
      <td>${esc(phaseCostText(r))}</td><td class="${r.dCost > 0 ? 'dn' : r.dCost < 0 ? 'up' : ''}">${esc(phaseCostText(r, 'dCost'))}</td>${hasDs ? `<td>${r.datasets}</td>` : ''}${hasSto ? `<td title="${esc(T('phase.cmp.storage.tip'))}">${r.storage == null ? '—' : esc(money(round2(r.storage)))}</td>` : ''}${hasMig ? `<td class="ph-mig">${mgChips(r.mig)}</td>` : ''}<td class="ph-fs">${f(r.findings.high, 'high')}${f(r.findings.medium, 'medium')}${f(r.findings.low, 'low')}</td></tr>`).join('');
    return `<div class="ph-cmp"><div class="cat">${esc(T('phase.cmp.title'))}</div><div class="ph-cmp-box"><table><thead><tr><th>${esc(T('phase.cmp.phase'))}</th><th title="${esc(T('phase.cmp.nodes.tip'))}">${esc(T('phase.cmp.nodes'))}</th><th>${esc(T('phase.cmp.added'))}</th><th>${esc(T('phase.cmp.retired'))}</th><th>${esc(T('phase.cmp.cost'))}</th><th title="${esc(T('phase.cmp.delta.tip'))}">${esc(T('phase.cmp.delta'))}</th>${hasDs ? `<th>${esc(T('phase.cmp.datasets'))}</th>` : ''}${hasSto ? `<th title="${esc(T('phase.cmp.storage.tip'))}">${esc(T('phase.cmp.storage'))}</th>` : ''}${hasMig ? `<th title="${esc(T('mig.cmp.tip'))}">${esc(T('mig.cmp'))}</th>` : ''}<th>${esc(T('phase.cmp.findings'))}</th></tr></thead><tbody>${body}</tbody></table></div></div>`;
  }
  function markPhaseCmp() { const cur = phaseNow(); phaseBox.querySelectorAll('tr[data-pc]').forEach(tr => { const on = +tr.dataset.pc === cur; tr.classList.toggle('on', on); tr.setAttribute('aria-pressed', on); }); }
  const phaseSlug = s => fold(String(s ?? '')).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'phase';
  // Edición ligera (sin reconstruir el lienzo): el nombre, la fecha y el objetivo no cambian lo que se dibuja
  function phasesTouched() { syncEditor(); save(); updateUndoButtons(); updateMeta(); renderPhaseBar(); }
  function addPhase(p = {}) {
    p = p && typeof p === 'object' ? p : {};
    const ph = S.model.phases || [];
    if (ph.length >= PHASE_MAX) { toast(T('phase.max', PHASE_MAX)); return ''; }
    const base = PHASE_ID.test(String(p.id ?? '').trim()) ? String(p.id).trim() : phaseSlug(p.name);
    let id = base, k = 2;
    while (ph.some(x => x.id === id)) id = `${base.slice(0, 26)}-${k++}`;
    pushHistory();
    S.model.phases = cleanPhases([...ph, { ...p, id, name: p.name || T('phase.new.name', ph.length + 1) }]);
    changed(true); renderInspector(); renderPhases(); renderPhaseBar();
    return id;
  }
  function updatePhase(id, patch, o = {}) {
    const ph = S.model.phases || [], i = phaseIndex(S.model, id);
    if (i < 0 || !patch || typeof patch !== 'object') return false;
    if (o.typing) markEdit(); else pushHistory();
    S.model.phases = cleanPhases(ph.map((x, k) => (k === i ? { ...x, ...patch, id } : x)));
    if (o.typing) phasesTouched(); else { changed(true); renderInspector(); renderPhases(); renderPhaseBar(); }
    return true;
  }
  // Sus elementos pasan a la fase anterior (o a «siempre» si era la primera); los que se retiraban en ella se retiran en la siguiente (o ya no se retiran)
  function removePhase(id) {
    const ph = S.model.phases || [], i = phaseIndex(S.model, id);
    if (i < 0) return false;
    pushHistory();
    const prev = ph[i - 1]?.id, next = ph[i + 1]?.id, all = [...S.model.groups, ...S.model.nodes, ...S.model.edges];
    all.forEach(x => {
      if (x.phase === id) { if (prev) x.phase = prev; else delete x.phase; }
      if (x.until === id) { if (next) x.until = next; else delete x.until; }
    });
    const rest = ph.filter(p => p.id !== id);
    if (rest.length) S.model.phases = rest; else delete S.model.phases;
    cleanPhaseRefs(all, rest);
    S.phase = !rest.length ? -1 : S.phase > i ? S.phase - 1 : S.phase === i ? Math.max(0, i - 1) : S.phase;
    changed(true); renderInspector(); renderPhases(); renderPhaseBar();
    return true;
  }
  function movePhase(id, d) {
    const ph = [...(S.model.phases || [])], i = phaseIndex(S.model, id), j = i + d;
    if (i < 0 || j < 0 || j >= ph.length) return false;
    pushHistory();
    [ph[i], ph[j]] = [ph[j], ph[i]];
    S.model.phases = ph;
    cleanPhaseRefs([...S.model.groups, ...S.model.nodes, ...S.model.edges], ph);   // un until que queda antes de su phase se descarta
    if (S.phase === i) S.phase = j; else if (S.phase === j) S.phase = i;
    changed(true); renderInspector(); renderPhases(); renderPhaseBar();
    return true;
  }
  async function deletePhase(id) {
    const ph = S.model.phases || [], i = phaseIndex(S.model, id), p = ph[i];
    if (!p) return;
    const n = [...S.model.groups, ...S.model.nodes, ...S.model.edges].filter(x => x.phase === id || x.until === id).length, prev = ph[i - 1];
    const text = !n ? T('phase.cf.none') : prev ? T('phase.cf.to', { n, to: prev.name }) : T('phase.cf.always', { n });
    if (!(await confirmBox({ title: T('phase.cf.title', { name: p.name }), text, ok: T('phase.cf.ok'), cancel: T('ver.cf.cancel'), danger: true }))) return;
    if (removePhase(id)) toast(T('phase.deleted', { name: p.name }));
  }
  phaseBox.addEventListener('focusin', ev => { if (ev.target.dataset?.phf) beginEdit(); });
  phaseBox.addEventListener('focusout', ev => { if (ev.target.dataset?.phf) endEdit(); });
  phaseBox.addEventListener('input', ev => {
    const f = ev.target, k = f.dataset?.phf, id = f.closest('.ph-row')?.dataset.id;
    if (!k || !id) return;
    const v = k === 'goal' ? f.value : f.value.trim();
    if (k === 'date') { const bad = !!v && !phaseDay(v); f.setAttribute('aria-invalid', bad); if (bad) return; }
    updatePhase(id, { [k]: v }, { typing: true });
  });
  phaseBox.addEventListener('click', ev => { const tr = ev.target.closest('tr[data-pc]'); if (tr) setPhase(+tr.dataset.pc); });
  phaseBox.addEventListener('keydown', ev => { const tr = ev.target.closest?.('tr[data-pc]'); if (tr && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); setPhase(+tr.dataset.pc); } });
  phaseBox.addEventListener('click', ev => {
    const b = ev.target.closest('[data-phb]');
    if (!b) return;
    const id = b.closest('.ph-row')?.dataset.id, a = b.dataset.phb;
    if (a === 'add') { const nid = addPhase(); phaseBox.querySelector(`.ph-row[data-id="${CSS.escape(nid)}"] [data-phf="name"]`)?.select(); }
    else if (a === 'up') movePhase(id, -1);
    else if (a === 'down') movePhase(id, 1);
    else if (a === 'del') deletePhase(id);
  });

  /* ---------- acciones ---------- */
  // Selección: { kind: 'node' | 'edge' | 'group' | 'note' | 'zone', id } o { kind: 'multi', ids: [nodos] }
  function selTarget() {
    const s = S.sel;
    if (!s || !S.model) return null;
    if (s.kind === 'multi') { const ns = S.model.nodes.filter(n => s.ids.includes(n.id)); return ns.length ? ns : null; }
    const list = s.kind === 'node' ? S.model.nodes : s.kind === 'edge' ? S.model.edges : s.kind === 'note' ? S.model.notes : s.kind === 'zone' ? S.model.zones : S.model.groups;
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
    S.flow = null;
    revealScope(sel);  // un elemento de otro nivel C4: se abre ese nivel
    S.sel = visibleSel(normSel(sel));
    if (S.sel && !selTarget()) S.sel = null;
    if (S.path) clearPath();
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
    // Con un logotipo de marca (sap/logo) el id sale del nombre: s4hana-1 en vez de logo-1
    const base = extra.icon && !extra.icon.endsWith('/logo') ? extra.icon.split('/')[1]
      : extra.icon ? (fold(extra.label || '').replace(/^sap\s+/, '').replace(/[^a-z0-9]+/g, '') || extra.icon.split('/')[0]) : S.lastType;
    const n = { id: uniqueId(`${base}-`), label: extra.label || typeLabel(type), type: S.lastType };
    if (extra.icon) n.icon = extra.icon;
    if (extra.sub) n.sub = extra.sub;
    if (S.scope) { n.in = S.scope; const k = c4Default(S.scope); if (k) n.c4 = k; } // lo nuevo nace en el nivel abierto (con el tipo C4 que toca)
    { const pi = phaseNow(); if (pi > 0) n.phase = S.model.phases[pi].id; }   // y en la fase elegida (en la primera no hace falta: ya está desde el inicio)
    n.x = snap(wx - nodeWidth(n) / 2);
    n.y = snap(wy - H / 2);
    // Si cae dentro de un grupo, entra en el más profundo
    let best = null, depth = -1;
    R.gbox.forEach((b, gid) => {
      const gq = groupById(gid);
      if (!gq || !inScope(gq)) return;
      if (wx >= b.x && wx <= b.x + b.w && wy >= b.y && wy <= b.y + b.h) {
        const d = groupDepth(groupById(gid));
        if (d > depth) { depth = d; best = gid; }
      }
    });
    if (best) n.group = best;
    S.model.nodes.push(n);
    // En la vista Contexto un nodo dentro de una caja cerrada no se vería: se pasa a la Completa
    if (best && vc().groups === 'collapse-top') { setView('full', { toast: false }); toast(T('view.auto'), 2600); }
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

  function deleteSelection(opts = {}) {
    const s = S.sel, t = selTarget();
    if (!t) return;
    // Un nodo con diagrama interno se lleva su contenido (a cualquier profundidad): se pide confirmación
    if ((s.kind === 'node' || s.kind === 'multi') && !opts.confirmed) {
      const deep = selNodes().filter(n => innerCount(n.id));
      if (deep.length) {
        const total = innerDeep(deep.map(n => n.id)).size;
        confirmBox({ title: T('c4.del.title', deep.length), text: T('c4.del.text', total), list: deep.map(n => `${n.label} · ${T('c4.del.n', innerCount(n.id))}`), ok: T('insp.delete'), cancel: T('ver.cf.cancel'), danger: true })
          .then(ok => { if (ok && selTarget()) deleteSelection({ confirmed: true }); });
        return;
      }
    }
    pushHistory();
    const m = S.model;
    if (s.kind === 'note' || s.kind === 'zone') {
      const k = s.kind === 'note' ? 'notes' : 'zones';
      m[k] = m[k].filter(x => x.id !== s.id);
    } else if (s.kind === 'node' || s.kind === 'multi') {
      const ids = new Set(selIds());
      innerDeep([...ids]).forEach(id => ids.add(id));
      m.nodes = m.nodes.filter(n => !ids.has(n.id));
      m.edges = m.edges.filter(e => !ids.has(e.from) && !ids.has(e.to));
      m.groups = m.groups.filter(g => !ids.has(g.in)); m.notes = m.notes.filter(x => !ids.has(x.in)); m.zones = m.zones.filter(x => !ids.has(x.in));
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

  // Tecla Z: selecciona la zona siguiente (Mayús, la anterior); red de seguridad si una zona queda tapada
  function cycleZone(dir) {
    const zs = scopeItems('zones');
    if (!zs.length) return;
    const i = S.sel?.kind === 'zone' ? zs.findIndex(z => z.id === S.sel.id) : -1;
    const z = zs[(i < 0 ? (dir > 0 ? 0 : zs.length - 1) : i + dir + zs.length) % zs.length];
    select({ kind: 'zone', id: z.id });
  }

  // Duplica los nodos elegidos y las conexiones entre ellos, debajo del original
  function duplicateSelection() {
    if (itemSel()) return duplicateItem();
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
    const top = [...ids.values()];
    copyInner(ids);
    S.model.edges.filter(e => ids.has(e.from) && ids.has(e.to)).forEach(e => {
      S.model.edges.push({ ...clone(e), id: uniqueId('e'), from: ids.get(e.from), to: ids.get(e.to) });
    });
    changed(true);
    select({ kind: 'multi', ids: top });
  }
  // Copia en profundidad el diagrama interno (niveles C4) de los nodos duplicados. `ids`: mapa id original -> id de la copia; se amplía con los nodos
  // internos. Posiciones y etiquetas se mantienen. Las decisiones (ADR) y los hallazgos descartados no se copian: referencian ids del original.
  function copyInner(ids) {
    const m = S.model, tops = new Set(ids.keys()), deep = innerDeep([...tops]);
    if (!deep.size) return;
    const own = new Set([...tops, ...deep]); // nodos de origen: los duplicados y todo lo que cuelga de ellos
    const gmap = new Map();
    // Orden de copia: nodos por profundidad (el padre antes que sus hijos), para que `in` ya esté remapeado
    const depth = n => { let d = 0, c = n; while (c.in && d < 50) { c = m.nodes.find(x => x.id === c.in) || {}; d++; } return d; };
    const src = m.nodes.filter(n => deep.has(n.id)).sort((a, b) => depth(a) - depth(b));
    const copies = src.map(n => { const c = { ...clone(n), id: uniqueId(`${n.type}-`) }; ids.set(n.id, c.id); m.nodes.push(c); return c; }); // el id se reserva al insertar
    const inOwn = x => x.in && own.has(x.in);
    const gcopies = m.groups.filter(inOwn).map(g => { const c = { ...clone(g), id: uniqueId('grupo-') }; gmap.set(g.id, c.id); m.groups.push(c); return c; });
    copies.forEach(n => {
      n.in = ids.get(n.in);
      if (n.group) { if (gmap.has(n.group)) n.group = gmap.get(n.group); else delete n.group; }
    });
    gcopies.forEach(g => {
      g.in = ids.get(g.in);
      if (g.parent) { if (gmap.has(g.parent)) g.parent = gmap.get(g.parent); else delete g.parent; }
    });
    ['notes', 'zones'].forEach(k => m[k].filter(inOwn).forEach(o => m[k].push({ ...clone(o), id: uniqueId(k === 'notes' ? 'note' : 'zone'), in: ids.get(o.in) })));
    // Las conexiones (también las que cruzan niveles) las copia duplicateSelection: `ids` ya incluye los nodos internos
  }

  /* ---------- crear y editar notas y zonas ---------- */
  const viewCenter = () => { const r = svg.getBoundingClientRect(); return toWorld(r.left + r.width / 2, r.top + r.height / 2); };
  function addItem(kind, o) {
    pushHistory();
    const id = uniqueId(kind);
    S.model[kind === 'note' ? 'notes' : 'zones'].push({ id, ...o, ...(S.scope ? { in: S.scope } : {}) });
    changed(true);
    select({ kind, id });
    toast(T(kind === 'note' ? 'toast.noteAdded' : o.kind === 'trust' ? 'toast.trustAdded' : 'toast.zoneAdded'));
  }
  const addNote = () => { const c = viewCenter(); addItem('note', { x: snap(c.x - 90), y: snap(c.y - 55), w: 180, h: 110, text: '', color: 'limon' }); editItemText('note', S.sel.id); };
  const addZone = () => { const c = viewCenter(); addItem('zone', { x: snap(c.x - 180), y: snap(c.y - 110), w: 360, h: 220, label: T('zone.new'), severity: 'medium' }); };
  // Caja alrededor de los nodos elegidos, con margen
  function markZone(kind) {
    const ns = selNodes();
    if (!ns.length) return;
    const pad = 36, x0 = Math.min(...ns.map(n => n.x)), y0 = Math.min(...ns.map(n => n.y)), x1 = Math.max(...ns.map(n => n.x + R.width.get(n.id))), y1 = Math.max(...ns.map(n => n.y + nodeBoxH(n)));
    const box = { x: snap(x0 - pad), y: snap(y0 - pad - 20), w: snap(x1 - x0 + 2 * pad) + 20, h: snap(y1 - y0 + 2 * pad + 20) + 20 };
    addItem('zone', kind === 'trust' ? { ...box, label: '', kind: 'trust' } : { ...box, label: T('zone.new'), severity: 'high' });
  }
  function duplicateItem() {
    const s = itemSel(), k = s.kind === 'note' ? 'notes' : 'zones', o = S.model[k].find(x => x.id === s.id);
    if (!o) return;
    pushHistory();
    const copy = { ...clone(o), id: uniqueId(s.kind), x: snap(o.x + 32), y: snap(o.y + 32) };
    S.model[k].push(copy);
    changed(true);
    select({ kind: s.kind, id: copy.id });
  }
  // Edición en el lugar: un cuadro de texto sobre la nota (texto) o sobre la etiqueta de la zona
  function editItemText(kind, id) {
    const o = S.model[kind === 'note' ? 'notes' : 'zones'].find(x => x.id === id), r = (kind === 'note' ? R.notes : R.zones).get(id);
    if (!o || !r) return;
    $('.item-edit')?.blur();
    const key = kind === 'note' ? 'text' : 'label', area = kind === 'note';
    const b = (area ? r.g : r.tag).getBoundingClientRect(), sr = stage.getBoundingClientRect();
    const box = document.createElement(area ? 'textarea' : 'input');
    box.className = 'item-edit';
    box.value = o[key] || '';
    box.setAttribute('aria-label', T(area ? 'note.text' : 'zone.label'));
    Object.assign(box.style, { left: `${b.left - sr.left}px`, top: `${b.top - sr.top}px`, width: `${Math.max(b.width, area ? 0 : 200)}px`, ...(area ? { height: `${b.height}px` } : {}) });
    stage.appendChild(box);
    let ready = false; // ver inlineEdit: se enfoca después del mousedown del doble clic
    setTimeout(() => { ready = true; box.focus(); box.select(); });
    beginEdit();
    box.addEventListener('input', () => { markEdit(); o[key] = box.value; changed(true); });
    box.addEventListener('keydown', ev => { if (ev.key === 'Enter' && (!area || ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); box.blur(); } });
    box.addEventListener('blur', () => { if (!ready) return; box.remove(); endEdit(); if (S.sel?.id === id) renderInspector(); });
  }

  // Edición en el lugar de nombres y etiquetas (sustituye a prompt()): cuadro sobre `rect` (pantalla), tamaño de letra según el zoom.
  // Enter confirma (en multilínea, Mayús+Enter salta de línea), Esc cancela, perder el foco confirma; onCommit(v) solo si cambió.
  function inlineEdit({ rect, value, multiline, aria, font, minW = 150, onCommit }) {
    $('.item-edit')?.blur();
    const sr = stage.getBoundingClientRect(), fs = Math.max(11, Math.round(font * S.view.k * 10) / 10);
    const box = document.createElement(multiline ? 'textarea' : 'input');
    box.className = 'item-edit';
    box.value = value;
    box.setAttribute('aria-label', aria);
    const w = Math.min(Math.max(rect.width + 24, minW), sr.width - 8), lines = multiline ? value.split('\n').length : 1, h = Math.round(lines * fs * 1.35 + 14);
    box.style.fontSize = `${fs}px`;
    box.style.width = `${w}px`;
    if (multiline) { box.style.height = `${h}px`; box.rows = lines; }
    // Centrado sobre el texto y dentro del escenario
    const left = clamp(rect.left + rect.width / 2 - w / 2 - sr.left, 4, Math.max(4, sr.width - w - 4)), top = clamp(rect.top + rect.height / 2 - h / 2 - sr.top, 4, Math.max(4, sr.height - h - 4));
    box.style.left = `${left}px`; box.style.top = `${top}px`;
    stage.appendChild(box);
    // El doble clic se detecta en el pointerdown: el mousedown que llega justo después le quitaría el foco, así que se enfoca en la siguiente vuelta
    let cancel = false, ready = false;
    setTimeout(() => { ready = true; box.focus(); box.select(); });
    box.addEventListener('keydown', ev => {
      ev.stopPropagation();
      if (ev.key === 'Escape') { ev.preventDefault(); cancel = true; box.blur(); }
      else if (ev.key === 'Enter' && !(multiline && ev.shiftKey)) { ev.preventDefault(); box.blur(); }
    });
    if (multiline) box.addEventListener('input', () => { const n = box.value.split('\n').length; box.rows = n; box.style.height = `${Math.round(n * fs * 1.35 + 14)}px`; });
    box.addEventListener('blur', () => { if (!ready) return; const v = box.value; box.remove(); if (!cancel) onCommit(v); });
  }
  const unionRect = els => {
    const rs = els.map(e => e.getBoundingClientRect()).filter(r => r.width && r.height);
    if (!rs.length) return null;
    const l = Math.min(...rs.map(r => r.left)), t = Math.min(...rs.map(r => r.top));
    return { left: l, top: t, width: Math.max(...rs.map(r => r.right)) - l, height: Math.max(...rs.map(r => r.bottom)) - t };
  };
  function renameNode(id) {
    const n = S.model.nodes.find(x => x.id === id), g = R.nodes.get(id);
    if (!n || !g) return;
    const rect = unionRect([...g.querySelectorAll('.node-label')]) || g.getBoundingClientRect();
    inlineEdit({ rect, value: n.label, aria: T('prompt.node'), font: 13.5, minW: 170, onCommit: v => {
      v = v.trim();
      if (!v || v === n.label) return;
      pushHistory(); n.label = v; changed(true); renderInspector();
    } });
  }
  // fresh: grupo recién creado desde el inspector; el nombre se suma a ese paso de deshacer
  function renameGroup(id, fresh) {
    const g = groupById(id), r = R.groups.get(id);
    if (!g || !r) return;
    inlineEdit({ rect: r.tag.getBoundingClientRect(), value: g.label, aria: T('prompt.group'), font: 11, minW: 170, onCommit: v => {
      v = v.trim();
      if (!v || v === g.label) return;
      if (!fresh) pushHistory();
      g.label = v; changed(true); renderInspector();
    } });
  }
  function renameEdge(id) {
    const e = S.model.edges.find(x => x.id === id), r = R.edges.get(id);
    if (!e || !r) return;
    let rect = r.label && unionRect([r.label]);
    if (!rect) { // sin etiqueta visible: en el punto medio de la conexión
      const m = r.line.getScreenCTM(), p = r.line.getPointAtLength(r.line.getTotalLength() / 2), q = new DOMPoint(p.x, p.y).matrixTransform(m);
      rect = { left: q.x - 40, top: q.y - 10, width: 80, height: 20 };
    }
    inlineEdit({ rect, value: e.label || '', multiline: true, aria: T('prompt.edge'), font: 11, minW: 150, onCommit: v => {
      v = v.replace(/\r\n?/g, '\n').trim();
      if (v === (e.label || '')) return;
      pushHistory();
      if (v) e.label = v; else delete e.label;
      changed(true); renderInspector();
    } });
  }

  function relayout() {
    const sm = scopeModel(); // solo se ordena el nivel abierto
    if (!sm.nodes.length) return;
    stopPlay();
    pushHistory();
    const from = new Map(sm.nodes.map(n => [n.id, { x: n.x, y: n.y }]));
    autoLayout(sm);
    const to = new Map(sm.nodes.map(n => [n.id, { x: n.x, y: n.y }]));
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
      if (moving.has(n.id) || VW.hideNodes.has(n.id)) return;
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
    if (!scopeModel().nodes.length) return;
    if (vc().groups === 'collapse-top') return toast(T('ctx.noPlay'));
    cancelConnect();
    select(null);
    const ranks = flowRanks(scopeModel()), max = Math.max(0, ...ranks.values());
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
        const on = flowPulse(o.e, ranks, r);
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

  /* ---------- modo presentación ---------- */
  // P = null fuera de la presentación; si no: { slides, i, saved, fs, idle, sl }
  let P = null;
  function presentSlides() {
    const m = scopeModel(), TB = (m.direction || C.layout.direction) === 'TB';
    const groups = m.groups.filter(g => R.gbox.has(g.id) && m.nodes.some(n => inGroup(n, g.id)));
    const pos = g => { const b = R.gbox.get(g.id); return TB ? [b.y, b.x] : [b.x, b.y]; };
    const ids = new Set(groups.map(g => g.id));
    // Un grupo cuyo padre no se muestra cuenta como de primer nivel
    const depth = g => { let d = 0, p = g.parent; while (p && ids.has(p) && d < 50) { d++; p = groupById(p)?.parent; } return d; };
    groups.sort((a, b) => depth(a) - depth(b) || pos(a)[0] - pos(b)[0] || pos(a)[1] - pos(b)[1]);
    const over = { kind: 'overview' };
    if (groups.length) return [over, ...groups.map(g => ({ kind: 'group', g })), { kind: 'overview', end: true }];
    const ranks = flowRanks(m), max = Math.max(0, ...ranks.values());
    if (max < 1) return [over];
    return [over, ...Array.from({ length: max + 1 }, (_, r) => ({ kind: 'step', r, ranks }))];
  }
  // Cámara que encuadra una caja con margen y deja sitio abajo para el pie
  function presentView(b, maxK) {
    const r = svg.getBoundingClientRect();
    if (!b) return { k: 1, x: r.width / 2, y: r.height / 2 };
    const mg = Math.round(Math.min(r.width, r.height) * 0.08), bot = Math.min(110, r.height * 0.18);
    const aw = r.width - 2 * mg, ah = r.height - 2 * mg - bot;
    const k = clamp(Math.min(aw / b.w, ah / b.h), C.view.minZoom, maxK);
    return { k, x: mg + (aw - b.w * k) / 2 - b.x * k, y: mg + (ah - b.h * k) / 2 - b.y * k };
  }
  // Atenúa lo que no es de la diapositiva (lit: ids de nodos; gin: ids de grupos; null = nada)
  function presentDim(lit, gin) {
    svg.classList.toggle('focusing', !!lit);
    R.nodes.forEach((g, id) => { g.classList.toggle('lit', !!lit && lit.has(id)); g.classList.remove('sel', 'connect-src'); g.classList.toggle('pout', !!lit && !lit.has(id)); });
    R.edges.forEach(r => {
      const on = !!lit && lit.has(r.e.from) && lit.has(r.e.to);
      r.g.classList.toggle('lit', on); r.g.classList.remove('sel'); r.g.classList.toggle('pout', !!lit && !on);
    });
    R.groups.forEach((r, id) => { r.g.classList.remove('sel'); r.g.classList.toggle('pdim', !!gin && !gin.has(id)); });
  }
  function presentCaption(sl) {
    const m = scopeModel();
    let h = m.title, sub = '', desc = '', notes = [];
    if (sl.kind === 'phase') {
      const ph = m.phases[sl.i], d = phaseDiff(S.model, sl.i), pm = phaseModel(S.model, sl.i);
      h = ph.name;
      sub = [ph.date ? fmtPhaseDate(ph.date) : '', T('phase.present.step', { i: sl.i + 1, n: P.slides.length }), T('present.counts', { n: pm.nodes.length, g: pm.groups.length }), T('phase.counts', { a: d.added.length, r: d.retired.length })].filter(Boolean).join(' · ');
      desc = ph.goal || '';
    } else if (sl.kind === 'view') {
      sub = viewLabel(sl.key);
      desc = T('present.counts', { n: m.nodes.length, g: m.groups.length });
    } else if (sl.kind === 'overview') {
      sub = sl.end ? T('present.end') : T('present.counts', { n: m.nodes.length, g: m.groups.length });
    } else if (sl.kind === 'group') {
      const ns = m.nodes.filter(n => inGroup(n, sl.g.id));
      h = loc(sl.g.label) || sl.g.id;
      sub = T('present.n', ns.length);
      desc = loc(sl.g.desc) || '';
      notes = ns.filter(n => n.desc).slice(0, 4).map(n => `<span><b>${esc(loc(n.label))}</b> ${esc(loc(n.desc))}</span>`);
    } else {
      h = m.nodes.filter(n => sl.ranks.get(n.id) === sl.r).map(n => loc(n.label)).join(' · ');
      sub = T('present.step', { i: sl.r + 1, n: P.slides.length - 1 });
    }
    $('#pb-h').textContent = h;
    $('#pb-sub').textContent = sub;
    $('#pb-desc').innerHTML = [desc ? esc(desc) : '', ...notes].filter(Boolean).join('<br>');
    $('#pb-dots').innerHTML = P.slides.map((_, i) => `<button class="pb-dot${i === P.i ? ' on' : ''}" data-i="${i}" tabindex="-1" aria-label="${i + 1}"></button>`).join('');
  }
  function presentShow(i, instant = false) {
    if (!P) return;
    stopPlay();
    P.i = clamp(i, 0, P.slides.length - 1);
    const sl = P.slides[P.i];
    if (sl.kind === 'phase') setPhase(sl.i);
    const m = scopeModel();
    let box = null, lit = null, gin = null;
    if (sl.kind === 'view' && sl.key !== S.viewKey) setView(sl.key, { toast: false });  // recalcula el estado derivado de la vista
    if (sl.kind === 'group') {
      box = R.gbox.get(sl.g.id);
      lit = new Set(m.nodes.filter(n => inGroup(n, sl.g.id)).map(n => n.id));
      // El grupo y sus descendientes se quedan a plena luz
      gin = new Set(m.groups.filter(g => { let c = g, k = 0; while (c && k++ < 50) { if (c.id === sl.g.id) return true; c = groupById(c.parent); } return false; }).map(g => g.id));
    } else if (sl.kind === 'step') {
      lit = new Set(m.nodes.filter(n => sl.ranks.get(n.id) === sl.r).map(n => n.id));
      const base = new Set(lit);
      m.edges.forEach(e => { if (flowPulse(e, sl.ranks, sl.r)) lit.add(base.has(e.from) ? e.to : e.from); });
    }
    P.sl = { lit, gin };
    presentDim(lit, gin);
    animateView(presentView(box || contentBox(), sl.kind === 'group' ? 1.5 : 1.25), instant ? 0 : 700);
    presentCaption(sl);
  }
  const presentGo = d => { if (P) presentShow(P.i + d); };
  // Con el ratón quieto se ocultan las ayudas y el cursor
  function presentWake() {
    if (!P) return;
    document.body.classList.remove('idle');
    clearTimeout(P.idle);
    P.idle = setTimeout(() => document.body.classList.add('idle'), 3000);
  }
  // "Presentar vistas" (⇧V): una diapositiva por vista que aporta algo, aparte de la presentación por grupos
  // (esa recorre UNA vista; mezclarlas haría una secuencia sin hilo). Mismo encuadre, atajos y barra.
  const presentViewSlides = () => worthViews().map(key => ({ kind: 'view', key }));
  // "Presentar fases": una diapositiva por fase (nombre, fecha y objetivo como pie); mismo encuadre, atajos y barra
  const presentPhaseSlides = () => (S.model.phases || []).map((_, i) => ({ kind: 'phase', i }));
  function present(opts = {}) {
    if (P || viewBusy || !S.model.nodes.length || (opts.phases && !S.model.phases?.length)) return;
    cancelConnect();
    stopPlay();
    P = { slides: [], i: 0, views: !!opts.views, phases: !!opts.phases, saved: { phase: S.phase, ghosts: S.phaseGhosts, view: { ...S.view }, sel: S.sel, key: S.viewKey, flow: S.flow, chosen: S.viewChosen, stored: store.get('view') }, fs: false, idle: 0 };
    document.body.classList.add('presenting');
    svg.classList.add('presenting');
    $('#present-bar').hidden = false;
    $('#btn-present').classList.add('on');
    try { document.documentElement.requestFullscreen?.()?.catch?.(() => {}); } catch { /* sin pantalla completa */ }
    // Esperar a que el lienzo tome su nuevo tamaño
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!P) return;
      P.slides = P.phases ? presentPhaseSlides() : P.views ? presentViewSlides() : presentSlides();
      presentShow(0, true);
    }));
    presentWake();
  }
  function exitPresent() {
    if (!P) return;
    const { saved, idle } = P;
    clearTimeout(idle);
    stopPlay();
    P = null;
    document.body.classList.remove('presenting', 'idle');
    svg.classList.remove('presenting');
    $('#present-bar').hidden = true;
    $('#btn-present').classList.remove('on');
    $$('.pout, .pdim', svg).forEach(n => n.classList.remove('pout', 'pdim'));
    if (saved.key !== S.viewKey) {  // se recorrieron vistas: vuelve a la anterior y deshace lo que setView recuerda
      setView(saved.key, { toast: false });
      S.flow = saved.flow; S.viewChosen = saved.chosen;
      if (saved.stored == null) { try { localStorage.removeItem(`${C.app.storageKey}.view`); } catch { /* sin almacenamiento */ } } else store.set('view', saved.stored);
    }
    if (document.fullscreenElement) document.exitFullscreen?.().catch?.(() => {});
    if (S.phase !== saved.phase) setPhase(saved.phase);   // se recorrieron fases: vuelve a la que había
    select(saved.sel);
    requestAnimationFrame(() => animateView(saved.view, 0));
  }
  function presentKey(ev) {
    const k = ev.key, n = parseInt(k, 10);
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    ev.preventDefault();
    if (k === 'Escape' || k.toLowerCase() === 'v') return exitPresent();
    if (k === 'ArrowRight' || k === 'ArrowDown' || k === ' ' || k === 'PageDown' || k === 'Enter') presentGo(1);
    else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp' || k === 'Backspace') presentGo(-1);
    else if (k === 'Home') presentShow(0);
    else if (k === 'End') presentShow(P.slides.length - 1);
    else if (n >= 1 && n <= 9) presentShow(Math.min(n, P.slides.length) - 1);
    else if (k.toLowerCase() === 'p') togglePlay();
    presentWake();
  }
  $('#btn-present').addEventListener('click', ev => present({ views: ev.shiftKey }));  // ⇧clic = presentar vistas
  $('#pb-dots').addEventListener('click', ev => { const b = ev.target.closest('[data-i]'); if (b) presentShow(+b.dataset.i); });
  document.addEventListener('fullscreenchange', () => {
    if (!P) return;
    if (document.fullscreenElement) P.fs = true;
    else if (P.fs) exitPresent();
  });
  window.addEventListener('resize', () => { if (P?.slides.length) requestAnimationFrame(() => presentShow(P.i, true)); });
  stage.addEventListener('pointermove', presentWake);

  /* ---------- versiones y ambientes ---------- */
  // Nombre libre: si parece número se muestra como "Versión 1.2"; si no, tal cual ("MVP")
  const verLabel = v => {
    if (v.kind === 'env') { const l = loc(C.environments?.[v.env]?.label) || v.env.toUpperCase(); return v.name ? `${l} · ${v.name}` : l; }
    return v.name ? (/^v?\d/i.test(v.name) ? T('ver.versionN', v.name) : v.name) : T('ver.versionN', v.n);
  };
  const verColor = v => (v.kind === 'env' ? colorVar(C.environments?.[v.env]?.color) : null) || 'var(--accent)';
  const activeVersion = () => S.model?.versions.find(v => v.id === S.model.active) || null;
  const findVersion = id => S.model.versions.find(v => v.id === id);
  // Solo lo que se dibuja: sin versiones y con posiciones redondeadas
  const snapshotOf = m => {
    const d = clone({ title: m.title, ...(m.direction ? { direction: m.direction } : {}), ...(m.routing ? { routing: m.routing } : {}), ...(m.layerNames ? { layerNames: m.layerNames } : {}), ...(m.radar?.length ? { radar: m.radar } : {}), ...(m.phases?.length ? { phases: m.phases } : {}), ...(m.datasets?.length ? { datasets: m.datasets } : {}), ...(m.edgeTypes?.length ? { edgeTypes: m.edgeTypes } : {}), ...(m.dismissed ? { dismissed: m.dismissed } : {}), groups: m.groups, nodes: m.nodes, edges: m.edges, ...(m.notes?.length ? { notes: m.notes } : {}), ...(m.zones?.length ? { zones: m.zones } : {}) });
    d.nodes.forEach(n => { n.x = Math.round(n.x); n.y = Math.round(n.y); });
    return d;
  };
  const prepared = v => { const d = normalize(clone(v.diagram)); ensurePositions(d); return d; };
  const canon = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(j => [j, x[j]])) : x));
  const isDirty = v => canon(snapshotOf(prepared(v))) !== canon(snapshotOf(S.model));
  // Cambia el estado: registra quién decidió y cuándo (aprobado/rechazado) y añade la entrada al historial
  function setVerStatus(v, st) {
    v.status = st;
    const dec = st === 'approved' || st === 'rejected';
    if (dec) { const by = store.get('approver', ''); if (by) v.decidedBy = by; else delete v.decidedBy; v.decidedOn = today(); } else { delete v.decidedBy; delete v.decidedOn; }
    if (st !== 'rejected') delete v.reason;
    if (st === 'review') v.reviewSince = today();   // empieza una ronda de aprobación: las firmas anteriores ya no cuentan
    if (st === 'approved' && !v.decidedBy) { const a = approvalState('version', v, S.model); if (a.complete) v.decidedBy = apprNames(a.approved); }   // campo de compatibilidad: los nombres de quienes aprobaron
    const e = { status: st, date: today() };
    if (v.decidedBy) e.by = v.decidedBy;
    (v.history ||= []).push(e);
  }
  // Mantiene la última entrada del historial al día si se edita quién, cuándo o el motivo
  function syncHist(v) {
    const e = v.history?.[v.history.length - 1];
    if (!e || e.status !== v.status) return;
    if (v.decidedOn) e.date = v.decidedOn;
    ['by', 'reason'].forEach(k => { const x = k === 'by' ? v.decidedBy : v.reason; if (x) e[k] = x; else delete e[k]; });
  }
  const decLabel = v => T(`ver.${v.status}By`);
  const decided = v => (v.status === 'approved' || v.status === 'rejected') && (v.decidedBy || v.decidedOn);
  const decText = v => [v.decidedBy ? `${decLabel(v)} ${v.decidedBy}` : T(`ver.st.${v.status}`), fmtDay(v.decidedOn)].filter(Boolean).join(' · ');
  const verMeta = v => [decided(v) ? decText(v) : '', v.author, v.created === v.updated ? T('ver.createdOn', { date: fmtDay(v.created) }) : T('ver.dates', { a: fmtDay(v.created), b: fmtDay(v.updated) }), T('meta.nodes', v.diagram.nodes?.length || 0)].filter(Boolean).join(' · ');
  const fmtDate = iso => { const d = new Date(iso); return isNaN(d) ? '' : new Intl.DateTimeFormat(I.lang, { dateStyle: 'medium', timeStyle: 'short' }).format(d); };

  // Los cambios en las versiones van al historial: ⌘Z deshace guardar, abrir o eliminar
  function versionsChanged() {
    save();
    updateUndoButtons();
    updateMeta();
    renderVersions();
  }
  // Hallazgos de revisión abiertos dentro de la foto de una versión
  const openFindings = v => (v.diagram?.nodes || []).filter(n => n.review && n.review.status !== 'resolved');
  async function saveVersion(kind = 'version', env, { force } = {}) {
    const vs = S.model.versions, note = S.verNote.trim();
    if (kind === 'env' && !C.environments?.[env]) return;
    let v = kind === 'env' ? vs.find(x => x.kind === 'env' && x.env === env) : null;
    // Actualizar algo aprobado lo devuelve a revisión: se pide confirmación
    if (v?.status === 'approved' && !force && !(await confirmBox({ title: T('ver.cf.updTitle', { name: verLabel(v) }), text: T('ver.cf.updText'), ok: T('ver.saveHere'), cancel: T('ver.cf.cancel') }))) return;
    pushHistory();
    const existed = !!v;
    if (!v) {
      const n = Math.max(0, ...vs.filter(x => x.kind === 'version').map(x => x.n)) + 1;
      let id = kind === 'env' ? `env-${env}` : `v${n}`;
      while (vs.some(x => x.id === id)) id += '_';
      v = kind === 'env' ? { id, kind, env } : { id, kind, n };
      v.status = 'draft';
      v.created = today();
      v.history = [{ status: 'draft', date: v.created }];
      const author = store.get('author', '') || S.model.meta?.author;
      if (author) v.author = author;
      vs.push(v);
    }
    // Si cambia el contenido de algo aprobado o rechazado, vuelve a revisión
    const reset = existed && (v.status === 'approved' || v.status === 'rejected');
    if (reset) setVerStatus(v, 'review');
    if (note) v.note = note;
    v.updated = today();
    v.savedAt = new Date().toISOString();
    v.diagram = snapshotOf(S.model);
    v.decisions = clone(S.model.decisions || []);   // aparte del diagrama: isDirty y openVersion las ignoran
    S.model.active = v.id;
    S.verNote = '';
    versionsChanged();
    if (S.compare) { applyCompare(); renderAdr(true); }
    toast(T(reset ? 'ver.updatedReset' : existed ? 'ver.updated' : 'ver.saved', { name: verLabel(v) }), reset ? 3200 : 1800);
  }
  function openVersion(id) {
    const v = findVersion(id);
    if (!v) return;
    S.sel = null;
    setModel({ ...clone(v.diagram), versions: S.model.versions, active: v.id, decisions: S.model.decisions, requirements: S.model.requirements, raid: S.model.raid, stakeholders: S.model.stakeholders, comments: S.model.comments }, { current: true, history: true });
    toast(T('ver.opened', { name: verLabel(v) }));
  }
  async function deleteVersion(id, { force } = {}) {
    const v = findVersion(id);
    if (!v) return;
    if (v.status === 'approved' && !force && !(await confirmBox({ title: T('ver.cf.delTitle', { name: verLabel(v) }), text: T('ver.cf.delText'), ok: T('ver.delete'), cancel: T('ver.cf.cancel'), danger: true }))) return;
    pushHistory();
    S.model.versions = S.model.versions.filter(x => x.id !== id);
    pruneAdrLinks();
    if (S.model.active === id) delete S.model.active;
    if (S.compare?.id === id) S.compare = null;
    applyCompare();
    versionsChanged();
    toast(T('ver.deleted', { name: verLabel(v) }));
  }
  // Borra solo el historial de estados; el estado actual, quién decidió y el motivo no se tocan. Entra en Deshacer
  async function clearVerHistory(id) {
    const v = findVersion(id);
    if (!v?.history?.length) return;
    if (!(await phraseBox({ title: T('ver.cf.histTitle', { name: verLabel(v) }), text: T('ver.cf.histText', { name: verLabel(v) }), phrase: T('ver.cf.phrase'), ok: T('ver.clearHist'), cancel: T('ver.cf.cancel') }))) return;
    pushHistory();
    delete v.history;
    versionsChanged();
    toast(T('ver.histCleared', { name: verLabel(v) }));
  }
  function compareVersion(id) {
    S.compare = id && S.compare?.id !== id && findVersion(id) ? { id } : null;
    applyCompare();
    renderVersions();
    renderAdr(true);
  }

  // Diferencias entre lo guardado (a) y el lienzo (b). La posición no cuenta como cambio.
  const DIFF_FIELDS = {
    node: ['label', 'type', 'icon', 'sub', 'badge', 'group', 'color', 'cost', 'costPeriod', 'costYears', 'data', 'review', 'desc', 'owner', 'steward', 'team', 'costCenter', 'region', 'layer', 'exposure', 'backup', 'controls', 'in', 'c4', 'sla', 'rpo', 'rto', 'replicas', 'disposition', 'radar', 'effort', 'phase', 'until'],
    edge: ['label', 'style', 'weight', 'route', 'both', 'color', 'data', 'encrypted', 'datasets', 'latency', 'transferOk', 'threats', 'phase', 'until'],
    group: ['label', 'icon', 'color', 'parent', 'kind', 'owner', 'steward', 'team', 'costCenter', 'region', 'layer', 'controls', 'in', 'phase', 'until'],
    type: ['label', 'dash', 'color', 'width', 'particles'] // tipos de conexión propios (model.edgeTypes), por id
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
    // Tipos de conexión propios: las versiones guardadas antes de que existieran no los tienen (lista vacía)
    const ty = cmp(a.edgeTypes || [], b.edgeTypes || [], t => t.id, DIFF_FIELDS.type);
    d.types = { added: ty.added, removed: ty.removed, changed: ty.changed.map(c => ({ id: c.item.id, item: c.item, fields: c.fields })) };
    d.typeN = d.types.added.length + d.types.removed.length + d.types.changed.length; // no entra en count: «cambiados» se refiere a componentes, conexiones y grupos
    const sum = k => d.nodes[k].length + d.edges[k].length + d.groups[k].length;
    d.count = { a: sum('added'), r: sum('removed'), c: sum('changed') + (d.title ? 1 : 0) };
    return d;
  }

  /* ---------- decisiones (ADR): comparar entre versiones ---------- */
  const ADR_DIFF = ['title', 'status', 'context', 'decision', 'consequences', 'deciders', 'supersededBy', 'area', 'criteria', 'options', 'chosen', 'links', 'signoffs'];
  // a = decisiones de la versión, b = las actuales. El historial no cuenta como cambio por sí solo.
  function diffDecisions(a, b) {
    const am = new Map((a || []).map(d => [d.id, d])), bm = new Map((b || []).map(d => [d.id, d]));
    const val = x => (x == null ? '' : typeof x === 'object' ? canon(x) : String(x));
    return {
      added: [...bm.keys()].filter(id => !am.has(id)),
      removed: [...am.keys()].filter(id => !bm.has(id)),
      changed: [...bm.keys()].filter(id => am.has(id)).map(id => ({ id, fields: ADR_DIFF.filter(f => val(am.get(id)[f]) !== val(bm.get(id)[f])) })).filter(c => c.fields.length)
    };
  }
  const adrDiffN = d => d.added.length + d.removed.length + d.changed.length;
  // Comparación activa: { v, diff } o { v, diff: null } si la versión se guardó sin decisiones; null si no se compara
  function adrCmp() {
    const v = S.compare && findVersion(S.compare.id);
    return v ? { v, diff: Array.isArray(v.decisions) ? diffDecisions(v.decisions, S.model.decisions || []) : null } : null;
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
    $('#compare-text').innerHTML = `${T('ver.comparing', { name: esc(verLabel(v)) })} · ${d.count.a + d.count.r + d.count.c + d.typeN ? esc(T('ver.summary', d.count)) : esc(T('ver.same'))}${d.typeN ? ` · ${esc(typesBarText(d))}` : ''}${cstVerLine(base, S.model) ? ` · ${esc(cstVerLine(base, S.model))}` : ''}${adrBarText()}`;
  }
  // «Tipos +1 −0 ~1»: resumen de los cambios en los tipos de conexión propios al comparar
  const typesBarText = d => T('ver.types.bar', { a: d.types.added.length, r: d.types.removed.length, c: d.types.changed.length });
  function adrBarText() { const c = adrCmp(), n = c?.diff && adrDiffN(c.diff); return n ? ` · ${esc(T('adr.cmp.bar', { a: c.diff.added.length, r: c.diff.removed.length, c: c.diff.changed.length }))}` : ''; }
  function drawGhosts() {
    L.ghosts.textContent = '';
    const { base, diff: d } = S.compare;
    const cur = new Map(S.model.nodes.map(n => [n.id, n])), old = new Map(base.nodes.map(n => [n.id, n]));
    const rect = id => { const n = cur.get(id) || old.get(id); return n && { x: n.x, y: n.y, w: R.width.get(id) || nodeWidth(n), h: H }; };
    const lvl = id => scopeId(cur.get(id) || old.get(id));
    d.edges.removed.forEach(e => {
      const a = rect(e.from), b = rect(e.to);
      if (lvl(e.from) !== S.scope || lvl(e.to) !== S.scope) return;
      if (a && b && e.from !== e.to) el('path', { class: 'ghost-edge', d: routeOf(e) === 'elbow' ? elbowPath(a, b, 0, []) : curvePath(a, b, 0) }, L.ghosts);
    });
    d.nodes.removed.forEach(n => {
      if (scopeId(n) !== S.scope) return;
      const w = nodeWidth(n), g = el('g', { class: 'ghost', transform: `translate(${n.x} ${n.y})` }, L.ghosts);
      el('rect', { class: 'ghost-card', width: w, height: H, rx: C.node.radius }, g);
      el('text', { x: 18, y: H / 2 + 5 }, g).textContent = fitText(`− ${n.label}`, FONT.label, w - 30);
    });
  }

  function renderVersions() {
    const box = $('#versions');
    if (!box || !S.model) return;
    renderPhases();
    const vs = S.model.versions, envs = Object.entries(C.environments || {});
    const nextN = Math.max(0, ...vs.filter(v => v.kind === 'version').map(v => v.n)) + 1;
    // Conserva el foco (y el cursor) si se estaba escribiendo en un campo del panel
    const act = document.activeElement, fkey = act?.id === 'ver-note' ? '#ver-note' : act?.dataset?.vfield ? `.ver[data-id="${CSS.escape(act.closest('.ver')?.dataset.id || '')}"] [data-vfield="${act.dataset.vfield}"]` : null;
    const caret = fkey && 'selectionStart' in act && act.type !== 'date' ? [act.selectionStart, act.selectionEnd] : null;
    const card = v => {
      const on = v.id === S.model.active, cmp = S.compare?.id === v.id, dirty = on && isDirty(v), editing = S.verEdit === v.id;
      return `<div class="ver${on ? ' on' : ''}${cmp ? ' cmp' : ''}" data-id="${esc(v.id)}" style="--c:${verColor(v)};--s:${VSTATUS[v.status]}">
        <div class="ver-head"><span class="dot"></span><b>${esc(verLabel(v))}</b><span class="ver-status">${esc(T(`ver.st.${v.status}`))}</span>
          <span class="ver-tools">
            <button class="btn small icon${editing ? ' on' : ''}" data-ver="edit" title="${esc(T(editing ? 'ver.editDone' : 'ver.edit'))}" aria-label="${esc(T('ver.edit'))}">${editing ? ICON.check : ICON.pencil}</button>
            <button class="btn small danger icon" data-ver="delete" title="${esc(T('ver.delete'))}" aria-label="${esc(T('ver.delete'))}">${ICON.x}</button>
          </span></div>
        ${v.status === 'approved' && openFindings(v).length ? `<div class="ver-warn">⚑ ${esc(T('ver.openFindings', openFindings(v).length))}</div>` : ''}
        ${on ? `<div class="ver-flag${dirty ? ' dirty' : ''}">${esc(T(dirty ? 'ver.dirty' : 'ver.current'))}</div>` : ''}
        <div class="ver-meta">${esc(verMeta(v))}</div>
        ${adrChips(decisionsOf('versions', v.id))}
        ${apprSection('version', v)}
        ${v.note && !editing ? `<div class="ver-note">${esc(v.note)}</div>` : ''}
        ${v.status === 'rejected' && !v.reason ? `<div class="ver-warn">${esc(T('ver.reasonWarn'))}</div>` : ''}
        ${editing ? `<div class="ver-form">
          <label>${T('ver.name')}<input data-vfield="name" value="${esc(v.name || '')}" maxlength="40" placeholder="${esc(T('ver.name.ph'))}" autocomplete="off"></label>
          <label>${T('ver.status')}<select data-vfield="status">${Object.keys(VSTATUS).map(k => `<option value="${k}"${k === v.status ? ' selected' : ''}>${esc(T(`ver.st.${k}`))}</option>`).join('')}</select></label>
          ${v.status === 'approved' || v.status === 'rejected' ? `<div class="ver-dates">
            <label>${esc(decLabel(v))}<input data-vfield="decidedBy" value="${esc(v.decidedBy || '')}" placeholder="${esc(T('ver.author.ph'))}" autocomplete="off"></label>
            <label>${T('ver.decidedOn')}<input type="date" data-vfield="decidedOn" value="${esc(v.decidedOn || '')}"></label>
          </div>` : ''}
          ${v.status === 'rejected' ? `<label>${T('ver.reason')}<textarea data-vfield="reason" rows="2" placeholder="${esc(T('ver.reason.ph'))}">${esc(v.reason || '')}</textarea></label>` : ''}
          <label>${T('ver.author')}<input data-vfield="author" value="${esc(v.author || '')}" placeholder="${esc(T('ver.author.ph'))}" autocomplete="off"></label>
          <div class="ver-dates">
            <label>${T('ver.created')}<input type="date" data-vfield="created" value="${esc(v.created)}"></label>
            <label>${T('ver.updatedOn')}<input type="date" data-vfield="updated" value="${esc(v.updated)}"></label>
          </div>
          <label>${T('ver.note')}<textarea data-vfield="note" rows="2" placeholder="${esc(T('ver.note.ph'))}">${esc(v.note || '')}</textarea></label>
          ${v.history?.length ? `<div class="ver-hist"><span>${T('ver.history')}<button class="ver-hist-clear" data-ver="clearHist">${T('ver.clearHist')}</button></span><ul>${v.history.map(h => `<li style="--s:${VSTATUS[h.status]}">${[fmtDay(h.date), T(`ver.st.${h.status}`), h.by, h.reason].filter(Boolean).map((x, i) => i === 1 ? `<b>${esc(x)}</b>` : esc(x)).join(' · ')}</li>`).join('')}</ul></div>` : ''}
        </div>` : ''}
        ${cmp && S.compare.diff ? diffList(S.compare.diff) : ''}
        <div class="ver-actions">
          <button class="btn small" data-ver="open" title="${esc(T('ver.openTip'))}">${T('ver.open')}</button>
          <button class="btn small${cmp ? ' on' : ''}" data-ver="compare" title="${esc(T('ver.compareTip'))}">${T(cmp ? 'ver.stop' : 'ver.compare')}</button>
          ${v.kind === 'env' ? `<button class="btn small" data-ver="update" title="${esc(T('ver.saveHereTip'))}">${T('ver.saveHere')}</button>` : ''}
          <button class="btn small" data-cst-cmp title="${esc(T('cst.compareCosts.tip'))}">${T('cst.compareCosts')}</button>
          <button class="btn small" data-adr="newver" title="${esc(T('adr.newForVer'))}" aria-label="${esc(T('adr.newForVer'))}">+ ADR</button>
        </div>
      </div>`;
    };
    // Filtro por estado: si el guardado ya no tiene entradas, vuelve a Todos
    const counts = Object.fromEntries(Object.keys(VSTATUS).map(k => [k, vs.filter(v => v.status === k).length]));
    let fil = store.get('verFilter', 'all');
    if (!counts[fil]) fil = 'all';
    const shown = v => fil === 'all' || v.status === fil;
    const chip = (k, n, label, color) => `<button class="vchip${fil === k ? ' on' : ''}" data-vfilter="${k}" aria-pressed="${fil === k}"${color ? ` style="--s:${color}"` : ''}>${esc(label)} <b>${n}</b></button>`;
    const filterBar = vs.length < 2 ? '' : `<div class="ver-filter" role="group" aria-label="${esc(T('ver.filter'))}">${chip('all', vs.length, T('ver.f.all'))}${Object.keys(VSTATUS).filter(k => counts[k]).map(k => chip(k, counts[k], T(`ver.st.${k}`), VSTATUS[k])).join('')}</div>`;
    const section = (title, list) => ((list = list.filter(shown)).length ? `<div class="cat">${esc(title)}</div>${list.map(card).join('')}` : '');
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
      ${filterBar}
      <div class="ver-list">${section(T('ver.envs'), envList)}${section(T('ver.versions'), vs.filter(v => v.kind === 'version').sort((a, b) => b.n - a.n))}</div>
      ${vs.length && !vs.some(shown) ? `<p class="empty-list">${esc(T('ver.f.none'))} <button class="btn small" data-vfilter="all">${esc(T('ver.f.clear'))}</button></p>` : ''}
      ${vs.length ? '' : `<p class="empty-list">${esc(T('ver.empty'))}</p>`}`;
    const back = fkey && box.querySelector(fkey);
    if (back) { back.focus(); if (caret) back.setSelectionRange(...caret); }
  }
  function diffList(d) {
    if (!(d.count.a + d.count.r + d.count.c + d.typeN)) return `<p class="ver-sum">${esc(T('ver.same'))}</p>`;
    const FIELD = { label: 'insp.name', sub: 'insp.detail', type: 'insp.type', icon: 'insp.icon', group: 'insp.group', color: 'insp.color', badge: 'field.badge',
      cost: 'cost.label', costPeriod: 'cost.period', costYears: 'cost.yearsAria', desc: 'insp.desc', style: 'insp.style', weight: 'wt.label', parent: 'insp.parent',
      data: 'data.label', encrypted: 'enc.label', route: 'insp.route', both: 'insp.dir', review: 'rev.label', kind: 'gkind.label', phase: 'phase.label', until: 'phase.until', disposition: 'mig.label', radar: 'radar.label', exposure: 'sec.expo.label', backup: 'sec.backup.label', controls: 'cmp.title', in: 'c4.in', c4: 'c4.label', sla: 'res.sla', rpo: 'res.rpo', rto: 'res.rto', replicas: 'res.replicas', latency: 'ds.latency', dash: 'et.dash', width: 'et.width', particles: 'et.particles' };
    const fields = (fs, kind) => fs.map(f => T(kind === 'edge' && f === 'label' ? 'insp.label' : kind === 'type' && f === 'label' ? 'et.label' : FIELD[f] || f).toLowerCase()).join(', ');
    const names = new Map([...S.compare.base.nodes, ...S.model.nodes].map(n => [n.id, n.label]));
    const edgeName = e => `${names.get(e.from) || e.from} ${e.both ? '↔' : '→'} ${names.get(e.to) || e.to}`;
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
    d.types.added.forEach(t => rows.push(['add', t.label, T('ver.type')]));
    d.types.changed.forEach(c => rows.push(['chg', c.item.label, `${T('ver.type')}: ${fields(c.fields, 'type')}`]));
    d.types.removed.forEach(t => rows.push(['del', t.label, T('ver.type')]));
    const cl = cstVerLine(S.compare.base, S.model);
    return `<p class="ver-sum">${esc(T('ver.summary', d.count))}</p>${d.typeN ? `<p class="ver-sum">${esc(typesBarText(d))}</p>` : ''}${cl ? `<p class="ver-sum cst-vline">${esc(cl)}</p>` : ''}<ul class="diff-list">${rows.map(([k, name, extra, id]) =>
      `<li class="d-${k}"${id ? ` data-goto="${esc(id)}"` : ''}><i>${k === 'add' ? '+' : k === 'del' ? '−' : '~'}</i><span title="${esc(name)}">${esc(name)}</span>${extra ? `<em title="${esc(extra)}">${esc(extra)}</em>` : ''}</li>`).join('')}</ul>`;
  }

  const versionsBox = $('#versions');
  const onVerField = ev => {
    const f = ev.target, k = f.dataset?.vfield, v = k && findVersion(f.closest('.ver')?.dataset.id);
    if (!v) return;
    const val = k === 'name' ? f.value.trim().slice(0, 40) : f.value.trim();
    if (k === 'status') {
      if (!VSTATUS[val] || val === v.status) return;
      const open = val === 'approved' ? openFindings(v) : [], gap = val === 'approved' ? apprMissing('version', v) : [];
      if (open.length || gap.length) {
        // Aprobar con hallazgos abiertos o sin todas las firmas: se restaura el estado y se pregunta (select dispara input y change)
        f.value = v.status;
        if (S.verAsk) return;
        S.verAsk = true;
        (async () => {
          let ok = true;
          if (gap.length) ok = await confirmBox({ title: T('appr.cf.vtitle'), text: T('appr.cf.vtext', gap.join(', ')), ok: T('appr.cf.ok'), cancel: T('ver.cf.cancel') });
          if (ok && open.length) {
            const list = open.slice(0, 5).map(n => `${n.label}${n.review.note ? `: ${n.review.note}` : ''}`);
            if (open.length > 5) list.push(`… +${open.length - 5}`);
            ok = await confirmBox({ title: T('ver.cf.apprTitle', open.length), text: T('ver.cf.apprText'), list, ok: T('ver.cf.apprOk'), cancel: T('ver.cf.cancel') });
          }
          S.verAsk = false;
          if (!ok || !findVersion(v.id) || v.status === 'approved') return;
          markEdit(); setVerStatus(v, 'approved'); endEdit();
          store.set('model', S.model);
          updateMeta();
          renderVersions();
          toast(T('ver.statusSet', { name: verLabel(v), status: T('ver.st.approved') }));
        })();
        return;
      }
    }
    else if ((k === 'created' || k === 'updated' || k === 'decidedOn') && !isDay(val)) return;
    markEdit();
    if (k === 'status') setVerStatus(v, val);
    else if (k === 'created' || k === 'updated' || k === 'decidedOn') v[k] = val;
    else if (val) { v[k] = k === 'note' ? f.value : val; if (k === 'author') store.set('author', val); if (k === 'decidedBy') store.set('approver', val); }
    else delete v[k];
    if (k === 'decidedBy' || k === 'decidedOn' || k === 'reason') syncHist(v);
    if (k === 'status') { endEdit(); toast(T('ver.statusSet', { name: verLabel(v), status: T(`ver.st.${val}`) })); }
    // Pinta al momento el estado y la línea de datos; el resto se guarda en segundo plano
    const c = f.closest('.ver');
    c.style.setProperty('--s', VSTATUS[v.status]);
    c.querySelector('.ver-status').textContent = T(`ver.st.${v.status}`);
    c.querySelector('.ver-meta').textContent = verMeta(v);
    c.querySelector('.ver-head b').textContent = verLabel(v);
    const warn = c.querySelector('.ver-warn');
    if (warn) warn.hidden = !!v.reason;
    store.set('model', S.model);
    updateMeta();
    if (k === 'status') renderVersions();
  };
  versionsBox.addEventListener('input', ev => { if (ev.target.id === 'ver-note') S.verNote = ev.target.value; else onVerField(ev); });
  versionsBox.addEventListener('change', onVerField);
  versionsBox.addEventListener('focusin', ev => { if (ev.target.dataset?.vfield) beginEdit(); });
  versionsBox.addEventListener('focusout', ev => { if (ev.target.dataset?.vfield) endEdit(); });
  versionsBox.addEventListener('keydown', ev => { if (ev.target.id === 'ver-note' && ev.key === 'Enter') saveVersion('version'); });
  versionsBox.addEventListener('click', ev => {
    const goto = ev.target.closest('[data-goto]');
    if (goto) return select({ kind: 'node', id: goto.dataset.goto }, { center: true });
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.save) return saveVersion(b.dataset.save, b.dataset.env);
    if (b.dataset.apprDo) return apprDo(b, 'version', b.closest('.ver')?.dataset.id);
    if (b.dataset.vfilter) {
      store.set('verFilter', b.dataset.vfilter === store.get('verFilter', 'all') ? 'all' : b.dataset.vfilter);
      renderVersions();
      return versionsBox.querySelector('.ver-filter .on')?.focus();
    }
    const id = b.closest('.ver')?.dataset.id;
    if (b.dataset.ver === 'open') openVersion(id);
    else if (b.dataset.ver === 'compare') compareVersion(id);
    else if (b.dataset.ver === 'update') { const v = findVersion(id); if (v) saveVersion('env', v.env); }
    else if (b.dataset.ver === 'delete') deleteVersion(id);
    else if (b.dataset.ver === 'clearHist') clearVerHistory(id);
    else if (b.dataset.ver === 'edit') {
      S.verEdit = S.verEdit === id ? null : id;
      renderVersions();
      if (S.verEdit) versionsBox.querySelector(`.ver[data-id="${CSS.escape(id)}"] [data-vfield="author"]`)?.focus();
    }
  });
  $('#compare-exit').addEventListener('click', () => compareVersion(null));
  $('#path-exit').addEventListener('click', clearPath);

  /* ---------- costos: desglose por equipo/centro/etc. y escenarios (actual vs propuesto) ---------- */
  const CST_BY = ['team', 'costCenter', 'owner', 'group', 'type', 'provider', 'region', 'layer'];
  // { key, label, monthly, nodes: [ids], unassigned?, filter? } por cada valor de `by`; solo cuentan los nodos con costo. `filter` = ficha equivalente del filtro del lienzo
  // `by = 'group'`: árbol por ruta de grupos (ver costByGroup); `by = 'groupTop'`: el modo plano anterior (solo el grupo de nivel superior)
  function costBreakdown(m = S.model, by = 'team') {
    const flat = by === 'groupTop';
    if (flat) by = 'group';
    if (!CST_BY.includes(by)) by = 'team';
    if (by === 'group' && !flat) return costByGroup(m);
    const gm = new Map(m.groups.map(g => [g.id, g]));
    const top = n => { let g = gm.get(n.group), i = 0; while (g && gm.has(g.parent) && i++ < 50) g = gm.get(g.parent); return g || null; };
    const lay = n => { if (DL[n.layer]) return n.layer; let g = gm.get(n.group), i = 0; while (g && i++ < 50) { if (DL[g.layer]) return g.layer; g = gm.get(g.parent); } return null; };
    const NONE = { team: '@none', owner: '@none', region: '@none', layer: '@none' };
    const keyOf = n => {
      if (GOV_FIELDS.includes(by)) { const v = govOf(n, by, m).value; return v ? { key: v, label: v, filter: v } : null; }
      if (by === 'group') { const g = top(n); return g ? { key: g.id, label: g.label, filter: g.id } : null; }
      if (by === 'type') { const t = C.types[n.type] ? n.type : 'generic'; return { key: t, label: typeLabel(t) }; }
      if (by === 'provider') { const p = providerOf(n); return { key: p, label: p === 'generic' ? T('flt.generic') : ICONS[p].label, filter: p }; }
      if (by === 'region') { const r = regionOf(n, m).value; return r ? { key: r, label: regionLabel(r), filter: jurOf(r)?.key || '@none' } : null; }
      const l = lay(n); return l ? { key: l, label: layerInfo(l).label, filter: l } : null;
    };
    const map = new Map();
    m.nodes.filter(hasCost).forEach(n => {
      const k = keyOf(n) || { key: '@none', label: T('cst.unassigned'), unassigned: true, filter: NONE[by] };
      if (!map.has(k.key)) map.set(k.key, { key: k.key, label: k.label, monthly: 0, nodes: [], ...(k.unassigned ? { unassigned: true } : {}), ...(k.filter ? { filter: { [by]: [k.filter] } } : {}) });
      const r = map.get(k.key);
      r.monthly += perMonth(n);
      r.nodes.push(n.id);
    });
    return [...map.values()].sort((a, b) => b.monthly - a.monthly || a.label.localeCompare(b.label));
  }
  // Desglose jerárquico por ruta de grupos. Una fila por grupo (y por nivel C4 que contenga grupos con costo), en orden de árbol
  // (profundidad primero; hermanos por subtotal desc). Campos: key (id de grupo), path (ids desde la raíz), pathKey, pathLabel («A › B › C»), depth,
  // own (costo mensual de los componentes DIRECTOS), total (con descendientes), monthly (= own: sumar `monthly` de todas las filas da el total sin duplicar;
  // para sumar por ramas, sumar `total` solo de las filas depth 0), nodes (ids directos), nodesAll (ids con descendientes), kind ('group' | 'level' | 'none').
  // Grupos dentro de un diagrama interno (group.in): cuelgan de una fila «nivel» (key `@in:<id del nodo>`, own 0) con la ruta de niveles (scopePath);
  // el nodo-nivel aparece como rama de nivel superior, no bajo su propio grupo. Sin grupo → cubeta «Sin asignar» (key '@none', depth 0, al final de su orden).
  function costByGroup(m = S.model) {
    const gm = new Map(m.groups.map(g => [g.id, g])), nm = new Map(m.nodes.map(n => [n.id, n])), rows = new Map();
    const mk = (key, label, kind, parent, extra = {}) => { const r = { key, label, kind, parent, own: 0, total: 0, nodes: [], nodesAll: [], children: [], ...extra }; rows.set(key, r); parent?.children.push(r); return r; };
    const level = (id, i = 0) => {
      const n = nm.get(id); if (!id || !n || i > 50) return null;
      const k = `@in:${id}`;
      return rows.get(k) || mk(k, n.label, 'level', level(n.in, i + 1));
    };
    const grp = (id, seen = new Set()) => {
      if (rows.has(id)) return rows.get(id);
      const g = gm.get(id); if (!g || seen.has(id)) return null;
      seen.add(id);
      const par = g.parent && gm.has(g.parent) ? grp(g.parent, seen) : level(g.in);
      return rows.get(id) || mk(id, g.label, 'group', par, { filter: { group: [id] } });
    };
    let none = null;
    m.nodes.filter(hasCost).forEach(n => {
      const v = perMonth(n), r = n.group && gm.has(n.group) ? grp(n.group) : null;
      const own = r || (none ||= mk('@none', T('cst.unassigned'), 'none', null, { unassigned: true, filter: { group: ['@none'] } }));
      own.own += v; own.nodes.push(n.id);
      for (let x = own, i = 0; x && i++ < 60; x = x.parent) { x.total += v; x.nodesAll.push(n.id); }
    });
    const out = [], cmp = (a, b) => b.total - a.total || a.label.localeCompare(b.label);
    const walk = (r, path, labels) => {
      const p = [...path, r.key], l = [...labels, r.label];
      out.push({ key: r.key, label: r.label, path: p, pathKey: p.join('/'), pathLabel: l.join(' › '), depth: p.length - 1, own: r.own, total: r.total, monthly: r.own, nodes: r.nodes, nodesAll: r.nodesAll, kind: r.kind, hasChildren: r.children.length > 0,
        ...(r.unassigned ? { unassigned: true } : {}), ...(r.filter ? { filter: r.filter } : {}) });
      r.children.sort(cmp).forEach(c => walk(c, p, l));
    };
    [...rows.values()].filter(r => !r.parent).sort(cmp).forEach(r => walk(r, [], []));
    return out;
  }
  // Origen de una comparación: null = lienzo; id = foto de una versión (copia normalizada, el lienzo no se toca)
  function cstSource(id) {
    if (id) { const v = findVersion(id); return v?.diagram ? { id, label: `${verLabel(v)} · ${T(`ver.st.${v.status}`)}`, m: prepared(v) } : null; }
    return { id: null, label: T('cst.canvas'), m: S.model };
  }
  const cstSame = (a, b) => Math.abs(a - b) < 0.005;
  function cstCompare(A, B) {
    const am = new Map(A.m.nodes.map(n => [n.id, n])), bm = new Map(B.m.nodes.map(n => [n.id, n]));
    const val = n => (n && hasCost(n) ? perMonth(n) : 0);
    const rows = [...new Set([...am.keys(), ...bm.keys()])].filter(id => hasCost(am.get(id) || {}) || hasCost(bm.get(id) || {})).map(id => {
      const a = val(am.get(id)), b = val(bm.get(id));
      return { id, label: (bm.get(id) || am.get(id)).label, a, b, delta: b - a, status: !am.has(id) ? 'added' : !bm.has(id) ? 'removed' : cstSame(a, b) ? 'same' : 'changed' };
    });
    const ma = monthlyTotal(A.m.nodes), mb = monthlyTotal(B.m.nodes);
    return { a: { label: A.label, monthly: ma }, b: { label: B.label, monthly: mb }, delta: mb - ma, deltaPct: ma ? (mb - ma) / ma * 100 : null, rows };
  }
  // Cambio por clave de agrupación entre dos orígenes: [{ key, label, a, b, delta }] por |delta|
  function cstDeltaBy(A, B, by) {
    if (by === 'group') return cstDeltaGroups(A, B);
    const out = new Map();
    [[A, 'a'], [B, 'b']].forEach(([s, f]) => costBreakdown(s.m, by).forEach(r => {
      if (!out.has(r.key)) out.set(r.key, { key: r.key, label: r.label, a: 0, b: 0, ...(r.unassigned ? { unassigned: true } : {}) });
      out.get(r.key)[f] += r.monthly;
    }));
    return [...out.values()].map(r => ({ ...r, delta: r.b - r.a })).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || x.label.localeCompare(y.label));
  }
  // Cambio por grupo alineando por la ruta de ids (pathKey): a / b = subtotal (con descendientes), oa / ob = costo directo; status added/removed/changed/same
  // (un grupo sin costo en un lado cuenta como ausente en ese lado). Orden de árbol; hermanos por |cambio| desc. Sumar `delta` solo de las filas depth 0.
  function cstDeltaGroups(A, B) {
    const out = new Map();
    [[A, 'a'], [B, 'b']].forEach(([s, f]) => costByGroup(s.m).forEach(r => {
      if (!out.has(r.pathKey)) out.set(r.pathKey, { key: r.key, label: r.label, path: r.path, pathKey: r.pathKey, pathLabel: r.pathLabel, depth: r.depth, kind: r.kind, a: 0, b: 0, oa: 0, ob: 0, inA: false, inB: false, ...(r.unassigned ? { unassigned: true } : {}) });
      const x = out.get(r.pathKey);
      x[f] = r.total; x[f === 'a' ? 'oa' : 'ob'] = r.own; x[f === 'a' ? 'inA' : 'inB'] = true;
      if (f === 'b') { x.label = r.label; x.pathLabel = r.pathLabel; }
    }));
    const all = [...out.values()].map(r => ({ ...r, delta: r.b - r.a, status: !r.inA ? 'added' : !r.inB ? 'removed' : cstSame(r.a, r.b) && cstSame(r.oa, r.ob) ? 'same' : 'changed' }));
    const kids = new Map();
    all.forEach(r => { const pk = r.path.slice(0, -1).join('/'), k = out.has(pk) ? pk : ''; if (!kids.has(k)) kids.set(k, []); kids.get(k).push(r); });
    const res = [], walk = r => { res.push(r); (kids.get(r.pathKey) || []).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || x.label.localeCompare(y.label)).forEach(walk); };
    (kids.get('') || []).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || x.label.localeCompare(y.label)).forEach(walk);
    return res;
  }
  const cstMoney = v => money(round2(v));
  const cstDelta = v => (cstSame(v, 0) ? cstMoney(0) : `${v > 0 ? '+' : '−'}${cstMoney(Math.abs(v))}`);
  const cstPct = (a, d) => (a ? `${d > 0 ? '+' : d < 0 ? '−' : ''}${(Math.abs(d) / a * 100).toFixed(1)}%` : '—');
  // «Costo: $A → $B (Δ)» para el resumen de la comparación con una versión ('' si ninguno de los dos tiene costo)
  const cstVerLine = (a, b) => {
    const ca = monthlyTotal(a.nodes), cb = monthlyTotal(b.nodes);
    return a.nodes.some(hasCost) || b.nodes.some(hasCost) ? T('cst.verCost', { a: `${cstMoney(ca)}${T('cost.mo')}`, b: `${cstMoney(cb)}${T('cost.mo')}`, d: `${cstDelta(cb - ca)}${T('cost.mo')}` }) : '';
  };
  const cstCSV = rows => '﻿' + rows.map(r => r.map(v => (typeof v === 'number' ? String(v) : csvCell(v))).join(',')).join('\r\n');
  let cstClose = null;
  function openCosts(tab = 'breakdown', opts = {}) {
    if (!S.model) return;
    cstClose?.();
    const prev = document.activeElement, back = document.createElement('div'), id = `cs${Date.now()}`;
    const vers = () => S.model.versions.slice().sort((a, b) => String(b.savedAt || b.updated || b.created || '').localeCompare(String(a.savedAt || a.updated || a.created || '')) || (b.n || 0) - (a.n || 0));
    const vs0 = vers(), defA = (vs0.find(v => v.status === 'approved') || vs0[0])?.id || null;
    const st = { tab: tab === 'compare' ? 'compare' : 'breakdown', by: CST_BY.includes(opts.by) ? opts.by : 'team', a: opts.a !== undefined ? opts.a : defA, b: opts.b !== undefined ? opts.b : null, only: false, sort: 'delta', dir: -1, exp: {} };
    let cur = [], cmp = null;
    const lvTag = r => (r.kind === 'level' ? ` [${T('cst.level')}]` : '');
    const indent = d => `style="padding-left:${10 + d * 18}px"`;
    const byOpts = () => CST_BY.map(k => `<option value="${k}"${k === st.by ? ' selected' : ''}>${esc(T(`cst.by.${k}`))}</option>`).join('');
    back.className = 'cf-back';
    back.innerHTML = `<div class="cf cm cst" role="dialog" aria-modal="true" aria-labelledby="${id}t">
      <div class="cm-head"><h3 id="${id}t">${esc(T('cst.title'))}</h3>
        <div class="cst-tabs" role="tablist">${['breakdown', 'compare'].map(k => `<button class="btn small" role="tab" data-cst-tab="${k}">${esc(T(`cst.tab.${k}`))}</button>`).join('')}</div>
        <span class="cm-btns"><button class="btn small" data-cst="csv">${esc(T('cst.csv'))}</button><button class="btn small" data-cst="close">${esc(T('cst.close'))}</button></span></div>
      <div class="cst-pane" data-pane="breakdown"><div class="cst-ctl"><label>${esc(T('cst.groupBy'))}<select data-cst="by"></select></label></div><div class="cm-scroll cst-out"></div></div>
      <div class="cst-pane" data-pane="compare"><div class="cst-ctl">
        <label>${esc(T('cst.a'))}<select data-cst="a"></select></label><label>${esc(T('cst.b'))}<select data-cst="b"></select></label>
        <label>${esc(T('cst.groupBy'))}<select data-cst="by2"></select></label>
        <label class="cst-chk"><input type="checkbox" data-cst="only">${esc(T('cst.onlyChanges'))}</label>
        <button class="btn small" data-cst="save">${esc(T('cst.saveProposed'))}</button></div><div class="cm-scroll cst-out"></div></div></div>`;
    const $q = s => back.querySelector(s), outs = { breakdown: $q('[data-pane="breakdown"] .cst-out'), compare: $q('[data-pane="compare"] .cst-out') };
    const verOpts = sel => `<option value=""${sel == null ? ' selected' : ''}>${esc(T('cst.canvas'))}</option>${vers().map(v => `<option value="${esc(v.id)}"${v.id === sel ? ' selected' : ''}>${esc(`${verLabel(v)} · ${T(`ver.st.${v.status}`)}`)}</option>`).join('')}`;
    const fillSelects = () => {
      if (st.a && !findVersion(st.a)) st.a = null;
      if (st.b && !findVersion(st.b)) st.b = null;
      $q('[data-cst="a"]').innerHTML = verOpts(st.a); $q('[data-cst="b"]').innerHTML = verOpts(st.b);
      $q('[data-cst="by"]').innerHTML = byOpts(); $q('[data-cst="by2"]').innerHTML = byOpts();
    };
    const bars = (v, tot) => { const p = tot > 0 ? Math.max(0, Math.min(100, v / tot * 100)) : 0; return `<span class="cst-pct"><span class="cst-bar"><i style="width:${p.toFixed(1)}%"></i></span><b>${p.toFixed(p >= 10 || p === 0 ? 0 : 1)}%</b></span>`; };
    const drawBreakdown = () => {
      cur = costBreakdown(S.model, st.by);
      if (!cur.length) { outs.breakdown.innerHTML = `<p class="cm-empty">${esc(T('cst.empty'))}</p>`; return; }
      const tot = cur.reduce((s, r) => s + r.monthly, 0), n = cur.reduce((s, r) => s + r.nodes.length, 0), tree = st.by === 'group';
      const open = r => (Object.hasOwn(st.exp, r.pathKey) ? st.exp[r.pathKey] === true : r.depth < 2);
      let hide = null; // en árbol: oculta las filas bajo un grupo contraído (orden de árbol: depth creciente dentro de la rama)
      const vis = tree ? cur.map(r => { if (hide != null && r.depth > hide) return false; hide = r.hasChildren && !open(r) ? r.depth : null; return true; }) : cur.map(() => true);
      const head = `<th>${esc(T(`cst.by.${st.by}`))}</th><th class="num">${esc(T('cst.col.components'))}</th>${tree ? `<th class="num">${esc(T('cst.col.own'))}</th><th class="num">${esc(T('cst.col.subtotal'))}</th>` : `<th class="num">${esc(T('cst.col.monthly'))}</th>`}<th class="num">${esc(T('cst.col.yearly'))}</th><th>${esc(T('cst.col.pct'))}</th>`;
      const row = (r, i) => {
        const name = r.filter ? `<button class="cst-key" data-i="${i}">${esc(r.label)}</button>` : esc(r.label);
        const tg = tree ? (r.hasChildren ? `<button class="cst-tg" data-cst-tg="${esc(r.pathKey)}" aria-expanded="${open(r) ? 'true' : 'false'}" aria-label="${esc(T(open(r) ? 'cst.collapse' : 'cst.expand', { g: r.label }))}">${open(r) ? '▾' : '▸'}</button>` : '<span class="cst-tg"></span>') : '';
        const v = tree ? r.total : r.monthly;
        return `<tr${r.filter ? ` class="cst-click" data-i="${i}" title="${esc(T('cst.rowTip'))}"` : ''}><td${r.unassigned ? ' class="cst-un"' : ''}${tree ? ` ${indent(r.depth)}` : ''}>${tg}${name}${esc(lvTag(r))}</td><td class="num">${tree ? r.nodesAll.length : r.nodes.length}</td>${tree ? `<td class="num">${r.own ? esc(cstMoney(r.own)) : '—'}</td><td class="num">${esc(cstMoney(r.total))}</td>` : `<td class="num">${esc(cstMoney(r.monthly))}</td>`}<td class="num">${esc(cstMoney(v * 12))}</td><td>${bars(v, tot)}</td></tr>`;
      };
      outs.breakdown.innerHTML = `<table class="cst-table"><thead><tr>${head}</tr></thead><tbody>${cur.map((r, i) => (vis[i] ? row(r, i) : '')).join('')}</tbody>
        <tfoot><tr><th>${esc(T('cst.total'))}</th><td class="num">${n}</td>${tree ? `<td class="num">${esc(cstMoney(tot))}</td>` : ''}<td class="num">${esc(cstMoney(tot))}</td><td class="num">${esc(cstMoney(tot * 12))}</td><td></td></tr></tfoot></table>`;
    };
    const drawCompare = () => {
      if (st.a && !findVersion(st.a)) st.a = null;
      if (st.b && !findVersion(st.b)) st.b = null;
      $q('[data-cst="a"]').value = st.a || ''; $q('[data-cst="b"]').value = st.b || '';
      const A = cstSource(st.a), B = cstSource(st.b), c = cmp = cstCompare(A, B), by = cstDeltaBy(A, B, st.by);
      const sk = st.sort, key = r => (sk === 'label' ? r.label.toLowerCase() : sk === 'a' ? r.a : sk === 'b' ? r.b : Math.abs(r.delta));
      const rows = c.rows.filter(r => !st.only || r.status !== 'same').sort((x, y) => (key(x) > key(y) ? 1 : key(x) < key(y) ? -1 : x.label.localeCompare(y.label)) * st.dir * (sk === 'label' ? -1 : 1));
      cmp.shown = rows; cmp.by = by;
      const th = (k, label, cls = '') => `<th class="${cls}"><button class="cst-sort${st.sort === k ? ' on' : ''}" data-cst-sort="${k}" aria-label="${esc(T('cst.sortBy', { c: label }))}">${esc(label)}${st.sort === k ? (st.dir < 0 ? ' ↓' : ' ↑') : ''}</button></th>`;
      const sumRow = (lbl, f) => `<tr><th>${esc(lbl)}</th><td class="num">${esc(cstMoney(c.a.monthly * f))}</td><td class="num">${esc(cstMoney(c.b.monthly * f))}</td><td class="num cst-d">${esc(cstDelta(c.delta * f))}</td><td class="num">${esc(cstPct(c.a.monthly, c.delta))}</td></tr>`;
      outs.compare.innerHTML = `<table class="cst-table cst-sum"><thead><tr><th></th><th class="num" title="${esc(A.label)}">A</th><th class="num" title="${esc(B.label)}">B</th><th class="num">${esc(T('cst.delta'))}</th><th class="num">%</th></tr></thead><tbody>${sumRow(T('cst.col.monthly'), 1)}${sumRow(T('cst.col.yearly'), 12)}</tbody></table>
        ${st.a === st.b ? `<p class="cst-note">${esc(T('cst.sameSrc'))}</p>` : ''}${vers().length ? '' : `<p class="cst-note">${esc(T('cst.noVersions'))}</p>`}
        ${!c.rows.length ? `<p class="cm-empty">${esc(T('cst.empty'))}</p>` : `<table class="cst-table"><thead><tr>${th('label', T('cst.col.component'))}${th('a', 'A', 'num')}${th('b', 'B', 'num')}${th('delta', T('cst.col.delta'), 'num')}<th>${esc(T('cst.col.status'))}</th></tr></thead><tbody>${rows.map(r =>
          `<tr class="st-${r.status}"><td>${esc(r.label)}</td><td class="num">${esc(cstMoney(r.a))}</td><td class="num">${esc(cstMoney(r.b))}</td><td class="num cst-d">${esc(cstDelta(r.delta))}</td><td><span class="cst-st">${esc(T(`cst.st.${r.status}`))}</span></td></tr>`).join('') || `<tr><td colspan="5" class="cm-empty">${esc(T('cst.noChanges'))}</td></tr>`}</tbody></table>
        <h4 class="cst-h">${esc(T('cst.deltaBy', { by: T(`cst.by.${st.by}`) }))}</h4>
        <table class="cst-table"><thead><tr><th>${esc(T(`cst.by.${st.by}`))}</th><th class="num">A</th><th class="num">B</th><th class="num">${esc(T('cst.col.delta'))}</th>${st.by === 'group' ? `<th>${esc(T('cst.col.status'))}</th>` : ''}</tr></thead><tbody>${by.map(r =>
          `<tr${st.by === 'group' ? ` class="st-${r.status}"` : ''}><td${r.unassigned ? ' class="cst-un"' : ''}${st.by === 'group' ? ` ${indent(r.depth)} title="${esc(r.pathLabel)}"` : ''}>${esc(r.label)}${esc(lvTag(r))}</td><td class="num">${esc(cstMoney(r.a))}</td><td class="num">${esc(cstMoney(r.b))}</td><td class="num cst-d">${esc(cstDelta(r.delta))}</td>${st.by === 'group' ? `<td><span class="cst-st">${esc(T(`cst.st.${r.status}`))}</span></td>` : ''}</tr>`).join('')}</tbody></table>`}`;
    };
    const show = () => {
      back.querySelectorAll('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== st.tab; });
      back.querySelectorAll('[data-cst-tab]').forEach(b => { const on = b.dataset.cstTab === st.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
      if (st.tab === 'compare') drawCompare(); else drawBreakdown();
    };
    const close = () => { document.removeEventListener('keydown', key, true); back.remove(); cstClose = null; prev?.focus?.(); };
    const key = ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); } };
    const exportCsv = () => {
      if (st.tab === 'breakdown') {
        if (!cur.length) return;
        const tot = cur.reduce((s, r) => s + r.monthly, 0);
        if (st.by === 'group') { // árbol completo: ruta, profundidad, componentes (con descendientes), costo directo y subtotal; el total suma solo el costo directo
          download(cstCSV([[T('cst.by.group'), T('cst.col.depth'), T('cst.col.components'), T('cst.col.own'), T('cst.col.subtotal'), T('cst.col.yearly'), T('cst.col.pct')], ...cur.map(r => [r.pathLabel, r.depth, r.nodesAll.length, round2(r.own), round2(r.total), round2(r.total * 12), tot ? round2(r.total / tot * 100) : 0]), [T('cst.total'), '', cur.reduce((s, r) => s + r.nodes.length, 0), round2(tot), round2(tot), round2(tot * 12), 100]]), fileName('csv', 'costs'), 'text/csv;charset=utf-8');
          return;
        }
        download(cstCSV([[T(`cst.by.${st.by}`), T('cst.col.components'), T('cst.col.monthly'), T('cst.col.yearly'), T('cst.col.pct')], ...cur.map(r => [r.label, r.nodes.length, round2(r.monthly), round2(r.monthly * 12), tot ? round2(r.monthly / tot * 100) : 0]), [T('cst.total'), cur.reduce((s, r) => s + r.nodes.length, 0), round2(tot), round2(tot * 12), 100]]), fileName('csv', 'costs'), 'text/csv;charset=utf-8');
      } else if (cmp) {
        download(cstCSV([[T('cst.col.component'), `A: ${cmp.a.label}`, `B: ${cmp.b.label}`, T('cst.col.delta'), T('cst.col.status')], ...cmp.shown.map(r => [r.label, round2(r.a), round2(r.b), round2(r.delta), T(`cst.st.${r.status}`)]),
          [T('cst.total'), round2(cmp.a.monthly), round2(cmp.b.monthly), round2(cmp.delta), ''], [], [T(`cst.by.${st.by}`), 'A', 'B', T('cst.col.delta')], ...cmp.by.map(r => [r.pathLabel || r.label, round2(r.a), round2(r.b), round2(r.delta)])]), fileName('csv', 'cost-compare'), 'text/csv;charset=utf-8');
      }
    };
    back.addEventListener('mousedown', ev => { if (ev.target === back) close(); });
    back.addEventListener('click', async ev => {
      const t = ev.target.closest('[data-cst-tab]');
      if (t) { st.tab = t.dataset.cstTab; return show(); }
      const s = ev.target.closest('[data-cst-sort]');
      if (s) { const k = s.dataset.cstSort; if (st.sort === k) st.dir = -st.dir; else { st.sort = k; st.dir = -1; } drawCompare(); return back.querySelector(`[data-cst-sort="${k}"]`)?.focus(); }
      const tg = ev.target.closest('[data-cst-tg]');
      if (tg) { const k = tg.dataset.cstTg, row = cur.find(x => x.pathKey === k); st.exp[k] = !(st.exp[k] ?? (row ? row.depth < 2 : true)); drawBreakdown(); return outs.breakdown.querySelector(`[data-cst-tg="${CSS.escape(k)}"]`)?.focus(); }
      const r = ev.target.closest('tr[data-i]');
      if (r) { const f = cur[+r.dataset.i]?.filter; if (f) { close(); setFilter(f); } return; }
      const b = ev.target.closest('[data-cst]');
      if (!b) return;
      if (b.dataset.cst === 'close') close();
      else if (b.dataset.cst === 'csv') exportCsv();
      else if (b.dataset.cst === 'save') {
        const keep = S.verNote;
        S.verNote = T('cst.proposedNote', { date: today() });
        await saveVersion('version');
        S.verNote = keep;
        const v = findVersion(S.model.active);
        if (v && v.kind === 'version') { if (!v.name) v.name = T('cst.proposed'); versionsChanged(); st.b = v.id; show(); toast(T('cst.proposedSaved'), 2600); }
      }
    });
    back.addEventListener('change', ev => {
      const k = ev.target.dataset?.cst;
      if (!k) return;
      if (k === 'a' || k === 'b') st[k] = ev.target.value || null;
      else if (k === 'only') st.only = ev.target.checked;
      else if (k === 'by' || k === 'by2') { st.by = CST_BY.find(x => x === ev.target.value) || st.by; $q('[data-cst="by"]').value = $q('[data-cst="by2"]').value = st.by; }
      show();
    });
    cstClose = close;
    document.addEventListener('keydown', key, true);
    fillSelects();
    document.body.appendChild(back);
    show();
    back.querySelector('[data-cst="close"]').focus();
  }
  // Botón «Costos» de la pastilla de la vista Costo y «Comparar costos» de cada versión
  viewPill.addEventListener('click', ev => { if (ev.target.closest('[data-cst-open]')) openCosts('breakdown'); });
  versionsBox.addEventListener('click', ev => { const b = ev.target.closest('[data-cst-cmp]'); if (b) openCosts('compare', { a: b.closest('.ver')?.dataset.id || null, b: null }); });

  /* ---------- inspector ---------- */
  // Tras la paleta, un botón "+": marcado y con el color cuando el actual no es de la paleta
  const swatches = cur => {
    const custom = !!cur && cur !== '__mixed' && !paletteKeys().includes(cur) && !COLOR_ALIAS[cur];
    return `<div class="swatches">
      <button class="sw auto${!cur ? ' on' : ''}" data-color="" title="${esc(T('insp.auto'))}"></button>
      ${paletteKeys().map(k => `<button class="sw${cur === k ? ' on' : ''}" data-color="${k}" title="${esc(I.colorName(k))}" style="--c:var(--p-${k})"></button>`).join('')}
      <button class="sw sw-custom${custom ? ' on' : ''}" type="button" aria-haspopup="dialog" aria-expanded="false" title="${esc(T('color.custom') + (custom ? ` · ${cur}` : ''))}" aria-label="${esc(T('color.custom'))}"${custom ? ` style="--c:${esc(cur)}"` : ''}></button>
    </div>`;
  };

  /* ---------- color personalizado: selector con recientes y favoritos ---------- */
  const CP_RECENT = 7, CP_FAV = 14;
  // #RGB o #RRGGBB (con o sin #) -> #rrggbb, o null si no es válido
  const normHex = v => {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(v ?? '').trim());
    if (!m) return null;
    const h = m[1].toLowerCase();
    return '#' + (h.length === 3 ? [...h].map(c => c + c).join('') : h);
  };
  const loadColors = (k, max) => { const v = store.get(k, []); return Array.isArray(v) ? [...new Set(v.map(normHex).filter(Boolean))].slice(0, max) : []; };
  let cpRecent = loadColors('colorRecent', CP_RECENT), cpFav = loadColors('colorFav', CP_FAV);
  let cpPop = null, cpDrag = false;
  const cpStar = '<svg viewBox="0 0 24 24"><path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/></svg>';
  // Color actual de la selección: un valor, '' (automático) o '__mixed'
  const cpCurrent = () => {
    const t = selTarget(), list = Array.isArray(t) ? t : t ? [t] : [];
    const set = new Set(list.map(x => x.color || ''));
    return set.size === 1 ? [...set][0] : '__mixed';
  };
  // Hex del color actual en el tema activo, para arrancar el selector
  const cpStartHex = () => {
    const pal = C.palettes[S.palette] || Object.values(C.palettes)[0], tp = pal[S.theme] || pal.dark, cur = cpCurrent();
    return normHex(cur) || normHex(tp[COLOR_ALIAS[cur] || cur]) || normHex(tp[pal.accent || 'lavanda']) || '#8573db';
  };
  // Mismo camino que las muestras; en vivo agrupa en un solo paso de deshacer (markEdit)
  function cpApply(val, live) {
    const t = selTarget();
    if (!t) return;
    const list = Array.isArray(t) ? t : [t];
    if (list.every(x => x.color === val)) return;
    if (live) markEdit(); else pushHistory();
    list.forEach(x => { x.color = val; });
    changed(true); renderInspector(); cpPlace();
  }
  const cpRemember = hex => {
    cpRecent = [hex, ...cpRecent.filter(c => c !== hex)].slice(0, CP_RECENT);
    store.set('colorRecent', cpRecent);
    cpRenderLists();
  };
  const cpCommit = hex => { const h = normHex(hex); if (!h) return false; cpApply(h, false); cpRemember(h); return true; };
  function cpToggleFav(hex) {
    if (cpFav.includes(hex)) cpFav = cpFav.filter(c => c !== hex);
    else if (cpFav.length >= CP_FAV) return toast(T('color.favMax', CP_FAV));
    else cpFav = [...cpFav, hex];
    store.set('colorFav', cpFav);
    cpRenderLists();
  }
  function cpRenderLists() {
    if (!cpPop) return;
    const box = cpPop.querySelector('.cp-lists'), a = document.activeElement;
    const was = box.contains(a) && a.dataset.cp ? `${a.dataset.cp}|${a.dataset.c}|${a.closest('[data-sec]')?.dataset.sec}` : null;
    const cur = normHex(cpCurrent());
    const item = c => {
      const fav = cpFav.includes(c), pin = esc(T(fav ? 'color.unpin' : 'color.pin', c));
      return `<span class="cp-it"><button type="button" class="cp-sw${c === cur ? ' on' : ''}" data-cp="use" data-c="${c}" style="--c:${c}" title="${c}" aria-label="${esc(T('color.use', c))}"></button>
        <button type="button" class="cp-pin${fav ? ' on' : ''}" data-cp="pin" data-c="${c}" aria-pressed="${fav}" title="${pin}" aria-label="${pin}">${cpStar}</button></span>`;
    };
    const sec = (key, title, list, none) => `<div class="cat">${esc(title)}</div><div class="cp-grid" data-sec="${key}">${list.length ? list.map(item).join('') : `<p class="cp-none">${esc(none)}</p>`}</div>`;
    box.innerHTML = sec('recent', T('color.recent'), cpRecent, T('color.recent.none')) + sec('fav', `${T('color.fav')} · ${cpFav.length}/${CP_FAV}`, cpFav, T('color.fav.none'));
    if (was) {
      const [kind, c, s] = was.split('|');
      (box.querySelector(`[data-sec="${s}"] [data-cp="${kind}"][data-c="${c}"]`) || box.querySelector(`[data-cp="${kind}"][data-c="${c}"]`) || box.querySelector('[data-cp]') || cpPop).focus();
    }
  }
  // Anclado al botón "+" (se vuelve a buscar porque el inspector se redibuja); abre hacia arriba si no cabe abajo
  function cpPlace() {
    if (!cpPop) return;
    const a = $('#inspector .sw-custom');
    if (!a) return cpClose(false);
    a.setAttribute('aria-expanded', 'true');
    const r = a.getBoundingClientRect(), pw = cpPop.offsetWidth, ph = cpPop.offsetHeight, m = 8;
    let top = r.bottom + 6;
    if (top + ph > innerHeight - m && r.top - ph - 6 >= m) top = r.top - ph - 6;
    cpPop.style.left = `${Math.min(Math.max(m, r.left), Math.max(m, innerWidth - pw - m))}px`;
    cpPop.style.top = `${Math.max(m, Math.min(top, innerHeight - ph - m))}px`;
  }
  function cpClose(refocus = true) {
    if (!cpPop) return;
    cpPop.remove(); cpPop = null; cpDrag = false; endEdit();
    const a = $('#inspector .sw-custom');
    if (a) { a.setAttribute('aria-expanded', 'false'); if (refocus) a.focus(); }
  }
  function cpOpen() {
    cpClose(false);
    const hex = cpStartHex();
    cpPop = document.createElement('div');
    cpPop.className = 'menu-pop color-pop';
    cpPop.setAttribute('role', 'dialog');
    cpPop.setAttribute('aria-label', T('color.custom'));
    cpPop.tabIndex = -1;
    cpPop.innerHTML = `<div class="cp-top"><input type="color" class="cp-color" value="${hex}" aria-label="${esc(T('color.picker'))}">
      <input type="text" class="cp-hex" value="${hex}" maxlength="7" spellcheck="false" autocomplete="off" placeholder="#RRGGBB" aria-label="${esc(T('color.hex'))}">
      <button type="button" class="cp-apply" data-cp="apply">${esc(T('color.apply'))}</button></div>
      <p class="cp-err" role="alert" hidden>${esc(T('color.hexBad'))}</p><div class="cp-lists"></div>`;
    document.body.appendChild(cpPop);
    cpRenderLists();
    cpPlace();
    const col = cpPop.querySelector('.cp-color'), hx = cpPop.querySelector('.cp-hex'), err = cpPop.querySelector('.cp-err');
    const ok = h => { hx.value = h; col.value = h; err.hidden = true; hx.removeAttribute('aria-invalid'); };
    // Arrastrar el selector aplica en vivo (un solo paso de deshacer); al soltar se guarda en recientes
    col.addEventListener('input', () => {
      if (!cpDrag) { cpDrag = true; beginEdit(); }
      ok(col.value);
      cpApply(col.value, true);
    });
    col.addEventListener('change', () => {
      if (!cpDrag) cpApply(col.value, false);
      cpDrag = false; endEdit(); cpRemember(col.value);
    });
    hx.addEventListener('input', () => {
      const h = normHex(hx.value), bad = !!hx.value.trim() && !h;
      err.hidden = !bad; hx.toggleAttribute('aria-invalid', bad);
      if (h) col.value = h;
    });
    const commit = () => {
      const h = normHex(hx.value);
      if (h && cpCommit(h)) ok(h);
      else { err.hidden = false; hx.setAttribute('aria-invalid', 'true'); hx.focus(); }
    };
    hx.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); commit(); } });
    hx.addEventListener('change', () => { if (normHex(hx.value)) commit(); });
    cpPop.addEventListener('click', ev => {
      const b = ev.target.closest('button[data-cp]');
      if (!b) return;
      if (b.dataset.cp === 'apply') commit();
      else if (b.dataset.cp === 'pin') cpToggleFav(b.dataset.c);
      else if (cpCommit(b.dataset.c)) ok(b.dataset.c);
    });
    // Esc cierra; las flechas recorren las muestras; Tab no sale del menú
    cpPop.addEventListener('keydown', ev => {
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); return cpClose(); }
      if (ev.key === 'Tab') {
        const f = $$('input, button', cpPop), i = f.indexOf(document.activeElement);
        if (ev.shiftKey && i <= 0) { ev.preventDefault(); f[f.length - 1].focus(); }
        else if (!ev.shiftKey && i === f.length - 1) { ev.preventDefault(); f[0].focus(); }
        return;
      }
      if (!ev.target.matches('.cp-sw')) return;
      const sws = $$('.cp-sw', cpPop), i = sws.indexOf(ev.target);
      const j = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: sws.length - 1 }[ev.key];
      if (j != null && sws[j]) { ev.preventDefault(); sws[j].focus(); }
    });
    hx.focus(); hx.select();
  }
  $('#inspector').addEventListener('click', ev => {
    if (ev.target.closest('.sw-custom')) cpPop ? cpClose(false) : cpOpen();
  });
  document.addEventListener('pointerdown', ev => { if (cpPop && !cpPop.contains(ev.target) && !ev.target.closest('.sw-custom')) cpClose(false); });
  addEventListener('resize', cpPlace);
  $('#inspector').addEventListener('scroll', cpPlace);
  const typeOptions = cur => categories().map(cat => {
    const ts = Object.entries(C.types).filter(([, t]) => (t.category || 'Otros') === cat);
    return ts.length ? `<optgroup label="${esc(I.category(cat))}">${ts.map(([k, t]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${esc(loc(t.label))}</option>`).join('')}</optgroup>` : '';
  }).join('');
  /* ---------- buscador de iconos con autocompletado ---------- */
  // Todos los iconos oficiales en una lista plana, con el texto donde se busca ya preparado
  let iconIndex = null;
  const allIcons = () => iconIndex || (iconIndex = Object.entries(ICONS).flatMap(([p, set]) => Object.entries(set.items).map(([k, it]) => ({
    ref: `${p}/${k}`, prov: p, group: !!it.group, label: it.label, provider: set.label, category: it.category, src: set.files[it.file],
    text: fold(`${it.label} ${k} ${set.label} ${set.short || ''} ${it.category}`), kw: it.keywords || '', name: fold(it.label)
  }))));
  // Las palabras clave valen desde el inicio de una palabra: "sql" no debe encontrar "nosql"
  const kwHit = (kw, q) => !!kw && ` ${fold(kw)}`.includes(` ${q}`);
  // Orden: etiqueta empieza por lo escrito, tiene una palabra que empieza así, la contiene, y al final solo por palabras clave
  const iconRank = (name, w) => (name.startsWith(w) ? 0 : name.split(/[\s/()-]+/).some(x => x.startsWith(w)) ? 1 : name.includes(w) ? 2 : 3);
  // grp = true: solo los iconos de grupo, con los de la nube activa del panel primero
  function searchIcons(q, max = 40, grp = false) {
    const words = fold(q).trim().split(/\s+/).filter(Boolean);
    const pool = grp ? allIcons().filter(it => it.group) : allIcons();
    const mine = it => (grp && it.prov !== S.provider ? 1 : 0);
    if (!words.length) return grp ? [...pool].sort((a, b) => mine(a) - mine(b)).slice(0, max) : pool.slice(0, max);
    const rank = it => iconRank(it.name, words[0]);
    return pool.filter(it => words.every(w => it.text.includes(w) || kwHit(it.kw, w)))
      .sort((a, b) => mine(a) - mine(b) || rank(a) - rank(b) || a.label.localeCompare(b.label)).slice(0, max);
  }
  const NO_ICON = '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2.5" stroke-dasharray="3 2.6"/></svg>';
  const iconPicker = (n, grp = false) => {
    const cur = iconInfo(n.icon), clr = T(grp ? 'icon.group.none' : 'insp.ownIcon');
    return `<div class="field">${T('insp.icon')}
      <div class="ipick">
        <span class="ipick-cur${cur ? ' logo' : ''}" style="--c:${grp ? colorVar(n.color) || 'var(--muted)' : nodeColor(n)}">${grp ? (cur ? `<img src="${cur.src}" alt="">` : NO_ICON) : nodeIconHtml(n)}</span>
        <input id="icon-q" class="ipick-in" value="${esc(cur ? `${cur.label} · ${cur.providerLabel}` : '')}" placeholder="${esc(T(grp ? 'icon.group.ph' : 'icon.ph'))}" autocomplete="off" spellcheck="false"
          role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="icon-list" aria-label="${esc(T('insp.icon'))}">
        ${cur ? `<button class="ipick-clear" data-icon-clear title="${esc(clr)}" aria-label="${esc(clr)}">${ICON.x}</button>` : ''}
      </div>
      <div class="ipick-list" id="icon-list" role="listbox" hidden></div>
    </div>`;
  };
  function showIconList(q) {
    const list = $('#icon-list'), box = $('#icon-q');
    if (!list) return;
    const grp = S.sel?.kind === 'group';
    const rows = searchIcons(q, 40, grp).map(it => `<div class="ipick-opt" role="option" data-ref="${esc(it.ref)}"><i><img src="${it.src}" alt=""></i><span>${esc(it.label)}</span><em>${esc(it.provider)} · ${esc(I.category(it.category))}</em></div>`);
    // Los grupos añaden «Sin icono»: arriba si no se ha escrito nada, al final si hay búsqueda
    if (grp) { const none = `<div class="ipick-opt" role="option" data-ref=""><i>${NO_ICON}</i><span>${esc(T('icon.group.none'))}</span></div>`; if (q.trim() && rows.length) rows.push(none); else rows.unshift(none); }
    list.innerHTML = rows.map((r, i) => (i ? r : r.replace('class="ipick-opt"', 'class="ipick-opt on"'))).join('')
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
    if (ref && iconInfo(ref)) { t.icon = ref; if (S.sel.kind !== 'group') t.type = iconInfo(ref).type; } else delete t.icon;
    changed(true);
    renderInspector();
  }
  const head = (c, iconHtml, kicker, title, isLogo) => `<div class="insp-head" style="--c:${esc(c)}">
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
  // Botón de catálogo de la ficha del inspector: ▤ abre el conjunto en la pestaña Datos; + lo documenta si solo se usa en conexiones
  const dsCatBtn = d => (dsFind(d) ? `<button class="ds-cat" data-ds-open="${esc(d)}" title="${esc(T('ds.chip.open', d))}" aria-label="${esc(T('ds.chip.open', d))}">▤</button>` : `<button class="ds-cat" data-ds-doc="${esc(d)}" title="${esc(T('ds.chip.doc', d))}" aria-label="${esc(T('ds.chip.doc', d))}">+</button>`);
  // Conjuntos de datos de una conexión: fichas (nombre = ver linaje, × = quitar) y campo para añadir
  const dsField = e => {
    const list = e.datasets || [], more = datasetList().map(d => d.name).filter(n => !list.some(x => dsKey(x) === dsKey(n)));
    return `<div class="field">${T('lin.label')}<div class="ds-chips">${list.map(d => `<span class="ds-chip"><button class="ds-name" data-lin="${esc(d)}" title="${esc(T('lin.show', { name: d }))}">${esc(d)}</button>${dsCatBtn(d)}<button class="ds-x" data-ds-rm="${esc(d)}" title="${esc(T('lin.remove', { name: d }))}" aria-label="${esc(T('lin.remove', { name: d }))}">×</button></span>`).join('')}</div>
      <input class="ds-add" list="ds-suggest" placeholder="${esc(T('lin.add.ph'))}" aria-label="${esc(T('lin.add.aria'))}" autocomplete="off" spellcheck="false">
      <datalist id="ds-suggest">${more.map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist>${list.length ? '' : `<span class="cost-hint">${T('lin.none')}</span>`}</div>`;
  };
  // Latencia de una conexión: tiempo que tarda el dato en ese salto ('15m', '1h', '1d'); se valida con parseDur
  const latencyField = e => `<label>${T('ds.latency')}<input data-lat list="dl-dur" value="${esc(e.latency || '')}" placeholder="${esc(T('ds.latency.ph'))}" aria-label="${esc(T('ds.latency'))}" autocomplete="off" spellcheck="false"><span class="cost-hint">${T('ds.latency.hint')}</span></label><datalist id="dl-dur">${DUR_TIERS.map(v => `<option value="${v}"></option>`).join('')}</datalist>`;
  // Conjuntos que pasan por las conexiones de un nodo (solo lectura; pulsar uno muestra su linaje)
  const nodeDsField = n => {
    const list = datasetsOfNode(n.id);
    return list.length ? `<div class="field">${T('lin.node')}<div class="ds-chips">${list.map(d => `<span class="ds-chip"><button class="ds-name" data-lin="${esc(d)}" title="${esc(T('lin.show', { name: d }))}">${esc(d)}</button>${dsCatBtn(d)}</span>`).join('')}</div><span class="cost-hint">${T('lin.node.hint')}</span></div>` : '';
  };
  // Capa del data lake (nodos y grupos, también varios a la vez): ninguna / una de config.js › dataLayers.
  // «Ninguna» pasa a «Heredada (Oro)» cuando el grupo aporta una; abajo, el nombre que usa todo el documento
  // Disposición de migración (6R): una ficha por valor; sin elegir, el componente no lleva clave
  const dispField = items => {
    const list = [].concat(items).filter(x => 'type' in x), keys = Object.keys(MG);   // solo componentes (la selección múltiple puede traer grupos)
    if (!keys.length || !list.length) return '';
    const own = new Set(list.map(x => x.disposition || '')), cur = own.size === 1 ? [...own][0] : null, info = cur ? mgInfo(cur) : null;
    return `<div class="field">${T('mig.label')}<div class="seg disp-seg">
      <button data-disp="" class="${cur === '' ? 'on' : ''}">${esc(T('mig.none'))}</button>${keys.map(k => { const i = mgInfo(k);
        return `<button data-disp="${esc(k)}" class="${cur === k ? 'on' : ''}" style="--lc:${esc(i.color)}" title="${esc(i.hint)}">${esc(i.label)}</button>`; }).join('')}</div>
      <span class="cost-hint">${esc(cur === null ? T('mig.mixed') : info ? info.hint : T('mig.hint'))}</span></div>`;
  };
  // «Se detalla en»: enlaza el componente con otro diagrama del espacio de trabajo abierto (ref.doc = su docId); solo con un componente
  const refField = items => {
    const list = [].concat(items);
    if (list.length !== 1 || !('type' in list[0])) return '';
    const n = list[0], docs = (WS.index?.diagrams || []).filter(d => d.docId && !d.dupDocId && d.docId !== S.model.docId), cur = n.ref?.doc || '', known = docs.some(d => d.docId === cur);
    if (!docs.length && !cur) return '';
    const opts = [['', T('ws.ref.none')], ...docs.map(d => [d.docId, d.title]), ...(cur && !known ? [[cur, `${cur} ⚠`]] : [])];
    return `<div class="field"><label>${T('ws.ref.label')}<select data-ref>${opts.map(([v, l]) => `<option value="${esc(v)}"${cur === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>${known ? `<button type="button" class="btn small" data-ref-open="${esc(cur)}">${esc(T('ws.ref.open'))}</button>` : ''}<span class="cost-hint">${esc(T(cur && !known ? 'ws.ref.lost' : 'ws.ref.hint'))}</span></div>`;
  };
  // Radar tecnológico: fija el componente a una entrada del radar, deja que se reconozca solo o lo excluye; con un solo componente muestra lo que dice el radar
  const radarField = items => {
    const list = [].concat(items).filter(x => 'type' in x), m = S.model, ents = radarEntries(m);
    if (!list.length || (!ents.length && !list.some(x => x.radar))) return '';
    const own = new Set(list.map(x => x.radar || '')), cur = own.size === 1 ? [...own][0] : null;
    const opts = [['', T('radar.auto')], ...ents.map(e => [e.id, `${loc(e.name) || e.id} · ${rdRingInfo(e.ring).label}`]), ...(cur && cur !== 'none' && !ents.some(e => e.id === cur) ? [[cur, `${cur} ⚠`]] : []), ['none', T('radar.none')]];
    const one = list.length === 1 ? radarInfo(list[0], m, today()) : null;
    const detail = one ? `<span class="cost-hint"><span class="mg-chip" style="--mg:${esc(one.ring.color)}">${esc(one.ring.label)}</span>${esc([one.eosDay ? T(one.status === 'ended' ? 'radar.eos.ended' : 'radar.eos.on', fmtDay(one.eosDay)) : '', one.replaceWith ? T('radar.replace', one.replaceWith) : '', one.note].filter(Boolean).join(' · '))}</span>` : `<span class="cost-hint">${esc(list.length === 1 ? T('radar.hint') : cur === null ? T('radar.mixed') : T('radar.hint'))}</span>`;
    return `<div class="field"><label>${T('radar.label')}<select data-radar>${cur === null ? `<option value="__mixed" selected>${T('insp.mixed')}</option>` : ''}${opts.map(([v, l]) => `<option value="${esc(v)}"${cur === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>${detail}</div>`;
  };
  // Esfuerzo del componente: una fila por perfil (perfil + días) y una fila para añadir; solo con un componente y si hay perfiles en config.js (o el componente ya trae esfuerzo)
  const effortField = items => {
    const list = [].concat(items);
    if (list.length !== 1 || !('type' in list[0]) || (!EF_ROLES.size && !list[0].effort?.length)) return '';
    const ef = list[0].effort || [], used = new Set(ef.map(e => e.role)), free = [...EF_ROLES.keys()].filter(k => !used.has(k));
    const opt = (id, sel) => `<option value="${esc(id)}"${sel ? ' selected' : ''}>${esc(efInfo(id).label)}${efInfo(id).known ? '' : ' ⚠'}</option>`;
    const rows = ef.map((e, i) => `<div class="ef-row"><select data-ef-role="${i}" aria-label="${esc(T('est.role'))}">${[...new Set([...EF_ROLES.keys(), e.role])].map(k => opt(k, k === e.role)).join('')}</select><input type="number" min="0" max="${EF_DAYS}" step="0.5" data-ef-days="${i}" value="${e.days}" aria-label="${esc(T('est.days'))}"><button type="button" class="ef-btn" data-ef-rm="${i}" title="${esc(T('est.remove'))}" aria-label="${esc(T('est.remove'))}">×</button></div>`).join('');
    const add = free.length && ef.length < EF_MAX ? `<div class="ef-row"><select id="ef-new-role" aria-label="${esc(T('est.role'))}">${free.map(k => opt(k, false)).join('')}</select><input type="number" min="0" max="${EF_DAYS}" step="0.5" id="ef-new-days" placeholder="${esc(T('est.days'))}" aria-label="${esc(T('est.days'))}"><button type="button" class="ef-btn" data-ef-add="1">${esc(T('est.add'))}</button></div>` : '';
    const price = efCostOf(ef), unknown = ef.some(e => !efInfo(e.role).known);
    const total = ef.length ? `<span class="cost-hint">${esc(T('est.total', { d: efDaysOf(ef), h: round2(efDaysOf(ef) * (+EST.hoursPerDay || 8)), c: price ? money(price) : '' }))}${unknown ? ` ${esc(T('est.unknown'))}` : ''}</span>` : `<span class="cost-hint">${esc(T('est.hint'))}</span>`;
    return `<div class="field ef"><label>${T('est.label')}</label>${rows}${add}${total}</div>`;
  };
  const layerField = items => {
    const list = [].concat(items), keys = Object.keys(DL);
    if (!keys.length) return '';
    const own = new Set(list.map(x => (DL[x.layer] ? x.layer : ''))), cur = own.size === 1 ? [...own][0] : null;
    const eff = list.length === 1 && !cur ? layerOf(list[0]) : null, inh = eff?.value ? layerInfo(eff.value) : null;
    const hint = cur === null ? T('layer.mixed') : inh ? T('layer.inheritedFrom', { g: groupById(eff.from)?.label || '' }) : T('layer.hint');
    const nm = layerNaming(), names = k => keys.map(j => layerInfo(j, k).label).join(' · ');
    return `<div class="field">${T('layer.label')}<div class="seg layer-seg">
      <button data-layer="" class="${cur === '' ? 'on' : ''}">${esc(inh ? T('layer.inheritedN', { n: inh.label }) : T('layer.none'))}</button>${keys.map(k => { const li = layerInfo(k);
        return `<button data-layer="${esc(k)}" class="${cur === k ? 'on' : ''}" style="--lc:${esc(li.color)}">${esc(li.label)}</button>`; }).join('')}</div>
      <span class="cost-hint">${esc(hint)}</span>
      <div class="layer-names" title="${esc(T('layer.names.tip'))}"><span>${T('layer.names')}</span><div class="seg">${['medallion', 'zones'].map(k =>
        `<button data-lnames="${k}" class="${nm === k ? 'on' : ''}" title="${esc(T('layer.names.tip'))}">${esc(names(k))}</button>`).join('')}</div></div></div>`;
  };
  /* ---------- STRIDE: sección del inspector de la conexión ---------- */
  const strideField = e => {
    const c = strideCtx(), info = crossInfo(e, c), nm = zs => (zs.length ? zs.map(z => `‹${esc(trustName(z))}›`).join(' + ') : esc(T('stride.outside')));
    if (!info) { // ya no cruza: las decisiones guardadas se ven en solo lectura, con opción de borrarlas
      const st = Object.entries(e.threats || {});
      if (!st.length) return '';
      return `<div class="field stride-box">${T('stride.label')}<span class="cost-hint">${T('stride.stored')}</span>${st.map(([k, d]) =>
        `<div class="th-ro"><b class="th-badge">${esc(k)}</b><span>${esc(loc(STR.categories[k]?.label) || k)} · ${esc(T(`stride.st.${d.status}`))}${d.note ? ` — ${esc(d.note)}` : ''}</span></div>`).join('')}
        <button class="btn small" data-th-clear="1">${T('stride.clear')}</button></div>`;
    }
    const ts = strideFor(e, c, info);
    return `<div class="field stride-box">${T('stride.label')}<span class="cost-hint th-cross">${T('stride.crosses')} ${info.from.length ? nm(info.from) : nm([])} → ${nm(info.to)}</span>${ts.map(t => `
      <div class="th-row" style="--sv:var(--sev-${t.severity})"><div class="th-head"><b class="th-badge" title="${esc(loc(STR.categories[t.cat].desc))}">${t.cat}</b><span class="th-title">${esc(t.title)}</span><span class="th-sev">${esc(sevLabel(t.severity))}</span></div>
        <div class="seg th-seg">${['open', ...THREAT_ST].map(s => `<button data-th="${t.cat}" data-st="${s}" class="${t.status === s ? 'on' : ''}">${T(`stride.st.${s}`)}</button>`).join('')}</div>
        ${t.status !== 'open' ? `<input class="th-note" data-th-note="${t.cat}" value="${esc(t.note)}" placeholder="${esc(T('stride.note.ph'))}" autocomplete="off">` : ''}
        <span class="cost-hint">${esc(t.why)}</span></div>`).join('')}</div>`;
  };
  const encField = e => {
    const cur = e.encrypted === true ? 'yes' : e.encrypted === false ? 'no' : '';
    const byId = id => S.model.nodes.find(n => n.id === id);
    return `<div class="field">${T('enc.label')}<div class="seg">${[['', 'enc.unset'], ['yes', 'enc.yes'], ['no', 'enc.no']].map(([k, l]) =>
      `<button data-enc="${k}" class="enc-${k || 'unset'}${cur === k ? ' on' : ''}">${T(l)}</button>`).join('')}</div>${isInsecure(e, byId) ? `<span class="enc-warn">⚠ ${T('enc.warn')}</span>` : ''}</div>`;
  };

  /* ---------- residencia: campos del inspector ---------- */
  // Regiones sugeridas además de las que ya usa el diagrama
  const REGION_HINTS = ['eu-west-1', 'eu-central-1', 'eu-north-1', 'eu-south-2', 'us-east-1', 'us-west-2', 'ca-central-1', 'sa-east-1', 'ap-southeast-1', 'ap-northeast-1', 'westeurope', 'northeurope', 'germanywestcentral', 'eastus', 'westus2', 'brazilsouth',
    'europe-west1', 'europe-west3', 'us-central1', 'southamerica-east1', 'ES', 'DE', 'FR', 'GB', 'US', 'MX', 'CO', 'BR'];
  const regionJurText = r => { const j = jurOf(r); return j ? j.label : ''; };
  // «inherited from X» / «deduced from X» para el valor que aporta un grupo
  const regionHint = (list, own) => {
    const rs = list.map(x => regionOf(x)), r0 = rs[0];
    if (own || !rs.every(r => r.value === r0.value && (r.from?.id || '') === (r0.from?.id || '')) || !r0.value) return '';
    return r0.from ? T(r0.from.deduced ? 'res.deduced' : 'res.inherited', r0.from.label) : '';
  };
  // Cuadro de texto de región (nodo, grupo o varios): valor propio, o el heredado / deducido como sugerencia
  const regionField = items => {
    const list = [].concat(items), vals = new Set(list.map(x => cleanRegion(x.region))), mixed = vals.size > 1, own = mixed ? '' : [...vals][0];
    const eff = list.map(x => regionOf(x).value), same = eff.every(v => v === eff[0]);
    const ph = mixed ? T('insp.mixed') : own ? '' : same ? eff[0] || T('res.ph') : T('insp.mixed');
    const used = [...new Set([...S.model.nodes, ...S.model.groups].map(x => cleanRegion(x.region)).filter(Boolean))];
    const opts = [...new Set([...used, ...REGION_HINTS])];
    const jur = same ? regionJurText(own || eff[0]) : '';
    return `<div class="field region-field"><div class="region-row"><label>${T('res.label')}<input data-field="region" list="region-list" value="${esc(own)}" placeholder="${esc(ph)}" autocomplete="off" spellcheck="false"></label><span class="region-jur" id="region-jur"${jur ? '' : ' hidden'}>${esc(jur)}</span></div>
      <span class="cost-hint" id="region-hint">${esc(mixed ? '' : regionHint(list, own))}</span><datalist id="region-list">${opts.map(o => `<option value="${esc(o)}">`).join('')}</datalist></div>`;
  };
  // Conexión entre regiones: «eu-west-1 (EU) → us-east-1 (US)», aviso y botón de transferencia autorizada
  const xferField = e => {
    const nm = id => S.model.nodes.find(n => n.id === id), ra = regionOf(nm(e.from)).value, rb = regionOf(nm(e.to)).value;
    if (!ra || !rb) return '';
    const cb = crossBorder(e, nm);
    return `<div class="field">${T('res.edge')}<span class="cost-hint">${esc(regionLabel(ra))} → ${esc(regionLabel(rb))}</span>${cb ? `${cb.approved ? `<span class="cost-hint xfer-ok">✓ ${esc(T('res.approvedLine'))}</span>` : `<span class="enc-warn">${esc(xbWarn(cb))}</span>`}
      <button class="btn small${cb.approved ? ' on' : ''}" data-xfer="1" aria-pressed="${cb.approved}">${cb.approved ? '✓ ' : ''}${T('res.approve')}</button>` : ''}</div>`;
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

  // Dueños y responsables: sección plegable con 4 campos; sugiere los valores ya usados y muestra lo heredado del grupo
  const govField = (items, kind) => {
    const list = [].concat(items), m = S.model, one = list.length === 1 && list[0];
    const own = (x, f) => String(x[f] ?? '').trim();
    const any = list.some(x => GOV_FIELDS.some(f => own(x, f)));
    const open = store.get(`govOpen.${kind}`, any);
    const cells = GOV_FIELDS.map(f => {
      const vals = list.map(x => own(x, f)), same = vals.every(v => v === vals[0]), inh = one && !vals[0] ? govOf(one, f) : null;
      const ph = !same ? T('insp.mixed') : inh?.value || '';
      const used = [...new Set([...m.nodes, ...m.groups].map(x => own(x, f)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      const gl = inh?.from ? m.groups.find(g => g.id === inh.from)?.label : '';
      return `<label>${T(`gov.${f}`)}<input data-gov="${f}" list="dl-gov-${f}" value="${esc(same ? vals[0] : '')}" placeholder="${esc(ph)}" autocomplete="off"><datalist id="dl-gov-${f}">${used.map(v => `<option value="${esc(v)}"></option>`).join('')}</datalist>${gl ? `<span class="cost-hint">${esc(T('gov.inherited', { name: gl }))}</span>` : ''}</label>`;
    });
    return `<details class="gov-box" data-gov-open="${kind}"${open ? ' open' : ''}><summary>${T('gov.title')}</summary><div class="row2">${cells[0]}${cells[1]}</div><div class="row2">${cells[2]}${cells[3]}</div></details>`;
  };

  /* ---------- disponibilidad: campos del inspector ---------- */
  const SLA_TIERS = [99, 99.5, 99.9, 99.95, 99.99, 99.999], DUR_TIERS = ['0', '15m', '1h', '4h', '24h'];
  // Pista bajo los campos: disponibilidad efectiva, tiempo de parada esperado y aviso de punto único de fallo
  const resHintHtml = list => {
    if (list.length !== 1) return '';
    const n = list[0], a = availOf(n), r = replicasOf(n), sp = spofList().find(x => x.id === n.id);
    const h = a == null ? T('res.hint.empty') : `${T('res.hint.eff', { a: fmtPct(a), n: r })} · ${downtime(a).text}`;
    return `<span class="cost-hint">${esc(h)}</span>${sp ? `<span class="enc-warn">⚠ ${esc(T('res.spof'))} · ${esc(sp.reason)}</span>` : ''}`;
  };
  const resField = items => {
    const list = [].concat(items), cell = (k, lab, extra) => {
      const vals = list.map(x => (x[k] == null ? '' : String(x[k]))), same = vals.every(v => v === vals[0]);
      return `<label>${lab}<input data-res="${k}" ${extra} value="${esc(same ? vals[0] : '')}" placeholder="${esc(same ? '' : T('insp.mixed'))}" autocomplete="off"></label>`;
    };
    return `<div class="field res-field">${T('res.title')}
      <div class="row2">${cell('sla', T('res.sla'), 'list="dl-sla" inputmode="decimal"')}${cell('replicas', T('res.replicas'), 'type="number" min="1" step="1" inputmode="numeric"')}</div>
      <div class="row2">${cell('rpo', T('res.rpo'), 'list="dl-dur"')}${cell('rto', T('res.rto'), 'list="dl-dur"')}</div>
      <datalist id="dl-sla">${SLA_TIERS.map(v => `<option value="${v}"></option>`).join('')}</datalist><datalist id="dl-dur">${DUR_TIERS.map(v => `<option value="${v}"></option>`).join('')}</datalist>
      <div id="res-hint">${resHintHtml(list)}</div></div>`;
  };
  // Sección "Camino" con exactamente dos nodos: el orden de selección define A y B
  function pathField() {
    const [a, b] = S.sel.ids.map(id => S.model.nodes.find(n => n.id === id).label);
    return `<div class="field">${T('insp.path')}<div class="path-btns">
      <button class="btn" data-path="fwd" title="${esc(T('path.show', { a, b }))}">${T('path.show', { a: esc(a), b: esc(b) })}</button>
      <button class="btn tool" data-path="rev" title="${esc(T('path.swap', { a: b, b: a }))}" aria-label="${esc(T('path.swap', { a: b, b: a }))}">⇄</button></div></div>`;
  }
  function renderInspector() {
    const box = $('#inspector'), t = selTarget(), m = S.model;
    if (!t && S.flow && VW.flows.has(S.flow)) return flowInspector(box);
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
        <label>${T('insp.group')}<select data-field="group">${g1 == null ? `<option value="__mixed" selected>${T('insp.mixed')}</option>` : ''}<option value=""${g1 === '' ? ' selected' : ''}>${T('insp.none')}</option>${m.groups.filter(g => inScope(g)).map(g => `<option value="${esc(g.id)}"${g.id === g1 ? ' selected' : ''}>${esc(g.label)}</option>`).join('')}<option value="__new">${T('insp.newGroup')}</option></select></label>
        <div class="field">${T('insp.color')}${swatches(colorsOf.size === 1 ? [...colorsOf][0] : '__mixed')}</div>
        ${t.length === 2 ? pathField() : ''}
        ${c4Field(t)}
        ${phaseField(t)}
        ${dataField(t)}
        ${govField(t, 'multi')}
        ${resField(t)}
        ${regionField(t)}
        ${layerField(t)}
        ${dispField(t)}
        ${radarField(t)}
        ${cmpField(t, 'multi')}
        ${priced.length ? `<p class="cost-sum">${T('insp.selCost')} <b>≈ ${money(round2(monthlyTotal(t)))}${T('cost.mo')}</b><span>${T('insp.withCost', { a: priced.length, b: t.length })}</span></p>` : ''}
        <p class="note">${T('insp.multiNote')}</p>
        <div class="insp-actions">
          <button class="btn" data-act="mkzone">⚠ ${T('zone.mark')}</button>
          <button class="btn" data-act="mktrust">${T('trust.mark')}</button>
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
          <label>${T('insp.group')}<select data-field="group"><option value="">${T('insp.none')}</option>${m.groups.filter(g => inScope(g)).map(g => `<option value="${esc(g.id)}"${g.id === t.group ? ' selected' : ''}>${esc(g.label)}</option>`).join('')}<option value="__new">${T('insp.newGroup')}</option></select></label>
        </div>
        ${Object.keys(ICONS).length ? iconPicker(t) : ''}
        <div class="field">${T('insp.color')}${swatches(t.color)}</div>
        ${c4Field(t)}
        ${phaseField(t)}
        ${costField(t)}
        ${dataField(t)}
        ${govField(t, 'node')}
        ${resField(t)}
        ${regionField(t)}
        ${layerField(t)}
        ${dispField(t)}
        ${radarField(t)}
        ${refField(t)}
        ${effortField(t)}
        ${secField(t)}
        ${cmpField(t, 'node')}
        ${reviewField(t)}
        ${raidField(t)}
        ${adrField(t)}
        ${cmtField(t)}
        <label>${T('insp.desc')}<textarea data-field="desc" rows="3" placeholder="${esc(T('insp.desc.ph'))}">${esc(t.desc || '')}</textarea></label>
        <div class="field">${T('insp.reach')}<div class="seg">${modes.map(([k, l]) => `<button data-reach="${k}" class="${S.reach === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        ${nodeDsField(t)}
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
      html = head(colorVar(t.color) || nodeColor(a), '', T('insp.edge'), `${a.label} ${t.both ? '↔' : '→'} ${b.label}`) + `
        <label>${T('insp.label')}<textarea data-field="label" rows="2" placeholder="${esc(T('insp.label.ph'))}">${esc(t.label || '')}</textarea></label>
        <label>${T('insp.style')}<select data-field="style">${edgeStyleOptions(edgeKey(t.style))}</select></label>
        <div class="field">${T('wt.label')}<div class="seg">${[['', 'wt.normal'], ['high', 'wt.high'], ['critical', 'wt.critical']].map(([k, l]) =>
          `<button data-wt="${k}" class="${(t.weight || '') === k ? 'on' : ''}">${T(l)}</button>`).join('')}</div></div>
        <label>${T('insp.route')}<select data-field="route">${[['', T('route.default', { name: T(`route.${S.model.routing || 'curved'}`) })], ['curved', T('route.curved')], ['elbow', T('route.elbow')]]
          .map(([k, l]) => `<option value="${k}"${(t.route || '') === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
        ${customTypes().length ? `<div class="field"><button class="btn small" data-act="edgetypes">${T('et.manage')}</button></div>` : ''}
        <div class="field">${T('insp.dir')}<div class="seg">${[['', 'dir.one'], ['both', 'dir.both']].map(([k, l]) =>
          `<button data-dir="${k}" class="${(t.both ? 'both' : '') === k ? 'on' : ''}">${T(l)}</button>`).join('')}</div></div>
        ${phaseField(t)}
        ${encField(t)}
        ${dataField(t, true)}
        ${dsField(t)}
        ${latencyField(t)}
        ${xferField(t)}
        ${strideField(t)}
        ${raidField(t)}
        ${adrField(t)}
        ${cmtField(t)}
        <div class="field">${T('insp.color')}${swatches(t.color)}</div>
        <div class="conns"><div class="conn-title">${T('insp.ends')}</div>
          <button class="conn" data-goto="${esc(a.id)}" style="--c:${nodeColor(a)}"><span class="dot"></span>${esc(a.label)}<em>${T('insp.source')}</em></button>
          <button class="conn" data-goto="${esc(b.id)}" style="--c:${nodeColor(b)}"><span class="dot"></span>${esc(b.label)}<em>${T('insp.target')}</em></button>
        </div>
        <div class="insp-actions">
          <button class="btn" data-act="reverse">${ICON.swap}${T('insp.reverse')}</button>
          <button class="btn danger" data-act="delete">${T('insp.delete')}</button>
        </div>`;
    } else if (kind === 'note') {
      html = head(colorVar(t.color) || 'var(--p-limon)', '', T('insp.note'), T('note.title')) + `
        <label>${T('note.text')}<textarea data-field="text" rows="5" placeholder="${esc(T('note.ph'))}">${esc(t.text || '')}</textarea></label>
        <div class="field">${T('insp.color')}${swatches(t.color)}</div>
        <div class="insp-actions">
          <button class="btn" data-act="dup">${T('insp.duplicate')}</button>
          <button class="btn danger" data-act="delete">${T('insp.delete')}</button>
        </div>`;
    } else if (kind === 'zone') {
      const tr = t.kind === 'trust';
      html = head(tr ? 'var(--trust)' : `var(--sev-${t.severity})`, '', T(tr ? 'insp.trust' : 'insp.zone'), t.label || (tr ? t.trust : '') || T(tr ? 'trust.new' : 'zone.new')) + `
        <div class="field">${T('zone.kind')}<div class="seg">${['risk', 'trust'].map(k => `<button data-zkind="${k}" class="${(tr ? 'trust' : 'risk') === k ? 'on' : ''}">${T(`zone.kind.${k}`)}</button>`).join('')}</div></div>
        <label>${T('zone.label')}<input data-field="label" value="${esc(t.label || '')}" placeholder="${esc(T(tr ? 'trust.label.ph' : 'zone.label.ph'))}"></label>
        ${tr ? `<label>${T('trust.level')}<input data-field="trust" list="trust-levels" value="${esc(t.trust || '')}" placeholder="${esc(T('trust.level.ph'))}" autocomplete="off"><datalist id="trust-levels">${['Internet', 'DMZ', 'Internal', 'Restricted'].map(o => `<option value="${o}">`).join('')}</datalist></label>`
          : `<div class="field">${T('zone.severity')}<div class="seg">${SEVERITY.map(k => `<button data-sev="${k}" class="sev-${k}${t.severity === k ? ' on' : ''}">${esc(sevLabel(k))}</button>`).join('')}</div></div>`}
        <label>${T('insp.desc')}<textarea data-field="desc" rows="3" placeholder="${esc(T(tr ? 'trust.desc.ph' : 'zone.desc.ph'))}">${esc(t.desc || '')}</textarea></label>
        <div class="insp-actions">
          <button class="btn" data-act="dup">${T('insp.duplicate')}</button>
          <button class="btn danger" data-act="delete">${T('insp.delete')}</button>
        </div>`;
    } else {
      const blocked = new Set([t.id]);
      let grew = true;
      while (grew) { grew = false; m.groups.forEach(g => { if (g.parent && blocked.has(g.parent) && !blocked.has(g.id)) { blocked.add(g.id); grew = true; } }); }
      const count = m.nodes.filter(n => inGroup(n, t.id)).length, gPriced = m.nodes.filter(n => inGroup(n, t.id) && hasCost(n));
      html = head(colorVar(t.color) || 'var(--muted)', '', T('insp.group'), t.label) + `
        <p class="note">${T('insp.groupNote', count)}</p>
        ${gPriced.length ? `<p class="cost-sum">${T('cst.groupCost')} <b>≈ ${money(round2(monthlyTotal(gPriced)))}${T('cost.mo')}</b><span>${T('insp.withCost', { a: gPriced.length, b: count })}</span></p>` : ''}
        <label>${T('insp.name')}<input data-field="label" value="${esc(t.label)}"></label>
        ${allIcons().some(i => i.group) ? iconPicker(t, true) : ''}
        <label>${T('gkind.label')}<select data-field="kind"><option value=""${t.kind ? '' : ' selected'}>${esc(T('gkind.auto', { k: T(`gkind.${groupKindAuto(t)}`) }))}</option>${['logical', 'physical'].map(k => `<option value="${k}"${t.kind === k ? ' selected' : ''}>${T(`gkind.${k}`)}</option>`).join('')}</select></label>
        ${phaseField(t)}
        ${regionField(t)}
        ${layerField(t)}
        <label>${T('insp.parent')}<select data-field="parent"><option value="">${T('insp.none')}</option>${m.groups.filter(g => !blocked.has(g.id) && (g.in || null) === (t.in || null)).map(g => `<option value="${esc(g.id)}"${g.id === t.parent ? ' selected' : ''}>${esc(g.label)}</option>`).join('')}</select></label>
        <div class="field">${T('insp.color')}${swatches(t.color)}</div>
        ${govField(t, 'group')}
        ${cmpField(t, 'group')}
        ${raidField(t)}
        ${adrField(t)}
        ${cmtField(t)}
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
    if (k === 'style' && v === '__newtype') { renderInspector(); return openEdgeTypes({ apply: !Array.isArray(t) && S.sel?.kind === 'edge' ? t : null }); }
    let newGroup = '';
    if (k === 'region') v = v.trim();
    if (k === 'cost' || k === 'costYears') {
      // Números: vacío o no válido = quitar el valor
      const num = v.trim() === '' ? NaN : +v;
      v = Number.isFinite(num) && num >= 0 ? (k === 'costYears' ? Math.max(1, Math.round(num)) : num) : '';
    }
    if (isSelect) pushHistory(); else markEdit();
    if (k === 'group' && v === '__new') {
      const parents = new Set(list.map(n => n.group || ''));
      const id = uniqueId('grupo-'), parent = parents.size === 1 ? [...parents][0] : '';
      const keys = paletteKeys();
      S.model.groups.push({ id, label: T('prompt.newGroup.def'), color: keys[S.model.groups.length % keys.length], ...(parent ? { parent } : {}), ...(S.scope ? { in: S.scope } : {}) });
      newGroup = id;
      v = id;
    }
    list.forEach(x => {
      if (v === '' && k !== 'label' && k !== 'text') delete x[k]; else x[k] = v;
      // Un icono oficial trae su tipo, que da el color pastel del borde
      if (k === 'icon' && iconInfo(v)) x.type = iconInfo(v).type;
      if (k === 'costPeriod' && v !== 'multi') delete x.costYears;
    });
    changed(k !== 'desc' || S.sel.kind === 'zone');
    if (k.startsWith('cost') && !isSelect) $('#inspector .cost-hint').textContent = costHint(list[0]);
    if (k === 'region') { // sin reconstruir el panel (el cuadro tiene el foco): solo la jurisdicción y la pista
      const j = $('#region-jur'), r = v || regionOf(list[0]).value, one = list.every(x => regionOf(x).value === regionOf(list[0]).value);
      if (j) { j.textContent = one ? regionJurText(r) : ''; j.hidden = !j.textContent; }
      if ($('#region-hint')) $('#region-hint').textContent = v ? '' : regionHint(list, false);
    }
    if (isSelect) renderInspector();
    if (newGroup) renameGroup(newGroup, true); // nombre en el lugar, sobre la etiqueta del nuevo grupo
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
  /* ---------- dueños y responsables: escribir en el inspector ---------- */
  inspector.addEventListener('focusin', ev => { if (ev.target.matches('input[data-gov]')) beginEdit(); });
  inspector.addEventListener('toggle', ev => { if (ev.target.matches('details[data-gov-open]')) store.set(`govOpen.${ev.target.dataset.govOpen}`, ev.target.open); }, true);
  inspector.addEventListener('input', ev => {
    const f = ev.target, t = selTarget();
    if (!f.matches('input[data-gov]') || !t) return;
    markEdit();
    const v = f.value.trim();
    (Array.isArray(t) ? t : [t]).forEach(x => { if (v) x[f.dataset.gov] = v; else delete x[f.dataset.gov]; });
    changed(true);
  });
  /* ---------- disponibilidad: escribir en el inspector ---------- */
  inspector.addEventListener('focusin', ev => { if (ev.target.matches('input[data-res]')) beginEdit(); });
  inspector.addEventListener('input', ev => {
    const f = ev.target, t = selTarget();
    if (!f.matches('input[data-res]') || !t) return;
    markEdit();
    const k = f.dataset.res, v = f.value.trim(), list = Array.isArray(t) ? t : [t];
    const val = !v ? null : k === 'sla' ? cleanSla(v) : k === 'replicas' ? cleanReplicas(v) : normDur(v);
    list.forEach(x => { if (val != null) x[k] = val; else delete x[k]; });
    changed(true);
    const h = $('#res-hint');
    if (h) h.innerHTML = resHintHtml(list);
  });
  /* ---------- latencia de la conexión: escribir en el inspector (inválida = campo marcado y no se guarda) ---------- */
  inspector.addEventListener('focusin', ev => { if (ev.target.matches('input[data-lat]')) beginEdit(); });
  inspector.addEventListener('input', ev => {
    const f = ev.target, t = selTarget();
    if (!f.matches('input[data-lat]') || !t || Array.isArray(t)) return;
    const v = f.value.trim(), val = v ? normDur(v) : null;
    f.setAttribute('aria-invalid', !!v && val == null);
    if (v && val == null) return;
    markEdit();
    if (val != null) t.latency = val; else delete t.latency;
    changed(true);
  });
  /* ---------- STRIDE: nota de cada decisión ---------- */
  inspector.addEventListener('focusin', ev => { if (ev.target.matches('input[data-th-note]')) beginEdit(); });
  inspector.addEventListener('input', ev => {
    const f = ev.target, t = selTarget(), d = f.matches('input[data-th-note]') && t && !Array.isArray(t) && t.threats?.[f.dataset.thNote];
    if (!d) return;
    markEdit();
    if (f.value.trim()) d.note = f.value; else delete d.note;
    changed(true);
  });
  inspector.addEventListener('input', ev => { if (ev.target.matches('input[data-field], textarea[data-field]')) onField(ev.target); });
  inspector.addEventListener('change', ev => { if (ev.target.matches('select[data-field]')) onField(ev.target); });
  inspector.addEventListener('change', ev => {
    if (!ev.target.matches('select[data-radar]') || ev.target.value === '__mixed') return;
    const t = selTarget(), v = ev.target.value;
    if (!t) return;
    pushHistory();
    (Array.isArray(t) ? t : [t]).filter(x => 'type' in x).forEach(x => { if (v) x.radar = v; else delete x.radar; });
    changed(true); renderInspector();
  });
  inspector.addEventListener('change', ev => {
    if (!ev.target.matches('select[data-ref]')) return;
    const t = selTarget(), v = ev.target.value;
    if (!t || Array.isArray(t) || !('type' in t)) return;
    pushHistory();
    if (v) t.ref = { doc: v }; else delete t.ref;
    changed(true); renderInspector();
  });
  inspector.addEventListener('click', ev => {
    const b = ev.target.closest('[data-ref-open]');
    const d = b && WS.index?.diagrams.find(x => x.docId === b.dataset.refOpen && !x.dupDocId);
    if (d) wsOpen(d.name);
  });
  // Esfuerzo del componente: cambiar perfil o días de una fila, añadir y quitar
  function efEdit(fn) {
    const t = selTarget();
    if (!t || Array.isArray(t) || !('type' in t)) return;
    pushHistory();
    const next = cleanEffort(fn([...(t.effort || [])].map(e => ({ ...e }))));
    if (next.length) t.effort = next; else delete t.effort;
    changed(true); renderInspector();
  }
  inspector.addEventListener('change', ev => {
    const el = ev.target;
    if (el.matches('select[data-ef-role]')) efEdit(l => { l[+el.dataset.efRole].role = el.value; return l; });
    else if (el.matches('input[data-ef-days]')) efEdit(l => { l[+el.dataset.efDays].days = el.value; return l; });
  });
  inspector.addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (b?.dataset.efRm != null) efEdit(l => l.filter((_, i) => i !== +b.dataset.efRm));
    else if (b?.dataset.efAdd) { const r = $('#ef-new-role')?.value, d = $('#ef-new-days')?.value; if (r && efDays(d)) efEdit(l => [...l, { role: r, days: d }]); else $('#ef-new-days')?.focus(); }
  });
  inspector.addEventListener('change', ev => { if (ev.target.matches('select[data-c4-into]') && ev.target.value) moveToScope(selIds(), ev.target.value); });
  // Añadir conjuntos de datos a la conexión elegida (Intro o coma; también al elegir de la lista o salir del campo)
  function addDatasets(inp) {
    const t = selTarget(), add = cleanDatasets(inp.value);
    if (!t || Array.isArray(t) || S.sel?.kind !== 'edge') return;
    inp.value = '';
    if (!add.length) return;
    pushHistory();
    t.datasets = cleanDatasets([...(t.datasets || []), ...add]);
    changed(true); renderInspector();
    $('#inspector .ds-add')?.focus();
  }
  inspector.addEventListener('keydown', ev => {
    if (ev.target.matches('.ds-add') && (ev.key === 'Enter' || ev.key === ',' || ev.key === ';')) { ev.preventDefault(); addDatasets(ev.target); }
  });
  inspector.addEventListener('change', ev => { if (ev.target.matches('.ds-add')) addDatasets(ev.target); });
  inspector.addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    const t = selTarget();
    if (b.dataset.color != null && t) {
      pushHistory();
      (Array.isArray(t) ? t : [t]).forEach(x => { if (b.dataset.color) x.color = b.dataset.color; else delete x.color; });
      changed(true); renderInspector();
    } else if (b.dataset.sev && t && !Array.isArray(t)) {
      pushHistory();
      t.severity = b.dataset.sev;
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
    } else if (b.dataset.lin) {
      showLineage(b.dataset.lin);
    } else if (b.dataset.dsRm && t && !Array.isArray(t)) {
      pushHistory();
      t.datasets = (t.datasets || []).filter(d => dsKey(d) !== dsKey(b.dataset.dsRm));
      if (!t.datasets.length) delete t.datasets;
      changed(true); renderInspector();
    } else if (b.dataset.layer != null && t) {
      pushHistory();
      (Array.isArray(t) ? t : [t]).forEach(x => { if (b.dataset.layer && DL[b.dataset.layer]) x.layer = b.dataset.layer; else delete x.layer; });
      changed(true); renderInspector();
    } else if (b.dataset.disp != null && t) {
      pushHistory();
      (Array.isArray(t) ? t : [t]).filter(x => 'type' in x).forEach(x => { if (b.dataset.disp && MG[b.dataset.disp]) x.disposition = b.dataset.disp; else delete x.disposition; });
      changed(true); renderInspector();
    } else if ((b.dataset.expo != null || b.dataset.bak != null) && t && !Array.isArray(t)) {
      pushHistory();
      if (b.dataset.expo != null) { if (b.dataset.expo) t.exposure = b.dataset.expo; else delete t.exposure; }
      else if (b.dataset.bak) t.backup = b.dataset.bak === 'yes'; else delete t.backup;
      changed(true); renderInspector();
    } else if (b.dataset.cst && b.dataset.ctl && t) {
      ctlEdit('set', b.dataset.ctl, b.dataset.cst);
    } else if (b.dataset.ctlRm && t) {
      ctlEdit('rm', b.dataset.ctlRm);
    } else if (b.dataset.ctlAdd && t) {
      ctlEdit('add', b.dataset.ctlAdd);
    } else if (b.dataset.cmp === 'matrix') {
      openCompMatrix();
    } else if (b.dataset.lnames && t) {
      setLayerNames(b.dataset.lnames);
    } else if (b.dataset.th && t && !Array.isArray(t) && S.sel?.kind === 'edge') {
      pushHistory();
      setThreat(t, b.dataset.th, b.dataset.st);
      changed(true); renderInspector();
    } else if (b.dataset.thClear != null && t && !Array.isArray(t)) {
      pushHistory();
      delete t.threats;
      changed(true); renderInspector();
    } else if (b.dataset.zkind && t && !Array.isArray(t) && S.sel?.kind === 'zone') {
      pushHistory();
      if (b.dataset.zkind === 'trust') { t.kind = 'trust'; delete t.severity; if (t.label === T('zone.new')) t.label = ''; }
      else { delete t.kind; delete t.trust; t.severity = SEVERITY.includes(t.severity) ? t.severity : 'medium'; if (!t.label) t.label = T('zone.new'); }
      changed(true); renderInspector();
    } else if (b.dataset.wt != null && t && !Array.isArray(t) && S.sel?.kind === 'edge') {
      pushHistory();
      if (EDGE_W[b.dataset.wt]) t.weight = b.dataset.wt; else delete t.weight;
      changed(true); renderInspector();
    } else if (b.dataset.dir != null && t && !Array.isArray(t)) {
      pushHistory();
      if (b.dataset.dir) t.both = true; else delete t.both;
      changed(true); renderInspector();
    } else if (b.dataset.enc != null && t) {
      pushHistory();
      if (b.dataset.enc) t.encrypted = b.dataset.enc === 'yes'; else delete t.encrypted;
      changed(true); renderInspector();
    } else if (b.dataset.xfer != null && t && !Array.isArray(t)) {
      pushHistory();
      if (t.transferOk) delete t.transferOk; else t.transferOk = true;
      changed(true); renderInspector();
    } else if (b.dataset.path && S.sel?.kind === 'multi' && S.sel.ids.length === 2) {
      const [x, y] = S.sel.ids;
      b.dataset.path === 'rev' ? showPath(y, x) : showPath(x, y);
    } else if (b.dataset.align) {
      alignNodes(b.dataset.align);
    } else if (b.dataset.reach) {
      S.reach = b.dataset.reach; store.set('reach', S.reach);
      $$('.seg button', inspector).forEach(x => x.classList.toggle('on', x === b));
      applyHighlight();
    } else if (b.dataset.goto) {
      if (VW.hideNodes.has(b.dataset.goto) && !VW.sc.nodes.has(b.dataset.goto)) return toast(T('view.hiddenHere'));
      select({ kind: 'node', id: b.dataset.goto }, { center: true });
    } else switch (b.dataset.act) {
      case 'close': select(null); break;
      case 'ctxfull': {
        const fl = VW.flows.get(S.flow);
        if (!fl) break;
        const a = fl.A.r, b = fl.B.r, x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y);
        setView('full');
        fitBox({ x: x0, y: y0, w: Math.max(a.x + a.w, b.x + b.w) - x0, h: Math.max(a.y + a.h, b.y + b.h) - y0 });
        break;
      }
      case 'connect': startConnect(t.id); break;
      case 'c4open': openInner(t.id); break;
      case 'c4up': moveUp(); break;
      case 'dup': duplicateSelection(); break;
      case 'mkzone': markZone(); break;
      case 'mktrust': markZone('trust'); break;
      case 'delete': deleteSelection(); break;
      case 'edgetypes': openEdgeTypes(); break;
      case 'reverse': pushHistory(); [t.from, t.to] = [t.to, t.from]; changed(true); renderInspector(); break;
    }
  });


  /* ---------- cumplimiento: sección del inspector y matriz ---------- */
  // Sección plegable «Cumplimiento» (nodos, grupos y varios a la vez): controles efectivos con su estado, buscador para añadir y sugerencias.
  // Estado por defecto al añadir: «Brecha» (no se da nada por cumplido hasta confirmarlo)
  const cmpField = (items, kind) => {
    if (!Object.keys(FWS).length) return '';
    const list = [].concat(items), one = list.length === 1 && list[0], effs = list.map(x => controlsOf(x));
    const keys = sortCtl([...new Set(effs.flatMap(e => [...e.keys()]))]), open = store.get(`govOpen.cmp-${kind}`, keys.length > 0);
    const rows = keys.map(k => {
      const c = ctlInfo(k), sts = effs.map(e => e.get(k)?.status), st = sts.every(s => s === sts[0]) ? sts[0] : null, have = sts.filter(Boolean).length;
      const own = list.some(x => x.controls?.[k]), from = one && effs[0].get(k)?.from, gl = from ? groupById(from)?.label || from : '';
      const note = [gl ? T('cmp.inh', gl) : '', have < list.length ? T('cmp.some', { a: have, b: list.length }) : '', st === null && have === list.length ? T('cmp.mixed') : ''].filter(Boolean).join(' · ');
      return `<div class="cmp-row${gl && !own ? ' inh' : ''}"><div class="cmp-top"><span class="cmp-fw">${esc(c.short)}</span><span class="cmp-id">${esc(c.id)}</span><span class="cmp-t" title="${esc(c.title)}">${esc(c.title)}</span>
        ${own ? `<button class="cmp-x" data-ctl-rm="${esc(k)}" title="${esc(T(from ? 'cmp.rmLocal' : 'cmp.rm'))}" aria-label="${esc(T(from ? 'cmp.rmLocal' : 'cmp.rm'))}">×</button>` : ''}</div>
        <div class="seg cmp-seg">${CTL_STATUS.map(s => `<button data-ctl="${esc(k)}" data-cst="${s}" class="cst-${s}${st === s ? ' on' : ''}" style="--cc:${CTL_COLOR[s]}"${gl && !own ? ` title="${esc(T('cmp.override'))}"` : ''}>${esc(T(`cmp.${s}`))}</button>`).join('')}</div>
        ${note ? `<span class="cost-hint">${esc(note)}</span>` : ''}</div>`;
    }).join('');
    const sug = ctlSuggest(list);
    return `<details class="gov-box cmp-box" data-gov-open="cmp-${kind}"${open ? ' open' : ''}><summary>${T('cmp.title')}${keys.length ? ` · ${keys.length}` : ''}</summary>
      ${rows || `<p class="cost-hint">${T('cmp.none')}</p>`}
      <label>${T('cmp.add')}<input id="ctl-add" list="dl-ctl" placeholder="${esc(T('cmp.add.ph'))}" autocomplete="off"><datalist id="dl-ctl">${CTL_ALL.map(k => { const c = ctlInfo(k); return `<option value="${esc(`${k} — ${c.title}`)}" label="${esc(`${c.short} · ${c.title}`)}"></option>`; }).join('')}</datalist></label>
      ${sug.length ? `<div class="cmp-sug"><span class="cost-hint" title="${esc(T('cmp.sugg.tip'))}">${T('cmp.sugg')}</span>${sug.map(k => { const c = ctlInfo(k); return `<button class="cmp-chip" data-ctl-add="${esc(k)}" title="${esc(`${c.title} · ${T('cmp.sugg.tip')}`)}">+ ${esc(c.short)} ${esc(c.id)}</button>`; }).join('')}</div>` : ''}
      <button class="btn small cmp-open" data-cmp="matrix">${T('cmp.matrix')}</button></details>`;
  };
  // Acciones del inspector (varios a la vez): estado de un control (crea un valor propio que sustituye al heredado), quitar el propio y añadir
  function ctlEdit(op, key, status) {
    const t = selTarget();
    if (!t) return;
    const list = [].concat(t);
    pushHistory();
    list.forEach(x => {
      if (op === 'set') (x.controls ||= {})[key] = status;
      else if (op === 'add') { if (!controlsOf(x).has(key)) (x.controls ||= {})[key] = 'gap'; }
      else if (op === 'rm' && x.controls) { delete x.controls[key]; if (!Object.keys(x.controls).length) delete x.controls; }
    });
    changed(true); renderInspector();
    if (op === 'add') $('#ctl-add')?.focus();
  }
  function ctlAddFromInput(inp) {
    const v = inp.value.trim();
    if (!v) return;
    const k = resolveCtl(v);
    if (!k) return toast(T('cmp.unknown'), 3200);
    ctlEdit('add', k);
  }
  inspector.addEventListener('keydown', ev => { if (ev.target.id === 'ctl-add' && ev.key === 'Enter') { ev.preventDefault(); ctlAddFromInput(ev.target); } });
  inspector.addEventListener('change', ev => { if (ev.target.id === 'ctl-add') ctlAddFromInput(ev.target); });
  // Elegir una opción de la lista lanza `input` sin texto escrito (insertReplacementText o sin inputType)
  inspector.addEventListener('input', ev => { if (ev.target.id === 'ctl-add' && (!ev.inputType || ev.inputType === 'insertReplacementText') && ev.target.value.includes(' — ')) ctlAddFromInput(ev.target); });

  // Matriz: filas = componentes (con controles o datos sensibles), columnas = controles en uso agrupados por marco
  function openCompMatrix() {
    const prev = document.activeElement, back = document.createElement('div'), id = `cm${Date.now()}`;
    let fw = '';
    back.className = 'cf-back';
    back.innerHTML = `<div class="cf cm" role="dialog" aria-modal="true" aria-labelledby="${id}t">
      <div class="cm-head"><h3 id="${id}t">${esc(T('cmp.matrix'))}</h3>
        <label class="cm-fw">${esc(T('cmp.mx.fw'))}<select data-cm="fw"></select></label>
        <span class="cm-btns"><button class="btn small" data-cm="csv">${esc(T('cmp.mx.csv'))}</button><button class="btn small" data-cm="long">${esc(T('cmp.mx.csvLong'))}</button><button class="btn small" data-cm="close">${esc(T('cmp.mx.close'))}</button></span></div>
      <div class="cm-sum"></div><div class="cm-scroll"></div><p class="cm-note">${esc(T('cmp.mx.note'))}</p></div>`;
    const sel = back.querySelector('[data-cm="fw"]'), sum = back.querySelector('.cm-sum'), box = back.querySelector('.cm-scroll');
    const draw = () => {
      const all = cmpModel(S.model), fws = cmpFrameworks(all.keys);
      if (fw && !fws.includes(fw)) fw = '';
      sel.innerHTML = `<option value="">${esc(T('cmp.mx.all'))}</option>${fws.map(f => `<option value="${esc(f)}"${f === fw ? ' selected' : ''}>${esc(ctlInfo(`${f}:x`).short)}</option>`).join('')}`;
      const { rows, keys, stats } = fw ? cmpModel(S.model, fw) : all;
      if (!keys.length) { sum.innerHTML = ''; box.innerHTML = `<p class="cm-empty">${esc(T('cmp.mx.empty'))}</p>`; return; }
      const tot = f => keys.filter(k => ctlSplit(k)[0] === f).reduce((a, k) => { const s = stats.get(k); CTL_STATUS.concat('unmapped').forEach(x => { a[x] += s[x]; }); return a; }, { met: 0, partial: 0, gap: 0, na: 0, unmapped: 0 });
      sum.innerHTML = cmpFrameworks(keys).map(f => { const t = tot(f); return `<div class="cm-card"><b>${esc(ctlInfo(`${f}:x`).short)}</b>${[...CTL_STATUS.slice(0, 3), 'unmapped'].map(s => `<span class="cm-n cst-${s}" style="--cc:${CTL_COLOR[s] || 'var(--border)'}" title="${esc(T(`cmp.${s}`))}"><i>${s === 'unmapped' ? '○' : CTL_SYM[s]}</i>${t[s]}</span>`).join('')}</div>`; }).join('');
      const fwRow = cmpFrameworks(keys).map(f => `<th colspan="${keys.filter(k => ctlSplit(k)[0] === f).length}" class="cm-fwh">${esc(ctlInfo(`${f}:x`).short)}</th>`).join('');
      const head = keys.map(k => { const c = ctlInfo(k); return `<th class="cm-ch" title="${esc(`${c.short} ${c.id}${c.title ? ` — ${c.title}` : ''}`)}"><b>${esc(c.id)}</b><span>${esc(c.title)}</span></th>`; }).join('');
      const body = rows.map(r => `<tr><th class="cm-rh" title="${esc(`${r.n.label}${cmpGroupName(r.n) ? ` · ${cmpGroupName(r.n)}` : ''}`)}">${esc(r.n.label)}${cmpGroupName(r.n) ? `<small>${esc(cmpGroupName(r.n))}</small>` : ''}</th>${keys.map(k => {
        const e = r.eff.get(k), c = ctlInfo(k);
        return e ? `<td class="cm-c cst-${e.status}" style="--cc:${CTL_COLOR[e.status]}" title="${esc(`${r.n.label} · ${c.short} ${c.id}: ${T(`cmp.${e.status}`)}${e.from ? ` (${T('cmp.inh', groupById(e.from)?.label || e.from)})` : ''}`)}">${CTL_SYM[e.status]}</td>` : '<td class="cm-c"></td>';
      }).join('')}</tr>`).join('');
      const cov = keys.map(k => { const s = stats.get(k), d = rows.length - s.na; return `<td class="cm-cov" title="${esc(`${T('cmp.met')} ${s.met} · ${T('cmp.partial')} ${s.partial} · ${T('cmp.gap')} ${s.gap} · ${T('cmp.na')} ${s.na} · ${T('cmp.mx.unmapped')} ${s.unmapped}`)}">${d > 0 ? Math.round(s.met / d * 100) + '%' : '—'}</td>`; }).join('');
      box.innerHTML = `<table class="cm-table"><thead><tr><th class="cm-rh cm-corner" rowspan="2">${esc(T('cmp.csv.comp'))}</th>${fwRow}</tr><tr>${head}</tr></thead><tbody>${body}</tbody><tfoot><tr><th class="cm-rh">${esc(T('cmp.mx.cov'))}</th>${cov}</tr></tfoot></table>`;
    };
    const close = () => { document.removeEventListener('keydown', key, true); back.remove(); prev?.focus?.(); };
    const key = ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); } };
    sel.addEventListener('change', () => { fw = sel.value; draw(); });
    back.addEventListener('mousedown', ev => { if (ev.target === back) close(); });
    back.addEventListener('click', ev => {
      const b = ev.target.closest('[data-cm]');
      if (!b || b.dataset.cm === 'fw') return;
      if (b.dataset.cm === 'close') close(); else exportCompliance(b.dataset.cm === 'long' ? 'long' : 'wide', fw);
    });
    document.addEventListener('keydown', key, true);
    draw();
    document.body.appendChild(back);
    back.querySelector('[data-cm="close"]').focus();
  }

  /* ---------- tipos de conexión propios: opciones del inspector y gestor (model.edgeTypes) ---------- */
  function edgeStyleOptions(cur) {
    const ES = edgeStyles(), opt = k => `<option value="${esc(k)}"${k === cur ? ' selected' : ''}>${esc(loc(ES[k].label))}</option>`;
    const mine = customTypes().map(t => t.id);
    return Object.keys(C.edgeStyles).map(opt).join('') + (mine.length ? `<optgroup label="${esc(T('et.custom'))}">${mine.map(opt).join('')}</optgroup>` : '') + `<option value="__newtype">${esc(T('et.new'))}</option>`;
  }
  // Clave a partir del nombre: minúsculas sin acentos, a-z 0-9 y guiones; única entre los tipos de config.js y los del diagrama
  function edgeTypeId(label) {
    const base = (String(label).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'tipo');
    let id = base, n = 2;
    while (Object.hasOwn(C.edgeStyles, id) || customTypes().some(t => t.id === id)) id = `${base}-${n++}`;
    return id;
  }
  // Línea de muestra (SVG) de un tipo: patrón, grosor y color ya validados
  function edgeSample(t, w = 56) {
    const sv = document.createElementNS(NS, 'svg');
    sv.setAttribute('viewBox', `0 0 ${w} 14`); sv.setAttribute('width', w); sv.setAttribute('height', 14); sv.setAttribute('class', 'et-sample');
    const dash = cleanDash(t.dash), c = (t.color && colorVar(t.color)) || 'var(--muted)';
    const ln = el('path', { d: `M2,7 L${w - 12},7`, fill: 'none', 'stroke-linecap': 'round', 'stroke-width': Math.min(4, Math.max(1, +t.width || 1.8)), ...(dash ? { 'stroke-dasharray': dash } : {}) }, sv);
    ln.style.stroke = c;
    el('path', { d: `M${w - 2},7 L${w - 10},3 L${w - 10},11 Z` }, sv).style.fill = c;
    return sv;
  }
  /* ---------- comentarios: diálogo con los hilos ---------- */
  const CMD = { filter: 'open' };   // qué hilos se ven: open | all | done
  const cmAuthorNow = () => store.get('commentAuthor', '') || S.model.meta?.author || store.get('reviewer', '') || '';
  const cmTargetText = (m, on) => {
    const nm = id => m.nodes.find(n => n.id === id)?.label || id;
    if (on.kind === 'node') return nm(on.id);
    if (on.kind === 'edge') { const e = m.edges.find(x => x.id === on.id); return e ? `${nm(e.from)} ${e.both ? '↔' : '→'} ${nm(e.to)}` : on.id; }
    if (on.kind === 'group') return m.groups.find(g => g.id === on.id)?.label || on.id;
    if (on.kind === 'decision') { const d = (m.decisions || []).find(x => x.id === on.id); return d ? `${d.id} · ${adrTitle(d)}` : on.id; }
    if (on.kind === 'requirement') { const r = (m.requirements || []).find(x => x.id === on.id); return r ? `${r.id} · ${r.title}` : on.id; }
    if (on.kind === 'version') { const v = (m.versions || []).find(x => x.id === on.id); return v ? verLabel(v) : on.id; }
    return T('cmt.general');
  };
  // Resumen en el inspector del componente, la conexión o el grupo; los hilos se leen y escriben en el diálogo
  const cmtField = t => {
    const kind = S.sel?.kind;
    if (!['node', 'edge', 'group'].includes(kind) || !t?.id) return '';
    const all = (S.model.comments || []).filter(c => c.on.kind === kind && c.on.id === t.id), open = all.filter(c => c.status !== 'resolved').length;
    return `<div class="field cmt-field">${T('cmt.field')}<div class="cmt-row"><button class="btn small" data-cmt="open">💬 ${esc(all.length ? T('cmt.open.n', { o: open, n: all.length }) : T('cmt.add'))}</button></div></div>`;
  };
  function openComments(scope = null) {
    const prev = document.activeElement, back = document.createElement('div'), id = `cm${Date.now()}`;
    let sc = scope, sure = null;
    const m = () => S.model, byId = cid => (m().comments || []).find(c => c.id === cid);
    back.className = 'cf-back';
    back.innerHTML = `<div class="cf cmt-dlg" role="dialog" aria-modal="true" aria-labelledby="${id}t">
      <h3 id="${id}t">${esc(T('cmt.title'))}</h3>
      <div class="cmt-bar"><div class="seg cmt-seg" role="group">${['open', 'all', 'done'].map(k => `<button type="button" data-cmf="${k}">${esc(T(`cmt.flt.${k}`))}</button>`).join('')}</div><span class="cmt-scope"></span></div>
      <div class="cmt-list" role="list"></div>
      <form class="cmt-form" novalidate>
        <div class="cmt-row2"><label>${esc(T('cmt.author'))}<input name="author" maxlength="80" autocomplete="off"></label><label>${esc(T('cmt.on'))}<select name="on"></select></label></div>
        <label>${esc(T('cmt.text'))}<textarea name="text" rows="3" maxlength="${CM_TEXT}" placeholder="${esc(T('cmt.text.ph'))}"></textarea></label>
        <div class="cf-actions"><button type="button" class="btn" data-cm="close">${esc(T('et.close'))}</button><button type="submit" class="btn primary">${esc(T('cmt.post'))}</button></div>
      </form></div>`;
    const list = back.querySelector('.cmt-list'), form = back.querySelector('form'), scopeBox = back.querySelector('.cmt-scope');
    const fillTargets = () => {
      const mm = m(), opt = (k, o, label) => `<option value="${esc(`${k}:${o}`)}"${sc && sc.kind === k && sc.id === o ? ' selected' : ''}>${esc(label)}</option>`;
      const grp = (k, items, label) => (items.length ? `<optgroup label="${esc(T(`cmt.kind.${k}`))}">${items.map(x => opt(k, x.id, label(x))).join('')}</optgroup>` : '');
      form.on.innerHTML = `<option value="general"${sc ? '' : ' selected'}>${esc(T('cmt.general'))}</option>`
        + grp('node', mm.nodes, x => x.label) + grp('edge', mm.edges, x => cmTargetText(mm, { kind: 'edge', id: x.id })) + grp('group', mm.groups, x => x.label)
        + grp('decision', mm.decisions || [], x => `${x.id} · ${adrTitle(x)}`) + grp('requirement', mm.requirements || [], x => `${x.id} · ${x.title}`) + grp('version', mm.versions || [], x => verLabel(x));
    };
    const drawList = () => {
      const f = CMD.filter, rows = (m().comments || []).filter(c => (!sc || (c.on.kind === sc.kind && c.on.id === sc.id)) && (f === 'all' || (f === 'open') === (c.status !== 'resolved')));
      back.querySelectorAll('[data-cmf]').forEach(b => b.classList.toggle('on', b.dataset.cmf === f));
      scopeBox.innerHTML = sc ? `<span class="cmt-chip">${esc(cmTargetText(m(), sc))}<button type="button" data-cm="unscope" aria-label="${esc(T('cmt.unscope'))}" title="${esc(T('cmt.unscope'))}">×</button></span>` : '';
      list.innerHTML = rows.length ? rows.map(c => {
        const goes = ['node', 'edge', 'group'].includes(c.on.kind), label = c.on.kind === 'general' && c.was ? T('cmt.was', c.was) : cmTargetText(m(), c.on);
        const who = x => `<b>${esc(x.author || T('cmt.anon'))}</b>${x.date ? ` · ${esc(fmtDay(x.date))}` : ''}`;
        return `<div class="cmt${c.status === 'resolved' ? ' done' : ''}" role="listitem" data-cid="${esc(c.id)}">
          <div class="cmt-h">${goes ? `<button type="button" class="cmt-on" data-cm="go" title="${esc(T('cmt.go'))}">${esc(label)}</button>` : `<span class="cmt-on">${esc(label)}</span>`}
            <span>${who(c)}${c.source === 'client' ? ` · <em>${esc(T('cmt.client'))}</em>` : ''}${c.internal ? ` · <em>${esc(T('cmt.internal'))}</em>` : ''}${c.status === 'resolved' ? ` · <em>${esc(T('cmt.resolved'))}</em>` : ''}</span></div>
          <div class="cmt-t">${esc(c.text)}</div>
          ${(c.replies || []).map(r => `<div class="cmt-r"><div class="cmt-h"><span>${who(r)}</span></div><div class="cmt-t">${esc(r.text)}</div></div>`).join('')}
          <div class="cmt-rbox" hidden><textarea rows="2" maxlength="${CM_TEXT}" aria-label="${esc(T('cmt.reply'))}"></textarea><button type="button" class="btn small primary" data-cm="send">${esc(T('cmt.send'))}</button></div>
          <div class="cmt-a"><button type="button" class="btn small" data-cm="reply">${esc(T('cmt.reply'))}</button>
            <button type="button" class="btn small" data-cm="toggle">${esc(T(c.status === 'resolved' ? 'cmt.reopen' : 'cmt.resolve'))}</button>
            <button type="button" class="btn small" data-cm="internal" aria-pressed="${c.internal ? 'true' : 'false'}" title="${esc(T('cmt.internal.tip'))}">${esc(T(c.internal ? 'cmt.internal.off' : 'cmt.internal.on'))}</button>
            <button type="button" class="btn small danger" data-cm="del">${esc(T(sure === c.id ? 'cmt.del.sure' : 'cmt.del'))}</button></div></div>`;
      }).join('') : `<p class="cmt-empty">${esc(T((m().comments || []).length ? 'cmt.none.filter' : 'cmt.none'))}</p>`;
    };
    // Cada cambio es un paso de historial; el diagrama se repinta (insignias) y el resumen del inspector se actualiza
    const edit = fn => {
      pushHistory(); fn();
      const l = cleanComments(m().comments, m());
      if (l.length) m().comments = l; else delete m().comments;
      changed(true); renderInspector(); drawList();
    };
    const close = () => { document.removeEventListener('keydown', key, true); back.remove(); prev?.focus?.(); };
    const key = ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); } };
    back.addEventListener('mousedown', ev => { if (ev.target === back) close(); });
    back.addEventListener('click', ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.dataset.cmf) { CMD.filter = b.dataset.cmf; sure = null; return drawList(); }
      const act = b.dataset.cm, row = b.closest('[data-cid]'), c = row && byId(row.dataset.cid);
      if (act === 'close') return close();
      if (act === 'unscope') { sc = null; fillTargets(); return drawList(); }
      if (!c) return;
      if (act === 'go') { close(); return focusTarget(c.on.kind, c.on.id); }
      if (act === 'reply') { const rb = row.querySelector('.cmt-rbox'); rb.hidden = false; return rb.querySelector('textarea').focus(); }
      if (act === 'send') {
        const text = row.querySelector('.cmt-rbox textarea').value.trim(), author = form.author.value.trim();
        if (!text) return;
        if ((c.replies || []).length >= CM_REPLIES) return toast(T('cmt.max', CM_REPLIES));
        store.set('commentAuthor', author);
        return edit(() => { c.replies = [...(c.replies || []), { ...(author ? { author } : {}), date: today(), text }]; });
      }
      if (act === 'toggle') return edit(() => { if (c.status === 'resolved') delete c.status; else c.status = 'resolved'; });
      if (act === 'internal') return edit(() => { if (c.internal) delete c.internal; else c.internal = true; });
      if (act === 'del') {
        if (sure !== c.id) { sure = c.id; return drawList(); }   // dos pulsaciones: la primera pide confirmar
        sure = null;
        edit(() => { m().comments = m().comments.filter(x => x.id !== c.id); });
      }
    });
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      const text = form.text.value.trim(), author = form.author.value.trim();
      if (!text) return form.text.focus();
      if ((m().comments || []).length >= CM_MAX) return toast(T('cmt.max', CM_MAX));
      const v = form.on.value, i = v.indexOf(':'), on = v === 'general' || i < 0 ? { kind: 'general' } : { kind: v.slice(0, i), id: v.slice(i + 1) };
      store.set('commentAuthor', author);
      if (CMD.filter === 'done') CMD.filter = 'open';
      edit(() => { m().comments = [...(m().comments || []), { id: '', on, ...(author ? { author } : {}), date: today(), text }]; });
      form.text.value = ''; form.text.focus();
    });
    form.author.value = cmAuthorNow();
    fillTargets(); drawList();
    document.addEventListener('keydown', key, true);
    document.body.appendChild(back);
    form.text.focus();
  }
  $('#btn-comments').addEventListener('click', () => openComments());
  $('#inspector').addEventListener('click', ev => {
    const b = ev.target.closest('button[data-cmt]');
    if (b && ['node', 'edge', 'group'].includes(S.sel?.kind)) openComments({ kind: S.sel.kind, id: S.sel.id });
  });

  /* ---------- importar los comentarios del revisor (archivo cifrado que devuelve el visor compartido) ---------- */
  function openFeedbackImport(env) {
    const SH = window.DiagramonShare;
    if (!SH?.openFeedback || !window.crypto?.subtle || typeof DecompressionStream === 'undefined') return toast(T('share.unsupported'), 3200);
    const prev = document.activeElement, back = document.createElement('div'), id = `fb${Date.now()}`;
    let res = null;
    back.className = 'cf-back';
    back.innerHTML = `<form class="cf fb" role="dialog" aria-modal="true" aria-labelledby="${id}t" autocomplete="off">
      <h3 id="${id}t">${esc(T('fb.title'))}</h3>
      <p class="fb-lead">${esc(T('fb.lead'))}</p>
      <label class="fb-pw">${esc(T('fb.pw'))}<input type="password" name="pw" autocomplete="off" required></label>
      <div class="fb-sum" hidden></div>
      <p class="sh-err" role="alert"></p>
      <div class="cf-actions"><button type="button" class="btn" data-fb="no">${esc(T('ver.cf.cancel'))}</button><button type="submit" class="btn primary">${esc(T('fb.open'))}</button></div></form>`;
    const form = back.querySelector('form'), err = form.querySelector('.sh-err'), sum = form.querySelector('.fb-sum'), go = form.querySelector('[type="submit"]');
    const close = () => { document.removeEventListener('keydown', key, true); back.remove(); prev?.focus?.(); };
    const key = ev => { if (ev.key === 'Escape' && !form.classList.contains('busy')) { ev.preventDefault(); ev.stopPropagation(); close(); } };
    back.addEventListener('mousedown', ev => { if (ev.target === back && !form.classList.contains('busy')) close(); });
    form.addEventListener('click', ev => { if (ev.target.closest('[data-fb="no"]')) close(); });
    form.elements.pw.addEventListener('input', () => { err.textContent = ''; });
    // Qué entra: recuento y avisos, y una vista previa de los primeros comentarios (siempre como texto)
    const showSummary = (fb, r) => {
      const warn = [];
      if (fb.title && fb.title !== S.model.title) warn.push(T('fb.mismatch', fb.title));
      if (r.dup) warn.push(T('fb.dup', r.dup));
      if (r.orphan) warn.push(T('fb.orphan', r.orphan));
      if (r.stray) warn.push(T('fb.stray', r.stray));
      if (r.capped) warn.push(T('fb.capped', r.capped));
      const preview = fb.comments.slice(0, 6).map(c => `<li><b>${esc(c.author || T('cmt.anon'))}</b> · ${esc(c.replyTo ? T('cmt.reply') : cmTargetText(S.model, c.on))}: ${esc(c.text.length > 140 ? `${c.text.slice(0, 140)}…` : c.text)}</li>`).join('');
      sum.innerHTML = `<p><b>${esc(T('fb.from', { a: fb.author || T('cmt.anon'), t: fb.title || '' }))}</b></p>
        <p>${esc(r.threads + r.replies ? T('fb.sum', { t: r.threads, r: r.replies }) : T('fb.none'))}</p>
        ${warn.length ? `<ul class="fb-warn">${warn.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
        <ul class="fb-prev">${preview}</ul>`;
      sum.hidden = false;
      form.querySelector('.fb-pw').hidden = true; form.querySelector('.fb-lead').hidden = true;
    };
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      if (form.classList.contains('busy')) return;
      if (res) {   // segundo paso: aplicar
        if (!res.threads && !res.replies) return close();
        pushHistory();
        S.model.comments = res.comments;
        changed(true); renderInspector();
        toast(T('fb.done', { t: res.threads, r: res.replies }), 4200);
        close(); openComments();
        return;
      }
      form.classList.add('busy'); go.textContent = T('fb.busy'); err.textContent = '';
      try {
        const fb = cleanFeedback(await SH.openFeedback(env, form.elements.pw.value));
        if (!fb) throw new Error('format');
        res = mergeFeedback(S.model, fb, today());
        showSummary(fb, res);
        go.textContent = res.threads + res.replies ? T('fb.go', { n: res.threads + res.replies }) : T('fb.close');
      } catch (e) {
        err.textContent = e && e.message === 'format' ? T('fb.bad') : T('fb.wrong');
        go.textContent = T('fb.open'); form.elements.pw.select();
      } finally { form.classList.remove('busy'); }
    });
    document.addEventListener('keydown', key, true);
    document.body.appendChild(back);
    form.elements.pw.focus();
  }
  function openEdgeTypes(opts = {}) {
    const prev = document.activeElement, back = document.createElement('div'), id = `et${Date.now()}`, apply = opts.apply || null;
    let editing = null, draft = { label: '', dash: '6 6', color: '', width: 1.8, particles: 1 };
    back.className = 'cf-back';
    back.innerHTML = `<div class="cf et" role="dialog" aria-modal="true" aria-labelledby="${id}t">
      <h3 id="${id}t">${esc(T('et.title'))}</h3>
      <p>${esc(T('et.hint'))}</p>
      <div class="et-list"></div>
      <form class="et-form" novalidate>
        <h4 class="et-sub"></h4>
        <label>${esc(T('et.label'))}<input class="cf-type" name="label" maxlength="60" autocomplete="off" placeholder="${esc(T('et.label.ph'))}"></label>
        <div class="et-f"><span>${esc(T('et.dash'))}</span><div class="et-dashes" role="radiogroup"></div></div>
        <div class="et-f"><span>${esc(T('insp.color'))}</span><div class="swatches et-colors"></div></div>
        <div class="et-row">
          <label>${esc(T('et.width'))} <output name="wout"></output><input type="range" name="width" min="1" max="4" step="0.1"></label>
          <label>${esc(T('et.particles'))}<select name="particles">${[0, 1, 2, 3, 4].map(n => `<option value="${n}">${n}</option>`).join('')}</select></label>
        </div>
        <div class="et-prev"></div>
        <div class="cf-actions"><button type="button" class="btn" data-et="close">${esc(T('et.close'))}</button><button type="submit" class="btn primary" data-et="save">${esc(T('et.save'))}</button></div>
      </form></div>`;
    const form = back.querySelector('form'), list = back.querySelector('.et-list'), dashes = back.querySelector('.et-dashes'), cols = back.querySelector('.et-colors'), prevBox = back.querySelector('.et-prev');
    const drawPrev = () => {
      prevBox.textContent = '';
      prevBox.appendChild(edgeSample(draft, 120));
      const sp = document.createElement('span'); sp.textContent = draft.label || T('et.label.ph'); prevBox.appendChild(sp);
    };
    const drawForm = () => {
      form.querySelector('.et-sub').textContent = editing ? T('et.edit') : T('et.create');
      form.label.value = draft.label; form.width.value = draft.width; form.particles.value = draft.particles;
      form.wout.textContent = `${draft.width}px`;
      dashes.textContent = '';
      EDGE_DASHES.forEach(d => {
        const b = document.createElement('button'), on = (draft.dash || '') === d;
        b.type = 'button'; b.className = `et-dash${on ? ' on' : ''}`; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.dataset.dash = d; b.title = d || T('et.solid');
        b.appendChild(edgeSample({ dash: d, width: 2, color: draft.color }, 48));
        dashes.appendChild(b);
      });
      cols.textContent = '';
      const mk = (cls, k, title, color) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = `sw ${cls}${(draft.color || '') === k ? ' on' : ''}`; b.dataset.etc = k; b.title = title;
        if (color) b.style.setProperty('--c', color);
        cols.appendChild(b);
      };
      mk('auto', '', T('insp.auto'));
      paletteKeys().forEach(k => mk('', k, I.colorName(k), `var(--p-${k})`));
      const hex = /^#[0-9a-f]{6}$/i.test(draft.color || '') ? draft.color : '';
      const ci = document.createElement('input');
      ci.type = 'color'; ci.className = 'et-hex'; ci.value = hex || '#8573db'; ci.title = T('color.custom'); ci.setAttribute('aria-label', T('color.custom'));
      cols.appendChild(ci);
      drawPrev();
    };
    const drawList = () => {
      list.textContent = '';
      customTypes().forEach(t => {
        const n = S.model.edges.filter(e => e.style === t.id).length, row = document.createElement('div');
        row.className = 'et-item';
        row.appendChild(edgeSample(t, 56));
        const nm = document.createElement('span'); nm.className = 'et-name'; nm.textContent = t.label; row.appendChild(nm);
        const cnt = document.createElement('small'); cnt.textContent = n ? T('et.used', n) : ''; row.appendChild(cnt);
        [['edit', 'et.edit.btn'], ['del', 'et.del']].forEach(([a, k]) => {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'btn small'; b.dataset.eta = a; b.dataset.id = t.id; b.textContent = T(k); row.appendChild(b);
        });
        list.appendChild(row);
      });
      list.hidden = !list.children.length;
    };
    const readForm = () => { // lo escrito se valida de nuevo al guardar (cleanEdgeTypes)
      draft = { ...draft, label: form.label.value, width: +form.width.value || 1.8, particles: +form.particles.value };
      form.wout.textContent = `${draft.width}px`;
    };
    const close = () => { document.removeEventListener('keydown', key, true); back.remove(); prev?.focus?.(); };
    const key = ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); } };
    const reset = () => { editing = null; draft = { label: '', dash: '6 6', color: '', width: 1.8, particles: 1 }; drawForm(); };
    form.addEventListener('input', () => { readForm(); drawPrev(); });
    form.addEventListener('change', ev => { if (ev.target.classList.contains('et-hex')) { readForm(); draft.color = ev.target.value; drawForm(); } });
    form.addEventListener('click', ev => {
      const d = ev.target.closest('[data-dash]'), c = ev.target.closest('[data-etc]');
      if (d) { readForm(); draft.dash = d.dataset.dash; drawForm(); }
      else if (c) { readForm(); draft.color = c.dataset.etc; drawForm(); }
      else if (ev.target.closest('[data-et="close"]')) close();
    });
    form.addEventListener('submit', ev => {
      ev.preventDefault(); readForm();
      const t = cleanEdgeTypes([{ ...draft, id: editing || edgeTypeId(draft.label) }])[0];
      if (!t || !draft.label.trim()) { form.label.focus(); return toast(T('et.need')); }
      pushHistory();
      const all = customTypes().slice(), i = all.findIndex(x => x.id === t.id);
      if (i >= 0) all[i] = t; else all.push(t);
      S.model.edgeTypes = all;
      if (apply && !editing && S.model.edges.includes(apply)) apply.style = t.id;
      changed(true); renderInspector();
      toast(T(editing ? 'et.saved' : 'et.created', { label: t.label }));
      if (apply && !editing) return close();
      drawList(); reset();
    });
    back.addEventListener('mousedown', ev => { if (ev.target === back) close(); });
    back.addEventListener('click', ev => {
      const b = ev.target.closest('[data-eta]');
      if (!b) return;
      const t = customTypes().find(x => x.id === b.dataset.id);
      if (!t) return;
      if (b.dataset.eta === 'edit') { editing = t.id; draft = { label: t.label, dash: t.dash || '', color: t.color || '', width: t.width ?? 1.8, particles: t.particles ?? 1 }; drawForm(); return; }
      pushHistory();
      const n = S.model.edges.filter(e => e.style === t.id).length;
      S.model.edges.forEach(e => { if (e.style === t.id) delete e.style; }); // en uso: vuelven a síncrona
      const rest = customTypes().filter(x => x.id !== t.id);
      if (rest.length) S.model.edgeTypes = rest; else delete S.model.edgeTypes;
      changed(true); renderInspector();
      toast(T('et.deleted', { label: t.label, n }));
      if (editing === t.id) reset();
      drawList();
    });
    document.addEventListener('keydown', key, true);
    drawList(); drawForm();
    document.body.appendChild(back);
    form.label.focus();
  }

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
    S.provider = ICONS[ev.target.value] ? ev.target.value : 'generic'; // solo proveedores conocidos
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
      // Los iconos solo de grupo (AWS Cloud, Region, Subscription…) se eligen en el panel del grupo, no como componentes
      Object.entries(set.items)
        .filter(([, it]) => it.category !== 'Grupos')
        .filter(([k, it]) => !q || fold(`${it.label} ${k} ${it.category} ${I.category(it.category)}`).includes(q) || kwHit(it.keywords, q))
        .forEach(([k, it]) => { if (!groups.has(it.category)) groups.set(it.category, []); groups.get(it.category).push([k, it]); });
      // Con búsqueda, dentro de cada categoría primero las coincidencias por nombre y luego las de palabras clave
      if (q) for (const items of groups.values()) {
        const r = ([k, it]) => (k == null ? 0 : iconRank(fold(it.label), q.split(/\s+/)[0]));
        items.sort((a, b) => r(a) - r(b));
      }
      $('#palette-list').innerHTML = [...groups].map(([cat, items]) => `<div class="cat">${esc(I.category(cat))}</div><div class="chips">${items.map(([k, it]) => k == null
        ? chip(`data-type="${esc(it.type)}" data-label="${esc(it.label)}" data-sub="${esc(it.sub || '')}"${iconInfo(it.icon) ? ` data-icon="${esc(it.icon)}"` : ''}`, colorVar(it.color || (C.types[it.type] || C.types.generic).color), nodeIconHtml(it), it.label, !!iconInfo(it.icon))
        : chip(`data-type="${it.type}" data-icon="${esc(`${S.provider}/${k}`)}" data-label="${esc(it.label)}"`, colorVar((C.types[it.type] || C.types.generic).color), `<img src="${set.files[it.file]}" alt="">`, it.label, true)).join('')}</div>`).join('')
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
  const chipExtra = c => (c.dataset.icon ? { icon: c.dataset.icon, label: c.dataset.label, sub: c.dataset.sub || undefined }
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
    setModel(I.deep(EXAMPLES[+b.dataset.ex].diagram), { current: true, history: true, animate: true, fit: true });
    toast(T('toast.template', { name: loc(EXAMPLES[+b.dataset.ex].name) }));
    if (matchMedia('(max-width: 760px)').matches) $('#main').classList.remove('open');
  });

  /* ---------- pestañas agrupadas ---------- */
  // Fila 1: grupos (.tabg[data-g]); fila 2: solo las pestañas (.tab[data-group]) del grupo activo. Añadir una pestaña a un grupo = `data-group` en el botón.
  const TABG = $$('.tabg'), TABS = $$('.tab');
  TABG.forEach(g => { g.hidden = !TABS.some(t => t.dataset.group === g.dataset.g); g.setAttribute('role', 'tab'); });
  TABS.forEach(t => t.setAttribute('role', 'tab'));
  function syncTabs(t) {
    TABG.forEach(g => { const on = g.dataset.g === t.dataset.group; g.classList.toggle('on', on); g.setAttribute('aria-selected', on); g.tabIndex = on ? 0 : -1; });
    TABS.forEach(x => { const on = x === t; x.classList.toggle('on', on); x.hidden = x.dataset.group !== t.dataset.group; x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1; });
  }
  TABS.forEach(t => t.addEventListener('click', () => {
    syncTabs(t);
    $$('.pane').forEach(p => p.classList.toggle('on', p.dataset.pane === t.dataset.tab));
    store.set('tab', t.dataset.tab);
    const last = store.get('tabg', {}); last[t.dataset.group] = t.dataset.tab; store.set('tabg', last);
    if (t.dataset.tab === 'review') renderFindings();
    else if (t.dataset.tab === 'adr') renderAdr(true);
    else if (t.dataset.tab === 'req') renderReq(true);
    else if (t.dataset.tab === 'raid') renderRaid(true);
    else if (t.dataset.tab === 'data') renderDs(true);
    else if (t.dataset.tab === 'people') renderPeople(true);
  }));
  TABG.forEach(g => g.addEventListener('click', () => {
    const mine = TABS.filter(t => t.dataset.group === g.dataset.g), last = store.get('tabg', {})[g.dataset.g];
    (mine.find(t => t.dataset.tab === last) || mine[0])?.click();
  }));
  // Flechas / Inicio / Fin dentro de cada fila (activan al mover, como un tablist automático)
  [TABG, TABS].forEach(row => row.forEach(b => b.addEventListener('keydown', ev => {
    const vis = row.filter(x => !x.hidden), i = vis.indexOf(b), n = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: vis.length - 1 }[ev.key];
    if (n === undefined) return;
    ev.preventDefault(); const nb = vis[(n + vis.length) % vis.length]; nb.click(); nb.focus();
  })));

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
    layers: Object.fromEntries([...Object.keys(DL), ...Object.keys(DL_ALIAS)].map(k => [fold(k), cleanLayer(k)]).filter(([, v]) => v)),
    dispositions: Object.fromEntries(MG_BY),
    views: VIEW_KEYS,
    get stakeholders() { return (S.model?.stakeholders || []).map(x => x.id); },   // ids para validar las firmas (signoffs:) del texto
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
  }
  if (store.get('side', null)) setSide(store.get('side'), false);
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
  $('#btn-note').addEventListener('click', addNote);
  $('#btn-zone').addEventListener('click', addZone);
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
    setModel({ title: T('model.new') }, { current: true, history: true, fit: true });
    toast(T('toast.newCanvas'));
  });
  $('#btn-import').addEventListener('click', () => $('#file').click());
  $('#file').addEventListener('change', ev => { const fs = [...ev.target.files]; ev.target.value = ''; if (fs.length) importFiles(fs); });

  function toggleTheme() {
    S.theme = THEME_ORDER[(THEME_ORDER.indexOf(S.theme) + 1) % THEME_ORDER.length];
    store.set('theme', S.theme);
    applyTheme();
    const b = $('#btn-theme');
    b.classList.remove('spin'); void b.offsetWidth; b.classList.add('spin');
    toast(T('toast.' + S.theme));
    syncThemeTip();
  }
  // Tooltip del botón: indica el modo que viene a continuación
  function syncThemeTip() {
    const next = THEME_ORDER[(THEME_ORDER.indexOf(S.theme) + 1) % THEME_ORDER.length];
    const b = $('#btn-theme'), tip = T('top.theme.' + next);
    b.title = tip; b.setAttribute('aria-label', tip);
  }
  $('#btn-theme').addEventListener('click', toggleTheme);

  /* ---------- idioma (inglés por defecto, ver i18n.js) ---------- */
  // Vuelve a pintar todo lo que tiene texto de la interfaz. El contenido del diagrama no se traduce.
  function applyLang() {
    I.apply();
    syncThemeTip();
    $('#lang-code').textContent = I.lang.toUpperCase();
    [...paletteSel.options].forEach(o => { o.textContent = loc(C.palettes[o.value]?.label) || o.value; });
    [...fontSel.options].forEach(o => { o.textContent = loc(FONTS[o.value]?.label) || o.value; });
    textCtx = null;
    renderViewMenu();
    renderProviders();
    renderPalette();
    renderExamples();
    if (!S.model) return;
    renderInspector();
    renderVersions();
    applyCompare();
    updateMeta();
    renderFindings();
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

  const fontSel = $('#font');
  fontSel.innerHTML = Object.entries(FONTS).map(([k, f]) => `<option value="${k}">${esc(loc(f.label) || k)}</option>`).join('');
  fontSel.value = S.font;
  fontSel.addEventListener('change', () => {
    S.font = fontSel.value;
    store.set('font', S.font);
    applyTheme();
    render(false);
    renderInspector();
    refreshFont();
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
    $('#exp-levels-svg').hidden = $('#exp-levels-png').hidden = !hasLevels();
    $('#exp-contracts').hidden = !S.model.datasets?.length;   // solo si el diagrama declara conjuntos de datos
    const r = exportMenu.querySelector('summary').getBoundingClientRect(), pop = exportMenu.querySelector('.menu-pop');
    pop.style.top = `${r.bottom}px`;
    pop.style.right = `${Math.max(8, innerWidth - r.right)}px`;
  });
  document.addEventListener('pointerdown', ev => { if (exportMenu.open && !exportMenu.contains(ev.target)) exportMenu.open = false; });
  exportMenu.addEventListener('click', ev => {
    const b = ev.target.closest('[data-export]');
    if (!b) return;
    exportMenu.open = false;
    const f = { svg: exportSVG, png: exportPNG, 'svg-all': () => exportViews('svg'), 'png-all': () => exportViews('png'), 'svg-levels': () => exportLevels('svg'), 'png-levels': () => exportLevels('png'), json: exportJSON, copy: copyJSON, share: shareEncrypted, stride: exportThreats, compliance: openCompMatrix, report: openReportDialog, status: openStatusDialog, costs: () => openCosts('breakdown'), 'inventory-xlsx': () => exportInventory('xlsx'), 'inventory-csv': openInventoryDialog, contracts: exportContracts }[b.dataset.export];
    if (f) f(); else exportOther(b.dataset.export);
  });

  $('#zoom-in').addEventListener('click', () => animateView(zoomTarget(1.25), 220));
  $('#zoom-out').addEventListener('click', () => animateView(zoomTarget(1 / 1.25), 220));
  $('#zoomv').addEventListener('click', () => animateView(zoomTarget(1 / S.view.k), 260));

  /* ---------- exportar / importar ---------- */
  const fileName = (ext, suffix) => (fold(S.model.title).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'diagram') + (suffix ? '-' + suffix : '') + '.' + ext;
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
  // Ficha del documento (la usan el cajetín exportado y la franja del lienzo): { title, info: [[clave, valor]] }
  function docInfo() {
    const m = S.model, av = activeVersion(), v = vc(), cost = v.cost && m.nodes.some(hasCost) ? `≈ ${money(round2(monthlyTotal(m.nodes)))}${T('cost.mo')}` : '';
    const info = [[T('leg.author'), m.meta?.author || av?.author || '—'], [T('leg.version'), m.meta?.version || (av ? av.name || verLabel(av) : '—')],
      ...(S.viewKey !== 'full' ? [[T('leg.view'), viewLabel(S.viewKey)]] : []),
      ...(av ? [[T('leg.status'), T(`ver.st.${av.status}`)], ...(decided(av) ? [[decLabel(av), [av.decidedBy, fmtDay(av.decidedOn)].filter(Boolean).join(' · ')]] : []), [T('ver.created'), fmtDay(av.created)], [T('ver.updatedOn'), fmtDay(av.updated)]] : [[T('leg.date'), new Intl.DateTimeFormat(I.lang, { dateStyle: 'long' }).format(new Date())]]),
      ...(cost ? [[T('leg.cost'), cost]] : [])];
    return { title: S.scope ? `${m.title} · ${scopeNode()?.label || ''}` : m.title, info, av };
  }
  // Tipos de componente que usa el diagrama, con el color con que se ven (el propio del nodo o el del tipo).
  // Una fila por tipo+color: un mismo tipo con colores distintos se distingue en el lienzo y en la leyenda.
  const visNodes = () => S.model.nodes.filter(n => !VW.hideNodes.has(n.id));
  // Conexiones que se ven: las reales no ocultas o, en Contexto, las que cruzan cajas (agregadas)
  const visEdges = () => (vc().groups === 'collapse-top' ? [...VW.flows.values()].flatMap(f => f.edges) : S.model.edges.filter(e => !VW.hideEdges.has(e.id)));
  // Filas de leyenda propias de la vista activa, según sus reglas en config.js (emphasis, groups, legendGroups)
  function viewLegend() {
    const v = vc(), m = S.model, byId = new Map(m.nodes.map(n => [n.id, n])), es = visEdges(), r = { conn: [], groups: '', heat: null, owners: null };
    if (v.emphasis === 'security') {
      const cls = new Set(es.map(e => secClass(e, byId)));
      r.conn.push({ color: 'var(--sev-critical)', label: T('leg.sec.crit') });
      if ([...cls].some(c => c.includes('v-high'))) r.conn.push({ color: 'var(--sev-high)', label: T('leg.sec.high') });
      if ([...cls].some(c => c.includes('v-xb'))) r.conn.push({ color: 'var(--sev-critical)', label: T('leg.sec.xb') });
      if (es.some(e => crossBorder(e, byId)?.approved)) r.conn.push({ color: 'var(--muted)', label: T('leg.sec.xbok') });
      r.conn.push({ color: 'var(--sev-medium)', label: T('leg.sec.warn') }, { lock: true, label: T('leg.sec.enc') });
    } else if (v.emphasis === 'data') {
      const used = new Set([...visNodes(), ...es].flatMap(x => x.data || []));
      const colors = Object.keys(DATA).filter(k => used.has(k)).slice(-3).map(k => colorVar(DATA[k].color));
      r.conn.push({ color: colors.length ? colors : ['var(--accent)'], label: T('leg.dataflow') });
    } else if (v.emphasis === 'cost') {
      const vals = m.nodes.filter(hasCost).map(perMonth);
      if (vals.length) r.heat = { min: `${money(round2(Math.min(...vals)))}${T('cost.mo')}`, max: `${money(round2(Math.max(...vals)))}${T('cost.mo')}`, total: `≈ ${money(round2(monthlyTotal(m.nodes)))}${T('cost.mo')}`, stops: VR.costHeat };
      const teams = costBreakdown(m, 'team').filter(t => !t.unassigned).slice(0, 5);
      if (teams.length) r.costBy = teams.map(t => ({ label: t.label, value: `${money(round2(t.monthly))}${T('cost.mo')}` }));
    }
    else if (v.emphasis === 'resilience') {
      const vn = visNodes(), sp = new Set(spofList(m).map(x => x.id)), cnt = k => vn.filter(n => resTier(n)?.k === k).length;
      RES_TIERS.forEach(t => { if (cnt(t.k)) r.owners = [...(r.owners || []), { color: t.color, label: T(`res.leg.${t.k}`), n: cnt(t.k) }]; });
      r.ownersHead = T('res.leg.head');
      const unk = vn.filter(n => !resTier(n)).length, nsp = vn.filter(n => sp.has(n.id)).length;
      if (unk) r.owners = [...(r.owners || []), { color: 'var(--muted)', label: T('res.leg.none'), n: unk }];
      if (nsp) r.owners = [...(r.owners || []), { color: 'var(--sev-critical)', label: T('res.leg.spof'), n: nsp }];
    }
    else if (v.emphasis === 'owner') {
      const vis = new Set(visNodes().map(n => n.id));
      r.owners = [...govTeams(m, vis).values()].map(t => ({ color: t.color, label: [t.key, t.owners.join(', ')].filter(Boolean).join(' · '), n: t.ids.length }));
    }
    if (m.groups.length && (v.groups !== 'all' || v.legendGroups)) r.groups = T(v.groups === 'collapse-top' ? 'leg.g.collapse' : v.groups === 'logical' ? 'leg.g.logical' : 'leg.g.all');
    return r;
  }
  function legendTypes() {
    const seen = new Map();
    visNodes().forEach(n => {
      const type = C.types[n.type] ? n.type : 'generic', color = nodeColor({ ...n, type }), k = `${type}|${color}`;
      if (!seen.has(k)) seen.set(k, { type, color, label: typeLabel(type) });
    });
    const order = [...new Set([...seen.values()].map(r => r.type))];
    return [...seen.values()].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
  }
  // Solo lo que el diagrama usa: estilos de conexión, candados, tipos de componente y clasificaciones
  function buildLegend() {
    const m = S.model, g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'legend');
    const cols = [], RH = 22;
    const col = (head, rows, rh = RH) => rows.length && cols.push({ head, rows, rh });
    const textRow = (x, y, txt, cls = 'legend-text') => { const t = el('text', { class: cls, x, y: y + 4 }, g); t.textContent = txt; return textW(txt, '400 12px'); };
    // Solo lo que la vista activa muestra (reglas en config.js › views)
    const v = vc(), ex = viewLegend(), es = visEdges(), vn = visNodes();
    // Conexiones
    const styles = [...new Set(es.map(e => edgeKey(e.style)))], ES = edgeStyles();
    const lockRow = (on, label) => ({ w: 46 + textW(label, '400 12px'), draw: (x, y) => {
      const lg = el('g', { transform: `translate(${x + 10} ${y})` }, g);
      lockIcon(lg, 0, on);
      textRow(x + 46, y, label);
    } });
    const conn = styles.map(st => ({ w: 46 + textW(loc(ES[st].label), '400 12px'), draw: (x, y) => {
      const cfg = ES[st], eg = el('g', { class: `edge ${edgeCls(st)}${cfg.dash ? ' edge-dashed' : ''}`, style: `--c:var(--muted);--w:${cfg.width}px` }, g);
      el('path', { class: 'edge-line', d: `M${x},${y} L${x + 30},${y}`, ...(cfg.dash ? { 'stroke-dasharray': cfg.dash } : {}) }, eg);
      el('path', { class: 'edge-arrow', d: `M${x + 34},${y} L${x + 26},${y - 4} L${x + 26},${y + 4} Z` }, eg);
      textRow(x + 46, y, loc(cfg.label));
    } }));
    // Peso: una fila por cada nivel en uso (línea más gruesa, como se dibuja)
    ['high', 'critical'].filter(w => es.some(e => e.weight === w)).forEach(w => conn.push({ w: 46 + textW(T(`leg.w.${w}`), '400 12px'), draw: (x, y) => {
      const k = arrowK(EDGE_W[w]), eg = el('g', { class: `edge w-${w}`, style: `--c:var(--muted);--w:${+(1.8 * EDGE_W[w]).toFixed(2)}px` }, g);
      el('path', { class: 'edge-line', d: `M${x},${y} L${x + 28},${y}` }, eg);
      el('path', { class: 'edge-arrow', d: `M${x + 34},${y} L${x + 34 - 8 * k},${y - 4 * k} L${x + 34 - 8 * k},${y + 4 * k} Z` }, eg);
      textRow(x + 46, y, T(`leg.w.${w}`));
    } }));
    if (es.some(e => e.both)) conn.push({ w: 46 + textW(T('leg.both'), '400 12px'), draw: (x, y) => {
      const eg = el('g', { class: 'edge', style: '--c:var(--muted);--w:1.8px' }, g);
      el('path', { class: 'edge-line', d: `M${x + 4},${y} L${x + 30},${y}` }, eg);
      el('path', { class: 'edge-arrow', d: `M${x + 34},${y} L${x + 26},${y - 4} L${x + 26},${y + 4} Z M${x},${y} L${x + 8},${y - 4} L${x + 8},${y + 4} Z` }, eg);
      textRow(x + 46, y, T('leg.both'));
    } });
    // Filas propias de la vista (Seguridad: niveles de riesgo; Datos: color por clasificación); si no, candados genéricos
    ex.conn.forEach(r => conn.push(r.lock ? lockRow(true, r.label) : { w: 46 + textW(r.label, '400 12px'), draw: (x, y) => {
      const cs = [].concat(r.color), n = cs.length;
      cs.forEach((c, i) => {
        const eg = el('g', { class: 'edge', style: `--c:${c};--w:2.6px` }, g);
        el('path', { class: 'edge-line', d: `M${x + 30 * i / n},${y} L${x + 30 * (i + 1) / n},${y}` }, eg);
        if (i === n - 1) el('path', { class: 'edge-arrow', d: `M${x + 34},${y} L${x + 26},${y - 4} L${x + 26},${y + 4} Z` }, eg);
      });
      textRow(x + 46, y, r.label);
    } }));
    if (v.locks && v.emphasis !== 'security') [[true, 'leg.encrypted'], [false, 'leg.unencrypted']].forEach(([on, key]) => { if (es.some(e => e.encrypted === on)) conn.push(lockRow(on, T(key))); });
    col(T('leg.connections'), conn);
    // Componentes: una fila por tipo y color tal como se ven; en columnas de hasta 8 (más si son muchos)
    const MAXT = 40, all = legendTypes(), shown = all.length > MAXT ? all.slice(0, MAXT - 1) : all;
    const comp = shown.map(r => ({ w: 22 + textW(r.label, '400 12px'), draw: (x, y) => {
      el('circle', { cx: x + 6, cy: y, r: 6, style: `fill:${r.color}` }, g);
      textRow(x + 22, y, r.label);
    } }));
    if (all.length > shown.length) { const more = T('leg.more', all.length - shown.length); comp.push({ w: 22 + textW(more, '400 12px'), draw: (x, y) => textRow(x + 22, y, more, 'legend-muted') }); }
    const per = Math.max(8, Math.ceil(comp.length / 4));
    for (let i = 0; i < comp.length; i += per) col(i ? '' : T('leg.components'), comp.slice(i, i + per));
    // Grupos que se ven (Contexto, Lógica, Física)
    if (ex.groups) col(T('leg.groups'), [{ w: 30 + textW(ex.groups, '400 12px'), draw: (x, y) => {
      el('rect', { x, y: y - 6, width: 20, height: 14, rx: 3, style: 'fill:none;stroke:var(--muted);stroke-width:1.3', 'stroke-dasharray': '4 3' }, g);
      textRow(x + 30, y, ex.groups);
    } }]);
    // Equipos de la vista Gobierno: un punto de color por equipo, con sus dueños y cuántos componentes
    if (ex.owners?.length) {
      const own = ex.owners.map(r => { const txt = fitText(`${r.label} (${r.n})`, '400 12px', 300); return { w: 22 + textW(txt, '400 12px'), draw: (x, y) => {
        el('circle', { cx: x + 6, cy: y, r: 6, style: `fill:${r.color}` }, g);
        textRow(x + 22, y, txt);
      } }; });
      for (let i = 0; i < own.length; i += 8) col(i ? '' : ex.ownersHead || T('leg.teams'), own.slice(i, i + 8));
    }
    // Escala de calor de la vista Costo
    if (ex.heat) {
      const hc = ex.heat, n = hc.stops.length, tot = `${T('leg.total')}: ${hc.total}`, BW = 104;
      const gr = el('linearGradient', { id: 'leg-heat', x1: 0, y1: 0, x2: 1, y2: 0 }, el('defs', null, g));
      hc.stops.forEach((c, i) => el('stop', { offset: `${n > 1 ? i / (n - 1) * 100 : 0}%`, style: `stop-color:${c}` }, gr));
      col(T('leg.heat'), [{ w: textW(hc.min, '400 12px') + textW(hc.max, '400 12px') + BW + 16, draw: (x, y) => {
        const lw = textW(hc.min, '400 12px');
        textRow(x, y, hc.min);
        el('rect', { x: x + lw + 8, y: y - 5, width: BW, height: 10, rx: 5, fill: 'url(#leg-heat)' }, g);
        textRow(x + lw + BW + 16, y, hc.max);
      } }, { w: textW(tot, '400 12px'), draw: (x, y) => textRow(x, y, tot) }]);
    }
    // Costo por equipo (vista Costo): los 5 equipos que más cuestan
    if (ex.costBy?.length) col(T('cst.leg.byTeam'), ex.costBy.map(r => { const txt = fitText(`${r.label} · ${r.value}`, '400 12px', 300); return { w: textW(txt, '400 12px'), draw: (x, y) => textRow(x, y, txt) }; }));
    // Datos
    const used = new Set([...vn, ...es].flatMap(x => x.data || []));
    if (v.dataTags) col(T('leg.data'), dataTags({ data: [...used] }).map(t => ({ w: Math.ceil(textW(t.short, FONT.dtag)) + 20 + textW(t.label, '400 12px'), draw: (x, y) => {
      const tw = dataTag(g, x, y - 8, t, 16);
      textRow(x + tw + 8, y, t.label);
    } })));
    // Capas del data lake en uso, en el orden de config.js
    if (v.layers) col(T('leg.layers'), layerUsage(vn).map(([k]) => {
      const li = layerInfo(k);
      return { w: 22 + textW(li.label, '400 12px'), draw: (x, y) => {
        el('rect', { x, y: y - 7, width: 6, height: 14, rx: 2, style: `fill:${li.color}` }, g);
        textRow(x + 16, y, li.label);
      } };
    }));
    // Zonas de riesgo, de la más grave a la más leve
    const zs = m.zones.filter(z => z.kind !== 'trust').sort((a, b) => SEVERITY.indexOf(b.severity) - SEVERITY.indexOf(a.severity)).slice(0, 8);
    if (v.zones) col(T('leg.zones'), zs.map(z => {
      const txt = fitText(`${sevLabel(z.severity)}${z.label ? ` · ${z.label}` : ''}`, '400 12px', 260);
      return { w: 30 + textW(txt, '400 12px'), draw: (x, y) => {
        const zg = el('g', { class: `zone zone-${z.severity}` }, g);
        el('rect', { class: 'zone-tint', x, y: y - 6, width: 20, height: 14, rx: 3 }, zg);
        el('rect', { class: 'zone-hatch', x, y: y - 6, width: 20, height: 14, rx: 3, fill: `url(#hatch-${z.severity})` }, zg);
        el('rect', { class: 'zone-line', x, y: y - 6, width: 20, height: 14, rx: 3, 'stroke-dasharray': '4 3' }, zg);
        textRow(x + 30, y, txt);
      } };
    }));
    // Fronteras de confianza (STRIDE), aparte de las zonas de riesgo
    if (v.zones) col(T('leg.trust'), m.zones.filter(z => z.kind === 'trust').slice(0, 8).map(z => {
      const txt = fitText([z.label, z.trust].filter(Boolean).join(' · ') || T('trust.unnamed'), '400 12px', 260);
      return { w: 30 + textW(txt, '400 12px'), draw: (x, y) => {
        const zg = el('g', { class: 'zone zone-trust' }, g);
        el('rect', { class: 'zone-tint', x, y: y - 6, width: 20, height: 14, rx: 3 }, zg);
        el('rect', { class: 'zone-line', x, y: y - 6, width: 20, height: 14, rx: 3, 'stroke-dasharray': '6 3' }, zg);
        textRow(x + 30, y, txt);
      } };
    }));
    // Observaciones de revisión abiertas, con su fecha compromiso
    const findings = (v.review ? vn : []).filter(n => n.review && n.review.status !== 'resolved')
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
    const doc = docInfo(), info = doc.info.map(([k, v]) => [k, fitText(v, '400 12px', 380)]), title = fitText(doc.title, '700 14px', 420);
    const keyW = Math.max(...info.map(([k]) => textW(k, '400 11.5px'))) + 14;
    const infoW = Math.max(220, textW(title, '700 14px'), keyW + Math.max(...info.map(([, v]) => textW(v, '400 12px')))) + 4;
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
    return { g, h, colsW: x - GAP + P, infoW, info, keyW, P, title };
  }
  function placeLegend(lg, W) {
    const { g, h, infoW, info, keyW, P, title } = lg, ix = W - P - infoW;
    const panel = el('rect', { class: 'legend-panel', x: 0, y: 0, width: W, height: h, rx: 14 });
    g.insertBefore(panel, g.firstChild);
    el('line', { x1: ix - 18, y1: P - 4, x2: ix - 18, y2: h - P + 4, style: 'stroke:var(--border)' }, g);
    el('text', { class: 'legend-head', x: ix, y: P + 9 }, g).textContent = T('leg.document');
    el('text', { class: 'legend-title', x: ix, y: P + 32 }, g).textContent = title;
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
    out.setAttribute('data-theme', S.theme);
    out.removeAttribute('id');
    out.removeAttribute('style');
    out.setAttribute('xmlns', NS);
    out.setAttribute('width', W);
    out.setAttribute('height', Ht);
    out.setAttribute('viewBox', `0 0 ${W} ${Ht}`);
    out.classList.remove('focusing', 'hovering', 'playing', 'dragging', 'panning', 'connecting', 'filtering');
    out.querySelectorAll('.particle, .edge-hit, .node-halo, .guide, .marquee, .path-badge, .resize-handle, .zone-top-line, .node-cmt').forEach(n => n.remove());
    out.querySelectorAll('.lit, .sel, .pulse, .pulse-node, .enter, .connect-src, .fdim').forEach(n => n.classList.remove('lit', 'sel', 'pulse', 'pulse-node', 'enter', 'connect-src', 'fdim'));
    const vp = out.querySelector('#viewport');
    vp.removeAttribute('id');
    vp.classList.remove('xs-enter');
    vp.setAttribute('transform', `translate(${pad - b.x} ${pad + top - b.y})`);
    const t = C.themes[S.theme], p = C.palettes[S.palette];
    const vars = [...Object.entries(t).map(([k, v]) => `--${k}:${v}`), ...Object.entries(p[S.theme] || p.dark).map(([k, v]) => `--p-${k}:${v}`), `--font:${fontCss()}`].join(';');
    const style = document.createElementNS(NS, 'style');
    style.textContent = `svg{${vars}}\n${$('#diagram-css').textContent}`;
    out.insertBefore(style, out.firstChild);
    out.insertBefore(el('rect', { width: W, height: Ht, fill: t.bg }), style.nextSibling);
    const title = el('text', { x: pad, y: pad + 10, fill: t.text, 'font-size': 20, 'font-weight': 700, 'font-family': fontCss() });
    const av = activeVersion();
    title.textContent = (av ? `${S.model.title}  ·  ${verLabel(av)}` : S.model.title) + (S.scope ? `  ·  ${scopeNode()?.label || ''}` : '') + (S.viewKey !== 'full' ? `  ·  ${T('view.export', { name: viewLabel(S.viewKey) })}` : '');
    out.insertBefore(title, vp);
    if (lg) {
      placeLegend(lg, W - pad * 2);
      lg.g.setAttribute('transform', `translate(${pad} ${Ht - pad - lg.h})`);
      out.appendChild(lg.g);
    }
    // Incrusta solo las caras de la tipografía elegida que cubren el texto usado: el archivo se ve igual en cualquier lado
    style.textContent += '\n' + fontFaces(S.font, out.textContent);
    return { str: '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(out), W, H: Ht, ox: pad - b.x, oy: pad + top - b.y };   // ox, oy: desplazamiento del lienzo al SVG (las zonas pulsables del visor compartido)
  }
  function exportSVG() { download(buildSVG().str, fileName('svg'), 'image/svg+xml'); toast(T('toast.svg')); }
  // PNG a 2x desde el SVG: promesa con el Blob (null si el navegador no pudo rasterizarlo)
  const pngBlob = ({ str, W, H: h }) => new Promise(res => {
    const img = new Image(), scale = 2;
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = W * scale; c.height = h * scale;
      const ctx = c.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, W, h);
      try { c.toBlob(b => res(b), 'image/png'); } catch { res(null); }
    };
    img.onerror = () => res(null);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str);
  });
  function exportPNG() {
    pngBlob(buildSVG()).then(blob => { if (blob) { download(blob, fileName('png')); toast(T('toast.png')); } else toast(T('toast.pngFail')); });
  }

  /* ---------- varias vistas a la vez (exportar, presentar, compartir) ---------- */
  // ¿Aporta algo esta vista con este diagrama? Una vista de énfasis sin nada que resaltar sale igual que la Completa.
  const viewWorth = key => {
    const m = S.model, em = VIEWS[key]?.emphasis;
    if (key === 'context') return m.groups.length > 0;
    if (em === 'cost') return m.nodes.some(hasCost);
    if (em === 'owner') return m.nodes.some(n => govKey(n));
    if (em === 'resilience') return m.nodes.some(hasRes) || spofList(m).length > 0;
    if (em === 'security') return m.nodes.some(n => n.data?.length) || m.edges.some(e => e.data?.length || e.encrypted != null);
    if (em === 'data') return m.nodes.some(n => n.data?.length || VR.dataTypes.includes(n.type) || VR.dataIconCategories.includes(iconInfo(n.icon)?.category)) || m.edges.some(e => e.style === 'data' || e.data?.length);
    return true;
  };
  const worthViews = () => VIEW_KEYS.filter(viewWorth);
  const skippedLabel = keys => VIEW_KEYS.filter(k => !keys.includes(k)).map(viewLabel).join(', ');
  // Ejecuta fn(clave, i) con cada vista activa SIN guardar la elección ni tocar el modelo; al final restaura vista, selección y conexión elegida
  let viewBusy = false;
  async function eachView(keys, fn) {
    // Siempre con setView (recalcula VW.* y la leyenda); luego se deshace lo que setView recuerda (elección guardada y "elegida")
    const saved = { key: S.viewKey, sel: S.sel, flow: S.flow, chosen: S.viewChosen, stored: store.get('view') };
    viewBusy = true;
    stopPlay(); clearPath();
    try {
      for (let i = 0; i < keys.length; i++) {
        setView(keys[i], { toast: false });
        await fn(keys[i], i);
      }
    } finally {
      viewBusy = false;
      setView(saved.key, { toast: false });
      S.flow = saved.flow; S.viewChosen = saved.chosen;
      if (saved.stored == null) { try { localStorage.removeItem(`${C.app.storageKey}.view`); } catch { /* sin almacenamiento */ } } else store.set('view', saved.stored);
      select(saved.sel);
    }
  }
  // Un archivo por vista (<título>-<clave>.png|svg), uno tras otro: cada PNG termina antes de empezar el siguiente.
  // La clave (full, context…) va en el nombre y no el rótulo traducido: es estable en cualquier idioma y no lleva tildes.
  async function exportViews(format = 'png') {
    format = format === 'svg' ? 'svg' : 'png';
    if (viewBusy || P || !S.model.nodes.length) return false;
    const keys = worthViews(), skipped = skippedLabel(keys);
    let done = 0;
    try {
      await eachView(keys, async (key, i) => {
        toast(T('views.progress', { i: i + 1, n: keys.length, name: viewLabel(key) }), 60000);
        const out = buildSVG();
        if (format === 'svg') download(out.str, fileName('svg', key), 'image/svg+xml');
        else {
          const blob = await pngBlob(out);
          if (!blob) throw new Error('png');
          download(blob, fileName('png', key));
        }
        done++;
        await new Promise(r => setTimeout(r, 350));  // respiro entre descargas (el navegador puede pedir permiso para varias)
      });
    } catch { toast(T('toast.pngFail'), 3200); return done; }
    toast(T('views.done', done) + (skipped ? ' · ' + T('views.skipped', { names: skipped }) : ''), 4800);
    return done;
  }
  /* ---------- compartir cifrado: un HTML que se abre solo, con contraseña ---------- */
  // El diagrama se guarda como imagen en los dos temas: el visor no necesita la app
  const svgBuild = theme => { const old = S.theme; S.theme = theme; try { return buildSVG(); } finally { S.theme = old; } };
  const svgFor = theme => svgBuild(theme).str;
  // Zonas pulsables del visor compartido (una conexión recta mide cero en un eje): la caja de cada grupo, conexión (cuadro en su punto medio) y componente visible en la vista, en las coordenadas del SVG; los componentes van los últimos, encima
  function shareTargets(ox, oy) {
    const vis = x => { const r = x?.getBoundingClientRect?.(); return !!r && (r.width > 0 || r.height > 0); }, rd = Math.round, out = [], m = S.model;
    m.groups.forEach(g => { const r = R.groups.get(g.id), b = R.gbox.get(g.id); if (b && vis(r?.box)) out.push({ k: 'group', id: g.id, label: g.label, box: [rd(b.x + ox), rd(b.y + oy), rd(b.w), rd(b.h)] }); });
    m.edges.forEach(e => {
      const line = R.edges.get(e.id)?.line;
      if (!vis(line)) return;
      let len = 0; try { len = line.getTotalLength(); } catch { len = 0; }
      if (!len) return;
      const p = line.getPointAtLength(len / 2);
      out.push({ k: 'edge', id: e.id, label: cmTargetText(m, { kind: 'edge', id: e.id }), box: [rd(p.x + ox - 14), rd(p.y + oy - 14), 28, 28] });
    });
    m.nodes.forEach(n => { if (vis(R.nodes.get(n.id))) out.push({ k: 'node', id: n.id, label: n.label, box: [rd(n.x + ox), rd(n.y + oy), rd(R.width.get(n.id) || 0), H] }); });
    return out;
  }
  // Lo que viaja en el archivo compartido: hilos sin resolver y no internos (lo interno nunca sale del documento) y los destinos sin forma (decisiones, requisitos y versiones)
  const shareThreads = () => (S.model.comments || []).filter(c => !c.internal && c.status !== 'resolved').map(c => ({ id: c.id, on: c.on, ...(c.author ? { author: c.author } : {}), ...(c.date ? { date: c.date } : {}), text: c.text, ...(c.source ? { source: c.source } : {}), ...(c.replies ? { replies: c.replies } : {}) }));
  const shareRefs = () => ['decision', 'requirement', 'version'].flatMap(k => ({ decision: S.model.decisions, requirement: S.model.requirements, version: S.model.versions }[k] || []).map(x => ({ k, id: x.id, label: cmTargetText(S.model, { kind: k, id: x.id }) })));
  function shareEncrypted() {
    const SH = window.DiagramonShare;
    if (!SH || !window.crypto?.subtle || typeof CompressionStream === 'undefined') return toast(T('share.unsupported'), 3200);
    if (viewBusy || P) return;
    const prev = document.activeElement, id = `sh${Date.now()}`;
    // Solo se ofrecen las vistas que aportan algo; por defecto Completa, Contexto y Seguridad
    const offered = worthViews(), preset = ['full', 'context', 'security'].filter(k => offered.includes(k));
    // Cada vista va en dos temas (el activo y su contrario claro/oscuro): el negro solo si es el activo
    const shTheme = () => [S.theme, S.theme === 'light' ? 'dark' : 'light'];
    const back = document.createElement('div');
    back.className = 'cf-back';
    back.innerHTML = `<form class="cf share" role="dialog" aria-modal="true" aria-labelledby="${id}t" aria-describedby="${id}d" autocomplete="off">
      <h3 id="${id}t">${esc(T('share.title'))}</h3>
      <p id="${id}d">${esc(T('share.lead'))}</p>
      <fieldset class="sh-views"><legend>${esc(T('share.views'))}</legend>${offered.map(k => `<label class="sh-chk"><input type="checkbox" name="views" value="${esc(k)}"${preset.includes(k) ? ' checked' : ''}>${esc(viewLabel(k))}</label>`).join('')}<small class="sh-size"></small></fieldset>
      <fieldset class="sh-cm"><label class="sh-chk"><input type="checkbox" name="cm" checked>${esc(T('share.cm'))}</label><small class="dbt-d">${esc(T('share.cm.hint'))}</small>
        <label class="sh-chk"><input type="checkbox" name="cmopen">${esc(T('share.cmopen'))}</label><small class="dbt-d">${esc(T('share.cmopen.hint'))}</small></fieldset>
      <label>${esc(T('share.pw'))}<span class="sh-row"><input type="password" name="pw" autocomplete="new-password" minlength="12" required><button type="button" class="btn small" data-sh="show">${esc(T('share.show'))}</button></span></label>
      <div class="sh-meter" data-level="-1"><i></i><i></i><i></i><i></i><span></span></div>
      <label>${esc(T('share.pw2'))}<input type="password" name="pw2" autocomplete="new-password" required></label>
      <ul class="sh-notes"><li>${esc(T('share.note1'))}</li><li>${esc(T('share.note2'))}</li></ul>
      <p class="sh-err" role="alert"></p>
      <div class="cf-actions"><button type="button" class="btn" data-sh="no">${esc(T('ver.cf.cancel'))}</button><button type="submit" class="btn primary">${esc(T('share.create'))}</button></div>
    </form>`;
    const form = back.querySelector('form'), pw = form.elements.pw, pw2 = form.elements.pw2, meter = form.querySelector('.sh-meter'), err = form.querySelector('.sh-err');
    const close = () => { document.removeEventListener('keydown', key, true); back.remove(); prev?.focus?.(); };
    const key = ev => { if (ev.key === 'Escape' && !form.classList.contains('busy')) { ev.preventDefault(); ev.stopPropagation(); close(); } };
    const rate = () => {
      const s = SH.strength(pw.value), lvl = pw.value ? s.level : -1;
      meter.dataset.level = lvl;
      meter.querySelector('span').textContent = pw.value ? T(`share.lvl${lvl}`) + (pw.value.length < 12 ? ` · ${T('share.min')}` : '') : '';
      err.textContent = '';
    };
    // Tamaño aproximado: el SVG de la vista actual comprimido, por vistas elegidas × 2 temas, +33 % de base64 (los temas no se deduplican: la ventana de gzip es de 32 KB)
    const sizeEl = form.querySelector('.sh-size');
    let unit = 0;
    const estimate = () => {
      const n = form.querySelectorAll('input[name="views"]:checked').length;
      sizeEl.textContent = unit && n ? T('share.size', { kb: Math.max(1, Math.round(unit * n * 2 * 1.34 / 1024)) }) : '';
    };
    form.addEventListener('change', ev => { if (ev.target.name === 'views') { err.textContent = ''; estimate(); } });
    new Response(new Blob([buildSVG().str]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer().then(b => { unit = b.byteLength; estimate(); }, () => {});
    pw.addEventListener('input', rate);
    pw2.addEventListener('input', () => { err.textContent = ''; });
    back.addEventListener('mousedown', ev => { if (ev.target === back && !form.classList.contains('busy')) close(); });
    form.addEventListener('click', ev => {
      const b = ev.target.closest('[data-sh]');
      if (!b) return;
      if (b.dataset.sh === 'no') close();
      else { const show = pw.type === 'password'; pw.type = pw2.type = show ? 'text' : 'password'; b.textContent = T(show ? 'share.hide' : 'share.show'); }
    });
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      if (form.classList.contains('busy')) return;
      const keys = [...form.querySelectorAll('input[name="views"]:checked')].map(i => i.value);
      if (!keys.length) { err.textContent = T('share.noViews'); return; }
      if (pw.value.length < 12) { err.textContent = T('share.min'); return pw.focus(); }
      if (SH.strength(pw.value).level < 1) { err.textContent = T('share.weak'); return pw.focus(); }
      if (pw.value !== pw2.value) { err.textContent = T('share.mismatch'); return pw2.focus(); }
      form.classList.add('busy');
      form.querySelector('[type="submit"]').textContent = T('share.busy');
      try {
        const av = activeVersion();
        const views = [];
        const cm = form.elements.cm.checked;
        await eachView(keys, key => {
          const built = shTheme().map(th => [th, svgBuild(th)]);
          views.push({ key, label: viewLabel(key), svg: Object.fromEntries(built.map(([th, b]) => [th, b.str])), ...(cm ? { targets: shareTargets(built[0][1].ox, built[0][1].oy) } : {}) });
        });
        const payload = { fmt: cm ? 3 : 2, title: S.model.title, version: av ? verLabel(av) : S.model.meta?.version || '', sharedAt: new Date().toISOString(), theme: S.theme, view: keys.includes(S.viewKey) ? S.viewKey : keys[0], views,
          ...(cm ? { cmt: true, shareId: Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join(''), refs: shareRefs(), comments: form.elements.cmopen.checked ? shareThreads() : [] } : {}) };
        const env = await SH.encrypt(payload, pw.value);
        download(SH.viewer(env, I.lang), `diagramon-${today()}.html`, 'text/html');
        close();
        toast(T('share.done'), 4200);
      } catch {
        form.classList.remove('busy');
        form.querySelector('[type="submit"]').textContent = T('share.create');
        err.textContent = T('share.fail');
      }
    });
    document.addEventListener('keydown', key, true);
    document.body.appendChild(back);
    pw.focus();
  }
  /* ---------- informe de arquitectura (PDF por impresión, Markdown, HTML) ---------- */
  // reportData() arma un modelo plano (secciones de bloques) y dos dibujantes lo pintan: reportMarkdown y reportHTML, así que los dos formatos no se desincronizan.
  // Bloques: { k: 'h3', t } · { k: 'p', t, muted? } · { k: 'kv', items: [[k, v]] } · { k: 'cards', items: [{ label, value, tone? }] }
  //          { k: 'table', head: [], rows: [[celda]], cls? } (celda = texto | { t, tone }) · { k: 'text', label, t } · { k: 'ul', items } · { k: 'img', alt, caption, svg?, uri?, file? }
  const REP_SECS = ['summary', 'diagram', 'components', 'connections', 'data', 'owners', 'layers', 'datasets', 'costs', 'resilience', 'findings', 'compliance', 'threats', 'decisions', 'requirements', 'raid', 'approvals', 'phases', 'estimation', 'migration', 'radar', 'drift', 'versions', 'notes', 'comments'];
  const REP_PAGE = ['diagram', 'components', 'findings', 'decisions']; // secciones que empiezan página al imprimir
  const repT = (k, v) => T(`rep.${k}`, v);
  const repSleep = ms => new Promise(r => setTimeout(r, ms));
  // base64 de un texto UTF-8 y de un Blob (por trozos, para no reventar la pila con SVG grandes)
  const repB64 = s => { const b = new TextEncoder().encode(s); let o = ''; for (let i = 0; i < b.length; i += 0x8000) o += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(o); };
  const repBlobUri = async blob => { const b = new Uint8Array(await blob.arrayBuffer()); let o = ''; for (let i = 0; i < b.length; i += 0x8000) o += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return `data:${blob.type || 'image/png'};base64,${btoa(o)}`; };
  // Nodos con interior (C4): solo si el modelo y la app lo soportan
  const repScopes = (m = S.model) => {
    if (typeof scopePath !== 'function' || typeof setScope !== 'function') return [];
    const ids = new Set([...m.nodes, ...m.groups, ...(m.notes || []), ...(m.zones || [])].map(x => x.in).filter(Boolean));
    return m.nodes.filter(n => ids.has(n.id)).map(n => n.id);
  };
  const repScopeName = id => (id == null ? '' : (typeof scopePath === 'function' ? scopePath(id) : [id]).map(i => S.model.nodes.find(n => n.id === i)?.label || i).join(' › '));
  // Qué secciones tienen datos (las demás se saltan y el diálogo las muestra «(ninguno)»)
  function repAvail(m = S.model) {
    return {
      summary: true, diagram: m.nodes.length > 0, components: m.nodes.length > 0, connections: m.edges.length > 0,
      data: m.nodes.some(n => dataClassesOf(n, m).length || regionOf(n, m).value), owners: govTeamList(m).length > 0,
      layers: m.nodes.some(n => layerOf(n).value), migration: m.nodes.some(n => n.disposition), radar: m.nodes.some(n => radarOf(n, m)), costs: m.nodes.some(hasCost), resilience: m.nodes.some(hasRes) || spofList(m).length > 0, findings: findingsOf(m).length > 0,
      compliance: cmpModel(m).keys.length > 0, threats: strideAll(m).length > 0, decisions: !!m.decisions?.length, requirements: !!m.requirements?.length,
      raid: !!m.raid?.length, approvals: !!m.stakeholders?.length, phases: !!m.phases?.length, estimation: !!phaseEffort(m, effortHelpers), datasets: !!m.datasets?.length,
      versions: m.versions.length > 0, notes: (m.notes || []).length > 0 || (m.zones || []).some(z => z.kind !== 'trust'), comments: (m.comments || []).some(c => !c.internal && c.status !== 'resolved'), drift: !!m.deviations?.length
    };
  }
  const repDefaultViews = () => {
    const ok = k => VIEWS[k] && viewWorth(k);
    const l = [S.viewKey, ...['security', 'data'].filter(ok)].filter((k, i, a) => VIEWS[k] && a.indexOf(k) === i);
    return l.length ? l : ['full'];
  };

  async function reportData(o) {
    const m = S.model, av = repAvail(m), want = k => av[k] && (!o.sections || o.sections.includes(k));
    const byId = new Map(m.nodes.map(n => [n.id, n])), nm = id => byId.get(id)?.label || id;
    const edgeName = e => `${nm(e.from)} ${e.both ? '↔' : '→'} ${nm(e.to)}`;
    const gpath = x => { const out = []; let g = 'type' in x ? x.group : x.parent, i = 0; while (g && i++ < 50) { const gg = groupById(g); if (!gg) break; out.unshift(gg.label); g = gg.parent; } return out.join(' › '); };
    const dShort = ks => (ks || []).map(k => loc(DATA[k]?.short) || String(k).toUpperCase()).join(' ');
    const dLabel = k => loc(DATA[k]?.label) || String(k);
    const sevCell = s => ({ t: sevLabel(s), tone: `sev-${s}` });
    const yn = v => T(v ? 'sec.yes' : 'sec.no');
    const hasScopes = typeof scopePath === 'function' && m.nodes.some(n => n.in);
    const av0 = activeVersion(), find = findingsOf(m), open = find.filter(f => !f.dismissed), dis = find.filter(f => f.dismissed);
    const D = { lang: I.lang, title: m.title, author: m.meta?.author || av0?.author || '', version: m.meta?.version || '', active: av0 ? { label: verLabel(av0), status: T(`ver.st.${av0.status}`) } : null,
      date: fmtDay(today()), desc: m.meta?.desc ? String(m.meta.desc) : '', sections: [], files: [] };
    const sec = (id, blocks) => D.sections.push({ id, title: repT(`s.${id}`), blocks });

    /* diagrama: una imagen por vista (y por interior C4); es lo único lento, así que se cede el hilo entre imágenes */
    const imgs = [];
    if (want('diagram')) {
      const keys = (o.views || []).filter(k => VIEWS[k]), scopes = [null, ...(o.scopes ? repScopes(m) : [])], total = keys.length * scopes.length, theme = o.theme === 'current' ? S.theme : 'light';
      const oldScope = typeof S.scope !== 'undefined' ? S.scope : null, oldTheme = S.theme;
      let n = 0;
      try {
        for (const sc of scopes) {
          if (scopes.length > 1) setScope(sc);
          await eachView(keys, async key => {
            o.progress?.(++n, total, [repScopeName(sc), viewLabel(key)].filter(Boolean).join(' · '));
            let out;
            S.theme = theme; try { out = buildSVG(); } finally { S.theme = oldTheme; }
            const im = { key, label: viewLabel(key), scope: sc, scopeLabel: repScopeName(sc), svg: out.str };
            if (o.format === 'md') {
              const blob = await pngBlob(out);
              if (!blob) im.uri = 'data:image/svg+xml;base64,' + repB64(out.str);
              else if (o.separateImages) { im.file = fileName('png', `report-${String(n).padStart(2, '0')}-${key}`); D.files.push({ name: im.file, blob }); } else im.uri = await repBlobUri(blob);
            } else im.uri = 'data:image/svg+xml;base64,' + repB64(out.str);
            imgs.push(im);
            await repSleep(0);
          });
        }
      } finally { if (scopes.length > 1) setScope(oldScope ?? null); }
    }

    /* fases: una imagen de la arquitectura en cada fase (futuro oculto, sin fantasmas); se restaura la fase y los fantasmas aunque falle */
    const phImgs = [];
    if (want('phases')) {
      const theme = o.theme === 'current' ? S.theme : 'light', oldTheme = S.theme, np = m.phases.length, base = (o.progressBase || 0);
      const old = { phase: S.phase, ghosts: S.phaseGhosts };
      try {
        await eachView([S.viewKey], async () => {
          try {
            for (let i = 0; i < np; i++) {
              o.progress?.(base + i + 1, base + np, `${repT('s.phases')} · ${m.phases[i].name}`);
              S.phase = i; S.phaseGhosts = false; refreshView();
              let out;
              S.theme = theme; try { out = buildSVG(); } finally { S.theme = oldTheme; }
              const im = { i, svg: out.str };
              if (o.format === 'md') {
                const blob = await pngBlob(out);
                if (!blob) im.uri = 'data:image/svg+xml;base64,' + repB64(out.str);
                else if (o.separateImages) { im.file = fileName('png', `report-phase-${String(i + 1).padStart(2, '0')}-${m.phases[i].id}`); D.files.push({ name: im.file, blob }); } else im.uri = await repBlobUri(blob);
              } else im.uri = 'data:image/svg+xml;base64,' + repB64(out.str);
              phImgs.push(im);
              await repSleep(0);
            }
          } finally { S.phase = old.phase; S.phaseGhosts = old.ghosts; refreshView(); renderPhaseBar(); }
        });
      } catch (e) { if (!phImgs.length) throw e; }
    }

    /* resumen */
    if (want('summary')) {
      const mt = monthlyTotal(m.nodes), cards = [{ label: repT('k.components'), value: m.nodes.length }, { label: repT('k.connections'), value: m.edges.length }, { label: repT('k.groups'), value: m.groups.length },
        { label: repT('k.views'), value: VIEW_KEYS.length }];
      if (m.nodes.some(hasCost)) cards.push({ label: repT('k.cost'), value: money(round2(mt)) });
      cards.push({ label: repT('k.findings'), value: open.length, tone: open.some(f => f.severity === 'critical' || f.severity === 'high') ? 'sev-high' : '' });
      if (m.decisions?.length) cards.push({ label: repT('k.decisions'), value: m.decisions.length });
      if (m.requirements?.length) cards.push({ label: repT('k.requirements'), value: m.requirements.length });
      if (m.stakeholders?.length) cards.push({ label: repT('k.approvals'), value: m.stakeholders.length });
      if (m.phases?.length) cards.push({ label: repT('k.phases'), value: m.phases.length });
      const kv = [[repT('author'), D.author], [repT('version'), D.version], [repT('active'), D.active ? `${D.active.label} · ${D.active.status}` : ''], [repT('date'), D.date]].filter(r => r[1]);
      const blocks = [];
      if (D.desc) blocks.push({ k: 'p', t: D.desc });
      if (kv.length) blocks.push({ k: 'kv', items: kv });
      blocks.push({ k: 'cards', items: cards });
      if (find.length) {
        blocks.push({ k: 'h3', t: repT('sum.findings') });
        blocks.push({ k: 'table', cls: 'compact', head: [...SEVERITY.slice().reverse().map(sevLabel), repT('dismissed')], rows: [[...SEVERITY.slice().reverse().map(s => String(open.filter(f => f.severity === s).length)), String(dis.length)]] });
      }
      if (m.decisions?.length) {
        const st = [...new Set(m.decisions.map(d => d.status))];
        blocks.push({ k: 'h3', t: repT('sum.decisions') });
        blocks.push({ k: 'table', cls: 'compact', head: st.map(s => repT(`adr.${s}`)), rows: [st.map(s => String(m.decisions.filter(d => d.status === s).length))] });
      }
      sec('summary', blocks);
    }

    if (want('diagram')) {
      const blocks = [];
      imgs.forEach(im => {
        blocks.push({ k: 'h3', t: [im.scopeLabel, im.label].filter(Boolean).join(' · ') });
        blocks.push({ k: 'img', alt: `${m.title} — ${[im.scopeLabel, im.label].filter(Boolean).join(' · ')}`, svg: im.svg, uri: im.uri, file: im.file });
      });
      if (!blocks.length) blocks.push({ k: 'p', t: repT('noViews'), muted: true });
      sec('diagram', blocks);
    }

    if (want('components')) {
      const head = [repT('h.component'), repT('h.type'), repT('h.group'), ...(hasScopes ? [repT('h.scope')] : []), repT('h.data'), repT('h.region'), repT('h.owner'), repT('h.layer'), repT('h.cost'), repT('h.review')];
      const rows = m.nodes.map(n => {
        const ic = iconInfo(n.icon), rv = n.review ? { t: T(`rev.tag.${reviewState(n.review)}`), tone: `rev-${reviewState(n.review)}` } : '';
        const gov = [govOf(n, 'team').value, govOf(n, 'owner').value].filter(Boolean).join(' · '), ly = layerOf(n).value;
        return [[n.label, n.sub].filter(Boolean).join('\n'), ic ? `${ic.providerLabel} · ${ic.label}` : typeLabel(n.type), gpath(n), ...(hasScopes ? [n.in ? repScopeName(n.in) : ''] : []),
          dShort(dataClassesOf(n, m)), regionOf(n, m).value, gov, ly ? layerInfo(ly).label : '', hasCost(n) ? money(round2(perMonth(n))) : '', rv];
      });
      sec('components', [{ k: 'table', head, rows, cls: 'wide' }]);
    }

    if (want('connections')) {
      const anyW = m.edges.some(e => EDGE_W[e.weight]); // la columna Importancia solo sale si alguna conexión la usa: los informes viejos no cambian
      const rows = m.edges.map(e => {
        const cb = crossBorder(e, byId);
        return [nm(e.from), nm(e.to) + (e.both ? ' ↔' : ''), e.label || '', edgeStyleLabel(e.style), ...(anyW ? [EDGE_W[e.weight] ? { t: T(`wt.${e.weight}`), tone: e.weight === 'critical' ? 'sev-high' : '' } : T('wt.normal')] : []), e.encrypted === true ? T('enc.yes') : e.encrypted === false ? { t: T('enc.no'), tone: 'sev-high' } : T('enc.unset'),
          dShort(e.data), (e.datasets || []).join(', '), cb ? { t: `${cb.from.region} → ${cb.to.region}${cb.approved ? ' ✓' : ''}`, tone: cb.approved ? '' : 'sev-high' } : ''];
      });
      const ets = customTypes(), tb = ets.length ? [{ k: 'h3', t: repT('h.types') }, { k: 'table', head: [repT('h.type'), repT('h.dash'), repT('h.color'), repT('h.width'), repT('h.particles'), repT('h.edges')],
        rows: ets.map(t => [loc(t.label), t.dash || T('et.solid'), t.color || '', String(t.width ?? 1.8), String(t.particles ?? 1), String(m.edges.filter(e => e.style === t.id).length)]) }] : [];
      sec('connections', [{ k: 'table', head: [repT('h.from'), repT('h.to'), repT('h.label'), repT('h.style'), ...(anyW ? [T('wt.label')] : []), repT('h.enc'), repT('h.data'), repT('h.datasets'), repT('h.xb')], rows, cls: 'wide' }, ...tb]);
    }

    if (want('data')) {
      const blocks = [], used = Object.keys(DATA).filter(k => m.nodes.some(n => dataClassesOf(n, m).includes(k)) || m.edges.some(e => e.data?.includes(k)));
      if (used.length) blocks.push({ k: 'table', head: [repT('h.class'), repT('h.sens'), repT('h.nodes'), repT('h.edges')], rows: used.map(k => [`${loc(DATA[k].short) || k.toUpperCase()} · ${dLabel(k)}`, yn(DATA[k].sensitive),
        m.nodes.filter(n => dataClassesOf(n, m).includes(k)).map(n => n.label).join(', '), m.edges.filter(e => e.data?.includes(k)).map(edgeName).join(', ')]) });
      const regs = new Map();
      m.nodes.forEach(n => { const r = regionOf(n, m).value; if (r) (regs.get(r) || regs.set(r, []).get(r)).push(n.label); });
      if (regs.size) { blocks.push({ k: 'h3', t: repT('h.residency') }); blocks.push({ k: 'table', head: [repT('h.region'), repT('h.jur'), repT('h.nodes')], rows: [...regs].map(([r, ns]) => [r, jurOf(r)?.label || '', ns.join(', ')]) }); }
      const xb = m.edges.map(e => ({ e, cb: crossBorder(e, byId) })).filter(x => x.cb);
      if (xb.length) { blocks.push({ k: 'h3', t: repT('h.transfers') }); blocks.push({ k: 'table', head: [repT('h.connection'), repT('h.region'), repT('h.class'), repT('h.status')],
        rows: xb.map(({ e, cb }) => [edgeName(e), `${cb.from.region} (${cb.from.jur.short}) → ${cb.to.region} (${cb.to.jur.short})`, classShorts(cb.classes).join(' '), cb.approved ? repT('approved') : { t: repT('pending'), tone: 'sev-high' }]) }); }
      sec('data', blocks);
    }

    if (want('owners')) {
      sec('owners', [{ k: 'table', head: [repT('h.team'), repT('h.owners'), repT('h.stewards'), repT('h.nodes')], rows: govTeamList(m).map(t => [t.team || repT('noTeam'), t.owners.join(', '), t.stewards.join(', '), t.nodes.map(nm).join(', ')]) }]);
    }

    if (want('layers')) {
      sec('layers', [{ k: 'table', head: [repT('h.layer'), repT('h.nodes')], rows: Object.keys(DL).map(k => [layerInfo(k).label, m.nodes.filter(n => layerOf(n).value === k).map(n => n.label).join(', ')]).filter(r => r[1]) }]);
    }

    if (want('datasets')) {
      // Resumen, tabla del catálogo (declarados), sin documentar al final y, por producto, su esquema y sus reglas de calidad
      const dsl = m.datasets, cat = catalog(m), und = cat.filter(c => !c.declared), prods = dsl.filter(d => d.product), blocks = [];
      const ownerOf = o => m.stakeholders?.find(s => s.id === o)?.name || o || '';
      const frCell = f => ({ t: `${f.worst == null ? '—' : fmtDur(f.worst / 1000)} · ${f.sla == null ? '—' : fmtDur(f.sla / 1000)} · ${{ pass: '✓', fail: '✗', unknown: '?' }[f.state]}`, tone: f.state === 'fail' ? 'sev-high' : '' });
      blocks.push({ k: 'p', t: repT('cat.sum', { n: dsl.length, p: prods.length, u: und.length, b: dsl.filter(d => e2eOf(d.name, m).state === 'fail').length }) });
      const rows = dsl.map(d => {
        const f = e2eOf(d.name, m), sto = storageEstimate(d, { prices: dsPrices() });
        return [d.id, d.name, d.domain || '', d.layer ? layerInfo(d.layer).label : '', ownerOf(d.owner), d.product ? '★' : '', frCell(f),
          d.contract ? `${d.contract.version} · ${repT(`cat.st.${d.contract.status}`)}` : '', sto ? `${numFmt(sto.gb, 1)} GB · ${money(round2(sto.monthly))}` : ''];
      });
      blocks.push({ k: 'table', cls: 'wide', head: [repT('h.id'), repT('h.name'), repT('h.domain'), repT('h.layer'), repT('h.owner'), repT('h.product'), repT('h.freshness'), repT('h.contract'), repT('h.storage')], rows });
      if (dsl.some(d => storageEstimate(d, { prices: dsPrices() }))) blocks.push({ k: 'p', muted: true, t: repT('cat.estNote') });
      if (und.length) blocks.push({ k: 'p', t: `${repT('cat.undoc')}: ${und.map(c => c.name).join(', ')}` });
      prods.forEach(d => {
        blocks.push({ k: 'h3', t: `★ ${d.id} · ${d.name}` });
        if (d.description) blocks.push({ k: 'p', t: d.description });
        if (d.schema?.length) {
          blocks.push({ k: 'h4', t: repT('cat.schema') });
          blocks.push({ k: 'table', cls: 'compact', head: [repT('h.name'), repT('h.type'), repT('h.key'), repT('h.pii')], rows: d.schema.map(c => [c.name, c.type || '', c.key ? '✓' : '', c.pii ? '✓' : '']) });
        }
        if (d.quality?.length) {
          blocks.push({ k: 'h4', t: repT('cat.rules') });
          blocks.push({ k: 'table', cls: 'compact', head: [repT('h.rule'), repT('h.column'), repT('h.param'), repT('h.severity')], rows: d.quality.map(q => [q.rule, q.column || '', q.param || '', q.severity ? sevLabel(q.severity) : '']) });
        }
      });
      sec('datasets', blocks);
    }

    if (want('costs')) {
      const cn = m.nodes.filter(hasCost), blocks = [{ k: 'table', head: [repT('h.component'), repT('h.group'), repT('h.price'), repT('h.cost')], rows: [...cn.map(n => [n.label, gpath(n), costText(n), money(round2(perMonth(n)))]), [{ t: repT('total'), tone: 'total' }, '', '', { t: money(round2(monthlyTotal(m.nodes))), tone: 'total' }]] }];
      const gr = costBreakdown(m, 'group'); // árbol por ruta de grupos: costo directo y subtotal (con descendientes); sin asignar al final
      if (gr.length) { blocks.push({ k: 'h3', t: repT('h.perGroup') }); blocks.push({ k: 'table', head: [repT('h.group'), repT('h.nodes'), T('cst.col.own'), T('cst.col.subtotal')], rows: gr.map(x => ['\u00a0\u00a0\u00a0'.repeat(x.depth) + x.label + (x.kind === 'level' ? ` [${T('cst.level')}]` : ''), String(x.nodesAll.length), x.own ? money(round2(x.own)) : '—', money(round2(x.total))]) }); }
      [['team', 'byTeam', 'gov.team'], ['costCenter', 'byCostCenter', 'gov.costCenter']].forEach(([by, hk, fk]) => {
        const rs = costBreakdown(m, by);
        if (!rs.some(x => !x.unassigned)) return;
        const tot = rs.reduce((s, x) => s + x.monthly, 0);
        blocks.push({ k: 'h3', t: repT(`h.${hk}`) });
        blocks.push({ k: 'table', head: [T(fk), repT('h.nodes'), repT('h.cost'), T('cst.col.pct')], rows: rs.map(x => [x.label, String(x.nodes.length), money(round2(x.monthly)), tot ? `${(x.monthly / tot * 100).toFixed(1)}%` : '']) });
      });
      const per = [...new Set(cn.map(periodOf))];
      blocks.push({ k: 'p', muted: true, t: repT('costNote', { h: COST.hoursPerMonth, p: per.map(p => T(PERIODS[p].label)).join(', ') }) });
      sec('costs', blocks);
    }

    if (want('resilience')) { // Resiliencia: SLA, RPO/RTO, réplicas y puntos únicos de fallo
      const rn = m.nodes.filter(hasRes), sp = spofList(m), blocks = [];
      if (rn.length) blocks.push({ k: 'table', cls: 'wide', head: [repT('h.component'), repT('h.group'), repT('h.sla'), repT('h.replicas'), repT('h.eff'), repT('h.down'), 'RPO', 'RTO'],
        rows: rn.map(n => { const a = availOf(n); return [n.label, gpath(n), hasSla(n) ? `${numFmt(cleanSla(n.sla), 6)}%` : '', cleanReplicas(n.replicas) ? String(n.replicas) : '', a != null ? fmtPct(a) : '', a != null ? `${fmtApprox(downtime(a).year)}${T('res.perYear')}` : '', n.rpo != null ? fmtDur(parseDur(n.rpo)) : '', n.rto != null ? fmtDur(parseDur(n.rto)) : '']; }) });
      if (sp.length) { blocks.push({ k: 'h3', t: repT('h.spof') }); blocks.push({ k: 'table', head: [repT('h.component'), repT('h.detail')], rows: sp.map(x => [x.label, x.reason]) }); }
      blocks.push({ k: 'p', muted: true, t: repT('resNote') });
      sec('resilience', blocks);
    }

    if (want('findings')) {
      const row = f => [sevCell(f.severity), srcLabel(f.source), f.title, findingTargetLabel(f.target), [f.detail, f.fix].filter(Boolean).join('\n')];
      const head = [repT('h.severity'), repT('h.source'), repT('h.finding'), repT('h.target'), repT('h.detail')], blocks = [];
      blocks.push({ k: 'table', cls: 'compact', head: [...SEVERITY.slice().reverse().map(sevLabel), repT('dismissed')], rows: [[...SEVERITY.slice().reverse().map(s => String(open.filter(f => f.severity === s).length)), String(dis.length)]] });
      if (open.length) blocks.push({ k: 'table', head, rows: open.map(row), cls: 'wide' });
      if (dis.length) { blocks.push({ k: 'h3', t: repT('dismissed') }); blocks.push({ k: 'table', cls: 'wide', head: [...head, repT('h.reason')], rows: dis.map(f => [...row(f), [f.dismissed.reason, f.dismissed.by, f.dismissed.date ? fmtDay(f.dismissed.date) : ''].filter(Boolean).join(' · ')]) }); }
      sec('findings', blocks);
    }

    if (want('compliance')) {
      const { rows, keys, stats } = cmpModel(m), blocks = [], big = keys.length > 10; // más de 10 controles: una rejilla por marco (cabe en A4)
      cmpFrameworks(keys).forEach(fw => {
        const ks = keys.filter(k => ctlSplit(k)[0] === fw), ci = ctlInfo(`${fw}:x`);
        blocks.push({ k: 'h3', t: ci.fwLabel });
        blocks.push({ k: 'table', head: [repT('h.control'), repT('h.title'), ...CTL_STATUS.map(s => T(`cmp.${s}`)), T('cmp.unmapped'), T('cmp.mx.cov')], rows: ks.map(k => {
          const s = stats.get(k), d = rows.length - s.na;
          return [ctlSplit(k)[1], ctlInfo(k).title, ...CTL_STATUS.map(x => String(s[x])), String(s.unmapped), d > 0 ? Math.round(s.met / d * 100) + '%' : '—'];
        }) });
        if (big) { const g = cmpGridBlock(rows.filter(r => ks.some(k => r.eff.has(k))), ks); if (g) blocks.push(g); }
      });
      if (!big) { const g = cmpGridBlock(rows, keys); if (g) blocks.push(g); }
      blocks.push({ k: 'p', muted: true, t: `${T('cmp.mx.note')} ${repT('cmpGridNote')}` });
      sec('compliance', blocks);
    }

    if (want('threats')) {
      sec('threats', [{ k: 'table', cls: 'wide', head: [repT('h.zones'), repT('h.connection'), repT('h.cat'), repT('h.severity'), repT('h.status'), repT('h.note'), repT('h.mitigation')],
        rows: strideAll(m).map(t => [t.zones.map(trustName).join(' | '), `${t.from} → ${t.to}${t.e.label ? ` (${t.e.label})` : ''}`, `${t.cat} ${loc(STR.categories[t.cat].label)}`, sevCell(t.severity), T(`stride.st.${t.status}`), t.note, t.mitigation]) }]);
    }

    if (want('decisions')) {
      const ds = m.decisions, link = l => [...(l?.nodes || []).map(nm), ...(l?.edges || []).map(id => { const e = m.edges.find(x => x.id === id); return e ? edgeName(e) : id; }),
        ...(l?.groups || []).map(id => groupById(id)?.label || id), ...(l?.versions || []).map(id => { const v = findVersion(id); return v ? verLabel(v) : id; })];
      const ar = ds.some(d => d.area), blocks = [{ k: 'table', head: [repT('h.id'), repT('h.title'), repT('h.status'), repT('h.date'), repT('h.deciders'), ...(ar ? [T('adr.f.area')] : [])], rows: ds.map(d => [d.id, d.title, repT(`adr.${d.status}`), fmtDay(d.date), d.deciders || '', ...(ar ? [d.area || ''] : [])]) }];
      ds.forEach(d => {
        blocks.push({ k: 'h3', t: `${d.id} · ${d.title}` });
        blocks.push({ k: 'kv', items: [[repT('h.status'), repT(`adr.${d.status}`)], [repT('h.date'), fmtDay(d.date)], [repT('h.deciders'), d.deciders || ''], [T('adr.f.area'), d.area || ''], [repT('h.supersededBy'), d.supersededBy ? (ds.find(x => x.id === d.supersededBy)?.title ? `${d.supersededBy} · ${ds.find(x => x.id === d.supersededBy).title}` : d.supersededBy) : ''], [repT('h.links'), link(d.links).join(', ')]].filter(r => r[1]) });
        blocks.push({ k: 'table', cls: 'compact', head: [repT('h.date'), repT('h.status'), repT('h.by'), repT('h.note')], rows: adrHist(d).map(h => [fmtDay(h.date), repT(`adr.${h.status}`), h.by || '', h.note || '']) });
        [['context', d.context], ['decision', d.decision], ['consequences', d.consequences]].forEach(([k, t]) => {
          if (t && String(t).trim()) blocks.push({ k: 'text', label: repT(`adr.${k}`), t: String(t) });
          if (k === 'context' && d.options?.length) {   // opciones consideradas: matriz y ficha de cada una, entre el contexto y la decisión
            const mx = adrMatrixText(d);
            blocks.push({ k: 'text', label: T('adr.opts'), t: mx.legend });
            if (d.criteria?.length) blocks.push({ k: 'table', cls: 'compact', head: mx.head, rows: mx.rows });
            mx.cards.forEach(c => blocks.push({ k: 'text', label: c.label, t: [...c.facts.map(([a, v]) => `${a}: ${v}`), ...(c.pros.length ? [`${T('adr.o.pros')}:`, ...c.pros.map(x => `• ${x}`)] : []), ...(c.cons.length ? [`${T('adr.o.cons')}:`, ...c.cons.map(x => `• ${x}`)] : [])].join('\n') }));
          }
        });
      });
      sec('decisions', blocks);
    }

    if (want('requirements')) {
      const rs = m.requirements, cov = r => reqCoveredBy(r, m), chk = new Map(rs.filter(r => r.check).map(r => [r.id, reqCheck(r, m)]));
      const res = r => { const c = chk.get(r.id); return c ? { t: `${{ pass: '✓', fail: '✗', unknown: '?' }[c.state]} ${reqCheckText(r)}${c.detail ? ` · ${c.detail}` : ''}`, tone: c.state === 'fail' ? 'sev-high' : '' } : ''; };
      const blocks = [{ k: 'table', cls: 'wide', head: [repT('h.id'), repT('h.title'), repT('h.kind'), repT('h.priority'), repT('h.status'), repT('h.coveredBy'), repT('h.check')],
        rows: rs.map(r => [r.id, r.title, T(`req.kind.${r.kind}`), r.priority ? T(`req.pr.${r.priority}`) : '', T(`req.st.${r.status}`), cov(r), res(r)]) }];
      rs.filter(r => r.detail || r.source).forEach(r => blocks.push({ k: 'text', label: `${r.id} · ${r.title}${r.source ? ` (${T('req.f.source')}: ${r.source})` : ''}`, t: r.detail || '' }));
      sec('requirements', blocks);
    }
    if (want('raid')) {
      // Resumen, mapa de calor (riesgos con puntaje) y una tabla por tipo; la columna de detalle solo aparece si algún item la trae
      const rd = m.raid, now = today(), sm = raidSummary(m, now), tone = lv => `sev-${lv}`;
      const lk = l => [...(l?.decisions || []), ...(l?.requirements || []), ...(l?.nodes || []).map(nm), ...(l?.edges || []).map(id => { const e = m.edges.find(x => x.id === id); return e ? edgeName(e) : id; }), ...(l?.groups || []).map(id => groupById(id)?.label || id)].join(', ');
      const parts = [sm.risks && T('raid.sum.risks', sm), sm.toValidate && T('raid.sum.validate', sm.toValidate), sm.overdue && T('raid.sum.overdue', sm.overdue)].filter(Boolean);
      const blocks = parts.length ? [{ k: 'p', t: parts.join(' · ') }] : [];
      const g = raidHeat(rd);
      if (rd.some(x => raidScore(x))) {
        blocks.push({ k: 'h3', t: T('raid.heat') });
        blocks.push({ k: 'table', cls: 'compact', head: [`${T('raid.f.impact')} ↓ / ${T('raid.f.prob')} →`, 1, 2, 3, 4, 5].map(String), rows: [5, 4, 3, 2, 1].map(i => [`${i} · ${T(`raid.scale.${i}`)}`, ...[1, 2, 3, 4, 5].map(p => { const n = g[i - 1][p - 1]; return n ? { t: String(n), tone: tone(raidLevel(p * i)) } : ''; })]) });
      }
      RAID_TYPES.forEach(t => {
        const l = rd.filter(x => x.type === t);
        if (!l.length) return;
        const dt = l.some(x => x.detail), late = x => (raidLate(x) ? 'sev-high' : '');
        blocks.push({ k: 'h3', t: `${T(`raid.type.${t}`)} (${l.length})` });
        const base = x => [x.id, x.title, x.owner || ''], tail = x => [lk(x.links), ...(dt ? [x.detail || ''] : [])], dtH = dt ? [T('raid.f.detail')] : [];
        if (t === 'risk') blocks.push({ k: 'table', cls: 'wide', head: [T('raid.f.id'), T('raid.f.title'), T('raid.f.owner'), T('raid.f.prob'), T('raid.f.impact'), T('raid.f.score'), T('raid.f.status'), T('raid.f.mit'), T('raid.f.links'), ...dtH],
          rows: l.map(x => { const sc = raidScore(x); return [...base(x), x.probability ? String(x.probability) : '', x.impact ? String(x.impact) : '', sc ? { t: String(sc), tone: tone(raidLevel(sc)) } : '', T(`raid.st.${x.status}`), x.mitigation || '', ...tail(x)]; }) });
        else if (t === 'assumption') blocks.push({ k: 'table', cls: 'wide', head: [T('raid.f.id'), T('raid.f.title'), T('raid.f.owner'), T('raid.f.validation'), T('raid.f.due.a'), T('raid.hist'), T('raid.f.links'), ...dtH],
          rows: l.map(x => { const h = (x.history || [])[(x.history || []).length - 1]; return [...base(x), { t: T(`raid.st.${x.validation}`), tone: x.validation === 'invalidated' ? 'sev-high' : x.validation === 'validated' ? 'sev-low' : '' }, { t: fmtDay(x.due), tone: late(x) }, h ? [fmtDay(h.date), h.by].filter(Boolean).join(' · ') : '', ...tail(x)]; }) });
        else blocks.push({ k: 'table', cls: 'wide', head: [T('raid.f.id'), T('raid.f.title'), T('raid.f.owner'), T('raid.f.status'), T('raid.f.due.n'), T('raid.f.links'), ...dtH],
          rows: l.map(x => [...base(x), T(`raid.st.${x.status}`), { t: fmtDay(x.due), tone: late(x) }, ...tail(x)]) });
      });
      sec('raid', blocks);
    }

    if (want('approvals')) {
      // Interesados, matriz RACI (filas = interesados; columnas = «Todas las áreas» + áreas de las decisiones) y aprobaciones de decisiones y versiones con aprobadores requeridos o firmas
      const sh = m.stakeholders, cols = ['*', ...shAreas(m)];
      const blocks = [{ k: 'h3', t: repT('h.stakeholders') }, { k: 'table', cls: 'wide', head: [repT('h.id'), repT('h.name'), repT('h.role'), repT('h.org'), repT('h.versions'), repT('h.state')],
        rows: sh.map(s => [s.id, s.name, s.role || '', T(`people.org.${s.org}`), s.versions === true ? '✓' : '', s.inactive ? T('people.inactive') : repT('sh.active')]) }];
      blocks.push({ k: 'h3', t: T('people.mx.title') }, { k: 'p', t: T('people.mx.legend'), muted: true });
      blocks.push({ k: 'table', cls: 'compact', head: [repT('h.stakeholder'), ...cols.map(a => (a === '*' ? T('people.all') : a))], rows: sh.map(s => [s.name, ...cols.map(a => (a === '*' ? s.raci?.['*'] : shRaciOf(s, a)) || '')]) });
      const dec = (m.decisions || []).filter(d => approvalState('decision', d, m).required.length || d.signoffs?.length);
      if (dec.length) {
        blocks.push({ k: 'h3', t: repT('h.decApprovals') });
        blocks.push({ k: 'table', cls: 'wide', head: [repT('h.id'), repT('h.title'), repT('h.status'), repT('h.approvals'), repT('h.pendingNames'), repT('h.rejectedNames')], rows: dec.map(d => {
          const st = approvalState('decision', d, m);
          return [d.id, d.title, T(`adr.st.${d.status}`), st.required.length ? apprSummary(st) : '', apprNames(st.pending, m), apprNames(st.rejected, m)]; }) });
      }
      const ver = (m.versions || []).filter(v => approvalState('version', v, m).required.length || v.signoffs?.length);
      if (ver.length) {
        blocks.push({ k: 'h3', t: repT('h.verApprovals') });
        blocks.push({ k: 'table', cls: 'wide', head: [repT('h.version'), repT('h.status'), repT('h.approvals'), repT('h.pendingNames'), repT('h.rejectedNames')], rows: ver.map(v => {
          const st = approvalState('version', v, m);
          return [verLabel(v), T(`ver.st.${v.status}`), st.required.length ? apprSummary(st) : '', apprNames(st.pending, m), apprNames(st.rejected, m)]; }) });
      }
      sec('approvals', blocks);
    }

    if (want('phases')) {
      // Tabla comparativa y, por fase: nombre, fecha, objetivo, altas y bajas (nombres) y la imagen de la arquitectura en esa fase
      const rows = phaseRows(m, phaseHelpers), names = ids => ids.map(nm).join(', ');
      const blocks = [{ k: 'table', cls: 'wide', head: [repT('h.phase'), repT('h.date'), repT('k.components'), T('phase.cmp.added'), T('phase.cmp.retired'), T('phase.cmp.cost'), T('phase.cmp.delta'), `${T('phase.cmp.findings')} (${SEVERITY.slice().reverse().filter(s => s !== 'critical').map(sevLabel).join(' / ')})`],
        rows: rows.map(r => [r.name, r.date ? fmtPhaseDate(r.date) : '', String(r.nodes), String(r.added), String(r.retired), phaseCostText(r), phaseCostText(r, 'dCost'), `${r.findings.high} / ${r.findings.medium} / ${r.findings.low}`]) }];
      rows.forEach((r, i) => {
        blocks.push({ k: 'h3', t: [r.name, r.date ? fmtPhaseDate(r.date) : ''].filter(Boolean).join(' · ') });
        if (r.goal) blocks.push({ k: 'p', t: r.goal });
        const kv = [[T('phase.cmp.added'), names(r.addedIds)], [T('phase.cmp.retired'), names(r.retiredIds)]].filter(x => x[1]);
        if (kv.length) blocks.push({ k: 'kv', items: kv });
        const im = phImgs.find(x => x.i === i);
        if (im) blocks.push({ k: 'img', alt: `${m.title} — ${r.name}`, svg: im.svg, uri: im.uri, file: im.file });
      });
      sec('phases', blocks);
    }

    if (want('estimation')) {
      // Una fila por fase: días por perfil, costo de construcción, imprevistos y acumulado; al final, el total y los perfiles sin tarifa
      const pe = phaseEffort(m, effortHelpers), roles = [...new Set(pe.rows.flatMap(r => Object.keys(r.byRole)))], rated = pe.rows.some(r => r.cost > 0), phased = !!m.phases?.length;
      const head = [...(phased ? [repT('h.phase')] : []), repT('h.estimated'), ...roles.map(k => `${efInfo(k).label}${efInfo(k).known ? '' : ' ⚠'}`), repT('h.days'), ...(rated ? [repT('h.build'), repT('h.contingency'), repT('h.total'), repT('h.cumulative')] : [])];
      const row = r => [...(phased ? [r.name] : []), `${r.estimated}/${r.comps}`, ...roles.map(k => (r.byRole[k] ? String(r.byRole[k]) : '')), String(r.days), ...(rated ? [money(r.cost), r.contingency ? money(r.contingency) : '', money(r.total), money(r.cumulative)] : [])];
      const t = pe.totals, tot = [...(phased ? [repT('h.sum')] : []), '', ...roles.map(k => String(round2(pe.rows.reduce((a, r) => a + (r.byRole[k] || 0), 0)))), String(t.days), ...(rated ? [money(t.cost), t.contingency ? money(t.contingency) : '', money(t.total), ''] : [])];
      const blocks = [{ k: 'p', t: pe.pct ? T('est.cont', pe.pct) : T('est.cont.none') }, { k: 'table', cls: 'wide', head, rows: [...pe.rows.map(row), tot] }];
      const bad = [...new Set(pe.rows.flatMap(r => r.unrated))];
      if (bad.length) blocks.push({ k: 'p', t: T('est.unrated.tip', bad.join(', ')) });
      sec('estimation', blocks);
    }

    if (want('migration')) {
      // Recuento por disposición y una fila por componente con su disposición y las fases de entrada y de retiro (si hay fases)
      const ph = !!m.phases?.length, cnt = {};
      m.nodes.forEach(n => { if (n.disposition) cnt[n.disposition] = (cnt[n.disposition] || 0) + 1; });
      const blocks = [{ k: 'table', head: [repT('h.disposition'), repT('h.nodes')], rows: Object.keys(MG).filter(k => cnt[k]).map(k => [mgInfo(k).label, String(cnt[k])]) }];
      const head = [repT('h.component'), repT('h.disposition'), ...(ph ? [repT('h.phaseIn'), repT('h.phaseOut')] : []), repT('h.cost')];
      const rows = Object.keys(MG).flatMap(k => m.nodes.filter(n => n.disposition === k).map(n => [n.label, mgInfo(k).label, ...(ph ? [phNm(m, n.phase), phNm(m, n.until)] : []), hasCost(n) ? money(round2(perMonth(n))) : '']));
      blocks.push({ k: 'table', head, rows, cls: 'wide' });
      sec('migration', blocks);
    }

    if (want('radar')) {
      // Recuento por anillo y una fila por componente reconocido: producto, anillo, fin de soporte y sustituto
      const now = today(), rows = m.nodes.map(n => ({ n, i: radarInfo(n, m, now) })).filter(x => x.i), cnt = {};
      rows.forEach(({ i }) => { cnt[i.entry.ring] = (cnt[i.entry.ring] || 0) + 1; });
      const blocks = [{ k: 'table', head: [repT('h.ring'), repT('h.nodes')], rows: RD_KEYS.filter(k => cnt[k]).map(k => [rdRingInfo(k).label, String(cnt[k])]) }];
      const ordered = RD_KEYS.flatMap(k => rows.filter(x => x.i.entry.ring === k));
      blocks.push({ k: 'table', cls: 'wide', head: [repT('h.component'), repT('h.radarProduct'), repT('h.ring'), repT('h.eos'), repT('h.replaceWith')], rows: ordered.map(({ n, i }) => [n.label, i.name, i.ring.label,
        i.eosDay ? { t: fmtDay(i.eosDay), tone: i.status === 'ended' ? 'sev-high' : i.status === 'soon' ? 'sev-medium' : '' } : '', i.replaceWith]) });
      sec('radar', blocks);
    }

    if (want('drift')) {   // diferencias con la infraestructura desplegada que alguien aceptó, con su motivo
      const lab = id => m.nodes.find(n => n.id === id)?.label || id;
      sec('drift', [{ k: 'table', cls: 'wide', head: [repT('h.component'), repT('h.field'), repT('h.accepted'), repT('h.reason'), repT('h.date')], rows: (m.deviations || []).map(d => [lab(d.node), T(`dr.field.${d.field}`), driftShow(d.field, d.field === 'replicas' ? +d.value : d.field === 'backup' ? d.value === 'true' : d.value), d.reason, d.date ? fmtDay(d.date) : '']) }]);
    }

    if (want('versions')) {
      const blocks = [{ k: 'table', cls: 'wide', head: [repT('h.version'), repT('h.env'), repT('h.status'), repT('h.author'), repT('h.created'), repT('h.updated'), repT('h.decided'), repT('h.note')], rows: m.versions.map(v => [
        verLabel(v) + (v.id === m.active ? ` ★ ${repT('activeMark')}` : ''), v.kind === 'env' ? loc(C.environments?.[v.env]?.label) || v.env : '', { t: T(`ver.st.${v.status}`), tone: `vs-${v.status}` }, v.author || '', fmtDay(v.created), fmtDay(v.updated),
        [v.decidedBy, fmtDay(v.decidedOn)].filter(Boolean).join(' · '), [v.reason, v.note].filter(Boolean).join('\n')]) }];
      const hist = m.versions.flatMap(v => (v.history || []).map(h => [verLabel(v), fmtDay(h.date), T(`ver.st.${h.status}`), h.by || '', h.reason || '']));
      if (hist.length) { blocks.push({ k: 'h3', t: T('ver.history') }); blocks.push({ k: 'table', cls: 'compact', head: [repT('h.version'), repT('h.date'), repT('h.status'), repT('h.by'), repT('h.reason')], rows: hist }); }
      sec('versions', blocks);
    }

    if (want('notes')) {
      const blocks = [], zs = (m.zones || []).filter(z => z.kind !== 'trust');
      if (zs.length) { blocks.push({ k: 'h3', t: repT('h.zones2') }); blocks.push({ k: 'table', head: [repT('h.label'), repT('h.severity'), repT('h.detail')], rows: zs.map(z => [z.label || T('zone.new'), sevCell(z.severity), z.desc || '']) }); }
      if ((m.notes || []).length) { blocks.push({ k: 'h3', t: repT('h.notes') }); blocks.push({ k: 'ul', items: m.notes.map(n => n.text).filter(t => String(t).trim()) }); }
      sec('notes', blocks);
    }
    if (want('comments')) {   // hilos sin resolver; los internos nunca salen del documento
      const rows = (m.comments || []).filter(c => !c.internal && c.status !== 'resolved').map(c => [cmTargetText(m, c.on), c.author || '', c.date ? fmtDay(c.date) : '', c.text, (c.replies || []).map(r => `${r.author || T('cmt.anon')}: ${r.text}`).join('\n')]);
      sec('comments', [{ k: 'table', head: [repT('h.about'), repT('h.author'), repT('h.date'), repT('h.comment'), repT('h.replies')], rows, cls: 'wide' }]);
    }
    return D;
  }

  /* Markdown: texto escapado (tablas con barras, # al inicio, etc.) */
  const mdEsc = s => String(s ?? '').replace(/[\\`*_\[\]<>|]/g, '\\$&').replace(/^(\s*)(#|>|[-+]\s|\d+[.)]\s)/gm, '$1\\$2');
  const mdCell = c => (mdEsc(typeof c === 'object' && c ? c.t : c).replace(/\r?\n/g, '<br>').trim() || ' ');
  const mdLines = s => mdEsc(s).replace(/\r?\n/g, '  \n');
  function reportMarkdown(D) {
    const o = [`# ${mdEsc(D.title)}`, '', `*${mdEsc(D.sub || [D.author, D.version, D.active?.label, D.date].filter(Boolean).join(' · '))}*`, ''];
    D.sections.forEach(s => {
      o.push(`## ${mdEsc(s.title)}`, '');
      s.blocks.forEach(b => {
        if (b.k === 'h3') o.push(`### ${mdEsc(b.t)}`, '');
        else if (b.k === 'h4') o.push(`#### ${mdEsc(b.t)}`, '');
        else if (b.k === 'p') o.push(b.muted ? `*${mdEsc(b.t)}*` : mdLines(b.t), '');
        else if (b.k === 'kv') o.push(...b.items.map(([k, v]) => `- **${mdEsc(k)}:** ${mdEsc(v).replace(/\r?\n/g, ' ')}`), '');
        else if (b.k === 'ul') o.push(...b.items.map(t => `- ${mdEsc(t).replace(/\r?\n/g, ' ')}`), '');
        else if (b.k === 'text') o.push(`**${mdEsc(b.label)}**`, '', mdLines(b.t), '');
        else if (b.k === 'cards') o.push(`| ${b.items.map(c => mdCell(c.label)).join(' | ')} |`, `|${b.items.map(() => ' --- |').join('')}`, `| ${b.items.map(c => mdCell(String(c.value))).join(' | ')} |`, '');
        else if (b.k === 'table') {
          if (!b.rows.length) return;
          const hd = b.mdHead || b.head;
          o.push(`| ${hd.map(mdCell).join(' | ')} |`, `|${hd.map(() => ' --- |').join('')}`, ...b.rows.map(r => `| ${r.map(mdCell).join(' | ')} |`), '');
        } else if (b.k === 'img') o.push(`![${mdEsc(b.alt)}](${b.file ? encodeURI(b.file) : b.uri})`, '');
      });
    });
    o.push('---', '', `*${mdEsc(repT('footer', { app: C.app.name, date: D.date }))}*`, '');
    return o.join('\n');
  }

  // Rejilla de cumplimiento para el informe: filas = componentes, columnas = controles (cabecera de marcos con colspan + ids); celda = símbolo + tono, «↑» si es heredado
  function cmpGridBlock(rows, ks) {
    if (!rows.length || !ks.length) return null;
    const fws = cmpFrameworks(ks), cut = t => (t.length > 28 ? `${t.slice(0, 27)}…` : t);
    return { k: 'table', cls: 'grid', group: fws.map(f => [ctlInfo(`${f}:x`).short, ks.filter(k => ctlSplit(k)[0] === f).length]),
      head: [repT('h.component'), ...ks.map(k => ctlSplit(k)[1])], mdHead: [repT('h.component'), ...ks.map(k => (fws.length > 1 ? `${ctlInfo(k).short} ` : '') + ctlSplit(k)[1])],
      rows: rows.map(r => [{ t: cut(r.n.label), title: r.n.label }, ...ks.map(k => {
        const e = r.eff.get(k);
        return e ? { t: CTL_SYM[e.status] + (e.from ? '↑' : ''), tone: `st-${e.status}${e.from ? ' inh' : ''}`, title: `${ctlInfo(k).short} ${ctlSplit(k)[1]}: ${T(`cmp.${e.status}`)}${e.from ? ` (${T('cmp.inh', groupById(e.from)?.label || e.from)})` : ''}` } : '';
      })]) };
  }

  /* HTML autocontenido (también el que se imprime a PDF): sin red, sin scripts, imágenes como data URI */
  const REP_CSS = `*{box-sizing:border-box}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;padding:24px 20px;background:#fff;color:#1b1a22;font:10.5pt/1.5 __FONT__;}
main,header,nav{max-width:1000px;margin:0 auto}
h1{margin:0 0 4px;font-size:26pt;line-height:1.15}h2{margin:30px 0 10px;padding-bottom:5px;border-bottom:2px solid #6b5bd2;font-size:15pt}h3{margin:18px 0 6px;font-size:11.5pt}h4{margin:10px 0 2px;font-size:9.5pt;text-transform:uppercase;letter-spacing:.05em;color:#6b6778}
p{margin:0 0 8px}.muted{color:#6b6778;font-size:9.5pt}.sub{margin:0 0 14px;color:#6b6778;font-size:11pt}
nav ol{margin:6px 0 0;padding-left:20px;columns:2;font-size:10pt}nav a{color:#4b3fb5;text-decoration:none}
dl{display:grid;grid-template-columns:max-content 1fr;gap:3px 14px;margin:0 0 12px}dt{font-weight:700;color:#4a4757}dd{margin:0}
.cards{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 12px}.card{min-width:110px;padding:8px 12px;border:1px solid #d6d3e0;border-radius:8px;background:#f6f5fb}.card b{display:block;font-size:16pt;line-height:1.2}.card span{font-size:8.5pt;color:#6b6778;text-transform:uppercase;letter-spacing:.04em}
table{width:100%;border-collapse:collapse;margin:6px 0 14px;font-size:8.5pt}table.compact{width:auto;min-width:50%}th,td{padding:4px 6px;border:1px solid #d6d3e0;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#efedf8;font-weight:700}
thead{display:table-header-group}tr{break-inside:avoid}table.wide{font-size:8pt}
table.grid{width:auto;max-width:100%;font-size:8pt}table.grid th{text-align:center}table.grid th:first-child,table.grid td:first-child{text-align:left;max-width:48mm}table.grid td{text-align:center;white-space:nowrap}table.grid td.inh{font-style:italic;background:#f6f5fb}
.txt p{white-space:pre-wrap;margin:0 0 6px}ul{margin:0 0 10px;padding-left:20px}
figure{margin:6px 0 14px;break-inside:avoid}figure img{display:block;max-width:100%;height:auto;border:1px solid #d6d3e0;border-radius:6px}
.sev-low{color:#2f7d4f;font-weight:700}.sev-medium{color:#9a6b00;font-weight:700}.sev-high{color:#b4361f;font-weight:700}.sev-critical{color:#fff;background:#b4361f;font-weight:700}
.st-met{color:#2f7d4f}.st-partial{color:#9a6b00}.st-gap{color:#b4361f;font-weight:700}.st-na{color:#6b6778}.rev-open{color:#9a6b00}.rev-overdue{color:#b4361f;font-weight:700}.rev-resolved{color:#2f7d4f}
.vs-approved{color:#2f7d4f;font-weight:700}.vs-rejected{color:#b4361f;font-weight:700}.vs-review{color:#9a6b00}.total{font-weight:700;background:#f6f5fb}
footer{max-width:1000px;margin:28px auto 0;padding-top:8px;border-top:1px solid #d6d3e0;color:#6b6778;font-size:8.5pt}
@page{size:A4;margin:18mm 14mm 18mm;@top-left{content:__TITLE__;font:8pt sans-serif;color:#6b6778}@bottom-right{content:counter(page) " / " counter(pages);font:8pt sans-serif;color:#6b6778}}
@media print{body{padding:0}h2,h3{break-after:avoid}.pb{break-before:page}}`;
  function reportHTML(D) {
    const cell = c => { const t = typeof c === 'object' && c ? c.t : c, tone = typeof c === 'object' && c?.tone ? ` class="${esc(c.tone)}"` : '', tt = typeof c === 'object' && c?.title ? ` title="${esc(c.title)}"` : ''; return `<td${tone}${tt}>${esc(t).replace(/\r?\n/g, '<br>')}</td>`; };
    const css = REP_CSS.replace('__FONT__', fontCss().replace(/"/g, "'")).replace('__TITLE__', `"${String(D.title).replace(/[\\"]/g, '\\$&').replace(/[\r\n]+/g, ' ')}"`);
    const blk = b => {
      if (b.k === 'h3') return `<h3>${esc(b.t)}</h3>`;
      if (b.k === 'h4') return `<h4>${esc(b.t)}</h4>`;
      if (b.k === 'p') return `<p${b.muted ? ' class="muted"' : ''}>${esc(b.t).replace(/\r?\n/g, '<br>')}</p>`;
      if (b.k === 'kv') return `<dl>${b.items.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v).replace(/\r?\n/g, '<br>')}</dd>`).join('')}</dl>`;
      if (b.k === 'ul') return `<ul>${b.items.map(t => `<li>${esc(t).replace(/\r?\n/g, '<br>')}</li>`).join('')}</ul>`;
      if (b.k === 'text') return `<div class="txt"><h4>${esc(b.label)}</h4><p>${esc(b.t)}</p></div>`;
      if (b.k === 'cards') return `<div class="cards">${b.items.map(c => `<div class="card"><b${c.tone ? ` class="${esc(c.tone)}"` : ''}>${esc(c.value)}</b><span>${esc(c.label)}</span></div>`).join('')}</div>`;
      if (b.k === 'table') return b.rows.length ? `<table${b.cls ? ` class="${esc(b.cls)}"` : ''}><thead>${b.group ? `<tr><th rowspan="2">${esc(b.head[0])}</th>${b.group.map(([g, n]) => `<th colspan="${n}">${esc(g)}</th>`).join('')}</tr><tr>${b.head.slice(1).map(h => `<th>${esc(h)}</th>`).join('')}</tr>` : `<tr>${b.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr>`}</thead><tbody>${b.rows.map(r => `<tr>${r.map(cell).join('')}</tr>`).join('')}</tbody></table>` : '';
      if (b.k === 'img') return `<figure><img src="${esc(b.uri || '')}" alt="${esc(b.alt)}"></figure>`;
      return '';
    };
    const csp = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";
    return `<!doctype html>
<html lang="${esc(D.lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}">
<title>${esc(D.title)}</title><style>${css}</style></head><body>
<header><h1>${esc(D.title)}</h1><p class="sub">${esc(D.sub || [D.author, D.version, D.active?.label, D.date].filter(Boolean).join(' · '))}</p></header>
<nav aria-label="${esc(repT('toc'))}"><ol>${D.sections.map(s => `<li><a href="#rep-${esc(s.id)}">${esc(s.title)}</a></li>`).join('')}</ol></nav>
<main>${D.sections.map(s => `<section id="rep-${esc(s.id)}"${REP_PAGE.includes(s.id) ? ' class="pb"' : ''}><h2>${esc(s.title)}</h2>${s.blocks.map(blk).join('')}</section>`).join('\n')}</main>
<footer>${esc(repT('footer', { app: C.app.name, date: D.date }))}</footer></body></html>`;
  }

  // PDF: sin biblioteca; el documento se imprime desde un iframe oculto y el navegador ofrece «Guardar como PDF»
  function repPrint(html) {
    return new Promise((res, rej) => {
      const f = document.createElement('iframe');
      f.setAttribute('aria-hidden', 'true'); f.setAttribute('tabindex', '-1');
      f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
      f.onload = async () => {
        try {
          const w = f.contentWindow, d = f.contentDocument;
          for (let i = 0; i < 100 && ![...d.images].every(im => im.complete); i++) await repSleep(100);
          w.focus();
          w.addEventListener('afterprint', () => setTimeout(() => f.remove(), 300), { once: true });
          setTimeout(() => f.remove(), 600000);
          w.print();
          res();
        } catch (err) { f.remove(); rej(err); }
      };
      f.srcdoc = html;
      document.body.appendChild(f);
    });
  }
  let repBusy = false;
  // API: Promise con el texto generado (HTML o Markdown) tras lanzar la descarga o la impresión; '' si no se pudo
  async function exportReport(o = {}) {
    if (repBusy || viewBusy || P) return '';
    const format = ['pdf', 'md', 'html'].includes(o.format) ? o.format : 'pdf';
    const opts = { format, sections: Array.isArray(o.sections) ? o.sections : REP_SECS, views: Array.isArray(o.views) ? o.views : repDefaultViews(), scopes: o.scopes !== false && repScopes().length > 0,
      theme: o.theme === 'current' ? 'current' : 'light', separateImages: format === 'md' && !!o.separateImages, progress: o.progress };
    repBusy = true;
    try {
      const D = await reportData(opts);
      if (format === 'md') {
        const md = reportMarkdown(D);
        download(md, fileName('md', 'report'), 'text/markdown;charset=utf-8');
        for (const f of D.files) { await repSleep(350); download(f.blob, f.name); }
        return md;
      }
      const html = reportHTML(D);
      if (format === 'html') download(html, fileName('html', 'report'), 'text/html;charset=utf-8'); else await repPrint(html);
      return html;
    } finally { repBusy = false; }
  }
  function openReportDialog() {
    if (viewBusy || repBusy || P) return;
    const prev = document.activeElement, id = `rp${Date.now()}`, av = repAvail(), scopes = repScopes();
    const saved = store.get('report', {}) || {}, fmt0 = ['pdf', 'md', 'html'].includes(saved.format) ? saved.format : 'pdf';
    const secOn = k => av[k] && (!Array.isArray(saved.sections) || saved.sections.includes(k));
    const defViews = repDefaultViews();
    const back = document.createElement('div');
    back.className = 'cf-back';
    back.innerHTML = `<form class="cf share rep" role="dialog" aria-modal="true" aria-labelledby="${id}t" autocomplete="off">
      <h3 id="${id}t">${esc(repT('title'))}</h3>
      <p>${esc(repT('lead'))}</p>
      <fieldset class="sh-views"><legend>${esc(repT('format'))}</legend>${['pdf', 'md', 'html'].map(k => `<label class="sh-chk"><input type="radio" name="fmt" value="${k}"${k === fmt0 ? ' checked' : ''}>${esc(repT(`fmt.${k}`))}</label>`).join('')}<small class="sh-size" data-rep="hint"></small></fieldset>
      <fieldset class="sh-views"><legend>${esc(repT('sections'))}</legend>${REP_SECS.map(k => `<label class="sh-chk rep-sec${av[k] ? '' : ' rep-none'}"><input type="checkbox" name="sec" value="${k}"${secOn(k) ? ' checked' : ''}${av[k] ? '' : ' disabled'}>${esc(repT(`s.${k}`))}${av[k] ? '' : ` <small>${esc(repT('none'))}</small>`}</label>`).join('')}</fieldset>
      <fieldset class="sh-views" data-rep="views"><legend>${esc(repT('views'))}</legend>${VIEW_KEYS.map(k => `<label class="sh-chk"><input type="checkbox" name="views" value="${esc(k)}"${defViews.includes(k) ? ' checked' : ''}>${esc(viewLabel(k))}</label>`).join('')}
        ${scopes.length ? `<label class="sh-chk"><input type="checkbox" name="scopes"${saved.scopes === false ? '' : ' checked'}>${esc(repT('scopes'))}</label>` : ''}</fieldset>
      <label>${esc(repT('theme'))}<select name="theme"><option value="light">${esc(repT('theme.light'))}</option><option value="current"${saved.theme === 'current' ? ' selected' : ''}>${esc(repT('theme.current'))}</option></select></label>
      <label class="sh-chk" data-rep="sep"><input type="checkbox" name="sep"${saved.sep ? ' checked' : ''}>${esc(repT('sep'))}</label>
      <p class="sh-err" role="alert" data-rep="msg"></p>
      <div class="cf-actions"><button type="button" class="btn" data-rep="no">${esc(T('ver.cf.cancel'))}</button><button type="submit" class="btn primary">${esc(repT('create'))}</button></div>
    </form>`;
    const form = back.querySelector('form'), msg = form.querySelector('[data-rep="msg"]'), hint = form.querySelector('[data-rep="hint"]');
    const close = () => { document.removeEventListener('keydown', key, true); back.remove(); prev?.focus?.(); };
    const key = ev => { if (ev.key === 'Escape' && !form.classList.contains('busy')) { ev.preventDefault(); ev.stopPropagation(); close(); } };
    const fmtNow = () => form.elements.fmt.value;
    const sync = () => {
      form.querySelector('[data-rep="sep"]').hidden = fmtNow() !== 'md';
      hint.textContent = repT(`hint.${fmtNow()}`);
      const dia = form.querySelector('input[name="sec"][value="diagram"]').checked;
      form.querySelectorAll('[data-rep="views"] input, select[name="theme"]').forEach(i => { i.disabled = !dia; });
      msg.textContent = '';
    };
    form.addEventListener('change', sync);
    form.addEventListener('click', ev => { if (ev.target.closest('[data-rep="no"]')) close(); });
    back.addEventListener('mousedown', ev => { if (ev.target === back && !form.classList.contains('busy')) close(); });
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      if (form.classList.contains('busy')) return;
      const sections = [...form.querySelectorAll('input[name="sec"]:checked')].map(i => i.value), views = [...form.querySelectorAll('input[name="views"]:checked')].map(i => i.value);
      if (!sections.length) { msg.textContent = repT('noSec'); return; }
      if (sections.includes('diagram') && !views.length) { msg.textContent = repT('noViews'); return; }
      const opts = { format: fmtNow(), sections, views, scopes: !!form.elements.scopes?.checked, theme: form.elements.theme.value, separateImages: !!form.elements.sep.checked };
      store.set('report', { format: opts.format, sections, scopes: scopes.length ? opts.scopes : saved.scopes, theme: opts.theme, sep: opts.separateImages });
      const btn = form.querySelector('[type="submit"]');
      form.classList.add('busy'); btn.textContent = repT('busy');
      opts.progress = (i, n, name) => { msg.style.color = 'var(--muted)'; msg.textContent = repT('progress', { i, n, name }); toast(repT('progress', { i, n, name }), 60000); };
      try {
        const out = await exportReport(opts);
        if (!out) throw new Error('report');
        close();
        toast(repT(opts.format === 'pdf' ? 'donePdf' : 'done'), 4200);
      } catch (err) {
        console.error('report', err);
        form.classList.remove('busy'); btn.textContent = repT('create');
        msg.style.color = ''; msg.textContent = repT('fail'); toast(repT('fail'), 3000);
      }
    });
    document.addEventListener('keydown', key, true);
    document.body.appendChild(back);
    sync();
    form.querySelector('[type="submit"]').focus();
  }

  // Informe de estado: elige la referencia (la última versión guardada, otra versión o una fecha) y las secciones; la vista previa es el texto que se copia o se descarga en Markdown o HTML
  const ST_KEYS = ['decisions', 'risks', 'phases', 'components', 'money', 'pending', 'comments', 'versions'];
  function openStatusDialog() {
    if (P) return;
    const prev = document.activeElement, id = `st${Date.now()}`, m = S.model, saved = store.get('statusReport', {}) || {};
    const vs = [...m.versions].filter(v => v.diagram).sort((a, b) => String(b.updated || b.created).localeCompare(String(a.updated || a.created)));
    const lastV = vs[0], week = (() => { const d = new Date(); d.setDate(d.getDate() - 7); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
    const kind0 = saved.kind === 'date' || !lastV ? 'date' : saved.kind && saved.kind !== 'last' && vs.some(v => `v:${v.id}` === saved.kind) ? saved.kind : 'last';
    const secOn = k => !Array.isArray(saved.sections) || saved.sections.includes(k);
    const back = document.createElement('div');
    back.className = 'cf-back';
    back.innerHTML = `<form class="cf share rep" role="dialog" aria-modal="true" aria-labelledby="${id}t" autocomplete="off">
      <h3 id="${id}t">${esc(T('stat.title'))}</h3>
      <p>${esc(T('stat.d.lead'))}</p>
      <label>${esc(T('stat.d.ref'))}<select name="ref">${lastV ? `<option value="last"${kind0 === 'last' ? ' selected' : ''}>${esc(T('stat.d.last', { label: verLabel(lastV), day: fmtDay(lastV.updated || lastV.created) }))}</option>` : ''}${vs.map(v => `<option value="v:${esc(v.id)}"${kind0 === `v:${v.id}` ? ' selected' : ''}>${esc(`${verLabel(v)} · ${fmtDay(v.updated || v.created)}`)}</option>`).join('')}<option value="date"${kind0 === 'date' ? ' selected' : ''}>${esc(T('stat.d.date'))}</option></select></label>
      <label data-st="day">${esc(T('stat.d.day'))}<input type="date" name="day" value="${esc(week)}"></label>
      <fieldset class="sh-views"><legend>${esc(T('stat.d.sections'))}</legend>${ST_KEYS.map(k => `<label class="sh-chk"><input type="checkbox" name="sec" value="${k}"${secOn(k) ? ' checked' : ''}>${esc(T(`stat.s.${k}`))}</label>`).join('')}</fieldset>
      <label>${esc(T('stat.d.preview'))}<textarea name="prev" rows="12" readonly></textarea></label>
      <p class="sh-err" role="alert" data-st="msg"></p>
      <div class="cf-actions"><button type="button" class="btn" data-st="no">${esc(T('ver.cf.cancel'))}</button><button type="button" class="btn" data-st="copy">${esc(T('stat.d.copy'))}</button><button type="button" class="btn" data-st="md">${esc(T('stat.d.md'))}</button><button type="button" class="btn primary" data-st="html">${esc(T('stat.d.html'))}</button></div>
    </form>`;
    const form = back.querySelector('form'), msg = form.querySelector('[data-st="msg"]');
    const close = () => { document.removeEventListener('keydown', key, true); back.remove(); prev?.focus?.(); };
    const key = ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); } };
    const spec = () => { const r = form.elements.ref.value; return r === 'date' ? { kind: 'date', day: form.elements.day.value } : r === 'last' ? { kind: 'last' } : { kind: 'version', id: r.slice(2) }; };
    const keys = () => [...form.querySelectorAll('input[name="sec"]:checked')].map(i => i.value);
    const out = fmt => statusOutput({ ...spec(), sections: keys(), format: fmt });
    const ok = () => !!statusReport(spec()).data.baseDay;
    const sync = () => {
      form.querySelector('[data-st="day"]').hidden = form.elements.ref.value !== 'date';
      const r = statusReport(spec()), have = new Set(r.text.sections.map(x => x.k));
      form.querySelectorAll('input[name="sec"]').forEach(i => { i.disabled = !have.has(i.value); i.parentElement.classList.toggle('rep-none', !have.has(i.value)); });
      form.elements.prev.value = statusOutput({ ...spec(), sections: keys(), format: 'text' });
      form.querySelectorAll('[data-st="copy"],[data-st="md"],[data-st="html"]').forEach(b => { b.disabled = !r.data.baseDay; });
      msg.textContent = '';
    };
    form.addEventListener('change', () => { store.set('statusReport', { kind: form.elements.ref.value === 'date' ? 'date' : form.elements.ref.value, sections: keys() }); sync(); });
    form.addEventListener('click', ev => {
      const b = ev.target.closest('[data-st]');
      if (!b || b.tagName !== 'BUTTON') return;
      if (b.dataset.st === 'no') close();
      else if (!ok()) msg.textContent = T('stat.empty');
      else if (b.dataset.st === 'copy') {
        const txt = out('text'), fallback = () => { form.elements.prev.select(); try { document.execCommand('copy'); toast(T('toast.copied')); } catch { toast(T('toast.copyFail')); } };
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(txt).then(() => toast(T('toast.copied')), fallback); else fallback();
      } else if (b.dataset.st === 'md') { download(out('md'), fileName('md', 'status'), 'text/markdown;charset=utf-8'); toast(T('stat.d.done'), 3000); }
      else if (b.dataset.st === 'html') { download(out('html'), fileName('html', 'status'), 'text/html;charset=utf-8'); toast(T('stat.d.done'), 3000); }
    });
    back.addEventListener('mousedown', ev => { if (ev.target === back) close(); });
    document.addEventListener('keydown', key, true);
    document.body.appendChild(back);
    sync();
    form.elements.ref.focus();
  }

  /* ---------- espacio de trabajo: una carpeta con varios diagramas (src/workspace.js) ---------- */
  // WS.dir = { name, handle } (handle = null si la carpeta se leyó con <input webkitdirectory>: solo lectura); WS.index = resultado de scan();
  // WS.read(nombre) → texto; WS.base = snapshot() del diagrama al abrirlo o guardarlo desde la carpeta (si cambió, abrir otro pide confirmar)
  const WS = { dir: null, index: null, read: null, base: null, file: '', view: 'list' };   // view: 'list' | 'map'
  const wsLib = () => window.DiagramonWorkspace;
  function ensureDocId() { const L = wsLib(); if (L && !S.model.docId) S.model.docId = L.newDocId(); return S.model.docId || ''; }
  const wsWritable = () => !!WS.dir?.handle;
  const wsShared = () => WS.index?.manifest?.shared || {};
  // Cada diagrama sigue siendo autónomo: lo compartido se añade al diagrama abierto (los ids los asigna el diagrama) y se publica desde él
  const WS_LISTS = {   // cómo se lee y se cambia cada lista en el diagrama abierto
    stakeholders: { get: () => S.model.stakeholders || [], clean: raw => cleanStakeholders(raw, S.model), set: l => { if (l.length) S.model.stakeholders = l; else delete S.model.stakeholders; } },
    decisions: { get: () => S.model.decisions || [], clean: raw => cleanDecisions(raw, S.model), set: l => { S.model.decisions = l; } },
    datasets: { get: () => S.model.datasets || [], clean: raw => cleanCatalog(raw, S.model, dsHelpers()), set: l => { if (l.length) S.model.datasets = l; else delete S.model.datasets; } }
  };
  function wsShareAdd() {
    const L = wsLib(), shared = wsShared(), res = {}, plan = [];
    L.SHARED_KINDS.forEach(kind => {
      const cur = WS_LISTS[kind].get(), m = L.mergeShared(kind, cur, shared), list = WS_LISTS[kind].clean(m.list);
      res[kind] = Math.max(0, list.length - cur.length);
      if (res[kind]) plan.push([kind, list, cur.length]);
    });
    if (!plan.length) return toast(T('ws.sh.nothing'), 2600);
    pushHistory();
    plan.forEach(([kind, list, n0]) => {
      if (kind === 'decisions') { const by = adrAuthor(); list.slice(n0).forEach(nd => { nd.history = [{ status: nd.status, date: nd.date, ...(by ? { by } : {}) }]; }); }   // alta = primera entrada del historial
      WS_LISTS[kind].set(list);
    });
    changed(true); renderInspector();
    if (typeof renderAdr === 'function') renderAdr(true);
    if (typeof renderPeople === 'function') renderPeople(true);
    toast(T('ws.sh.added', res), 3600);
    wsRender();
  }
  async function wsShareOut() {
    const L = wsLib(), msg = $('#ws-msg'), kinds = [...document.querySelectorAll('#ws-dialog input[name="wssh"]:checked')].map(i => i.value).filter(k => L.SHARED_KINDS.includes(k));
    if (!wsWritable() || !kinds.length) return;
    if (msg) msg.textContent = '';
    try {
      let raw = {};
      try { const t = await (await (await WS.dir.handle.getFileHandle(L.MANIFEST)).getFile()).text(); const o = JSON.parse(t); if (o && typeof o === 'object' && !Array.isArray(o)) raw = o; } catch { /* sin manifiesto (o ilegible): se crea uno */ }
      const shared = L.cleanShared(raw.shared), res = {};
      kinds.forEach(kind => { const r = L.shareOut(kind, shared, WS_LISTS[kind].get()); res[kind] = r.added + r.updated; if (r.list.length) shared[kind] = r.list; });
      const w = await (await WS.dir.handle.getFileHandle(L.MANIFEST, { create: true })).createWritable();
      await w.write(`${JSON.stringify({ ...raw, shared }, null, 2)}\n`);
      await w.close();
      await wsRefresh();
      toast(T('ws.sh.shared', res), 3600);
    } catch { if (msg) msg.textContent = T('ws.err.save'); }
    wsRender();
  }
  const wsLiveLinks = () => wsLib().summarize({ nodes: S.model.nodes }, '').links;
  const wsLineage = () => (WS.index && S.model.docId ? wsLib().lineage(WS.index.diagrams, { docId: S.model.docId, title: S.model.title, flows: wsLib().flowsOf(S.model) }) : null);
  // Hallazgo bajo: un componente apunta a un diagrama que no está en la carpeta abierta (solo mientras hay una carpeta abierta)
  addFindingSource('workspace', m => {
    if (!WS.index) return [];
    const ids = new Set([...WS.index.diagrams.map(d => d.docId).filter(Boolean), m.docId].filter(Boolean));
    const out = m.nodes.filter(n => n.ref && !ids.has(n.ref.doc)).map(n => ({ id: `workspace:ref-missing:node:${n.id}`, source: 'workspace', rule: 'ws.ref-missing', severity: 'low', target: { kind: 'node', id: n.id }, title: T('ws.f.missing.t', n.label), fix: T('ws.f.missing.fix') }));
    const lin = m === S.model ? wsLineage() : null, title = id => WS.index.diagrams.find(d => d.docId === id)?.title || id;   // el linaje es del diagrama abierto
    (lin ? lin.issues : []).forEach(x => {
      if (x.kind === 'multi' ? !x.docs.includes(m.docId) : x.docId !== m.docId) return;
      const e = (m.edges || []).find(e => (e.datasets || []).some(d => dsKey(d) === dsKey(x.ds)));
      out.push({ id: `workspace:ds-${x.kind}:${dsKey(x.ds)}:${x.node || ''}`, source: 'workspace', rule: `ws.ds-${x.kind}`, severity: 'low', target: x.node ? { kind: 'node', id: x.node } : e ? { kind: 'edge', id: e.id } : { kind: 'node', id: '' },
        title: T(`ws.f.${x.kind}.t`, { ds: x.ds, node: x.label, to: title(x.to), others: (x.docs || []).filter(d => d !== m.docId).map(title).join(', ') }), fix: T(`ws.f.${x.kind}.fix`) });
    });
    return out;
  });
  async function wsFromHandle(handle) {
    const L = wsLib(), files = [];
    for await (const [name, h] of handle.entries()) {
      if (h.kind !== 'file' || !(name === L.MANIFEST || /\.json$/i.test(name))) continue;
      const f = await h.getFile();
      files.push({ name, size: f.size, text: f.size > L.MAX_BYTES ? '' : await f.text() });
    }
    return files;
  }
  const wsFromInput = async fileList => {   // solo los archivos de la carpeta elegida, sin subcarpetas
    const L = wsLib(), byName = new Map(), files = [];
    for (const f of [...fileList]) {
      const parts = String(f.webkitRelativePath || '').split('/');
      if (parts.length !== 2 || !(parts[1] === L.MANIFEST || /\.json$/i.test(parts[1]))) continue;
      byName.set(parts[1], f);
      files.push({ name: parts[1], size: f.size, text: f.size > L.MAX_BYTES ? '' : await f.text() });
    }
    return { files, byName, folder: String(fileList[0]?.webkitRelativePath || '').split('/')[0] };
  };
  async function wsRefresh() {
    const L = wsLib();
    const files = await wsFromHandle(WS.dir.handle);
    WS.index = L.scan(files);
    WS.read = async name => (await (await WS.dir.handle.getFileHandle(name)).getFile()).text();
  }
  async function wsPick() {
    try {
      if (typeof window.showDirectoryPicker === 'function') {
        const h = await window.showDirectoryPicker({ mode: 'readwrite', id: 'diagramon-workspace' });
        WS.dir = { name: h.name, handle: h };
        await wsRefresh();
        wsRender();
      } else $('#ws-dir').click();
    } catch (e) { if (e?.name !== 'AbortError') { const m = $('#ws-msg'); if (m) m.textContent = T('ws.err.pick'); } }
  }
  $('#ws-dir').addEventListener('change', async ev => {
    const list = [...ev.target.files]; ev.target.value = '';
    if (!list.length) return;
    const r = await wsFromInput(list);
    WS.dir = { name: r.folder, handle: null };
    WS.index = wsLib().scan(r.files);
    WS.read = async name => (r.byName.get(name) ? r.byName.get(name).text() : '');
    wsRender();
  });
  async function wsOpen(name) {
    const L = wsLib(), msg = $('#ws-msg');
    if (msg) msg.textContent = '';
    if (WS.base !== snapshot() && !(await confirmBox({ title: T('ws.cf.title'), text: T('ws.cf.text'), ok: T('ws.cf.ok'), cancel: T('ver.cf.cancel') }))) return;
    let raw = null;
    try { raw = JSON.parse(await WS.read(name)); } catch { /* ilegible */ }
    if (!L.isDiagram(raw)) { if (msg) msg.textContent = T('ws.err.read', name); return; }
    S.sel = null;
    setModel(raw, { history: true, animate: true, fit: true });
    WS.base = snapshot(); WS.file = name;
    toast(T('ws.opened', S.model.title));
    wsRender();
  }
  async function wsSave() {
    const L = wsLib(), msg = $('#ws-msg');
    if (!wsWritable()) return;
    if (msg) msg.textContent = '';
    try {
      const id = ensureDocId(), ix = WS.index.diagrams, hit = ix.find(x => x.docId === id && !x.dupDocId) || (WS.file && ix.find(x => x.name === WS.file && !x.docId));   // mismo docId, o el archivo sin docId del que se abrió
      const name = hit ? hit.name : L.fileNameFor(S.model.title, [...ix, ...WS.index.skipped].map(x => x.name));
      if (hit && !(await confirmBox({ title: T('ws.cf.overTitle', name), text: T('ws.cf.overText'), ok: T('ws.cf.overOk'), cancel: T('ver.cf.cancel') }))) return;
      const w = await (await WS.dir.handle.getFileHandle(name, { create: true })).createWritable();
      await w.write(serialize(S.model, true));
      await w.close();
      WS.base = snapshot(); WS.file = name;
      await wsRefresh();
      toast(T('ws.saved', name));
    } catch { if (msg) msg.textContent = T('ws.err.save'); }
    wsRender();
  }
  const wsTrim = (t, n) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
  // Mapa de sistemas: una caja por diagrama con id y una flecha por cada enlace de componente; clic o Enter abre el diagrama
  function wsMapHtml() {
    const L = wsLib(), cur = S.model.docId || '', ix = WS.index;
    const map = L.systemsMap(ix.diagrams, cur ? { docId: cur, title: S.model.title, nodes: S.model.nodes.length, links: wsLiveLinks() } : null);
    const title = id => map.nodes.find(n => n.docId === id)?.title || ix.diagrams.find(d => d.docId === id)?.title || id;
    const notes = [map.unlinkable ? `<p class="ws-dir">${esc(T('ws.map.unlinkable', map.unlinkable))}</p>` : '', ...map.missing.map(x => `<p class="ws-dir"><span class="ws-warn">⚠</span> ${esc(T('ws.map.missing', { from: title(x.from), via: x.via.join(', ') }))}</p>`)].join('');
    if (!map.nodes.length) return `<p class="ws-dir">${esc(T('ws.map.empty'))}</p>${notes}`;
    const g = L.layoutMap(map), byId = new Map(map.nodes.map(n => [n.docId, n]));
    const arrows = g.arrows.map(a => {
      const dx = a.same ? 36 + (a.from < a.to ? 0 : 14) : Math.max(24, Math.abs(a.x2 - a.x1) / 2);
      const d = a.same ? `M${a.x1} ${a.y1} C${a.x1 + dx} ${a.y1} ${a.x2 + dx} ${a.y2} ${a.x2} ${a.y2}` : `M${a.x1} ${a.y1} C${a.x1 + (a.x2 > a.x1 ? dx : -dx)} ${a.y1} ${a.x2 + (a.x2 > a.x1 ? -dx : dx)} ${a.y2} ${a.x2} ${a.y2}`;
      return `<path class="ws-arrow" d="${d}" marker-end="url(#ws-arr)"><title>${esc(`${title(a.from)} → ${title(a.to)}: ${a.via.join(', ')}`)}</title></path>`;
    }).join('');
    const boxes = g.boxes.map(b => {
      const n = byId.get(b.docId);
      return `<g class="ws-box${b.docId === cur ? ' cur' : ''}" data-ws-doc="${esc(b.docId)}" tabindex="0" role="button" aria-label="${esc(`${T('ws.open')}: ${n.title}`)}"><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="10"/><text x="${b.x + 12}" y="${b.y + 24}" class="ws-bt">${esc(wsTrim(n.title, 26))}</text><text x="${b.x + 12}" y="${b.y + 42}" class="ws-bs">${esc(T('ws.map.sub', { n: n.nodes, unsaved: n.unsaved }))}</text></g>`;
    }).join('');
    return `<p class="ws-dir">${esc(T('ws.map.hint'))}</p><svg class="ws-map" viewBox="0 0 ${g.width} ${g.height}" width="${g.width}" role="group" aria-label="${esc(T('ws.map.aria'))}"><defs><marker id="ws-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z"/></marker></defs>${arrows}${boxes}</svg>${notes}`;
  }
  // Linaje entre diagramas: los conjuntos de datos que aparecen en más de un diagrama, quién los produce y quién los consume
  function wsLineageHtml() {
    const L = wsLib(), cur = S.model.docId || '', ix = WS.index;
    const lin = L.lineage(ix.diagrams, cur ? { docId: cur, title: S.model.title, flows: L.flowsOf(S.model) } : null);
    const title = id => ix.diagrams.find(d => d.docId === id)?.title || (id === cur ? S.model.title : id);
    const role = u => `<li><span>${esc(u.title)}</span> <small>${esc(T(u.produces ? 'ws.lin.produces' : 'ws.lin.consumes'))}</small></li>`;
    const rows = lin.datasets.map(r => `<tr><th scope="row">${esc(r.name)}</th><td><ul class="ws-lin">${r.uses.slice().sort((a, b) => b.produces - a.produces).map(role).join('')}</ul></td></tr>`).join('');
    const issues = lin.issues.map(x => `<p class="ws-dir"><span class="ws-warn">⚠</span> ${esc(T(`ws.f.${x.kind}.t`, { ds: x.ds, node: x.label, to: title(x.to), others: (x.docs || []).map(title).join(', ') }))} <small>(${esc(title(x.docId))})</small></p>`).join('');
    return `<p class="ws-dir">${esc(T('ws.lin.hint'))}</p>${rows ? `<table class="ws-lint"><thead><tr><th>${esc(T('ws.lin.ds'))}</th><th>${esc(T('ws.lin.in'))}</th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="ws-dir">${esc(T('ws.lin.empty'))}</p>`}${issues}${cur ? '' : `<p class="ws-dir">${esc(T('ws.lin.unsaved'))}</p>`}`;
  }
  // Cartera: un Excel con una fila por diagrama de la carpeta y otra hoja con los conjuntos de datos compartidos; el diagrama abierto se lee de pantalla, los demás de su archivo
  async function wsPortfolio() {
    const L = wsLib(), X = window.DiagramonXlsx, msg = $('#ws-msg'), ix = WS.index, cur = S.model.docId || '', bad = [], rows = [];
    if (msg) msg.textContent = '';
    try {
      if (!X || !ix) throw new Error('no workspace');
      for (const d of ix.diagrams) {
        let m = S.model;
        if (!((cur && d.docId === cur && !d.dupDocId) || d.name === WS.file)) {
          try { m = normalize(migrate(JSON.parse(await WS.read(d.name))).raw); } catch { bad.push(d.name); continue; }
        }
        const f = { high: 0, medium: 0, low: 0 };
        findingsOf(m).filter(x => !x.dismissed).forEach(x => { f[x.severity === 'critical' || x.severity === 'high' ? 'high' : x.severity === 'medium' ? 'medium' : 'low']++; });
        rows.push([m.title, d.name, m.nodes.length, m.edges.length, (m.phases || []).length, m.nodes.some(hasCost) ? round2(monthlyTotal(m.nodes)) : '', f.high, f.medium, f.low,
          (m.decisions || []).length, (m.stakeholders || []).length, (m.datasets || []).length, new Set(m.nodes.filter(n => n.ref).map(n => n.ref.doc)).size]);
      }
      const lin = L.lineage(ix.diagrams, cur ? { docId: cur, title: S.model.title, flows: L.flowsOf(S.model) } : null), dsRows = [];
      lin.datasets.forEach(r => r.uses.forEach(u => dsRows.push([r.name, u.title, T(u.produces ? 'ws.lin.produces' : 'ws.lin.consumes')])));
      const cols = [['title'], ['file'], ['nodes', 'int'], ['edges', 'int'], ['phases', 'int'], ['cost', 'money'], ['high', 'int'], ['medium', 'int'], ['low', 'int'], ['decisions', 'int'], ['stakeholders', 'int'], ['datasets', 'int'], ['links', 'int']];
      const sheets = [{ name: T('ws.pf.sheet.diagrams'), head: cols.map(([k]) => T(`ws.pf.c.${k}`)), rows, fmt: cols.map(([, f]) => f || null) }];
      if (dsRows.length) sheets.push({ name: T('ws.pf.sheet.datasets'), head: [T('ws.lin.ds'), T('ws.pf.c.title'), T('ws.pf.c.role')], rows: dsRows, fmt: [null, null, null] });
      const slug = fold(ix.manifest?.name || WS.dir.name || '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace';
      download(X.blob(sheets, { title: `${ix.manifest?.name || WS.dir.name} · ${T('ws.pf.title')}`, creator: 'Diagramon' }), `${slug}-portfolio.xlsx`, X.MIME);
      toast(bad.length ? T('ws.pf.partial', { n: rows.length, bad: bad.length }) : T('toast.exported', { name: T('ws.pf.title') }));
    } catch (e) { console.error(e); if (msg) msg.textContent = T('toast.exportFail'); }
  }
  function wsRender() {
    const box = $('#ws-body');
    if (!box) return;
    const L = wsLib(), d = WS.dir, ix = WS.index, cur = S.model.docId || '';
    $('#ws-save').hidden = !wsWritable();
    $('#ws-refresh').hidden = !wsWritable();
    $('#ws-tab-list').setAttribute('aria-pressed', String(WS.view === 'list'));
    $('#ws-tab-map').setAttribute('aria-pressed', String(WS.view === 'map'));
    $('#ws-tab-lineage').setAttribute('aria-pressed', String(WS.view === 'lineage'));
    $('#ws-tabs').hidden = !d || !ix;
    $('#ws-portfolio').hidden = !d || !ix || !ix.diagrams.length;
    if (!d || !ix) { box.innerHTML = `<p class="ws-dir">${esc(T('ws.none'))}</p>`; return; }
    if (WS.view === 'map') { box.innerHTML = wsMapHtml(); return; }
    if (WS.view === 'lineage') { box.innerHTML = wsLineageHtml(); return; }
    const rows = ix.diagrams.map(x => {
      const here = (cur && x.docId === cur && !x.dupDocId) || x.name === WS.file;
      return `<li${here ? ' class="cur"' : ''}><div class="ws-t"><b>${esc(x.title)}</b><small>${esc(T('ws.meta', x))}${x.dupDocId ? ` · <span class="ws-warn">${esc(T('ws.dup'))}</span>` : ''}</small></div>${here ? `<span class="ws-chip">${esc(T('ws.current'))}</span>` : ''}<button type="button" class="btn small" data-ws-open="${esc(x.name)}">${esc(T('ws.open'))}</button></li>`;
    }).join('');
    const sh = wsShared(), cnt = k => (sh[k] || []).length, mine = k => WS_LISTS[k].get().length;
    const shared = `<fieldset class="sh-views ws-shared"><legend>${esc(T('ws.sh.title'))}</legend><p class="ws-dir">${esc(T('ws.sh.sum', { s: cnt('stakeholders'), d: cnt('decisions'), t: cnt('datasets') }))}</p>
      <div class="ws-bar"><button type="button" class="btn" id="ws-sh-add"${L.SHARED_KINDS.some(k => cnt(k)) ? '' : ' disabled'}>${esc(T('ws.sh.add'))}</button></div>${wsWritable() ? `<div class="ws-bar">${L.SHARED_KINDS.map(k => `<label class="sh-chk"><input type="checkbox" name="wssh" value="${k}"${mine(k) ? ' checked' : ' disabled'}>${esc(T(`ws.sh.k.${k}`, mine(k)))}</label>`).join('')}<button type="button" class="btn" id="ws-sh-out">${esc(T('ws.sh.out'))}</button></div>` : ''}</fieldset>`;
    box.innerHTML = `<p class="ws-dir">${esc(T('ws.dir', { folder: ix.manifest?.name || d.name, n: ix.diagrams.length, ro: !wsWritable() }))}${ix.skipped.length ? ` · ${esc(T('ws.skipped', ix.skipped.length))}` : ''}</p>${rows ? `<ul class="ws-list">${rows}</ul>` : `<p class="ws-dir">${esc(T('ws.empty'))}</p>`}${shared}`;
  }
  function openWorkspaceDialog() {
    if (P || $('#ws-dialog')) return;
    const prev = document.activeElement, id = `ws${Date.now()}`;
    const back = document.createElement('div');
    back.className = 'cf-back'; back.id = 'ws-dialog';
    back.innerHTML = `<form class="cf share rep ws" role="dialog" aria-modal="true" aria-labelledby="${id}t" autocomplete="off">
      <h3 id="${id}t">${esc(T('ws.title'))}</h3>
      <p>${esc(T('ws.lead'))}</p>
      <div class="ws-bar"><button type="button" class="btn" id="ws-pick">${esc(T('ws.pick'))}</button><button type="button" class="btn" id="ws-refresh" hidden>${esc(T('ws.refresh'))}</button><button type="button" class="btn" id="ws-save" hidden>${esc(T('ws.save'))}</button><button type="button" class="btn" id="ws-portfolio" hidden>${esc(T('ws.pf.btn'))}</button></div>
      <div class="ws-bar" id="ws-tabs" hidden><button type="button" class="btn" id="ws-tab-list" aria-pressed="true">${esc(T('ws.tab.list'))}</button><button type="button" class="btn" id="ws-tab-map" aria-pressed="false">${esc(T('ws.tab.map'))}</button><button type="button" class="btn" id="ws-tab-lineage" aria-pressed="false">${esc(T('ws.tab.lineage'))}</button></div>
      <div id="ws-body"></div>
      <p class="sh-err" role="alert" id="ws-msg"></p>
      <div class="cf-actions"><button type="button" class="btn" id="ws-close">${esc(T('ws.close'))}</button></div>
    </form>`;
    const close = () => { document.removeEventListener('keydown', key, true); back.remove(); prev?.focus?.(); };
    const key = ev => { if (ev.key === 'Escape' && !document.querySelector('.cf-back:not(#ws-dialog)')) { ev.preventDefault(); ev.stopPropagation(); close(); } };
    back.addEventListener('mousedown', ev => { if (ev.target === back) close(); });
    back.addEventListener('click', async ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.id === 'ws-close') close();
      else if (b.id === 'ws-pick') wsPick();
      else if (b.id === 'ws-refresh') { try { await wsRefresh(); } catch { $('#ws-msg').textContent = T('ws.err.pick'); } wsRender(); }
      else if (b.id === 'ws-save') wsSave();
      else if (b.id === 'ws-portfolio') wsPortfolio();
      else if (b.id === 'ws-sh-add') wsShareAdd();
      else if (b.id === 'ws-sh-out') wsShareOut();
      else if (b.id === 'ws-tab-list' || b.id === 'ws-tab-map' || b.id === 'ws-tab-lineage') { WS.view = b.id === 'ws-tab-map' ? 'map' : b.id === 'ws-tab-lineage' ? 'lineage' : 'list'; wsRender(); }
      else if (b.dataset.wsOpen) wsOpen(b.dataset.wsOpen);
    });
    const openDoc = async el => {   // desde el mapa: la caja del diagrama abierto no hace nada; las demás lo abren
      const id = el?.dataset.wsDoc, d = id && WS.index.diagrams.find(x => x.docId === id && !x.dupDocId);
      if (d && id !== S.model.docId) { await wsOpen(d.name); if (WS.file === d.name) { WS.view = 'list'; wsRender(); } }
    };
    back.addEventListener('click', ev => openDoc(ev.target.closest('[data-ws-doc]')));
    back.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.matches?.('[data-ws-doc]')) { ev.preventDefault(); openDoc(ev.target); } });
    document.addEventListener('keydown', key, true);
    document.body.appendChild(back);
    wsRender();
    back.querySelector('#ws-pick').focus();
  }
  $('#btn-workspace').addEventListener('click', openWorkspaceDialog);

  /* ---------- diseño frente a realidad (src/drift.js) ----------
     Se cargan archivos de infraestructura como código (los mismos que se importan), se comparan con el diagrama y se decide fila por fila.
     Lo cargado vive solo en esta sesión; en el diagrama quedan únicamente el enlace `iac` de cada componente y las diferencias aceptadas (m.deviations). */
  const DRIFT = { reality: null, names: [] };
  const driftLib = () => window.DiagramonDrift;
  const driftGet = (m, n, f) => (f === 'region' ? govOf(n, 'region', m).value || undefined : n[f]);
  const driftCmp = (m = S.model) => (DRIFT.reality && driftLib() ? driftLib().compare(m.nodes, DRIFT.reality, { get: (n, f) => driftGet(m, n, f) }) : null);
  const driftKey = (node, field) => `${encodeURIComponent(node)}~${field}`;   // para los atributos data-*: el id puede llevar cualquier carácter
  const driftSplit = k => { const i = k.lastIndexOf('~'); return [decodeURIComponent(k.slice(0, i)), k.slice(i + 1)]; };
  const driftShow = (f, v) => (v === true ? T('sec.yes') : v === false ? T('sec.no') : f === 'exposure' ? T(`sec.expo.${v}`) : String(v ?? ''));
  const driftAccepted = (m, d) => (m.deviations || []).find(x => x.node === d.design && x.field === d.field && x.value === String(d.realityValue));
  // Diferencias abiertas y componentes enlazados que ya no existen en lo desplegado: hallazgos mientras haya una comparación cargada
  addFindingSource('drift', m => {
    const c = m === S.model ? driftCmp(m) : null;
    if (!c) return [];
    const by = new Map(m.nodes.map(n => [n.id, n]));
    return [
      ...c.diffs.filter(d => !driftAccepted(m, d)).map(d => ({ id: `drift:diff:${d.design}:${d.field}`, source: 'drift', rule: 'drift.diff', severity: d.field === 'exposure' || d.field === 'backup' ? 'medium' : 'low', target: { kind: 'node', id: d.design },
        title: T('dr.f.diff.t', { node: by.get(d.design)?.label || d.design, field: T(`dr.field.${d.field}`), design: driftShow(d.field, d.designValue), real: driftShow(d.field, d.realityValue) }), fix: T('dr.f.diff.fix') })),
      ...c.missing.map(id => ({ id: `drift:missing:${id}`, source: 'drift', rule: 'drift.missing', severity: 'low', target: { kind: 'node', id }, title: T('dr.f.missing.t', by.get(id)?.label || id), fix: T('dr.f.missing.fix') }))
    ];
  });
  function driftMutate(fn) {
    pushHistory();
    fn(S.model);
    changed(true); renderInspector();
    driftRender();
  }
  function driftHtml() {
    const m = S.model, c = driftCmp(m);
    if (!c) return `<p class="ws-dir">${esc(T('dr.none'))}</p>`;
    const byD = new Map(m.nodes.map(n => [n.id, n])), byR = new Map(DRIFT.reality.map(r => [r.id, r]));
    const open = c.diffs.filter(d => !driftAccepted(m, d)), acc = c.diffs.filter(d => driftAccepted(m, d));
    const rl = r => `${esc(r.label)} <small>${esc(r.iac || '')}</small>`;
    const head = `<p class="ws-dir">${esc(T('dr.sum', { pairs: c.pairs.length, diffs: open.length, props: c.proposals.length, missing: c.missing.length, extra: c.extra.length, names: DRIFT.names.join(', ') }))}</p>`;
    const sec = (title, body) => (body ? `<fieldset class="sh-views dr-sec"><legend>${esc(title)}</legend>${body}</fieldset>` : '');
    const rows = (list, row) => (list.length ? `<ul class="ws-list dr-list">${list.slice(0, 200).map(row).join('')}</ul>` : '');
    const diffs = rows(open, d => {
      const n = byD.get(d.design), k = driftKey(d.design, d.field);
      return `<li><div class="ws-t"><b>${esc(n.label)}</b><small>${esc(T(`dr.field.${d.field}`))}: ${esc(T('dr.design'))} <b>${esc(driftShow(d.field, d.designValue))}</b> · ${esc(T('dr.deployed'))} <b>${esc(driftShow(d.field, d.realityValue))}</b></small>
        <span class="dr-acc"><input type="text" maxlength="300" data-dr-reason="${esc(k)}" placeholder="${esc(T('dr.reason'))}" aria-label="${esc(T('dr.reason'))}"><button type="button" class="btn small" data-dr-accept="${esc(k)}">${esc(T('dr.accept'))}</button></span></div>
        <button type="button" class="btn small" data-dr-adopt="${esc(k)}">${esc(T('dr.adopt'))}</button></li>`;
    });
    const accepted = rows(acc, d => {
      const n = byD.get(d.design), a = driftAccepted(m, d), k = driftKey(d.design, d.field);
      return `<li><div class="ws-t"><b>${esc(n.label)}</b><small>${esc(T(`dr.field.${d.field}`))}: ${esc(driftShow(d.field, d.designValue))} → ${esc(driftShow(d.field, d.realityValue))} · ${esc(a.reason)}${a.date ? ` · ${esc(fmtDay(a.date))}` : ''}</small></div><button type="button" class="btn small" data-dr-reopen="${esc(k)}">${esc(T('dr.reopen'))}</button></li>`;
    });
    const props = rows(c.proposals, p => `<li><div class="ws-t"><b>${esc(byD.get(p.design).label)}</b><small>${esc(T('dr.maybe'))} ${rl(byR.get(p.reality))}</small></div><button type="button" class="btn small" data-dr-link="${esc(p.design)}" data-dr-to="${esc(p.reality)}">${esc(T('dr.link'))}</button></li>`);
    const missing = rows(c.missing, id => `<li><div class="ws-t"><b>${esc(byD.get(id).label)}</b><small>${esc(T('dr.gone', byD.get(id).iac))}</small></div><button type="button" class="btn small" data-dr-unlink="${esc(id)}">${esc(T('dr.unlink'))}</button></li>`);
    const free = DRIFT.reality.filter(r => c.extra.includes(r.id) || c.proposals.some(p => p.reality === r.id));
    const opts = `<option value="">${esc(T('dr.pick'))}</option>${free.slice(0, 300).map(r => `<option value="${esc(r.id)}">${esc(`${r.label} · ${r.iac || ''}`)}</option>`).join('')}`;
    const unlinked = free.length ? rows(c.unlinked, id => `<li><div class="ws-t"><b>${esc(byD.get(id).label)}</b></div><select data-dr-sel="${esc(id)}" aria-label="${esc(T('dr.pick'))}">${opts}</select><button type="button" class="btn small" data-dr-linksel="${esc(id)}">${esc(T('dr.link'))}</button></li>`) : '';
    const extra = c.extra.length ? `<ul class="dr-extra">${c.extra.slice(0, 200).map(id => `<li>${rl(byR.get(id))}</li>`).join('')}</ul>` : '';
    return head + sec(T('dr.s.diffs'), diffs) + sec(T('dr.s.accepted'), accepted) + sec(T('dr.s.props'), props) + sec(T('dr.s.missing'), missing) + sec(T('dr.s.unlinked'), unlinked) + sec(T('dr.s.extra'), extra)
      + (open.length || c.proposals.length || c.missing.length || c.extra.length || acc.length ? '' : `<p class="ws-dir">${esc(T('dr.clean'))}</p>`);
  }
  function driftRender() { const b = $('#dr-body'); if (b) b.innerHTML = driftHtml(); refreshFindings?.(); }
  async function driftLoad(fileList) {
    const msg = $('#dr-msg'), IAC = window.DiagramonIaC;
    if (msg) msg.textContent = '';
    try {
      const files = await Promise.all([...fileList].map(async f => ({ name: f.name || '', text: await f.text() })));
      const res = IAC.convert(files);
      if (!res.nodes) throw new Error('empty');
      DRIFT.reality = res.diagram.nodes; DRIFT.names = files.map(f => f.name);
      driftRender();
    } catch { if (msg) msg.textContent = T('dr.err.read'); }
  }
  function openDriftDialog() {
    if (P || $('#dr-dialog')) return;
    const prev = document.activeElement, id = `dr${Date.now()}`;
    const back = document.createElement('div');
    back.className = 'cf-back'; back.id = 'dr-dialog';
    back.innerHTML = `<form class="cf share rep ws" role="dialog" aria-modal="true" aria-labelledby="${id}t" autocomplete="off">
      <h3 id="${id}t">${esc(T('dr.title'))}</h3>
      <p>${esc(T('dr.lead'))}</p>
      <div class="ws-bar"><button type="button" class="btn" id="dr-pick">${esc(T('dr.pick.files'))}</button><button type="button" class="btn" id="dr-clear">${esc(T('dr.clear'))}</button></div>
      <div id="dr-body"></div>
      <p class="sh-err" role="alert" id="dr-msg"></p>
      <div class="cf-actions"><button type="button" class="btn" id="dr-close">${esc(T('ws.close'))}</button></div>
    </form>`;
    const close = () => { document.removeEventListener('keydown', key, true); back.remove(); prev?.focus?.(); };
    const key = ev => { if (ev.key === 'Escape' && !document.querySelector('.cf-back:not(#dr-dialog)')) { ev.preventDefault(); ev.stopPropagation(); close(); } };
    const split = driftSplit;
    const node = i => S.model.nodes.find(n => n.id === i);
    back.addEventListener('mousedown', ev => { if (ev.target === back) close(); });
    back.addEventListener('click', ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      const d = b.dataset;
      if (b.id === 'dr-close') close();
      else if (b.id === 'dr-pick') $('#dr-file').click();
      else if (b.id === 'dr-clear') { DRIFT.reality = null; DRIFT.names = []; driftRender(); }
      else if (d.drLink || d.drLinksel) {
        const from = d.drLink || d.drLinksel, to = d.drTo || back.querySelector(`select[data-dr-sel="${CSS.escape(from)}"]`)?.value, r = DRIFT.reality?.find(x => x.id === to);
        if (r?.iac && node(from)) driftMutate(m => { m.nodes.find(n => n.id === from).iac = r.iac; });
      } else if (d.drUnlink) driftMutate(m => { delete m.nodes.find(n => n.id === d.drUnlink).iac; });
      else if (d.drAdopt) {
        const [nid, f] = split(d.drAdopt), c = driftCmp(), df = c?.diffs.find(x => x.design === nid && x.field === f);
        if (df) driftMutate(m => { m.nodes.find(n => n.id === nid)[f] = f === 'region' ? cleanRegion(df.realityValue) || String(df.realityValue) : df.realityValue; m.deviations = (m.deviations || []).filter(x => !(x.node === nid && x.field === f)); if (!m.deviations.length) delete m.deviations; });
      } else if (d.drAccept) {
        const [nid, f] = split(d.drAccept), c = driftCmp(), df = c?.diffs.find(x => x.design === nid && x.field === f);
        const inp = back.querySelector(`input[data-dr-reason="${CSS.escape(d.drAccept)}"]`), reason = (inp?.value || '').trim();
        if (!reason) { inp?.focus(); $('#dr-msg').textContent = T('dr.err.reason'); return; }
        $('#dr-msg').textContent = '';
        if (df) driftMutate(m => { m.deviations = [...(m.deviations || []).filter(x => !(x.node === nid && x.field === f)), { node: nid, field: f, value: String(df.realityValue), reason: reason.slice(0, 300), date: today() }]; });
      } else if (d.drReopen) {
        const [nid, f] = split(d.drReopen);
        driftMutate(m => { m.deviations = (m.deviations || []).filter(x => !(x.node === nid && x.field === f)); if (!m.deviations.length) delete m.deviations; });
      }
    });
    back.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.matches?.('input[data-dr-reason]')) { ev.preventDefault(); back.querySelector(`button[data-dr-accept="${CSS.escape(ev.target.dataset.drReason)}"]`)?.click(); } });
    document.addEventListener('keydown', key, true);
    document.body.appendChild(back);
    driftRender();
    back.querySelector('#dr-pick').focus();
  }
  $('#dr-file').addEventListener('change', async ev => { const l = [...ev.target.files]; ev.target.value = ''; if (l.length) await driftLoad(l); });
  $('#btn-drift').addEventListener('click', openDriftDialog);

  /* ---------- exportar a otras herramientas (src/export/*.js) ----------
     Cada exportador recibe una copia del diagrama y este contexto, y devuelve { text, ext, mime }. */
  const hexOf = k => {
    const pal = C.palettes[S.palette]?.light || {}, key = COLOR_ALIAS[k] || k;
    return pal[key] || normHex(k);  // los exportadores esperan #RRGGBB
  };
  function exportCtx() {
    const m = S.model, byId = new Map(m.nodes.map(n => [n.id, n]));
    const nodeHex = n => hexOf(n?.color) || hexOf(typeOf(n || {}).color) || hexOf(C.palettes[S.palette]?.accent) || '#8573DB';
    return {
      title: m.title, lang: I.lang,
      direction: (m.direction || C.layout.direction) === 'TB' ? 'TB' : 'LR',
      routing: m.routing === 'elbow' ? 'elbow' : 'curved',
      typeLabel,
      edgeStyleLabel,
      // Estilo ya resuelto (también los propios del diagrama) para los exportadores: { id, label, dash, width, particles, custom, weight }
      edgeStyleInfo: e => { const id = edgeKey(e?.style), c = edgeStyleOf(id); return { id, label: loc(c.label), dash: c.dash || '', width: c.width, particles: c.particles, custom: !!c.custom, color: c.color ? hexOf(c.color) : null, weight: EDGE_W[e?.weight] ? e.weight : '', mult: edgeMult(e) }; },
      color: x => (!x ? '#8573DB' : 'from' in x ? hexOf(x.color) || hexOf(edgeStyleOf(x.style).color) || nodeHex(byId.get(x.from)) : 'type' in x ? nodeHex(x) : hexOf(x.color) || '#776F84'),
      dataLabel: k => (DATA[k] ? { short: loc(DATA[k].short) || k.toUpperCase(), label: loc(DATA[k].label) || k, sensitive: !!DATA[k].sensitive } : { short: String(k).toUpperCase(), label: String(k), sensitive: false }),
      icon: ref => { const i = iconInfo(ref); return i ? { src: i.src, label: i.label } : null; },
      size: n => ({ w: R.width.get(n.id) || nodeWidth(n), h: H }),
      groupBox: id => { const b = R.gbox.get(id); return b ? { x: b.x, y: b.y, w: b.w, h: b.h } : null; },
      ...exportMetaCtx(m)
    };
  }
  /* ---------- exportar a otras herramientas: metadatos, notas, zonas y niveles C4 (común a los tres exportadores) ---------- */
  // meta(x) → [{ key, label, value }] con los campos de gobierno, seguridad y operación (ya heredados y en el idioma de la interfaz)
  function exportMetaCtx(m) {
    const rows = new Map(inventoryRows(m).map(r => [r.id, r]));
    const NODE_KEYS = ['c4', 'owner', 'steward', 'team', 'costCenter', 'region', 'data', 'layer', 'exposure', 'backup', 'sla', 'rpo', 'rto', 'replicas', 'perMonth', 'compliance'];
    const lab = k => T(`inv.c.${k}`);
    const yn = v => T(v ? 'sec.yes' : 'sec.no');
    const meta = x => {
      if (!x) return [];
      const out = [], add = (key, value) => { if (value !== '' && value != null) out.push({ key, label: key === 'threats' ? T('stride.label') : lab(key), value: String(value) }); };
      if ('from' in x) {
        add('data', (x.data || []).map(k => loc(DATA[k]?.short) || String(k).toUpperCase()).join(' '));
        if (typeof x.encrypted === 'boolean') add('encrypted', yn(x.encrypted));
        add('datasets', (x.datasets || []).join(', '));
        if (x.transferOk) add('transferOk', yn(true));
        add('threats', Object.entries(x.threats || {}).map(([k, d]) => `${k}=${T(`stride.st.${d.status}`)}${d.note ? ` (${d.note})` : ''}`).join('; '));
        add('adrs', decisionsOf('edges', x.id, m).map(d => d.id).join(','));
      } else if ('type' in x) {
        const r = rows.get(x.id) || {};
        // Exposición y respaldo deducidos solo cuando aportan: exposición pública o valores puestos a mano
        const skip = k => (k === 'backup' && typeof x.backup !== 'boolean') || (k === 'exposure' && !x.exposure && r.exposure !== T('sec.expo.public'));
        NODE_KEYS.forEach(k => { if (!skip(k)) add(k, r[k]); });
        add('adrs', decisionsOf('nodes', x.id, m).map(d => d.id).join(','));
      } else {
        ['owner', 'steward', 'team', 'costCenter'].forEach(k => add(k, String(x[k] ?? '').trim()));
        add('region', String(x.region ?? '').trim());
        add('layer', x.layer ? layerInfo(x.layer)?.label || x.layer : '');
        add('compliance', Object.entries(x.controls || {}).map(([k, v]) => `${k}=${T(`cmp.${v}`)}`).join(', '));
        add('adrs', decisionsOf('groups', x.id, m).map(d => d.id).join(','));
      }
      return out;
    };
    const hexIn = v => (/#[0-9a-f]{6}\b/i.exec(String(v || '')) || [])[0] || null;
    return {
      meta,
      // Niveles C4: nodos con diagrama interno (por profundidad) y etiqueta de su tipo C4
      levels: scopeList(m).filter(l => l.id).map(l => ({ id: l.id, label: l.label, depth: l.depth, path: l.path })),
      c4Label,
      sevLabel, sevHex: k => ({ low: '#4E9AD8', medium: '#C4A63A', high: '#E0965A', critical: '#E2806F' })[k] || '#C4A63A',
      layerLabel: k => layerInfo(k)?.label || k, layerHex: k => hexIn(DL[k]?.color),
      noteHex: k => hexOf(k) || hexOf('limon') || '#C4A63A',
      // Decisiones (ADR) y hallazgos descartados: los exportadores los escriben como comentarios, atributos o una página aparte
      adrStatus: k => T(`adr.st.${k}`),
      // → [{ id, title, target: { kind, id } | null, reason, by, date }]; un hallazgo que ya no existe sale con título vacío y sin destino
      dismissed: () => {
        const byId = new Map(allFindings(m).map(f => [f.id, f]));
        return Object.entries(m.dismissed || {}).filter(([id]) => byId.get(id)?.source !== 'review').map(([id, d]) => { const f = byId.get(id); return { id, title: f?.title || '', target: f?.target ? { kind: f.target.kind, id: f.target.id } : null, reason: d.reason || '', by: d.by || '', date: d.date || '' }; });
      },
      words: { adrs: T('tab.adr.tip'), adrContext: T('adr.f.context'), adrDecision: T('adr.f.decision'), adrConsequences: T('adr.f.consequences'), adrDeciders: T('adr.f.deciders'), adrStatusL: T('adr.f.status'), adrLinks: T('adr.f.links'), dismissed: T('rep.dismissed'), weightHigh: T('leg.w.high'), weightCritical: T('leg.w.critical'), note: T('insp.note'), zone: T('insp.zone'), trust: T('insp.trust'), threats: T('stride.label'), level: T('inv.c.level') }
    };
  }
  function exportOther(fmt) {
    const fn = window.DiagramonExport?.[fmt];
    if (!fn) return;
    try {
      const model = clone({ ...S.model, versions: undefined, active: undefined });
      const out = fn(model, exportCtx());
      download(out.text, fileName(out.ext), out.mime || 'text/plain');
      toast(T('toast.exported', { name: T(`exp.${fmt}`) }));
    } catch (e) { console.error(e); toast(T('toast.exportFail')); }
  }
  // Contratos de datos (ODCS, src/export/datacontract.js): un archivo por conjunto, o todos en uno (documentos YAML separados por ---)
  const contractYaml = v => { const d = dsFind(v); return d && window.DiagramonContract ? window.DiagramonContract.toODCS(clone(d), clone({ ...S.model, versions: undefined, active: undefined })) : ''; };
  const contractsYaml = () => (S.model.datasets?.length && window.DiagramonContract ? window.DiagramonContract.toODCSAll(clone({ ...S.model, versions: undefined, active: undefined })) : '');
  function saveContract(text, name) {
    if (!text) return toast(T('toast.exportFail'));
    download(text, name, 'application/yaml');
    toast(T('toast.exported', { name: T('exp.contracts') }));
  }
  function exportContract(id) { const d = dsFind(id); if (d) saveContract(contractYaml(d.id), `${fold(d.name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'dataset'}.odcs.yaml`); }
  const exportContracts = () => saveContract(contractsYaml(), 'data-contracts.odcs.yaml');
  function exportJSON() { ensureDocId(); download(serialize(S.model, true), fileName('json'), 'application/json'); toast(T('toast.json')); }
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
  /* ---------- inventario exportable (CSV / Excel) ---------- */
  // Una fila por componente (todos los niveles C4) y varias tablas de apoyo, para CMDB o auditoría. Excel: src/export/xlsx.js (sin librerías).
  // Las ayudas opcionales se protegen con typeof para que la exportación siga funcionando si una función se quita.
  const INV_COMP = [['id'], ['name'], ['detail'], ['type'], ['provider'], ['service'], ['category'], ['c4'], ['level'], ['group'], ['owner'], ['steward'], ['team'], ['costCenter'], ['inherited'], ['region'], ['jurisdiction'],
    ['data'], ['sensitive'], ['layer'], ['exposure'], ['backup'], ['encIn', 'int'], ['encOut', 'int'], ['unencSens', 'int'], ['sla', 'sla'], ['rpo'], ['rto'], ['replicas', 'int'], ['cost', 'money'], ['period'], ['perMonth', 'money'], ['perYear', 'money'],
    ['review'], ['findings', 'int'], ['adrs'], ['compliance'], ['desc']];
  const INV_CONN = [['id'], ['from'], ['to'], ['label'], ['style'], ['weight'], ['custom'], ['encrypted'], ['data'], ['datasets'], ['crossBorder'], ['transferOk'], ['threats', 'int']];
  const INV_TYPE = [['id'], ['label'], ['dash'], ['color'], ['width'], ['particles', 'int'], ['uses', 'int']];
  const INV_GROUP = [['id'], ['name'], ['parent'], ['kind'], ['region'], ['layer'], ['owner'], ['team'], ['costCenter'], ['count', 'int'], ['monthly', 'money']];
  const INV_OWNER = [['team'], ['owners'], ['stewards'], ['components', 'int'], ['monthly', 'money']];
  const INV_ADR = [['id'], ['title'], ['status'], ['date'], ['links']];
  const INV_REQ = [['id'], ['title'], ['kind'], ['priority'], ['status'], ['source'], ['coveredBy'], ['check'], ['result']];
  const INV_RAID = [['id'], ['type'], ['title'], ['status'], ['owner'], ['probability'], ['impact'], ['score'], ['mitigation'], ['due'], ['raised'], ['links'], ['detail']];
  const INV_SH = [['id'], ['name'], ['role'], ['org'], ['raci'], ['versions'], ['inactive']];
  const INV_DS = [['id'], ['name'], ['domain'], ['layer'], ['owner'], ['steward'], ['product'], ['data'], ['format'], ['freshness'], ['e2e'], ['frState'], ['perDay'], ['retention', 'int'], ['estGb'], ['estMonthly', 'money'], ['phase'], ['contractVersion'], ['status'], ['consumers']];
  const INV_DSC = [['dsId'], ['dsName'], ['column'], ['type'], ['key'], ['pii'], ['nullable'], ['desc']], INV_DSQ = [['dsId'], ['dsName'], ['rule'], ['column'], ['param'], ['severity']];   // hojas Columns y Quality del catálogo de datos
  const INV_RADAR = [['radar'], ['radarEos']];   // columnas Radar y Fin de soporte (solo si algún componente coincide con el radar)
  const INV_MIG = [['disposition']];   // columna Disposición (solo si algún componente la tiene)
  const INV_PH = [['phase'], ['until']];   // columnas de fase de componentes y conexiones (solo si el diagrama tiene fases)
  const INV_EST = [['phase'], ['components', 'int'], ['estimated', 'int'], ['days'], ['extraDays'], ['build', 'money'], ['contingency', 'money'], ['total', 'money'], ['cumulative', 'money']];   // hoja Estimación (solo si algo tiene esfuerzo)
  const INV_PHASE = [['id'], ['name'], ['date'], ['goal'], ['components', 'int'], ['added', 'int'], ['retired', 'int'], ['monthly', 'money']];
  const phNm = (m, id) => (id ? m.phases?.find(p => p.id === id)?.name || '' : '');   // nombre de la fase («» si no hay)
  const INV_SIGN = [['kind'], ['object'], ['by'], ['stakeholder'], ['verdict'], ['date'], ['note']];
  const INV_FIND = [['severity'], ['source'], ['rule'], ['title'], ['target'], ['dismissed'], ['reason']];
  const INV_VER = [['name'], ['env'], ['status'], ['author'], ['created'], ['updated'], ['decidedOn']];
  const invYN = v => T(v ? 'sec.yes' : 'sec.no');
  const invNum = v => (v == null || v === '' || !Number.isFinite(+v) ? '' : +v);
  // Filas de componentes: objetos con claves estables (las de INV_COMP)
  function inventoryRows(model = S.model) {
    const m = model, byId = new Map(m.nodes.map(n => [n.id, n])), get = id => byId.get(id);
    const finds = typeof allFindings === 'function' ? allFindings(m).filter(f => !(f.source !== 'review' && m.dismissed?.[f.id])) : [];
    return m.nodes.map(n => {
      const ic = typeof iconInfo === 'function' ? iconInfo(n.icon) : null, cat = ic?.category || typeOf(n).category || '';
      const gv = f => (typeof govOf === 'function' ? govOf(n, f, m) : { value: String(n[f] ?? '').trim(), from: null });
      const inh = ['owner', 'steward', 'team', 'costCenter'].map(f => { const g = gv(f); return g.from ? `${T(`gov.${f}`)} ← ${m.groups.find(x => x.id === g.from)?.label || g.from}` : ''; }).filter(Boolean).join('; ');
      const reg = typeof regionOf === 'function' ? regionOf(n, m).value : cleanRegion(n.region), jur = reg && typeof jurOf === 'function' ? jurOf(reg) : null;
      const ex = typeof exposureOf === 'function' ? exposureOf(n, m).value : n.exposure || '', bk = typeof backupOf === 'function' ? backupOf(n, m).value : typeof n.backup === 'boolean' ? n.backup : null;
      const cls = typeof dataClassesOf === 'function' ? dataClassesOf(n, m) : n.data || [];
      const mine = m.edges.filter(e => e.from === n.id || e.to === n.id);
      const ins = m.edges.filter(e => e.to === n.id || (e.both && e.from === n.id)), outs = m.edges.filter(e => e.from === n.id || (e.both && e.to === n.id));
      const unenc = typeof isInsecure === 'function' ? mine.filter(e => isInsecure(e, get)).length : 0;
      const pc = hasCost(n) ? periodOf(n) : '', pm = hasCost(n) ? round2(perMonth(n)) : '';
      const my = finds.filter(f => f.target?.id === n.id && f.target.kind === 'node').length;
      const ctl = typeof controlsOf === 'function' ? [...controlsOf(n, m)] : [];
      const comp = [...new Set(ctl.map(([k]) => ctlSplit(k)[0]))].map(fw => {
        const st = CTL_STATUS.map(s => [s, ctl.filter(([k, v]) => ctlSplit(k)[0] === fw && v.status === s).length]).filter(x => x[1]);
        return `${ctlInfo(`${fw}:x`).short}: ${st.map(([s, c]) => `${c} ${T(`cmp.${s}`).toLowerCase()}`).join(' / ')}`;
      }).join('; ');
      const grp = typeof groupChain === 'function' ? groupChain(n, m).reverse().map(g => g.label).join(' › ') : '';
      const lvl = typeof scopePath === 'function' && n.in ? scopePath(n.in, m).map(id => byId.get(id)?.label || id).join(' › ') : '';
      const rl = typeof layerOf === 'function' ? layerOf(n).value : n.layer;
      return {
        id: n.id, name: n.label, detail: n.sub || '', type: typeLabel(n.type), provider: ic?.providerLabel || '', service: ic?.label || '', category: cat && typeof I.category === 'function' ? I.category(cat) : cat,
        c4: typeof c4Label === 'function' ? c4Label(n.c4) : '', level: lvl, group: grp,
        owner: gv('owner').value, steward: gv('steward').value, team: gv('team').value, costCenter: gv('costCenter').value, inherited: inh,
        region: reg, jurisdiction: jur ? `${jur.label} (${jur.short})` : '',
        data: cls.map(k => loc(DATA[k]?.short) || String(k).toUpperCase()).join(' '), sensitive: invYN(cls.some(k => DATA[k]?.sensitive)),
        layer: rl && typeof layerInfo === 'function' ? layerInfo(rl)?.label || rl : '', exposure: ex ? T(ex === 'public' ? 'sec.expo.public' : 'sec.expo.internal') : '', backup: bk == null ? '' : invYN(bk),
        encIn: ins.filter(e => e.encrypted === true).length, encOut: outs.filter(e => e.encrypted === true).length, unencSens: unenc,
        sla: invNum(n.sla), rpo: n.rpo == null ? '' : String(n.rpo), rto: n.rto == null ? '' : String(n.rto), replicas: invNum(n.replicas),
        cost: hasCost(n) ? +n.cost : '', period: pc ? T(PERIODS[pc].label) + (pc === 'multi' ? ` · ${T('cost.years', yearsOf(n))}` : '') : '', perMonth: pm, perYear: pm === '' ? '' : round2(perMonth(n) * 12),
        review: n.review ? T(`rev.tag.${reviewState(n.review)}`) : '', findings: my,
        adrs: (m.decisions || []).filter(d => d.links?.nodes?.includes(n.id)).map(d => d.id).join(', '), compliance: comp, desc: n.desc || '',
        ...(typeof radarInfo === 'function' && radarEntries(m).length && m.nodes.some(x => radarOf(x, m)) ? (() => { const i = radarInfo(n, m, today()); return { radar: i ? `${i.name} · ${i.ring.label}` : '', radarEos: i?.eosDay || '' }; })() : {}),
        ...(m.nodes.some(x => x.disposition) ? { disposition: n.disposition && typeof mgInfo === 'function' ? mgInfo(n.disposition).label : '' } : {}),
        ...(n.effort?.length ? { effort: efDaysOf(n.effort) } : {}),   // días-persona del componente (solo si lo tiene)
        ...(m.phases?.length ? { phase: phNm(m, n.phase), until: phNm(m, n.until) } : {})   // fase en la que aparece y en la que se retira (sin fases no hay claves)
      };
    });
  }
  // Todas las tablas del inventario: [{ key, name, head, rows (matrices), fmt }]; las vacías no entran salvo Componentes
  function inventoryTables(model = S.model) {
    const m = model, byId = new Map(m.nodes.map(n => [n.id, n])), nm = id => byId.get(id)?.label || id;
    const mk = (key, cols, rows) => ({ key, name: T(`inv.sheet.${key}`), head: cols.map(([k]) => T(`inv.c.${k}`)), keys: cols.map(([k]) => k), fmt: cols.map(([, f]) => f || null), rows });
    const out = [], comp = inventoryRows(m);
    // Fases (solo si el diagrama las tiene): columnas Fase y Se retira en en componentes y conexiones
    const ph = !!m.phases?.length, cc = [...INV_COMP, ...(m.nodes.some(x => x.disposition) ? INV_MIG : []), ...(radarEntries(m).length && m.nodes.some(x => radarOf(x, m)) ? INV_RADAR : []), ...(ph ? INV_PH : []), ...(m.nodes.some(x => x.effort?.length) ? [['effort']] : [])];
    out.push(mk('components', cc, comp.map(r => cc.map(([k]) => r[k]))));
    // Una fila por fase: lo que hay en ella y lo que entra y sale respecto de la anterior
    if (ph) out.push(mk('phases', INV_PHASE, m.phases.map((p, i) => { const s = phaseStats(m, i, { monthly: x => monthlyTotal(x.nodes), findings: () => [] }), d = phaseDiff(m, i); return [p.id, p.name, p.date || '', p.goal || '', s.nodes, d.added.length, d.retired.length, round2(s.cost)]; })));
    // Estimación por fase (solo si algún componente o fase tiene esfuerzo)
    { const pe = phaseEffort(m, effortHelpers); if (pe) out.push(mk('estimation', INV_EST, pe.rows.map(r => [r.name, r.comps, r.estimated, r.days, r.extraDays, r.cost, r.contingency, r.total, r.cumulative]))); }
    // Conexiones
    const open = typeof strideAll === 'function' ? (() => { try { return strideAll(m).filter(t => t.status === 'open'); } catch { return []; } })() : [];
    const ets = Array.isArray(m.edgeTypes) ? m.edgeTypes : [], etOf = id => ets.find(t => t.id === id); // del modelo que se exporta, no del lienzo
    const lat = m.edges.some(e => e.latency != null && e.latency !== '');   // columna Latencia solo si alguna conexión la tiene
    const conn = m.edges.map(e => {
      const cb = typeof crossBorder === 'function' ? crossBorder(e, byId) : null, ct = etOf(e.style);
      return [e.id || '', nm(e.from), nm(e.to), String(e.label || '').replace(/\s*\n\s*/g, ' '), ct ? loc(ct.label) : edgeStyleLabel(e.style), T(EDGE_W[e.weight] ? `wt.${e.weight}` : 'wt.normal'), invYN(!!ct), e.encrypted === true ? T('enc.yes') : e.encrypted === false ? T('enc.no') : T('enc.unset'),
        (e.data || []).map(k => loc(DATA[k]?.short) || String(k).toUpperCase()).join(' '), (e.datasets || []).join('; '), invYN(!!cb), cb ? invYN(cb.approved) : '', open.filter(t => t.e === e || t.e.id === e.id).length,
        ...(lat ? [e.latency || ''] : []), ...(ph ? [phNm(m, e.phase), phNm(m, e.until)] : [])];
    });
    const cn = [...INV_CONN, ...(lat ? [['latency']] : []), ...(ph ? INV_PH : [])];
    if (conn.length) out.push(mk('connections', cn, conn));
    // Tipos de conexión propios (solo si el diagrama los tiene)
    if (ets.length) out.push(mk('types', INV_TYPE, ets.map(t => [t.id, loc(t.label), t.dash || '', t.color || '', t.width ?? '', t.particles ?? '', m.edges.filter(e => e.style === t.id).length])));
    // Grupos
    const gpath = g => { const p = []; let x = g.parent, i = 0; while (x && i++ < 50) { const gg = m.groups.find(q => q.id === x); if (!gg) break; p.unshift(gg.label); x = gg.parent; } return p.join(' › '); };
    const grp = m.groups.map(g => {
      const ns = m.nodes.filter(n => (typeof groupChain === 'function' ? groupChain(n, m) : []).some(x => x.id === g.id)), gv = f => (typeof govOf === 'function' ? govOf(g, f, m).value : g[f] || '');
      return [g.id, g.label, gpath(g), typeof groupKind === 'function' ? T(`gkind.${groupKind(g)}`) : '', typeof regionOf === 'function' ? regionOf(g, m).value : g.region || '',
        typeof layerOf === 'function' && layerOf(g).value && typeof layerInfo === 'function' ? layerInfo(layerOf(g).value).label : '', gv('owner'), gv('team'), gv('costCenter'), ns.length, ns.some(hasCost) ? round2(monthlyTotal(ns)) : ''];
    });
    if (grp.length) out.push(mk('groups', INV_GROUP, grp));
    // Dueños por equipo
    const own = typeof govTeamList === 'function' ? govTeamList(m).map(t => { const ns = t.nodes.map(id => byId.get(id)).filter(Boolean); return [t.team || T('inv.noTeam'), t.owners.join('; '), t.stewards.join('; '), ns.length, ns.some(hasCost) ? round2(monthlyTotal(ns)) : '']; }) : [];
    if (own.length) out.push(mk('owners', INV_OWNER, own));
    // Decisiones (ADR)
    const links = l => [...(l?.nodes || []).map(nm), ...(l?.edges || []).map(id => { const e = m.edges.find(x => x.id === id); return e ? `${nm(e.from)} → ${nm(e.to)}` : id; }), ...(l?.groups || []).map(id => m.groups.find(g => g.id === id)?.label || id),
      ...(l?.versions || []).map(id => { const v = (m.versions || []).find(x => x.id === id); return v && typeof verLabel === 'function' ? verLabel(v) : id; })].join('; ');
    if (m.decisions?.length) {   // Área y Elegida solo aparecen si alguna decisión las usa
      const ar = m.decisions.some(d => d.area), ch = m.decisions.some(d => d.chosen), pick = d => { const o = d.chosen && (d.options || []).find(x => x.id === d.chosen); return o ? `${o.id} · ${o.title || o.id}` : ''; };
      out.push(mk('decisions', [...INV_ADR, ...(ar ? [['area']] : []), ...(ch ? [['chosen']] : [])], m.decisions.map(d => [d.id, d.title, T(`adr.st.${d.status}`), d.date || '', links(d.links), ...(ar ? [d.area || ''] : []), ...(ch ? [pick(d)] : [])])));
    }
    if (m.requirements?.length) {   // Requisitos: cubierto por, control y su resultado
      out.push(mk('requirements', INV_REQ, m.requirements.map(r => { const c = r.check && reqCheck(r, m); return [r.id, r.title, T(`req.kind.${r.kind}`), r.priority ? T(`req.pr.${r.priority}`) : '', T(`req.st.${r.status}`), r.source || '', reqCoveredBy(r, m), r.check ? reqCheckText(r) : '', c ? `${T(`req.chk.${c.state}`)}${c.detail ? ` · ${c.detail}` : ''}` : '']; })));
    }
    // Registro RAID
    if (m.raid?.length) {
      const rl = l => [...(l?.decisions || []), ...(l?.requirements || []), links(l)].filter(Boolean).join('; ');
      out.push(mk('raid', INV_RAID, m.raid.map(x => [x.id, T(`raid.type1.${x.type}`), x.title, T(`raid.st.${raidState(x)}`), x.owner || '', x.probability ?? '', x.impact ?? '', raidScore(x) || '', x.mitigation || '', x.due || '', x.raised || '', rl(x.links), x.detail || ''])));
    }
    // Catálogo de datos (solo si hay conjuntos): una fila por conjunto (frescura real, costo estimado y contrato), y Columnas y Calidad si tienen filas
    if (m.datasets?.length) {
      const dsl = m.datasets, ownerOf = o => m.stakeholders?.find(s => s.id === o)?.name || o || '', pr = { prices: dsPrices() };
      out.push(mk('datasets', INV_DS, dsl.map(d => {
        const f = e2eOf(d.name, m), sto = storageEstimate(d, pr);
        return [d.id, d.name, d.domain || '', d.layer ? layerInfo(d.layer).label : '', ownerOf(d.owner), d.steward || '', invYN(!!d.product), (d.classes || []).map(k => loc(DATA[k]?.short) || String(k).toUpperCase()).join(' '),
          d.format || '', d.freshness || '', f.worst == null ? '' : fmtDur(f.worst / 1000), T(`inv.fr.${f.state}`), d.volume?.perDay ?? '', d.volume?.retentionDays ?? '', sto ? round2(sto.gb) : '', sto ? round2(sto.monthly) : '',
          phNm(m, d.phase), d.contract?.version || '', d.contract ? T(`rep.cat.st.${d.contract.status}`) : '', (d.contract?.consumers || []).map(nm).join('; ')];
      })));
      const dc = dsl.flatMap(d => (d.schema || []).map(c => [d.id, d.name, c.name, c.type || '', invYN(!!c.key), invYN(!!c.pii), invYN(c.nullable !== false), c.desc || '']));
      if (dc.length) out.push(mk('columns', INV_DSC, dc));
      const dq = dsl.flatMap(d => (d.quality || []).map(q => [d.id, d.name, q.rule, q.column || '', q.param || '', q.severity ? sevLabel(q.severity) : '']));
      if (dq.length) out.push(mk('quality', INV_DSQ, dq));
    }
    // Interesados (una fila por persona, con su RACI como «área:letra») y firmas de decisiones y versiones (una fila por firma); solo si hay datos
    if (m.stakeholders?.length) out.push(mk('stakeholders', INV_SH, m.stakeholders.map(s => [s.id, s.name, s.role || '', T(`people.org.${s.org}`), Object.entries(s.raci || {}).map(([k, v]) => `${k}:${v}`).join('; '), invYN(s.versions === true), invYN(!!s.inactive)])));
    const sg = [...(m.decisions || []).map(d => [d, 'decision', d.id]), ...(m.versions || []).map(v => [v, 'version', v.id])].flatMap(([o, kind, id]) => (o.signoffs || []).map(x => [T(`inv.sg.${kind}`), id, x.by, apprWho(x.by, m), T(x.verdict === 'approve' ? 'appr.approved' : 'appr.rejected'), x.date, x.note || '']));
    if (sg.length) out.push(mk('signoffs', INV_SIGN, sg));
    // Hallazgos (abiertos y descartados)
    const tl = t => { const o = (t.kind === 'node' ? m.nodes : t.kind === 'edge' ? m.edges : t.kind === 'group' ? m.groups : t.kind === 'zone' ? m.zones || [] : []).find(x => x.id === t.id); return !o ? t.id : t.kind === 'edge' ? `${nm(o.from)} → ${nm(o.to)}` : o.label || t.id; };
    const fnd = typeof allFindings === 'function' ? allFindings(m).map(f => { const d = f.source !== 'review' && m.dismissed?.[f.id]; return [sevLabel(f.severity), typeof srcLabel === 'function' ? srcLabel(f.source) : f.source, f.rule, f.title, tl(f.target || {}), invYN(!!d), d?.reason || '']; }) : [];
    if (fnd.length) out.push(mk('findings', INV_FIND, fnd));
    // Versiones y ambientes
    if (m.versions?.length) out.push(mk('versions', INV_VER, m.versions.map(v => [verLabel(v), v.kind === 'env' ? loc(C.environments?.[v.env]?.label) || v.env : '', T(`ver.st.${v.status}`), v.author || '', v.created || '', v.updated || '', [v.decidedOn, v.decidedBy].filter(Boolean).join(' · ')])));
    return out;
  }
  // 'xlsx' | 'csv' (solo componentes) | 'csv-all' (una descarga por tabla)
  function exportInventory(kind = 'xlsx') {
    try {
      const tabs = inventoryTables(S.model), X = window.DiagramonXlsx;
      if (kind === 'xlsx') {
        if (!X) throw new Error('src/export/xlsx.js missing');
        download(X.blob(tabs.map(t => ({ name: t.name, head: t.head, rows: t.rows, fmt: t.fmt })), { title: `${S.model.title || 'Diagramon'} · ${T('inv.title')}`, creator: 'Diagramon' }), fileName('xlsx', 'inventory'), X.MIME);
      } else if (kind === 'csv-all') {
        tabs.forEach((t, i) => setTimeout(() => download(toCSV([t.head, ...t.rows]), fileName('csv', `inventory-${t.key}`), 'text/csv;charset=utf-8'), i * 300));
      } else download(toCSV([tabs[0].head, ...tabs[0].rows]), fileName('csv', 'inventory'), 'text/csv;charset=utf-8');
      toast(T('toast.exported', { name: T('inv.title') }));
    } catch (e) { console.error(e); toast(T('toast.exportFail')); }
  }
  // Diálogo del CSV: solo componentes o todas las tablas por separado
  function openInventoryDialog() {
    const prev = document.activeElement, id = `iv${Date.now()}`, back = document.createElement('div');
    back.className = 'cf-back';
    back.innerHTML = `<form class="cf share" role="dialog" aria-modal="true" aria-labelledby="${id}t" autocomplete="off">
      <h3 id="${id}t">${esc(T('inv.csv.title'))}</h3><p>${esc(T('inv.csv.lead'))}</p>
      <fieldset class="sh-views"><label class="sh-chk"><input type="radio" name="k" value="csv" checked>${esc(T('inv.csv.one'))}</label><label class="sh-chk"><input type="radio" name="k" value="csv-all">${esc(T('inv.csv.all'))}</label></fieldset>
      <div class="cf-actions"><button type="button" class="btn" data-iv="no">${esc(T('ver.cf.cancel'))}</button><button type="submit" class="btn primary">${esc(T('inv.csv.go'))}</button></div></form>`;
    const form = back.querySelector('form'), close = () => { document.removeEventListener('keydown', key, true); back.remove(); prev?.focus?.(); };
    const key = ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); } };
    form.addEventListener('click', ev => { if (ev.target.closest('[data-iv="no"]')) close(); });
    back.addEventListener('mousedown', ev => { if (ev.target === back) close(); });
    form.addEventListener('submit', ev => { ev.preventDefault(); const k = form.elements.k.value; close(); exportInventory(k); });
    document.addEventListener('keydown', key, true);
    document.body.appendChild(back);
    form.querySelector('input[name="k"]:checked').focus();
  }

  /* ---------- importar un manifest de dbt (dbt.js): catálogo o diagrama con linaje ---------- */
  const dbtCfg = () => ({ ...C.datasets?.dbt, layers: Object.keys(DL), aliases: DL_ALIAS, classes: Object.keys(DATA), stakeholders: (S.model.stakeholders || []).map(x => ({ id: x.id, name: x.name })) });
  const dbtMsg = r => T(`dbt.err.${r.error}`, r.n);
  // Aplica el manifest ya leído: mode 'merge' (fusiona con el catálogo; sin tocar componentes ni conexiones) o 'new' (diagrama nuevo con linaje). Un solo paso de deshacer.
  function dbtApply(man, mode) {
    const DBT = window.DiagramonDbt, cfg = dbtCfg();
    if (mode === 'new') {
      const r = DBT.toDiagram(man, cfg);
      if (!r.stats.datasets || !r.diagram.nodes.length) { toast(T('dbt.err.empty'), 3200); return { error: 'empty' }; }
      S.sel = null;
      setModel(r.diagram, { current: true, history: true, animate: true, fit: true });
      const sum = { mode, datasets: r.stats.datasets, columns: r.stats.columns, rules: r.stats.rules, exposures: r.stats.exposures, nodes: r.stats.nodes, edges: r.stats.edges, warnings: r.warnings };
      toast(T('dbt.done.new', sum), 4200);
      return sum;
    }
    const inc = DBT.toCatalog(man, cfg);
    if (!inc.datasets.length) { toast(T('dbt.err.empty'), 3200); return { error: 'empty' }; }
    const cur = S.model.datasets || [], list = cleanCatalog(DBT.merge(cur, inc.datasets), S.model, dsHelpers());
    const before = new Map(cur.map(d => [dsK(d.name), JSON.stringify(d)])), after = new Map(list.map(d => [dsK(d.name), JSON.stringify(d)]));
    let added = 0, updated = 0, unchanged = 0;
    inc.datasets.forEach(d => { const k = dsK(d.name); if (!after.has(k)) return; if (!before.has(k)) added++; else if (before.get(k) !== after.get(k)) updated++; else unchanged++; });
    const warnings = [...inc.warnings];
    if (list.length >= DS_MAX && inc.datasets.some(d => !after.has(dsK(d.name)))) warnings.push({ code: 'cap.datasets', n: inc.datasets.filter(d => !after.has(dsK(d.name))).length });
    if (added || updated) dsCommit(list);
    const sum = { mode, added, updated, unchanged, datasets: inc.stats.datasets, columns: inc.stats.columns, rules: inc.stats.rules, exposures: inc.stats.exposures, warnings };
    toast(T('dbt.done.merge', sum), 4200);
    return sum;
  }
  // API sin diálogo: importDbt(texto, { mode: 'merge' | 'new' }) → resumen (o { error })
  function importDbt(text, opts = {}) {
    const DBT = window.DiagramonDbt, r = DBT ? DBT.parse(text, C.datasets?.dbt) : { error: 'bad' };
    if (r.error) { toast(dbtMsg(r), 3200); return { error: r.error }; }
    return dbtApply(r.manifest, opts.mode === 'new' || opts.mode === 'merge' ? opts.mode : S.model.nodes.length ? 'merge' : 'new');
  }
  // Lee el manifest y pregunta cómo importarlo (vista previa con cuentas y avisos)
  function openDbtImport(text) {
    const DBT = window.DiagramonDbt, r = DBT.parse(text, C.datasets?.dbt);
    if (r.error) return toast(dbtMsg(r), 3200);
    const man = r.manifest, pv = DBT.toCatalog(man, dbtCfg()), st = pv.stats;
    if (!st.datasets) return toast(T('dbt.err.empty'), 3200);
    const prev = document.activeElement, id = `dbt${Date.now()}`, back = document.createElement('div'), first = S.model.nodes.length ? 'merge' : 'new';
    const layers = [...Object.keys(DL), ''].filter(k => st.byLayer[k]).map(k => k ? `${layerInfo(k).label} ${st.byLayer[k]}` : T('dbt.pv.nolayer', st.byLayer[k])).join(' · ');
    const warns = pv.warnings.map(w => ({ ...w, key: `dbt.warn.${w.code}` }));
    const mode = (k, on) => `<label class="sh-chk"><input type="radio" name="mode" value="${k}"${on ? ' checked' : ''}>${esc(T(`dbt.mode.${k}`))}</label><small class="dbt-d">${esc(T(`dbt.mode.${k}.d`))}</small>`;
    back.className = 'cf-back';
    back.innerHTML = `<form class="cf share" role="dialog" aria-modal="true" aria-labelledby="${id}t" aria-describedby="${id}d" autocomplete="off">
      <h3 id="${id}t">${esc(T('dbt.title'))}</h3><p id="${id}d">${esc(T('dbt.lead', { project: pv.project, version: String(man.metadata?.dbt_schema_version || '').split('/').pop().replace(/\.json$/, '') }))}</p>
      <fieldset class="sh-views"><legend>${esc(T('dbt.mode'))}</legend>${mode('merge', first === 'merge')}${mode('new', first === 'new')}</fieldset>
      <fieldset class="sh-views"><legend>${esc(T('dbt.pv'))}</legend><small class="dbt-pv">${esc(T('dbt.pv.datasets', { n: st.datasets, layers }))}</small><small class="dbt-pv">${esc(T('dbt.pv.cols', { cols: st.columns, rules: st.rules, exps: st.exposures }))}</small>
        ${warns.map(w => `<small class="dbt-warn" role="status">⚠ ${esc(T(w.key, w.n))}</small>`).join('')}</fieldset>
      <div class="cf-actions"><button type="button" class="btn" data-dbt="no">${esc(T('ver.cf.cancel'))}</button><button type="submit" class="btn primary">${esc(T('dbt.go'))}</button></div></form>`;
    const form = back.querySelector('form'), close = () => { document.removeEventListener('keydown', key, true); back.remove(); prev?.focus?.(); };
    const key = ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); } };
    form.addEventListener('click', ev => { if (ev.target.closest('[data-dbt="no"]')) close(); });
    back.addEventListener('mousedown', ev => { if (ev.target === back) close(); });
    form.addEventListener('submit', ev => { ev.preventDefault(); const k = form.elements.mode.value; close(); dbtApply(man, k); });
    document.addEventListener('keydown', key, true);
    document.body.appendChild(back);
    form.querySelector('input[name="mode"]:checked').focus();
  }

  // Importa un diagrama de Diagramon (JSON) o infraestructura como código (iac.js).
  // Acepta File del navegador o { name, text }.
  async function importFiles(list) {
    const files = await Promise.all([...list].map(async f => ({ name: f.name || '', text: typeof f.text === 'string' ? f.text : await f.text() })));
    if (!files.length) return;
    if (files.length === 1 && files[0].text.length < 2e6 && files[0].text.includes('"feedback"')) {   // archivo de comentarios del revisor (cifrado): pide la contraseña y muestra qué entra
      let env = null;
      try { env = JSON.parse(files[0].text); } catch { /* no es JSON */ }
      if (env && typeof env === 'object' && env.kind === 'feedback' && env.v === 'fb1') return openFeedbackImport(env);
    }
    const dbtFile = window.DiagramonDbt && files.find(f => window.DiagramonDbt.detect(f.text));   // manifest de dbt: antes que el resto
    if (dbtFile) return openDbtImport(dbtFile.text);
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
    res.diagram.nodes.forEach(n => { delete n.facts; });   // lo que afirma la infraestructura sirve para compararla, no se guarda en el diagrama
    if (S.scope) { importIntoScope(res.diagram); toast(T('toast.iac', res), 4200); return res; } // dentro de un nivel C4: se añade a ese nivel
    S.sel = null;
    setModel(res.diagram, { current: true, history: true, animate: true, fit: true });
    toast(T('toast.iac', res), 4200);
    return res;
  }

  /* ---------- interacción con el lienzo ---------- */
  // Nota o zona bajo el puntero: la nota entera, y de la zona solo su etiqueta y su borde
  const itemOf = t => {
    const h = t.closest('.resize-handle'), e = t.closest('.note, .zone');
    if (!e || !(h || e.classList.contains('note') || t.closest('.zone-tag, .zone-hit'))) return null;
    return { kind: e.classList.contains('note') ? 'note' : 'zone', id: e.dataset.id, resize: !!h };
  };
  // Zona que contiene el punto (la más pequeña si hay varias): Alt+clic la elige aunque haya algo encima
  const zoneAt = p => {
    const hit = S.model.zones.filter(z => inScope(z) && p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h).sort((a, b) => a.w * a.h - b.w * b.h)[0];
    return hit ? { kind: 'zone', id: hit.id, resize: false } : null;
  };
  svg.addEventListener('pointerdown', ev => {
    if (ev.button !== 0 && ev.button !== 1) return;
    if (P) { if (ev.button === 0) presentGo(1); return; }
    if (S.play) stopPlay();
    const ghostEl = ev.button === 0 && ev.target.closest('.xs-ghost');
    if (ghostEl) { // tarjeta fantasma de un nivel C4: salta a su nivel y la elige
      const gid = ghostEl.dataset.xs;
      cancelConnect(); setScope(scopeOf(gid)); select({ kind: 'node', id: gid });
      return;
    }
    const nodeEl = ev.target.closest('.node'), tagEl = ev.target.closest('.group-tag'), edgeEl = ev.target.closest('.edge:not(.ctx-edge)');
    const ctxEl = ev.target.closest('.ctx-box'), flowEl = ev.target.closest('.ctx-edge');
    const p = toWorld(ev.clientX, ev.clientY), now = performance.now();
    const item = !S.connecting && ev.button === 0 ? itemOf(ev.target) || (ev.altKey ? zoneAt(p) : null) : null;
    const key = item ? 'i:' + item.id : nodeEl ? 'n:' + nodeEl.dataset.id : tagEl ? 'g:' + tagEl.parentNode.dataset.id : edgeEl ? 'e:' + edgeEl.dataset.id : ctxEl ? 'c:' + ctxEl.dataset.id : flowEl ? 'f:' + flowEl.dataset.key : 'bg';
    const last = S.lastDown;
    const dbl = ev.button === 0 && last && last.key === key && now - last.t < 350 && Math.hypot(ev.clientX - last.x, ev.clientY - last.y) < 6;
    S.lastDown = dbl ? null : { key, t: now, x: ev.clientX, y: ev.clientY };

    if (item) {
      if (dbl && !item.resize) { select({ kind: item.kind, id: item.id }); editItemText(item.kind, item.id); return; }
      const o = S.model[item.kind === 'note' ? 'notes' : 'zones'].find(x => x.id === item.id);
      if (!o) return;
      select({ kind: item.kind, id: item.id });
      S.drag = { kind: item.resize ? 'resize' : 'item', o, start: p, ox: o.x, oy: o.y, ow: o.w, oh: o.h, moved: false };
      svg.setPointerCapture(ev.pointerId);
      return;
    }
    const multiKey = ev.metaKey || ev.ctrlKey;
    if (ev.button === 1 || (!nodeEl && !tagEl && !edgeEl && !ctxEl && !flowEl)) {
      if (dbl) { addNode(S.lastType, p.x, p.y, S.lastExtra); return; }
      if (ev.button === 0 && (ev.shiftKey || multiKey) && !S.connecting) {
        // Selección por área: suma lo que ya estaba elegido
        S.drag = { kind: 'box', start: p, base: selIds(), moved: false, rect: el('rect', { class: 'marquee', x: p.x, y: p.y, width: 0, height: 0 }, L.guides) };
      } else S.drag = { kind: 'pan', cx: ev.clientX, cy: ev.clientY, vx: S.view.x, vy: S.view.y, moved: false };
    } else if (ctxEl) { // caja cerrada de la vista Contexto: clic elige el grupo, arrastrar lo mueve entero, doble clic lo abre
      const gid = ctxEl.dataset.id;
      if (dbl) { openGroupFull(gid); return; }
      S.drag = { kind: 'move', start: p, orig: S.model.nodes.filter(n => inGroup(n, gid)).map(n => ({ n, x: n.x, y: n.y })), moved: false, click: { kind: 'group', id: gid } };
    } else if (flowEl) { // conexión agregada: solo lectura
      cancelConnect();
      selectFlow(flowEl.dataset.key);
      return;
    } else if (nodeEl) {
      const id = nodeEl.dataset.id;
      // Diagrama interno: clic en el indicador «⊞ n» o doble clic fuera del texto lo abre; doble clic en el nombre (o en un nodo sin interior) lo renombra
      if (ev.button === 0 && !S.connecting && !(ev.metaKey || ev.ctrlKey) && ev.target.closest('.node-inner')) { openInner(id); return; }
      if (dbl) { if (innerCount(id) && !ev.target.closest('.node-label, .node-sub')) openInner(id); else renameNode(id); return; }
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
      const hits = S.model.nodes.filter(n => !VW.hideNodes.has(n.id) && n.x < x + w && n.x + R.width.get(n.id) > x && n.y < y + h && n.y + H > y).map(n => n.id);
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
    if (d.kind === 'item') { d.o.x = snap(d.ox + dx); d.o.y = snap(d.oy + dy); updateItems(); return; }
    if (d.kind === 'resize') { d.o.w = Math.max(60, snap(d.ow + dx)); d.o.h = Math.max(40, snap(d.oh + dy)); drawItems(); return; }
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
      if (!d.moved) { if (S.connecting) cancelConnect(); else if (S.sel || S.flow) select(null); }
      return;
    }
    if (d.kind === 'box') { d.rect.remove(); select(S.sel); return; }
    if (d.kind === 'item' || d.kind === 'resize') { if (d.moved) { syncEditor(); save(); updateMeta(); } return; }
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
    if (P) return;
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
    if (P) return;
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
    if (P) return presentKey(ev);
    if (mod && k === 'z') { ev.preventDefault(); ev.shiftKey ? redo() : undo(); }
    else if (mod && k === 'y') { ev.preventDefault(); redo(); }
    else if (mod && k === 'd') { ev.preventDefault(); duplicateSelection(); }
    else if (mod && k === 'a') { ev.preventDefault(); select({ kind: 'multi', ids: S.model.nodes.map(n => n.id) }); }  // visibleSel descarta los ocultos
    else if (mod) return;
    else if (ev.key === 'Delete' || ev.key === 'Backspace') { if (S.sel) { ev.preventDefault(); deleteSelection(); } }
    else if (ev.key === 'Escape' && ADR.wide) { ADR.wide = null; renderAdr(true); }   // cierra la matriz de opciones ampliada
    else if (ev.key === 'Escape' && REQ.wide) { REQ.wide = false; renderReq(true); }   // y la de trazabilidad de requisitos
    else if (ev.key === 'Escape' && DSX.wide) { DSX.wide = null; renderDs(true); }   // y el esquema de un conjunto
    else if (ev.key === 'Escape' && PEOPLE.wide) { PEOPLE.wide = false; renderPeople(true); }   // y la matriz RACI de interesados
    else if (ev.key === 'Escape' && filterMenu.open) filterMenu.open = false;
    else if (ev.key === 'Escape') { if (S.play) stopPlay(); else if (S.path) clearPath(); else if (S.connecting) cancelConnect(); else if (!S.sel && S.compare) compareVersion(null); else if (!S.sel && !S.flow && S.scope) scopeUp(); else select(null); }
    else if (ev.altKey && ev.key === 'ArrowUp') { ev.preventDefault(); scopeUp(); }  // sube un nivel C4
    else if (ev.key === 'Enter' && S.sel?.kind === 'node' && innerCount(S.sel.id) && !ev.target.closest?.('button, a, summary')) { ev.preventDefault(); setScope(S.sel.id); }  // abre el diagrama interno
    else if (/^[1-9]$/.test(k) && VIEW_KEYS[+k - 1]) setView(VIEW_KEYS[+k - 1]);
    else if (ev.key === '[' || ev.key === ']') stepPhase(ev.key === ']' ? 1 : -1);   // fase anterior / siguiente
    else if (k === 'f') fitView();
    else if (k === 'p') togglePlay();
    else if (k === 'r' && selIds().length === 2) showPath(...selIds());
    else if (k === 'v') present({ views: ev.shiftKey });
    else if (k === 'i') toggleDocbar();
    else if (k === 'd') openDatasetPicker();
    else if (k === 't') toggleTheme();
    else if (k === 'l') toggleLang();
    else if (k === 'e') toggleRouting();
    else if (k === 'g') filterMenu.open = !filterMenu.open;
    else if (k === 'c' && S.sel?.kind === 'node') startConnect(S.sel.id);
    else if (k === 'z') cycleZone(ev.shiftKey ? -1 : 1);
    else if (k === '+' || k === '=') animateView(zoomTarget(1.25), 200);
    else if (k === '-') animateView(zoomTarget(1 / 1.25), 200);
    else if (ev.key.startsWith('Arrow') && (selIds().length || itemSel())) {
      ev.preventDefault();
      const step = C.grid.snap * (ev.shiftKey ? 5 : 1);
      pushHistory();
      // Nodos elegidos, o la nota / zona seleccionada
      const it = itemSel() && S.model[S.sel.kind === 'note' ? 'notes' : 'zones'].find(x => x.id === S.sel.id);
      (it ? [it] : selNodes()).forEach(n => {
        if (ev.key === 'ArrowLeft') n.x -= step;
        if (ev.key === 'ArrowRight') n.x += step;
        if (ev.key === 'ArrowUp') n.y -= step;
        if (ev.key === 'ArrowDown') n.y += step;
      });
      changed(false);
    }
  });

  /* ---------- panel «Revisión»: hallazgos de todas las fuentes, descartes y marcadores en el lienzo ---------- */
  // FC = { all, open, dismissed, byId, fresh }: se recalcula al dibujar y al guardar (updateMeta); el panel solo se pinta si su pestaña está a la vista
  let FC = { all: [], open: [], dismissed: [], byId: new Map(), fresh: false };
  const FP = { sev: '', src: '', dis: false }; // filtros del panel: gravedad, fuente y «mostrar descartados»
  const SRC_ORDER = ['rule', 'compliance', 'stride', 'review'];
  const srcRank = k => (SRC_ORDER.includes(k) ? SRC_ORDER.indexOf(k) : SRC_ORDER.length);
  const srcLabel = k => { const key = `find.src.${k}`; const t = T(key); return t === key || !t ? k : t; };
  const sevRank = k => SEVERITY.indexOf(k);
  const findingsOf = m => {
    const dm = m.dismissed || {};
    return allFindings(m).map(f => { const d = f.source !== 'review' && dm[f.id]; return d ? { ...f, dismissed: { ...d } } : { ...f }; })
      .sort((a, b) => srcRank(a.source) - srcRank(b.source) || sevRank(b.severity) - sevRank(a.severity) || String(a.title).localeCompare(String(b.title)));
  };
  function refreshFindings(fromRender = false) {
    if (!fromRender && FC.fresh) { FC.fresh = false; return; } // render() ya lo calculó para este mismo updateMeta
    const all = S.model ? findingsOf(S.model) : [];
    FC = { all, open: all.filter(f => !f.dismissed), dismissed: all.filter(f => f.dismissed), byId: new Map(all.map(f => [f.id, f])), fresh: fromRender };
    syncSecMarkers();
    const worst = FC.open.reduce((w, f) => (sevRank(f.severity) > sevRank(w) ? f.severity : w), 'low'), bd = $('#review-badge');
    if (bd) { bd.hidden = !FC.open.length; bd.textContent = FC.open.length > 99 ? '99+' : FC.open.length; bd.style.setProperty('--b', `var(--sev-${worst})`); bd.title = T('find.badge', FC.open.length); }
    const bg = $('#review-badge-g'); if (bg && bd) { bg.hidden = bd.hidden; bg.textContent = bd.textContent; bg.title = bd.title; bg.style.setProperty('--b', bd.style.getPropertyValue('--b')); }
    renderFindings();
  }
  // Pastilla «⚠ n» arriba a la derecha de cada nodo con hallazgos abiertos de reglas (solo se ve en la vista Seguridad); evita la insignia
  function syncSecMarkers() {
    const per = new Map();
    FC.open.forEach(f => { if (f.source === 'rule' && f.target.kind === 'node') { const p = per.get(f.target.id) || { n: 0, sev: 'low', t: [] }; p.n++; p.t.push(f.title); if (sevRank(f.severity) > sevRank(p.sev)) p.sev = f.severity; per.set(f.target.id, p); } });
    S.model?.nodes.forEach(n => {
      const g = R.nodes.get(n.id), body = g?.querySelector('.node-body'), cur = body?.querySelector(':scope > .node-sec'), p = per.get(n.id);
      if (!body) return;
      if (!p) return void cur?.remove();
      const key = `${p.sev}|${p.n}|${R.width.get(n.id)}|${n.badge ?? ''}`;
      if (cur?.dataset.k === key) return;
      cur?.remove();
      const w = R.width.get(n.id), txt = `⚠ ${p.n}`, pw = Math.max(30, Math.ceil(textW(txt, FONT.badge) + 12));
      const bw = n.badge != null && n.badge !== '' ? Math.max(22, textW(n.badge, FONT.badge) + 12) : 0;
      const x = bw ? w - 14 - bw / 2 - 5 - pw : w - 6 - pw;
      const sg = el('g', { class: `node-sec sev-${p.sev}`, transform: `translate(${x} 0)`, 'data-k': key }, body);
      el('title', null, sg).textContent = p.t.join('\n');
      el('rect', { y: -9, width: pw, height: 18, rx: 9 }, sg);
      el('text', { x: pw / 2, y: 4, 'text-anchor': 'middle' }, sg).textContent = txt;
    });
  }
  const findingTarget = t => {
    const m = S.model;
    if (t.kind === 'node') return m.nodes.find(n => n.id === t.id);
    if (t.kind === 'edge') return m.edges.find(e => e.id === t.id);
    if (t.kind === 'group') return m.groups.find(g => g.id === t.id);
    if (t.kind === 'zone') return m.zones.find(z => z.id === t.id);
    return null;
  };
  const findingTargetLabel = t => {
    const o = findingTarget(t), m = S.model;
    if (!o) return t.id;
    if (t.kind === 'edge') return `${m.nodes.find(n => n.id === o.from)?.label || o.from} ${o.both ? '↔' : '→'} ${m.nodes.find(n => n.id === o.to)?.label || o.to}`;
    return t.kind === 'zone' ? o.label || T('zone.new') : o.label;
  };
  // Selecciona el objetivo y encuadra la vista sobre él
  function goToFinding(id) {
    const f = FC.byId.get(id);
    if (f) focusTarget(f.target.kind, f.target.id);
  }
  function focusTarget(k, tid) {
    const o = findingTarget({ kind: k, id: tid });
    if (!o) return;
    select({ kind: k, id: o.id });
    if (!S.sel) return toast(T('view.hiddenHere'));
    if (k === 'node') fitBox({ x: o.x, y: o.y, w: R.width.get(o.id) || nodeWidth(o), h: H }, 1);
    else if (k === 'edge') {
      const a = S.model.nodes.find(n => n.id === o.from), b = S.model.nodes.find(n => n.id === o.to);
      if (a && b) { const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y); fitBox({ x: x0, y: y0, w: Math.max(a.x + R.width.get(a.id), b.x + R.width.get(b.id)) - x0, h: Math.max(a.y, b.y) + H - y0 }, 1); }
    } else if (k === 'group') { const bx = R.gbox.get(o.id); if (bx) fitBox({ x: bx.x, y: bx.y, w: bx.w, h: bx.h }, 1); }
    else if (k === 'zone') fitBox({ x: o.x, y: o.y, w: o.w, h: o.h }, 1);
  }
  function dismissFinding(id, reason = '') {
    const f = FC.byId.get(id) || findingsOf(S.model).find(x => x.id === id);
    if (!f || f.source === 'review' || !S.model) return false;
    pushHistory();
    const by = S.model.meta?.author || store.get('reviewer', '');
    S.model.dismissed = { ...(S.model.dismissed || {}), [id]: { reason: String(reason ?? '').trim().slice(0, 300), ...(by ? { by } : {}), date: today() } };
    changed(false); refreshFindings(true); FC.fresh = false;
    return true;
  }
  function restoreFinding(id) {
    if (!S.model?.dismissed?.[id]) return false;
    pushHistory();
    delete S.model.dismissed[id];
    if (!Object.keys(S.model.dismissed).length) delete S.model.dismissed;
    changed(false); refreshFindings(true); FC.fresh = false;
    return true;
  }
  const apiFindings = (opts = {}) => {
    const all = findingsOf(S.model), list = opts.dismissed === false ? all.filter(f => !f.dismissed) : opts.dismissed === true ? all.filter(f => f.dismissed) : all;
    return clone(list);
  };
  // Cuadro con un campo de texto (motivo): Promise<string | null>; Esc cancela, Enter acepta
  function reasonBox({ title, text, placeholder = '', ok = 'OK', cancel = 'Cancel' }) {
    return new Promise(done => {
      const prev = document.activeElement, id = `cf${Date.now()}`;
      const back = document.createElement('div');
      back.className = 'cf-back';
      back.innerHTML = `<div class="cf" role="dialog" aria-modal="true" aria-labelledby="${id}t" aria-describedby="${id}d">
        <h3 id="${id}t">${esc(title)}</h3>
        <div id="${id}d">${text ? `<p>${esc(text)}</p>` : ''}</div>
        <input class="cf-type" type="text" maxlength="300" placeholder="${esc(placeholder)}" aria-labelledby="${id}t" autocomplete="off">
        <div class="cf-actions"><button class="btn" data-cf="no">${esc(cancel)}</button><button class="btn primary" data-cf="ok">${esc(ok)}</button></div></div>`;
      const input = back.querySelector('input');
      const close = r => { document.removeEventListener('keydown', key, true); back.remove(); prev?.focus?.(); done(r ? input.value.trim() : null); };
      const key = ev => {
        if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(false); }
        else if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); close(document.activeElement?.dataset?.cf !== 'no'); }
        else if (ev.key === 'Tab') { ev.preventDefault(); const b = [input, ...back.querySelectorAll('button')]; b[(b.indexOf(document.activeElement) + (ev.shiftKey ? b.length - 1 : 1)) % b.length].focus(); }
      };
      back.addEventListener('mousedown', ev => { if (ev.target === back) close(false); });
      back.addEventListener('click', ev => { const b = ev.target.closest('[data-cf]'); if (b) close(b.dataset.cf === 'ok'); });
      document.addEventListener('keydown', key, true);
      document.body.appendChild(back);
      input.focus();
    });
  }
  function renderFindings() {
    const box = $('#review-panel');
    if (!box || !S.model || !$('.pane[data-pane="review"]')?.classList.contains('on')) return;
    // Los chips cuentan los abiertos; un filtro que ya no tiene hallazgos se suelta solo
    const sevN = k => FC.open.filter(f => f.severity === k).length, srcs = [...new Set(FC.all.map(f => f.source))].sort((a, b) => srcRank(a) - srcRank(b));
    if (FP.sev && !sevN(FP.sev)) FP.sev = '';
    if (FP.src && !srcs.includes(FP.src)) FP.src = '';
    if (FP.dis && !FC.dismissed.length) FP.dis = false;
    const list = (FP.dis ? FC.all : FC.open).filter(f => (!FP.sev || f.severity === FP.sev) && (!FP.src || f.source === FP.src));
    const chip = (attr, val, on, color, label, n) => `<button class="fnd-chip${on ? ' on' : ''}" ${attr}="${esc(val)}" aria-pressed="${on}" style="--s:${color}">${esc(label)} <b>${n}</b></button>`;
    const sevChips = SEVERITY.slice().reverse().map(k => chip('data-f-sev', k, FP.sev === k, `var(--sev-${k})`, sevLabel(k), sevN(k))).join('');
    const srcChips = srcs.length > 1 ? srcs.map(k => chip('data-f-src', k, FP.src === k, 'var(--accent)', srcLabel(k), FC.open.filter(f => f.source === k).length)).join('') : '';
    const card = f => {
      const o = findingTarget(f.target), node = f.target.kind === 'node' && o, d = f.dismissed;
      return `<div class="fnd${d ? ' dis' : ''}" style="--s:var(--sev-${f.severity})" data-fid="${esc(f.id)}">
        <div class="fnd-head"><span class="fnd-sev">${esc(sevLabel(f.severity))}</span><span class="fnd-title">${esc(f.title)}</span></div>
        ${o ? `<button class="fnd-target" data-f-go="${esc(f.id)}" title="${esc(T('find.go'))}">${esc(T(`find.kind.${f.target.kind}`))}: ${esc(findingTargetLabel(f.target))}</button>` : ''}
        ${f.detail ? `<div class="fnd-detail">${esc(f.detail)}</div>` : ''}
        ${f.fix ? `<div class="fnd-fix">${esc(f.fix)}</div>` : ''}
        ${d ? `<div class="fnd-reason">${esc(T('find.dismissedBy', { reason: d.reason || T('find.noReason'), date: d.date ? fmtDay(d.date) : '', by: d.by || '' }))}</div>` : ''}
        <div class="fnd-actions">${d ? `<button class="btn small" data-f-restore="${esc(f.id)}">${esc(T('find.restore'))}</button>`
          : `${f.source !== 'review' ? `<button class="btn small" data-f-dis="${esc(f.id)}">${esc(T('find.dismiss'))}</button>` : ''}${f.source === 'rule' && node && !node.review ? `<button class="btn small" data-f-raise="${esc(f.id)}">${esc(T('find.raise'))}</button>` : ''}`}</div>
      </div>`;
    };
    let body = '';
    if (!FC.all.length || (!FC.open.length && !FP.dis)) body = `<p class="fnd-empty">${esc(T(FC.all.length ? 'find.allDismissed' : 'find.empty'))}</p>`;
    else if (!list.length) body = `<p class="fnd-empty">${esc(T('find.noMatch'))} <button class="btn small" data-f-clear="1">${esc(T('ver.f.clear'))}</button></p>`;
    else {
      const groups = [...new Set(list.map(f => f.source))];
      body = groups.map(src => `<div class="cat">${esc(srcLabel(src))} · ${list.filter(f => f.source === src).length}</div>${list.filter(f => f.source === src).map(card).join('')}`).join('');
    }
    const keepScroll = box.parentElement.scrollTop;
    box.innerHTML = `<div class="fnd-chips" role="group" aria-label="${esc(T('find.filter'))}">${sevChips}</div>
      ${srcChips ? `<div class="fnd-chips" role="group" aria-label="${esc(T('find.bySource'))}">${srcChips}</div>` : ''}
      <div class="fnd-bar">${FC.dismissed.length ? `<button class="btn small fnd-toggle${FP.dis ? ' on' : ''}" data-f-toggle="1" aria-pressed="${FP.dis}">${esc(T(FP.dis ? 'find.hideDismissed' : 'find.showDismissed', FC.dismissed.length))}</button>` : ''}
        <button class="btn small" data-f-csv="1"${FC.all.length ? '' : ' disabled'}>${esc(T('find.csv'))}</button></div>
      <div class="fnd-list">${body}</div>`;
    box.parentElement.scrollTop = keepScroll;
  }
  function exportFindingsCSV() {
    const rows = [['severity', 'source', 'rule', 'title', 'targetKind', 'targetLabel', 'detail', 'fix', 'dismissed', 'reason'].map(k => T(`find.col.${k}`))];
    FC.all.forEach(f => rows.push([sevLabel(f.severity), srcLabel(f.source), f.rule, f.title, T(`find.kind.${f.target.kind}`), findingTargetLabel(f.target), f.detail || '', f.fix || '', f.dismissed ? T('sec.yes') : T('sec.no'), f.dismissed?.reason || '']));
    download(toCSV(rows), `${(S.model.title || 'diagram').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'diagram'}-findings.csv`, 'text/csv;charset=utf-8');
  }
  $('#review-panel').addEventListener('click', async ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.fSev != null) FP.sev = FP.sev === d.fSev ? '' : d.fSev;
    else if (d.fSrc != null) FP.src = FP.src === d.fSrc ? '' : d.fSrc;
    else if (d.fToggle != null) FP.dis = !FP.dis;
    else if (d.fClear != null) { FP.sev = ''; FP.src = ''; }
    else if (d.fCsv != null) return exportFindingsCSV();
    else if (d.fGo != null) return goToFinding(d.fGo);
    else if (d.fDis != null) {
      const f = FC.byId.get(d.fDis);
      if (!f) return;
      const r = await reasonBox({ title: T('find.dismissTitle'), text: f.title, placeholder: T('find.reason.ph'), ok: T('find.dismiss'), cancel: T('ver.cf.cancel') });
      if (r != null) { dismissFinding(f.id, r); toast(T('find.toast.dismissed')); }
      return;
    } else if (d.fRestore != null) { restoreFinding(d.fRestore); toast(T('find.toast.restored')); return; }
    else if (d.fRaise != null) {
      const f = FC.byId.get(d.fRaise), n = f && S.model.nodes.find(x => x.id === f.target.id);
      if (!n || n.review) return;
      pushHistory();
      n.review = { status: 'open', raised: today(), note: f.title, ...(store.get('reviewer', '') ? { by: store.get('reviewer', '') } : {}) };
      changed(true); renderInspector(); refreshFindings(true); FC.fresh = false;
      toast(T('toast.revAdded'));
      return;
    }
    renderFindings();
  });
  /* ---------- decisiones de arquitectura (ADR): pestaña, inspector, versiones y exportación ---------- */
  const ADR = { open: null, st: '', q: '', area: '', menu: false, opt: new Set(), wide: null };   // ficha abierta, filtros por estado, área y búsqueda, menú de kits, opciones desplegadas (`id|opción`), matriz ampliada (id)
  const adrById = id => (S.model.decisions || []).find(d => d.id === id);
  const adrTitle = d => d.title || d.id;
  const adrChips = list => (list.length ? `<div class="adr-chips">${list.map(d => `<button type="button" class="adr-chip" data-adr-open="${esc(d.id)}" style="--s:${ADR_COLOR[d.status]}" title="${esc(`${d.id} · ${adrTitle(d)} · ${T(`adr.st.${d.status}`)}`)}"><b>${esc(d.id)}</b> ${esc(d.title)}</button>`).join('')}</div>` : '');
  // Nombre legible de un elemento enlazado
  function adrLinkLabel(kind, id) {
    const m = S.model;
    if (kind === 'nodes') return m.nodes.find(n => n.id === id)?.label;
    if (kind === 'groups') return m.groups.find(g => g.id === id)?.label;
    if (kind === 'versions') { const v = findVersion(id); return v && verLabel(v); }
    const e = m.edges.find(x => x.id === id);
    return e && `${m.nodes.find(n => n.id === e.from)?.label || e.from} ${e.both ? '↔' : '→'} ${m.nodes.find(n => n.id === e.to)?.label || e.to}`;
  }
  const ADR_KINDS = ['nodes', 'edges', 'groups', 'versions'];
  const adrLinkList = d => ADR_KINDS.flatMap(k => (d.links?.[k] || []).map(id => ({ kind: k, id, label: adrLinkLabel(k, id) || id })));

  // Crear, cambiar y borrar: todo pasa por cleanDecisions, así el estado, los enlaces y «sustituida por» siempre quedan coherentes
  function addDecision(p = {}) {
    p = p && typeof p === 'object' ? p : {};
    pushHistory();
    const list = cleanDecisions([...(S.model.decisions || []), { ...p, title: p.title || T('adr.new.title') }], S.model);
    const nd = list[list.length - 1];
    if (!nd.history?.length) { nd.history = [{ status: nd.status, date: nd.date }]; const by = adrAuthor(); if (by) nd.history[0].by = by; }   // alta = primera entrada del historial
    S.model.decisions = list;
    changed(true); renderInspector(); renderAdr(true);
    return nd.id;
  }
  function updateDecision(id, patch) {
    const d = adrById(id);
    if (!d || !patch || typeof patch !== 'object') return false;
    pushHistory();
    const next = { ...d, ...patch, id: d.id };
    if ('status' in patch && adrStatus(patch.status) !== 'superseded' && !('supersededBy' in patch)) delete next.supersededBy;
    if (!next.supersededBy) delete next.supersededBy;
    const list = cleanDecisions(S.model.decisions.map(x => (x === d ? next : x)), S.model), nd = list.find(x => x.id === d.id);
    if (nd && nd.status !== d.status) {   // cambió el estado (también por «reemplazada por»): se anota con la fecha de hoy y el autor
      const h = d.history?.length ? [...nd.history || d.history] : [{ status: d.status, date: d.date }], e = { status: nd.status, date: today() }, by = adrAuthor();
      if (by) e.by = by;
      if (nd.status === 'accepted') { const gap = apprMissing('decision', nd); if (gap.length) e.note = T('appr.note.without', gap.join(', ')); }   // aceptada sin todas las firmas: queda anotado
      nd.history = [...h, e].slice(-200); nd.date = e.date;
    } else if (nd && nd.history?.length && 'date' in patch && isDay(patch.date)) nd.history[nd.history.length - 1].date = nd.date;
    S.model.decisions = list;
    changed(true); renderInspector(); renderAdr(true);
    return true;
  }
  function removeDecision(id) {
    if (!adrById(id)) return false;
    pushHistory();
    S.model.decisions = cleanDecisions(S.model.decisions.filter(d => d.id !== id), S.model);
    if (ADR.open === id) ADR.open = null;
    pruneReqLinks();
    changed(true); renderInspector(); renderAdr(true);
    return true;
  }
  /* kits de decisiones (window.DIAGRAMON_ADR_KITS, src/adr-kits.js) */
  const adrKits = () => (Array.isArray(window.DIAGRAMON_ADR_KITS) ? window.DIAGRAMON_ADR_KITS.filter(k => k && k.id && Array.isArray(k.decisions)) : []);
  const adrBoth = v => (v && typeof v === 'object' ? Object.values(v) : [v]).map(x => String(x ?? '').trim().toLowerCase()).filter(Boolean);
  // Añade las decisiones del kit como «propuesta» (un solo paso de deshacer): copia los criterios del kit si la decisión no trae los suyos,
  // se salta las que ya existen por título (en cualquier idioma) y descarta los enlaces a ids que no existen aquí. → { added, skipped } o null
  function addDecisionKit(id) {
    const kit = adrKits().find(k => k.id === id);
    if (!kit) return null;
    const have = new Set((S.model.decisions || []).flatMap(d => adrBoth(d.title))), fresh = [];
    kit.decisions.forEach(kd => {
      const t = adrBoth(kd.title);
      if (!t.length || t.some(x => have.has(x))) return;
      t.forEach(x => have.add(x));
      const d = I.deep(kd);
      fresh.push({ title: d.title, status: 'proposed', area: d.area, context: d.context, criteria: d.criteria || I.deep(kit.criteria || []),
        options: (d.options || []).map(o => ({ id: o.id, title: o.title, summary: o.summary, pros: o.pros, cons: o.cons })), links: d.links });
    });
    const res = { added: fresh.length, skipped: kit.decisions.length - fresh.length };
    if (fresh.length) {
      pushHistory();
      const n0 = (S.model.decisions || []).length, list = cleanDecisions([...(S.model.decisions || []), ...fresh], S.model), by = adrAuthor();
      list.slice(n0).forEach(nd => { nd.history = [{ status: nd.status, date: nd.date, ...(by ? { by } : {}) }]; });
      S.model.decisions = list;
      changed(true); renderInspector(); renderAdr(true);
    }
    toast(T('adr.kit.done', res), 3200);
    return res;
  }
  // Opciones y criterios: cada cambio pasa por updateDecision (cleanDecisions) para que puntajes, elegida y límites queden coherentes
  const adrOptPatch = (d, oid, patch) => updateDecision(d.id, { options: (d.options || []).map(o => (o.id === oid ? { ...o, ...patch } : o)) });
  const adrNextOptId = d => { const used = new Set((d.options || []).map(o => o.id)); for (let i = 0; i < 26; i++) { const c = String.fromCharCode(65 + i); if (!used.has(c)) return c; } return `O${used.size + 1}`; };
  function adrAddOption(d) {
    if ((d.options || []).length >= ADR_MAX.options) return toast(T('adr.max', ADR_MAX.options));
    const id = adrNextOptId(d);
    ADR.opt.add(`${d.id}|${id}`);
    updateDecision(d.id, { options: [...(d.options || []), { id, title: T('adr.opt.untitled', id) }] });
  }
  function adrAddCriterion(d) {
    if ((d.criteria || []).length >= ADR_MAX.criteria) return toast(T('adr.max', ADR_MAX.criteria));
    const used = new Set((d.criteria || []).map(c => c.id));
    let n = 1; while (used.has(`criterion-${n}`)) n++;
    updateDecision(d.id, { criteria: [...(d.criteria || []), { id: `criterion-${n}`, label: T('adr.crit.untitled', n), weight: 3 }] });
  }
  // Enlaces de la selección actual: { nodes } | { edges } | { groups } o null
  function adrSelLinks() {
    const s = S.sel;
    if (!s) return null;
    if (s.kind === 'node') return { nodes: [s.id] };
    if (s.kind === 'multi') return { nodes: [...s.ids] };
    if (s.kind === 'edge') return { edges: [s.id] };
    if (s.kind === 'group') return { groups: [s.id] };
    return null;
  }
  const adrAddLinks = (d, add) => { const l = {}; ADR_KINDS.forEach(k => { const v = [...(d.links?.[k] || []), ...(add[k] || [])]; if (v.length) l[k] = v; }); return l; };

  // Abre una decisión en la pestaña ADR (quita los filtros que la esconderían)
  function adrOpen(id) {
    const d = adrById(id);
    if (!d) return;
    ADR.open = id;
    if (ADR.st && ADR.st !== d.status) ADR.st = '';
    if (ADR.area && ADR.area !== d.area) ADR.area = '';
    ADR.q = '';
    $('.tab[data-tab="adr"]')?.click();
    renderAdr(true);
    $(`#adr-list .adr[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' });
    if (matchMedia('(max-width: 760px)').matches) $('#main').classList.add('open');
  }
  // Muestra la versión en su pestaña y la resalta un momento
  function adrGotoVersion(id) {
    if (!findVersion(id)) return;
    $('.tab[data-tab="versions"]')?.click();
    if (store.get('verFilter', 'all') !== 'all') { store.set('verFilter', 'all'); renderVersions(); }
    const row = $(`#versions .ver[data-id="${CSS.escape(id)}"]`);
    row?.scrollIntoView({ block: 'nearest' });
    row?.classList.add('adr-flash');
    setTimeout(() => row?.classList.remove('adr-flash'), 1800);
  }
  function adrFocus(kind, id) {
    if (kind === 'versions') return adrGotoVersion(id);
    focusTarget(kind === 'nodes' ? 'node' : kind === 'edges' ? 'edge' : 'group', id);
  }

  /* pestaña */
  const adrPanel = $('#adr-panel');
  function renderAdr(force) {
    if (!adrPanel || !S.model || !$('.pane[data-pane="adr"]')?.classList.contains('on')) return;
    const a = document.activeElement;
    if (!force && a && adrPanel.contains(a) && a.matches('input, textarea, select')) return; // no pisar lo que se está escribiendo
    const ds = S.model.decisions || [];
    if (ADR.open && !adrById(ADR.open)) ADR.open = null;
    if (ADR.st && !ds.some(d => d.status === ADR.st)) ADR.st = '';
    const chip = (k, n, label, color) => `<button class="fnd-chip${ADR.st === k ? ' on' : ''}" data-adr-st="${k}" aria-pressed="${ADR.st === k}" style="--s:${color}">${esc(label)} <b>${n}</b></button>`;
    const counts = Object.fromEntries(ADR_STATUS.map(k => [k, ds.filter(d => d.status === k).length]));
    const areas = [...new Set(ds.map(d => d.area).filter(Boolean))];
    if (ADR.area && !areas.includes(ADR.area)) ADR.area = '';
    const kits = adrKits(), acc = counts.accepted, open = counts.proposed, pc = n => (ds.length ? (100 * n / ds.length).toFixed(1) : 0), progT = T('adr.prog', { a: acc, n: ds.length });
    const prog = ds.length ? `<div class="adr-prog"><div class="adr-prog-t">${esc(progT)}</div>
      <div class="adr-prog-b" role="img" aria-label="${esc(progT)}"><i style="width:${pc(acc)}%;background:${ADR_COLOR.accepted}"></i><i style="width:${pc(open)}%;background:${ADR_COLOR.proposed}"></i><i style="width:${pc(ds.length - acc - open)}%;background:var(--muted)"></i></div></div>` : '';
    const areaChips = areas.length ? `<div class="fnd-chips adr-areas" role="group" aria-label="${esc(T('adr.f.area'))}">${areas.map(a => { const l = ds.filter(d => d.area === a), n = l.filter(d => d.status === 'accepted').length; return `<button class="fnd-chip${ADR.area === a ? ' on' : ''}" data-adr-area="${esc(a)}" aria-pressed="${ADR.area === a}" style="--s:var(--p-cielo)" title="${esc(T('adr.areaTip', { a: n, n: l.length }))}">${esc(a)} <b>${n}/${l.length}</b></button>`; }).join('')}</div>` : '';
    const kitMenu = kits.length && ADR.menu ? `<div class="adr-kits">${kits.map(k => `<button type="button" class="adr-kit" data-adr-kit="${esc(k.id)}"><b>${esc(loc(k.name))}</b><span>${esc(loc(k.desc) || '')}</span><em>${esc(T('adr.kit.adds', k.decisions.length))}</em></button>`).join('')}</div>` : '';
    $('#adr-bar').innerHTML = `<div class="adr-tools"><button class="btn small primary" data-adr="new">+ ${esc(T('adr.new'))}</button><button class="btn small" data-adr="md"${ds.length ? '' : ' disabled'}>${esc(T('adr.export'))}</button>${kits.length ? `<button class="btn small" data-adr="kits" aria-expanded="${!!ADR.menu}">${esc(T('adr.kit.btn'))}</button>` : ''}</div>${kitMenu}${prog}${areaChips}
      ${ds.length ? `<div class="fnd-chips" role="group" aria-label="${esc(T('adr.filter'))}">${chip('', ds.length, T('adr.f.all'), 'var(--accent)')}${ADR_STATUS.filter(k => counts[k]).map(k => chip(k, counts[k], T(`adr.st.${k}`), ADR_COLOR[k])).join('')}</div>
      <input class="search" id="adr-q" style="padding-left:10px;margin-bottom:6px" value="${esc(ADR.q)}" placeholder="${esc(T('adr.search'))}" aria-label="${esc(T('adr.search'))}" autocomplete="off">` : ''}`;
    renderAdrList();
  }
  const adrMatches = d => (!ADR.st || d.status === ADR.st) && (!ADR.area || d.area === ADR.area) && (!ADR.q || [d.id, d.title, d.area, d.context, d.decision, d.consequences, ...(d.options || []).map(o => o.title)].some(x => String(x || '').toLowerCase().includes(ADR.q.toLowerCase())));
  /* ---------- aprobaciones: firmar, sección «Aprobaciones» de la ficha de ADR y de versión ---------- */
  const APPR_COLOR = { approve: 'var(--p-menta)', reject: 'var(--p-coral)', pending: 'var(--p-limon)' };
  // Registra la firma de hoy (ADR: pasa por updateDecision; versión: directo). Devuelve false si el interesado o el veredicto no existen
  function signOff(kind, id, sid, verdict, note) {
    if (!(S.model.stakeholders || []).some(x => x.id === sid) || (verdict !== 'approve' && verdict !== 'reject')) return false;
    const e = { by: sid, verdict, date: today() }, n = String(note ?? '').trim().slice(0, 500);
    if (n) e.note = n;
    if (kind === 'decision') { const d = adrById(id); return !!d && updateDecision(id, { signoffs: [...(d.signoffs || []), e].slice(-SIGN_MAX) }); }
    const v = kind === 'version' && findVersion(id);
    if (!v) return false;
    pushHistory();
    v.signoffs = [...(v.signoffs || []), e].slice(-SIGN_MAX);
    changed(true); renderVersions();
    return true;
  }
  const apprInfo = (kind, id) => { const o = kind === 'decision' ? adrById(id) : kind === 'version' ? findVersion(id) : null; return o ? { ...approvalState(kind, o, S.model), signoffs: clone(o.signoffs || []) } : null; };
  const apprSummary = st => T('appr.sum', { n: st.approved.length, t: st.required.length });
  const apprTone = st => (st.rejected.length ? 'reject' : st.complete ? 'approve' : 'pending');
  // Línea compacta de la ficha cerrada: «2 de 3 aprobaciones»
  const apprLine = (kind, o) => { const st = approvalState(kind, o, S.model); return st.required.length ? `<div class="appr-line" style="--s:${APPR_COLOR[apprTone(st)]}">${esc(apprSummary(st))}</div>` : ''; };
  function apprSection(kind, o) {
    const m = S.model, st = approvalState(kind, o, m), log = o.signoffs || [];
    if (!st.required.length && !log.length) return '';
    const person = id => (m.stakeholders || []).find(x => x.id === id), lastOf = id => [...log].reverse().find(x => x.by === id);
    const rows = st.required.map(id => {
      const p = person(id) || { name: id }, l = lastOf(id), v = st.approved.includes(id) ? 'approve' : st.rejected.includes(id) ? 'reject' : 'pending';
      const chip = v === 'pending' ? T('appr.pending') : `${v === 'approve' ? '✓' : '✗'} ${T(v === 'approve' ? 'appr.approved' : 'appr.rejected')} ${fmtDay(l.date)}`;
      return `<div class="appr-row" style="--s:${APPR_COLOR[v]}"><span class="appr-who"><b>${esc(p.name || id)}</b>${p.role ? ` <em>${esc(p.role)}</em>` : ''}</span><span class="appr-chip">${esc(chip)}</span>
        <span class="appr-btns"><button type="button" class="btn small" data-appr-do="approve" data-appr-sid="${esc(id)}">${esc(T('appr.approve'))}</button><button type="button" class="btn small" data-appr-do="reject" data-appr-sid="${esc(id)}">${esc(T('appr.reject'))}</button></span></div>`;
    }).join('');
    const warns = [];
    if (kind === 'decision') {
      if (typeof raidOf === 'function') { const bad = raidOf('decisions', o.id).filter(x => x.type === 'assumption' && (x.validation === 'invalidated' || (x.validation === 'pending' && typeof raidLate === 'function' && raidLate(x)))).map(x => x.id); if (bad.length) warns.push(T('appr.warn.raid', bad.join(', '))); }
      if (typeof requirementsOf === 'function' && typeof reqCheck === 'function') { const bad = requirementsOf('decisions', o.id).filter(r => r.check && reqCheck(r).state === 'fail').map(r => r.id); if (bad.length) warns.push(T('appr.warn.req', bad.join(', '))); }
    }
    const entry = x => `<li style="--s:${APPR_COLOR[x.verdict]}"><time>${esc(fmtDay(x.date))}</time><span>${esc(person(x.by)?.name || x.by)}</span><b>${x.verdict === 'approve' ? '✓' : '✗'} ${esc(T(x.verdict === 'approve' ? 'appr.approved' : 'appr.rejected'))}</b>${x.note ? `<em>${esc(x.note)}</em>` : ''}</li>`;
    return `<div class="appr" data-appr="${kind}">
      <div class="appr-h"><span>${esc(T('appr.title'))}</span>${st.required.length ? `<b style="--s:${APPR_COLOR[apprTone(st)]}">${esc(apprSummary(st))}</b>` : ''}</div>
      ${rows}${st.required.length ? `<input class="appr-note" data-appr-note maxlength="500" placeholder="${esc(T('appr.note.ph'))}" aria-label="${esc(T('appr.note'))}" autocomplete="off">` : `<p class="adr-hint">${esc(T('appr.none'))}</p>`}
      ${warns.map(w => `<div class="appr-warn">⚠ ${esc(w)}</div>`).join('')}
      ${log.length ? `<details class="appr-log"><summary>${esc(T('appr.log', log.length))}</summary><ol>${[...log].reverse().map(entry).join('')}</ol></details>` : ''}
    </div>`;
  }
  const apprDo = (b, kind, id) => {
    const sid = b.dataset.apprSid, note = b.closest('.appr')?.querySelector('[data-appr-note]')?.value || '';
    if (signOff(kind, id, sid, b.dataset.apprDo, note)) toast(T(b.dataset.apprDo === 'approve' ? 'appr.done.approve' : 'appr.done.reject', apprWho(sid)));
  };

  // Línea de tiempo compacta: fecha · estado · quién · nota (en la ficha abierta, la última entrada se puede editar)
  function adrTimeline(d, edit) {
    const hs = adrHist(d), last = hs.length - 1;
    return `<ol class="adr-hist">${hs.map((h, i) => `<li style="--s:${ADR_COLOR[h.status]}"><time>${esc(fmtDay(h.date))}</time><span class="adr-pill">${esc(T(`adr.st.${h.status}`))}</span>${h.by ? `<span class="adr-by">${esc(h.by)}</span>` : ''}${h.note ? `<span class="adr-note">${esc(h.note)}</span>` : ''}</li>`).join('')}</ol>${edit ? `<div class="adr-two"><label>${esc(T('adr.hist.by'))}<input data-af="hby" value="${esc(hs[last].by || '')}" maxlength="100" autocomplete="off"></label><label>${esc(T('adr.hist.note'))}<input data-af="hnote" value="${esc(hs[last].note || '')}" placeholder="${esc(T('adr.hist.note.ph'))}" maxlength="500" autocomplete="off"></label></div>` : ''}`;
  }
  // Marca de comparación con la versión activa: nueva, cambiada (campos y estado anterior → actual) o igual
  function adrMark(d, cmp) {
    if (!cmp?.diff) return '';
    const df = cmp.diff;
    if (df.added.includes(d.id)) return `<div class="adr-cmp add">${esc(T('adr.cmp.new'))}</div>`;
    const c = df.changed.find(x => x.id === d.id);
    if (!c) return `<div class="adr-cmp same">${esc(T('adr.cmp.same'))}</div>`;
    const old = cmp.v.decisions.find(x => x.id === d.id), FN = { title: 'adr.f.title', status: 'adr.f.status', context: 'adr.f.context', decision: 'adr.f.decision', consequences: 'adr.f.consequences', deciders: 'adr.f.deciders', supersededBy: 'adr.f.superseded', area: 'adr.f.area', criteria: 'adr.crit', options: 'adr.opts', chosen: 'adr.chosen', links: 'adr.f.links', signoffs: 'appr.title' };
    const fs = c.fields.map(f => T(FN[f]).toLowerCase()).join(', '), st = c.fields.includes('status') ? ` · ${T(`adr.st.${old.status}`)} → ${T(`adr.st.${d.status}`)}` : '';
    const more = adrOptDiff(old, d).map(x => `<div class="adr-cmp-d">${esc(x)}</div>`).join('');
    return `<div class="adr-cmp chg">${esc(`${T('adr.cmp.chg')}: ${fs}${st}`)}${more}</div>`;
  }
  // Cambios legibles de opciones, criterios y elegida entre la decisión de una versión (a) y la actual (b)
  function adrOptDiff(a, b) {
    const out = [], by = l => new Map((l || []).map(x => [x.id, x])), nm = o => o.title || o.id;
    const ac = by(a.criteria), bc = by(b.criteria), ao = by(a.options), bo = by(b.options);
    bc.forEach((c, id) => { if (!ac.has(id)) out.push(T('adr.cmp.c.add', { t: c.label, w: c.weight })); else if (ac.get(id).weight !== c.weight || ac.get(id).label !== c.label) out.push(T('adr.cmp.c.chg', { t: c.label, a: ac.get(id).weight, b: c.weight })); });
    ac.forEach((c, id) => { if (!bc.has(id)) out.push(T('adr.cmp.c.del', { t: c.label })); });
    bo.forEach((o, id) => {
      if (!ao.has(id)) return void out.push(T('adr.cmp.o.add', { t: nm(o) }));
      const p = ao.get(id), fs = ['title', 'summary', 'pros', 'cons', 'cost', 'risk', 'version', 'scores'].filter(f => canon(p[f] ?? null) !== canon(o[f] ?? null));
      if (fs.length) out.push(T('adr.cmp.o.chg', { t: nm(o), f: fs.map(f => T(`adr.o.${f}`).toLowerCase()).join(', ') }));
    });
    ao.forEach((o, id) => { if (!bo.has(id)) out.push(T('adr.cmp.o.del', { t: nm(o) })); });
    if ((a.chosen || '') !== (b.chosen || '')) out.push(T('adr.cmp.chosen', { a: a.chosen ? nm(ao.get(a.chosen) || { id: a.chosen }) : '—', b: b.chosen ? nm(bo.get(b.chosen) || { id: b.chosen }) : '—' }));
    { const sk = x => `${x.by}|${x.verdict}|${x.date}`, had = new Set((a.signoffs || []).map(sk));   // firmas nuevas desde la versión
      (b.signoffs || []).filter(x => !had.has(sk(x))).forEach(x => out.push(T(x.verdict === 'approve' ? 'appr.cmp.approved' : 'appr.cmp.rejected', x.by))); }
    return out;
  }
  function adrGone(d) {
    return `<div class="adr gone" style="--s:${ADR_COLOR[d.status]}"><div class="adr-head"><b class="adr-id">${esc(d.id)}</b><span class="adr-title">${esc(adrTitle(d))}</span><span class="adr-pill">${esc(T(`adr.st.${d.status}`))}</span></div><div class="adr-cmp del">${esc(T('adr.cmp.del'))}</div></div>`;
  }
  // Sección «Opciones»: matriz opciones × criterios (puntajes 1..5, total ponderado, ★ líder, ✓ elegida) y, desplegada, la ficha de cada opción
  const adrMeta = d => [fmtDay(d.date), d.deciders, d.area].filter(Boolean).join(' · ') + (d.supersededBy ? ` · ${T('adr.f.superseded')}: ${d.supersededBy}` : '');
  function adrOptions(d) {
    const cs = d.criteria || [], os = d.options || [], lead = adrLeader(d), key = o => `${d.id}|${o.id}`, nm = o => o.title || T('adr.opt.untitled', o.id);
    const sel = (attrs, cur, items, label) => `<select ${attrs} aria-label="${esc(label)}">${items.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(cur ?? '') ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
    const head = cs.map(c => `<th class="adr-mx-c"><input data-ac="label" data-cid="${esc(c.id)}" value="${esc(c.label)}" maxlength="80" size="8" autocomplete="off" aria-label="${esc(T('adr.crit.name'))}" title="${esc(c.label)}">
      <span class="adr-mx-w">${sel(`data-ac="weight" data-cid="${esc(c.id)}"`, c.weight, [1, 2, 3, 4, 5].map(n => [n, `×${n}`]), T('adr.crit.weight'))}<button type="button" class="adr-x" data-adr-rmcrit="${esc(c.id)}" title="${esc(T('adr.crit.remove'))}" aria-label="${esc(T('adr.crit.remove'))}">×</button></span></th>`).join('');
    const rows = os.map(o => {
      const sc = adrScore(d, o), full = adrFull(sc), isC = d.chosen === o.id, isL = lead === o.id && os.length > 1, on = ADR.opt.has(key(o));
      return `<tr class="${isC ? 'chosen' : ''}"><th scope="row" class="adr-mx-o"><button type="button" class="adr-mx-t" data-adr-optopen="${esc(o.id)}" aria-expanded="${on}" title="${esc(T('adr.opt.edit'))}"><b>${esc(o.id)}</b> <span data-opt-title="${esc(o.id)}">${esc(nm(o))}</span></button>${isL ? `<span class="adr-mark lead" title="${esc(T('adr.leader'))}" aria-label="${esc(T('adr.leader'))}">★</span>` : ''}${isC ? `<span class="adr-mark ok">✓ ${esc(T('adr.chosen'))}</span>` : ''}</th>
        ${cs.map(c => `<td>${sel(`data-as="1" data-oid="${esc(o.id)}" data-cid="${esc(c.id)}"`, o.scores?.[c.id], [['', '–'], ...[1, 2, 3, 4, 5].map(n => [n, String(n)])], `${nm(o)} · ${c.label}`)}</td>`).join('')}
        <td class="adr-mx-tot">${sc.scored ? `<span class="adr-bar" title="${esc(T('adr.total.tip', { s: sc.scored, n: sc.total }))}"><i style="width:${sc.pct}%"></i></span><b>${sc.pct}%</b>${full || !sc.total ? '' : `<em>${sc.scored}/${sc.total}</em>`}` : '–'}</td>
        <td class="adr-mx-a"><button type="button" class="btn small${isC ? ' primary' : ''}" data-adr-choose="${esc(o.id)}" aria-pressed="${isC}">${esc(T(isC ? 'adr.unchoose' : 'adr.choose'))}</button><button type="button" class="adr-x" data-adr-rmopt="${esc(o.id)}" title="${esc(T('adr.opt.remove'))}" aria-label="${esc(T('adr.opt.remove'))}">×</button></td></tr>`;
    }).join('');
    const free = S.model.versions || [];
    const det = os.filter(o => ADR.opt.has(key(o))).map(o => `<div class="adr-opt" data-oid="${esc(o.id)}"><div class="adr-opt-h"><b>${esc(o.id)}</b><span>${esc(nm(o))}</span><button type="button" class="adr-x" data-adr-optopen="${esc(o.id)}" title="${esc(T('adr.opt.close'))}" aria-label="${esc(T('adr.opt.close'))}">×</button></div>
      <label>${esc(T('adr.f.title'))}<input data-ao="title" data-oid="${esc(o.id)}" value="${esc(o.title)}" maxlength="120" autocomplete="off"></label>
      <label>${esc(T('adr.o.summary'))}<textarea data-ao="summary" data-oid="${esc(o.id)}" rows="2" maxlength="2000">${esc(o.summary || '')}</textarea></label>
      <label>${esc(T('adr.o.pros'))}<textarea data-ao="pros" data-oid="${esc(o.id)}" rows="3" maxlength="2000">${esc(o.pros || '')}</textarea></label>
      <label>${esc(T('adr.o.cons'))}<textarea data-ao="cons" data-oid="${esc(o.id)}" rows="3" maxlength="2000">${esc(o.cons || '')}</textarea></label>
      <div class="adr-two"><label>${esc(T('adr.o.costm', COST.currency))}<input type="number" min="0" step="any" data-ao="cost" data-oid="${esc(o.id)}" value="${o.cost != null ? esc(o.cost) : ''}" autocomplete="off"></label>
        <label>${esc(T('adr.o.risk'))}${sel(`data-ao="risk" data-oid="${esc(o.id)}"`, o.risk, [['', '–'], ...ADR_RISK.map(r => [r, T(`adr.risk.${r}`)])], T('adr.o.risk'))}</label></div>
      <label>${esc(T('adr.o.version'))}${sel(`data-ao="version" data-oid="${esc(o.id)}"`, o.version, [['', '–'], ...free.map(v => [v.id, verLabel(v)])], T('adr.o.version'))}</label>
      ${o.version && findVersion(o.version) ? `<div class="adr-row"><button type="button" class="btn small" data-adr-optcmp="${esc(o.id)}">${esc(T('adr.o.compare'))}</button><button type="button" class="btn small" data-adr-optgo="${esc(o.id)}">${esc(T('adr.o.show'))}</button></div>` : ''}</div>`).join('');
    const wide = ADR.wide === d.id;   // ampliada: la misma sección, fija sobre la pantalla (p. ej. para puntuar con el cliente)
    return `${wide ? '<div class="adr-back" data-adr="wide"></div>' : ''}<div class="adr-opts${wide ? ' wide' : ''}"><div class="adr-opts-h"><span>${esc(T('adr.opts'))}</span><button type="button" class="btn small" data-adr="addopt">+ ${esc(T('adr.opt.add'))}</button><button type="button" class="btn small" data-adr="addcrit">+ ${esc(T('adr.crit.add'))}</button>${os.length ? `<button type="button" class="btn small" data-adr="wide" title="${esc(T('adr.wide.tip'))}">${esc(T(wide ? 'adr.narrow' : 'adr.wide'))}</button>` : ''}</div>
      ${os.length ? `<div class="adr-mx-wrap"><table class="adr-mx"><thead><tr><th class="adr-mx-o">${esc(T('adr.opt'))}</th>${head}<th class="adr-mx-tot">${esc(T('adr.total'))}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      ${cs.length ? '' : `<p class="adr-hint">${esc(T('adr.crit.hint'))}</p>`}` : `<p class="adr-hint">${esc(T('adr.opts.empty'))}</p>`}${det}</div>`;
  }
  function adrCard(d, ds, cmp) {
    const on = ADR.open === d.id, links = adrLinkList(d), col = ADR_COLOR[d.status];
    const goChip = (l, rm) => `<span class="adr-link"><button type="button" data-adr-go="${l.kind}:${esc(l.id)}" title="${esc(T('adr.go'))}">${esc(T(`adr.kind.${l.kind}`))}: ${esc(l.label)}</button>${rm ? `<button type="button" class="adr-x" data-adr-unlink="${l.kind}:${esc(l.id)}" title="${esc(T('adr.unlink'))}" aria-label="${esc(T('adr.unlink'))}">×</button>` : ''}</span>`;
    let form = '';
    if (on) {
      const others = ds.filter(x => x.id !== d.id), free = S.model.versions.filter(v => !d.links?.versions?.includes(v.id));
      form = `<div class="adr-form">
        <label>${esc(T('adr.f.id'))}<input value="${esc(d.id)}" readonly></label>
        <label>${esc(T('adr.f.title'))}<input data-af="title" value="${esc(d.title)}" maxlength="200" autocomplete="off"></label>
        <div class="adr-two"><label>${esc(T('adr.f.status'))}<select data-af="status">${ADR_STATUS.map(k => `<option value="${k}"${k === d.status ? ' selected' : ''}>${esc(T(`adr.st.${k}`))}</option>`).join('')}</select></label>
          <label>${esc(T('adr.f.date'))}<input type="date" data-af="date" value="${esc(d.date)}"></label></div>
        <label>${esc(T('adr.f.deciders'))}<input data-af="deciders" value="${esc(d.deciders || '')}" placeholder="${esc(T('adr.f.deciders.ph'))}" maxlength="200" autocomplete="off"></label>
        <label>${esc(T('adr.f.area'))}<input data-af="area" value="${esc(d.area || '')}" list="adr-areas" placeholder="${esc(T('adr.f.area.ph'))}" maxlength="60" autocomplete="off"></label>
        <datalist id="adr-areas">${[...new Set(ds.map(x => x.area).filter(Boolean))].map(a => `<option value="${esc(a)}">`).join('')}</datalist>
        ${['context', 'decision', 'consequences'].map(k => `${k === 'decision' ? adrOptions(d) : ''}<label>${esc(T(`adr.f.${k}`))}<textarea data-af="${k}" rows="4" placeholder="${esc(T(`adr.f.${k}.ph`))}">${esc(d[k])}</textarea></label>`).join('')}
        <div class="adr-histbox"><span>${esc(T('adr.hist'))}</span>${adrTimeline(d, true)}</div>
        ${apprSection('decision', d)}
        <label>${esc(T('adr.f.superseded'))}<select data-af="supersededBy"><option value="">${esc(T('insp.none'))}</option>${others.map(x => `<option value="${esc(x.id)}"${x.id === d.supersededBy ? ' selected' : ''}>${esc(`${x.id} · ${adrTitle(x)}`)}</option>`).join('')}</select></label>
        <div class="adr-links-edit"><span>${esc(T('adr.f.links'))}</span>${links.length ? links.map(l => goChip(l, true)).join('') : `<em>${esc(T('adr.noLinks'))}</em>`}
          <div class="adr-row"><button class="btn small" data-adr="linksel">${esc(T('adr.linkSel'))}</button>
          ${free.length ? `<select data-adr-linkver aria-label="${esc(T('adr.linkVer'))}"><option value="">${esc(T('adr.linkVer'))}</option>${free.map(v => `<option value="${esc(v.id)}">${esc(verLabel(v))}</option>`).join('')}</select>` : ''}</div></div>
        <button class="btn small danger" data-adr="del">${esc(T('adr.delete'))}</button>
      </div>`;
    }
    return `<div class="adr${on ? ' on' : ''}" data-id="${esc(d.id)}" style="--s:${col}">
      <button type="button" class="adr-head" data-adr-toggle aria-expanded="${on}"><b class="adr-id">${esc(d.id)}</b><span class="adr-title">${esc(adrTitle(d))}</span><span class="adr-pill">${esc(T(`adr.st.${d.status}`))}</span></button>
      <div class="adr-meta">${esc(adrMeta(d))}</div>
      ${d.options?.length ? `<div class="adr-osum">${esc(T('adr.osum', { n: d.options.length }))}${d.chosen ? ` · <b>✓ ${esc(d.options.find(o => o.id === d.chosen).title || d.chosen)}</b>` : ''}</div>` : ''}
      ${apprLine('decision', d)}
      ${adrMark(d, cmp)}
      ${reqChipsFor(d.id)}
      ${!on && links.length ? `<div class="adr-links">${links.map(l => goChip(l, false)).join('')}</div>` : ''}
      ${raidBanner(d)}
      ${raidChipsFor(d.id)}
      ${form}
    </div>`;
  }
  function renderAdrList() {
    const box = $('#adr-list');
    if (!box || !S.model) return;
    const ds = S.model.decisions || [], shown = ds.filter(adrMatches);
    const keep = box.parentElement?.scrollTop || 0, hs = [...box.querySelectorAll('.adr-mx-wrap')].map(w => [w.closest('.adr')?.dataset.id, w.scrollLeft]);
    const cmp = adrCmp(), gone = cmp?.diff ? cmp.diff.removed.map(id => cmp.v.decisions.find(x => x.id === id)).filter(adrMatches) : [];
    const note = cmp && !cmp.diff ? `<p class="adr-cmp-note">${esc(T('adr.cmp.none', { name: verLabel(cmp.v) }))}</p>` : '';
    box.innerHTML = note + (!ds.length && !gone.length ? `<p class="fnd-empty">${esc(T('adr.empty'))}</p>`
      : shown.length || gone.length ? shown.map(d => adrCard(d, ds, cmp)).join('') + gone.map(adrGone).join('') : `<p class="fnd-empty">${esc(T('adr.noMatch'))}</p>`);
    if (box.parentElement) box.parentElement.scrollTop = keep;
    hs.forEach(([id, x]) => { if (x) { const w = box.querySelector(`.adr[data-id="${CSS.escape(id)}"] .adr-mx-wrap`); if (w) w.scrollLeft = x; } });
  }
  // Actualiza la cabecera de una ficha sin repintarla (para no perder el foco al escribir)
  function adrRefreshHead(card, d) {
    card.querySelector('.adr-title').textContent = adrTitle(d);
    card.querySelector('.adr-meta').textContent = adrMeta(d);
  }
  adrPanel?.addEventListener('focusin', ev => { if ((ev.target.dataset?.af || ev.target.dataset?.ao || ev.target.dataset?.ac) && ev.target.tagName !== 'SELECT') beginEdit(); });
  adrPanel?.addEventListener('focusout', ev => { if (ev.target.dataset?.af || ev.target.dataset?.ao || ev.target.dataset?.ac) endEdit(); });
  adrPanel?.addEventListener('input', ev => {
    const f = ev.target;
    if (f.id === 'adr-q') { ADR.q = f.value; return renderAdrList(); }
    if ((f.dataset?.ao || f.dataset?.ac) && f.tagName !== 'SELECT') {   // texto de una opción o de un criterio: se escribe directo en el modelo (como los campos de la ficha); cleanDecisions lo sanea al siguiente cambio
      const dd = adrById(f.closest('.adr')?.dataset.id);
      if (!dd) return;
      const ao = f.dataset.ao, tgt = ao ? (dd.options || []).find(o => o.id === f.dataset.oid) : (dd.criteria || []).find(c => c.id === f.dataset.cid);
      if (!tgt) return;
      markEdit();
      if (!ao) tgt.label = f.value;
      else if (ao === 'cost') { const v = f.value === '' ? NaN : Number(f.value); if (Number.isFinite(v) && v >= 0) tgt.cost = v; else delete tgt.cost; }
      else if (f.value.trim() || ao === 'title') tgt[ao] = f.value; else delete tgt[ao];
      if (ao === 'title') f.closest('.adr-form')?.querySelectorAll(`[data-opt-title="${CSS.escape(tgt.id)}"], .adr-opt[data-oid="${CSS.escape(tgt.id)}"] .adr-opt-h span`).forEach(e => { e.textContent = f.value || T('adr.opt.untitled', tgt.id); });
      syncEditor(); save();
      return;
    }
    const k = f.dataset?.af, card = f.closest('.adr'), d = k && f.tagName !== 'SELECT' && card && adrById(card.dataset.id);
    if (!d) return;
    if (k === 'date' && !isDay(f.value)) return;
    markEdit();
    if (k === 'hby' || k === 'hnote') {   // última entrada del historial (como syncHist en las versiones); en decisiones antiguas se crea la entrada implícita
      const hs = d.history?.length ? d.history : (d.history = [{ status: d.status, date: d.date }]), e = hs[hs.length - 1], key = k === 'hby' ? 'by' : 'note', val = f.value.trim();
      if (val) e[key] = val; else delete e[key];
      syncEditor(); save();
      return;
    }
    if (k === 'date' && d.history?.length) d.history[d.history.length - 1].date = f.value;
    if (k === 'deciders' && !f.value.trim()) delete d.deciders; else d[k] = f.value;
    syncEditor(); save();
    adrRefreshHead(card, d);
  });
  adrPanel?.addEventListener('change', ev => {
    const f = ev.target, card = f.closest('.adr'), d = card && adrById(card.dataset.id);
    if (!d) return;
    if (f.dataset.adrLinkver != null) { if (f.value) updateDecision(d.id, { links: adrAddLinks(d, { versions: [f.value] }) }); return; }
    if (f.dataset.as != null) {   // puntaje de una opción en un criterio
      const o = (d.options || []).find(x => x.id === f.dataset.oid), sc = { ...(o?.scores || {}) };
      if (!o) return;
      if (f.value) sc[f.dataset.cid] = +f.value; else delete sc[f.dataset.cid];
      return void adrOptPatch(d, o.id, { scores: sc });
    }
    if (f.dataset.ac === 'weight') return void updateDecision(d.id, { criteria: (d.criteria || []).map(c => (c.id === f.dataset.cid ? { ...c, weight: +f.value } : c)) });
    if (f.dataset.ao && f.tagName === 'SELECT') return void adrOptPatch(d, f.dataset.oid, { [f.dataset.ao]: f.value });
    if (f.dataset.ao || f.dataset.ac) { changed(true); renderInspector(); renderVersions(); if (f.dataset.ac) renderAdr(true); return; }
    const k = f.dataset.af;
    if (!k) return;
    if (f.tagName === 'SELECT') {
      if (k === 'status') {
        const gap = f.value === 'accepted' && d.status !== 'accepted' ? apprMissing('decision', d) : [];
        if (!gap.length) return void updateDecision(d.id, { status: f.value });
        f.value = d.status;   // pregunta antes de aceptar sin todas las firmas (no bloquea)
        confirmBox({ title: T('appr.cf.title'), text: T('appr.cf.text', gap.join(', ')), ok: T('appr.cf.ok'), cancel: T('ver.cf.cancel') }).then(ok => { if (ok && adrById(d.id)) updateDecision(d.id, { status: 'accepted' }); });
      }
      else if (k === 'supersededBy') updateDecision(d.id, f.value ? { supersededBy: f.value, status: 'superseded' } : { supersededBy: '' });
    } else { changed(true); renderInspector(); renderVersions(); }
  });
  adrPanel?.addEventListener('click', async ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    const d0 = b.dataset, card = b.closest('.adr'), d = card && adrById(card.dataset.id);
    if (d0.adrSt != null) { ADR.st = ADR.st === d0.adrSt ? '' : d0.adrSt; return renderAdr(true); }
    if (d0.adrArea != null) { ADR.area = ADR.area === d0.adrArea ? '' : d0.adrArea; return renderAdr(true); }
    if (d0.adr === 'kits') { ADR.menu = !ADR.menu; return renderAdr(true); }
    if (d0.adrKit) {
      const kit = adrKits().find(k => k.id === d0.adrKit);
      ADR.menu = false;
      if (kit && await confirmBox({ title: T('adr.kit.cf.title', loc(kit.name)), text: T('adr.kit.cf.text', kit.decisions.length), ok: T('adr.kit.cf.ok'), cancel: T('ver.cf.cancel') })) { ADR.q = ''; ADR.st = ''; ADR.area = ''; addDecisionKit(kit.id); }
      return renderAdr(true);
    }
    if (d0.adr === 'new') { ADR.q = ''; ADR.st = ''; return adrOpen(addDecision()); }
    if (d0.adr === 'md') return exportDecisions();
    if (d0.adrToggle != null && d) { ADR.open = ADR.open === d.id ? null : d.id; return renderAdr(true); }
    if (d0.adrGo) { const [k, ...r] = d0.adrGo.split(':'); return adrFocus(k, r.join(':')); }
    if (!d) return;
    if (d0.apprDo) return void apprDo(b, 'decision', d.id);
    if (d0.adr === 'wide') { ADR.wide = ADR.wide === d.id ? null : d.id; return renderAdr(true); }
    if (d0.adr === 'addopt') return adrAddOption(d);
    if (d0.adr === 'addcrit') return adrAddCriterion(d);
    if (d0.adrOptopen != null) { const k = `${d.id}|${d0.adrOptopen}`; if (!ADR.opt.delete(k)) ADR.opt.add(k); return renderAdr(true); }
    if (d0.adrChoose != null) return void updateDecision(d.id, { chosen: d.chosen === d0.adrChoose ? '' : d0.adrChoose });
    if (d0.adrRmopt != null) { ADR.opt.delete(`${d.id}|${d0.adrRmopt}`); return void updateDecision(d.id, { options: (d.options || []).filter(o => o.id !== d0.adrRmopt) }); }
    if (d0.adrRmcrit != null) return void updateDecision(d.id, { criteria: (d.criteria || []).filter(c => c.id !== d0.adrRmcrit) });
    if (d0.adrOptcmp != null || d0.adrOptgo != null) {
      const vid = (d.options || []).find(o => o.id === (d0.adrOptcmp ?? d0.adrOptgo))?.version;
      if (!vid || !findVersion(vid)) return;
      if (d0.adrOptgo != null) return adrGotoVersion(vid);
      if (S.compare?.id !== vid) compareVersion(vid);
      return toast(T('adr.o.comparing', verLabel(findVersion(vid))));
    }
    if (d0.adrUnlink) {
      const [k, ...r] = d0.adrUnlink.split(':'), id = r.join(':');
      return void updateDecision(d.id, { links: { ...d.links, [k]: (d.links?.[k] || []).filter(x => x !== id) } });
    }
    if (d0.adr === 'linksel') {
      const l = adrSelLinks();
      if (!l) return toast(T('adr.noSel'));
      return void updateDecision(d.id, { links: adrAddLinks(d, l) });
    }
    if (d0.adr === 'del' && await confirmBox({ title: T('adr.cf.title', d.id), text: T('adr.cf.text', adrTitle(d)), ok: T('adr.delete'), cancel: T('ver.cf.cancel'), danger: true })) removeDecision(d.id);
  });

  /* ---------- registro RAID: crear/cambiar/borrar, pestaña, enlaces, inspector y ficha de ADR ---------- */
  const RAID = { open: null, type: 'all', st: '', q: '', cell: null };   // ficha abierta, filtros por tipo, estado y búsqueda, celda del mapa de calor ({ p, i })
  const raidTitle = it => it.title || it.id;
  const raidStateLabel = it => T(`raid.st.${raidState(it)}`);
  const raidKinds = ['decisions', 'requirements', 'nodes', 'edges', 'groups'];
  const raidLate = it => !!it.due && it.due < today() && (it.type === 'assumption' ? it.validation === 'pending' : it.type !== 'risk' && it.status === 'open');
  function raidLinkLabel(kind, id) {
    if (kind === 'decisions') { const d = adrById(id); return d ? `${d.id} · ${adrTitle(d)}` : id; }
    if (kind === 'requirements') { const r = (S.model.requirements || []).find(x => x.id === id); return r ? [r.id, r.title].filter(Boolean).join(' · ') : id; }
    return adrLinkLabel(kind, id);
  }
  const raidLinkList = it => raidKinds.flatMap(k => (it.links?.[k] || []).map(id => ({ kind: k, id, label: raidLinkLabel(k, id) || id })));
  const raidChips = list => (list.length ? `<div class="raid-chips">${list.map(x => `<button type="button" class="raid-chip" data-raid-open="${esc(x.id)}" style="--s:${RAID_TYPE_COLOR[x.type]}" title="${esc(`${x.id} · ${raidTitle(x)} · ${raidStateLabel(x)}`)}"><b>${esc(x.id)}</b> ${esc(x.title)}</button>`).join('')}</div>` : '');
  // Ficha de ADR: items del registro que enlazan a la decisión, y aviso rojo si la sostiene un supuesto invalidado
  const raidChipsFor = (id, kind = 'decisions') => { const l = raidOf(kind, id);   // supuestos y riesgos de una decisión (o de un requisito)
    return l.length ? `<div class="raid-row"><span>${esc(T('raid.chips'))}</span>${raidChips(l)}</div>` : ''; };
  function raidBanner(d) {
    if (d.status !== 'accepted' && d.status !== 'proposed') return '';
    const bad = raidOf('decisions', d.id).filter(x => x.type === 'assumption' && x.validation === 'invalidated').map(x => x.id);
    return bad.length ? `<div class="raid-warn" role="alert"><span>${esc(T('raid.banner', bad.join(', ')))}</span>${d.status === 'accepted' ? `<button type="button" class="btn small" data-raid-reopen="${esc(bad.join(', '))}">${esc(T('raid.reopen'))}</button>` : ''}</div>` : '';
  }
  // Inspector del nodo, conexión o grupo: una fila compacta, solo si hay items enlazados
  const raidField = t => { const kind = adrKindOfSel(), l = kind ? raidOf(kind, t.id) : []; return l.length ? `<div class="field raid-field">${T('raid.field')}${raidChips(l)}</div>` : ''; };

  // Crear, cambiar y borrar: todo pasa por cleanRaid, así tipo, campos y enlaces siempre quedan coherentes
  function addRaid(p = {}) {
    p = p && typeof p === 'object' ? p : {};
    if ((S.model.raid || []).length >= RAID_MAX) { toast(T('adr.max', RAID_MAX)); return ''; }
    const type = raidType(p.type) || 'risk';
    pushHistory();
    const list = cleanRaid([...(S.model.raid || []), { raised: today(), ...p, type, title: p.title || T(`raid.new.${type}`) }], S.model), nd = list[list.length - 1];
    S.model.raid = list;
    changed(true); renderInspector(); renderAdr(true); renderRaid(true);
    return nd.id;
  }
  function updateRaid(id, patch) {
    const it = raidById(id);
    if (!it || !patch || typeof patch !== 'object') return false;
    pushHistory();
    const list = cleanRaid(S.model.raid.map(x => (x === it ? { ...it, ...patch, id: it.id, type: it.type } : x)), S.model), nd = list.find(x => x.id === it.id);
    if (nd && nd.type === 'assumption' && nd.validation !== it.validation) {   // cambió la validación: se anota con la fecha de hoy y el autor
      const e = { validation: nd.validation, date: today() }, by = adrAuthor();
      if (by) e.by = by;
      nd.history = [...(nd.history || []), e].slice(-100);
    }
    S.model.raid = list;
    changed(true); renderInspector(); renderAdr(true); renderRaid(true);
    return true;
  }
  function removeRaid(id) {
    if (!raidById(id)) return false;
    pushHistory();
    S.model.raid = cleanRaid(S.model.raid.filter(x => x.id !== id), S.model);
    if (RAID.open === id) RAID.open = null;
    changed(true); renderInspector(); renderAdr(true); renderRaid(true);
    return true;
  }
  const validateAssumption = (id, ok) => (raidById(id)?.type === 'assumption' ? updateRaid(id, { validation: ok ? 'validated' : 'invalidated' }) : false);
  // «Reabrir decisión»: vuelve a «propuesta» con una nota en su historial
  function raidReopen(did, ids) {
    const d = adrById(did);
    if (!d || d.status !== 'accepted') return false;
    updateDecision(did, { status: 'proposed' });
    const nd = adrById(did), h = nd?.history?.[nd.history.length - 1];
    if (h) { h.note = T('raid.reopen.note', ids); syncEditor(); save(); renderAdr(true); }
    return true;
  }
  // Enlaces de la selección actual (como adrSelLinks) y alta de enlaces
  const raidAddLinks = (it, add) => { const l = {}; raidKinds.forEach(k => { const v = [...(it.links?.[k] || []), ...(add[k] || [])]; if (v.length) l[k] = v; }); return l; };

  /* pestaña */
  const raidPanel = $('#raid-panel');
  const raidFilterQ = it => !RAID.q || [it.id, it.title, it.detail, it.owner, it.mitigation].some(x => String(x || '').toLowerCase().includes(RAID.q.toLowerCase()));
  const raidMatches = (it, noCell) => (RAID.type === 'all' || it.type === RAID.type) && (!RAID.st || raidState(it) === RAID.st) && raidFilterQ(it)
    && (noCell || !RAID.cell || (it.type === 'risk' && it.probability === RAID.cell.p && it.impact === RAID.cell.i));
  function raidHeatHtml() {
    const g = raidHeat((S.model.raid || []).filter(x => raidMatches(x, true))), cell = (p, i) => {
      const n = g[i - 1][p - 1], lv = raidLevel(p * i), on = RAID.cell && RAID.cell.p === p && RAID.cell.i === i;
      return `<button type="button" class="raid-cell${n ? ' has' : ''}${on ? ' on' : ''}" data-raid-cell="${p},${i}" style="--s:${RAID_LEVEL_COLOR[lv]}" aria-pressed="${on}" aria-label="${esc(T('raid.heat.cell', { p, i, n }))}" title="${esc(T('raid.heat.cell', { p, i, n }))}">${n || ''}</button>`;
    };
    const rows = [5, 4, 3, 2, 1].map(i => `<span class="raid-ax">${i}</span>${[1, 2, 3, 4, 5].map(p => cell(p, i)).join('')}`).join('');
    return `<div class="raid-heat" role="group" aria-label="${esc(T('raid.heat'))}"><div class="raid-heat-t">${esc(T('raid.heat'))} <small>${esc(T('raid.heat.axes'))}</small></div><div class="raid-heat-g">${rows}<span></span>${[1, 2, 3, 4, 5].map(p => `<span class="raid-ax">${p}</span>`).join('')}</div></div>`;
  }
  function renderRaidBar() {
    const all = S.model.raid || [], now = today(), sm = raidSummary(S.model, now);
    const n = t => all.filter(x => x.type === t).length;
    const chip = (attr, k, on, label, c, color) => `<button class="fnd-chip${on ? ' on' : ''}" ${attr}="${k}" aria-pressed="${on}" style="--s:${color}">${esc(label)} <b>${c}</b></button>`;
    const parts = [];
    if (sm.risks) parts.push(`<span>${esc(T('raid.sum.risks', sm))}</span>`);
    if (sm.toValidate) parts.push(`<span>${esc(T('raid.sum.validate', sm.toValidate))}</span>`);
    if (sm.overdue) parts.push(`<span class="raid-late">${esc(T('raid.sum.overdue', sm.overdue))}</span>`);
    const states = [...new Set(all.filter(x => RAID.type === 'all' || x.type === RAID.type).map(raidState))];
    if (RAID.st && !states.includes(RAID.st)) RAID.st = '';
    if (RAID.cell && RAID.type !== 'risk') RAID.cell = null;
    $('#raid-bar').innerHTML = `<div class="raid-tools">${RAID_TYPES.map(t => `<button class="btn small${t === 'risk' ? ' primary' : ''}" data-raid-add="${t}" title="${esc(T(`raid.new.${t}`))}">+ ${esc(T(`raid.type1.${t}`))}</button>`).join('')}</div>
      ${all.length ? `<div class="raid-sum" aria-live="polite">${parts.length ? parts.join(' · ') : esc(T('raid.sum.none'))}</div>
      <div class="fnd-chips raid-types" role="group" aria-label="${esc(T('raid.filter'))}">${chip('data-raid-type', 'all', RAID.type === 'all', T('raid.type.all'), all.length, 'var(--accent)')}${RAID_TYPES.filter(t => n(t) || RAID.type === t).map(t => chip('data-raid-type', t, RAID.type === t, T(`raid.type.${t}`), n(t), RAID_TYPE_COLOR[t])).join('')}</div>
      ${RAID.type === 'risk' ? raidHeatHtml() : ''}
      ${states.length > 1 ? `<div class="fnd-chips" role="group" aria-label="${esc(T('raid.f.status'))}">${states.map(s => chip('data-raid-st', s, RAID.st === s, T(`raid.st.${s}`), all.filter(x => (RAID.type === 'all' || x.type === RAID.type) && raidState(x) === s).length, RAID_COLOR[s])).join('')}</div>` : ''}
      <input class="search" id="raid-q" style="padding-left:10px;margin-bottom:6px" value="${esc(RAID.q)}" placeholder="${esc(T('raid.search'))}" aria-label="${esc(T('raid.search'))}" autocomplete="off">` : ''}`;
  }
  function renderRaid(force) {
    if (!raidPanel || !S.model || !$('.pane[data-pane="raid"]')?.classList.contains('on')) return;
    const a = document.activeElement;
    if (!force && a && raidPanel.contains(a) && a.matches('input, textarea, select')) return;   // no pisar lo que se está escribiendo
    if (RAID.open && !raidById(RAID.open)) RAID.open = null;
    renderRaidBar();
    renderRaidList();
  }
  const raidSel = (attrs, cur, items, label) => `<select ${attrs} aria-label="${esc(label)}">${items.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(cur ?? '') ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const raidScaleOpts = () => [['', '–'], ...[1, 2, 3, 4, 5].map(n => [n, `${n} · ${T(`raid.scale.${n}`)}`])];
  const raidDueLabel = it => T(it.type === 'assumption' ? 'raid.f.due.a' : 'raid.f.due.n');
  const raidMeta = it => [it.owner, it.due ? `${raidDueLabel(it)}: ${fmtDay(it.due)}` : '', it.raised ? `${T('raid.f.raised')}: ${fmtDay(it.raised)}` : ''].filter(Boolean).join(' · ');
  const raidScoreBadge = it => { const s = raidScore(it); return s ? `<span class="raid-score" style="--s:${RAID_LEVEL_COLOR[raidLevel(s)]}" title="${esc(T('raid.f.score'))}: ${s} · ${esc(T(`raid.lvl.${raidLevel(s)}`))}">${s}</span>` : ''; };
  function raidTimeline(it) {
    const hs = it.history || [];
    return hs.length ? `<ol class="raid-hist">${hs.map(h => `<li style="--s:${RAID_COLOR[h.validation]}"><time>${esc(fmtDay(h.date))}</time><span class="raid-pill">${esc(T(`raid.st.${h.validation}`))}</span>${h.by ? `<span class="raid-by">${esc(h.by)}</span>` : ''}${h.note ? `<span>${esc(h.note)}</span>` : ''}</li>`).join('')}</ol>` : `<p class="raid-hint">${esc(T('raid.hist.empty'))}</p>`;
  }
  function raidCard(it) {
    const on = RAID.open === it.id, links = raidLinkList(it), st = raidState(it), late = raidLate(it);
    const goChip = (l, rm) => `<span class="raid-link"><button type="button" data-raid-go="${l.kind}:${esc(l.id)}" title="${esc(T('raid.go'))}">${esc(T(`raid.kind.${l.kind}`))}: ${esc(l.label)}</button>${rm ? `<button type="button" class="raid-x" data-raid-unlink="${l.kind}:${esc(l.id)}" title="${esc(T('raid.unlink'))}" aria-label="${esc(T('raid.unlink'))}">×</button>` : ''}</span>`;
    let form = '';
    if (on) {
      const freeD = (S.model.decisions || []).filter(d => !it.links?.decisions?.includes(d.id)), freeR = (S.model.requirements || []).filter(r => !it.links?.requirements?.includes(r.id));
      form = `<div class="raid-form">
        <label>${esc(T('raid.f.id'))}<input value="${esc(it.id)}" readonly></label>
        <label>${esc(T('raid.f.title'))}<input data-rf="title" value="${esc(it.title)}" maxlength="200" autocomplete="off"></label>
        <label>${esc(T('raid.f.detail'))}<textarea data-rf="detail" rows="3" placeholder="${esc(T('raid.f.detail.ph'))}">${esc(it.detail || '')}</textarea></label>
        <div class="raid-two"><label>${esc(T('raid.f.owner'))}<input data-rf="owner" value="${esc(it.owner || '')}" placeholder="${esc(T('raid.f.owner.ph'))}" maxlength="120" autocomplete="off"></label>
          <label>${esc(T(it.type === 'assumption' ? 'raid.f.validation' : 'raid.f.status'))}${it.type === 'assumption' ? raidSel('data-rs="validation"', it.validation, RAID_VAL.map(v => [v, T(`raid.st.${v}`)]), T('raid.f.validation')) : raidSel('data-rs="status"', it.status, RAID_STATUS.map(v => [v, T(`raid.st.${v}`)]), T('raid.f.status'))}</label></div>
        ${it.type === 'risk' ? `<div class="raid-two"><label>${esc(T('raid.f.prob'))}${raidSel('data-rs="probability"', it.probability, raidScaleOpts(), T('raid.f.prob'))}</label><label>${esc(T('raid.f.impact'))}${raidSel('data-rs="impact"', it.impact, raidScaleOpts(), T('raid.f.impact'))}</label></div>
          ${raidScore(it) ? `<div class="raid-scoreline">${esc(T('raid.f.score'))} ${raidScoreBadge(it)} <span>${esc(T(`raid.lvl.${raidLevel(raidScore(it))}`))}</span></div>` : ''}
          <label>${esc(T('raid.f.mit'))}<textarea data-rf="mitigation" rows="3" placeholder="${esc(T('raid.f.mit.ph'))}">${esc(it.mitigation || '')}</textarea></label>
          <label>${esc(T('raid.f.raised'))}<input type="date" data-rf="raised" value="${esc(it.raised || '')}"></label>`
        : `<div class="raid-two"><label>${esc(raidDueLabel(it))}<input type="date" data-rf="due" value="${esc(it.due || '')}"></label><label>${esc(T('raid.f.raised'))}<input type="date" data-rf="raised" value="${esc(it.raised || '')}"></label></div>`}
        ${it.type === 'assumption' ? `<div class="raid-row"><button type="button" class="btn small${it.validation === 'validated' ? ' primary' : ''}" data-raid-validate="1" aria-pressed="${it.validation === 'validated'}">✓ ${esc(T('raid.st.validated'))}</button><button type="button" class="btn small${it.validation === 'invalidated' ? ' danger' : ''}" data-raid-validate="0" aria-pressed="${it.validation === 'invalidated'}">✗ ${esc(T('raid.st.invalidated'))}</button></div>
          <div class="raid-histbox"><span>${esc(T('raid.hist'))}</span>${raidTimeline(it)}</div>` : ''}
        <div class="raid-links-edit"><span>${esc(T('raid.f.links'))}</span>${links.length ? links.map(l => goChip(l, true)).join('') : `<em>${esc(T('raid.noLinks'))}</em>`}
          <div class="raid-row"><button class="btn small" data-raid-linksel>${esc(T('raid.linkSel'))}</button>
          ${freeD.length ? `<select data-raid-linkdec aria-label="${esc(T('raid.linkDec'))}"><option value="">${esc(T('raid.linkDec'))}</option>${freeD.map(d => `<option value="${esc(d.id)}">${esc(`${d.id} · ${adrTitle(d)}`)}</option>`).join('')}</select>` : ''}
          ${freeR.length ? `<select data-raid-linkreq aria-label="${esc(T('raid.linkReq'))}"><option value="">${esc(T('raid.linkReq'))}</option>${freeR.map(r => `<option value="${esc(r.id)}">${esc([r.id, r.title].filter(Boolean).join(' · '))}</option>`).join('')}</select>` : ''}</div></div>
        <button class="btn small danger" data-raid-del>${esc(T('raid.delete'))}</button>
      </div>`;
    }
    return `<div class="raid${on ? ' on' : ''}" data-id="${esc(it.id)}" style="--s:${RAID_TYPE_COLOR[it.type]}">
      <button type="button" class="raid-head" data-raid-toggle aria-expanded="${on}"><b class="raid-id">${esc(it.id)}</b><span class="raid-title">${esc(raidTitle(it))}</span>${raidScoreBadge(it)}<span class="raid-pill" style="--s:${RAID_COLOR[st]}">${esc(raidStateLabel(it))}</span></button>
      <div class="raid-meta${late ? ' late' : ''}">${esc(raidMeta(it))}</div>
      ${!on && links.length ? `<div class="raid-links">${links.map(l => goChip(l, false)).join('')}</div>` : ''}
      ${form}
    </div>`;
  }
  function renderRaidList() {
    const box = $('#raid-list');
    if (!box || !S.model) return;
    const all = S.model.raid || [], shown = all.filter(x => raidMatches(x)), keep = box.parentElement?.scrollTop || 0;
    box.innerHTML = !all.length ? `<p class="fnd-empty">${esc(T('raid.empty'))}</p>` : shown.length ? shown.map(raidCard).join('') : `<p class="fnd-empty">${esc(T('raid.noMatch'))}</p>`;
    if (box.parentElement) box.parentElement.scrollTop = keep;
  }
  // Abre un item en la pestaña RAID (quita los filtros que lo esconderían)
  function raidOpen(id) {
    const it = raidById(id);
    if (!it) return;
    RAID.open = id;
    if (RAID.type !== 'all' && RAID.type !== it.type) RAID.type = 'all';
    if (RAID.st && RAID.st !== raidState(it)) RAID.st = '';
    RAID.cell = null; RAID.q = '';
    $('.tab[data-tab="raid"]')?.click();
    renderRaid(true);
    $(`#raid-list .raid[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' });
    if (matchMedia('(max-width: 760px)').matches) $('#main').classList.add('open');
  }
  function raidGo(kind, id) {
    if (kind === 'decisions') return adrOpen(id);
    if (kind === 'requirements') return reqOpen(id);
    focusTarget(kind === 'nodes' ? 'node' : kind === 'edges' ? 'edge' : 'group', id);
  }
  // Actualiza la cabecera de una ficha sin repintarla (para no perder el foco al escribir)
  function raidRefreshHead(card, it) {
    card.querySelector('.raid-title').textContent = raidTitle(it);
    card.querySelector('.raid-meta').textContent = raidMeta(it);
    card.querySelector('.raid-meta').classList.toggle('late', raidLate(it));
  }
  raidPanel?.addEventListener('focusin', ev => { if (ev.target.dataset?.rf && ev.target.tagName !== 'SELECT') beginEdit(); });
  raidPanel?.addEventListener('focusout', ev => { if (ev.target.dataset?.rf) endEdit(); });
  raidPanel?.addEventListener('input', ev => {
    const f = ev.target;
    if (f.id === 'raid-q') { RAID.q = f.value; return renderRaidList(); }
    const k = f.dataset?.rf, card = f.closest('.raid'), it = k && f.tagName !== 'SELECT' && card && raidById(card.dataset.id);
    if (!it) return;
    if ((k === 'due' || k === 'raised') && f.value && !isDay(f.value)) return;
    markEdit();
    if (f.value.trim() || k === 'title') it[k] = f.value; else delete it[k];
    syncEditor(); save();
    raidRefreshHead(card, it);
  });
  raidPanel?.addEventListener('change', ev => {
    const f = ev.target, card = f.closest('.raid'), it = card && raidById(card.dataset.id);
    if (!it) return;
    if (f.dataset.raidLinkdec != null || f.dataset.raidLinkreq != null) { if (f.value) updateRaid(it.id, { links: raidAddLinks(it, f.dataset.raidLinkdec != null ? { decisions: [f.value] } : { requirements: [f.value] }) }); return; }
    if (f.dataset.rs) return void updateRaid(it.id, { [f.dataset.rs]: f.value });
    if (f.dataset.rf) { changed(true); renderInspector(); renderRaidBar(); }
  });
  raidPanel?.addEventListener('click', async ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    const d0 = b.dataset, card = b.closest('.raid'), it = card && raidById(card.dataset.id);
    if (d0.raidAdd) { RAID.q = ''; RAID.st = ''; RAID.cell = null; if (RAID.type !== 'all') RAID.type = d0.raidAdd; const id = addRaid({ type: d0.raidAdd }); return id ? raidOpen(id) : undefined; }
    if (d0.raidType != null) { RAID.type = d0.raidType; RAID.cell = null; return renderRaid(true); }
    if (d0.raidSt != null) { RAID.st = RAID.st === d0.raidSt ? '' : d0.raidSt; return renderRaid(true); }
    if (d0.raidCell != null) { const [p, i] = d0.raidCell.split(',').map(Number); RAID.cell = RAID.cell && RAID.cell.p === p && RAID.cell.i === i ? null : { p, i }; return renderRaid(true); }
    if (d0.raidOpen) return raidOpen(d0.raidOpen);
    if (d0.raidGo) { const [k, ...r] = d0.raidGo.split(':'); return raidGo(k, r.join(':')); }
    if (d0.raidToggle != null && it) { RAID.open = RAID.open === it.id ? null : it.id; return renderRaid(true); }
    if (!it) return;
    if (d0.raidValidate != null) return void validateAssumption(it.id, d0.raidValidate === '1');
    if (d0.raidUnlink) { const [k, ...r] = d0.raidUnlink.split(':'), id = r.join(':'); return void updateRaid(it.id, { links: { ...it.links, [k]: (it.links?.[k] || []).filter(x => x !== id) } }); }
    if (d0.raidLinksel != null) {
      const s = S.sel, l = !s ? null : s.kind === 'node' ? { nodes: [s.id] } : s.kind === 'multi' ? { nodes: [...s.ids] } : s.kind === 'edge' ? { edges: [s.id] } : s.kind === 'group' ? { groups: [s.id] } : null;
      if (!l) return toast(T('adr.noSel'));
      return void updateRaid(it.id, { links: raidAddLinks(it, l) });
    }
    if (d0.raidDel != null && await confirmBox({ title: T('raid.cf.title', it.id), text: T('raid.cf.text', raidTitle(it)), ok: T('raid.delete'), cancel: T('ver.cf.cancel'), danger: true })) removeRaid(it.id);
  });
  // Chips de RAID en la ficha de ADR (abrir el item, reabrir la decisión) y en el inspector
  adrPanel?.addEventListener('click', ev => {
    const b = ev.target.closest('[data-raid-open], [data-raid-reopen]');
    if (!b) return;
    if (b.dataset.raidOpen) return raidOpen(b.dataset.raidOpen);
    const did = b.closest('.adr')?.dataset.id;
    if (did) raidReopen(did, b.dataset.raidReopen);
  });
  $('#inspector').addEventListener('click', ev => { const b = ev.target.closest('[data-raid-open]'); if (b) raidOpen(b.dataset.raidOpen); });
  $('#req-panel')?.addEventListener('click', ev => { const b = ev.target.closest('[data-raid-open]'); if (b) raidOpen(b.dataset.raidOpen); });   // y en la ficha del requisito

  /* ---------- catálogo de datos: pestaña Datos (fichas de conjuntos: general, esquema, calidad, contrato y linaje) ---------- */
  const DSX = { open: null, q: '', domain: '', layer: '', prod: '', cst: '', wide: null, sec: new Set(), free: null, focus: '' };   // ficha abierta, filtros, esquema ampliado, secciones abiertas
  const dsPanel = $('#ds-panel');
  const DS_TYPES = ['string', 'int', 'bigint', 'decimal', 'double', 'boolean', 'date', 'timestamp', 'array', 'struct'];
  let dsMemo = new Map();   // frescura por nombre durante un repintado (calcular el linaje de cada ficha es lo más caro)
  const dsFr = name => { const k = dsK(name); if (!dsMemo.has(k)) dsMemo.set(k, e2eOf(name)); return dsMemo.get(k); };
  const dsFrText = f => [T('ds.fr.real', f.worst == null ? '?' : `${f.unknownHops ? '≥ ' : ''}${fmtDur(f.worst / 1000)}`), f.sla == null ? T('ds.fr.noSla') : T('ds.fr.sla', fmtDur(f.sla / 1000))].join(' · ');
  const DS_FR = { pass: ['✓', 'var(--p-menta)', 'ds.fr.ok'], fail: ['✗', 'var(--p-coral)', 'ds.fr.bad'], unknown: ['?', 'var(--muted)', 'ds.fr.unk'] };
  const dsOwnerLabel = ds => (S.model.stakeholders || []).find(s => s.id === ds.owner)?.name || ds.owner || '';
  const dsRuleLabel = r => (T(`ds.rule.${r}`) !== `ds.rule.${r}` ? T(`ds.rule.${r}`) : r);
  const dsSecKey = (id, s) => `${id}|${s}`;
  const dsMatch = ds => (!DSX.domain || ds.domain === DSX.domain) && (!DSX.layer || ds.layer === DSX.layer) && (!DSX.prod || (DSX.prod === 'yes') === !!ds.product)
    && (!DSX.cst || (DSX.cst === 'none' ? !ds.contract : ds.contract?.status === DSX.cst))
    && (!DSX.q || [ds.id, ds.name, ds.domain, ds.description, dsOwnerLabel(ds), ds.steward, ...(ds.schema || []).map(c => c.name)].some(x => String(x || '').toLowerCase().includes(DSX.q.toLowerCase())));
  const dsOpts = (items, cur) => items.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(cur ?? '') ? ' selected' : ''}>${esc(t)}</option>`).join('');
  const dsSel = (attrs, cur, items, label) => `<select ${attrs} aria-label="${esc(label)}">${dsOpts(items, cur)}</select>`;
  function renderDsBar(all, cat) {
    const decl = cat.filter(c => c.declared), und = cat.filter(c => !c.declared), breach = decl.filter(c => dsFr(c.name).state === 'fail').length, products = all.filter(d => d.product).length;
    const layers = Object.keys(DL).filter(k => all.some(d => d.layer === k) || DSX.layer === k), domains = [...new Set(all.map(d => d.domain).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    if (DSX.domain && !domains.includes(DSX.domain)) DSX.domain = '';
    const chip = (attr, k, on, label, color) => `<button class="fnd-chip${on ? ' on' : ''}" ${attr}="${esc(k)}" aria-pressed="${on}" style="--s:${color}">${esc(label)}</button>`;
    const parts = [`<span>${esc(T('ds.sum.declared', decl.length))}</span>`, `<span>${esc(T('ds.sum.products', products))}</span>`, und.length ? `<span>${esc(T('ds.sum.undoc', und.length))}</span>` : '', breach ? `<span class="raid-late">${esc(T('ds.sum.breach', breach))}</span>` : ''];
    $('#ds-bar').innerHTML = `<div class="raid-tools"><button class="btn small primary" data-ds-add="1" title="${esc(T('ds.add.tip'))}">+ ${esc(T('ds.add'))}</button></div>
      ${all.length || und.length ? `<div class="raid-sum" aria-live="polite">${parts.filter(Boolean).join(' · ')}</div>
      <div class="fnd-chips" role="group" aria-label="${esc(T('ds.fl.aria'))}">${layers.map(k => chip('data-ds-lay', k, DSX.layer === k, layerInfo(k).label, layerInfo(k).color)).join('')}${chip('data-ds-prodf', 'yes', DSX.prod === 'yes', T('ds.fl.prod'), 'var(--p-limon)')}${chip('data-ds-prodf', 'no', DSX.prod === 'no', T('ds.fl.noprod'), 'var(--muted)')}</div>
      <div class="ds-filters">${dsSel('id="ds-fdom"', DSX.domain, [['', T('ds.fl.domain')], ...domains.map(d => [d, d])], T('ds.fl.domain'))}${dsSel('id="ds-fcst"', DSX.cst, [['', T('ds.fl.cst')], ['none', T('ds.fl.nocst')], ...DS_STATUS.map(s => [s, T(`ds.cst.${s}`)])], T('ds.fl.cst'))}</div>
      <input class="search" id="ds-q" style="padding-left:10px;margin-bottom:6px" value="${esc(DSX.q)}" placeholder="${esc(T('ds.search'))}" aria-label="${esc(T('ds.search'))}" autocomplete="off">` : ''}`;
  }
  // Cabecera de la ficha (se repinta sola cuando cambia algo que ella muestra)
  function dsHead(ds, on) {
    const f = dsFr(ds.name), fr = DS_FR[f.state], li = ds.layer ? layerInfo(ds.layer) : null, se = storageEstimate(ds, { prices: dsPrices() });
    const meta1 = [ds.domain, dsOwnerLabel(ds)].filter(Boolean).join(' · '), meta2 = [ds.freshness || f.worst != null ? dsFrText(f) : '', se ? T('ds.store', { gb: numFmt(se.gb, 1), cost: money(se.monthly) }) : ''].filter(Boolean).join(' · ');
    return `<div class="ds-top"><div class="ds-hd"><button type="button" class="ds-toggle" data-ds-toggle="1" aria-expanded="${on}"><b class="raid-id">${esc(ds.id)}</b><span class="ds-title">${esc(ds.name)}</span>${li ? `<span class="ds-layer" style="--s:${li.color}">${esc(li.label)}</span>` : ''}<span class="ds-fr" style="--s:${fr[1]}" title="${esc(T(fr[2]))}">${fr[0]}</span></button><button type="button" class="ds-star${ds.product ? ' on' : ''}" data-ds-star="1" aria-pressed="${!!ds.product}" title="${esc(T('ds.product.tip'))}" aria-label="${esc(T('ds.product.tip'))}">★</button></div>
      ${meta1 ? `<div class="raid-meta">${esc(meta1)}</div>` : ''}${meta2 ? `<div class="raid-meta ds-meta2">${esc(meta2)}</div>` : ''}</div>`;
  }
  function dsSchema(ds) {
    const wide = DSX.wide === ds.id, cols = ds.schema || [], cb = (k, on, t) => `<input type="checkbox" data-dsck="${k}"${on ? ' checked' : ''} aria-label="${esc(t)}">`;
    const rows = cols.map((c, i) => `<tr data-i="${i}"><td class="ds-sc-n">${i + 1}</td><td><input data-dsc="name" value="${esc(c.name)}" maxlength="120" aria-label="${esc(T('ds.col.name'))}" autocomplete="off" spellcheck="false"></td>
      <td><input data-dsc="type" list="ds-types" value="${esc(c.type || '')}" maxlength="40" aria-label="${esc(T('ds.col.type'))}" autocomplete="off" spellcheck="false"></td>
      <td>${cb('key', c.key, T('ds.col.key.tip'))}</td><td>${cb('pii', c.pii, T('ds.col.pii'))}</td><td>${cb('nullable', c.nullable !== false, T('ds.col.null.tip'))}</td>
      <td><input data-dsc="desc" value="${esc(c.desc || '')}" maxlength="500" aria-label="${esc(T('ds.col.desc'))}" autocomplete="off"></td>
      <td class="ds-sc-a"><button type="button" data-ds-colup="${i}" title="${esc(T('ds.col.up'))}" aria-label="${esc(T('ds.col.up'))}"${i ? '' : ' disabled'}>▲</button><button type="button" data-ds-coldn="${i}" title="${esc(T('ds.col.dn'))}" aria-label="${esc(T('ds.col.dn'))}"${i < cols.length - 1 ? '' : ' disabled'}>▼</button><button type="button" class="adr-x" data-ds-colrm="${i}" title="${esc(T('ds.col.rm'))}" aria-label="${esc(T('ds.col.rm'))}">×</button></td></tr>`).join('');
    return `${wide ? '<div class="req-back" data-ds-wide="1"></div>' : ''}<div class="req-mx-box ds-sc-box${wide ? ' wide' : ''}"><div class="adr-opts-h"><span>${esc(T('ds.sc.title', ds.name))}</span><button type="button" class="btn small" data-ds-wide="1" title="${esc(T('adr.wide.tip'))}">${esc(T(wide ? 'adr.narrow' : 'adr.wide'))}</button></div>
      ${cols.length ? `<div class="ds-sc-wrap"><table class="ds-sc"><thead><tr><th>#</th><th>${esc(T('ds.col.name'))}</th><th>${esc(T('ds.col.type'))}</th><th title="${esc(T('ds.col.key.tip'))}">${esc(T('ds.col.key'))}</th><th>${esc(T('ds.col.pii'))}</th><th title="${esc(T('ds.col.null.tip'))}">${esc(T('ds.col.null'))}</th><th>${esc(T('ds.col.desc'))}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="raid-hint">${esc(T('ds.col.empty'))}</p>`}
      <div class="raid-row"><button type="button" class="btn small" data-ds-coladd="1">${esc(T('ds.col.add'))}</button></div></div>`;
  }
  function dsQuality(ds) {
    const rules = dsHelpers().rules || DS_RULES, cols = (ds.schema || []).map(c => c.name);
    return `${(ds.quality || []).map((q, i) => `<div class="ds-q" data-i="${i}">${dsSel('data-dsq="rule"', q.rule, [...new Set([...rules, q.rule])].map(r => [r, dsRuleLabel(r)]), T('ds.q.rule'))}
      ${dsSel('data-dsq="column"', q.column || '', [['', T('ds.q.any')], ...[...new Set([...cols, q.column].filter(Boolean))].map(c => [c, c])], T('ds.q.col'))}
      <input data-dsq="param" value="${esc(q.param || '')}" maxlength="200" placeholder="${esc(T('ds.q.param.ph'))}" aria-label="${esc(T('ds.q.param'))}" autocomplete="off" spellcheck="false">
      ${dsSel('data-dsq="severity"', q.severity || '', [['', '–'], ...DS_SEV.map(s => [s, sevLabel(s)])], T('ds.q.sev'))}
      <button type="button" class="adr-x" data-ds-qrm="${i}" title="${esc(T('ds.q.rm'))}" aria-label="${esc(T('ds.q.rm'))}">×</button></div>`).join('') || `<p class="raid-hint">${esc(T('ds.q.empty'))}</p>`}
      <div class="raid-row"><button type="button" class="btn small" data-ds-qadd="1">${esc(T('ds.q.add'))}</button></div>`;
  }
  function dsContract(ds) {
    const k = ds.contract;
    if (!k) return `<p class="raid-hint">${esc(T('ds.k.none'))}</p><div class="raid-row"><button type="button" class="btn small" data-ds-knew="1">${esc(T('ds.k.new'))}</button></div>`;
    const free = S.model.nodes.filter(n => !(k.consumers || []).includes(n.id)), name = id => S.model.nodes.find(n => n.id === id)?.label || id;
    return `<div class="raid-two"><label>${esc(T('ds.k.version'))}<input data-dsk="version" value="${esc(k.version)}" maxlength="20" autocomplete="off"></label><label>${esc(T('ds.k.status'))}${dsSel('data-dsk="status"', k.status, DS_STATUS.map(s => [s, T(`ds.cst.${s}`)]), T('ds.k.status'))}</label></div>
      <div class="raid-links-edit"><span>${esc(T('ds.k.consumers'))}</span>${(k.consumers || []).map(id => `<span class="raid-link"><button type="button" data-ds-focus="${esc(id)}" title="${esc(T('raid.go'))}">${esc(name(id))}</button><button type="button" class="raid-x" data-ds-krm="${esc(id)}" title="${esc(T('ds.k.rmCons'))}" aria-label="${esc(T('ds.k.rmCons'))}">×</button></span>`).join('')}
        ${free.length ? dsSel('data-ds-kadd="1"', '', [['', T('ds.k.addCons')], ...free.map(n => [n.id, n.label])], T('ds.k.addCons')) : ''}</div>
      <label>${esc(T('ds.k.terms'))}<textarea data-dsk="terms" rows="3" maxlength="2000" placeholder="${esc(T('ds.k.terms.ph'))}">${esc(k.terms || '')}</textarea></label>
      <div class="raid-row"><button type="button" class="btn small primary" data-ds-export="1">${esc(T('ds.k.export'))}</button><button type="button" class="btn small" data-ds-kdel="1">${esc(T('ds.k.del'))}</button></div>`;
  }
  function dsLineage(ds) {
    const f = dsFr(ds.name), es = dsEdges(S.model, ds.name), nm = id => S.model.nodes.find(n => n.id === id)?.label || id;
    if (!es.length) return `<p class="raid-hint">${esc(T('ds.l.none'))}</p>`;
    const hops = f.path.slice(1).map((b, i) => {
      const a = f.path[i], e = es.find(x => (x.from === a && x.to === b) || (x.both && x.from === b && x.to === a)), s = e?.latency ? parseDur(e.latency) : null;
      return `<span class="ds-hop${s == null ? ' unk' : ''}">${s == null ? '?' : esc(fmtDur(s))}</span><span class="ds-node">${esc(nm(b))}</span>`;
    }).join('');
    return `${f.path.length > 1 ? `<div class="raid-hint">${esc(T('ds.l.slowest'))}</div><div class="ds-path"><span class="ds-node">${esc(nm(f.path[0]))}</span>${hops}</div>` : `<p class="raid-hint">${esc(T('ds.l.nopath'))}</p>`}
      <div class="raid-row"><button type="button" class="btn small" data-ds-lin="1">${esc(T('ds.l.show'))}</button></div>`;
  }
  function dsCard(ds) {
    const on = DSX.open === ds.id, sec = (k, body, extra = '') => {
      const o = DSX.sec.has(dsSecKey(ds.id, k));
      return `<div class="ds-sec${o ? ' on' : ''}"><button type="button" class="ds-sec-h" data-ds-sec="${k}" aria-expanded="${o}"><span>${esc(T(`ds.sec.${k}`))}</span>${extra}</button>${o ? `<div class="ds-sec-b">${body}</div>` : ''}</div>`;
    };
    let form = '';
    if (on) {
      const shs = (S.model.stakeholders || []).filter(s => !s.inactive || s.id === ds.owner), isSh = shs.some(s => s.id === ds.owner), free = (!!ds.owner && !isSh) || DSX.free === ds.id;
      const phases = S.model.phases || [], fmts = dsHelpers().formats || DS_FORMATS, vol = ds.volume || {};
      const general = `<label>${esc(T('ds.f.desc'))}<textarea data-dsf="description" rows="3" maxlength="2000">${esc(ds.description || '')}</textarea></label>
        <div class="raid-two"><label>${esc(T('ds.f.domain'))}<input data-dsf="domain" list="ds-domains" value="${esc(ds.domain || '')}" maxlength="60" autocomplete="off"></label><label>${esc(T('ds.f.layer'))}${dsSel('data-dss="layer"', ds.layer || '', [['', '–'], ...Object.keys(DL).map(k => [k, layerInfo(k).label])], T('ds.f.layer'))}</label></div>
        <div class="raid-two"><label>${esc(T('ds.f.owner'))}${dsSel('data-ds-owner="1"', free ? '__free' : isSh ? ds.owner : '', [['', T('ds.f.owner.none')], ...shs.map(s => [s.id, s.name || s.id]), ['__free', T('ds.f.owner.free')]], T('ds.f.owner'))}${free ? `<input data-dsf="owner" value="${esc(isSh ? '' : ds.owner || '')}" maxlength="120" placeholder="${esc(T('ds.f.owner.ph'))}" aria-label="${esc(T('ds.f.owner'))}" autocomplete="off">` : ''}</label>
          <label>${esc(T('ds.f.steward'))}<input data-dsf="steward" value="${esc(ds.steward || '')}" maxlength="120" autocomplete="off"></label></div>
        <div class="raid-links-edit"><span>${esc(T('ds.f.classes'))}</span>${Object.keys(DATA).map(k => `<button type="button" class="fnd-chip${(ds.classes || []).includes(k) ? ' on' : ''}" data-ds-cls="${esc(k)}" aria-pressed="${(ds.classes || []).includes(k)}" style="--s:${colorVar(DATA[k].color) || 'var(--muted)'}">${esc(DATA[k].short || k)}</button>`).join('')}</div>
        <div class="raid-two"><label>${esc(T('ds.f.format'))}${dsSel('data-dss="format"', ds.format || '', [['', '–'], ...fmts.map(f => [f, f === 'other' ? T('ds.fmt.other') : f])], T('ds.f.format'))}</label>
          <label>${esc(T('ds.f.fresh'))}<input data-dsf="freshness" list="ds-dur" value="${esc(ds.freshness || '')}" placeholder="${esc(T('ds.f.fresh.ph'))}" autocomplete="off" spellcheck="false"></label></div>
        <span class="cost-hint">${esc(T('ds.f.fresh.hint'))}</span>
        <div class="raid-two"><label>${esc(T('ds.f.perDay'))}<input data-dsv="perDay" type="number" min="0" step="any" value="${vol.perDay ?? ''}"></label><label>${esc(T('ds.f.ret'))}<input data-dsv="retentionDays" type="number" min="0" step="1" value="${vol.retentionDays ?? ''}" placeholder="${DS_DEFAULT_DAYS}"></label></div>
        ${phases.length ? `<label>${esc(T('ds.f.phase'))}${dsSel('data-dss="phase"', ds.phase || '', [['', T('ds.f.phase.any')], ...phases.map(p => [p.id, p.name || p.id])], T('ds.f.phase'))}</label>` : ''}`;
      const n = (ds.schema || []).length, q = (ds.quality || []).length;
      form = `<div class="raid-form"><label>${esc(T('ds.f.name'))}<input data-ds-name="1" value="${esc(ds.name)}" maxlength="120" autocomplete="off" spellcheck="false"></label>
        ${sec('general', general)}${sec('schema', dsSchema(ds), n ? `<em>${n}</em>` : '')}${sec('quality', dsQuality(ds), q ? `<em>${q}</em>` : '')}${sec('contract', dsContract(ds), ds.contract ? `<em>${esc(ds.contract.version)} · ${esc(T(`ds.cst.${ds.contract.status}`))}</em>` : '')}${sec('lineage', dsLineage(ds))}
        <button class="btn small danger" data-ds-del="1">${esc(T('ds.del'))}</button></div>`;
    }
    return `<div class="raid ds-card${on ? ' on' : ''}" data-id="${esc(ds.id)}" style="--s:${ds.layer ? layerInfo(ds.layer).color : 'var(--muted)'}">${dsHead(ds, on)}${form}</div>`;
  }
  function renderDsList(cat) {
    const box = $('#ds-list');
    if (!box || !S.model) return;
    cat = cat || catalog(S.model);
    const keep = box.parentElement?.scrollTop || 0, decl = cat.filter(c => c.declared), und = cat.filter(c => !c.declared && (!DSX.q || c.name.toLowerCase().includes(DSX.q.toLowerCase()))), shown = decl.filter(c => dsMatch(c.ds));
    const domains = [...new Set(decl.map(c => c.ds.domain).filter(Boolean))];
    box.innerHTML = `<datalist id="ds-types">${DS_TYPES.map(t => `<option value="${t}"></option>`).join('')}</datalist><datalist id="ds-dur">${DUR_TIERS.map(v => `<option value="${v}"></option>`).join('')}</datalist><datalist id="ds-domains">${domains.map(d => `<option value="${esc(d)}"></option>`).join('')}</datalist>`
      + (!cat.length ? `<p class="fnd-empty">${esc(T('ds.empty'))}</p>` : (shown.length ? shown.map(c => dsCard(c.ds)).join('') : decl.length ? `<p class="fnd-empty">${esc(T('ds.noMatch'))} <button class="btn small" data-ds-clear="1">${esc(T('ver.f.clear'))}</button></p>` : ''))
      + (und.length ? `<div class="ds-undoc"><h4>${esc(T('ds.undoc'))} <small>${und.length}</small></h4><p class="raid-hint">${esc(T('ds.undoc.hint'))}</p>${und.map(c => `<div class="ds-und"><button type="button" class="ds-und-n" data-lin="${esc(c.name)}" title="${esc(T('lin.show', { name: c.name }))}">${esc(c.name)}</button><small>${esc(T('ds.undoc.n', c.edges))}</small><button type="button" class="btn small" data-ds-doc="${esc(c.name)}">${esc(T('ds.undoc.doc'))}</button></div>`).join('')}</div>` : '');
    if (box.parentElement) box.parentElement.scrollTop = keep;
  }
  function renderDs(force) {
    if (!dsPanel || !S.model || !$('.pane[data-pane="data"]')?.classList.contains('on')) return;
    const a = document.activeElement;
    if (!force && a && dsPanel.contains(a) && a.matches('input, textarea, select')) return;   // no pisar lo que se está escribiendo
    if (DSX.open && !dsById(DSX.open)) DSX.open = null;
    if (DSX.wide && !dsById(DSX.wide)) DSX.wide = null;
    dsMemo = new Map();
    const cat = catalog(S.model);
    renderDsBar(S.model.datasets || [], cat);
    renderDsList(cat);
    if (DSX.focus && force) { const f = $(DSX.focus, dsPanel); DSX.focus = ''; f?.focus(); if (f?.select) f.select(); }
  }
  // Abre una ficha (por id o nombre) en la pestaña Datos, quitando los filtros que la esconderían
  function dsOpen(v) {
    const ds = dsFind(v);
    if (!ds) return;
    DSX.open = ds.id; DSX.q = ''; DSX.domain = ''; DSX.layer = ''; DSX.prod = ''; DSX.cst = '';
    DSX.sec.add(dsSecKey(ds.id, 'general'));
    $('.tab[data-tab="data"]')?.click();   // el clic ya repinta la pestaña
    $(`#ds-list .ds-card[data-id="${CSS.escape(ds.id)}"]`)?.scrollIntoView({ block: 'start' });
    if (matchMedia('(max-width: 760px)').matches) $('#main').classList.add('open');
  }
  // Documenta un nombre que solo se usa en conexiones: crea el conjunto con la capa del destino de su primera conexión
  function dsDocument(name) {
    const have = dsFind(name);
    if (have) return dsOpen(have.id);
    const c = catalog(S.model).find(x => dsK(x.name) === dsK(name)), e = dsEdges(S.model, name)[0], to = e && S.model.nodes.find(n => n.id === e.to), ly = to ? layerOf(to).value : '';
    if ((S.model.datasets || []).length >= DS_MAX) return void toast(T('ds.max', DS_MAX));
    const id = addDataset({ name: c?.name || String(name), ...(ly ? { layer: ly } : {}) });
    if (id) dsOpen(id);
  }
  function dsNew() {
    if ((S.model.datasets || []).length >= DS_MAX) return void toast(T('ds.max', DS_MAX));
    let n = 1, name = T('ds.new.name');
    while ((S.model.datasets || []).some(d => dsK(d.name) === dsK(name))) name = `${T('ds.new.name')}_${++n}`;
    const id = addDataset({ name });
    if (id) { DSX.focus = '[data-ds-name]'; dsOpen(id); }
  }
  const dsRefreshHead = card => { const ds = card && dsById(card.dataset.id); if (!ds) return; dsMemo = new Map(); card.querySelector('.ds-top').outerHTML = dsHead(ds, DSX.open === ds.id); card.style.setProperty('--s', ds.layer ? layerInfo(ds.layer).color : 'var(--muted)'); };
  const dsList = (ds, key) => (ds[key] || []).map(x => ({ ...x }));   // copia editable del esquema o de las reglas; todo pasa por cleanCatalog en updateDataset
  dsPanel?.addEventListener('input', ev => {
    const f = ev.target;
    if (f.id === 'ds-q') { DSX.q = f.value; return renderDsList(); }
    if (f.dataset?.dsf === 'freshness') f.setAttribute('aria-invalid', !!f.value.trim() && normDur(f.value) == null);
  });
  // Un cambio de campo = un paso de historial (updateDataset); los textos se aplican al salir del campo o con Intro
  dsPanel?.addEventListener('change', ev => {
    const f = ev.target, d0 = f.dataset;
    if (f.id === 'ds-fdom') { DSX.domain = f.value; return renderDs(true); }
    if (f.id === 'ds-fcst') { DSX.cst = f.value; return renderDs(true); }
    const card = f.closest('.ds-card'), ds = card && dsById(card.dataset.id);
    if (!ds) return;
    const set = (patch, re) => { if (updateDataset(ds.id, patch)) { if (re) renderDs(true); else dsRefreshHead(card); } };
    if (d0.dsName != null) {
      const v = f.value.trim();
      if (!v || v === ds.name) { f.value = ds.name; return; }
      if (!renameDatasetApi(ds.id, v)) { toast(T('ds.rename.clash', v)); f.value = ds.name; return; }
      return renderDs(true);
    }
    if (d0.dsf) {
      let v = f.value;
      if (d0.dsf === 'freshness') { v = v.trim(); if (v) { const n = normDur(v); if (n == null) return; f.value = v = n; } }
      return set({ [d0.dsf]: v });
    }
    if (d0.dss) return set({ [d0.dss]: f.value }, true);
    if (d0.dsOwner != null) { DSX.free = f.value === '__free' ? ds.id : null; return f.value === '__free' ? renderDs(true) : set({ owner: f.value }, true); }
    if (d0.dsv) { const vol = { ...(ds.volume || {}) }; if (f.value === '') delete vol[d0.dsv]; else vol[d0.dsv] = +f.value; return set({ volume: vol }); }
    const row = f.closest('[data-i]'), i = row ? +row.dataset.i : -1;
    if (d0.dsc || d0.dsck) {
      const sc = dsList(ds, 'schema'), c = sc[i];
      if (!c) return;
      if (d0.dsc) { const v = f.value.trim(); if (d0.dsc === 'name' && !v) { f.value = c.name; return; } if (v) c[d0.dsc] = v; else delete c[d0.dsc]; }
      else c[d0.dsck] = f.checked;
      return set({ schema: sc }, d0.dsc === 'name');   // un nombre nuevo cambia las columnas que ofrecen las reglas
    }
    if (d0.dsq) {
      const q = dsList(ds, 'quality'), r = q[i];
      if (!r) return;
      if (f.value.trim()) r[d0.dsq] = f.value.trim(); else delete r[d0.dsq];
      return set({ quality: q }, f.tagName === 'SELECT' && d0.dsq === 'rule');
    }
    if (d0.dsk) return set({ contract: { ...ds.contract, [d0.dsk]: f.value } }, d0.dsk === 'status');
    if (d0.dsKadd != null && f.value) set({ contract: { ...ds.contract, consumers: [...(ds.contract.consumers || []), f.value] } }, true);
  });
  dsPanel?.addEventListener('click', async ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    const d0 = b.dataset, card = b.closest('.ds-card'), ds = card && dsById(card.dataset.id);
    if (d0.dsAdd) return dsNew();
    if (d0.dsLay != null) { DSX.layer = DSX.layer === d0.dsLay ? '' : d0.dsLay; return renderDs(true); }
    if (d0.dsProdf != null) { DSX.prod = DSX.prod === d0.dsProdf ? '' : d0.dsProdf; return renderDs(true); }
    if (d0.dsClear) { DSX.q = DSX.domain = DSX.layer = DSX.prod = DSX.cst = ''; return renderDs(true); }
    if (d0.dsDoc) return dsDocument(d0.dsDoc);
    if (d0.dsWide != null) { DSX.wide = DSX.wide ? null : card?.dataset.id || DSX.open; return renderDs(true); }
    if (d0.lin) return void showLineage(d0.lin);
    if (!ds) return;
    const set = (patch, re = true) => { if (updateDataset(ds.id, patch) && re) renderDs(true); };
    if (d0.dsToggle != null) { DSX.open = DSX.open === ds.id ? null : ds.id; DSX.wide = null; if (DSX.open) DSX.sec.add(dsSecKey(ds.id, 'general')); return renderDs(true); }
    if (d0.dsStar != null) return set({ product: !ds.product });
    if (d0.dsSec) { const k = dsSecKey(ds.id, d0.dsSec); if (!DSX.sec.delete(k)) DSX.sec.add(k); return renderDs(true); }
    if (d0.dsCls) { const cl = ds.classes || []; return set({ classes: cl.includes(d0.dsCls) ? cl.filter(x => x !== d0.dsCls) : [...cl, d0.dsCls] }); }
    if (d0.dsColadd != null) {
      const sc = dsList(ds, 'schema');
      if (sc.length >= DS_COLS) return void toast(T('ds.col.max', DS_COLS));
      let n = sc.length + 1, nm = `${T('ds.col.new')}_${n}`;
      while (sc.some(c => dsK(c.name) === dsK(nm))) nm = `${T('ds.col.new')}_${++n}`;
      DSX.focus = `.ds-card[data-id="${ds.id}"] tr[data-i="${sc.length}"] [data-dsc="name"]`;
      return set({ schema: [...sc, { name: nm }] });
    }
    for (const [a, fn] of [['dsColrm', (sc, i) => sc.splice(i, 1)], ['dsColup', (sc, i) => i > 0 && sc.splice(i - 1, 0, ...sc.splice(i, 1))], ['dsColdn', (sc, i) => i < sc.length - 1 && sc.splice(i + 1, 0, ...sc.splice(i, 1))]]) {
      if (d0[a] != null) { const sc = dsList(ds, 'schema'); fn(sc, +d0[a]); return set({ schema: sc }); }
    }
    if (d0.dsQadd != null) {
      const q = dsList(ds, 'quality');
      if (q.length >= DS_RULES_MAX) return void toast(T('ds.q.max', DS_RULES_MAX));
      const col = (ds.schema || []).find(c => c.key)?.name || (ds.schema || [])[0]?.name;
      return set({ quality: [...q, { rule: (dsHelpers().rules || DS_RULES)[0] || 'not_null', ...(col ? { column: col } : {}) }] });
    }
    if (d0.dsQrm != null) { const q = dsList(ds, 'quality'); q.splice(+d0.dsQrm, 1); return set({ quality: q }); }
    if (d0.dsKnew != null) return set({ contract: { version: '1.0.0', status: 'draft' } });
    if (d0.dsKdel != null) { if (!await confirmBox({ title: T('ds.k.cf.title', ds.id), text: T('ds.k.cf.text'), ok: T('ds.k.del'), cancel: T('ver.cf.cancel'), danger: true })) return; return set({ contract: null }); }
    if (d0.dsKrm) return set({ contract: { ...ds.contract, consumers: (ds.contract.consumers || []).filter(x => x !== d0.dsKrm) } });
    if (d0.dsFocus) return focusTarget('node', d0.dsFocus);
    if (d0.dsExport != null) return void exportContract(ds.id);
    if (d0.dsLin != null) return void showLineage(ds.name);
    if (d0.dsDel != null && await confirmBox({ title: T('ds.cf.title', ds.id), text: T('ds.cf.text', ds.name), ok: T('ds.del'), cancel: T('ver.cf.cancel'), danger: true })) { removeDataset(ds.id); renderDs(true); }
  });
  // Botones del inspector: abrir la ficha de un conjunto o documentarlo si no está declarado
  $('#inspector').addEventListener('click', ev => {
    const b = ev.target.closest('[data-ds-open], [data-ds-doc]');
    if (b) { if (b.dataset.dsOpen) dsOpen(b.dataset.dsOpen); else dsDocument(b.dataset.dsDoc); }
  });

  /* ---------- interesados: crear/cambiar/borrar, pestaña (fichas) y matriz RACI ---------- */
  const PEOPLE = { open: null, wide: false };   // ficha abierta; matriz RACI ampliada
  const SH_ORG_COLOR = { client: 'var(--p-cielo)', partner: 'var(--p-lavanda)', internal: 'var(--p-menta)' };
  const SH_RACI_COLOR = { R: 'var(--p-cielo)', A: 'var(--p-coral)', C: 'var(--p-limon)', I: 'var(--muted)' };
  const shRaciOf = (s, area) => { const k = Object.keys(s.raci || {}).find(x => x.toLowerCase() === String(area).toLowerCase()); return k ? s.raci[k] : ''; };
  // Todo pasa por cleanStakeholders, así los ids, los límites y los valores de raci siempre quedan coherentes
  function addStakeholder(p = {}) {
    p = p && typeof p === 'object' ? p : {};
    if ((S.model.stakeholders || []).length >= SH_MAX) { toast(T('adr.max', SH_MAX)); return ''; }
    pushHistory();
    const list = cleanStakeholders([...(S.model.stakeholders || []), { ...p, name: String(p.name ?? '').trim() || T('people.new') }], S.model), nd = list[list.length - 1];
    S.model.stakeholders = list;
    changed(true); renderPeople(true);
    return nd.id;
  }
  function updateStakeholder(id, patch) {
    const s = shById(id);
    if (!s || !patch || typeof patch !== 'object') return false;
    const list = cleanStakeholders(S.model.stakeholders.map(x => (x === s ? { ...s, ...patch, id: s.id } : x)), S.model);
    if (!list.some(x => x.id === s.id)) return false;   // sin nombre no hay interesado
    pushHistory();
    S.model.stakeholders = list;
    changed(true); renderPeople(true);
    return true;
  }
  function removeStakeholder(id) {
    const s = shById(id);
    if (!s) return false;
    if (shHasSignoffs(id)) { toast(T('people.blocked', s.name)); return false; }   // con firmas no se borra: se marca inactivo
    pushHistory();
    const list = cleanStakeholders(S.model.stakeholders.filter(x => x !== s), S.model);
    if (list.length) S.model.stakeholders = list; else delete S.model.stakeholders;
    if (PEOPLE.open === id) PEOPLE.open = null;
    changed(true); renderPeople(true);
    return true;
  }
  const peoplePanel = $('#people-panel');
  const shMeta = s => [s.role, T(`people.org.${s.org}`)].filter(Boolean).join(' · ');
  function shCard(s) {
    const on = PEOPLE.open === s.id, tags = [s.versions ? T('people.versions.short') : '', s.inactive ? T('people.inactive') : ''].filter(Boolean);
    const form = on ? `<div class="raid-form">
        <label>${esc(T('people.f.name'))}<input data-pf="name" value="${esc(s.name)}" maxlength="120" autocomplete="off"></label>
        <div class="raid-two"><label>${esc(T('people.f.role'))}<input data-pf="role" value="${esc(s.role || '')}" maxlength="80" placeholder="${esc(T('people.f.role.ph'))}" autocomplete="off"></label>
          <label>${esc(T('people.f.org'))}<select data-ps="org" aria-label="${esc(T('people.f.org'))}">${SH_ORG.map(o => `<option value="${o}"${s.org === o ? ' selected' : ''}>${esc(T(`people.org.${o}`))}</option>`).join('')}</select></label></div>
        <label class="ppl-chk"><input type="checkbox" data-pk="versions"${s.versions ? ' checked' : ''}> ${esc(T('people.versions'))}</label>
        <label class="ppl-chk"><input type="checkbox" data-pk="inactive"${s.inactive ? ' checked' : ''}> ${esc(T('people.inactive.tip'))}</label>
        <button class="btn small danger" data-ppl-del>${esc(T('people.delete'))}</button>
      </div>` : '';
    return `<div class="raid ppl${on ? ' on' : ''}${s.inactive ? ' off' : ''}" data-id="${esc(s.id)}" style="--s:${SH_ORG_COLOR[s.org]}">
      <button type="button" class="raid-head" data-ppl-toggle aria-expanded="${on}"><b class="raid-id">${esc(s.id)}</b><span class="raid-title">${esc(s.name)}</span><span class="raid-pill">${esc(T(`people.org.${s.org}`))}</span></button>
      <div class="raid-meta">${esc([s.role, ...tags].filter(Boolean).join(' · '))}</div>
      ${form}
    </div>`;
  }
  // Matriz RACI: filas = interesados, columnas = «todas las áreas» + cada área de las decisiones; ⚠ en la columna sin ningún aprobador (A)
  function shMatrix() {
    const hs = S.model.stakeholders || [], areas = shAreas(S.model), gaps = new Set(shGaps(S.model).map(a => a.toLowerCase())), wide = PEOPLE.wide;
    const cols = [['*', T('people.all')], ...areas.map(a => [a, a])];
    const head = cols.map(([a, lbl]) => { const gap = gaps.has(a.toLowerCase()); return `<th class="ppl-mx-a${gap ? ' gap' : ''}" title="${esc(gap ? `${lbl} · ${T('people.noApprover')}` : lbl)}"><span>${esc(lbl)}</span>${gap ? `<b class="ppl-warn" role="img" aria-label="${esc(T('people.noApprover'))}">⚠</b>` : ''}</th>`; }).join('');
    const rows = hs.map(s => `<tr class="${s.inactive ? 'off' : ''}"><th scope="row" class="req-mx-r"><button type="button" class="adr-mx-t" data-ppl-open="${esc(s.id)}" title="${esc(`${s.name}${s.role ? ` · ${s.role}` : ''}`)}"><b>${esc(s.id)}</b> <span>${esc(s.name)}</span></button></th>${cols.map(([a, lbl]) => {
      const v = shRaciOf(s, a);
      return `<td class="ppl-mx-c"><select data-pm="${esc(a)}" data-pid="${esc(s.id)}" class="${v ? 'has' : ''}" style="--s:${SH_RACI_COLOR[v] || 'var(--muted)'}" aria-label="${esc(`${s.name} · ${lbl}`)}">${['', ...SH_RACI].map(r => `<option value="${r}"${v === r ? ' selected' : ''}>${r || '–'}</option>`).join('')}</select></td>`;
    }).join('')}</tr>`).join('');
    return `${wide ? '<div class="req-back" data-ppl-wide="1"></div>' : ''}<div class="req-mx-box ppl-mx-box${wide ? ' wide' : ''}"><div class="adr-opts-h"><span>${esc(T('people.mx.title'))}</span><button type="button" class="btn small" data-ppl-wide="1" title="${esc(T('adr.wide.tip'))}">${esc(T(wide ? 'adr.narrow' : 'adr.wide'))}</button></div>
      <p class="raid-hint">${esc(T('people.mx.legend'))}</p>
      <div class="req-mx-wrap"><table class="req-mx ppl-mx"><thead><tr><th class="req-mx-r">${esc(T('people.mx.who'))}</th>${head}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }
  function renderPeople(force) {
    if (!peoplePanel || !S.model || !$('.pane[data-pane="people"]')?.classList.contains('on')) return;
    const a = document.activeElement;
    if (!force && a && peoplePanel.contains(a) && a.matches('input, textarea, select')) return;   // no pisar lo que se está escribiendo
    if (PEOPLE.open && !shById(PEOPLE.open)) PEOPLE.open = null;
    const hs = S.model.stakeholders || [], gaps = shGaps(S.model), box = $('#people-list'), keep = box.parentElement?.scrollTop || 0, hx = box.querySelector('.req-mx-wrap')?.scrollLeft || 0;
    $('#people-bar').innerHTML = `<div class="raid-tools"><button class="btn small primary" data-ppl-add>+ ${esc(T('people.add'))}</button></div>${hs.length ? `<div class="raid-sum" aria-live="polite">${esc(T('people.sum', hs.length))}${gaps.length ? ` · <span class="raid-late">${esc(T('people.sum.gaps', gaps.length))}</span>` : ''}</div>` : ''}`;
    box.innerHTML = hs.length ? hs.map(shCard).join('') + shMatrix() : `<p class="fnd-empty">${esc(T('people.empty'))}</p>`;
    if (box.parentElement) box.parentElement.scrollTop = keep;
    const w = box.querySelector('.req-mx-wrap');
    if (w && hx) w.scrollLeft = hx;
  }
  peoplePanel?.addEventListener('focusin', ev => { if (ev.target.dataset?.pf) beginEdit(); });
  peoplePanel?.addEventListener('focusout', ev => { if (ev.target.dataset?.pf) endEdit(); });
  peoplePanel?.addEventListener('input', ev => {
    const f = ev.target, k = f.dataset?.pf, card = f.closest('.ppl'), s = k && card && shById(card.dataset.id);
    if (!s) return;
    if (k === 'name' && !f.value.trim()) return;   // el nombre no puede quedar vacío
    markEdit();
    if (f.value.trim() || k === 'name') s[k] = f.value; else delete s[k];
    syncEditor(); save();
    card.querySelector('.raid-title').textContent = s.name;
    card.querySelector('.raid-meta').textContent = [s.role, ...(s.versions ? [T('people.versions.short')] : []), ...(s.inactive ? [T('people.inactive')] : [])].filter(Boolean).join(' · ');
  });
  peoplePanel?.addEventListener('change', ev => {
    const f = ev.target, d0 = f.dataset;
    if (d0.pm != null) {   // celda de la matriz: R/A/C/I o vacío
      const s = shById(d0.pid);
      if (!s) return;
      const raci = { ...s.raci }, cur = Object.keys(raci).find(k => k.toLowerCase() === d0.pm.toLowerCase());
      if (cur) delete raci[cur];
      if (f.value) raci[d0.pm] = f.value;
      return void updateStakeholder(s.id, { raci });
    }
    const card = f.closest('.ppl'), s = card && shById(card.dataset.id);
    if (!s) return;
    if (d0.ps) return void updateStakeholder(s.id, { [d0.ps]: f.value });
    if (d0.pk) return void updateStakeholder(s.id, { [d0.pk]: f.checked });
    if (d0.pf) { S.model.stakeholders = cleanStakeholders(S.model.stakeholders, S.model); changed(true); renderPeople(true); }   // al terminar de escribir: se normaliza y se repinta la matriz
  });
  peoplePanel?.addEventListener('click', async ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    const d0 = b.dataset, card = b.closest('.ppl'), s = card && shById(card.dataset.id);
    if (d0.pplAdd != null) { const id = addStakeholder(); if (id) { PEOPLE.open = id; renderPeople(true); $(`#people-list .ppl[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' }); } return; }
    if (d0.pplWide) { PEOPLE.wide = !PEOPLE.wide; return renderPeople(true); }
    if (d0.pplOpen) { PEOPLE.open = d0.pplOpen; PEOPLE.wide = false; renderPeople(true); return void $(`#people-list .ppl[data-id="${CSS.escape(d0.pplOpen)}"]`)?.scrollIntoView({ block: 'nearest' }); }
    if (d0.pplToggle != null && s) { PEOPLE.open = PEOPLE.open === s.id ? null : s.id; return renderPeople(true); }
    if (d0.pplDel == null || !s) return;
    if (shHasSignoffs(s.id)) {   // tiene firmas: no se borra; se ofrece marcarlo como inactivo
      if (s.inactive) return void toast(T('people.blocked', s.name));
      if (await confirmBox({ title: T('people.cf.blocked', s.name), text: T('people.cf.blocked.text'), ok: T('people.inactive.mark'), cancel: T('ver.cf.cancel') })) updateStakeholder(s.id, { inactive: true });
      return;
    }
    if (await confirmBox({ title: T('people.cf.title', s.name), text: T('people.cf.text'), ok: T('people.delete'), cancel: T('ver.cf.cancel'), danger: true })) removeStakeholder(s.id);
  });

  /* inspector (nodo, conexión y grupo) y filas de versiones */
  const adrKindOfSel = () => ({ node: 'nodes', edge: 'edges', group: 'groups' })[S.sel?.kind];
  const adrField = t => {
    const kind = adrKindOfSel();
    if (!kind) return '';
    const linked = decisionsOf(kind, t.id), rest = (S.model.decisions || []).filter(d => !linked.includes(d));
    return `<div class="field adr-field">${T('adr.field')}${adrChips(linked)}
      <div class="adr-row"><button class="btn small" data-adr="new">+ ${esc(T('adr.new'))}</button>
      ${rest.length ? `<select data-adr-link aria-label="${esc(T('adr.linkTo'))}"><option value="">${esc(T('adr.linkTo'))}</option>${rest.map(d => `<option value="${esc(d.id)}">${esc(`${d.id} · ${adrTitle(d)}`)}</option>`).join('')}</select>` : ''}</div></div>${reqField(kind, t.id)}`;
  };
  $('#inspector').addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.adrOpen) return adrOpen(b.dataset.adrOpen);
    const l = b.dataset.adr === 'new' && adrSelLinks();
    if (l) adrOpen(addDecision({ links: l }));
  });
  $('#inspector').addEventListener('change', ev => {
    const f = ev.target, d = f.matches?.('[data-adr-link]') && f.value && adrById(f.value), l = adrSelLinks();
    if (d && l) updateDecision(d.id, { links: adrAddLinks(d, l) });
  });
  $('#versions').addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.adrOpen) return adrOpen(b.dataset.adrOpen);
    if (b.dataset.adr === 'newver') { const id = b.closest('.ver')?.dataset.id; if (id) adrOpen(addDecision({ links: { versions: [id] } })); }
  });

  // Texto plano de las opciones de una decisión, compartido por el Markdown y el informe: matriz (criterios con peso × opciones, total %, ✓ elegida, ★ líder) y ficha de cada opción
  const adrBullets = t => String(t || '').split('\n').map(l => l.replace(/^\s*[•*-]\s*/, '').trim()).filter(Boolean);
  function adrMatrixText(d) {
    const cs = d.criteria || [], os = d.options || [], lead = adrLeader(d), nm = o => o.title || o.id, fmtCost = o => `${money(o.cost)} / ${T('adr.o.month')}`;
    const rows = os.map(o => {
      const sc = adrScore(d, o);
      return [`${o.id} · ${nm(o)}${d.chosen === o.id ? ' ✓' : ''}${lead === o.id && os.length > 1 ? ' ★' : ''}`, ...cs.map(c => (o.scores?.[c.id] != null ? String(o.scores[c.id]) : '–')), sc.scored ? `${sc.pct}%${adrFull(sc) || !sc.total ? '' : ` (${sc.scored}/${sc.total})`}` : '–'];
    });
    const cards = os.map(o => ({
      label: `${o.id} · ${nm(o)}${d.chosen === o.id ? ` ✓ ${T('adr.chosen')}` : ''}`,
      facts: [o.summary ? [T('adr.o.summary'), o.summary] : null, o.cost != null ? [T('adr.o.cost'), fmtCost(o)] : null, o.risk ? [T('adr.o.risk'), T(`adr.risk.${o.risk}`)] : null,
        o.version && findVersion(o.version) ? [T('adr.o.version'), verLabel(findVersion(o.version))] : null].filter(Boolean),
      pros: adrBullets(o.pros), cons: adrBullets(o.cons)
    }));
    return { head: [T('adr.opt'), ...cs.map(c => `${c.label} (×${c.weight})`), T('adr.total')], rows, cards, legend: T('adr.legend') };
  }

  /* exportación Markdown (MADR): índice y una sección por decisión */
  function decisionsMarkdown() {
    const m = S.model, ds = m.decisions || [], cell = x => String(x ?? '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
    const body = x => (String(x || '').trim() || '_—_');
    const out = [`# ${T('adr.md.title', m.title)}`, ''];
    if (ds.length) {
      const ar = ds.some(d => d.area);
      out.push(`| ${T('adr.f.id')} | ${T('adr.f.title')} | ${T('adr.f.status')} | ${T('adr.f.date')} |${ar ? ` ${T('adr.f.area')} |` : ''}`, `|---|---|---|---|${ar ? '---|' : ''}`);
      ds.forEach(d => out.push(`| ${cell(d.id)} | ${cell(adrTitle(d))} | ${cell(T(`adr.st.${d.status}`))} | ${cell(d.date)} |${ar ? ` ${cell(d.area || '')} |` : ''}`));
      out.push('');
    }
    ds.forEach(d => {
      out.push(`## ${d.id}: ${adrTitle(d).replace(/\s*\n\s*/g, ' ')}`, '', `- **${T('adr.f.status')}:** ${T(`adr.st.${d.status}`)}`, `- **${T('adr.f.date')}:** ${d.date}`);
      if (d.deciders) out.push(`- **${T('adr.f.deciders')}:** ${d.deciders}`);
      if (d.area) out.push(`- **${T('adr.f.area')}:** ${d.area}`);
      out.push('', `### ${T('adr.hist')}`, '', ...adrHist(d).map(h => `- ${h.date} · ${T(`adr.st.${h.status}`)}${h.by ? ` · ${h.by}` : ''}${h.note ? ` — ${h.note.replace(/\s*\n\s*/g, ' ')}` : ''}`));
      out.push('', `### ${T('adr.f.context')}`, '', body(d.context), '');
      if (d.options?.length) {   // opciones consideradas: matriz y ficha de cada una
        const mx = adrMatrixText(d);
        out.push(`### ${T('adr.opts')}`, '');
        if (d.criteria?.length) out.push(`| ${mx.head.map(cell).join(' | ')} |`, `|${mx.head.map(() => '---').join('|')}|`, ...mx.rows.map(r => `| ${r.map(cell).join(' | ')} |`), '', `_${mx.legend}_`, '');
        mx.cards.forEach(c => {
          out.push(`#### ${c.label}`, '', ...c.facts.map(([k, v]) => `- **${k}:** ${String(v).replace(/\s*\n\s*/g, ' ')}`));
          if (c.pros.length) out.push(`- **${T('adr.o.pros')}:**`, ...c.pros.map(x => `  - ${x}`));
          if (c.cons.length) out.push(`- **${T('adr.o.cons')}:**`, ...c.cons.map(x => `  - ${x}`));
          out.push('');
        });
      }
      out.push(`### ${T('adr.f.decision')}`, '', body(d.decision), '', `### ${T('adr.f.consequences')}`, '', body(d.consequences), '');
      const links = adrLinkList(d);
      if (links.length) out.push(`### ${T('adr.md.linked')}`, '', ...links.map(l => `- ${T(`adr.kind.${l.kind}`)}: ${l.label}`), '');
      if (d.supersededBy) { const s = adrById(d.supersededBy); out.push(`### ${T('adr.f.superseded')}`, '', `${d.supersededBy}${s ? ` — ${adrTitle(s)}` : ''}`, ''); }
    });
    return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n*$/, '\n');
  }
  function exportDecisions() {
    const md = decisionsMarkdown(), slug = (S.model.title || 'diagram').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'diagram';
    download(md, `${slug}-decisions.md`, 'text/markdown;charset=utf-8');
    return md;
  }

  /* ---------- requisitos: pestaña (fichas, controles, matriz de trazabilidad), inspector y API ---------- */
  const REQ = { open: null, kind: '', st: '', pr: '', q: '', view: 'list', wide: false };   // ficha abierta, filtros por tipo, estado y prioridad, búsqueda, vista (lista | matriz) y matriz ampliada
  const REQ_ST_COLOR = { draft: 'var(--p-limon)', agreed: 'var(--p-menta)', dropped: 'var(--muted)' };
  const reqById = id => (S.model.requirements || []).find(r => r.id === id);
  const reqTitle = r => r.title || r.id;
  const REQ_LINKS = ['decisions', 'nodes', 'edges', 'groups'];
  const reqLinkLabel = (k, id) => { if (k !== 'decisions') return adrLinkLabel(k, id); const d = adrById(id); return d ? `${d.id} · ${adrTitle(d)}` : id; };
  const reqLinkList = r => REQ_LINKS.flatMap(k => (r.links?.[k] || []).map(id => ({ kind: k, id, label: reqLinkLabel(k, id) || id })));
  const reqAddLinks = (r, add) => { const l = {}; REQ_LINKS.forEach(k => { const v = [...(r.links?.[k] || []), ...(add[k] || [])]; if (v.length) l[k] = v; }); return l; };
  const reqChips = list => (list.length ? `<div class="req-chips">${list.map(r => `<button type="button" class="req-chip${r.status === 'dropped' ? ' dropped' : ''}" data-req-open="${esc(r.id)}" style="--s:${REQ_COLOR[r.kind]}" title="${esc(`${r.id} · ${reqTitle(r)} · ${T(`req.kind.${r.kind}`)} · ${T(`req.st.${r.status}`)}`)}"><b>${esc(r.id)}</b> ${esc(r.title)}</button>`).join('')}</div>` : '');
  // Fila «Aborda: REQ-001 …» en la ficha de una decisión, y fila compacta en el inspector (solo si hay vínculos)
  const reqChipsFor = decisionId => { const l = requirementsOf('decisions', decisionId); return l.length ? `<div class="req-for"><span>${esc(T('req.addresses'))}</span>${reqChips(l)}</div>` : ''; };
  const reqField = (kind, id) => { const l = requirementsOf(kind, id); return l.length ? `<div class="field req-field">${esc(T('req.field'))}${reqChips(l)}</div>` : ''; };

  // Crear, cambiar y borrar: todo pasa por cleanRequirements, así tipos, estados, controles y enlaces siempre quedan coherentes
  const setReqs = list => { if (list.length) S.model.requirements = list; else delete S.model.requirements; };
  function addRequirement(p = {}) {
    p = p && typeof p === 'object' ? p : {};
    pushHistory();
    const list = cleanRequirements([...(S.model.requirements || []), { ...p, title: p.title || T('req.new.title') }], S.model);
    setReqs(list);
    changed(true); renderInspector(); renderReq(true);
    return list[list.length - 1].id;
  }
  function updateRequirement(id, patch) {
    const r = reqById(id);
    if (!r || !patch || typeof patch !== 'object') return false;
    pushHistory();
    setReqs(cleanRequirements(S.model.requirements.map(x => (x === r ? { ...r, ...patch, id: r.id } : x)), S.model));
    changed(true); renderInspector(); renderReq(true);
    return true;
  }
  function removeRequirement(id) {
    if (!reqById(id)) return false;
    pushHistory();
    setReqs(cleanRequirements(S.model.requirements.filter(r => r.id !== id), S.model));
    if (REQ.open === id) REQ.open = null;
    changed(true); renderInspector(); renderReq(true);
    return true;
  }
  const checkRequirement = id => { const r = reqById(id); return r ? reqCheck(r) : null; };

  // Abre un requisito en la pestaña Requisitos (quita los filtros que lo esconderían)
  function reqOpen(id) {
    const r = reqById(id);
    if (!r) return;
    REQ.open = id; REQ.view = 'list'; REQ.wide = false;
    if (REQ.kind && REQ.kind !== r.kind) REQ.kind = '';
    if (REQ.st && REQ.st !== r.status) REQ.st = '';
    if (REQ.pr && REQ.pr !== r.priority) REQ.pr = '';
    REQ.q = '';
    $('.tab[data-tab="req"]')?.click();
    renderReq(true);
    $(`#req-list .adr[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' });
    if (matchMedia('(max-width: 760px)').matches) $('#main').classList.add('open');
  }
  const reqChecks = () => new Map((S.model.requirements || []).filter(r => r.check).map(r => [r.id, reqCheck(r)]));
  // Insignia del control: ✓ cumple · ✗ falla · ? sin datos (el detalle va en el tooltip)
  const reqBadge = (r, chk) => {
    const c = chk.get(r.id);
    if (!c) return '';
    const sym = { pass: '✓', fail: '✗', unknown: '?' }[c.state], tip = `${T(`req.m.${r.check.metric}`)}: ${c.detail}`;
    return `<span class="req-chk ${c.state}" title="${esc(tip)}" aria-label="${esc(`${T(`req.chk.${c.state}`)}. ${tip}`)}">${sym} ${esc(T(`req.m.${r.check.metric}`))}</span>`;
  };
  // «Cubierto por ADR-003 (aceptada), 2 componentes»
  function reqCoverText(r) {
    const cv = reqCover(r, S.model), ds = (r.links?.decisions || []).map(id => adrById(id)).filter(Boolean).map(d => `${d.id} (${T(`adr.st.${d.status}`).toLowerCase()})`);
    const parts = [...ds, ...(cv.comps ? [T('req.cov.comps', cv.comps)] : [])];
    return { cls: cv.covered ? 'ok' : r.status === 'agreed' && (r.priority === 'must' || r.priority === 'should') ? 'bad' : '', text: !parts.length ? T('req.cov.none') : cv.covered ? T('req.cov.by', parts.join(', ')) : T('req.cov.not', parts.join(', ')) };
  }
  const reqMeta = r => [T(`req.kind.${r.kind}`), r.priority ? T(`req.pr.${r.priority}`) : '', r.source].filter(Boolean).join(' · ');
  // «ADR-003 (aceptada), Tienda, Tienda → API» en una línea (informe y Excel)
  function reqCoveredBy(r, m = S.model) {
    const l = r.links || {}, nm = id => m.nodes.find(n => n.id === id)?.label || id;
    return [...(l.decisions || []).map(id => { const d = (m.decisions || []).find(x => x.id === id); return d ? `${d.id} (${T(`adr.st.${d.status}`).toLowerCase()})` : id; }), ...(l.nodes || []).map(nm),
      ...(l.edges || []).map(id => { const e = m.edges.find(x => x.id === id); return e ? `${nm(e.from)} ${e.both ? '↔' : '→'} ${nm(e.to)}` : id; }), ...(l.groups || []).map(id => m.groups.find(g => g.id === id)?.label || id)].join(', ');
  }
  // «Disponibilidad ERP → BI ≥ 99,9 %» · «Costo ≤ US$ 10.000» · «Cifrado: PII» · «Residencia: PII en UE»
  function reqCheckText(r) {
    const c = r.check;
    if (!c) return '';
    const nm = id => S.model.nodes.find(n => n.id === id)?.label || id || '?', mt = T(`req.m.${c.metric}`), cn = k => (DATA[k] ? loc(DATA[k].label) : k) || '?';
    if (c.metric === 'availability') return `${mt} ${nm(c.from)} → ${nm(c.to)} ≥ ${c.target != null ? `${numFmt(c.target, 4)}%` : '?'}`;
    if (c.metric === 'rpo' || c.metric === 'rto') return `${mt} ${nm(c.from)} → ${nm(c.to)} ≤ ${c.target != null ? `${numFmt(c.target, 2)} ${T('req.unit.h')}` : '?'}`;
    if (c.metric === 'cost') return `${mt} ≤ ${c.target != null ? money(c.target) : '?'}`;
    if (c.metric === 'freshness') return `${mt}: ${c.ds || '?'} ≤ ${c.target != null ? `${numFmt(c.target, 2)} ${T('req.unit.h')}` : '?'}`;
    if (c.metric === 'encryption') return `${mt}: ${cn(c.cls)}`;
    return `${mt}: ${cn(c.cls)} → ${c.jur ? loc(JURS[c.jur]?.label) || c.jur : '?'}`;
  }
  const reqMatches = r => (!REQ.kind || r.kind === REQ.kind) && (!REQ.st || r.status === REQ.st) && (!REQ.pr || r.priority === REQ.pr)
    && (!REQ.q || [r.id, r.title, r.detail, r.source].some(x => String(x || '').toLowerCase().includes(REQ.q.toLowerCase())));

  /* pestaña */
  const reqPanel = $('#req-panel');
  function renderReq(force) {
    if (!reqPanel || !S.model || !$('.pane[data-pane="req"]')?.classList.contains('on')) return;
    const a = document.activeElement;
    if (!force && a && reqPanel.contains(a) && a.matches('input, textarea, select')) return; // no pisar lo que se está escribiendo
    const rs = S.model.requirements || [];
    if (REQ.open && !reqById(REQ.open)) REQ.open = null;
    if (REQ.kind && !rs.some(r => r.kind === REQ.kind)) REQ.kind = '';
    if (REQ.st && !rs.some(r => r.status === REQ.st)) REQ.st = '';
    if (REQ.pr && !rs.some(r => r.priority === REQ.pr)) REQ.pr = '';
    const chk = reqChecks(), ag = rs.filter(r => r.status === 'agreed'), cov = ag.filter(r => reqCover(r, S.model).covered).length, pass = ag.filter(r => chk.get(r.id)?.state === 'pass').length;
    const pc = n => (rs.length ? (100 * n / rs.length).toFixed(1) : 0), progT = T('req.prog', { n: ag.length, c: cov, p: pass });
    const nDr = rs.filter(r => r.status === 'draft').length;
    const prog = rs.length ? `<div class="adr-prog"><div class="adr-prog-t">${esc(progT)}</div>
      <div class="adr-prog-b" role="img" aria-label="${esc(progT)}"><i style="width:${pc(ag.length)}%;background:${REQ_ST_COLOR.agreed}"></i><i style="width:${pc(nDr)}%;background:${REQ_ST_COLOR.draft}"></i><i style="width:${pc(rs.length - ag.length - nDr)}%;background:var(--muted)"></i></div></div>` : '';
    const group = (key, label, vals, cur, name, color) => { const on = vals.filter(([k]) => rs.some(r => (key === 'priority' ? r.priority : r[key]) === k)); return on.length > 1 || cur ? `<div class="fnd-chips" role="group" aria-label="${esc(label)}">${on.map(([k, t]) => `<button class="fnd-chip${cur === k ? ' on' : ''}" data-req-f="${name}:${k}" aria-pressed="${cur === k}" style="--s:${color(k)}">${esc(t)} <b>${rs.filter(r => (key === 'priority' ? r.priority : r[key]) === k).length}</b></button>`).join('')}</div>` : ''; };
    const kinds = REQ_KIND.map(k => [k, T(`req.kind.${k}`)]), sts = REQ_STATUS.map(k => [k, T(`req.st.${k}`)]), prs = REQ_PRIO.map(k => [k, T(`req.pr.${k}`)]);
    $('#req-bar').innerHTML = `<div class="adr-tools"><button class="btn small primary" data-req="new">+ ${esc(T('req.new'))}</button>
      ${rs.length ? `<span class="seg req-view" role="group" aria-label="${esc(T('req.view'))}"><button data-req-view="list" class="${REQ.view === 'list' ? 'on' : ''}" aria-pressed="${REQ.view === 'list'}">${esc(T('req.view.list'))}</button><button data-req-view="matrix" class="${REQ.view === 'matrix' ? 'on' : ''}" aria-pressed="${REQ.view === 'matrix'}">${esc(T('req.view.matrix'))}</button></span>` : ''}</div>${prog}
      ${rs.length ? `${group('kind', T('req.f.kind'), kinds, REQ.kind, 'kind', k => REQ_COLOR[k])}${group('status', T('req.f.status'), sts, REQ.st, 'st', k => REQ_ST_COLOR[k])}${group('priority', T('req.f.priority'), prs, REQ.pr, 'pr', () => 'var(--accent)')}
      <input class="search" id="req-q" style="padding-left:10px;margin-bottom:6px" value="${esc(REQ.q)}" placeholder="${esc(T('req.search'))}" aria-label="${esc(T('req.search'))}" autocomplete="off">` : ''}`;
    renderReqList(chk);
  }
  // Matriz de trazabilidad: filas = requisitos, columnas = decisiones; ✓ donde hay vínculo (las aceptadas, resaltadas); una celda vincula o desvincula
  function reqMatrix(rs, ds) {
    const wide = REQ.wide, head = ds.map(d => `<th class="req-mx-d${d.status === 'accepted' ? ' acc' : ''}" title="${esc(`${d.id} · ${adrTitle(d)} (${T(`adr.st.${d.status}`)})`)}"><span>${esc(d.id.replace(/^ADR-/i, ''))}</span></th>`).join('');
    const rows = rs.map(r => `<tr><th scope="row" class="req-mx-r"><button type="button" class="adr-mx-t" data-req-open="${esc(r.id)}" title="${esc(reqTitle(r))}"><b>${esc(r.id)}</b> <span>${esc(reqTitle(r))}</span></button></th>${ds.map(d => {
      const on = r.links?.decisions?.includes(d.id), lbl = `${r.id} · ${d.id}`;
      return `<td class="req-mx-c${on ? ' on' : ''}${on && d.status === 'accepted' ? ' acc' : ''}"><button type="button" data-req-tgl="${esc(r.id)}|${esc(d.id)}" aria-pressed="${!!on}" aria-label="${esc(lbl)}" title="${esc(lbl)}">${on ? '✓' : ''}</button></td>`;
    }).join('')}<td class="req-mx-n" title="${esc(T('req.mx.comps'))}">${(r.links?.nodes?.length || 0) + (r.links?.edges?.length || 0) + (r.links?.groups?.length || 0) || ''}</td></tr>`).join('');
    return `${wide ? '<div class="req-back" data-req="wide"></div>' : ''}<div class="req-mx-box${wide ? ' wide' : ''}"><div class="adr-opts-h"><span>${esc(T('req.mx.title'))}</span><button type="button" class="btn small" data-req="wide" title="${esc(T('adr.wide.tip'))}">${esc(T(wide ? 'adr.narrow' : 'adr.wide'))}</button></div>
      <div class="req-mx-wrap"><table class="req-mx"><thead><tr><th class="req-mx-r">${esc(T('req.mx.req'))}</th>${head}<th class="req-mx-n" title="${esc(T('req.mx.comps'))}">⬡</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="adr-hint">${esc(T('req.mx.legend'))}</p></div>`;
  }
  function reqCheckEditor(r, chk) {
    const c = r.check || {}, m = S.model, ps = REQ_PARAMS[c.metric] || [];
    const sel = (attrs, cur, items, label) => `<select ${attrs} aria-label="${esc(label)}">${items.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(cur ?? '') ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
    const nodes = [['', '–'], ...m.nodes.map(n => [n.id, n.label || n.id])];
    const unit = { availability: '%', rpo: T('req.unit.h'), rto: T('req.unit.h'), freshness: T('req.unit.h'), cost: `${COST.currency} / ${T('adr.o.month')}` }[c.metric];
    const fields = [
      ps.includes('from') ? `<label>${esc(T('req.chk.p.from'))}${sel('data-rc="from"', c.from, nodes, T('req.chk.p.from'))}</label><label>${esc(T('req.chk.p.to'))}${sel('data-rc="to"', c.to, nodes, T('req.chk.p.to'))}</label>` : '',
      ps.includes('ds') ? `<label>${esc(T('req.chk.p.ds'))}${sel('data-rc="ds"', c.ds, [['', '–'], ...catalog(m).map(x => [x.name, x.name]), ...(c.ds && !catalog(m).some(x => x.key === dsK(c.ds)) ? [[c.ds, c.ds]] : [])], T('req.chk.p.ds'))}</label>` : '',
      ps.includes('target') ? `<label>${esc(T('req.chk.p.target'))} (${esc(unit)})<input type="number" min="0"${c.metric === 'availability' ? ' max="100"' : ''} step="any" data-rc="target" value="${c.target != null ? esc(c.target) : ''}" autocomplete="off"></label>` : '',
      ps.includes('cls') ? `<label>${esc(T('req.chk.p.cls'))}${sel('data-rc="cls"', c.cls, [['', '–'], ...Object.keys(DATA).map(k => [k, loc(DATA[k].label) || k])], T('req.chk.p.cls'))}</label>` : '',
      ps.includes('jur') ? `<label>${esc(T('req.chk.p.jur'))}${sel('data-rc="jur"', c.jur, [['', '–'], ...Object.keys(JURS).map(k => [k, loc(JURS[k].label) || k])], T('req.chk.p.jur'))}</label>` : ''
    ].filter(Boolean);
    return `<div class="req-check"><div class="req-check-h"><span>${esc(T('req.check'))}</span>${reqBadge(r, chk)}</div>
      <label>${esc(T('req.chk.metric'))}${sel('data-rc="metric"', c.metric, [['', T('req.chk.nometric')], ...REQ_METRIC.map(k => [k, T(`req.m.${k}`)])], T('req.chk.metric'))}</label>
      ${fields.length ? `<div class="adr-two req-check-p">${fields.join('')}</div>` : ''}
      ${c.metric ? `<p class="adr-hint">${esc(T(`req.m.${c.metric}.hint`))}${r.status === 'agreed' ? '' : ` ${esc(T('req.chk.draft'))}`}</p>` : ''}</div>`;
  }
  function reqCard(r, rs, chk) {
    const on = REQ.open === r.id, links = reqLinkList(r), col = REQ_COLOR[r.kind], cov = reqCoverText(r);
    const goChip = (l, rm) => `<span class="adr-link"><button type="button" data-req-go="${l.kind}:${esc(l.id)}" title="${esc(T('adr.go'))}">${esc(T(l.kind === 'decisions' ? 'req.kind.dec' : `adr.kind.${l.kind}`))}: ${esc(l.label)}</button>${rm ? `<button type="button" class="adr-x" data-req-unlink="${l.kind}:${esc(l.id)}" title="${esc(T('adr.unlink'))}" aria-label="${esc(T('adr.unlink'))}">×</button>` : ''}</span>`;
    const sel = (attrs, cur, items) => `<select ${attrs}>${items.map(([v, t]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
    let form = '';
    if (on) {
      const free = (S.model.decisions || []).filter(d => !r.links?.decisions?.includes(d.id));
      form = `<div class="adr-form">
        <label>${esc(T('adr.f.id'))}<input value="${esc(r.id)}" readonly></label>
        <label>${esc(T('adr.f.title'))}<input data-rf="title" value="${esc(r.title)}" maxlength="200" autocomplete="off" placeholder="${esc(T('req.f.title.ph'))}"></label>
        <div class="adr-two"><label>${esc(T('req.f.kind'))}${sel('data-rf="kind"', r.kind, kinds2())}</label><label>${esc(T('req.f.priority'))}${sel('data-rf="priority"', r.priority || '', [['', '–'], ...REQ_PRIO.map(k => [k, T(`req.pr.${k}`)])])}</label></div>
        <div class="adr-two"><label>${esc(T('req.f.status'))}${sel('data-rf="status"', r.status, REQ_STATUS.map(k => [k, T(`req.st.${k}`)]))}</label>
          <label>${esc(T('req.f.source'))}<input data-rf="source" value="${esc(r.source || '')}" maxlength="120" placeholder="${esc(T('req.f.source.ph'))}" autocomplete="off"></label></div>
        <label>${esc(T('req.f.detail'))}<textarea data-rf="detail" rows="4" maxlength="4000" placeholder="${esc(T('req.f.detail.ph'))}">${esc(r.detail || '')}</textarea></label>
        ${reqCheckEditor(r, chk)}
        <div class="adr-links-edit"><span>${esc(T('req.f.links'))}</span>${links.length ? links.map(l => goChip(l, true)).join('') : `<em>${esc(T('adr.noLinks'))}</em>`}
          <div class="adr-row"><button class="btn small" data-req="linksel">${esc(T('adr.linkSel'))}</button>
          ${free.length ? `<select data-req-linkdec aria-label="${esc(T('req.linkDec'))}"><option value="">${esc(T('req.linkDec'))}</option>${free.map(d => `<option value="${esc(d.id)}">${esc(`${d.id} · ${adrTitle(d)}`)}</option>`).join('')}</select>` : ''}</div></div>
        <button class="btn small danger" data-req="del">${esc(T('req.delete'))}</button>
      </div>`;
    }
    return `<div class="adr req${on ? ' on' : ''}${r.status === 'dropped' ? ' dropped' : ''}" data-id="${esc(r.id)}" style="--s:${col}">
      <button type="button" class="adr-head" data-req-toggle aria-expanded="${on}"><b class="adr-id">${esc(r.id)}</b><span class="adr-title">${esc(reqTitle(r))}</span><span class="adr-pill" style="--s:${REQ_ST_COLOR[r.status]}">${esc(T(`req.st.${r.status}`))}</span></button>
      <div class="adr-meta req-meta"><span class="req-meta-t">${esc(reqMeta(r))}</span>${reqBadge(r, chk)}</div>
      <div class="req-cov ${cov.cls}">${esc(cov.text)}</div>
      ${raidChipsFor(r.id, 'requirements')}
      ${!on && r.detail ? `<div class="req-detail">${esc(r.detail)}</div>` : ''}
      ${form}
    </div>`;
  }
  const kinds2 = () => REQ_KIND.map(k => [k, T(`req.kind.${k}`)]);
  function renderReqList(chk = reqChecks()) {
    const box = $('#req-list');
    if (!box || !S.model) return;
    const rs = S.model.requirements || [], shown = rs.filter(reqMatches), keep = box.parentElement?.scrollTop || 0, hx = box.querySelector('.req-mx-wrap')?.scrollLeft || 0;
    box.innerHTML = !rs.length ? `<p class="fnd-empty">${esc(T('req.empty'))}</p>`
      : !shown.length ? `<p class="fnd-empty">${esc(T('req.noMatch'))}</p>`
      : REQ.view === 'matrix' ? reqMatrix(shown, S.model.decisions || []) : shown.map(r => reqCard(r, rs, chk)).join('');
    if (box.parentElement) box.parentElement.scrollTop = keep;
    const w = box.querySelector('.req-mx-wrap');
    if (w && hx) w.scrollLeft = hx;
  }
  reqPanel?.addEventListener('focusin', ev => { if (ev.target.dataset?.rf && ev.target.tagName !== 'SELECT') beginEdit(); });
  reqPanel?.addEventListener('focusout', ev => { if (ev.target.dataset?.rf) endEdit(); });
  reqPanel?.addEventListener('input', ev => {
    const f = ev.target;
    if (f.id === 'req-q') { REQ.q = f.value; return renderReqList(); }
    const k = f.dataset?.rf, card = f.closest('.req'), r = k && f.tagName !== 'SELECT' && card && reqById(card.dataset.id);
    if (!r) return;
    markEdit();
    if ((k === 'source' || k === 'detail') && !f.value.trim()) delete r[k]; else r[k] = f.value;
    syncEditor(); save();
    if (k === 'title') card.querySelector('.adr-title').textContent = reqTitle(r);
    if (k === 'source') card.querySelector('.req-meta-t').textContent = reqMeta(r);
  });
  reqPanel?.addEventListener('change', ev => {
    const f = ev.target, card = f.closest('.req'), r = card && reqById(card.dataset.id);
    if (!r) return;
    if (f.dataset.reqLinkdec != null) { if (f.value) updateRequirement(r.id, { links: reqAddLinks(r, { decisions: [f.value] }) }); return; }
    const rc = f.dataset.rc;
    if (rc) {
      if (rc === 'metric') return void updateRequirement(r.id, { check: f.value ? { ...r.check, metric: f.value, target: undefined } : null });   // el objetivo cambia de unidad con la métrica: se vuelve a escribir
      return void updateRequirement(r.id, { check: { ...r.check, [rc]: f.value } });
    }
    const k = f.dataset.rf;
    if (!k) return;
    if (f.tagName === 'SELECT') updateRequirement(r.id, { [k]: f.value });
    else { changed(true); renderInspector(); renderReq(true); }
  });
  reqPanel?.addEventListener('click', async ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    const d0 = b.dataset, card = b.closest('.req'), r = card && reqById(card.dataset.id);
    if (d0.reqF != null) { const [name, v] = d0.reqF.split(':'); REQ[name] = REQ[name] === v ? '' : v; return renderReq(true); }
    if (d0.reqView) { REQ.view = d0.reqView; REQ.wide = false; return renderReq(true); }
    if (d0.req === 'new') { REQ.q = ''; REQ.kind = ''; REQ.st = ''; REQ.pr = ''; return reqOpen(addRequirement()); }
    if (d0.req === 'wide') { REQ.wide = !REQ.wide; return renderReq(true); }
    if (d0.reqOpen) return reqOpen(d0.reqOpen);
    if (d0.reqTgl) {   // celda de la matriz: vincula o desvincula la decisión
      const [rid, did] = d0.reqTgl.split('|'), q = reqById(rid);
      if (!q) return;
      return void updateRequirement(rid, { links: { ...q.links, decisions: q.links?.decisions?.includes(did) ? q.links.decisions.filter(x => x !== did) : [...(q.links?.decisions || []), did] } });
    }
    if (d0.reqToggle != null && r) { REQ.open = REQ.open === r.id ? null : r.id; return renderReq(true); }
    if (d0.reqGo) { const [k, ...rest] = d0.reqGo.split(':'), id = rest.join(':'); return k === 'decisions' ? adrOpen(id) : adrFocus(k, id); }
    if (!r) return;
    if (d0.reqUnlink) {
      const [k, ...rest] = d0.reqUnlink.split(':'), id = rest.join(':');
      return void updateRequirement(r.id, { links: { ...r.links, [k]: (r.links?.[k] || []).filter(x => x !== id) } });
    }
    if (d0.req === 'linksel') {
      const l = adrSelLinks();
      if (!l) return toast(T('adr.noSel'));
      return void updateRequirement(r.id, { links: reqAddLinks(r, l) });
    }
    if (d0.req === 'del' && await confirmBox({ title: T('req.cf.title', r.id), text: T('req.cf.text', reqTitle(r)), ok: T('req.delete'), cancel: T('ver.cf.cancel'), danger: true })) removeRequirement(r.id);
  });
  // Chips de requisitos en la ficha de la decisión y en el inspector abren el requisito
  [adrPanel, $('#inspector')].forEach(box => box?.addEventListener('click', ev => { const b = ev.target.closest('button[data-req-open]'); if (b) reqOpen(b.dataset.reqOpen); }));

  // Inspector del nodo: exposición y respaldo (automáticos o a mano) y sus hallazgos abiertos
  const secField = n => {
    const ex = exposureOf(n), bk = backupOf(n), curE = n.exposure === 'public' || n.exposure === 'internal' ? n.exposure : '', curB = typeof n.backup === 'boolean' ? (n.backup ? 'yes' : 'no') : '';
    const seg = (attr, cur, items) => `<div class="seg">${items.map(([k, l]) => `<button ${attr}="${k}" class="${cur === k ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;
    const mine = FC.open.filter(f => f.target.kind === 'node' && f.target.id === n.id);
    const exL = v => T(v === 'public' ? 'sec.expo.public' : 'sec.expo.internal'), bkL = v => T(v ? 'sec.yes' : 'sec.no');
    return `<div class="field sec-field">${T('sec.label')}
      <div class="sec-row"><span>${T('sec.expo.label')}</span>${seg('data-expo', curE, [['', T('sec.auto', { v: exL(ex.value) })], ['public', exL('public')], ['internal', exL('internal')]])}
        <span class="cost-hint">${esc(ex.auto ? ex.why : T('sec.why.manual'))}</span></div>
      <div class="sec-row"><span>${T('sec.backup.label')}</span>${seg('data-bak', curB, [['', T('sec.auto', { v: bkL(bk.value) })], ['yes', T('sec.yes')], ['no', T('sec.no')]])}
        <span class="cost-hint">${esc(bk.auto ? bk.why : T('sec.why.manual'))}</span></div>
      ${mine.length ? `<div class="sec-list">${mine.map(f => `<div style="--s:var(--sev-${f.severity})"><i></i><span><b>${esc(sevLabel(f.severity))}</b> · ${esc(f.title)}</span></div>`).join('')}</div>` : ''}
    </div>`;
  };

  /* ---------- avisos ---------- */
  let toastTimer;
  // Diálogo de confirmación propio: Promise<boolean>; Esc cancela, Enter acepta, foco en lo seguro
  function confirmBox({ title, text, list, ok = 'OK', cancel = 'Cancel', danger = false }) {
    return new Promise(done => {
      const prev = document.activeElement, id = `cf${Date.now()}`;
      const back = document.createElement('div');
      back.className = 'cf-back';
      back.innerHTML = `<div class="cf" role="dialog" aria-modal="true" aria-labelledby="${id}t" aria-describedby="${id}d">
        <h3 id="${id}t">${esc(title)}</h3>
        <div id="${id}d">${text ? `<p>${esc(text)}</p>` : ''}${list?.length ? `<ul>${list.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>
        <div class="cf-actions"><button class="btn" data-cf="no">${esc(cancel)}</button><button class="btn${danger ? ' danger' : ' primary'}" data-cf="ok">${esc(ok)}</button></div></div>`;
      const close = r => { document.removeEventListener('keydown', key, true); back.remove(); prev?.focus?.(); done(r); };
      const key = ev => {
        if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(false); }
        else if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); close(document.activeElement?.dataset?.cf === 'ok'); }
        else if (ev.key === 'Tab') { ev.preventDefault(); const b = [...back.querySelectorAll('button')]; b[(b.indexOf(document.activeElement) + (ev.shiftKey ? b.length - 1 : 1)) % b.length].focus(); }
      };
      back.addEventListener('mousedown', ev => { if (ev.target === back) close(false); });
      back.addEventListener('click', ev => { const b = ev.target.closest('[data-cf]'); if (b) close(b.dataset.cf === 'ok'); });
      document.addEventListener('keydown', key, true);
      document.body.appendChild(back);
      back.querySelector('[data-cf="no"]').focus();
    });
  }

  // Confirmación escrita: el botón sigue deshabilitado hasta teclear la frase (sin pegar ni arrastrar)
  const normPhrase = x => String(x).trim().replace(/\s+/g, ' ').toLowerCase();
  function phraseBox({ title, text, phrase, ok, cancel }) {
    return new Promise(done => {
      const prev = document.activeElement, id = `cf${Date.now()}`;
      const back = document.createElement('div');
      back.className = 'cf-back';
      back.innerHTML = `<div class="cf" role="dialog" aria-modal="true" aria-labelledby="${id}t" aria-describedby="${id}d">
        <h3 id="${id}t">${esc(title)}</h3>
        <div id="${id}d"><p>${esc(text)}</p><p>${esc(T('ver.cf.phraseIntro'))}</p><p class="cf-phrase" id="${id}p">${esc(phrase)}</p></div>
        <input class="cf-type" type="text" aria-labelledby="${id}p" aria-describedby="${id}h" autocomplete="off" spellcheck="false" autocorrect="off" autocapitalize="off">
        <div class="cf-hint" id="${id}h" role="status" aria-live="polite"></div>
        <div class="cf-actions"><button class="btn" data-cf="no">${esc(cancel)}</button><button class="btn danger" data-cf="ok" disabled>${esc(ok)}</button></div></div>`;
      const input = back.querySelector('input'), okBtn = back.querySelector('[data-cf="ok"]'), hint = back.querySelector('.cf-hint');
      const want = normPhrase(phrase);
      let hintTimer;
      const close = r => { clearTimeout(hintTimer); document.removeEventListener('keydown', key, true); back.remove(); prev?.focus?.(); done(r); };
      const noPaste = ev => {
        ev.preventDefault();
        hint.textContent = T('ver.cf.noPaste');
        clearTimeout(hintTimer);
        hintTimer = setTimeout(() => { hint.textContent = ''; }, 2600);
      };
      ['paste', 'drop'].forEach(t => input.addEventListener(t, noPaste));
      input.addEventListener('beforeinput', ev => { if (['insertFromPaste', 'insertFromDrop', 'insertReplacementText', 'insertFromYank'].includes(ev.inputType)) noPaste(ev); });
      input.addEventListener('input', () => { okBtn.disabled = normPhrase(input.value) !== want; });
      const key = ev => {
        if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(false); }
        else if (ev.key === 'Enter') {
          ev.preventDefault(); ev.stopPropagation();
          if (document.activeElement?.dataset?.cf === 'no') close(false);
          else if (!okBtn.disabled) close(true);
        }
        else if (ev.key === 'Tab') { ev.preventDefault(); const b = [input, ...back.querySelectorAll('button:not(:disabled)')]; b[(b.indexOf(document.activeElement) + (ev.shiftKey ? b.length - 1 : 1)) % b.length].focus(); }
      };
      back.addEventListener('mousedown', ev => { if (ev.target === back) close(false); });
      back.addEventListener('click', ev => { const b = ev.target.closest('[data-cf]'); if (b && !b.disabled) close(b.dataset.cf === 'ok'); });
      document.addEventListener('keydown', key, true);
      document.body.appendChild(back);
      input.focus();
    });
  }

  function toast(msg, ms = 1800) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  /* ---------- arranque ---------- */
  function init() {
    loadFonts();
    applyTheme();
    applyLang();
    $('#app-name').textContent = C.app.name;
    if (store.get('collapsed', false) && !matchMedia('(max-width: 760px)').matches) $('#main').classList.add('collapsed');
    const tab = store.get('tab', 'components');
    $(`.tab[data-tab="${tab}"]`)?.click();
    svg.classList.toggle('anim-off', !S.anim);
    $('#btn-anim').classList.toggle('on', S.anim);
    const saved = store.get('model', null);
    S.scope = store.get('scope', null);  // se recupera el nivel C4 abierto si sigue existiendo
    setModel(saved && Array.isArray(saved.nodes) ? saved : I.deep(EXAMPLES[0]?.diagram || { title: T('model.new') }), { animate: true, keepScope: true, current: !(saved && Array.isArray(saved.nodes)) });
    fitView(false);
    requestAnimationFrame(tick);
  }

  // API: equipos con sus dueños, responsables y nodos (valores efectivos, con herencia); los nodos sin equipo salen con team ''
  function govTeamList(m = S.model) {
    const by = new Map();
    m.nodes.forEach(n => {
      const [team, owner, steward] = ['team', 'owner', 'steward'].map(f => govOf(n, f, m).value);
      if (!team && !owner && !steward) return;
      if (!by.has(team)) by.set(team, { team, owners: new Set(), stewards: new Set(), nodes: [] });
      const t = by.get(team);
      if (owner) t.owners.add(owner);
      if (steward) t.stewards.add(steward);
      t.nodes.push(n.id);
    });
    return [...by.values()].sort((a, b) => (!a.team - !b.team) || a.team.localeCompare(b.team)).map(t => ({ ...t, owners: [...t.owners].sort(), stewards: [...t.stewards].sort() }));
  }

  /* ---------- conjuntos de datos: API (todo pasa por cleanCatalog; deshacer como cualquier cambio) ---------- */
  const dsCommit = (list, extra = {}) => { // list = nuevo m.datasets; extra = otros cambios del modelo (renombrar toca también las conexiones)
    pushHistory();
    Object.assign(S.model, extra);
    if (list.length) S.model.datasets = list; else delete S.model.datasets;
    changed(true);
  };
  function addDataset(d = {}) {
    d = d && typeof d === 'object' ? d : {};
    const cur = S.model.datasets || [];
    if (cur.length >= DS_MAX || !dsText(d.name, 120) || cur.some(x => dsK(x.name) === dsK(d.name))) return '';
    const list = cleanCatalog([...cur, { ...d, id: '' }], S.model, dsHelpers());
    if (list.length !== cur.length + 1) return '';
    dsCommit(list);
    return list[list.length - 1].id;
  }
  function updateDataset(id, patch) {
    const ds = dsById(id);
    if (!ds || !patch || typeof patch !== 'object') return false;
    const { id: _i, name: _n, ...rest } = patch;   // el id no cambia; el nombre se cambia con renameDataset (arrastra las conexiones)
    const list = cleanCatalog(S.model.datasets.map(x => (x === ds ? { ...ds, ...rest } : x)), S.model, dsHelpers());
    if (list.length !== S.model.datasets.length) return false;
    dsCommit(list);
    return true;
  }
  function removeDataset(id) {
    const ds = dsById(id);
    if (!ds) return false;
    dsCommit(S.model.datasets.filter(x => x !== ds));
    return true;
  }
  function renameDatasetApi(id, name) {
    const m2 = renameDataset(S.model, id, name);
    if (m2 === S.model) return false;
    dsCommit(m2.datasets, { edges: m2.edges });
    return true;
  }
  const catalogApi = () => catalog(S.model).map(c => ({ ...c, ds: c.ds ? clone(c.ds) : null, nodes: [...c.nodes] }));
  const freshnessApi = name => { const r = e2eOf(name); return { ...r, path: [...r.path] }; };
  const storageApi = id => { const ds = dsFind(id); return ds ? storageEstimate(ds, { prices: dsPrices() }) : null; };

  // API para extensiones futuras (consola o scripts propios)
  window.Diagramon = {
    get model() { return clone(S.model); },
    load: (raw, opts = {}) => setModel(raw, { history: true, animate: true, fit: true, ...opts }),
    addNode, addEdge, relayout, fitView, togglePlay, present, presentViews: () => present({ views: true }), presentPhases: () => present({ phases: true }), exitPresent, toggleTheme, toggleLang,
    get lang() { return I.lang; },
    select: ids => select({ kind: 'multi', ids: [].concat(ids) }), align: alignNodes,
    showPath, clearPath,
    lineage: ds => { const r = showLineage(ds); return r ? { origins: [...r.origins], consumers: [...r.consumers], hops: r.hops, nodes: [...r.nodes], edges: [...r.edges] } : null; },
    datasets: () => datasetList().map(d => ({ ...d })), contractYaml, contractsYaml,
    catalog: catalogApi, dataset: v => { const d = dsFind(v); return d ? clone(d) : null; }, addDataset, updateDataset, removeDataset, renameDataset: renameDatasetApi, freshness: freshnessApi, storage: storageApi,
    saveVersion, openVersion, compareVersion, deleteVersion,
    costBreakdown: (by = 'team') => costBreakdown(S.model, by), compareCosts: (a = null, b = null) => { const A = cstSource(a || null), B = cstSource(b || null); return A && B ? cstCompare(A, B) : null; }, openCosts,
    setFilter, clearFilter, get filter() { return clone(S.filter); },
    crossBorder: () => { const byId = new Map(S.model.nodes.map(n => [n.id, n])); return S.model.edges.map(e => ({ e, cb: crossBorder(e, byId) })).filter(x => x.cb)
      .map(({ e, cb }) => ({ edge: clone(e), from: cb.from, to: cb.to, fromRegion: cb.from.region, toRegion: cb.to.region, fromJur: cb.from.jur.short, toJur: cb.to.jur.short, classes: [...cb.classes], approved: cb.approved })); },
    layers: () => ({ naming: layerNaming(), layers: Object.keys(DL).map(k => ({ key: k, label: layerInfo(k).label, nodes: S.model.nodes.filter(n => layerOf(n).value === k).map(n => n.id) })) }),
    setLayerNames,
    compliance: () => complianceReport(), exportCompliance: (kind = 'wide') => exportCompliance(kind === 'long' ? 'long' : 'wide'),
    setView, get view() { return S.viewKey; }, get views() { return [...VIEW_KEYS]; },
    owners: () => govTeamList(),
    availability: (a, b) => availability(a, b), spofs: () => spofList().map(x => ({ ...x })),
    findings: (opts = {}) => apiFindings(opts), dismissFinding: (id, reason) => dismissFinding(id, reason), restoreFinding: id => restoreFinding(id),
    threats: () => strideAll().map(t => ({ edge: t.e.id, from: t.e.from, to: t.e.to, zones: t.zones.map(z => z.id), category: t.cat, severity: t.severity, status: t.status, note: t.note })),
    exportThreats, exportReport, statusReport, statusOutput,
    inventory: () => inventoryRows(S.model).map(r => ({ ...r })), exportInventory: (kind = 'xlsx') => exportInventory(['csv', 'csv-all'].includes(kind) ? kind : 'xlsx'),
    signoff: (kind, id, sid, verdict, note) => signOff(kind, id, sid, verdict, note), approval: (kind, id) => apprInfo(kind, id),
    decisions: () => clone(S.model.decisions || []), compareDecisions: id => { const v = S.model.versions.find(x => x.id === id); return v && Array.isArray(v.decisions) ? diffDecisions(v.decisions, S.model.decisions || []) : null; }, addDecision, updateDecision, removeDecision, exportDecisions,
    addDecisionKit: id => addDecisionKit(id), decisionKits: () => adrKits().map(k => ({ id: k.id, name: loc(k.name), desc: loc(k.desc), decisions: k.decisions.length })),
    phases: () => clone(S.model.phases || []), addPhase, updatePhase: (id, patch) => updatePhase(id, patch), removePhase, setPhase, get phase() { return S.phase; },
    phaseModel: i => clone(phaseModel(S.model, +i)), phaseStats: i => phaseStats(S.model, +i, phaseHelpers), phaseRows: () => phaseRows(S.model, phaseHelpers),
    raid: () => clone(S.model.raid || []), addRaid, updateRaid, removeRaid, validateAssumption,
    stakeholders: () => clone(S.model.stakeholders || []), addStakeholder, updateStakeholder, removeStakeholder,
    adrScore: id => { const d = adrById(id); return d ? { options: Object.fromEntries((d.options || []).map(o => [o.id, adrScore(d, o)])), leader: adrLeader(d) || null, chosen: d.chosen || null } : null; },
    requirements: () => clone(S.model.requirements || []), addRequirement, updateRequirement, removeRequirement, checkRequirement,
    setScope: id => setScope(id), get scope() { return S.scope; }, scopes: () => scopeList().map(x => ({ ...x, path: [...x.path] })), exportLevels,
    exportSVG, exportPNG, exportViews, exportJSON, shareEncrypted, exportOther, exportCtx, toggleRouting, importFiles, importDbt, config: C, icons: ICONS
  };

  init();
})();
