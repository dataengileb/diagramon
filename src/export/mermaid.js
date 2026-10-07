/* ==========================================================================
   Diagramon · exportar a Mermaid (.mmd)
   --------------------------------------------------------------------------
   Convierte el diagrama en un flowchart de Mermaid (>= 10) que se ve en
   GitHub, GitLab, Notion y mermaid.live, sin dependencias.
   - Los grupos son subgraph anidados (según `parent`) con borde discontinuo.
   - Formas por tipo: db/nosql/storage cilindro [( )], user estadio ([ ]),
     function subrutina [[ ]], queue paralelogramo [/ /], stream asimétrica
     > ], events hexágono {{ }}, generic/external rectángulo [ ], el resto
     redondeado ( ).
   - Flechas por estilo: sync -->, async -.->, data ==> (gruesa), optional
     -.-> más fina y punteada (linkStyle).
   - Los ids se transforman a [A-Za-z0-9_] con prefijo (n_ / g_) para no chocar
     con palabras reservadas; los textos van entre comillas con #quot; etc.
   - Niveles C4: un nodo con diagrama interno (`in`) pasa a ser un subgraph
     «Nombre [tipo C4]» con borde grueso continuo que contiene sus nodos, grupos
     y notas, anidado a cualquier profundidad. Las flechas siguen apuntando al id
     del nodo (= id del subgraph), así que las que cruzan niveles funcionan.
   - Notas: nodos sueltos con forma [\ \] y el color de la nota, dentro del
     subgraph de su nivel; el texto multilínea usa <br/>.
   - Zonas de riesgo y límites de confianza: Mermaid no permite subgraphs
     solapados, así que los nodos dentro de cada zona (geométrico, mismo nivel)
     reciben un classDef por severidad (borde de color y grueso; el límite de
     confianza va con borde discontinuo) y un bloque de comentarios %% las lista
     con sus miembros. Si un nodo cae en varias zonas manda la más grave.
   - Metadatos: líneas `%% meta <id>: etiqueta=valor; …` al final (solo comentarios;
     `click` exige securityLevel y falla en GitHub).
   - Decisiones (ADR) y hallazgos descartados: comentarios al final, solo si los hay:
     `%% adr ADR-001 [accepted] Título — links: n_web, g_x, e_e1, version:v1` (+ `%%   decision: …`) y
     `%% dismissed <id del hallazgo>: motivo (quién, fecha)`. Los componentes enlazados llevan además
     `adrs=ADR-001,…` en su línea `%% meta`.
   - El front matter (---) va primero: Mermaid lo exige al inicio del texto.
   API: window.DiagramonExport.mermaid(model, ctx) -> { text, ext, mime }.
   ========================================================================== */
