/* Calculators — the regulations' tables and arithmetic, with no UI.
   Parking: תקנות התכנון והבניה (התקנת מקומות חניה), תשמ"ג-1983, נוסח עדכני 30.10.2025.
   הל"ת: הוראות למתקני תברואה 2007, סעיף 3.6.
   Loaded by project_hub_01.html (window.CalcRules) and by tests/calc-rules.test.js
   (module.exports). Design: docs/superpowers/specs/2026-11-01-calculators-design.md */
(function (root) {
  'use strict';

/* ════════════ Parking ════════════ */
const per  = (a, b, kind) => ({ lo: 1 / (b || a), hi: 1 / a, kind: kind || (b ? 'range' : 'max') });
const rate = (a, b, kind) => ({ lo: a, hi: b == null ? a : b, kind: kind || (b == null ? 'max' : 'range') });
const NONE = { lo: 0, hi: 0, kind: 'none' };
const all = r => ({ A: r, B: r, C: r, N: r });

const MEASURES = {
  units: 'יח"ד', beds: 'מיטות', area: 'מ"ר', classes: 'כיתות', seats: 'מקומות ישיבה',
  guest: 'יחידות אירוח', stations: 'עמדות טיפול',
};

const CATS = {
  res: 'מגורים', com: 'מסחר', off: 'משרדים ותעשייה עתירת ידע', ind: 'תעשייה, מלאכה ואחסנה',
  edu: 'מוסדות חינוך', cul: 'תרבות ופנאי', hea: 'מוסדות בריאות', spo: 'ספורט ובתי עלמין',
  hot: 'מלונאות', gar: 'מוסכים',
};

// main = היתר בחלוקה לשטח עיקרי ושירות ; total = היתר בשטח כולל (null = זהה)
// N = יישוב בלא מתע"ן ; far = הכלל ביישוב בלא מתע"ן תלוי באחוזי זכויות הבנייה
const USES = [
  { id: '1.1', cat: 'res', name: 'מגורים צמוד קרקע (בודד או דו-משפחתי)', m: 'units',
    main: { ref: '1.1', z: { A: rate(1, 2), B: rate(1, 2), C: rate(1, 2), N: rate(2, null, 'min') } } },
  { id: '1.2', cat: 'res', name: 'בניין מגורים, יותר משתי יח"ד, כניסה משותפת', m: 'units', bike: 'res', moto: 'res',
    main: { ref: '1.2', z: { A: rate(0.5, 1), B: rate(1, 1.5), C: rate(1, 2), N: rate(1, 2) } } },
  { id: '1.3', cat: 'res', name: 'בניין מגורים כנ"ל — כל הדירות קטנות (30–80 מ"ר)', m: 'units', bike: 'res', moto: 'res',
    main: { ref: '1.3', z: { A: rate(0, 1), B: rate(0, 1.5), C: rate(0.5, 1.5), N: rate(0.5, 1.5) } } },
  { id: '1.4', cat: 'res', name: 'בית אבות ודיור מוגן', m: 'units',
    main: { ref: '1.4', z: { A: per(10, 20), B: per(5, 10), C: per(4, 8), N: per(4, 8) } } },
  { id: '1.5', cat: 'res', name: 'מעונות סטודנטים', m: 'beds', bike: 'dorm', moto: 'dorm',
    main: { ref: '1.5', z: { A: per(20), B: per(10), C: rate(1 / 20, 5 / 20), N: rate(1 / 10, 5 / 10) } } },

  { id: '2.1', cat: 'com', name: 'חנויות מכל הסוגים, כולל חזית מסחרית (במצטבר)', m: 'area', bike: 'com', moto: 'com', tiers: true,
    main: { ref: '2.1–2.3', steps: [2000, 10000],
      z: [{ A: per(50), B: per(30), C: per(25, 50) }, { A: per(100), B: per(50), C: per(45, 100) }, { A: per(150), B: per(70), C: per(50, 150) }],
      far: { at: 100, ref: ['2.5', '2.6'], lo: per(25, 50), hi: per(50, 150) } },
    total: { ref: '2א(1)–2א(3)', steps: [2941, 14700],
      z: [{ A: per(73), B: per(44), C: per(36, 73) }, { A: per(147), B: per(73), C: per(66, 147) }, { A: per(220), B: per(103), C: per(73, 220) }],
      far: { at: 100, ref: ['2א(5)', '2א(6)'], lo: per(36, 73), hi: per(73, 220) } } },
  { id: '2.4', cat: 'com', name: 'מסחר שכונתי', m: 'area', bike: 'com', moto: 'com',
    main: { ref: '2.4', z: { A: per(25, 50), B: per(25, 50), C: per(25, 50) }, far: { at: 100, ref: ['2.5', '2.6'], lo: per(25, 50), hi: per(50, 150) } },
    total: { ref: '2א(4)', z: { A: per(36, 73), B: per(36, 73), C: per(36, 73) }, far: { at: 100, ref: ['2א(5)', '2א(6)'], lo: per(36, 73), hi: per(73, 220) } } },

  { id: '3.1', cat: 'off', name: 'משרדים ותעשייה עתירת ידע', m: 'area', bike: 'off', moto: 'off',
    main: { ref: '3.1', z: { A: per(240), B: per(120), C: per(60) }, far: { at: 120, ref: ['3.2', '3.3'], lo: per(30, 50), hi: per(60) } },
    total: { ref: '3א(1)', z: { A: per(300), B: per(150), C: per(75) }, far: { at: 120, ref: ['3א(2)', '3א(3)'], lo: per(37, 63), hi: per(75) } } },

  { id: '4.1', cat: 'ind', name: 'תעשייה ומלאכה', m: 'area', bike: 'com', moto: 'ind',
    main: { ref: '4.1', z: { A: per(240), B: per(120), C: per(60, 100) }, far: { at: 80, ref: ['4.2', '4.3'], lo: per(60, 100), hi: per(120) } },
    total: { ref: '4א(1)', z: { A: per(261), B: per(130), C: per(65, 108) }, far: { at: 80, ref: ['4א(2)', '4א(3)'], lo: per(65, 108), hi: per(130) } } },
  { id: '4.5', cat: 'ind', name: 'אחסנה', m: 'area',
    main: { ref: '4.5', z: all(per(300, null, 'fixed')) }, total: { ref: '4א(4)', z: all(per(324, null, 'fixed')) } },

  { id: '5.1', cat: 'edu', name: 'גני ילדים ובתי ספר', m: 'classes', bike: 'edu',
    main: { ref: '5.1', z: { A: rate(0, 2), B: rate(0, 2), C: rate(0, 3), N: rate(0.5, 3) } }, total: { ref: '5א(1)' } },
  { id: '5.2', cat: 'edu', name: 'אוניברסיטה', m: 'area', bike: 'edu', moto: 'cul',
    main: { ref: '5.2', z: { A: per(200), B: per(100), C: per(60), N: per(50, 70) } },
    total: { ref: '5א(2)', z: { A: per(250), B: per(125), C: per(75), N: per(63, 87) } } },
  { id: '5.3', cat: 'edu', name: 'ספרייה, מוזיאון, מתנ"ס', m: 'area', bike: 'cul', moto: 'cul',
    main: { ref: '5.3', z: { A: per(100), B: per(80), C: per(60), N: per(40, 60) } },
    total: { ref: '5א(3)', z: { A: per(125), B: per(100), C: per(75), N: per(50, 75) } } },

  { id: '6.1', cat: 'cul', name: 'תיאטרון וקולנוע', m: 'seats',
    main: { ref: '6.1', z: { A: per(10, 20, 'max'), B: per(10, 20, 'max'), C: per(5, 10), N: per(3, 6) } }, total: { ref: '6א(1)' } },
  { id: '6.2s', cat: 'cul', name: 'אולם כנסים ואירועים — לפי מקומות ישיבה', m: 'seats',
    main: { ref: '6.2', z: { A: per(20, 30), B: per(10, 20), C: per(5, 10), N: per(5, 10) } }, total: { ref: '6א(2)' } },
  { id: '6.2a', cat: 'cul', name: 'אולם כנסים ואירועים — לפי שטח', m: 'area',
    main: { ref: '6.2', z: { A: per(250, null, 'range'), B: per(125, 250), C: per(75, 125), N: per(20, 50) } },
    total: { ref: '6א(2)', z: { A: per(312, null, 'range'), B: per(156, 312), C: per(93, 156), N: per(25, 63) } } },
  { id: '6.3', cat: 'cul', name: 'מסעדות, בתי קפה', m: 'area',
    main: { ref: '6.3', z: { A: per(20), B: per(20), C: per(10), N: per(10) } },
    total: { ref: '6א(3)', z: { A: per(25), B: per(25), C: per(13), N: per(13) } } },
  { id: '6.4', cat: 'cul', name: 'בית תפילה ומועדון שכונתי', m: 'area',
    main: { ref: '6.4', z: { A: per(150), B: per(100), C: per(60), N: per(40, 60) } },
    total: { ref: '6א(4)', z: { A: per(188), B: per(125), C: per(75), N: per(50, 75) } } },
  { id: '6.5', cat: 'cul', name: 'מרכז לקשיש', m: 'area',
    main: { ref: '6.5', z: { A: per(75), B: per(50), C: per(30), N: per(20, 50) } },
    total: { ref: '6א(5)', z: { A: per(94), B: per(63), C: per(38), N: per(25, 63) } } },

  { id: '7.1', cat: 'hea', name: 'מרפאות כלליות ומרפאות עם אשפוז יום', m: 'area', bike: 'hea',
    main: { ref: '7.1', z: { A: per(30, 50), B: per(30, 50), C: per(30, 40), N: per(30) } },
    total: { ref: '7א(1)', z: { A: per(37, 63), B: per(37, 63), C: per(37, 50), N: per(37) } } },
  { id: '7.2', cat: 'hea', name: 'בתי חולים', m: 'beds',
    main: { ref: '7.2', z: { A: rate(1, 2), B: rate(1, 2), C: rate(1, 2), N: rate(1.5, 2) } }, total: { ref: '7א(2)' } },
  { id: '7.3', cat: 'hea', name: 'בתי חולים גריאטריה, שיקום ופסיכיאטריה', m: 'beds',
    main: { ref: '7.3', z: all(rate(0.5, null, 'fixed')) }, total: { ref: '7א(3)' } },

  { id: '8.1', cat: 'spo', name: 'אצטדיון', m: 'seats', moto: 'stadium',
    main: { ref: '8.1', z: { A: per(40), B: per(20), C: per(10, 15), N: per(5, 10) } }, total: { ref: '8א(1)' } },
  { id: '8.2', cat: 'spo', name: 'מועדון ספורט', m: 'area', moto: 'sport',
    main: { ref: '8.2', z: { A: per(250), B: per(100, 250), C: per(40, 80), N: per(40, 50) } },
    total: { ref: '8א(2)', z: { A: per(294), B: per(117, 294), C: per(47, 94), N: per(47, 59) } } },
  { id: '8.3', cat: 'spo', name: 'בית עלמין', m: 'area',
    main: { ref: '8.3', z: { A: NONE, B: per(500, 750), C: per(300, 750), N: per(300, 750) } }, total: { ref: '8א(4)' } },

  { id: '9.1', cat: 'hot', name: 'מלון עירוני', m: 'guest',
    main: { ref: '9.1', z: { A: per(4), B: per(4), C: per(4), N: per(2, 4) } }, total: { ref: '9.1' } },
  { id: '9.2', cat: 'hot', name: 'מלון נופש', m: 'guest',
    main: { ref: '9.2', z: { A: per(3), B: per(3), C: per(3), N: per(1, 4) } }, total: { ref: '9.2' } },
  { id: '9.4', cat: 'hot', name: 'יחידות אירוח כפרי/עירוני (צימרים)', m: 'guest',
    main: { ref: '9.4', z: { A: per(4), B: per(4), C: per(4), N: per(1, 2) } }, total: { ref: '9.4' } },
  { id: '9.5', cat: 'hot', name: 'אכסניית נוער', m: 'beds',
    main: { ref: '9.5', z: { A: per(20), B: per(20), C: per(20), N: per(10) } }, total: { ref: '9.5' } },

  { id: '10.1', cat: 'gar', name: 'מוסך (מפעל לשירותי תחזוקה לרכב)', m: 'stations',
    main: { ref: '10.1', z: all(rate(2, 3)) }, total: { ref: '10א(1)' } },
  { id: '10.2', cat: 'gar', name: 'מסעדה, מזנון או חנות שירות בתחנת תדלוק', m: 'area',
    main: { ref: '10.2', z: { A: per(10, 20), B: per(10, 20), C: per(10, 20), N: per(5, 10) } },
    total: { ref: '10א(2)', z: { A: per(11, 22), B: per(11, 22), C: per(11, 22), N: per(6, 11) } } },
];

// חלק ג' — אופניים (מספר מזערי) ; חלק ד' — אופנועים. [main, total], need = שדה נוסף שנדרש
const BIKES = {
  res:  { name: 'בניין מגורים >2 יח"ד', main: rate(1, null, 'min'), total: rate(1, null, 'min'), out: "עד 50% מחוץ לבניין" },
  dorm: { name: 'מעונות סטודנטים', main: per(5, null, 'min'), total: per(5, null, 'min'), out: "עד 25% מחוץ לבניין", note: 'לכל 5 סטודנטים — לפי מיטות' },
  off:  { name: 'משרדים ותעשייה עתירת ידע', main: per(250, null, 'min'), total: per(313, null, 'min'), out: "עד 20% מחוץ לבניין" },
  com:  { name: 'מסחר ותעשייה קלה', main: per(300, null, 'min'), total: per(460, null, 'min'), out: "עד 50% מחוץ לבניין" },
  edu:  { name: 'מוסדות חינוך', need: 'students', main: per(10, null, 'min'), total: per(10, null, 'min'), out: 'מחוץ לבניין' },
  cul:  { name: 'מרכז קהילתי, מתנ"ס, ספרייה ומוזיאון', main: per(100, null, 'min'), total: per(125, null, 'min'), out: 'מחוץ לבניין' },
  hea:  { name: 'שירותי בריאות (מרפאה)', main: per(300, null, 'min'), total: per(375, null, 'min'), out: 'מחוץ לבניין' },
};
const MOTOS = {
  res:  { name: 'בניין מגורים >10 יח"ד', main: per(5, 10), total: per(5, 10), minQty: 11 },
  dorm: { name: 'מעונות סטודנטים', main: per(3, 10), total: per(3, 10), note: 'לכל 3–10 חדרים — לפי מיטות' },
  com:  { name: 'מסחר', main: per(200, null, 'min'), total: per(306, null, 'min') },
  off:  { name: 'משרדים ותעשייה עתירת ידע', main: per(200, null, 'min'), total: per(306, null, 'min') },
  ind:  { name: 'תעשייה ומלאכה', main: per(200, null, 'min'), total: per(222, null, 'min') },
  cul:  { name: 'אוניברסיטה, מתנ"ס, מוזיאון, ספרייה', main: per(100, null, 'min'), total: per(125, null, 'min') },
  stadium: { name: 'אצטדיון', main: per(100, 500), total: per(100, 500) },
  sport: { name: 'מועדון ספורט', main: per(200, null, 'min'), total: per(235, null, 'min') },
};

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180, dl = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Stations of mass transit (מתע"ן) within reach of a project: [name, lat, lng, line, future]
const STATIONS = [
  // רכבת ישראל – קיים
  ["תל אביב - סבידור מרכז",32.0940,34.7739,"רכבת ישראל",false],
  ["תל אביב - השלום",32.0699,34.7797,"רכבת ישראל",false],
  ["תל אביב - הגנה",32.0830,34.7781,"רכבת ישראל",false],
  ["תל אביב - ב\"ש",32.0619,34.7764,"רכבת ישראל",false],
  ["תל אביב - אוניברסיטה",32.1132,34.8038,"רכבת ישראל",false],
  ["בני ברק",32.0855,34.8290,"רכבת ישראל",false],
  ["רמת גן - קריית אריה",32.0789,34.8137,"רכבת ישראל",false],
  ["פ\"ת - כפר גנים",32.0833,34.8561,"רכבת ישראל",false],
  ["פ\"ת - סגולה",32.0947,34.8726,"רכבת ישראל",false],
  ["כפר סבא - נורדאו",32.1776,34.9121,"רכבת ישראל",false],
  ["כפר סבא - ביאליק",32.1881,34.9229,"רכבת ישראל",false],
  ["נתניה",32.3237,34.8601,"רכבת ישראל",false],
  ["נתניה - ספיר",32.2980,34.8609,"רכבת ישראל",false],
  ["חדרה מערב",32.4523,34.9012,"רכבת ישראל",false],
  ["בית יהושע",32.2644,34.8837,"רכבת ישראל",false],
  ["הוד השרון - סוקולוב",32.1531,34.8976,"רכבת ישראל",false],
  ["רעננה דרום",32.1659,34.8809,"רכבת ישראל",false],
  ["לוד",31.9598,34.9009,"רכבת ישראל",false],
  ["רמלה",31.9299,34.8699,"רכבת ישראל",false],
  ["רחובות",31.8943,34.8057,"רכבת ישראל",false],
  ["נס ציונה - מרכז ורד",31.9264,34.7898,"רכבת ישראל",false],
  ["ראשון לציון - הרצל",31.9817,34.7826,"רכבת ישראל",false],
  ["ראשון לציון - משה דיין",32.0055,34.7826,"רכבת ישראל",false],
  ["ראשון לציון - נורד",32.0190,34.7751,"רכבת ישראל",false],
  ["חיפה - מרכז השמיטה",32.8121,35.0029,"רכבת ישראל",false],
  ["חיפה - בת גלים",32.8347,34.9836,"רכבת ישראל",false],
  ["חיפה - הוף הכרמל",32.7932,35.0043,"רכבת ישראל",false],
  ["חיפה - חוצות המפרץ",32.8275,35.0254,"רכבת ישראל",false],
  ["קריית מוצקין",32.8373,35.0655,"רכבת ישראל",false],
  ["קריית ביאליק",32.8194,35.0796,"רכבת ישראל",false],
  ["קריית חיים",32.8131,35.0565,"רכבת ישראל",false],
  ["עכו",32.9288,35.0698,"רכבת ישראל",false],
  ["נהריה",33.0028,35.0960,"רכבת ישראל",false],
  ["ירושלים - מלחה",31.7462,35.1810,"רכבת ישראל",false],
  ["ירושלים - גנות העיר",31.7743,35.2128,"רכבת ישראל",false],
  ["ירושלים - יצחק נבון",31.7881,35.2035,"רכבת ישראל",false],
  ["באר שבע - מרכז",31.2431,34.7975,"רכבת ישראל",false],
  ["באר שבע - צפון",31.2634,34.7988,"רכבת ישראל",false],
  ["דימונה",31.0648,35.0195,"רכבת ישראל",false],
  ["אופקים",31.3148,34.6214,"רכבת ישראל",false],
  ["קריית גת",31.6022,34.7659,"רכבת ישראל",false],
  ["אשדוד - עד הלום",31.7981,34.6463,"רכבת ישראל",false],
  ["אשקלון",31.6698,34.5715,"רכבת ישראל",false],
  ["נצרת עילית",32.7049,35.3189,"רכבת ישראל",false],
  ["בית שמש",31.7517,34.9988,"רכבת ישראל",false],
  // רכבת קלה ירושלים – קיים (קו אדום)
  ["ירושלים - רמות",31.8206,35.1787,"רכבת קלה ירושלים (קו אדום)",false],
  ["ירושלים - יפה נוף",31.7873,35.2014,"רכבת קלה ירושלים (קו אדום)",false],
  ["ירושלים - בן זכאי / הרצל",31.7905,35.2093,"רכבת קלה ירושלים (קו אדום)",false],
  ["ירושלים - כיכר ספרא",31.7811,35.2253,"רכבת קלה ירושלים (קו אדום)",false],
  ["ירושלים - שוק מחנה יהודה",31.7842,35.2149,"רכבת קלה ירושלים (קו אדום)",false],
  ["ירושלים - צ'רצ'יל",31.7788,35.2270,"רכבת קלה ירושלים (קו אדום)",false],
  ["ירושלים - שועפאט",31.8051,35.2334,"רכבת קלה ירושלים (קו אדום)",false],
  ["ירושלים - הר הצופים",31.7893,35.2402,"רכבת קלה ירושלים (קו אדום)",false],
  // רכבת קלה ת"א קו אדום – קיים
  ["פ\"ת - קריית אריה",32.0886,34.8721,"רכבת קלה ת\"א (קו אדום)",false],
  ["בני ברק - קרית נשים",32.0780,34.8500,"רכבת קלה ת\"א (קו אדום)",false],
  ["ת\"א - קרליבך",32.0727,34.7923,"רכבת קלה ת\"א (קו אדום)",false],
  ["ת\"א - כיכר המדינה",32.0841,34.7806,"רכבת קלה ת\"א (קו אדום)",false],
  ["ת\"א - אוניברסיטת ת\"א",32.1131,34.8038,"רכבת קלה ת\"א (קו אדום)",false],
  ["בת ים - קרית שרת",32.0179,34.7528,"רכבת קלה ת\"א (קו אדום)",false],
  ["חולון - ולפסון",32.0327,34.7729,"רכבת קלה ת\"א (קו אדום)",false],
  // מטרונית חיפה – קיים
  ["חיפה - מ.ג.ד. (מטרונית)",32.8192,34.9994,"מטרונית חיפה",false],
  ["חיפה - נמל (מטרונית)",32.8229,35.0087,"מטרונית חיפה",false],
  ["חיפה - הדר (מטרונית)",32.8173,35.0003,"מטרונית חיפה",false],
  ["קריות - ביג (מטרונית)",32.8390,35.0550,"מטרונית חיפה",false],
  // רכבת קלה ת"א קו ירוק – עתידי/בבנייה
  ["ת\"א - שדרות רוטשילד (קו ירוק)",32.0643,34.7744,"רכבת קלה ת\"א (קו ירוק)",true],
  ["ת\"א - לוינסקי (קו ירוק)",32.0600,34.7723,"רכבת קלה ת\"א (קו ירוק)",true],
  ["ת\"א - מרכז תחבורה השלום (קו ירוק)",32.0699,34.7797,"רכבת קלה ת\"א (קו ירוק)",true],
  ["ת\"א - קרית החינוך (קו ירוק)",32.0800,34.7914,"רכבת קלה ת\"א (קו ירוק)",true],
  ["ת\"א - כיכר דיזנגוף (קו ירוק)",32.0793,34.7739,"רכבת קלה ת\"א (קו ירוק)",true],
  // רכבת קלה ת"א קו סגול – עתידי/בבנייה
  ["הרצליה (קו סגול)",32.1662,34.8430,"רכבת קלה ת\"א (קו סגול)",true],
  ["רמת השרון (קו סגול)",32.1476,34.8443,"רכבת קלה ת\"א (קו סגול)",true],
  ["ת\"א - כיכר הבימה (קו סגול)",32.0717,34.7810,"רכבת קלה ת\"א (קו סגול)",true],
  ["ת\"א - כרם התימנים (קו סגול)",32.0585,34.7730,"רכבת קלה ת\"א (קו סגול)",true],
  ["ת\"א - יד אליהו (קו סגול)",32.0527,34.7845,"רכבת קלה ת\"א (קו סגול)",true],
  ["חולון - עזריאלי (קו סגול)",32.0153,34.7810,"רכבת קלה ת\"א (קו סגול)",true],
  // מטרו ת"א – עתידי
  ["ת\"א - מטרו M1 רכבת ישראל",32.0934,34.7800,"מטרו ת\"א (קו M1)",true],
  ["ת\"א - מטרו M1 כיכר המדינה",32.0841,34.7806,"מטרו ת\"א (קו M1)",true],
  ["רמת גן - מטרו M1",32.0847,34.8224,"מטרו ת\"א (קו M1)",true],
  ["גבעתיים - מטרו M3",32.0692,34.8133,"מטרו ת\"א (קו M3)",true],
  ["ת\"א - מטרו M3 בצלאל",32.0822,34.7964,"מטרו ת\"א (קו M3)",true],
  ["ראשון לציון - מטרו M3",31.9765,34.8003,"מטרו ת\"א (קו M3)",true],
  ["חולון - מטרו M3",32.0133,34.7839,"מטרו ת\"א (קו M3)",true],
  ["ת\"א - מטרו M2",32.0750,34.7850,"מטרו ת\"א (קו M2)",true],
  ["פ\"ת - מטרו M2",32.0891,34.8733,"מטרו ת\"א (קו M2)",true],
  // BRT באר שבע – עתידי
  ["באר שבע - BRT נשיא",31.2521,34.7932,"BRT באר שבע",true],
  ["באר שבע - BRT שריגים",31.2398,34.8011,"BRT באר שבע",true],
].map(([name,lat,lng,type,planned]) => ({name,lat,lng,type,isPlanned:planned}));

/* ════════════ הל"ת ════════════ */
const s = (steps, every) => ({ steps, every });
const once = n => ({ steps: [[Infinity, n]] });
const FIX = {
  toilet: 'אסלות', urinal: 'משתנות', basin: 'כיורי רחצה', shower: 'מקלחות',
  ksink: 'כיורי מטבח', laundry: 'הכנה למכונת כביסה', drink: 'מתקן שתייה', janitor: 'עביט שפכים',
};
const FIX_ORDER = ['toilet', 'urinal', 'basin', 'shower', 'ksink', 'laundry', 'drink', 'janitor'];

function stepCount(rule, n) {
  if (!rule || n <= 0) return 0;
  for (const [upto, k] of rule.steps) if (n <= upto) return k;
  const [lastUpto, lastK] = rule.steps[rule.steps.length - 1];
  if (!rule.every) return lastK;
  return lastK + Math.ceil((n - lastUpto) / rule.every[0]) * rule.every[1];
}
function stepText(rule, n, T) {
  T = T || ((s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m)));
  if (!rule || n <= 0) return '';
  const i = rule.steps.findIndex(([u]) => n <= u), st = rule.steps[i];
  if (st) return st[0] === Infinity ? `${st[1]}`
    : i === 0 ? T('עד {a} → {k}', { a: st[0], k: st[1] })
    : T('{a}–{b} → {k}', { a: Math.floor(rule.steps[i - 1][0]) + 1, b: st[0], k: st[1] });
  const [lu, lk] = rule.steps[rule.steps.length - 1];
  return T('{k} + {e} לכל {p} מעל {a}', { k: lk, e: rule.every[1], p: rule.every[0], a: lu });
}

// groups: share = ברירת מחדל לחלק מהאוכלוסייה ; split = 'mw' (גברים/נשים) | 'none'
const HLT = [
  { id: 'res', t: '3.6.3.1', name: 'מגורים — יחידת דיור', m: 'יח"ד', split: 'none',
    groups: [{ g: 'all', fx: { toilet: once(1), basin: once(1), shower: once(1), ksink: once(1), laundry: once(1) }, per: true }],
    notes: ['חובה לספק מים קרים וחמים לכמות המינימלית הנדרשת.', 'ניתן להתקין אמבט עם מקלח יד במקום מקלחת.'] },

  { id: 'kg', t: '3.6.3.2(א2)', name: 'גן ילדים — כיתת גן (גילאי 3–6, עד 35 ילדים)', m: 'כיתות', split: 'none',
    groups: [{ g: 'all', fx: { toilet: once(2), basin: once(3), shower: once(1), drink: once(1), ksink: once(1), janitor: once(1) }, per: true }],
    notes: ['כיור בכיתה במידות 40X60 ס"מ (נספר כאן ככיור מטבח).', 'בנוסף — אסלה עבור הסגל, מתאימה לאנשים עם מוגבלות.', 'האסלות לילדים יהיו אסלות נמוכות; כיורי רחצה בגובה נמוך.'] },

  { id: 'sch', t: '3.6.3.2(ב)', name: 'בית ספר יסודי (מעל גיל 6, ללא לינה)', m: 'תלמידים', split: 'mw', men: 50, floors: true,
    groups: [
      { g: 'm', fx: { toilet: s([[40, 2], [80, 3], [160, 4], [240, 5]], [40, 1]), urinal: s([[40, 1], [80, 2], [160, 3], [240, 4]], [40, 1]), basin: s([[40, 2], [80, 3], [160, 4], [240, 5]], [40, 1]) } },
      { g: 'w', fx: { toilet: s([[40, 4], [80, 6], [160, 8], [240, 10]], [40, 1]), basin: s([[40, 4], [80, 6], [160, 8], [240, 10]], [40, 1]) } }],
    building: (P, fl) => ({ drink: Math.max(Math.ceil(P / 120), fl), janitor: fl }),
    bNotes: { drink: 'לכל 120 ילדים בבניין (ולכל 40 ילדים בחצר), ולפחות אחד בכל קומה', janitor: 'בכל קומה בה יותר מ-4 כיתות' },
    notes: ['סגל — כמו בבניין משרדים (טבלה 3.6.3.3).', 'יחס החלוקה בין גברים לנשים ייקבע לפי הצפי של סוג מיתקן החינוך.', 'יותקנו אסלות תלויות.'] },

  { id: 'hs', t: '3.6.3.2(ג)', name: 'חטיבת ביניים, תיכון ומיתקני חינוך למבוגרים (ללא לינה)', m: 'תלמידים', split: 'mw', men: 50, floors: true,
    groups: [
      { g: 'm', fx: { toilet: s([[40, 1], [80, 2], [160, 4], [240, 5]], [80, 1]), urinal: s([[40, 1], [80, 1], [160, 2], [240, 3]], [80, 1]), basin: s([[40, 1], [80, 2], [160, 4], [240, 5]], [80, 1]) } },
      { g: 'w', fx: { toilet: s([[40, 3], [80, 4], [160, 7], [240, 9]], [80, 1]), basin: s([[40, 3], [80, 4], [160, 6], [240, 7]], [80, 1]) } }],
    building: (P, fl) => ({ drink: Math.max(Math.ceil(P / 120), fl), janitor: fl }),
    bNotes: { drink: 'לכל 120 אנשים בבניין, ולפחות אחד בכל קומה', janitor: 'בכל קומה בה יותר מ-4 כיתות' },
    notes: ['כולל אוניברסיטה, מכללה, ישיבה, סמינר, בית ספר מקצועי, מתנ"ס וכד\'.', 'סגל — כמו בבניין משרדים (טבלה 3.6.3.3).'] },

  { id: 'off', t: '3.6.3.3', name: 'בניין משרדים', m: 'אנשים', split: 'mw', men: 50, floors: true,
    groups: [
      { g: 'm', fx: { toilet: s([[15, 1], [35, 2], [80, 3], [130, 4]], [80, 1]), urinal: s([[15, 1], [35, 1], [80, 2], [130, 2]], [80, 1]), basin: s([[15, 1], [35, 2], [80, 3], [130, 4]], [80, 1]) } },
      { g: 'w', fx: { toilet: s([[15, 2], [35, 4], [80, 6], [130, 7]], [40, 1]), basin: s([[15, 1], [35, 3], [80, 5], [130, 6]], [40, 1]) } }],
    building: (P, fl) => ({ drink: Math.max(Math.ceil(P / 75), fl), ksink: fl, janitor: fl }),
    bNotes: { drink: 'לכל 75 אנשים, ולפחות אחד בכל קומה', ksink: 'בכל קומה ששטחה מעל 150 מ"ר', janitor: 'בכל קומה' },
    notes: ['מתוך הסידורים הנדרשים יש להקצות לציבור המבקרים לפי צפי המבקרים. יחס החלוקה 50% גברים ו-50% נשים.', 'אם לא ידוע מספר האנשים למעשה, יש לחשב את מספר האנשים בפועל בבניין בהתאם למקדמי התפוסה.', 'חלה גם על בנקים, משרדי ממשלה, רשויות מקומיות, בתי משפט, דואר וכל בניין הנועד לשרות ציבורי.'] },

  { id: 'hotR', t: '3.6.3.4(א)', name: 'מלונאות — חדרים או יחידות ארוח', m: 'חדרים', split: 'none',
    groups: [{ g: 'all', fx: { toilet: once(1), basin: once(1), shower: once(1) }, per: true }],
    notes: ['כולל אכסניות, בתי הארחה, מעונות סטודנטים, מלון דירות וכד\'.', 'ניתן להתקין אמבט עם מקלח יד במקום מקלחת.'] },
  { id: 'hotP', t: '3.6.3.4(ב)', name: 'מלונאות — שרותים ציבוריים', m: 'אנשים', split: 'mw', men: 50,
    groups: [
      { g: 'm', fx: { toilet: s([[100, 2], [200, 3], [300, 4]], [200, 1]), urinal: s([[100, 2], [200, 3], [300, 4]], [200, 1]), basin: s([[100, 2], [200, 3], [300, 4]], [200, 1]) } },
      { g: 'w', fx: { toilet: s([[100, 5], [200, 7], [300, 10]], [100, 1]), basin: s([[100, 4], [200, 6], [300, 8]], [100, 1]) } }],
    notes: ['לפי התפוסה המכסימלית הצפויה באזור הציבורי — 50% גברים, 50% נשים.', 'אזורים מיוחדים (אולמות אירועים, מסעדות) — לפי הסעיף המתאים, בהכללת הסידורים בטבלה 3.6.3.4(ב).'] },

  { id: 'show', t: '3.6.3.5(א)', name: 'אולם מופעים, אירועים וכנסים — קהל המבקרים', m: 'אנשים', split: 'mw', men: 50,
    groups: [
      { g: 'm', fx: { toilet: s([[100, 2], [200, 3], [400, 4]], [100, 1]), urinal: s([[100, 2], [200, 3], [400, 4]], [100, 1]), basin: s([[100, 3], [200, 5], [400, 7]], [100, 1]) } },
      { g: 'w', fx: { toilet: s([[100, 6], [200, 9], [400, 12]], [100, 3]), basin: s([[100, 5], [200, 7], [400, 10]], [100, 2]) } }],
    building: () => ({ drink: 1 }), bNotes: { drink: 'באזורי ההמתנה של קהל המבקרים' },
    notes: ['תיאטרון, אולם קונצרטים, קולנוע, אודיטוריום — למעט בניין להסעדה, תפילה, מוזיאון, ספריה, מועדון או ספורט.', 'בריכוז בתי קולנוע: מספר הקבועות לפי מספר אנשים המהווים רבע ממספר המושבים הכולל.'] },
  { id: 'stage', t: '3.6.3.5(ב)', name: 'אולם מופעים — במות (לצוות)', m: 'אנשים', split: 'mw', men: 50,
    groups: [
      { g: 'm', fx: { toilet: s([[35, 1], [55, 2]], [40, 1]), urinal: s([[35, 1], [55, 1]], [40, 1]), basin: s([[35, 2], [55, 3]], [40, 1]), shower: s([[35, 2], [55, 2]], [40, 1]) } },
      { g: 'w', fx: { toilet: s([[35, 2], [55, 3]], [40, 1]), basin: s([[35, 2], [55, 3]], [40, 1]), shower: s([[35, 2], [55, 2]], [40, 1]) } }],
    building: () => ({ ksink: 1, drink: 1 }), bNotes: { ksink: 'בצמוד למקום המיועד למזנון' }, notes: [] },

  { id: 'asm', t: '3.6.3.6', name: 'מוזיאון, ספריה, מועדון, בית תפילה (ללא מופעים)', m: 'אנשים', split: 'mw', men: 50,
    groups: [
      { g: 'm', fx: { toilet: s([[50, 1], [100, 2], [200, 2], [400, 3]], [200, 1]), urinal: s([[50, 1], [100, 1], [200, 2], [400, 3]], [200, 1]), basin: s([[50, 1], [100, 2], [200, 3], [400, 5]], [200, 1]) } },
      { g: 'w', fx: { toilet: s([[50, 2], [100, 3], [200, 5], [400, 7]], [100, 1]), basin: s([[50, 1], [100, 2], [200, 4], [400, 5]], [100, 1]) } }],
    notes: ['יחס החלוקה 50% גברים ו-50% נשים, למעט בבתי תפילה — לפי צפי המתפללים.'] },

  { id: 'dine', t: '3.6.3.7(א)', name: 'בית אוכל — קהל המבקרים', m: 'מבקרים', split: 'mw', men: 50, shared: 30,
    sharedFx: { toilet: 1, basin: 1 },
    groups: [
      { g: 'm', fx: { toilet: s([[50, 1], [100, 2], [200, 3]], [200, 1]), urinal: s([[50, 1], [100, 2], [200, 3]], [200, 1]), basin: s([[50, 1], [100, 2], [200, 3]], [100, 1]) } },
      { g: 'w', fx: { toilet: s([[50, 2], [100, 4], [200, 6]], [100, 1]), basin: s([[50, 2], [100, 3], [200, 5]], [100, 1]) } }],
    notes: ['מסעדה, אולם ארועים, מזנון, בית קפה וכד\'. ראה גם חוק רישוי עסקים.', 'עד 30 מבקרים ומבקרות — השרותים משותפים.'] },
  { id: 'dineS', t: '3.6.3.7(ב)', name: 'בית אוכל — צוות עובדים', m: 'עובדים', split: 'none', shared0: 5,
    groups: [{ g: 'all', fx: { toilet: s([[5, 0], [10, 1]], [10, 1]), basin: s([[5, 0], [10, 1]], [10, 1]) } }],
    notes: ['עד 5 עובדים ועובדות — השימוש בשרותים של קהל המבקרים.'] },

  { id: 'indL', t: '3.6.3.8(א)', name: 'תעשייה קלה', m: 'עובדים', split: 'mw', men: 50,
    groups: [
      { g: 'm', fx: { toilet: s([[10, 1], [25, 2], [50, 2], [80, 3], [110, 3]], [60, 1]), urinal: s([[10, 1], [25, 1], [50, 1], [80, 2], [110, 3]], [60, 1]), basin: s([[10, 1], [25, 2], [50, 3], [80, 4], [110, 5]], [30, 1]) } },
      { g: 'w', fx: { toilet: s([[10, 2], [25, 3], [50, 4], [80, 5], [110, 6]], [30, 1]), basin: s([[10, 2], [25, 3], [50, 4], [80, 5], [110, 6]], [30, 1]) } }],
    building: P => ({ drink: Math.ceil(P / 50) }), bNotes: { drink: 'לכל 50 אנשים' },
    notes: ['מעבדה, בית מלאכה, נגריה, מתפרה, בית דפוס, ניקוי יבש, מוסך, תעשייה עתירת ידע וכד\'.', 'הנהלה — כמו בבניין משרדים.', 'יחס החלוקה בין גברים לנשים ייקבע לפי הצפי של סוג המפעל.'] },
  { id: 'indH', t: '3.6.3.8(ב)', name: 'תעשייה כבדה ותעשייה מסוכנת', m: 'עובדים', split: 'mw', men: 50,
    groups: [
      { g: 'm', fx: { toilet: s([[10, 1], [25, 2], [50, 2], [80, 3], [110, 3]], [60, 1]), urinal: s([[10, 1], [25, 1], [50, 1], [80, 2], [110, 3]], [60, 1]), basin: s([[10, 2], [25, 3], [50, 4], [80, 5], [110, 6]], [15, 1]), shower: s([[5, 1]], [7, 1]) } },
      { g: 'w', fx: { toilet: s([[10, 2], [25, 3], [50, 4], [80, 5], [110, 6]], [30, 1]), basin: s([[10, 2], [25, 3], [50, 4], [80, 5], [110, 6]], [30, 1]), shower: s([[5, 1]], [7, 1]) } }],
    building: P => ({ drink: Math.ceil(P / 50) }), bNotes: { drink: 'לכל 50 אנשים' },
    notes: ['מפעל מתכת, קרמיקה, זכוכית, הרכבת חלקי מכונות, מזקקת נפט, מנסרת עץ וכד\'.', 'הנהלה — כמו בבניין משרדים.'] },
  { id: 'indF', t: '3.6.3.8(ג)', name: 'תעשיית יצור מזון', m: 'עובדים', split: 'mw', men: 50,
    groups: [
      { g: 'm', fx: { toilet: s([[10, 1], [25, 2], [50, 2], [80, 3], [110, 3]], [60, 1]), urinal: s([[10, 1], [25, 1], [50, 1], [80, 2], [110, 3]], [60, 1]), basin: s([[10, 1], [25, 3], [50, 4], [80, 6], [110, 10]], [15, 1]), shower: s([[10, 1]], [7, 1]) } },
      { g: 'w', fx: { toilet: s([[10, 2], [25, 3], [50, 4], [80, 5], [110, 6]], [30, 1]), basin: s([[10, 2], [25, 3], [50, 4], [80, 5], [110, 6]], [10, 1]), shower: s([[5, 1]], [15, 1]) } }],
    building: P => ({ drink: Math.ceil(P / 50) }), bNotes: { drink: 'לכל 50 אנשים' },
    notes: ['בחדר האוכל יותקנו כיורי רחצה נוספים (הערה 10 לטבלה).', 'הנהלה — כמו בבניין משרדים.'] },

  { id: 'dormL', t: '3.6.3.9(א)', name: 'פנימייה / מוסד עם לינה — לנים או חוסים', m: 'חוסים', split: 'mw', men: 50, floors: true,
    groups: [
      { g: 'm', fx: { toilet: s([[10, 1]], [15, 1]), urinal: s([[10, 1]], [15, 1]), basin: s([[10, 1]], [15, 1]), shower: s([[5, 1]], [10, 1]) } },
      { g: 'w', fx: { toilet: s([[5, 1]], [5, 1]), basin: s([[5, 1]], [10, 1]), shower: s([[5, 1]], [10, 1]) } }],
    building: (P, fl) => ({ drink: Math.ceil(P / 50), janitor: fl }), bNotes: { drink: 'לכל 50 חוסים', janitor: 'בכל קומה' },
    notes: ['בית אבות, דיור מוגן, מעון לנשים מוכות, מעון לעיוורים, פנימייה וכד\'.', 'אם חלוקת הלנים היא כדוגמת יחידות דיור או חדרי מלון — לפי טבלה 3.6.3.4(א).'] },
  { id: 'dormS', t: '3.6.3.9(ב)', name: 'פנימייה / מוסד עם לינה — סגל', m: 'אנשי סגל', split: 'mw', men: 50,
    groups: [
      { g: 'm', fx: { toilet: s([[15, 1], [50, 2]], [50, 1]), urinal: s([[15, 1], [50, 2]], [50, 1]), basin: s([[15, 1], [50, 1]], [50, 1]) } },
      { g: 'w', fx: { toilet: s([[15, 2], [50, 4]], [25, 1]), basin: s([[15, 2], [50, 3]], [50, 1]) } }],
    notes: [] },

  { id: 'comW', t: '3.6.3.10(א)', name: 'מסחר — עובדי בתי המסחר', m: 'עובדים', split: 'mw', men: 40, shared: 15,
    sharedFx: { toilet: 2, basin: 1 },
    groups: [
      { g: 'm', fx: { toilet: s([[20, 2], [40, 3]], [20, 1]), urinal: s([[20, 1], [40, 2]], [20, 2]), basin: s([[20, 2], [40, 3]], [20, 1]) } },
      { g: 'w', fx: { toilet: s([[20, 3], [40, 5]], [10, 1]), basin: s([[20, 2], [40, 3]], [10, 1]) } }],
    notes: ['עד 15 עובדים ועובדות — השרותים משותפים.', 'יחס חלוקה בין הגברים לנשים יקבע לפי 40% גברים ו-60% נשים.', 'לפחות אסלה אחת וכיור רחצה אחד לכל חנות מעל ל-25 מ"ר.'] },
  { id: 'comP', t: '3.6.3.10(ב)', name: 'מסחר — שרותים ציבוריים (לפי שטח מסחרי)', m: 'מ"ר שטח מסחרי', split: 'area',
    groups: [
      { g: 'm', fx: { toilet: s([[99.99, 0], [1000, 1], [2000, 2]], [1000, 1]), urinal: s([[99.99, 0], [1000, 1], [2000, 2]], [1000, 1]), basin: s([[99.99, 0], [500, 1], [1000, 2], [2000, 3]], [1000, 1]) } },
      { g: 'w', fx: { toilet: s([[99.99, 0], [500, 2], [1000, 3], [2000, 4]], [1000, 1]), basin: s([[99.99, 0], [500, 2], [1000, 3], [2000, 4]], [1000, 1]) } }],
    building: A => ({ drink: A >= 100 ? 1 : 0 }), bNotes: { drink: '1 לכל קבוצת שרותים ציבוריים' },
    notes: ['לפי השטח המסחרי או שטח מול. השטח אינו כולל שטח בתי עסק שיש להם שרותים ציבוריים בנפרד (בתי קולנוע, מסעדות).', 'מרחק ההליכה ימדד בתחום השטח הציבורי; אחת מיחידות השרותים בסמוך לאזור ריכוז בתי האוכל.', 'עד 100 מ"ר — הקבועות משותפות לעובדים ולציבור ואין הפרדה בין גברים לנשים.'] },

  { id: 'sport', t: '3.6.3.11(א)', name: 'מיתקן ספורט — קהל הצופים', m: 'צופים', split: 'sport',
    groups: [
      { g: 'm', share: 50, fx: { toilet: s([[140, 1]], [140, 1]), urinal: s([[140, 1]], [140, 1]), basin: s([[210, 1]], [210, 1]) } },
      { g: 'w', share: 15, fx: { toilet: s([[70, 1]], [70, 1]), basin: s([[200, 1]], [200, 1]) } },
      { g: 'u', share: 35, fx: { toilet: s([[70, 1]], [70, 1]), basin: s([[200, 1]], [200, 1]) } }],
    notes: ['יחס החלוקה: 50% גברים, 15% נשים, 35% לשימוש דו-תכליתי.', 'בכל יחידת שרותים לפחות 2 אסלות או 2 משתנות, ו-2 כיורי רחצה; ברז שתייה — עד 200: 1, ולכל 200 נוספים: 1 (לכל יחידת שרותים).', 'שטחים תפעוליים — כמו בבניין משרדים.'] },

  { id: 'trans', t: '3.6.3.12', name: 'תחנת הסעה (רכבת, אוטובוס, נמל)', m: 'שוהים', split: 'mw', men: 50,
    groups: [
      { g: 'm', fx: { toilet: s([[500, 1]], [500, 1]), urinal: s([[500, 1]], [500, 1]), basin: s([[500, 2]], [500, 2]) } },
      { g: 'w', fx: { toilet: s([[150, 1]], [150, 1]), basin: s([[150, 1]], [150, 1]) } }],
    building: P => ({ drink: P <= 150 ? 1 : 1 + Math.ceil((P - 150) / 500) }), bNotes: { drink: 'עד 150: 1, ולכל 500 נוספים: 1' },
    notes: ['מספר האנשים יקבע לפי מספר השוהים המקסימלי הצפוי בתחנה.', 'יותקנו אסלות תלויות.'] },

  { id: 'fuel', t: '3.6.3.13', name: 'תחנת דלק', m: 'תחנה', split: 'none',
    groups: [{ g: 'm', fx: { toilet: once(1), basin: once(1) }, per: true }, { g: 'w', fx: { toilet: once(1), basin: once(1) }, per: true }],
    notes: ['בנוסף לסידורים התברואיים הנדרשים לאזורי המסחר, הסעדה וכו\'.'] },

  { id: 'pool', t: '3.6.3.14', name: 'בריכת שחייה — לפי שטח פני המים', m: 'מ"ר פני מים', split: 'pool',
    groups: [
      { g: 'm', fx: { toilet: s([[100, 1]], [100, 1]), urinal: s([[100, 1]], [100, 1]), basin: s([[100, 1]], [100, 1]), shower: s([[60, 1]], [60, 1]) } },
      { g: 'w', fx: { toilet: s([[50, 1]], [50, 1]), basin: s([[50, 1]], [50, 1]), shower: s([[60, 1]], [60, 1]) } }],
    building: P => ({ drink: Math.ceil(P / 100) }), bNotes: { drink: 'לכל 100' },
    notes: ['קיבולת המבקרים = שטח פני המים ÷ 3 × 4; מספר הגברים שווה למספר הנשים.', 'אמצעי לשטיפה חובה בכל כניסה לבריכת שחייה.'] },
];

const HLT_GENERAL = [
  ['3.6.1(א)', 'המספר המינימלי של כל קבועות השרברבות יהא בהתאם להוראות טבלאות 3.6.3.1 עד 3.6.3.14.'],
  ['3.6.2(ב)', 'בבנינים בהם נדרשים סידורים תברואיים לאנשים עם מוגבלות, ימנו סידורים אלה במנין הסידורים המינימליים של הבנין.'],
  ['3.6.2(ג)', 'במקום שבו נדרש תא שירותים אחד, יהיה זה תא נגיש לאנשים עם מוגבלות.'],
  ['3.6.3(א)', 'בכל טבלה בה נדרשות משתנות, ניתן להתקין במקומן אסלות במספר זהה.'],
  ['3.6.3(ג)', 'בכל מקום בו הוגדר מספר האנשים כ"לכל (מספר אנשים) נוספים/ות", הכוונה למספר האנשים שצוין או לחלק ממנו.'],
  ['3.6.3(ו)', 'מרחק ההליכה האופקי מכל מקום בבנין, למעט בתי אוכל, אל יחידת השירותים, לא יעלה על 75 מטר.'],
];

/* ════════════ Arithmetic ════════════
   Text comes back through T(template, vars), the page's I18N.t, so English can reorder the
   slots; the default only fills them. */
const fill = (s, v) => v ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m)) : String(s);
const r1 = x => Math.round(x * 10) / 10;

