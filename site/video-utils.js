(function(root){
 const aliases={woni:['원이','woni'],liv:['리브','liv'],minami:['미나미','minami'],may:['메이','may'],zena:['제나','zena']};
 const has=(s,word)=>/[a-z]/i.test(word)?new RegExp('(^|[^a-z])'+word+'([^a-z]|$)','i').test(s):s.includes(word);
 function members(v){const named=Object.entries(aliases).filter(([,words])=>words.some(w=>has(String(v.title||'').normalize('NFKC').toLowerCase(),w))).map(([key])=>key);if(named.length)return named;const tags=Object.entries(aliases).filter(([,words])=>words.some(w=>has((v.description||'').normalize('NFKC').toLowerCase(),w))).map(([key])=>key);return tags.length<=2?tags:[];}
 const varietyPrograms=/해피\s*투게더|\bhappy\s*together\b|살롱드립|냉터뷰|매점\s*가요|돌박(?:이일|2일)|리무진\s*서비스|집대성|아이돌\s*인간극장|주간\s*아이돌|아는\s*형님|톡파원\s*25시|아이돌\s*등판|\bIDDP\b|돌들의\s*침묵|놀면\s*뭐하니|런닝맨|전지적\s*참견|전참시/i;
 const musicFormats=/쿨룩\s*LIVE|온더스팟|on[ _-]*the[ _-]*spot|내돌의\s*온도차|내돌차|gap[ _-]*crush|dancEAR|댄스이어|라이브\s*퍼포먼스|live\s*performance|퍼포먼스|안무\s*(?:영상|연습)|댄스\s*(?:연습|커버)|뮤직비디오|\bM\/?V\b|한\s*소절(?:\.?zip|\.zip)/i;
 const musicBroadcast=/music\s*bank|뮤직\s*뱅크|엠카(?:운트다운)?|m\s*countdown|show\s*champion|쇼\s*챔피언|MC\s*석|인기가요|음악\s*중심|music\s*core|더\s*쇼|the\s*show/i;
 const talkEvidence=/토크|초대석|인터뷰|interview|Q\s*&\s*A|음성\s*편지|비하인드\s*스토리|개인기|애교|티키타카|따라하기/i;
 // Reviewed song/dance clips; Happy Together IDs are official LOVE ATTACK performance cuts.
 const reviewedKinds={Jbol54HRcIY:'stage',sxA4Dz_Y_TU:'stage','-64V01VTU1E':'stage',bFObiM72vMU:'stage',ayEy9OGcidY:'stage'};
 function category(v){
  const title=String(v.title||'').normalize('NFKC'),key=v.sourceKey||'';
  if(v.sourceCategory==='anwonn'||key==='anwonn')return 'anwonn';
  if(/직캠|fancam|facecam|페이스캠/i.test(title))return 'fancam';
  if(v.sourceCategory==='official')return 'official';
  if(reviewedKinds[v.id])return reviewedKinds[v.id];
  const program=varietyPrograms.test(title),talk=talkEvidence.test(title);
  const challenge=/챌린지|challenge/i.test(title)&&!/(?:퀴즈|먹방|미션|웃음\s*참기|개인기)/i.test(title);
  // A program title or a shared radio description cannot turn a song-only cut into variety.
  const musicOnly=challenge||musicFormats.test(title)||(!program&&!talk&&key==='1thek_originals'&&musicFormats.test(String(v.description||'').slice(0,500)))||(!program&&!talk&&/라이브|\blive\b/i.test(title));
  if(musicOnly)return 'stage';
  if(!program&&/인터뷰|interview/i.test(title)&&musicBroadcast.test(title))return 'stage';
  if(program||talk)return 'variety';
  // Dedicated show channels also carry clips whose titles omit the program name.
  if(key==='zip_ds'||key==='kbs_happy_together')return 'variety';
  return v.sourceCategory==='stage'?'stage':'other';
 }
 function matches(v,filter){const terms=(filter.query||'').normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean);const searchable=[v.title,v.sourceName,...members(v).flatMap(key=>aliases[key])].join(' ').normalize('NFKC').toLowerCase();return terms.every(term=>searchable.includes(term))&&(!filter.member||members(v).includes(filter.member))&&(!filter.type||category(v)===filter.type||(filter.type==='shorts'&&v.url.includes('/shorts/')))&&(!filter.source||v.sourceKey===filter.source);}
 const api={members,category,matches};root.VideoUtils=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
