/* ==========================================================================
   Diagramon · interfaz: exportar/importar, leyenda y cajetín, varias vistas y compartir cifrado
   --------------------------------------------------------------------------
   Movido desde src/app.js (v2), sin cambios de comportamiento.
   API: window.DiagramonUI.exportshare
   ========================================================================== */
window.DiagramonUI = window.DiagramonUI || {};
// ctx: lo que esta pieza necesita de la app. Valores ya definidos al crearla pasan directos; el resto, como envolturas que se llaman al usarse.
window.DiagramonUI.exportshare = { create(ctx) {
  'use strict';
  const C = window.DIAGRAMON_CONFIG;
  const I = window.DiagramonI18n, T = I.T, loc = I.loc;
  const { $, esc, fold, store } = window.DiagramonCore.util;
  const { R, S, VIEWS, VIEW_KEYS, VR, VW, viewLabel } = window.DiagramonCore.state;
  const { toast } = window.DiagramonUI.dialogs;
  const { DATA, EDGE_W, FONT, H, NS, RES_TIERS, SEVERITY, activeVersion, arrowK, clearPath, cmTargetText, colorVar, contentBox, costBreakdown, crossBorder, dataTag, dataTags, decLabel, decided, edgeCls, edgeKey, edgeStyles, el, fitText, fmtDay, fontCss, fontFaces, govKey, govTeams, hasCost, hasRes, iconInfo, layerInfo, layerUsage, lockIcon, money, monthlyTotal, nodeColor, perMonth, resTier, reviewTag, round2, scopeNode, secClass, select, setView, sevLabel, spofList, stopPlay, svg, textW, today, typeLabel, vc, verLabel } = ctx;

  const fileName = (ext, suffix) => (fold(S.model.title).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'diagram') + (suffix ? '-' + suffix : '') + '.' + ext;
  function download(data, name, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }
  /* ---------- leyenda y cajetín de las exportaciones ---------- */
  // Ficha del documento (la usan el cajetín exportado y la franja del lienzo): { title, info: [[clave, valor]] }
  function docInfo() {
    const m = S.model, av = activeVersion(), v = vc(), cost = v.cost && m.nodes.some(hasCost) ? `≈ ${money(round2(monthlyTotal(m.nodes)))}${T('cost.mo')}` : '';
    const info = [[T('leg.author'), m.meta?.author || av?.author || '—'], [T('leg.version'), m.meta?.version || (av ? av.name || verLabel(av) : '—')],
      ...(S.viewKey !== 'full' ? [[T('leg.view'), viewLabel(S.viewKey)]] : []),
      ...(av ? [[T('leg.status'), T(`ver.st.${av.status}`)], ...(decided(av) ? [[decLabel(av), [av.decidedBy, fmtDay(av.decidedOn)].filter(Boolean).join(' · ')]] : []), [T('ver.created'), fmtDay(av.created)], [T('ver.updatedOn'), fmtDay(av.updated)]] : [[T('leg.date'), new Intl.DateTimeFormat(I.lang, { dateStyle: 'long' }).format(new Date())]]),
      ...(cost ? [[T('leg.cost'), cost]] : [])];
    return { title: S.scope ? `${m.title} · ${scopeNode()?.label || ''}` : m.title, info, av };
  }
  // Tipos de componente que usa el diagrama, con el color con que se ven (el propio del nodo o el del tipo).
  // Una fila por tipo+color: un mismo tipo con colores distintos se distingue en el lienzo y en la leyenda.
  const visNodes = () => S.model.nodes.filter(n => !VW.hideNodes.has(n.id));
  // Conexiones que se ven: las reales no ocultas o, en Contexto, las que cruzan cajas (agregadas)
  const visEdges = () => (vc().groups === 'collapse-top' ? [...VW.flows.values()].flatMap(f => f.edges) : S.model.edges.filter(e => !VW.hideEdges.has(e.id)));
  // Filas de leyenda propias de la vista activa, según sus reglas en config.js (emphasis, groups, legendGroups)
  function viewLegend() {
    const v = vc(), m = S.model, byId = new Map(m.nodes.map(n => [n.id, n])), es = visEdges(), r = { conn: [], groups: '', heat: null, owners: null };
    if (v.emphasis === 'security') {
      const cls = new Set(es.map(e => secClass(e, byId)));
      r.conn.push({ color: 'var(--sev-critical)', label: T('leg.sec.crit') });
      if ([...cls].some(c => c.includes('v-high'))) r.conn.push({ color: 'var(--sev-high)', label: T('leg.sec.high') });
      if ([...cls].some(c => c.includes('v-xb'))) r.conn.push({ color: 'var(--sev-critical)', label: T('leg.sec.xb') });
      if (es.some(e => crossBorder(e, byId)?.approved)) r.conn.push({ color: 'var(--muted)', label: T('leg.sec.xbok') });
      r.conn.push({ color: 'var(--sev-medium)', label: T('leg.sec.warn') }, { lock: true, label: T('leg.sec.enc') });
    } else if (v.emphasis === 'data') {
      const used = new Set([...visNodes(), ...es].flatMap(x => x.data || []));
      const colors = Object.keys(DATA).filter(k => used.has(k)).slice(-3).map(k => colorVar(DATA[k].color));
      r.conn.push({ color: colors.length ? colors : ['var(--accent)'], label: T('leg.dataflow') });
    } else if (v.emphasis === 'cost') {
      const vals = m.nodes.filter(hasCost).map(perMonth);
      if (vals.length) r.heat = { min: `${money(round2(Math.min(...vals)))}${T('cost.mo')}`, max: `${money(round2(Math.max(...vals)))}${T('cost.mo')}`, total: `≈ ${money(round2(monthlyTotal(m.nodes)))}${T('cost.mo')}`, stops: VR.costHeat };
      const teams = costBreakdown(m, 'team').filter(t => !t.unassigned).slice(0, 5);
      if (teams.length) r.costBy = teams.map(t => ({ label: t.label, value: `${money(round2(t.monthly))}${T('cost.mo')}` }));
    }
    else if (v.emphasis === 'resilience') {
      const vn = visNodes(), sp = new Set(spofList(m).map(x => x.id)), cnt = k => vn.filter(n => resTier(n)?.k === k).length;
      RES_TIERS.forEach(t => { if (cnt(t.k)) r.owners = [...(r.owners || []), { color: t.color, label: T(`res.leg.${t.k}`), n: cnt(t.k) }]; });
      r.ownersHead = T('res.leg.head');
      const unk = vn.filter(n => !resTier(n)).length, nsp = vn.filter(n => sp.has(n.id)).length;
      if (unk) r.owners = [...(r.owners || []), { color: 'var(--muted)', label: T('res.leg.none'), n: unk }];
      if (nsp) r.owners = [...(r.owners || []), { color: 'var(--sev-critical)', label: T('res.leg.spof'), n: nsp }];
    }
    else if (v.emphasis === 'owner') {
      const vis = new Set(visNodes().map(n => n.id));
      r.owners = [...govTeams(m, vis).values()].map(t => ({ color: t.color, label: [t.key, t.owners.join(', ')].filter(Boolean).join(' · '), n: t.ids.length }));
    }
    if (m.groups.length && (v.groups !== 'all' || v.legendGroups)) r.groups = T(v.groups === 'collapse-top' ? 'leg.g.collapse' : v.groups === 'logical' ? 'leg.g.logical' : 'leg.g.all');
    return r;
  }
  function legendTypes() {
    const seen = new Map();
    visNodes().forEach(n => {
      const type = C.types[n.type] ? n.type : 'generic', color = nodeColor({ ...n, type }), k = `${type}|${color}`;
      if (!seen.has(k)) seen.set(k, { type, color, label: typeLabel(type) });
    });
    const order = [...new Set([...seen.values()].map(r => r.type))];
    return [...seen.values()].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
  }
  // Solo lo que el diagrama usa: estilos de conexión, candados, tipos de componente y clasificaciones
  function buildLegend() {
    const m = S.model, g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'legend');
    const cols = [], RH = 22;
    const col = (head, rows, rh = RH) => rows.length && cols.push({ head, rows, rh });
    const textRow = (x, y, txt, cls = 'legend-text') => { const t = el('text', { class: cls, x, y: y + 4 }, g); t.textContent = txt; return textW(txt, '400 12px'); };
    // Solo lo que la vista activa muestra (reglas en config.js › views)
    const v = vc(), ex = viewLegend(), es = visEdges(), vn = visNodes();
    // Conexiones
    const styles = [...new Set(es.map(e => edgeKey(e.style)))], ES = edgeStyles();
    const lockRow = (on, label) => ({ w: 46 + textW(label, '400 12px'), draw: (x, y) => {
      const lg = el('g', { transform: `translate(${x + 10} ${y})` }, g);
      lockIcon(lg, 0, on);
      textRow(x + 46, y, label);
    } });
    const conn = styles.map(st => ({ w: 46 + textW(loc(ES[st].label), '400 12px'), draw: (x, y) => {
      const cfg = ES[st], eg = el('g', { class: `edge ${edgeCls(st)}${cfg.dash ? ' edge-dashed' : ''}`, style: `--c:var(--muted);--w:${cfg.width}px` }, g);
      el('path', { class: 'edge-line', d: `M${x},${y} L${x + 30},${y}`, ...(cfg.dash ? { 'stroke-dasharray': cfg.dash } : {}) }, eg);
      el('path', { class: 'edge-arrow', d: `M${x + 34},${y} L${x + 26},${y - 4} L${x + 26},${y + 4} Z` }, eg);
      textRow(x + 46, y, loc(cfg.label));
    } }));
    // Peso: una fila por cada nivel en uso (línea más gruesa, como se dibuja)
    ['high', 'critical'].filter(w => es.some(e => e.weight === w)).forEach(w => conn.push({ w: 46 + textW(T(`leg.w.${w}`), '400 12px'), draw: (x, y) => {
      const k = arrowK(EDGE_W[w]), eg = el('g', { class: `edge w-${w}`, style: `--c:var(--muted);--w:${+(1.8 * EDGE_W[w]).toFixed(2)}px` }, g);
      el('path', { class: 'edge-line', d: `M${x},${y} L${x + 28},${y}` }, eg);
      el('path', { class: 'edge-arrow', d: `M${x + 34},${y} L${x + 34 - 8 * k},${y - 4 * k} L${x + 34 - 8 * k},${y + 4 * k} Z` }, eg);
      textRow(x + 46, y, T(`leg.w.${w}`));
    } }));
    if (es.some(e => e.both)) conn.push({ w: 46 + textW(T('leg.both'), '400 12px'), draw: (x, y) => {
      const eg = el('g', { class: 'edge', style: '--c:var(--muted);--w:1.8px' }, g);
      el('path', { class: 'edge-line', d: `M${x + 4},${y} L${x + 30},${y}` }, eg);
      el('path', { class: 'edge-arrow', d: `M${x + 34},${y} L${x + 26},${y - 4} L${x + 26},${y + 4} Z M${x},${y} L${x + 8},${y - 4} L${x + 8},${y + 4} Z` }, eg);
      textRow(x + 46, y, T('leg.both'));
    } });
    // Filas propias de la vista (Seguridad: niveles de riesgo; Datos: color por clasificación); si no, candados genéricos
    ex.conn.forEach(r => conn.push(r.lock ? lockRow(true, r.label) : { w: 46 + textW(r.label, '400 12px'), draw: (x, y) => {
      const cs = [].concat(r.color), n = cs.length;
      cs.forEach((c, i) => {
        const eg = el('g', { class: 'edge', style: `--c:${c};--w:2.6px` }, g);
        el('path', { class: 'edge-line', d: `M${x + 30 * i / n},${y} L${x + 30 * (i + 1) / n},${y}` }, eg);
        if (i === n - 1) el('path', { class: 'edge-arrow', d: `M${x + 34},${y} L${x + 26},${y - 4} L${x + 26},${y + 4} Z` }, eg);
      });
      textRow(x + 46, y, r.label);
    } }));
    if (v.locks && v.emphasis !== 'security') [[true, 'leg.encrypted'], [false, 'leg.unencrypted']].forEach(([on, key]) => { if (es.some(e => e.encrypted === on)) conn.push(lockRow(on, T(key))); });
    col(T('leg.connections'), conn);
    // Componentes: una fila por tipo y color tal como se ven; en columnas de hasta 8 (más si son muchos)
    const MAXT = 40, all = legendTypes(), shown = all.length > MAXT ? all.slice(0, MAXT - 1) : all;
    const comp = shown.map(r => ({ w: 22 + textW(r.label, '400 12px'), draw: (x, y) => {
      el('circle', { cx: x + 6, cy: y, r: 6, style: `fill:${r.color}` }, g);
      textRow(x + 22, y, r.label);
    } }));
    if (all.length > shown.length) { const more = T('leg.more', all.length - shown.length); comp.push({ w: 22 + textW(more, '400 12px'), draw: (x, y) => textRow(x + 22, y, more, 'legend-muted') }); }
    const per = Math.max(8, Math.ceil(comp.length / 4));
    for (let i = 0; i < comp.length; i += per) col(i ? '' : T('leg.components'), comp.slice(i, i + per));
    // Grupos que se ven (Contexto, Lógica, Física)
    if (ex.groups) col(T('leg.groups'), [{ w: 30 + textW(ex.groups, '400 12px'), draw: (x, y) => {
      el('rect', { x, y: y - 6, width: 20, height: 14, rx: 3, style: 'fill:none;stroke:var(--muted);stroke-width:1.3', 'stroke-dasharray': '4 3' }, g);
      textRow(x + 30, y, ex.groups);
    } }]);
    // Equipos de la vista Gobierno: un punto de color por equipo, con sus dueños y cuántos componentes
    if (ex.owners?.length) {
      const own = ex.owners.map(r => { const txt = fitText(`${r.label} (${r.n})`, '400 12px', 300); return { w: 22 + textW(txt, '400 12px'), draw: (x, y) => {
        el('circle', { cx: x + 6, cy: y, r: 6, style: `fill:${r.color}` }, g);
        textRow(x + 22, y, txt);
      } }; });
      for (let i = 0; i < own.length; i += 8) col(i ? '' : ex.ownersHead || T('leg.teams'), own.slice(i, i + 8));
    }
    // Escala de calor de la vista Costo
    if (ex.heat) {
      const hc = ex.heat, n = hc.stops.length, tot = `${T('leg.total')}: ${hc.total}`, BW = 104;
      const gr = el('linearGradient', { id: 'leg-heat', x1: 0, y1: 0, x2: 1, y2: 0 }, el('defs', null, g));
      hc.stops.forEach((c, i) => el('stop', { offset: `${n > 1 ? i / (n - 1) * 100 : 0}%`, style: `stop-color:${c}` }, gr));
      col(T('leg.heat'), [{ w: textW(hc.min, '400 12px') + textW(hc.max, '400 12px') + BW + 16, draw: (x, y) => {
        const lw = textW(hc.min, '400 12px');
        textRow(x, y, hc.min);
        el('rect', { x: x + lw + 8, y: y - 5, width: BW, height: 10, rx: 5, fill: 'url(#leg-heat)' }, g);
        textRow(x + lw + BW + 16, y, hc.max);
      } }, { w: textW(tot, '400 12px'), draw: (x, y) => textRow(x, y, tot) }]);
    }
    // Costo por equipo (vista Costo): los 5 equipos que más cuestan
    if (ex.costBy?.length) col(T('cst.leg.byTeam'), ex.costBy.map(r => { const txt = fitText(`${r.label} · ${r.value}`, '400 12px', 300); return { w: textW(txt, '400 12px'), draw: (x, y) => textRow(x, y, txt) }; }));
    // Datos
    const used = new Set([...vn, ...es].flatMap(x => x.data || []));
    if (v.dataTags) col(T('leg.data'), dataTags({ data: [...used] }).map(t => ({ w: Math.ceil(textW(t.short, FONT.dtag)) + 20 + textW(t.label, '400 12px'), draw: (x, y) => {
      const tw = dataTag(g, x, y - 8, t, 16);
      textRow(x + tw + 8, y, t.label);
    } })));
    // Capas del data lake en uso, en el orden de config.js
    if (v.layers) col(T('leg.layers'), layerUsage(vn).map(([k]) => {
      const li = layerInfo(k);
      return { w: 22 + textW(li.label, '400 12px'), draw: (x, y) => {
        el('rect', { x, y: y - 7, width: 6, height: 14, rx: 2, style: `fill:${li.color}` }, g);
        textRow(x + 16, y, li.label);
      } };
    }));
    // Zonas de riesgo, de la más grave a la más leve
    const zs = m.zones.filter(z => z.kind !== 'trust').sort((a, b) => SEVERITY.indexOf(b.severity) - SEVERITY.indexOf(a.severity)).slice(0, 8);
    if (v.zones) col(T('leg.zones'), zs.map(z => {
      const txt = fitText(`${sevLabel(z.severity)}${z.label ? ` · ${z.label}` : ''}`, '400 12px', 260);
      return { w: 30 + textW(txt, '400 12px'), draw: (x, y) => {
        const zg = el('g', { class: `zone zone-${z.severity}` }, g);
        el('rect', { class: 'zone-tint', x, y: y - 6, width: 20, height: 14, rx: 3 }, zg);
        el('rect', { class: 'zone-hatch', x, y: y - 6, width: 20, height: 14, rx: 3, fill: `url(#hatch-${z.severity})` }, zg);
        el('rect', { class: 'zone-line', x, y: y - 6, width: 20, height: 14, rx: 3, 'stroke-dasharray': '4 3' }, zg);
        textRow(x + 30, y, txt);
      } };
    }));
    // Fronteras de confianza (STRIDE), aparte de las zonas de riesgo
    if (v.zones) col(T('leg.trust'), m.zones.filter(z => z.kind === 'trust').slice(0, 8).map(z => {
      const txt = fitText([z.label, z.trust].filter(Boolean).join(' · ') || T('trust.unnamed'), '400 12px', 260);
      return { w: 30 + textW(txt, '400 12px'), draw: (x, y) => {
        const zg = el('g', { class: 'zone zone-trust' }, g);
        el('rect', { class: 'zone-tint', x, y: y - 6, width: 20, height: 14, rx: 3 }, zg);
        el('rect', { class: 'zone-line', x, y: y - 6, width: 20, height: 14, rx: 3, 'stroke-dasharray': '6 3' }, zg);
        textRow(x + 30, y, txt);
      } };
    }));
    // Observaciones de revisión abiertas, con su fecha compromiso
    const findings = (v.review ? vn : []).filter(n => n.review && n.review.status !== 'resolved')
      .sort((a, b) => (a.review.due || '9999').localeCompare(b.review.due || '9999')).slice(0, 8);
    col(T('leg.review'), findings.map(n => {
      const tg = reviewTag(n.review), txt = fitText([n.label, n.review.note].filter(Boolean).join(' — '), '400 12px', 260);
      const meta = [n.review.due ? `${T('rev.due')}: ${fmtDay(n.review.due)}` : '', n.review.by || ''].filter(Boolean).join(' · ');
      return { w: Math.ceil(textW(tg.short, FONT.dtag)) + 20 + Math.max(textW(txt, '400 12px'), textW(meta, '400 11.5px')), draw: (x, y) => {
        const tw = dataTag(g, x, y - 8, tg, 16);
        textRow(x + tw + 8, y - 5, txt);
        if (meta) textRow(x + tw + 8, y + 9, meta, 'legend-muted');
      } };
    }), 38);
    // Cajetín
    const doc = docInfo(), info = doc.info.map(([k, v]) => [k, fitText(v, '400 12px', 380)]), title = fitText(doc.title, '700 14px', 420);
    const keyW = Math.max(...info.map(([k]) => textW(k, '400 11.5px'))) + 14;
    const infoW = Math.max(220, textW(title, '700 14px'), keyW + Math.max(...info.map(([, v]) => textW(v, '400 12px')))) + 4;
    const colW = c => Math.max(textW(c.head, '750 10.5px') + 10, ...c.rows.map(rw => rw.w));
    const P = 20, GAP = 34, HEAD = 26;
    const rowsH = Math.max(0, ...cols.map(c => c.rows.length * c.rh));
    const h = P * 2 + Math.max(HEAD + rowsH, 28 + info.length * 20 + 18);
    let x = P;
    cols.forEach(c => {
      if (c.head) { const t = el('text', { class: 'legend-head', x, y: P + 9 }, g); t.textContent = c.head; }
      c.rows.forEach((rw, i) => rw.draw(x, P + HEAD + i * c.rh + c.rh / 2 - 4));
      x += colW(c) + GAP;
    });
    return { g, h, colsW: x - GAP + P, infoW, info, keyW, P, title };
  }
  function placeLegend(lg, W) {
    const { g, h, infoW, info, keyW, P, title } = lg, ix = W - P - infoW;
    const panel = el('rect', { class: 'legend-panel', x: 0, y: 0, width: W, height: h, rx: 14 });
    g.insertBefore(panel, g.firstChild);
    el('line', { x1: ix - 18, y1: P - 4, x2: ix - 18, y2: h - P + 4, style: 'stroke:var(--border)' }, g);
    el('text', { class: 'legend-head', x: ix, y: P + 9 }, g).textContent = T('leg.document');
    el('text', { class: 'legend-title', x: ix, y: P + 32 }, g).textContent = title;
    info.forEach(([k, v], i) => {
      el('text', { class: 'legend-muted', x: ix, y: P + 54 + i * 20 }, g).textContent = k;
      el('text', { class: 'legend-text', x: ix + keyW, y: P + 54 + i * 20 }, g).textContent = v;
    });
    el('text', { class: 'legend-muted', x: W - P, y: h - P + 6, 'text-anchor': 'end', style: 'font-size:10.5px' }, g).textContent = T('leg.made');
  }

  function buildSVG() {
    const b = contentBox() || { x: 0, y: 0, w: 400, h: 200 };
    const pad = 40, top = 56;
    const lg = $('#exp-legend').checked ? buildLegend() : null;
    const W = Math.ceil(Math.max(b.w + pad * 2, lg ? lg.colsW + lg.infoW + 40 + pad * 2 : 0));
    const Ht = Math.ceil(b.h + pad * 2 + top + (lg ? lg.h + 28 : 0));
    const out = svg.cloneNode(true);
    out.setAttribute('data-theme', S.theme);
    out.removeAttribute('id');
    out.removeAttribute('style');
    out.setAttribute('xmlns', NS);
    out.setAttribute('width', W);
    out.setAttribute('height', Ht);
    out.setAttribute('viewBox', `0 0 ${W} ${Ht}`);
    out.classList.remove('focusing', 'hovering', 'playing', 'dragging', 'panning', 'connecting', 'filtering');
    out.querySelectorAll('.particle, .edge-hit, .edge-handle, .node-halo, .guide, .marquee, .path-badge, .resize-handle, .zone-top-line, .node-cmt').forEach(n => n.remove());
    out.querySelectorAll('.lit, .sel, .pulse, .pulse-node, .enter, .connect-src, .fdim').forEach(n => n.classList.remove('lit', 'sel', 'pulse', 'pulse-node', 'enter', 'connect-src', 'fdim'));
    const vp = out.querySelector('#viewport');
    vp.removeAttribute('id');
    vp.classList.remove('xs-enter');
    vp.setAttribute('transform', `translate(${pad - b.x} ${pad + top - b.y})`);
    const t = C.themes[S.theme], p = C.palettes[S.palette];
    const vars = [...Object.entries(t).map(([k, v]) => `--${k}:${v}`), ...Object.entries(p[S.theme] || p.dark).map(([k, v]) => `--p-${k}:${v}`), `--font:${fontCss()}`].join(';');
    const style = document.createElementNS(NS, 'style');
    style.textContent = `svg{${vars}}\n${$('#diagram-css').textContent}`;
    out.insertBefore(style, out.firstChild);
    out.insertBefore(el('rect', { width: W, height: Ht, fill: t.bg }), style.nextSibling);
    const title = el('text', { x: pad, y: pad + 10, fill: t.text, 'font-size': 20, 'font-weight': 700, 'font-family': fontCss() });
    const av = activeVersion();
    title.textContent = (av ? `${S.model.title}  ·  ${verLabel(av)}` : S.model.title) + (S.scope ? `  ·  ${scopeNode()?.label || ''}` : '') + (S.viewKey !== 'full' ? `  ·  ${T('view.export', { name: viewLabel(S.viewKey) })}` : '');
    out.insertBefore(title, vp);
    if (lg) {
      placeLegend(lg, W - pad * 2);
      lg.g.setAttribute('transform', `translate(${pad} ${Ht - pad - lg.h})`);
      out.appendChild(lg.g);
    }
    // Incrusta solo las caras de la tipografía elegida que cubren el texto usado: el archivo se ve igual en cualquier lado
    style.textContent += '\n' + fontFaces(S.font, out.textContent);
    return { str: '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(out), W, H: Ht, ox: pad - b.x, oy: pad + top - b.y };   // ox, oy: desplazamiento del lienzo al SVG (las zonas pulsables del visor compartido)
  }
  function exportSVG() { download(buildSVG().str, fileName('svg'), 'image/svg+xml'); toast(T('toast.svg')); }
  // PNG a 2x desde el SVG: promesa con el Blob (null si el navegador no pudo rasterizarlo)
  const pngBlob = ({ str, W, H: h }) => new Promise(res => {
    const img = new Image(), scale = 2;
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = W * scale; c.height = h * scale;
      const ctx = c.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, W, h);
      try { c.toBlob(b => res(b), 'image/png'); } catch { res(null); }
    };
    img.onerror = () => res(null);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str);
  });
  function exportPNG() {
    pngBlob(buildSVG()).then(blob => { if (blob) { download(blob, fileName('png')); toast(T('toast.png')); } else toast(T('toast.pngFail')); });
  }

  /* ---------- varias vistas a la vez (exportar, presentar, compartir) ---------- */
  // ¿Aporta algo esta vista con este diagrama? Una vista de énfasis sin nada que resaltar sale igual que la Completa.
  const viewWorth = key => {
    const m = S.model, em = VIEWS[key]?.emphasis;
    if (key === 'context') return m.groups.length > 0;
    if (em === 'cost') return m.nodes.some(hasCost);
    if (em === 'owner') return m.nodes.some(n => govKey(n));
    if (em === 'resilience') return m.nodes.some(hasRes) || spofList(m).length > 0;
    if (em === 'security') return m.nodes.some(n => n.data?.length) || m.edges.some(e => e.data?.length || e.encrypted != null);
    if (em === 'data') return m.nodes.some(n => n.data?.length || VR.dataTypes.includes(n.type) || VR.dataIconCategories.includes(iconInfo(n.icon)?.category)) || m.edges.some(e => e.style === 'data' || e.data?.length);
    return true;
  };
  const worthViews = () => VIEW_KEYS.filter(viewWorth);
  const skippedLabel = keys => VIEW_KEYS.filter(k => !keys.includes(k)).map(viewLabel).join(', ');
  // Ejecuta fn(clave, i) con cada vista activa SIN guardar la elección ni tocar el modelo; al final restaura vista, selección y conexión elegida
  async function eachView(keys, fn) {
    // Siempre con setView (recalcula VW.* y la leyenda); luego se deshace lo que setView recuerda (elección guardada y "elegida")
    const saved = { key: S.viewKey, sel: S.sel, flow: S.flow, chosen: S.viewChosen, stored: store.get('view') };
    ctx.viewBusy = true;
    stopPlay(); clearPath();
    try {
      for (let i = 0; i < keys.length; i++) {
        setView(keys[i], { toast: false });
        await fn(keys[i], i);
      }
    } finally {
      ctx.viewBusy = false;
      setView(saved.key, { toast: false });
      S.flow = saved.flow; S.viewChosen = saved.chosen;
      if (saved.stored == null) { try { localStorage.removeItem(`${C.app.storageKey}.view`); } catch { /* sin almacenamiento */ } } else store.set('view', saved.stored);
      select(saved.sel);
    }
  }
  // Un archivo por vista (<título>-<clave>.png|svg), uno tras otro: cada PNG termina antes de empezar el siguiente.
  // La clave (full, context…) va en el nombre y no el rótulo traducido: es estable en cualquier idioma y no lleva tildes.
  async function exportViews(format = 'png') {
    format = format === 'svg' ? 'svg' : 'png';
    if (ctx.viewBusy || ctx.P || !S.model.nodes.length) return false;
    const keys = worthViews(), skipped = skippedLabel(keys);
    let done = 0;
    try {
      await eachView(keys, async (key, i) => {
        toast(T('views.progress', { i: i + 1, n: keys.length, name: viewLabel(key) }), 60000);
        const out = buildSVG();
        if (format === 'svg') download(out.str, fileName('svg', key), 'image/svg+xml');
        else {
          const blob = await pngBlob(out);
          if (!blob) throw new Error('png');
          download(blob, fileName('png', key));
        }
        done++;
        await new Promise(r => setTimeout(r, 350));  // respiro entre descargas (el navegador puede pedir permiso para varias)
      });
    } catch { toast(T('toast.pngFail'), 3200); return done; }
    toast(T('views.done', done) + (skipped ? ' · ' + T('views.skipped', { names: skipped }) : ''), 4800);
    return done;
  }
  /* ---------- compartir cifrado: un HTML que se abre solo, con contraseña ---------- */
  // El diagrama se guarda como imagen en los dos temas: el visor no necesita la app
  const svgBuild = theme => { const old = S.theme; S.theme = theme; try { return buildSVG(); } finally { S.theme = old; } };
  const svgFor = theme => svgBuild(theme).str;
  // Zonas pulsables del visor compartido (una conexión recta mide cero en un eje): la caja de cada grupo, conexión (cuadro en su punto medio) y componente visible en la vista, en las coordenadas del SVG; los componentes van los últimos, encima
  function shareTargets(ox, oy) {
    const vis = x => { const r = x?.getBoundingClientRect?.(); return !!r && (r.width > 0 || r.height > 0); }, rd = Math.round, out = [], m = S.model;
    m.groups.forEach(g => { const r = R.groups.get(g.id), b = R.gbox.get(g.id); if (b && vis(r?.box)) out.push({ k: 'group', id: g.id, label: g.label, box: [rd(b.x + ox), rd(b.y + oy), rd(b.w), rd(b.h)] }); });
    m.edges.forEach(e => {
      const line = R.edges.get(e.id)?.line;
      if (!vis(line)) return;
      let len = 0; try { len = line.getTotalLength(); } catch { len = 0; }
      if (!len) return;
      const p = line.getPointAtLength(len / 2);
      out.push({ k: 'edge', id: e.id, label: cmTargetText(m, { kind: 'edge', id: e.id }), box: [rd(p.x + ox - 14), rd(p.y + oy - 14), 28, 28] });
    });
    m.nodes.forEach(n => { if (vis(R.nodes.get(n.id))) out.push({ k: 'node', id: n.id, label: n.label, box: [rd(n.x + ox), rd(n.y + oy), rd(R.width.get(n.id) || 0), H] }); });
    return out;
  }
  // Lo que viaja en el archivo compartido: hilos sin resolver y no internos (lo interno nunca sale del documento) y los destinos sin forma (decisiones, requisitos y versiones)
  const shareThreads = () => (S.model.comments || []).filter(c => !c.internal && c.status !== 'resolved').map(c => ({ id: c.id, on: c.on, ...(c.author ? { author: c.author } : {}), ...(c.date ? { date: c.date } : {}), text: c.text, ...(c.source ? { source: c.source } : {}), ...(c.replies ? { replies: c.replies } : {}) }));
  const shareRefs = () => ['decision', 'requirement', 'version'].flatMap(k => ({ decision: S.model.decisions, requirement: S.model.requirements, version: S.model.versions }[k] || []).map(x => ({ k, id: x.id, label: cmTargetText(S.model, { kind: k, id: x.id }) })));
  function shareEncrypted() {
    const SH = window.DiagramonShare;
    if (!SH || !window.crypto?.subtle || typeof CompressionStream === 'undefined') return toast(T('share.unsupported'), 3200);
    if (ctx.viewBusy || ctx.P) return;
    const prev = document.activeElement, id = `sh${Date.now()}`;
    // Solo se ofrecen las vistas que aportan algo; por defecto Completa, Contexto y Seguridad
    const offered = worthViews(), preset = ['full', 'context', 'security'].filter(k => offered.includes(k));
    // Cada vista va en dos temas (el activo y su contrario claro/oscuro): el negro solo si es el activo
    const shTheme = () => [S.theme, S.theme === 'light' ? 'dark' : 'light'];
    const back = document.createElement('div');
    back.className = 'cf-back';
    back.innerHTML = `<form class="cf share" role="dialog" aria-modal="true" aria-labelledby="${id}t" aria-describedby="${id}d" autocomplete="off">
      <h3 id="${id}t">${esc(T('share.title'))}</h3>
      <p id="${id}d">${esc(T('share.lead'))}</p>
      <fieldset class="sh-views"><legend>${esc(T('share.views'))}</legend>${offered.map(k => `<label class="sh-chk"><input type="checkbox" name="views" value="${esc(k)}"${preset.includes(k) ? ' checked' : ''}>${esc(viewLabel(k))}</label>`).join('')}<small class="sh-size"></small></fieldset>
      <fieldset class="sh-cm"><label class="sh-chk"><input type="checkbox" name="cm" checked>${esc(T('share.cm'))}</label><small class="dbt-d">${esc(T('share.cm.hint'))}</small>
        <label class="sh-chk"><input type="checkbox" name="cmopen">${esc(T('share.cmopen'))}</label><small class="dbt-d">${esc(T('share.cmopen.hint'))}</small></fieldset>
      <label>${esc(T('share.pw'))}<span class="sh-row"><input type="password" name="pw" autocomplete="new-password" minlength="12" required><button type="button" class="btn small" data-sh="show">${esc(T('share.show'))}</button></span></label>
      <div class="sh-meter" data-level="-1"><i></i><i></i><i></i><i></i><span></span></div>
      <label>${esc(T('share.pw2'))}<input type="password" name="pw2" autocomplete="new-password" required></label>
      <ul class="sh-notes"><li>${esc(T('share.note1'))}</li><li>${esc(T('share.note2'))}</li></ul>
      <p class="sh-err" role="alert"></p>
      <div class="cf-actions"><button type="button" class="btn" data-sh="no">${esc(T('ver.cf.cancel'))}</button><button type="submit" class="btn primary">${esc(T('share.create'))}</button></div>
    </form>`;
    const form = back.querySelector('form'), pw = form.elements.pw, pw2 = form.elements.pw2, meter = form.querySelector('.sh-meter'), err = form.querySelector('.sh-err');
    const close = () => { document.removeEventListener('keydown', key, true); back.remove(); prev?.focus?.(); };
    const key = ev => { if (ev.key === 'Escape' && !form.classList.contains('busy')) { ev.preventDefault(); ev.stopPropagation(); close(); } };
    const rate = () => {
      const s = SH.strength(pw.value), lvl = pw.value ? s.level : -1;
      meter.dataset.level = lvl;
      meter.querySelector('span').textContent = pw.value ? T(`share.lvl${lvl}`) + (pw.value.length < 12 ? ` · ${T('share.min')}` : '') : '';
      err.textContent = '';
    };
    // Tamaño aproximado: el SVG de la vista actual comprimido, por vistas elegidas × 2 temas, +33 % de base64 (los temas no se deduplican: la ventana de gzip es de 32 KB)
    const sizeEl = form.querySelector('.sh-size');
    let unit = 0;
    const estimate = () => {
      const n = form.querySelectorAll('input[name="views"]:checked').length;
      sizeEl.textContent = unit && n ? T('share.size', { kb: Math.max(1, Math.round(unit * n * 2 * 1.34 / 1024)) }) : '';
    };
    form.addEventListener('change', ev => { if (ev.target.name === 'views') { err.textContent = ''; estimate(); } });
    new Response(new Blob([buildSVG().str]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer().then(b => { unit = b.byteLength; estimate(); }, () => {});
    pw.addEventListener('input', rate);
    pw2.addEventListener('input', () => { err.textContent = ''; });
    back.addEventListener('mousedown', ev => { if (ev.target === back && !form.classList.contains('busy')) close(); });
    form.addEventListener('click', ev => {
      const b = ev.target.closest('[data-sh]');
      if (!b) return;
      if (b.dataset.sh === 'no') close();
      else { const show = pw.type === 'password'; pw.type = pw2.type = show ? 'text' : 'password'; b.textContent = T(show ? 'share.hide' : 'share.show'); }
    });
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      if (form.classList.contains('busy')) return;
      const keys = [...form.querySelectorAll('input[name="views"]:checked')].map(i => i.value);
      if (!keys.length) { err.textContent = T('share.noViews'); return; }
      if (pw.value.length < 12) { err.textContent = T('share.min'); return pw.focus(); }
      if (SH.strength(pw.value).level < 1) { err.textContent = T('share.weak'); return pw.focus(); }
      if (pw.value !== pw2.value) { err.textContent = T('share.mismatch'); return pw2.focus(); }
      form.classList.add('busy');
      form.querySelector('[type="submit"]').textContent = T('share.busy');
      try {
        const av = activeVersion();
        const views = [];
        const cm = form.elements.cm.checked;
        await eachView(keys, key => {
          const built = shTheme().map(th => [th, svgBuild(th)]);
          views.push({ key, label: viewLabel(key), svg: Object.fromEntries(built.map(([th, b]) => [th, b.str])), ...(cm ? { targets: shareTargets(built[0][1].ox, built[0][1].oy) } : {}) });
        });
        const payload = { fmt: cm ? 3 : 2, title: S.model.title, version: av ? verLabel(av) : S.model.meta?.version || '', sharedAt: new Date().toISOString(), theme: S.theme, view: keys.includes(S.viewKey) ? S.viewKey : keys[0], views,
          ...(cm ? { cmt: true, shareId: Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join(''), refs: shareRefs(), comments: form.elements.cmopen.checked ? shareThreads() : [] } : {}) };
        const env = await SH.encrypt(payload, pw.value);
        download(SH.viewer(env, I.lang), `diagramon-${today()}.html`, 'text/html');
        close();
        toast(T('share.done'), 4200);
      } catch {
        form.classList.remove('busy');
        form.querySelector('[type="submit"]').textContent = T('share.create');
        err.textContent = T('share.fail');
      }
    });
    document.addEventListener('keydown', key, true);
    document.body.appendChild(back);
    pw.focus();
  }

  return { buildSVG, docInfo, download, eachView, exportPNG, exportSVG, exportViews, fileName, legendTypes, pngBlob, shareEncrypted, viewLegend, viewWorth, visNodes, worthViews };
} };
