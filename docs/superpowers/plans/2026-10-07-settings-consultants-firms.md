# Settings: Consultants and Firms — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two new Settings sections in Project Hub, **יועצים / Consultants** and **משרדי יועצים / Firms**, that list and edit the register's consultants and firms through KKarcDB.Api.

**Architecture:** `register-link.js` gains a write call (`send`) and pure helpers (filtering, choices, request bodies, error sentences), all tested under Node. `register-link-ui.js`'s shared register store gains who-is-signed-in (`/api/me`), a directory hook and a `write` that patches the screen at once and re-reads. A new `register-directory-ui.js` renders the two screens; `project_hub_01.html` only adds a script tag, a stand-in and two Settings menu entries.

**Tech Stack:** Plain browser JavaScript, React 18 via `React.createElement` (no JSX, no build), supabase-js 2 for the sign-in, KKarcDB.Api over `fetch`, `node:test` for tests.

**Spec:** `docs/superpowers/specs/2026-10-07-settings-consultants-firms-design.md`

## Global Constraints

- Work in the worktree `.worktrees/settings-consultants`, branch `feat/settings-consultants-firms`. Run every command from the worktree root.
- Writes go **only** through KKarcDB.Api with `POST`, `PATCH` or `PUT` — never `DELETE`, never the Supabase tables directly.
- Only records tagged **Kind = consultant** (`tags.kind` includes `consultant`) appear; anything created gets `kind: ['consultant']`.
- Editing is allowed when the register role is `editor`, `manager` or `admin` **and** `myOfficeRole() !== 'viewer'`.
- No change to `D:\Coding\KkarcDB` or `D:\Coding\KKarcHub`.
- **Both languages:** every UI label is Hebrew in the source with its English in `i18n-dict.js`, in the last `Object.assign` chunk. Register data (names, phones, discipline names) carries `data-i18n-skip`. Discipline names show the register's `nameHe`/`nameEn` by language, not the dictionary.
- **Dictionary traps:** the dictionary already maps `משרד` → "Office", `משרדים` → "Offices", `כתובת` → "URL", `שם המשרד` → "Office name". Never use those alone as a label; use the phrases this plan gives.
- `project_hub_01.html` is ~1.3 MB of compiled React: find code with Grep, edit by unique string, never read it whole. New page code is `React.createElement`.
- CSS uses logical properties only (`inset-inline-start`, `margin-inline-start`, `padding-inline`, `text-align: start`).
- Tests: `node --test "tests/*.test.js"` (Node 24 needs the glob in quotes).
- **The live register has no test copy and no delete.** During checks, edit only an existing record's field and change it back; create a record only with Daniel's explicit OK.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **The same cell saved twice before the first save returns.** The second save's `was` is stale; the register answers 409 `changed`. The expected result is the "changed meanwhile" line and, after the re-read, the register's value — never a silent overwrite. Checked by hand in Task 7, Step 6.
2. **Register users listed among consultants** (`isContact: false`) must never offer inputs, whatever the role. Pinned by the `editablePerson` test in Task 2.
3. **A directory read already on its way when a write lands** must not leave the old value on screen. `reloadDirectory` waits for it and reads again (Task 4). Checked in code review and by Task 7, Step 6.
4. **English mode must not show "Office", "Offices" or "URL"** on these screens. Pinned by `tests/settings-i18n.test.js` (Tasks 5 and 6) and checked by eye in Task 7.
5. **Phone numbers with hyphens in Hebrew mode** must not render reversed (`050-1234567`, not `1234567-050`). Values sit in `<bdi dir="ltr">` (Task 5); checked by eye in Task 7.

---

### Task 1: The register client can write

**Files:**
- Modify: `register-link.js` (header comment, the `get` function inside `createRegisterClient`, the returned object)
- Test: `tests/register-link.test.js` (append)

**Interfaces:**
- Consumes: the existing `createRegisterClient(config, createSupabase, fetchImpl)`.
- Produces: `client.send(method, path, body)` → `Promise<{state:'ok', data}|{state:'changed', current}|{state:'rejected', code, error}|{state:'not-found'}|{state:'refused', subject}|{state:'signed-out'}|{state:'unreachable'}>`. `data` is `null` for a 204. It throws for any method other than `'POST'`, `'PATCH'` or `'PUT'`.

- [ ] **Step 1: Write the failing tests** — append to `tests/register-link.test.js`:

```js
// ── writes (spec 2026-10-07 §1) ──
function fakeWriteFetch(answers, seen) {
  return async (url, init) => {
    seen.push({ url, method: init.method, auth: init.headers.Authorization, type: init.headers['Content-Type'], body: init.body });
    const a = answers.shift();
    if (a === 'throw') throw new TypeError('Failed to fetch');
    return {
      status: a.status, ok: a.status >= 200 && a.status < 300,
      json: async () => { if (a.body === undefined) throw new SyntaxError('Unexpected end of JSON input'); return a.body; },
    };
  };
}

test('send: a PATCH carries the token, the method and the JSON body; 204 is ok with no data', async () => {
  const seen = [];
  const c = RL.createRegisterClient(config, fakeSupabase(), fakeWriteFetch([{ status: 204 }], seen));
  const r = await c.send('PATCH', '/api/contacts/p1', { field: 'mobile', value: '050', was: null });
  assert.deepStrictEqual(r, { state: 'ok', data: null });
  assert.deepStrictEqual(seen, [{
    url: 'https://api.example/api/contacts/p1', method: 'PATCH', auth: 'Bearer ' + jwt({ sub: 'first' }),
    type: 'application/json', body: JSON.stringify({ field: 'mobile', value: '050', was: null }),
  }]);
});

test('send: a POST answers with what the API returned', async () => {
  const c = RL.createRegisterClient(config, fakeSupabase(), fakeWriteFetch([{ status: 200, body: { id: 'n1' } }], []));
  assert.deepStrictEqual(await c.send('POST', '/api/firms', { name: 'X', tags: {} }), { state: 'ok', data: { id: 'n1' } });
});

test('send: an expired token is refreshed once and the write retried', async () => {
  const seen = [];
  const c = RL.createRegisterClient(config, fakeSupabase(), fakeWriteFetch([{ status: 401 }, { status: 204 }], seen));
  assert.strictEqual((await c.send('PUT', '/api/firms/f1/tags/discipline', { codes: [], was: [] })).state, 'ok');
  assert.deepStrictEqual(seen.map(s => [s.method, s.auth]), [
    ['PUT', 'Bearer ' + jwt({ sub: 'first' })], ['PUT', 'Bearer ' + jwt({ sub: 'second' })],
  ]);
});

test('send: 409 changed carries what the other person saved', async () => {
  const c = RL.createRegisterClient(config, fakeSupabase(),
    fakeWriteFetch([{ status: 409, body: { code: 'changed', error: 'x', current: '052' } }], []));
  assert.deepStrictEqual(await c.send('PATCH', '/api/contacts/p1', {}), { state: 'changed', current: '052' });
  const d = RL.createRegisterClient(config, fakeSupabase(),
    fakeWriteFetch([{ status: 409, body: { code: 'changed', error: 'x', current: null } }], []));
  assert.deepStrictEqual(await d.send('PATCH', '/api/contacts/p1', {}), { state: 'changed', current: null }, 'cleared meanwhile');
});

test('send: other 409s and 400s are rejected, with the API\'s code and message', async () => {
  for (const [status, body] of [
    [409, { code: 'not_a_contact', error: 'Users are edited on Users.' }],
    [400, { code: 'invalid_value', error: 'name is required' }],
  ]) {
    const c = RL.createRegisterClient(config, fakeSupabase(), fakeWriteFetch([{ status, body }], []));
    assert.deepStrictEqual(await c.send('PATCH', '/api/contacts/p1', {}), { state: 'rejected', code: body.code, error: body.error }, String(status));
  }
  const e = RL.createRegisterClient(config, fakeSupabase(), fakeWriteFetch([{ status: 400 }], []));
  assert.deepStrictEqual(await e.send('POST', '/api/contacts', {}), { state: 'rejected', code: null, error: null }, 'a 400 with no body');
});

test('send: 403 refused, 404 not-found, 5xx and a network failure unreachable, no session signed-out', async () => {
  for (const [answer, expected] of [
    [{ status: 403 }, { state: 'refused', subject: 'first' }],
    [{ status: 404 }, { state: 'not-found' }],
    [{ status: 500 }, { state: 'unreachable' }],
    ['throw', { state: 'unreachable' }],
  ]) {
    const c = RL.createRegisterClient(config, fakeSupabase(), fakeWriteFetch([answer], []));
    assert.deepStrictEqual(await c.send('PATCH', '/api/firms/f1', {}), expected, JSON.stringify(answer));
  }
  const seen = [];
  const n = RL.createRegisterClient(config, fakeSupabase({ token: null }), fakeWriteFetch([{ status: 204 }], seen));
  assert.deepStrictEqual(await n.send('PATCH', '/api/firms/f1', {}), { state: 'signed-out' });
  assert.strictEqual(seen.length, 0);
});

test('send: only POST, PATCH and PUT — anything else throws, and nothing is sent', async () => {
  const seen = [];
  const c = RL.createRegisterClient(config, fakeSupabase(), fakeWriteFetch([{ status: 204 }], seen));
  for (const m of ['GET', 'DELETE', 'patch']) await assert.rejects(c.send(m, '/api/firms/f1', {}), /POST, PATCH and PUT/, m);
  assert.strictEqual(seen.length, 0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/register-link.test.js`
