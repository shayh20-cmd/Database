/* Calculators (מחשבונים): a project page of regulatory checks — parking and הל"ת today, הג"א and
   fire safety later. Each calculator keeps numbered, dated checks in the project document under
   data.calculators.<key>.sheets; the summary tab shows the check ticked on its tab
   (data.calculators.<key>.pick), or the latest when none is.
   Loaded after calc-rules.js; the page reaches it as window.CalculatorsUI.
   Design: docs/superpowers/specs/2026-11-01-calculators-design.md */
(function () {
  'use strict';
  const R = window.CalcRules;
  if (!R || typeof React === 'undefined') return;
  const h = React.createElement;
  const { useState, useEffect, useRef } = React;
  const T = (s, v) => (window.I18N && window.I18N.t ? window.I18N.t(s, v) : R.fill(s, v));
  const uid = () => Math.random().toString(36).slice(2, 9);
  const today = () => new Date().toISOString().slice(0, 10);
  const fmtD = d => (d || '').split('-').reverse().join('/');
  const SKIP = { 'data-i18n-skip': '' };
  const LTR = n => h('span', { dir: 'ltr', className: 'cx-ltr' }, n);
  const sgn = n => LTR((n > 0 ? '+' : '') + n);

  const css = document.createElement('style');
  css.textContent = [
    '.cx{flex:1;display:flex;flex-direction:column;min-height:0;background:var(--bg)}',
    '.cx-top{background:var(--surface);border-bottom:1px solid var(--border);padding:12px 20px 0}',
    '.cx-top.emb{padding-top:4px;background:var(--surface-2)}',
    '.cx-top h1{font-size:18px;font-weight:700;margin:0 0 8px}',
    '.cx-tabs{display:flex;gap:2px;overflow-x:auto}',
    '.cx-tab{border:none;background:none;padding:8px 13px;cursor:pointer;color:var(--text-2);font:inherit;font-weight:500;border-bottom:2px solid transparent;display:flex;align-items:center;gap:6px;white-space:nowrap}',
    '.cx-tab.on{color:var(--accent);border-bottom-color:var(--accent);font-weight:600}',
    '.cx-tab .cx-pill{font-size:10px;background:var(--bg);color:var(--text-3);border-radius:10px;padding:0 6px}',
    '.cx-body{flex:1;overflow:auto;padding:18px 20px}',
    '.cx-sheets{display:flex;align-items:flex-end;gap:2px;background:var(--surface-2);border-top:1px solid var(--border);padding:0 14px;min-height:36px;overflow-x:auto}',
    '.cx-sheet{border:1px solid var(--border);border-top:none;background:var(--bg);padding:6px 12px;border-radius:0 0 8px 8px;cursor:pointer;color:var(--text-2);font-size:12px;display:flex;gap:6px;align-items:center;white-space:nowrap}',
    '.cx-sheet.on{background:var(--surface);color:var(--text);box-shadow:inset 0 2px 0 var(--accent)}',
    '.cx-sheet .cx-dt{color:var(--text-3);font-size:11px}',
    '.cx-sheet .cx-pick{margin:0;cursor:pointer;accent-color:var(--accent)}',
    '.cx-sheet-x{border:none;background:none;color:var(--text-3);cursor:pointer;font-size:13px;padding:0 2px}',
    '.cx-sheet-x.arm{color:#DC2626;font-weight:700;font-size:11px}',
    '.cx-add{border:1px dashed var(--border-strong);background:none;border-top:none;border-radius:0 0 8px 8px;padding:6px 12px;cursor:pointer;color:var(--accent);font:inherit;font-size:12px;font-weight:600;white-space:nowrap}',
    '.cx-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg,12px);margin-bottom:14px;overflow:hidden}',
    '.cx-card-h{display:flex;align-items:center;gap:8px;padding:10px 16px;border-bottom:1px solid var(--border);font-weight:600;flex-wrap:wrap}',
    '.cx-num{width:20px;height:20px;border-radius:50%;background:rgba(37,99,235,.1);color:var(--accent);display:grid;place-items:center;font-size:11px;flex:none}',
    '.cx-sp{flex:1}',
    '.cx-card-b{padding:14px 16px}',
    '.cx-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}',
    '@media (max-width:900px){.cx-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}',
    '.cx-f{display:flex;flex-direction:column;gap:4px;color:var(--text-3);font-size:11.5px;font-weight:500}',
    '.cx-in{border:1px solid var(--border-strong);border-radius:var(--radius-sm,6px);padding:6px 9px;background:var(--surface);color:var(--text);font:inherit;font-size:13px;width:100%;box-sizing:border-box}',
    '.cx-in:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px rgba(37,99,235,.12)}',
    '.cx-in.cx-n{width:84px}',
    '.cx-btn{border:1px solid var(--border-strong);background:var(--surface);color:var(--text);border-radius:var(--radius-sm,6px);padding:6px 12px;cursor:pointer;font:inherit;font-size:12.5px;font-weight:500;white-space:nowrap}',
    '.cx-btn:hover{background:var(--bg)}',
    '.cx-btn.pri{background:var(--accent);border-color:var(--accent);color:#fff}',
    '.cx-hint{color:var(--text-3);font-size:11.5px}',
    '.cx-seg{display:inline-flex;border:1px solid var(--border-strong);border-radius:8px;padding:2px;background:var(--surface-2)}',
    '.cx-seg button{border:none;background:none;padding:5px 13px;border-radius:6px;cursor:pointer;color:var(--text-2);font:inherit;font-weight:500}',
    '.cx-seg button.on{background:var(--accent);color:#fff;font-weight:600}',
    '.cx-basis{display:flex;align-items:center;gap:12px;margin-top:14px;padding-top:12px;border-top:1px dashed var(--border);flex-wrap:wrap}',
    '.cx-zones{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}',
    '.cx-zone{flex:1;min-width:140px;border:1.5px solid var(--border);border-radius:8px;padding:8px 11px;cursor:pointer;background:var(--surface);text-align:start;font:inherit;color:var(--text)}',
    '.cx-zone b{display:block;font-size:13px}.cx-zone span{color:var(--text-3);font-size:11px}',
    '.cx-zone.on{border-color:var(--accent);background:rgba(37,99,235,.07)}',
    '.cx-st-wrap{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:16px;align-items:start}',
    '@media (max-width:900px){.cx-st-wrap{grid-template-columns:1fr}}',
    '.cx-st-list{border:1px solid var(--border);border-radius:8px;max-height:230px;overflow-y:auto}',
    '.cx-st-head{display:flex;justify-content:space-between;background:var(--surface-2);padding:6px 10px;font-size:11px;color:var(--text-3);font-weight:600;border-bottom:1px solid var(--border);position:sticky;top:0}',
    '.cx-st{display:flex;align-items:center;gap:10px;padding:7px 10px;border-bottom:1px solid var(--border);cursor:pointer}',
    '.cx-st:last-child{border-bottom:none}.cx-st:hover{background:var(--bg)}',
    '.cx-st.on{background:rgba(37,99,235,.07);box-shadow:inset 3px 0 0 var(--accent)}',
    '.cx-st-d{font-weight:700;width:56px;font-variant-numeric:tabular-nums}',
    '.cx-st-n{flex:1;display:flex;flex-direction:column}.cx-st-n span{color:var(--text-3);font-size:11px}',
    '.cx-tag{font-size:10.5px;border-radius:10px;padding:1px 7px;background:var(--bg);color:var(--text-2);white-space:nowrap}',
    '.cx-tag.warn{background:rgba(217,119,6,.12);color:#B45309}',
    '.cx-bar{position:relative;display:flex;height:32px;margin-top:30px}',
    '.cx-seg-a,.cx-seg-b,.cx-seg-c{display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--text-2);font-weight:600}',
    '.cx-seg-a{background:rgba(22,163,74,.16);width:37.5%;border-start-start-radius:8px;border-end-start-radius:8px}',
    '.cx-seg-b{background:rgba(217,119,6,.16);width:37.5%}',
    '.cx-seg-c{background:var(--bg);width:25%;border-start-end-radius:8px;border-end-end-radius:8px}',
    '.cx-pin{position:absolute;top:-6px;bottom:-6px;width:2px;background:var(--accent)}',
    '.cx-pin span{position:absolute;top:-22px;inset-inline-start:-20px;background:var(--accent);color:#fff;font-size:11px;font-weight:700;border-radius:5px;padding:1px 6px;white-space:nowrap}',
    '.cx-cap{margin-top:12px;color:var(--text-2);font-size:12px}',
    '.cx-t{width:100%;border-collapse:collapse}',
    '.cx-t th{font-size:11px;color:var(--text-3);font-weight:600;text-align:start;padding:7px 8px;border-bottom:1px solid var(--border);background:var(--surface-2)}',
    '.cx-t td{padding:6px 8px;border-bottom:1px solid var(--border);vertical-align:middle;font-size:12.5px}',
    '.cx-t tfoot td{font-weight:700;background:var(--surface-2);border-bottom:none}',
    '.cx-t td.n{font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap}',
    '.cx-t.c th,.cx-t.c td{text-align:center}.cx-t.c td.gl{text-align:start;font-weight:600;white-space:nowrap}',
    '.cx-t.c td b{font-size:15px}',
    '.cx-rule{color:var(--text-3);font-size:11px}',
    '.cx-x{border:none;background:none;color:var(--text-3);cursor:pointer;font-size:15px}',
    '.cx-qty{display:flex;align-items:center;gap:6px}',
    '.cx-kpis{display:flex;gap:12px;flex-wrap:wrap}',
    '.cx-kpi{flex:1;min-width:150px;border-radius:8px;padding:11px 14px;background:var(--surface-2);border:1px solid var(--border)}',
    '.cx-kpi.main{background:rgba(37,99,235,.07);border-color:transparent}',
    '.cx-kpi .l{color:var(--text-2);font-size:11.5px}',
    '.cx-kpi .v{font-size:24px;font-weight:800;line-height:1.25;font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.cx-kpi.main .v{color:var(--accent)}.cx-kpi .v.mute{color:var(--text-3);font-size:18px}',
    '.cx-kpi .s{color:var(--text-3);font-size:11px}',
    '.cx-cite{border-inline-start:3px solid var(--accent);background:var(--surface-2);padding:7px 12px;border-radius:4px;color:var(--text-2);font-size:12px;margin-top:8px}',
    '.cx-warn{border-inline-start:3px solid #D97706;background:rgba(217,119,6,.08);padding:7px 12px;border-radius:4px;font-size:12px;margin-top:8px}',
    '.cx-blk{border:1px solid var(--border);border-radius:8px;margin-bottom:12px;overflow:hidden}',
    '.cx-blk-h{display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--surface-2);border-bottom:1px solid var(--border);flex-wrap:wrap}',
    '.cx-ref{font-size:11px;font-weight:700;color:var(--accent);background:rgba(37,99,235,.08);border-radius:5px;padding:1px 7px}',
    '.cx-t tr.bld td{background:var(--surface-2)}',
    '.cx-notes{padding:6px 12px 10px}.cx-notes summary{cursor:pointer;color:var(--accent);font-size:12px;font-weight:500}',
    '.cx-scroll{overflow-x:auto}',
    '.cx-plan th.sub{font-weight:500;font-size:10.5px}',
    '.cx-plan th,.cx-plan td{padding:5px 4px}',
    '.cx-plan .cx-in{width:52px;text-align:center;padding:4px}',
    '.cx-plan .cx-in.fl{width:90px;text-align:start;font-weight:600}',
    '.cx-plan tfoot tr.req td{background:rgba(37,99,235,.07)}',
    '.cx-ok{color:#16A34A}.cx-bad{color:#DC2626}',
    '.cx-verdict{border-radius:8px;padding:9px 12px;font-weight:700;margin-bottom:10px}',
    '.cx-verdict.ok{background:rgba(22,163,74,.1);color:#16A34A}.cx-verdict.bad{background:var(--danger-bg,#FEF2F2);color:#DC2626}',
    '.cx-t tr.bad td{background:var(--danger-row,#FFF5F5)}',
    '.cx-p-ok,.cx-p-bad{border-radius:10px;padding:1px 8px;font-size:11.5px;font-weight:600;white-space:nowrap}',
    '.cx-p-ok{background:rgba(22,163,74,.12);color:#16A34A}.cx-p-bad{background:rgba(220,38,38,.12);color:#DC2626}',
    '.cx-sum{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}',
    '@media (max-width:900px){.cx-sum{grid-template-columns:1fr}}',
    '.cx-sc{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 16px;cursor:pointer;text-align:start;font:inherit;color:var(--text)}',
    '.cx-sc:hover{border-color:var(--accent)}',
    '.cx-sc-h{display:flex;align-items:center;gap:8px;margin-bottom:10px}',
    '.cx-sc-h .ic{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;font-size:15px;background:var(--bg)}',
    '.cx-sc-h b{font-size:14px}.cx-sc-h .m{color:var(--text-3);font-size:11px}',
    '.cx-sc-h .bdg{margin-inline-start:auto;font-size:11px;border-radius:10px;padding:1px 8px;background:var(--bg);color:var(--text-3)}',
    '.cx-sc-k{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px}',
    '.cx-sc-k div{background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:6px 8px;display:flex;flex-direction:column}',
    '.cx-sc-k span{font-size:11px;color:var(--text-3)}.cx-sc-k b{font-size:16px;white-space:nowrap;font-variant-numeric:tabular-nums}',
    '.cx-sc-r{display:flex;justify-content:space-between;gap:10px;color:var(--text-2);font-size:12.5px;padding:2px 0}',
    '.cx-sc-r b{color:var(--text)}',
    '.cx-gaps{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}',
    '.cx-gaps span{font-size:11px;background:rgba(220,38,38,.08);color:#B91C1C;border-radius:6px;padding:1px 7px}',
    '.cx-empty{text-align:center;padding:40px 20px;color:var(--text-3)}',
    '.cx-hga{display:grid;grid-template-columns:1fr;gap:12px;padding:10px 12px}',
    '@media (min-width:1500px){.cx-hga{grid-template-columns:minmax(0,1.6fr) minmax(0,1fr)}}',
    '.cx-hga select.cx-in{min-width:120px}',
    '.cx-hga td .cx-rule{white-space:nowrap}',
    '.cx-sub{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;font-size:12.5px}',
    '.cx-line{font-size:12.5px;color:var(--text-2);padding:3px 0}',
    '.cx-sys{display:flex;flex-wrap:wrap;gap:4px;align-items:center;justify-content:center}',
    '.cx-chip{display:inline-flex;align-items:center;gap:2px;background:rgba(37,99,235,.1);color:var(--accent);border-radius:10px;padding:1px 4px 1px 8px;font-weight:700;font-size:12px}',
    '.cx-chip button{border:none;background:none;color:inherit;cursor:pointer;font-size:12px;padding:0 3px}',
    '.cx-in.cx-addsys{width:auto;padding:2px 6px;font-size:12px}',
    '.cx-blk-h .cx-p-ok,.cx-blk-h .cx-p-bad{font-size:11px}',
    '.cx-saf th.sub{font-weight:500;font-size:10.5px}',
    '.cx-saf td,.cx-saf th{padding:5px 5px}',
    '.cx-saf tr.tot td{background:var(--surface-2);font-weight:600}',
    '.cx-chips{display:flex;flex-wrap:wrap;gap:4px 6px;align-items:center;justify-content:center;min-width:280px}',
    '.cx-chip{display:inline-flex;align-items:center;gap:0}',
    '.cx-chip .cx-x{padding:0 3px;border:0;background:none}',
    '.cx-in.cx-in-bad{border-color:#dc2626}',
    '.cx-req{background:var(--surface-2);border-top:1px solid var(--border);border-bottom:1px solid var(--border);font-size:12.5px;color:var(--text-2);display:flex;flex-direction:column;gap:3px;padding:8px 12px}',
    '.cx-req b{color:var(--text)}',
    'td.cx-bad .cx-in{border-color:#DC2626}',
    '.cx-empty .ic{font-size:32px}',
  ].join('\n');
  document.head.appendChild(css);

  /* inputs that save on blur or Enter, so typing does not write the document each keystroke */
  function Field({ value, onSave, type, className, placeholder, skip, min, max, style, title }) {
    const [v, setV] = useState(value == null ? '' : String(value));
    useEffect(() => { setV(value == null ? '' : String(value)); }, [value]);
    const commit = () => {
      const out = type === 'number' ? (v === '' ? null : +v) : v;
      if (String(out == null ? '' : out) !== String(value == null ? '' : value)) onSave(out);
    };
    return h('input', Object.assign({ className: 'cx-in ' + (className || ''), type: type || 'text', step: type === 'number' ? 'any' : undefined, value: v, placeholder, min, max, style, title,
      onChange: e => setV(e.target.value), onBlur: commit, onKeyDown: e => { if (e.key === 'Enter') e.currentTarget.blur(); } }, skip ? SKIP : {}));
  }
  const Card = (n, title, extra, body) => h('div', { className: 'cx-card' },
    h('div', { className: 'cx-card-h' }, h('span', { className: 'cx-num' }, n), title, h('span', { className: 'cx-sp' }), extra), body);

  const CALCS = [
    { id: 'summary', name: 'סיכום', ic: 'Σ' },
    { id: 'parking', name: 'תנועה וחניה', ic: '🅿' },
    { id: 'hlt', name: 'הל"ת', ic: '🚻' },
    { id: 'hga', name: 'הג"א', ic: '🛡' },
    { id: 'safety', name: 'בטיחות', ic: '🔥' },
  ];
  const ZONE_INFO = { A: ["אזור א'", 'עד 300 מ\' מציר מתע"ן'], B: ["אזור ב'", '300–600 מ\' מציר מתע"ן'], C: ["אזור ג'", 'יישוב עם תכנית מתע"ן'], N: ['ללא מתע"ן', 'יישוב בלא מתע"ן'] };
  const BASES = { main: 'שטח עיקרי (היתר בחלוקה)', total: 'שטח כולל' };
  const G_LABEL = { m: 'גברים', w: 'נשים', u: 'דו-תכליתי', shared: 'משותף (גברים ונשים)' };
  const PCOL_LABEL = { m: 'גברים', w: 'נשים', x: 'משותף' };

  /* ── sheets ── */
  function newSheet(kind, prev, me) {
    const base = prev ? JSON.parse(JSON.stringify(prev)) : kind === 'parking'
      ? { basis: 'main', zone: 'N', far: 100, rows: [] }
      : kind === 'hga' ? { basis: 'main', vent: { m2pp: 0.4, flow: 6 }, floors: [{ name: T('קומת קרקע'), uses: [], spaces: [] }] }
      : kind === 'safety' ? { height: 'low', residential: false, sprinklers: true, floors: [{ name: T('קומת קרקע'), level: 0, corridor: 'res', spaces: [], exits: [] }] }
      : { rows: [], plan: { floors: [0, 1, 2].map(i => ({ name: i === 0 ? T('קומת קרקע') : T('קומה {n}', { n: i }), fx: {} })) } };
    base.id = uid(); base.no = prev ? (+prev.no || 0) + 1 : 1; base.date = today(); base.by = me || ''; base.title = '';
    (base.rows || []).forEach(r => { r.id = uid(); });
    if (base.plan) base.plan.floors.forEach(f => { f.id = uid(); });
    (base.floors || []).forEach(f => { f.id = uid(); ['uses', 'spaces', 'exits'].forEach(k => (f[k] || []).forEach(x => { x.id = uid(); })); });
    return base;
  }
  // the check the summary shows: the one ticked on its tab, else the latest
  const pickedSheet = c => { const s = (c && c.sheets) || []; return s.find(x => x.id === c.pick) || s[s.length - 1]; };
  function SheetBar({ sheets, active, setActive, onAdd, onDelete, picked, onPick }) {
    const [arm, setArm] = useState(null);
    return h('div', { className: 'cx-sheets' },
      sheets.map(s => h('div', { key: s.id, className: 'cx-sheet' + (s.id === active ? ' on' : ''), onClick: () => setActive(s.id) },
        onPick && h('input', { type: 'checkbox', className: 'cx-pick', checked: s.id === picked, title: T('החלופה שמוצגת בסיכום'),
          onClick: e => e.stopPropagation(), onChange: () => { if (s.id !== picked) onPick(s.id); } }),
        h('b', null, T('בדיקה {n}', { n: s.no })), h('span', { className: 'cx-dt' }, fmtD(s.date)),
        s.id === active && h('button', { className: 'cx-sheet-x' + (arm === s.id ? ' arm' : ''), title: 'מחיקת הבדיקה',
          onClick: e => { e.stopPropagation(); if (arm === s.id) { setArm(null); onDelete(s.id); } else setArm(s.id); },
          onMouseLeave: () => setArm(null) }, arm === s.id ? 'למחוק?' : '×'))),
      h('button', { className: 'cx-add', onClick: onAdd, title: 'בדיקה חדשה — מעתיקה את האחרונה' }, '+ בדיקה נוספת'));
  }
  function SheetHead(n, sh, upd, hints) {
    return Card(n, 'פרטי הבדיקה', null, h('div', { className: 'cx-card-b' },
      h('div', { className: 'cx-grid' },
        h('label', { className: 'cx-f' }, 'מספר בדיקה', h(Field, { type: 'number', value: sh.no, onSave: v => upd({ no: v }) })),
        h('label', { className: 'cx-f' }, 'תאריך', h(Field, { type: 'date', value: sh.date, onSave: v => upd({ date: v }) })),
        h('label', { className: 'cx-f' }, 'בוצע ע"י', h(Field, { value: sh.by, skip: true, onSave: v => upd({ by: v }) })),
        h('label', { className: 'cx-f' }, 'כותרת / הערה', h(Field, { value: sh.title, skip: true, onSave: v => upd({ title: v }) }))),
      sh.basis != null && h('div', { className: 'cx-basis' },
        h('b', null, 'בסיס החישוב'),
        h('div', { className: 'cx-seg' }, Object.keys(BASES).map(k => h('button', { key: k, className: sh.basis === k ? 'on' : '', onClick: () => upd({ basis: k }) }, BASES[k]))),
        h('span', { className: 'cx-hint', style: { flex: 1, minWidth: 220 } }, hints ? hints[sh.basis === 'total' ? 1 : 0] : sh.basis === 'total'
          ? '"היתר בשטח כולל" — שטחי הבנייה חושבו בשטח הכולל המותר ללא חלוקה לעיקרי ושירות (תקנה 1). התקן לפי טבלאות ה-א (2א, 3א, 4א…).'
          : 'החישוב לפי השטחים העיקריים המבוקשים בהיתר; שטחי שירות אינם נכללים.'))));
  }

  /* ════════ Parking ════════ */
  function ParkingTab({ sh, upd, prev }) {
    const [busy, setBusy] = useState(false), [msg, setMsg] = useState('');
    const addrRef = useRef(null);
    const t = R.parkingTotals(sh), tN = R.parkingTotals(sh, 'N');
    const st = sh.st != null && sh.stations ? sh.stations[sh.st] : null;
    const setRows = rows => upd({ rows });
    const setRow = (i, patch) => setRows(sh.rows.map((r, j) => j === i ? Object.assign({}, r, patch) : r));
    const find = async () => {
      const addr = (addrRef.current && addrRef.current.value || '').trim(); if (!addr) return;
      setBusy(true); setMsg('');
      try {
        const res = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=he&q=' + encodeURIComponent(addr + ', ישראל'));
        const d = await res.json();
        if (!d.length) { setMsg(T('הכתובת לא נמצאה — בחרו אזור ידנית')); upd({ addr }); return; }
        const loc = { lat: +d[0].lat, lng: +d[0].lon }, stations = R.stationsNear(loc.lat, loc.lng);
        upd(stations.length ? { addr, loc, stations, st: 0, zone: R.zoneForStation(stations[0]), manual: false }
          : { addr, loc, stations, st: null, zone: 'N', manual: false });
      } catch (e) { setMsg(T('שגיאת תקשורת — בחרו אזור ידנית')); }
      finally { setBusy(false); }
    };
    const pick = i => upd({ st: i, zone: R.zoneForStation(sh.stations[i]), manual: false });
    const setZone = z => upd({ zone: z, manual: !(st && R.zoneForStation(st) === z) });
    const areaLbl = sh.basis === 'total' ? 'שטח כולל (מ"ר)' : 'שטח עיקרי (מ"ר)';
    const usesFar = sh.zone === 'N' && sh.rows.some(r => { const u = R.useById(r.type); return u && R.ruleSet(u, sh.basis).far; });

    const zoneCard = Card(2, 'מרחק ממתע"ן ואזור חניה',
      h(React.Fragment, null,
        h('input', Object.assign({ ref: addrRef, className: 'cx-in', style: { width: 250 }, placeholder: T('כתובת הפרויקט'), defaultValue: sh.addr || '', key: sh.id,
          onKeyDown: e => { if (e.key === 'Enter') find(); } }, SKIP)),
        h('button', { className: 'cx-btn', onClick: find, disabled: busy }, busy ? '…' : '🔍 אתר תחנות')),
      h('div', { className: 'cx-card-b' },
        msg && h('div', { className: 'cx-warn', style: { marginTop: 0, marginBottom: 10 } }, msg),
        h('div', { className: 'cx-st-wrap' },
          h('div', { className: 'cx-st-list' },
            h('div', { className: 'cx-st-head' }, h('span', null, "תחנות בטווח 800 מ'"), sh.loc && LTR(`${sh.loc.lat.toFixed(4)}, ${sh.loc.lng.toFixed(4)}`)),
            sh.stations && sh.stations.length ? sh.stations.map((s, i) => h('div', { key: i, className: 'cx-st' + (sh.st === i ? ' on' : ''), onClick: () => pick(i) },
              h('span', { className: 'cx-st-d', style: { color: s.d <= 300 ? '#16A34A' : s.d <= 600 ? '#D97706' : 'var(--text-3)' } }, T("{n} מ'", { n: s.d })),
              h('span', Object.assign({ className: 'cx-st-n' }, SKIP), h('b', null, s.name), h('span', null, s.type)),
              s.planned && h('span', { className: 'cx-tag warn' }, '⏳ עתידית'),
              h('span', { className: 'cx-tag' }, ZONE_INFO[R.zoneForStation(Object.assign({}, s, { planned: false }))][0])))
              : h('div', { className: 'cx-hint', style: { padding: 12 } }, sh.stations ? 'לא נמצאו תחנות מתע"ן בטווח 800 מ\' — בחרו אזור ידנית' : 'הזינו כתובת ולחצו "אתר תחנות"')),
          h('div', null, st ? h(React.Fragment, null,
            h('div', { className: 'cx-bar' }, h('div', { className: 'cx-seg-a' }, "א' · 300"), h('div', { className: 'cx-seg-b' }, "ב' · 600"), h('div', { className: 'cx-seg-c' }, "ג'"),
              h('div', { className: 'cx-pin', style: { insetInlineStart: Math.min(st.d / 800, 1) * 100 + '%' } }, h('span', null, T("{n} מ'", { n: st.d })))),
            h('div', { className: 'cx-cap' }, T('המרחק מ{s} → {z}', { s: '⁨' + st.name + '⁩', z: T(ZONE_INFO[sh.zone][0]) }),
              sh.manual && h('span', { className: 'cx-tag', style: { marginInlineStart: 6 } }, 'נקבע ידנית')))
            : h('div', { className: 'cx-cap' }, 'לא נבחרה תחנה'))),
        h('div', { className: 'cx-zones' }, R.ZONES.map(z => h('button', { key: z, className: 'cx-zone' + (sh.zone === z ? ' on' : ''), onClick: () => setZone(z) },
          h('b', null, ZONE_INFO[z][0]), h('span', null, ZONE_INFO[z][1])))),
        usesFar && h('div', { className: 'cx-basis' },
          h('label', { className: 'cx-f', style: { width: 210 } }, 'אחוזי זכויות הבנייה בתכנית (%)', h(Field, { type: 'number', value: sh.far, onSave: v => upd({ far: v }) })),
          h('span', { className: 'cx-hint', style: { flex: 1 } }, 'ביישוב בלא מתע"ן התקן למסחר, משרדים ותעשייה נקבע לפי אחוזי הבנייה (2.5–2.6, 3.2–3.3, 4.2–4.3).'))));

    const opts = Object.keys(R.CATS).map(k => h('optgroup', { key: k, label: T(R.CATS[k]) },
      R.USES.filter(u => u.cat === k).map(u => h('option', { key: u.id, value: u.id }, u.id.replace(/[sa]$/, '') + ' ' + T(u.name)))));
    const usesCard = Card(3, 'שימושים בפרויקט', h('button', { className: 'cx-btn pri', onClick: () => setRows(sh.rows.concat([{ id: uid(), type: '1.2', qty: 0 }])) }, '+ שימוש'),
      h('div', { className: 'cx-scroll' }, h('table', { className: 'cx-t' },
        h('thead', null, h('tr', null, ['שימוש הקרקע (חלק ב\' לתוספת)', 'כמות', 'תקן', 'סעיף בתקנות', 'רכב', 'אופניים', 'אופנועים', ''].map((x, i) => h('th', { key: i, style: i === 0 ? { width: '34%' } : null }, x)))),
        h('tbody', null, sh.rows.length ? sh.rows.map((r, i) => {
          const u = R.useById(r.type), c = R.carRow(r, sh, T), b = R.bikeRow(r, sh), m = R.motoRow(r, sh);
          return h('tr', { key: r.id || i },
            h('td', null, h('select', { className: 'cx-in', value: r.type, onChange: e => setRow(i, { type: e.target.value }) }, opts)),
            h('td', null, h('div', { className: 'cx-qty' }, h(Field, { type: 'number', className: 'cx-n', value: r.qty, onSave: v => setRow(i, { qty: v }) }),
              h('span', { className: 'cx-rule' }, u ? (u.m === 'area' ? areaLbl : R.MEASURES[u.m]) : '')),
              b && b.c.need === 'students' && h('div', { className: 'cx-qty', style: { marginTop: 4 } },
                h(Field, { type: 'number', className: 'cx-n', value: r.students, placeholder: '—', onSave: v => setRow(i, { students: v }) }), h('span', { className: 'cx-rule' }, 'תלמידים (לאופניים)'))),
            h('td', null, c && c.parts.map((p, j) => h('div', { key: j, className: 'cx-rule' }, p.label && h('b', null, p.label + ': '), p.text))),
            h('td', { className: 'cx-rule' }, c ? c.refs.join(', ') : ''),
            h('td', { className: 'n' }, c ? R.span(c.min, c.max, c.noMin, c.noMax, T) : '—'),
            h('td', { className: 'n' }, b ? (b.n == null ? h('span', { className: 'cx-rule', title: T('נדרש מספר תלמידים') }, '?') : b.n) : '—'),
            h('td', { className: 'n' }, m ? (m.na ? h('span', { className: 'cx-rule', title: T('חל מ-11 יח"ד') }, '0') : R.span(m.min, m.max, false, false, T)) : '—'),
            h('td', null, h('button', { className: 'cx-x', title: 'הסרה', onClick: () => setRows(sh.rows.filter((_, j) => j !== i)) }, '×')));
        }) : h('tr', null, h('td', { colSpan: 8, className: 'cx-hint', style: { textAlign: 'center', padding: 16 } }, 'הוסיפו את השימושים המבוקשים בפרויקט'))),
        h('tfoot', null, h('tr', null, h('td', { colSpan: 4 }, 'סה"כ (כל חלק של מקום מעוגל כלפי מעלה, לכל שימוש — חלק א\' סעיף 6)'),
          h('td', { className: 'n' }, R.span(t.min, t.max, t.noMin, t.noMax, T)), h('td', { className: 'n' }, t.bikes + (t.bikesMissing ? '+' : '')),
          h('td', { className: 'n' }, R.span(t.mMin, t.mMax, false, false, T)), h('td', null))))));

    const p = prev ? R.parkingTotals(prev) : null;
    const resultCard = Card(4, 'תוצאה', h('span', { className: 'cx-rule' }, T(BASES[sh.basis]) + ' · ' + T(ZONE_INFO[sh.zone || 'N'][0])),
      h('div', { className: 'cx-card-b' },
        h('div', { className: 'cx-kpis' },
          h('div', { className: 'cx-kpi main' }, h('div', { className: 'l' }, '🚗 רכב פרטי'), h('div', { className: 'v' }, R.span(t.min, t.max, t.noMin, t.noMax, T)),
            h('div', { className: 's' }, t.noMin && !t.min ? 'מספר מרבי — אין חובת מינימום' : 'מספר טווח / מזערי')),
          h('div', { className: 'cx-kpi' }, h('div', { className: 'l' }, '♿ חניות נגישות'), h('div', { className: 'v mute' }, 'ממתין'),
            h('div', { className: 's' }, T('בנוסף לסה"כ · לפי {n} מקומות ביישוב בלא מתע"ן · טבלת פרט 8.110 טרם נטענה', { n: R.span(tN.min, tN.max, tN.noMin, tN.noMax, T) }))),
          h('div', { className: 'cx-kpi' }, h('div', { className: 'l' }, '🚲 אופניים'), h('div', { className: 'v' }, t.bikes + (t.bikesMissing ? '+' : '')),
            h('div', { className: 's' }, t.bikesMissing ? 'מספר מזערי · חלק ג\' · חסר מספר תלמידים' : 'מספר מזערי · חלק ג\'')),
          h('div', { className: 'cx-kpi' }, h('div', { className: 'l' }, '🏍 אופנועים'), h('div', { className: 'v' }, R.span(t.mMin, t.mMax, false, false, T)),
            h('div', { className: 's' }, 'חלק ד\' · בתחום המגרש, עם עוגן קשירה'))),
        p && h('div', { className: 'cx-hint', style: { marginTop: 10 } },
          T('שינוי מבדיקה {n}:', { n: prev.no }), ' ', T('רכב'), ' ', sgn(t.max - p.max), ' · ', T('אופניים'), ' ', sgn(t.bikes - p.bikes),
          prev.basis !== sh.basis && h('span', { className: 'cx-tag', style: { marginInlineStart: 6 } }, 'בסיס חישוב שונה')),
        h('div', { className: 'cx-cite' }, sh.basis === 'total'
          ? '📖 תקנות התכנון והבניה (התקנת מקומות חניה), תשמ"ג-1983 — נוסח עדכני 30.10.2025. התוספת, חלק ב\' — טבלאות "בהיתר בשטח כולל"; אופניים — חלק ג\' (עמודת שטח כולל); אופנועים — חלק ד\'. מקומות נגישים — חלק א\' סעיף 8.'
          : '📖 תקנות התכנון והבניה (התקנת מקומות חניה), תשמ"ג-1983 — נוסח עדכני 30.10.2025. התוספת, חלק ב\'; אופניים — חלק ג\'; אופנועים — חלק ד\'. מקומות נגישים — חלק א\' סעיף 8.'),
        st && st.planned && h('div', { className: 'cx-warn' }, '⚠ התחנה הקובעת עתידית — יש לבדוק מול תשריט אזורי החניה של הוועדה המקומית. החישוב כאן לפי אזור ג\'.'),
        h('div', { className: 'cx-hint', style: { marginTop: 8 } }, 'רשימת התחנות חלקית — ודאו את אזור החניה מול תשריט הוועדה המקומית.')));

    return h(React.Fragment, null, SheetHead(1, sh, upd), zoneCard, usesCard, resultCard);
  }

  /* ════════ הל"ת ════════ */
  const SPLIT_NOTE = { none: '—', area: 'לפי שטח', sport: '50 / 15 / 35 (קבוע)', pool: '50 / 50 (קבוע)' };
  function HltTab({ sh, upd }) {
    const Tot = R.hltTotals(sh);
    const setRows = rows => upd({ rows });
    const setRow = (i, patch) => setRows(sh.rows.map((r, j) => j === i ? Object.assign({}, r, patch) : r));
    const opts = R.HLT.map(u => h('option', { key: u.id, value: u.id }, u.t + ' — ' + T(u.name)));

    const usesCard = Card(2, 'שימושים ואוכלוסייה', h('button', { className: 'cx-btn pri', onClick: () => setRows(sh.rows.concat([{ id: uid(), type: 'off', qty: 0 }])) }, '+ שימוש'),
      h(React.Fragment, null, h('div', { className: 'cx-scroll' }, h('table', { className: 'cx-t' },
        h('thead', null, h('tr', null, ['שימוש (טבלת הל"ת)', 'כמות', '% גברים', 'קומות', ''].map((x, i) => h('th', { key: i, style: i === 0 ? { width: '46%' } : null }, x)))),
        h('tbody', null, sh.rows.length ? sh.rows.map((r, i) => {
          const u = R.hltById(r.type), men = r.men != null ? r.men : u.men;
          return h('tr', { key: r.id || i },
            h('td', null, h('select', { className: 'cx-in', value: r.type, onChange: e => setRow(i, { type: e.target.value, men: null, floors: null }) }, opts)),
            h('td', null, h('div', { className: 'cx-qty' }, h(Field, { type: 'number', className: 'cx-n', value: r.qty, onSave: v => setRow(i, { qty: v }) }), h('span', { className: 'cx-rule' }, u.m))),
            h('td', null, u.split === 'mw' ? h('div', { className: 'cx-qty' }, h(Field, { type: 'number', className: 'cx-n', style: { width: 64 }, min: 0, max: 100, value: men, onSave: v => setRow(i, { men: v }) }),
              h('span', { className: 'cx-rule' }, T('{n}% נשים', { n: 100 - (+men || 0) }))) : h('span', { className: 'cx-rule' }, SPLIT_NOTE[u.split])),
            h('td', null, u.floors ? h(Field, { type: 'number', className: 'cx-n', style: { width: 56 }, min: 1, value: r.floors || 1, onSave: v => setRow(i, { floors: v }) }) : h('span', { className: 'cx-rule' }, '—')),
            h('td', null, h('button', { className: 'cx-x', title: 'הסרה', onClick: () => setRows(sh.rows.filter((_, j) => j !== i)) }, '×')));
        }) : h('tr', null, h('td', { colSpan: 5, className: 'cx-hint', style: { textAlign: 'center', padding: 16 } }, 'הוסיפו את השימושים בפרויקט ואת האוכלוסייה בכל שימוש'))))),
        h('div', { className: 'cx-card-b', style: { paddingTop: 8 } }, h('span', { className: 'cx-hint' },
          'קומות נדרשות רק לשימושים עם קבועה "בכל קומה" (מתקן שתייה, עביט שפכים, כיור מטבח). שאר הקבועות מחושבות לפי סך האוכלוסייה ואינן מתחלקות לפי קומה.'))));

    const blocks = sh.rows.map((r, i) => {
      const x = R.hltRow(r, T); if (!x) return null;
      const cols = R.FIX_ORDER.filter(k => x.groups.some(g => g.fx[k]) || x.extra[k]);
      const gl = g => g.g === 'all' ? (x.u.groups[0].per ? T('סה"כ ({n} {u})', { n: g.n, u: T(x.u.m) }) : T('גברים ונשים')) : T(G_LABEL[g.g]);
      return h('div', { key: r.id || i, className: 'cx-blk' },
        h('div', { className: 'cx-blk-h' }, h('span', { className: 'cx-ref' }, T('טבלה {t}', { t: x.u.t })), h('b', null, x.u.name),
          h('span', { className: 'cx-rule' }, T(x.desc.tpl, Object.assign({ u: T(x.u.m) }, x.desc.vars)))),
        h('div', { className: 'cx-scroll' }, h('table', { className: 'cx-t c' },
          h('thead', null, h('tr', null, h('th', null), cols.map(k => h('th', { key: k }, R.FIX[k])))),
          h('tbody', null, x.groups.map((g, gi) => h('tr', { key: gi }, h('td', { className: 'gl' }, gl(g), g.g !== 'all' && g.g !== 'shared' && h('span', { className: 'cx-rule' }, ' (' + g.n + ')')),
            cols.map(k => g.fx[k] ? h('td', { key: k }, h('b', null, g.fx[k].c), h('div', { className: 'cx-rule' }, g.fx[k].t)) : h('td', { key: k, className: 'cx-rule' }, '—')))),
            Object.keys(x.extra).length > 0 && h('tr', { className: 'bld' }, h('td', { className: 'gl' }, 'לבניין', x.u.floors && h('span', { className: 'cx-rule' }, ' ' + T('({n} קומות)', { n: Math.max(1, +r.floors || 1) }))),
              cols.map(k => x.extra[k] ? h('td', { key: k }, h('b', null, x.extra[k].c), h('div', { className: 'cx-rule' }, x.extra[k].note)) : h('td', { key: k })))))),
        x.u.notes.length > 0 && h('details', { className: 'cx-notes' }, h('summary', null, T('ציטוט והערות — טבלה {t}', { t: x.u.t })),
          x.u.notes.map((n, j) => h('div', Object.assign({ key: j, className: 'cx-cite', lang: 'he', dir: 'rtl' }, SKIP), '“' + n + '”'))));
    });
    const tcols = R.FIX_ORDER.filter(k => ['m', 'w', 'u', 'all', 'bld'].some(g => Tot[g][k] != null));
    const trow = (lbl, o) => Object.keys(o).length > 0 && h('tr', { key: lbl }, h('td', { className: 'gl' }, lbl), tcols.map(k => h('td', { key: k, className: 'n' }, o[k] || '—')));
    const totalCard = Card(4, 'סיכום קבועות לפרויקט', null, h(React.Fragment, null,
      h('div', { className: 'cx-scroll' }, h('table', { className: 'cx-t c' },
        h('thead', null, h('tr', null, h('th', null), tcols.map(k => h('th', { key: k }, R.FIX[k])))),
        h('tbody', null, trow('גברים', Tot.m), trow('נשים', Tot.w), trow('דו-תכליתי', Tot.u), trow('משותף / ליחידה', Tot.all), trow('לבניין / לקומה', Tot.bld)),
        h('tfoot', null, h('tr', null, h('td', { className: 'gl' }, 'סה"כ'), tcols.map(k => h('td', { key: k, className: 'n' }, Tot.sum[k] || 0)))))),
      h('div', { className: 'cx-card-b' },
        R.HLT_GENERAL.map(([ref, q]) => h('div', { key: ref, className: 'cx-cite' }, h('b', null, T('סעיף {r}', { r: ref })), ' — ', h('span', Object.assign({ lang: 'he' }, SKIP), '“' + q + '”'))),
        h('div', { className: 'cx-warn' }, 'מספר האנשים במשרדים — אם אינו ידוע, מחשבים לפי מקדמי התפוסה (הערה 4 לטבלה 3.6.3.3). מקדמי התפוסה יגיעו ממחשבון הבטיחות.'))));

    return h(React.Fragment, null, SheetHead(1, sh, upd), usesCard,
      Card(3, 'קבועות נדרשות לפי שימוש', null, h('div', { className: 'cx-card-b' }, sh.rows.length ? blocks : h('div', { className: 'cx-hint' }, 'אין עדיין שימושים'))),
      totalCard, h(PlanCard, { sh, upd, Tot }));
  }

  function PlanCard({ sh, upd, Tot }) {
    const plan = sh.plan || { floors: [] }, floors = plan.floors;
    const chk = R.planCheck(sh, Tot);
    const setFloors = fl => upd({ plan: Object.assign({}, plan, { floors: fl }) });
    const setCount = n => {
      n = Math.max(1, Math.min(60, +n || 1));
      const fl = floors.slice(0, n);
      while (fl.length < n) fl.push({ id: uid(), name: fl.length === 0 ? T('קומת קרקע') : T('קומה {n}', { n: fl.length }), fx: {} });
      setFloors(fl);
    };
    const setFx = (i, k, v) => setFloors(floors.map((f, j) => j === i ? Object.assign({}, f, { fx: Object.assign({}, f.fx, { [k]: v }) }) : f));
    const head = c => T(R.FIX[c.fx]);
    return Card(5, 'נדרש מול מוצע',
      h('label', { className: 'cx-f', style: { flexDirection: 'row', alignItems: 'center', gap: 8 } }, 'מספר קומות בתכנית',
        h(Field, { type: 'number', className: 'cx-n', style: { width: 64 }, min: 1, max: 60, value: floors.length, onSave: setCount })),
      h(React.Fragment, null,
        h('div', { className: 'cx-card-b', style: { paddingBottom: 6 } }, h('span', { className: 'cx-hint' }, 'הזינו את מספר הקבועות המתוכננות בכל קומה. "משותף" = תאים שאינם מופרדים לגברים ולנשים (כולל תא נגיש משותף).')),
        h('div', { className: 'cx-scroll' }, h('table', { className: 'cx-t c cx-plan' },
          h('thead', null,
            h('tr', null, h('th', { rowSpan: 2 }, 'קומה'), chk.cols.map(c => h('th', { key: c.k, rowSpan: PCOL_LABEL[c.g] ? 1 : 2 }, head(c)))),
            h('tr', null, chk.cols.filter(c => PCOL_LABEL[c.g]).map(c => h('th', { key: c.k, className: 'sub' }, PCOL_LABEL[c.g])))),
          h('tbody', null, floors.map((f, i) => h('tr', { key: f.id || i },
            h('td', { className: 'gl' }, h(Field, { className: 'fl', value: f.name, skip: true, onSave: v => setFloors(floors.map((x, j) => j === i ? Object.assign({}, x, { name: v }) : x)) })),
            chk.cols.map(c => h('td', { key: c.k }, h(Field, { type: 'number', min: 0, placeholder: '0', value: (f.fx || {})[c.k], onSave: v => setFx(i, c.k, v) })))))),
          h('tfoot', null,
            h('tr', null, h('td', { className: 'gl' }, 'מוצע'), chk.lines.map(l => h('td', { key: l.c.k, className: 'n' }, l.pr))),
            h('tr', { className: 'req' }, h('td', { className: 'gl' }, 'נדרש'), chk.lines.map(l => h('td', { key: l.c.k, className: 'n' }, l.req))),
            h('tr', null, h('td', { className: 'gl' }, 'פער'), chk.lines.map(l => h('td', { key: l.c.k, className: 'n ' + (l.st === 'ok' ? 'cx-ok' : 'cx-bad') }, sgn(l.gap))))))),
        h('div', { className: 'cx-card-b' },
          chk.cols.length === 0 ? h('div', { className: 'cx-hint' }, 'הוסיפו שימושים כדי לחשב את הדרישה')
            : h(React.Fragment, null,
              h('div', { className: 'cx-verdict ' + (chk.bad ? 'bad' : 'ok') }, chk.bad ? T('✗ {n} פערים מול הדרישה', { n: chk.bad }) : '✓ התכנית עומדת בדרישות המינימום של הל"ת'),
              h('table', { className: 'cx-t' },
                h('thead', null, h('tr', null, ['קבועה', 'נדרש', 'מוצע', 'פער', 'סטטוס'].map(x => h('th', { key: x }, x)))),
                h('tbody', null, chk.lines.map(l => h('tr', { key: l.c.k, className: l.st === 'bad' ? 'bad' : '' },
                  h('td', { style: { fontWeight: 600 } }, head(l.c) + (PCOL_LABEL[l.c.g] ? ' — ' + T(PCOL_LABEL[l.c.g]) : '')),
                  h('td', { className: 'n' }, l.req), h('td', { className: 'n' }, l.pr), h('td', { className: 'n' }, sgn(l.gap)),
                  h('td', null,
                    l.st === 'ok' ? h('span', { className: 'cx-p-ok' }, l.gap > 0 ? T('✓ עודף {n}', { n: l.gap }) : T('✓ תקין'))
                      : h('span', { className: 'cx-p-bad' }, l.gap < 0 ? T('✗ חסר {n}', { n: -l.gap }) : T('✗ חסר בקומה')),
                    l.cover > 0 && h('div', { className: 'cx-rule' }, T('עודף {n} אסלות גברים מכסה (סעיף 3.6.3(א))', { n: l.cover })),
                    l.swap > 0 && h('div', { className: 'cx-rule' }, T('כולל {n} אסלות במקום משתנות', { n: l.swap })),
                    l.missing.length > 0 && h('div', { className: 'cx-rule' }, T('חסר בכל קומה:'), ' ', h('span', SKIP, l.missing.join(', ')))))))),
              h('div', { className: 'cx-hint', style: { marginTop: 8 } }, 'מתקן שתייה, עביט שפכים וכיור מטבח נבדקים גם ברמת הקומה — בשימושים שהטבלה שלהם דורשת אותם "בכל קומה".')))));
  }

  /* ════════ הג"א ════════ */
  const HGA_HINTS = ['החישוב לפי השטח העיקרי בקומה — תקנה 236(א), טור ב\'.', 'החישוב לפי השטח הכולל — נספח א\' לתקנה 236(א) (השלמה לתקנות המפרטים).'];
  const r2 = n => Math.round(n * 100) / 100;
  function HgaTab({ sh, upd }) {
    const floors = sh.floors || [];
    const setFloors = fl => upd({ floors: fl });
    const setFloor = (i, patch) => setFloors(floors.map((f, j) => j === i ? Object.assign({}, f, patch) : f));
    const setCount = n => {
      n = Math.max(1, Math.min(80, +n || 1));
      const fl = floors.slice(0, n);
      while (fl.length < n) fl.push({ id: uid(), name: fl.length === 0 ? T('קומת קרקע') : T('קומה {n}', { n: fl.length }), uses: [], spaces: [] });
      setFloors(fl);
    };
    const dupFloor = i => {
      const c = JSON.parse(JSON.stringify(floors[i])); c.id = uid(); c.name = T('קומה {n}', { n: floors.length });
      c.uses.forEach(u => { u.id = uid(); }); c.spaces.forEach(x => { x.id = uid(); });
      setFloors(floors.slice(0, i + 1).concat([c], floors.slice(i + 1)));
    };
    const areaLbl = sh.basis === 'total' ? 'שטח כולל בקומה (מ"ר)' : 'שטח עיקרי בקומה (מ"ר)';
    const useOpts = Object.keys(R.HGA_GROUPS).map(g => h('optgroup', { key: g, label: T(R.HGA_GROUPS[g]) },
      R.HGA_USES.filter(u => u.g === g).map(u => h('option', { key: u.id, value: u.id }, T(u.name)))));
    const kindOpts = Object.keys(R.HGA_KINDS).map(k => h('option', { key: k, value: k }, T(R.HGA_KINDS[k])));
    const checks = floors.map(f => R.hgaCheckFloor(f, sh.basis, T));

    const floorBlock = (f, i) => {
      const chk = checks[i], uses = f.uses || [], spaces = f.spaces || [];
      const setUses = us => setFloor(i, { uses: us }), setSpaces = sp => setFloor(i, { spaces: sp });
      const setUse = (j, p) => setUses(uses.map((u, k) => k === j ? Object.assign({}, u, p) : u));
      const setSpace = (j, p) => setSpaces(spaces.map((u, k) => k === j ? Object.assign({}, u, p) : u));
      const defKind = () => { const k = Object.keys(chk.f.req)[0]; return k || 'mamam'; };
      return h('div', { key: f.id || i, className: 'cx-blk' },
        h('div', { className: 'cx-blk-h' },
          h(Field, { className: 'fl', value: f.name, skip: true, style: { width: 130, fontWeight: 600 }, onSave: v => setFloor(i, { name: v }) }),
          h('span', { className: 'cx-sp', style: { flex: 1 } }),
          chk.lines.map(l => h('span', { key: l.kind, className: l.ok ? 'cx-p-ok' : 'cx-p-bad' },
            T(R.HGA_KINDS[l.kind]) + ' ' + (l.ok ? '✓' : '✗'))),
          h('button', { className: 'cx-btn', onClick: () => dupFloor(i), title: 'שכפול הקומה עם השימושים והמרחבים' }, '⧉ שכפל'),
          floors.length > 1 && h('button', { className: 'cx-x', title: 'הסרת הקומה', onClick: () => setFloors(floors.filter((_, k) => k !== i)) }, '×')),
        h('div', { className: 'cx-hga' },
          h('div', null,
            h('div', { className: 'cx-sub' }, h('b', null, 'שימושים בקומה'), h('button', { className: 'cx-btn', onClick: () => setUses(uses.concat([{ id: uid(), type: 'off', qty: 0 }])) }, '+ שימוש')),
            h('table', { className: 'cx-t' },
              h('tbody', null, uses.length ? uses.map((u, j) => {
                const x = R.hgaRow(u, sh.basis, T), def = R.hgaById(u.type);
                const unit = def.kind === 'pct' ? (def.m === 'gross' ? 'שטח ברוטו (מ"ר)' : areaLbl) : def.unit ? T(def.unit) : '';
                return h('tr', { key: u.id || j },
                  h('td', { style: { width: '44%' } }, h('select', { className: 'cx-in', value: u.type, onChange: e => setUse(j, { type: e.target.value }) }, useOpts)),
                  h('td', null, def.kind === 'none' ? h('span', { className: 'cx-rule' }, '—') : h('div', { className: 'cx-qty' },
                    h(Field, { type: 'number', className: 'cx-n', value: u.qty, onSave: v => setUse(j, { qty: v }) }), h('span', { className: 'cx-rule' }, unit))),
                  h('td', null, h('div', { className: 'cx-rule' }, x.text), h('div', { className: 'cx-rule' }, h('span', SKIP, def.ref), def.confirm ? ' · ' : '', def.confirm ? T('לאימות') : '')),
                  h('td', { className: 'n' }, def.kind === 'none' ? '—' : T('{n} מ"ר', { n: r2(x.area) })),
                  h('td', null, h('button', { className: 'cx-x', title: 'הסרה', onClick: () => setUses(uses.filter((_, k) => k !== j)) }, '×')));
              }) : h('tr', null, h('td', { className: 'cx-hint', style: { padding: 10 } }, 'הוסיפו את השימושים בקומה'))))),
          h('div', null,
            h('div', { className: 'cx-sub' }, h('b', null, 'מרחבים מוגנים מוצעים'),
              h('button', { className: 'cx-btn', onClick: () => setSpaces(spaces.concat([{ id: uid(), name: String(spaces.length + 1).padStart(2, '0'), kind: defKind(), area: null, systems: [] }])) }, '+ מרחב')),
            h('table', { className: 'cx-t' },
              h('tbody', null, spaces.length ? spaces.map((x, j) => h('tr', { key: x.id || j },
                h('td', null, h(Field, { value: x.name, skip: true, style: { width: 60 }, onSave: v => setSpace(j, { name: v }) })),
                h('td', null, h('select', { className: 'cx-in', value: x.kind, onChange: e => setSpace(j, { kind: e.target.value }) }, kindOpts)),
                h('td', null, h('div', { className: 'cx-qty' }, h(Field, { type: 'number', className: 'cx-n', style: { width: 72 }, value: x.area, placeholder: '0', onSave: v => setSpace(j, { area: v }) }), h('span', { className: 'cx-rule' }, 'מ"ר נטו'))),
                h('td', null, h('button', { className: 'cx-x', title: 'הסרה', onClick: () => setSpaces(spaces.filter((_, k) => k !== j)) }, '×'))))
                : h('tr', null, h('td', { className: 'cx-hint', style: { padding: 10 } }, 'הוסיפו את המרחבים המוגנים שבתכנית')))))),
        chk.lines.length > 0 && h('div', { className: 'cx-card-b', style: { paddingTop: 6, paddingBottom: 10 } }, chk.lines.map(l => {
          const rq = chk.f.req[l.kind];
          return h('div', { key: l.kind, className: 'cx-line' },
            h('b', null, T(R.HGA_KINDS[l.kind])), ' · ',
            T('נדרש {a} מ"ר', { a: l.reqArea }), l.reqCount ? ' ' + T('ב-{n} מרחבים', { n: l.reqCount }) : '', ' · ',
            T('מוצע {a} מ"ר ב-{n} מרחבים', { a: l.area, n: l.count }), ' ',
            h('span', { className: l.ok ? 'cx-p-ok' : 'cx-p-bad' }, l.ok ? (l.gap > 0 ? T('✓ עודף {n} מ"ר', { n: l.gap }) : T('✓ תקין')) : l.gap < 0 ? T('✗ חסר {n} מ"ר', { n: r2(-l.gap) }) : l.cgap < 0 ? T('✗ חסרים {n} מרחבים', { n: -l.cgap }) : T('✗ לא תקין')),
            rq && rq.minApplied && h('span', { className: 'cx-rule' }, ' · ', T('הוחל שטח מזערי של {n} מ"ר', { n: rq.min })),
            l.tooBig.length > 0 && h('span', { className: 'cx-rule cx-bad' }, ' · ', T('מעל השטח המרבי ({n} מ"ר):', { n: R.HGA_LIMITS[l.kind].max }), ' ', h('span', SKIP, l.tooBig.join(', '))),
            l.tooSmall.length > 0 && h('span', { className: 'cx-rule cx-bad' }, ' · ', T('מתחת ל-{n} מ"ר:', { n: R.HGA_LIMITS[l.kind].min }), ' ', h('span', SKIP, l.tooSmall.join(', '))));
        })));
    };

    const floorsCard = Card(2, 'קומות, שימושים ומרחבים מוגנים',
      h('label', { className: 'cx-f', style: { flexDirection: 'row', alignItems: 'center', gap: 8 } }, 'מספר קומות',
        h(Field, { type: 'number', className: 'cx-n', style: { width: 64 }, min: 1, max: 80, value: floors.length, onSave: setCount })),
      h('div', { className: 'cx-card-b' },
        h('div', { className: 'cx-hint', style: { marginBottom: 10 } }, 'בכל קומה: השימושים והשטח שלהם, ולצדם המרחבים המוגנים המתוכננים. ממ"מ ומרחב במוסד חינוך מחושבים לפי סך השימושים בקומה; ממ"ד — אחד לכל דירה; ממ"ק — אחד לכל 4 דירות.'),
        floors.map(floorBlock)));

    const all = floors.flatMap((f, i) => checks[i].lines.map(l => ({ f, l })));
    const bad = all.filter(o => !o.l.ok).length;
    const cmpCard = Card(3, 'נדרש מול מוצע', null, h('div', { className: 'cx-card-b' },
      !all.length ? h('div', { className: 'cx-hint' }, 'הוסיפו שימושים כדי לחשב את הדרישה') : h(React.Fragment, null,
        h('div', { className: 'cx-verdict ' + (bad ? 'bad' : 'ok') }, bad ? T('✗ {n} פערים מול הדרישה', { n: bad }) : '✓ התכנית עומדת בדרישות המיגון'),
        h('div', { className: 'cx-scroll' }, h('table', { className: 'cx-t c' },
          h('thead', null, h('tr', null, ['קומה', 'סוג מרחב', 'שטח נדרש', 'מרחבים נדרשים', 'שטח מוצע', 'מרחבים מוצעים', 'פער (מ"ר)', 'סטטוס'].map(x => h('th', { key: x }, x)))),
          h('tbody', null, all.map(({ f, l }, k) => h('tr', { key: k, className: l.ok ? '' : 'bad' },
            h('td', Object.assign({ className: 'gl' }, SKIP), f.name), h('td', null, R.HGA_KINDS[l.kind]),
            h('td', { className: 'n' }, l.reqArea), h('td', { className: 'n' }, l.reqCount || '—'), h('td', { className: 'n' }, l.area), h('td', { className: 'n' }, l.count),
            h('td', { className: 'n ' + (l.gap >= 0 ? 'cx-ok' : 'cx-bad') }, sgn(r2(l.gap))),
            h('td', null, l.ok ? h('span', { className: 'cx-p-ok' }, '✓ תקין') : h('span', { className: 'cx-p-bad' }, '✗ לא תקין'))))),
          h('tfoot', null, h('tr', null, h('td', { className: 'gl', colSpan: 2 }, 'סה"כ'),
            h('td', { className: 'n' }, r2(all.reduce((a, o) => a + o.l.reqArea, 0))), h('td', { className: 'n' }, all.reduce((a, o) => a + o.l.reqCount, 0)),
            h('td', { className: 'n' }, r2(all.reduce((a, o) => a + o.l.area, 0))), h('td', { className: 'n' }, all.reduce((a, o) => a + o.l.count, 0)),
            h('td', null), h('td', null))))))));

    const vent = sh.vent || { m2pp: 0.4, flow: 6 };
    const vrows = floors.flatMap((f, i) => (f.spaces || []).map((x, j) => ({ f, i, x, j })).filter(o => o.x.kind !== 'mamad'));
    const setSys = (i, j, systems) => setFloor(i, { spaces: floors[i].spaces.map((x, k) => k === j ? Object.assign({}, x, { systems }) : x) });
    const ventCard = Card(4, 'מערכות אוורור וסינון למרחב מוגן',
      h(React.Fragment, null,
        h('label', { className: 'cx-f', style: { flexDirection: 'row', alignItems: 'center', gap: 6 } }, 'מ"ר לאדם', h(Field, { type: 'number', className: 'cx-n', style: { width: 64 }, value: vent.m2pp, onSave: v => upd({ vent: Object.assign({}, vent, { m2pp: v }) }) })),
        h('label', { className: 'cx-f', style: { flexDirection: 'row', alignItems: 'center', gap: 6 } }, 'מ"ק/שעה לאדם', h(Field, { type: 'number', className: 'cx-n', style: { width: 64 }, value: vent.flow, onSave: v => upd({ vent: Object.assign({}, vent, { flow: v }) }) }))),
      h('div', { className: 'cx-card-b' },
        !vrows.length ? h('div', { className: 'cx-hint' }, 'הוסיפו מרחבים מוגנים בקומות כדי לחשב את מערכות האוורור והסינון') : h('div', { className: 'cx-scroll' }, h('table', { className: 'cx-t c' },
          h('thead', null, h('tr', null, ['קומה', 'מרחב מוגן', 'שטח', 'משתמשים מקס\'', 'משתמשים מעוגל', 'ספיקת אוויר נדרשת', 'מערכות נבחרות', 'כיסוי', ''].map(x => h('th', { key: x }, x)))),
          h('tbody', null, vrows.map(({ f, i, x, j }) => {
            const v = R.hgaVent(x, vent), sys = (x.systems || []).map(Number);
            return h('tr', { key: x.id || i + '-' + j, className: v.ok ? '' : 'bad' },
              h('td', Object.assign({ className: 'gl' }, SKIP), f.name), h('td', SKIP, x.name),
              h('td', { className: 'n' }, T('{n} מ"ר', { n: +x.area || 0 })),
              h('td', null, LTR(`${+x.area || 0} / ${vent.m2pp} = ${v.exact}`)),
              h('td', { className: 'n' }, v.people),
              h('td', null, LTR(`${v.people} × ${vent.flow} = ${v.flow}`), ' ', h('span', { className: 'cx-rule' }, 'מ"ק/שעה')),
              h('td', null, h('div', { className: 'cx-sys' },
                sys.map((n, k) => h('span', { key: k, className: 'cx-chip' }, n, h('button', { title: 'הסרה', onClick: () => setSys(i, j, sys.filter((_, q) => q !== k)) }, '×'))),
                h('select', { className: 'cx-in cx-addsys', value: '', onChange: e => { if (e.target.value) setSys(i, j, sys.concat([+e.target.value])); } },
                  h('option', { value: '' }, '+ מערכת'), R.HGA_SYSTEMS.map(n => h('option', { key: n, value: n }, T('{n} איש', { n })))))),
              h('td', null, h('span', { className: v.ok ? 'cx-p-ok' : 'cx-p-bad', dir: 'ltr' }, v.ok ? T('✓ {c} ≥ {p}', { c: v.cap, p: v.people }) : T('✗ {c} < {p}', { c: v.cap, p: v.people }))),
              h('td', null, !v.ok && v.suggest.length > 0 && h('button', { className: 'cx-btn', title: 'החלפה במערכות המוצעות', onClick: () => setSys(i, j, v.suggest) }, T('הצעה: {s}', { s: v.suggest.join(' + ') }))));
          })))),
        h('div', { className: 'cx-hint', style: { marginTop: 8 } }, 'מערכות בגדלים של 33, 50, 66, 83 ו-100 איש; אפשר לשלב כמה מערכות ובלבד שסכומן לא יפחת ממספר המשתמשים. ממ"ד אינו כלול — בו מותקנת מערכת סינון דירתית (תקנה 214).'),
        h('div', { className: 'cx-cite' }, '📖 תקנות 187, 214 ו-253: במרחב מוגן תותקן מערכת אוורור וסינון לפי ת"י 4570. הנחיית ענף הנדסה ורגולציה (נובמבר 2024): הספיקות המותקנות יתוכננו בהתאם לספיקה הנדרשת לחלל המרחב המוגן.')));

    return h(React.Fragment, null, SheetHead(1, sh, upd, HGA_HINTS), floorsCard, cmpCard, ventCard,
      Card(5, 'מקורות', null, h('div', { className: 'cx-card-b' },
        h('div', { className: 'cx-cite' }, '📖 תקנות ההתגוננות האזרחית (מפרטים לבניית מקלטים), התש"ן-1990: ממ"ק — תקנות 171–172 (4 או 5 מ"ר נטו ליח"ד, עד 4 יח"ד למרחב); ממ"ד — תקנה 197א (9 מ"ר נטו); ממ"מ — תקנה 236 (טבלה, מזערי 10 מ"ר, מרבי 60 מ"ר נטו); שימושים שאינם במניין — 236(ב).'),
        h('div', { className: 'cx-cite' }, '📖 נספח א\' לתקנה 236(א) — אופן חישוב שטחי המיגון לפי "שטח כולל". ערכים המסומנים "לאימות" לא הופיעו בבירור בנספח.'),
        h('div', { className: 'cx-cite' }, '📖 מפרט למיגון מוסדות חינוך ומוסדות להכשרה גבוהה, נובמבר 2023 — סעיף 8 וטבלה 1: שטח לכיתה, מזערי לכל מרחב, מרבי 90 מ"ר נטו; בחינוך מיוחד עם יותר מ-9 כיתות — תוספת 5 מ"ר לכיתה.'))));
  }

  /* ════════ בטיחות ════════ */
  const m2 = n => T('{n} מ\'', { n: (+n || 0).toFixed(2) });
  // safety widths are kept in m and shown in cm, as in a safety plan
  const cm = m => m == null || m === '' ? '' : Math.round(+m * 1000) / 10;
  const cmT = m => T('{a} ס"מ', { a: cm(+m || 0) });
  const rm = n => Math.round(n * 10000) / 10000;
  function SafetyTab({ sh, upd }) {
    const floors = sh.floors || [];
    const chk = R.safCheck(sh);
    const setFloors = fl => upd({ floors: fl });
    const setFloor = (i, p) => setFloors(floors.map((f, j) => j === i ? Object.assign({}, f, p) : f));
    const setCount = n => {
      n = Math.max(1, Math.min(80, +n || 1));
      const fl = floors.slice(0, n);
      while (fl.length < n) fl.push({ id: uid(), name: T('קומה {n}', { n: fl.length }), level: fl.length, corridor: (floors[0] || {}).corridor || 'res', spaces: [], exits: [] });
      setFloors(fl);
    };
    const dupFloor = i => {
      const c = JSON.parse(JSON.stringify(floors[i])); c.id = uid(); c.name = T('קומה {n}', { n: floors.length }); c.level = Math.max(...floors.map(f => +f.level || 0)) + 1;
      (c.spaces || []).forEach(x => { x.id = uid(); }); (c.exits || []).forEach(x => { x.id = uid(); }); (c.stairs || []).forEach(x => { x.id = uid(); });
      setFloors(floors.slice(0, i + 1).concat([c], floors.slice(i + 1)));
    };
    const useOpts = Object.keys(R.SAF_GROUPS).map(g => h('optgroup', { key: g, label: T(R.SAF_GROUPS[g]) },
      R.SAF_USES.filter(u => u.g === g).map(u => h('option', { key: u.id, value: u.id }, u.n + ' · ' + T(u.name)))));
    const corrOpts = R.SAF_CORRIDOR.map(c => h('option', { key: c.id, value: c.id }, T(c.name) + ' — ' + c.w.toFixed(2)));
    const okPill = (ok, txtOk, txtBad) => h('span', { className: ok ? 'cx-p-ok' : 'cx-p-bad' }, ok ? (txtOk || '✓') : (txtBad || '✗'));

    const floorBlock = (o, i) => {
      const fl = o.fl, f = o.f, spaces = fl.spaces || [], exits = fl.exits || [], stairs = o.stairs || [];
      const L = +fl.level || 0;
      const setSpaces = s => setFloor(i, { spaces: s }), setExits = e => setFloor(i, { exits: e }), setStairs = s => setFloor(i, { stairs: s });
      const setSp = (j, p) => setSpaces(spaces.map((x, k) => k === j ? Object.assign({}, x, p) : x));
      const setEx = (j, p) => setExits(exits.map((x, k) => k === j ? Object.assign({}, x, p) : x));
      const setSt = (j, p) => setStairs(stairs.map((x, k) => k === j ? Object.assign({}, x, p) : x));
      const line = k => o.lines.find(l => l.k === k);
      const exitLines = o.lines.filter(l => l.k === 'exit'), stairLines = o.lines.filter(l => l.k === 'stair');
      const count = line('count'), doorSum = line('doorSum'), stairSum = line('stairSum'), corr = line('corridor');
      const exitsOk = count.ok && (!doorSum || doorSum.ok) && exitLines.every(l => l.ok);
      const stairsOk = (!stairSum || stairSum.ok) && stairLines.every(l => l.ok);
      const showStairs = L !== 0 || stairs.length > 0;
      const singleWhy = f.single === 'res' ? 'בניין מגורים שאינו רב-קומות — 3.2.13.3(א)(1)' : f.single === 'small' ? 'עד 30 איש ומרחק הליכה עד 30 מ\' — 3.2.13.3(א)(2)' : '';
      const area = f.spaces.reduce((a, s) => a + (s.x.u.q ? 0 : s.x.area), 0);
      // a width typed in cm, kept in m
      const wField = (val, bad, onSave, title) => h(Field, { type: 'number', className: 'cx-n' + (bad ? ' cx-in-bad' : ''), style: { width: 58 }, value: cm(val), placeholder: '0', title, onSave: v => onSave(v == null ? null : rm(v / 100)) });
      const chip = (val, bad, onSave, onDel, key) => h('span', { key, className: 'cx-chip' }, wField(val, bad, onSave), h('button', { className: 'cx-x', title: 'הסרה', onClick: onDel }, '×'));
      const flagged = l => l && !l.ok;
      const short = l => T('✗ חסר {n}', { n: cm(rm(l.need - l.have)) });
      return h('div', { key: fl.id || i, className: 'cx-blk' },
        h('div', { className: 'cx-blk-h' },
          h(Field, { className: 'fl', value: fl.name, skip: true, style: { width: 120, fontWeight: 600 }, onSave: v => setFloor(i, { name: v }) }),
          h('label', { className: 'cx-f', style: { flexDirection: 'row', alignItems: 'center', gap: 4 }, title: T('0 = קומת היציאה; חיובי מעליה, שלילי מתחתיה') }, 'מפלס',
            h(Field, { type: 'number', className: 'cx-n', style: { width: 52 }, value: fl.level || 0, onSave: v => setFloor(i, { level: v }) })),
          h('select', { className: 'cx-in', style: { width: 'auto', maxWidth: 260 }, value: fl.corridor || 'res', title: T('טבלה 3.2.12.5 — רוחב מינימלי של פרוזדור'), onChange: e => setFloor(i, { corridor: e.target.value }) }, corrOpts),
          h('span', { className: 'cx-sp', style: { flex: 1 } }),
          h('span', { className: 'cx-tag' }, T('{n} איש', { n: f.occ })),
          okPill(o.bad === 0, '✓', T('✗ {n}', { n: o.bad })),
          h('button', { className: 'cx-btn', onClick: () => dupFloor(i), title: 'שכפול הקומה עם החללים ודרכי המוצא' }, '⧉ שכפל'),
          floors.length > 1 && h('button', { className: 'cx-x', title: 'הסרת הקומה', onClick: () => setFloors(floors.filter((_, k) => k !== i)) }, '×')),

        h('div', { className: 'cx-scroll' }, h('table', { className: 'cx-t c cx-saf' },
          h('thead', null,
            h('tr', null, h('th', { rowSpan: 2 }, 'מס\' חדר / אזור'), h('th', { rowSpan: 2 }, 'חלל / שימוש (טבלה 3.2.12.2)'), h('th', { rowSpan: 2 }, 'שטח / כמות'), h('th', { rowSpan: 2 }, 'מקדם'), h('th', { rowSpan: 2 }, 'אנשים'),
              h('th', { rowSpan: 2 }, 'רוחב מחושב (ס"מ)'), h('th', { colSpan: 3 }, 'נדרש'), h('th', { colSpan: 3 }, 'מוצע'), h('th', { rowSpan: 2 }, 'עומד'), h('th', { rowSpan: 2 })),
            h('tr', null, ['כמות', 'רוחב', 'בהלה', 'כמות', 'רוחב', 'בהלה'].map((x, k) => h('th', { key: k, className: 'sub' }, x)))),
          h('tbody', null,
            f.spaces.map(({ sp, x }, j) => {
              const u = x.u, iss = k => x.issues.some(z => z.k === k), tot = x.issues.find(z => z.k === 'total');
              return h('tr', { key: sp.id || j, className: x.entered && !x.ok ? 'bad' : '' },
                h('td', null, h(Field, { value: sp.no, skip: true, placeholder: '—', style: { width: 48 }, onSave: v => setSp(j, { no: v }) })),
                h('td', { style: { textAlign: 'start' } }, h('div', { className: 'cx-qty' },
                  h(Field, { value: sp.name, skip: true, placeholder: '—', style: { width: 76 }, onSave: v => setSp(j, { name: v }) }),
                  h('select', { className: 'cx-in', style: { minWidth: 150, maxWidth: 190 }, value: sp.use, onChange: e => setSp(j, { use: e.target.value, factor: null }) }, useOpts))),
                h('td', null, u.none ? '—' : u.q ? h('div', { className: 'cx-qty' }, h(Field, { type: 'number', className: 'cx-n', style: { width: 62 }, value: sp.qty, onSave: v => setSp(j, { qty: v }) }),
                  h('span', { className: 'cx-rule' }, u.q === 'bench' ? 'מ\' ספסל' : u.q === 'seats' ? 'מושבים' : 'איש'))
                  : h(Field, { type: 'number', className: 'cx-n', style: { width: 62 }, value: sp.area, title: T('מ"ר'), onSave: v => setSp(j, { area: v }) })),
                h('td', null, Array.isArray(u.factor) ? h(Field, { type: 'number', className: 'cx-n', style: { width: 50 }, value: x.factor, title: T('טווח {a}–{b}', { a: u.factor[0], b: u.factor[1] }), onSave: v => setSp(j, { factor: v }) })
                  : x.factor != null ? x.factor : '—', u.max && h('div', { className: 'cx-rule' }, 'מקסימלית')),
                h('td', { className: 'n' }, x.occ),
                h('td', { className: 'n' }, x.occ ? cm(x.horiz) : '—'),
                h('td', { className: 'n' }, x.occ ? x.exits : '—'),
                h('td', { className: 'n', title: T('טבלה 3.2.1.3 שורה {r}', { r: x.doorMin.row }) }, x.occ ? cm(x.doorReq) : '—'),
                h('td', null, x.panic ? h('span', { className: 'cx-tag warn' }, 'נדרש') : '—'),
                h('td', { className: iss('doors') || iss('total') ? 'cx-bad' : '' }, h(Field, { type: 'number', className: 'cx-n', style: { width: 40 }, value: sp.doors, placeholder: '0', onSave: v => setSp(j, { doors: v }) })),
                h('td', { className: iss('width') || iss('total') ? 'cx-bad' : '' }, wField(sp.doorW, false, v => setSp(j, { doorW: v }))),
                h('td', { className: iss('panic') ? 'cx-bad' : '' }, h('input', { type: 'checkbox', checked: !!sp.panic, onChange: e => setSp(j, { panic: e.target.checked }) })),
                h('td', { title: tot ? T('הדלתות יחד {h} ס"מ מול {n} ס"מ מחושב', { h: cm(tot.have), n: cm(x.horiz) }) : undefined },
                  x.entered ? okPill(x.ok, '✓', '✗') : '—'),
                h('td', null, h('button', { className: 'cx-x', title: 'הסרה', onClick: () => setSpaces(spaces.filter((_, k) => k !== j)) }, '×')));
            }),
            h('tr', null, h('td', { colSpan: 14, style: { textAlign: 'start' } },
              h('button', { className: 'cx-btn', onClick: () => setSpaces(spaces.concat([{ id: uid(), name: '', use: 'b41', area: null }])) }, '+ חלל'),
              !spaces.length && h('span', { className: 'cx-hint', style: { marginInlineStart: 8 } }, 'הוסיפו את החללים בקומה ואת השימוש בכל אחד'))),

            h('tr', { className: 'tot' + (exitsOk ? '' : ' bad') },
              h('td', null), h('td', { style: { textAlign: 'start' } }, 'סה"כ קומה — דלתות יציאה'),
              h('td', { className: 'n' }, area ? +area.toFixed(1) : '—'), h('td', null, '—'), h('td', { className: 'n' }, f.occ),
              h('td', { className: 'n' }, f.occ ? cm(f.horizTot) : '—'),
              h('td', { className: 'n' }, f.exits), h('td', { className: 'n', title: T('טבלה 3.2.1.3') }, cm(f.doorMinStair)),
              h('td', null, f.panic ? h('span', { className: 'cx-tag warn' }, 'נדרש') : '—'),
              h('td', { className: 'n' + (count.ok ? '' : ' cx-bad') }, exits.length),
              h('td', null, h('div', { className: 'cx-chips' },
                exitLines.map((l, j) => chip(l.e.door, !l.items[0].ok, v => setEx(j, { door: v }), () => setExits(exits.filter((_, k) => k !== j)), l.e.id || j)),
                h('button', { className: 'cx-btn', title: 'דרך מוצא נוספת', onClick: () => setExits(exits.concat([{ id: uid(), door: null, panic: f.panic }])) }, '+'),
                doorSum && h('span', { className: 'cx-rule' }, '= ' + cm(doorSum.have)))),
              h('td', { className: f.panic && exits.some(e => !e.panic) ? 'cx-bad' : '' },
                h('input', { type: 'checkbox', checked: exits.length > 0 && exits.every(e => e.panic), title: T('מנגנון בהלה בכל דלתות היציאה'), onChange: e => setExits(exits.map(x => Object.assign({}, x, { panic: e.target.checked }))) })),
              h('td', null, exits.length || f.occ ? okPill(exitsOk, '✓', flagged(doorSum) ? short(doorSum) : '✗') : '—'),
              h('td', null)),

            showStairs && h('tr', { className: 'tot' + (stairsOk ? '' : ' bad') },
              h('td', null), h('td', { style: { textAlign: 'start' } }, 'מדרגות'),
              h('td', { colSpan: 3, className: 'cx-rule' }, f.stairGov > f.stairTot ? T('לפי הקומה הגדולה שהמדרגות משרתות') : ''),
              h('td', { className: 'n' }, f.stairGov ? cm(f.stairGov) : '—'),
              h('td', null, '—'), h('td', { className: 'n', title: '3.2.2.2' }, cm(f.stairMin)), h('td', null, '—'),
              h('td', { className: 'n' }, stairs.length),
              h('td', null, h('div', { className: 'cx-chips' },
                stairLines.map((l, j) => chip(l.st.w, !l.ok, v => setSt(j, { w: v }), () => setStairs(stairs.filter((_, k) => k !== j)), l.st.id || j)),
                h('button', { className: 'cx-btn', title: 'גרם מדרגות נוסף', onClick: () => setStairs(stairs.concat([{ id: uid(), w: null }])) }, '+'),
                stairSum && h('span', { className: 'cx-rule' }, '= ' + cm(stairSum.have)))),
              h('td', null, '—'),
              h('td', null, okPill(stairsOk, '✓', flagged(stairSum) ? short(stairSum) : '✗')),
              h('td', null))))),

        h('div', { className: 'cx-card-b', style: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', paddingTop: 6, paddingBottom: 6 } },
          h('label', { className: 'cx-f', style: { flexDirection: 'row', alignItems: 'center', gap: 6 } }, 'רוחב פרוזדור (ס"מ)',
            wField(fl.corridorW, flagged(corr), v => setFloor(i, { corridorW: v }))),
          corr && h('span', { className: corr.ok ? 'cx-p-ok' : 'cx-p-bad' }, T('פרוזדור {h} מול {n} ס"מ נדרש', { h: cm(corr.have), n: cm(corr.need) })),
          !showStairs && h('button', { className: 'cx-btn', onClick: () => setStairs([{ id: uid(), w: null }]) }, '+ מדרגות בקומה')),

        f.occ > 0 && h('div', { className: 'cx-card-b cx-req' },
          h('div', null, h('b', null, T('{n} איש בקומה', { n: f.occ })), ' · ', T('{n} דרכי מוצא נדרשות', { n: f.exits }), singleWhy && h('span', { className: 'cx-rule' }, ' (' + T(singleWhy) + ')'),
            f.roomMax > 2 && h('span', { className: 'cx-rule' }, ' · ', T('לפחות כמספר היציאות מהחלל הגדול (3.2.13.3(ד))'))),
          h('div', null, T('רוחב מילוט כולל מהקומה'), ': ',
            T('מהלך אופקי {a}', { a: cmT(f.horizTot) }), ' · ', T('מדרגות {a}', { a: cmT(f.stairGov) }),
            h('span', { className: 'cx-rule' }, ' · ', T('מקדם {s}/{h} ס"מ לנפש', { s: f.wf.s, h: f.wf.h }), ' · ', T('החלוקה בין דרכי המוצא חופשית, כל אחת לפחות במינימום (3.2.12.1(ב), 3.2.12.4)'))),
          h('div', null, T('פרוזדור: {a}', { a: cmT(f.corrReq) }), h('span', { className: 'cx-rule' }, ' ', T('(הגדול מבין חישוב {c} ומינימום {m})', { c: cmT(f.corrCalc), m: cmT(f.corrMin) })),
            ' · ', T('כל גרם מדרגות: לפחות {a}', { a: cmT(f.stairMin) }), h('span', { className: 'cx-rule' }, ' (3.2.2.2)'),
            ' · ', T('דלת יציאה: לפחות {a}', { a: cmT(f.doorMinStair) }), h('span', { className: 'cx-rule' }, ' (' + T('טבלה 3.2.1.3') + ')'),
            ' · ', f.panic ? h('span', { className: 'cx-tag warn' }, 'מנגנון בהלה בדלתות היציאה מהקומה (מעל 100 איש)') : h('span', { className: 'cx-rule' }, 'ללא חובת מנגנון בהלה')),
          sh.height !== 'tower' && !sh.residential && f.occ <= 30 && h('label', { className: 'cx-rule', style: { display: 'block', marginTop: 4 } },
            h('input', { type: 'checkbox', checked: !!fl.short30, onChange: e => setFloor(i, { short30: e.target.checked }) }), ' ', 'מרחק ההליכה מכל נקודה בקומה אל מוצא בטוח או יציאה אינו עולה על 30 מ\' (מאפשר דרך מוצא אחת)')));
    };

    const head = Card(1, 'פרטי הבדיקה', null, h('div', { className: 'cx-card-b' },
      h('div', { className: 'cx-grid' },
        h('label', { className: 'cx-f' }, 'מספר בדיקה', h(Field, { type: 'number', value: sh.no, onSave: v => upd({ no: v }) })),
        h('label', { className: 'cx-f' }, 'תאריך', h(Field, { type: 'date', value: sh.date, onSave: v => upd({ date: v }) })),
        h('label', { className: 'cx-f' }, 'בוצע ע"י', h(Field, { value: sh.by, skip: true, onSave: v => upd({ by: v }) })),
        h('label', { className: 'cx-f' }, 'כותרת / הערה', h(Field, { value: sh.title, skip: true, onSave: v => upd({ title: v }) }))),
      h('div', { className: 'cx-basis' },
        h('label', { className: 'cx-f', style: { flexDirection: 'row', alignItems: 'center', gap: 6 } }, 'גובה הבניין',
          h('select', { className: 'cx-in', style: { width: 'auto' }, value: sh.height || 'low', onChange: e => upd({ height: e.target.value }) },
            Object.keys(R.SAF_HEIGHTS).map(k => h('option', { key: k, value: k }, T(R.SAF_HEIGHTS[k]))))),
        h('label', { className: 'cx-rule' }, h('input', { type: 'checkbox', checked: !!sh.residential, onChange: e => upd({ residential: e.target.checked }) }), ' ', 'בניין מגורים'),
        h('label', { className: 'cx-rule' }, h('input', { type: 'checkbox', checked: !!sh.twoDwellings, onChange: e => upd({ twoDwellings: e.target.checked }) }), ' ', 'עד 2 דירות (מדרגות 0.90)'),
        h('label', { className: 'cx-rule' }, h('input', { type: 'checkbox', checked: sh.sprinklers !== false, onChange: e => upd({ sprinklers: e.target.checked }) }), ' ', 'מערכת מתזים'),
        h('span', { className: 'cx-hint', style: { flex: 1, minWidth: 200 } }, 'גובה: הפרש בין מפלס הכניסה הקובעת לכניסה לקומה הגבוהה המאוכלסת (3.1.1.1).'))));

    const floorsCard = Card(2, 'קומות, חללים ודרכי מוצא',
      h('label', { className: 'cx-f', style: { flexDirection: 'row', alignItems: 'center', gap: 8 } }, 'מספר קומות',
        h(Field, { type: 'number', className: 'cx-n', style: { width: 64 }, min: 1, max: 80, value: floors.length, onSave: setCount })),
      h('div', { className: 'cx-card-b' },
        h('div', { className: 'cx-hint', style: { marginBottom: 10 } }, 'בכל קומה: החללים והשימוש בכל אחד מחשבים את מספר האנשים; ממנו נגזרים מספר היציאות, רוחב הדלתות, רוחב הפרוזדור והמדרגות ומנגנון הבהלה. "מפלס" — 0 לקומת היציאה, מספרים חיוביים מעליה ושליליים מתחתיה; מדרגות לא יוצרו בכיוון המילוט.'),
        chk.floors.map(floorBlock)));

    const rows = chk.floors.filter(o => o.f.occ > 0 || (o.fl.exits || []).length);
    const cmp = Card(3, 'נדרש מול מוצע — סיכום קומות', null, h('div', { className: 'cx-card-b' },
      !rows.length ? h('div', { className: 'cx-hint' }, 'הוסיפו חללים כדי לחשב את הדרישה') : h(React.Fragment, null,
        h('div', { className: 'cx-verdict ' + (chk.bad ? 'bad' : 'ok') }, chk.bad ? T('✗ {n} פערים מול הדרישה', { n: chk.bad }) : '✓ דרכי המוצא עומדות בדרישות'),
        h('div', { className: 'cx-scroll' }, h('table', { className: 'cx-t c' },
          h('thead', null, h('tr', null, ['קומה', 'מפלס', 'אנשים', 'דרכי מוצא', 'רוחב אופקי כולל (ס"מ)', 'מדרגות כולל (ס"מ)', 'פרוזדור (ס"מ)', 'בהלה', 'פערים'].map(x => h('th', { key: x }, x)))),
          h('tbody', null, rows.map((o, k) => {
            const cnt = o.lines.find(l => l.k === 'count'), cr = o.lines.find(l => l.k === 'corridor');
            const sumCell = (k, need) => { const l = o.lines.find(z => z.k === k);
              return h('td', { className: 'n ' + (l && !l.ok ? 'cx-bad' : '') }, l ? `${cm(l.have)} / ${cm(l.need)}` : need ? cm(need) : '—'); };
            return h('tr', { key: k, className: o.bad ? 'bad' : '' },
              h('td', Object.assign({ className: 'gl' }, SKIP), o.fl.name), h('td', { className: 'n' }, o.fl.level || 0), h('td', { className: 'n' }, o.f.occ),
              h('td', { className: 'n ' + (cnt.ok ? '' : 'cx-bad') }, `${cnt.have} / ${cnt.need}`),
              sumCell('doorSum', o.f.horizTot), sumCell('stairSum', o.f.stairGov),
              h('td', { className: 'n ' + (cr && !cr.ok ? 'cx-bad' : '') }, cr ? `${cm(cr.have)} / ${cm(cr.need)}` : cm(o.f.corrReq)),
              h('td', null, o.f.panic ? h('span', { className: 'cx-tag warn' }, 'נדרש') : '—'),
              h('td', null, okPill(!o.bad, '✓', T('✗ {n}', { n: o.bad }))));
          })),
          h('tfoot', null, h('tr', null, h('td', { className: 'gl', colSpan: 2 }, 'סה"כ בבניין'), h('td', { className: 'n' }, chk.occ), h('td', { colSpan: 6 }))))))));

    const src = Card(4, 'מקורות', null, h('div', { className: 'cx-card-b' },
      h('div', { className: 'cx-cite' }, '📖 תקנות התכנון והבנייה (בקשה להיתר, תנאיו ואגרות), התש"ל-1970 — תוספת שנייה, חלק ג\': בטיחות אש בבניינים.'),
      h('div', { className: 'cx-cite' }, '3.2.12.1–3.2.12.3 — תפוסה לפי שטח שימושי ומקדם תפוסה (טבלה 3.2.12.2); שטחי פרוזדורים, מדרגות, שירותים וחדרים טכניים אינם בחישוב. 3.2.12.4 — מקדם רוחב: מדרגות 0.8 / מהלך אופקי 0.5 ס"מ לנפש (בתי חולים וסיכון גבוה — לפי הטבלה), לפי מספר האנשים שכל דרך משרתת; סך רוחב דרכי המוצא נותן מענה לתפוסת הקומה כולה (3.2.12.1(ב)), והחלוקה ביניהן אינה חייבת להיות שווה. 3.2.12.5 — פרוזדור: התפוסה חלקי מספר דרכי המוצא כפול המקדם, ולא פחות מטבלה 3.2.12.5. 3.2.12.7 — בשימושים שונים קובע המקדם הרחב.'),
      h('div', { className: 'cx-cite' }, '3.2.1.3 — רוחב דלת: הגדול מבין החישוב לפי התפוסה לבין טבלה 3.2.1.3. 3.2.1.21 — מנגנון בהלה בדלת יציאה מחלק בניין או קומה שתפוסתם מעל 100 איש. 3.2.2.2 — מדרגות 1.10 מ\' לפחות; 1.00 בבניין שאינו גבוה; 0.90 בבניין מגורים עד 2 דירות.'),
      h('div', { className: 'cx-cite' }, '3.2.13.2 — יציאות מחדר: 2 מ-50 איש (או אחסון חומרים מסוכנים מעל 20 מ"ר), 3 מעל 500, 4 מעל 1,000. 3.2.13.3 — דרכי מוצא מקומה: 2, למעט בניין מגורים שאינו רב-קומות או עד 30 איש ומרחק הליכה עד 30 מ\'; 3 מעל 500, 4 מעל 1,000. 3.2.12.1(ג) — אין הפחתה במספר דרכי המוצא או ברוחבן בכיוון המילוט.')));

    return h(React.Fragment, null, head, floorsCard, cmp, src);
  }

  /* ════════ Summary ════════ */
  function SummaryTab({ calcs, go }) {
    const last = k => pickedSheet(calcs[k]);
    const P = last('parking'), H = last('hlt'), G = last('hga'), S = last('safety');
    const head = (ic, name, sh, n) => h('div', { className: 'cx-sc-h' }, h('div', { className: 'ic' }, ic),
      h('div', null, h('b', null, name), h('div', { className: 'm' }, sh ? h(React.Fragment, null, T('בדיקה {n} · {d}', { n: sh.no, d: fmtD(sh.date) }), sh.by ? ' · ' : '', h('span', SKIP, sh.by || '')) : 'טרם נבדק')),
      h('span', { className: 'bdg' }, n > 1 ? T('{n} בדיקות', { n }) : n === 1 ? 'בדיקה אחת' : 'טרם נבדק'));
    const cnt = k => (((calcs[k] || {}).sheets) || []).length;
    let parking, hlt;
    if (P) {
      const t = R.parkingTotals(P), st = P.st != null && P.stations ? P.stations[P.st] : null;
      parking = h('button', { className: 'cx-sc', onClick: () => go('parking') }, head('🅿', 'תנועה וחניה', P, cnt('parking')),
        h('div', { className: 'cx-sc-k' },
          h('div', null, h('span', null, 'רכב פרטי'), h('b', null, R.span(t.min, t.max, t.noMin, t.noMax, T))),
          h('div', null, h('span', null, 'נגישים'), h('b', { style: { color: 'var(--text-3)', fontSize: 13 } }, 'ממתין')),
          h('div', null, h('span', null, 'אופניים'), h('b', null, t.bikes + (t.bikesMissing ? '+' : ''))),
          h('div', null, h('span', null, 'אופנועים'), h('b', null, R.span(t.mMin, t.mMax, false, false, T)))),
        h('div', { className: 'cx-sc-r' }, h('span', null, 'בסיס החישוב'), h('b', null, BASES[P.basis])),
        h('div', { className: 'cx-sc-r' }, h('span', null, 'אזור חניה'), h('b', null, ZONE_INFO[P.zone || 'N'][0])),
        h('div', { className: 'cx-sc-r' }, h('span', null, 'תחנה קובעת'), h('b', null, st ? h(React.Fragment, null, h('span', SKIP, st.name), ' · ', T("{n} מ'", { n: st.d })) : '—')));
    } else parking = h('button', { className: 'cx-sc', onClick: () => go('parking') }, head('🅿', 'תנועה וחניה', null, 0), h('div', { className: 'cx-hint' }, 'מספר מקומות חניה לרכב, אופניים ואופנועים'));
    if (H) {
      const Tot = R.hltTotals(H), chk = R.planCheck(H, Tot), short = chk.lines.filter(l => l.st === 'bad');
      hlt = h('button', { className: 'cx-sc', onClick: () => go('hlt') }, head('🚻', 'הל"ת', H, cnt('hlt')),
        h('div', { className: 'cx-sc-k' }, ['toilet', 'urinal', 'basin', 'drink'].map(k => h('div', { key: k }, h('span', null, R.FIX[k]), h('b', null, Tot.sum[k] || 0)))),
        h('div', { className: 'cx-sc-r' }, h('span', null, 'אסלות גברים / נשים'), h('b', null, `${Tot.m.toilet || 0} / ${Tot.w.toilet || 0}`, Tot.all.toilet ? ' + ' + T('{n} משותפות', { n: Tot.all.toilet }) : '')),
        h('div', { className: 'cx-sc-r' }, h('span', null, 'נדרש מול מוצע'),
          !chk.entered ? h('b', { style: { color: 'var(--text-3)' } }, 'טרם הוזנה תכנית')
            : h('b', null, chk.bad ? h('span', { className: 'cx-p-bad' }, T('✗ {n} פערים', { n: chk.bad })) : h('span', { className: 'cx-p-ok' }, '✓ עומד בדרישות'))),
        chk.entered && short.length > 0 && h('div', { className: 'cx-gaps' }, short.map(l => h('span', { key: l.c.k },
          T(R.FIX[l.c.fx]) + (PCOL_LABEL[l.c.g] ? ' ' + T(PCOL_LABEL[l.c.g]) : '') + ' ', l.gap < 0 ? h('b', null, sgn(l.gap)) : h('b', null, T('קומה'))))));
    } else hlt = h('button', { className: 'cx-sc', onClick: () => go('hlt') }, head('🚻', 'הל"ת', null, 0), h('div', { className: 'cx-hint' }, 'מספר אסלות, משתנות, כיורים — לפי שימוש ואוכלוסייה'));
    let safety;
    if (S) {
      const c = R.safCheck(S), maxEx = c.floors.reduce((a, o) => Math.max(a, o.f.exits), 0), panicFl = c.floors.filter(o => o.f.panic).length;
      safety = h('button', { className: 'cx-sc', onClick: () => go('safety') }, head('🔥', 'בטיחות', S, cnt('safety')),
        h('div', { className: 'cx-sc-k' },
          h('div', null, h('span', null, 'תפוסה בבניין'), h('b', null, c.occ)),
          h('div', null, h('span', null, 'קומות'), h('b', null, c.floors.length)),
          h('div', null, h('span', null, 'דרכי מוצא (מקסימום)'), h('b', null, maxEx)),
          h('div', null, h('span', null, 'קומות עם בהלה'), h('b', null, panicFl))),
        h('div', { className: 'cx-sc-r' }, h('span', null, 'נדרש מול מוצע'),
          h('b', null, c.bad ? h('span', { className: 'cx-p-bad' }, T('✗ {n} פערים', { n: c.bad })) : h('span', { className: 'cx-p-ok' }, '✓ עומד בדרישות'))),
        h('div', { className: 'cx-sc-r' }, h('span', null, 'גובה הבניין'), h('b', null, R.SAF_HEIGHTS[S.height || 'low'])));
    } else safety = h('button', { className: 'cx-sc', onClick: () => go('safety') }, head('🔥', 'בטיחות', null, 0), h('div', { className: 'cx-hint' }, 'תפוסה, מספר יציאות ורוחב יציאות, פרוזדורים ומדרגות'));
    const soon = [];
    let hga;
    if (G) {
      const t = R.hgaTotals(G, T), vents = (G.floors || []).flatMap(f => (f.spaces || []).filter(x => x.kind !== 'mamad').map(x => R.hgaVent(x, G.vent)));
      const vBad = vents.filter(v => !v.ok).length;
      hga = h('button', { className: 'cx-sc', onClick: () => go('hga') }, head('🛡', 'הג"א', G, cnt('hga')),
        h('div', { className: 'cx-sc-k' },
          h('div', null, h('span', null, 'שטח נדרש'), h('b', null, T('{n} מ"ר', { n: t.reqArea }))),
          h('div', null, h('span', null, 'שטח מוצע'), h('b', null, T('{n} מ"ר', { n: t.area }))),
          h('div', null, h('span', null, 'מרחבים מוגנים'), h('b', null, Object.values(t.byKind).reduce((a, o) => a + o.count, 0))),
          h('div', null, h('span', null, 'קומות'), h('b', null, t.floors))),
        h('div', { className: 'cx-sc-r' }, h('span', null, 'נדרש מול מוצע'),
          h('b', null, t.bad ? h('span', { className: 'cx-p-bad' }, T('✗ {n} פערים', { n: t.bad })) : h('span', { className: 'cx-p-ok' }, '✓ עומד בדרישות'))),
        h('div', { className: 'cx-sc-r' }, h('span', null, 'מערכות אוורור וסינון'),
          h('b', null, !vents.length ? '—' : vBad ? h('span', { className: 'cx-p-bad' }, T('✗ {n} מרחבים ללא כיסוי', { n: vBad })) : h('span', { className: 'cx-p-ok' }, '✓ מכוסה'))),
        h('div', { className: 'cx-sc-r' }, h('span', null, 'בסיס החישוב'), h('b', null, BASES[G.basis || 'main'])));
    } else hga = h('button', { className: 'cx-sc', onClick: () => go('hga') }, head('🛡', 'הג"א', null, 0), h('div', { className: 'cx-hint' }, 'שטח מיגון נדרש לפי קומה — ממ"ד / ממ"ק / ממ"מ / מוסדות חינוך'));
    return h('div', { className: 'cx-sum' }, parking, hlt, hga, safety, soon);
  }

  /* ════════ Page ════════ */
  function CalculatorsPage({ data, save, me, embedded }) {
    const [, setLangTick] = useState(0);
    useEffect(() => { const on = () => setLangTick(x => x + 1); window.addEventListener('i18n:change', on); return () => window.removeEventListener('i18n:change', on); }, []);
    const [tab, setTab] = useState(() => { try { return localStorage.getItem('cx-tab') || 'summary'; } catch (e) { return 'summary'; } });
    const [active, setActive] = useState({});
    const go = t => { setTab(t); try { localStorage.setItem('cx-tab', t); } catch (e) {} };
    const calcs = data.calculators || {};
    const saveCalc = (key, fn) => save(Object.assign({}, data, { calculators: Object.assign({}, calcs, { [key]: fn(calcs[key] || { sheets: [] }) }) }));
    const counts = {}; ['parking', 'hlt', 'hga', 'safety'].forEach(k => { counts[k] = ((calcs[k] || {}).sheets || []).length; });

    let body = null, sheetBar = null;
    const c = CALCS.find(x => x.id === tab) || CALCS[0];
    if (c.id === 'summary') body = h(SummaryTab, { calcs, go });
    else if (c.soon) body = h('div', { className: 'cx-card' }, h('div', { className: 'cx-empty' }, h('div', { className: 'ic' }, c.ic), h('b', null, c.name), h('div', null, T('ייבנה לאחר טעינת {l}', { l: T(c.law) }))));
    else {
      const sheets = (calcs[c.id] || {}).sheets || [];
      const curId = sheets.some(s => s.id === active[c.id]) ? active[c.id] : (sheets[sheets.length - 1] || {}).id;
      const idx = sheets.findIndex(s => s.id === curId), sh = sheets[idx];
      const add = () => { const s = newSheet(c.id, sheets[sheets.length - 1], me); saveCalc(c.id, o => Object.assign({}, o, { sheets: (o.sheets || []).concat([s]) })); setActive(a => Object.assign({}, a, { [c.id]: s.id })); };
      const del = id => saveCalc(c.id, o => Object.assign({}, o, { sheets: (o.sheets || []).filter(s => s.id !== id) }));
      const upd = patch => saveCalc(c.id, o => Object.assign({}, o, { sheets: (o.sheets || []).map(s => s.id === curId ? Object.assign({}, s, patch) : s) }));
      if (!sh) body = h('div', { className: 'cx-card' }, h('div', { className: 'cx-empty' }, h('div', { className: 'ic' }, c.ic), h('div', { style: { margin: '6px 0 12px' } }, 'אין עדיין בדיקות'),
        h('button', { className: 'cx-btn pri', onClick: add }, '+ בדיקה ראשונה')));
      else {
        body = c.id === 'parking' ? h(ParkingTab, { key: sh.id, sh, upd, prev: idx > 0 ? sheets[idx - 1] : null })
          : c.id === 'hga' ? h(HgaTab, { key: sh.id, sh, upd }) : c.id === 'safety' ? h(SafetyTab, { key: sh.id, sh, upd }) : h(HltTab, { key: sh.id, sh, upd });
        sheetBar = h(SheetBar, { sheets, active: curId, setActive: id => setActive(a => Object.assign({}, a, { [c.id]: id })), onAdd: add, onDelete: del,
          picked: (pickedSheet(calcs[c.id]) || {}).id, onPick: id => saveCalc(c.id, o => Object.assign({}, o, { pick: id })) });
      }
    }
    return h('div', { className: 'cx' },
      h('div', { className: 'cx-top' + (embedded ? ' emb' : '') }, !embedded && h('h1', null, 'מחשבונים'),
        h('div', { className: 'cx-tabs' }, CALCS.map(x => h('button', { key: x.id, className: 'cx-tab' + (x.id === c.id ? ' on' : ''), onClick: () => go(x.id) },
          x.ic + ' ', x.name, x.id !== 'summary' && h('span', { className: 'cx-pill' }, x.soon ? 'בקרוב' : counts[x.id]))))),
      h('div', { className: 'cx-body' }, body), sheetBar);
  }

  window.CalculatorsUI = { CalculatorsPage };
})();
