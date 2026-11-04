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

/* ════════════ הג"א ════════════
   תקנות ההתגוננות האזרחית (מפרטים לבניית מקלטים), התש"ן-1990 — חלק ג' (מגורים), חלק ג'1 (מוסדי, תקנה 236)
   ונספח א' לתקנה 236(א) (שטח כולל); מפרט למיגון מוסדות חינוך, נובמבר 2023 (טבלה 1, סעיף 8).
   kind: pct — % of the area (main or total by the check's basis); per — m² per unit; edu — per classroom;
   mamad — a ממ"ד per apartment; mamak — a ממ"ק per 4 apartments; none — not counted (236(ב)). */
const HGA_KINDS = { mamam: 'ממ"מ', mamad: 'ממ"ד', mamak: 'ממ"ק', edu: 'מרחב מוגן במוסד חינוך' };
const HGA_GROUPS = { res: 'מגורים', inst: 'מבני ציבור ותעסוקה (תקנה 236)', edu: 'מוסדות חינוך (מפרט 2023)', excl: 'שימושים שאינם במניין (236(ב))' };
const pct = (main, total, m) => ({ kind: 'pct', main, total, m: m || 'area' });
const HGA_USES = [
  { id: 'res_mamad', g: 'res', space: 'mamad', name: 'דירה עם ממ"ד', unit: 'יח"ד', kind: 'mamad', ref: '197א', perSpace: 9, min: 9,
    note: 'ממ"ד לכל דירה — שטח נטו של 9 מ"ר לפחות ונפח 22.5 מ"ק (תקנה 197א(1)).' },
  { id: 'res_mamak_big', g: 'res', space: 'mamak', name: 'דירה מעל 100 מ"ר עיקרי — ממ"ק', unit: 'יח"ד', kind: 'mamak', ref: '171–172', perUnit: 5,
    note: '5 מ"ר נטו ליחידת דיור ששטחה העיקרי עולה על 100 מ"ר; ממ"ק משרת עד 4 יחידות דיור.' },
  { id: 'res_mamak_small', g: 'res', space: 'mamak', name: 'דירה עד 100 מ"ר עיקרי — ממ"ק', unit: 'יח"ד', kind: 'mamak', ref: '171–172', perUnit: 4,
    note: '4 מ"ר נטו ליחידת דיור ששטחה העיקרי אינו עולה על 100 מ"ר; ממ"ק משרת עד 4 יחידות דיור.' },

  { id: 'off', g: 'inst', name: 'בניין משרדים', ref: '236(א) 1', ...pct(3, 1.8) },
  { id: 'lab', g: 'inst', name: 'מעבדות', ref: '236(א) 2', ...pct(3, 1.8) },
  { id: 'bank', g: 'inst', name: 'בנקים', ref: '236(א) 3', ...pct(2, 1.2) },
  { id: 'post', g: 'inst', name: 'בתי דואר', ref: '236(א) 4', ...pct(4, 2.4), confirm: true },
  { id: 'court', g: 'inst', name: 'בתי משפט — אולמות משפט', ref: '236(א) 5', kind: 'per', per: 5, unit: 'אולמות' },
  { id: 'courtOff', g: 'inst', name: 'בתי משפט — משרדים', ref: '236(א) 5', ...pct(3, 1.8) },
  { id: 'relig', g: 'inst', name: 'מבני דת (בית כנסת, מסגד, כנסייה, אולם תפילה)', ref: '236(א) 6', ...pct(1, 0.8) },
  { id: 'senior', g: 'inst', name: 'דיור מוגן ובית אבות לעצמאיים', ref: '236(א) 7', kind: 'per', per: 2.5, unit: 'יחידות מגורים' },
  { id: 'hotel', g: 'inst', name: 'בתי מלון, בתי הבראה, צימרים', ref: '236(א) 8', kind: 'per', per: 1, unit: 'יחידות אירוח' },
  { id: 'hostel', g: 'inst', name: 'אכסניות, פנימיות (שטח ברוטו של חדרי המגורים)', ref: '236(א) 9', ...pct(20, 20, 'gross') },
  { id: 'clinic', g: 'inst', name: 'מרפאות מד"א, תחנות אם וילד', ref: '236(א) 10', ...pct(3, 1.8) },
  { id: 'comm', g: 'inst', name: 'מתנ"סים, מרכזים קהילתיים, מועדוני נוער', ref: '236(א) 11', ...pct(2, 1.2) },
  { id: 'indOff', g: 'inst', name: 'תעשייה — משרדים ותעשייה מתקדמת (היי-טק)', ref: '236(א) 12', ...pct(3, 1.8) },
  { id: 'indHall', g: 'inst', name: 'תעשייה — אולם ייצור', ref: '236(א) 12', ...pct(2, 1.2) },
  { id: 'indStore', g: 'inst', name: 'תעשייה — מחסנים', ref: '236(א) 12', ...pct(0.8, 0.8), confirm: true },
  { id: 'workshop', g: 'inst', name: 'בתי מלאכה', ref: '236(א) 13', ...pct(2, 1.2) },
  { id: 'shopBig', g: 'inst', name: 'מרכז קניות / חנות מעל 200 מ"ר', ref: '236(א) 14', ...pct(2, 1.2) },
  { id: 'shopSmall', g: 'inst', name: 'חנות עד 200 מ"ר', ref: '236(א) 14', ...pct(0.5, 0.5), confirm: true },
  { id: 'fuel', g: 'inst', name: 'תחנת דלק', ref: '236(א) 15', ...pct(2, 1.2) },

  { id: 'kg', g: 'edu', space: 'edu', name: 'גן ילדים / מעון יום / גן בחינוך מיוחד', unit: 'כיתות', kind: 'edu', ref: 'טבלה 1, 1', perClass: 12, min: 12 },
  { id: 'sch1', g: 'edu', space: 'edu', name: 'בית ספר — כיתות א\'–י\'', unit: 'כיתות', kind: 'edu', ref: 'טבלה 1, 2', perClass: 15, min: 15 },
  { id: 'sch11', g: 'edu', space: 'edu', name: 'בית ספר — כיתות י"א ואילך', unit: 'כיתות', kind: 'edu', ref: 'טבלה 1, 2', perClass: 7.5, min: 15 },
  { id: 'spec', g: 'edu', space: 'edu', name: 'מוסד לחינוך מיוחד', unit: 'כיתות', kind: 'edu', ref: 'טבלה 1, 3', perClass: 10, min: 15, special: true },
  { id: 'specSev', g: 'edu', space: 'edu', name: 'חינוך מיוחד — פיגור קשה/עמוק, סיעודי, שיתוק מוחין', unit: 'כיתות', kind: 'edu', ref: 'טבלה 1, 4', perClass: 15, min: 15, special: true },
  { id: 'eduAux', g: 'edu', space: 'edu', name: 'מבנה נפרד — מנהלה, ספרייה, אולם ספורט', unit: 'מבנה', kind: 'fixed', ref: '8(ה)(1)', fixed: 10,
    note: 'במבנה מנהלה, ספרייה ואולם ספורט ייבנה מרחב מוגן בשטח 10 מ"ר נטו; אינו בא בחישוב השטח הנדרש לכיתות.' },

  ...['תרבות ובידור, קולנוע, תיאטרון, אודיטוריום', 'ספורט ונופש — אולמות ספורט, בריכות', 'אולמי שמחות, מסעדות, מזנונים', 'אולם תערוכות, מוזיאון, גלריה, ספרייה',
    'מחסן ללא נוכחות עובדים', 'חניון'].map((name, i) => ({ id: 'ex' + i, g: 'excl', name, ref: '236(ב)', kind: 'none' })),
];
const HGA_LIMITS = { mamam: { max: 60, ref: '236(ג)' }, edu: { max: 90, ref: 'מפרט חינוך 8(ג)' }, mamad: { min: 9, ref: '197א(1)' } };
const HGA_SYSTEMS = [33, 50, 66, 83, 100];
const hgaById = id => HGA_USES.find(u => u.id === id);
const hgaSpaceOf = u => u.space || (u.g === 'inst' ? 'mamam' : null);

