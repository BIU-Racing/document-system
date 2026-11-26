/**
 * Formula Student Rules 2027 checks for the chassis and structure: the fixed SES fields (one per
 * input cell of the official template, lib/ses-fields.ts) and the matching ASES fields of the
 * accumulator (TSAC protection structure, laminate tests, cell mounting).
 *
 * Same contract as lib/rule-checks.ts: rule number, page, our own Hebrew summary, warnings only.
 * Limits were read from FS_Rules_2027_v1.0.pdf; where the template has its own PASS/FAIL formula
 * the check agrees with it unless the 2027 text differs.
 */
import { type Check, type Getter, type RuleRef, type RuleRow, ref, fmt, pending, ok, bad, notice, maxCheck, minCheck } from './rule-check-kit';

/** Same id scheme as lib/ses-fields.ts (kept local so the checks stay small and client-safe). */
const sesId = (sheet: string, cell: string) => `SESX-${sheet.replace(/[^A-Za-z0-9]+/g, '').toUpperCase()}-${cell}`;
const S = (sheet: string, cell: string): RuleRef => ref('SES', sesId(sheet, cell));
const A = (cell: string): RuleRef => ref('ACCUMULATOR', `LC-ASES-${cell}`);
const slug = (item: RuleRef) => item.fieldId.replace(/^SESX-|^LC-ASES-/, '');

const COMPOSITE_ONLY = 'Composite only', TUBING_ONLY = 'Tubing only';
const notRelevant = (choice: string) => pending(`לא נבדק: סוג המבנה שנבחר הוא ${choice}.`);
const isSteel = (value: string | undefined) => !value || /^steel|פלדה/i.test(value);
const isSquare = (value: string | undefined) => !!value && /square|ריבוע|מרובע/i.test(value);

// ── T 3.2.1 Table 2: minimum steel tube sizes in the primary structure ──────────────────────────
type TubeClass = { wall: number; area: number; inertia: number; what: string };
const HOOP: TubeClass = { wall: 2.0, area: 173, inertia: 11320, what: 'קשת ראשית, קשת קדמית ומוט רתמת הכתפיים' };
const STRUCTURE: TubeClass = { wall: 1.2, area: 119, inertia: 8509, what: 'מבני הגנה מפני פגיעה, מחיצה קדמית, חיזוקי הקשתות ועיגון רתמות' };
const SUPPORT: TubeClass = { wall: 1.2, area: 91, inertia: 6695, what: 'תמיכת המחיצה הקדמית ותמיכות חיזוקי הקשת הראשית' };

function section(od: number, wall: number, square: boolean) {
  const inner = od - 2 * wall;
  if (inner < 0) return undefined;
  return square ? { area: od ** 2 - inner ** 2, inertia: (od ** 4 - inner ** 4) / 12 } : { area: Math.PI / 4 * (od ** 2 - inner ** 2), inertia: Math.PI / 64 * (od ** 4 - inner ** 4) };
}

