/**
 * Which team fills each official ESF field. The source registry put most ESF tabs under the
 * document coordinator; here they move to the team that owns the system, so every team finds
 * its own form questions in its own system. Overview, Datasheets and the ASES cover pages stay
 * with the coordinator. Field IDs and cells are unchanged; only the owning system changes.
 * Pure and dependency-free (tests/field-routing.test.mjs checks it against the coverage map).
 */

/** ESF tab -> owning system, for fields the source registry gave to the coordinator. */
export const ESF_TAB_OWNER: Record<string, string> = {
  'TS Schematics': 'INTEGRATION',
  Accumulator: 'ACCUMULATOR',
  PrechargeDischarge: 'PRECHARGE',
  Charging: 'CHARGER',
  'Torque Security': 'DRIVE',
  Other: 'DRIVE',
};

/** Field-ID prefix of each moved ESF tab. */
const PREFIX_TAB: [RegExp, string][] = [
  [/^LC-ESF-S03-/, 'TS Schematics'],
  [/^LC-ESF-(S04-|Accumulator-)/, 'Accumulator'],
  [/^LC-ESF-S05-/, 'PrechargeDischarge'],
  [/^LC-ESF-S06-/, 'Charging'],
  [/^CARD-FG-ESF-TOR-/, 'Torque Security'],
  [/^LC-ESF-S09-/, 'Other'],
];

/** PrechargeDischarge columns: D precharge (default), J discharge, P measuring points (TSMP). */
const PRECHARGE_COLUMN_OWNER: Record<string, string> = { J: 'DISCHARGE', P: 'INTEGRATION' };

/** The team that owns a field the source registry listed under the coordinator. */
export function coordinatorFieldOwner(fieldId: string): string {
  const tab = PREFIX_TAB.find(([pattern]) => pattern.test(fieldId))?.[1];
  if (!tab) return 'COORDINATOR';
  if (tab === 'PrechargeDischarge') return PRECHARGE_COLUMN_OWNER[/^LC-ESF-S05-([A-Z]+)\d/.exec(fieldId)?.[1] ?? ''] ?? ESF_TAB_OWNER[tab];
  return ESF_TAB_OWNER[tab];
}
