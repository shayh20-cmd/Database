# Dashboards on KkarcDB — Schema and Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get the three dashboards' data out of individual browsers and into the KkarcDB Supabase database, with a schema that survives multiple concurrent users.

**Architecture:** Five plain-SQL migrations (`008`–`012`) add 31 `hub_*` tables to the existing KkarcDB PostgreSQL schema and alter three of its tables. Two seed files supply the vocabularies, including a discipline map that is *data a human edits*, not code. A Node ETL reads an exported `localStorage` blob and writes rows, resolving firms and people against KkarcDB's existing register.

**Tech Stack:** PostgreSQL 15 (Supabase), plain SQL migrations applied by the existing `KKarcDB.Data.Migrator`, xunit + Npgsql for schema tests, Node 24 (built-in `node:test`, no dependencies) for the ETL.

## Scope

This plan delivers **a populated, queryable database**. It does not wire the front end
to it. The `/api/hub/*` endpoints and the `localStorage` → `fetch` adapter are a
**separate follow-on plan**, written after this one lands, because the API's shape
depends on what the ETL proves about the data.

Two repositories are involved:

| Repo | Path | What changes |
|---|---|---|
| **KkarcDB** | `D:\Coding\KkarcDB` | migrations, seeds, `verify.sql`, schema tests, `tools/hub-import` |
| **Database** | `D:\Projects\@Delta Office\New folder\Database` | one additive script block in `project_hub.html` (the export) |

Branch in Database is `supabase-schema` (already cut). **Task 2 begins by cutting a
matching branch in KkarcDB** — do not commit KkarcDB work to `master`.

## Global Constraints

Copied verbatim from KkarcDB's `CLAUDE.md`. Every task's requirements include these.

- **Migrations are plain SQL with no vendor features and no `BEGIN`/`COMMIT`** — the caller owns the transaction (`psql -1`, or the `Migrator`).
- **Prefer boring, well-documented technology** and explain choices in commit messages; there is a bus factor of one.
- **Test fixtures are synthetic.** Real client names stay out of the suite.
- **Hebrew folder and firm names carry invisible bidirectional marks** that Explorer inserts. Left in, they end up inside stored names and quietly break matching.
- Data tests need `KKARCDB_TEST_CONNECTION`; without it they **skip** rather than fail.
- PowerShell, not bash: `$env:NAME = "value"`, never `export`.
- **Never use `pkill -f` with a pattern naming a project** — it matches the shell running the command.
- All new tables: `uuid` primary keys via `gen_random_uuid()`, `created_at`/`updated_at timestamptz`, the existing `set_updated_at()` trigger, `ON DELETE CASCADE` down ownership, `ON DELETE SET NULL` on pointers.
- Commit message trailer on every commit: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

## The discipline map — this is the thing to feed

The spec left this open. Below is the **measured** list, extracted from the running
code, not guessed. `project_hub.html` defines 16 discipline codes in `DISCIPLINES`
with Hebrew names in `DISCIPLINE_FULL_NAMES` and colours; `planning_dashboard.html`
uses six Hebrew strings with no codes at all. Three more codes are added here that the
app does not define yet, for trades the practice engages.

**Everything now maps onto a discipline that already exists.** When this plan was first
written the register held fifteen disciplines and five had to be created. It now holds
fifty-one: `797e7cb` loaded 158 consultant spreadsheets and added thirty-six trades
"the firm demonstrably engages", in its own words. So `db/seed/002_hub_disciplines.sql`
creates nothing and only fills in `legacy_code` and `color`.

Two of those thirty-six matter especially, because the earlier draft of this plan would
have duplicated them under different names:

| The earlier draft would have created | What the register already calls it |
|---|---|
| `project_management` | **`project_mgmt`** — ניהול פרויקט |
| `drainage` | **`hydrology`** — הידרולוגיה, "Hydrology and drainage" |

### The map

| Hub code | Hebrew in the app | Consultant's own wording | KkarcDB code | Colour |
|---|---|---|---|---|
| `ARCH` | אדריכל | אדריכלות | `architecture` | `#3B82F6` |
| `STRC` | קונסטרוקטור | קונסטרוקציה | `structural` | `#7C3AED` |
| `ELEC` | חשמל | חשמל ותקשורת | `electrical` | `#D97706` |
| `PLUM` | אינסטלציה | אינסטלציה סניטרית | `plumbing` | `#14B8A6` |
| `HVAC` | מיזוג אוויר | מיזוג אוויר | `hvac` | `#0EA5E9` |
| `LAND` | נוף | אדריכלות נוף | `landscape` | `#F97316` |
| `SAFE` | בטיחות | בטיחות | `safety` | `#22C55E` |
| `ACSS` | נגישות | נגישות | `accessibility` | `#EC4899` |
| `TRAF` | תנועה | תנועה | `traffic` | `#8B5CF6` |
| `FIRE` | כבאות | כבאות | `fire` | `#BB4040` |
| `ACUS` | אקוסטיקה | אקוסטיקה | `acoustics` | `#BB40EE` |
| `SURV` | מדידות | מדידות | `survey` | `#BBAA22` |
| `GR` | קרקע | יועץ קרקע | `geotechnical` | `#92400E` |
| `PM` | ניהול פרויקט | מנהל פרויקט | `project_mgmt` | `#6366F1` |
| `HYDR` | ניקוז | הידרולוג | `hydrology` | `#2563EB` |
| `LIFT` | מעליות | מעליות | `elevators` | `#6B7280` |
| `AGRO` | אגרונומיה | אגרונום | `agronomy` | `#059669` |
| `TNDR` | מכרזים | כמויות ומכרז | `quantity` | `#EF4444` |
| *(none)* | תקשורת | planning board only, firm `DCX` | `communications` | `#0891B2` |

`PM` is by far the most-used code in the seed data, with 58 references, so getting it
wrong is expensive. The code it maps to is `project_mgmt`, abbreviated, not
`project_management`.

`ACUS` maps to `acoustics`, with the s. The register spells it in the plural, and the
seed matches on that code, so the singular would update nothing and say nothing.

`FIRE`, `ACUS` and `SURV` are not in `project_hub.html`'s `DISCIPLINES` array today.
They are here because the practice engages those trades and the register already has a
row for each. Adding them to the app's array is a separate one-line change; until it
happens, no task will carry them and the mapping simply sits unused.

### Needs your decision — one row

`ENVI`. The app labels it `סביבה`, which means environment. The consultant row calls
it `בניה ירוקה`, green building, and the one task using it is
`אישור מעבדה לבנייה ירוקה`, a green-building laboratory approval. The register now has
a row for each reading, which it did not when this plan was first written.

| Option | Consequence |
|---|---|
| **A (recommended): `ENVI` → `green`** (בנייה ירוקה) | Follows the data rather than the label. The one task using this code is a green-building approval, and the consultant describes itself that way. |
| B: `ENVI` → `environment` (איכות סביבה) | Follows the app's label. "Environmental quality" is a real and different trade, and choosing it makes the green-building task land under it. |

Nothing else hangs on this: both rows exist, so the choice is which one gets
`legacy_code = 'ENVI'`. To change it, edit that one line in
`db/seed/002_hub_disciplines.sql` and re-run the seed.

**To feed the rest:** the same file. Nothing reads the mapping except the database —
it is stored on `discipline.legacy_code`, and the import reads it back out.

---

## Firm-name merging

**There is already a rule for this in the repository**, and this plan deliberately does
not use it. `tools/consultant-extract/names.py` decides whether two spellings are one
firm by asking whether they share a distinctive token, after removing the words that
half the trade uses. Its own docstring says the tools that use it must agree "or a
second load would duplicate everyone", so departing from it needs a reason.

The reason is that it over-merges badly. Run over the 543 firm names it loaded into the
register, it collapses them to 301. Among the clusters it forms:

- **דוד אלחנתי אדריכלות נוף** merged with **דוד ברהום מהנדסים יועצים לחשמל ותקשורת** — a landscape architect and an electrical engineer, because both are named דוד.
- **בר אלכס הנדסה** merged with **ד. בר עקיבא מהנדסים**, **ורד בר** and **נגיעה בנוף - נתי בר זוהר** — four unrelated practices, because all four contain בר.
- **אור ייעוץ תכנון** merged with **מכון דף אור** and **ו.נ. אור הנדסה** — because all three contain אור.

That last one matters directly: `ו.נ. אור הנדסה` is the electrical consultant on the
dashboard. Under the existing rule it would be absorbed into an unrelated firm.

So the import keeps its own rule, which measures edit distance instead. **One good idea
is borrowed from `names.py` and must stay in step with it:** its `GENERIC_WORDS` list.
Half the names in this trade contain הנדסה or מהנדסים, and those characters pad the
length so that an edit budget stretches over the part that actually identifies the
firm. Measuring the distinctive part instead is what keeps `מ.נ.מ מהנדסים` and
`ת.ל.מ מהנדסים` apart.

### The rule

**Normalise**, in this order:

1. Strip Unicode bidi marks: `U+200E U+200F U+202A–U+202E U+2066–U+2069`.
2. Replace `" ” „ ״` with `"`, and `' ’ ׳` with `'`.
3. Delete the corporate suffix when it ends the name: `בע"מ`, `בעמ`, `בע״מ`, `Ltd`, `Ltd.`, `LTD`.
4. Replace every `.`, `,`, `-` and `–` with a space.
5. Collapse whitespace runs to one space; trim.
6. Lowercase Latin letters.

Two names equal after this are the same firm, merged silently.

**Otherwise take the distinctive part** — the normalised name with every `GENERIC_WORDS`
entry removed — and compare those with Levenshtein distance over Unicode code points:

| Condition | Result |
|---|---|
| either distinctive part is empty | separate; a name made only of trade words identifies nothing |
| shorter distinctive part under 6 characters | same only if the parts are identical |
| distance `≤ 3` **and** `distance / longer ≤ 0.2` | merge, and write a line to the report |
| anything else | separate firms |

The ratio is a fifth rather than a quarter because at a quarter `מיכאל רויטמן` and
`מיכאל פרידמן` land exactly on the threshold and merge. Two people sharing a first name
are not one firm.

### Measured, not asserted

Run over the same 543 firm names, this rule gives:

| Rule | Firms | Merges |
|---|---|---|
| `names.py`, shared token | 301 | 242, many of them wrong |
| This rule | **498** | **44** |

Every one of the 44 was read by hand. They are spelling variants (`נפתלי`/`נפטלי`,
`יעקוב`/`יעקב`, `סיסטמה`/`סיסתמה`, `תכנון`/`תיכנון`), the same practice written with and
without its trade suffix (`וישקין` / `וישקין מהנדסים`, `כדאי` / `כדאי בטיחות`,
`אלרום` / `אלרום הנדסת מעליות`), and one kaf-for-qof variant of the practice's own name
(`כנפו-כלימור` → `קנפו כלימור אדריכלים`).

An earlier draft of this rule measured the whole name rather than the distinctive part.
It made 24 merges, four of them wrong: `נאסר מהנדסים` with `סטאר מהנדסים`,
`מ.נ.מ מהנדסים` with `ת.ל.מ מהנדסים`, `א.ד מהנדסים` with `אחוד מהנדסים`, and
`ג.ל. מהנדסים יועצים` with `י. לבל מהנדסים יועצים`. Each is two or three edits inside a
long shared suffix that every firm in the trade carries. The current rule merges **more**
and makes **none** of those four.

**On the five collisions between the two dashboards:**

| Pair | Result |
|---|---|
| `קנפו כלימור אדריכלים` / `קנפו כלמור אדריכלים` | merged, distance 1, reported |
| `י. שני מהנדסים` / `י.שני מהנדסים` | merged, identical after normalising, silent |
| `ש. גלבוע מהנדסים` (plumbing) / `ש. גלבוע מהנדסים` (HVAC) | one firm, two engagements |
| `א.נ.ה הנדסת חשמל` / `ו.נ. אור הנדסה` | kept separate |
| `DCX` / anything | kept separate by the short-name guard |

Every non-exact merge is written to `tools/hub-import/out/firm-merges.txt` for review.
Nothing merges silently except a match that needed no edits at all.

---

## File Structure

### KkarcDB repo — `D:\Coding\KkarcDB`

| File | Responsibility |
|---|---|
| `db/migrations/008_hub_vocabularies.sql` | Alter `discipline`, `person`, `project_participant`; create the four `hub_*` vocabulary tables |
| `db/migrations/009_hub_work.sql` | `hub_project_profile` … `hub_event`, `hub_attachment` — the task tree and its status log |
| `db/migrations/010_hub_meetings.sql` | meetings, items, goals, milestones, principles, activity |
| `db/migrations/011_hub_planning.sql` | the planning board's six tables |
| `db/migrations/012_hub_user_state.sql` | `hub_user_pref`, `hub_saved_view` |
| `db/seed/002_hub_disciplines.sql` | **the discipline map** — the file a human edits |
| `db/seed/003_hub_vocabularies.sql` | statuses, priorities, event statuses, meeting item types |
| `db/verify.sql` | extended with a hub corner |
| `tests/KKarcDB.Data.Tests/HubSchemaTests.cs` | the triggers and constraints that carry judgement |
| `tools/hub-import/normalise.js` | bidi stripping, name normalisation, Levenshtein, merge rule |
| `tools/hub-import/normalise.test.js` | its tests |
| `tools/hub-import/register.js` | resolve/create `project`, `firm`, `person`, participants, assignments |
| `tools/hub-import/hub.js` | map a `project_hub` blob to `hub_*` rows |
| `tools/hub-import/planning.js` | map a `planning_dashboard` blob to the board tables |
| `tools/hub-import/import.js` | the command; wires the above, writes the reports |
| `tools/hub-import/README.md` | how to run it, and what its reports mean |

### Database repo — `D:\Projects\@Delta Office\New folder\Database`

| File | Responsibility |
|---|---|
| `project_hub.html` | one appended `<script>` block adding a JSON export button |

**Why an appended block and not a React button:** `project_hub.html` is 700 KB of
compiled `React.createElement` output whose longest line is 46,424 characters. The
restructure spec exists because edits to it cannot be reviewed. The export must ship
before anything else and must not risk the app, so it reads `localStorage` directly
and touches no part of the React tree. It is deleted when the adapter lands.

---

## Task 1: JSON export from project_hub

Ships first. Until it exists there is no migration path and the data is one cleared
cache from gone.

**Files:**
- Modify: `D:\Projects\@Delta Office\New folder\Database\project_hub.html` (append before `</body>`)

**Interfaces:**
- Consumes: nothing
- Produces: a downloaded file named `project_hub_export_YYYY-MM-DD.json` whose top level is `{exportedAt, schema:"pm_asana_v9", data:<the blob>, ui:{expandedTasks, sheetUi, ganttLabelW, appLang}}`. Task 12 reads this shape.

- [ ] **Step 1: Confirm the anchor exists and is unique**

Run in `D:\Projects\@Delta Office\New folder\Database`:

```bash
grep -c '<script src="i18n-dict.js"></script><script src="i18n.js"></script>' project_hub.html
```

Expected: `1`

- [ ] **Step 2: Append the export block**

Append to `project_hub.html`, after the existing `</html>` is *not* acceptable — insert
immediately **before** the final `</body>` tag. Use this exact content:

```html
<script>
/* ── Temporary data export ──────────────────────────────────────────────────
   Reads localStorage directly and does not touch the React tree, because this
   file is compiled output that cannot be reviewed by diff (see the restructure
   spec). Delete this block when the API adapter lands. ───────────────────── */
(function () {
  'use strict';
  var KEY = 'pm_asana_v9';

  function readJson(key, fallback) {
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (e) { return fallback; }
  }

  function collectSheetUi() {
    var out = {};
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf('pm_asana_v9_') === 0 && k !== 'pm_asana_v9_expanded_tasks') {
        out[k] = readJson(k, null);
      }
    }
    return out;
  }

  function buildExport() {
    return {
      exportedAt: new Date().toISOString(),
      schema: KEY,
      data: readJson(KEY, null),
      ui: {
        expandedTasks: readJson('pm_asana_v9_expanded_tasks', []),
        sheetUi: collectSheetUi(),
        ganttLabelW: localStorage.getItem('pm_gantt_label_w'),
        appLang: localStorage.getItem('appLang')
      }
    };
  }

  function download() {
    var payload = buildExport();
    if (!payload.data) { alert('אין נתונים לייצוא'); return; }
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'project_hub_export_' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  }

  /* Exposed so the export can be taken from the console on a machine where the
     button is off-screen, and so a test can call it without a click. */
  window.__hubExport = buildExport;

  function mount() {
    if (document.getElementById('hub-export-btn')) return;
    var b = document.createElement('button');
    b.id = 'hub-export-btn';
    b.type = 'button';
    b.textContent = '⬇ ייצוא נתונים';
    b.title = 'הורדת כל נתוני הפרויקט כקובץ JSON';
    b.setAttribute('style', [
      'position:fixed', 'bottom:16px', 'inset-inline-start:16px', 'z-index:99999',
      'padding:8px 14px', 'border-radius:8px', 'border:1px solid #2563EB',
      'background:#2563EB', 'color:#fff', 'font:600 13px system-ui,sans-serif',
      'cursor:pointer', 'box-shadow:0 2px 8px rgba(0,0,0,.25)'
    ].join(';'));
    b.addEventListener('click', download);
    document.body.appendChild(b);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
</script>
```

- [ ] **Step 3: Verify it runs and produces the right shape**

Open the file in a browser, then in the console:

```javascript
var e = window.__hubExport();
console.log(e.schema, !!e.data, Array.isArray(e.ui.expandedTasks), Object.keys(e.data).length);
```

Expected: `pm_asana_v9 true true` and a key count of 10 or more.

- [ ] **Step 4: Verify the button downloads a parseable file**

Click `⬇ ייצוא נתונים`. A file downloads. Open it in a text editor and confirm the
first line is `{` and the file contains `"schema": "pm_asana_v9"`.

- [ ] **Step 5: Verify the app still works**

Reload the page. Confirm the task list renders, a task can be expanded, and the console
shows no new errors. The block must not have disturbed anything.

- [ ] **Step 6: Take the real export**

Have every person who holds project data open their copy and click the button. Collect
the files into `D:\Coding\KkarcDB\tools\hub-import\in\`. **This is the irreplaceable
step; the rest of the plan can be redone, this cannot.**

- [ ] **Step 7: Commit**

```bash
git add project_hub.html
git commit -m "feat(project_hub): add JSON export of all local data

The app has no export, so a cleared cache destroys the project. This reads
localStorage directly and appends a fixed-position button, touching no part
of the compiled React tree, because a diff against that tree cannot be
reviewed. It also captures the per-user UI keys, which the schema splits
into hub_user_pref.

Deleted when the API adapter lands.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Migration 008 — alterations and vocabularies

**Files:**
- Create: `D:\Coding\KkarcDB\db\migrations\008_hub_vocabularies.sql`
- Test: `D:\Coding\KkarcDB\tests\KKarcDB.Data.Tests\HubSchemaTests.cs`

**Interfaces:**
- Consumes: `discipline`, `person`, `project_participant`, `set_updated_at()` from migrations `001`–`006`
- Produces: tables `hub_task_status`, `hub_priority`, `hub_event_status`, `hub_meeting_item_type`, each keyed by `code text PRIMARY KEY`; columns `discipline.color`, `discipline.legacy_code`, `person.discipline_code`, `project_participant.lead_person_id`

- [ ] **Step 1: Cut the branch**

```bash
cd /d/Coding/KkarcDB && git checkout -b hub-schema
```

Expected: `Switched to a new branch 'hub-schema'`

- [ ] **Step 2: Write the failing test**

Create `tests/KKarcDB.Data.Tests/HubSchemaTests.cs`:

```csharp
using Npgsql;
using Xunit;

namespace KKarcDB.Data.Tests;

/// <summary>
/// The parts of the hub schema that carry judgement rather than structure.
/// </summary>
/// <remarks>
/// Column lists are not worth testing — a typo in one fails every query loudly.
/// What is worth testing is the rules: an event that belongs to nothing, a subtask
/// that is its own ancestor, a status machine whose follower points at a status that
/// does not exist. Each of those would otherwise surface as wrong numbers on a
/// dashboard rather than as an error.
/// </remarks>
[Collection("database")]
public sealed class HubSchemaTests(DatabaseFixture fixture) : IAsyncLifetime
{
    public Task InitializeAsync() => fixture.ResetAsync();

    public Task DisposeAsync() => Task.CompletedTask;

    private async Task<T?> ScalarAsync<T>(string sql, params object[] parameters)
    {
        await using var connection = new NpgsqlConnection(fixture.ConnectionString!);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        foreach (var parameter in parameters)
        {
            command.Parameters.AddWithValue(parameter);
        }

        var value = await command.ExecuteScalarAsync();
        return value is null or DBNull ? default : (T)value;
    }

    [SkippableFact]
    public async Task Migration_008_adds_the_vocabulary_tables()
    {
        Skip.IfNot(fixture.Available, "KKARCDB_TEST_CONNECTION not set");

        var count = await ScalarAsync<long>(
            """
            SELECT count(*) FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name IN ('hub_task_status', 'hub_priority',
                                 'hub_event_status', 'hub_meeting_item_type')
            """);

        Assert.Equal(4, count);
    }

    [SkippableFact]
    public async Task A_discipline_carries_a_colour_and_a_legacy_code()
    {
        Skip.IfNot(fixture.Available, "KKARCDB_TEST_CONNECTION not set");

        var count = await ScalarAsync<long>(
            """
            SELECT count(*) FROM information_schema.columns
            WHERE table_name = 'discipline' AND column_name IN ('color', 'legacy_code')
            """);

        Assert.Equal(2, count);
    }

    [SkippableFact]
    public async Task Two_disciplines_cannot_claim_the_same_legacy_code()
    {
        Skip.IfNot(fixture.Available, "KKARCDB_TEST_CONNECTION not set");

        await using var connection = new NpgsqlConnection(fixture.ConnectionString!);
        await connection.OpenAsync();

        await using var first = new NpgsqlCommand(
            "UPDATE discipline SET legacy_code = 'ARCH' WHERE code = 'architecture'", connection);
        await first.ExecuteNonQueryAsync();

        await using var clash = new NpgsqlCommand(
            "UPDATE discipline SET legacy_code = 'ARCH' WHERE code = 'structural'", connection);

        var error = await Assert.ThrowsAsync<PostgresException>(() => clash.ExecuteNonQueryAsync());
        Assert.Equal("23505", error.SqlState);
    }
}
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd /d/Coding/KkarcDB && dotnet test tests/KKarcDB.Data.Tests --filter HubSchemaTests
```

Expected: FAIL — the three tests report `0` tables, `0` columns, and no unique
violation. If `KKARCDB_TEST_CONNECTION` is unset they report as skipped, which proves
nothing: set it before continuing.

- [ ] **Step 4: Write the migration**

Create `db/migrations/008_hub_vocabularies.sql`:

```sql
-- 008 — the dashboards' vocabularies, and what the existing tables were missing.
--
-- project_hub, planning_dashboard and home_dashboard held their own copies of the
-- staff, consultant and discipline lists. This migration is the point at which they
-- stop: identity stays in project/person/firm/discipline, and the tables added here
-- describe only the things those tables have no opinion about.

-- ---------------------------------------------------------------------------
-- Existing tables, extended
-- ---------------------------------------------------------------------------

-- The dashboards colour every chip by discipline, and the colours are part of how
-- the drawings are read rather than decoration someone picked.
ALTER TABLE discipline ADD COLUMN color text
    CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$');

-- The apps identify disciplines by short codes of their own -- ARCH, STRC, PM. The
-- map between those and this table is data rather than code so that it can be read,
-- corrected and re-run without a deployment; db/seed/002_hub_disciplines.sql fills it.
ALTER TABLE discipline ADD COLUMN legacy_code text;

CREATE UNIQUE INDEX discipline_legacy_code_unique
    ON discipline (legacy_code) WHERE legacy_code IS NOT NULL;

COMMENT ON COLUMN discipline.legacy_code IS
    'The code project_hub used before the database existed. Null for disciplines the dashboards never referenced.';

-- A member of staff has a discipline; an external contact usually does not, and takes
-- theirs from the firm. Nullable rather than two tables, because the difference is one
-- column and a person can move between the two.
ALTER TABLE person ADD COLUMN discipline_code text
    REFERENCES discipline (code) ON DELETE SET NULL;

-- `mobile`, `fax` and `address` are deliberately absent: 007_consultant_contacts.sql
-- added them when the spreadsheets were loaded, and adding a column twice fails.
CREATE INDEX person_discipline_idx ON person (discipline_code);

-- Consultant rows in the blob carried an isLead flag on one contact. Which person to
-- ring first is a property of the engagement, not of the person: the same firm can
-- field a different lead on a different project.
ALTER TABLE project_participant ADD COLUMN lead_person_id uuid
    REFERENCES person (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Vocabularies
--
-- Editable in the UI today, so tables rather than enums or CHECK constraints: adding
-- a status must not require a migration. `code` is the identity and `name_he`/`name_en`
-- are labels, which is the split that makes the translation work tractable.
-- ---------------------------------------------------------------------------

CREATE TABLE hub_task_status (
    code        text PRIMARY KEY,
    name_en     text NOT NULL,
    name_he     text,
    color       text CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
    legacy_code text,
    sort_order  integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX hub_task_status_legacy_code_unique
    ON hub_task_status (legacy_code) WHERE legacy_code IS NOT NULL;

COMMENT ON TABLE hub_task_status IS
    'What state a task or subtask is in: not started, in progress, awaiting response, stuck, done.';

COMMENT ON COLUMN hub_task_status.legacy_code IS
    'The single letter project_hub stored in statusId -- N, I, R, S, C.';

CREATE TABLE hub_priority (
    code        text PRIMARY KEY,
    name_en     text NOT NULL,
    name_he     text,
    color       text CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
    sort_order  integer NOT NULL DEFAULT 0
);

-- The status machine shared by project_hub's event chains and planning_dashboard's
-- cells. Both apps implement it in JavaScript today, and they have already drifted:
-- project_hub has an `update` status planning_dashboard does not. One table, so the
-- next divergence is a row somebody added rather than a difference nobody noticed.
CREATE TABLE hub_event_status (
    code                    text PRIMARY KEY,
    name_en                 text NOT NULL,
    name_he                 text,
    symbol                  text,
    color                   text CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),

    -- A period status is measured in days and can go stale; a milestone is an instant.
    -- "This has been in progress for 40 days" is a sentence only period statuses say.
    is_period               boolean NOT NULL DEFAULT false,

    -- Reaching this status immediately creates a follower: sent becomes awaiting a
    -- response the same day, comments send it back to work on the next round.
    auto_follow_code        text REFERENCES hub_event_status (code) ON DELETE SET NULL,
    auto_follow_round_delta integer NOT NULL DEFAULT 0,

    sort_order              integer NOT NULL DEFAULT 0,

    CONSTRAINT hub_event_status_no_self_follow CHECK (code <> auto_follow_code),
    CONSTRAINT hub_event_status_delta_needs_follower
        CHECK (auto_follow_code IS NOT NULL OR auto_follow_round_delta = 0)
);

COMMENT ON TABLE hub_event_status IS
    'The shared status machine: missing, progress, sent, response, comments, update, approved.';

CREATE TABLE hub_meeting_item_type (
    code        text PRIMARY KEY,
    name_en     text NOT NULL,
    name_he     text,
    sort_order  integer NOT NULL DEFAULT 0
);

COMMENT ON TABLE hub_meeting_item_type IS
    'What a line in the minutes becomes: a task, a subtask, an update, a decision, or information.';

UPDATE app_meta SET value = '008', updated_at = now() WHERE key = 'schema_version';
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd /d/Coding/KkarcDB && dotnet test tests/KKarcDB.Data.Tests --filter HubSchemaTests
```

Expected: PASS, 3 tests.

- [ ] **Step 6: Confirm the whole suite still passes**

```bash
cd /d/Coding/KkarcDB && dotnet test
```

Expected: 205 passing (the current 202 plus these 3), 0 failing.

The 202 is 113 scanner tests, 39 API tests and 50 data tests. A further 42 data tests
skip without `KKARCDB_TEST_CONNECTION`, and the three added here are among them, so an
unset connection makes this step prove nothing.

- [ ] **Step 7: Commit**

```bash
git add db/migrations/008_hub_vocabularies.sql tests/KKarcDB.Data.Tests/HubSchemaTests.cs
git commit -m "feat(db): add the dashboards' vocabularies and extend discipline"
```

Use this commit body:

