/* Export of one calculators check, on A4: reportFor() turns a check into a report (title, details, sections of
   tables), toHtml() lays it out for printing to PDF and toXlsx() writes it as an Excel workbook.
   Pure code with no page or library in it, so tests load it as it is. Every label goes through T, the data as typed. */
(function (root) {
'use strict';

// the stored zip, column names and file names are the task list export's
const LX = typeof require === 'function' && typeof module !== 'undefined' ? require('./list-export.js') : root.ListExport;
const r2 = n => Math.round((+n || 0) * 100) / 100;
const cm = m => (m == null || m === '' ? '' : Math.round(+m * 1000) / 10);
const fmtD = d => (d || '').split('-').reverse().join('/');
const ok = v => ({ v, tone: 'ok' }), bad = v => ({ v, tone: 'bad' });
const mark = (good, v) => (good ? ok(v) : bad(v));

const TITLES = { parking: 'תנועה וחניה', hlt: 'הל"ת', hga: 'הג"א', safety: 'בטיחות' };

function parkingSections(sh, { R, T, L }) {
  const t = R.parkingTotals(sh), z = sh.zone || 'N', st = sh.st != null && sh.stations ? sh.stations[sh.st] : null;
  const areaLbl = T(sh.basis === 'total' ? 'שטח כולל (מ"ר)' : 'שטח עיקרי (מ"ר)');
  const usesFar = z === 'N' && (sh.rows || []).some(r => { const u = R.useById(r.type); return u && R.ruleSet(u, sh.basis).far; });
  const rows = (sh.rows || []).map(r => {
    const u = R.useById(r.type), c = R.carRow(r, sh, T), b = R.bikeRow(r, sh), m = R.motoRow(r, sh);
    if (!u) return null;
    return [u.id.replace(/[sa]$/, '') + ' ' + T(u.name), r.qty == null ? '' : r.qty, u.m === 'area' ? areaLbl : T(R.MEASURES[u.m]),
      c ? c.parts.map(p => (p.label ? p.label + ': ' : '') + p.text).join('; ') : '', c ? c.refs.join(', ') : '',
      c ? R.span(c.min, c.max, c.noMin, c.noMax, T) : '—', b ? (b.n == null ? '?' : b.n) : '—',
      m ? (m.na ? 0 : R.span(m.min, m.max, false, false, T)) : '—'];
  }).filter(Boolean);
  return [
    { title: T('מרחק ממתע"ן ואזור חניה'), pairs: [
      [T('כתובת הפרויקט'), sh.addr || '—'],
      [T('תחנה קובעת'), st ? st.name + ' — ' + T("{n} מ'", { n: st.d }) : T('לא נבחרה תחנה')],
      [T('אזור חניה'), T(L.ZONE_INFO[z][0]) + ' — ' + T(L.ZONE_INFO[z][1])],
      usesFar ? [T('אחוזי זכויות הבנייה בתכנית (%)'), sh.far == null ? '—' : sh.far] : null].filter(Boolean) },
    { title: T('שימושים בפרויקט'), tables: [{
      head: [T('שימוש הקרקע (חלק ב\' לתוספת)'), T('כמות'), T('יחידת מידה'), T('תקן'), T('סעיף בתקנות'), T('רכב'), T('אופניים'), T('אופנועים')],
      rows,
      foot: [T('סה"כ'), '', '', '', '', R.span(t.min, t.max, t.noMin, t.noMax, T), t.bikes + (t.bikesMissing ? '+' : ''), R.span(t.mMin, t.mMax, false, false, T)] }],
      notes: [T('כל חלק של מקום מעוגל כלפי מעלה, לכל שימוש — חלק א\' סעיף 6')] },
    { title: T('תוצאה'), pairs: [[T('🚗 רכב פרטי'), R.span(t.min, t.max, t.noMin, t.noMax, T)], [T('♿ חניות נגישות'), T('ממתין')],
      [T('🚲 אופניים'), t.bikes + (t.bikesMissing ? '+' : '')], [T('🏍 אופנועים'), R.span(t.mMin, t.mMax, false, false, T)]] },
  ];
}

function hltSections(sh, { R, T, L }) {
  const Tot = R.hltTotals(sh), chk = R.planCheck(sh, Tot), uses = [];
  const useRows = (sh.rows || []).map(r => {
    const u = R.hltById(r.type); if (!u) return null;
    const men = r.men != null ? r.men : u.men;
    return [u.t + ' — ' + T(u.name), r.qty == null ? '' : r.qty, T(u.m), u.split === 'mw' ? men : T(L.SPLIT_NOTE[u.split] || '—'), u.floors ? (r.floors || 1) : '—'];
  }).filter(Boolean);
  (sh.rows || []).forEach(r => {
    const x = R.hltRow(r, T); if (!x) return;
    const cols = R.FIX_ORDER.filter(k => x.groups.some(g => g.fx[k]) || x.extra[k]);
    const gl = g => (g.g === 'all' ? (x.u.groups[0].per ? T('סה"כ ({n} {u})', { n: g.n, u: T(x.u.m) }) : T('גברים ונשים')) : T(L.G_LABEL[g.g]) + (g.g !== 'shared' ? ' (' + g.n + ')' : ''));
    const rows = x.groups.map(g => [gl(g)].concat(cols.map(k => (g.fx[k] ? { v: g.fx[k].c, sub: g.fx[k].t } : '—'))));
    if (Object.keys(x.extra).length) rows.push([T('לבניין')].concat(cols.map(k => (x.extra[k] ? { v: x.extra[k].c, sub: x.extra[k].note } : ''))));
    uses.push({ title: T('טבלה {t}', { t: x.u.t }) + ' · ' + T(x.u.name) + ' · ' + T(x.desc.tpl, Object.assign({ u: T(x.u.m) }, x.desc.vars)),
      head: [''].concat(cols.map(k => T(R.FIX[k]))), rows });
  });
  const tcols = R.FIX_ORDER.filter(k => ['m', 'w', 'u', 'all', 'bld'].some(g => Tot[g][k] != null));
  const trow = (lbl, o) => (Object.keys(o).length ? [[T(lbl)].concat(tcols.map(k => (o[k] == null ? '—' : o[k])))] : []);
  const label = l => T(R.FIX[l.c.fx]) + (L.PCOL_LABEL[l.c.g] ? ' — ' + T(L.PCOL_LABEL[l.c.g]) : '');
  const floors = (sh.plan && sh.plan.floors) || [];
  return [
    { title: T('שימושים ואוכלוסייה'), tables: [{ head: [T('שימוש (טבלת הל"ת)'), T('כמות'), T('יחידת מידה'), T('% גברים'), T('קומות')], rows: useRows }] },
    { title: T('קבועות נדרשות לפי שימוש'), tables: uses },
    { title: T('סיכום קבועות לפרויקט'), tables: [{
      head: [''].concat(tcols.map(k => T(R.FIX[k]))),
      rows: [].concat(trow('גברים', Tot.m), trow('נשים', Tot.w), trow('דו-תכליתי', Tot.u), trow('משותף / ליחידה', Tot.all), trow('לבניין / לקומה', Tot.bld)),
      foot: [T('סה"כ')].concat(tcols.map(k => Tot.sum[k] || 0)) }] },
    { title: T('נדרש מול מוצע'), verdict: chk.cols.length ? (chk.bad ? bad(T('✗ {n} פערים מול הדרישה', { n: chk.bad })) : ok(T('✓ התכנית עומדת בדרישות המינימום'))) : null, tables: chk.cols.length ? [
      { title: T('קבועות מוצעות לפי קומה'), head: [T('קומה')].concat(chk.lines.map(label)), rows: floors.map(f => [f.name].concat(chk.lines.map(l => (f.fx || {})[l.c.k] || 0))) },
      { head: [T('קבועה'), T('נדרש'), T('מוצע'), T('פער'), T('סטטוס')], rows: chk.lines.map(l => [label(l), l.req, l.pr, l.gap,
        l.st === 'ok' ? ok(l.gap > 0 ? T('✓ עודף {n}', { n: l.gap }) : T('✓ תקין')) : bad(l.gap < 0 ? T('✗ חסר {n}', { n: -l.gap }) : T('✗ חסר בקומה'))]) }] : [] },
  ];
}

function hgaSections(sh, { R, T, L }) {
  const s = R.hgaSheet(sh), sec = R.hgaSection(sh, T), counts = R.safFloorCounts(s.floors), name = f => R.safFloorLabel(f, T);
  const useRows = [];
  s.resolved.forEach(f => (f.uses || []).forEach(u => {
    const x = R.hgaRow(u, sh.basis, T); if (!x) return;
    const none = x.u.kind === 'none';
    useRows.push([name(f), T(x.u.name), none ? '—' : (u.qty == null ? '' : u.qty), x.rate || x.text, none ? '—' : r2(x.area), x.u.ref || '']);
  }));
  const towers = sec.cols.map(c => T('מגדל {n}', { n: c.no }));
  const compare = [];
  let bads = 0;
  sec.rows.forEach(r => {
    const lines = R.hgaCheckFloor(r.fl, sh.basis, T).lines;
    if (!lines.length) compare.push([name(r.fl), '—', '—'].concat(sec.cols.map((c, k) => (r.cells[k] ? r.cells[k].area : '')), ['—', '—', '—']));
    lines.forEach(l => {
      if (!l.ok) bads++;
      const verdict = l.ok ? T('✓ תקין') : l.gap < 0 ? T('✗ חסר {n} מ"ר', { n: r2(-l.gap) }) : l.cgap < 0 ? T('✗ חסרים {n} מרחבים', { n: -l.cgap })
        : l.tooSmall.length ? T('✗ מרחב קטן מ-{n} מ"ר', { n: l.minEach }) : T('✗ מרחב גדול מ-{n} מ"ר', { n: l.maxEach });
      compare.push([name(r.fl), T(R.HGA_KINDS[l.kind]), l.reqArea].concat(
        sec.cols.map((c, k) => { const x = r.cells[k]; return !x || c.kind !== l.kind ? '' : x.size ? bad(x.area) : x.short ? { v: x.area, tone: 'warn' } : x.ok ? ok(x.area) : x.area; }),
        [mark(l.ok, l.area), r2(l.gap), mark(l.ok, verdict)]));
    });
  });
  const vent = sh.vent || { m2pp: 0.4, flow: 6 }, ventRows = [];
  s.resolved.forEach(f => f.spaces.forEach(x => {
    if (x.kind === 'mamad') return;
    const v = R.hgaVent(x, vent), sys = (x.systems || []).map(Number);
    ventRows.push([name(f), T('מגדל {n}', { n: s.towers.findIndex(t => t.id === x.tower) + 1 }), +x.area || 0, v.people, v.flow, sys.join(' + ') || '—', mark(v.ok, v.cap + ' / ' + v.people)]);
  }));
  return [
    { title: T('מגדלי מרחב מוגן — נדרש מול מוצע'), verdict: compare.length ? (bads ? bad(T('✗ {n} פערים מול הדרישה', { n: bads })) : ok(T('✓ התכנית עומדת בדרישות המיגון'))) : null,
      pairs: [[T('קומות מעל הקרקע (כולל קרקע)'), counts.above], [T('קומות מתחת לקרקע'), counts.below], [T('מספר מגדלים'), sec.cols.length]],
      tables: [{ head: [T('קומה'), T('סוג מרחב'), T('שטח נדרש')].concat(towers, [T('שטח מוצע'), T('פער (מ"ר)'), T('סטטוס')]), rows: compare }] },
    { title: T('קומות ושימושים'), tables: [{ head: [T('קומה'), T('שימוש'), T('כמות'), T('מקדם'), T('נדרש (מ"ר)'), T('סעיף בתקנות')], rows: useRows }] },
    { title: T('מערכות אוורור וסינון למרחב מוגן'), tables: ventRows.length ? [{ head: [T('קומה'), T('מרחב מוגן'), T('שטח'), T('משתמשים מעוגל'), T('ספיקת אוויר נדרשת'), T('מערכות נבחרות'), T('כיסוי')], rows: ventRows }] : [] },
  ];
}

function safetySections(sh, { R, T }) {
  const floors = R.safRenumber(sh.floors || []), chk = R.safCheck(Object.assign({}, sh, { floors })), sec = R.safSection(sh);
  const counts = R.safFloorCounts(floors), flights = sec.cols.map((c, k) => T('גרם {n}', { n: k + 1 }) + (c.prot ? ' (' + T('מוגן') + ')' : ''));
  const name = f => R.safFloorLabel(f, T);
  const sectionRows = sec.rows.map(r => {
    const none = !r.occ && !r.exits.length;
    return [name(r.fl), r.occ, none ? '—' : mark(r.exitsOk, r.exits.length + ' / ' + r.exitsNeed), r.exits.length ? r.exits.map(cm).join(' + ') : '—']
      .concat(r.cells.map(c => (!c ? '' : c.size ? bad(cm(c.w)) : c.short ? { v: cm(c.w), tone: 'warn' } : c.ok ? ok(cm(c.w)) : cm(c.w))));
  });
  const summary = chk.floors.slice().reverse().filter(o => o.f.occ > 0 || (o.fl.exits || []).length).map(o => {
    const line = k => o.lines.find(l => l.k === k), cnt = line('count'), sum = line('stairSum'), cr = line('corridor');
    return [name(o.fl), o.f.occ, mark(cnt.ok, cnt.have + ' / ' + cnt.need), sum ? mark(sum.ok, cm(sum.have) + ' / ' + cm(sum.need)) : '—',
      cr ? mark(cr.ok, cm(cr.have) + ' / ' + cm(cr.need)) : cm(o.f.corrReq), o.f.panic ? T('נדרש') : '—', o.bad ? bad(T('✗ {n}', { n: o.bad })) : ok('✓')];
  });
  const spaces = chk.floors.slice().reverse().filter(o => o.f.spaces.length).map(o => ({ title: name(o.fl),
    head: [T('מס\' חדר / אזור'), T('חלל / שימוש'), T('שטח / כמות'), T('אנשים'), T('רוחב מחושב (ס"מ)'), T('דלתות נדרשות'), T('דלתות מוצעות')],
    rows: o.f.spaces.map(({ sp, x }) => [[sp.no, sp.name].filter(Boolean).join(' ') || '—', x.u.n + ' · ' + T(x.u.name), x.u.none ? '—' : x.u.q ? (sp.qty == null ? '' : sp.qty) : (sp.area == null ? '' : sp.area), x.occ,
      x.occ ? cm(x.horiz) : '—', x.occ ? x.exits + ' × ' + cm(x.doorReq) : '—', sp.doors ? sp.doors + ' × ' + cm(sp.doorW) : '—']) }));
  return [
    { title: T('פרטי הבניין'), pairs: [
      [T('גובה הבניין'), T(R.SAF_HEIGHTS[sh.height || 'low'])], [T('בניין מגורים'), sh.residential ? '✓' : '—'], [T('מערכת מתזים'), sh.sprinklers !== false ? '✓' : '—'],
      [T('קומות מעל הקרקע (כולל קרקע)'), counts.above], [T('קומות מתחת לקרקע'), counts.below], [T('תפוסה בבניין'), T('{n} איש', { n: chk.occ })],
      sec.protNeed ? [T('גרמים מוגנים: {h} מסומנים, {n} נדרשים', { h: sec.protHave, n: sec.protNeed }), ''] : [T('גרמים מוגנים: {h}', { h: sec.protHave }), '']] },
    { title: T('חתך המבנה'), verdict: chk.bad ? bad(T('✗ {n} פערים מול הדרישה', { n: chk.bad })) : ok(T('✓ דרכי המוצא עומדות בדרישות')),
      tables: [{ head: [T('קומה'), T('תפוסה'), T('דרכי מוצא'), T('מוצאים בטוחים (ס"מ)')].concat(flights), rows: sectionRows }],
      notes: [T('דרכי מוצא: מוצע / נדרש. גרמי מדרגות: רוחב בס"מ.')] },
    { title: T('נדרש מול מוצע — סיכום קומות'), tables: [{ head: [T('קומה'), T('אנשים'), T('דרכי מוצא'), T('גרמי מדרגות (ס"מ)'), T('פרוזדור (ס"מ)'), T('בהלה'), T('פערים')], rows: summary,
      foot: [T('סה"כ בבניין'), chk.occ, '', '', '', '', ''] }], notes: [T('מוצע / נדרש')] },
    { title: T('חללים בקומה'), tables: spaces },
  ];
}

const BUILD = { parking: parkingSections, hlt: hltSections, hga: hgaSections, safety: safetySections };

/* ctx: { R, T, L (the page's label tables), project, dir } */
function reportFor(kind, sh, ctx) {
  const { T, L } = ctx, name = T(TITLES[kind]);
  const details = [[T('מספר בדיקה'), sh.no == null ? '' : sh.no], [T('תאריך'), fmtD(sh.date)], [T('בוצע ע"י'), sh.by || '—']];
  if (sh.title) details.push([T('כותרת / הערה'), sh.title]);
  if (sh.basis != null) details.push([T('בסיס החישוב'), T(L.BASES[sh.basis])]);
  return { kind, project: ctx.project || '', title: name, no: sh.no, dir: ctx.dir || 'rtl', details,
    sections: BUILD[kind](sh, ctx).filter(s => (s.tables || []).some(t => t.rows.length) || (s.pairs || []).length) };
}

const fileName = rep => LX.safeFileName([rep.project, rep.title, rep.no].filter(x => x != null && x !== '').join(' - '));

/* ── print layout ── */
const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const val = c => (c && typeof c === 'object' ? c.v : c);
const CSS = `@page{size:A4 portrait;margin:12mm}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{margin:0;background:#fff;color:#1e1f21;font:9.5pt/1.35 'Segoe UI',Arial,sans-serif}
header{border-bottom:2px solid #2563eb;padding-bottom:6px;margin-bottom:10px}
header small{display:block;color:#5f6368;font-size:9.5pt}
h1{font-size:17pt;margin:0}
.dl{display:flex;flex-wrap:wrap;gap:2px 18px;margin-top:5px;font-size:9pt}
.dl b{font-weight:600;color:#5f6368}
section{margin-top:12px}
h2{font-size:11pt;margin:0 0 6px;padding:5px 9px;background:#c5d6f8;border-radius:4px;break-after:avoid}
h3{font-size:9.5pt;margin:8px 0 3px;padding:3px 9px;background:#e6eefc;border-radius:3px;break-after:avoid}
table{width:100%;border-collapse:collapse;margin-bottom:6px;font-size:8.5pt}
thead{display:table-header-group}
tr{break-inside:avoid}
th{background:#edeef0;color:#3c4043;font-weight:600;padding:3px 5px;border:1px solid #d3d5d9;text-align:center}
td{padding:3px 5px;border:1px solid #e0e2e6;text-align:center;font-variant-numeric:tabular-nums}
td:first-child,th:first-child{text-align:start}
td small{display:block;color:#5f6368;font-size:7pt}
tfoot td{font-weight:700;background:#e8effc;white-space:nowrap}
.ok{background:#e7f6ec;color:#047857}.bad{background:#fdecec;color:#b91c1c;font-weight:600}.warn{box-shadow:inset 0 0 0 1px #dc2626}
.verdict{padding:4px 9px;border-radius:4px;font-weight:600;margin-bottom:6px}
.note{color:#5f6368;font-size:8pt;margin:2px 0}
.pairs{width:auto;min-width:60%}.pairs td{text-align:start}.pairs td:first-child{font-weight:600;background:#f6f7f8}`;

const cellHtml = c => {
  if (c && typeof c === 'object') return `<td${c.tone ? ` class="${c.tone}"` : ''}>${esc(c.v)}${c.sub ? `<small>${esc(c.sub)}</small>` : ''}</td>`;
  return typeof c === 'number' ? `<td dir="ltr">${esc(c)}</td>` : `<td>${esc(c)}</td>`;  // a minus sign stays beside its number
};
const tableHtml = t => {
  if (!t.rows.length) return '';
  return (t.title ? `<h3>${esc(t.title)}</h3>` : '') + '<table><thead><tr>' + t.head.map(x => `<th>${esc(x)}</th>`).join('') + '</tr></thead><tbody>'
    + t.rows.map(r => '<tr>' + r.map(cellHtml).join('') + '</tr>').join('') + '</tbody>'
    + (t.foot ? '<tfoot><tr>' + t.foot.map(cellHtml).join('') + '</tr></tfoot>' : '') + '</table>';
};
function toHtml(rep) {
  const body = rep.sections.map(s => '<section>' + `<h2>${esc(s.title)}</h2>`
    + (s.verdict ? `<div class="verdict ${s.verdict.tone}">${esc(s.verdict.v)}</div>` : '')
    + ((s.pairs || []).length ? '<table class="pairs"><tbody>' + s.pairs.map(p => `<tr><td>${esc(p[0])}</td><td>${esc(p[1])}</td></tr>`).join('') + '</tbody></table>' : '')
    + (s.tables || []).map(tableHtml).join('')
    + (s.notes || []).map(n => `<div class="note">${esc(n)}</div>`).join('') + '</section>').join('');
  return `<!doctype html><html lang="${rep.dir === 'rtl' ? 'he' : 'en'}" dir="${rep.dir}"><head><meta charset="utf-8"><title>${esc(fileName(rep))}</title><style>${CSS}</style></head><body>`
    + `<header>${rep.project ? `<small>${esc(rep.project)}</small>` : ''}<h1>${esc(rep.title)}</h1><div class="dl">`
    + rep.details.map(d => `<span><b>${esc(d[0])}:</b> ${esc(d[1])}</span>`).join('') + `</div></header>${body}</body></html>`;
}

/* ── Excel ── a workbook of one sheet */
const S = { plain: 0, title: 1, h2: 2, h3: 3, th: 4, td: 5, ok: 6, bad: 7, foot: 8, label: 9, verdictOk: 10, verdictBad: 11, warn: 12, note: 13, tdStart: 14 };
const xml = v => String(v == null ? '' : v).replace(/[^\u0009\u000a\u000d -퟿-�]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function grid(rep) {
  const rows = [], merges = [], push = (cells, opt) => { rows.push(Object.assign({ cells }, opt)); return rows.length; };
  const wide = rep.sections.reduce((a, s) => Math.max(a, ...(s.tables || []).map(t => t.head.length), 2), 2);
  const band = (text, style, ht) => { const n = push([{ v: text, s: style }].concat(Array.from({ length: wide - 1 }, () => ({ v: '', s: style }))), { ht }); merges.push(`A${n}:${LX.colName(wide - 1)}${n}`); };
  if (rep.project) band(rep.project, S.note);
  band(rep.title, S.title, 24);
  rep.details.forEach(d => push([{ v: d[0], s: S.label }, { v: d[1], s: S.plain }]));
  rep.sections.forEach(sec => {
    push([]);
    band(sec.title, S.h2, 19);
    if (sec.verdict) band(sec.verdict.v, sec.verdict.tone === 'ok' ? S.verdictOk : S.verdictBad);
    (sec.pairs || []).forEach(p => push([{ v: p[0], s: S.label }, { v: p[1], s: S.plain }]));
    (sec.tables || []).filter(t => t.rows.length).forEach(t => {
      if (t.title) band(t.title, S.h3);
      push(t.head.map(x => ({ v: x, s: S.th })), { repeat: true });
      t.rows.forEach(r => push(r.map((c, k) => ({ v: val(c), s: c && c.tone ? S[c.tone] : k === 0 ? S.tdStart : S.td }))));
      if (t.foot) push(t.foot.map(c => ({ v: val(c), s: S.foot })));
      push([]);
    });
    (sec.notes || []).forEach(n => band(n, S.note));
  });
  return { rows, merges, wide };
}
function sheetXml(rep) {
  const { rows, merges, wide } = grid(rep), widths = Array(wide).fill(8);
  rows.forEach(r => { if (r.ht) return; r.cells.forEach((c, k) => { if (k < wide) widths[k] = Math.min(34, Math.max(widths[k], String(c.v == null ? '' : c.v).length * 1.05 + 2)); }); });
  const cell = (c, x, y) => {
    const ref = LX.colName(x) + y;
    if (c.v === '' || c.v == null) return `<c r="${ref}" s="${c.s}"/>`;
    if (typeof c.v === 'number' && isFinite(c.v)) return `<c r="${ref}" s="${c.s}"><v>${c.v}</v></c>`;
    return `<c r="${ref}" s="${c.s}" t="inlineStr"><is><t xml:space="preserve">${xml(c.v)}</t></is></c>`;
  };
  const body = rows.map((r, i) => `<row r="${i + 1}"${r.ht ? ` ht="${r.ht}" customHeight="1"` : ''}>${r.cells.map((c, x) => cell(c, x, i + 1)).join('')}</row>`).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>'
    + `<sheetViews><sheetView workbookViewId="0" showGridLines="0"${rep.dir === 'rtl' ? ' rightToLeft="1"' : ''}/></sheetViews><sheetFormatPr defaultRowHeight="15"/>`
    + '<cols>' + widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.round(w * 10) / 10}" customWidth="1"/>`).join('') + '</cols>'
    + `<sheetData>${body}</sheetData>`
    + (merges.length ? `<mergeCells count="${merges.length}">${merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '')
    + '<printOptions horizontalCentered="1"/><pageMargins left="0.45" right="0.45" top="0.5" bottom="0.5" header="0.25" footer="0.25"/>'
    + '<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/></worksheet>';
}
const STYLES = (() => {
  const fills = ['none', 'gray125', 'FFC5D6F8', 'FFE6EEFC', 'FFEDEEF0', 'FFE7F6EC', 'FFFDECEC', 'FFE8EFFC', 'FFF6F7F8'];
  const fonts = ['<font><sz val="10"/><name val="Arial"/></font>', '<font><b/><sz val="15"/><name val="Arial"/></font>', '<font><b/><sz val="11"/><name val="Arial"/></font>', '<font><b/><sz val="10"/><name val="Arial"/></font>',
    '<font><sz val="10"/><color rgb="FF047857"/><name val="Arial"/></font>', '<font><b/><sz val="10"/><color rgb="FFB91C1C"/><name val="Arial"/></font>', '<font><sz val="9"/><color rgb="FF5F6368"/><name val="Arial"/></font>'];
  const line = c => `<left style="thin"><color rgb="${c}"/></left><right style="thin"><color rgb="${c}"/></right><top style="thin"><color rgb="${c}"/></top><bottom style="thin"><color rgb="${c}"/></bottom><diagonal/>`;
  const borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>', `<border>${line('FFD3D5D9')}</border>`, `<border>${line('FFDC2626')}</border>`];
  // font, fill, border, horizontal
  const xfs = [[0, 0, 0, 'start'], [1, 0, 0, 'start'], [2, 2, 0, 'start'], [3, 3, 0, 'start'], [3, 4, 1, 'center'], [0, 0, 1, 'center'], [4, 5, 1, 'center'], [5, 6, 1, 'center'], [3, 7, 1, 'center'], [3, 8, 0, 'start'],
    [4, 5, 0, 'start'], [5, 6, 0, 'start'], [0, 0, 2, 'center'], [6, 0, 0, 'start'], [0, 0, 1, 'start']];
  const align = a => (a === 'start' ? '' : ` horizontal="${a}"`);
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + `<fonts count="${fonts.length}">${fonts.join('')}</fonts>`
    + `<fills count="${fills.length}">${fills.map(f => (f.length < 8 ? `<fill><patternFill patternType="${f}"/></fill>` : `<fill><patternFill patternType="solid"><fgColor rgb="${f}"/></patternFill></fill>`)).join('')}</fills>`
    + `<borders count="${borders.length}">${borders.join('')}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>`
    + `<cellXfs count="${xfs.length}">${xfs.map(([f, g, b, a]) => `<xf numFmtId="0" fontId="${f}" fillId="${g}" borderId="${b}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"${align(a)}/></xf>`).join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
})();

function toXlsx(rep) {
  const sheetName = rep.title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
  return LX.zip([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="${xml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml', STYLES],
    ['xl/worksheets/sheet1.xml', sheetXml(rep)],
  ].map(([name, data]) => ({ name, data })));
}

const api = { reportFor, toHtml, toXlsx, fileName };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.CalcExport = api;
})(typeof window !== 'undefined' ? window : this);
