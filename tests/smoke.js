/* ==========================================================================
   Diagramon · prueba de humo en un navegador real (sin dependencias)
   --------------------------------------------------------------------------
   Abre index.html desde file:// (igual que un doble clic) en Chrome sin
   ventana y lo maneja con el protocolo de DevTools, con el WebSocket que ya
   trae Node 22. Comprueba lo que tests/run.js no puede ver:
     - la app arranca sin errores ni avisos de la CSP;
     - window.Diagramon expone exactamente la misma API pública;
     - cada plantilla se abre y se dibuja, en cada vista, tema e idioma;
     - las exportaciones (SVG, PNG, JSON, Mermaid, PlantUML, draw.io, Excel)
       generan su archivo, y el JSON vuelve a abrirse igual;
     - el HTML cifrado se crea y se abre con su contraseña desde file://.

   Ejecutar desde la raíz del repositorio:
     node tests/smoke.js
   Usa el Chrome de CHROME_BIN o el primero que encuentre. Sin navegador se
   salta con un aviso, salvo en CI (variable CI), donde falla.
   ========================================================================== */
'use strict';

const fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const PASSWORD = 'smoke-test-password-123';

// API pública de window.Diagramon. Si cambia a propósito, actualiza esta lista en el mismo PR.
const API = ['addDataset', 'addDecision', 'addDecisionKit', 'addEdge', 'addNode', 'addPhase', 'addRaid', 'addRequirement', 'addStakeholder', 'adrScore', 'align',
  'approval', 'availability', 'catalog', 'checkRequirement', 'clearFilter', 'clearPath', 'compareCosts', 'compareDecisions', 'compareVersion', 'compliance', 'config', 'contractYaml',
  'contractsYaml', 'costBreakdown', 'crossBorder', 'dataset', 'datasets', 'decisionKits', 'decisions', 'deleteVersion', 'dismissFinding', 'exitPresent', 'exportCompliance',
  'exportCtx', 'exportDecisions', 'exportInventory', 'exportJSON', 'exportLevels', 'exportOther', 'exportPNG', 'exportReport', 'exportSVG', 'exportThreats', 'exportViews',
  'filter', 'findings', 'fitView', 'freshness', 'icons', 'importDbt', 'importFiles', 'inventory', 'lang', 'layers', 'lineage', 'load', 'model', 'openCosts', 'openVersion',
  'owners', 'phase', 'phaseModel', 'phaseRows', 'phaseStats', 'phases', 'present', 'presentPhases', 'presentViews', 'raid', 'relayout', 'removeDataset', 'removeDecision',
  'removePhase', 'removeRaid', 'removeRequirement', 'removeStakeholder', 'renameDataset', 'requirements', 'restoreFinding', 'saveVersion', 'scope', 'scopes', 'select',
  'setFilter', 'setLayerNames', 'setPhase', 'setScope', 'setView', 'shareEncrypted', 'showPath', 'signoff', 'spofs', 'stakeholders', 'statusOutput', 'statusReport',
  'storage', 'threats', 'toggleLang', 'togglePlay', 'toggleRouting', 'toggleTheme', 'updateDataset', 'updateDecision', 'updatePhase', 'updateRaid', 'updateRequirement',
  'updateStakeholder', 'validateAssumption', 'view', 'views'];

// Lo que cada script de index.html deja en window
const GLOBALS = ['DIAGRAMON_CONFIG', 'DiagramonI18n', 'DiagramonText', 'DIAGRAMON_EXAMPLES', 'DiagramonIaC', 'DiagramonShare', 'DiagramonWorkspace', 'DiagramonDrift', 'DiagramonModels',
  'DiagramonExport', 'DiagramonXlsx', 'DiagramonContract', 'DIAGRAMON_FONTS', 'Diagramon'];

