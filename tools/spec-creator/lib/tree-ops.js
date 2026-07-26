'use strict';
(function () {
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function genId() { return Math.random().toString(36).slice(2, 12); }

  function locate(clauses, id) {
    for (let i = 0; i < clauses.length; i++) {
      if (clauses[i].id === id) return { list: clauses, index: i };
      if (clauses[i].children) {
        const r = locate(clauses[i].children, id);
        if (r) return r;
      }
    }
    return null;
  }
  function move(clauses, id, dir) {
    const c = clone(clauses);
    const loc = locate(c, id);
    if (!loc) return c;
    const j = loc.index + dir;
    if (j < 0 || j >= loc.list.length) return c;
    const it = loc.list.splice(loc.index, 1)[0];
    loc.list.splice(j, 0, it);
    return c;
  }
  function addAfter(clauses, id, kind) {
    const c = clone(clauses);
    const nc = { id: genId(), text: '', kind: kind || 'paragraph', children: [] };
    if (id === null) { c.push(nc); return { tree: c, newId: nc.id }; }
    const loc = locate(c, id);
    if (!loc) { c.push(nc); } else { loc.list.splice(loc.index + 1, 0, nc); }
    return { tree: c, newId: nc.id };
  }
  function addChild(clauses, parentId, kind) {
    const c = clone(clauses);
    const loc = locate(c, parentId);
    const nc = { id: genId(), text: '', kind: kind || 'paragraph', children: [] };
    if (loc) {
      const p = loc.list[loc.index];
      p.children = p.children || [];
      p.children.push(nc);
    }
    return { tree: c, newId: nc.id };
  }
  function remove(clauses, id) {
    const c = clone(clauses);
    const loc = locate(c, id);
    if (loc) loc.list.splice(loc.index, 1);
    return c;
  }
  function setText(clauses, id, text) {
    const c = clone(clauses);
    const loc = locate(c, id);
    if (loc) loc.list[loc.index].text = text;
    return c;
  }

  // Reorder a flat list (e.g. sub-chapters) by id: pull fromId out and drop it next to
  // toId (before it, or after it when `after` is true). Immutable. Used for drag-reorder.
  function reorderById(list, fromId, toId, after) {
    if (fromId === toId) return list.slice();
    const arr = list.slice();
    const fromIdx = arr.findIndex(function (x) { return x.id === fromId; });
    if (fromIdx < 0) return list.slice();
    const it = arr.splice(fromIdx, 1)[0];
    let toIdx = arr.findIndex(function (x) { return x.id === toId; });
    if (toIdx < 0) { arr.push(it); return arr; }
    if (after) toIdx += 1;
    arr.splice(toIdx, 0, it);
    return arr;
  }

  const api = { locate: locate, move: move, addAfter: addAfter, addChild: addChild,
                remove: remove, setText: setText, genId: genId, reorderById: reorderById };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.SpecTree = api;
})();