/* One use on a floor → { u, space, area (m² net required), count (spaces required, for ממ"ד/ממ"ק), min, text } */
function hgaRow(row, basis, T) {
  T = T || fill;
  const u = hgaById(row.type); if (!u) return null;
  const q = +row.qty || 0, out = { u, space: hgaSpaceOf(u), area: 0, count: 0, min: u.min || (u.g === 'inst' ? 10 : 0), text: '' };
  if (u.kind === 'pct') {
    const p = basis === 'total' ? u.total : u.main;
    out.area = q * p / 100; out.rate = p + '%';
    out.text = T(u.m === 'gross' ? '{p}% משטח ברוטו של חדרי המגורים' : basis === 'total' ? '{p}% מהשטח הכולל בקומה' : '{p}% מהשטח העיקרי בקומה', { p });
  } else if (u.kind === 'per') {
    out.area = q * u.per; out.text = T('{a} מ"ר ל{u}', { a: u.per, u: T(u.unit) });
  } else if (u.kind === 'mamad') {
    out.count = q; out.area = q * u.perSpace; out.text = T('ממ"ד של {a} מ"ר לכל דירה', { a: u.perSpace });
  } else if (u.kind === 'mamak') {
    out.count = Math.ceil(q / 4); out.area = q * u.perUnit; out.text = T('{a} מ"ר ליח"ד; ממ"ק לכל 4 יח"ד', { a: u.perUnit });
  } else if (u.kind === 'edu') {
    // special education with more than 9 classrooms: +5 m² for each classroom (spec 8(ב))
    const per = u.special && q > 9 ? u.perClass + 5 : u.perClass;
    out.area = q * per; out.text = T('{a} מ"ר לכיתה', { a: per });
  } else if (u.kind === 'fixed') {
    out.area = q > 0 ? u.fixed : 0; out.text = T('{a} מ"ר נטו', { a: u.fixed });
  } else out.text = T('לא בא במניין');
  return out;
}
/* A floor → required area and spaces by kind of protected space.
   ממ"מ / education: the floor's uses add up and the minimum of the largest-minimum use applies. How the area divides
   into spaces is free: the proposed spaces must reach the total, each within the minimum and maximum size.
   ממ"ד: one per apartment, 9 m² each. ממ"ק: one per 4 apartments. */
