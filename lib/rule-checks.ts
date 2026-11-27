/**
 * Formula Student Rules 2027 (v1.0) checks on entered values.
 *
 * Each check names the rule, the page in FS_Rules_2027_v1.0.pdf, a short Hebrew summary in our
 * own words (the rulebook text itself is not copied), the field where the result is shown, and a
 * function that evaluates the current answers. Results are warnings only: they never block
 * saving or export.
 *
 * Status: ok (complies), violation (breaks the rule, shown in red), notice (depends on something
 * the app cannot know, shown in amber), pending (no usable number yet; the rule is still shown).
 *
 * Pure and client-safe. Electrical checks (EV, T 11) are here; chassis and structure (SES, ASES
 * protection and cell mounting) are in lib/rule-checks-structural.ts. See docs/rule-checks.md.
 */
import { isolateLtr } from './bidi';
import { type Check, type Getter, type Meta, type RuleAnswers, type RuleRef, type RuleResult, ref, numberFrom, fmt, pending, ok, bad, notice, maxCheck, minCheck, rangeCheck } from './rule-check-kit';
import { structuralChecks } from './rule-checks-structural';

export { numberFrom } from './rule-check-kit';
export type { RuleStatus, RuleRef, RuleResult, RuleAnswers, RuleRow } from './rule-check-kit';
export const RULEBOOK = { title: 'Formula Student Rules 2027', version: '1.0', file: 'FS_Rules_2027_v1.0.pdf' } as const;

// New numeric fields added for these checks (lib/rule-fields.ts).
export const MAX_TS_VOLTAGE: RuleRef = { systemId: 'ACCUMULATOR', fieldId: 'RC-ACC-MAX-TS-VOLTAGE' };
const C = (fieldId: string) => ref('COORDINATOR', fieldId);

const needsMaxVoltage = 'כדי לבדוק, מלאו את "מתח מרבי של מערכת ההנעה" במערכת הסוללה.';
const material = (value: string | undefined) => value === 'Steel' ? 'steel' : value === 'Aluminium' ? 'aluminium' : value ? 'other' : undefined;

