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
    // a full-screen-wide table is hard to read: keep the content in a centred column
    '.cx-body>*{max-width:1080px;margin-inline:auto}',
    '.cx-sheets{display:flex;align-items:flex-end;gap:2px;background:var(--surface-2);border-top:1px solid var(--border);padding:0 14px;min-height:36px;overflow-x:auto}',
    '.cx-sheet{border:1px solid var(--border);border-top:none;background:var(--bg);padding:6px 12px;border-radius:0 0 8px 8px;cursor:pointer;color:var(--text-2);font-size:12px;display:flex;gap:6px;align-items:center;white-space:nowrap}',
    '.cx-sheet.on{background:var(--surface);color:var(--text);box-shadow:inset 0 2px 0 var(--accent)}',
    '.cx-sheet .cx-dt{color:var(--text-3);font-size:11px}',
    '.cx-sheet .cx-pick{margin:0;cursor:pointer;accent-color:var(--accent)}',
    '.cx-sheet-x{border:none;background:none;color:var(--text-3);cursor:pointer;font-size:13px;padding:0 2px}',
    '.cx-sheet-x.arm{color:#DC2626;font-weight:700;font-size:11px}',
    '.cx-add{border:1px dashed var(--border-strong);background:none;border-top:none;border-radius:0 0 8px 8px;padding:6px 12px;cursor:pointer;color:var(--accent);font:inherit;font-size:12px;font-weight:600;white-space:nowrap}',
    '.cx-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg,12px);margin-bottom:14px;overflow:clip}',
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
    // הג"א: one table per floor, the offer beside the uses it answers
    '.cx-hgat td,.cx-hgat th{padding:5px}',
    '.cx-hgat .cx-o{border-inline-start:1px solid var(--border-strong,var(--border));background:color-mix(in srgb,var(--text) 3%,var(--surface));text-align:start;vertical-align:top}',
    '.cx-hgat th.cx-o{background:none}',
    '.cx-hk{font-size:12px;color:var(--text-2);margin-bottom:4px}',
    '.cx-hk b{color:var(--text)}',
    '.cx-hk2{margin-top:4px}',
    '.cx-chip-diff{box-shadow:inset 0 0 0 1px rgba(217,119,6,.6);background:rgba(217,119,6,.14)}',
    '.cx-twf{flex-basis:100%;display:flex;flex-wrap:wrap;gap:6px 32px;align-items:flex-start}',
    '.cx-flight>.cx-hint{order:1;flex-basis:100%}.cx-flight>.cx-twf{order:2}',
    '.cx-twc{width:150px;display:flex;flex-direction:column;gap:3px}',
    '.cx-twh{font-size:12px;font-weight:700;color:var(--text-2);padding-bottom:3px;border-bottom:1px solid var(--border)}',
    '.cx-twr{display:flex;align-items:center;gap:6px;min-height:28px}',
    '.cx-twr label{flex:1;min-width:0}',
    '.cx-tone .cx-card{border-color:color-mix(in srgb,var(--text) 17%,var(--surface))}',
    '.cx-tone .cx-card-h{background:color-mix(in srgb,var(--text) 7%,var(--surface));border-bottom-color:color-mix(in srgb,var(--text) 15%,var(--surface))}',
    '.cx-tone .cx-blk{border-color:color-mix(in srgb,var(--accent) 32%,var(--surface))}',
    '.cx-tone .cx-blk-h{background:color-mix(in srgb,var(--accent) 14%,var(--surface));border-bottom-color:color-mix(in srgb,var(--accent) 32%,var(--surface))}',
    '.cx-tone .cx-t th{background:color-mix(in srgb,var(--text) 4%,var(--surface));color:var(--text-2);border-bottom-color:color-mix(in srgb,var(--text) 15%,var(--surface))}',
    '.cx-tone .cx-t tr.bld td{background:color-mix(in srgb,var(--text) 5%,var(--surface))}',
    '.cx-tone .cx-t tfoot td{background:color-mix(in srgb,var(--accent) 10%,var(--surface));border-top:1px solid color-mix(in srgb,var(--accent) 32%,var(--surface))}',
    '.cx-tone .cx-st-head{background:color-mix(in srgb,var(--text) 7%,var(--surface))}',
    '.cx-tone .cx-zones{margin-top:14px;padding-top:12px;border-top:2px solid color-mix(in srgb,var(--text) 28%,var(--surface))}',
    '.cx-hlay{container-type:inline-size}',
    '.cx-hrow{display:flex;gap:14px;align-items:flex-start}',
    '.cx-hfl{flex:1;min-width:0}',
    '.cx-hsec{flex:0 0 270px;position:sticky;top:8px;border:1px solid var(--border);border-radius:10px;padding:10px;background:var(--surface)}',
    '@container (max-width:960px){.cx-hrow{flex-direction:column-reverse;align-items:stretch}.cx-hsec{position:static;flex:none}}',
    '.cx-hsec-t{font-weight:700;font-size:13px;margin-bottom:8px}',
    '.cx-hsec.cx-hsaf{flex-basis:328px}',
    '@container (max-width:960px){.cx-hsec.cx-hsaf{flex:none}}',
    '.cx-hsaf .cx-fchip{padding:2px 6px}',
    '.cx-sec-i{justify-content:flex-start;padding:3px 4px;white-space:nowrap;font-variant-numeric:tabular-nums}',
    '.cx-sec-th{font-size:11px;font-weight:700;color:var(--text-2);padding:0 4px 4px;align-self:end}',
    '.cx-sec-hc{display:flex;flex-direction:column;align-items:center;gap:2px;padding-bottom:4px;align-self:end}',
    '.cx-sec-hc .cx-sec-h{margin:0}',
    '.cx-sec-hc .cx-tag{font-size:10px;padding:0 5px}',
    '.cx-sec-b{border:0;background:none;padding:0;font:inherit;cursor:pointer;color:inherit}',
    '.cx-sect .k-st{--k:var(--accent)}',
    '.cx-sec-q.prot{border:3px double var(--text)}',
    '.cx-sect{display:grid;font-size:11px;max-height:520px;overflow:auto}',
    '.cx-sect .k-mamam{--k:var(--accent)}.cx-sect .k-mamad{--k:#0d9488}.cx-sect .k-mamak{--k:#7c3aed}.cx-sect .k-edu{--k:#c2410c}',
    '.cx-sec-l{display:flex;align-items:center;gap:3px;height:var(--rh);padding-inline-end:6px;white-space:nowrap;overflow:hidden;color:var(--text-2)}',
    '.cx-sec-l span{overflow:hidden;text-overflow:ellipsis}',
    '.cx-sec-l .cx-p-bad{flex:none;padding:0 3px;font-size:10px}',
    '.cx-sec-c{display:flex;align-items:center;justify-content:center;height:var(--rh);padding:3px 1px;min-width:0;border-bottom:1px solid color-mix(in srgb,var(--text) 28%,var(--surface))}',
    '.cx-sec-c.top{border-top:2px solid color-mix(in srgb,var(--text) 45%,var(--surface))}',
    '.cx-sec-c.gnd{border-bottom:3px solid color-mix(in srgb,var(--text) 55%,var(--surface))}',
    '.cx-sec-c.und{background:color-mix(in srgb,var(--text) 6%,var(--surface))}',
    '.cx-sec-c.ws{border-inline-start:2px solid color-mix(in srgb,var(--text) 45%,var(--surface))}',
    '.cx-sec-c.we{border-inline-end:2px solid color-mix(in srgb,var(--text) 45%,var(--surface))}',
    '.cx-sec-h,.cx-sec-q{border:0;padding:0;font:inherit;font-weight:700;color:var(--text);cursor:pointer;background:color-mix(in srgb,var(--k) 26%,var(--surface));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--k) 60%,var(--surface))}',
    '.cx-sec-h{justify-self:center;align-self:center;min-width:20px;height:20px;margin-bottom:4px;border-radius:10px}',
    '.cx-sec-q{height:100%;min-width:14px;border-radius:3px;overflow:hidden;font-size:10.5px;font-variant-numeric:tabular-nums}',
    '.cx-sec-q.ok,.cx-sec-h.ok{background:rgba(22,163,74,.2);box-shadow:inset 0 0 0 1px rgba(22,163,74,.75)}',
    '.cx-sec-q.own{outline:1.5px dashed #d97706;outline-offset:-2px}',
    '.cx-sec-q.short{box-shadow:inset 0 0 0 2px #dc2626}',
    '.cx-sec-q.size,.cx-sec-h.bad{background:rgba(220,38,38,.2);box-shadow:inset 0 0 0 1.5px #dc2626;color:#dc2626}',
    '.cx-sec-q.on,.cx-sec-h.on{outline:2px solid var(--text);outline-offset:0}',
    '.cx-sec-h:focus-visible,.cx-sec-q:focus-visible{outline:2px solid var(--accent);outline-offset:1px}',
    '.cx-fhga{flex-wrap:wrap;white-space:normal;color:var(--text-2)}',
    '.cx-fhga b{color:var(--text)}',
    '.cx-ftw{display:inline-flex;align-items:center;font-variant-numeric:tabular-nums;font-weight:700;color:var(--text)}',
    '.cx-sys{display:flex;flex-wrap:wrap;gap:4px;align-items:center;justify-content:center}',
    '.cx-chip{display:inline-flex;align-items:center;gap:2px;background:rgba(37,99,235,.1);color:var(--accent);border-radius:10px;padding:1px 4px 1px 8px;font-weight:700;font-size:12px}',
    '.cx-chip button{border:none;background:none;color:inherit;cursor:pointer;font-size:12px;padding:0 3px}',
    '.cx-in.cx-addsys{width:auto;padding:2px 6px;font-size:12px}',
    '.cx-blk-h .cx-p-ok,.cx-blk-h .cx-p-bad{font-size:11px}',
    '.cx-saf td,.cx-saf th{padding:5px 3px}',
    '.cx-chips{display:flex;flex-wrap:wrap;gap:4px 6px;align-items:center}',
    // safety floors: a closed floor is one bar with its totals; open, it shows its tools, table and notes
    '.cx-floor{border-color:var(--border-strong,var(--border));margin-bottom:14px}',
    '.cx-floor.open{box-shadow:0 1px 4px rgba(0,0,0,.06)}',
    '.cx-fbar{padding:0;gap:0;flex-wrap:nowrap}',
    '.cx-floor>.cx-fbar{background:color-mix(in srgb,var(--accent) 14%,var(--surface));border-bottom-color:color-mix(in srgb,var(--accent) 32%,var(--surface))}',
    '.cx-fold{flex:1;min-width:0;display:flex;align-items:center;flex-wrap:wrap;background:none;border:0;cursor:pointer;font:inherit;color:inherit;text-align:start;padding:10px 12px;gap:8px}',
    '.cx-floor:not(.open) .cx-fbar{border-bottom:0}',
    '.cx-fbar:hover{filter:brightness(.98)}',
    '.cx-grip{cursor:grab;color:var(--text-3);padding-block:10px;padding-inline:10px 2px;font-size:14px;line-height:1;user-select:none}',
    '.cx-grip:active{cursor:grabbing}',
    '.cx-fdel{margin-inline-end:8px;flex:none}',
    '.cx-copy{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;padding:8px 12px;background:var(--surface-2);border-bottom:1px solid var(--border)}',
    '.cx-copy .cx-btn:disabled{opacity:.5;cursor:default}',
    '.cx-fadd{display:flex;gap:8px}',
    '.cx-prot{display:flex;flex-wrap:wrap;gap:4px 8px;align-items:center;margin-top:10px;font-size:12.5px}',
    '.cx-prot+.cx-prot{margin-top:4px}',
    '.cx-stno{font-size:10px!important;font-weight:700;padding:0 5px!important;min-width:16px}',
    // inside a floor: the spaces and the exits are two bands, and each kind of exit is a card of its own
    '.cx-sec{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;padding:7px 12px;font-weight:700;font-size:13px;background:color-mix(in srgb,var(--text) 7%,var(--surface));border-bottom:1px solid color-mix(in srgb,var(--text) 15%,var(--surface))}',
    '.cx-sec small{font-weight:400;font-size:11.5px;color:var(--text-2)}',
    '.cx-sec-x{border-top:2px solid color-mix(in srgb,var(--text) 28%,var(--surface));margin-top:-1px}',
    '.cx-xarea{background:color-mix(in srgb,var(--text) 3%,var(--surface));padding:12px}',
    '.cx-xcards{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px}',
    '.cx-xcard{display:flex;flex-direction:column;gap:6px;background:var(--surface);border:1px solid color-mix(in srgb,var(--text) 17%,var(--surface));border-radius:8px;padding:8px 10px;min-width:0}',
    '.cx-xhead{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12.5px}',
    '.cx-xreq{display:flex;flex-wrap:wrap;align-items:center;gap:2px 10px;font-size:11.5px;color:var(--text-3)}',
    '.cx-xreq b{font-weight:600;color:var(--text-2)}',
    '.cx-xbad{color:#b91c1c}',
    '.cx-xcard select.cx-in{width:100%}',
    '.cx-xarea .cx-copy{margin-top:10px;background:var(--surface);border:1px solid var(--border);border-radius:8px}',
    '.cx-xnote{display:block;margin-top:10px}',
    '.cx-nw{white-space:nowrap}',
    '.cx-fno{min-width:14px;height:14px;line-height:14px;border-radius:50%;background:rgba(0,0,0,.08);font-size:9.5px;text-align:center;margin-inline-end:4px}',
    '.cx-fflights{display:flex;flex-wrap:wrap;gap:4px;justify-content:center}',
    '.cx-fflights .cx-fchip{display:inline-flex;align-items:center}',
    '.cx-drop-up{box-shadow:0 -3px 0 var(--accent)}',
    '.cx-drop-down{box-shadow:0 3px 0 var(--accent)}',
    '.cx-chev{display:inline-block;transition:transform .15s;font-size:16px;line-height:1;color:var(--text-3)}',
    '[dir=rtl] .cx-chev{transform:scaleX(-1)}',
    '.cx-floor.open .cx-chev{transform:rotate(90deg)}',
    '.cx-fgrp{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;color:var(--text-3);white-space:nowrap}',
    '.cx-fchip{font-size:11.5px;padding:2px 8px;border-radius:10px;font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.cx-fchip.ok{background:var(--ok-bg,#ecfdf5);color:var(--ok-fg,#047857)}',
    '.cx-fchip.bad{background:var(--danger-row,#FFF5F5);color:#b91c1c}',
    '.cx-ftools{display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;padding:8px 12px;border-bottom:1px solid var(--border)}',
    '.cx-ftools .cx-f{gap:2px;font-size:11px}',
    '.cx-fac{white-space:nowrap}',
    '.cx-why{border-top:1px solid var(--border)}',
    '.cx-why>summary{cursor:pointer;padding:7px 12px;font-size:12px;color:var(--text-2)}',
    '.cx-why .cx-req{border-bottom:0}',
    '.cx-chip{display:inline-flex;align-items:center;gap:0}',
    '.cx-chip .cx-x{padding:0 3px;border:0;background:none}',
    '.cx-in.cx-in-bad{border-color:#dc2626}',
    // no spinner arrows in the safety widths, so the whole number shows
    '.cx-ns{-moz-appearance:textfield;appearance:textfield}',
    '.cx-ns::-webkit-inner-spin-button,.cx-ns::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}',
    '.cx-req{background:var(--surface-2);border-top:1px solid var(--border);border-bottom:1px solid var(--border);font-size:12.5px;color:var(--text-2);display:flex;flex-direction:column;gap:3px;padding:8px 12px}',
    '.cx-req b{color:var(--text)}',
    '.cx-req>div{max-width:80ch}',
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
  function SheetHead(n, sh, upd, hints, extra) {
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
          : 'החישוב לפי השטחים העיקריים המבוקשים בהיתר; שטחי שירות אינם נכללים.')),
      extra));
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

    return h('div', { className: 'cx-tone' }, SheetHead(1, sh, upd), zoneCard, usesCard, resultCard);
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

    return h('div', { className: 'cx-tone' }, SheetHead(1, sh, upd), usesCard,
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
    // floors numbered and spaces in towers: an older sheet moves over with its next change
    const sheet = R.hgaSheet(sh), floors = sheet.floors, towers = sheet.towers, shown = sheet.resolved;
    const [open, setOpen] = useState({}), [countKey, setCountKey] = useState(0), [twEdit, setTwEdit] = useState(null);
    // a click in the section opens the tower's panel on that floor and lands on the box for what was clicked
    useEffect(() => {
      if (!twEdit || !twEdit.jump) return;
      const p = document.querySelector('.cx-flight');
      if (!p) return;
      p.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const box = p.querySelector(twEdit.cell ? '[data-fl="' + twEdit.cell + '"] input[type=number]' : 'input[type=number]');
      if (box) { box.focus({ preventScroll: true }); box.select(); }
    }, [twEdit]);
    const jumpTo = (id, floorId, cell) => { setOpen(s => Object.assign({}, s, { [floorId]: true })); setTwEdit({ id, floor: floorId, cell, jump: true }); };
    const setFloors = (fl, tw) => upd({ floors: fl, towers: R.hgaPruneTowers(tw || towers, fl) });
    const setFloor = (i, patch) => setFloors(floors.map((f, j) => j === i ? Object.assign({}, f, patch) : f));
    const setTower = (id, p) => upd({ floors, towers: towers.map(t => t.id === id ? Object.assign({}, t, p) : t) });
    const towerNo = id => towers.findIndex(t => t.id === id) + 1;
    const counts = R.safFloorCounts(floors);
    const nameList = list => '⁨' + list.map(f => R.safFloorLabel(f, T)).join(', ') + '⁩';
    const setCounts = async (above, below) => {
      setCountKey(k => k + 1);  // the boxes go back to the real counts if this is refused or cancelled
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(+v) || 0));
      const next = R.safSetCounts(floors, clamp(above, 1, 80), clamp(below, 0, 20), level => ({ id: uid(), name: R.safFloorName(level), level, uses: [], spaces: [] }));
      const lost = floors.filter(f => !next.includes(f) && R.hgaFloorHasData(f));
      if (lost.length && !await window.askConfirm(T('יימחקו קומות שיש בהן מידע: {n}. להמשיך?', { n: nameList(lost) }))) return;
      setFloors(next);
    };
    const delFloor = async i => {
      const ok = !R.hgaFloorHasData(floors[i]) || await window.askConfirm(T('למחוק את {n}? השימושים והמרחבים שלה יימחקו.', { n: '⁨' + R.safFloorLabel(floors[i], T) + '⁩' }));
      if (ok) setFloors(R.safRemoveFloor(floors, i));
    };
    const dupFloor = i => setFloors(R.hgaCopyFloorUp(floors, i, uid));
    // a new tower starts on every floor that needs this kind of space, since it usually runs through them
    const addTower = (kind, i) => {
      const t = { id: uid(), kind, area: null };
      const fl = floors.reduce((list, f, k) => k === i || checks[k].lines.some(l => l.kind === kind && l.reqArea > 0) ? R.hgaSetTowerFloor(list, t, f.id, true, uid) : list, floors);
      setFloors(fl, towers.concat([t])); setTwEdit({ id: t.id, floor: floors[i].id });
    };
    const delTower = async id => {
      if (!await window.askConfirm(T('למחוק את מגדל {n} מכל הקומות?', { n: towerNo(id) }))) return;
      setFloors(floors.map(f => Object.assign({}, f, { spaces: (f.spaces || []).filter(s => s.tower !== id) }))); setTwEdit(null);
    };
    // "every floor" off leaves the floor the panel sits on, so the tower stays in view
    const setAllFloors = (t, on, here) => setFloors(floors.reduce((list, f) => R.hgaSetTowerFloor(list, t, f.id, on || f.id === here, uid), floors));
    const areaLbl = sh.basis === 'total' ? 'שטח כולל בקומה (מ"ר)' : 'שטח עיקרי בקומה (מ"ר)';
    const useOpts = Object.keys(R.HGA_GROUPS).map(g => h('optgroup', { key: g, label: T(R.HGA_GROUPS[g]) },
      R.HGA_USES.filter(u => u.g === g).map(u => h('option', { key: u.id, value: u.id }, T(u.name)))));
    const checks = shown.map(f => R.hgaCheckFloor(f, sh.basis, T));

    const verdict = l => l.ok ? (l.gap > 0 ? T('✓ עודף {n} מ"ר', { n: l.gap }) : T('✓ תקין'))
      : l.gap < 0 ? T('✗ חסר {n} מ"ר', { n: r2(-l.gap) }) : l.cgap < 0 ? T('✗ חסרים {n} מרחבים', { n: -l.cgap })
      : l.tooSmall.length ? T('✗ מרחב קטן מ-{n} מ"ר', { n: l.minEach }) : T('✗ מרחב גדול מ-{n} מ"ר', { n: l.maxEach });

    const floorBlock = (f, i) => {
      const chk = checks[i], uses = f.uses || [], spaces = shown[i].spaces, tower = twEdit && twEdit.floor === f.id ? towers.find(t => t.id === twEdit.id) : null;
      const setUses = us => setFloor(i, { uses: us });
      const setUse = (j, p) => setUses(uses.map((u, k) => k === j ? Object.assign({}, u, p) : u));
      // a floor's area matching its tower's is no difference, so an empty box means "the same"
      const setOwnArea = (Fi, t, v) => setFloor(Fi, { spaces: floors[Fi].spaces.map(s => s.tower === t.id ? Object.assign({}, s, { area: v == null || +v === +t.area ? null : v }) : s) });
      const isOpen = open[f.id || i] != null ? open[f.id || i] : i === 0;
      // the requirement adds up per kind of space, so the uses sharing a kind sit together beside one offer
      const groups = [];
      uses.forEach((u, j) => {
        const x = R.hgaRow(u, sh.basis, T); if (!x) return;
        const g = x.space && groups.find(o => o.kind === x.space);
        if (g) g.rows.push({ u, j, x }); else groups.push({ kind: x.space, rows: [{ u, j, x }] });
      });
      chk.lines.forEach(l => { if (!groups.some(o => o.kind === l.kind)) groups.push({ kind: l.kind, rows: [] }); });
      const offer = g => {
        const rowSpan = Math.max(1, g.rows.length), l = chk.lines.find(o => o.kind === g.kind);
        if (!l) return [h('td', { key: 'o', className: 'cx-o', rowSpan }, '—'), h('td', { key: 's', className: 'cx-o', rowSpan }, '—')];
        const mine = spaces.map((x, j) => ({ x, j })).filter(o => o.x.kind === g.kind);
        return [
          h('td', { key: 'o', className: 'cx-o', rowSpan },
            h('div', { className: 'cx-hk' }, h('b', null, T(R.HGA_KINDS[g.kind])), ' · ', T('נדרש {a} מ"ר', { a: l.reqArea }), l.reqCount ? ' · ' + T('{n} מרחבים', { n: l.reqCount }) : ''),
            h('div', { className: 'cx-chips' },
              // the same tower on every floor it runs through: its area changes everywhere, unless this floor has its own
              mine.map(({ x, j }) => { const a = +x.area || 0, off = (l.minEach && a < l.minEach) || (l.maxEach && a > l.maxEach);
                const t = towers.find(o => o.id === x.tower), no = towerNo(x.tower), own = f.spaces[j].area != null, edit = () => setTwEdit({ id: x.tower, floor: f.id });
                return h('span', { key: x.id || j, className: 'cx-chip' + (own ? ' cx-chip-diff' : ''), onFocus: e => { if (e.target.tagName === 'INPUT') edit(); } },
                  h('button', { className: 'cx-stno', title: T('מגדל {n}', { n: no }), onClick: edit }, no),
                  h(Field, { type: 'number', className: 'cx-n cx-ns' + (off ? ' cx-in-bad' : ''), style: { width: 62 }, value: x.area, placeholder: '0', title: own ? T('שטח שונה בקומה הזו') : T('שטח המגדל, בכל הקומות'), onSave: v => own ? setOwnArea(i, t, v) : setTower(t.id, { area: v }) }),
                  h('button', { className: 'cx-x', title: 'הסרה מהקומה הזו', onClick: () => setFloors(R.hgaSetTowerFloor(floors, t, f.id, false)) }, '×')); }),
              h('button', { className: 'cx-btn', title: 'מגדל מרחב מוגן נוסף', onClick: () => addTower(g.kind, i) }, '+ מגדל')),
            (l.minEach > 0 || l.maxEach > 0) && h('div', { className: 'cx-rule cx-hk2' }, [l.minEach ? T('כל מרחב לפחות {n} מ"ר', { n: l.minEach }) : null, l.maxEach ? T('עד {a} מ"ר', { a: l.maxEach }) : null].filter(Boolean).join(' · '))),
          h('td', { key: 's', className: 'cx-o', rowSpan }, h('span', { className: l.ok ? 'cx-p-ok' : 'cx-p-bad' }, verdict(l)))];
      };
      const useRow = (g, { u, j, x }, n) => {
        const def = x.u, none = def.kind === 'none', tip = [x.text, def.ref].filter(Boolean).join(' · ');
        return h('tr', { key: u.id || j },
          h('td', { style: { textAlign: 'start' } }, h('select', { className: 'cx-in', style: { minWidth: 170, maxWidth: 220 }, value: u.type, onChange: e => setUse(j, { type: e.target.value }) }, useOpts)),
          h('td', null, none ? '—' : h('div', { className: 'cx-qty', style: { justifyContent: 'center' } },
            h(Field, { type: 'number', className: 'cx-n cx-ns', style: { width: 66 }, value: u.qty, title: def.kind === 'pct' ? (def.m === 'gross' ? T('שטח ברוטו (מ"ר)') : T(areaLbl)) : undefined, onSave: v => setUse(j, { qty: v }) }),
            h('span', { className: 'cx-rule' }, def.kind === 'pct' ? 'מ"ר' : def.unit ? T(def.unit) : ''))),
          h('td', { className: 'cx-rule', title: tip }, x.rate || x.text, def.confirm && h('span', { className: 'cx-tag warn', style: { marginInlineStart: 4 } }, 'לאימות')),
          h('td', { className: 'n' }, none ? '—' : r2(x.area)),
          h('td', null, h('button', { className: 'cx-x', title: 'הסרה', onClick: () => setUses(uses.filter((_, k) => k !== j)) }, '×')),
          n === 0 && offer(g));
      };
      return h('div', { key: f.id || i, className: 'cx-blk cx-floor' + (isOpen ? ' open' : '') },
        h('div', { className: 'cx-blk-h cx-fbar' },
          h('button', { className: 'cx-fold', 'aria-expanded': isOpen, onClick: () => setOpen(s => Object.assign({}, s, { [f.id || i]: !isOpen })) },
            h('span', { className: 'cx-chev', 'aria-hidden': true }, '›'),
            h('b', SKIP, R.safFloorLabel(f, T)),
            h('span', { className: 'cx-sp', style: { flex: 1 } }),
            // what is required, then what each tower gives here and the sum; a floor of many apartments gives just the count
            chk.lines.map(l => { const mine = spaces.filter(x => x.kind === l.kind).map(x => ({ no: towerNo(x.tower), a: +x.area || 0 })).sort((a, b) => a.no - b.no);
              return h('span', { key: l.kind, className: 'cx-fgrp cx-fhga' }, h('b', null, T(R.HGA_KINDS[l.kind])),
                h('span', null, T('נדרש {a} מ"ר', { a: l.reqArea })), h('span', { 'aria-hidden': true }, '·'), h('span', null, T('מוצע')),
                mine.length > 4 ? h('span', null, T('{n} מרחבים', { n: mine.length })) : mine.map((m, k) => h(React.Fragment, { key: m.no }, k > 0 && '+',
                  h('span', { className: 'cx-ftw', title: T('מגדל {n}', { n: m.no }) }, h('small', { className: 'cx-fno' }, m.no), m.a))),
                h('span', { className: 'cx-fchip ' + (l.ok ? 'ok' : 'bad') }, T('סה"כ {a} מ"ר', { a: l.area }))); }),
            chk.lines.length > 0 && h('span', { className: chk.bad ? 'cx-p-bad' : 'cx-p-ok' }, chk.bad ? T('✗ {n}', { n: chk.bad }) : '✓')),
          floors.length > 1 && h('button', { className: 'cx-x cx-fdel', title: 'הסרת הקומה', onClick: () => delFloor(i) }, '×')),
        isOpen && h('div', { className: 'cx-ftools' },
          h('label', { className: 'cx-f' }, 'כינוי לקומה', h(Field, { key: 'n' + countKey, value: R.safFloorNick(f), placeholder: R.safFloorLabel(Object.assign({}, f, { name: '' }), T), skip: true, style: { width: 120 },
            onSave: v => { setCountKey(k => k + 1); setFloor(i, { name: (v || '').trim() }); } })),
          h('span', { className: 'cx-sp', style: { flex: 1 } }),
          h('button', { className: 'cx-btn', onClick: () => dupFloor(i), title: 'קומה נוספת למעלה, עם אותם שימושים ובאותם מגדלים' }, '⧉ שכפל')),
        isOpen && h('div', { className: 'cx-scroll' }, h('table', { className: 'cx-t c cx-hgat' },
          h('thead', null, h('tr', null, h('th', { style: { textAlign: 'start' } }, 'שימוש'), h('th', null, 'כמות'), h('th', null, 'מקדם'), h('th', null, 'נדרש (מ"ר)'), h('th', null),
            h('th', { className: 'cx-o' }, 'מרחבים מוצעים (מ"ר נטו)'), h('th', { className: 'cx-o' }, 'עומד'))),
          h('tbody', null,
            groups.map(g => g.rows.length ? g.rows.map((r, n) => useRow(g, r, n))
              : h('tr', { key: 'k' + g.kind }, h('td', { colSpan: 5, className: 'cx-hint', style: { textAlign: 'start' } }, 'אין בקומה שימוש שדורש את המרחב הזה'), offer(g))),
            h('tr', null, h('td', { colSpan: 7, style: { textAlign: 'start' } },
              h('button', { className: 'cx-btn', onClick: () => setUses(uses.concat([{ id: uid(), type: 'off', qty: 0 }])) }, '+ שימוש'),
              !uses.length && h('span', { className: 'cx-hint', style: { marginInlineStart: 8 } }, 'הוסיפו את השימושים בקומה')))))),
        isOpen && tower && h('div', { className: 'cx-copy cx-flight' },
          h('b', null, T('מגדל {n} — {k}', { n: towerNo(tower.id), k: T(R.HGA_KINDS[tower.kind]) })),
          h('label', { className: 'cx-f', style: { flexDirection: 'row', alignItems: 'center', gap: 6 } }, 'שטח המגדל (מ"ר נטו)',
            h(Field, { type: 'number', className: 'cx-n cx-ns', style: { width: 66 }, value: tower.area, placeholder: '0', onSave: v => setTower(tower.id, { area: v }) })),
          h('label', { className: 'cx-rule' }, h('input', { type: 'checkbox', checked: floors.every(t => (t.spaces || []).some(s => s.tower === tower.id)), onChange: e => setAllFloors(tower, e.target.checked, f.id) }), ' ', 'כל הקומות'),
          h('span', { className: 'cx-hint' }, 'השאירו ריק כשהשטח זהה לשטח המגדל'),
          h('span', { className: 'cx-sp', style: { flex: 1 } }),
          h('button', { className: 'cx-btn', onClick: () => delTower(tower.id) }, 'מחיקת המגדל'),
          h('button', { className: 'cx-btn pri', onClick: () => setTwEdit(null) }, 'סגור'),
          // top floor first in each column, as in the section
          h('div', { className: 'cx-twf' }, [['מעל הקרקע', floors.filter(t => (+t.level || 0) >= 0)], ['מתחת לקרקע', floors.filter(t => (+t.level || 0) < 0)]].filter(c => c[1].length).map(([head, list]) => h('div', { key: head, className: 'cx-twc' }, h('div', { className: 'cx-twh' }, head), list.slice().reverse().map(t => { const s = (t.spaces || []).find(o => o.tower === tower.id), k = floors.indexOf(t);
            return h('div', { key: t.id, className: 'cx-twr', 'data-fl': t.id },
              h('label', { className: 'cx-rule' }, h('input', { type: 'checkbox', checked: !!s, onChange: e => setFloors(R.hgaSetTowerFloor(floors, tower, t.id, e.target.checked, uid)) }), ' ', h('span', SKIP, R.safFloorLabel(t, T))),
              s && h(Field, { type: 'number', className: 'cx-n cx-ns', style: { width: 66 }, value: s.area, placeholder: tower.area == null ? '0' : String(tower.area), title: T('שטח שונה בקומה הזו'), onSave: v => setOwnArea(k, tower, v) })); }))))));
    };

    // the building in section: one column per tower, a block per floor as wide as its area
    const sectionView = () => {
      const { rows, cols } = R.hgaSection(sh, T), n = cols.length, last = rows.length - 1;
      if (!n) return h('div', { className: 'cx-hint' }, 'הוסיפו מגדל כדי לראות אותו בחתך');
      const lowest = id => [...rows].reverse().find(r => r.cells[cols.findIndex(c => c.id === id)]).fl.id;
      return h(React.Fragment, null,
        h('div', { className: 'cx-sect', style: { gridTemplateColumns: 'minmax(50px,auto) ' + cols.map(c => 'minmax(22px,' + c.max + 'fr)').join(' '), '--rh': Math.max(22, Math.min(36, Math.round(420 / rows.length))) + 'px' } },
          h('span', null),
          cols.map(c => h('button', { key: c.id, className: 'cx-sec-h k-' + c.kind + (c.bad ? ' bad' : c.ok ? ' ok' : '') + (twEdit && twEdit.id === c.id ? ' on' : ''), title: T('מגדל {n}', { n: c.no }) + ' · ' + T(R.HGA_KINDS[c.kind]),
            onClick: () => jumpTo(c.id, twEdit && twEdit.id === c.id ? twEdit.floor : lowest(c.id)) }, c.no)),
          rows.map((r, y) => { const L = +r.fl.level || 0, name = R.safFloorLabel(r.fl, T), zone = (L < 0 ? ' und' : '') + (L === 0 ? ' gnd' : '') + (y === 0 ? ' top' : '');
            return h(React.Fragment, { key: r.fl.id },
              h('div', { className: 'cx-sec-l', title: r.bad.map(verdict).join(' · ') || undefined }, h('span', SKIP, name), r.bad.length > 0 && h('b', { className: 'cx-p-bad' }, '✗')),
              r.cells.map((c, k) => h('div', { key: cols[k].id, className: 'cx-sec-c' + zone + (k === 0 ? ' ws' : '') + (k === n - 1 ? ' we' : '') },
                c && h('button', { className: 'cx-sec-q k-' + cols[k].kind + (c.size ? ' size' : c.short ? ' short' : c.ok ? ' ok' : '') + (c.own ? ' own' : '') + (twEdit && twEdit.id === cols[k].id ? ' on' : ''), style: { width: Math.min(100, c.area / cols[k].max * 100) + '%' },
                  title: T('מגדל {n} · {f} · {a} מ"ר', { n: cols[k].no, f: '⁨' + name + '⁩', a: c.area }) + (c.line && !c.line.ok ? ' · ' + verdict(c.line) : ''),
                  onClick: () => jumpTo(cols[k].id, r.fl.id, r.fl.id) }, c.area || '?')))); })),
        h('div', { className: 'cx-hint', style: { marginTop: 6 } }, 'לחצו על מספר מגדל כדי לערוך אותו, או על קובייה כדי לערוך את המרחב בקומה הזו.'),
        h('div', { className: 'cx-hint' }, 'רוחב הקובייה יחסי לשטח. ירוק: עומד בדרישה. אדום: לא עומד בדרישה. מסגרת כתומה: שטח שונה בקומה.'));
    };

    const floorCounts = h('div', { className: 'cx-basis' },
      h('label', { className: 'cx-f', style: { flexDirection: 'row', alignItems: 'center', gap: 6 } }, 'קומות מעל הקרקע (כולל קרקע)',
        h(Field, { key: 'a' + countKey, type: 'number', className: 'cx-n', style: { width: 58 }, min: 1, max: 80, value: counts.above, onSave: v => setCounts(v, counts.below) })),
      h('label', { className: 'cx-f', style: { flexDirection: 'row', alignItems: 'center', gap: 6 } }, 'קומות מתחת לקרקע',
        h(Field, { key: 'b' + countKey, type: 'number', className: 'cx-n', style: { width: 58 }, min: 0, max: 20, value: counts.below, onSave: v => setCounts(counts.above, v) })));

    const floorsCard = Card(2, 'קומות, שימושים ומרחבים מוגנים', null,
      h('div', { className: 'cx-card-b' },
        h('div', { className: 'cx-hint', style: { marginBottom: 10 } }, 'לחצו על קומה כדי לפתוח אותה. מגדל הוא מרחב מוגן שחוזר בכמה קומות: קובעים לו שטח פעם אחת, ובכל קומה אפשר להחליט אם היא חלק ממנו ואם השטח בה שונה. ממ"מ ומרחב במוסד חינוך מחושבים לפי סך השימושים בקומה; ממ"ד — אחד לכל דירה; ממ"ק — אחד לכל 4 דירות.'),
        h('div', { className: 'cx-hlay' }, h('div', { className: 'cx-hrow' },
          h('div', { className: 'cx-hfl' },
            floors.map(floorBlock),
            h('div', { className: 'cx-fadd' },
              h('button', { className: 'cx-btn', onClick: () => setCounts(counts.above + 1, counts.below) }, '+ קומה מעל'),
              h('button', { className: 'cx-btn', onClick: () => setCounts(counts.above, counts.below + 1) }, '+ קומה מתחת'))),
          h('aside', { className: 'cx-hsec' }, h('div', { className: 'cx-hsec-t' }, 'חתך המבנה'), sectionView())))));

    const all = floors.flatMap((f, i) => checks[i].lines.map(l => ({ f, l })));
    const bad = all.filter(o => !o.l.ok).length, showReq = all.some(o => o.l.reqCount > 0);  // only ממ"ד and ממ"ק name a number of spaces
    const cmpCard = Card(3, 'נדרש מול מוצע', null, h('div', { className: 'cx-card-b' },
      !all.length ? h('div', { className: 'cx-hint' }, 'הוסיפו שימושים כדי לחשב את הדרישה') : h(React.Fragment, null,
        h('div', { className: 'cx-verdict ' + (bad ? 'bad' : 'ok') }, bad ? T('✗ {n} פערים מול הדרישה', { n: bad }) : '✓ התכנית עומדת בדרישות המיגון'),
        h('div', { className: 'cx-scroll' }, h('table', { className: 'cx-t c' },
          h('thead', null, h('tr', null, ['קומה', 'סוג מרחב', 'שטח נדרש', showReq && 'מרחבים נדרשים', 'שטח מוצע', 'מרחבים מוצעים', 'פער (מ"ר)', 'סטטוס'].filter(Boolean).map(x => h('th', { key: x }, x)))),
          h('tbody', null, all.map(({ f, l }, k) => h('tr', { key: k, className: l.ok ? '' : 'bad' },
            h('td', Object.assign({ className: 'gl' }, SKIP), R.safFloorLabel(f, T)), h('td', null, R.HGA_KINDS[l.kind]),
            h('td', { className: 'n' }, l.reqArea), showReq && h('td', { className: 'n' }, l.reqCount || '—'), h('td', { className: 'n' }, l.area), h('td', { className: 'n' }, l.count),
            h('td', { className: 'n ' + (l.gap >= 0 ? 'cx-ok' : 'cx-bad') }, sgn(r2(l.gap))),
            h('td', null, l.ok ? h('span', { className: 'cx-p-ok' }, '✓ תקין') : h('span', { className: 'cx-p-bad' }, '✗ לא תקין'))))),
          h('tfoot', null, h('tr', null, h('td', { className: 'gl', colSpan: 2 }, 'סה"כ'),
            h('td', { className: 'n' }, r2(all.reduce((a, o) => a + o.l.reqArea, 0))), showReq && h('td', { className: 'n' }, all.reduce((a, o) => a + o.l.reqCount, 0)),
            h('td', { className: 'n' }, r2(all.reduce((a, o) => a + o.l.area, 0))), h('td', { className: 'n' }, all.reduce((a, o) => a + o.l.count, 0)),
            h('td', null), h('td', null))))))));

    const vent = sh.vent || { m2pp: 0.4, flow: 6 };
    const vrows = shown.flatMap((f, i) => f.spaces.map((x, j) => ({ f, i, x, j })).filter(o => o.x.kind !== 'mamad'));
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
              h('td', Object.assign({ className: 'gl' }, SKIP), R.safFloorLabel(f, T)), h('td', null, T('מגדל {n}', { n: towerNo(x.tower) })),
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

    return h(React.Fragment, null, SheetHead(1, sh, upd, HGA_HINTS, floorCounts), floorsCard, cmpCard, ventCard,
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
    // numbered by place in the list, so an old gap or a repeated level heals itself
    const floors = R.safRenumber(sh.floors || []);
    const chk = R.safCheck(Object.assign({}, sh, { floors }));
    // the flights are saved with every floor change, which moves an older sheet off the per-floor lists
    const flights = R.safFlights(Object.assign({}, sh, { floors }));
    const setFloors = (fl, st) => upd({ floors: fl, stairs: st || flights });
    const setFlights = st => upd({ floors, stairs: st });
    const setFlight = (id, p) => setFlights(flights.map(x => x.id === id ? Object.assign({}, x, p) : x));
    const flightNo = id => flights.findIndex(x => x.id === id) + 1;
    const addFlight = (L, i) => { const id = uid(); setFlights(flights.concat([{ id, w: null, levels: [L] }])); setStEdit({ id, floor: i }); };
    const closeFlight = () => { setFlights(flights.filter(x => x.levels.length)); setStEdit(null); };
    const delFlight = async id => {
      if (!await window.askConfirm(T('למחוק את גרם {n} מכל הקומות?', { n: flightNo(id) }))) return;
      setFlights(flights.filter(x => x.id !== id)); setStEdit(null);
    };
    const setFloor = (i, p) => setFloors(floors.map((f, j) => j === i ? Object.assign({}, f, p) : f));
    const counts = R.safFloorCounts(floors);
    const setCounts = async (above, below) => {
      setCountKey(k => k + 1);  // the boxes go back to the real counts if this is refused or cancelled
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(+v) || 0));
      const next = R.safSetCounts(floors, clamp(above, 1, 80), clamp(below, 0, 20), level => ({ id: uid(), name: R.safFloorName(level), level, corridor: (floors[0] || {}).corridor || 'res', spaces: [], exits: [] }));
      const lost = floors.filter(f => !next.includes(f) && R.safFloorHasData(f));
      if (lost.length && !await window.askConfirm(T('יימחקו קומות שיש בהן מידע: {n}. להמשיך?', { n: nameList(lost) }))) return;
      setCopy(null); setFloors(next);
    };
    const nameList = list => '⁨' + list.map(f => R.safFloorLabel(f, T)).join(', ') + '⁩';
    const applyCopy = async () => {
      const full = copy.to.map(k => floors[k]).filter(R.safFloorHasData);
      if (full.length && !await window.askConfirm(T('בקומות אלה כבר יש מידע: {n}. לדרוס אותו?', { n: nameList(full) }), { confirmLabel: 'דרוס' })) return;
      setFloors(R.safCopyFloor(floors, copy.from, copy.to, uid)); setCopy(null);
    };
    const moveFloor = (from, to) => { if (to !== from && to >= 0 && to < floors.length) { setCopy(null); setFloors(R.safMoveFloor(floors, from, to)); } };
    const nearestFloor = e => {
      const mid = el => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; };
      const els = [...e.currentTarget.children];
      return els.reduce((b, el, k) => Math.abs(mid(el) - e.clientY) < Math.abs(mid(els[b]) - e.clientY) ? k : b, 0);
    };
    const onFloorDrag = e => {
      if (!drag) return;
      e.preventDefault();
      const over = nearestFloor(e);
      if (drag.over !== over) setDrag(Object.assign({}, drag, { over }));
    };
    const delFloor = async i => {
      const ok = await window.askConfirm(T('למחוק את {n}? החללים ודרכי המוצא שלה יימחקו.', { n: '⁨' + R.safFloorLabel(floors[i], T) + '⁩' }));
      if (ok) { setCopy(null); setStEdit(null); setFloors(R.safRemoveFloor(floors, i), R.safFlightsWithout(flights, +floors[i].level || 0)); }
    };
    const useOpts = Object.keys(R.SAF_GROUPS).map(g => h('optgroup', { key: g, label: T(R.SAF_GROUPS[g]) },
      R.SAF_USES.filter(u => u.g === g).map(u => h('option', { key: u.id, value: u.id }, u.n + ' · ' + T(u.name)))));
    const corrOpts = R.SAF_CORRIDOR.map(c => h('option', { key: c.id, value: c.id }, T(c.name) + ' — ' + c.w.toFixed(2)));
    const [open, setOpen] = useState({});
    const [drag, setDrag] = useState(null), [copy, setCopy] = useState(null), [countKey, setCountKey] = useState(0), [stEdit, setStEdit] = useState(null), [jump, setJump] = useState(null);
    // a click in the section opens the floor and lands on what was clicked
    useEffect(() => {
      if (!jump) return;
      const root = document.querySelector('[data-floor="' + jump.floor + '"]'), el = root && root.querySelector(jump.sel);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (el.tagName === 'INPUT') { el.focus({ preventScroll: true }); el.select(); }
    }, [jump]);
    const goTo = (level, sel, flight) => {
      const i = floors.findIndex(f => (+f.level || 0) === level), key = floors[i].id || i;
      setOpen(s => Object.assign({}, s, { [key]: true }));
      if (flight) setStEdit({ id: flight, floor: i });
      setJump({ floor: key, sel });
    };
    const okPill = (ok, txtOk, txtBad) => h('span', { className: ok ? 'cx-p-ok' : 'cx-p-bad' }, ok ? (txtOk || '✓') : (txtBad || '✗'));

    // what a floor is offered, one chip per flight: green meets the requirement, red doesn't. A short total turns them all red
    const widthChip = (key, val, ok, title, no) => h('span', { key, className: 'cx-fchip ' + (ok ? 'ok' : 'bad'), title }, no && h('small', { className: 'cx-fno' }, no), val);
    const flightChips = (o, numbered) => {
      const lines = o.lines.filter(l => l.k === 'stair'), sum = o.lines.find(l => l.k === 'stairSum');
      const short = sum && !sum.ok ? T('סך הגרמים {h} מול {n} ס"מ נדרש', { h: cm(sum.have), n: cm(sum.need) }) : null;
      return lines.length ? lines.map(l => widthChip(l.st.id, l.have ? cm(l.have) : '—', l.ok && !short, short || T('נדרש {a}', { a: cmT(l.need) }), numbered ? flightNo(l.st.id) : null))
        : widthChip('none', '—', false, short);
    };

    const floorBlock = (o, i) => {
      const fl = o.fl, f = o.f, spaces = fl.spaces || [], exits = fl.exits || [], stairs = o.stairs || [];
      const L = +fl.level || 0;
      const setSpaces = s => setFloor(i, { spaces: s }), setExits = e => setFloor(i, { exits: e });
      const setSp = (j, p) => setSpaces(spaces.map((x, k) => k === j ? Object.assign({}, x, p) : x));
      const setEx = (j, p) => setExits(exits.map((x, k) => k === j ? Object.assign({}, x, p) : x));
      const line = k => o.lines.find(l => l.k === k);
      const exitLines = o.lines.filter(l => l.k === 'exit'), stairLines = o.lines.filter(l => l.k === 'stair');
      const count = line('count'), doorSum = line('doorSum'), stairSum = line('stairSum'), corr = line('corridor');
      const exitsOk = count.ok && (!doorSum || doorSum.ok) && exitLines.every(l => l.ok);
      const stairsOk = (!stairSum || stairSum.ok) && stairLines.every(l => l.ok);
      const showStairs = L !== 0 || stairs.length > 0;
      const singleWhy = f.single === 'res' ? 'בניין מגורים שאינו רב-קומות — 3.2.13.3(א)(1)' : f.single === 'small' ? 'עד 30 איש ומרחק הליכה עד 30 מ\' — 3.2.13.3(א)(2)' : '';
      const area = f.spaces.reduce((a, s) => a + (s.x.u.q ? 0 : s.x.area), 0);
      // a width typed in cm, kept in m
      const wField = (val, bad, onSave, title) => h(Field, { type: 'number', className: 'cx-n cx-ns' + (bad ? ' cx-in-bad' : ''), style: { width: 66 }, value: cm(val), placeholder: '0', title, onSave: v => onSave(v == null ? null : rm(v / 100)) });
      const chip = (val, bad, onSave, onDel, key) => h('span', { key, className: 'cx-chip' }, wField(val, bad, onSave), h('button', { className: 'cx-x', title: 'הסרה', onClick: onDel }, '×'));
      const flagged = l => l && !l.ok;
      const short = l => T('✗ חסר {n}', { n: cm(rm(l.need - l.have)) });
      const xCard = (title, status, req, ...body) => h('section', { className: 'cx-xcard' },
        h('div', { className: 'cx-xhead' }, h('b', null, title), status),
        h('div', { className: 'cx-xreq' }, req),
        body);
      const isOpen = open[fl.id || i] != null ? open[fl.id || i] : i === 0;
      const picking = copy && copy.from === i;
      const flight = stEdit && stEdit.floor === i ? flights.find(x => x.id === stEdit.id) : null;
      const dropCls = drag && drag.over === i && drag.from !== i ? (i < drag.from ? ' cx-drop-up' : ' cx-drop-down') : '';
      return h('div', { key: fl.id || i, 'data-floor': fl.id || i, className: 'cx-blk cx-floor' + (isOpen ? ' open' : '') + dropCls },
        h('div', { className: 'cx-blk-h cx-fbar' },
        floors.length > 1 && h('span', { className: 'cx-grip', role: 'button', tabIndex: 0, draggable: true, title: 'גררו כדי להזיז את הקומה',
          onDragStart: e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.setDragImage(e.currentTarget.parentNode, 12, 12); setDrag({ from: i, over: i }); },
          onDragEnd: () => setDrag(null),
          onKeyDown: e => { const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : null; if (to != null) { e.preventDefault(); moveFloor(i, to); } } }, '⠿'),
        h('button', { className: 'cx-fold', 'aria-expanded': isOpen, onClick: () => setOpen(s => Object.assign({}, s, { [fl.id || i]: !isOpen })) },
          h('span', { className: 'cx-chev', 'aria-hidden': true }, '›'),
          h('b', SKIP, R.safFloorLabel(fl, T)),
          h('span', { className: 'cx-rule' }, T('מפלס {n}', { n: fl.level || 0 })),
          h('span', { className: 'cx-tag' }, T('{n} איש', { n: f.occ })),
          h('span', { className: 'cx-sp', style: { flex: 1 } }),
          (stairLines.length > 0 || stairSum) && h('span', { className: 'cx-fgrp' }, 'מדרגות', flightChips(o)),
          corr && h('span', { className: 'cx-fgrp' }, 'פרוזדור', widthChip('c', cm(corr.have), corr.ok, T('נדרש {a}', { a: cmT(corr.need) }))),
          okPill(o.bad === 0, '✓', T('✗ {n}', { n: o.bad }))),
        floors.length > 1 && h('button', { className: 'cx-x cx-fdel', title: 'הסרת הקומה', onClick: () => delFloor(i) }, '×')),

        isOpen && h('div', { className: 'cx-ftools' },
          h('label', { className: 'cx-f' }, 'כינוי לקומה', h(Field, { key: 'n' + countKey, value: R.safFloorNick(fl), placeholder: R.safFloorLabel(Object.assign({}, fl, { name: '' }), T), skip: true, style: { width: 120 },
            onSave: v => { setCountKey(k => k + 1); setFloor(i, { name: (v || '').trim() }); } })),
          h('span', { className: 'cx-sp', style: { flex: 1 } }),
          floors.length > 1 && h('button', { className: 'cx-btn', 'aria-expanded': !!picking, onClick: () => setCopy(picking ? null : { from: i, to: [] }), title: 'העתקת החללים ודרכי המוצא לקומות אחרות' }, '⧉ שכפל')),

        // the copy goes onto floors that already exist: pick them here, floors holding data are marked and ask before they are overwritten
        isOpen && picking && h('div', { className: 'cx-copy' },
          h('b', null, 'העתקה לקומות:'),
          h('label', { className: 'cx-rule' }, h('input', { type: 'checkbox', checked: copy.to.length === floors.length - 1, onChange: e => setCopy({ from: i, to: e.target.checked ? floors.map((_, k) => k).filter(k => k !== i) : [] }) }), ' ', 'כל הקומות'),
          floors.map((t, k) => k !== i && h('label', { key: t.id || k, className: 'cx-rule' },
            h('input', { type: 'checkbox', checked: copy.to.includes(k), onChange: e => setCopy({ from: i, to: e.target.checked ? copy.to.concat([k]) : copy.to.filter(x => x !== k) }) }), ' ',
            h('span', SKIP, R.safFloorLabel(t, T)), R.safFloorHasData(t) && h('span', { className: 'cx-tag warn', style: { marginInlineStart: 4 } }, 'יש מידע'))),
          h('span', { className: 'cx-sp', style: { flex: 1 } }),
          h('button', { className: 'cx-btn', onClick: () => setCopy(null) }, 'ביטול'),
          h('button', { className: 'cx-btn pri', disabled: !copy.to.length, onClick: applyCopy }, 'הדבק')),

        isOpen && h('div', { className: 'cx-sec' }, 'חללים בקומה',
          spaces.length > 0 && h('small', null, [T('{n} חללים', { n: spaces.length }), area ? T('{a} מ"ר', { a: +area.toFixed(1) }) : null, T('{n} איש', { n: f.occ }), f.occ ? T('רוחב מחושב {a}', { a: cmT(f.horizTot) }) : null].filter(Boolean).join(' · '))),
        isOpen && h('div', { className: 'cx-scroll' }, h('table', { className: 'cx-t c cx-saf' },
          h('thead', null, h('tr', null,
            h('th', null, 'מס\' חדר / אזור'), h('th', null, 'חלל / שימוש (טבלה 3.2.12.2)'), h('th', null, 'שטח / כמות'), h('th', null, 'אנשים'), h('th', null, 'רוחב מחושב (ס"מ)'),
            h('th', { title: 'כמות × רוחב בס"מ' }, 'דלתות נדרשות'), h('th', { title: 'כמות × רוחב בס"מ' }, 'דלתות מוצעות'), h('th', null, 'בהלה'), h('th', null, 'עומד'), h('th', null))),
          h('tbody', null,
            f.spaces.map(({ sp, x }, j) => {
              const u = x.u, iss = k => x.issues.some(z => z.k === k), tot = x.issues.find(z => z.k === 'total');
              return h('tr', { key: sp.id || j, className: x.entered && !x.ok ? 'bad' : '' },
                // one box for the room number and the zone; a number typed in the old separate box joins the name
                h('td', null, h(Field, { value: [sp.no, sp.name].filter(Boolean).join(' '), skip: true, placeholder: '—', style: { width: 110 }, onSave: v => setSp(j, { no: null, name: v }) })),
                h('td', { style: { textAlign: 'start' } },
                  h('select', { className: 'cx-in', style: { minWidth: 130, maxWidth: 140 }, value: sp.use, onChange: e => setSp(j, { use: e.target.value, factor: null }) }, useOpts)),
                // the occupancy factor sits beside the area, on the same line as the rest of the row
                h('td', null, h('div', { className: 'cx-qty', style: { justifyContent: 'center' } }, u.none ? '—' : u.q ? h('div', { className: 'cx-qty' }, h(Field, { type: 'number', className: 'cx-n cx-ns', style: { width: 66 }, value: sp.qty, onSave: v => setSp(j, { qty: v }) }),
                  h('span', { className: 'cx-rule' }, u.q === 'bench' ? 'מ\' ספסל' : u.q === 'seats' ? 'מושבים' : 'איש'))
                  : h(Field, { type: 'number', className: 'cx-n cx-ns', style: { width: 66 }, value: sp.area, title: T('מ"ר'), onSave: v => setSp(j, { area: v }) }),
                  x.factor != null && h('div', { className: 'cx-rule cx-fac', title: T('מקדם תפוסה') + (u.max ? ' — ' + T('מקסימלית') : '') }, '× ',
                    Array.isArray(u.factor) ? h(Field, { type: 'number', className: 'cx-n cx-ns', style: { width: 46 }, value: x.factor, title: T('טווח {a}–{b}', { a: u.factor[0], b: u.factor[1] }), onSave: v => setSp(j, { factor: v }) }) : x.factor))),
                h('td', { className: 'n' }, x.occ),
                h('td', { className: 'n' }, x.occ ? cm(x.horiz) : '—'),
                h('td', { className: 'n cx-nw', title: T('טבלה 3.2.1.3 שורה {r}', { r: x.doorMin.row }) }, x.occ ? `${x.exits} × ${cm(x.doorReq)}` : '—'),
                h('td', null, h('div', { className: 'cx-qty', style: { justifyContent: 'center' } },
                  h(Field, { type: 'number', className: 'cx-n cx-ns' + (iss('doors') || iss('total') ? ' cx-in-bad' : ''), style: { width: 44 }, value: sp.doors, placeholder: '0', title: T('כמות'), onSave: v => setSp(j, { doors: v }) }), '×',
                  wField(sp.doorW, iss('width') || iss('total'), v => setSp(j, { doorW: v }), T('רוחב')))),
                h('td', { className: iss('panic') ? 'cx-bad' : '' },
                  h('input', { type: 'checkbox', checked: !!sp.panic, onChange: e => setSp(j, { panic: e.target.checked }) }), x.panic && h('span', { className: 'cx-tag warn', style: { marginInlineStart: 4 } }, 'נדרש')),
                h('td', { title: tot ? T('הדלתות יחד {h} ס"מ מול {n} ס"מ מחושב', { h: cm(tot.have), n: cm(x.horiz) }) : undefined },
                  x.entered ? okPill(x.ok, '✓', '✗') : '—'),
                h('td', null, h('button', { className: 'cx-x', title: 'הסרה', onClick: () => setSpaces(spaces.filter((_, k) => k !== j)) }, '×')));
            }),
            h('tr', null, h('td', { colSpan: 10, style: { textAlign: 'start' } },
              h('button', { className: 'cx-btn', onClick: () => setSpaces(spaces.concat([{ id: uid(), name: '', use: 'b41', area: null }])) }, '+ חלל'),
              !spaces.length && h('span', { className: 'cx-hint', style: { marginInlineStart: 8 } }, 'הוסיפו את החללים בקומה ואת השימוש בכל אחד')))))),

        isOpen && h('div', { className: 'cx-sec cx-sec-x' }, 'יציאות מהקומה'),
        isOpen && h('div', { className: 'cx-xarea' },
          h('div', { className: 'cx-xcards' },
            xCard('דלתות יציאה', (exits.length > 0 || f.occ > 0) && okPill(exitsOk, '✓', !count.ok ? T('✗ {h} מתוך {n}', { h: exits.length, n: f.exits }) : flagged(doorSum) ? short(doorSum) : '✗'),
              [f.occ > 0 && h('b', { key: 'r' }, T('נדרש: {n} דלתות, סך {a}', { n: f.exits, a: cmT(f.horizTot) })), h('span', { key: 'm', title: T('טבלה 3.2.1.3') }, T('כל דלת לפחות {a}', { a: cmT(f.doorMinStair) })), doorSum && h('span', { key: 'h', className: flagged(doorSum) ? 'cx-xbad' : '' }, T('מוצע: סך {a}', { a: cmT(doorSum.have) }))],
              h('div', { className: 'cx-chips' },
                exitLines.map((l, j) => chip(l.e.door, !l.items[0].ok, v => setEx(j, { door: v }), () => setExits(exits.filter((_, k) => k !== j)), l.e.id || j)),
                h('button', { className: 'cx-btn', title: 'דרך מוצא נוספת', onClick: () => setExits(exits.concat([{ id: uid(), door: null, panic: f.panic }])) }, '+')),
              f.panic && h('label', { className: 'cx-rule' + (exits.some(e => !e.panic) ? ' cx-xbad' : '') },
                h('input', { type: 'checkbox', checked: exits.length > 0 && exits.every(e => e.panic), onChange: e => setExits(exits.map(x => Object.assign({}, x, { panic: e.target.checked }))) }), ' ', 'מנגנון בהלה בכל דלתות היציאה')),
            xCard('גרמי מדרגות', showStairs && okPill(stairsOk, '✓', flagged(stairSum) ? short(stairSum) : '✗'),
              showStairs ? [f.stairGov > 0 && h('b', { key: 'r', title: f.stairGov > f.stairTot ? T('לפי הקומה הגדולה שהמדרגות משרתות') : undefined }, T('נדרש: סך {a}', { a: cmT(f.stairGov) })), h('span', { key: 'm', title: '3.2.2.2' }, T('כל גרם לפחות {a}', { a: cmT(f.stairMin) })), stairSum && h('span', { key: 'h', className: flagged(stairSum) ? 'cx-xbad' : '' }, T('מוצע: סך {a}', { a: cmT(stairSum.have) }))]
                : [h('span', { key: 'n' }, 'לא נדרש בקומת היציאה')],
              h('div', { className: 'cx-chips' },
                // the same flight on every floor it runs through: its width changes everywhere, its floors open from here
                stairLines.map(l => h('span', { key: l.st.id, 'data-st': l.st.id, className: 'cx-chip', onFocus: e => { if (e.target.tagName === 'INPUT') setStEdit({ id: l.st.id, floor: i }); } },
                  h('button', { className: 'cx-stno', title: T('גרם {n}', { n: flightNo(l.st.id) }), onClick: () => setStEdit({ id: l.st.id, floor: i }) }, flightNo(l.st.id)),
                  wField(l.st.w, !l.ok, v => setFlight(l.st.id, { w: v })),
                  h('button', { className: 'cx-x', title: 'הסרה מהקומה הזו', onClick: () => setFlights(flights.map(x => x.id === l.st.id ? Object.assign({}, x, { levels: x.levels.filter(M => M !== L) }) : x).filter(x => x.levels.length)) }, '×'))),
                showStairs ? h('button', { className: 'cx-btn', title: 'גרם מדרגות נוסף', onClick: () => addFlight(L, i) }, '+')
                  : h('button', { className: 'cx-btn', onClick: () => addFlight(L, i) }, '+ מדרגות בקומה'))),
            // say which rule sets the corridor: the table 3.2.12.5 minimum often beats the occupancy calculation; the other figure is in the tooltip
            xCard('פרוזדור', corr && okPill(corr.ok, '✓', short(corr)),
              f.occ > 0 ? [h('b', { key: 'r' }, T('נדרש {a}', { a: cmT(f.corrReq) })), f.corrMin >= f.corrCalc
                ? h('span', { key: 'w', className: 'cx-tag warn', title: T('(החישוב לפי התפוסה: {c} — נמוך מהמינימום)', { c: cmT(f.corrCalc) }) }, T('מינימום טבלה 3.2.12.5'))
                : h('span', { key: 'w', className: 'cx-tag', title: T('(מינימום בטבלה 3.2.12.5: {m})', { m: cmT(f.corrMin) }) }, T('לפי התפוסה — 3.2.12.5(ב)'))] : [],
              h('select', { className: 'cx-in', value: fl.corridor || 'res', 'aria-label': T('סוג פרוזדור'), title: T('טבלה 3.2.12.5 — רוחב מינימלי של פרוזדור'), onChange: e => setFloor(i, { corridor: e.target.value }) }, corrOpts),
              h('label', { className: 'cx-f', style: { flexDirection: 'row', alignItems: 'center', gap: 6 } }, 'רוחב פרוזדור (ס"מ)', wField(fl.corridorW, flagged(corr), v => setFloor(i, { corridorW: v }))))),
          flight && h('div', { className: 'cx-copy cx-flight' },
            h('b', null, T('גרם {n} — בקומות:', { n: flightNo(flight.id) })),
            h('label', { className: 'cx-rule' }, h('input', { type: 'checkbox', checked: !!flight.prot, onChange: e => setFlight(flight.id, { prot: e.target.checked }) }), ' ', 'גרם מדרגות מוגן'),
            h('label', { className: 'cx-rule' }, h('input', { type: 'checkbox', checked: floors.every(t => flight.levels.includes(+t.level || 0)), onChange: e => setFlight(flight.id, { levels: e.target.checked ? floors.map(t => +t.level || 0) : [] }) }), ' ', 'כל הקומות'),
            floors.map((t, k) => { const M = +t.level || 0; return h('label', { key: t.id || k, className: 'cx-rule' },
              h('input', { type: 'checkbox', checked: flight.levels.includes(M), onChange: e => setFlight(flight.id, { levels: e.target.checked ? flight.levels.concat([M]).sort((a, b) => a - b) : flight.levels.filter(x => x !== M) }) }), ' ',
              h('span', SKIP, R.safFloorLabel(t, T))); }),
            h('span', { className: 'cx-sp', style: { flex: 1 } }),
            h('button', { className: 'cx-btn', onClick: () => delFlight(flight.id) }, 'מחיקת הגרם'),
            h('button', { className: 'cx-btn pri', onClick: closeFlight }, 'סגור')),
          sh.height !== 'tower' && !sh.residential && f.occ > 0 && f.occ <= 30 && h('label', { className: 'cx-rule cx-xnote' },
            h('input', { type: 'checkbox', checked: !!fl.short30, onChange: e => setFloor(i, { short30: e.target.checked }) }), ' ', 'מרחק ההליכה מכל נקודה בקומה אל מוצא בטוח או יציאה אינו עולה על 30 מ\' (מאפשר דרך מוצא אחת)')),

        // how the numbers were reached, with the regulation references: on demand, so the floor stays short
        isOpen && f.occ > 0 && h('details', { className: 'cx-why' }, h('summary', null, 'פירוט ונימוקים מהתקנות'), h('div', { className: 'cx-req' },
          h('div', null, h('b', null, T('{n} איש בקומה', { n: f.occ })), ' · ', T('{n} דרכי מוצא נדרשות', { n: f.exits }), singleWhy && h('span', { className: 'cx-rule' }, ' (' + T(singleWhy) + ')'),
            f.roomMax > 2 && h('span', { className: 'cx-rule' }, ' · ', T('לפחות כמספר היציאות מהחלל הגדול (3.2.13.3(ד))'))),
          h('div', null, T('רוחב מילוט כולל מהקומה'), ': ',
            T('מהלך אופקי {a}', { a: cmT(f.horizTot) }), ' · ', T('מדרגות {a}', { a: cmT(f.stairGov) }),
            h('span', { className: 'cx-rule' }, ' · ', T('מקדם {s}/{h} ס"מ לנפש', { s: f.wf.s, h: f.wf.h }), ' · ', T('החלוקה בין דרכי המוצא חופשית, כל אחת לפחות במינימום (3.2.12.1(ב), 3.2.12.4)'))),
          h('div', null, T('כל גרם מדרגות: לפחות {a}', { a: cmT(f.stairMin) }), h('span', { className: 'cx-rule' }, ' (3.2.2.2)'),
            ' · ', T('דלת יציאה: לפחות {a}', { a: cmT(f.doorMinStair) }), h('span', { className: 'cx-rule' }, ' (' + T('טבלה 3.2.1.3') + ')'),
            ' · ', f.panic ? h('span', { className: 'cx-tag warn' }, 'מנגנון בהלה בדלתות היציאה מהקומה (מעל 100 איש)') : h('span', { className: 'cx-rule' }, 'ללא חובת מנגנון בהלה')))));
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
        h('label', { className: 'cx-f', style: { flexDirection: 'row', alignItems: 'center', gap: 6 } }, 'קומות מעל הקרקע (כולל קרקע)',
          h(Field, { key: 'a' + countKey, type: 'number', className: 'cx-n', style: { width: 58 }, min: 1, max: 80, value: counts.above, onSave: v => setCounts(v, counts.below) })),
        h('label', { className: 'cx-f', style: { flexDirection: 'row', alignItems: 'center', gap: 6 } }, 'קומות מתחת לקרקע',
          h(Field, { key: 'b' + countKey, type: 'number', className: 'cx-n', style: { width: 58 }, min: 0, max: 20, value: counts.below, onSave: v => setCounts(counts.above, v) })),
        counts.below > 0 && h('label', { className: 'cx-rule', title: '3.2.3.3' }, h('input', { type: 'checkbox', checked: !!sh.deepBelow, onChange: e => upd({ deepBelow: e.target.checked }) }), ' ', 'מפלס הכניסה לקומה התחתונה נמוך מ-8 מ\' מתחת לכניסה הקובעת'),
        h('span', { className: 'cx-hint', style: { flex: 1, minWidth: 200 } }, 'גובה: הפרש בין מפלס הכניסה הקובעת לכניסה לקומה הגבוהה המאוכלסת (3.1.1.1).')),
      R.safProtectedStairs(sh, counts.below).map(r => h('div', { key: r.ref, className: 'cx-prot' },
        h('span', { className: 'cx-tag warn' }, 'נדרש'), h('b', null, T(r.text)), h('span', { className: 'cx-ref' }, r.ref),
        r.note && h('span', { className: 'cx-hint' }, T(r.note))))));

    // the building in section: each floor's people and safe exits, one column per stair flight
    const sectionView = () => {
      const sec = R.safSection(sh), { rows, cols } = sec, n = cols.length, lvl = r => +r.fl.level || 0;
      const lowest = k => lvl([...rows].reverse().find(r => r.cells[k]));
      const wall = k => (k === 0 ? ' ws' : '') + (k === n - 1 ? ' we' : '');
      return h(React.Fragment, null,
        h('div', { className: 'cx-sect', style: { gridTemplateColumns: 'minmax(56px,auto) minmax(44px,auto) minmax(96px,auto)' + cols.map(() => ' minmax(42px,1fr)').join(''), '--rh': Math.max(24, Math.min(34, Math.round(420 / rows.length))) + 'px' } },
          h('span', { className: 'cx-sec-th' }, 'קומה'), h('span', { className: 'cx-sec-th' }, 'תפוסה'), h('span', { className: 'cx-sec-th' }, 'מוצאים בטוחים (ס"מ)'),
          cols.map((c, k) => h('div', { key: c.id, className: 'cx-sec-hc' },
            c.prot && h('span', { className: 'cx-tag warn' }, 'מוגן'),
            h('button', { className: 'cx-sec-h k-st' + (c.bad ? ' bad' : c.ok ? ' ok' : '') + (stEdit && stEdit.id === c.id ? ' on' : ''), title: T('גרם {n}', { n: flightNo(c.id) }), onClick: () => goTo(lowest(k), '.cx-flight', c.id) }, flightNo(c.id)))),
          rows.map((r, y) => { const L = lvl(r), name = R.safFloorLabel(r.fl, T), none = !r.occ && !r.exits.length, zone = (L < 0 ? ' und' : '') + (L === 0 ? ' gnd' : '') + (y === 0 ? ' top' : '');
            return h(React.Fragment, { key: r.fl.id || L },
              h('div', { className: 'cx-sec-c cx-sec-i' + zone }, h('button', Object.assign({ className: 'cx-sec-b', onClick: () => goTo(L, '.cx-sec') }, SKIP), name)),
              h('div', { className: 'cx-sec-c cx-sec-i' + zone }, T('{n} איש', { n: r.occ })),
              h('div', { className: 'cx-sec-c cx-sec-i' + zone }, none ? '—' : h('button', { className: 'cx-sec-b', title: T('{h} מתוך {n} נדרשים', { h: r.exits.length, n: r.exitsNeed }), onClick: () => goTo(L, '.cx-sec.cx-sec-x') },
                h('span', { className: 'cx-fchip ' + (r.exitsOk ? 'ok' : 'bad') }, h('b', null, r.exits.length), r.exits.length > 0 && ' · ', r.exits.length > 0 && h('span', { dir: 'ltr' }, r.exits.map(cm).join(' + '))))),
              r.cells.map((c, k) => h('div', { key: cols[k].id, className: 'cx-sec-c' + zone + wall(k) },
                c && h('button', { className: 'cx-sec-q k-st' + (c.size ? ' size' : c.short ? ' short' : c.ok ? ' ok' : '') + (cols[k].prot ? ' prot' : '') + (stEdit && stEdit.id === cols[k].id ? ' on' : ''), style: { width: Math.max(40, Math.min(100, c.w / cols[k].max * 100)) + '%' },
                  title: [T('גרם {n}', { n: flightNo(cols[k].id) }), '⁨' + name + '⁩', T('נדרש {a}', { a: cmT(c.need) }), c.short ? T('סך הגרמים {h} מול {n} ס"מ נדרש', { h: cm(c.sum.have), n: cm(c.sum.need) }) : null].filter(Boolean).join(' · '),
                  onClick: () => goTo(L, '[data-st="' + cols[k].id + '"] input') }, c.w ? cm(c.w) : '?')))); })),
        (sec.protAny || sec.protHave > 0) && h('div', { style: { marginTop: 8, fontSize: 12, fontWeight: 600 } },
          sec.protNeed ? h('span', { className: sec.protHave >= sec.protNeed ? 'cx-p-ok' : 'cx-p-bad' }, T('גרמים מוגנים: {h} מסומנים, {n} נדרשים', { h: sec.protHave, n: sec.protNeed })) : T('גרמים מוגנים: {h}', { h: sec.protHave })),
        h('div', { className: 'cx-hint', style: { marginTop: 6 } }, 'לחצו על מספר גרם כדי לבחור את הקומות שלו ולסמן אם הוא מוגן, על גרם בקומה כדי לערוך את הרוחב, או על המוצאים כדי לערוך אותם.'),
        h('div', { className: 'cx-hint' }, 'בכל גרם כתוב הרוחב בס"מ. ירוק: עומד בדרישה. אדום: לא עומד בדרישה. מסגרת כפולה: גרם מוגן.'));
    };

    const floorsCard = Card(2, 'קומות, חללים ודרכי מוצא', null,
      h('div', { className: 'cx-card-b' },
        h('div', { className: 'cx-hint', style: { marginBottom: 10 } }, 'לחצו על קומה כדי לפתוח אותה. החללים קובעים את מספר האנשים, וממנו נגזרות הדרישות.'),
        // the whole list takes the drop, so the gap between two floors counts too: the nearest floor is the target
        h('div', { className: 'cx-hlay' }, h('div', { className: 'cx-hrow' },
          h('div', { className: 'cx-hfl' },
            h('div', { onDragEnter: onFloorDrag, onDragOver: onFloorDrag, onDrop: e => { if (drag) { e.preventDefault(); moveFloor(drag.from, nearestFloor(e)); setDrag(null); } } },
              chk.floors.map(floorBlock)),
            h('div', { className: 'cx-fadd' },
              h('button', { className: 'cx-btn', onClick: () => setCounts(counts.above + 1, counts.below) }, '+ קומה מעל'),
              h('button', { className: 'cx-btn', onClick: () => setCounts(counts.above, counts.below + 1) }, '+ קומה מתחת'))),
          h('aside', { className: 'cx-hsec cx-hsaf' }, h('div', { className: 'cx-hsec-t' }, 'חתך המבנה'), sectionView())))));

    const rows = chk.floors.filter(o => o.f.occ > 0 || (o.fl.exits || []).length);
    const cmp = Card(3, 'נדרש מול מוצע — סיכום קומות', null, h('div', { className: 'cx-card-b' },
      !rows.length ? h('div', { className: 'cx-hint' }, 'הוסיפו חללים כדי לחשב את הדרישה') : h(React.Fragment, null,
        h('div', { className: 'cx-verdict ' + (chk.bad ? 'bad' : 'ok') }, chk.bad ? T('✗ {n} פערים מול הדרישה', { n: chk.bad }) : '✓ דרכי המוצא עומדות בדרישות'),
        h('div', { className: 'cx-scroll' }, h('table', { className: 'cx-t c' },
          h('thead', null, h('tr', null, ['קומה', 'מפלס', 'אנשים', 'דרכי מוצא', 'גרמי מדרגות (ס"מ)', 'פרוזדור (ס"מ)', 'בהלה', 'פערים'].map(x => h('th', { key: x }, x)))),
          h('tbody', null, rows.map((o, k) => {
            const cnt = o.lines.find(l => l.k === 'count'), cr = o.lines.find(l => l.k === 'corridor');
            return h('tr', { key: k, className: o.bad ? 'bad' : '' },
              h('td', Object.assign({ className: 'gl' }, SKIP), R.safFloorLabel(o.fl, T)), h('td', { className: 'n' }, o.fl.level || 0), h('td', { className: 'n' }, o.f.occ),
              h('td', { className: 'n ' + (cnt.ok ? '' : 'cx-bad') }, `${cnt.have} / ${cnt.need}`),
              h('td', null, o.lines.some(l => l.k === 'stair' || l.k === 'stairSum') ? h('div', { className: 'cx-fflights' }, flightChips(o, true)) : '—'),
              h('td', { className: 'n ' + (cr && !cr.ok ? 'cx-bad' : '') }, (cr ? `${cm(cr.have)} / ${cm(cr.need)}` : cm(o.f.corrReq)) + (o.f.corrMin >= o.f.corrCalc ? ' *' : '')),
              h('td', null, o.f.panic ? h('span', { className: 'cx-tag warn' }, 'נדרש') : '—'),
              h('td', null, okPill(!o.bad, '✓', T('✗ {n}', { n: o.bad }))));
          })),
          h('tfoot', null, h('tr', null, h('td', { className: 'gl', colSpan: 2 }, 'סה"כ בבניין'), h('td', { className: 'n' }, chk.occ), h('td', { colSpan: 5 }))))),
        rows.some(o => o.f.occ > 0 && o.f.corrMin >= o.f.corrCalc) && h('div', { className: 'cx-rule', style: { marginTop: 6 } }, '* הרוחב נקבע לפי המינימום בטבלה 3.2.12.5'))));

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
      const c = R.safCheck(Object.assign({}, S, { floors: R.safRenumber(S.floors || []) })), maxEx = c.floors.reduce((a, o) => Math.max(a, o.f.exits), 0), panicFl = c.floors.filter(o => o.f.panic).length;
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
      const t = R.hgaTotals(G, T), vents = R.hgaSheet(G).resolved.flatMap(f => f.spaces.filter(x => x.kind !== 'mamad').map(x => R.hgaVent(x, G.vent)));
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
