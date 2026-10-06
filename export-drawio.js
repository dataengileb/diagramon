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
    const m = /^data:([^;,]+);base64,(.*)$/i.exec(src);
    // draw.io admite "data:image/png,BASE64" y "data:image/svg+xml,BASE64"
    const uri = m ? `data:${m[1]},${m[2]}` : src;
    return styleSafe(uri);
  };

  const exportDrawio = (model, ctx) => {
    const groups = model.groups || [];
    const nodes = model.nodes || [];
    const edges = model.edges || [];
    const gById = {};
    groups.forEach(g => { gById[g.id] = g; });

    // Cajas absolutas; los grupos sin caja se omiten
    const boxes = {};
    groups.forEach(g => { const b = ctx.groupBox(g.id); if (b) boxes[g.id] = b; });

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

    // Título sobre el diagrama
    let minX = Infinity, minY = Infinity, maxX = -Infinity;
    Object.keys(boxes).forEach(id => {
      const b = boxes[id];
      minX = Math.min(minX, b.x); minY = Math.min(minY, b.y); maxX = Math.max(maxX, b.x + b.w);
    });
    nodes.forEach(n => {
      const s = ctx.size(n);
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y); maxX = Math.max(maxX, n.x + s.w);
    });
    if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 400; }
    const title = ctx.title || model.title || '';
    if (title) {
      cells.push(`<mxCell id="title" value="${esc(h(title))}" style="text;html=1;align=left;verticalAlign=middle;fontSize=20;fontStyle=1;fontColor=#222222;strokeColor=none;fillColor=none;" vertex="1" parent="1"><mxGeometry x="${num(minX)}" y="${num(minY - 64)}" width="${num(Math.max(240, maxX - minX))}" height="32" as="geometry"/></mxCell>`);
    }

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
      cells.push(`<mxCell id="g-${esc(g.id)}" value="${esc(h(g.label || g.id))}" style="${style}" vertex="1" parent="${pid ? 'g-' + esc(pid) : '1'}"><mxGeometry x="${num(b.x - (pb ? pb.x : 0))}" y="${num(b.y - (pb ? pb.y : 0))}" width="${num(b.w)}" height="${num(b.h)}" as="geometry"/></mxCell>`);
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
      if (n.desc) attrs.push(`desc="${esc(n.desc)}"`, `tooltip="${esc(n.desc)}"`);
      if (tags.length) attrs.push(`data="${esc((n.data || []).join(','))}"`);
      if (n.cost != null && n.cost !== '') attrs.push(`cost="${esc(n.cost)}"`);
      if (n.review && n.review.note) attrs.push(`review="${esc(n.review.status + ': ' + n.review.note)}"`);
      cells.push(`<object id="n-${esc(n.id)}" ${attrs.join(' ')}><mxCell style="${style}" vertex="1" parent="${pid ? 'g-' + esc(pid) : '1'}"><mxGeometry x="${num(n.x - (pb ? pb.x : 0))}" y="${num(n.y - (pb ? pb.y : 0))}" width="${num(s.w)}" height="${num(s.h)}" as="geometry"/></mxCell></object>`);
    });

    // Aristas (todas bajo la capa 1; draw.io las une por source/target)
    const nodeIds = {};
    nodes.forEach(n => { nodeIds[n.id] = true; });
    edges.forEach(e => {
      if (!nodeIds[e.from] || !nodeIds[e.to]) return;
      const color = ctx.color(e);
      const elbow = (e.route || model.routing || ctx.routing) === 'elbow';
      let style = elbow ? 'edgeStyle=orthogonalEdgeStyle;rounded=1;' : 'edgeStyle=orthogonalEdgeStyle;curved=1;';
      style += `html=1;endArrow=block;endFill=1;strokeColor=${color};fontColor=#333333;fontSize=11;labelBackgroundColor=#FFFFFF;`;
      if (e.style === 'async') style += 'dashed=1;dashPattern=8 8;strokeWidth=2;';
      else if (e.style === 'data') style += 'strokeWidth=3;';
      else if (e.style === 'optional') style += 'dashed=1;dashPattern=2 6;opacity=70;strokeWidth=2;';
      else style += 'strokeWidth=2;';

      const parts = [];
      if (e.label) parts.push(h(e.label));
      const tags = (e.data || []).map(k => ctx.dataLabel(k).short).filter(Boolean);
      if (tags.length) parts.push(h(tags.join(' · ')));
      let label = parts.join('<br>');
      if (e.encrypted === true) label = '🔒' + (label ? ' ' + label : '');
      else if (e.encrypted === false) label = '🔓' + (label ? ' ' + label : '');

      const attrs = [`label="${esc(label)}"`, `edgeStyle="${esc(e.style || 'sync')}"`, `edgeStyleLabel="${esc(ctx.edgeStyleLabel(e.style))}"`];
      if (e.encrypted != null) attrs.push(`encrypted="${e.encrypted ? 'true' : 'false'}"`);
      if (tags.length) attrs.push(`data="${esc((e.data || []).join(','))}"`);
      cells.push(`<object id="e-${esc(e.id)}" ${attrs.join(' ')}><mxCell style="${style}" edge="1" parent="1" source="n-${esc(e.from)}" target="n-${esc(e.to)}"><mxGeometry relative="1" as="geometry"/></mxCell></object>`);
    });

    const pageW = Math.ceil(maxX - minX + 400), pageH = 1200;
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      `<mxfile host="Diagramon" agent="Diagramon" version="24.0.0"><diagram name="${esc(title || 'Diagramon')}" id="diagramon-1">` +
      `<mxGraphModel dx="0" dy="0" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="${pageW}" pageHeight="${pageH}" math="0" shadow="0"><root>\n` +
      '<mxCell id="0"/>\n<mxCell id="1" parent="0"/>\n' +
      cells.join('\n') + '\n</root></mxGraphModel></diagram></mxfile>\n';
    return { text: xml, ext: 'drawio', mime: 'application/xml' };
  };

  window.DiagramonExport = window.DiagramonExport || {};
  window.DiagramonExport.drawio = exportDrawio;
})();
