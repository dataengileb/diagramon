/* ==========================================================================
   Diagramon · interfaz: campos del inspector: STRIDE, cifrado, residencia, gobierno y disponibilidad
   --------------------------------------------------------------------------
   Movido desde src/app.js (v2), sin cambios de comportamiento.
   API: window.DiagramonUI.inspconn
   ========================================================================== */
window.DiagramonUI = window.DiagramonUI || {};
// ctx: lo que esta pieza necesita de la app. Valores ya definidos al crearla pasan directos; el resto, como envolturas que se llaman al usarse.
window.DiagramonUI.inspconn = { create(ctx) {
  'use strict';
  const I = window.DiagramonI18n, T = I.T, loc = I.loc;
  const { esc, store } = window.DiagramonCore.util;
  const { S } = window.DiagramonCore.state;
  const { GOV_FIELDS, REV_COLOR, STR, THREAT_ST, availOf, cleanRegion, crossBorder, crossInfo, downtime, fmtPct, govOf, isInsecure, jurOf, regionLabel, regionOf, replicasOf, reviewHint, reviewState, sevLabel, spofList, strideCtx, strideFor, trustName, xbWarn } = ctx;

  const strideField = e => {
    const c = strideCtx(), info = crossInfo(e, c), nm = zs => (zs.length ? zs.map(z => `‹${esc(trustName(z))}›`).join(' + ') : esc(T('stride.outside')));
    if (!info) { // ya no cruza: las decisiones guardadas se ven en solo lectura, con opción de borrarlas
      const st = Object.entries(e.threats || {});
      if (!st.length) return '';
      return `<div class="field stride-box">${T('stride.label')}<span class="cost-hint">${T('stride.stored')}</span>${st.map(([k, d]) =>
        `<div class="th-ro"><b class="th-badge">${esc(k)}</b><span>${esc(loc(STR.categories[k]?.label) || k)} · ${esc(T(`stride.st.${d.status}`))}${d.note ? ` — ${esc(d.note)}` : ''}</span></div>`).join('')}
        <button class="btn small" data-th-clear="1">${T('stride.clear')}</button></div>`;
    }
    const ts = strideFor(e, c, info);
    return `<div class="field stride-box">${T('stride.label')}<span class="cost-hint th-cross">${T('stride.crosses')} ${info.from.length ? nm(info.from) : nm([])} → ${nm(info.to)}</span>${ts.map(t => `
      <div class="th-row" style="--sv:var(--sev-${t.severity})"><div class="th-head"><b class="th-badge" title="${esc(loc(STR.categories[t.cat].desc))}">${t.cat}</b><span class="th-title">${esc(t.title)}</span><span class="th-sev">${esc(sevLabel(t.severity))}</span></div>
        <div class="seg th-seg">${['open', ...THREAT_ST].map(s => `<button data-th="${t.cat}" data-st="${s}" class="${t.status === s ? 'on' : ''}">${T(`stride.st.${s}`)}</button>`).join('')}</div>
        ${t.status !== 'open' ? `<input class="th-note" data-th-note="${t.cat}" value="${esc(t.note)}" placeholder="${esc(T('stride.note.ph'))}" autocomplete="off">` : ''}
        <span class="cost-hint">${esc(t.why)}</span></div>`).join('')}</div>`;
  };
  const encField = e => {
    const cur = e.encrypted === true ? 'yes' : e.encrypted === false ? 'no' : '';
    const byId = id => S.model.nodes.find(n => n.id === id);
    return `<div class="field">${T('enc.label')}<div class="seg">${[['', 'enc.unset'], ['yes', 'enc.yes'], ['no', 'enc.no']].map(([k, l]) =>
      `<button data-enc="${k}" class="enc-${k || 'unset'}${cur === k ? ' on' : ''}">${T(l)}</button>`).join('')}</div>${isInsecure(e, byId) ? `<span class="enc-warn">⚠ ${T('enc.warn')}</span>` : ''}</div>`;
  };

  /* ---------- residencia: campos del inspector ---------- */
  // Regiones sugeridas además de las que ya usa el diagrama
  const REGION_HINTS = ['eu-west-1', 'eu-central-1', 'eu-north-1', 'eu-south-2', 'us-east-1', 'us-west-2', 'ca-central-1', 'sa-east-1', 'ap-southeast-1', 'ap-northeast-1', 'westeurope', 'northeurope', 'germanywestcentral', 'eastus', 'westus2', 'brazilsouth',
    'europe-west1', 'europe-west3', 'us-central1', 'southamerica-east1', 'ES', 'DE', 'FR', 'GB', 'US', 'MX', 'CO', 'BR'];
  const regionJurText = r => { const j = jurOf(r); return j ? j.label : ''; };
  // «inherited from X» / «deduced from X» para el valor que aporta un grupo
  const regionHint = (list, own) => {
    const rs = list.map(x => regionOf(x)), r0 = rs[0];
    if (own || !rs.every(r => r.value === r0.value && (r.from?.id || '') === (r0.from?.id || '')) || !r0.value) return '';
    return r0.from ? T(r0.from.deduced ? 'res.deduced' : 'res.inherited', r0.from.label) : '';
  };
  // Cuadro de texto de región (nodo, grupo o varios): valor propio, o el heredado / deducido como sugerencia
  const regionField = items => {
    const list = [].concat(items), vals = new Set(list.map(x => cleanRegion(x.region))), mixed = vals.size > 1, own = mixed ? '' : [...vals][0];
    const eff = list.map(x => regionOf(x).value), same = eff.every(v => v === eff[0]);
    const ph = mixed ? T('insp.mixed') : own ? '' : same ? eff[0] || T('res.ph') : T('insp.mixed');
    const used = [...new Set([...S.model.nodes, ...S.model.groups].map(x => cleanRegion(x.region)).filter(Boolean))];
    const opts = [...new Set([...used, ...REGION_HINTS])];
    const jur = same ? regionJurText(own || eff[0]) : '';
    return `<div class="field region-field"><div class="region-row"><label>${T('res.label')}<input data-field="region" list="region-list" value="${esc(own)}" placeholder="${esc(ph)}" autocomplete="off" spellcheck="false"></label><span class="region-jur" id="region-jur"${jur ? '' : ' hidden'}>${esc(jur)}</span></div>
      <span class="cost-hint" id="region-hint">${esc(mixed ? '' : regionHint(list, own))}</span><datalist id="region-list">${opts.map(o => `<option value="${esc(o)}">`).join('')}</datalist></div>`;
  };
  // Conexión entre regiones: «eu-west-1 (EU) → us-east-1 (US)», aviso y botón de transferencia autorizada
  const xferField = e => {
    const nm = id => S.model.nodes.find(n => n.id === id), ra = regionOf(nm(e.from)).value, rb = regionOf(nm(e.to)).value;
    if (!ra || !rb) return '';
    const cb = crossBorder(e, nm);
    return `<div class="field">${T('res.edge')}<span class="cost-hint">${esc(regionLabel(ra))} → ${esc(regionLabel(rb))}</span>${cb ? `${cb.approved ? `<span class="cost-hint xfer-ok">✓ ${esc(T('res.approvedLine'))}</span>` : `<span class="enc-warn">${esc(xbWarn(cb))}</span>`}
      <button class="btn small${cb.approved ? ' on' : ''}" data-xfer="1" aria-pressed="${cb.approved}">${cb.approved ? '✓ ' : ''}${T('res.approve')}</button>` : ''}</div>`;
  };

  // Observación de revisión: la levanta a mano quien revisa (qué, quién, cuándo y para cuándo)
  const reviewField = n => {
    const r = n.review;
    if (!r) return `<div class="field">${T('rev.label')}<button class="btn rev-add" data-rev="add">⚑ ${T('rev.add')}</button></div>`;
    const st = reviewState(r);
    return `<div class="field rev-box" style="--c:${REV_COLOR[st]}">${T('rev.label')}
      <div class="rev-head"><span class="rev-pill">${esc(T(`rev.tag.${st}`))}</span><em>${esc(reviewHint(r))}</em></div>
      <label>${T('rev.note')}<textarea data-rev-field="note" rows="2" placeholder="${esc(T('rev.note.ph'))}">${esc(r.note || '')}</textarea></label>
      <label>${T('rev.by')}<input data-rev-field="by" value="${esc(r.by || '')}" placeholder="${esc(T('rev.by.ph'))}" autocomplete="off"></label>
      <label>${T('rev.raised')}<input type="date" data-rev-field="raised" value="${esc(r.raised || '')}"></label>
      <label>${T('rev.due')}<input type="date" data-rev-field="due" value="${esc(r.due || '')}"></label>
      <div class="insp-actions">
        <button class="btn small" data-rev="toggle">${T(r.status === 'resolved' ? 'rev.reopen' : 'rev.resolve')}</button>
        <button class="btn small danger" data-rev="remove">${T('rev.remove')}</button>
      </div>
    </div>`;
  };

  // Dueños y responsables: sección plegable con 4 campos; sugiere los valores ya usados y muestra lo heredado del grupo
  const govField = (items, kind) => {
    const list = [].concat(items), m = S.model, one = list.length === 1 && list[0];
    const own = (x, f) => String(x[f] ?? '').trim();
    const any = list.some(x => GOV_FIELDS.some(f => own(x, f)));
    const open = store.get(`govOpen.${kind}`, any);
    const cells = GOV_FIELDS.map(f => {
      const vals = list.map(x => own(x, f)), same = vals.every(v => v === vals[0]), inh = one && !vals[0] ? govOf(one, f) : null;
      const ph = !same ? T('insp.mixed') : inh?.value || '';
      const used = [...new Set([...m.nodes, ...m.groups].map(x => own(x, f)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      const gl = inh?.from ? m.groups.find(g => g.id === inh.from)?.label : '';
      return `<label>${T(`gov.${f}`)}<input data-gov="${f}" list="dl-gov-${f}" value="${esc(same ? vals[0] : '')}" placeholder="${esc(ph)}" autocomplete="off"><datalist id="dl-gov-${f}">${used.map(v => `<option value="${esc(v)}"></option>`).join('')}</datalist>${gl ? `<span class="cost-hint">${esc(T('gov.inherited', { name: gl }))}</span>` : ''}</label>`;
    });
    return `<details class="gov-box" data-gov-open="${kind}"${open ? ' open' : ''}><summary>${T('gov.title')}</summary><div class="row2">${cells[0]}${cells[1]}</div><div class="row2">${cells[2]}${cells[3]}</div></details>`;
  };

  /* ---------- disponibilidad: campos del inspector ---------- */
  const SLA_TIERS = [99, 99.5, 99.9, 99.95, 99.99, 99.999], DUR_TIERS = ['0', '15m', '1h', '4h', '24h'];
  // Pista bajo los campos: disponibilidad efectiva, tiempo de parada esperado y aviso de punto único de fallo
  const resHintHtml = list => {
    if (list.length !== 1) return '';
    const n = list[0], a = availOf(n), r = replicasOf(n), sp = spofList().find(x => x.id === n.id);
    const h = a == null ? T('res.hint.empty') : `${T('res.hint.eff', { a: fmtPct(a), n: r })} · ${downtime(a).text}`;
    return `<span class="cost-hint">${esc(h)}</span>${sp ? `<span class="enc-warn">⚠ ${esc(T('res.spof'))} · ${esc(sp.reason)}</span>` : ''}`;
  };
  const resField = items => {
    const list = [].concat(items), cell = (k, lab, extra) => {
      const vals = list.map(x => (x[k] == null ? '' : String(x[k]))), same = vals.every(v => v === vals[0]);
      return `<label>${lab}<input data-res="${k}" ${extra} value="${esc(same ? vals[0] : '')}" placeholder="${esc(same ? '' : T('insp.mixed'))}" autocomplete="off"></label>`;
    };
    return `<div class="field res-field">${T('res.title')}
      <div class="row2">${cell('sla', T('res.sla'), 'list="dl-sla" inputmode="decimal"')}${cell('replicas', T('res.replicas'), 'type="number" min="1" step="1" inputmode="numeric"')}</div>
      <div class="row2">${cell('rpo', T('res.rpo'), 'list="dl-dur"')}${cell('rto', T('res.rto'), 'list="dl-dur"')}</div>
      <datalist id="dl-sla">${SLA_TIERS.map(v => `<option value="${v}"></option>`).join('')}</datalist><datalist id="dl-dur">${DUR_TIERS.map(v => `<option value="${v}"></option>`).join('')}</datalist>
      <div id="res-hint">${resHintHtml(list)}</div></div>`;
  };
  // Sección "Camino" con exactamente dos nodos: el orden de selección define A y B
  function pathField() {
    const [a, b] = S.sel.ids.map(id => S.model.nodes.find(n => n.id === id).label);
    return `<div class="field">${T('insp.path')}<div class="path-btns">
      <button class="btn" data-path="fwd" title="${esc(T('path.show', { a, b }))}">${T('path.show', { a: esc(a), b: esc(b) })}</button>
      <button class="btn tool" data-path="rev" title="${esc(T('path.swap', { a: b, b: a }))}" aria-label="${esc(T('path.swap', { a: b, b: a }))}">⇄</button></div></div>`;
  }

  return { DUR_TIERS, encField, govField, pathField, regionField, regionHint, regionJurText, resField, resHintHtml, reviewField, strideField, xferField };
} };
