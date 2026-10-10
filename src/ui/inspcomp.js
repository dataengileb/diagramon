/* ==========================================================================
   Diagramon · interfaz: cumplimiento (inspector y matriz) y tipos de conexión propios
   --------------------------------------------------------------------------
   Movido desde src/app.js (v2), sin cambios de comportamiento.
   API: window.DiagramonUI.inspcomp
   ========================================================================== */
window.DiagramonUI = window.DiagramonUI || {};
// ctx: lo que esta pieza necesita de la app. Valores ya definidos al crearla pasan directos; el resto, como envolturas que se llaman al usarse.
window.DiagramonUI.inspcomp = { create(ctx) {
  'use strict';
  const C = window.DIAGRAMON_CONFIG;
  const I = window.DiagramonI18n, T = I.T, loc = I.loc;
  const { $, esc, store } = window.DiagramonCore.util;
  const { S } = window.DiagramonCore.state;
  const { toast } = window.DiagramonUI.dialogs;
  const { CTL_ALL, CTL_COLOR, CTL_STATUS, CTL_SYM, FWS, NS, changed, cleanDash, cmpFrameworks, cmpGroupName, cmpModel, colorVar, controlsOf, ctlInfo, ctlSplit, ctlSuggest, customTypes, edgeStyles, el, exportCompliance, groupById, inspector, pushHistory, renderInspector, resolveCtl, selTarget, sortCtl } = ctx;

  // Sección plegable «Cumplimiento» (nodos, grupos y varios a la vez): controles efectivos con su estado, buscador para añadir y sugerencias.
  // Estado por defecto al añadir: «Brecha» (no se da nada por cumplido hasta confirmarlo)
  const cmpField = (items, kind) => {
    if (!Object.keys(FWS).length) return '';
    const list = [].concat(items), one = list.length === 1 && list[0], effs = list.map(x => controlsOf(x));
    const keys = sortCtl([...new Set(effs.flatMap(e => [...e.keys()]))]), open = store.get(`govOpen.cmp-${kind}`, keys.length > 0);
    const rows = keys.map(k => {
      const c = ctlInfo(k), sts = effs.map(e => e.get(k)?.status), st = sts.every(s => s === sts[0]) ? sts[0] : null, have = sts.filter(Boolean).length;
      const own = list.some(x => x.controls?.[k]), from = one && effs[0].get(k)?.from, gl = from ? groupById(from)?.label || from : '';
      const note = [gl ? T('cmp.inh', gl) : '', have < list.length ? T('cmp.some', { a: have, b: list.length }) : '', st === null && have === list.length ? T('cmp.mixed') : ''].filter(Boolean).join(' · ');
      return `<div class="cmp-row${gl && !own ? ' inh' : ''}"><div class="cmp-top"><span class="cmp-fw">${esc(c.short)}</span><span class="cmp-id">${esc(c.id)}</span><span class="cmp-t" title="${esc(c.title)}">${esc(c.title)}</span>
        ${own ? `<button class="cmp-x" data-ctl-rm="${esc(k)}" title="${esc(T(from ? 'cmp.rmLocal' : 'cmp.rm'))}" aria-label="${esc(T(from ? 'cmp.rmLocal' : 'cmp.rm'))}">×</button>` : ''}</div>
        <div class="seg cmp-seg">${CTL_STATUS.map(s => `<button data-ctl="${esc(k)}" data-cst="${s}" class="cst-${s}${st === s ? ' on' : ''}" style="--cc:${CTL_COLOR[s]}"${gl && !own ? ` title="${esc(T('cmp.override'))}"` : ''}>${esc(T(`cmp.${s}`))}</button>`).join('')}</div>
        ${note ? `<span class="cost-hint">${esc(note)}</span>` : ''}</div>`;
    }).join('');
    const sug = ctlSuggest(list);
    return `<details class="gov-box cmp-box" data-gov-open="cmp-${kind}"${open ? ' open' : ''}><summary>${T('cmp.title')}${keys.length ? ` · ${keys.length}` : ''}</summary>
      ${rows || `<p class="cost-hint">${T('cmp.none')}</p>`}
      <label>${T('cmp.add')}<input id="ctl-add" list="dl-ctl" placeholder="${esc(T('cmp.add.ph'))}" autocomplete="off"><datalist id="dl-ctl">${CTL_ALL.map(k => { const c = ctlInfo(k); return `<option value="${esc(`${k} — ${c.title}`)}" label="${esc(`${c.short} · ${c.title}`)}"></option>`; }).join('')}</datalist></label>
      ${sug.length ? `<div class="cmp-sug"><span class="cost-hint" title="${esc(T('cmp.sugg.tip'))}">${T('cmp.sugg')}</span>${sug.map(k => { const c = ctlInfo(k); return `<button class="cmp-chip" data-ctl-add="${esc(k)}" title="${esc(`${c.title} · ${T('cmp.sugg.tip')}`)}">+ ${esc(c.short)} ${esc(c.id)}</button>`; }).join('')}</div>` : ''}
      <button class="btn small cmp-open" data-cmp="matrix">${T('cmp.matrix')}</button></details>`;
  };
  // Acciones del inspector (varios a la vez): estado de un control (crea un valor propio que sustituye al heredado), quitar el propio y añadir
  function ctlEdit(op, key, status) {
    const t = selTarget();
    if (!t) return;
    const list = [].concat(t);
    pushHistory();
    list.forEach(x => {
      if (op === 'set') (x.controls ||= {})[key] = status;
      else if (op === 'add') { if (!controlsOf(x).has(key)) (x.controls ||= {})[key] = 'gap'; }
      else if (op === 'rm' && x.controls) { delete x.controls[key]; if (!Object.keys(x.controls).length) delete x.controls; }
    });
    changed(true); renderInspector();
    if (op === 'add') $('#ctl-add')?.focus();
  }
  function ctlAddFromInput(inp) {
    const v = inp.value.trim();
    if (!v) return;
    const k = resolveCtl(v);
    if (!k) return toast(T('cmp.unknown'), 3200);
    ctlEdit('add', k);
  }
  inspector.addEventListener('keydown', ev => { if (ev.target.id === 'ctl-add' && ev.key === 'Enter') { ev.preventDefault(); ctlAddFromInput(ev.target); } });
  inspector.addEventListener('change', ev => { if (ev.target.id === 'ctl-add') ctlAddFromInput(ev.target); });
  // Elegir una opción de la lista lanza `input` sin texto escrito (insertReplacementText o sin inputType)
  inspector.addEventListener('input', ev => { if (ev.target.id === 'ctl-add' && (!ev.inputType || ev.inputType === 'insertReplacementText') && ev.target.value.includes(' — ')) ctlAddFromInput(ev.target); });

  // Matriz: filas = componentes (con controles o datos sensibles), columnas = controles en uso agrupados por marco
  function openCompMatrix() {
    const prev = document.activeElement, back = document.createElement('div'), id = `cm${Date.now()}`;
    let fw = '';
    back.className = 'cf-back';
    back.innerHTML = `<div class="cf cm" role="dialog" aria-modal="true" aria-labelledby="${id}t">
      <div class="cm-head"><h3 id="${id}t">${esc(T('cmp.matrix'))}</h3>
        <label class="cm-fw">${esc(T('cmp.mx.fw'))}<select data-cm="fw"></select></label>
        <span class="cm-btns"><button class="btn small" data-cm="csv">${esc(T('cmp.mx.csv'))}</button><button class="btn small" data-cm="long">${esc(T('cmp.mx.csvLong'))}</button><button class="btn small" data-cm="close">${esc(T('cmp.mx.close'))}</button></span></div>
      <div class="cm-sum"></div><div class="cm-scroll"></div><p class="cm-note">${esc(T('cmp.mx.note'))}</p></div>`;
    const sel = back.querySelector('[data-cm="fw"]'), sum = back.querySelector('.cm-sum'), box = back.querySelector('.cm-scroll');
    const draw = () => {
      const all = cmpModel(S.model), fws = cmpFrameworks(all.keys);
      if (fw && !fws.includes(fw)) fw = '';
      sel.innerHTML = `<option value="">${esc(T('cmp.mx.all'))}</option>${fws.map(f => `<option value="${esc(f)}"${f === fw ? ' selected' : ''}>${esc(ctlInfo(`${f}:x`).short)}</option>`).join('')}`;
      const { rows, keys, stats } = fw ? cmpModel(S.model, fw) : all;
      if (!keys.length) { sum.innerHTML = ''; box.innerHTML = `<p class="cm-empty">${esc(T('cmp.mx.empty'))}</p>`; return; }
      const tot = f => keys.filter(k => ctlSplit(k)[0] === f).reduce((a, k) => { const s = stats.get(k); CTL_STATUS.concat('unmapped').forEach(x => { a[x] += s[x]; }); return a; }, { met: 0, partial: 0, gap: 0, na: 0, unmapped: 0 });
      sum.innerHTML = cmpFrameworks(keys).map(f => { const t = tot(f); return `<div class="cm-card"><b>${esc(ctlInfo(`${f}:x`).short)}</b>${[...CTL_STATUS.slice(0, 3), 'unmapped'].map(s => `<span class="cm-n cst-${s}" style="--cc:${CTL_COLOR[s] || 'var(--border)'}" title="${esc(T(`cmp.${s}`))}"><i>${s === 'unmapped' ? '○' : CTL_SYM[s]}</i>${t[s]}</span>`).join('')}</div>`; }).join('');
      const fwRow = cmpFrameworks(keys).map(f => `<th colspan="${keys.filter(k => ctlSplit(k)[0] === f).length}" class="cm-fwh">${esc(ctlInfo(`${f}:x`).short)}</th>`).join('');
      const head = keys.map(k => { const c = ctlInfo(k); return `<th class="cm-ch" title="${esc(`${c.short} ${c.id}${c.title ? ` — ${c.title}` : ''}`)}"><b>${esc(c.id)}</b><span>${esc(c.title)}</span></th>`; }).join('');
      const body = rows.map(r => `<tr><th class="cm-rh" title="${esc(`${r.n.label}${cmpGroupName(r.n) ? ` · ${cmpGroupName(r.n)}` : ''}`)}">${esc(r.n.label)}${cmpGroupName(r.n) ? `<small>${esc(cmpGroupName(r.n))}</small>` : ''}</th>${keys.map(k => {
        const e = r.eff.get(k), c = ctlInfo(k);
        return e ? `<td class="cm-c cst-${e.status}" style="--cc:${CTL_COLOR[e.status]}" title="${esc(`${r.n.label} · ${c.short} ${c.id}: ${T(`cmp.${e.status}`)}${e.from ? ` (${T('cmp.inh', groupById(e.from)?.label || e.from)})` : ''}`)}">${CTL_SYM[e.status]}</td>` : '<td class="cm-c"></td>';
      }).join('')}</tr>`).join('');
      const cov = keys.map(k => { const s = stats.get(k), d = rows.length - s.na; return `<td class="cm-cov" title="${esc(`${T('cmp.met')} ${s.met} · ${T('cmp.partial')} ${s.partial} · ${T('cmp.gap')} ${s.gap} · ${T('cmp.na')} ${s.na} · ${T('cmp.mx.unmapped')} ${s.unmapped}`)}">${d > 0 ? Math.round(s.met / d * 100) + '%' : '—'}</td>`; }).join('');
      box.innerHTML = `<table class="cm-table"><thead><tr><th class="cm-rh cm-corner" rowspan="2">${esc(T('cmp.csv.comp'))}</th>${fwRow}</tr><tr>${head}</tr></thead><tbody>${body}</tbody><tfoot><tr><th class="cm-rh">${esc(T('cmp.mx.cov'))}</th>${cov}</tr></tfoot></table>`;
    };
    const close = () => { document.removeEventListener('keydown', key, true); back.remove(); prev?.focus?.(); };
    const key = ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); } };
    sel.addEventListener('change', () => { fw = sel.value; draw(); });
    back.addEventListener('mousedown', ev => { if (ev.target === back) close(); });
    back.addEventListener('click', ev => {
      const b = ev.target.closest('[data-cm]');
      if (!b || b.dataset.cm === 'fw') return;
      if (b.dataset.cm === 'close') close(); else exportCompliance(b.dataset.cm === 'long' ? 'long' : 'wide', fw);
    });
    document.addEventListener('keydown', key, true);
    draw();
    document.body.appendChild(back);
    back.querySelector('[data-cm="close"]').focus();
  }

  /* ---------- tipos de conexión propios: opciones del inspector y gestor (model.edgeTypes) ---------- */
  function edgeStyleOptions(cur) {
    const ES = edgeStyles(), opt = k => `<option value="${esc(k)}"${k === cur ? ' selected' : ''}>${esc(loc(ES[k].label))}</option>`;
    const mine = customTypes().map(t => t.id);
    return Object.keys(C.edgeStyles).map(opt).join('') + (mine.length ? `<optgroup label="${esc(T('et.custom'))}">${mine.map(opt).join('')}</optgroup>` : '') + `<option value="__newtype">${esc(T('et.new'))}</option>`;
  }
  // Clave a partir del nombre: minúsculas sin acentos, a-z 0-9 y guiones; única entre los tipos de config.js y los del diagrama
  function edgeTypeId(label) {
    const base = (String(label).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'tipo');
    let id = base, n = 2;
    while (Object.hasOwn(C.edgeStyles, id) || customTypes().some(t => t.id === id)) id = `${base}-${n++}`;
    return id;
  }
  // Línea de muestra (SVG) de un tipo: patrón, grosor y color ya validados
  function edgeSample(t, w = 56) {
    const sv = document.createElementNS(NS, 'svg');
    sv.setAttribute('viewBox', `0 0 ${w} 14`); sv.setAttribute('width', w); sv.setAttribute('height', 14); sv.setAttribute('class', 'et-sample');
    const dash = cleanDash(t.dash), c = (t.color && colorVar(t.color)) || 'var(--muted)';
    const ln = el('path', { d: `M2,7 L${w - 12},7`, fill: 'none', 'stroke-linecap': 'round', 'stroke-width': Math.min(4, Math.max(1, +t.width || 1.8)), ...(dash ? { 'stroke-dasharray': dash } : {}) }, sv);
    ln.style.stroke = c;
    el('path', { d: `M${w - 2},7 L${w - 10},3 L${w - 10},11 Z` }, sv).style.fill = c;
    return sv;
  }

  return { cmpField, ctlEdit, edgeSample, edgeStyleOptions, edgeTypeId, openCompMatrix };
} };
