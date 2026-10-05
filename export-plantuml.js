/* ==========================================================================
   Diagramon · exportador a PlantUML (.puml)
   --------------------------------------------------------------------------
   Genera un diagrama de despliegue/componentes con PlantUML básico: sin
   !include, sin stdlib ni archivos remotos, así que se renderiza en cualquier
   sitio (servidor público, plugin del IDE, sin conexión).
   - Grupos: anidados según `parent`. Por la etiqueta se elige el elemento:
       AWS / Azure / Google Cloud / GCP -> cloud
       VPC / VNet / red virtual         -> frame
       subnet / namespace               -> package
       el resto                         -> rectangle <<group>>
   - Nodos por tipo:
       user -> actor · db, nosql -> database · queue, stream, events -> queue
       storage -> storage · cache -> collections · function -> component
       cdn, dns, external -> cloud · web, mobile -> boundary
       lb, gateway, firewall, compute, container, k8s -> node
       el resto (analytics, email, auth, secrets, monitor, cicd, ai, erp,
       generic) -> component
   - Aristas: sync -[c]-> · async .[c].> · data -[c,bold]-> ·
     optional -[c,dashed]-> (el color sale de ctx.color, aclarado en optional).
   - Fondo = color pastel mezclado con blanco; borde = color original.
   API: window.DiagramonExport.plantuml(model, ctx) -> { text, ext, mime }.
   ========================================================================== */
