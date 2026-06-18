# Protein Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-file HTML proteomics data browser (`protein_explorer.html`) that loads a mass-spec `.xlsx` file via drag-and-drop and provides filtering, sorting, and protein detail inspection.

**Architecture:** One self-contained `protein_explorer.html` with all logic inline. SheetJS parses the dropped Excel file client-side. Tabulator renders the virtual-scroll table. State is held in a plain JS object; the filter bar drives Tabulator's built-in filter API.

**Tech Stack:** HTML/CSS/JS (vanilla), SheetJS 0.20 (CDN), Tabulator 6.3 (CDN)

---

## File Structure

| File | Role |
|---|---|
| `protein_explorer.html` | Entire app — shell, styles, drop zone, filter bar, table, detail panel, all JS |

---

### Task 1: HTML shell + drop zone

**Files:**
- Create: `protein_explorer.html`

- [ ] **Step 1: Create the file with skeleton, CDN imports, and drop zone**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Protein Explorer</title>
<link href="https://unpkg.com/tabulator-tables@6.3.0/dist/css/tabulator_midnight.min.css" rel="stylesheet">
<script src="https://unpkg.com/tabulator-tables@6.3.0/dist/js/tabulator.min.js"></script>
<script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"></script>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; background: #1a1a2e; color: #e0e0e0; height: 100vh; overflow: hidden; display: flex; flex-direction: column; }

  /* Drop zone */
  #drop-screen {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    height: 100vh; gap: 24px;
  }
  #drop-screen h1 { font-size: 2rem; color: #7eb3ff; }
  #drop-screen p { color: #aaa; max-width: 420px; text-align: center; }
  #drop-target {
    width: 420px; height: 200px; border: 2px dashed #7eb3ff; border-radius: 12px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 12px; cursor: pointer; transition: background 0.2s;
  }
  #drop-target.drag-over { background: rgba(126,179,255,0.1); }
  #drop-target span { font-size: 3rem; }
  #drop-target p { color: #7eb3ff; font-size: 1rem; margin: 0; }
  #file-input { display: none; }
  #browse-btn {
    padding: 8px 20px; background: transparent; border: 1px solid #7eb3ff;
    color: #7eb3ff; border-radius: 6px; cursor: pointer; font-size: 0.9rem;
  }
  #browse-btn:hover { background: rgba(126,179,255,0.1); }
  #load-error { color: #e94560; font-size: 0.9rem; display: none; }

  /* Main app (hidden until data loaded) */
  #app { display: none; flex-direction: column; height: 100vh; }
</style>
</head>
<body>

<!-- Drop zone -->
<div id="drop-screen">
  <h1>🔬 Protein Explorer</h1>
  <p>Load a mass-spectrometry results file to begin. The app expects an <strong>.xlsx</strong> file with a <em>Report</em> sheet.</p>
  <div id="drop-target">
    <span>📂</span>
    <p>Drop your .xlsx file here</p>
    <button id="browse-btn" onclick="document.getElementById('file-input').click()">Browse file</button>
  </div>
  <input type="file" id="file-input" accept=".xlsx,.xls">
  <p id="load-error"></p>
</div>

<!-- Main app -->
<div id="app"></div>

<script>
// ── State ──────────────────────────────────────────────────────────────────
const state = {
  rows: [],          // parsed protein rows
  comparison: 'ExpCtrl', // active comparison key
};

// ── Drop zone wiring ───────────────────────────────────────────────────────
const dropTarget = document.getElementById('drop-target');
const fileInput  = document.getElementById('file-input');
const loadError  = document.getElementById('load-error');

dropTarget.addEventListener('dragover', e => { e.preventDefault(); dropTarget.classList.add('drag-over'); });
dropTarget.addEventListener('dragleave', () => dropTarget.classList.remove('drag-over'));
dropTarget.addEventListener('drop', e => { e.preventDefault(); dropTarget.classList.remove('drag-over'); handleFile(e.dataTransfer.files[0]); });
fileInput.addEventListener('change', e => handleFile(e.target.files[0]));

function showError(msg) {
  loadError.textContent = msg;
  loadError.style.display = 'block';
}

