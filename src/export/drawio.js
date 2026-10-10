/* ==========================================================================
   Diagramon · exportar a draw.io (.drawio, XML sin comprimir)
   --------------------------------------------------------------------------
   Genera un archivo que abre app.diagrams.net y draw.io Desktop con la misma
   disposición que en Diagramon:
   - Grupos como contenedores anidados (container=1); las coordenadas de
     hijos son relativas a la caja de su contenedor. Un grupo sin caja se
     omite y sus hijos pasan al siguiente ancestro con caja.
   - Nodos con posición y tamaño exactos, etiqueta HTML (nombre, subtítulo,
     clases de datos, insignia y ⚑ si hay hallazgos abiertos) e icono oficial
     (shape=label) cuando existe. Los URI data: pierden el ';' de
     ';base64' (draw.io separa los estilos por ';' y acepta data:image/svg+xml,BASE64).
   - Aristas con source/target; curvas = orthogonalEdgeStyle + curved=1
     (lo más parecido a las curvas suaves de la app), codo = orthogonalEdgeStyle + rounded=1.
   - Los ids son deterministas: g-<id>, n-<id>, e-<id>.
   - Niveles C4: una página de draw.io por nivel (la primera es el nivel superior, igual que
     antes; luego una por ctx.levels, con el nombre «Sistema › Contenedor»). Cada página
     lleva los nodos, grupos, notas y zonas de su nivel con sus posiciones. Una arista que
     cruza niveles se dibuja en la página interna con un nodo «fantasma» (discontinuo, con
     «(fuera)») en el extremo externo. Un nodo con diagrama interno lleva
     link="data:page/id,<página>" (clic en draw.io = abre ese nivel). Los ids de las páginas
     posteriores llevan el prefijo p<n>- (los de la primera no cambian; "0" y "1" son las
     celdas raíz de cada página). Un diagrama sin niveles produce una sola página, como antes.
   - Notas: shape=note del color de la nota. Zonas de riesgo y límites de confianza:
     rectángulos discontinuos al fondo (celdas de la capa, nunca dentro de un grupo, así que
     las coordenadas son absolutas), con el color de la severidad y la etiqueta arriba a la izquierda.
   - Metadatos (ctx.meta: dueño, equipo, región, SLA, coste…): los nodos, grupos y aristas con
     metadatos van como <object> con un atributo por campo (nombre = clave, p. ej. owner, region;
     meta_<clave> si choca con otro atributo) → aparecen en «Editar datos»; el tooltip lista
     «Etiqueta: valor». El id y la etiqueta no cambian.
   - Los componentes, grupos y conexiones enlazados a una decisión (ADR) llevan el atributo adrs="ADR-001,ADR-002" (viene de ctx.meta).
     Los hallazgos descartados (ctx.dismissed) van como atributo dismissed="id: motivo (quién, fecha)" en el elemento al que apuntan
     (nodo, conexión, grupo o zona; si no existe, solo constan en la página de decisiones).
   - Decisiones (ADR): si las hay (o hay descartados sin elemento), una última página «Decisiones de arquitectura» con una nota por
     decisión (título, estado, fecha, decisores, contexto, decisión, consecuencias, enlaces) y, si procede, la lista de hallazgos descartados.
     Sin ADR ni descartados el archivo es idéntico al de antes.
   API: window.DiagramonExport.drawio(model, ctx) → { text, ext, mime }.
   ========================================================================== */