/* ---------- mini marco de pruebas (como tests/run.js) ---------- */
let pass = 0, fail = 0;
const ok = name => { pass++; console.log(`  ok   ${name}`); };
const bad = (name, e) => { fail++; console.log(`  FAIL ${name}\n       ${String(e && e.message || e).split('\n').join('\n       ')}`); };
async function test(name, fn) { try { await fn(); ok(name); } catch (e) { bad(name, e); } }
const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assertion failed'); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- buscar y arrancar Chrome ---------- */
function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const pw = '/opt/pw-browsers';
  const fromPw = fs.existsSync(pw) ? fs.readdirSync(pw).filter(d => /^chromium-\d+$/.test(d)).map(d => path.join(pw, d, 'chrome-linux', 'chrome')) : [];
  const list = [...fromPw, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'];
  return list.find(p => fs.existsSync(p)) || null;
}

function launch(bin) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'diagramon-smoke-'));
  // Sin --allow-file-access-from-files ni nada parecido: el navegador debe comportarse como en un doble clic
  const args = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', '--window-size=1400,900', ...(process.getuid && process.getuid() === 0 ? ['--no-sandbox'] : []), 'about:blank'];
  const proc = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  const ws = new Promise((resolve, reject) => {
    let buf = '';
    const t = setTimeout(() => reject(new Error(`Chrome did not start\n${buf.slice(-2000)}`)), 30000);
    proc.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(t); resolve(m[1]); } });
    proc.on('exit', code => { clearTimeout(t); reject(new Error(`Chrome exited (${code})\n${buf.slice(-2000)}`)); });
  });
  return { proc, profile, ws };
}

/* ---------- cliente mínimo del protocolo de DevTools ---------- */
function connect(url) {
  const sock = new WebSocket(url);
  let id = 0;
  const wait = new Map(), listeners = [];
  sock.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && wait.has(msg.id)) { const { resolve, reject } = wait.get(msg.id); wait.delete(msg.id); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result); }
    else listeners.forEach(fn => fn(msg));
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const n = ++id; wait.set(n, { resolve, reject }); sock.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const opened = new Promise((resolve, reject) => { sock.onopen = resolve; sock.onerror = () => reject(new Error('cannot connect to Chrome')); });
  return { opened, send, on: fn => listeners.push(fn), close: () => sock.close() };
}

