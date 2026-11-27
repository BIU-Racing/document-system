/**
 * Pre-export readiness check for the official workbooks (ESF / ASES / SES).
 *
 * Pure and dependency-free: it only reads the export report that
 * buildOfficialWorkbook already produces, plus the saved answers for the
 * "not applicable without a reason" rule. It never changes answers or cells.
 *
 * A document is "validated" only when nothing blocks it. Passing software
 * checks is not engineering approval, so unreviewed fields, unapproved machine
 * translation and an unverified SES mapping all block validation. The bundled
 * Italy templates are the official submission templates (team decision, 27.11.2026).
 */
import type { OfficialFieldResult, OfficialWorkbookKind, OfficialWorkbookReport } from './official-workbooks';
import type { Answers } from './progress';

export type ReadinessLevel = 'blocker' | 'warning';

export type ReadinessReason =
  | 'missing'
  | 'unknown'
  | 'invalid_value'
  | 'translation_pending'
  | 'translation_failed'
  | 'source_mismatch'
  | 'overflow'
  | 'mapping_unresolved'
  | 'engineering_review'
  | 'source_review'
  | 'translation_approval'
  | 'evidence_placement'
  | 'not_applicable_reason'
  | 'restricted_manual'
  | 'manual_cell_address';

export type DocumentBlockerCode = 'partial_scope';

export type ReadinessIssue = {
  /** Stable key: one entry per saved field (table columns are merged). */
  key: string;
  level: ReadinessLevel;
  reasons: ReadinessReason[];
  systemId: string | null;
  systemLabel: string;
  fieldId?: string;
  fieldLabel: string;
  section?: string;
  sheet: string;
  ranges: string[];
  controlIds: string[];
};

export type ReadinessSystemSummary = {
  systemId: string;
  systemLabel: string;
  total: number;
  ready: number;
  blockers: number;
  warnings: number;
};

/** A 2027 rule check that is violated (red) or needs a decision (amber). Warnings only. */
export type RuleWarning = { checkId: string; rule: string; page: number; status: 'violation' | 'notice'; message: string; systemId: string; fieldId: string; rowId?: string; systemLabel: string; fieldLabel: string };

export type DocumentReadiness = {
  kind: OfficialWorkbookKind;
  /** Filled by the document route from lib/rule-checks.ts; never affects ready/state. */
  ruleWarnings?: RuleWarning[];
  state: 'validated' | 'draft';
  ready: boolean;
  totals: { items: number; ready: number; blockers: number; warnings: number };
  documentBlockers: { code: DocumentBlockerCode; count?: number }[];
  systems: ReadinessSystemSummary[];
  issues: ReadinessIssue[];
};

export type ReadinessLabels = {
  system(systemId: string): string | undefined;
  field(systemId: string, fieldId: string): { label: string; section?: string; optional?: boolean; manualAddress?: boolean } | undefined;
};

export type ReadinessInput = {
  report: OfficialWorkbookReport;
  /** Saved answers per system, used for the N/A reason rule. */
  answers?: Record<string, Answers | undefined>;
  /** False when the caller could not see every system that feeds the document. */
  completeScope: boolean;
  labels?: ReadinessLabels;
};

/** Reasons in the order they are shown; the first ones are the most actionable. */
export const reasonOrder: ReadinessReason[] = [
  'missing', 'unknown', 'invalid_value', 'overflow', 'source_mismatch',
  'translation_failed', 'translation_pending', 'source_review', 'engineering_review',
  'translation_approval', 'manual_cell_address', 'mapping_unresolved', 'not_applicable_reason', 'evidence_placement', 'restricted_manual',
];

const warningReasons = new Set<ReadinessReason>(['evidence_placement', 'not_applicable_reason', 'restricted_manual']);

/** Reasons that need the person who fills the field (rather than review or development). */
export const actionableReasons = new Set<ReadinessReason>([
  'missing', 'unknown', 'invalid_value', 'overflow', 'source_mismatch', 'not_applicable_reason', 'source_review',
]);

/**
 * Review flags exist only when a saved answer exists. They are not reported for
 * answers that are still empty or explicitly unknown: those must be completed first.
 */
const reviewIrrelevant = new Set<OfficialFieldResult['status']>(['empty', 'unknown', 'out_of_scope', 'condition_hidden']);

/** Classifies one mapped control. Returns an empty list when it is ready. */
export function controlReasons(field: OfficialFieldResult, answers?: Answers): ReadinessReason[] {
  const reasons: ReadinessReason[] = [];
  switch (field.status) {
    case 'empty': reasons.push('missing'); break;
    case 'unknown': reasons.push('unknown'); break;
    case 'invalid_value': reasons.push('invalid_value'); break;
    case 'overflow': reasons.push('overflow'); break;
    case 'source_conflict': reasons.push('source_mismatch'); break;
    case 'translation_pending': reasons.push('translation_pending'); break;
    case 'translation_failed': reasons.push('translation_failed'); break;
    case 'manual_mapping':
    case 'protected': reasons.push('mapping_unresolved'); break;
    case 'evidence_required': reasons.push('evidence_placement'); break;
    case 'restricted': reasons.push('restricted_manual'); break;
    case 'not_applicable': {
      const answer = field.fieldId ? answers?.[field.fieldId] : undefined;
      if (!answer?.reason?.trim()) reasons.push('not_applicable_reason');
      break;
    }
    case 'written':
    case 'out_of_scope':
    case 'condition_hidden':
      break;
  }
  if (!reviewIrrelevant.has(field.status)) {
    if (field.sourceReviewPending) reasons.push('source_review');
    if (field.engineeringReviewed === false) reasons.push('engineering_review');
  }
  if (field.status === 'written' && field.machineTranslated && !field.translationApproved) reasons.push('translation_approval');
  return reasons;
}

