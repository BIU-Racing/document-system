/**
 * Groups of single-cell questions that form one table in the official workbook. The fill-in
 * screen shows each group as a table, like the Excel sheet, instead of a card per cell.
 * Display only: every cell is still its own field with its own answer, review and mapping.
 */
import { coverage, getFields, type Field } from './catalog';

type GridDefinition = {
  id: string;
  systemId: string;
  sheet: string;
  title: string;
  /** Column headings, in the order of each row's cells. */
  columns: string[];
  /** One row per property; `cells` lists the workbook cell of each column (null when absent). */
  rows: { label?: string; cells: (string | null)[] }[];
};

const across = (columns: string[], row: number) => columns.map(column => `${column}${row}`);
const panels = ['רצפה', 'דפנות חיצוניות', 'מחיצות פנימיות', 'מכסה'];
const tubes = ['צינור 1', 'צינור 2', 'צינור 3'];
const acps = (side: 'sidex' | 'rearx', title: string): GridDefinition => ({
  id: `ases-acps-${side}`, systemId: 'ACCUMULATOR', sheet: `EV5.5.1&2 EV4.4 ACPS TSPS ${side}`, title, columns: tubes,
  rows: [5, 6, 14, 15, 16].map(row => ({ cells: across(['E', 'F', 'G'], row) })),
});

export const GRID_DEFINITIONS: GridDefinition[] = [
  {
    id: 'ases-pics-laminate', systemId: 'ACCUMULATOR', sheet: 'Accumulator Pics', title: 'שכבות הלמינציה של המארז',
    columns: ['שכבות בצד החיצוני', 'חומר הליבה', 'שכבות בצד הפנימי', 'הוכחת דרישות הלמינציה'],
    rows: [[8, 'רצפה'], [9, 'דופן חיצונית'], [10, 'מחיצה פנימית'], [11, 'מכסה']].map(([row, label]) => ({ label: label as string, cells: across(['U', 'V', 'X', 'Z'], row as number) })),
  },
  acps('sidex', 'צינורות מבנה ההגנה מהצד'),
  acps('rearx', 'צינורות מבנה ההגנה מאחור'),
  {
    id: 'ases-bending', systemId: 'ACCUMULATOR', sheet: 'EV5.5.5 Alt. Matl - 3pt Bending', title: 'תוצאות בדיקות הכפיפה', columns: panels,
    rows: [
      { cells: across(['C', 'V', 'AO', 'BH'], 46) },
      { cells: across(['G', 'Z', 'AS', 'BL'], 46) },
      { cells: across(['C', 'V', 'AO', 'BH'], 47) },
      { cells: across(['G', 'Z', 'AS', 'BL'], 47) },
      ...[50, 53, 54, 55, 56, 57, 61].map(row => ({ cells: across(['C', 'V', 'AO', 'BH'], row) })),
    ],
  },
  {
    id: 'ases-shear', systemId: 'ACCUMULATOR', sheet: 'EV5.5.5 Alt. Matl - Shear', title: 'תוצאות בדיקות הגזירה', columns: panels,
    rows: [48, 49].map(row => ({ cells: across(['D', 'W', 'AP', 'BI'], row) })),
  },
];

export type GridCell = { fieldId: string; cell: string };
export type FieldGrid = {
  id: string; title: string; sheet: string; columns: string[];
  rows: { label: string; unit?: string; cells: (GridCell | null)[] }[];
  fieldIds: string[];
};

function resolve(definition: GridDefinition): FieldGrid {
  const at = new Map<string, string>();
  for (const entry of coverage.entries) {
    if (entry.systemId !== definition.systemId || !entry.fieldId || entry.columnId || entry.official.sheet !== definition.sheet || entry.official.ranges.length !== 1) continue;
    at.set(entry.official.ranges[0], entry.fieldId);
  }
  const fields = new Map(getFields(definition.systemId).map(field => [field.id, field] as const));
  const rows = definition.rows.map(row => {
    const cells = row.cells.map(cell => {
      const fieldId = cell ? at.get(cell) : undefined;
      return cell && fieldId && fields.has(fieldId) ? { fieldId, cell } : null;
    });
    const first = cells.find(Boolean) ? fields.get(cells.find(Boolean)!.fieldId) as Field : undefined;
    return { label: row.label ?? first?.label ?? '', ...(first?.unit ? { unit: first.unit } : {}), cells };
  });
  return {
    id: definition.id, title: definition.title, sheet: definition.sheet, columns: definition.columns, rows,
    fieldIds: rows.flatMap(row => row.cells.flatMap(cell => cell ? [cell.fieldId] : [])),
  };
}

const cache = new Map<string, FieldGrid[]>();
/** The resolved tables of one system; fields not listed here keep their regular card. */
export function gridsFor(systemId: string): FieldGrid[] {
  if (!cache.has(systemId)) cache.set(systemId, GRID_DEFINITIONS.filter(definition => definition.systemId === systemId).map(resolve));
  return cache.get(systemId)!;
}

/** "row — column" of one cell, e.g. "רצפה — חומר הליבה". */
export function gridCellLabel(grid: FieldGrid, fieldId: string): string {
  for (const row of grid.rows) {
    const index = row.cells.findIndex(cell => cell?.fieldId === fieldId);
    if (index >= 0) return `${row.label} — ${grid.columns[index]}`;
  }
  return '';
}
