import {readFile,writeFile,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const defaultRoot=path.dirname(fileURLToPath(import.meta.url));
const parseJSON=text=>JSON.parse(text.replace(/^\uFEFF/,''));
async function readJSON(file,fallback){try{return parseJSON(await readFile(file,'utf8'));}catch{return fallback;}}
export function monthQueries(base,now=Date.now()){
 const today=new Date(now).toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}),[year,month]=today.split('-').map(Number);
 const through=new Date(Date.parse(today+'T00:00:00+09:00')+90*86400000).toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}),[lastYear,lastMonth]=through.split('-').map(Number),count=(lastYear-year)*12+lastMonth-month+1;
 return Array.from({length:count},(_,offset)=>{const first=new Date(Date.UTC(year,month-1+offset,1)),last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0));const start=first.toISOString().slice(0,10),end=last.toISOString().slice(0,10),url=new URL(base);url.searchParams.set('startAt',new Date(start+'T00:00:00+09:00').toISOString().replace('.000Z','Z'));url.searchParams.set('endAt',new Date(end+'T23:59:59+09:00').toISOString().replace('.000Z','Z'));url.searchParams.set('startAtForAllDay',start);url.searchParams.set('endAtForAllDay',end);return {month:start.slice(0,7),url:url.href};});
}
function eventMonth(event){return event.allDay?(event.startAtAllDay||'').slice(0,7):Number.isFinite(Date.parse(event.startAt))?new Date(event.startAt).toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}).slice(0,7):'';}
function safeEvent(e){return Object.fromEntries(['id','title','label','allDay','startAt','startAtAllDay','endAt','endAtAllDay','status','cancelled','location'].filter(key=>e[key]!==undefined).map(key=>[key,e[key]]));}
function eventKey(e){return e.id||[e.title,e.allDay?e.startAtAllDay:e.startAt,e.allDay===true].join('|');}
export async function collectScheduleSource(source,previous={},fetcher=fetch,now=Date.now()){
 const attemptedAt=new Date(now).toISOString(),base={...previous,...source,attemptedAt};
 if(source.type!=='mnetplus')return {...base,stale:true,error:'지원하지 않는 일정 공급원'};
 const batches=await Promise.all(monthQueries(source.url,now).map(async query=>{try{
  if(new URL(query.url).protocol!=='https:')throw Error('HTTPS required');const response=await fetcher(query.url,{cache:'no-store',headers:{'Accept':'application/json','Cache-Control':'no-cache'},signal:AbortSignal.timeout(12000)});const body=await response.text();if(body.length>4*1024*1024)throw Error('Too large');let raw;try{raw=parseJSON(body);}catch{throw Error('일정 형식 오류');}
  if(response.status===404&&raw.code===-1001)return {...query,events:[],empty:true};
  if(!response.ok)throw Error('HTTP '+response.status);if(!Array.isArray(raw.events))throw Error('일정 형식 오류');return {...query,events:raw.exposed===false?[]:raw.events.map(safeEvent)};
 }catch(e){return {...query,error:/timeout|abort/i.test(e.name+' '+e.message)?'연결 시간 초과':e.message||'일정 연결 실패'};}}));
 const successful=new Set(batches.filter(b=>!b.error).map(b=>b.month)),failed=batches.filter(b=>b.error);const months=new Set(batches.map(b=>b.month));const prior=(previous.raw?.events||[]).filter(e=>months.has(eventMonth(e))&&!successful.has(eventMonth(e)));const map=new Map(prior.map(e=>[eventKey(e),e]));batches.filter(b=>!b.error).forEach(b=>b.events.forEach(e=>map.set(eventKey(e),e)));
 return {...base,raw:{events:[...map.values()],months:batches.map(b=>({month:b.month,stale:!!b.error,error:b.error||null,empty:!!b.empty}))},checkedAt:failed.length?previous.checkedAt||null:attemptedAt,stale:failed.length>0,error:failed.length?failed.map(b=>b.month+' '+b.error).join(' · '):null};
}
export async function createScheduleStore(options={}){
 const root=options.rootDir||defaultRoot,fetcher=options.fetcher||fetch,clock=options.now||Date.now;let stored=await readJSON(path.join(root,'schedule-snapshot.json'),{calendars:[]}),nextCheck=0,pending;
 const persist=options.persist||(async data=>{const target=path.join(root,'schedule-snapshot.json'),tmp=target+'.'+process.pid+'.tmp';try{await writeFile(tmp,JSON.stringify(data,null,2));await rename(tmp,target);}finally{await unlink(tmp).catch(()=>{});}});
 async function getSchedule(force=false){if(pending)return pending;if(!force&&clock()<nextCheck)return stored;pending=(async()=>{const sources=options.sources||await readJSON(path.join(root,'schedule-sources.json'),[]),curated=options.curated||await readJSON(path.join(root,'schedule-curated.json'),{events:[]});const calendars=await Promise.all(sources.map(source=>collectScheduleSource(source,stored.calendars?.find(c=>c.key===source.key),fetcher,clock())));stored={curated,calendars};nextCheck=clock()+(calendars.some(c=>c.stale)?60000:300000);try{await persist(stored);}catch{stored.persistenceError='일정을 파일로 저장하지 못했습니다.';nextCheck=clock()+60000;}return stored;})().finally(()=>pending=null);return pending;}
 return {getSchedule};
}
