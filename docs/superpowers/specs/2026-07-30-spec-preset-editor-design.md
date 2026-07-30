# עיצוב: עורך תבניות (Preset Editor) — Spec Creator

**תאריך:** 2026-07-30
**פרויקט:** מחולל מפרטים ג2 (Spec Creator)
**מסמכים קשורים:** `2026-07-23-spec-creator-design.md`, Plans 1+2 (הושלמו ומוזגו).

## מטרה

להוסיף כפתור **⚙ ניהול תבניות** למסך הפרויקטים, שפותח מסך לעריכת ה-PRESETs —
התבניות שמהן נוצר פרויקט. משתמש (אדריכל) יוכל להגדיר לכל סוג מבנה (מבנה ציבור,
מגורים, משרדים...) אילו פרקים, תתי-פרקים, סעיפים ותתי-סעיפים רלוונטיים, וכן
ליצור/לשכפל/לשנות-שם/למחוק תבניות.

## הקשר — המצב הקיים

- **הספרייה** (`data/spec_library.json`): `{ _ts, chapters[], presets[] }`.
  - `chapter = { num, name, discipline, subChapters[] }`
  - `subChapter = { id, title, clauses[] }`
  - `clause = { id, text, kind, children[] }` (עץ; מספור נגזר מהמיקום, לא נשמר)
- **preset (היום)**: `{ id, name, buildingType, selections[] }`, כאשר
  `selection = { chapterNum, subChapterIds[] }`. כלומר whitelist ברמת תת-פרק בלבד;
  התוכן (clauses) תמיד נשאב שלם מהספרייה.
- `createProjectFromPreset(library, presetId, meta)` ב-
  `tools/spec-creator/lib/project.js` בונה פרויקט: מעתיק (snapshot) את כל הפרקים,
  מסמן `included` לפי ה-preset. עריכה בפרויקט לא משנה את הספרייה.
- השרת `tools/local-server/server.js` כבר חושף `/api/spec-library`
  (GET/POST → `data/spec_library.json`) דרך מפת `APPS`. **אין צורך בשינוי שרת.**

## החלטות שהתקבלו (brainstorming)

1. **רמת בחירה:** עד רמת **סעיף/תת-סעיף** (לא רק פרק+תת-פרק).
2. **ניהול:** **ריבוי תבניות מלא** — יצירה/שכפול/מחיקה/שינוי-שם + עריכת בחירות.
3. **אחסון בחירה ברמת סעיף:** **סט מוחרגים** (גישה A, ראה למטה).
4. **מחוץ להיקף (YAGNI):** עריכת *תוכן* סעיפים; הוספת פרקים/סעיפים שלא בספרייה;
   גרירה בעורך התבניות.

## מודל נתונים

הרחבת ה-preset בשדה אחד:

```
preset = { id, name, buildingType, selections[], excludedClauseIds[] }
selections[]        = { chapterNum, subChapterIds[] }   // ללא שינוי
excludedClauseIds[] = ["<clauseId>", ...]                // חדש; ברירת מחדל []
```

**חוק ההכללה של סעיף** (clause בעל `id`):
> סעיף כלול ⇔ תת-הפרק שלו נמצא ב-`subChapterIds` **וגם** לא ה-`id` שלו ולא ה-`id`
> של אף אב שלו בעץ נמצאים ב-`excludedClauseIds`.

- **החרגת אב מחריגה את כל תת-העץ** (הכיבוי חל על הצאצאים).
- **חסין לגדילת הספרייה:** סעיף חדש שנזרע נכנס אוטומטית (ברירת מחדל = כלול).
- **תאימות לאחור:** preset קיים ללא `excludedClauseIds` ⇒ נקרא כ-`[]` ⇒ בדיוק
  ההתנהגות הנוכחית.

הבחירה ברמת פרק/תת-פרק נשארת whitelist (`selections`), הבחירה ברמת סעיף היא
blacklist (`excludedClauseIds`). המודל התודעתי: "הכל רלוונטי כברירת מחדל, מכבים
מה שלא".

## רכיבים

### 1. לוגיקה טהורה — `tools/spec-creator/lib/preset-ops.js` (UMD חדש)

נבדק בבידוד (node), ללא DOM. יחשוף `window.SpecPreset`:

- `resolveClauseState(preset, clause)` → `'on' | 'off' | 'partial'`.
  מחשב תלת-מצב **מקומי** (עצמי + ילדים, ללא הקשר אבות): `off` אם ה-clause עצמו
  מוחרג; אחרת אם יש לו ילדים — נגזר ממצב הילדים (`on`=כולם on, `off`=כולם off,
  אחרת `partial`); עלה שאינו מוחרג = `on`.
  **הבהרת עקביות אב↔צאצא:** מכיוון שהחישוב מקומי, ה-`PresetTreeEditor` מעביר
  לצאצאים דגל `ancestorOff` — ילד תחת אב במצב `off` מוצג **מושבת (disabled) ומכובה
  ויזואלית** ללא תלות ב-`resolveClauseState` שלו. כך אין סתירה בין החישוב המקומי
  לחוק ההכללה (שמחריג צאצא של אב מוחרג), ואין צורך לשמור החרגות כפולות בעץ.
- `resolveSubChapterState(preset, chapter, subChapter)` → `'on'|'off'|'partial'`
  לפי חברות ב-`subChapterIds` ומצב הסעיפים שבתוכו.
