/* ==========================================================================
   Diagramon · interfaz: barra superior: título y botones
   --------------------------------------------------------------------------
   Movido desde src/app.js (v2), sin cambios de comportamiento.
   API: window.DiagramonUI.topbar
   ========================================================================== */
window.DiagramonUI = window.DiagramonUI || {};
// ctx: funciones de la app a las que llaman los botones. app.js las pasa como envolturas, porque se usan al hacer clic.
window.DiagramonUI.topbar = { create(ctx) {
  'use strict';
  const T = window.DiagramonI18n.T;
  const { $, store } = window.DiagramonCore.util;
  const { S } = window.DiagramonCore.state;
  const { toast } = window.DiagramonUI.dialogs;
  const svg = $('#canvas');

  const titleBox = $('#title');
  titleBox.addEventListener('focus', ctx.beginEdit);
  titleBox.addEventListener('blur', ctx.endEdit);
  titleBox.addEventListener('input', () => {
    ctx.markEdit();
    S.model.title = titleBox.value;
    ctx.updateMeta(); ctx.syncEditor(); ctx.save();
  });
  titleBox.addEventListener('keydown', ev => { if (ev.key === 'Enter') titleBox.blur(); });

  $('#btn-side').addEventListener('click', () => {
    const main = $('#main');
    if (matchMedia('(max-width: 760px)').matches) main.classList.toggle('open');
    else { main.classList.toggle('collapsed'); store.set('collapsed', main.classList.contains('collapsed')); }
  });
  $('#btn-undo').addEventListener('click', ctx.undo);
  $('#btn-redo').addEventListener('click', ctx.redo);
  $('#btn-layout').addEventListener('click', ctx.relayout);
  $('#btn-route').addEventListener('click', ctx.toggleRouting);
  $('#btn-fit').addEventListener('click', () => ctx.fitView());
  $('#btn-note').addEventListener('click', ctx.addNote);
  $('#btn-zone').addEventListener('click', ctx.addZone);
  $('#btn-play').addEventListener('click', ctx.togglePlay);
  $('#btn-anim').addEventListener('click', () => {
    S.anim = !S.anim;
    store.set('anim', S.anim);
    svg.classList.toggle('anim-off', !S.anim);
    $('#btn-anim').classList.toggle('on', S.anim);
    toast(T(S.anim ? 'toast.animOn' : 'toast.animOff'));
  });
  $('#btn-new').addEventListener('click', () => {
    S.sel = null;
    ctx.setModel({ title: T('model.new') }, { current: true, history: true, fit: true });
    toast(T('toast.newCanvas'));
  });
  $('#btn-import').addEventListener('click', () => $('#file').click());
  $('#file').addEventListener('change', ev => { const fs = [...ev.target.files]; ev.target.value = ''; if (fs.length) ctx.importFiles(fs); });

} };