type Tube = { material?: RuleRef; shape?: RuleRef; od: RuleRef; wall: RuleRef; construction?: RuleRef };
function tubeCheck(tube: Tube, cls: TubeClass): Check {
  return {
    id: `RC-TUBE-${slug(tube.wall)}`, rule: 'T 3.2.1', page: 24,
    summary: `צינורות פלדה במבנה הראשי (${cls.what}): דופן לפחות ${fmt(cls.wall)} mm, שטח חתך לפחות ${cls.area} mm² ומומנט התמד לפחות ${cls.inertia} mm⁴.`,
    target: tube.wall, inputs: [tube.od, tube.material, tube.shape, tube.construction].filter((item): item is RuleRef => !!item),
    evaluate: get => {
      const construction = tube.construction && get.text(tube.construction);
      if (construction === COMPOSITE_ONLY) return notRelevant(construction);
      const wall = get.num(tube.wall), od = get.num(tube.od);
      if (wall === undefined) return pending('הזינו את עובי הדופן ואת הקוטר החיצוני כדי לבדוק.');
      const material = tube.material && get.text(tube.material);
      if (!isSteel(material)) return notice(`החומר שנבחר הוא ${material}. המינימום בטבלה 2 של T 3.2.1 הוא לצינורות פלדה; לחומר אחר נדרשת הוכחת שקילות (T 3.4).`);
      const failures: string[] = [];
      if (wall < cls.wall) failures.push(`דופן ${fmt(wall)} mm (נדרש לפחות ${fmt(cls.wall)} mm)`);
      const wallRow: RuleRow = { label: 'עובי דופן', value: `${fmt(wall)} mm`, required: `≥ ${fmt(cls.wall)} mm`, ok: wall >= cls.wall };
      if (od === undefined) return { ...(failures.length ? bad(`חורג מ־T 3.2.1: ${failures.join('; ')}.`) : ok(`עובי הדופן ${fmt(wall)} mm עומד ב־T 3.2.1. הזינו גם את הקוטר החיצוני כדי לבדוק שטח חתך ומומנט התמד.`)), table: [wallRow] };
      const props = section(od, wall, isSquare(tube.shape && get.text(tube.shape)));
      if (!props) return bad(`עובי הדופן (${fmt(wall)} mm) גדול מחצי הקוטר (${fmt(od)} mm). בדקו את הערכים.`);
      const area = Math.round(props.area), inertia = Math.round(props.inertia);
      // The table values are rounded from the reference tubes (25.4 × 1.6 gives 8508.6 mm⁴), so compare rounded values.
      if (area < cls.area) failures.push(`שטח חתך ${area} mm² (נדרש לפחות ${cls.area} mm²)`);
      if (inertia < cls.inertia) failures.push(`מומנט התמד ${inertia} mm⁴ (נדרש לפחות ${cls.inertia} mm⁴)`);
      const table: RuleRow[] = [wallRow,
        { label: 'שטח חתך (מחושב)', value: `${area} mm²`, required: `≥ ${cls.area} mm²`, ok: area >= cls.area },
        { label: 'מומנט התמד (מחושב)', value: `${inertia} mm⁴`, required: `≥ ${cls.inertia} mm⁴`, ok: inertia >= cls.inertia }];
      if (failures.length) return { ...bad(`חורג מ־T 3.2.1: ${failures.join('; ')}.`), table };
      return { ...ok(`עומד ב־T 3.2.1: צינור ${fmt(od)} × ${fmt(wall)} mm, שטח חתך ${area} mm², מומנט התמד ${inertia} mm⁴.`), table };
    },
  };
}

/** One tube per column; rows hold material, shape, OD and wall. */
const columns = (cell: (cell: string) => RuleRef, cols: string[], rows: [string, string | undefined, string, string], construction?: RuleRef): Tube[] =>
  cols.map(col => ({ material: cell(col + rows[0]), shape: rows[1] ? cell(col + rows[1]) : undefined, od: cell(col + rows[2]), wall: cell(col + rows[3]), construction }));
const sheet = (name: string) => (cell: string) => S(name, cell);

