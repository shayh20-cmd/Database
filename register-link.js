/* Project Hub ↔ the register (KKarcDB on Supabase), read-only.
   Spec: docs/superpowers/specs/2026-10-04-register-link-design.md.
   Pure functions first — tests/register-link.test.js requires this file under Node. The client
   at the end needs supabase-js and, for the sign-in round trip, a browser. */
(function (root) {
  'use strict';

  /* Hub discipline code → the register's discipline tag code (spec §5). TNDR's `tender` is
     added to the register from KK Hub's Setup; until then no register firm carries it. */
  const REGISTER_DISCIPLINE = {
    ARCH: 'architecture', STRC: 'structural', ELEC: 'electrical', PLUM: 'plumbing', HVAC: 'hvac',
    LAND: 'landscape', SAFE: 'safety', FIRE: 'fire', ACSS: 'accessibility', TRAF: 'traffic',
    GR: 'green', HYDR: 'hydrology', LIFT: 'elevators', AGRO: 'agronomy', ENVI: 'environment',
    PM: 'project_mgmt', TNDR: 'tender',
  };
  const HUB_DISCIPLINE = {};
  Object.keys(REGISTER_DISCIPLINE).forEach(hub => { HUB_DISCIPLINE[REGISTER_DISCIPLINE[hub]] = hub; });

  const NO_DISCIPLINE = 'ללא תחום';
  const STATUS_HE = { active: 'פעיל', proposal: 'הצעה', inactive: 'לא פעיל', complete: 'הסתיים', cancelled: 'בוטל' };

  const upper = v => String(v == null ? '' : v).trim().toUpperCase();

  /* The register projects a hub code names — by initials or by year-sequence code, case
     ignored. The caller links only when there is exactly one (spec §2). */
  function matchProjects(hubCode, candidates) {
    const code = upper(hubCode);
    if (!code) return [];
    return (candidates || []).filter(p => upper(p.initials) === code || upper(p.code) === code);
  }

  /* The hub discipline a register discipline maps to, if this project's list still has it. */
  function hubDisciplineFor(registerCode, hubDisciplines) {
    const hub = HUB_DISCIPLINE[registerCode];
    return hub && (hubDisciplines || []).some(d => d.id === hub) ? hub : null;
  }

  /* The consultants table's rows (spec §4): the project's non-staff members, one row per
     (firm, discipline), in the hub's row shape. The firm's disciplines decide; a person's own
     count only when the firm has none, or there is no firm. */
  function buildConsultantRows(members, persons, firms, tags, hubDisciplines) {
    const personById = new Map((persons || []).map(p => [p.id, p]));
    const firmById = new Map((firms || []).map(f => [f.id, f]));
    const discTag = new Map((tags || []).filter(t => t.typeCode === 'discipline').map(t => [t.code, t]));
    const hubOrder = new Map((hubDisciplines || []).map((d, i) => [d.id, i]));
    const disciplinesOf = x => ((x && x.tags) || {}).discipline || [];
    const rows = new Map();
    for (const m of members || []) {
      if (m.isStaff) continue;
      const person = personById.get(m.personId) || {};
      const firm = person.firmId ? firmById.get(person.firmId) || null : null;
      const owner = firm ? 'f:' + firm.id : 'p:' + m.personId;
      const own = disciplinesOf(firm).length ? disciplinesOf(firm) : disciplinesOf(person);
      const contact = {
        personId: m.personId,
        name: person.nameHe || person.name || m.name || '',
        mobile: person.mobile || '',
        phone: person.phone || '',
        email: person.email || '',
      };
      for (const reg of own.length ? own : [null]) {
        const id = owner + '|' + (reg || '-');
        let row = rows.get(id);
        if (!row) {
          const tag = reg ? discTag.get(reg) : null;
          const discCode = reg ? hubDisciplineFor(reg, hubDisciplines) : null;
          row = {
            id,
            discCode,
            discipline: reg ? (tag && (tag.nameHe || tag.nameEn)) || reg : NO_DISCIPLINE,
            firm: firm ? firm.nameHe || firm.name || '' : m.firmName || '',
            firmId: firm ? firm.id : null,
            registerDiscipline: reg,
            contacts: [],
            rank: discCode ? hubOrder.get(discCode) : reg ? 1000 + (tag ? tag.sortOrder : 99999) : 1e9,
          };
          rows.set(id, row);
        }
        row.contacts.push(contact);
      }
    }
    return [...rows.values()]
      .sort((a, b) => a.rank - b.rank || a.firm.localeCompare(b.firm, 'he'))
      .map(({ rank, ...row }) => row);
  }

  const dash = v => (v === null || v === undefined || v === '' ? '—' : String(v));
  const num = v => Number(v).toLocaleString('he-IL');
  const day = v => (v ? String(v).replace(/^(\d{4})-(\d{2})-(\d{2}).*$/, '$3.$2.$1') : '—');
  const COSTS = [['predicted', 'עלות צפויה'], ['evaluated', 'עלות מוערכת'], ['contractor', 'עלות קבלן'], ['real', 'עלות בפועל']];

  /* The "From the register" card's rows (spec §3). `data` marks a value that is the register's
     own text, which the page's translator must leave alone. Costs only when the API sent them:
     it sends null to whoever may not see them. */
  function projectFacts(p) {
    const facts = [
      { label: 'קוד', value: dash([p.code, p.initials].filter(Boolean).join(' · ')), data: true },
      { label: 'שם בעברית', value: dash(p.nameHe), data: true },
      { label: 'שם באנגלית', value: dash(p.name), data: true },
      { label: 'סטטוס', value: STATUS_HE[p.status] || dash(p.status), data: false },
      { label: 'לקוח', value: dash(p.clientName), data: true },
      { label: 'כתובת', value: dash(p.address), data: true },
      { label: 'שטח', value: p.areaM2 == null ? '—' : num(p.areaM2) + ' מ״ר', data: true },
      { label: 'שנת סיום', value: dash(p.endYear), data: true },
      { label: 'היתר', value: day(p.permitDate), data: true },
      { label: 'טופס 4', value: day(p.tofes4Date), data: true },
    ];
    if (p.costs) {
      COSTS.forEach(([k, label]) => facts.push({ label, value: p.costs[k] == null ? '—' : num(p.costs[k]) + ' ₪', data: true }));
    }
    return facts;
  }

  /* The token's subject — what an administrator enrols. Shown when the register refuses
     someone, since "ask an administrator" is not actionable without it. */
  function subjectOf(token) {
    const part = String(token || '').split('.')[1];
    if (!part) return null;
    try {
      const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
      const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
      const sub = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)))).sub;
      return typeof sub === 'string' ? sub : null;
    } catch (e) {
      return null;
    }
  }

  /* After Microsoft sends a sign-in back (spec §1): the address the page had before, without
     the one-time `code` or an error report. Null when the address carries none of them. */
  const RETURN_PARAMS = ['code', 'error', 'error_code', 'error_description'];
  function tidyReturnAddress(href, savedSearch) {
    const url = new URL(href);
    if (!RETURN_PARAMS.some(k => url.searchParams.has(k))) return null;
    if (typeof savedSearch === 'string') return url.pathname + savedSearch + url.hash;
    RETURN_PARAMS.forEach(k => url.searchParams.delete(k));
    const rest = url.searchParams.toString();
    return url.pathname + (rest ? '?' + rest : '') + url.hash;
  }

  // ── createRegisterClient is added here in Task 3 ──

  const api = {
    REGISTER_DISCIPLINE, NO_DISCIPLINE, STATUS_HE,
    matchProjects, hubDisciplineFor, buildConsultantRows, projectFacts, subjectOf, tidyReturnAddress,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RegisterLink = api;
})(typeof window !== 'undefined' ? window : globalThis);
