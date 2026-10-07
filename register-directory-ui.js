/* Settings → Consultants and Firms: the register's consultants and the firms they work at, read
   and edited through KKarcDB.Api (docs/superpowers/specs/2026-10-07-settings-consultants-firms-design.md).
   Loaded after register-link.js and register-link-ui.js; the page reaches it as
   window.RegisterDirectoryUI. If either is missing this defines nothing, and the page's stand-in
   answers instead. */
(function () {
  'use strict';
  const RL = window.RegisterLink;
  const UI = window.RegisterLinkUI;
  if (!RL || !UI || !UI.useDirectory || typeof React === 'undefined') return;
  const h = React.createElement;
  const { useState, useEffect, useMemo, useRef } = React;

  const css = document.createElement('style');
  css.textContent = [
    '.st-tr.rd-c{grid-template-columns:minmax(160px,1.3fr) minmax(120px,1fr) minmax(130px,1.2fr) 104px 104px minmax(140px,1.2fr) 56px 24px}',
    '.st-tr.rd-f{grid-template-columns:minmax(160px,1.3fr) minmax(140px,1.3fr) 104px minmax(140px,1.1fr) minmax(140px,1.2fr) 64px 24px}',
    '.rd-cell{min-width:0;font-size:13px;color:var(--text)}',
    '.rd-val{display:block;min-height:22px;line-height:22px;padding-inline:4px;border-radius:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.rd-val.rd-edit{cursor:text}',
    '.rd-val.rd-edit:hover{background:var(--bg)}',
    '.rd-muted{color:var(--text-3)}',
    '.rd-sub{display:block;font-size:11.5px;color:var(--text-3)}',
    '.rd-input{width:100%;box-sizing:border-box;font:inherit;font-size:13px;padding:2px 6px;border:1px solid var(--accent);border-radius:5px;background:var(--surface);color:var(--text)}',
    '.rd-select{width:100%;font:inherit;font-size:13px;padding:2px 4px;border:1px solid var(--border);border-radius:5px;background:var(--surface);color:var(--text)}',
    '.rd-badge{display:inline-block;font-size:10.5px;font-weight:600;padding-inline:6px;border-radius:9px;background:var(--bg);color:var(--text-3);margin-inline-start:4px}',
    '.rd-link{color:var(--text-3);text-decoration:none;font-size:14px}',
    '.rd-link:hover{color:var(--accent)}',
    '.rd-pick{position:relative}',
    '.rd-pop{position:fixed;z-index:10000;width:240px;max-height:300px;overflow:auto;background:var(--surface);border:1px solid var(--border);border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.16);padding:6px}',
    '.rd-msg{position:sticky;top:0;z-index:6}',
    '.rd-pending{opacity:.6}',
    '.rd-pop label{display:flex;align-items:center;gap:6px;padding:4px 6px;font-size:12.5px;border-radius:5px;cursor:pointer;color:var(--text)}',
    '.rd-pop label:hover{background:var(--bg)}',
    '.rd-pop-h{font-size:10.5px;font-weight:700;color:var(--text-3);padding:6px 6px 2px}',
    '.rd-pop-foot{display:flex;gap:6px;justify-content:flex-end;padding-top:6px;border-top:1px solid var(--border);margin-top:4px}',
    '.rd-form{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;align-items:end;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 16px}',
    '.rd-form label,.rd-form .rd-form-l{display:flex;flex-direction:column;gap:4px;font-size:11.5px;color:var(--text-3)}',
    '.rd-form-foot{grid-column:1/-1;display:flex;gap:8px}',
    '.rd-chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;padding-block:2px;padding-inline:10px 4px;border-radius:12px;background:rgba(37,99,235,.09);color:var(--accent)}',
    '.rd-chip button{border:0;background:none;color:inherit;cursor:pointer;font-size:14px;line-height:1}',
    '.rd-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
  ].join('\n');
  document.head.appendChild(css);

  /* ── language ── */
  const t = (s, vars) => (window.I18N && window.I18N.t
    ? window.I18N.t(s, vars)
    : String(s).replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? String(vars[k]) : m)));
  const curLang = () => (window.I18N && window.I18N.get ? window.I18N.get() : 'he');
  function useLang() {
    const [lang, setLang] = useState(curLang);
    useEffect(() => {
      const on = () => setLang(curLang());
      window.addEventListener('i18n:change', on);
      return () => window.removeEventListener('i18n:change', on);
    }, []);
    return lang;
  }
  // Register data: names, numbers, discipline names. The page's translator leaves it alone.
  const SKIP = { 'data-i18n-skip': '' };
  // Register data inside a translated sentence: in English, isolate marks keep the translator off it.
  const ISO = [String.fromCharCode(0x2068), String.fromCharCode(0x2069)];
  const asData = v => (curLang() === 'en' ? ISO[0] + v + ISO[1] : v);
  const EMPTY = { persons: [], firms: [], tags: [] };
  const FIELD_LABEL = { mobile: 'נייד', phone: 'טלפון', email: 'מייל', address: 'כתובת המשרד' };
  const dash = v => (v == null || v === '' ? '—' : v);

  /* ── cells ── */

  /* A save in flight: the new value shows at once, and the cell goes back to the register's value
     when the answer comes — a success has patched the store by then, a failure has said why. */
  function usePending() {
    const [pending, setPending] = useState(undefined);
    const live = useRef(true);
    useEffect(() => () => { live.current = false; }, []);
    const track = (next, save) => {
      setPending(next);
      Promise.resolve(save()).finally(() => { if (live.current) setPending(undefined); });
    };
    return [pending, track];
  }

  /* Turns into an input on click (spec §3): Enter or leaving the field saves, Escape cancels, an
     unchanged value sends nothing, a required field left blank is put back. `onSave(value, was)`
     gets the trimmed text or null, and what the cell showed when editing began — a re-read that
     lands meanwhile must not move `was`. The value sits in a <bdi>, so a phone number keeps its
     order in Hebrew, and the whole value is the tooltip, for when the cell cuts it off. */
  function EditableText({ value, canEdit, onSave, required, label, dir }) {
    const [draft, setDraft] = useState(null);
    const [pending, track] = usePending();
    const done = useRef(false);
    const seen = useRef(null);
    const current = pending !== undefined ? pending : value;
    const shown = h('bdi', Object.assign({ dir: dir || 'auto' }, SKIP), dash(current));
    if (!canEdit) return h('span', { className: 'rd-val', title: current ? String(current) : undefined }, shown);
    if (draft === null) {
      const start = () => {
        done.current = false;
        seen.current = current == null || current === '' ? null : current;
        setDraft(current || '');
      };
      return h('span', {
        className: 'rd-val rd-edit' + (current ? '' : ' rd-muted') + (pending !== undefined ? ' rd-pending' : ''),
        role: 'button', tabIndex: 0, title: current ? String(current) : label,
        onClick: start, onKeyDown: e => { if (e.key === 'Enter') start(); },
      }, shown);
    }
    const commit = () => {
      if (done.current) return;
      done.current = true;
      const next = RL.blank(draft);
      const was = seen.current;
      setDraft(null);
      if (next === RL.blank(was) || (required && next === null)) return;
      track(next, () => onSave(next, was));
    };
    return h('input', {
      className: 'rd-input', autoFocus: true, value: draft, dir: dir || 'auto', 'aria-label': label,
      onChange: e => setDraft(e.target.value), onBlur: commit,
      onKeyDown: e => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') { done.current = true; setDraft(null); }
      },
    });
  }

  /* The firm as text until clicked, like the other cells: a list per row would put every firm in
     the register into every row (500 rows × 500 firms). A mouse pick saves at once; arrow keys only
     choose — on Windows a closed list changes on every arrow press — and the choice is saved with
     Enter or on leaving the list. `inline` is an always-open list for the new-consultant form,
     whose choice is the form's own until Create. */
  function FirmSelect({ value, choices, canEdit, onSave, label, inline }) {
    const [open, setOpen] = useState(false);
    const [chosen, setChosen] = useState(null); // a keyboard choice waiting for Enter or leaving
    const [pending, track] = usePending();
    const seen = useRef(null);
    const byMouse = useRef(false);
    const done = useRef(false);
    const currentId = pending !== undefined ? pending : value;
    const current = choices.find(c => c.id === currentId);
    const text = h('bdi', SKIP, current ? current.label : '—');
    if (!canEdit) return h('span', { className: 'rd-val', title: current ? current.label : undefined }, text);
    const options = [h('option', { key: '', value: '' }, 'ללא משרד')]
      .concat(choices.map(c => h('option', Object.assign({ key: c.id, value: c.id }, SKIP), c.label)));
    if (inline) {
      return h('select', { className: 'rd-select', value: value || '', 'aria-label': label, onChange: e => onSave(e.target.value || null) }, options);
    }
    if (!open) {
      const start = () => { seen.current = currentId || null; done.current = false; byMouse.current = false; setChosen(null); setOpen(true); };
      return h('span', {
        className: 'rd-val rd-edit' + (current ? '' : ' rd-muted') + (pending !== undefined ? ' rd-pending' : ''),
        role: 'button', tabIndex: 0, title: current ? current.label : label,
        onClick: start, onKeyDown: e => { if (e.key === 'Enter') start(); },
      }, text);
    }
    const finish = next => {
      if (done.current) return;
      done.current = true;
      const was = seen.current;
      setOpen(false);
      setChosen(null);
      if (next !== was) track(next, () => onSave(next, was));
    };
    const cancel = () => { done.current = true; setOpen(false); setChosen(null); };
    return h('select', {
      className: 'rd-select', autoFocus: true, value: chosen !== null ? chosen : seen.current || '', 'aria-label': label,
      onMouseDown: () => { byMouse.current = true; },
      onChange: e => { const v = e.target.value; if (byMouse.current) finish(v || null); else setChosen(v); },
      onKeyDown: e => {
        if (e.key === 'Enter') { e.preventDefault(); finish((chosen !== null ? chosen : seen.current || '') || null); return; }
        if (e.key === 'Escape') { cancel(); return; }
        byMouse.current = false;
      },
      onBlur: () => { if (chosen !== null) finish(chosen || null); else cancel(); },
    }, options);
  }

  /* The disciplines checklist (spec §3): the firm's first, then the rest; saved with Save. It opens
     in a layer of its own, fixed under the cell, so the table's scrolling cannot clip it; scrolling
     the page closes it. */
  function DisciplinePicker({ codes, choices, canEdit, onSave, label }) {
    const [picked, setPicked] = useState(null); // the codes being picked; null while closed
    const [pos, setPos] = useState(null);
    const [pending, track] = usePending();
    const seen = useRef([]);
    const anchor = useRef(null);
    const pop = useRef(null);
    const isOpen = !!picked;
    useEffect(() => {
      if (!isOpen) return undefined;
      const onScroll = e => { if (!pop.current || !pop.current.contains(e.target)) setPicked(null); };
      window.addEventListener('scroll', onScroll, true);
      return () => window.removeEventListener('scroll', onScroll, true);
    }, [isOpen]);
    const currentCodes = pending !== undefined ? pending : codes;
    const byCode = new Map(choices.map(c => [c.code, c.label]));
    const shown = currentCodes.length ? currentCodes.map(c => byCode.get(c) || c).join(', ') : '—';
    const text = h('bdi', SKIP, shown);
    if (!canEdit) return h('span', { className: 'rd-val', title: currentCodes.length ? shown : undefined }, text);
    const open = () => {
      const r = anchor.current.getBoundingClientRect();
      const top = r.bottom + 304 > window.innerHeight ? Math.max(8, r.top - 304) : r.bottom + 4;
      setPos(document.documentElement.dir === 'rtl'
        ? { top, right: Math.max(8, window.innerWidth - r.right) }
        : { top, left: Math.max(8, r.left) });
      seen.current = currentCodes.slice();
      setPicked(currentCodes.slice());
    };
    const toggle = code => setPicked(p => (p.includes(code) ? p.filter(c => c !== code) : p.concat([code])));
    const save = () => {
      const next = choices.map(c => c.code).filter(c => picked.includes(c)).concat(picked.filter(c => !byCode.has(c)));
      const was = seen.current;
      setPicked(null);
      if (next.length !== was.length || next.some(c => !was.includes(c))) track(next, () => onSave(next, was));
    };
    const group = (title, list) => (list.length
      ? [h('div', { key: 'h:' + title, className: 'rd-pop-h' }, title)].concat(list.map(c => h('label', { key: c.code },
        h('input', { type: 'checkbox', checked: picked.includes(c.code), onChange: () => toggle(c.code) }),
        h('span', SKIP, c.label))))
      : []);
    const firmFirst = choices.some(c => c.ofFirm);
    return h('div', { className: 'rd-pick' },
      h('span', {
        ref: anchor, className: 'rd-val rd-edit' + (currentCodes.length ? '' : ' rd-muted') + (pending !== undefined ? ' rd-pending' : ''),
        role: 'button', tabIndex: 0, title: currentCodes.length ? shown : label,
        onClick: () => (picked ? setPicked(null) : open()), onKeyDown: e => { if (e.key === 'Enter') open(); },
      }, text),
      picked && ReactDOM.createPortal(h('div', {
        ref: pop, className: 'rd-pop', role: 'dialog', 'aria-label': label, style: pos || undefined,
        onKeyDown: e => { if (e.key === 'Escape') setPicked(null); },
      },
      group('תחומי המשרד', choices.filter(c => c.ofFirm)),
      group(firmFirst ? 'שאר התחומים' : 'תחומים', choices.filter(c => !c.ofFirm)),
      h('div', { className: 'rd-pop-foot' },
        h('button', { type: 'button', className: 'rl-btn', onClick: () => setPicked(null) }, 'ביטול'),
        h('button', { type: 'button', className: 'rl-btn', onClick: save }, 'שמירה'))), document.body));
  }

  /* ── shared by both sections ── */
  const canEditOf = (s, officeRole) => !!(s.me && s.me.state === 'ok' && RL.canEditRegister(s.me.data.role, officeRole));

  // `describe` — { who, format } — names the record and puts the other person's value in words.
  function useEditor() {
    const [msg, setMsg] = useState(null);
    const run = (method, path, body, local, describe) => UI.write(method, path, body, local).then(r => {
      setMsg(RL.writeErrorOf(r, describe && describe.format, describe && describe.who));
      return r;
    });
    return { msg, run };
  }

  // Sticky at the top of the scrolling page: a failed save far down a 500-row list stays in view.
  function Message({ msg }) {
    if (!msg) return null;
    const vars = msg.vars ? Object.fromEntries(Object.entries(msg.vars).map(([k, v]) => [k, asData(v)])) : null;
    return h('div', { className: 'np-err pj-err rd-msg', role: 'alert' },
      msg.who ? h('b', SKIP, msg.who + ' — ') : null,
      t(msg.text, vars),
      msg.detail ? h('span', SKIP, ' — ' + msg.detail) : null);
  }

  // Why the tables have no inputs — once the register has said who this is, or failed to.
  function ReadOnlyLine({ s, officeRole }) {
    if (s.me && s.me.state !== 'ok') {
      return h('div', { className: 'fl-note' }, 'לא ניתן לקרוא מהמאגר את הרשאות העריכה', ' ',
        h('button', { type: 'button', className: 'rl-btn', onClick: () => { if (UI.retryMe) UI.retryMe(); } }, 'נסה שוב'));
    }
    const me = s.me && s.me.state === 'ok' ? s.me.data : null;
    if (!me) return null;
    if (officeRole === 'viewer') return h('div', { className: 'fl-note' }, 'צפייה בלבד — ברמת Viewer אין הרשאת עריכה');
    if (!RL.canEditRegister(me.role, officeRole)) return h('div', { className: 'fl-note' }, 'צפייה בלבד — עריכת המאגר דורשת הרשאת Editor במאגר');
    return null;
  }

  const headers = (cls, labels) => h('div', { className: 'st-tr st-th ' + cls, role: 'row' },
    labels.map((label, i) => h('span', { key: i, role: 'columnheader' }, label)));

  const hubAnchor = path => {
    const href = UI.hubLink(path);
    return href ? h('a', { className: 'rd-link', href, target: '_blank', rel: 'noopener', title: 'פתיחה ב-KK Hub', 'aria-label': 'פתיחה ב-KK Hub' }, '↗') : null;
  };

  // A discipline list as the page's language names it, for the changed-meanwhile line.
  const labelsFor = choices => codes => codes.map(c => (choices.find(x => x.code === c) || {}).label || c).join(', ');

  /* ── Consultants ── */
  function ConsultantRow({ p, d, lang, firmById, baseFirmChoices, canEdit, run }) {
    const editable = RL.editablePerson(p, canEdit);
    const firm = p.firmId ? firmById.get(p.firmId) : null;
    const who = RL.nameIn(p, lang);
    const firmName = id => { const f = id ? firmById.get(id) : null; return f ? RL.nameIn(f, lang) : '—'; };
    const patch = field => (value, was) => run('PATCH', '/api/contacts/' + p.id, { field, value, was },
      { list: 'persons', id: p.id, patch: { [field]: value } }, { who });
    const saveFirm = (id, was) => {
      const f = id ? firmById.get(id) : null;
      return run('PATCH', '/api/contacts/' + p.id, { field: 'firmId', value: id, was },
        { list: 'persons', id: p.id, patch: { firmId: id, firmName: f ? f.name : null } }, { who, format: firmName });
    };
    const codes = (p.tags && p.tags.discipline) || [];
    const discChoices = RL.disciplineChoices(d.tags, firm, lang);
    const saveDisciplines = (next, was) => run('PUT', '/api/persons/' + p.id + '/tags/discipline', { codes: next, was },
      { list: 'persons', id: p.id, patch: { tags: Object.assign({}, p.tags, { discipline: next }) } }, { who, format: labelsFor(discChoices) });
    const firmChoices = p.firmId && !baseFirmChoices.some(c => c.id === p.firmId)
      ? RL.firmChoices(d.firms, p.firmId, lang) : baseFirmChoices;
    // The page's language's name on top, the other beneath; both editable. Hebrew shows nameHe ||
    // name (spec §4): with no Hebrew name the English one goes on top, and the empty line beneath.
    const heFirst = [['nameHe', 'שם בעברית'], ['name', 'שם באנגלית']];
    const names = lang === 'en' || !p.nameHe ? heFirst.slice().reverse() : heFirst;
    const nameCell = ([field, label]) => h(EditableText, { value: p[field], label, canEdit: editable, required: field === 'name', onSave: patch(field) });
    return h('div', { className: 'st-tr rd-c', role: 'row' },
      h('span', { className: 'rd-cell', role: 'cell' },
        nameCell(names[0]),
        h('span', { className: 'rd-sub' }, nameCell(names[1])),
        p.isContact === false ? h('span', { className: 'rd-badge', title: 'משתמש במאגר נערך ב-KK Hub' }, 'משתמש במאגר') : null),
      h('span', { className: 'rd-cell', role: 'cell' },
        h(FirmSelect, { value: p.firmId, choices: firmChoices, canEdit: editable, onSave: saveFirm, label: 'משרד היועץ' })),
      h('span', { className: 'rd-cell', role: 'cell' },
        h(DisciplinePicker, { codes, choices: discChoices, canEdit: editable, onSave: saveDisciplines, label: 'תחומים' })),
      ['mobile', 'phone', 'email'].map(field => h('span', { key: field, className: 'rd-cell', role: 'cell' },
        h(EditableText, { value: p[field], label: FIELD_LABEL[field], canEdit: editable, onSave: patch(field), dir: 'ltr' }))),
      h('span', { className: 'rd-cell rd-muted', role: 'cell' }, String(p.projectCount || 0)),
      h('span', { role: 'cell' }, hubAnchor('/team/?tab=kind_consultant&open=' + encodeURIComponent(p.id))));
  }

  function NewConsultant({ d, lang, firmId, run, onDone }) {
    const [f, setF] = useState({ name: '', nameHe: '', firmId: firmId || '', disciplines: [], mobile: '', email: '' });
    const [busy, setBusy] = useState(false);
    const put = (k, v) => setF(o => Object.assign({}, o, { [k]: v }));
    const firm = f.firmId ? d.firms.find(x => x.id === f.firmId) : null;
    const create = () => {
      if (!RL.blank(f.name) || busy) return;
      setBusy(true);
      run('POST', '/api/contacts', RL.newContactBody(f), null, { who: RL.blank(f.name) }).then(r => {
        if (r.state !== 'ok') { setBusy(false); return; }
        // POST /api/contacts takes no Hebrew name: it follows as an edit of the new contact.
        const id = r.data && r.data.id;
        const he = RL.blank(f.nameHe);
        (id && he ? run('PATCH', '/api/contacts/' + id, { field: 'nameHe', value: he, was: null }, null, { who: RL.blank(f.name) }) : Promise.resolve()).then(onDone);
      });
    };
    const input = (key, label, extra) => h('label', null, label,
      h('input', Object.assign({ className: 'af-input', value: f[key], onChange: e => put(key, e.target.value) }, extra)));
    return h('div', { className: 'rd-form', role: 'group', 'aria-label': 'יועץ חדש' },
      input('name', 'שם באנגלית', { autoFocus: true, required: true, dir: 'auto' }),
      input('nameHe', 'שם בעברית', { dir: 'auto' }),
      h('label', null, 'משרד היועץ',
        h(FirmSelect, { value: f.firmId || null, choices: RL.firmChoices(d.firms, f.firmId, lang), canEdit: true, inline: true, label: 'משרד היועץ', onSave: v => put('firmId', v || '') })),
      h('div', { className: 'rd-form-l' }, 'תחומים',
        h(DisciplinePicker, { codes: f.disciplines, choices: RL.disciplineChoices(d.tags, firm, lang), canEdit: true, label: 'תחומים', onSave: v => put('disciplines', v) })),
      input('mobile', 'נייד', { dir: 'ltr' }),
      input('email', 'מייל', { dir: 'ltr', type: 'email' }),
      h('div', { className: 'rd-form-foot' },
        h('button', { type: 'button', className: 'rl-btn', disabled: busy || !RL.blank(f.name), onClick: create }, 'יצירה'),
        h('button', { type: 'button', className: 'rl-btn', onClick: onDone }, 'ביטול')));
  }

  function ConsultantsSettings({ officeRole, firmId, onClearFirm }) {
    const s = UI.useDirectory();
    const lang = useLang();
    const [q, setQ] = useState('');
    const [adding, setAdding] = useState(false);
    const { msg, run } = useEditor();
    const status = UI.directoryStatus(s);
    const d = status.kind === 'ok' ? status.data : EMPTY;
    const rows = useMemo(() => RL.filterConsultants(d.persons, d.firms, d.tags, { q, firmId, lang }), [d, q, firmId, lang]);
    const firmById = useMemo(() => new Map((d.firms || []).map(f => [f.id, f])), [d]);
    const baseFirmChoices = useMemo(() => RL.firmChoices(d.firms, null, lang), [d, lang]);
    const canEdit = canEditOf(s, officeRole);
    const filterFirm = firmId ? firmById.get(firmId) : null;
    const head = h('div', { className: 'st-head' },
      h('div', null,
        h('h2', { className: 'st-h2' }, 'יועצים'),
        h('div', { className: 'st-sub' }, status.kind === 'ok'
          ? t('{n} יועצים במאגר', { n: (d.persons || []).filter(RL.isConsultant).length })
          : 'מהמאגר (KKarcDB)')),
      h('div', { className: 'rd-tools' },
        filterFirm ? h('span', { className: 'rd-chip' },
          h('bdi', SKIP, RL.nameIn(filterFirm, lang)),
          h('button', { type: 'button', title: 'הצגת כל היועצים', 'aria-label': 'הצגת כל היועצים', onClick: onClearFirm }, '×')) : null,
        h('input', { className: 'af-input st-search', placeholder: 'חיפוש לפי שם, משרד, תחום, טלפון או מייל', value: q, onChange: e => setQ(e.target.value) }),
        canEdit && !adding ? h('button', { type: 'button', className: 'rl-btn', onClick: () => setAdding(true) }, '+ יועץ חדש') : null));
    if (status.kind !== 'ok') return h('div', { className: 'st-section' }, head, h(UI.DirectoryNotice, { status }));
    return h('div', { className: 'st-section' }, head,
      h(ReadOnlyLine, { s, officeRole }),
      h(Message, { msg }),
      adding ? h(NewConsultant, { d, lang, firmId, run, onDone: () => setAdding(false) }) : null,
      h('div', { className: 'st-table', role: 'table', 'aria-label': 'יועצים' },
        headers('rd-c', ['יועץ', 'משרד היועץ', 'תחומים', 'נייד', 'טלפון', 'מייל', 'פרויקטים', '']),
        rows.length === 0 ? h('div', { className: 'pm-none' }, 'לא נמצאו יועצים') : null,
        rows.map(p => h(ConsultantRow, { key: p.id, p, d, lang, firmById, baseFirmChoices, canEdit, run }))));
  }

  /* ── Firms ── */
  function FirmRow({ f, d, lang, canEdit, run, onShowFirm }) {
    const who = RL.nameIn(f, lang);
    const patch = field => (value, was) => run('PATCH', '/api/firms/' + f.id, { field, value, was },
      { list: 'firms', id: f.id, patch: { [field]: value } }, { who });
    const codes = (f.tags && f.tags.discipline) || [];
    const discChoices = RL.disciplineChoices(d.tags, null, lang);
    const saveDisciplines = (next, was) => run('PUT', '/api/firms/' + f.id + '/tags/discipline', { codes: next, was },
      { list: 'firms', id: f.id, patch: { tags: Object.assign({}, f.tags, { discipline: next }) } }, { who, format: labelsFor(discChoices) });
    const count = RL.firmConsultantCount(f.id, d.persons);
    return h('div', { className: 'st-tr rd-f', role: 'row' },
      h('span', { className: 'rd-cell', role: 'cell' },
        // The API edits a firm's main name only; a Hebrew name the register holds is shown beneath.
        h(EditableText, { value: f.name, label: 'שם באנגלית', canEdit, required: true, onSave: patch('name') }),
        f.nameHe ? h('span', { className: 'rd-sub' }, h('bdi', SKIP, f.nameHe)) : null),
      h('span', { className: 'rd-cell', role: 'cell' },
        h(DisciplinePicker, { codes, choices: discChoices, canEdit, onSave: saveDisciplines, label: 'תחומים' })),
      ['phone', 'email', 'address'].map(field => h('span', { key: field, className: 'rd-cell', role: 'cell' },
        h(EditableText, { value: f[field], label: FIELD_LABEL[field], canEdit, onSave: patch(field), dir: field === 'address' ? 'auto' : 'ltr' }))),
      h('span', { role: 'cell' },
        h('button', { type: 'button', className: 'rl-btn', title: 'הצגת היועצים של המשרד', onClick: () => onShowFirm(f.id) }, String(count))),
      h('span', { role: 'cell' }, hubAnchor('/team/?tab=firms&open=' + encodeURIComponent(f.id))));
  }

  function NewFirm({ d, lang, run, onDone }) {
    const [f, setF] = useState({ name: '', disciplines: [] });
    const [busy, setBusy] = useState(false);
    const create = () => {
      if (!RL.blank(f.name) || busy) return;
      setBusy(true);
      run('POST', '/api/firms', RL.newFirmBody(f), null, { who: RL.blank(f.name) }).then(r => { if (r.state === 'ok') onDone(); else setBusy(false); });
    };
    return h('div', { className: 'rd-form', role: 'group', 'aria-label': 'משרד חדש' },
      h('label', null, 'שם באנגלית',
        h('input', { className: 'af-input', autoFocus: true, dir: 'auto', value: f.name, onChange: e => { const v = e.target.value; setF(o => Object.assign({}, o, { name: v })); } })),
      h('div', { className: 'rd-form-l' }, 'תחומים',
        h(DisciplinePicker, { codes: f.disciplines, choices: RL.disciplineChoices(d.tags, null, lang), canEdit: true, label: 'תחומים', onSave: v => setF(o => Object.assign({}, o, { disciplines: v })) })),
      h('div', { className: 'rd-form-foot' },
        h('button', { type: 'button', className: 'rl-btn', disabled: busy || !RL.blank(f.name), onClick: create }, 'יצירה'),
        h('button', { type: 'button', className: 'rl-btn', onClick: onDone }, 'ביטול')));
  }

  function FirmsSettings({ officeRole, onShowFirm }) {
    const s = UI.useDirectory();
    const lang = useLang();
    const [q, setQ] = useState('');
    const [adding, setAdding] = useState(false);
    const { msg, run } = useEditor();
    const status = UI.directoryStatus(s);
    const d = status.kind === 'ok' ? status.data : EMPTY;
    const rows = useMemo(() => RL.filterFirms(d.firms, d.tags, { q, lang }), [d, q, lang]);
    const canEdit = canEditOf(s, officeRole);
    const head = h('div', { className: 'st-head' },
      h('div', null,
        h('h2', { className: 'st-h2' }, 'משרדי יועצים'),
        h('div', { className: 'st-sub' }, status.kind === 'ok'
          ? t('{n} משרדי יועצים במאגר', { n: RL.consultantFirms(d.firms).length })
          : 'מהמאגר (KKarcDB)')),
      h('div', { className: 'rd-tools' },
        h('input', { className: 'af-input st-search', placeholder: 'חיפוש לפי שם, תחום, טלפון, מייל או כתובת', value: q, onChange: e => setQ(e.target.value) }),
        canEdit && !adding ? h('button', { type: 'button', className: 'rl-btn', onClick: () => setAdding(true) }, '+ משרד חדש') : null));
    if (status.kind !== 'ok') return h('div', { className: 'st-section' }, head, h(UI.DirectoryNotice, { status }));
    return h('div', { className: 'st-section' }, head,
      h(ReadOnlyLine, { s, officeRole }),
      h(Message, { msg }),
      adding ? h(NewFirm, { d, lang, run, onDone: () => setAdding(false) }) : null,
      h('div', { className: 'st-table', role: 'table', 'aria-label': 'משרדי יועצים' },
        headers('rd-f', ['משרד יועצים', 'תחומים', 'טלפון', 'מייל', 'כתובת המשרד', 'יועצים', '']),
        rows.length === 0 ? h('div', { className: 'pm-none' }, 'לא נמצאו משרדי יועצים') : null,
        rows.map(f => h(FirmRow, { key: f.id, f, d, lang, canEdit, run, onShowFirm }))));
  }

  window.RegisterDirectoryUI = { ConsultantsSettings, FirmsSettings };
})();