const SIS = 'T3.15 T3.6 SIS', ACPS_SIDE = 'EV5.5.1&2 EV4.4 ACPS TSPS Side', ACPS_REAR = 'EV5.5.1&2 EV4.4 ACPS TSPS Rear';
const tubes: [Tube[], TubeClass][] = [
  [columns(sheet('T3.9 Main Hoop Tubing'), ['D'], ['4', undefined, '13', '14']), HOOP],
  [columns(sheet('T3.10 Front Hoop Tubing'), ['D'], ['4', '5', '13', '14']), HOOP],
  [columns(sheet('T5.5 Shoulder Harness Bar'), ['E'], ['5', '6', '15', '16'], S('T5.5 Shoulder Harness Bar', 'F2')), HOOP],
  [columns(sheet('T3.11 Main Hoop Bracing'), ['D'], ['4', '5', '13', '14']), STRUCTURE],
  [columns(sheet('T3.12 T3.6 FHoop Bracing'), ['E'], ['5', '6', '15', '16'], S('T3.12 T3.6 FHoop Bracing', 'F2')), STRUCTURE],
  [columns(sheet('T3.13 T3.6 Ft Bulkhead'), ['E'], ['5', '6', '18', '19'], S('T3.13 T3.6 Ft Bulkhead', 'F2')), STRUCTURE],
  [columns(sheet(SIS), ['E', 'F', 'G'], ['5', '6', '15', '16'], S(SIS, 'F2')), STRUCTURE],
  [columns(sheet(ACPS_SIDE), ['E', 'F', 'G'], ['5', '6', '15', '16'], S(ACPS_SIDE, 'F2')), STRUCTURE],
  [columns(sheet(ACPS_REAR), ['E', 'F', 'G'], ['5', '6', '15', '16'], S(ACPS_REAR, 'F2')), STRUCTURE],
  [columns(sheet('T4.5 Harness Attachments'), ['Z', 'AD'], ['4', '6', '9', '10']), STRUCTURE],
  [columns(sheet('T3.11.5 T3.6 MHoop Brace Spt'), ['E'], ['5', '6', '15', '16'], S('T3.11.5 T3.6 MHoop Brace Spt', 'F2')), SUPPORT],
  [columns(sheet('T3.14 T3.6 FBH Spt Structure'), ['E', 'F', 'G'], ['5', '6', '15', '16'], S('T3.14 T3.6 FBH Spt Structure', 'F2')), SUPPORT],
  [columns(sheet('Steering Rack Collars'), ['C'], ['4', '5', '13', '14']), SUPPORT],
  // ASES: TSAC protection structure (side and rear), the same tube table as the SES impact structures.
  [columns(cell => A(`S06-${cell}`), ['E', 'F', 'G'], ['5', '6', '15', '16'], A('S06-F2')), STRUCTURE],
  [columns(cell => A(`S07-${cell}`), ['E', 'F', 'G'], ['5', '6', '15', '16'], A('S07-F2')), STRUCTURE],
];

// ── T 3.5.4: asymmetric laminate skins ─────────────────────────────────────────────────────────
function skinCheck(inner: RuleRef, outer: RuleRef, construction?: RuleRef): Check {
  return {
    id: `RC-SKIN-${slug(outer)}`, rule: 'T 3.5.4', page: 26,
    summary: 'בלמינציה אסימטרית במבנה הראשי, השכבה הדקה חייבת להיות לפחות 40% מהעבה או 1 mm (הנמוך מביניהם).',
    target: outer, inputs: [inner, construction].filter((item): item is RuleRef => !!item),
    evaluate: get => {
      const choice = construction && get.text(construction);
      if (choice === TUBING_ONLY) return notRelevant(choice);
      const a = get.num(inner), b = get.num(outer);
      if (a === undefined || b === undefined) return pending('הזינו את עובי שתי השכבות כדי לבדוק.');
      const thin = Math.min(a, b), thick = Math.max(a, b), required = Math.min(0.4 * thick, 1);
      const table: RuleRow[] = [{ label: 'השכבה הדקה', value: `${fmt(thin)} mm`, required: `≥ ${fmt(required)} mm`, ok: thin >= required }];
      return { table, ...(thin >= required ? ok(`עומד ב־T 3.5.4: ${fmt(thin)} mm מול ${fmt(thick)} mm (נדרש לפחות ${fmt(required)} mm).`) : bad(`חורג מ־T 3.5.4: השכבה הדקה ${fmt(thin)} mm, נדרש לפחות ${fmt(required)} mm (40% מ־${fmt(thick)} mm, ולא יותר מ־1 mm).`)) };
    },
  };
}
const skins: Check[] = [
  ...[['T3.11.5 T3.6 MHoop Brace Spt', 'F20', 'F21'], ['T3.12 T3.6 FHoop Bracing', 'F20', 'F21'], ['T3.14 T3.6 FBH Spt Structure', 'I20', 'I21'], ['T3.13 T3.6 Ft Bulkhead', 'F23', 'F24'],
    [SIS, 'I20', 'I21'], [SIS, 'J20', 'J21'], ['T5.5 Shoulder Harness Bar', 'F22', 'F23'], [ACPS_SIDE, 'I20', 'I21'], [ACPS_SIDE, 'J20', 'J21'], [ACPS_REAR, 'I20', 'I21'], [ACPS_REAR, 'J20', 'J21']]
    .map(([name, inner, outer]) => skinCheck(S(name, inner), S(name, outer), S(name, 'F2'))),
  ...['EP', 'FJ', 'GD', 'IL', 'JF', 'JZ', 'KT', 'LN'].map(col => skinCheck(S('T3.6 Laminate Tests', `${col}60`), S('T3.6 Laminate Tests', `${col}61`))),
  ...['T3.16 MH & MH Bing Attachments', 'T3.16 FH & FH Bing Attachments'].flatMap(name => ['C', 'E', 'G', 'I', 'K'].map(col => skinCheck(S(name, `${col}24`), S(name, `${col}25`)))),
  ...[['L43', 'L44'], ['L53', 'L54'], ['U43', 'U44'], ['U53', 'U54']].map(([inner, outer]) => skinCheck(S('T3.16.6&3.17.5 Prim.Struc.Att.', inner), S('T3.16.6&3.17.5 Prim.Struc.Att.', outer))),
  skinCheck(A('S06-I20'), A('S06-I21'), A('S06-F2')), skinCheck(A('S07-I20'), A('S07-I21'), A('S07-F2')),
  ...['C', 'V', 'AO', 'BH'].map(col => skinCheck(A(`S09-${col}56`), A(`S09-${col}57`))),
];

