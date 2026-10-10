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
    'src/text-lang.js', 'src/adr-kits.js', 'src/examples.js', 'src/iac.js', 'src/dbt.js', 'src/export/mermaid.js', 'src/export/plantuml.js', 'src/export/datacontract.js', 'src/export/drawio.js', 'src/export/xlsx.js'].forEach(load);
  const C = win.DIAGRAMON_CONFIG, TXT = win.DiagramonText, IAC = win.DiagramonIaC, EXP = win.DiagramonExport, XLSX = win.DiagramonXlsx, DC = win.DiagramonContract;

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
    assert(/REP_SECS = \[[^\]]*'approvals', 'phases', 'migration', 'radar', 'versions'/.test(app), 'section after approvals; the migration and radar sections follow the phases'); assert(/phases: !!m\.phases\?\.length/.test(app), 'available with phases'); assert(app.includes("want('phases')") && app.includes('presentPhases'), 'section and API');
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
    assert(/'replicas', 'disposition', 'radar', 'phase', 'until'\],\n    edge: \['id'/.test(app), 'ORDER.node');
    assert(/'replicas', 'disposition', 'radar', 'phase', 'until'\],\n    edge: \['label'/.test(app), 'DIFF_FIELDS.node');
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

  /* ---------- resumen ---------- */
  print(`\n${pass} passed, ${fail} failed`);
  return finish(fail === 0);
})();