function hgaFloor(floor, basis, T) {
  const rows = (floor.uses || []).map(r => ({ r, x: hgaRow(r, basis, T) })).filter(o => o.x);
  const req = {};
  rows.forEach(({ x }) => {
    if (!x.space) return;
    const k = x.space, o = req[k] || (req[k] = { kind: k, raw: 0, min: 0, count: 0 });
    o.raw += x.area; o.count += x.count;
    if (x.area > 0) o.min = Math.max(o.min, x.min);
  });
  Object.values(req).forEach(o => {
    o.area = Math.round(Math.max(o.raw, o.raw > 0 ? o.min : 0) * 100) / 100;
    o.minApplied = o.raw > 0 && o.raw < o.min;
  });
  return { rows, req };
}
/* Required vs proposed on a floor: proposed spaces = [{id, name, kind, area, systems:[]}] */
function hgaCheckFloor(floor, basis, T) {
  const f = hgaFloor(floor, basis, T), spaces = floor.spaces || [];
  const kinds = new Set(Object.keys(f.req).concat(spaces.map(s => s.kind)));
  const lines = [...kinds].map(k => {
    const rq = f.req[k] || { area: 0, count: 0 };
    const mine = spaces.filter(s => s.kind === k), area = mine.reduce((a, s) => a + (+s.area || 0), 0);
    const lim = HGA_LIMITS[k] || {};
    const tooBig = lim.max ? mine.filter(s => +s.area > lim.max).map(s => s.name) : [];
    const minEach = Math.max(lim.min || 0, rq.min || 0), maxEach = lim.max || 0;
    const tooSmall = minEach ? mine.filter(s => +s.area < minEach).map(s => s.name) : [];
    const gap = Math.round((area - rq.area) * 100) / 100, cgap = mine.length - rq.count;
    const ok = gap >= -1e-9 && cgap >= 0 && !tooBig.length && !tooSmall.length;
    return { kind: k, minEach, maxEach, reqArea: rq.area, reqCount: rq.count, area: Math.round(area * 100) / 100, count: mine.length, gap, cgap, tooBig, tooSmall, ok };
  });
  return { f, lines, bad: lines.filter(l => !l.ok).length };
}
/* A protected-space tower repeats through the floors, as a stair flight does: it has one kind and one area.
   A floor is part of a tower when it holds a space pointing at it (space.tower). That space's own area is empty
   unless this floor differs; each floor keeps its own space, so its ventilation systems stay its own.
   Older sheets have spaces with no tower: the same place in the kind's list at the same area is the same tower. */
function hgaTowers(sh) {
  const towers = (Array.isArray(sh.towers) ? sh.towers : []).map(t => Object.assign({}, t));
  const known = new Set(towers.map(t => t.id));
  const floors = safRenumber(sh.floors || []).map((fl, i) => {
    const slot = {};
    const spaces = (fl.spaces || []).map(s => {
      const n = slot[s.kind] = (slot[s.kind] || 0) + 1;
      if (s.tower && known.has(s.tower)) return s;
      const a = +s.area || 0;
      let t = towers.find(o => o.kind === s.kind && o.slot === n && (+o.area || 0) === a);
      if (!t) { t = { id: s.id || 'tw' + towers.length, kind: s.kind, area: s.area == null ? null : s.area, slot: n }; towers.push(t); }
      return Object.assign({}, s, { tower: t.id, area: null });
    });
    return Object.assign({}, fl, { id: fl.id || 'fl' + i, spaces });
  });
  return { floors, towers: towers.map(({ slot, ...t }) => t) };
}
const hgaHasArea = s => s.area != null && s.area !== '';
/* The floors with each space's real area filled in, for everything that checks or adds up areas */
function hgaResolve(floors, towers) {
  return floors.map(fl => Object.assign({}, fl, { spaces: (fl.spaces || []).map(s => {
    if (hgaHasArea(s)) return s;
    const t = towers.find(o => o.id === s.tower);
    return Object.assign({}, s, { area: t ? t.area : s.area });
  }) }));
}
function hgaSheet(sh) {
  const { floors, towers } = hgaTowers(sh);
  return { floors, towers, resolved: hgaResolve(floors, towers) };
}
/* Puts a floor in a tower or takes it out */
function hgaSetTowerFloor(floors, tower, floorId, on, newId) {
  return floors.map(fl => {
    if (fl.id !== floorId) return fl;
    const spaces = fl.spaces || [], has = spaces.some(s => s.tower === tower.id);
    if (on) return has ? fl : Object.assign({}, fl, { spaces: spaces.concat([{ id: newId(), kind: tower.kind, tower: tower.id, area: null, systems: [] }]) });
    return Object.assign({}, fl, { spaces: spaces.filter(s => s.tower !== tower.id) });
  });
}
/* A tower no floor holds any more is gone */
function hgaPruneTowers(towers, floors) {
  return towers.filter(t => floors.some(fl => (fl.spaces || []).some(s => s.tower === t.id)));
}
function hgaFloorHasData(fl) { return (fl.uses || []).length > 0 || (fl.spaces || []).length > 0; }
/* A new top floor with the same contents: its spaces carry on in the same towers */
function hgaCopyFloorUp(floors, i, newId) {
  const c = JSON.parse(JSON.stringify(floors[i])), level = safNextLevel(floors);
  ['uses', 'spaces'].forEach(k => (c[k] || []).forEach(x => { x.id = newId(); }));
  return floors.concat([Object.assign(c, { id: newId(), level, name: safFloorName(level) })]);
}
function hgaTotals(sh, T) {
  const t = { reqArea: 0, area: 0, bad: 0, floors: 0, byKind: {} };
  hgaSheet(sh).resolved.forEach(fl => {
    const c = hgaCheckFloor(fl, sh.basis, T);
    if (c.lines.length) t.floors++;
    c.lines.forEach(l => {
      t.reqArea += l.reqArea; t.area += l.area; if (!l.ok) t.bad++;
      const o = t.byKind[l.kind] || (t.byKind[l.kind] = { reqArea: 0, area: 0, reqCount: 0, count: 0 });
      o.reqArea += l.reqArea; o.area += l.area; o.reqCount += l.reqCount; o.count += l.count;
    });
  });
  t.reqArea = Math.round(t.reqArea * 100) / 100; t.area = Math.round(t.area * 100) / 100;
  return t;
}
/* Ventilation and filtration for one space: people = ceil(area / m² per person), flow = people × m³/h per person;
   the chosen systems must add up to at least the people. */
