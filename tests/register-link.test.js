'use strict';
// Run: node --test tests/register-link.test.js — tests the real register-link.js, no mirror.
const test = require('node:test');
const assert = require('node:assert');
const RL = require('../register-link.js');

test('the discipline map covers all seventeen hub codes, FIRE and TNDR included', () => {
  assert.deepStrictEqual(Object.keys(RL.REGISTER_DISCIPLINE).sort(), [
    'ACSS', 'AGRO', 'ARCH', 'ELEC', 'ENVI', 'FIRE', 'GR', 'HVAC', 'HYDR', 'LAND', 'LIFT', 'PLUM', 'PM', 'SAFE', 'STRC', 'TNDR', 'TRAF',
  ]);
  assert.strictEqual(RL.REGISTER_DISCIPLINE.SAFE, 'safety');
  assert.strictEqual(RL.REGISTER_DISCIPLINE.FIRE, 'fire');
  assert.strictEqual(RL.REGISTER_DISCIPLINE.TNDR, 'tender');
});

test('hubDisciplineFor maps only to a discipline the project still lists', () => {
  const list = [{ id: 'ARCH' }, { id: 'FIRE' }, { id: 'TNDR' }];
  assert.strictEqual(RL.hubDisciplineFor('fire', list), 'FIRE');
  assert.strictEqual(RL.hubDisciplineFor('tender', list), 'TNDR');
  assert.strictEqual(RL.hubDisciplineFor('structural', list), null, 'STRC not in this project\'s list');
  assert.strictEqual(RL.hubDisciplineFor('cyber', list), null, 'no hub counterpart');
});

test('matchProjects: by initials or code, ignoring case and spaces', () => {
  const ps = [
    { id: 'a', code: '2017-03', initials: 'BEER' },
    { id: 'b', code: '2019-11', initials: 'HRZL' },
    { id: 'c', code: '2020-02', initials: 'hrzl' },
    { id: 'd', code: '2021-07', initials: null },
  ];
  assert.deepStrictEqual(RL.matchProjects(' beer ', ps).map(p => p.id), ['a']);
  assert.deepStrictEqual(RL.matchProjects('2021-07', ps).map(p => p.id), ['d']);
  assert.deepStrictEqual(RL.matchProjects('HRZL', ps).map(p => p.id), ['b', 'c'], 'several: caller must not link');
  assert.deepStrictEqual(RL.matchProjects('NONE', ps), []);
  assert.deepStrictEqual(RL.matchProjects('', ps), [], 'a blank code matches nothing');
  assert.deepStrictEqual(RL.matchProjects(null, ps), []);
});

const tags = [
  { typeCode: 'discipline', code: 'structural', nameEn: 'Structural', nameHe: 'קונסטרוקציה', sortOrder: 20 },
  { typeCode: 'discipline', code: 'electrical', nameEn: 'Electrical', nameHe: 'חשמל', sortOrder: 30 },
  { typeCode: 'discipline', code: 'fire', nameEn: 'Fire safety', nameHe: 'כבאות', sortOrder: 80 },
  { typeCode: 'discipline', code: 'cyber', nameEn: 'Cyber security', nameHe: 'סייבר', sortOrder: 330 },
  { typeCode: 'kind', code: 'consultant', nameEn: 'Consultant', nameHe: 'יועץ', sortOrder: 10 },
];
const firms = [
  { id: 'f1', name: 'Struct Ltd', nameHe: 'קונס בע״מ', tags: { discipline: ['structural', 'electrical'], kind: ['consultant'] } },
  { id: 'f2', name: 'Cyber Co', nameHe: null, tags: { discipline: ['cyber'] } },
  { id: 'f3', name: 'Client Inc', nameHe: 'הלקוח', tags: { kind: ['client'] } },
];
const persons = [
  { id: 'p1', name: 'Avi', nameHe: 'אבי', firmId: 'f1', mobile: '050', phone: '03', email: 'avi@x', tags: {} },
  { id: 'p2', name: 'Beni', nameHe: null, firmId: 'f1', mobile: null, phone: null, email: 'b@x', tags: {} },
  { id: 'p3', name: 'Cyb', firmId: 'f2', tags: {} },
  { id: 'p4', name: 'Free', firmId: null, mobile: '052', tags: { discipline: ['fire'] } },
  { id: 'p5', name: 'Cli', firmId: 'f3', tags: {} },
  { id: 'p6', name: 'Staff', firmId: null, tags: { internal: ['yes'] } },
];
const members = [
  { personId: 'p1', name: 'Avi', firmName: 'Struct Ltd', isStaff: false },
  { personId: 'p2', name: 'Beni', firmName: 'Struct Ltd', isStaff: false },
  { personId: 'p3', name: 'Cyb', firmName: 'Cyber Co', isStaff: false },
  { personId: 'p4', name: 'Free', firmName: null, isStaff: false },
  { personId: 'p5', name: 'Cli', firmName: 'Client Inc', isStaff: false },
  { personId: 'p6', name: 'Staff', firmName: null, isStaff: true },
  { personId: 'p7', name: 'Ghost', firmName: 'משרד ישן', isStaff: false },
];
const hubDiscs = [{ id: 'ARCH' }, { id: 'STRC' }, { id: 'ELEC' }, { id: 'FIRE' }];

