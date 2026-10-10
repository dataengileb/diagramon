/* ==========================================================================
   Diagramon · interfaz: requisitos: pestaña, fichas, controles, matriz de trazabilidad, inspector y API
   --------------------------------------------------------------------------
   Movido desde src/app.js (v2), sin cambios de comportamiento.
   API: window.DiagramonUI.reqs
   ========================================================================== */
window.DiagramonUI = window.DiagramonUI || {};
// ctx: lo que esta pieza necesita de la app. Valores ya definidos al crearla pasan directos; el resto, como envolturas que se llaman al usarse.
window.DiagramonUI.reqs = { create(ctx) {
  'use strict';
  const I = window.DiagramonI18n, T = I.T, loc = I.loc;
  const { $, esc } = window.DiagramonCore.util;
  const { S } = window.DiagramonCore.state;
  const { confirmBox, toast } = window.DiagramonUI.dialogs;
  const { COST, DATA, JURS, REQ_COLOR, REQ_KIND, REQ_METRIC, REQ_PARAMS, REQ_PRIO, REQ_STATUS, adrById, adrFocus, adrLinkLabel, adrOpen, adrPanel, adrSelLinks, adrTitle, backupOf, beginEdit, catalog, changed, cleanRequirements, dsK, endEdit, exposureOf, head, markEdit, money, numFmt, pushHistory, raidChipsFor, renderInspector, reqCheck, reqCover, requirementsOf, save, sevLabel, syncEditor } = ctx;

  const REQ = { open: null, kind: '', st: '', pr: '', q: '', view: 'list', wide: false };   // ficha abierta, filtros por tipo, estado y prioridad, búsqueda, vista (lista | matriz) y matriz ampliada
  const REQ_ST_COLOR = { draft: 'var(--p-limon)', agreed: 'var(--p-menta)', dropped: 'var(--muted)' };
  const reqById = id => (S.model.requirements || []).find(r => r.id === id);
  const reqTitle = r => r.title || r.id;
  const REQ_LINKS = ['decisions', 'nodes', 'edges', 'groups'];
  const reqLinkLabel = (k, id) => { if (k !== 'decisions') return adrLinkLabel(k, id); const d = adrById(id); return d ? `${d.id} · ${adrTitle(d)}` : id; };
  const reqLinkList = r => REQ_LINKS.flatMap(k => (r.links?.[k] || []).map(id => ({ kind: k, id, label: reqLinkLabel(k, id) || id })));
  const reqAddLinks = (r, add) => { const l = {}; REQ_LINKS.forEach(k => { const v = [...(r.links?.[k] || []), ...(add[k] || [])]; if (v.length) l[k] = v; }); return l; };
  const reqChips = list => (list.length ? `<div class="req-chips">${list.map(r => `<button type="button" class="req-chip${r.status === 'dropped' ? ' dropped' : ''}" data-req-open="${esc(r.id)}" style="--s:${REQ_COLOR[r.kind]}" title="${esc(`${r.id} · ${reqTitle(r)} · ${T(`req.kind.${r.kind}`)} · ${T(`req.st.${r.status}`)}`)}"><b>${esc(r.id)}</b> ${esc(r.title)}</button>`).join('')}</div>` : '');
  // Fila «Aborda: REQ-001 …» en la ficha de una decisión, y fila compacta en el inspector (solo si hay vínculos)
  const reqChipsFor = decisionId => { const l = requirementsOf('decisions', decisionId); return l.length ? `<div class="req-for"><span>${esc(T('req.addresses'))}</span>${reqChips(l)}</div>` : ''; };
  const reqField = (kind, id) => { const l = requirementsOf(kind, id); return l.length ? `<div class="field req-field">${esc(T('req.field'))}${reqChips(l)}</div>` : ''; };

  // Crear, cambiar y borrar: todo pasa por cleanRequirements, así tipos, estados, controles y enlaces siempre quedan coherentes
  const setReqs = list => { if (list.length) S.model.requirements = list; else delete S.model.requirements; };
  function addRequirement(p = {}) {
    p = p && typeof p === 'object' ? p : {};
    pushHistory();
    const list = cleanRequirements([...(S.model.requirements || []), { ...p, title: p.title || T('req.new.title') }], S.model);
    setReqs(list);
    changed(true); renderInspector(); renderReq(true);
    return list[list.length - 1].id;
  }
  function updateRequirement(id, patch) {
    const r = reqById(id);
    if (!r || !patch || typeof patch !== 'object') return false;
    pushHistory();
    setReqs(cleanRequirements(S.model.requirements.map(x => (x === r ? { ...r, ...patch, id: r.id } : x)), S.model));
    changed(true); renderInspector(); renderReq(true);
    return true;
  }
  function removeRequirement(id) {
    if (!reqById(id)) return false;
    pushHistory();
    setReqs(cleanRequirements(S.model.requirements.filter(r => r.id !== id), S.model));
    if (REQ.open === id) REQ.open = null;
    changed(true); renderInspector(); renderReq(true);
    return true;
  }
  const checkRequirement = id => { const r = reqById(id); return r ? reqCheck(r) : null; };

  // Abre un requisito en la pestaña Requisitos (quita los filtros que lo esconderían)
  function reqOpen(id) {
    const r = reqById(id);
    if (!r) return;
    REQ.open = id; REQ.view = 'list'; REQ.wide = false;
    if (REQ.kind && REQ.kind !== r.kind) REQ.kind = '';
    if (REQ.st && REQ.st !== r.status) REQ.st = '';
    if (REQ.pr && REQ.pr !== r.priority) REQ.pr = '';
    REQ.q = '';
    $('.tab[data-tab="req"]')?.click();
    renderReq(true);
    $(`#req-list .adr[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' });
    if (matchMedia('(max-width: 760px)').matches) $('#main').classList.add('open');
  }
  const reqChecks = () => new Map((S.model.requirements || []).filter(r => r.check).map(r => [r.id, reqCheck(r)]));
  // Insignia del control: ✓ cumple · ✗ falla · ? sin datos (el detalle va en el tooltip)
  const reqBadge = (r, chk) => {
    const c = chk.get(r.id);
    if (!c) return '';
    const sym = { pass: '✓', fail: '✗', unknown: '?' }[c.state], tip = `${T(`req.m.${r.check.metric}`)}: ${c.detail}`;
    return `<span class="req-chk ${c.state}" title="${esc(tip)}" aria-label="${esc(`${T(`req.chk.${c.state}`)}. ${tip}`)}">${sym} ${esc(T(`req.m.${r.check.metric}`))}</span>`;
  };
  // «Cubierto por ADR-003 (aceptada), 2 componentes»
  function reqCoverText(r) {
    const cv = reqCover(r, S.model), ds = (r.links?.decisions || []).map(id => adrById(id)).filter(Boolean).map(d => `${d.id} (${T(`adr.st.${d.status}`).toLowerCase()})`);
    const parts = [...ds, ...(cv.comps ? [T('req.cov.comps', cv.comps)] : [])];
    return { cls: cv.covered ? 'ok' : r.status === 'agreed' && (r.priority === 'must' || r.priority === 'should') ? 'bad' : '', text: !parts.length ? T('req.cov.none') : cv.covered ? T('req.cov.by', parts.join(', ')) : T('req.cov.not', parts.join(', ')) };
  }
  const reqMeta = r => [T(`req.kind.${r.kind}`), r.priority ? T(`req.pr.${r.priority}`) : '', r.source].filter(Boolean).join(' · ');
  // «ADR-003 (aceptada), Tienda, Tienda → API» en una línea (informe y Excel)
  function reqCoveredBy(r, m = S.model) {
    const l = r.links || {}, nm = id => m.nodes.find(n => n.id === id)?.label || id;
    return [...(l.decisions || []).map(id => { const d = (m.decisions || []).find(x => x.id === id); return d ? `${d.id} (${T(`adr.st.${d.status}`).toLowerCase()})` : id; }), ...(l.nodes || []).map(nm),
      ...(l.edges || []).map(id => { const e = m.edges.find(x => x.id === id); return e ? `${nm(e.from)} ${e.both ? '↔' : '→'} ${nm(e.to)}` : id; }), ...(l.groups || []).map(id => m.groups.find(g => g.id === id)?.label || id)].join(', ');
  }
  // «Disponibilidad ERP → BI ≥ 99,9 %» · «Costo ≤ US$ 10.000» · «Cifrado: PII» · «Residencia: PII en UE»
  function reqCheckText(r) {
    const c = r.check;
    if (!c) return '';
    const nm = id => S.model.nodes.find(n => n.id === id)?.label || id || '?', mt = T(`req.m.${c.metric}`), cn = k => (DATA[k] ? loc(DATA[k].label) : k) || '?';
    if (c.metric === 'availability') return `${mt} ${nm(c.from)} → ${nm(c.to)} ≥ ${c.target != null ? `${numFmt(c.target, 4)}%` : '?'}`;
    if (c.metric === 'rpo' || c.metric === 'rto') return `${mt} ${nm(c.from)} → ${nm(c.to)} ≤ ${c.target != null ? `${numFmt(c.target, 2)} ${T('req.unit.h')}` : '?'}`;
    if (c.metric === 'cost') return `${mt} ≤ ${c.target != null ? money(c.target) : '?'}`;
    if (c.metric === 'freshness') return `${mt}: ${c.ds || '?'} ≤ ${c.target != null ? `${numFmt(c.target, 2)} ${T('req.unit.h')}` : '?'}`;
    if (c.metric === 'encryption') return `${mt}: ${cn(c.cls)}`;
    return `${mt}: ${cn(c.cls)} → ${c.jur ? loc(JURS[c.jur]?.label) || c.jur : '?'}`;
  }
  const reqMatches = r => (!REQ.kind || r.kind === REQ.kind) && (!REQ.st || r.status === REQ.st) && (!REQ.pr || r.priority === REQ.pr)
    && (!REQ.q || [r.id, r.title, r.detail, r.source].some(x => String(x || '').toLowerCase().includes(REQ.q.toLowerCase())));

  /* pestaña */
  const reqPanel = $('#req-panel');
  function renderReq(force) {
    if (!reqPanel || !S.model || !$('.pane[data-pane="req"]')?.classList.contains('on')) return;
    const a = document.activeElement;
    if (!force && a && reqPanel.contains(a) && a.matches('input, textarea, select')) return; // no pisar lo que se está escribiendo
    const rs = S.model.requirements || [];
    if (REQ.open && !reqById(REQ.open)) REQ.open = null;
    if (REQ.kind && !rs.some(r => r.kind === REQ.kind)) REQ.kind = '';
    if (REQ.st && !rs.some(r => r.status === REQ.st)) REQ.st = '';
    if (REQ.pr && !rs.some(r => r.priority === REQ.pr)) REQ.pr = '';
    const chk = reqChecks(), ag = rs.filter(r => r.status === 'agreed'), cov = ag.filter(r => reqCover(r, S.model).covered).length, pass = ag.filter(r => chk.get(r.id)?.state === 'pass').length;
    const pc = n => (rs.length ? (100 * n / rs.length).toFixed(1) : 0), progT = T('req.prog', { n: ag.length, c: cov, p: pass });
    const nDr = rs.filter(r => r.status === 'draft').length;
    const prog = rs.length ? `<div class="adr-prog"><div class="adr-prog-t">${esc(progT)}</div>
      <div class="adr-prog-b" role="img" aria-label="${esc(progT)}"><i style="width:${pc(ag.length)}%;background:${REQ_ST_COLOR.agreed}"></i><i style="width:${pc(nDr)}%;background:${REQ_ST_COLOR.draft}"></i><i style="width:${pc(rs.length - ag.length - nDr)}%;background:var(--muted)"></i></div></div>` : '';
    const group = (key, label, vals, cur, name, color) => { const on = vals.filter(([k]) => rs.some(r => (key === 'priority' ? r.priority : r[key]) === k)); return on.length > 1 || cur ? `<div class="fnd-chips" role="group" aria-label="${esc(label)}">${on.map(([k, t]) => `<button class="fnd-chip${cur === k ? ' on' : ''}" data-req-f="${name}:${k}" aria-pressed="${cur === k}" style="--s:${color(k)}">${esc(t)} <b>${rs.filter(r => (key === 'priority' ? r.priority : r[key]) === k).length}</b></button>`).join('')}</div>` : ''; };
    const kinds = REQ_KIND.map(k => [k, T(`req.kind.${k}`)]), sts = REQ_STATUS.map(k => [k, T(`req.st.${k}`)]), prs = REQ_PRIO.map(k => [k, T(`req.pr.${k}`)]);
    $('#req-bar').innerHTML = `<div class="adr-tools"><button class="btn small primary" data-req="new">+ ${esc(T('req.new'))}</button>
      ${rs.length ? `<span class="seg req-view" role="group" aria-label="${esc(T('req.view'))}"><button data-req-view="list" class="${REQ.view === 'list' ? 'on' : ''}" aria-pressed="${REQ.view === 'list'}">${esc(T('req.view.list'))}</button><button data-req-view="matrix" class="${REQ.view === 'matrix' ? 'on' : ''}" aria-pressed="${REQ.view === 'matrix'}">${esc(T('req.view.matrix'))}</button></span>` : ''}</div>${prog}
      ${rs.length ? `${group('kind', T('req.f.kind'), kinds, REQ.kind, 'kind', k => REQ_COLOR[k])}${group('status', T('req.f.status'), sts, REQ.st, 'st', k => REQ_ST_COLOR[k])}${group('priority', T('req.f.priority'), prs, REQ.pr, 'pr', () => 'var(--accent)')}
      <input class="search" id="req-q" style="padding-left:10px;margin-bottom:6px" value="${esc(REQ.q)}" placeholder="${esc(T('req.search'))}" aria-label="${esc(T('req.search'))}" autocomplete="off">` : ''}`;
    renderReqList(chk);
  }
  // Matriz de trazabilidad: filas = requisitos, columnas = decisiones; ✓ donde hay vínculo (las aceptadas, resaltadas); una celda vincula o desvincula
  function reqMatrix(rs, ds) {
    const wide = REQ.wide, head = ds.map(d => `<th class="req-mx-d${d.status === 'accepted' ? ' acc' : ''}" title="${esc(`${d.id} · ${adrTitle(d)} (${T(`adr.st.${d.status}`)})`)}"><span>${esc(d.id.replace(/^ADR-/i, ''))}</span></th>`).join('');
    const rows = rs.map(r => `<tr><th scope="row" class="req-mx-r"><button type="button" class="adr-mx-t" data-req-open="${esc(r.id)}" title="${esc(reqTitle(r))}"><b>${esc(r.id)}</b> <span>${esc(reqTitle(r))}</span></button></th>${ds.map(d => {
      const on = r.links?.decisions?.includes(d.id), lbl = `${r.id} · ${d.id}`;
      return `<td class="req-mx-c${on ? ' on' : ''}${on && d.status === 'accepted' ? ' acc' : ''}"><button type="button" data-req-tgl="${esc(r.id)}|${esc(d.id)}" aria-pressed="${!!on}" aria-label="${esc(lbl)}" title="${esc(lbl)}">${on ? '✓' : ''}</button></td>`;
    }).join('')}<td class="req-mx-n" title="${esc(T('req.mx.comps'))}">${(r.links?.nodes?.length || 0) + (r.links?.edges?.length || 0) + (r.links?.groups?.length || 0) || ''}</td></tr>`).join('');
    return `${wide ? '<div class="req-back" data-req="wide"></div>' : ''}<div class="req-mx-box${wide ? ' wide' : ''}"><div class="adr-opts-h"><span>${esc(T('req.mx.title'))}</span><button type="button" class="btn small" data-req="wide" title="${esc(T('adr.wide.tip'))}">${esc(T(wide ? 'adr.narrow' : 'adr.wide'))}</button></div>
      <div class="req-mx-wrap"><table class="req-mx"><thead><tr><th class="req-mx-r">${esc(T('req.mx.req'))}</th>${head}<th class="req-mx-n" title="${esc(T('req.mx.comps'))}">⬡</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="adr-hint">${esc(T('req.mx.legend'))}</p></div>`;
  }
  function reqCheckEditor(r, chk) {
    const c = r.check || {}, m = S.model, ps = REQ_PARAMS[c.metric] || [];
    const sel = (attrs, cur, items, label) => `<select ${attrs} aria-label="${esc(label)}">${items.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(cur ?? '') ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
    const nodes = [['', '–'], ...m.nodes.map(n => [n.id, n.label || n.id])];
    const unit = { availability: '%', rpo: T('req.unit.h'), rto: T('req.unit.h'), freshness: T('req.unit.h'), cost: `${COST.currency} / ${T('adr.o.month')}` }[c.metric];
    const fields = [
      ps.includes('from') ? `<label>${esc(T('req.chk.p.from'))}${sel('data-rc="from"', c.from, nodes, T('req.chk.p.from'))}</label><label>${esc(T('req.chk.p.to'))}${sel('data-rc="to"', c.to, nodes, T('req.chk.p.to'))}</label>` : '',
      ps.includes('ds') ? `<label>${esc(T('req.chk.p.ds'))}${sel('data-rc="ds"', c.ds, [['', '–'], ...catalog(m).map(x => [x.name, x.name]), ...(c.ds && !catalog(m).some(x => x.key === dsK(c.ds)) ? [[c.ds, c.ds]] : [])], T('req.chk.p.ds'))}</label>` : '',
      ps.includes('target') ? `<label>${esc(T('req.chk.p.target'))} (${esc(unit)})<input type="number" min="0"${c.metric === 'availability' ? ' max="100"' : ''} step="any" data-rc="target" value="${c.target != null ? esc(c.target) : ''}" autocomplete="off"></label>` : '',
      ps.includes('cls') ? `<label>${esc(T('req.chk.p.cls'))}${sel('data-rc="cls"', c.cls, [['', '–'], ...Object.keys(DATA).map(k => [k, loc(DATA[k].label) || k])], T('req.chk.p.cls'))}</label>` : '',
      ps.includes('jur') ? `<label>${esc(T('req.chk.p.jur'))}${sel('data-rc="jur"', c.jur, [['', '–'], ...Object.keys(JURS).map(k => [k, loc(JURS[k].label) || k])], T('req.chk.p.jur'))}</label>` : ''
    ].filter(Boolean);
    return `<div class="req-check"><div class="req-check-h"><span>${esc(T('req.check'))}</span>${reqBadge(r, chk)}</div>
      <label>${esc(T('req.chk.metric'))}${sel('data-rc="metric"', c.metric, [['', T('req.chk.nometric')], ...REQ_METRIC.map(k => [k, T(`req.m.${k}`)])], T('req.chk.metric'))}</label>
      ${fields.length ? `<div class="adr-two req-check-p">${fields.join('')}</div>` : ''}
      ${c.metric ? `<p class="adr-hint">${esc(T(`req.m.${c.metric}.hint`))}${r.status === 'agreed' ? '' : ` ${esc(T('req.chk.draft'))}`}</p>` : ''}</div>`;
  }
  function reqCard(r, rs, chk) {
    const on = REQ.open === r.id, links = reqLinkList(r), col = REQ_COLOR[r.kind], cov = reqCoverText(r);
    const goChip = (l, rm) => `<span class="adr-link"><button type="button" data-req-go="${l.kind}:${esc(l.id)}" title="${esc(T('adr.go'))}">${esc(T(l.kind === 'decisions' ? 'req.kind.dec' : `adr.kind.${l.kind}`))}: ${esc(l.label)}</button>${rm ? `<button type="button" class="adr-x" data-req-unlink="${l.kind}:${esc(l.id)}" title="${esc(T('adr.unlink'))}" aria-label="${esc(T('adr.unlink'))}">×</button>` : ''}</span>`;
    const sel = (attrs, cur, items) => `<select ${attrs}>${items.map(([v, t]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
    let form = '';
    if (on) {
      const free = (S.model.decisions || []).filter(d => !r.links?.decisions?.includes(d.id));
      form = `<div class="adr-form">
        <label>${esc(T('adr.f.id'))}<input value="${esc(r.id)}" readonly></label>
        <label>${esc(T('adr.f.title'))}<input data-rf="title" value="${esc(r.title)}" maxlength="200" autocomplete="off" placeholder="${esc(T('req.f.title.ph'))}"></label>
        <div class="adr-two"><label>${esc(T('req.f.kind'))}${sel('data-rf="kind"', r.kind, kinds2())}</label><label>${esc(T('req.f.priority'))}${sel('data-rf="priority"', r.priority || '', [['', '–'], ...REQ_PRIO.map(k => [k, T(`req.pr.${k}`)])])}</label></div>
        <div class="adr-two"><label>${esc(T('req.f.status'))}${sel('data-rf="status"', r.status, REQ_STATUS.map(k => [k, T(`req.st.${k}`)]))}</label>
          <label>${esc(T('req.f.source'))}<input data-rf="source" value="${esc(r.source || '')}" maxlength="120" placeholder="${esc(T('req.f.source.ph'))}" autocomplete="off"></label></div>
        <label>${esc(T('req.f.detail'))}<textarea data-rf="detail" rows="4" maxlength="4000" placeholder="${esc(T('req.f.detail.ph'))}">${esc(r.detail || '')}</textarea></label>
        ${reqCheckEditor(r, chk)}
        <div class="adr-links-edit"><span>${esc(T('req.f.links'))}</span>${links.length ? links.map(l => goChip(l, true)).join('') : `<em>${esc(T('adr.noLinks'))}</em>`}
          <div class="adr-row"><button class="btn small" data-req="linksel">${esc(T('adr.linkSel'))}</button>
          ${free.length ? `<select data-req-linkdec aria-label="${esc(T('req.linkDec'))}"><option value="">${esc(T('req.linkDec'))}</option>${free.map(d => `<option value="${esc(d.id)}">${esc(`${d.id} · ${adrTitle(d)}`)}</option>`).join('')}</select>` : ''}</div></div>
        <button class="btn small danger" data-req="del">${esc(T('req.delete'))}</button>
      </div>`;
    }
    return `<div class="adr req${on ? ' on' : ''}${r.status === 'dropped' ? ' dropped' : ''}" data-id="${esc(r.id)}" style="--s:${col}">
      <button type="button" class="adr-head" data-req-toggle aria-expanded="${on}"><b class="adr-id">${esc(r.id)}</b><span class="adr-title">${esc(reqTitle(r))}</span><span class="adr-pill" style="--s:${REQ_ST_COLOR[r.status]}">${esc(T(`req.st.${r.status}`))}</span></button>
      <div class="adr-meta req-meta"><span class="req-meta-t">${esc(reqMeta(r))}</span>${reqBadge(r, chk)}</div>
      <div class="req-cov ${cov.cls}">${esc(cov.text)}</div>
      ${raidChipsFor(r.id, 'requirements')}
      ${!on && r.detail ? `<div class="req-detail">${esc(r.detail)}</div>` : ''}
      ${form}
    </div>`;
  }
  const kinds2 = () => REQ_KIND.map(k => [k, T(`req.kind.${k}`)]);
  function renderReqList(chk = reqChecks()) {
    const box = $('#req-list');
    if (!box || !S.model) return;
    const rs = S.model.requirements || [], shown = rs.filter(reqMatches), keep = box.parentElement?.scrollTop || 0, hx = box.querySelector('.req-mx-wrap')?.scrollLeft || 0;
    box.innerHTML = !rs.length ? `<p class="fnd-empty">${esc(T('req.empty'))}</p>`
      : !shown.length ? `<p class="fnd-empty">${esc(T('req.noMatch'))}</p>`
      : REQ.view === 'matrix' ? reqMatrix(shown, S.model.decisions || []) : shown.map(r => reqCard(r, rs, chk)).join('');
    if (box.parentElement) box.parentElement.scrollTop = keep;
    const w = box.querySelector('.req-mx-wrap');
    if (w && hx) w.scrollLeft = hx;
  }
  reqPanel?.addEventListener('focusin', ev => { if (ev.target.dataset?.rf && ev.target.tagName !== 'SELECT') beginEdit(); });
  reqPanel?.addEventListener('focusout', ev => { if (ev.target.dataset?.rf) endEdit(); });
  reqPanel?.addEventListener('input', ev => {
    const f = ev.target;
    if (f.id === 'req-q') { REQ.q = f.value; return renderReqList(); }
    const k = f.dataset?.rf, card = f.closest('.req'), r = k && f.tagName !== 'SELECT' && card && reqById(card.dataset.id);
    if (!r) return;
    markEdit();
    if ((k === 'source' || k === 'detail') && !f.value.trim()) delete r[k]; else r[k] = f.value;
    syncEditor(); save();
    if (k === 'title') card.querySelector('.adr-title').textContent = reqTitle(r);
    if (k === 'source') card.querySelector('.req-meta-t').textContent = reqMeta(r);
  });
  reqPanel?.addEventListener('change', ev => {
    const f = ev.target, card = f.closest('.req'), r = card && reqById(card.dataset.id);
    if (!r) return;
    if (f.dataset.reqLinkdec != null) { if (f.value) updateRequirement(r.id, { links: reqAddLinks(r, { decisions: [f.value] }) }); return; }
    const rc = f.dataset.rc;
    if (rc) {
      if (rc === 'metric') return void updateRequirement(r.id, { check: f.value ? { ...r.check, metric: f.value, target: undefined } : null });   // el objetivo cambia de unidad con la métrica: se vuelve a escribir
      return void updateRequirement(r.id, { check: { ...r.check, [rc]: f.value } });
    }
    const k = f.dataset.rf;
    if (!k) return;
    if (f.tagName === 'SELECT') updateRequirement(r.id, { [k]: f.value });
    else { changed(true); renderInspector(); renderReq(true); }
  });
  reqPanel?.addEventListener('click', async ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    const d0 = b.dataset, card = b.closest('.req'), r = card && reqById(card.dataset.id);
    if (d0.reqF != null) { const [name, v] = d0.reqF.split(':'); REQ[name] = REQ[name] === v ? '' : v; return renderReq(true); }
    if (d0.reqView) { REQ.view = d0.reqView; REQ.wide = false; return renderReq(true); }
    if (d0.req === 'new') { REQ.q = ''; REQ.kind = ''; REQ.st = ''; REQ.pr = ''; return reqOpen(addRequirement()); }
    if (d0.req === 'wide') { REQ.wide = !REQ.wide; return renderReq(true); }
    if (d0.reqOpen) return reqOpen(d0.reqOpen);
    if (d0.reqTgl) {   // celda de la matriz: vincula o desvincula la decisión
      const [rid, did] = d0.reqTgl.split('|'), q = reqById(rid);
      if (!q) return;
      return void updateRequirement(rid, { links: { ...q.links, decisions: q.links?.decisions?.includes(did) ? q.links.decisions.filter(x => x !== did) : [...(q.links?.decisions || []), did] } });
    }
    if (d0.reqToggle != null && r) { REQ.open = REQ.open === r.id ? null : r.id; return renderReq(true); }
    if (d0.reqGo) { const [k, ...rest] = d0.reqGo.split(':'), id = rest.join(':'); return k === 'decisions' ? adrOpen(id) : adrFocus(k, id); }
    if (!r) return;
    if (d0.reqUnlink) {
      const [k, ...rest] = d0.reqUnlink.split(':'), id = rest.join(':');
      return void updateRequirement(r.id, { links: { ...r.links, [k]: (r.links?.[k] || []).filter(x => x !== id) } });
    }
    if (d0.req === 'linksel') {
      const l = adrSelLinks();
      if (!l) return toast(T('adr.noSel'));
      return void updateRequirement(r.id, { links: reqAddLinks(r, l) });
    }
    if (d0.req === 'del' && await confirmBox({ title: T('req.cf.title', r.id), text: T('req.cf.text', reqTitle(r)), ok: T('req.delete'), cancel: T('ver.cf.cancel'), danger: true })) removeRequirement(r.id);
  });
  // Chips de requisitos en la ficha de la decisión y en el inspector abren el requisito
  [adrPanel, $('#inspector')].forEach(box => box?.addEventListener('click', ev => { const b = ev.target.closest('button[data-req-open]'); if (b) reqOpen(b.dataset.reqOpen); }));

  // Inspector del nodo: exposición y respaldo (automáticos o a mano) y sus hallazgos abiertos
  const secField = n => {
    const ex = exposureOf(n), bk = backupOf(n), curE = n.exposure === 'public' || n.exposure === 'internal' ? n.exposure : '', curB = typeof n.backup === 'boolean' ? (n.backup ? 'yes' : 'no') : '';
    const seg = (attr, cur, items) => `<div class="seg">${items.map(([k, l]) => `<button ${attr}="${k}" class="${cur === k ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;
    const mine = ctx.FC.open.filter(f => f.target.kind === 'node' && f.target.id === n.id);
    const exL = v => T(v === 'public' ? 'sec.expo.public' : 'sec.expo.internal'), bkL = v => T(v ? 'sec.yes' : 'sec.no');
    return `<div class="field sec-field">${T('sec.label')}
      <div class="sec-row"><span>${T('sec.expo.label')}</span>${seg('data-expo', curE, [['', T('sec.auto', { v: exL(ex.value) })], ['public', exL('public')], ['internal', exL('internal')]])}
        <span class="cost-hint">${esc(ex.auto ? ex.why : T('sec.why.manual'))}</span></div>
      <div class="sec-row"><span>${T('sec.backup.label')}</span>${seg('data-bak', curB, [['', T('sec.auto', { v: bkL(bk.value) })], ['yes', T('sec.yes')], ['no', T('sec.no')]])}
        <span class="cost-hint">${esc(bk.auto ? bk.why : T('sec.why.manual'))}</span></div>
      ${mine.length ? `<div class="sec-list">${mine.map(f => `<div style="--s:var(--sev-${f.severity})"><i></i><span><b>${esc(sevLabel(f.severity))}</b> · ${esc(f.title)}</span></div>`).join('')}</div>` : ''}
    </div>`;
  };

  return { REQ, addRequirement, checkRequirement, removeRequirement, renderReq, reqCheckText, reqChipsFor, reqCoveredBy, reqField, reqOpen, secField, updateRequirement };
} };
