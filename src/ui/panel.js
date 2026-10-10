/* ==========================================================================
   Diagramon · interfaz: ancho del panel lateral (arrastrar el divisor)
   --------------------------------------------------------------------------
   Movido desde src/app.js (v2), sin cambios de comportamiento.
   API: window.DiagramonUI.panel
   ========================================================================== */
window.DiagramonUI = window.DiagramonUI || {};
window.DiagramonUI.panel = { create() {
  'use strict';
  const { $, clamp, store } = window.DiagramonCore.util;

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
  return { setSide, sideWidth };
} };
