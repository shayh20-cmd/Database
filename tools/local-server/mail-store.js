'use strict';
/* One person's mail suggestions: which messages were already seen, what Claude suggested for
   each, and what the person did with it. Pure functions over the document; mail.js reads and
   writes the file. Spec: docs/superpowers/specs/2026-10-20-mail-task-suggestions-design.md

   An item moves pending → new | ignored (Claude answered) or → failed (three failed calls),
   then new | stale → accepted | dismissed (a button in Project Hub). */
const crypto = require('crypto');
const path = require('path');

const SEEN_MAX = 2000;
const BODY_CHARS = 6000;
const EXCERPT_CHARS = 1500;
const MAX_ATTEMPTS = 3;
const PENDING_MAX = 200;
const STALE_DAYS = 14;
const PURGE_DAYS = 30;
const DAY = 24 * 3600 * 1000;

const clip = (s, n) => String(s == null ? '' : s).slice(0, n);

/* Named by a hash of the address, like the personal task lists, so the file name says nothing. */
function mailFileOf(dir, email) {
  const who = String(email || 'local').trim().toLowerCase();
  return path.join(dir, crypto.createHash('sha256').update(who).digest('hex').slice(0, 32) + '.json');
}

// schedule / lastScanAt must survive every rebuild of the document (only present once set)
function norm(doc) {
  const d = {
    seen: Array.isArray(doc && doc.seen) ? doc.seen : [],
    items: Array.isArray(doc && doc.items) ? doc.items : [],
    stats: (doc && doc.stats) || null
  };
  if (doc && doc.schedule) d.schedule = doc.schedule;
  if (doc && doc.lastScanAt) d.lastScanAt = doc.lastScanAt;
  return d;
}

/* When the scanner looks: days 0 = Sunday … 6, times local to the scanning computer. */
const DEFAULT_SCHEDULE = { days: [0, 1, 2, 3, 4], times: ['08:00', '12:00', '16:00'] };
const TIMES_MAX = 12;
const scheduleOf = doc => {
  const saved = doc && doc.schedule;
  const s = saved && Array.isArray(saved.days) && Array.isArray(saved.times) ? saved : DEFAULT_SCHEDULE;
  return { days: s.days.slice(), times: s.times.slice() };
};

/* Anything but { days: ints 0–6, times: 'H:MM' | 'HH:MM' (≤ 12) } is refused, never guessed at. */
function normSchedule(input) {
  const bad = error => ({ ok: false, error });
  if (!input || typeof input !== 'object' || Array.isArray(input)) return bad('schedule must be an object { days, times }');
  if (!Array.isArray(input.days) || !input.days.every(d => Number.isInteger(d) && d >= 0 && d <= 6)) return bad('days must be a list of whole numbers 0–6');
  if (!Array.isArray(input.times)) return bad('times must be a list of HH:MM');
  if (input.times.length > TIMES_MAX) return bad('at most ' + TIMES_MAX + ' times');
  const times = [];
  for (const t of input.times) {
    const m = typeof t === 'string' && t.match(/^(\d{1,2}):(\d{2})$/);
    if (!m || +m[1] > 23 || +m[2] > 59) return bad('bad time: ' + clip(t, 20));
    times.push(m[1].padStart(2, '0') + ':' + m[2]);
  }
  const uniq = a => [...new Set(a)];
  return { ok: true, schedule: { days: uniq(input.days).sort((a, b) => a - b), times: uniq(times).sort() } };
}

function setSchedule(doc, schedule) { doc = norm(doc); doc.schedule = schedule; return doc; }
function markRan(doc, nowIso) { doc = norm(doc); doc.lastScanAt = nowIso; return doc; }

// the office week starts on Sunday
function weekOf(iso) {
  const d = new Date(iso);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}
const emptyWeek = w => ({ weekOf: w, scanned: 0, suggested: 0, accepted: 0 });
function bump(doc, key, n, nowIso) {
  const w = weekOf(nowIso);
  if (!doc.stats || doc.stats.weekOf !== w) doc.stats = emptyWeek(w);
  doc.stats[key] += n;
}