window.DiagramonExport = window.DiagramonExport || {};
window.DiagramonExport.plantuml = (() => {
  'use strict';

  const KEYWORD = {
    user: 'actor', db: 'database', nosql: 'database',
    queue: 'queue', stream: 'queue', events: 'queue',
    storage: 'storage', cache: 'collections', function: 'component',
    cdn: 'cloud', dns: 'cloud', external: 'cloud',
    web: 'boundary', mobile: 'boundary',
    lb: 'node', gateway: 'node', firewall: 'node', compute: 'node', container: 'node', k8s: 'node'
  };

  // Texto seguro dentro de comillas: sin saltos de línea ni comillas dobles
  const clean = s => String(s == null ? '' : s).replace(/[\r\n]+/g, ' ').replace(/"/g, "'").replace(/\\/g, '/').trim();
  // Mezcla un color #RRGGBB con blanco (t = 0..1 de blanco)
  const mix = (hex, t) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return '#F4F1FF';
    const n = parseInt(m[1], 16);
    const f = sh => Math.round(((n >> sh) & 255) * (1 - t) + 255 * t);
    return '#' + [16, 8, 0].map(sh => f(sh).toString(16).padStart(2, '0')).join('').toUpperCase();
  };
  const hexOf = c => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#8573DB');

  const groupKeyword = label => {
    const l = String(label || '').toLowerCase();
    if (/\b(aws|azure|google cloud|gcp)\b/.test(l)) return 'cloud';
    if (/\b(vpc|vnet|virtual network|red virtual)\b/.test(l)) return 'frame';
    if (/\b(subnet|subred|namespace)\b/.test(l)) return 'package';
    return 'rectangle';
  };

  return (model, ctx) => {
    const groups = model.groups || [];
    const nodes = model.nodes || [];
    const edges = model.edges || [];
    const used = new Set();
    // Alias seguros y únicos (prefijo G_ / N_)
    const alias = (prefix, id) => {
      const base = prefix + String(id).replace(/[^A-Za-z0-9_]/g, '_');
      let a = base, i = 2;
      while (used.has(a)) a = base + '_' + i++;
      used.add(a);
      return a;
    };
    const gAlias = {}, nAlias = {};
    groups.forEach(g => { gAlias[g.id] = alias('G_', g.id); });
    nodes.forEach(n => { nAlias[n.id] = alias('N_', n.id); });

    const gById = {};
    groups.forEach(g => { gById[g.id] = g; });
    // Padre válido (sin ciclos): si no, el grupo cuelga de la raíz
    const parentOf = g => {
      const p = g.parent;
      if (!p || !gById[p] || p === g.id) return null;
      let q = p, guard = 0;
      while (q && guard++ < 100) {
        if (q === g.id) return null;
        q = gById[q] && gById[q].parent;
      }
      return p;
    };
    const children = {}, rootGroups = [];
    groups.forEach(g => {
      const p = parentOf(g);
      if (p) (children[p] = children[p] || []).push(g); else rootGroups.push(g);
    });
    const nodesIn = {}, rootNodes = [];
    nodes.forEach(n => {
      if (n.group && gById[n.group]) (nodesIn[n.group] = nodesIn[n.group] || []).push(n); else rootNodes.push(n);
    });

    const dataShort = keys => (keys || []).map(k => clean(ctx.dataLabel(k).short));
    const dataSeen = new Map();
    const noteData = keys => (keys || []).forEach(k => { if (!dataSeen.has(k)) dataSeen.set(k, ctx.dataLabel(k)); });

    const nodeLine = (n, pad) => {
      const kw = KEYWORD[n.type] || 'component';
      const c = hexOf(ctx.color(n));
      let label = clean(n.label || n.id);
      if (n.badge) label += ' ' + clean(n.badge);
      if (n.review && n.review.status === 'open') label += ' ⚑';
      if (n.sub) label += '\\n<size:10>' + clean(n.sub) + '</size>';
      if (n.data && n.data.length) {
        noteData(n.data);
        label += '\\n<size:10>' + dataShort(n.data).join(' · ') + '</size>';
      }
      const st = clean(ctx.typeLabel(n.type)).replace(/[<>]/g, '');
      // El color del borde va sin # (PlantUML no acepta line:#hex)
      return `${pad}${kw} "${label}" as ${nAlias[n.id]} <<${st}>> ${mix(c, 0.55)};line:${c.replace('#', '')}`;
    };

    const out = [];
    const emitGroup = (g, pad, depth) => {
      if (depth > 50) return;
      const c = hexOf(ctx.color(g));
      const kw = groupKeyword(g.label);
      out.push(`${pad}${kw} "${clean(g.label || g.id)}" as ${gAlias[g.id]} <<group>> ${mix(c, 0.82)};line:${c.replace('#', '')};line.dashed {`);
      (children[g.id] || []).forEach(k => emitGroup(k, pad + '  ', depth + 1));
      (nodesIn[g.id] || []).forEach(n => out.push(nodeLine(n, pad + '  ')));
      out.push(`${pad}}`);
    };

    const title = clean(ctx.title || model.title || 'Diagram');
    out.push('@startuml');
    out.push("' Generated by Diagramon");
    out.push(`title ${title}`);
    if ((ctx.direction || model.direction) === 'LR') out.push('left to right direction');
    out.push('skinparam shadowing false');
    out.push('skinparam roundCorner 12');
    out.push('skinparam defaultFontName Helvetica');
    out.push('skinparam defaultFontSize 12');
    out.push('skinparam defaultFontColor #2B2540');
    out.push('skinparam ArrowColor #6B6485');
    out.push('skinparam ArrowFontSize 11');
    out.push('skinparam BackgroundColor #FFFFFF');
    out.push('skinparam ComponentStyle rectangle');
    out.push('skinparam stereotypeFontSize 9');
    out.push('skinparam stereotypeFontColor #6B6485');
    // Los grupos llevan <<group>> solo para poder darles estilo; no se muestra
    out.push('hide <<group>> stereotype');
    out.push('');

    rootGroups.forEach(g => emitGroup(g, '', 0));
    rootNodes.forEach(n => out.push(nodeLine(n, '')));
    if (edges.length) out.push('');

    const stylesUsed = new Set();
    edges.forEach(e => {
      if (!nAlias[e.from] || !nAlias[e.to]) return;
      const style = e.style || 'sync';
      stylesUsed.add(style);
      const base = hexOf(ctx.color(e));
      const c = style === 'optional' ? mix(base, 0.35) : base;
      let arrow;
      if (style === 'async') arrow = `.[${c}].>`;
      else if (style === 'data') arrow = `-[${c},bold]->`;
      else if (style === 'optional') arrow = `-[${c},dashed]->`;
      else arrow = `-[${c}]->`;
      const parts = [];
      if (e.label) parts.push(clean(e.label));
      if (e.encrypted === true) parts.push('🔒');
      else if (e.encrypted === false) parts.push('🔓');
      if (e.data && e.data.length) { noteData(e.data); parts.push(dataShort(e.data).join(' · ')); }
      out.push(`${nAlias[e.from]} ${arrow} ${nAlias[e.to]}${parts.length ? ' : ' + parts.join(' ') : ''}`);
    });

    // Leyenda: estilos de conexión usados y clases de datos presentes
    const legend = [];
    const sample = { sync: '-->', async: '..>', data: '==>', optional: '--->' };
    ['sync', 'async', 'data', 'optional'].filter(s => stylesUsed.has(s)).forEach(s => {
      legend.push(`| ""${sample[s]}"" | ${clean(ctx.edgeStyleLabel(s))} |`);
    });
    dataSeen.forEach(d => {
      legend.push(`| ${clean(d.short)}${d.sensitive ? ' ⚠' : ''} | ${clean(d.label)} |`);
    });
    if (nodes.some(n => n.review && n.review.status === 'open')) legend.push('| ⚑ | Open review |');
    if (legend.length) {
      out.push('');
      out.push('legend bottom');
      legend.forEach(l => out.push(l));
      out.push('endlegend');
    }
    out.push('@enduml');
    return { text: out.join('\n') + '\n', ext: 'puml', mime: 'text/plain' };
  };
})();