test('buildConsultantRows: one row per firm and discipline, in the hub\'s order', () => {
  const rows = RL.buildConsultantRows(members, persons, firms, tags, hubDiscs);
  assert.deepStrictEqual(rows.map(r => r.id), ['f:f1|structural', 'f:f1|electrical', 'p:p4|fire', 'f:f2|cyber', 'f:f3|-', 'p:p7|-']);

  const [strc, elec, fire, cyber, client, ghost] = rows;
  assert.deepStrictEqual(strc, {
    id: 'f:f1|structural', discCode: 'STRC', discipline: 'קונסטרוקציה', firm: 'קונס בע״מ', firmId: 'f1', registerDiscipline: 'structural',
    contacts: [
      { personId: 'p1', name: 'אבי', mobile: '050', phone: '03', email: 'avi@x' },
      { personId: 'p2', name: 'Beni', mobile: '', phone: '', email: 'b@x' },
    ],
  });
  assert.strictEqual(elec.discCode, 'ELEC');
  assert.deepStrictEqual(elec.contacts.map(c => c.personId), ['p1', 'p2'], 'a two-discipline firm lists its people in both rows');
  assert.deepStrictEqual([fire.discCode, fire.firm, fire.firmId], ['FIRE', '', null], 'no firm: the person\'s own discipline');
  assert.deepStrictEqual([cyber.discCode, cyber.discipline, cyber.firm], [null, 'סייבר', 'Cyber Co'], 'unmapped: shown, no tender link');
  assert.deepStrictEqual([client.discCode, client.discipline, client.firm], [null, RL.NO_DISCIPLINE, 'הלקוח']);
  assert.deepStrictEqual([ghost.firm, ghost.contacts[0]], ['משרד ישן', { personId: 'p7', name: 'Ghost', mobile: '', phone: '', email: '' }],
    'a member missing from /api/persons still appears');
  assert.ok(!rows.some(r => r.contacts.some(c => c.personId === 'p6')), 'staff never appear');
});

test('buildConsultantRows: a discipline the project removed from its list is still listed, unlinked', () => {
  const rows = RL.buildConsultantRows(members.slice(0, 1), persons, firms, tags, [{ id: 'ELEC' }]);
  const strc = rows.find(r => r.registerDiscipline === 'structural');
  assert.strictEqual(strc.discCode, null);
  assert.strictEqual(strc.discipline, 'קונסטרוקציה');
  assert.deepStrictEqual(rows.map(r => r.id), ['f:f1|electrical', 'f:f1|structural'], 'mapped first, then unmapped by register order');
});

