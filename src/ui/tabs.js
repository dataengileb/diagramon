/* ==========================================================================
   Diagramon · interfaz: pestañas agrupadas del panel lateral
   --------------------------------------------------------------------------
   Movido desde src/app.js (v2), sin cambios de comportamiento.
   API: window.DiagramonUI.tabs
   ========================================================================== */
window.DiagramonUI = window.DiagramonUI || {};
// ctx: funciones de la app que cada pestaña pinta al abrirse. Se llaman al hacer clic, no al crear, así que app.js las pasa como envolturas.
window.DiagramonUI.tabs = { create(ctx) {
  'use strict';
  const { $$, store } = window.DiagramonCore.util;

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
    if (t.dataset.tab === 'review') ctx.renderFindings();
    else if (t.dataset.tab === 'adr') ctx.renderAdr(true);
    else if (t.dataset.tab === 'req') ctx.renderReq(true);
    else if (t.dataset.tab === 'raid') ctx.renderRaid(true);
    else if (t.dataset.tab === 'data') ctx.renderDs(true);
    else if (t.dataset.tab === 'people') ctx.renderPeople(true);
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
} };