Expected: the seven new `send:` tests FAIL with `TypeError: c.send is not a function`; all the older tests PASS.

- [ ] **Step 3: Implement `send`.** In `register-link.js`, replace the whole `async function get(path) { … }` (from `    async function get(path) {` down to its closing `    }` just above `    async function signIn() {`) with:

```js
    // One request with the token, refreshed and retried once on 401. Gives the response, or the
    // answer that ends it: signed-out, refused, not-found or unreachable.
    async function call(path, init) {
      let t = await token();
      if (!t) return { answer: { state: 'signed-out' } };
      for (let attempt = 0; ; attempt++) {
        let res;
        try {
          const headers = Object.assign({ Authorization: 'Bearer ' + t, Accept: 'application/json' }, init && init.headers);
          res = await doFetch(api + path, Object.assign({}, init, { headers }));
        } catch (e) {
          return { answer: { state: 'unreachable' } };
        }
        if (res.status === 401 && attempt === 0) {
          t = accessToken(await sb.auth.refreshSession());
          if (!t) return { answer: { state: 'signed-out' } };
          continue;
        }
        if (res.status === 401 || res.status === 403) return { answer: { state: 'refused', subject: subjectOf(t) } };
        if (res.status === 404) return { answer: { state: 'not-found' } };
        return { res };
      }
    }

    async function get(path) {
      const { res, answer } = await call(path);
      if (answer) return answer;
      if (!res.ok) return { state: 'unreachable' };
      try {
        return { state: 'ok', data: await res.json() };
      } catch (e) {
        return { state: 'unreachable' };
      }
    }

    /* A write (2026-10-07 design §1): POST, PATCH or PUT only. A 409 `changed` brings what the
       other person saved; another 409 or a 400 is the register refusing the value. */
    const WRITES = ['POST', 'PATCH', 'PUT'];
    async function send(method, path, body) {
      if (!WRITES.includes(method)) throw new Error('register-link: only POST, PATCH and PUT are sent, not ' + method);
      const { res, answer } = await call(path, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body === undefined ? null : body),
      });
      if (answer) return answer;
      if (res.ok) {
        let data = null;
        try { data = await res.json(); } catch (e) { /* 204: nothing to read */ }
        return { state: 'ok', data };
      }
      if (res.status === 409 || res.status === 400) {
        let b = null;
        try { b = await res.json(); } catch (e) { /* no body */ }
        b = b || {};
        if (res.status === 409 && b.code === 'changed') return { state: 'changed', current: b.current === undefined ? null : b.current };
        return { state: 'rejected', code: b.code || null, error: b.error || null };
      }
      return { state: 'unreachable' };
    }
```

In the object `createRegisterClient` returns, add `send,` on the line after `get,`.

In the comment above `createRegisterClient`, replace the sentence `Only GET is ever sent.` with `get reads; send writes, with POST, PATCH or PUT only.`

Replace the file's first line `/* Project Hub ↔ the register (KKarcDB on Supabase), read-only.` with:

