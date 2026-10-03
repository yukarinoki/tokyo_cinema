const {createHash}=require('node:crypto');
// Remove only presentation/language labels, never editions, sequels, years or events.
const formatTokens=/(?:日本語字幕付?|英語字幕付?|日本語字幕|字幕版?|吹替版?|吹き替え|字|吹|IMAX(?:レーザー)?|ULTRA4DX|4DX|MX4D|SCREENX|DOLBY[\s-]*(?:CINEMA|ATMOS)|DC|ATMOS|2D|3D|35mm|インフィニティビジョン|INFINITY[\s-]*VISION|IV)/ig;
function onlyFormat(text){return text.replace(formatTokens,'').replace(/[\s・+／/,、-]/g,'')==='';}
function canonicalTitle(title){
 let value=String(title||'').normalize('NFKC').trim();
 value=value.replace(/[【\[（(]([^】\]）)]+)[】\]）)]/g,(whole,inside)=>onlyFormat(inside)?' ':whole);
 // Plain edge tags occur in cinema headings; bounded so real title words survive.
 const edge=/^(?:IMAX|4DX|ULTRA4DX|MX4D|SCREENX|DOLBY\s*(?:CINEMA|ATMOS)|字幕|吹替|インフィニティビジョン|INFINITY\s+VISION)(?:\s+|$)/i;
 while(edge.test(value))value=value.replace(edge,'').trim();
 value=value.replace(/\s+(?:IMAX|4DX(?:2D)?|SCREENX\s*2D|Dolby\s*Atmos)$/i,'');
 return value.replace(/\s+/g,' ').trim();
}
function filmIdentity(title,metadata={},source=''){
 const full=canonicalTitle(metadata.canonical_title||title);
 const sourceId=metadata.source_film_id||metadata.film_id||'';
 // Truncated headings cannot identify a film across chains.
 const truncated=/…|\.\.\./.test(full);
 const year=Number.isInteger(metadata.release_year)?String(metadata.release_year):'';
 const identity=truncated ? ['source',sourceId||source,full] : ['title',full.toLocaleLowerCase().replace(/\s/g,''),year];
 return {movieKey:'film-v1:'+createHash('sha256').update(identity.join('|')).digest('hex').slice(0,32),canonicalTitle:full,sourceFilmId:sourceId||null};
}
const imageHosts=new Set(['www.smt-cinema.com','smt-cinema.com','www.tohotheater.jp','hlo.tohotheater.jp','tjoy.jp','cdn.tjoy.jp']);
function officialUrl(value,hosts){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&(!hosts||hosts.has(u.hostname))?u.href:null;}catch{return null;}}
const sourceHosts=new Set([...imageHosts,'api2.tohotheater.jp']);
function artwork(metadata){
 const url=officialUrl(metadata.artwork_url,imageHosts),sourceUrl=officialUrl(metadata.artwork_source_url,sourceHosts),policyUrl=officialUrl(metadata.artwork_policy_url,sourceHosts);
 if(!url||!sourceUrl||!policyUrl||metadata.artwork_permission!=='personal-use'||process.env.DISABLE_PERSONAL_ARTWORK==='1')return null;
 return {url,sourceUrl,policyUrl,credit:String(metadata.artwork_credit||'画像出典：映画館公式サイト').slice(0,500)};
}
module.exports={canonicalTitle,filmIdentity,artwork};
