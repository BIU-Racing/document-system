/**
 * Numeric fields added so that 2027 rule checks have something to check (lib/rule-checks.ts).
 * They are optional (not counted as missing), not mapped to any official workbook cell, and
 * appear in their own chapter at the end of each system. Client-safe.
 */
export type RuleField = { systemId: string; id: string; label: string; unit: string; prompt: string; rule: string };

export const RULE_FIELDS_SECTION = 'נתונים לבדיקת תקנון 2027';

export const ruleFields: RuleField[] = [
  { systemId: 'ACCUMULATOR', id: 'RC-ACC-MAX-TS-VOLTAGE', label: 'מתח מרבי של מערכת ההנעה', unit: 'V', rule: 'EV 4.1.1', prompt: 'המתח המרבי בפועל: מספר התאים בטור × המתח המרבי של תא. משמש גם לבדיקות ה־IMD, ה־BSPD ודירוג הרכיבים.' },
  { systemId: 'ACCUMULATOR', id: 'RC-ACC-MAX-CURRENT', label: 'זרם מרבי ביציאה ממארז הסוללה', unit: 'A', rule: 'EV 2.2.2', prompt: 'הזרם המרבי שמערכת ההנעה יכולה למשוך מהסוללה (מגבלת הבקר או הנתיך הראשי, הנמוך מביניהם).' },
  { systemId: 'DRIVE', id: 'RC-DRIVE-POWER-LIMIT', label: 'מגבלת ההספק ביציאה מהסוללה', unit: 'kW', rule: 'EV 2.2.1', prompt: 'ההספק המרבי שמוגדר בבקר או במד האנרגיה, ביציאה ממארז הסוללה.' },
  { systemId: 'DISCHARGE', id: 'RC-DISCHARGE-TIME', label: 'זמן הירידה מתחת ל־60 V אחרי פתיחת מעגל הניתוק', unit: 's', rule: 'EV 6.1.5', prompt: 'זמן מחושב או נמדד, מהמתח המרבי ועד מתחת ל־60 V DC. ציינו בהערות אם זה חישוב או מדידה.' },
  { systemId: 'TSAL', id: 'RC-TSAL-FREQUENCY', label: 'תדירות ההבהוב של האור האדום', unit: 'Hz', rule: 'EV 4.10.2', prompt: 'תדירות ההבהוב בפועל של האור האדום ב־TSAL.' },
  { systemId: 'SDC', id: 'RC-SDC-BUTTON-SIDE', label: 'קוטר לחצני הכיבוי בצידי הרכב', unit: 'mm', rule: 'T 11.4.3', prompt: 'הקוטר של לחצני הכיבוי שמותקנים בשני צידי הרכב, מאחורי הנהג.' },
  { systemId: 'SDC', id: 'RC-SDC-BUTTON-COCKPIT', label: 'קוטר לחצן הכיבוי בתא הנהג', unit: 'mm', rule: 'T 11.4.4', prompt: 'הקוטר של לחצן הכיבוי שליד ההגה.' },
  { systemId: 'RTD', id: 'RC-RTD-SOUND', label: 'משך צליל הכניסה ל־R2D', unit: 's', rule: 'EV 4.12.1', prompt: 'כמה זמן נשמע הצליל ברציפות בכניסה למצב Ready-to-Drive.' },
  { systemId: 'LV_BATTERY', id: 'RC-LV-MAX-VOLTAGE', label: 'מתח מרבי של מערכת המתח הנמוך', unit: 'V', rule: 'T 11.1.2', prompt: 'המתח המרבי בפועל (סוללה טעונה במלואה), לא המתח הנומינלי.' },
  // Electrical rules with a clear number (rule coverage map, 27.11.2026).
  { systemId: 'BSPD', id: 'RC-BSPD-DELAY', label: 'זמן עד פתיחת מעגל הניתוק ב־BSPD', unit: 'ms', rule: 'T 11.6.2', prompt: 'כמה זמן חוסר ההתאמה (בלימה חזקה יחד עם הספק) צריך להימשך עד שה־BSPD פותח את מעגל הניתוק. ערך התכן או ערך שנמדד בבדיקה.' },
  { systemId: 'BSPD', id: 'RC-BSPD-PRESSURE', label: 'סף לחץ הבלימה שמזהה בלימה חזקה', unit: 'bar', rule: 'T 11.6.5', prompt: 'הלחץ במערכת הבלימה שמעליו ה־BSPD מחשיב את הבלימה כחזקה. ציינו בהערות באיזה מעגל בלימה נמדד.' },
  { systemId: 'DRIVE', id: 'RC-DRIVE-APPS-DELAY', label: 'זמן עד ניתוק ההספק כשחיישני דוושת התאוצה לא מתאימים', unit: 'ms', rule: 'T 11.8.8', prompt: 'כמה זמן חוסר ההתאמה בין שני חיישני ה־APPS נמשך עד שההספק למנועים מנותק לגמרי.' },
  { systemId: 'DRIVE', id: 'RC-DRIVE-RELEASED-TORQUE', label: 'מומנט בגלגלים כשדוושת התאוצה משוחררת', unit: 'Nm', rule: 'T 11.8.12', prompt: 'המומנט שהבקר מבקש כשהדוושה משוחררת לגמרי במצב נהיגה ידני. 0 או ערך שלילי (בלימה רגנרטיבית).' },
  { systemId: 'INTEGRATION', id: 'RC-INT-SCS-DELAY', label: 'השהיה מרבית שנקבעה להודעות של אותות קריטיים', unit: 'ms', rule: 'T 11.9.4', prompt: 'ההשהיה הארוכה ביותר שהמערכת מקבלת בהודעה של אות קריטי (למשל ב־CAN) לפני שהיא מזהה תקלה.' },
  { systemId: 'INTEGRATION', id: 'RC-INT-INDICATOR-TEST', label: 'משך הדלקת נוריות האזהרה אחרי הפעלת ה־LVMS', unit: 's', rule: 'T 11.9.6', prompt: 'כמה זמן נוריות האזהרה (למשל AMS ו־IMD) נדלקות לבדיקה אחרי הפעלת המתח הנמוך.' },
  { systemId: 'INTEGRATION', id: 'RC-INT-FAN-POWER', label: 'הספק כולל של המאווררים והמפוחים ברכב', unit: 'W', rule: 'T 11.11.1', prompt: 'סכום ההספקים הנקובים של כל ההתקנים שמזיזים אוויר, כולל מאווררי קירור.' },
  { systemId: 'INTEGRATION', id: 'RC-INT-ENCLOSURE-LAYER', label: 'עובי השכבה המוליכה המוארקת במארזי מערכת ההנעה', unit: 'mm', rule: 'EV 3.1.1', prompt: 'אם המארז עשוי משכבה מוליכה מוארקת (אלומיניום או טוב יותר): העובי הדק ביותר שלה. אם המארז מבודד, השאירו ריק והסבירו בהערות.' },
  { systemId: 'INTEGRATION', id: 'RC-INT-GROUND-RESISTANCE', label: 'התנגדות ההארקה הגבוהה ביותר שנמדדה', unit: 'mΩ', rule: 'EV 3.1.3', prompt: 'ההתנגדות הגבוהה ביותר בין חלק מוליך שאמור להיות מוארק לבין אדמת המתח הנמוך, במדידה בזרם של 1 A.' },
  { systemId: 'INTEGRATION', id: 'RC-INT-NEAR-TS-RESISTANCE', label: 'התנגדות להארקה של חלקים מוליכים ליד מערכת ההנעה', unit: 'Ω', rule: 'EV 3.1.4', prompt: 'ההתנגדות הגבוהה ביותר לאדמת המתח הנמוך, של חלק שעלול להיות מוליך ונמצא עד 100 mm מרכיב של מערכת ההנעה.' },
  { systemId: 'INTEGRATION', id: 'RC-INT-FUSE-TEMP-MIN', label: 'טמפרטורת העבודה הנמוכה של הגנות זרם היתר', unit: '°C', rule: 'EV 3.2.6', prompt: 'הקצה הנמוך של טווח הטמפרטורות שהנתיכים והמפסקים מתוכננים לו, לפי דף הנתונים.' },
  { systemId: 'INTEGRATION', id: 'RC-INT-FUSE-TEMP-MAX', label: 'טמפרטורת העבודה הגבוהה של הגנות זרם היתר', unit: '°C', rule: 'EV 3.2.6', prompt: 'הקצה הגבוה של טווח הטמפרטורות שהנתיכים והמפסקים מתוכננים לו, לפי דף הנתונים.' },
  { systemId: 'INTEGRATION', id: 'RC-INT-TS-LV-SPACING', label: 'מרווח בין מתח גבוה למתח נמוך בתוך מארז משותף', unit: 'mm', rule: 'EV 4.3.4', prompt: 'המרווח הקטן ביותר באוויר או על פני משטח, במקום שבו אין מחיצה מבודדת. אם יש מחיצה, ציינו זאת בהערות.' },
  { systemId: 'INTEGRATION', id: 'RC-INT-PCB-GROOVE', label: 'רוחב החריצים בלוח שיש בו גם מתח גבוה וגם מתח נמוך', unit: 'mm', rule: 'EV 4.3.6', prompt: 'אם יש חריצים בלוח כדי להאריך את מרחק הזחילה: הרוחב הקטן ביותר שלהם. אם אין לוח כזה, השאירו ריק.' },
  { systemId: 'INTEGRATION', id: 'RC-INT-TSMP-RATING', label: 'דירוג המתח של שקעי נקודות המדידה (TSMP)', unit: 'V', rule: 'EV 4.7.3', prompt: 'דירוג המתח של שקעי הבננה המוגנים בקוטר 4 mm, לפי דף הנתונים (CAT III ומעלה).' },
  { systemId: 'INTEGRATION', id: 'RC-INT-TSMP-RESISTOR', label: 'ערך הנגד שמגביל את הזרם בכל נקודת מדידה (TSMP)', unit: 'kΩ', rule: 'EV 4.7.6', prompt: 'ערך הנגד שמחובר בטור לכל TSMP. הבדיקה משווה אותו לערך שהתקנון קובע לפי המתח המרבי של מערכת ההנעה.' },
  { systemId: 'HV_CONNECTORS', id: 'RC-HVC-MOUNT-FORCE', label: 'הכוח שעיגון החיווט מחוץ למארזים עומד בו', unit: 'N', rule: 'EV 4.5.8', prompt: 'הכוח שהעיגון של חיווט מערכת ההנעה מחוץ למארזים עומד בו בלי להשתחרר. ציינו בהערות אם זה חישוב או בדיקה.' },
  { systemId: 'HVD', id: 'RC-HVD-HEIGHT', label: 'גובה ה־HVD מעל הקרקע', unit: 'mm', rule: 'EV 4.8.1', prompt: 'הגובה של ה־HVD מעל הקרקע, כשהרכב במצב מוכן למרוץ.' },
  { systemId: 'HVD', id: 'RC-HVD-REMOVAL-TIME', label: 'זמן הוצאת ה־HVD', unit: 's', rule: 'EV 4.8.2', prompt: 'כמה זמן לוקח לאדם מיומן להוציא את ה־HVD כשהרכב במצב מוכן למרוץ.' },
  { systemId: 'TSAL', id: 'RC-TSAL-BELOW-HOOP', label: 'מרחק ה־TSAL מתחת לנקודה הגבוהה של הקשת הראשית', unit: 'mm', rule: 'EV 4.10.7', prompt: 'כמה נמוך ה־TSAL, כולל העיגון, מהנקודה הגבוהה ביותר של הקשת הראשית.' },
  { systemId: 'RTD', id: 'RC-RTD-SOUND-LEVEL', label: 'עוצמת צליל ה־R2D', unit: 'dB', rule: 'EV 4.12.2', prompt: 'עוצמת הצליל שנמדדה ב־dB(A), בשקלול מהיר, ברדיוס של 2 m מהרכב.' },
  { systemId: 'BMS', id: 'RC-BMS-SENSOR-GAP', label: 'עובי החומר הלא מתכתי בין חיישן הטמפרטורה לנקודת המדידה', unit: 'mm', rule: 'EV 5.8.6', prompt: 'העובי של ציפוי, דבק או כל חומר לא מתכתי בין חיישן הטמפרטורה של התא לבין הנקודה שהוא מודד.' },
  { systemId: 'BMS', id: 'RC-BMS-TRIP-VI', label: 'זמן עד פתיחת מעגל הניתוק בחריגת מתח או זרם', unit: 'ms', rule: 'EV 5.8.10', prompt: 'כמה זמן חריגה במתח או בזרם נמשכת עד שה־AMS פותח את מעגל הניתוק, כולל דיוק, רעש וקצב הדגימה.' },
  { systemId: 'BMS', id: 'RC-BMS-TRIP-TEMP', label: 'זמן עד פתיחת מעגל הניתוק בחריגת טמפרטורה', unit: 's', rule: 'EV 5.8.10', prompt: 'כמה זמן חריגה בטמפרטורה נמשכת עד שה־AMS פותח את מעגל הניתוק, כולל דיוק, רעש וקצב הדגימה.' },
  { systemId: 'TSMS', id: 'RC-TSMS-CIRCLE', label: 'קוטר העיגול הכתום סביב ה־TSMS', unit: 'mm', rule: 'EV 6.2.3', prompt: 'הקוטר של האזור הכתום המלא שבמרכזו מותקן ה־TSMS.' },
  { systemId: 'TSMS', id: 'RC-TSMS-HANDLE', label: 'רוחב הידית של ה־TSMS', unit: 'mm', rule: 'T 11.2.1', prompt: 'הרוחב של הידית האדומה הנשלפת של ה־TSMS.' },
  { systemId: 'LVMS', id: 'RC-LVMS-CIRCLE', label: 'קוטר העיגול האדום סביב ה־LVMS', unit: 'mm', rule: 'T 11.3.2', prompt: 'הקוטר של האזור האדום המלא שבמרכזו מותקן ה־LVMS.' },
  { systemId: 'LVMS', id: 'RC-LVMS-HANDLE', label: 'רוחב הידית של ה־LVMS', unit: 'mm', rule: 'T 11.2.1', prompt: 'הרוחב של הידית האדומה הנשלפת של ה־LVMS.' },
  { systemId: 'LV_BATTERY', id: 'RC-LVB-SHORT-DISTANCE', label: 'מרחק הגנת הקצר מההדקים הלא מוארקים של הסוללה', unit: 'mm', rule: 'T 11.7.6', prompt: 'המרחק בין ההדק הלא מוארק של סוללת המתח הנמוך לבין הנתיך או ההגנה מקצר.' },
  { systemId: 'SDC', id: 'RC-SDC-INERTIA-G', label: 'תאוצת ההפעלה של מתג האינרציה', unit: 'g', rule: 'T 11.5.2', prompt: 'התאוטה שבה מתג האינרציה מופעל, לפי דף הנתונים של הדגם.' },
  { systemId: 'DASHBOARD', id: 'RC-DASH-LIGHT-AREA', label: 'השטח המואר של נורית מצב מערכת', unit: 'cm²', rule: 'T 11.10.1', prompt: 'השטח המואר הקטן ביותר מבין נוריות מצב המערכת (כמו נורית הבלימה), בתאורה אחידה.' },
  { systemId: 'CHARGER', id: 'RC-CHG-ESTOP', label: 'קוטר לחצן החירום של המטען', unit: 'mm', rule: 'EV 7.1.5', prompt: 'הקוטר של לחצן החירום מסוג לחיצה במטען.' },
];