// ── T 3.6.7: 3-point bending test span ─────────────────────────────────────────────────────────
const spanCheck = (target: RuleRef): Check => ({
  id: `RC-SPAN-${slug(target)}`, rule: 'T 3.6.7', page: 27, summary: 'בבדיקת כפיפה בשלוש נקודות, המרחק בין שתי התמיכות של לוח הבדיקה: לפחות 400 mm.', target,
  evaluate: get => minCheck(get.num(target), 400, 'mm', 'T 3.6.7'),
});
const spans = [...['EP', 'FJ', 'GD', 'IL', 'JF', 'JZ', 'KT', 'LN'].map(col => spanCheck(S('T3.6 Laminate Tests', `${col}57`))), ...['C', 'V', 'AO', 'BH'].map(col => spanCheck(A(`S09-${col}53`)))];

// ── T 3.2.2 / T 3.2.4: steel chemistry and the strength values used in the SES ─────────────────
const METAL = 'Metal Datasheets';
const metals = [
  { name: 'חומר 1', type: 'I7', baseline: 'I9', c: 'A13', mn: 'C13', other: 'F13', strength: ['I14', 'I16', 'I18', 'I20'] },
  { name: 'חומר 2', type: 'BH7', baseline: 'BH9', c: 'AZ13', mn: 'BB13', other: 'BE13', strength: ['BH14', 'BH16', 'BH18', 'BH20'] },
  { name: 'חומר 3', type: 'DG7', baseline: 'DG9', c: 'CY13', mn: 'DA13', other: 'DD13', strength: ['DG14', 'DG16', 'DG18', 'DG20'] },
];
const strengthLimits: [number, string][] = [[305, 'חוזק כניעה (לא מרותך)'], [365, 'חוזק מתיחה (לא מרותך)'], [180, 'חוזק כניעה (מרותך)'], [300, 'חוזק מתיחה (מרותך)']];
const metalChecks: Check[] = metals.flatMap(metal => {
  const type = S(METAL, metal.type), baseline = S(METAL, metal.baseline);
  const steelGate = (get: Getter) => {
    const kind = get.text(type);
    if (kind && kind !== 'Steel') return pending(`לא נבדק: סוג החומר שנבחר הוא ${kind}.`);
    return undefined;
  };
  const chemistry = ([cell, limit, element]: [string, number, string]): Check => ({
    id: `RC-STEEL-${slug(S(METAL, cell))}`, rule: 'T 3.2.2', page: 24, summary: 'צינורות פלדה: פלדת פחמן לא מסגסגת, עד 0.3% פחמן, 1.7% מנגן ו־0.6% מכל יסוד אחר. אחרת זה חומר חלופי (T 3.4).',
    target: S(METAL, cell), inputs: [type, baseline],
    evaluate: get => {
      const gate = steelGate(get); if (gate) return gate;
      const value = get.num(S(METAL, cell));
      if (value === undefined) return pending();
      if (value <= limit) return ok(`עומד ב־T 3.2.2: ${element} ${fmt(value)}% (מותר עד ${fmt(limit)}%).`);
      return get.text(baseline) === 'No' ? notice(`${element} ${fmt(value)}% מעל ${fmt(limit)}%: הפלדה נחשבת חומר חלופי ודורשת בדיקות ותיעוד לפי T 3.4.`) : bad(`חורג מ־T 3.2.2: ${element} ${fmt(value)}%, מותר עד ${fmt(limit)}%. פלדה כזו היא חומר חלופי (T 3.4) ולא פלדת בסיס.`);
    },
  });
  const strength = (cell: string, index: number): Check => ({
    id: `RC-STRENGTH-${slug(S(METAL, cell))}`, rule: 'T 3.2.4', page: 24, summary: 'בחישובי ה־SES לפלדה משתמשים בערכי התקנון (305/365 MPa לא מרותך, 180/300 MPa מרותך) או בערך מהתיעוד, הנמוך מביניהם.',
    target: S(METAL, cell), inputs: [type, baseline],
    evaluate: get => {
      const gate = steelGate(get); if (gate) return gate;
      if (get.text(baseline) === 'No') return pending('לא נבדק: הפלדה סומנה כחומר חלופי, וערכיה נקבעים בבדיקות (T 3.4).');
      const [limit, name] = strengthLimits[index];
      const value = get.num(S(METAL, cell));
      if (value === undefined) return pending();
      return value <= limit ? ok(`עומד ב־T 3.2.4: ${name} ${fmt(value)} MPa (עד ${limit} MPa).`) : bad(`חורג מ־T 3.2.4: ${name} ${fmt(value)} MPa. בחישוב משתמשים לכל היותר ב־${limit} MPa.`);
    },
  });
  return [...([[metal.c, 0.3, 'פחמן'], [metal.mn, 1.7, 'מנגן'], [metal.other, 0.6, 'יסוד אחר']] as [string, number, string][]).map(chemistry), ...metal.strength.map(strength)];
});

