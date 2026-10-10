/* ==========================================================================
   Diagramon · modelo: fiabilidad de rutas (disponibilidad) (puro, sin DOM)
   --------------------------------------------------------------------------
   Movido desde src/app.js (bloque «routeReliability») sin cambios de comportamiento.
   Se usa como fábrica: no necesita nada de la app y devuelve sus funciones.
   API: window.DiagramonModels.reliability
   ========================================================================== */
window.DiagramonModels = window.DiagramonModels || {};
window.DiagramonModels.reliability = function () {
  function routeReliability(n, succ, s, t, p, budget = 8000) {
    const out = succ.map((l, i) => (i === t ? [] : l.filter(j => j !== s && j !== i))), inn = out.map(() => []);
    out.forEach((l, i) => l.forEach(j => inn[j].push(i)));
    const reach = (from, adj) => { const seen = new Set([from]), q = [from]; for (let i = 0; i < q.length; i++) adj[q[i]].forEach(v => { if (!seen.has(v)) { seen.add(v); q.push(v); } }); return seen; };
    const F0 = reach(s, out), B0 = reach(t, inn);
    if (!F0.has(t)) return null;
    // Poda: solo los nodos que están en algún camino de s a t
    const rel = []; for (let i = 0; i < n; i++) if (F0.has(i) && B0.has(i)) rel.push(i);
    const isRel = new Set(rel), g = out.map((l, i) => (isRel.has(i) ? l.filter(j => isRel.has(j)) : [])), gi = g.map(() => []);
    g.forEach((l, i) => l.forEach(j => gi[j].push(i)));
    const w = i => (p[i] >= 1 ? 0 : -Math.log(Math.max(p[i], 1e-300))) + 1e-9;
    // Ruta más probable (Dijkstra con pesos −ln p) evitando los nodos bloqueados
    const best = blocked => {
      const d = new Map([[s, 0]]), prev = new Map(), done = new Set();
      for (;;) {
        let u = -1; d.forEach((v, k) => { if (!done.has(k) && (u < 0 || v < d.get(u))) u = k; });
        if (u < 0) return null;
        if (u === t) { const r = []; for (let x = t; x != null; x = prev.get(x)) r.unshift(x); return r; }
        done.add(u);
        g[u].forEach(v => { if (blocked && blocked.has(v)) return; const nd = d.get(u) + w(v); if (!d.has(v) || nd < d.get(v)) { d.set(v, nd); prev.set(v, u); } });
      }
    };
    const main = best(null), pos = new Map(main.map((x, i) => [x, i]));
    // ¿Una sola ruta? Solo el camino principal y ningún atajo hacia delante
    const single = rel.length === main.length && main.every((u, i) => g[u].every(v => pos.get(v) <= i + 1));
    // Nº de rutas simples (acotado)
    let steps = 0, routes = 0; const onp = new Set([s]);
    const cnt = u => { if (routes >= 100 || ++steps > 20000) return; if (u === t) { routes++; return; } g[u].forEach(v => { if (!onp.has(v)) { onp.add(v); cnt(v); onp.delete(v); } }); };
    cnt(s);
    const ends = p[s] * p[t], base = { routes: single ? 1 : Math.max(routes, 2), main, rel, single };
    if (single) { let v = 1; main.forEach(i => { v *= p[i]; }); return { ...base, value: v, exact: true }; }
    // Exacto por factorización
    const st = new Uint8Array(n), memo = new Map(); let calls = 0;
    rel.forEach(i => { if (i === s || i === t || p[i] >= 1) st[i] = 1; });
    const rec = () => {
      if (++calls > budget) throw new Error('budget');
      const F = reach2(s, g), B = reach2(t, gi);
      if (!F.has(t)) return 0;
      const key = rel.map(i => (F.has(i) && B.has(i) ? st[i] : 9)).join('');
      if (memo.has(key)) return memo.get(key);
      // Camino con menos nodos inciertos (0-1 BFS) y pivote = primer nodo incierto
      const dist = new Map([[s, 0]]), prev = new Map(), dq = [s];
      while (dq.length) {
        const u = dq.shift();
        g[u].forEach(v => { if (st[v] === 2 || !B.has(v)) return; const c = st[v] === 1 ? 0 : 1, nd = dist.get(u) + c; if (!dist.has(v) || nd < dist.get(v)) { dist.set(v, nd); prev.set(v, u); c ? dq.push(v) : dq.unshift(v); } });
      }
      let piv = -1; for (let x = t; x != null; x = prev.get(x)) if (st[x] === 0) piv = x;
      let val;
      if (piv < 0) val = 1;
      else { st[piv] = 1; const a1 = rec(); st[piv] = 2; const a0 = rec(); st[piv] = 0; val = p[piv] * a1 + (1 - p[piv]) * a0; }
      memo.set(key, val);
      return val;
    };
    const reach2 = (from, adj) => { const seen = new Set([from]), q = [from]; for (let i = 0; i < q.length; i++) adj[q[i]].forEach(v => { if (st[v] !== 2 && !seen.has(v)) { seen.add(v); q.push(v); } }); return seen; };
    try { return { ...base, value: ends * rec(), exact: true }; } catch (e) { if (e.message !== 'budget') throw e; }
    // Aproximación: rutas disjuntas en nodos inciertos → cota inferior de la fiabilidad real
    const blocked = new Set(); let fail = 1;
    for (let k = 0; k < 64; k++) {
      const r = best(blocked); if (!r) break;
      const inner = r.filter(i => i !== s && i !== t), pr = inner.reduce((a, i) => a * p[i], 1);
      fail *= 1 - pr;
      const unc = inner.filter(i => p[i] < 1); if (!unc.length) break;
      unc.forEach(i => blocked.add(i));
    }
    return { ...base, value: ends * (1 - fail), exact: false };
  }
  return { routeReliability };
};
