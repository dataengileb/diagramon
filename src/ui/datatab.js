/* ==========================================================================
   Diagramon · interfaz: catálogo de datos: pestaña Datos (fichas de conjuntos: general, esquema, calidad, contrato y linaje)
   --------------------------------------------------------------------------
   Movido desde src/app.js (v2), sin cambios de comportamiento.
   API: window.DiagramonUI.datatab
   ========================================================================== */
window.DiagramonUI = window.DiagramonUI || {};
// ctx: lo que esta pieza necesita de la app. Valores ya definidos al crearla pasan directos; el resto, como envolturas que se llaman al usarse.
window.DiagramonUI.datatab = { create(ctx) {
  'use strict';
  const I = window.DiagramonI18n, T = I.T;
  const { $, esc } = window.DiagramonCore.util;
  const { S } = window.DiagramonCore.state;
  const { confirmBox, toast } = window.DiagramonUI.dialogs;
  const { DATA, DL, DS_COLS, DS_DEFAULT_DAYS, DS_FORMATS, DS_MAX, DS_RULES, DS_RULES_MAX, DS_STATUS, DUR_TIERS, addDataset, catalog, colorVar, dsById, dsEdges, dsFind, dsHelpers, dsK, dsPrices, e2eOf, exportContract, fmtDur, focusTarget, layerInfo, layerOf, money, normDur, numFmt, parseDur, removeDataset, renameDatasetApi, sevLabel, showLineage, storageEstimate, updateDataset } = ctx;

  const DSX = { open: null, q: '', domain: '', layer: '', prod: '', cst: '', wide: null, sec: new Set(), free: null, focus: '' };   // ficha abierta, filtros, esquema ampliado, secciones abiertas
  const dsPanel = $('#ds-panel');
  const DS_TYPES = ['string', 'int', 'bigint', 'decimal', 'double', 'boolean', 'date', 'timestamp', 'array', 'struct'];
  let dsMemo = new Map();   // frescura por nombre durante un repintado (calcular el linaje de cada ficha es lo más caro)
  const dsFr = name => { const k = dsK(name); if (!dsMemo.has(k)) dsMemo.set(k, e2eOf(name)); return dsMemo.get(k); };
  const dsFrText = f => [T('ds.fr.real', f.worst == null ? '?' : `${f.unknownHops ? '≥ ' : ''}${fmtDur(f.worst / 1000)}`), f.sla == null ? T('ds.fr.noSla') : T('ds.fr.sla', fmtDur(f.sla / 1000))].join(' · ');
  const DS_FR = { pass: ['✓', 'var(--p-menta)', 'ds.fr.ok'], fail: ['✗', 'var(--p-coral)', 'ds.fr.bad'], unknown: ['?', 'var(--muted)', 'ds.fr.unk'] };
  const dsOwnerLabel = ds => (S.model.stakeholders || []).find(s => s.id === ds.owner)?.name || ds.owner || '';
  const dsRuleLabel = r => (T(`ds.rule.${r}`) !== `ds.rule.${r}` ? T(`ds.rule.${r}`) : r);
  const dsSecKey = (id, s) => `${id}|${s}`;
  const dsMatch = ds => (!DSX.domain || ds.domain === DSX.domain) && (!DSX.layer || ds.layer === DSX.layer) && (!DSX.prod || (DSX.prod === 'yes') === !!ds.product)
    && (!DSX.cst || (DSX.cst === 'none' ? !ds.contract : ds.contract?.status === DSX.cst))
    && (!DSX.q || [ds.id, ds.name, ds.domain, ds.description, dsOwnerLabel(ds), ds.steward, ...(ds.schema || []).map(c => c.name)].some(x => String(x || '').toLowerCase().includes(DSX.q.toLowerCase())));
  const dsOpts = (items, cur) => items.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(cur ?? '') ? ' selected' : ''}>${esc(t)}</option>`).join('');
  const dsSel = (attrs, cur, items, label) => `<select ${attrs} aria-label="${esc(label)}">${dsOpts(items, cur)}</select>`;
  function renderDsBar(all, cat) {
    const decl = cat.filter(c => c.declared), und = cat.filter(c => !c.declared), breach = decl.filter(c => dsFr(c.name).state === 'fail').length, products = all.filter(d => d.product).length;
    const layers = Object.keys(DL).filter(k => all.some(d => d.layer === k) || DSX.layer === k), domains = [...new Set(all.map(d => d.domain).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    if (DSX.domain && !domains.includes(DSX.domain)) DSX.domain = '';
    const chip = (attr, k, on, label, color) => `<button class="fnd-chip${on ? ' on' : ''}" ${attr}="${esc(k)}" aria-pressed="${on}" style="--s:${color}">${esc(label)}</button>`;
    const parts = [`<span>${esc(T('ds.sum.declared', decl.length))}</span>`, `<span>${esc(T('ds.sum.products', products))}</span>`, und.length ? `<span>${esc(T('ds.sum.undoc', und.length))}</span>` : '', breach ? `<span class="raid-late">${esc(T('ds.sum.breach', breach))}</span>` : ''];
    $('#ds-bar').innerHTML = `<div class="raid-tools"><button class="btn small primary" data-ds-add="1" title="${esc(T('ds.add.tip'))}">+ ${esc(T('ds.add'))}</button></div>
      ${all.length || und.length ? `<div class="raid-sum" aria-live="polite">${parts.filter(Boolean).join(' · ')}</div>
      <div class="fnd-chips" role="group" aria-label="${esc(T('ds.fl.aria'))}">${layers.map(k => chip('data-ds-lay', k, DSX.layer === k, layerInfo(k).label, layerInfo(k).color)).join('')}${chip('data-ds-prodf', 'yes', DSX.prod === 'yes', T('ds.fl.prod'), 'var(--p-limon)')}${chip('data-ds-prodf', 'no', DSX.prod === 'no', T('ds.fl.noprod'), 'var(--muted)')}</div>
      <div class="ds-filters">${dsSel('id="ds-fdom"', DSX.domain, [['', T('ds.fl.domain')], ...domains.map(d => [d, d])], T('ds.fl.domain'))}${dsSel('id="ds-fcst"', DSX.cst, [['', T('ds.fl.cst')], ['none', T('ds.fl.nocst')], ...DS_STATUS.map(s => [s, T(`ds.cst.${s}`)])], T('ds.fl.cst'))}</div>
      <input class="search" id="ds-q" style="padding-left:10px;margin-bottom:6px" value="${esc(DSX.q)}" placeholder="${esc(T('ds.search'))}" aria-label="${esc(T('ds.search'))}" autocomplete="off">` : ''}`;
  }
  // Cabecera de la ficha (se repinta sola cuando cambia algo que ella muestra)
  function dsHead(ds, on) {
    const f = dsFr(ds.name), fr = DS_FR[f.state], li = ds.layer ? layerInfo(ds.layer) : null, se = storageEstimate(ds, { prices: dsPrices() });
    const meta1 = [ds.domain, dsOwnerLabel(ds)].filter(Boolean).join(' · '), meta2 = [ds.freshness || f.worst != null ? dsFrText(f) : '', se ? T('ds.store', { gb: numFmt(se.gb, 1), cost: money(se.monthly) }) : ''].filter(Boolean).join(' · ');
    return `<div class="ds-top"><div class="ds-hd"><button type="button" class="ds-toggle" data-ds-toggle="1" aria-expanded="${on}"><b class="raid-id">${esc(ds.id)}</b><span class="ds-title">${esc(ds.name)}</span>${li ? `<span class="ds-layer" style="--s:${li.color}">${esc(li.label)}</span>` : ''}<span class="ds-fr" style="--s:${fr[1]}" title="${esc(T(fr[2]))}">${fr[0]}</span></button><button type="button" class="ds-star${ds.product ? ' on' : ''}" data-ds-star="1" aria-pressed="${!!ds.product}" title="${esc(T('ds.product.tip'))}" aria-label="${esc(T('ds.product.tip'))}">★</button></div>
      ${meta1 ? `<div class="raid-meta">${esc(meta1)}</div>` : ''}${meta2 ? `<div class="raid-meta ds-meta2">${esc(meta2)}</div>` : ''}</div>`;
  }
  function dsSchema(ds) {
    const wide = DSX.wide === ds.id, cols = ds.schema || [], cb = (k, on, t) => `<input type="checkbox" data-dsck="${k}"${on ? ' checked' : ''} aria-label="${esc(t)}">`;
    const rows = cols.map((c, i) => `<tr data-i="${i}"><td class="ds-sc-n">${i + 1}</td><td><input data-dsc="name" value="${esc(c.name)}" maxlength="120" aria-label="${esc(T('ds.col.name'))}" autocomplete="off" spellcheck="false"></td>
      <td><input data-dsc="type" list="ds-types" value="${esc(c.type || '')}" maxlength="40" aria-label="${esc(T('ds.col.type'))}" autocomplete="off" spellcheck="false"></td>
      <td>${cb('key', c.key, T('ds.col.key.tip'))}</td><td>${cb('pii', c.pii, T('ds.col.pii'))}</td><td>${cb('nullable', c.nullable !== false, T('ds.col.null.tip'))}</td>
      <td><input data-dsc="desc" value="${esc(c.desc || '')}" maxlength="500" aria-label="${esc(T('ds.col.desc'))}" autocomplete="off"></td>
      <td class="ds-sc-a"><button type="button" data-ds-colup="${i}" title="${esc(T('ds.col.up'))}" aria-label="${esc(T('ds.col.up'))}"${i ? '' : ' disabled'}>▲</button><button type="button" data-ds-coldn="${i}" title="${esc(T('ds.col.dn'))}" aria-label="${esc(T('ds.col.dn'))}"${i < cols.length - 1 ? '' : ' disabled'}>▼</button><button type="button" class="adr-x" data-ds-colrm="${i}" title="${esc(T('ds.col.rm'))}" aria-label="${esc(T('ds.col.rm'))}">×</button></td></tr>`).join('');
    return `${wide ? '<div class="req-back" data-ds-wide="1"></div>' : ''}<div class="req-mx-box ds-sc-box${wide ? ' wide' : ''}"><div class="adr-opts-h"><span>${esc(T('ds.sc.title', ds.name))}</span><button type="button" class="btn small" data-ds-wide="1" title="${esc(T('adr.wide.tip'))}">${esc(T(wide ? 'adr.narrow' : 'adr.wide'))}</button></div>
      ${cols.length ? `<div class="ds-sc-wrap"><table class="ds-sc"><thead><tr><th>#</th><th>${esc(T('ds.col.name'))}</th><th>${esc(T('ds.col.type'))}</th><th title="${esc(T('ds.col.key.tip'))}">${esc(T('ds.col.key'))}</th><th>${esc(T('ds.col.pii'))}</th><th title="${esc(T('ds.col.null.tip'))}">${esc(T('ds.col.null'))}</th><th>${esc(T('ds.col.desc'))}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="raid-hint">${esc(T('ds.col.empty'))}</p>`}
      <div class="raid-row"><button type="button" class="btn small" data-ds-coladd="1">${esc(T('ds.col.add'))}</button></div></div>`;
  }
  function dsQuality(ds) {
    const rules = dsHelpers().rules || DS_RULES, cols = (ds.schema || []).map(c => c.name);
    return `${(ds.quality || []).map((q, i) => `<div class="ds-q" data-i="${i}">${dsSel('data-dsq="rule"', q.rule, [...new Set([...rules, q.rule])].map(r => [r, dsRuleLabel(r)]), T('ds.q.rule'))}
      ${dsSel('data-dsq="column"', q.column || '', [['', T('ds.q.any')], ...[...new Set([...cols, q.column].filter(Boolean))].map(c => [c, c])], T('ds.q.col'))}
      <input data-dsq="param" value="${esc(q.param || '')}" maxlength="200" placeholder="${esc(T('ds.q.param.ph'))}" aria-label="${esc(T('ds.q.param'))}" autocomplete="off" spellcheck="false">
      ${dsSel('data-dsq="severity"', q.severity || '', [['', '–'], ...DS_SEV.map(s => [s, sevLabel(s)])], T('ds.q.sev'))}
      <button type="button" class="adr-x" data-ds-qrm="${i}" title="${esc(T('ds.q.rm'))}" aria-label="${esc(T('ds.q.rm'))}">×</button></div>`).join('') || `<p class="raid-hint">${esc(T('ds.q.empty'))}</p>`}
      <div class="raid-row"><button type="button" class="btn small" data-ds-qadd="1">${esc(T('ds.q.add'))}</button></div>`;
  }
  function dsContract(ds) {
    const k = ds.contract;
    if (!k) return `<p class="raid-hint">${esc(T('ds.k.none'))}</p><div class="raid-row"><button type="button" class="btn small" data-ds-knew="1">${esc(T('ds.k.new'))}</button></div>`;
    const free = S.model.nodes.filter(n => !(k.consumers || []).includes(n.id)), name = id => S.model.nodes.find(n => n.id === id)?.label || id;
    return `<div class="raid-two"><label>${esc(T('ds.k.version'))}<input data-dsk="version" value="${esc(k.version)}" maxlength="20" autocomplete="off"></label><label>${esc(T('ds.k.status'))}${dsSel('data-dsk="status"', k.status, DS_STATUS.map(s => [s, T(`ds.cst.${s}`)]), T('ds.k.status'))}</label></div>
      <div class="raid-links-edit"><span>${esc(T('ds.k.consumers'))}</span>${(k.consumers || []).map(id => `<span class="raid-link"><button type="button" data-ds-focus="${esc(id)}" title="${esc(T('raid.go'))}">${esc(name(id))}</button><button type="button" class="raid-x" data-ds-krm="${esc(id)}" title="${esc(T('ds.k.rmCons'))}" aria-label="${esc(T('ds.k.rmCons'))}">×</button></span>`).join('')}
        ${free.length ? dsSel('data-ds-kadd="1"', '', [['', T('ds.k.addCons')], ...free.map(n => [n.id, n.label])], T('ds.k.addCons')) : ''}</div>
      <label>${esc(T('ds.k.terms'))}<textarea data-dsk="terms" rows="3" maxlength="2000" placeholder="${esc(T('ds.k.terms.ph'))}">${esc(k.terms || '')}</textarea></label>
      <div class="raid-row"><button type="button" class="btn small primary" data-ds-export="1">${esc(T('ds.k.export'))}</button><button type="button" class="btn small" data-ds-kdel="1">${esc(T('ds.k.del'))}</button></div>`;
  }
  function dsLineage(ds) {
    const f = dsFr(ds.name), es = dsEdges(S.model, ds.name), nm = id => S.model.nodes.find(n => n.id === id)?.label || id;
    if (!es.length) return `<p class="raid-hint">${esc(T('ds.l.none'))}</p>`;
    const hops = f.path.slice(1).map((b, i) => {
      const a = f.path[i], e = es.find(x => (x.from === a && x.to === b) || (x.both && x.from === b && x.to === a)), s = e?.latency ? parseDur(e.latency) : null;
      return `<span class="ds-hop${s == null ? ' unk' : ''}">${s == null ? '?' : esc(fmtDur(s))}</span><span class="ds-node">${esc(nm(b))}</span>`;
    }).join('');
    return `${f.path.length > 1 ? `<div class="raid-hint">${esc(T('ds.l.slowest'))}</div><div class="ds-path"><span class="ds-node">${esc(nm(f.path[0]))}</span>${hops}</div>` : `<p class="raid-hint">${esc(T('ds.l.nopath'))}</p>`}
      <div class="raid-row"><button type="button" class="btn small" data-ds-lin="1">${esc(T('ds.l.show'))}</button></div>`;
  }
  function dsCard(ds) {
    const on = DSX.open === ds.id, sec = (k, body, extra = '') => {
      const o = DSX.sec.has(dsSecKey(ds.id, k));
      return `<div class="ds-sec${o ? ' on' : ''}"><button type="button" class="ds-sec-h" data-ds-sec="${k}" aria-expanded="${o}"><span>${esc(T(`ds.sec.${k}`))}</span>${extra}</button>${o ? `<div class="ds-sec-b">${body}</div>` : ''}</div>`;
    };
    let form = '';
    if (on) {
      const shs = (S.model.stakeholders || []).filter(s => !s.inactive || s.id === ds.owner), isSh = shs.some(s => s.id === ds.owner), free = (!!ds.owner && !isSh) || DSX.free === ds.id;
      const phases = S.model.phases || [], fmts = dsHelpers().formats || DS_FORMATS, vol = ds.volume || {};
      const general = `<label>${esc(T('ds.f.desc'))}<textarea data-dsf="description" rows="3" maxlength="2000">${esc(ds.description || '')}</textarea></label>
        <div class="raid-two"><label>${esc(T('ds.f.domain'))}<input data-dsf="domain" list="ds-domains" value="${esc(ds.domain || '')}" maxlength="60" autocomplete="off"></label><label>${esc(T('ds.f.layer'))}${dsSel('data-dss="layer"', ds.layer || '', [['', '–'], ...Object.keys(DL).map(k => [k, layerInfo(k).label])], T('ds.f.layer'))}</label></div>
        <div class="raid-two"><label>${esc(T('ds.f.owner'))}${dsSel('data-ds-owner="1"', free ? '__free' : isSh ? ds.owner : '', [['', T('ds.f.owner.none')], ...shs.map(s => [s.id, s.name || s.id]), ['__free', T('ds.f.owner.free')]], T('ds.f.owner'))}${free ? `<input data-dsf="owner" value="${esc(isSh ? '' : ds.owner || '')}" maxlength="120" placeholder="${esc(T('ds.f.owner.ph'))}" aria-label="${esc(T('ds.f.owner'))}" autocomplete="off">` : ''}</label>
          <label>${esc(T('ds.f.steward'))}<input data-dsf="steward" value="${esc(ds.steward || '')}" maxlength="120" autocomplete="off"></label></div>
        <div class="raid-links-edit"><span>${esc(T('ds.f.classes'))}</span>${Object.keys(DATA).map(k => `<button type="button" class="fnd-chip${(ds.classes || []).includes(k) ? ' on' : ''}" data-ds-cls="${esc(k)}" aria-pressed="${(ds.classes || []).includes(k)}" style="--s:${colorVar(DATA[k].color) || 'var(--muted)'}">${esc(DATA[k].short || k)}</button>`).join('')}</div>
        <div class="raid-two"><label>${esc(T('ds.f.format'))}${dsSel('data-dss="format"', ds.format || '', [['', '–'], ...fmts.map(f => [f, f === 'other' ? T('ds.fmt.other') : f])], T('ds.f.format'))}</label>
          <label>${esc(T('ds.f.fresh'))}<input data-dsf="freshness" list="ds-dur" value="${esc(ds.freshness || '')}" placeholder="${esc(T('ds.f.fresh.ph'))}" autocomplete="off" spellcheck="false"></label></div>
        <span class="cost-hint">${esc(T('ds.f.fresh.hint'))}</span>
        <div class="raid-two"><label>${esc(T('ds.f.perDay'))}<input data-dsv="perDay" type="number" min="0" step="any" value="${vol.perDay ?? ''}"></label><label>${esc(T('ds.f.ret'))}<input data-dsv="retentionDays" type="number" min="0" step="1" value="${vol.retentionDays ?? ''}" placeholder="${DS_DEFAULT_DAYS}"></label></div>
        ${phases.length ? `<label>${esc(T('ds.f.phase'))}${dsSel('data-dss="phase"', ds.phase || '', [['', T('ds.f.phase.any')], ...phases.map(p => [p.id, p.name || p.id])], T('ds.f.phase'))}</label>` : ''}`;
      const n = (ds.schema || []).length, q = (ds.quality || []).length;
      form = `<div class="raid-form"><label>${esc(T('ds.f.name'))}<input data-ds-name="1" value="${esc(ds.name)}" maxlength="120" autocomplete="off" spellcheck="false"></label>
        ${sec('general', general)}${sec('schema', dsSchema(ds), n ? `<em>${n}</em>` : '')}${sec('quality', dsQuality(ds), q ? `<em>${q}</em>` : '')}${sec('contract', dsContract(ds), ds.contract ? `<em>${esc(ds.contract.version)} · ${esc(T(`ds.cst.${ds.contract.status}`))}</em>` : '')}${sec('lineage', dsLineage(ds))}
        <button class="btn small danger" data-ds-del="1">${esc(T('ds.del'))}</button></div>`;
    }
    return `<div class="raid ds-card${on ? ' on' : ''}" data-id="${esc(ds.id)}" style="--s:${ds.layer ? layerInfo(ds.layer).color : 'var(--muted)'}">${dsHead(ds, on)}${form}</div>`;
  }
  function renderDsList(cat) {
    const box = $('#ds-list');
    if (!box || !S.model) return;
    cat = cat || catalog(S.model);
    const keep = box.parentElement?.scrollTop || 0, decl = cat.filter(c => c.declared), und = cat.filter(c => !c.declared && (!DSX.q || c.name.toLowerCase().includes(DSX.q.toLowerCase()))), shown = decl.filter(c => dsMatch(c.ds));
    const domains = [...new Set(decl.map(c => c.ds.domain).filter(Boolean))];
    box.innerHTML = `<datalist id="ds-types">${DS_TYPES.map(t => `<option value="${t}"></option>`).join('')}</datalist><datalist id="ds-dur">${DUR_TIERS.map(v => `<option value="${v}"></option>`).join('')}</datalist><datalist id="ds-domains">${domains.map(d => `<option value="${esc(d)}"></option>`).join('')}</datalist>`
      + (!cat.length ? `<p class="fnd-empty">${esc(T('ds.empty'))}</p>` : (shown.length ? shown.map(c => dsCard(c.ds)).join('') : decl.length ? `<p class="fnd-empty">${esc(T('ds.noMatch'))} <button class="btn small" data-ds-clear="1">${esc(T('ver.f.clear'))}</button></p>` : ''))
      + (und.length ? `<div class="ds-undoc"><h4>${esc(T('ds.undoc'))} <small>${und.length}</small></h4><p class="raid-hint">${esc(T('ds.undoc.hint'))}</p>${und.map(c => `<div class="ds-und"><button type="button" class="ds-und-n" data-lin="${esc(c.name)}" title="${esc(T('lin.show', { name: c.name }))}">${esc(c.name)}</button><small>${esc(T('ds.undoc.n', c.edges))}</small><button type="button" class="btn small" data-ds-doc="${esc(c.name)}">${esc(T('ds.undoc.doc'))}</button></div>`).join('')}</div>` : '');
    if (box.parentElement) box.parentElement.scrollTop = keep;
  }
  function renderDs(force) {
    if (!dsPanel || !S.model || !$('.pane[data-pane="data"]')?.classList.contains('on')) return;
    const a = document.activeElement;
    if (!force && a && dsPanel.contains(a) && a.matches('input, textarea, select')) return;   // no pisar lo que se está escribiendo
    if (DSX.open && !dsById(DSX.open)) DSX.open = null;
    if (DSX.wide && !dsById(DSX.wide)) DSX.wide = null;
    dsMemo = new Map();
    const cat = catalog(S.model);
    renderDsBar(S.model.datasets || [], cat);
    renderDsList(cat);
    if (DSX.focus && force) { const f = $(DSX.focus, dsPanel); DSX.focus = ''; f?.focus(); if (f?.select) f.select(); }
  }
  // Abre una ficha (por id o nombre) en la pestaña Datos, quitando los filtros que la esconderían
  function dsOpen(v) {
    const ds = dsFind(v);
    if (!ds) return;
    DSX.open = ds.id; DSX.q = ''; DSX.domain = ''; DSX.layer = ''; DSX.prod = ''; DSX.cst = '';
    DSX.sec.add(dsSecKey(ds.id, 'general'));
    $('.tab[data-tab="data"]')?.click();   // el clic ya repinta la pestaña
    $(`#ds-list .ds-card[data-id="${CSS.escape(ds.id)}"]`)?.scrollIntoView({ block: 'start' });
    if (matchMedia('(max-width: 760px)').matches) $('#main').classList.add('open');
  }
  // Documenta un nombre que solo se usa en conexiones: crea el conjunto con la capa del destino de su primera conexión
  function dsDocument(name) {
    const have = dsFind(name);
    if (have) return dsOpen(have.id);
    const c = catalog(S.model).find(x => dsK(x.name) === dsK(name)), e = dsEdges(S.model, name)[0], to = e && S.model.nodes.find(n => n.id === e.to), ly = to ? layerOf(to).value : '';
    if ((S.model.datasets || []).length >= DS_MAX) return void toast(T('ds.max', DS_MAX));
    const id = addDataset({ name: c?.name || String(name), ...(ly ? { layer: ly } : {}) });
    if (id) dsOpen(id);
  }
  function dsNew() {
    if ((S.model.datasets || []).length >= DS_MAX) return void toast(T('ds.max', DS_MAX));
    let n = 1, name = T('ds.new.name');
    while ((S.model.datasets || []).some(d => dsK(d.name) === dsK(name))) name = `${T('ds.new.name')}_${++n}`;
    const id = addDataset({ name });
    if (id) { DSX.focus = '[data-ds-name]'; dsOpen(id); }
  }
  const dsRefreshHead = card => { const ds = card && dsById(card.dataset.id); if (!ds) return; dsMemo = new Map(); card.querySelector('.ds-top').outerHTML = dsHead(ds, DSX.open === ds.id); card.style.setProperty('--s', ds.layer ? layerInfo(ds.layer).color : 'var(--muted)'); };
  const dsList = (ds, key) => (ds[key] || []).map(x => ({ ...x }));   // copia editable del esquema o de las reglas; todo pasa por cleanCatalog en updateDataset
  dsPanel?.addEventListener('input', ev => {
    const f = ev.target;
    if (f.id === 'ds-q') { DSX.q = f.value; return renderDsList(); }
    if (f.dataset?.dsf === 'freshness') f.setAttribute('aria-invalid', !!f.value.trim() && normDur(f.value) == null);
  });
  // Un cambio de campo = un paso de historial (updateDataset); los textos se aplican al salir del campo o con Intro
  dsPanel?.addEventListener('change', ev => {
    const f = ev.target, d0 = f.dataset;
    if (f.id === 'ds-fdom') { DSX.domain = f.value; return renderDs(true); }
    if (f.id === 'ds-fcst') { DSX.cst = f.value; return renderDs(true); }
    const card = f.closest('.ds-card'), ds = card && dsById(card.dataset.id);
    if (!ds) return;
    const set = (patch, re) => { if (updateDataset(ds.id, patch)) { if (re) renderDs(true); else dsRefreshHead(card); } };
    if (d0.dsName != null) {
      const v = f.value.trim();
      if (!v || v === ds.name) { f.value = ds.name; return; }
      if (!renameDatasetApi(ds.id, v)) { toast(T('ds.rename.clash', v)); f.value = ds.name; return; }
      return renderDs(true);
    }
    if (d0.dsf) {
      let v = f.value;
      if (d0.dsf === 'freshness') { v = v.trim(); if (v) { const n = normDur(v); if (n == null) return; f.value = v = n; } }
      return set({ [d0.dsf]: v });
    }
    if (d0.dss) return set({ [d0.dss]: f.value }, true);
    if (d0.dsOwner != null) { DSX.free = f.value === '__free' ? ds.id : null; return f.value === '__free' ? renderDs(true) : set({ owner: f.value }, true); }
    if (d0.dsv) { const vol = { ...(ds.volume || {}) }; if (f.value === '') delete vol[d0.dsv]; else vol[d0.dsv] = +f.value; return set({ volume: vol }); }
    const row = f.closest('[data-i]'), i = row ? +row.dataset.i : -1;
    if (d0.dsc || d0.dsck) {
      const sc = dsList(ds, 'schema'), c = sc[i];
      if (!c) return;
      if (d0.dsc) { const v = f.value.trim(); if (d0.dsc === 'name' && !v) { f.value = c.name; return; } if (v) c[d0.dsc] = v; else delete c[d0.dsc]; }
      else c[d0.dsck] = f.checked;
      return set({ schema: sc }, d0.dsc === 'name');   // un nombre nuevo cambia las columnas que ofrecen las reglas
    }
    if (d0.dsq) {
      const q = dsList(ds, 'quality'), r = q[i];
      if (!r) return;
      if (f.value.trim()) r[d0.dsq] = f.value.trim(); else delete r[d0.dsq];
      return set({ quality: q }, f.tagName === 'SELECT' && d0.dsq === 'rule');
    }
    if (d0.dsk) return set({ contract: { ...ds.contract, [d0.dsk]: f.value } }, d0.dsk === 'status');
    if (d0.dsKadd != null && f.value) set({ contract: { ...ds.contract, consumers: [...(ds.contract.consumers || []), f.value] } }, true);
  });
  dsPanel?.addEventListener('click', async ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    const d0 = b.dataset, card = b.closest('.ds-card'), ds = card && dsById(card.dataset.id);
    if (d0.dsAdd) return dsNew();
    if (d0.dsLay != null) { DSX.layer = DSX.layer === d0.dsLay ? '' : d0.dsLay; return renderDs(true); }
    if (d0.dsProdf != null) { DSX.prod = DSX.prod === d0.dsProdf ? '' : d0.dsProdf; return renderDs(true); }
    if (d0.dsClear) { DSX.q = DSX.domain = DSX.layer = DSX.prod = DSX.cst = ''; return renderDs(true); }
    if (d0.dsDoc) return dsDocument(d0.dsDoc);
    if (d0.dsWide != null) { DSX.wide = DSX.wide ? null : card?.dataset.id || DSX.open; return renderDs(true); }
    if (d0.lin) return void showLineage(d0.lin);
    if (!ds) return;
    const set = (patch, re = true) => { if (updateDataset(ds.id, patch) && re) renderDs(true); };
    if (d0.dsToggle != null) { DSX.open = DSX.open === ds.id ? null : ds.id; DSX.wide = null; if (DSX.open) DSX.sec.add(dsSecKey(ds.id, 'general')); return renderDs(true); }
    if (d0.dsStar != null) return set({ product: !ds.product });
    if (d0.dsSec) { const k = dsSecKey(ds.id, d0.dsSec); if (!DSX.sec.delete(k)) DSX.sec.add(k); return renderDs(true); }
    if (d0.dsCls) { const cl = ds.classes || []; return set({ classes: cl.includes(d0.dsCls) ? cl.filter(x => x !== d0.dsCls) : [...cl, d0.dsCls] }); }
    if (d0.dsColadd != null) {
      const sc = dsList(ds, 'schema');
      if (sc.length >= DS_COLS) return void toast(T('ds.col.max', DS_COLS));
      let n = sc.length + 1, nm = `${T('ds.col.new')}_${n}`;
      while (sc.some(c => dsK(c.name) === dsK(nm))) nm = `${T('ds.col.new')}_${++n}`;
      DSX.focus = `.ds-card[data-id="${ds.id}"] tr[data-i="${sc.length}"] [data-dsc="name"]`;
      return set({ schema: [...sc, { name: nm }] });
    }
    for (const [a, fn] of [['dsColrm', (sc, i) => sc.splice(i, 1)], ['dsColup', (sc, i) => i > 0 && sc.splice(i - 1, 0, ...sc.splice(i, 1))], ['dsColdn', (sc, i) => i < sc.length - 1 && sc.splice(i + 1, 0, ...sc.splice(i, 1))]]) {
      if (d0[a] != null) { const sc = dsList(ds, 'schema'); fn(sc, +d0[a]); return set({ schema: sc }); }
    }
    if (d0.dsQadd != null) {
      const q = dsList(ds, 'quality');
      if (q.length >= DS_RULES_MAX) return void toast(T('ds.q.max', DS_RULES_MAX));
      const col = (ds.schema || []).find(c => c.key)?.name || (ds.schema || [])[0]?.name;
      return set({ quality: [...q, { rule: (dsHelpers().rules || DS_RULES)[0] || 'not_null', ...(col ? { column: col } : {}) }] });
    }
    if (d0.dsQrm != null) { const q = dsList(ds, 'quality'); q.splice(+d0.dsQrm, 1); return set({ quality: q }); }
    if (d0.dsKnew != null) return set({ contract: { version: '1.0.0', status: 'draft' } });
    if (d0.dsKdel != null) { if (!await confirmBox({ title: T('ds.k.cf.title', ds.id), text: T('ds.k.cf.text'), ok: T('ds.k.del'), cancel: T('ver.cf.cancel'), danger: true })) return; return set({ contract: null }); }
    if (d0.dsKrm) return set({ contract: { ...ds.contract, consumers: (ds.contract.consumers || []).filter(x => x !== d0.dsKrm) } });
    if (d0.dsFocus) return focusTarget('node', d0.dsFocus);
    if (d0.dsExport != null) return void exportContract(ds.id);
    if (d0.dsLin != null) return void showLineage(ds.name);
    if (d0.dsDel != null && await confirmBox({ title: T('ds.cf.title', ds.id), text: T('ds.cf.text', ds.name), ok: T('ds.del'), cancel: T('ver.cf.cancel'), danger: true })) { removeDataset(ds.id); renderDs(true); }
  });
  // Botones del inspector: abrir la ficha de un conjunto o documentarlo si no está declarado
  $('#inspector').addEventListener('click', ev => {
    const b = ev.target.closest('[data-ds-open], [data-ds-doc]');
    if (b) { if (b.dataset.dsOpen) dsOpen(b.dataset.dsOpen); else dsDocument(b.dataset.dsDoc); }
  });

  return { DSX, renderDs };
} };
