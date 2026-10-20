# Mail scan — schedule and manual scan (contract)

Addition to `2026-10-20-mail-task-suggestions-design.md`, agreed 2026-10-21. Each person picks the days and hours
their mailbox is scanned (Settings → גישה מהירה → סריקת מייל), and can start a scan by hand from the Hub, the
Start menu or Settings. The schedule lives on the server, per person, so it can be changed from the Hub without
reinstalling, and the future Graph-based scan can use the same schedule.

## Schedule object

```
{ days: [0..6],              // 0 = Sunday … 6 = Saturday; empty = no automatic scans (manual only)
  times: ['HH:MM', …] }      // 24-hour, 00:00–23:59; 0–12 entries; empty = manual only
```

- Default (no schedule saved yet): `{ days: [0,1,2,3,4], times: ['08:00','12:00','16:00'] }`.
- The server normalises on save: days unique, integers 0–6, sorted; times unique, zero-padded `HH:MM`, sorted.
  Anything else → 400 with `{ error }`.
- Times are the **scanning computer's local time** (the scanner decides when it is due); the page shows them as
  typed.

## Server (`tools/local-server/mail-store.js`, `mail.js`)

Stored in the person's suggestions document: `schedule` (absent = default) and `lastScanAt` (ISO, server clock).

| Route | Auth | Body / answer |
|---|---|---|
| `GET /api/mail-intake/schedule` | scanner key (Bearer) | → `{ schedule }` |
| `POST /api/mail-intake/ran` | scanner key | → `{ ok: true }`; sets `lastScanAt` to now. Called after every completed scan, also when nothing was new. |
| `GET /api/mail-connection` | signed in | existing `{ key, ai }` plus `schedule`, `lastScanAt` (or `null`) |
| `PUT /api/mail-connection/schedule` | signed in | body `{ days, times }` → `{ schedule }` (normalised) or 400 `{ error }` |
| `GET /api/mail-suggestions` | signed in | existing answer plus `scan: { schedule, lastScanAt }` |

## Scanner (`tools/mail-scan/`)

- The scheduled task runs **every 15 minutes, all day**, and at sign-in. Each run first decides whether a scan is
  due, **before touching Outlook**:
  - get the schedule from `GET /api/mail-intake/schedule`; remember it in the state file; if the server can't be
    reached, use the remembered one (else the default);
  - the latest scheduled slot ≤ now (looking back up to 7 days; a slot = a listed day at a listed time, local
    clock); due when the state's `lastScan` is earlier than that slot (or missing). Not due → exit quietly
    (no log line, no Outlook).
- `-Now` skips the check (manual scan). `-DryRun` also skips it (it never sends).
- After a scan that reached the server (including "nothing new"): `state.lastScan = now` (local, ISO) and
  `POST /api/mail-intake/ran`.
- Manual scan feedback: with `-Now`, when the run produced no new suggestion notification, show
  `Show-Toast 'Project Hub — סריקת מייל' 'הסריקה הסתיימה. אין הצעות חדשות.'` (no buttons; the toast's own
  fallback window applies).
- `run-hidden.vbs`: an optional second argument `now` adds `-Now`.
- `Install-MailScan.ps1`: the task's trigger becomes daily from 00:00 repeating every 15 minutes for 1 day
  (plus the sign-in trigger, with its existing fallback); registers the URL protocol `projecthub-scan:`
  (HKCU, like `projecthub-mail:`) whose command is `wscript.exe //B //Nologo "<run-hidden.vbs>" "<Hub>" now`;
  the Start-menu shortcut "סרוק מייל עכשיו" passes `now` too. `Uninstall-MailScan.ps1` removes the protocol.

## Page (`project_hub_01.html`)

- **Settings → סריקת מייל**, new part "מתי לסרוק": seven day toggles (א ב ג ד ה ו ש = 0…6), the times as chips
  with ×, an `<input type="time">` + "הוסף שעה". Every change saves at once (`PUT …/schedule`), with a short
  "נשמר" / the error. A line: "נסרק לאחרונה: … · הסריקה הבאה: …", and a **"סרוק עכשיו"** button.
- **The tray, the drawer and the `?quick=mail` window**: in the footer, "נסרק לאחרונה: …" and a **"סרוק עכשיו"**
  link-button.
- **סרוק עכשיו**: `location.href = 'projecthub-scan:now'` (Chrome asks once to allow opening it), then a short
  note "הסריקה התחילה במחשב שלך. אם לא קורה כלום — הסורק לא מותקן במחשב הזה." and faster polling of
  `/api/mail-suggestions` (every 5 s, up to 2 minutes, stopping early once `lastScanAt` changes).
- Pure helpers, mirrored in `tests/mail-suggestions.test.js`:
  - `nextMailScan(schedule, now)` → the next slot strictly after `now` (a Date, local time) within 8 days, or `null`;
  - `mailScanWhen(date, now)` → `{ day: 'today' | 'tomorrow' | 'DD.MM', time: 'HH:MM' }` (the component turns it
    into text with `tx('היום {t}')`, `tx('מחר {t}')`, `tx('{d} {t}')`).
