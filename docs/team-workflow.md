<div dir="rtl">

# איך רואים, עורכים ומעדכנים את מערכת הטפסים?

[חזרה למדריכים](README.md) · [הקוד בארגון BIU-Racing](https://github.com/BIU-Racing/document-system) · [פתיחת האתר הפעיל](https://biu-racing-forms.vercel.app)

## שלושה דברים נפרדים

1. **האתר הפעיל** — [biu-racing-forms.vercel.app](https://biu-racing-forms.vercel.app). כאן משתמשים בטפסים; צריך קוד צוות ומייל אוניברסיטאי.
2. **GitHub** — כאן שמור *קוד התוכנה*. שינוי קוד לא משנה מיד את האתר הפעיל.
3. **Vercel + Supabase** — Vercel מריץ את האתר; Supabase שומר נתוני משתמשים וקבצים פרטיים. חיבור מאגר לארגון GitHub אינו מעביר בעלות על שירותי הענן.

## עריכה קטנה ישירות מהדפדפן (GitHub)

1. פתחו את [המאגר הארגוני](https://github.com/BIU-Racing/document-system) והיכנסו לחשבון עם הרשאת כתיבה.
2. פתחו קובץ לפי [מדריך העריכה](editing-guide.md). לדוגמה, `app/page.tsx` לעמוד הבית או `components/racing/system-map.tsx` למפת המערכות.
3. לחצו על סמל העיפרון (Edit), ערכו ופתחו **Commit changes**.
4. בחרו **Create a new branch for this commit and start a pull request** (מומלץ). תנו שם ברור כמו `fix/form-header`.
5. תארו מה השתנה, פתחו Pull Request ובדקו בלשונית **Checks** שהבדיקות עברו.
6. חבר צוות נוסף בודק את השינוי; לאחר מכן ממזגים ל־`main`. אפשר לכתוב ישירות ל־main רק כשההרשאות ומדיניות הקבוצה מאפשרות זאת, אך בצוות מומלץ PR.

**הערה:** GitHub מציג קבצים ושומר גרסאות; הוא אינו מציג Preview חי של ממשק Next.js רק בגלל שערכנו בו קוד.

## פיתוח מקומי ב־VS Code או Cursor

להרצת המערכת במחשב צריך Node.js 22 (לפחות 22.13), Git ו־npm. ב־Terminal:

</div>

```sh
git clone https://github.com/BIU-Racing/document-system.git
cd document-system
npm ci
npm run templates:prepare
git checkout -b feature/my-change
npm run dev
```

<div dir="rtl">

פתחו בדפדפן **http://127.0.0.1:3000**. לאחר שינוי בקובץ ושמירתו תראו בדרך כלל עדכון מיידי בדף המקומי. את תיקיית הפרויקט אפשר לפתוח ב־VS Code / Cursor דרך **File → Open Folder**.

**נתונים והרשאות:** בלי קובץ `.env.local` עם חמשת משתני השרת המתועדים ב[מדריך הפרסום](deployment.md), חלקים שמשתמשים בנתונים לא יעבדו. אל תעתיקו מפתחות מהשרת הפעיל לצ'אט או למאגר. השתמשו בסביבת בדיקות נפרדת כדי לא לשנות תשובות אמיתיות. [הוראות התקנה מלאות](getting-started.md).

לפני העלאת הקוד מומלץ להריץ:

</div>

```sh
npm run check
npm run catalog:check
npm run build

git add .
git commit -m "Describe the change"
git push -u origin feature/my-change
```

<div dir="rtl">

לאחר ה־Push, GitHub יציע לפתוח **Compare & pull request**. פתחו PR לענף `main`; הבדיקות האוטומטיות ירוצו גם עליו. אין לבצע `force push` לענף משותף.

## מתי שינוי מופיע באתר הציבורי?

נכון לתיעוד הפרויקט, אתר Vercel הפעיל מחובר לחשבון של בעלי הפרויקט המקורי ו**הפרסום ידני**, לא אוטומטי מהמאגר הארגוני. לכן, גם Merge מוצלח לא מפרסם גרסה לאתר. נדרש מי שמורשה לפרסם בפרויקט Vercel הקיים; ראו [מדריך הפריסה](deployment.md). אין לפתוח פרויקט Vercel חדש על מסד הייצור ללא תיאום.

## דוגמה: רוצים לשנות כותרת

- **כותרת של עמוד הבית:** מתחילים ב־`app/page.tsx`.
- **מבנה מפת המערכות:** `components/racing/system-map.tsx`.
- **ניסוח שאלה בטופס:** `data/systems.normalized.json`; לא משנים מזהה `id` קיים.
- **לוגו:** `public/brand/`.
- **שמירה או ייצוא לאקסל:** מחייב בדיקות ייעודיות; ראו [מדריך העריכה](editing-guide.md).

</div>