function handleFile(file) {
  if (!file) return;
  if (!file.name.match(/\.xlsx?$/i)) { showError('Please drop an .xlsx file.'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const sheet = wb.Sheets['Report'];
      if (!sheet) { showError('No "Report" sheet found in this file.'); return; }
      const raw = XLSX.utils.sheet_to_json(sheet, { defval: null });
      if (!raw.length) { showError('Report sheet appears to be empty.'); return; }
      state.rows = raw;
      launchApp();
    } catch(err) {
      showError('Failed to parse file: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}
</script>
</body>
</html>
```

- [ ] **Step 2: Verify drop zone renders**

Open `protein_explorer.html` in a browser. You should see the dark drop zone screen with title, instructions, dashed target, and browse button. No errors in console.

- [ ] **Step 3: Commit**

```bash
git add protein_explorer.html
git commit -m "feat: protein explorer shell and drop zone"
```

---

### Task 2: Excel parsing + column mapping

**Files:**
- Modify: `protein_explorer.html` (add inside `<script>` after `handleFile`)

The Report sheet uses these exact column names from the source file. We map them to clean JS keys:

- [ ] **Step 1: Add the column-mapping and `parseRows` function**

Add this inside `<script>`, before `launchApp` is called:

```js
// Column name → JS key mapping
const COL = {
  'Protein ID':                                   'proteinId',
  'Entry Name':                                   'entryName',
  'Gene':                                         'gene',
  'Organism':                                     'organism',
  'Description':                                  'description',
  '# peptides':                                   'peptides',
  'Protein Length':                               'proteinLength',
  'Protein Probability':                          'proteinProbability',
  'Top Peptide Probability':                      'topPeptideProbability',
  // Exp vs CD2
  "Student's T-test p-value Exp vs CD2":          'pExpCD2',
  "Student's T-test q-value Exp_CD2":             'qExpCD2',
  'Ratio Exp/CD2':                                'ratioExpCD2',
  "Student's T-test Difference Exp_CD2":          'diffExpCD2',
  // Exp vs Ctrl
  "Student's T-test p-value Exp vs Ctrl":         'pExpCtrl',
  "Student's T-test q-value Exp_Ctrl":            'qExpCtrl',
  'Ratio Exp/Ctrl':                               'ratioExpCtrl',
  "Student's T-test Difference Exp_Ctrl":         'diffExpCtrl',
  // CD2 vs Ctrl
  "Student's T-test p-value CD2 vs Ctrl":         'pCD2Ctrl',
  "Student's T-test q-value CD2_Ctrl":            'qCD2Ctrl',
  'Ratio CD2/Ctrl':                               'ratioCD2Ctrl',
  "Student's T-test Difference CD2_Ctrl":         'diffCD2Ctrl',
};

// Comparison definitions
const COMPARISONS = {
  ExpCD2:  { label: 'Exp / CD2',  p: 'pExpCD2',  q: 'qExpCD2',  ratio: 'ratioExpCD2',  diff: 'diffExpCD2'  },
  ExpCtrl: { label: 'Exp / Ctrl', p: 'pExpCtrl', q: 'qExpCtrl', ratio: 'ratioExpCtrl', diff: 'diffExpCtrl' },
  CD2Ctrl: { label: 'CD2 / Ctrl', p: 'pCD2Ctrl', q: 'qCD2Ctrl', ratio: 'ratioCD2Ctrl', diff: 'diffCD2Ctrl' },
};

function parseRows(raw) {
  return raw.map(r => {
    const row = {};
    for (const [col, key] of Object.entries(COL)) {
      row[key] = r[col] ?? null;
    }
    // Normalise organism to short name
    row.organism = (row.organism || '').replace('Drosophila melanogaster', 'D. melanogaster')
                                       .replace('Saccharomyces cerevisiae (strain ATCC 204508 / S288c)', 'S. cerevisiae')
                                       .replace('Homo sapiens', 'H. sapiens')
                                       .replace('Bos taurus', 'B. taurus')
                                       .replace('Ovis aries', 'O. aries')
                                       .replace('Gallus gallus', 'G. gallus')
                                       .replace('Sus scrofa', 'S. scrofa');
    return row;
  });
}
```

- [ ] **Step 2: Wire `parseRows` into `handleFile`**

Replace `state.rows = raw;` with:

```js
state.rows = parseRows(raw);
```

- [ ] **Step 3: Verify parsing**

Drop the Excel file. In the browser console run:
```js
console.log(state.rows[0])
```
Expected: object with keys like `proteinId`, `gene`, `pExpCtrl`, `ratioExpCtrl`, etc.

- [ ] **Step 4: Commit**

```bash
git add protein_explorer.html
git commit -m "feat: parse xlsx and map columns to clean keys"
```

---

### Task 3: App shell + filter bar HTML

**Files:**
- Modify: `protein_explorer.html` (add `launchApp` function and app HTML)

- [ ] **Step 1: Add CSS for the app layout and filter bar**

Add inside `<style>`:

```css
/* App layout */
#app-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 16px; background: #16213e; border-bottom: 1px solid #0f3460;
  flex-shrink: 0;
}
#app-header h1 { font-size: 1.1rem; color: #7eb3ff; }
#header-right { display: flex; align-items: center; gap: 12px; }
#protein-count { font-size: 0.85rem; color: #aaa; }
#export-btn {
  padding: 5px 14px; background: transparent; border: 1px solid #7eb3ff;
  color: #7eb3ff; border-radius: 5px; cursor: pointer; font-size: 0.85rem;
}
#export-btn:hover { background: rgba(126,179,255,0.1); }

/* Filter bar */
#filter-bar {
  display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
  padding: 8px 16px; background: #0f3460; border-bottom: 1px solid #16213e;
  flex-shrink: 0;
}
.filter-group { display: flex; align-items: center; gap: 6px; }
.filter-label { font-size: 0.78rem; color: #aaa; white-space: nowrap; }
.filter-input {
  padding: 4px 8px; background: #16213e; border: 1px solid #2a4a7e;
  color: #e0e0e0; border-radius: 4px; font-size: 0.82rem; width: 72px;
}
.filter-select {
  padding: 4px 8px; background: #16213e; border: 1px solid #2a4a7e;
  color: #e0e0e0; border-radius: 4px; font-size: 0.82rem;
}
.filter-input:focus, .filter-select:focus { outline: none; border-color: #7eb3ff; }
#reset-btn {
  padding: 4px 12px; background: transparent; border: 1px solid #e94560;
  color: #e94560; border-radius: 4px; cursor: pointer; font-size: 0.8rem; margin-left: auto;
}
#reset-btn:hover { background: rgba(233,69,96,0.1); }

/* Organism dropdown */
#organism-dropdown-wrap { position: relative; }
#organism-btn {
  padding: 4px 8px; background: #16213e; border: 1px solid #2a4a7e;
  color: #e0e0e0; border-radius: 4px; font-size: 0.82rem; cursor: pointer; white-space: nowrap;
}
#organism-panel {
  display: none; position: absolute; top: 100%; left: 0; z-index: 100;
  background: #16213e; border: 1px solid #2a4a7e; border-radius: 4px;
  padding: 8px; min-width: 180px; max-height: 220px; overflow-y: auto;
}
#organism-panel.open { display: block; }
.org-option { display: flex; align-items: center; gap: 6px; padding: 3px 0; font-size: 0.82rem; cursor: pointer; }
.org-option input { cursor: pointer; }

