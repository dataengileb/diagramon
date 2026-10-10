/* ==========================================================================
   Diagramon · modelo: registro RAID (puro, sin DOM)
   --------------------------------------------------------------------------
   Bloque «raidModel» movido desde src/app.js (v2), sin cambios de comportamiento.
   API: window.DiagramonModels.raid
   ========================================================================== */
window.DiagramonModels = window.DiagramonModels || {};
window.DiagramonModels.raid = { create(isDay) {
    const RAID_TYPES = ['risk', 'assumption', 'issue', 'dependency'];
    const RAID_PFX = { risk: 'R', assumption: 'A', issue: 'I', dependency: 'D' };
    const RAID_ALIAS = { riesgo: 'risk', supuesto: 'assumption', problema: 'issue', dependencia: 'dependency' };
    const RAID_STATUS = ['open', 'closed'], RAID_VAL = ['pending', 'validated', 'invalidated'];
    const RAID_ST_ALIAS = { abierto: 'open', abierta: 'open', cerrado: 'closed', cerrada: 'closed' };
    const RAID_VAL_ALIAS = { pendiente: 'pending', validado: 'validated', validada: 'validated', invalidado: 'invalidated', invalidada: 'invalidated' };
    const RAID_COLOR = { open: 'var(--p-limon)', closed: 'var(--muted)', pending: 'var(--p-limon)', validated: 'var(--p-menta)', invalidated: 'var(--p-coral)' };
    const RAID_TYPE_COLOR = { risk: 'var(--p-coral)', assumption: 'var(--p-lavanda)', issue: 'var(--p-melocoton)', dependency: 'var(--p-cielo)' };
    const RAID_LEVEL_COLOR = { low: 'var(--p-menta)', medium: 'var(--p-limon)', high: 'var(--p-coral)' };
    const RAID_MAX = 500, RAID_HIGH = 15, RAID_MEDIUM = 8;   // límite de entradas; puntaje desde el que un riesgo es alto / medio
    const raidType = v => { const k = String(v ?? '').trim().toLowerCase(); return RAID_TYPES.includes(k) ? k : RAID_ALIAS[k] || ''; };
    const raidStatus = v => { const k = String(v ?? '').trim().toLowerCase(); return RAID_STATUS.includes(k) ? k : RAID_ST_ALIAS[k] || 'open'; };
    const raidVal = v => { const k = String(v ?? '').trim().toLowerCase(); return RAID_VAL.includes(k) ? k : RAID_VAL_ALIAS[k] || 'pending'; };
    const raidNum = (id, p) => { const r = new RegExp(`^${p}-(\\d+)$`).exec(String(id)); return r ? +r[1] : 0; };
    const raidNextId = (list, type) => { const p = RAID_PFX[type]; return `${p}-${String(Math.max(0, ...list.map(x => raidNum(x.id, p))) + 1).padStart(3, '0')}`; };
    const raidInt = v => { const n = v === '' || v == null ? NaN : Number(v); return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 0; };
    const raidLong = (v, n) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, n);
    const raidScore = it => (it?.type === 'risk' && it.probability && it.impact ? it.probability * it.impact : 0);
    const raidLevel = s => (s >= RAID_HIGH ? 'high' : s >= RAID_MEDIUM ? 'medium' : 'low');
    // Estado a mostrar y filtrar: validación en los supuestos, abierto/cerrado en el resto
    const raidState = it => (it.type === 'assumption' ? it.validation || 'pending' : it.status || 'open');
    // Solo enlaces a ids que existen; los requisitos se buscan en `reqs` (ids) o en m.requirements, que puede no existir
    function cleanRaidLinks(l, m, reqs) {
      const out = {};
      l = l && typeof l === 'object' ? l : {};
      const rq = reqs || (m.requirements || []).map(x => x.id);
      [['decisions', (m.decisions || []).map(x => x.id)], ['requirements', rq], ['nodes', (m.nodes || []).map(x => x.id)], ['edges', (m.edges || []).map(x => x.id)], ['groups', (m.groups || []).map(x => x.id)]].forEach(([k, src]) => {
        const ok = new Set(src), ids = [...new Set((Array.isArray(l[k]) ? l[k] : []).map(String).filter(id => ok.has(id)))];
        if (ids.length) out[k] = ids;
      });
      return out;
    }
    function cleanRaid(raw, m, reqs) {
      const seen = new Set(), items = [];
      (Array.isArray(raw) ? raw : []).forEach(r => {
        if (!r || typeof r !== 'object' || Array.isArray(r)) return;
        const rid = String(r.id ?? '').trim().slice(0, 40), pre = /^([RAID])-\d+$/.exec(rid);
        const type = raidType(r.type) || (pre ? RAID_TYPES.find(t => RAID_PFX[t] === pre[1]) : '');
        if (!type) return;
        const title = String(r.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 200), detail = raidLong(r.detail, 4000);
        const id = pre && pre[1] === RAID_PFX[type] && !seen.has(rid) ? rid : '';
        if (!id && !title && !detail) return;
        if (id) seen.add(id);
        const o = { id, type, title };
        if (detail) o.detail = detail;
        const owner = String(r.owner ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
        if (owner) o.owner = owner;
        if (type === 'assumption') o.validation = raidVal(r.validation); else o.status = raidStatus(r.status);
        if (type === 'risk') {
          const p = raidInt(r.probability), i = raidInt(r.impact), mit = raidLong(r.mitigation, 2000);
          if (p) o.probability = p;
          if (i) o.impact = i;
          if (mit) o.mitigation = mit;
        } else if (isDay(r.due)) o.due = r.due;
        if (isDay(r.raised)) o.raised = r.raised;
        const links = cleanRaidLinks(r.links, m, reqs);
        if (Object.keys(links).length) o.links = links;
        if (type === 'assumption') {
          const hist = (Array.isArray(r.history) ? r.history : []).filter(h => h && typeof h === 'object' && isDay(h.date)).slice(-100).map(h => {
            const e = { validation: raidVal(h.validation), date: h.date };
            if (h.by != null && String(h.by).trim()) e.by = String(h.by).trim().slice(0, 100);
            if (h.note != null && String(h.note).trim()) e.note = String(h.note).trim().slice(0, 500);
            return e;
          });
          if (hist.length) o.history = hist;
        }
        items.push(o);
      });
      items.forEach(o => { if (!o.id) o.id = raidNextId(items, o.type); });
      return items.slice(0, RAID_MAX);
    }
    // Mapa de calor 5×5: cuenta de riesgos por [impacto - 1][probabilidad - 1]
    function raidHeat(list) {
      const g = Array.from({ length: 5 }, () => [0, 0, 0, 0, 0]);
      (list || []).forEach(it => { if (it.type === 'risk' && it.probability && it.impact) g[it.impact - 1][it.probability - 1]++; });
      return g;
    }
    // Resumen de la cabecera: riesgos abiertos (y cuántos altos), supuestos por validar y vencidos (supuestos pendientes, problemas y dependencias abiertos con fecha pasada)
    function raidSummary(m, now) {
      const l = m.raid || [], risks = l.filter(x => x.type === 'risk' && x.status === 'open');
      const late = x => x.due && x.due < now && (x.type === 'assumption' ? x.validation === 'pending' : x.type !== 'risk' && x.status === 'open');
      return { risks: risks.length, high: risks.filter(x => raidLevel(raidScore(x)) === 'high').length, toValidate: l.filter(x => x.type === 'assumption' && x.validation === 'pending').length, overdue: l.filter(late).length };
    }
    // Avisos del registro, sin textos: [{ rule, key, severity, it, d?, acc?, score? }] (los textos y el destino los pone la fuente de hallazgos)
    function raidIssues(m, now) {
      const out = [], decs = new Map((m.decisions || []).map(d => [d.id, d]));
      (m.raid || []).forEach(it => {
        const ds = it.links?.decisions || [];
        if (it.type === 'assumption') {
          if (it.validation === 'invalidated') ds.forEach(id => { const d = decs.get(id); if (d && (d.status === 'accepted' || d.status === 'proposed')) out.push({ rule: 'invalid', key: `invalid:${it.id}:${id}`, severity: 'high', it, d }); });
          else if (it.validation === 'pending' && it.due && it.due < now) out.push({ rule: 'unvalidated', key: `unvalidated:${it.id}`, severity: 'medium', it, acc: ds.filter(id => decs.get(id)?.status === 'accepted') });
        } else if (it.status === 'open') {
          if (it.type === 'risk') { const s = raidScore(it); if (s >= RAID_HIGH) out.push({ rule: 'risk', key: `risk:${it.id}`, severity: it.mitigation ? 'low' : 'high', it, score: s }); }
          else if (it.due && it.due < now) out.push({ rule: 'overdue', key: `overdue:${it.id}`, severity: 'medium', it });
        }
      });
      return out;
    }
    return { RAID_TYPES, RAID_PFX, RAID_ALIAS, RAID_STATUS, RAID_VAL, RAID_ST_ALIAS, RAID_VAL_ALIAS, RAID_COLOR, RAID_TYPE_COLOR, RAID_LEVEL_COLOR, RAID_MAX, RAID_HIGH, RAID_MEDIUM, raidType, raidStatus, raidVal, raidNum, raidNextId, raidInt, raidLong, raidScore, raidLevel, raidState, cleanRaidLinks, cleanRaid, raidHeat, raidSummary, raidIssues };
  } };