// ── T 3.16 / T 3.8.5: bolted and welded attachments of the primary structure ───────────────────
const MH = 'T3.16 MH & MH Bing Attachments', FH = 'T3.16 FH & FH Bing Attachments', PLATES = 'T3.16.6&3.17.5 Prim.Struc.Att.';
const backingPlate = (target: RuleRef): Check => ({
  id: `RC-PLATE-${slug(target)}`, rule: 'T 3.16.3', page: 32, summary: 'בכל נקודת חיבור: לפחות שני ברגים 8 mm מדרגה 8.8, ופלטות גיבוי מפלדה בעובי נומינלי של 2 mm לפחות.', target,
  evaluate: get => minCheck(get.num(target), 2, 'mm', 'T 3.16.3'),
});
const boltDiameter = (target: RuleRef, rule = 'T 3.16.3'): Check => ({
  id: `RC-BOLT-${slug(target)}`, rule, page: 32, summary: rule === 'T 3.16.3' ? 'בכל נקודת חיבור: לפחות שני ברגים 8 mm מדרגה 8.8 (או בורג 10 mm אחד במרכז הצינור בחיבור חיזוקי קשתות, T 3.16.4).' : 'בחיבור לוחות במבנה הראשי ובחיבור ה־AIP למחיצה: בורג 8 mm מדרגה 8.8 לכל 200 mm של היקף, מעוגל כלפי מעלה.', target,
  evaluate: get => minCheck(get.num(target), 8, 'mm', rule),
});
const boltCount = (count: RuleRef, diameter: RuleRef): Check => ({
  id: `RC-BOLTS-${slug(count)}`, rule: 'T 3.16.3 / T 3.16.4', page: 32, summary: 'מספר הברגים בכל נקודת חיבור: לפחות שניים. בורג 10 mm יחיד מותר רק בחיבור חיזוקי קשתות, כשהוא על קו המרכז של הצינור.', target: count, inputs: [diameter],
  evaluate: get => {
    const n = get.num(count), d = get.num(diameter);
    if (n === undefined) return pending();
    if (n >= 2) return ok(`עומד ב־T 3.16.3: ${fmt(n)} ברגים.`);
    if (n === 1 && d !== undefined && d >= 10) return notice(`בורג ${fmt(d)} mm יחיד: מותר לפי T 3.16.4 רק בחיבור חיזוק קשת, כשהבורג על קו המרכז של הצינור.`);
    return bad(`חורג מ־T 3.16.3: ${fmt(n)} ברגים. נדרשים לפחות שני ברגים 8 mm${n === 1 ? ', או בורג 10 mm אחד בחיבור חיזוק קשת (T 3.16.4)' : ''}.`);
  },
});
const bracket = (target: RuleRef, hoopMaterial?: RuleRef): Check => ({
  id: `RC-BRACKET-${slug(target)}`, rule: 'T 3.8.5', page: 28, summary: 'פלטות חיבור המרותכות לקשתות: לפחות 2 mm בפלדה או 3 mm באלומיניום, לפי חומר הקשת.', target, inputs: hoopMaterial ? [hoopMaterial] : [],
  evaluate: get => {
    const aluminium = !!hoopMaterial && /alu/i.test(get.text(hoopMaterial) ?? '');
    return minCheck(get.num(target), aluminium ? 3 : 2, 'mm', 'T 3.8.5');
  },
});
const hoopAttachments: Check[] = [MH, FH].flatMap(name => ['C', 'E', 'G', 'I', 'K'].flatMap(col => [
  boltDiameter(S(name, `${col}10`)), boltCount(S(name, `${col}11`), S(name, `${col}10`)),
  bracket(S(name, `${col}15`), name === FH ? S(FH, 'C4') : undefined), backingPlate(S(name, `${col}18`)),
]));

