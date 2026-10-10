/* ==========================================================================
   Diagramon · interfaz: registro RAID: pestaña, enlaces, inspector y ficha de ADR
   --------------------------------------------------------------------------
   Movido desde src/app.js (v2), sin cambios de comportamiento.
   API: window.DiagramonUI.raid
   ========================================================================== */
window.DiagramonUI = window.DiagramonUI || {};
// ctx: lo que esta pieza necesita de la app. Valores ya definidos al crearla pasan directos; el resto, como envolturas que se llaman al usarse.
window.DiagramonUI.raid = { create(ctx) {
  'use strict';
  const I = window.DiagramonI18n, T = I.T;
  const { $, esc } = window.DiagramonCore.util;
  const { S } = window.DiagramonCore.state;
  const { confirmBox, toast } = window.DiagramonUI.dialogs;
  const { RAID_COLOR, RAID_LEVEL_COLOR, RAID_MAX, RAID_STATUS, RAID_TYPES, RAID_TYPE_COLOR, RAID_VAL, adrAuthor, adrById, adrLinkLabel, adrOpen, adrPanel, adrTitle, beginEdit, changed, cleanRaid, endEdit, fmtDay, focusTarget, isDay, markEdit, pushHistory, raidById, raidHeat, raidLevel, raidOf, raidScore, raidState, raidSummary, raidType, renderAdr, renderInspector, reqOpen, save, syncEditor, today, updateDecision, adrKindOfSel } = ctx;

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

  return { addRaid, raidBanner, raidChipsFor, raidField, raidLate, removeRaid, renderRaid, updateRaid, validateAssumption };
} };
