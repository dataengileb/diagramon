/* ==========================================================================
   Diagramon · modelo: radar tecnológico y fin de soporte (puro, sin DOM)
   --------------------------------------------------------------------------
   Movido desde src/app.js (bloque «radar») sin cambios de comportamiento.
   Se usa como fábrica: recibe { C, loc, colorVar, fold, addFindingSource, today, SEVERITY, fmtDay, T } de la app y devuelve sus funciones.
   API: window.DiagramonModels.radar
   ========================================================================== */
window.DiagramonModels = window.DiagramonModels || {};
window.DiagramonModels.radar = function (deps) {
  const { C, loc, colorVar, fold, addFindingSource, today, SEVERITY, fmtDay, T } = deps;
  const RDC = C.techRadar || {}, RDR = RDC.rules || {};
  const RD_KEYS = ['adopt', 'trial', 'hold', 'retire'], RD_ID = /^[A-Za-z0-9_.-]{1,40}$/, RD_MAX = 60;
  const rdRingInfo = k => { if (!RD_KEYS.includes(k)) return null; const r = RDC.rings?.[k] || {}; return { k, label: loc(r.label) || k, short: r.short || k.toUpperCase(), color: colorVar(r.color) || 'var(--muted)' }; };
  const rdFold = x => fold(x).replace(/\s+/g, ' ').trim();
  const rdDay = (y, mo, d) => `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  // Fin de soporte 'AAAA-MM' (último día de ese mes) o 'AAAA-MM-DD' → 'AAAA-MM-DD'; '' si no es una fecha válida
  const rdEos = v => {
    const r = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(v ?? '').trim());
    if (!r) return '';
    const y = +r[1], mo = +r[2], last = mo >= 1 && mo <= 12 ? new Date(Date.UTC(y, mo, 0)).getUTCDate() : 0, d = r[3] == null ? last : +r[3];
    return d >= 1 && d <= last ? rdDay(y, mo, d) : '';
  };
  const rdPhaseDay = v => { const r = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(v ?? '')); return r ? `${r[1]}-${r[2]}-${r[3] || '01'}` : ''; };
  const rdPlus = (day, n) => { const d = new Date(`${day}T12:00`); d.setMonth(d.getMonth() + n); return rdDay(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
  // Textos: simples o { en, es }; se guardan limpios y se traducen al mostrarlos
  const rdText = (v, max) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) { const o = {}; Object.entries(v).forEach(([k, t]) => { const x = /^[a-z]{2}$/.test(k) ? rdText(t, max) : ''; if (x) o[k] = x; }); return Object.keys(o).length ? o : ''; }
    return typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\s+/g, ' ').trim().slice(0, max) : '';
  };
  function cleanRadarEntry(e) {
    if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
    const id = String(e.id ?? '').trim(), ring = String(e.ring ?? '').trim().toLowerCase();
    if (!RD_ID.test(id) || !RD_KEYS.includes(ring)) return null;
    const mt = e.match && typeof e.match === 'object' ? e.match : {}, match = {};
    ['icon', 'type', 'text'].forEach(k => { const t = rdText(mt[k], 80); if (t && typeof t === 'string') match[k] = t; });
    if (!Object.keys(match).length) return null;
    const o = { id, ring, match };
    [['name', 80], ['replaceWith', 80], ['note', 200]].forEach(([k, max]) => { const t = rdText(e[k], max); if (t) o[k] = t; });
    { const eos = String(e.eos ?? '').trim(); if (rdEos(eos)) o.eos = eos; }
    return o;
  }
  function cleanRadarList(raw) {
    const seen = new Set(), out = [];
    (Array.isArray(raw) ? raw : []).forEach(x => { const e = cleanRadarEntry(x); if (e && !seen.has(e.id) && out.length < RD_MAX) { seen.add(e.id); out.push(e); } });
    return out;
  }
  // radar de un componente: un id (lo fija a esa entrada) o 'none' (false también); cualquier otra cosa no es nada
  const cleanRadarRef = v => (v === false || (typeof v === 'string' && v.trim().toLowerCase() === 'none') ? 'none' : typeof v === 'string' && RD_ID.test(v.trim()) ? v.trim() : null);
  const RD_BASE = cleanRadarList(RDC.entries);
  let rdMemo = { key: null, list: RD_BASE };
  const radarEntries = m => {
    const d = m?.radar;
    if (!d?.length) return RD_BASE;
    if (rdMemo.key !== d) rdMemo = { key: d, list: [...RD_BASE.map(b => d.find(x => x.id === b.id) || b), ...d.filter(x => !RD_BASE.some(b => b.id === x.id))] };
    return rdMemo.list;
  };
  const radarOf = (n, m) => {
    if (!n || n.radar === 'none') return null;
    const list = radarEntries(m);
    if (!list.length) return null;
    if (n.radar) return list.find(e => e.id === n.radar) || null;
    const hay = rdFold(`${n.label || ''} ${n.sub || ''}`);
    return list.find(e => (!e.match.icon || n.icon === e.match.icon) && (!e.match.type || n.type === e.match.type) && (!e.match.text || hay.includes(rdFold(e.match.text)))) || null;
  };
  // Estado del soporte: none (sin fecha) · ok · soon (termina dentro de warnMonths) · ended (la fecha ya pasó)
  const radarStatus = (e, now) => {
    const eos = e?.eos ? rdEos(e.eos) : '';
    if (!eos) return 'none';
    return eos < now ? 'ended' : eos <= rdPlus(now, Math.max(0, Math.min(60, +RDC.warnMonths >= 0 ? +RDC.warnMonths : 6))) ? 'soon' : 'ok';
  };
  const radarInfo = (n, m, now) => {
    const e = radarOf(n, m), ring = e && rdRingInfo(e.ring);
    return e && ring ? { entry: e, ring, name: loc(e.name) || e.id, eos: e.eos || '', eosDay: e.eos ? rdEos(e.eos) : '', status: radarStatus(e, now), replaceWith: loc(e.replaceWith) || '', note: loc(e.note) || '' } : null;
  };
  // Avisos del radar en Revisión (config.js › techRadar.rules); solo avisan
  addFindingSource('radar', m => {
    if (!radarEntries(m).length) return [];
    const out = [], now = today(), on = id => !!RDR[id] && RDR[id].enabled !== false, sev = id => (SEVERITY.includes(RDR[id]?.severity) ? RDR[id].severity : 'low');
    const ph = m.phases || [], phIx = id => ph.findIndex(p => p.id === id);
    m.nodes.forEach(n => {
      const i = radarInfo(n, m, now);
      if (!i) return;
      const v = { n: n.label, p: i.name, d: i.eosDay ? fmtDay(i.eosDay) : '', r: i.replaceWith };
      const add = (rule, fix = '') => out.push({ id: `radar:${rule}:node:${n.id}`, source: 'radar', rule: `rdr.${rule}`, severity: sev(`rdr.${rule}`), target: { kind: 'node', id: n.id }, title: T(`radar.f.${rule}.t`, v), fix: fix || T(i.replaceWith ? 'radar.f.fix.replace' : 'radar.f.fix.plan', v) });
      const ended = i.status === 'ended';
      if (ended) { if (on('rdr.eos-passed')) add('eos-passed'); }
      else if (i.entry.ring === 'retire') { if (on('rdr.retire')) add('retire'); }
      else if (i.status === 'soon' && on('rdr.eos-soon')) add('eos-soon');
      if (!ended && i.eosDay && ph.length && on('rdr.phase-after-eos')) {
        const last = n.until ? phIx(n.until) - 1 : ph.length - 1, pd = last >= 0 ? rdPhaseDay(ph[last].date) : '';
        if (pd && pd > i.eosDay) out.push({ id: `radar:phase-after-eos:node:${n.id}`, source: 'radar', rule: 'rdr.phase-after-eos', severity: sev('rdr.phase-after-eos'), target: { kind: 'node', id: n.id }, title: T('radar.f.phase-after-eos.t', { ...v, f: ph[last].name || ph[last].id }), fix: T('radar.f.fix.phase', v) });
      }
      if (i.entry.ring === 'hold' && n.phase && phIx(n.phase) > 0 && on('rdr.hold-added')) add('hold-added', T('radar.f.fix.hold', v));
      if (i.entry.ring === 'retire' && n.disposition === 'retain' && on('rdr.retire-retained')) add('retire-retained', T('radar.f.fix.migrate', v));
    });
    return out;
  });
  return { RDC, RDR, RD_KEYS, RD_ID, RD_MAX, rdRingInfo, rdFold, rdDay, rdEos, rdPhaseDay, rdPlus, rdText, cleanRadarEntry, cleanRadarList, cleanRadarRef, RD_BASE, rdMemo, radarEntries, radarOf, radarStatus, radarInfo };
};
