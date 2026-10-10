/* ==========================================================================
   Diagramon · núcleo: utilidades, almacenamiento local e iconos pequeños
   --------------------------------------------------------------------------
   Movido desde src/app.js (v2), sin cambios de comportamiento.
   API: window.DiagramonCore.util
   ========================================================================== */
window.DiagramonCore = window.DiagramonCore || {};
window.DiagramonCore.util = (() => {
  'use strict';
  const C = window.DIAGRAMON_CONFIG;

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


  const ICON = {
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    link: '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    swap: '<svg viewBox="0 0 24 24"><path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/></svg>',
    pencil: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>'
  };

  return { $, $$, clamp, snap, clone, esc, fold, debounce, reducedMotion, store, ICON };
})();
