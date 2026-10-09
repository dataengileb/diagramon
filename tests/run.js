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
    'src/text-lang.js', 'src/adr-kits.js', 'src/examples.js', 'src/iac.js', 'src/export/mermaid.js', 'src/export/plantuml.js', 'src/export/drawio.js', 'src/export/xlsx.js'].forEach(load);
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
  const PHM = new Function(`${between('/* phaseModel:start */', '/* phaseModel:end */')}; return { cleanPhases, cleanPhaseRefs, phaseIndex, inPhase, phaseState, phaseStates, phaseModel, phaseDiff, phaseStats, phaseRows };`)();
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
    eq(PHM.phaseStats(m, 1, h), { nodes: 3, edges: 2, cost: 300, findings: { high: 2, medium: 1, low: 2 } }, 'wave1'); eq(seen, [3], 'helpers get the phase model');
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
    assert(/REP_SECS = \[[^\]]*'approvals', 'phases', 'versions'/.test(app), 'section after approvals'); assert(/phases: !!m\.phases\?\.length/.test(app), 'available with phases'); assert(app.includes("want('phases')") && app.includes('presentPhases'), 'section and API');
    const i18n = read('src/i18n.js'); ['rep.s.phases', 'rep.k.phases', 'rep.h.phase', 'phase.present.tip', 'phase.present.step', 'phase.cmp.title', 'phase.cmp.cost'].forEach(k => assert((i18n.match(new RegExp(`'${k.replace(/\./g, '\\.')}'`, 'g')) || []).length === 2, `${k} in en and es`));
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
  test('the phase model stays out of the old paths: markers, ORDER, API-facing helpers exist', () => {
    ['ORDER.phase = [\'id\', \'name\', \'date\', \'goal\']'].forEach(x => assert(app.includes(x), x));
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

  /* ---------- resumen ---------- */
  print(`\n${pass} passed, ${fail} failed`);
  return finish(fail === 0);
})();
