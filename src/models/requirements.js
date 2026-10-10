/* ==========================================================================
   Diagramon · modelo: requisitos y sus controles (puro, sin DOM)
   --------------------------------------------------------------------------
   Bloque «reqModel» movido desde src/app.js (v2), sin cambios de comportamiento.
   API: window.DiagramonModels.requirements
   ========================================================================== */
window.DiagramonModels = window.DiagramonModels || {};
window.DiagramonModels.requirements = (() => {
    const REQ_KIND = ['driver', 'nfr', 'constraint', 'principle'], REQ_PRIO = ['must', 'should', 'could'], REQ_STATUS = ['draft', 'agreed', 'dropped'];
    const REQ_METRIC = ['availability', 'rpo', 'rto', 'cost', 'encryption', 'residency', 'freshness'];
    const REQ_PARAMS = { availability: ['from', 'to', 'target'], rpo: ['from', 'to', 'target'], rto: ['from', 'to', 'target'], cost: ['target'], encryption: ['cls'], residency: ['cls', 'jur'], freshness: ['ds', 'target'] };
    const REQ_ALIAS = { impulsor: 'driver', rnf: 'nfr', restriccion: 'constraint', principio: 'principle', debe: 'must', deberia: 'should', podria: 'could', borrador: 'draft', acordado: 'agreed', acordada: 'agreed', descartado: 'dropped', descartada: 'dropped',
      disponibilidad: 'availability', costo: 'cost', coste: 'cost', cifrado: 'encryption', residencia: 'residency', frescura: 'freshness' };
    const REQ_COLOR = { driver: 'var(--p-cielo)', nfr: 'var(--p-lavanda)', constraint: 'var(--p-melocoton)', principle: 'var(--p-menta)' };
    const reqEnum = (v, list) => { const k = String(v ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); return list.includes(k) ? k : list.includes(REQ_ALIAS[k]) ? REQ_ALIAS[k] : ''; };
    const reqNum = id => { const r = /^REQ-(\d+)$/i.exec(String(id)); return r ? +r[1] : 0; };
    const reqNextId = list => `REQ-${String(Math.max(0, ...list.map(r => reqNum(r.id))) + 1).padStart(3, '0')}`;
    // Solo enlaces a ids que existen (decisiones: las de m.decisions)
    function cleanReqLinks(l, m) {
      const out = {};
      l = l && typeof l === 'object' ? l : {};
      [['decisions', m.decisions || []], ['nodes', m.nodes], ['edges', m.edges], ['groups', m.groups]].forEach(([k, src]) => {
        const ok = new Set(src.map(x => x.id)), ids = [...new Set((Array.isArray(l[k]) ? l[k] : []).map(String).filter(id => ok.has(id)))];
        if (ids.length) out[k] = ids;
      });
      return out;
    }
    // Solo los parámetros que la métrica necesita; origen y destino solo si el nodo existe; objetivo numérico (disponibilidad: 0..100; el resto: 0 o más)
    function cleanReqCheck(c, m) {
      const metric = reqEnum(c?.metric, REQ_METRIC);
      if (!metric) return null;
      const out = { metric }, ps = REQ_PARAMS[metric];
      ['from', 'to'].filter(k => ps.includes(k)).forEach(k => { const v = String(c[k] ?? '').trim(); if (m.nodes.some(n => n.id === v)) out[k] = v; });
      if (ps.includes('ds')) { const v = String(c.ds ?? '').replace(/\s+/g, ' ').trim().slice(0, 120); if (v) out.ds = v; }   // nombre del conjunto de datos (como en las conexiones)
      if (ps.includes('target') && c.target != null && String(c.target).trim() !== '') { const t = Number(String(c.target).replace(',', '.')); if (Number.isFinite(t) && t >= 0 && (metric !== 'availability' || t <= 100)) out.target = t; }
      ['cls', 'jur'].filter(k => ps.includes(k)).forEach(k => { const v = String(c[k] ?? '').trim().toLowerCase().slice(0, 40); if (v) out[k] = v; });
      return out;
    }
    function cleanRequirements(raw, m) {
      const txt = v => String(v ?? '').replace(/\r\n?/g, '\n').slice(0, 4000);
      const seen = new Set(), items = [];
      (Array.isArray(raw) ? raw : []).forEach(r => {
        if (!r || typeof r !== 'object' || Array.isArray(r)) return;
        const title = String(r.title ?? '').trim().slice(0, 200), detail = txt(r.detail);
        let id = String(r.id ?? '').trim().slice(0, 40);
        if (!id && !title && !detail.trim()) return;
        if (!id || seen.has(id)) id = ''; else seen.add(id);
        const o = { id, title, kind: reqEnum(r.kind, REQ_KIND) || 'driver' };
        if (detail.trim()) o.detail = detail;
        const pr = reqEnum(r.priority, REQ_PRIO);
        if (pr) o.priority = pr;
        o.status = reqEnum(r.status, REQ_STATUS) || 'draft';
        const src = String(r.source ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
        if (src) o.source = src;
        const ck = r.check && typeof r.check === 'object' ? cleanReqCheck(r.check, m) : null;
        if (ck) o.check = ck;
        const lk = cleanReqLinks(r.links, m);
        if (Object.keys(lk).length) o.links = lk;
        items.push(o);
      });
      items.forEach(o => { if (!o.id) o.id = reqNextId(items); });
      return items;
    }
    // Cobertura: decisiones aceptadas enlazadas y componentes (nodos, conexiones, grupos) enlazados; cubierto = alguna de las dos
    function reqCover(r, m) {
      const l = r.links || {}, ds = (l.decisions || []).map(id => (m.decisions || []).find(d => d.id === id)).filter(d => d && d.status === 'accepted');
      const comps = (l.nodes || []).length + (l.edges || []).length + (l.groups || []).length;
      return { decisions: ds, comps, covered: ds.length > 0 || comps > 0 };
    }
    // Evalúa el control de un requisito → { state: 'pass' | 'fail' | 'unknown', actual, detail }. Solo corre con estado «agreed».
    // h = lo que la app ya calcula: T, availability(a, b) → { availability, rpo, rto } | null, cost(m) → mensual | null, carries(e, get, cls), crossBorder(e), sensitive(cls),
    //     nodeJur(n) → clave de jurisdicción, edgeName(e), pct(a), dur(seg), money(v), num(v)
    function reqEval(r, m, h) {
      const c = r.check, T = h.T, res = (state, actual, detail = '') => ({ state, actual, detail });
      if (!c) return res('unknown', null, T('req.chk.none'));
      if (r.status !== 'agreed') return res('unknown', null, T('req.chk.draft'));
      const miss = (REQ_PARAMS[c.metric] || []).filter(k => c[k] == null || c[k] === '');
      if (miss.length) return res('unknown', null, T('req.chk.missing', { p: miss.map(k => T(`req.chk.p.${k}`)).join(', ') }));
      const get = id => m.nodes.find(n => n.id === id), list = es => { const nm = es.slice(0, 5).map(h.edgeName).join('; '); return es.length > 5 ? `${nm}; +${es.length - 5}` : nm; };
      if (c.metric === 'availability' || c.metric === 'rpo' || c.metric === 'rto') {
        if (!get(c.from) || !get(c.to)) return res('unknown', null, T('req.chk.node'));
        const a = h.availability(c.from, c.to);
        if (!a) return res('unknown', null, T('req.chk.noRoute'));
        if (c.metric === 'availability') {
          if (a.availability == null) return res('unknown', null, T('req.chk.noSla'));
          const act = a.availability * 100, ok = act + 1e-9 >= c.target;
          return res(ok ? 'pass' : 'fail', act, T('req.chk.d.avail', { a: h.pct(a.availability), t: `${h.num(c.target)}%` }));
        }
        const sec = a[c.metric];
        if (sec == null) return res('unknown', null, T('req.chk.noDur', c.metric.toUpperCase()));
        const ok = sec <= c.target * 3600 + 1e-6;
        return res(ok ? 'pass' : 'fail', sec / 3600, T('req.chk.d.dur', { m: c.metric.toUpperCase(), a: h.dur(sec), t: h.dur(c.target * 3600) }));
      }
      if (c.metric === 'cost') {
        const tot = h.cost(m);
        if (tot == null) return res('unknown', null, T('req.chk.noCost'));
        return res(tot <= c.target + 1e-9 ? 'pass' : 'fail', tot, T('req.chk.d.cost', { a: h.money(tot), t: h.money(c.target) }));
      }
      if (c.metric === 'freshness') {   // peor frescura de extremo a extremo del conjunto (suma de las latencias del camino más lento) frente al objetivo en horas
        const f = h.e2e?.(c.ds);
        if (!f || f.worst == null) return res('unknown', null, T('req.chk.noFresh', c.ds));
        const hrs = f.worst / 3600000, ok = f.worst <= c.target * 3600000 + 1e-6;
        return res(ok ? 'pass' : 'fail', hrs, T('req.chk.d.fresh', { n: c.ds, a: h.dur(f.worst / 1000), t: h.dur(c.target * 3600) }));
      }
      if (c.metric === 'encryption') {
        const es = m.edges.filter(e => h.carries(e, get, c.cls));
        if (!es.length) return res('unknown', null, T('req.chk.noEdges', c.cls));
        const bad = es.filter(e => e.encrypted !== true);
        return res(bad.length ? 'fail' : 'pass', bad.length, bad.length ? T('req.chk.d.enc', { n: bad.length, c: c.cls, list: list(bad) }) : T('req.chk.d.encOk', { n: es.length, c: c.cls }));
      }
      if (!h.sensitive(c.cls)) return res('unknown', null, T('req.chk.notSens', c.cls));
      if (!m.nodes.some(n => h.nodeJur(n) === c.jur)) return res('unknown', null, T('req.chk.noJur', c.jur));
      const bad = m.edges.filter(e => { const cb = h.crossBorder(e); return cb && !cb.approved && cb.classes.includes(c.cls) && cb.from.jur.key === c.jur && cb.to.jur.key !== c.jur; });
      return res(bad.length ? 'fail' : 'pass', bad.length, bad.length ? T('req.chk.d.res', { n: bad.length, c: c.cls, j: c.jur, list: list(bad) }) : T('req.chk.d.resOk', { c: c.cls, j: c.jur }));
    }
    // Hallazgos de los requisitos acordados: obligatorios y recomendables sin cobertura (ni decisión aceptada ni componente enlazado) y controles que fallan
    function reqIssues(m, h) {
      const out = [];
      (m.requirements || []).forEach(r => {
        if (r.status !== 'agreed') return;
        if ((r.priority === 'must' || r.priority === 'should') && !reqCover(r, m).covered) out.push({ rule: 'uncovered', r, severity: r.priority === 'must' ? 'medium' : 'low' });
        const c = r.check && reqEval(r, m, h);
        if (c?.state === 'fail') out.push({ rule: 'fail', r, severity: r.priority === 'must' ? 'high' : 'medium', detail: c.detail });
      });
      return out;
    }
    return { REQ_KIND, REQ_PRIO, REQ_STATUS, REQ_METRIC, REQ_PARAMS, REQ_ALIAS, REQ_COLOR, reqEnum, reqNum, reqNextId, cleanReqLinks, cleanReqCheck, cleanRequirements, reqCover, reqEval, reqIssues };
})();
