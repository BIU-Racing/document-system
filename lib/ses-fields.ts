/**
 * Fixed SES fields: one app field per single-value input cell of the official SES template.
 *
 * data/ses-fixed-fields.json is generated from the template (scripts/generate-ses-fields.mjs):
 * sheet, cell, the English label printed next to the cell, unit, value kind, allowed values.
 * data/ses-field-curation.json adds proposed Hebrew labels, sheet names and the rule that
 * hides tube or composite inputs according to each sheet's "construction type".
 *
 * Client-safe: plain data and pure functions only.
 */
import registry from '@/data/ses-fixed-fields.json';
import curation from '@/data/ses-field-curation.json';
import { isolateLtr } from './bidi';

export type SesValueKind = 'number' | 'select' | 'text';
export type SesFixedEntry = {
  sheet: string; cell: string; label: string; columnHeader: string; panel?: string;
  unit: string | null; valueKind: SesValueKind; options?: string[]; validation?: string; templateValue: string | number | boolean | null;
};
export type SesFixedField = {
  id: string; label: string; prompt: string; kind: 'text' | 'select'; type: 'text' | 'select'; section: string;
  unit?: string; options?: { value: string; label: string }[]; required: true;
  exampleIds: string[]; exampleStatus: string; exampleNote: string; sourceControlIds: string[]; ruleRefs: string[];
  applicabilityPolicy: 'answer_or_reviewed_not_applicable';
  officialTemplate: { sheet: string; cell: string; editableRanges: string[]; fixed: true };
  sesFixed: { englishLabel: string; englishContext: string; valueKind: SesValueKind; templateValue: string | number | boolean | null };
  showWhen?: { fieldId: string; notIn: string[] };
  /** Repeated block (material 2, laminate 5, tube type 3…): shown only when the sheet's count control asks for it. */
  showWhenCount?: { fieldId: string; atLeast: number; initial: number };
};

/**
 * The template reserves room for many repeated items (3 metals, 20 composites, 12 extra laminates…).
 * Each group gets a count control ("how many?"); only the base item and the requested extra items are
 * shown and counted as required. A field that already has an answer always stays visible. The control
 * itself is a UI setting: optional, and never written to the workbook.
 */
type BlockGroup = { key: string; sheet: string; question: string; base: number; initial: number; blocks: ((entry: SesFixedEntry) => boolean)[] };
export type SesBlockControl = {
  id: string; sheet: string; label: string; prompt: string; kind: 'select'; type: 'select'; section: string;
  options: { value: string; label: string }[]; required: false; exampleIds: string[]; exampleStatus: string; exampleNote: string;
  sourceControlIds: string[]; ruleRefs: string[]; sesBlockControl: { initial: number };
};

type Curation = {
  sheets: Record<string, string>; headers: Record<string, string>; panels: Record<string, string>;
  panelPatterns: { match: string; he: string }[]; labels: Record<string, string>;
  constructionType: { label: string; tubeOnlyValue: string; compositeOnlyValue: string; tubeHeaders: string; compositeHeaders: string; compositeLabels: string };
  /** 2027 rulebook sections each template tab answers to (the tab names keep 2026 numbers). */
  sheetRules: Record<string, SesRuleRef[]>;
};
export type SesRuleRef = { rule: string; page: number };
const data = curation as unknown as Curation;
export const sesFixedEntries = (registry as { fields: SesFixedEntry[] }).fields;

export const sesFieldId = (sheet: string, cell: string) => `SESX-${sheet.replace(/[^A-Za-z0-9]+/g, '').toUpperCase()}-${cell}`;
export const sesSheetTitle = (sheet: string) => data.sheets[sheet] ?? sheet;
/** The 2027 rule sections of one SES tab, with their page in FS_Rules_2027_v1.0. */
export const sesSheetRules = (sheet: string): SesRuleRef[] => data.sheetRules[sheet] ?? [];

