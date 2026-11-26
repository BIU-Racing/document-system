/**
 * "Where will this answer be written?" for one field of the app.
 *
 * Built from the same coverage entries the exporter uses (data/coverage.normalized.json),
 * so the screen and the downloaded workbook cannot disagree. The decision of whether an
 * entry is written automatically mirrors buildOfficialWorkbook; a test compares the two
 * for every entry (tests/official-location.test.mjs).
 *
 * Pure and client-safe: no catalog import, no workbook parsing.
 * Based on the field-location work started on feature/field-cell-location.
 */
export type OfficialDocumentKind = 'esf' | 'ases' | 'ses';

/** auto: written by the export. evidence/manual/restricted: listed, never written automatically. */
export type DestinationMode = 'auto' | 'evidence' | 'manual' | 'restricted';

export type LocationEntry = {
  id: string;
  official: { document: string; sheet: string; ranges: string[] };
  systemId: string | null;
  fieldId?: string;
  columnId?: string;
  privateContact?: boolean;
  inputSchema?: Record<string, unknown>;
};

export type LocationColumn = { id: string; label: string; kind?: string; sourceInputSchema?: Record<string, unknown> };
export type LocationField = {
  id: string;
  kind: string;
  columns?: LocationColumn[];
  needsClarification?: boolean;
  recordKeys?: string[];
  sourceInputSchema?: Record<string, unknown>;
  officialTemplate?: { sheet: string; editableRanges: string[]; cell?: string; fixed?: boolean };
};

export type Destination = {
  controlId: string;
  document: string;
  kind: OfficialDocumentKind | null;
  sheet: string;
  ranges: string[];
  columnLabel?: string;
  mode: DestinationMode;
  href: string | null;
};

export type FieldDestinations =
  | { type: 'cells'; destinations: Destination[] }
  | { type: 'chosen_cell'; document: 'SES'; sheet: string; ranges: string[]; href: string | null }
  | { type: 'none' };

const RANGE = /^[A-Z]{1,3}[1-9]\d*(?::[A-Z]{1,3}[1-9]\d*)?$/;

function documentKind(document: string): OfficialDocumentKind | null {
  const kind = document.trim().toLowerCase();
  return kind === 'esf' || kind === 'ases' || kind === 'ses' ? kind : null;
}

export function documentHref(kind: OfficialDocumentKind, sheet: string, range?: string) {
  const query = new URLSearchParams({ sheet });
  if (range) query.set('cell', range);
  return `/documents/${kind}?${query.toString()}`;
}

function point(ref: string) {
  const match = /^([A-Z]{1,3})([1-9]\d*)$/.exec(ref);
  if (!match) return null;
  let column = 0;
  for (const letter of match[1]) column = column * 26 + letter.charCodeAt(0) - 64;
  return { row: Number(match[2]), column };
}

/** Number of single cells in the ranges, or null when a range is malformed. */
function cellCount(ranges: readonly string[]) {
  let count = 0;
  for (const range of ranges) {
    if (!RANGE.test(range)) return null;
    const [from, to = from] = range.split(':').map(point);
    if (!from || !to || to.row < from.row || to.column < from.column) return null;
    count += (to.row - from.row + 1) * (to.column - from.column + 1);
  }
  return count;
}

function singleColumn(ranges: readonly string[]) {
  const columns = new Set<number>();
  let lastRow = 0;
  for (const range of ranges) {
    const [from, to = from] = range.split(':').map(point);
    if (!from || !to || from.column !== to.column || from.row <= lastRow) return false;
    columns.add(from.column);
    lastRow = to.row;
  }
  return columns.size === 1;
}

