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
   - Formato del contenido: v2 = { fmt: 2, title, version, sharedAt, theme, view, views: [{ key, label, svg: { <tema>: <SVG> } }] }
     (cada vista en uno o dos temas). El v1 antiguo ({ dark, light, black }) se sigue abriendo: el visor lo trata como una sola vista.
     v3 = v2 + { cmt: true, shareId, refs: [{ k, id, label }], comments: [{ id, on, author, date, text, replies?, source? }], views[].targets: [{ k, id, label, box: [x, y, w, h] }] }:
     el visor deja comentar (zonas pulsables sobre la imagen, con las cajas en coordenadas del SVG) y devuelve un archivo de comentarios cifrado (ver openFeedback).
   - El visor bloquea la red (CSP) y muestra el diagrama como imagen, así que
     el contenido descifrado no puede ejecutar código.
   API: window.DiagramonShare.encrypt(payload, password), .viewer(envelope, lang) y .openFeedback(envelope, password).
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

  /* Archivo de comentarios que el visor devuelve al autor: el mismo sobre, con la misma clave (misma sal y mismas iteraciones, vector nuevo),
     { v: 'fb1', kind: 'feedback', kdf, iter, cipher, salt, iv, data }. Los datos autenticados llevan 'fb1', así que un archivo compartido
     no se puede hacer pasar por uno de comentarios ni al revés. Contenido: { format: 'diagramon-feedback', v: 1, shareId, title, author, created,
     comments: [{ id, on?: { kind, id? }, replyTo?, author, date, text }] }. Es contenido no confiable: quien lo importa lo valida y lo muestra como texto. */
  const FB_MAX_ENV = 1500000, FB_MAX_TEXT = 2000000;   // bytes del sobre (base64) y del texto descomprimido
  async function openFeedback(env, password) {
    if (!env || typeof env !== 'object' || env.kind !== 'feedback' || env.v !== 'fb1' || env.kdf !== 'PBKDF2-SHA256' || env.cipher !== 'AES-256-GCM'
      || !Number.isInteger(env.iter) || env.iter < 100000 || env.iter > 5000000 || typeof env.data !== 'string' || env.data.length > FB_MAX_ENV || typeof env.salt !== 'string' || typeof env.iv !== 'string') throw new Error('format');
    const unb64 = x => Uint8Array.from(atob(x), c => c.charCodeAt(0));
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(password).normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(env.salt), iterations: env.iter }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv), additionalData: aad(env) }, key, unb64(env.data)));
    const rd = new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(), parts = [];
    let n = 0;
    for (;;) {
      const { done, value } = await rd.read();
      if (done) break;
      n += value.length;
      if (n > FB_MAX_TEXT) { await rd.cancel(); throw new Error('size'); }
      parts.push(value);
    }
    const all = new Uint8Array(n);
    let o = 0;
    parts.forEach(c => { all.set(c, o); o += c.length; });
    return JSON.parse(new TextDecoder().decode(all));
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
      view: 'View', zoomIn: 'Zoom in', zoomOut: 'Zoom out', made: 'Made with Diagramon', saved: 'Shared on',
      comments: 'Comments', cHelp: 'Click a component, a connection or a group in the diagram, or pick it below, and write your comment. Nothing is sent: when you finish, download your comments and send the file back.',
      cName: 'Your name', cOn: 'About', cText: 'Comment', cAdd: 'Add comment', cDl: 'Download my comments', cGeneral: 'The whole diagram', cReplyTo: 'Reply', cDel: 'Delete', cReply: 'Reply', cSend: 'Add reply',
      cNone: 'No comments yet.', cFile: 'diagramon-comments.json', cDone: 'Your comments are saved only in this page until you download them.'
    },
    es: {
      title: 'Diagrama cifrado', lead: 'Este diagrama de arquitectura está cifrado. Escribe la contraseña que te dieron para verlo.',
      pw: 'Contraseña', open: 'Abrir', busy: 'Descifrando…', wrong: 'Contraseña incorrecta, o el archivo está dañado.',
      insecure: 'Tu navegador no permite descifrar aquí. Descarga el archivo y ábrelo con doble clic.',
      old: 'Este navegador es demasiado antiguo para abrir el archivo. Usa un Chrome, Edge, Firefox o Safari reciente.',
      local: 'Se descifra en este equipo. No se envía nada por la red.', fit: 'Ajustar', theme: 'Tema', lock: 'Bloquear',
      view: 'Vista', zoomIn: 'Acercar', zoomOut: 'Alejar', made: 'Hecho con Diagramon', saved: 'Compartido el',
      comments: 'Comentarios', cHelp: 'Pulsa un componente, una conexión o un grupo del diagrama, o elígelo abajo, y escribe tu comentario. No se envía nada: al terminar, descarga tus comentarios y devuelve el archivo.',
      cName: 'Tu nombre', cOn: 'Sobre', cText: 'Comentario', cAdd: 'Añadir comentario', cDl: 'Descargar mis comentarios', cGeneral: 'Todo el diagrama', cReplyTo: 'Respuesta', cDel: 'Borrar', cReply: 'Responder', cSend: 'Añadir respuesta',
      cNone: 'Todavía no hay comentarios.', cFile: 'diagramon-comentarios.json', cDone: 'Tus comentarios solo se guardan en esta página hasta que los descargues.'
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

  let KEY = null;   // la clave derivada: sirve también para sellar el archivo de comentarios
  async function decrypt(pw) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(ENV.salt), iterations: ENV.iter }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt', 'encrypt']);
    KEY = key;
    const aad = new TextEncoder().encode('diagramon/' + ENV.v + '/' + ENV.kdf + '/' + ENV.iter + '/' + ENV.cipher);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(ENV.iv), additionalData: aad }, key, unb64(ENV.data));
    const text = await new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    return JSON.parse(text);
  }

  // Temas incluidos en el archivo (claro, oscuro y negro); empieza por el que usaba el autor
  // Formato v2: doc.views[]; el v1 (un solo diagrama en tres temas) se envuelve como una vista
  const ORDER = ['light', 'dark', 'black'];
  let doc = null, cur = 0, theme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark', urls = [];
  const norm = d => {
    if (Array.isArray(d.views) && d.views.length) d.views = d.views.filter(v => v && v.svg);
    else d.views = [{ key: 'full', label: '', svg: { light: d.light, dark: d.dark, black: d.black } }];
    return d;
  };
  const themes = () => ORDER.filter(k => doc && doc.views[cur].svg[k]);
  const view = { x: 0, y: 0, k: 1 };
  const apply = () => { const tr = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.k + ')'; $('#pic').style.transform = tr; $('#hots').style.transform = tr; };
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
  function show(refit) {
    if (!doc.views[cur].svg[theme]) theme = themes()[0];
    const svg = doc.views[cur].svg[theme];
    document.body.dataset.theme = theme;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    urls.push(url);
    const img = $('#pic');
    img.onload = () => { if (refit) fit(); };
    img.src = url;
    if (typeof drawHots === 'function') drawHots();
    if (typeof drawPanel === 'function' && doc.cmt) drawPanel();
  }

  $('#unlock').addEventListener('submit', async ev => {
    ev.preventDefault();
    const pw = $('#pw').value;
    if (!pw || $('#go').disabled) return;
    $('#go').disabled = true; msg(t.busy);
    try {
      doc = norm(await decrypt(pw));
      if (!doc.views.length) throw new Error('empty');
      $('#pw').value = '';
      document.title = doc.title;
      $('#doc-title').textContent = doc.title;
      $('#doc-sub').textContent = [doc.version, doc.sharedAt ? t.saved + ' ' + new Date(doc.sharedAt).toLocaleDateString(lang, { dateStyle: 'medium' }) : ''].filter(Boolean).join(' · ');
      cur = Math.max(0, doc.views.findIndex(v => v.key === doc.view));
      if (doc.views[cur].svg[doc.theme]) theme = doc.theme;
      const sel = $('#view');
      sel.textContent = '';
      doc.views.forEach((v, i) => { const o = document.createElement('option'); o.value = i; o.textContent = v.label || v.key; sel.appendChild(o); });
      sel.value = cur; sel.hidden = doc.views.length < 2;
      $('#theme').hidden = themes().length < 2;
      $('#gate').hidden = true; $('#viewer').hidden = false;
      initComments();
      show(true);
    } catch (e) {
      msg(t.wrong, true); $('#go').disabled = false; $('#pw').select();
    }
  });
  $('#fit').onclick = fit;
  $('#zin').onclick = () => zoom(1.25);
  $('#zout').onclick = () => zoom(0.8);
  $('#theme').onclick = () => { const ts = themes(); theme = ts[(ts.indexOf(theme) + 1) % ts.length]; show(false); };
  $('#view').onchange = ev => { cur = +ev.target.value || 0; $('#theme').hidden = themes().length < 2; show(true); ev.target.blur(); };
  $('#lock').onclick = () => { urls.forEach(u => URL.revokeObjectURL(u)); location.reload(); };
  const stage = $('#stage');
  stage.addEventListener('wheel', ev => {
    ev.preventDefault();
    const r = stage.getBoundingClientRect();
    if (ev.ctrlKey || ev.metaKey || Math.abs(ev.deltaY) > Math.abs(ev.deltaX)) zoom(Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : 0.0015)), ev.clientX - r.left, ev.clientY - r.top);
    else { view.x -= ev.deltaX; view.y -= ev.deltaY; apply(); }
  }, { passive: false });
  let drag = null;
  stage.addEventListener('pointerdown', ev => { if (ev.target.closest && ev.target.closest('.hot')) return; drag = { x: ev.clientX, y: ev.clientY, vx: view.x, vy: view.y }; stage.setPointerCapture(ev.pointerId); stage.classList.add('grab'); });
  stage.addEventListener('pointermove', ev => { if (!drag) return; view.x = drag.vx + ev.clientX - drag.x; view.y = drag.vy + ev.clientY - drag.y; apply(); });
  const end = () => { drag = null; stage.classList.remove('grab'); };
  stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
  addEventListener('resize', () => { if (doc) fit(); });
  addEventListener('keydown', ev => {
    if ($('#viewer').hidden || ev.target.tagName === 'INPUT' || ev.target.tagName === 'SELECT' || ev.target.tagName === 'TEXTAREA') return;
    if (ev.key === 'f' || ev.key === 'F') fit();
    else if (ev.key === '+' || ev.key === '=') zoom(1.25);
    else if (ev.key === '-') zoom(0.8);
  });
  /* ---- comentarios (formato 3): zonas pulsables, panel y archivo de comentarios cifrado con la misma clave ---- */
  let mine = [], sel = 'general', dirty = false;
  const b64 = u => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const rid = () => 'r-' + Array.from(crypto.getRandomValues(new Uint8Array(5)), b => b.toString(16).padStart(2, '0')).join('');
  const day = () => new Date().toISOString().slice(0, 10);
  const node = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const key = (k, id) => (k === 'general' ? 'general' : k + ':' + id);
  const targetsOf = () => (doc.views[cur].targets || []);
  const labelOf = (k, id) => {
    if (k === 'general') return t.cGeneral;
    for (const v of doc.views) { const x = (v.targets || []).find(y => y.k === k && y.id === id); if (x) return x.label; }
    const r = (doc.refs || []).find(y => y.k === k && y.id === id);
    return r ? r.label : (t.cGeneral);
  };
  const countOn = (k, id) => (doc.comments || []).filter(c => c.status !== 'resolved' && c.on && c.on.kind === k && c.on.id === id).length + mine.filter(c => c.on && c.on.kind === k && c.on.id === id).length;
  function drawHots() {
    const box = $('#hots');
    box.textContent = '';
    if (!doc.cmt) return;
    targetsOf().forEach(x => {
      const d = node('div', 'hot' + (sel === key(x.k, x.id) ? ' on' : ''));
      d.dataset.sel = key(x.k, x.id);
      d.style.left = x.box[0] + 'px'; d.style.top = x.box[1] + 'px'; d.style.width = x.box[2] + 'px'; d.style.height = x.box[3] + 'px';
      d.title = x.label;
      const n = countOn(x.k, x.id);
      if (n) d.appendChild(node('b', '', n));
      box.appendChild(d);
    });
  }
  function threadEl(c, own) {
    const k = c.on ? c.on.kind : 'general', id = c.on ? c.on.id : '';
    const li = node('div', 'cm' + (c.status === 'resolved' ? ' done' : ''));
    const h = node('div', 'cm-h');
    h.appendChild(node('b', '', c.replyTo ? t.cReplyTo : labelOf(k, id)));
    h.appendChild(node('span', '', (c.author || '') + (c.date ? ' · ' + c.date : '')));
    li.appendChild(h);
    li.appendChild(node('div', 'cm-t', c.text));
    (c.replies || []).forEach(r => { const rr = node('div', 'cm-r'); rr.appendChild(node('div', 'cm-h', (r.author || '') + (r.date ? ' · ' + r.date : ''))); rr.appendChild(node('div', 'cm-t', r.text)); li.appendChild(rr); });
    const a = node('div', 'cm-a');
    if (own) { const b = node('button', '', t.cDel); b.type = 'button'; b.onclick = () => { mine = mine.filter(x => x.id !== c.id); dirty = true; drawPanel(); drawHots(); }; a.appendChild(b); }
    else {
      const b = node('button', '', t.cReply); b.type = 'button';
      b.onclick = () => {
        const box = node('div', 'cm-rb'), ta = node('textarea'), go = node('button', '', t.cSend);
        ta.rows = 2; ta.maxLength = 2000; go.type = 'button';
        go.onclick = () => {
          const name = $('#c-name').value.trim(), text = ta.value.trim();
          if (!name) { $('#c-name').focus(); return; }
          if (!text) return;
          mine.push({ id: rid(), replyTo: c.id, author: name, date: day(), text }); dirty = true; drawPanel(); drawHots();
        };
        box.appendChild(ta); box.appendChild(go); li.appendChild(box); b.remove(); ta.focus();
      };
      a.appendChild(b);
    }
    li.appendChild(a);
    return li;
  }
  function drawPanel() {
    const s = $('#c-on'), opts = [{ v: 'general', l: t.cGeneral }].concat(targetsOf().map(x => ({ v: key(x.k, x.id), l: x.label }))).concat((doc.refs || []).map(x => ({ v: key(x.k, x.id), l: x.label })));
    if (!opts.some(o => o.v === sel)) sel = 'general';
    s.textContent = '';
    opts.forEach(o => { const e = node('option', '', o.l); e.value = o.v; s.appendChild(e); });
    s.value = sel;
    const list = $('#c-list');
    list.textContent = '';
    (doc.comments || []).forEach(c => list.appendChild(threadEl(c, false)));
    mine.forEach(c => list.appendChild(threadEl(c, true)));
    if (!list.firstChild) list.appendChild(node('p', 'cm-none', t.cNone));
    $('#c-dl').disabled = !mine.length;
    $('#c-n').textContent = mine.length ? String(mine.length) : '';
    $('#c-n').hidden = !mine.length;
  }
  async function seal(payload) {
    const iv = crypto.getRandomValues(new Uint8Array(12)), env = { v: 'fb1', kind: 'feedback', kdf: ENV.kdf, iter: ENV.iter, cipher: ENV.cipher, salt: ENV.salt, iv: b64(iv) };
    const gz = new Uint8Array(await new Response(new Blob([JSON.stringify(payload)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    const aad = new TextEncoder().encode('diagramon/' + env.v + '/' + env.kdf + '/' + env.iter + '/' + env.cipher);
    env.data = b64(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, KEY, gz)));
    return env;
  }
  function initComments() {
    $('#c-btn').hidden = !doc.cmt;
    if (!doc.cmt) return;
    $('#c-on').onchange = ev => { sel = ev.target.value; drawHots(); };
    $('#c-form').onsubmit = ev => {
      ev.preventDefault();
      const name = $('#c-name').value.trim(), text = $('#c-text').value.trim();
      if (!name) return $('#c-name').focus();
      if (!text || mine.length >= 200) return;
      const i = sel.indexOf(':'), on = i < 0 ? { kind: 'general' } : { kind: sel.slice(0, i), id: sel.slice(i + 1) };
      mine.push({ id: rid(), on, author: name, date: day(), text }); dirty = true;
      $('#c-text').value = '';
      drawPanel(); drawHots();
    };
    $('#c-dl').onclick = async () => {
      const author = (mine[0] && mine[0].author) || $('#c-name').value.trim();
      const out = mine.map(c => (c.replyTo ? { id: c.id, replyTo: c.replyTo, author: c.author, date: c.date, text: c.text } : { id: c.id, on: c.on, author: c.author, date: c.date, text: c.text }));
      const env = await seal({ format: 'diagramon-feedback', v: 1, shareId: doc.shareId || '', title: doc.title, author, created: new Date().toISOString(), comments: out });
      const a = node('a'), u = URL.createObjectURL(new Blob([JSON.stringify(env)], { type: 'application/json' }));
      a.href = u; a.download = t.cFile; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 4000);
      dirty = false;
    };
    $('#c-btn').onclick = () => { const p = $('#side'); p.hidden = !p.hidden; fit(); if (!p.hidden) { $('#c-name').value ? $('#c-text').focus() : $('#c-name').focus(); } };
    $('#hots').addEventListener('click', ev => {
      const d = ev.target.closest('.hot');
      if (!d) return;
      sel = d.dataset.sel; const was = $('#side').hidden; $('#side').hidden = false; if (was) fit(); drawPanel(); drawHots();
      $('#c-name').value ? $('#c-text').focus() : $('#c-name').focus();
    });
    addEventListener('beforeunload', ev => { if (dirty) { ev.preventDefault(); ev.returnValue = ''; } });
    drawPanel(); drawHots();
  }
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
select{height:32px;max-width:40vw;padding:0 8px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);font:inherit;font-size:12.5px;font-weight:650;cursor:pointer}
select:hover,select:focus{outline:none;border-color:var(--accent)}
button:hover:not(:disabled){border-color:var(--accent)}button:disabled{opacity:.55;cursor:default}
#go{border-color:var(--accent);color:var(--accent)}
#msg{min-height:20px;margin:10px 0 0;font-size:12.5px}#msg.bad{color:var(--bad)}
.foot{margin:16px 0 0;font-size:11.5px}.foot a{color:var(--muted)}
#viewer{height:100%;display:grid;grid-template-rows:auto minmax(0,1fr)}
.bar{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--border);background:var(--panel)}
.bar .t{min-width:0;margin-right:auto}.bar b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bar small{color:var(--muted);font-size:11.5px}
.bar button{height:32px;padding:0 11px;font-size:12.5px}
#stage{position:relative;overflow:hidden;cursor:grab;touch-action:none}#stage.grab{cursor:grabbing}
#pic{position:absolute;left:0;top:0;transform-origin:0 0;user-select:none;-webkit-user-drag:none;pointer-events:none}
#main{display:flex;min-height:0;min-width:0}#main #stage{flex:1;min-width:0}
#hots{position:absolute;left:0;top:0;transform-origin:0 0}
.hot{position:absolute;border:2px solid transparent;border-radius:8px;cursor:pointer}
.hot:hover,.hot.on{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,transparent)}
.hot b{position:absolute;top:-9px;left:-9px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:var(--accent);color:var(--bg);font-size:12px;line-height:20px;text-align:center}
#side{width:340px;max-width:46vw;display:flex;flex-direction:column;gap:8px;padding:12px;border-left:1px solid var(--border);background:var(--panel);overflow-y:auto}
#side p{margin:0;font-size:12px}#c-n{display:inline-block;min-width:18px;margin-left:5px;border-radius:9px;background:var(--accent);color:var(--bg);font-size:11px;line-height:18px;text-align:center}
#c-form{display:grid;gap:6px}#c-form label{display:grid;gap:3px;font-size:11.5px;font-weight:650;color:var(--muted)}
#c-form :is(input,select,textarea),.cm-rb textarea{width:100%;max-width:none;height:auto;padding:6px 8px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font:inherit;font-size:12.5px}
#c-form select{height:32px}#c-form textarea{resize:vertical;min-height:56px}
#side button{height:30px;padding:0 10px;font-size:12px}
#c-list{display:grid;gap:8px;align-content:start}.cm{padding:8px 10px;border:1px solid var(--border);border-radius:10px;background:var(--surface);font-size:12.5px}.cm.done{opacity:.6}
.cm-h{display:flex;flex-wrap:wrap;justify-content:space-between;gap:2px 8px;font-size:11.5px;color:var(--muted)}.cm-h b{color:var(--accent)}
.cm-t{margin-top:3px;white-space:pre-wrap;overflow-wrap:anywhere}.cm-r{margin:6px 0 0 8px;padding-left:8px;border-left:2px solid var(--border)}
.cm-a{margin-top:6px}.cm-rb{display:grid;gap:5px;margin-top:6px}.cm-none{color:var(--muted)}
@media (max-width:560px){.bar{flex-wrap:wrap}.bar .t{flex-basis:100%}#main{flex-direction:column}#side{width:auto;max-width:none;max-height:55%;border-left:0;border-top:1px solid var(--border)}}`;

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
    <select id="view" data-tt="view" hidden></select>
    <button id="theme" data-t="theme" hidden>${t.theme}</button>
    <button id="c-btn" hidden><span data-t="comments">${t.comments}</span><span id="c-n" hidden></span></button>
    <button id="lock" data-t="lock">${t.lock}</button>
  </header>
  <div id="main">
    <div id="stage"><img id="pic" alt=""><div id="hots"></div></div>
    <aside id="side" hidden aria-label="${t.comments}">
      <p data-t="cHelp">${t.cHelp}</p>
      <form id="c-form" autocomplete="off">
        <label><span data-t="cName">${t.cName}</span><input id="c-name" maxlength="80"></label>
        <label><span data-t="cOn">${t.cOn}</span><select id="c-on"></select></label>
        <label><span data-t="cText">${t.cText}</span><textarea id="c-text" rows="3" maxlength="2000"></textarea></label>
        <button type="submit" data-t="cAdd">${t.cAdd}</button>
      </form>
      <button id="c-dl" type="button" data-t="cDl" disabled>${t.cDl}</button>
      <p data-t="cDone">${t.cDone}</p>
      <div id="c-list"></div>
    </aside>
  </div>
</div>
<script type="application/json" id="envelope">${JSON.stringify(env)}</script>
<script>${VIEWER_JS.replace('__TEXT__', JSON.stringify(VIEW_TEXT))}</script>
</body>
</html>
`;
  }

  return { encrypt, viewer, strength, openFeedback, ITER };
})();
