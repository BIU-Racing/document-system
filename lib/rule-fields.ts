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
];
