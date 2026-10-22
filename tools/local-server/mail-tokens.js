'use strict';
/* A personal key: the mail scanner's (phm_) and the Outlook add-in's (pho_), each in its own file.
   One per person: issuing a new one ends the old. The key is shown once (Settings → גישה מהירה);
   the server keeps only its SHA-256. */
const crypto = require('crypto');

const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const personOf = email => String(email || 'local').trim().toLowerCase();

module.exports = function createTokens(file, { readJson, writeJsonAtomic }, prefix = 'phm_') {
  const load = () => {
    const d = readJson(file);
    return d && d.keys ? d : { keys: {} };
  };
  const drop = (st, who) => { for (const [k, v] of Object.entries(st.keys)) if (v.who === who) delete st.keys[k]; };
  return {
    issue(email, nowIso) {
      const st = load();
      const who = personOf(email);
      drop(st, who);
      const key = prefix + crypto.randomBytes(24).toString('base64url');
      st.keys[sha(key)] = { who, created: nowIso, lastUsed: null };
      writeJsonAtomic(file, st);
      return key;
    },
    revoke(email) {
      const st = load();
      drop(st, personOf(email));
      writeJsonAtomic(file, st);
    },
    status(email) {
      const who = personOf(email);
      const v = Object.values(load().keys).find(x => x.who === who);
      return v ? { created: v.created, lastUsed: v.lastUsed } : null;
    },
    /* the person a key belongs to, or null */
    check(key, nowIso) {
      if (!key) return null;
      const st = load();
      const v = st.keys[sha(key)];
      if (!v) return null;
      // the scanner calls every few minutes: refresh "last used" at most every 10 minutes, not on each call
      if (!v.lastUsed || !(Date.parse(nowIso) - Date.parse(v.lastUsed) < 10 * 60 * 1000)) {
        v.lastUsed = nowIso;
        writeJsonAtomic(file, st);
      }
      return v.who;
    }
  };
};
// the owner a key names: the address in lower case, 'local' on the local server (no address)
module.exports.personOf = personOf;
