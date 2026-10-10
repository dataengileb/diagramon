/* ==========================================================================
   Diagramon · modelo: fases (hoja de ruta) y estimación de esfuerzo (puro, sin DOM)
   --------------------------------------------------------------------------
   Código movido tal cual desde src/app.js (bloque «phaseModel» y estimación de esfuerzo), sin cambios de comportamiento.
   API: window.DiagramonModels.phases = { EF_MAX, efDays, efRole, cleanEffort, cleanExtra, cleanEstimation, PHASE_MAX, phaseDay, cleanPhases, phaseIndex, cleanPhaseRefs, phaseState, inPhase, phaseStates, phaseModel, phaseDiff, phaseStats, phaseRows, phaseEffort, estimation }
   «estimation(deps)» arma el motor de la estimación con lo que pone la app (deps = { C, loc, addFindingSource, SEVERITY, T, round2 })
   y devuelve { EST, EF_ROLES, efInfo, efDaysOf, effortHelpers, efCostOf }; además registra el origen de avisos «estimation».
   ========================================================================== */
window.DiagramonModels = window.DiagramonModels || {};
window.DiagramonModels.phases = (() => {
  // Esfuerzo (días-persona): node.effort = [{ role, days }] (hasta 8 perfiles), phase.extra = [{ label, role, days }] (trabajo que no es un componente), m.estimation = { contingency } (% sobre el esfuerzo).
  // Un perfil que config.js no conoce se conserva (cada empresa trae los suyos); sin esfuerzo no hay clave: JSON y exportaciones idénticos.
  const EF_MAX = 8, EF_EXTRA_MAX = 20, EF_ROLE = /^[a-z][a-z0-9_-]{0,19}$/, EF_DAYS = 9999;
  const efDays = v => { const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.trim().replace(',', '.')) : NaN; return Number.isFinite(n) && n > 0 ? Math.min(EF_DAYS, Math.round(n * 100) / 100) : 0; };
  const efRole = v => { const r = String(v ?? '').trim().toLowerCase(); return EF_ROLE.test(r) ? r : ''; };
  function cleanEffort(raw) {
    const sum = new Map();
    (Array.isArray(raw) ? raw : []).forEach(e => { if (!e || typeof e !== 'object') return; const role = efRole(e.role), days = efDays(e.days); if (role && days) sum.set(role, Math.min(EF_DAYS, Math.round(((sum.get(role) || 0) + days) * 100) / 100)); });
    return [...sum].slice(0, EF_MAX).map(([role, days]) => ({ role, days }));
  }
  function cleanExtra(raw) {
    const out = [];
    (Array.isArray(raw) ? raw : []).forEach(e => { if (!e || typeof e !== 'object') return; const role = efRole(e.role), days = efDays(e.days), label = String(e.label ?? '').replace(/\s+/g, ' ').trim().slice(0, 80); if (label && role && days) out.push({ label, role, days }); });
    return out.slice(0, EF_EXTRA_MAX);
  }
  const cleanEstimation = raw => { const c = raw && typeof raw === 'object' && !Array.isArray(raw) && raw.contingency != null && raw.contingency !== '' ? Number(raw.contingency) : NaN; return Number.isFinite(c) && c >= 0 && c <= 100 ? { contingency: Math.round(c * 10) / 10 } : null; };
  const PHASE_MAX = 12, PHASE_ID = /^[A-Za-z0-9_-]{1,30}$/;
  const phaseDay = v => { const r = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(v ?? '').trim()); if (!r) return ''; const mo = +r[2], d = r[3] == null ? 1 : +r[3]; return mo >= 1 && mo <= 12 && d >= 1 && d <= new Date(Date.UTC(+r[1], mo, 0)).getUTCDate() ? String(v).trim() : ''; };
  function cleanPhases(raw) {
    const seen = new Set(), out = [];
    (Array.isArray(raw) ? raw : []).forEach(p => {
      if (!p || typeof p !== 'object' || Array.isArray(p)) return;
      const id = String(p.id ?? '').trim();
      if (!PHASE_ID.test(id) || seen.has(id)) return;
      seen.add(id);
      const o = { id, name: String(p.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) || id };
      const date = phaseDay(p.date), goal = String(p.goal ?? '').replace(/\r\n?/g, '\n').trim().slice(0, 500);
      if (date) o.date = date;
      if (goal) o.goal = goal;
      { const ex = cleanExtra(p.extra); if (ex.length) o.extra = ex; }
      out.push(o);
    });
    return out.slice(0, PHASE_MAX);
  }
  const phaseIndex = (m, id) => (m.phases || []).findIndex(p => p.id === id);
  // Deja en nodos, conexiones y grupos solo fases que existen; until debe ir después de phase (sin phase, después de la primera fase)
  function cleanPhaseRefs(els, phases) {
    const idx = new Map((phases || []).map((p, i) => [p.id, i]));
    els.forEach(x => {
      const a = x.phase == null ? -1 : idx.has(String(x.phase)) ? idx.get(String(x.phase)) : -2, b = x.until == null ? -1 : idx.has(String(x.until)) ? idx.get(String(x.until)) : -2;
      if (a >= 0) x.phase = String(x.phase); else delete x.phase;
      if (b >= 0 && b > Math.max(a, 0)) x.until = String(x.until); else delete x.until;
    });
  }
  // Estado del elemento en la fase i: 0 presente, 1 futuro (aún no aparece), -1 retirado. i < 0 («Todas») = todo presente
  const phaseState = (el, i, m) => {
    if (i < 0) return 0;
    const a = el.phase ? phaseIndex(m, el.phase) : -1, b = el.until ? phaseIndex(m, el.until) : -1;
    return b >= 0 && b <= i ? -1 : a > i ? 1 : 0;
  };
  const inPhase = (el, i, m) => phaseState(el, i, m) === 0;
  // Estado de todos los elementos en la fase i: { nodes, edges, groups } (Map id → 0 | 1 | -1).
  // Un grupo sin campos propios existe si algún nodo suyo (o de sus subgrupos) existe; si todos son futuros es futuro; si ya no queda ninguno es retirado; vacío = presente.
  // Una conexión sigue a sus extremos: retirada si cualquiera lo está, futura si cualquiera es futuro
  function phaseStates(m, i) {
    const nodes = new Map(m.nodes.map(n => [n.id, phaseState(n, i, m)])), gm = new Map(m.groups.map(g => [g.id, g]));
    const below = new Map(m.groups.map(g => [g.id, []]));
    m.nodes.forEach(n => { let g = n.group, k = 0; while (g && gm.has(g) && k++ < 50) { below.get(g).push(nodes.get(n.id)); g = gm.get(g).parent; } });
    const groups = new Map(m.groups.map(g => {
      const own = g.phase || g.until, s = below.get(g.id);
      return [g.id, own || !s.length ? phaseState(g, i, m) : s.includes(0) ? 0 : s.includes(1) ? 1 : -1];
    }));
    const edges = new Map(m.edges.map(e => { const s = [phaseState(e, i, m), nodes.get(e.from) ?? 0, nodes.get(e.to) ?? 0]; return [e.id, s.includes(-1) ? -1 : s.includes(1) ? 1 : 0]; }));
    return { nodes, edges, groups };
  }
  // Un modelo nuevo con solo lo que existe en la fase i (lo demás de m queda igual); i = -1 o sin fases = el propio m
  function phaseModel(m, i) {
    if (i < 0 || !(m.phases || []).length) return m;
    const st = phaseStates(m, i), gm = new Map(m.groups.map(g => [g.id, g]));
    const up = id => { let k = 0; while (id && k++ < 50 && !(gm.has(id) && st.groups.get(id) === 0)) id = gm.get(id)?.parent; return gm.has(id) && st.groups.get(id) === 0 ? id : undefined; };   // grupo presente más cercano
    const fix = (x, key) => { const o = { ...x }, g = up(x[key]); if (g) o[key] = g; else delete o[key]; return o; };
    return {
      ...m,
      groups: m.groups.filter(g => st.groups.get(g.id) === 0).map(g => fix(g, 'parent')),
      nodes: m.nodes.filter(n => st.nodes.get(n.id) === 0).map(n => fix(n, 'group')),
      edges: m.edges.filter(e => st.edges.get(e.id) === 0).map(e => ({ ...e })),
      ...(m.datasets ? { datasets: m.datasets.filter(d => !d.phase || phaseIndex(m, d.phase) <= i) } : {})   // un conjunto sin fase está siempre; con fase, desde esa fase
    };
  }
  // Nodos que entran y salen en la fase i respecto de la anterior (en la primera: los que declaran esa fase)
  function phaseDiff(m, i) {
    if (i < 0 || i >= (m.phases || []).length) return { added: [], retired: [] };
    if (i === 0) return { added: m.nodes.filter(n => n.phase === m.phases[0].id).map(n => n.id), retired: [] };
    const here = phaseStates(m, i).nodes, before = phaseStates(m, i - 1).nodes;
    return { added: m.nodes.filter(n => here.get(n.id) === 0 && before.get(n.id) !== 0).map(n => n.id), retired: m.nodes.filter(n => before.get(n.id) === 0 && here.get(n.id) !== 0).map(n => n.id) };
  }
  // Cifras de la fase i; h = { monthly(modelo) → costo mensual, findings(modelo) → hallazgos abiertos [{ severity }], storage?(conjunto) → { monthly } | null (almacenamiento estimado) }
  // datasets = conjuntos declarados presentes en la fase; storage = suma mensual estimada de los que tienen volumen (null si ninguno; aparte del costo escrito a mano)
  function phaseStats(m, i, h) {
    const pm = phaseModel(m, i), f = { high: 0, medium: 0, low: 0 };
    (h.findings(pm) || []).forEach(x => { const k = x.severity === 'critical' || x.severity === 'high' ? 'high' : x.severity === 'medium' ? 'medium' : 'low'; f[k]++; });
    const dss = pm.datasets || [], sto = h.storage ? dss.map(d => h.storage(d)).filter(Boolean) : [];
    const mig = {};
    pm.nodes.forEach(n => { if (n.disposition) mig[n.disposition] = (mig[n.disposition] || 0) + 1; });   // reparto 6R de los componentes presentes (sin ninguno, la clave no existe)
    return { nodes: pm.nodes.length, edges: pm.edges.length, cost: h.monthly(pm), findings: f, datasets: dss.length, storage: sto.length ? sto.reduce((s, x) => s + x.monthly, 0) : null, ...(Object.keys(mig).length ? { mig } : {}) };
  }
  // Tabla comparativa: una fila por fase (orden = línea de tiempo). cost = null si ningún componente de la fase tiene costo (h.hasCost(modelo)); dCost = cambio respecto de la fase anterior
  function phaseRows(m, h) {
    let prev = null;
    return (m.phases || []).map((p, i) => {
      const st = phaseStats(m, i, h), d = phaseDiff(m, i), cost = h.hasCost && !h.hasCost(phaseModel(m, i)) ? null : st.cost;
      const dCost = i > 0 && (cost != null || prev != null) ? (cost || 0) - (prev || 0) : null;
      prev = cost;
      return { id: p.id, name: p.name, date: p.date || '', goal: p.goal || '', nodes: st.nodes, edges: st.edges, added: d.added.length, retired: d.retired.length, addedIds: d.added, retiredIds: d.retired, cost, dCost, findings: st.findings, datasets: st.datasets, datasetIds: (phaseModel(m, i).datasets || []).map(x => x.id), storage: st.storage, ...(st.mig ? { mig: st.mig } : {}) };
    });
  }
  // Esfuerzo por fase (D8): cada componente cuenta en la fase donde aparece (phase; sin fase, la primera) y el trabajo extra, en la suya. Sin fases hay una sola fila (id '').
  // h.rate(role) = tarifa por día o null; h.contingency = % por defecto (m.estimation.contingency manda). Devuelve null si nada del diagrama tiene esfuerzo.
  // Fila: { id, name, comps, estimated, missing: [ids sin esfuerzo], days, extraDays, byRole, cost, contingency, total, daysTotal, cumulative, cumDays, unrated: [perfiles sin tarifa] }
  function phaseEffort(m, h) {
    const ph = m.phases || [], r2 = v => Math.round(v * 100) / 100;
    if (!m.nodes.some(n => n.effort?.length) && !ph.some(p => p.extra?.length)) return null;
    const pct = m.estimation?.contingency ?? (Number.isFinite(+h.contingency) ? +h.contingency : 0), cols = ph.length ? ph : [{ id: '', name: '' }], first = cols[0].id;
    let cum = 0, cumDays = 0;
    const rows = cols.map(p => {
      const here = m.nodes.filter(n => (n.phase || first) === p.id), by = {}, ex = p.extra || [];
      here.forEach(n => (n.effort || []).forEach(e => { by[e.role] = r2((by[e.role] || 0) + e.days); }));
      ex.forEach(e => { by[e.role] = r2((by[e.role] || 0) + e.days); });
      const days = r2(Object.values(by).reduce((a, d) => a + d, 0)), cost = r2(Object.entries(by).reduce((a, [role, d]) => a + d * (h.rate(role) || 0), 0)), cc = r2(cost * pct / 100), total = r2(cost + cc), daysTotal = r2(days * (1 + pct / 100));
      cum = r2(cum + total); cumDays = r2(cumDays + daysTotal);
      return { id: p.id, name: p.name, comps: here.length, estimated: here.filter(n => n.effort?.length).length, missing: here.filter(n => !n.effort?.length).map(n => n.id), days, extraDays: r2(ex.reduce((a, e) => a + e.days, 0)), byRole: by, cost, contingency: cc, total, daysTotal, cumulative: cum, cumDays, unrated: Object.keys(by).filter(role => h.rate(role) == null) };
    });
    const sum = k => r2(rows.reduce((a, r) => a + r[k], 0));
    return { pct, rows, totals: { days: sum('days'), extraDays: sum('extraDays'), cost: sum('cost'), contingency: sum('contingency'), total: sum('total'), daysTotal: sum('daysTotal') } };
  }

  const estimation = ({ C, loc, addFindingSource, SEVERITY, T, round2 }) => {
    const EST = { hoursPerDay: 8, contingency: 0, roles: [], ...C.estimation };
    const EF_ROLES = new Map((Array.isArray(EST.roles) ? EST.roles : []).filter(r => r && efRole(r.id)).map(r => [efRole(r.id), r]));
    const efInfo = id => { const r = EF_ROLES.get(id), rate = r ? Number(r.rate) : NaN; return { id, known: !!r, label: r ? loc(r.label) || id : id, rate: Number.isFinite(rate) && rate >= 0 ? rate : null }; };
    const efDaysOf = list => round2((list || []).reduce((a, e) => a + e.days, 0));
    const effortHelpers = { rate: role => efInfo(role).rate, contingency: EST.contingency };
    const efCostOf = list => round2((list || []).reduce((a, e) => a + e.days * (efInfo(e.role).rate || 0), 0));
    // Avisos de la estimación (config.js › estimation.rules): fase con componentes sin estimar mientras otros sí, y perfil sin tarifa; solo avisan
    addFindingSource('estimation', m => {
      const ER = EST.rules || {}, on = id => !!ER[id] && ER[id].enabled !== false, sev = id => (SEVERITY.includes(ER[id]?.severity) ? ER[id].severity : 'low');
      const pe = phaseEffort(m, effortHelpers), out = [];
      if (!pe) return out;
      if (on('est.unestimated')) pe.rows.forEach(r => { if (r.estimated && r.missing.length) out.push({ id: `estimation:unestimated:${r.id || '-'}`, source: 'estimation', rule: 'est.unestimated', severity: sev('est.unestimated'), target: { kind: 'node', id: r.missing[0] }, title: T('est.f.unest.t', { n: r.missing.length, p: r.name || T('est.all') }), fix: T('est.f.unest.fix') }); });
      if (on('est.no-rate')) { const seen = new Set(); m.nodes.forEach(n => (n.effort || []).forEach(e => { if (efInfo(e.role).rate == null && !seen.has(e.role)) { seen.add(e.role); out.push({ id: `estimation:norate:${e.role}`, source: 'estimation', rule: 'est.no-rate', severity: sev('est.no-rate'), target: { kind: 'node', id: n.id }, title: T('est.f.rate.t', { r: e.role }), fix: T('est.f.rate.fix') }); } })); }
      return out;
    });
    return { EST, EF_ROLES, efInfo, efDaysOf, effortHelpers, efCostOf };
  };

  return { EF_MAX, efDays, efRole, cleanEffort, cleanExtra, cleanEstimation, PHASE_MAX, phaseDay, cleanPhases, phaseIndex, cleanPhaseRefs, phaseState, inPhase, phaseStates, phaseModel, phaseDiff, phaseStats, phaseRows, phaseEffort, estimation };
})();
