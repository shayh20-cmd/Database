/* Calculators (מחשבונים): a project page of regulatory checks — parking and הל"ת today, הג"א and
   fire safety later. Each calculator keeps numbered, dated checks in the project document under
   data.calculators.<key>.sheets; the summary tab shows the latest check of each.
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
    '.cx-empty .ic{font-size:32px}',
  ].join('\n');
  document.head.appendChild(css);

  /* inputs that save on blur or Enter, so typing does not write the document each keystroke */
  function Field({ value, onSave, type, className, placeholder, skip, min, max, style }) {
    const [v, setV] = useState(value == null ? '' : String(value));
    useEffect(() => { setV(value == null ? '' : String(value)); }, [value]);
    const commit = () => {
      const out = type === 'number' ? (v === '' ? null : +v) : v;
      if (String(out == null ? '' : out) !== String(value == null ? '' : value)) onSave(out);
    };
    return h('input', Object.assign({ className: 'cx-in ' + (className || ''), type: type || 'text', value: v, placeholder, min, max, style,
      onChange: e => setV(e.target.value), onBlur: commit, onKeyDown: e => { if (e.key === 'Enter') e.currentTarget.blur(); } }, skip ? SKIP : {}));
  }
  const Card = (n, title, extra, body) => h('div', { className: 'cx-card' },
    h('div', { className: 'cx-card-h' }, h('span', { className: 'cx-num' }, n), title, h('span', { className: 'cx-sp' }), extra), body);

  const CALCS = [
    { id: 'summary', name: 'סיכום', ic: 'Σ' },
    { id: 'parking', name: 'תנועה וחניה', ic: '🅿' },
    { id: 'hlt', name: 'הל"ת', ic: '🚻' },
    { id: 'shelter', name: 'הג"א', ic: '🛡', soon: true, law: 'תקנות ההתגוננות האזרחית' },
    { id: 'safety', name: 'בטיחות', ic: '🔥', soon: true, law: 'תקנות התכנון והבנייה — בטיחות אש' },
  ];
  const ZONE_INFO = { A: ["אזור א'", 'עד 300 מ\' מציר מתע"ן'], B: ["אזור ב'", '300–600 מ\' מציר מתע"ן'], C: ["אזור ג'", 'יישוב עם תכנית מתע"ן'], N: ['ללא מתע"ן', 'יישוב בלא מתע"ן'] };
  const BASES = { main: 'שטח עיקרי (היתר בחלוקה)', total: 'שטח כולל' };
  const G_LABEL = { m: 'גברים', w: 'נשים', u: 'דו-תכליתי', shared: 'משותף (גברים ונשים)' };
  const PCOL_LABEL = { m: 'גברים', w: 'נשים', x: 'משותף' };

  /* ── sheets ── */
  function newSheet(kind, prev, me) {
    const base = prev ? JSON.parse(JSON.stringify(prev)) : (kind === 'parking'
      ? { basis: 'main', zone: 'N', far: 100, rows: [] }
      : { rows: [], plan: { floors: [0, 1, 2].map(i => ({ name: i === 0 ? T('קומת קרקע') : T('קומה {n}', { n: i }), fx: {} })) } });
    base.id = uid(); base.no = prev ? (+prev.no || 0) + 1 : 1; base.date = today(); base.by = me || ''; base.title = '';
    (base.rows || []).forEach(r => { r.id = uid(); });
    if (base.plan) base.plan.floors.forEach(f => { f.id = uid(); });
    return base;
  }
  function SheetBar({ sheets, active, setActive, onAdd, onDelete }) {
    const [arm, setArm] = useState(null);
    return h('div', { className: 'cx-sheets' },
      sheets.map(s => h('div', { key: s.id, className: 'cx-sheet' + (s.id === active ? ' on' : ''), onClick: () => setActive(s.id) },
        h('b', null, T('בדיקה {n}', { n: s.no })), h('span', { className: 'cx-dt' }, fmtD(s.date)),
        s.id === active && h('button', { className: 'cx-sheet-x' + (arm === s.id ? ' arm' : ''), title: 'מחיקת הבדיקה',
          onClick: e => { e.stopPropagation(); if (arm === s.id) { setArm(null); onDelete(s.id); } else setArm(s.id); },
          onMouseLeave: () => setArm(null) }, arm === s.id ? 'למחוק?' : '×'))),
      h('button', { className: 'cx-add', onClick: onAdd, title: 'בדיקה חדשה — מעתיקה את האחרונה' }, '+ בדיקה נוספת'));
  }
  function SheetHead(n, sh, upd) {
    return Card(n, 'פרטי הבדיקה', null, h('div', { className: 'cx-card-b' },
      h('div', { className: 'cx-grid' },
        h('label', { className: 'cx-f' }, 'מספר בדיקה', h(Field, { type: 'number', value: sh.no, onSave: v => upd({ no: v }) })),
        h('label', { className: 'cx-f' }, 'תאריך', h(Field, { type: 'date', value: sh.date, onSave: v => upd({ date: v }) })),
        h('label', { className: 'cx-f' }, 'בוצע ע"י', h(Field, { value: sh.by, skip: true, onSave: v => upd({ by: v }) })),
        h('label', { className: 'cx-f' }, 'כותרת / הערה', h(Field, { value: sh.title, skip: true, onSave: v => upd({ title: v }) }))),
      sh.basis != null && h('div', { className: 'cx-basis' },
        h('b', null, 'בסיס החישוב'),
        h('div', { className: 'cx-seg' }, Object.keys(BASES).map(k => h('button', { key: k, className: sh.basis === k ? 'on' : '', onClick: () => upd({ basis: k }) }, BASES[k]))),
        h('span', { className: 'cx-hint', style: { flex: 1, minWidth: 220 } }, sh.basis === 'total'
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

  /* ════════ Summary ════════ */
  function SummaryTab({ calcs, go }) {
    const last = k => { const s = ((calcs[k] || {}).sheets) || []; return s[s.length - 1]; };
    const P = last('parking'), H = last('hlt');
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
    const soon = CALCS.filter(c => c.soon).map(c => h('div', { key: c.id, className: 'cx-sc', style: { cursor: 'default' } },
      h('div', { className: 'cx-sc-h' }, h('div', { className: 'ic' }, c.ic), h('div', null, h('b', null, c.name), h('div', { className: 'm' }, c.law)), h('span', { className: 'bdg' }, 'בקרוב')),
      h('div', { className: 'cx-hint' }, c.id === 'shelter' ? 'שטח מיגון נדרש — ממ"ד / ממ"ק / מקלט' : 'תפוסה, מספר יציאות ורוחב יציאות')));
    return h('div', { className: 'cx-sum' }, parking, hlt, soon);
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
    const counts = { parking: ((calcs.parking || {}).sheets || []).length, hlt: ((calcs.hlt || {}).sheets || []).length };

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
        body = c.id === 'parking' ? h(ParkingTab, { key: sh.id, sh, upd, prev: idx > 0 ? sheets[idx - 1] : null }) : h(HltTab, { key: sh.id, sh, upd });
        sheetBar = h(SheetBar, { sheets, active: curId, setActive: id => setActive(a => Object.assign({}, a, { [c.id]: id })), onAdd: add, onDelete: del });
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
