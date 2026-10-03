const {test}=require('node:test');
const assert=require('node:assert/strict');
const {filmIdentity,artworkMatchKey,resolveArtwork}=require('./films.cjs');
const {normalize}=require('./core.cjs');
const originalArt={url:'https://www.smt-cinema.com/movie_data/T1/T1.jpg',
 sourceUrl:'https://www.smt-cinema.com/site/shinjuku/',policyUrl:'https://www.smt-cinema.com/aboutsite/',
 credit:'SMT official / © Fictional Film Committee'};
function show(overrides={}){
 const value={title:'架空の映画',canonicalTitle:'架空の映画',sourceFilmId:'109:7',filmSourceHost:'109cinemas.net',
  filmRuntimeMinutes:120,releaseYear:2026,artwork:null,...overrides};
 value.movieKey=filmIdentity(value.title,{canonical_title:value.canonicalTitle,film_id:value.sourceFilmId,release_year:value.releaseYear}).movieKey;
 return value;
}
const donor=(overrides={})=>show({sourceFilmId:'smt:T1',filmSourceHost:'www.smt-cinema.com',artwork:{...originalArt},...overrides});
const resolve=(...shows)=>resolveArtwork(shows.map((screening,i)=>({name:`Cinema ${i}`,screenings:[screening]})));

test('same-film presentation/quote aliases share artwork with runtime differences 0, 1 and 2',()=>{
 assert.equal(artworkMatchKey('【字幕】「架空の映画」～旅～'),artworkMatchKey('架空の映画 ~旅~ (IMAX)'));
 for(const delta of [0,1,2,-1,-2]){
  const from=donor({canonicalTitle:'【字幕】「架空の映画」～旅～'});
  const target=show({canonicalTitle:'架空の映画 ~旅~ (IMAX)',filmRuntimeMinutes:120+delta});
  assert.deepEqual(resolve(from,target),{direct:1,shared:1,missing:0});
  assert.equal(target.artwork.url,from.artwork.url);
  assert.equal(target.artwork.matchReason,'title-runtime');
 }
});

test('runtime differences greater than two minutes never share',()=>{
 for(const delta of [3,-3,20]){
  const target=show({filmRuntimeMinutes:120+delta});
  resolve(donor(),target);assert.equal(target.artwork,null);
 }
});

test('editions, sequels and explicit remake years remain isolated',()=>{
 for(const title of ['架空の映画 2','架空の映画 II','架空の映画（ディレクターズカット）','架空の映画 完全版']){
  const target=show({canonicalTitle:title,title});resolve(donor(),target);assert.equal(target.artwork,null,title);
 }
 const target=show({releaseYear:1990});resolve(donor({releaseYear:2026}),target);assert.equal(target.artwork,null);
});

test('truncation and event headings never share even with identical title and runtime',()=>{
 for(const title of ['長い映画名…','長い映画名...','架空の映画 舞台挨拶','架空の映画 ライブビューイング','架空の映画 トーク付き']){
  assert.equal(artworkMatchKey(title),null,title);
  const target=show({title,canonicalTitle:title});resolve(donor({title,canonicalTitle:title}),target);assert.equal(target.artwork,null,title);
 }
});

test('missing target runtime requires two independent providers with consistent known runtimes',()=>{
 const target=show({filmRuntimeMinutes:null});
 resolve(donor(),target);assert.equal(target.artwork,null);
 resolve(donor(),show({sourceFilmId:'smt:T2',filmSourceHost:'www.smt-cinema.com',filmRuntimeMinutes:121}),target);
 assert.equal(target.artwork,null,'multiple theaters of one provider do not corroborate');
 resolve(donor(),show({sourceFilmId:'toho:8',filmSourceHost:'www.tohotheater.jp',filmRuntimeMinutes:122}),target);
 assert.equal(target.artwork.matchReason,'title-corroborated');
 const conflict=show({filmRuntimeMinutes:null});
 resolve(donor(),show({sourceFilmId:'toho:8',filmRuntimeMinutes:123}),conflict);assert.equal(conflict.artwork,null);
 const unidentified=show({filmRuntimeMinutes:null,sourceFilmId:null});
 resolve(donor(),show({sourceFilmId:'toho:8'}),unidentified);assert.equal(unidentified.artwork,null);
});

test('provider identity remains one provider when one record lacks a source film ID',()=>{
 const target=show({filmRuntimeMinutes:null});
 resolve(donor(),show({sourceFilmId:null,filmSourceHost:'www.smt-cinema.com',filmRuntimeMinutes:121}),target);
 assert.equal(target.artwork,null,'SMT ID prefix and SMT host are not independent providers');
});

test('host fallback cannot count subdomains of the same cinema provider independently',()=>{
 const target=show({filmRuntimeMinutes:null});
 resolve(donor({sourceFilmId:null,filmSourceHost:'www.tohotheater.jp'}),
  show({sourceFilmId:null,filmSourceHost:'api2.tohotheater.jp',filmRuntimeMinutes:121}),target);
 assert.equal(target.artwork,null,'TOHO subdomains are the same provider');
});

test('conflicting release years block an unknown-year recipient',()=>{
 const unknown=show({releaseYear:null});
 resolve(donor({releaseYear:1990}),donor({sourceFilmId:'smt:T2',releaseYear:2026}),unknown);
 assert.equal(unknown.artwork,null);
 const known=show({releaseYear:2026});
 const newFilm=donor({sourceFilmId:'smt:T2',releaseYear:2026});
 resolve(donor({releaseYear:1990}),newFilm,known);assert.equal(known.artwork.sharedFrom,'smt:T2');
});

test('direct artwork and source credit/policy links survive reuse unchanged; watched keys stay stable',()=>{
 const from=donor(),target=show(),before={...from.artwork},keys=[from.movieKey,target.movieKey];
 const directReference=from.artwork;
 resolve(from,target);
 assert.equal(from.artwork,directReference);assert.deepEqual(from.artwork,before);
 for(const field of ['url','sourceUrl','policyUrl','credit'])assert.equal(target.artwork[field],before[field]);
 assert.equal(target.artwork.sharedFrom,'smt:T1');
 assert.deepEqual([from.movieKey,target.movieKey],keys);
});

test('core normalization adds shared artwork without changing the persisted watched movie key',()=>{
 const now=Date.parse('2026-10-02T14:30Z');
 const cinema=(name,source,film,extra={})=>({theater_name:name,latitude:35.69,longitude:139.7,address:'Tokyo',
  schedule_date:'2026-10-02',verified_at:new Date(now).toISOString(),source_url:source,
  movies:[{title:'架空の映画',film_id:film,release_year:2026,runtime_minutes:120,
   showtimes:[{start:'23:50',end:'26:00',screen:'1',...extra}]}]});
 const recipient=cinema('109 cinema','https://109cinemas.net/kiba/','109:7');
 const source=cinema('SMT cinema',originalArt.sourceUrl,'smt:T1',{artwork_url:originalArt.url,
  artwork_source_url:originalArt.sourceUrl,artwork_policy_url:originalArt.policyUrl,
  artwork_credit:originalArt.credit,artwork_permission:'personal-use'});
 const before=normalize([recipient],now).theaters[0].screenings[0];
 const result=normalize([recipient,source],now),after=result.theaters[0].screenings[0];
 assert.equal(before.artwork,null);assert.equal(after.artwork.url,originalArt.url);
 assert.equal(before.movieKey,after.movieKey);assert.equal(after.artwork.credit,originalArt.credit);
 assert.deepEqual(result.artworkCoverage,{direct:1,shared:1,missing:0});
});
