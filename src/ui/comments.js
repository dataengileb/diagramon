/* ==========================================================================
   Diagramon · interfaz: comentarios: diálogo con los hilos e importar los comentarios del revisor
   --------------------------------------------------------------------------
   Movido desde src/app.js (v2), sin cambios de comportamiento.
   API: window.DiagramonUI.comments
   ========================================================================== */
window.DiagramonUI = window.DiagramonUI || {};
// ctx: lo que esta pieza necesita de la app. Valores ya definidos al crearla pasan directos; el resto, como envolturas que se llaman al usarse.
window.DiagramonUI.comments = { create(ctx) {
  'use strict';
  const I = window.DiagramonI18n, T = I.T;
  const { $, esc, store } = window.DiagramonCore.util;
  const { S } = window.DiagramonCore.state;
  const { toast } = window.DiagramonUI.dialogs;
  const { CM_MAX, CM_REPLIES, CM_TEXT, EDGE_DASHES, changed, cleanComments, cleanEdgeTypes, cleanFeedback, customTypes, edgeSample, edgeTypeId, fmtDay, focusTarget, mergeFeedback, paletteKeys, pushHistory, renderInspector, today, verLabel, adrTitle } = ctx;

  const CMD = { filter: 'open' };   // qué hilos se ven: open | all | done
  const cmAuthorNow = () => store.get('commentAuthor', '') || S.model.meta?.author || store.get('reviewer', '') || '';
  const cmTargetText = (m, on) => {
    const nm = id => m.nodes.find(n => n.id === id)?.label || id;
    if (on.kind === 'node') return nm(on.id);
    if (on.kind === 'edge') { const e = m.edges.find(x => x.id === on.id); return e ? `${nm(e.from)} ${e.both ? '↔' : '→'} ${nm(e.to)}` : on.id; }
    if (on.kind === 'group') return m.groups.find(g => g.id === on.id)?.label || on.id;
    if (on.kind === 'decision') { const d = (m.decisions || []).find(x => x.id === on.id); return d ? `${d.id} · ${adrTitle(d)}` : on.id; }
    if (on.kind === 'requirement') { const r = (m.requirements || []).find(x => x.id === on.id); return r ? `${r.id} · ${r.title}` : on.id; }
    if (on.kind === 'version') { const v = (m.versions || []).find(x => x.id === on.id); return v ? verLabel(v) : on.id; }
    return T('cmt.general');
  };
  // Resumen en el inspector del componente, la conexión o el grupo; los hilos se leen y escriben en el diálogo
  const cmtField = t => {
    const kind = S.sel?.kind;
    if (!['node', 'edge', 'group'].includes(kind) || !t?.id) return '';
    const all = (S.model.comments || []).filter(c => c.on.kind === kind && c.on.id === t.id), open = all.filter(c => c.status !== 'resolved').length;
    return `<div class="field cmt-field">${T('cmt.field')}<div class="cmt-row"><button class="btn small" data-cmt="open">💬 ${esc(all.length ? T('cmt.open.n', { o: open, n: all.length }) : T('cmt.add'))}</button></div></div>`;
  };
  function openComments(scope = null) {
    const prev = document.activeElement, back = document.createElement('div'), id = `cm${Date.now()}`;
    let sc = scope, sure = null;
    const m = () => S.model, byId = cid => (m().comments || []).find(c => c.id === cid);
    back.className = 'cf-back';
    back.innerHTML = `<div class="cf cmt-dlg" role="dialog" aria-modal="true" aria-labelledby="${id}t">
      <h3 id="${id}t">${esc(T('cmt.title'))}</h3>
      <div class="cmt-bar"><div class="seg cmt-seg" role="group">${['open', 'all', 'done'].map(k => `<button type="button" data-cmf="${k}">${esc(T(`cmt.flt.${k}`))}</button>`).join('')}</div><span class="cmt-scope"></span></div>
      <div class="cmt-list" role="list"></div>
      <form class="cmt-form" novalidate>
        <div class="cmt-row2"><label>${esc(T('cmt.author'))}<input name="author" maxlength="80" autocomplete="off"></label><label>${esc(T('cmt.on'))}<select name="on"></select></label></div>
        <label>${esc(T('cmt.text'))}<textarea name="text" rows="3" maxlength="${CM_TEXT}" placeholder="${esc(T('cmt.text.ph'))}"></textarea></label>
        <div class="cf-actions"><button type="button" class="btn" data-cm="close">${esc(T('et.close'))}</button><button type="submit" class="btn primary">${esc(T('cmt.post'))}</button></div>
      </form></div>`;
    const list = back.querySelector('.cmt-list'), form = back.querySelector('form'), scopeBox = back.querySelector('.cmt-scope');
    const fillTargets = () => {
      const mm = m(), opt = (k, o, label) => `<option value="${esc(`${k}:${o}`)}"${sc && sc.kind === k && sc.id === o ? ' selected' : ''}>${esc(label)}</option>`;
      const grp = (k, items, label) => (items.length ? `<optgroup label="${esc(T(`cmt.kind.${k}`))}">${items.map(x => opt(k, x.id, label(x))).join('')}</optgroup>` : '');
      form.on.innerHTML = `<option value="general"${sc ? '' : ' selected'}>${esc(T('cmt.general'))}</option>`
        + grp('node', mm.nodes, x => x.label) + grp('edge', mm.edges, x => cmTargetText(mm, { kind: 'edge', id: x.id })) + grp('group', mm.groups, x => x.label)
        + grp('decision', mm.decisions || [], x => `${x.id} · ${adrTitle(x)}`) + grp('requirement', mm.requirements || [], x => `${x.id} · ${x.title}`) + grp('version', mm.versions || [], x => verLabel(x));
    };
    const drawList = () => {
      const f = CMD.filter, rows = (m().comments || []).filter(c => (!sc || (c.on.kind === sc.kind && c.on.id === sc.id)) && (f === 'all' || (f === 'open') === (c.status !== 'resolved')));
      back.querySelectorAll('[data-cmf]').forEach(b => b.classList.toggle('on', b.dataset.cmf === f));
      scopeBox.innerHTML = sc ? `<span class="cmt-chip">${esc(cmTargetText(m(), sc))}<button type="button" data-cm="unscope" aria-label="${esc(T('cmt.unscope'))}" title="${esc(T('cmt.unscope'))}">×</button></span>` : '';
      list.innerHTML = rows.length ? rows.map(c => {
        const goes = ['node', 'edge', 'group'].includes(c.on.kind), label = c.on.kind === 'general' && c.was ? T('cmt.was', c.was) : cmTargetText(m(), c.on);
        const who = x => `<b>${esc(x.author || T('cmt.anon'))}</b>${x.date ? ` · ${esc(fmtDay(x.date))}` : ''}`;
        return `<div class="cmt${c.status === 'resolved' ? ' done' : ''}" role="listitem" data-cid="${esc(c.id)}">
          <div class="cmt-h">${goes ? `<button type="button" class="cmt-on" data-cm="go" title="${esc(T('cmt.go'))}">${esc(label)}</button>` : `<span class="cmt-on">${esc(label)}</span>`}
            <span>${who(c)}${c.source === 'client' ? ` · <em>${esc(T('cmt.client'))}</em>` : ''}${c.internal ? ` · <em>${esc(T('cmt.internal'))}</em>` : ''}${c.status === 'resolved' ? ` · <em>${esc(T('cmt.resolved'))}</em>` : ''}</span></div>
          <div class="cmt-t">${esc(c.text)}</div>
          ${(c.replies || []).map(r => `<div class="cmt-r"><div class="cmt-h"><span>${who(r)}</span></div><div class="cmt-t">${esc(r.text)}</div></div>`).join('')}
          <div class="cmt-rbox" hidden><textarea rows="2" maxlength="${CM_TEXT}" aria-label="${esc(T('cmt.reply'))}"></textarea><button type="button" class="btn small primary" data-cm="send">${esc(T('cmt.send'))}</button></div>
          <div class="cmt-a"><button type="button" class="btn small" data-cm="reply">${esc(T('cmt.reply'))}</button>
            <button type="button" class="btn small" data-cm="toggle">${esc(T(c.status === 'resolved' ? 'cmt.reopen' : 'cmt.resolve'))}</button>
            <button type="button" class="btn small" data-cm="internal" aria-pressed="${c.internal ? 'true' : 'false'}" title="${esc(T('cmt.internal.tip'))}">${esc(T(c.internal ? 'cmt.internal.off' : 'cmt.internal.on'))}</button>
            <button type="button" class="btn small danger" data-cm="del">${esc(T(sure === c.id ? 'cmt.del.sure' : 'cmt.del'))}</button></div></div>`;
      }).join('') : `<p class="cmt-empty">${esc(T((m().comments || []).length ? 'cmt.none.filter' : 'cmt.none'))}</p>`;
    };
    // Cada cambio es un paso de historial; el diagrama se repinta (insignias) y el resumen del inspector se actualiza
    const edit = fn => {
      pushHistory(); fn();
      const l = cleanComments(m().comments, m());
      if (l.length) m().comments = l; else delete m().comments;
      changed(true); renderInspector(); drawList();
    };
    const close = () => { document.removeEventListener('keydown', key, true); back.remove(); prev?.focus?.(); };
    const key = ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); } };
    back.addEventListener('mousedown', ev => { if (ev.target === back) close(); });
    back.addEventListener('click', ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.dataset.cmf) { CMD.filter = b.dataset.cmf; sure = null; return drawList(); }
      const act = b.dataset.cm, row = b.closest('[data-cid]'), c = row && byId(row.dataset.cid);
      if (act === 'close') return close();
      if (act === 'unscope') { sc = null; fillTargets(); return drawList(); }
      if (!c) return;
      if (act === 'go') { close(); return focusTarget(c.on.kind, c.on.id); }
      if (act === 'reply') { const rb = row.querySelector('.cmt-rbox'); rb.hidden = false; return rb.querySelector('textarea').focus(); }
      if (act === 'send') {
        const text = row.querySelector('.cmt-rbox textarea').value.trim(), author = form.author.value.trim();
        if (!text) return;
        if ((c.replies || []).length >= CM_REPLIES) return toast(T('cmt.max', CM_REPLIES));
        store.set('commentAuthor', author);
        return edit(() => { c.replies = [...(c.replies || []), { ...(author ? { author } : {}), date: today(), text }]; });
      }
      if (act === 'toggle') return edit(() => { if (c.status === 'resolved') delete c.status; else c.status = 'resolved'; });
      if (act === 'internal') return edit(() => { if (c.internal) delete c.internal; else c.internal = true; });
      if (act === 'del') {
        if (sure !== c.id) { sure = c.id; return drawList(); }   // dos pulsaciones: la primera pide confirmar
        sure = null;
        edit(() => { m().comments = m().comments.filter(x => x.id !== c.id); });
      }
    });
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      const text = form.text.value.trim(), author = form.author.value.trim();
      if (!text) return form.text.focus();
      if ((m().comments || []).length >= CM_MAX) return toast(T('cmt.max', CM_MAX));
      const v = form.on.value, i = v.indexOf(':'), on = v === 'general' || i < 0 ? { kind: 'general' } : { kind: v.slice(0, i), id: v.slice(i + 1) };
      store.set('commentAuthor', author);
      if (CMD.filter === 'done') CMD.filter = 'open';
      edit(() => { m().comments = [...(m().comments || []), { id: '', on, ...(author ? { author } : {}), date: today(), text }]; });
      form.text.value = ''; form.text.focus();
    });
    form.author.value = cmAuthorNow();
    fillTargets(); drawList();
    document.addEventListener('keydown', key, true);
    document.body.appendChild(back);
    form.text.focus();
  }
  $('#btn-comments').addEventListener('click', () => openComments());
  $('#inspector').addEventListener('click', ev => {
    const b = ev.target.closest('button[data-cmt]');
    if (b && ['node', 'edge', 'group'].includes(S.sel?.kind)) openComments({ kind: S.sel.kind, id: S.sel.id });
  });

  /* ---------- importar los comentarios del revisor (archivo cifrado que devuelve el visor compartido) ---------- */
  function openFeedbackImport(env) {
    const SH = window.DiagramonShare;
    if (!SH?.openFeedback || !window.crypto?.subtle || typeof DecompressionStream === 'undefined') return toast(T('share.unsupported'), 3200);
    const prev = document.activeElement, back = document.createElement('div'), id = `fb${Date.now()}`;
    let res = null;
    back.className = 'cf-back';
    back.innerHTML = `<form class="cf fb" role="dialog" aria-modal="true" aria-labelledby="${id}t" autocomplete="off">
      <h3 id="${id}t">${esc(T('fb.title'))}</h3>
      <p class="fb-lead">${esc(T('fb.lead'))}</p>
      <label class="fb-pw">${esc(T('fb.pw'))}<input type="password" name="pw" autocomplete="off" required></label>
      <div class="fb-sum" hidden></div>
      <p class="sh-err" role="alert"></p>
      <div class="cf-actions"><button type="button" class="btn" data-fb="no">${esc(T('ver.cf.cancel'))}</button><button type="submit" class="btn primary">${esc(T('fb.open'))}</button></div></form>`;
    const form = back.querySelector('form'), err = form.querySelector('.sh-err'), sum = form.querySelector('.fb-sum'), go = form.querySelector('[type="submit"]');
    const close = () => { document.removeEventListener('keydown', key, true); back.remove(); prev?.focus?.(); };
    const key = ev => { if (ev.key === 'Escape' && !form.classList.contains('busy')) { ev.preventDefault(); ev.stopPropagation(); close(); } };
    back.addEventListener('mousedown', ev => { if (ev.target === back && !form.classList.contains('busy')) close(); });
    form.addEventListener('click', ev => { if (ev.target.closest('[data-fb="no"]')) close(); });
    form.elements.pw.addEventListener('input', () => { err.textContent = ''; });
    // Qué entra: recuento y avisos, y una vista previa de los primeros comentarios (siempre como texto)
    const showSummary = (fb, r) => {
      const warn = [];
      if (fb.title && fb.title !== S.model.title) warn.push(T('fb.mismatch', fb.title));
      if (r.dup) warn.push(T('fb.dup', r.dup));
      if (r.orphan) warn.push(T('fb.orphan', r.orphan));
      if (r.stray) warn.push(T('fb.stray', r.stray));
      if (r.capped) warn.push(T('fb.capped', r.capped));
      const preview = fb.comments.slice(0, 6).map(c => `<li><b>${esc(c.author || T('cmt.anon'))}</b> · ${esc(c.replyTo ? T('cmt.reply') : cmTargetText(S.model, c.on))}: ${esc(c.text.length > 140 ? `${c.text.slice(0, 140)}…` : c.text)}</li>`).join('');
      sum.innerHTML = `<p><b>${esc(T('fb.from', { a: fb.author || T('cmt.anon'), t: fb.title || '' }))}</b></p>
        <p>${esc(r.threads + r.replies ? T('fb.sum', { t: r.threads, r: r.replies }) : T('fb.none'))}</p>
        ${warn.length ? `<ul class="fb-warn">${warn.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
        <ul class="fb-prev">${preview}</ul>`;
      sum.hidden = false;
      form.querySelector('.fb-pw').hidden = true; form.querySelector('.fb-lead').hidden = true;
    };
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      if (form.classList.contains('busy')) return;
      if (res) {   // segundo paso: aplicar
        if (!res.threads && !res.replies) return close();
        pushHistory();
        S.model.comments = res.comments;
        changed(true); renderInspector();
        toast(T('fb.done', { t: res.threads, r: res.replies }), 4200);
        close(); openComments();
        return;
      }
      form.classList.add('busy'); go.textContent = T('fb.busy'); err.textContent = '';
      try {
        const fb = cleanFeedback(await SH.openFeedback(env, form.elements.pw.value));
        if (!fb) throw new Error('format');
        res = mergeFeedback(S.model, fb, today());
        showSummary(fb, res);
        go.textContent = res.threads + res.replies ? T('fb.go', { n: res.threads + res.replies }) : T('fb.close');
      } catch (e) {
        err.textContent = e && e.message === 'format' ? T('fb.bad') : T('fb.wrong');
        go.textContent = T('fb.open'); form.elements.pw.select();
      } finally { form.classList.remove('busy'); }
    });
    document.addEventListener('keydown', key, true);
    document.body.appendChild(back);
    form.elements.pw.focus();
  }
  function openEdgeTypes(opts = {}) {
    const prev = document.activeElement, back = document.createElement('div'), id = `et${Date.now()}`, apply = opts.apply || null;
    let editing = null, draft = { label: '', dash: '6 6', color: '', width: 1.8, particles: 1 };
    back.className = 'cf-back';
    back.innerHTML = `<div class="cf et" role="dialog" aria-modal="true" aria-labelledby="${id}t">
      <h3 id="${id}t">${esc(T('et.title'))}</h3>
      <p>${esc(T('et.hint'))}</p>
      <div class="et-list"></div>
      <form class="et-form" novalidate>
        <h4 class="et-sub"></h4>
        <label>${esc(T('et.label'))}<input class="cf-type" name="label" maxlength="60" autocomplete="off" placeholder="${esc(T('et.label.ph'))}"></label>
        <div class="et-f"><span>${esc(T('et.dash'))}</span><div class="et-dashes" role="radiogroup"></div></div>
        <div class="et-f"><span>${esc(T('insp.color'))}</span><div class="swatches et-colors"></div></div>
        <div class="et-row">
          <label>${esc(T('et.width'))} <output name="wout"></output><input type="range" name="width" min="1" max="4" step="0.1"></label>
          <label>${esc(T('et.particles'))}<select name="particles">${[0, 1, 2, 3, 4].map(n => `<option value="${n}">${n}</option>`).join('')}</select></label>
        </div>
        <div class="et-prev"></div>
        <div class="cf-actions"><button type="button" class="btn" data-et="close">${esc(T('et.close'))}</button><button type="submit" class="btn primary" data-et="save">${esc(T('et.save'))}</button></div>
      </form></div>`;
    const form = back.querySelector('form'), list = back.querySelector('.et-list'), dashes = back.querySelector('.et-dashes'), cols = back.querySelector('.et-colors'), prevBox = back.querySelector('.et-prev');
    const drawPrev = () => {
      prevBox.textContent = '';
      prevBox.appendChild(edgeSample(draft, 120));
      const sp = document.createElement('span'); sp.textContent = draft.label || T('et.label.ph'); prevBox.appendChild(sp);
    };
    const drawForm = () => {
      form.querySelector('.et-sub').textContent = editing ? T('et.edit') : T('et.create');
      form.label.value = draft.label; form.width.value = draft.width; form.particles.value = draft.particles;
      form.wout.textContent = `${draft.width}px`;
      dashes.textContent = '';
      EDGE_DASHES.forEach(d => {
        const b = document.createElement('button'), on = (draft.dash || '') === d;
        b.type = 'button'; b.className = `et-dash${on ? ' on' : ''}`; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.dataset.dash = d; b.title = d || T('et.solid');
        b.appendChild(edgeSample({ dash: d, width: 2, color: draft.color }, 48));
        dashes.appendChild(b);
      });
      cols.textContent = '';
      const mk = (cls, k, title, color) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = `sw ${cls}${(draft.color || '') === k ? ' on' : ''}`; b.dataset.etc = k; b.title = title;
        if (color) b.style.setProperty('--c', color);
        cols.appendChild(b);
      };
      mk('auto', '', T('insp.auto'));
      paletteKeys().forEach(k => mk('', k, I.colorName(k), `var(--p-${k})`));
      const hex = /^#[0-9a-f]{6}$/i.test(draft.color || '') ? draft.color : '';
      const ci = document.createElement('input');
      ci.type = 'color'; ci.className = 'et-hex'; ci.value = hex || '#8573db'; ci.title = T('color.custom'); ci.setAttribute('aria-label', T('color.custom'));
      cols.appendChild(ci);
      drawPrev();
    };
    const drawList = () => {
      list.textContent = '';
      customTypes().forEach(t => {
        const n = S.model.edges.filter(e => e.style === t.id).length, row = document.createElement('div');
        row.className = 'et-item';
        row.appendChild(edgeSample(t, 56));
        const nm = document.createElement('span'); nm.className = 'et-name'; nm.textContent = t.label; row.appendChild(nm);
        const cnt = document.createElement('small'); cnt.textContent = n ? T('et.used', n) : ''; row.appendChild(cnt);
        [['edit', 'et.edit.btn'], ['del', 'et.del']].forEach(([a, k]) => {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'btn small'; b.dataset.eta = a; b.dataset.id = t.id; b.textContent = T(k); row.appendChild(b);
        });
        list.appendChild(row);
      });
      list.hidden = !list.children.length;
    };
    const readForm = () => { // lo escrito se valida de nuevo al guardar (cleanEdgeTypes)
      draft = { ...draft, label: form.label.value, width: +form.width.value || 1.8, particles: +form.particles.value };
      form.wout.textContent = `${draft.width}px`;
    };
    const close = () => { document.removeEventListener('keydown', key, true); back.remove(); prev?.focus?.(); };
    const key = ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); } };
    const reset = () => { editing = null; draft = { label: '', dash: '6 6', color: '', width: 1.8, particles: 1 }; drawForm(); };
    form.addEventListener('input', () => { readForm(); drawPrev(); });
    form.addEventListener('change', ev => { if (ev.target.classList.contains('et-hex')) { readForm(); draft.color = ev.target.value; drawForm(); } });
    form.addEventListener('click', ev => {
      const d = ev.target.closest('[data-dash]'), c = ev.target.closest('[data-etc]');
      if (d) { readForm(); draft.dash = d.dataset.dash; drawForm(); }
      else if (c) { readForm(); draft.color = c.dataset.etc; drawForm(); }
      else if (ev.target.closest('[data-et="close"]')) close();
    });
    form.addEventListener('submit', ev => {
      ev.preventDefault(); readForm();
      const t = cleanEdgeTypes([{ ...draft, id: editing || edgeTypeId(draft.label) }])[0];
      if (!t || !draft.label.trim()) { form.label.focus(); return toast(T('et.need')); }
      pushHistory();
      const all = customTypes().slice(), i = all.findIndex(x => x.id === t.id);
      if (i >= 0) all[i] = t; else all.push(t);
      S.model.edgeTypes = all;
      if (apply && !editing && S.model.edges.includes(apply)) apply.style = t.id;
      changed(true); renderInspector();
      toast(T(editing ? 'et.saved' : 'et.created', { label: t.label }));
      if (apply && !editing) return close();
      drawList(); reset();
    });
    back.addEventListener('mousedown', ev => { if (ev.target === back) close(); });
    back.addEventListener('click', ev => {
      const b = ev.target.closest('[data-eta]');
      if (!b) return;
      const t = customTypes().find(x => x.id === b.dataset.id);
      if (!t) return;
      if (b.dataset.eta === 'edit') { editing = t.id; draft = { label: t.label, dash: t.dash || '', color: t.color || '', width: t.width ?? 1.8, particles: t.particles ?? 1 }; drawForm(); return; }
      pushHistory();
      const n = S.model.edges.filter(e => e.style === t.id).length;
      S.model.edges.forEach(e => { if (e.style === t.id) delete e.style; }); // en uso: vuelven a síncrona
      const rest = customTypes().filter(x => x.id !== t.id);
      if (rest.length) S.model.edgeTypes = rest; else delete S.model.edgeTypes;
      changed(true); renderInspector();
      toast(T('et.deleted', { label: t.label, n }));
      if (editing === t.id) reset();
      drawList();
    });
    document.addEventListener('keydown', key, true);
    drawList(); drawForm();
    document.body.appendChild(back);
    form.label.focus();
  }

  return { cmTargetText, cmtField, openEdgeTypes, openFeedbackImport };
} };
