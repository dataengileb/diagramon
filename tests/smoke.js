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
const GLOBALS = ['DIAGRAMON_CONFIG', 'DiagramonI18n', 'DiagramonText', 'DIAGRAMON_EXAMPLES', 'DiagramonIaC', 'DiagramonShare', 'DiagramonWorkspace', 'DiagramonDrift',
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
      await app.evaluate('window.Diagramon.setView("full")');
      for (let k = 0; k < 2; k++) { await app.evaluate('window.Diagramon.toggleTheme()'); await app.evaluate('window.Diagramon.toggleLang()'); await sleep(100); }
      app.clean();
    });
  }

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