(() => {
  'use strict';

  // Escapa un texto para ir entre comillas dobles en Mermaid
  const esc = s => String(s == null ? '' : s)
    .replace(/#/g, '#35;')
    .replace(/"/g, '#quot;')
    .replace(/</g, '#lt;')
    .replace(/>/g, '#gt;')
    .replace(/&/g, '#amp;')
    .replace(/`/g, "'")
    .replace(/[\r\n]+/g, ' ')
    .trim();

  // Id seguro y único: prefijo + caracteres válidos
  const makeIds = (items, prefix) => {
    const map = {}, used = new Set();
    items.forEach(it => {
      const base = prefix + String(it.id).replace(/[^A-Za-z0-9_]/g, '_');
      let id = base, n = 2;
      while (used.has(id)) id = base + '_' + n++;
      used.add(id);
      map[it.id] = id;
    });
    return map;
  };

  // Mezcla un color #RRGGBB con blanco (t = proporción de blanco, 0..1)
  const mix = (hex, t) => {
    const v = parseInt(hex.slice(1), 16);
    const c = [v >> 16, (v >> 8) & 255, v & 255].map(x => Math.round(x + (255 - x) * t));
    return '#' + c.map(x => x.toString(16).padStart(2, '0')).join('');
  };
  const norm = hex => (/^#?[0-9a-f]{6}$/i.test(hex || '') ? '#' + String(hex).replace('#', '').toLowerCase() : '#cbd5e1');

  // Forma de cada tipo: [abre, cierra]
  const SHAPES = {
    db: ['[(', ')]'], nosql: ['[(', ')]'], storage: ['[(', ')]'],
    user: ['([', '])'], function: ['[[', ']]'],
    queue: ['[/', '/]'], stream: ['>', ']'], events: ['{{', '}}'],
    generic: ['[', ']'], external: ['[', ']']
  };

  // Estilo de la conexión ya resuelto por la app (ctx.edgeStyleInfo); sin él, los cuatro de siempre
  const BASE = { sync: { dash: '', width: 1.8 }, async: { dash: '6 6', width: 1.8 }, data: { dash: '', width: 2.4 }, optional: { dash: '2 6', width: 1.5 } };
  const edgeInfo = (ctx, e) => (typeof ctx.edgeStyleInfo === 'function' ? ctx.edgeStyleInfo(e) : { id: BASE[e.style] ? e.style : 'sync', ...(BASE[e.style] || BASE.sync), mult: 1, weight: '', color: null });

  function mermaid(model, ctx) {
    const title = String(ctx.title || model.title || 'Diagram').replace(/[\r\n]+/g, ' ').trim();
    const groups = model.groups || [], nodes = model.nodes || [], edges = model.edges || [];
    const gid = makeIds(groups, 'g_'), nid = makeIds(nodes, 'n_');
    const notes = model.notes || [], zones = model.zones || [];
    const nodeById = {};
    nodes.forEach(n => { nodeById[n.id] = n; });
    const lv = it => (it.in && nodeById[it.in] && it.in !== it.id ? it.in : '');  // nivel C4 (id del nodo) o '' = raíz
    const groupById = {};
    groups.forEach(g => { groupById[g.id] = g; });
    const ntid = makeIds(notes, 'nt_');
    const byGroup = {}, byParent = {}, rootsOf = {}, rootNodesOf = {}, notesOf = {}, inLevel = {};
    const push = (o, k, v) => (o[k] = o[k] || []).push(v);
    groups.forEach(g => {
      const pg = g.parent && groupById[g.parent] && g.parent !== g.id && lv(groupById[g.parent]) === lv(g) ? g.parent : null;
      if (pg) push(byParent, pg, g); else push(rootsOf, lv(g), g);
      if (lv(g)) inLevel[lv(g)] = true;
    });
    nodes.forEach(n => {
      const g = n.group && groupById[n.group];
      if (g && lv(g) === lv(n)) push(byGroup, n.group, n); else push(rootNodesOf, lv(n), n);
      if (lv(n)) inLevel[lv(n)] = true;
    });
    notes.forEach(t => { push(notesOf, lv(t), t); if (lv(t)) inLevel[lv(t)] = true; });
    // Un nodo es un subgraph si tiene contenido y ctx.levels (cuando existe) lo reconoce como nivel
    const levelIds = new Set((ctx.levels || []).map(l => l.id));
    const isLevel = n => !!inLevel[n.id] && (!ctx.levels || levelIds.has(n.id));
    const shorts = keys => (keys || []).map(k => (ctx.dataLabel(k) || {}).short || k).filter(Boolean);

    const classes = {};  // clase -> { color, ids }
    const nodeLine = n => {
      const tags = shorts(n.data);
      if (n.badge) tags.push(n.badge);
      const open = n.review && n.review.status === 'open' ? ' ⚑' : '';
      const lines = [esc(n.label || n.id) + open];
      if (n.sub) lines.push('<small>' + esc(n.sub) + '</small>');
      if (tags.length) lines.push('<small>' + esc(tags.join(' · ')) + '</small>');
      const [a, b] = SHAPES[n.type] || ['(', ')'];
      const color = norm(ctx.color(n));
      const cls = 'c_' + color.slice(1);
      (classes[cls] = classes[cls] || { color, ids: [] }).ids.push(nid[n.id]);
      return `${nid[n.id]}${a}"${lines.join('<br/>')}"${b}`;
    };

    // Zonas de riesgo y límites de confianza: pertenencia geométrica (caja del nodo mayormente dentro, mismo nivel)
    const SEV = ['low', 'medium', 'high', 'critical'];
    const TRUST_HEX = '#5B7FA6';
    const inside = (n, z) => {
      if (![n.x, n.y, z.x, z.y, z.w, z.h].every(Number.isFinite) || lv(n) !== lv(z)) return false;
      const sz = ctx.size(n) || { w: 180, h: 56 };
      const ox = Math.min(n.x + sz.w, z.x + z.w) - Math.max(n.x, z.x), oy = Math.min(n.y + sz.h, z.y + z.h) - Math.max(n.y, z.y);
      return ox > 0 && oy > 0 && ox * oy >= 0.5 * sz.w * sz.h;
    };
    const zoneInfo = zones.map(z => {
      const trust = z.kind === 'trust', sev = SEV.includes(z.severity) ? z.severity : 'medium';
      return { z, trust, sev, cls: trust ? 'z_trust' : 'z_' + sev, hex: trust ? TRUST_HEX : ctx.sevHex(sev), members: nodes.filter(n => inside(n, z)) };
    });
    const rank = zi => (zi.trust ? 0 : 1 + SEV.indexOf(zi.sev));
    const zoneOf = {};  // id de nodo -> zona que manda
    zoneInfo.forEach(zi => zi.members.forEach(n => { if (!zoneOf[n.id] || rank(zi) > rank(zoneOf[n.id])) zoneOf[n.id] = zi; }));

    const out = [], groupStyles = [];
    const emitted = new Set();
    const emitGroup = (g, depth, seen) => {
      const pad = '    '.repeat(depth);
      emitted.add('g:' + g.id);
      out.push(`${pad}subgraph ${gid[g.id]}["${esc(g.label || g.id)}"]`);
      const color = norm(ctx.color(g));
      groupStyles.push(`    style ${gid[g.id]} fill:${mix(color, 0.8)},stroke:${color},stroke-dasharray: 5 5,color:#334155`);
      (byGroup[g.id] || []).forEach(n => emitNode(n, depth + 1));
      (byParent[g.id] || []).forEach(c => { if (!seen.has(c.id)) emitGroup(c, depth + 1, new Set([...seen, c.id])); });
      out.push(`${pad}end`);
    };
    const noteClasses = {};
    const emitNote = (t, depth) => {
      emitted.add('t:' + t.id);
      const hex = norm(ctx.noteHex ? ctx.noteHex(t.color) : '#C4A63A'), cls = 'note_' + hex.slice(1);
      (noteClasses[cls] = noteClasses[cls] || { hex, ids: [] }).ids.push(ntid[t.id]);
      const text = String(t.text == null ? '' : t.text).split(/\r?\n/).map(esc).join('<br/>') || esc(t.id);
      out.push(`${'    '.repeat(depth)}${ntid[t.id]}[\\"${text}"\\]`);
    };
    // Contenido de un nivel: grupos raíz, nodos sueltos y notas
    const emitLevelBody = (key, depth) => {
      (rootsOf[key] || []).forEach(g => emitGroup(g, depth, new Set([g.id])));
      (rootNodesOf[key] || []).forEach(n => emitNode(n, depth));
      (notesOf[key] || []).forEach(t => emitNote(t, depth));
    };
    const levelStyles = [];
    function emitNode(n, depth, plain) {
      emitted.add('n:' + n.id);
      const pad = '    '.repeat(depth);
      if (plain || !isLevel(n) || emitted.has('l:' + n.id)) { out.push(pad + nodeLine(n)); return; }
      emitted.add('l:' + n.id);
      const kind = ctx.c4Label && n.c4 ? ctx.c4Label(n.c4) : '';
      out.push(`${pad}subgraph ${nid[n.id]}["${esc(n.label || n.id)}${kind ? ' [' + esc(kind) + ']' : ''}"]`);
      const zi = zoneOf[n.id], color = norm(ctx.color(n)), stroke = zi ? norm(zi.hex) : color;
      levelStyles.push(`    style ${nid[n.id]} fill:${mix(color, 0.9)},stroke:${stroke},stroke-width:3px${zi && zi.trust ? ',stroke-dasharray: 6 3' : ''},color:#1f2937`);
      emitLevelBody(n.id, depth + 1);
      out.push(`${pad}end`);
    }

    out.push('---', `title: "${title.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`, '---');
    out.push(`%% Generated by Diagramon — ${title}`);
    out.push(`flowchart ${ctx.direction === 'TB' ? 'TB' : 'LR'}`);
    emitLevelBody('', 1);
    // Restos inalcanzables (niveles que se referencian en ciclo): nada se pierde
    groups.forEach(g => { if (!emitted.has('g:' + g.id)) emitGroup(g, 1, new Set([g.id])); });
    nodes.forEach(n => { if (!emitted.has('n:' + n.id)) emitNode(n, 1, true); });
    notes.forEach(t => { if (!emitted.has('t:' + t.id)) emitNote(t, 1); });

    // Aristas: el índice de linkStyle sigue el orden de emisión
    const links = [];
    let idx = 0;
    edges.forEach(e => {
      if (!nid[e.from] || !nid[e.to]) return;
      const si = edgeInfo(ctx, e), style = si.id;
      const two = e.both === true, ew = si.width * si.mult;
      // Con trazos: línea punteada; sin ellos, gruesa si el ancho (con el peso) lo pide
      const arrow = si.dash ? (two ? '<-.->' : '-.->') : ew >= 2.2 ? (two ? '<==>' : '==>') : (two ? '<-->' : '-->');
      const lock = e.encrypted === true ? '🔒' : e.encrypted === false ? '🔓' : '';
      const label = e.label ? String(e.label).split('\n').map(esc).join('<br/>') : '';
      const text = [label, esc(shorts(e.data).join(' · ')), lock].filter(Boolean).join(' ');
      out.push(`    ${nid[e.from]} ${arrow}${text ? `|"${text}"|` : ''} ${nid[e.to]}`);
      // linkStyle: data y optional como siempre; el resto según su grosor (×1.25 sobre el de la app), trazos y color propios
      const props = [];
      if (style === 'optional' && si.mult === 1) props.push('stroke-width:1px', 'stroke-dasharray: 2 4');
      else {
        const px = Math.round(ew * 1.25 * 10) / 10;
        if (Math.abs(px - 2) > 0.3 || si.mult > 1) props.push(`stroke-width:${px}px`);
        if (si.dash && style !== 'async') props.push(`stroke-dasharray: ${si.dash}`);
      }
      if (si.color) props.push(`stroke:${si.color}`);
      if (props.length) links.push(`    linkStyle ${idx} ${props.join(',')}`);
      idx++;
    });
    out.push(...links);

    // Estilos de nodos y grupos
    const names = Object.keys(classes).sort();
    names.forEach(cls => out.push(`    classDef ${cls} fill:${mix(classes[cls].color, 0.35)},stroke:${classes[cls].color},color:#1f2937`));
    names.forEach(cls => out.push(`    class ${classes[cls].ids.join(',')} ${cls}`));
    out.push(...groupStyles, ...levelStyles);
    Object.keys(noteClasses).sort().forEach(cls => {
      out.push(`    classDef ${cls} fill:${noteClasses[cls].hex},stroke:${noteClasses[cls].hex},stroke-dasharray: 2 2,color:#1f2937`);
      out.push(`    class ${noteClasses[cls].ids.join(',')} ${cls}`);
    });
    // Zonas: classDef por severidad (y límite de confianza) sobre los nodos miembro; los niveles expandidos ya llevan el borde en su style
    const zcls = {};
    nodes.forEach(n => { const zi = zoneOf[n.id]; if (zi && !emitted.has('l:' + n.id)) (zcls[zi.cls] = zcls[zi.cls] || { hex: zi.hex, trust: zi.trust, ids: [] }).ids.push(nid[n.id]); });
    Object.keys(zcls).sort().forEach(cls => {
      out.push(`    classDef ${cls} stroke:${norm(zcls[cls].hex)},stroke-width:4px${zcls[cls].trust ? ',stroke-dasharray: 6 3' : ''}`);
      out.push(`    class ${zcls[cls].ids.join(',')} ${cls}`);
    });
    const cm = x => String(x == null ? '' : x).replace(/[\r\n]+/g, ' ').replace(/[{}]/g, m => (m === '{' ? '(' : ')')).trim();
    const W = ctx.words || {};
    if (zoneInfo.length) {
      out.push('');
      zoneInfo.forEach(zi => {
        const kind = zi.trust ? (W.trust || 'Trust boundary') : (W.zone || 'Risk zone') + ' ' + (ctx.sevLabel ? ctx.sevLabel(zi.sev) : zi.sev);
        const trustTxt = zi.trust && zi.z.trust ? ' (' + cm(zi.z.trust) + ')' : '';
        out.push(`%% ${kind}: ${cm(zi.z.label || zi.z.id)}${trustTxt}${zi.z.desc ? ' - ' + cm(zi.z.desc) : ''}`);
        out.push(`%%   members: ${zi.members.map(n => nid[n.id]).join(', ') || '-'}`);
      });
    }
    // Metadatos como comentarios (no se pueden usar `click`)
    const metaOut = [];
    const metaLine = (id, x) => {
      const rows = (typeof ctx.meta === 'function' ? ctx.meta(x) : []) || [];
      if (rows.length) metaOut.push(`%% meta ${id}: ${rows.map(r => `${cm(r.label || r.key)}=${cm(r.value)}`).join('; ')}`);
    };
    groups.forEach(g => metaLine(gid[g.id], g));
    nodes.forEach(n => metaLine(nid[n.id], n));
    edges.forEach((e, i) => { if (nid[e.from] && nid[e.to]) metaLine('e_' + (e.id == null ? i + 1 : String(e.id).replace(/[^A-Za-z0-9_]/g, '_')), e); });
    if (metaOut.length) out.push('', ...metaOut);

    // Decisiones (ADR) y hallazgos descartados: solo comentarios
    const adrOut = [];
    (model.decisions || []).forEach(d => {
      const l = d.links || {};
      const refs = [...(l.nodes || []).map(id => nid[id]), ...(l.groups || []).map(id => gid[id]), ...(l.edges || []).map(id => 'e_' + String(id).replace(/[^A-Za-z0-9_]/g, '_')), ...(l.versions || []).map(id => 'version:' + cm(id))].filter(Boolean);
      adrOut.push(`%% adr ${cm(d.id)} [${cm(d.status)}] ${cm(d.title)}${refs.length ? ' — links: ' + refs.join(', ') : ''}`);
      if (d.decision) adrOut.push(`%%   decision: ${cm(d.decision)}`);
    });
    (typeof ctx.dismissed === 'function' ? ctx.dismissed() : []).forEach(x => {
      const who = [x.by, x.date].filter(Boolean).map(cm).join(', ');
      adrOut.push(`%% dismissed ${cm(x.id)}: ${cm(x.reason)}${who ? ` (${who})` : ''}`);
    });
    if (adrOut.length) out.push('', ...adrOut);

    return { text: out.join('\n') + '\n', ext: 'mmd', mime: 'text/plain' };
  }

  window.DiagramonExport = window.DiagramonExport || {};
  window.DiagramonExport.mermaid = mermaid;
})();
