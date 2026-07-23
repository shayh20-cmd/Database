'use strict';
(function () {
  function genId() { return Math.random().toString(36).slice(2, 12); }
  function deepCopy(x) { return JSON.parse(JSON.stringify(x || [])); }

  function createProjectFromPreset(library, presetId, meta) {
    const preset = (library.presets || []).find(function (p) { return p.id === presetId; });
    if (!preset) throw new Error('preset not found: ' + presetId);
    const selMap = {};
    preset.selections.forEach(function (s) { selMap[s.chapterNum] = new Set(s.subChapterIds); });
    const chapters = library.chapters.map(function (ch) {
      const sel = selMap[ch.num];
      const included = !!sel;
      return {
        num: ch.num, name: ch.name, discipline: ch.discipline, included: included,
        subChapters: ch.subChapters.map(function (s) {
          return { id: s.id, title: s.title,
                   included: included && sel.has(s.id),
                   clauses: deepCopy(s.clauses) };
        }),
      };
    });
    return {
      id: genId(), name: (meta && meta.name) || '', date: (meta && meta.date) || '',
      revision: (meta && meta.revision) || '',
      buildingType: (meta && meta.buildingType) || preset.buildingType || '',
      presetId: presetId, meta: (meta && meta.meta) || {}, chapters: chapters,
    };
  }

  const api = { createProjectFromPreset: createProjectFromPreset, genId: genId, deepCopy: deepCopy };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.SpecProject = api;
})();
