const {test}=require('node:test');
const assert=require('node:assert/strict');
const {canonicalTitle,filmIdentity,artwork}=require('./films.cjs');
const {normalize,reachable}=require('./core.cjs');

const key=(title,metadata={},source='https://www.smt-cinema.com/')=>filmIdentity(title,metadata,source).movieKey;
const picture=(overrides={})=>({artwork_url:'https://www.smt-cinema.com/movie_data/T123/T123_leafletimg_r_l.jpg',
 artwork_source_url:'https://www.smt-cinema.com/site/shinjuku/',
 artwork_policy_url:'https://www.smt-cinema.com/aboutsite/',artwork_permission:'personal-use',
 artwork_credit:'画像出典：SMT / © Test Film Committee',...overrides});

test('only presentation labels merge across cinemas while preserving full title',()=>{
 const titles=['架空の映画 【字幕】','【IMAX・字幕】架空の映画','架空の映画 (Dolby Atmos 字幕)','IMAX 架空の映画'];
 for(const title of titles){
  assert.equal(canonicalTitle(title),'架空の映画');
  assert.equal(key(title,{film_id:'smt:T123'}),key('架空の映画',{film_id:'toho:999'},'https://www.tohotheater.jp/'));
 }
 assert.equal(filmIdentity('短縮表示',{canonical_title:'公式の完全な映画名 【字幕】'}).canonicalTitle,'公式の完全な映画名');
});

test('sequels, editions, events and explicit remake years remain distinct',()=>{
 const base=key('架空の映画');
 for(const title of ['架空の映画 2','架空の映画 II','架空の映画（ディレクターズカット）',
  '架空の映画 [Director’s Cut]','架空の映画 完全版','架空の映画 舞台挨拶','架空の映画（1990）'])assert.notEqual(key(title),base,title);
 assert.notEqual(key('架空の映画',{release_year:1990}),key('架空の映画',{release_year:2026}));
 assert.notEqual(key('架空の映画',{release_year:1990}),base);
});

test('truncated headings cannot cross-chain merge even when display text matches',()=>{
 for(const title of ['長い映画名…','長い映画名...']){
  assert.notEqual(key(title,{film_id:'smt:T1'}),key(title,{film_id:'109:1'}));
  assert.notEqual(key(title,{},'https://a.example/'),key(title,{},'https://b.example/'));
  assert.equal(key(title,{film_id:'smt:T1'},'https://a.example/'),key(title,{film_id:'smt:T1'},'https://b.example/'));
 }
});

test('artwork retains official source, policy and source credit',()=>{
 const metadata=picture(),result=artwork(metadata);
 assert.deepEqual(result,{url:metadata.artwork_url,sourceUrl:metadata.artwork_source_url,
  policyUrl:metadata.artwork_policy_url,credit:metadata.artwork_credit});
});

test('artwork requires permission and rejects hostile or non-HTTPS image URLs',()=>{
 for(const url of ['http://www.smt-cinema.com/poster.jpg','https://evil.example/poster.jpg',
  'https://www.smt-cinema.com.evil.example/poster.jpg','https://user:secret@www.smt-cinema.com/poster.jpg',
  'https://www.smt-cinema.com:8443/poster.jpg','data:image/png;base64,AA','javascript:alert(1)','not-a-url']){
  assert.equal(artwork(picture({artwork_url:url})),null,url);
 }
 for(const permission of [null,undefined,'','public','personal-use-unverified'])assert.equal(artwork(picture({artwork_permission:permission})),null);
 for(const field of ['artwork_source_url','artwork_policy_url']){
  for(const url of [undefined,'http://www.smt-cinema.com/','https://user:secret@www.smt-cinema.com/'])
   assert.equal(artwork(picture({[field]:url})),null,`${field}: ${url}`);
 }
});

test('artwork provenance and permission evidence must also be official',()=>{
 for(const field of ['artwork_source_url','artwork_policy_url'])
  assert.equal(artwork(picture({[field]:'https://evil.example/fake-license'})),null,field);
});

test('personal artwork disable switch fails closed',()=>{
 const before=process.env.DISABLE_PERSONAL_ARTWORK;
 try{process.env.DISABLE_PERSONAL_ARTWORK='1';assert.equal(artwork(picture()),null);}
 finally{if(before===undefined)delete process.env.DISABLE_PERSONAL_ARTWORK;else process.env.DISABLE_PERSONAL_ARTWORK=before;}
});

test('current core fixture roundtrips screening metadata and official credit through reachability',()=>{
 const now=Date.parse('2026-10-02T14:30:00Z'); // 23:30 JST
 const metadata={...picture(),film_id:'smt:T123',canonical_title:'架空の映画 【字幕】',release_year:2026};
 const data=[{theater_name:'A cinema',latitude:35.69,longitude:139.7,address:'Tokyo',
  schedule_date:'2026-10-02',verified_at:new Date(now).toISOString(),source_url:'https://www.smt-cinema.com/site/shinjuku/',
  movies:[{title:'短い表示名',showtimes:[{start:'23:50',end:'26:00',runtime_minutes:120,screen:'1',...metadata}]}]}];
 const normalized=normalize(JSON.parse(JSON.stringify(data)),now);
 assert.equal(normalized.rejected,0);
 const screening=normalized.theaters[0].screenings[0];
 assert.equal(screening.sourceFilmId,'smt:T123');
 assert.equal(screening.canonicalTitle,'架空の映画');
 assert.equal(screening.movieKey,key('短い表示名',metadata));
 assert.equal(screening.artwork.credit,metadata.artwork_credit);
 assert.equal(screening.featureStartsAt,Date.parse('2026-10-03T00:00:00+09:00'));
 const results=reachable(normalized.theaters,[{seconds:300,arrivalAt:now+300000,estimated:false}],now,5);
 assert.equal(results.length,1);
 assert.deepEqual(results[0].artwork,screening.artwork);
 assert.equal(results[0].movieKey,screening.movieKey);
});