function panelHebrew(panel: string) {
  if (data.panels[panel]) return data.panels[panel];
  for (const pattern of data.panelPatterns) {
    const match = new RegExp(pattern.match).exec(panel);
    if (match) return pattern.he.replace(/\$(\d)/g, (_, i) => match[Number(i)] ?? '');
  }
  return panel;
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const panelIs = (name: string) => (entry: SesFixedEntry) => entry.panel === name;
const headerIs = (pattern: RegExp) => (entry: SesFixedEntry) => pattern.test(entry.columnHeader);
const columnIs = (column: string) => (entry: SesFixedEntry) => entry.cell.replace(/\d+$/, '') === column;
const tubeTypes = (sheet: string): BlockGroup => ({ key: `TUBES-${sheet}`, sheet, question: 'כמה סוגי צינורות יש במבנה?', base: 1, initial: 1, blocks: [headerIs(/Tube type 2/), headerIs(/Tube type 3/)] });
export const sesBlockGroups: BlockGroup[] = [
  { key: 'METALS', sheet: 'Metal Datasheets', question: 'כמה חומרי מתכת מתועדים?', base: 1, initial: 1, blocks: [panelIs('Your Material 2'), panelIs('Your Material 3')] },
  { key: 'COMPOSITES', sheet: 'Composite Datasheets', question: 'כמה חומרים מרוכבים מתועדים?', base: 1, initial: 1, blocks: range(2, 20).map(i => panelIs(`Your Material ${i}`)) },
  { key: 'LAYUPS', sheet: 'Laminate Table', question: 'כמה למינציות נוספות, מעבר לשלוש הבסיסיות?', base: 0, initial: 0, blocks: range(4, 15).map(i => panelIs(`Layup ${i}`)) },
  { key: 'LAMTESTS', sheet: 'T3.6 Laminate Tests', question: 'כמה בדיקות כפיפה של למינציות נוספות?', base: 0, initial: 0, blocks: [panelIs('OTHER LAMINATE'), ...range(4, 14).map(i => panelIs(`OTHER LAMINATE ${i}`))] },
  { key: 'SHEAR', sheet: 'T3.6.10 Shear Tests', question: 'כמה בדיקות גזירה נוספות?', base: 0, initial: 1, blocks: ['AR', 'BL', 'CF', 'CZ', 'DT', 'EN', 'FH', 'GB', 'GV', 'HP', 'IJ', 'JD', 'JX'].map(columnIs) },
  ...['T3.14 T3.6 FBH Spt Structure', 'T3.15 T3.6 SIS', 'EV5.5.1&2 EV4.4 ACPS TSPS Side', 'EV5.5.1&2 EV4.4 ACPS TSPS Rear'].map(tubeTypes),
];
const controlId = (group: BlockGroup) => `SESX-COUNT-${group.key.replace(/[^A-Za-z0-9-]+/g, '').toUpperCase()}`;

export const sesBlockControls: SesBlockControl[] = sesBlockGroups.map(group => ({
  id: controlId(group), sheet: group.sheet, label: group.question,
  prompt: `השדות של הפריטים הנוספים מופיעים לפי המספר שתבחרו (ברירת מחדל: ${group.initial}). פריט שכבר מילאתם בו נתונים נשאר מוצג. הבחירה לא נכתבת לקובץ האקסל.`,
  kind: 'select', type: 'select', section: sesSheetTitle(group.sheet),
  options: range(group.base, group.base + group.blocks.length).map(n => ({ value: String(n), label: String(n) })),
  required: false, exampleIds: [], exampleStatus: 'example_gap', exampleNote: '', sourceControlIds: [], ruleRefs: [], sesBlockControl: { initial: group.initial },
}));

function blockRule(entry: SesFixedEntry): SesFixedField['showWhenCount'] {
  for (const group of sesBlockGroups) {
    if (group.sheet !== entry.sheet) continue;
    const index = group.blocks.findIndex(match => match(entry));
    if (index >= 0) return { fieldId: controlId(group), atLeast: group.base + index + 1, initial: group.initial };
  }
  return undefined;
}

function buildFields(): SesFixedField[] {
  const rule = data.constructionType;
  const controllers = new Map<string, string>();
  for (const entry of sesFixedEntries) if (entry.label === rule.label) controllers.set(entry.sheet, sesFieldId(entry.sheet, entry.cell));
  const tubeHeader = new RegExp(rule.tubeHeaders), compositeHeader = new RegExp(rule.compositeHeaders), compositeLabel = new RegExp(rule.compositeLabels, 'i');

  return sesFixedEntries.map(entry => {
    const id = sesFieldId(entry.sheet, entry.cell);
    const contextEnglish = [entry.panel, entry.columnHeader].filter(Boolean).join(' · ');
    const contextHebrew = [entry.panel && panelHebrew(entry.panel), entry.columnHeader && (data.headers[entry.columnHeader] ?? entry.columnHeader)].filter(Boolean).join(' · ');
    const labelHebrew = data.labels[entry.label] ?? entry.label;
    const controller = controllers.get(entry.sheet);
    let showWhen: SesFixedField['showWhen'];
    if (controller && controller !== id) {
      if (compositeHeader.test(entry.columnHeader) || compositeLabel.test(entry.label)) showWhen = { fieldId: controller, notIn: [rule.tubeOnlyValue] };
      else if (tubeHeader.test(entry.columnHeader)) showWhen = { fieldId: controller, notIn: [rule.compositeOnlyValue] };
    }
    const kind = entry.valueKind === 'select' ? 'select' : 'text';
    const showWhenCount = blockRule(entry);
    const field: SesFixedField = {
      id,
      label: isolateLtr(contextHebrew ? `${labelHebrew} · ${contextHebrew}` : labelHebrew),
      prompt: isolateLtr(`בתבנית הרשמית: "${entry.label}"${contextEnglish ? ` (${contextEnglish})` : ''}. ${entry.valueKind === 'number' ? 'יש להזין מספר בלבד' + (entry.unit ? `, ביחידות ${entry.unit}` : '') + '. פירוט נוסף נכתב בהערות.' : entry.valueKind === 'select' ? 'יש לבחור מתוך הרשימה של התבנית.' : 'טקסט חופשי; עברית תתורגם לאנגלית לפני הייצוא.'}`),
      kind, type: kind,
      section: sesSheetTitle(entry.sheet),
      ...(entry.unit ? { unit: entry.unit } : {}),
      ...(entry.options ? { options: entry.options.map(value => ({ value, label: value })) } : {}),
      required: true,
      exampleIds: [], exampleStatus: 'example_gap', exampleNote: '', sourceControlIds: [id], ruleRefs: sesSheetRules(entry.sheet).map(item => item.rule),
      applicabilityPolicy: 'answer_or_reviewed_not_applicable',
      officialTemplate: { sheet: entry.sheet, cell: entry.cell, editableRanges: [entry.cell], fixed: true },
      sesFixed: { englishLabel: entry.label, englishContext: contextEnglish, valueKind: entry.valueKind, templateValue: entry.templateValue },
      ...(showWhen ? { showWhen } : {}),
      ...(showWhenCount ? { showWhenCount } : {}),
    };
    return field;
  });
}

export const sesFixedFields: SesFixedField[] = buildFields();
export const sesFixedCellKeys = new Set(sesFixedEntries.map(entry => `${entry.sheet}!${entry.cell}`));
export const sesSheetOrder = [...new Set(sesFixedEntries.map(entry => entry.sheet))];
