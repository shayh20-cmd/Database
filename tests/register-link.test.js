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
    { label: 'כתובת', value: 'רגר 1', data: true },
    { label: 'שטח', value: '1,234 מ״ר', data: true },
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
