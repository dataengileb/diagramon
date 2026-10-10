/* ==========================================================================
   Diagramon · modelo: interesados y matriz RACI (puro, sin DOM)
   --------------------------------------------------------------------------
   Bloque «stakeholderModel» movido desde src/app.js (v2), sin cambios de comportamiento.
   API: window.DiagramonModels.stakeholders
   ========================================================================== */
window.DiagramonModels = window.DiagramonModels || {};
window.DiagramonModels.stakeholders = (() => {
    const SH_ORG = ['client', 'partner', 'internal'], SH_RACI = ['R', 'A', 'C', 'I'], SH_ORG_ALIAS = { cliente: 'client', socio: 'partner', interno: 'internal' };
    const SH_MAX = 200, SH_AREAS = 40;   // límite de interesados; claves de raci por interesado
    const shOrg = v => { const k = String(v ?? '').trim().toLowerCase(); return SH_ORG.includes(k) ? k : SH_ORG_ALIAS[k] || 'client'; };
    const shArea = a => (String(a ?? '').trim() === '*' ? '*' : String(a ?? '').replace(/[,\s]+/g, ' ').trim().slice(0, 60));   // sin comas: el texto separa las áreas con comas
    function cleanShRaci(raw) {
      const out = {}, seen = new Set();
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) Object.entries(raw).forEach(([k, v]) => {
        const a = shArea(k), r = String(v ?? '').trim().toUpperCase();
        if (!a || !SH_RACI.includes(r) || seen.has(a.toLowerCase()) || Object.keys(out).length >= SH_AREAS) return;
        seen.add(a.toLowerCase()); out[a] = r;
      });
      return out;
    }
    function cleanStakeholders(raw, m) {
      const seen = new Set(), items = [];
      (Array.isArray(raw) ? raw : []).forEach(s => {
        if (!s || typeof s !== 'object' || Array.isArray(s)) return;
        const name = String(s.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
        if (!name) return;
        let id = String(s.id ?? '').trim().slice(0, 40);
        if (!/^SH-\d+$/.test(id) || seen.has(id)) id = ''; else seen.add(id);
        items.push({ s, id, name });
      });
      const num = id => (/^SH-(\d+)$/.exec(id) || [0, 0])[1] | 0;
      items.forEach(o => { if (!o.id) o.id = `SH-${String(Math.max(0, ...items.map(x => num(x.id))) + 1).padStart(3, '0')}`; });
      return items.slice(0, SH_MAX).map(({ s, id, name }) => {
        const r = { id, name }, role = String(s.role ?? '').replace(/\s+/g, ' ').trim().slice(0, 80), raci = cleanShRaci(s.raci);
        if (role) r.role = role;
        r.org = shOrg(s.org);
        if (Object.keys(raci).length) r.raci = raci;
        if (s.versions === true) r.versions = true;
        if (s.inactive === true) r.inactive = true;
        return r;
      });
    }
    // ¿Tiene el interesado una A en esa área (o en '*')?
    const shIsA = (s, area) => !!s.raci && (s.raci['*'] === 'A' || (!!area && Object.entries(s.raci).some(([k, v]) => v === 'A' && k.toLowerCase() === String(area).trim().toLowerCase())));
    // Áreas de las decisiones (sin repetir, sin distinguir mayúsculas) y, detrás, las que solo aparecen en alguna matriz
    function shAreas(m) {
      const seen = new Map(), add = a => { a = shArea(a); if (a && a !== '*' && !seen.has(a.toLowerCase())) seen.set(a.toLowerCase(), a); };
      (m.decisions || []).forEach(d => add(d.area));
      (m.stakeholders || []).forEach(s => Object.keys(s.raci || {}).forEach(add));
      return [...seen.values()];
    }
    // Áreas usadas por alguna decisión y sin ningún aprobador (A) activo; solo si hay interesados
    function shGaps(m) {
      const act = (m.stakeholders || []).filter(s => !s.inactive), seen = new Map();
      if (!(m.stakeholders || []).length) return [];
      (m.decisions || []).forEach(d => { const a = shArea(d.area); if (a && !seen.has(a.toLowerCase())) seen.set(a.toLowerCase(), a); });
      return [...seen.values()].filter(a => !act.some(s => shIsA(s, a)));
    }
    return { SH_ORG, SH_RACI, SH_ORG_ALIAS, SH_MAX, SH_AREAS, shOrg, shArea, cleanShRaci, cleanStakeholders, shIsA, shAreas, shGaps };
})();
