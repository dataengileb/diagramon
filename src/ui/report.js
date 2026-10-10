/* ==========================================================================
   Diagramon · interfaz: informe de arquitectura (PDF por impresión, Markdown, HTML)
   --------------------------------------------------------------------------
   Movido desde src/app.js (v2), sin cambios de comportamiento.
   API: window.DiagramonUI.report
   ========================================================================== */
window.DiagramonUI = window.DiagramonUI || {};
// ctx: lo que esta pieza necesita de la app. Valores ya definidos al crearla pasan directos; el resto, como envolturas que se llaman al usarse.
window.DiagramonUI.report = { create(ctx) {
  'use strict';
  const C = window.DIAGRAMON_CONFIG;
  const I = window.DiagramonI18n, T = I.T, loc = I.loc;
  const { esc, store } = window.DiagramonCore.util;
  const { S, VIEWS, VIEW_KEYS, viewLabel } = window.DiagramonCore.state;
  const { toast } = window.DiagramonUI.dialogs;
  const { COST, CTL_STATUS, CTL_SYM, DATA, DL, EDGE_W, MG, PERIODS, RAID_TYPES, RD_KEYS, SEVERITY, STR, activeVersion, adrHist, apprNames, approvalState, availOf, buildSVG, catalog, classShorts, cleanReplicas, cleanSla, cmTargetText, cmpFrameworks, cmpModel, costBreakdown, costText, crossBorder, ctlInfo, ctlSplit, customTypes, dataClassesOf, download, downtime, dsPrices, e2eOf, eachView, edgeStyleLabel, efInfo, effortHelpers, fileName, findVersion, fmtApprox, fmtDay, fmtDur, fmtPct, fmtPhaseDate, fontCss, govOf, govTeamList, groupById, hasCost, hasRes, hasSla, iconInfo, jurOf, layerInfo, layerOf, mgInfo, money, monthlyTotal, numFmt, parseDur, perMonth, periodOf, phaseCostText, phaseEffort, phaseHelpers, phaseRows, pngBlob, radarInfo, radarOf, raidHeat, raidLevel, raidScore, raidSummary, rdRingInfo, refreshView, regionOf, renderPhaseBar, reqCheck, reviewState, round2, scopePath, setScope, sevLabel, shAreas, spofList, statusOutput, statusReport, storageEstimate, strideAll, today, trustName, typeLabel, verLabel, viewWorth, adrMatrixText, apprSummary, driftShow, findingTargetLabel, findingsOf, phNm, raidLate, reqCheckText, reqCoveredBy, shRaciOf, srcLabel } = ctx;

  // reportData() arma un modelo plano (secciones de bloques) y dos dibujantes lo pintan: reportMarkdown y reportHTML, así que los dos formatos no se desincronizan.
  // Bloques: { k: 'h3', t } · { k: 'p', t, muted? } · { k: 'kv', items: [[k, v]] } · { k: 'cards', items: [{ label, value, tone? }] }
  //          { k: 'table', head: [], rows: [[celda]], cls? } (celda = texto | { t, tone }) · { k: 'text', label, t } · { k: 'ul', items } · { k: 'img', alt, caption, svg?, uri?, file? }
  const REP_SECS = ['summary', 'diagram', 'components', 'connections', 'data', 'owners', 'layers', 'datasets', 'costs', 'resilience', 'findings', 'compliance', 'threats', 'decisions', 'requirements', 'raid', 'approvals', 'phases', 'estimation', 'migration', 'radar', 'drift', 'versions', 'notes', 'comments'];
  const REP_PAGE = ['diagram', 'components', 'findings', 'decisions']; // secciones que empiezan página al imprimir
  const repT = (k, v) => T(`rep.${k}`, v);
  const repSleep = ms => new Promise(r => setTimeout(r, ms));
  // base64 de un texto UTF-8 y de un Blob (por trozos, para no reventar la pila con SVG grandes)
  const repB64 = s => { const b = new TextEncoder().encode(s); let o = ''; for (let i = 0; i < b.length; i += 0x8000) o += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(o); };
  const repBlobUri = async blob => { const b = new Uint8Array(await blob.arrayBuffer()); let o = ''; for (let i = 0; i < b.length; i += 0x8000) o += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return `data:${blob.type || 'image/png'};base64,${btoa(o)}`; };
  // Nodos con interior (C4): solo si el modelo y la app lo soportan
  const repScopes = (m = S.model) => {
    if (typeof scopePath !== 'function' || typeof setScope !== 'function') return [];
    const ids = new Set([...m.nodes, ...m.groups, ...(m.notes || []), ...(m.zones || [])].map(x => x.in).filter(Boolean));
    return m.nodes.filter(n => ids.has(n.id)).map(n => n.id);
  };
  const repScopeName = id => (id == null ? '' : (typeof scopePath === 'function' ? scopePath(id) : [id]).map(i => S.model.nodes.find(n => n.id === i)?.label || i).join(' › '));
  // Qué secciones tienen datos (las demás se saltan y el diálogo las muestra «(ninguno)»)
  function repAvail(m = S.model) {
    return {
      summary: true, diagram: m.nodes.length > 0, components: m.nodes.length > 0, connections: m.edges.length > 0,
      data: m.nodes.some(n => dataClassesOf(n, m).length || regionOf(n, m).value), owners: govTeamList(m).length > 0,
      layers: m.nodes.some(n => layerOf(n).value), migration: m.nodes.some(n => n.disposition), radar: m.nodes.some(n => radarOf(n, m)), costs: m.nodes.some(hasCost), resilience: m.nodes.some(hasRes) || spofList(m).length > 0, findings: findingsOf(m).length > 0,
      compliance: cmpModel(m).keys.length > 0, threats: strideAll(m).length > 0, decisions: !!m.decisions?.length, requirements: !!m.requirements?.length,
      raid: !!m.raid?.length, approvals: !!m.stakeholders?.length, phases: !!m.phases?.length, estimation: !!phaseEffort(m, effortHelpers), datasets: !!m.datasets?.length,
      versions: m.versions.length > 0, notes: (m.notes || []).length > 0 || (m.zones || []).some(z => z.kind !== 'trust'), comments: (m.comments || []).some(c => !c.internal && c.status !== 'resolved'), drift: !!m.deviations?.length
    };
  }
  const repDefaultViews = () => {
    const ok = k => VIEWS[k] && viewWorth(k);
    const l = [S.viewKey, ...['security', 'data'].filter(ok)].filter((k, i, a) => VIEWS[k] && a.indexOf(k) === i);
    return l.length ? l : ['full'];
  };

  async function reportData(o) {
    const m = S.model, av = repAvail(m), want = k => av[k] && (!o.sections || o.sections.includes(k));
    const byId = new Map(m.nodes.map(n => [n.id, n])), nm = id => byId.get(id)?.label || id;
    const edgeName = e => `${nm(e.from)} ${e.both ? '↔' : '→'} ${nm(e.to)}`;
    const gpath = x => { const out = []; let g = 'type' in x ? x.group : x.parent, i = 0; while (g && i++ < 50) { const gg = groupById(g); if (!gg) break; out.unshift(gg.label); g = gg.parent; } return out.join(' › '); };
    const dShort = ks => (ks || []).map(k => loc(DATA[k]?.short) || String(k).toUpperCase()).join(' ');
    const dLabel = k => loc(DATA[k]?.label) || String(k);
    const sevCell = s => ({ t: sevLabel(s), tone: `sev-${s}` });
    const yn = v => T(v ? 'sec.yes' : 'sec.no');
    const hasScopes = typeof scopePath === 'function' && m.nodes.some(n => n.in);
    const av0 = activeVersion(), find = findingsOf(m), open = find.filter(f => !f.dismissed), dis = find.filter(f => f.dismissed);
    const D = { lang: I.lang, title: m.title, author: m.meta?.author || av0?.author || '', version: m.meta?.version || '', active: av0 ? { label: verLabel(av0), status: T(`ver.st.${av0.status}`) } : null,
      date: fmtDay(today()), desc: m.meta?.desc ? String(m.meta.desc) : '', sections: [], files: [] };
    const sec = (id, blocks) => D.sections.push({ id, title: repT(`s.${id}`), blocks });

    /* diagrama: una imagen por vista (y por interior C4); es lo único lento, así que se cede el hilo entre imágenes */
    const imgs = [];
    if (want('diagram')) {
      const keys = (o.views || []).filter(k => VIEWS[k]), scopes = [null, ...(o.scopes ? repScopes(m) : [])], total = keys.length * scopes.length, theme = o.theme === 'current' ? S.theme : 'light';
      const oldScope = typeof S.scope !== 'undefined' ? S.scope : null, oldTheme = S.theme;
      let n = 0;
      try {
        for (const sc of scopes) {
          if (scopes.length > 1) setScope(sc);
          await eachView(keys, async key => {
            o.progress?.(++n, total, [repScopeName(sc), viewLabel(key)].filter(Boolean).join(' · '));
            let out;
            S.theme = theme; try { out = buildSVG(); } finally { S.theme = oldTheme; }
            const im = { key, label: viewLabel(key), scope: sc, scopeLabel: repScopeName(sc), svg: out.str };
            if (o.format === 'md') {
              const blob = await pngBlob(out);
              if (!blob) im.uri = 'data:image/svg+xml;base64,' + repB64(out.str);
              else if (o.separateImages) { im.file = fileName('png', `report-${String(n).padStart(2, '0')}-${key}`); D.files.push({ name: im.file, blob }); } else im.uri = await repBlobUri(blob);
            } else im.uri = 'data:image/svg+xml;base64,' + repB64(out.str);
            imgs.push(im);
            await repSleep(0);
          });
        }
      } finally { if (scopes.length > 1) setScope(oldScope ?? null); }
    }

    /* fases: una imagen de la arquitectura en cada fase (futuro oculto, sin fantasmas); se restaura la fase y los fantasmas aunque falle */
    const phImgs = [];
    if (want('phases')) {
      const theme = o.theme === 'current' ? S.theme : 'light', oldTheme = S.theme, np = m.phases.length, base = (o.progressBase || 0);
      const old = { phase: S.phase, ghosts: S.phaseGhosts };
      try {
        await eachView([S.viewKey], async () => {
          try {
            for (let i = 0; i < np; i++) {
              o.progress?.(base + i + 1, base + np, `${repT('s.phases')} · ${m.phases[i].name}`);
              S.phase = i; S.phaseGhosts = false; refreshView();
              let out;
              S.theme = theme; try { out = buildSVG(); } finally { S.theme = oldTheme; }
              const im = { i, svg: out.str };
              if (o.format === 'md') {
                const blob = await pngBlob(out);
                if (!blob) im.uri = 'data:image/svg+xml;base64,' + repB64(out.str);
                else if (o.separateImages) { im.file = fileName('png', `report-phase-${String(i + 1).padStart(2, '0')}-${m.phases[i].id}`); D.files.push({ name: im.file, blob }); } else im.uri = await repBlobUri(blob);
              } else im.uri = 'data:image/svg+xml;base64,' + repB64(out.str);
              phImgs.push(im);
              await repSleep(0);
            }
          } finally { S.phase = old.phase; S.phaseGhosts = old.ghosts; refreshView(); renderPhaseBar(); }
        });
      } catch (e) { if (!phImgs.length) throw e; }
    }

    /* resumen */
    if (want('summary')) {
      const mt = monthlyTotal(m.nodes), cards = [{ label: repT('k.components'), value: m.nodes.length }, { label: repT('k.connections'), value: m.edges.length }, { label: repT('k.groups'), value: m.groups.length },
        { label: repT('k.views'), value: VIEW_KEYS.length }];
      if (m.nodes.some(hasCost)) cards.push({ label: repT('k.cost'), value: money(round2(mt)) });
      cards.push({ label: repT('k.findings'), value: open.length, tone: open.some(f => f.severity === 'critical' || f.severity === 'high') ? 'sev-high' : '' });
      if (m.decisions?.length) cards.push({ label: repT('k.decisions'), value: m.decisions.length });
      if (m.requirements?.length) cards.push({ label: repT('k.requirements'), value: m.requirements.length });
      if (m.stakeholders?.length) cards.push({ label: repT('k.approvals'), value: m.stakeholders.length });
      if (m.phases?.length) cards.push({ label: repT('k.phases'), value: m.phases.length });
      const kv = [[repT('author'), D.author], [repT('version'), D.version], [repT('active'), D.active ? `${D.active.label} · ${D.active.status}` : ''], [repT('date'), D.date]].filter(r => r[1]);
      const blocks = [];
      if (D.desc) blocks.push({ k: 'p', t: D.desc });
      if (kv.length) blocks.push({ k: 'kv', items: kv });
      blocks.push({ k: 'cards', items: cards });
      if (find.length) {
        blocks.push({ k: 'h3', t: repT('sum.findings') });
        blocks.push({ k: 'table', cls: 'compact', head: [...SEVERITY.slice().reverse().map(sevLabel), repT('dismissed')], rows: [[...SEVERITY.slice().reverse().map(s => String(open.filter(f => f.severity === s).length)), String(dis.length)]] });
      }
      if (m.decisions?.length) {
        const st = [...new Set(m.decisions.map(d => d.status))];
        blocks.push({ k: 'h3', t: repT('sum.decisions') });
        blocks.push({ k: 'table', cls: 'compact', head: st.map(s => repT(`adr.${s}`)), rows: [st.map(s => String(m.decisions.filter(d => d.status === s).length))] });
      }
      sec('summary', blocks);
    }

    if (want('diagram')) {
      const blocks = [];
      imgs.forEach(im => {
        blocks.push({ k: 'h3', t: [im.scopeLabel, im.label].filter(Boolean).join(' · ') });
        blocks.push({ k: 'img', alt: `${m.title} — ${[im.scopeLabel, im.label].filter(Boolean).join(' · ')}`, svg: im.svg, uri: im.uri, file: im.file });
      });
      if (!blocks.length) blocks.push({ k: 'p', t: repT('noViews'), muted: true });
      sec('diagram', blocks);
    }

    if (want('components')) {
      const head = [repT('h.component'), repT('h.type'), repT('h.group'), ...(hasScopes ? [repT('h.scope')] : []), repT('h.data'), repT('h.region'), repT('h.owner'), repT('h.layer'), repT('h.cost'), repT('h.review')];
      const rows = m.nodes.map(n => {
        const ic = iconInfo(n.icon), rv = n.review ? { t: T(`rev.tag.${reviewState(n.review)}`), tone: `rev-${reviewState(n.review)}` } : '';
        const gov = [govOf(n, 'team').value, govOf(n, 'owner').value].filter(Boolean).join(' · '), ly = layerOf(n).value;
        return [[n.label, n.sub].filter(Boolean).join('\n'), ic ? `${ic.providerLabel} · ${ic.label}` : typeLabel(n.type), gpath(n), ...(hasScopes ? [n.in ? repScopeName(n.in) : ''] : []),
          dShort(dataClassesOf(n, m)), regionOf(n, m).value, gov, ly ? layerInfo(ly).label : '', hasCost(n) ? money(round2(perMonth(n))) : '', rv];
      });
      sec('components', [{ k: 'table', head, rows, cls: 'wide' }]);
    }

    if (want('connections')) {
      const anyW = m.edges.some(e => EDGE_W[e.weight]); // la columna Importancia solo sale si alguna conexión la usa: los informes viejos no cambian
      const rows = m.edges.map(e => {
        const cb = crossBorder(e, byId);
        return [nm(e.from), nm(e.to) + (e.both ? ' ↔' : ''), e.label || '', edgeStyleLabel(e.style), ...(anyW ? [EDGE_W[e.weight] ? { t: T(`wt.${e.weight}`), tone: e.weight === 'critical' ? 'sev-high' : '' } : T('wt.normal')] : []), e.encrypted === true ? T('enc.yes') : e.encrypted === false ? { t: T('enc.no'), tone: 'sev-high' } : T('enc.unset'),
          dShort(e.data), (e.datasets || []).join(', '), cb ? { t: `${cb.from.region} → ${cb.to.region}${cb.approved ? ' ✓' : ''}`, tone: cb.approved ? '' : 'sev-high' } : ''];
      });
      const ets = customTypes(), tb = ets.length ? [{ k: 'h3', t: repT('h.types') }, { k: 'table', head: [repT('h.type'), repT('h.dash'), repT('h.color'), repT('h.width'), repT('h.particles'), repT('h.edges')],
        rows: ets.map(t => [loc(t.label), t.dash || T('et.solid'), t.color || '', String(t.width ?? 1.8), String(t.particles ?? 1), String(m.edges.filter(e => e.style === t.id).length)]) }] : [];
      sec('connections', [{ k: 'table', head: [repT('h.from'), repT('h.to'), repT('h.label'), repT('h.style'), ...(anyW ? [T('wt.label')] : []), repT('h.enc'), repT('h.data'), repT('h.datasets'), repT('h.xb')], rows, cls: 'wide' }, ...tb]);
    }

    if (want('data')) {
      const blocks = [], used = Object.keys(DATA).filter(k => m.nodes.some(n => dataClassesOf(n, m).includes(k)) || m.edges.some(e => e.data?.includes(k)));
      if (used.length) blocks.push({ k: 'table', head: [repT('h.class'), repT('h.sens'), repT('h.nodes'), repT('h.edges')], rows: used.map(k => [`${loc(DATA[k].short) || k.toUpperCase()} · ${dLabel(k)}`, yn(DATA[k].sensitive),
        m.nodes.filter(n => dataClassesOf(n, m).includes(k)).map(n => n.label).join(', '), m.edges.filter(e => e.data?.includes(k)).map(edgeName).join(', ')]) });
      const regs = new Map();
      m.nodes.forEach(n => { const r = regionOf(n, m).value; if (r) (regs.get(r) || regs.set(r, []).get(r)).push(n.label); });
      if (regs.size) { blocks.push({ k: 'h3', t: repT('h.residency') }); blocks.push({ k: 'table', head: [repT('h.region'), repT('h.jur'), repT('h.nodes')], rows: [...regs].map(([r, ns]) => [r, jurOf(r)?.label || '', ns.join(', ')]) }); }
      const xb = m.edges.map(e => ({ e, cb: crossBorder(e, byId) })).filter(x => x.cb);
      if (xb.length) { blocks.push({ k: 'h3', t: repT('h.transfers') }); blocks.push({ k: 'table', head: [repT('h.connection'), repT('h.region'), repT('h.class'), repT('h.status')],
        rows: xb.map(({ e, cb }) => [edgeName(e), `${cb.from.region} (${cb.from.jur.short}) → ${cb.to.region} (${cb.to.jur.short})`, classShorts(cb.classes).join(' '), cb.approved ? repT('approved') : { t: repT('pending'), tone: 'sev-high' }]) }); }
      sec('data', blocks);
    }

    if (want('owners')) {
      sec('owners', [{ k: 'table', head: [repT('h.team'), repT('h.owners'), repT('h.stewards'), repT('h.nodes')], rows: govTeamList(m).map(t => [t.team || repT('noTeam'), t.owners.join(', '), t.stewards.join(', '), t.nodes.map(nm).join(', ')]) }]);
    }

    if (want('layers')) {
      sec('layers', [{ k: 'table', head: [repT('h.layer'), repT('h.nodes')], rows: Object.keys(DL).map(k => [layerInfo(k).label, m.nodes.filter(n => layerOf(n).value === k).map(n => n.label).join(', ')]).filter(r => r[1]) }]);
    }

    if (want('datasets')) {
      // Resumen, tabla del catálogo (declarados), sin documentar al final y, por producto, su esquema y sus reglas de calidad
      const dsl = m.datasets, cat = catalog(m), und = cat.filter(c => !c.declared), prods = dsl.filter(d => d.product), blocks = [];
      const ownerOf = o => m.stakeholders?.find(s => s.id === o)?.name || o || '';
      const frCell = f => ({ t: `${f.worst == null ? '—' : fmtDur(f.worst / 1000)} · ${f.sla == null ? '—' : fmtDur(f.sla / 1000)} · ${{ pass: '✓', fail: '✗', unknown: '?' }[f.state]}`, tone: f.state === 'fail' ? 'sev-high' : '' });
      blocks.push({ k: 'p', t: repT('cat.sum', { n: dsl.length, p: prods.length, u: und.length, b: dsl.filter(d => e2eOf(d.name, m).state === 'fail').length }) });
      const rows = dsl.map(d => {
        const f = e2eOf(d.name, m), sto = storageEstimate(d, { prices: dsPrices() });
        return [d.id, d.name, d.domain || '', d.layer ? layerInfo(d.layer).label : '', ownerOf(d.owner), d.product ? '★' : '', frCell(f),
          d.contract ? `${d.contract.version} · ${repT(`cat.st.${d.contract.status}`)}` : '', sto ? `${numFmt(sto.gb, 1)} GB · ${money(round2(sto.monthly))}` : ''];
      });
      blocks.push({ k: 'table', cls: 'wide', head: [repT('h.id'), repT('h.name'), repT('h.domain'), repT('h.layer'), repT('h.owner'), repT('h.product'), repT('h.freshness'), repT('h.contract'), repT('h.storage')], rows });
      if (dsl.some(d => storageEstimate(d, { prices: dsPrices() }))) blocks.push({ k: 'p', muted: true, t: repT('cat.estNote') });
      if (und.length) blocks.push({ k: 'p', t: `${repT('cat.undoc')}: ${und.map(c => c.name).join(', ')}` });
      prods.forEach(d => {
        blocks.push({ k: 'h3', t: `★ ${d.id} · ${d.name}` });
        if (d.description) blocks.push({ k: 'p', t: d.description });
        if (d.schema?.length) {
          blocks.push({ k: 'h4', t: repT('cat.schema') });
          blocks.push({ k: 'table', cls: 'compact', head: [repT('h.name'), repT('h.type'), repT('h.key'), repT('h.pii')], rows: d.schema.map(c => [c.name, c.type || '', c.key ? '✓' : '', c.pii ? '✓' : '']) });
        }
        if (d.quality?.length) {
          blocks.push({ k: 'h4', t: repT('cat.rules') });
          blocks.push({ k: 'table', cls: 'compact', head: [repT('h.rule'), repT('h.column'), repT('h.param'), repT('h.severity')], rows: d.quality.map(q => [q.rule, q.column || '', q.param || '', q.severity ? sevLabel(q.severity) : '']) });
        }
      });
      sec('datasets', blocks);
    }

    if (want('costs')) {
      const cn = m.nodes.filter(hasCost), blocks = [{ k: 'table', head: [repT('h.component'), repT('h.group'), repT('h.price'), repT('h.cost')], rows: [...cn.map(n => [n.label, gpath(n), costText(n), money(round2(perMonth(n)))]), [{ t: repT('total'), tone: 'total' }, '', '', { t: money(round2(monthlyTotal(m.nodes))), tone: 'total' }]] }];
      const gr = costBreakdown(m, 'group'); // árbol por ruta de grupos: costo directo y subtotal (con descendientes); sin asignar al final
      if (gr.length) { blocks.push({ k: 'h3', t: repT('h.perGroup') }); blocks.push({ k: 'table', head: [repT('h.group'), repT('h.nodes'), T('cst.col.own'), T('cst.col.subtotal')], rows: gr.map(x => ['\u00a0\u00a0\u00a0'.repeat(x.depth) + x.label + (x.kind === 'level' ? ` [${T('cst.level')}]` : ''), String(x.nodesAll.length), x.own ? money(round2(x.own)) : '—', money(round2(x.total))]) }); }
      [['team', 'byTeam', 'gov.team'], ['costCenter', 'byCostCenter', 'gov.costCenter']].forEach(([by, hk, fk]) => {
        const rs = costBreakdown(m, by);
        if (!rs.some(x => !x.unassigned)) return;
        const tot = rs.reduce((s, x) => s + x.monthly, 0);
        blocks.push({ k: 'h3', t: repT(`h.${hk}`) });
        blocks.push({ k: 'table', head: [T(fk), repT('h.nodes'), repT('h.cost'), T('cst.col.pct')], rows: rs.map(x => [x.label, String(x.nodes.length), money(round2(x.monthly)), tot ? `${(x.monthly / tot * 100).toFixed(1)}%` : '']) });
      });
      const per = [...new Set(cn.map(periodOf))];
      blocks.push({ k: 'p', muted: true, t: repT('costNote', { h: COST.hoursPerMonth, p: per.map(p => T(PERIODS[p].label)).join(', ') }) });
      sec('costs', blocks);
    }

    if (want('resilience')) { // Resiliencia: SLA, RPO/RTO, réplicas y puntos únicos de fallo
      const rn = m.nodes.filter(hasRes), sp = spofList(m), blocks = [];
      if (rn.length) blocks.push({ k: 'table', cls: 'wide', head: [repT('h.component'), repT('h.group'), repT('h.sla'), repT('h.replicas'), repT('h.eff'), repT('h.down'), 'RPO', 'RTO'],
        rows: rn.map(n => { const a = availOf(n); return [n.label, gpath(n), hasSla(n) ? `${numFmt(cleanSla(n.sla), 6)}%` : '', cleanReplicas(n.replicas) ? String(n.replicas) : '', a != null ? fmtPct(a) : '', a != null ? `${fmtApprox(downtime(a).year)}${T('res.perYear')}` : '', n.rpo != null ? fmtDur(parseDur(n.rpo)) : '', n.rto != null ? fmtDur(parseDur(n.rto)) : '']; }) });
      if (sp.length) { blocks.push({ k: 'h3', t: repT('h.spof') }); blocks.push({ k: 'table', head: [repT('h.component'), repT('h.detail')], rows: sp.map(x => [x.label, x.reason]) }); }
      blocks.push({ k: 'p', muted: true, t: repT('resNote') });
      sec('resilience', blocks);
    }

    if (want('findings')) {
      const row = f => [sevCell(f.severity), srcLabel(f.source), f.title, findingTargetLabel(f.target), [f.detail, f.fix].filter(Boolean).join('\n')];
      const head = [repT('h.severity'), repT('h.source'), repT('h.finding'), repT('h.target'), repT('h.detail')], blocks = [];
      blocks.push({ k: 'table', cls: 'compact', head: [...SEVERITY.slice().reverse().map(sevLabel), repT('dismissed')], rows: [[...SEVERITY.slice().reverse().map(s => String(open.filter(f => f.severity === s).length)), String(dis.length)]] });
      if (open.length) blocks.push({ k: 'table', head, rows: open.map(row), cls: 'wide' });
      if (dis.length) { blocks.push({ k: 'h3', t: repT('dismissed') }); blocks.push({ k: 'table', cls: 'wide', head: [...head, repT('h.reason')], rows: dis.map(f => [...row(f), [f.dismissed.reason, f.dismissed.by, f.dismissed.date ? fmtDay(f.dismissed.date) : ''].filter(Boolean).join(' · ')]) }); }
      sec('findings', blocks);
    }

    if (want('compliance')) {
      const { rows, keys, stats } = cmpModel(m), blocks = [], big = keys.length > 10; // más de 10 controles: una rejilla por marco (cabe en A4)
      cmpFrameworks(keys).forEach(fw => {
        const ks = keys.filter(k => ctlSplit(k)[0] === fw), ci = ctlInfo(`${fw}:x`);
        blocks.push({ k: 'h3', t: ci.fwLabel });
        blocks.push({ k: 'table', head: [repT('h.control'), repT('h.title'), ...CTL_STATUS.map(s => T(`cmp.${s}`)), T('cmp.unmapped'), T('cmp.mx.cov')], rows: ks.map(k => {
          const s = stats.get(k), d = rows.length - s.na;
          return [ctlSplit(k)[1], ctlInfo(k).title, ...CTL_STATUS.map(x => String(s[x])), String(s.unmapped), d > 0 ? Math.round(s.met / d * 100) + '%' : '—'];
        }) });
        if (big) { const g = cmpGridBlock(rows.filter(r => ks.some(k => r.eff.has(k))), ks); if (g) blocks.push(g); }
      });
      if (!big) { const g = cmpGridBlock(rows, keys); if (g) blocks.push(g); }
      blocks.push({ k: 'p', muted: true, t: `${T('cmp.mx.note')} ${repT('cmpGridNote')}` });
      sec('compliance', blocks);
    }

    if (want('threats')) {
      sec('threats', [{ k: 'table', cls: 'wide', head: [repT('h.zones'), repT('h.connection'), repT('h.cat'), repT('h.severity'), repT('h.status'), repT('h.note'), repT('h.mitigation')],
        rows: strideAll(m).map(t => [t.zones.map(trustName).join(' | '), `${t.from} → ${t.to}${t.e.label ? ` (${t.e.label})` : ''}`, `${t.cat} ${loc(STR.categories[t.cat].label)}`, sevCell(t.severity), T(`stride.st.${t.status}`), t.note, t.mitigation]) }]);
    }

    if (want('decisions')) {
      const ds = m.decisions, link = l => [...(l?.nodes || []).map(nm), ...(l?.edges || []).map(id => { const e = m.edges.find(x => x.id === id); return e ? edgeName(e) : id; }),
        ...(l?.groups || []).map(id => groupById(id)?.label || id), ...(l?.versions || []).map(id => { const v = findVersion(id); return v ? verLabel(v) : id; })];
      const ar = ds.some(d => d.area), blocks = [{ k: 'table', head: [repT('h.id'), repT('h.title'), repT('h.status'), repT('h.date'), repT('h.deciders'), ...(ar ? [T('adr.f.area')] : [])], rows: ds.map(d => [d.id, d.title, repT(`adr.${d.status}`), fmtDay(d.date), d.deciders || '', ...(ar ? [d.area || ''] : [])]) }];
      ds.forEach(d => {
        blocks.push({ k: 'h3', t: `${d.id} · ${d.title}` });
        blocks.push({ k: 'kv', items: [[repT('h.status'), repT(`adr.${d.status}`)], [repT('h.date'), fmtDay(d.date)], [repT('h.deciders'), d.deciders || ''], [T('adr.f.area'), d.area || ''], [repT('h.supersededBy'), d.supersededBy ? (ds.find(x => x.id === d.supersededBy)?.title ? `${d.supersededBy} · ${ds.find(x => x.id === d.supersededBy).title}` : d.supersededBy) : ''], [repT('h.links'), link(d.links).join(', ')]].filter(r => r[1]) });
        blocks.push({ k: 'table', cls: 'compact', head: [repT('h.date'), repT('h.status'), repT('h.by'), repT('h.note')], rows: adrHist(d).map(h => [fmtDay(h.date), repT(`adr.${h.status}`), h.by || '', h.note || '']) });
        [['context', d.context], ['decision', d.decision], ['consequences', d.consequences]].forEach(([k, t]) => {
          if (t && String(t).trim()) blocks.push({ k: 'text', label: repT(`adr.${k}`), t: String(t) });
          if (k === 'context' && d.options?.length) {   // opciones consideradas: matriz y ficha de cada una, entre el contexto y la decisión
            const mx = adrMatrixText(d);
            blocks.push({ k: 'text', label: T('adr.opts'), t: mx.legend });
            if (d.criteria?.length) blocks.push({ k: 'table', cls: 'compact', head: mx.head, rows: mx.rows });
            mx.cards.forEach(c => blocks.push({ k: 'text', label: c.label, t: [...c.facts.map(([a, v]) => `${a}: ${v}`), ...(c.pros.length ? [`${T('adr.o.pros')}:`, ...c.pros.map(x => `• ${x}`)] : []), ...(c.cons.length ? [`${T('adr.o.cons')}:`, ...c.cons.map(x => `• ${x}`)] : [])].join('\n') }));
          }
        });
      });
      sec('decisions', blocks);
    }

    if (want('requirements')) {
      const rs = m.requirements, cov = r => reqCoveredBy(r, m), chk = new Map(rs.filter(r => r.check).map(r => [r.id, reqCheck(r, m)]));
      const res = r => { const c = chk.get(r.id); return c ? { t: `${{ pass: '✓', fail: '✗', unknown: '?' }[c.state]} ${reqCheckText(r)}${c.detail ? ` · ${c.detail}` : ''}`, tone: c.state === 'fail' ? 'sev-high' : '' } : ''; };
      const blocks = [{ k: 'table', cls: 'wide', head: [repT('h.id'), repT('h.title'), repT('h.kind'), repT('h.priority'), repT('h.status'), repT('h.coveredBy'), repT('h.check')],
        rows: rs.map(r => [r.id, r.title, T(`req.kind.${r.kind}`), r.priority ? T(`req.pr.${r.priority}`) : '', T(`req.st.${r.status}`), cov(r), res(r)]) }];
      rs.filter(r => r.detail || r.source).forEach(r => blocks.push({ k: 'text', label: `${r.id} · ${r.title}${r.source ? ` (${T('req.f.source')}: ${r.source})` : ''}`, t: r.detail || '' }));
      sec('requirements', blocks);
    }
    if (want('raid')) {
      // Resumen, mapa de calor (riesgos con puntaje) y una tabla por tipo; la columna de detalle solo aparece si algún item la trae
      const rd = m.raid, now = today(), sm = raidSummary(m, now), tone = lv => `sev-${lv}`;
      const lk = l => [...(l?.decisions || []), ...(l?.requirements || []), ...(l?.nodes || []).map(nm), ...(l?.edges || []).map(id => { const e = m.edges.find(x => x.id === id); return e ? edgeName(e) : id; }), ...(l?.groups || []).map(id => groupById(id)?.label || id)].join(', ');
      const parts = [sm.risks && T('raid.sum.risks', sm), sm.toValidate && T('raid.sum.validate', sm.toValidate), sm.overdue && T('raid.sum.overdue', sm.overdue)].filter(Boolean);
      const blocks = parts.length ? [{ k: 'p', t: parts.join(' · ') }] : [];
      const g = raidHeat(rd);
      if (rd.some(x => raidScore(x))) {
        blocks.push({ k: 'h3', t: T('raid.heat') });
        blocks.push({ k: 'table', cls: 'compact', head: [`${T('raid.f.impact')} ↓ / ${T('raid.f.prob')} →`, 1, 2, 3, 4, 5].map(String), rows: [5, 4, 3, 2, 1].map(i => [`${i} · ${T(`raid.scale.${i}`)}`, ...[1, 2, 3, 4, 5].map(p => { const n = g[i - 1][p - 1]; return n ? { t: String(n), tone: tone(raidLevel(p * i)) } : ''; })]) });
      }
      RAID_TYPES.forEach(t => {
        const l = rd.filter(x => x.type === t);
        if (!l.length) return;
        const dt = l.some(x => x.detail), late = x => (raidLate(x) ? 'sev-high' : '');
        blocks.push({ k: 'h3', t: `${T(`raid.type.${t}`)} (${l.length})` });
        const base = x => [x.id, x.title, x.owner || ''], tail = x => [lk(x.links), ...(dt ? [x.detail || ''] : [])], dtH = dt ? [T('raid.f.detail')] : [];
        if (t === 'risk') blocks.push({ k: 'table', cls: 'wide', head: [T('raid.f.id'), T('raid.f.title'), T('raid.f.owner'), T('raid.f.prob'), T('raid.f.impact'), T('raid.f.score'), T('raid.f.status'), T('raid.f.mit'), T('raid.f.links'), ...dtH],
          rows: l.map(x => { const sc = raidScore(x); return [...base(x), x.probability ? String(x.probability) : '', x.impact ? String(x.impact) : '', sc ? { t: String(sc), tone: tone(raidLevel(sc)) } : '', T(`raid.st.${x.status}`), x.mitigation || '', ...tail(x)]; }) });
        else if (t === 'assumption') blocks.push({ k: 'table', cls: 'wide', head: [T('raid.f.id'), T('raid.f.title'), T('raid.f.owner'), T('raid.f.validation'), T('raid.f.due.a'), T('raid.hist'), T('raid.f.links'), ...dtH],
          rows: l.map(x => { const h = (x.history || [])[(x.history || []).length - 1]; return [...base(x), { t: T(`raid.st.${x.validation}`), tone: x.validation === 'invalidated' ? 'sev-high' : x.validation === 'validated' ? 'sev-low' : '' }, { t: fmtDay(x.due), tone: late(x) }, h ? [fmtDay(h.date), h.by].filter(Boolean).join(' · ') : '', ...tail(x)]; }) });
        else blocks.push({ k: 'table', cls: 'wide', head: [T('raid.f.id'), T('raid.f.title'), T('raid.f.owner'), T('raid.f.status'), T('raid.f.due.n'), T('raid.f.links'), ...dtH],
          rows: l.map(x => [...base(x), T(`raid.st.${x.status}`), { t: fmtDay(x.due), tone: late(x) }, ...tail(x)]) });
      });
      sec('raid', blocks);
    }

    if (want('approvals')) {
      // Interesados, matriz RACI (filas = interesados; columnas = «Todas las áreas» + áreas de las decisiones) y aprobaciones de decisiones y versiones con aprobadores requeridos o firmas
      const sh = m.stakeholders, cols = ['*', ...shAreas(m)];
      const blocks = [{ k: 'h3', t: repT('h.stakeholders') }, { k: 'table', cls: 'wide', head: [repT('h.id'), repT('h.name'), repT('h.role'), repT('h.org'), repT('h.versions'), repT('h.state')],
        rows: sh.map(s => [s.id, s.name, s.role || '', T(`people.org.${s.org}`), s.versions === true ? '✓' : '', s.inactive ? T('people.inactive') : repT('sh.active')]) }];
      blocks.push({ k: 'h3', t: T('people.mx.title') }, { k: 'p', t: T('people.mx.legend'), muted: true });
      blocks.push({ k: 'table', cls: 'compact', head: [repT('h.stakeholder'), ...cols.map(a => (a === '*' ? T('people.all') : a))], rows: sh.map(s => [s.name, ...cols.map(a => (a === '*' ? s.raci?.['*'] : shRaciOf(s, a)) || '')]) });
      const dec = (m.decisions || []).filter(d => approvalState('decision', d, m).required.length || d.signoffs?.length);
      if (dec.length) {
        blocks.push({ k: 'h3', t: repT('h.decApprovals') });
        blocks.push({ k: 'table', cls: 'wide', head: [repT('h.id'), repT('h.title'), repT('h.status'), repT('h.approvals'), repT('h.pendingNames'), repT('h.rejectedNames')], rows: dec.map(d => {
          const st = approvalState('decision', d, m);
          return [d.id, d.title, T(`adr.st.${d.status}`), st.required.length ? apprSummary(st) : '', apprNames(st.pending, m), apprNames(st.rejected, m)]; }) });
      }
      const ver = (m.versions || []).filter(v => approvalState('version', v, m).required.length || v.signoffs?.length);
      if (ver.length) {
        blocks.push({ k: 'h3', t: repT('h.verApprovals') });
        blocks.push({ k: 'table', cls: 'wide', head: [repT('h.version'), repT('h.status'), repT('h.approvals'), repT('h.pendingNames'), repT('h.rejectedNames')], rows: ver.map(v => {
          const st = approvalState('version', v, m);
          return [verLabel(v), T(`ver.st.${v.status}`), st.required.length ? apprSummary(st) : '', apprNames(st.pending, m), apprNames(st.rejected, m)]; }) });
      }
      sec('approvals', blocks);
    }

    if (want('phases')) {
      // Tabla comparativa y, por fase: nombre, fecha, objetivo, altas y bajas (nombres) y la imagen de la arquitectura en esa fase
      const rows = phaseRows(m, phaseHelpers), names = ids => ids.map(nm).join(', ');
      const blocks = [{ k: 'table', cls: 'wide', head: [repT('h.phase'), repT('h.date'), repT('k.components'), T('phase.cmp.added'), T('phase.cmp.retired'), T('phase.cmp.cost'), T('phase.cmp.delta'), `${T('phase.cmp.findings')} (${SEVERITY.slice().reverse().filter(s => s !== 'critical').map(sevLabel).join(' / ')})`],
        rows: rows.map(r => [r.name, r.date ? fmtPhaseDate(r.date) : '', String(r.nodes), String(r.added), String(r.retired), phaseCostText(r), phaseCostText(r, 'dCost'), `${r.findings.high} / ${r.findings.medium} / ${r.findings.low}`]) }];
      rows.forEach((r, i) => {
        blocks.push({ k: 'h3', t: [r.name, r.date ? fmtPhaseDate(r.date) : ''].filter(Boolean).join(' · ') });
        if (r.goal) blocks.push({ k: 'p', t: r.goal });
        const kv = [[T('phase.cmp.added'), names(r.addedIds)], [T('phase.cmp.retired'), names(r.retiredIds)]].filter(x => x[1]);
        if (kv.length) blocks.push({ k: 'kv', items: kv });
        const im = phImgs.find(x => x.i === i);
        if (im) blocks.push({ k: 'img', alt: `${m.title} — ${r.name}`, svg: im.svg, uri: im.uri, file: im.file });
      });
      sec('phases', blocks);
    }

    if (want('estimation')) {
      // Una fila por fase: días por perfil, costo de construcción, imprevistos y acumulado; al final, el total y los perfiles sin tarifa
      const pe = phaseEffort(m, effortHelpers), roles = [...new Set(pe.rows.flatMap(r => Object.keys(r.byRole)))], rated = pe.rows.some(r => r.cost > 0), phased = !!m.phases?.length;
      const head = [...(phased ? [repT('h.phase')] : []), repT('h.estimated'), ...roles.map(k => `${efInfo(k).label}${efInfo(k).known ? '' : ' ⚠'}`), repT('h.days'), ...(rated ? [repT('h.build'), repT('h.contingency'), repT('h.total'), repT('h.cumulative')] : [])];
      const row = r => [...(phased ? [r.name] : []), `${r.estimated}/${r.comps}`, ...roles.map(k => (r.byRole[k] ? String(r.byRole[k]) : '')), String(r.days), ...(rated ? [money(r.cost), r.contingency ? money(r.contingency) : '', money(r.total), money(r.cumulative)] : [])];
      const t = pe.totals, tot = [...(phased ? [repT('h.sum')] : []), '', ...roles.map(k => String(round2(pe.rows.reduce((a, r) => a + (r.byRole[k] || 0), 0)))), String(t.days), ...(rated ? [money(t.cost), t.contingency ? money(t.contingency) : '', money(t.total), ''] : [])];
      const blocks = [{ k: 'p', t: pe.pct ? T('est.cont', pe.pct) : T('est.cont.none') }, { k: 'table', cls: 'wide', head, rows: [...pe.rows.map(row), tot] }];
      const bad = [...new Set(pe.rows.flatMap(r => r.unrated))];
      if (bad.length) blocks.push({ k: 'p', t: T('est.unrated.tip', bad.join(', ')) });
      sec('estimation', blocks);
    }

    if (want('migration')) {
      // Recuento por disposición y una fila por componente con su disposición y las fases de entrada y de retiro (si hay fases)
      const ph = !!m.phases?.length, cnt = {};
      m.nodes.forEach(n => { if (n.disposition) cnt[n.disposition] = (cnt[n.disposition] || 0) + 1; });
      const blocks = [{ k: 'table', head: [repT('h.disposition'), repT('h.nodes')], rows: Object.keys(MG).filter(k => cnt[k]).map(k => [mgInfo(k).label, String(cnt[k])]) }];
      const head = [repT('h.component'), repT('h.disposition'), ...(ph ? [repT('h.phaseIn'), repT('h.phaseOut')] : []), repT('h.cost')];
      const rows = Object.keys(MG).flatMap(k => m.nodes.filter(n => n.disposition === k).map(n => [n.label, mgInfo(k).label, ...(ph ? [phNm(m, n.phase), phNm(m, n.until)] : []), hasCost(n) ? money(round2(perMonth(n))) : '']));
      blocks.push({ k: 'table', head, rows, cls: 'wide' });
      sec('migration', blocks);
    }

    if (want('radar')) {
      // Recuento por anillo y una fila por componente reconocido: producto, anillo, fin de soporte y sustituto
      const now = today(), rows = m.nodes.map(n => ({ n, i: radarInfo(n, m, now) })).filter(x => x.i), cnt = {};
      rows.forEach(({ i }) => { cnt[i.entry.ring] = (cnt[i.entry.ring] || 0) + 1; });
      const blocks = [{ k: 'table', head: [repT('h.ring'), repT('h.nodes')], rows: RD_KEYS.filter(k => cnt[k]).map(k => [rdRingInfo(k).label, String(cnt[k])]) }];
      const ordered = RD_KEYS.flatMap(k => rows.filter(x => x.i.entry.ring === k));
      blocks.push({ k: 'table', cls: 'wide', head: [repT('h.component'), repT('h.radarProduct'), repT('h.ring'), repT('h.eos'), repT('h.replaceWith')], rows: ordered.map(({ n, i }) => [n.label, i.name, i.ring.label,
        i.eosDay ? { t: fmtDay(i.eosDay), tone: i.status === 'ended' ? 'sev-high' : i.status === 'soon' ? 'sev-medium' : '' } : '', i.replaceWith]) });
      sec('radar', blocks);
    }

    if (want('drift')) {   // diferencias con la infraestructura desplegada que alguien aceptó, con su motivo
      const lab = id => m.nodes.find(n => n.id === id)?.label || id;
      sec('drift', [{ k: 'table', cls: 'wide', head: [repT('h.component'), repT('h.field'), repT('h.accepted'), repT('h.reason'), repT('h.date')], rows: (m.deviations || []).map(d => [lab(d.node), T(`dr.field.${d.field}`), driftShow(d.field, d.field === 'replicas' ? +d.value : d.field === 'backup' ? d.value === 'true' : d.value), d.reason, d.date ? fmtDay(d.date) : '']) }]);
    }

    if (want('versions')) {
      const blocks = [{ k: 'table', cls: 'wide', head: [repT('h.version'), repT('h.env'), repT('h.status'), repT('h.author'), repT('h.created'), repT('h.updated'), repT('h.decided'), repT('h.note')], rows: m.versions.map(v => [
        verLabel(v) + (v.id === m.active ? ` ★ ${repT('activeMark')}` : ''), v.kind === 'env' ? loc(C.environments?.[v.env]?.label) || v.env : '', { t: T(`ver.st.${v.status}`), tone: `vs-${v.status}` }, v.author || '', fmtDay(v.created), fmtDay(v.updated),
        [v.decidedBy, fmtDay(v.decidedOn)].filter(Boolean).join(' · '), [v.reason, v.note].filter(Boolean).join('\n')]) }];
      const hist = m.versions.flatMap(v => (v.history || []).map(h => [verLabel(v), fmtDay(h.date), T(`ver.st.${h.status}`), h.by || '', h.reason || '']));
      if (hist.length) { blocks.push({ k: 'h3', t: T('ver.history') }); blocks.push({ k: 'table', cls: 'compact', head: [repT('h.version'), repT('h.date'), repT('h.status'), repT('h.by'), repT('h.reason')], rows: hist }); }
      sec('versions', blocks);
    }

    if (want('notes')) {
      const blocks = [], zs = (m.zones || []).filter(z => z.kind !== 'trust');
      if (zs.length) { blocks.push({ k: 'h3', t: repT('h.zones2') }); blocks.push({ k: 'table', head: [repT('h.label'), repT('h.severity'), repT('h.detail')], rows: zs.map(z => [z.label || T('zone.new'), sevCell(z.severity), z.desc || '']) }); }
      if ((m.notes || []).length) { blocks.push({ k: 'h3', t: repT('h.notes') }); blocks.push({ k: 'ul', items: m.notes.map(n => n.text).filter(t => String(t).trim()) }); }
      sec('notes', blocks);
    }
    if (want('comments')) {   // hilos sin resolver; los internos nunca salen del documento
      const rows = (m.comments || []).filter(c => !c.internal && c.status !== 'resolved').map(c => [cmTargetText(m, c.on), c.author || '', c.date ? fmtDay(c.date) : '', c.text, (c.replies || []).map(r => `${r.author || T('cmt.anon')}: ${r.text}`).join('\n')]);
      sec('comments', [{ k: 'table', head: [repT('h.about'), repT('h.author'), repT('h.date'), repT('h.comment'), repT('h.replies')], rows, cls: 'wide' }]);
    }
    return D;
  }

  /* Markdown: texto escapado (tablas con barras, # al inicio, etc.) */
  const mdEsc = s => String(s ?? '').replace(/[\\`*_\[\]<>|]/g, '\\$&').replace(/^(\s*)(#|>|[-+]\s|\d+[.)]\s)/gm, '$1\\$2');
  const mdCell = c => (mdEsc(typeof c === 'object' && c ? c.t : c).replace(/\r?\n/g, '<br>').trim() || ' ');
  const mdLines = s => mdEsc(s).replace(/\r?\n/g, '  \n');
  function reportMarkdown(D) {
    const o = [`# ${mdEsc(D.title)}`, '', `*${mdEsc(D.sub || [D.author, D.version, D.active?.label, D.date].filter(Boolean).join(' · '))}*`, ''];
    D.sections.forEach(s => {
      o.push(`## ${mdEsc(s.title)}`, '');
      s.blocks.forEach(b => {
        if (b.k === 'h3') o.push(`### ${mdEsc(b.t)}`, '');
        else if (b.k === 'h4') o.push(`#### ${mdEsc(b.t)}`, '');
        else if (b.k === 'p') o.push(b.muted ? `*${mdEsc(b.t)}*` : mdLines(b.t), '');
        else if (b.k === 'kv') o.push(...b.items.map(([k, v]) => `- **${mdEsc(k)}:** ${mdEsc(v).replace(/\r?\n/g, ' ')}`), '');
        else if (b.k === 'ul') o.push(...b.items.map(t => `- ${mdEsc(t).replace(/\r?\n/g, ' ')}`), '');
        else if (b.k === 'text') o.push(`**${mdEsc(b.label)}**`, '', mdLines(b.t), '');
        else if (b.k === 'cards') o.push(`| ${b.items.map(c => mdCell(c.label)).join(' | ')} |`, `|${b.items.map(() => ' --- |').join('')}`, `| ${b.items.map(c => mdCell(String(c.value))).join(' | ')} |`, '');
        else if (b.k === 'table') {
          if (!b.rows.length) return;
          const hd = b.mdHead || b.head;
          o.push(`| ${hd.map(mdCell).join(' | ')} |`, `|${hd.map(() => ' --- |').join('')}`, ...b.rows.map(r => `| ${r.map(mdCell).join(' | ')} |`), '');
        } else if (b.k === 'img') o.push(`![${mdEsc(b.alt)}](${b.file ? encodeURI(b.file) : b.uri})`, '');
      });
    });
    o.push('---', '', `*${mdEsc(repT('footer', { app: C.app.name, date: D.date }))}*`, '');
    return o.join('\n');
  }

  // Rejilla de cumplimiento para el informe: filas = componentes, columnas = controles (cabecera de marcos con colspan + ids); celda = símbolo + tono, «↑» si es heredado
  function cmpGridBlock(rows, ks) {
    if (!rows.length || !ks.length) return null;
    const fws = cmpFrameworks(ks), cut = t => (t.length > 28 ? `${t.slice(0, 27)}…` : t);
    return { k: 'table', cls: 'grid', group: fws.map(f => [ctlInfo(`${f}:x`).short, ks.filter(k => ctlSplit(k)[0] === f).length]),
      head: [repT('h.component'), ...ks.map(k => ctlSplit(k)[1])], mdHead: [repT('h.component'), ...ks.map(k => (fws.length > 1 ? `${ctlInfo(k).short} ` : '') + ctlSplit(k)[1])],
      rows: rows.map(r => [{ t: cut(r.n.label), title: r.n.label }, ...ks.map(k => {
        const e = r.eff.get(k);
        return e ? { t: CTL_SYM[e.status] + (e.from ? '↑' : ''), tone: `st-${e.status}${e.from ? ' inh' : ''}`, title: `${ctlInfo(k).short} ${ctlSplit(k)[1]}: ${T(`cmp.${e.status}`)}${e.from ? ` (${T('cmp.inh', groupById(e.from)?.label || e.from)})` : ''}` } : '';
      })]) };
  }

  /* HTML autocontenido (también el que se imprime a PDF): sin red, sin scripts, imágenes como data URI */
  const REP_CSS = `*{box-sizing:border-box}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;padding:24px 20px;background:#fff;color:#1b1a22;font:10.5pt/1.5 __FONT__;}
main,header,nav{max-width:1000px;margin:0 auto}
h1{margin:0 0 4px;font-size:26pt;line-height:1.15}h2{margin:30px 0 10px;padding-bottom:5px;border-bottom:2px solid #6b5bd2;font-size:15pt}h3{margin:18px 0 6px;font-size:11.5pt}h4{margin:10px 0 2px;font-size:9.5pt;text-transform:uppercase;letter-spacing:.05em;color:#6b6778}
p{margin:0 0 8px}.muted{color:#6b6778;font-size:9.5pt}.sub{margin:0 0 14px;color:#6b6778;font-size:11pt}
nav ol{margin:6px 0 0;padding-left:20px;columns:2;font-size:10pt}nav a{color:#4b3fb5;text-decoration:none}
dl{display:grid;grid-template-columns:max-content 1fr;gap:3px 14px;margin:0 0 12px}dt{font-weight:700;color:#4a4757}dd{margin:0}
.cards{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 12px}.card{min-width:110px;padding:8px 12px;border:1px solid #d6d3e0;border-radius:8px;background:#f6f5fb}.card b{display:block;font-size:16pt;line-height:1.2}.card span{font-size:8.5pt;color:#6b6778;text-transform:uppercase;letter-spacing:.04em}
table{width:100%;border-collapse:collapse;margin:6px 0 14px;font-size:8.5pt}table.compact{width:auto;min-width:50%}th,td{padding:4px 6px;border:1px solid #d6d3e0;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#efedf8;font-weight:700}
thead{display:table-header-group}tr{break-inside:avoid}table.wide{font-size:8pt}
table.grid{width:auto;max-width:100%;font-size:8pt}table.grid th{text-align:center}table.grid th:first-child,table.grid td:first-child{text-align:left;max-width:48mm}table.grid td{text-align:center;white-space:nowrap}table.grid td.inh{font-style:italic;background:#f6f5fb}
.txt p{white-space:pre-wrap;margin:0 0 6px}ul{margin:0 0 10px;padding-left:20px}
figure{margin:6px 0 14px;break-inside:avoid}figure img{display:block;max-width:100%;height:auto;border:1px solid #d6d3e0;border-radius:6px}
.sev-low{color:#2f7d4f;font-weight:700}.sev-medium{color:#9a6b00;font-weight:700}.sev-high{color:#b4361f;font-weight:700}.sev-critical{color:#fff;background:#b4361f;font-weight:700}
.st-met{color:#2f7d4f}.st-partial{color:#9a6b00}.st-gap{color:#b4361f;font-weight:700}.st-na{color:#6b6778}.rev-open{color:#9a6b00}.rev-overdue{color:#b4361f;font-weight:700}.rev-resolved{color:#2f7d4f}
.vs-approved{color:#2f7d4f;font-weight:700}.vs-rejected{color:#b4361f;font-weight:700}.vs-review{color:#9a6b00}.total{font-weight:700;background:#f6f5fb}
footer{max-width:1000px;margin:28px auto 0;padding-top:8px;border-top:1px solid #d6d3e0;color:#6b6778;font-size:8.5pt}
@page{size:A4;margin:18mm 14mm 18mm;@top-left{content:__TITLE__;font:8pt sans-serif;color:#6b6778}@bottom-right{content:counter(page) " / " counter(pages);font:8pt sans-serif;color:#6b6778}}
@media print{body{padding:0}h2,h3{break-after:avoid}.pb{break-before:page}}`;
  function reportHTML(D) {
    const cell = c => { const t = typeof c === 'object' && c ? c.t : c, tone = typeof c === 'object' && c?.tone ? ` class="${esc(c.tone)}"` : '', tt = typeof c === 'object' && c?.title ? ` title="${esc(c.title)}"` : ''; return `<td${tone}${tt}>${esc(t).replace(/\r?\n/g, '<br>')}</td>`; };
    const css = REP_CSS.replace('__FONT__', fontCss().replace(/"/g, "'")).replace('__TITLE__', `"${String(D.title).replace(/[\\"]/g, '\\$&').replace(/[\r\n]+/g, ' ')}"`);
    const blk = b => {
      if (b.k === 'h3') return `<h3>${esc(b.t)}</h3>`;
      if (b.k === 'h4') return `<h4>${esc(b.t)}</h4>`;
      if (b.k === 'p') return `<p${b.muted ? ' class="muted"' : ''}>${esc(b.t).replace(/\r?\n/g, '<br>')}</p>`;
      if (b.k === 'kv') return `<dl>${b.items.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v).replace(/\r?\n/g, '<br>')}</dd>`).join('')}</dl>`;
      if (b.k === 'ul') return `<ul>${b.items.map(t => `<li>${esc(t).replace(/\r?\n/g, '<br>')}</li>`).join('')}</ul>`;
      if (b.k === 'text') return `<div class="txt"><h4>${esc(b.label)}</h4><p>${esc(b.t)}</p></div>`;
      if (b.k === 'cards') return `<div class="cards">${b.items.map(c => `<div class="card"><b${c.tone ? ` class="${esc(c.tone)}"` : ''}>${esc(c.value)}</b><span>${esc(c.label)}</span></div>`).join('')}</div>`;
      if (b.k === 'table') return b.rows.length ? `<table${b.cls ? ` class="${esc(b.cls)}"` : ''}><thead>${b.group ? `<tr><th rowspan="2">${esc(b.head[0])}</th>${b.group.map(([g, n]) => `<th colspan="${n}">${esc(g)}</th>`).join('')}</tr><tr>${b.head.slice(1).map(h => `<th>${esc(h)}</th>`).join('')}</tr>` : `<tr>${b.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr>`}</thead><tbody>${b.rows.map(r => `<tr>${r.map(cell).join('')}</tr>`).join('')}</tbody></table>` : '';
      if (b.k === 'img') return `<figure><img src="${esc(b.uri || '')}" alt="${esc(b.alt)}"></figure>`;
      return '';
    };
    const csp = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";
    return `<!doctype html>
<html lang="${esc(D.lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}">
<title>${esc(D.title)}</title><style>${css}</style></head><body>
<header><h1>${esc(D.title)}</h1><p class="sub">${esc(D.sub || [D.author, D.version, D.active?.label, D.date].filter(Boolean).join(' · '))}</p></header>
<nav aria-label="${esc(repT('toc'))}"><ol>${D.sections.map(s => `<li><a href="#rep-${esc(s.id)}">${esc(s.title)}</a></li>`).join('')}</ol></nav>
<main>${D.sections.map(s => `<section id="rep-${esc(s.id)}"${REP_PAGE.includes(s.id) ? ' class="pb"' : ''}><h2>${esc(s.title)}</h2>${s.blocks.map(blk).join('')}</section>`).join('\n')}</main>
<footer>${esc(repT('footer', { app: C.app.name, date: D.date }))}</footer></body></html>`;
  }

  // PDF: sin biblioteca; el documento se imprime desde un iframe oculto y el navegador ofrece «Guardar como PDF»
  function repPrint(html) {
    return new Promise((res, rej) => {
      const f = document.createElement('iframe');
      f.setAttribute('aria-hidden', 'true'); f.setAttribute('tabindex', '-1');
      f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
      f.onload = async () => {
        try {
          const w = f.contentWindow, d = f.contentDocument;
          for (let i = 0; i < 100 && ![...d.images].every(im => im.complete); i++) await repSleep(100);
          w.focus();
          w.addEventListener('afterprint', () => setTimeout(() => f.remove(), 300), { once: true });
          setTimeout(() => f.remove(), 600000);
          w.print();
          res();
        } catch (err) { f.remove(); rej(err); }
      };
      f.srcdoc = html;
      document.body.appendChild(f);
    });
  }
  let repBusy = false;
  // API: Promise con el texto generado (HTML o Markdown) tras lanzar la descarga o la impresión; '' si no se pudo
  async function exportReport(o = {}) {
    if (repBusy || ctx.viewBusy || ctx.P) return '';
    const format = ['pdf', 'md', 'html'].includes(o.format) ? o.format : 'pdf';
    const opts = { format, sections: Array.isArray(o.sections) ? o.sections : REP_SECS, views: Array.isArray(o.views) ? o.views : repDefaultViews(), scopes: o.scopes !== false && repScopes().length > 0,
      theme: o.theme === 'current' ? 'current' : 'light', separateImages: format === 'md' && !!o.separateImages, progress: o.progress };
    repBusy = true;
    try {
      const D = await reportData(opts);
      if (format === 'md') {
        const md = reportMarkdown(D);
        download(md, fileName('md', 'report'), 'text/markdown;charset=utf-8');
        for (const f of D.files) { await repSleep(350); download(f.blob, f.name); }
        return md;
      }
      const html = reportHTML(D);
      if (format === 'html') download(html, fileName('html', 'report'), 'text/html;charset=utf-8'); else await repPrint(html);
      return html;
    } finally { repBusy = false; }
  }
  function openReportDialog() {
    if (ctx.viewBusy || repBusy || ctx.P) return;
    const prev = document.activeElement, id = `rp${Date.now()}`, av = repAvail(), scopes = repScopes();
    const saved = store.get('report', {}) || {}, fmt0 = ['pdf', 'md', 'html'].includes(saved.format) ? saved.format : 'pdf';
    const secOn = k => av[k] && (!Array.isArray(saved.sections) || saved.sections.includes(k));
    const defViews = repDefaultViews();
    const back = document.createElement('div');
    back.className = 'cf-back';
    back.innerHTML = `<form class="cf share rep" role="dialog" aria-modal="true" aria-labelledby="${id}t" autocomplete="off">
      <h3 id="${id}t">${esc(repT('title'))}</h3>
      <p>${esc(repT('lead'))}</p>
      <fieldset class="sh-views"><legend>${esc(repT('format'))}</legend>${['pdf', 'md', 'html'].map(k => `<label class="sh-chk"><input type="radio" name="fmt" value="${k}"${k === fmt0 ? ' checked' : ''}>${esc(repT(`fmt.${k}`))}</label>`).join('')}<small class="sh-size" data-rep="hint"></small></fieldset>
      <fieldset class="sh-views"><legend>${esc(repT('sections'))}</legend>${REP_SECS.map(k => `<label class="sh-chk rep-sec${av[k] ? '' : ' rep-none'}"><input type="checkbox" name="sec" value="${k}"${secOn(k) ? ' checked' : ''}${av[k] ? '' : ' disabled'}>${esc(repT(`s.${k}`))}${av[k] ? '' : ` <small>${esc(repT('none'))}</small>`}</label>`).join('')}</fieldset>
      <fieldset class="sh-views" data-rep="views"><legend>${esc(repT('views'))}</legend>${VIEW_KEYS.map(k => `<label class="sh-chk"><input type="checkbox" name="views" value="${esc(k)}"${defViews.includes(k) ? ' checked' : ''}>${esc(viewLabel(k))}</label>`).join('')}
        ${scopes.length ? `<label class="sh-chk"><input type="checkbox" name="scopes"${saved.scopes === false ? '' : ' checked'}>${esc(repT('scopes'))}</label>` : ''}</fieldset>
      <label>${esc(repT('theme'))}<select name="theme"><option value="light">${esc(repT('theme.light'))}</option><option value="current"${saved.theme === 'current' ? ' selected' : ''}>${esc(repT('theme.current'))}</option></select></label>
      <label class="sh-chk" data-rep="sep"><input type="checkbox" name="sep"${saved.sep ? ' checked' : ''}>${esc(repT('sep'))}</label>
      <p class="sh-err" role="alert" data-rep="msg"></p>
      <div class="cf-actions"><button type="button" class="btn" data-rep="no">${esc(T('ver.cf.cancel'))}</button><button type="submit" class="btn primary">${esc(repT('create'))}</button></div>
    </form>`;
    const form = back.querySelector('form'), msg = form.querySelector('[data-rep="msg"]'), hint = form.querySelector('[data-rep="hint"]');
    const close = () => { document.removeEventListener('keydown', key, true); back.remove(); prev?.focus?.(); };
    const key = ev => { if (ev.key === 'Escape' && !form.classList.contains('busy')) { ev.preventDefault(); ev.stopPropagation(); close(); } };
    const fmtNow = () => form.elements.fmt.value;
    const sync = () => {
      form.querySelector('[data-rep="sep"]').hidden = fmtNow() !== 'md';
      hint.textContent = repT(`hint.${fmtNow()}`);
      const dia = form.querySelector('input[name="sec"][value="diagram"]').checked;
      form.querySelectorAll('[data-rep="views"] input, select[name="theme"]').forEach(i => { i.disabled = !dia; });
      msg.textContent = '';
    };
    form.addEventListener('change', sync);
    form.addEventListener('click', ev => { if (ev.target.closest('[data-rep="no"]')) close(); });
    back.addEventListener('mousedown', ev => { if (ev.target === back && !form.classList.contains('busy')) close(); });
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      if (form.classList.contains('busy')) return;
      const sections = [...form.querySelectorAll('input[name="sec"]:checked')].map(i => i.value), views = [...form.querySelectorAll('input[name="views"]:checked')].map(i => i.value);
      if (!sections.length) { msg.textContent = repT('noSec'); return; }
      if (sections.includes('diagram') && !views.length) { msg.textContent = repT('noViews'); return; }
      const opts = { format: fmtNow(), sections, views, scopes: !!form.elements.scopes?.checked, theme: form.elements.theme.value, separateImages: !!form.elements.sep.checked };
      store.set('report', { format: opts.format, sections, scopes: scopes.length ? opts.scopes : saved.scopes, theme: opts.theme, sep: opts.separateImages });
      const btn = form.querySelector('[type="submit"]');
      form.classList.add('busy'); btn.textContent = repT('busy');
      opts.progress = (i, n, name) => { msg.style.color = 'var(--muted)'; msg.textContent = repT('progress', { i, n, name }); toast(repT('progress', { i, n, name }), 60000); };
      try {
        const out = await exportReport(opts);
        if (!out) throw new Error('report');
        close();
        toast(repT(opts.format === 'pdf' ? 'donePdf' : 'done'), 4200);
      } catch (err) {
        console.error('report', err);
        form.classList.remove('busy'); btn.textContent = repT('create');
        msg.style.color = ''; msg.textContent = repT('fail'); toast(repT('fail'), 3000);
      }
    });
    document.addEventListener('keydown', key, true);
    document.body.appendChild(back);
    sync();
    form.querySelector('[type="submit"]').focus();
  }

  // Informe de estado: elige la referencia (la última versión guardada, otra versión o una fecha) y las secciones; la vista previa es el texto que se copia o se descarga en Markdown o HTML
  const ST_KEYS = ['decisions', 'risks', 'phases', 'components', 'money', 'pending', 'comments', 'versions'];
  function openStatusDialog() {
    if (ctx.P) return;
    const prev = document.activeElement, id = `st${Date.now()}`, m = S.model, saved = store.get('statusReport', {}) || {};
    const vs = [...m.versions].filter(v => v.diagram).sort((a, b) => String(b.updated || b.created).localeCompare(String(a.updated || a.created)));
    const lastV = vs[0], week = (() => { const d = new Date(); d.setDate(d.getDate() - 7); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
    const kind0 = saved.kind === 'date' || !lastV ? 'date' : saved.kind && saved.kind !== 'last' && vs.some(v => `v:${v.id}` === saved.kind) ? saved.kind : 'last';
    const secOn = k => !Array.isArray(saved.sections) || saved.sections.includes(k);
    const back = document.createElement('div');
    back.className = 'cf-back';
    back.innerHTML = `<form class="cf share rep" role="dialog" aria-modal="true" aria-labelledby="${id}t" autocomplete="off">
      <h3 id="${id}t">${esc(T('stat.title'))}</h3>
      <p>${esc(T('stat.d.lead'))}</p>
      <label>${esc(T('stat.d.ref'))}<select name="ref">${lastV ? `<option value="last"${kind0 === 'last' ? ' selected' : ''}>${esc(T('stat.d.last', { label: verLabel(lastV), day: fmtDay(lastV.updated || lastV.created) }))}</option>` : ''}${vs.map(v => `<option value="v:${esc(v.id)}"${kind0 === `v:${v.id}` ? ' selected' : ''}>${esc(`${verLabel(v)} · ${fmtDay(v.updated || v.created)}`)}</option>`).join('')}<option value="date"${kind0 === 'date' ? ' selected' : ''}>${esc(T('stat.d.date'))}</option></select></label>
      <label data-st="day">${esc(T('stat.d.day'))}<input type="date" name="day" value="${esc(week)}"></label>
      <fieldset class="sh-views"><legend>${esc(T('stat.d.sections'))}</legend>${ST_KEYS.map(k => `<label class="sh-chk"><input type="checkbox" name="sec" value="${k}"${secOn(k) ? ' checked' : ''}>${esc(T(`stat.s.${k}`))}</label>`).join('')}</fieldset>
      <label>${esc(T('stat.d.preview'))}<textarea name="prev" rows="12" readonly></textarea></label>
      <p class="sh-err" role="alert" data-st="msg"></p>
      <div class="cf-actions"><button type="button" class="btn" data-st="no">${esc(T('ver.cf.cancel'))}</button><button type="button" class="btn" data-st="copy">${esc(T('stat.d.copy'))}</button><button type="button" class="btn" data-st="md">${esc(T('stat.d.md'))}</button><button type="button" class="btn primary" data-st="html">${esc(T('stat.d.html'))}</button></div>
    </form>`;
    const form = back.querySelector('form'), msg = form.querySelector('[data-st="msg"]');
    const close = () => { document.removeEventListener('keydown', key, true); back.remove(); prev?.focus?.(); };
    const key = ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); } };
    const spec = () => { const r = form.elements.ref.value; return r === 'date' ? { kind: 'date', day: form.elements.day.value } : r === 'last' ? { kind: 'last' } : { kind: 'version', id: r.slice(2) }; };
    const keys = () => [...form.querySelectorAll('input[name="sec"]:checked')].map(i => i.value);
    const out = fmt => statusOutput({ ...spec(), sections: keys(), format: fmt });
    const ok = () => !!statusReport(spec()).data.baseDay;
    const sync = () => {
      form.querySelector('[data-st="day"]').hidden = form.elements.ref.value !== 'date';
      const r = statusReport(spec()), have = new Set(r.text.sections.map(x => x.k));
      form.querySelectorAll('input[name="sec"]').forEach(i => { i.disabled = !have.has(i.value); i.parentElement.classList.toggle('rep-none', !have.has(i.value)); });
      form.elements.prev.value = statusOutput({ ...spec(), sections: keys(), format: 'text' });
      form.querySelectorAll('[data-st="copy"],[data-st="md"],[data-st="html"]').forEach(b => { b.disabled = !r.data.baseDay; });
      msg.textContent = '';
    };
    form.addEventListener('change', () => { store.set('statusReport', { kind: form.elements.ref.value === 'date' ? 'date' : form.elements.ref.value, sections: keys() }); sync(); });
    form.addEventListener('click', ev => {
      const b = ev.target.closest('[data-st]');
      if (!b || b.tagName !== 'BUTTON') return;
      if (b.dataset.st === 'no') close();
      else if (!ok()) msg.textContent = T('stat.empty');
      else if (b.dataset.st === 'copy') {
        const txt = out('text'), fallback = () => { form.elements.prev.select(); try { document.execCommand('copy'); toast(T('toast.copied')); } catch { toast(T('toast.copyFail')); } };
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(txt).then(() => toast(T('toast.copied')), fallback); else fallback();
      } else if (b.dataset.st === 'md') { download(out('md'), fileName('md', 'status'), 'text/markdown;charset=utf-8'); toast(T('stat.d.done'), 3000); }
      else if (b.dataset.st === 'html') { download(out('html'), fileName('html', 'status'), 'text/html;charset=utf-8'); toast(T('stat.d.done'), 3000); }
    });
    back.addEventListener('mousedown', ev => { if (ev.target === back) close(); });
    document.addEventListener('keydown', key, true);
    document.body.appendChild(back);
    sync();
    form.elements.ref.focus();
  }

  return { exportReport, openReportDialog, openStatusDialog, reportHTML, reportMarkdown };
} };
