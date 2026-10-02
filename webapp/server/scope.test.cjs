const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const file=path.join(os.tmpdir(),'tokyo-scope-'+process.pid+'.json');
process.env.SHOWTIMES_FILE=file;
delete process.env.GOOGLE_ROUTES_API_KEY;
delete process.env.DISABLE_PUBLIC_ROUTING;
const queried=[];
const routingPath=require.resolve('./public-routing.cjs');
require(routingPath);
require.cache[routingPath].exports.publicRoute=async(origin,theater,mode,now)=>{
 queried.push(theater.name);return {seconds:60,arrivalAt:now+60000,checkedAt:now,estimated:false,source:'TEST ROAD ROUTE'};
};
const {search}=require('./index.cjs');
after(()=>fs.rm(file,{force:true}));
test('nearest ten physical cinemas, explicit omissions, scope override and midnight deduplication',async()=>{
 const now=Date.now(), future=new Date(now+2*3600000+9*3600000).toISOString();
 const rows=Array.from({length:12},(_,i)=>({theater_name:'TEST '+i,latitude:35.7,longitude:139.7+i/100,
  source_url:'https://example.com',verified_at:new Date(now).toISOString(),schedule_date:future.slice(0,10),
  movies:[{title:'TEST FILM',showtimes:[future.slice(11,16)]}]})).reverse();
 await fs.writeFile(file,JSON.stringify([...rows,rows[11]]));
 const input={origin:{latitude:35.7,longitude:139.7},mode:'walk',margin:10};
 const response=await search(input);
 assert.equal(queried.length,10);assert.deepEqual(queried,Array.from({length:10},(_,i)=>'TEST '+i));
 assert.equal(response.checkedTheaters,12);assert.equal(response.results.length,10);
 assert.deepEqual(response.omittedTheaters,['TEST 10','TEST 11']);
 assert.ok(response.warnings.some(w=>w.includes('対象外は2館')));
 queried.length=0;
 const scoped=await search({...input,cinemaScope:'TEST 11'});
 assert.deepEqual(queried,['TEST 11']);assert.equal(scoped.results.length,1);
});
