/**
 * Fill-in chapters follow the tabs of the official Excel files, so a person who knows the
 * workbook finds each question under the tab it is written to. Display only: field IDs,
 * saved answers and the cell mapping are unchanged.
 */

/** Official tabs in workbook order, with the Hebrew chapter title shown in the app. */
export const SHEET_CHAPTERS: Record<'ESF' | 'ASES', [sheet: string, title: string][]> = {
  ESF: [
    ['Overview', 'סקירה ופרטי התיק'],
    ['Datasheets', 'דפי יצרן ורכיבים'],
    ['TS Schematics', 'סכמות מערכת ההנעה'],
    ['Accumulator', 'הסוללה, התאים והבידוד'],
    ['PrechargeDischarge', 'טעינה מוקדמת ופריקה'],
    ['Charging', 'טעינת הסוללה'],
    ['Shutdown Circuit', 'שרשרת הניתוק'],
    ['Torque Security', 'בטיחות דרישת המומנט'],
    ['Other', 'ממירים, מנועים ומד האנרגיה'],
  ],
  ASES: [
    ['Read_Me', 'הוראות התבנית'],
    ['Version History', 'היסטוריית גרסאות'],
    ['Rules Clarifications', 'הבהרות תקנון'],
    ['Cover Sheet', 'דף שער ופרטי הקבוצה'],
    ['Accumulator Pics', 'תמונות המארז ושכבות הדפנות'],
    ['EV5.5.1&2 EV4.4 ACPS TSPS sidex', 'הגנת המארז מהצד'],
    ['EV5.5.1&2 EV4.4 ACPS TSPS rearx', 'הגנת המארז מאחור'],
    ['EV5.5.5 Alt. Matls Summary', 'סיכום חומרים חלופיים'],
    ['EV5.5.5 Alt. Matl - 3pt Bending', 'בדיקות כפיפה בשלוש נקודות'],
    ['EV5.5.5 Alt. Matl - Shear', 'בדיקות ניקוב וגזירה'],
    ['Datasheets Fiber', 'דפי נתונים: סיבים'],
    ['Datasheets Other Matl', 'דפי נתונים: חומרים אחרים'],
    ['Datasheets Glue', 'דפי נתונים: דבקים'],
    ['Materials Overview', 'סקירת החומרים'],
    ['EV5.5.10-12 Cell Fixation', 'קיבוע התאים'],
    ['EV5.5.9 Segment', 'מקטעי הסוללה'],
    ['EV5.5.9 TSAC', 'מארז הסוללה'],
    ['EV5.5.9 TSAC attachments', 'חיבורי המארז לשלדה'],
    ['EV5.5.13 Fasteners', 'מחברים מכאניים'],
    ['EV5.5.14-17 Openings&Separation', 'פתחים והפרדה'],
    ['Additional Info', 'מידע נוסף'],
  ],
};

type Located = { document: string; sheet: string };
type ChapterField = { id: string; section: string; sheetTab?: string };

const order = new Map<string, { rank: number; title: string }>();
(['ESF', 'ASES'] as const).forEach((document, d) =>
  SHEET_CHAPTERS[document].forEach(([sheet, title], s) => order.set(`${document}:${sheet}`, { rank: d * 100 + s, title })));

/**
 * Regroups a system's fields in place: chapters without an Excel tab first (as they were),
 * then one chapter per tab in workbook order. Field order inside a chapter is kept.
 */
export function groupFieldsBySheet<T extends ChapterField>(fields: T[], locate: (fieldId: string) => Located | undefined): T[] {
  const general: T[] = [];
  const bySheet = new Map<number, T[]>();
  for (const field of fields) {
    const where = locate(field.id);
    const known = where && order.get(`${where.document}:${where.sheet}`);
    if (!where || !known) { general.push(field); continue; }
    field.section = known.title;
    field.sheetTab = `${where.document} › ${where.sheet}`;
    const list = bySheet.get(known.rank) ?? [];
    list.push(field); bySheet.set(known.rank, list);
  }
  const grouped = [...bySheet.entries()].sort((a, b) => a[0] - b[0]).flatMap(([, list]) => list);
  fields.splice(0, fields.length, ...general, ...grouped);
  return fields;
}
