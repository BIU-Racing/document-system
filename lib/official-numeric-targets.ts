/**
 * Template-verified numeric targets (QA audit 2026-11, defects QA-01 and QA-02).
 *
 * The source registry classifies these controls as free text (`text_with_source`), but the
 * official template compares the cell numerically (e.g. `IF(D14 < 90, ...)`). Excel treats any
 * text as greater than any number, so writing "80" as text made the precharge check show OK.
 * Each entry below was checked against the immutable template: the unit label cell and the
 * formula that reads the cell are recorded so tests can re-verify them from the template XML.
 *
 * Only controls listed here (plus controls already typed `number_with_unit_and_source`) are
 * written as numbers. Nothing else is converted, so identifiers and part numbers stay text.
 * Stored answers are never rewritten; conversion happens once, at workbook build time.
 */
export type NumericTarget = {
  controlId: string;
  document: 'ESF' | 'ASES';
  sheet: string;
  cell: string;
  /** Unit the official template expects in the cell (read from `unitCell`). */
  templateUnit: string;
  /** Template cell that holds the unit label, or null when the quantity is a plain count. */
  unitCell: string | null;
  /** Template formula cell whose result depends on a numeric comparison of this cell. */
  checkCell: string;
  /** Unit the app asks the user for. Differs from templateUnit only when `convert` is set. */
  inputUnit: string;
  /** Multiplier from the stored answer (inputUnit) to templateUnit. Default 1. */
  factor?: number;
  /** Only '%' is accepted, and only on percentage targets. All other unit text is rejected. */
  allowPercentSign?: boolean;
  integer?: boolean;
  min?: number;
  max?: number;
};

export const numericTargets: readonly NumericTarget[] = [
  { controlId: 'LC-ESF-S04-O12', document: 'ESF', sheet: 'Accumulator', cell: 'O12', templateUnit: 'V', unitCell: 'P12', checkCell: 'Q12', inputUnit: 'V', min: 0 },
  { controlId: 'LC-ESF-S04-O13', document: 'ESF', sheet: 'Accumulator', cell: 'O13', templateUnit: 'V', unitCell: 'P13', checkCell: 'Q13', inputUnit: 'V', min: 0 },
  { controlId: 'LC-ESF-S04-O24', document: 'ESF', sheet: 'Accumulator', cell: 'O24', templateUnit: 'mm', unitCell: 'P24', checkCell: 'Q24', inputUnit: 'mm', min: 0 },
  { controlId: 'LC-ESF-S05-D14', document: 'ESF', sheet: 'PrechargeDischarge', cell: 'D14', templateUnit: '%', unitCell: 'E14', checkCell: 'F14', inputUnit: '%', allowPercentSign: true, min: 0, max: 100 },
  { controlId: 'LC-ESF-S07-D5', document: 'ESF', sheet: 'Shutdown Circuit', cell: 'D5', templateUnit: 'kΩ', unitCell: 'E5', checkCell: 'F5', inputUnit: 'kΩ', min: 0 },
  { controlId: 'LC-ESF-S07-K6', document: 'ESF', sheet: 'Shutdown Circuit', cell: 'K6', templateUnit: 'A', unitCell: 'L6', checkCell: 'M6', inputUnit: 'A', min: 0 },
  { controlId: 'LC-ESF-S09-D6', document: 'ESF', sheet: 'Other', cell: 'D6', templateUnit: 'V', unitCell: 'E6', checkCell: 'F6', inputUnit: 'V', min: 0 },
  // QA-02: the app has always asked for watts ("רשמו את הערך ביחידות W"), so saved answers are
  // in W. The template cell is kW (Charging!E10). Convert once at export: 3000 -> 3.
  { controlId: 'LC-ESF-S06-D10', document: 'ESF', sheet: 'Charging', cell: 'D10', templateUnit: 'kW', unitCell: 'E10', checkCell: 'F10', inputUnit: 'W', factor: 0.001, min: 0 },
  ...(['sidex', 'rearx'] as const).flatMap((tab, i) => (['E', 'F', 'G'] as const).map(column => ({
    controlId: `LC-ASES-S0${6 + i}-${column}14`, document: 'ASES' as const, sheet: `EV5.5.1&2 EV4.4 ACPS TSPS ${tab}`, cell: `${column}14`,
    templateUnit: 'count', unitCell: null, checkCell: `${column}18`, inputUnit: 'count', integer: true, min: 0,
  }))),
];

/**
 * Literal words the template itself asks for inside a numeric column. Datasheets!H55 reads
 * 'Heatsink [°C/W] (Enter "None" if no heatsink)', and the row check N56 counts blanks, so a
 * missing value (the old behaviour for "None") made a complete row show WARNING.
 */
export const numericLiteralAlternatives: Readonly<Record<string, readonly string[]>> = {
  'LC-ESF-Datasheets-resistors-H': ['None'],
};

export const numericTargetById = new Map(numericTargets.map(target => [target.controlId, target]));

export type NumericParse = { ok: true; value: string } | { ok: false; reason: 'not_a_number' | 'range' | 'integer' };

const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
/**
 * Strict parser, as before: no unit text ("20 Ah" is rejected), no locale guessing ("3,5" and
 * "1,000" are rejected), no formulas. The only exception is a trailing "%" on a percentage
 * target. Conversion (`factor`) is applied here exactly once; stored answers are never changed.
 */
export function parseNumericAnswer(raw: string, target?: NumericTarget): NumericParse {
  let text = raw.replace(/[\u00a0\u202f]/g, ' ').replace(/\u2212/g, '-').trim();
  if (target?.allowPercentSign) text = text.replace(/\s*%$/, '');
  if (!NUMBER.test(text) || text.replace(/[^\d]/g, '').length > 15) return { ok: false, reason: 'not_a_number' };
  const source = Number(text);
  if (!Number.isFinite(source)) return { ok: false, reason: 'not_a_number' };
  const factor = target?.factor ?? 1;
  const value = factor === 1 ? source : Number((source * factor).toPrecision(15));
  if (target?.integer && !Number.isInteger(value)) return { ok: false, reason: 'integer' };
  if (target?.min !== undefined && value < target.min) return { ok: false, reason: 'range' };
  if (target?.max !== undefined && value > target.max) return { ok: false, reason: 'range' };
  return { ok: true, value: String(value) };
}
