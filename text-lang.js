/* ==========================================================================
   Diagramon · lenguaje de texto (diagrama como código)
   --------------------------------------------------------------------------
   Convierte texto en un diagrama y un diagrama en texto. Sin IA, sin red.

     título: Tienda online
     dirección: LR                      (LR = izquierda→derecha, TB = arriba→abajo)

     grupo aws "AWS" color=melocoton {
       api: API Gateway [aws/apigateway] "REST"
       db: RDS Postgres [rds] "Multi-AZ" badge=x2
     }
     usuarios: Usuarios [user] desc="Clientes web"

     usuarios -> api : HTTPS            (-> petición)
     api -> db : SQL                    (=> datos, ~> evento, ..> opcional)
     api ~> cola : eventos              (un nodo no declarado se crea solo)

   Nodo:     id: Nombre [tipo o icono] "detalle" color=… badge=… costo=120/mes desc="…"
             costo: número en USD + /hora, /mes, /año o /3años (sin periodo = mensual)
   Grupo:    grupo id "Nombre" color=… { … }   (se pueden anidar)
   Conexión: a -> b -> c : etiqueta color=…   (la etiqueta va en la última flecha)
   Comentario: líneas que empiezan por # o //

   Acepta las palabras clave en inglés y en español (title/título, group/grupo,
   cost/costo, /month/mes…). stringify(m, 'en') escribe en inglés y
   stringify(m, 'es') en español. Los errores salen en el idioma de ctx.lang.
   ========================================================================== */
