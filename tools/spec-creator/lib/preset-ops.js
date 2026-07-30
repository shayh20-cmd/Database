'use strict';
(function () {
  function genId() { return Math.random().toString(36).slice(2, 12); }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function exSet(preset) { return new Set((preset && preset.excludedClauseIds) || []); }

  function selFor(preset, chapterNum) {
    return ((preset && preset.selections) || []).find(function (s) { return s.chapterNum === chapterNum; }) || null;
  }
  function subIncluded(preset, chapterNum, subId) {
    var s = selFor(preset, chapterNum);
    return !!(s && s.subChapterIds.indexOf(subId) !== -1);
  }
  function subtreeIds(clause) {
    var ids = [clause.id];
    (clause.children || []).forEach(function (c) { ids = ids.concat(subtreeIds(c)); });
    return ids;
  }

  // Local tri-state for a clause (self + descendants), ignoring ancestor context.
  function resolveClauseState(preset, clause) {
    var ex = exSet(preset);
    if (ex.has(clause.id)) return 'off';
    var kids = clause.children || [];
    if (!kids.length) return 'on';
    var states = kids.map(function (k) { return resolveClauseState(preset, k); });
    if (states.every(function (s) { return s === 'on'; })) return 'on';
    if (states.every(function (s) { return s === 'off'; })) return 'off';
    return 'partial';
  }
  function resolveSubChapterState(preset, chapterNum, subChapter) {
    if (!subIncluded(preset, chapterNum, subChapter.id)) return 'off';
    var clauses = subChapter.clauses || [];
    if (!clauses.length) return 'on';
    var states = clauses.map(function (c) { return resolveClauseState(preset, c); });
    if (states.every(function (s) { return s === 'on'; })) return 'on';
    if (states.every(function (s) { return s === 'off'; })) return 'off';
    return 'partial';
  }
  function resolveChapterState(preset, chapter) {
    var subs = chapter.subChapters || [];
    if (!subs.length) return 'off';
    var states = subs.map(function (s) { return resolveSubChapterState(preset, chapter.num, s); });
    if (states.every(function (s) { return s === 'on'; })) return 'on';
    if (states.every(function (s) { return s === 'off'; })) return 'off';
    return 'partial';
  }

  function toggleClause(preset, clause, on) {
    var ids = subtreeIds(clause);
    var ex = exSet(preset);
    ids.forEach(function (id) { ex.delete(id); }); // clear subtree either way
    if (!on) ex.add(clause.id);                    // exclude only the root
    var next = clone(preset);
    next.excludedClauseIds = Array.from(ex);
    return next;
  }
  function toggleSubChapter(preset, chapterNum, subId, on) {
    var next = clone(preset);
    next.selections = next.selections || [];
    var s = next.selections.find(function (x) { return x.chapterNum === chapterNum; });
    if (on) {
      if (!s) { s = { chapterNum: chapterNum, subChapterIds: [] }; next.selections.push(s); }
      if (s.subChapterIds.indexOf(subId) === -1) s.subChapterIds.push(subId);
    } else if (s) {
      s.subChapterIds = s.subChapterIds.filter(function (id) { return id !== subId; });
      if (!s.subChapterIds.length) {
        next.selections = next.selections.filter(function (x) { return x.chapterNum !== chapterNum; });
      }
    }
    return next;
  }
  function toggleChapter(preset, chapter, on) {
    var next = clone(preset);
    next.selections = (next.selections || []).filter(function (x) { return x.chapterNum !== chapter.num; });
    if (on) {
      next.selections.push({ chapterNum: chapter.num,
        subChapterIds: (chapter.subChapters || []).map(function (s) { return s.id; }) });
    }
    return next;
  }

  function createPreset(name, buildingType) {
    return { id: genId(), name: name || '', buildingType: buildingType || '',
             selections: [], excludedClauseIds: [] };
  }
  function duplicatePreset(preset, newName) {
    var c = clone(preset);
    c.id = genId();
    c.name = newName != null ? newName : preset.name;
    c.selections = c.selections || [];
    c.excludedClauseIds = c.excludedClauseIds || [];
    return c;
  }

  var api = { resolveClauseState: resolveClauseState, resolveSubChapterState: resolveSubChapterState,
              resolveChapterState: resolveChapterState, toggleClause: toggleClause,
              toggleSubChapter: toggleSubChapter, toggleChapter: toggleChapter,
              createPreset: createPreset, duplicatePreset: duplicatePreset,
              subtreeIds: subtreeIds, genId: genId };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.SpecPreset = api;
})();