```js
/* Project Hub ↔ the register (KKarcDB on Supabase). Reads projects, people, firms and tags; writes
   consultants and firms only (docs/superpowers/specs/2026-10-07-settings-consultants-firms-design.md).
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/register-link.test.js`
Expected: all tests PASS, including the older `client:` tests (the refactor keeps `get`'s answers).

- [ ] **Step 5: Commit**

```bash
git add register-link.js tests/register-link.test.js
git commit -m "feat(register-link): the client can write — POST, PATCH and PUT, with changed and rejected answers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Which consultants and firms, in what order, who may edit

**Files:**
- Modify: `register-link.js` (new helpers before `const RETURN_KEY`, and the `api` export object)
- Test: `tests/register-link.test.js` (append)

**Interfaces:**
- Consumes: nothing new.
- Produces (all on `RegisterLink` / `module.exports`):
  - `isConsultant(x) → boolean` — person or firm with `tags.kind` including `'consultant'`
  - `consultantFirms(firms) → firm[]`
  - `nameIn(x, lang) → string` — `lang` `'he'|'en'`
  - `tagLabel(tag, lang) → string`
  - `canEditRegister(role, officeRole) → boolean`
  - `editablePerson(person, canEdit) → boolean`
  - `disciplineChoices(tags, firm, lang) → {code, label, ofFirm}[]`
  - `firmChoices(firms, currentFirmId, lang) → {id, label}[]`
  - `firmConsultantCount(firmId, persons) → number`
  - `filterConsultants(persons, firms, tags, {q, firmId, lang}) → person[]`
  - `filterFirms(firms, tags, {q, lang}) → firm[]`

- [ ] **Step 1: Write the failing tests** — append to `tests/register-link.test.js`:

```js
// ── Settings: consultants and firms (spec 2026-10-07 §2) ──
const dTags = [
  { typeCode: 'discipline', code: 'structural', nameEn: 'Structural', nameHe: 'קונסטרוקציה', sortOrder: 20 },
  { typeCode: 'discipline', code: 'electrical', nameEn: 'Electrical', nameHe: 'חשמל', sortOrder: 30 },
  { typeCode: 'discipline', code: 'fire', nameEn: 'Fire safety', nameHe: 'כבאות', sortOrder: 80 },
  { typeCode: 'kind', code: 'consultant', nameEn: 'Consultant', nameHe: 'יועץ', sortOrder: 10 },
];
const dFirms = [
  { id: 'f1', name: 'Struct Ltd', nameHe: 'קונס', tags: { kind: ['consultant'], discipline: ['electrical', 'structural'] }, phone: '03-1', email: 's@x', address: 'Haifa' },
  { id: 'f2', name: 'Alpha Fire', nameHe: null, tags: { kind: ['consultant'], discipline: ['fire'] } },
  { id: 'f3', name: 'Client Inc', nameHe: 'הלקוח', tags: { kind: ['client'] } },
];
const dPersons = [
  { id: 'p1', name: 'Avi Levi', nameHe: 'אבי לוי', firmId: 'f1', mobile: '050-1', email: 'avi@x', tags: { kind: ['consultant'], discipline: ['structural'] }, isContact: true },
  { id: 'p2', name: 'Beni', nameHe: null, firmId: 'f2', tags: { kind: ['consultant'] }, isContact: true },
  { id: 'p3', name: 'Cli', nameHe: 'קלי', firmId: 'f3', tags: { kind: ['client'] }, isContact: true },
  { id: 'p4', name: 'Dana', nameHe: 'דנה', firmId: 'f3', tags: { kind: ['consultant'], discipline: ['fire'] }, isContact: false },
  { id: 'p5', name: 'Staff', firmId: null, tags: { kind: ['internal'] }, isContact: false },
];

test('isConsultant and consultantFirms: by the kind/consultant tag, people and firms alike', () => {
  assert.deepStrictEqual(dPersons.filter(RL.isConsultant).map(p => p.id), ['p1', 'p2', 'p4']);
  assert.deepStrictEqual(RL.consultantFirms(dFirms).map(f => f.id), ['f1', 'f2']);
  assert.strictEqual(RL.isConsultant({}), false, 'no tags at all');
  assert.deepStrictEqual(RL.consultantFirms(null), []);
});

test('canEditRegister: an editing register role, and not a hub Viewer', () => {
  for (const role of ['editor', 'manager', 'admin']) assert.strictEqual(RL.canEditRegister(role, 'editor'), true, role);
  assert.strictEqual(RL.canEditRegister('reader', 'superadmin'), false, 'a register reader');
  assert.strictEqual(RL.canEditRegister(null, 'editor'), false, 'role not known yet');
  assert.strictEqual(RL.canEditRegister('admin', 'viewer'), false, 'a hub Viewer');
});

test('editablePerson: a contact, when the screen may edit — never a register user', () => {
  assert.strictEqual(RL.editablePerson(dPersons[0], true), true);
  assert.strictEqual(RL.editablePerson(dPersons[0], false), false);
  assert.strictEqual(RL.editablePerson(dPersons[3], true), false, 'Dana is a user (isContact false)');
});

test('nameIn: the language\'s own name first, the other when it is missing', () => {
  assert.strictEqual(RL.nameIn(dPersons[0], 'he'), 'אבי לוי');
  assert.strictEqual(RL.nameIn(dPersons[0], 'en'), 'Avi Levi');
  assert.strictEqual(RL.nameIn(dPersons[1], 'he'), 'Beni', 'no Hebrew name');
  assert.strictEqual(RL.nameIn({ name: '', nameHe: 'רק עברית' }, 'en'), 'רק עברית');
  assert.strictEqual(RL.nameIn(null, 'he'), '');
});

test('tagLabel: the register\'s own name in each language, the code when it has none', () => {
  assert.strictEqual(RL.tagLabel(dTags[2], 'he'), 'כבאות');
  assert.strictEqual(RL.tagLabel(dTags[2], 'en'), 'Fire safety');
  assert.strictEqual(RL.tagLabel({ code: 'acoustics', nameEn: null, nameHe: null }, 'he'), 'acoustics');
});

test('disciplineChoices: the firm\'s disciplines first, each part in the register\'s order', () => {
  assert.deepStrictEqual(RL.disciplineChoices(dTags, dFirms[0], 'en'), [
    { code: 'structural', label: 'Structural', ofFirm: true },
    { code: 'electrical', label: 'Electrical', ofFirm: true },
    { code: 'fire', label: 'Fire safety', ofFirm: false },
  ]);
  const none = RL.disciplineChoices(dTags, null, 'he');
  assert.deepStrictEqual(none.map(c => c.label), ['קונסטרוקציה', 'חשמל', 'כבאות'], 'no firm: all, in order');
  assert.ok(!none.some(c => c.code === 'consultant'), 'kind tags are not disciplines');
});

test('firmChoices: consultant firms by name, plus the current firm when it is not one', () => {
  assert.deepStrictEqual(RL.firmChoices(dFirms, 'f1', 'en'), [{ id: 'f2', label: 'Alpha Fire' }, { id: 'f1', label: 'Struct Ltd' }]);
  assert.deepStrictEqual(RL.firmChoices(dFirms, 'f3', 'en').map(f => f.id), ['f2', 'f3', 'f1'], 'Client Inc kept for Dana');
  assert.deepStrictEqual(RL.firmChoices(dFirms, null, 'en').map(f => f.id), ['f2', 'f1']);
  assert.deepStrictEqual(RL.firmChoices(dFirms, 'gone', 'en').map(f => f.id), ['f2', 'f1'], 'a firm the register no longer has');
});

test('firmConsultantCount: the firm\'s consultants only', () => {
  assert.strictEqual(RL.firmConsultantCount('f1', dPersons), 1);
  assert.strictEqual(RL.firmConsultantCount('f3', dPersons), 1, 'Dana counts; the client does not');
  assert.strictEqual(RL.firmConsultantCount('none', dPersons), 0);
});

test('filterConsultants: consultants only, by firm, searched across names, firm, disciplines and contacts', () => {
  const ids = opts => RL.filterConsultants(dPersons, dFirms, dTags, opts).map(p => p.id);
  assert.deepStrictEqual(ids({ lang: 'en' }), ['p1', 'p2', 'p4'], 'Avi Levi, Beni, Dana');
  assert.deepStrictEqual(ids({ firmId: 'f1', lang: 'en' }), ['p1']);
  assert.deepStrictEqual(ids({ q: 'קונס', lang: 'he' }), ['p1'], 'the firm\'s Hebrew name');
  assert.deepStrictEqual(ids({ q: 'fire SAFETY', lang: 'en' }), ['p4'], 'a discipline, any case');
  assert.deepStrictEqual(ids({ q: 'כבאות', lang: 'he' }), ['p4'], 'a discipline in Hebrew');
  assert.deepStrictEqual(ids({ q: '050-1', lang: 'en' }), ['p1']);
  assert.deepStrictEqual(ids({ q: '  ', lang: 'en' }), ['p1', 'p2', 'p4'], 'a blank search is no search');
  assert.deepStrictEqual(RL.filterConsultants(null, null, null, {}), []);
});

test('filterFirms: consultant firms, searched across names, disciplines and contacts', () => {
  const ids = opts => RL.filterFirms(dFirms, dTags, opts).map(f => f.id);
  assert.deepStrictEqual(ids({ lang: 'en' }), ['f2', 'f1']);
  assert.deepStrictEqual(ids({ q: 'haifa', lang: 'en' }), ['f1'], 'the address');
  assert.deepStrictEqual(ids({ q: 'חשמל', lang: 'he' }), ['f1']);
  assert.deepStrictEqual(ids({ q: 'client', lang: 'en' }), [], 'not a consultant firm');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/register-link.test.js`
Expected: the ten new tests FAIL with `TypeError: RL.isConsultant is not a function` (or the matching missing name); the rest PASS.

- [ ] **Step 3: Implement.** In `register-link.js`, insert immediately above the line `  const RETURN_KEY = 'register-return';`:

```js
  /* ── Settings: the register's consultants and firms (2026-10-07 design §2) ── */
  const tagsOf = (x, type) => ((x && x.tags) || {})[type] || [];
  const locale = lang => (lang === 'en' ? 'en' : 'he');

  /* A person or a firm the register calls a consultant. */
  const isConsultant = x => tagsOf(x, 'kind').includes('consultant');
  const consultantFirms = firms => (firms || []).filter(isConsultant);

  /* The name for the page's language, the other one when that is missing. */
  function nameIn(x, lang) {
    const v = lang === 'en' ? x && (x.name || x.nameHe) : x && (x.nameHe || x.name);
    return String(v || '').trim();
  }

  function tagLabel(tag, lang) {
    return (lang === 'en' ? tag.nameEn || tag.nameHe : tag.nameHe || tag.nameEn) || tag.code;
  }

  const EDIT_ROLES = ['editor', 'manager', 'admin'];
  function canEditRegister(role, officeRole) {
    return EDIT_ROLES.includes(role) && officeRole !== 'viewer';
  }

  /* A register user is not a contact: the API edits users only on its admin pages. */
  function editablePerson(person, canEdit) {
    return !!canEdit && !!person && person.isContact !== false;
  }

  /* The discipline checklist: the firm's disciplines first, then the rest, each part in the
     register's order. */
  function disciplineChoices(tags, firm, lang) {
    const mine = new Set(tagsOf(firm, 'discipline'));
    const all = (tags || []).filter(t => t.typeCode === 'discipline').slice()
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || String(a.code).localeCompare(String(b.code)));
    const choice = t => ({ code: t.code, label: tagLabel(t, lang), ofFirm: mine.has(t.code) });
    return all.filter(t => mine.has(t.code)).concat(all.filter(t => !mine.has(t.code))).map(choice);
  }

  /* The firm list's choices: the consultant firms, and the current firm when it is not one, so
     the list can always hold the value it shows. */
  function firmChoices(firms, currentFirmId, lang) {
    const list = consultantFirms(firms);
    const current = currentFirmId && !list.some(f => f.id === currentFirmId)
      ? (firms || []).find(f => f.id === currentFirmId) : null;
    return (current ? list.concat([current]) : list)
      .map(f => ({ id: f.id, label: nameIn(f, lang) }))
      .sort((a, b) => a.label.localeCompare(b.label, locale(lang)));
  }

  function firmConsultantCount(firmId, persons) {
    return (persons || []).filter(p => p.firmId === firmId && isConsultant(p)).length;
  }

  const needleOf = q => String(q == null ? '' : q).trim().toLowerCase();
  const hit = (needle, values) => !needle || values.some(v => String(v == null ? '' : v).toLowerCase().includes(needle));
  function disciplineWords(x, tags) {
    const codes = new Set(tagsOf(x, 'discipline'));
    return (tags || []).filter(t => t.typeCode === 'discipline' && codes.has(t.code)).flatMap(t => [t.code, t.nameHe, t.nameEn]);
  }

  function filterConsultants(persons, firms, tags, opts) {
    const { q, firmId, lang } = opts || {};
    const firmById = new Map((firms || []).map(f => [f.id, f]));
    const needle = needleOf(q);
    return (persons || [])
      .filter(p => isConsultant(p) && (!firmId || p.firmId === firmId))
      .filter(p => {
        const firm = firmById.get(p.firmId) || {};
        return hit(needle, [p.name, p.nameHe, firm.name, firm.nameHe, p.firmName, p.phone, p.mobile, p.email]
          .concat(disciplineWords(p, tags)));
      })
      .sort((a, b) => nameIn(a, lang).localeCompare(nameIn(b, lang), locale(lang)));
  }

  function filterFirms(firms, tags, opts) {
    const { q, lang } = opts || {};
    const needle = needleOf(q);
    return consultantFirms(firms)
      .filter(f => hit(needle, [f.name, f.nameHe, f.phone, f.email, f.address].concat(disciplineWords(f, tags))))
      .sort((a, b) => nameIn(a, lang).localeCompare(nameIn(b, lang), locale(lang)));
  }

```

In the `const api = { … }` object at the end of the file, add a line before `};`:

```js
    isConsultant, consultantFirms, nameIn, tagLabel, canEditRegister, editablePerson, disciplineChoices,
    firmChoices, firmConsultantCount, filterConsultants, filterFirms,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/register-link.test.js`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add register-link.js tests/register-link.test.js
git commit -m "feat(register-link): consultants and firms — who counts, their order, search, and who may edit" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: What a new record sends, and what a failed write says

**Files:**
- Modify: `register-link.js` (more helpers after Task 2's, and the `api` export)
- Test: `tests/register-link.test.js` (append)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `blank(v) → string|null` — trimmed; empty → `null`
  - `newContactBody({name, firmId, email, mobile, disciplines}) → {name, firmId, email, mobile, tags:{kind:['consultant'], discipline}}`
  - `newFirmBody({name, disciplines}) → {name, tags:{kind:['consultant'], discipline}}`
  - `withEdit(data, list, id, patch) → data` — `list` is `'persons'` or `'firms'`; returns a new object, never mutates
  - `writeErrorOf(answer) → null | {text, vars, detail}` — `text` is a Hebrew template for `I18N.t(text, vars)`; `detail` is the API's own message or `null`

- [ ] **Step 1: Write the failing tests** — append to `tests/register-link.test.js`:

```js
test('blank: trims, and empty means null', () => {
  assert.strictEqual(RL.blank('  x  '), 'x');
  for (const v of ['', '   ', null, undefined]) assert.strictEqual(RL.blank(v), null, JSON.stringify(v));
});

test('newContactBody: trimmed, blanks as null, Kind consultant, the chosen disciplines', () => {
  assert.deepStrictEqual(RL.newContactBody({ name: '  Avi ', firmId: 'f1', email: ' ', mobile: '050', disciplines: ['fire'] }), {
    name: 'Avi', firmId: 'f1', email: null, mobile: '050', tags: { kind: ['consultant'], discipline: ['fire'] },
  });
  const bare = RL.newContactBody({ name: 'B', firmId: '' });
  assert.strictEqual(bare.firmId, null, 'no firm');
  assert.deepStrictEqual(bare.tags, { kind: ['consultant'], discipline: [] });
});

test('newFirmBody: the name, and Kind consultant with the chosen disciplines', () => {
  assert.deepStrictEqual(RL.newFirmBody({ name: ' Alpha ', disciplines: ['fire', 'hvac'] }),
    { name: 'Alpha', tags: { kind: ['consultant'], discipline: ['fire', 'hvac'] } });
});

test('withEdit: one record changed, the rest and the input untouched', () => {
  const data = { persons: [{ id: 'p1', mobile: '1' }, { id: 'p2', mobile: '2' }], firms: [] };
  const next = RL.withEdit(data, 'persons', 'p2', { mobile: '9' });
  assert.deepStrictEqual(next.persons, [{ id: 'p1', mobile: '1' }, { id: 'p2', mobile: '9' }]);
  assert.strictEqual(data.persons[1].mobile, '2', 'not mutated');
  assert.strictEqual(next.firms, data.firms, 'the other list is the same object');
  assert.strictEqual(RL.withEdit(null, 'persons', 'p1', {}), null);
});

test('writeErrorOf: a sentence per failure, with the other person\'s value for changed', () => {
  assert.strictEqual(RL.writeErrorOf({ state: 'ok' }), null);
  assert.deepStrictEqual(RL.writeErrorOf({ state: 'changed', current: '052' }).vars, { value: '052' });
  assert.deepStrictEqual(RL.writeErrorOf({ state: 'changed', current: null }).vars, { value: '—' });
  assert.deepStrictEqual(RL.writeErrorOf({ state: 'changed', current: ['fire', 'hvac'] }).vars, { value: 'fire, hvac' });
  const user = RL.writeErrorOf({ state: 'rejected', code: 'not_a_contact', error: 'Users are edited on Users.' });
  assert.ok(user.text.includes('KK Hub'));
  assert.strictEqual(user.detail, null, 'our own sentence says it all');
  assert.strictEqual(RL.writeErrorOf({ state: 'rejected', code: 'invalid_value', error: 'name is required' }).detail, 'name is required');
  const other = RL.writeErrorOf({ state: 'rejected', code: 'last_admin', error: 'Keep one admin.' });
  assert.strictEqual(other.text, RL.writeErrorOf({ state: 'rejected', code: null, error: null }).text, 'the general sentence');
  assert.strictEqual(other.detail, 'Keep one admin.');
  for (const state of ['not-found', 'refused', 'signed-out', 'unreachable', 'something-new']) {
    const e = RL.writeErrorOf({ state });
    assert.ok(e && /[\u0590-\u05FF]/.test(e.text) && e.detail === null, state);
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/register-link.test.js`
Expected: the five new tests FAIL (`RL.blank is not a function` and so on).

- [ ] **Step 3: Implement.** In `register-link.js`, insert directly after Task 2's `filterFirms` function (still above `const RETURN_KEY`):

```js
  const blank = v => {
    const s = String(v == null ? '' : v).trim();
    return s === '' ? null : s;
  };

  /* What + New consultant and + New firm send: trimmed, blanks as null, and the consultant Kind. */
  function newContactBody(form) {
    return {
      name: blank(form.name), firmId: form.firmId || null, email: blank(form.email), mobile: blank(form.mobile),
      tags: { kind: ['consultant'], discipline: (form.disciplines || []).slice() },
    };
  }
  function newFirmBody(form) {
    return { name: blank(form.name), tags: { kind: ['consultant'], discipline: (form.disciplines || []).slice() } };
  }

  /* The directory with one record changed as the register now has it — shown at once while the
     re-read is on its way. */
  function withEdit(data, list, id, patch) {
    if (!data || !Array.isArray(data[list])) return data;
    return Object.assign({}, data, { [list]: data[list].map(x => (x.id === id ? Object.assign({}, x, patch) : x)) });
  }

  /* The line a failed write shows (spec §2), a template for the page's translator. */
  const WRITE_TEXT = {
    changed: 'השדה שונה בינתיים על ידי מישהו אחר. הערך עכשיו: {value}',
    not_a_contact: 'זה משתמש במאגר, לא איש קשר — עריכה ב-KK Hub',
    invalid_value: 'המאגר לא קיבל את הערך',
    rejected: 'המאגר סירב לשינוי',
    'not-found': 'הרשומה לא נמצאה במאגר — ייתכן שמוזגה',
    refused: 'אין הרשאה לשנות את המאגר',
    'signed-out': 'החיבור למאגר פג — התחבר שוב',
    unreachable: 'המאגר לא עונה — השינוי לא נשמר',
  };
  function writeErrorOf(answer) {
    if (!answer || answer.state === 'ok') return null;
    if (answer.state === 'changed') {
      const c = answer.current;
      const value = Array.isArray(c) ? (c.length ? c.join(', ') : '—') : c == null || c === '' ? '—' : String(c);
      return { text: WRITE_TEXT.changed, vars: { value }, detail: null };
    }
    if (answer.state === 'rejected') {
      if (answer.code === 'not_a_contact') return { text: WRITE_TEXT.not_a_contact, vars: null, detail: null };
      const text = answer.code === 'invalid_value' ? WRITE_TEXT.invalid_value : WRITE_TEXT.rejected;
      return { text, vars: null, detail: answer.error || null };
    }
    return { text: WRITE_TEXT[answer.state] || WRITE_TEXT.unreachable, vars: null, detail: null };
  }

```

Add to the `api` export object, on a new line before `};`:

```js
    blank, newContactBody, newFirmBody, withEdit, writeErrorOf,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/register-link.test.js`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add register-link.js tests/register-link.test.js
git commit -m "feat(register-link): new consultant and firm bodies, the edit shown at once, and a line for each failed write" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The shared register store knows who you are and can write

**Files:**
- Modify: `register-link-ui.js`

**Interfaces:**
- Consumes: `client.send` (Task 1), `RL.withEdit` (Task 3), `RL.nextEntry` (existing).
- Produces, on `window.RegisterLinkUI`:
  - `useDirectory() → snap` — the store snapshot `{config, signedIn, directory, me, projects}`; starts the directory and `/api/me` reads when signed in
  - `directoryStatus(snap) → {kind:'loading'|'off'|'signed-out'|'refused'|'unreachable', subject?} | {kind:'ok', data:{persons, firms, tags}}`
  - `DirectoryNotice({status})` — the existing sign-in / refused / retry line
  - `write(method, path, body, local?) → Promise<answer>` — `local` is `{list:'persons'|'firms', id, patch}`, applied on success; the directory is then re-read
  - `hubLink(path) → string|null` — KK Hub's address plus `path`, or `null` when unknown

- [ ] **Step 1: Header comment.** Replace the opening comment's last three lines, from `page reaches it as window.RegisterLinkUI. Read-only: the one thing saved is the hub's own` through `person unlinked it (auto-linking leaves that alone). */`, with:

```js
   page reaches it as window.RegisterLinkUI. The project views are read-only: the one thing they
   save is the hub's own registerProjectId, through the page's save() — undefined means never
   linked, null means a person unlinked it (auto-linking leaves that alone). Settings' consultants
   and firms write through `write` below (2026-10-07 design). */
```

- [ ] **Step 2: The store's new state.** Replace

```js
  let client = null;
  let hubUrl = null;
  let snap = { config: 'loading', signedIn: false, directory: null, projects: {} };
```

with

```js
  let client = null;
  let hubUrl = null;
  let recheck = () => Promise.resolve();
  let snap = { config: 'loading', signedIn: false, directory: null, projects: {}, me: null };
```

- [ ] **Step 3: Who is signed in, and a re-read that cannot be stale.** Directly after the closing `}` of `function loadDirectory() { … }`, insert:

```js
  // After a write: a read already on its way may predate it, so wait for it and read again.
  function reloadDirectory() {
    const pending = inflight.directory;
    return pending ? pending.then(loadDirectory, loadDirectory) : loadDirectory();
  }

  // Who is signed in, for whether Settings may edit (2026-10-07 design §1). Once per sign-in.
  function loadMe() {
    return once('me', () => client.get('/api/me').then(r => set({ me: RL.nextEntry(snap.me, r, Date.now()) })));
  }
```

- [ ] **Step 4: Forget who you were on sign-out.** In `boot()`, replace

```js
        const refresh = () => client.token().then(t => set(t
          ? { config: 'on', signedIn: true }
          : { config: 'on', signedIn: false, directory: null, projects: {} }));
        client.onChange(refresh);
        refresh();
```

with

```js
        recheck = () => client.token().then(t => set(t
          ? { config: 'on', signedIn: true, me: snap.signedIn ? snap.me : null }
          : { config: 'on', signedIn: false, directory: null, projects: {}, me: null }));
        client.onChange(recheck);
        recheck();
```

- [ ] **Step 5: The directory hook and its states.** Directly after the closing `}` of `function useConsultantRows(data, hubDisciplines) { … }`, insert:

```js
  /* Settings' consultants and firms: the shared directory, and who is signed in. */
  function useDirectory() {
    const s = useStore();
    const haveDirectory = !!s.directory;
    const haveMe = !!s.me;
    useEffect(() => {
      if (s.config !== 'on' || !s.signedIn) return;
      if (!haveDirectory) loadDirectory();
      if (!haveMe) loadMe();
    }, [s.config, s.signedIn, haveDirectory, haveMe]);
    return s;
  }

  function directoryStatus(s) {
    if (s.config === 'loading') return { kind: 'loading' };
    if (s.config === 'off') return { kind: 'off' };
    if (!s.signedIn) return { kind: 'signed-out' };
    const d = s.directory;
    if (!d) return { kind: 'loading' };
    if (d.state !== 'ok') return { kind: d.state === 'refused' || d.state === 'signed-out' ? d.state : 'unreachable', subject: d.subject };
    return { kind: 'ok', data: d.data };
  }
```

- [ ] **Step 6: Writing, the notice, the KK Hub link.** Directly above the line `  window.RegisterLinkUI = { useConsultantRows, FactsCard, ConsultantsNotice, EditInHub, AutoLink };`, insert:

```js
  /* A write to the register (2026-10-07 design §2). `local` — { list, id, patch } — is applied at
     once on success, so a cell does not flick back while the directory is re-read. */
  function write(method, path, body, local) {
    if (!client) return Promise.resolve({ state: 'unreachable' });
    return client.send(method, path, body).then(r => {
      const d = snap.directory;
      if (r.state === 'ok' && local && d && d.state === 'ok') {
        set({ directory: Object.assign({}, d, { data: RL.withEdit(d.data, local.list, local.id, local.patch) }) });
      }
      if (r.state === 'signed-out') recheck();
      if (r.state === 'ok' || r.state === 'changed' || r.state === 'not-found') reloadDirectory();
      return r;
    });
  }

  // The project notice, for the directory's states (loading, off, signed-out, refused, unreachable).
  function DirectoryNotice({ status }) {
    return h(Notice, { data: {}, save: () => {}, hubCode: '', status });
  }

  const hubLink = path => (hubUrl ? hubUrl + path : null);
```

Then replace that export line with:

```js
  window.RegisterLinkUI = {
    useConsultantRows, FactsCard, ConsultantsNotice, EditInHub, AutoLink,
    useDirectory, directoryStatus, DirectoryNotice, write, hubLink,
  };
```

- [ ] **Step 7: Syntax and tests**

Run: `node --check register-link-ui.js && node --test "tests/*.test.js"`
Expected: no syntax error; all tests PASS.

- [ ] **Step 8: The page still runs.** The worktree has no `node_modules` or `data/` (both gitignored). Set them up once:

```bash
cd tools/local-server && npm ci && cd ../..
```

```bash
cp -r ../../data ./data
```

Start the `project-hub` preview (`preview_start` with `{name: "project-hub"}`), open a project, open its consultants table (project page → Contacts) and Settings. Run `read_console_messages` with `onlyErrors: true`.
Expected: no errors. The register shows "המאגר לא הוגדר באתר הזה", because the preview runs without the four register settings. That is expected here.

- [ ] **Step 9: Commit**

```bash
git add register-link-ui.js
git commit -m "feat(register-link-ui): the store reads who is signed in and writes, showing an edit at once and re-reading" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Settings → Consultants

**Files:**
- Create: `register-directory-ui.js`
- Create: `tests/settings-i18n.test.js`
- Modify: `project_hub_01.html` (script tag after `register-link-ui.js`, the stand-in script, `OfficeSettingsView`)
- Modify: `i18n-dict.js` (last `Object.assign` chunk)
- Modify: `tools/i18n-extract.js` (`FILES`)
- Modify: `Deploy-Azure.ps1` (the deployed-files list)

**Interfaces:**
- Consumes: `RegisterLink.*` helpers (Tasks 2 and 3); `RegisterLinkUI.useDirectory`, `directoryStatus`, `DirectoryNotice`, `write`, `hubLink` (Task 4); `window.I18N.get()` / `window.I18N.t(s, vars)` and the `i18n:change` window event (existing `i18n.js`).
- Produces: `window.RegisterDirectoryUI.ConsultantsSettings({ officeRole, firmId, onClearFirm })`. `firmId` is an optional firm filter; `onClearFirm()` removes it. Task 6 adds `FirmsSettings` to the same object and reuses this file's `EditableText`, `DisciplinePicker`, `Message`, `ReadOnlyLine`, `useEditor`, `canEditOf`, `useLang`, `t`, `SKIP`, `EMPTY` and `FIELD_LABEL`.

- [ ] **Step 1: Write the failing test** — create `tests/settings-i18n.test.js`:

```js
'use strict';
// Run: node --test tests/settings-i18n.test.js — Settings' consultants and firms read right in
// English, past the dictionary's older "משרד" (Office) and "כתובת" (URL). Uses the extractor's
// translator, which mirrors i18n.js: longest key first, never inside a larger Hebrew word.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadDict, buildTranslator } = require('../tools/i18n-extract.js');

const tr = buildTranslator(loadDict(fs.readFileSync(path.join(__dirname, '..', 'i18n-dict.js'), 'utf8')));
const expectAll = cases => { for (const [he, en] of Object.entries(cases)) assert.strictEqual(tr(he), en, he); };

test('Settings → Consultants in English', () => {
  expectAll({
    'יועצים': 'Consultants',
    '{n} יועצים במאגר': '{n} consultants in the register',
    'מהמאגר (KKarcDB)': 'From the register (KKarcDB)',
    'חיפוש לפי שם, משרד, תחום, טלפון או מייל': 'Search by name, firm, discipline, phone or email',
    '+ יועץ חדש': '+ New consultant',
    'יועץ חדש': 'New consultant',
    'יועץ': 'Consultant',
    'משרד היועץ': 'Firm',
    'תחומים': 'Disciplines',
    'כתובת המשרד': 'Address',
    'נייד': 'Mobile',
    'טלפון': 'Phone',
    'מייל': 'Email',
    'פרויקטים': 'Projects',
    'לא נמצאו יועצים': 'No consultants found',
    'משתמש במאגר': 'Register user',
    'משתמש במאגר נערך ב-KK Hub': 'A register user is edited in KK Hub',
    'הצגת כל היועצים': 'Show all consultants',
    'ללא משרד': 'No firm',
    'תחומי המשרד': 'The firm\'s disciplines',
    'שאר התחומים': 'Other disciplines',
    'שם באנגלית': 'English name',
    'שם בעברית': 'Hebrew name',
    'יצירה': 'Create',
    'פתיחה ב-KK Hub': 'Open in KK Hub',
    'צפייה בלבד — עריכת המאגר דורשת הרשאת Editor במאגר': 'View only — editing the register needs the Editor role in the register',
    'המאגר לא זמין באתר הזה': 'The register isn\'t available on this site',
  });
});

test('a failed write\'s lines in English', () => {
  expectAll({
    'השדה שונה בינתיים על ידי מישהו אחר. הערך עכשיו: {value}': 'Someone else changed this field meanwhile. It now reads: {value}',
    'זה משתמש במאגר, לא איש קשר — עריכה ב-KK Hub': 'This is a register user, not a contact — edit them in KK Hub',
    'המאגר לא קיבל את הערך': 'The register didn\'t accept the value',
    'המאגר סירב לשינוי': 'The register refused the change',
    'הרשומה לא נמצאה במאגר — ייתכן שמוזגה': 'The record wasn\'t found in the register — it may have been merged',
    'אין הרשאה לשנות את המאגר': 'You don\'t have permission to change the register',
    'החיבור למאגר פג — התחבר שוב': 'The register sign-in has expired — sign in again',
    'המאגר לא עונה — השינוי לא נשמר': 'The register isn\'t answering — the change wasn\'t saved',
  });
});
```

`יועץ`, `נייד`, `טלפון`, `מייל`, `פרויקטים`, `שם באנגלית`, `שם בעברית` and `פתיחה ב-KK Hub` are already in the dictionary with this English. Never edit them: other screens use them.

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/settings-i18n.test.js`
Expected: FAIL. The first failing key is `{n} יועצים במאגר`, which comes back half-translated (`{n} Consultants במאגר`).

- [ ] **Step 3: Dictionary entries.** In `i18n-dict.js`, replace

```js
/* ── The register card ── */
"מ״ר": "sqm"
});
```

with

```js
/* ── The register card ── */
"מ״ר": "sqm",

/* ── Settings: consultants and firms (register-directory-ui.js, register-link.js) ── */
"{n} יועצים במאגר": "{n} consultants in the register",
"מהמאגר (KKarcDB)": "From the register (KKarcDB)",
"חיפוש לפי שם, משרד, תחום, טלפון או מייל": "Search by name, firm, discipline, phone or email",
"יועץ חדש": "New consultant",
"משרד היועץ": "Firm",
"תחומים": "Disciplines",
"כתובת המשרד": "Address",
"לא נמצאו יועצים": "No consultants found",
"משתמש במאגר נערך ב-KK Hub": "A register user is edited in KK Hub",
"משתמש במאגר": "Register user",
"הצגת כל היועצים": "Show all consultants",
"ללא משרד": "No firm",
"תחומי המשרד": "The firm's disciplines",
"שאר התחומים": "Other disciplines",
"יצירה": "Create",
"צפייה בלבד — עריכת המאגר דורשת הרשאת Editor במאגר": "View only — editing the register needs the Editor role in the register",
"השדה שונה בינתיים על ידי מישהו אחר. הערך עכשיו: {value}": "Someone else changed this field meanwhile. It now reads: {value}",
"זה משתמש במאגר, לא איש קשר — עריכה ב-KK Hub": "This is a register user, not a contact — edit them in KK Hub",
"המאגר לא קיבל את הערך": "The register didn't accept the value",
"המאגר סירב לשינוי": "The register refused the change",
"הרשומה לא נמצאה במאגר — ייתכן שמוזגה": "The record wasn't found in the register — it may have been merged",
"אין הרשאה לשנות את המאגר": "You don't have permission to change the register",
"החיבור למאגר פג — התחבר שוב": "The register sign-in has expired — sign in again",
"המאגר לא עונה — השינוי לא נשמר": "The register isn't answering — the change wasn't saved",
"המאגר לא זמין באתר הזה": "The register isn't available on this site"
});
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test tests/settings-i18n.test.js`
Expected: PASS.

- [ ] **Step 5: Create `register-directory-ui.js`:**

```js
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
    return h('div', { className: 'np-err pj-err', role: 'alert' }, t(msg.text, msg.vars),
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
```

- [ ] **Step 6: Load it in the page, with a stand-in.** In `project_hub_01.html`, replace

```html
<script src="/register-link-ui.js"></script>
```

with

```html
<script src="/register-link-ui.js"></script>
<script src="/register-directory-ui.js"></script>
```

Then, in the stand-in script on the next line, insert this right after the opening `<script>` and before `/* The register views are optional:`:

```js
window.RegisterDirectoryUI=window.RegisterDirectoryUI||(function(){var off=function(){return React.createElement('div',{className:'st-section'},React.createElement('div',{className:'rl-line'},'המאגר לא זמין באתר הזה'));};return{ConsultantsSettings:off,FirmsSettings:off};})();
```

- [ ] **Step 7: The Settings menu entry.** In `OfficeSettingsView` in `project_hub_01.html`, replace

```js
  const SECTIONS = [{
    id: 'team',
    label: 'צוות',
    icon: 'consultants'
  }, {
    id: 'library',
```

with

```js
  const SECTIONS = [{
    id: 'team',
    label: 'צוות',
    icon: 'consultants'
  }, {
    id: 'consultants',
    label: 'יועצים',
    icon: 'consultants'
  }, {
    id: 'library',
```

Directly after the line `  const [section, setSection] = useState(() => SETTINGS_OPEN_AT && SETTINGS_OPEN_AT.section || 'team');`, add:

```js
  const [firmFilter, setFirmFilter] = useState(null); // Settings → Firms → a firm's consultants
```

Then replace

```js
  }, section === 'team' && /*#__PURE__*/React.createElement(OfficeTeamView, {
    data: data
  }), section === 'library'
```

with

```js
  }, section === 'team' && /*#__PURE__*/React.createElement(OfficeTeamView, {
    data: data
  }), section === 'consultants' && React.createElement(RegisterDirectoryUI.ConsultantsSettings, {
    officeRole: myOfficeRole(),
    firmId: firmFilter,
    onClearFirm: () => setFirmFilter(null)
  }), section === 'library'
```

- [ ] **Step 8: Ship it and check its strings.** In `Deploy-Azure.ps1`, in the `foreach ($f in "project_hub_01.html", …)` list, replace `"register-link-ui.js", ` with `"register-link-ui.js", "register-directory-ui.js", `. In `tools/i18n-extract.js`, replace `'register-link.js', 'register-link-ui.js'];` with `'register-link.js', 'register-link-ui.js', 'register-directory-ui.js'];`.

- [ ] **Step 9: Run the checks**

Run: `node --check register-directory-ui.js && node --test "tests/*.test.js" && node tools/i18n-extract.js | grep -E "^/\* register" ; node tools/i18n-extract.js | grep -c '": ""'`
Expected: tests all PASS; the `grep -E "^/\* register"` prints nothing, so no register file has untranslated Hebrew; the count is `171`, the same as before this work.

- [ ] **Step 10: The page.** Reload the `project-hub` preview and open Settings → יועצים.
Expected: the section opens with the "register not configured" line from the store (no register settings in this preview), and there are no console errors (`read_console_messages`, `onlyErrors: true`). Check that Settings → צוות is unchanged.

- [ ] **Step 11: Commit**

```bash
git add register-directory-ui.js tests/settings-i18n.test.js project_hub_01.html i18n-dict.js tools/i18n-extract.js Deploy-Azure.ps1
git commit -m "feat(settings): Consultants — the register's consultants, searched and edited in place, in both languages" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Settings → Firms, and a firm's consultants

**Files:**
- Modify: `register-directory-ui.js` (add `FirmRow`, `NewFirm`, `FirmsSettings`; export)
- Modify: `project_hub_01.html` (`OfficeSettingsView`: menu entry, render, clearing the filter on menu clicks)
- Modify: `i18n-dict.js`
- Test: `tests/settings-i18n.test.js` (append)

**Interfaces:**
- Consumes: from Task 5's file — `EditableText({value, canEdit, onSave, required, label, dir})`, `DisciplinePicker({codes, choices, canEdit, onSave, label})`, `Message({msg})`, `ReadOnlyLine({s, officeRole})`, `useEditor() → {msg, run}`, `canEditOf(s, officeRole)`, `useLang()`, `t`, `SKIP`, `EMPTY`, `FIELD_LABEL`, `headers(cls, labels)`, `hubAnchor(path)`; from Task 2 — `filterFirms`, `consultantFirms`, `firmConsultantCount`, `disciplineChoices`; from Task 3 — `newFirmBody`, `blank`.
- Produces: `window.RegisterDirectoryUI.FirmsSettings({ officeRole, onShowFirm })`; `onShowFirm(firmId)` opens Consultants filtered to that firm.

- [ ] **Step 1: Write the failing test** — append to `tests/settings-i18n.test.js`:

```js
test('Settings → Firms in English, never "Office" or "URL"', () => {
  expectAll({
    'משרדי יועצים': 'Firms',
    '{n} משרדי יועצים במאגר': '{n} firms in the register',
    'חיפוש לפי שם, תחום, טלפון, מייל או כתובת': 'Search by name, discipline, phone, email or address',
    '+ משרד חדש': '+ New firm',
    'משרד חדש': 'New firm',
    'משרד יועצים': 'Firm',
    'כתובת המשרד': 'Address',
    'לא נמצאו משרדי יועצים': 'No firms found',
    'הצגת היועצים של המשרד': 'Show the firm\'s consultants',
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/settings-i18n.test.js`
Expected: the new test FAILS. `משרדי יועצים` comes back as `משרדי Consultants`.

- [ ] **Step 3: Dictionary entries.** In `i18n-dict.js`, replace

```js
"המאגר לא זמין באתר הזה": "The register isn't available on this site"
});
```

with

```js
"המאגר לא זמין באתר הזה": "The register isn't available on this site",
"משרדי יועצים": "Firms",
"{n} משרדי יועצים במאגר": "{n} firms in the register",
"חיפוש לפי שם, תחום, טלפון, מייל או כתובת": "Search by name, discipline, phone, email or address",
"משרד חדש": "New firm",
"משרד יועצים": "Firm",
"לא נמצאו משרדי יועצים": "No firms found",
"הצגת היועצים של המשרד": "Show the firm's consultants"
});
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test tests/settings-i18n.test.js`
Expected: PASS.

- [ ] **Step 5: The Firms section.** In `register-directory-ui.js`, replace the line `  window.RegisterDirectoryUI = { ConsultantsSettings };` with:

```js
  /* ── Firms ── */
  function FirmRow({ f, d, lang, canEdit, run, onShowFirm }) {
    const patch = field => value => run('PATCH', '/api/firms/' + f.id,
      { field, value, was: f[field] == null ? null : f[field] },
      { list: 'firms', id: f.id, patch: { [field]: value } });
    const codes = (f.tags && f.tags.discipline) || [];
    const saveDisciplines = next => run('PUT', '/api/firms/' + f.id + '/tags/discipline', { codes: next, was: codes },
      { list: 'firms', id: f.id, patch: { tags: Object.assign({}, f.tags, { discipline: next }) } });
    const count = RL.firmConsultantCount(f.id, d.persons);
    return h('div', { className: 'st-tr rd-f', role: 'row' },
      h('span', { className: 'rd-cell', role: 'cell' },
        // The API edits a firm's main name only; a Hebrew name the register holds is shown beneath.
        h(EditableText, { value: f.name, label: 'שם באנגלית', canEdit, required: true, onSave: patch('name') }),
        f.nameHe ? h('span', { className: 'rd-sub' }, h('bdi', SKIP, f.nameHe)) : null),
      h('span', { className: 'rd-cell', role: 'cell' },
        h(DisciplinePicker, { codes, choices: RL.disciplineChoices(d.tags, null, lang), canEdit, onSave: saveDisciplines, label: 'תחומים' })),
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
      run('POST', '/api/firms', RL.newFirmBody(f)).then(r => { if (r.state === 'ok') onDone(); else setBusy(false); });
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
```

- [ ] **Step 6: The menu entry, and a filter that does not linger.** In `OfficeSettingsView` in `project_hub_01.html`, replace

```js
  }, {
    id: 'consultants',
    label: 'יועצים',
    icon: 'consultants'
  }, {
```

with

```js
  }, {
    id: 'consultants',
    label: 'יועצים',
    icon: 'consultants'
  }, {
    id: 'firms',
    label: 'משרדי יועצים',
    icon: 'building'
  }, {
```

Replace

```js
    onClearFirm: () => setFirmFilter(null)
  }), section === 'library'
```

with

```js
    onClearFirm: () => setFirmFilter(null)
  }), section === 'firms' && React.createElement(RegisterDirectoryUI.FirmsSettings, {
    officeRole: myOfficeRole(),
    onShowFirm: id => {
      setFirmFilter(id);
      setSection('consultants');
    }
  }), section === 'library'
```

Replace the menu button's click handler

```js
    onClick: () => setSection(s.id)
```

with

```js
    onClick: () => {
      setSection(s.id);
      setFirmFilter(null);
    }
```

That `onClick` occurs once inside `OfficeSettingsView`. Confirm it is unique with `grep -n "onClick: () => setSection(s.id)" project_hub_01.html` before editing.

- [ ] **Step 7: Run the checks**

Run: `node --check register-directory-ui.js && node --test "tests/*.test.js" && node tools/i18n-extract.js | grep -E "^/\* register" ; node tools/i18n-extract.js | grep -c '": ""'`
Expected: all PASS; no register file in the extractor's output; the count is still `171`.

- [ ] **Step 8: The page.** Reload the preview and open Settings → משרדי יועצים.
Expected: the section opens with the register-not-configured line; no console errors.

- [ ] **Step 9: Commit**

```bash
git add register-directory-ui.js project_hub_01.html i18n-dict.js tests/settings-i18n.test.js
git commit -m "feat(settings): Firms — the register's consultant firms, edited in place, and each firm's consultants one click away" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Against the live register, then the documents

**Files:**
- Modify: `CLAUDE.md` (the "The register" paragraph)
- Modify: `docs/azure.md` (the "The register" section)
- Modify: `docs/superpowers/specs/2026-10-04-register-link-design.md` (a one-line pointer at the top)

**Interfaces:**
- Consumes: everything above.
- Produces: documents that no longer say the hub never writes to the register.

- [ ] **Step 1: Start the server with the register settings.** The register allows `http://localhost:3000` (CORS), so the server must listen on exactly that port. The Supabase URL and anon key are public: read them from KK Hub's `https://icy-sky-0b0e54f0f.6.azurestaticapps.net/shell/config.json`. Start the server in the user's terminal panel (`run_in_terminal`), from the worktree, in PowerShell:

```powershell
$env:KK_SUPABASE_URL = '<supabase url from config.json>'; $env:KK_SUPABASE_ANON_KEY = '<anon key from config.json>'; $env:KKARCDB_API = 'https://kkarcdb.azurewebsites.net'; $env:KK_HUB_URL = 'https://icy-sky-0b0e54f0f.6.azurestaticapps.net'; node tools/local-server/server.js . --port 3000
```

Open it with `preview_start` `{url: "http://localhost:3000"}`.

- [ ] **Step 2: Sign in.** Settings → יועצים shows "התחברות למאגר". Daniel signs in with Microsoft himself; never type credentials. If the register refuses (`not registered`), stop and report the subject it shows.

- [ ] **Step 3: Read.** Confirm on both screens:
- the counts are plausible;
- the search finds a consultant by Hebrew name, by firm and by a discipline in Hebrew;
- clicking a firm's consultant count opens Consultants filtered to it, and the chip's × clears the filter;
- ↗ opens the right person or firm in KK Hub.

- [ ] **Step 4: Who may edit.** If `/api/me` gives Daniel `reader`, the tables have no inputs and the line says why. Report that, and skip Steps 5 and 6. If he is an editor or above, inputs appear.

- [ ] **Step 5: One reversible edit.** Pick an existing consultant who is a contact (no "משתמש במאגר" badge). Change their mobile, wait for the save, reload the page and confirm the new value persisted. Then put the original value back the same way and confirm again. Do **not** use + יועץ חדש or + משרד חדש unless Daniel has said yes in chat, because the register cannot delete.

- [ ] **Step 6: The edge cases from Review Focus.**
- Open the same consultant in KK Hub in another tab and change a field there. Then save a different value in the same field here. The "השדה שונה בינתיים" line must show KK Hub's value, and the cell must end on it. Revert in KK Hub afterwards.
- A row with the "משתמש במאגר" badge offers no inputs.
- A phone number with a hyphen reads in the right order in Hebrew mode.

- [ ] **Step 7: English, and left-to-right.** Switch the page to English and look at both screens:
- no Hebrew labels remain;
- no "Office", "Offices" or "URL" appears;
- discipline names come up in English;
- the layout flips correctly.

Take a screenshot of each screen in each language.

- [ ] **Step 8: The documents.** In `CLAUDE.md`, replace the paragraph that begins `**The register.**` with:

```markdown
**The register.** `register-link.js` is the client for KKarcDB.Api (KKarcDB on Supabase), signed
in with a Supabase token. `register-link-ui.js` renders the facts card, the consultants table and
the link picker inside a project, all read-only, and holds the shared register store.
`register-directory-ui.js` renders Settings → Consultants and Firms, which **write** the
register's consultants and firms (Kind = consultant) through the API's own endpoints. The
register's role decides who may edit there: editor, manager or admin. Its four app settings and
the outside changes it depends on are in `docs/azure.md`.
```

In `docs/azure.md`, find the sentence `Read-only: nothing is written to the register from here.` (`grep -n "nothing is written" docs/azure.md`) and replace it with:

```markdown
Projects are read-only from here; Settings → Consultants and Firms edit the register's consultants and firms, for people whose register role is editor, manager or admin.
```

At the top of `docs/superpowers/specs/2026-10-04-register-link-design.md`, directly under the `# Project Hub reads the register — design` heading, add:

```markdown
> Decisions 1 and 4 are partly reversed for people and firms by `2026-10-07-settings-consultants-firms-design.md`: Settings now edits the register's consultants and firms.
```

- [ ] **Step 9: Everything once more**

Run: `node --test "tests/*.test.js" "tools/spec-creator/test/*.test.js" && node tools/i18n-extract.test.js`
Expected: all PASS.

- [ ] **Step 10: Commit**

```bash
git add CLAUDE.md docs/azure.md docs/superpowers/specs/2026-10-04-register-link-design.md
git commit -m "docs: the hub now edits the register's consultants and firms from Settings" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Stop the terminal server and the preview. Merging the branch and redeploying (`.\Deploy-Azure.ps1 -Name kkarc-hub -CodeOnly`) wait for Daniel's go-ahead.
