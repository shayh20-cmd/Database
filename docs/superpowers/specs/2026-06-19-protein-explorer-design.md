# Protein Explorer — Design Spec
**Date:** 2026-06-19  
**Status:** Approved

---

## Overview

A single-file HTML app (`protein_explorer.html`) for browsing, filtering, and investigating mass-spectrometry proteomics results. Loads any `.xlsx` file matching the standard output format via drag-and-drop. No server, no install required.

---

## Data Format

The app expects an `.xlsx` with at least a **Report** sheet in the following format (30 columns, variable rows):

| Group | Columns |
|---|---|
| Identity | Protein ID, Entry Name, Gene, Organism, Description |
| Quality | # peptides, Protein Length, Protein Probability, Top Peptide Probability |
| Comparisons (×3) | p-value, q-value, Ratio, Difference — for Exp/CD2, Exp/Ctrl, CD2/Ctrl |
| Raw intensities | Exp_1–3, CD2_1–3, Ctrl_1–3 |

Reference file: `Mass-Spec rep 2 results and candidates .xlsx` (2,166 proteins).

---

## Architecture

**File:** `protein_explorer.html` (self-contained)  
**Libraries (CDN):**
- **SheetJS** (`xlsx.full.min.js`) — in-browser `.xlsx` parsing
- **Tabulator** (`tabulator.min.js` + CSS) — virtual-scroll table with built-in sort/filter

**Data flow:**
1. User opens the HTML file → drop zone is shown
2. User drops an `.xlsx` → SheetJS parses the Report sheet → data stored in `sessionStorage`
3. App renders: filter bar + table + empty detail panel
4. User applies filters → Tabulator filters rows client-side
5. User clicks a row → detail panel populates

---

## Layout

```
┌─────────────────────────────────────────────────────────┐
│  🔬 Protein Explorer              [N proteins] [Export] │
├─────────────────────────────────────────────────────────┤
│  Comparison: [Exp/CD2 ▼]  p < [0.05]  q < [0.05]       │
│  FC > [2×]  Organism: [All ▼]  Peptides ≥ [1]           │
│  Search: [gene / description / protein ID ______]       │
├──────────────────────────────┬──────────────────────────┤
│   TABLE (60% width)          │   DETAIL PANEL (40%)     │
│   virtual scroll, sortable   │   updates on row click   │
│                              │                          │
│   Gene | Ratio | p | q | …   │   [identity section]     │
│   ──────────────────────     │   [stats table]          │
│   rows…                      │                          │
└──────────────────────────────┴──────────────────────────┘
```

---

## Filter Bar

All filters are applied simultaneously (AND logic). The **Comparison selector** determines which set of stats the p-value, q-value, ratio, and difference filters target.

| Filter | Type | Default |
|---|---|---|
| Comparison | Dropdown: Exp/CD2, Exp/Ctrl, CD2/Ctrl | Exp/Ctrl |
| p-value max | Number input | 1.0 (no filter) |
| q-value max | Number input | 1.0 (no filter) |
| Fold-change min | Number input | 1.0 (no filter) |
| Organism | Multi-checkbox dropdown | All selected |
| Min peptides | Number input | 1 |
| Text search | Free-text | empty |

Text search matches against Gene, Description, Protein ID, and Entry Name (case-insensitive substring).

A **Reset** button clears all filters to defaults. A live protein count badge in the header updates as filters change.

**Export:** Downloads the current filtered rows as CSV (all 30 columns).

---

## Table Columns

Default visible columns (user can sort any column by clicking header):

| Column | Notes |
|---|---|
| Gene | Primary identifier |
| Description | Truncated to ~60 chars |
| Organism | Short name |
| # Peptides | |
| Ratio (selected comparison) | Formatted as `×N.N` |
| p-value (selected comparison) | Scientific notation |
| q-value (selected comparison) | Scientific notation |
| Difference (selected comparison) | |

When the Comparison selector changes, the Ratio, p-value, q-value, and Difference columns update to reflect the new comparison.

---

## Detail Panel

Shown on the right (40% width) when a row is clicked. Empty state shows "Click a row to view details."

### Section 1 — Identity
- **Gene**, Protein ID (hyperlinked to `https://www.uniprot.org/uniprot/<ProteinID>`), Entry Name
- **Organism**, Description (full text, wrapping)
- Protein Length, Protein Probability, Top Peptide Probability, # Peptides

### Section 2 — Statistics
A 3-row table, one row per comparison:

| Comparison | Ratio | p-value | q-value | Difference |
|---|---|---|---|---|
| Exp / CD2 | | | | |
| Exp / Ctrl | | | | |
| CD2 / Ctrl | | | | |

Row background: green tint if p < 0.05, no tint otherwise.

---

## Drop Zone (initial state)

Full-screen centered UI:
- App title and brief description
- Large dashed drop target: "Drop your .xlsx results file here"
- Fallback "Browse file" button (file input)
- On load error: inline error message with guidance

---

## Non-Goals (explicitly out of scope)

- Volcano plot or intensity bar chart visualization
- Candidates sheet integration / annotation overlay
- Saving filter state across sessions
- Multi-file comparison
- Backend / server component
