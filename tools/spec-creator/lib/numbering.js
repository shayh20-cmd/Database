'use strict';
(function () {
  function pad2(n) { return String(n).padStart(2, '0'); }
  function chapterCode(num) { return Number.isInteger(num) ? pad2(num) : String(num); }
  function numberClauseList(base, clauses, map) {
    (clauses || []).forEach(function (c, i) {
      const n = base + '.' + pad2(i + 1);
      map[c.id] = n;
      if (c.children && c.children.length) numberClauseList(n, c.children, map);
    });
  }
  function assignNumbers(chNum, subChapters) {
    const map = {};
    (subChapters || []).forEach(function (s, si) {
      const base = chapterCode(chNum) + '.' + pad2(si + 1);
      map[s.id] = base;
      numberClauseList(base, s.clauses, map);
    });
    return map;
  }
  const api = { pad2: pad2, chapterCode: chapterCode, assignNumbers: assignNumbers };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.SpecNumbering = api;
})();
