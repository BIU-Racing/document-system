/**
 * Display-safe catalog derived from the supplied, immutable source registry.
 * Original registries remain under data/ for authenticated server export only.
 * No original registry is imported by this client-compatible module.
 */
import systemData from '@/data/systems.normalized.json';
import exampleData from '@/data/examples.normalized.json';
import coordinatorData from '@/data/coordinator.normalized.json';
import coverageData from '@/data/coverage.normalized.json';
import summaryData from '@/data/source-summary.normalized.json';
import sharedData from '@/data/shared-records.normalized.json';
import { numericTargets } from './official-numeric-targets';
import { sesFixedFields, sesSheetTitle } from './ses-fields';

export type FieldKind = 'text' | 'table' | 'file' | 'select';

export type OfficialRef = {
  id: string;
  document: string;
  sheet: string;
  ranges: string[];
  templateYear: number;
  templateHash: string;
  event: string;
  submission2027Verified: boolean;
};

export type FieldColumn = {
  id: string;
  label: string;
  prompt: string;
  unit?: string;
  exampleIds: string[];
  exampleStatus: string;
  exampleNote: string;
  officialRefs?: OfficialRef[];
  sourceControlIds?: string[];
  kind?: FieldKind;
  type?: FieldKind;
  required?: boolean;
  options?: { value: string; label: string }[];
  attachmentRequired?: boolean;
  sourceInputSchema?: Record<string, unknown>;
  sourceSlots?: { id: string; recordKey: string | null; sourceRanges: string[] }[];
};

export type Field = {
  id: string;
  label: string;
  prompt: string;
  kind: FieldKind;
  /** Same semantic kind, retained as an explicit server validation alias. */
  type: FieldKind;
  columns?: FieldColumn[];
  unit?: string;
  section: string;
  exampleIds: string[];
  exampleStatus: string;
  exampleNote: string;
  officialRefs?: OfficialRef[];
  required: true;
  options?: { value: string; label: string }[];
  attachmentRequired?: boolean;
  applicability?: string;
  condition?: string;
  sourceQuestionId?: string | null;
  sourceControlIds: string[];
  ruleRefs?: string[];
  originalKind?: string;
  evidenceRequests?: string[];
  sourceCardId?: string;
  sourceSectionId?: string;
  sourceInputSchema?: Record<string, unknown>;
  ownershipStatus?: string;
  collectionRoutingStatus?: string;
  routingTeam?: string;
  recordKeys?: string[];
  needsClarification?: boolean;
  applicabilityPolicy?: 'answer_or_reviewed_not_applicable';
  /** SES: fixed fields carry one cell; legacy "additional cells" tables carry editable ranges. */
  officialTemplate?: { sheet: string; editableRanges: string[]; cell?: string; fixed?: true };
  sesFixed?: { englishLabel: string; englishContext: string; valueKind: 'number' | 'select' | 'text'; templateValue: string | number | boolean | null };
  /** Hidden (and not required) while the controlling field's answer is one of notIn. */
  showWhen?: { fieldId: string; notIn: string[] };
};

export type System = {
  id: string;
  label: string;
  department: string;
  electricalDomain: string;
  interfaces: string[];
  fields: Field[];
  ownershipStatus?: string;
  collectionRoutingStatus?: string;
  sourceOfficialSectionCandidates?: string[];
};

export type Example = {
  id: string;
  title: string;
  image: string;
  caption: string;
  explanation: string;
  limitations: string;
  bundleImagePath: string;
  sourceTitle: string;
  sourcePage?: number | null;
  personNamesVisible: boolean;
};

export type CoverageEntry = {
  id: string;
  label: string;
  official: OfficialRef;
  section: string;
  sectionId: string;
  systemId: string | null;
  disposition: string;
  ownershipStatus: string;
  collectionRoutingStatus: string;
  routingTeam: string;
  privateContact: boolean;
  exampleStatus: string;
  inputSchema: Record<string, unknown>;
  requiredStatus: string;
  sourceTemplateCaution: string;
  fieldId?: string;
  columnId?: string;
  sourceRecordKey?: string | null;
};

