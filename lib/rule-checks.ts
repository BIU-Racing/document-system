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
 * Pure and client-safe. Electrical scope first (EV and T 11); see docs/rule-checks.md.
 */
import type { Answer, TableRow } from './progress';
import { isolateLtr } from './bidi';

export const RULEBOOK = { title: 'Formula Student Rules 2027', version: '1.0', file: 'FS_Rules_2027_v1.0.pdf' } as const;

export type RuleStatus = 'ok' | 'violation' | 'notice' | 'pending';
export type RuleRef = { systemId: string; fieldId: string };
export type RuleResult = { checkId: string; rule: string; page: number; summary: string; status: RuleStatus; message: string; systemId: string; fieldId: string; rowId?: string };
export type RuleAnswers = Record<string, Record<string, Answer | undefined> | undefined>;
type Meta = { id: string; rule: string; page: number; summary: string; target: RuleRef; inputs?: RuleRef[] };
type Check = Meta & { evaluate: (get: Getter) => Omit<RuleResult, keyof Meta | 'checkId' | 'systemId' | 'fieldId'>[] | Omit<RuleResult, keyof Meta | 'checkId' | 'systemId' | 'fieldId'> };
type Getter = { num: (ref: RuleRef) => number | undefined; text: (ref: RuleRef) => string | undefined; rows: (ref: RuleRef) => TableRow[] };

// New numeric fields added for these checks (lib/rule-fields.ts).
export const MAX_TS_VOLTAGE: RuleRef = { systemId: 'ACCUMULATOR', fieldId: 'RC-ACC-MAX-TS-VOLTAGE' };
const ref = (systemId: string, fieldId: string): RuleRef => ({ systemId, fieldId });
const C = (fieldId: string) => ref('COORDINATOR', fieldId);

/** A plain number, optionally with a trailing unit or "%"; text answers give undefined. */
export function numberFrom(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^\s*([+-]?\d+(?:\.\d+)?)\s*(?:%|[A-Za-zΩ°µ²/]{1,6})?\s*$/.exec(value.replace(/,(?=\d{3}\b)/g, ''));
  return match ? Number(match[1]) : undefined;
}
const fmt = (value: number) => Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
const pending = (message = 'הזינו מספר כדי לבדוק עמידה בחוק.') => ({ status: 'pending' as const, message });
const ok = (message: string) => ({ status: 'ok' as const, message });
const bad = (message: string) => ({ status: 'violation' as const, message });
const notice = (message: string) => ({ status: 'notice' as const, message });

function maxCheck(value: number | undefined, limit: number, unit: string, rule: string) {
  if (value === undefined) return pending();
  return value <= limit ? ok(`עומד ב־${rule}: ${fmt(value)} ${unit} (מותר עד ${fmt(limit)} ${unit}).`) : bad(`חורג מ־${rule}: הוזן ${fmt(value)} ${unit}, מותר עד ${fmt(limit)} ${unit}.`);
}
function minCheck(value: number | undefined, limit: number, unit: string, rule: string, strict = false) {
  if (value === undefined) return pending();
  const passes = strict ? value > limit : value >= limit;
  return passes ? ok(`עומד ב־${rule}: ${fmt(value)} ${unit} (נדרש ${strict ? 'יותר מ־' : 'לפחות '}${fmt(limit)} ${unit}).`) : bad(`חורג מ־${rule}: הוזן ${fmt(value)} ${unit}, נדרש ${strict ? 'יותר מ־' : 'לפחות '}${fmt(limit)} ${unit}.`);
}
function rangeCheck(value: number | undefined, low: number, high: number, unit: string, rule: string) {
  if (value === undefined) return pending();
  return value >= low && value <= high ? ok(`עומד ב־${rule}: ${fmt(value)} ${unit} (טווח ${fmt(low)}–${fmt(high)} ${unit}).`) : bad(`חורג מ־${rule}: הוזן ${fmt(value)} ${unit}, נדרש בין ${fmt(low)} ל־${fmt(high)} ${unit}.`);
}
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
      if (mode && mode !== 'Ratio') return notice(`שיטת הסיום שנבחרה היא ${mode}. הבדיקה של 95% נעשית בשדה המתאים לשיטה.`);
      const value = get.num(C('LC-ESF-S05-D14'));
      const result = minCheck(value, 95, '%', 'EV 5.7.1');
      return result.status === 'violation' && value !== undefined && value >= 90 ? bad(`${result.message} שימו לב: תבנית ה־ESF בודקת 90% (כלל ישן), ולכן היא עלולה להציג OK.`) : result;
    } },
  { id: 'RC-06', rule: 'EV 5.7.1', page: 80, summary: 'הטעינה המוקדמת חייבת להגיע ל־95% לפחות, כלומר הפרש המתחים בסיום הוא לכל היותר 5% מהמתח.', target: C('LC-ESF-S05-D13'), inputs: [C('LC-ESF-S05-D11'), MAX_TS_VOLTAGE],
    evaluate: get => {
      const mode = get.text(C('LC-ESF-S05-D11'));
      if (mode && mode !== 'Delta Voltage') return notice(`שיטת הסיום שנבחרה היא ${mode}. השדה הזה נבדק רק כשהשיטה היא Delta Voltage.`);
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
      return { ...result, message: `שורה ${rowIndex + 1}, ${name}: ${result.message}`, rowId: row._id };
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
];

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
    for (const result of Array.isArray(results) ? results : [results]) out.push({ ...result, message: isolateLtr(result.message), checkId: check.id, rule: check.rule, page: check.page, summary: isolateLtr(check.summary), systemId: check.target.systemId, fieldId: check.target.fieldId });
  }
  return out;
}

export const ruleCheckCount = checks.length;
export const ruleChecks: readonly Meta[] = checks;
