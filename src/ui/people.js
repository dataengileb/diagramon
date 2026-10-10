/* ==========================================================================
   Diagramon · interfaz: interesados (pestaña, fichas, matriz RACI) y exportación de decisiones
   --------------------------------------------------------------------------
   Movido desde src/app.js (v2), sin cambios de comportamiento.
   API: window.DiagramonUI.people
   ========================================================================== */
window.DiagramonUI = window.DiagramonUI || {};
// ctx: lo que esta pieza necesita de la app. Valores ya definidos al crearla pasan directos; el resto, como envolturas que se llaman al usarse.
window.DiagramonUI.people = { create(ctx) {
  'use strict';
  const I = window.DiagramonI18n, T = I.T;
  const { $, esc } = window.DiagramonCore.util;
  const { S } = window.DiagramonCore.state;
  const { confirmBox, toast } = window.DiagramonUI.dialogs;
  const { SH_MAX, SH_ORG, SH_RACI, addDecision, adrAddLinks, adrById, adrChips, adrFull, adrHist, adrLeader, adrLinkList, adrOpen, adrScore, adrSelLinks, adrTitle, beginEdit, changed, cleanStakeholders, decisionsOf, download, endEdit, findVersion, head, markEdit, money, pushHistory, save, shAreas, shById, shGaps, shHasSignoffs, syncEditor, updateDecision, verLabel, reqField } = ctx;

  const PEOPLE = { open: null, wide: false };   // ficha abierta; matriz RACI ampliada
  const SH_ORG_COLOR = { client: 'var(--p-cielo)', partner: 'var(--p-lavanda)', internal: 'var(--p-menta)' };
  const SH_RACI_COLOR = { R: 'var(--p-cielo)', A: 'var(--p-coral)', C: 'var(--p-limon)', I: 'var(--muted)' };
  const shRaciOf = (s, area) => { const k = Object.keys(s.raci || {}).find(x => x.toLowerCase() === String(area).toLowerCase()); return k ? s.raci[k] : ''; };
  // Todo pasa por cleanStakeholders, así los ids, los límites y los valores de raci siempre quedan coherentes
  function addStakeholder(p = {}) {
    p = p && typeof p === 'object' ? p : {};
    if ((S.model.stakeholders || []).length >= SH_MAX) { toast(T('adr.max', SH_MAX)); return ''; }
    pushHistory();
    const list = cleanStakeholders([...(S.model.stakeholders || []), { ...p, name: String(p.name ?? '').trim() || T('people.new') }], S.model), nd = list[list.length - 1];
    S.model.stakeholders = list;
    changed(true); renderPeople(true);
    return nd.id;
  }
  function updateStakeholder(id, patch) {
    const s = shById(id);
    if (!s || !patch || typeof patch !== 'object') return false;
    const list = cleanStakeholders(S.model.stakeholders.map(x => (x === s ? { ...s, ...patch, id: s.id } : x)), S.model);
    if (!list.some(x => x.id === s.id)) return false;   // sin nombre no hay interesado
    pushHistory();
    S.model.stakeholders = list;
    changed(true); renderPeople(true);
    return true;
  }
  function removeStakeholder(id) {
    const s = shById(id);
    if (!s) return false;
    if (shHasSignoffs(id)) { toast(T('people.blocked', s.name)); return false; }   // con firmas no se borra: se marca inactivo
    pushHistory();
    const list = cleanStakeholders(S.model.stakeholders.filter(x => x !== s), S.model);
    if (list.length) S.model.stakeholders = list; else delete S.model.stakeholders;
    if (PEOPLE.open === id) PEOPLE.open = null;
    changed(true); renderPeople(true);
    return true;
  }
  const peoplePanel = $('#people-panel');
  const shMeta = s => [s.role, T(`people.org.${s.org}`)].filter(Boolean).join(' · ');
  function shCard(s) {
    const on = PEOPLE.open === s.id, tags = [s.versions ? T('people.versions.short') : '', s.inactive ? T('people.inactive') : ''].filter(Boolean);
    const form = on ? `<div class="raid-form">
        <label>${esc(T('people.f.name'))}<input data-pf="name" value="${esc(s.name)}" maxlength="120" autocomplete="off"></label>
        <div class="raid-two"><label>${esc(T('people.f.role'))}<input data-pf="role" value="${esc(s.role || '')}" maxlength="80" placeholder="${esc(T('people.f.role.ph'))}" autocomplete="off"></label>
          <label>${esc(T('people.f.org'))}<select data-ps="org" aria-label="${esc(T('people.f.org'))}">${SH_ORG.map(o => `<option value="${o}"${s.org === o ? ' selected' : ''}>${esc(T(`people.org.${o}`))}</option>`).join('')}</select></label></div>
        <label class="ppl-chk"><input type="checkbox" data-pk="versions"${s.versions ? ' checked' : ''}> ${esc(T('people.versions'))}</label>
        <label class="ppl-chk"><input type="checkbox" data-pk="inactive"${s.inactive ? ' checked' : ''}> ${esc(T('people.inactive.tip'))}</label>
        <button class="btn small danger" data-ppl-del>${esc(T('people.delete'))}</button>
      </div>` : '';
    return `<div class="raid ppl${on ? ' on' : ''}${s.inactive ? ' off' : ''}" data-id="${esc(s.id)}" style="--s:${SH_ORG_COLOR[s.org]}">
      <button type="button" class="raid-head" data-ppl-toggle aria-expanded="${on}"><b class="raid-id">${esc(s.id)}</b><span class="raid-title">${esc(s.name)}</span><span class="raid-pill">${esc(T(`people.org.${s.org}`))}</span></button>
      <div class="raid-meta">${esc([s.role, ...tags].filter(Boolean).join(' · '))}</div>
      ${form}
    </div>`;
  }
  // Matriz RACI: filas = interesados, columnas = «todas las áreas» + cada área de las decisiones; ⚠ en la columna sin ningún aprobador (A)
  function shMatrix() {
    const hs = S.model.stakeholders || [], areas = shAreas(S.model), gaps = new Set(shGaps(S.model).map(a => a.toLowerCase())), wide = PEOPLE.wide;
    const cols = [['*', T('people.all')], ...areas.map(a => [a, a])];
    const head = cols.map(([a, lbl]) => { const gap = gaps.has(a.toLowerCase()); return `<th class="ppl-mx-a${gap ? ' gap' : ''}" title="${esc(gap ? `${lbl} · ${T('people.noApprover')}` : lbl)}"><span>${esc(lbl)}</span>${gap ? `<b class="ppl-warn" role="img" aria-label="${esc(T('people.noApprover'))}">⚠</b>` : ''}</th>`; }).join('');
    const rows = hs.map(s => `<tr class="${s.inactive ? 'off' : ''}"><th scope="row" class="req-mx-r"><button type="button" class="adr-mx-t" data-ppl-open="${esc(s.id)}" title="${esc(`${s.name}${s.role ? ` · ${s.role}` : ''}`)}"><b>${esc(s.id)}</b> <span>${esc(s.name)}</span></button></th>${cols.map(([a, lbl]) => {
      const v = shRaciOf(s, a);
      return `<td class="ppl-mx-c"><select data-pm="${esc(a)}" data-pid="${esc(s.id)}" class="${v ? 'has' : ''}" style="--s:${SH_RACI_COLOR[v] || 'var(--muted)'}" aria-label="${esc(`${s.name} · ${lbl}`)}">${['', ...SH_RACI].map(r => `<option value="${r}"${v === r ? ' selected' : ''}>${r || '–'}</option>`).join('')}</select></td>`;
    }).join('')}</tr>`).join('');
    return `${wide ? '<div class="req-back" data-ppl-wide="1"></div>' : ''}<div class="req-mx-box ppl-mx-box${wide ? ' wide' : ''}"><div class="adr-opts-h"><span>${esc(T('people.mx.title'))}</span><button type="button" class="btn small" data-ppl-wide="1" title="${esc(T('adr.wide.tip'))}">${esc(T(wide ? 'adr.narrow' : 'adr.wide'))}</button></div>
      <p class="raid-hint">${esc(T('people.mx.legend'))}</p>
      <div class="req-mx-wrap"><table class="req-mx ppl-mx"><thead><tr><th class="req-mx-r">${esc(T('people.mx.who'))}</th>${head}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }
  function renderPeople(force) {
    if (!peoplePanel || !S.model || !$('.pane[data-pane="people"]')?.classList.contains('on')) return;
    const a = document.activeElement;
    if (!force && a && peoplePanel.contains(a) && a.matches('input, textarea, select')) return;   // no pisar lo que se está escribiendo
    if (PEOPLE.open && !shById(PEOPLE.open)) PEOPLE.open = null;
    const hs = S.model.stakeholders || [], gaps = shGaps(S.model), box = $('#people-list'), keep = box.parentElement?.scrollTop || 0, hx = box.querySelector('.req-mx-wrap')?.scrollLeft || 0;
    $('#people-bar').innerHTML = `<div class="raid-tools"><button class="btn small primary" data-ppl-add>+ ${esc(T('people.add'))}</button></div>${hs.length ? `<div class="raid-sum" aria-live="polite">${esc(T('people.sum', hs.length))}${gaps.length ? ` · <span class="raid-late">${esc(T('people.sum.gaps', gaps.length))}</span>` : ''}</div>` : ''}`;
    box.innerHTML = hs.length ? hs.map(shCard).join('') + shMatrix() : `<p class="fnd-empty">${esc(T('people.empty'))}</p>`;
    if (box.parentElement) box.parentElement.scrollTop = keep;
    const w = box.querySelector('.req-mx-wrap');
    if (w && hx) w.scrollLeft = hx;
  }
  peoplePanel?.addEventListener('focusin', ev => { if (ev.target.dataset?.pf) beginEdit(); });
  peoplePanel?.addEventListener('focusout', ev => { if (ev.target.dataset?.pf) endEdit(); });
  peoplePanel?.addEventListener('input', ev => {
    const f = ev.target, k = f.dataset?.pf, card = f.closest('.ppl'), s = k && card && shById(card.dataset.id);
    if (!s) return;
    if (k === 'name' && !f.value.trim()) return;   // el nombre no puede quedar vacío
    markEdit();
    if (f.value.trim() || k === 'name') s[k] = f.value; else delete s[k];
    syncEditor(); save();
    card.querySelector('.raid-title').textContent = s.name;
    card.querySelector('.raid-meta').textContent = [s.role, ...(s.versions ? [T('people.versions.short')] : []), ...(s.inactive ? [T('people.inactive')] : [])].filter(Boolean).join(' · ');
  });
  peoplePanel?.addEventListener('change', ev => {
    const f = ev.target, d0 = f.dataset;
    if (d0.pm != null) {   // celda de la matriz: R/A/C/I o vacío
      const s = shById(d0.pid);
      if (!s) return;
      const raci = { ...s.raci }, cur = Object.keys(raci).find(k => k.toLowerCase() === d0.pm.toLowerCase());
      if (cur) delete raci[cur];
      if (f.value) raci[d0.pm] = f.value;
      return void updateStakeholder(s.id, { raci });
    }
    const card = f.closest('.ppl'), s = card && shById(card.dataset.id);
    if (!s) return;
    if (d0.ps) return void updateStakeholder(s.id, { [d0.ps]: f.value });
    if (d0.pk) return void updateStakeholder(s.id, { [d0.pk]: f.checked });
    if (d0.pf) { S.model.stakeholders = cleanStakeholders(S.model.stakeholders, S.model); changed(true); renderPeople(true); }   // al terminar de escribir: se normaliza y se repinta la matriz
  });
  peoplePanel?.addEventListener('click', async ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    const d0 = b.dataset, card = b.closest('.ppl'), s = card && shById(card.dataset.id);
    if (d0.pplAdd != null) { const id = addStakeholder(); if (id) { PEOPLE.open = id; renderPeople(true); $(`#people-list .ppl[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' }); } return; }
    if (d0.pplWide) { PEOPLE.wide = !PEOPLE.wide; return renderPeople(true); }
    if (d0.pplOpen) { PEOPLE.open = d0.pplOpen; PEOPLE.wide = false; renderPeople(true); return void $(`#people-list .ppl[data-id="${CSS.escape(d0.pplOpen)}"]`)?.scrollIntoView({ block: 'nearest' }); }
    if (d0.pplToggle != null && s) { PEOPLE.open = PEOPLE.open === s.id ? null : s.id; return renderPeople(true); }
    if (d0.pplDel == null || !s) return;
    if (shHasSignoffs(s.id)) {   // tiene firmas: no se borra; se ofrece marcarlo como inactivo
      if (s.inactive) return void toast(T('people.blocked', s.name));
      if (await confirmBox({ title: T('people.cf.blocked', s.name), text: T('people.cf.blocked.text'), ok: T('people.inactive.mark'), cancel: T('ver.cf.cancel') })) updateStakeholder(s.id, { inactive: true });
      return;
    }
    if (await confirmBox({ title: T('people.cf.title', s.name), text: T('people.cf.text'), ok: T('people.delete'), cancel: T('ver.cf.cancel'), danger: true })) removeStakeholder(s.id);
  });

  /* inspector (nodo, conexión y grupo) y filas de versiones */
  const adrKindOfSel = () => ({ node: 'nodes', edge: 'edges', group: 'groups' })[S.sel?.kind];
  const adrField = t => {
    const kind = adrKindOfSel();
    if (!kind) return '';
    const linked = decisionsOf(kind, t.id), rest = (S.model.decisions || []).filter(d => !linked.includes(d));
    return `<div class="field adr-field">${T('adr.field')}${adrChips(linked)}
      <div class="adr-row"><button class="btn small" data-adr="new">+ ${esc(T('adr.new'))}</button>
      ${rest.length ? `<select data-adr-link aria-label="${esc(T('adr.linkTo'))}"><option value="">${esc(T('adr.linkTo'))}</option>${rest.map(d => `<option value="${esc(d.id)}">${esc(`${d.id} · ${adrTitle(d)}`)}</option>`).join('')}</select>` : ''}</div></div>${reqField(kind, t.id)}`;
  };
  $('#inspector').addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.adrOpen) return adrOpen(b.dataset.adrOpen);
    const l = b.dataset.adr === 'new' && adrSelLinks();
    if (l) adrOpen(addDecision({ links: l }));
  });
  $('#inspector').addEventListener('change', ev => {
    const f = ev.target, d = f.matches?.('[data-adr-link]') && f.value && adrById(f.value), l = adrSelLinks();
    if (d && l) updateDecision(d.id, { links: adrAddLinks(d, l) });
  });
  $('#versions').addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.adrOpen) return adrOpen(b.dataset.adrOpen);
    if (b.dataset.adr === 'newver') { const id = b.closest('.ver')?.dataset.id; if (id) adrOpen(addDecision({ links: { versions: [id] } })); }
  });

  // Texto plano de las opciones de una decisión, compartido por el Markdown y el informe: matriz (criterios con peso × opciones, total %, ✓ elegida, ★ líder) y ficha de cada opción
  const adrBullets = t => String(t || '').split('\n').map(l => l.replace(/^\s*[•*-]\s*/, '').trim()).filter(Boolean);
  function adrMatrixText(d) {
    const cs = d.criteria || [], os = d.options || [], lead = adrLeader(d), nm = o => o.title || o.id, fmtCost = o => `${money(o.cost)} / ${T('adr.o.month')}`;
    const rows = os.map(o => {
      const sc = adrScore(d, o);
      return [`${o.id} · ${nm(o)}${d.chosen === o.id ? ' ✓' : ''}${lead === o.id && os.length > 1 ? ' ★' : ''}`, ...cs.map(c => (o.scores?.[c.id] != null ? String(o.scores[c.id]) : '–')), sc.scored ? `${sc.pct}%${adrFull(sc) || !sc.total ? '' : ` (${sc.scored}/${sc.total})`}` : '–'];
    });
    const cards = os.map(o => ({
      label: `${o.id} · ${nm(o)}${d.chosen === o.id ? ` ✓ ${T('adr.chosen')}` : ''}`,
      facts: [o.summary ? [T('adr.o.summary'), o.summary] : null, o.cost != null ? [T('adr.o.cost'), fmtCost(o)] : null, o.risk ? [T('adr.o.risk'), T(`adr.risk.${o.risk}`)] : null,
        o.version && findVersion(o.version) ? [T('adr.o.version'), verLabel(findVersion(o.version))] : null].filter(Boolean),
      pros: adrBullets(o.pros), cons: adrBullets(o.cons)
    }));
    return { head: [T('adr.opt'), ...cs.map(c => `${c.label} (×${c.weight})`), T('adr.total')], rows, cards, legend: T('adr.legend') };
  }

  /* exportación Markdown (MADR): índice y una sección por decisión */
  function decisionsMarkdown() {
    const m = S.model, ds = m.decisions || [], cell = x => String(x ?? '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
    const body = x => (String(x || '').trim() || '_—_');
    const out = [`# ${T('adr.md.title', m.title)}`, ''];
    if (ds.length) {
      const ar = ds.some(d => d.area);
      out.push(`| ${T('adr.f.id')} | ${T('adr.f.title')} | ${T('adr.f.status')} | ${T('adr.f.date')} |${ar ? ` ${T('adr.f.area')} |` : ''}`, `|---|---|---|---|${ar ? '---|' : ''}`);
      ds.forEach(d => out.push(`| ${cell(d.id)} | ${cell(adrTitle(d))} | ${cell(T(`adr.st.${d.status}`))} | ${cell(d.date)} |${ar ? ` ${cell(d.area || '')} |` : ''}`));
      out.push('');
    }
    ds.forEach(d => {
      out.push(`## ${d.id}: ${adrTitle(d).replace(/\s*\n\s*/g, ' ')}`, '', `- **${T('adr.f.status')}:** ${T(`adr.st.${d.status}`)}`, `- **${T('adr.f.date')}:** ${d.date}`);
      if (d.deciders) out.push(`- **${T('adr.f.deciders')}:** ${d.deciders}`);
      if (d.area) out.push(`- **${T('adr.f.area')}:** ${d.area}`);
      out.push('', `### ${T('adr.hist')}`, '', ...adrHist(d).map(h => `- ${h.date} · ${T(`adr.st.${h.status}`)}${h.by ? ` · ${h.by}` : ''}${h.note ? ` — ${h.note.replace(/\s*\n\s*/g, ' ')}` : ''}`));
      out.push('', `### ${T('adr.f.context')}`, '', body(d.context), '');
      if (d.options?.length) {   // opciones consideradas: matriz y ficha de cada una
        const mx = adrMatrixText(d);
        out.push(`### ${T('adr.opts')}`, '');
        if (d.criteria?.length) out.push(`| ${mx.head.map(cell).join(' | ')} |`, `|${mx.head.map(() => '---').join('|')}|`, ...mx.rows.map(r => `| ${r.map(cell).join(' | ')} |`), '', `_${mx.legend}_`, '');
        mx.cards.forEach(c => {
          out.push(`#### ${c.label}`, '', ...c.facts.map(([k, v]) => `- **${k}:** ${String(v).replace(/\s*\n\s*/g, ' ')}`));
          if (c.pros.length) out.push(`- **${T('adr.o.pros')}:**`, ...c.pros.map(x => `  - ${x}`));
          if (c.cons.length) out.push(`- **${T('adr.o.cons')}:**`, ...c.cons.map(x => `  - ${x}`));
          out.push('');
        });
      }
      out.push(`### ${T('adr.f.decision')}`, '', body(d.decision), '', `### ${T('adr.f.consequences')}`, '', body(d.consequences), '');
      const links = adrLinkList(d);
      if (links.length) out.push(`### ${T('adr.md.linked')}`, '', ...links.map(l => `- ${T(`adr.kind.${l.kind}`)}: ${l.label}`), '');
      if (d.supersededBy) { const s = adrById(d.supersededBy); out.push(`### ${T('adr.f.superseded')}`, '', `${d.supersededBy}${s ? ` — ${adrTitle(s)}` : ''}`, ''); }
    });
    return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n*$/, '\n');
  }
  function exportDecisions() {
    const md = decisionsMarkdown(), slug = (S.model.title || 'diagram').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'diagram';
    download(md, `${slug}-decisions.md`, 'text/markdown;charset=utf-8');
    return md;
  }

  return { PEOPLE, addStakeholder, adrField, adrKindOfSel, adrMatrixText, exportDecisions, removeStakeholder, renderPeople, shRaciOf, updateStakeholder };
} };
