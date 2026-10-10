/* ==========================================================================
   Diagramon · espacio de trabajo (una carpeta con varios diagramas)
   --------------------------------------------------------------------------
   Parte pura, sin DOM ni red: reconoce qué archivos de una carpeta son
   diagramas de Diagramon y resume cada uno (título, tamaño, versión de
   formato, docId) para listarlos sin abrirlos. La lectura de la carpeta
   (File System Access o <input webkitdirectory>) vive en app.js.
   - Diagrama: JSON con `nodes` (lista) y, si las trae, `edges` y `groups` listas.
   - Manifiesto opcional `diagramon-workspace.json`: por ahora solo { "name" }.
   - `docId`: identificador estable del diagrama, para enlazar entre diagramas
     aunque se renombre el archivo (campo opcional, no sube formatVersion).
   API: window.DiagramonWorkspace.{ MANIFEST, MAX_BYTES, MAX_FILES, isDiagram,
        cleanDocId, newDocId, summarize, scan, fileNameFor }
   ========================================================================== */
window.DiagramonWorkspace = (() => {
  'use strict';

  const MANIFEST = 'diagramon-workspace.json';
  const MAX_BYTES = 8 * 1024 * 1024;   // un archivo más grande no se lee
  const MAX_FILES = 200;               // diagramas que se listan por carpeta
  const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
  const list = v => (Array.isArray(v) ? v : []);

  const isDiagram = raw => isObj(raw) && Array.isArray(raw.nodes) && (raw.edges == null || Array.isArray(raw.edges)) && (raw.groups == null || Array.isArray(raw.groups));
  // docId: letras, cifras y guiones; de 6 a 40 caracteres. Cualquier otra cosa se descarta
  const cleanDocId = v => (typeof v === 'string' && /^[0-9a-zA-Z-]{6,40}$/.test(v.trim()) ? v.trim() : '');
  function newDocId() {
    const c = typeof crypto !== 'undefined' ? crypto : null;
    const bytes = new Uint8Array(8);
    if (c && c.getRandomValues) c.getRandomValues(bytes); else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    return 'd-' + [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  function summarize(raw, name = '') {
    const fv = Math.floor(+raw.formatVersion);
    return {
      name, title: str(raw.title, 200) || name.replace(/\.json$/i, ''),
      nodes: raw.nodes.length, edges: list(raw.edges).length, groups: list(raw.groups).length, phases: list(raw.phases).length, versions: list(raw.versions).length,
      formatVersion: Number.isFinite(fv) && fv > 0 ? fv : 0, docId: cleanDocId(raw.docId)
    };
  }

  // files: [{ name, text, size? }] (solo la carpeta, sin subcarpetas) → { manifest, diagrams, skipped }
  // diagrams: resúmenes, por título; skipped: [{ name, reason }] con reason 'notJson' | 'notDiagram' | 'big' | 'many'
  function scan(files) {
    const out = { manifest: null, diagrams: [], skipped: [] };
    list(files).forEach(f => {
      const name = str(f && f.name, 255), text = f && typeof f.text === 'string' ? f.text : '';
      if (!name) return;
      if (name === MANIFEST) {
        try { const m = JSON.parse(text); if (isObj(m)) out.manifest = { name: str(m.name, 120) }; } catch { /* manifiesto ilegible: se ignora */ }
        return;
      }
      if (!/\.json$/i.test(name)) return;
      if ((Number.isFinite(f.size) ? f.size : text.length) > MAX_BYTES) return void out.skipped.push({ name, reason: 'big' });
      let raw = null;
      try { raw = JSON.parse(text); } catch { return void out.skipped.push({ name, reason: 'notJson' }); }
      if (!isDiagram(raw)) return void out.skipped.push({ name, reason: 'notDiagram' });
      if (out.diagrams.length >= MAX_FILES) return void out.skipped.push({ name, reason: 'many' });
      out.diagrams.push(summarize(raw, name));
    });
    const seen = new Map();
    out.diagrams.forEach(d => { if (d.docId) seen.set(d.docId, (seen.get(d.docId) || 0) + 1); });
    out.diagrams.forEach(d => { d.dupDocId = !!d.docId && seen.get(d.docId) > 1; });
    out.diagrams.sort((a, b) => a.title.localeCompare(b.title) || a.name.localeCompare(b.name));
    return out;
  }

  // Nombre de archivo para guardar un diagrama: «título.json» sin acentos ni símbolos, distinto de los que ya hay (comparación sin mayúsculas)
  function fileNameFor(title, taken) {
    const used = new Set([...(taken || [])].map(n => String(n).toLowerCase()));
    const base = String(title == null ? '' : title).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'diagram';
    let n = `${base}.json`, i = 2;
    while (used.has(n.toLowerCase()) || n === MANIFEST) n = `${base}-${i++}.json`;
    return n;
  }

  return { MANIFEST, MAX_BYTES, MAX_FILES, isDiagram, cleanDocId, newDocId, summarize, scan, fileNameFor };
})();