(() => {
  'use strict';

  // Escapa un valor de atributo XML (también saltos de línea)
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    .replace(/\r?\n/g, '&#10;');
  // Escapa texto que luego va dentro de una etiqueta HTML
  const h = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const num = v => Math.round(v * 100) / 100;

  // El estilo de draw.io es "clave=valor;": ningún valor puede llevar ';' ni comillas
  const styleSafe = s => String(s).replace(/;/g, '%3B').replace(/"/g, '%22');
  const imageUri = src => {
    if (!src) return null;
    const m = /^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$/is.exec(src);
    // draw.io admite "data:image/png,BASE64" y "data:image/svg+xml,BASE64"; el '=' del relleno base64 es válido en un estilo
    const uri = m ? `data:${m[1]},${m[2]}` : src;
    return styleSafe(uri); // el escape XML se hace al escribir el atributo style (esc)
  };
  const META_RESERVED = new Set(['id', 'label', 'link', 'placeholders', 'tooltip', 'type', 'typeLabel', 'desc', 'data', 'cost', 'review', 'edgeStyle', 'edgeStyleLabel', 'weight', 'encrypted']);
  const OUT = { en: 'outside', es: 'fuera' };

  // Atributos de metadatos (ctx.meta) para un <object>: un atributo por campo y un tooltip «Etiqueta: valor»
  const metaOf = (ctx, x) => {
    const rows = typeof ctx.meta === 'function' ? (ctx.meta(x) || []) : [];
    const attrs = [], used = new Set(), lines = [];
    rows.forEach(r => {
      let k = String(r.key || '').replace(/[^A-Za-z0-9_]/g, '_');
      if (!k) return;
      if (!/^[A-Za-z_]/.test(k)) k = 'm_' + k;
      if (META_RESERVED.has(k)) k = 'meta_' + k;
      if (used.has(k)) return;
      used.add(k);
      attrs.push(`${k}="${esc(r.value)}"`);
      lines.push(`<b>${h(r.label || r.key)}:</b> ${h(r.value)}`);
    });
    return { attrs, tip: lines.join('<br>') };
  };

  const exportDrawio = (model, ctx) => {
    const allGroups = model.groups || [];
    const allNodes = model.nodes || [];
    const allEdges = model.edges || [];
    const nodeById = {};
    allNodes.forEach(n => { nodeById[n.id] = n; });

    // Niveles C4: página 0 = nivel superior; luego una por nivel con nodos dentro
    const levels = (Array.isArray(ctx.levels) ? ctx.levels : []).filter(l => l && nodeById[l.id]);
    const levelIdx = {};
    levels.forEach((l, i) => { levelIdx[l.id] = i + 1; });
    const scopeOf = o => (o.in && levelIdx[o.in] ? o.in : null);
    const pageIdOf = i => `diagramon-${i + 1}`;
    const pathName = l => (l.path && l.path.length ? l.path : [l.id]).map(id => String(nodeById[id] ? nodeById[id].label || id : id).replace(/\s*\n\s*/g, ' ')).join(' › ');
    const lang = ctx.lang === 'es' ? 'es' : 'en';

    // Hallazgos descartados: atributo en el elemento al que apuntan (nodo, conexión, grupo, zona)
    const dismissed = (typeof ctx.dismissed === 'function' ? ctx.dismissed() : []) || [];
    const disBy = {};
    dismissed.forEach(x => { if (x.target) (disBy[x.target.kind + ':' + x.target.id] = disBy[x.target.kind + ':' + x.target.id] || []).push(x); });
    const disText = x => `${x.id}: ${x.reason}${x.by || x.date ? ` (${[x.by, x.date].filter(Boolean).join(', ')})` : ''}`;
    const disAttr = (kind, id) => (disBy[kind + ':' + id] ? `dismissed="${esc(disBy[kind + ':' + id].map(disText).join('; '))}"` : '');
    const known = new Set([...allNodes.map(n => 'node:' + n.id), ...allEdges.map(e => 'edge:' + e.id), ...allGroups.map(g => 'group:' + g.id), ...(model.zones || []).map(z => 'zone:' + z.id)]);
    const orphans = dismissed.filter(x => !x.target || !known.has(x.target.kind + ':' + x.target.id));
    const decisions = model.decisions || [];

    const buildPage = pageIdx => {
      const scope = pageIdx ? levels[pageIdx - 1].id : null;
      const P = pageIdx ? `p${pageIdx}-` : '';
      const groups = allGroups.filter(g => scopeOf(g) === scope);
      const nodes = allNodes.filter(n => scopeOf(n) === scope);
      const notes = (model.notes || []).filter(o => scopeOf(o) === scope);
      const zones = (model.zones || []).filter(o => scopeOf(o) === scope);
      const gById = {};
      groups.forEach(g => { gById[g.id] = g; });

      // Cajas absolutas; los grupos sin caja se omiten (en los niveles internos se calculan a partir de sus nodos)
      const boxes = {};
      groups.forEach(g => { const b = ctx.groupBox(g.id); if (b) boxes[g.id] = b; });
      if (pageIdx) {
        const inside = (g, id) => { let c = gById[id], i = 0; while (c && i++ < 50) { if (c.id === g.id) return true; c = gById[c.parent]; } return false; };
        groups.forEach(g => {
          if (boxes[g.id]) return;
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
          nodes.forEach(n => { if (n.group && inside(g, n.group)) { const s = ctx.size(n); x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + s.w); y1 = Math.max(y1, n.y + s.h); } });
          if (isFinite(x0)) boxes[g.id] = { x: x0 - 24, y: y0 - 40, w: x1 - x0 + 48, h: y1 - y0 + 64 };
        });
      }

      // Primer ancestro (incluido el propio grupo) que tenga caja
      const anchor = gid => {
        const seen = {};
        while (gid && gById[gid] && !seen[gid]) {
          if (boxes[gid]) return gid;
          seen[gid] = true;
          gid = gById[gid].parent;
        }
        return null;
      };

      // Orden de grupos: padres antes que hijos
      const order = [];
      const done = {};
      const visit = g => {
        if (done[g.id]) return;
        done[g.id] = true;
        if (g.parent && gById[g.parent]) visit(gById[g.parent]);
        order.push(g);
      };
      groups.forEach(visit);

      const cells = [];

      // Extensión del contenido (título, fantasmas y ancho de página)
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const grow = (x, y, w, hh) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + hh); };
      Object.keys(boxes).forEach(id => { const b = boxes[id]; grow(b.x, b.y, b.w, b.h); });
      nodes.forEach(n => { const s = ctx.size(n); grow(n.x, n.y, s.w, s.h); });
      notes.forEach(o => grow(o.x, o.y, o.w, o.h));
      zones.forEach(o => grow(o.x, o.y, o.w, o.h));
      if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 400; maxY = 200; }
      const title = pageIdx ? pathName(levels[pageIdx - 1]) : (ctx.title || model.title || '');
      if (title) {
        cells.push(`<mxCell id="${P}title" value="${esc(h(title))}" style="text;html=1;align=left;verticalAlign=middle;fontSize=20;fontStyle=1;fontColor=#222222;strokeColor=none;fillColor=none;" vertex="1" parent="1"><mxGeometry x="${num(minX)}" y="${num(minY - 64)}" width="${num(Math.max(240, maxX - minX))}" height="32" as="geometry"/></mxCell>`);
      }

      // Zonas de riesgo y límites de confianza: al fondo, como celdas de la capa (coordenadas absolutas)
      zones.forEach(z => {
        const trust = z.kind === 'trust';
        const hex = trust ? '#6B7280' : (typeof ctx.sevHex === 'function' ? ctx.sevHex(z.severity) : '#C4A63A');
        const sev = !trust && typeof ctx.sevLabel === 'function' && z.severity ? ctx.sevLabel(z.severity) : '';
        const tail = trust ? (z.trust ? String(z.trust) : '') : sev;
        let label = `<b>${h(z.label || z.id)}</b>`;
        if (tail) label += ` <font style="font-size:10px">· ${h(tail)}</font>`;
        const style = `rounded=0;whiteSpace=wrap;html=1;dashed=1;dashPattern=${trust ? '3 4' : '8 4'};strokeColor=${hex};strokeWidth=2;fillColor=${hex};fillOpacity=${trust ? 4 : 8};verticalAlign=top;align=left;spacingLeft=8;spacingTop=4;fontSize=12;fontColor=${hex};`;
        const geo = `<mxGeometry x="${num(z.x)}" y="${num(z.y)}" width="${num(z.w)}" height="${num(z.h)}" as="geometry"/>`;
        const zd = disAttr('zone', z.id);
        if (z.desc || zd) cells.push(`<object id="${P}z-${esc(z.id)}" label="${esc(label)}"${zd ? ' ' + zd : ''}${z.desc ? ` tooltip="${esc(h(z.desc))}"` : ''}><mxCell style="${esc(style)}" vertex="1" parent="1">${geo}</mxCell></object>`);
        else cells.push(`<mxCell id="${P}z-${esc(z.id)}" value="${esc(label)}" style="${esc(style)}" vertex="1" parent="1">${geo}</mxCell>`);
      });

      // Grupos como contenedores
      order.forEach(g => {
        const b = boxes[g.id];
        if (!b) return;
        const pid = anchor(g.parent);
        const pb = pid ? boxes[pid] : null;
        const color = ctx.color(g);
        // Con icono de grupo, el contenedor es una forma "label": el icono arriba a la izquierda y el texto desplazado
        const gIcon = g.icon ? ctx.icon(g.icon) : null, gUri = gIcon ? imageUri(gIcon.src) : null;
        const style = (gUri ? `shape=label;image=${gUri};imageWidth=18;imageHeight=18;imageAlign=left;imageVerticalAlign=top;` : '') +
          `rounded=1;arcSize=3;container=1;collapsible=0;whiteSpace=wrap;html=1;dashed=1;dashPattern=6 4;strokeColor=${color};strokeWidth=1.5;fillColor=${color};fillOpacity=10;verticalAlign=top;align=left;spacingLeft=${gUri ? 32 : 10};spacingTop=4;fontStyle=1;fontSize=13;fontColor=#444444;`;
        const geo = `<mxGeometry x="${num(b.x - (pb ? pb.x : 0))}" y="${num(b.y - (pb ? pb.y : 0))}" width="${num(b.w)}" height="${num(b.h)}" as="geometry"/>`;
        const par = pid ? P + 'g-' + esc(pid) : '1';
        const mt = metaOf(ctx, g), gd = disAttr('group', g.id);
        if (mt.attrs.length || gd) cells.push(`<object id="${P}g-${esc(g.id)}" label="${esc(h(g.label || g.id))}" ${[...mt.attrs, gd].filter(Boolean).join(' ')}${mt.tip ? ` tooltip="${esc(mt.tip)}"` : ''}><mxCell style="${esc(style)}" vertex="1" parent="${par}">${geo}</mxCell></object>`);
        else cells.push(`<mxCell id="${P}g-${esc(g.id)}" value="${esc(h(g.label || g.id))}" style="${esc(style)}" vertex="1" parent="${par}">${geo}</mxCell>`);
      });

      // Nodos
      nodes.forEach(n => {
        const s = ctx.size(n);
        const pid = anchor(n.group);
        const pb = pid ? boxes[pid] : null;
        const color = ctx.color(n);
        const icon = n.icon ? ctx.icon(n.icon) : null;
        const uri = icon ? imageUri(icon.src) : null;

        // Etiqueta HTML: nombre, subtítulo gris, clases de datos, insignia
        let label = `<b>${h(n.label || n.id)}</b>`;
        if (n.sub) label += `<br><font style="font-size:10px" color="#777777">${h(n.sub)}</font>`;
        const tags = (n.data || []).map(k => ctx.dataLabel(k).short).filter(Boolean);
        const extra = [];
        if (tags.length) extra.push(h(tags.join(' · ')));
        if (n.badge) extra.push(h(n.badge));
        if (n.review && n.review.status === 'open') extra.push('⚑');
        if (extra.length) label += `<br><font style="font-size:10px" color="#B05A00">${extra.join(' · ')}</font>`;

        let style = `rounded=1;arcSize=14;whiteSpace=wrap;html=1;fillColor=#FFFFFF;strokeColor=${color};strokeWidth=2;fontColor=#222222;fontSize=12;`;
        if (uri) style = `shape=label;image=${uri};imageWidth=32;imageHeight=32;imageAlign=left;imageVerticalAlign=middle;spacingLeft=52;align=left;verticalAlign=middle;` + style;
        else style += 'align=center;verticalAlign=middle;';

        const attrs = [`label="${esc(label)}"`, `type="${esc(n.type || 'generic')}"`, `typeLabel="${esc(ctx.typeLabel(n.type))}"`];
        const mt = metaOf(ctx, n);
        if (n.desc) attrs.push(`desc="${esc(n.desc)}"`);
        if (mt.attrs.length) attrs.push(`tooltip="${esc((n.desc ? h(n.desc) + '<br>' : '') + mt.tip)}"`);
        else if (n.desc) attrs.push(`tooltip="${esc(n.desc)}"`);
        if (tags.length) attrs.push(`data="${esc((n.data || []).join(','))}"`);
        if (n.cost != null && n.cost !== '') attrs.push(`cost="${esc(n.cost)}"`);
        if (n.review && n.review.note) attrs.push(`review="${esc(n.review.status + ': ' + n.review.note)}"`);
        attrs.push(...mt.attrs);
        { const nd = disAttr('node', n.id); if (nd) attrs.push(nd); }
        if (levelIdx[n.id]) attrs.push(`link="data:page/id,${pageIdOf(levelIdx[n.id])}"`);
        cells.push(`<object id="${P}n-${esc(n.id)}" ${attrs.join(' ')}><mxCell style="${esc(style)}" vertex="1" parent="${pid ? P + 'g-' + esc(pid) : '1'}"><mxGeometry x="${num(n.x - (pb ? pb.x : 0))}" y="${num(n.y - (pb ? pb.y : 0))}" width="${num(s.w)}" height="${num(s.h)}" as="geometry"/></mxCell></object>`);
      });

      // Notas (encima de los nodos)
      notes.forEach(o => {
        const hex = typeof ctx.noteHex === 'function' ? ctx.noteHex(o.color) : '#F2E6A0';
        const text = String(o.text || '').split('\n').map(h).join('<br>');
        cells.push(`<mxCell id="${P}no-${esc(o.id)}" value="${esc(text)}" style="shape=note;size=14;backgroundOutline=1;whiteSpace=wrap;html=1;fillColor=${hex};strokeColor=#8A8A8A;strokeWidth=1;align=left;verticalAlign=top;spacing=8;fontSize=12;fontColor=#222222;" vertex="1" parent="1"><mxGeometry x="${num(o.x)}" y="${num(o.y)}" width="${num(o.w)}" height="${num(o.h)}" as="geometry"/></mxCell>`);
      });

      // Aristas (todas bajo la capa 1; draw.io las une por source/target)
      const here = {};
      nodes.forEach(n => { here[n.id] = true; });
      const ghosts = {}, ghostList = [];
      const ghostOf = (id, incoming) => {
        if (!ghosts[id]) { ghosts[id] = { n: nodeById[id], inc: false }; ghostList.push(ghosts[id]); }
        if (incoming) ghosts[id].inc = true;
        return P + 'x-' + id;
      };
      const edgeCells = [];
      // Desplazamiento manual de la flecha (bend): un punto de paso entre los centros de sus dos componentes
      const bendPts = e => {
        const A = here[e.from] && nodeById[e.from], B = here[e.to] && nodeById[e.to];
        if (!e.bend || !A || !B) return '';
        const sa = ctx.size(A), sb = ctx.size(B);
        return `<Array as="points"><mxPoint x="${num((A.x + sa.w / 2 + B.x + sb.w / 2) / 2 + e.bend.x)}" y="${num((A.y + sa.h / 2 + B.y + sb.h / 2) / 2 + e.bend.y)}"/></Array>`;
      };
      allEdges.forEach(e => {
        let src, dst;
        if (here[e.from] && here[e.to]) { src = P + 'n-' + e.from; dst = P + 'n-' + e.to; }
        else if (!pageIdx) return;
        else if (here[e.from] && nodeById[e.to]) { src = P + 'n-' + e.from; dst = ghostOf(e.to, false); }
        else if (here[e.to] && nodeById[e.from]) { src = ghostOf(e.from, true); dst = P + 'n-' + e.to; }
        else return;
        const color = ctx.color(e);
        const elbow = (e.route || model.routing || ctx.routing) === 'elbow';
        let style = elbow ? 'edgeStyle=orthogonalEdgeStyle;rounded=1;' : 'edgeStyle=orthogonalEdgeStyle;curved=1;';
        style += `html=1;endArrow=block;endFill=1;${e.both ? 'startArrow=block;startFill=1;' : ''}strokeColor=${color};fontColor=#333333;fontSize=11;labelBackgroundColor=#FFFFFF;`;
        // Estilo resuelto por la app (también los tipos propios); el peso multiplica el grosor
        const si = typeof ctx.edgeStyleInfo === 'function' ? ctx.edgeStyleInfo(e) : { id: ['async', 'data', 'optional'].includes(e.style) ? e.style : 'sync', dash: e.style === 'async' ? '6 6' : e.style === 'optional' ? '2 6' : '', width: e.style === 'data' ? 2.4 : 1.8, mult: 1, weight: '' };
        const base = si.width >= 2.2 ? 3 : si.width < 1.4 ? 1 : 2, sw = Math.round(base * (si.mult || 1) * 10) / 10;
        if (si.id === 'async') style += `dashed=1;dashPattern=8 8;strokeWidth=${sw};`;
        else if (si.id === 'optional') style += `dashed=1;dashPattern=2 6;opacity=70;strokeWidth=${sw === 2 ? 2 : sw};`;
        else if (si.dash) style += `dashed=1;dashPattern=${String(si.dash).replace(/[^0-9. ]/g, '')};strokeWidth=${sw};`;
        else style += `strokeWidth=${sw};`;

        const parts = [];
        if (e.label) parts.push(String(e.label).split('\n').map(h).join('<br>'));
        const tags = (e.data || []).map(k => ctx.dataLabel(k).short).filter(Boolean);
        if (tags.length) parts.push(h(tags.join(' · ')));
        let label = parts.join('<br>');
        if (e.encrypted === true) label = '🔒' + (label ? ' ' + label : '');
        else if (e.encrypted === false) label = '🔓' + (label ? ' ' + label : '');

        const attrs = [`label="${esc(label)}"`, `edgeStyle="${esc(e.style || 'sync')}"`, `edgeStyleLabel="${esc(ctx.edgeStyleLabel(e.style))}"`];
        if (e.weight === 'high' || e.weight === 'critical') attrs.push(`weight="${e.weight}"`);
        if (e.encrypted != null) attrs.push(`encrypted="${e.encrypted ? 'true' : 'false'}"`);
        if (tags.length) attrs.push(`data="${esc((e.data || []).join(','))}"`);
        const mt = metaOf(ctx, e);
        attrs.push(...mt.attrs);
        { const ed = disAttr('edge', e.id); if (ed) attrs.push(ed); }
        if (mt.attrs.length) attrs.push(`tooltip="${esc(mt.tip)}"`);
        edgeCells.push(`<object id="${P}e-${esc(e.id)}" ${attrs.join(' ')}><mxCell style="${esc(style)}" edge="1" parent="1" source="${esc(src)}" target="${esc(dst)}"><mxGeometry relative="1" as="geometry">${bendPts(e)}</mxGeometry></mxCell></object>`);
      });

      // Fantasmas: nodos de otro nivel conectados con este (entrantes a la izquierda, salientes a la derecha)
      let yl = minY, yr = minY;
      ghostList.forEach(g => {
        const n = g.n, s = ctx.size(n);
        const color = ctx.color(n);
        const home = scopeOf(n);
        const where = home ? pathName(levels[levelIdx[home] - 1]) : '';
        const x = g.inc ? minX - s.w - 80 : maxX + 80;
        const y = g.inc ? yl : yr;
        if (g.inc) yl += s.h + 24; else yr += s.h + 24;
        const label = `<b>${h(n.label || n.id)}</b><br><font style="font-size:10px" color="#777777">(${OUT[lang]})${where ? ' · ' + h(where) : ''}</font>`;
        const style = `rounded=1;arcSize=14;whiteSpace=wrap;html=1;dashed=1;dashPattern=5 4;fillColor=#FFFFFF;fillOpacity=55;strokeColor=${color};strokeWidth=1.5;opacity=60;fontColor=#222222;fontSize=12;align=center;verticalAlign=middle;`;
        const link = `data:page/id,${pageIdOf(home ? levelIdx[home] : 0)}`;
        cells.push(`<object id="${P}x-${esc(n.id)}" label="${esc(label)}" type="ghost" link="${link}"><mxCell style="${esc(style)}" vertex="1" parent="1"><mxGeometry x="${num(x)}" y="${num(y)}" width="${num(s.w)}" height="${num(s.h)}" as="geometry"/></mxCell></object>`);
        grow(x, y, s.w, s.h);
      });
      cells.push(...edgeCells);

      const pageW = Math.ceil(maxX - minX + 400), pageH = 1200;
      return `<diagram name="${esc(pageIdx ? title : (title || 'Diagramon'))}" id="${pageIdOf(pageIdx)}">` +
        `<mxGraphModel dx="0" dy="0" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="${pageW}" pageHeight="${pageH}" math="0" shadow="0"><root>\n` +
        '<mxCell id="0"/>\n<mxCell id="1" parent="0"/>\n' +
        cells.join('\n') + '\n</root></mxGraphModel></diagram>';
    };

    // Última página: una nota por decisión (ADR) y la lista de hallazgos descartados
    function buildDecisionsPage() {
      const W = ctx.words || {}, status = k => (typeof ctx.adrStatus === 'function' ? ctx.adrStatus(k) : k);
      const title = (decisions.length ? W.adrs : W.dismissed) || (decisions.length ? 'Architecture decisions' : 'Dismissed findings');
      const cells = [`<mxCell id="pd-title" value="${esc(h(title))}" style="text;html=1;align=left;verticalAlign=middle;fontSize=20;fontStyle=1;fontColor=#222222;strokeColor=none;fillColor=none;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="640" height="32" as="geometry"/></mxCell>`];
      const para = t => String(t == null ? '' : t).split(/\r?\n/).map(h).join('<br>');
      const rows = t => String(t || '').split(/\r?\n/).reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 78)), 0);
      let y = 56;
      const add = (id, label, lines, style, extra) => {
        const hh = Math.max(70, lines * 17 + 28);
        cells.push(`<object id="${id}" label="${esc(label)}"${extra || ''}><mxCell style="${esc(style)}" vertex="1" parent="1"><mxGeometry x="0" y="${y}" width="640" height="${hh}" as="geometry"/></mxCell></object>`);
        y += hh + 24;
      };
      decisions.forEach(d => {
        const l = d.links || {}, refs = [...(l.nodes || []), ...(l.groups || []), ...(l.edges || []), ...(l.versions || []).map(v => 'version:' + v)];
        let label = `<b>${h(d.id)} · ${h(d.title)}</b><br><font style="font-size:10px" color="#777777">${h([status(d.status), d.date, d.deciders ? (W.adrDeciders || 'Deciders') + ': ' + d.deciders : ''].filter(Boolean).join(' · '))}</font>`;
        let lines = 2;
        [[W.adrContext || 'Context', d.context], [W.adrDecision || 'Decision', d.decision], [W.adrConsequences || 'Consequences', d.consequences]].forEach(([k, v]) => { if (v) { label += `<br><br><b>${h(k)}</b><br>${para(v)}`; lines += 3 + rows(v); } });
        if (refs.length) { label += `<br><br><font style="font-size:10px" color="#777777">${h(W.adrLinks || 'Linked to')}: ${h(refs.join(', '))}</font>`; lines += 2; }
        add('pd-adr-' + esc(d.id), label, lines, 'shape=note;size=14;backgroundOutline=1;whiteSpace=wrap;html=1;fillColor=#F2F0FA;strokeColor=#8573DB;strokeWidth=1.5;align=left;verticalAlign=top;spacing=10;fontSize=12;fontColor=#222222;',
          ` adr="${esc(d.id)}" status="${esc(d.status)}" date="${esc(d.date)}"${refs.length ? ` links="${esc(refs.join(','))}"` : ''}`);
      });
      if (dismissed.length) {
        const label = `<b>${h(W.dismissed || 'Dismissed findings')}</b><br>` + dismissed.map(x => h(disText(x))).join('<br>');
        add('pd-dismissed', label, 1 + dismissed.reduce((n, x) => n + rows(disText(x)), 0), 'shape=note;size=14;backgroundOutline=1;whiteSpace=wrap;html=1;fillColor=#FAFAFA;strokeColor=#8A8A8A;strokeWidth=1;align=left;verticalAlign=top;spacing=10;fontSize=12;fontColor=#222222;');
      }
      const pid = `diagramon-${levels.length + 2}`;
      return `<diagram name="${esc(title)}" id="${pid}">` +
        '<mxGraphModel dx="0" dy="0" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="900" pageHeight="1200" math="0" shadow="0"><root>\n' +
        '<mxCell id="0"/>\n<mxCell id="1" parent="0"/>\n' + cells.join('\n') + '\n</root></mxGraphModel></diagram>';
    }

    const pages = [];
    for (let i = 0; i <= levels.length; i++) pages.push(buildPage(i));
    if (decisions.length || orphans.length) pages.push(buildDecisionsPage());
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      `<mxfile host="Diagramon" agent="Diagramon" version="24.0.0">${pages.join('')}</mxfile>\n`;
    return { text: xml, ext: 'drawio', mime: 'application/xml' };
  };

  window.DiagramonExport = window.DiagramonExport || {};
  window.DiagramonExport.drawio = exportDrawio;
})();
