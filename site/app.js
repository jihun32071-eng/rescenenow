// RESCENE NOW — PULSE edition.
const $=id=>document.getElementById(id);
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const nativeApp=false; // This deployment installs through the browser/PWA.
const stamp=s=>{const d=new Date(s);return isNaN(d)?'성공 기록 없음':d.toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'});};
const date=s=>{const d=new Date(s);return isNaN(d)?'게시일 미제공':d.toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric'});};
const day=s=>new Date(s).toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'});
function xml(s){const d=new DOMParser().parseFromString(s,'text/xml');if(d.querySelector('parsererror'))throw Error('피드 해석 실패');return d;}
const text=(n,tag)=>n.getElementsByTagName(tag)[0]?.textContent||'';
async function fetchTimed(url,ms=45000){const c=typeof AbortController!=='undefined'?new AbortController():null;const timer=setTimeout(()=>c?.abort(),ms);try{return await fetch(url,{cache:'no-store',...(c?{signal:c.signal}:{})});}finally{clearTimeout(timer);}}
function external(url){const a=el('a');try{const u=new URL(url);if(u.protocol!=='https:')throw Error();a.href=u.href;}catch{a.href='https://www.youtube.com/@RESCENE_official';}a.target=nativeApp?'_self':'_blank';a.rel='noopener noreferrer';return a;}
let scheduleData={},scheduleBusy=false,scheduleExpanded=false,nextScheduleCheck=Date.now()+300000;
const VIDEO_PAGE_SIZE=12;
let data={},visibleVideos=VIDEO_PAGE_SIZE,newsExpanded=false,busy=false,nextCheck=Date.now()+300000,lastRequest=0;
let filter={member:'',type:'',source:'',query:''};
const typeLabels={anwonn:'안원잘부',official:'공식',variety:'예능',stage:'음악·무대',fancam:'직캠'};
function setFilter(){visibleVideos=VIDEO_PAGE_SIZE;renderVideos();}
function renderVideos(){
 const guide=filter.type==='variety'?'예능 본편부터 하이라이트·선공개·짧은 토크까지 모았습니다. 노래·댄스는 ‘음악·무대’에서 볼 수 있어요.':'';$('category-guide').hidden=!guide;$('category-guide').textContent=guide;
 document.querySelectorAll('button[data-member]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.member===filter.member)));
 document.querySelectorAll('[data-type]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.type===filter.type));const count=(data.items||[]).filter(v=>VideoUtils.matches(v,{...filter,type:b.dataset.type})).length;let badge=b.querySelector('.category-count');if(!badge){badge=el('span','category-count');b.append(badge);}badge.textContent=String(count);});
 $('reset-filters').disabled=!Object.values(filter).some(Boolean);$('reset-filters').hidden=$('reset-filters').disabled;const labels={woni:'원이',liv:'리브',minami:'미나미',may:'메이',zena:'제나'};const active=[filter.type?(filter.type==='shorts'?'Shorts':typeLabels[filter.type]):null,filter.member?labels[filter.member]:null,filter.source?(data.sources||[]).find(s=>s.key===filter.source)?.name:null,filter.query?'검색: '+filter.query:null].filter(Boolean);$('filter-note').hidden=!active.length;$('filter-note').textContent=active.join(' · ');
 const items=(data.items||[]).filter(v=>VideoUtils.matches(v,filter));const sources=data.sources||[];
 const select=$('source-filter');if(select.options.length!==sources.length+1){select.replaceChildren(el('option','','모든 채널'));select.options[0].value='';sources.forEach(s=>{const o=el('option','',s.name);o.value=s.key;select.append(o);});}select.value=filter.source;
 $('video-count').textContent=(Object.values(filter).some(Boolean)?'선택 '+items.length+' / 전체 '+(data.items||[]).length:items.length)+'편';$('video-note').textContent=items.length?'최신 영상부터 · '+Math.min(visibleVideos,items.length)+'편 표시':'';
 $('video-grid').setAttribute('aria-busy','false');const visible=items.slice(0,visibleVideos);$('video-grid').replaceChildren(...visible.map(v=>{
  const a=el('button','video-card');a.type='button';a.setAttribute('aria-label',v.title+' · 바로 재생');a.addEventListener('click',()=>openVideo(v,a));const thumb=el('div','thumb');const img=el('img');img.src=v.thumbnail||'https://i.ytimg.com/vi/'+v.id+'/hqdefault.jpg';img.alt='';img.loading='lazy';img.addEventListener('error',()=>{img.hidden=true;},{once:true});thumb.append(img,el('span','play','▶'));
  if(v.publishedAt&&day(v.publishedAt)===day(new Date()))thumb.append(el('span','new-label','오늘 게시'));
  const kind=VideoUtils.category(v);const short=v.url.includes('/shorts/');const tags=[v.sourceName,typeLabels[kind]&&v.sourceName!==typeLabels[kind]?typeLabels[kind]:null,short?'Shorts':null].filter(Boolean).join(' · ');a.append(thumb,el('span','tag',tags),el('h3','',v.title),el('div','meta',v.publishedAt?date(v.publishedAt):v.publishedLabel||'게시일 미제공'));return a;
 }));
 if(!items.length){const empty=el('div','loading');empty.append(el('p','','해당 영상이 없습니다. 검색어나 필터를 바꿔 보세요.'));const reset=el('button','','모든 영상 보기');reset.type='button';reset.addEventListener('click',resetFilters);empty.append(reset);$('video-grid').append(empty);}
 $('more-videos').hidden=items.length<=visibleVideos;$('more-videos').textContent='영상 '+Math.min(VIDEO_PAGE_SIZE,Math.max(0,items.length-visibleVideos))+'편 더 보기';$('more-videos').setAttribute('aria-expanded',String(visibleVideos>VIDEO_PAGE_SIZE));$('collapse-videos').hidden=visibleVideos<=VIDEO_PAGE_SIZE||items.length<=VIDEO_PAGE_SIZE;
}
function renderNews(){const feed=data.news;if(feed?.publicLinkOnly){$('news-note').textContent='최신 기사는 위의 ‘기사 더 찾기’에서 확인하세요.';$('news-list').replaceChildren();$('more-news').hidden=true;return;}if(!feed?.xml){$('news-note').textContent='뉴스 연결에 실패했습니다. Google 뉴스 링크에서 확인하세요.';return;}
 $('news-note').textContent=(RefreshUtils.stale(feed)?'저장 목록 · ':'')+'최근 기사 · 게시일순';const seen=new Set();
 const items=[...xml(feed.xml).getElementsByTagName('item')].filter(n=>/리센느|rescene/i.test(text(n,'title'))).sort((a,b)=>new Date(text(b,'pubDate'))-new Date(text(a,'pubDate'))).filter(n=>{const key=text(n,'title').replace(/\s+-\s+[^-]+$/,'').replace(/\[[^\]]*\]/g,'').replace(/[“”‘’"']/g,'').replace(/\s+/g,' ').trim();if(seen.has(key))return false;seen.add(key);return true;}).slice(0,12);
 $('news-list').replaceChildren(...(newsExpanded?items:items.slice(0,6)).map((n,i)=>{const a=external(text(n,'link'));a.className='news-item';const copy=el('div');copy.append(el('h3','',text(n,'title')),el('div','meta',(text(n,'source')||'뉴스')+' · '+date(text(n,'pubDate'))));a.append(el('span','news-num',String(i+1).padStart(2,'0')),copy,el('span','news-arrow','↗'));return a;}));
 $('more-news').hidden=items.length<=6;$('more-news').textContent=newsExpanded?'소식 접기':'소식 더 보기';$('more-news').setAttribute('aria-expanded',String(newsExpanded));
 if(!items.length)$('news-list').append(el('p','loading','최근 30일 동안 검색된 기사가 없습니다.'));
}
function diagnostics(){
 const state=RefreshUtils.status(data),publicNews=data.news?.publicLinkOnly,allRows=RefreshUtils.rows(data),rows=publicNews?allRows.slice(0,-1):allRows;
 if(publicNews){state.failed=rows.some(r=>RefreshUtils.stale(r));state.retryMs=state.failed||state.saveFailed?60000:300000;}
 $('video-health').className=state.healthy===state.total&&state.total?'health-ok':'health-error';$('video-health').textContent=state.healthy+' / '+state.total+'개 연결';
 const newsFailed=RefreshUtils.stale(data.news||{});$('news-health').className=publicNews?'meta':newsFailed?'health-error':'health-ok';$('news-health').textContent=publicNews?'뉴스 검색으로 확인':newsFailed?'저장 목록 표시':'연결 정상';
 $('diagnostics').replaceChildren(...rows.map(r=>{const row=el('div','diagnostic-row'),content=el('div');content.append(el('strong','',r.name),el('p','meta','마지막 성공: '+stamp(r.checkedAt)),el('p','meta','마지막 시도: '+stamp(r.attemptedAt||r.checkedAt)));if(r.catalogCheckedAt||r.catalogAttemptedAt){content.append(el('p','meta','과거 목록: '+(r.catalogCount||0)+'편 · '+stamp(r.catalogCheckedAt)));if(r.catalogError)content.append(el('p','health-error','과거 목록 확인 실패 · 저장 영상 유지'));}const failed=RefreshUtils.stale(r);row.append(content,el('span',failed?'health-error':'health-ok',failed?(r.error||'다시 확인 필요'):'연결 정상'));return row;}));
 $('live-indicator').className='live-indicator'+(state.failed||state.saveFailed?' error':'');$('live-indicator').textContent=state.saveFailed?'목록 저장 확인 필요':state.failed?'저장 목록 · 서버 확인 필요':'서버에서 주기적 갱신';
 $('status').textContent=state.lastAttempt?'서버 확인 '+stamp(state.lastAttempt)+(state.failed?' · 일부 연결 실패':''):'연결을 확인해 주세요. 저장한 목록을 표시합니다.';
 return state;
}
function offline(d){for(const f of Object.values(d.channels||{}))f.stale=true;if(d.news)d.news.stale=true;if(d.videos)d.videos.stale=true;return d;}
function pulseFeaturedVideo(){
 const official=(data.items||[]).filter(v=>v.sourceKey==='rescene_official');
 const mv=official.find(v=>/\bwith\b/i.test(v.title)&&/\bM\/?V\b|뮤직비디오|official.*video/i.test(v.title)&&!/teaser|티저|reaction|리액션|behind|비하인드|making|메이킹|preview|프리뷰|dance|안무|challenge|챌린지|highlight|하이라이트|live|라이브|performance|퍼포먼스|cover|커버|shorts/i.test(v.title)&&!v.url?.includes('/shorts/'));
 return mv||official.find(v=>v.id==='JCdkBe3d2b8')||{id:'JCdkBe3d2b8',title:'RESCENE · PULSE Concept Trailer'};
}
function updatePulseFeatured(){const v=pulseFeaturedVideo();$('pulse-play-label').textContent=v.id==='JCdkBe3d2b8'?'공식 영상 재생':'With 뮤직비디오';$('pulse-play').setAttribute('aria-label',v.title+' · 바로 재생');}
$('pulse-play').addEventListener('click',()=>openVideo(pulseFeaturedVideo(),$('pulse-play')));
document.querySelectorAll('[data-pulse-video]').forEach(button=>button.addEventListener('click',()=>openVideo({id:button.dataset.pulseVideo,title:button.dataset.pulseTitle},button)));
function renderAll(){renderVideos();updatePulseFeatured();try{renderNews();}catch{$('news-note').textContent='뉴스를 읽지 못했습니다. 다음 확인 때 다시 시도합니다.';data.news={...data.news,stale:true,error:'피드 해석 실패'};}return diagnostics();}
async function refresh(force=false){
 refreshSchedule(force);if(busy)return;busy=true;lastRequest=Date.now();$('refresh').disabled=true;$('refresh').textContent='확인 중…';$('live-indicator').textContent='업데이트 중';
 try{
  let d;try{const r=await fetchTimed('snapshot.json'+(force?'?t='+Date.now():''));if(!r.ok)throw Error();d=await r.json();if(!RefreshUtils.valid(d))throw Error('피드 형식 오류');}
  catch{const candidates=[data];try{candidates.push(JSON.parse(localStorage.getItem('rescene-feed-cache')||'null'));}catch{}d=RefreshUtils.best(...candidates);if(!d)throw Error('저장 목록 없음');d=offline(JSON.parse(JSON.stringify(d)));}
  data=d;const state=renderAll();try{localStorage.setItem('rescene-feed-cache',JSON.stringify(data));}catch{}
  const serverNext=Date.parse(data.refresh?.nextCheckAt);nextCheck=Date.now()+300000; // Re-read published data; this does not start a collection job.
  if(Number.isFinite(serverNext)&&serverNext>Date.now())nextCheck=Math.min(nextCheck,serverNext);
 }catch{$('live-indicator').textContent='연결 확인 필요';$('live-indicator').className='live-indicator error';$('status').textContent='최신 저장 목록을 읽지 못했습니다. 인터넷 연결을 확인해 주세요. 1분 후 다시 읽습니다.';nextCheck=Date.now()+60000;}
 finally{busy=false;$('refresh').disabled=false;$('refresh').textContent='↻ 새로고침';updateClock();}
}
function updateClock(){$('today-label').textContent=new Date().toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'short'});const left=Math.max(0,Math.ceil((nextCheck-Date.now())/1000));$('next-check').textContent=busy?'지금 확인 중':document.hidden?'복귀 시 확인':'다음 확인 '+Math.floor(left/60)+':'+String(left%60).padStart(2,'0');}
document.querySelectorAll('button[data-member]').forEach(b=>b.addEventListener('click',()=>{if(b.classList.contains('member-card')){filter={member:b.dataset.member,type:'',source:'',query:''};$('video-search').value='';setFilter();$('videos').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}else{filter.member=b.dataset.member;setFilter();}}));document.querySelectorAll('[data-type]').forEach(b=>b.addEventListener('click',()=>{filter.type=b.dataset.type;setFilter();}));$('source-filter').addEventListener('change',()=>{filter.source=$('source-filter').value;setFilter();});$('more-news').addEventListener('click',()=>{newsExpanded=!newsExpanded;renderNews();});$('more-videos').addEventListener('click',()=>{visibleVideos+=VIDEO_PAGE_SIZE;renderVideos();});$('collapse-videos').addEventListener('click',()=>{visibleVideos=VIDEO_PAGE_SIZE;renderVideos();$('videos').scrollIntoView({block:'start'});});$('refresh').addEventListener('click',()=>refresh(true));
document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(Date.now()-lastRequest>30000)refresh(true);updateAlerts();}});window.addEventListener('online',()=>refresh(true));setInterval(()=>{updateClock();if(!document.hidden&&!busy&&Date.now()>=nextCheck)refresh(true);if(!document.hidden&&!scheduleBusy&&Date.now()>=nextScheduleCheck)refreshSchedule(true);},1000);
function resetFilters(){filter={member:'',type:'',source:'',query:''};$('video-search').value='';setFilter();}
$('video-search').value=filter.query||'';if(filter.member||filter.source)$('advanced-filters').open=true;
$('video-search').addEventListener('input',()=>{filter.query=$('video-search').value;setFilter();});$('reset-filters').addEventListener('click',resetFilters);
let alertsEnabled=false;
async function updateAlerts(){}
document.querySelector('.alert-tools').hidden=!nativeApp;
let shareUrl='',shareTemporary=false,shareComputerRequired=false,shareLoading=null;
function safeShareUrl(value){try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||/^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[|169\.254\.)/i.test(u.hostname)||u.hostname.endsWith('.localhost')||!u.hostname.includes('.'))return '';u.search='';u.hash='';return u.href;}catch{return '';}}
function showShareStatus(message,url=''){$('share-status').hidden=false;$('share-status').replaceChildren(document.createTextNode(message));if(url){const link=external(url);link.textContent=url;link.className='share-link';$('share-status').append(document.createTextNode(' '),link);}}
function shareAvailability(){if(shareUrl&&!nativeApp)$('install-note').textContent='휴대폰에서도 이 주소를 열고 Chrome 메뉴에서 앱으로 설치할 수 있어요.';}
async function loadShareUrl(){shareUrl=safeShareUrl(new URL('./',document.baseURI).href);shareTemporary=false;shareComputerRequired=false;if(shareUrl)shareAvailability();return shareUrl;}
$('share').addEventListener('click',async()=>{const button=$('share');if(!shareUrl){button.disabled=true;await loadShareUrl();button.disabled=false;if(shareUrl){showShareStatus('공유 링크가 준비됐어요. ‘공유’를 한 번 더 눌러 주세요.');return;}showShareStatus('공유 링크를 준비 중입니다. 잠시 후 다시 눌러 주세요.');return;}button.disabled=true;try{if(navigator.share){try{await navigator.share({title:'RESCENE NOW · 리센느의 오늘',text:'리센느 영상과 소식을 함께 봐요.',url:shareUrl});showShareStatus('공유했어요.'+(shareComputerRequired?' 컴퓨터와 공유 프로그램이 켜져 있을 때 사용할 수 있습니다.':''));return;}catch(error){if(error.name==='AbortError')return;}}if(!navigator.clipboard?.writeText)throw Error();await navigator.clipboard.writeText(shareUrl);showShareStatus('링크를 복사했어요. 휴대폰에 붙여넣어 보내세요.'+(shareComputerRequired?' 컴퓨터와 공유 프로그램이 켜져 있을 때 사용할 수 있습니다.':''));}catch{showShareStatus('자동 복사를 하지 못했어요. 아래 주소를 길게 누르거나 선택해 복사하세요.',shareUrl);}finally{button.disabled=false;}});
loadShareUrl();document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadShareUrl();});
let installPrompt;if(nativeApp){$('share').hidden=true;document.querySelector('.install-tools').hidden=true;$('install').hidden=true;document.querySelector('.app-download').hidden=true;$('install-note').textContent='안드로이드 앱 1.17.0';}else{
 window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;});$('install').addEventListener('click',async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;}else $('install-note').textContent='Edge 또는 Chrome 메뉴에서 이 사이트를 앱으로 설치할 수 있습니다.';});if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js',{scope:'./'}).catch(()=>{});
}
let playerTrigger=null;
function openVideo(video,trigger){
 if(!/^[A-Za-z0-9_-]{11}$/.test(video.id))return;
 document.querySelector('.player-note').textContent='재생이 시작되지 않으면 ▶를 눌러 주세요. 삽입 재생이 제한된 영상은 이곳에서 볼 수 없습니다.';playerTrigger=trigger;$('player-title').textContent=video.title;
 const frame=el('iframe');frame.title=video.title+' 재생';frame.referrerPolicy='strict-origin-when-cross-origin';frame.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';frame.allowFullscreen=true;
 frame.src='https://www.youtube.com/embed/'+video.id+'?playsinline=1&rel=0&autoplay=1';
 $('player-frame').replaceChildren(frame);$('video-player').showModal();$('close-player').focus();
}
function closeVideoPlayer(){$('player-frame').replaceChildren();if($('video-player').open)$('video-player').close();}
$('close-player').addEventListener('click',closeVideoPlayer);
$('fullscreen-player').addEventListener('click',async()=>{const frame=$('player-frame');try{if(document.fullscreenElement){await document.exitFullscreen();}else if(frame.requestFullscreen){await frame.requestFullscreen();}else if(frame.webkitRequestFullscreen){frame.webkitRequestFullscreen();}else{throw Error();}}catch{document.querySelector('.player-note').textContent='화면을 넓게 표시했습니다. 동영상 안의 ⛶ 버튼을 누르거나 휴대폰을 가로로 돌려 보세요.';}});
document.addEventListener('fullscreenchange',()=>{$('fullscreen-player').textContent=document.fullscreenElement?'⛶ 전체 화면 종료':'⛶ 전체 화면';});
$('video-player').addEventListener('click',event=>{if(event.target===$('video-player')){const b=$('video-player').getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)closeVideoPlayer();}});
$('video-player').addEventListener('close',()=>{if($('video-player').open)return;$('player-frame').replaceChildren();if(playerTrigger?.isConnected)playerTrigger.focus();playerTrigger=null;});

