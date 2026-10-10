/* ==========================================================================
   Diagramon · interfaz: espacio de trabajo (carpeta con varios diagramas) y diseño frente a realidad
   --------------------------------------------------------------------------
   Movido desde src/app.js (v2), sin cambios de comportamiento.
   API: window.DiagramonUI.workspaceui
   ========================================================================== */
window.DiagramonUI = window.DiagramonUI || {};
// ctx: lo que esta pieza necesita de la app. Valores ya definidos al crearla pasan directos; el resto, como envolturas que se llaman al usarse.
window.DiagramonUI.workspaceui = { create(ctx) {
  'use strict';
  const I = window.DiagramonI18n, T = I.T;
  const { $, esc, fold } = window.DiagramonCore.util;
  const { S } = window.DiagramonCore.state;
  const { confirmBox, toast } = window.DiagramonUI.dialogs;
  const { addFindingSource, adrAuthor, changed, cleanCatalog, cleanDecisions, cleanRegion, cleanStakeholders, download, dsHelpers, dsKey, fmtDay, govOf, hasCost, migrate, monthlyTotal, normalize, pushHistory, refreshFindings, renderInspector, round2, serialize, setModel, snapshot, today, findingsOf, renderAdr, renderPeople } = ctx;

  // WS.dir = { name, handle } (handle = null si la carpeta se leyó con <input webkitdirectory>: solo lectura); WS.index = resultado de scan();
  // WS.read(nombre) → texto; WS.base = snapshot() del diagrama al abrirlo o guardarlo desde la carpeta (si cambió, abrir otro pide confirmar)
  const WS = { dir: null, index: null, read: null, base: null, file: '', view: 'list' };   // view: 'list' | 'map'
  const wsLib = () => window.DiagramonWorkspace;
  function ensureDocId() { const L = wsLib(); if (L && !S.model.docId) S.model.docId = L.newDocId(); return S.model.docId || ''; }
  const wsWritable = () => !!WS.dir?.handle;
  const wsShared = () => WS.index?.manifest?.shared || {};
  // Cada diagrama sigue siendo autónomo: lo compartido se añade al diagrama abierto (los ids los asigna el diagrama) y se publica desde él
  const WS_LISTS = {   // cómo se lee y se cambia cada lista en el diagrama abierto
    stakeholders: { get: () => S.model.stakeholders || [], clean: raw => cleanStakeholders(raw, S.model), set: l => { if (l.length) S.model.stakeholders = l; else delete S.model.stakeholders; } },
    decisions: { get: () => S.model.decisions || [], clean: raw => cleanDecisions(raw, S.model), set: l => { S.model.decisions = l; } },
    datasets: { get: () => S.model.datasets || [], clean: raw => cleanCatalog(raw, S.model, dsHelpers()), set: l => { if (l.length) S.model.datasets = l; else delete S.model.datasets; } }
  };
  function wsShareAdd() {
    const L = wsLib(), shared = wsShared(), res = {}, plan = [];
    L.SHARED_KINDS.forEach(kind => {
      const cur = WS_LISTS[kind].get(), m = L.mergeShared(kind, cur, shared), list = WS_LISTS[kind].clean(m.list);
      res[kind] = Math.max(0, list.length - cur.length);
      if (res[kind]) plan.push([kind, list, cur.length]);
    });
    if (!plan.length) return toast(T('ws.sh.nothing'), 2600);
    pushHistory();
    plan.forEach(([kind, list, n0]) => {
      if (kind === 'decisions') { const by = adrAuthor(); list.slice(n0).forEach(nd => { nd.history = [{ status: nd.status, date: nd.date, ...(by ? { by } : {}) }]; }); }   // alta = primera entrada del historial
      WS_LISTS[kind].set(list);
    });
    changed(true); renderInspector();
    if (typeof renderAdr === 'function') renderAdr(true);
    if (typeof renderPeople === 'function') renderPeople(true);
    toast(T('ws.sh.added', res), 3600);
    wsRender();
  }
  async function wsShareOut() {
    const L = wsLib(), msg = $('#ws-msg'), kinds = [...document.querySelectorAll('#ws-dialog input[name="wssh"]:checked')].map(i => i.value).filter(k => L.SHARED_KINDS.includes(k));
    if (!wsWritable() || !kinds.length) return;
    if (msg) msg.textContent = '';
    try {
      let raw = {};
      try { const t = await (await (await WS.dir.handle.getFileHandle(L.MANIFEST)).getFile()).text(); const o = JSON.parse(t); if (o && typeof o === 'object' && !Array.isArray(o)) raw = o; } catch { /* sin manifiesto (o ilegible): se crea uno */ }
      const shared = L.cleanShared(raw.shared), res = {};
      kinds.forEach(kind => { const r = L.shareOut(kind, shared, WS_LISTS[kind].get()); res[kind] = r.added + r.updated; if (r.list.length) shared[kind] = r.list; });
      const w = await (await WS.dir.handle.getFileHandle(L.MANIFEST, { create: true })).createWritable();
      await w.write(`${JSON.stringify({ ...raw, shared }, null, 2)}\n`);
      await w.close();
      await wsRefresh();
      toast(T('ws.sh.shared', res), 3600);
    } catch { if (msg) msg.textContent = T('ws.err.save'); }
    wsRender();
  }
  const wsLiveLinks = () => wsLib().summarize({ nodes: S.model.nodes }, '').links;
  const wsLineage = () => (WS.index && S.model.docId ? wsLib().lineage(WS.index.diagrams, { docId: S.model.docId, title: S.model.title, flows: wsLib().flowsOf(S.model) }) : null);
  // Hallazgo bajo: un componente apunta a un diagrama que no está en la carpeta abierta (solo mientras hay una carpeta abierta)
  addFindingSource('workspace', m => {
    if (!WS.index) return [];
    const ids = new Set([...WS.index.diagrams.map(d => d.docId).filter(Boolean), m.docId].filter(Boolean));
    const out = m.nodes.filter(n => n.ref && !ids.has(n.ref.doc)).map(n => ({ id: `workspace:ref-missing:node:${n.id}`, source: 'workspace', rule: 'ws.ref-missing', severity: 'low', target: { kind: 'node', id: n.id }, title: T('ws.f.missing.t', n.label), fix: T('ws.f.missing.fix') }));
    const lin = m === S.model ? wsLineage() : null, title = id => WS.index.diagrams.find(d => d.docId === id)?.title || id;   // el linaje es del diagrama abierto
    (lin ? lin.issues : []).forEach(x => {
      if (x.kind === 'multi' ? !x.docs.includes(m.docId) : x.docId !== m.docId) return;
      const e = (m.edges || []).find(e => (e.datasets || []).some(d => dsKey(d) === dsKey(x.ds)));
      out.push({ id: `workspace:ds-${x.kind}:${dsKey(x.ds)}:${x.node || ''}`, source: 'workspace', rule: `ws.ds-${x.kind}`, severity: 'low', target: x.node ? { kind: 'node', id: x.node } : e ? { kind: 'edge', id: e.id } : { kind: 'node', id: '' },
        title: T(`ws.f.${x.kind}.t`, { ds: x.ds, node: x.label, to: title(x.to), others: (x.docs || []).filter(d => d !== m.docId).map(title).join(', ') }), fix: T(`ws.f.${x.kind}.fix`) });
    });
    return out;
  });
  async function wsFromHandle(handle) {
    const L = wsLib(), files = [];
    for await (const [name, h] of handle.entries()) {
      if (h.kind !== 'file' || !(name === L.MANIFEST || /\.json$/i.test(name))) continue;
      const f = await h.getFile();
      files.push({ name, size: f.size, text: f.size > L.MAX_BYTES ? '' : await f.text() });
    }
    return files;
  }
  const wsFromInput = async fileList => {   // solo los archivos de la carpeta elegida, sin subcarpetas
    const L = wsLib(), byName = new Map(), files = [];
    for (const f of [...fileList]) {
      const parts = String(f.webkitRelativePath || '').split('/');
      if (parts.length !== 2 || !(parts[1] === L.MANIFEST || /\.json$/i.test(parts[1]))) continue;
      byName.set(parts[1], f);
      files.push({ name: parts[1], size: f.size, text: f.size > L.MAX_BYTES ? '' : await f.text() });
    }
    return { files, byName, folder: String(fileList[0]?.webkitRelativePath || '').split('/')[0] };
  };
  async function wsRefresh() {
    const L = wsLib();
    const files = await wsFromHandle(WS.dir.handle);
    WS.index = L.scan(files);
    WS.read = async name => (await (await WS.dir.handle.getFileHandle(name)).getFile()).text();
  }
  async function wsPick() {
    try {
      if (typeof window.showDirectoryPicker === 'function') {
        const h = await window.showDirectoryPicker({ mode: 'readwrite', id: 'diagramon-workspace' });
        WS.dir = { name: h.name, handle: h };
        await wsRefresh();
        wsRender();
      } else $('#ws-dir').click();
    } catch (e) { if (e?.name !== 'AbortError') { const m = $('#ws-msg'); if (m) m.textContent = T('ws.err.pick'); } }
  }
  $('#ws-dir').addEventListener('change', async ev => {
    const list = [...ev.target.files]; ev.target.value = '';
    if (!list.length) return;
    const r = await wsFromInput(list);
    WS.dir = { name: r.folder, handle: null };
    WS.index = wsLib().scan(r.files);
    WS.read = async name => (r.byName.get(name) ? r.byName.get(name).text() : '');
    wsRender();
  });
  async function wsOpen(name) {
    const L = wsLib(), msg = $('#ws-msg');
    if (msg) msg.textContent = '';
    if (WS.base !== snapshot() && !(await confirmBox({ title: T('ws.cf.title'), text: T('ws.cf.text'), ok: T('ws.cf.ok'), cancel: T('ver.cf.cancel') }))) return;
    let raw = null;
    try { raw = JSON.parse(await WS.read(name)); } catch { /* ilegible */ }
    if (!L.isDiagram(raw)) { if (msg) msg.textContent = T('ws.err.read', name); return; }
    S.sel = null;
    setModel(raw, { history: true, animate: true, fit: true });
    WS.base = snapshot(); WS.file = name;
    toast(T('ws.opened', S.model.title));
    wsRender();
  }
  async function wsSave() {
    const L = wsLib(), msg = $('#ws-msg');
    if (!wsWritable()) return;
    if (msg) msg.textContent = '';
    try {
      const id = ensureDocId(), ix = WS.index.diagrams, hit = ix.find(x => x.docId === id && !x.dupDocId) || (WS.file && ix.find(x => x.name === WS.file && !x.docId));   // mismo docId, o el archivo sin docId del que se abrió
      const name = hit ? hit.name : L.fileNameFor(S.model.title, [...ix, ...WS.index.skipped].map(x => x.name));
      if (hit && !(await confirmBox({ title: T('ws.cf.overTitle', name), text: T('ws.cf.overText'), ok: T('ws.cf.overOk'), cancel: T('ver.cf.cancel') }))) return;
      const w = await (await WS.dir.handle.getFileHandle(name, { create: true })).createWritable();
      await w.write(serialize(S.model, true));
      await w.close();
      WS.base = snapshot(); WS.file = name;
      await wsRefresh();
      toast(T('ws.saved', name));
    } catch { if (msg) msg.textContent = T('ws.err.save'); }
    wsRender();
  }
  const wsTrim = (t, n) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
  // Mapa de sistemas: una caja por diagrama con id y una flecha por cada enlace de componente; clic o Enter abre el diagrama
  function wsMapHtml() {
    const L = wsLib(), cur = S.model.docId || '', ix = WS.index;
    const map = L.systemsMap(ix.diagrams, cur ? { docId: cur, title: S.model.title, nodes: S.model.nodes.length, links: wsLiveLinks() } : null);
    const title = id => map.nodes.find(n => n.docId === id)?.title || ix.diagrams.find(d => d.docId === id)?.title || id;
    const notes = [map.unlinkable ? `<p class="ws-dir">${esc(T('ws.map.unlinkable', map.unlinkable))}</p>` : '', ...map.missing.map(x => `<p class="ws-dir"><span class="ws-warn">⚠</span> ${esc(T('ws.map.missing', { from: title(x.from), via: x.via.join(', ') }))}</p>`)].join('');
    if (!map.nodes.length) return `<p class="ws-dir">${esc(T('ws.map.empty'))}</p>${notes}`;
    const g = L.layoutMap(map), byId = new Map(map.nodes.map(n => [n.docId, n]));
    const arrows = g.arrows.map(a => {
      const dx = a.same ? 36 + (a.from < a.to ? 0 : 14) : Math.max(24, Math.abs(a.x2 - a.x1) / 2);
      const d = a.same ? `M${a.x1} ${a.y1} C${a.x1 + dx} ${a.y1} ${a.x2 + dx} ${a.y2} ${a.x2} ${a.y2}` : `M${a.x1} ${a.y1} C${a.x1 + (a.x2 > a.x1 ? dx : -dx)} ${a.y1} ${a.x2 + (a.x2 > a.x1 ? -dx : dx)} ${a.y2} ${a.x2} ${a.y2}`;
      return `<path class="ws-arrow" d="${d}" marker-end="url(#ws-arr)"><title>${esc(`${title(a.from)} → ${title(a.to)}: ${a.via.join(', ')}`)}</title></path>`;
    }).join('');
    const boxes = g.boxes.map(b => {
      const n = byId.get(b.docId);
      return `<g class="ws-box${b.docId === cur ? ' cur' : ''}" data-ws-doc="${esc(b.docId)}" tabindex="0" role="button" aria-label="${esc(`${T('ws.open')}: ${n.title}`)}"><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="10"/><text x="${b.x + 12}" y="${b.y + 24}" class="ws-bt">${esc(wsTrim(n.title, 26))}</text><text x="${b.x + 12}" y="${b.y + 42}" class="ws-bs">${esc(T('ws.map.sub', { n: n.nodes, unsaved: n.unsaved }))}</text></g>`;
    }).join('');
    return `<p class="ws-dir">${esc(T('ws.map.hint'))}</p><svg class="ws-map" viewBox="0 0 ${g.width} ${g.height}" width="${g.width}" role="group" aria-label="${esc(T('ws.map.aria'))}"><defs><marker id="ws-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z"/></marker></defs>${arrows}${boxes}</svg>${notes}`;
  }
  // Linaje entre diagramas: los conjuntos de datos que aparecen en más de un diagrama, quién los produce y quién los consume
  function wsLineageHtml() {
    const L = wsLib(), cur = S.model.docId || '', ix = WS.index;
    const lin = L.lineage(ix.diagrams, cur ? { docId: cur, title: S.model.title, flows: L.flowsOf(S.model) } : null);
    const title = id => ix.diagrams.find(d => d.docId === id)?.title || (id === cur ? S.model.title : id);
    const role = u => `<li><span>${esc(u.title)}</span> <small>${esc(T(u.produces ? 'ws.lin.produces' : 'ws.lin.consumes'))}</small></li>`;
    const rows = lin.datasets.map(r => `<tr><th scope="row">${esc(r.name)}</th><td><ul class="ws-lin">${r.uses.slice().sort((a, b) => b.produces - a.produces).map(role).join('')}</ul></td></tr>`).join('');
    const issues = lin.issues.map(x => `<p class="ws-dir"><span class="ws-warn">⚠</span> ${esc(T(`ws.f.${x.kind}.t`, { ds: x.ds, node: x.label, to: title(x.to), others: (x.docs || []).map(title).join(', ') }))} <small>(${esc(title(x.docId))})</small></p>`).join('');
    return `<p class="ws-dir">${esc(T('ws.lin.hint'))}</p>${rows ? `<table class="ws-lint"><thead><tr><th>${esc(T('ws.lin.ds'))}</th><th>${esc(T('ws.lin.in'))}</th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="ws-dir">${esc(T('ws.lin.empty'))}</p>`}${issues}${cur ? '' : `<p class="ws-dir">${esc(T('ws.lin.unsaved'))}</p>`}`;
  }
  // Cartera: un Excel con una fila por diagrama de la carpeta y otra hoja con los conjuntos de datos compartidos; el diagrama abierto se lee de pantalla, los demás de su archivo
  async function wsPortfolio() {
    const L = wsLib(), X = window.DiagramonXlsx, msg = $('#ws-msg'), ix = WS.index, cur = S.model.docId || '', bad = [], rows = [];
    if (msg) msg.textContent = '';
    try {
      if (!X || !ix) throw new Error('no workspace');
      for (const d of ix.diagrams) {
        let m = S.model;
        if (!((cur && d.docId === cur && !d.dupDocId) || d.name === WS.file)) {
          try { m = normalize(migrate(JSON.parse(await WS.read(d.name))).raw); } catch { bad.push(d.name); continue; }
        }
        const f = { high: 0, medium: 0, low: 0 };
        findingsOf(m).filter(x => !x.dismissed).forEach(x => { f[x.severity === 'critical' || x.severity === 'high' ? 'high' : x.severity === 'medium' ? 'medium' : 'low']++; });
        rows.push([m.title, d.name, m.nodes.length, m.edges.length, (m.phases || []).length, m.nodes.some(hasCost) ? round2(monthlyTotal(m.nodes)) : '', f.high, f.medium, f.low,
          (m.decisions || []).length, (m.stakeholders || []).length, (m.datasets || []).length, new Set(m.nodes.filter(n => n.ref).map(n => n.ref.doc)).size]);
      }
      const lin = L.lineage(ix.diagrams, cur ? { docId: cur, title: S.model.title, flows: L.flowsOf(S.model) } : null), dsRows = [];
      lin.datasets.forEach(r => r.uses.forEach(u => dsRows.push([r.name, u.title, T(u.produces ? 'ws.lin.produces' : 'ws.lin.consumes')])));
      const cols = [['title'], ['file'], ['nodes', 'int'], ['edges', 'int'], ['phases', 'int'], ['cost', 'money'], ['high', 'int'], ['medium', 'int'], ['low', 'int'], ['decisions', 'int'], ['stakeholders', 'int'], ['datasets', 'int'], ['links', 'int']];
      const sheets = [{ name: T('ws.pf.sheet.diagrams'), head: cols.map(([k]) => T(`ws.pf.c.${k}`)), rows, fmt: cols.map(([, f]) => f || null) }];
      if (dsRows.length) sheets.push({ name: T('ws.pf.sheet.datasets'), head: [T('ws.lin.ds'), T('ws.pf.c.title'), T('ws.pf.c.role')], rows: dsRows, fmt: [null, null, null] });
      const slug = fold(ix.manifest?.name || WS.dir.name || '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace';
      download(X.blob(sheets, { title: `${ix.manifest?.name || WS.dir.name} · ${T('ws.pf.title')}`, creator: 'Diagramon' }), `${slug}-portfolio.xlsx`, X.MIME);
      toast(bad.length ? T('ws.pf.partial', { n: rows.length, bad: bad.length }) : T('toast.exported', { name: T('ws.pf.title') }));
    } catch (e) { console.error(e); if (msg) msg.textContent = T('toast.exportFail'); }
  }
  function wsRender() {
    const box = $('#ws-body');
    if (!box) return;
    const L = wsLib(), d = WS.dir, ix = WS.index, cur = S.model.docId || '';
    $('#ws-save').hidden = !wsWritable();
    $('#ws-refresh').hidden = !wsWritable();
    $('#ws-tab-list').setAttribute('aria-pressed', String(WS.view === 'list'));
    $('#ws-tab-map').setAttribute('aria-pressed', String(WS.view === 'map'));
    $('#ws-tab-lineage').setAttribute('aria-pressed', String(WS.view === 'lineage'));
    $('#ws-tabs').hidden = !d || !ix;
    $('#ws-portfolio').hidden = !d || !ix || !ix.diagrams.length;
    if (!d || !ix) { box.innerHTML = `<p class="ws-dir">${esc(T('ws.none'))}</p>`; return; }
    if (WS.view === 'map') { box.innerHTML = wsMapHtml(); return; }
    if (WS.view === 'lineage') { box.innerHTML = wsLineageHtml(); return; }
    const rows = ix.diagrams.map(x => {
      const here = (cur && x.docId === cur && !x.dupDocId) || x.name === WS.file;
      return `<li${here ? ' class="cur"' : ''}><div class="ws-t"><b>${esc(x.title)}</b><small>${esc(T('ws.meta', x))}${x.dupDocId ? ` · <span class="ws-warn">${esc(T('ws.dup'))}</span>` : ''}</small></div>${here ? `<span class="ws-chip">${esc(T('ws.current'))}</span>` : ''}<button type="button" class="btn small" data-ws-open="${esc(x.name)}">${esc(T('ws.open'))}</button></li>`;
    }).join('');
    const sh = wsShared(), cnt = k => (sh[k] || []).length, mine = k => WS_LISTS[k].get().length;
    const shared = `<fieldset class="sh-views ws-shared"><legend>${esc(T('ws.sh.title'))}</legend><p class="ws-dir">${esc(T('ws.sh.sum', { s: cnt('stakeholders'), d: cnt('decisions'), t: cnt('datasets') }))}</p>
      <div class="ws-bar"><button type="button" class="btn" id="ws-sh-add"${L.SHARED_KINDS.some(k => cnt(k)) ? '' : ' disabled'}>${esc(T('ws.sh.add'))}</button></div>${wsWritable() ? `<div class="ws-bar">${L.SHARED_KINDS.map(k => `<label class="sh-chk"><input type="checkbox" name="wssh" value="${k}"${mine(k) ? ' checked' : ' disabled'}>${esc(T(`ws.sh.k.${k}`, mine(k)))}</label>`).join('')}<button type="button" class="btn" id="ws-sh-out">${esc(T('ws.sh.out'))}</button></div>` : ''}</fieldset>`;
    box.innerHTML = `<p class="ws-dir">${esc(T('ws.dir', { folder: ix.manifest?.name || d.name, n: ix.diagrams.length, ro: !wsWritable() }))}${ix.skipped.length ? ` · ${esc(T('ws.skipped', ix.skipped.length))}` : ''}</p>${rows ? `<ul class="ws-list">${rows}</ul>` : `<p class="ws-dir">${esc(T('ws.empty'))}</p>`}${shared}`;
  }
  function openWorkspaceDialog() {
    if (ctx.P || $('#ws-dialog')) return;
    const prev = document.activeElement, id = `ws${Date.now()}`;
    const back = document.createElement('div');
    back.className = 'cf-back'; back.id = 'ws-dialog';
    back.innerHTML = `<form class="cf share rep ws" role="dialog" aria-modal="true" aria-labelledby="${id}t" autocomplete="off">
      <h3 id="${id}t">${esc(T('ws.title'))}</h3>
      <p>${esc(T('ws.lead'))}</p>
      <div class="ws-bar"><button type="button" class="btn" id="ws-pick">${esc(T('ws.pick'))}</button><button type="button" class="btn" id="ws-refresh" hidden>${esc(T('ws.refresh'))}</button><button type="button" class="btn" id="ws-save" hidden>${esc(T('ws.save'))}</button><button type="button" class="btn" id="ws-portfolio" hidden>${esc(T('ws.pf.btn'))}</button></div>
      <div class="ws-bar" id="ws-tabs" hidden><button type="button" class="btn" id="ws-tab-list" aria-pressed="true">${esc(T('ws.tab.list'))}</button><button type="button" class="btn" id="ws-tab-map" aria-pressed="false">${esc(T('ws.tab.map'))}</button><button type="button" class="btn" id="ws-tab-lineage" aria-pressed="false">${esc(T('ws.tab.lineage'))}</button></div>
      <div id="ws-body"></div>
      <p class="sh-err" role="alert" id="ws-msg"></p>
      <div class="cf-actions"><button type="button" class="btn" id="ws-close">${esc(T('ws.close'))}</button></div>
    </form>`;
    const close = () => { document.removeEventListener('keydown', key, true); back.remove(); prev?.focus?.(); };
    const key = ev => { if (ev.key === 'Escape' && !document.querySelector('.cf-back:not(#ws-dialog)')) { ev.preventDefault(); ev.stopPropagation(); close(); } };
    back.addEventListener('mousedown', ev => { if (ev.target === back) close(); });
    back.addEventListener('click', async ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.id === 'ws-close') close();
      else if (b.id === 'ws-pick') wsPick();
      else if (b.id === 'ws-refresh') { try { await wsRefresh(); } catch { $('#ws-msg').textContent = T('ws.err.pick'); } wsRender(); }
      else if (b.id === 'ws-save') wsSave();
      else if (b.id === 'ws-portfolio') wsPortfolio();
      else if (b.id === 'ws-sh-add') wsShareAdd();
      else if (b.id === 'ws-sh-out') wsShareOut();
      else if (b.id === 'ws-tab-list' || b.id === 'ws-tab-map' || b.id === 'ws-tab-lineage') { WS.view = b.id === 'ws-tab-map' ? 'map' : b.id === 'ws-tab-lineage' ? 'lineage' : 'list'; wsRender(); }
      else if (b.dataset.wsOpen) wsOpen(b.dataset.wsOpen);
    });
    const openDoc = async el => {   // desde el mapa: la caja del diagrama abierto no hace nada; las demás lo abren
      const id = el?.dataset.wsDoc, d = id && WS.index.diagrams.find(x => x.docId === id && !x.dupDocId);
      if (d && id !== S.model.docId) { await wsOpen(d.name); if (WS.file === d.name) { WS.view = 'list'; wsRender(); } }
    };
    back.addEventListener('click', ev => openDoc(ev.target.closest('[data-ws-doc]')));
    back.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.matches?.('[data-ws-doc]')) { ev.preventDefault(); openDoc(ev.target); } });
    document.addEventListener('keydown', key, true);
    document.body.appendChild(back);
    wsRender();
    back.querySelector('#ws-pick').focus();
  }
  $('#btn-workspace').addEventListener('click', openWorkspaceDialog);

  /* ---------- diseño frente a realidad (src/drift.js) ----------
     Se cargan archivos de infraestructura como código (los mismos que se importan), se comparan con el diagrama y se decide fila por fila.
     Lo cargado vive solo en esta sesión; en el diagrama quedan únicamente el enlace `iac` de cada componente y las diferencias aceptadas (m.deviations). */
  const DRIFT = { reality: null, names: [] };
  const driftLib = () => window.DiagramonDrift;
  const driftGet = (m, n, f) => (f === 'region' ? govOf(n, 'region', m).value || undefined : n[f]);
  const driftCmp = (m = S.model) => (DRIFT.reality && driftLib() ? driftLib().compare(m.nodes, DRIFT.reality, { get: (n, f) => driftGet(m, n, f) }) : null);
  const driftKey = (node, field) => `${encodeURIComponent(node)}~${field}`;   // para los atributos data-*: el id puede llevar cualquier carácter
  const driftSplit = k => { const i = k.lastIndexOf('~'); return [decodeURIComponent(k.slice(0, i)), k.slice(i + 1)]; };
  const driftShow = (f, v) => (v === true ? T('sec.yes') : v === false ? T('sec.no') : f === 'exposure' ? T(`sec.expo.${v}`) : String(v ?? ''));
  const driftAccepted = (m, d) => (m.deviations || []).find(x => x.node === d.design && x.field === d.field && x.value === String(d.realityValue));
  // Diferencias abiertas y componentes enlazados que ya no existen en lo desplegado: hallazgos mientras haya una comparación cargada
  addFindingSource('drift', m => {
    const c = m === S.model ? driftCmp(m) : null;
    if (!c) return [];
    const by = new Map(m.nodes.map(n => [n.id, n]));
    return [
      ...c.diffs.filter(d => !driftAccepted(m, d)).map(d => ({ id: `drift:diff:${d.design}:${d.field}`, source: 'drift', rule: 'drift.diff', severity: d.field === 'exposure' || d.field === 'backup' ? 'medium' : 'low', target: { kind: 'node', id: d.design },
        title: T('dr.f.diff.t', { node: by.get(d.design)?.label || d.design, field: T(`dr.field.${d.field}`), design: driftShow(d.field, d.designValue), real: driftShow(d.field, d.realityValue) }), fix: T('dr.f.diff.fix') })),
      ...c.missing.map(id => ({ id: `drift:missing:${id}`, source: 'drift', rule: 'drift.missing', severity: 'low', target: { kind: 'node', id }, title: T('dr.f.missing.t', by.get(id)?.label || id), fix: T('dr.f.missing.fix') }))
    ];
  });
  function driftMutate(fn) {
    pushHistory();
    fn(S.model);
    changed(true); renderInspector();
    driftRender();
  }
  function driftHtml() {
    const m = S.model, c = driftCmp(m);
    if (!c) return `<p class="ws-dir">${esc(T('dr.none'))}</p>`;
    const byD = new Map(m.nodes.map(n => [n.id, n])), byR = new Map(DRIFT.reality.map(r => [r.id, r]));
    const open = c.diffs.filter(d => !driftAccepted(m, d)), acc = c.diffs.filter(d => driftAccepted(m, d));
    const rl = r => `${esc(r.label)} <small>${esc(r.iac || '')}</small>`;
    const head = `<p class="ws-dir">${esc(T('dr.sum', { pairs: c.pairs.length, diffs: open.length, props: c.proposals.length, missing: c.missing.length, extra: c.extra.length, names: DRIFT.names.join(', ') }))}</p>`;
    const sec = (title, body) => (body ? `<fieldset class="sh-views dr-sec"><legend>${esc(title)}</legend>${body}</fieldset>` : '');
    const rows = (list, row) => (list.length ? `<ul class="ws-list dr-list">${list.slice(0, 200).map(row).join('')}</ul>` : '');
    const diffs = rows(open, d => {
      const n = byD.get(d.design), k = driftKey(d.design, d.field);
      return `<li><div class="ws-t"><b>${esc(n.label)}</b><small>${esc(T(`dr.field.${d.field}`))}: ${esc(T('dr.design'))} <b>${esc(driftShow(d.field, d.designValue))}</b> · ${esc(T('dr.deployed'))} <b>${esc(driftShow(d.field, d.realityValue))}</b></small>
        <span class="dr-acc"><input type="text" maxlength="300" data-dr-reason="${esc(k)}" placeholder="${esc(T('dr.reason'))}" aria-label="${esc(T('dr.reason'))}"><button type="button" class="btn small" data-dr-accept="${esc(k)}">${esc(T('dr.accept'))}</button></span></div>
        <button type="button" class="btn small" data-dr-adopt="${esc(k)}">${esc(T('dr.adopt'))}</button></li>`;
    });
    const accepted = rows(acc, d => {
      const n = byD.get(d.design), a = driftAccepted(m, d), k = driftKey(d.design, d.field);
      return `<li><div class="ws-t"><b>${esc(n.label)}</b><small>${esc(T(`dr.field.${d.field}`))}: ${esc(driftShow(d.field, d.designValue))} → ${esc(driftShow(d.field, d.realityValue))} · ${esc(a.reason)}${a.date ? ` · ${esc(fmtDay(a.date))}` : ''}</small></div><button type="button" class="btn small" data-dr-reopen="${esc(k)}">${esc(T('dr.reopen'))}</button></li>`;
    });
    const props = rows(c.proposals, p => `<li><div class="ws-t"><b>${esc(byD.get(p.design).label)}</b><small>${esc(T('dr.maybe'))} ${rl(byR.get(p.reality))}</small></div><button type="button" class="btn small" data-dr-link="${esc(p.design)}" data-dr-to="${esc(p.reality)}">${esc(T('dr.link'))}</button></li>`);
    const missing = rows(c.missing, id => `<li><div class="ws-t"><b>${esc(byD.get(id).label)}</b><small>${esc(T('dr.gone', byD.get(id).iac))}</small></div><button type="button" class="btn small" data-dr-unlink="${esc(id)}">${esc(T('dr.unlink'))}</button></li>`);
    const free = DRIFT.reality.filter(r => c.extra.includes(r.id) || c.proposals.some(p => p.reality === r.id));
    const opts = `<option value="">${esc(T('dr.pick'))}</option>${free.slice(0, 300).map(r => `<option value="${esc(r.id)}">${esc(`${r.label} · ${r.iac || ''}`)}</option>`).join('')}`;
    const unlinked = free.length ? rows(c.unlinked, id => `<li><div class="ws-t"><b>${esc(byD.get(id).label)}</b></div><select data-dr-sel="${esc(id)}" aria-label="${esc(T('dr.pick'))}">${opts}</select><button type="button" class="btn small" data-dr-linksel="${esc(id)}">${esc(T('dr.link'))}</button></li>`) : '';
    const extra = c.extra.length ? `<ul class="dr-extra">${c.extra.slice(0, 200).map(id => `<li>${rl(byR.get(id))}</li>`).join('')}</ul>` : '';
    return head + sec(T('dr.s.diffs'), diffs) + sec(T('dr.s.accepted'), accepted) + sec(T('dr.s.props'), props) + sec(T('dr.s.missing'), missing) + sec(T('dr.s.unlinked'), unlinked) + sec(T('dr.s.extra'), extra)
      + (open.length || c.proposals.length || c.missing.length || c.extra.length || acc.length ? '' : `<p class="ws-dir">${esc(T('dr.clean'))}</p>`);
  }
  function driftRender() { const b = $('#dr-body'); if (b) b.innerHTML = driftHtml(); refreshFindings?.(); }
  async function driftLoad(fileList) {
    const msg = $('#dr-msg'), IAC = window.DiagramonIaC;
    if (msg) msg.textContent = '';
    try {
      const files = await Promise.all([...fileList].map(async f => ({ name: f.name || '', text: await f.text() })));
      const res = IAC.convert(files);
      if (!res.nodes) throw new Error('empty');
      DRIFT.reality = res.diagram.nodes; DRIFT.names = files.map(f => f.name);
      driftRender();
    } catch { if (msg) msg.textContent = T('dr.err.read'); }
  }
  function openDriftDialog() {
    if (ctx.P || $('#dr-dialog')) return;
    const prev = document.activeElement, id = `dr${Date.now()}`;
    const back = document.createElement('div');
    back.className = 'cf-back'; back.id = 'dr-dialog';
    back.innerHTML = `<form class="cf share rep ws" role="dialog" aria-modal="true" aria-labelledby="${id}t" autocomplete="off">
      <h3 id="${id}t">${esc(T('dr.title'))}</h3>
      <p>${esc(T('dr.lead'))}</p>
      <div class="ws-bar"><button type="button" class="btn" id="dr-pick">${esc(T('dr.pick.files'))}</button><button type="button" class="btn" id="dr-clear">${esc(T('dr.clear'))}</button></div>
      <div id="dr-body"></div>
      <p class="sh-err" role="alert" id="dr-msg"></p>
      <div class="cf-actions"><button type="button" class="btn" id="dr-close">${esc(T('ws.close'))}</button></div>
    </form>`;
    const close = () => { document.removeEventListener('keydown', key, true); back.remove(); prev?.focus?.(); };
    const key = ev => { if (ev.key === 'Escape' && !document.querySelector('.cf-back:not(#dr-dialog)')) { ev.preventDefault(); ev.stopPropagation(); close(); } };
    const split = driftSplit;
    const node = i => S.model.nodes.find(n => n.id === i);
    back.addEventListener('mousedown', ev => { if (ev.target === back) close(); });
    back.addEventListener('click', ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      const d = b.dataset;
      if (b.id === 'dr-close') close();
      else if (b.id === 'dr-pick') $('#dr-file').click();
      else if (b.id === 'dr-clear') { DRIFT.reality = null; DRIFT.names = []; driftRender(); }
      else if (d.drLink || d.drLinksel) {
        const from = d.drLink || d.drLinksel, to = d.drTo || back.querySelector(`select[data-dr-sel="${CSS.escape(from)}"]`)?.value, r = DRIFT.reality?.find(x => x.id === to);
        if (r?.iac && node(from)) driftMutate(m => { m.nodes.find(n => n.id === from).iac = r.iac; });
      } else if (d.drUnlink) driftMutate(m => { delete m.nodes.find(n => n.id === d.drUnlink).iac; });
      else if (d.drAdopt) {
        const [nid, f] = split(d.drAdopt), c = driftCmp(), df = c?.diffs.find(x => x.design === nid && x.field === f);
        if (df) driftMutate(m => { m.nodes.find(n => n.id === nid)[f] = f === 'region' ? cleanRegion(df.realityValue) || String(df.realityValue) : df.realityValue; m.deviations = (m.deviations || []).filter(x => !(x.node === nid && x.field === f)); if (!m.deviations.length) delete m.deviations; });
      } else if (d.drAccept) {
        const [nid, f] = split(d.drAccept), c = driftCmp(), df = c?.diffs.find(x => x.design === nid && x.field === f);
        const inp = back.querySelector(`input[data-dr-reason="${CSS.escape(d.drAccept)}"]`), reason = (inp?.value || '').trim();
        if (!reason) { inp?.focus(); $('#dr-msg').textContent = T('dr.err.reason'); return; }
        $('#dr-msg').textContent = '';
        if (df) driftMutate(m => { m.deviations = [...(m.deviations || []).filter(x => !(x.node === nid && x.field === f)), { node: nid, field: f, value: String(df.realityValue), reason: reason.slice(0, 300), date: today() }]; });
      } else if (d.drReopen) {
        const [nid, f] = split(d.drReopen);
        driftMutate(m => { m.deviations = (m.deviations || []).filter(x => !(x.node === nid && x.field === f)); if (!m.deviations.length) delete m.deviations; });
      }
    });
    back.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.matches?.('input[data-dr-reason]')) { ev.preventDefault(); back.querySelector(`button[data-dr-accept="${CSS.escape(ev.target.dataset.drReason)}"]`)?.click(); } });
    document.addEventListener('keydown', key, true);
    document.body.appendChild(back);
    driftRender();
    back.querySelector('#dr-pick').focus();
  }
  $('#dr-file').addEventListener('change', async ev => { const l = [...ev.target.files]; ev.target.value = ''; if (l.length) await driftLoad(l); });
  $('#btn-drift').addEventListener('click', openDriftDialog);

  return { WS, driftShow, ensureDocId, wsOpen };
} };
