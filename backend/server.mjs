import http from 'node:http';
import {readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {collect,errorLabel,validFeed} from './collector.mjs';
import {createScheduleStore} from './schedule-store.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const newsUrl='https://news.google.com/rss/search?q='+encodeURIComponent('리센느 when:30d')+'&hl=ko&gl=KR&ceid=KR:ko';
const intervalMs=300000,retryMs=60000;
async function readJSON(file,fallback) {try{return JSON.parse(await readFile(file,'utf8'));}catch{return fallback;}}
async function writeJSON(file,value) {
 const temporary=file+'.'+process.pid+'.'+Math.random().toString(36).slice(2)+'.tmp';
 try{await writeFile(temporary,JSON.stringify(value,null,2));await rename(temporary,file);}finally{await unlink(temporary).catch(()=>{});}
}
export async function createFeedStore(options={}) {
 const rootDir=options.rootDir||root;
 const sources=options.sources||await readJSON(path.join(rootDir,'sources.json'),[]);
 const fetcher=options.fetcher||fetch,now=options.now||Date.now;
 let snapshot=options.snapshot||await readJSON(path.join(rootDir,'snapshot.json'),{});
 const savedArchive=options.archive||await readJSON(path.join(rootDir,'archive.json'),[]);
 // The snapshot is the authoritative copy when the two files were saved at different times.
 let archive=[...new Map([...(Array.isArray(savedArchive)?savedArchive:[]),...(Array.isArray(snapshot.items)?snapshot.items:[])].filter(item=>item?.id).map(item=>[item.id,item])).values()];
 let nextCheck=0,pending=null;
 const persist=options.persist||(async(value,items)=>{
  // snapshot contains the full archive and can recover it after an interrupted archive write.
  await writeJSON(path.join(rootDir,'snapshot.json'),value);
  await writeJSON(path.join(rootDir,'archive.json'),items);
 });
 async function getFeeds(force=false) {
  if(pending)return pending;
  if(!force&&now()<nextCheck)return snapshot;
  pending=(async()=>{
   const attemptedAt=new Date(now()).toISOString();
   const [videoResult,newsResult]=await Promise.allSettled([
    collect(sources,snapshot.channels,archive,fetcher),
    (async()=>{
     const response=await fetcher(newsUrl,{cache:'no-store',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(15000)});
     if(!response.ok)throw Error('HTTP '+response.status);
     const xml=await response.text();if(!validFeed(xml,'rss'))throw Error('피드 형식 오류');
     return {xml,checkedAt:new Date(now()).toISOString(),attemptedAt,stale:false,error:null};
    })()
   ]);
   const next={...snapshot,sources};
   if(videoResult.status==='fulfilled') {
    next.channels=videoResult.value.channels;next.items=videoResult.value.items;
   } else {
    next.channels=Object.fromEntries(sources.map(source=>[source.key,{...snapshot.channels?.[source.key],name:source.name,attemptedAt,stale:true,error:errorLabel(videoResult.reason)}]));
    next.items=Array.isArray(archive)?archive:[];
   }
   next.videos=next.channels[sources.find(source=>source.category==='official')?.key];
   next.news=newsResult.status==='fulfilled'?newsResult.value:{...snapshot.news,attemptedAt,stale:true,error:errorLabel(newsResult.reason)};
   const hasErrors=Object.values(next.channels).some(channel=>channel.stale)||next.news.stale;
   nextCheck=now()+(hasErrors?retryMs:intervalMs);
   next.refresh={attemptedAt,completedAt:new Date(now()).toISOString(),nextCheckAt:new Date(nextCheck).toISOString(),hasErrors,persistenceError:null};
   // Publish a complete result together. Readers never see a partly updated snapshot.
   snapshot=next;archive=next.items;
   try{await persist(next,archive);}catch(error){
    next.refresh.persistenceError='갱신 목록을 파일로 저장하지 못했습니다.';
    nextCheck=now()+retryMs;next.refresh.hasErrors=true;next.refresh.nextCheckAt=new Date(nextCheck).toISOString();
    (options.log||console).warn('RESCENE NOW: snapshot persistence failed:',error?.code||error?.name||'write error');
   }
   return snapshot;
  })().finally(()=>{pending=null;});
  return pending;
 }
 return {getFeeds,getStatus:()=>({service:'rescene-now',ready:true,refreshing:Boolean(pending),videoCount:snapshot.items?.length||0,refresh:snapshot.refresh||null})};
}
export function createServer(store,rootDir=root,scheduleStore) {
 const schedules=scheduleStore||createScheduleStore({rootDir});
 const files={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/video-utils.js':'video-utils.js','/refresh-utils.js':'refresh-utils.js','/schedule-utils.js':'schedule-utils.js','/schedule-curated.json':'schedule-curated.json','/schedule-sources.json':'schedule-sources.json','/schedule-snapshot.json':'schedule-snapshot.json','/style.css':'style.css','/miniroom-utils.js':'miniroom-utils.js','/miniroom.js':'miniroom.js','/miniroom.css':'miniroom.css','/minimi-sprites-v1.png':'minimi-sprites-v1.png','/miniroom-bg-v1.png':'miniroom-bg-v1.png','/snapshot.json':'snapshot.json','/sources.json':'sources.json','/manifest.webmanifest':'manifest.webmanifest','/sw.js':'sw.js','/icon-192.png':'icon-192.png','/icon-512.png':'icon-512.png'};
 const json=(response,status,value)=>{response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});response.end(JSON.stringify(value));};
 return http.createServer(async(request,response)=>{
  try {
   const requestUrl=new URL(request.url,'http://localhost'),route=requestUrl.pathname;
   if(route==='/api/share'){let state=await readJSON(path.join(rootDir,'../../work/sharing/state.json'),{});try{process.kill(state.tunnelPid,0);}catch{state={};}json(response,200,{url:state.url||null,temporary:true});return;}
   if(route==='/api/health'){json(response,200,store.getStatus());return;}
   if(route==='/api/schedule'){json(response,200,await(await schedules).getSchedule(requestUrl.searchParams.get('force')==='1'));return;}
   if(route==='/api/feeds'){json(response,200,await store.getFeeds(requestUrl.searchParams.get('force')==='1'));return;}
   if(route==='/RESCENE-NOW-Android.apk'){
    try{const data=await readFile(path.join(rootDir,'../RESCENE-NOW-Android.apk'));response.writeHead(200,{'Content-Type':'application/vnd.android.package-archive','Content-Disposition':'attachment; filename="RESCENE-NOW-Android.apk"','Cache-Control':'no-store','Content-Length':data.length});response.end(data);}catch{response.writeHead(404);response.end('Download unavailable');}return;
   }
   if(!files[route]){response.writeHead(404);response.end('Not found');return;}
   const file=files[route],data=await readFile(path.join(rootDir,file));
   response.writeHead(200,{'Content-Type':file.endsWith('.png')?'image/png':file.endsWith('.webmanifest')?'application/manifest+json':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':'application/json; charset=utf-8','Cache-Control':file==='sw.js'?'no-cache':'no-store','X-Content-Type-Options':'nosniff'});response.end(data);
  }catch(error){
   if(!response.headersSent)json(response,503,{error:'업데이트 서버가 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'});else response.end();
   console.warn('RESCENE NOW: request failed:',error?.code||error?.name||'request error');
  }
 });
}
const isMain=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isMain) {
 const store=await createFeedStore();
 if(process.argv.includes('--refresh')) {
  const value=await store.getFeeds(true);
  console.log(JSON.stringify({videos:value.items.length,channels:Object.fromEntries(Object.entries(value.channels).map(([key,value])=>[key,{checkedAt:value.checkedAt,stale:value.stale,error:value.error}])),news:{checkedAt:value.news.checkedAt,stale:value.news.stale,error:value.news.error},refresh:value.refresh},null,2));
 } else {
  const schedules=await createScheduleStore();
  const server=createServer(store,root,schedules);
  server.listen(4317,'127.0.0.1',()=>{console.log('RESCENE NOW: http://127.0.0.1:4317');store.getFeeds().catch(error=>console.warn('Initial refresh failed:',error.message));schedules.getSchedule().catch(error=>console.warn('Initial schedule failed:',error.message));});
  server.on('error',error=>{if(error.code==='EADDRINUSE'){console.error('Port 4317 is already in use.');process.exitCode=1;return;}throw error;});
  const timer=setInterval(()=>{store.getFeeds().catch(error=>console.warn('Scheduled refresh failed:',error.message));schedules.getSchedule().catch(error=>console.warn('Schedule refresh failed:',error.message));},15000);timer.unref();
 }
}
