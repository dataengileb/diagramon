/* ==========================================================================
   Diagramon · diseño frente a realidad (puro, sin DOM)
   --------------------------------------------------------------------------
   Compara los componentes de un diagrama (el diseño) con los que salen de
   convertir infraestructura desplegada con src/iac.js (la realidad).
   - Un componente del diseño se une con uno de la realidad por su campo `iac`
     (la dirección del recurso: aws_db_instance.main, un id de CloudFormation…).
   - Los que no tienen enlace reciben, como mucho, una PROPUESTA (mismo tipo o
     icono y nombre parecido) que una persona debe confirmar: aquí no se une nada solo.
   - De los pares unidos se comparan los datos que ambos lados afirman:
     región, réplicas, exposición pública y copia de seguridad.
   Nada de esto se guarda en el diagrama salvo el enlace `iac` y, más adelante,
   las diferencias aceptadas.
   API: window.DiagramonDrift.{ FIELDS, compare, propose }
   ========================================================================== */
window.DiagramonDrift = (() => {
  'use strict';

  const FIELDS = ['region', 'replicas', 'exposure', 'backup'];
  const list = v => (Array.isArray(v) ? v : []);
  const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
  const fold = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const flat = s => fold(s).replace(/[^a-z0-9]+/g, '');
  const tokens = s => new Set(fold(s).split(/[^a-z0-9]+/).filter(t => t.length > 1));

  // Valor normalizado de un dato para poder compararlo; null = no lo dice
  function norm(field, v) {
    if (v == null || v === '') return null;
    if (field === 'region') return fold(v).trim().replace(/[\s_]+/g, '') || null;
    if (field === 'replicas') { const n = Math.floor(+v); return Number.isFinite(n) && n >= 1 ? n : null; }
    if (field === 'exposure') return v === 'public' || v === 'internal' ? v : null;
    if (field === 'backup') return v === true || v === false ? v : null;
    return null;
  }

  // Parecido entre un componente del diseño y uno de la realidad: 0 = ninguno. Hace falta señal en el nombre.
  function score(d, r) {
    const a = flat(d.label), b = flat(r.label);
    let name = 0;
    if (a && b) {
      if (a === b) name = 3;
      else if (Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a))) name = 2;
      else { const x = tokens(d.label), y = tokens(r.label), n = [...x].filter(t => y.has(t)).length, u = new Set([...x, ...y]).size; if (u && n / u >= 0.5) name = 1; }
    }
    if (!name) return 0;
    const same = (d.type && d.type === r.type) || (d.icon && d.icon === r.icon);
    return name + (same ? 2 : 0);
  }

  // design: [{ id, label, type?, icon?, iac? }]; reality: lo mismo (más iac y facts); devuelve [{ design, reality, score }] uno a uno, de mayor a menor parecido
  function propose(design, reality, min = 3) {
    const cand = [];
    list(design).forEach(d => list(reality).forEach(r => { const s = score(d, r); if (s >= min) cand.push({ design: d.id, reality: r.id, score: s }); }));
    cand.sort((x, y) => y.score - x.score || String(x.design).localeCompare(String(y.design)) || String(x.reality).localeCompare(String(y.reality)));
    const dUsed = new Set(), rUsed = new Set(), out = [];
    cand.forEach(c => { if (!dUsed.has(c.design) && !rUsed.has(c.reality)) { dUsed.add(c.design); rUsed.add(c.reality); out.push(c); } });
    return out;
  }

  // opts.get(nodo, campo) → valor del diseño (por defecto, el campo del componente; la app pasa el valor heredado)
  function compare(design, reality, opts = {}) {
    const ds = list(design).filter(isObj), rs = list(reality).filter(isObj);
    const get = typeof opts.get === 'function' ? opts.get : (n, f) => n[f];
    const byAddr = new Map();
    rs.forEach(r => { if (typeof r.iac === 'string' && r.iac && !byAddr.has(r.iac)) byAddr.set(r.iac, r); });
    const pairs = [], paired = new Set(), pairedR = new Set(), missing = [];
    ds.forEach(d => {
      if (typeof d.iac !== 'string' || !d.iac) return;
      const r = byAddr.get(d.iac);
      if (r && !pairedR.has(r.id)) { pairs.push({ design: d.id, reality: r.id, iac: d.iac }); paired.add(d.id); pairedR.add(r.id); } else missing.push(d.id);
    });
    const freeD = ds.filter(d => !paired.has(d.id)), freeR = rs.filter(r => !pairedR.has(r.id));
    const proposals = propose(freeD, freeR);
    const pd = new Set(proposals.map(p => p.design)), pr = new Set(proposals.map(p => p.reality));
    const unlinked = freeD.filter(d => !d.iac && !pd.has(d.id)).map(d => d.id);
    const extra = freeR.filter(r => !pr.has(r.id)).map(r => r.id);
    const dBy = new Map(ds.map(d => [d.id, d])), rBy = new Map(rs.map(r => [r.id, r]));
    const diffs = [];
    pairs.forEach(p => {
      const d = dBy.get(p.design), r = rBy.get(p.reality), facts = isObj(r.facts) ? r.facts : {};
      FIELDS.forEach(f => {
        const dv = norm(f, get(d, f)), rv = norm(f, facts[f]);
        if (dv != null && rv != null && dv !== rv) diffs.push({ design: p.design, reality: p.reality, field: f, designValue: get(d, f), realityValue: facts[f] });
      });
    });
    return { pairs, proposals, missing, unlinked, extra, diffs };
  }

  return { FIELDS, compare, propose };
})();