```
The three dashboards each carried their own copy of the staff, consultant
and discipline lists. This is where that stops: discipline gains the colour
the chips are drawn with and a legacy_code, so the map from project_hub's
ARCH/STRC/PM to this table is data a human can correct rather than code that
needs a deployment.

hub_event_status models the status machine both project_hub and
planning_dashboard implement separately in JavaScript, including the
auto-follow rule. They have already drifted once.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Task 3: Seed the discipline map and the vocabularies

This is the task whose output a human edits. Everything downstream reads the map from
the database rather than from code.

**Files:**
- Create: `D:\Coding\KkarcDB\db\seed\002_hub_disciplines.sql`
- Create: `D:\Coding\KkarcDB\db\seed\003_hub_vocabularies.sql`
- Test: `D:\Coding\KkarcDB\tests\KKarcDB.Data.Tests\HubSchemaTests.cs` (append)

**Interfaces:**
- Consumes: the tables from Task 2
- Produces: `discipline.legacy_code` populated for 19 codes and no new `discipline` rows; `hub_task_status` 5 rows keyed `not_started|in_progress|awaiting_response|stuck|done`; `hub_priority` 3 rows keyed `high|medium|low`; `hub_event_status` 7 rows keyed `missing|progress|sent|response|comments|update|approved`; `hub_meeting_item_type` 5 rows keyed `task|subtask|update|decision|info`

- [ ] **Step 1: Write the failing test**

Append to `tests/KKarcDB.Data.Tests/HubSchemaTests.cs`, inside the class:

```csharp
    /// <summary>Applies the idempotent seed files the way a deployment does.</summary>
    private async Task SeedAsync()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        string? seedDirectory = null;
        while (directory is not null)
        {
            var candidate = Path.Combine(directory.FullName, "db", "seed");
            if (Directory.Exists(candidate)) { seedDirectory = candidate; break; }
            directory = directory.Parent;
        }

        Assert.NotNull(seedDirectory);

        await using var connection = new NpgsqlConnection(fixture.ConnectionString!);
        await connection.OpenAsync();

        foreach (var path in Directory.EnumerateFiles(seedDirectory!, "*.sql")
                     .OrderBy(Path.GetFileName, StringComparer.Ordinal))
        {
            await using var command = new NpgsqlCommand(await File.ReadAllTextAsync(path), connection);
            await command.ExecuteNonQueryAsync();
        }
    }

    [SkippableFact]
    public async Task Every_discipline_the_dashboards_use_maps_to_exactly_one_row()
    {
        Skip.IfNot(fixture.Available, "KKARCDB_TEST_CONNECTION not set");
        await SeedAsync();

        // The sixteen codes project_hub's DISCIPLINES array defines, plus the three
        // trades the practice engages that it does not list yet. A code missing here
        // means tasks arrive from the import with no discipline and are drawn grey.
        string[] expected =
        [
            "ARCH", "STRC", "ELEC", "PLUM", "HVAC", "LAND", "SAFE", "ACSS",
            "TRAF", "GR", "ENVI", "PM", "HYDR", "LIFT", "AGRO", "TNDR",
            "FIRE", "ACUS", "SURV",
        ];

        var mapped = await ScalarAsync<long>(
            "SELECT count(*) FROM discipline WHERE legacy_code = ANY($1)", expected);

        Assert.Equal(expected.Length, mapped);
    }

    [SkippableFact]
    public async Task The_planning_board_disciplines_all_exist()
    {
        Skip.IfNot(fixture.Available, "KKARCDB_TEST_CONNECTION not set");
        await SeedAsync();

        // planning_dashboard names its six disciplines in Hebrew with no codes at all,
        // so the ETL matches on name_he. A rename here silently orphans its columns.
        string[] names =
        [
            "אדריכלות", "קונסטרוקציה", "חשמל", "אינסטלציה", "מיזוג אוויר", "תקשורת",
        ];

        var found = await ScalarAsync<long>(
            "SELECT count(*) FROM discipline WHERE name_he = ANY($1)", names);

        Assert.Equal(names.Length, found);
    }

    [SkippableFact]
    public async Task The_status_machine_follows_itself_correctly()
    {
        Skip.IfNot(fixture.Available, "KKARCDB_TEST_CONNECTION not set");
        await SeedAsync();

        // sent leads to awaiting a response on the same round; comments sends the work
        // back round again. Getting the delta wrong renumbers every round in the app.
        Assert.Equal("response", await ScalarAsync<string>(
            "SELECT auto_follow_code FROM hub_event_status WHERE code = 'sent'"));
        Assert.Equal(0, await ScalarAsync<int>(
            "SELECT auto_follow_round_delta FROM hub_event_status WHERE code = 'sent'"));

        Assert.Equal("progress", await ScalarAsync<string>(
            "SELECT auto_follow_code FROM hub_event_status WHERE code = 'comments'"));
        Assert.Equal(1, await ScalarAsync<int>(
            "SELECT auto_follow_round_delta FROM hub_event_status WHERE code = 'comments'"));

        // approved is the end of the chain, not a loop back to the start.
        Assert.Null(await ScalarAsync<string>(
            "SELECT auto_follow_code FROM hub_event_status WHERE code = 'approved'"));
    }

    [SkippableFact]
    public async Task Seeding_twice_changes_nothing()
    {
        Skip.IfNot(fixture.Available, "KKARCDB_TEST_CONNECTION not set");

        await SeedAsync();
        var first = await ScalarAsync<long>("SELECT count(*) FROM discipline");
        await SeedAsync();
        var second = await ScalarAsync<long>("SELECT count(*) FROM discipline");

        Assert.Equal(first, second);
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /d/Coding/KkarcDB && dotnet test tests/KKarcDB.Data.Tests --filter HubSchemaTests
```

Expected: FAIL — `Every_discipline_the_dashboards_use_maps_to_exactly_one_row` reports
`0` rather than `19`.

- [ ] **Step 3: Write the discipline seed**

Create `db/seed/002_hub_disciplines.sql`. **This is the file to edit if a mapping is
wrong.** Change the `legacy_code` on the line, re-run, and nothing else needs touching.

```sql
-- 002 — the discipline map.
--
-- project_hub identifies disciplines by short codes of its own; this file says which
-- row in `discipline` each one means. The map is data rather than code so that a
-- disagreement about it is settled by editing one line and re-running, which is what
-- happens when somebody who knows the practice reads it for the first time.
--
-- It creates nothing. Every trade the dashboards name already has a row: 797e7cb read
-- 158 consultant spreadsheets and added the thirty-six the firm demonstrably engages,
-- taking this table from fifteen disciplines to fifty-one. Inserting here would only
-- produce a second row meaning the same thing under a different code.
--
-- Idempotent: safe to re-run after an edit.
--
-- Colours are project_hub's own, from its DISCIPLINES array. They are how the chips
-- are read at a glance rather than decoration.

UPDATE discipline AS d SET
    legacy_code = m.legacy_code,
    color       = m.color
FROM (VALUES
    -- KkarcDB code    legacy    colour
    ('architecture',   'ARCH',   '#3B82F6'),
    ('structural',     'STRC',   '#7C3AED'),
    ('electrical',     'ELEC',   '#D97706'),
    ('plumbing',       'PLUM',   '#14B8A6'),
    ('hvac',           'HVAC',   '#0EA5E9'),
    ('landscape',      'LAND',   '#F97316'),
    ('safety',         'SAFE',   '#22C55E'),
    ('accessibility',  'ACSS',   '#EC4899'),
    ('traffic',        'TRAF',   '#8B5CF6'),
    ('geotechnical',   'GR',     '#92400E'),

    -- Trades the practice engages that project_hub's DISCIPLINES array does not list
    -- yet. Mapped now so that adding them to the app is a one-line change there and
    -- nothing here. Until then no task carries them and these rows sit unused.
    ('fire',           'FIRE',   '#BB4040'),
    ('acoustics',      'ACUS',   '#BB40EE'),   -- plural: the register spells it so
    ('survey',         'SURV',   '#BBAA22'),

    -- Abbreviated in the register, not spelled out. `project_management` does not
    -- exist here, and creating it would shadow this row for the most-used code in the
    -- whole seed data -- 58 references.
    ('project_mgmt',   'PM',     '#6366F1'),

    -- The register calls this hydrology; its English name is "Hydrology and drainage",
    -- which is the trade the app calls ניקוז.
    ('hydrology',      'HYDR',   '#2563EB'),

    ('elevators',      'LIFT',   '#6B7280'),
    ('agronomy',       'AGRO',   '#059669'),
    ('communications', NULL,     '#0891B2'),

    -- The app labels TNDR "מכרזים", but the firm behind it is a quantity surveyor and
    -- its own wording is "כמויות ומכרז". Mapped to quantity, which leaves מכרז meaning
    -- only the tender *stage* -- it is already a stage_template code.
    ('quantity',       'TNDR',   '#EF4444'),

    -- DECISION. The app labels ENVI "סביבה", environment, but the one task using it is
    -- a green-building laboratory approval and the consultant describes itself as
    -- "בניה ירוקה". Both readings now have a row: `green` (בנייה ירוקה) and
    -- `environment` (איכות סביבה). This follows the data rather than the label.
    -- To reverse: change 'green' below to 'environment'. Nothing else moves.
    ('green',          'ENVI',   '#10B981')
) AS m (code, legacy_code, color)
WHERE d.code = m.code;

-- A code that matches no row updates nothing and says nothing, which is the one way
-- this file can fail quietly -- and the way it did fail, with `acoustic` for the
-- register's `acoustics`. Refuse instead.
DO $$
DECLARE
    mapped bigint;
BEGIN
    SELECT count(*) INTO mapped FROM discipline WHERE legacy_code IS NOT NULL;
    IF mapped <> 19 THEN
        RAISE EXCEPTION
            'expected 19 mapped disciplines, found % -- a code in 002_hub_disciplines.sql does not exist',
            mapped;
    END IF;
END $$;
```

- [ ] **Step 4: Write the vocabulary seed**

Create `db/seed/003_hub_vocabularies.sql`:

```sql
-- 003 — the dashboards' vocabularies.
--
-- Values and colours are project_hub's and planning_dashboard's own, so the migrated
-- app looks identical to the local one. Idempotent.

INSERT INTO hub_task_status (code, name_en, name_he, color, legacy_code, sort_order) VALUES
    ('not_started',       'Not started',       'לא התחיל',  '#6B7280', 'N', 10),
    ('in_progress',       'In progress',       'בעבודה',    '#2563EB', 'I', 20),
    ('awaiting_response', 'Awaiting response', 'התייחסות',  '#D97706', 'R', 30),
    ('stuck',             'Stuck',             'תקוע',      '#EF4444', 'S', 40),
    ('done',              'Done',              'בוצע',      '#059669', 'C', 50)
ON CONFLICT (code) DO NOTHING;

INSERT INTO hub_priority (code, name_en, name_he, color, sort_order) VALUES
    ('high',   'High',   'גבוהה',   '#EF4444', 10),
    ('medium', 'Medium', 'בינונית', '#F59E0B', 20),
    ('low',    'Low',    'נמוכה',   '#3B82F6', 30)
ON CONFLICT (code) DO NOTHING;

-- Inserted in dependency order: a row's auto_follow_code references this same table,
-- so the follower must already exist. response before sent, progress before comments.
INSERT INTO hub_event_status
    (code, name_en, name_he, symbol, color, is_period, auto_follow_code, auto_follow_round_delta, sort_order) VALUES
    ('missing',  'Missing',           'חסר',        '—', '#6B7280', false, NULL,       0, 10),
    ('progress', 'In progress',       'בעבודה',     '●', '#1D4ED8', true,  NULL,       0, 20),
    ('response', 'Awaiting response', 'בהתייחסות',  '⤴', '#78350F', true,  NULL,       0, 30),
    ('sent',     'Sent',              'נשלח',       '→', '#3730A3', false, 'response', 0, 40),
    ('comments', 'Comments received', 'יש הערות',   '!', '#92400E', false, 'progress', 1, 50),
    ('update',   'Update',            'עדכון',      '↻', '#0F766E', false, NULL,       0, 60),
    ('approved', 'Approved',          'מאושר',      '✓', '#059669', false, NULL,       0, 70)
ON CONFLICT (code) DO NOTHING;

INSERT INTO hub_meeting_item_type (code, name_en, name_he, sort_order) VALUES
    ('task',     'Task',        'משימה',    10),
    ('subtask',  'Subtask',     'תת-משימה', 20),
    ('update',   'Update',      'עדכון',    30),
    ('decision', 'Decision',    'החלטה',    40),
    ('info',     'Information', 'לידיעה',   50)
ON CONFLICT (code) DO NOTHING;
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd /d/Coding/KkarcDB && dotnet test tests/KKarcDB.Data.Tests --filter HubSchemaTests
```

Expected: PASS, 7 tests.

- [ ] **Step 6: Read the map back and check it by eye**

```bash
psql "$KKARCDB_TEST_CONNECTION" -c "SELECT legacy_code, code, name_he, color FROM discipline WHERE legacy_code IS NOT NULL ORDER BY legacy_code"
```

Expected: 19 rows, and `PM` reading `project_mgmt` rather than `project_management`.
**Check `ENVI` against the decision in the plan header before continuing.** If it is
wrong, edit that one line in `db/seed/002_hub_disciplines.sql` and re-run the seed;
nothing else changes.

Also confirm the count:

```bash
psql "$KKARCDB_TEST_CONNECTION" -c "SELECT count(*) FROM discipline"
```

Expected: 51. If it is more, the seed created a discipline instead of mapping one, and
the extra row is a duplicate under a different code.

- [ ] **Step 7: Commit**

```bash
git add db/seed/002_hub_disciplines.sql db/seed/003_hub_vocabularies.sql tests/KKarcDB.Data.Tests/HubSchemaTests.cs
git commit -m "feat(db): seed the discipline map and the dashboards' vocabularies"
```

Use this commit body:

```
The map from project_hub's ARCH/STRC/PM codes to this database's
disciplines is stored as data on discipline.legacy_code, so correcting it
means editing one line and re-running rather than changing code.

It creates no disciplines. 797e7cb read 158 consultant spreadsheets and
took this table from 15 codes to 51, so every trade the dashboards name
already has a row. Two of them would have been duplicated by an earlier
draft of this file: the register abbreviates project management to
project_mgmt, and calls drainage hydrology.

Three mappings are judgement calls. ENVI is labelled 'environment' in the
app but its only task is a green-building approval, so it maps to green;
the file says how to move it to environment, which also exists. TNDR is
labelled 'tenders' but the firm behind it is a quantity surveyor, so it
maps to quantity, which also stops the word meaning both a discipline and a
stage. FIRE, ACUS and SURV are mapped although the app does not define them
yet, so adding them there becomes a one-line change and nothing else.

The file ends by counting what it mapped and refusing if the count is
wrong. A code matching no row updates nothing and says nothing, which is
how 'acoustic' for the register's 'acoustics' went unnoticed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Task 4: Migration 009 — the work tables

The largest migration. It carries the two rules that are worth testing: an event must
belong to exactly one thing, and a subtask cannot be its own ancestor.

**Files:**
- Create: `D:\Coding\KkarcDB\db\migrations\009_hub_work.sql`
- Test: `D:\Coding\KkarcDB\tests\KKarcDB.Data.Tests\HubWorkTests.cs`

**Interfaces:**
- Consumes: `project`, `person`, `discipline`, `stage`, `set_updated_at()`; `hub_task_status`, `hub_priority`, `hub_event_status` from Task 2
- Produces: `hub_project_profile(project_id PK)`, `hub_discipline_hours`, `hub_project_blocker`, `hub_project_track`, `hub_sheet`, `hub_field`, `hub_group`, `hub_task`, `hub_task_lane`, `hub_subtask`, `hub_event`, `hub_attachment` — all `id uuid PRIMARY KEY` except `hub_project_profile`. `hub_event` accepts exactly one of `task_id`, `subtask_id`, `plan_cell_id`; `plan_cell_id` has no foreign key until Task 6.

- [ ] **Step 1: Write the failing test**

Create `tests/KKarcDB.Data.Tests/HubWorkTests.cs`:

```csharp
using Npgsql;
using Xunit;

namespace KKarcDB.Data.Tests;

/// <summary>
/// The rules the task tree enforces, as opposed to the columns it has.
/// </summary>
/// <remarks>
/// Each test here stands for a way the old localStorage model could hold nonsense and
/// nothing would say so: an event floating free of any task, a subtask that is its own
/// grandparent, a lane borrowed from a different task. In a single-user app those are
/// bugs nobody hits. Shared between two people they are how the numbers stop adding up.
/// </remarks>
[Collection("database")]
public sealed class HubWorkTests(DatabaseFixture fixture) : IAsyncLifetime
{
    public Task InitializeAsync() => fixture.ResetAsync();

    public Task DisposeAsync() => Task.CompletedTask;

    private async Task<NpgsqlConnection> OpenAsync()
    {
        var connection = new NpgsqlConnection(fixture.ConnectionString!);
        await connection.OpenAsync();
        return connection;
    }

    private static async Task<Guid> ScalarGuidAsync(
        NpgsqlConnection connection, string sql, params object[] parameters)
    {
        await using var command = new NpgsqlCommand(sql, connection);
        foreach (var parameter in parameters)
        {
            command.Parameters.AddWithValue(parameter);
        }

        return (Guid)(await command.ExecuteScalarAsync())!;
    }

    private static async Task ExecuteAsync(
        NpgsqlConnection connection, string sql, params object[] parameters)
    {
        await using var command = new NpgsqlCommand(sql, connection);
        foreach (var parameter in parameters)
        {
            command.Parameters.AddWithValue(parameter);
        }

        await command.ExecuteNonQueryAsync();
    }

    /// <summary>A project with one sheet, one group and one task, and the task's id.</summary>
    private static async Task<Guid> ScaffoldTaskAsync(NpgsqlConnection connection)
    {
        var projectId = await ScalarGuidAsync(connection,
            "INSERT INTO project (year, sequence, name) VALUES (2026, 1, 'Scratch') RETURNING id");

        var sheetId = await ScalarGuidAsync(connection,
            "INSERT INTO hub_sheet (project_id, name) VALUES ($1, 'Sheet') RETURNING id", projectId);

        var groupId = await ScalarGuidAsync(connection,
            "INSERT INTO hub_group (sheet_id, name) VALUES ($1, 'Group') RETURNING id", sheetId);

        return await ScalarGuidAsync(connection,
            "INSERT INTO hub_task (sheet_id, group_id, title) VALUES ($1, $2, 'Task') RETURNING id",
            sheetId, groupId);
    }

    [SkippableFact]
    public async Task An_event_must_belong_to_exactly_one_thing()
    {
        Skip.IfNot(fixture.Available, "KKARCDB_TEST_CONNECTION not set");

        await using var connection = await OpenAsync();
        var taskId = await ScaffoldTaskAsync(connection);

        // Belonging to nothing is the failure mode that matters: the old model kept
        // events in an array, so an event whose parent was deleted simply vanished
        // from view while still counting towards a status somewhere else.
        await using var orphan = new NpgsqlCommand(
            "INSERT INTO hub_event (status_code, event_date) VALUES ('progress', '2026-01-01')",
            connection);

        var orphanError = await Assert.ThrowsAsync<PostgresException>(
            () => orphan.ExecuteNonQueryAsync());
        Assert.Equal("23514", orphanError.SqlState);

        var subtaskId = await ScalarGuidAsync(connection,
            "INSERT INTO hub_subtask (task_id, title) VALUES ($1, 'Sub') RETURNING id", taskId);

        await using var both = new NpgsqlCommand(
            """
            INSERT INTO hub_event (task_id, subtask_id, status_code, event_date)
            VALUES ($1, $2, 'progress', '2026-01-01')
            """, connection);
        both.Parameters.AddWithValue(taskId);
        both.Parameters.AddWithValue(subtaskId);

        var bothError = await Assert.ThrowsAsync<PostgresException>(() => both.ExecuteNonQueryAsync());
        Assert.Equal("23514", bothError.SqlState);

        // One owner is accepted.
        await ExecuteAsync(connection,
            "INSERT INTO hub_event (task_id, status_code, event_date) VALUES ($1, 'progress', '2026-01-01')",
            taskId);
    }

    [SkippableFact]
    public async Task A_subtask_cannot_be_its_own_ancestor()
    {
        Skip.IfNot(fixture.Available, "KKARCDB_TEST_CONNECTION not set");

        await using var connection = await OpenAsync();
        var taskId = await ScaffoldTaskAsync(connection);

        var parentId = await ScalarGuidAsync(connection,
            "INSERT INTO hub_subtask (task_id, title) VALUES ($1, 'Parent') RETURNING id", taskId);

        var childId = await ScalarGuidAsync(connection,
            """
            INSERT INTO hub_subtask (task_id, parent_subtask_id, title)
            VALUES ($1, $2, 'Child') RETURNING id
            """, taskId, parentId);

        // Three levels deep is real: the seed data nests task -> subtask -> subtask.
        await ExecuteAsync(connection,
            """
            INSERT INTO hub_subtask (task_id, parent_subtask_id, title)
            VALUES ($1, $2, 'Grandchild')
            """, taskId, childId);

        await using var cycle = new NpgsqlCommand(
            "UPDATE hub_subtask SET parent_subtask_id = $1 WHERE id = $2", connection);
        cycle.Parameters.AddWithValue(childId);
        cycle.Parameters.AddWithValue(parentId);

        var error = await Assert.ThrowsAsync<PostgresException>(() => cycle.ExecuteNonQueryAsync());
        Assert.Equal("23514", error.SqlState);
    }

    [SkippableFact]
    public async Task A_subtask_cannot_borrow_a_parent_from_another_task()
    {
        Skip.IfNot(fixture.Available, "KKARCDB_TEST_CONNECTION not set");

        await using var connection = await OpenAsync();
        var firstTaskId = await ScaffoldTaskAsync(connection);

        var sheetId = await ScalarGuidAsync(connection,
            "SELECT sheet_id FROM hub_task WHERE id = $1", firstTaskId);
        var groupId = await ScalarGuidAsync(connection,
            "SELECT group_id FROM hub_task WHERE id = $1", firstTaskId);

        var secondTaskId = await ScalarGuidAsync(connection,
            "INSERT INTO hub_task (sheet_id, group_id, title) VALUES ($1, $2, 'Other') RETURNING id",
            sheetId, groupId);

        var parentId = await ScalarGuidAsync(connection,
            "INSERT INTO hub_subtask (task_id, title) VALUES ($1, 'Parent') RETURNING id", firstTaskId);

        await using var crossed = new NpgsqlCommand(
            """
            INSERT INTO hub_subtask (task_id, parent_subtask_id, title)
            VALUES ($1, $2, 'Stolen')
            """, connection);
        crossed.Parameters.AddWithValue(secondTaskId);
        crossed.Parameters.AddWithValue(parentId);

        var error = await Assert.ThrowsAsync<PostgresException>(() => crossed.ExecuteNonQueryAsync());
        Assert.Equal("23503", error.SqlState);
    }

    [SkippableFact]
    public async Task Deleting_a_project_takes_its_whole_tree_with_it()
    {
        Skip.IfNot(fixture.Available, "KKARCDB_TEST_CONNECTION not set");

        await using var connection = await OpenAsync();
        var taskId = await ScaffoldTaskAsync(connection);

        await ExecuteAsync(connection,
            "INSERT INTO hub_event (task_id, status_code, event_date) VALUES ($1, 'sent', '2026-02-01')",
            taskId);

        await ExecuteAsync(connection, "DELETE FROM project");

        await using var count = new NpgsqlCommand(
            "SELECT count(*) FROM hub_event", connection);
        Assert.Equal(0L, (long)(await count.ExecuteScalarAsync())!);
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /d/Coding/KkarcDB && dotnet test tests/KKarcDB.Data.Tests --filter HubWorkTests
```

Expected: FAIL with `relation "hub_sheet" does not exist`.

- [ ] **Step 3: Write the migration**

Create `db/migrations/009_hub_work.sql`:

```sql
-- 009 — sheets, tasks, subtasks and the status log they share.
--
-- The shape this replaces kept subtasks in two places at once: migrateTask() copied
-- them into a lane without removing them from task.subtasks, leaving 50 tasks with
-- identical subtask id sets in both. They stayed consistent only because nobody had
-- yet edited through the second path. Here the task owns the subtask and the lane is
-- an attribute of it, which is what eight of the nine read sites already assumed.

-- ---------------------------------------------------------------------------
-- The project, as the dashboards see it
-- ---------------------------------------------------------------------------

CREATE TABLE hub_project_profile (
    project_id      uuid PRIMARY KEY REFERENCES project (id) ON DELETE CASCADE,
    type            text,
    area_m2         numeric(10, 2) CHECK (area_m2 IS NULL OR area_m2 >= 0),
    budget_text     text,
    priority_code   text REFERENCES hub_priority (code) ON DELETE SET NULL,
    icon            text,
    color           text CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),

    -- Configuration for the built-in columns, which are code rather than rows: today
    -- only {"__owner_status": {"delayThreshold": 30}}. Normalising a settings bag
    -- with one key buys nothing and costs a join on every read.
    builtin_config  jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE hub_project_profile IS
    'The handful of fields only the dashboards care about, kept off `project` so the register stays the register.';

CREATE TRIGGER hub_project_profile_set_updated_at
    BEFORE UPDATE ON hub_project_profile
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Budgeted against actual hours per discipline. The home dashboard's only data that
-- exists nowhere else -- everything else on that page is a query over these tables.
CREATE TABLE hub_discipline_hours (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      uuid NOT NULL REFERENCES project (id) ON DELETE CASCADE,
    discipline_code text NOT NULL REFERENCES discipline (code) ON DELETE RESTRICT,
    budget_hours    numeric(8, 1) NOT NULL DEFAULT 0 CHECK (budget_hours >= 0),
    actual_hours    numeric(8, 1) NOT NULL DEFAULT 0 CHECK (actual_hours >= 0),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT hub_discipline_hours_unique UNIQUE (project_id, discipline_code)
);

CREATE TRIGGER hub_discipline_hours_set_updated_at
    BEFORE UPDATE ON hub_discipline_hours
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A blocker is a sentence somebody wrote about why work stopped, with a date. It
-- resolves rather than being deleted, so "how long were we waiting on the council"
-- stays answerable after the answer arrives.
CREATE TABLE hub_project_blocker (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      uuid NOT NULL REFERENCES project (id) ON DELETE CASCADE,
    stage_id        uuid REFERENCES stage (id) ON DELETE SET NULL,
    text            text NOT NULL CHECK (btrim(text) <> ''),
    raised_at       date NOT NULL DEFAULT CURRENT_DATE,
    resolved_at     date,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT hub_project_blocker_date_order
        CHECK (resolved_at IS NULL OR resolved_at >= raised_at)
);

CREATE INDEX hub_project_blocker_open_idx ON hub_project_blocker (project_id)
    WHERE resolved_at IS NULL;

CREATE TRIGGER hub_project_blocker_set_updated_at
    BEFORE UPDATE ON hub_project_blocker
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Tracks and sheets
--
-- The blob called two unrelated things `tracks`: the project's own lanes (licensing,
-- tender, execution) and a per-discipline lane inside one task. They become
-- hub_project_track and hub_task_lane, so the word stops meaning two things.
-- ---------------------------------------------------------------------------

CREATE TABLE hub_project_track (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      uuid NOT NULL REFERENCES project (id) ON DELETE CASCADE,
    code            text NOT NULL CHECK (btrim(code) <> ''),
    name_en         text,
    name_he         text,
    discipline_code text REFERENCES discipline (code) ON DELETE SET NULL,
    categories      text[] NOT NULL DEFAULT '{}',
    sort_order      integer NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT hub_project_track_unique UNIQUE (project_id, code)
);

CREATE TRIGGER hub_project_track_set_updated_at
    BEFORE UPDATE ON hub_project_track
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE hub_sheet (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      uuid NOT NULL REFERENCES project (id) ON DELETE CASCADE,
    track_id        uuid REFERENCES hub_project_track (id) ON DELETE SET NULL,
    name            text NOT NULL CHECK (btrim(name) <> ''),
    kind            text NOT NULL DEFAULT 'list' CHECK (kind IN ('list')),
    sort_order      integer NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX hub_sheet_project_idx ON hub_sheet (project_id);
CREATE INDEX hub_sheet_track_idx ON hub_sheet (track_id);

CREATE TRIGGER hub_sheet_set_updated_at
    BEFORE UPDATE ON hub_sheet
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A sheet's own extra columns. The built-in ones (__name, __status, __dates and the
-- rest) are code, not rows: they have behaviour, not just a type.
CREATE TABLE hub_field (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sheet_id        uuid NOT NULL REFERENCES hub_sheet (id) ON DELETE CASCADE,
    code            text NOT NULL CHECK (btrim(code) <> ''),
    name_en         text,
    name_he         text,
    type            text NOT NULL
                    CHECK (type IN ('text', 'number', 'date', 'select', 'checkbox', 'person')),
    options         jsonb NOT NULL DEFAULT '[]'::jsonb,
    sort_order      integer NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT hub_field_unique UNIQUE (sheet_id, code),
    CONSTRAINT hub_field_not_builtin CHECK (code NOT LIKE '\_\_%')
);

CREATE TRIGGER hub_field_set_updated_at
    BEFORE UPDATE ON hub_field
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE hub_group (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sheet_id        uuid NOT NULL REFERENCES hub_sheet (id) ON DELETE CASCADE,
    name            text NOT NULL CHECK (btrim(name) <> ''),
    sort_order      integer NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX hub_group_sheet_idx ON hub_group (sheet_id);

CREATE TRIGGER hub_group_set_updated_at
    BEFORE UPDATE ON hub_group
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------

CREATE TABLE hub_task (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sheet_id                uuid NOT NULL REFERENCES hub_sheet (id) ON DELETE CASCADE,
    group_id                uuid REFERENCES hub_group (id) ON DELETE SET NULL,
    title                   text NOT NULL CHECK (btrim(title) <> ''),
    status_code             text REFERENCES hub_task_status (code) ON DELETE SET NULL,
    priority_code           text REFERENCES hub_priority (code) ON DELETE SET NULL,

    -- The blob's `responsible` held a discipline code, not a person, despite the name.
    discipline_code         text REFERENCES discipline (code) ON DELETE SET NULL,
    assignee_person_id      uuid REFERENCES person (id) ON DELETE SET NULL,

    start_date              date,
    due_date                date,
    comment                 text,

    -- Raw contenteditable HTML, assigned straight to innerHTML by the app with no
    -- sanitisation. Harmless in a single-user local file; stored XSS the moment two
    -- people share a database. Sanitised on write and again on render.
    description_html        text,

    done                    boolean NOT NULL DEFAULT false,

    -- Values for hub_field columns, keyed by field code. Entity-attribute-value here
    -- would buy nothing and cost a join on every row of every read.
    field_values            jsonb NOT NULL DEFAULT '{}'::jsonb,

    is_principle            boolean NOT NULL DEFAULT false,
    principle_created_at    date,
    source_meeting_item_id  uuid,
    sort_order              integer NOT NULL DEFAULT 0,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT hub_task_date_order CHECK (due_date IS NULL OR start_date IS NULL OR due_date >= start_date),
    CONSTRAINT hub_task_principle_dated CHECK (NOT is_principle OR principle_created_at IS NOT NULL)
);

CREATE INDEX hub_task_sheet_idx ON hub_task (sheet_id);
CREATE INDEX hub_task_group_idx ON hub_task (group_id);
CREATE INDEX hub_task_assignee_idx ON hub_task (assignee_person_id);

-- "What is overdue" was a client-side scan over a parsed blob. Here it is a query,
-- which is the point of the exercise.
CREATE INDEX hub_task_due_idx ON hub_task (due_date) WHERE NOT done;

CREATE INDEX hub_task_principle_idx ON hub_task (sheet_id) WHERE is_principle;

CREATE TRIGGER hub_task_set_updated_at
    BEFORE UPDATE ON hub_task
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- One consultant's own lane within a task: their ordered event chain and their open
-- subtasks. A view of the task's subtasks, not a second copy of them.
CREATE TABLE hub_task_lane (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id         uuid NOT NULL REFERENCES hub_task (id) ON DELETE CASCADE,
    discipline_code text REFERENCES discipline (code) ON DELETE SET NULL,
    name            text,
    sort_order      integer NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX hub_task_lane_task_idx ON hub_task_lane (task_id);

CREATE TRIGGER hub_task_lane_set_updated_at
    BEFORE UPDATE ON hub_task_lane
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE hub_subtask (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id                 uuid NOT NULL REFERENCES hub_task (id) ON DELETE CASCADE,
    parent_subtask_id       uuid REFERENCES hub_subtask (id) ON DELETE CASCADE,
    lane_id                 uuid REFERENCES hub_task_lane (id) ON DELETE SET NULL,
    title                   text NOT NULL CHECK (btrim(title) <> ''),
    done                    boolean NOT NULL DEFAULT false,
    discipline_code         text REFERENCES discipline (code) ON DELETE SET NULL,
    status_code             text REFERENCES hub_task_status (code) ON DELETE SET NULL,
    priority_code           text REFERENCES hub_priority (code) ON DELETE SET NULL,
    start_date              date,
    due_date                date,
    is_principle            boolean NOT NULL DEFAULT false,
    principle_created_at    date,

    -- Which event spawned this subtask, kept for provenance. A pointer, so it clears
    -- rather than cascading -- losing the event must not lose the work it created.
    from_event_id           uuid,

    sort_order              integer NOT NULL DEFAULT 0,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT hub_subtask_not_own_parent CHECK (id <> parent_subtask_id),
    CONSTRAINT hub_subtask_date_order CHECK (due_date IS NULL OR start_date IS NULL OR due_date >= start_date),
    CONSTRAINT hub_subtask_principle_dated CHECK (NOT is_principle OR principle_created_at IS NOT NULL)
);

CREATE INDEX hub_subtask_task_idx ON hub_subtask (task_id);
CREATE INDEX hub_subtask_parent_idx ON hub_subtask (parent_subtask_id);
CREATE INDEX hub_subtask_lane_idx ON hub_subtask (lane_id);
CREATE INDEX hub_subtask_due_idx ON hub_subtask (due_date) WHERE NOT done;

CREATE TRIGGER hub_subtask_set_updated_at
    BEFORE UPDATE ON hub_subtask
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Same shape as stage_reject_cycle in 001. Nesting reaches three levels in the real
-- data, and a cycle would hang whatever walks the tree rather than erroring.
CREATE FUNCTION hub_subtask_reject_cycle() RETURNS trigger AS $$
DECLARE
    ancestor uuid := NEW.parent_subtask_id;
    hops     integer := 0;
BEGIN
    WHILE ancestor IS NOT NULL LOOP
        IF ancestor = NEW.id THEN
            RAISE EXCEPTION 'subtask % would create a cycle', NEW.id
                USING ERRCODE = 'check_violation';
        END IF;
        hops := hops + 1;
        IF hops > 100 THEN
            RAISE EXCEPTION 'subtask tree deeper than 100 levels; refusing to walk further'
                USING ERRCODE = 'check_violation';
        END IF;
        SELECT parent_subtask_id INTO ancestor FROM hub_subtask WHERE id = ancestor;
    END LOOP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER hub_subtask_reject_cycle
    BEFORE INSERT OR UPDATE OF parent_subtask_id ON hub_subtask
    FOR EACH ROW WHEN (NEW.parent_subtask_id IS NOT NULL)
    EXECUTE FUNCTION hub_subtask_reject_cycle();

CREATE FUNCTION hub_subtask_reject_cross_task_parent() RETURNS trigger AS $$
DECLARE
    parent_task uuid;
BEGIN
    SELECT task_id INTO parent_task FROM hub_subtask WHERE id = NEW.parent_subtask_id;
    IF parent_task IS DISTINCT FROM NEW.task_id THEN
        RAISE EXCEPTION 'subtask parent belongs to a different task'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER hub_subtask_reject_cross_task_parent
    BEFORE INSERT OR UPDATE OF parent_subtask_id, task_id ON hub_subtask
    FOR EACH ROW WHEN (NEW.parent_subtask_id IS NOT NULL)
    EXECUTE FUNCTION hub_subtask_reject_cross_task_parent();

-- ---------------------------------------------------------------------------
-- The status log
--
-- One table for project_hub's event chains and planning_dashboard's cells, because
-- they are the same machine. Current status is derived from the latest row rather
-- than stored: a stored copy is a second source of truth that goes stale silently.
--
-- plan_cell_id has no foreign key yet -- hub_plan_cell arrives in 010, which adds it.
-- ---------------------------------------------------------------------------

CREATE TABLE hub_event (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id                     uuid REFERENCES hub_task (id) ON DELETE CASCADE,
    subtask_id                  uuid REFERENCES hub_subtask (id) ON DELETE CASCADE,
    plan_cell_id                uuid,

    status_code                 text NOT NULL REFERENCES hub_event_status (code) ON DELETE RESTRICT,
    event_date                  date NOT NULL,
    end_date                    date,

    -- Which round of the send-comment-revise cycle this belongs to. The planning board
    -- shows it; project_hub does not, and leaves it null.
    round                       integer CHECK (round IS NULL OR round > 0),

    -- Who the ball is with. A discipline rather than a person, which is how both apps
    -- actually work: the consultant firm owes the answer, not a named individual.
    assignee_discipline_code    text REFERENCES discipline (code) ON DELETE SET NULL,

    title                       text,
    note                        text,
    depends_on_event_id         uuid REFERENCES hub_event (id) ON DELETE SET NULL,
    created_by_person_id        uuid REFERENCES person (id) ON DELETE SET NULL,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT hub_event_one_owner
        CHECK (num_nonnulls(task_id, subtask_id, plan_cell_id) = 1),
    CONSTRAINT hub_event_not_own_dependency CHECK (id <> depends_on_event_id),
    CONSTRAINT hub_event_date_order CHECK (end_date IS NULL OR end_date >= event_date)
);

-- Ordering is (event_date, created_at) and not id: two events can share a date, and
-- the app already relies on creation order to break the tie. The seed data offsets
-- createdAt by one second per step for exactly this reason.
CREATE INDEX hub_event_task_idx ON hub_event (task_id, event_date DESC, created_at DESC)
    WHERE task_id IS NOT NULL;
CREATE INDEX hub_event_subtask_idx ON hub_event (subtask_id, event_date DESC, created_at DESC)
    WHERE subtask_id IS NOT NULL;
CREATE INDEX hub_event_cell_idx ON hub_event (plan_cell_id, event_date DESC, created_at DESC)
    WHERE plan_cell_id IS NOT NULL;
CREATE INDEX hub_event_depends_idx ON hub_event (depends_on_event_id);

CREATE TRIGGER hub_event_set_updated_at
    BEFORE UPDATE ON hub_event
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- from_event_id could not reference hub_event before it existed.
ALTER TABLE hub_subtask ADD CONSTRAINT hub_subtask_from_event_fk
    FOREIGN KEY (from_event_id) REFERENCES hub_event (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Attachments
--
-- The bytes go to a Supabase Storage bucket, not a column. The old model put base64
-- data URLs in the same blob as everything else, so a 3 MB PDF became 4.3 MB of
-- characters rewritten on every keystroke that triggered a save.
-- ---------------------------------------------------------------------------

CREATE TABLE hub_attachment (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id                 uuid NOT NULL REFERENCES hub_task (id) ON DELETE CASCADE,
    filename                text NOT NULL CHECK (btrim(filename) <> ''),
    mime_type               text,
    size_bytes              bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),

    -- The object key inside the bucket. Unique because two rows pointing at one object
    -- means deleting either orphans or breaks the other.
    storage_key             text NOT NULL UNIQUE,

    uploaded_by_person_id   uuid REFERENCES person (id) ON DELETE SET NULL,
    uploaded_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX hub_attachment_task_idx ON hub_attachment (task_id);

UPDATE app_meta SET value = '009', updated_at = now() WHERE key = 'schema_version';
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd /d/Coding/KkarcDB && dotnet test tests/KKarcDB.Data.Tests --filter HubWorkTests
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/009_hub_work.sql tests/KKarcDB.Data.Tests/HubWorkTests.cs
git commit -m "feat(db): add sheets, tasks, subtasks and the shared status log"
```

Use this commit body:

```
The shape this replaces stored subtasks twice: migrateTask() copied them
into a lane without removing them from task.subtasks, leaving 50 tasks with
identical id sets in both places. Here the task owns the subtask and the
lane is an attribute, which is what eight of the nine read sites already
assumed.

hub_event is one table for project_hub's event chains and
planning_dashboard's cells, because they are the same status machine. It
refuses to hold an event that belongs to nothing or to two things at once,
and current status is derived from the latest row rather than stored beside
it.

Attachments keep metadata and an object key; the bytes move to Supabase
Storage.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Task 5: Migration 010 — meetings, goals, milestones, principles, activity

**Files:**
- Create: `D:\Coding\KkarcDB\db\migrations\010_hub_meetings.sql`
- Test: `D:\Coding\KkarcDB\tests\KKarcDB.Data.Tests\HubMeetingTests.cs`

**Interfaces:**
- Consumes: `project`, `person`, `discipline`, `stage`; `hub_project_track`, `hub_task`, `hub_subtask` from Task 4; `hub_meeting_item_type` from Task 2
- Produces: `hub_meeting`, `hub_meeting_participant`, `hub_meeting_item`, `hub_licensing_goal`, `hub_licensing_milestone`, `hub_principle`, `hub_activity`; view `hub_principle_all(project_id, source, source_id, description, discipline_code, created_at)`; adds the deferred foreign key on `hub_task.source_meeting_item_id`

- [ ] **Step 1: Write the failing test**

Create `tests/KKarcDB.Data.Tests/HubMeetingTests.cs`:

```csharp
using Npgsql;
using Xunit;

namespace KKarcDB.Data.Tests;

/// <summary>
/// Minutes, and the records a line of minutes turns into.
/// </summary>
/// <remarks>
/// A line in the minutes can become a task, a goal, a milestone or a planning
/// principle, and the link back to it is what lets somebody ask "where did this come
/// from" six months later. The link is a pointer rather than ownership: deleting a
/// meeting must not delete the work it created, which is the one thing the old model
/// got right by accident because nothing was linked at all.
/// </remarks>
[Collection("database")]
public sealed class HubMeetingTests(DatabaseFixture fixture) : IAsyncLifetime
{
    public Task InitializeAsync() => fixture.ResetAsync();

    public Task DisposeAsync() => Task.CompletedTask;

    private async Task<NpgsqlConnection> OpenAsync()
    {
        var connection = new NpgsqlConnection(fixture.ConnectionString!);
        await connection.OpenAsync();
        return connection;
    }

    private static async Task<Guid> ScalarGuidAsync(
        NpgsqlConnection connection, string sql, params object[] parameters)
    {
        await using var command = new NpgsqlCommand(sql, connection);
        foreach (var parameter in parameters)
        {
            command.Parameters.AddWithValue(parameter);
        }

        return (Guid)(await command.ExecuteScalarAsync())!;
    }

    private static async Task<long> CountAsync(NpgsqlConnection connection, string sql)
    {
        await using var command = new NpgsqlCommand(sql, connection);
        return (long)(await command.ExecuteScalarAsync())!;
    }

    [SkippableFact]
    public async Task Deleting_a_meeting_keeps_the_task_it_created()
    {
        Skip.IfNot(fixture.Available, "KKARCDB_TEST_CONNECTION not set");

        await using var connection = await OpenAsync();

        var projectId = await ScalarGuidAsync(connection,
            "INSERT INTO project (year, sequence, name) VALUES (2026, 2, 'Scratch') RETURNING id");
        var sheetId = await ScalarGuidAsync(connection,
            "INSERT INTO hub_sheet (project_id, name) VALUES ($1, 'Sheet') RETURNING id", projectId);
        var meetingId = await ScalarGuidAsync(connection,
            """
            INSERT INTO hub_meeting (project_id, title, meeting_date)
            VALUES ($1, 'Weekly', '2026-03-01') RETURNING id
            """, projectId);
        var itemId = await ScalarGuidAsync(connection,
            """
            INSERT INTO hub_meeting_item (meeting_id, number, topic)
            VALUES ($1, '1', 'Chase the lab') RETURNING id
            """, meetingId);

        await using (var task = new NpgsqlCommand(
            """
            INSERT INTO hub_task (sheet_id, title, source_meeting_item_id)
            VALUES ($1, 'Chase the lab', $2)
            """, connection))
        {
            task.Parameters.AddWithValue(sheetId);
            task.Parameters.AddWithValue(itemId);
            await task.ExecuteNonQueryAsync();
        }

        await using (var delete = new NpgsqlCommand(
            "DELETE FROM hub_meeting WHERE id = $1", connection))
        {
            delete.Parameters.AddWithValue(meetingId);
            await delete.ExecuteNonQueryAsync();
        }

        Assert.Equal(1, await CountAsync(connection, "SELECT count(*) FROM hub_task"));
        Assert.Equal(1, await CountAsync(connection,
            "SELECT count(*) FROM hub_task WHERE source_meeting_item_id IS NULL"));
    }

    [SkippableFact]
    public async Task A_participant_is_either_a_person_or_a_written_name()
    {
        Skip.IfNot(fixture.Available, "KKARCDB_TEST_CONNECTION not set");

        await using var connection = await OpenAsync();

        var projectId = await ScalarGuidAsync(connection,
            "INSERT INTO project (year, sequence, name) VALUES (2026, 3, 'Scratch') RETURNING id");
        var meetingId = await ScalarGuidAsync(connection,
            """
            INSERT INTO hub_meeting (project_id, title, meeting_date)
            VALUES ($1, 'Kickoff', '2026-03-02') RETURNING id
            """, projectId);

        // Somebody who walked in and was written down by hand. The app allows this and
        // it must keep working, or the minutes stop matching who was in the room.
        await using (var guest = new NpgsqlCommand(
            """
            INSERT INTO hub_meeting_participant (meeting_id, display_name, role_text)
            VALUES ($1, 'A visiting engineer', 'guest')
            """, connection))
        {
            guest.Parameters.AddWithValue(meetingId);
            await guest.ExecuteNonQueryAsync();
        }

        await using var blank = new NpgsqlCommand(
            "INSERT INTO hub_meeting_participant (meeting_id, display_name) VALUES ($1, '   ')",
            connection);
        blank.Parameters.AddWithValue(meetingId);

        var error = await Assert.ThrowsAsync<PostgresException>(() => blank.ExecuteNonQueryAsync());
        Assert.Equal("23514", error.SqlState);
    }

    [SkippableFact]
    public async Task Principles_from_all_three_sources_read_as_one_list()
    {
        Skip.IfNot(fixture.Available, "KKARCDB_TEST_CONNECTION not set");

        await using var connection = await OpenAsync();

        var projectId = await ScalarGuidAsync(connection,
            "INSERT INTO project (year, sequence, name) VALUES (2026, 4, 'Scratch') RETURNING id");
        var sheetId = await ScalarGuidAsync(connection,
            "INSERT INTO hub_sheet (project_id, name) VALUES ($1, 'Sheet') RETURNING id", projectId);
        var taskId = await ScalarGuidAsync(connection,
            """
            INSERT INTO hub_task (sheet_id, title, is_principle, principle_created_at)
            VALUES ($1, 'Keep the courtyard open', true, '2026-01-10') RETURNING id
            """, sheetId);

        await using (var subtask = new NpgsqlCommand(
            """
            INSERT INTO hub_subtask (task_id, title, is_principle, principle_created_at)
            VALUES ($1, 'North facade stays brick', true, '2026-01-11')
            """, connection))
        {
            subtask.Parameters.AddWithValue(taskId);
            await subtask.ExecuteNonQueryAsync();
        }

        await using (var standalone = new NpgsqlCommand(
            """
            INSERT INTO hub_principle (project_id, description, created_at)
            VALUES ($1, 'No parking on the plaza', '2026-01-12')
            """, connection))
        {
            standalone.Parameters.AddWithValue(projectId);
            await standalone.ExecuteNonQueryAsync();
        }

        // The app shows one list. Three tables behind it must not become three lists.
        Assert.Equal(3, await CountAsync(connection, "SELECT count(*) FROM hub_principle_all"));
        Assert.Equal(3, await CountAsync(connection,
            "SELECT count(DISTINCT source) FROM hub_principle_all"));
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /d/Coding/KkarcDB && dotnet test tests/KKarcDB.Data.Tests --filter HubMeetingTests
```

Expected: FAIL with `relation "hub_meeting" does not exist`.

- [ ] **Step 3: Write the migration**

Create `db/migrations/010_hub_meetings.sql`:

```sql
-- 010 — minutes, and the records a line of minutes becomes.
--
-- A line in the minutes can be turned into a task, a goal, a milestone or a planning
-- principle. The link back is a pointer rather than ownership: deleting a meeting
-- must not delete the work it created, because the work outlives the conversation.

CREATE TABLE hub_meeting (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      uuid NOT NULL REFERENCES project (id) ON DELETE CASCADE,
    track_id        uuid REFERENCES hub_project_track (id) ON DELETE SET NULL,
    title           text NOT NULL CHECK (btrim(title) <> ''),
    meeting_date    date NOT NULL,

    -- Free text: the person who wrote the minutes is often not a system user, and a
    -- name typed once should not require creating an account for them.
    recorded_by     text,
    distribution    text,

    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX hub_meeting_project_idx ON hub_meeting (project_id, meeting_date DESC);
CREATE INDEX hub_meeting_track_idx ON hub_meeting (track_id);

CREATE TRIGGER hub_meeting_set_updated_at
    BEFORE UPDATE ON hub_meeting
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- person_id is null for somebody written in by hand, which the app allows and the
-- minutes depend on -- a visitor in the room is part of the record whether or not
-- they are in the register. display_name is therefore the required field, not the id.
CREATE TABLE hub_meeting_participant (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id      uuid NOT NULL REFERENCES hub_meeting (id) ON DELETE CASCADE,
    person_id       uuid REFERENCES person (id) ON DELETE SET NULL,
    display_name    text NOT NULL CHECK (btrim(display_name) <> ''),
    role_text       text,
    sort_order      integer NOT NULL DEFAULT 0
);

CREATE INDEX hub_meeting_participant_meeting_idx ON hub_meeting_participant (meeting_id);
CREATE INDEX hub_meeting_participant_person_idx ON hub_meeting_participant (person_id);

CREATE TABLE hub_meeting_item (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id                  uuid NOT NULL REFERENCES hub_meeting (id) ON DELETE CASCADE,

    -- The outline number as typed: '2', '2.1', '2.1.3'. Text rather than three integer
    -- columns because the printed minutes reproduce it exactly and renumbering is the
    -- author's decision, not the database's.
    number                      text NOT NULL CHECK (btrim(number) <> ''),

    topic                       text,
    assignee_discipline_code    text REFERENCES discipline (code) ON DELETE SET NULL,

    -- The blob used the string 'לידיעה' in the assignee field to mean "for
    -- information, nobody owns this". A sentinel inside a foreign key is how a list of
    -- disciplines acquires a row that is not a discipline.
    for_information             boolean NOT NULL DEFAULT false,

    start_date                  date,
    due_date                    date,
    item_type_code              text REFERENCES hub_meeting_item_type (code) ON DELETE SET NULL,

    -- What this line was turned into. Deliberately not a foreign key: the target is one
    -- of four tables, and four nullable columns to express "exactly one of these" would
    -- cost more than it protects. The ETL and the API both check it.
    linked_kind                 text CHECK (linked_kind IS NULL OR
                                            linked_kind IN ('task', 'subtask', 'goal', 'milestone', 'principle')),
    linked_id                   uuid,

    created_task_lane_id        uuid REFERENCES hub_task_lane (id) ON DELETE SET NULL,
    sort_order                  integer NOT NULL DEFAULT 0,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT hub_meeting_item_unique UNIQUE (meeting_id, number),
    CONSTRAINT hub_meeting_item_date_order
        CHECK (due_date IS NULL OR start_date IS NULL OR due_date >= start_date),
    CONSTRAINT hub_meeting_item_link_complete
        CHECK ((linked_kind IS NULL) = (linked_id IS NULL)),
    CONSTRAINT hub_meeting_item_information_is_unassigned
        CHECK (NOT for_information OR assignee_discipline_code IS NULL)
);

CREATE INDEX hub_meeting_item_meeting_idx ON hub_meeting_item (meeting_id, sort_order);
CREATE INDEX hub_meeting_item_linked_idx ON hub_meeting_item (linked_kind, linked_id)
    WHERE linked_id IS NOT NULL;

CREATE TRIGGER hub_meeting_item_set_updated_at
    BEFORE UPDATE ON hub_meeting_item
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Deferred from 009: hub_meeting_item did not exist yet. SET NULL, so losing the
-- meeting keeps the task and only forgets where it came from.
ALTER TABLE hub_task ADD CONSTRAINT hub_task_source_meeting_item_fk
    FOREIGN KEY (source_meeting_item_id) REFERENCES hub_meeting_item (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- The licensing track's own records
-- ---------------------------------------------------------------------------

CREATE TABLE hub_licensing_goal (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id              uuid NOT NULL REFERENCES project (id) ON DELETE CASCADE,
    title                   text NOT NULL CHECK (btrim(title) <> ''),
    target_date             date,
    done                    boolean NOT NULL DEFAULT false,
    source_meeting_item_id  uuid REFERENCES hub_meeting_item (id) ON DELETE SET NULL,
    sort_order              integer NOT NULL DEFAULT 0,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX hub_licensing_goal_project_idx ON hub_licensing_goal (project_id);

CREATE TRIGGER hub_licensing_goal_set_updated_at
    BEFORE UPDATE ON hub_licensing_goal
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE hub_licensing_milestone (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id              uuid NOT NULL REFERENCES project (id) ON DELETE CASCADE,

    -- Which stage this milestone belongs to, when it belongs to one. A pointer into
    -- the register's own stage tree rather than a copy of it.
    stage_id                uuid REFERENCES stage (id) ON DELETE SET NULL,

    title                   text NOT NULL CHECK (btrim(title) <> ''),
    milestone_date          date,
    start_date              date,
    status                  text NOT NULL DEFAULT 'not_started'
                            CHECK (status IN ('not_started', 'active', 'done', 'missed')),
    done                    boolean NOT NULL DEFAULT false,
    source_meeting_item_id  uuid REFERENCES hub_meeting_item (id) ON DELETE SET NULL,
    sort_order              integer NOT NULL DEFAULT 0,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX hub_licensing_milestone_project_idx ON hub_licensing_milestone (project_id, milestone_date);

CREATE TRIGGER hub_licensing_milestone_set_updated_at
    BEFORE UPDATE ON hub_licensing_milestone
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Planning principles
--
-- A principle can be a task, a subtask, or neither. Only the third needs a table --
-- flagging an existing task is a boolean on it, not a copy of it somewhere else.
-- The view below is what the app reads, so three sources stay one list.
-- ---------------------------------------------------------------------------

CREATE TABLE hub_principle (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id              uuid NOT NULL REFERENCES project (id) ON DELETE CASCADE,
    description             text NOT NULL CHECK (btrim(description) <> ''),
    discipline_code         text REFERENCES discipline (code) ON DELETE SET NULL,
    source_meeting_item_id  uuid REFERENCES hub_meeting_item (id) ON DELETE SET NULL,
    created_at              date NOT NULL DEFAULT CURRENT_DATE,
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX hub_principle_project_idx ON hub_principle (project_id);

CREATE TRIGGER hub_principle_set_updated_at
    BEFORE UPDATE ON hub_principle
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE VIEW hub_principle_all AS
SELECT
    p.project_id,
    'standalone'::text  AS source,
    p.id                AS source_id,
    p.description,
    p.discipline_code,
    p.created_at
FROM hub_principle p
UNION ALL
SELECT
    s.project_id,
    'task'::text,
    t.id,
    t.title,
    t.discipline_code,
    t.principle_created_at
FROM hub_task t
JOIN hub_sheet s ON s.id = t.sheet_id
WHERE t.is_principle
UNION ALL
SELECT
    s.project_id,
    'subtask'::text,
    sub.id,
    sub.title,
    sub.discipline_code,
    sub.principle_created_at
FROM hub_subtask sub
JOIN hub_task t ON t.id = sub.task_id
JOIN hub_sheet s ON s.id = t.sheet_id
WHERE sub.is_principle;

COMMENT ON VIEW hub_principle_all IS
    'Every planning principle, whether it is a flagged task, a flagged subtask, or a standalone note. The app shows one list; this is it.';

-- ---------------------------------------------------------------------------
-- Activity
--
-- Append-only, written by the API on every mutation. The home page shows a feed of it,
-- and it is also the answer to the schema spec's open question about per-row history:
-- not a full audit table, but enough to say who changed what and when.
-- ---------------------------------------------------------------------------

CREATE TABLE hub_activity (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      uuid NOT NULL REFERENCES project (id) ON DELETE CASCADE,
    actor_person_id uuid REFERENCES person (id) ON DELETE SET NULL,
    entity_kind     text NOT NULL CHECK (btrim(entity_kind) <> ''),

    -- Not a foreign key: it points into whichever table entity_kind names, and the row
    -- it names may be gone. The feed says a thing happened, which stays true afterwards.
    entity_id       uuid,

    verb            text NOT NULL CHECK (verb IN ('created', 'updated', 'deleted', 'completed', 'reopened')),
    summary_he      text,
    summary_en      text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX hub_activity_project_idx ON hub_activity (project_id, created_at DESC);
CREATE INDEX hub_activity_entity_idx ON hub_activity (entity_kind, entity_id);

UPDATE app_meta SET value = '010', updated_at = now() WHERE key = 'schema_version';
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd /d/Coding/KkarcDB && dotnet test tests/KKarcDB.Data.Tests --filter HubMeetingTests
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/010_hub_meetings.sql tests/KKarcDB.Data.Tests/HubMeetingTests.cs
git commit -m "feat(db): add meetings, goals, milestones, principles and activity"
```

Use this commit body:

```
A line in the minutes can become a task, a goal, a milestone or a planning
principle. The link back to it is a pointer and not ownership: deleting a
meeting keeps the work it created and only forgets where it came from.

The blob used the string 'for information' inside the assignee field to
mean nobody owns a line, which is how a list of disciplines acquires a row
that is not a discipline. It becomes a boolean.

A principle can be a flagged task, a flagged subtask, or a standalone note.
Only the third needs a table; hub_principle_all unions the three so the app
still reads one list.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Task 6: Migration 011 — the planning board

**Files:**
- Create: `D:\Coding\KkarcDB\db\migrations\011_hub_planning.sql`
- Test: `D:\Coding\KkarcDB\tests\KKarcDB.Data.Tests\HubPlanningTests.cs`

**Interfaces:**
- Consumes: `project`, `project_participant`; `hub_event` from Task 4; `hub_event_status` from Task 2
- Produces: `hub_plan_board`, `hub_plan_building`, `hub_plan_doc_type`, `hub_plan_consultant`, `hub_plan_cell`, `hub_plan_kpi`; the foreign key on `hub_event.plan_cell_id`; view `hub_plan_cell_status(cell_id, board_id, building_id, consultant_id, doc_type_id, status_code, round, event_date)`

- [ ] **Step 1: Write the failing test**

Create `tests/KKarcDB.Data.Tests/HubPlanningTests.cs`:

```csharp
using Npgsql;
using Xunit;

namespace KKarcDB.Data.Tests;

/// <summary>
/// The planning board: buildings against consultants against document types.
/// </summary>
/// <remarks>
/// The old model keyed cells by the string "buildingId|consultantId|docTypeId", which
/// no database and no reader can check. The triple becomes three foreign keys and a
/// unique constraint, and the cell's status stops being stored beside its events.
/// </remarks>
[Collection("database")]
public sealed class HubPlanningTests(DatabaseFixture fixture) : IAsyncLifetime
{
    public Task InitializeAsync() => fixture.ResetAsync();

    public Task DisposeAsync() => Task.CompletedTask;

    private async Task<NpgsqlConnection> OpenAsync()
    {
        var connection = new NpgsqlConnection(fixture.ConnectionString!);
        await connection.OpenAsync();
        return connection;
    }

    private static async Task<Guid> ScalarGuidAsync(
        NpgsqlConnection connection, string sql, params object[] parameters)
    {
        await using var command = new NpgsqlCommand(sql, connection);
        foreach (var parameter in parameters)
        {
            command.Parameters.AddWithValue(parameter);
        }

        return (Guid)(await command.ExecuteScalarAsync())!;
    }

    private readonly record struct Board(Guid BoardId, Guid CellId);

    private static async Task<Board> ScaffoldBoardAsync(NpgsqlConnection connection, int sequence)
    {
        var projectId = await ScalarGuidAsync(connection,
            "INSERT INTO project (year, sequence, name) VALUES (2026, $1, 'Scratch') RETURNING id",
            sequence);
        var firmId = await ScalarGuidAsync(connection,
            "INSERT INTO firm (name, kind) VALUES ('Scratch Engineers', 'consultant') RETURNING id");
        var participantId = await ScalarGuidAsync(connection,
            """
            INSERT INTO project_participant (project_id, firm_id, discipline_code)
            VALUES ($1, $2, 'structural') RETURNING id
            """, projectId, firmId);

        var boardId = await ScalarGuidAsync(connection,
            "INSERT INTO hub_plan_board (project_id, name) VALUES ($1, 'Board') RETURNING id",
            projectId);
        var buildingId = await ScalarGuidAsync(connection,
            "INSERT INTO hub_plan_building (board_id, name) VALUES ($1, 'Block A') RETURNING id",
            boardId);
        var docTypeId = await ScalarGuidAsync(connection,
            "INSERT INTO hub_plan_doc_type (board_id, name) VALUES ($1, 'Drawings') RETURNING id",
            boardId);
        var consultantId = await ScalarGuidAsync(connection,
            """
            INSERT INTO hub_plan_consultant (board_id, project_participant_id)
            VALUES ($1, $2) RETURNING id
            """, boardId, participantId);

        var cellId = await ScalarGuidAsync(connection,
            """
            INSERT INTO hub_plan_cell (board_id, building_id, consultant_id, doc_type_id)
            VALUES ($1, $2, $3, $4) RETURNING id
            """, boardId, buildingId, consultantId, docTypeId);

        return new Board(boardId, cellId);
    }

    [SkippableFact]
    public async Task One_cell_per_building_consultant_and_document_type()
    {
        Skip.IfNot(fixture.Available, "KKARCDB_TEST_CONNECTION not set");

        await using var connection = await OpenAsync();
        var board = await ScaffoldBoardAsync(connection, 10);

        await using var duplicate = new NpgsqlCommand(
            """
            INSERT INTO hub_plan_cell (board_id, building_id, consultant_id, doc_type_id)
            SELECT board_id, building_id, consultant_id, doc_type_id
            FROM hub_plan_cell WHERE id = $1
            """, connection);
        duplicate.Parameters.AddWithValue(board.CellId);

        var error = await Assert.ThrowsAsync<PostgresException>(() => duplicate.ExecuteNonQueryAsync());
        Assert.Equal("23505", error.SqlState);
    }

    [SkippableFact]
    public async Task A_cells_status_is_the_latest_event_not_a_stored_copy()
    {
        Skip.IfNot(fixture.Available, "KKARCDB_TEST_CONNECTION not set");

        await using var connection = await OpenAsync();
        var board = await ScaffoldBoardAsync(connection, 11);

        // A full round trip: work, sent, awaiting response, comments back, work again.
        // The two rows sharing 2026-04-01 are why created_at breaks the tie -- the app
        // creates a milestone and its follower on the same day, in order.
        await using (var events = new NpgsqlCommand(
            """
            INSERT INTO hub_event (plan_cell_id, status_code, event_date, round, created_at) VALUES
                ($1, 'progress', '2026-03-01', 1, '2026-03-01T09:00:00Z'),
                ($1, 'sent',     '2026-04-01', 1, '2026-04-01T09:00:00Z'),
                ($1, 'response', '2026-04-01', 1, '2026-04-01T09:00:01Z'),
                ($1, 'comments', '2026-05-01', 1, '2026-05-01T09:00:00Z'),
                ($1, 'progress', '2026-05-01', 2, '2026-05-01T09:00:01Z')
            """, connection))
        {
            events.Parameters.AddWithValue(board.CellId);
            await events.ExecuteNonQueryAsync();
        }

        await using var read = new NpgsqlCommand(
            "SELECT status_code, round FROM hub_plan_cell_status WHERE cell_id = $1", connection);
        read.Parameters.AddWithValue(board.CellId);

        await using var reader = await read.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        Assert.Equal("progress", reader.GetString(0));
        Assert.Equal(2, reader.GetInt32(1));

        // Exactly one row per cell, or the board draws a cell twice.
        Assert.False(await reader.ReadAsync());
    }

    [SkippableFact]
    public async Task A_cell_with_no_events_still_appears_as_missing()
    {
        Skip.IfNot(fixture.Available, "KKARCDB_TEST_CONNECTION not set");

        await using var connection = await OpenAsync();
        var board = await ScaffoldBoardAsync(connection, 12);

        // An empty cell is the normal starting state of the whole board. If the view
        // inner-joined its events the board would open blank rather than all-missing.
        await using var read = new NpgsqlCommand(
            "SELECT status_code FROM hub_plan_cell_status WHERE cell_id = $1", connection);
        read.Parameters.AddWithValue(board.CellId);

        Assert.Equal("missing", (string)(await read.ExecuteScalarAsync())!);
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /d/Coding/KkarcDB && dotnet test tests/KKarcDB.Data.Tests --filter HubPlanningTests
```

Expected: FAIL with `relation "hub_plan_board" does not exist`.

- [ ] **Step 3: Write the migration**

Create `db/migrations/011_hub_planning.sql`:

```sql
-- 011 — the planning board.
--
-- planning_dashboard is a grid: buildings down, consultants across, each consultant
-- split by document type. It kept its cells in an object keyed by the string
-- "buildingId|consultantId|docTypeId", which nothing can check and no join can use.
-- Here the triple is three foreign keys, and the events live in hub_event with
-- project_hub's, because both apps implement the same status machine.

CREATE TABLE hub_plan_board (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      uuid NOT NULL REFERENCES project (id) ON DELETE CASCADE,
    name            text NOT NULL CHECK (btrim(name) <> ''),

    -- Which axis shows what. Free text because the app offers a fixed pair today and
    -- will offer more; a CHECK here would make adding a layout a migration.
    view_rows       text NOT NULL DEFAULT 'buildings',
    view_cols       text NOT NULL DEFAULT 'consultants_x_docs',

    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX hub_plan_board_project_idx ON hub_plan_board (project_id);

CREATE TRIGGER hub_plan_board_set_updated_at
    BEFORE UPDATE ON hub_plan_board
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE hub_plan_building (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id    uuid NOT NULL REFERENCES hub_plan_board (id) ON DELETE CASCADE,
    name        text NOT NULL CHECK (btrim(name) <> ''),
    sort_order  integer NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX hub_plan_building_board_idx ON hub_plan_building (board_id, sort_order);

CREATE TRIGGER hub_plan_building_set_updated_at
    BEFORE UPDATE ON hub_plan_building
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE hub_plan_doc_type (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id    uuid NOT NULL REFERENCES hub_plan_board (id) ON DELETE CASCADE,
    name        text NOT NULL CHECK (btrim(name) <> ''),
    sort_order  integer NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX hub_plan_doc_type_board_idx ON hub_plan_doc_type (board_id, sort_order);

CREATE TRIGGER hub_plan_doc_type_set_updated_at
    BEFORE UPDATE ON hub_plan_doc_type
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A column on the board is a firm engaged on this project, not a free-text company
-- name. The old model stored the name, so the same consultant appeared here and in
-- project_hub as two unrelated strings that drifted apart on the first typo.
CREATE TABLE hub_plan_consultant (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id                uuid NOT NULL REFERENCES hub_plan_board (id) ON DELETE CASCADE,
    project_participant_id  uuid NOT NULL REFERENCES project_participant (id) ON DELETE CASCADE,
    sort_order              integer NOT NULL DEFAULT 0,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT hub_plan_consultant_unique UNIQUE (board_id, project_participant_id)
);

CREATE INDEX hub_plan_consultant_board_idx ON hub_plan_consultant (board_id, sort_order);

CREATE TRIGGER hub_plan_consultant_set_updated_at
    BEFORE UPDATE ON hub_plan_consultant
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE hub_plan_cell (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id        uuid NOT NULL REFERENCES hub_plan_board (id) ON DELETE CASCADE,
    building_id     uuid NOT NULL REFERENCES hub_plan_building (id) ON DELETE CASCADE,
    consultant_id   uuid NOT NULL REFERENCES hub_plan_consultant (id) ON DELETE CASCADE,
    doc_type_id     uuid NOT NULL REFERENCES hub_plan_doc_type (id) ON DELETE CASCADE,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT hub_plan_cell_unique UNIQUE (building_id, consultant_id, doc_type_id)
);

CREATE INDEX hub_plan_cell_board_idx ON hub_plan_cell (board_id);

-- Deferred from 009: hub_plan_cell did not exist yet.
ALTER TABLE hub_event ADD CONSTRAINT hub_event_plan_cell_fk
    FOREIGN KEY (plan_cell_id) REFERENCES hub_plan_cell (id) ON DELETE CASCADE;

CREATE TABLE hub_plan_kpi (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id                uuid NOT NULL REFERENCES hub_plan_board (id) ON DELETE CASCADE,
    name                    text NOT NULL CHECK (btrim(name) <> ''),
    filter_status_codes     text[] NOT NULL DEFAULT '{}',
    filter_doc_type_ids     uuid[] NOT NULL DEFAULT '{}',
    sort_order              integer NOT NULL DEFAULT 0,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX hub_plan_kpi_board_idx ON hub_plan_kpi (board_id, sort_order);

CREATE TRIGGER hub_plan_kpi_set_updated_at
    BEFORE UPDATE ON hub_plan_kpi
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Every cell with its current status, derived rather than stored.
--
-- LEFT JOIN and not an inner one: an untouched cell is the normal starting state of a
-- whole board, and it reads as 'missing' exactly as the app has always drawn it. An
-- inner join would open a new board blank instead of full of dashes.
--
-- The ordering is (event_date, created_at) because two events routinely share a date:
-- reaching 'sent' creates 'response' the same day, and creation order is the only
-- thing that separates them.
CREATE VIEW hub_plan_cell_status AS
SELECT DISTINCT ON (c.id)
    c.id            AS cell_id,
    c.board_id,
    c.building_id,
    c.consultant_id,
    c.doc_type_id,
    COALESCE(e.status_code, 'missing')   AS status_code,
    COALESCE(e.round, 1)                 AS round,
    e.event_date
FROM hub_plan_cell c
LEFT JOIN hub_event e ON e.plan_cell_id = c.id
ORDER BY c.id, e.event_date DESC NULLS LAST, e.created_at DESC NULLS LAST;

COMMENT ON VIEW hub_plan_cell_status IS
    'One row per cell with the status its most recent event gives it. Cells with no events read as missing, which is how a new board looks.';

UPDATE app_meta SET value = '011', updated_at = now() WHERE key = 'schema_version';
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd /d/Coding/KkarcDB && dotnet test tests/KKarcDB.Data.Tests --filter HubPlanningTests
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/011_hub_planning.sql tests/KKarcDB.Data.Tests/HubPlanningTests.cs
git commit -m "feat(db): add the planning board"
```

Use this commit body:

```
planning_dashboard keyed its cells by the string
"buildingId|consultantId|docTypeId", which nothing can check and no join
can use. The triple becomes three foreign keys with a unique constraint.

A column on the board is now a firm engaged on the project rather than a
typed company name, so the same consultant stops appearing here and in
project_hub as two strings that drift apart on the first typo.

Cell status is a view over hub_event rather than a stored column. It left
joins, so an untouched cell reads as missing and a new board opens full of
dashes rather than blank.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Task 7: Migration 012 — per-user state

The schema spec's Finding 2: the old model stored one person's collapsed groups,
hidden columns and column widths on the shared row. Sharing that database means the UI
changes under you because a colleague clicked something, which is the most confusing
class of multi-user bug.

**Files:**
- Create: `D:\Coding\KkarcDB\db\migrations\012_hub_user_state.sql`
- Test: `D:\Coding\KkarcDB\tests\KKarcDB.Data.Tests\HubUserStateTests.cs`

**Interfaces:**
- Consumes: `person`, `project`; `hub_sheet`, `hub_plan_board` from Tasks 4 and 6
- Produces: `hub_user_pref(person_id, scope_kind, scope_id, prefs jsonb)` unique on the triple; `hub_saved_view(project_id, sheet_id, kind, name, owner_person_id, is_shared, definition jsonb)`

- [ ] **Step 1: Write the failing test**

Create `tests/KKarcDB.Data.Tests/HubUserStateTests.cs`:

```csharp
using Npgsql;
using Xunit;

namespace KKarcDB.Data.Tests;

/// <summary>
/// State that belongs to one person, kept where it cannot affect anybody else.
/// </summary>
/// <remarks>
/// Column widths, hidden columns, collapsed groups and saved views were all stored on
/// shared rows. The failure that produces is not data loss: it is a colleague resizing
/// a column and everybody's layout moving. Two people must be able to hold different
/// preferences for the same sheet, which is what these tests check.
/// </remarks>
[Collection("database")]
public sealed class HubUserStateTests(DatabaseFixture fixture) : IAsyncLifetime
{
    public Task InitializeAsync() => fixture.ResetAsync();

    public Task DisposeAsync() => Task.CompletedTask;

    private async Task<NpgsqlConnection> OpenAsync()
    {
        var connection = new NpgsqlConnection(fixture.ConnectionString!);
        await connection.OpenAsync();
        return connection;
    }

    private static async Task<Guid> ScalarGuidAsync(
        NpgsqlConnection connection, string sql, params object[] parameters)
    {
        await using var command = new NpgsqlCommand(sql, connection);
        foreach (var parameter in parameters)
        {
            command.Parameters.AddWithValue(parameter);
        }

        return (Guid)(await command.ExecuteScalarAsync())!;
    }

    [SkippableFact]
    public async Task Two_people_hold_different_preferences_for_one_sheet()
    {
        Skip.IfNot(fixture.Available, "KKARCDB_TEST_CONNECTION not set");

        await using var connection = await OpenAsync();

        var projectId = await ScalarGuidAsync(connection,
            "INSERT INTO project (year, sequence, name) VALUES (2026, 20, 'Scratch') RETURNING id");
        var sheetId = await ScalarGuidAsync(connection,
            "INSERT INTO hub_sheet (project_id, name) VALUES ($1, 'Sheet') RETURNING id", projectId);
        var firstPerson = await ScalarGuidAsync(connection,
            "INSERT INTO person (name) VALUES ('First') RETURNING id");
        var secondPerson = await ScalarGuidAsync(connection,
            "INSERT INTO person (name) VALUES ('Second') RETURNING id");

        await using (var insert = new NpgsqlCommand(
            """
            INSERT INTO hub_user_pref (person_id, scope_kind, scope_id, prefs) VALUES
                ($1, 'sheet', $3, '{"colWidths": {"__name": 400}}'::jsonb),
                ($2, 'sheet', $3, '{"colWidths": {"__name": 200}}'::jsonb)
            """, connection))
        {
            insert.Parameters.AddWithValue(firstPerson);
            insert.Parameters.AddWithValue(secondPerson);
            insert.Parameters.AddWithValue(sheetId);
            await insert.ExecuteNonQueryAsync();
        }

        await using var read = new NpgsqlCommand(
            """
            SELECT prefs -> 'colWidths' ->> '__name' FROM hub_user_pref
            WHERE person_id = $1 AND scope_kind = 'sheet' AND scope_id = $2
            """, connection);
        read.Parameters.AddWithValue(firstPerson);
        read.Parameters.AddWithValue(sheetId);

        Assert.Equal("400", (string)(await read.ExecuteScalarAsync())!);
    }

    [SkippableFact]
    public async Task One_person_holds_one_row_per_scope()
    {
        Skip.IfNot(fixture.Available, "KKARCDB_TEST_CONNECTION not set");

        await using var connection = await OpenAsync();

        var personId = await ScalarGuidAsync(connection,
            "INSERT INTO person (name) VALUES ('Only') RETURNING id");

        // Global scope has no scope_id. A plain UNIQUE would not catch a duplicate,
        // because in SQL one null never equals another -- hence the partial index.
        await using (var first = new NpgsqlCommand(
            "INSERT INTO hub_user_pref (person_id, scope_kind, prefs) VALUES ($1, 'global', '{}'::jsonb)",
            connection))
        {
            first.Parameters.AddWithValue(personId);
            await first.ExecuteNonQueryAsync();
        }

        await using var second = new NpgsqlCommand(
            "INSERT INTO hub_user_pref (person_id, scope_kind, prefs) VALUES ($1, 'global', '{}'::jsonb)",
            connection);
        second.Parameters.AddWithValue(personId);

        var error = await Assert.ThrowsAsync<PostgresException>(() => second.ExecuteNonQueryAsync());
        Assert.Equal("23505", error.SqlState);
    }

    [SkippableFact]
    public async Task A_scoped_preference_needs_its_scope()
    {
        Skip.IfNot(fixture.Available, "KKARCDB_TEST_CONNECTION not set");

        await using var connection = await OpenAsync();

        var personId = await ScalarGuidAsync(connection,
            "INSERT INTO person (name) VALUES ('Only') RETURNING id");

        await using var command = new NpgsqlCommand(
            "INSERT INTO hub_user_pref (person_id, scope_kind, prefs) VALUES ($1, 'sheet', '{}'::jsonb)",
            connection);
        command.Parameters.AddWithValue(personId);

        var error = await Assert.ThrowsAsync<PostgresException>(() => command.ExecuteNonQueryAsync());
        Assert.Equal("23514", error.SqlState);
    }

    [SkippableFact]
    public async Task Losing_the_owner_makes_a_shared_view_an_orphan_not_a_deletion()
    {
        Skip.IfNot(fixture.Available, "KKARCDB_TEST_CONNECTION not set");

        await using var connection = await OpenAsync();

        var projectId = await ScalarGuidAsync(connection,
            "INSERT INTO project (year, sequence, name) VALUES (2026, 21, 'Scratch') RETURNING id");
        var personId = await ScalarGuidAsync(connection,
            "INSERT INTO person (name) VALUES ('Leaver') RETURNING id");

        await using (var view = new NpgsqlCommand(
            """
            INSERT INTO hub_saved_view (project_id, kind, name, owner_person_id, is_shared, definition)
            VALUES ($1, 'gantt', 'Everything by discipline', $2, true, '{}'::jsonb)
            """, connection))
        {
            view.Parameters.AddWithValue(projectId);
            view.Parameters.AddWithValue(personId);
            await view.ExecuteNonQueryAsync();
        }

        // Somebody leaves the practice. A view they published to the project is the
        // project's, and must not disappear with their account.
        await using (var delete = new NpgsqlCommand("DELETE FROM person WHERE id = $1", connection))
        {
            delete.Parameters.AddWithValue(personId);
            await delete.ExecuteNonQueryAsync();
        }

        await using var count = new NpgsqlCommand(
            "SELECT count(*) FROM hub_saved_view WHERE owner_person_id IS NULL AND is_shared", connection);

        Assert.Equal(1L, (long)(await count.ExecuteScalarAsync())!);
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /d/Coding/KkarcDB && dotnet test tests/KKarcDB.Data.Tests --filter HubUserStateTests
```

Expected: FAIL with `relation "hub_user_pref" does not exist`.

- [ ] **Step 3: Write the migration**

Create `db/migrations/012_hub_user_state.sql`:

```sql
-- 012 — state that belongs to one person.
--
-- The old model stored collapsed groups, hidden columns, column order and widths, and
-- saved views on the shared row. Expand/collapse of tasks had already been given
-- per-user treatment in a separate localStorage key; the rest had not.
--
-- The bug that produces is not lost data. It is a colleague resizing a column and
-- everybody's layout moving -- the UI changing under you because somebody else
-- clicked something, which is the hardest kind of multi-user problem to report.

CREATE TABLE hub_user_pref (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id   uuid NOT NULL REFERENCES person (id) ON DELETE CASCADE,

    scope_kind  text NOT NULL CHECK (scope_kind IN ('global', 'project', 'sheet', 'board')),

    -- Null only for the global scope. Not a foreign key: it points at a project, a
    -- sheet or a board depending on scope_kind, and a preference outliving its sheet
    -- costs nothing while four nullable columns would cost every read.
    scope_id    uuid,

    -- Whatever the client wants to remember for this scope: hiddenCols, colOrder,
    -- colWidths, collapsed group ids, expanded task ids, ovHeights, the Gantt label
    -- width, appLang. Deliberately opaque -- the database has no opinion about a
    -- column width, and giving it one would make every new preference a migration.
    prefs       jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT hub_user_pref_scope_complete
        CHECK ((scope_kind = 'global') = (scope_id IS NULL))
);

-- Two partial indexes rather than one UNIQUE, because a UNIQUE over a nullable column
-- does not constrain the null case: in SQL one null never equals another, so a plain
-- constraint would let a person accumulate any number of global rows.
CREATE UNIQUE INDEX hub_user_pref_scoped_unique
    ON hub_user_pref (person_id, scope_kind, scope_id) WHERE scope_id IS NOT NULL;

CREATE UNIQUE INDEX hub_user_pref_global_unique
    ON hub_user_pref (person_id) WHERE scope_id IS NULL;

CREATE TRIGGER hub_user_pref_set_updated_at
    BEFORE UPDATE ON hub_user_pref
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A saved list, Gantt or combined view. Personal unless published: is_shared is what
-- turns one person's filter into the project's.
CREATE TABLE hub_saved_view (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      uuid NOT NULL REFERENCES project (id) ON DELETE CASCADE,
    sheet_id        uuid REFERENCES hub_sheet (id) ON DELETE CASCADE,
    kind            text NOT NULL CHECK (kind IN ('list', 'gantt', 'combined')),
    name            text NOT NULL CHECK (btrim(name) <> ''),

    -- SET NULL rather than CASCADE: a view somebody published to the project belongs
    -- to the project, and must not leave when they do.
    owner_person_id uuid REFERENCES person (id) ON DELETE SET NULL,

    is_shared       boolean NOT NULL DEFAULT false,
    definition      jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX hub_saved_view_project_idx ON hub_saved_view (project_id, kind);
CREATE INDEX hub_saved_view_owner_idx ON hub_saved_view (owner_person_id);

CREATE TRIGGER hub_saved_view_set_updated_at
    BEFORE UPDATE ON hub_saved_view
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

UPDATE app_meta SET value = '012', updated_at = now() WHERE key = 'schema_version';
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd /d/Coding/KkarcDB && dotnet test tests/KKarcDB.Data.Tests --filter HubUserStateTests
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Run the whole suite**

```bash
cd /d/Coding/KkarcDB && dotnet test
```

Expected: 216 passing (202 original + 7 + 4 + 3 + 3 + 4), 0 failing.

- [ ] **Step 6: Commit**

```bash
git add db/migrations/012_hub_user_state.sql tests/KKarcDB.Data.Tests/HubUserStateTests.cs
git commit -m "feat(db): move per-user UI state off the shared rows"
```

Use this commit body:

```
Collapsed groups, hidden columns, column order and widths, and saved views
were all stored on rows everybody reads. Shared between two people that
produces the most confusing class of bug there is: the interface changing
under you because a colleague clicked something.

hub_user_pref is keyed by person and scope, with two partial unique indexes
rather than one constraint -- a UNIQUE over a nullable scope would not
constrain the global case at all, because one null never equals another.

A saved view published to the project survives its author leaving.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Task 8: Extend verify.sql

`db/verify.sql` applies the migrations to a scratch database and exercises the queries
the register exists to answer. The hub tables need the same treatment, or a broken
migration is only found by the API failing in Azure.

**Files:**
- Modify: `D:\Coding\KkarcDB\db\verify.sql` (append before the final `ROLLBACK`)

**Interfaces:**
- Consumes: every table from Tasks 2–7
- Produces: nothing; it rolls back

- [ ] **Step 1: Find the anchor**

```bash
cd /d/Coding/KkarcDB && tail -5 db/verify.sql
```

Expected: the file ends with `ROLLBACK;` — the whole script is one transaction that
changes nothing. The new section goes immediately before it.

- [ ] **Step 2: Append the hub section before `ROLLBACK;`**

```sql
-- ---------------------------------------------------------------------------
-- The dashboards' corner of the schema
--
-- Project names above are real folders from the firm's drives; everything here is
-- invented, per the rule about fixtures.
-- ---------------------------------------------------------------------------

INSERT INTO hub_project_profile (project_id, type, area_m2, priority_code, color) VALUES
    ('bbbbbbbb-0000-0000-0000-000000000003', 'Public institution', 3200, 'high', '#2563EB');

INSERT INTO hub_discipline_hours (project_id, discipline_code, budget_hours, actual_hours) VALUES
    ('bbbbbbbb-0000-0000-0000-000000000003', 'architecture', 900, 680),
    ('bbbbbbbb-0000-0000-0000-000000000003', 'structural',   280, 120);

INSERT INTO hub_project_track (id, project_id, code, name_en, sort_order) VALUES
    ('dddddddd-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000003', 'licensing', 'Licensing', 10);

INSERT INTO hub_sheet (id, project_id, track_id, name) VALUES
    ('dddddddd-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000003',
     'dddddddd-0000-0000-0000-000000000001', 'Preconditions');

INSERT INTO hub_group (id, sheet_id, name) VALUES
    ('dddddddd-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000002', 'Permit approvals');

INSERT INTO hub_task (id, sheet_id, group_id, title, status_code, priority_code,
                      discipline_code, start_date, due_date) VALUES
    ('dddddddd-0000-0000-0000-000000000004', 'dddddddd-0000-0000-0000-000000000002',
     'dddddddd-0000-0000-0000-000000000003', 'Laboratory approval', 'in_progress', 'high',
     'green', '2026-02-15', '2026-07-30');

-- Three levels, which is what the real data reaches.
INSERT INTO hub_subtask (id, task_id, parent_subtask_id, title, discipline_code, due_date) VALUES
    ('dddddddd-0000-0000-0000-000000000005', 'dddddddd-0000-0000-0000-000000000004', NULL,
     'Technical booklet', 'architecture', '2026-04-12'),
    ('dddddddd-0000-0000-0000-000000000006', 'dddddddd-0000-0000-0000-000000000004',
     'dddddddd-0000-0000-0000-000000000005', 'Facade sheets', 'architecture', '2026-04-10'),
    ('dddddddd-0000-0000-0000-000000000007', 'dddddddd-0000-0000-0000-000000000004',
     'dddddddd-0000-0000-0000-000000000006', 'Glazing schedule', 'architecture', '2026-04-08');

-- A full round trip through the status machine, with two events sharing a date.
INSERT INTO hub_event (task_id, status_code, event_date, assignee_discipline_code, created_at) VALUES
    ('dddddddd-0000-0000-0000-000000000004', 'progress', '2026-03-01', 'green', '2026-03-01T09:00:00Z'),
    ('dddddddd-0000-0000-0000-000000000004', 'sent',     '2026-04-01', 'green', '2026-04-01T09:00:00Z'),
    ('dddddddd-0000-0000-0000-000000000004', 'response', '2026-04-01', 'green', '2026-04-01T09:00:01Z');

DO $$
DECLARE
    latest text;
BEGIN
    SELECT status_code INTO latest
    FROM hub_event
    WHERE task_id = 'dddddddd-0000-0000-0000-000000000004'
    ORDER BY event_date DESC, created_at DESC
    LIMIT 1;

    IF latest <> 'response' THEN
        RAISE EXCEPTION 'the latest event should be response, got %', latest;
    END IF;
END $$;

-- An event belonging to nothing is refused.
DO $$
BEGIN
    INSERT INTO hub_event (status_code, event_date) VALUES ('progress', '2026-01-01');
    RAISE EXCEPTION 'an event with no owner should have been refused';
EXCEPTION
    WHEN check_violation THEN NULL;
END $$;

-- A subtask cannot be its own ancestor.
DO $$
BEGIN
    UPDATE hub_subtask
    SET parent_subtask_id = 'dddddddd-0000-0000-0000-000000000006'
    WHERE id = 'dddddddd-0000-0000-0000-000000000005';
    RAISE EXCEPTION 'a subtask cycle should have been refused';
EXCEPTION
    WHEN check_violation THEN NULL;
END $$;

-- Minutes, and a line that became the task above.
INSERT INTO hub_meeting (id, project_id, title, meeting_date, recorded_by) VALUES
    ('dddddddd-0000-0000-0000-000000000008', 'bbbbbbbb-0000-0000-0000-000000000003',
     'Weekly coordination', '2026-02-10', 'Internal Architect');

INSERT INTO hub_meeting_participant (meeting_id, person_id, display_name, role_text) VALUES
    ('dddddddd-0000-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000001',
     'Internal Architect', 'project architect'),
    ('dddddddd-0000-0000-0000-000000000008', NULL, 'A visiting engineer', 'guest');

INSERT INTO hub_meeting_item (id, meeting_id, number, topic, item_type_code,
                              linked_kind, linked_id, due_date) VALUES
    ('dddddddd-0000-0000-0000-000000000009', 'dddddddd-0000-0000-0000-000000000008',
     '1', 'Chase the laboratory', 'task', 'task',
     'dddddddd-0000-0000-0000-000000000004', '2026-03-01'),
    ('dddddddd-0000-0000-0000-00000000000a', 'dddddddd-0000-0000-0000-000000000008',
     '1.1', 'Noted for the record', 'info', NULL, NULL, NULL);

UPDATE hub_task SET source_meeting_item_id = 'dddddddd-0000-0000-0000-000000000009'
WHERE id = 'dddddddd-0000-0000-0000-000000000004';

-- Deleting the meeting keeps the task and forgets only where it came from.
DELETE FROM hub_meeting WHERE id = 'dddddddd-0000-0000-0000-000000000008';

DO $$
DECLARE
    remaining bigint;
BEGIN
    SELECT count(*) INTO remaining
    FROM hub_task WHERE id = 'dddddddd-0000-0000-0000-000000000004';

    IF remaining <> 1 THEN
        RAISE EXCEPTION 'deleting a meeting should not delete the task it created';
    END IF;
END $$;

-- Principles read as one list from three sources.
INSERT INTO hub_principle (project_id, description, discipline_code) VALUES
    ('bbbbbbbb-0000-0000-0000-000000000003', 'No parking on the plaza', 'landscape');

UPDATE hub_task SET is_principle = true, principle_created_at = '2026-01-10'
WHERE id = 'dddddddd-0000-0000-0000-000000000004';

DO $$
DECLARE
    total bigint;
BEGIN
    SELECT count(*) INTO total FROM hub_principle_all
    WHERE project_id = 'bbbbbbbb-0000-0000-0000-000000000003';

    IF total <> 2 THEN
        RAISE EXCEPTION 'expected two principles across the sources, got %', total;
    END IF;
END $$;

-- The planning board, including an untouched cell.
INSERT INTO hub_plan_board (id, project_id, name) VALUES
    ('eeeeeeee-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000003', 'Design board');

INSERT INTO hub_plan_building (id, board_id, name, sort_order) VALUES
    ('eeeeeeee-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000001', 'Block A', 10),
    ('eeeeeeee-0000-0000-0000-000000000003', 'eeeeeeee-0000-0000-0000-000000000001', 'Block B', 20);

INSERT INTO hub_plan_doc_type (id, board_id, name, sort_order) VALUES
    ('eeeeeeee-0000-0000-0000-000000000004', 'eeeeeeee-0000-0000-0000-000000000001', 'Drawings', 10);

INSERT INTO hub_plan_consultant (id, board_id, project_participant_id, sort_order)
SELECT 'eeeeeeee-0000-0000-0000-000000000005', 'eeeeeeee-0000-0000-0000-000000000001', pp.id, 10
FROM project_participant pp
WHERE pp.project_id = 'bbbbbbbb-0000-0000-0000-000000000003'
  AND pp.discipline_code = 'structural';

INSERT INTO hub_plan_cell (id, board_id, building_id, consultant_id, doc_type_id) VALUES
    ('eeeeeeee-0000-0000-0000-000000000006', 'eeeeeeee-0000-0000-0000-000000000001',
     'eeeeeeee-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000005',
     'eeeeeeee-0000-0000-0000-000000000004'),
    ('eeeeeeee-0000-0000-0000-000000000007', 'eeeeeeee-0000-0000-0000-000000000001',
     'eeeeeeee-0000-0000-0000-000000000003', 'eeeeeeee-0000-0000-0000-000000000005',
     'eeeeeeee-0000-0000-0000-000000000004');

INSERT INTO hub_event (plan_cell_id, status_code, event_date, round, created_at) VALUES
    ('eeeeeeee-0000-0000-0000-000000000006', 'progress', '2026-03-01', 1, '2026-03-01T09:00:00Z'),
    ('eeeeeeee-0000-0000-0000-000000000006', 'comments', '2026-05-01', 1, '2026-05-01T09:00:00Z'),
    ('eeeeeeee-0000-0000-0000-000000000006', 'progress', '2026-05-01', 2, '2026-05-01T09:00:01Z');

DO $$
DECLARE
    touched   record;
    untouched record;
BEGIN
    SELECT status_code, round INTO touched
    FROM hub_plan_cell_status WHERE cell_id = 'eeeeeeee-0000-0000-0000-000000000006';

    IF touched.status_code <> 'progress' OR touched.round <> 2 THEN
        RAISE EXCEPTION 'the worked cell should read progress round 2, got % round %',
            touched.status_code, touched.round;
    END IF;

    SELECT status_code INTO untouched
    FROM hub_plan_cell_status WHERE cell_id = 'eeeeeeee-0000-0000-0000-000000000007';

    IF untouched.status_code <> 'missing' THEN
        RAISE EXCEPTION 'an untouched cell should read missing, got %', untouched.status_code;
    END IF;
END $$;

-- Two people, two layouts, one sheet.
INSERT INTO hub_user_pref (person_id, scope_kind, scope_id, prefs) VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001', 'sheet', 'dddddddd-0000-0000-0000-000000000002',
     '{"colWidths": {"__name": 400}}'::jsonb),
    ('aaaaaaaa-0000-0000-0000-000000000002', 'sheet', 'dddddddd-0000-0000-0000-000000000002',
     '{"colWidths": {"__name": 200}}'::jsonb);

DO $$
DECLARE
    layouts bigint;
BEGIN
    SELECT count(DISTINCT prefs -> 'colWidths' ->> '__name') INTO layouts
    FROM hub_user_pref WHERE scope_id = 'dddddddd-0000-0000-0000-000000000002';

    IF layouts <> 2 THEN
        RAISE EXCEPTION 'two people should hold two layouts for one sheet, got %', layouts;
    END IF;
END $$;

-- Everything the project owns goes when the project goes.
DELETE FROM project WHERE id = 'bbbbbbbb-0000-0000-0000-000000000003';

DO $$
DECLARE
    leftovers bigint;
BEGIN
    SELECT count(*) INTO leftovers FROM hub_task;
    IF leftovers <> 0 THEN
        RAISE EXCEPTION 'deleting the project left % tasks behind', leftovers;
    END IF;

    SELECT count(*) INTO leftovers FROM hub_event;
    IF leftovers <> 0 THEN
        RAISE EXCEPTION 'deleting the project left % events behind', leftovers;
    END IF;

    SELECT count(*) INTO leftovers FROM hub_plan_cell;
    IF leftovers <> 0 THEN
        RAISE EXCEPTION 'deleting the project left % planning cells behind', leftovers;
    END IF;
END $$;
```

- [ ] **Step 3: Run it against a scratch database**

```bash
cd /d/Coding/KkarcDB && psql "$KKARCDB_TEST_CONNECTION" -c "CREATE DATABASE kkarcdb_verify"
```

Then apply the migrations and seeds, and run the smoke test:

```bash
cd /d/Coding/KkarcDB && for f in db/migrations/*.sql db/seed/*.sql; do psql "${KKARCDB_TEST_CONNECTION%/*}/kkarcdb_verify" -v ON_ERROR_STOP=1 -1 -f "$f" -q; done && psql "${KKARCDB_TEST_CONNECTION%/*}/kkarcdb_verify" -v ON_ERROR_STOP=1 -f db/verify.sql
```

Expected: `ROLLBACK` on the last line and no `ERROR:`. Any `RAISE EXCEPTION` message
from the script names exactly which rule failed.

- [ ] **Step 4: Drop the scratch database**

```bash
psql "$KKARCDB_TEST_CONNECTION" -c "DROP DATABASE kkarcdb_verify WITH (FORCE)"
```

- [ ] **Step 5: Commit**

```bash
git add db/verify.sql
git commit -m "test(db): exercise the hub tables in verify.sql"
```

Use this commit body:

```
verify.sql applies the migrations to a scratch database and checks the
rules rather than the columns. The hub tables get the same treatment: an
event that belongs to nothing is refused, a subtask cannot become its own
ancestor, deleting a meeting keeps the task it created, an untouched
planning cell reads as missing rather than vanishing, two people hold two
layouts for one sheet, and deleting a project leaves nothing behind.

Without this a broken migration is found by the API failing in Azure.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Task 9: Name normalisation and the firm-merge rule

The rule from the plan header, implemented and checked against the whole register.
This is the only part of the import with judgement in it, so it is its own task with
its own tests and nothing else in it.

**Files:**
- Create: `D:\Coding\KkarcDB\tools\hub-import\package.json`
- Create: `D:\Coding\KkarcDB\tools\hub-import\normalise.js`
- Create: `D:\Coding\KkarcDB\tools\hub-import\README.md`
- Test: `D:\Coding\KkarcDB\tools\hub-import\normalise.test.js`

**Interfaces:**
- Consumes: `GENERIC_WORDS` from `tools/consultant-extract/names.py`, copied rather than imported — one is Python and the other JavaScript, and a comment in each points at the other
- Produces, all named exports from `normalise.js`:
  - `stripBidi(text: string): string`
  - `normaliseName(text: string): string`
  - `distinctivePart(text: string): string`
  - `levenshtein(a: string, b: string): number`
  - `sameFirm(a: string, b: string): {same: boolean, exact: boolean, distance: number}`
  - `resolveFirmName(name: string, known: Map<string, string>): {key: string, merged: null | {into: string, distance: number}}` where `known` maps a normalised name to the canonical original spelling, and is **mutated** to add a newly seen name

- [ ] **Step 1: Create the package manifest**

Create `tools/hub-import/package.json`:

```json
{
  "name": "hub-import",
  "version": "1.0.0",
  "private": true,
  "description": "Reads an exported dashboard localStorage blob into the KKarcDB register.",
  "type": "commonjs",
  "scripts": {
    "test": "node --test"
  }
}
```

No dependencies. Node 24 has a test runner, and the import runs once.

- [ ] **Step 2: Write the failing test**

Create `tools/hub-import/normalise.test.js`:

```javascript
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  stripBidi,
  normaliseName,
  distinctivePart,
  levenshtein,
  sameFirm,
  resolveFirmName,
} = require('./normalise.js');

test('bidi marks Explorer inserts are removed', () => {
  // These are invisible. Left in, a name never matches the same name typed by hand,
  // and the failure looks like two firms that happen to share a spelling.
  assert.strictEqual(stripBidi('‏קנפו כלמור‎'), 'קנפו כלמור');
  assert.strictEqual(stripBidi('‫אדמה‬'), 'אדמה');
  assert.strictEqual(stripBidi('plain'), 'plain');
});

test('normalising folds punctuation, spacing and the corporate suffix', () => {
  assert.strictEqual(normaliseName('  י. שני   מהנדסים '), 'י שני מהנדסים');
  assert.strictEqual(normaliseName('י.שני מהנדסים'), 'י שני מהנדסים');
  assert.strictEqual(normaliseName('וישקין תכנון בע"מ'), 'וישקין תכנון');
  assert.strictEqual(normaliseName('וישקין תכנון בע״מ'), 'וישקין תכנון');
  assert.strictEqual(normaliseName('כנפו-כלימור'), 'כנפו כלימור');
  assert.strictEqual(normaliseName('Acme Engineering Ltd.'), 'acme engineering');
});

test('the distinctive part drops the words every firm in the trade uses', () => {
  // Half the register contains הנדסה or מהנדסים. Those characters pad the length and
  // let an edit budget stretch over the part that actually names the firm.
  assert.strictEqual(distinctivePart('בר אלכס הנדסה וקבלנות בניין בע"מ'), 'בר אלכס וקבלנות');
  assert.strictEqual(distinctivePart('י. שני מהנדסים'), 'י שני');
  assert.strictEqual(distinctivePart('קנפו כלימור אדריכלים'), 'קנפו כלימור');
});

test('levenshtein counts edits over code points', () => {
  assert.strictEqual(levenshtein('', ''), 0);
  assert.strictEqual(levenshtein('abc', 'abc'), 0);
  assert.strictEqual(levenshtein('abc', ''), 3);
  assert.strictEqual(levenshtein('kitten', 'sitting'), 3);
  assert.strictEqual(levenshtein('קנפו כלימור', 'קנפו כלמור'), 1);
});

test('a one-character misspelling of a long name is the same firm', () => {
  const result = sameFirm('קנפו כלימור אדריכלים', 'קנפו כלמור אדריכלים');
  assert.strictEqual(result.same, true);
  assert.strictEqual(result.exact, false);
  assert.strictEqual(result.distance, 1);
});

test('a difference of spacing and periods is an exact match', () => {
  const result = sameFirm('י. שני מהנדסים', 'י.שני מהנדסים');
  assert.strictEqual(result.same, true);
  assert.strictEqual(result.exact, true);
  assert.strictEqual(result.distance, 0);
});

test('a firm named by fewer trade words is still the same firm', () => {
  // 'ש. גלבוע' and 'ש. גלבוע מהנדסים יועצים' are one practice written two ways, and
  // the register holds both spellings.
  const result = sameFirm('ש. גלבוע', 'ש. גלבוע מהנדסים יועצים');
  assert.strictEqual(result.same, true);
  assert.strictEqual(result.distance, 0);
});

test('two genuinely different electrical firms stay apart', () => {
  // Both do electrical work on the same kind of project, and both are abbreviations
  // with periods. Their distinctive parts are initials, so they must match exactly.
  const result = sameFirm('א.נ.ה הנדסת חשמל', 'ו.נ. אור הנדסה');
  assert.strictEqual(result.same, false);
});

test('two firms distinguished only by their initials stay apart', () => {
  // This is what measuring the distinctive part buys. Against the whole name these are
  // two edits in thirty characters and would merge; the shared 'מהנדסים' is doing all
  // the work of making them look alike.
  assert.strictEqual(sameFirm('מ.נ.מ מהנדסים בע"מ', 'ת.ל.מ מהנדסים בע"מ').same, false);
  assert.strictEqual(sameFirm('א.ד מהנדסים', 'אחוד מהנדסים').same, false);
  assert.strictEqual(sameFirm('ג.ל. מהנדסים יועצים בע"מ', 'י. לבל מהנדסים יועצים').same, false);
  assert.strictEqual(sameFirm('נאסר מהנדסים', 'סטאר מהנדסים').same, false);
});

test('two people who share a first name are not one firm', () => {
  // At a quarter of the longer name this lands exactly on the threshold and merges,
  // which is why the ratio is a fifth.
  assert.strictEqual(sameFirm('מיכאל רויטמן', 'מיכאל פרידמן').same, false);
});

test('short names must match exactly', () => {
  assert.strictEqual(sameFirm('DCX', 'DCY').same, false);
  assert.strictEqual(sameFirm('אדמה', 'אדמות').same, false);
  assert.strictEqual(sameFirm('DCX', 'dcx').same, true);
});

test('a name made only of trade words matches nothing', () => {
  // 'הנדסה בע"מ' identifies no firm. Better a duplicate somebody can merge by hand
  // than a wrong merge nobody ever sees.
  const result = sameFirm('הנדסה בע"מ', 'תכנון ויעוץ');
  assert.strictEqual(result.same, false);
});

test('a long name still refuses a large edit distance', () => {
  assert.strictEqual(sameFirm('נופים אדריכלות נוף', 'צוק הידרולוגיה').same, false);
});

test('resolving the same firm twice returns the first spelling', () => {
  const known = new Map();

  const first = resolveFirmName('קנפו כלמור אדריכלים', known);
  assert.strictEqual(first.merged, null);
  assert.strictEqual(first.key, 'קנפו כלמור אדריכלים');

  // The second spelling has an extra yod. It resolves onto the first, which is the
  // spelling that reaches the database.
  const second = resolveFirmName('קנפו כלימור אדריכלים', known);
  assert.strictEqual(second.key, 'קנפו כלמור אדריכלים');
  assert.deepStrictEqual(second.merged, {
    into: 'קנפו כלמור אדריכלים',
    distance: 1,
  });

  assert.strictEqual(known.size, 1);
});

test('resolving an unrelated firm adds a second entry', () => {
  const known = new Map();
  resolveFirmName('קנפו כלמור אדריכלים', known);
  const other = resolveFirmName('צוק הידרולוגיה', known);

  assert.strictEqual(other.merged, null);
  assert.strictEqual(known.size, 2);
});

test('one firm engaged for two disciplines resolves to one entry', () => {
  // ש. גלבוע appears twice in the planning board, for plumbing and for HVAC. That is
  // one firm with two engagements, not two firms.
  const known = new Map();
  resolveFirmName('ש. גלבוע מהנדסים', known);
  const again = resolveFirmName('ש. גלבוע מהנדסים', known);

  assert.strictEqual(again.key, 'ש. גלבוע מהנדסים');
  assert.strictEqual(again.merged, null);
  assert.strictEqual(known.size, 1);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd /d/Coding/KkarcDB/tools/hub-import && node --test
```

Expected: FAIL with `Cannot find module './normalise.js'`.

- [ ] **Step 4: Write the implementation**

Create `tools/hub-import/normalise.js`:

```javascript
'use strict';

/**
 * Deciding when two spellings are one firm.
 *
 * The consultant lists were typed by many people over many years, into two separate
 * applications that never compared notes. The same practice appears as
 * "קנפו כלימור אדריכלים" in one and "קנפו כלמור אדריכלים" in the other, and as
 * "י. שני מהנדסים" and "י.שני מהנדסים". Importing those as four firms puts the same
 * consultant on a project twice, which is worse than either spelling.
 *
 * There is a second rule in this repository, `tools/consultant-extract/names.py`,
 * which decides the same question by asking whether two names share a distinctive
 * token. That rule is kept for the spreadsheet loader and is deliberately not reused
 * here: run over the 543 firms it loaded, it collapses them to 301, merging a
 * landscape architect with an electrical engineer because both are named דוד, and
 * four unrelated practices because all four contain בר. This rule collapses the same
 * 543 to 498, and every merge it makes was checked by hand.
 *
 * What is borrowed from it is GENERIC_WORDS, which is the good idea in it: half the
 * firm names in this trade contain הנדסה or מהנדסים, so those characters pad the
 * length and let an edit budget stretch over the part that actually identifies the
 * firm. Measuring the distinctive part instead is what stops "מ.נ.מ מהנדסים" and
 * "ת.ל.מ מהנדסים" being one firm.
 */

/**
 * Bidirectional control characters.
 *
 * Windows Explorer inserts these into Hebrew folder and file names, and they travel
 * with anything copied out. They are invisible in every editor, so a name carrying one
 * looks identical to the same name typed by hand and never matches it.
 */
const BIDI = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

/** Trailing "limited": Hebrew with either quote character, and the English forms. */
const CORPORATE_SUFFIX = /\s*(?:בע["\u05F4\u05F3']?מ|ltd\.?|limited)\s*$/i;

/**
 * Words that appear in half the firm names in this trade, so identify nothing.
 *
 * Copied from tools/consultant-extract/names.py. If that list gains a word, this one
 * should too — they are answering the same question about the same register.
 */
const GENERIC_WORDS = new Set([
  'הנדסה', 'מהנדסים', 'הנדסת', 'יועצים', 'יועץ', 'ויעוץ', 'וייעוץ', 'אדריכלים',
  'אדריכלות', 'אדריכל', 'תכנון', 'תיכנון', 'ושות', 'בנין', 'בניין', 'ניהול',
  'חברת', 'משרד', 'בעמ', 'ופיתוח', 'ושותפיו', 'קבוצת', 'אזרחית', 'בטיחות',
  'אקוסטיקה', 'מדידות', 'מעליות', 'קרקע', 'נוף', 'סביבה', 'תנועה', 'דרכים',
  'חשמל', 'מבנים', 'טכנולוגיות',
  'engineering', 'consultants', 'consulting', 'group', 'ltd', 'architects', 'planning',
]);

/** Strips the invisible bidirectional marks Explorer adds to Hebrew names. */
function stripBidi(text) {
  return String(text ?? '').replace(BIDI, '');
}

/**
 * The spelling-insensitive form of a name, for comparison only.
 *
 * Never stored: the database keeps what somebody actually typed. This exists so that
 * "י. שני" and "י.שני" stop being different firms.
 */
function normaliseName(text) {
  let value = stripBidi(text);

  // One quote character each, so a name typed with a Hebrew gershayim and the same
  // name typed with an ASCII double quote compare equal.
  value = value.replace(/[\u201C\u201D\u201E\u05F4]/g, '"');
  value = value.replace(/[\u2018\u2019\u05F3]/g, "'");

  value = value.replace(CORPORATE_SUFFIX, '');

  // Periods, commas and dashes carry no information here: initials and compound names
  // are written both ways, sometimes in the same spreadsheet.
  value = value.replace(/[.,\-\u2013]/g, ' ');

  value = value.replace(/\s+/g, ' ').trim();

  return value.toLowerCase();
}

/**
 * The part of a name that identifies the firm rather than the trade.
 *
 * "בר אלכס הנדסה וקבלנות בניין" becomes "בר אלכס וקבלנות". Comparing these rather
 * than the whole name is what keeps a three-character difference in the initials from
 * being diluted by a long shared suffix that every firm in the trade shares.
 */
function distinctivePart(text) {
  return normaliseName(text)
    .split(' ')
    .filter((word) => word !== '' && !GENERIC_WORDS.has(word))
    .join(' ');
}

/**
 * Edit distance between two strings, over Unicode code points.
 *
 * Code points and not UTF-16 units: Hebrew is inside the basic plane so the two agree
 * today, but a name carrying an emoji or a rare glyph would otherwise count one
 * character as two and drift over the threshold for no reason a reader could see.
 */
function levenshtein(a, b) {
  const left = Array.from(String(a ?? ''));
  const right = Array.from(String(b ?? ''));

  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;

  // One row at a time: the full matrix is never needed and these lists are short.
  let previous = new Array(right.length + 1);
  for (let j = 0; j <= right.length; j += 1) previous[j] = j;

  let current = new Array(right.length + 1);

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;

    for (let j = 1; j <= right.length; j += 1) {
      const substitution = previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1);
      const deletion = previous[j] + 1;
      const insertion = current[j - 1] + 1;
      current[j] = Math.min(substitution, deletion, insertion);
    }

    const swap = previous;
    previous = current;
    current = swap;
  }

  return previous[right.length];
}

/** At most this many edits, and only for names long enough to afford them. */
const MAX_DISTANCE = 3;

/**
 * An edit budget as a share of the longer distinctive part.
 *
 * 0.2 rather than 0.25 because at a quarter, "מיכאל רויטמן" and "מיכאל פרידמן" land
 * exactly on the threshold and merge. Two people who share a first name are not one
 * firm.
 */
const MAX_RATIO = 0.2;

/**
 * Below this many characters a distinctive part must match exactly.
 *
 * "DCX" and "אדמה" are real firms. One character apart from another short name is a
 * plausible different firm, not a plausible typo, and merging those is the failure
 * that is never noticed.
 */
const MIN_FUZZY_LENGTH = 6;

/**
 * Whether two spellings name the same firm.
 *
 * `exact` distinguishes a match that needed only normalisation, which is silent, from
 * one that spent edit distance, which is reported.
 */
function sameFirm(a, b) {
  if (normaliseName(a) === normaliseName(b)) {
    return { same: true, exact: true, distance: 0 };
  }

  const left = distinctivePart(a);
  const right = distinctivePart(b);

  // A name made entirely of trade words identifies nothing, so it cannot be matched
  // to anything. Better a duplicate somebody can merge than a wrong merge nobody sees.
  if (left === '' || right === '') {
    return { same: false, exact: false, distance: Number.MAX_SAFE_INTEGER };
  }

  const shortest = Math.min(Array.from(left).length, Array.from(right).length);
  const longest = Math.max(Array.from(left).length, Array.from(right).length);

  const distance = levenshtein(left, right);

  if (shortest < MIN_FUZZY_LENGTH) {
    return { same: distance === 0, exact: false, distance };
  }

  const same = distance <= MAX_DISTANCE && distance / longest <= MAX_RATIO;

  return { same, exact: false, distance };
}

/**
 * Finds the canonical spelling for a name, remembering it if it is new.
 *
 * `known` maps a normalised name to the spelling that reached the database first, and
 * is mutated. First seen wins, which matches the register's existing rule that a
 * project is never renamed by a later scan: whoever wrote it down first is presumed
 * to have been looking at the contract. The import seeds this from the `firm` table
 * before reading any blob, so a spelling already in the register always wins.
 */
function resolveFirmName(name, known) {
  const normalised = normaliseName(name);

  const exact = known.get(normalised);
  if (exact !== undefined) {
    return { key: exact, merged: null };
  }

  for (const [candidateNormalised, candidateOriginal] of known) {
    const verdict = sameFirm(normalised, candidateNormalised);
    if (verdict.same) {
      return {
        key: candidateOriginal,
        merged: { into: candidateOriginal, distance: verdict.distance },
      };
    }
  }

  known.set(normalised, name);
  return { key: name, merged: null };
}

module.exports = {
  stripBidi,
  normaliseName,
  distinctivePart,
  levenshtein,
  sameFirm,
  resolveFirmName,
  GENERIC_WORDS,
  MAX_DISTANCE,
  MAX_RATIO,
  MIN_FUZZY_LENGTH,
};
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd /d/Coding/KkarcDB/tools/hub-import && node --test
```

Expected: PASS, 16 tests, 0 failing. **This was run while writing the plan; all 16
pass against the code above exactly as printed.**

- [ ] **Step 6: Check the rule against every firm in the register**

The unit tests prove the pairs that should merge do. This proves nothing else does,
which is the failure that would otherwise be found by a consultant noticing they had
been replaced by a different practice.

Dump the names the register holds:

```bash
cd /d/Coding/KkarcDB/tools/hub-import && mkdir -p out && psql "$KKARCDB_CONNECTION" -At -c "SELECT name FROM firm ORDER BY name" > out/firms.txt
```

Create `tools/hub-import/check-firms.js`:

```javascript
'use strict';

/**
 * Every firm name in the register, run through the merge rule.
 *
 * Throwaway, and deliberately not a unit test: it needs the register, and what it
 * produces is a list for a person to read rather than an assertion. Delete it once the
 * import has run and the merges have been checked.
 */

const fs = require('node:fs');
const { resolveFirmName } = require('./normalise.js');

const rows = fs.readFileSync(process.argv[2] ?? 'out/firms.txt', 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line !== '');

const known = new Map();
const merged = [];

for (const name of rows) {
  const resolved = resolveFirmName(name, known);
  if (resolved.merged) {
    merged.push(`d=${resolved.merged.distance}  ${name}\n       -> ${resolved.merged.into}`);
  }
}

console.log(`${rows.length} names -> ${known.size} firms, ${merged.length} merges\n`);
console.log(merged.join('\n'));
```

Run it:

```bash
cd /d/Coding/KkarcDB/tools/hub-import && node check-firms.js
```

Expected, measured while writing this plan against the 543 firms the consultant load
put into the register:

```
543 names -> 498 firms, 44 merges
```

**Read all 44.** They should be spelling variants (`נפתלי`/`נפטלי`, `יעקוב`/`יעקב`,
`סיסטמה`/`סיסתמה`, `תכנון`/`תיכנון`), the same practice with and without its trade
suffix (`וישקין` / `וישקין מהנדסים`, `כדאי` / `כדאי בטיחות`, `אלרום` /
`אלרום הנדסת מעליות`), and one kaf-for-qof variant of the practice's own name
(`כנפו-כלימור` → `קנפו כלימור אדריכלים`). Anything pairing two different trades is a
bug in the rule, not a merge to accept.

- [ ] **Step 7: Write the README**

Create `tools/hub-import/README.md`:

````markdown
# hub-import

Reads a dashboard export into the register.

The three dashboards kept everything in one `localStorage` blob per browser. This
turns an exported blob into rows, resolving firms, people and projects against what is
already in `project`, `firm` and `person` rather than creating a second copy.

JavaScript rather than C#, for one reason: the blob is a JavaScript object graph that
the app reshapes with its own `migrateData()` ladder on every load. Running that ladder
is the only way to normalise the older shapes correctly, and it runs in Node unchanged.
`tools/consultant-extract` is Python for the same kind of reason.

## Running it

```powershell
. ..\..\env.ps1
.\Import-Hub.ps1 -In .\in\project_hub_export_2026-09-15.json -Project 2017-03 -WhatIf
```

`-WhatIf` writes the SQL and the reports and stops. Do that first, every time.

## What it writes

| File | What it says |
|---|---|
| `out/import.sql` | every statement, to read before applying |
| `out/firm-merges.txt` | every firm name merged into another spelling, with the distance |
| `out/unmatched.txt` | anything it could not resolve, which needs a person to decide |
| `out/counts.txt` | rows written per table |

Read `firm-merges.txt` before applying. A merge it got wrong is much harder to find
afterwards than one it missed.

## The merge rule, and the other one

There is a second rule in this repository. `tools/consultant-extract/names.py` answers
the same question for the spreadsheet loader, by asking whether two names share a
distinctive token. **This tool deliberately does not use it.** Over the 543 firms that
loader put into the register it collapses them to 301, merging a landscape architect
with an electrical engineer because both are named דוד. This rule gives 498.

What is borrowed from it is `GENERIC_WORDS`, the list of words half the trade uses.
**If that list gains a word, the copy in `normalise.js` should gain it too.**

Names are normalised: invisible bidi marks stripped, quote characters folded, a
trailing `בע"מ` or `Ltd` removed, periods, commas and dashes turned into spaces,
spacing collapsed, Latin lowercased. Two names equal after that are one firm.

Otherwise the comparison is on the *distinctive part*, the normalised name with the
generic trade words removed. Half the names here contain הנדסה or מהנדסים, and those
characters otherwise pad the length enough for an edit budget to stretch over the part
that actually names the firm. Two distinctive parts merge when they are at most three
edits apart, that is at most a fifth of the longer one, and both are at least six
characters. Shorter parts must match exactly: `DCX` and `אדמה` are real firms, and one
character apart from another short name is a plausible different firm rather than a
typo.
````

- [ ] **Step 8: Commit**

```bash
cd /d/Coding/KkarcDB
git add tools/hub-import/package.json tools/hub-import/normalise.js tools/hub-import/normalise.test.js tools/hub-import/README.md tools/hub-import/check-firms.js
git commit -m "feat(hub-import): decide when two spellings name one firm"
```

Use this commit body:

```
The consultant lists were typed by many people over many years into two
applications that never compared notes. The same practice appears as
'קנפו כלימור אדריכלים' in one and 'קנפו כלמור אדריכלים' in the other, and
as 'י. שני מהנדסים' and 'י.שני מהנדסים'. Importing those as four firms puts
the same consultant on a project twice.

names.py already answers this question for the spreadsheet loader, and this
does not reuse it. Over the 543 firms that loader put into the register,
its shared-token rule collapses them to 301 -- merging a landscape
architect with an electrical engineer because both are named דוד, and four
unrelated practices because all four contain בר. One of those four is the
electrical consultant on the dashboard.

What is borrowed is its GENERIC_WORDS list, which is the good idea in it.
Half the names in this trade contain הנדסה or מהנדסים, and those characters
pad the length enough that an edit budget stretches over the part that
actually identifies the firm. Measuring the distinctive part instead is
what keeps מ.נ.מ מהנדסים and ת.ל.מ מהנדסים apart.

Result on the same 543 names: 498 firms, 44 merges, each one read by hand.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Task 10: Resolve the blob's names against the register

**A decision that shapes the rest of the ETL:** it writes a SQL file rather than
talking to PostgreSQL directly.

There is no PostgreSQL driver in Node's standard library, so writing directly means
adding `node_modules` to a repository that has none. More importantly, this runs once
against data that exists nowhere else. A generated `.sql` file can be read before it is
applied, re-read afterwards to see what happened, and re-run. That is worth more than
the convenience of a driver, and it matches the repository's existing rule that the
caller owns the transaction.

The script therefore reads a lookup dump that `psql` produced, and writes SQL that
`psql` applies.

**Files:**
- Create: `D:\Coding\KkarcDB\tools\hub-import\lookups.js`
- Create: `D:\Coding\KkarcDB\tools\hub-import\register.js`
- Test: `D:\Coding\KkarcDB\tools\hub-import\register.test.js`

**Interfaces:**
- Consumes: `resolveFirmName`, `normaliseName` from `normalise.js` (Task 9)
- Produces:
  - `lookups.js`: `parseLookups(text: string): {disciplines: Map<string,string>, disciplinesByHebrew: Map<string,string>, firms: Map<string,string>, projects: Map<string,string>}` — `disciplines` maps a legacy code to a KkarcDB code, `firms` maps a normalised firm name to its existing uuid, `projects` maps `"2017-03"` to a uuid
  - `register.js`: `sqlString(value): string`, `sqlUuid(value): string`, `newId(): string`, `Registry` class with `constructor(lookups)`, `.firmId(name, {kind, disciplineCode})`, `.personId(name, {firmId, email, phone, mobile, disciplineCode})`, `.discipline(legacyCode)`, `.disciplineByHebrew(name)`, `.statements: string[]`, `.merges: string[]`, `.unmatched: string[]`

- [ ] **Step 1: Write the failing test**

Create `tools/hub-import/register.test.js`:

```javascript
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { parseLookups } = require('./lookups.js');
const { Registry, sqlString, newId } = require('./register.js');

const SAMPLE = [
  'discipline\tARCH\tarchitecture\tאדריכלות',
  'discipline\tSTRC\tstructural\tקונסטרוקציה',
  'discipline\t\tcommunications\tתקשורת',
  'firm\t11111111-1111-1111-1111-111111111111\tקנפו כלמור אדריכלים',
  'firm\t22222222-2222-2222-2222-222222222222\tצוק הידרולוגיה',
  'project\tbbbbbbbb-0000-0000-0000-000000000001\t2017-03',
].join('\n');

test('a lookup dump parses into four maps', () => {
  const lookups = parseLookups(SAMPLE);

  assert.strictEqual(lookups.disciplines.get('ARCH'), 'architecture');
  assert.strictEqual(lookups.disciplinesByHebrew.get('תקשורת'), 'communications');
  assert.strictEqual(lookups.projects.get('2017-03'), 'bbbbbbbb-0000-0000-0000-000000000001');
  assert.strictEqual(lookups.firms.size, 2);
});

test('a discipline with no legacy code is still reachable by name', () => {
  // planning_dashboard names its disciplines in Hebrew and has no codes at all.
  const lookups = parseLookups(SAMPLE);
  assert.strictEqual(lookups.disciplines.has(''), false);
  assert.strictEqual(lookups.disciplinesByHebrew.get('קונסטרוקציה'), 'structural');
});

test('a firm already in the register is reused, not created', () => {
  const registry = new Registry(parseLookups(SAMPLE));

  const id = registry.firmId('קנפו כלמור אדריכלים', { kind: 'internal' });

  assert.strictEqual(id, '11111111-1111-1111-1111-111111111111');
  assert.strictEqual(registry.statements.length, 0);
});

test('the register spelling wins over the blob spelling', () => {
  // The blob writes an extra yod. The register's spelling is the one on the contract,
  // and seeding the known names from the register first is what makes it win.
  const registry = new Registry(parseLookups(SAMPLE));

  const id = registry.firmId('קנפו כלימור אדריכלים', { kind: 'consultant' });

  assert.strictEqual(id, '11111111-1111-1111-1111-111111111111');
  assert.strictEqual(registry.statements.length, 0);
  assert.strictEqual(registry.merges.length, 1);
  assert.match(registry.merges[0], /קנפו כלימור אדריכלים/);
  assert.match(registry.merges[0], /distance 1/);
});

test('an unknown firm is created once, however often it is named', () => {
  const registry = new Registry(parseLookups(SAMPLE));

  const first = registry.firmId('אלרום מעליות', { kind: 'consultant', disciplineCode: 'elevators' });
  const second = registry.firmId('אלרום מעליות', { kind: 'consultant', disciplineCode: 'elevators' });

  assert.strictEqual(first, second);
  assert.strictEqual(registry.statements.length, 1);
  assert.match(registry.statements[0], /INSERT INTO firm/);
  assert.match(registry.statements[0], /'elevators'/);
});

test('a person is keyed by email when there is one', () => {
  const registry = new Registry(parseLookups(SAMPLE));
  const firmId = registry.firmId('אלרום מעליות', { kind: 'consultant' });

  const first = registry.personId('דוד קנפו', { firmId, email: 'david@kkarc.com' });
  // The same address, written with different capitals and a different display name.
  const second = registry.personId('ד. קנפו', { firmId, email: 'David@KKarc.com' });

  assert.strictEqual(first, second);
});

test('a person with no email is keyed by name within their firm', () => {
  const registry = new Registry(parseLookups(SAMPLE));
  const firmA = registry.firmId('אלרום מעליות', { kind: 'consultant' });
  const firmB = registry.firmId('אריה צור', { kind: 'consultant' });

  const atA = registry.personId('יוסי', { firmId: firmA });
  const againAtA = registry.personId('יוסי', { firmId: firmA });
  const atB = registry.personId('יוסי', { firmId: firmB });

  assert.strictEqual(atA, againAtA);
  assert.notStrictEqual(atA, atB);
});

test('an unmapped discipline is reported rather than guessed', () => {
  const registry = new Registry(parseLookups(SAMPLE));

  assert.strictEqual(registry.discipline('ARCH'), 'architecture');
  assert.strictEqual(registry.discipline('WAT'), null);
  assert.strictEqual(registry.unmatched.length, 1);
  assert.match(registry.unmatched[0], /WAT/);

  // Reported once, not once per task that mentions it.
  registry.discipline('WAT');
  assert.strictEqual(registry.unmatched.length, 1);
});

test('an empty discipline code is absence, not an unmapped code', () => {
  const registry = new Registry(parseLookups(SAMPLE));

  assert.strictEqual(registry.discipline(''), null);
  assert.strictEqual(registry.discipline(null), null);
  assert.strictEqual(registry.discipline(undefined), null);
  assert.strictEqual(registry.unmatched.length, 0);
});

test('quoting closes an apostrophe rather than ending the statement', () => {
  // A firm name with an apostrophe in it is not exotic, and the alternative to getting
  // this right is a generated file that will not parse -- or worse, one that does.
  assert.strictEqual(sqlString("O'Brien"), "'O''Brien'");
  assert.strictEqual(sqlString(null), 'NULL');
  assert.strictEqual(sqlString(''), 'NULL');
  assert.strictEqual(sqlString('  padded  '), "'padded'");
});

test('generated ids are distinct uuids', () => {
  const ids = new Set(Array.from({ length: 500 }, () => newId()));
  assert.strictEqual(ids.size, 500);
  assert.match([...ids][0], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /d/Coding/KkarcDB/tools/hub-import && node --test register.test.js
```

Expected: FAIL with `Cannot find module './lookups.js'`.

- [ ] **Step 3: Write the lookup parser**

Create `tools/hub-import/lookups.js`:

```javascript
'use strict';

/**
 * What the register already knows, as dumped by psql.
 *
 * Three queries, one tab-separated stream, because the alternative is a PostgreSQL
 * driver and a node_modules directory in a repository that has neither. The dump is
 * produced by Import-Hub.ps1; the format is deliberately dull so that a person can
 * read it when the import does something surprising.
 *
 *   discipline <tab> legacy_code <tab> code <tab> name_he
 *   firm       <tab> id          <tab> name
 *   project    <tab> id          <tab> year-sequence
 */

const { normaliseName } = require('./normalise.js');

function parseLookups(text) {
  const disciplines = new Map();
  const disciplinesByHebrew = new Map();
  const firms = new Map();
  const projects = new Map();

  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '') continue;

    const parts = line.split('\t');
    const kind = parts[0];

    if (kind === 'discipline') {
      const [, legacyCode, code, nameHe] = parts;

      // A discipline the dashboards never referenced has no legacy code. It still
      // belongs in the Hebrew index, because planning_dashboard matches by name.
      if (legacyCode) disciplines.set(legacyCode, code);
      if (nameHe) disciplinesByHebrew.set(nameHe, code);
    } else if (kind === 'firm') {
      const [, id, name] = parts;
      firms.set(normaliseName(name), id);
    } else if (kind === 'project') {
      const [, id, code] = parts;
      projects.set(code, id);
    }
  }

  return { disciplines, disciplinesByHebrew, firms, projects };
}

module.exports = { parseLookups };
```

- [ ] **Step 4: Write the registry**

Create `tools/hub-import/register.js`:

```javascript
'use strict';

/**
 * Turning the names in a blob into rows in the register.
 *
 * Every name the export mentions is either something already in `firm`, `person` or
 * `project`, or something that needs creating. Deciding which is the whole job, and
 * getting it wrong in the direction of creating duplicates is how a shared database
 * ends up with the same consultant on a project twice.
 *
 * Nothing here executes SQL. It accumulates statements, which Import-Hub.ps1 applies
 * after a person has read them.
 */

const crypto = require('node:crypto');
const { normaliseName, resolveFirmName, sameFirm } = require('./normalise.js');

/** A literal for the generated SQL. Empty and whitespace-only become NULL. */
function sqlString(value) {
  if (value === null || value === undefined) return 'NULL';

  const text = String(value).trim();
  if (text === '') return 'NULL';

  return `'${text.replace(/'/g, "''")}'`;
}

/** A uuid literal, or NULL. Rejects anything that is not a uuid rather than quoting it. */
function sqlUuid(value) {
  if (value === null || value === undefined || value === '') return 'NULL';

  const text = String(value);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) {
    throw new Error(`not a uuid: ${text}`);
  }

  return `'${text}'::uuid`;
}

/** A boolean literal. */
function sqlBool(value) {
  return value ? 'true' : 'false';
}

/** A date literal. The blob writes ISO dates as strings, and empty ones as ''. */
function sqlDate(value) {
  if (!value) return 'NULL';

  const text = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return 'NULL';

  return `'${text}'::date`;
}

/** A jsonb literal. */
function sqlJson(value) {
  if (value === null || value === undefined) return `'{}'::jsonb`;
  return `${sqlString(JSON.stringify(value))}::jsonb`;
}

/**
 * A fresh uuid.
 *
 * The blob's own ids are seven base36 characters from Math.random, minted
 * independently in every browser. They are kept only as a map key while the import
 * runs, never written.
 */
function newId() {
  return crypto.randomUUID();
}

class Registry {
  constructor(lookups) {
    this.lookups = lookups;

    /** SQL to run, in order. */
    this.statements = [];

    /** Firm names merged into another spelling, for review. */
    this.merges = [];

    /** Things a person has to decide about. */
    this.unmatched = [];

    /**
     * Normalised firm name -> canonical spelling, seeded from the register.
     *
     * Seeded first, and that ordering is the point: whichever spelling is already in
     * `firm` wins, because it is the one somebody checked against a contract. Reading
     * the blob first would let a typo in an export rename a firm.
     */
    this.knownFirmNames = new Map();
    for (const normalised of lookups.firms.keys()) {
      this.knownFirmNames.set(normalised, normalised);
    }

    /** Canonical normalised firm name -> uuid, including ones created this run. */
    this.firmIds = new Map(lookups.firms);

    /** Person key -> uuid. */
    this.personIds = new Map();

    /** Legacy discipline codes already reported as unmapped. */
    this.reportedDisciplines = new Set();
  }

  /** The KkarcDB code for one of project_hub's, or null with a line in the report. */
  discipline(legacyCode) {
    if (!legacyCode) return null;

    const code = this.lookups.disciplines.get(legacyCode);
    if (code) return code;

    if (!this.reportedDisciplines.has(legacyCode)) {
      this.reportedDisciplines.add(legacyCode);
      this.unmatched.push(
        `discipline: no row has legacy_code '${legacyCode}'. ` +
        `Add it to db/seed/002_hub_disciplines.sql and re-run the seed.`,
      );
    }

    return null;
  }

  /** The KkarcDB code for a Hebrew discipline name, as planning_dashboard writes them. */
  disciplineByHebrew(name) {
    if (!name) return null;

    const code = this.lookups.disciplinesByHebrew.get(String(name).trim());
    if (code) return code;

    const key = `he:${name}`;
    if (!this.reportedDisciplines.has(key)) {
      this.reportedDisciplines.add(key);
      this.unmatched.push(
        `discipline: no row is named '${name}'. ` +
        `Add it to db/seed/002_hub_disciplines.sql and re-run the seed.`,
      );
    }

    return null;
  }

  /** The uuid of a firm, creating it if the register has never heard of it. */
  firmId(name, { kind = 'consultant', disciplineCode = null } = {}) {
    const resolved = resolveFirmName(name, this.knownFirmNames);

    if (resolved.merged) {
      this.merges.push(
        `firm: "${name}" -> "${resolved.merged.into}" (distance ${resolved.merged.distance})`,
      );
    }

    const canonical = normaliseName(resolved.key);

    const existing = this.firmIds.get(canonical);
    if (existing) return existing;

    const id = newId();
    this.firmIds.set(canonical, id);

    // The name written is the blob's, not the normalised form: normalisation exists to
    // compare names, never to replace what somebody typed.
    this.statements.push(
      `INSERT INTO firm (id, name, kind, discipline_code) VALUES ` +
      `(${sqlUuid(id)}, ${sqlString(name)}, ${sqlString(kind)}, ${sqlString(disciplineCode)});`,
    );

    return id;
  }

  /**
   * The uuid of a person, creating them if new.
   *
   * Keyed by email where there is one, because that is the only thing in these lists
   * that is actually unique -- the same person is written "דוד קנפו" in one place and
   * "ד. קנפו" in another. Without an email, name within firm is the best available,
   * and two genuine namesakes at one firm would merge. That is rare enough, and
   * visible enough when it happens, to be the better trade.
   */
  personId(name, { firmId = null, email = null, phone = null, mobile = null, disciplineCode = null } = {}) {
    const key = email
      ? `email:${String(email).trim().toLowerCase()}`
      : `name:${firmId ?? '-'}:${normaliseName(name)}`;

    const existing = this.personIds.get(key);
    if (existing) return existing;

    const id = newId();
    this.personIds.set(key, id);

    this.statements.push(
      `INSERT INTO person (id, firm_id, name, email, phone, mobile, discipline_code) VALUES ` +
      `(${sqlUuid(id)}, ${sqlUuid(firmId)}, ${sqlString(name)}, ${sqlString(email)}, ` +
      `${sqlString(phone)}, ${sqlString(mobile)}, ${sqlString(disciplineCode)});`,
    );

    return id;
  }

  /** Engages a firm on a project for a discipline. */
  participantId(projectId, firmId, disciplineCode, leadPersonId = null) {
    const id = newId();

    this.statements.push(
      `INSERT INTO project_participant (id, project_id, firm_id, discipline_code, lead_person_id) VALUES ` +
      `(${sqlUuid(id)}, ${sqlUuid(projectId)}, ${sqlUuid(firmId)}, ${sqlString(disciplineCode)}, ` +
      `${sqlUuid(leadPersonId)}) ON CONFLICT (project_id, firm_id, discipline_code) DO NOTHING;`,
    );

    return id;
  }

  /** Puts a member of staff on a project in a role. */
  assign(projectId, personId, roleCode) {
    this.statements.push(
      `INSERT INTO project_assignment (id, project_id, person_id, role_code) VALUES ` +
      `(${sqlUuid(newId())}, ${sqlUuid(projectId)}, ${sqlUuid(personId)}, ${sqlString(roleCode)}) ` +
      `ON CONFLICT DO NOTHING;`,
    );
  }
}

module.exports = { Registry, sqlString, sqlUuid, sqlBool, sqlDate, sqlJson, newId };
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd /d/Coding/KkarcDB/tools/hub-import && node --test
```

Expected: PASS, 27 tests (16 from Task 9, 11 here), 0 failing.

- [ ] **Step 6: Commit**

```bash
cd /d/Coding/KkarcDB
git add tools/hub-import/lookups.js tools/hub-import/register.js tools/hub-import/register.test.js tools/hub-import/check-firms.js
git commit -m "feat(hub-import): resolve blob names against the existing register"
```

Use this commit body:

```
The import writes a SQL file rather than talking to PostgreSQL directly.
Node has no driver in its standard library, so the alternative is a
node_modules directory in a repository that has none -- and this runs once,
against data that exists nowhere else. A generated file can be read before
it is applied and re-read afterwards, which is worth more than the
convenience.

Known firm names are seeded from the register before any blob is read, so a
spelling already on a contract wins over a typo in an export. People are
keyed by email where there is one, because that is the only genuinely
unique thing in these lists: the same person is written 'דוד קנפו' in one
place and 'ד. קנפו' in another.

A discipline code with no mapping is reported once and left null, never
guessed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Task 11: Map the project_hub blob to rows

**Files:**
- Create: `D:\Coding\KkarcDB\tools\hub-import\hub.js`
- Test: `D:\Coding\KkarcDB\tools\hub-import\hub.test.js`

**Interfaces:**
- Consumes: `Registry`, `sqlString`, `sqlUuid`, `sqlBool`, `sqlDate`, `sqlJson`, `newId` from `register.js` (Task 10)
- Produces: `importHub(blob, {projectId, registry}): {counts: Record<string, number>}` — appends to `registry.statements` and returns a count per table. `blob` is the `data` property of a Task 1 export.

- [ ] **Step 1: Write the failing test**

Create `tools/hub-import/hub.test.js`:

```javascript
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { parseLookups } = require('./lookups.js');
const { Registry } = require('./register.js');
const { importHub } = require('./hub.js');

const LOOKUPS = parseLookups([
  'discipline\tARCH\tarchitecture\tאדריכלות',
  'discipline\tENVI\tgreen\tבנייה ירוקה',
  'discipline\tPM\tproject_mgmt\tניהול פרויקט',
  'project\tbbbbbbbb-0000-0000-0000-000000000001\t2017-03',
].join('\n'));

const PROJECT_ID = 'bbbbbbbb-0000-0000-0000-000000000001';
const PERSON_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

/** A blob shaped like the real one, small enough to reason about. */
function sampleBlob() {
  return {
    projectName: 'Scratch',
    tracks: [{ id: 'licensing', label: 'רישוי', stageOrder: 1 }],
    sheets: [{
      id: 's1',
      name: 'תנאים מקדימים',
      track: 'licensing',
      groups: [{ id: 'g1', name: 'אישורי היתר', collapsed: true }],
      fields: [{ id: 'f1', label: 'מספר בקשה', type: 'text' }],
      hiddenCols: { __comment: true },
      colOrder: ['__name', '__status'],
      views: [{ id: 'v1', name: 'רק שלי', filters: {} }],
      tasks: [{
        id: 't1',
        groupId: 'g1',
        title: 'אישור מעבדה',
        statusId: 'I',
        priority: 'high',
        discipline: 'ENVI',
        responsible: 'ENVI',
        startDate: '2026-02-15',
        dueDate: '2026-07-30',
        comment: 'סבב שני',
        done: false,
        fieldValues: { f1: '12345' },
        events: [
          { id: 'e1', status: 'progress', date: '2026-03-01', assignee: 'ENVI', note: '' },
          { id: 'e2', status: 'sent', date: '2026-04-01', assignee: 'ENVI', note: 'נשלח' },
        ],
        subtasks: [{
          id: 'sub1',
          title: 'הכנת חוברת',
          done: true,
          discipline: 'ARCH',
          startDate: '2026-04-05',
          dueDate: '2026-04-12',
          events: [],
          subtasks: [{
            id: 'sub2', title: 'גיליון חזיתות', done: false, discipline: 'ARCH',
            events: [], subtasks: [],
          }],
        }],
        // The half-finished v4 migration left a duplicate copy here, with the same ids.
        tracks: [{
          id: 'lane1',
          discipline: 'ENVI',
          subtasks: [{ id: 'sub1', title: 'הכנת חוברת' }],
          events: [{ id: 'e1', status: 'progress', date: '2026-03-01' }],
        }],
      }],
    }],
    team: [{ id: 'tm1', name: 'דוד קנפו', role: 'שותף מוביל', disc: 'ARCH', email: 'david@kkarc.com', phone: '054-2229515' }],
    consultants: [{
      id: 'c01', discipline: 'מנהל פרויקט', discCode: 'PM', firm: 'קריזל הנדסה',
      contacts: [{ name: 'מיקי קריזל', phone: '09-7423535', mobile: '052-2531603', email: 'k@example.test', isLead: true }],
    }],
    meetings: [{
      id: 'm1', title: 'תיאום שבועי', date: '2026-02-10', recordedBy: 'שי', distribution: 'כולם',
      trackId: 'licensing',
      participants: [
        { id: 'p1', name: 'דוד קנפו', role: 'שותף', isCustom: false },
        { id: 'p2', name: 'אורח', role: '', isCustom: true },
      ],
      items: [
        { id: 'i1', number: '1', topic: 'לזרז את המעבדה', assignee: 'ENVI', dueDate: '2026-03-01', itemType: 'task' },
        { id: 'i2', number: '1.1', topic: 'נרשם לפרוטוקול', assignee: 'לידיעה', itemType: 'update' },
      ],
    }],
    licensingGoals: [{ id: 'gl1', title: 'קבלת תיק מידע', targetDate: '2026-03-01', done: true }],
    licensingMilestones: [{ id: 'ms1', title: 'דיון בוועדה', date: '2026-08-01', done: false }],
    standalonePrinciples: [{ id: 'pr1', description: 'ללא חניה בכיכר', discipline: 'ARCH', createdAt: '2026-01-12' }],
    builtinConfig: { __owner_status: { delayThreshold: 30 } },
    ganttViews: [{ id: 'gv1', name: 'הכל', zoom: 100 }],
  };
}

function run(blob = sampleBlob()) {
  const registry = new Registry(LOOKUPS);
  // A person is required: per-user preferences have to belong to somebody, and the
  // import is run by whoever exported the blob.
  const result = importHub(blob, { projectId: PROJECT_ID, registry, personId: PERSON_ID });
  return { registry, result, sql: registry.statements.join('\n') };
}

test('the duplicated lane copies are dropped, not imported twice', () => {
  // migrateTask() copied subtasks into a lane without removing them from
  // task.subtasks, leaving 50 tasks with identical id sets in both places. Importing
  // both would double every subtask and every event in the database.
  const { result } = run();

  assert.strictEqual(result.counts.hub_subtask, 2);
  assert.strictEqual(result.counts.hub_event, 2);
  assert.strictEqual(result.counts.hub_task_lane, 1);
});

test('subtasks nest, and the lane claims only the subtask it listed', () => {
  const { registry } = run();

  const subtasks = registry.statements.filter((s) => s.startsWith('INSERT INTO hub_subtask'));
  assert.strictEqual(subtasks.length, 2);

  const firstUuid = (statement) => statement.match(/'([0-9a-f-]{36})'::uuid/)[1];

  // The child names its parent, which is the first subtask written.
  assert.ok(subtasks[1].includes(firstUuid(subtasks[0])), 'the child should name its parent');

  // The lane listed one subtask, so exactly one of the two carries the lane id.
  const lane = registry.statements.find((s) => s.startsWith('INSERT INTO hub_task_lane'));
  const laneId = firstUuid(lane);
  assert.strictEqual(subtasks.filter((s) => s.includes(laneId)).length, 1);
});

test('legacy status letters become status codes', () => {
  const { sql } = run();
  assert.match(sql, /INSERT INTO hub_task[\s\S]*'in_progress'/);
});

test('a discipline code becomes the register code, not the letters', () => {
  const { sql } = run();
  assert.match(sql, /'green'/);
  assert.doesNotMatch(sql, /'ENVI'/);
});

test('per-user state goes to preferences, not onto the shared row', () => {
  const { sql } = run();

  // collapsed, hiddenCols and colOrder must not reach hub_group or hub_sheet.
  assert.doesNotMatch(sql, /INSERT INTO hub_group[^;]*collapsed/);
  assert.doesNotMatch(sql, /INSERT INTO hub_sheet[^;]*hidden/);
  assert.match(sql, /INSERT INTO hub_user_pref/);
});

test('a saved view is personal until somebody shares it', () => {
  const { sql } = run();
  assert.match(sql, /INSERT INTO hub_saved_view[^;]*false/);
});

test('the information sentinel becomes a boolean', () => {
  // 'לידיעה' was stored in the assignee field, which is how a list of disciplines
  // acquires a row that is not a discipline.
  const { sql } = run();
  const item = sql.split('\n').find((line) => line.includes('hub_meeting_item') && line.includes('1.1'));

  assert.ok(item, 'the information item should have been written');
  assert.match(item, /true/);
  assert.doesNotMatch(item, /לידיעה/);
});

test('a participant who is not in the register keeps their name', () => {
  const { sql } = run();
  assert.match(sql, /INSERT INTO hub_meeting_participant[^;]*'אורח'/);
});

test('a consultant firm becomes a firm, a contact and an engagement', () => {
  const { sql } = run();

  assert.match(sql, /INSERT INTO firm[^;]*'קריזל הנדסה'/);
  assert.match(sql, /INSERT INTO person[^;]*'מיקי קריזל'/);
  assert.match(sql, /INSERT INTO project_participant[^;]*'project_mgmt'/);
});

test('an empty blob produces no statements and no crash', () => {
  const { result, registry } = run({});

  assert.strictEqual(registry.statements.length, 0);
  assert.strictEqual(result.counts.hub_task, 0);
});

test('every statement ends in a semicolon', () => {
  // The output is concatenated into one file. A statement without its terminator
  // silently swallows the next one.
  const { registry } = run();
  for (const statement of registry.statements) {
    assert.ok(statement.trimEnd().endsWith(';'), `missing terminator: ${statement}`);
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /d/Coding/KkarcDB/tools/hub-import && node --test hub.test.js
```

Expected: FAIL with `Cannot find module './hub.js'`.

- [ ] **Step 3: Write the mapper**

Create `tools/hub-import/hub.js`:

```javascript
'use strict';

/**
 * One project_hub blob, as rows.
 *
 * Three things here are decisions rather than transcription, and each one is a finding
 * from reading the app rather than a preference:
 *
 *   1. task.tracks[] is a duplicate. migrateTask() copied subtasks and events into a
 *      lane without removing them from the task, leaving 50 tasks with identical id
 *      sets in both places. task.subtasks and task.events are canonical; the lane
 *      keeps only its identity, and its subtasks are matched back by id.
 *
 *   2. Per-user state -- collapsed groups, hidden columns, column order and widths,
 *      saved views -- was stored on shared rows. It moves to hub_user_pref, which
 *      needs a person, so the import takes one.
 *
 *   3. `responsible` holds a discipline code despite its name, and the meeting
 *      assignee field holds the string 'לידיעה' to mean nobody owns the line.
 */

const {
  sqlString, sqlUuid, sqlBool, sqlDate, sqlJson, newId,
} = require('./register.js');

/** The single letters the app stored in statusId. */
const TASK_STATUS = {
  N: 'not_started',
  I: 'in_progress',
  R: 'awaiting_response',
  S: 'stuck',
  C: 'done',
};

/** The app's priority ids happen to match the seeded codes. Mapped anyway, explicitly. */
const PRIORITY = { high: 'high', medium: 'medium', low: 'low' };

/** The sentinel the assignee field carried instead of a discipline. */
const FOR_INFORMATION = 'לידיעה';

function importHub(blob, { projectId, registry, personId = null }) {
  const counts = {
    hub_project_profile: 0, hub_project_track: 0, hub_sheet: 0, hub_field: 0,
    hub_group: 0, hub_task: 0, hub_task_lane: 0, hub_subtask: 0, hub_event: 0,
    hub_meeting: 0, hub_meeting_participant: 0, hub_meeting_item: 0,
    hub_licensing_goal: 0, hub_licensing_milestone: 0, hub_principle: 0,
    hub_saved_view: 0, hub_user_pref: 0,
  };

  if (!blob || typeof blob !== 'object') return { counts };

  const push = (table, sql) => {
    registry.statements.push(sql);
    counts[table] += 1;
  };

  // Old blob id -> new uuid. The blob's ids are seven base36 characters from
  // Math.random, minted independently in every browser; they exist only long enough
  // to resolve the references that point at them.
  const ids = new Map();
  const idFor = (oldId) => {
    if (!oldId) return null;
    if (!ids.has(oldId)) ids.set(oldId, newId());
    return ids.get(oldId);
  };

  // --- the project's own extras -------------------------------------------------

  if (blob.builtinConfig) {
    push('hub_project_profile',
      `INSERT INTO hub_project_profile (project_id, builtin_config) VALUES ` +
      `(${sqlUuid(projectId)}, ${sqlJson(blob.builtinConfig)}) ` +
      `ON CONFLICT (project_id) DO UPDATE SET builtin_config = EXCLUDED.builtin_config;`);
  }

  for (const [index, track] of (blob.tracks ?? []).entries()) {
    push('hub_project_track',
      `INSERT INTO hub_project_track (id, project_id, code, name_he, sort_order) VALUES ` +
      `(${sqlUuid(idFor(track.id))}, ${sqlUuid(projectId)}, ${sqlString(track.id)}, ` +
      `${sqlString(track.label)}, ${track.stageOrder ?? index});`);
  }

  // --- sheets -------------------------------------------------------------------

  for (const [sheetIndex, sheet] of (blob.sheets ?? []).entries()) {
    const sheetId = idFor(sheet.id);

    push('hub_sheet',
      `INSERT INTO hub_sheet (id, project_id, track_id, name, sort_order) VALUES ` +
      `(${sqlUuid(sheetId)}, ${sqlUuid(projectId)}, ${sqlUuid(idFor(sheet.track))}, ` +
      `${sqlString(sheet.name)}, ${sheetIndex});`);

    for (const [fieldIndex, field] of (sheet.fields ?? []).entries()) {
      push('hub_field',
        `INSERT INTO hub_field (id, sheet_id, code, name_he, type, options, sort_order) VALUES ` +
        `(${sqlUuid(idFor(field.id))}, ${sqlUuid(sheetId)}, ${sqlString(field.id)}, ` +
        `${sqlString(field.label)}, ${sqlString(field.type ?? 'text')}, ` +
        `${sqlJson(field.options ?? [])}, ${fieldIndex});`);
    }

    for (const [groupIndex, group] of (sheet.groups ?? []).entries()) {
      // `collapsed` is deliberately absent: it is one person's view of the sheet, and
      // on a shared row it collapses the group for everybody.
      push('hub_group',
        `INSERT INTO hub_group (id, sheet_id, name, sort_order) VALUES ` +
        `(${sqlUuid(idFor(group.id))}, ${sqlUuid(sheetId)}, ${sqlString(group.name)}, ${groupIndex});`);
    }

    for (const [taskIndex, task] of (sheet.tasks ?? []).entries()) {
      importTask(task, taskIndex, sheetId);
    }

    // Column layout and saved views are this person's, not the sheet's.
    const prefs = {};
    if (sheet.hiddenCols) prefs.hiddenCols = sheet.hiddenCols;
    if (sheet.colOrder) prefs.colOrder = sheet.colOrder;
    if (sheet.colWidths) prefs.colWidths = sheet.colWidths;

    const collapsed = (sheet.groups ?? []).filter((g) => g.collapsed).map((g) => idFor(g.id));
    if (collapsed.length) prefs.collapsedGroups = collapsed;

    if (personId && Object.keys(prefs).length) {
      push('hub_user_pref',
        `INSERT INTO hub_user_pref (id, person_id, scope_kind, scope_id, prefs) VALUES ` +
        `(${sqlUuid(newId())}, ${sqlUuid(personId)}, 'sheet', ${sqlUuid(sheetId)}, ${sqlJson(prefs)}) ` +
        `ON CONFLICT (person_id, scope_kind, scope_id) WHERE scope_id IS NOT NULL ` +
        `DO UPDATE SET prefs = EXCLUDED.prefs;`);
    }

    for (const view of sheet.views ?? []) {
      push('hub_saved_view',
        `INSERT INTO hub_saved_view (id, project_id, sheet_id, kind, name, owner_person_id, is_shared, definition) ` +
        `VALUES (${sqlUuid(newId())}, ${sqlUuid(projectId)}, ${sqlUuid(sheetId)}, 'list', ` +
        `${sqlString(view.name)}, ${sqlUuid(personId)}, false, ${sqlJson(view)});`);
    }
  }

  function importTask(task, taskIndex, sheetId) {
    const taskId = idFor(task.id);

    push('hub_task',
      `INSERT INTO hub_task (id, sheet_id, group_id, title, status_code, priority_code, ` +
      `discipline_code, start_date, due_date, comment, description_html, done, field_values, ` +
      `is_principle, principle_created_at, sort_order) VALUES ` +
      `(${sqlUuid(taskId)}, ${sqlUuid(sheetId)}, ${sqlUuid(idFor(task.groupId))}, ` +
      `${sqlString(task.title)}, ${sqlString(TASK_STATUS[task.statusId] ?? null)}, ` +
      `${sqlString(PRIORITY[task.priority] ?? null)}, ` +
      // `responsible` holds a discipline code despite the name; `discipline` is the
      // same thing written by a different part of the app. Either will do.
      `${sqlString(registry.discipline(task.discipline || task.responsible))}, ` +
      `${sqlDate(task.startDate)}, ${sqlDate(task.dueDate)}, ${sqlString(task.comment)}, ` +
      `${sqlString(task.description)}, ${sqlBool(task.done)}, ${sqlJson(task.fieldValues ?? {})}, ` +
      `${sqlBool(task.isPrinciple)}, ` +
      `${task.isPrinciple ? sqlDate(task.principleCreatedAt || task.startDate) : 'NULL'}, ` +
      `${taskIndex});`);

    // The lane keeps its identity. Its subtasks and events are the same rows already
    // in task.subtasks and task.events, matched back by id below.
    const laneOf = new Map();
    for (const [laneIndex, lane] of (task.tracks ?? []).entries()) {
      const laneId = idFor(lane.id);

      push('hub_task_lane',
        `INSERT INTO hub_task_lane (id, task_id, discipline_code, name, sort_order) VALUES ` +
        `(${sqlUuid(laneId)}, ${sqlUuid(taskId)}, ` +
        `${sqlString(registry.discipline(lane.discipline))}, ${sqlString(lane.label)}, ${laneIndex});`);

      for (const subtask of lane.subtasks ?? []) {
        if (subtask.id) laneOf.set(subtask.id, laneId);
      }
    }

    for (const [eventIndex, event] of (task.events ?? []).entries()) {
      importEvent(event, eventIndex, { column: 'task_id', ownerId: taskId });
    }

    for (const [subtaskIndex, subtask] of (task.subtasks ?? []).entries()) {
      importSubtask(subtask, subtaskIndex, taskId, null, laneOf);
    }
  }

  function importSubtask(subtask, index, taskId, parentId, laneOf) {
    const subtaskId = idFor(subtask.id);

    push('hub_subtask',
      `INSERT INTO hub_subtask (id, task_id, parent_subtask_id, lane_id, title, done, ` +
      `discipline_code, status_code, priority_code, start_date, due_date, ` +
      `is_principle, principle_created_at, sort_order) VALUES ` +
      `(${sqlUuid(subtaskId)}, ${sqlUuid(taskId)}, ${sqlUuid(parentId)}, ` +
      `${sqlUuid(laneOf.get(subtask.id) ?? null)}, ${sqlString(subtask.title)}, ` +
      `${sqlBool(subtask.done)}, ${sqlString(registry.discipline(subtask.discipline))}, ` +
      `${sqlString(TASK_STATUS[subtask.statusId] ?? null)}, ` +
      `${sqlString(PRIORITY[subtask.priority] ?? null)}, ` +
      `${sqlDate(subtask.startDate)}, ${sqlDate(subtask.dueDate)}, ` +
      `${sqlBool(subtask.isPrinciple)}, ` +
      `${subtask.isPrinciple ? sqlDate(subtask.principleCreatedAt || subtask.startDate) : 'NULL'}, ` +
      `${index});`);

    for (const [eventIndex, event] of (subtask.events ?? []).entries()) {
      importEvent(event, eventIndex, { column: 'subtask_id', ownerId: subtaskId });
    }

    for (const [childIndex, child] of (subtask.subtasks ?? []).entries()) {
      importSubtask(child, childIndex, taskId, subtaskId, laneOf);
    }
  }

  function importEvent(event, index, { column, ownerId }) {
    // The app breaks ties between same-day events by creation order, and the seed data
    // offsets createdAt by a second per step for exactly that reason. Where createdAt
    // is missing, the array's own order stands in -- it is the order they were added.
    const createdAt = event.createdAt
      ? sqlString(event.createdAt)
      : `${sqlDate(event.date)} + interval '${index} seconds'`;

    push('hub_event',
      `INSERT INTO hub_event (id, ${column}, status_code, event_date, end_date, round, ` +
      `assignee_discipline_code, title, note, created_at) VALUES ` +
      `(${sqlUuid(idFor(event.id))}, ${sqlUuid(ownerId)}, ${sqlString(event.status)}, ` +
      `${sqlDate(event.date)}, ${sqlDate(event.endDate)}, ` +
      `${Number.isInteger(event.round) && event.round > 0 ? event.round : 'NULL'}, ` +
      `${sqlString(registry.discipline(event.assignee))}, ${sqlString(event.title)}, ` +
      `${sqlString(event.note)}, ${createdAt});`);
  }

  // --- people -------------------------------------------------------------------

  // Staff belong to the practice, which is the one firm in the register marked
  // internal. Passed in by the caller as blob.__internalFirmId; absent in a test.
  const internalFirmId = blob.__internalFirmId ?? null;

  // Name -> uuid, because the meeting participant list names people rather than
  // referencing them: it was built by picking from a list of names.
  const staffByName = new Map();

  for (const member of blob.team ?? []) {
    const memberId = registry.personId(member.name, {
      firmId: internalFirmId,
      email: member.email,
      phone: member.phone,
      disciplineCode: registry.discipline(member.disc),
    });

    ids.set(member.id, memberId);
    staffByName.set(member.name, memberId);
    registry.assign(projectId, memberId, 'project_architect');
  }

  for (const consultant of blob.consultants ?? []) {
    const disciplineCode = registry.discipline(consultant.discCode)
      ?? registry.disciplineByHebrew(consultant.discipline);

    const firmId = registry.firmId(consultant.firm, { kind: 'consultant', disciplineCode });

    let leadPersonId = null;
    for (const contact of consultant.contacts ?? []) {
      if (!contact.name) continue;

      const contactId = registry.personId(contact.name, {
        firmId,
        email: contact.email,
        phone: contact.phone,
        mobile: contact.mobile,
      });

      if (contact.isLead && !leadPersonId) leadPersonId = contactId;
    }

    registry.participantId(projectId, firmId, disciplineCode, leadPersonId);
  }

  // --- meetings -----------------------------------------------------------------

  for (const meeting of blob.meetings ?? []) {
    const meetingId = idFor(meeting.id);

    push('hub_meeting',
      `INSERT INTO hub_meeting (id, project_id, track_id, title, meeting_date, recorded_by, distribution) ` +
      `VALUES (${sqlUuid(meetingId)}, ${sqlUuid(projectId)}, ${sqlUuid(idFor(meeting.trackId))}, ` +
      `${sqlString(meeting.title || 'ישיבה')}, ${sqlDate(meeting.date)}, ` +
      `${sqlString(meeting.recordedBy)}, ${sqlString(meeting.distribution)});`);

    for (const [index, participant] of (meeting.participants ?? []).entries()) {
      // A name typed in by hand stays a name. Creating an account for a visitor so
      // that the minutes can mention them would be the wrong way round.
      const linkedId = participant.isCustom ? null : staffByName.get(participant.name) ?? null;

      push('hub_meeting_participant',
        `INSERT INTO hub_meeting_participant (id, meeting_id, person_id, display_name, role_text, sort_order) ` +
        `VALUES (${sqlUuid(newId())}, ${sqlUuid(meetingId)}, ${sqlUuid(linkedId)}, ` +
        `${sqlString(participant.name)}, ${sqlString(participant.role)}, ${index});`);
    }

    for (const [index, item] of (meeting.items ?? []).entries()) {
      const forInformation = item.assignee === FOR_INFORMATION;

      push('hub_meeting_item',
        `INSERT INTO hub_meeting_item (id, meeting_id, number, topic, assignee_discipline_code, ` +
        `for_information, start_date, due_date, item_type_code, linked_kind, linked_id, sort_order) VALUES ` +
        `(${sqlUuid(idFor(item.id))}, ${sqlUuid(meetingId)}, ${sqlString(item.number)}, ` +
        `${sqlString(item.topic)}, ` +
        `${forInformation ? 'NULL' : sqlString(registry.discipline(item.assignee))}, ` +
        `${sqlBool(forInformation)}, ${sqlDate(item.startDate)}, ${sqlDate(item.dueDate)}, ` +
        `${sqlString(item.itemType)}, ${sqlString(item.linkedRecordKind)}, ` +
        `${sqlUuid(idFor(item.linkedRecordId))}, ${index});`);
    }
  }

  // --- licensing records --------------------------------------------------------

  for (const [index, goal] of (blob.licensingGoals ?? []).entries()) {
    push('hub_licensing_goal',
      `INSERT INTO hub_licensing_goal (id, project_id, title, target_date, done, sort_order) VALUES ` +
      `(${sqlUuid(idFor(goal.id))}, ${sqlUuid(projectId)}, ${sqlString(goal.title)}, ` +
      `${sqlDate(goal.targetDate)}, ${sqlBool(goal.done)}, ${index});`);
  }

  for (const [index, milestone] of (blob.licensingMilestones ?? []).entries()) {
    push('hub_licensing_milestone',
      `INSERT INTO hub_licensing_milestone (id, project_id, title, milestone_date, start_date, ` +
      `status, done, sort_order) VALUES ` +
      `(${sqlUuid(idFor(milestone.id))}, ${sqlUuid(projectId)}, ${sqlString(milestone.title)}, ` +
      `${sqlDate(milestone.date)}, ${sqlDate(milestone.startDate)}, ` +
      `${sqlString(milestone.status ?? 'not_started')}, ${sqlBool(milestone.done)}, ${index});`);
  }

  for (const principle of blob.standalonePrinciples ?? []) {
    push('hub_principle',
      `INSERT INTO hub_principle (id, project_id, description, discipline_code, created_at) VALUES ` +
      `(${sqlUuid(idFor(principle.id))}, ${sqlUuid(projectId)}, ${sqlString(principle.description)}, ` +
      `${sqlString(registry.discipline(principle.discipline))}, ` +
      `${sqlDate(principle.createdAt) === 'NULL' ? 'CURRENT_DATE' : sqlDate(principle.createdAt)});`);
  }

  for (const view of blob.ganttViews ?? []) {
    push('hub_saved_view',
      `INSERT INTO hub_saved_view (id, project_id, kind, name, owner_person_id, is_shared, definition) ` +
      `VALUES (${sqlUuid(newId())}, ${sqlUuid(projectId)}, 'gantt', ${sqlString(view.name)}, ` +
      `${sqlUuid(personId)}, false, ${sqlJson(view)});`);
  }

  return { counts };
}

module.exports = { importHub, TASK_STATUS, PRIORITY, FOR_INFORMATION };
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd /d/Coding/KkarcDB/tools/hub-import && node --test
```

Expected: PASS, 38 tests, 0 failing.

- [ ] **Step 5: Commit**

```bash
cd /d/Coding/KkarcDB
git add tools/hub-import/hub.js tools/hub-import/hub.test.js
git commit -m "feat(hub-import): map a project_hub blob to rows"
```

Use this commit body:

```
Three parts of this are decisions rather than transcription, each one from
reading the app rather than from preference.

task.tracks[] is a duplicate: migrateTask() copied subtasks and events into
a lane without removing them from the task, so 50 tasks hold identical id
sets in both places. Importing both would double every subtask in the
database. The lane keeps its identity and its subtasks are matched back by
id.

Collapsed groups, hidden columns, column order and saved views move to
hub_user_pref. On a shared row, one person collapsing a group collapses it
for everybody.

The meeting assignee field carried the string 'for information' to mean
nobody owns the line. It becomes a boolean, so the discipline column holds
only disciplines.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Task 12: Map the planning_dashboard blob to rows

**Files:**
- Create: `D:\Coding\KkarcDB\tools\hub-import\planning.js`
- Test: `D:\Coding\KkarcDB\tools\hub-import\planning.test.js`

**Interfaces:**
- Consumes: `Registry`, `sqlString`, `sqlUuid`, `sqlDate`, `newId` from `register.js`
- Produces: `importPlanning(blob, {projectId, registry}): {counts: Record<string, number>}` — `blob` is a `planning_dashboard_data_v4` export, which is the raw object, not wrapped

- [ ] **Step 1: Write the failing test**

Create `tools/hub-import/planning.test.js`:

```javascript
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { parseLookups } = require('./lookups.js');
const { Registry } = require('./register.js');
const { importPlanning } = require('./planning.js');

const LOOKUPS = parseLookups([
  'discipline\tARCH\tarchitecture\tאדריכלות',
  'discipline\tSTRC\tstructural\tקונסטרוקציה',
  'discipline\tELEC\telectrical\tחשמל',
  'discipline\t\tcommunications\tתקשורת',
  'firm\t11111111-1111-1111-1111-111111111111\tי. שני מהנדסים',
].join('\n'));

const PROJECT_ID = 'bbbbbbbb-0000-0000-0000-000000000001';

function sampleBlob() {
  return {
    projectName: 'Scratch',
    consultants: [
      { id: 'c1', discipline: 'אדריכלות', company: 'קנפו כלמור אדריכלים' },
      { id: 'c2', discipline: 'קונסטרוקציה', company: 'י.שני מהנדסים' },
      { id: 'c3', discipline: 'תקשורת', company: 'DCX' },
    ],
    docTypes: [{ id: 'd1', name: 'תכניות' }, { id: 'd2', name: 'מפרט' }],
    buildings: [{ id: 'b1', name: 'בניין 1' }, { id: 'b2', name: 'בניין 2' }],
    cells: {
      'b1|c2|d1': {
        status: 'progress',
        events: [
          { id: 'e1', status: 'progress', round: 1, date: '2026-03-01', endDate: '2026-03-01', dependsOn: null, createdAt: '2026-03-01T09:00:00.000Z' },
          { id: 'e2', status: 'sent', round: 1, date: '2026-04-01', endDate: '2026-04-01', dependsOn: 'e1', createdAt: '2026-04-01T09:00:00.000Z' },
        ],
      },
      'b2|c2|d1': { status: 'missing', events: [] },
    },
    kpis: [{ id: 'k1', name: 'מאושר', filterStatus: ['approved'], filterDocTypes: [] }],
    view: { rows: 'buildings', cols: 'consultants_x_docs' },
  };
}

function run(blob = sampleBlob()) {
  const registry = new Registry(LOOKUPS);
  const result = importPlanning(blob, { projectId: PROJECT_ID, registry });
  return { registry, result, sql: registry.statements.join('\n') };
}

test('a board is built from the three axes', () => {
  const { result } = run();

  assert.strictEqual(result.counts.hub_plan_board, 1);
  assert.strictEqual(result.counts.hub_plan_building, 2);
  assert.strictEqual(result.counts.hub_plan_doc_type, 2);
  assert.strictEqual(result.counts.hub_plan_consultant, 3);
  assert.strictEqual(result.counts.hub_plan_kpi, 1);
});

test('the pipe-delimited cell key becomes three foreign keys', () => {
  const { result, sql } = run();

  assert.strictEqual(result.counts.hub_plan_cell, 2);
  assert.doesNotMatch(sql, /\|/);
});

test('a cell with no events is still a cell', () => {
  // An empty cell is the normal starting state, and the board draws it as a dash.
  // Skipping it would make the grid ragged.
  const { result } = run();
  assert.strictEqual(result.counts.hub_plan_cell, 2);
  assert.strictEqual(result.counts.hub_event, 2);
});

test('a company name resolves against the register, not into a new firm', () => {
  // 'י.שני מהנדסים' here, 'י. שני מהנדסים' in the register. One firm.
  const { sql } = run();
  assert.match(sql, /11111111-1111-1111-1111-111111111111/);
  assert.doesNotMatch(sql, /INSERT INTO firm[^;]*שני/);
});

test('a Hebrew discipline name resolves to a code', () => {
  const { sql, registry } = run();

  assert.match(sql, /'communications'/);
  assert.strictEqual(registry.unmatched.length, 0);
});

test('event dependencies survive as references, not as blob ids', () => {
  const { registry } = run();

  const events = registry.statements.filter((s) => s.startsWith('INSERT INTO hub_event'));
  assert.strictEqual(events.length, 2);

  const firstUuid = (statement) => statement.match(/'([0-9a-f-]{36})'::uuid/)[1];
  assert.ok(events[1].includes(firstUuid(events[0])), 'the second event should depend on the first');
  assert.doesNotMatch(events[1], /'e1'/);
});

test('rounds are carried across, because the board shows them', () => {
  const { sql } = run();
  assert.match(sql, /INSERT INTO hub_event[^;]*, 1,/);
});

test('an empty blob produces no statements', () => {
  const { registry } = run({});
  assert.strictEqual(registry.statements.length, 0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /d/Coding/KkarcDB/tools/hub-import && node --test planning.test.js
```

Expected: FAIL with `Cannot find module './planning.js'`.

- [ ] **Step 3: Write the mapper**

Create `tools/hub-import/planning.js`:

```javascript
'use strict';

/**
 * One planning_dashboard blob, as rows.
 *
 * The board is buildings down, consultants across, each consultant split by document
 * type. Cells lived in an object keyed by "buildingId|consultantId|docTypeId" -- a
 * string no database can check and no join can use. Here the triple is three foreign
 * keys, and the events go into hub_event beside project_hub's, because both apps
 * implement the same status machine.
 *
 * Its consultants were free-text company names with no codes, which is how the same
 * practice ended up spelled two ways across the two apps. They resolve through the
 * register, so a column on this board is a firm engaged on the project.
 */

const { sqlString, sqlUuid, sqlDate, newId } = require('./register.js');

function importPlanning(blob, { projectId, registry }) {
  const counts = {
    hub_plan_board: 0, hub_plan_building: 0, hub_plan_doc_type: 0,
    hub_plan_consultant: 0, hub_plan_cell: 0, hub_plan_kpi: 0, hub_event: 0,
  };

  if (!blob || typeof blob !== 'object') return { counts };
  if (!blob.buildings && !blob.consultants && !blob.docTypes) return { counts };

  const push = (table, sql) => {
    registry.statements.push(sql);
    counts[table] += 1;
  };

  const boardId = newId();
  push('hub_plan_board',
    `INSERT INTO hub_plan_board (id, project_id, name, view_rows, view_cols) VALUES ` +
    `(${sqlUuid(boardId)}, ${sqlUuid(projectId)}, ${sqlString(blob.projectName || 'לוח תכנון')}, ` +
    `${sqlString(blob.view?.rows ?? 'buildings')}, ${sqlString(blob.view?.cols ?? 'consultants_x_docs')});`);

  const buildingIds = new Map();
  for (const [index, building] of (blob.buildings ?? []).entries()) {
    const id = newId();
    buildingIds.set(building.id, id);

    push('hub_plan_building',
      `INSERT INTO hub_plan_building (id, board_id, name, sort_order) VALUES ` +
      `(${sqlUuid(id)}, ${sqlUuid(boardId)}, ${sqlString(building.name)}, ${index});`);
  }

  const docTypeIds = new Map();
  for (const [index, docType] of (blob.docTypes ?? []).entries()) {
    const id = newId();
    docTypeIds.set(docType.id, id);

    push('hub_plan_doc_type',
      `INSERT INTO hub_plan_doc_type (id, board_id, name, sort_order) VALUES ` +
      `(${sqlUuid(id)}, ${sqlUuid(boardId)}, ${sqlString(docType.name)}, ${index});`);
  }

  const consultantIds = new Map();
  for (const [index, consultant] of (blob.consultants ?? []).entries()) {
    // The discipline is a Hebrew name here, not a code: this app never had codes.
    const disciplineCode = registry.disciplineByHebrew(consultant.discipline);
    const firmId = registry.firmId(consultant.company, { kind: 'consultant', disciplineCode });
    const participantId = registry.participantId(projectId, firmId, disciplineCode);

    const id = newId();
    consultantIds.set(consultant.id, id);

    push('hub_plan_consultant',
      `INSERT INTO hub_plan_consultant (id, board_id, project_participant_id, sort_order) VALUES ` +
      `(${sqlUuid(id)}, ${sqlUuid(boardId)}, ${sqlUuid(participantId)}, ${index});`);
  }

  // Blob event id -> new uuid, so dependsOn still points at something afterwards.
  const eventIds = new Map();
  const eventIdFor = (oldId) => {
    if (!oldId) return null;
    if (!eventIds.has(oldId)) eventIds.set(oldId, newId());
    return eventIds.get(oldId);
  };

  for (const [key, cell] of Object.entries(blob.cells ?? {})) {
    const [buildingKey, consultantKey, docTypeKey] = key.split('|');

    const buildingId = buildingIds.get(buildingKey);
    const consultantId = consultantIds.get(consultantKey);
    const docTypeId = docTypeIds.get(docTypeKey);

    // A key naming an axis that no longer exists is a leftover from a deleted row.
    // Reported rather than dropped silently: it is the one thing here that could mean
    // real work went missing.
    if (!buildingId || !consultantId || !docTypeId) {
      registry.unmatched.push(
        `planning cell: key "${key}" names a building, consultant or document type that is not in the blob. ` +
        `${(cell?.events ?? []).length} event(s) skipped.`,
      );
      continue;
    }

    const cellId = newId();
    push('hub_plan_cell',
      `INSERT INTO hub_plan_cell (id, board_id, building_id, consultant_id, doc_type_id) VALUES ` +
      `(${sqlUuid(cellId)}, ${sqlUuid(boardId)}, ${sqlUuid(buildingId)}, ` +
      `${sqlUuid(consultantId)}, ${sqlUuid(docTypeId)});`);

    // cell.status is derived from the events by the app on every read. Not imported:
    // a stored copy beside its own source is a second truth that goes stale.
    for (const [index, event] of (cell.events ?? []).entries()) {
      const createdAt = event.createdAt
        ? sqlString(event.createdAt)
        : `${sqlDate(event.date)} + interval '${index} seconds'`;

      push('hub_event',
        `INSERT INTO hub_event (id, plan_cell_id, status_code, event_date, end_date, round, ` +
        `depends_on_event_id, created_at) VALUES ` +
        `(${sqlUuid(eventIdFor(event.id))}, ${sqlUuid(cellId)}, ${sqlString(event.status)}, ` +
        `${sqlDate(event.date)}, ${sqlDate(event.endDate)}, ` +
        `${Number.isInteger(event.round) && event.round > 0 ? event.round : 'NULL'}, ` +
        `${sqlUuid(eventIdFor(event.dependsOn))}, ${createdAt});`);
    }
  }

  for (const [index, kpi] of (blob.kpis ?? []).entries()) {
    const statuses = (kpi.filterStatus ?? []).map((s) => sqlString(s)).join(', ');
    const docTypes = (kpi.filterDocTypes ?? [])
      .map((id) => docTypeIds.get(id))
      .filter(Boolean)
      .map((id) => sqlUuid(id))
      .join(', ');

    push('hub_plan_kpi',
      `INSERT INTO hub_plan_kpi (id, board_id, name, filter_status_codes, filter_doc_type_ids, sort_order) ` +
      `VALUES (${sqlUuid(newId())}, ${sqlUuid(boardId)}, ${sqlString(kpi.name)}, ` +
      `ARRAY[${statuses}]::text[], ARRAY[${docTypes}]::uuid[], ${index});`);
  }

  return { counts };
}

module.exports = { importPlanning };
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd /d/Coding/KkarcDB/tools/hub-import && node --test
```

Expected: PASS, 46 tests, 0 failing.

- [ ] **Step 5: Commit**

```bash
cd /d/Coding/KkarcDB
git add tools/hub-import/planning.js tools/hub-import/planning.test.js
git commit -m "feat(hub-import): map a planning_dashboard blob to rows"
```

Use this commit body:

```
The board kept its cells in an object keyed by
"buildingId|consultantId|docTypeId", which nothing can check and no join
can use. The triple becomes three foreign keys.

Its consultants were free-text company names with no codes, which is how
the same practice came to be spelled two ways across the two apps. They
resolve through the register, so a column on the board is a firm engaged on
the project.

A cell key naming an axis that is no longer in the blob is reported rather
than dropped quietly: it is the one thing here that could mean real work
went missing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Task 13: The command, and the PowerShell that runs it

**Files:**
- Create: `D:\Coding\KkarcDB\tools\hub-import\import.js`
- Create: `D:\Coding\KkarcDB\tools\hub-import\Import-Hub.ps1`
- Create: `D:\Coding\KkarcDB\tools\hub-import\.gitignore`

**Interfaces:**
- Consumes: `parseLookups`, `Registry`, `importHub`, `importPlanning`
- Produces: `out/import.sql`, `out/firm-merges.txt`, `out/unmatched.txt`, `out/counts.txt`, `out/attachments/` — and an exit code of `1` when `out/unmatched.txt` is non-empty

- [ ] **Step 1: Write the ignore file**

Create `tools/hub-import/.gitignore`:

```gitignore
# Exports carry consultants' mobile numbers and private addresses, the same reason
# Consultants/ is ignored. The generated SQL carries the same data.
in/
out/
node_modules/
check-firms.js
```

- [ ] **Step 2: Write the command**

Create `tools/hub-import/import.js`:

```javascript
'use strict';

/**
 * Turns an exported blob into SQL, and says what it could not decide.
 *
 * Writes nothing to the database. Import-Hub.ps1 dumps the lookups, runs this, shows
 * the reports, and applies the SQL once a person has read them -- which is the point
 * of generating a file rather than opening a connection.
 */

const fs = require('node:fs');
const path = require('node:path');

const { parseLookups } = require('./lookups.js');
const { Registry } = require('./register.js');
const { importHub } = require('./hub.js');
const { importPlanning } = require('./planning.js');

function parseArgs(argv) {
  const args = { in: null, lookups: null, project: null, out: 'out', person: null, planning: false };

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--planning') { args.planning = true; continue; }

    const name = flag.replace(/^--/, '');
    if (!(name in args)) throw new Error(`unknown option: ${flag}`);

    i += 1;
    if (i >= argv.length) throw new Error(`${flag} needs a value`);
    args[name] = argv[i];
  }

  for (const required of ['in', 'lookups', 'project']) {
    if (!args[required]) throw new Error(`--${required} is required`);
  }

  return args;
}

/**
 * Pulls base64 attachments out and writes them as files.
 *
 * The blob stored them as data URLs in the same document as everything else, so a
 * 3 MB PDF was 4.3 MB of characters rewritten on every save. They go to Supabase
 * Storage; this writes them where Import-Hub.ps1 can upload them, and rewrites the
 * task's attachment rows to carry the object key instead of the bytes.
 */
function extractAttachments(blob, outDir, registry, taskIdFor) {
  const directory = path.join(outDir, 'attachments');
  fs.mkdirSync(directory, { recursive: true });

  let written = 0;

  for (const sheet of blob.sheets ?? []) {
    for (const task of sheet.tasks ?? []) {
      for (const attachment of task.attachments ?? []) {
        if (!attachment.data || !attachment.name) continue;

        const match = /^data:([^;]*);base64,(.*)$/s.exec(attachment.data);
        if (!match) {
          registry.unmatched.push(`attachment: "${attachment.name}" is not a base64 data URL; skipped.`);
          continue;
        }

        const [, mimeType, base64] = match;
        const bytes = Buffer.from(base64, 'base64');

        // The key is the task's new uuid and the filename, so two tasks can hold
        // attachments with the same name without one overwriting the other.
        const taskId = taskIdFor(task.id);
        const storageKey = `${taskId}/${attachment.name}`;
        const filePath = path.join(directory, taskId, attachment.name);

        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, bytes);
        written += 1;

        registry.statements.push(
          `INSERT INTO hub_attachment (id, task_id, filename, mime_type, size_bytes, storage_key) VALUES ` +
          `(gen_random_uuid(), '${taskId}'::uuid, ` +
          `'${String(attachment.name).replace(/'/g, "''")}', ` +
          `'${String(mimeType || 'application/octet-stream').replace(/'/g, "''")}', ` +
          `${bytes.length}, '${storageKey.replace(/'/g, "''")}');`,
        );
      }
    }
  }

  return written;
}

function main(argv) {
  const args = parseArgs(argv);

  const lookups = parseLookups(fs.readFileSync(args.lookups, 'utf8'));

  const projectId = lookups.projects.get(args.project);
  if (!projectId) {
    console.error(
      `error: no project ${args.project} in the register.\n` +
      `       Import it with kkarcdb-import first, or check the code is year-sequence, e.g. 2017-03.`,
    );
    return 1;
  }

  const exported = JSON.parse(fs.readFileSync(args.in, 'utf8'));

  // A project_hub export is wrapped by the export button; a planning_dashboard export
  // is the raw object, because that app writes its own file.
  const blob = args.planning ? exported : (exported.data ?? exported);

  const registry = new Registry(lookups);

  fs.mkdirSync(args.out, { recursive: true });

  let counts;
  if (args.planning) {
    ({ counts } = importPlanning(blob, { projectId, registry }));
  } else {
    ({ counts } = importHub(blob, { projectId, registry, personId: args.person }));

    // hub.js mints a uuid per blob id; the same function has to produce the same
    // answer here, so the attachment pass reuses the map it built.
    const taskIdFor = (oldId) => registry.blobIds?.get(oldId) ?? null;
    counts.hub_attachment = extractAttachments(blob, args.out, registry, taskIdFor);
  }

  const sql = [
    '-- Generated by tools/hub-import. Read it before applying it.',
    `-- Source: ${path.basename(args.in)}`,
    `-- Project: ${args.project} (${projectId})`,
    '',
    ...registry.statements,
    '',
  ].join('\n');

  fs.writeFileSync(path.join(args.out, 'import.sql'), sql, 'utf8');

  fs.writeFileSync(
    path.join(args.out, 'firm-merges.txt'),
    registry.merges.length
      ? `${registry.merges.join('\n')}\n`
      : 'No firm names needed merging.\n',
    'utf8',
  );

  fs.writeFileSync(
    path.join(args.out, 'unmatched.txt'),
    registry.unmatched.length
      ? `${registry.unmatched.join('\n')}\n`
      : 'Nothing went unmatched.\n',
    'utf8',
  );

  const countLines = Object.entries(counts)
    .map(([table, n]) => `${String(n).padStart(6)}  ${table}`)
    .join('\n');

  fs.writeFileSync(path.join(args.out, 'counts.txt'), `${countLines}\n`, 'utf8');

  console.log(countLines);
  console.log(`\n${registry.statements.length} statements -> ${path.join(args.out, 'import.sql')}`);
  console.log(`${registry.merges.length} firm merge(s), ${registry.unmatched.length} unmatched`);

  // A non-zero exit stops Import-Hub.ps1 before it applies anything. Everything in
  // unmatched.txt is something a person has to decide, and deciding it after the rows
  // are in is much more work than deciding it now.
  if (registry.unmatched.length > 0) {
    console.error(`\nRead ${path.join(args.out, 'unmatched.txt')} and fix the seed before applying.`);
    return 1;
  }

  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { main, parseArgs };
```

- [ ] **Step 3: Expose the blob-id map that the attachment pass needs**

`import.js` reads `registry.blobIds`. Add it to `hub.js` so the attachment pass mints
the same uuid for a task that the task's own INSERT used.

In `tools/hub-import/hub.js`, immediately after `const ids = new Map();`, add:

```javascript
  // Exposed so a later pass -- the attachment extraction -- can ask for the uuid a
  // blob id was given, rather than minting a second one and orphaning the row.
  registry.blobIds = ids;
```

- [ ] **Step 4: Verify the attachment pass finds the right task**

Add to `tools/hub-import/hub.test.js`:

```javascript
test('the blob id map is exposed for later passes', () => {
  const { registry } = run();

  // The attachment pass runs after importHub and has to mint the same uuid for a
  // task that the task's own INSERT used, or the attachment points at nothing.
  assert.ok(registry.blobIds instanceof Map);

  const taskUuid = registry.blobIds.get('t1');
  assert.match(taskUuid, /^[0-9a-f-]{36}$/);

  const taskInsert = registry.statements.find((s) => s.startsWith('INSERT INTO hub_task '));
  assert.ok(taskInsert.includes(taskUuid), 'the map should name the uuid the task was written with');
});
```

Run:

```bash
cd /d/Coding/KkarcDB/tools/hub-import && node --test
```

Expected: PASS, 47 tests, 0 failing.

- [ ] **Step 5: Write the PowerShell wrapper**

Create `tools/hub-import/Import-Hub.ps1`:

```powershell
<#
.SYNOPSIS
    Imports a dashboard export into the register.

.DESCRIPTION
    Dumps what the register already knows, generates SQL from the export, shows the
    reports, and applies the SQL only after you have said yes.

    Nothing is written until the last step, and -WhatIf stops before it.

.EXAMPLE
    . ..\..\env.ps1
    .\Import-Hub.ps1 -In .\in\project_hub_export_2026-09-15.json -Project 2017-03 -WhatIf
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $In,
    [Parameter(Mandatory)] [string] $Project,
    [string] $OutDir = 'out',
    [string] $Person,
    [switch] $Planning,
    [switch] $WhatIf
)

$ErrorActionPreference = 'Stop'

if (-not $env:KKARCDB_CONNECTION) {
    Write-Error 'Set KKARCDB_CONNECTION first. Dot-source env.ps1: . ..\..\env.ps1'
}

if (-not (Test-Path $In)) {
    Write-Error "No such export: $In"
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$lookupsPath = Join-Path $OutDir 'lookups.tsv'

# Three queries, one tab-separated stream. -A is unaligned and -t drops the header, so
# the output is data rather than a table somebody has to parse around.
$lookupQuery = @'
SELECT 'discipline' || E'\t' || coalesce(legacy_code, '') || E'\t' || code || E'\t' || coalesce(name_he, '')
FROM discipline
UNION ALL
SELECT 'firm' || E'\t' || id::text || E'\t' || name FROM firm
UNION ALL
SELECT 'project' || E'\t' || id::text || E'\t' || project_code(year, sequence) FROM project;
'@

Write-Host 'Reading what the register already knows...'
psql $env:KKARCDB_CONNECTION -At -c $lookupQuery | Set-Content -Path $lookupsPath -Encoding utf8

if ($LASTEXITCODE -ne 0) { Write-Error 'Could not read the lookups. Check KKARCDB_CONNECTION.' }

$rows = (Get-Content $lookupsPath | Measure-Object -Line).Lines
Write-Host "  $rows rows"

$nodeArgs = @('import.js', '--in', $In, '--lookups', $lookupsPath, '--project', $Project, '--out', $OutDir)
if ($Person)   { $nodeArgs += @('--person', $Person) }
if ($Planning) { $nodeArgs += '--planning' }

Write-Host "`nGenerating SQL..."
node @nodeArgs
$generated = $LASTEXITCODE

Write-Host "`n--- firm merges ---"
Get-Content (Join-Path $OutDir 'firm-merges.txt')

Write-Host "`n--- unmatched ---"
Get-Content (Join-Path $OutDir 'unmatched.txt')

if ($generated -ne 0) {
    Write-Error 'The import left things unmatched. Fix them and run again; nothing has been written.'
}

if ($WhatIf) {
    Write-Host "`n-WhatIf: stopping before applying. Read $(Join-Path $OutDir 'import.sql')."
    return
}

$answer = Read-Host "`nApply $(Join-Path $OutDir 'import.sql') to the register? (yes/no)"
if ($answer -ne 'yes') {
    Write-Host 'Nothing applied.'
    return
}

# -1 wraps the file in one transaction: a failure half way leaves the register as it
# was, rather than as a project somebody has to unpick by hand.
psql $env:KKARCDB_CONNECTION -v ON_ERROR_STOP=1 -1 -f (Join-Path $OutDir 'import.sql')

if ($LASTEXITCODE -ne 0) { Write-Error 'The SQL failed. Nothing was applied.' }

Write-Host "`nApplied. Attachments, if any, are in $(Join-Path $OutDir 'attachments') and still need uploading to the hub-attachments bucket."
```

- [ ] **Step 6: Run it against a scratch database, without applying**

```bash
cd /d/Coding/KkarcDB && pwsh -File tools/hub-import/Import-Hub.ps1 -In tools/hub-import/in/project_hub_export_2026-09-15.json -Project 2017-03 -WhatIf
```

Expected: a table of counts, the two reports, and `-WhatIf: stopping before applying`.
If `unmatched.txt` names a discipline, add it to `db/seed/002_hub_disciplines.sql`,
re-run the seed, and run this again.

- [ ] **Step 7: Commit**

```bash
cd /d/Coding/KkarcDB
git add tools/hub-import/import.js tools/hub-import/Import-Hub.ps1 tools/hub-import/.gitignore tools/hub-import/hub.js tools/hub-import/hub.test.js
git commit -m "feat(hub-import): generate the SQL, and a script that applies it"
```

Use this commit body:

```
Import-Hub.ps1 dumps what the register knows, generates the SQL, shows the
two reports, and applies nothing until somebody types yes. The generated
file is applied with -1, so a failure half way leaves the register as it
was rather than as a project to unpick by hand.

Anything unmatched exits non-zero and stops the script before it writes.
Deciding what an unmapped discipline means is much cheaper before the rows
are in than after.

Attachments come out of the blob as files. They were base64 data URLs in
the same document as everything else, so a 3 MB PDF was 4.3 MB of
characters rewritten on every save.

in/ and out/ are ignored, for the reason Consultants/ is: these carry
consultants' mobile numbers and private addresses.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Task 14: Verify the import against the source

The last task, and the one that decides whether any of this worked.

**Files:**
- Create: `D:\Coding\KkarcDB\tools\hub-import\Verify-Import.ps1`

**Interfaces:**
- Consumes: `out/counts.txt` from Task 13, and the database after applying
- Produces: a comparison table, and a non-zero exit when any count disagrees

- [ ] **Step 1: Write the verifier**

Create `tools/hub-import/Verify-Import.ps1`:

```powershell
<#
.SYNOPSIS
    Compares what the import said it would write against what the register now holds.

.DESCRIPTION
    The import counts rows as it generates them. This counts them in the database. A
    disagreement means an ON CONFLICT DO NOTHING swallowed something, which is exactly
    the failure that leaves no trace anywhere else.

.EXAMPLE
    . ..\..\env.ps1
    .\Verify-Import.ps1 -Project 2017-03
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $Project,
    [string] $OutDir = 'out'
)

$ErrorActionPreference = 'Stop'

if (-not $env:KKARCDB_CONNECTION) {
    Write-Error 'Set KKARCDB_CONNECTION first. Dot-source env.ps1: . ..\..\env.ps1'
}

$countsPath = Join-Path $OutDir 'counts.txt'
if (-not (Test-Path $countsPath)) { Write-Error "No $countsPath. Run Import-Hub.ps1 first." }

# Every table reached from the project, so the comparison is per project rather than
# per database -- a second import must not make the first one look wrong.
$query = @'
WITH p AS (SELECT id FROM project WHERE project_code(year, sequence) = :'code')
SELECT 'hub_sheet',        count(*) FROM hub_sheet        WHERE project_id IN (SELECT id FROM p)
UNION ALL SELECT 'hub_project_track', count(*) FROM hub_project_track WHERE project_id IN (SELECT id FROM p)
UNION ALL SELECT 'hub_group', count(*) FROM hub_group g
    WHERE g.sheet_id IN (SELECT id FROM hub_sheet WHERE project_id IN (SELECT id FROM p))
UNION ALL SELECT 'hub_field', count(*) FROM hub_field f
    WHERE f.sheet_id IN (SELECT id FROM hub_sheet WHERE project_id IN (SELECT id FROM p))
UNION ALL SELECT 'hub_task', count(*) FROM hub_task t
    WHERE t.sheet_id IN (SELECT id FROM hub_sheet WHERE project_id IN (SELECT id FROM p))
UNION ALL SELECT 'hub_task_lane', count(*) FROM hub_task_lane l
    WHERE l.task_id IN (SELECT t.id FROM hub_task t
        JOIN hub_sheet s ON s.id = t.sheet_id WHERE s.project_id IN (SELECT id FROM p))
UNION ALL SELECT 'hub_subtask', count(*) FROM hub_subtask sub
    WHERE sub.task_id IN (SELECT t.id FROM hub_task t
        JOIN hub_sheet s ON s.id = t.sheet_id WHERE s.project_id IN (SELECT id FROM p))
UNION ALL SELECT 'hub_event', count(*) FROM hub_event e
    WHERE e.task_id IN (SELECT t.id FROM hub_task t
            JOIN hub_sheet s ON s.id = t.sheet_id WHERE s.project_id IN (SELECT id FROM p))
       OR e.subtask_id IN (SELECT sub.id FROM hub_subtask sub
            JOIN hub_task t ON t.id = sub.task_id
            JOIN hub_sheet s ON s.id = t.sheet_id WHERE s.project_id IN (SELECT id FROM p))
       OR e.plan_cell_id IN (SELECT c.id FROM hub_plan_cell c
            JOIN hub_plan_board b ON b.id = c.board_id WHERE b.project_id IN (SELECT id FROM p))
UNION ALL SELECT 'hub_meeting', count(*) FROM hub_meeting WHERE project_id IN (SELECT id FROM p)
UNION ALL SELECT 'hub_meeting_item', count(*) FROM hub_meeting_item i
    WHERE i.meeting_id IN (SELECT id FROM hub_meeting WHERE project_id IN (SELECT id FROM p))
UNION ALL SELECT 'hub_meeting_participant', count(*) FROM hub_meeting_participant mp
    WHERE mp.meeting_id IN (SELECT id FROM hub_meeting WHERE project_id IN (SELECT id FROM p))
UNION ALL SELECT 'hub_licensing_goal', count(*) FROM hub_licensing_goal WHERE project_id IN (SELECT id FROM p)
UNION ALL SELECT 'hub_licensing_milestone', count(*) FROM hub_licensing_milestone WHERE project_id IN (SELECT id FROM p)
UNION ALL SELECT 'hub_principle', count(*) FROM hub_principle WHERE project_id IN (SELECT id FROM p)
UNION ALL SELECT 'hub_saved_view', count(*) FROM hub_saved_view WHERE project_id IN (SELECT id FROM p)
UNION ALL SELECT 'hub_plan_board', count(*) FROM hub_plan_board WHERE project_id IN (SELECT id FROM p)
UNION ALL SELECT 'hub_plan_cell', count(*) FROM hub_plan_cell c
    WHERE c.board_id IN (SELECT id FROM hub_plan_board WHERE project_id IN (SELECT id FROM p));
'@

$actual = @{}
psql $env:KKARCDB_CONNECTION -At -F "`t" -v code=$Project -c $query | ForEach-Object {
    $parts = $_ -split "`t"
    if ($parts.Count -eq 2) { $actual[$parts[0]] = [int]$parts[1] }
}

$expected = @{}
Get-Content $countsPath | ForEach-Object {
    $parts = ($_ -replace '^\s+', '') -split '\s+', 2
    if ($parts.Count -eq 2) { $expected[$parts[1].Trim()] = [int]$parts[0] }
}

$rows = foreach ($table in ($expected.Keys | Sort-Object)) {
    if (-not $actual.ContainsKey($table)) { continue }

    [pscustomobject]@{
        Table    = $table
        Expected = $expected[$table]
        Actual   = $actual[$table]
        Agrees   = if ($expected[$table] -eq $actual[$table]) { 'yes' } else { 'NO' }
    }
}

$rows | Format-Table -AutoSize

$disagreements = @($rows | Where-Object { $_.Agrees -eq 'NO' })

if ($disagreements.Count -gt 0) {
    Write-Error "$($disagreements.Count) table(s) disagree. An ON CONFLICT DO NOTHING probably swallowed rows; read out/import.sql for the tables listed."
}

Write-Host 'Every table agrees.'
```

- [ ] **Step 2: Run it**

```bash
cd /d/Coding/KkarcDB/tools/hub-import && pwsh -File Verify-Import.ps1 -Project 2017-03
```

Expected: a table where every `Agrees` column reads `yes`, and `Every table agrees.`

- [ ] **Step 3: Check one project by eye, against the source**

Counts agreeing does not mean the data is right. Open the original `project_hub.html`
alongside a query of the imported project and compare, for one sheet:

```bash
psql "$KKARCDB_CONNECTION" -c "SELECT t.title, t.status_code, t.discipline_code, t.due_date, count(s.id) AS subtasks FROM hub_task t LEFT JOIN hub_subtask s ON s.task_id = t.id JOIN hub_sheet sh ON sh.id = t.sheet_id JOIN project p ON p.id = sh.project_id WHERE project_code(p.year, p.sequence) = '2017-03' GROUP BY t.id ORDER BY t.sort_order"
```

Check: the task titles are in the same order, the statuses match the chips in the app,
the disciplines are the right practices, and the subtask counts match what the app
shows expanded. **This is the step that catches a wrong discipline mapping**, which no
count can.

- [ ] **Step 4: Commit**

```bash
cd /d/Coding/KkarcDB
git add tools/hub-import/Verify-Import.ps1
git commit -m "test(hub-import): compare the import against what it said it wrote"
```

Use this commit body:

```
The import counts rows as it generates them; this counts them in the
database. A disagreement means an ON CONFLICT DO NOTHING swallowed
something, which is the failure that leaves no trace anywhere else.

Counts agreeing is not the same as the data being right, so the plan's last
step is reading one sheet against the running app. That is what catches a
wrong discipline mapping, which no count can.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Done, and what follows

When every task is checked off:

- The KkarcDB database holds the three dashboards' data, at schema version `012`.
- `dotnet test` passes 216 tests; `node --test` in `tools/hub-import` passes 47.
- `db/verify.sql` applies the whole schema to a scratch database and rolls back clean.
- One project is visible in SQL and has been read against the running app.

**The front end is still on `localStorage`.** Nothing in this plan changes how the
three HTML files load or save, apart from the export button. That is deliberate: the
API's shape depends on what the import proves about the data, and writing it first
would be guessing.

The follow-on plan covers `/api/hub/*` endpoints in `KKarcDB.Api`, the adapter that
replaces `localStorage.getItem`/`setItem` with `fetch`, serving the three pages from
the API's `wwwroot`, and the Supabase Storage bucket for attachments. Write it after
Task 14, not before.

---

## Self-review

**Spec coverage.** Every table in the spec's table map has a migration: the four
vocabularies and three alterations in Task 2, the nineteen project-level tables across
Tasks 4 and 5, the six planning tables in Task 6, the two per-user tables in Task 7.
The spec's four migration-path steps map to Tasks 1, 9–11, 13 and 14. The spec's two
open questions are resolved: the discipline map is measured and in Task 3, and the
firm-name rule is in Task 9 and verified against the real names.

**Two spec items deliberately deferred**, both flagged above rather than dropped:

| Spec item | Where it went |
|---|---|
| `/api/hub/*` endpoints, the `fetch` adapter, serving from `wwwroot` | the follow-on plan; the Scope section says so |
| Uploading attachment bytes to the Storage bucket | Task 13 extracts them to `out/attachments/`; the upload needs the bucket, which the follow-on plan creates |

**One spec table has no dedicated task**: `hub_activity`, created in Task 5's migration
but never written to by the ETL. That is correct rather than an omission. It records
who changed what from now on, and the blob has no history to backfill it from.

**Placeholders:** none. Every step carries the code or the command it needs.

**Types checked across tasks.** `registry.statements`, `registry.merges` and
`registry.unmatched` are arrays of strings in Tasks 10, 11, 12 and 13. `registry.blobIds`
is introduced in Task 13 Step 3 and tested in Step 4. `importHub` and `importPlanning`
both return `{counts}`. `sqlUuid` throws on a non-uuid, which is why `idFor` returns
`null` rather than an empty string.

**Verified while writing, not assumed.** The JavaScript in Tasks 9, 10, 11 and 12 was
extracted and run: 16, 27, 38 and 46 tests pass cumulatively, 47 once Task 13 adds one.
The firm rule was run over all 543 firm names the consultant load put into the
register, giving 498 firms and 44 merges, each read by hand. The SQL was not executed;
no PostgreSQL was reachable in this session, which is why every migration task runs its
tests before and after.

**Revised after `797e7cb`.** This plan was first written against a register holding 15
disciplines and migrations up to 006. The consultant load changed both. What moved:
migrations renumbered to 008–012 because `007_consultant_contacts.sql` took the number;
`person.mobile` dropped from Task 2 because that migration already added it; the
discipline seed reduced to updates only, because all 51 disciplines now exist and
inserting would have duplicated `project_mgmt` as `project_management` and `hydrology`
as `drainage`; test counts restated from 202 rather than 183; and the firm rule rebuilt
to measure the distinctive part, after the old one was found to merge four pairs of
unrelated firms.
