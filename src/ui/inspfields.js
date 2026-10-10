/* ==========================================================================
   Diagramon · interfaz: campos del inspector: color personalizado, iconos, costos, datos, capas y radar
   --------------------------------------------------------------------------
   Movido desde src/app.js (v2), sin cambios de comportamiento.
   API: window.DiagramonUI.inspfields
   ========================================================================== */
window.DiagramonUI = window.DiagramonUI || {};
// ctx: lo que esta pieza necesita de la app. Valores ya definidos al crearla pasan directos; el resto, como envolturas que se llaman al usarse.
window.DiagramonUI.inspfields = { create(ctx) {
  'use strict';
  const C = window.DIAGRAMON_CONFIG;
  const I = window.DiagramonI18n, T = I.T, loc = I.loc;
  const { $, $$, ICON, esc, fold, store } = window.DiagramonCore.util;
  const { S } = window.DiagramonCore.state;
  const { toast } = window.DiagramonUI.dialogs;
  const { COLOR_ALIAS, COST, DATA, DL, EF_MAX, EF_ROLES, EST, ICONS, MG, PERIODS, beginEdit, categories, changed, colorVar, datasetList, datasetsOfNode, dsFind, dsKey, efCostOf, efDaysOf, efInfo, endEdit, fmtDay, groupById, hasCost, iconInfo, layerInfo, layerNaming, layerOf, markEdit, mgInfo, money, nodeColor, nodeIconHtml, perMonth, pushHistory, radarEntries, radarInfo, rdRingInfo, renderInspector, round2, selTarget, today, yearsOf, DUR_TIERS, WS } = ctx;

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

  return { allIcons, costField, costHint, dataField, dispField, dsField, effortField, head, hideIconList, iconPicker, iconRank, kwHit, latencyField, layerField, nodeDsField, normHex, pickIcon, radarField, refField, showIconList, typeOptions };
} };
