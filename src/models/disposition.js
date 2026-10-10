/* ==========================================================================
   Diagramon · modelo: disposición de migración (6R) (puro, sin DOM)
   --------------------------------------------------------------------------
   Movido desde src/app.js (bloque «migration») sin cambios de comportamiento.
   Se usa como fábrica: recibe { C, fold, loc, colorVar, esc, addFindingSource, SEVERITY, T } de la app y devuelve sus funciones.
   API: window.DiagramonModels.disposition
   ========================================================================== */
window.DiagramonModels = window.DiagramonModels || {};
window.DiagramonModels.disposition = function (deps) {
  const { C, fold, loc, colorVar, esc, addFindingSource, SEVERITY, T } = deps;
  const MGC = C.migration || {}, MGR = MGC.rules || {};
  const MG = Object.fromEntries(Object.entries(MGC.dispositions || {}).filter(([, d]) => d && d.enabled !== false));
  const mgNorm = x => fold(x).replace(/[\s_-]+/g, '');
  const MG_BY = new Map();
  Object.entries(MG).forEach(([k, d]) => [d.label?.en, d.label?.es, ...(d.alias || [])].forEach(w => { if (w) MG_BY.set(mgNorm(w), k); }));
  Object.keys(MG).forEach(k => MG_BY.set(mgNorm(k), k));   // la clave manda sobre cualquier alias
  const cleanDisposition = v => (typeof v === 'string' ? MG_BY.get(mgNorm(v)) || null : null);
  const mgInfo = k => { const d = MG[k]; return d ? { k, label: loc(d.label) || k, short: d.short || k.slice(0, 2).toUpperCase(), color: colorVar(d.color) || 'var(--muted)', hint: loc(d.hint) || '' } : null; };
  // Reparto { rehost: 3, retire: 1 } como «RH 3 · RT 1», en el orden de config.js (texto plano; el título lleva el nombre completo)
  const mgText = c => Object.keys(MG).filter(k => c?.[k]).map(k => `${mgInfo(k).short} ${c[k]}`).join(' · ');
  const mgChips = c => Object.keys(MG).filter(k => c?.[k]).map(k => { const i = mgInfo(k); return `<span class="mg-chip" style="--mg:${esc(i.color)}" title="${esc(i.label)}">${esc(i.short)} ${c[k]}</span>`; }).join(' ');
  // Avisos de coherencia entre la disposición y las fases / decisiones (config.js › migration.rules); solo avisan
  addFindingSource('migration', m => {
    if (!m.nodes.some(n => n.disposition)) return [];
    const out = [], on = id => !!MGR[id] && MGR[id].enabled !== false, sev = id => (SEVERITY.includes(MGR[id]?.severity) ? MGR[id].severity : 'low');
    const phased = !!m.phases?.length, withAdr = new Set((m.decisions || []).flatMap(d => d.links?.nodes || []));
    const add = (rule, n, title, fix) => out.push({ id: `migration:${rule}:node:${n.id}`, source: 'migration', rule: `mig.${rule}`, severity: sev(`mig.${rule}`), target: { kind: 'node', id: n.id }, title, fix });
    m.nodes.forEach(n => {
      const d = mgInfo(n.disposition);
      if (!d) return;
      if (on('mig.retire-no-until') && n.disposition === 'retire' && phased && !n.until) add('retire-no-until', n, T('mig.f.retire.t', n.label), T('mig.f.retire.fix'));
      if (on('mig.until-kept') && n.until && (MGR['mig.until-kept'].keepers || []).includes(n.disposition)) add('until-kept', n, T('mig.f.kept.t', { n: n.label, d: d.label }), T('mig.f.kept.fix'));
      if (on('mig.change-no-decision') && (MGR['mig.change-no-decision'].needsDecision || []).includes(n.disposition) && !withAdr.has(n.id)) add('change-no-decision', n, T('mig.f.adr.t', { n: n.label, d: d.label }), T('mig.f.adr.fix'));
    });
    return out;
  });
  return { MGC, MGR, MG, mgNorm, MG_BY, cleanDisposition, mgInfo, mgText, mgChips };
};
