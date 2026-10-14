(function(root){
 const time=value=>Number.isFinite(Date.parse(value))?Date.parse(value):0;
 function valid(data){return data&&Array.isArray(data.items)&&Array.isArray(data.sources)&&data.channels&&typeof data.channels==='object';}
 function rows(data){return [...(data.sources||[]).map(source=>({name:source.name,...data.channels?.[source.key]})),{name:'뉴스',...data.news}];}
 function stale(row,now=Date.now()){return !row.checkedAt||row.stale===true||now-time(row.checkedAt)>90*60*1000;}
 function status(data,now=Date.now()){const entries=rows(data),videos=entries.slice(0,-1),lastAttempt=Math.max(0,...entries.map(r=>time(r.attemptedAt||r.checkedAt))),failed=entries.some(r=>stale(r,now)),saveFailed=Boolean(data.refresh?.persistenceError);return {healthy:videos.filter(r=>!stale(r,now)).length,total:videos.length,failed,saveFailed,lastAttempt:lastAttempt?new Date(lastAttempt).toISOString():null,retryMs:failed||saveFailed?60000:300000};}
 function best(...datasets){return datasets.filter(valid).sort((a,b)=>Math.max(0,...rows(b).map(r=>time(r.checkedAt)))-Math.max(0,...rows(a).map(r=>time(r.checkedAt))))[0];}
 const api={valid,rows,stale,status,best};root.RefreshUtils=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