/* ── parking ── */
const ZONES = ['A', 'B', 'C', 'N'];
const useById = id => USES.find(u => u.id === id);
function ruleSet(u, basis) {
  const m = u.main, t = basis === 'total' ? u.total : null;
  if (!t) return m;
  return { ref: t.ref, z: t.z || m.z, steps: t.steps || m.steps, far: t.far || m.far };
}
function ruleText(r, mKey, T) {
  T = T || fill;
  if (r.kind === 'none') return T('ללא חניה');
  const unit = T(MEASURES[mKey]);
  const kind = { max: 'מרבי', min: 'מזערי', range: 'טווח' }[r.kind];
  let s;
  if (mKey === 'area' || r.hi < 1) {
    const a = Math.round(1 / r.hi), b = Math.round(1 / r.lo);
    s = T('1 לכל {n} {u}', { n: a === b ? a : `${a}–${b}`, u: unit });
  } else s = T('{n} לכל {u}', { n: r.lo === r.hi ? r1(r.hi) : `${r1(r.lo)}–${r1(r.hi)}`, u: unit });
  return kind ? `${s} (${T(kind)})` : s;
}
/* One use row → { min, max, noMin, noMax, refs, parts:[{label, text}] }.
   noMin: a maximum only (no lower bound); noMax: a minimum only. Each row rounds up (Part A §6). */
