import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const load = file => JSON.parse(fs.readFileSync(file,'utf8'));
const systems=load('data/systems.normalized.json');
const coordinator=load('data/coordinator.normalized.json');
const entries=load('data/coverage.normalized.json').entries;
const templates=load('private-data/official-workbook-templates.json');
const sesGuards=load('data/ses-export-guards.json');
const systemMap=new Map(systems.map(s=>[s.id,s]));
systemMap.set('COORDINATOR',{fields:coordinator});
const findings=[];
const summary={};
const field=(e)=>systemMap.get(e.systemId??'COORDINATOR')?.fields.find(f=>f.id===e.fieldId);
const pt=r=>{const m=/^([A-Z]{1,3})([1-9][0-9]*)$/.exec(r);if(!m)return null;let c=0;for(const v of m[1])c=c*26+v.charCodeAt(0)-64;return {c,r:Number(m[2])}};
const addr=(c,r)=>{let s='';while(c){c--;s=String.fromCharCode(65+c%26)+s;c=Math.floor(c/26)}return s+r;};
const expand=(ranges)=>{
 if(!Array.isArray(ranges)||!ranges.length)return null;
 const values=[];
 for(const range of ranges){
  const split=range.split(':');if(split.length>2)return null;
  const a=pt(split[0]),b=pt(split[1]??split[0]);
  if(!a||!b||a.r>b.r||a.c>b.c||(b.r-a.r+1)*(b.c-a.c+1)+values.length>2000)return null;
  for(let r=a.r;r<=b.r;r++)for(let c=a.c;c<=b.c;c++)values.push(addr(c,r));
 }
 return new Set(values).size===values.length?values:null;
};
const seenCells=new Map();
for(const kind of ['esf','ases']){
 const t=templates[kind], group=entries.filter(e=>e.official?.document?.toLowerCase()===kind);
 const counts={entries:group.length,hasField:0,autoWritable:0,manualOrUnresolved:0,evidence:0,restricted:0,invalidOrUnwritable:0,manualReviewFlags:0};
 for(const e of group){
  const sheet=t.sheets.find(s=>s.name===e.official.sheet);
  const f=field(e),col=e.columnId?f?.columns?.find(c=>c.id===e.columnId):null;
  const evidence=e.inputSchema?.type==='file_upload_with_caption'||f?.kind==='file'||col?.kind==='file';
  const manual=Boolean(e.inputSchema?.manual_review_before_source_export||f?.needsClarification||e.inputSchema?.type==='linked_record_picker'||evidence||(!e.columnId&&f?.kind==='table'));
  if(evidence)counts.evidence++;
  if(e.privateContact)counts.restricted++;
  if(manual)counts.manualReviewFlags++;
  if(f)counts.hasField++;
  if(e.fieldId&&!f)findings.push({type:'MISSING_FIELD',kind,id:e.id,system:e.systemId,field:e.fieldId});
  if(e.columnId&&!col)findings.push({type:'MISSING_COLUMN',kind,id:e.id,column:e.columnId});
  if(!sheet)findings.push({type:'MISSING_SHEET',kind,id:e.id,sheet:e.official.sheet});
  if(e.official.templateHash!==t.sha256)findings.push({type:'WRONG_TEMPLATE_HASH',kind,id:e.id});
  const refs=expand(e.official.ranges);
  const writable=new Set(sheet?.writableCells??[]);
  const unwritable=refs?.filter(r=>!writable.has(r))??[];
  if(!refs||unwritable.length)counts.invalidOrUnwritable++;
  if(refs&&f&&sheet&&!manual&&!e.privateContact&&!unwritable.length){
   counts.autoWritable++;
   for(const r of refs){const key=kind+':'+sheet.name+'!'+r;const hits=seenCells.get(key)||[];hits.push(e.id);seenCells.set(key,hits);}
  }else counts.manualOrUnresolved++;
  if(!manual&&!e.privateContact&&(!refs||unwritable.length))findings.push({type:'NOT_DIRECTLY_WRITABLE',kind,id:e.id,sheet:e.official.sheet,ranges:e.official.ranges.slice(0,3),reason:!refs?'bad/ambiguous range':'protected or missing cells'});
 }
 summary[kind.toUpperCase()]=counts;
}
const collisions=[...seenCells.entries()].filter(([,ids])=>ids.length>1).map(([cell,ids])=>({cell,ids:ids.slice(0,8)}));
const ses=systemMap.get('SES'),ts=templates.ses;
const sesStats={totalFields:ses?.fields.length??0,templateSheets:ts.sheets.length,fieldsWithSheetAndRanges:0,missingMappings:[],manuallySelectedCellFields:0};
for(const f of ses?.fields??[]){
 const m=f.officialTemplate, sheet=ts.sheets.find(s=>s.name===m?.sheet),guard=sesGuards.find(g=>g.sheet===m?.sheet);
 if(!sheet||!guard||!m?.editableRanges?.length){sesStats.missingMappings.push({fieldId:f.id,sheet:m?.sheet});continue;}
 sesStats.fieldsWithSheetAndRanges++;sesStats.manuallySelectedCellFields++;
 if(m.editableRanges.some(r=>!pt(r.split(':')[0])||!pt(r.split(':').at(-1))))findings.push({type:'INVALID_SES_RANGE',id:f.id});
}
summary.SES=sesStats;
const issues={
 missingStructural:findings.filter(f=>['MISSING_FIELD','MISSING_COLUMN','MISSING_SHEET','WRONG_TEMPLATE_HASH','INVALID_SES_RANGE'].includes(f.type)),
 unresolvedTargets:findings.filter(f=>f.type==='NOT_DIRECTLY_WRITABLE'),
 overlappingAutoWritableDestinations:collisions,
 SESMissingMappings:sesStats.missingMappings,
};
console.log('BIU-FIELD-CELL-AUDIT',JSON.stringify({summary,issues,notes:[
 'Automatic workbook cell permission verification does not prove semantic correctness of a destination',
 'SES asks a user to select specific target cell addresses within allowed ranges',
 'Templates are historical and not yet verified as Italy 2027 submission templates'
]},null,2));
test('verify source field identifiers and workbook sheet/hash consistency',()=>{
 assert.equal(issues.missingStructural.length,0,'Mapping registry has structurally broken source or target references');
 assert.equal(issues.SESMissingMappings.length,0,'SES field lacks configured sheet or editable ranges');
});