test('buildConsultantRows: a person\'s own discipline when their firm has none', () => {
  const ps = [{ id: 'p9', name: 'Fire guy', firmId: 'f3', tags: { discipline: ['fire'] } }];
  const rows = RL.buildConsultantRows([{ personId: 'p9', name: 'Fire guy', firmName: 'Client Inc', isStaff: false }], ps, firms, tags, hubDiscs);
  assert.deepStrictEqual(rows.map(r => [r.id, r.discCode, r.firm]), [['f:f3|fire', 'FIRE', 'הלקוח']]);
});

test('buildConsultantRows: nothing in, nothing out', () => {
  assert.deepStrictEqual(RL.buildConsultantRows([], [], [], [], hubDiscs), []);
  assert.deepStrictEqual(RL.buildConsultantRows(undefined, undefined, undefined, undefined, undefined), []);
});

test('projectFacts: the register\'s details, costs only when the API sent them', () => {
  const p = {
    code: '2017-03', initials: 'BEER', name: 'Beer Sheva Library', nameHe: 'ספריית באר שבע', status: 'active',
    clientName: 'עיריית באר שבע', address: 'רגר 1', areaM2: 1234, endYear: 2027, permitDate: '2025-03-15', tofes4Date: null, costs: null,
  };
  assert.deepStrictEqual(RL.projectFacts(p), [
    { label: 'קוד', value: '2017-03 · BEER', data: true },
    { label: 'שם בעברית', value: 'ספריית באר שבע', data: true },
    { label: 'שם באנגלית', value: 'Beer Sheva Library', data: true },
    { label: 'סטטוס', value: 'פעיל', data: false },
    { label: 'לקוח', value: 'עיריית באר שבע', data: true },
    { label: 'כתובת הפרויקט', value: 'רגר 1', data: true },
    { label: 'שטח', value: '1,234 מ״ר', data: false },
    { label: 'שנת סיום', value: '2027', data: true },
    { label: 'היתר', value: '15.03.2025', data: true },
    { label: 'טופס 4', value: '—', data: true },
  ]);
  const withCosts = RL.projectFacts({ ...p, costs: { predicted: 1000000, evaluated: null, contractor: 2500, real: 0 } });
  assert.deepStrictEqual(withCosts.slice(10), [
    { label: 'עלות צפויה', value: '1,000,000 ₪', data: true },
    { label: 'עלות מוערכת', value: '—', data: true },
    { label: 'עלות קבלן', value: '2,500 ₪', data: true },
    { label: 'עלות בפועל', value: '0 ₪', data: true },
  ]);
  const bare = RL.projectFacts({ code: '2020-01', status: 'odd' });
  assert.strictEqual(bare.find(f => f.label === 'סטטוס').value, 'odd', 'an unknown status shows as sent');
  assert.strictEqual(bare.find(f => f.label === 'שטח').value, '—');
});

const jwt = payload => 'h.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.s';

test('subjectOf reads the token\'s sub, and nothing else', () => {
  assert.strictEqual(RL.subjectOf(jwt({ sub: 'a1b2-c3', name: 'דנה' })), 'a1b2-c3');
  assert.strictEqual(RL.subjectOf(jwt({ name: 'no sub' })), null);
  assert.strictEqual(RL.subjectOf('not-a-token'), null);
  assert.strictEqual(RL.subjectOf(null), null);
});

test('tidyReturnAddress: puts back the saved address and drops the one-time code', () => {
  const base = 'https://kkarc-hub.azurewebsites.net/project_hub_01';
  assert.strictEqual(RL.tidyReturnAddress(base + '?code=abc', '?tab=contacts'), '/project_hub_01?tab=contacts');
  assert.strictEqual(RL.tidyReturnAddress(base + '?code=abc', ''), '/project_hub_01');
  assert.strictEqual(RL.tidyReturnAddress(base + '?x=1&code=abc', null), '/project_hub_01?x=1', 'nothing saved: just drop the code');
  assert.strictEqual(RL.tidyReturnAddress(base + '?error=access_denied&error_description=No', null), '/project_hub_01');
  assert.strictEqual(RL.tidyReturnAddress(base + '?x=1', '?y=2'), null, 'no sign-in return: leave the address alone');
});