function carRow(row, sh, T) {
  T = T || fill;
  const u = useById(row.type), q = +row.qty || 0; if (!u) return null;
  const set = ruleSet(u, sh.basis), z = sh.zone || 'N';
  const out = { min: 0, max: 0, noMin: false, noMax: false, refs: [], parts: [] };
  const add = (rule, qty, label, ref) => {
    if (ref) out.refs.push(ref);
    out.parts.push({ label, text: ruleText(rule, u.m, T) });
    if (rule.kind === 'none') return;
    const lo = rule.lo * qty, hi = rule.hi * qty;
    if (rule.kind === 'max') { out.noMin = true; out.max += hi; }
    else if (rule.kind === 'min') { out.noMax = true; out.min += lo; }
    else { out.min += lo; out.max += hi; }
  };
  if (z === 'N' && set.far) {
    const above = (+sh.far || 0) > set.far.at;
    add(above ? set.far.hi : set.far.lo, q, T(above ? 'מעל {p}% זכויות בנייה' : 'עד {p}% זכויות בנייה', { p: set.far.at }), set.far.ref[above ? 1 : 0]);
  } else if (u.tiers) {
    const [s0, s1] = set.steps, seg = [Math.min(q, s0), Math.max(0, Math.min(q, s1) - s0), Math.max(0, q - s1)];
    const refs = set.ref.split('–'), f = n => n.toLocaleString('en-US');
    const labels = [T('עד {a} מ"ר', { a: f(s0) }), T('{a}–{b} מ"ר', { a: f(s0), b: f(s1) }), T('מעל {a} מ"ר', { a: f(s1) })];
    seg.forEach((qq, i) => { if (qq > 0) add(set.z[i][z], qq, labels[i], i === 0 ? refs[0] : i === 2 ? refs[1] : ''); });
  } else {
    add(set.z[z] || set.z.N, q, '', set.ref);
  }
  out.min = Math.ceil(out.min - 1e-9); out.max = Math.ceil(out.max - 1e-9);
  return out;
}
function bikeRow(row, sh) {
  const u = useById(row.type); if (!u || !u.bike) return null;
  const c = BIKES[u.bike], r = c[sh.basis === 'total' ? 'total' : 'main'];
  if (c.need === 'students' && !row.students) return { n: null, c };
  const q = c.need === 'students' ? +row.students || 0 : +row.qty || 0;
  return { n: Math.ceil(r.lo * q - 1e-9), c };
}
function motoRow(row, sh) {
  const u = useById(row.type); if (!u || !u.moto) return null;
  const c = MOTOS[u.moto], r = c[sh.basis === 'total' ? 'total' : 'main'], q = +row.qty || 0;
  if (c.minQty && q < c.minQty) return { min: 0, max: 0, c, na: true };
  return { min: Math.ceil(r.lo * q - 1e-9), max: Math.ceil(r.hi * q - 1e-9), c };
}
function parkingTotals(sh, zoneOverride) {
  const s2 = zoneOverride ? Object.assign({}, sh, { zone: zoneOverride }) : sh;
  const t = { min: 0, max: 0, noMin: false, noMax: false, bikes: 0, bikesMissing: 0, mMin: 0, mMax: 0 };
  (s2.rows || []).forEach(r => {
    const c = carRow(r, s2); if (c) { t.min += c.min; t.max += c.max; t.noMin = t.noMin || c.noMin; t.noMax = t.noMax || c.noMax; }
    const b = bikeRow(r, s2); if (b) { if (b.n == null) t.bikesMissing++; else t.bikes += b.n; }
    const m = motoRow(r, s2); if (m) { t.mMin += m.min; t.mMax += m.max; }
  });
  return t;
}
/* "130–295", "up to 20", "at least 12" */
function span(min, max, noMin, noMax, T) {
  T = T || fill;
  if (noMax && !max) return T('לפחות {n}', { n: min });
  if (min === max) return String(max);
  if (noMin && !min) return T('עד {n}', { n: max });
  return `${min}–${max}`;
}
function stationsNear(lat, lng, radius) {
  return STATIONS.map(s => ({ name: s.name, type: s.type, planned: s.isPlanned, d: Math.round(haversine(lat, lng, s.lat, s.lng)) }))
    .filter(s => s.d <= (radius || 800)).sort((a, b) => a.d - b.d);
}
const zoneForStation = s => s.planned ? 'C' : s.d <= 300 ? 'A' : s.d <= 600 ? 'B' : 'C';

