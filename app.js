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

  /* ---------- tipografías (las incluidas vienen de fonts/fonts.js, en base64) ---------- */
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
    scope: null                           // nivel C4 abierto: id del nodo cuyo diagrama interno se ve (null = nivel superior)
  };
  // Referencias a elementos SVG y medidas calculadas (nunca se guardan en el modelo)
  const R = { nodes: new Map(), edges: new Map(), groups: new Map(), width: new Map(), gbox: new Map(), notes: new Map(), zones: new Map() };
  // Lo que la vista activa oculta o resume (se recalcula en applyViewMode / updateContext) y el último resaltado
  const VW = { dimNodes: 0, dimEdges: 0, hideNodes: new Set(), hideEdges: new Set(), hideGroups: new Set(), flows: new Map(), ctxBoxes: new Map(), ctxEdges: new Map(), gcost: null, sc: { nodes: new Set(), edges: new Set(), groups: new Set() }, xs: null };
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
  const colorVar = k => !k ? null : paletteKeys().includes(k) ? `var(--p-${k})` : COLOR_ALIAS[k] ? `var(--p-${COLOR_ALIAS[k]})` : themeSafe(k);
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

  /* ---------- modelo ---------- */
  function normalize(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    const m = { title: String(raw.title || T('model.untitled')), groups: [], nodes: [], edges: [] };
    if (raw.direction === 'LR' || raw.direction === 'TB') m.direction = raw.direction;
    if (raw.routing === 'elbow') m.routing = 'elbow';
    if (raw.layerNames === 'zones') m.layerNames = 'zones';
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
      if (o.both === true || (typeof o.both === 'string' && /^(yes|true|si|sí)$/i.test(o.both))) o.both = true; else delete o.both;
      const dsl = cleanDatasets(o.datasets); if (dsl.length) o.datasets = dsl; else delete o.datasets;
      if (o.transferOk === true || (typeof o.transferOk === 'string' && /^(yes|true|ok|si|sí)$/i.test(o.transferOk))) o.transferOk = true; else delete o.transferOk;
      { const th = cleanThreats(o.threats); if (th) o.threats = th; else delete o.threats; }
      m.edges.push(o);
    });
    m.notes = []; m.zones = [];
    list(raw.notes).forEach((n, i) => {
      const o = { id: take(n.id, 'note', i), ...cleanBox(n, 180, 110), text: String(n.text ?? '') };
      if (n.color != null && String(n.color).trim()) o.color = String(n.color).trim();
      if (n.in != null && n.in !== '') o.in = String(n.in);
      m.notes.push(o);
    });
    list(raw.zones).forEach((z, i) => {
      const o = { id: take(z.id, 'zone', i), ...cleanBox(z, 360, 220), label: String(z.label ?? ''), severity: SEVERITY.includes(z.severity) ? z.severity : 'medium' };
      if (z.kind === 'trust') { o.kind = 'trust'; delete o.severity; if (z.trust != null && String(z.trust).trim()) o.trust = String(z.trust).trim(); }
      if (z.desc != null && String(z.desc).trim()) o.desc = String(z.desc);
      if (z.in != null && z.in !== '') o.in = String(z.in);
      m.zones.push(o);
    });
    cleanScopes(m);
    m.versions = normVersions(raw.versions);
    m.decisions = cleanDecisions(raw.decisions, m);
    if (raw.active != null && m.versions.some(v => v.id === String(raw.active))) m.active = String(raw.active);
    return m;
  }

  // Notas adhesivas y zonas de riesgo: posición y tamaño numéricos, con un mínimo de 60×40
  const SEVERITY = ['low', 'medium', 'high', 'critical'];
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
      o.diagram = v.diagram;
      return o;
    });
  }

  // Cada nivel C4 tiene su propio espacio de coordenadas: se ordena por separado (sin `in` en ningún lado = un solo nivel, como siempre)
  function ensurePositions(m) {
    if (!m.nodes.some(n => n.in)) return ensurePositionsIn(m);
    [...new Set(m.nodes.map(n => n.in || null))].forEach(sc => ensurePositionsIn(scopeModel(m, sc)));
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
  // m.decisions = [{ id: 'ADR-001', title, status, date, context, decision, consequences, deciders?, supersededBy?, links: { nodes?, edges?, groups?, versions? } }]
  // Son del documento: no entran en las fotos de versiones (snapshotOf) y sobreviven al abrir una versión y a los editores.
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
  function cleanDecisions(raw, m) {
    const txt = v => String(v ?? '').replace(/\r\n?/g, '\n').slice(0, 20000);
    const seen = new Set(), items = [];
    (Array.isArray(raw) ? raw : []).forEach(d => {
      if (!d || typeof d !== 'object' || Array.isArray(d)) return;
      const o = { title: String(d.title ?? '').trim().slice(0, 200), context: txt(d.context), decision: txt(d.decision), consequences: txt(d.consequences) };
      let id = String(d.id ?? '').trim().slice(0, 40);
      if (!id && !o.title && !o.context && !o.decision && !o.consequences) return;
      if (!id || seen.has(id)) id = ''; else seen.add(id);
      items.push({ ...o, id, status: adrStatus(d.status), date: isDay(d.date) ? d.date : today(), deciders: String(d.deciders ?? '').trim().slice(0, 200), sup: String(d.supersededBy ?? '').trim(), links: cleanAdrLinks(d.links, m) });
    });
    items.forEach(o => { if (!o.id) o.id = adrNextId(items); });
    const ids = new Set(items.map(o => o.id));
    return items.map(o => {
      const r = { id: o.id, title: o.title, status: o.status, date: o.date, context: o.context, decision: o.decision, consequences: o.consequences };
      if (o.deciders) r.deciders = o.deciders;
      if (o.sup && o.sup !== o.id && ids.has(o.sup)) { r.supersededBy = o.sup; r.status = 'superseded'; }
      r.links = o.links;
      return r;
    });
  }
  const decisionsOf = (kind, id, m = S.model) => (m?.decisions || []).filter(d => d.links?.[kind]?.includes(id));
  // Tras borrar nodos, conexiones, grupos o versiones: quita de los enlaces los ids que ya no existen
  function pruneAdrLinks(m = S.model) { (m.decisions || []).forEach(d => { d.links = cleanAdrLinks(d.links, m); }); }
  // Hallazgo bajo (fuente «adr»): propuestas sin resolver desde hace más de C.adr.staleDays días
  addFindingSource('adr', m => {
    const days = C.adr?.staleDays ?? 30;
    if (!(days > 0)) return [];
    const now = Date.now();
    return (m.decisions || []).filter(d => d.status === 'proposed').flatMap(d => {
      const age = Math.floor((now - new Date(`${d.date}T12:00`).getTime()) / 864e5);
      if (!(age > days)) return [];
      const l = d.links || {}, tk = l.nodes?.[0] ? 'node' : l.edges?.[0] ? 'edge' : l.groups?.[0] ? 'group' : 'node', tid = l.nodes?.[0] || l.edges?.[0] || l.groups?.[0] || '';
      return [{ id: `adr:stale:${d.id}`, source: 'adr', rule: 'stale', severity: 'low', target: { kind: tk, id: tid }, title: T('adr.find.stale', { id: d.id, n: age }), detail: d.title, fix: T('adr.find.fix') }];
    });
  });

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
    const x = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v.replace('%', '').replace(',', '.').trim()) : NaN;
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
  // Disponibilidad compuesta del camino más corto entre a y b (en serie; el peor camino si hay varios)
  function pathAvailability(m, b, res) {
    if (!res || !res.nodes.size) return null;
    const byId = new Map(m.nodes.map(n => [n.id, n])), dist = res.dist, preds = new Map();
    m.edges.forEach(e => {
      if (!res.edges.has(e.id)) return;
      [[e.from, e.to], [e.to, e.from]].forEach(([u, v]) => { if (dist.get(u) + 1 === dist.get(v)) (preds.get(v) || preds.set(v, new Set()).get(v)).add(u); });
    });
    const fac = id => availOf(byId.get(id)) ?? 1, best = new Map();
    [...res.nodes].sort((x, y) => dist.get(x) - dist.get(y)).forEach(id => {
      let bp = null, bv = 1;
      (preds.get(id) || []).forEach(p => { const v = best.get(p)?.val ?? 1; if (bp == null || v < bv) { bp = p; bv = v; } });
      best.set(id, { val: bv * fac(id), prev: bp });
    });
    const order = [];
    for (let id = b, i = 0; id != null && i++ < 1000; id = best.get(id)?.prev) order.unshift(id);
    const ns = order.map(id => byId.get(id)), known = ns.filter(n => availOf(n) != null);
    const worst = known.reduce((w, n) => (!w || availOf(n) < availOf(w) ? n : w), null);
    const mx = k => { const v = ns.map(n => (n[k] != null ? parseDur(n[k]) : null)).filter(x => x != null); return v.length ? Math.max(...v) : null; };
    const av = known.length ? best.get(b).val : null;
    return { availability: av, downtimeYear: av == null ? null : downtime(av).year, nodes: order, unknown: ns.length - known.length, routes: res.count,
      worst: worst ? { id: worst.id, label: worst.label, availability: availOf(worst) } : null, rpo: mx('rpo'), rto: mx('rto') };
  }
  function availability(a, b) {
    const m = S.model;
    const res = shortestPaths(m, a, b, true) || shortestPaths(m, a, b, false);
    const r = pathAvailability(m, b, res);
    if (!r) return null;
    const { routes, ...rest } = r;
    return rest;
  }
  // Fragmento HTML para la barra del camino
  function pathResText(b, res) {
    const r = pathAvailability(S.model, b, res);
    if (!r) return '';
    const parts = [];
    if (r.availability != null) {
      parts.push(T('res.path.comp', { a: fmtPct(r.availability), d: fmtApprox(r.downtimeYear) }) + (r.worst ? ` · ${T('res.path.worst', { n: esc(r.worst.label), a: fmtPct(r.worst.availability) })}` : ''));
      if (r.routes > 1) parts.push(T('res.path.routes', r.routes));
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
    // Con punta en ambos extremos las partículas van y vienen (al menos dos, alternando sentido)
    const parts = Array.from({ length: cfg.particles ? (e.both ? Math.max(2, cfg.particles) : cfg.particles) : 0 }, () => el('circle', { class: 'particle', r: st === 'data' ? 2.4 : 3, cx: -9999, cy: -9999 }, g));
    const byId = id => S.model.nodes.find(n => n.id === id);
    if (isInsecure(e, byId)) g.classList.add('insecure');
    const r = { g, e, hit, line, arrow, label: null, parts, len: 0, phase: Math.random(), xb: null };
    R.edges.set(e.id, r);
    if (e.datasets?.length) el('title', null, g).textContent = T('lin.tip', { list: e.datasets.join(', ') });
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
    const inb = info.inbound, enc = e.encrypted, sync = (C.edgeStyles[e.style] ? e.style : 'sync') === 'sync';
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
    const dt = [...(n.review ? [{ ...reviewTag(n.review), cls: 'dt-review' }] : []), ...dataTags(n).map(t => ({ ...t, cls: 'dt-data' })), ...adrTags(n)];
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
  function arrowD(line, len, both) {
    const p = line.getPointAtLength(len), q = line.getPointAtLength(Math.max(0, len - 9));
    const ang = Math.atan2(p.y - q.y, p.x - q.x), c = Math.cos(ang), s = Math.sin(ang);
    const bx = p.x - 10 * c, by = p.y - 10 * s;
    let ad = `M${p.x},${p.y} L${bx - 5 * s},${by + 5 * c} L${bx + 5 * s},${by - 5 * c} Z`;
    if (both) { // segunda punta en el origen, mirando hacia fuera
      const p0 = line.getPointAtLength(0), q0 = line.getPointAtLength(Math.min(len, 9));
      const a0 = Math.atan2(p0.y - q0.y, p0.x - q0.x), c0 = Math.cos(a0), s0 = Math.sin(a0);
      const bx0 = p0.x - 10 * c0, by0 = p0.y - 10 * s0;
      ad += ` M${p0.x},${p0.y} L${bx0 - 5 * s0},${by0 + 5 * c0} L${bx0 + 5 * s0},${by0 - 5 * c0} Z`;
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
      const e = r.e, a = rect(e.from), b = rect(e.to), off = pairs.has(e.to + '\0' + e.from) ? 7 : 0, pt = ports.get(e.id);
      const d = e.from === e.to ? loopPath(a)
        : pt ? elbowPath(a, b, pt.s, allRects.filter(o => o.id !== e.from && o.id !== e.to), pt.t) : curvePath(a, b, off);
      r.hit.setAttribute('d', d);
      r.line.setAttribute('d', d);
      r.len = r.line.getTotalLength();
      r.arrow.setAttribute('d', arrowD(r.line, r.len, e.both));
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
    return { nodes, edges, hops, count: f.cnt.get(b), dist };
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
    if (vc().groups === 'collapse-top') { toast(T('ctx.noPath')); return null; }
    const m = S.model, res = lineageOf(m, ds);
    if (!res) { toast(T('lin.unknown', { name: String(ds) })); return null; }
    clearPath();
    S.path = { lineage: res.name, res, directed: true };
    $('#path-text').innerHTML = T('lin.summary', { name: esc(res.name), src: res.origins.length, dst: res.consumers.length, hops: res.hops });
    const bar = $('#path-bar');
    bar.style.top = S.compare ? '54px' : '';
    bar.hidden = false;
    res.nodes.forEach(id => {
      const n = m.nodes.find(x => x.id === id);
      if (!n || VW.hideNodes.has(id)) return;
      const g = el('g', { class: `path-badge${res.origins.includes(id) ? ' lin-src' : ''}${res.consumers.includes(id) ? ' lin-dst' : ''}`, 'data-id': id, transform: `translate(${n.x + 2} ${n.y + 2})` }, L.guides);
      el('circle', { r: 9 }, g);
      el('text', {}, g).textContent = res.dist.get(id) + 1;
    });
    fitNodes([...res.nodes]);
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
    const labelBoxes = [...rects.values()].map(r => ({ x0: r.x - 4, x1: r.x + r.w + 4, y0: r.y - 4, y1: r.y + r.h + 4 })); // etiquetas ya colocadas y tarjetas fantasma
    links.forEach(l => {
      const gr = rects.get(l.gid);
      if (!gr || collapse) return;
      const t = target(l.target), A = l.out ? t : gr, B = l.out ? gr : t;
      const d = m.routing === 'elbow' ? elbowPath(A, B, 0, []) : curvePath(A, B, 0);
      const g = el('g', { class: 'xs-edge' }, L.scope), line = el('path', { class: 'xs-edge-line', d }, g);
      el('path', { class: 'xs-edge-arrow', d: arrowD(line, line.getTotalLength(), l.both) }, g);
      if (l.label) {
        const txt = fitText(String(l.label).split('\n')[0], FONT.edge, 150), len = line.getTotalLength(), w = Math.ceil(textW(txt, FONT.edge)) + 10, hit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
        const boxAt = (p, dy = 0) => ({ x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y - 15 + dy, y1: p.y + 4 + dy });
        let pos = null, p;
        for (const t of [0.5, 0.35, 0.65, 0.25, 0.75, 0.18, 0.82]) { // se prueban posiciones a lo largo de la línea y se toma la primera libre
          p = line.getPointAtLength(len * t);
          if (!labelBoxes.some(b => hit(boxAt(p), b))) { pos = { x: p.x, y: p.y }; break; }
        }
        if (!pos) { // sin hueco: punto medio, desplazado en vertical hasta quedar libre (o lo menos solapado)
          p = line.getPointAtLength(len / 2);
          let dy = 0;
          for (const k of [1, -1, 2, -2, 3, -3, 4, -4]) { if (!labelBoxes.some(b => hit(boxAt(p, k * 15), b))) { dy = k * 15; break; } }
          pos = { x: p.x, y: p.y + dy };
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
    scopeModel().nodes.forEach(n => {
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
      const sts = new Set(list.map(e => (C.edgeStyles[e.style] ? e.style : 'sync'))), st = sts.size === 1 ? [...sts][0] : 'sync', cfg = C.edgeStyles[st];
      const insecure = list.some(e => isInsecure(e, id => byId.get(id)));
      const g = el('g', { class: `edge ctx-edge edge-${st}${cfg.dash ? ' edge-dashed' : ''}${insecure ? ' insecure' : ''}`, 'data-key': x.key }, L.ctx);
      g.style.setProperty('--c', (one && colorVar(list[0].color)) || A.color);
      g.style.setProperty('--w', `${cfg.width + (one ? 0 : Math.min(2.4, Math.log2(list.length) * 0.7))}px`);
      const d = m.routing === 'elbow' ? elbowPath(A.r, B.r, 0, rects.filter(o => o !== A.r && o !== B.r), 0) : curvePath(A.r, B.r, 0);
      const hit = el('path', { class: 'edge-hit', d }, g), line = el('path', { class: 'edge-line', d }, g);
      if (cfg.dash) {
        line.setAttribute('stroke-dasharray', cfg.dash);
        const dist = cfg.dash.split(/[\s,]+/).reduce((sum, q) => sum + (+q || 0), 0) * 4;
        g.style.setProperty('--dash-to', `${-dist}px`);
        g.style.setProperty('--dash-dur', `${(dist / (C.animation.particleSpeed * 0.5)).toFixed(2)}s`);
      }
      const len = line.getTotalLength();
      el('path', { class: 'edge-arrow', d: arrowD(line, len, both) }, g);
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
        r.phase = (r.phase + dt * C.animation.particleSpeed * f / r.len) % 1;
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
  const save = debounce(() => { store.set('model', S.model); updateMeta(); renderVersions(); renderAdr(); }, 250);

  const ORDER = {
    group: ['id', 'label', 'icon', 'color', 'parent', 'kind', 'owner', 'steward', 'team', 'costCenter', 'region', 'layer', 'controls', 'in'],
    node: ['id', 'label', 'type', 'icon', 'sub', 'badge', 'group', 'color', 'x', 'y', 'cost', 'costPeriod', 'costYears', 'data', 'review', 'desc', 'owner', 'steward', 'team', 'costCenter', 'region', 'layer', 'exposure', 'backup', 'controls', 'in', 'c4', 'sla', 'rpo', 'rto', 'replicas'],
    edge: ['id', 'from', 'to', 'label', 'style', 'route', 'both', 'color', 'data', 'encrypted', 'datasets', 'transferOk', 'threats'],
    note: ['id', 'x', 'y', 'w', 'h', 'text', 'color', 'in'],
    zone: ['id', 'x', 'y', 'w', 'h', 'label', 'severity', 'desc', 'kind', 'trust', 'in'],
    decision: ['id', 'title', 'status', 'date', 'deciders', 'context', 'decision', 'consequences', 'supersededBy', 'links']
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
    if (m.layerNames === 'zones') head.push(`  "layerNames": "zones"`);
    if (m.dismissed && Object.keys(m.dismissed).length) head.push(`  "dismissed": ${JSON.stringify(m.dismissed)}`);
    if (m.meta) head.push(`  "meta": ${JSON.stringify(m.meta)}`);
    const body = [...head, arr('groups', m.groups, ORDER.group), arr('nodes', m.nodes, ORDER.node), arr('edges', m.edges, ORDER.edge)];
    if (m.notes?.length) body.push(arr('notes', m.notes, ORDER.note));
    if (m.zones?.length) body.push(arr('zones', m.zones, ORDER.zone));
    if (m.decisions?.length) body.push(arr('decisions', m.decisions, ORDER.decision));
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
    // Tampoco el texto incluye notas ni zonas: si el editor no las trae, se conservan
    if (opts.fromEditor && S.model && raw && typeof raw === 'object') {
      if (!Array.isArray(raw.notes)) raw = { ...raw, notes: S.model.notes };
      if (!Array.isArray(raw.zones)) raw = { ...raw, zones: S.model.zones };
      if (!Array.isArray(raw.decisions)) raw = { ...raw, decisions: S.model.decisions }; // ni el texto ni el JSON (si se borra la clave) tocan las decisiones
      if (opts.fromEditor === 'text' && raw.dismissed === undefined && S.model.dismissed) raw = { ...raw, dismissed: S.model.dismissed }; // el texto no trae los hallazgos descartados
    }
    S.model = normalize(raw);
    ensurePositions(S.model);
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
    save();
    updateUndoButtons();
    if (opts.fit) fitView(opts.fit !== 'instant');
  }

  // Tras cambiar el modelo desde el lienzo o el inspector
  function changed(structural = true) {
    if (S.path) clearPath();
    if (S.model.decisions?.length) pruneAdrLinks();
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
    const xb = m.edges.filter(e => isXBorder(e, byId)).length;
    const open = m.nodes.filter(n => n.review && n.review.status !== 'resolved'), overdue = open.filter(n => reviewState(n.review) === 'overdue').length;
    const rz = m.zones.filter(z => z.kind !== 'trust'), zc = rz.filter(z => z.severity === 'critical').length;
    const zones = rz.length ? T('meta.zones', { n: rz.length, c: zc }) : '';
    const reviews = open.length ? T('meta.review', { n: open.length, o: overdue }) : '';
    refreshFindings();
    const nFind = FC.open.filter(f => f.source === 'rule').length;
    const sm = scopeModel(m);
    $('#stage-meta').textContent = [T('meta.nodes', sm.nodes.length), T('meta.edges', sm.edges.length), sm.groups.length ? T('meta.groups', sm.groups.length) : '', costs, insecure ? T('meta.insecure', insecure) : '', xb ? T('meta.xborder', xb) : '', zones, reviews, nFind ? T('meta.findings', nFind) : ''].filter(Boolean).join(' · ');
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
  const FLT_SECTIONS = ['data', 'review', 'provider', 'category', 'group', 'cost', 'team', 'owner', 'steward', 'costCenter', 'region', 'layer', 'compliance'];
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
    box.focus(); box.select();
    beginEdit();
    box.addEventListener('input', () => { markEdit(); o[key] = box.value; changed(true); });
    box.addEventListener('keydown', ev => { if (ev.key === 'Enter' && (!area || ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); box.blur(); } });
    box.addEventListener('blur', () => { box.remove(); endEdit(); if (S.sel?.id === id) renderInspector(); });
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
    const ranks = computeRanks(scopeModel()), max = Math.max(0, ...ranks.values());
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
    const ranks = computeRanks(m), max = Math.max(0, ...ranks.values());
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
    if (sl.kind === 'view') {
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
    const sl = P.slides[P.i], m = scopeModel();
    let box = null, lit = null, gin = null;
    if (sl.kind === 'view' && sl.key !== S.viewKey) setView(sl.key, { toast: false });  // recalcula el estado derivado de la vista
    if (sl.kind === 'group') {
      box = R.gbox.get(sl.g.id);
      lit = new Set(m.nodes.filter(n => inGroup(n, sl.g.id)).map(n => n.id));
      // El grupo y sus descendientes se quedan a plena luz
      gin = new Set(m.groups.filter(g => { let c = g, k = 0; while (c && k++ < 50) { if (c.id === sl.g.id) return true; c = groupById(c.parent); } return false; }).map(g => g.id));
    } else if (sl.kind === 'step') {
      lit = new Set(m.nodes.filter(n => sl.ranks.get(n.id) === sl.r).map(n => n.id));
      m.edges.forEach(e => { if (lit.has(e.from)) lit.add(e.to); });
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
  function present(opts = {}) {
    if (P || viewBusy || !S.model.nodes.length) return;
    cancelConnect();
    stopPlay();
    P = { slides: [], i: 0, views: !!opts.views, saved: { view: { ...S.view }, sel: S.sel, key: S.viewKey, flow: S.flow, chosen: S.viewChosen, stored: store.get('view') }, fs: false, idle: 0 };
    document.body.classList.add('presenting');
    svg.classList.add('presenting');
    $('#present-bar').hidden = false;
    $('#btn-present').classList.add('on');
    try { document.documentElement.requestFullscreen?.()?.catch?.(() => {}); } catch { /* sin pantalla completa */ }
    // Esperar a que el lienzo tome su nuevo tamaño
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!P) return;
      P.slides = P.views ? presentViewSlides() : presentSlides();
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
    const d = clone({ title: m.title, ...(m.direction ? { direction: m.direction } : {}), ...(m.routing ? { routing: m.routing } : {}), ...(m.layerNames ? { layerNames: m.layerNames } : {}), ...(m.dismissed ? { dismissed: m.dismissed } : {}), groups: m.groups, nodes: m.nodes, edges: m.edges, ...(m.notes?.length ? { notes: m.notes } : {}), ...(m.zones?.length ? { zones: m.zones } : {}) });
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
    S.model.active = v.id;
    S.verNote = '';
    versionsChanged();
    if (S.compare) applyCompare();
    toast(T(reset ? 'ver.updatedReset' : existed ? 'ver.updated' : 'ver.saved', { name: verLabel(v) }), reset ? 3200 : 1800);
  }
  function openVersion(id) {
    const v = findVersion(id);
    if (!v) return;
    S.sel = null;
    setModel({ ...clone(v.diagram), versions: S.model.versions, active: v.id, decisions: S.model.decisions }, { history: true });
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
  }

  // Diferencias entre lo guardado (a) y el lienzo (b). La posición no cuenta como cambio.
  const DIFF_FIELDS = {
    node: ['label', 'type', 'icon', 'sub', 'badge', 'group', 'color', 'cost', 'costPeriod', 'costYears', 'data', 'review', 'desc', 'owner', 'steward', 'team', 'costCenter', 'region', 'layer', 'exposure', 'backup', 'controls', 'in', 'c4', 'sla', 'rpo', 'rto', 'replicas'],
    edge: ['label', 'style', 'route', 'both', 'color', 'data', 'encrypted', 'datasets', 'transferOk', 'threats'],
    group: ['label', 'icon', 'color', 'parent', 'kind', 'owner', 'steward', 'team', 'costCenter', 'region', 'layer', 'controls', 'in']
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
    $('#compare-text').innerHTML = `${T('ver.comparing', { name: esc(verLabel(v)) })} · ${d.count.a + d.count.r + d.count.c ? esc(T('ver.summary', d.count)) : esc(T('ver.same'))}${cstVerLine(base, S.model) ? ` · ${esc(cstVerLine(base, S.model))}` : ''}`;
  }
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
    if (!(d.count.a + d.count.r + d.count.c)) return `<p class="ver-sum">${esc(T('ver.same'))}</p>`;
    const FIELD = { label: 'insp.name', sub: 'insp.detail', type: 'insp.type', icon: 'insp.icon', group: 'insp.group', color: 'insp.color', badge: 'field.badge',
      cost: 'cost.label', costPeriod: 'cost.period', costYears: 'cost.yearsAria', desc: 'insp.desc', style: 'insp.style', parent: 'insp.parent',
      data: 'data.label', encrypted: 'enc.label', route: 'insp.route', both: 'insp.dir', review: 'rev.label', kind: 'gkind.label', exposure: 'sec.expo.label', backup: 'sec.backup.label', controls: 'cmp.title', in: 'c4.in', c4: 'c4.label', sla: 'res.sla', rpo: 'res.rpo', rto: 'res.rto', replicas: 'res.replicas' };
    const fields = (fs, kind) => fs.map(f => T(kind === 'edge' && f === 'label' ? 'insp.label' : FIELD[f] || f).toLowerCase()).join(', ');
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
    const cl = cstVerLine(S.compare.base, S.model);
    return `<p class="ver-sum">${esc(T('ver.summary', d.count))}</p>${cl ? `<p class="ver-sum cst-vline">${esc(cl)}</p>` : ''}<ul class="diff-list">${rows.map(([k, name, extra, id]) =>
      `<li class="d-${k}"${id ? ` data-goto="${esc(id)}"` : ''}><i>${k === 'add' ? '+' : k === 'del' ? '−' : '~'}</i><span title="${esc(name)}">${esc(name)}</span>${extra ? `<em title="${esc(extra)}">${esc(extra)}</em>` : ''}</li>`).join('')}</ul>`;
  }

  const versionsBox = $('#versions');
  const onVerField = ev => {
    const f = ev.target, k = f.dataset?.vfield, v = k && findVersion(f.closest('.ver')?.dataset.id);
    if (!v) return;
    const val = k === 'name' ? f.value.trim().slice(0, 40) : f.value.trim();
    if (k === 'status') {
      if (!VSTATUS[val] || val === v.status) return;
      const open = val === 'approved' ? openFindings(v) : [];
      if (open.length) {
        // Aprobar con hallazgos abiertos: se restaura el estado y se pregunta (select dispara input y change)
        f.value = v.status;
        if (S.verAsk) return;
        S.verAsk = true;
        const list = open.slice(0, 5).map(n => `${n.label}${n.review.note ? `: ${n.review.note}` : ''}`);
        if (open.length > 5) list.push(`… +${open.length - 5}`);
        confirmBox({ title: T('ver.cf.apprTitle', open.length), text: T('ver.cf.apprText'), list, ok: T('ver.cf.apprOk'), cancel: T('ver.cf.cancel') }).then(ok => {
          S.verAsk = false;
          if (!ok || !findVersion(v.id) || v.status === 'approved') return;
          markEdit(); setVerStatus(v, 'approved'); endEdit();
          store.set('model', S.model);
          updateMeta();
          renderVersions();
          toast(T('ver.statusSet', { name: verLabel(v), status: T('ver.st.approved') }));
        });
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
  function costBreakdown(m = S.model, by = 'team') {
    if (!CST_BY.includes(by)) by = 'team';
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
    const out = new Map();
    [[A, 'a'], [B, 'b']].forEach(([s, f]) => costBreakdown(s.m, by).forEach(r => {
      if (!out.has(r.key)) out.set(r.key, { key: r.key, label: r.label, a: 0, b: 0, ...(r.unassigned ? { unassigned: true } : {}) });
      out.get(r.key)[f] += r.monthly;
    }));
    return [...out.values()].map(r => ({ ...r, delta: r.b - r.a })).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || x.label.localeCompare(y.label));
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
    const st = { tab: tab === 'compare' ? 'compare' : 'breakdown', by: CST_BY.includes(opts.by) ? opts.by : 'team', a: opts.a !== undefined ? opts.a : defA, b: opts.b !== undefined ? opts.b : null, only: false, sort: 'delta', dir: -1 };
    let cur = [], cmp = null;
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
      const tot = cur.reduce((s, r) => s + r.monthly, 0), n = cur.reduce((s, r) => s + r.nodes.length, 0);
      outs.breakdown.innerHTML = `<table class="cst-table"><thead><tr><th>${esc(T(`cst.by.${st.by}`))}</th><th class="num">${esc(T('cst.col.components'))}</th><th class="num">${esc(T('cst.col.monthly'))}</th><th class="num">${esc(T('cst.col.yearly'))}</th><th>${esc(T('cst.col.pct'))}</th></tr></thead><tbody>${cur.map((r, i) =>
        `<tr${r.filter ? ` class="cst-click" data-i="${i}" title="${esc(T('cst.rowTip'))}"` : ''}><td${r.unassigned ? ' class="cst-un"' : ''}>${r.filter ? `<button class="cst-key" data-i="${i}">${esc(r.label)}</button>` : esc(r.label)}</td><td class="num">${r.nodes.length}</td><td class="num">${esc(cstMoney(r.monthly))}</td><td class="num">${esc(cstMoney(r.monthly * 12))}</td><td>${bars(r.monthly, tot)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><th>${esc(T('cst.total'))}</th><td class="num">${n}</td><td class="num">${esc(cstMoney(tot))}</td><td class="num">${esc(cstMoney(tot * 12))}</td><td></td></tr></tfoot></table>`;
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
        <table class="cst-table"><thead><tr><th>${esc(T(`cst.by.${st.by}`))}</th><th class="num">A</th><th class="num">B</th><th class="num">${esc(T('cst.col.delta'))}</th></tr></thead><tbody>${by.map(r =>
          `<tr><td${r.unassigned ? ' class="cst-un"' : ''}>${esc(r.label)}</td><td class="num">${esc(cstMoney(r.a))}</td><td class="num">${esc(cstMoney(r.b))}</td><td class="num cst-d">${esc(cstDelta(r.delta))}</td></tr>`).join('')}</tbody></table>`}`;
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
        download(cstCSV([[T(`cst.by.${st.by}`), T('cst.col.components'), T('cst.col.monthly'), T('cst.col.yearly'), T('cst.col.pct')], ...cur.map(r => [r.label, r.nodes.length, round2(r.monthly), round2(r.monthly * 12), tot ? round2(r.monthly / tot * 100) : 0]), [T('cst.total'), cur.reduce((s, r) => s + r.nodes.length, 0), round2(tot), round2(tot * 12), 100]]), fileName('csv', 'costs'), 'text/csv;charset=utf-8');
      } else if (cmp) {
        download(cstCSV([[T('cst.col.component'), `A: ${cmp.a.label}`, `B: ${cmp.b.label}`, T('cst.col.delta'), T('cst.col.status')], ...cmp.shown.map(r => [r.label, round2(r.a), round2(r.b), round2(r.delta), T(`cst.st.${r.status}`)]),
          [T('cst.total'), round2(cmp.a.monthly), round2(cmp.b.monthly), round2(cmp.delta), ''], [], [T(`cst.by.${st.by}`), 'A', 'B', T('cst.col.delta')], ...cmp.by.map(r => [r.label, round2(r.a), round2(r.b), round2(r.delta)])]), fileName('csv', 'cost-compare'), 'text/csv;charset=utf-8');
      }
    };
    back.addEventListener('mousedown', ev => { if (ev.target === back) close(); });
    back.addEventListener('click', async ev => {
      const t = ev.target.closest('[data-cst-tab]');
      if (t) { st.tab = t.dataset.cstTab; return show(); }
      const s = ev.target.closest('[data-cst-sort]');
      if (s) { const k = s.dataset.cstSort; if (st.sort === k) st.dir = -st.dir; else { st.sort = k; st.dir = -1; } drawCompare(); return back.querySelector(`[data-cst-sort="${k}"]`)?.focus(); }
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
      else if (k === 'by' || k === 'by2') { st.by = ev.target.value; $q('[data-cst="by"]').value = $q('[data-cst="by2"]').value = st.by; }
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
  // Conjuntos de datos de una conexión: fichas (nombre = ver linaje, × = quitar) y campo para añadir
  const dsField = e => {
    const list = e.datasets || [], more = datasetList().map(d => d.name).filter(n => !list.some(x => dsKey(x) === dsKey(n)));
    return `<div class="field">${T('lin.label')}<div class="ds-chips">${list.map(d => `<span class="ds-chip"><button class="ds-name" data-lin="${esc(d)}" title="${esc(T('lin.show', { name: d }))}">${esc(d)}</button><button class="ds-x" data-ds-rm="${esc(d)}" title="${esc(T('lin.remove', { name: d }))}" aria-label="${esc(T('lin.remove', { name: d }))}">×</button></span>`).join('')}</div>
      <input class="ds-add" list="ds-suggest" placeholder="${esc(T('lin.add.ph'))}" aria-label="${esc(T('lin.add.aria'))}" autocomplete="off" spellcheck="false">
      <datalist id="ds-suggest">${more.map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist>${list.length ? '' : `<span class="cost-hint">${T('lin.none')}</span>`}</div>`;
  };
  // Conjuntos que pasan por las conexiones de un nodo (solo lectura; pulsar uno muestra su linaje)
  const nodeDsField = n => {
    const list = datasetsOfNode(n.id);
    return list.length ? `<div class="field">${T('lin.node')}<div class="ds-chips">${list.map(d => `<span class="ds-chip"><button class="ds-name" data-lin="${esc(d)}" title="${esc(T('lin.show', { name: d }))}">${esc(d)}</button></span>`).join('')}</div><span class="cost-hint">${T('lin.node.hint')}</span></div>` : '';
  };
  // Capa del data lake (nodos y grupos, también varios a la vez): ninguna / una de config.js › dataLayers.
  // «Ninguna» pasa a «Heredada (Oro)» cuando el grupo aporta una; abajo, el nombre que usa todo el documento
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
        `<div class="th-ro"><b class="th-badge">${k}</b><span>${esc(loc(STR.categories[k]?.label) || k)} · ${esc(T(`stride.st.${d.status}`))}${d.note ? ` — ${esc(d.note)}` : ''}</span></div>`).join('')}
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
        ${dataField(t)}
        ${govField(t, 'multi')}
        ${resField(t)}
        ${regionField(t)}
        ${layerField(t)}
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
        ${costField(t)}
        ${dataField(t)}
        ${govField(t, 'node')}
        ${resField(t)}
        ${regionField(t)}
        ${layerField(t)}
        ${secField(t)}
        ${cmpField(t, 'node')}
        ${reviewField(t)}
        ${adrField(t)}
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
        <label>${T('insp.style')}<select data-field="style">${Object.entries(C.edgeStyles).map(([k, v]) => `<option value="${k}"${k === (C.edgeStyles[t.style] ? t.style : 'sync') ? ' selected' : ''}>${esc(loc(v.label))}</option>`).join('')}</select></label>
        <label>${T('insp.route')}<select data-field="route">${[['', T('route.default', { name: T(`route.${S.model.routing || 'curved'}`) })], ['curved', T('route.curved')], ['elbow', T('route.elbow')]]
          .map(([k, l]) => `<option value="${k}"${(t.route || '') === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
        <div class="field">${T('insp.dir')}<div class="seg">${[['', 'dir.one'], ['both', 'dir.both']].map(([k, l]) =>
          `<button data-dir="${k}" class="${(t.both ? 'both' : '') === k ? 'on' : ''}">${T(l)}</button>`).join('')}</div></div>
        ${encField(t)}
        ${dataField(t, true)}
        ${dsField(t)}
        ${xferField(t)}
        ${strideField(t)}
        ${adrField(t)}
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
        ${regionField(t)}
        ${layerField(t)}
        <label>${T('insp.parent')}<select data-field="parent"><option value="">${T('insp.none')}</option>${m.groups.filter(g => !blocked.has(g.id) && (g.in || null) === (t.in || null)).map(g => `<option value="${esc(g.id)}"${g.id === t.parent ? ' selected' : ''}>${esc(g.label)}</option>`).join('')}</select></label>
        <div class="field">${T('insp.color')}${swatches(t.color)}</div>
        ${govField(t, 'group')}
        ${cmpField(t, 'group')}
        ${adrField(t)}
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
    if (k === 'region') v = v.trim();
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
      S.model.groups.push({ id, label: name.trim(), color: keys[S.model.groups.length % keys.length], ...(parent ? { parent } : {}), ...(S.scope ? { in: S.scope } : {}) });
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
    setModel(I.deep(EXAMPLES[+b.dataset.ex].diagram), { history: true, animate: true, fit: true });
    toast(T('toast.template', { name: loc(EXAMPLES[+b.dataset.ex].name) }));
    if (matchMedia('(max-width: 760px)').matches) $('#main').classList.remove('open');
  });

  $$('.tab').forEach(t => t.addEventListener('click', () => {
    $$('.tab').forEach(x => x.classList.toggle('on', x === t));
    $$('.pane').forEach(p => p.classList.toggle('on', p.dataset.pane === t.dataset.tab));
    store.set('tab', t.dataset.tab);
    if (t.dataset.tab === 'review') renderFindings();
    else if (t.dataset.tab === 'adr') renderAdr(true);
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
    layers: Object.fromEntries([...Object.keys(DL), ...Object.keys(DL_ALIAS)].map(k => [fold(k), cleanLayer(k)]).filter(([, v]) => v)),
    views: VIEW_KEYS,
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
    setModel({ title: T('model.new') }, { history: true, fit: true });
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
    const r = exportMenu.querySelector('summary').getBoundingClientRect(), pop = exportMenu.querySelector('.menu-pop');
    pop.style.top = `${r.bottom}px`;
    pop.style.right = `${Math.max(8, innerWidth - r.right)}px`;
  });
  document.addEventListener('pointerdown', ev => { if (exportMenu.open && !exportMenu.contains(ev.target)) exportMenu.open = false; });
  exportMenu.addEventListener('click', ev => {
    const b = ev.target.closest('[data-export]');
    if (!b) return;
    exportMenu.open = false;
    const f = { svg: exportSVG, png: exportPNG, 'svg-all': () => exportViews('svg'), 'png-all': () => exportViews('png'), 'svg-levels': () => exportLevels('svg'), 'png-levels': () => exportLevels('png'), json: exportJSON, copy: copyJSON, share: shareEncrypted, stride: exportThreats, compliance: openCompMatrix, report: openReportDialog, costs: () => openCosts('breakdown'), 'inventory-xlsx': () => exportInventory('xlsx'), 'inventory-csv': openInventoryDialog }[b.dataset.export];
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
    const styles = [...new Set(es.map(e => (C.edgeStyles[e.style] ? e.style : 'sync')))];
    const lockRow = (on, label) => ({ w: 46 + textW(label, '400 12px'), draw: (x, y) => {
      const lg = el('g', { transform: `translate(${x + 10} ${y})` }, g);
      lockIcon(lg, 0, on);
      textRow(x + 46, y, label);
    } });
    const conn = styles.map(st => ({ w: 46 + textW(loc(C.edgeStyles[st].label), '400 12px'), draw: (x, y) => {
      const cfg = C.edgeStyles[st], eg = el('g', { class: `edge edge-${st}${cfg.dash ? ' edge-dashed' : ''}`, style: `--c:var(--muted);--w:${cfg.width}px` }, g);
      el('path', { class: 'edge-line', d: `M${x},${y} L${x + 30},${y}`, ...(cfg.dash ? { 'stroke-dasharray': cfg.dash } : {}) }, eg);
      el('path', { class: 'edge-arrow', d: `M${x + 34},${y} L${x + 26},${y - 4} L${x + 26},${y + 4} Z` }, eg);
      textRow(x + 46, y, loc(cfg.label));
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
    out.querySelectorAll('.particle, .edge-hit, .node-halo, .guide, .marquee, .path-badge, .resize-handle, .zone-top-line').forEach(n => n.remove());
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
    return { str: '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(out), W, H: Ht };
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
  const svgFor = theme => { const old = S.theme; S.theme = theme; try { return buildSVG().str; } finally { S.theme = old; } };
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
        await eachView(keys, key => { views.push({ key, label: viewLabel(key), svg: Object.fromEntries(shTheme().map(th => [th, svgFor(th)])) }); });
        const payload = { fmt: 2, title: S.model.title, version: av ? verLabel(av) : S.model.meta?.version || '', sharedAt: new Date().toISOString(), theme: S.theme, view: keys.includes(S.viewKey) ? S.viewKey : keys[0], views };
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
  const REP_SECS = ['summary', 'diagram', 'components', 'connections', 'data', 'owners', 'layers', 'costs', 'resilience', 'findings', 'compliance', 'threats', 'decisions', 'versions', 'notes'];
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
      layers: m.nodes.some(n => layerOf(n).value), costs: m.nodes.some(hasCost), resilience: m.nodes.some(hasRes) || spofList(m).length > 0, findings: findingsOf(m).length > 0,
      compliance: cmpModel(m).keys.length > 0, threats: strideAll(m).length > 0, decisions: !!m.decisions?.length,
      versions: m.versions.length > 0, notes: (m.notes || []).length > 0 || (m.zones || []).some(z => z.kind !== 'trust')
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

    /* resumen */
    if (want('summary')) {
      const mt = monthlyTotal(m.nodes), cards = [{ label: repT('k.components'), value: m.nodes.length }, { label: repT('k.connections'), value: m.edges.length }, { label: repT('k.groups'), value: m.groups.length },
        { label: repT('k.views'), value: VIEW_KEYS.length }];
      if (m.nodes.some(hasCost)) cards.push({ label: repT('k.cost'), value: money(round2(mt)) });
      cards.push({ label: repT('k.findings'), value: open.length, tone: open.some(f => f.severity === 'critical' || f.severity === 'high') ? 'sev-high' : '' });
      if (m.decisions?.length) cards.push({ label: repT('k.decisions'), value: m.decisions.length });
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
      const rows = m.edges.map(e => {
        const cb = crossBorder(e, byId);
        return [nm(e.from), nm(e.to) + (e.both ? ' ↔' : ''), e.label || '', loc((C.edgeStyles[e.style] || C.edgeStyles.sync).label), e.encrypted === true ? T('enc.yes') : e.encrypted === false ? { t: T('enc.no'), tone: 'sev-high' } : T('enc.unset'),
          dShort(e.data), (e.datasets || []).join(', '), cb ? { t: `${cb.from.region} → ${cb.to.region}${cb.approved ? ' ✓' : ''}`, tone: cb.approved ? '' : 'sev-high' } : ''];
      });
      sec('connections', [{ k: 'table', head: [repT('h.from'), repT('h.to'), repT('h.label'), repT('h.style'), repT('h.enc'), repT('h.data'), repT('h.datasets'), repT('h.xb')], rows, cls: 'wide' }]);
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

    if (want('costs')) {
      const cn = m.nodes.filter(hasCost), blocks = [{ k: 'table', head: [repT('h.component'), repT('h.group'), repT('h.price'), repT('h.cost')], rows: [...cn.map(n => [n.label, gpath(n), costText(n), money(round2(perMonth(n)))]), [{ t: repT('total'), tone: 'total' }, '', '', { t: money(round2(monthlyTotal(m.nodes))), tone: 'total' }]] }];
      const gr = m.groups.map(g => ({ g, sum: monthlyTotal(nodesUnder(g, m)), n: nodesUnder(g, m).filter(hasCost).length })).filter(x => x.n);
      if (gr.length) { blocks.push({ k: 'h3', t: repT('h.perGroup') }); blocks.push({ k: 'table', head: [repT('h.group'), repT('h.nodes'), repT('h.cost')], rows: gr.map(x => [[gpath(x.g), x.g.label].filter(Boolean).join(' › '), String(x.n), money(round2(x.sum))]) }); }
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
      const { rows, keys, stats } = cmpModel(m), blocks = [];
      cmpFrameworks(keys).forEach(fw => {
        const ks = keys.filter(k => ctlSplit(k)[0] === fw), ci = ctlInfo(`${fw}:x`);
        blocks.push({ k: 'h3', t: ci.fwLabel });
        blocks.push({ k: 'table', head: [repT('h.control'), repT('h.title'), ...CTL_STATUS.map(s => T(`cmp.${s}`)), T('cmp.unmapped'), T('cmp.mx.cov')], rows: ks.map(k => {
          const s = stats.get(k), d = rows.length - s.na;
          return [ctlSplit(k)[1], ctlInfo(k).title, ...CTL_STATUS.map(x => String(s[x])), String(s.unmapped), d > 0 ? Math.round(s.met / d * 100) + '%' : '—'];
        }) });
        const st = rows.flatMap(r => ks.filter(k => r.eff.has(k)).map(k => [r.n.label, ctlSplit(k)[1], { t: `${CTL_SYM[r.eff.get(k).status]} ${T(`cmp.${r.eff.get(k).status}`)}`, tone: `st-${r.eff.get(k).status}` }, r.eff.get(k).from ? T('cmp.inh', groupById(r.eff.get(k).from)?.label || r.eff.get(k).from) : '']));
        if (st.length) blocks.push({ k: 'table', cls: 'compact', head: [repT('h.component'), repT('h.control'), repT('h.status'), ''], rows: st });
      });
      blocks.push({ k: 'p', muted: true, t: T('cmp.mx.note') });
      sec('compliance', blocks);
    }

    if (want('threats')) {
      sec('threats', [{ k: 'table', cls: 'wide', head: [repT('h.zones'), repT('h.connection'), repT('h.cat'), repT('h.severity'), repT('h.status'), repT('h.note'), repT('h.mitigation')],
        rows: strideAll(m).map(t => [t.zones.map(trustName).join(' | '), `${t.from} → ${t.to}${t.e.label ? ` (${t.e.label})` : ''}`, `${t.cat} ${loc(STR.categories[t.cat].label)}`, sevCell(t.severity), T(`stride.st.${t.status}`), t.note, t.mitigation]) }]);
    }

    if (want('decisions')) {
      const ds = m.decisions, link = l => [...(l?.nodes || []).map(nm), ...(l?.edges || []).map(id => { const e = m.edges.find(x => x.id === id); return e ? edgeName(e) : id; }),
        ...(l?.groups || []).map(id => groupById(id)?.label || id), ...(l?.versions || []).map(id => { const v = findVersion(id); return v ? verLabel(v) : id; })];
      const blocks = [{ k: 'table', head: [repT('h.id'), repT('h.title'), repT('h.status'), repT('h.date'), repT('h.deciders')], rows: ds.map(d => [d.id, d.title, repT(`adr.${d.status}`), fmtDay(d.date), d.deciders || '']) }];
      ds.forEach(d => {
        blocks.push({ k: 'h3', t: `${d.id} · ${d.title}` });
        blocks.push({ k: 'kv', items: [[repT('h.status'), repT(`adr.${d.status}`)], [repT('h.date'), fmtDay(d.date)], [repT('h.deciders'), d.deciders || ''], [repT('h.supersededBy'), d.supersededBy ? (ds.find(x => x.id === d.supersededBy)?.title ? `${d.supersededBy} · ${ds.find(x => x.id === d.supersededBy).title}` : d.supersededBy) : ''], [repT('h.links'), link(d.links).join(', ')]].filter(r => r[1]) });
        [['context', d.context], ['decision', d.decision], ['consequences', d.consequences]].forEach(([k, t]) => { if (t && String(t).trim()) blocks.push({ k: 'text', label: repT(`adr.${k}`), t: String(t) }); });
      });
      sec('decisions', blocks);
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
    return D;
  }

  /* Markdown: texto escapado (tablas con barras, # al inicio, etc.) */
  const mdEsc = s => String(s ?? '').replace(/[\\`*_\[\]<>|]/g, '\\$&').replace(/^(\s*)(#|>|[-+]\s|\d+[.)]\s)/gm, '$1\\$2');
  const mdCell = c => (mdEsc(typeof c === 'object' && c ? c.t : c).replace(/\r?\n/g, '<br>').trim() || ' ');
  const mdLines = s => mdEsc(s).replace(/\r?\n/g, '  \n');
  function reportMarkdown(D) {
    const o = [`# ${mdEsc(D.title)}`, '', `*${mdEsc([D.author, D.version, D.active?.label, D.date].filter(Boolean).join(' · '))}*`, ''];
    D.sections.forEach(s => {
      o.push(`## ${mdEsc(s.title)}`, '');
      s.blocks.forEach(b => {
        if (b.k === 'h3') o.push(`### ${mdEsc(b.t)}`, '');
        else if (b.k === 'p') o.push(b.muted ? `*${mdEsc(b.t)}*` : mdLines(b.t), '');
        else if (b.k === 'kv') o.push(...b.items.map(([k, v]) => `- **${mdEsc(k)}:** ${mdEsc(v).replace(/\r?\n/g, ' ')}`), '');
        else if (b.k === 'ul') o.push(...b.items.map(t => `- ${mdEsc(t).replace(/\r?\n/g, ' ')}`), '');
        else if (b.k === 'text') o.push(`**${mdEsc(b.label)}**`, '', mdLines(b.t), '');
        else if (b.k === 'cards') o.push(`| ${b.items.map(c => mdCell(c.label)).join(' | ')} |`, `|${b.items.map(() => ' --- |').join('')}`, `| ${b.items.map(c => mdCell(String(c.value))).join(' | ')} |`, '');
        else if (b.k === 'table') {
          if (!b.rows.length) return;
          o.push(`| ${b.head.map(mdCell).join(' | ')} |`, `|${b.head.map(() => ' --- |').join('')}`, ...b.rows.map(r => `| ${r.map(mdCell).join(' | ')} |`), '');
        } else if (b.k === 'img') o.push(`![${mdEsc(b.alt)}](${b.file ? encodeURI(b.file) : b.uri})`, '');
      });
    });
    o.push('---', '', `*${mdEsc(repT('footer', { app: C.app.name, date: D.date }))}*`, '');
    return o.join('\n');
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
.txt p{white-space:pre-wrap;margin:0 0 6px}ul{margin:0 0 10px;padding-left:20px}
figure{margin:6px 0 14px;break-inside:avoid}figure img{display:block;max-width:100%;height:auto;border:1px solid #d6d3e0;border-radius:6px}
.sev-low{color:#2f7d4f;font-weight:700}.sev-medium{color:#9a6b00;font-weight:700}.sev-high{color:#b4361f;font-weight:700}.sev-critical{color:#fff;background:#b4361f;font-weight:700}
.st-met{color:#2f7d4f}.st-partial{color:#9a6b00}.st-gap{color:#b4361f;font-weight:700}.st-na{color:#6b6778}.rev-open{color:#9a6b00}.rev-overdue{color:#b4361f;font-weight:700}.rev-resolved{color:#2f7d4f}
.vs-approved{color:#2f7d4f;font-weight:700}.vs-rejected{color:#b4361f;font-weight:700}.vs-review{color:#9a6b00}.total{font-weight:700;background:#f6f5fb}
footer{max-width:1000px;margin:28px auto 0;padding-top:8px;border-top:1px solid #d6d3e0;color:#6b6778;font-size:8.5pt}
@page{size:A4;margin:18mm 14mm 18mm;@top-left{content:__TITLE__;font:8pt sans-serif;color:#6b6778}@bottom-right{content:counter(page) " / " counter(pages);font:8pt sans-serif;color:#6b6778}}
@media print{body{padding:0}h2,h3{break-after:avoid}.pb{break-before:page}}`;
  function reportHTML(D) {
    const cell = c => { const t = typeof c === 'object' && c ? c.t : c, tone = typeof c === 'object' && c?.tone ? ` class="${esc(c.tone)}"` : ''; return `<td${tone}>${esc(t).replace(/\r?\n/g, '<br>')}</td>`; };
    const css = REP_CSS.replace('__FONT__', fontCss().replace(/"/g, "'")).replace('__TITLE__', `"${String(D.title).replace(/[\\"]/g, '\\$&').replace(/[\r\n]+/g, ' ')}"`);
    const blk = b => {
      if (b.k === 'h3') return `<h3>${esc(b.t)}</h3>`;
      if (b.k === 'p') return `<p${b.muted ? ' class="muted"' : ''}>${esc(b.t).replace(/\r?\n/g, '<br>')}</p>`;
      if (b.k === 'kv') return `<dl>${b.items.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v).replace(/\r?\n/g, '<br>')}</dd>`).join('')}</dl>`;
      if (b.k === 'ul') return `<ul>${b.items.map(t => `<li>${esc(t).replace(/\r?\n/g, '<br>')}</li>`).join('')}</ul>`;
      if (b.k === 'text') return `<div class="txt"><h4>${esc(b.label)}</h4><p>${esc(b.t)}</p></div>`;
      if (b.k === 'cards') return `<div class="cards">${b.items.map(c => `<div class="card"><b${c.tone ? ` class="${esc(c.tone)}"` : ''}>${esc(c.value)}</b><span>${esc(c.label)}</span></div>`).join('')}</div>`;
      if (b.k === 'table') return b.rows.length ? `<table${b.cls ? ` class="${esc(b.cls)}"` : ''}><thead><tr>${b.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map(r => `<tr>${r.map(cell).join('')}</tr>`).join('')}</tbody></table>` : '';
      if (b.k === 'img') return `<figure><img src="${esc(b.uri || '')}" alt="${esc(b.alt)}"></figure>`;
      return '';
    };
    const csp = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";
    return `<!doctype html>
<html lang="${esc(D.lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}">
<title>${esc(D.title)}</title><style>${css}</style></head><body>
<header><h1>${esc(D.title)}</h1><p class="sub">${esc([D.author, D.version, D.active?.label, D.date].filter(Boolean).join(' · '))}</p></header>
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

  /* ---------- exportar a otras herramientas (export-*.js) ----------
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
      edgeStyleLabel: st => loc((C.edgeStyles[st] || C.edgeStyles.sync).label),
      color: x => (!x ? '#8573DB' : 'from' in x ? hexOf(x.color) || nodeHex(byId.get(x.from)) : 'type' in x ? nodeHex(x) : hexOf(x.color) || '#776F84'),
      dataLabel: k => (DATA[k] ? { short: loc(DATA[k].short) || k.toUpperCase(), label: loc(DATA[k].label) || k, sensitive: !!DATA[k].sensitive } : { short: String(k).toUpperCase(), label: String(k), sensitive: false }),
      icon: ref => { const i = iconInfo(ref); return i ? { src: i.src, label: i.label } : null; },
      size: n => ({ w: R.width.get(n.id) || nodeWidth(n), h: H }),
      groupBox: id => { const b = R.gbox.get(id); return b ? { x: b.x, y: b.y, w: b.w, h: b.h } : null; }
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
  /* ---------- inventario exportable (CSV / Excel) ---------- */
  // Una fila por componente (todos los niveles C4) y varias tablas de apoyo, para CMDB o auditoría. Excel: export-xlsx.js (sin librerías).
  // Las ayudas opcionales se protegen con typeof para que la exportación siga funcionando si una función se quita.
  const INV_COMP = [['id'], ['name'], ['detail'], ['type'], ['provider'], ['service'], ['category'], ['c4'], ['level'], ['group'], ['owner'], ['steward'], ['team'], ['costCenter'], ['inherited'], ['region'], ['jurisdiction'],
    ['data'], ['sensitive'], ['layer'], ['exposure'], ['backup'], ['encIn', 'int'], ['encOut', 'int'], ['unencSens', 'int'], ['sla', 'sla'], ['rpo'], ['rto'], ['replicas', 'int'], ['cost', 'money'], ['period'], ['perMonth', 'money'], ['perYear', 'money'],
    ['review'], ['findings', 'int'], ['adrs'], ['compliance'], ['desc']];
  const INV_CONN = [['id'], ['from'], ['to'], ['label'], ['style'], ['encrypted'], ['data'], ['datasets'], ['crossBorder'], ['transferOk'], ['threats', 'int']];
  const INV_GROUP = [['id'], ['name'], ['parent'], ['kind'], ['region'], ['layer'], ['owner'], ['team'], ['costCenter'], ['count', 'int'], ['monthly', 'money']];
  const INV_OWNER = [['team'], ['owners'], ['stewards'], ['components', 'int'], ['monthly', 'money']];
  const INV_ADR = [['id'], ['title'], ['status'], ['date'], ['links']];
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
        adrs: (m.decisions || []).filter(d => d.links?.nodes?.includes(n.id)).map(d => d.id).join(', '), compliance: comp, desc: n.desc || ''
      };
    });
  }
  // Todas las tablas del inventario: [{ key, name, head, rows (matrices), fmt }]; las vacías no entran salvo Componentes
  function inventoryTables(model = S.model) {
    const m = model, byId = new Map(m.nodes.map(n => [n.id, n])), nm = id => byId.get(id)?.label || id;
    const mk = (key, cols, rows) => ({ key, name: T(`inv.sheet.${key}`), head: cols.map(([k]) => T(`inv.c.${k}`)), keys: cols.map(([k]) => k), fmt: cols.map(([, f]) => f || null), rows });
    const out = [], comp = inventoryRows(m);
    out.push(mk('components', INV_COMP, comp.map(r => INV_COMP.map(([k]) => r[k]))));
    // Conexiones
    const open = typeof strideAll === 'function' ? (() => { try { return strideAll(m).filter(t => t.status === 'open'); } catch { return []; } })() : [];
    const conn = m.edges.map(e => {
      const cb = typeof crossBorder === 'function' ? crossBorder(e, byId) : null;
      return [e.id || '', nm(e.from), nm(e.to), String(e.label || '').replace(/\s*\n\s*/g, ' '), loc((C.edgeStyles[e.style] || C.edgeStyles.sync).label), e.encrypted === true ? T('enc.yes') : e.encrypted === false ? T('enc.no') : T('enc.unset'),
        (e.data || []).map(k => loc(DATA[k]?.short) || String(k).toUpperCase()).join(' '), (e.datasets || []).join('; '), invYN(!!cb), cb ? invYN(cb.approved) : '', open.filter(t => t.e === e || t.e.id === e.id).length];
    });
    if (conn.length) out.push(mk('connections', INV_CONN, conn));
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
    if (m.decisions?.length) out.push(mk('decisions', INV_ADR, m.decisions.map(d => [d.id, d.title, T(`adr.st.${d.status}`), d.date || '', links(d.links)])));
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
        if (!X) throw new Error('export-xlsx.js missing');
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
    if (S.scope) { importIntoScope(res.diagram); toast(T('toast.iac', res), 4200); return res; } // dentro de un nivel C4: se añade a ese nivel
    S.sel = null;
    setModel(res.diagram, { history: true, animate: true, fit: true });
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
    else if (ev.key === 'Escape' && filterMenu.open) filterMenu.open = false;
    else if (ev.key === 'Escape') { if (S.play) stopPlay(); else if (S.path) clearPath(); else if (S.connecting) cancelConnect(); else if (!S.sel && S.compare) compareVersion(null); else if (!S.sel && !S.flow && S.scope) scopeUp(); else select(null); }
    else if (ev.altKey && ev.key === 'ArrowUp') { ev.preventDefault(); scopeUp(); }  // sube un nivel C4
    else if (ev.key === 'Enter' && S.sel?.kind === 'node' && innerCount(S.sel.id) && !ev.target.closest?.('button, a, summary')) { ev.preventDefault(); setScope(S.sel.id); }  // abre el diagrama interno
    else if (/^[1-9]$/.test(k) && VIEW_KEYS[+k - 1]) setView(VIEW_KEYS[+k - 1]);
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
  const ADR = { open: null, st: '', q: '' };   // ficha abierta, filtro por estado y búsqueda
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
    S.model.decisions = list;
    changed(true); renderInspector(); renderAdr(true);
    return list[list.length - 1].id;
  }
  function updateDecision(id, patch) {
    const d = adrById(id);
    if (!d || !patch || typeof patch !== 'object') return false;
    pushHistory();
    const next = { ...d, ...patch, id: d.id };
    if ('status' in patch && adrStatus(patch.status) !== 'superseded' && !('supersededBy' in patch)) delete next.supersededBy;
    if (!next.supersededBy) delete next.supersededBy;
    S.model.decisions = cleanDecisions(S.model.decisions.map(x => (x === d ? next : x)), S.model);
    changed(true); renderInspector(); renderAdr(true);
    return true;
  }
  function removeDecision(id) {
    if (!adrById(id)) return false;
    pushHistory();
    S.model.decisions = cleanDecisions(S.model.decisions.filter(d => d.id !== id), S.model);
    if (ADR.open === id) ADR.open = null;
    changed(true); renderInspector(); renderAdr(true);
    return true;
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
    $('#adr-bar').innerHTML = `<div class="adr-tools"><button class="btn small primary" data-adr="new">+ ${esc(T('adr.new'))}</button><button class="btn small" data-adr="md"${ds.length ? '' : ' disabled'}>${esc(T('adr.export'))}</button></div>
      ${ds.length ? `<div class="fnd-chips" role="group" aria-label="${esc(T('adr.filter'))}">${chip('', ds.length, T('adr.f.all'), 'var(--accent)')}${ADR_STATUS.filter(k => counts[k]).map(k => chip(k, counts[k], T(`adr.st.${k}`), ADR_COLOR[k])).join('')}</div>
      <input class="search" id="adr-q" style="padding-left:10px;margin-bottom:6px" value="${esc(ADR.q)}" placeholder="${esc(T('adr.search'))}" aria-label="${esc(T('adr.search'))}" autocomplete="off">` : ''}`;
    renderAdrList();
  }
  const adrMatches = d => (!ADR.st || d.status === ADR.st) && (!ADR.q || [d.id, d.title, d.context, d.decision, d.consequences].some(x => String(x || '').toLowerCase().includes(ADR.q.toLowerCase())));
  function adrCard(d, ds) {
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
        ${['context', 'decision', 'consequences'].map(k => `<label>${esc(T(`adr.f.${k}`))}<textarea data-af="${k}" rows="4" placeholder="${esc(T(`adr.f.${k}.ph`))}">${esc(d[k])}</textarea></label>`).join('')}
        <label>${esc(T('adr.f.superseded'))}<select data-af="supersededBy"><option value="">${esc(T('insp.none'))}</option>${others.map(x => `<option value="${esc(x.id)}"${x.id === d.supersededBy ? ' selected' : ''}>${esc(`${x.id} · ${adrTitle(x)}`)}</option>`).join('')}</select></label>
        <div class="adr-links-edit"><span>${esc(T('adr.f.links'))}</span>${links.length ? links.map(l => goChip(l, true)).join('') : `<em>${esc(T('adr.noLinks'))}</em>`}
          <div class="adr-row"><button class="btn small" data-adr="linksel">${esc(T('adr.linkSel'))}</button>
          ${free.length ? `<select data-adr-linkver aria-label="${esc(T('adr.linkVer'))}"><option value="">${esc(T('adr.linkVer'))}</option>${free.map(v => `<option value="${esc(v.id)}">${esc(verLabel(v))}</option>`).join('')}</select>` : ''}</div></div>
        <button class="btn small danger" data-adr="del">${esc(T('adr.delete'))}</button>
      </div>`;
    }
    return `<div class="adr${on ? ' on' : ''}" data-id="${esc(d.id)}" style="--s:${col}">
      <button type="button" class="adr-head" data-adr-toggle aria-expanded="${on}"><b class="adr-id">${esc(d.id)}</b><span class="adr-title">${esc(adrTitle(d))}</span><span class="adr-pill">${esc(T(`adr.st.${d.status}`))}</span></button>
      <div class="adr-meta">${esc([fmtDay(d.date), d.deciders].filter(Boolean).join(' · '))}${d.supersededBy ? ` · ${esc(T('adr.f.superseded'))}: ${esc(d.supersededBy)}` : ''}</div>
      ${!on && links.length ? `<div class="adr-links">${links.map(l => goChip(l, false)).join('')}</div>` : ''}
      ${form}
    </div>`;
  }
  function renderAdrList() {
    const box = $('#adr-list');
    if (!box || !S.model) return;
    const ds = S.model.decisions || [], shown = ds.filter(adrMatches);
    const keep = box.parentElement?.scrollTop || 0;
    box.innerHTML = !ds.length ? `<p class="fnd-empty">${esc(T('adr.empty'))}</p>`
      : shown.length ? shown.map(d => adrCard(d, ds)).join('') : `<p class="fnd-empty">${esc(T('adr.noMatch'))}</p>`;
    if (box.parentElement) box.parentElement.scrollTop = keep;
  }
  // Actualiza la cabecera de una ficha sin repintarla (para no perder el foco al escribir)
  function adrRefreshHead(card, d) {
    card.querySelector('.adr-title').textContent = adrTitle(d);
    card.querySelector('.adr-meta').textContent = [fmtDay(d.date), d.deciders].filter(Boolean).join(' · ') + (d.supersededBy ? ` · ${T('adr.f.superseded')}: ${d.supersededBy}` : '');
  }
  adrPanel?.addEventListener('focusin', ev => { if (ev.target.dataset?.af && ev.target.tagName !== 'SELECT') beginEdit(); });
  adrPanel?.addEventListener('focusout', ev => { if (ev.target.dataset?.af) endEdit(); });
  adrPanel?.addEventListener('input', ev => {
    const f = ev.target;
    if (f.id === 'adr-q') { ADR.q = f.value; return renderAdrList(); }
    const k = f.dataset?.af, card = f.closest('.adr'), d = k && f.tagName !== 'SELECT' && card && adrById(card.dataset.id);
    if (!d) return;
    if (k === 'date' && !isDay(f.value)) return;
    markEdit();
    if (k === 'deciders' && !f.value.trim()) delete d.deciders; else d[k] = f.value;
    syncEditor(); save();
    adrRefreshHead(card, d);
  });
  adrPanel?.addEventListener('change', ev => {
    const f = ev.target, card = f.closest('.adr'), d = card && adrById(card.dataset.id);
    if (!d) return;
    if (f.dataset.adrLinkver != null) { if (f.value) updateDecision(d.id, { links: adrAddLinks(d, { versions: [f.value] }) }); return; }
    const k = f.dataset.af;
    if (!k) return;
    if (f.tagName === 'SELECT') {
      if (k === 'status') updateDecision(d.id, { status: f.value });
      else if (k === 'supersededBy') updateDecision(d.id, f.value ? { supersededBy: f.value, status: 'superseded' } : { supersededBy: '' });
    } else { changed(true); renderInspector(); renderVersions(); }
  });
  adrPanel?.addEventListener('click', async ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    const d0 = b.dataset, card = b.closest('.adr'), d = card && adrById(card.dataset.id);
    if (d0.adrSt != null) { ADR.st = ADR.st === d0.adrSt ? '' : d0.adrSt; return renderAdr(true); }
    if (d0.adr === 'new') { ADR.q = ''; ADR.st = ''; return adrOpen(addDecision()); }
    if (d0.adr === 'md') return exportDecisions();
    if (d0.adrToggle != null && d) { ADR.open = ADR.open === d.id ? null : d.id; return renderAdr(true); }
    if (d0.adrGo) { const [k, ...r] = d0.adrGo.split(':'); return adrFocus(k, r.join(':')); }
    if (!d) return;
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

  /* inspector (nodo, conexión y grupo) y filas de versiones */
  const adrKindOfSel = () => ({ node: 'nodes', edge: 'edges', group: 'groups' })[S.sel?.kind];
  const adrField = t => {
    const kind = adrKindOfSel();
    if (!kind) return '';
    const linked = decisionsOf(kind, t.id), rest = (S.model.decisions || []).filter(d => !linked.includes(d));
    return `<div class="field adr-field">${T('adr.field')}${adrChips(linked)}
      <div class="adr-row"><button class="btn small" data-adr="new">+ ${esc(T('adr.new'))}</button>
      ${rest.length ? `<select data-adr-link aria-label="${esc(T('adr.linkTo'))}"><option value="">${esc(T('adr.linkTo'))}</option>${rest.map(d => `<option value="${esc(d.id)}">${esc(`${d.id} · ${adrTitle(d)}`)}</option>`).join('')}</select>` : ''}</div></div>`;
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

  /* exportación Markdown (MADR): índice y una sección por decisión */
  function decisionsMarkdown() {
    const m = S.model, ds = m.decisions || [], cell = x => String(x ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
    const body = x => (String(x || '').trim() || '_—_');
    const out = [`# ${T('adr.md.title', m.title)}`, ''];
    if (ds.length) {
      out.push(`| ${T('adr.f.id')} | ${T('adr.f.title')} | ${T('adr.f.status')} | ${T('adr.f.date')} |`, '|---|---|---|---|');
      ds.forEach(d => out.push(`| ${cell(d.id)} | ${cell(adrTitle(d))} | ${cell(T(`adr.st.${d.status}`))} | ${cell(d.date)} |`));
      out.push('');
    }
    ds.forEach(d => {
      out.push(`## ${d.id}: ${adrTitle(d).replace(/\s*\n\s*/g, ' ')}`, '', `- **${T('adr.f.status')}:** ${T(`adr.st.${d.status}`)}`, `- **${T('adr.f.date')}:** ${d.date}`);
      if (d.deciders) out.push(`- **${T('adr.f.deciders')}:** ${d.deciders}`);
      out.push('', `### ${T('adr.f.context')}`, '', body(d.context), '', `### ${T('adr.f.decision')}`, '', body(d.decision), '', `### ${T('adr.f.consequences')}`, '', body(d.consequences), '');
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
    setModel(saved && Array.isArray(saved.nodes) ? saved : I.deep(EXAMPLES[0]?.diagram || { title: T('model.new') }), { animate: true, keepScope: true });
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

  // API para extensiones futuras (consola o scripts propios)
  window.Diagramon = {
    get model() { return clone(S.model); },
    load: (raw, opts = {}) => setModel(raw, { history: true, animate: true, fit: true, ...opts }),
    addNode, addEdge, relayout, fitView, togglePlay, present, presentViews: () => present({ views: true }), exitPresent, toggleTheme, toggleLang,
    get lang() { return I.lang; },
    select: ids => select({ kind: 'multi', ids: [].concat(ids) }), align: alignNodes,
    showPath, clearPath,
    lineage: ds => { const r = showLineage(ds); return r ? { origins: [...r.origins], consumers: [...r.consumers], hops: r.hops, nodes: [...r.nodes], edges: [...r.edges] } : null; },
    datasets: () => datasetList().map(d => ({ ...d })),
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
    exportThreats, exportReport,
    inventory: () => inventoryRows(S.model).map(r => ({ ...r })), exportInventory: (kind = 'xlsx') => exportInventory(['csv', 'csv-all'].includes(kind) ? kind : 'xlsx'),
    decisions: () => clone(S.model.decisions || []), addDecision, updateDecision, removeDecision, exportDecisions,
    setScope: id => setScope(id), get scope() { return S.scope; }, scopes: () => scopeList().map(x => ({ ...x, path: [...x.path] })), exportLevels,
    exportSVG, exportPNG, exportViews, exportJSON, shareEncrypted, exportOther, exportCtx, toggleRouting, importFiles, config: C, icons: ICONS
  };

  init();
})();
