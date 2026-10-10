/* ==========================================================================
   Diagramon · modelo: informe de estado (puro, sin DOM)
   --------------------------------------------------------------------------
   Código movido tal cual desde src/app.js (bloque «statusModel»), sin cambios de comportamiento.
   API: window.DiagramonModels.status = { ST_SNAP, ST_SEV, stDay, statusBase, statusModel, statusText, statusPick, statusDoc, statusPlain }
   ========================================================================== */
window.DiagramonModels = window.DiagramonModels || {};
window.DiagramonModels.status = (() => {
  const ST_SNAP = ['title', 'direction', 'routing', 'layerNames', 'radar', 'phases', 'datasets', 'edgeTypes', 'dismissed', 'groups', 'nodes', 'edges', 'notes', 'zones'];
  const ST_SEV = ['critical', 'high', 'medium', 'low'], ST_MAX = 50;
  const stDay = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : '');
  // spec = { kind: 'last' } | { kind: 'version', id } | { kind: 'date', day }. Con fecha, el diagrama se compara con la última versión guardada hasta ese día (sin versiones, solo cuentan las fechas).
  function statusBase(m, spec, h) {
    const vs = (m.versions || []).filter(v => v && v.diagram), s = spec || { kind: 'last' };
    const lastOf = list => list.reduce((a, v) => (!a || (stDay(v.updated) || stDay(v.created)) >= (stDay(a.updated) || stDay(a.created)) ? v : a), null);
    const mk = v => ({ id: v.id, day: stDay(v.updated) || stDay(v.created), label: h.verLabel(v), model: h.prepared(v) });
    if (s.kind === 'version') { const v = vs.find(x => x.id === s.id); return v ? mk(v) : null; }
    if (s.kind === 'date') {
      const day = stDay(s.day);
      if (!day) return null;
      const v = lastOf(vs.filter(x => (stDay(x.updated) || stDay(x.created)) <= day));
      return v ? { ...mk(v), day, snapDay: stDay(v.updated) || stDay(v.created) } : { id: '', day, label: '', model: null };
    }
    const v = lastOf(vs);
    return v ? mk(v) : null;
  }
  function statusModel(m, base, h) {
    if (!base || !base.day) return { empty: true };
    const day = base.day, out = { baseDay: day, baseLabel: base.label || '', snapshot: !!base.model };
    const cap = a => a.slice(0, ST_MAX), id = x => ({ id: x.id, label: x.label || x.id });
    const dated = (list, key) => (list || []).filter(x => stDay(x[key]) > day);
    if (base.model) {
      const bm = { ...m, ...Object.fromEntries(ST_SNAP.map(k => [k, base.model[k]])), groups: base.model.groups || [], nodes: base.model.nodes || [], edges: base.model.edges || [], notes: base.model.notes || [], zones: base.model.zones || [] };
      const d = h.diff(bm, m), was = new Map(bm.nodes.map(n => [n.id, n])), pn = (mm, pid) => (pid ? (mm.phases || []).find(p => p.id === pid)?.name || pid : '');
      out.components = { added: cap(d.nodes.added.map(id)), removed: cap(d.nodes.removed.map(id)), changed: cap(d.nodes.changed.map(c => ({ ...id(c.item), fields: c.fields }))) };
      out.connections = { added: d.edges.added.length, removed: d.edges.removed.length, changed: d.edges.changed.length };
      const bp = new Map((bm.phases || []).map(p => [p.id, p])), cp = new Map((m.phases || []).map(p => [p.id, p]));
      out.phases = {
        added: cap([...cp.values()].filter(p => !bp.has(p.id)).map(p => ({ id: p.id, name: p.name }))), removed: cap([...bp.values()].filter(p => !cp.has(p.id)).map(p => ({ id: p.id, name: p.name }))),
        moved: cap([...cp.values()].filter(p => bp.has(p.id) && (bp.get(p.id).date || '') !== (p.date || '')).map(p => ({ id: p.id, name: p.name, from: bp.get(p.id).date || '', to: p.date || '' }))),
        components: cap(d.nodes.changed.filter(c => c.fields.includes('phase')).map(c => ({ ...id(c.item), from: pn(bm, was.get(c.item.id)?.phase), to: pn(m, c.item.phase) })))
      };
      const c0 = h.monthly(bm), c1 = h.monthly(m);
      out.cost = c0 || c1 ? { from: c0, to: c1, delta: Math.round((c1 - c0) * 100) / 100 } : null;
      const e0 = h.effort(bm), e1 = h.effort(m);
      out.effort = e0 || e1 ? { days: [e0 ? e0.totals.days : 0, e1 ? e1.totals.days : 0], total: [e0 ? e0.totals.total : 0, e1 ? e1.totals.total : 0] } : null;
      const f0 = new Map(h.findings(bm).map(f => [f.id, f])), f1 = new Map(h.findings(m).map(f => [f.id, f])), by = (a, b) => ST_SEV.indexOf(a.severity) - ST_SEV.indexOf(b.severity) || String(a.id).localeCompare(String(b.id));
      const fx = f => ({ id: f.id, title: f.title, severity: f.severity });
      out.risks = { added: cap([...f1.values()].filter(f => !f0.has(f.id)).sort(by).map(fx)), resolved: cap([...f0.values()].filter(f => !f1.has(f.id)).sort(by).map(fx)) };
    }
    const last = d => { const hist = d.history?.length ? d.history : [{ status: d.status, date: d.date }]; return hist.filter(x => stDay(x.date) > day && (x.status === 'accepted' || x.status === 'rejected')).pop(); };
    const dx = (d, e) => ({ id: d.id, title: d.title || '', date: e ? e.date : d.date, ...(e?.by ? { by: e.by } : {}) });
    const ds = m.decisions || [];
    out.decisions = {
      accepted: cap(ds.filter(d => d.status === 'accepted' && last(d)?.status === 'accepted').map(d => dx(d, last(d)))),
      rejected: cap(ds.filter(d => d.status === 'rejected' && last(d)?.status === 'rejected').map(d => dx(d, last(d)))),
      proposed: cap(ds.filter(d => d.status === 'proposed').filter(d => { const hist = d.history?.length ? d.history : [{ date: d.date }]; return stDay(hist[0].date) > day; }).map(d => dx(d)))
    };
    out.pending = cap(h.pending(m));
    const cm = (m.comments || []).filter(c => !c.internal && c.status !== 'resolved');
    out.comments = { open: cm.length, added: cm.filter(c => stDay(c.date) > day).length };
    out.versions = cap(dated(m.versions, 'created').map(v => ({ label: h.verLabel(v), status: v.status || '' })));
    const n = (...l) => l.reduce((a, x) => a + x, 0);
    out.quiet = !n(out.components ? n(out.components.added.length, out.components.removed.length, out.components.changed.length, out.connections.added, out.connections.removed, out.connections.changed, out.phases.added.length, out.phases.removed.length, out.phases.moved.length, out.risks.added.length, out.risks.resolved.length) + (out.cost?.delta ? 1 : 0) + (out.effort && (out.effort.days[0] !== out.effort.days[1] || out.effort.total[0] !== out.effort.total[1]) ? 1 : 0) : 0,
      out.decisions.accepted.length, out.decisions.rejected.length, out.decisions.proposed.length, out.pending.length, out.comments.added, out.versions.length);
    return out;
  }
  // Redacción: secciones { k, title, lines: [texto] } y una frase de apertura. T(clave, valores) = plantillas de i18n; f = { money, day, phaseDate } (formatos del idioma).
  // Las listas llevan hasta 6 nombres y «y N más»; los plurales y la conjunción salen de las plantillas.
  function statusText(d, T, f) {
    if (d.empty) return { intro: T('stat.empty'), sections: [], quiet: true };
    const list = (names, max = 6) => { const a = names.filter(Boolean), shown = a.slice(0, max), rest = a.length - shown.length; return rest > 0 ? `${shown.join(', ')} ${T('stat.more', rest)}` : shown.length > 1 ? `${shown.slice(0, -1).join(', ')} ${T('stat.and')} ${shown[shown.length - 1]}` : shown[0] || ''; };
    const intro = d.baseLabel ? T('stat.intro.v', { label: d.baseLabel, day: f.day(d.baseDay) }) : T('stat.intro.d', { day: f.day(d.baseDay) }), secs = [], add = (k, lines) => { const l = lines.filter(Boolean); if (l.length) secs.push({ k, title: T(`stat.s.${k}`), lines: l }); };
    const c = d.components, dc = d.decisions, r = d.risks, p = d.phases, sg = x => (x.severity === 'critical' || x.severity === 'high' ? `${x.title} (${T(`sev.${x.severity}`)})` : x.title);
    add('decisions', [dc.accepted.length && T('stat.dec.accepted', { n: dc.accepted.length, list: list(dc.accepted.map(x => `${x.id} ${x.title}`.trim())) }), dc.rejected.length && T('stat.dec.rejected', { n: dc.rejected.length, list: list(dc.rejected.map(x => `${x.id} ${x.title}`.trim())) }), dc.proposed.length && T('stat.dec.proposed', { n: dc.proposed.length, list: list(dc.proposed.map(x => `${x.id} ${x.title}`.trim())) })]);
    if (r) add('risks', [r.added.length && T('stat.risk.added', { n: r.added.length, list: list(r.added.map(sg)) }), r.resolved.length && T('stat.risk.resolved', { n: r.resolved.length, list: list(r.resolved.map(sg)) })]);
    if (p) add('phases', [...p.moved.map(x => T('stat.phase.moved', { name: x.name, from: x.from ? f.phaseDate(x.from) : '—', to: x.to ? f.phaseDate(x.to) : '—' })), p.added.length && T('stat.phase.added', { n: p.added.length, list: list(p.added.map(x => x.name)) }), p.removed.length && T('stat.phase.removed', { n: p.removed.length, list: list(p.removed.map(x => x.name)) }),
      ...p.components.slice(0, 6).map(x => T('stat.phase.comp', { name: x.label, from: x.from || T('stat.first'), to: x.to || T('stat.first') })), p.components.length > 6 && T('stat.phase.compMore', p.components.length - 6)]);
    if (c) add('components', [c.added.length && T('stat.comp.added', { n: c.added.length, list: list(c.added.map(x => x.label)) }), c.removed.length && T('stat.comp.removed', { n: c.removed.length, list: list(c.removed.map(x => x.label)) }), c.changed.length && T('stat.comp.changed', { n: c.changed.length, list: list(c.changed.map(x => x.label)) }),
      (d.connections.added || d.connections.removed || d.connections.changed) && T('stat.conn', d.connections)]);
    const ef = d.effort, ch = ef && (ef.days[0] !== ef.days[1] || ef.total[0] !== ef.total[1]), sgn = v => `${v > 0 ? '+' : '−'}${Math.abs(Math.round(v * 100) / 100)}`;
    add('money', [d.cost && d.cost.delta !== 0 && T('stat.cost', { from: f.money(d.cost.from), to: f.money(d.cost.to), delta: `${d.cost.delta > 0 ? '+' : '−'}${f.money(Math.abs(d.cost.delta))}` }), ch && ef.days[0] !== ef.days[1] && T('stat.effort', { from: ef.days[0], to: ef.days[1], delta: sgn(ef.days[1] - ef.days[0]) }),
      ch && ef.total[0] !== ef.total[1] && T('stat.build', { from: f.money(ef.total[0]), to: f.money(ef.total[1]) })]);
    add('pending', d.pending.map(x => T(x.kind === 'decision' ? 'stat.pend.decision' : 'stat.pend.version', { label: x.label, who: list(x.missing) })));
    add('comments', [(d.comments.open || d.comments.added) && T('stat.comments', d.comments)]);
    add('versions', d.versions.map(x => T('stat.version', { label: x.label, status: x.status ? T(`ver.st.${x.status}`) : '' })));
    return { intro, sections: secs, quiet: !!d.quiet, none: d.quiet ? T('stat.none') : '' };
  }
  // Salidas: el mismo texto en tres formas. statusDoc arma el documento que pintan reportMarkdown y reportHTML (como el informe del proyecto: mismo escapado, mismo idioma);
  // statusPlain es texto para pegar en un correo. keys = secciones elegidas (se respeta el orden fijo de statusText); o = { title, lang, date }.
  const statusPick = (t, keys) => t.sections.filter(x => !keys || keys.includes(x.k));
  function statusDoc(t, keys, o) {
    return { title: o.title, lang: o.lang, date: o.date || '', sub: [t.intro, t.none].filter(Boolean).join(' '), files: [], sections: statusPick(t, keys).map(x => ({ id: x.k, title: x.title, blocks: [{ k: 'ul', items: x.lines }] })) };
  }
  function statusPlain(t, keys, o) {
    const out = [o.title, '', [t.intro, t.none].filter(Boolean).join(' ')];
    statusPick(t, keys).forEach(x => { out.push('', x.title, ...x.lines.map(l => `- ${l}`)); });
    return `${out.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
  }

  return { ST_SNAP, ST_SEV, stDay, statusBase, statusModel, statusText, statusPick, statusDoc, statusPlain };
})();