/* ── הל"ת ── */
const hltById = id => HLT.find(u => u.id === id);
/* One use row → { u, groups:[{g, n, fx:{key:{c, t}}}], extra:{key:{c, note}}, desc:{tpl, vars} }.
   g: m | w | u (dual-use) | all | shared */
function hltRow(row, T) {
  T = T || fill;
  const u = hltById(row.type); if (!u) return null;
  const P = +row.qty || 0, men = row.men != null ? +row.men : (u.men != null ? u.men : 50), fl = Math.max(1, +row.floors || 1);
  const out = { u, groups: [], extra: {}, desc: null };
  const put = (g, n, fx, mult) => {
    const r = { g, n, fx: {} };
    Object.keys(fx).forEach(k => {
      const rule = fx[k];
      const c = mult != null ? stepCount(rule, 1) * mult : stepCount(rule, n);
      r.fx[k] = { c, t: mult != null ? `${stepCount(rule, 1)} × ${mult}` : stepText(rule, n, T) };
    });
    out.groups.push(r);
  };
  if (u.shared && P <= u.shared) {
    const fx = {}; Object.keys(u.sharedFx).forEach(k => { fx[k] = { c: u.sharedFx[k], t: T('עד {n} — משותף', { n: u.shared }) }; });
    out.groups.push({ g: 'shared', n: P, fx }); out.desc = { tpl: '{p} {u} — שרותים משותפים', vars: { p: P } };
  } else if (u.split === 'none') {
    u.groups.forEach(gr => gr.per ? put(gr.g, P, gr.fx, P) : put(gr.g, P, gr.fx));
    out.desc = { tpl: '{p} {u}', vars: { p: P } };
  } else if (u.split === 'mw') {
    const m = Math.round(P * men / 100), w = P - m;
    put('m', m, u.groups[0].fx); put('w', w, u.groups[1].fx);
    out.desc = { tpl: '{p} {u} · {m} גברים / {w} נשים', vars: { p: P, m, w } };
  } else if (u.split === 'area') {
    u.groups.forEach(gr => put(gr.g, P, gr.fx));
    out.desc = P < 100 ? { tpl: '{p} מ"ר — עד 100 מ"ר: אין חובת שרותים ציבוריים נפרדים', vars: { p: P } } : { tpl: '{p} מ"ר שטח מסחרי', vars: { p: P } };
  } else if (u.split === 'sport') {
    const ns = u.groups.map(gr => Math.ceil(P * gr.share / 100));
    u.groups.forEach((gr, i) => put(gr.g, ns[i], gr.fx));
    out.desc = { tpl: '{p} צופים · {m} גברים / {w} נשים / {x} דו-תכליתי', vars: { p: P, m: ns[0], w: ns[1], x: ns[2] } };
  } else if (u.split === 'pool') {
    const cap = Math.ceil(P / 3 * 4), half = Math.ceil(cap / 2);
    put('m', half, u.groups[0].fx); put('w', half, u.groups[1].fx);
    out.desc = { tpl: '{p} מ"ר פני מים → קיבולת {c} מבקרים (÷3 ×4) · {h} גברים / {h} נשים', vars: { p: P, c: cap, h: half } };
  }
  if (u.building) {
    const base = u.split === 'pool' ? Math.ceil(P / 3 * 4) : P, b = u.building(base, fl);
    Object.keys(b).forEach(k => { out.extra[k] = { c: b[k], note: (u.bNotes || {})[k] || '' }; });
  }
  return out;
}
function hltTotals(sh) {
  const T = { m: {}, w: {}, u: {}, all: {}, bld: {} };
  (sh.rows || []).forEach(r => {
    const x = hltRow(r); if (!x) return;
    x.groups.forEach(g => { const key = g.g === 'shared' ? 'all' : g.g; Object.keys(g.fx).forEach(k => { T[key][k] = (T[key][k] || 0) + g.fx[k].c; }); });
    Object.keys(x.extra).forEach(k => { T.bld[k] = (T.bld[k] || 0) + x.extra[k].c; });
  });
  T.sum = {};
  ['m', 'w', 'u', 'all', 'bld'].forEach(g => Object.keys(T[g]).forEach(k => { T.sum[k] = (T.sum[k] || 0) + T[g][k]; }));
  return T;
}