(() => {
  'use strict';

  const ARROWS = { '->': 'sync', '~>': 'async', '=>': 'data', '..>': 'optional' };
  const ARROW_OF = { sync: '->', async: '~>', data: '=>', optional: '..>' };
  const ARROW_SPLIT = /\s*(\.\.>|~>|=>|->)\s*/;
  const HAS_ARROW = /\.\.>|~>|=>|->/;
  const ID = /^[^\s:[\]"{}]+$/;
  const NODE_KEYS = ['color', 'badge', 'desc', 'sub', 'x', 'y', 'costo', 'cost'];

  // Palabras que escribe stringify y mensajes de error, por idioma
  const WORDS = {
    en: { title: 'title', direction: 'direction', group: 'group', cost: 'cost', hour: 'hour', month: 'month', year: 'year', years: 'years' },
    es: { title: 'título', direction: 'dirección', group: 'grupo', cost: 'costo', hour: 'hora', month: 'mes', year: 'año', years: 'años' }
  };
  const MSG = {
    en: {
      icon: r => `unknown icon “${r}”`, kind: r => `unknown type or icon “${r}”`, dir: 'direction must be LR or TB',
      brace: 'extra closing brace }', groupId: id => `invalid group id “${id}”`, groupDup: id => `group “${id}” already exists`,
      edge: 'incomplete connection', id: id => `invalid id “${id || '(empty)'}”`,
      cost: v => `invalid cost “${v}” (e.g. 120/month, 0.1/hour, 1400/year, 5000/3years)`,
      line: 'cannot understand this line', open: n => `missing } to close ${n === 1 ? 'a group' : `${n} groups`}`
    },
    es: {
      icon: r => `icono desconocido «${r}»`, kind: r => `tipo o icono desconocido «${r}»`, dir: 'la dirección debe ser LR o TB',
      brace: 'sobra una llave }', groupId: id => `id de grupo no válido «${id}»`, groupDup: id => `el grupo «${id}» ya existe`,
      edge: 'conexión incompleta', id: id => `id no válido «${id || '(vacío)'}»`,
      cost: v => `costo no válido «${v}» (ej.: 120/mes, 0.1/hora, 1400/año, 5000/3años)`,
      line: 'no se entiende esta línea', open: n => `falta cerrar ${n === 1 ? 'un grupo' : `${n} grupos`} con }`
    }
  };

  // costo=120/mes · 0.1/hora · 1400/año · 5000/3años (sin periodo = mensual)
  // cost=120/month · 0.1/hour · 1400/year · 5000/3years
  function parseCost(v) {
    const m = String(v).trim().replace(/^\$/, '').match(/^(\d[\d,]*(?:\.\d+)?|\.\d+)(?:\s*\/\s*(.+))?$/);
    if (!m) return null;
    const cost = +m[1].replace(/,/g, ''), p = (m[2] || 'mes').toLowerCase();
    let y;
    if (/^(h|hr|hrs|hora|horas|hours?|hourly)$/.test(p)) return { cost, costPeriod: 'hour' };
    if (/^(m|mo|mes|meses|months?|mensual|monthly)$/.test(p)) return { cost };
    if (/^(a|año|ano|y|yr|year|anual|annual|yearly)$/.test(p)) return { cost, costPeriod: 'year' };
    if ((y = p.match(/^(\d+)\s*(a|años|anos|año|ano|y|yrs?|years?)$/))) return { cost, costPeriod: 'multi', costYears: Math.max(1, +y[1]) };
    return null;
  }
  const costValue = (n, w) => `${+n.cost}/${n.costPeriod === 'multi' ? `${n.costYears || 3}${w.years}` : w[n.costPeriod] || w.month}`;

  const quote = s => JSON.stringify(String(s));
  const bare = v => (/[\s"[\]{}]/.test(String(v)) || String(v) === '' ? quote(v) : String(v));
  const unquote = s => { try { return JSON.parse(s); } catch { return s.slice(1, -1); } };

  // Divide el resto de una línea en etiqueta, [tipo], "detalle" y clave=valor
  function tokens(rest, keys) {
    const out = { words: [], brackets: [], quotes: [], kv: {} };
    const re = /\[([^\]]*)\]|("(?:[^"\\]|\\.)*")|([A-Za-z]+)=("(?:[^"\\]|\\.)*"|\S+)|(\S+)/g;
    let m;
    while ((m = re.exec(rest))) {
      if (m[1] != null) out.brackets.push(m[1].trim());
      else if (m[2] != null) out.quotes.push(unquote(m[2]));
      else if (m[3] != null && keys.includes(m[3].toLowerCase())) out.kv[m[3].toLowerCase()] = m[4].startsWith('"') ? unquote(m[4]) : m[4];
      else out.words.push(m[0]);
    }
    return out;
  }

  // [lambda], [aws/lambda] o [db]: tipo propio, icono oficial o error
  function resolveKind(raw, ctx, msg) {
    const t = raw.trim().toLowerCase();
    if (!t) return {};
    if (t.includes('/')) return ctx.icons[t] ? { icon: t, type: ctx.icons[t].type } : { error: msg.icon(raw) };
    if (ctx.types[t]) return { type: t };
    for (const p of ctx.providers) {
      const ref = `${p}/${t}`;
      if (ctx.icons[ref]) return { icon: ref, type: ctx.icons[ref].type };
    }
    return { error: msg.kind(raw) };
  }

  function parse(src, ctx) {
    const msg = MSG[ctx.lang] || MSG.en;
    const model = { title: ctx.lang === 'es' ? 'Diagrama sin título' : 'Untitled diagram', groups: [], nodes: [], edges: [] };
    const errors = [];
    const nodes = new Map(), groups = new Set(), stack = [];
    const err = (line, msg) => errors.push({ line, msg });

    const nodeFor = id => {
      if (!nodes.has(id)) {
        const n = { id, label: id, type: 'generic' };
        nodes.set(id, n);
        model.nodes.push(n);
      }
      return nodes.get(id);
    };

    String(src).split(/\r?\n/).forEach((rawLine, i) => {
      const ln = i + 1, line = rawLine.trim();
      if (!line || line.startsWith('#') || line.startsWith('//')) return;

      let m;
      if ((m = line.match(/^(t[ií]tulo|title)\s*:\s*(.*)$/i))) { model.title = m[2].trim() || model.title; return; }
      if ((m = line.match(/^(direcci[oó]n|direction)\s*:\s*(\S+)\s*$/i))) {
        const d = m[2].toUpperCase();
        if (d === 'LR' || d === 'TB') model.direction = d; else err(ln, msg.dir);
        return;
      }
      if (line === '}') { if (stack.length) stack.pop(); else err(ln, msg.brace); return; }
      if ((m = line.match(/^(grupo|group)\s+([^\s:{]+)\s*:?\s*(.*?)\s*\{\s*$/i))) {
        const id = m[2];
        if (!ID.test(id)) return err(ln, msg.groupId(id));
        if (groups.has(id)) return err(ln, msg.groupDup(id));
        const tk = tokens(m[3], ['color']);
        const g = { id, label: tk.quotes[0] ?? (tk.words.join(' ') || id) };
        if (tk.kv.color) g.color = tk.kv.color;
        if (stack.length) g.parent = stack[stack.length - 1];
        groups.add(id);
        model.groups.push(g);
        stack.push(id);
        return;
      }

      const colon = line.indexOf(':');
      const left = colon < 0 ? line : line.slice(0, colon);
      const right = colon < 0 ? '' : line.slice(colon + 1).trim();

      if (HAS_ARROW.test(left)) {
        const parts = left.split(ARROW_SPLIT).map(s => s.trim());
        if (parts.length < 3 || parts.length % 2 === 0) return err(ln, msg.edge);
        for (let k = 0; k < parts.length; k += 2) if (!ID.test(parts[k])) return err(ln, msg.id(parts[k]));
        let label = right, color;
        const cm = label.match(/(?:^|\s)color=(\S+)\s*$/);
        if (cm) { color = cm[1]; label = label.slice(0, cm.index).trim(); }
        if (/^".*"$/.test(label)) label = unquote(label);
        for (let k = 0; k + 2 < parts.length; k += 2) {
          nodeFor(parts[k]); nodeFor(parts[k + 2]);
          const e = { from: parts[k], to: parts[k + 2] };
          const style = ARROWS[parts[k + 1]];
          if (style !== 'sync') e.style = style;
          if (k + 3 === parts.length && label) e.label = label;
          if (color) e.color = color;
          model.edges.push(e);
        }
        return;
      }

      if (colon > 0 && ID.test(left.trim())) {
        const n = nodeFor(left.trim());
        const tk = tokens(right, NODE_KEYS);
        if (tk.brackets.length) {
          const kind = resolveKind(tk.brackets[0], ctx, msg);
          if (kind.error) err(ln, kind.error);
          if (kind.type) n.type = kind.type;
          if (kind.icon) n.icon = kind.icon;
        }
        const label = tk.words.join(' ');
        n.label = label || (n.icon && ctx.icons[n.icon].label) || (n.type !== 'generic' && ctx.types[n.type]?.label) || n.id;
        const sub = tk.kv.sub ?? tk.quotes[0];
        if (sub) n.sub = sub;
        ['color', 'badge', 'desc'].forEach(k => { if (tk.kv[k] != null) n[k] = tk.kv[k]; });
        ['x', 'y'].forEach(k => { if (tk.kv[k] != null && Number.isFinite(+tk.kv[k])) n[k] = +tk.kv[k]; });
        const cv = tk.kv.costo ?? tk.kv.cost;
        if (cv != null) { const c = parseCost(cv); if (c) Object.assign(n, c); else err(ln, msg.cost(cv)); }
        if (stack.length) n.group = stack[stack.length - 1];
        return;
      }

      err(ln, msg.line);
    });
    if (stack.length) err(String(src).split(/\r?\n/).length, msg.open(stack.length));
    return { model, errors };
  }

  function stringify(m, lang = 'en') {
    const w = WORDS[lang] || WORDS.en;
    const out = [`${w.title}: ${m.title}`];
    if (m.direction) out.push(`${w.direction}: ${m.direction}`);
    out.push('');
    const nodeLine = n => {
      const p = [`${n.id}: ${n.label}`];
      if (n.icon) p.push(`[${n.icon}]`); else if (n.type && n.type !== 'generic') p.push(`[${n.type}]`);
      if (n.sub) p.push(quote(n.sub));
      if (n.badge != null && n.badge !== '') p.push(`badge=${bare(n.badge)}`);
      if (n.color) p.push(`color=${bare(n.color)}`);
      if (n.cost != null && n.cost !== '' && Number.isFinite(+n.cost)) p.push(`${w.cost}=${costValue(n, w)}`);
      if (n.desc) p.push(`desc=${quote(n.desc)}`);
      return p.join(' ');
    };
    const groupIds = new Set(m.groups.map(g => g.id));
    const writeGroup = (g, ind) => {
      out.push(`${ind}${w.group} ${g.id} ${quote(g.label)}${g.color ? ` color=${bare(g.color)}` : ''} {`);
      m.nodes.filter(n => n.group === g.id).forEach(n => out.push(`${ind}  ${nodeLine(n)}`));
      m.groups.filter(c => c.parent === g.id).forEach(c => writeGroup(c, ind + '  '));
      out.push(`${ind}}`);
    };
    m.groups.filter(g => !g.parent || !groupIds.has(g.parent)).forEach(g => writeGroup(g, ''));
    m.nodes.filter(n => !n.group || !groupIds.has(n.group)).forEach(n => out.push(nodeLine(n)));
    if (m.edges.length) out.push('');
    m.edges.forEach(e => {
      const arrow = ARROW_OF[e.style] || '->';
      const tail = [e.label ? (/(?:^|\s)color=\S+\s*$|^".*"$/.test(e.label) ? quote(e.label) : e.label) : '', e.color ? `color=${bare(e.color)}` : ''].filter(Boolean).join(' ');
      out.push(`${e.from} ${arrow} ${e.to}${tail ? ` : ${tail}` : ''}`);
    });
    return out.join('\n') + '\n';
  }

  window.DiagramonText = { parse, stringify };
})();