/* Main content */
#content { display: flex; flex: 1; overflow: hidden; }
#table-wrap { flex: 6; overflow: hidden; }
#detail-panel {
  flex: 4; border-left: 1px solid #0f3460; overflow-y: auto;
  padding: 16px; background: #16213e;
}
#detail-panel .empty-state { color: #555; text-align: center; margin-top: 40px; font-size: 0.9rem; }

/* Detail content */
.detail-section { margin-bottom: 20px; }
.detail-section h3 { font-size: 0.85rem; color: #7eb3ff; text-transform: uppercase;
  letter-spacing: 0.05em; margin-bottom: 10px; border-bottom: 1px solid #0f3460; padding-bottom: 4px; }
.detail-row { display: flex; gap: 8px; margin-bottom: 6px; font-size: 0.82rem; }
.detail-key { color: #888; min-width: 120px; flex-shrink: 0; }
.detail-val { color: #e0e0e0; }
.detail-val a { color: #7eb3ff; text-decoration: none; }
.detail-val a:hover { text-decoration: underline; }
.detail-desc { font-size: 0.82rem; color: #ccc; line-height: 1.5; margin-top: 4px; }

/* Stats table */
.stats-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
.stats-table th { color: #7eb3ff; text-align: left; padding: 4px 8px;
  border-bottom: 1px solid #0f3460; font-weight: normal; }
.stats-table td { padding: 5px 8px; border-bottom: 1px solid #1a2a4e; }
.stats-table tr.sig { background: rgba(0,200,100,0.08); }
```

- [ ] **Step 2: Add the `launchApp` function**

Add inside `<script>`:

```js
function launchApp() {
  document.getElementById('drop-screen').style.display = 'none';
  const app = document.getElementById('app');
  app.style.display = 'flex';

  // Collect unique organisms
  const organisms = [...new Set(state.rows.map(r => r.organism).filter(Boolean))].sort();

  app.innerHTML = `
    <div id="app-header">
      <h1>🔬 Protein Explorer</h1>
      <div id="header-right">
        <span id="protein-count"></span>
        <button id="export-btn">Export CSV</button>
      </div>
    </div>

    <div id="filter-bar">
      <div class="filter-group">
        <span class="filter-label">Comparison:</span>
        <select class="filter-select" id="f-comparison">
          <option value="ExpCtrl">Exp / Ctrl</option>
          <option value="ExpCD2">Exp / CD2</option>
          <option value="CD2Ctrl">CD2 / Ctrl</option>
        </select>
      </div>
      <div class="filter-group">
        <span class="filter-label">p &lt;</span>
        <input class="filter-input" id="f-pval" type="number" min="0" max="1" step="0.01" placeholder="1.0">
      </div>
      <div class="filter-group">
        <span class="filter-label">q &lt;</span>
        <input class="filter-input" id="f-qval" type="number" min="0" max="1" step="0.01" placeholder="1.0">
      </div>
      <div class="filter-group">
        <span class="filter-label">FC &gt;</span>
        <input class="filter-input" id="f-fc" type="number" min="0" step="0.5" placeholder="1.0">
      </div>
      <div class="filter-group" id="organism-dropdown-wrap">
        <span class="filter-label">Organism:</span>
        <button id="organism-btn" onclick="toggleOrganismPanel()">All ▾</button>
        <div id="organism-panel">
          <label class="org-option"><input type="checkbox" value="__all__" checked onchange="toggleAllOrganisms(this)"> All</label>
          ${organisms.map(o => `<label class="org-option"><input type="checkbox" class="org-cb" value="${o}" checked onchange="updateOrganismBtn()"> ${o}</label>`).join('')}
        </div>
      </div>
      <div class="filter-group">
        <span class="filter-label">Peptides ≥</span>
        <input class="filter-input" id="f-peptides" type="number" min="1" step="1" placeholder="1">
      </div>
      <div class="filter-group">
        <span class="filter-label">Search:</span>
        <input class="filter-input" id="f-search" type="text" placeholder="gene / protein / desc" style="width:160px">
      </div>
      <button id="reset-btn" onclick="resetFilters()">Reset</button>
    </div>

    <div id="content">
      <div id="table-wrap"></div>
      <div id="detail-panel"><p class="empty-state">Click a row to view protein details</p></div>
    </div>
  `;

  initTable();
  initFilterListeners();
  document.getElementById('export-btn').addEventListener('click', exportCSV);

  // Close organism panel on outside click
  document.addEventListener('click', e => {
    const wrap = document.getElementById('organism-dropdown-wrap');
    if (wrap && !wrap.contains(e.target)) document.getElementById('organism-panel').classList.remove('open');
  });
}

function toggleOrganismPanel() {
  document.getElementById('organism-panel').classList.toggle('open');
}

function toggleAllOrganisms(cb) {
  document.querySelectorAll('.org-cb').forEach(el => el.checked = cb.checked);
  updateOrganismBtn();
  applyFilters();
}

function updateOrganismBtn() {
  const all = document.querySelectorAll('.org-cb');
  const checked = document.querySelectorAll('.org-cb:checked');
  const allCb = document.querySelector('input[value="__all__"]');
  if (allCb) allCb.checked = all.length === checked.length;
  const btn = document.getElementById('organism-btn');
  if (btn) btn.textContent = (all.length === checked.length ? 'All' : `${checked.length}/${all.length}`) + ' ▾';
  applyFilters();
}
```

- [ ] **Step 3: Verify app shell renders after drop**

Drop the Excel file. The drop screen should disappear and the filter bar + empty content area should appear. No console errors.

- [ ] **Step 4: Commit**

```bash
git add protein_explorer.html
git commit -m "feat: app shell, filter bar UI, organism dropdown"
```

---

### Task 4: Tabulator table

**Files:**
- Modify: `protein_explorer.html` (add `initTable` function)

- [ ] **Step 1: Add `initTable` and comparison-column helpers**

Add inside `<script>`:

```js
let table = null;

function compCols() {
  const c = COMPARISONS[state.comparison];
  return { p: c.p, q: c.q, ratio: c.ratio, diff: c.diff, label: c.label };
}

function fmtNum(val, decimals = 4) {
  if (val === null || val === undefined || val === '') return '—';
  const n = parseFloat(val);
  if (isNaN(n)) return '—';
  if (Math.abs(n) < 0.001 || Math.abs(n) >= 10000) return n.toExponential(2);
  return n.toFixed(decimals);
}

function fmtRatio(val) {
  if (val === null || val === undefined) return '—';
  const n = parseFloat(val);
  if (isNaN(n)) return '—';
  return n.toFixed(2) + '×';
}

function initTable() {
  const cc = compCols();
  table = new Tabulator('#table-wrap', {
    data: state.rows,
    layout: 'fitColumns',
    height: '100%',
    virtualDom: true,
    selectable: 1,
    columns: [
      { title: 'Gene',        field: 'gene',        width: 90, sorter: 'string',
        formatter: cell => cell.getValue() || '<span style="color:#555">—</span>' },
      { title: 'Description', field: 'description', minWidth: 160, sorter: 'string',
        formatter: cell => {
          const v = cell.getValue() || '';
          return `<span title="${v}">${v.length > 55 ? v.slice(0,55)+'…' : v}</span>`;
        }
      },
      { title: 'Organism',    field: 'organism',    width: 110, sorter: 'string' },
      { title: 'Peptides',    field: 'peptides',    width: 75,  sorter: 'number', hozAlign: 'right' },
      { title: 'Ratio',       field: cc.ratio,      width: 80,  sorter: 'number', hozAlign: 'right',
        formatter: cell => fmtRatio(cell.getValue()) },
      { title: 'p-value',     field: cc.p,          width: 90,  sorter: 'number', hozAlign: 'right',
        formatter: cell => fmtNum(cell.getValue()) },
      { title: 'q-value',     field: cc.q,          width: 90,  sorter: 'number', hozAlign: 'right',
        formatter: cell => fmtNum(cell.getValue()) },
      { title: 'Difference',  field: cc.diff,       width: 90,  sorter: 'number', hozAlign: 'right',
        formatter: cell => fmtNum(cell.getValue(), 3) },
    ],
    rowClick: (_e, row) => showDetail(row.getData()),
    dataProcessed: () => updateCount(),
  });
}

function updateCount() {
  const el = document.getElementById('protein-count');
  if (el && table) el.textContent = `${table.getDataCount('active').toLocaleString()} proteins`;
}

function rebuildTableColumns() {
  if (!table) return;
  const cc = compCols();
  table.setColumns([
    { title: 'Gene',        field: 'gene',        width: 90,  sorter: 'string',
      formatter: cell => cell.getValue() || '<span style="color:#555">—</span>' },
    { title: 'Description', field: 'description', minWidth: 160, sorter: 'string',
      formatter: cell => {
        const v = cell.getValue() || '';
        return `<span title="${v}">${v.length > 55 ? v.slice(0,55)+'…' : v}</span>`;
      }
    },
    { title: 'Organism',    field: 'organism',    width: 110, sorter: 'string' },
    { title: 'Peptides',    field: 'peptides',    width: 75,  sorter: 'number', hozAlign: 'right' },
    { title: 'Ratio',       field: cc.ratio,      width: 80,  sorter: 'number', hozAlign: 'right',
      formatter: cell => fmtRatio(cell.getValue()) },
    { title: 'p-value',     field: cc.p,          width: 90,  sorter: 'number', hozAlign: 'right',
      formatter: cell => fmtNum(cell.getValue()) },
    { title: 'q-value',     field: cc.q,          width: 90,  sorter: 'number', hozAlign: 'right',
      formatter: cell => fmtNum(cell.getValue()) },
    { title: 'Difference',  field: cc.diff,       width: 90,  sorter: 'number', hozAlign: 'right',
      formatter: cell => fmtNum(cell.getValue(), 3) },
  ]);
}
```

- [ ] **Step 2: Verify table renders**

Drop the Excel file. The table should show rows with gene names, descriptions, ratios, and p-values. Clicking a column header should sort. No console errors.

- [ ] **Step 3: Commit**

```bash
git add protein_explorer.html
git commit -m "feat: Tabulator table with sortable columns"
```

---

### Task 5: Filter logic

**Files:**
- Modify: `protein_explorer.html` (add `initFilterListeners`, `applyFilters`, `resetFilters`)

- [ ] **Step 1: Add filter functions**

Add inside `<script>`:

```js
function initFilterListeners() {
  ['f-pval','f-qval','f-fc','f-peptides'].forEach(id => {
    document.getElementById(id).addEventListener('input', applyFilters);
  });
  document.getElementById('f-search').addEventListener('input', applyFilters);
  document.getElementById('f-comparison').addEventListener('change', e => {
    state.comparison = e.target.value;
    rebuildTableColumns();
    applyFilters();
  });
  // org checkboxes wire themselves via onchange in HTML
}

function applyFilters() {
  if (!table) return;
  const cc = compCols();
  const pMax      = parseFloat(document.getElementById('f-pval').value)    || Infinity;
  const qMax      = parseFloat(document.getElementById('f-qval').value)    || Infinity;
  const fcMin     = parseFloat(document.getElementById('f-fc').value)      || 0;
  const pepMin    = parseInt(document.getElementById('f-peptides').value)   || 0;
  const search    = (document.getElementById('f-search').value || '').toLowerCase().trim();
  const orgs      = new Set([...document.querySelectorAll('.org-cb:checked')].map(el => el.value));

  table.setFilter(row => {
    if (row[cc.p]     !== null && row[cc.p]     > pMax)  return false;
    if (row[cc.q]     !== null && row[cc.q]     > qMax)  return false;
    if (row[cc.ratio] !== null && row[cc.ratio] < fcMin) return false;
    if (row.peptides  !== null && row.peptides  < pepMin) return false;
    if (!orgs.has(row.organism))                          return false;
    if (search) {
      const haystack = [row.gene, row.description, row.proteinId, row.entryName]
        .map(v => (v || '').toLowerCase()).join(' ');
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

function resetFilters() {
  document.getElementById('f-pval').value    = '';
  document.getElementById('f-qval').value    = '';
  document.getElementById('f-fc').value      = '';
  document.getElementById('f-peptides').value = '';
  document.getElementById('f-search').value  = '';
  document.getElementById('f-comparison').value = 'ExpCtrl';
  state.comparison = 'ExpCtrl';
  document.querySelectorAll('.org-cb').forEach(el => el.checked = true);
  const allCb = document.querySelector('input[value="__all__"]');
  if (allCb) allCb.checked = true;
  updateOrganismBtn();
  rebuildTableColumns();
  table.clearFilter();
  updateCount();
}
```

- [ ] **Step 2: Verify filters work**

Drop the file. Set p < 0.05 — count should drop significantly. Set FC > 3 — count drops further. Type a gene name in Search — table narrows. Reset clears everything.

- [ ] **Step 3: Commit**

```bash
git add protein_explorer.html
git commit -m "feat: filter logic for p-value, q-value, FC, organism, peptides, search"
```

---

### Task 6: Detail panel

**Files:**
- Modify: `protein_explorer.html` (add `showDetail` function)

- [ ] **Step 1: Add `showDetail`**

Add inside `<script>`:

```js
function showDetail(row) {
  const panel = document.getElementById('detail-panel');
  if (!panel) return;

  const uniprotUrl = `https://www.uniprot.org/uniprot/${row.proteinId}`;

  const statsRows = Object.entries(COMPARISONS).map(([key, c]) => {
    const p = row[c.p];
    const sig = p !== null && p <= 0.05;
    return `<tr class="${sig ? 'sig' : ''}">
      <td>${c.label}</td>
      <td>${fmtRatio(row[c.ratio])}</td>
      <td>${fmtNum(row[c.p])}</td>
      <td>${fmtNum(row[c.q])}</td>
      <td>${fmtNum(row[c.diff], 3)}</td>
    </tr>`;
  }).join('');

  panel.innerHTML = `
    <div class="detail-section">
      <h3>Identity</h3>
      <div class="detail-row"><span class="detail-key">Gene</span><span class="detail-val">${row.gene || '—'}</span></div>
      <div class="detail-row"><span class="detail-key">Protein ID</span><span class="detail-val"><a href="${uniprotUrl}" target="_blank">${row.proteinId}</a></span></div>
      <div class="detail-row"><span class="detail-key">Entry Name</span><span class="detail-val">${row.entryName || '—'}</span></div>
      <div class="detail-row"><span class="detail-key">Organism</span><span class="detail-val">${row.organism || '—'}</span></div>
      <div class="detail-row"><span class="detail-key">Length</span><span class="detail-val">${row.proteinLength ? row.proteinLength + ' aa' : '—'}</span></div>
      <div class="detail-row"><span class="detail-key">Peptides</span><span class="detail-val">${row.peptides ?? '—'}</span></div>
      <div class="detail-row"><span class="detail-key">Protein prob.</span><span class="detail-val">${row.proteinProbability !== null ? parseFloat(row.proteinProbability).toFixed(4) : '—'}</span></div>
      <div class="detail-row"><span class="detail-key">Top peptide prob.</span><span class="detail-val">${row.topPeptideProbability !== null ? parseFloat(row.topPeptideProbability).toFixed(4) : '—'}</span></div>
      <div class="detail-row" style="align-items:flex-start"><span class="detail-key">Description</span></div>
      <p class="detail-desc">${row.description || '—'}</p>
    </div>

    <div class="detail-section">
      <h3>Statistics</h3>
      <table class="stats-table">
        <thead><tr>
          <th>Comparison</th><th>Ratio</th><th>p-value</th><th>q-value</th><th>Difference</th>
        </tr></thead>
        <tbody>${statsRows}</tbody>
      </table>
      <p style="font-size:0.72rem;color:#555;margin-top:6px">Green rows: p ≤ 0.05</p>
    </div>
  `;
}
```

- [ ] **Step 2: Verify detail panel**

Drop the file and click any row. The right panel should fill in with:
- Gene name, UniProt link, organism, description
- Stats table with 3 rows (one per comparison), green tint where p ≤ 0.05

- [ ] **Step 3: Commit**

```bash
git add protein_explorer.html
git commit -m "feat: detail panel with identity and statistics"
```

---

### Task 7: CSV export + protein count badge + final polish

**Files:**
- Modify: `protein_explorer.html` (add `exportCSV`, fix count badge, add row hover style)

- [ ] **Step 1: Add `exportCSV`**

Add inside `<script>`:

```js
function exportCSV() {
  if (!table) return;
  table.download('csv', 'protein_explorer_export.csv');
}
```

- [ ] **Step 2: Add row hover style**

Add inside `<style>`:

```css
.tabulator-row:hover { background: rgba(126,179,255,0.07) !important; cursor: pointer; }
.tabulator-row.tabulator-selected { background: rgba(126,179,255,0.15) !important; }
.tabulator-row.tabulator-selected:hover { background: rgba(126,179,255,0.2) !important; }
```

- [ ] **Step 3: Call `updateCount` after `initTable`**

In `launchApp`, after the line `initTable();`, add:

```js
setTimeout(updateCount, 200); // wait for Tabulator first render
```

- [ ] **Step 4: Verify export**

Apply a filter (e.g. p < 0.05). Click Export CSV. The downloaded file should contain only the filtered rows with all columns.

- [ ] **Step 5: Final verification checklist**

- [ ] Drop zone: drop an `.xlsx` → app loads
- [ ] Drop zone: drop a non-xlsx → error message appears
- [ ] Filter: set p < 0.05, count updates
- [ ] Filter: set FC > 3, fewer rows
- [ ] Filter: type "nrx" in search, only Nrx-related rows
- [ ] Filter: uncheck one organism, those rows disappear
- [ ] Filter: Reset clears everything
- [ ] Comparison selector: switch to Exp/CD2, table columns update to CD2 ratios
- [ ] Click row: detail panel fills in
- [ ] Detail: UniProt link opens correct URL in new tab
- [ ] Detail: green row where p ≤ 0.05
- [ ] Export: filtered CSV downloads with correct rows

- [ ] **Step 6: Commit**

```bash
git add protein_explorer.html
git commit -m "feat: CSV export, row hover styles, count badge — protein explorer complete"
```
