'use strict';
(function () {
  const HEB = 'אבגדהוזחטיכלמנסעפצקרשת'; // 22 letters
  function pad2(n) { return String(n).padStart(2, '0'); }
  function chapterCode(num) { return Number.isInteger(num) ? pad2(num) : String(num); }
  function hebrewLetter(n) { return (n >= 1 && n <= HEB.length) ? HEB[n - 1] : String(n); }

  // Depth 0 (clauses directly in a sub-chapter) are numeric: "09.01.01".
  // Depth 1 (children) get a Hebrew letter: "09.01.01 (א)".
  // Depth 2+ get a parenthesised number: "09.01.01 (א) (1)".
  function suffix(depth, idx) {
    if (depth === 0) return '.' + pad2(idx);
    return ' (' + (depth === 1 ? hebrewLetter(idx) : String(idx)) + ')';
  }
  function walk(parentNum, clauses, depth, map) {
    (clauses || []).forEach(function (c, i) {
      const n = parentNum + suffix(depth, i + 1);
      map[c.id] = n;
      if (c.children && c.children.length) walk(n, c.children, depth + 1, map);
    });
  }
  function assignNumbers(chNum, subChapters) {
    const map = {};
    (subChapters || []).forEach(function (s, si) {
      const base = chapterCode(chNum) + '.' + pad2(si + 1);
      map[s.id] = base;
      walk(base, s.clauses, 0, map);
    });
    return map;
  }
  const api = { pad2: pad2, chapterCode: chapterCode, hebrewLetter: hebrewLetter, assignNumbers: assignNumbers };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.SpecNumbering = api;
})();
