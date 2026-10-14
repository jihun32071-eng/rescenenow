// Static hosting service worker. Scope-relative URLs also work on /repository/ Pages sites.
const BASE=new URL('./',self.registration.scope);
const PREFIX='rescene-pages-'+encodeURIComponent(BASE.pathname)+'-';
const CACHE=PREFIX+'fcafcb111cad62e1';
const SHELL=['./','index.html','style.css','app.js','video-utils.js','refresh-utils.js','schedule-utils.js','schedule-curated.json','manifest.webmanifest','icon-192.png','icon-512.png'].map(file=>new URL(file,BASE).href);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
async function savedSnapshot(response,name){
 const data=await response.json();
 if(name==='snapshot.json'){Object.values(data.channels||{}).forEach(row=>row.stale=true);if(data.news)data.news.stale=true;if(data.videos)data.videos.stale=true;data.offline=true;}
 else{data.calendars=(data.calendars||[]).map(row=>({...row,stale:true}));data.offline=true;}
 return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json;charset=utf-8'}});
}
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==BASE.origin||!url.pathname.startsWith(BASE.pathname))return;
 const name=url.pathname.slice(BASE.pathname.length),snapshot=name==='snapshot.json'||name==='schedule-snapshot.json';
 const key=new URL(name||'./',BASE).href;
 if(!snapshot&&!SHELL.includes(key))return;
 event.respondWith((async()=>{
  try{const response=await fetch(event.request,{cache:'no-store'});if(!response.ok)throw new Error('Network response '+response.status);const cache=await caches.open(CACHE);await cache.put(key,response.clone());return response;}
  catch{const saved=await caches.match(key);if(saved)return snapshot?savedSnapshot(saved,name):saved;return new Response(snapshot?'{}':'Offline',{status:503,headers:{'Content-Type':snapshot?'application/json':'text/plain'}});}
 })());
});