function cleanMail(m) {
  const att = Array.isArray(m.attachments) ? m.attachments : (m.attachments ? [m.attachments] : []);
  return {
    from: clip(m.from, 200), fromName: clip(m.fromName, 200), to: clip(m.to, 1000), cc: clip(m.cc, 1000),
    subject: clip(m.subject, 500), received: clip(m.received, 40),
    body: clip(m.body, BODY_CHARS), attachments: att.slice(0, 20).map(a => clip(a, 200))
  };
}

// a failed item will not be sent to Claude again unless retried: keep only the start, like a triaged one
function fail(it, error) {
  it.status = 'failed';
  it.lastError = clip(error, 300);
  if (it.mail && it.mail.body !== undefined) { it.mail.excerpt = clip(it.mail.body, EXCERPT_CHARS); delete it.mail.body; }
}

/* New messages wait as pending; a message already seen (or still held as an item) is counted as
   a duplicate and dropped. */
function ingest(doc, mails, nowIso) {
  doc = norm(doc);
  const seen = new Set(doc.seen);
  for (const it of doc.items) seen.add(it.id);
  let accepted = 0, duplicates = 0;
  for (const m of mails || []) {
    const id = clip(m && m.id, 300);
    if (!id) continue;
    if (seen.has(id)) { duplicates++; continue; }
    seen.add(id);
    doc.seen.push(id);
    doc.items.push({ id, mail: cleanMail(m), status: 'pending', attempts: 0, createdAt: nowIso });
    accepted++;
  }
  // a bounded queue: past 200 waiting, the oldest give up (the person can still retry them)
  const pending = doc.items.filter(i => i.status === 'pending');
  for (const it of pending.slice(0, Math.max(0, pending.length - PENDING_MAX))) fail(it, 'queue full');
  if (doc.seen.length > SEEN_MAX) {
    // keep every id that still has an item, then the newest of the rest
    const live = new Set(doc.items.map(i => i.id));
    let room = SEEN_MAX - doc.seen.filter(x => live.has(x)).length;
    const keep = [];
    for (let i = doc.seen.length - 1; i >= 0; i--) if (live.has(doc.seen[i]) || room-- > 0) keep.push(doc.seen[i]);
    doc.seen = keep.reverse();
  }
  if (accepted) bump(doc, 'scanned', accepted, nowIso);
  return { doc, accepted, duplicates };
}

const pendingIds = doc => norm(doc).items.filter(i => i.status === 'pending').map(i => i.id);

/* Claude's answer for one message. The body is no longer needed: keep the start for "show the email". */
function applySuggestion(doc, id, s, nowIso) {
  doc = norm(doc);
  const it = doc.items.find(i => i.id === id);
  if (!it || it.status !== 'pending') return doc;
  it.mail.excerpt = clip(it.mail.body, EXCERPT_CHARS);
  delete it.mail.body;
  it.suggestion = s;
  it.status = s.kind === 'ignore' ? 'ignored' : 'new';
  it.triagedAt = nowIso;
  if (it.status === 'new') bump(doc, 'suggested', 1, nowIso);
  return doc;
}

function failAttempt(doc, id, error) {
  doc = norm(doc);
  const it = doc.items.find(i => i.id === id);
  if (!it || it.status !== 'pending') return doc;
  it.attempts = (it.attempts || 0) + 1;
  it.lastError = clip(error, 300);
  if (it.attempts >= MAX_ATTEMPTS) fail(it, error);
  return doc;
}

const OPEN = ['new', 'stale', 'failed'];
function canAct(it, action) {
  if (!it) return false;
  if (action === 'retry') return it.status === 'failed';
  if (action === 'accept') return it.status === 'new' || it.status === 'stale';
  if (action === 'dismiss') return OPEN.includes(it.status);
  return false;
}

