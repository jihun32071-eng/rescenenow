const groupTitle=/리센느|rescene|リセンヌ/i;
const groupTag=/#(?:리센느|rescene|リセンヌ)(?=$|[^\p{L}\p{N}_])/iu;
export function relevantVideo(source,id,title,description='') {
 if(Array.isArray(source.excludeVideoIds)&&source.excludeVideoIds.includes(id))return false;
 if(source.includeAll||source.category==='official')return true;
 if(groupTitle.test(String(title||'').normalize('NFKC')))return true;
 if(Array.isArray(source.includeVideoIds)&&source.includeVideoIds.includes(id))return true;
 return source.matchDescriptionTags===true&&groupTag.test(String(description||'').normalize('NFKC'));
}
