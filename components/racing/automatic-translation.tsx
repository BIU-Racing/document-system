'use client';
import {useEffect,useState} from 'react';
import {scheduleLocalTranslation,subscribeLocalTranslation,type LocalTranslationState} from '@/lib/browser-translation';
export function AutomaticTranslation({id,revision,enabled=true}:{id:string;revision:number;enabled?:boolean}){
 const [state,setState]=useState<LocalTranslationState>();
 useEffect(()=>subscribeLocalTranslation(id,setState),[id]);
 useEffect(()=>{if(enabled&&revision>0)void scheduleLocalTranslation(id,revision);},[id,revision,enabled]);
 if(!enabled||revision<1||!state||state.revision!==revision)return null;
 const english=!!Object.keys(state.snapshot?.englishAnswers??{}).length&&<details className="local-translation-english"><summary>הצגת התשובות באנגלית</summary>
   {Object.entries(state.snapshot!.englishAnswers).filter(([,answer])=>typeof answer.value==='string'?answer.value.trim():answer.value.length).map(([fieldId,answer])=><div key={fieldId} dir="ltr"><strong>{fieldId}</strong>{typeof answer.value==='string'?<p style={{whiteSpace:'pre-wrap'}}>{answer.value}</p>:<table><tbody>{answer.value.map((row,index)=><tr key={row._id||index}>{Object.entries(row).filter(([key])=>key!=='_id').map(([key,value])=><td key={key}>{value}</td>)}</tr>)}</tbody></table>}{answer.reason&&<p>{answer.reason}</p>}</div>)}
  </details>;
 // Done: no banner, only the optional English view. Working: one line, so nobody closes the page too early.
 if(state.phase==='ready')return english||null;
 const working=state.phase!=='error';
 return <section className="local-translation" aria-label="תרגום אוטומטי לאנגלית">
  <p role="status">{working?'מתרגמים לאנגלית':state.message}{state.total?<> <bdi>{state.done??0}/{state.total}</bdi></>:null}{working&&' · אל תסגרו את הדף עד הסיום'}</p>
  {state.phase==='error'&&<button type="button" className="text-button" onClick={()=>void scheduleLocalTranslation(id,revision,true)}>ניסיון נוסף לתרגום</button>}
  {english}
 </section>;
}
