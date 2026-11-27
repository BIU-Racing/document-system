/** Small, generated navigation catalog. Full form schemas load with the editor. */
import overviewData from '@/data/systems.overview.json';

export type OverviewField={id:string;label:string};
export type OverviewSystem={
 id:string;
 label:string;
 department:string;
 electricalDomain:string;
 interfaces:string[];
 fields:OverviewField[];
};

export const systems:OverviewSystem[]=overviewData;

export type OfficialDocument='ESF'|'ASES'|'SES';
/**
 * Which official documents each team fills (home page guide). Kept small for the home page;
 * tests/home-form-guide.test.mjs checks it against the full catalog (systemDocuments).
 */
export const systemForms:Record<string,OfficialDocument[]>={
 TSAL:['ESF'],SDC:['ESF'],BSPD:['ESF'],IMD:['ESF'],BMS:['ESF'],PRECHARGE:['ESF'],DISCHARGE:['ESF'],INTEGRATION:['ESF'],CHARGER:['ESF'],DRIVE:['ESF'],
 ACCUMULATOR:['ESF','ASES'],SES:['SES'],COORDINATOR:['ESF','ASES'],
 PDU:[],DASHBOARD:[],BRAKE_LIGHT:[],RTD:[],LVMS:[],TSMS:[],LV_BATTERY:[],AIR:[],HVD:[],HV_CONNECTORS:[],
};
/** Team names that fill a document, in the order of the system map, with the coordinator last. */
export function documentTeams(document:OfficialDocument):string[]{
 return [...systems.filter(system=>systemForms[system.id]?.includes(document)).map(system=>system.label),...(systemForms.COORDINATOR.includes(document)?['ריכוז מסמכים']:[])];
}