// Una pestaña: navega, evalúa y junta sus errores (excepciones, console.error, CSP)
async function openTab(cdp, url) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const errors = [];
  let loaded = null;
  cdp.on(msg => {
    if (msg.sessionId !== sessionId) return;
    const p = msg.params || {};
    if (msg.method === 'Runtime.exceptionThrown') errors.push(`exception: ${p.exceptionDetails?.exception?.description || p.exceptionDetails?.text}`);
    else if (msg.method === 'Runtime.consoleAPICalled' && p.type === 'error') errors.push(`console.error: ${p.args.map(a => a.value ?? a.description).join(' ')}`);
    else if (msg.method === 'Log.entryAdded' && p.entry.level === 'error') errors.push(`${p.entry.source}: ${p.entry.text}`);
    else if (msg.method === 'Page.javascriptDialogOpening') cdp.send('Page.handleJavaScriptDialog', { accept: true }, sessionId).catch(() => {});
    else if (msg.method === 'Page.loadEventFired' && loaded) loaded();
  });
  const s = (m, p) => cdp.send(m, p, sessionId);
  await Promise.all([s('Runtime.enable'), s('Log.enable'), s('Page.enable')]);
  await new Promise(resolve => { loaded = resolve; s('Page.navigate', { url }); });
  const evaluate = async expr => {
    const r = await s('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  // Ejecuta una función en la página con argumentos por valor (sin construir código a partir de datos)
  const call = async (fn, ...args) => {
    const g = await s('Runtime.evaluate', { expression: 'globalThis' });
    const r = await s('Runtime.callFunctionOn', { functionDeclaration: fn.toString(), objectId: g.result.objectId, arguments: args.map(value => ({ value })), awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  // Espera a que la condición (texto o función con sus argumentos) se cumpla
  const until = async (cond, what, ms = 15000, ...args) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await (typeof cond === 'function' ? call(cond, ...args) : evaluate(cond))) return; await sleep(100); }
    throw new Error(`timed out waiting for ${what}`);
  };
  const clean = () => { const e = errors.splice(0); assert(!e.length, e.join('\n')); };
  return { evaluate, call, until, errors, clean, close: () => cdp.send('Target.closeTarget', { targetId }) };
}

/* ---------- las pruebas ---------- */
async function run(cdp) {
  console.log('\n# Browser smoke test (file://)');
  const app = await openTab(cdp, pathToFileURL(path.join(ROOT, 'index.html')).href);

  await test('the app starts from file:// without errors or CSP reports', async () => {
    await app.until('!!window.Diagramon && document.readyState === "complete"', 'window.Diagramon');
    await sleep(500);
    app.clean();
  });

  await test('every script defines its global', async () => {
    const missing = await app.call(list => list.filter(k => !window[k]), GLOBALS);
    assert(!missing.length, `missing: ${missing.join(', ')}`);
  });

  await test('window.Diagramon keeps the same public API', async () => {
    const got = await app.evaluate('Object.getOwnPropertyNames(window.Diagramon).sort()');
    const add = got.filter(k => !API.includes(k)), gone = API.filter(k => !got.includes(k));
    assert(!add.length && !gone.length, `added: ${add.join(', ') || '—'}\nremoved: ${gone.join(', ') || '—'}`);
  });

  // Las descargas se capturan en la página en vez de guardarse en disco
  await app.evaluate(`(() => {
    // La CSP (connect-src 'none') impide leer un blob: con fetch, así que se guarda al crear su URL
    window.__dl = [];
    const blobs = new Map(), mk = URL.createObjectURL;
    URL.createObjectURL = b => { const u = mk.call(URL, b); blobs.set(u, b); return u; };
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      const b = this.download && blobs.get(this.href);
      if (b) { const name = this.download; window.__dl.push((async () => ({ name, size: b.size, text: /png|zip|sheet/.test(b.type + name) ? '' : await b.text() }))()); return; }
      return orig.call(this);
    };
    window.__take = async () => { const all = await Promise.all(window.__dl); window.__dl = []; return all; };
  })()`);

  const count = await app.evaluate('window.DIAGRAMON_EXAMPLES.length');
  await test(`there are templates (${count})`, () => assert(count > 0, 'no templates'));
  for (let i = 0; i < count; i++) {
    const name = await app.call(k => { const n = window.DIAGRAMON_EXAMPLES[k].name; return typeof n === 'string' ? n : n.en; }, i);
    await test(`template "${name}" opens, draws and goes through every view, theme and language`, async () => {
      await app.call(k => document.querySelectorAll('#examples .ex')[k].click(), i);
      const want = await app.call(k => window.DIAGRAMON_EXAMPLES[k].diagram.nodes.length, i);
      await app.until(n => window.Diagramon.model.nodes.length === n, 'the template model', 15000, want);
      await sleep(300);
      const drawn = await app.evaluate('document.querySelectorAll("#canvas *").length');
      assert(drawn > want, `canvas has ${drawn} elements for ${want} nodes`);
      for (const v of await app.evaluate('window.Diagramon.views')) { await app.call(view => window.Diagramon.setView(view), v); await sleep(50); }
      // Contexto: cada grupo de primer nivel con algo dentro se dibuja como una tarjeta cerrada
      const tops = await app.evaluate('window.Diagramon.model.nodes.some(n => n.c4) ? 0 : window.Diagramon.model.groups.filter(g => !g.parent && window.Diagramon.model.nodes.some(n => n.group === g.id)).length');
      if (tops) {
        await app.evaluate('window.Diagramon.setView("context")'); await sleep(150);
        const cards = await app.evaluate('document.querySelectorAll("#canvas .ctx-box").length');
        assert(cards > 0, `Context view draws ${cards} cards for ${tops} top-level groups`);
      }
      await app.evaluate('window.Diagramon.setView("full")');
      for (let k = 0; k < 2; k++) { await app.evaluate('window.Diagramon.toggleTheme()'); await app.evaluate('window.Diagramon.toggleLang()'); await sleep(100); }
      app.clean();
    });
  }

  // Diagrama grande (300 componentes): la geometría de las conexiones se calcula en JS (pathGeom) y debe coincidir con la que mide el navegador
  await test('a large diagram opens, and arrowheads, labels and handles sit on their lines (curved and elbow)', async () => {
    for (const routing of ['curved', 'elbow']) {
      const r = await app.call(routing => {
        const N = 300, nodes = [], edges = [], seen = new Set();
        const groups = Array.from({ length: 30 }, (_, i) => ({ id: 'g' + i, label: 'Group ' + i, ...(i >= 6 ? { parent: 'g' + (i % 6) } : {}) }));
        for (let i = 0; i < N; i++) nodes.push({ id: 'n' + i, label: 'Service ' + i, type: ['compute', 'db', 'queue', 'storage'][i % 4], group: 'g' + (i % 30), cost: i % 50, data: ['pii'], x: (i % 20) * 240, y: Math.floor(i / 20) * 160 });
        let s = 7; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
        for (let i = 0; i < N * 1.6; i++) {
          const a = Math.floor(rnd() * N), b = Math.min(N - 1, a + 1 + Math.floor(rnd() * 12));
          if (a === b || seen.has(a + '>' + b)) continue;
          seen.add(a + '>' + b);
          edges.push({ from: 'n' + a, to: 'n' + b, ...(i % 4 ? { label: 'HTTPS' } : {}), ...(i % 9 ? {} : { both: true }), encrypted: i % 2 === 0 });
        }
        edges.push({ from: 'n0', to: 'n0' }, { from: 'n3', to: 'n40', bend: { x: 30, y: -60 } });
        const t0 = performance.now();
        window.Diagramon.load({ title: 'Big', routing, groups, nodes, edges });
        const ms = performance.now() - t0;
        let worst = 0, n = 0;
        document.querySelectorAll('#l-edges .edge').forEach(g => {
          const line = g.querySelector('.edge-line'), lab = g.querySelector('.edge-label'), bh = g.querySelector('.edge-handle');
          if (!line.getAttribute('d')) return;
          n++;
          const len = line.getTotalLength(), mid = line.getPointAtLength(len / 2), end = line.getPointAtLength(len);
          worst = Math.max(worst, Math.hypot(mid.x - bh.getAttribute('cx'), mid.y - bh.getAttribute('cy')));
          if (lab) { const m = /translate\(([-\d.e]+) ([-\d.e]+)\)/.exec(lab.getAttribute('transform')); worst = Math.max(worst, Math.hypot(mid.x - m[1], mid.y - m[2])); }
          const tip = g.querySelector('.edge-arrow').getAttribute('d').match(/-?[\d.]+(?:e-?\d+)?/g).map(Number);
          worst = Math.max(worst, Math.hypot(end.x - tip[0], end.y - tip[1]));
        });
        return { n, worst, ms, drawn: document.querySelectorAll('#l-nodes .node').length };
      }, routing);
      assert(r.drawn === 300 && r.n > 400, `${routing}: drew ${r.drawn} components and ${r.n} connections`);
      assert(r.worst < 1, `${routing}: geometry is off by ${r.worst.toFixed(2)} px`);
      assert(r.ms < 8000, `${routing}: took ${Math.round(r.ms)} ms to load`);
    }
  });

  // Al arrastrar solo se recolocan el nodo movido y sus conexiones: el resultado debe ser el mismo que al dibujar todo de nuevo
  await test('dragging a component leaves the same drawing as a full redraw (curved and elbow)', async () => {
    for (const routing of ['curved', 'elbow']) {
      const r = await app.call(routing => {
        const d = JSON.parse(JSON.stringify(window.DIAGRAMON_EXAMPLES[0].diagram));
        d.routing = routing;
        window.Diagramon.load(d);
        const snap = () => [...document.querySelectorAll('#l-edges .edge')].map(g => `${g.dataset.id} ${g.querySelector('.edge-line').getAttribute('d')} ${g.querySelector('.edge-arrow').getAttribute('d')} ${g.querySelector('.edge-label')?.getAttribute('transform')}`).join('\n')
          + [...document.querySelectorAll('#l-groups rect')].map(x => ['x', 'y', 'width', 'height'].map(k => x.getAttribute(k)).join(',')).join(';')
          + [...document.querySelectorAll('#l-nodes .node')].map(x => x.getAttribute('transform')).join(';');
        const id = window.Diagramon.model.nodes[6].id, before = window.Diagramon.model.nodes[6].x;
        const card = document.querySelector(`#l-nodes .node[data-id="${id}"] .node-card`), bb = card.getBoundingClientRect(), x = bb.x + bb.width / 2, y = bb.y + bb.height / 2, c = document.querySelector('#canvas');
        const ev = (t, type, dx = 0, dy = 0) => t.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x + dx, clientY: y + dy, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerId: 1, isPrimary: true, pointerType: 'mouse' }));
        ev(card, 'pointerdown');
        for (let i = 1; i <= 12; i++) ev(c, 'pointermove', i * 9, -i * 7);
        ev(c, 'pointerup', 108, -84);
        const dragged = snap(), moved = window.Diagramon.model.nodes[6].x - before;
        window.Diagramon.load(window.Diagramon.model, { animate: false, fit: false });
        return { moved, same: dragged === snap() };
      }, routing);
      assert(r.moved !== 0, `${routing}: the component did not move`);
      assert(r.same, `${routing}: the drawing after dragging differs from a full redraw`);
    }
  });

  // Los editores de Texto y JSON solo se escriben con su pestaña abierta: al abrirla deben traer el diagrama actual
  await test('the Text and JSON editors fill in when their tab opens', async () => {
    await app.evaluate(`document.querySelector('.tab[data-tab="components"]').click()`);
    await app.evaluate(`document.querySelector('#examples .ex[data-ex="0"]').click()`);
    await sleep(300);
    const title = await app.evaluate('window.Diagramon.model.title');
    await app.evaluate(`document.querySelector('.tab[data-tab="code"]').click()`);
    assert(await app.call(t => JSON.parse(document.querySelector('#json').value).title === t, title), 'JSON editor is stale');
    assert(await app.evaluate(`document.querySelector('#json').previousElementSibling.children.length > 10`), 'JSON gutter is empty');
    await app.evaluate(`document.querySelector('.tab[data-tab="text"]').click()`);
    assert(await app.call(t => document.querySelector('#text-src').value.includes(t), title), 'Text editor is stale');
    // con la pestaña abierta se sigue actualizando al momento
    await app.evaluate(`window.Diagramon.addNode('compute', 0, 0, { label: 'Smoke probe node' })`);
    await sleep(400);
    assert(await app.evaluate(`document.querySelector('#text-src').value.includes('Smoke probe node')`), 'open Text editor did not follow a change');
    await app.evaluate(`document.querySelector('.tab[data-tab="components"]').click()`);
  });

  await test('exports produce their files (SVG, PNG, JSON, Mermaid, PlantUML, draw.io, Excel)', async () => {
    await app.evaluate(`document.querySelector('#examples .ex[data-ex="0"]').click()`);
    await sleep(500);
    const fmts = await app.evaluate('Object.keys(window.DiagramonExport)');
    await app.call(list => { const D = window.Diagramon; D.exportSVG(); D.exportJSON(); D.exportInventory('xlsx'); list.forEach(f => D.exportOther(f)); D.exportPNG(); }, fmts);
    await app.until(n => window.__dl.length >= n, 'the downloads', 15000, 4 + fmts.length);
    const files = await app.evaluate('window.__take()');
    const by = ext => files.find(f => f.name.endsWith(ext));
    assert(by('.svg') && /^<svg|^<\?xml/.test(by('.svg').text.trim()), 'SVG');
    assert(by('.png') && by('.png').size > 1000, 'PNG');
    assert(by('.xlsx') && by('.xlsx').size > 1000, 'Excel');
    const json = JSON.parse(by('.json').text);
    assert(json.formatVersion >= 1 && json.nodes.length > 0, 'JSON');
    assert(files.length === 4 + fmts.length && files.every(f => f.size > 0), `files: ${files.map(f => `${f.name} (${f.size})`).join(', ')}`);
    // El JSON exportado vuelve a abrirse igual
    const before = await app.evaluate('JSON.stringify(window.Diagramon.model.nodes.map(n => n.id))');
    await app.call(text => { window.Diagramon.load(JSON.parse(text)); }, by('.json').text);
    await sleep(300);
    assert(await app.evaluate('JSON.stringify(window.Diagramon.model.nodes.map(n => n.id))') === before, 'JSON round trip');
    app.clean();
  });

  let shared = null;
  await test('encrypted HTML is created', async () => {
    await app.evaluate('window.Diagramon.shareEncrypted()');
    await app.until('!!document.querySelector("form.share")', 'the share dialog');
    await app.call(pw => { const f = document.querySelector('form.share'); f.elements.pw.value = f.elements.pw2.value = pw; f.requestSubmit(); }, PASSWORD);
    await app.until('window.__dl.length > 0', 'the encrypted file', 60000);
    const [file] = await app.evaluate('window.__take()');
    assert(file.name.endsWith('.html') && file.text.includes('id="envelope"'), file.name);
    assert(!file.text.includes(await app.evaluate('window.Diagramon.model.title')), 'the title must not be readable in the file');
    shared = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'diagramon-share-')), 'shared.html');
    fs.writeFileSync(shared, file.text);
    app.clean();
  });

  if (shared) await test('encrypted HTML opens from file:// with its password', async () => {
    const title = await app.evaluate('window.Diagramon.model.title');
    const viewer = await openTab(cdp, pathToFileURL(shared).href);
    await viewer.evaluate(`(() => { document.querySelector('#pw').value = 'wrong-password-000'; document.querySelector('#unlock').requestSubmit(); })()`);
    await viewer.until('document.querySelector("#msg").classList.contains("bad")', 'the wrong-password message', 60000);
    await viewer.until('!document.querySelector("#go").disabled', 'the form to be usable again');
    await viewer.call(pw => { document.querySelector('#pw').value = pw; document.querySelector('#unlock').requestSubmit(); }, PASSWORD);
    await viewer.until('document.querySelector("#pic").naturalWidth > 0', 'the diagram image', 60000);
    assert(await viewer.evaluate('document.querySelector("#doc-title").textContent') === title, 'title');
    viewer.clean();
    await viewer.close();
  });

  await test('no errors at the end', async () => app.clean());
}

(async () => {
  const bin = findChrome();
  if (!bin) {
    console.log('Browser smoke test skipped: no Chrome found (set CHROME_BIN).');
    process.exit(process.env.CI ? 1 : 0);
  }
  const chrome = launch(bin);
  let cdp;
  try {
    cdp = connect(await chrome.ws);
    await cdp.opened;
    await run(cdp);
  } catch (e) { bad('smoke test harness', e); }
  finally {
    try { cdp && cdp.close(); } catch {}
    chrome.proc.kill();
    try { fs.rmSync(chrome.profile, { recursive: true, force: true }); } catch {}
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
