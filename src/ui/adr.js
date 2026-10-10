/* ==========================================================================
   Diagramon · interfaz: decisiones de arquitectura (ADR) y aprobaciones: pestaña, inspector, versiones, exportación y firmas
   --------------------------------------------------------------------------
   Movido desde src/app.js (v2), sin cambios de comportamiento.
   API: window.DiagramonUI.adr
   ========================================================================== */
window.DiagramonUI = window.DiagramonUI || {};
// ctx: lo que esta pieza necesita de la app. Valores ya definidos al crearla pasan directos; el resto, como envolturas que se llaman al usarse.
window.DiagramonUI.adr = { create(ctx) {
  'use strict';
  const I = window.DiagramonI18n, T = I.T, loc = I.loc;
  const { $, clone, esc, store } = window.DiagramonCore.util;
  const { S } = window.DiagramonCore.state;
  const { confirmBox, toast } = window.DiagramonUI.dialogs;
  const { ADR_COLOR, ADR_MAX, ADR_RISK, ADR_STATUS, COST, SIGN_MAX, adrAuthor, adrCmp, adrFull, adrHist, adrLeader, adrScore, adrStatus, apprMissing, apprWho, approvalState, beginEdit, canon, changed, cleanDecisions, compareVersion, endEdit, findVersion, fmtDay, focusTarget, isDay, markEdit, pruneReqLinks, pushHistory, raidOf, renderInspector, renderVersions, reqCheck, requirementsOf, save, syncEditor, today, verLabel, exportDecisions, raidBanner, raidChipsFor, raidLate, reqChipsFor } = ctx;

  const ADR = { open: null, st: '', q: '', area: '', menu: false, opt: new Set(), wide: null };   // ficha abierta, filtros por estado, área y búsqueda, menú de kits, opciones desplegadas (`id|opción`), matriz ampliada (id)
  const adrById = id => (S.model.decisions || []).find(d => d.id === id);
  const adrTitle = d => d.title || d.id;
  const adrChips = list => (list.length ? `<div class="adr-chips">${list.map(d => `<button type="button" class="adr-chip" data-adr-open="${esc(d.id)}" style="--s:${ADR_COLOR[d.status]}" title="${esc(`${d.id} · ${adrTitle(d)} · ${T(`adr.st.${d.status}`)}`)}"><b>${esc(d.id)}</b> ${esc(d.title)}</button>`).join('')}</div>` : '');
  // Nombre legible de un elemento enlazado
  function adrLinkLabel(kind, id) {
    const m = S.model;
    if (kind === 'nodes') return m.nodes.find(n => n.id === id)?.label;
    if (kind === 'groups') return m.groups.find(g => g.id === id)?.label;
    if (kind === 'versions') { const v = findVersion(id); return v && verLabel(v); }
    const e = m.edges.find(x => x.id === id);
    return e && `${m.nodes.find(n => n.id === e.from)?.label || e.from} ${e.both ? '↔' : '→'} ${m.nodes.find(n => n.id === e.to)?.label || e.to}`;
  }
  const ADR_KINDS = ['nodes', 'edges', 'groups', 'versions'];
  const adrLinkList = d => ADR_KINDS.flatMap(k => (d.links?.[k] || []).map(id => ({ kind: k, id, label: adrLinkLabel(k, id) || id })));

  // Crear, cambiar y borrar: todo pasa por cleanDecisions, así el estado, los enlaces y «sustituida por» siempre quedan coherentes
  function addDecision(p = {}) {
    p = p && typeof p === 'object' ? p : {};
    pushHistory();
    const list = cleanDecisions([...(S.model.decisions || []), { ...p, title: p.title || T('adr.new.title') }], S.model);
    const nd = list[list.length - 1];
    if (!nd.history?.length) { nd.history = [{ status: nd.status, date: nd.date }]; const by = adrAuthor(); if (by) nd.history[0].by = by; }   // alta = primera entrada del historial
    S.model.decisions = list;
    changed(true); renderInspector(); renderAdr(true);
    return nd.id;
  }
  function updateDecision(id, patch) {
    const d = adrById(id);
    if (!d || !patch || typeof patch !== 'object') return false;
    pushHistory();
    const next = { ...d, ...patch, id: d.id };
    if ('status' in patch && adrStatus(patch.status) !== 'superseded' && !('supersededBy' in patch)) delete next.supersededBy;
    if (!next.supersededBy) delete next.supersededBy;
    const list = cleanDecisions(S.model.decisions.map(x => (x === d ? next : x)), S.model), nd = list.find(x => x.id === d.id);
    if (nd && nd.status !== d.status) {   // cambió el estado (también por «reemplazada por»): se anota con la fecha de hoy y el autor
      const h = d.history?.length ? [...nd.history || d.history] : [{ status: d.status, date: d.date }], e = { status: nd.status, date: today() }, by = adrAuthor();
      if (by) e.by = by;
      if (nd.status === 'accepted') { const gap = apprMissing('decision', nd); if (gap.length) e.note = T('appr.note.without', gap.join(', ')); }   // aceptada sin todas las firmas: queda anotado
      nd.history = [...h, e].slice(-200); nd.date = e.date;
    } else if (nd && nd.history?.length && 'date' in patch && isDay(patch.date)) nd.history[nd.history.length - 1].date = nd.date;
    S.model.decisions = list;
    changed(true); renderInspector(); renderAdr(true);
    return true;
  }
  function removeDecision(id) {
    if (!adrById(id)) return false;
    pushHistory();
    S.model.decisions = cleanDecisions(S.model.decisions.filter(d => d.id !== id), S.model);
    if (ADR.open === id) ADR.open = null;
    pruneReqLinks();
    changed(true); renderInspector(); renderAdr(true);
    return true;
  }
  /* kits de decisiones (window.DIAGRAMON_ADR_KITS, src/adr-kits.js) */
  const adrKits = () => (Array.isArray(window.DIAGRAMON_ADR_KITS) ? window.DIAGRAMON_ADR_KITS.filter(k => k && k.id && Array.isArray(k.decisions)) : []);
  const adrBoth = v => (v && typeof v === 'object' ? Object.values(v) : [v]).map(x => String(x ?? '').trim().toLowerCase()).filter(Boolean);
  // Añade las decisiones del kit como «propuesta» (un solo paso de deshacer): copia los criterios del kit si la decisión no trae los suyos,
  // se salta las que ya existen por título (en cualquier idioma) y descarta los enlaces a ids que no existen aquí. → { added, skipped } o null
  function addDecisionKit(id) {
    const kit = adrKits().find(k => k.id === id);
    if (!kit) return null;
    const have = new Set((S.model.decisions || []).flatMap(d => adrBoth(d.title))), fresh = [];
    kit.decisions.forEach(kd => {
      const t = adrBoth(kd.title);
      if (!t.length || t.some(x => have.has(x))) return;
      t.forEach(x => have.add(x));
      const d = I.deep(kd);
      fresh.push({ title: d.title, status: 'proposed', area: d.area, context: d.context, criteria: d.criteria || I.deep(kit.criteria || []),
        options: (d.options || []).map(o => ({ id: o.id, title: o.title, summary: o.summary, pros: o.pros, cons: o.cons })), links: d.links });
    });
    const res = { added: fresh.length, skipped: kit.decisions.length - fresh.length };
    if (fresh.length) {
      pushHistory();
      const n0 = (S.model.decisions || []).length, list = cleanDecisions([...(S.model.decisions || []), ...fresh], S.model), by = adrAuthor();
      list.slice(n0).forEach(nd => { nd.history = [{ status: nd.status, date: nd.date, ...(by ? { by } : {}) }]; });
      S.model.decisions = list;
      changed(true); renderInspector(); renderAdr(true);
    }
    toast(T('adr.kit.done', res), 3200);
    return res;
  }
  // Opciones y criterios: cada cambio pasa por updateDecision (cleanDecisions) para que puntajes, elegida y límites queden coherentes
  const adrOptPatch = (d, oid, patch) => updateDecision(d.id, { options: (d.options || []).map(o => (o.id === oid ? { ...o, ...patch } : o)) });
  const adrNextOptId = d => { const used = new Set((d.options || []).map(o => o.id)); for (let i = 0; i < 26; i++) { const c = String.fromCharCode(65 + i); if (!used.has(c)) return c; } return `O${used.size + 1}`; };
  function adrAddOption(d) {
    if ((d.options || []).length >= ADR_MAX.options) return toast(T('adr.max', ADR_MAX.options));
    const id = adrNextOptId(d);
    ADR.opt.add(`${d.id}|${id}`);
    updateDecision(d.id, { options: [...(d.options || []), { id, title: T('adr.opt.untitled', id) }] });
  }
  function adrAddCriterion(d) {
    if ((d.criteria || []).length >= ADR_MAX.criteria) return toast(T('adr.max', ADR_MAX.criteria));
    const used = new Set((d.criteria || []).map(c => c.id));
    let n = 1; while (used.has(`criterion-${n}`)) n++;
    updateDecision(d.id, { criteria: [...(d.criteria || []), { id: `criterion-${n}`, label: T('adr.crit.untitled', n), weight: 3 }] });
  }
  // Enlaces de la selección actual: { nodes } | { edges } | { groups } o null
  function adrSelLinks() {
    const s = S.sel;
    if (!s) return null;
    if (s.kind === 'node') return { nodes: [s.id] };
    if (s.kind === 'multi') return { nodes: [...s.ids] };
    if (s.kind === 'edge') return { edges: [s.id] };
    if (s.kind === 'group') return { groups: [s.id] };
    return null;
  }
  const adrAddLinks = (d, add) => { const l = {}; ADR_KINDS.forEach(k => { const v = [...(d.links?.[k] || []), ...(add[k] || [])]; if (v.length) l[k] = v; }); return l; };

  // Abre una decisión en la pestaña ADR (quita los filtros que la esconderían)
  function adrOpen(id) {
    const d = adrById(id);
    if (!d) return;
    ADR.open = id;
    if (ADR.st && ADR.st !== d.status) ADR.st = '';
    if (ADR.area && ADR.area !== d.area) ADR.area = '';
    ADR.q = '';
    $('.tab[data-tab="adr"]')?.click();
    renderAdr(true);
    $(`#adr-list .adr[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' });
    if (matchMedia('(max-width: 760px)').matches) $('#main').classList.add('open');
  }
  // Muestra la versión en su pestaña y la resalta un momento
  function adrGotoVersion(id) {
    if (!findVersion(id)) return;
    $('.tab[data-tab="versions"]')?.click();
    if (store.get('verFilter', 'all') !== 'all') { store.set('verFilter', 'all'); renderVersions(); }
    const row = $(`#versions .ver[data-id="${CSS.escape(id)}"]`);
    row?.scrollIntoView({ block: 'nearest' });
    row?.classList.add('adr-flash');
    setTimeout(() => row?.classList.remove('adr-flash'), 1800);
  }
  function adrFocus(kind, id) {
    if (kind === 'versions') return adrGotoVersion(id);
    focusTarget(kind === 'nodes' ? 'node' : kind === 'edges' ? 'edge' : 'group', id);
  }

  /* pestaña */
  const adrPanel = $('#adr-panel');
  function renderAdr(force) {
    if (!adrPanel || !S.model || !$('.pane[data-pane="adr"]')?.classList.contains('on')) return;
    const a = document.activeElement;
    if (!force && a && adrPanel.contains(a) && a.matches('input, textarea, select')) return; // no pisar lo que se está escribiendo
    const ds = S.model.decisions || [];
    if (ADR.open && !adrById(ADR.open)) ADR.open = null;
    if (ADR.st && !ds.some(d => d.status === ADR.st)) ADR.st = '';
    const chip = (k, n, label, color) => `<button class="fnd-chip${ADR.st === k ? ' on' : ''}" data-adr-st="${k}" aria-pressed="${ADR.st === k}" style="--s:${color}">${esc(label)} <b>${n}</b></button>`;
    const counts = Object.fromEntries(ADR_STATUS.map(k => [k, ds.filter(d => d.status === k).length]));
    const areas = [...new Set(ds.map(d => d.area).filter(Boolean))];
    if (ADR.area && !areas.includes(ADR.area)) ADR.area = '';
    const kits = adrKits(), acc = counts.accepted, open = counts.proposed, pc = n => (ds.length ? (100 * n / ds.length).toFixed(1) : 0), progT = T('adr.prog', { a: acc, n: ds.length });
    const prog = ds.length ? `<div class="adr-prog"><div class="adr-prog-t">${esc(progT)}</div>
      <div class="adr-prog-b" role="img" aria-label="${esc(progT)}"><i style="width:${pc(acc)}%;background:${ADR_COLOR.accepted}"></i><i style="width:${pc(open)}%;background:${ADR_COLOR.proposed}"></i><i style="width:${pc(ds.length - acc - open)}%;background:var(--muted)"></i></div></div>` : '';
    const areaChips = areas.length ? `<div class="fnd-chips adr-areas" role="group" aria-label="${esc(T('adr.f.area'))}">${areas.map(a => { const l = ds.filter(d => d.area === a), n = l.filter(d => d.status === 'accepted').length; return `<button class="fnd-chip${ADR.area === a ? ' on' : ''}" data-adr-area="${esc(a)}" aria-pressed="${ADR.area === a}" style="--s:var(--p-cielo)" title="${esc(T('adr.areaTip', { a: n, n: l.length }))}">${esc(a)} <b>${n}/${l.length}</b></button>`; }).join('')}</div>` : '';
    const kitMenu = kits.length && ADR.menu ? `<div class="adr-kits">${kits.map(k => `<button type="button" class="adr-kit" data-adr-kit="${esc(k.id)}"><b>${esc(loc(k.name))}</b><span>${esc(loc(k.desc) || '')}</span><em>${esc(T('adr.kit.adds', k.decisions.length))}</em></button>`).join('')}</div>` : '';
    $('#adr-bar').innerHTML = `<div class="adr-tools"><button class="btn small primary" data-adr="new">+ ${esc(T('adr.new'))}</button><button class="btn small" data-adr="md"${ds.length ? '' : ' disabled'}>${esc(T('adr.export'))}</button>${kits.length ? `<button class="btn small" data-adr="kits" aria-expanded="${!!ADR.menu}">${esc(T('adr.kit.btn'))}</button>` : ''}</div>${kitMenu}${prog}${areaChips}
      ${ds.length ? `<div class="fnd-chips" role="group" aria-label="${esc(T('adr.filter'))}">${chip('', ds.length, T('adr.f.all'), 'var(--accent)')}${ADR_STATUS.filter(k => counts[k]).map(k => chip(k, counts[k], T(`adr.st.${k}`), ADR_COLOR[k])).join('')}</div>
      <input class="search" id="adr-q" style="padding-left:10px;margin-bottom:6px" value="${esc(ADR.q)}" placeholder="${esc(T('adr.search'))}" aria-label="${esc(T('adr.search'))}" autocomplete="off">` : ''}`;
    renderAdrList();
  }
  const adrMatches = d => (!ADR.st || d.status === ADR.st) && (!ADR.area || d.area === ADR.area) && (!ADR.q || [d.id, d.title, d.area, d.context, d.decision, d.consequences, ...(d.options || []).map(o => o.title)].some(x => String(x || '').toLowerCase().includes(ADR.q.toLowerCase())));
  /* ---------- aprobaciones: firmar, sección «Aprobaciones» de la ficha de ADR y de versión ---------- */
  const APPR_COLOR = { approve: 'var(--p-menta)', reject: 'var(--p-coral)', pending: 'var(--p-limon)' };
  // Registra la firma de hoy (ADR: pasa por updateDecision; versión: directo). Devuelve false si el interesado o el veredicto no existen
  function signOff(kind, id, sid, verdict, note) {
    if (!(S.model.stakeholders || []).some(x => x.id === sid) || (verdict !== 'approve' && verdict !== 'reject')) return false;
    const e = { by: sid, verdict, date: today() }, n = String(note ?? '').trim().slice(0, 500);
    if (n) e.note = n;
    if (kind === 'decision') { const d = adrById(id); return !!d && updateDecision(id, { signoffs: [...(d.signoffs || []), e].slice(-SIGN_MAX) }); }
    const v = kind === 'version' && findVersion(id);
    if (!v) return false;
    pushHistory();
    v.signoffs = [...(v.signoffs || []), e].slice(-SIGN_MAX);
    changed(true); renderVersions();
    return true;
  }
  const apprInfo = (kind, id) => { const o = kind === 'decision' ? adrById(id) : kind === 'version' ? findVersion(id) : null; return o ? { ...approvalState(kind, o, S.model), signoffs: clone(o.signoffs || []) } : null; };
  const apprSummary = st => T('appr.sum', { n: st.approved.length, t: st.required.length });
  const apprTone = st => (st.rejected.length ? 'reject' : st.complete ? 'approve' : 'pending');
  // Línea compacta de la ficha cerrada: «2 de 3 aprobaciones»
  const apprLine = (kind, o) => { const st = approvalState(kind, o, S.model); return st.required.length ? `<div class="appr-line" style="--s:${APPR_COLOR[apprTone(st)]}">${esc(apprSummary(st))}</div>` : ''; };
  function apprSection(kind, o) {
    const m = S.model, st = approvalState(kind, o, m), log = o.signoffs || [];
    if (!st.required.length && !log.length) return '';
    const person = id => (m.stakeholders || []).find(x => x.id === id), lastOf = id => [...log].reverse().find(x => x.by === id);
    const rows = st.required.map(id => {
      const p = person(id) || { name: id }, l = lastOf(id), v = st.approved.includes(id) ? 'approve' : st.rejected.includes(id) ? 'reject' : 'pending';
      const chip = v === 'pending' ? T('appr.pending') : `${v === 'approve' ? '✓' : '✗'} ${T(v === 'approve' ? 'appr.approved' : 'appr.rejected')} ${fmtDay(l.date)}`;
      return `<div class="appr-row" style="--s:${APPR_COLOR[v]}"><span class="appr-who"><b>${esc(p.name || id)}</b>${p.role ? ` <em>${esc(p.role)}</em>` : ''}</span><span class="appr-chip">${esc(chip)}</span>
        <span class="appr-btns"><button type="button" class="btn small" data-appr-do="approve" data-appr-sid="${esc(id)}">${esc(T('appr.approve'))}</button><button type="button" class="btn small" data-appr-do="reject" data-appr-sid="${esc(id)}">${esc(T('appr.reject'))}</button></span></div>`;
    }).join('');
    const warns = [];
    if (kind === 'decision') {
      if (typeof raidOf === 'function') { const bad = raidOf('decisions', o.id).filter(x => x.type === 'assumption' && (x.validation === 'invalidated' || (x.validation === 'pending' && typeof raidLate === 'function' && raidLate(x)))).map(x => x.id); if (bad.length) warns.push(T('appr.warn.raid', bad.join(', '))); }
      if (typeof requirementsOf === 'function' && typeof reqCheck === 'function') { const bad = requirementsOf('decisions', o.id).filter(r => r.check && reqCheck(r).state === 'fail').map(r => r.id); if (bad.length) warns.push(T('appr.warn.req', bad.join(', '))); }
    }
    const entry = x => `<li style="--s:${APPR_COLOR[x.verdict]}"><time>${esc(fmtDay(x.date))}</time><span>${esc(person(x.by)?.name || x.by)}</span><b>${x.verdict === 'approve' ? '✓' : '✗'} ${esc(T(x.verdict === 'approve' ? 'appr.approved' : 'appr.rejected'))}</b>${x.note ? `<em>${esc(x.note)}</em>` : ''}</li>`;
    return `<div class="appr" data-appr="${kind}">
      <div class="appr-h"><span>${esc(T('appr.title'))}</span>${st.required.length ? `<b style="--s:${APPR_COLOR[apprTone(st)]}">${esc(apprSummary(st))}</b>` : ''}</div>
      ${rows}${st.required.length ? `<input class="appr-note" data-appr-note maxlength="500" placeholder="${esc(T('appr.note.ph'))}" aria-label="${esc(T('appr.note'))}" autocomplete="off">` : `<p class="adr-hint">${esc(T('appr.none'))}</p>`}
      ${warns.map(w => `<div class="appr-warn">⚠ ${esc(w)}</div>`).join('')}
      ${log.length ? `<details class="appr-log"><summary>${esc(T('appr.log', log.length))}</summary><ol>${[...log].reverse().map(entry).join('')}</ol></details>` : ''}
    </div>`;
  }
  const apprDo = (b, kind, id) => {
    const sid = b.dataset.apprSid, note = b.closest('.appr')?.querySelector('[data-appr-note]')?.value || '';
    if (signOff(kind, id, sid, b.dataset.apprDo, note)) toast(T(b.dataset.apprDo === 'approve' ? 'appr.done.approve' : 'appr.done.reject', apprWho(sid)));
  };

  // Línea de tiempo compacta: fecha · estado · quién · nota (en la ficha abierta, la última entrada se puede editar)
  function adrTimeline(d, edit) {
    const hs = adrHist(d), last = hs.length - 1;
    return `<ol class="adr-hist">${hs.map((h, i) => `<li style="--s:${ADR_COLOR[h.status]}"><time>${esc(fmtDay(h.date))}</time><span class="adr-pill">${esc(T(`adr.st.${h.status}`))}</span>${h.by ? `<span class="adr-by">${esc(h.by)}</span>` : ''}${h.note ? `<span class="adr-note">${esc(h.note)}</span>` : ''}</li>`).join('')}</ol>${edit ? `<div class="adr-two"><label>${esc(T('adr.hist.by'))}<input data-af="hby" value="${esc(hs[last].by || '')}" maxlength="100" autocomplete="off"></label><label>${esc(T('adr.hist.note'))}<input data-af="hnote" value="${esc(hs[last].note || '')}" placeholder="${esc(T('adr.hist.note.ph'))}" maxlength="500" autocomplete="off"></label></div>` : ''}`;
  }
  // Marca de comparación con la versión activa: nueva, cambiada (campos y estado anterior → actual) o igual
  function adrMark(d, cmp) {
    if (!cmp?.diff) return '';
    const df = cmp.diff;
    if (df.added.includes(d.id)) return `<div class="adr-cmp add">${esc(T('adr.cmp.new'))}</div>`;
    const c = df.changed.find(x => x.id === d.id);
    if (!c) return `<div class="adr-cmp same">${esc(T('adr.cmp.same'))}</div>`;
    const old = cmp.v.decisions.find(x => x.id === d.id), FN = { title: 'adr.f.title', status: 'adr.f.status', context: 'adr.f.context', decision: 'adr.f.decision', consequences: 'adr.f.consequences', deciders: 'adr.f.deciders', supersededBy: 'adr.f.superseded', area: 'adr.f.area', criteria: 'adr.crit', options: 'adr.opts', chosen: 'adr.chosen', links: 'adr.f.links', signoffs: 'appr.title' };
    const fs = c.fields.map(f => T(FN[f]).toLowerCase()).join(', '), st = c.fields.includes('status') ? ` · ${T(`adr.st.${old.status}`)} → ${T(`adr.st.${d.status}`)}` : '';
    const more = adrOptDiff(old, d).map(x => `<div class="adr-cmp-d">${esc(x)}</div>`).join('');
    return `<div class="adr-cmp chg">${esc(`${T('adr.cmp.chg')}: ${fs}${st}`)}${more}</div>`;
  }
  // Cambios legibles de opciones, criterios y elegida entre la decisión de una versión (a) y la actual (b)
  function adrOptDiff(a, b) {
    const out = [], by = l => new Map((l || []).map(x => [x.id, x])), nm = o => o.title || o.id;
    const ac = by(a.criteria), bc = by(b.criteria), ao = by(a.options), bo = by(b.options);
    bc.forEach((c, id) => { if (!ac.has(id)) out.push(T('adr.cmp.c.add', { t: c.label, w: c.weight })); else if (ac.get(id).weight !== c.weight || ac.get(id).label !== c.label) out.push(T('adr.cmp.c.chg', { t: c.label, a: ac.get(id).weight, b: c.weight })); });
    ac.forEach((c, id) => { if (!bc.has(id)) out.push(T('adr.cmp.c.del', { t: c.label })); });
    bo.forEach((o, id) => {
      if (!ao.has(id)) return void out.push(T('adr.cmp.o.add', { t: nm(o) }));
      const p = ao.get(id), fs = ['title', 'summary', 'pros', 'cons', 'cost', 'risk', 'version', 'scores'].filter(f => canon(p[f] ?? null) !== canon(o[f] ?? null));
      if (fs.length) out.push(T('adr.cmp.o.chg', { t: nm(o), f: fs.map(f => T(`adr.o.${f}`).toLowerCase()).join(', ') }));
    });
    ao.forEach((o, id) => { if (!bo.has(id)) out.push(T('adr.cmp.o.del', { t: nm(o) })); });
    if ((a.chosen || '') !== (b.chosen || '')) out.push(T('adr.cmp.chosen', { a: a.chosen ? nm(ao.get(a.chosen) || { id: a.chosen }) : '—', b: b.chosen ? nm(bo.get(b.chosen) || { id: b.chosen }) : '—' }));
    { const sk = x => `${x.by}|${x.verdict}|${x.date}`, had = new Set((a.signoffs || []).map(sk));   // firmas nuevas desde la versión
      (b.signoffs || []).filter(x => !had.has(sk(x))).forEach(x => out.push(T(x.verdict === 'approve' ? 'appr.cmp.approved' : 'appr.cmp.rejected', x.by))); }
    return out;
  }
  function adrGone(d) {
    return `<div class="adr gone" style="--s:${ADR_COLOR[d.status]}"><div class="adr-head"><b class="adr-id">${esc(d.id)}</b><span class="adr-title">${esc(adrTitle(d))}</span><span class="adr-pill">${esc(T(`adr.st.${d.status}`))}</span></div><div class="adr-cmp del">${esc(T('adr.cmp.del'))}</div></div>`;
  }
  // Sección «Opciones»: matriz opciones × criterios (puntajes 1..5, total ponderado, ★ líder, ✓ elegida) y, desplegada, la ficha de cada opción
  const adrMeta = d => [fmtDay(d.date), d.deciders, d.area].filter(Boolean).join(' · ') + (d.supersededBy ? ` · ${T('adr.f.superseded')}: ${d.supersededBy}` : '');
  function adrOptions(d) {
    const cs = d.criteria || [], os = d.options || [], lead = adrLeader(d), key = o => `${d.id}|${o.id}`, nm = o => o.title || T('adr.opt.untitled', o.id);
    const sel = (attrs, cur, items, label) => `<select ${attrs} aria-label="${esc(label)}">${items.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(cur ?? '') ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
    const head = cs.map(c => `<th class="adr-mx-c"><input data-ac="label" data-cid="${esc(c.id)}" value="${esc(c.label)}" maxlength="80" size="8" autocomplete="off" aria-label="${esc(T('adr.crit.name'))}" title="${esc(c.label)}">
      <span class="adr-mx-w">${sel(`data-ac="weight" data-cid="${esc(c.id)}"`, c.weight, [1, 2, 3, 4, 5].map(n => [n, `×${n}`]), T('adr.crit.weight'))}<button type="button" class="adr-x" data-adr-rmcrit="${esc(c.id)}" title="${esc(T('adr.crit.remove'))}" aria-label="${esc(T('adr.crit.remove'))}">×</button></span></th>`).join('');
    const rows = os.map(o => {
      const sc = adrScore(d, o), full = adrFull(sc), isC = d.chosen === o.id, isL = lead === o.id && os.length > 1, on = ADR.opt.has(key(o));
      return `<tr class="${isC ? 'chosen' : ''}"><th scope="row" class="adr-mx-o"><button type="button" class="adr-mx-t" data-adr-optopen="${esc(o.id)}" aria-expanded="${on}" title="${esc(T('adr.opt.edit'))}"><b>${esc(o.id)}</b> <span data-opt-title="${esc(o.id)}">${esc(nm(o))}</span></button>${isL ? `<span class="adr-mark lead" title="${esc(T('adr.leader'))}" aria-label="${esc(T('adr.leader'))}">★</span>` : ''}${isC ? `<span class="adr-mark ok">✓ ${esc(T('adr.chosen'))}</span>` : ''}</th>
        ${cs.map(c => `<td>${sel(`data-as="1" data-oid="${esc(o.id)}" data-cid="${esc(c.id)}"`, o.scores?.[c.id], [['', '–'], ...[1, 2, 3, 4, 5].map(n => [n, String(n)])], `${nm(o)} · ${c.label}`)}</td>`).join('')}
        <td class="adr-mx-tot">${sc.scored ? `<span class="adr-bar" title="${esc(T('adr.total.tip', { s: sc.scored, n: sc.total }))}"><i style="width:${sc.pct}%"></i></span><b>${sc.pct}%</b>${full || !sc.total ? '' : `<em>${sc.scored}/${sc.total}</em>`}` : '–'}</td>
        <td class="adr-mx-a"><button type="button" class="btn small${isC ? ' primary' : ''}" data-adr-choose="${esc(o.id)}" aria-pressed="${isC}">${esc(T(isC ? 'adr.unchoose' : 'adr.choose'))}</button><button type="button" class="adr-x" data-adr-rmopt="${esc(o.id)}" title="${esc(T('adr.opt.remove'))}" aria-label="${esc(T('adr.opt.remove'))}">×</button></td></tr>`;
    }).join('');
    const free = S.model.versions || [];
    const det = os.filter(o => ADR.opt.has(key(o))).map(o => `<div class="adr-opt" data-oid="${esc(o.id)}"><div class="adr-opt-h"><b>${esc(o.id)}</b><span>${esc(nm(o))}</span><button type="button" class="adr-x" data-adr-optopen="${esc(o.id)}" title="${esc(T('adr.opt.close'))}" aria-label="${esc(T('adr.opt.close'))}">×</button></div>
      <label>${esc(T('adr.f.title'))}<input data-ao="title" data-oid="${esc(o.id)}" value="${esc(o.title)}" maxlength="120" autocomplete="off"></label>
      <label>${esc(T('adr.o.summary'))}<textarea data-ao="summary" data-oid="${esc(o.id)}" rows="2" maxlength="2000">${esc(o.summary || '')}</textarea></label>
      <label>${esc(T('adr.o.pros'))}<textarea data-ao="pros" data-oid="${esc(o.id)}" rows="3" maxlength="2000">${esc(o.pros || '')}</textarea></label>
      <label>${esc(T('adr.o.cons'))}<textarea data-ao="cons" data-oid="${esc(o.id)}" rows="3" maxlength="2000">${esc(o.cons || '')}</textarea></label>
      <div class="adr-two"><label>${esc(T('adr.o.costm', COST.currency))}<input type="number" min="0" step="any" data-ao="cost" data-oid="${esc(o.id)}" value="${o.cost != null ? esc(o.cost) : ''}" autocomplete="off"></label>
        <label>${esc(T('adr.o.risk'))}${sel(`data-ao="risk" data-oid="${esc(o.id)}"`, o.risk, [['', '–'], ...ADR_RISK.map(r => [r, T(`adr.risk.${r}`)])], T('adr.o.risk'))}</label></div>
      <label>${esc(T('adr.o.version'))}${sel(`data-ao="version" data-oid="${esc(o.id)}"`, o.version, [['', '–'], ...free.map(v => [v.id, verLabel(v)])], T('adr.o.version'))}</label>
      ${o.version && findVersion(o.version) ? `<div class="adr-row"><button type="button" class="btn small" data-adr-optcmp="${esc(o.id)}">${esc(T('adr.o.compare'))}</button><button type="button" class="btn small" data-adr-optgo="${esc(o.id)}">${esc(T('adr.o.show'))}</button></div>` : ''}</div>`).join('');
    const wide = ADR.wide === d.id;   // ampliada: la misma sección, fija sobre la pantalla (p. ej. para puntuar con el cliente)
    return `${wide ? '<div class="adr-back" data-adr="wide"></div>' : ''}<div class="adr-opts${wide ? ' wide' : ''}"><div class="adr-opts-h"><span>${esc(T('adr.opts'))}</span><button type="button" class="btn small" data-adr="addopt">+ ${esc(T('adr.opt.add'))}</button><button type="button" class="btn small" data-adr="addcrit">+ ${esc(T('adr.crit.add'))}</button>${os.length ? `<button type="button" class="btn small" data-adr="wide" title="${esc(T('adr.wide.tip'))}">${esc(T(wide ? 'adr.narrow' : 'adr.wide'))}</button>` : ''}</div>
      ${os.length ? `<div class="adr-mx-wrap"><table class="adr-mx"><thead><tr><th class="adr-mx-o">${esc(T('adr.opt'))}</th>${head}<th class="adr-mx-tot">${esc(T('adr.total'))}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      ${cs.length ? '' : `<p class="adr-hint">${esc(T('adr.crit.hint'))}</p>`}` : `<p class="adr-hint">${esc(T('adr.opts.empty'))}</p>`}${det}</div>`;
  }
  function adrCard(d, ds, cmp) {
    const on = ADR.open === d.id, links = adrLinkList(d), col = ADR_COLOR[d.status];
    const goChip = (l, rm) => `<span class="adr-link"><button type="button" data-adr-go="${l.kind}:${esc(l.id)}" title="${esc(T('adr.go'))}">${esc(T(`adr.kind.${l.kind}`))}: ${esc(l.label)}</button>${rm ? `<button type="button" class="adr-x" data-adr-unlink="${l.kind}:${esc(l.id)}" title="${esc(T('adr.unlink'))}" aria-label="${esc(T('adr.unlink'))}">×</button>` : ''}</span>`;
    let form = '';
    if (on) {
      const others = ds.filter(x => x.id !== d.id), free = S.model.versions.filter(v => !d.links?.versions?.includes(v.id));
      form = `<div class="adr-form">
        <label>${esc(T('adr.f.id'))}<input value="${esc(d.id)}" readonly></label>
        <label>${esc(T('adr.f.title'))}<input data-af="title" value="${esc(d.title)}" maxlength="200" autocomplete="off"></label>
        <div class="adr-two"><label>${esc(T('adr.f.status'))}<select data-af="status">${ADR_STATUS.map(k => `<option value="${k}"${k === d.status ? ' selected' : ''}>${esc(T(`adr.st.${k}`))}</option>`).join('')}</select></label>
          <label>${esc(T('adr.f.date'))}<input type="date" data-af="date" value="${esc(d.date)}"></label></div>
        <label>${esc(T('adr.f.deciders'))}<input data-af="deciders" value="${esc(d.deciders || '')}" placeholder="${esc(T('adr.f.deciders.ph'))}" maxlength="200" autocomplete="off"></label>
        <label>${esc(T('adr.f.area'))}<input data-af="area" value="${esc(d.area || '')}" list="adr-areas" placeholder="${esc(T('adr.f.area.ph'))}" maxlength="60" autocomplete="off"></label>
        <datalist id="adr-areas">${[...new Set(ds.map(x => x.area).filter(Boolean))].map(a => `<option value="${esc(a)}">`).join('')}</datalist>
        ${['context', 'decision', 'consequences'].map(k => `${k === 'decision' ? adrOptions(d) : ''}<label>${esc(T(`adr.f.${k}`))}<textarea data-af="${k}" rows="4" placeholder="${esc(T(`adr.f.${k}.ph`))}">${esc(d[k])}</textarea></label>`).join('')}
        <div class="adr-histbox"><span>${esc(T('adr.hist'))}</span>${adrTimeline(d, true)}</div>
        ${apprSection('decision', d)}
        <label>${esc(T('adr.f.superseded'))}<select data-af="supersededBy"><option value="">${esc(T('insp.none'))}</option>${others.map(x => `<option value="${esc(x.id)}"${x.id === d.supersededBy ? ' selected' : ''}>${esc(`${x.id} · ${adrTitle(x)}`)}</option>`).join('')}</select></label>
        <div class="adr-links-edit"><span>${esc(T('adr.f.links'))}</span>${links.length ? links.map(l => goChip(l, true)).join('') : `<em>${esc(T('adr.noLinks'))}</em>`}
          <div class="adr-row"><button class="btn small" data-adr="linksel">${esc(T('adr.linkSel'))}</button>
          ${free.length ? `<select data-adr-linkver aria-label="${esc(T('adr.linkVer'))}"><option value="">${esc(T('adr.linkVer'))}</option>${free.map(v => `<option value="${esc(v.id)}">${esc(verLabel(v))}</option>`).join('')}</select>` : ''}</div></div>
        <button class="btn small danger" data-adr="del">${esc(T('adr.delete'))}</button>
      </div>`;
    }
    return `<div class="adr${on ? ' on' : ''}" data-id="${esc(d.id)}" style="--s:${col}">
      <button type="button" class="adr-head" data-adr-toggle aria-expanded="${on}"><b class="adr-id">${esc(d.id)}</b><span class="adr-title">${esc(adrTitle(d))}</span><span class="adr-pill">${esc(T(`adr.st.${d.status}`))}</span></button>
      <div class="adr-meta">${esc(adrMeta(d))}</div>
      ${d.options?.length ? `<div class="adr-osum">${esc(T('adr.osum', { n: d.options.length }))}${d.chosen ? ` · <b>✓ ${esc(d.options.find(o => o.id === d.chosen).title || d.chosen)}</b>` : ''}</div>` : ''}
      ${apprLine('decision', d)}
      ${adrMark(d, cmp)}
      ${reqChipsFor(d.id)}
      ${!on && links.length ? `<div class="adr-links">${links.map(l => goChip(l, false)).join('')}</div>` : ''}
      ${raidBanner(d)}
      ${raidChipsFor(d.id)}
      ${form}
    </div>`;
  }
  function renderAdrList() {
    const box = $('#adr-list');
    if (!box || !S.model) return;
    const ds = S.model.decisions || [], shown = ds.filter(adrMatches);
    const keep = box.parentElement?.scrollTop || 0, hs = [...box.querySelectorAll('.adr-mx-wrap')].map(w => [w.closest('.adr')?.dataset.id, w.scrollLeft]);
    const cmp = adrCmp(), gone = cmp?.diff ? cmp.diff.removed.map(id => cmp.v.decisions.find(x => x.id === id)).filter(adrMatches) : [];
    const note = cmp && !cmp.diff ? `<p class="adr-cmp-note">${esc(T('adr.cmp.none', { name: verLabel(cmp.v) }))}</p>` : '';
    box.innerHTML = note + (!ds.length && !gone.length ? `<p class="fnd-empty">${esc(T('adr.empty'))}</p>`
      : shown.length || gone.length ? shown.map(d => adrCard(d, ds, cmp)).join('') + gone.map(adrGone).join('') : `<p class="fnd-empty">${esc(T('adr.noMatch'))}</p>`);
    if (box.parentElement) box.parentElement.scrollTop = keep;
    hs.forEach(([id, x]) => { if (x) { const w = box.querySelector(`.adr[data-id="${CSS.escape(id)}"] .adr-mx-wrap`); if (w) w.scrollLeft = x; } });
  }
  // Actualiza la cabecera de una ficha sin repintarla (para no perder el foco al escribir)
  function adrRefreshHead(card, d) {
    card.querySelector('.adr-title').textContent = adrTitle(d);
    card.querySelector('.adr-meta').textContent = adrMeta(d);
  }
  adrPanel?.addEventListener('focusin', ev => { if ((ev.target.dataset?.af || ev.target.dataset?.ao || ev.target.dataset?.ac) && ev.target.tagName !== 'SELECT') beginEdit(); });
  adrPanel?.addEventListener('focusout', ev => { if (ev.target.dataset?.af || ev.target.dataset?.ao || ev.target.dataset?.ac) endEdit(); });
  adrPanel?.addEventListener('input', ev => {
    const f = ev.target;
    if (f.id === 'adr-q') { ADR.q = f.value; return renderAdrList(); }
    if ((f.dataset?.ao || f.dataset?.ac) && f.tagName !== 'SELECT') {   // texto de una opción o de un criterio: se escribe directo en el modelo (como los campos de la ficha); cleanDecisions lo sanea al siguiente cambio
      const dd = adrById(f.closest('.adr')?.dataset.id);
      if (!dd) return;
      const ao = f.dataset.ao, tgt = ao ? (dd.options || []).find(o => o.id === f.dataset.oid) : (dd.criteria || []).find(c => c.id === f.dataset.cid);
      if (!tgt) return;
      markEdit();
      if (!ao) tgt.label = f.value;
      else if (ao === 'cost') { const v = f.value === '' ? NaN : Number(f.value); if (Number.isFinite(v) && v >= 0) tgt.cost = v; else delete tgt.cost; }
      else if (f.value.trim() || ao === 'title') tgt[ao] = f.value; else delete tgt[ao];
      if (ao === 'title') f.closest('.adr-form')?.querySelectorAll(`[data-opt-title="${CSS.escape(tgt.id)}"], .adr-opt[data-oid="${CSS.escape(tgt.id)}"] .adr-opt-h span`).forEach(e => { e.textContent = f.value || T('adr.opt.untitled', tgt.id); });
      syncEditor(); save();
      return;
    }
    const k = f.dataset?.af, card = f.closest('.adr'), d = k && f.tagName !== 'SELECT' && card && adrById(card.dataset.id);
    if (!d) return;
    if (k === 'date' && !isDay(f.value)) return;
    markEdit();
    if (k === 'hby' || k === 'hnote') {   // última entrada del historial (como syncHist en las versiones); en decisiones antiguas se crea la entrada implícita
      const hs = d.history?.length ? d.history : (d.history = [{ status: d.status, date: d.date }]), e = hs[hs.length - 1], key = k === 'hby' ? 'by' : 'note', val = f.value.trim();
      if (val) e[key] = val; else delete e[key];
      syncEditor(); save();
      return;
    }
    if (k === 'date' && d.history?.length) d.history[d.history.length - 1].date = f.value;
    if (k === 'deciders' && !f.value.trim()) delete d.deciders; else d[k] = f.value;
    syncEditor(); save();
    adrRefreshHead(card, d);
  });
  adrPanel?.addEventListener('change', ev => {
    const f = ev.target, card = f.closest('.adr'), d = card && adrById(card.dataset.id);
    if (!d) return;
    if (f.dataset.adrLinkver != null) { if (f.value) updateDecision(d.id, { links: adrAddLinks(d, { versions: [f.value] }) }); return; }
    if (f.dataset.as != null) {   // puntaje de una opción en un criterio
      const o = (d.options || []).find(x => x.id === f.dataset.oid), sc = { ...(o?.scores || {}) };
      if (!o) return;
      if (f.value) sc[f.dataset.cid] = +f.value; else delete sc[f.dataset.cid];
      return void adrOptPatch(d, o.id, { scores: sc });
    }
    if (f.dataset.ac === 'weight') return void updateDecision(d.id, { criteria: (d.criteria || []).map(c => (c.id === f.dataset.cid ? { ...c, weight: +f.value } : c)) });
    if (f.dataset.ao && f.tagName === 'SELECT') return void adrOptPatch(d, f.dataset.oid, { [f.dataset.ao]: f.value });
    if (f.dataset.ao || f.dataset.ac) { changed(true); renderInspector(); renderVersions(); if (f.dataset.ac) renderAdr(true); return; }
    const k = f.dataset.af;
    if (!k) return;
    if (f.tagName === 'SELECT') {
      if (k === 'status') {
        const gap = f.value === 'accepted' && d.status !== 'accepted' ? apprMissing('decision', d) : [];
        if (!gap.length) return void updateDecision(d.id, { status: f.value });
        f.value = d.status;   // pregunta antes de aceptar sin todas las firmas (no bloquea)
        confirmBox({ title: T('appr.cf.title'), text: T('appr.cf.text', gap.join(', ')), ok: T('appr.cf.ok'), cancel: T('ver.cf.cancel') }).then(ok => { if (ok && adrById(d.id)) updateDecision(d.id, { status: 'accepted' }); });
      }
      else if (k === 'supersededBy') updateDecision(d.id, f.value ? { supersededBy: f.value, status: 'superseded' } : { supersededBy: '' });
    } else { changed(true); renderInspector(); renderVersions(); }
  });
  adrPanel?.addEventListener('click', async ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    const d0 = b.dataset, card = b.closest('.adr'), d = card && adrById(card.dataset.id);
    if (d0.adrSt != null) { ADR.st = ADR.st === d0.adrSt ? '' : d0.adrSt; return renderAdr(true); }
    if (d0.adrArea != null) { ADR.area = ADR.area === d0.adrArea ? '' : d0.adrArea; return renderAdr(true); }
    if (d0.adr === 'kits') { ADR.menu = !ADR.menu; return renderAdr(true); }
    if (d0.adrKit) {
      const kit = adrKits().find(k => k.id === d0.adrKit);
      ADR.menu = false;
      if (kit && await confirmBox({ title: T('adr.kit.cf.title', loc(kit.name)), text: T('adr.kit.cf.text', kit.decisions.length), ok: T('adr.kit.cf.ok'), cancel: T('ver.cf.cancel') })) { ADR.q = ''; ADR.st = ''; ADR.area = ''; addDecisionKit(kit.id); }
      return renderAdr(true);
    }
    if (d0.adr === 'new') { ADR.q = ''; ADR.st = ''; return adrOpen(addDecision()); }
    if (d0.adr === 'md') return exportDecisions();
    if (d0.adrToggle != null && d) { ADR.open = ADR.open === d.id ? null : d.id; return renderAdr(true); }
    if (d0.adrGo) { const [k, ...r] = d0.adrGo.split(':'); return adrFocus(k, r.join(':')); }
    if (!d) return;
    if (d0.apprDo) return void apprDo(b, 'decision', d.id);
    if (d0.adr === 'wide') { ADR.wide = ADR.wide === d.id ? null : d.id; return renderAdr(true); }
    if (d0.adr === 'addopt') return adrAddOption(d);
    if (d0.adr === 'addcrit') return adrAddCriterion(d);
    if (d0.adrOptopen != null) { const k = `${d.id}|${d0.adrOptopen}`; if (!ADR.opt.delete(k)) ADR.opt.add(k); return renderAdr(true); }
    if (d0.adrChoose != null) return void updateDecision(d.id, { chosen: d.chosen === d0.adrChoose ? '' : d0.adrChoose });
    if (d0.adrRmopt != null) { ADR.opt.delete(`${d.id}|${d0.adrRmopt}`); return void updateDecision(d.id, { options: (d.options || []).filter(o => o.id !== d0.adrRmopt) }); }
    if (d0.adrRmcrit != null) return void updateDecision(d.id, { criteria: (d.criteria || []).filter(c => c.id !== d0.adrRmcrit) });
    if (d0.adrOptcmp != null || d0.adrOptgo != null) {
      const vid = (d.options || []).find(o => o.id === (d0.adrOptcmp ?? d0.adrOptgo))?.version;
      if (!vid || !findVersion(vid)) return;
      if (d0.adrOptgo != null) return adrGotoVersion(vid);
      if (S.compare?.id !== vid) compareVersion(vid);
      return toast(T('adr.o.comparing', verLabel(findVersion(vid))));
    }
    if (d0.adrUnlink) {
      const [k, ...r] = d0.adrUnlink.split(':'), id = r.join(':');
      return void updateDecision(d.id, { links: { ...d.links, [k]: (d.links?.[k] || []).filter(x => x !== id) } });
    }
    if (d0.adr === 'linksel') {
      const l = adrSelLinks();
      if (!l) return toast(T('adr.noSel'));
      return void updateDecision(d.id, { links: adrAddLinks(d, l) });
    }
    if (d0.adr === 'del' && await confirmBox({ title: T('adr.cf.title', d.id), text: T('adr.cf.text', adrTitle(d)), ok: T('adr.delete'), cancel: T('ver.cf.cancel'), danger: true })) removeDecision(d.id);
  });

  return { ADR, addDecision, addDecisionKit, adrAddLinks, adrById, adrChips, adrFocus, adrKits, adrLinkLabel, adrLinkList, adrOpen, adrPanel, adrSelLinks, adrTitle, apprDo, apprInfo, apprSection, apprSummary, removeDecision, renderAdr, signOff, updateDecision };
} };