function sortReasons(reasons: Iterable<ReadinessReason>): ReadinessReason[] {
  return [...new Set(reasons)].sort((a, b) => reasonOrder.indexOf(a) - reasonOrder.indexOf(b));
}

export function levelFor(reasons: ReadinessReason[]): ReadinessLevel {
  return reasons.some(reason => !warningReasons.has(reason)) ? 'blocker' : 'warning';
}

export function computeReadiness(input: ReadinessInput): DocumentReadiness {
  const { report, labels } = input;
  const issues = new Map<string, ReadinessIssue>();
  const itemKeys = new Set<string>();
  let outOfScope = 0;

  for (const field of report.fields) {
    const key = field.systemId && field.fieldId ? `${field.systemId}:${field.fieldId}` : `control:${field.controlId}`;
    if (field.status === 'out_of_scope') { outOfScope++; continue; }
    if (field.status === 'condition_hidden') continue;
    itemKeys.add(key);
    const meta0 = field.systemId && field.fieldId ? labels?.field(field.systemId, field.fieldId) : undefined;
    // Optional "additional cells" tables (SES) are not required when left empty.
    if (meta0?.optional && field.status === 'empty') { itemKeys.delete(key); continue; }
    const reasons = controlReasons(field, field.systemId ? input.answers?.[field.systemId] : undefined);
    // A typed cell address is not a verified mapping: written manual SES rows need a check.
    if (meta0?.manualAddress && field.status === 'written') reasons.push('manual_cell_address');
    if (!reasons.length) continue;
    const existing = issues.get(key);
    if (existing) {
      existing.reasons = sortReasons([...existing.reasons, ...reasons]);
      existing.level = levelFor(existing.reasons);
      existing.controlIds.push(field.controlId);
      for (const range of field.ranges) if (!existing.ranges.includes(range)) existing.ranges.push(range);
      continue;
    }
    const meta = field.systemId && field.fieldId ? labels?.field(field.systemId, field.fieldId) : undefined;
    const sorted = sortReasons(reasons);
    issues.set(key, {
      key,
      level: levelFor(sorted),
      reasons: sorted,
      systemId: field.systemId,
      systemLabel: field.systemId ? labels?.system(field.systemId) ?? field.systemId : '',
      fieldId: field.fieldId,
      fieldLabel: meta?.label ?? field.fieldId ?? field.controlId,
      section: meta?.section,
      sheet: field.sheet,
      ranges: [...field.ranges],
      controlIds: [field.controlId],
    });
  }

  const documentBlockers: DocumentReadiness['documentBlockers'] = [];
  if (!input.completeScope || outOfScope > 0) documentBlockers.push({ code: 'partial_scope', ...(outOfScope ? { count: outOfScope } : {}) });

  const list = [...issues.values()].sort((a, b) =>
    (a.level === b.level ? 0 : a.level === 'blocker' ? -1 : 1) ||
    (a.systemLabel || '').localeCompare(b.systemLabel || '', 'he') ||
    (a.section || '').localeCompare(b.section || '', 'he'));

  const systems = new Map<string, ReadinessSystemSummary>();
  for (const key of itemKeys) {
    const issue = issues.get(key);
    const systemId = issue?.systemId ?? (key.startsWith('control:') ? '' : key.slice(0, key.indexOf(':')));
    const summary = systems.get(systemId) ?? {
      systemId,
      systemLabel: systemId ? labels?.system(systemId) ?? systemId : '',
      total: 0, ready: 0, blockers: 0, warnings: 0,
    };
    summary.total++;
    if (!issue) summary.ready++;
    else if (issue.level === 'blocker') summary.blockers++;
    else summary.warnings++;
    systems.set(systemId, summary);
  }

  const blockers = list.filter(issue => issue.level === 'blocker').length;
  const warnings = list.length - blockers;
  const ready = blockers === 0 && documentBlockers.length === 0;
  return {
    kind: report.kind,
    state: ready ? 'validated' : 'draft',
    ready,
    totals: { items: itemKeys.size, ready: itemKeys.size - list.length, blockers, warnings },
    documentBlockers,
    systems: [...systems.values()].sort((a, b) => b.blockers - a.blockers || a.systemLabel.localeCompare(b.systemLabel, 'he')),
    issues: list,
  };
}

/** Download name: the existing WORKING_DRAFT marker is replaced only when validated. */
export function readinessFilename(filename: string, readiness: Pick<DocumentReadiness, 'ready'>): string {
  return readiness.ready ? filename.replace('_WORKING_DRAFT_', '_VALIDATED_') : filename;
}