// ── createRegisterClient, with stand-ins for supabase-js and fetch ──
function fakeSupabase({ token = jwt({ sub: 'first' }), refreshed = jwt({ sub: 'second' }) } = {}) {
  return () => ({
    auth: {
      getSession: async () => ({ data: { session: token ? { access_token: token } : null } }),
      refreshSession: async () => ({ data: { session: refreshed ? { access_token: refreshed } : null } }),
      signInWithOAuth: async () => ({ error: null }),
      signOut: async () => ({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  });
}
function fakeFetch(answers, seen) {
  return async (url, init) => {
    seen.push({ url, auth: init.headers.Authorization });
    const a = answers.shift();
    if (a === 'throw') throw new TypeError('Failed to fetch');
    return { status: a, ok: a >= 200 && a < 300, json: async () => ({ answered: a }) };
  };
}
const config = { supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon', api: 'https://api.example/' };

test('client: a GET carries the token to the API', async () => {
  const seen = [];
  const c = RL.createRegisterClient(config, fakeSupabase(), fakeFetch([200], seen));
  assert.deepStrictEqual(await c.get('/api/projects/p1'), { state: 'ok', data: { answered: 200 } });
  assert.deepStrictEqual(seen, [{ url: 'https://api.example/api/projects/p1', auth: 'Bearer ' + jwt({ sub: 'first' }) }]);
});

test('client: an expired token is refreshed once and the request retried', async () => {
  const seen = [];
  const c = RL.createRegisterClient(config, fakeSupabase(), fakeFetch([401, 200], seen));
  assert.strictEqual((await c.get('/api/firms')).state, 'ok');
  assert.deepStrictEqual(seen.map(s => s.auth), ['Bearer ' + jwt({ sub: 'first' }), 'Bearer ' + jwt({ sub: 'second' })]);
});

test('client: refused twice is "refused", with the subject of the token it last tried', async () => {
  const c = RL.createRegisterClient(config, fakeSupabase(), fakeFetch([401, 401], []));
  assert.deepStrictEqual(await c.get('/api/firms'), { state: 'refused', subject: 'second' });
  const d = RL.createRegisterClient(config, fakeSupabase(), fakeFetch([403], []));
  assert.deepStrictEqual(await d.get('/api/firms'), { state: 'refused', subject: 'first' });
});

test('client: a refresh that yields no session is "signed-out"', async () => {
  const c = RL.createRegisterClient(config, fakeSupabase({ refreshed: null }), fakeFetch([401], []));
  assert.deepStrictEqual(await c.get('/api/firms'), { state: 'signed-out' });
});

test('client: nobody signed in — no request at all', async () => {
  const seen = [];
  const c = RL.createRegisterClient(config, fakeSupabase({ token: null }), fakeFetch([200], seen));
  assert.deepStrictEqual(await c.get('/api/firms'), { state: 'signed-out' });
  assert.strictEqual(seen.length, 0);
  assert.strictEqual(await c.token(), null);
});

test('client: 404 is not-found; 5xx and a network failure are unreachable', async () => {
  for (const [answer, state] of [[404, 'not-found'], [500, 'unreachable'], [503, 'unreachable'], ['throw', 'unreachable']]) {
    const c = RL.createRegisterClient(config, fakeSupabase(), fakeFetch([answer], []));
    assert.deepStrictEqual(await c.get('/api/projects/x'), { state }, String(answer));
  }
});

// ── the sign-in round trip, in the order it really happens: supabase-js strips ?code= itself ──
function withBrowser({ href, saved }, run) {
  const calls = [];
  const store = new Map(saved === undefined ? [] : [['register-return', saved]]);
  const g = globalThis;
  const keep = ['location', 'history', 'sessionStorage'].map(k => [k, Object.getOwnPropertyDescriptor(g, k)]);
  Object.defineProperty(g, 'location', { value: { href, search: new URL(href).search, origin: new URL(href).origin, pathname: new URL(href).pathname }, configurable: true, writable: true });
  Object.defineProperty(g, 'history', { value: { state: null, replaceState: (s, t, u) => calls.push(u) }, configurable: true, writable: true });
  Object.defineProperty(g, 'sessionStorage', { value: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) }, configurable: true, writable: true });
  return Promise.resolve(run({ calls, store })).finally(() => {
    for (const [k, d] of keep) { if (d) Object.defineProperty(g, k, d); else delete g[k]; }
  });
}
// supabase-js exchanges the code during getSession and removes it from the address first.
function strippingSupabase() {
  return () => ({
    auth: {
      getSession: async () => { location.href = location.href.replace(/[?&]code=[^&#]*/, ''); return { data: { session: { access_token: jwt({ sub: 's' }) } } }; },
      refreshSession: async () => ({ data: { session: null } }),
      signInWithOAuth: async () => ({ error: null }), signOut: async () => ({}), onAuthStateChange: () => {},
    },
  });
}

test('sign-in return: the saved address comes back even though supabase-js stripped the code first', () =>
  withBrowser({ href: 'https://hub.example/project_hub_01?code=abc', saved: '?tab=contacts' }, async ({ calls, store }) => {
    await RL.createRegisterClient(config, strippingSupabase(), fakeFetch([], [])).ready;
    assert.deepStrictEqual(calls, ['/project_hub_01?tab=contacts']);
    assert.strictEqual(store.has('register-return'), false, 'the saved address is used once');
  }));

test('sign-in return: a page load that is not a return clears a stale saved address and leaves the URL alone', () =>
  withBrowser({ href: 'https://hub.example/project_hub_01', saved: '?old=1' }, async ({ calls, store }) => {
    await RL.createRegisterClient(config, strippingSupabase(), fakeFetch([], [])).ready;
    assert.deepStrictEqual(calls, []);
    assert.strictEqual(store.has('register-return'), false);
  }));

test('nextEntry: a failed refetch keeps the data it already had, and stays due for another try', () => {
  const good = { state: 'ok', data: { members: [1] }, at: 100 };
  const kept = RL.nextEntry(good, { state: 'unreachable' }, 500);
  assert.deepStrictEqual(kept, { state: 'ok', data: { members: [1] }, at: 100, lastError: 'unreachable' });
  assert.deepStrictEqual(RL.nextEntry(good, { state: 'refused', subject: 's' }, 500).data, { members: [1] });
});

test('nextEntry: a first answer is stored as it came; a good answer replaces anything', () => {
  assert.deepStrictEqual(RL.nextEntry(null, { state: 'refused', subject: 's' }, 7), { state: 'refused', subject: 's', at: 7 });
  assert.deepStrictEqual(RL.nextEntry(undefined, { state: 'ok', data: 'x' }, 7), { state: 'ok', data: 'x', at: 7 });
  assert.deepStrictEqual(RL.nextEntry({ state: 'unreachable', at: 1 }, { state: 'ok', data: 'y' }, 9), { state: 'ok', data: 'y', at: 9 });
  assert.deepStrictEqual(RL.nextEntry({ state: 'ok', data: 'x', at: 1, lastError: 'unreachable' }, { state: 'ok', data: 'y' }, 9), { state: 'ok', data: 'y', at: 9 });
});

test('hasConsultants: a project with any non-staff member has consultants to show', () => {
  assert.strictEqual(RL.hasConsultants({ members: [{ isStaff: true }, { isStaff: false }] }), true);
  assert.strictEqual(RL.hasConsultants({ members: [{ isStaff: true }] }), false);
  assert.strictEqual(RL.hasConsultants({ members: [] }), false);
  assert.strictEqual(RL.hasConsultants({}), false);
});

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
    assert.ok(e && /[֐-׿]/.test(e.text) && e.detail === null, state);
  }
});
