<div dir="rtl">

# העברת פרסום האתר ל-GitHub Actions — מוכן להפעלה, לא פעיל

**מצב נוכחי:** קובץ הפריסה `.github/workflows/deploy-vercel-production.yml` נוצר כהצעת שינוי בלבד.
לא לבצע מיזוג ולהגדיר `VERCEL_AUTO_DEPLOY=enabled` לפני שהושלמו בדיקות ההרשאות והבטיחות.
הוא **לא מפרסם דבר** כל עוד המשתנה `VERCEL_AUTO_DEPLOY` אינו שווה בדיוק `enabled`.

## המטרה

שלושת חברי הצוות עובדים במאגר `BIU-Racing/document-system`. לאחר בדיקת Pull Request, מיזוג לענף `main` יוכל להפעיל בנייה ופרסום ב-Vercel הקיים של סהר, במקום להעלות ZIP ידנית.

האתר נשאר בכתובת `https://biu-racing-forms.vercel.app`. מסד הנתונים נשאר בפרויקט Supabase הקיים. לא פותחים פרויקט Vercel נוסף ולא מעתיקים נתוני משתמשים.

## למה לא פשוט Settings → Git?

במסלול Hobby של Vercel קיימות מגבלות על חיבור מאגרים בבעלות ארגון ועל העלאת גרסאות מקומיטים של שותפים. GitHub Actions עם Vercel CLI הוא **מסלול אפשרי לבדיקה**, ולא הבטחה שהמגבלה תיעלם: גם במסלול זה Vercel עשוי לחסום פריסה עקב זהות מחבר הקומיט או מדיניות המסלול. אין לזייף מחברי קומיטים או לשתף חשבון.

מקורות:
- https://vercel.com/docs/limits#connecting-a-project-to-a-git-repository
- https://vercel.com/docs/git#using-hobby-teams
- https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel

## תנאים מוקדמים — הגדרות חד-פעמיות

1. **סהר:** מאשר שהפרויקט הקיים הוא `biu-racing-forms` בחשבון שלו, שהפריסה האחרונה תקינה, ושיש דרך לחזור לגרסה הקודמת.
2. **מנהלי GitHub:** תחת `Settings → Branches/Rulesets` מגנים על `main`: עוברים באמצעות Pull Request, דורשים לפחות סקירה אחת ובדיקות CI תקינות, ומגבילים שינויי workflow לפי הצורך.
3. **מנהלי GitHub:** תחת `Settings → Environments` יוצרים סביבה בשם `production`, מגדירים Required reviewers ומגבילים אותה לענף `main`. חשוב לבצע את ההגנה **לפני** הוספת מפתח פריסה.
4. **סהר:** יוצר Vercel Access Token מתאים בממשק של Vercel ומוסיף אותו **ישירות** ל-GitHub Repository → Settings → Secrets and variables → Actions, כסוד סביבת `production` בשם `VERCEL_TOKEN`. אין לשתף או לשלוח את המפתח בצ'אט, בדואר או לקוד.
5. **סהר ומנהלי GitHub:** מגדירים שלושה Repository Variables ב-Actions:
   - `VERCEL_ORG_ID` — מזהה החשבון/Team שבו נמצא הפרויקט הקיים, לא החשבון האישי של שי.
   - `VERCEL_PROJECT_ID` — מזהה *הפרויקט הקיים* `biu-racing-forms`.
   - `VERCEL_CLI_VERSION` — גרסה מדויקת של Vercel CLI שבדקנו, בלי `latest`.
   אפשר לקבל את שני המזהים באמצעות קישור מקומי לפרויקט הנכון (`vercel link`, ואז `.vercel/project.json`) או דרך הגדרות הפרויקט.
6. **רק בסוף:** מוסיפים Repository Variable בשם `VERCEL_AUTO_DEPLOY` עם הערך `enabled`. כל ערך אחר, או היעדר המשתנה, גורם לדילוג על הפריסה.

## בדיקת ההפעלה הראשונה

1. לאחר מיזוג ה-PR והגדרת הסביבה, מפעילים `Actions → Deploy existing Vercel project → Run workflow` על `main`.
2. מוודאים שכל בדיקות הקוד, מיפוי הקטלוג ובניית Next.js עברו.
3. ה-workflow שולף **פרטי Production של אותו פרויקט** דרך `vercel pull`, בונה, יוצר פריסה עם `--skip-domain`, בודק אותה ב-`vercel inspect`, ורק אז מבצע `vercel promote`.
4. בודקים בדפדפן את האתר הציבורי: כניסה, טעינת המערכות, צפייה בנתונים, ייצוא Excel והיסטוריית קבצים — בלי לעדכן נתוני ייצור.
5. רק לאחר בדיקת הצלחה, כל מיזוג נוסף ל-`main` יפעיל את אותה זרימה (בכפוף לאישורי סביבת Production).

**חשוב:** `vercel inspect` מאמת את מצב הפריסה בפלטפורמה אך **אינו** מבחן מקצה לקצה של Supabase, התחברות או ייצוא. לא לסמוך עליו כתחליף לבדיקת משתמש.

## אם מתקבלת שגיאת Hobby או חסר חיבור לפרויקט

- עוצרים; לא משנים את מקור הקומיט, ולא מנסים לעקוף בדיקות הרשאה.
- מוחקים או משנים את המשתנה `VERCEL_AUTO_DEPLOY` כדי לבטל טריגרים נוספים.
- נשארים עם פרסום ידני מבוקר על ידי סהר בזמן שבודקים Cloudflare בסביבת **Staging נפרדת**, או מחליטים על מסלול שירות שתומך בשותפים.

## אבטחה וגבולות

- לא מעלים ל-GitHub קובצי `.env`, קודי צוות או מפתחות Supabase.
- לא מחברים סביבת Preview למסד הנתונים של Production לצורך ניסויים.
- המפתח של Vercel חשוף אך ורק לשלבי הפריסה בסביבת `production`. שינויים ב-`main` חייבים בדיקה ואישור לפני הפעלת workflow שמקבל מפתח.
- ה-workflow לא משנה סכמת Supabase ולא מפעיל migrations.
- אם המשתמשים אמורים לשלוט בפרסום בלי תלות בסהר, נדרש פתרון אירוח שמאפשר בעלות צוותית ולא רק מפתח של חשבון יחיד.

</div>
