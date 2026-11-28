/**
 * Short titles for the targeted 2027 questions in "התקנון שלנו" (28.11.2026). The source data gave
 * every question of a topic the same label (e.g. ten times "AMS / BMS של סוללת ההנעה"), so a team
 * could not tell the questions apart. The question text itself (prompt) is unchanged.
 * Client-safe: plain data.
 */
export const ruleQuestionTitles: Record<string, string> = {
  // Shutdown circuit
  'EP-SDC-Q01': 'סכמת מעגל הניתוק המלאה',
  'EP-SDC-Q02': 'סדר הרכיבים בשרשרת',
  'EP-SDC-Q03': 'זרם הממסרים, מגעים והגנות',
  'EP-SDC-Q04': 'מה קורה בניתוק כל רכיב',
  'EP-SDC-Q05': 'נעילה ואיפוס אחרי תקלת AMS או IMD',
  'EP-SDC-Q06': 'בדיקת כל נקודת ניתוק',
  // Low voltage system
  'EP-LVS-Q01': 'מקור ההזנה ומתחי העבודה',
  'EP-LVS-Q02': 'ענפי ההזנה: צרכנים, זרמים והגנות',
  'EP-LVS-Q03': 'מה ה־LVMS מנתק ומה נשאר פעיל',
  'EP-LVS-Q04': 'סוללת המתח הנמוך: דגם, קיבוע והגנות',
  'EP-LVS-Q05': 'אדמות, החזרות זרם והפרדה מ־TS',
  // Indicators, dashboard, brake light, R2D
  'EP-INDICATORS-Q01': 'נוריות החובה: צבע, אות ותנאי הדלקה',
  'EP-INDICATORS-Q02': 'נעילת נוריות AMS ו־IMD ובדיקתן',
  'EP-INDICATORS-Q03': 'צליל R2D: משך ועוצמה',
  'EP-INDICATORS-Q04': 'אור הבלם: תגובה, נראות ומיקום',
  'EP-INDICATORS-Q05': 'מתחים, זרמים ופינים של הכניסות והיציאות',
  // BSPD
  'EP-BSPD-Q01': 'חיישני לחץ הבלם וזרם ה־DC',
  'EP-BSPD-Q02': 'סף הבלימה החזקה',
  'EP-BSPD-Q03': 'סף הזרם (שקול ל־5 kW)',
  'EP-BSPD-Q04': 'תגובה אחרי 500 ms ודרך האיפוס',
  'EP-BSPD-Q05': 'הזנה ישירה ועצמאות הכרטיס',
  'EP-BSPD-Q06': 'ניתוק אותות לבדיקה הטכנית',
  // AMS / BMS
  'EP-AMS-Q01': 'מה מנוטר, ומתי',
  'EP-AMS-Q02': 'מפת חיישני הטמפרטורה',
  'EP-AMS-Q03': 'גבולות מתח, זרם וטמפרטורה',
  'EP-AMS-Q04': 'פתיחת SDC בחריגה ובכשל מדידה',
  'EP-AMS-Q05': 'נעילה, איפוס ונורית AMS',
  'EP-AMS-Q06': 'הדגמת תקלות בבדיקה',
  'EP-AMS-Q07': 'חוטי חישת מתחי התאים',
  // IMD
  'EP-IMD-Q01': 'דגם ה־IMD',
  'EP-IMD-Q02': 'ערך התגובה (500 Ω/V)',
  'EP-IMD-Q03': 'חיבורי מדידה ומוליכי אדמה',
  'EP-IMD-Q04': 'פתיחת SDC, נעילה ואיפוס',
  'EP-IMD-Q05': 'נורית IMD ותוכנית הבדיקה',
  // AIRs, precharge, discharge
  'EP-RELAYS-Q01': 'דגמי ה־AIRs ודירוגיהם',
  'EP-RELAYS-Q02': 'רצף הטעינה המוקדמת וסף 95%',
  'EP-RELAYS-Q03': 'קיבול, נגד, זרם וזמן הטעינה המוקדמת',
  'EP-RELAYS-Q04': 'פריקת הקבלים ותזמון הירידה',
  'EP-RELAYS-Q05': 'אין נתיך במסלול הפריקה',
  'EP-RELAYS-Q06': 'המידע שעובר ל־TSAL',
  'EP-RELAYS-Q07': 'נגדי הטעינה המוקדמת והפריקה',
  // Wiring and connectors
  'EP-WIRING-Q01': 'טבלת מסלולי הספק ואותות קריטיים',
  'EP-WIRING-Q02': 'הפרדה בין LVS ל־TS',
  'EP-WIRING-Q03': 'מחברים עם interlock',
  'EP-WIRING-Q04': 'מפת הארקות ומדידות',
  'EP-WIRING-Q05': 'HVD, TSMP, GND ו־data logger',
  'EP-WIRING-Q06': 'הגנת החיבורים מהתרופפות, מים וחום',
  'EP-WIRING-Q07': 'נגדי ה־TSMP',
  // Accumulator
  'EP-ACCUMULATOR-Q01': 'התאים: דגם, תצורה, מתח ואנרגיה',
  'EP-ACCUMULATOR-Q02': 'segments ו־sections: מגבלות 120 V, 6 MJ, 12 kg',
  'EP-ACCUMULATOR-Q03': 'הוצאת ה־segments מהמארז',
  'EP-ACCUMULATOR-Q04': 'נתיך, AIRs, maintenance plugs ו־busbars',
  'EP-ACCUMULATOR-Q05': 'חיווי המתח העצמאי על המארז',
  'EP-ACCUMULATOR-Q06': 'בידוד, הארקה, קירור ושחרור לחץ',
  'EP-ACCUMULATOR-Q07': 'קישור לראיות המכניות ב־ASES',
  // Drive
  'EP-DRIVE-Q01': 'מנועים, ממירים וקבלי DC-link',
  'EP-DRIVE-Q02': 'מגבלות 80 kW ו־500 A',
  'EP-DRIVE-Q03': 'דרישת מומנט, R2D ותגובה לתקלות',
  'EP-DRIVE-Q04': 'בלימה חשמלית ואור הבלם',
  'EP-DRIVE-Q05': 'data logger, TSMP וחיישני TSAL',
  'EP-DRIVE-Q06': 'בידוד, קירור ומארזים',
  'EP-DRIVE-Q07': 'בדיקות לאורך מסלול דרישת המומנט',
  // Pedals
  'EP-PEDALS-Q01': 'חיישני ה־APPS',
  'EP-PEDALS-Q02': 'חוסר התאמה בין החיישנים',
  'EP-PEDALS-Q03': 'קפיצי החזרה ומעצור',
  'EP-PEDALS-Q04': 'חיישני הבלם ומי משתמש בהם',
  'EP-PEDALS-Q05': 'תגובה לנתק, קצר ואובדן תקשורת',
};
