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
    '.st-tr.rd-c{grid-template-columns:minmax(170px,1.3fr) minmax(130px,1fr) minmax(150px,1.2fr) 112px 112px minmax(150px,1.2fr) 64px 28px}',
    '.st-tr.rd-f{grid-template-columns:minmax(170px,1.3fr) minmax(150px,1.3fr) 112px minmax(150px,1.1fr) minmax(150px,1.2fr) 72px 28px}',
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
    '.rd-pop{position:absolute;inset-inline-start:0;top:100%;z-index:50;margin-top:4px;width:240px;max-height:300px;overflow:auto;background:var(--surface);border:1px solid var(--border);border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.16);padding:6px}',
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
  const asData = v => (curLang() === 'en' ? '⁨' + v + '⁩' : v);
  const EMPTY = { persons: [], firms: [], tags: [] };
  const FIELD_LABEL = { mobile: 'נייד', phone: 'טלפון', email: 'מייל', address: 'כתובת המשרד' };
  const dash = v => (v == null || v === '' ? '—' : v);

  /* ── cells ── */

  /* Turns into an input on click (spec §3): Enter or leaving the field saves, Escape cancels, an
     unchanged value sends nothing, a required field left blank is put back. `onSave` gets the
     trimmed text or null. The value sits in a <bdi>, so a phone number keeps its order in Hebrew. */
  function EditableText({ value, canEdit, onSave, required, label, dir }) {
    const [draft, setDraft] = useState(null);
    const done = useRef(false);
    const shown = h('bdi', Object.assign({ dir: dir || 'auto' }, SKIP), dash(value));
    if (!canEdit) return h('span', { className: 'rd-val' }, shown);
    if (draft === null) {
      const start = () => { done.current = false; setDraft(value || ''); };
      return h('span', {
        className: 'rd-val rd-edit' + (value ? '' : ' rd-muted'), role: 'button', tabIndex: 0, title: label,
        onClick: start, onKeyDown: e => { if (e.key === 'Enter') start(); },
      }, shown);
    }
    const commit = () => {
      if (done.current) return;
      done.current = true;
      const next = RL.blank(draft);
      setDraft(null);
      if (next === RL.blank(value) || (required && next === null)) return;
      onSave(next);
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

  function FirmSelect({ value, choices, canEdit, onSave, label }) {
    const current = choices.find(c => c.id === value);
    if (!canEdit) return h('span', { className: 'rd-val' }, h('bdi', SKIP, current ? current.label : '—'));
    return h('select', {
      className: 'rd-select', value: value || '', 'aria-label': label,
      onChange: e => { const next = e.target.value || null; if (next !== (value || null)) onSave(next); },
    },
    h('option', { value: '' }, 'ללא משרד'),
    choices.map(c => h('option', Object.assign({ key: c.id, value: c.id }, SKIP), c.label)));
  }

  /* The disciplines checklist (spec §3): the firm's first, then the rest; saved with Save. */
  function DisciplinePicker({ codes, choices, canEdit, onSave, label }) {
    const [picked, setPicked] = useState(null); // the codes being picked; null while closed
    const byCode = new Map(choices.map(c => [c.code, c.label]));
    const shown = codes.length ? codes.map(c => byCode.get(c) || c).join(', ') : '—';
    const text = h('bdi', SKIP, shown);
    if (!canEdit) return h('span', { className: 'rd-val' }, text);
    const open = () => setPicked(codes.slice());
    const toggle = code => setPicked(p => (p.includes(code) ? p.filter(c => c !== code) : p.concat([code])));
    const save = () => {
      const next = choices.map(c => c.code).filter(c => picked.includes(c)).concat(picked.filter(c => !byCode.has(c)));
      setPicked(null);
      if (next.length !== codes.length || next.some(c => !codes.includes(c))) onSave(next);
    };
    const group = (title, list) => (list.length
      ? [h('div', { key: 'h:' + title, className: 'rd-pop-h' }, title)].concat(list.map(c => h('label', { key: c.code },
        h('input', { type: 'checkbox', checked: picked.includes(c.code), onChange: () => toggle(c.code) }),
        h('span', SKIP, c.label))))
      : []);
    const firmFirst = choices.some(c => c.ofFirm);
    return h('div', { className: 'rd-pick' },
      h('span', {
        className: 'rd-val rd-edit' + (codes.length ? '' : ' rd-muted'), role: 'button', tabIndex: 0, title: label,
        onClick: () => (picked ? setPicked(null) : open()), onKeyDown: e => { if (e.key === 'Enter') open(); },
      }, text),
      picked && h('div', {
        className: 'rd-pop', role: 'dialog', 'aria-label': label,
        onKeyDown: e => { if (e.key === 'Escape') setPicked(null); },
      },
      group('תחומי המשרד', choices.filter(c => c.ofFirm)),
      group(firmFirst ? 'שאר התחומים' : 'תחומים', choices.filter(c => !c.ofFirm)),
      h('div', { className: 'rd-pop-foot' },
        h('button', { type: 'button', className: 'rl-btn', onClick: () => setPicked(null) }, 'ביטול'),
        h('button', { type: 'button', className: 'rl-btn', onClick: save }, 'שמירה'))));
  }

  /* ── shared by both sections ── */
  const canEditOf = (s, officeRole) => !!(s.me && s.me.state === 'ok' && RL.canEditRegister(s.me.data.role, officeRole));

  function useEditor() {
    const [msg, setMsg] = useState(null);
    const run = (method, path, body, local) => UI.write(method, path, body, local).then(r => {
      setMsg(RL.writeErrorOf(r));
      return r;
    });
    return { msg, run };
  }

  function Message({ msg }) {
    if (!msg) return null;
    const vars = msg.vars ? Object.fromEntries(Object.entries(msg.vars).map(([k, v]) => [k, asData(v)])) : null;
    return h('div', { className: 'np-err pj-err', role: 'alert' }, t(msg.text, vars),
      msg.detail ? h('span', SKIP, ' — ' + msg.detail) : null);
  }

  // Why the tables have no inputs — once the register has said who this is.
  function ReadOnlyLine({ s, officeRole }) {
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

  /* ── Consultants ── */
  function ConsultantRow({ p, d, lang, firmById, baseFirmChoices, canEdit, run }) {
    const editable = RL.editablePerson(p, canEdit);
    const firm = p.firmId ? firmById.get(p.firmId) : null;
    const patch = field => value => run('PATCH', '/api/contacts/' + p.id,
      { field, value, was: p[field] == null ? null : p[field] },
      { list: 'persons', id: p.id, patch: { [field]: value } });
    const saveFirm = id => {
      const f = id ? firmById.get(id) : null;
      run('PATCH', '/api/contacts/' + p.id, { field: 'firmId', value: id, was: p.firmId || null },
        { list: 'persons', id: p.id, patch: { firmId: id, firmName: f ? f.name : null } });
    };
    const codes = (p.tags && p.tags.discipline) || [];
    const saveDisciplines = next => run('PUT', '/api/persons/' + p.id + '/tags/discipline', { codes: next, was: codes },
      { list: 'persons', id: p.id, patch: { tags: Object.assign({}, p.tags, { discipline: next }) } });
    const firmChoices = p.firmId && !baseFirmChoices.some(c => c.id === p.firmId)
      ? RL.firmChoices(d.firms, p.firmId, lang) : baseFirmChoices;
    // The page's language's name on top, the other beneath; both editable.
    const names = lang === 'en' ? [['name', 'שם באנגלית'], ['nameHe', 'שם בעברית']] : [['nameHe', 'שם בעברית'], ['name', 'שם באנגלית']];
    const nameCell = ([field, label]) => h(EditableText, { value: p[field], label, canEdit: editable, required: field === 'name', onSave: patch(field) });
    return h('div', { className: 'st-tr rd-c', role: 'row' },
      h('span', { className: 'rd-cell', role: 'cell' },
        nameCell(names[0]),
        h('span', { className: 'rd-sub' }, nameCell(names[1])),
        p.isContact === false ? h('span', { className: 'rd-badge', title: 'משתמש במאגר נערך ב-KK Hub' }, 'משתמש במאגר') : null),
      h('span', { className: 'rd-cell', role: 'cell' },
        h(FirmSelect, { value: p.firmId, choices: firmChoices, canEdit: editable, onSave: saveFirm, label: 'משרד היועץ' })),
      h('span', { className: 'rd-cell', role: 'cell' },
        h(DisciplinePicker, { codes, choices: RL.disciplineChoices(d.tags, firm, lang), canEdit: editable, onSave: saveDisciplines, label: 'תחומים' })),
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
      run('POST', '/api/contacts', RL.newContactBody(f)).then(r => {
        if (r.state !== 'ok') { setBusy(false); return; }
        // POST /api/contacts takes no Hebrew name: it follows as an edit of the new contact.
        const id = r.data && r.data.id;
        const he = RL.blank(f.nameHe);
        (id && he ? run('PATCH', '/api/contacts/' + id, { field: 'nameHe', value: he, was: null }) : Promise.resolve()).then(onDone);
      });
    };
    const input = (key, label, extra) => h('label', null, label,
      h('input', Object.assign({ className: 'af-input', value: f[key], onChange: e => put(key, e.target.value) }, extra)));
    return h('div', { className: 'rd-form', role: 'group', 'aria-label': 'יועץ חדש' },
      input('name', 'שם באנגלית', { autoFocus: true, required: true, dir: 'auto' }),
      input('nameHe', 'שם בעברית', { dir: 'auto' }),
      h('label', null, 'משרד היועץ',
        h(FirmSelect, { value: f.firmId || null, choices: RL.firmChoices(d.firms, f.firmId, lang), canEdit: true, label: 'משרד היועץ', onSave: v => put('firmId', v || '') })),
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

  window.RegisterDirectoryUI = { ConsultantsSettings };
})();