- `resolveChapterState(preset, chapter)` → תלת-מצב לפי תתי-הפרקים.
- `toggleClause(preset, clauseSubtreeIds, on)` → preset חדש. כשמכבים: מוסיף את
  `id` ה-clause ל-`excludedClauseIds` ומנקה החרגות של צאצאיו (מיותרות). כשמדליקים:
  מסיר את ה-`id` **ואת כל מזהי תת-העץ** מ-`excludedClauseIds`.
- `toggleSubChapter(preset, chapterNum, subChapterId, on)` → מעדכן `subChapterIds`
  (מוסיף selection לפרק אם צריך; מסיר selection ריק). כיבוי תת-פרק לא נוגע ב-
  `excludedClauseIds` (הבחירה נשמרת אם ידליקו שוב).
- `toggleChapter(preset, chapter, on)` → מדליק/מכבה את כל תתי-הפרקים.
- `createPreset(name, buildingType)` → preset חדש ריק (`selections:[]`,
  `excludedClauseIds:[]`) עם `id` שנוצר.
- `duplicatePreset(preset, newName)` → עותק עמוק עם `id` חדש.
- `renamePreset` / `deletePreset` — עוזרי טהורים אם נוחים (או inline ברכיב).

הפונקציות אימיוטביליות (מחזירות preset/מבנה חדש), כמו `tree-ops.js`.

### 2. הרחבת `createProjectFromPreset` — `tools/spec-creator/lib/project.js`

בעת העתקת ה-clauses לתת-פרק, לסמן `included=false` לסעיפים שנמצאים תחת
`excludedClauseIds` (ה-`id` שלהם או של אב במחרוזת). שאר הלוגיקה ללא שינוי — עדיין
snapshot, עדיין מסמן `included` ברמת פרק/תת-פרק.
בדיקה: preset ללא `excludedClauseIds` מייצר פרויקט זהה למצב הנוכחי.

### 3. רכיבי React — `spec_creator.html`

- **`PresetManager`** — מסך מלא (במקום רשימת הפרויקטים/האשף). מקבל את `library`
  ופונקציית `onSave(nextLibrary)` ו-`onClose`. מנהל state של `library` מקומי.
  - משמאל **`PresetList`**: כרטיסי התבניות + כפתורי **הוסף / שכפל / שנֵה שם / מחק**.
  - מימין **`PresetTreeEditor`** לתבנית הנבחרת.
- **`PresetTreeEditor`** — עץ הספרייה (פרק → תת-פרק → סעיף → תת-סעיף) עם checkbox
  **תלת-מצבי** בכל רמה (`indeterminate=true` עבור `'partial'`), מתקפל/נפתח כמו
  `ChapterTree` הקיים. שינוי checkbox קורא ל-`SpecPreset.toggle*` ומעדכן את ה-
  preset בתוך ה-`library` המקומי.
- **כפתור `⚙ ניהול תבניות`** בכותרת מסך הפרויקטים, ליד `＋ פרויקט חדש`, שמעביר
  ל-`PresetManager`.

### 4. זרימת נתונים ושמירה

- טעינה: אותה טעינת `library` שכבר קיימת באפליקציה (GET `/api/spec-library`).
- עריכה: `PresetManager` עובד על עותק מקומי של `library`.
- שמירה: POST ל-`/api/spec-library` עם debounce 400ms (אותה תבנית כמו שמירת
  פרויקטים ב-Plan 2). מעדכן `_ts`.
- **בידוד:** עריכת preset לא נוגעת בפרויקטים קיימים (snapshot). פרויקט חדש שייווצר
  אחרי העריכה ישקף את התבנית המעודכנת.

## טיפול בשגיאות / מקרי קצה

- **מחיקת התבנית האחרונה:** לאפשר, אך אז האשף "פרויקט חדש" יציג מצב ריק/הודעה
  ("אין תבניות — צור תבנית בניהול תבניות"). לא לחסום מחיקה.
- **מחיקת תבנית שפרויקטים נוצרו ממנה:** מותר — הפרויקטים snapshot, לא תלויים ב-
  preset. `project.presetId` עשוי להצביע ל-preset שנמחק; זה שדה מטא בלבד, לא נטען.
- **שם ריק / כפול:** שם תבנית ריק → placeholder "(ללא שם)". כפילות שמות מותרת (id
  הוא המזהה).
- **preset ישן ללא `excludedClauseIds`:** נקרא כ-`[]` בכל הפונקציות (guard).

## בדיקות

- **`tools/spec-creator/test/preset-ops.test.js`** (node:test): תלת-מצב
  (`resolveClauseState`/`resolveSubChapterState`/`resolveChapterState`); toggle של
  אב מכבה/מדליק תת-עץ ומנקה החרגות מיותרות; toggle של תת-פרק; create/duplicate;
  אימיוטביליות; preset ריק = הכל on.
- **`tools/spec-creator/test/project.test.js`** (הרחבה): `createProjectFromPreset`
  מכבד `excludedClauseIds`; preset ללא השדה = התנהגות נוכחית.
- **שרת:** אין שינוי; `/api/spec-library` כבר מכוסה ב-`api.test.js`.
- **ידני בדפדפן:** פתיחת ניהול תבניות, כיבוי/הדלקה בכל רמה, שמירה, יצירת פרויקט
  חדש מתבנית ערוכה ואימות שהבחירה השתקפה.

## מחוץ להיקף

- עריכת **תוכן** סעיפים (טקסט) — נשאר רק בעורך הפרויקט/זריעה.
- הוספת פרקים/סעיפים שלא קיימים בספרייה.
- גרירה לשינוי סדר בתוך עורך התבניות.
- ייצוא/יבוא תבניות (ייתכן ב-Plan נפרד).
