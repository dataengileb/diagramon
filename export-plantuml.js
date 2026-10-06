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
   - Niveles C4: un nodo con diagrama interno pasa a ser un contenedor
     (`rectangle "Sistema" as N_x <<system>> … { … }`) con sus nodos, grupos,
     notas y zonas, anidado a cualquier profundidad. Si su tipo no admite
     contenido (database, actor, queue, storage, collections, boundary) se usa
     rectangle. Las aristas conservan sus extremos: apuntan al alias del
     contenedor (PlantUML admite flechas a contenedores). El estereotipo es el
     tipo C4 (ctx.c4Label).
   - Notas: `note "texto" as N_<id> #hex` (una línea) o `note as N_<id> #hex`
     … `end note` (varias), en el contenedor de su nivel.
   - Zonas de riesgo y límites de confianza: PlantUML no puede solapar
     contenedores, así que cada zona es una nota (color ctx.sevHex; gris
     neutro para límites de confianza) con etiqueta, severidad o nivel de
     confianza, descripción y miembros (geométrico: caja del nodo en su mayor
     parte dentro del rectángulo, mismo nivel). Los miembros también cambian
     el borde: `line:<hex de la severidad>;line.bold` (zona) y/o `line.dashed`
     (límite de confianza); son atributos válidos en rectangle/component/node/
     cloud/database/etc. Sin zonas ni límites no cambia nada.
   - Metadatos: líneas de comentario `' meta <alias>: etiqueta=valor; …`
     (ctx.meta) para nodos, grupos y aristas; nunca en las etiquetas visibles.
   - Diagramas sin niveles, notas, zonas ni metadatos: salida idéntica a la anterior.
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

  // Elementos PlantUML que admiten contenido { … }
  const CONTAINER_OK = new Set(['node', 'component', 'rectangle', 'cloud', 'package', 'frame']);
  const oneLine = s => String(s == null ? '' : s).replace(/\s*[\r\n]+\s*/g, ' ').trim();

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

    // Niveles C4: `in` válido (nodo existente, sin ciclos) o '' = nivel superior
    const nById = {};
    nodes.forEach(n => { nById[n.id] = n; });
    const scopeOf = (x, isNode) => {
      let cur = x.in;
      if (!cur) return '';
      for (let i = 0; i < 60; i++) {
        if (!nById[cur] || (isNode && cur === x.id)) return '';
        const nx = nById[cur].in;
        if (!nx) return x.in;
        cur = nx;
      }
      return '';
    };
    const sc = new Map();
    const scopeFor = (x, isNode) => { if (!sc.has(x)) sc.set(x, scopeOf(x, isNode)); return sc.get(x); };
    const rootGroupsAt = {}, rootNodesAt = {}, notesAt = {}, zonesAt = {};
    const push = (m, k, v) => { (m[k] = m[k] || []).push(v); };
    rootGroups.forEach(g => push(rootGroupsAt, scopeFor(g, false), g));
    rootNodes.forEach(n => push(rootNodesAt, scopeFor(n, true), n));
    const notes = model.notes || [], zones = model.zones || [];
    notes.forEach(t => push(notesAt, scopeFor(t, false), t));
    zones.forEach(z => push(zonesAt, scopeFor(z, false), z));
    const expanded = new Set();
    [nodes, groups, notes, zones].forEach((arr, i) => arr.forEach(x => { const k = scopeFor(x, i === 0); if (k) expanded.add(k); }));

    // Zonas y límites de confianza: miembros por geometría (caja del nodo mayormente dentro, mismo nivel)
    const zoneMembers = new Map(), tint = {};
    zones.forEach(z => {
      const zs = scopeFor(z, false), zx = +z.x || 0, zy = +z.y || 0, zw = +z.w || 0, zh = +z.h || 0;
      const mem = nodes.filter(n => {
        if (scopeFor(n, true) !== zs) return false;
        const sz = (typeof ctx.size === 'function' && ctx.size(n)) || { w: 180, h: 56 };
        const nx = +n.x || 0, ny = +n.y || 0;
        const ow = Math.min(nx + sz.w, zx + zw) - Math.max(nx, zx), oh = Math.min(ny + sz.h, zy + zh) - Math.max(ny, zy);
        return ow > 0 && oh > 0 && ow * oh >= 0.5 * sz.w * sz.h;
      });
      zoneMembers.set(z, mem);
      const trust = z.kind === 'trust';
      const hex = trust ? '#6B6485' : hexOf(typeof ctx.sevHex === 'function' ? ctx.sevHex(z.severity) : '#C4A63A');
      mem.forEach(n => {
        const t = tint[n.id] = tint[n.id] || { color: null, bold: false, dashed: false };
        if (trust) t.dashed = true; else { t.bold = true; if (!t.color) t.color = hex; }
      });
    });

    const dataShort = keys => (keys || []).map(k => clean(ctx.dataLabel(k).short));
    const dataSeen = new Map();
    const noteData = keys => (keys || []).forEach(k => { if (!dataSeen.has(k)) dataSeen.set(k, ctx.dataLabel(k)); });

    const nodeLine = (n, pad, open) => {
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
      let st = clean(ctx.typeLabel(n.type)).replace(/[<>]/g, '');
      let kw2 = kw;
      if (open) {
        // Nodo con diagrama interno: contenedor (estereotipo = tipo C4 si lo hay)
        if (!CONTAINER_OK.has(kw)) kw2 = 'rectangle';
        if (n.c4 && typeof ctx.c4Label === 'function') st = clean(ctx.c4Label(n.c4)).replace(/[<>]/g, '') || st;
      }
      const t = tint[n.id];
      const lc = (t && t.color ? t.color : c).replace('#', '');
      // El color del borde va sin # (PlantUML no acepta line:#hex)
      return `${pad}${kw2} "${label}" as ${nAlias[n.id]} <<${st}>> ${mix(c, 0.55)};line:${lc}${t && t.bold ? ';line.bold' : ''}${t && t.dashed ? ';line.dashed' : ''}${open ? ' {' : ''}`;
    };
    const noteBody = text => String(text == null ? '' : text).split(/\r?\n/).map(l => {
      l = l.replace(/\\/g, '/');
      return /^\s*(end\s*note|@end)/i.test(l) ? '~' + l : l;
    });
    const emitNote = (pad, al, hex, lines) => {
      lines = lines.filter((l, i) => l.trim() || i < lines.length - 1);
      if (lines.length === 1 && !/^\s*(end\s*note|@end)/i.test(lines[0])) out.push(`${pad}note "${clean(lines[0])}" as ${al} ${hex}`);
      else { out.push(`${pad}note as ${al} ${hex}`); lines.forEach(l => out.push(`${pad}  ${l}`)); out.push(`${pad}end note`); }
    };
    const emitNode = (n, pad, depth) => {
      if (depth <= 50 && expanded.has(n.id)) {
        out.push(nodeLine(n, pad, true));
        emitScope(n.id, pad + '  ', depth + 1);
        out.push(`${pad}}`);
      } else out.push(nodeLine(n, pad));
    };
    const emitScope = (key, pad, depth) => {
      (rootGroupsAt[key] || []).forEach(g => emitGroup(g, pad, depth));
      (rootNodesAt[key] || []).forEach(n => emitNode(n, pad, depth));
      (notesAt[key] || []).forEach(t => emitNote(pad, noteAlias.get(t), hexOf(typeof ctx.noteHex === 'function' ? ctx.noteHex(t.color) : '#C4A63A'), noteBody(t.text)));
      (zonesAt[key] || []).forEach(z => {
        const trust = z.kind === 'trust';
        const hex = trust ? '#E6E3EE' : mix(hexOf(typeof ctx.sevHex === 'function' ? ctx.sevHex(z.severity) : '#C4A63A'), 0.6);
        const w = ctx.words || {};
        const lines = [`<b>${trust ? (w.trust || 'Trust boundary') : (w.zone || 'Risk zone')}: ${clean(z.label || z.id)}</b>`];
        if (trust) { if (z.trust) lines.push(`${clean(z.trust)}`); }
        else lines.push(typeof ctx.sevLabel === 'function' ? clean(ctx.sevLabel(z.severity)) : clean(z.severity));
        if (z.desc) noteBody(z.desc).forEach(l => lines.push(l));
        const mem = zoneMembers.get(z) || [];
        if (mem.length) lines.push(mem.map(n => clean(n.label || n.id)).join(', '));
        emitNote(pad, zoneAlias.get(z), hex, lines);
      });
    };
    const noteAlias = new Map(), zoneAlias = new Map();
    notes.forEach(t => noteAlias.set(t, alias('N_', t.id)));
    zones.forEach(z => zoneAlias.set(z, alias('Z_', z.id)));

    const out = [];
    const emitGroup = (g, pad, depth) => {
      if (depth > 50) return;
      const c = hexOf(ctx.color(g));
      const kw = groupKeyword(g.label);
      out.push(`${pad}${kw} "${clean(g.label || g.id)}" as ${gAlias[g.id]} <<group>> ${mix(c, 0.82)};line:${c.replace('#', '')};line.dashed {`);
      (children[g.id] || []).forEach(k => emitGroup(k, pad + '  ', depth + 1));
      (nodesIn[g.id] || []).forEach(n => emitNode(n, pad + '  ', depth + 1));
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

    emitScope('', '', 0);
    if (edges.length) out.push('');

    const stylesUsed = new Set();
    edges.forEach(e => {
      if (!nAlias[e.from] || !nAlias[e.to]) return;
      const style = e.style || 'sync';
      stylesUsed.add(style);
      const base = hexOf(ctx.color(e));
      const c = style === 'optional' ? mix(base, 0.35) : base;
      let arrow;
      const two = e.both === true ? '<' : '';
      if (style === 'async') arrow = `${two}.[${c}].>`;
      else if (style === 'data') arrow = `${two}-[${c},bold]->`;
      else if (style === 'optional') arrow = `${two}-[${c},dashed]->`;
      else arrow = `${two}-[${c}]->`;
      const parts = [];
      if (e.label) parts.push(String(e.label).split('\n').map(clean).join('\\n'));
      if (e.encrypted === true) parts.push('🔒');
      else if (e.encrypted === false) parts.push('🔓');
      if (e.data && e.data.length) { noteData(e.data); parts.push(dataShort(e.data).join(' · ')); }
      out.push(`${nAlias[e.from]} ${arrow} ${nAlias[e.to]}${parts.length ? ' : ' + parts.join(' ') : ''}`);
    });

    // Metadatos: comentarios `' meta …` (nunca en las etiquetas visibles)
    if (typeof ctx.meta === 'function') {
      const rows = [];
      const mline = (who, x) => {
        const m = (ctx.meta(x) || []).filter(r => r && r.value !== '' && r.value != null);
        if (m.length) rows.push(`' meta ${who}: ${m.map(r => oneLine(r.label || r.key) + '=' + oneLine(r.value)).join('; ')}`);
      };
      groups.forEach(g => mline(gAlias[g.id], g));
      nodes.forEach(n => mline(nAlias[n.id], n));
      edges.forEach(e => { if (nAlias[e.from] && nAlias[e.to]) mline(`edge ${oneLine(e.id)} (${nAlias[e.from]} -> ${nAlias[e.to]})`, e); });
      if (rows.length) { out.push(''); out.push("' Metadata"); rows.forEach(r => out.push(r)); }
    }

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
