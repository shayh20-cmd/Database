# סריקת מייל ל-Project Hub (פיילוט)

סקריפט שרץ במחשב שלך בשעות הסריקה, קורא דרך **Outlook הקלאסי** את המיילים החדשים
בתיבת הדואר הנכנס ושולח אותם ל-Project Hub. שם Claude מציע משימות, וההצעות מופיעות בראש
**המשימות שלי**. שום דבר לא נכנס לפרויקט בלי לחיצה שלך.

## התקנה (פעם אחת, בלי הרשאות מנהל)

1. Outlook הקלאסי במחשב מחובר לחשבון המשרד (File ← Add Account), ופתוח לפחות פעם אחת.
2. ב-Project Hub: הגדרות ← **תוסף Outlook וסריקת מייל** ← סריקת מייל ← **הפק מפתח**, והעתק אותו.
3. באותו מסך: **⬇ התקנת סריקת המייל** (`ProjectHub-MailScan-Setup.cmd`), ולחיצה כפולה על הקובץ שירד (אם Windows
   מזהיר: More info ← Run anyway). חלון קטן מבקש את המפתח, וההתקנה בודקת אותו מול השרת לפני שהיא שומרת אותו. בסוף
   רצה בדיקה שמציגה אילו מיילים היו נשלחים, בלי לשלוח.

   הקובץ נבנה בשרת בכל הורדה (`tools/local-server/installers.js`, למחוברים בלבד): הוא נושא את `Scan-Mail.ps1`,
   `run-hidden.vbs` ו-`Install-MailScan.ps1` כ-base64 ואת כתובת ה-Project Hub שממנה הורד, ומריץ
   `Install-MailScan.ps1 -Local -Gui`. ‏`-Local` מעתיק את הסורק ל-`%LOCALAPPDATA%\ProjectHub\mail-scan`, והמשימה
   המתוזמנת, הקיצור "סרוק מייל עכשיו" והקישור `projecthub-scan:` מצביעים לשם. המפתח אף פעם לא בקובץ.

   **מהמאגר** (למנהלי המערכת), מתיקיית Project Hub — הסורק רץ מתיקיית המאגר, כמו קודם:

       powershell -ExecutionPolicy Bypass -File tools\mail-scan\Install-MailScan.ps1

   הדבק את המפתח כשהוא מתבקש.

## מתי סורקים

שעות הסריקה נקבעות ב-Project Hub: הגדרות ← **סריקת מייל** (ברירת מחדל: א'–ה' ב-8:00, 12:00 ו-16:00,
לפי השעון של המחשב). כשהשעות משתנות אין צורך להתקין מחדש: המחשב בודק כל 15 דקות אם עברה שעת סריקה
שעוד לא נסרקה, ורק אז פותח את Outlook. אם המחשב היה כבוי בשעת הסריקה, היא רצה בבדיקה הבאה.

סריקה ידנית (מיד, בלי קשר לשעות): הכפתור **סרוק עכשיו** ב-Project Hub, או תפריט התחל ← Project Hub ←
**סרוק מייל עכשיו**. בסוף מופיעה התראה: ההצעות החדשות, או "אין הצעות חדשות". (התקנה חוזרת של הגישה
המהירה מוחקת את קיצורי התפריט, כולל זה — אז מריצים שוב גם את `Install-MailScan.ps1`.)

כשיש הצעות חדשות מופיעה התראת Windows עם הכותרות שלהן. **פתח** פותח חלון קטן עם ההצעות
(הוסף / ערוך / דחה), בלי לפתוח את כל Project Hub.

## מה נשלח

נושא, שולח, נמענים, תאריך, עד 6,000 תווים מהגוף ושמות הקבצים המצורפים (לא הקבצים).
מדלגים על תשובות אוטומטיות, ניוזלטרים (List-Unsubscribe) ומיילים ששלחת בעצמך. עד 50 מיילים בריצה.

## כשמשהו לא עובד

| מה רואים | מה לעשות |
|---|---|
| התראה "Outlook במחשב לא מוגדר" | לפתוח את Outlook הקלאסי ולהתחבר לחשבון המשרד |
| התראה "המפתח בוטל או שגוי" | להפיק מפתח חדש ולהריץ שוב את ההתקנה |
| התראה "השרת לא זמין כבר שלוש ריצות" | לבדוק ש-Project Hub נפתח; המיילים יישלחו בריצה הבאה |
| שום דבר לא קורה | הלוג: `%LOCALAPPDATA%\ProjectHub\mail-scan.log`; בדיקה: `Scan-Mail.ps1 -DryRun` |

הסרה: **קובץ הסרה** בהגדרות ← תוסף Outlook וסריקת מייל (`ProjectHub-MailScan-Uninstall.cmd`), או
`powershell -ExecutionPolicy Bypass -File tools\mail-scan\Uninstall-MailScan.ps1`. שתיהן מסירות את המשימה, הקיצור,
הקישורים, המפתח במחשב ואת `%LOCALAPPDATA%\ProjectHub\mail-scan`; המפתח בשרת נשאר עד שמבטלים אותו בהגדרות.

## Threads linked to a task (Outlook add-in)

Each message also carries `conversationId` (Outlook's `ConversationID`), `inReplyTo` and `references`. A message of a
thread linked to a task in the Outlook add-in is logged on that task by the server and goes no further. Suggestions
from other new mail are off unless the person turns them on (Settings → תוסף Outlook וסריקת מייל).