const plateBolts = (col: string, enabled: RuleRef | undefined, minimum: number): Check => {
  const count = S(PLATES, `${col}30`), perimeter = S(PLATES, `${col}26`);
  return {
    id: `RC-PLATEBOLTS-${slug(count)}`, rule: 'T 3.16.5', page: 32, summary: 'בחיבור לוחות במבנה הראשי ובחיבור ה־AIP למחיצה: בורג 8 mm מדרגה 8.8 לכל 200 mm של היקף, מעוגל כלפי מעלה, בפיזור אחיד.',
    target: count, inputs: [perimeter, ...(enabled ? [enabled] : [])],
    evaluate: get => {
      if (enabled && get.text(enabled) === 'No') return pending('לא נבדק: סומן שאין לוח כזה.');
      const n = get.num(count), p = get.num(perimeter);
      if (n === undefined) return pending();
      if (p === undefined) return pending('הזינו את היקף הלוח כדי לחשב את מספר הברגים הנדרש.');
      const required = Math.max(minimum, Math.ceil(p / 200));
      return n >= required ? ok(`עומד ב־T 3.16.5: ${fmt(n)} ברגים להיקף ${fmt(p)} mm (נדרשים לפחות ${required}).`) : bad(`חורג מ־T 3.16.5: להיקף ${fmt(p)} mm נדרשים לפחות ${required} ברגים, הוזנו ${fmt(n)}.`);
    },
  };
};
const plateAttachments: Check[] = [
  boltDiameter(S(PLATES, 'C29'), 'T 3.16.5'), boltDiameter(S(PLATES, 'L29'), 'T 3.16.5'), boltDiameter(S(PLATES, 'U29'), 'T 3.16.5'),
  plateBolts('C', undefined, 1), plateBolts('L', S(PLATES, 'F4'), 2), plateBolts('U', S(PLATES, 'F5'), 2),
  ...['C44', 'L40', 'L50', 'U40', 'U50'].map(cell => backingPlate(S(PLATES, cell))),
];

