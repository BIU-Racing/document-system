// Server action for translation approval (lib/server.ts reviewTranslation). In-memory SQLite,
// synthetic answers, a fake machine translation. No network, no production data.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const {DatabaseSync}=require('node:sqlite');
const {AsyncLocalStorage}=require('node:async_hooks');
const identity=new AsyncLocalStorage(),sql=new DatabaseSync(':memory:');
for(const file of fs.readdirSync('drizzle').filter(name=>name.endsWith('.sql')).sort())for(const statement of fs.readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint'))if(statement.trim())sql.exec(statement);
const db={prepare(query){return {query,args:[],bind(...args){this.args=args;return this},async run(){return sql.prepare(query).run(...this.args)},async first(){return sql.prepare(query).get(...this.args)??null},async all(){return {results:sql.prepare(query).all(...this.args)}}}},async batch(statements){sql.exec('BEGIN');try{const results=statements.map(s=>sql.prepare(s.query).run(...s.args));sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}};
const fields=[{id:'text',label:'טקסט',type:'text',kind:'text'},{id:'rows',label:'טבלה',type:'table',kind:'table',columns:[{id:'part',label:'רכיב',kind:'text'}]},{id:'number',label:'מספר',type:'text',kind:'text'}];
const catalog={schemaVersion:'test',systems:[{id:'TSAL'}],getSystem:id=>['TSAL','COORDINATOR'].includes(id)?{id}:undefined,getFields:()=>fields};
function load(file,deps){const exports={};const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(compiled,{exports,require:name=>{if(name in deps)return deps[name];if(name==='@/lib/email-entry-session')return {readEmailEntryToken:async()=>null};if(name==='next/server')return {after(){}};if(name==='@/lib/translation-version')return load('lib/translation-version.ts',{});throw Error('Unexpected import '+name)},console,Response,Request,Headers,TextEncoder,TextDecoder,URL,TransformStream,crypto:globalThis.crypto,Uint8Array,File,FormData,Promise},{filename:file});return exports;}
const progress=load('lib/progress.ts',{}),review=load('lib/translation-review.ts',{'./progress':progress});
// The machine translation the server will see for the current revision.
let machine={text:'The controller monitors every cell.',rows:[{_id:'r1',part:'Fuse'}]};
const translation={getTranslationSnapshot:async(_db,snapshot)=>{const applied=review.applyTranslationOverrides(snapshot.answers,snapshot.review,Object.fromEntries(Object.entries(machine).map(([k,v])=>[k,{...snapshot.answers[k],value:v}])),Object.fromEntries(Object.keys(machine).map(k=>[k,'ready'])));return {...applied,sourceRevision:snapshot.revision};}};
const deps={'@/lib/team-entry':{teamEntryAllowed:()=>true},'@/lib/cloud-storage':{cloudDatabase:db,cloudBucket:{}},'@/app/chatgpt-auth':{getChatGPTUser:async()=>identity.getStore()??null},'@/lib/catalog':catalog,'@/lib/progress':progress,'@/lib/source-import':load('lib/source-import.ts',{}),'@/lib/answer-merge':load('lib/answer-merge.ts',{}),'@/lib/translation':translation,'@/lib/translation-review':review};
const server=load('lib/server.ts',deps);
const run=(subject,fn)=>identity.run({userId:subject,email:subject+'@example.invalid'},fn);
let n=0;const id=()=>'tr_'+String(++n).padStart(8,'0');
const act=(subject,body)=>run(subject,()=>server.reviewTranslation('TSAL',{mutationId:id(),...body}));
sql.prepare('INSERT INTO workspace VALUES(?,?,?)').run('2027','owner','2026-10-30');
for(const [subject,role]of [['owner','coordinator'],['writer','contributor'],['reviewer','reviewer']])sql.prepare('INSERT INTO memberships(subject,role,system_ids,active,created_at) VALUES(?,?,?,?,?)').run(subject,role,JSON.stringify(['TSAL']),1,'2026-10-30');
let cases=0;const ok=()=>cases++;
(async()=>{
 const answers={text:{status:'answered',value:'הבקר מנטר כל תא.'},rows:{status:'answered',value:[{_id:'r1',part:'נתיך'}]},number:{status:'answered',value:'25'}};
 const saved=await run('writer',()=>server.saveSystem('TSAL',{baseRevision:0,answers,mutationId:id()}));
 const seen=review.englishPrint({value:machine.text});

 await assert.rejects(act('writer',{baseRevision:saved.revision,fieldId:'number',action:'approve',englishFingerprint:seen}),e=>e.status===400);ok();
 await assert.rejects(act('writer',{baseRevision:saved.revision,fieldId:'text',action:'approve',englishFingerprint:'"old text"'}),e=>e.status===409);ok();
 await assert.rejects(act('writer',{baseRevision:saved.revision-1,fieldId:'text',action:'approve',englishFingerprint:seen}),e=>e.status===409);ok();

 const approved=await act('reviewer',{baseRevision:saved.revision,fieldId:'text',action:'approve',englishFingerprint:seen});
 assert.deepEqual(approved.answers,saved.answers,'answers never change');assert.equal(approved.revision,saved.revision+1);
 assert.equal(review.approvalState(approved.review,'text',approved.answers.text,{value:machine.text}),'approved');assert.equal(approved.review.translations.text.role,'reviewer');ok();

 await assert.rejects(act('reviewer',{baseRevision:approved.revision,fieldId:'text',action:'approve',english:'Edited by reviewer'}),e=>e.status===403);ok();
 await assert.rejects(act('writer',{baseRevision:approved.revision,fieldId:'text',action:'approve',english:'נשארה עברית'}),e=>e.status===400);ok();
 const edited=await act('writer',{baseRevision:approved.revision,fieldId:'text',action:'approve',english:'The BMS monitors every cell.'});
 assert.equal(edited.review.translations.text.value,'The BMS monitors every cell.');
 assert.equal(review.overrideFor(edited.review,'text',edited.answers.text),'The BMS monitors every cell.');ok();

 await assert.rejects(act('writer',{baseRevision:edited.revision,fieldId:'rows',action:'approve',english:[{_id:'other',part:'Fuse'}]}),e=>e.status===400);ok();
 const table=await act('writer',{baseRevision:edited.revision,fieldId:'rows',action:'approve',english:[{_id:'r1',part:'Main fuse'}]});
 assert.deepEqual(JSON.parse(JSON.stringify(table.review.translations.rows.value)),[{_id:'r1',part:'Main fuse'}]);ok();

 // Editing the Hebrew keeps the approval record but it no longer applies.
 const changed=await run('writer',()=>server.saveSystem('TSAL',{baseRevision:table.revision,answers:{...table.answers,text:{status:'answered',value:'הבקר מנטר כל מקטע.'}},mutationId:id()}));
 assert.ok(changed.review.translations.text,'record kept');
 assert.equal(review.approvalState(changed.review,'text',changed.answers.text,{value:'The BMS monitors every cell.'}),'stale');
 assert.equal(review.overrideFor(changed.review,'text',changed.answers.text),undefined,'old correction is not reused for new Hebrew');ok();

 const revoked=await act('writer',{baseRevision:changed.revision,fieldId:'rows',action:'revoke'});
 assert.equal(revoked.review.translations.rows,undefined);ok();
 await assert.rejects(act('writer',{baseRevision:revoked.revision,fieldId:'rows',action:'revoke'}),e=>e.status===400);ok();

 // Same mutation id retried returns the same revision; reused for something else is refused.
 const mutationId=id(),body={baseRevision:revoked.revision,fieldId:'text',action:'approve',english:'The BMS monitors every segment.',mutationId};
 const once=await run('writer',()=>server.reviewTranslation('TSAL',body)),twice=await run('writer',()=>server.reviewTranslation('TSAL',body));
 assert.equal(once.revision,twice.revision);
 await assert.rejects(run('writer',()=>server.reviewTranslation('TSAL',{...body,english:'Different'})),e=>e.status===409);ok();
 console.log(`${cases} translation approval server cases passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