/* A button in Project Hub: accept | dismiss (with a reason) | retry (a failed one). */
function act(doc, id, action, reason, nowIso) {
  doc = norm(doc);
  const it = doc.items.find(i => i.id === id);
  if (!canAct(it, action)) return { doc, ok: false };
  if (action === 'retry') {
    it.status = 'pending';
    it.attempts = 0;
    delete it.lastError;
    return { doc, ok: true };
  }
  it.status = action === 'accept' ? 'accepted' : 'dismissed';
  it.handledAt = nowIso;
  if (action === 'dismiss' && reason) it.dismissReason = clip(reason, 40);
  if (action === 'accept') bump(doc, 'accepted', 1, nowIso);
  return { doc, ok: true };
}

/* Upkeep on every read: an unhandled suggestion goes stale after 14 days; one that was handled,
   ignored or went stale is removed 30 days later, and so is one that never got an answer
   (pending / failed) 30 days after it arrived. Its id stays in `seen`, so it never returns. */
function housekeep(doc, nowMs) {
  doc = norm(doc);
  const staleBefore = nowMs - STALE_DAYS * DAY;
  const purgeBefore = nowMs - PURGE_DAYS * DAY;
  doc.items = doc.items.filter(it => {
    if (it.status === 'new' && Date.parse(it.triagedAt || it.createdAt) < staleBefore) {
      it.status = 'stale';
      it.staleAt = new Date(nowMs).toISOString();
    }
    const doneAt = it.handledAt
      || (it.status === 'stale' ? it.staleAt || it.triagedAt : null) // older data has no staleAt
      || (it.status === 'ignored' ? it.triagedAt : null)
      || (it.status === 'pending' || it.status === 'failed' ? it.createdAt : null);
    return !(doneAt && Date.parse(doneAt) < purgeBefore);
  });
  return doc;
}

/* What a task made from this message says about where it came from. Stored data: Hebrew. */
function noteOf(it) {
  const m = (it && it.mail) || {};
  const from = m.fromName && m.from ? `${m.fromName} <${m.from}>` : (m.fromName || m.from || '');
  const day = /^\d{4}-\d{2}-\d{2}/.test(m.received || '') ? m.received.slice(0, 10).split('-').reverse().join('.') : '';
  return ['מהמייל: ' + from, m.subject ? 'נושא: ' + m.subject : '', day ? 'התקבל: ' + day : ''].filter(Boolean).join('\n');
}

function summary(doc, nowIso) {
  doc = norm(doc);
  const count = s => doc.items.filter(i => i.status === s).length;
  const w = weekOf(nowIso);
  return { new: count('new'), pending: count('pending'), failed: count('failed'), week: doc.stats && doc.stats.weekOf === w ? doc.stats : emptyWeek(w) };
}

/* The newest open suggestions, for the Windows notification the scanner shows. */
function topNew(doc, n) {
  return norm(doc).items.filter(i => i.status === 'new' && i.suggestion)
    .sort((a, b) => String(b.triagedAt || '').localeCompare(String(a.triagedAt || '')))
    .slice(0, n).map(i => ({ kind: i.suggestion.kind, title: i.suggestion.title || (i.mail && i.mail.subject) || '' }));
}

/* The page's view: no ignored items, no raw bodies; each item carries its task note. */
function forPage(doc, nowIso) {
  doc = norm(doc);
  const items = doc.items.filter(i => i.status !== 'ignored').map(i => {
    const { body, ...mail } = i.mail || {};
    return { ...i, mail, note: noteOf(i) };
  });
  return { items, summary: summary(doc, nowIso), scan: { schedule: scheduleOf(doc), lastScanAt: doc.lastScanAt || null } };
}

module.exports = { mailFileOf, ingest, pendingIds, applySuggestion, failAttempt, canAct, act, housekeep, noteOf, summary, topNew, forPage, weekOf, DEFAULT_SCHEDULE, scheduleOf, normSchedule, setSchedule, markRan };