function hgaVent(space, cfg) {
  const k = +(cfg && cfg.m2pp) || 0.4, q = +(cfg && cfg.flow) || 6, area = +space.area || 0;
  const exact = area / k, people = Math.ceil(exact - 1e-9), flow = people * q;
  const sys = (space.systems || []).map(Number).filter(Boolean), cap = sys.reduce((a, b) => a + b, 0);
  return { exact: Math.round(exact * 100) / 100, people, flow, cap, ok: people === 0 || cap >= people, suggest: hgaSuggest(people) };
}
/* standard systems that cover the people: the fewest units, then the smallest total */
function hgaSuggest(people) {
  if (!(people > 0)) return [];
  let best = null;
  const go = (left, from, pick) => {
    if (left <= 0) {
      const sum = pick.reduce((a, b) => a + b, 0);
      if (!best || pick.length < best.pick.length || (pick.length === best.pick.length && sum < best.sum)) best = { sum, pick: pick.slice() };
      return;
    }
    if (pick.length >= 6) return;
    for (let i = from; i >= 0; i--) { pick.push(HGA_SYSTEMS[i]); go(left - HGA_SYSTEMS[i], i, pick); pick.pop(); }
  };
  go(people, HGA_SYSTEMS.length - 1, []);
  return best ? best.pick : [];
}

/* ════════════ בטיחות ════════════
   תקנות התכנון והבנייה (בקשה להיתר, תנאיו ואגרות), התש"ל-1970 — תוספת שנייה, חלק ג' (בטיחות אש בבניינים):
   3.2.12.1–3.2.12.5 (תפוסה, מקדמי רוחב, פרוזדור), 3.2.1.3 (רוחב דלתות), 3.2.1.21 (מנגנון בהלה),
   3.2.2.2 (רוחב מדרגות), 3.2.13.2–3.2.13.3 (מספר יציאות ודרכי מוצא).
   factor: m² per person; [lo, hi] — a range the designer may choose in (3.2.12.3(ב2)); q — the occupancy is entered
   directly (seats, bench length, planned); door: the row of table 3.2.1.3; w: width category of table 3.2.12.4. */
