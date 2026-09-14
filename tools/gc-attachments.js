'use strict';
/*
 * Deletes attachment files nothing points at any more.
 *
 * Annotating an image writes a new file and leaves the previous one behind, so the
 * store grows with every mark. Nothing else cleans it up.
 *
 * Usage:
 *   node tools/gc-attachments.js                 report only, changes nothing
 *   node tools/gc-attachments.js --delete        actually remove them
 *   node tools/gc-attachments.js --min-age-hours 2
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const ATTACH_DIR = path.join(DATA_DIR, 'attachments');

/* The capture window uploads an image before the record that references it is saved,
   so a file younger than the grace period may be about to be referenced. Never touch
   those — a wrongly deleted screenshot cannot be recovered. */
const DEFAULT_MIN_AGE_HOURS = 24;

function parseArgs(argv) {
  const out = { del: false, minAgeHours: DEFAULT_MIN_AGE_HOURS };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--delete') out.del = true;
    else if (argv[i] === '--min-age-hours') out.minAgeHours = Number(argv[++i]);
  }
  return out;
}

/* Any string anywhere in the document may hold a path — a task description holds them
   inside HTML, a mail holds one in a field. Scanning the whole document is the only
   way to be sure nothing is missed. */
function collectRefs(value, into) {
  if (!value) return into;
  if (typeof value === 'string') {
    const m = value.match(/\/data\/attachments\/[A-Za-z0-9._\-/]+/g);
    if (m) m.forEach(x => into.add(x));
    return into;
  }
  if (typeof value !== 'object') return into;
  if (Array.isArray(value)) { value.forEach(v => collectRefs(v, into)); return into; }
  for (const k of Object.keys(value)) collectRefs(value[k], into);
  return into;
}

function refsFromDataDir(dataDir) {
  const refs = new Set();
  let names = [];
  try { names = fs.readdirSync(dataDir).filter(n => n.endsWith('.json')); } catch (e) { return refs; }
  for (const n of names) {
    try { collectRefs(JSON.parse(fs.readFileSync(path.join(dataDir, n), 'utf8')), refs); }
    catch (e) { /* a file we cannot parse tells us nothing; leaving it out would be
                   guessing that its attachments are unused, so fail loudly instead */
      throw new Error('Cannot parse ' + n + ' — refusing to delete anything: ' + e.message);
    }
  }
  return refs;
}

function listFiles(attachDir) {
  const out = [];
  let apps = [];
  try { apps = fs.readdirSync(attachDir); } catch (e) { return out; }
  for (const app of apps) {
    const dir = path.join(attachDir, app);
    let st;
    try { st = fs.statSync(dir); } catch (e) { continue; }
    if (!st.isDirectory()) continue;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      let fst;
      try { fst = fs.statSync(full); } catch (e) { continue; }
      if (!fst.isFile()) continue;
      out.push({ ref: '/data/attachments/' + app + '/' + name, full, bytes: fst.size, mtimeMs: fst.mtimeMs });
    }
  }
  return out;
}

/* Pure, so the rules can be tested without touching a disk. */
function selectOrphans(files, refs, nowMs, minAgeMs) {
  return files.filter(f => !refs.has(f.ref) && (nowMs - f.mtimeMs) >= minAgeMs);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const minAgeMs = args.minAgeHours * 3600 * 1000;
  let refs;
  try { refs = refsFromDataDir(DATA_DIR); }
  catch (e) { console.error(e.message); process.exitCode = 1; return; }
  const files = listFiles(ATTACH_DIR);
  const orphans = selectOrphans(files, refs, Date.now(), minAgeMs);
  const young = files.filter(f => !refs.has(f.ref) && (Date.now() - f.mtimeMs) < minAgeMs);
  const kb = n => Math.round(n / 1024) + 'KB';

  console.log('files on disk : ' + files.length + ' (' + kb(files.reduce((a, f) => a + f.bytes, 0)) + ')');
  console.log('referenced    : ' + files.filter(f => refs.has(f.ref)).length);
  console.log('unreferenced  : ' + orphans.length + ' (' + kb(orphans.reduce((a, f) => a + f.bytes, 0)) + ')');
  if (young.length) console.log('too new to touch: ' + young.length + ' (under ' + args.minAgeHours + 'h)');

  if (!orphans.length) { console.log('nothing to do'); return; }
  for (const f of orphans) console.log('  ' + (args.del ? 'deleting ' : 'would delete ') + f.ref + ' (' + kb(f.bytes) + ')');
  if (!args.del) { console.log('\nreport only — pass --delete to remove them'); return; }
  let freed = 0;
  for (const f of orphans) { try { fs.unlinkSync(f.full); freed += f.bytes; } catch (e) { console.error('  failed: ' + f.ref + ' ' + e.message); } }
  console.log('freed ' + kb(freed));
}

if (require.main === module) main();
module.exports = { collectRefs, selectOrphans, refsFromDataDir, listFiles, parseArgs };
