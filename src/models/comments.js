/* ==========================================================================
   Diagramon · modelo: comentarios e hilos de revisión (puro, sin DOM)
   --------------------------------------------------------------------------
   Movido desde src/app.js (bloque «commentModel») sin cambios de comportamiento.
   Se usa como fábrica: recibe { C, isDay, addFindingSource, SEVERITY, T } de la app y devuelve sus funciones.
   API: window.DiagramonModels.comments
   ========================================================================== */
window.DiagramonModels = window.DiagramonModels || {};
window.DiagramonModels.comments = function (deps) {
  const { C, isDay, addFindingSource, SEVERITY, T } = deps;
  const CMC = C.comments || {}, CM_MAX = CMC.max || 500, CM_REPLIES = CMC.maxReplies || 50, CM_TEXT = CMC.textMax || 4000, CMR = CMC.rules || {};
  const CM_KINDS = ['node', 'edge', 'group', 'decision', 'requirement', 'version'];
  const cmHas = (m, on) => !!on && CM_KINDS.includes(on.kind) && ({ node: m.nodes, edge: m.edges, group: m.groups, decision: m.decisions, requirement: m.requirements, version: m.versions }[on.kind] || []).some(x => x.id === on.id);
  const cmStr = (v, n) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, n);
  const cmWho = v => cmStr(v, 80).replace(/\s+/g, ' ');
  function cleanComments(raw, m) {
    const out = [], seen = new Set();
    (Array.isArray(raw) ? raw : []).forEach(c => {
      if (out.length >= CM_MAX || !c || typeof c !== 'object' || Array.isArray(c)) return;
      const text = cmStr(c.text, CM_TEXT);
      if (!text) return;
      const on0 = c.on && typeof c.on === 'object' && !Array.isArray(c.on) ? c.on : {}, oid = cmStr(on0.id, 120);
      let on = { kind: 'general' }, was = cmStr(c.was, 120);
      if (CM_KINDS.includes(on0.kind) && oid) { if (cmHas(m, { kind: on0.kind, id: oid })) { on = { kind: on0.kind, id: oid }; was = ''; } else was = oid; }
      const rid = cmStr(c.id, 40), o = { id: /^CM-\d+$/.test(rid) && !seen.has(rid) ? rid : '', on };
      if (o.id) seen.add(o.id);
      const author = cmWho(c.author);
      if (author) o.author = author;
      if (isDay(c.date)) o.date = c.date;
      o.text = text;
      if (c.status === 'resolved') o.status = 'resolved';
      if (c.internal === true) o.internal = true;
      if (c.source === 'client') o.source = 'client';
      { const imp = cmStr(c.imp, 80); if (imp) o.imp = imp; }   // de dónde se importó (id del archivo + id del comentario): importar dos veces no duplica
      if (was) o.was = was;
      const replies = (Array.isArray(c.replies) ? c.replies : []).filter(r => r && typeof r === 'object' && cmStr(r.text, CM_TEXT)).slice(0, CM_REPLIES).map(r => {
        const x = {}, a = cmWho(r.author);
        if (a) x.author = a;
        if (isDay(r.date)) x.date = r.date;
        x.text = cmStr(r.text, CM_TEXT);
        { const imp = cmStr(r.imp, 80); if (imp) x.imp = imp; }
        return x;
      });
      if (replies.length) o.replies = replies;
      out.push(o);
    });
    let n = Math.max(0, ...out.map(c => +c.id.slice(3) || 0));
    out.forEach(c => { if (!c.id) c.id = `CM-${String(++n).padStart(3, '0')}`; });
    return out;
  }
  // Archivo de comentarios del revisor (ya descifrado): contenido no confiable, se valida y se limpia; null si no es de este formato
  function cleanFeedback(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.format !== 'diagramon-feedback' || raw.v !== 1) return null;
    const out = { shareId: cmStr(raw.shareId, 40).replace(/[^0-9a-zA-Z-]/g, ''), title: cmStr(raw.title, 200), author: cmWho(raw.author), created: typeof raw.created === 'string' ? raw.created.slice(0, 30) : '', comments: [] }, seen = new Set();
    (Array.isArray(raw.comments) ? raw.comments : []).slice(0, CM_MAX).forEach(c => {
      if (!c || typeof c !== 'object') return;
      const id = cmStr(c.id, 40), text = cmStr(c.text, CM_TEXT);
      if (!id || !text || seen.has(id)) return;
      seen.add(id);
      const o = { id, author: cmWho(c.author) || out.author, date: isDay(c.date) ? c.date : '', text };
      if (typeof c.replyTo === 'string' && c.replyTo.trim()) o.replyTo = cmStr(c.replyTo, 40);
      else { const k = c.on && c.on.kind, oid = cmStr(c.on && c.on.id, 120); o.on = CM_KINDS.includes(k) && oid ? { kind: k, id: oid } : { kind: 'general' }; }
      out.comments.push(o);
    });
    return out;
  }
  // Mezcla el archivo con los comentarios del documento sin tocarlos (devuelve la lista nueva y el recuento). Cada comentario se reconoce por «id del archivo:id», así importar dos veces no duplica.
  // Una respuesta va al hilo con ese id; si ese hilo no está, entra como hilo nuevo. Los comentarios sobre elementos que ya no existen pasan a «general».
  function mergeFeedback(m, fb, day) {
    const list = (m.comments || []).map(c => ({ ...c, ...(c.replies ? { replies: c.replies.map(r => ({ ...r })) } : {}) }));
    const known = new Set(list.flatMap(c => [c.imp, ...(c.replies || []).map(r => r.imp)]).filter(Boolean)), res = { threads: 0, replies: 0, dup: 0, orphan: 0, stray: 0, capped: 0 };
    fb.comments.forEach(c => {
      const imp = `${fb.shareId}:${c.id}`;
      if (known.has(imp)) { res.dup++; return; }
      known.add(imp);
      const date = c.date || day;
      if (c.replyTo) {
        const t = list.find(x => x.id === c.replyTo);
        if (t) { t.replies = [...(t.replies || []), { author: c.author, date, text: c.text, imp }]; res.replies++; return; }
        res.stray++;
        list.push({ id: '', on: { kind: 'general' }, author: c.author, date, text: c.text, source: 'client', imp });
        res.threads++;
        return;
      }
      if (c.on.kind !== 'general' && !cmHas(m, c.on)) res.orphan++;
      list.push({ id: '', on: c.on, author: c.author, date, text: c.text, source: 'client', imp });
      res.threads++;
    });
    res.comments = cleanComments(list, m);
    res.capped = Math.max(0, list.length - res.comments.length);
    return res;
  }
  const cmOpen = (m, kind, id) => (m.comments || []).filter(c => c.status !== 'resolved' && (kind == null || (c.on.kind === kind && c.on.id === id)));
  // Hallazgos (fuente «comments»): hilos sin resolver sobre un componente, una conexión o un grupo (config.js › comments.rules)
  addFindingSource('comments', m => {
    const r = CMR['cmt.open'];
    if (!r || r.enabled === false || !m.comments?.length) return [];
    const per = new Map(), sev = SEVERITY.includes(r.severity) ? r.severity : 'low';
    cmOpen(m).filter(c => ['node', 'edge', 'group'].includes(c.on.kind)).forEach(c => { const k = `${c.on.kind}:${c.on.id}`; per.set(k, { on: c.on, n: (per.get(k)?.n || 0) + 1 }); });
    return [...per.values()].map(({ on, n }) => ({ id: `comments:open:${on.kind}:${on.id}`, source: 'comments', rule: 'cmt.open', severity: sev, target: { kind: on.kind, id: on.id }, title: T('cmt.f.t', n), fix: T('cmt.f.fix') }));
  });
  return { CMC, CM_MAX, CM_REPLIES, CM_TEXT, CMR, CM_KINDS, cmHas, cmStr, cmWho, cleanComments, cleanFeedback, mergeFeedback, cmOpen };
};
