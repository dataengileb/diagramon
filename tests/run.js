/* ==========================================================================
   Diagramon · pruebas automáticas (sin dependencias)
   --------------------------------------------------------------------------
   Prueban las partes que no necesitan navegador: textos (i18n), lenguaje de
   texto, plantillas, exportadores (Mermaid, PlantUML, draw.io, Excel),
   importación de infraestructura como código y funciones puras de src/app.js.

   Ejecutar desde la raíz del repositorio:
     node tests/run.js                        (CI: GitHub Actions)
     osascript -l JavaScript tests/run.js     (macOS sin Node)
   Sale con código 1 si alguna prueba falla.
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- entorno: Node o JavaScriptCore (osascript) ---------- */
  const isNode = typeof process !== 'undefined' && !!(process.versions && process.versions.node);
  let read, print, finish;
  if (isNode) {
    const fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
    read = p => fs.readFileSync(path.join(root, p), 'utf8');
    print = s => console.log(s);
    finish = ok => process.exit(ok ? 0 : 1);
  } else {
    ObjC.import('Foundation');
    const root = ObjC.unwrap($.NSFileManager.defaultManager.currentDirectoryPath);
    read = p => { const s = $.NSString.stringWithContentsOfFileEncodingError(`${root}/${p}`, 4, null); if (!s || s.isNil?.()) throw new Error(`cannot read ${p}`); return ObjC.unwrap(s); };
    const lines = [];
    print = s => lines.push(s);
    finish = ok => { const out = lines.join('\n'); if (!ok) throw new Error(`tests failed\n${out}`); return out; };
  }

  /* ---------- carga de los scripts de la app en un `window` simulado ---------- */
  const win = {};
  const storage = { getItem: () => null, setItem: () => {} };
  const doc = { documentElement: {}, querySelectorAll: () => [], querySelector: () => null };
  const load = p => new Function('window', 'localStorage', 'document', read(p))(win, storage, doc);
  ['src/config.js', 'src/i18n.js', 'assets/icons/aws.js', 'assets/icons/azure.js', 'assets/icons/gcp.js', 'assets/icons/sap.js', 'assets/icons/fabric.js', 'assets/icons/logos.js',
    'src/text-lang.js', 'src/examples.js', 'src/iac.js', 'src/export/mermaid.js', 'src/export/plantuml.js', 'src/export/drawio.js', 'src/export/xlsx.js'].forEach(load);
  const C = win.DIAGRAMON_CONFIG, TXT = win.DiagramonText, IAC = win.DiagramonIaC, EXP = win.DiagramonExport, XLSX = win.DiagramonXlsx;

  /* ---------- mini marco de pruebas ---------- */
  let pass = 0, fail = 0, group = '';
  const section = name => { group = name; print(`\n# ${name}`); };
  const test = (name, fn) => {
    try { fn(); pass++; print(`  ok   ${name}`); } catch (e) { fail++; print(`  FAIL ${name}\n       ${String(e && e.message || e).split('\n').join('\n       ')}`); }
  };
  const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assertion failed'); };
  const eq = (a, b, msg) => { const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) throw new Error(`${msg || 'not equal'}\n  got:      ${A.slice(0, 400)}\n  expected: ${B.slice(0, 400)}`); };
  const near = (a, b, eps, msg) => assert(Math.abs(a - b) <= eps, `${msg || 'not near'}: ${a} vs ${b}`);

  /* ---------- utilidades ---------- */
  const fold = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const isLoc = v => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length && Object.keys(v).every(k => k === 'en' || k === 'es');
  const deep = (v, l) => (isLoc(v) ? v[l] : Array.isArray(v) ? v.map(x => deep(x, l)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x, l)])) : v);
  const textCtx = lang => {
    const DL = C.dataLayers || {}, AL = C.layerAliases || {};
    return {
      icons: Object.fromEntries(Object.entries(win.DIAGRAMON_ICONS).flatMap(([p, set]) => Object.entries(set.items).map(([k, it]) => [`${p}/${k}`, it]))),
      types: Object.fromEntries(Object.entries(C.types).map(([k, t]) => [k.toLowerCase(), { ...t, label: deep(t.label, lang) }])),
      providers: Object.keys(win.DIAGRAMON_ICONS),
      dataClasses: Object.keys(C.dataClasses || {}),
      layers: Object.fromEntries([...Object.keys(DL), ...Object.keys(AL)].map(k => [fold(k), DL[k] ? k : AL[k]]).filter(([, v]) => v)),
      views: Object.keys(C.views || {}),
      lang
    };
  };
  const templates = lang => win.DIAGRAMON_EXAMPLES.map(ex => ({ name: deep(ex.name, lang), model: deep(ex.diagram, lang) }));
  const withPositions = m => { m = JSON.parse(JSON.stringify(m)); m.nodes.forEach((n, i) => { if (n.x == null) { n.x = 100 + (i % 6) * 240; n.y = 100 + Math.floor(i / 6) * 130; } }); m.edges.forEach((e, i) => { if (!e.id) e.id = `e${i + 1}`; }); m.groups = m.groups || []; m.notes = m.notes || []; m.zones = m.zones || []; return m; };
  // Contexto de exportación mínimo (el de la app añade metadatos y niveles; los exportadores toleran su ausencia)
  const exportCtx = m => {
    const byId = new Map(m.nodes.map(n => [n.id, n]));
    const box = gid => {
      const inG = n => { let g = n.group, k = 0; while (g && k++ < 50) { if (g === gid) return true; g = (m.groups.find(x => x.id === g) || {}).parent; } return false; };
      const ns = m.nodes.filter(inG); if (!ns.length) return null;
      const x0 = Math.min(...ns.map(n => n.x)) - 30, y0 = Math.min(...ns.map(n => n.y)) - 40, x1 = Math.max(...ns.map(n => n.x + 180)) + 30, y1 = Math.max(...ns.map(n => n.y + 56)) + 30;
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    };
    return {
      title: m.title, lang: 'en', direction: 'LR', routing: 'curved',
      typeLabel: t => String(t || 'generic'), edgeStyleLabel: s => String(s || 'sync'),
      color: () => '#8573DB', dataLabel: k => ({ short: String(k).toUpperCase(), label: String(k), sensitive: ['pii', 'pci', 'phi'].includes(k) }),
      icon: ref => { const [p, k] = String(ref).split('/'), set = win.DIAGRAMON_ICONS[p], it = set && set.items[k]; return it ? { src: set.files[it.file], label: it.label } : null; },
      size: () => ({ w: 180, h: 56 }), groupBox: box,
      meta: () => [], c4Label: k => String(k || ''), sevLabel: k => String(k), sevHex: () => '#E0965A', layerLabel: k => String(k), layerHex: () => '#d4a72c', noteHex: () => '#C4A63A',
      words: { note: 'Note', zone: 'Risk zone', trust: 'Trust boundary', threats: 'Threats', level: 'Level' },
      levels: m.nodes.filter(n => m.nodes.some(x => x.in === n.id)).map(n => ({ id: n.id, label: n.label, depth: 1, path: [n.id] }))
    };
  };
  // Comprobación ligera de XML bien formado: etiquetas equilibradas y comillas de atributos cerradas
  const xmlBalanced = xml => {
    const stack = [], re = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>|<\?[^>]*\?>|<!--[\s\S]*?-->/g;
    let m, last = 0;
    while ((m = re.exec(xml))) {
      const between = xml.slice(last, m.index); if (between.includes('<')) return `stray '<' near …${between.slice(between.indexOf('<'), between.indexOf('<') + 60)}`;
      last = re.lastIndex;
      if (!m[2]) continue;
      if (m[1]) { if (stack.pop() !== m[2]) return `unexpected </${m[2]}>`; } else if (!m[4]) stack.push(m[2]);
    }
    if (xml.slice(last).includes('<')) return 'trailing markup';
    return stack.length ? `unclosed <${stack[stack.length - 1]}>` : null;
  };

  /* ======================================================================
     1. Textos de la interfaz
     ====================================================================== */
  section('i18n');
  test('English and Spanish have the same keys and kinds', () => {
    const src = read('src/i18n.js'), i = src.indexOf('const DICT = {'), j = src.indexOf('\n  };', i);
    const DICT = new Function(`const C = { app: {} }; ${src.slice(i, j + 5)} return DICT;`)();
    const en = Object.keys(DICT.en), es = Object.keys(DICT.es);
    const miss = en.filter(k => !(k in DICT.es)), extra = es.filter(k => !(k in DICT.en));
    eq([miss, extra], [[], []], 'missing / extra keys in es');
    const kinds = en.filter(k => typeof DICT.en[k] !== typeof DICT.es[k]);
    eq(kinds, [], 'string vs function mismatch');
  });
  test('T() never resolves keys to Object.prototype members', () => {
    const T = win.DiagramonI18n.T;
    eq([T('toString'), T('constructor'), T('__proto__'), T('no.such.key')], ['toString', 'constructor', '__proto__', 'no.such.key']);
  });

  /* ======================================================================
     2. Lenguaje de texto (pestaña Texto)
     ====================================================================== */
  section('text format');
  ['en', 'es'].forEach(lang => templates(lang).forEach(({ name, model }) => {
    test(`round trip is stable · ${lang} · ${name}`, () => {
      const ctx = textCtx(lang), t1 = TXT.stringify(model, lang), r1 = TXT.parse(t1, ctx);
      eq(r1.errors, [], 'parse errors');
      const t2 = TXT.stringify({ ...r1.model, meta: model.meta }, lang);
      assert(t1 === t2, 'text changed after parse + stringify');
      eq(r1.model.nodes.length, model.nodes.length, 'node count');
      eq(r1.model.edges.length, model.edges.length, 'edge count');
      eq((r1.model.decisions || []).map(d => [d.id, d.status]), (model.decisions || []).map(d => [d.id, d.status]), 'decisions');
    });
  }));
  test('every documented line kind parses (notes, zones, trust, threat, dismiss, levels, types, weight)', () => {
    const src = [
      'title: Syntax check',
      'type backup: "Backup traffic" dash="2 4" color=coral width=3 particles=1',
      'web: Web [web]',
      'api: API [gateway] c4=system',
      'inside api {',
      '  svc: Service [compute]',
      '  note n2: "Inside the API" at=10,10 size=180,110',
      '}',
      'db: DB [db]',
      'web -> api : HTTPS weight=critical threats="T=mitigated"',
      'api => db : SQL style=backup',
      'svc -> db : reads style=replication weight=high',
      'note n1: "Two\\nlines" at=0,0 size=180,110 color=limon',
      'zone z1: "PCI scope" severity=high at=-40,-40 size=400,200',
      'trust t1: "DMZ" trust=internet at=0,0 size=300,200',
      'threat web -> api T: "TLS 1.3"',
      'dismiss "sec:x:y": "Accepted risk" by=Ana date=2026-10-01',
      'adr ADR-001: "Use an API" status=accepted date=2026-06-02 links=web,api',
      '  decision: "Expose a stateless API."'
    ].join('\n');
    const { model: m, errors } = TXT.parse(src, textCtx('en'));
    eq(errors, [], 'errors');
    eq(m.nodes.find(n => n.id === 'svc').in, 'api', 'inside block sets in=');
    eq([m.notes.length, m.zones.length], [2, 2], 'notes and zones');
    eq(m.edges.map(e => e.weight || 'normal'), ['critical', 'normal', 'high'], 'weights');
    eq(m.edges[0].threats.T, { status: 'mitigated', note: 'TLS 1.3' }, 'threat note');
    eq(m.edgeTypes.map(t => t.id), ['backup'], 'custom type');
    eq(Object.keys(m.dismissed), ['sec:x:y'], 'dismissed');
    eq(m.decisions.map(d => [d.id, d.status, d.decision]), [['ADR-001', 'accepted', 'Expose a stateless API.']], 'adr');
  });
  test('Spanish keywords parse to the same model', () => {
    const en = TXT.parse('a: A\nb: B\na -> b : x peso=crítico estilo=replicación', textCtx('es'));
    eq(en.errors, [], 'errors'); eq([en.model.edges[0].weight, en.model.edges[0].style], ['critical', 'replication']);
  });
  test('invalid values are reported, not silently accepted', () => {
    const { errors } = TXT.parse('a: A\nb: B\na -> b : x style=nope weight=huge\nzone z: "Z" severity=extreme', textCtx('en'));
    assert(errors.length >= 2, `expected at least 2 errors, got ${errors.length}`);
  });

  /* ======================================================================
     3. Exportadores
     ====================================================================== */
  section('exports');
  templates('en').forEach(({ name, model }) => {
    const m = withPositions(model), ctx = exportCtx(m);
    test(`Mermaid · ${name}`, () => {
      const t = EXP.mermaid(JSON.parse(JSON.stringify(m)), ctx).text, lines = t.split('\n').map(l => l.trim());
      assert(/^---/.test(t) && /\nflowchart (LR|TB)/.test(t), 'header');
      eq(lines.filter(l => /^subgraph\b/.test(l)).length, lines.filter(l => l === 'end').length, 'subgraph / end balance');
    });
    test(`PlantUML · ${name}`, () => {
      const t = EXP.plantuml(JSON.parse(JSON.stringify(m)), ctx).text;
      assert(t.includes('@startuml') && t.includes('@enduml'), 'start / end');
      const body = t.replace(/^\s*'.*$/gm, '').replace(/"[^"\n]*"/g, '""').replace(/\[\[[^\]]*\]\]/g, '');
      eq((body.match(/\{/g) || []).length, (body.match(/\}/g) || []).length, 'brace balance');
    });
    test(`draw.io · ${name}`, () => {
      const t = EXP.drawio(JSON.parse(JSON.stringify(m)), ctx).text;
      const bad = xmlBalanced(t); assert(!bad, `XML: ${bad}`);
      t.split('<diagram ').slice(1).forEach((page, i) => {
        const ids = [...page.matchAll(/ id="([^"]+)"/g)].map(x => x[1]).filter(id => !/^diagramon-/.test(id));
        const dup = ids.filter((id, k) => ids.indexOf(id) !== k); eq(dup, [], `duplicate ids on page ${i + 1}`);
        const set = new Set(ids), refs = [...page.matchAll(/ (parent|source|target)="([^"]+)"/g)].map(x => x[2]).filter(r => !set.has(r));
        eq(refs, [], `dangling references on page ${i + 1}`);
      });
    });
  });
  test('Excel writer produces a ZIP with the workbook parts', () => {
    const bytes = XLSX.bytes([{ name: 'Sheet', head: ['A', 'B'], rows: [['x <&>', 1], ['y', 2.5]] }], { title: 'T', creator: 'Diagramon' });
    eq([bytes[0], bytes[1]], [0x50, 0x4B], 'PK signature');
    const s = Array.from(bytes.slice(0, Math.min(bytes.length, 200000)), b => String.fromCharCode(b)).join('');
    ['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml'].forEach(p => assert(s.includes(p), `missing ${p}`));
    assert(s.includes('x &lt;&amp;&gt;'), 'cell text is XML-escaped');
  });

  /* ======================================================================
     4. Importación de infraestructura como código
     ====================================================================== */
  section('IaC import');
  // Recuentos de referencia de los ejemplos de samples/: si cambian a propósito, actualízalos aquí
  [['samples/aws-data-lake/terraform-show.json', 'terraform'], ['samples/aws-data-lake/cloudformation.yaml', 'cloudformation'],
    ['samples/kubernetes/shop.yaml', 'kubernetes'], ['samples/docker-compose/docker-compose.yml', 'compose'],
    ['samples/azure-web-shop/terraform-show.json', 'azure', { nodes: 12, edges: 13 }], ['samples/gcp-data-platform/terraform-show.json', 'gcp', { nodes: 15, edges: 14 }]].forEach(([file, kind, expect]) => {
    test(`${file}`, () => {
      const name = file.split('/').pop(), text = read(file);
      assert(IAC.detect(text, name), 'format not detected');
      const r = IAC.convert([{ name, text }]);
      assert(r.nodes > 0 && r.edges > 0, `empty result (${r.nodes} nodes, ${r.edges} edges)`);
      if (expect) eq({ nodes: r.nodes, edges: r.edges }, expect, 'counts');
      if (kind === 'azure') assert(r.diagram.groups.some(g => g.region === 'westeurope') && r.diagram.nodes.some(n => n.region === 'northeurope'), 'Azure regions');
      if (kind === 'gcp') assert(['EU', 'us-central1'].every(rg => r.diagram.nodes.some(n => n.region === rg)), 'GCP regions');
    });
  });

  /* ======================================================================
     5. Funciones puras de src/app.js
     ====================================================================== */
  section('app.js pure functions');
  const app = read('src/app.js');
  const between = (a, b) => { const i = app.indexOf(a), j = app.indexOf(b, i); assert(i >= 0 && j > i, `markers not found: ${a}`); return app.slice(i + a.length, j); };
  const routeReliability = new Function(`${between('/* routeReliability:start */', '/* routeReliability:end */')}; return routeReliability;`)();
  test('composite availability: single route = product', () => {
    const r = routeReliability(3, [[1], [2], []], 0, 2, [0.999, 0.99, 0.995]);
    near(r.value, 0.999 * 0.99 * 0.995, 1e-12); assert(r.exact, 'exact');
  });
  test('composite availability: two parallel branches', () => {
    const r = routeReliability(4, [[1, 2], [3], [3], []], 0, 3, [0.9999, 0.99, 0.99, 0.999]);
    near(r.value, 0.9999 * 0.999 * (1 - 0.01 * 0.01), 1e-12);
  });
  test('composite availability: bridge network matches the closed form', () => {
    // s → a, b; a → b, t; b → t  (a, b with 0.9; ends perfect)
    const q = 0.9, r = routeReliability(4, [[1, 2], [2, 3], [3], []], 0, 3, [1, q, q, 1]);
    near(r.value, 1 - (1 - q) * (1 - q), 1e-12);
  });
  test('composite availability: no route returns null', () => { eq(routeReliability(3, [[1], [], []], 0, 2, [1, 1, 1]), null); });
  test('composite availability: dense mesh stays fast and gives a lower bound', () => {
    const k = 7, n = k * k, succ = Array.from({ length: n }, (_, i) => { const r = Math.floor(i / k), c = i % k, o = []; if (c + 1 < k) o.push(i + 1); if (r + 1 < k) o.push(i + k); if (c > 0) o.push(i - 1); if (r > 0) o.push(i - k); return o; });
    const t0 = Date.now(), r = routeReliability(n, succ, 0, n - 1, Array(n).fill(0.99));
    assert(r && r.value > 0.9 && r.value <= 1, `value ${r && r.value}`); assert(Date.now() - t0 < 5000, 'too slow');
  });
  const SAFE_COLOR = new Function(`${app.match(/const SAFE_COLOR = [^\n]+;/)[0]} return SAFE_COLOR;`)();
  test('color sanitizer accepts hex, names and CSS variables only', () => {
    eq(['#fff', '#A1B2C3', 'coral', 'var(--layer-gold, #d4a72c)', 'var(--p-menta)'].map(c => SAFE_COLOR.test(c)), [true, true, true, true, true], 'accepted');
    eq(['red;background:url(x)', 'url(x)', 'expression(alert(1))', '"><img>', 'var(--x);color:red'].map(c => SAFE_COLOR.test(c)), [false, false, false, false, false], 'rejected');
  });

  /* ---------- resumen ---------- */
  print(`\n${pass} passed, ${fail} failed`);
  return finish(fail === 0);
})();
