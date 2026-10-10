/* ==========================================================================
   Diagramon · interfaz: exportar a otras herramientas, inventario (CSV/Excel) e importar dbt
   --------------------------------------------------------------------------
   Movido desde src/app.js (v2), sin cambios de comportamiento.
   API: window.DiagramonUI.exportother
   ========================================================================== */
window.DiagramonUI = window.DiagramonUI || {};
// ctx: lo que esta pieza necesita de la app. Valores ya definidos al crearla pasan directos; el resto, como envolturas que se llaman al usarse.
window.DiagramonUI.exportother = { create(ctx) {
  'use strict';
  const C = window.DIAGRAMON_CONFIG;
  const I = window.DiagramonI18n, T = I.T, loc = I.loc;
  const { clone, esc, fold } = window.DiagramonCore.util;
  const { R, S } = window.DiagramonCore.state;
  const { toast } = window.DiagramonUI.dialogs;
  const { COLOR_ALIAS, CTL_STATUS, DATA, DL, DL_ALIAS, DS_MAX, EDGE_W, H, PERIODS, allFindings, apprWho, backupOf, c4Label, cleanCatalog, cleanRegion, controlsOf, crossBorder, ctlInfo, ctlSplit, dataClassesOf, decisionsOf, download, dsFind, dsHelpers, dsK, dsPrices, e2eOf, edgeKey, edgeMult, edgeStyleLabel, edgeStyleOf, efDaysOf, effortHelpers, ensureDocId, exposureOf, fileName, fmtDur, govOf, govTeamList, groupChain, groupKind, hasCost, iconInfo, importIntoScope, isInsecure, jurOf, layerInfo, layerOf, mgInfo, monthlyTotal, nodeWidth, normHex, openFeedbackImport, perMonth, periodOf, phaseDiff, phaseEffort, phaseStats, radarEntries, radarInfo, radarOf, raidScore, raidState, regionOf, reqCheck, reviewState, round2, scopeList, scopePath, serialize, setModel, sevLabel, storageEstimate, strideAll, toCSV, today, typeLabel, typeOf, verLabel, yearsOf, dsCommit, reqCheckText, reqCoveredBy, srcLabel } = ctx;

  /* ---------- exportar a otras herramientas (src/export/*.js) ----------
     Cada exportador recibe una copia del diagrama y este contexto, y devuelve { text, ext, mime }. */
  const hexOf = k => {
    const pal = C.palettes[S.palette]?.light || {}, key = COLOR_ALIAS[k] || k;
    return pal[key] || normHex(k);  // los exportadores esperan #RRGGBB
  };
  function exportCtx() {
    const m = S.model, byId = new Map(m.nodes.map(n => [n.id, n]));
    const nodeHex = n => hexOf(n?.color) || hexOf(typeOf(n || {}).color) || hexOf(C.palettes[S.palette]?.accent) || '#8573DB';
    return {
      title: m.title, lang: I.lang,
      direction: (m.direction || C.layout.direction) === 'TB' ? 'TB' : 'LR',
      routing: m.routing === 'elbow' ? 'elbow' : 'curved',
      typeLabel,
      edgeStyleLabel,
      // Estilo ya resuelto (también los propios del diagrama) para los exportadores: { id, label, dash, width, particles, custom, weight }
      edgeStyleInfo: e => { const id = edgeKey(e?.style), c = edgeStyleOf(id); return { id, label: loc(c.label), dash: c.dash || '', width: c.width, particles: c.particles, custom: !!c.custom, color: c.color ? hexOf(c.color) : null, weight: EDGE_W[e?.weight] ? e.weight : '', mult: edgeMult(e) }; },
      color: x => (!x ? '#8573DB' : 'from' in x ? hexOf(x.color) || hexOf(edgeStyleOf(x.style).color) || nodeHex(byId.get(x.from)) : 'type' in x ? nodeHex(x) : hexOf(x.color) || '#776F84'),
      dataLabel: k => (DATA[k] ? { short: loc(DATA[k].short) || k.toUpperCase(), label: loc(DATA[k].label) || k, sensitive: !!DATA[k].sensitive } : { short: String(k).toUpperCase(), label: String(k), sensitive: false }),
      icon: ref => { const i = iconInfo(ref); return i ? { src: i.src, label: i.label } : null; },
      size: n => ({ w: R.width.get(n.id) || nodeWidth(n), h: H }),
      groupBox: id => { const b = R.gbox.get(id); return b ? { x: b.x, y: b.y, w: b.w, h: b.h } : null; },
      ...exportMetaCtx(m)
    };
  }
  /* ---------- exportar a otras herramientas: metadatos, notas, zonas y niveles C4 (común a los tres exportadores) ---------- */
  // meta(x) → [{ key, label, value }] con los campos de gobierno, seguridad y operación (ya heredados y en el idioma de la interfaz)
  function exportMetaCtx(m) {
    const rows = new Map(inventoryRows(m).map(r => [r.id, r]));
    const NODE_KEYS = ['c4', 'owner', 'steward', 'team', 'costCenter', 'region', 'data', 'layer', 'exposure', 'backup', 'sla', 'rpo', 'rto', 'replicas', 'perMonth', 'compliance'];
    const lab = k => T(`inv.c.${k}`);
    const yn = v => T(v ? 'sec.yes' : 'sec.no');
    const meta = x => {
      if (!x) return [];
      const out = [], add = (key, value) => { if (value !== '' && value != null) out.push({ key, label: key === 'threats' ? T('stride.label') : lab(key), value: String(value) }); };
      if ('from' in x) {
        add('data', (x.data || []).map(k => loc(DATA[k]?.short) || String(k).toUpperCase()).join(' '));
        if (typeof x.encrypted === 'boolean') add('encrypted', yn(x.encrypted));
        add('datasets', (x.datasets || []).join(', '));
        if (x.transferOk) add('transferOk', yn(true));
        add('threats', Object.entries(x.threats || {}).map(([k, d]) => `${k}=${T(`stride.st.${d.status}`)}${d.note ? ` (${d.note})` : ''}`).join('; '));
        add('adrs', decisionsOf('edges', x.id, m).map(d => d.id).join(','));
      } else if ('type' in x) {
        const r = rows.get(x.id) || {};
        // Exposición y respaldo deducidos solo cuando aportan: exposición pública o valores puestos a mano
        const skip = k => (k === 'backup' && typeof x.backup !== 'boolean') || (k === 'exposure' && !x.exposure && r.exposure !== T('sec.expo.public'));
        NODE_KEYS.forEach(k => { if (!skip(k)) add(k, r[k]); });
        add('adrs', decisionsOf('nodes', x.id, m).map(d => d.id).join(','));
      } else {
        ['owner', 'steward', 'team', 'costCenter'].forEach(k => add(k, String(x[k] ?? '').trim()));
        add('region', String(x.region ?? '').trim());
        add('layer', x.layer ? layerInfo(x.layer)?.label || x.layer : '');
        add('compliance', Object.entries(x.controls || {}).map(([k, v]) => `${k}=${T(`cmp.${v}`)}`).join(', '));
        add('adrs', decisionsOf('groups', x.id, m).map(d => d.id).join(','));
      }
      return out;
    };
    const hexIn = v => (/#[0-9a-f]{6}\b/i.exec(String(v || '')) || [])[0] || null;
    return {
      meta,
      // Niveles C4: nodos con diagrama interno (por profundidad) y etiqueta de su tipo C4
      levels: scopeList(m).filter(l => l.id).map(l => ({ id: l.id, label: l.label, depth: l.depth, path: l.path })),
      c4Label,
      sevLabel, sevHex: k => ({ low: '#4E9AD8', medium: '#C4A63A', high: '#E0965A', critical: '#E2806F' })[k] || '#C4A63A',
      layerLabel: k => layerInfo(k)?.label || k, layerHex: k => hexIn(DL[k]?.color),
      noteHex: k => hexOf(k) || hexOf('limon') || '#C4A63A',
      // Decisiones (ADR) y hallazgos descartados: los exportadores los escriben como comentarios, atributos o una página aparte
      adrStatus: k => T(`adr.st.${k}`),
      // → [{ id, title, target: { kind, id } | null, reason, by, date }]; un hallazgo que ya no existe sale con título vacío y sin destino
      dismissed: () => {
        const byId = new Map(allFindings(m).map(f => [f.id, f]));
        return Object.entries(m.dismissed || {}).filter(([id]) => byId.get(id)?.source !== 'review').map(([id, d]) => { const f = byId.get(id); return { id, title: f?.title || '', target: f?.target ? { kind: f.target.kind, id: f.target.id } : null, reason: d.reason || '', by: d.by || '', date: d.date || '' }; });
      },
      words: { adrs: T('tab.adr.tip'), adrContext: T('adr.f.context'), adrDecision: T('adr.f.decision'), adrConsequences: T('adr.f.consequences'), adrDeciders: T('adr.f.deciders'), adrStatusL: T('adr.f.status'), adrLinks: T('adr.f.links'), dismissed: T('rep.dismissed'), weightHigh: T('leg.w.high'), weightCritical: T('leg.w.critical'), note: T('insp.note'), zone: T('insp.zone'), trust: T('insp.trust'), threats: T('stride.label'), level: T('inv.c.level') }
    };
  }
  function exportOther(fmt) {
    const fn = window.DiagramonExport?.[fmt];
    if (!fn) return;
    try {
      const model = clone({ ...S.model, versions: undefined, active: undefined });
      const out = fn(model, exportCtx());
      download(out.text, fileName(out.ext), out.mime || 'text/plain');
      toast(T('toast.exported', { name: T(`exp.${fmt}`) }));
    } catch (e) { console.error(e); toast(T('toast.exportFail')); }
  }
  // Contratos de datos (ODCS, src/export/datacontract.js): un archivo por conjunto, o todos en uno (documentos YAML separados por ---)
  const contractYaml = v => { const d = dsFind(v); return d && window.DiagramonContract ? window.DiagramonContract.toODCS(clone(d), clone({ ...S.model, versions: undefined, active: undefined })) : ''; };
  const contractsYaml = () => (S.model.datasets?.length && window.DiagramonContract ? window.DiagramonContract.toODCSAll(clone({ ...S.model, versions: undefined, active: undefined })) : '');
  function saveContract(text, name) {
    if (!text) return toast(T('toast.exportFail'));
    download(text, name, 'application/yaml');
    toast(T('toast.exported', { name: T('exp.contracts') }));
  }
  function exportContract(id) { const d = dsFind(id); if (d) saveContract(contractYaml(d.id), `${fold(d.name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'dataset'}.odcs.yaml`); }
  const exportContracts = () => saveContract(contractsYaml(), 'data-contracts.odcs.yaml');
  function exportJSON() { ensureDocId(); download(serialize(S.model, true), fileName('json'), 'application/json'); toast(T('toast.json')); }
  function copyJSON() {
    const txt = serialize(S.model, true);
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = txt; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast(T('toast.copied')); } catch { toast(T('toast.copyFail')); }
      ta.remove();
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(txt).then(() => toast(T('toast.copied')), fallback);
    else fallback();
  }
  /* ---------- inventario exportable (CSV / Excel) ---------- */
  // Una fila por componente (todos los niveles C4) y varias tablas de apoyo, para CMDB o auditoría. Excel: src/export/xlsx.js (sin librerías).
  // Las ayudas opcionales se protegen con typeof para que la exportación siga funcionando si una función se quita.
  const INV_COMP = [['id'], ['name'], ['detail'], ['type'], ['provider'], ['service'], ['category'], ['c4'], ['level'], ['group'], ['owner'], ['steward'], ['team'], ['costCenter'], ['inherited'], ['region'], ['jurisdiction'],
    ['data'], ['sensitive'], ['layer'], ['exposure'], ['backup'], ['encIn', 'int'], ['encOut', 'int'], ['unencSens', 'int'], ['sla', 'sla'], ['rpo'], ['rto'], ['replicas', 'int'], ['cost', 'money'], ['period'], ['perMonth', 'money'], ['perYear', 'money'],
    ['review'], ['findings', 'int'], ['adrs'], ['compliance'], ['desc']];
  const INV_CONN = [['id'], ['from'], ['to'], ['label'], ['style'], ['weight'], ['custom'], ['encrypted'], ['data'], ['datasets'], ['crossBorder'], ['transferOk'], ['threats', 'int']];
  const INV_TYPE = [['id'], ['label'], ['dash'], ['color'], ['width'], ['particles', 'int'], ['uses', 'int']];
  const INV_GROUP = [['id'], ['name'], ['parent'], ['kind'], ['region'], ['layer'], ['owner'], ['team'], ['costCenter'], ['count', 'int'], ['monthly', 'money']];
  const INV_OWNER = [['team'], ['owners'], ['stewards'], ['components', 'int'], ['monthly', 'money']];
  const INV_ADR = [['id'], ['title'], ['status'], ['date'], ['links']];
  const INV_REQ = [['id'], ['title'], ['kind'], ['priority'], ['status'], ['source'], ['coveredBy'], ['check'], ['result']];
  const INV_RAID = [['id'], ['type'], ['title'], ['status'], ['owner'], ['probability'], ['impact'], ['score'], ['mitigation'], ['due'], ['raised'], ['links'], ['detail']];
  const INV_SH = [['id'], ['name'], ['role'], ['org'], ['raci'], ['versions'], ['inactive']];
  const INV_DS = [['id'], ['name'], ['domain'], ['layer'], ['owner'], ['steward'], ['product'], ['data'], ['format'], ['freshness'], ['e2e'], ['frState'], ['perDay'], ['retention', 'int'], ['estGb'], ['estMonthly', 'money'], ['phase'], ['contractVersion'], ['status'], ['consumers']];
  const INV_DSC = [['dsId'], ['dsName'], ['column'], ['type'], ['key'], ['pii'], ['nullable'], ['desc']], INV_DSQ = [['dsId'], ['dsName'], ['rule'], ['column'], ['param'], ['severity']];   // hojas Columns y Quality del catálogo de datos
  const INV_RADAR = [['radar'], ['radarEos']];   // columnas Radar y Fin de soporte (solo si algún componente coincide con el radar)
  const INV_MIG = [['disposition']];   // columna Disposición (solo si algún componente la tiene)
  const INV_PH = [['phase'], ['until']];   // columnas de fase de componentes y conexiones (solo si el diagrama tiene fases)
  const INV_EST = [['phase'], ['components', 'int'], ['estimated', 'int'], ['days'], ['extraDays'], ['build', 'money'], ['contingency', 'money'], ['total', 'money'], ['cumulative', 'money']];   // hoja Estimación (solo si algo tiene esfuerzo)
  const INV_PHASE = [['id'], ['name'], ['date'], ['goal'], ['components', 'int'], ['added', 'int'], ['retired', 'int'], ['monthly', 'money']];
  const phNm = (m, id) => (id ? m.phases?.find(p => p.id === id)?.name || '' : '');   // nombre de la fase («» si no hay)
  const INV_SIGN = [['kind'], ['object'], ['by'], ['stakeholder'], ['verdict'], ['date'], ['note']];
  const INV_FIND = [['severity'], ['source'], ['rule'], ['title'], ['target'], ['dismissed'], ['reason']];
  const INV_VER = [['name'], ['env'], ['status'], ['author'], ['created'], ['updated'], ['decidedOn']];
  const invYN = v => T(v ? 'sec.yes' : 'sec.no');
  const invNum = v => (v == null || v === '' || !Number.isFinite(+v) ? '' : +v);
  // Filas de componentes: objetos con claves estables (las de INV_COMP)
  function inventoryRows(model = S.model) {
    const m = model, byId = new Map(m.nodes.map(n => [n.id, n])), get = id => byId.get(id);
    const finds = typeof allFindings === 'function' ? allFindings(m).filter(f => !(f.source !== 'review' && m.dismissed?.[f.id])) : [];
    return m.nodes.map(n => {
      const ic = typeof iconInfo === 'function' ? iconInfo(n.icon) : null, cat = ic?.category || typeOf(n).category || '';
      const gv = f => (typeof govOf === 'function' ? govOf(n, f, m) : { value: String(n[f] ?? '').trim(), from: null });
      const inh = ['owner', 'steward', 'team', 'costCenter'].map(f => { const g = gv(f); return g.from ? `${T(`gov.${f}`)} ← ${m.groups.find(x => x.id === g.from)?.label || g.from}` : ''; }).filter(Boolean).join('; ');
      const reg = typeof regionOf === 'function' ? regionOf(n, m).value : cleanRegion(n.region), jur = reg && typeof jurOf === 'function' ? jurOf(reg) : null;
      const ex = typeof exposureOf === 'function' ? exposureOf(n, m).value : n.exposure || '', bk = typeof backupOf === 'function' ? backupOf(n, m).value : typeof n.backup === 'boolean' ? n.backup : null;
      const cls = typeof dataClassesOf === 'function' ? dataClassesOf(n, m) : n.data || [];
      const mine = m.edges.filter(e => e.from === n.id || e.to === n.id);
      const ins = m.edges.filter(e => e.to === n.id || (e.both && e.from === n.id)), outs = m.edges.filter(e => e.from === n.id || (e.both && e.to === n.id));
      const unenc = typeof isInsecure === 'function' ? mine.filter(e => isInsecure(e, get)).length : 0;
      const pc = hasCost(n) ? periodOf(n) : '', pm = hasCost(n) ? round2(perMonth(n)) : '';
      const my = finds.filter(f => f.target?.id === n.id && f.target.kind === 'node').length;
      const ctl = typeof controlsOf === 'function' ? [...controlsOf(n, m)] : [];
      const comp = [...new Set(ctl.map(([k]) => ctlSplit(k)[0]))].map(fw => {
        const st = CTL_STATUS.map(s => [s, ctl.filter(([k, v]) => ctlSplit(k)[0] === fw && v.status === s).length]).filter(x => x[1]);
        return `${ctlInfo(`${fw}:x`).short}: ${st.map(([s, c]) => `${c} ${T(`cmp.${s}`).toLowerCase()}`).join(' / ')}`;
      }).join('; ');
      const grp = typeof groupChain === 'function' ? groupChain(n, m).reverse().map(g => g.label).join(' › ') : '';
      const lvl = typeof scopePath === 'function' && n.in ? scopePath(n.in, m).map(id => byId.get(id)?.label || id).join(' › ') : '';
      const rl = typeof layerOf === 'function' ? layerOf(n).value : n.layer;
      return {
        id: n.id, name: n.label, detail: n.sub || '', type: typeLabel(n.type), provider: ic?.providerLabel || '', service: ic?.label || '', category: cat && typeof I.category === 'function' ? I.category(cat) : cat,
        c4: typeof c4Label === 'function' ? c4Label(n.c4) : '', level: lvl, group: grp,
        owner: gv('owner').value, steward: gv('steward').value, team: gv('team').value, costCenter: gv('costCenter').value, inherited: inh,
        region: reg, jurisdiction: jur ? `${jur.label} (${jur.short})` : '',
        data: cls.map(k => loc(DATA[k]?.short) || String(k).toUpperCase()).join(' '), sensitive: invYN(cls.some(k => DATA[k]?.sensitive)),
        layer: rl && typeof layerInfo === 'function' ? layerInfo(rl)?.label || rl : '', exposure: ex ? T(ex === 'public' ? 'sec.expo.public' : 'sec.expo.internal') : '', backup: bk == null ? '' : invYN(bk),
        encIn: ins.filter(e => e.encrypted === true).length, encOut: outs.filter(e => e.encrypted === true).length, unencSens: unenc,
        sla: invNum(n.sla), rpo: n.rpo == null ? '' : String(n.rpo), rto: n.rto == null ? '' : String(n.rto), replicas: invNum(n.replicas),
        cost: hasCost(n) ? +n.cost : '', period: pc ? T(PERIODS[pc].label) + (pc === 'multi' ? ` · ${T('cost.years', yearsOf(n))}` : '') : '', perMonth: pm, perYear: pm === '' ? '' : round2(perMonth(n) * 12),
        review: n.review ? T(`rev.tag.${reviewState(n.review)}`) : '', findings: my,
        adrs: (m.decisions || []).filter(d => d.links?.nodes?.includes(n.id)).map(d => d.id).join(', '), compliance: comp, desc: n.desc || '',
        ...(typeof radarInfo === 'function' && radarEntries(m).length && m.nodes.some(x => radarOf(x, m)) ? (() => { const i = radarInfo(n, m, today()); return { radar: i ? `${i.name} · ${i.ring.label}` : '', radarEos: i?.eosDay || '' }; })() : {}),
        ...(m.nodes.some(x => x.disposition) ? { disposition: n.disposition && typeof mgInfo === 'function' ? mgInfo(n.disposition).label : '' } : {}),
        ...(n.effort?.length ? { effort: efDaysOf(n.effort) } : {}),   // días-persona del componente (solo si lo tiene)
        ...(m.phases?.length ? { phase: phNm(m, n.phase), until: phNm(m, n.until) } : {})   // fase en la que aparece y en la que se retira (sin fases no hay claves)
      };
    });
  }
  // Todas las tablas del inventario: [{ key, name, head, rows (matrices), fmt }]; las vacías no entran salvo Componentes
  function inventoryTables(model = S.model) {
    const m = model, byId = new Map(m.nodes.map(n => [n.id, n])), nm = id => byId.get(id)?.label || id;
    const mk = (key, cols, rows) => ({ key, name: T(`inv.sheet.${key}`), head: cols.map(([k]) => T(`inv.c.${k}`)), keys: cols.map(([k]) => k), fmt: cols.map(([, f]) => f || null), rows });
    const out = [], comp = inventoryRows(m);
    // Fases (solo si el diagrama las tiene): columnas Fase y Se retira en en componentes y conexiones
    const ph = !!m.phases?.length, cc = [...INV_COMP, ...(m.nodes.some(x => x.disposition) ? INV_MIG : []), ...(radarEntries(m).length && m.nodes.some(x => radarOf(x, m)) ? INV_RADAR : []), ...(ph ? INV_PH : []), ...(m.nodes.some(x => x.effort?.length) ? [['effort']] : [])];
    out.push(mk('components', cc, comp.map(r => cc.map(([k]) => r[k]))));
    // Una fila por fase: lo que hay en ella y lo que entra y sale respecto de la anterior
    if (ph) out.push(mk('phases', INV_PHASE, m.phases.map((p, i) => { const s = phaseStats(m, i, { monthly: x => monthlyTotal(x.nodes), findings: () => [] }), d = phaseDiff(m, i); return [p.id, p.name, p.date || '', p.goal || '', s.nodes, d.added.length, d.retired.length, round2(s.cost)]; })));
    // Estimación por fase (solo si algún componente o fase tiene esfuerzo)
    { const pe = phaseEffort(m, effortHelpers); if (pe) out.push(mk('estimation', INV_EST, pe.rows.map(r => [r.name, r.comps, r.estimated, r.days, r.extraDays, r.cost, r.contingency, r.total, r.cumulative]))); }
    // Conexiones
    const open = typeof strideAll === 'function' ? (() => { try { return strideAll(m).filter(t => t.status === 'open'); } catch { return []; } })() : [];
    const ets = Array.isArray(m.edgeTypes) ? m.edgeTypes : [], etOf = id => ets.find(t => t.id === id); // del modelo que se exporta, no del lienzo
    const lat = m.edges.some(e => e.latency != null && e.latency !== '');   // columna Latencia solo si alguna conexión la tiene
    const conn = m.edges.map(e => {
      const cb = typeof crossBorder === 'function' ? crossBorder(e, byId) : null, ct = etOf(e.style);
      return [e.id || '', nm(e.from), nm(e.to), String(e.label || '').replace(/\s*\n\s*/g, ' '), ct ? loc(ct.label) : edgeStyleLabel(e.style), T(EDGE_W[e.weight] ? `wt.${e.weight}` : 'wt.normal'), invYN(!!ct), e.encrypted === true ? T('enc.yes') : e.encrypted === false ? T('enc.no') : T('enc.unset'),
        (e.data || []).map(k => loc(DATA[k]?.short) || String(k).toUpperCase()).join(' '), (e.datasets || []).join('; '), invYN(!!cb), cb ? invYN(cb.approved) : '', open.filter(t => t.e === e || t.e.id === e.id).length,
        ...(lat ? [e.latency || ''] : []), ...(ph ? [phNm(m, e.phase), phNm(m, e.until)] : [])];
    });
    const cn = [...INV_CONN, ...(lat ? [['latency']] : []), ...(ph ? INV_PH : [])];
    if (conn.length) out.push(mk('connections', cn, conn));
    // Tipos de conexión propios (solo si el diagrama los tiene)
    if (ets.length) out.push(mk('types', INV_TYPE, ets.map(t => [t.id, loc(t.label), t.dash || '', t.color || '', t.width ?? '', t.particles ?? '', m.edges.filter(e => e.style === t.id).length])));
    // Grupos
    const gpath = g => { const p = []; let x = g.parent, i = 0; while (x && i++ < 50) { const gg = m.groups.find(q => q.id === x); if (!gg) break; p.unshift(gg.label); x = gg.parent; } return p.join(' › '); };
    const grp = m.groups.map(g => {
      const ns = m.nodes.filter(n => (typeof groupChain === 'function' ? groupChain(n, m) : []).some(x => x.id === g.id)), gv = f => (typeof govOf === 'function' ? govOf(g, f, m).value : g[f] || '');
      return [g.id, g.label, gpath(g), typeof groupKind === 'function' ? T(`gkind.${groupKind(g)}`) : '', typeof regionOf === 'function' ? regionOf(g, m).value : g.region || '',
        typeof layerOf === 'function' && layerOf(g).value && typeof layerInfo === 'function' ? layerInfo(layerOf(g).value).label : '', gv('owner'), gv('team'), gv('costCenter'), ns.length, ns.some(hasCost) ? round2(monthlyTotal(ns)) : ''];
    });
    if (grp.length) out.push(mk('groups', INV_GROUP, grp));
    // Dueños por equipo
    const own = typeof govTeamList === 'function' ? govTeamList(m).map(t => { const ns = t.nodes.map(id => byId.get(id)).filter(Boolean); return [t.team || T('inv.noTeam'), t.owners.join('; '), t.stewards.join('; '), ns.length, ns.some(hasCost) ? round2(monthlyTotal(ns)) : '']; }) : [];
    if (own.length) out.push(mk('owners', INV_OWNER, own));
    // Decisiones (ADR)
    const links = l => [...(l?.nodes || []).map(nm), ...(l?.edges || []).map(id => { const e = m.edges.find(x => x.id === id); return e ? `${nm(e.from)} → ${nm(e.to)}` : id; }), ...(l?.groups || []).map(id => m.groups.find(g => g.id === id)?.label || id),
      ...(l?.versions || []).map(id => { const v = (m.versions || []).find(x => x.id === id); return v && typeof verLabel === 'function' ? verLabel(v) : id; })].join('; ');
    if (m.decisions?.length) {   // Área y Elegida solo aparecen si alguna decisión las usa
      const ar = m.decisions.some(d => d.area), ch = m.decisions.some(d => d.chosen), pick = d => { const o = d.chosen && (d.options || []).find(x => x.id === d.chosen); return o ? `${o.id} · ${o.title || o.id}` : ''; };
      out.push(mk('decisions', [...INV_ADR, ...(ar ? [['area']] : []), ...(ch ? [['chosen']] : [])], m.decisions.map(d => [d.id, d.title, T(`adr.st.${d.status}`), d.date || '', links(d.links), ...(ar ? [d.area || ''] : []), ...(ch ? [pick(d)] : [])])));
    }
    if (m.requirements?.length) {   // Requisitos: cubierto por, control y su resultado
      out.push(mk('requirements', INV_REQ, m.requirements.map(r => { const c = r.check && reqCheck(r, m); return [r.id, r.title, T(`req.kind.${r.kind}`), r.priority ? T(`req.pr.${r.priority}`) : '', T(`req.st.${r.status}`), r.source || '', reqCoveredBy(r, m), r.check ? reqCheckText(r) : '', c ? `${T(`req.chk.${c.state}`)}${c.detail ? ` · ${c.detail}` : ''}` : '']; })));
    }
    // Registro RAID
    if (m.raid?.length) {
      const rl = l => [...(l?.decisions || []), ...(l?.requirements || []), links(l)].filter(Boolean).join('; ');
      out.push(mk('raid', INV_RAID, m.raid.map(x => [x.id, T(`raid.type1.${x.type}`), x.title, T(`raid.st.${raidState(x)}`), x.owner || '', x.probability ?? '', x.impact ?? '', raidScore(x) || '', x.mitigation || '', x.due || '', x.raised || '', rl(x.links), x.detail || ''])));
    }
    // Catálogo de datos (solo si hay conjuntos): una fila por conjunto (frescura real, costo estimado y contrato), y Columnas y Calidad si tienen filas
    if (m.datasets?.length) {
      const dsl = m.datasets, ownerOf = o => m.stakeholders?.find(s => s.id === o)?.name || o || '', pr = { prices: dsPrices() };
      out.push(mk('datasets', INV_DS, dsl.map(d => {
        const f = e2eOf(d.name, m), sto = storageEstimate(d, pr);
        return [d.id, d.name, d.domain || '', d.layer ? layerInfo(d.layer).label : '', ownerOf(d.owner), d.steward || '', invYN(!!d.product), (d.classes || []).map(k => loc(DATA[k]?.short) || String(k).toUpperCase()).join(' '),
          d.format || '', d.freshness || '', f.worst == null ? '' : fmtDur(f.worst / 1000), T(`inv.fr.${f.state}`), d.volume?.perDay ?? '', d.volume?.retentionDays ?? '', sto ? round2(sto.gb) : '', sto ? round2(sto.monthly) : '',
          phNm(m, d.phase), d.contract?.version || '', d.contract ? T(`rep.cat.st.${d.contract.status}`) : '', (d.contract?.consumers || []).map(nm).join('; ')];
      })));
      const dc = dsl.flatMap(d => (d.schema || []).map(c => [d.id, d.name, c.name, c.type || '', invYN(!!c.key), invYN(!!c.pii), invYN(c.nullable !== false), c.desc || '']));
      if (dc.length) out.push(mk('columns', INV_DSC, dc));
      const dq = dsl.flatMap(d => (d.quality || []).map(q => [d.id, d.name, q.rule, q.column || '', q.param || '', q.severity ? sevLabel(q.severity) : '']));
      if (dq.length) out.push(mk('quality', INV_DSQ, dq));
    }
    // Interesados (una fila por persona, con su RACI como «área:letra») y firmas de decisiones y versiones (una fila por firma); solo si hay datos
    if (m.stakeholders?.length) out.push(mk('stakeholders', INV_SH, m.stakeholders.map(s => [s.id, s.name, s.role || '', T(`people.org.${s.org}`), Object.entries(s.raci || {}).map(([k, v]) => `${k}:${v}`).join('; '), invYN(s.versions === true), invYN(!!s.inactive)])));
    const sg = [...(m.decisions || []).map(d => [d, 'decision', d.id]), ...(m.versions || []).map(v => [v, 'version', v.id])].flatMap(([o, kind, id]) => (o.signoffs || []).map(x => [T(`inv.sg.${kind}`), id, x.by, apprWho(x.by, m), T(x.verdict === 'approve' ? 'appr.approved' : 'appr.rejected'), x.date, x.note || '']));
    if (sg.length) out.push(mk('signoffs', INV_SIGN, sg));
    // Hallazgos (abiertos y descartados)
    const tl = t => { const o = (t.kind === 'node' ? m.nodes : t.kind === 'edge' ? m.edges : t.kind === 'group' ? m.groups : t.kind === 'zone' ? m.zones || [] : []).find(x => x.id === t.id); return !o ? t.id : t.kind === 'edge' ? `${nm(o.from)} → ${nm(o.to)}` : o.label || t.id; };
    const fnd = typeof allFindings === 'function' ? allFindings(m).map(f => { const d = f.source !== 'review' && m.dismissed?.[f.id]; return [sevLabel(f.severity), typeof srcLabel === 'function' ? srcLabel(f.source) : f.source, f.rule, f.title, tl(f.target || {}), invYN(!!d), d?.reason || '']; }) : [];
    if (fnd.length) out.push(mk('findings', INV_FIND, fnd));
    // Versiones y ambientes
    if (m.versions?.length) out.push(mk('versions', INV_VER, m.versions.map(v => [verLabel(v), v.kind === 'env' ? loc(C.environments?.[v.env]?.label) || v.env : '', T(`ver.st.${v.status}`), v.author || '', v.created || '', v.updated || '', [v.decidedOn, v.decidedBy].filter(Boolean).join(' · ')])));
    return out;
  }
  // 'xlsx' | 'csv' (solo componentes) | 'csv-all' (una descarga por tabla)
  function exportInventory(kind = 'xlsx') {
    try {
      const tabs = inventoryTables(S.model), X = window.DiagramonXlsx;
      if (kind === 'xlsx') {
        if (!X) throw new Error('src/export/xlsx.js missing');
        download(X.blob(tabs.map(t => ({ name: t.name, head: t.head, rows: t.rows, fmt: t.fmt })), { title: `${S.model.title || 'Diagramon'} · ${T('inv.title')}`, creator: 'Diagramon' }), fileName('xlsx', 'inventory'), X.MIME);
      } else if (kind === 'csv-all') {
        tabs.forEach((t, i) => setTimeout(() => download(toCSV([t.head, ...t.rows]), fileName('csv', `inventory-${t.key}`), 'text/csv;charset=utf-8'), i * 300));
      } else download(toCSV([tabs[0].head, ...tabs[0].rows]), fileName('csv', 'inventory'), 'text/csv;charset=utf-8');
      toast(T('toast.exported', { name: T('inv.title') }));
    } catch (e) { console.error(e); toast(T('toast.exportFail')); }
  }
  // Diálogo del CSV: solo componentes o todas las tablas por separado
  function openInventoryDialog() {
    const prev = document.activeElement, id = `iv${Date.now()}`, back = document.createElement('div');
    back.className = 'cf-back';
    back.innerHTML = `<form class="cf share" role="dialog" aria-modal="true" aria-labelledby="${id}t" autocomplete="off">
      <h3 id="${id}t">${esc(T('inv.csv.title'))}</h3><p>${esc(T('inv.csv.lead'))}</p>
      <fieldset class="sh-views"><label class="sh-chk"><input type="radio" name="k" value="csv" checked>${esc(T('inv.csv.one'))}</label><label class="sh-chk"><input type="radio" name="k" value="csv-all">${esc(T('inv.csv.all'))}</label></fieldset>
      <div class="cf-actions"><button type="button" class="btn" data-iv="no">${esc(T('ver.cf.cancel'))}</button><button type="submit" class="btn primary">${esc(T('inv.csv.go'))}</button></div></form>`;
    const form = back.querySelector('form'), close = () => { document.removeEventListener('keydown', key, true); back.remove(); prev?.focus?.(); };
    const key = ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); } };
    form.addEventListener('click', ev => { if (ev.target.closest('[data-iv="no"]')) close(); });
    back.addEventListener('mousedown', ev => { if (ev.target === back) close(); });
    form.addEventListener('submit', ev => { ev.preventDefault(); const k = form.elements.k.value; close(); exportInventory(k); });
    document.addEventListener('keydown', key, true);
    document.body.appendChild(back);
    form.querySelector('input[name="k"]:checked').focus();
  }

  /* ---------- importar un manifest de dbt (dbt.js): catálogo o diagrama con linaje ---------- */
  const dbtCfg = () => ({ ...C.datasets?.dbt, layers: Object.keys(DL), aliases: DL_ALIAS, classes: Object.keys(DATA), stakeholders: (S.model.stakeholders || []).map(x => ({ id: x.id, name: x.name })) });
  const dbtMsg = r => T(`dbt.err.${r.error}`, r.n);
  // Aplica el manifest ya leído: mode 'merge' (fusiona con el catálogo; sin tocar componentes ni conexiones) o 'new' (diagrama nuevo con linaje). Un solo paso de deshacer.
  function dbtApply(man, mode) {
    const DBT = window.DiagramonDbt, cfg = dbtCfg();
    if (mode === 'new') {
      const r = DBT.toDiagram(man, cfg);
      if (!r.stats.datasets || !r.diagram.nodes.length) { toast(T('dbt.err.empty'), 3200); return { error: 'empty' }; }
      S.sel = null;
      setModel(r.diagram, { current: true, history: true, animate: true, fit: true });
      const sum = { mode, datasets: r.stats.datasets, columns: r.stats.columns, rules: r.stats.rules, exposures: r.stats.exposures, nodes: r.stats.nodes, edges: r.stats.edges, warnings: r.warnings };
      toast(T('dbt.done.new', sum), 4200);
      return sum;
    }
    const inc = DBT.toCatalog(man, cfg);
    if (!inc.datasets.length) { toast(T('dbt.err.empty'), 3200); return { error: 'empty' }; }
    const cur = S.model.datasets || [], list = cleanCatalog(DBT.merge(cur, inc.datasets), S.model, dsHelpers());
    const before = new Map(cur.map(d => [dsK(d.name), JSON.stringify(d)])), after = new Map(list.map(d => [dsK(d.name), JSON.stringify(d)]));
    let added = 0, updated = 0, unchanged = 0;
    inc.datasets.forEach(d => { const k = dsK(d.name); if (!after.has(k)) return; if (!before.has(k)) added++; else if (before.get(k) !== after.get(k)) updated++; else unchanged++; });
    const warnings = [...inc.warnings];
    if (list.length >= DS_MAX && inc.datasets.some(d => !after.has(dsK(d.name)))) warnings.push({ code: 'cap.datasets', n: inc.datasets.filter(d => !after.has(dsK(d.name))).length });
    if (added || updated) dsCommit(list);
    const sum = { mode, added, updated, unchanged, datasets: inc.stats.datasets, columns: inc.stats.columns, rules: inc.stats.rules, exposures: inc.stats.exposures, warnings };
    toast(T('dbt.done.merge', sum), 4200);
    return sum;
  }
  // API sin diálogo: importDbt(texto, { mode: 'merge' | 'new' }) → resumen (o { error })
  function importDbt(text, opts = {}) {
    const DBT = window.DiagramonDbt, r = DBT ? DBT.parse(text, C.datasets?.dbt) : { error: 'bad' };
    if (r.error) { toast(dbtMsg(r), 3200); return { error: r.error }; }
    return dbtApply(r.manifest, opts.mode === 'new' || opts.mode === 'merge' ? opts.mode : S.model.nodes.length ? 'merge' : 'new');
  }
  // Lee el manifest y pregunta cómo importarlo (vista previa con cuentas y avisos)
  function openDbtImport(text) {
    const DBT = window.DiagramonDbt, r = DBT.parse(text, C.datasets?.dbt);
    if (r.error) return toast(dbtMsg(r), 3200);
    const man = r.manifest, pv = DBT.toCatalog(man, dbtCfg()), st = pv.stats;
    if (!st.datasets) return toast(T('dbt.err.empty'), 3200);
    const prev = document.activeElement, id = `dbt${Date.now()}`, back = document.createElement('div'), first = S.model.nodes.length ? 'merge' : 'new';
    const layers = [...Object.keys(DL), ''].filter(k => st.byLayer[k]).map(k => k ? `${layerInfo(k).label} ${st.byLayer[k]}` : T('dbt.pv.nolayer', st.byLayer[k])).join(' · ');
    const warns = pv.warnings.map(w => ({ ...w, key: `dbt.warn.${w.code}` }));
    const mode = (k, on) => `<label class="sh-chk"><input type="radio" name="mode" value="${k}"${on ? ' checked' : ''}>${esc(T(`dbt.mode.${k}`))}</label><small class="dbt-d">${esc(T(`dbt.mode.${k}.d`))}</small>`;
    back.className = 'cf-back';
    back.innerHTML = `<form class="cf share" role="dialog" aria-modal="true" aria-labelledby="${id}t" aria-describedby="${id}d" autocomplete="off">
      <h3 id="${id}t">${esc(T('dbt.title'))}</h3><p id="${id}d">${esc(T('dbt.lead', { project: pv.project, version: String(man.metadata?.dbt_schema_version || '').split('/').pop().replace(/\.json$/, '') }))}</p>
      <fieldset class="sh-views"><legend>${esc(T('dbt.mode'))}</legend>${mode('merge', first === 'merge')}${mode('new', first === 'new')}</fieldset>
      <fieldset class="sh-views"><legend>${esc(T('dbt.pv'))}</legend><small class="dbt-pv">${esc(T('dbt.pv.datasets', { n: st.datasets, layers }))}</small><small class="dbt-pv">${esc(T('dbt.pv.cols', { cols: st.columns, rules: st.rules, exps: st.exposures }))}</small>
        ${warns.map(w => `<small class="dbt-warn" role="status">⚠ ${esc(T(w.key, w.n))}</small>`).join('')}</fieldset>
      <div class="cf-actions"><button type="button" class="btn" data-dbt="no">${esc(T('ver.cf.cancel'))}</button><button type="submit" class="btn primary">${esc(T('dbt.go'))}</button></div></form>`;
    const form = back.querySelector('form'), close = () => { document.removeEventListener('keydown', key, true); back.remove(); prev?.focus?.(); };
    const key = ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); } };
    form.addEventListener('click', ev => { if (ev.target.closest('[data-dbt="no"]')) close(); });
    back.addEventListener('mousedown', ev => { if (ev.target === back) close(); });
    form.addEventListener('submit', ev => { ev.preventDefault(); const k = form.elements.mode.value; close(); dbtApply(man, k); });
    document.addEventListener('keydown', key, true);
    document.body.appendChild(back);
    form.querySelector('input[name="mode"]:checked').focus();
  }

  // Importa un diagrama de Diagramon (JSON) o infraestructura como código (iac.js).
  // Acepta File del navegador o { name, text }.
  async function importFiles(list) {
    const files = await Promise.all([...list].map(async f => ({ name: f.name || '', text: typeof f.text === 'string' ? f.text : await f.text() })));
    if (!files.length) return;
    if (files.length === 1 && files[0].text.length < 2e6 && files[0].text.includes('"feedback"')) {   // archivo de comentarios del revisor (cifrado): pide la contraseña y muestra qué entra
      let env = null;
      try { env = JSON.parse(files[0].text); } catch { /* no es JSON */ }
      if (env && typeof env === 'object' && env.kind === 'feedback' && env.v === 'fb1') return openFeedbackImport(env);
    }
    const dbtFile = window.DiagramonDbt && files.find(f => window.DiagramonDbt.detect(f.text));   // manifest de dbt: antes que el resto
    if (dbtFile) return openDbtImport(dbtFile.text);
    if (files.length === 1) {
      let raw = null;
      try { raw = JSON.parse(files[0].text); } catch { /* puede ser YAML */ }
      if (raw && typeof raw === 'object' && Array.isArray(raw.nodes)) {
        S.sel = null;
        setModel(raw, { history: true, animate: true, fit: true });
        return toast(T('toast.imported'));
      }
    }
    const IAC = window.DiagramonIaC;
    let res;
    try { res = IAC.convert(files); } catch { return toast(IAC ? T('toast.iacNone') : T('toast.badJson'), 3200); }
    if (!res.nodes) return toast(T('toast.iacEmpty', { format: res.format }), 3200);
    res.diagram.nodes.forEach(n => { delete n.facts; });   // lo que afirma la infraestructura sirve para compararla, no se guarda en el diagrama
    if (S.scope) { importIntoScope(res.diagram); toast(T('toast.iac', res), 4200); return res; } // dentro de un nivel C4: se añade a ese nivel
    S.sel = null;
    setModel(res.diagram, { current: true, history: true, animate: true, fit: true });
    toast(T('toast.iac', res), 4200);
    return res;
  }

  return { contractYaml, contractsYaml, copyJSON, exportContract, exportContracts, exportCtx, exportInventory, exportJSON, exportOther, importDbt, importFiles, inventoryRows, openInventoryDialog, phNm };
} };
