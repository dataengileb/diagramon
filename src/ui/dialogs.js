/* ==========================================================================
   Diagramon · interfaz: avisos y diálogos de confirmación
   --------------------------------------------------------------------------
   Movido desde src/app.js (v2), sin cambios de comportamiento.
   API: window.DiagramonUI.dialogs
   ========================================================================== */
window.DiagramonUI = window.DiagramonUI || {};
window.DiagramonUI.dialogs = (() => {
  'use strict';
  const T = window.DiagramonI18n.T;
  const { $, esc } = window.DiagramonCore.util;

  let toastTimer;
  // Diálogo de confirmación propio: Promise<boolean>; Esc cancela, Enter acepta, foco en lo seguro
  function confirmBox({ title, text, list, ok = 'OK', cancel = 'Cancel', danger = false }) {
    return new Promise(done => {
      const prev = document.activeElement, id = `cf${Date.now()}`;
      const back = document.createElement('div');
      back.className = 'cf-back';
      back.innerHTML = `<div class="cf" role="dialog" aria-modal="true" aria-labelledby="${id}t" aria-describedby="${id}d">
        <h3 id="${id}t">${esc(title)}</h3>
        <div id="${id}d">${text ? `<p>${esc(text)}</p>` : ''}${list?.length ? `<ul>${list.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>
        <div class="cf-actions"><button class="btn" data-cf="no">${esc(cancel)}</button><button class="btn${danger ? ' danger' : ' primary'}" data-cf="ok">${esc(ok)}</button></div></div>`;
      const close = r => { document.removeEventListener('keydown', key, true); back.remove(); prev?.focus?.(); done(r); };
      const key = ev => {
        if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(false); }
        else if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); close(document.activeElement?.dataset?.cf === 'ok'); }
        else if (ev.key === 'Tab') { ev.preventDefault(); const b = [...back.querySelectorAll('button')]; b[(b.indexOf(document.activeElement) + (ev.shiftKey ? b.length - 1 : 1)) % b.length].focus(); }
      };
      back.addEventListener('mousedown', ev => { if (ev.target === back) close(false); });
      back.addEventListener('click', ev => { const b = ev.target.closest('[data-cf]'); if (b) close(b.dataset.cf === 'ok'); });
      document.addEventListener('keydown', key, true);
      document.body.appendChild(back);
      back.querySelector('[data-cf="no"]').focus();
    });
  }

  // Confirmación escrita: el botón sigue deshabilitado hasta teclear la frase (sin pegar ni arrastrar)
  const normPhrase = x => String(x).trim().replace(/\s+/g, ' ').toLowerCase();
  function phraseBox({ title, text, phrase, ok, cancel }) {
    return new Promise(done => {
      const prev = document.activeElement, id = `cf${Date.now()}`;
      const back = document.createElement('div');
      back.className = 'cf-back';
      back.innerHTML = `<div class="cf" role="dialog" aria-modal="true" aria-labelledby="${id}t" aria-describedby="${id}d">
        <h3 id="${id}t">${esc(title)}</h3>
        <div id="${id}d"><p>${esc(text)}</p><p>${esc(T('ver.cf.phraseIntro'))}</p><p class="cf-phrase" id="${id}p">${esc(phrase)}</p></div>
        <input class="cf-type" type="text" aria-labelledby="${id}p" aria-describedby="${id}h" autocomplete="off" spellcheck="false" autocorrect="off" autocapitalize="off">
        <div class="cf-hint" id="${id}h" role="status" aria-live="polite"></div>
        <div class="cf-actions"><button class="btn" data-cf="no">${esc(cancel)}</button><button class="btn danger" data-cf="ok" disabled>${esc(ok)}</button></div></div>`;
      const input = back.querySelector('input'), okBtn = back.querySelector('[data-cf="ok"]'), hint = back.querySelector('.cf-hint');
      const want = normPhrase(phrase);
      let hintTimer;
      const close = r => { clearTimeout(hintTimer); document.removeEventListener('keydown', key, true); back.remove(); prev?.focus?.(); done(r); };
      const noPaste = ev => {
        ev.preventDefault();
        hint.textContent = T('ver.cf.noPaste');
        clearTimeout(hintTimer);
        hintTimer = setTimeout(() => { hint.textContent = ''; }, 2600);
      };
      ['paste', 'drop'].forEach(t => input.addEventListener(t, noPaste));
      input.addEventListener('beforeinput', ev => { if (['insertFromPaste', 'insertFromDrop', 'insertReplacementText', 'insertFromYank'].includes(ev.inputType)) noPaste(ev); });
      input.addEventListener('input', () => { okBtn.disabled = normPhrase(input.value) !== want; });
      const key = ev => {
        if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(false); }
        else if (ev.key === 'Enter') {
          ev.preventDefault(); ev.stopPropagation();
          if (document.activeElement?.dataset?.cf === 'no') close(false);
          else if (!okBtn.disabled) close(true);
        }
        else if (ev.key === 'Tab') { ev.preventDefault(); const b = [input, ...back.querySelectorAll('button:not(:disabled)')]; b[(b.indexOf(document.activeElement) + (ev.shiftKey ? b.length - 1 : 1)) % b.length].focus(); }
      };
      back.addEventListener('mousedown', ev => { if (ev.target === back) close(false); });
      back.addEventListener('click', ev => { const b = ev.target.closest('[data-cf]'); if (b && !b.disabled) close(b.dataset.cf === 'ok'); });
      document.addEventListener('keydown', key, true);
      document.body.appendChild(back);
      input.focus();
    });
  }

  function toast(msg, ms = 1800) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  return { confirmBox, phraseBox, toast };
})();
