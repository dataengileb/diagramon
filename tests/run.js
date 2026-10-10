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
  // src/adr-kits.js puede faltar (kits de decisiones opcionales): solo ese archivo se carga con tolerancia
  const load = p => { try { new Function('window', 'localStorage', 'document', read(p))(win, storage, doc); } catch (e) { if (p !== 'src/adr-kits.js') throw e; } };
  ['src/config.js', 'src/i18n.js', 'assets/icons/aws.js', 'assets/icons/azure.js', 'assets/icons/gcp.js', 'assets/icons/sap.js', 'assets/icons/fabric.js', 'assets/icons/logos.js',
    'src/text-lang.js', 'src/adr-kits.js', 'src/examples.js', 'src/iac.js', 'src/dbt.js', 'src/workspace.js', 'src/export/mermaid.js', 'src/export/plantuml.js', 'src/export/datacontract.js', 'src/export/drawio.js', 'src/export/xlsx.js'].forEach(load);
  const C = win.DIAGRAMON_CONFIG, TXT = win.DiagramonText, IAC = win.DiagramonIaC, EXP = win.DiagramonExport, XLSX = win.DiagramonXlsx, DC = win.DiagramonContract;

  /* ---------- mini marco de pruebas ---------- */
  let pass = 0, fail = 0, group = '';
  const section = name => { group = name; print(`\n# ${name}`); };
  const test = (name, fn) => {
    try { fn(); pass++; print(`  ok   ${name}`); } catch (e) { fail++; print(`  FAIL ${name}\n       ${String(e && e.message || e).split('\n').join('\n       ')}`); }
  };
  // Pruebas con promesas (Web Crypto): se ejecutan al final, solo en Node (osascript no espera promesas)
  const later = [];
  const testAsync = (name, fn) => { if (isNode) later.push([name, fn]); };
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
  test('lakehouse starter template keeps its node and edge counts', () => {
    const m = templates('en').find(x => /Lakehouse greenfield/.test(x.name)).model;
    eq({ nodes: m.nodes.length, edges: m.edges.length }, { nodes: 24, edges: 25 }, 'counts');
  });
  test('lakehouse greenfield template has three ordered phases, and every phase field points to one of them', () => {
    const m = templates('en').find(x => /Lakehouse greenfield/.test(x.name)).model;
    const es = templates('es').find(x => /Lakehouse greenfield/.test(x.name)).model;
    eq(m.phases.map(p => p.id), ['mvp', 'wave1', 'wave2'], 'phases in timeline order');
    assert(m.phases.every(p => p.name && p.goal && p.date), 'every phase has name, date and goal');
    assert(es.phases.every(p => p.name && p.goal && p.goal !== m.phases.find(x => x.id === p.id).goal), 'goals are translated');
    const idx = id => m.phases.findIndex(p => p.id === id);
    m.nodes.concat(m.edges, m.groups || []).forEach(el => {
      if (el.phase) assert(idx(el.phase) >= 0, `${el.id || el.from} phase ${el.phase} exists`);
      if (el.until) assert(idx(el.until) > (el.phase ? idx(el.phase) : -1), `${el.id || el.from} until ${el.until} comes after its phase`);
    });
    m.phases.forEach(p => assert(m.nodes.some(n => n.phase === p.id), `at least one node appears in ${p.id}`));
  });
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


  /* ======================================================================
     6. Decisiones (ADR): opciones, criterios y puntuación
     ====================================================================== */
  section('ADR options');
  const adrSrc = between('/* adrModel:start */', '/* adrModel:end */');
  const apprSrc = between('/* approvalModel:start */', '/* approvalModel:end */');   // cleanDecisions llama a cleanSignoffs
  const ADRM = new Function('isDay', 'today', `${apprSrc}; ${adrSrc}; return { adrScore, adrFull, adrLeader, cleanDecisions };`)(v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v), () => '2026-01-01');
  const adrModel = { nodes: [{ id: 'a' }], edges: [], groups: [], versions: [{ id: 'v2' }] };
  const adrDec = () => ({
    id: 'ADR-001', title: 'Open table format', status: 'proposed', date: '2026-10-07', context: 'c', decision: '', consequences: '', area: 'Storage',
    criteria: [{ id: 'cost', label: 'Cost', weight: 3 }, { id: 'skills', label: 'Skills', weight: 4 }],
    options: [{ id: 'A', title: 'Delta Lake', summary: 'S', pros: '• x\n• y', cons: '• z', cost: 0, risk: 'low', version: 'v2', scores: { cost: 4, skills: 5 } },
      { id: 'B', title: 'Iceberg', scores: { cost: 5, skills: 2 } }, { id: 'C', title: 'Hudi', scores: { cost: 5 } }], chosen: 'A', links: {}
  });
  test('adrScore: weighted percentage over the scored criteria', () => {
    const d = adrDec();
    eq(ADRM.adrScore(d, d.options[0]), { pct: Math.round(100 * (3 * 4 + 4 * 5) / (7 * 5)), scored: 2, total: 2 }, 'full');
    eq(ADRM.adrScore(d, d.options[2]), { pct: 100, scored: 1, total: 2 }, 'partial counts only what is scored');
    eq(ADRM.adrScore(d, { id: 'X' }), { pct: 0, scored: 0, total: 2 }, 'no scores');
    eq(ADRM.adrScore({ criteria: [] }, { scores: { cost: 3 } }), { pct: 0, scored: 0, total: 0 }, 'no criteria');
  });
  test('adrLeader: highest fully-scored option, ties go to the first, partial ones never lead', () => {
    const d = adrDec();
    eq(ADRM.adrLeader(d), 'A', 'A=91 B=69; C is partial');
    d.options[1].scores = { cost: 5, skills: 5 };
    d.options[0].scores = { cost: 5, skills: 5 };
    eq(ADRM.adrLeader(d), 'A', 'tie');
    d.options.forEach(o => { o.scores = {}; });
    eq(ADRM.adrLeader(d), '', 'nobody fully scored');
  });
  test('cleanDecisions keeps valid options, criteria and chosen, in canonical key order', () => {
    const r = ADRM.cleanDecisions([adrDec()], adrModel)[0];
    eq(Object.keys(r), ['id', 'title', 'status', 'date', 'context', 'decision', 'consequences', 'area', 'criteria', 'options', 'chosen', 'links'], 'decision keys');
    eq(Object.keys(r.options[0]), ['id', 'title', 'summary', 'pros', 'cons', 'cost', 'risk', 'version', 'scores'], 'option keys');
    eq(r.options[2].scores, { cost: 5 }, 'partial scores kept'); eq(r.chosen, 'A', 'chosen');
  });
  test('cleanDecisions drops invalid fields', () => {
    const d = adrDec();
    d.criteria.push({ id: 'Bad ID', label: 'x' }, { id: 'cost', label: 'dup' }, { id: 'w', label: 'W', weight: 9 }, { id: 'z', label: 'Z', weight: 'x' });
    d.options[0].risk = 'extreme'; d.options[0].version = 'nope'; d.options[0].cost = -5; d.options[1].scores = { cost: 9, skills: 3.5, ghost: 2 };
    d.options.push({ id: 'A', title: 'dup' }, { id: 'bad id', title: 'x' }); d.chosen = 'Q';
    const r = ADRM.cleanDecisions([d], adrModel)[0];
    eq(r.criteria.map(c => [c.id, c.weight]), [['cost', 3], ['skills', 4], ['w', 5], ['z', 3]], 'criteria');
    eq(r.options.map(o => o.id), ['A', 'B', 'C'], 'options'); eq(r.options[0].risk, undefined, 'risk'); eq(r.options[0].version, undefined, 'version'); eq(r.options[0].cost, undefined, 'cost');
    eq(r.options[1].scores, undefined, 'invalid scores'); eq(r.chosen, undefined, 'chosen must be an option');
  });
  test('cleanDecisions enforces the limits and drops scores of removed criteria', () => {
    const d = adrDec();
    d.criteria = Array.from({ length: 15 }, (_, i) => ({ id: `c${i}`, label: `C${i}` })); d.options = Array.from({ length: 15 }, (_, i) => ({ id: `o${i}`, title: `O${i}`, scores: { c14: 3, c0: 2 } }));
    d.area = 'x'.repeat(100);
    const r = ADRM.cleanDecisions([d], adrModel)[0];
    eq([r.criteria.length, r.options.length, r.area.length], [12, 12, 60], 'limits'); eq(r.options[0].scores, { c0: 2 }, 'scores of criteria beyond the limit');
  });
  test('old decisions stay byte-identical (no new keys appear)', () => {
    const old = { id: 'ADR-001', title: 'T', status: 'accepted', date: '2026-06-02', context: 'a', decision: 'b', consequences: 'c', deciders: 'Ana', links: { nodes: ['a'] }, history: [{ status: 'accepted', date: '2026-06-02' }] };
    eq(JSON.stringify(ADRM.cleanDecisions([old], adrModel)[0]), JSON.stringify(old), 'unchanged');
  });
  ['en', 'es'].forEach(lang => test(`options round trip in the text format · ${lang}`, () => {
    const m = withPositions({ title: 'ADR', nodes: [{ id: 'a', label: 'A' }], edges: [] });
    const d = adrDec(); d.options[1].summary = 'Line 1\nLine "2"'; m.decisions = [d];
    const ctx = textCtx(lang), t1 = TXT.stringify(m, lang), r = TXT.parse(t1, ctx);
    eq(r.errors, [], 'parse errors');
    const t2 = TXT.stringify({ ...r.model, meta: m.meta }, lang);
    assert(t1 === t2, `text changed:\n${t1}\n---\n${t2}`);
    const back = ADRM.cleanDecisions(r.model.decisions, adrModel)[0], want = ADRM.cleanDecisions([d], adrModel)[0];
    eq([back.area, back.criteria, back.options, back.chosen], [want.area, want.criteria, want.options, want.chosen], 'model');
    if (lang === 'es') assert(/área=Storage/.test(t1) && /criterio cost:/.test(t1) && /opción A:.* elegida .*riesgo=bajo .*puntos=cost:4,skills:5/.test(t1), 'Spanish keywords');
  }));
  test('text format accepts both languages and reports errors with line numbers', () => {
    const ctx = textCtx('en');
    const ok = TXT.parse(['a: A', 'adr ADR-1: "T" estado=aceptada área="X"', '  criterio q: "Q" peso=2', '  opción A: "Uno" elegida costo=10 riesgo=alto puntos=q:5 resumen="r" contras="c"'].join('\n'), ctx);
    eq(ok.errors, [], 'mixed-language input'); const d = ok.model.decisions[0];
    eq([d.area, d.chosen, d.criteria, d.options[0].risk, d.options[0].cost, d.options[0].scores, d.options[0].cons], ['X', 'A', [{ id: 'q', label: 'Q', weight: 2 }], 'high', 10, { q: 5 }, 'c'], 'values');
    const bad = TXT.parse(['adr ADR-1: "T"', '  criterion q: "Q" weight=9', '  option A: "A" risk=huge cost=-1 scores=q:7,zz:3', '  option B: "B" chosen', '  option C: "C" chosen', '  option A: "again"'].join('\n'), ctx);
    eq(bad.errors.map(e => e.line).sort(), [2, 3, 3, 3, 3, 5, 6], 'one error per problem, with its line');
  });
  test('decision kits (when present) have at least 2 options with en + es titles', () => {
    const kits = win.DIAGRAMON_ADR_KITS;
    if (!kits) { print('       (src/adr-kits.js not present: skipped)'); return; }
    assert(Array.isArray(kits) && kits.length, 'kits array');
    kits.forEach(k => {
      assert(k.id && k.name?.en && k.name?.es && k.desc?.en && k.desc?.es, `kit ${k.id} name/desc`);
      assert(k.decisions.length > 0, `kit ${k.id} has decisions`);
      k.decisions.forEach((d, i) => {
        const lbl = `${k.id}[${i}]`, both = v => typeof v === 'string' ? !!v : !!(v && v.en && v.es);
        assert(d.options?.length >= 2, `${lbl} needs at least 2 options`);
        assert(both(d.title) && both(d.context) && both(d.area), `${lbl} title/context/area in en + es`);
        d.options.forEach(o => assert(both(o.title), `${lbl} option ${o.id} title in en + es`));
      });
    });
  });

  /* ======================================================================
     7. Requisitos: modelo, controles (fitness functions), hallazgos y texto
     ====================================================================== */
  section('Requirements');
  const REQM = new Function(`${between('/* reqModel:start */', '/* reqModel:end */')}; return { cleanRequirements, cleanReqCheck, cleanReqLinks, reqEval, reqCover, reqIssues };`)();
  const serializeM = new Function(`${app.slice(app.indexOf('  const ORDER = {'), app.indexOf('  /* ---------- editores de código'))}; return serialize;`)();
  const reqModel = () => ({ nodes: [{ id: 'a', label: 'A', data: ['pii'] }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }], edges: [{ id: 'e1', from: 'a', to: 'b', encrypted: true, data: ['pii'] }, { id: 'e2', from: 'b', to: 'c' }],
    groups: [{ id: 'g' }], decisions: [{ id: 'ADR-001', status: 'accepted' }, { id: 'ADR-002', status: 'proposed' }] });
  // Lo que la app calcula, simulado: disponibilidad/RPO/RTO de la ruta, costo total, cruce de fronteras
  const reqH = (o = {}) => ({ T: (k, v) => (v && typeof v === 'object' ? `${k} ${JSON.stringify(v)}` : v != null ? `${k} ${v}` : k), availability: () => ({ availability: 0.9995, rpo: 7200, rto: 14400 }), cost: () => 1200,
    carries: (e, get, cls) => (e.data?.length ? e.data : get(e.from)?.data || []).includes(cls), crossBorder: () => null, sensitive: c => c === 'pii', nodeJur: n => n.jur || '', edgeName: e => `${e.from}>${e.to}`,
    pct: a => `${a * 100}%`, dur: s => `${s}s`, money: v => `$${v}`, num: v => String(v), ...o });
  const rq = (o = {}) => ({ id: 'REQ-001', title: 'T', kind: 'nfr', status: 'agreed', ...o });
  test('cleanRequirements: field limits and defaults', () => {
    const m = reqModel(), long = n => 'x'.repeat(n);
    const [r, ...rest] = REQM.cleanRequirements([{ id: 'REQ-005', title: long(300), detail: long(5000), source: `  ${long(200)}  `, kind: 'zzz', status: 'zzz', priority: 'zzz', links: { decisions: ['ADR-001', 'ADR-009'], nodes: ['a', 'q'], edges: ['e1'], groups: ['g', 'h'] } },
      { title: 'next' }, { id: 'REQ-005', title: 'dup' }, null, 5, {}, { title: '', detail: '  ' }], m);
    eq([r.title.length, r.detail.length, r.source.length, r.kind, r.status, 'priority' in r], [200, 4000, 120, 'driver', 'draft', false], 'limits and defaults');
    eq(r.links, { decisions: ['ADR-001'], nodes: ['a'], edges: ['e1'], groups: ['g'] }, 'only existing ids');
    eq(Object.keys(r), ['id', 'title', 'kind', 'detail', 'status', 'source', 'links'], 'key order');
    eq(rest.map(x => x.id), ['REQ-006', 'REQ-007'], 'new ids continue after the highest; duplicates get a fresh id; junk is dropped');
    eq(REQM.cleanRequirements(undefined, m), [], 'absent → empty');
  });
  test('cleanRequirements: Spanish values are understood and checks keep only the parameters their metric needs', () => {
    const m = reqModel();
    const [a] = REQM.cleanRequirements([{ id: 'R', title: 'x', kind: 'Restricción', priority: 'Debería', status: 'Acordado', check: { metric: 'Residencia', cls: 'PII', jur: 'EU', from: 'a', target: 5 } }], m);
    eq([a.kind, a.priority, a.status, a.check], ['constraint', 'should', 'agreed', { metric: 'residency', cls: 'pii', jur: 'eu' }], 'aliases + metric params');
    eq(REQM.cleanReqCheck({ metric: 'availability', from: 'a', to: 'zzz', target: '99,9' }, m), { metric: 'availability', from: 'a', target: 99.9 }, 'missing node dropped, comma decimal');
    eq(REQM.cleanReqCheck({ metric: 'availability', target: 101 }, m), { metric: 'availability' }, 'availability target above 100 dropped');
    eq([REQM.cleanReqCheck({ metric: 'nope' }, m), REQM.cleanReqCheck(null, m), REQM.cleanReqCheck({ metric: 'cost', target: -1 }, m)], [null, null, { metric: 'cost' }], 'invalid');
  });
  test('JSON and exports stay byte-identical when there are no requirements', () => {
    const base = { title: 'X', nodes: [{ id: 'a', label: 'A', type: 'generic', x: 0, y: 0 }], edges: [], groups: [], decisions: [] };
    const a = serializeM(base), b = serializeM({ ...base, requirements: [] }), c = serializeM({ ...base, requirements: undefined });
    assert(a === b && a === c && !/requirement/.test(a), 'no key without requirements');
    const withReq = serializeM({ ...base, requirements: [{ links: { nodes: ['a'] }, status: 'agreed', id: 'REQ-001', check: { metric: 'cost', target: 5 }, title: 'T', kind: 'nfr' }] });
    assert(withReq.startsWith(a.replace(/\n}\n$/, ',\n')), 'the rest is unchanged');
    assert(/"requirements": \[\n    \{ "id": "REQ-001", "title": "T", "kind": "nfr", "status": "agreed", "check": \{"metric":"cost","target":5\}, "links": \{"nodes":\["a"\]\} \}\n  \]/.test(withReq), `serialized: ${withReq}`);
  });
  test('check availability: pass at or above the target, fail below, unknown without SLA or route', () => {
    const m = reqModel(), c = (t, h) => REQM.reqEval(rq({ check: { metric: 'availability', from: 'a', to: 'c', target: t } }), m, reqH(h));
    eq(c(99.9).state, 'pass', '99.95 ≥ 99.9'); near(c(99.9).actual, 99.95, 1e-9, 'actual in %'); eq(c(99.95).state, 'pass', 'equal passes'); eq(c(99.99).state, 'fail', 'below');
    eq(c(99.9, { availability: () => ({ availability: null }) }).state, 'unknown', 'no SLA'); eq(c(99.9, { availability: () => null }).state, 'unknown', 'no route');
    eq(REQM.reqEval(rq({ check: { metric: 'availability', from: 'a', to: 'zzz', target: 99 } }), m, reqH()).state, 'unknown', 'missing node');
  });
  test('check rpo / rto: hours against the worst value on the route; unknown when not set', () => {
    const m = reqModel(), c = (metric, t, h) => REQM.reqEval(rq({ check: { metric, from: 'a', to: 'c', target: t } }), m, reqH(h));
    eq([c('rpo', 2).state, c('rpo', 1).state, c('rto', 4).state, c('rto', 3).state], ['pass', 'fail', 'pass', 'fail'], 'rpo 2h / rto 4h');
    eq(c('rpo', 1).actual, 2, 'actual in hours'); eq(c('rto', 4, { availability: () => ({ availability: 1, rto: null }) }).state, 'unknown', 'rto not set');
  });
  test('check cost: total monthly cost against the ceiling; unknown without costs', () => {
    const m = reqModel(), c = (t, h) => REQM.reqEval(rq({ check: { metric: 'cost', target: t } }), m, reqH(h));
    eq([c(1200).state, c(1199).state, c(5000, { cost: () => null }).state], ['pass', 'fail', 'unknown'], 'cost');
  });
  test('check encryption: every edge carrying the class must be encrypted, failures are listed', () => {
    const m = reqModel(), c = (cls, edges) => REQM.reqEval(rq({ check: { metric: 'encryption', cls } }), { ...m, edges: edges || m.edges }, reqH());
    eq(c('pii').state, 'pass', 'e1 is encrypted');
    const bad = c('pii', [...m.edges, { id: 'e3', from: 'a', to: 'c', data: ['pii'], encrypted: false }, { id: 'e4', from: 'a', to: 'b', data: ['pii'] }]);
    eq([bad.state, bad.actual], ['fail', 2], 'false and unstated both fail'); assert(/a>c; a>b/.test(bad.detail), `lists the edges: ${bad.detail}`);
    eq(c('pci').state, 'unknown', 'nothing carries pci');
  });
  test('check residency: unapproved cross-border edges carrying the class out of the jurisdiction', () => {
    const m = { ...reqModel(), nodes: [{ id: 'a', jur: 'eu' }, { id: 'b', jur: 'us' }, { id: 'c', jur: 'eu' }] };
    const cb = (from, to, approved) => ({ from: { jur: { key: from } }, to: { jur: { key: to } }, classes: ['pii'], approved });
    const run = (fn, cls = 'pii') => REQM.reqEval(rq({ check: { metric: 'residency', cls, jur: 'eu' } }), m, reqH({ crossBorder: fn }));
    eq(run(() => null).state, 'pass', 'nothing crosses');
    const out = run(e => (e.id === 'e1' ? cb('eu', 'us', false) : null));
    eq([out.state, out.actual], ['fail', 1], 'eu → us unapproved'); assert(/a>b/.test(out.detail), 'lists the edge');
    eq(run(e => (e.id === 'e1' ? cb('eu', 'us', true) : null)).state, 'pass', 'approved transfer is fine');
    eq(run(e => (e.id === 'e1' ? cb('us', 'eu', false) : null)).state, 'pass', 'entering the EU is fine');
    eq(run(() => null, 'internal').state, 'unknown', 'not a sensitive class');
    eq(REQM.reqEval(rq({ check: { metric: 'residency', cls: 'pii', jur: 'br' } }), m, reqH()).state, 'unknown', 'no component in that jurisdiction');
  });
  test('checks only run for agreed requirements and report missing parameters', () => {
    const m = reqModel();
    eq(REQM.reqEval(rq({ status: 'draft', check: { metric: 'cost', target: 1 } }), m, reqH()).state, 'unknown', 'draft');
    eq(REQM.reqEval(rq({ check: { metric: 'cost' } }), m, reqH()).state, 'unknown', 'no target');
    eq(REQM.reqEval(rq(), m, reqH()).state, 'unknown', 'no check');
  });
  test('coverage and findings: uncovered must (medium) / should (low), failing checks (high for must, medium otherwise)', () => {
    const m = { ...reqModel(), requirements: [rq({ id: 'REQ-001', priority: 'must' }), rq({ id: 'REQ-002', priority: 'should', links: { decisions: ['ADR-002'] } }), rq({ id: 'REQ-003', priority: 'could' }),
      rq({ id: 'REQ-004', priority: 'must', links: { decisions: ['ADR-001'] } }), rq({ id: 'REQ-005', priority: 'must', links: { nodes: ['a'] } }), rq({ id: 'REQ-006', priority: 'must', status: 'draft' }),
      rq({ id: 'REQ-007', priority: 'could', links: { nodes: ['a'] }, check: { metric: 'cost', target: 1 } }), rq({ id: 'REQ-008', priority: 'must', links: { nodes: ['a'] }, check: { metric: 'cost', target: 5000 } })] };
    eq(REQM.reqCover(m.requirements[1], m).covered, false, 'a proposed decision does not cover');
    eq(REQM.reqCover(m.requirements[3], m), { decisions: [{ id: 'ADR-001', status: 'accepted' }], comps: 0, covered: true }, 'accepted decision covers');
    eq(REQM.reqIssues(m, reqH()).map(i => [i.r.id, i.rule, i.severity]), [['REQ-001', 'uncovered', 'medium'], ['REQ-002', 'uncovered', 'low'], ['REQ-007', 'fail', 'medium']], 'issues');
  });
  const sortK = v => JSON.parse(JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(j => [j, x[j]])) : x)));
  const reqText = { title: 'R', nodes: [{ id: 'raw', label: 'Raw' }, { id: 'bi', label: 'BI' }], edges: [{ id: 'e1', from: 'raw', to: 'bi', label: 'x' }], groups: [],
    decisions: [{ id: 'ADR-005', title: 'Cloud', status: 'accepted', date: '2026-10-07' }],
    requirements: [{ id: 'REQ-001', title: 'Data must "stay" in the EU', kind: 'constraint', detail: 'Line 1\nLine "2"', priority: 'must', status: 'agreed', source: 'CISO office', check: { metric: 'residency', cls: 'pii', jur: 'eu' }, links: { decisions: ['ADR-005'], nodes: ['raw'], edges: ['e1'] } },
      { id: 'REQ-002', title: 'Serving up', kind: 'nfr', priority: 'should', status: 'draft', check: { metric: 'availability', from: 'raw', to: 'bi', target: 99.9 } },
      { id: 'REQ-003', title: 'Budget', kind: 'constraint', status: 'agreed', check: { metric: 'cost', target: 25000 } }, { id: 'REQ-004', title: 'Open', kind: 'principle', priority: 'could', status: 'dropped' }, { id: 'REQ-005', title: 'RPO', kind: 'driver', status: 'draft', check: { metric: 'rpo', from: 'raw', to: 'bi', target: 4 } }] };
  ['en', 'es'].forEach(lang => test(`requirements round trip in the text format · ${lang}`, () => {
    const m = withPositions(reqText), ctx = textCtx(lang), t1 = TXT.stringify(m, lang), r = TXT.parse(t1, ctx);
    eq(r.errors, [], 'parse errors');
    assert(t1 === TXT.stringify({ ...r.model, meta: m.meta }, lang), `text changed:\n${t1}`);
    eq(sortK(r.model.requirements), sortK(m.requirements), 'model');
    if (lang === 'es') assert(/req REQ-001: .* tipo=restricción prioridad=debe estado=acordado fuente="CISO office" control=residencia clase=pii jurisdicción=eu enlaces=ADR-005,raw,raw->bi/.test(t1) && /desde=raw hasta=bi objetivo=99.9/.test(t1) && /control=costo objetivo=25000/.test(t1) && /\n  detalle: "Line 1\\nLine \\"2\\""/.test(t1), `Spanish keywords:\n${t1}`);
    else assert(/req REQ-001: .* kind=constraint priority=must status=agreed source="CISO office" check=residency cls=pii jur=eu links=ADR-005,raw,raw->bi/.test(t1), `English keywords:\n${t1}`);
  }));
  test('requirements text: mixed languages parse the same, errors carry their line', () => {
    const ctx = textCtx('en');
    const ok = TXT.parse(['a: A', 'b: B', 'adr ADR-1: "D"', 'req R1: "Uno" tipo=rnf prioridad=debería estado=acordado control=disponibilidad desde=a hasta=b objetivo=99,5 enlaces=ADR-1,a', '  detalle: "x"'].join('\n'), ctx);
    eq(ok.errors, [], 'mixed-language input');
    eq(sortK(ok.model.requirements), sortK([{ id: 'R1', title: 'Uno', kind: 'nfr', priority: 'should', status: 'agreed', check: { metric: 'availability', from: 'a', to: 'b', target: 99.5 }, links: { decisions: ['ADR-1'], nodes: ['a'] }, detail: 'x' }]), 'values');
    const bad = TXT.parse(['a: A', 'req R1: "x" kind=nope priority=high status=maybe', 'req R1: "dup" check=magic', 'req R2: "y" check=cost target=abc', 'req R3: "z" check=rpo from=zzz to=a target=1 links=ghost', 'req R4: "w" cls=pii', 'req R5: "v" check=encryption cls=nope'].join('\n'), ctx);
    eq(bad.errors.map(e => e.line).sort((x, y) => x - y), [2, 2, 2, 3, 3, 4, 5, 5, 6, 7], 'one error per problem, with its line');
  });
  test('requirements text: without any req line the model carries an empty list and stringify writes nothing', () => {
    const r = TXT.parse('a: A\nb: B\na -> b', textCtx('en'));
    eq(r.model.requirements, [], 'empty'); assert(!/req /.test(TXT.stringify(r.model, 'en')), 'nothing written');
  });
  test('lakehouse template ships ~8 draft requirements linked to its decisions and nodes', () => {
    const m = templates('en').find(x => /Lakehouse greenfield/.test(x.name)).model, ids = new Set([...m.decisions.map(d => d.id), ...m.nodes.map(n => n.id)]);
    eq(m.requirements.length, 8, 'count'); assert(m.requirements.every(r => r.status === 'draft' && r.title && r.kind), 'draft, titled, typed');
    const dangling = m.requirements.flatMap(r => [...(r.links?.decisions || []), ...(r.links?.nodes || []), r.check?.from, r.check?.to].filter(Boolean).filter(id => !ids.has(id)));
    eq(dangling, [], 'every link and check node exists');
    assert(m.requirements.some(r => r.check?.metric === 'residency') && m.requirements.some(r => r.check?.metric === 'encryption'), 'has checks');
  });

  /* ======================================================================
     8. Registro RAID: riesgos, supuestos, problemas y dependencias
     ====================================================================== */
  section('RAID log');
  const raidSrc = between('/* raidModel:start */', '/* raidModel:end */');
  const RAIDM = new Function('isDay', 'today', `${raidSrc}; return { cleanRaid, raidScore, raidLevel, raidHeat, raidSummary, raidIssues, raidState };`)(v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v), () => '2026-10-07');
  const raidDoc = { nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'e1' }], groups: [{ id: 'g' }], decisions: [{ id: 'ADR-001', status: 'accepted' }, { id: 'ADR-002', status: 'proposed' }, { id: 'ADR-003', status: 'rejected' }] };
  const raidSet = () => [
    { id: 'R-001', type: 'risk', title: 'SAP CDC licence not available', detail: 'd', owner: 'PMO', status: 'open', probability: 3, impact: 4, mitigation: 'Ask the vendor', raised: '2026-10-01', links: { decisions: ['ADR-001'], nodes: ['a'] } },
    { id: 'A-001', type: 'assumption', title: 'Volume ≤ 2 TB/day', owner: 'Data owner', validation: 'pending', due: '2026-11-15', links: { decisions: ['ADR-001', 'ADR-002'], requirements: ['REQ-003'], edges: ['e1'], groups: ['g'] },
      history: [{ validation: 'validated', date: '2026-10-02', by: 'Ana', note: 'Checked with "finance"' }] },
    { id: 'I-001', type: 'issue', title: 'No access to the ERP test system', status: 'closed', due: '2026-09-30' },
    { id: 'D-001', type: 'dependency', title: 'Network team opens private link', status: 'open', due: '2026-11-30', links: { nodes: ['b'] } }
  ];
  test('cleanRaid keeps valid items in canonical key order, with the fields of each type', () => {
    const r = RAIDM.cleanRaid(raidSet(), raidDoc, ['REQ-003']);
    eq(r.map(x => x.id), ['R-001', 'A-001', 'I-001', 'D-001'], 'ids');
    eq(Object.keys(r[0]), ['id', 'type', 'title', 'detail', 'owner', 'status', 'probability', 'impact', 'mitigation', 'raised', 'links'], 'risk keys');
    eq(Object.keys(r[1]), ['id', 'type', 'title', 'owner', 'validation', 'due', 'links', 'history'], 'assumption keys');
    eq(Object.keys(r[2]), ['id', 'type', 'title', 'status', 'due'], 'issue keys');
    eq(r[1].links, { decisions: ['ADR-001', 'ADR-002'], requirements: ['REQ-003'], edges: ['e1'], groups: ['g'] }, 'links');
  });
  test('cleanRaid drops fields that do not belong to the type and invalid values', () => {
    const r = RAIDM.cleanRaid([
      { id: 'R-001', type: 'risk', title: 'x', validation: 'validated', due: '2026-11-01', probability: 9, impact: 2.5, history: [{ validation: 'validated', date: '2026-10-02' }] },
      { id: 'A-001', type: 'assumption', title: 'y', status: 'closed', probability: 3, impact: 3, mitigation: 'm', validation: 'maybe', due: 'soon' },
      { id: 'I-001', type: 'issue', title: 'z', status: 'weird', validation: 'validated', mitigation: 'm', raised: 'yesterday' }], raidDoc);
    eq(r[0], { id: 'R-001', type: 'risk', title: 'x', status: 'open' }, 'risk');
    eq(r[1], { id: 'A-001', type: 'assumption', title: 'y', validation: 'pending' }, 'assumption');
    eq(r[2], { id: 'I-001', type: 'issue', title: 'z', status: 'open' }, 'issue');
  });
  test('cleanRaid numbers per type, fixes ids that do not match the type and rejects duplicates', () => {
    const r = RAIDM.cleanRaid([{ type: 'risk', title: 'a' }, { id: 'R-005', type: 'risk', title: 'b' }, { type: 'risk', title: 'c' }, { type: 'assumption', title: 'd' }, { id: 'R-005', type: 'risk', title: 'dup' },
      { id: 'A-009', type: 'risk', title: 'wrong prefix' }, { id: 'X-1', type: 'dependency', title: 'e' }, { id: 'I-007', title: 'type from the id' }, { type: 'nonsense', title: 'dropped' }, null, 'x', { type: 'issue' }], raidDoc);
    eq(r.map(x => `${x.id}:${x.type}`), ['R-006:risk', 'R-005:risk', 'R-007:risk', 'A-001:assumption', 'R-008:risk', 'R-009:risk', 'D-001:dependency', 'I-007:issue'].map(x => x), 'ids');
  });
  test('cleanRaid accepts Spanish type, status and validation words', () => {
    const r = RAIDM.cleanRaid([{ id: 'S-1', type: 'riesgo', title: 'r', status: 'cerrado' }, { type: 'supuesto', title: 's', validation: 'invalidado' }, { type: 'problema', title: 'p', status: 'abierto' }, { type: 'dependencia', title: 'd' }], raidDoc);
    eq(r.map(x => [x.id, x.type, x.status || x.validation]), [['R-001', 'risk', 'closed'], ['A-001', 'assumption', 'invalidated'], ['I-001', 'issue', 'open'], ['D-001', 'dependency', 'open']], 'normalized');
  });
  test('cleanRaid prunes links to ids that do not exist, and works when requirements do not exist', () => {
    const it = { id: 'R-001', type: 'risk', title: 't', links: { decisions: ['ADR-001', 'ADR-999'], requirements: ['REQ-001'], nodes: ['a', 'zzz'], edges: ['nope'], groups: ['g', 'g'] } };
    eq(RAIDM.cleanRaid([it], raidDoc)[0].links, { decisions: ['ADR-001'], nodes: ['a'], groups: ['g'] }, 'no requirements key');
    eq(RAIDM.cleanRaid([it], { ...raidDoc, requirements: [{ id: 'REQ-001' }] })[0].links.requirements, ['REQ-001'], 'model with requirements');
    eq(RAIDM.cleanRaid([it], raidDoc, ['REQ-001'])[0].links.requirements, ['REQ-001'], 'ids passed in');
    eq(RAIDM.cleanRaid([{ ...it, links: { nodes: ['zzz'] } }], raidDoc)[0].links, undefined, 'empty links disappear');
  });
  test('cleanRaid enforces the limits', () => {
    const r = RAIDM.cleanRaid([{ type: 'risk', title: `  ${'t'.repeat(300)}  `, detail: 'd'.repeat(5000), owner: 'o'.repeat(200), mitigation: 'm'.repeat(3000), history: 1 }], raidDoc)[0];
    eq([r.title.length, r.detail.length, r.owner.length, r.mitigation.length], [200, 4000, 120, 2000], 'lengths');
    const many = RAIDM.cleanRaid(Array.from({ length: 600 }, (_, i) => ({ type: 'issue', title: `i${i}` })), raidDoc);
    eq(many.length, 500, 'entries');
    const h = RAIDM.cleanRaid([{ type: 'assumption', title: 'a', history: Array.from({ length: 150 }, (_, i) => ({ validation: 'validated', date: '2026-10-07', note: `${i}` })).concat([{ validation: 'validated', date: 'bad' }]) }], raidDoc)[0].history;
    eq([h.length, h[0].note], [100, '50'], 'history keeps the latest 100 valid entries');
  });
  test('old registers stay byte-identical and an absent register adds nothing', () => {
    const old = RAIDM.cleanRaid(raidSet(), raidDoc, ['REQ-003']);
    eq(JSON.stringify(RAIDM.cleanRaid(old, raidDoc, ['REQ-003'])), JSON.stringify(old), 'idempotent');
    eq(RAIDM.cleanRaid(undefined, raidDoc), [], 'no key');
    assert(/if \(m\.raid\?\.length\) body\.push\(arr\('raid'/.test(app), 'JSON export only writes the key when there are items');
    const base = withPositions({ title: 'No RAID', nodes: [{ id: 'a', label: 'A' }], edges: [] });
    ['en', 'es'].forEach(l => {
      const t0 = TXT.stringify(base, l), t1 = TXT.stringify({ ...base, raid: [] }, l);
      assert(t0 === t1 && !/riesgo|risk|supuesto|assumption/.test(t0.replace(/^t[ií]tulo: .*$/m, '')), `text unchanged without a register (${l})`);
      const p = TXT.parse(t0, textCtx(l));
      eq([p.errors, p.model.raid], [[], []], 'parse');
    });
  });
  test('score, level, heat map and summary', () => {
    eq([RAIDM.raidScore({ type: 'risk', probability: 3, impact: 4 }), RAIDM.raidScore({ type: 'risk', probability: 3 }), RAIDM.raidScore({ type: 'issue', probability: 3, impact: 4 })], [12, 0, 0], 'score = p × i, only for risks');
    eq([1, 7, 8, 14, 15, 25].map(RAIDM.raidLevel), ['low', 'low', 'medium', 'medium', 'high', 'high'], 'levels');
    const list = RAIDM.cleanRaid([{ type: 'risk', title: 'a', probability: 3, impact: 4 }, { type: 'risk', title: 'b', probability: 3, impact: 4 }, { type: 'risk', title: 'c', probability: 5, impact: 5 }, { type: 'risk', title: 'd' }], raidDoc);
    const g = RAIDM.raidHeat(list);
    eq([g[3][2], g[4][4], g.flat().reduce((a, b) => a + b, 0)], [2, 1, 3], 'cells [impact-1][probability-1]');
    const all = RAIDM.cleanRaid(raidSet().concat([{ type: 'risk', title: 'big', probability: 5, impact: 4 }, { type: 'risk', title: 'closed', status: 'closed', probability: 5, impact: 5 }, { type: 'assumption', title: 'ok', validation: 'validated', due: '2020-01-01' }]), raidDoc, ['REQ-003']);
    eq(RAIDM.raidSummary({ raid: all }, '2026-10-07'), { risks: 2, high: 1, toValidate: 1, overdue: 0 }, 'summary');
    eq(RAIDM.raidSummary({ raid: all }, '2026-12-01').overdue, 2, 'pending assumption and open dependency past due; closed and validated ones do not count');
  });
  test('raidIssues: invalidated assumption, unvalidated, high risk and overdue', () => {
    const doc = { ...raidDoc, raid: RAIDM.cleanRaid([
      { type: 'assumption', title: 'bad', validation: 'invalidated', links: { decisions: ['ADR-001', 'ADR-002', 'ADR-003'] } },
      { type: 'assumption', title: 'late', validation: 'pending', due: '2026-10-01', links: { decisions: ['ADR-001', 'ADR-003'] } },
      { type: 'assumption', title: 'fine', validation: 'pending', due: '2026-12-01' },
      { type: 'risk', title: 'naked', probability: 4, impact: 4 }, { type: 'risk', title: 'covered', probability: 5, impact: 3, mitigation: 'm' }, { type: 'risk', title: 'minor', probability: 2, impact: 3 }, { type: 'risk', title: 'old', status: 'closed', probability: 5, impact: 5 },
      { type: 'issue', title: 'late issue', due: '2026-10-06' }, { type: 'dependency', title: 'on time', due: '2026-10-07' }, { type: 'dependency', title: 'done', status: 'closed', due: '2020-01-01' }], raidDoc) };
    const is = RAIDM.raidIssues(doc, '2026-10-07').map(x => [x.key, x.severity]);
    eq(is, [['invalid:A-001:ADR-001', 'high'], ['invalid:A-001:ADR-002', 'high'], ['unvalidated:A-002', 'medium'], ['risk:R-001', 'high'], ['risk:R-002', 'low'], ['overdue:I-001', 'medium']], 'issues');
    eq(RAIDM.raidIssues(doc, '2026-10-07').find(x => x.rule === 'unvalidated').acc, ['ADR-001'], 'accepted decisions that rely on the late assumption');
  });
  const raidText = () => ({ ...withPositions({ title: 'RAID', nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b' }, { from: 'a', to: 'b' }], groups: [{ id: 'g', label: 'G' }] }),
    decisions: [{ id: 'ADR-001', title: 'D1', status: 'accepted', date: '2026-06-02', context: '', decision: '', consequences: '', links: {} }],
    raid: [
      { id: 'R-001', type: 'risk', title: 'SAP CDC "licence" not available', detail: 'Line 1\nLine 2', owner: 'PMO team', status: 'open', probability: 3, impact: 4, mitigation: 'Ask; then "decide"', raised: '2026-10-01', links: { decisions: ['ADR-001'], nodes: ['a'], groups: ['g'], edges: ['e2'] } },
      { id: 'A-001', type: 'assumption', title: 'Volume ≤ 2 TB/day', owner: 'Data owner', validation: 'invalidated', due: '2026-11-15', links: { decisions: ['ADR-001'], requirements: ['REQ-003'] },
        history: [{ validation: 'validated', date: '2026-10-02', by: 'Ana María', note: 'Checked; with finance' }, { validation: 'invalidated', date: '2026-10-05' }] },
      { id: 'I-001', type: 'issue', title: 'No ERP test system', status: 'closed', due: '2026-09-30' },
      { id: 'D-001', type: 'dependency', title: 'Network team opens private link', status: 'open', due: '2026-11-30', links: { nodes: ['b'], edges: ['e1'] } }] });
  ['en', 'es'].forEach(lang => test(`RAID round trip in the text format · ${lang}`, () => {
    const m = raidText();
    m.edges.forEach((e, i) => { e.id = `e${i + 1}`; });
    const ctx = textCtx(lang), t1 = TXT.stringify(m, lang), r = TXT.parse(t1, ctx);
    eq(r.errors, [], 'parse errors');
    const t2 = TXT.stringify({ ...r.model, meta: m.meta }, lang);
    assert(t1 === t2, `text changed:\n${t1}\n---\n${t2}`);
    const doc = { ...r.model, requirements: [{ id: 'REQ-003' }] }, back = RAIDM.cleanRaid(r.model.raid, doc), want = RAIDM.cleanRaid(m.raid, { ...m, requirements: [{ id: 'REQ-003' }] });
    eq(back, want, 'model');
    if (lang === 'es') assert(/^riesgo R-001: .* p=3 i=4 dueño="PMO team" estado=abierto /m.test(t1) && /^supuesto A-001: .* validación=invalidado fecha=2026-11-15 /m.test(t1) && /^  mitigación: /m.test(t1) && /^  detalle: /m.test(t1) && /^  historial: validado 2026-10-02 por="Ana María" nota="Checked; with finance"; invalidado 2026-10-05$/m.test(t1) && /^problema I-001: .* estado=cerrado fecha=2026-09-30$/m.test(t1), 'Spanish keywords');
    else assert(/^risk R-001: .* p=3 i=4 owner="PMO team" status=open raised=2026-10-01 links=ADR-001,a,g,a->b#2$/m.test(t1) && /^dependency D-001: .* due=2026-11-30 links=b,a->b#1$/m.test(t1), 'English keywords');
  }));
  test('RAID text accepts both languages and reports errors with line numbers', () => {
    const ctx = textCtx('en');
    const ok = TXT.parse(['a: A', 'adr ADR-1: "D"', 'riesgo R-1: "r" p=2 i=5 dueño=Ana estado=cerrado enlaces=a,ADR-1,REQ-9', '  mitigation: "m"', 'assumption A-1: "s" validación=validado fecha=2026-11-15 registrado=2026-10-01', '  historial: validado 2026-10-02 por=Ana'].join('\n'), ctx);
    eq(ok.errors, [], 'mixed-language input');
    eq(ok.model.raid.map(x => [x.id, x.type, x.probability, x.impact, x.owner, x.status, x.validation, x.due, x.raised, x.mitigation, x.links, x.history]),
      [['R-1', 'risk', 2, 5, 'Ana', 'closed', undefined, undefined, undefined, 'm', { nodes: ['a'], decisions: ['ADR-1'], requirements: ['REQ-9'] }, undefined],
       ['A-1', 'assumption', undefined, undefined, undefined, undefined, 'validated', '2026-11-15', '2026-10-01', undefined, undefined, [{ validation: 'validated', date: '2026-10-02', by: 'Ana' }]]], 'values');
    const bad = TXT.parse(['a: A', 'risk X-1: "bad id"', 'risk R-1: "x" p=9 i=0 status=maybe due=soon', 'risk R-1: "dup" links=nowhere', 'assumption A-1: "a" validation=perhaps', '  history: validated nope', '  mitigation: "ok"'].join('\n'), ctx);
    eq(bad.errors.map(e => e.line).sort(), [2, 3, 3, 3, 3, 4, 4, 5, 6], 'one error per problem, with its line');
  });
  test('lakehouse starter template carries a RAID log linked to its decisions and components', () => {
    const m = templates('en').find(x => /Lakehouse greenfield/.test(x.name)).model;
    eq(m.raid.map(x => x.id), ['A-001', 'A-002', 'A-003', 'A-004', 'R-001', 'R-002', 'D-001'], 'items');
    eq(m.raid.map(x => x.type), ['assumption', 'assumption', 'assumption', 'assumption', 'risk', 'risk', 'dependency'], 'types');
    const nodes = new Set(m.nodes.map(n => n.id)), decs = new Set((m.decisions || []).map(d => d.id));
    m.raid.forEach(x => { (x.links?.nodes || []).forEach(id => assert(nodes.has(id), `${x.id} links to node ${id}`)); if (decs.size) (x.links?.decisions || []).forEach(id => assert(decs.has(id), `${x.id} links to ${id}`)); (x.links?.requirements || []).forEach(id => assert((m.requirements || []).some(r => r.id === id), `${x.id} links to ${id}`)); });
    assert(m.raid.some(x => x.links?.requirements?.length), 'some items trace to requirements');
    assert(m.raid.filter(x => x.type === 'risk').every(x => x.probability && x.impact && x.mitigation), 'risks have p, i and mitigation');
    const es = templates('es').find(x => /Lakehouse greenfield/.test(x.name)).model;
    assert(es.raid.every(x => x.title && x.title !== m.raid.find(y => y.id === x.id).title), 'titles are translated');
  });
  test('lakehouse template ships six stakeholders with RACI keys in en and es, and a signed ADR-001', () => {
    const m = templates('en').find(x => /Lakehouse greenfield/.test(x.name)).model, es = templates('es').find(x => /Lakehouse greenfield/.test(x.name)).model;
    const ids = new Set(m.stakeholders.map(s => s.id));
    eq(m.stakeholders.length, 6, 'six stakeholders');
    const areas = new Set([...m.decisions, ...es.decisions].map(d => d.area));
    m.stakeholders.forEach(s => Object.keys(s.raci || {}).forEach(k => assert(k === '*' || areas.has(k), `${s.id} raci area ${k} is used by a decision`)));
    assert(m.stakeholders.every(s => s.org === 'client' || s.org === 'partner'), 'org is client or partner');
    const signs = [...m.decisions, ...(m.versions || [])].flatMap(x => x.signoffs || []);
    assert(signs.length > 0 && signs.every(x => ids.has(x.by)), 'every sign-off names a stakeholder');
    const adr1 = m.decisions.find(d => d.id === 'ADR-001');
    eq(adr1.status, 'accepted', 'ADR-001 is accepted');
    eq(adr1.signoffs.map(x => x.by), ['SH-001'], 'ADR-001 has one approval, the lead architect is still pending');
  });

  /* ======================================================================
     9. Interesados y RACI
     ====================================================================== */
  section('Stakeholders');
  const SHM = new Function(`${between('/* stakeholderModel:start */', '/* stakeholderModel:end */')}; return { cleanStakeholders, shGaps, shAreas, shIsA };`)();
  const shSet = () => [
    { id: 'SH-001', name: 'Ana Pérez', role: 'CISO', org: 'client', raci: { '*': 'C', Security: 'A', 'Data Platform': 'R' }, versions: true },
    { id: 'SH-002', name: 'Luis "El Jefe" Gómez', org: 'partner', raci: { platform: 'A' } },
    { id: 'SH-003', name: 'Marta', role: 'FinOps', org: 'internal', raci: { Operations: 'A' }, inactive: true }
  ];
  test('a quoted raci list accepts areas with spaces', () => {
    const { model: m, errors } = TXT.parse('stakeholder SH-001: "Ana" raci="*:C,Data Platform:R"', textCtx('en'));
    eq(errors.length, 0, 'no errors');
    eq(m.stakeholders?.[0]?.raci?.['Data Platform'], 'R', 'area with a space');
  });
  test('cleanStakeholders keeps valid entries in canonical key order and applies the limits', () => {
    const r = SHM.cleanStakeholders(shSet(), {});
    eq(r.map(x => x.id), ['SH-001', 'SH-002', 'SH-003'], 'ids');
    eq(Object.keys(r[0]), ['id', 'name', 'role', 'org', 'raci', 'versions'], 'key order');
    eq(Object.keys(r[2]), ['id', 'name', 'role', 'org', 'raci', 'inactive'], 'inactive last');
    const big = SHM.cleanStakeholders([{ name: `  ${'n'.repeat(200)}  `, role: 'r'.repeat(200), org: 'nonsense', raci: Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`Area ${i}`, i % 2 ? 'a' : 'x'])) }], {})[0];
    eq([big.name.length, big.role.length, big.org, Object.keys(big.raci).length, [...new Set(Object.values(big.raci))]], [120, 80, 'client', 30, ['A']], 'name <= 120, role <= 80, org defaults to client, invalid letters dropped, raci uppercased');
    const keys = SHM.cleanStakeholders([{ name: 'x', raci: { ['y'.repeat(100)]: 'R', ' Two  words, here ': 'i', '*': 'c', '': 'A', Dup: 'R', dup: 'A' } }], {})[0].raci;
    eq(Object.keys(keys), ['y'.repeat(60), 'Two words here', '*', 'Dup'], 'areas are cut to 60 chars, tidied, deduplicated without regard to case');
    eq(keys['Two words here'], 'I', 'letters are uppercased');
    const many = SHM.cleanStakeholders([{ name: 'x', raci: Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`A${i}`, 'R'])) }], {})[0];
    eq(Object.keys(many.raci).length, 40, 'at most 40 areas');
  });
  test('cleanStakeholders renumbers invalid and duplicate ids, drops nameless entries and is idempotent', () => {
    const r = SHM.cleanStakeholders([{ id: 'SH-004', name: 'a' }, { id: 'SH-004', name: 'dup' }, { id: 'X-1', name: 'bad' }, { name: '   ' }, null, 5, { name: 'last', id: 'SH-002', versions: 'yes', inactive: 1 }], {});
    eq(r.map(x => [x.id, x.name]), [['SH-004', 'a'], ['SH-005', 'dup'], ['SH-006', 'bad'], ['SH-002', 'last']], 'ids');
    eq([r[3].versions, r[3].inactive], [undefined, undefined], 'flags only when exactly true');
    const once = SHM.cleanStakeholders(shSet(), {});
    eq(JSON.stringify(SHM.cleanStakeholders(once, {})), JSON.stringify(once), 'idempotent');
    eq(SHM.cleanStakeholders(undefined, {}), [], 'no key');
    eq(SHM.cleanStakeholders(Array.from({ length: 250 }, (_, i) => ({ name: `p${i}` })), {}).length, 200, 'at most 200 stakeholders');
  });
  test('the model and the exports are byte-identical without stakeholders', () => {
    assert(/if \(m\.stakeholders\?\.length\) body\.push\(arr\('stakeholders'/.test(app), 'JSON export only writes the key when there are stakeholders');
    assert(/if \(sh\.length\) m\.stakeholders = sh/.test(app), 'normalize adds the key only when there are stakeholders');
    const base = { title: 'No people', groups: [], nodes: [{ id: 'a', label: 'A', type: 'generic' }], edges: [] };
    eq(serializeM(base), serializeM({ ...base, stakeholders: [] }), 'JSON');
    const b = withPositions(base);
    ['en', 'es'].forEach(l => {
      const t0 = TXT.stringify(b, l);
      eq(t0, TXT.stringify({ ...b, stakeholders: [] }, l), `text (${l})`);
      const p = TXT.parse(t0, textCtx(l));
      eq([p.errors, p.model.stakeholders], [[], []], `parse (${l})`);
    });
    assert(/stakeholders: S\.model\.stakeholders/.test(app) && /raw\.stakeholders\) && S\.model\.stakeholders/.test(app), 'openVersion and the editors keep the stakeholders');
    eq(/stakeholder/i.test(serializeM(base)), false, 'no stakeholder key in the JSON');
  });
  test('JSON export of stakeholders keeps the canonical order', () => {
    const j = serializeM({ title: 't', groups: [], nodes: [], edges: [], stakeholders: SHM.cleanStakeholders(shSet(), {}) });
    assert(/"stakeholders": \[\n    \{ "id": "SH-001", "name": "Ana Pérez", "role": "CISO", "org": "client", "raci": \{"\*":"C","Security":"A","Data Platform":"R"\}, "versions": true \}/.test(j), `JSON line:\n${j}`);
    eq(JSON.parse(j).stakeholders, SHM.cleanStakeholders(shSet(), {}), 'round trip');
  });
  ['en', 'es'].forEach(lang => test(`stakeholders round trip in the text format · ${lang}`, () => {
    const m = withPositions({ title: 'People', nodes: [{ id: 'a', label: 'A' }], edges: [], stakeholders: SHM.cleanStakeholders(shSet(), {}) });
    const t1 = TXT.stringify(m, lang), r = TXT.parse(t1, textCtx(lang));
    eq(r.errors, [], 'parse errors');
    const t2 = TXT.stringify({ ...r.model, meta: m.meta }, lang);
    assert(t1 === t2, `text changed:\n${t1}\n---\n${t2}`);
    eq(SHM.cleanStakeholders(r.model.stakeholders, r.model), SHM.cleanStakeholders(m.stakeholders, m), 'model');
    if (lang === 'es') assert(/^interesado SH-001: "Ana Pérez" rol="CISO" org=cliente raci="\*:C,Security:A,Data Platform:R" versiones$/m.test(t1) && /^interesado SH-002: .* org=socio raci=platform:A$/m.test(t1) && /^interesado SH-003: "Marta" rol="FinOps" org=interno raci=Operations:A inactivo$/m.test(t1), `Spanish keywords:\n${t1}`);
    else assert(/^stakeholder SH-001: "Ana Pérez" role="CISO" org=client raci="\*:C,Security:A,Data Platform:R" versions$/m.test(t1) && /^stakeholder SH-003: "Marta" role="FinOps" org=internal raci=Operations:A inactive$/m.test(t1), `English keywords:\n${t1}`);
  }));
  test('stakeholder text accepts both languages and reports errors with line numbers', () => {
    const ctx = textCtx('en');
    const ok = TXT.parse(['a: A', 'interesado SH-1: "Ana" rol="CISO" org=socio raci=*:c,Seguridad:A versiones', 'stakeholder SH-2: "Luis" inactivo'].join('\n'), ctx);
    eq(ok.errors, [], 'mixed-language input');
    eq(ok.model.stakeholders, [{ id: 'SH-1', name: 'Ana', role: 'CISO', org: 'partner', raci: { '*': 'C', Seguridad: 'A' }, versions: true }, { id: 'SH-2', name: 'Luis', org: 'client', inactive: true }], 'values');
    const bad = TXT.parse(['a: A', 'stakeholder X-1: "bad id"', 'stakeholder SH-1: "x" org=alien raci=Sec:Z,nocolon', 'stakeholder SH-1: "dup"'].join('\n'), ctx);
    eq(bad.errors.map(e => e.line).sort(), [2, 3, 3, 3, 4], 'one error per problem, with its line');
    const es = TXT.parse('stakeholder SH-1: "x" org=alien', textCtx('es'));
    assert(/org no válida/.test(JSON.stringify(es.errors[0])), 'Spanish error message');
  });
  test('shGaps: areas of the decisions without an active accountable stakeholder', () => {
    const sh = SHM.cleanStakeholders(shSet(), {});
    const decs = [{ id: 'ADR-001', area: 'security' }, { id: 'ADR-002', area: 'Platform' }, { id: 'ADR-003', area: 'Operations' }, { id: 'ADR-004', area: ' data  platform ' }, { id: 'ADR-005' }];
    eq(SHM.shGaps({ stakeholders: sh, decisions: decs }), ['Operations', 'data platform'], 'case-insensitive match, inactive stakeholders do not count, no area is ignored');
    eq(SHM.shGaps({ stakeholders: [{ id: 'SH-001', name: 'x', raci: { '*': 'A' } }], decisions: decs }), [], 'A on * covers every area');
    eq(SHM.shGaps({ decisions: decs }), [], 'no stakeholders, no findings');
    eq(SHM.shAreas({ stakeholders: sh, decisions: decs }), ['security', 'Platform', 'Operations', 'data platform'], 'matrix columns: decision areas, then areas only used in the matrix');
    eq(SHM.shAreas({ stakeholders: [{ id: 'SH-001', name: 'x', raci: { Extra: 'R', '*': 'A' } }], decisions: [{ id: 'ADR-001', area: 'Core' }] }), ['Core', 'Extra'], 'areas used only in a matrix come after');
  });
  test('the Stakeholders tab, the finding and the API are wired', () => {
    assert(/data-tab="people"/.test(read('index.html')) && /data-pane="people"/.test(read('index.html')), 'tab and pane in index.html');
    assert(/addFindingSource\('approval'/.test(app) && /approval:no-approver:/.test(app), 'no-approver finding');
    assert(/stakeholders: \(\) => clone\(S\.model\.stakeholders \|\| \[\]\), addStakeholder, updateStakeholder, removeStakeholder/.test(app), 'API');
    assert(/shHasSignoffs\(id\)\) \{ toast/.test(app), 'delete is blocked when the stakeholder has sign-offs');
  });

  /* ======================================================================
     10. Aprobaciones: firmas de ADR y versiones
     ====================================================================== */
  section('Approvals');
  const isDayT = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const APPM = new Function('isDay', `${apprSrc}; return { approversFor, approvalState, cleanSignoffs };`)(isDayT);
  const people = () => [
    { id: 'SH-001', name: 'Ana', raci: { '*': 'C', Security: 'A' } }, { id: 'SH-002', name: 'Luis', raci: { platform: 'A' } },
    { id: 'SH-003', name: 'Eva', raci: { '*': 'A' }, versions: true }, { id: 'SH-004', name: 'Old', raci: { '*': 'A' }, versions: true, inactive: true }, { id: 'SH-005', name: 'Read', raci: { '*': 'I' } }];
  const apprM = { stakeholders: people() };
  test('approversFor: active A on the area (case-insensitive) or on *, versions flag for versions', () => {
    eq(APPM.approversFor('decision', { area: ' security ' }, apprM), ['SH-001', 'SH-003'], 'Security (trimmed, any case) + *');
    eq(APPM.approversFor('decision', { area: 'PLATFORM' }, apprM), ['SH-002', 'SH-003'], 'Platform');
    eq(APPM.approversFor('decision', {}, apprM), ['SH-003'], 'no area uses only *');
    eq(APPM.approversFor('decision', { area: 'Other' }, apprM), ['SH-003'], 'unknown area');
    eq(APPM.approversFor('version', {}, apprM), ['SH-003'], 'versions (inactive left out)');
    eq(APPM.approversFor('decision', { area: 'x' }, {}), [], 'no stakeholders');
  });
  test('approvalState: latest sign-off wins, only the current round counts, empty means not configured', () => {
    const so = (by, verdict, date) => ({ by, verdict, date });
    const d = { area: 'Security', history: [{ status: 'proposed', date: '2026-10-01' }, { status: 'accepted', date: '2026-10-05' }, { status: 'proposed', date: '2026-10-08' }],
      signoffs: [so('SH-001', 'approve', '2026-10-02'), so('SH-003', 'reject', '2026-10-09'), so('SH-003', 'approve', '2026-10-10'), so('SH-001', 'approve', '2026-10-08')] };
    eq(APPM.approvalState('decision', d, apprM), { required: ['SH-001', 'SH-003'], approved: ['SH-001', 'SH-003'], rejected: [], pending: [], complete: true }, 'both approved in the last round');
    d.history.push({ status: 'proposed', date: '2026-10-11' });
    eq(APPM.approvalState('decision', d, apprM).pending, ['SH-001', 'SH-003'], 'a new proposed entry starts a new round');
    d.signoffs.push(so('SH-001', 'reject', '2026-10-12'));
    const st = APPM.approvalState('decision', d, apprM);
    eq([st.rejected, st.pending, st.complete], [['SH-001'], ['SH-003'], false], 'rejection blocks');
    eq(APPM.approvalState('decision', { signoffs: [so('SH-003', 'approve', '2026-01-01')] }, apprM).complete, true, 'no proposed entry: everything counts');
    const v = { reviewSince: '2026-10-05', signoffs: [so('SH-003', 'approve', '2026-10-04')] };
    eq(APPM.approvalState('version', v, apprM).pending, ['SH-003'], 'before reviewSince does not count');
    v.signoffs.push(so('SH-003', 'approve', '2026-10-05'));
    eq(APPM.approvalState('version', v, apprM).complete, true, 'on reviewSince counts');
    eq(APPM.approvalState('version', {}, { stakeholders: [{ id: 'SH-001', name: 'A' }] }), { required: [], approved: [], rejected: [], pending: [], complete: false }, 'not configured');
  });
  test('cleanSignoffs keeps known stakeholders, valid verdicts and dates; trims notes; caps at 200', () => {
    const r = APPM.cleanSignoffs([{ by: 'SH-001', verdict: 'approve', date: '2026-10-08', note: '  ok  ' }, { by: 'SH-009', verdict: 'approve', date: '2026-10-08' }, { by: 'SH-001', verdict: 'maybe', date: '2026-10-08' },
      { by: 'SH-002', verdict: 'reject', date: 'soon' }, { by: 'SH-002', verdict: 'reject', date: '2026-10-09', note: 'x'.repeat(600), extra: 1 }, null, 'x'], apprM);
    eq(r.map(x => [x.by, x.verdict, x.date, (x.note || '').length]), [['SH-001', 'approve', '2026-10-08', 2], ['SH-002', 'reject', '2026-10-09', 500]], 'entries');
    eq(Object.keys(r[0]), ['by', 'verdict', 'date', 'note'], 'key order');
    eq(APPM.cleanSignoffs(Array.from({ length: 250 }, (_, i) => ({ by: 'SH-001', verdict: 'approve', date: '2026-10-08', note: String(i) })), apprM).length, 200, 'limit');
    eq(APPM.cleanSignoffs([{ by: 'SH-001', verdict: 'approve', date: '2026-10-08' }], {}), [], 'without stakeholders everything is dropped');
  });
  test('cleanDecisions keeps signoffs after history, and nothing appears when absent', () => {
    const d = { id: 'ADR-001', title: 'T', status: 'accepted', date: '2026-10-08', context: 'a', history: [{ status: 'accepted', date: '2026-10-08' }], signoffs: [{ by: 'SH-001', verdict: 'approve', date: '2026-10-08' }, { by: 'GHOST', verdict: 'approve', date: '2026-10-08' }] };
    const r = ADRM.cleanDecisions([d], { ...adrModel, stakeholders: people() })[0];
    eq(Object.keys(r).slice(-2), ['history', 'signoffs'], 'order'); eq(r.signoffs.length, 1, 'ghost dropped');
    assert(!('signoffs' in ADRM.cleanDecisions([{ ...d, signoffs: [] }], adrModel)[0]), 'no key without sign-offs');
    assert(!('signoffs' in ADRM.cleanDecisions([d], adrModel)[0]), 'no key when the model has no stakeholders');
  });
  ['en', 'es'].forEach(lang => test(`sign-offs round trip in the text format · ${lang}`, () => {
    const m = withPositions({ title: 'ADR', nodes: [{ id: 'a', label: 'A' }], edges: [] });
    m.decisions = [{ id: 'ADR-001', title: 'T', status: 'accepted', date: '2026-10-09', context: 'c', decision: '', consequences: '', area: 'Security', links: {},
      history: [{ status: 'proposed', date: '2026-10-07' }, { status: 'accepted', date: '2026-10-09' }],
      signoffs: [{ by: 'SH-001', verdict: 'approve', date: '2026-10-08', note: 'Looks "good"; ship' }, { by: 'SH-002', verdict: 'reject', date: '2026-10-09' }] }];
    const ctx = { ...textCtx(lang), stakeholders: ['SH-001', 'SH-002'] }, t1 = TXT.stringify(m, lang), r = TXT.parse(t1, ctx);
    eq(r.errors, [], 'parse errors');
    eq(r.model.decisions[0].signoffs, m.decisions[0].signoffs, 'model');
    assert(TXT.stringify({ ...r.model, meta: m.meta }, lang) === t1, 'text is stable');
    if (lang === 'es') assert(/^  firmas: SH-001 aprueba 2026-10-08 nota="Looks \\"good\\"; ship"; SH-002 rechaza 2026-10-09$/m.test(t1), `Spanish keywords:\n${t1}`);
    else assert(/^  signoffs: SH-001 approve 2026-10-08 note="Looks \\"good\\"; ship"; SH-002 reject 2026-10-09$/m.test(t1), `English keywords:\n${t1}`);
  }));
  test('sign-off text accepts both languages and reports errors with line numbers', () => {
    const ctx = { ...textCtx('en'), stakeholders: ['SH-001'] };
    const ok = TXT.parse(['a: A', 'adr ADR-1: "T"', '  firmas: SH-001 aprobado 2026-10-08 nota=ok'].join('\n'), ctx);
    eq(ok.errors, [], 'mixed-language input'); eq(ok.model.decisions[0].signoffs, [{ by: 'SH-001', verdict: 'approve', date: '2026-10-08', note: 'ok' }], 'values');
    const bad = TXT.parse(['adr ADR-1: "T"', '  signoffs: SH-009 approve 2026-10-08', '  signoffs: SH-001 maybe 2026-10-08; SH-001 approve nope; SH-001 approve'].join('\n'), ctx);
    eq(bad.errors.map(e => e.line).sort(), [2, 3, 3, 3], 'unknown stakeholder and malformed entries, each with its line');
  });
  test('old documents stay byte-identical (no sign-off keys in text or JSON order)', () => {
    const m = withPositions({ title: 'ADR', nodes: [{ id: 'a', label: 'A' }], edges: [] });
    m.decisions = [{ id: 'ADR-001', title: 'T', status: 'accepted', date: '2026-10-09', context: 'c', decision: '', consequences: '', links: {}, history: [{ status: 'accepted', date: '2026-10-09' }] }];
    assert(!/signoffs|firmas/.test(TXT.stringify(m, 'en') + TXT.stringify(m, 'es')), 'no sign-off lines');
    assert(!/signoffs/.test(serializeM(m, true)), 'no sign-off key in the JSON');
  });

  test('the stakeholder and sign-off examples of the text-format docs parse without errors · en and es', () => {
    const ex = { en: ['adr ADR-001: "T" status=accepted area="Security"', '  signoffs: SH-001 approve 2026-10-08 note="ok"; SH-002 reject 2026-10-09',
      'stakeholder SH-001: "Ana Pérez" role="CISO" org=client raci=*:C,Security:A,Platform:R versions', 'stakeholder SH-002: "Luis Gómez" role="Data owner" org=partner raci=Consumption:A,*:I inactive'],
    es: ['adr ADR-001: "T" estado=aceptada área="Seguridad"', '  firmas: SH-001 aprueba 2026-10-08 nota="ok"; SH-002 rechaza 2026-10-09',
      'interesado SH-001: "Ana Pérez" rol="CISO" org=cliente raci=*:C,Seguridad:A,Platform:R versiones', 'interesado SH-002: "Luis Gómez" rol="Dueño del dato" org=socio raci=Consumo:A,*:I inactivo'] };
    ['en', 'es'].forEach(lang => {
      const r = TXT.parse(ex[lang].join('\n'), textCtx(lang));
      eq(r.errors, [], `parse errors (${lang})`);
      eq(r.model.stakeholders.map(x => x.id), ['SH-001', 'SH-002'], `stakeholders (${lang})`);
    });
  });

  /* ======================================================================
     9. Fases: hoja de ruta de la arquitectura (phase / until en nodos, conexiones y grupos)
     ====================================================================== */
  section('Phases');
  const PHM = new Function(`${between('/* phaseModel:start */', '/* phaseModel:end */')}; return { cleanEffort, cleanExtra, cleanEstimation, cleanPhases, cleanPhaseRefs, phaseIndex, inPhase, phaseState, phaseStates, phaseModel, phaseDiff, phaseStats, phaseRows };`)();
  const snapshotM = new Function('clone', `${app.slice(app.indexOf('  const snapshotOf = m => {'), app.indexOf('  const prepared = v =>'))}; return snapshotOf;`)(o => JSON.parse(JSON.stringify(o)));
  const phList = () => [{ id: 'mvp', name: 'MVP', date: '2026-12', goal: 'Batch ingestion' }, { id: 'wave1', name: 'Wave 1', date: '2027-03-15' }, { id: 'wave2', name: 'Wave 2' }];
  // g1 (sin campos) tiene src (siempre), cdc (wave1), upload (mvp, se retira en wave1); g2 solo tiene stream (wave2); lone no tiene nodos
  const phDoc = () => ({ title: 'Plan', phases: phList(),
    groups: [{ id: 'g1', label: 'G1' }, { id: 'g2', label: 'G2' }, { id: 'g3', label: 'G3', parent: 'g1' }, { id: 'lone', label: 'Lone' }],
    nodes: [{ id: 'src', label: 'Src', group: 'g1', cost: 100 }, { id: 'upload', label: 'Upload', group: 'g3', phase: 'mvp', until: 'wave1', cost: 10 }, { id: 'cdc', label: 'CDC', group: 'g1', phase: 'wave1', cost: 200 }, { id: 'stream', label: 'Stream', group: 'g2', phase: 'wave2', cost: 300 }, { id: 'bi', label: 'BI', phase: 'mvp' }],
    edges: [{ id: 'e1', from: 'src', to: 'upload' }, { id: 'e2', from: 'src', to: 'cdc' }, { id: 'e3', from: 'cdc', to: 'stream' }, { id: 'e4', from: 'src', to: 'bi', phase: 'wave1' }] });
  test('cleanPhases: ids, names, dates, goals and the limit of 12', () => {
    const r = PHM.cleanPhases([{ id: ' mvp ', name: '  The   MVP ', date: '2026-12', goal: ' g\r\nh ' }, { id: 'mvp', name: 'dup' }, { id: 'bad id' }, { id: 'x'.repeat(31) }, { id: 'w1' }, { id: 'w2', name: 'n'.repeat(90), date: '2026-13', goal: '' }, { id: 'w3', date: '2027-02-30' }, { id: 'w4', date: '2028-02-29' }, null, 'x', []]);
    eq(r.map(p => p.id), ['mvp', 'w1', 'w2', 'w3', 'w4'], 'ids'); eq(Object.keys(r[0]), ['id', 'name', 'date', 'goal'], 'key order');
    eq([r[0].name, r[0].goal, r[1].name], ['The MVP', 'g\nh', 'w1'], 'normalized text, name falls back to the id');
    eq([r[2].name.length, r[2].date, r[2].goal, r[3].date, r[4].date], [60, undefined, undefined, undefined, '2028-02-29'], 'name capped, invalid dates and empty goal dropped');
    eq(PHM.cleanPhases(Array.from({ length: 20 }, (_, i) => ({ id: `p${i}` }))).length, 12, 'at most 12'); eq(PHM.cleanPhases(undefined), [], 'no key');
  });
  test('cleanPhaseRefs drops unknown ids and an until that does not come after phase', () => {
    const ph = PHM.cleanPhases(phList()), els = [{ phase: 'wave1', until: 'wave2' }, { phase: 'wave1', until: 'mvp' }, { phase: 'wave1', until: 'wave1' }, { phase: 'nope', until: 'wave2' }, { until: 'mvp' }, { until: 'wave1' }, { phase: 'mvp', until: 'ghost' }, {}];
    PHM.cleanPhaseRefs(els, ph);
    eq(els, [{ phase: 'wave1', until: 'wave2' }, { phase: 'wave1' }, { phase: 'wave1' }, { until: 'wave2' }, {}, { until: 'wave1' }, { phase: 'mvp' }, {}], 'each element');
    const none = [{ phase: 'mvp', until: 'wave1' }]; PHM.cleanPhaseRefs(none, []); eq(none, [{}], 'without phases every reference goes');
  });
  test('inPhase / phaseState: present, future and retired', () => {
    const m = phDoc();
    eq([0, 1, 2].map(i => PHM.inPhase(m.nodes[1], i, m)), [true, false, false], 'upload: mvp only');
    eq([0, 1, 2].map(i => PHM.phaseState(m.nodes[1], i, m)), [0, -1, -1], 'upload retired from wave1');
    eq([0, 1, 2].map(i => PHM.phaseState(m.nodes[2], i, m)), [1, 0, 0], 'cdc future in mvp');
    eq([0, 1, 2].map(i => PHM.inPhase(m.nodes[0], i, m)), [true, true, true], 'no phase = from the start');
    eq(PHM.inPhase(m.nodes[2], -1, m), true, 'All shows everything');
  });
  test('phaseModel keeps what exists in the phase, regroups, follows the ends of edges and leaves the rest alone', () => {
    const m = phDoc(); m.decisions = [{ id: 'ADR-001' }]; m.notes = [{ id: 'n' }];
    const p0 = PHM.phaseModel(m, 0), p1 = PHM.phaseModel(m, 1), p2 = PHM.phaseModel(m, 2);
    eq(p0.nodes.map(n => n.id), ['src', 'upload', 'bi'], 'mvp nodes'); eq(p1.nodes.map(n => n.id), ['src', 'cdc', 'bi'], 'wave1 nodes'); eq(p2.nodes.map(n => n.id), ['src', 'cdc', 'stream', 'bi'], 'wave2 nodes');
    eq(p0.edges.map(e => e.id), ['e1'], 'edges need both ends and their own phase'); eq(p1.edges.map(e => e.id), ['e2', 'e4'], 'wave1 edges'); eq(p2.edges.map(e => e.id), ['e2', 'e3', 'e4'], 'wave2 edges');
    eq(p0.groups.map(g => g.id), ['g1', 'g3', 'lone'], 'g2 has no node yet; lone has no node at all and stays'); eq(p1.groups.map(g => g.id), ['g1', 'lone'], 'g3 lost its only node'); eq(p2.groups.map(g => g.id), ['g1', 'g2', 'lone'], 'g2 appears with stream');
    eq(PHM.phaseModel(m, -1), m, 'All = the same model'); assert(PHM.phaseModel({ nodes: [], edges: [], groups: [] }, 1).nodes.length === 0, 'no phases = the same model');
    assert(p0.decisions === m.decisions && p0.notes === m.notes && p0.title === 'Plan' && p0.phases === m.phases, 'everything else untouched'); assert(p0.nodes[0] !== m.nodes[0], 'a new model, not the original');
    eq(m.nodes.length, 5, 'the original is not changed');
    const n = { phases: phList(), groups: [{ id: 'a', label: 'A', phase: 'wave1' }, { id: 'b', label: 'B', parent: 'a' }, { id: 'c', label: 'C', phase: 'wave1' }], nodes: [{ id: 'x', group: 'b' }, { id: 'z', group: 'c' }], edges: [] };
    const q = PHM.phaseModel(n, 0); eq([q.groups.map(g => [g.id, g.parent]), q.nodes.map(x => x.group)], [[['b', undefined]], ['b', undefined]], 'a subgroup of a group that is not there yet loses its parent, and a node whose group is not there yet leaves it');
    eq(PHM.phaseModel({ phases: phList(), groups: [{ id: 'a', label: 'A', phase: 'mvp', until: 'wave1' }, { id: 'b', label: 'B', parent: 'a' }], nodes: [{ id: 'x', group: 'b' }], edges: [] }, 1).groups.map(g => g.parent), [undefined], 'a subgroup of a retired group loses its parent');
  });
  test('phaseDiff: what enters and what leaves, versus the previous phase', () => {
    const m = phDoc();
    eq(PHM.phaseDiff(m, 0), { added: ['upload', 'bi'], retired: [] }, 'phase 0: nodes that declare it');
    eq(PHM.phaseDiff(m, 1), { added: ['cdc'], retired: ['upload'] }, 'wave1'); eq(PHM.phaseDiff(m, 2), { added: ['stream'], retired: [] }, 'wave2');
    eq([PHM.phaseDiff(m, -1), PHM.phaseDiff(m, 9)], [{ added: [], retired: [] }, { added: [], retired: [] }], 'out of range');
  });
  test('phaseStats: nodes, edges, cost and findings of the phase model', () => {
    const m = phDoc(), seen = [], h = { monthly: pm => pm.nodes.reduce((s, n) => s + (n.cost || 0), 0), findings: pm => { seen.push(pm.nodes.length); return [{ severity: 'critical' }, { severity: 'high' }, { severity: 'medium' }, { severity: 'low' }, { severity: 'low' }]; } };
    eq(PHM.phaseStats(m, 1, h), { nodes: 3, edges: 2, cost: 300, findings: { high: 2, medium: 1, low: 2 }, datasets: 0, storage: null }, 'wave1'); eq(seen, [3], 'helpers get the phase model');
    eq(PHM.phaseStats(m, 0, h).cost, 110, 'mvp cost'); eq(PHM.phaseStats(m, 2, h).cost, 600, 'wave2 cost');
  });
  test('phaseRows: one row per phase with counts, cost, cost delta and findings; no cost shows null', () => {
    const m = phDoc(), h = { monthly: pm => pm.nodes.reduce((s, n) => s + (n.cost || 0), 0), hasCost: pm => pm.nodes.some(n => n.cost != null), findings: pm => (pm.nodes.length > 3 ? [{ severity: 'high' }, { severity: 'low' }] : []) };
    const r = PHM.phaseRows(m, h);
    eq(r.map(x => [x.id, x.nodes, x.added, x.retired, x.cost, x.dCost]), [['mvp', 3, 2, 0, 110, null], ['wave1', 3, 1, 1, 300, 190], ['wave2', 4, 1, 0, 600, 300]], 'rows'); eq(r[2].findings, { high: 1, medium: 0, low: 1 }, 'findings'); eq(r[1].retiredIds, ['upload'], 'ids');
    const none = PHM.phaseRows({ ...phDoc(), nodes: phDoc().nodes.map(n => ({ ...n, cost: undefined })) }, h);
    eq(none.map(x => [x.cost, x.dCost]), [[null, null], [null, null], [null, null]], 'no cost anywhere'); eq(PHM.phaseRows({ nodes: [], edges: [], groups: [] }, h), [], 'no phases');
  });
  test('report and presentation wiring for phases', () => {
    assert(/REP_SECS = \[[^\]]*'approvals', 'phases', 'estimation', 'migration', 'radar', 'versions'/.test(app), 'section after approvals; estimation, migration and radar follow the phases'); assert(/phases: !!m\.phases\?\.length/.test(app), 'available with phases'); assert(app.includes("want('phases')") && app.includes('presentPhases'), 'section and API');
    const i18n = read('src/i18n.js'); ['rep.s.phases', 'rep.k.phases', 'rep.h.phase', 'phase.present.tip', 'phase.present.step', 'phase.cmp.title', 'phase.cmp.cost'].forEach(k => assert(i18n.split(`'${k}'`).length - 1 === 2, `${k} in en and es`));
  });
  test('without phases the JSON, the snapshot and the text stay byte-identical', () => {
    const base = withPositions({ title: 'Plain', nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b' }] });
    eq(serializeM(base), serializeM({ ...base, phases: [] }), 'JSON'); assert(!/"phases"|"phase"|"until"/.test(serializeM(base)), 'no key in the JSON');
    eq(JSON.stringify(snapshotM(base)), JSON.stringify(snapshotM({ ...base, phases: [] })), 'snapshot'); assert(!('phases' in snapshotM(base)), 'no phases in the snapshot');
    ['en', 'es'].forEach(l => { const t = TXT.stringify(base, l); eq(TXT.stringify({ ...base, phases: [] }, l), t, 'same text'); assert(!/phase|fase|until|hasta/i.test(t.replace(/^t[ií]tulo: .*$/m, '')), `no phase words (${l})`); const p = TXT.parse(t, textCtx(l)); eq([p.errors, p.model.phases], [[], []], 'parse'); });
  });
  test('JSON writes phases after layerNames/routing and node fields in the canonical order; snapshots keep phases and element fields', () => {
    const m = withPositions(phDoc()), j = serializeM(m);
    assert(j.indexOf('"phases"') > j.indexOf('"title"') && j.indexOf('"phases"') < j.indexOf('"groups"'), 'phases before groups');
    assert(/\{ "id": "mvp", "name": "MVP", "date": "2026-12", "goal": "Batch ingestion" \}/.test(j), 'phase key order');
    assert(/"label": "Upload", "group": "g3"[^}]*"phase": "mvp", "until": "wave1" \}/.test(j), 'node phase and until at the end');
    assert(/"to": "bi", "phase": "wave1" \}/.test(j), 'edge phase');
    const s = snapshotM(m); eq(s.phases, phList(), 'phases in the snapshot'); eq(s.nodes[1].until, 'wave1', 'element fields in the snapshot'); assert(s.phases !== m.phases, 'a copy');
    assert(/phase: 'wave1'|'phase', 'until'/.test(app) && /DIFF_FIELDS = \{[\s\S]*?'phase', 'until'/.test(app), 'version comparison sees phase and until');
  });
  test('phases text round trip · en and es', () => {
    ['en', 'es'].forEach(lang => {
      const m = withPositions(phDoc()); m.groups = m.groups.filter(g => g.id !== 'lone'); m.groups[0].phase = 'mvp'; m.groups[1].phase = 'wave2'; m.groups[1].until = undefined; m.edges[3].until = 'wave2';
      m.phases[0].goal = 'Batch "ingestion" of ERP'; const t1 = TXT.stringify(m, lang), r = TXT.parse(t1, textCtx(lang));
      eq(r.errors, [], `parse errors (${lang})`); eq(r.model.phases, m.phases, 'phases');
      const f = x => ({ phase: x.phase, until: x.until });
      const byId = (l, g) => l.map(n => [n.id, JSON.parse(JSON.stringify(g(n)))]).sort((x, y) => (x[0] < y[0] ? -1 : 1));
      eq(byId(r.model.nodes, f), byId(m.nodes, f), 'node phase / until');
      eq(byId(r.model.groups, g => g.phase ?? null), byId(m.groups, g => g.phase ?? null), 'group phase'); eq(r.model.edges.map(e => [e.from, e.to, e.phase, e.until]).map(x => JSON.stringify(x)), m.edges.map(e => [e.from, e.to, e.phase, e.until]).map(x => JSON.stringify(x)), 'edge phase / until');
      assert(TXT.stringify({ ...r.model, meta: m.meta }, lang) === t1, `text is stable (${lang})`);
      if (lang === 'es') assert(/^fase mvp: "MVP" fecha=2026-12 objetivo="Batch \\"ingestion\\" of ERP"$/m.test(t1) && /fase=wave1 hasta=wave2$/m.test(t1) && /^grupo g1 "G1" fase=mvp \{$/m.test(t1), `Spanish words:\n${t1}`);
      else assert(/^phase mvp: "MVP" date=2026-12 goal="Batch \\"ingestion\\" of ERP"$/m.test(t1) && /phase=wave1 until=wave2$/m.test(t1) && /^group g1 "G1" phase=mvp \{$/m.test(t1), `English words:\n${t1}`);
      assert(t1.indexOf('phase ') < t1.indexOf('src:') || t1.indexOf('fase ') < t1.indexOf('src:'), 'phase lines come before the nodes');
    });
  });
  test('phases text: both languages parse, and unknown, misordered or malformed phases report their line', () => {
    const ok = TXT.parse(['phase mvp: "MVP" fecha=2026-12 goal="G"', 'fase w1: Ola 1', 'a: A fase=mvp', 'b: B phase=w1 hasta=w1x'].join('\n'), textCtx('en'));
    eq(ok.model.phases, [{ id: 'mvp', name: 'MVP', date: '2026-12', goal: 'G' }, { id: 'w1', name: 'Ola 1' }], 'mixed-language phase lines'); eq(ok.model.nodes[0].phase, 'mvp', 'fase=');
    eq(ok.errors.map(e => e.line), [4], 'unknown until reported on its line');
    const bad = TXT.parse(['phase mvp: "MVP"', 'phase w1: "W1" date=2026-13', 'phase mvp: "dup"', 'phase bad id: "x"', 'a: A phase=nope', 'b: B phase=w1 until=mvp', 'a -> b : x until=zzz', 'group g "G" phase=ghost {', '}'].join('\n'), textCtx('en'));
    eq(bad.errors.map(e => e.line).sort((x, y) => x - y), [2, 3, 5, 6, 7, 8].concat(4).sort((x, y) => x - y), 'one error per problem, with its line');
    const many = TXT.parse(Array.from({ length: 14 }, (_, i) => `phase p${i}: "P${i}"`).join('\n'), textCtx('en'));
    eq([many.model.phases.length, many.errors.map(e => e.line)], [12, [13, 14]], 'at most 12 phases');
    const ex = ['phase mvp: "MVP" date=2026-12 goal="Batch ingestion and first BI"', 'phase wave1: "Wave 1" date=2027-03', 'src: Source', 'cdc: CDC phase=wave1', 'tmp: Upload phase=mvp until=wave1', 'src -> cdc : x phase=wave1'].join('\n');
    eq(TXT.parse(ex, textCtx('en')).errors, [], 'the example of the text-format header parses');
  });
  test('the phase examples of the text-format docs parse without errors · en and es', () => {
    const ex = { en: ['phase mvp: "MVP" date=2026-12 goal="Batch ingestion of ERP and CRM files, first BI"', 'phase wave1: "Wave 1" date=2027-03 goal="Change data capture and the gold layer"', 'phase wave2: "Wave 2" date=2027-06', '',
      'erp: ERP [db]', 'crm: CRM [db]', 'upload: Manual file upload phase=mvp until=wave1', 'cdc: CDC replication phase=wave1', 'stream: Event stream phase=wave2', 'erp -> cdc : changes phase=wave1', 'erp -> upload : extract phase=mvp'],
    es: ['fase mvp: "MVP" fecha=2026-12 objetivo="Ingesta por lotes de archivos del ERP y el CRM, primer BI"', 'fase ola1: "Ola 1" fecha=2027-03 objetivo="Captura de cambios y la capa oro"', 'fase ola2: "Ola 2" fecha=2027-06', '',
      'erp: ERP [db]', 'crm: CRM [db]', 'subida: Carga manual de archivos fase=mvp hasta=ola1', 'cdc: Replicación CDC fase=ola1', 'flujo: Flujo de eventos fase=ola2', 'erp -> cdc : cambios fase=ola1', 'erp -> subida : extracción fase=mvp'] };
    ['en', 'es'].forEach(lang => {
      const r = TXT.parse(ex[lang].join('\n'), textCtx(lang));
      eq(r.errors, [], `parse errors (${lang})`);
      eq(r.model.phases.length, 3, `phases (${lang})`);
      eq(r.model.nodes.filter(n => n.until).map(n => [n.id, n.phase, n.until]), [[lang === 'en' ? 'upload' : 'subida', 'mvp', lang === 'en' ? 'wave1' : 'ola1']], `until (${lang})`);
    });
  });
  test('the dataset examples of the text-format docs parse and keep their datasets, columns, rules, contracts and latencies · en and es', () => {
    // El bloque de ejemplo es el único bloque entre ``` que empieza una línea `dataset DS-…` (o `conjunto DS-…`)
    const blocks = md => md.split('```').filter((s, i) => i % 2 === 1 && /^(dataset|conjunto) DS-/m.test(s));
    [['en', 'docs/text-format.md'], ['es', 'docs/text-format.es.md']].forEach(([lang, file]) => {
      const bs = blocks(read(file));
      eq(bs.length, 1, `one dataset example in ${file}`);
      const r = TXT.parse(bs[0], textCtx(lang));
      eq(r.errors, [], `parse errors (${lang})`);
      const ds = r.model.datasets || [];
      eq(ds.map(d => d.name), ['orders', 'customers'], `dataset names (${lang})`);
      eq(ds.map(d => (d.schema || []).length), [3, 1], `column count (${lang})`);
      eq(ds.map(d => (d.quality || []).length), [2, 1], `rule count (${lang})`);
      eq(ds.map(d => d.contract?.status), ['agreed', 'draft'], `contract status (${lang})`);
      eq(ds[1].phase, lang === 'en' ? 'wave1' : 'ola1', `phase of customers (${lang})`);
      eq(r.model.edges.map(e => e.latency), ['1d', '15m'], `latencies (${lang})`);
    });
  });
  test('the phase model stays out of the old paths: markers, ORDER, API-facing helpers exist', () => {
    ['ORDER.phase = [\'id\', \'name\', \'date\', \'goal\', \'extra\']'].forEach(x => assert(app.includes(x), x));
    assert(/cleanPhaseRefs\(\[\.\.\.m\.groups, \.\.\.m\.nodes, \.\.\.m\.edges\], m\.phases\)/.test(app), 'normalize cleans the element fields'); assert(/if \(m\.phases\?\.length\) head\.push\(arr\('phases'/.test(app), 'JSON only writes the key when there are phases');
  });

  test('canvas wiring: API, keyboard, inspector fields, bar and manager exist; every phase key is in en and es', () => {
    ['phases:', 'addPhase', 'updatePhase', 'removePhase', 'setPhase', 'get phase()', 'phaseModel: i =>', 'phaseStats: i =>'].forEach(k => assert(app.includes(k), `API ${k}`));
    assert(/ev\.key === '\[' \|\| ev\.key === '\]'/.test(app), 'keys [ and ]'); assert((app.match(/\$\{phaseField\(t\)\}/g) || []).length === 4, 'phase field in the node, edge, group and multi-selection panels');
    const idx = read('index.html'); assert(/id="phase-bar"/.test(idx) && /id="phases-box"/.test(idx), 'bar and manager in the page');
    const used = [...new Set([...app.matchAll(/T\('(phase\.[\w.]+)'/g)].map(m => m[1]))];
    const i18n = read('src/i18n.js');
    used.forEach(k => assert(i18n.split(`'${k}':`).length === 3, `${k} is defined once in en and once in es`));
  });
  test('lakehouse template declares ten datasets: unique ids and names, valid owners, consumers, phases, edge names and latencies', () => {
    const m = templates('en').find(x => /Lakehouse greenfield/.test(x.name)).model, es = templates('es').find(x => /Lakehouse greenfield/.test(x.name)).model;
    const ds = m.datasets || [], names = new Set(ds.map(d => d.name));
    eq(ds.length, 10, 'ten datasets');
    assert(ds.every(d => /^DS-\d{3}$/.test(d.id)), 'ids are DS-NNN');
    eq(new Set(ds.map(d => d.id)).size, ds.length, 'ids are unique');
    eq(names.size, ds.length, 'names are unique');
    const nodes = new Set(m.nodes.map(n => n.id)), sh = new Set(m.stakeholders.map(s => s.id)), phases = new Set(m.phases.map(p => p.id));
    ds.forEach(d => {
      if (typeof d.owner === 'string' && /^SH-/.test(d.owner)) assert(sh.has(d.owner), `${d.name} owner ${d.owner} is a stakeholder`);
      (d.contract?.consumers || []).forEach(id => assert(nodes.has(id), `${d.name} consumer ${id} is a node`));
      if (d.phase) assert(phases.has(d.phase), `${d.name} phase ${d.phase} exists`);
    });
    assert(ds.some(d => d.product), 'at least one data product');
    m.edges.forEach(e => (e.datasets || []).forEach(n => assert(names.has(n), `edge ${e.from} -> ${e.to} uses ${n}, declared`)));
    m.edges.forEach(e => { if (e.latency != null) assert(/^\d+(\.\d+)?\s*(m|min|h|d)$/.test(e.latency), `latency ${e.latency} is a duration`); });
    eq(es.datasets.map(d => d.name), ds.map(d => d.name), 'the es template has the same dataset names');
  });

  test('tab groups wiring: every tab is in a known group, group keys exist in en and es', () => {
    const idx = read('index.html'), i18n = read('src/i18n.js');
    const groups = idx.split('<button class="tabg').slice(1).map(x => x.split('data-g="')[1].split('"')[0]);
    assert(groups.join() === 'design,gov,data', 'groups design, gov, data');
    const tabs = idx.split('<button data-group="').slice(1); assert(tabs.length === 11, 'eleven tabs carry data-group'); assert(tabs.filter(x => x.startsWith('design')).length === 5 && tabs.filter(x => x.startsWith('gov')).length === 5 && tabs.filter(x => x.startsWith('data')).length === 1, 'five tabs in design and gov, one in data'); assert(idx.includes('data-group="design" class="tab" data-tab="versions"'), 'versions in design');
    tabs.forEach(x => assert(groups.includes(x.split('"')[0]) && x.includes('data-tab="'), 'tab in a known group'));
    ['tabg.label', 'tabg.design', 'tabg.gov', 'tabg.data'].forEach(k => assert(i18n.split(`'${k}':`).length === 3, `${k} defined once in en and once in es`));
    assert(idx.includes('id="review-badge-g"'), 'review badge mirrored on the group button');
    const body = idx.split('<body')[1]; assert(body.split('<div').length === body.split('</div>').length, 'every div in the page body is closed once');
    assert(/<aside class="sidebar">[\s\S]*data-pane="components"[\s\S]*<\/aside>/.test(idx) && !/<\/div>\s*<\/div>\s*<div class="pane on"/.test(idx), 'panes stay inside the side panel');
  });

  /* ======================================================================
     10. Conjuntos de datos: catálogo, contrato de datos, frescura de extremo a extremo, latencia
     ====================================================================== */
  section('Datasets');
  const DSM = new Function(`${between('/* datasetModel:start */', '/* datasetModel:end */')}; return { cleanCatalog, catalog, e2eFreshness, storageEstimate, renameDataset, datasetIssues };`)();
  const DSD = new Function('fold', `const dsKey = s => String(s).trim().toLowerCase(); ${app.slice(app.indexOf('  function lineageOf('), app.indexOf('  // Conjuntos de datos que entran y salen de un nodo'))}\n${app.slice(app.indexOf('  const DUR_UNITS'), app.indexOf('  const numFmt'))}\nreturn { lineageOf, parseDur, normDur };`)(fold);
  const dsLayer = v => { const k = fold(v).trim(), DLs = C.dataLayers || {}, AL = C.layerAliases || {}; return DLs[k] ? k : DLs[AL[k]] ? AL[k] : null; };
  const dsClean = (raw, m) => DSM.cleanCatalog(raw, m || { nodes: [{ id: 'bi' }, { id: 'api' }], phases: [{ id: 'mvp' }, { id: 'wave1' }] }, { layer: dsLayer, classes: Object.keys(C.dataClasses || {}), normDur: DSD.normDur });
  const dsFull = () => ({ id: 'DS-007', name: ' orders ', domain: 'Sales', layer: 'raw', description: 'Orders\r\nfrom ERP', owner: 'SH-003', steward: 'Ana', product: true, classes: ['pii', 'nope'], format: 'Delta', freshness: '4 h',
    volume: { perDay: '2.5', retentionDays: 365 }, schema: [{ name: 'order_id', type: 'string', key: true }, { name: 'email', type: 'string', pii: true, nullable: false, desc: 'e-mail' }, { name: '  ' }],
    quality: [{ rule: 'not_null', column: 'order_id', severity: 'high' }, { rule: 'range', param: '0..10' }, { rule: 'bogus' }], contract: { version: '1.0.0', status: 'agreed', consumers: ['bi', 'ghost', 'bi'], terms: 'Daily' }, phase: 'wave1' });
  test('cleanCatalog keeps the fields of a dataset in canonical key order and normalizes them', () => {
    const d = dsClean([dsFull()])[0];
    eq(Object.keys(d), ['id', 'name', 'domain', 'layer', 'description', 'owner', 'steward', 'product', 'classes', 'format', 'freshness', 'volume', 'schema', 'quality', 'contract', 'phase'], 'keys');
    eq([d.id, d.name, d.layer, d.description, d.classes, d.format, d.freshness, d.volume, d.phase], ['DS-007', 'orders', 'bronze', 'Orders\nfrom ERP', ['pii'], 'delta', '4h', { perDay: 2.5, retentionDays: 365 }, 'wave1'], 'values (alias raw → bronze, unknown class dropped, 4 h → 4h)');
    eq(d.schema.map(c => Object.keys(c)), [['name', 'type', 'key'], ['name', 'type', 'pii', 'nullable', 'desc']], 'columns: nameless dropped, key order, nullable only when false');
    eq(d.quality, [{ rule: 'not_null', column: 'order_id', severity: 'high' }, { rule: 'range', param: '0..10' }], 'unknown rule dropped');
    eq(d.contract, { version: '1.0.0', status: 'agreed', consumers: ['bi'], terms: 'Daily' }, 'consumers must be nodes, no repeats');
  });
  test('cleanCatalog drops invalid values, duplicates by key, renumbers ids and enforces the limits', () => {
    const r = dsClean([{ name: 'a', id: 'DS-002' }, { name: 'A ', id: 'DS-003' }, { name: 'b', id: 'DS-002' }, { name: 'c', id: 'nope' }, { name: '' }, null, 'x', { id: 'DS-009', name: 'd', freshness: 'soon', phase: 'ghost', format: 'xml', layer: 'nope', volume: { perDay: -1, retentionDays: 'x' }, contract: {} }]);
    eq(r.map(d => [d.id, d.name]), [['DS-002', 'a'], ['DS-010', 'b'], ['DS-011', 'c'], ['DS-009', 'd']], 'later duplicates by name key dropped; duplicate and invalid ids renumbered after the highest');
    eq(Object.keys(r[3]), ['id', 'name'], 'invalid duration, phase, format, layer, volume and empty contract are dropped');
    eq(dsClean({}), [], 'not a list'); eq(dsClean(Array.from({ length: 600 }, (_, i) => ({ name: `d${i}` }))).length, 500, 'at most 500 datasets');
    const big = dsClean([{ name: 'x'.repeat(200), domain: 'd'.repeat(90), schema: Array.from({ length: 400 }, (_, i) => ({ name: `c${i}`, type: 't'.repeat(60) })), quality: Array.from({ length: 150 }, () => ({ rule: 'unique' })) }])[0];
    eq([big.name.length, big.domain.length, big.schema.length, big.schema[0].type.length, big.quality.length], [120, 60, 300, 40, 100], 'limits: name 120, domain 60, 300 columns, type 40, 100 rules');
    eq(dsClean([{ name: 'k', contract: { status: 'agreed' } }])[0].contract, { version: '1.0.0', status: 'agreed' }, 'a contract without version gets 1.0.0');
    eq(dsClean([{ name: 'v', volume: { retentionDays: 30.4 } }])[0].volume, { retentionDays: 30 }, 'volume keeps only what is valid');
  });
  test('absence is byte-identical: no datasets and no latency write no key in the JSON, the snapshot or the text', () => {
    const base = { title: 't', groups: [], nodes: [{ id: 'a', label: 'A', type: 'generic', x: 0, y: 0 }], edges: [] };
    eq(serializeM(base), serializeM({ ...base, datasets: [] }), 'JSON'); assert(!/dataset|latency/.test(serializeM(base)), 'no key in the JSON');
    eq(JSON.stringify(snapshotM(base)), JSON.stringify(snapshotM({ ...base, datasets: [] })), 'snapshot'); assert(!JSON.stringify(snapshotM(base)).includes('datasets'), 'no key in the snapshot');
    ['en', 'es'].forEach(l => { eq(TXT.stringify(base, l), TXT.stringify({ ...base, datasets: [] }, l), `text ${l}`); assert(!/dataset|conjunto|latency|latencia/.test(TXT.stringify(base, l)), `no dataset words in the text ${l}`); });
    eq(DSM.datasetIssues({ ...base, edges: [{ id: 'e1', from: 'a', to: 'a', datasets: ['x'] }] }, { T: k => k, lineageOf: DSD.lineageOf, parseDur: DSD.parseDur }), [], 'no findings when the diagram declares no dataset');
  });
  test('the JSON writes datasets right after phases, with the field order of each part, and the snapshot keeps them', () => {
    const m = { title: 't', phases: [{ id: 'mvp', name: 'MVP' }, { id: 'wave1', name: 'W1' }], groups: [], nodes: [{ id: 'bi', label: 'BI', type: 'generic', x: 0, y: 0 }], edges: [{ id: 'e1', from: 'bi', to: 'bi', latency: '1h', datasets: ['orders'] }], datasets: dsClean([dsFull()]) };
    const j = serializeM(m);
    assert(j.indexOf('"phases"') < j.indexOf('"datasets"') && j.indexOf('"datasets"') < j.indexOf('"groups"'), 'datasets between phases and groups');
    assert(j.includes('{ "id": "DS-007", "name": "orders", "domain": "Sales", "layer": "bronze"'), 'dataset key order');
    assert(j.includes('"schema": [{"name":"order_id","type":"string","key":true},{"name":"email","type":"string","pii":true,"nullable":false,"desc":"e-mail"}]'), 'column key order');
    assert(j.includes('"contract": {"version":"1.0.0","status":"agreed","consumers":["bi"],"terms":"Daily"}') && j.includes('"volume": {"perDay":2.5,"retentionDays":365}'), 'contract and volume key order');
    assert(j.includes('"datasets": ["orders"], "latency": "1h"'), 'latency right after the edge datasets');
    eq(snapshotM(m).datasets, m.datasets, 'the snapshot keeps the datasets (versions)'); eq(JSON.parse(j).datasets, m.datasets, 'the JSON round trips');
  });
  // erp → cdc → lake → bi (15m + 1h + 4h) y un atajo erp → lake → bi (sin latencia en el primer salto)
  const dsLat = () => ({ nodes: ['erp', 'cdc', 'lake', 'bi', 'api'].map(id => ({ id })), datasets: [{ id: 'DS-001', name: 'orders', freshness: '4h' }, { id: 'DS-002', name: 'stock' }],
    edges: [{ id: 'e1', from: 'erp', to: 'cdc', datasets: ['Orders'], latency: '15m' }, { id: 'e2', from: 'cdc', to: 'lake', datasets: ['orders', 'stock'], latency: '1h' }, { id: 'e3', from: 'lake', to: 'bi', datasets: ['orders'], latency: '4h' },
      { id: 'e4', from: 'erp', to: 'lake', datasets: ['orders'] }, { id: 'e5', from: 'lake', to: 'api', datasets: ['ghost'] }] });
  const e2e = (m, n) => DSM.e2eFreshness(m, n, DSD);
  const MIN = 60000;
  test('catalog lists the declared datasets first, then the undeclared names used on connections', () => {
    const c = DSM.catalog(dsLat());
    eq(c.map(x => [x.name, x.declared, x.edges]), [['orders', true, 4], ['stock', true, 1], ['ghost', false, 1]], 'order and counts');
    eq(c[0].nodes.sort(), ['bi', 'cdc', 'erp', 'lake'], 'nodes touched'); assert(c[0].ds && c[2].ds === null, 'ds is null when undeclared'); eq(c[0].key, 'orders', 'key');
    const m = { nodes: [], edges: [{ id: 'a', from: 'x', to: 'y', datasets: ['b', 'a'] }, { id: 'b', from: 'x', to: 'y', datasets: ['B'] }, { id: 'c', from: 'x', to: 'y', datasets: ['c'] }] };
    eq(DSM.catalog(m).map(x => x.name), ['b', 'a', 'c'], 'undeclared: by use, then alphabetical');
  });
  test('e2eFreshness takes the slowest path and compares it with the SLA (fail, pass, unknown)', () => {
    const m = dsLat(), r = e2e(m, 'orders');
    eq([r.worst, r.path, r.hops, r.unknownHops, r.sla, r.state], [(15 + 60 + 240) * MIN, ['erp', 'cdc', 'lake', 'bi'], 3, 0, 240 * MIN, 'fail'], 'slowest path breaks the 4h SLA');
    m.datasets[0].freshness = '6h'; eq(e2e(m, 'orders').state, 'pass', 'within the SLA');
    delete m.datasets[0].freshness; eq([e2e(m, 'orders').state, e2e(m, 'orders').sla, e2e(m, 'orders').worst], ['unknown', null, (15 + 60 + 240) * MIN], 'no SLA = unknown, the time is still computed');
    eq(e2e(m, 'ghost').state, 'unknown', 'undeclared dataset'); eq(e2e(m, 'nope').worst, null, 'a dataset on no connection');
  });
  test('e2eFreshness counts hops without latency as 0 and reports them; with no latency at all it is unknown', () => {
    const m = dsLat(); delete m.edges[1].latency;
    const r = e2e(m, 'orders');
    eq([r.worst, r.hops, r.unknownHops, r.path], [(15 + 240) * MIN, 3, 1, ['erp', 'cdc', 'lake', 'bi']], 'a missing latency adds 0 and is counted');
    m.edges.forEach(e => delete e.latency);
    const u = e2e(m, 'orders'); eq([u.worst, u.state, u.sla], [null, 'unknown', 240 * MIN], 'every hop unknown = no figure');
    m.edges[0].latency = 'soon'; eq(e2e(m, 'orders').unknownHops >= 1, true, 'an invalid latency counts as unknown');
  });
  test('e2eFreshness follows both-way connections and does not hang on cycles', () => {
    const b = { nodes: ['s', 'm', 't'].map(id => ({ id })), datasets: [{ id: 'DS-001', name: 'k', freshness: '2h' }], edges: [{ id: 'e1', from: 's', to: 'm', datasets: ['k'], latency: '1h' }, { id: 'e2', from: 't', to: 'm', datasets: ['k'], latency: '2h', both: true }] };
    const r = e2e(b, 'k'); eq([r.worst, r.path, r.state], [3 * 3600000, ['s', 'm', 't'], 'fail'], 'm → t works because the edge is both-way');
    const c = { nodes: ['a', 'b', 'c'].map(id => ({ id })), datasets: [{ id: 'DS-001', name: 'loop', freshness: '1d' }], edges: [{ id: 'e1', from: 'a', to: 'b', datasets: ['loop'], latency: '1h' }, { id: 'e2', from: 'b', to: 'c', datasets: ['loop'], latency: '2h' }, { id: 'e3', from: 'c', to: 'a', datasets: ['loop'], latency: '3h' }] };
    const k = e2e(c, 'loop'); eq([k.hops <= 2, k.state], [true, 'pass'], 'a pure cycle ends and uses simple paths');
    const self = { nodes: [{ id: 'a' }], datasets: [{ id: 'DS-001', name: 'z' }], edges: [{ id: 'e1', from: 'a', to: 'a', datasets: ['z'], latency: '1h' }] }; eq(e2e(self, 'z').worst, null, 'a self-loop is not a hop');
  });
  test('storageEstimate multiplies per-day volume by retention (365 by default) and prices it by layer', () => {
    const h = { prices: { default: 0.023, bronze: 0.02 } };
    eq(DSM.storageEstimate({ layer: 'silver', volume: { perDay: 2, retentionDays: 100 } }, h), { gb: 200, price: 0.023, monthly: 200 * 0.023 }, 'default price');
    eq(DSM.storageEstimate({ layer: 'bronze', volume: { perDay: 1 } }, h), { gb: 365, price: 0.02, monthly: 365 * 0.02 }, 'bronze price, 365 days');
    eq(DSM.storageEstimate({ volume: { retentionDays: 30 } }, h), null, 'no per-day volume'); eq(DSM.storageEstimate({}, h), null, 'no volume'); eq(DSM.storageEstimate({ volume: { perDay: 1 } }, {}).price, 0, 'no prices = 0');
    eq(DSM.storageEstimate({ volume: { perDay: 0 } }, h).gb, 0, 'zero is a figure');
  });
  const issuesH = { T: (k, v) => (v ? `${k} ${JSON.stringify(v)}` : k), lineageOf: DSD.lineageOf, parseDur: DSD.parseDur, sensitive: k => k === 'pii', short: k => k.toUpperCase(), fmtDur: s => `${s}s`, edgeName: e => `${e.from}>${e.to}`, nodeName: id => id };
  const kinds = (m, h = issuesH) => DSM.datasetIssues(m, h).map(f => `${f.id}|${f.severity}`).sort();
  test('datasetIssues: freshness, undocumented, product without owner or contract, PII, consumers and quality', () => {
    const m = dsLat();
    eq(kinds(m), ['data:freshness:DS-001|high', 'data:undocumented:ghost|low'], 'orders breaks its 4h SLA; ghost is used on a connection but not declared');
    const f = DSM.datasetIssues(m, issuesH).find(x => x.rule === 'freshness');
    eq([f.source, f.target, f.title, f.detail.includes('"real":"18900s"') && f.detail.includes('"sla":"14400s"')], ['data', { kind: 'edge', id: 'e1' }, 'ds.find.freshness {"id":"DS-001","name":"orders"}', true], 'finding shape with real time and SLA');
    m.datasets.push({ id: 'DS-003', name: 'gold_sales', layer: 'gold', product: true }, { id: 'DS-004', name: 'customers', product: true, owner: 'SH-001', contract: { version: '1.0.0', status: 'draft' }, quality: [{ rule: 'unique' }] });
    eq(kinds(m).filter(x => /product-owner|no-quality/.test(x)), ['data:no-quality:DS-003|low', 'data:product-owner:DS-003|medium'], 'a gold product with no owner, contract or rules');
    m.datasets[0].schema = [{ name: 'email', pii: true }]; eq(kinds(m).includes('data:pii-class:DS-001|medium'), true, 'PII column without the pii class');
    m.datasets[0].classes = ['pii']; assert(!kinds(m).some(x => x.startsWith('data:pii-class')), 'with the class the notice goes'); assert(!kinds(m).some(x => x.startsWith('data:pii-unencrypted')), 'not unencrypted yet');
    m.edges[1].encrypted = false; eq(kinds(m).includes('data:pii-unencrypted:DS-001|high'), true, 'sensitive class on an unencrypted connection');
    m.datasets[0].contract = { version: '1.0.0', status: 'agreed', consumers: ['bi', 'api'] }; eq(kinds(m).includes('data:consumer-unreached:DS-001|low'), true, 'api is not on the lineage of orders');
    m.datasets[0].contract.consumers = ['bi']; assert(!kinds(m).some(x => x.startsWith('data:consumer-unreached')), 'bi is');
  });
  test('renameDataset renames the dataset and its names on connections, and refuses a clash', () => {
    const m = dsLat(), r = DSM.renameDataset(m, 'DS-001', 'Sales Orders');
    eq([r.datasets[0].name, r.edges[0].datasets, r.edges[1].datasets, r.edges[4].datasets], ['Sales Orders', ['Sales Orders'], ['Sales Orders', 'stock'], ['ghost']], 'dataset and every spelling of its key on edges; other names stay');
    eq(m.datasets[0].name, 'orders', 'the original is not touched'); assert(r !== m, 'a new model');
    assert(DSM.renameDataset(m, 'DS-001', ' STOCK ') === m, 'clashes with another declared dataset (by key)'); assert(DSM.renameDataset(m, 'DS-999', 'x') === m, 'unknown id'); assert(DSM.renameDataset(m, 'DS-001', '  ') === m, 'empty name');
    eq(DSM.renameDataset(m, 'DS-001', 'ORDERS').datasets[0].name, 'ORDERS', 'a change of case is allowed');
  });
  const dsTextDoc = lang => (lang === 'en'
    ? ['title: Lake', 'phase wave1: "Wave 1"', '', 'erp: ERP', 'lake: Lake', 'bi: BI', 'erp -> lake : load datasets=orders latency=1h', '',
      'dataset DS-001 orders: layer=silver domain=Sales owner=SH-003 product=yes classes=pii format=delta freshness=1h per_day=2 retention=365 phase=wave1 steward="Ana Pérez" desc="Orders from ERP"',
      '  column order_id: string key', '  column email: string pii nullable=no desc="Customer e-mail"', '  column "unit price": "decimal(10, 2)"', '  rule not_null order_id severity=high', '  rule range amount param="0..1000000"',
      '  contract 1.0.0 status=agreed consumers=bi terms="Daily by 06:00"']
    : ['título: Lago', 'fase wave1: "Ola 1"', '', 'erp: ERP', 'lake: Lago', 'bi: BI', 'erp -> lake : carga tablas=orders latencia=1h', '',
      'conjunto DS-001 orders: capa=plata dominio=Ventas dueño=SH-003 producto=sí clases=pii formato=delta frescura=1h por_dia=2 retencion=365 fase=wave1 responsable="Ana Pérez" desc="Pedidos del ERP"',
      '  columna order_id: string clave', '  columna email: string pii nulo=no desc="Correo del cliente"', '  columna "unit price": "decimal(10, 2)"', '  regla not_null order_id severidad=alta', '  regla range amount param="0..1000000"',
      '  contrato 1.0.0 estado=acordado consumidores=bi terminos="Diario antes de las 06:00"']).join('\n');
  test('text syntax: datasets, columns, rules, contract and edge latency parse and round trip exactly · en and es', () => {
    ['en', 'es'].forEach(lang => {
      const r = TXT.parse(dsTextDoc(lang), textCtx(lang));
      eq(r.errors, [], `parse errors (${lang})`);
      const d = r.model.datasets[0];
      eq([d.id, d.name, d.layer, d.domain, d.owner, d.product, d.classes, d.format, d.freshness, d.volume, d.phase, d.steward], ['DS-001', 'orders', 'silver', lang === 'en' ? 'Sales' : 'Ventas', 'SH-003', true, ['pii'], 'delta', '1h', { perDay: 2, retentionDays: 365 }, 'wave1', 'Ana Pérez'], `fields (${lang})`);
      eq(d.schema, [{ name: 'order_id', type: 'string', key: true }, { name: 'email', type: 'string', pii: true, nullable: false, desc: lang === 'en' ? 'Customer e-mail' : 'Correo del cliente' }, { name: 'unit price', type: 'decimal(10, 2)' }], `columns (${lang})`);
      eq(d.quality, [{ rule: 'not_null', column: 'order_id', severity: 'high' }, { rule: 'range', column: 'amount', param: '0..1000000' }], `rules (${lang})`);
      eq(d.contract, { version: '1.0.0', status: 'agreed', consumers: ['bi'], terms: lang === 'en' ? 'Daily by 06:00' : 'Diario antes de las 06:00' }, `contract (${lang})`);
      eq(r.model.edges[0].latency, '1h', `edge latency (${lang})`);
      const t = TXT.stringify(r.model, lang);
      assert(t.includes(lang === 'en' ? 'latency=1h' : 'latencia=1h'), `latency written (${lang})`);
      eq(t, TXT.stringify(TXT.parse(t, textCtx(lang)).model, lang), `stable round trip (${lang})`);
      eq(TXT.parse(t, textCtx(lang)).errors, [], `no errors after the round trip (${lang})`);
      eq(TXT.parse(t, textCtx(lang)).model.datasets, r.model.datasets, `same datasets (${lang})`);
    });
    const en = TXT.stringify(TXT.parse(dsTextDoc('en'), textCtx('en')).model, 'en'), es = TXT.stringify(TXT.parse(dsTextDoc('en'), textCtx('en')).model, 'es');
    assert(es.includes('conjunto DS-001 orders: capa=plata') && es.includes('  columna order_id: string clave') && es.includes('estado=acordado') && es.includes('  regla not_null order_id severidad=alta'), 'the same model written in Spanish');
    assert(en.includes('dataset DS-001 orders: layer=silver') && en.includes('  contract 1.0.0 status=agreed consumers=bi'), 'and in English');
    eq(TXT.parse(es, textCtx('es')).model.datasets, TXT.parse(en, textCtx('en')).model.datasets, 'en and es describe the same datasets');
  });
  test('text syntax: errors carry the line number (unknown phase, class, layer, rule, format, consumer, duration, status, duplicates)', () => {
    const bad = [['dataset DS-001 a: phase=ghost', 1, 'phase'], ['dataset DS-001 a: classes=nope', 1, 'class'], ['dataset DS-001 a: layer=platinum', 1, 'layer'], ['dataset DS-001 a: format=xml', 1, 'format'], ['dataset DS-001 a: freshness=soon', 1, 'duration'],
      ['dataset DS-001 a: per_day=-1', 1, 'volume'], ['dataset DS-001 a: product=maybe', 1, 'product'], ['dataset x a:', 1, 'id'], ['dataset DS-001 a:\n  rule bogus col', 2, 'rule'], ['dataset DS-001 a:\n  rule not_null c severity=critical', 2, 'severity'],
      ['dataset DS-001 a:\n  contract 1.0.0 status=done', 2, 'status'], ['dataset DS-001 a:\n  contract 1.0.0 consumers=ghost', 2, 'consumer'], ['dataset DS-001 a:\n\ndataset DS-001 b:', 3, 'duplicate id'], ['dataset DS-001 a:\ndataset DS-002 A:', 2, 'duplicate name'],
      ['column x: string', 1, 'column outside a dataset'], ['a: A\nb: B\na -> b : x latency=soon', 3, 'latency']];
    bad.forEach(([src, line, what]) => {
      const e = TXT.parse(src, textCtx('en')).errors; assert(e.length >= 1 && e.some(x => x.line === line), `${what}: expected an error on line ${line}, got ${JSON.stringify(e)}`);
    });
    const es = TXT.parse('conjunto DS-001 a: fase=nada clases=nope', textCtx('es')).errors; assert(es.length === 2 && /fase desconocida/.test(es.map(x => x.msg).join('|')) && /desconocida/.test(es.map(x => x.msg).join('|')), `Spanish messages: ${JSON.stringify(es)}`);
  });
  test('phaseModel keeps the datasets present at the phase (no phase = always)', () => {
    const m = { phases: phList(), groups: [], nodes: [], edges: [], datasets: [{ id: 'DS-001', name: 'a' }, { id: 'DS-002', name: 'b', phase: 'wave1' }, { id: 'DS-003', name: 'c', phase: 'wave2' }] };
    eq([0, 1, 2].map(i => PHM.phaseModel(m, i).datasets.map(d => d.name)), [['a'], ['a', 'b'], ['a', 'b', 'c']], 'datasets by phase'); eq(PHM.phaseModel(m, -1), m, 'All = the same model');
    assert(!('datasets' in PHM.phaseModel({ phases: phList(), groups: [], nodes: [], edges: [] }, 1)), 'without datasets the model has no key');
  });
  test('wiring: normalize, findings source, edge field, API and i18n for datasets', () => {
    ['cleanCatalog(raw.datasets, m, dsHelpers())', "addFindingSource('data'", 'data-lat', 'catalog: catalogApi', 'dataset: v =>', 'addDataset', 'updateDataset', 'removeDataset', 'renameDataset: renameDatasetApi', 'freshness: freshnessApi', 'storage: storageApi',
      "'latency', 'transferOk'", 'raw = { ...raw, datasets: S.model.datasets }', 'datasets: () => datasetList()', 'lineage: ds =>'].forEach(k => assert(app.includes(k), `app has ${k}`));
    assert(read('src/text-lang.js').includes('latency|latencia'), 'the text edge options know latency');
    const i18n = read('src/i18n.js'), used = [...new Set([...app.matchAll(/T\('(ds\.[\w.]+)'/g)].map(m => m[1]))];
    ['find.src.data', ...used, 'ds.find.noOwner', 'ds.find.noContract', 'ds.find.ownerContract'].forEach(k => assert(i18n.split(`'${k}':`).length === 3, `${k} is defined once in en and once in es`));
    const keys = [...i18n.matchAll(/'(ds\.[\w.]+)':/g)].map(m => m[1]); assert(keys.every(k => keys.filter(x => x === k).length === 2), 'every ds.* key is defined exactly once per language');
  });
  test('report and Excel for datasets: section after layers, sheets, Latency column only when used, new keys once per language', () => {
    assert(/REP_SECS = \[[^\]]*'layers', 'datasets', 'costs'/.test(app), 'section after layers'); assert(app.includes('datasets: !!m.datasets?.length'), 'available only with datasets');
    assert(app.includes("want('datasets')") && app.includes("sec('datasets'"), 'section body');
    assert(app.includes("mk('datasets', INV_DS") && app.includes("mk('columns', INV_DSC") && app.includes("mk('quality', INV_DSQ"), 'three sheets, columns and quality only with rows');
    assert(app.includes("const lat = m.edges.some(e => e.latency != null && e.latency !== '')") && app.includes("...(lat ? [['latency']] : [])"), 'latency column only when some edge has it');
    assert(app.includes("if (m.datasets?.length) {\n      const dsl = m.datasets"), 'Excel sheets only with datasets');
    const i18n = read('src/i18n.js'), es = i18n.indexOf('\n    es: {');
    const newKeys = ['rep.s.datasets', 'rep.cat.sum', 'rep.cat.estNote', 'rep.cat.undoc', 'rep.cat.schema', 'rep.cat.rules', 'rep.cat.st.draft', 'rep.cat.st.agreed', 'rep.cat.st.deprecated', 'rep.h.domain', 'rep.h.product', 'rep.h.freshness', 'rep.h.contract', 'rep.h.storage', 'rep.h.key', 'rep.h.pii', 'rep.h.column', 'rep.h.rule', 'rep.h.param',
      'inv.sheet.datasets', 'inv.sheet.columns', 'inv.sheet.quality', 'inv.c.domain', 'inv.c.product', 'inv.c.format', 'inv.c.freshness', 'inv.c.e2e', 'inv.c.frState', 'inv.c.perDay', 'inv.c.retention', 'inv.c.estGb', 'inv.c.estMonthly', 'inv.c.contractVersion', 'inv.c.consumers', 'inv.c.latency', 'inv.c.dsId', 'inv.c.dsName', 'inv.c.column', 'inv.c.key', 'inv.c.pii', 'inv.c.nullable', 'inv.c.param', 'inv.fr.pass', 'inv.fr.fail', 'inv.fr.unknown'];
    newKeys.forEach(k => {
      const at = i18n.split(`'${k}':`).length - 1;
      assert(at === 2, `${k} is defined ${at} times, expected once in en and once in es`);
      assert(i18n.indexOf(`'${k}':`) < es && i18n.lastIndexOf(`'${k}':`) > es, `${k} is in both blocks`);
    });
  });

  test('Data tab wiring: tab in group data, pane inside the side panel, every ds.* key used by the UI defined once per language', () => {
    const idx = read('index.html'), i18n = read('src/i18n.js');
    assert(idx.includes('<button data-group="data" class="tab" data-tab="data"'), 'the data tab is in group data');
    const side = idx.split('<aside class="sidebar">')[1].split('</aside>')[0];
    assert(side.includes('data-pane="data"') && side.includes('id="ds-panel"') && side.includes('id="ds-bar"') && side.includes('id="ds-list"'), 'the data pane and its containers live inside the side panel');
    ['renderDs', "t.dataset.tab === 'data'", 'dsDocument', 'renameDatasetApi(ds.id', 'data-ds-open', 'return void exportContract(ds.id)'].forEach(k => assert(app.includes(k), `app has ${k}`));
    const used = new Set([...app.matchAll(/T\(\s*'(ds\.[\w.]+)'/g)].map(m => m[1]));
    ['ds.cst.draft', 'ds.cst.agreed', 'ds.cst.deprecated', 'ds.rule.not_null', 'ds.rule.unique', 'ds.rule.range', 'ds.rule.regex', 'ds.rule.accepted_values', 'ds.rule.freshness', 'ds.rule.custom', 'ds.sec.general', 'ds.sec.schema', 'ds.sec.quality', 'ds.sec.contract', 'ds.sec.lineage', 'tab.data', 'tab.data.tip'].forEach(k => used.add(k));
    used.forEach(k => assert(i18n.split(`'${k}':`).length === 3, `${k} is defined once in en and once in es`));
    const keys = [...i18n.matchAll(/'((?:ds|tab\.data)[\w.]*)':/g)].map(m => m[1]); assert(keys.every(k => keys.filter(x => x === k).length === 2), 'no duplicated ds.* key');
    assert(used.size > 60, 'the UI uses the new keys');
  });

  /* ---------- contratos de datos (ODCS), métrica freshness y fases con conjuntos ---------- */
  section('Data contracts');
  const dcModel = () => ({ title: 'Lake', nodes: [{ id: 'bi', label: 'BI tool' }, { id: 'ml', label: 'ML: "scoring"' }], stakeholders: [{ id: 'SH-001', name: 'Ana Pérez' }], phases: [{ id: 'mvp', name: 'MVP' }],
    datasets: [{ id: 'DS-001', name: 'orders', domain: 'sales', layer: 'gold', description: 'Orders: one per line # 1', owner: 'SH-001', steward: 'Luis', product: true, classes: ['pii', 'finance'], format: 'delta', freshness: '4h', volume: { perDay: 2.5, retentionDays: 90 },
      schema: [{ name: 'order_id', type: 'bigint', key: true, nullable: false, desc: 'Primary key' }, { name: 'email', type: 'varchar(80)', pii: true }, { name: 'amount', type: 'decimal(10,2)' }, { name: 'meta', type: 'weird' }],
      quality: [{ rule: 'not_null', column: 'order_id', severity: 'high' }, { rule: 'unique', column: 'order_id' }, { rule: 'regex', column: 'email', param: '^.+@.+$', severity: 'low' }, { rule: 'accepted_values', column: 'amount', param: 'a, b,c' },
        { rule: 'range', column: 'amount', param: '0..100' }, { rule: 'freshness', param: '1h' }],
      contract: { version: '2.1.0', status: 'agreed', consumers: ['bi', 'ml'], terms: 'Internal use only\nNo resale' }, phase: 'mvp' }, { id: 'DS-002', name: 'bare' }] });
  test('toODCS: ODCS v3.2.0 field names and order on a full fixture', () => {
    const m = dcModel(), y = DC.toODCS(m.datasets[0], m), top = y.split('\n').filter(l => /^[a-zA-Z]/.test(l)).map(l => l.split(':')[0]);
    eq(top, ['apiVersion', 'kind', 'id', 'name', 'version', 'status', 'domain', 'description', 'tags', 'schema', 'slaProperties', 'team', 'customProperties'], 'top-level keys in order');
    ['apiVersion: v3.2.0', 'kind: DataContract', 'name: orders', 'version: 2.1.0', 'status: active', 'domain: sales', '  purpose: "Orders: one per line # 1"', '  usage: "Internal use only\\nNo resale"', 'tags: [pii, finance]',
      '  - name: orders\n    physicalType: table', '      - name: order_id\n        physicalType: bigint\n        logicalType: integer\n        primaryKey: true\n        primaryKeyPosition: 1\n        required: true\n        description: Primary key',
      '        classification: pii\n        tags: [pii]\n', '        physicalType: weird\n', '          - metric: nullValues\n            mustBe: 0\n            unit: rows\n            dimension: completeness\n            severity: error',
      'metric: duplicateValues', 'metric: invalidValues\n            mustBe: 0\n            arguments:\n              pattern: "^.+@.+$"', 'validValues: [a, b, c]', '            severity: info',
      '- type: text\n            description: "range (amount): 0..100"\n            dimension: accuracy', '      - type: text\n        description: "freshness: 1h"\n        dimension: timeliness',
      'slaProperties:\n  - property: latency\n    value: 4\n    unit: h', '  - property: retention\n    value: 90\n    unit: d', 'team:\n  name: sales\n  members:\n    - username: Ana Pérez\n      role: Owner\n    - username: Luis\n      role: Steward',
      '  - property: diagramonId\n    value: DS-001', '  - property: layer\n    value: gold', '  - property: format\n    value: delta', '  - property: consumers\n    value: [BI tool, "ML: \\"scoring\\""]', '  - property: phase\n    value: MVP', '  - property: volumePerDayGB\n    value: 2.5'
    ].forEach(k => assert(y.includes(k), `missing:\n${k}\n--- in ---\n${y}`));
    assert(y.startsWith('# Open Data Contract Standard v3.2.0'), 'version comment'); assert(!y.includes('undefined') && !y.split('\n').some(l => l.endsWith(': null') || l.endsWith(': ')), 'no undefined/null');
    assert(/\nid: [0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\n/.test(y) && y === DC.toODCS(m.datasets[0], m), 'stable uuid-shaped id');
  });
  test('toODCS: a bare dataset still yields a valid minimal contract; toODCSAll joins documents with ---', () => {
    const m = dcModel(), y = DC.toODCS(m.datasets[1], m);
    eq(y.split('\n').filter(l => /^[a-zA-Z]/.test(l)).map(l => l.split(':')[0]), ['apiVersion', 'kind', 'id', 'name', 'version', 'status', 'schema', 'customProperties'], 'only required + schema + id');
    assert(y.includes('version: 1.0.0') && y.includes('status: draft') && y.includes('  - name: bare\n    physicalType: table\n'), y);
    const all = DC.toODCSAll(m); eq(all.split('---\n').length, 2, 'two documents'); assert(all.indexOf('name: orders') < all.indexOf('---\n') && all.indexOf('---\n') < all.indexOf('name: bare'), 'order');
    eq(DC.toODCSAll({ datasets: [] }), '', 'no datasets → empty');
  });
  test('yq: quotes everything YAML would misread, leaves safe text plain', () => {
    const q = DC.yq;
    ['plain', 'two words', 'a/b (c)', 'Ana Pérez', '1.0.0', 'x-y', 'N/A', 'a@b.c', '3d'].forEach(v => eq(q(v), v, `plain: ${v}`));
    ['', ' lead', 'trail ', 'a: b', 'a #b', '# c', 'yes', 'No', 'ON', 'null', '~', 'true', '1', '1.5', '-3', '1e3', '0x1F', '.5', '2026-10-09', '2026-10-09T10:00', '- item', '- ', '? k', 'a,b', '[x]', '{x}', '&a', '*a', '!t', '|', '>', '%d', '@a', '`a', "it's", 'say "hi"', 'back\\slash', 'line\nbreak', 'tab\there', ':', 'a:', '1_000', '1:30', 'inf', 'NaN']
      .forEach(v => { const o = q(v); assert(o.startsWith('"') && o.endsWith('"') && JSON.parse(o) === v, `quoted + round trip: ${JSON.stringify(v)} → ${o}`); });
    eq([q(5), q(true), q(0)], ['5', 'true', '0'], 'numbers and booleans stay bare');
  });
  test('wiring: export menu entry hidden unless datasets are declared; API, script and i18n', () => {
    const html = read('index.html'), app = read('src/app.js'), i18n = read('src/i18n.js');
    assert(html.includes('data-export="contracts" id="exp-contracts" hidden') && html.includes('<script src="src/export/datacontract.js"></script>'), 'button hidden by default + script tag');
    ['$(\'#exp-contracts\').hidden = !S.model.datasets?.length', 'contracts: exportContracts', 'function exportContract(id)', 'contractYaml, contractsYaml'].forEach(k => assert(app.includes(k), `app has ${k}`));
    ['exp.contracts', 'req.m.freshness', 'req.m.freshness.hint', 'req.chk.p.ds', 'req.chk.noFresh', 'req.chk.d.fresh', 'phase.cmp.datasets', 'phase.cmp.storage', 'phase.cmp.storage.tip'].forEach(k => assert(i18n.split(`'${k}':`).length === 3, `${k} once per language`));
    assert(!read('src/export/datacontract.js').includes('fetch(') && !read('src/export/datacontract.js').includes('XMLHttpRequest'), 'no network');
  });
  test('check freshness: worst end-to-end hours against the target; unknown without data', () => {
    const m = reqModel(), c = (target, e2e) => REQM.reqEval(rq({ check: { metric: 'freshness', ds: 'orders', target } }), m, reqH({ e2e }));
    const f = ms => () => ({ worst: ms });
    eq([c(2, f(7200000)).state, c(1, f(7200000)).state, c(3, f(7200000)).state], ['pass', 'fail', 'pass'], 'equal passes, above fails');
    eq(c(1, f(7200000)).actual, 2, 'actual in hours'); assert(/req\.chk\.d\.fresh/.test(c(1, f(7200000)).detail), 'detail');
    eq([c(1, () => ({ worst: null })).state, c(1, undefined).state, c(1, () => null).state], ['unknown', 'unknown', 'unknown'], 'no latency / no helper');
    eq(REQM.reqEval(rq({ check: { metric: 'freshness', target: 1 } }), m, reqH({ e2e: f(1) })).state, 'unknown', 'missing dataset param');
    eq(REQM.reqEval(rq({ status: 'draft', check: { metric: 'freshness', ds: 'orders', target: 1 } }), m, reqH({ e2e: f(1) })).state, 'unknown', 'draft');
    const fail = REQM.reqIssues({ ...m, requirements: [rq({ priority: 'must', links: { nodes: ['a'] }, check: { metric: 'freshness', ds: 'orders', target: 1 } })] }, reqH({ e2e: f(7200000) }));
    eq(fail.map(x => [x.rule, x.severity]), [['fail', 'high']], 'a failing freshness check is a finding');
  });
  test('freshness check: clean keeps ds and target only, Spanish alias, text round trip in en and es', () => {
    const m = reqModel();
    eq(REQM.cleanReqCheck({ metric: 'Frescura', ds: '  my   data ', target: '4,5', from: 'a', cls: 'pii' }, m), { metric: 'freshness', ds: 'my data', target: 4.5 }, 'params');
    eq(REQM.cleanReqCheck({ metric: 'freshness', ds: 'x'.repeat(200) }, m).ds.length, 120, 'ds limit');
    ['en', 'es'].forEach(lang => {
      const mm = withPositions({ title: 'T', nodes: [{ id: 'a', label: 'A' }], edges: [], groups: [], requirements: [{ id: 'REQ-001', title: 'Fresh', kind: 'nfr', status: 'agreed', check: { metric: 'freshness', ds: 'sales daily', target: 4 } }] });
      const t = TXT.stringify(mm, lang), r = TXT.parse(t, textCtx(lang));
      eq(r.errors, [], `parse ${lang}`); eq(r.model.requirements[0].check, { metric: 'freshness', ds: 'sales daily', target: 4 }, `round trip ${lang}`);
      assert(lang === 'es' ? t.includes('control=frescura conjunto="sales daily" objetivo=4') : t.includes('check=freshness ds="sales daily" target=4'), t);
    });
    assert(read('src/app.js').includes("freshness: ['ds', 'target']") && read('src/app.js').includes("frescura: 'freshness'"), 'REQ_PARAMS + Spanish alias');
  });
  test('phaseRows / phaseStats with datasets: counts and estimated storage per phase (separate from component cost)', () => {
    const m = { ...phDoc(), datasets: [{ id: 'DS-001', name: 'a', volume: { perDay: 1, retentionDays: 10 } }, { id: 'DS-002', name: 'b', phase: 'wave1', volume: { perDay: 2, retentionDays: 10 }, layer: 'gold' }, { id: 'DS-003', name: 'c', phase: 'wave2' }] };
    const h = { monthly: pm => pm.nodes.reduce((s, n) => s + (n.cost || 0), 0), hasCost: pm => pm.nodes.some(n => n.cost != null), findings: () => [], storage: d => (d.volume ? { monthly: d.volume.perDay * d.volume.retentionDays * (d.layer === 'gold' ? 0.1 : 0.05) } : null) };
    const r = PHM.phaseRows(m, h);
    eq(r.map(x => [x.datasets, x.datasetIds, x.storage]), [[1, ['DS-001'], 0.5], [2, ['DS-001', 'DS-002'], 2.5], [3, ['DS-001', 'DS-002', 'DS-003'], 2.5]], 'datasets and storage by phase');
    eq(r.map(x => x.cost), [110, 300, 600], 'component cost untouched');
    eq(PHM.phaseStats(m, 2, h).datasets, 3, 'stats count');
    const none = PHM.phaseRows({ ...phDoc(), datasets: [{ id: 'DS-001', name: 'a' }] }, h); eq(none.map(x => [x.datasets, x.storage]), [[1, null], [1, null], [1, null]], 'no volume → storage null');
    eq(PHM.phaseRows(phDoc(), h).map(x => [x.datasets, x.storage]), [[0, null], [0, null], [0, null]], 'no datasets');
  });

  /* ======================================================================
     dbt: importar un manifest (src/dbt.js)
     ====================================================================== */
  section('dbt manifest import');
  const DBT = win.DiagramonDbt, dbtText = read('samples/dbt/manifest.json'), dbtMan = JSON.parse(dbtText);
  const dbtCat = (m = dbtMan, cfg) => DBT.toCatalog(m, cfg), dbtBy = (r, n) => r.datasets.find(d => d.name === n);
  test('detect: dbt manifests yes; Diagramon JSON, Terraform, other JSON and IaC files keep their own path', () => {
    assert(DBT.detect(dbtText, 'manifest.json') && DBT.detect(dbtMan), 'sample detected (text and object)');
    assert(DBT.detect('{"metadata":{"dbt_schema_version":"https://schemas.getdbt.com/dbt/manifest/v10.json"}}'), 'v10');
    assert(!DBT.detect('{"metadata":{"dbt_schema_version":"https://schemas.getdbt.com/dbt/run-results/v5.json"}}'), 'run-results is not a manifest');
    assert(!DBT.detect('{"nodes":[],"edges":[]}') && !DBT.detect('{"a":1}') && !DBT.detect('not json') && !DBT.detect(null), 'other JSON');
    ['samples/aws-data-lake/terraform-show.json', 'samples/aws-data-lake/cloudformation.yaml', 'samples/kubernetes/shop.yaml', 'samples/docker-compose/docker-compose.yml'].forEach(f => {
      const t = read(f); assert(!DBT.detect(t) && IAC.detect(t, f.split('/').pop()), `${f} still goes to the IaC importer`);
    });
    assert(!IAC.detect(dbtText, 'manifest.json'), 'the IaC importer does not claim the manifest');
  });
  test('parse: caps on size and objects, bad input, sparse manifests never throw', () => {
    eq(Object.keys(DBT.parse(dbtText)), ['manifest'], 'ok');
    eq(DBT.parse('x'.repeat(21 * 1024 * 1024)).error, 'big', 'over 20 MB'); eq(DBT.parse('{oops').error, 'bad', 'bad json'); eq(DBT.parse('{"a":1}').error, 'bad', 'not a manifest'); eq(DBT.parse(null).error, 'bad', 'null');
    const nodes = {}; for (let i = 0; i < 5001; i++) nodes[`model.p.m${i}`] = { resource_type: 'model', name: `m${i}` };
    eq(DBT.parse(JSON.stringify({ metadata: dbtMan.metadata, nodes })).error, 'many', 'over 5,000 objects');
    ['{}', '{"nodes":null}', '{"nodes":{"a":null,"b":{"resource_type":"model"},"c":{"resource_type":"test","depends_on":null}},"sources":{"s":5},"exposures":{"e":{}},"groups":[]}'].forEach(x => {
      const m = { metadata: dbtMan.metadata, ...JSON.parse(x) };
      assert(Array.isArray(DBT.toCatalog(m).datasets), x); assert(Array.isArray(DBT.toDiagram(m).diagram.nodes), 'diagram of a sparse manifest');
    });
  });
  test('sample: datasets, names, layers; ephemeral, old versions and tests are not datasets; seeds are bronze', () => {
    const r = dbtCat();
    eq(r.project, 'shop_analytics', 'project');
    eq(r.datasets.map(d => d.name).sort(), ['country_codes', 'customers', 'dim_customers', 'fct_orders', 'int_orders_payments', 'orders', 'payments', 'refunds', 'stg_customers', 'stg_orders', 'stg_payments', 'stg_refunds'], 'names (source tables use the table name)');
    eq(Object.fromEntries(r.datasets.map(d => [d.name, d.layer]).sort((a, b) => a[0].localeCompare(b[0]))), Object.fromEntries(Object.entries({ orders: 'bronze', customers: 'bronze', payments: 'bronze', refunds: 'bronze', country_codes: 'bronze', stg_orders: 'silver', stg_customers: 'silver', stg_payments: 'silver', stg_refunds: 'silver', int_orders_payments: 'silver', fct_orders: 'gold', dim_customers: 'gold' }).sort((a, b) => a[0].localeCompare(b[0]))), 'layers by rule');
    eq(r.warnings.filter(w => w.code === 'versions').map(w => w.n), [1], 'the older version of dim_customers is skipped and reported');
    assert(!dbtBy(r, 'int_dedupe_payments'), 'ephemeral model skipped');
    eq([r.stats.datasets, r.stats.columns, r.stats.rules, r.stats.exposures, r.stats.byLayer.bronze, r.stats.byLayer.silver, r.stats.byLayer.gold], [12, 28, 11, 2, 5, 5, 2], 'stats');
  });
  test('sample: columns, key, nullable, pii, class, domain, owner from the group, product and contract', () => {
    const r = dbtCat(), fo = dbtBy(r, 'fct_orders'), dc = dbtBy(r, 'dim_customers'), sc = dbtBy(r, 'stg_customers');
    eq(fo.schema.map(c => c.name), ['order_id', 'customer_id', 'ordered_at', 'net_revenue'], 'columns in order');
    eq(fo.schema[0], { name: 'order_id', type: 'string', key: true, nullable: false, desc: 'Order key' }, 'primary_key constraint → key + not null');
    eq(dc.schema.find(c => c.name === 'customer_id'), { name: 'customer_id', type: 'string', key: true, nullable: false, desc: 'Customer key' }, 'unique + not_null tests → key');
    eq(dc.schema.find(c => c.name === 'email').pii, true, 'meta.pii'); eq(dc.classes, ['pii'], 'class pii'); eq(sc.classes, ['pii'], 'a pii column alone gives the class'); assert(!fo.classes, 'no pii, no class');
    eq(dbtBy(r, 'stg_orders').schema.find(c => c.name === 'order_id').key, true, 'unique + not_null on a staging model');
    assert(fo.description.startsWith('One row per order'), 'description');
    eq([fo.domain, dc.domain], ['Sales', 'finance_analytics'], 'domain: meta.domain, else the group');
    eq([dbtBy(r, 'stg_orders').domain, dbtBy(r, 'orders').domain], ['shop', undefined], 'domain: top folder under models/ (none for sources)');
    eq([fo.owner, dc.owner], ['Sales analytics', 'Data Platform Team'], 'owner: meta.owner, else the group owner');
    eq([fo.product, dc.product, dbtBy(r, 'stg_orders').product], [true, true, undefined], 'access: public → product');
    eq([fo.contract, dc.contract], [{ version: '1.0.0', status: 'agreed' }, { version: '2.0.0', status: 'agreed' }], 'contract: enforced; version from latest_version as semver');
    eq(dbtBy(r, 'stg_orders').contract, undefined, 'no contract when not enforced');
    const sh = dbtCat(dbtMan, { stakeholders: [{ id: 'SH-004', name: 'data platform TEAM' }] }); eq(dbtBy(sh, 'dim_customers').owner, 'SH-004', 'owner matches a stakeholder by name, any case');
    eq(dbtBy(r, 'orders').format, 'delta', 'default format');
    [[2, '2.0.0'], ['2.1', '2.1.0'], ['1.0.0', '1.0.0'], [3, '3.0.0'], ['v4', '4.0.0'], [undefined, '1.0.0'], ['beta', 'beta']].forEach(([v, e]) => { const m = JSON.parse(dbtText); m.nodes['model.shop_analytics.dim_customers'].latest_version = v; m.nodes['model.shop_analytics.dim_customers'].version = v; eq(dbtBy(dbtCat(m), 'dim_customers').contract.version, e, `contract version ${v}`); });
  });
  test('sample: quality rules for each kind of test, severity and the relationships parameter', () => {
    const r = dbtCat(), q = n => dbtBy(r, n).quality;
    eq(q('fct_orders'), [{ rule: 'not_null', severity: 'high', column: 'order_id' }, { rule: 'unique', severity: 'high', column: 'order_id' }, { rule: 'custom', severity: 'high', column: 'customer_id', param: '→ dim_customers.customer_id' }, { rule: 'custom', severity: 'medium', param: 'dbt_utils.expression_is_true' }], 'not_null, unique, relationships, a dbt_utils test (warn → medium)');
    eq(q('dim_customers').find(x => x.rule === 'accepted_values'), { rule: 'accepted_values', severity: 'medium', column: 'segment', param: 'new,regular,vip' }, 'accepted_values joins with commas');
    eq(q('stg_refunds'), [{ rule: 'custom', severity: 'high', param: 'assert_no_negative_refunds' }], 'singular test → custom with its name');
    eq(q('stg_customers'), [{ rule: 'not_null', severity: 'medium', column: 'email' }], 'warn → medium');
    eq(dbtCat(dbtMan, { severity: { error: 'low', warn: 'low' } }).datasets.find(d => d.name === 'fct_orders').quality.map(x => x.severity), ['low', 'low', 'low', 'low'], 'severity map is configurable');
    const many = JSON.parse(dbtText); for (let i = 0; i < 120; i++) many.nodes[`test.shop_analytics.t${i}`] = { resource_type: 'test', name: `t${i}`, attached_node: 'model.shop_analytics.fct_orders', test_metadata: { name: 'not_null', kwargs: { column_name: `c${i}` } } };
    const mr = dbtCat(many); eq(dsClean(mr.datasets).find(d => d.name === 'fct_orders').quality.length, 100, '100-rule cap'); assert(mr.warnings.some(w => w.code === 'cap.rules'), 'cap reported');
  });
  test('sample: freshness from error_after, else warn_after; periods map to m / h / d', () => {
    const r = dbtCat();
    eq(['orders', 'customers', 'payments', 'refunds', 'stg_orders'].map(n => dbtBy(r, n).freshness), ['12h', '12h', '1d', '1d', undefined], 'error_after wins; warn_after when error_after is empty');
    const m = JSON.parse(dbtText); m.sources['source.shop_analytics.shop.orders'].freshness = { error_after: { count: 30, period: 'minute' } }; eq(dbtBy(dbtCat(m), 'orders').freshness, '30m', 'minutes');
    eq(dsClean(r.datasets).find(d => d.name === 'orders').freshness, '12h', 'accepted by the data model');
  });
  test('layer rules are configurable; unknown layer stays empty and is reported; name clashes are resolved; 500-dataset cap', () => {
    const r = dbtCat(dbtMan, { layerRules: [{ layer: 'gold', prefixes: ['stg_'] }] });
    eq([dbtBy(r, 'stg_orders').layer, dbtBy(r, 'fct_orders').layer], ['gold', undefined], 'config rules replace the defaults'); assert(r.warnings.some(w => w.code === 'layer' && w.n >= 1), 'unknown layer warning');
    const m = JSON.parse(dbtText); m.nodes['model.shop_analytics.orders'] = { resource_type: 'model', name: 'orders', package_name: 'shop_analytics', original_file_path: 'models/marts/orders.sql', depends_on: { nodes: [] }, config: {}, columns: {} };
    const names = dbtCat(m).datasets.map(d => d.name); assert(names.includes('orders') && names.includes('shop__orders'), `a source whose name clashes becomes source_name__name: ${names}`);
    const big = { metadata: dbtMan.metadata, nodes: {} }; for (let i = 0; i < 600; i++) big.nodes[`model.p.stg_${i}`] = { resource_type: 'model', name: `stg_${i}`, package_name: 'p' };
    const br = dbtCat(big); eq(br.datasets.length, 500, 'at most 500 datasets'); assert(br.warnings.some(w => w.code === 'cap.datasets' && w.n === 100), 'dataset cap reported');
  });
  test('merge: keeps what dbt does not know, replaces what it knows, ids stay, second import changes nothing', () => {
    const inc = dbtCat().datasets, m1 = { nodes: [{ id: 'bi' }], phases: [] };
    const first = dsClean(DBT.merge([], inc), m1); eq(first.length, 12, 'all added'); assert(first.every(d => !('fmtDefault' in d)), 'no helper fields leak');
    const mine = first.map(d => d.name === 'fct_orders' ? { ...d, steward: 'Ana', volume: { perDay: 2 }, contract: { ...d.contract, consumers: ['bi'], terms: 'Daily' }, format: 'iceberg', owner: 'Me', description: 'old' } : d.name === 'stg_orders' ? { ...d, owner: 'Kept owner' } : d).concat([{ id: 'DS-099', name: 'not_in_dbt', layer: 'gold', description: 'mine' }]);
    const merged = dsClean(DBT.merge(mine, inc), m1), by = n => merged.find(d => d.name === n);
    eq([by('fct_orders').steward, by('fct_orders').volume, by('fct_orders').format, by('fct_orders').contract.consumers, by('fct_orders').contract.terms], ['Ana', { perDay: 2 }, 'iceberg', ['bi'], 'Daily'], 'steward, volume, format (default does not override), consumers and terms stay');
    eq([by('fct_orders').description.startsWith('One row'), by('fct_orders').owner], [true, 'Sales analytics'], 'description and owner from dbt replace');
    eq(by('stg_orders').owner, 'Kept owner', 'a user owner stays when dbt has none'); eq(by('not_in_dbt').description, 'mine', 'datasets not in dbt are untouched');
    eq(merged.length, 13, 'count'); eq(by('fct_orders').id, mine.find(d => d.name === 'fct_orders').id, 'ids are kept');
    eq(dsClean(DBT.merge(merged, inc), m1), merged, 'second import changes nothing');
    const m2 = JSON.parse(dbtText); m2.nodes['model.shop_analytics.stg_orders'].description = 'Changed'; const upd = dsClean(DBT.merge(merged, dbtCat(m2).datasets), m1);
    eq(upd.filter((d, i) => JSON.stringify(d) !== JSON.stringify(merged[i])).map(d => d.name), ['stg_orders'], 'only the changed dataset is updated');
  });
  test('new diagram: bounded components, the lineage of every dataset runs from its source system to its exposures', () => {
    const r = DBT.toDiagram(dbtMan), d = r.diagram, node = id => d.nodes.find(n => n.id === id);
    assert(d.nodes.length <= 12 && d.nodes.length >= 8, `node count bounded: ${d.nodes.length}`); eq(d.title, 'shop_analytics', 'title = project');
    eq(d.groups.filter(g => g.layer).map(g => g.layer), ['bronze', 'silver', 'gold'], 'one group per layer, tagged with the layer');
    eq(d.nodes.filter(n => n.id.startsWith('src_')).map(n => n.label).sort(), ['dbt seeds', 'payments_api', 'shop'], 'one component per source system (seeds in their own)');
    eq(d.nodes.filter(n => n.id.startsWith('ex_')).map(n => [n.label, n.type]), [['Sales dashboard', 'user'], ['Churn model', 'ai']], 'exposures by type'); eq(d.nodes.filter(n => n.id.startsWith('dbt_')).map(n => n.id), ['dbt_bronze_silver', 'dbt_silver_gold'], 'one dbt component per layer transition present (none bronze → gold here)');
    eq(d.nodes.filter(n => n.id.startsWith('dbt_')).map(n => n.label), ['dbt · bronze → silver', 'dbt · silver → gold'], 'labels');
    const lin = n => DSD.lineageOf(d, n), src = new Set(d.nodes.filter(x => x.id.startsWith('src_')).map(x => x.id)), ex = new Set(d.nodes.filter(x => x.id.startsWith('ex_')).map(x => x.id));
    const expect = { orders: ['shop', 'ex_sales_dashboard'], customers: ['shop', 'ex_churn_model'], fct_orders: ['shop', 'ex_sales_dashboard'], dim_customers: ['shop', 'ex_churn_model'], stg_orders: ['shop', 'ex_sales_dashboard'], refunds: ['payments_api', 'ex_sales_dashboard'] };
    Object.entries(expect).forEach(([n, [s, e]]) => { const l = lin(n); assert(l, `${n} has lineage`); assert(l.origins.some(o => node(o).label === s) && l.origins.every(o => src.has(o)), `${n} starts at ${s}: ${l.origins}`); assert(l.consumers.includes(e) && l.consumers.every(c => ex.has(c)), `${n} ends at ${e}: ${l.consumers}`); });
    eq(lin('dim_customers').consumers.sort(), ['ex_churn_model', 'ex_sales_dashboard'], 'dim_customers feeds both exposures');
    assert(lin('country_codes').origins.length === 1 && node(lin('country_codes').origins[0]).label === 'dbt seeds', 'a seed starts at the seeds component');
    eq(r.datasets.find(x => x.name === 'fct_orders').contract.consumers, ['ex_sales_dashboard'], 'contract consumers = exposure component ids');
    eq(r.datasets.find(x => x.name === 'dim_customers').contract.consumers.sort(), ['ex_churn_model', 'ex_sales_dashboard'], 'contract consumers, second dataset');
    eq(dsClean(r.datasets, { nodes: d.nodes, phases: [] }).find(x => x.name === 'fct_orders').contract.consumers, ['ex_sales_dashboard'], 'consumers survive the data model');
    const big = { metadata: dbtMan.metadata, nodes: {}, sources: {} }; for (let i = 0; i < 400; i++) big.nodes[`model.p.stg_${i}`] = { resource_type: 'model', name: `stg_${i}`, depends_on: { nodes: [] } };
    for (let i = 0; i < 3; i++) big.sources[`source.p.s${i}.t`] = { resource_type: 'source', source_name: `s${i}`, name: `t${i}` };
    assert(DBT.toDiagram(big).diagram.nodes.length <= 10, 'never one component per model');
    // sin ciclos dirigidos en el diagrama, para ningún conjunto
    const cyc = (edges) => { const adj = new Map(); edges.forEach(e => { if (!adj.has(e.from)) adj.set(e.from, []); adj.get(e.from).push(e.to); }); const st = new Map(); const dfs = u => { st.set(u, 1); for (const v of adj.get(u) || []) { if (st.get(v) === 1) return true; if (!st.get(v) && dfs(v)) return true; } st.set(u, 2); return false; }; return [...adj.keys()].some(u => !st.get(u) && dfs(u)); };
    assert(!cyc(d.edges), 'the whole diagram has no directed cycle');
    r.datasets.forEach(x => assert(!cyc(d.edges.filter(e => e.datasets.includes(x.name))), `${x.name}: acyclic lineage`));
    const gm = JSON.parse(dbtText); gm.nodes['model.shop_analytics.fct_orders'].depends_on.nodes.push('source.shop_analytics.shop.orders');
    const g2 = DBT.toDiagram(gm).diagram; assert(g2.nodes.some(n => n.id === 'dbt_bronze_gold') && !cyc(g2.edges), 'a gold model that reads bronze adds a bronze → gold component, still acyclic');
    eq(lin('fct_orders').origins.map(o => node(o).label).sort(), ['payments_api', 'shop'], 'fct_orders starts at its source systems');
  });
  test('the dialog, toast and diagram labels exist once in en and once in es', () => {
    const src = read('src/i18n.js');
    ['dbt.title', 'dbt.lead', 'dbt.mode', 'dbt.mode.merge', 'dbt.mode.merge.d', 'dbt.mode.new', 'dbt.mode.new.d', 'dbt.pv', 'dbt.pv.datasets', 'dbt.pv.cols', 'dbt.pv.nolayer', 'dbt.warn.layer', 'dbt.warn.versions', 'dbt.warn.cap.datasets', 'dbt.warn.cap.columns', 'dbt.warn.cap.rules', 'dbt.warn.cap.exposures', 'dbt.go',
      'dbt.err.bad', 'dbt.err.big', 'dbt.err.many', 'dbt.err.empty', 'dbt.done.merge', 'dbt.done.new', 'dbt.grp.sources', 'dbt.grp.bronze', 'dbt.grp.silver', 'dbt.grp.gold', 'dbt.grp.process', 'dbt.grp.exposures', 'dbt.store.bronze', 'dbt.store.silver', 'dbt.store.gold', 'dbt.seeds', 'dbt.sub.source', 'dbt.sub.tables', 'dbt.lay.bronze', 'dbt.lay.silver', 'dbt.lay.gold', 'dbt.edge.reads', 'dbt.edge.builds', 'dbt.untitled']
      .forEach(k => eq(src.split(`'${k}':`).length - 1, 2, `${k}`));
  });

  /* ======================================================================
     Versión del formato: formatVersion y migraciones al abrir
     ====================================================================== */
  section('Format version');
  const MIGSRC = between('/* migrate:start */', '/* migrate:end */');
  const MIG = new Function(`${MIGSRC}; return { migrate, FORMAT_VERSION, MIGRATIONS };`)();
  // La app con dos migraciones, para probar el encadenado y las fotos de versiones: 1 → 2 renombra title a name
  const MIG2 = new Function(`${MIGSRC.replace('const FORMAT_VERSION = 1;', 'const FORMAT_VERSION = 2;').replace('{ to: 1, up: doc => doc }', '{ to: 1, up: doc => doc }, { to: 2, up: doc => { const { title, ...rest } = doc; return { ...rest, name: title }; } }')}; return migrate;`)();
  test('a file without formatVersion is version 0: it migrates to the current one and keeps its data', () => {
    const raw = { title: 'Old', nodes: [{ id: 'a' }], edges: [], groups: [] };
    const r = MIG.migrate(raw);
    eq([r.from, r.to, r.newer, r.raw.formatVersion], [0, MIG.FORMAT_VERSION, false, MIG.FORMAT_VERSION]);
    eq({ ...r.raw, formatVersion: undefined }, { ...raw, formatVersion: undefined }, 'data unchanged by the 0 → 1 migration');
    assert(!('formatVersion' in raw), 'the input is not mutated');
  });
  test('migrating twice changes nothing; invalid or non-numeric versions count as 0; non-objects pass through', () => {
    const once = MIG.migrate({ title: 'X', nodes: [] }).raw;
    eq(MIG.migrate(once).raw, once);
    eq(MIG.migrate({ title: 'X', formatVersion: 'abc' }).from, 0);
    eq(MIG.migrate({ title: 'X', formatVersion: -3 }).from, 0);
    eq([MIG.migrate(null).raw, MIG.migrate([1]).raw], [null, [1]]);
  });
  test('a file from a newer format is flagged and left untouched', () => {
    const raw = { title: 'Future', formatVersion: MIG.FORMAT_VERSION + 4, nodes: [], extra: { a: 1 } };
    const r = MIG.migrate(raw);
    eq([r.newer, r.from], [true, MIG.FORMAT_VERSION + 4]);
    assert(r.raw === raw, 'same object, nothing applied');
  });
  test('migrations run in order, from the file version onwards, on the root and on every saved version snapshot', () => {
    const doc = { title: 'T', versions: [{ id: 'v1', diagram: { title: 'S1', nodes: [] } }, { id: 'v2' }, null] };
    const r = MIG2(doc);
    eq([r.from, r.to, r.raw.formatVersion], [0, 2, 2]);
    eq([r.raw.name, 'title' in r.raw], ['T', false], 'root migrated');
    eq([r.raw.versions[0].diagram.name, 'title' in r.raw.versions[0].diagram], ['S1', false], 'snapshot migrated');
    eq([r.raw.versions[1], r.raw.versions[2]], [{ id: 'v2' }, null], 'entries without a diagram are kept');
    const mid = MIG2({ title: 'T', formatVersion: 1 });
    eq([mid.from, mid.raw.name], [1, 'T'], 'a version-1 file only gets the 1 → 2 migration');
    const cur = { name: 'N', formatVersion: 2 };
    eq(MIG2(cur).raw, cur, 'a current file is unchanged');
  });
  test('the app wires it: normalize stamps the version, serialize writes it first, setModel migrates external sources only, the newer-format notice exists', () => {
    const app2 = read('src/app.js');
    assert(/const m = \{ formatVersion: FORMAT_VERSION, title:/.test(app2), 'normalize');
    assert(/if \(m\.formatVersion\) head\.unshift\(/.test(app2), 'serialize');
    assert(/if \(!opts\.current && opts\.fromEditor !== 'text'\) \{\s*const mg = migrate\(raw\);/.test(app2), 'setModel');
    assert(/toast\(T\('toast\.newerFormat'/.test(app2), 'notice');
    const i18n = read('src/i18n.js');
    eq(i18n.split("'toast.newerFormat':").length - 1, 2, 'toast.newerFormat in en and es');
  });
  test('JSON writes formatVersion as its first key; a model without it writes none (old tests stay byte-identical)', () => {
    const base = { title: 'X', nodes: [{ id: 'a', label: 'A', type: 'generic', x: 0, y: 0 }], edges: [], groups: [], decisions: [] };
    assert(serializeM({ ...base, formatVersion: 1 }).startsWith('{\n  "formatVersion": 1,\n  "title": "X"'), 'first key');
    assert(!/formatVersion/.test(serializeM(base)), 'absent without the field');
  });

  /* ======================================================================
     Disposición de migración (6R): campo del nodo, texto, avisos, fases
     ====================================================================== */
  section('Migration 6R');
  const MIGSRC6 = between('/* migration:start */', '/* migration:end */');
  const foldT = x => String(x ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const mk6 = (cfg = C) => {
    const sources = [];
    const api = new Function('C', 'fold', 'loc', 'colorVar', 'addFindingSource', 'SEVERITY', 'T', 'esc', `${MIGSRC6}; return { cleanDisposition, mgInfo, mgText, mgChips, MG, MG_BY };`)(
      cfg, foldT, v => (v && typeof v === 'object' ? v.en : v), c => c, (k, fn) => sources.push({ k, fn }), ['low', 'medium', 'high', 'critical'], (k, v) => `${k}${v == null ? '' : ':' + JSON.stringify(v)}`, x => String(x));
    return { ...api, findings: m => sources.find(x => x.k === 'migration').fn(m) };
  };
  const M6 = mk6();
  test('cleanDisposition: keys, names in both languages, aliases and spacing; unknown, off or non-string values are dropped', () => {
    eq(['rehost', 'Rehospedar', ' LIFT-AND-SHIFT ', 'replatform', 'Re-platform', 'recomprar', 'sustituir', 'rediseñar', 'redisenar', 'Retirar', 'keep'].map(M6.cleanDisposition),
      ['rehost', 'rehost', 'rehost', 'replatform', 'replatform', 'repurchase', 'repurchase', 'refactor', 'refactor', 'retire', 'retain']);
    eq(['relocate', 'reubicar', 'nope', '', null, 5, {}].map(M6.cleanDisposition), [null, null, null, null, null, null, null], 'relocate is off by default');
    const on = mk6({ ...C, migration: { ...C.migration, dispositions: { ...C.migration.dispositions, relocate: { ...C.migration.dispositions.relocate, enabled: true } } } });
    eq([on.cleanDisposition('relocate'), on.cleanDisposition('Reubicar')], ['relocate', 'relocate'], 'config can switch the seventh R on');
    eq(Object.keys(M6.MG), ['retain', 'rehost', 'replatform', 'refactor', 'repurchase', 'retire']);
  });
  test('mgText and mgChips follow the order of config.js and skip empty counts', () => {
    eq(M6.mgText({ retire: 1, rehost: 3, nope: 9 }), 'RH 3 · RT 1');
    eq(M6.mgText(undefined), '');
    assert(/mg-chip/.test(M6.mgChips({ rehost: 2 })) && M6.mgChips({}) === '');
  });
  const mgDoc = () => ({ phases: [{ id: 'p1', name: 'P1' }, { id: 'p2', name: 'P2' }], decisions: [{ id: 'ADR-001', links: { nodes: ['c'] } }],
    nodes: [{ id: 'a', label: 'A', disposition: 'retire' }, { id: 'b', label: 'B', disposition: 'retire', until: 'p2' }, { id: 'c', label: 'C', disposition: 'rehost', until: 'p2' }, { id: 'd', label: 'D', disposition: 'refactor' }, { id: 'e', label: 'E' }] });
  test('findings: retire without a retirement phase, retiring components marked to keep; the ADR rule is off by default; nothing without dispositions', () => {
    const f = M6.findings(mgDoc());
    eq(f.map(x => x.id), ['migration:retire-no-until:node:a', 'migration:until-kept:node:c']);
    eq(f.map(x => [x.source, x.rule, x.severity, x.target]), [['migration', 'mig.retire-no-until', 'low', { kind: 'node', id: 'a' }], ['migration', 'mig.until-kept', 'low', { kind: 'node', id: 'c' }]]);
    eq(M6.findings({ ...mgDoc(), phases: [] }).map(x => x.rule), ['mig.until-kept'], 'no phases, no retire-without-phase warning');
    eq(M6.findings({ nodes: [{ id: 'a', label: 'A' }] }), []);
    const on = mk6({ ...C, migration: { ...C.migration, rules: { ...C.migration.rules, 'mig.change-no-decision': { ...C.migration.rules['mig.change-no-decision'], enabled: true, severity: 'medium' } } } });
    eq(on.findings(mgDoc()).filter(x => x.rule === 'mig.change-no-decision').map(x => [x.target.id, x.severity]), [['d', 'medium']], 'refactor with no linked ADR; the rehost with an ADR is not flagged');
  });
  test('phaseStats and phaseRows carry the 6R split only when some component has a disposition', () => {
    const h = { monthly: () => 0, findings: () => [] };
    const m = { ...phDoc(), nodes: phDoc().nodes.map((n, i) => (i < 2 ? { ...n, disposition: i ? 'retire' : 'rehost' } : n)) };
    const st = PHM.phaseStats(m, 2, h);
    assert(st.mig && Object.values(st.mig).reduce((a, b) => a + b, 0) >= 1, 'split present');
    assert(!('mig' in PHM.phaseStats(phDoc(), 2, h)) && PHM.phaseRows(phDoc(), h).every(r => !('mig' in r)), 'absent without dispositions: rows stay as they were');
    assert(PHM.phaseRows(m, h).some(r => r.mig), 'rows carry it');
  });
  test('text format: disposition round trips in English and Spanish, accepts aliases and reports unknown values with their line', () => {
    const dispMap = Object.fromEntries(M6.MG_BY);
    ['en', 'es'].forEach(lang => {
      const ctx = { ...textCtx(lang), dispositions: dispMap };
      const model = { title: 'T', groups: [], edges: [], nodes: [{ id: 'a', label: 'A', type: 'generic', disposition: 'rehost' }, { id: 'b', label: 'B', type: 'generic', disposition: 'repurchase' }, { id: 'c', label: 'C', type: 'generic' }] };
      const txt = TXT.stringify(model, lang);
      assert(new RegExp(`${lang === 'es' ? 'disposición=rehospedar' : 'disposition=rehost'}`).test(txt), `written in ${lang}: ${txt}`);
      const r = TXT.parse(txt, ctx);
      eq(r.errors, [], `errors (${lang})`);
      eq(r.model.nodes.map(n => n.disposition), ['rehost', 'repurchase', undefined], `round trip (${lang})`);
    });
    const ctx = { ...textCtx('en'), dispositions: dispMap };
    const r = TXT.parse('a: Alpha disposición=Rediseñar\nb: Beta disposition=lift-and-shift\nc: Gamma disposition=teleport', ctx);
    eq(r.model.nodes.map(n => n.disposition), ['refactor', 'rehost', undefined], 'aliases in either language; unknown dropped');
    eq(r.errors.length, 1, 'one error'); assert(/teleport/.test(r.errors[0].message || r.errors[0].msg || JSON.stringify(r.errors[0])), 'names the value');
  });
  test('the app wires it: normalize cleans it, JSON and diff know the field, inspector, filter, pill, report, inventory and Review use it', () => {
    assert(/const dp = cleanDisposition\(o\.disposition\); if \(dp\) o\.disposition = dp; else delete o\.disposition;/.test(app), 'normalize');
    assert(/'replicas', 'disposition', 'radar', 'effort', 'ref', 'phase', 'until'\],\n    edge: \['id'/.test(app), 'ORDER.node');
    assert(/'replicas', 'disposition', 'radar', 'effort', 'phase', 'until'\],\n    edge: \['label'/.test(app), 'DIFF_FIELDS.node');
    assert(app.includes("'layer', 'disposition', 'radar', 'compliance']") && app.includes("if (s === 'disposition')"), 'filter');
    assert(app.includes('${dispField(t)}') && app.includes('b.dataset.disp != null'), 'inspector');
    assert(app.includes("class: 'node-mig'") && read('index.html').includes('.node-mig rect'), 'pill');
    assert(app.includes("want('migration')") && app.includes("sec('migration'") && app.includes('migration: m.nodes.some(n => n.disposition)'), 'report');
    assert(app.includes('const INV_MIG = [[\'disposition\']]') && app.includes('m.nodes.some(x => x.disposition) ? INV_MIG'), 'inventory');
    const i18n = read('src/i18n.js');
    ['flt.sec.disposition', 'mig.label', 'mig.none', 'mig.hint', 'mig.mixed', 'mig.cmp', 'mig.cmp.tip', 'find.src.migration', 'mig.f.retire.t', 'mig.f.retire.fix', 'mig.f.kept.t', 'mig.f.kept.fix', 'mig.f.adr.t', 'mig.f.adr.fix',
      'rep.s.migration', 'rep.h.disposition', 'rep.h.phaseIn', 'rep.h.phaseOut', 'inv.c.disposition'].forEach(k => eq(i18n.split(`'${k}':`).length - 1, 2, `${k} once per language`));
    assert(/disposition=rehost/.test(read('src/text-lang.js')), 'documented in the text language header');
  });
  test('a diagram without dispositions keeps its JSON, text and phase rows byte-identical', () => {
    const base = { title: 'X', formatVersion: 1, nodes: [{ id: 'a', label: 'A', type: 'generic', x: 0, y: 0 }], edges: [], groups: [], decisions: [] };
    assert(!/disposition/.test(serializeM(base)) && !/disposition|disposición/.test(TXT.stringify(base, 'en')) && !/disposition|disposición/.test(TXT.stringify(base, 'es')), 'no key anywhere');
    assert(/"disposition": "rehost"/.test(serializeM({ ...base, nodes: [{ ...base.nodes[0], disposition: 'rehost' }] })), 'written when present');
  });

  /* ======================================================================
     Estimación de esfuerzo: node.effort, phase.extra, m.estimation
     ====================================================================== */
  section('Effort estimation');
  test('config: estimation ships without roles, so nothing is offered until a company adds its own', () => {
    const e = C.estimation; assert(e && Array.isArray(e.roles) && e.roles.length === 0 && e.hoursPerDay === 8 && e.contingency === 0, JSON.stringify(e));
  });
  test('cleanEffort: unknown roles are kept, days are cleaned, duplicates add up, at most 8 roles', () => {
    eq(PHM.cleanEffort([{ role: ' Dev ', days: '10' }, { role: 'devops', days: 3.456 }, { role: 'dev', days: 2.5 }]), [{ role: 'dev', days: 12.5 }, { role: 'devops', days: 3.46 }], 'trim, lower case, round to 2 decimals, add duplicates');
    eq(PHM.cleanEffort([{ role: 'ghost-role', days: 1 }]), [{ role: 'ghost-role', days: 1 }], 'a role config.js does not know stays');
    eq(PHM.cleanEffort([{ role: 'dev', days: 0 }, { role: 'dev', days: -2 }, { role: 'dev', days: 'x' }, { role: '', days: 1 }, { role: '9x', days: 1 }, { role: 'a b', days: 1 }, null, 'x', { days: 1 }]), [], 'zero, negative, text, bad roles and non objects go');
    eq(PHM.cleanEffort([{ role: 'dev', days: '2,5' }]), [{ role: 'dev', days: 2.5 }], 'decimal comma');
    eq(PHM.cleanEffort([{ role: 'dev', days: 1e9 }]), [{ role: 'dev', days: 9999 }], 'capped');
    eq(PHM.cleanEffort(Array.from({ length: 12 }, (_, i) => ({ role: `r${i}`, days: 1 }))).length, 8, 'at most 8');
    eq(PHM.cleanEffort(undefined), [], 'no key');
  });
  test('cleanExtra and cleanEstimation: extra work needs label, role and days; contingency is a percentage', () => {
    eq(PHM.cleanExtra([{ label: '  Project   management ', role: 'PM', days: '4' }, { label: '', role: 'pm', days: 1 }, { label: 'x', role: 'pm', days: 0 }, { label: 'y', days: 1 }]), [{ label: 'Project management', role: 'pm', days: 4 }], 'only the complete one');
    eq(PHM.cleanExtra(Array.from({ length: 30 }, (_, i) => ({ label: `t${i}`, role: 'dev', days: 1 }))).length, 20, 'at most 20');
    eq(PHM.cleanEstimation({ contingency: '15' }), { contingency: 15 }, 'text number'); eq(PHM.cleanEstimation({ contingency: 12.345 }), { contingency: 12.3 }, 'one decimal');
    eq(PHM.cleanEstimation({ contingency: 0 }), { contingency: 0 }, 'zero is a choice');
    [null, {}, { contingency: -1 }, { contingency: 101 }, { contingency: 'x' }, { contingency: '' }, [], 5].forEach(v => eq(PHM.cleanEstimation(v), null, `rejected: ${JSON.stringify(v)}`));
    const ph = PHM.cleanPhases([{ id: 'a', extra: [{ label: 'QA', role: 'qa', days: 5 }] }, { id: 'b', extra: [{ label: '', role: 'qa', days: 5 }] }]);
    eq(ph[0].extra, [{ label: 'QA', role: 'qa', days: 5 }], 'a phase keeps its extra work'); assert(!('extra' in ph[1]), 'no key when nothing valid');
  });
  test('text format: effort round trips in English and Spanish and reports bad pairs with their line', () => {
    ['en', 'es'].forEach(lang => {
      const model = { title: 'T', groups: [], edges: [], nodes: [{ id: 'a', label: 'A', type: 'generic', effort: [{ role: 'dev', days: 10 }, { role: 'devops', days: 3.5 }] }, { id: 'b', label: 'B', type: 'generic' }] };
      const txt = TXT.stringify(model, lang);
      assert(new RegExp(`${lang === 'es' ? 'esfuerzo' : 'effort'}=dev:10,devops:3\\.5`).test(txt), `written in ${lang}: ${txt}`);
      const r = TXT.parse(txt, textCtx(lang));
      eq(r.errors || [], [], `no errors (${lang})`); eq(r.model.nodes.map(n => n.effort), [[{ role: 'dev', days: 10 }, { role: 'devops', days: 3.5 }], undefined], `round trip (${lang})`);
    });
    const r = TXT.parse('a: Alpha effort=dev:10,qa:x,:3,ops\nb: Beta esfuerzo=dev:2,5', textCtx('en'));
    eq(r.model.nodes.map(n => n.effort), [[{ role: 'dev', days: 10 }], [{ role: 'dev', days: 2 }]], 'good pairs stay, the rest is dropped');
    eq((r.errors || []).map(e => e.line), [1, 1, 1, 2], 'one error per bad pair, with its line');
  });
  test('the app wires it: normalize, JSON order, diff, text, inspector and phases know the effort', () => {
    assert(app.includes('{ const ef = cleanEffort(o.effort); if (ef.length) o.effort = ef; else delete o.effort; }'), 'normalize');
    assert(app.includes('{ const es = cleanEstimation(raw.estimation); if (es) m.estimation = es; }') && app.includes("if (m.estimation) head.push("), 'estimation');
    assert(app.includes("opts.fromEditor === 'text' && S.model.estimation") && app.includes('old?.extra && !p.extra'), 'text editor keeps what only the JSON carries');
    assert(app.includes('${effortField(t)}') && app.includes('data-ef-add') && app.includes('data-ef-rm') && app.includes('select[data-ef-role]'), 'inspector');
    const i18n = read('src/i18n.js');
    ['est.label', 'est.role', 'est.days', 'est.add', 'est.remove', 'est.hint', 'est.total', 'est.unknown'].forEach(k => eq(i18n.split(`'${k}':`).length - 1, 2, `${k} once per language`));
    assert(/effort=dev:10,devops:3/.test(read('src/text-lang.js')), 'documented in the text language header');
  });
  test('a diagram without effort keeps its JSON and text byte-identical', () => {
    const base = { title: 'X', formatVersion: 1, nodes: [{ id: 'a', label: 'A', type: 'generic', x: 0, y: 0 }], edges: [], groups: [], decisions: [] };
    assert(!/effort|estimation|extra/.test(serializeM(base)) && !/effort|esfuerzo/.test(TXT.stringify(base, 'en') + TXT.stringify(base, 'es')), 'no key anywhere');
    const withIt = serializeM({ ...base, estimation: { contingency: 10 }, phases: [{ id: 'p', name: 'P', extra: [{ label: 'QA', role: 'qa', days: 5 }] }], nodes: [{ ...base.nodes[0], effort: [{ role: 'dev', days: 3 }] }] });
    assert(/"effort": \[\{"role":"dev","days":3\}\]/.test(withIt) && /"estimation": \{"contingency":10\}/.test(withIt) && /"extra": \[/.test(withIt), withIt);
  });

  // Motor y avisos de la estimación, extraídos de app.js con una configuración de prueba (dos perfiles con tarifa, uno sin)
  const mkEst = (cfg = {}) => {
    const sources = [], C2 = { ...C, estimation: { hoursPerDay: 8, contingency: 0, roles: [{ id: 'dev', label: { en: 'Developer', es: 'Desarrollo' }, rate: 600 }, { id: 'qa', label: { en: 'QA', es: 'Pruebas' }, rate: 450 }, { id: 'pm', label: { en: 'PM' } }], rules: C.estimation.rules, ...cfg } };
    const src = `${between('/* phaseModel:start */', '/* phaseModel:end */')};\n${app.slice(app.indexOf('  /* ---------- estimación de esfuerzo'), app.indexOf('  const phaseHelpers = {'))}`;
    const api = new Function('C', 'loc', 'addFindingSource', 'SEVERITY', 'T', 'round2', `${src}; return { phaseEffort, effortHelpers, efInfo, efDaysOf, efCostOf, EF_ROLES };`)(
      C2, v => (v && typeof v === 'object' ? v.en : v), (k, fn) => sources.push({ k, fn }), ['low', 'medium', 'high', 'critical'], (k, v) => `${k}${v == null ? '' : ':' + JSON.stringify(v)}`, v => Math.round(v * 100) / 100);
    return { ...api, findings: m => sources.find(x => x.k === 'estimation').fn(m) };
  };
  const E = mkEst();
  const efDoc = () => ({ phases: [{ id: 'p1', name: 'MVP', extra: [{ label: 'Project management', role: 'pm', days: 4 }] }, { id: 'p2', name: 'Wave 2' }], nodes: [
    { id: 'a', label: 'A', effort: [{ role: 'dev', days: 10 }, { role: 'qa', days: 2 }] }, { id: 'b', label: 'B', effort: [{ role: 'dev', days: 5 }], phase: 'p1' }, { id: 'c', label: 'C', phase: 'p2', effort: [{ role: 'dev', days: 20 }] }, { id: 'd', label: 'D', phase: 'p2' }, { id: 'e', label: 'E', effort: [{ role: 'ghost', days: 1 }], phase: 'p2' }] });
  test('phaseEffort: a component counts in the phase where it appears, no phase means the first, extra work in its own phase', () => {
    const r = E.phaseEffort(efDoc(), E.effortHelpers).rows;
    eq(r.map(x => [x.id, x.comps, x.estimated, x.days, x.extraDays]), [['p1', 2, 2, 21, 4], ['p2', 3, 2, 21, 0]], 'a and b in MVP (a has no phase), c, d and e in Wave 2');
    eq(r[0].byRole, { dev: 15, qa: 2, pm: 4 }, 'days per role, extra included'); eq(r[1].missing, ['d'], 'the component with no effort');
    const moved = efDoc(); moved.nodes[0].phase = 'p2';
    eq(E.phaseEffort(moved, E.effortHelpers).rows.map(x => x.days), [9, 33], 'moving a component moves its days');
  });
  test('phaseEffort: costs use the daily rates, a role without rate adds days but no cost, contingency is added and the totals accumulate', () => {
    const t = E.phaseEffort(efDoc(), E.effortHelpers);
    eq(t.rows.map(x => [x.cost, x.contingency, x.total, x.cumulative]), [[9900, 0, 9900, 9900], [12000, 0, 12000, 21900]], 'dev 15×600 + qa 2×450, pm has no rate; wave 2: dev 20×600, ghost has no rate');
    eq(t.rows.map(x => x.unrated), [['pm'], ['ghost']], 'roles with no rate'); eq(t.totals, { days: 42, extraDays: 4, cost: 21900, contingency: 0, total: 21900, daysTotal: 42 });
    const withC = E.phaseEffort({ ...efDoc(), estimation: { contingency: 15 } }, E.effortHelpers);
    eq(withC.pct, 15); eq(withC.rows.map(x => [x.contingency, x.total, x.daysTotal, x.cumulative, x.cumDays]), [[1485, 11385, 24.15, 11385, 24.15], [1800, 13800, 24.15, 25185, 48.3]], 'the document contingency, rounded to cents');
    eq(mkEst({ contingency: 10 }).phaseEffort(efDoc(), mkEst({ contingency: 10 }).effortHelpers).pct, 10, 'config default'); eq(E.phaseEffort({ ...efDoc(), estimation: { contingency: 0 } }, mkEst({ contingency: 10 }).effortHelpers).pct, 0, 'the document wins, even with 0');
    eq(E.phaseEffort({ phases: [{ id: 'p', name: 'P' }], nodes: [{ id: 'a', label: 'A' }] }, E.effortHelpers), null, 'no effort anywhere: nothing'); eq(E.phaseEffort({ nodes: [] }, E.effortHelpers), null);
  });
  test('phaseEffort: without phases there is one row; a diagram with only extra work still counts', () => {
    const r = E.phaseEffort({ nodes: [{ id: 'a', label: 'A', effort: [{ role: 'dev', days: 3 }] }] }, E.effortHelpers).rows; eq(r.length, 1); eq([r[0].id, r[0].days, r[0].total], ['', 3, 1800]);
    eq(E.phaseEffort({ phases: [{ id: 'p', name: 'P', extra: [{ label: 'QA', role: 'qa', days: 2 }] }], nodes: [{ id: 'a', label: 'A' }] }, E.effortHelpers).totals.total, 900);
    eq(E.efDaysOf([{ role: 'dev', days: 1.25 }, { role: 'qa', days: 2 }]), 3.25); eq(E.efCostOf([{ role: 'dev', days: 2 }, { role: 'ghost', days: 9 }]), 1200); eq(E.efInfo('qa').label, 'QA'); eq(E.efInfo('ghost'), { id: 'ghost', known: false, label: 'ghost', rate: null });
  });
  test('findings: phases where only some components are estimated, roles with no rate; both can be switched off; nothing without effort', () => {
    const f = E.findings(efDoc());
    eq(f.map(x => x.id), ['estimation:unestimated:p2', 'estimation:norate:ghost'], 'p1 is fully estimated, p2 is missing d; pm only appears in extra work (no component to point at)');
    eq(f.map(x => [x.source, x.rule, x.severity, x.target]), [['estimation', 'est.unestimated', 'low', { kind: 'node', id: 'd' }], ['estimation', 'est.no-rate', 'low', { kind: 'node', id: 'e' }]]);
    eq(E.findings({ nodes: [{ id: 'a', label: 'A' }] }), []); eq(E.findings({ phases: [{ id: 'p', name: 'P' }], nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }), [], 'nobody estimated: nothing to compare');
    const off = mkEst({ rules: { 'est.unestimated': { enabled: false }, 'est.no-rate': { enabled: true, severity: 'high' } } });
    eq(off.findings(efDoc()).map(x => [x.rule, x.severity]), [['est.no-rate', 'high']]);
  });
  test('the app wires it: phase table, report section, inventory sheet and column, Review source and texts in both languages', () => {
    assert(app.includes('${ph.length ? phaseEstimate() : \'\'}') && app.includes('function phaseEstimate()') && app.includes('<tfoot>'), 'phase table');
    assert(app.includes("if (want('estimation'))") && app.includes("sec('estimation', blocks)") && app.includes('estimation: !!phaseEffort(m, effortHelpers)'), 'report');
    assert(app.includes("mk('estimation', INV_EST") && app.includes("...(m.nodes.some(x => x.effort?.length) ? [['effort']] : [])") && app.includes('effort: efDaysOf(n.effort)'), 'inventory');
    assert(app.includes("addFindingSource('estimation'"), 'Review');
    const i18n = read('src/i18n.js');
    ['find.src.estimation', 'est.all', 'est.f.unest.t', 'est.f.unest.fix', 'est.f.rate.t', 'est.f.rate.fix', 'est.title', 'est.cont', 'est.cont.none', 'est.comps', 'est.comps.tip', 'est.days.tip', 'est.extra', 'est.incl', 'est.build', 'est.cum', 'est.run', 'est.run.tip', 'est.sum', 'est.unrated', 'est.unrated.tip',
      'rep.s.estimation', 'rep.h.estimated', 'rep.h.days', 'rep.h.build', 'rep.h.contingency', 'rep.h.total', 'rep.h.cumulative', 'rep.h.sum', 'inv.sheet.estimation', 'inv.c.estimated', 'inv.c.days', 'inv.c.extraDays', 'inv.c.build', 'inv.c.contingency', 'inv.c.total', 'inv.c.cumulative', 'inv.c.effort'].forEach(k => eq(i18n.split(`'${k}':`).length - 1, 2, `${k} once per language`));
    assert(C.estimation.rules['est.unestimated'].enabled && C.estimation.rules['est.no-rate'].enabled, 'rules on by default');
  });

  /* ======================================================================
     Informe de estado: statusBase / statusModel / statusText
     ====================================================================== */
  section('Status report');
  const i18nSrc = read('src/i18n.js'), DICT2 = new Function('plural', `const C = { app: {} }; ${i18nSrc.slice(i18nSrc.indexOf('const DICT = {'), i18nSrc.indexOf('\n  };', i18nSrc.indexOf('const DICT = {')) + 5)} return DICT;`)((n, one, many) => `${n} ${n === 1 ? one : many}`);
  const TL = lang => (k, v) => { const x = DICT2[lang][k] ?? DICT2.en[k] ?? k; return typeof x === 'function' ? x(v) : x; };
  const diffSrc = app.slice(app.indexOf('  const DIFF_FIELDS = {'), app.indexOf('  /* ---------- decisiones (ADR): comparar entre versiones'));
  const diffModelsT = new Function(`${diffSrc}; return diffModels;`)();
  const ST = new Function(`${between('/* statusModel:start */', '/* statusModel:end */')}; return { statusBase, statusModel, statusText, statusDoc, statusPlain };`)();
  // Ayudantes de prueba: el «riesgo» de un componente es una propiedad suelta (la diferencia de hallazgos no mira el resto)
  const stH = { verLabel: v => v.name || v.id, prepared: v => v.diagram, diff: diffModelsT, findings: m => m.nodes.filter(n => n.risk).map(n => ({ id: `f:${n.id}`, title: `${n.label} is exposed`, severity: n.risk })), monthly: m => m.nodes.reduce((a, n) => a + (n.cost || 0), 0),
    effort: m => { const d = m.nodes.reduce((a, n) => a + (n.days || 0), 0); return d ? { totals: { days: d, total: d * 500 } } : null; }, pending: () => [{ kind: 'decision', id: 'ADR-003', label: 'ADR-003 Use Kafka', missing: ['Ana', 'Luis'] }] };
  const stBase = () => ({ title: 'Shop', phases: [{ id: 'p1', name: 'MVP', date: '2026-12' }, { id: 'p2', name: 'Wave 2', date: '2027-03' }], groups: [], edges: [{ from: 'a', to: 'b' }], nodes: [
    { id: 'a', label: 'Alpha', cost: 100, risk: 'high' }, { id: 'b', label: 'Beta', phase: 'p1', days: 10 }, { id: 'e', label: 'Epsilon', risk: 'low' }] });
  const stNow = () => ({ title: 'Shop', phases: [{ id: 'p1', name: 'MVP', date: '2026-12' }, { id: 'p2', name: 'Wave 2', date: '2027-06' }], groups: [], edges: [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }], nodes: [
    { id: 'a', label: 'Alpha', cost: 160 }, { id: 'b', label: 'Beta', phase: 'p2', days: 15, desc: 'now with a queue' }, { id: 'c', label: 'Gamma', risk: 'medium' }],
    decisions: [{ id: 'ADR-001', title: 'Use Postgres', status: 'accepted', date: '2026-09-10', history: [{ status: 'proposed', date: '2026-09-02' }, { status: 'accepted', date: '2026-09-10', by: 'Ana' }] },
      { id: 'ADR-002', title: 'Keep the monolith', status: 'rejected', date: '2026-08-20', history: [{ status: 'proposed', date: '2026-08-15' }, { status: 'rejected', date: '2026-08-20' }] },
      { id: 'ADR-003', title: 'Use Kafka', status: 'proposed', date: '2026-09-12' }],
    comments: [{ id: 'CM-001', on: {}, text: 'a', date: '2026-09-11' }, { id: 'CM-002', on: {}, text: 'b', date: '2026-08-01' }, { id: 'CM-003', on: {}, text: 'c', date: '2026-09-11', internal: true }, { id: 'CM-004', on: {}, text: 'd', date: '2026-09-11', status: 'resolved' }],
    versions: [{ id: 'v1', name: 'v1', created: '2026-09-01', updated: '2026-09-01', status: 'approved', diagram: stBase() }, { id: 'v2', name: 'v2', created: '2026-09-15', updated: '2026-09-15', status: 'review', diagram: stBase() }] });
  test('statusBase: the last saved version by default, a chosen version, or a date; nothing without versions or a valid date', () => {
    const m = stNow();
    eq([ST.statusBase(m, undefined, stH).id, ST.statusBase(m, { kind: 'last' }, stH).day], ['v2', '2026-09-15'], 'last = most recently saved');
    eq(ST.statusBase(m, { kind: 'version', id: 'v1' }, stH).day, '2026-09-01'); eq(ST.statusBase(m, { kind: 'version', id: 'nope' }, stH), null);
    const d = ST.statusBase(m, { kind: 'date', day: '2026-09-10' }, stH); eq([d.id, d.day, d.snapDay], ['v1', '2026-09-10', '2026-09-01'], 'date: the diagram is compared with the latest version saved up to that day');
    const early = ST.statusBase(m, { kind: 'date', day: '2026-01-01' }, stH); eq([early.model, early.day], [null, '2026-01-01'], 'before any version: only dates count');
    eq(ST.statusBase(m, { kind: 'date', day: '10/09/2026' }, stH), null, 'bad date'); eq(ST.statusBase({ ...m, versions: [] }, undefined, stH), null, 'no versions'); eq(ST.statusBase(m, { kind: 'date', day: '2026-09-10' }, stH).label, 'v1');
  });
  test('statusModel: components, connections, phases, cost, effort and risks against the saved version', () => {
    const m = stNow(), d = ST.statusModel(m, ST.statusBase(m, { kind: 'version', id: 'v1' }, stH), stH);
    eq(d.components, { added: [{ id: 'c', label: 'Gamma' }], removed: [{ id: 'e', label: 'Epsilon' }], changed: [{ id: 'a', label: 'Alpha', fields: ['cost'] }, { id: 'b', label: 'Beta', fields: ['desc', 'phase'] }] });
    eq(d.connections, { added: 1, removed: 0, changed: 0 });
    eq(d.phases, { added: [], removed: [], moved: [{ id: 'p2', name: 'Wave 2', from: '2027-03', to: '2027-06' }], components: [{ id: 'b', label: 'Beta', from: 'MVP', to: 'Wave 2' }] });
    eq(d.cost, { from: 100, to: 160, delta: 60 }); eq(d.effort, { days: [10, 15], total: [5000, 7500] });
    eq(d.risks, { added: [{ id: 'f:c', title: 'Gamma is exposed', severity: 'medium' }], resolved: [{ id: 'f:a', title: 'Alpha is exposed', severity: 'high' }, { id: 'f:e', title: 'Epsilon is exposed', severity: 'low' }] }, 'worst first');
  });
  test('statusModel: decisions, approvals, comments and versions are measured by their dates, strictly after the reference day', () => {
    const m = stNow(), d = ST.statusModel(m, ST.statusBase(m, { kind: 'version', id: 'v1' }, stH), stH);
    eq(d.decisions, { accepted: [{ id: 'ADR-001', title: 'Use Postgres', date: '2026-09-10', by: 'Ana' }], rejected: [], proposed: [{ id: 'ADR-003', title: 'Use Kafka', date: '2026-09-12' }] }, 'the rejection of 20 Aug is older than the reference');
    eq(d.pending, [{ kind: 'decision', id: 'ADR-003', label: 'ADR-003 Use Kafka', missing: ['Ana', 'Luis'] }]);
    eq(d.comments, { open: 2, added: 1 }, 'open and public only (the internal and the resolved ones stay out); one is newer than the reference');
    eq(d.versions, [{ label: 'v2', status: 'review' }], 'v1 is the reference itself');
    const same = ST.statusModel(m, { id: '', day: '2026-09-10', label: '', model: null }, stH); eq(same.decisions.accepted, [], 'accepted on the same day does not count'); eq(same.snapshot, false); assert(!('components' in same) && !('risks' in same), 'no photo, no diagram comparison');
    eq(ST.statusModel(m, null, stH), { empty: true }, 'no reference');
  });
  test('statusModel: quiet when nothing changed; the lists are capped', () => {
    const m = { ...stNow(), decisions: [], comments: [], versions: [{ id: 'v1', name: 'v1', created: '2026-09-01', updated: '2026-09-01', diagram: stNow() }] }; m.versions[0].diagram = JSON.parse(JSON.stringify({ ...m, versions: undefined }));
    const q = ST.statusModel(m, ST.statusBase({ ...m }, undefined, { ...stH, pending: () => [] }), { ...stH, pending: () => [] }); eq(q.quiet, true, JSON.stringify(q));
    const big = { ...stNow(), nodes: Array.from({ length: 80 }, (_, i) => ({ id: `n${i}`, label: `N${i}` })) }; eq(ST.statusModel(big, ST.statusBase(big, { kind: 'version', id: 'v1' }, stH), stH).components.added.length, 50, 'at most 50 per list');
  });
  const stF = { money: v => `$${v}`, day: v => v, phaseDate: v => v };
  test('statusText (English): short sentences with plurals, lists and “and”; sections in a fixed order; deterministic', () => {
    const m = stNow(), d = ST.statusModel(m, ST.statusBase(m, { kind: 'version', id: 'v1' }, stH), stH), t = ST.statusText(d, TL('en'), stF);
    eq(t.intro, 'Changes since v1 (2026-09-01).'); eq(t.sections.map(s => s.k), ['decisions', 'risks', 'phases', 'components', 'money', 'pending', 'comments', 'versions']);
    eq(Object.fromEntries(t.sections.map(s => [s.k, s.lines])), {
      decisions: ['1 decision was accepted: ADR-001 Use Postgres.', '1 new decision was proposed: ADR-003 Use Kafka.'],
      risks: ['1 new risk was detected: Gamma is exposed.', '2 risks were resolved: Alpha is exposed (High) and Epsilon is exposed.'],
      phases: ['Phase “Wave 2” moves from 2027-03 to 2027-06.', 'Beta moves from MVP to Wave 2.'],
      components: ['1 component was added: Gamma.', '1 component was removed: Epsilon.', '2 components were modified: Alpha and Beta.', '1 connection added.'],
      money: ['Monthly running cost goes from $100 to $160 (+$60).', 'Estimated effort goes from 10 to 15 person-days (+5).', 'Build cost goes from $5000 to $7500.'],
      pending: ['ADR-003 Use Kafka is waiting for Ana and Luis.'], comments: ['2 comments are still open (1 new).'], versions: ['New version saved: v2 (In review).'] });
    eq(ST.statusText(d, TL('en'), stF), t, 'same input, same text');
  });
  test('statusText (Spanish): the same data in Spanish, with their plurals', () => {
    const m = stNow(), d = ST.statusModel(m, ST.statusBase(m, { kind: 'version', id: 'v1' }, stH), stH), t = ST.statusText(d, TL('es'), stF);
    eq(t.intro, 'Cambios desde v1 (2026-09-01).');
    eq(t.sections.find(s => s.k === 'decisions').lines, ['1 decisión fue aceptada: ADR-001 Use Postgres.', '1 decisión nueva fue propuesta: ADR-003 Use Kafka.']);
    eq(t.sections.find(s => s.k === 'risks').lines[1], '2 riesgos fueron resueltos: Alpha is exposed (Alta) y Epsilon is exposed.');
    eq(t.sections.find(s => s.k === 'components').lines, ['1 componente fue añadido: Gamma.', '1 componente fue retirado: Epsilon.', '2 componentes fueron modificados: Alpha y Beta.', '1 conexión añadida.']);
    eq(t.sections.find(s => s.k === 'money').lines[0], 'El costo mensual de operación pasa de $100 a $160 (+$60).'); eq(t.sections.find(s => s.k === 'pending').lines, ['ADR-003 Use Kafka espera a Ana y Luis.']);
  });
  test('statusText: empty sections are not printed, long lists are shortened, a quiet period and a missing reference say so clearly', () => {
    const m = stNow(), d = ST.statusModel(m, { id: '', day: '2026-09-10', label: '', model: null }, { ...stH, pending: () => [] }), t = ST.statusText(d, TL('en'), stF);
    eq(t.intro, 'Changes since 2026-09-10.'); eq(t.sections.map(s => s.k), ['decisions', 'comments', 'versions'], 'no photo: nothing about components, phases, risks or money');
    const many = ST.statusText({ ...ST.statusModel(m, ST.statusBase(m, { kind: 'version', id: 'v1' }, stH), stH), components: { added: Array.from({ length: 9 }, (_, i) => ({ id: `n${i}`, label: `N${i}` })), removed: [], changed: [] } }, TL('en'), stF);
    eq(many.sections.find(s => s.k === 'components').lines[0], '9 components were added: N0, N1, N2, N3, N4, N5 and 3 more.');
    eq(ST.statusText({ empty: true }, TL('en'), stF), { intro: 'There is no saved version or date to compare with. Save a version first, or pick a date.', sections: [], quiet: true });
    const q = ST.statusText({ baseDay: '2026-09-01', baseLabel: 'v1', quiet: true, pending: [], comments: { open: 0, added: 0 }, versions: [], decisions: { accepted: [], rejected: [], proposed: [] } }, TL('en'), stF); eq([q.quiet, q.none, q.sections], [true, 'Nothing changed in this period.', []]);
  });
  test('statusDoc and statusPlain: the same text as a document for the report renderers and as plain text; chosen sections only, in their fixed order', () => {
    const m = stNow(), t = ST.statusText(ST.statusModel(m, ST.statusBase(m, { kind: 'version', id: 'v1' }, stH), stH), TL('en'), stF), head = { title: 'Shop · Status report', lang: 'en', date: '2026-10-10' };
    const doc = ST.statusDoc(t, ['components', 'decisions'], head);
    eq(doc.sections.map(x => x.id), ['decisions', 'components'], 'fixed order, not the order of the keys'); eq([doc.title, doc.lang, doc.date, doc.sub, doc.files], ['Shop · Status report', 'en', '2026-10-10', 'Changes since v1 (2026-09-01).', []]);
    eq(doc.sections[0], { id: 'decisions', title: 'Decisions', blocks: [{ k: 'ul', items: ['1 decision was accepted: ADR-001 Use Postgres.', '1 new decision was proposed: ADR-003 Use Kafka.'] }] });
    eq(ST.statusPlain(t, ['money', 'comments'], head), 'Shop · Status report\n\nChanges since v1 (2026-09-01).\n\nCost and effort\n- Monthly running cost goes from $100 to $160 (+$60).\n- Estimated effort goes from 10 to 15 person-days (+5).\n- Build cost goes from $5000 to $7500.\n\nComments\n- 2 comments are still open (1 new).\n');
    eq(ST.statusDoc(t, [], head).sections, [], 'nothing chosen: no sections'); eq(ST.statusDoc(t, null, head).sections.length, 8, 'no list: everything');
    const quiet = { intro: 'Changes since v1 (2026-09-01).', sections: [], quiet: true, none: 'Nothing changed in this period.' };
    eq(ST.statusDoc(quiet, null, head).sub, 'Changes since v1 (2026-09-01). Nothing changed in this period.'); eq(ST.statusPlain(quiet, null, head), 'Shop · Status report\n\nChanges since v1 (2026-09-01). Nothing changed in this period.\n');
  });
  test('the dialog and the outputs are wired: menu entry, report renderers take the subtitle, API, texts in both languages', () => {
    assert(read('index.html').includes('data-export="status"') && app.includes('status: openStatusDialog') && app.includes('function openStatusDialog()') && app.includes('function statusOutput('), 'menu and dialog');
    assert(app.includes('D.sub || [D.author, D.version, D.active?.label, D.date]'), 'both renderers accept a subtitle'); assert((app.match(/D\.sub \|\| \[D\.author/g) || []).length === 2, 'markdown and html');
    assert(app.includes('reportMarkdown(statusDoc(') && app.includes('reportHTML(statusDoc(') && app.includes('statusReport, statusOutput,'), 'outputs reuse the report pipeline');
    ['exp.status', 'exp.status.ext', 'stat.title', 'stat.d.lead', 'stat.d.ref', 'stat.d.last', 'stat.d.date', 'stat.d.day', 'stat.d.sections', 'stat.d.preview', 'stat.d.copy', 'stat.d.md', 'stat.d.html', 'stat.d.done'].forEach(k => eq(i18nSrc.split(`'${k}':`).length - 1, 2, `${k} once per language`));
    const keys = [...new Set([...app.slice(app.indexOf('function openStatusDialog()'), app.indexOf('/* ---------- exportar a otras herramientas')).matchAll(/T\('(stat\.[\w.]+|toast\.[\w.]+)'/g)].map(x => x[1]))];
    keys.forEach(k => assert(i18nSrc.split(`'${k}':`).length - 1 === 2, `${k} exists in both languages`));
  });
  test('the app wires it: helpers, the API call and the texts in both languages', () => {
    assert(app.includes('const statusHelpers = {') && app.includes('function statusReport(spec, m = S.model)') && app.includes('exportThreats, exportReport, statusReport,'), 'app');
    assert(app.includes("apprMissing('decision', d, mm)") && app.includes("apprMissing('version', v, mm)"), 'pending approvals come from the approval model');
    const keys = [...new Set([...app.slice(app.indexOf('/* statusModel:start */'), app.indexOf('/* statusModel:end */')).matchAll(/T\(`?'?(stat\.[\w.]+)/g)].map(x => x[1]))];
    ['stat.empty', 'stat.intro.v', 'stat.intro.d', 'stat.none', 'stat.and', 'stat.more', 'stat.first', 'stat.dec.accepted', 'stat.risk.added', 'stat.phase.moved', 'stat.comp.added', 'stat.conn', 'stat.cost', 'stat.effort', 'stat.build', 'stat.pend.decision', 'stat.pend.version', 'stat.comments', 'stat.version', 'stat.phase.comp', 'stat.phase.compMore',
      'stat.s.decisions', 'stat.s.risks', 'stat.s.phases', 'stat.s.components', 'stat.s.money', 'stat.s.pending', 'stat.s.comments', 'stat.s.versions'].forEach(k => { eq(i18nSrc.split(`'${k}':`).length - 1, 2, `${k} once per language`); });
    assert(keys.length >= 5, `keys found in the block: ${keys.length}`);
  });

  /* ======================================================================
     Radar tecnológico: entradas, reconocimiento, fin de soporte y avisos
     ====================================================================== */
  section('Tech radar');
  const RDSRC = between('/* radar:start */', '/* radar:end */');
  const mkRd = (entries, now = '2026-10-10', extra = {}) => {
    const sources = [];
    const cfg = { ...C, techRadar: { ...C.techRadar, entries, ...extra } };
    const api = new Function('C', 'fold', 'loc', 'colorVar', 'addFindingSource', 'SEVERITY', 'T', 'today', 'fmtDay', `${RDSRC}; return { cleanRadarEntry, cleanRadarList, cleanRadarRef, radarEntries, radarOf, radarStatus, radarInfo, rdEos };`)(
      cfg, foldT, v => (v && typeof v === 'object' ? v.en : v), c => c, (k, fn) => sources.push({ k, fn }), ['low', 'medium', 'high', 'critical'], (k, v) => `${k}${v == null ? '' : ':' + JSON.stringify(v)}`, () => now, d => d);
    return { ...api, findings: m => sources.find(x => x.k === 'radar').fn(m) };
  };
  const RDE = [
    { id: 'ora11', name: 'Oracle 11g', match: { text: 'oracle 11' }, ring: 'retire', eos: '2020-12', replaceWith: { en: 'Oracle 19c', es: 'Oracle 19c' }, note: 'No patches' },
    { id: 'pg', name: 'PostgreSQL', match: { icon: 'azure/postgresql' }, ring: 'adopt' },
    { id: 'node16', name: 'Node.js 16', match: { type: 'compute', text: 'node 16' }, ring: 'hold', eos: '2026-12' },
    { id: 'vm', name: 'Old VM', match: { type: 'vm' }, ring: 'trial', eos: '2027-03-15' }
  ];
  test('config radar is empty by default, so nothing is recognised and no finding appears', () => {
    const R0 = mkRd(C.techRadar.entries);
    eq([C.techRadar.entries.length, R0.radarEntries({}).length], [0, 0]);
    eq(R0.radarOf({ id: 'a', label: 'Oracle 11', type: 'db' }, {}), null);
    eq(R0.findings({ nodes: [{ id: 'a', label: 'Oracle 11' }] }), []);
  });
  test('cleanRadarEntry keeps valid entries and drops those without id, ring or match; bad dates and long text are cleaned', () => {
    const R = mkRd([]);
    eq(R.cleanRadarEntry({ id: 'x y', ring: 'adopt', match: { text: 'a' } }), null, 'id with a space');
    eq(R.cleanRadarEntry({ id: 'x', ring: 'nope', match: { text: 'a' } }), null, 'ring');
    eq(R.cleanRadarEntry({ id: 'x', ring: 'adopt', match: {} }), null, 'empty match');
    eq(R.cleanRadarEntry({ id: 'x', ring: 'HOLD', match: { text: ' Oracle  11 ', icon: ['x'] }, eos: '2026-13', note: 'n'.repeat(300), name: { en: 'N', es: 'Ñ', xx1: 'bad' } }),
      { id: 'x', ring: 'hold', match: { text: 'Oracle 11' }, name: { en: 'N', es: 'Ñ' }, note: 'n'.repeat(200) });
    eq(R.cleanRadarEntry({ id: 'x', ring: 'hold', match: { type: 'db' }, eos: '2026-02' }).eos, '2026-02', 'a month is kept as written');
    eq(R.cleanRadarList([RDE[0], RDE[0], null, 3, { id: 'q' }]).map(e => e.id), ['ora11'], 'duplicates and junk dropped');
    eq([R.rdEos('2024-02'), R.rdEos('2026-02-30'), R.rdEos('2026-06-15'), R.rdEos('x')], ['2024-02-29', '', '2026-06-15', ''], 'end of month, invalid day, full date');
  });
  test('cleanRadarRef: ids pass, false and none exclude, anything else is nothing', () => {
    const R = mkRd([]);
    eq([' ora11 ', false, 'NONE', 'a b', '', 7, null].map(R.cleanRadarRef), ['ora11', 'none', 'none', null, null, null, null]);
  });
  test('radarOf: first match wins, every given field must match, text ignores case and accents, a pin overrides, none excludes, an unknown pin is nothing', () => {
    const R = mkRd(RDE), m = {};
    const id = n => R.radarOf(n, m)?.id ?? null;
    eq(id({ label: 'ORACLÉ 11g', sub: 'DB' }), 'ora11');
    eq(id({ label: 'Reporting', sub: 'oracle 11' }), 'ora11', 'subtitle counts');
    eq(id({ label: 'x', icon: 'azure/postgresql' }), 'pg');
    eq(id({ label: 'Node 16 api', type: 'compute' }), 'node16');
    eq(id({ label: 'Node 16 api', type: 'db' }), null, 'type and text both required');
    eq(id({ label: 'Plain', type: 'vm' }), 'vm');
    eq(id({ label: 'Oracle 11', radar: 'pg' }), 'pg', 'pin');
    eq(id({ label: 'Oracle 11', radar: 'none' }), null, 'excluded');
    eq(id({ label: 'Oracle 11', radar: 'ghost' }), null, 'unknown pin');
    eq(R.radarOf(null, m), null);
  });
  test('document entries add to config ones and replace the same id', () => {
    const R = mkRd(RDE), m = { radar: [{ id: 'pg', name: 'PG doc', match: { icon: 'azure/postgresql' }, ring: 'hold' }, { id: 'mine', match: { text: 'legacy' }, ring: 'retire' }] };
    eq(R.radarEntries(m).map(e => [e.id, e.ring]), [['ora11', 'retire'], ['pg', 'hold'], ['node16', 'hold'], ['vm', 'trial'], ['mine', 'retire']]);
    eq(R.radarOf({ label: 'Legacy app' }, m)?.id, 'mine');
    eq(R.radarEntries({}).length, 4, 'a model without its own list uses config only');
  });
  test('radarStatus uses fixed dates: ok / soon within warnMonths / ended once the end of the support month has passed', () => {
    const R = mkRd(RDE, '2026-10-10'), st = e => R.radarStatus(e, '2026-10-10');
    eq([st({}), st({ eos: '2026-09' }), st({ eos: '2026-10-09' }), st({ eos: '2026-10-10' }), st({ eos: '2026-10' }), st({ eos: '2027-04-10' }), st({ eos: '2027-04-11' })],
      ['none', 'ended', 'ended', 'soon', 'soon', 'soon', 'ok']);
    const R3 = mkRd(RDE, '2026-10-10', { warnMonths: 1 });
    eq([R3.radarStatus({ eos: '2026-11-10' }, '2026-10-10'), R3.radarStatus({ eos: '2026-11-11' }, '2026-10-10')], ['soon', 'ok'], 'warnMonths is configurable');
  });
  const rdDoc = () => ({ phases: [{ id: 'p1', name: 'P1', date: '2026-06' }, { id: 'p2', name: 'P2', date: '2027-09' }],
    nodes: [{ id: 'a', label: 'Oracle 11 core' }, { id: 'b', label: 'Orders API Node 16', type: 'compute', phase: 'p2' }, { id: 'c', label: 'Batch', type: 'vm' }, { id: 'd', label: 'Oracle 11 rep', radar: 'pg', disposition: 'retain' },
      { id: 'e', label: 'Old', type: 'vm', radar: 'ora11', disposition: 'retain' }, { id: 'f', label: 'Plain' }] });
  test('findings: support ended, ring retire, support soon, phase after the end of support, hold added by a phase, retire kept in the 6R; nothing for adopt', () => {
    const R = mkRd(RDE), f = R.findings(rdDoc());
    const by = Object.fromEntries(f.map(x => [`${x.rule}:${x.target.id}`, x]));
    eq(Object.keys(by).sort(), ['rdr.eos-passed:a', 'rdr.eos-passed:e', 'rdr.eos-soon:b', 'rdr.eos-soon:c', 'rdr.hold-added:b', 'rdr.phase-after-eos:b', 'rdr.phase-after-eos:c', 'rdr.retire-retained:e'].sort());
    eq([by['rdr.eos-passed:a'].severity, by['rdr.hold-added:b'].severity, by['rdr.phase-after-eos:b'].severity, by['rdr.retire-retained:e'].severity], ['high', 'low', 'medium', 'medium']);
    eq(by['rdr.eos-passed:a'].id, 'radar:eos-passed:node:a'); eq(by['rdr.eos-passed:a'].source, 'radar');
    assert(/Oracle 19c/.test(by['rdr.eos-passed:a'].fix), 'fix names the replacement');
    const retire = R.findings({ nodes: [{ id: 'z', label: 'Oracle 11', radar: 'x' }], radar: [{ id: 'x', match: { text: 'q' }, ring: 'retire' }] });
    eq(retire.map(x => x.rule), ['rdr.retire'], 'ring retire without a date');
    const soon = mkRd([{ id: 's', match: { text: 'zz' }, ring: 'trial', eos: '2027-02' }]).findings({ nodes: [{ id: 'q', label: 'ZZ' }] });
    eq(soon.map(x => [x.rule, x.severity]), [['rdr.eos-soon', 'medium']]);
  });
  test('findings: until limits the phases checked, rules can be switched off or re-rated, a model without matches gives none', () => {
    const R = mkRd(RDE), d = rdDoc();
    d.nodes[2] = { ...d.nodes[2], until: 'p2' };
    eq(R.findings(d).filter(x => x.target.id === 'c').map(x => x.rule), ['rdr.eos-soon'], 'retired before the late phase: only the support warning (p1 is dated before the end of support)');
    const off = mkRd(RDE, '2026-10-10', { rules: { ...C.techRadar.rules, 'rdr.eos-passed': { enabled: false } } });
    assert(!off.findings(rdDoc()).some(x => x.rule === 'rdr.eos-passed'), 'switched off');
    const hi = mkRd(RDE, '2026-10-10', { rules: { ...C.techRadar.rules, 'rdr.hold-added': { enabled: true, severity: 'critical' } } });
    eq(hi.findings(rdDoc()).find(x => x.rule === 'rdr.hold-added').severity, 'critical');
    eq(R.findings({ nodes: [{ id: 'a', label: 'Nothing' }] }), []);
  });
  test('text format: radar=<id> and radar=none round trip in English and Spanish; a bad value is reported with its line', () => {
    ['en', 'es'].forEach(lang => {
      const model = { title: 'T', groups: [], edges: [], nodes: [{ id: 'a', label: 'A', type: 'generic', radar: 'ora11' }, { id: 'b', label: 'B', type: 'generic', radar: 'none' }, { id: 'c', label: 'C', type: 'generic' }] };
      const txt = TXT.stringify(model, lang), r = TXT.parse(txt, textCtx(lang));
      assert(/radar=ora11/.test(txt) && /radar=none/.test(txt), `written (${lang}): ${txt}`);
      eq(r.errors, [], `errors (${lang})`);
      eq(r.model.nodes.map(n => n.radar), ['ora11', 'none', undefined], `round trip (${lang})`);
    });
    const r = TXT.parse('a: Alpha radar=ninguno\nb: Beta radar="no good"', textCtx('en'));
    eq(r.model.nodes.map(n => n.radar), ['none', undefined]); eq(r.errors.length, 1);
  });
  test('JSON: radar entries are written after the layout keys, a node pin is a node field, and a model without radar writes nothing', () => {
    const base = { title: 'X', formatVersion: 1, nodes: [{ id: 'a', label: 'A', type: 'generic', x: 0, y: 0 }], edges: [], groups: [], decisions: [] };
    assert(!/radar/.test(serializeM(base)) && !/radar/.test(TXT.stringify(base, 'en')), 'no key anywhere');
    const j = serializeM({ ...base, radar: [{ id: 'x', ring: 'hold', match: { text: 'a' } }], nodes: [{ ...base.nodes[0], radar: 'x' }] });
    assert(/"radar": \[\n    \{"id":"x","ring":"hold","match":\{"text":"a"\}\}\n  \]/.test(j) && /"radar": "x"/.test(j), j);
  });
  test('the app wires it: normalize cleans node pins and the document list, text editor keeps the list, inspector, filter, tag, report, inventory and i18n', () => {
    assert(/const rr = cleanRadarRef\(o\.radar\); if \(rr\) o\.radar = rr; else delete o\.radar;/.test(app), 'normalize node');
    assert(/const rd = cleanRadarList\(raw\.radar\); if \(rd\.length\) m\.radar = rd;/.test(app), 'normalize list');
    assert(app.includes('...(m.radar?.length ? { radar: m.radar } : {})'), 'snapshot');
    assert(/Array\.isArray\(raw\.radar\) && S\.model\.radar/.test(app), 'text editor keeps the list');
    assert(app.includes('${radarField(t)}') && app.includes("select[data-radar]") && app.includes("if (s === 'radar')") && app.includes('radar: radarOptions(m)'), 'inspector and filter');
    assert(app.includes("...radarTags(n)") && read('index.html').includes('.dt-radar'), 'tag');
    assert(app.includes("want('radar')") && app.includes("sec('radar'") && app.includes('radar: m.nodes.some(n => radarOf(n, m))') && app.includes('INV_RADAR'), 'report and inventory');
    const i18n = read('src/i18n.js');
    ['radar.label', 'flt.sec.radar', 'find.src.radar', 'radar.auto', 'radar.none', 'radar.noneFlt', 'radar.hint', 'radar.mixed', 'radar.attn', 'radar.eol', 'radar.eos.on', 'radar.eos.ended', 'radar.replace',
      'radar.f.eos-passed.t', 'radar.f.retire.t', 'radar.f.eos-soon.t', 'radar.f.phase-after-eos.t', 'radar.f.hold-added.t', 'radar.f.retire-retained.t',
      'radar.f.fix.replace', 'radar.f.fix.plan', 'radar.f.fix.phase', 'radar.f.fix.hold', 'radar.f.fix.migrate', 'rep.s.radar', 'rep.h.ring', 'rep.h.radarProduct', 'rep.h.eos', 'rep.h.replaceWith', 'inv.c.radar', 'inv.c.radarEos']
      .forEach(k => eq(i18n.split(`'${k}':`).length - 1, 2, `${k} once per language`));
    assert(/radar=oracle11/.test(read('src/text-lang.js')), 'documented in the text language header');
  });

  /* ---------- comentarios: hilos sobre un elemento ---------- */
  const CMSRC = between('/* commentModel:start */', '/* commentModel:end */');
  const mkCm = (cfg = C) => {
    const sources = [];
    const api = new Function('C', 'isDay', 'addFindingSource', 'SEVERITY', 'T', `${CMSRC}; return { cleanComments, cmOpen, cmHas, cleanFeedback, mergeFeedback };`)(
      cfg, v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T12:00`).toISOString().slice(0, 10) === v, (k, fn) => sources.push({ k, fn }), ['low', 'medium', 'high', 'critical'], (k, v) => `${k}${v == null ? '' : ':' + JSON.stringify(v)}`);
    return { ...api, findings: m => sources.find(x => x.k === 'comments').fn(m) };
  };
  const CM = mkCm();
  const cmDoc = () => ({ nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ id: 'e1', from: 'a', to: 'b' }], groups: [{ id: 'g1', label: 'G' }], decisions: [{ id: 'ADR-001' }], requirements: [{ id: 'REQ-001' }], versions: [{ id: 'v1' }] });
  test('cleanComments: keeps valid threads in order, trims text, drops empty ones, numbers the missing ids after the highest one', () => {
    const out = CM.cleanComments([
      { id: 'CM-007', on: { kind: 'node', id: 'a' }, author: '  Ana   Ruiz ', date: '2026-10-09', text: '  Why EC2?\r\nAnd cost.  ' },
      { on: { kind: 'edge', id: 'e1' }, text: 'Encrypted?' },
      { on: { kind: 'node', id: 'a' }, text: '   ' }, null, 'x', [], { text: 'general one' }
    ], cmDoc());
    eq(out.map(c => c.id), ['CM-007', 'CM-008', 'CM-009']);
    eq(out[0], { id: 'CM-007', on: { kind: 'node', id: 'a' }, author: 'Ana Ruiz', date: '2026-10-09', text: 'Why EC2?\nAnd cost.' });
    eq(out[2].on, { kind: 'general' });
    eq(Object.keys(out[0]), ['id', 'on', 'author', 'date', 'text'], 'no empty keys');
  });
  test('cleanComments: duplicate or malformed ids are renumbered; all six target kinds are accepted when they exist', () => {
    const out = CM.cleanComments(['node:a', 'edge:e1', 'group:g1', 'decision:ADR-001', 'requirement:REQ-001', 'version:v1'].map(k => { const [kind, id] = k.split(':'); return { id: 'CM-001', on: { kind, id }, text: k }; }), cmDoc());
    eq(out.map(c => c.id), ['CM-001', 'CM-002', 'CM-003', 'CM-004', 'CM-005', 'CM-006']);
    eq(out.map(c => c.on.kind), ['node', 'edge', 'group', 'decision', 'requirement', 'version']);
    eq(CM.cleanComments([{ id: 'x1', on: { kind: 'node', id: 'a' }, text: 't' }], cmDoc())[0].id, 'CM-001');
  });
  test('cleanComments: a target that no longer exists (or has an unknown kind) becomes general and remembers the old id in was', () => {
    const out = CM.cleanComments([{ on: { kind: 'node', id: 'gone' }, text: 'a' }, { on: { kind: 'planet', id: 'a' }, text: 'b' }, { on: { kind: 'node' }, text: 'c' }, { on: { kind: 'general' }, was: 'old', text: 'd' }], cmDoc());
    eq(out.map(c => c.on), [{ kind: 'general' }, { kind: 'general' }, { kind: 'general' }, { kind: 'general' }]);
    eq(out.map(c => c.was), ['gone', undefined, undefined, 'old']);
    eq(CM.cleanComments(out, { ...cmDoc(), nodes: [{ id: 'gone' }] }).map(c => c.on.kind), ['general', 'general', 'general', 'general'], 'general threads stay general when the old element comes back');
  });
  test('cleanComments: status, internal and source only keep their one valid value; replies are cleaned and capped; dates must be real days', () => {
    const rs = Array.from({ length: 60 }, (_, i) => ({ text: `r${i}` }));
    const [c] = CM.cleanComments([{ on: { kind: 'node', id: 'a' }, text: 'q', status: 'resolved', internal: true, source: 'client', date: '2026-02-30', replies: [{ author: 'Bo', date: '2026-10-10', text: 'ok' }, { text: '' }, ...rs] }], cmDoc());
    eq([c.status, c.internal, c.source, c.date], ['resolved', true, 'client', undefined]);
    eq(c.replies.length, 50); eq(c.replies[0], { author: 'Bo', date: '2026-10-10', text: 'ok' });
    const [d] = CM.cleanComments([{ on: { kind: 'node', id: 'a' }, text: 'q', status: 'open', internal: 'yes', source: 'me' }], cmDoc());
    eq(Object.keys(d), ['id', 'on', 'text'], 'open, a non-true internal and a foreign source write nothing');
  });
  test('cleanComments: limits from config.js, and a non-array gives an empty list', () => {
    const small = mkCm({ ...C, comments: { ...C.comments, max: 2, textMax: 5 } });
    eq(small.cleanComments([{ text: 'abcdefgh' }, { text: 'b' }, { text: 'c' }], cmDoc()).map(c => c.text), ['abcde', 'b']);
    eq([undefined, null, {}, 'x', 5].map(v => CM.cleanComments(v, cmDoc())), [[], [], [], [], []]);
  });
  test('cmOpen counts unresolved threads, for the whole document or for one element', () => {
    const m = { comments: [{ id: 'CM-001', on: { kind: 'node', id: 'a' }, text: 'x' }, { id: 'CM-002', on: { kind: 'node', id: 'a' }, text: 'y', status: 'resolved' }, { id: 'CM-003', on: { kind: 'edge', id: 'e1' }, text: 'z' }] };
    eq([CM.cmOpen(m).length, CM.cmOpen(m, 'node', 'a').length, CM.cmOpen(m, 'node', 'b').length, CM.cmOpen({}).length], [2, 1, 0, 0]);
  });
  test('findings: one per component, connection or group with open threads; resolved, general and other kinds give none; the rule can be switched off or re-rated', () => {
    const doc = { ...cmDoc(), comments: [
      { id: 'CM-001', on: { kind: 'node', id: 'a' }, text: '1' }, { id: 'CM-002', on: { kind: 'node', id: 'a' }, text: '2' }, { id: 'CM-003', on: { kind: 'node', id: 'b' }, text: '3', status: 'resolved' },
      { id: 'CM-004', on: { kind: 'edge', id: 'e1' }, text: '4' }, { id: 'CM-005', on: { kind: 'decision', id: 'ADR-001' }, text: '5' }, { id: 'CM-006', on: { kind: 'general' }, text: '6' }] };
    const f = CM.findings(doc);
    eq(f.map(x => [x.id, x.source, x.rule, x.severity, x.target]), [
      ['comments:open:node:a', 'comments', 'cmt.open', 'low', { kind: 'node', id: 'a' }], ['comments:open:edge:e1', 'comments', 'cmt.open', 'low', { kind: 'edge', id: 'e1' }]]);
    eq(f[0].title, 'cmt.f.t:2'); eq(CM.findings(cmDoc()), []);
    eq(mkCm({ ...C, comments: { ...C.comments, rules: { 'cmt.open': { enabled: false } } } }).findings(doc), []);
    eq(mkCm({ ...C, comments: { ...C.comments, rules: { 'cmt.open': { severity: 'high' } } } }).findings(doc).map(x => x.severity), ['high', 'high']);
  });
  test('JSON: comments are written after the stakeholders, one thread per line, and a document without comments writes no key', () => {
    const base = { title: 'X', formatVersion: 1, nodes: [{ id: 'a', label: 'A', type: 'generic', x: 0, y: 0 }], edges: [], groups: [], decisions: [] };
    assert(!/comments/.test(serializeM(base)) && !/comment/i.test(TXT.stringify(base, 'en')), 'no key anywhere');
    const j = serializeM({ ...base, comments: [{ id: 'CM-001', on: { kind: 'node', id: 'a' }, author: 'Ana', date: '2026-10-09', text: 'Hi', replies: [{ text: 'Yes' }] }] });
    assert(j.includes('"comments": [\n    { "id": "CM-001", "on": {"kind":"node","id":"a"}, "author": "Ana", "date": "2026-10-09", "text": "Hi", "replies": [{"text":"Yes"}] }\n  ]'), j);
    assert(j.indexOf('"edges"') < j.indexOf('"comments"'), 'after the layout keys');
  });
  test('the app wires it: normalize last, history prunes orphans, the editors and version restore keep them, badge, inspector, dialog, button, Review and i18n', () => {
    assert(/const cm = cleanComments\(raw\.comments, m\); if \(cm\.length\) m\.comments = cm;/.test(app), 'normalize');
    assert(app.includes('cleanComments(S.model.comments, S.model)'), 'changed() prunes');
    assert(/Array\.isArray\(raw\.comments\) && S\.model\.comments/.test(app), 'editors keep them');
    assert(app.includes('stakeholders: S.model.stakeholders, comments: S.model.comments'), 'restoring a version keeps them');
    assert(!/comments/.test(between('const snapshotOf = m => {', '};')), 'version snapshots do not carry them');
    assert(app.includes("class: 'node-cmt'") && app.includes('.node-cmt\')') && app.includes('${cmtField(t)}') && app.includes('function openComments(') && app.includes("$('#btn-comments')"), 'badge, export strip, inspector, dialog, button');
    const html = read('index.html');
    assert(html.includes('id="btn-comments"') && html.includes('id="cmt-n"') && html.includes('.cmt-dlg'), 'index.html');
    const i18n = read('src/i18n.js');
    ['top.comments', 'cmt.title', 'cmt.field', 'cmt.add', 'cmt.open.n', 'cmt.badge', 'cmt.flt.open', 'cmt.flt.all', 'cmt.flt.done', 'cmt.unscope', 'cmt.author', 'cmt.on', 'cmt.text', 'cmt.text.ph', 'cmt.post', 'cmt.general', 'cmt.was', 'cmt.anon',
      'cmt.client', 'cmt.internal', 'cmt.resolved', 'cmt.go', 'cmt.reply', 'cmt.send', 'cmt.resolve', 'cmt.reopen', 'cmt.internal.on', 'cmt.internal.off', 'cmt.internal.tip', 'cmt.del', 'cmt.del.sure', 'cmt.none', 'cmt.none.filter', 'cmt.max',
      'cmt.kind.node', 'cmt.kind.edge', 'cmt.kind.group', 'cmt.kind.decision', 'cmt.kind.requirement', 'cmt.kind.version', 'cmt.f.t', 'cmt.f.fix', 'find.src.comments']
      .forEach(k => eq(i18n.split(`'${k}':`).length - 1, 2, `${k} once per language`));
    assert(C.comments && C.comments.rules['cmt.open'].enabled === true, 'config.js');
  });

  const FBF = (extra = {}) => ({ format: 'diagramon-feedback', v: 1, shareId: 'ab12', title: 'T', author: ' Cliente  Uno ', created: '2026-10-10T00:00:00.000Z', comments: [
    { id: 'r-1', on: { kind: 'node', id: 'a' }, author: 'Cliente Uno', date: '2026-10-10', text: 'Multi-AZ?' }, { id: 'r-2', on: { kind: 'decision', id: 'ADR-001' }, text: 'Agree' },
    { id: 'r-3', replyTo: 'CM-001', author: 'Cliente Uno', date: '2026-10-10', text: 'Because of cost' }], ...extra });
  test('cleanFeedback: only the diagramon-feedback v1 format passes; text is trimmed, ids are required and unique, unknown targets become general', () => {
    eq([null, 5, [], {}, { format: 'x', v: 1 }, { format: 'diagramon-feedback', v: 2 }].map(CM.cleanFeedback), [null, null, null, null, null, null]);
    const fb = CM.cleanFeedback(FBF({ comments: [{ id: 'r-1', on: { kind: 'planet', id: 'a' }, text: '  hi ' }, { id: 'r-1', text: 'dup id' }, { text: 'no id' }, { id: 'r-9', text: '  ' }, 'x', { id: 'r-2', replyTo: 'CM-001', text: 'rep', date: '2026-02-31' }] }));
    eq(fb.author, 'Cliente Uno');
    eq(fb.comments, [{ id: 'r-1', author: 'Cliente Uno', date: '', text: 'hi', on: { kind: 'general' } }, { id: 'r-2', author: 'Cliente Uno', date: '', text: 'rep', replyTo: 'CM-001' }]);
    eq(CM.cleanFeedback(FBF({ shareId: 'a/b<c>1' })).shareId, 'abc1', 'share id keeps letters, digits and dashes only');
  });
  test('mergeFeedback: new threads and replies are counted, targets that no longer exist go general, and the document is left untouched', () => {
    const doc = { ...cmDoc(), comments: [{ id: 'CM-001', on: { kind: 'node', id: 'a' }, author: 'Ana', date: '2026-10-09', text: 'Why?' }] }, before = JSON.stringify(doc);
    const fb = CM.cleanFeedback(FBF({ comments: [...FBF().comments, { id: 'r-4', on: { kind: 'node', id: 'gone' }, text: 'old' }, { id: 'r-5', replyTo: 'CM-099', text: 'lost' }] }));
    const r = CM.mergeFeedback(doc, fb, '2026-10-11');
    eq([r.threads, r.replies, r.dup, r.orphan, r.stray, r.capped], [4, 1, 0, 1, 1, 0]);
    eq(JSON.stringify(doc), before, 'input not modified');
    eq(r.comments.map(c => c.id), ['CM-001', 'CM-002', 'CM-003', 'CM-004', 'CM-005']);
    eq(r.comments[0].replies, [{ author: 'Cliente Uno', date: '2026-10-10', text: 'Because of cost', imp: 'ab12:r-3' }]);
    eq(r.comments[1], { id: 'CM-002', on: { kind: 'node', id: 'a' }, author: 'Cliente Uno', date: '2026-10-10', text: 'Multi-AZ?', source: 'client', imp: 'ab12:r-1' });
    eq(r.comments[2].date, '2026-10-11', 'a missing date takes the day of the import');
    eq([r.comments[3].on, r.comments[3].was], [{ kind: 'general' }, 'gone']);
    eq([r.comments[4].on.kind, r.comments[4].source], ['general', 'client']);
  });
  test('mergeFeedback: importing the same file twice adds nothing, a new file from another share adds again, and the document limit is respected', () => {
    const doc = cmDoc(), fb = CM.cleanFeedback(FBF()), once = CM.mergeFeedback(doc, fb, '2026-10-11');
    const again = CM.mergeFeedback({ ...doc, comments: once.comments }, fb, '2026-10-11');
    eq([again.threads, again.replies, again.dup, again.comments.length], [0, 0, 3, once.comments.length]);
    eq(JSON.stringify(again.comments), JSON.stringify(once.comments), 'identical result');
    const other = CM.mergeFeedback({ ...doc, comments: once.comments }, { ...fb, shareId: 'zz99' }, '2026-10-11');
    eq([other.threads, other.replies, other.dup], [2, 1, 0], 'the key is the share id plus the comment id (the reply now finds its thread CM-001)');
    const small = mkCm({ ...C, comments: { ...C.comments, max: 2 } }), r = small.mergeFeedback(doc, small.cleanFeedback(FBF()), '2026-10-11');
    eq([r.comments.length, r.capped], [2, 0], 'cleanFeedback already stops at the limit');
    const full = small.mergeFeedback({ ...doc, comments: [{ id: 'CM-001', on: { kind: 'general' }, text: 'x' }, { id: 'CM-002', on: { kind: 'general' }, text: 'y' }] }, small.cleanFeedback(FBF({ comments: [{ id: 'q', text: 'z' }] })), '2026-10-11');
    eq([full.comments.length, full.capped], [2, 1]);
  });
  test('the app wires it: the import picks the encrypted comments file, asks for the password, shows the counts and applies them as one undo step; the report lists open public threads', () => {
    assert(app.includes("env.kind === 'feedback' && env.v === 'fb1'") && app.includes('openFeedbackImport(env)') && app.includes('SH.openFeedback(env, form.elements.pw.value)'), 'import hook');
    assert(/pushHistory\(\);\s+S\.model\.comments = res\.comments;/.test(app), 'one history step');
    assert(app.includes("'notes', 'comments']") && app.includes("comments: (m.comments || []).some(c => !c.internal && c.status !== 'resolved')") && app.includes("want('comments')") && app.includes("sec('comments'"), 'report');
    assert(app.includes('.filter(c => !c.internal && c.status !== \'resolved\').map(c => [cmTargetText'), 'the report skips internal and resolved threads');
    const i18n = read('src/i18n.js');
    ['fb.title', 'fb.lead', 'fb.pw', 'fb.open', 'fb.busy', 'fb.close', 'fb.wrong', 'fb.bad', 'fb.from', 'fb.sum', 'fb.none', 'fb.go', 'fb.dup', 'fb.orphan', 'fb.stray', 'fb.capped', 'fb.mismatch', 'fb.done', 'rep.s.comments', 'rep.h.about', 'rep.h.comment', 'rep.h.replies']
      .forEach(k => eq(i18n.split(`'${k}':`).length - 1, 2, `${k} once per language`));
  });

  /* ---------- compartir cifrado: visor con comentarios y archivo de comentarios ---------- */
  const SHW = {};
  new Function('window', read('src/share.js'))(SHW);
  const SH = SHW.DiagramonShare, shareSrc = read('src/share.js');
  test('viewer: the Content Security Policy still blocks the network; comments add no connection, form or storage permission', () => {
    const html = SH.viewer({ v: 1 }, 'en');
    assert(html.includes(`content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src blob: data:; base-uri 'none'; form-action 'none'"`), 'CSP unchanged');
    assert(!/fetch\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB|eval\(|new Function|\.innerHTML/.test(shareSrc.slice(shareSrc.indexOf('const VIEWER_JS'), shareSrc.indexOf('const VIEWER_CSS'))), 'viewer script: no network, storage or innerHTML');
  });
  test('viewer: the page has the comments button, the panel, the hotspot layer and every text in both languages', () => {
    ['en', 'es'].forEach(lang => {
      const html = SH.viewer({ v: 1 }, lang);
      ['id="c-btn"', 'id="side"', 'id="hots"', 'id="c-form"', 'id="c-on"', 'id="c-name"', 'id="c-text"', 'id="c-dl"', 'id="c-list"'].forEach(x => assert(html.includes(x), `${x} (${lang})`));
    });
    const en = shareSrc.slice(shareSrc.indexOf('en: {', shareSrc.indexOf('const VIEW_TEXT')), shareSrc.indexOf('es: {', shareSrc.indexOf('const VIEW_TEXT'))), es = shareSrc.slice(shareSrc.indexOf('es: {', shareSrc.indexOf('const VIEW_TEXT')), shareSrc.indexOf('// Script del visor'));
    const keys = x => [...x.matchAll(/\b([a-zA-Z]+): '/g)].map(m => m[1]).sort();
    eq(keys(en), keys(es), 'same viewer texts in English and Spanish');
    ['comments', 'cHelp', 'cName', 'cOn', 'cText', 'cAdd', 'cDl', 'cGeneral', 'cReplyTo', 'cDel', 'cReply', 'cSend', 'cNone', 'cFile', 'cDone'].forEach(k => assert(keys(en).includes(k), `viewer text ${k}`));
  });
  const fbSeal = async (payload, pw, { v = 'fb1', kind = 'feedback', iter = 600000 } = {}) => {
    const enc = new TextEncoder(), salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const base = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    const gz = new Uint8Array(await new Response(new Blob([typeof payload === 'string' ? payload : JSON.stringify(payload)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    const env = { v, kind, kdf: 'PBKDF2-SHA256', iter, cipher: 'AES-256-GCM', salt: Buffer.from(salt).toString('base64'), iv: Buffer.from(iv).toString('base64') };
    env.data = Buffer.from(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(`diagramon/${v}/${env.kdf}/${env.iter}/${env.cipher}`) }, key, gz)).toString('base64');
    return env;
  };
  const FB = { format: 'diagramon-feedback', v: 1, shareId: 'abc', title: 'T', author: 'Ana', created: '2026-10-10T00:00:00.000Z', comments: [{ id: 'r-1', on: { kind: 'node', id: 'a' }, author: 'Ana', date: '2026-10-10', text: 'Hi' }] };
  testAsync('openFeedback: opens a file sealed the way the viewer does, with the same password (low iteration floor kept at 100000)', async () => {
    eq(await SH.openFeedback(await fbSeal(FB, 'correct horse battery'), 'correct horse battery'), FB);
  });
  testAsync('openFeedback: a wrong password, a tampered envelope and a shared-diagram envelope are all rejected', async () => {
    const env = await fbSeal(FB, 'correct horse battery'), bad = async (e, pw = 'correct horse battery') => { try { await SH.openFeedback(e, pw); return 'opened'; } catch { return 'rejected'; } };
    eq(await bad(env, 'wrong password!!'), 'rejected');
    eq(await bad({ ...env, iter: 700000 }), 'rejected', 'iterations are authenticated');
    eq(await bad({ ...env, v: 'fb2' }), 'rejected');
    eq(await bad({ ...env, kind: 'share' }), 'rejected');
    eq(await bad({ ...env, iter: 1000 }), 'rejected', 'weak iteration count refused before any work');
    eq(await bad({ ...env, data: 'A'.repeat(1600000) }), 'rejected', 'oversized envelope refused');
    eq(await bad(null), 'rejected');
    const asShare = await fbSeal(FB, 'correct horse battery', { v: 1, kind: 'feedback' });
    eq(await bad(asShare), 'rejected', 'a v1 (shared diagram) envelope cannot pass as a comments file');
  });
  testAsync('openFeedback: a decompression bomb is refused once it passes the size cap', async () => {
    const big = await fbSeal('{"x":"' + 'a'.repeat(2500000) + '"}', 'correct horse battery');
    let r = 'opened'; try { await SH.openFeedback(big, 'correct horse battery'); } catch (e) { r = String(e.message); }
    eq(r, 'size');
  });
  test('the app wires it: the share dialog offers comments, the payload is format 3 only when asked, internal and resolved threads stay out, targets come from the live shapes', () => {
    assert(app.includes("name=\"cm\" checked") && app.includes('name="cmopen"'), 'dialog');
    assert(app.includes('fmt: cm ? 3 : 2') && app.includes('cmt: true, shareId') && app.includes('targets: shareTargets('), 'payload');
    assert(app.includes('.filter(c => !c.internal && c.status !== \'resolved\')'), 'only open, non-internal threads travel');
    assert(app.includes('ox: pad - b.x, oy: pad + top - b.y'), 'buildSVG exposes the canvas offset');
    const i18n = read('src/i18n.js');
    ['share.cm', 'share.cm.hint', 'share.cmopen', 'share.cmopen.hint'].forEach(k => eq(i18n.split(`'${k}':`).length - 1, 2, `${k} once per language`));
  });

  /* ======================================================================
     Espacio de trabajo: carpeta con varios diagramas (src/workspace.js)
     ====================================================================== */
  section('Workspace');
  const WSP = win.DiagramonWorkspace;
  const wsDiagram = (title, extra = {}) => JSON.stringify({ formatVersion: 1, title, nodes: [{ id: 'a', label: 'A', type: 'service' }, { id: 'b', label: 'B', type: 'db' }], edges: [{ id: 'e1', from: 'a', to: 'b' }], groups: [], ...extra });
  test('isDiagram: diagrams yes; arrays, other JSON and wrong shapes no', () => {
    assert(WSP.isDiagram(JSON.parse(wsDiagram('x'))) && WSP.isDiagram({ nodes: [] }), 'ok');
    [null, [], 'x', 5, {}, { nodes: {} }, { nodes: [], edges: {} }, { nodes: [], groups: 'g' }, { nodes: 'x' }].forEach(v => assert(!WSP.isDiagram(v), JSON.stringify(v)));
  });
  test('cleanDocId: letters, digits and dashes (6 to 40); anything else is dropped; newDocId passes its own check', () => {
    eq(WSP.cleanDocId(' d-0123abcd '), 'd-0123abcd', 'trim');
    ['', 'abc', 'has space', 'ñandú-1234', 'x'.repeat(41), 5, null, {}, '../etc'].forEach(v => eq(WSP.cleanDocId(v), '', String(v)));
    const a = WSP.newDocId(), b = WSP.newDocId(); eq(WSP.cleanDocId(a), a, 'valid'); assert(a !== b && /^d-[0-9a-f]{16}$/.test(a), 'random and well formed');
  });
  test('scan: lists diagrams by title, reads the manifest name, skips the rest with a reason, never throws', () => {
    const r = WSP.scan([
      { name: 'b.json', text: wsDiagram('Beta', { docId: 'd-beta-0001' }) }, { name: 'a.json', text: wsDiagram('alpha') }, { name: 'notes.txt', text: 'hi' },
      { name: 'bad.json', text: '{oops' }, { name: 'other.json', text: '{"a":1}' }, { name: 'huge.json', text: '', size: WSP.MAX_BYTES + 1 },
      { name: WSP.MANIFEST, text: '{"name":"Shop platform"}' }, { name: '', text: '{}' }, null, { name: 'noText.json' }
    ]);
    eq(r.manifest, { name: 'Shop platform', shared: {} }, 'manifest'); eq(r.diagrams.map(d => d.title), ['alpha', 'Beta'], 'sorted by title');
    eq(r.diagrams[1], { name: 'b.json', title: 'Beta', nodes: 2, links: [], edges: 1, groups: 0, phases: 0, versions: 0, formatVersion: 1, docId: 'd-beta-0001', dupDocId: false }, 'summary');
    eq(r.skipped.map(x => [x.name, x.reason]), [['bad.json', 'notJson'], ['other.json', 'notDiagram'], ['huge.json', 'big'], ['noText.json', 'notJson']], 'skipped');
    eq(WSP.scan(null), { manifest: null, diagrams: [], skipped: [] }, 'nothing');
    eq(WSP.scan([{ name: WSP.MANIFEST, text: 'nope' }]).manifest, null, 'unreadable manifest ignored');
  });
  test('scan: files before formatVersion count as 0; a repeated docId is flagged on every file that shares it; the list is capped', () => {
    const r = WSP.scan([{ name: 'old.json', text: JSON.stringify({ nodes: [], title: 'Old' }) }, { name: 'x.json', text: wsDiagram('X', { docId: 'd-same-0001' }) }, { name: 'y.json', text: wsDiagram('Y', { docId: 'd-same-0001' }) }]);
    eq(r.diagrams.map(d => [d.name, d.formatVersion, d.dupDocId]), [['old.json', 0, false], ['x.json', 1, true], ['y.json', 1, true]]);
    const many = Array.from({ length: WSP.MAX_FILES + 3 }, (_, i) => ({ name: `d${i}.json`, text: wsDiagram(`D${i}`) }));
    const c = WSP.scan(many); eq(c.diagrams.length, WSP.MAX_FILES, 'capped'); eq(c.skipped.filter(x => x.reason === 'many').length, 3, 'rest reported');
  });
  test('fileNameFor: slug without accents or symbols, unique without regard to case, never the manifest name', () => {
    eq(WSP.fileNameFor('Plataforma de Datos · Año 2', []), 'plataforma-de-datos-ano-2.json');
    eq(WSP.fileNameFor('Shop', ['shop.json', 'SHOP-2.json']), 'shop-3.json', 'collisions ignore case');
    eq(WSP.fileNameFor('', []), 'diagram.json'); eq(WSP.fileNameFor(null, []), 'diagram.json');
    eq(WSP.fileNameFor('Diagramon Workspace', []), 'diagramon-workspace-2.json', 'a title that would collide with the manifest file gets a suffix'); assert(WSP.fileNameFor('x'.repeat(200), []).length <= 70, 'bounded');
  });
  test('the app wires it: docId in normalize, JSON and the text round trip; the dialog, the button and the texts in both languages', () => {
    assert(app.includes("window.DiagramonWorkspace?.cleanDocId(raw.docId)") && app.includes('if (m.docId) head.push('), 'docId is read and written');
    assert(app.includes('raw.docId == null && S.model.docId'), 'text edits keep the docId');
    assert(app.includes('function ensureDocId()') && app.includes('function exportJSON() { ensureDocId();'), 'docId assigned when saving');
    assert(app.includes("$('#btn-workspace')") && app.includes('showDirectoryPicker') && app.includes("$('#ws-dir')"), 'entry points');
    const html = read('index.html');
    assert(html.includes('src="src/workspace.js"') && html.indexOf('src/workspace.js') < html.indexOf('src/app.js') && html.includes('id="btn-workspace"') && html.includes('id="ws-dir" webkitdirectory'), 'index.html');
    const keys = [...new Set([...app.slice(app.indexOf('/* ---------- espacio de trabajo'), app.indexOf('/* ---------- exportar a otras herramientas (src/export')).matchAll(/T\('(ws\.[\w.]+)'/g)].map(x => x[1]))];
    ['top.workspace', 'top.workspace.lbl', ...keys].forEach(k => eq(i18nSrc.split(`'${k}':`).length - 1, 2, `${k} once per language`));
    assert(keys.length >= 15, `keys found: ${keys.length}`);
  });

  test('cleanRef: a valid docId (and an optional node id) survives; anything else is dropped', () => {
    eq(WSP.cleanRef({ doc: 'd-aaaaaa1' }), { doc: 'd-aaaaaa1' }); eq(WSP.cleanRef({ doc: ' d-aaaaaa1 ', node: ' n1 ' }), { doc: 'd-aaaaaa1', node: 'n1' });
    eq(WSP.cleanRef({ doc: 'd-aaaaaa1', node: 5, extra: 1 }), { doc: 'd-aaaaaa1' }, 'unknown keys and a non-string node go');
    [null, 'd-aaaaaa1', [], {}, { doc: 'x' }, { doc: '../x' }, { node: 'n1' }].forEach(v => eq(WSP.cleanRef(v), null, JSON.stringify(v)));
  });
  const wsLinked = (title, docId, nodes) => ({ name: `${title}.json`, text: JSON.stringify({ title, docId, nodes }) });
  const wsN = (id, label, doc) => ({ id, label, ...(doc ? { ref: { doc } } : {}) });
  test('summarize: lists the components that point to another diagram, ignoring bad refs', () => {
    const r = WSP.scan([wsLinked('A', 'd-aaaaaa1', [wsN('n1', 'Pay', 'd-bbbbbb1'), wsN('n2', 'None'), { id: 'n3', label: 'Bad', ref: { doc: 'x' } }, null])]);
    eq(r.diagrams[0].links, [{ id: 'n1', label: 'Pay', doc: 'd-bbbbbb1' }]);
  });
  test('systemsMap: one arrow per pair with the component names, missing targets apart, self links and repeated ids left out', () => {
    const r = WSP.scan([wsLinked('A', 'd-aaaaaa1', [wsN('n1', 'Pay', 'd-bbbbbb1'), wsN('n2', 'Refund', 'd-bbbbbb1'), wsN('n3', 'Ghost', 'd-zzzzzz1'), wsN('n4', 'Self', 'd-aaaaaa1')]),
      wsLinked('B', 'd-bbbbbb1', [wsN('x', 'Back', 'd-aaaaaa1')]), wsLinked('C', '', []), wsLinked('D1', 'd-dupdup1', []), wsLinked('D2', 'd-dupdup1', [])]);
    const m = WSP.systemsMap(r.diagrams);
    eq(m.nodes.map(n => n.docId), ['d-aaaaaa1', 'd-bbbbbb1'], 'only diagrams with a unique id'); eq(m.unlinkable, 3, 'C has no id, D1 and D2 share one');
    eq(m.edges, [{ from: 'd-aaaaaa1', to: 'd-bbbbbb1', via: ['Pay', 'Refund'] }, { from: 'd-bbbbbb1', to: 'd-aaaaaa1', via: ['Back'] }], 'edges');
    eq(m.missing, [{ from: 'd-aaaaaa1', doc: 'd-zzzzzz1', via: ['Ghost'] }], 'missing');
    eq(WSP.systemsMap(null), { nodes: [], edges: [], missing: [], unlinkable: 0 }, 'empty');
  });
  test('systemsMap: the open diagram wins over its (older) file and appears even when it is not saved yet', () => {
    const r = WSP.scan([wsLinked('A', 'd-aaaaaa1', [wsN('n1', 'Pay', 'd-bbbbbb1')]), wsLinked('B', 'd-bbbbbb1', [])]);
    const live = { docId: 'd-aaaaaa1', title: 'A edited', nodes: 7, links: [{ id: 'n9', label: 'Ledger', doc: 'd-bbbbbb1' }] };
    const m = WSP.systemsMap(r.diagrams, live);
    eq(m.nodes[0], { docId: 'd-aaaaaa1', name: 'A.json', title: 'A edited', nodes: 7, unsaved: false }, 'live title and size, same file'); eq(m.edges[0].via, ['Ledger'], 'live links replace the file ones');
    const fresh = WSP.systemsMap(r.diagrams, { docId: 'd-newnew1', title: 'New', nodes: 2, links: [{ id: 'a', label: 'To A', doc: 'd-aaaaaa1' }] });
    eq(fresh.nodes.map(n => [n.docId, n.unsaved]), [['d-aaaaaa1', false], ['d-bbbbbb1', false], ['d-newnew1', true]], 'unsaved diagram added'); eq(fresh.edges.map(e => [e.from, e.to]), [['d-aaaaaa1', 'd-bbbbbb1'], ['d-newnew1', 'd-aaaaaa1']]);
  });
  test('layoutMap: columns by depth, cycles do not inflate it, boxes never overlap, arrows end on box edges', () => {
    const mk = (ids, es) => ({ nodes: ids.map(i => ({ docId: i, title: i })), edges: es.map(([from, to]) => ({ from, to, via: [] })) });
    const g = WSP.layoutMap(mk(['a', 'b', 'c'], [['a', 'b'], ['b', 'c']])), at = id => g.boxes.find(b => b.docId === id);
    eq(g.boxes.map(b => b.x), [16, 296, 576], 'a chain goes left to right'); assert(g.arrows.every(a => !a.same), 'forward arrows');
    const a0 = g.arrows[0]; eq([a0.x1, a0.x2], [at('a').x + 200, at('b').x], 'leave the right edge, enter the left edge');
    const cyc = WSP.layoutMap(mk(['a', 'b'], [['a', 'b'], ['b', 'a']]));
    assert(cyc.boxes.length === 2 && Number.isFinite(cyc.width) && cyc.boxes.every(b => b.x >= 0), 'cycle lays out');
    for (let i = 0; i < cyc.boxes.length; i++) for (let j = i + 1; j < cyc.boxes.length; j++) { const p = cyc.boxes[i], q = cyc.boxes[j]; assert(p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y, 'overlap'); }
    const big = WSP.layoutMap(mk(Array.from({ length: 60 }, (_, i) => `n${i}`), Array.from({ length: 59 }, (_, i) => [`n${i}`, `n${i + 1}`]).concat([['n59', 'n0']])));
    eq(big.boxes.length, 60, 'a long ring still ends'); eq(WSP.layoutMap(null), { boxes: [], arrows: [], width: 16, height: 16 }, 'empty');
  });
  test('the app wires it: ref in normalize and JSON, kept through text edits, inspector field, Review source, map and texts in both languages', () => {
    assert(app.includes('window.DiagramonWorkspace?.cleanRef(o.ref)') && app.includes("'effort', 'ref', 'phase'"), 'ref is cleaned and ordered');
    assert(app.includes("opts.fromEditor === 'text' && Array.isArray(raw.nodes) && S.model.nodes.some(n => n.ref)"), 'text edits keep the links');
    assert(app.includes('const refField = items =>') && app.includes('${refField(t)}') && app.includes("select[data-ref]") && app.includes('data-ref-open'), 'inspector');
    assert(app.includes("addFindingSource('workspace'") && app.includes('function wsMapHtml()') && app.includes('data-ws-doc'), 'Review source and map');
    const keys = [...new Set([...app.matchAll(/T\(`?'?(ws\.[\w.]+)/g)].map(x => x[1]))].filter(k => !k.endsWith('.'));
    ['find.src.workspace', 'ws.sh.k.stakeholders', 'ws.sh.k.decisions', 'ws.sh.k.datasets', ...keys].forEach(k => eq(i18nSrc.split(`'${k}':`).length - 1, 2, `${k} once per language`));
    assert(keys.length >= 30, `keys found: ${keys.length}`);
  });

  test('cleanShared: keeps only objects with a name or title, drops repeats, ids and what points into the source diagram', () => {
    const r = WSP.cleanShared({ stakeholders: [{ id: 'SH-001', name: 'Ana', role: 'CTO' }, { name: ' ana ' }, { name: '' }, 5, null],
      decisions: [{ id: 'ADR-001', title: 'Use X', status: 'accepted', links: { nodes: ['a'] }, signoffs: [{ by: 'SH-001' }], supersededBy: 'ADR-002', history: [{}], options: [{ id: 'o1', title: 'A', version: 'v1' }] }],
      datasets: [{ id: 'DS-001', name: 'Sales', phase: 'p1', owner: 'Ops' }], junk: [1] });
    eq(r, { stakeholders: [{ name: 'Ana', role: 'CTO' }], decisions: [{ title: 'Use X', status: 'accepted', options: [{ id: 'o1', title: 'A' }] }], datasets: [{ name: 'Sales', owner: 'Ops' }] });
    eq(WSP.cleanShared(null), {}); eq(WSP.cleanShared({ datasets: 'x', stakeholders: [{ name: 'x'.repeat(30000) }] }), {}, 'oversized items and wrong shapes are dropped');
    eq(WSP.cleanShared({ decisions: [{ title: 'Ñandú' }, { title: 'nandu' }] }).decisions.length, 1, 'accents and case do not make a new item');
  });
  test('mergeShared: only what the diagram lacks, matched by name or title ignoring case and accents; the diagram numbers them', () => {
    const cur = [{ id: 'SH-001', name: 'ANA' }, { id: 'SH-002', name: 'Bo' }];
    const r = WSP.mergeShared('stakeholders', cur, { stakeholders: [{ name: 'Ana' }, { name: 'Cy', role: 'PO' }, { name: 'cy' }] });
    eq(r.fresh, [{ name: 'Cy', role: 'PO' }], 'one new'); eq(r.list.map(x => x.name), ['ANA', 'Bo', 'Cy']); eq(r.skipped, 2, 'present or repeated'); eq(cur.length, 2, 'input untouched');
    eq(WSP.mergeShared('datasets', undefined, undefined), { list: [], fresh: [], skipped: 0 }, 'nothing at all');
    eq(WSP.mergeShared('decisions', [{ title: 'Usar Á' }], { decisions: [{ title: 'usar a' }] }).fresh, [], 'accents ignored');
  });
  test('shareOut: same name replaces, new ones are added, ids and links never travel, the cap holds', () => {
    const r = WSP.shareOut('datasets', { datasets: [{ name: 'Sales', owner: 'A' }] }, [{ id: 'DS-9', name: 'sales', owner: 'B', phase: 'p' }, { name: 'New' }, { name: '' }, { name: 'New' }]);
    eq(r, { list: [{ name: 'sales', owner: 'B' }, { name: 'New' }], added: 1, updated: 1 });
    eq(WSP.shareOut('datasets', { datasets: [{ name: 'Sales', owner: 'A' }] }, [{ name: 'Sales', owner: 'A', id: 'DS-1' }]).updated, 0, 'identical content is not an update');
    const big = Array.from({ length: 300 }, (_, i) => ({ name: `s${i}` }));
    eq(WSP.shareOut('stakeholders', {}, big).list.length, 200, 'stakeholders capped at 200');
  });
  test('the app wires it: shared lists go through the diagram cleaners, decisions get their first history entry, texts in both languages', () => {
    assert(app.includes('const WS_LISTS = {') && app.includes('function wsShareAdd()') && app.includes('async function wsShareOut()'), 'functions');
    assert(app.includes("clean: raw => cleanStakeholders(raw, S.model)") && app.includes("clean: raw => cleanDecisions(raw, S.model)") && app.includes("clean: raw => cleanCatalog(raw, S.model, dsHelpers())"), 'cleaners');
    assert(app.includes('nd.history = [{ status: nd.status, date: nd.date'), 'history of an imported decision');
  });

  /* ---------- resumen ---------- */
  const summary = () => { print(`\n${pass} passed, ${fail} failed`); return finish(fail === 0); };
  if (!later.length) return summary();
  section('Web Crypto (Node only)');
  (async () => {
    for (const [name, fn] of later) {
      try { await fn(); pass++; print(`  ok   ${name}`); } catch (e) { fail++; print(`  FAIL ${name}\n       ${String(e && e.message || e).split('\n').join('\n       ')}`); }
    }
    summary();
  })();
})();
