/* ==========================================================================
   Diagramon · núcleo: estado compartido de la interfaz (S, R, VW, HL), tipografías y vistas
   --------------------------------------------------------------------------
   Movido desde src/app.js (v2), sin cambios de comportamiento.
   API: window.DiagramonCore.state
   ========================================================================== */
window.DiagramonCore = window.DiagramonCore || {};
window.DiagramonCore.state = (() => {
  'use strict';
  const C = window.DIAGRAMON_CONFIG;
  const I = window.DiagramonI18n, loc = I.loc;
  const { $, store, reducedMotion } = window.DiagramonCore.util;

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
  const VW = { dimNodes: 0, dimEdges: 0, hideNodes: new Set(), hideEdges: new Set(), hideGroups: new Set(), boxed: new Set(), flows: new Map(), ctxBoxes: new Map(), ctxEdges: new Map(), gcost: null, sc: { nodes: new Set(), edges: new Set(), groups: new Set() }, xs: null, ph: null };
  const HL = { f: null, fr: null };

  return { FONTS, fontKey, VIEW_DEFAULTS, VIEWS, VIEW_KEYS, VR, viewKey, viewLabel, S, R, VW, HL };
})();
