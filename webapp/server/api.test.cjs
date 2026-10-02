const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const fixture=path.join(os.tmpdir(),'tokyo-cinema-tests-'+process.pid+'.json');
process.env.SHOWTIMES_FILE=fixture;
delete process.env.GOOGLE_ROUTES_API_KEY;
process.env.DISABLE_PUBLIC_ROUTING='1';
const {search,createServer,googleRoute}=require('./index.cjs');
after(async()=>{await fs.rm(fixture,{force:true});});
test('missing data, stale legacy feeds, and absent transit configuration fail honestly',async()=>{
 await assert.rejects(search({origin:{latitude:35,longitude:139},mode:'walk',margin:-1}));
 await assert.rejects(search({origin:{latitude:35,longitude:139},mode:'walk',margin:10}),/上映データ/);
 await fs.writeFile(fixture,JSON.stringify([{theater_name:'old',scrape_date:'2025-03-31',movies:[]}]));
 const stale=await search({origin:{latitude:35,longitude:139},mode:'transit',margin:10});
 assert.equal(stale.reason,'freshness');assert.equal(stale.results.length,0);
 const now=Date.now(),future=new Date(now+2*3600000+9*3600000).toISOString();
 await fs.writeFile(fixture,JSON.stringify([{theater_name:'TEST FIXTURE',latitude:35,longitude:139,
  schedule_date:future.slice(0,10),verified_at:new Date(now).toISOString(),source_url:'https://example.com',
  movies:[{title:'TEST FIXTURE',showtimes:[future.slice(11,16)]}]}]));
 const transit=await search({origin:{latitude:35,longitude:139},mode:'transit',margin:10,allowEstimates:true});
 assert.equal(transit.reason,'routing');assert.equal(transit.results.length,0);
 const walk=await search({origin:{latitude:35,longitude:139},mode:'walk',margin:10,allowEstimates:true});
 assert.equal(walk.results.length,1);assert.equal(walk.results[0].route.estimated,true);
 const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {
  const url='http://127.0.0.1:'+server.address().port;
  assert.equal((await fetch(url+'/api/status')).status,200);
  assert.equal((await fetch(url+'/api/search',{method:'POST',body:'broken'})).status,400);
  assert.equal((await fetch(url+'/api/search',{method:'POST',headers:{Origin:'https://other.example'},body:'{}'})).status,403);
 } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('transit route includes initial wait and final walk; sends time and field mask',async()=>{
 const original=global.fetch;
 const now=Date.parse('2026-10-02T01:00Z');
 global.fetch=async(url,options)=>{
  const body=JSON.parse(options.body);
  assert.equal(body.departureTime,'2026-10-02T01:00:00.000Z');
  assert.equal(body.travelMode,'TRANSIT');
  assert.ok(options.headers['X-Goog-FieldMask'].includes('stopDetails'));
  return {ok:true,json:async()=>({routes:[{duration:'1200s',legs:[{steps:[
    {staticDuration:'300s'},
    {transitDetails:{stopDetails:{arrivalTime:'2026-10-02T01:30Z'}}},
    {staticDuration:'300s'}
  ]}]}]})};
 };
 try {const result=await googleRoute({latitude:35,longitude:139},{latitude:35.1,longitude:139.1},'transit',now);
 assert.equal(result.seconds,2100);assert.equal(result.arrivalAt,now+2100000);assert.equal(result.estimated,false);}
 finally {global.fetch=original;}
});