/* Required vs proposed: plan = { floors:[{id, name, fx:{toilet_m:…}}] } */
const PCOLS = [
  { k: 'toilet_m', fx: 'toilet', g: 'm' }, { k: 'toilet_w', fx: 'toilet', g: 'w' }, { k: 'toilet_x', fx: 'toilet', g: 'x' },
  { k: 'urinal_m', fx: 'urinal', g: 'm' },
  { k: 'basin_m', fx: 'basin', g: 'm' }, { k: 'basin_w', fx: 'basin', g: 'w' }, { k: 'basin_x', fx: 'basin', g: 'x' },
  { k: 'shower_m', fx: 'shower', g: 'm' }, { k: 'shower_w', fx: 'shower', g: 'w' }, { k: 'shower_x', fx: 'shower', g: 'x' },
  { k: 'ksink', fx: 'ksink', g: 'b' }, { k: 'laundry', fx: 'laundry', g: 'b' },
  { k: 'drink', fx: 'drink', g: 'b' }, { k: 'janitor', fx: 'janitor', g: 'b' },
];
const FLOOR_FX = ['drink', 'janitor', 'ksink'];
function reqFor(T, c) {
  if (c.g === 'm') return T.m[c.fx] || 0;
  if (c.g === 'w') return T.w[c.fx] || 0;
  if (c.g === 'x') return (T.all[c.fx] || 0) + (T.u[c.fx] || 0);
  return T.bld[c.fx] || 0;
}
/* → { cols, lines:[{c, req, pr, gap, st:'ok'|'bad', cover, swap, missing:[floor names]}], bad, entered } */
function planCheck(sh, Tot) {
  Tot = Tot || hltTotals(sh);
  const floors = (sh.plan && sh.plan.floors) || [];
  const cols = PCOLS.filter(c => reqFor(Tot, c) > 0 || floors.some(f => +(f.fx || {})[c.k] > 0));
  const prop = c => floors.reduce((a, f) => a + (+(f.fx || {})[c.k] || 0), 0);
  const perFloor = new Set();
  (sh.rows || []).forEach(r => { const u = hltById(r.type); if (u && u.floors) { const x = hltRow(r); FLOOR_FX.forEach(k => { if ((x.extra[k] || {}).c) perFloor.add(k); }); } });
  const uC = cols.find(c => c.k === 'urinal_m'), tM = cols.find(c => c.k === 'toilet_m');
  const toiletSurplus = tM ? Math.max(0, prop(tM) - reqFor(Tot, tM)) : 0;
  const urinalShort = uC ? Math.max(0, reqFor(Tot, uC) - prop(uC)) : 0;
  const lines = cols.map(c => {
    const req = reqFor(Tot, c), pr = prop(c), gap = pr - req;
    const line = { c, req, pr, gap, st: gap >= 0 ? 'ok' : 'bad', cover: 0, swap: 0, missing: [] };
    // 3.6.3(א): urinals may be replaced by the same number of toilets
    if (c === uC && gap < 0 && toiletSurplus >= -gap) { line.st = 'ok'; line.cover = toiletSurplus; }
    if (c === tM && urinalShort && toiletSurplus >= urinalShort) line.swap = urinalShort;
    if (perFloor.has(c.fx)) line.missing = floors.filter(f => !(+(f.fx || {})[c.k] > 0)).map(f => f.name);
    if (line.missing.length) line.st = 'bad';
    return line;
  });
  const entered = floors.some(f => Object.keys(f.fx || {}).some(k => +f.fx[k] > 0));
  return { cols, lines, bad: lines.filter(l => l.st === 'bad').length, entered, prop };
}

const api = {
  MEASURES, CATS, USES, BIKES, MOTOS, STATIONS, ZONES, FIX, FIX_ORDER, HLT, HLT_GENERAL, PCOLS, FLOOR_FX,
  haversine, stationsNear, zoneForStation, useById, ruleSet, ruleText, carRow, bikeRow, motoRow, parkingTotals, span,
  hltById, stepCount, stepText, hltRow, hltTotals, reqFor, planCheck, fill,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.CalcRules = api;
})(typeof window !== 'undefined' ? window : this);