const SAF_GROUPS = { asm: 'התקהלות', edu: 'מוסדות חינוך', hea: 'מוסדות בריאות', res: 'מגורים ולינה', ind: 'תעשייה ועסקים', com: 'מסחר', oth: 'אחר' };
const SAF_USES = [
  { id: 'a1', g: 'asm', n: 1, name: 'אולם אסיפות עם מושבים מקובעים', q: 'seats', max: true, door: 'asm' },
  { id: 'a2', g: 'asm', n: 2, name: 'אולם אסיפות, מושבים לא מקובעים, לצפייה באירוע', factor: 1, max: true, door: 'asm' },
  { id: 'a3', g: 'asm', n: 3, name: 'אולם אסיפות ללא מקומות ישיבה', factor: [0.75, 1], max: true, door: 'asm' },
  { id: 'a3a', g: 'asm', n: '3א', name: 'אולם עם שולחנות / אולם שמחות', factor: [1, 1.4], max: true, door: 'asm' },
  { id: 'a6', g: 'asm', n: 6, name: 'אצטדיון / אולם ספורט — ספסלים (0.50 מ\' לאדם)', q: 'bench', max: true, door: 'asm' },
  { id: 'a7', g: 'asm', n: 7, name: 'אצטדיון / אולם ספורט — מושבים מקובעים', q: 'seats', max: true, door: 'asm' },
  { id: 'a8', g: 'asm', n: 8, name: 'כדורת, ביליארד ומשחקים', factor: 1.1, max: true, door: 'asm' },
  { id: 'a9', g: 'asm', n: 9, name: 'אולם המתנה לאולם אסיפות', factor: 1, door: 'asm' },
  { id: 'a11', g: 'asm', n: 11, name: 'מסעדה או שטח הסעדה', factor: [1, 1.4], door: 'asm' },
  { id: 'a12', g: 'asm', n: 12, name: 'מטבח', factor: 10 },
  { id: 'a13', g: 'asm', n: 13, name: 'ספרייה — אולם קריאה', factor: 4.6, door: 'asm' },
  { id: 'a14', g: 'asm', n: 14, name: 'ספרייה — אזור מדפים', factor: 10 },
  { id: 'a15', g: 'asm', n: 15, name: 'בריכה — שטח המים', factor: 3, max: true, door: 'asm' },
  { id: 'a16', g: 'asm', n: 16, name: 'בריכה — שטחים מרוצפים מסביב', factor: 3, door: 'asm' },
  { id: 'a21', g: 'asm', n: 21, name: 'חדר כושר עם ציוד', factor: 4.6 },
  { id: 'a22', g: 'asm', n: 22, name: 'חדר כושר ללא ציוד', factor: 1.4, door: 'asm' },
  { id: 'a23', g: 'asm', n: 23, name: 'במה', factor: 1.4 },
  { id: 'e25', g: 'edu', n: 25, name: 'כיתה', factor: 1.25, door: 'class' },
  { id: 'e26', g: 'edu', n: 26, name: 'חדרי מלאכה (חינוך)', factor: 4, door: 'class' },
  { id: 'e27', g: 'edu', n: 27, name: 'מעבדה במוסד חינוך', factor: 2.5, door: 'class' },
  { id: 'e28', g: 'edu', n: 28, name: 'כיתה בגן ילדים או מעון יום', factor: 3.3, door: 'class' },
  { id: 'h29', g: 'hea', n: 29, name: 'מרפאות (ברוטו)', factor: 9, w: 'amb' },
  { id: 'h30', g: 'hea', n: 30, name: 'מחלקות טיפול (ברוטו)', factor: 22, w: 'ward' },
  { id: 'h31', g: 'hea', n: 31, name: 'חדרי חולים — שינה (ברוטו)', factor: 11, w: 'ward' },
  { id: 'r33', g: 'res', n: 33, name: 'בניין דירות (נטו שטח הדירות)', factor: 18 },
  { id: 'r34', g: 'res', n: 34, name: 'בתי מלון ומעונות סטודנטים', factor: 18 },
  { id: 'r35', g: 'res', n: 35, name: 'דיור מוגן (ברוטו)', factor: 18 },
  { id: 'r36', g: 'res', n: 36, name: 'אולם מיטות באכסניה', factor: 5 },
  { id: 'i37', g: 'ind', n: 37, name: 'תעשייה רגילה', factor: 10 },
  { id: 'i38', g: 'ind', n: 38, name: 'תעשייה מיוחדת — לפי התפוסה המתוכננת (עד 100)', q: 'planned' },
  { id: 'i39', g: 'ind', n: 39, name: 'תעשייה מסוכנת — לפי התפוסה המתוכננת (עד 100)', q: 'planned', w: 'haz', hazard: true },
  { id: 'i40', g: 'ind', n: 40, name: 'בית מלאכה', factor: 5 },
  { id: 'b41', g: 'ind', n: 41, name: 'משרדים', factor: 10, door: 'office' },
  { id: 'b42', g: 'ind', n: 42, name: 'אולם אחסון', factor: 30 },
  { id: 'c43', g: 'com', n: 43, name: 'מסחר בקומת מרתף', factor: 3, door: 'shop' },
  { id: 'c44', g: 'com', n: 44, name: 'מסחר בקומת רחוב', factor: 3, door: 'shop' },
  { id: 'c45', g: 'com', n: 45, name: 'מסחר מעל מפלס הרחוב', factor: 6, door: 'shop' },
  { id: 'c46', g: 'com', n: 46, name: 'אחסון / קבלת סחורה, לא פתוח לקהל', factor: 30 },
  { id: 'o48', g: 'oth', n: 48, name: 'חניון', factor: 30 },
  { id: 'o49', g: 'oth', n: 49, name: 'מקלט או מרחב מוגן — לא במניין', none: true },
];
// table 3.2.12.4 — cm per person: [stairs and ramps over 8%, horizontal]
const SAF_WIDTH = {
  other: { s: 0.8, h: 0.5, name: 'כל האחרים' }, ward: { s: 1.0, h: 0.5, name: 'מחלקה סיעודית בבית חולים' },
  amb: { s: 0.8, h: 0.5, name: 'מחלקה אמבולטורית עם מתזים' }, ambNs: { s: 1.5, h: 1.3, name: 'מחלקה אמבולטורית ללא מתזים' },
  haz: { s: 1.8, h: 1.0, name: 'אזור בעל סיכון גבוה' },
};
// table 3.2.12.5 — minimum corridor width (m)
const SAF_CORRIDOR = [
  { id: 'res', w: 1.10, name: 'בניין מגורים, משרדים, תעשייה או מלאכה' }, { id: 'com', w: 1.30, name: 'בניין מסחרי' },
  { id: 'pub', w: 1.30, name: 'בניין המשמש מוסד ציבורי' }, { id: 'school', w: 2.40, name: 'אגף כיתות בבית ספר יסודי עד תיכון' },
  { id: 'beds', w: 2.20, name: 'מעבר מיטות בבית חולים / מחלקה סיעודית' }, { id: 'psy', w: 1.80, name: 'בית חולים פסיכיאטרי' },
  { id: 'amb', w: 1.50, name: 'פרוזדור לחולים אמבולטוריים' }, { id: 'assist', w: 1.50, name: 'דיור מוגן' },
  { id: 'care', w: 1.80, name: 'בית אבות' }, { id: 'aux', w: 1.10, name: 'חלק בניין שאינו משמש לייעודו הראשי' },
];
const SAF_HEIGHTS = { low: 'עד 13 מ\' (אינו גבוה)', high: 'בניין גבוה (13–29 מ\')', tower: 'בניין רב-קומות (מעל 29 מ\')' };
const safUse = id => SAF_USES.find(u => u.id === id);
const r2s = n => Math.round(n * 100) / 100;

