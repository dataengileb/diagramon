/* ==========================================================================
   Diagramon · compartir cifrado (HTML autosuficiente, solo lectura)
   --------------------------------------------------------------------------
   Crea un único archivo .html que se abre en cualquier navegador, sin
   instalar ni descargar nada: pide la contraseña, descifra en local y muestra
   el diagrama (modo oscuro y claro) con zoom y desplazamiento.
   - Clave: PBKDF2-SHA-256 con 600 000 iteraciones y sal de 16 bytes.
   - Cifrado: AES-GCM de 256 bits con vector inicial de 12 bytes.
   - El contenido (título incluido) va comprimido con gzip antes de cifrarse;
     el sobre solo lleva los parámetros, en claro y autenticados.
   - El visor bloquea la red (CSP) y muestra el diagrama como imagen, así que
     el contenido descifrado no puede ejecutar código.
   API: window.DiagramonShare.encrypt(payload, password) y .viewer(envelope, lang).
   ========================================================================== */
window.DiagramonShare = (() => {
  'use strict';

  const ITER = 600000;
  const REPO = 'https://github.com/dataengileb/diagramon';

  const b64 = bytes => {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const gzip = async text => new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());

  // Los parámetros del sobre se autentican con el cifrado (datos adicionales)
  const aad = env => new TextEncoder().encode(`diagramon/${env.v}/${env.kdf}/${env.iter}/${env.cipher}`);

  async function encrypt(payload, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    const env = { v: 1, kdf: 'PBKDF2-SHA256', iter: ITER, cipher: 'AES-256-GCM', salt: b64(salt), iv: b64(iv) };
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(env) }, key, await gzip(JSON.stringify(payload)));
    env.data = b64(new Uint8Array(data));
    return env;
  }

  /* Fortaleza aproximada de una contraseña, en bits: largo × variedad de caracteres,
     con castigo a las repeticiones. 0 débil · 1 aceptable · 2 buena · 3 fuerte */
  function strength(pw) {
    const s = String(pw || '');
    if (!s) return { bits: 0, level: 0 };
    let pool = 0;
    if (/[a-z]/.test(s)) pool += 26;
    if (/[A-Z]/.test(s)) pool += 26;
    if (/\d/.test(s)) pool += 10;
    if (/[^\w\s]|_/.test(s)) pool += 33;
    if (/\s/.test(s)) pool += 1;
    if (/[^\x00-\x7f]/.test(s)) pool += 60;
    const unique = new Set(s).size;
    let bits = s.length * Math.log2(Math.max(pool, 2));
    if (unique < s.length / 2) bits /= 2;
    if (/^(.)\1+$/.test(s) || /^(?:0123|1234|abcd|qwer|pass|contra)/i.test(s)) bits = Math.min(bits, 20);
    return { bits: Math.round(bits), level: bits < 50 ? 0 : bits < 70 ? 1 : bits < 90 ? 2 : 3 };
  }

  /* ---------- visor (todo en un archivo) ---------- */
  const VIEW_TEXT = {
    en: {
      title: 'Encrypted diagram', lead: 'This architecture diagram is encrypted. Enter the password you were given to view it.',
      pw: 'Password', open: 'Open', busy: 'Decrypting…', wrong: 'Wrong password, or the file is damaged.',
      insecure: 'Your browser blocks decryption here. Download the file and open it with a double click.',
      old: 'This browser is too old to open the file. Use a recent Chrome, Edge, Firefox or Safari.',
      local: 'Decrypted on this device. Nothing is sent over the network.', fit: 'Fit', theme: 'Theme', lock: 'Lock',
      zoomIn: 'Zoom in', zoomOut: 'Zoom out', made: 'Made with Diagramon', saved: 'Shared on'
    },
    es: {
      title: 'Diagrama cifrado', lead: 'Este diagrama de arquitectura está cifrado. Escribe la contraseña que te dieron para verlo.',
      pw: 'Contraseña', open: 'Abrir', busy: 'Descifrando…', wrong: 'Contraseña incorrecta, o el archivo está dañado.',
      insecure: 'Tu navegador no permite descifrar aquí. Descarga el archivo y ábrelo con doble clic.',
      old: 'Este navegador es demasiado antiguo para abrir el archivo. Usa un Chrome, Edge, Firefox o Safari reciente.',
      local: 'Se descifra en este equipo. No se envía nada por la red.', fit: 'Ajustar', theme: 'Tema', lock: 'Bloquear',
      zoomIn: 'Acercar', zoomOut: 'Alejar', made: 'Hecho con Diagramon', saved: 'Compartido el'
    }
  };

  // Script del visor. Se inserta tal cual en el HTML generado: no usa nada de Diagramon.
  const VIEWER_JS = `(() => {
  'use strict';
  const TX = __TEXT__, ENV = JSON.parse(document.getElementById('envelope').textContent);
  const lang = /^es\\b/i.test(navigator.language || '') ? 'es' : 'en', t = TX[lang];
  const $ = s => document.querySelector(s);
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-t]').forEach(e => { e.textContent = t[e.dataset.t]; });
  document.querySelectorAll('[data-tt]').forEach(e => { e.title = t[e.dataset.tt]; e.setAttribute('aria-label', t[e.dataset.tt]); });
  $('#pw').placeholder = t.pw;
  const msg = (s, bad) => { const m = $('#msg'); m.textContent = s; m.classList.toggle('bad', !!bad); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  if (!window.isSecureContext || !(window.crypto && crypto.subtle)) { msg(t.insecure, true); $('#go').disabled = true; }
  else if (typeof DecompressionStream === 'undefined') { msg(t.old, true); $('#go').disabled = true; }

  async function decrypt(pw) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(ENV.salt), iterations: ENV.iter }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const aad = new TextEncoder().encode('diagramon/' + ENV.v + '/' + ENV.kdf + '/' + ENV.iter + '/' + ENV.cipher);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(ENV.iv), additionalData: aad }, key, unb64(ENV.data));
    const text = await new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    return JSON.parse(text);
  }

  // Temas incluidos en el archivo (claro, oscuro y negro); empieza por el que usaba el autor
  const ORDER = ['light', 'dark', 'black'];
  let doc = null, theme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark', urls = [];
  const themes = () => ORDER.filter(k => doc && doc[k]);
  const view = { x: 0, y: 0, k: 1 };
  const apply = () => { $('#pic').style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.k + ')'; };
  function fit() {
    const img = $('#pic'), st = $('#stage').getBoundingClientRect();
    const w = img.naturalWidth || 1, h = img.naturalHeight || 1;
    view.k = Math.min((st.width - 32) / w, (st.height - 32) / h, 2);
    view.x = (st.width - w * view.k) / 2; view.y = (st.height - h * view.k) / 2;
    apply();
  }
  function zoom(f, cx, cy) {
    const st = $('#stage').getBoundingClientRect();
    cx = cx == null ? st.width / 2 : cx; cy = cy == null ? st.height / 2 : cy;
    const k = Math.min(8, Math.max(0.05, view.k * f));
    view.x = cx - (cx - view.x) * (k / view.k); view.y = cy - (cy - view.y) * (k / view.k); view.k = k;
    apply();
  }
  function show(first) {
    if (!doc[theme]) theme = themes()[0];
    const svg = doc[theme];
    document.body.dataset.theme = theme;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    urls.push(url);
    const img = $('#pic');
    img.onload = () => { if (first) fit(); };
    img.src = url;
  }

  $('#unlock').addEventListener('submit', async ev => {
    ev.preventDefault();
    const pw = $('#pw').value;
    if (!pw || $('#go').disabled) return;
    $('#go').disabled = true; msg(t.busy);
    try {
      doc = await decrypt(pw);
      $('#pw').value = '';
      document.title = doc.title;
      $('#doc-title').textContent = doc.title;
      $('#doc-sub').textContent = [doc.version, doc.sharedAt ? t.saved + ' ' + new Date(doc.sharedAt).toLocaleDateString(lang, { dateStyle: 'medium' }) : ''].filter(Boolean).join(' · ');
      if (doc[doc.theme]) theme = doc.theme;
      $('#theme').hidden = themes().length < 2;
      $('#gate').hidden = true; $('#viewer').hidden = false;
      show(true);
    } catch (e) {
      msg(t.wrong, true); $('#go').disabled = false; $('#pw').select();
    }
  });
  $('#fit').onclick = fit;
  $('#zin').onclick = () => zoom(1.25);
  $('#zout').onclick = () => zoom(0.8);
  $('#theme').onclick = () => { const ts = themes(); theme = ts[(ts.indexOf(theme) + 1) % ts.length]; show(false); };
  $('#lock').onclick = () => { urls.forEach(u => URL.revokeObjectURL(u)); location.reload(); };
  const stage = $('#stage');
  stage.addEventListener('wheel', ev => {
    ev.preventDefault();
    const r = stage.getBoundingClientRect();
    if (ev.ctrlKey || ev.metaKey || Math.abs(ev.deltaY) > Math.abs(ev.deltaX)) zoom(Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : 0.0015)), ev.clientX - r.left, ev.clientY - r.top);
    else { view.x -= ev.deltaX; view.y -= ev.deltaY; apply(); }
  }, { passive: false });
  let drag = null;
  stage.addEventListener('pointerdown', ev => { drag = { x: ev.clientX, y: ev.clientY, vx: view.x, vy: view.y }; stage.setPointerCapture(ev.pointerId); stage.classList.add('grab'); });
  stage.addEventListener('pointermove', ev => { if (!drag) return; view.x = drag.vx + ev.clientX - drag.x; view.y = drag.vy + ev.clientY - drag.y; apply(); });
  const end = () => { drag = null; stage.classList.remove('grab'); };
  stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
  addEventListener('resize', () => { if (doc) fit(); });
  addEventListener('keydown', ev => {
    if ($('#viewer').hidden || ev.target.tagName === 'INPUT') return;
    if (ev.key === 'f' || ev.key === 'F') fit();
    else if (ev.key === '+' || ev.key === '=') zoom(1.25);
    else if (ev.key === '-') zoom(0.8);
  });
  $('#pw').focus();
})();`;

  const VIEWER_CSS = `
*{box-sizing:border-box}html,body{height:100%;margin:0}
body{--bg:#111219;--panel:#171822;--surface:#1c1e2a;--border:#2e3144;--text:#ecebf5;--muted:#9b9db4;--accent:#C2B6F6;--bad:#F6B0A4;
background:var(--bg);color:var(--text);font:14px/1.5 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
@media (prefers-color-scheme:light){body{--bg:#f6f4f1;--panel:#fdfcfa;--surface:#fff;--border:#e5e0e8;--text:#28242f;--muted:#776f84;--accent:#8573DB;--bad:#E2806F}}
body[data-theme=dark]{--bg:#111219;--panel:#171822;--surface:#1c1e2a;--border:#2e3144;--text:#ecebf5;--muted:#9b9db4;--accent:#C2B6F6}
body[data-theme=light]{--bg:#f6f4f1;--panel:#fdfcfa;--surface:#fff;--border:#e5e0e8;--text:#28242f;--muted:#776f84;--accent:#8573DB}
body[data-theme=black]{--bg:#000;--panel:#0a0a0a;--surface:#111;--border:#5c5c5c;--text:#fff;--muted:#a8a8a8;--accent:#CEC4F9}
[hidden]{display:none!important}
#gate{min-height:100%;display:grid;place-items:center;padding:16px}
.card{width:min(400px,100%);padding:26px 24px 20px;border:1px solid var(--border);border-radius:18px;background:var(--panel);box-shadow:0 18px 40px rgba(0,0,0,.25)}
.lock{width:44px;height:44px;display:grid;place-items:center;border-radius:14px;background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--accent);margin-bottom:12px}
.lock svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
h1{margin:0 0 6px;font-size:18px}p{margin:0 0 14px;color:var(--muted);font-size:13px}
form{display:flex;gap:8px}input{flex:1;min-width:0;height:38px;padding:0 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);font:inherit}
input:focus{outline:none;border-color:var(--accent)}
button{height:38px;padding:0 16px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);font:inherit;font-weight:650;cursor:pointer}
button:hover:not(:disabled){border-color:var(--accent)}button:disabled{opacity:.55;cursor:default}
#go{border-color:var(--accent);color:var(--accent)}
#msg{min-height:20px;margin:10px 0 0;font-size:12.5px}#msg.bad{color:var(--bad)}
.foot{margin:16px 0 0;font-size:11.5px}.foot a{color:var(--muted)}
#viewer{height:100%;display:grid;grid-template-rows:auto 1fr}
.bar{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--border);background:var(--panel)}
.bar .t{min-width:0;margin-right:auto}.bar b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bar small{color:var(--muted);font-size:11.5px}
.bar button{height:32px;padding:0 11px;font-size:12.5px}
#stage{position:relative;overflow:hidden;cursor:grab;touch-action:none}#stage.grab{cursor:grabbing}
#pic{position:absolute;left:0;top:0;transform-origin:0 0;user-select:none;-webkit-user-drag:none;pointer-events:none}
@media (max-width:560px){.bar{flex-wrap:wrap}.bar .t{flex-basis:100%}}`;

  function viewer(env, lang = 'en') {
    const t = VIEW_TEXT[lang] || VIEW_TEXT.en;
    const csp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src blob: data:; base-uri 'none'; form-action 'none'";
    return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex">
<title>${t.title} · Diagramon</title>
<style>${VIEWER_CSS}</style>
</head>
<body>
<main id="gate">
  <div class="card">
    <div class="lock"><svg viewBox="0 0 24 24"><rect x="4" y="10.5" width="16" height="10.5" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg></div>
    <h1 data-t="title">${t.title}</h1>
    <p data-t="lead">${t.lead}</p>
    <form id="unlock" autocomplete="off">
      <input id="pw" type="password" autocomplete="current-password" aria-label="${t.pw}" placeholder="${t.pw}">
      <button id="go" type="submit" data-t="open">${t.open}</button>
    </form>
    <div id="msg" role="status" aria-live="polite"></div>
    <p class="foot"><span data-t="local">${t.local}</span><br><a href="${REPO}" rel="noopener noreferrer" target="_blank" data-t="made">${t.made}</a></p>
  </div>
</main>
<div id="viewer" hidden>
  <header class="bar">
    <div class="t"><b id="doc-title"></b><small id="doc-sub"></small></div>
    <button id="zout" data-tt="zoomOut">−</button><button id="zin" data-tt="zoomIn">+</button>
    <button id="fit" data-t="fit">${t.fit}</button>
    <button id="theme" data-t="theme" hidden>${t.theme}</button>
    <button id="lock" data-t="lock">${t.lock}</button>
  </header>
  <div id="stage"><img id="pic" alt=""></div>
</div>
<script type="application/json" id="envelope">${JSON.stringify(env)}</script>
<script>${VIEWER_JS.replace('__TEXT__', JSON.stringify(VIEW_TEXT))}</script>
</body>
</html>
`;
  }

  return { encrypt, viewer, strength, ITER };
})();