const checks: Check[] = [
  { id: 'RC-01', rule: 'EV 4.1.1', page: 71, summary: 'המתח המרבי בין כל שתי נקודות במערכת ההנעה הוא 600 V DC.', target: MAX_TS_VOLTAGE,
    evaluate: get => maxCheck(get.num(MAX_TS_VOLTAGE), 600, 'V', 'EV 4.1.1') },
  { id: 'RC-03', rule: 'EV 6.3.3', page: 83, summary: 'סף התגובה של ה־IMD חייב להיות לפחות 500 Ω/V ביחס למתח המרבי של מערכת ההנעה.', target: ref('IMD', 'LC-ESF-S07-D5'), inputs: [MAX_TS_VOLTAGE],
    evaluate: get => {
      const kOhm = get.num(ref('IMD', 'LC-ESF-S07-D5')), volts = get.num(MAX_TS_VOLTAGE);
      if (kOhm === undefined) return pending('הזינו את הסף ב־kΩ כדי לבדוק.');
      if (volts === undefined) return pending(needsMaxVoltage);
      const required = 500 * volts / 1000, perVolt = kOhm * 1000 / volts;
      return perVolt >= 500 ? ok(`עומד ב־EV 6.3.3: ${fmt(kOhm)} kΩ הם ${fmt(perVolt)} Ω/V במתח ${fmt(volts)} V (נדרש לפחות ${fmt(required)} kΩ).`) : bad(`חורג מ־EV 6.3.3: למתח של ${fmt(volts)} V נדרש לפחות ${fmt(required)} kΩ, הוזן ${fmt(kOhm)} kΩ (${fmt(perVolt)} Ω/V).`);
    } },
  { id: 'RC-04', rule: 'T 11.6.6', page: 49, summary: 'סף ה־BSPD חייב להתאים להספק של 5 kW לכל היותר, במתח המרבי של מערכת ההנעה.', target: ref('BSPD', 'LC-ESF-S07-K6'), inputs: [MAX_TS_VOLTAGE],
    evaluate: get => {
      const amps = get.num(ref('BSPD', 'LC-ESF-S07-K6')), volts = get.num(MAX_TS_VOLTAGE);
      if (amps === undefined) return pending('הזינו את זרם ההפעלה ב־A כדי לבדוק.');
      if (volts === undefined) return pending(needsMaxVoltage);
      const kw = amps * volts / 1000, maxAmps = 5000 / volts;
      return kw <= 5 ? ok(`עומד ב־T 11.6.6: ${fmt(amps)} A × ${fmt(volts)} V = ${fmt(kw)} kW (מותר עד 5 kW).`) : bad(`חורג מ־T 11.6.6: ${fmt(amps)} A במתח ${fmt(volts)} V הם ${fmt(kw)} kW. מותר עד 5 kW, כלומר עד ${fmt(maxAmps)} A.`);
    } },
  { id: 'RC-05', rule: 'EV 5.7.1', page: 80, summary: 'לפני סגירת ה־AIR השני, הטעינה המוקדמת חייבת להגיע ל־95% לפחות ממתח הסוללה (ב־2026 היה 90%).', target: C('LC-ESF-S05-D14'), inputs: [C('LC-ESF-S05-D11')],
    evaluate: get => {
      const mode = get.text(C('LC-ESF-S05-D11'));
      // Not relevant for the chosen end condition: no warning, only a neutral note.
      if (mode && mode !== 'Ratio') return pending(`לא נבדק: שיטת הסיום שנבחרה היא ${mode}, והבדיקה נעשית בשדה המתאים לה.`);
      const value = get.num(C('LC-ESF-S05-D14'));
      const result = minCheck(value, 95, '%', 'EV 5.7.1');
      return result.status === 'violation' && value !== undefined && value >= 90 ? bad(`${result.message} שימו לב: תבנית ה־ESF בודקת 90% (כלל ישן), ולכן היא עלולה להציג OK.`) : result;
    } },
  { id: 'RC-06', rule: 'EV 5.7.1', page: 80, summary: 'הטעינה המוקדמת חייבת להגיע ל־95% לפחות, כלומר הפרש המתחים בסיום הוא לכל היותר 5% מהמתח.', target: C('LC-ESF-S05-D13'), inputs: [C('LC-ESF-S05-D11'), MAX_TS_VOLTAGE],
    evaluate: get => {
      const mode = get.text(C('LC-ESF-S05-D11'));
      if (mode && mode !== 'Delta Voltage') return pending(`לא נבדק: שיטת הסיום שנבחרה היא ${mode}, והשדה הזה רלוונטי רק לשיטת Delta Voltage.`);
      const delta = get.num(C('LC-ESF-S05-D13')), volts = get.num(MAX_TS_VOLTAGE);
      if (delta === undefined) return pending();
      if (volts === undefined) return pending(needsMaxVoltage);
      return maxCheck(delta, volts * 0.05, 'V', 'EV 5.7.1');
    } },
  ...([['E', 12, 'kg', 'מסה'], ['G', 120, 'V', 'מתח'], ['I', 6, 'MJ', 'אנרגיה']] as const).map(([column, limit, unit, name], index): Check => ({
    id: `RC-0${7 + index}`, rule: 'EV 5.3.4', page: 78, summary: 'כל section (חלוקה מכנית של הסוללה לפי דפנות המארז) מוגבל ל־120 V DC, 6 MJ ו־12 kg.',
    target: ref('ACCUMULATOR', 'CARD-FG-ASES-S20-OPEN-01'),
    evaluate: get => get.rows(ref('ACCUMULATOR', 'CARD-FG-ASES-S20-OPEN-01')).map((row, rowIndex) => {
      const result = maxCheck(numberFrom(row[`LC-FG-ASES-S20-OPEN-01-SECTION-${column}`]), limit, unit, 'EV 5.3.4');
      return { ...result, message: `שורה ${rowIndex + 1}, ${name}: ${result.message}`, rowId: row._id, ...('table' in result ? { table: result.table.map(line => ({ ...line, label: `שורה ${rowIndex + 1} · ${name}` })) } : {}) };
    }),
  })),
  { id: 'RC-10', rule: 'EV 5.3.4', page: 78, summary: 'מתח ואנרגיה למקטע, מחושבים מנתוני התאים: עד 120 V DC ועד 6 MJ (אנרגיית תא = מתח מרבי × קיבולת).', target: C('LC-ESF-Accumulator-segments-C'),
    inputs: [C('LC-ESF-Accumulator-segments-B'), C('LC-ESF-S02-D6'), C('LC-ESF-S02-D5')],
    evaluate: get => {
      const series = get.num(C('LC-ESF-Accumulator-segments-C')), parallel = get.num(C('LC-ESF-Accumulator-segments-B'));
      const cellVolts = get.num(C('LC-ESF-S02-D6')), ah = get.num(C('LC-ESF-S02-D5'));
      if (series === undefined || cellVolts === undefined) return pending('נדרשים מספר התאים בטור והמתח המרבי של תא.');
      const volts = series * cellVolts, mj = parallel !== undefined && ah !== undefined ? series * parallel * cellVolts * ah * 3600 / 1e6 : undefined;
      const over = [volts > 120 ? `מתח ${fmt(volts)} V (מעל 120 V)` : '', mj !== undefined && mj > 6 ? `אנרגיה ${fmt(mj)} MJ (מעל 6 MJ)` : ''].filter(Boolean);
      if (over.length) return bad(`חורג מ־EV 5.3.4 לפי נתוני התאים: ${over.join(', ')}. הגבול חל על section מכני; אם המקטע אינו חלוקה מכנית, בדקו מול טבלת ה־sections ב־ASES.`);
      return ok(`עומד ב־EV 5.3.4: מקטע של ${fmt(volts)} V${mj !== undefined ? ` ו־${fmt(mj)} MJ` : ''}.`);
    } },
  { id: 'RC-11', rule: 'EV 5.8.3', page: 80, summary: 'בתאי ליתיום, ה־AMS חייב למדוד טמפרטורה של לפחות 30% מהתאים, בפיזור אחיד.', target: C('LC-ESF-Accumulator-segments-D'),
    inputs: [C('LC-ESF-Accumulator-segments-B'), C('LC-ESF-Accumulator-segments-C')],
    evaluate: get => {
      const sensors = get.num(C('LC-ESF-Accumulator-segments-D')), cells = (get.num(C('LC-ESF-Accumulator-segments-B')) ?? NaN) * (get.num(C('LC-ESF-Accumulator-segments-C')) ?? NaN);
      if (sensors === undefined || !Number.isFinite(cells) || cells <= 0) return pending('נדרשים מספר החיישנים ומספר התאים בטור ובמקביל.');
      const share = sensors / cells * 100, needed = Math.ceil(cells * 0.3);
      return share >= 30 ? ok(`עומד ב־EV 5.8.3: ${fmt(sensors)} חיישנים ל־${fmt(cells)} תאים (${fmt(share)}%).`) : bad(`חורג מ־EV 5.8.3: ${fmt(sensors)} חיישנים ל־${fmt(cells)} תאים הם ${fmt(share)}%. נדרשים לפחות ${needed} (30%) בתאי ליתיום, בהנחה שכל חיישן מודד תא אחד.`);
    } },
  { id: 'RC-12', rule: 'EV 5.8.5', page: 81, summary: 'חיישן הטמפרטורה חייב להיות במרחק של פחות מ־15 mm מנקודת הייחוס של התא, לאורך מסלול הזרם.', target: ref('BMS', 'LC-ESF-S04-O24'),
    evaluate: get => { const value = get.num(ref('BMS', 'LC-ESF-S04-O24')); if (value === undefined) return pending(); return value < 15 ? ok(`עומד ב־EV 5.8.5: ${fmt(value)} mm (נדרש פחות מ־15 mm).`) : bad(`חורג מ־EV 5.8.5: ${fmt(value)} mm. נדרש פחות מ־15 mm.`); } },
  { id: 'RC-13', rule: 'EV 5.8.4', page: 81, summary: 'הטמפרטורה המרבית המותרת לתא היא 60 °C, או גבול היצרן אם הוא נמוך יותר.', target: C('LC-ESF-S02-D11'),
    evaluate: get => {
      const value = get.num(C('LC-ESF-S02-D11'));
      if (value === undefined) return pending();
      return value > 60 ? notice(`התא מדורג ל־${fmt(value)} °C, אבל לפי EV 5.8.4 סף ההגנה של ה־AMS חייב להיות 60 °C.`) : ok(`עומד ב־EV 5.8.4: סף ה־AMS יהיה ${fmt(value)} °C (הנמוך מבין 60 °C וגבול היצרן).`);
    } },
  ...([['CARD-FG-ESF-DS-02', 'conductors', 'E', 'J', 'מוליך'], ['CARD-FG-ESF-DS-03', 'fuses', 'D', 'J', 'נתיך'], ['CARD-FG-ESF-DS-04', 'resistors', 'D', 'M', 'נגד'], ['CARD-FG-ESF-DS-05', 'contactors', 'D', 'J', 'ממסר'], ['CARD-FG-ESF-DS-06', 'connectors', 'D', 'I', 'מחבר']] as const).map(([fieldId, key, voltageColumn, whereColumn, name]): Check => ({
    id: `RC-14-${key}`, rule: 'EV 4.1.2', page: 71, summary: 'כל רכיב במערכת ההנעה חייב להיות מדורג למתח המרבי של מערכת ההנעה.', target: C(fieldId), inputs: [MAX_TS_VOLTAGE],
    evaluate: get => {
      const volts = get.num(MAX_TS_VOLTAGE), rows = get.rows(C(fieldId));
      if (!rows.length) return pending('אין עדיין שורות בטבלה.');
      if (volts === undefined) return pending(needsMaxVoltage);
      return rows.map((row, index) => {
        const rated = numberFrom(row[`LC-ESF-Datasheets-${key}-${voltageColumn}`]), label = row[`LC-ESF-Datasheets-${key}-C`] || `שורה ${index + 1}`, where = row[`LC-ESF-Datasheets-${key}-${whereColumn}`] ?? '';
        if (rated === undefined) return { ...pending(`${label}: הזינו מתח נקוב.`), rowId: row._id };
        if (rated >= volts) return { ...ok(`${name} ${label}: מדורג ל־${fmt(rated)} V, מעל המתח המרבי (${fmt(volts)} V).`), rowId: row._id };
        const lowVoltageUse = /LV|GLV|מתח נמוך|low.?voltage/i.test(where);
        return { ...(lowVoltageUse ? notice(`${name} ${label}: מדורג ל־${fmt(rated)} V, פחות מ־${fmt(volts)} V. תקין רק אם הוא במתח הנמוך ולא במערכת ההנעה.`) : notice(`${name} ${label}: מדורג ל־${fmt(rated)} V, פחות מהמתח המרבי (${fmt(volts)} V). אם הוא במערכת ההנעה, הוא חורג מ־EV 4.1.2.`)), rowId: row._id };
      });
    },
  })),
  { id: 'RC-16', rule: 'EV 4.1.1', page: 71, summary: 'גם מתח הטעינה כפוף לגבול של 600 V DC במערכת ההנעה.', target: C('LC-ESF-S06-D8'),
    evaluate: get => maxCheck(get.num(C('LC-ESF-S06-D8')), 600, 'V', 'EV 4.1.1') },
  { id: 'RC-17', rule: 'T 11.1.2', page: 47, summary: 'במערכת המתח הנמוך המתח המרבי הוא 60 V DC (או 50 V AC RMS).', target: ref('LV_BATTERY', 'RC-LV-MAX-VOLTAGE'),
    evaluate: get => maxCheck(get.num(ref('LV_BATTERY', 'RC-LV-MAX-VOLTAGE')), 60, 'V', 'T 11.1.2') },
  { id: 'RC-18', rule: 'EV 5.5.5', page: 79, summary: 'רצפת מארז הסוללה: לפחות 1.25 mm בפלדה או 3.2 mm באלומיניום.', target: ref('ACCUMULATOR', 'LC-ASES-S05-S14'), inputs: [ref('ACCUMULATOR', 'LC-ASES-S05-E12')],
    evaluate: get => thickness(get, 'LC-ASES-S05-S14', 1.25, 3.2, 'רצפת המארז') },
  ...([['LC-ASES-S05-S15', 'הדופן החיצונית'], ['LC-ASES-S05-S16', 'המחיצה הפנימית'], ['LC-ASES-S05-S17', 'המכסה']] as const).map(([fieldId, name], index): Check => ({
    id: `RC-19-${index + 1}`, rule: 'EV 5.5.5', page: 79, summary: 'דפנות, מחיצות ומכסה של מארז הסוללה: לפחות 0.9 mm בפלדה או 2.3 mm באלומיניום.', target: ref('ACCUMULATOR', fieldId), inputs: [ref('ACCUMULATOR', 'LC-ASES-S05-E12')],
    evaluate: get => thickness(get, fieldId, 0.9, 2.3, name),
  })),
  { id: 'RC-20', rule: 'EV 2.2.1', page: 70, summary: 'ההספק ביציאה ממארז הסוללה לא יעלה על 80 kW.', target: ref('DRIVE', 'RC-DRIVE-POWER-LIMIT'),
    evaluate: get => maxCheck(get.num(ref('DRIVE', 'RC-DRIVE-POWER-LIMIT')), 80, 'kW', 'EV 2.2.1') },
  { id: 'RC-21', rule: 'EV 2.2.2', page: 70, summary: 'הזרם ביציאה ממארז הסוללה לא יעלה על 500 A.', target: ref('ACCUMULATOR', 'RC-ACC-MAX-CURRENT'),
    evaluate: get => maxCheck(get.num(ref('ACCUMULATOR', 'RC-ACC-MAX-CURRENT')), 500, 'A', 'EV 2.2.2') },
  { id: 'RC-22', rule: 'EV 6.1.5', page: 82, summary: 'כשמעגל הניתוק נפתח, מתח מערכת ההנעה חייב לרדת מתחת ל־60 V DC בפחות מ־5 שניות.', target: ref('DISCHARGE', 'RC-DISCHARGE-TIME'),
    evaluate: get => { const value = get.num(ref('DISCHARGE', 'RC-DISCHARGE-TIME')); if (value === undefined) return pending(); return value < 5 ? ok(`עומד ב־EV 6.1.5: ${fmt(value)} s (נדרש פחות מ־5 s).`) : bad(`חורג מ־EV 6.1.5: ${fmt(value)} s. נדרש פחות מ־5 s.`); } },
  { id: 'RC-23', rule: 'EV 4.10.2', page: 75, summary: 'האור האדום של ה־TSAL מהבהב בתדירות בין 2 Hz ל־5 Hz, במחזור עבודה של 50%.', target: ref('TSAL', 'RC-TSAL-FREQUENCY'),
    evaluate: get => rangeCheck(get.num(ref('TSAL', 'RC-TSAL-FREQUENCY')), 2, 5, 'Hz', 'EV 4.10.2') },
  { id: 'RC-24-1', rule: 'T 11.4.3', page: 48, summary: 'קוטר לחצני הכיבוי בשני צידי הרכב: לפחות 40 mm.', target: ref('SDC', 'RC-SDC-BUTTON-SIDE'),
    evaluate: get => minCheck(get.num(ref('SDC', 'RC-SDC-BUTTON-SIDE')), 40, 'mm', 'T 11.4.3') },
  { id: 'RC-24-2', rule: 'T 11.4.4', page: 48, summary: 'קוטר לחצן הכיבוי בתא הנהג: לפחות 24 mm.', target: ref('SDC', 'RC-SDC-BUTTON-COCKPIT'),
    evaluate: get => minCheck(get.num(ref('SDC', 'RC-SDC-BUTTON-COCKPIT')), 24, 'mm', 'T 11.4.4') },
  { id: 'RC-25', rule: 'EV 4.12.1', page: 77, summary: 'צליל הכניסה למצב R2D נשמע ברציפות לפחות 1 שנייה ולכל היותר 3 שניות.', target: ref('RTD', 'RC-RTD-SOUND'),
    evaluate: get => rangeCheck(get.num(ref('RTD', 'RC-RTD-SOUND')), 1, 3, 's', 'EV 4.12.1') },
  { id: 'RC-26', rule: 'EV 4.5.3', page: 73, summary: 'דירוג הטמפרטורה של חיווט, חיבורים ובידוד במערכת ההנעה: לפחות 85 °C, ולפי הטמפרטורה הצפויה בסביבה.', target: C('CARD-FG-ESF-DS-02'),
    evaluate: get => {
      const rows = get.rows(C('CARD-FG-ESF-DS-02'));
      if (!rows.length) return pending('אין עדיין שורות בטבלה.');
      return rows.map((row, index) => {
        const rated = numberFrom(row['LC-ESF-Datasheets-conductors-G']), label = row['LC-ESF-Datasheets-conductors-C'] || `שורה ${index + 1}`, where = row['LC-ESF-Datasheets-conductors-J'] ?? '';
        if (rated === undefined) return { ...pending(`${label}: הזינו טמפרטורת עבודה מרבית.`), rowId: row._id };
        if (rated >= 85) return { ...ok(`מוליך ${label}: מדורג ל־${fmt(rated)} °C (נדרש לפחות 85 °C).`), rowId: row._id };
        if (/LV|GLV|מתח נמוך|low.?voltage/i.test(where)) return { ...notice(`מוליך ${label}: מדורג ל־${fmt(rated)} °C. תקין רק אם הוא במתח הנמוך ולא במערכת ההנעה.`), rowId: row._id };
        return { ...bad(`חורג מ־EV 4.5.3: מוליך ${label} מדורג ל־${fmt(rated)} °C, נדרש לפחות 85 °C במערכת ההנעה.`), rowId: row._id };
      });
    } },
  // Electrical rules with a clear number, on optional fields from lib/rule-fields.ts (rule coverage map, 27.11.2026).
  ...electricalLimits([
    ['RC-27', 'T 11.6.2', 49, 'BSPD', 'RC-BSPD-DELAY', 'ה־BSPD חייב לפתוח את מעגל הניתוק אם חוסר ההתאמה נמשך יותר מ־500 ms.', ['max', 500, 'ms']],
    ['RC-28', 'T 11.6.5', 49, 'BSPD', 'RC-BSPD-PRESSURE', 'בלימה חזקה מזוהה בחיישן לחץ, בסף שלא נועל גלגלים ולא עולה על 30 bar.', ['max', 30, 'bar']],
    ['RC-29', 'T 11.8.8', 50, 'DRIVE', 'RC-DRIVE-APPS-DELAY', 'חוסר התאמה בין חיישני דוושת התאוצה שנמשך יותר מ־100 ms מחייב ניתוק מלא של ההספק למנועים.', ['max', 100, 'ms']],
    ['RC-30', 'T 11.8.12', 50, 'DRIVE', 'RC-DRIVE-RELEASED-TORQUE', 'דוושת תאוצה משוחררת במצב ידני חייבת לתת מומנט של 0 Nm או פחות בגלגלים.', ['max', 0, 'Nm']],
    ['RC-31', 'T 11.9.4', 51, 'INTEGRATION', 'RC-INT-SCS-DELAY', 'ההשהיה המרבית שנקבעת להודעות של אותות קריטיים לא תעלה על 500 ms.', ['max', 500, 'ms']],
    ['RC-32', 'T 11.9.6', 51, 'INTEGRATION', 'RC-INT-INDICATOR-TEST', 'נוריות אזהרה שמצבן הבטוח הוא "דולקת" נדלקות לבדיקה למשך 1 עד 3 שניות אחרי הפעלת ה־LVMS.', ['range', 1, 3, 's']],
    ['RC-33', 'T 11.11.1', 51, 'INTEGRATION', 'RC-INT-FAN-POWER', 'ההספק הנקוב הכולל של כל ההתקנים שמזיזים אוויר, כולל מאווררי קירור, הוא 500 W לכל היותר.', ['max', 500, 'W']],
    ['RC-34', 'EV 3.1.1', 70, 'INTEGRATION', 'RC-INT-ENCLOSURE-LAYER', 'מארז של מערכת ההנעה עשוי משכבה מוליכה מוארקת בעובי 0.5 mm לפחות (אלומיניום או טוב יותר), או מחומר מבודד לפי התקנון.', ['min', 0.5, 'mm']],
    ['RC-35', 'EV 3.1.3', 71, 'INTEGRATION', 'RC-INT-GROUND-RESISTANCE', 'חלק מוליך נחשב מוארק אם ההתנגדות שלו לאדמת המתח הנמוך נמוכה מ־100 mΩ, במדידה בזרם של 1 A.', ['less', 100, 'mΩ']],
    ['RC-36', 'EV 3.1.4', 71, 'INTEGRATION', 'RC-INT-NEAR-TS-RESISTANCE', 'חלקים שעלולים להיות מוליכים, עד 100 mm מרכיב של מערכת ההנעה, חייבים התנגדות נמוכה מ־100 Ω לאדמת המתח הנמוך.', ['less', 100, 'Ω']],
    ['RC-37', 'EV 3.2.6', 71, 'INTEGRATION', 'RC-INT-FUSE-TEMP-MIN', 'הגנות זרם היתר מתוכננות לטווח הטמפרטורות הצפוי, ולפחות מ־0 °C עד 85 °C.', ['max', 0, '°C']],
    ['RC-38', 'EV 3.2.6', 71, 'INTEGRATION', 'RC-INT-FUSE-TEMP-MAX', 'הגנות זרם היתר מתוכננות לטווח הטמפרטורות הצפוי, ולפחות מ־0 °C עד 85 °C.', ['min', 85, '°C']],
    ['RC-40', 'EV 4.3.6', 72, 'INTEGRATION', 'RC-INT-PCB-GROOVE', 'בלוח שיש בו גם מתח גבוה וגם מתח נמוך, חריצים שנועדו להאריך את מרחק הזחילה צריכים להיות ברוחב 1.5 mm לפחות.', ['min', 1.5, 'mm']],
    ['RC-41', 'EV 4.7.3', 74, 'INTEGRATION', 'RC-INT-TSMP-RATING', 'נקודות המדידה הן שקעי בננה מוגנים בקוטר 4 mm, מדורגים ל־600 V CAT III לפחות.', ['min', 600, 'V']],
    ['RC-43', 'EV 4.5.8', 73, 'HV_CONNECTORS', 'RC-HVC-MOUNT-FORCE', 'חיווט מערכת ההנעה מחוץ למארזים מעוגן לפחות בשני קצותיו, כך שיעמוד בכוח של 200 N בלי להשתחרר.', ['min', 200, 'N']],
    ['RC-44', 'EV 4.8.1', 75, 'HVD', 'RC-HVD-HEIGHT', 'ה־HVD נמצא בגובה של יותר מ־350 mm מעל הקרקע, ונשלף בלי לפרק את המרכב.', ['more', 350, 'mm']],
    ['RC-45', 'EV 4.8.2', 75, 'HVD', 'RC-HVD-REMOVAL-TIME', 'אדם מיומן מוציא את ה־HVD תוך 10 שניות לכל היותר, כשהרכב במצב מוכן למרוץ.', ['max', 10, 's']],
    ['RC-47', 'EV 4.12.2', 77, 'RTD', 'RC-RTD-SOUND-LEVEL', 'עוצמת צליל ה־R2D היא בין 80 ל־90 dB(A), בשקלול מהיר, ברדיוס של 2 m מהרכב.', ['range', 80, 90, 'dB']],
    ['RC-48', 'EV 5.8.6', 81, 'BMS', 'RC-BMS-SENSOR-GAP', 'בין חיישן הטמפרטורה של התא לנקודת המדידה יש פחות מ־0.5 mm של חומר לא מתכתי, כמו ציפוי או דבק.', ['less', 0.5, 'mm']],
    ['RC-49', 'EV 5.8.10', 81, 'BMS', 'RC-BMS-TRIP-VI', 'ה־AMS פותח את מעגל הניתוק אם חריגה במתח או בזרם נמשכת יותר מ־500 ms.', ['max', 500, 'ms']],
    ['RC-50', 'EV 5.8.10', 81, 'BMS', 'RC-BMS-TRIP-TEMP', 'ה־AMS פותח את מעגל הניתוק אם חריגה בטמפרטורה נמשכת יותר משנייה אחת.', ['max', 1, 's']],
    ['RC-51', 'EV 6.2.3', 83, 'TSMS', 'RC-TSMS-CIRCLE', 'ה־TSMS מותקן במרכז עיגול כתום מלא בקוטר 50 mm לפחות, על רקע בניגודיות גבוהה.', ['min', 50, 'mm']],
    ['RC-52', 'T 11.2.1', 47, 'TSMS', 'RC-TSMS-HANDLE', 'מפסק ראשי הוא מפסק סיבובי מכני עם ידית אדומה נשלפת ברוחב 50 mm לפחות.', ['min', 50, 'mm']],
    ['RC-53', 'T 11.3.2', 48, 'LVMS', 'RC-LVMS-CIRCLE', 'ה־LVMS מותקן במרכז עיגול אדום מלא בקוטר 50 mm לפחות, על רקע בניגודיות גבוהה.', ['min', 50, 'mm']],
    ['RC-54', 'T 11.2.1', 47, 'LVMS', 'RC-LVMS-HANDLE', 'מפסק ראשי הוא מפסק סיבובי מכני עם ידית אדומה נשלפת ברוחב 50 mm לפחות.', ['min', 50, 'mm']],
    ['RC-55', 'T 11.7.6', 49, 'LV_BATTERY', 'RC-LVB-SHORT-DISTANCE', 'סוללות המתח הנמוך מוגנות מקצר, במרחק של 100 mm לכל היותר מההדקים הלא מוארקים.', ['max', 100, 'mm']],
    ['RC-56', 'T 11.5.2', 48, 'SDC', 'RC-SDC-INERTIA-G', 'מתג האינרציה מופעל בתאוטה של בין 8 g ל־11 g, לפי משך התאוטה.', ['range', 8, 11, 'g']],
    ['RC-57', 'T 11.10.1', 51, 'DASHBOARD', 'RC-DASH-LIGHT-AREA', 'לנורית מצב מערכת יש שטח מואר של 15 cm² לפחות, בעוצמה אחידה, על רקע שחור.', ['min', 15, 'cm²']],
    ['RC-58', 'EV 7.1.5', 84, 'CHARGER', 'RC-CHG-ESTOP', 'במטען יש לחצן חירום נגיש מסוג לחיצה, בקוטר 40 mm לפחות.', ['min', 40, 'mm']],
  ]),
  { id: 'RC-39', rule: 'EV 4.3.4', page: 72, summary: 'במארז שיש בו גם מתח גבוה וגם מתח נמוך, מפרידים ביניהם במחיצה מבודדת עמידה ללחות, או במרווח של 20 mm לפחות באוויר או על פני משטח.', target: ref('INTEGRATION', 'RC-INT-TS-LV-SPACING'),
    evaluate: get => {
      const result = minCheck(get.num(ref('INTEGRATION', 'RC-INT-TS-LV-SPACING')), 20, 'mm', 'EV 4.3.4');
      return result.status === 'violation' ? { ...notice(`${result.message.replace('חורג מ־', 'מתחת לנדרש ב־')} תקין רק אם יש במקום הזה מחיצה מבודדת עמידה ללחות.`), table: result.table } : result;
    } },
  { id: 'RC-42', rule: 'EV 4.7.6', page: 74, summary: 'כל נקודת מדידה מוגנת בנגד שמגביל את הזרם, לפי המתח המרבי: מתחת ל־200 V נגד של 5 kΩ, עד 400 V נגד של 10 kΩ, ועד 600 V נגד של 15 kΩ. אסור לשים נתיך.', target: ref('INTEGRATION', 'RC-INT-TSMP-RESISTOR'), inputs: [MAX_TS_VOLTAGE],
    evaluate: get => {
      const kOhm = get.num(ref('INTEGRATION', 'RC-INT-TSMP-RESISTOR')), volts = get.num(MAX_TS_VOLTAGE);
      if (kOhm === undefined) return pending();
      if (volts === undefined) return pending(needsMaxVoltage);
      if (volts > 600) return bad(`המתח המרבי שהוזן, ${fmt(volts)} V, גבוה מ־600 V, ולכן אין ערך נגד מתאים בטבלה של EV 4.7.6.`);
      const required = volts < 200 ? 5 : volts <= 400 ? 10 : 15;
      const table = [{ label: 'ערך הנגד', value: `${fmt(kOhm)} kΩ`, required: `${fmt(required)} kΩ`, ok: kOhm >= required }];
      if (kOhm === required) return { ...ok(`עומד ב־EV 4.7.6: ${fmt(kOhm)} kΩ במתח מרבי של ${fmt(volts)} V.`), table };
      if (kOhm > required) return { ...notice(`לפי EV 4.7.6, במתח של ${fmt(volts)} V נדרש נגד של ${fmt(required)} kΩ. הוזן ${fmt(kOhm)} kΩ, ערך שונה מהטבלה. מומלץ לבדוק מול התקנון.`), table };
      return { ...bad(`חורג מ־EV 4.7.6: במתח מרבי של ${fmt(volts)} V נדרש נגד של ${fmt(required)} kΩ. הוזן ${fmt(kOhm)} kΩ.`), table };
    } },
  { id: 'RC-46', rule: 'EV 4.10.7', page: 76, summary: 'ה־TSAL, כולל העיגון, נמוך מהנקודה הגבוהה של הקשת הראשית, אבל לא יותר מ־75 mm מתחתיה.', target: ref('TSAL', 'RC-TSAL-BELOW-HOOP'),
    evaluate: get => {
      const value = get.num(ref('TSAL', 'RC-TSAL-BELOW-HOOP'));
      if (value === undefined) return pending();
      const passes = value > 0 && value <= 75, table = [{ label: 'מרחק מתחת לקשת', value: `${fmt(value)} mm`, required: '0–75 mm', ok: passes }];
      if (passes) return { ...ok(`עומד ב־EV 4.10.7: ${fmt(value)} mm מתחת לנקודה הגבוהה של הקשת (נדרש עד 75 mm).`), table };
      return { ...bad(value <= 0 ? `חורג מ־EV 4.10.7: ה־TSAL חייב להיות נמוך מהנקודה הגבוהה של הקשת הראשית. הוזן ${fmt(value)} mm.` : `חורג מ־EV 4.10.7: ${fmt(value)} mm מתחת לקשת. מותר עד 75 mm.`), table };
    } },
  ...structuralChecks,
];

