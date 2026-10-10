/* ==========================================================================
   Diagramon · interfaz: barra lateral: proveedores, paleta de componentes y plantillas
   --------------------------------------------------------------------------
   Movido desde src/app.js (v2), sin cambios de comportamiento.
   API: window.DiagramonUI.sidebar
   ========================================================================== */
window.DiagramonUI = window.DiagramonUI || {};
// ctx: lo que la paleta necesita de la app (todo está definido cuando app.js llama a create)
window.DiagramonUI.sidebar = { create(ctx) {
  'use strict';
  const C = window.DIAGRAMON_CONFIG;
  const I = window.DiagramonI18n, T = I.T, loc = I.loc;
  const { $, esc, fold, store } = window.DiagramonCore.util;
  const { S } = window.DiagramonCore.state;
  const { toast } = window.DiagramonUI.dialogs;
  const { EXAMPLES, ICONS, kwHit, iconRank, iconInfo, colorVar, categories, typeIcon, addNode, setModel } = ctx;

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

  return { renderProviders, renderPalette, renderExamples };
} };