/* table 3.2.1.3 — the minimum door from a space, by its use, occupancy and area */
function safDoorMin(u, occ, area) {
  if (u.door === 'asm') return occ > 100 ? { w: 1.10, row: 15 } : { w: 0.90, row: 14 };
  if (u.door === 'class') return { w: 0.90, row: 16 };
  if (u.door === 'office') return { w: 0.90, row: 11 };
  if (u.door === 'shop') return area > 100 ? { w: 1.10, row: 19 } : { w: 0.90, row: 18 };
  return { w: 0.80, row: 1 };
}
const safWidthCat = (u, sh) => u.w === 'amb' && !sh.sprinklers ? 'ambNs' : (u.w || 'other');

/* One space → occupancy, exits, door width and panic hardware */
function safSpace(sp, sh) {
  const u = safUse(sp.use); if (!u) return null;
  const area = +sp.area || 0;
  let factor = null, occ = 0;
  if (u.none) occ = 0;
  else if (u.q === 'seats' || u.q === 'planned') occ = Math.ceil(+sp.qty || 0);
  else if (u.q === 'bench') occ = Math.floor((+sp.qty || 0) / 0.5);
  else {
    factor = Array.isArray(u.factor) ? Math.min(Math.max(+sp.factor || u.factor[0], u.factor[0]), u.factor[1]) : u.factor;
    occ = area > 0 ? Math.ceil(area / factor - 1e-9) : 0;
  }
  if (u.q === 'planned') occ = Math.min(occ, 100);
  const exits = occ > 1000 ? 4 : occ > 500 ? 3 : (occ >= 50 || (u.hazard && area > 20)) ? 2 : 1;   // 3.2.13.2
  const cat = safWidthCat(u, sh), wf = SAF_WIDTH[cat];
  const horiz = r2s(occ * wf.h / 100);                                  // total horizontal width, m
  const dmin = safDoorMin(u, occ, area);
  // each door keeps the table 3.2.1.3 minimum; together the doors carry the calculated width (3.2.12.4)
  return { u, area, factor, occ, exits, cat, horiz, doorMin: dmin, doorReq: dmin.w, panic: occ > 100 };
}
/* The proposed doors of a space against the requirement */
function safSpaceCheck(sp, sh) {
  const x = safSpace(sp, sh); if (!x) return null;
  const doors = +sp.doors || 0, w = +sp.doorW || 0;
  const issues = [];
  if (x.occ > 0 && doors < x.exits) issues.push({ k: 'doors', need: x.exits, have: doors });
  if (x.occ > 0 && doors && w + 1e-9 < x.doorReq) issues.push({ k: 'width', need: x.doorReq, have: w });
  if (x.occ > 0 && doors && w && doors * w + 1e-9 < x.horiz) issues.push({ k: 'total', need: x.horiz, have: r2s(doors * w) });
  if (x.panic && !sp.panic) issues.push({ k: 'panic' });
  return Object.assign(x, { doors, w, issues, ok: !issues.length, entered: doors > 0 || w > 0 });
}
/* A floor → total occupancy, exits, width per exit, corridor and stairs (before the "no reduction" rule) */
function safFloor(fl, sh) {
  const spaces = (fl.spaces || []).map(sp => ({ sp, x: safSpaceCheck(sp, sh) })).filter(o => o.x);
  const occ = spaces.reduce((a, o) => a + o.x.occ, 0);
  // the widest factor on the floor applies to its shared exits (3.2.12.7(א))
  const cats = spaces.filter(o => o.x.occ > 0).map(o => o.x.cat);
  const wf = cats.reduce((m, c) => SAF_WIDTH[c].s > m.s ? SAF_WIDTH[c] : m, SAF_WIDTH.other);
  const roomMax = spaces.reduce((a, o) => Math.max(a, o.x.occ > 0 ? o.x.exits : 0), 0);
  let exits = occ > 1000 ? 4 : occ > 500 ? 3 : 2, single = '';                         // 3.2.13.3
  if (exits === 2 && sh.height !== 'tower') {
    if (sh.residential) { exits = 1; single = 'res'; }
    else if (occ <= 30 && fl.short30) { exits = 1; single = 'small'; }
  }
  exits = Math.max(exits, roomMax);
  const share = exits ? occ / exits : 0;
  const levelDoor = (+fl.level || 0) === 0;
  const stairMin = sh.twoDwellings ? 0.90 : sh.height === 'low' ? 1.00 : 1.10;          // 3.2.2.2
  const corr = SAF_CORRIDOR.find(c => c.id === fl.corridor) || SAF_CORRIDOR[0];
  return {
    spaces, occ, exits, single, roomMax, share, wf,
    horizPer: r2s(share * wf.h / 100), stairPer: r2s(share * wf.s / 100),
    // the floor's total width; it may be split unevenly between the exits (3.2.12.1(ב), 3.2.12.4)
    horizTot: r2s(occ * wf.h / 100), stairTot: r2s(occ * wf.s / 100),
    doorMinLevel: levelDoor ? 1.10 : 0.80, doorMinStair: levelDoor ? 1.10 : 0.90,       // table 3.2.1.3 rows 1, 12, 13
    stairMin, corrMin: corr.w, corr, corrCalc: r2s(share * wf.h / 100),
    panic: occ > 100,                                                                    // 3.2.1.21
  };
}
/* A floor's stair flights; older checks kept them on the exits (kind 'stair') */
const safStairs = fl => fl.stairs || (fl.exits || []).filter(e => e.kind === 'stair').map(e => ({ id: e.id, w: e.stair }));
/* A floor's default name follows its level and is stored in Hebrew, the source language; a name someone typed stays as typed */
const SAF_AUTO_NAME = /^(קומה|Floor) -?\d+$|^(קומת קרקע|Ground floor)$/;
function safFloorName(level) { return +level === 0 ? 'קומת קרקע' : 'קומה ' + (+level); }
function safFloorLabel(fl, t) {
  if (fl.name && !SAF_AUTO_NAME.test(fl.name)) return fl.name;
  return +fl.level === 0 || !fl.level ? t('קומת קרקע') : t('קומה {n}', { n: +fl.level });
}
function safRename(f, level) { return Object.assign({}, f, { level, name: !f.name || SAF_AUTO_NAME.test(f.name) ? safFloorName(level) : f.name }); }
function safNextLevel(floors) { return floors.length ? Math.max(...floors.map(f => +f.level || 0)) + 1 : 0; }
/* A floor's number is its place in the list: the list runs from the lowest floor up, with level 0 after the floors under ground */
function safRenumber(floors) {
  const lv = f => +f.level || 0;
  const below = floors.filter(f => lv(f) < 0).length;
  return floors.slice().sort((a, b) => lv(a) - lv(b)).map((f, i) => safRename(f, i - below));
}
/* The name someone typed, or nothing when the floor just carries its number */
function safFloorNick(fl) { return fl.name && !SAF_AUTO_NAME.test(fl.name) ? fl.name : ''; }
/* Moves a floor in the list; the list runs from the lowest floor up, so each place takes the next level in order */
function safMoveFloor(floors, from, to) {
  const levels = floors.map(f => +f.level || 0).sort((a, b) => a - b);
  const list = floors.slice();
  list.splice(to, 0, list.splice(from, 1)[0]);
  return list.map((f, i) => safRename(f, levels[i]));
}

