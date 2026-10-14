import {collectCatalog} from './youtube-catalog.mjs';
import {relevantVideo} from './video-relevance.mjs';

export function mergeVideo(previous={},next={}) {
 const merged={...previous,...next};
 // RSS/watch metadata gives an exact date; a channel listing must never erase it.
 if(previous.publishedAt&&!next.publishedAt)merged.publishedAt=previous.publishedAt;
 if(previous.description&&!next.description)merged.description=previous.description;
 if(previous.isShort||next.isShort||previous.url?.includes('/shorts/')||next.url?.includes('/shorts/')){merged.isShort=true;merged.url='https://www.youtube.com/shorts/'+merged.id;}
 return merged;
}
export function decode(s='') {
 return String(s).replace(/&(?:#(\d+)|#x([\da-f]+)|(amp|lt|gt|quot|apos));/gi,(original,dec,hex,n)=>{
  if(n)return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[n.toLowerCase()];
  const value=dec?Number(dec):parseInt(hex,16);
  return Number.isInteger(value)&&value>=0&&value<=0x10ffff?String.fromCodePoint(value):original;
 }).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1');
}
export function field(xml,tag) {
 return decode(xml.match(new RegExp('<'+tag+'(?:\\s[^>]*)?>([\\s\\S]*?)</'+tag+'>'))?.[1]||'');
}
export function validFeed(xml,kind='feed') {
 return new RegExp('^\\s*(?:<\\?xml[^?]*\\?>\\s*)?<'+kind+'(?:\\s|>)','i').test(xml)&&new RegExp('</'+kind+'>\\s*$','i').test(xml);
}
export function parseVideos(xml,source) {
 return [...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/g)].map(m=>{
  const e=m[1],id=field(e,'yt:videoId');
  return {id,title:field(e,'title'),description:field(e,'media:description'),publishedAt:field(e,'published'),url:decode(e.match(/<link\b[^>]*\brel=["']alternate["'][^>]*\bhref=["']([^"']+)["']/)?.[1]||'https://www.youtube.com/watch?v='+id),thumbnail:decode(e.match(/<media:thumbnail\b[^>]*\burl=["']([^"']+)["']/)?.[1]||'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg'),sourceKey:source.key,sourceName:source.name,sourceCategory:source.category,collectedAt:new Date().toISOString()};
 }).filter(v=>v.id&&v.title&&!(Date.parse(v.publishedAt)>Date.now()+300000)&&relevantVideo(source,v.id,v.title,v.description));
}
export function errorLabel(e) {
 const message=String(e?.message||e||'');
 if(/HTTP 429/.test(message))return '요청이 많아 일시 제한됨';
 if(/HTTP 404/.test(message))return '채널 피드를 찾을 수 없음';
 if(/HTTP/.test(message))return message;
 if(/피드 형식/.test(message))return '원본 피드 형식 오류';
 if(/timeout|abort/i.test(String(e?.name)+' '+message))return '연결 시간 초과';
 return '인터넷 또는 원본 서버 연결 실패';
}
export async function collect(sources,previous={},archive=[],fetcher=fetch,options={}) {
 const result={};
 const map=new Map((Array.isArray(archive)?archive:[]).filter(v=>v?.id).map(v=>[v.id,v]));
 // Recover saved feed entries too if an archive file was missing or incomplete.
 for(const source of sources) {
  if(previous?.[source.key]?.xml)for(const item of parseVideos(previous[source.key].xml,source))if(!map.has(item.id))map.set(item.id,item);
 }
 await Promise.all(sources.map(async source=>{
  const attemptedAt=new Date().toISOString();
  try {
   const response=await fetcher('https://www.youtube.com/feeds/videos.xml?channel_id='+source.channelId,{cache:'no-store',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(12000)});
   if(!response.ok)throw Error('HTTP '+response.status);
   const xml=await response.text();if(!validFeed(xml))throw Error('피드 형식 오류');
   const items=parseVideos(xml,source);items.forEach(v=>map.set(v.id,mergeVideo(map.get(v.id),v)));
   result[source.key]={...previous?.[source.key],name:source.name,xml,checkedAt:new Date().toISOString(),attemptedAt,stale:false,error:null,matched:items.length};
  } catch(error) {
   result[source.key]={...previous?.[source.key],name:source.name,attemptedAt,stale:true,error:errorLabel(error)};
  }
 }));
 const due=sources.filter(source=>{
  if(!source.history?.enabled)return false;
  const state=result[source.key],next=Date.parse(state.catalogNextCheckAt||'');
  if(Number.isFinite(next))return Date.now()>=next;
  const checked=Date.parse(state.catalogCheckedAt||''),hours=Math.max(1,Number(source.history.refreshHours)||24);
  return !Number.isFinite(checked)||Date.now()-checked>=hours*3600000;
 });
 let cursor=0;
 const catalogDeadline=Date.now()+Math.max(1000,Math.min(30000,Number(options.catalogBudgetMs)||25000));
 const worker=async()=>{while(cursor<due.length){const source=due[cursor++],state=result[source.key];
 if(Date.now()>=catalogDeadline){state.catalogError='이전 영상 수집 시간 제한 · 다음 확인 때 이어서 수집합니다.';state.catalogNextCheckAt=new Date(Date.now()+600000).toISOString();continue;}
 state.catalogAttemptedAt=new Date().toISOString();try{
  const catalog=await collectCatalog(source,fetcher,{deadline:catalogDeadline});
  for(const video of catalog.items)map.set(video.id,mergeVideo(map.get(video.id),video));
  state.catalogCount=catalog.items.length;state.catalogTabs=catalog.counts;state.catalogError=catalog.error;
  if(!catalog.error)state.catalogCheckedAt=catalog.checkedAt;
  state.catalogNextCheckAt=new Date(Date.now()+(catalog.error?3600000:Math.max(1,Number(source.history.refreshHours)||24)*3600000)).toISOString();
 }catch(error){state.catalogError=String(error?.message||'공개 영상 목록 연결 실패');state.catalogNextCheckAt=new Date(Date.now()+3600000).toISOString();}}};
 // Avoid issuing many continuation requests to YouTube at the same time.
 await Promise.all(Array.from({length:Math.min(3,due.length)},worker));
 const published=v=>{const stamp=Date.parse(v.publishedAt||v.publishedSortAt);return Number.isFinite(stamp)?stamp:0;};
 const items=[...map.values()].sort((a,b)=>published(b)-published(a)||(a.catalogRank??99999)-(b.catalogRank??99999)).slice(0,3000);
 return {channels:result,items};
}
