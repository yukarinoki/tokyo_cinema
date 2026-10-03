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
// Artwork matching is separate from the persisted v1 watched key.
function artworkMatchKey(title){
 const full=canonicalTitle(title).replace(/[「」『』]/g,'').replace(/[〜～~]/g,'~');
 if(!full || /…|\.\.\.|舞台挨拶|舞台あいさつ|ライブビューイング|ライヴビューイング|生中継|一挙上映|トーク|\bLIVE\b|\bLV\b/i.test(full))return null;
 return full.toLocaleLowerCase().replace(/\s/g,'');
}
function artworkProvider(show){
 const host=String(show.filmSourceHost||'').toLowerCase();
 const domains={'smt-cinema.com':'smt','tohotheater.jp':'toho','tjoy.jp':'tjoy','aeoncinema.com':'aeon','109cinemas.net':'109','unitedcinemas.jp':'united','cinemasunshine.co.jp':'sunshine','humax-cinema.co.jp':'humax'};
 for(const [domain,provider] of Object.entries(domains))if(host===domain||host.endsWith('.'+domain))return provider;
 return show.sourceFilmId?.split(':')[0]?.toLowerCase() || host || null;
}
function resolveArtwork(theaters){
 const shows=theaters.flatMap(t=>t.screenings);
 const groups=new Map();
 for(const show of shows){
  const key=artworkMatchKey(show.canonicalTitle || show.title);
  if(key){if(!groups.has(key))groups.set(key,[]);groups.get(key).push(show);}
 }
 const stats={direct:shows.filter(s=>s.artwork).length,shared:0,missing:0};
 for(const group of groups.values()){
  const donors=group.filter(s=>s.artwork && !s.artwork.sharedFrom).sort((a,b)=>a.artwork.url.localeCompare(b.artwork.url));
  if(!donors.length)continue;
  const years=new Set(group.map(s=>s.releaseYear).filter(Number.isInteger));
  const runtimes=group.map(s=>s.filmRuntimeMinutes).filter(n=>Number.isInteger(n)&&n>0);
  const consistent=runtimes.length>0&&Math.max(...runtimes)-Math.min(...runtimes)<=2;
  const providers=new Set(group.filter(s=>s.filmRuntimeMinutes>0).map(s=>artworkProvider(s)).filter(Boolean));
  for(const target of group){
   if(target.artwork)continue;
   // Unknown years cannot select between same-name remakes.
   if(years.size>1&&!Number.isInteger(target.releaseYear))continue;
   const eligible=donors.filter(d=>{
    if(Number.isInteger(target.releaseYear)&&Number.isInteger(d.releaseYear)&&target.releaseYear!==d.releaseYear)return false;
    if(years.size>1&&d.releaseYear!==target.releaseYear)return false;
    const a=target.filmRuntimeMinutes,b=d.filmRuntimeMinutes;
    if(Number.isInteger(a)&&Number.isInteger(b))return Math.abs(a-b)<=2;
    // A missing target runtime needs agreement from independent source providers.
    return !Number.isInteger(a)&&Number.isInteger(b)&&consistent&&providers.size>=2&&!!target.sourceFilmId;
   });
   if(!eligible.length)continue;
   const donor=eligible.sort((a,b)=>Math.abs((target.filmRuntimeMinutes||a.filmRuntimeMinutes)-a.filmRuntimeMinutes)-Math.abs((target.filmRuntimeMinutes||b.filmRuntimeMinutes)-b.filmRuntimeMinutes)||a.artwork.url.localeCompare(b.artwork.url))[0];
   target.artwork={...donor.artwork,sharedFrom:donor.sourceFilmId||donor.artwork.sourceUrl,
    matchReason:Number.isInteger(target.filmRuntimeMinutes)?'title-runtime':'title-corroborated',
    matchedTitle:donor.canonicalTitle};
   stats.shared++;
  }
 }
 stats.missing=shows.filter(s=>!s.artwork).length;
 return stats;
}
module.exports={canonicalTitle,filmIdentity,artwork,artworkMatchKey,resolveArtwork};
