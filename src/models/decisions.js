/* ==========================================================================
   Diagramon · modelo: decisiones de arquitectura (ADR) y aprobaciones (puro, sin DOM)
   --------------------------------------------------------------------------
   Movido tal cual desde src/app.js (bloques adrModel y approvalModel); sin cambios de comportamiento.
   Necesita de la app dos ayudas: isDay (fecha AAAA-MM-DD válida) y today (fecha de hoy).
   API: window.DiagramonModels.decisions({ isDay, today }) -> { ADR_COLOR, ADR_MAX, ADR_RISK, ADR_STATUS, SIGN_MAX, adrFull, adrLeader, adrScore, adrStatus, approvalState, approversFor, cleanAdrLinks, cleanDecisions, cleanSignoffs }
   ========================================================================== */
window.DiagramonModels = window.DiagramonModels || {};
window.DiagramonModels.decisions = function ({ isDay, today }) {
  const ADR_STATUS = ['proposed', 'accepted', 'rejected', 'deprecated', 'superseded'];
  const ADR_COLOR = { proposed: 'var(--p-limon)', accepted: 'var(--p-menta)', rejected: 'var(--p-coral)', deprecated: 'var(--muted)', superseded: 'var(--p-lavanda)' };
  const ADR_ALIAS = { propuesta: 'proposed', propuesto: 'proposed', aceptada: 'accepted', aceptado: 'accepted', rechazada: 'rejected', rechazado: 'rejected', obsoleta: 'deprecated', obsoleto: 'deprecated', reemplazada: 'superseded', reemplazado: 'superseded', sustituida: 'superseded', sustituido: 'superseded', superada: 'superseded', superado: 'superseded' };
  const adrStatus = v => { const k = String(v ?? '').trim().toLowerCase(); return ADR_STATUS.includes(k) ? k : ADR_ALIAS[k] || 'proposed'; };
  const adrNum = id => { const r = /^ADR-(\d+)$/i.exec(String(id)); return r ? +r[1] : 0; };
  const adrNextId = list => `ADR-${String(Math.max(0, ...list.map(d => adrNum(d.id))) + 1).padStart(3, '0')}`;
  // Solo enlaces a ids que existen (versiones: las de m.versions)
  function cleanAdrLinks(l, m) {
    const out = {};
    l = l && typeof l === 'object' ? l : {};
    [['nodes', m.nodes], ['edges', m.edges], ['groups', m.groups], ['versions', m.versions || []]].forEach(([k, src]) => {
      const ok = new Set(src.map(x => x.id)), ids = [...new Set((Array.isArray(l[k]) ? l[k] : []).map(String).filter(id => ok.has(id)))];
      if (ids.length) out[k] = ids;
    });
    return out;
  }
  /* ---------- decisiones (ADR): opciones, criterios y puntuación ---------- */
  // Por decisión (todo opcional): area, criteria: [{ id, label, weight 1..5 }], options: [{ id, title, summary?, pros?, cons?, cost?, risk?, version?, scores?: { criterio: 1..5 } }], chosen (id de una opción)
  // Sin ellos, el JSON y las exportaciones quedan idénticos a los de antes.
  const ADR_RISK = ['low', 'medium', 'high'];
  const ADR_MAX = { options: 12, criteria: 12 };
  // Puntaje de una opción: % ponderado sobre los criterios que ya puntuó. Líder = la opción con todos los criterios puntuados y mayor %, a igualdad la primera
  function adrScore(d, o) {
    const cs = Array.isArray(d?.criteria) ? d.criteria : [], sc = o?.scores || {};
    let num = 0, den = 0, n = 0;
    cs.forEach(c => { const s = sc[c.id], w = Number.isInteger(c.weight) ? c.weight : 3; if (Number.isInteger(s) && s >= 1 && s <= 5) { num += w * s; den += w * 5; n++; } });
    return { pct: den ? Math.round(100 * num / den) : 0, scored: n, total: cs.length };
  }
  const adrFull = s => s.total > 0 && s.scored === s.total;
  function adrLeader(d) {
    let best = '', top = -1;
    (Array.isArray(d?.options) ? d.options : []).forEach(o => { const s = adrScore(d, o); if (adrFull(s) && s.pct > top) { top = s.pct; best = o.id; } });
    return best;
  }
  const adrLong = (v, n) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, n);
  function cleanAdrCriteria(raw) {
    const seen = new Set(), out = [];
    (Array.isArray(raw) ? raw : []).forEach(c => {
      if (!c || typeof c !== 'object' || Array.isArray(c)) return;
      const id = String(c.id ?? '').trim();
      if (!/^[a-z0-9-]{1,30}$/.test(id) || seen.has(id)) return;
      seen.add(id);
      const w = Math.round(Number(c.weight));
      out.push({ id, label: String(c.label ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || id, weight: Number.isFinite(w) ? Math.min(5, Math.max(1, w)) : 3 });
    });
    return out.slice(0, ADR_MAX.criteria);
  }
  function cleanAdrOptions(raw, crit, m) {
    const seen = new Set(), out = [], vids = new Set((m.versions || []).map(v => v.id));
    (Array.isArray(raw) ? raw : []).forEach(x => {
      if (!x || typeof x !== 'object' || Array.isArray(x)) return;
      const id = String(x.id ?? '').trim();
      if (!/^[A-Za-z0-9-]{1,20}$/.test(id) || seen.has(id)) return;
      seen.add(id);
      const o = { id, title: String(x.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) };
      ['summary', 'pros', 'cons'].forEach(k => { const t = adrLong(x[k], 2000); if (t) o[k] = t; });
      const cost = x.cost === '' || x.cost == null ? NaN : Number(x.cost);
      if (Number.isFinite(cost) && cost >= 0) o.cost = cost;
      if (ADR_RISK.includes(x.risk)) o.risk = x.risk;
      if (x.version != null && vids.has(String(x.version))) o.version = String(x.version);
      const sc = {};
      if (x.scores && typeof x.scores === 'object' && !Array.isArray(x.scores)) crit.forEach(c => { const r = x.scores[c.id], v = r === '' || r == null ? NaN : Number(r); if (Number.isInteger(v) && v >= 1 && v <= 5) sc[c.id] = v; });
      if (Object.keys(sc).length) o.scores = sc;
      out.push(o);
    });
    return out.slice(0, ADR_MAX.options);
  }
  function cleanDecisions(raw, m) {
    const txt = v => String(v ?? '').replace(/\r\n?/g, '\n').slice(0, 20000);
    const seen = new Set(), items = [];
    (Array.isArray(raw) ? raw : []).forEach(d => {
      if (!d || typeof d !== 'object' || Array.isArray(d)) return;
      const o = { title: String(d.title ?? '').trim().slice(0, 200), context: txt(d.context), decision: txt(d.decision), consequences: txt(d.consequences) };
      let id = String(d.id ?? '').trim().slice(0, 40);
      if (!id && !o.title && !o.context && !o.decision && !o.consequences) return;
      if (!id || seen.has(id)) id = ''; else seen.add(id);
      const hist = (Array.isArray(d.history) ? d.history : []).filter(h => h && typeof h === 'object' && isDay(h.date)).slice(-200).map(h => {
        const e = { status: adrStatus(h.status), date: h.date };
        if (h.by != null && String(h.by).trim()) e.by = String(h.by).trim().slice(0, 100);
        if (h.note != null && String(h.note).trim()) e.note = String(h.note).trim().slice(0, 500);
        return e;
      });
      const so = cleanSignoffs(d.signoffs, m);
      const crit = cleanAdrCriteria(d.criteria), opts = cleanAdrOptions(d.options, crit, m), chosen = String(d.chosen ?? '').trim();
      items.push({ ...o, hist, id, status: adrStatus(d.status), date: isDay(d.date) ? d.date : today(), deciders: String(d.deciders ?? '').trim().slice(0, 200), sup: String(d.supersededBy ?? '').trim(), links: cleanAdrLinks(d.links, m),
        area: String(d.area ?? '').replace(/\s+/g, ' ').trim().slice(0, 60), so, crit, opts, chosen: opts.some(x => x.id === chosen) ? chosen : '' });
    });
    items.forEach(o => { if (!o.id) o.id = adrNextId(items); });
    const ids = new Set(items.map(o => o.id));
    return items.map(o => {
      const r = { id: o.id, title: o.title, status: o.status, date: o.date, context: o.context, decision: o.decision, consequences: o.consequences };
      if (o.deciders) r.deciders = o.deciders;
      if (o.sup && o.sup !== o.id && ids.has(o.sup)) { r.supersededBy = o.sup; r.status = 'superseded'; }
      if (o.area) r.area = o.area;
      if (o.crit.length) r.criteria = o.crit;
      if (o.opts.length) r.options = o.opts;
      if (o.chosen) r.chosen = o.chosen;
      r.links = o.links;
      if (o.hist.length) r.history = o.hist;
      if (o.so.length) r.signoffs = o.so;
      return r;
    });
  }

  const SIGN_MAX = 200;
  const apprKey = v => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  function approversFor(kind, o, m) {
    const people = (m?.stakeholders || []).filter(s => s && s.id && !s.inactive);
    if (kind === 'version') return people.filter(s => s.versions === true).map(s => s.id);
    const area = apprKey(o?.area);
    return people.filter(s => s.raci?.['*'] === 'A' || (area && Object.entries(s.raci || {}).some(([k, v]) => v === 'A' && apprKey(k) === area))).map(s => s.id);
  }
  function approvalState(kind, o, m) {
    const required = approversFor(kind, o, m);
    const since = kind === 'version' ? (isDay(o?.reviewSince) ? o.reviewSince : '') : ((o?.history || []).filter(h => h.status === 'proposed').map(h => h.date).pop() || '');
    const last = new Map();
    (o?.signoffs || []).forEach(s => { if (!since || s.date >= since) last.set(s.by, s.verdict); });
    const approved = required.filter(id => last.get(id) === 'approve'), rejected = required.filter(id => last.get(id) === 'reject'), pending = required.filter(id => !last.has(id));
    return { required, approved, rejected, pending, complete: required.length > 0 && !pending.length && !rejected.length };
  }
  function cleanSignoffs(raw, m) {
    const ids = new Set((m?.stakeholders || []).map(s => s?.id)), out = [];
    (Array.isArray(raw) ? raw : []).forEach(s => {
      if (!s || typeof s !== 'object' || !ids.has(s.by) || (s.verdict !== 'approve' && s.verdict !== 'reject') || !isDay(s.date)) return;
      const e = { by: s.by, verdict: s.verdict, date: s.date };
      if (s.note != null && String(s.note).trim()) e.note = String(s.note).trim().slice(0, 500);
      out.push(e);
    });
    return out.slice(-SIGN_MAX);
  }
  return { ADR_COLOR, ADR_MAX, ADR_RISK, ADR_STATUS, SIGN_MAX, adrFull, adrLeader, adrScore, adrStatus, approvalState, approversFor, cleanAdrLinks, cleanDecisions, cleanSignoffs };
};
