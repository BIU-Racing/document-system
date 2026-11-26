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
};

type Curation = {
  sheets: Record<string, string>; headers: Record<string, string>; panels: Record<string, string>;
  panelPatterns: { match: string; he: string }[]; labels: Record<string, string>;
  constructionType: { label: string; tubeOnlyValue: string; compositeOnlyValue: string; tubeHeaders: string; compositeHeaders: string; compositeLabels: string };
};
const data = curation as unknown as Curation;
export const sesFixedEntries = (registry as { fields: SesFixedEntry[] }).fields;

export const sesFieldId = (sheet: string, cell: string) => `SESX-${sheet.replace(/[^A-Za-z0-9]+/g, '').toUpperCase()}-${cell}`;
export const sesSheetTitle = (sheet: string) => data.sheets[sheet] ?? sheet;

function panelHebrew(panel: string) {
  if (data.panels[panel]) return data.panels[panel];
  for (const pattern of data.panelPatterns) {
    const match = new RegExp(pattern.match).exec(panel);
    if (match) return pattern.he.replace(/\$(\d)/g, (_, i) => match[Number(i)] ?? '');
  }
  return panel;
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
    const field: SesFixedField = {
      id,
      label: contextHebrew ? `${labelHebrew} · ${contextHebrew}` : labelHebrew,
      prompt: `בתבנית הרשמית: "${entry.label}"${contextEnglish ? ` (${contextEnglish})` : ''}. ${entry.valueKind === 'number' ? 'יש להזין מספר בלבד' + (entry.unit ? `, ביחידות ${entry.unit}` : '') + '. פירוט נוסף נכתב בהערות.' : entry.valueKind === 'select' ? 'יש לבחור מתוך הרשימה של התבנית.' : 'טקסט חופשי; עברית תתורגם לאנגלית לפני הייצוא.'}`,
      kind, type: kind,
      section: sesSheetTitle(entry.sheet),
      ...(entry.unit ? { unit: entry.unit } : {}),
      ...(entry.options ? { options: entry.options.map(value => ({ value, label: value })) } : {}),
      required: true,
      exampleIds: [], exampleStatus: 'example_gap', exampleNote: '', sourceControlIds: [id], ruleRefs: [],
      applicabilityPolicy: 'answer_or_reviewed_not_applicable',
      officialTemplate: { sheet: entry.sheet, cell: entry.cell, editableRanges: [entry.cell], fixed: true },
      sesFixed: { englishLabel: entry.label, englishContext: contextEnglish, valueKind: entry.valueKind, templateValue: entry.templateValue },
      ...(showWhen ? { showWhen } : {}),
    };
    return field;
  });
}

export const sesFixedFields: SesFixedField[] = buildFields();
export const sesFixedCellKeys = new Set(sesFixedEntries.map(entry => `${entry.sheet}!${entry.cell}`));
export const sesSheetOrder = [...new Set(sesFixedEntries.map(entry => entry.sheet))];
