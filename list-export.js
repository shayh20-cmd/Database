/* Project Hub — the task list's ייצוא (export) dialog and its two outputs (2026-10-27).
   The list on screen, as filtered, sorted and grouped there, goes out as an Excel workbook or
   as an A4 page the browser prints to PDF. Both are built here from one model the page hands
   over, already in the output language (ListView's exportModel in project_hub_01.html):

     { title, date, subtitle, sheetName, rtl,
       columns: [{ label, kind }],            kind sets the width: name, comment, updates, ...
       rows: [{ type: 'section', label, depth } | { type: 'task', cells: [text], sub }] }

   The .xlsx is written by hand (a stored zip of a few XML parts) so it carries what the
   community builds of the usual libraries leave out: bold header, wrapped text, section
   fills, a right-to-left sheet, A4 page setup and a header row that repeats on every page.
   Loaded after React; the page reaches it as window.ListExport. Node's tests require it. */
(function () {
  'use strict';

  /* ── widths: Excel characters per column kind; the PDF uses them as proportions ── */
  const WIDTH = {
    name: 46, comment: 34, updates: 24, dates: 21, assignee: 20, status: 12, priority: 11,
    discipline: 11, text: 24, date: 12, number: 10, select: 16, people: 20, progress: 9,
    timeline: 21,
  };
  const CENTER = new Set(['status', 'priority', 'discipline', 'date', 'number', 'progress']);
  const widthOf = c => WIDTH[c.kind] || 18;

  /* ── zip (stored, no compression) ── */
  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc32 = bytes => {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };
  function zip(files) {
    const enc = new TextEncoder();
    const parts = [], central = [];
    let offset = 0;
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (const f of files) {
      const name = enc.encode(f.name);
      const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      const crc = crc32(data);
      const loc = new DataView(new ArrayBuffer(30));
      loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true);
      loc.setUint16(8, 0, true); loc.setUint16(10, time, true); loc.setUint16(12, date, true);
      loc.setUint32(14, crc, true); loc.setUint32(18, data.length, true); loc.setUint32(22, data.length, true);
      loc.setUint16(26, name.length, true); loc.setUint16(28, 0, true);
      parts.push(new Uint8Array(loc.buffer), name, data);
      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true);
      cen.setUint16(8, 0x0800, true); cen.setUint16(10, 0, true); cen.setUint16(12, time, true);
      cen.setUint16(14, date, true); cen.setUint32(16, crc, true); cen.setUint32(20, data.length, true);
      cen.setUint32(24, data.length, true); cen.setUint16(28, name.length, true);
      cen.setUint32(42, offset, true);
      central.push(new Uint8Array(cen.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const cdSize = central.reduce((s, p) => s + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    const all = [...parts, ...central, new Uint8Array(end.buffer)];
    const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
    let at = 0;
    for (const p of all) { out.set(p, at); at += p.length; }
    return out;
  }

  /* ── xlsx ── */
  const xmlEsc = s => String(s == null ? '' : s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const colName = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const sheetNameOf = s => (String(s || 'Sheet').replace(/[\[\]:*?\/\\']/g, ' ').trim() || 'Sheet').slice(0, 31);

  /* cellXfs: 0 plain · 1 title · 2 subtitle · 3 header · 4 body · 5 body centred ·
     6 section · 7 inner section · 8 subtask name. Text keeps to the reading side even when
     a cell holds only Latin letters, which Excel would otherwise push to the other side. */
  function stylesXml(rtl) {
    /* an explicit reading order: left on 'context', Excel mirrors the alignment of a cell that starts in the other script */
    const ro = rtl ? ' readingOrder="2"' : ' readingOrder="1"';
    const side = rtl ? 'right' : 'left';
    const font = (sz, extra = '') => `<font>${extra}<sz val="${sz}"/><name val="Arial"/><family val="2"/></font>`;
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<fonts count="6">' + font(10) + font(16, '<b/>') + font(10, '<color rgb="FF5B616D"/>') + font(10, '<b/>')
      + font(11, '<b/>') + font(10, '<color rgb="FF3F4651"/>') + '</fonts>'
      + '<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
      + '<fill><patternFill patternType="solid"><fgColor rgb="FFE7ECF3"/><bgColor indexed="64"/></patternFill></fill>'
      + '<fill><patternFill patternType="solid"><fgColor rgb="FFD9E4F2"/><bgColor indexed="64"/></patternFill></fill>'
      + '<fill><patternFill patternType="solid"><fgColor rgb="FFF0F3F8"/><bgColor indexed="64"/></patternFill></fill></fills>'
      + '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'
      + '<border>' + ['left', 'right', 'top', 'bottom'].map(s => `<${s} style="thin"><color rgb="FFC5CDD8"/></${s}>`).join('') + '<diagonal/></border></borders>'
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + '<cellXfs count="9">'
      + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
      + `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"${ro}/></xf>`
      + `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"${ro}/></xf>`
      + `<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${side}" vertical="center" wrapText="1"${ro}/></xf>`
      + `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="${side}" vertical="top" wrapText="1"${ro}/></xf>`
      + `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top" wrapText="1"${ro}/></xf>`
      + `<xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"${ro}/></xf>`
      + `<xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${side}" vertical="center" indent="1"${ro}/></xf>`
      + `<xf numFmtId="0" fontId="5" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${side}" vertical="top" wrapText="1" indent="2"${ro}/></xf>`
      + '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
      + '</styleSheet>';
  }

  function sheetXml(model, orientation) {
    const cols = model.columns;
    const last = colName(Math.max(0, cols.length - 1));
    const HEAD = 4;
    const rows = [], merges = [];
    const cell = (r, c, v, s) => `<c r="${colName(c)}${r}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
    rows.push(`<row r="1" ht="26" customHeight="1">${cell(1, 0, model.title + (model.date ? '  ·  ' + model.date : ''), 1)}</row>`);
    merges.push(`A1:${last}1`);
    if (model.subtitle) { rows.push(`<row r="2" ht="18" customHeight="1">${cell(2, 0, model.subtitle, 2)}</row>`); merges.push(`A2:${last}2`); }
    rows.push(`<row r="${HEAD}">${cols.map((c, i) => cell(HEAD, i, c.label, 3)).join('')}</row>`);
    let r = HEAD;
    for (const row of model.rows) {
      r++;
      if (row.type === 'section') {
        const s = row.depth > 0 ? 7 : 6;
        const label = row.label + (row.count != null ? ` (${row.count})` : '');
        rows.push(`<row r="${r}" ht="${row.depth > 0 ? 18 : 20}" customHeight="1">${cell(r, 0, label, s)}${cols.slice(1).map((_, i) => `<c r="${colName(i + 1)}${r}" s="${s}"/>`).join('')}</row>`);
        if (cols.length > 1) merges.push(`A${r}:${last}${r}`);
      } else {
        rows.push(`<row r="${r}">${cols.map((c, i) => cell(r, i, row.cells[i], c.kind === 'name' && row.sub ? 8 : CENTER.has(c.kind) ? 5 : 4)).join('')}</row>`);
      }
    }
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>'
      + `<dimension ref="A1:${last}${r}"/>`
      + `<sheetViews><sheetView${model.rtl ? ' rightToLeft="1"' : ''} workbookViewId="0"><pane ySplit="${HEAD}" topLeftCell="A${HEAD + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${HEAD + 1}" sqref="A${HEAD + 1}"/></sheetView></sheetViews>`
      + '<sheetFormatPr defaultRowHeight="15"/>'
      + '<cols>' + cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${widthOf(c)}" customWidth="1"/>`).join('') + '</cols>'
      + '<sheetData>' + rows.join('') + '</sheetData>'
      + `<mergeCells count="${merges.length}">${merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
      + '<printOptions horizontalCentered="1"/>'
      + '<pageMargins left="0.4" right="0.4" top="0.55" bottom="0.6" header="0.25" footer="0.3"/>'
      + `<pageSetup paperSize="9" orientation="${orientation === 'portrait' ? 'portrait' : 'landscape'}" fitToWidth="1" fitToHeight="0"/>`
      + '<headerFooter><oddFooter>&amp;C&amp;P / &amp;N</oddFooter></headerFooter>'
      + '</worksheet>';
  }

  function buildXlsx(model, orientation) {
    const name = sheetNameOf(model.sheetName);
    return zip([
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        + '<bookViews><workbookView/></bookViews>'
        + `<sheets><sheet name="${xmlEsc(name)}" sheetId="1" r:id="rId1"/></sheets>`
        + `<definedNames><definedName name="_xlnm.Print_Titles" localSheetId="0">'${xmlEsc(name)}'!$4:$4</definedName></definedNames></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: 'xl/styles.xml', data: stylesXml(model.rtl) },
      { name: 'xl/worksheets/sheet1.xml', data: sheetXml(model, orientation) },
    ]);
  }

  /* ── the A4 print page (PDF) ── */
  const htmlEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* "עמוד {p} מתוך {n}" as CSS content, so the counter reads in the language's own order */
  const pageContent = tpl => String(tpl || '{p} / {n}').split(/({[pn]})/).filter(Boolean)
    .map(x => x === '{p}' ? 'counter(page)' : x === '{n}' ? 'counter(pages)' : JSON.stringify(x)).join(' ');

  function buildPrintHtml(model, orientation) {
    const portrait = orientation === 'portrait';
    const rtl = !!model.rtl, side = rtl ? 'right' : 'left';
    const cols = model.columns;
    const total = cols.reduce((s, c) => s + widthOf(c), 0) || 1;
    const fs = portrait ? (cols.length > 6 ? 7.5 : 8.5) : (cols.length > 8 ? 8 : 9);
    const body = model.rows.map(row => {
      if (row.type === 'section') {
        return `<tr class="sec d${Math.min(row.depth || 0, 2)}"><td colspan="${cols.length}">${htmlEsc(row.label)}${row.count != null ? ` <span class="n">(${row.count})</span>` : ''}</td></tr>`;
      }
      return `<tr${row.sub ? ' class="sub"' : ''}>${cols.map((c, i) => `<td class="k-${c.kind}${CENTER.has(c.kind) ? ' c' : ''}">${htmlEsc(row.cells[i])}</td>`).join('')}</tr>`;
    }).join('');
    return `<!doctype html><html lang="${rtl ? 'he' : 'en'}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${htmlEsc(model.fileName || model.title)}</title><style>
@page{size:A4 ${portrait ? 'portrait' : 'landscape'};margin:12mm 10mm 14mm;@bottom-center{content:${pageContent(model.pageLabel)};font:8pt Arial,sans-serif;color:#6b7280}}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{margin:0;background:#fff;color:#111827}
body{font-family:Arial,"Segoe UI","Noto Sans Hebrew",sans-serif;font-size:${fs}pt;line-height:1.35}
@media screen{body{max-width:${portrait ? 190 : 277}mm;margin:10mm auto;padding:0 4mm}}
.hd{display:flex;align-items:baseline;justify-content:space-between;gap:6mm;border-bottom:1.4pt solid #1f2937;padding-bottom:2mm;margin-bottom:1.6mm}
h1{font-size:16pt;margin:0;font-weight:700}
.dt{font-size:11pt;font-weight:600;color:#374151;white-space:nowrap;unicode-bidi:isolate}
.st{color:#5b616d;font-size:8.5pt;margin-bottom:4mm}
table{width:100%;border-collapse:collapse;table-layout:fixed}
thead{display:table-header-group}
th{background:#e7ecf3;font-weight:700;font-size:${fs - 0.5}pt;text-align:${side};border:0.6pt solid #b9c2ce;padding:1.6mm 1.8mm;vertical-align:bottom}
td{border:0.6pt solid #cfd6df;padding:1.3mm 1.8mm;vertical-align:top;text-align:${side};overflow-wrap:anywhere;word-break:break-word;white-space:pre-wrap}
th.c,td.c{text-align:center}
tr{break-inside:avoid;page-break-inside:avoid}
tr.sec td{background:#d9e4f2;font-weight:700;font-size:${fs + 0.5}pt;padding:1.6mm 2mm;break-after:avoid;page-break-after:avoid}
tr.sec.d1 td,tr.sec.d2 td{background:#f0f3f8;font-size:${fs}pt;padding-${rtl ? 'right' : 'left'}:5mm}
tr.sec.d2 td{padding-${rtl ? 'right' : 'left'}:8mm;font-weight:600}
tr.sec .n{font-weight:400;color:#5b616d}
tr.sub td{color:#3f4651}
tr.sub td.k-name{padding-${rtl ? 'right' : 'left'}:6mm}
tr.sub td.k-name::before{content:"↳";float:${side};margin-${rtl ? 'left' : 'right'}:1.5mm;color:#9ca3af}
.empty{padding:6mm 0;color:#6b7280}
</style></head><body>
<div class="hd"><h1>${htmlEsc(model.title)}</h1><span class="dt">${htmlEsc(model.date || '')}</span></div>
${model.subtitle ? `<div class="st">${htmlEsc(model.subtitle)}</div>` : ''}
<table><colgroup>${cols.map(c => `<col style="width:${(widthOf(c) / total * 100).toFixed(2)}%">`).join('')}</colgroup>
<thead><tr>${cols.map(c => `<th class="k-${c.kind}${CENTER.has(c.kind) ? ' c' : ''}">${htmlEsc(c.label)}</th>`).join('')}</tr></thead>
<tbody>${body}</tbody></table>
${model.rows.length ? '' : `<div class="empty">${htmlEsc(model.emptyText || '')}</div>`}
</body></html>`;
  }

  const safeFileName = s => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001F]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'export';

  const api = { buildXlsx, buildPrintHtml, safeFileName, crc32, zip, colName };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  if (typeof window === 'undefined' || !window.React) return;

  /* ── the dialog ── */
  const h = React.createElement;
  const { useState, useMemo, useEffect } = React;
  const PREFS_KEY = 'ph-list-export';
  const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch (e) { return {}; } };
  const savePrefs = p => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) {} };
  const T = (s, vars) => (window.I18N && window.I18N.t ? window.I18N.t(s, vars) : String(s).replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? vars[k] : m)));

  const css = document.createElement('style');
  css.textContent = [
    '.lx-ov{position:fixed;inset:0;z-index:1200;background:var(--overlay,rgba(15,23,42,.45));display:flex;align-items:center;justify-content:center;padding:16px}',
    '.lx-dlg{background:var(--surface);color:var(--text);border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.25);width:min(520px,100%);max-height:calc(100vh - 32px);display:flex;flex-direction:column;font-size:13px}',
    '.lx-hd{display:flex;align-items:center;justify-content:space-between;padding:14px 18px 10px;border-bottom:1px solid var(--border)}',
    '.lx-hd h3{margin:0;font-size:15px;font-weight:700}',
    '.lx-x{background:none;border:none;font-size:16px;cursor:pointer;color:var(--text-3);padding:2px 6px;border-radius:6px}',
    '.lx-x:hover{background:var(--bg);color:var(--text)}',
    '.lx-bd{padding:12px 18px;overflow:auto;display:flex;flex-direction:column;gap:14px}',
    '.lx-lbl{font-size:11px;font-weight:700;color:var(--text-3);margin-bottom:6px;letter-spacing:.02em}',
    '.lx-seg{display:flex;gap:8px}',
    '.lx-opt{flex:1;display:flex;align-items:center;gap:10px;padding:9px 12px;border:1.5px solid var(--border);border-radius:9px;background:var(--surface);cursor:pointer;font:inherit;color:var(--text);text-align:start}',
    '.lx-opt:hover{border-color:var(--border-strong)}',
    '.lx-opt.on{border-color:var(--accent);background:rgba(37,99,235,.06)}',
    '.lx-opt b{display:block;font-size:13px}',
    '.lx-opt small{display:block;font-size:11px;color:var(--text-3);margin-top:1px}',
    '.lx-ic{width:30px;height:30px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#fff;flex:none}',
    '.lx-pg{flex:none;border:1.5px solid var(--text-3);border-radius:2px;background:var(--bg)}',
    '.lx-opt.on .lx-pg{border-color:var(--accent)}',
    '.lx-cols{border:1px solid var(--border);border-radius:9px;overflow:hidden}',
    '.lx-cols-tb{display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:var(--bg);border-bottom:1px solid var(--border);font-size:11px;color:var(--text-3)}',
    '.lx-link{background:none;border:none;color:var(--accent);cursor:pointer;font:inherit;font-size:11px;padding:0 4px}',
    '.lx-col{display:flex;align-items:center;gap:8px;padding:5px 8px;border-bottom:1px solid var(--border);background:var(--surface)}',
    '.lx-col:last-child{border-bottom:none}',
    '.lx-col.off .lx-cl{color:var(--text-3)}',
    '.lx-col.drag{opacity:.4}',
    '.lx-col.over{box-shadow:inset 0 2px 0 var(--accent)}',
    '.lx-grip{cursor:grab;color:var(--text-3);font-size:13px;user-select:none;padding:0 2px}',
    '.lx-cl{flex:1;display:flex;align-items:center;gap:8px;cursor:pointer;min-width:0}',
    '.lx-cl span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.lx-mv{background:none;border:1px solid transparent;border-radius:5px;color:var(--text-3);cursor:pointer;font-size:12px;width:24px;height:22px;padding:0}',
    '.lx-mv:hover:not(:disabled){border-color:var(--border);color:var(--text)}',
    '.lx-mv:disabled{opacity:.3;cursor:default}',
    '.lx-chk{display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12.5px;padding:2px 0}',
    '.lx-hint{font-size:11.5px;color:#B45309;background:rgba(245,158,11,.1);border-radius:7px;padding:6px 10px}',
    '.lx-ft{display:flex;align-items:center;gap:8px;padding:12px 18px;border-top:1px solid var(--border)}',
    '.lx-count{flex:1;font-size:12px;color:var(--text-3)}',
    '.lx-btn{font:inherit;font-size:13px;padding:7px 16px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer}',
    '.lx-btn.pri{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600}',
    '.lx-btn.pri:disabled{opacity:.5;cursor:default}',
  ].join('\n');
  document.head.appendChild(css);

  /* the saved order first (columns that still exist), then any column it doesn't know, on */
  function initialCols(columns, saved) {
    const byId = Object.fromEntries(columns.map(c => [c.id, c]));
    const out = [];
    (saved || []).forEach(s => { if (byId[s.id] && !out.some(o => o.id === s.id)) out.push({ id: s.id, on: s.on !== false }); });
    columns.forEach((c, i) => {
      if (out.some(o => o.id === c.id)) return;
      const prev = columns.slice(0, i).reverse().find(p => out.some(o => o.id === p.id));
      const at = prev ? out.findIndex(o => o.id === prev.id) + 1 : 0;
      out.splice(at, 0, { id: c.id, on: true });
    });
    return out;
  }

  function download(bytes, name, type) {
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  /* prints from a hidden frame; the browser's print dialog offers "Save as PDF" */
  function printHtml(html, title) {
    const fr = document.createElement('iframe');
    fr.setAttribute('aria-hidden', 'true');
    fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(fr);
    const docTitle = document.title;
    let done = false;
    const cleanup = () => { if (done) return; done = true; document.title = docTitle; setTimeout(() => fr.remove(), 1000); };
    fr.onload = () => {
      const w = fr.contentWindow;
      w.addEventListener('afterprint', cleanup);
      document.title = title; /* some browsers name the PDF after the top page */
      setTimeout(() => { try { w.focus(); w.print(); } finally { setTimeout(cleanup, 60000); } }, 250);
    };
    fr.srcdoc = html;
  }

  function Dialog({ columns, build, onClose }) {
    const prefs0 = useMemo(loadPrefs, []);
    const [fmt, setFmt] = useState(prefs0.fmt === 'pdf' ? 'pdf' : 'xlsx');
    const [orient, setOrient] = useState(prefs0.orient === 'portrait' ? 'portrait' : 'landscape');
    const [subs, setSubs] = useState(!!prefs0.subtasks);
    const [done, setDone] = useState(prefs0.done !== false);
    const [cols, setCols] = useState(() => initialCols(columns, prefs0.cols));
    const [dragI, setDragI] = useState(null);
    const [overI, setOverI] = useState(null);
    useEffect(() => {
      const k = e => { if (e.key === 'Escape') onClose(); };
      document.addEventListener('keydown', k);
      return () => document.removeEventListener('keydown', k);
    }, []);
    const byId = Object.fromEntries(columns.map(c => [c.id, c]));
    const onIds = cols.filter(c => c.on).map(c => c.id);
    const preview = useMemo(() => build(onIds, { subtasks: subs, done }), [onIds.join(','), subs, done]);
    const move = (from, to) => {
      if (to < 0 || to >= cols.length || from === to) return;
      const a = [...cols]; const [x] = a.splice(from, 1); a.splice(to, 0, x); setCols(a);
    };
    const toggle = id => setCols(cols.map(c => c.id === id ? { ...c, on: !c.on } : c));
    const setAll = on => setCols(cols.map(c => ({ ...c, on })));
    const go = () => {
      savePrefs({ fmt, orient, subtasks: subs, done, cols });
      const model = build(onIds, { subtasks: subs, done }).model;
      if (fmt === 'xlsx') download(buildXlsx(model, orient), model.fileName + '.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      else printHtml(buildPrintHtml(model, orient), model.fileName);
      onClose();
    };
    const opt = (on, onClick, icon, title, sub) => h('button', { type: 'button', className: 'lx-opt' + (on ? ' on' : ''), onClick }, icon, h('span', null, h('b', null, title), sub && h('small', null, sub)));
    const page = (w, hh) => h('span', { className: 'lx-pg', style: { width: w, height: hh } });
    return ReactDOM.createPortal(h('div', { className: 'lx-ov', onMouseDown: e => { if (e.target === e.currentTarget) onClose(); } },
      h('div', { className: 'lx-dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'ייצוא רשימה' },
        h('div', { className: 'lx-hd' }, h('h3', null, 'ייצוא רשימה'), h('button', { type: 'button', className: 'lx-x', onClick: onClose, title: 'סגור', 'aria-label': 'סגור' }, '✕')),
        h('div', { className: 'lx-bd' },
          h('div', null, h('div', { className: 'lx-lbl' }, 'פורמט'),
            h('div', { className: 'lx-seg' },
              opt(fmt === 'xlsx', () => setFmt('xlsx'), h('span', { className: 'lx-ic', style: { background: '#107C41' } }, 'XLS'), 'Excel', 'קובץ xlsx לעריכה'),
              opt(fmt === 'pdf', () => setFmt('pdf'), h('span', { className: 'lx-ic', style: { background: '#D93025' } }, 'PDF'), 'PDF', 'הדפסה ← שמירה כ־PDF'))),
          h('div', null, h('div', { className: 'lx-lbl' }, 'דף A4'),
            h('div', { className: 'lx-seg' },
              opt(orient === 'portrait', () => setOrient('portrait'), page(17, 23), 'לאורך', null),
              opt(orient === 'landscape', () => setOrient('landscape'), page(23, 17), 'לרוחב', null)),
            orient === 'portrait' && onIds.length > 6 && h('div', { className: 'lx-hint', style: { marginTop: 8 } }, 'הרבה עמודות לדף לאורך — לרוחב הטקסט יהיה גדול וקריא יותר')),
          h('div', null, h('div', { className: 'lx-lbl' }, 'עמודות וסדר'),
            h('div', { className: 'lx-cols' },
              h('div', { className: 'lx-cols-tb' }, h('span', null, 'גרור או השתמש בחצים כדי לסדר'),
                h('span', null, h('button', { type: 'button', className: 'lx-link', onClick: () => setAll(true) }, 'הכל'), '·', h('button', { type: 'button', className: 'lx-link', onClick: () => setAll(false) }, 'נקה הכל'))),
              cols.map((c, i) => {
                const col = byId[c.id];
                return h('div', {
                  key: c.id, className: 'lx-col' + (c.on ? '' : ' off') + (dragI === i ? ' drag' : '') + (overI === i && dragI !== null && dragI !== i ? ' over' : ''),
                  draggable: true,
                  onDragStart: e => { setDragI(i); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', c.id); } catch (er) {} },
                  onDragOver: e => { e.preventDefault(); if (overI !== i) setOverI(i); },
                  onDrop: e => { e.preventDefault(); if (dragI !== null) move(dragI, i); setDragI(null); setOverI(null); },
                  onDragEnd: () => { setDragI(null); setOverI(null); },
                },
                  h('span', { className: 'lx-grip', 'aria-hidden': 'true' }, '⠿'),
                  h('label', { className: 'lx-cl' }, h('input', { type: 'checkbox', checked: c.on, onChange: () => toggle(c.id) }),
                    h('span', col.custom ? { 'data-i18n-skip': '' } : null, col.label)),
                  h('button', { type: 'button', className: 'lx-mv', disabled: i === 0, onClick: () => move(i, i - 1), title: 'הזז למעלה', 'aria-label': 'הזז למעלה' }, '↑'),
                  h('button', { type: 'button', className: 'lx-mv', disabled: i === cols.length - 1, onClick: () => move(i, i + 1), title: 'הזז למטה', 'aria-label': 'הזז למטה' }, '↓'));
              }))),
          h('div', null, h('div', { className: 'lx-lbl' }, 'שורות'),
            h('label', { className: 'lx-chk' }, h('input', { type: 'checkbox', checked: done, onChange: () => setDone(!done) }), 'כולל משימות שהושלמו'),
            h('label', { className: 'lx-chk' }, h('input', { type: 'checkbox', checked: subs, onChange: () => setSubs(!subs) }), 'כולל תתי־משימות'))),
        h('div', { className: 'lx-ft' },
          h('span', { className: 'lx-count' }, T('{n} משימות ייוצאו, כפי שהרשימה מסוננת וממוינת', { n: preview.count })),
          h('button', { type: 'button', className: 'lx-btn', onClick: onClose }, 'ביטול'),
          h('button', { type: 'button', className: 'lx-btn pri', disabled: !onIds.length, onClick: go }, fmt === 'xlsx' ? 'הורד Excel' : 'הדפס ל־PDF')))), document.body);
  }

  window.ListExport = { ...api, Dialog };
})();