type Limit = ['max' | 'min' | 'less' | 'more', number, string] | ['range', number, number, string];
/** Checks of one optional number against a fixed limit from the rulebook. */
function electricalLimits(list: [id: string, rule: string, page: number, systemId: string, fieldId: string, summary: string, limit: Limit][]): Check[] {
  return list.map(([id, rule, page, systemId, fieldId, summary, limit]) => ({ id, rule, page, summary, target: ref(systemId, fieldId),
    evaluate: get => {
      const value = get.num(ref(systemId, fieldId));
      if (limit[0] === 'range') return rangeCheck(value, limit[1], limit[2], limit[3], rule);
      const [kind, bound, unit] = limit;
      return kind === 'max' || kind === 'less' ? maxCheck(value, bound, unit, rule, kind === 'less') : minCheck(value, bound, unit, rule, kind === 'more');
    } }));
}

function thickness(get: Getter, fieldId: string, steel: number, aluminium: number, name: string) {
  const value = get.num(ref('ACCUMULATOR', fieldId)), kind = material(get.text(ref('ACCUMULATOR', 'LC-ASES-S05-E12')));
  if (value === undefined) return pending();
  if (!kind) return pending('בחרו את חומר המבנה (פלדה או אלומיניום) כדי לבדוק.');
  if (kind === 'other') return notice(`חומר חלופי: לפי EV 5.5.5 נדרשת הוכחת שקילות (T 3.4) או בדיקות לחומר מרוכב (EV 5.5.6).`);
  const limit = kind === 'steel' ? steel : aluminium, label = kind === 'steel' ? 'פלדה' : 'אלומיניום';
  return value >= limit ? ok(`עומד ב־EV 5.5.5: ${name} ${fmt(value)} mm (${label}, נדרש לפחות ${fmt(limit)} mm).`) : bad(`חורג מ־EV 5.5.5: ${name} ${fmt(value)} mm. ב${label} נדרש לפחות ${fmt(limit)} mm.`);
}

