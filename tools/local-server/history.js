'use strict';
/* What a project save leaves behind, so nothing is lost for good:
   - the archive: every task (or subtask) a save removes is kept, with where it was, who
     saved and when, until it is restored (it shows up in a save again) or purged by hand.
   - backups: a copy of the document as it was before the save — at most one every
     BACKUP_EVERY_MS, and always before a save that removes MASS_DELETE tasks or more.
   - a log of those large removals.
   Everything sits under DATA_DIR, outside the deployed folder. */
const fs = require('fs');
const path = require('path');

const BACKUP_EVERY_MS = 30 * 60 * 1000;
const BACKUPS_KEPT = 60;
const MASS_DELETE = 5;

function createHistory({ DATA_DIR, readJson, writeJsonAtomic }) {
  const ARCHIVE_DIR = path.join(DATA_DIR, 'archive');
  const BACKUP_DIR = path.join(DATA_DIR, 'backups');
  const safeId = id => /^[a-z0-9]{4,24}$/.test(String(id || ''));
  const archiveFile = projId => path.join(ARCHIVE_DIR, projId + '.json');

  /* every task and subtask in a document, with where it sits */
  function tasksOf(doc) {
    const out = new Map();
    const tracks = (doc && doc.tracks) || [];
    ((doc && doc.sheets) || []).forEach(s => {
      if (!s || !Array.isArray(s.tasks)) return;
      const tr = tracks.find(t => s.track != null ? t.trackValue === s.track : t.id === 'ongoing');
      const group = id => ((s.groups || []).find(g => g.id === id) || {}).name || '';
      s.tasks.forEach(t => {
        if (!t || !t.id) return;
        const where = { sheetId: s.id, stage: s.name || '', track: tr ? tr.label : '', groupId: t.groupId || null, group: group(t.groupId) };
        out.set(t.id, { task: t, ...where, parentId: null, parentTitle: '' });
        (t.subtasks || []).forEach(x => {
          if (x && x.id) out.set(x.id, { task: x, ...where, parentId: t.id, parentTitle: t.title || '' });
        });
      });
    });
    return out;
  }

  const blank = t => !String(t.title || '').trim() && !(t.subtasks || []).length;

  function readArchive(projId) {
    const a = readJson(archiveFile(projId));
    return Array.isArray(a.items) ? a.items : [];
  }
  function writeArchive(projId, items) {
    writeJsonAtomic(archiveFile(projId), { items });
  }

  function listBackups(projId) {
    const dir = path.join(BACKUP_DIR, projId);
    let names = [];
    try { names = fs.readdirSync(dir).filter(n => n.endsWith('.json')).sort(); } catch (e) { return []; }
    return names.map(name => {
      let size = 0;
      try { size = fs.statSync(path.join(dir, name)).size; } catch (e) {}
      return { name, size };
    });
  }
  function backup(projId, filePath, reason) {
    const dir = path.join(BACKUP_DIR, projId);
    fs.mkdirSync(dir, { recursive: true });
    const name = new Date().toISOString().replace(/[:.]/g, '-') + (reason ? '-' + reason : '') + '.json';
    fs.copyFileSync(filePath, path.join(dir, name));
    const all = listBackups(projId);
    all.slice(0, Math.max(0, all.length - BACKUPS_KEPT)).forEach(b => { try { fs.unlinkSync(path.join(dir, b.name)); } catch (e) {} });
  }
  function lastBackupAt(projId) {
    const dir = path.join(BACKUP_DIR, projId);
    let latest = 0;
    listBackups(projId).forEach(b => {
      try { latest = Math.max(latest, fs.statSync(path.join(dir, b.name)).mtimeMs); } catch (e) {}
    });
    return latest;
  }

  /* Called with the document on disk and the one about to replace it, before the write. */
  function beforeSave(projId, filePath, oldDoc, newDoc, who) {
    if (!safeId(projId) || !oldDoc || !Array.isArray(oldDoc.sheets) || !newDoc || !Array.isArray(newDoc.sheets)) return;
    const before = tasksOf(oldDoc);
    const after = tasksOf(newDoc);
    const now = new Date().toISOString();
    const gone = [...before.entries()].filter(([id, e]) => !after.has(id) && !blank(e.task) && !(e.parentId && !after.has(e.parentId) && before.has(e.parentId)));
    let items = readArchive(projId);
    const had = items.length;
    /* a task that is back (restored, or re-added by a merge) leaves the archive */
    items = items.filter(r => !after.has(r.id));
    gone.forEach(([id, e]) => {
      items = items.filter(r => r.id !== id);
      items.push({ id, task: e.task, parentId: e.parentId, parentTitle: e.parentTitle, sheetId: e.sheetId, stage: e.stage, track: e.track, groupId: e.groupId, group: e.group, deletedAt: now, deletedBy: who || '' });
    });
    if (gone.length || items.length !== had) writeArchive(projId, items);
    const mass = gone.length >= MASS_DELETE;
    if (mass || Date.now() - lastBackupAt(projId) > BACKUP_EVERY_MS) {
      try { backup(projId, filePath, mass ? 'before-mass-delete' : ''); } catch (e) {}
    }
    if (mass) {
      const line = JSON.stringify({ at: now, by: who || '', count: gone.length, tasks: gone.map(([id, e]) => [id, e.task.title || '', e.stage]) });
      try {
        fs.mkdirSync(path.join(BACKUP_DIR, projId), { recursive: true });
        fs.appendFileSync(path.join(BACKUP_DIR, projId, 'mass-deletions.log'), line + '\n');
      } catch (e) {}
    }
  }

  function purge(projId, ids) {
    if (!safeId(projId)) return 0;
    const items = readArchive(projId);
    const keep = items.filter(r => !ids.includes(r.id));
    writeArchive(projId, keep);
    return items.length - keep.length;
  }

  return { tasksOf, beforeSave, readArchive, purge, listBackups, safeId, BACKUP_DIR };
}

module.exports = { createHistory, BACKUP_EVERY_MS, BACKUPS_KEPT, MASS_DELETE };