// ── Single-value structural limits ─────────────────────────────────────────────────────────────
const IA = 'T3.17.3 IA AI Plate', HARNESS = 'T4.5 Harness Attachments', FIREWALL = 'T1.2.1 T4.6 T4.8 Firewall';
const harnessLoad = (cell: string, required: string, limit: number, what: string, rule: string): Check => ({
  id: `RC-HARNESS-${cell}`, rule, page: 37,
  summary: rule === 'T 4.5.3' ? 'נקודות העיגון של חגורות הכתפיים והמותן חייבות לשאת 13 kN, ושל חגורת המפשעה 6.5 kN.' : 'אם חגורות המותן והמפשעה מעוגנות במרחק של פחות מ־100 mm, יחד הן חייבות לשאת 19.5 kN.',
  target: S(HARNESS, cell), inputs: [S(HARNESS, required)],
  evaluate: get => {
    if (get.text(S(HARNESS, required)) !== 'YES') return pending('לא נבדק: בדיקה פיזית לא סומנה כנדרשת לעיגון הזה.');
    const value = get.num(S(HARNESS, cell));
    if (value === undefined) return pending();
    return value >= limit ? ok(`עומד ב־${rule}: ${what} נשא ${fmt(value)} N (נדרש לפחות ${limit} N).`) : bad(`חורג מ־${rule}: ${what} נשא ${fmt(value)} N, נדרש לפחות ${limit} N.`);
  },
});
const ratedThickness = (used: string, rated: string): Check => ({
  id: `RC-FIRE-${used}`, rule: 'T 1.2.1', page: 19, summary: 'חומר מעכב בעירה לפי UL94 V-0 חייב לעמוד בדירוג בעובי המינימלי שבו הוא משמש בפועל.',
  target: S(FIREWALL, used), inputs: [S(FIREWALL, rated), S(FIREWALL, 'D13')],
  evaluate: get => {
    const standard = get.text(S(FIREWALL, 'D13'));
    if (standard && standard !== 'UL94 V-0') return pending(`לא נבדק: התקן שנבחר הוא ${standard}.`);
    const value = get.num(S(FIREWALL, used)), limit = get.num(S(FIREWALL, rated));
    if (value === undefined) return pending();
    if (limit === undefined) return pending('הזינו את העובי שבו החומר דורג UL94 V-0 בדף הנתונים.');
    return value >= limit ? ok(`עומד ב־T 1.2.1: עובי בשימוש ${fmt(value)} mm, הדירוג תקף מ־${fmt(limit)} mm.`) : bad(`חורג מ־T 1.2.1: עובי בשימוש ${fmt(value)} mm דק מהעובי שבו החומר דורג (${fmt(limit)} mm).`);
  },
});