/* Removes a floor and closes the gap: floors further from the exit level step one level towards it */
function safRemoveFloor(floors, i) {
  const L = +floors[i].level || 0;
  return floors.filter((_, k) => k !== i).map(f => {
    const M = +f.level || 0;
    return safRename(f, L >= 0 && M > L ? M - 1 : L < 0 && M < L ? M + 1 : M);
  });
}

/* Floors above ground count the ground floor; anything at level 0 or higher is above, below that is under ground */
function safFloorCounts(floors) {
  const below = floors.filter(f => (+f.level || 0) < 0).length;
  return { above: floors.length - below, below };
}
/* Brings the list to these counts: the top and the deepest floors go first, new ones join at the ends. make(level) builds a floor */
function safSetCounts(floors, above, below, make) {
  const lv = f => +f.level || 0;
  const sorted = floors.slice().sort((a, b) => lv(a) - lv(b));
  const up = sorted.filter(f => lv(f) >= 0).slice(0, above), under = sorted.filter(f => lv(f) < 0);
  under.splice(0, Math.max(0, under.length - below));
  while (up.length < above) up.push(make(safNextLevel(up)));
  while (under.length < below) under.unshift(make(under.length ? lv(under[0]) - 1 : -1));
  return under.concat(up);
}
function safFloorHasData(fl) {
  return (fl.spaces || []).length > 0 || (fl.exits || []).length > 0 || (fl.corridorW != null && fl.corridorW !== '');
}
/* Copies a floor's contents over other floors, which keep their own place and name. newId makes the copied rows their own */
function safCopyFloor(floors, from, targets, newId) {
  return floors.map((f, k) => {
    if (!targets.includes(k)) return f;
    const c = JSON.parse(JSON.stringify(floors[from]));
    delete c.stairs;
    ['spaces', 'exits'].forEach(key => (c[key] || []).forEach(x => { x.id = newId(); }));
    return Object.assign(c, { id: f.id, name: f.name, level: f.level });
  });
}

/* When the building needs protected stairs. The list is shown as a requirement: nothing here checks the stairs drawn */
function safProtectedStairs(sh, below) {
  const out = [];
  if (sh.height === 'tower') out.push({ ref: '3.7.1.3', text: 'בניין רב-קומות: שני חדרי מדרגות מוגנים לפחות' });
  if (sh.height === 'high') out.push({ ref: '3.7.1.2', text: 'בניין גבוה: חדר מדרגות מוגן', note: 'שניים, אלא אם הבניין למגורים, תפוסת כל קומה עד 30 איש, או מרחק ההליכה לדלת האש עד 30 מ\'' });
  if (below > 0 && sh.deepBelow) out.push({ ref: '3.2.3.3', text: 'קומות תחתיות: חדרי המדרגות המחויבים שמשרתים אותן יהיו מוגנים' });
  return out;
}

/* Stair flights belong to the building: each has one width and the levels it runs through.
   Older sheets kept a list on each floor; the same place in the list at the same width is the same flight */
