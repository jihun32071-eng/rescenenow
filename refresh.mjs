import {readFile,writeFile,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const defaultRoot=path.dirname(fileURLToPath(import.meta.url));
const intervalMinutes=30,freshnessMinutes=90;
const parseJSON=text=>JSON.parse(text.replace(/^\uFEFF/,''));
const readJSON=async file=>parseJSON(await readFile(file,'utf8'));
const object=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const copy=value=>JSON.parse(JSON.stringify(value));

function validItems(items){
 return Array.isArray(items)&&items.every(item=>object(item)&&typeof item.id==='string'&&item.id.length>0);
}
function validFeeds(value,sources,previous){
 return object(value)&&validItems(value.items)&&object(value.channels)&&
  sources.every(source=>object(value.channels[source.key]))&&object(value.news)&&
  (previous.items?.length===0||!previous.items?.length||value.items.length>0);
}
function validSchedule(value,sources){
 return object(value)&&object(value.curated)&&Array.isArray(value.curated.events)&&
  Array.isArray(value.calendars)&&sources.every(source=>value.calendars.some(calendar=>
   calendar.key===source.key&&object(calendar.raw)&&Array.isArray(calendar.raw.events)));
}
function rejectedFeeds(previous,sources,attemptedAt){
 const result=copy(previous);
 result.sources=sources;
 result.channels=Object.fromEntries(sources.map(source=>[source.key,{
  ...result.channels?.[source.key],name:source.name,attemptedAt,stale:true,error:'갱신 결과를 확인하지 못해 이전 목록을 유지합니다.'
 }]));
 result.items=Array.isArray(previous.items)?copy(previous.items):[];
 result.videos=result.channels[sources.find(source=>source.category==='official')?.key];
 result.news={...result.news,attemptedAt,stale:true,error:'갱신 결과를 확인하지 못해 이전 소식을 유지합니다.'};
 return result;
}
function rejectedSchedule(previous,attemptedAt){
 const result=copy(previous);
 result.calendars=(result.calendars||[]).map(calendar=>({...calendar,attemptedAt,stale:true,error:'일정 연결 실패 · 이전 일정을 유지합니다.'}));
 return result;
}
function metadata(attemptedAt,completedAt,hasErrors){
 return {attemptedAt,completedAt,mode:'scheduled',intervalMinutes,freshnessMinutes,
  nextCheckAt:new Date(Date.parse(completedAt)+intervalMinutes*60000).toISOString(),
  hasErrors,persistenceError:null};
}
async function atomicJSON(file,value){
 const temporary=file+'.'+process.pid+'.'+Math.random().toString(36).slice(2)+'.tmp';
 try{
  await writeFile(temporary,JSON.stringify(value,null,2)+'\n');
  // Read the completed staging file before publishing it.
  await readJSON(temporary);
  await rename(temporary,file);
 }finally{await unlink(temporary).catch(()=>{});}
}

export async function refresh({rootDir=defaultRoot,fetcher=fetch,now=Date.now,dryRun=false}={}){
 const backendRoot=path.join(rootDir,'backend'),siteRoot=path.join(rootDir,'site');
 const [previousFeeds,previousSchedule,archive,sources,scheduleSources,curated]=await Promise.all([
  readJSON(path.join(siteRoot,'snapshot.json')),readJSON(path.join(siteRoot,'schedule-snapshot.json')),
  readJSON(path.join(backendRoot,'archive.json')),readJSON(path.join(backendRoot,'sources.json')),
  readJSON(path.join(backendRoot,'schedule-sources.json')),readJSON(path.join(backendRoot,'schedule-curated.json'))
 ]);
 if(!validItems(previousFeeds.items)||!validItems(archive)||!object(previousSchedule)||!Array.isArray(previousSchedule.calendars))throw Error('Saved snapshots are invalid; no files were changed.');
 if(!Array.isArray(sources)||!sources.length||!Array.isArray(scheduleSources)||!scheduleSources.length||!object(curated)||!Array.isArray(curated.events))throw Error('Source configuration is invalid; no files were changed.');
 const [{createFeedStore},{createScheduleStore}]=await Promise.all([
  import(pathToFileURL(path.join(backendRoot,'server.mjs')).href),
  import(pathToFileURL(path.join(backendRoot,'schedule-store.mjs')).href)
 ]);
 const attemptedAt=new Date(now()).toISOString();
 const noop=async()=>{};
 const [feedStore,scheduleStore]=await Promise.all([
  createFeedStore({rootDir:backendRoot,sources,snapshot:previousFeeds,archive,fetcher,now,persist:noop}),
  createScheduleStore({rootDir:siteRoot,sources:scheduleSources,curated,fetcher,now,persist:noop})
 ]);
 const [feedResult,scheduleResult]=await Promise.allSettled([feedStore.getFeeds(true),scheduleStore.getSchedule(true)]);
 const feeds=feedResult.status==='fulfilled'&&validFeeds(feedResult.value,sources,previousFeeds)
  ?feedResult.value:rejectedFeeds(previousFeeds,sources,attemptedAt);
 const schedule=scheduleResult.status==='fulfilled'&&validSchedule(scheduleResult.value,scheduleSources)
  ?scheduleResult.value:rejectedSchedule(previousSchedule,attemptedAt);
 const completedAt=new Date(now()).toISOString();
 // checkedAt belongs to the collector. Never replace failed sources' last successful check with a run timestamp.
 feeds.refresh=metadata(attemptedAt,completedAt,Object.values(feeds.channels).some(channel=>channel.stale)||Boolean(feeds.news.stale));
 schedule.refresh=metadata(attemptedAt,completedAt,schedule.calendars.some(calendar=>calendar.stale));
 if(!dryRun){
  // The feed snapshot contains the entire archive and repairs it if a job ends between writes.
  await atomicJSON(path.join(siteRoot,'snapshot.json'),feeds);
  await atomicJSON(path.join(backendRoot,'archive.json'),feeds.items);
  await atomicJSON(path.join(siteRoot,'schedule-snapshot.json'),schedule);
 }
 const summary={videos:feeds.items.length,
  channels:Object.values(feeds.channels).filter(channel=>!channel.stale).length,
  totalChannels:sources.length,newsChecked:Boolean(feeds.news.checkedAt)&&!feeds.news.stale,
  calendars:schedule.calendars.filter(calendar=>!calendar.stale).length,
  totalCalendars:scheduleSources.length,hasErrors:feeds.refresh.hasErrors||schedule.refresh.hasErrors,
  nextCheckAt:feeds.refresh.nextCheckAt,dryRun};
 return {feeds,schedule,summary};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const result=await refresh({dryRun:process.argv.includes('--dry-run')});
  console.log(JSON.stringify(result.summary,null,2));
  if(result.summary.hasErrors)console.warn('Some sources could not be reached. Their saved entries and successful check times were retained.');
 }catch(error){
  console.error('Refresh stopped:',error.message);
  process.exitCode=1;
 }
}