/** Every field a check reads: the server returns exactly these answers to the editor. */
export const ruleInputs: RuleRef[] = [...new Map(checks.flatMap(check => [check.target, ...(check.inputs ?? [])]).map(item => [`${item.systemId}:${item.fieldId}`, item])).values()];

/** Static rule notes for a field, shown even before anything is entered. */
export function rulesFor(systemId: string, fieldId: string) {
  return [...new Map(checks.filter(check => check.target.systemId === systemId && check.target.fieldId === fieldId).map(check => [check.rule, { rule: check.rule, page: check.page, summary: isolateLtr(check.summary) }])).values()];
}

export function evaluateRules(answers: RuleAnswers): RuleResult[] {
  const answer = (item: RuleRef) => answers[item.systemId]?.[item.fieldId];
  const usable = (item: RuleRef) => { const a = answer(item); return a && a.status === 'answered' ? a : undefined; };
  const get: Getter = {
    num: item => numberFrom(usable(item)?.value),
    text: item => { const value = usable(item)?.value; return typeof value === 'string' && value.trim() ? value.trim() : undefined; },
    rows: item => { const value = usable(item)?.value; return Array.isArray(value) ? value : []; },
  };
  const out: RuleResult[] = [];
  for (const check of checks) {
    const results = check.evaluate(get);
    // Messages mix Hebrew with numbers and units; isolate those runs so they never display reversed.
    for (const result of Array.isArray(results) ? results : [results]) out.push({ ...result, message: isolateLtr(result.message), ...(result.table ? { table: result.table.map(line => ({ ...line, label: isolateLtr(line.label) })) } : {}), checkId: check.id, rule: check.rule, page: check.page, summary: isolateLtr(check.summary), systemId: check.target.systemId, fieldId: check.target.fieldId });
  }
  return out;
}

export const ruleCheckCount = checks.length;
export const ruleChecks: readonly Meta[] = checks;