function safFlights(sh) {
  if (Array.isArray(sh.stairs)) return sh.stairs;
  const out = [];
  (sh.floors || []).forEach(fl => safStairs(fl).forEach((st, slot) => {
    const L = +fl.level || 0, w = +st.w || 0;
    const same = out.find(x => x.slot === slot && (+x.w || 0) === w);
    if (same) same.levels.push(L);
    else out.push({ id: st.id || 'st' + out.length, slot, w: st.w, levels: [L] });
  }));
  return out.map(({ slot, ...f }) => f);
}
/* After a floor goes: it leaves every flight, and the levels past it step towards the exit level as the floors do */
function safFlightsWithout(flights, L) {
  return flights.map(f => Object.assign({}, f, { levels: f.levels.filter(M => M !== L).map(M => L >= 0 && M > L ? M - 1 : L < 0 && M < L ? M + 1 : M) }))
    .filter(f => f.levels.length);
}

/* The whole check: stairs take the largest requirement of the floors they serve on the way to the exit level */
function safCheck(sh) {
  const flights = safFlights(sh);
  const floors = (sh.floors || []).map(fl => ({ fl, f: safFloor(fl, sh) }));
  floors.forEach(o => {
    const L = +o.fl.level || 0;
    // stairs carry the floors they serve on the way to the exit level, with no reduction (3.2.12.1(ג));
    // a stair at the exit level carries everyone coming down or up to it
    const served = floors.filter(p => { const M = +p.fl.level || 0; return L > 0 ? M >= L : L < 0 ? M <= L : true; });
    o.f.stairGov = r2s(Math.max(o.f.stairTot, ...served.map(p => p.f.stairTot)));
    o.f.stairReq = o.f.stairMin;
    o.f.corrReq = r2s(Math.max(o.f.corrMin, o.f.corrCalc));
    const ex = o.fl.exits || [];
    const lines = [];
    lines.push({ k: 'count', need: o.f.exits, have: ex.length, ok: ex.length >= o.f.exits });
    // each exit door keeps its minimum; the floor's total width is checked on the sums
    ex.forEach(e => {
      const items = [{ k: 'door', need: o.f.doorMinStair, have: +e.door || 0 }];
      if (o.f.panic) items.push({ k: 'panic', need: true, have: !!e.panic });
      items.forEach(i => { i.ok = i.k === 'panic' ? i.have : i.have + 1e-9 >= i.need; });
      lines.push({ k: 'exit', e, items, ok: items.every(i => i.ok) });
    });
    if (ex.length && o.f.occ > 0) {
      const doors = r2s(ex.reduce((a, e) => a + (+e.door || 0), 0));
      lines.push({ k: 'doorSum', need: o.f.horizTot, have: doors, ok: doors + 1e-9 >= o.f.horizTot });
    }
    // stairs: on a floor off the exit level they are required; at the exit level only when drawn
    const stairs = flights.filter(st => st.levels.includes(L));
    o.stairs = stairs;
    stairs.forEach(st => lines.push({ k: 'stair', st, need: o.f.stairMin, have: +st.w || 0, ok: (+st.w || 0) + 1e-9 >= o.f.stairMin }));
    if ((stairs.length || L !== 0) && o.f.stairGov > 0) {
      const sw = r2s(stairs.reduce((a, st) => a + (+st.w || 0), 0));
      lines.push({ k: 'stairSum', need: o.f.stairGov, have: sw, ok: sw + 1e-9 >= o.f.stairGov });
    }
    if (o.fl.corridorW != null && o.fl.corridorW !== '') lines.push({ k: 'corridor', need: o.f.corrReq, have: +o.fl.corridorW || 0, ok: +o.fl.corridorW + 1e-9 >= o.f.corrReq });
    const spaceBad = o.f.spaces.filter(s => s.x.entered && !s.x.ok).length;
    o.lines = lines; o.bad = lines.filter(l => !l.ok).length + spaceBad;
  });
  return { floors, occ: floors.reduce((a, o) => a + o.f.occ, 0), bad: floors.reduce((a, o) => a + o.bad, 0) };
}

const api = {
  MEASURES, CATS, USES, BIKES, MOTOS, STATIONS, ZONES, FIX, FIX_ORDER, HLT, HLT_GENERAL, PCOLS, FLOOR_FX,
  haversine, stationsNear, zoneForStation, useById, ruleSet, ruleText, carRow, bikeRow, motoRow, parkingTotals, span,
  hltById, stepCount, stepText, hltRow, hltTotals, reqFor, planCheck, fill,
  SAF_GROUPS, SAF_USES, SAF_WIDTH, SAF_CORRIDOR, SAF_HEIGHTS, safUse, safDoorMin, safSpace, safSpaceCheck, safFloor, safStairs, safCheck, safFloorName, safFloorLabel, safFloorNick, safRenumber, safNextLevel, safFloorCounts, safSetCounts, safFloorHasData, safCopyFloor, safFlights, safFlightsWithout, safProtectedStairs, safMoveFloor, safRemoveFloor,
  HGA_KINDS, HGA_GROUPS, HGA_USES, HGA_LIMITS, HGA_SYSTEMS, hgaById, hgaSpaceOf, hgaRow, hgaFloor, hgaCheckFloor, hgaTowers, hgaResolve, hgaSheet, hgaSetTowerFloor, hgaPruneTowers, hgaFloorHasData, hgaCopyFloorUp, hgaTotals, hgaVent, hgaSuggest,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.CalcRules = api;
})(typeof window !== 'undefined' ? window : this);