const singles: Check[] = [
  { id: 'RC-IA-HEIGHT', rule: 'T 3.17.2', page: 33, summary: 'ה־IA: לפחות 100 mm גובה ו־200 mm רוחב לאורך 200 mm לפני המחיצה, ולא יותר מ־350 mm מעל הקרקע.', target: S(IA, 'D26'), evaluate: get => minCheck(get.num(S(IA, 'D26')), 100, 'mm', 'T 3.17.2') },
  { id: 'RC-IA-WIDTH', rule: 'T 3.17.2', page: 33, summary: 'ה־IA: לפחות 100 mm גובה ו־200 mm רוחב לאורך 200 mm לפני המחיצה, ולא יותר מ־350 mm מעל הקרקע.', target: S(IA, 'D27'), evaluate: get => minCheck(get.num(S(IA, 'D27')), 200, 'mm', 'T 3.17.2') },
  { id: 'RC-IA-GROUND', rule: 'T 3.17.2', page: 33, summary: 'שום חלק מנפח ה־IA הנדרש (100 × 200 × 200 mm) לא יהיה יותר מ־350 mm מעל הקרקע.', target: S(IA, 'D4'), evaluate: get => maxCheck(get.num(S(IA, 'D4')), 350, 'mm', 'T 3.17.2') },
  harnessLoad('D40', 'Q34', 13000, 'עיגון רתמת הכתפיים', 'T 4.5.3'),
  harnessLoad('D44', 'Q35', 13000, 'עיגון חגורת המותן', 'T 4.5.3'),
  harnessLoad('D48', 'Q36', 6500, 'עיגון חגורת המפשעה', 'T 4.5.3'),
  harnessLoad('D52', 'Q37', 19500, 'עיגון משותף של חגורות המותן והמפשעה', 'T 4.5.4'),
  { id: 'RC-FIREWALL-AL', rule: 'T 4.8.7', page: 38, summary: 'חומת האש של מערכת ההנעה: שכבה מוצקה מאלומיניום בעובי 0.5 mm לפחות בצד הרכיבים, ושכבה שנייה מבודדת ומעכבת בעירה (לא CFRP) בצד הנהג.', target: S(FIREWALL, 'D31'), evaluate: get => minCheck(get.num(S(FIREWALL, 'D31')), 0.5, 'mm', 'T 4.8.7') },
  { id: 'RC-HEAT-GAP', rule: 'T 4.6.2', page: 37, summary: 'בידוד חום לנהג: מרווח אוויר של 25 mm לפחות נגד הסעה (וגם הגנה מהולכה וקרינה).', target: S(FIREWALL, 'D8'), evaluate: get => minCheck(get.num(S(FIREWALL, 'D8')), 25, 'mm', 'T 4.6.2') },
  ratedThickness('D23', 'D22'), ratedThickness('D38', 'D37'),
  { id: 'RC-TSAC-MOUNTS', rule: 'EV 5.5.9', page: 79, summary: 'מארז הסוללה מחובר לשלדה בשתי נקודות חיבור לפחות; תושבות מפלדה 1.6 mm או מאלומיניום 4 mm, עם חיזוקים לכפיפה.', target: S('EV5.5.8 TSAC attachments', 'Y4'), evaluate: get => minCheck(get.num(S('EV5.5.8 TSAC attachments', 'Y4')), 2, 'נקודות', 'EV 5.5.9') },
  { id: 'RC-CELL-PRESSURE', rule: 'EV 5.5.14', page: 79, summary: 'מאמץ על כל תא: עד 1.0 MPa בלחיצה ו־0.05 MPa בגזירה (או הנמוך שבדף הנתונים), מחושב על 80% משטח הפאה הגדולה.', target: A('S15-M22'), inputs: [A('S15-M16'), A('S15-M17')],
    evaluate: get => {
      const force = get.num(A('S15-M22')), height = get.num(A('S15-M16')), width = get.num(A('S15-M17'));
      if (force === undefined) return pending();
      if (height === undefined || width === undefined) return pending('הזינו את גובה התא ורוחבו (mm) כדי לחשב את הלחץ.');
      const mpa = force / (0.8 * height * width);
      return mpa <= 1 ? ok(`עומד ב־EV 5.5.14: ${fmt(force)} N על 80% מ־${fmt(height)} × ${fmt(width)} mm הם ${fmt(mpa)} MPa (עד 1.0 MPa, או הנמוך שבדף הנתונים).`) : bad(`חורג מ־EV 5.5.14: ${fmt(force)} N על 80% מ־${fmt(height)} × ${fmt(width)} mm הם ${fmt(mpa)} MPa, מותר עד 1.0 MPa.`);
    } },
];

export const structuralChecks: Check[] = [...tubes.flatMap(([list, cls]) => list.map(tube => tubeCheck(tube, cls))), ...skins, ...spans, ...metalChecks, ...hoopAttachments, ...plateAttachments, ...singles];
