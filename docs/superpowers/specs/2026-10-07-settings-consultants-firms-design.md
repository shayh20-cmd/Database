# Settings: consultants and firms, edited in the register — design

**Date:** 2026-10-07 · **Status:** approved in conversation, awaiting review of this document

Project Hub reads the register — KKarcDB's PostgreSQL on Supabase, reached through
`KKarcDB.Api` — and never writes to it (`2026-10-04-register-link-design.md`). This design adds
two sections to Settings, **Consultants** and **Firms**, that read *and write* the register's
consultants and the firms they work at. They are the same records KK Hub's People page edits:
a change made in one shows in the other.

It reverses that design's decisions 1 and 4 (read-only; consultants edited only in KK Hub) for
people and firms. Projects, project members and tags stay read-only from the hub.

## Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Where do consultants and firms live? | **In the register.** The hub edits the register's own `person` and `firm` rows |
| 2 | How does the hub write? | **Through KKarcDB.Api's existing endpoints**, never the Supabase tables directly. The database has no row-level security, so the API is the only gate; its role checks, compare-and-set and `change_log` live there |
| 3 | Which records? | **Kind = consultant only**: people and firms carrying the `kind/consultant` tag. Anything created here gets that tag. Clients, suppliers and the rest stay in KK Hub |
| 4 | Who may edit? | Someone whose **register role** is editor, manager or admin, **and** whose hub role is not Viewer. Everyone else sees the same screens read-only |
| 5 | Delete and merge | **Not here.** The API has no delete for firms or contacts; merging duplicates stays in KK Hub, one link away |
| 6 | Changes in KkarcDB or KK Hub | **None.** Every endpoint, and CORS for the hub's origins, already exists |

## 1. Connection and permission

The register configuration, the Microsoft sign-in through Supabase and the client are the ones
`register-link.js` and `register-link-ui.js` already provide. Two additions:

- **Who is signed in.** `GET /api/me` returns `{ authenticated, name, nameHe, role, personId }`.
  It is read once per sign-in and held in the register store. The hub may edit when
  `role` is `editor`, `manager` or `admin` and `myOfficeRole() !== 'viewer'`.
- **Writing.** The client gains `send(method, path, body)` beside `get`, for `POST`, `PATCH` and
  `PUT` only, with the same token handling: one refresh and retry on 401. Its answers:

  | API reply | Answer |
  |---|---|
  | 2xx | `{ state: 'ok', data }` |
  | no token, before or after the refresh | `{ state: 'signed-out' }` |
  | 403, or 401 again with the refreshed token | `{ state: 'refused', subject }` |
  | 409 with `code: 'changed'` | `{ state: 'changed', current }` — what the other person saved |
  | other 409, 400 | `{ state: 'rejected', code, error }` — `not_a_contact`, `invalid_value`, … |
  | network failure, 5xx, unreadable body | `{ state: 'unreachable' }` |

`KKARCDB_ALLOWED_ORIGINS` already lists `https://kkarc-hub.azurewebsites.net` and
`http://localhost:3000` (added 2026-10-04), and the API's CORS policy allows any method, so
`PATCH` and `PUT` pass without an outside change.

## 2. Data

### Reads

`/api/persons`, `/api/firms` and `/api/tags`, which the register store already loads once per
page load for the projects' consultants tables. The fields used:

- **person:** `id, name, nameHe, firmId, firmName, email, phone, mobile, notes, isContact,
  tags, projectCount, updatedAt`
- **firm:** `id, name, tags, phone, email, address, notes, contactCount, updatedAt`
- **tag:** `typeCode, code, nameHe, nameEn, sortOrder`

Rules:

- A **consultant** is a person whose `tags.kind` includes `consultant`. A **consultant firm** is
  a firm whose `tags.kind` includes `consultant`.
- **Disciplines** are the tags with `typeCode === 'discipline'`, in `sortOrder`. A consultant's
  disciplines are their own `tags.discipline` (since migration 028 nothing is inherited from the
  firm). The discipline picker lists the consultant's firm's disciplines first, then the rest.
- The **firm picker** lists consultant firms, plus the consultant's current firm if it is not
  one, so that a value is never shown that the picker cannot hold.
- A person with `isContact: false` is a **user** of the register. `PATCH /api/contacts` refuses
  users (`not_a_contact`) and `/api/people` is admin-only, so a user is listed read-only with the
  line *"משתמש במאגר — עריכה ב-KK Hub"* and the KK Hub link.

### Writes

| Action | Request |
|---|---|
| New consultant | `POST /api/contacts` `{ name, firmId, email, mobile, tags: { kind: ['consultant'], discipline: [...] } }` |
| Edit a consultant's field | `PATCH /api/contacts/{id}` `{ field, value, was }` — `name`, `nameHe`, `firmId`, `email`, `phone`, `mobile`, `notes` |
| A consultant's disciplines | `PUT /api/persons/{id}/tags/discipline` `{ codes, was }` |
| New firm | `POST /api/firms` `{ name, tags: { kind: ['consultant'], discipline: [...] } }` |
| Edit a firm's field | `PATCH /api/firms/{id}` `{ field, value, was }` — `name`, `phone`, `email`, `address`, `notes` |
| A firm's disciplines | `PUT /api/firms/{id}/tags/discipline` `{ codes, was }` |