const scheduleKinds={broadcast:'방송',event:'행사',release:'발매'};
function renderSchedule(){
 const calendars=(scheduleData.calendars||[]).map(c=>({...c,stale:RefreshUtils.stale(c)})),events=ScheduleUtils.events({...scheduleData,calendars}),failed=calendars.some(c=>c.stale),hasLive=calendars.some(c=>c.checkedAt&&!c.stale);
 $('schedule-count').textContent=events.length+'개';
 $('schedule-note').textContent=(hasLive?'공식 캘린더 + 확인된 행사 공지':failed?'저장한 공개 일정 · 연결 재시도 중':'확인된 공개 공지')+' · 오늘 포함 90일 · '+(scheduleExpanded?'전체 '+events.length+'개 표시':'5개 표시')+' · 한국 시간';
 $('schedule-list').replaceChildren(...(scheduleExpanded?events:events.slice(0,5)).map(event=>{
  const key=event.allDay?event.start.slice(0,10):day(event.start),d=new Date(key+'T12:00:00+09:00'),row=el('article','schedule-row'),dateBox=el('div','schedule-date');dateBox.append(el('span','',Number(key.slice(5,7))+'월'),el('strong','',String(Number(key.slice(8,10)))),el('span','',d.toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul',weekday:'short'})));
  const copy=el('div','schedule-copy');let time=event.allDay?(event.labelName==='기념일'?'종일':'시간 미공개'):new Date(event.start).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false});if(event.note?.includes('인터뷰 코너'))time+=' 방송 시작';if(event.displayTime)time=event.displayTime;
  const birthNames={WONI:'원이',LIV:'리브',MINAMI:'미나미',MAY:'메이',ZENA:'제나'};const birth=event.title.match(/HAPPY (WONI|LIV|MINAMI|MAY|ZENA) DAY/i);const displayTitle=birth?'🎉 '+birthNames[birth[1].toUpperCase()]+' 생일':event.title;
  copy.append(el('div','schedule-type',(event.labelName||scheduleKinds[event.kind]||'일정')+' · '+time),el('h3','',displayTitle));if(event.status==='tentative')copy.append(el('span','schedule-status','미확정'));if(event.location)copy.append(el('p','meta',event.location));if(event.note)copy.append(el('p','schedule-note-text',event.note));
  const source=external(event.sourceUrl);source.className='schedule-source';source.textContent=(event.sourceName||'출처')+(!event.sourceUrl.includes('artist.mnetplus.world')&&(event.verifiedAt||scheduleData.curated?.verifiedAt)?' · '+new Date(event.verifiedAt||scheduleData.curated.verifiedAt).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric'})+' 확인':'')+' ↗';copy.append(source);if(event.verificationUrl){const proof=external(event.verificationUrl);proof.className='schedule-source';proof.textContent='출연 확인 ↗';copy.append(proof);}row.append(dateBox,copy);return row;
 }));
 if(!events.length)$('schedule-list').append(el('p','loading','현재 확인된 오늘·다가오는 일정이 없습니다. 새 공지가 나오면 확인해 반영합니다.'));
 $('more-schedule').hidden=events.length<=5;$('more-schedule').textContent=scheduleExpanded?'일정 접기':'일정 '+events.length+'개 전체 보기';$('more-schedule').setAttribute('aria-expanded',String(scheduleExpanded));
}
async function refreshSchedule(force=false){
 if(scheduleBusy)return;scheduleBusy=true;
 try{const response=await fetchTimed('schedule-snapshot.json'+(force?'?t='+Date.now():''));if(!response.ok)throw Error();const result=await response.json();if(!Array.isArray(result.curated?.events)||!Array.isArray(result.calendars))throw Error();scheduleData=result;try{localStorage.setItem('rescene-schedule-cache',JSON.stringify(result));}catch{}}
 catch{if(!scheduleData.curated){try{scheduleData=JSON.parse(localStorage.getItem('rescene-schedule-cache')||'null')||{};}catch{}}if(!scheduleData.curated){try{const result=await fetchTimed('schedule-curated.json',8000);if(!result.ok)throw Error();scheduleData={curated:await result.json(),calendars:[]};}catch{scheduleData={curated:{events:[]},calendars:[]};}}scheduleData.calendars=(scheduleData.calendars||[]).map(c=>({...c,stale:true}));scheduleData.offline=true;}
 finally{scheduleBusy=false;nextScheduleCheck=Date.now()+(scheduleData.offline?60000:300000);renderSchedule();if(scheduleData.offline)$('schedule-note').textContent='저장한 공개 일정 · 연결 재시도 중 · 한국 시간';}
}
$('more-schedule').addEventListener('click',()=>{scheduleExpanded=!scheduleExpanded;renderSchedule();});
try{const stored=JSON.parse(localStorage.getItem('rescene-schedule-cache')||'null');if(Array.isArray(stored?.curated?.events)){scheduleData=stored;renderSchedule();}}catch{}

try{const stored=JSON.parse(localStorage.getItem('rescene-feed-cache')||'null');if(RefreshUtils.valid(stored)){data=stored;renderAll();}}catch{}
if(!RefreshUtils.valid(data))fetchTimed('snapshot.json',8000).then(r=>r.ok?r.json():null).then(cached=>{if(!RefreshUtils.valid(data)&&RefreshUtils.valid(cached)){data=cached;renderAll();}}).catch(()=>{});
updateClock();refresh(true);updateAlerts();
