/* ==========================================================================
   Diagramon · escritor mínimo de Excel (.xlsx) sin librerías
   --------------------------------------------------------------------------
   - ZIP con método STORE (sin compresión): cabeceras locales, directorio
     central, registro final y tabla CRC-32. Nombres en UTF-8 (bit 11).
   - Partes: [Content_Types].xml, _rels/.rels, xl/workbook.xml, xl/styles.xml,
     xl/worksheets/sheetN.xml (cadenas en línea, sin sharedStrings), docProps.
   - Cada hoja: cabecera en negrita e inmovilizada, autofiltro, anchos de
     columna estimados y formatos de celda (dinero, SLA con 3 decimales, entero).
   API: window.DiagramonXlsx = { zip(files), bytes(sheets, meta), blob(sheets, meta), MIME }
     files  = [{ name, data: string | Uint8Array }]
     sheets = [{ name, head: [texto], rows: [[valor]], fmt?: [null | 'money' | 'sla' | 'int'] }]
       (valor: número → celda numérica; cualquier otra cosa → texto; null / '' → celda vacía)
     meta   = { title, creator, date }
   ========================================================================== */
(() => {
  'use strict';
  const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  // UTF-8: TextEncoder si existe; si no, un codificador mínimo (entornos sin DOM)
  const utf8 = s => {
    s = String(s);
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    const out = [];
    for (let i = 0; i < s.length; i++) {
      let c = s.charCodeAt(i);
      if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length) { const d = s.charCodeAt(i + 1); if (d >= 0xdc00 && d < 0xe000) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; } }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return Uint8Array.from(out);
  };

  // CRC-32 (polinomio 0xEDB88320)
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u8 => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

  // ZIP sin compresión → Uint8Array. Fecha y hora DOS fijas (2026-01-01 00:00)
  function zip(files) {
    const DOS_TIME = 0, DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1, parts = [], central = [];
    let offset = 0;
    const u16 = (a, v) => a.push(v & 255, (v >>> 8) & 255), u32 = (a, v) => a.push(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255);
    files.forEach(f => {
      const name = utf8(f.name), data = typeof f.data === 'string' ? utf8(f.data) : f.data, crc = crc32(data);
      const lh = [];
      u32(lh, 0x04034b50); u16(lh, 20); u16(lh, 0x0800); u16(lh, 0); u16(lh, DOS_TIME); u16(lh, DOS_DATE);
      u32(lh, crc); u32(lh, data.length); u32(lh, data.length); u16(lh, name.length); u16(lh, 0);
      const ch = [];
      u32(ch, 0x02014b50); u16(ch, 20); u16(ch, 20); u16(ch, 0x0800); u16(ch, 0); u16(ch, DOS_TIME); u16(ch, DOS_DATE);
      u32(ch, crc); u32(ch, data.length); u32(ch, data.length); u16(ch, name.length); u16(ch, 0); u16(ch, 0); u16(ch, 0); u16(ch, 0); u32(ch, 0); u32(ch, offset);
      parts.push(Uint8Array.from(lh), name, data);
      central.push(Uint8Array.from(ch), name);
      offset += lh.length + name.length + data.length;
    });
    const cdSize = central.reduce((s, p) => s + p.length, 0), end = [];
    u32(end, 0x06054b50); u16(end, 0); u16(end, 0); u16(end, files.length); u16(end, files.length); u32(end, cdSize); u32(end, offset); u16(end, 0);
    const all = [...parts, ...central, Uint8Array.from(end)], out = new Uint8Array(offset + cdSize + end.length);
    let p = 0;
    all.forEach(a => { out.set(a, p); p += a.length; });
    return out;
  }

  // Texto seguro para XML: sin caracteres de control no válidos ni sustitutos sueltos
  const clean = s => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '').replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '');
  const esc = s => clean(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const col = i => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };
  // Nombre de hoja: sin []:*?/\, máximo 31, no vacío y único (sin distinguir mayúsculas)
  const sheetName = (raw, used) => {
    let base = clean(raw).replace(/[\[\]:*?\/\\]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^'+|'+$/g, '').slice(0, 31).trim() || 'Sheet', name = base, i = 2;
    while (used.has(name.toLowerCase())) { const suf = ` (${i++})`; name = base.slice(0, 31 - suf.length) + suf; }
    used.add(name.toLowerCase());
    return name;
  };

  // Estilos (índice en cellXfs): 0 normal · 1 cabecera · 2 dinero · 3 SLA (0.000) · 4 entero
  const STYLE = { money: 2, sla: 3, int: 4 };
  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.000"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8E6F2"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

  const textCell = (ref, v, s) => { const t = clean(v); return `<c r="${ref}"${s ? ` s="${s}"` : ''} t="inlineStr"><is><t xml:space="preserve">${esc(t)}</t></is></c>`; };
  function sheetXml(sh) {
    const nc = Math.max(sh.head.length, ...sh.rows.map(r => r.length), 1), widths = Array(nc).fill(0);
    const meas = v => String(v == null ? '' : v).split(/\r?\n/).reduce((m, l) => Math.max(m, [...l].length), 0);
    sh.head.forEach((h, i) => { widths[i] = meas(h) + 3; });
    sh.rows.slice(0, 300).forEach(r => r.forEach((v, i) => { widths[i] = Math.max(widths[i] || 0, meas(typeof v === 'number' ? v.toFixed(2) : v) + 2); }));
    const rowsXml = [`<row r="1">${sh.head.map((h, i) => textCell(col(i) + 1, h, 1)).join('')}</row>`];
    sh.rows.forEach((r, ri) => {
      const cells = r.map((v, i) => {
        if (v == null || v === '') return '';
        const ref = col(i) + (ri + 2);
        if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${STYLE[sh.fmt?.[i]] ? ` s="${STYLE[sh.fmt[i]]}"` : ''}><v>${v}</v></c>`;
        return textCell(ref, v, 0);
      }).join('');
      rowsXml.push(`<row r="${ri + 2}">${cells}</row>`);
    });
    const last = `${col(nc - 1)}${sh.rows.length + 1}`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${last}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.min(60, Math.max(8, w))}" customWidth="1"/>`).join('')}</cols><sheetData>${rowsXml.join('')}</sheetData><autoFilter ref="A1:${last}"/></worksheet>`;
  }

  // sheets → bytes del .xlsx
  function bytes(sheets, meta = {}) {
    sheets = (sheets || []).filter(s => s && Array.isArray(s.head));
    if (!sheets.length) sheets = [{ name: 'Sheet', head: [''], rows: [] }];
    const used = new Set(), names = sheets.map(s => sheetName(s.name, used)), n = sheets.length;
    const iso = (meta.date instanceof Date ? meta.date : new Date()).toISOString().replace(/\.\d+Z$/, 'Z');
    const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    const q = s => s.replace(/'/g, "''");
    const files = [
      { name: '[Content_Types].xml', data: `${X}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` },
      { name: '_rels/.rels', data: `${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` },
      { name: 'xl/workbook.xml', data: `${X}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${names.map((nm, i) => `<sheet name="${esc(nm)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><definedNames>${sheets.map((s, i) => `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(q(names[i]))}'!$A$1:$${col(Math.max(s.head.length, ...s.rows.map(r => r.length), 1) - 1)}$${s.rows.length + 1}</definedName>`).join('')}</definedNames></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: `${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/styles.xml', data: STYLES },
      ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
      { name: 'docProps/core.xml', data: `${X}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(meta.title || 'Diagramon')}</dc:title><dc:creator>${esc(meta.creator || 'Diagramon')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified></cp:coreProperties>` },
      { name: 'docProps/app.xml', data: `${X}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Diagramon</Application></Properties>` }
    ];
    return zip(files);
  }
  const blob = (sheets, meta) => new Blob([bytes(sheets, meta)], { type: MIME });

  window.DiagramonXlsx = { zip, bytes, blob, crc32, MIME };
})();
