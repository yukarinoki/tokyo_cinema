const {test}=require('node:test');
const assert=require('node:assert/strict');
const {publicRoute}=require('./public-routing.cjs');
test('public routing uses actual foot/bike profiles, caches, and never estimates transit',async()=>{
 const original=global.fetch;const calls=[];
 global.fetch=async(url)=>{calls.push({url,time:Date.now()});return {ok:true,json:async()=>({code:'Ok',routes:[{duration:556,distance:695.1}]})};};
 try {
  const origin={latitude:35.69092,longitude:139.70026},destination={latitude:35.6901173,longitude:139.7059134};
  const [a,b]=await Promise.all([publicRoute(origin,destination,'walk',Date.now()),publicRoute(origin,destination,'walk',Date.now())]);
  assert.equal(calls.length,1);assert.equal(a.seconds,556);assert.equal(b.estimated,false);
  assert.ok(calls[0].url.includes('routed-foot/route/v1/foot'));
  const cycle=await publicRoute(origin,destination,'bicycle',Date.now());
  assert.ok(calls[1].url.includes('routed-bike/route/v1/bike'));
  assert.ok(calls[1].time-calls[0].time>=1000);
  assert.equal(cycle.distanceMeters,695.1);
  assert.equal(await publicRoute(origin,destination,'transit',Date.now()),null);
 } finally {global.fetch=original;}
});

