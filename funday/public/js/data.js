export const EMPLOYEES = [
  { id: 'emp-01', name: 'דוד קנפו' },
  { id: 'emp-02', name: 'אריה חיון' },
  { id: 'emp-03', name: 'יונתן מאירי' },
  { id: 'emp-04', name: 'תמי בליזובסקי' },
  { id: 'emp-05', name: 'נורית לוי' },
  { id: 'emp-06', name: 'חנן רודיך' },
  { id: 'emp-07', name: 'שי הרשקוביץ' },
  { id: 'emp-08', name: 'נטע שוורץ' },
  { id: 'emp-09', name: 'אסף כוהנים' },
  { id: 'emp-10', name: 'דניאל פולישוק' },
  { id: 'emp-11', name: 'מיקה מרקוסון' },
  { id: 'emp-12', name: 'איילה שירן' },
  { id: 'emp-13', name: 'יותם שדמי' },
  { id: 'emp-14', name: 'אלון ניסן' },
  { id: 'emp-15', name: 'סמיון פישקין' },
  { id: 'emp-16', name: 'עדי רוזן' },
  { id: 'emp-17', name: 'נועה גרגיר' },
  { id: 'emp-18', name: 'שני בוזוקאשויל' },
  { id: 'emp-19', name: 'גיא שפירו' },
  { id: 'emp-20', name: 'שון הפוטה' },
  { id: 'emp-21', name: 'שיר בן שואב' },
  { id: 'emp-22', name: 'אוניר שטגמן' },
  { id: 'emp-23', name: 'דניאל שר' },
  { id: 'emp-24', name: 'עמית שהרבני' },
  { id: 'emp-25', name: 'סתיו ברקוביץ' },
  { id: 'emp-26', name: 'עדי מחוליה עמנואל' },
  { id: 'emp-27', name: 'לי גלביס' },
];

export const ACTIVITIES = [
  {
    id: 'cooking',
    name: 'סדנת בישול',
    description: 'בישול קבוצתי לפי סגנון',
    time: '3-5 שעות',
    location: 'תל אביב',
    notes: 'אופציה לשילוב עם סיור בשוק',
    link: 'https://www.bishulon.co.il/',
  },
  {
    id: 'print',
    name: 'סדנת הדפס',
    description: 'סדנת הדפס קדום (אופציה לשילוב קדרות לסירוגין)',
    time: '2 שעות',
    location: 'עין הוד',
    notes: 'איש קשר: תמר נבון, 054-4246549',
    link: 'https://www.ein-hod.org/סדנת-הדפס-עין-הוד/',
  },
  {
    id: 'tlvshow',
    name: 'TLVSHOW',
    description: 'פעילות חברתית בעיר בשילוב חידות ומשחקים — כמו אסקייפ רום',
    time: '2-2.5 שעות',
    location: 'תל אביב / חיפה',
    notes: 'מומלץ מאוד ע"י חברים, האפשרות של תל אביב הכי פופולרית',
    link: 'https://tlvshow.com/',
  },
  {
    id: 'molet',
    name: 'MOLET',
    description: 'סדנאות נגרות עם עץ ממוחזר',
    time: '3 שעות',
    location: 'בת ים',
    notes: 'אפשרויות: אור ועץ, פריסטייל, קורה למחשבה, אימפקט',
    link: 'https://www.molet.org/he/workshops/heb-private/',
  },
];

export function getEmployeeById(id) {
  return EMPLOYEES.find((employee) => employee.id === id) ?? null;
}

export function getActivityById(id) {
  return ACTIVITIES.find((activity) => activity.id === id) ?? null;
}

export function isValidEmployeeId(id) {
  return EMPLOYEES.some((employee) => employee.id === id);
}

export function isValidActivityId(id) {
  return ACTIVITIES.some((activity) => activity.id === id);
}

export function employeesSortedForDropdown() {
  return [...EMPLOYEES].sort((a, b) => a.name.localeCompare(b.name, 'he'));
}