/** Mirrors the exporter's decision for one entry. Template lock checks happen at export time. */
export function destinationMode(entry: LocationEntry, field: LocationField | undefined): DestinationMode {
  if (entry.privateContact) return 'restricted';
  const column = field?.columns?.find(item => item.id === entry.columnId);
  if (!field || (entry.columnId && !column)) return 'manual';
  const schema = { ...entry.inputSchema, ...(column?.sourceInputSchema ?? field.sourceInputSchema ?? {}) } as Record<string, unknown>;
  const manualReview = !!(entry.inputSchema?.manual_review_before_source_export || schema.manual_review_before_source_export);
  if ((column?.kind ?? field.kind) === 'file' || schema.type === 'file_upload_with_caption') return 'evidence';
  if (manualReview || field.needsClarification || schema.type === 'linked_record_picker') return 'manual';
  const cells = cellCount(entry.official.ranges);
  if (!cells) return 'manual';
  if (field.kind !== 'table' && (cells !== 1 || schema.type === 'repeating_table_column')) return 'manual';
  if (!entry.columnId && field.kind === 'table') return 'manual';
  if (entry.columnId) {
    if (field.kind !== 'table') return 'manual';
    // One cell per record slot, or one vertical run of cells (one row per table row).
    if ((field.recordKeys?.length ?? 0) > 1) return cells === 1 ? 'auto' : 'manual';
    if (!singleColumn(entry.official.ranges)) return 'manual';
  }
  return 'auto';
}

/** Entries that belong to this field (coordinator fields have systemId null in the registry). */
export function entriesForField(entries: readonly LocationEntry[], systemId: string, fieldId: string) {
  return entries.filter(entry => entry.fieldId === fieldId && (entry.systemId ?? (entry.privateContact ? null : 'COORDINATOR')) === systemId);
}

export function fieldDestinations(systemId: string, field: LocationField, entries: readonly LocationEntry[]): FieldDestinations {
  if (systemId === 'SES') {
    const template = field.officialTemplate;
    if (!template?.sheet) return { type: 'none' };
    if (template.fixed && template.cell) return { type: 'cells', destinations: [{ controlId: field.id, document: 'SES', kind: 'ses', sheet: template.sheet, ranges: [template.cell], mode: 'auto', href: documentHref('ses', template.sheet, template.cell) }] };
    if (field.kind === 'file') return { type: 'cells', destinations: [{ controlId: field.id, document: 'SES', kind: 'ses', sheet: template.sheet, ranges: [], mode: 'evidence', href: documentHref('ses', template.sheet) }] };
    return { type: 'chosen_cell', document: 'SES', sheet: template.sheet, ranges: template.editableRanges ?? [], href: documentHref('ses', template.sheet) };
  }
  const own = entriesForField(entries, systemId, field.id);
  if (!own.length) return { type: 'none' };
  const destinations = own.map(entry => {
    const kind = documentKind(entry.official.document);
    const ranges = entry.official.ranges.filter(range => RANGE.test(range));
    return {
      controlId: entry.id,
      document: entry.official.document.toUpperCase(),
      kind,
      sheet: entry.official.sheet,
      ranges,
      columnLabel: entry.columnId ? field.columns?.find(column => column.id === entry.columnId)?.label : undefined,
      mode: destinationMode(entry, field),
      href: kind ? documentHref(kind, entry.official.sheet, ranges[0]) : null,
    };
  });
  return { type: 'cells', destinations };
}

/** "D15", "A5, R5, AI5" or "A5, R5, AI5 ועוד 5". */
export function formatRanges(ranges: readonly string[], visible = 3) {
  if (!ranges.length) return '';
  const shown = ranges.slice(0, visible).join(', ');
  return ranges.length > visible ? `${shown} ועוד ${ranges.length - visible}` : shown;
}

/** Parses "D15" or "A4:O177" into 1-based bounds; null for anything else. */
export function rangeBounds(range: string) {
  if (!RANGE.test(range)) return null;
  const [from, to = from] = range.split(':').map(point);
  if (!from || !to || to.row < from.row || to.column < from.column) return null;
  return { row: from.row, column: from.column, rowSpan: to.row - from.row + 1, colSpan: to.column - from.column + 1 };
}
