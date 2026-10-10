/* ==========================================================================
   Diagramon · interfaz: inspector: render, eventos de campos y edición
   --------------------------------------------------------------------------
   Movido desde src/app.js (v2), sin cambios de comportamiento.
   API: window.DiagramonUI.inspector
   ========================================================================== */
window.DiagramonUI = window.DiagramonUI || {};
// ctx: lo que esta pieza necesita de la app. Valores ya definidos al crearla pasan directos; el resto, como envolturas que se llaman al usarse.
window.DiagramonUI.inspector = { create(ctx) {
  'use strict';
  const I = window.DiagramonI18n, T = I.T, loc = I.loc;
  const { $, $$, ICON, esc, store } = window.DiagramonCore.util;
  const { S, VW } = window.DiagramonCore.state;
  const { toast } = window.DiagramonUI.dialogs;
  const { ALIGN, DL, EDGE_W, ICONS, MG, REV_COLOR, SEVERITY, alignNodes, allIcons, applyHighlight, beginEdit, c4Field, changed, cleanData, cleanDatasets, cleanEffort, cleanReplicas, cleanSla, colorVar, costField, costHint, customTypes, dataField, deleteSelection, dispField, dsField, dsKey, duplicateSelection, edgeKey, efDays, effortField, encField, endEdit, fitBox, flowInspector, govField, groupKindAuto, hasCost, head, hideIconList, iconInfo, iconPicker, inGroup, inScope, isDay, latencyField, layerField, markEdit, markZone, money, monthlyTotal, moveToScope, moveUp, nodeColor, nodeDsField, nodeIconHtml, normDur, openInner, paletteKeys, pathField, phaseField, pickIcon, pushHistory, radarField, refField, regionField, regionHint, regionJurText, regionOf, renameGroup, resField, resHintHtml, reviewField, reviewHint, reviewState, round2, selIds, selTarget, select, setLayerNames, setThreat, setView, sevLabel, showIconList, showLineage, showPath, startConnect, strideField, swatches, today, typeOf, typeOptions, uniqueId, xferField, adrField, cmpField, cmtField, ctlEdit, edgeStyleOptions, openCompMatrix, openEdgeTypes, raidField, secField, wsOpen } = ctx;

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
    const d = b && ctx.WS.index?.diagrams.find(x => x.docId === b.dataset.refOpen && !x.dupDocId);
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

  return { inspector, renderInspector };
} };
