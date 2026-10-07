/* Project Hub ↔ the register (KKarcDB on Supabase). Reads projects, people, firms and tags; writes
   consultants and firms only (docs/superpowers/specs/2026-10-07-settings-consultants-firms-design.md).
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

  /* Whether the consultants table has anything from the register: every non-staff member
     yields at least one row, so a project without one gets a line saying so instead. */
  function hasConsultants(project) {
    return ((project && project.members) || []).some(m => !m.isStaff);
  }

  const dash = v => (v === null || v === undefined || v === '' ? '—' : String(v));
  const num = v => Number(v).toLocaleString('he-IL');
  const day = v => (v ? String(v).replace(/^(\d{4})-(\d{2})-(\d{2}).*$/, '$3.$2.$1') : '—');
  const COSTS = [['predicted', 'עלות צפויה'], ['evaluated', 'עלות מוערכת'], ['contractor', 'עלות קבלן'], ['real', 'עלות בפועל']];

  /* The "From the register" card's rows (spec §3). `data` marks a value that is the register's
     own text, which the page's translator must leave alone; the area is a number and a unit, so
     the unit is translated. Costs only when the API sent them:
     it sends null to whoever may not see them. */
  function projectFacts(p) {
    const facts = [
      { label: 'קוד', value: dash([p.code, p.initials].filter(Boolean).join(' · ')), data: true },
      { label: 'שם בעברית', value: dash(p.nameHe), data: true },
      { label: 'שם באנגלית', value: dash(p.name), data: true },
      { label: 'סטטוס', value: STATUS_HE[p.status] || dash(p.status), data: false },
      { label: 'לקוח', value: dash(p.clientName), data: true },
      { label: 'כתובת הפרויקט', value: dash(p.address), data: true },
      { label: 'שטח', value: p.areaM2 == null ? '—' : num(p.areaM2) + ' מ״ר', data: false },
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

  /* A store entry after an answer (spec §7). A failed refetch keeps the data already shown —
     a blip while the tab sat in the background must not blank the page — and keeps its old
     `at`, so the next focus tries again. */
  function nextEntry(old, answer, now) {
    if (answer.state === 'ok') return { state: 'ok', data: answer.data, at: now };
    if (old && old.state === 'ok') return Object.assign({}, old, { lastError: answer.state });
    return { state: answer.state, subject: answer.subject, at: now };
  }

  /* ── Settings: the register's consultants and firms (2026-10-07 design §2) ── */
  const tagsOf = (x, type) => ((x && x.tags) || {})[type] || [];
  const locale = lang => (lang === 'en' ? 'en' : 'he');

  /* A person or a firm the register calls a consultant. */
  const isConsultant = x => tagsOf(x, 'kind').includes('consultant');
  const consultantFirms = firms => (firms || []).filter(isConsultant);

  /* The name for the page's language, the other one when that is missing. */
  function nameIn(x, lang) {
    const v = lang === 'en' ? x && (x.name || x.nameHe) : x && (x.nameHe || x.name);
    return String(v || '').trim();
  }

  function tagLabel(tag, lang) {
    return (lang === 'en' ? tag.nameEn || tag.nameHe : tag.nameHe || tag.nameEn) || tag.code;
  }

  const EDIT_ROLES = ['editor', 'manager', 'admin'];
  function canEditRegister(role, officeRole) {
    return EDIT_ROLES.includes(role) && officeRole !== 'viewer';
  }

  /* A register user is not a contact: the API edits users only on its admin pages. */
  function editablePerson(person, canEdit) {
    return !!canEdit && !!person && person.isContact !== false;
  }

  /* The discipline checklist: the firm's disciplines first, then the rest, each part in the
     register's order. */
  function disciplineChoices(tags, firm, lang) {
    const mine = new Set(tagsOf(firm, 'discipline'));
    const all = (tags || []).filter(t => t.typeCode === 'discipline').slice()
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || String(a.code).localeCompare(String(b.code)));
    const choice = t => ({ code: t.code, label: tagLabel(t, lang), ofFirm: mine.has(t.code) });
    return all.filter(t => mine.has(t.code)).concat(all.filter(t => !mine.has(t.code))).map(choice);
  }

  /* The firm list's choices: the consultant firms, and the current firm when it is not one, so
     the list can always hold the value it shows. */
  function firmChoices(firms, currentFirmId, lang) {
    const list = consultantFirms(firms);
    const current = currentFirmId && !list.some(f => f.id === currentFirmId)
      ? (firms || []).find(f => f.id === currentFirmId) : null;
    return (current ? list.concat([current]) : list)
      .map(f => ({ id: f.id, label: nameIn(f, lang) }))
      .sort((a, b) => a.label.localeCompare(b.label, locale(lang)));
  }

  function firmConsultantCount(firmId, persons) {
    return (persons || []).filter(p => p.firmId === firmId && isConsultant(p)).length;
  }

  const needleOf = q => String(q == null ? '' : q).trim().toLowerCase();
  const hit = (needle, values) => !needle || values.some(v => String(v == null ? '' : v).toLowerCase().includes(needle));
  function disciplineWords(x, tags) {
    const codes = new Set(tagsOf(x, 'discipline'));
    return (tags || []).filter(t => t.typeCode === 'discipline' && codes.has(t.code)).flatMap(t => [t.code, t.nameHe, t.nameEn]);
  }

  function filterConsultants(persons, firms, tags, opts) {
    const { q, firmId, lang } = opts || {};
    const firmById = new Map((firms || []).map(f => [f.id, f]));
    const needle = needleOf(q);
    return (persons || [])
      .filter(p => isConsultant(p) && (!firmId || p.firmId === firmId))
      .filter(p => {
        const firm = firmById.get(p.firmId) || {};
        return hit(needle, [p.name, p.nameHe, firm.name, firm.nameHe, p.firmName, p.phone, p.mobile, p.email]
          .concat(disciplineWords(p, tags)));
      })
      .sort((a, b) => nameIn(a, lang).localeCompare(nameIn(b, lang), locale(lang)));
  }

  function filterFirms(firms, tags, opts) {
    const { q, lang } = opts || {};
    const needle = needleOf(q);
    return consultantFirms(firms)
      .filter(f => hit(needle, [f.name, f.nameHe, f.phone, f.email, f.address].concat(disciplineWords(f, tags))))
      .sort((a, b) => nameIn(a, lang).localeCompare(nameIn(b, lang), locale(lang)));
  }

  const RETURN_KEY = 'register-return';

  /* The register, through KKarcDB.Api, as the signed-in person (spec §1). `createSupabase` is
     supabase-js's createClient and `fetchImpl` the browser's fetch — parameters so the tests can
     stand in for both. Every answer is { state, data?, subject? }, state one of ok, signed-out,
     refused, not-found, unreachable (spec §6). get reads; send writes, with POST, PATCH or PUT only. */
  function createRegisterClient(config, createSupabase, fetchImpl) {
    const doFetch = fetchImpl || ((url, init) => root.fetch(url, init));
    // The address as the page opened, read before supabase-js runs: on a successful return it
    // removes ?code= itself, which would hide that this load is a return at all.
    const openedAt = typeof location === 'undefined' ? null : location.href;
    const sb = createSupabase(config.supabaseUrl, config.supabaseAnonKey, { auth: { flowType: 'pkce' } });
    const api = String(config.api).replace(/\/+$/, '');
    const accessToken = r => (r && r.data && r.data.session && r.data.session.access_token) || null;

    // getSession waits for supabase-js to exchange a returning sign-in's code; then the address
    // is put back to what it was before Microsoft (browser only). The saved address is used once:
    // any load clears it, so an abandoned sign-in cannot leak it into a later return.
    const ready = Promise.resolve(sb.auth.getSession()).then(() => {
      if (openedAt === null || typeof history === 'undefined') return;
      let saved = null;
      try {
        saved = sessionStorage.getItem(RETURN_KEY);
        sessionStorage.removeItem(RETURN_KEY);
      } catch (e) { /* storage blocked */ }
      const next = tidyReturnAddress(openedAt, saved);
      if (next !== null) history.replaceState(history.state, '', next);
    }).catch(() => {});

    async function token() {
      await ready;
      return accessToken(await sb.auth.getSession());
    }

    // One request with the token, refreshed and retried once on 401. Gives the response, or the
    // answer that ends it: signed-out, refused, not-found or unreachable.
    async function call(path, init) {
      let t = await token();
      if (!t) return { answer: { state: 'signed-out' } };
      for (let attempt = 0; ; attempt++) {
        let res;
        try {
          const headers = Object.assign({ Authorization: 'Bearer ' + t, Accept: 'application/json' }, init && init.headers);
          res = await doFetch(api + path, Object.assign({}, init, { headers }));
        } catch (e) {
          return { answer: { state: 'unreachable' } };
        }
        if (res.status === 401 && attempt === 0) {
          t = accessToken(await sb.auth.refreshSession());
          if (!t) return { answer: { state: 'signed-out' } };
          continue;
        }
        if (res.status === 401 || res.status === 403) return { answer: { state: 'refused', subject: subjectOf(t) } };
        if (res.status === 404) return { answer: { state: 'not-found' } };
        return { res };
      }
    }

    async function get(path) {
      const { res, answer } = await call(path);
      if (answer) return answer;
      if (!res.ok) return { state: 'unreachable' };
      try {
        return { state: 'ok', data: await res.json() };
      } catch (e) {
        return { state: 'unreachable' };
      }
    }

    /* A write (2026-10-07 design §1): POST, PATCH or PUT only. A 409 `changed` brings what the
       other person saved; another 409 or a 400 is the register refusing the value. */
    const WRITES = ['POST', 'PATCH', 'PUT'];
    async function send(method, path, body) {
      if (!WRITES.includes(method)) throw new Error('register-link: only POST, PATCH and PUT are sent, not ' + method);
      const { res, answer } = await call(path, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body === undefined ? null : body),
      });
      if (answer) return answer;
      if (res.ok) {
        let data = null;
        try { data = await res.json(); } catch (e) { /* 204: nothing to read */ }
        return { state: 'ok', data };
      }
      if (res.status === 409 || res.status === 400) {
        let b = null;
        try { b = await res.json(); } catch (e) { /* no body */ }
        b = b || {};
        if (res.status === 409 && b.code === 'changed') return { state: 'changed', current: b.current === undefined ? null : b.current };
        return { state: 'rejected', code: b.code || null, error: b.error || null };
      }
      return { state: 'unreachable' };
    }

    async function signIn() {
      try { sessionStorage.setItem(RETURN_KEY, location.search); } catch (e) { /* storage blocked */ }
      const r = await sb.auth.signInWithOAuth({
        provider: 'azure',
        options: { scopes: 'openid profile email', redirectTo: location.origin + location.pathname },
      });
      return r && r.error ? r.error.message : null;
    }

    return {
      ready,
      token,
      get,
      send,
      signIn,
      signOut: () => sb.auth.signOut(),
      // supabase-js must not be called from inside its own callback; listeners run a tick later.
      onChange: listener => { sb.auth.onAuthStateChange(() => { setTimeout(listener, 0); }); },
    };
  }

  const api = {
    REGISTER_DISCIPLINE, NO_DISCIPLINE, STATUS_HE,
    matchProjects, hubDisciplineFor, buildConsultantRows, projectFacts, subjectOf, tidyReturnAddress,
    nextEntry, hasConsultants, createRegisterClient,
    isConsultant, consultantFirms, nameIn, tagLabel, canEditRegister, editablePerson, disciplineChoices,
    firmChoices, firmConsultantCount, filterConsultants, filterFirms,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RegisterLink = api;
})(typeof window !== 'undefined' ? window : globalThis);
