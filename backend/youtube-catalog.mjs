// Read only public channel listing data. No media downloads, login, or user credentials.
import {relevantVideo} from './video-relevance.mjs';
const videoId=/^[A-Za-z0-9_-]{11}$/;
const channelId=/^UC[A-Za-z0-9_-]{22}$/;
const browserAgent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';

export function jsonAfter(text,marker) {
 const match=typeof marker==='string'?{index:text.indexOf(marker),0:marker}:text.match(marker);
 if(!match||match.index<0)return null;
 let start=match.index+match[0].length;while(/\s/.test(text[start]||''))start++;
 if(text[start]!=='{'&&text[start]!=='[')return null;
 let depth=0,string=false,escaped=false;
 for(let i=start;i<text.length;i++) {
  const c=text[i];
  if(string){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')string=false;}
  else if(c==='"')string=true;
  else if(c==='{'||c==='[')depth++;
  else if((c==='}'||c===']')&&--depth===0){try{return JSON.parse(text.slice(start,i+1));}catch{return null;}}
 }
 return null;
}
export function textValue(value) {
 if(typeof value==='string')return value;
 return value?.simpleText||value?.content||value?.runs?.map(run=>run.text||'').join('')||'';
}
function walk(value,visit) {
 if(!value||typeof value!=='object')return;
 if(Array.isArray(value)){value.forEach(child=>walk(child,visit));return;}
 for(const [key,child]of Object.entries(value)){visit(key,child);walk(child,visit);}
}
export function relativeSortAt(label,now=Date.now()) {
 const korean=String(label).match(/(\d+(?:\.\d+)?)\s*(초|분|시간|일|주|개월|년)\s*전/);
 const english=String(label).match(/(\d+(?:\.\d+)?)\s*(second|minute|hour|day|week|month|year)s?\s+ago/i);
 const match=korean||english;if(!match)return '';
 const units={'초':1000,'분':60000,'시간':3600000,'일':86400000,'주':604800000,'개월':2592000000,'년':31536000000,second:1000,minute:60000,hour:3600000,day:86400000,week:604800000,month:2592000000,year:31536000000};
 const value=now-Number(match[1])*units[match[2].toLowerCase()];
 return Number.isFinite(value)?new Date(value).toISOString():'';
}
function publishedLabel(view) {
 const direct=textValue(view.publishedTimeText);if(direct)return direct;
 const parts=[];walk(view.metadata?.lockupMetadataViewModel?.metadata,(key,value)=>{if(key==='metadataParts'&&Array.isArray(value))for(const part of value)parts.push(textValue(part.text));});
 return parts.find(label=>/\d+\s*(초|분|시간|일|주|개월|년)\s*전|\d+\s*(second|minute|hour|day|week|month|year)s?\s+ago|스트리밍|Premiere/i.test(label))||'';
}
function ownerIds(view) {
 const ids=[];for(const text of [view.ownerText,view.shortBylineText,view.longBylineText])walk(text,(key,value)=>{if(key==='browseEndpoint'&&value?.browseId)ids.push(value.browseId);});return ids;
}
function unavailableNow(view) {
 if(view.upcomingEventData||view.isLive)return true;
 let unavailable=false;
 walk(view,(key,value)=>{if(['style','badgeStyle'].includes(key)&&typeof value==='string'&&/LIVE|UPCOMING/.test(value))unavailable=true;});
 return unavailable;
}
export function parseCatalogItems(content,source,tab='videos',options={}) {
 const items=[],seen=new Set();const now=options.now??Date.now(),baseRank=options.baseRank||0;
 walk(content,(kind,view)=>{
  if(!['videoRenderer','gridVideoRenderer','reelItemRenderer','lockupViewModel','shortsLockupViewModel'].includes(kind)||!view)return;
  if(kind==='lockupViewModel'&&view.contentType!=='LOCKUP_CONTENT_TYPE_VIDEO')return;
  if(unavailableNow(view))return;
  const short=kind==='shortsLockupViewModel'||kind==='reelItemRenderer'||tab==='shorts';
  const id=view.videoId||view.contentId||view.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId;
  if(!videoId.test(id||'')||seen.has(id))return;
  const owners=ownerIds(view);if(owners.length&&!owners.includes(source.channelId))return;
  const title=textValue(view.title)||textValue(view.metadata?.lockupMetadataViewModel?.title)||textValue(view.overlayMetadata?.primaryText)||textValue(view.headline);
  if(!title||!relevantVideo(source,id,title,textValue(view.descriptionSnippet)))return;
  seen.add(id);
  const label=publishedLabel(view);
  const images=view.thumbnail?.thumbnails||view.contentImage?.thumbnailViewModel?.image?.sources||view.thumbnailViewModel?.thumbnailViewModel?.image?.sources||[];
  const image=images.find(image=>image.width>=360)||images[0];
  let thumbnail=image?.url||'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg';
  try{if(new URL(thumbnail).protocol!=='https:')thumbnail='https://i.ytimg.com/vi/'+id+'/hqdefault.jpg';}catch{thumbnail='https://i.ytimg.com/vi/'+id+'/hqdefault.jpg';}
  items.push({id,title,description:textValue(view.descriptionSnippet),publishedAt:'',publishedLabel:label,publishedSortAt:relativeSortAt(label,now),url:'https://www.youtube.com/'+(short?'shorts/'+id:'watch?v='+id),thumbnail,sourceKey:source.key,sourceName:source.name,sourceCategory:source.category,isShort:short,catalogTab:tab,catalogRank:baseRank+items.length,collectedAt:new Date(now).toISOString()});
 });
 return items;
}
export function continuationFrom(content) {
 let continuation=null;
 walk(content,(key,value)=>{
  if(continuation||key!=='continuationItemRenderer')return;
  const endpoint=value?.continuationEndpoint,token=endpoint?.continuationCommand?.token;
  if(typeof token==='string'&&token)continuation={token,apiUrl:endpoint.commandMetadata?.webCommandMetadata?.apiUrl||'/youtubei/v1/browse'};
 });
 return continuation;
}
export function parseChannelPage(html,source,tab='videos',options={}) {
 const data=jsonAfter(html,/(?:var\s+)?ytInitialData\s*=\s*/)||jsonAfter(html,/window\["ytInitialData"\]\s*=\s*/);
 if(!data)throw Error('공개 채널 목록 형식을 읽지 못했습니다.');
 if(data.metadata?.channelMetadataRenderer?.externalId!==source.channelId)throw Error('원본 채널 확인 실패');
 const tabs=data.contents?.twoColumnBrowseResultsRenderer?.tabs||data.contents?.singleColumnBrowseResultsRenderer?.tabs||[];
 const selected=tabs.map(tab=>tab.tabRenderer||tab.expandableTabRenderer).find(tab=>tab?.selected);
 if(!selected?.content)throw Error('공개 채널 영상 탭을 찾지 못했습니다.');
 const selectedUrl=selected.endpoint?.commandMetadata?.webCommandMetadata?.url||'';
 if(selectedUrl&&!selectedUrl.includes('/'+tab))return {items:[],continuation:null,context:null,apiKey:'',tabAbsent:true};
 const context=jsonAfter(html,/"INNERTUBE_CONTEXT"\s*:\s*/);
 const apiKey=html.match(/"INNERTUBE_API_KEY"\s*:\s*"([^"\r\n]+)"/)?.[1]||'';
 return {items:parseCatalogItems(selected.content,source,tab,options),continuation:continuationFrom(selected.content),context,apiKey};
}
function continuationContent(data) {
 const actions=[...(data.onResponseReceivedActions||[]),...(data.onResponseReceivedEndpoints||[])];
 return actions.flatMap(action=>action.appendContinuationItemsAction?.continuationItems||action.reloadContinuationItemsCommand?.continuationItems||[]);
}
export async function collectCatalog(source,fetcher=fetch,options={}) {
 if(!channelId.test(source.channelId||''))throw Error('유효하지 않은 채널 ID');
 const history=source.history||{},now=options.now??Date.now();
 const tabs=history.query?['search']:(history.tabs||['videos','shorts']).filter(tab=>['videos','shorts','streams'].includes(tab));
 const maxPages=Math.max(1,Math.min(12,Number(history.maxPages)||3));
 const items=new Map(),errors=[],counts={};
 const requestSignal=()=>{const remaining=(options.deadline??Infinity)-Date.now();if(remaining<=0)throw Error('이전 영상 수집 시간 제한');return AbortSignal.timeout(Math.max(1,Math.min(15000,remaining)));};
 for(const tab of tabs) {
  let pageItems=[],pageCount=0;
  try {
   const url='https://www.youtube.com/channel/'+source.channelId+'/'+tab+'?hl=ko'+(tab==='search'?'&query='+encodeURIComponent(history.query):'');
   const response=await fetcher(url,{headers:{'User-Agent':browserAgent,'Accept-Language':'ko-KR,ko;q=0.9'},cache:'no-store',signal:requestSignal()});
   if(!response.ok)throw Error('HTTP '+response.status);
   const initial=parseChannelPage(await response.text(),source,tab,{now});
   pageItems=initial.items;pageCount=initial.tabAbsent?0:1;
   let continuation=initial.continuation;
   const client=initial.context?.client;
   const context={client:{clientName:'WEB',clientVersion:client?.clientVersion,hl:'ko',gl:'KR',...(client?.visitorData?{visitorData:client.visitorData}:{})}};
   const tokens=new Set();
   while(continuation&&pageCount<maxPages) {
    if(tokens.has(continuation.token))break;tokens.add(continuation.token);
    if(!context.client.clientVersion||!initial.apiKey)throw Error('추가 목록 연결 정보 없음');
    const apiPath=/^\/youtubei\/v1\/(browse|search)$/.test(continuation.apiUrl)?continuation.apiUrl:'/youtubei/v1/browse';
    const next=await fetcher('https://www.youtube.com'+apiPath+'?key='+encodeURIComponent(initial.apiKey),{method:'POST',headers:{'Content-Type':'application/json','User-Agent':browserAgent,'X-Youtube-Client-Name':'1','X-Youtube-Client-Version':context.client.clientVersion},body:JSON.stringify({context,continuation:continuation.token}),signal:requestSignal()});
    if(!next.ok)throw Error('HTTP '+next.status);
    const nextData=await next.json(),content=continuationContent(nextData);
    if(!content.length){if(nextData.error||!nextData.onResponseReceivedActions&&!nextData.onResponseReceivedEndpoints)throw Error('추가 목록 응답 오류');break;}
    const batch=parseCatalogItems(content,source,tab,{now,baseRank:pageItems.length});
    pageItems.push(...batch);pageCount++;continuation=continuationFrom(content);
   }
  }catch(error){const label=/timeout|abort/i.test(String(error?.name)+' '+String(error?.message))?'추가 목록 연결 시간 초과':String(error?.message||'공개 목록 연결 실패');errors.push(tab+': '+label);}
  for(const item of pageItems)if(!items.has(item.id))items.set(item.id,item);
  counts[tab]={pages:pageCount,items:new Set(pageItems.map(item=>item.id)).size};
 }
 if(!items.size&&errors.length)throw Error(errors.join(' · '));
 return {items:[...items.values()],checkedAt:new Date(now).toISOString(),counts,error:errors.length?errors.join(' · '):null};
}