`was` is the value the screen showed when editing began. After every successful write the store
re-reads persons, firms and tags, so the open project's consultants table follows too.

### When a write fails

- **`changed`:** the cell takes `current`, the value someone else saved, and a line under the
  table says the field was changed meanwhile by someone else and shows the new value. The API
  does not say who.
- **`rejected`:** known codes get the hub's own sentence in both languages (`not_a_contact`,
  `invalid_value`); any other code gets a general "the register refused the change" with the
  API's own message beneath it.
- **`refused`, `signed-out`, `unreachable`:** the edit is undone on screen and the section shows
  the same notice the consultants table shows for that state (§3).

## 3. The screens

Settings' menu becomes: **צוות · יועצים · משרדים · ספרייה · גרפיקה · גישה מהירה · Claude**
(English: Team · Consultants · Firms · Library · Graphics · Quick access · Claude).

### Consultants

- **Header:** the title, a count, and a search over name, Hebrew name, firm, discipline, phone
  and email. Opened from a firm's count, a removable chip filters the list to that firm.
- **Table:** Consultant (name) · Firm · Disciplines · Mobile · Phone · Email · Projects
  (`projectCount`) · a link to the person in KK Hub (`{hubUrl}/team/?tab=kind_consultant&open={id}`).
- **Editing in place**, when the hub may edit: a text cell turns into an input on click, saves
  on Enter or leaving the field, and Escape cancels. Firm is a list; Disciplines is a checklist
  with the firm's disciplines on top. An unchanged value sends nothing.
- **+ New consultant** opens a short form: name (required), Hebrew name, firm, disciplines,
  mobile, email. It creates the contact with `kind/consultant`, then sends the Hebrew name if one
  was typed (`POST /api/contacts` does not take it).

### Firms

- **Table:** Firm · Disciplines · Phone · Email · Address · Consultants · a link to the firm in KK
  Hub (`{hubUrl}/team/?tab=firms&open={id}`). Consultants counts the consultants whose `firmId`
  is the firm; clicking it opens Consultants filtered to that firm.
- Editing in place as above. **+ New firm** asks for a name (required) and disciplines.

### States

Both sections reuse the register store's states and its notice component:

| State | Shows |
|---|---|
| register not configured | a line saying the register is not connected |
| signed out | the sign-in line and button |
| not registered / refused | the notice with the id to give an administrator |
| unreachable | the retry line |
| loading | a loading line |
| read-only | the tables without inputs, and a line saying why: register role *reader*, or Viewer in the hub |

## 4. Both languages

- Every label is Hebrew in the source with its English in `i18n-dict.js`, appended to the last
  `Object.assign` chunk; `node tools/i18n-extract.js` reports nothing new afterwards.
- **Discipline names** come from the register in both languages: the cell shows `nameHe` in
  Hebrew mode and `nameEn` in English mode, following `appLang` and the `i18n:change` event, not
  the dictionary.
- **People's names:** Hebrew mode shows `nameHe || name`, English mode `name`. The new-consultant
  form and the row editor offer both. A firm has one editable name, `name`: the API does not edit
  `firm.name_he`.
- Every cell holding register data carries `data-i18n-skip`. Layout uses logical CSS and is
  checked in both directions.

## 5. Where the code goes

- **`register-link.js`:** the pure helpers, exported for the tests — `isConsultant`,
  `consultantFirms`, `firmConsultantCount`, `disciplineChoices` (the firm's first, labelled for a
  language), `canEditRegister(role, officeRole)`, `newContactBody`, `newFirmBody`,
  `writeErrorOf(answer)` — and the client's `send`.
- **`register-link-ui.js`:** the store gains `me` and a forced directory refresh, and exports its
  `Notice` for reuse. The existing read-only views are unchanged.
- **`register-directory-ui.js`** (new): `ConsultantsSettings` and `FirmsSettings`, reached as
  `window.RegisterDirectoryUI`. It is loaded after `register-link-ui.js`; like the other register
  scripts, the page carries a stand-in so it still runs if the file is missing.
- **`project_hub_01.html`:** the script tag, the two `SECTIONS` entries, their two render lines
  and the stand-in.
- **`Deploy-Azure.ps1`:** `register-directory-ui.js` joins the list of files it deploys.

## 6. Testing

- **`tests/register-link.test.js`:** the helpers, and `send` against a stand-in fetch — 2xx, 401
  then a refreshed retry, 403, 409 `changed` with `current`, 409 and 400 rejections, a network
  failure, and that only `POST`, `PATCH` and `PUT` are ever sent.
- **In the browser**, through the local server on port 3000 against the live API: sign in, see
  both lists, search, filter by firm; edit one field of an existing consultant and change it
  back; check Hebrew and English, both directions, and Viewer mode.
- **There is no test register.** Every save goes to the live one, and the API cannot delete. A
  new consultant or firm is created during checking only with Daniel's agreement.

## 7. Rollout

On branch `feat/settings-consultants-firms`. No new app settings: once merged, redeploy with
`.\Deploy-Azure.ps1 -Name kkarc-hub -CodeOnly`.

## Not in this design

- Deleting, archiving or merging people and firms.
- Clients, suppliers, contractors and authorities; changing a record's Kind.
- Adding or removing a project's consultants (`project_member`); the project's consultants table
  stays read-only.
- A firm's Hebrew name, which the API does not edit.