export const schemaVersion = 'BIU-ELECTRICAL-COLLECTION-2027-1.0.0';
export const systems = systemData as unknown as System[];
export const examples = exampleData as unknown as Example[];
export const coordinatorQueue = coordinatorData as unknown as Field[];
export const sourceSummary = summaryData;
export const coverage = {
  ...coverageData,
  entries: coverageData.entries as unknown as CoverageEntry[],
};
export const sharedRecordDefinitions = sharedData;

// Show the template unit on audited numeric questions that the registry left unit-less
// (QA-01). The stored answers and field IDs are unchanged.
for (const target of numericTargets) {
  for (const field of [...systems.flatMap((system) => system.fields), ...coordinatorQueue]) {
    if (field.id === target.controlId && !field.unit) field.unit = target.inputUnit;
  }
}

// SES: one fixed field per single-value input cell, followed by the sheet's legacy
// "additional cells" table (large areas not yet mapped) and its evidence field. Each
// official sheet becomes its own chapter. Legacy field IDs and saved answers are unchanged.
{
  const ses = systems.find(system => system.id === 'SES');
  if (ses) {
    const legacy = ses.fields;
    const sheets = [...new Set(legacy.map(field => field.officialTemplate?.sheet).filter((sheet): sheet is string => !!sheet))];
    const fixedBySheet = new Map<string, Field[]>();
    for (const field of sesFixedFields as unknown as Field[]) {
      const list = fixedBySheet.get(field.officialTemplate!.sheet) ?? [];
      list.push(field); fixedBySheet.set(field.officialTemplate!.sheet, list);
    }
    const ordered: Field[] = [];
    for (const sheet of sheets) {
      const fixed = fixedBySheet.get(sheet) ?? [];
      ordered.push(...fixed);
      for (const field of legacy.filter(item => item.officialTemplate?.sheet === sheet)) {
        const relabeled = fixed.length && field.kind === 'table'
          ? { required: false as unknown as true, label: `${sesSheetTitle(sheet)} — תאים נוספים (כתובת ידנית, לא חובה)`, prompt: `השאלות הקבועות בפרק הזה כבר נכתבות לתאים שלהן. כאן מזינים רק תאים באזורים הגדולים שעדיין אין להם שאלה (טבלאות ונתוני בדיקה). כתובת של תא שיש לו שאלה קבועה נחסמת בייצוא. ${field.prompt}` }
          : {};
        ordered.push({ ...field, ...relabeled, section: sesSheetTitle(sheet) });
      }
    }
    ordered.push(...legacy.filter(field => !field.officialTemplate?.sheet));
    ses.fields = ordered;
  }
}

/** Administrative route, deliberately excluded from the 21-system map/count. */
export const coordinatorSystem: System = {
  id: 'COORDINATOR',
  label: 'ריכוז מסמכים ושדות משותפים',
  department: 'COORDINATOR',
  electricalDomain: 'Shared documentation',
  interfaces: [],
  fields: coordinatorQueue,
  ownershipStatus: 'document_coordinator',
};

/** Owner routing is intentionally separate from optional navigation groups. */
export const departments = [
  { id: 'MECHANICS', label: 'מכאניקה — SES' },
  { id: 'LV', label: 'מתח נמוך' },
  { id: 'HV', label: 'מתח גבוה' },
  { id: 'DRIVE', label: 'מנוע ואינוורטר' },
  { id: 'LV_HV', label: 'ממשקים ואינטגרציה' },
];

export function getSystem(id: string): System | undefined {
  if (id === 'COORDINATOR') return coordinatorSystem;
  return systems.find((system) => system.id === id);
}

export function getFields(id: string): Field[] {
  return getSystem(id)?.fields ?? [];
}

export function getExample(id: string): Example | undefined {
  return examples.find((example) => example.id === id);
}

export function getField(systemId: string, fieldId: string): Field | undefined {
  return getFields(systemId).find((field) => field.id === fieldId);
}

/** Both directions preserve all official input IDs, including restricted metadata. */
export function getOfficialCoverage(fieldId: string, systemId?: string): CoverageEntry[] {
  return coverage.entries.filter((entry) => entry.fieldId === fieldId && (!systemId || entry.systemId === systemId));
}
