const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),crypto=require('node:crypto');
const esbuild=require('esbuild'),{unzipSync,strFromU8}=require('fflate');
const load=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const coverage=load('data/coverage.normalized.json').entries, systems=load('data/systems.normalized.json'),coord=load('data/coordinator.normalized.json'),templates=load('private-data/official-workbook-templates.json'),guards=load('data/ses-export-guards.json');
const fieldLists=new Map(systems.map(s=>[s.id,s.fields]));fieldLists.set('COORDINATOR',coord);
const built=esbuild.buildSync({entryPoints:['lib/official-workbooks.ts'],bundle:true,platform:'node',format:'cjs',target:'node22',write:false,logLevel:'silent'});
const mod=new Module(path.resolve('lib/qa-proof.cjs'),module);mod.filename=path.resolve('lib/qa-proof.cjs');mod.paths=module.paths;mod._compile(built.outputFiles[0].text,mod.filename);
const {buildOfficialWorkbook}=mod.exports;
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([a,b])=>JSON.stringify(a)+':'+canonical(b)).join(',')+'}':JSON.stringify(v)??'null';
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const snapshot=(id,answers)=>({id,answers,revision:9,status:'draft',attachments:[],progress:{complete:0,total:0,percent:0},updatedAt:null,review:{fields:{}},schemaVersion:'qa'});
const translated=s=>({systemId:s.id,sourceRevision:s.revision,sourceHash:hash(canonical(s.answers)),isCurrent:true,englishAnswers:s.answers,fieldStates:Object.fromEntries(Object.keys(s.answers).map(k=>[k,'ready']))});
const point=s=>{const m=/^([A-Z]{1,3})([1-9]\d*)$/.exec(s);if(!m)return null;let c=0;for(const ch of m[1])c=c*26+ch.charCodeAt(0)-64;return [c,Number(m[2])]};
const address=(c,r)=>{let a='';while(c){c--;a=String.fromCharCode(65+c%26)+a;c=Math.floor(c/26);}return a+r};
const expand=(list,limit=2000)=>{let out=[];for(const s of list||[]){const p=s.split(':'),a=point(p[0]),b=point(p[1]||p[0]);if(!a||!b||p.length>2||a[0]>b[0]||a[1]>b[1]||(b[0]-a[0]+1)*(b[1]-a[1]+1)+out.length>limit)return null;for(let r=a[1];r<=b[1];r++)for(let c=a[0];c<=b[0];c++)out.push(address(c,r));}return out.length?out:null};
const readCell=(xml,ref)=>{const match=new RegExp('<c\\b([^>]*\\br="'+ref+'"[^>]*)(?:\\/>|>([\\s\\S]*?)<\\/c>)').exec(xml);if(!match)return null;const body=match[2]||'';const number=/<v>([^<]*)<\/v>/.exec(body),str=/<is[^>]*>([\s\S]*?)<\/is>/.exec(body);const value=str?[...str[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x=>x[1]).join(''):number?number[1]:null;return {value,formula:/<f\b/.test(body)}};
const getField=e=>(fieldLists.get(e.systemId||'COORDINATOR')||[]).find(f=>f.id===e.fieldId);
const choice=(e,f,col,i)=>{const schema={...e.inputSchema,...f.sourceInputSchema,...col?.sourceInputSchema},opts=schema.source_literal_options||col?.options||f.options||[];if(schema.type==='number_with_unit_and_source')return String(5000+i);if(schema.type==='select'||col?.kind==='select'||f.kind==='select'){const x=opts[0];return typeof x==='string'?x:String(x?.source_value??x?.value??'Yes')}return 'QA_VALUE_'+String(i).padStart(5,'0')};
const dir='outputs/excel-proof';fs.mkdirSync(dir,{recursive:true});
const results=[],summary={sourceCommit:process.env.GITHUB_SHA||'',testData:'synthetic-only',documents:{},limitations:['Checks physical placement against mapping registry; does not independently verify engineering semantics','Bundled Italian templates are 2023/2026 and not verified for 2027','No production database or user submissions accessed']};
let serial=1;
(async()=>{
for(const kind of ['esf','ases']){
 const template=templates[kind],all=coverage.filter(e=>e.official.document.toLowerCase()===kind),eligible=[];
 for(const e of all){const f=getField(e),col=f?.columns?.find(x=>x.id===e.columnId),sheet=template.sheets.find(x=>x.name===e.official.sheet),refs=expand(e.official.ranges);
 const evidence=e.inputSchema.type==='file_upload_with_caption'||f?.kind==='file'||col?.kind==='file';
 const manual=e.inputSchema.manual_review_before_source_export||f?.needsClarification||e.inputSchema.type==='linked_record_picker'||evidence||(!e.columnId&&f?.kind==='table');
 if(f&&(!e.columnId||col)&&sheet&&refs?.every(r=>sheet.writableCells.includes(r))&&!manual&&!e.privateContact)eligible.push(e);}
 const fields=new Map(),wanted=new Map();
 for(const e of eligible){const sys=e.systemId||'COORDINATOR',key=sys+':'+e.fieldId,f=getField(e),col=f.columns?.find(x=>x.id===e.columnId),v=choice(e,f,col,serial++);
 if(!fields.has(key))fields.set(key,{systemId:sys,field:f,entries:[]});fields.get(key).entries.push({e,v});}
 const work=new Map();
 for(const {systemId,field,entries} of fields.values()){
  let value;
  if(field.kind==='table'){
   const slots=field.recordKeys?.length>1?field.recordKeys.length:1;
   value=Array.from({length:slots},(_,i)=>({_id:'QA_ROW_'+i}));
   for(const {e,v} of entries){const i=slots>1?field.recordKeys.indexOf(e.sourceRecordKey??''):0;if(i>=0&&e.columnId){value[i][e.columnId]=v;wanted.set(e.id,v);}}
  }else{value=entries[0].v;for(const {e} of entries)wanted.set(e.id,value);}
  if(!work.has(systemId))work.set(systemId,{});
  work.get(systemId)[field.id]={status:'answered',value,sourceReview:'confirmed'};
 }
 const snapshots=[...work].map(([id,answers])=>snapshot(id,answers));
 const wb=await buildOfficialWorkbook({kind,snapshots,translations:snapshots.map(translated),generatedAt:'2026-11-18T00:00:00Z'});
 fs.writeFileSync(path.join(dir,kind.toUpperCase()+'-synthetic.'+(kind==='ases'?'xlsm':'xlsx')),Buffer.from(wb.bytes));
 const zip=unzipSync(wb.bytes),report=new Map(wb.report.fields.map(f=>[f.controlId,f]));
 let passed=0,missing=0,notEligible=0;
 for(const e of all){const r=report.get(e.id),expected=wanted.get(e.id),sheet=template.sheets.find(x=>x.name===e.official.sheet);
  let result='NOT_AUTOMATICALLY_WRITABLE',actual='',cell='';
  if(expected!==undefined){if(r?.status==='written'&&r.writtenCells?.length){
   const xml=strFromU8(zip[sheet.path]),vals=r.writtenCells.map(c=>({cell:c,...readCell(xml,c)}));
   cell=r.writtenCells.join(';');actual=vals.map(x=>x.value??'').join(';');
   result=vals.every(x=>x.value===expected&&!x.formula&&expand(e.official.ranges)?.includes(x.cell))?'PASS_PHYSICAL_CELL':'FAIL_WRONG_VALUE_OR_CELL';
  }else{result='FAIL_NOT_WRITTEN';}
  if(result.startsWith('PASS'))passed++;else missing++;
  }else notEligible++;
  results.push({document:kind.toUpperCase(),controlId:e.id,fieldId:e.fieldId,systemId:e.systemId,fieldLabel:e.label,sheet:e.official.sheet,mappedRanges:e.official.ranges.join(';'),testValue:expected||'',actualValue:actual,cell,status:r?.status||'',proof:result});
 }
 summary.documents[kind.toUpperCase()]={mapped:all.length,eligible:eligible.length,matched:passed,failed:missing,other:notEligible,exportedWrites:wb.report.writtenCells.length};
 console.log('E2E_DOCUMENT '+JSON.stringify({document:kind,...summary.documents[kind.toUpperCase()]}));
}
const ses=(fieldLists.get('SES')||[]),t=templates.ses;let sesPassed=0,sesFailed=0,sesEvidence=0;
for(const f of ses){
 const m=f.officialTemplate||{},sheet=t.sheets.find(x=>x.name===m.sheet),guard=guards.find(x=>x.sheet===m.sheet);
 if(f.kind==='file'){sesEvidence++;results.push({document:'SES',fieldId:f.id,sheet:m.sheet,status:'evidence_required',proof:'NOT_AUTO_CELL'});continue}
 if(!sheet||!guard){sesFailed++;results.push({document:'SES',fieldId:f.id,sheet:m.sheet,proof:'FAIL_MISSING_GUARD'});continue}
 let found=null;const cells=expand(m.editableRanges,100000)||[];
 for(const c of cells){if(!sheet.writableCells.includes(c)||guard.formulaCellsInsideEditableRanges.includes(c))continue;
 let merged=false;for(const mr of guard.mergedRanges){const [l,r=l]=mr.split(':'),a=point(l),b=point(r),p=point(c);if(a&&b&&p&&p[0]>=a[0]&&p[0]<=b[0]&&p[1]>=a[1]&&p[1]<=b[1]&&c!==l){merged=true;break}}
 if(!merged){found=c;break}
 }
 if(!found){sesFailed++;results.push({document:'SES',fieldId:f.id,sheet:m.sheet,proof:'FAIL_NO_SAFE_CELL'});continue}
 const row={_id:'QA_ROW_0',[f.id+'-CELL']:found,[f.id+'-VALUE']:'1'},s=snapshot('SES',{[f.id]:{status:'answered',value:[row]}});
 const wb=await buildOfficialWorkbook({kind:'ses',snapshots:[s],generatedAt:'2026-11-18T00:00:00Z'});
 const record=wb.report.fields.find(x=>x.fieldId===f.id),write=wb.report.writtenCells.find(x=>x.fieldId===f.id);
 const actual=write?readCell(strFromU8(unzipSync(wb.bytes)[sheet.path]),write.cell):null;
 const pass=write?.cell===found&&actual?.value==='1'&&!actual.formula;
 if(pass)sesPassed++;else sesFailed++;
 results.push({document:'SES',controlId:f.id,fieldId:f.id,fieldLabel:f.label,sheet:m.sheet,mappedRanges:m.editableRanges.join(';'),testValue:'1',actualValue:actual?.value??'',cell:write?.cell??'',status:record?.status??'',proof:pass?'PASS_SELECTED_SAFE_CELL':'NOT_WRITTEN_FOR_PROBE'});
}
summary.documents.SES={fields:ses.length,safeCellWrites:sesPassed,notVerifiedProbes:sesFailed,evidence:sesEvidence,semanticMappingsVerified:0};
const csv=(v)=>'"'+String(v??'').replace(/"/g,'""')+'"';
const cols=['document','controlId','fieldId','systemId','fieldLabel','sheet','mappedRanges','testValue','actualValue','cell','status','proof'];
fs.writeFileSync(path.join(dir,'all-field-results.csv'),[cols.map(csv).join(','),...results.map(r=>cols.map(k=>csv(r[k])).join(','))].join('\n')+'\n');
fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify(summary,null,2));
console.log('E2E_PROOF_SUMMARY '+JSON.stringify(summary));
})().catch(e=>{console.error('AUDIT_FATAL',e.stack);process.exitCode=1;});
