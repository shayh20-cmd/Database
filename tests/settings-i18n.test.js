'use strict';
// Run: node --test tests/settings-i18n.test.js — Settings' consultants and firms read right in
// English, past the dictionary's older "משרד" (Office) and "כתובת" (URL). Uses the extractor's
// translator, which mirrors i18n.js: longest key first, never inside a larger Hebrew word.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadDict, buildTranslator } = require('../tools/i18n-extract.js');

const tr = buildTranslator(loadDict(fs.readFileSync(path.join(__dirname, '..', 'i18n-dict.js'), 'utf8')));
const expectAll = cases => { for (const [he, en] of Object.entries(cases)) assert.strictEqual(tr(he), en, he); };

test('Settings → Consultants in English', () => {
  expectAll({
    'יועצים': 'Consultants',
    '{n} יועצים במאגר': '{n} consultants in the register',
    'מהמאגר (KKarcDB)': 'From the register (KKarcDB)',
    'חיפוש לפי שם, משרד, תחום, טלפון או מייל': 'Search by name, firm, discipline, phone or email',
    '+ יועץ חדש': '+ New consultant',
    'יועץ חדש': 'New consultant',
    'יועץ': 'Consultant',
    'משרד היועץ': 'Firm',
    'תחומים': 'Disciplines',
    'כתובת המשרד': 'Address',
    'נייד': 'Mobile',
    'טלפון': 'Phone',
    'מייל': 'Email',
    'פרויקטים': 'Projects',
    'לא נמצאו יועצים': 'No consultants found',
    'משתמש במאגר': 'Register user',
    'משתמש במאגר נערך ב-KK Hub': 'A register user is edited in KK Hub',
    'הצגת כל היועצים': 'Show all consultants',
    'ללא משרד': 'No firm',
    'תחומי המשרד': 'The firm\'s disciplines',
    'שאר התחומים': 'Other disciplines',
    'שם באנגלית': 'English name',
    'שם בעברית': 'Hebrew name',
    'יצירה': 'Create',
    'פתיחה ב-KK Hub': 'Open in KK Hub',
    'צפייה בלבד — עריכת המאגר דורשת הרשאת Editor במאגר': 'View only — editing the register needs the Editor role in the register',
    'המאגר לא זמין באתר הזה': 'The register isn\'t available on this site',
    'לא ניתן לקרוא מהמאגר את הרשאות העריכה': 'Couldn\'t read your editing permissions from the register',
    'נסה שוב': 'Try again',
  });
});

test('a failed write\'s lines in English', () => {
  expectAll({
    'השדה שונה בינתיים על ידי מישהו אחר. הערך עכשיו: {value}': 'Someone else changed this field meanwhile. It now reads: {value}',
    'זה משתמש במאגר, לא איש קשר — עריכה ב-KK Hub': 'This is a register user, not a contact — edit them in KK Hub',
    'המאגר לא קיבל את הערך': 'The register didn\'t accept the value',
    'המאגר סירב לשינוי': 'The register refused the change',
    'הרשומה לא נמצאה במאגר — ייתכן שמוזגה': 'The record wasn\'t found in the register — it may have been merged',
    'אין הרשאה לשנות את המאגר': 'You don\'t have permission to change the register',
    'החיבור למאגר פג — התחבר שוב': 'The register sign-in has expired — sign in again',
    'המאגר לא עונה — השינוי לא נשמר': 'The register isn\'t answering — the change wasn\'t saved',
  });
});

test('Settings → Firms in English, never "Office" or "URL"', () => {
  expectAll({
    'משרדי יועצים': 'Firms',
    '{n} משרדי יועצים במאגר': '{n} firms in the register',
    'חיפוש לפי שם, תחום, טלפון, מייל או כתובת': 'Search by name, discipline, phone, email or address',
    '+ משרד חדש': '+ New firm',
    'משרד חדש': 'New firm',
    'משרד יועצים': 'Firm',
    'כתובת המשרד': 'Address',
    'לא נמצאו משרדי יועצים': 'No firms found',
    'הצגת היועצים של המשרד': 'Show the firm\'s consultants',
  });
});
