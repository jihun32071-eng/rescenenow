// Read public watch-page metadata only. No player, media URL, or script is executed.
function readString(text, start) {
 const quote=text[start];if(quote!=="'"&&quote!=='"')return null;
 let value='';
 for(let i=start+1;i<text.length;i++) {
  const char=text[i];if(char===quote)return {value,end:i+1};
  if(char!=='\\'){value+=char;continue;}
  const escape=text[++i];if(escape===undefined)return null;
  if(escape==='x'||escape==='u') {
   const length=escape==='x'?2:4,hex=text.slice(i+1,i+1+length);
   if(!new RegExp('^[0-9a-f]{'+length+'}$','i').test(hex))return null;
   value+=String.fromCharCode(parseInt(hex,16));i+=length;
  } else if(escape==='\n')continue;
  else if(escape==='\r'){if(text[i+1]==='\n')i++;}
  else value+=({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',v:'\v','0':'\0'}[escape]??escape);
 }
 return null;
}
function playerResponse(html) {
 const assignment=/\bytInitialPlayerResponse\s*=\s*/g;
 for(const match of html.matchAll(assignment)) {
  const start=match.index+match[0].length;
  try {
   if(html.slice(start,start+10)==='JSON.parse') {
    const prefix=html.slice(start).match(/^JSON\.parse\(\s*/);if(!prefix)continue;
    const literal=readString(html,start+prefix[0].length);
    if(literal&&/^\s*\)/.test(html.slice(literal.end)))return JSON.parse(literal.value);
   } else if(html[start]==='{') {
    let depth=0,inString=false,escaped=false;
    for(let i=start;i<html.length;i++) {
     const char=html[i];
     if(inString){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')inString=false;continue;}
     if(char==='"')inString=true;
     else if(char==='{')depth++;
     else if(char==='}'&&--depth===0)return JSON.parse(html.slice(start,i+1));
    }
   }
  } catch { /* Try another data assignment, never execute its contents. */ }
 }
 return null;
}
function metaValue(html, name) {
 for(const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
  const attributes=Object.fromEntries([...tag[0].matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)].map(m=>[m[1].toLowerCase(),m[3]]));
  if(attributes.itemprop===name)return attributes.content||'';
 }
 return '';
}
function exactDate(value) {
 if(typeof value!=='string')return '';
 const date=value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2}))?$/);
 if(!date||!Number.isFinite(Date.parse(value)))return '';
 const [year,month,day]=date.slice(1,4).map(Number);
 if(month<1||month>12||day<1||day>new Date(Date.UTC(year,month,0)).getUTCDate())return '';
 if(date[4]!==undefined&&(Number(date[4])>23||Number(date[5])>59||Number(date[6])>59))return '';
 return value;
}
function duration(value) {
 if(typeof value==='number'||/^\d+$/.test(value||'')) {
  const seconds=Number(value);return Number.isFinite(seconds)&&seconds>=0?seconds:null;
 }
 const match=String(value||'').match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/);
 return match&&match.slice(1).some(Boolean)?Number(match[1]||0)*3600+Number(match[2]||0)*60+Number(match[3]||0):null;
}
export function parseVideoMetadata(html) {
 if(typeof html!=='string'||!html)return null;
 const player=playerResponse(html);if(!player)return null;
 const details=player.videoDetails||{},micro=player.microformat?.playerMicroformatRenderer||{};
 const videoId=String(details.videoId||''),channelId=String(details.channelId||micro.externalChannelId||'');
 if(!/^[\w-]{11}$/.test(videoId)||!/^UC[\w-]{22}$/.test(channelId))return null;
 if(details.channelId&&micro.externalChannelId&&details.channelId!==micro.externalChannelId)return null;
 const publishedAt=exactDate(micro.publishDate)||exactDate(metaValue(html,'datePublished'));
 return {
  videoId,channelId,publishedAt,
  datePrecision:publishedAt.length===10?'day':publishedAt?'second':null,
  // Eligibility is YouTube's own metadata; preserve an existing catalog classification.
  isShort:typeof micro.isShortsEligible==='boolean'?micro.isShortsEligible:null,
  durationSeconds:duration(details.lengthSeconds)??duration(metaValue(html,'duration')),
  title:details.title||''
 };
}
export async function enrichVideos(items,sources,{concurrency=5,limit=Infinity,fetcher=fetch}={}) {
 if(!Array.isArray(items))return [];
 const output=items.slice(),sourceMap=new Map((Array.isArray(sources)?sources:[]).map(source=>[source.key,source]));
 const maximum=limit===Infinity?Infinity:Number.isFinite(Number(limit))?Math.max(0,Math.floor(Number(limit))):0;
 const jobs=[];
 for(let index=0;index<items.length&&jobs.length<maximum;index++) {
  const item=items[index],source=sourceMap.get(item?.sourceKey);
  if(!item||exactDate(item.publishedAt)||!source||!/^UC[\w-]{22}$/.test(source.channelId)||!/^[\w-]{11}$/.test(item.id||''))continue;
  jobs.push({index,item,source});
 }
 let next=0;
 const workers=Math.min(jobs.length,Math.max(1,Math.min(32,Math.floor(Number(concurrency)||1))));
 await Promise.all(Array.from({length:workers},async()=>{
  while(next<jobs.length) {
   const {index,item,source}=jobs[next++];
   try {
    const response=await fetcher('https://www.youtube.com/watch?v='+item.id,{cache:'no-store',signal:AbortSignal.timeout(20000)});
    if(!response.ok)continue;
    const metadata=parseVideoMetadata(await response.text());
    if(!metadata?.publishedAt||metadata.videoId!==item.id||metadata.channelId!==source.channelId)continue;
    const enriched={...item,publishedAt:metadata.publishedAt,dateSource:'youtube-watch',datePrecision:metadata.datePrecision,metadataCheckedAt:new Date().toISOString()};
    if(!(typeof item.durationSeconds==='number'&&Number.isFinite(item.durationSeconds)&&item.durationSeconds>=0)&&metadata.durationSeconds!==null)enriched.durationSeconds=metadata.durationSeconds;
    if(typeof item.isShort!=='boolean'&&metadata.isShort!==null)enriched.isShort=metadata.isShort;
    output[index]=enriched;
   } catch { /* An unavailable watch page leaves the original entry untouched. */ }
  }
 }));
 return output;
}
