// FOSSGIS public service policy: max 1 request/sec, no bulk/heavy use.
// Local interactive searches only, serialized, bounded and cached.
const cache = new Map();
let queue = Promise.resolve();
let lastRequest = 0;
async function publicRoute(origin,destination,mode,now) {
  if (!['walk','bicycle'].includes(mode)) return null;
  const profile = mode === 'walk' ? 'foot' : 'bike';
  const key = [origin.latitude,origin.longitude,destination.latitude,destination.longitude,profile].join(',');
  let pending = cache.get(key);
  if(!pending || pending.expires < Date.now()) {
    const promise = queue.then(async()=>{
      const delay = Math.max(0,1100-(Date.now()-lastRequest));
      if(delay) await new Promise(resolve=>setTimeout(resolve,delay));
      lastRequest = Date.now();
      const points = origin.longitude+','+origin.latitude+';'+destination.longitude+','+destination.latitude;
      const url = 'https://routing.openstreetmap.de/routed-'+profile+'/route/v1/'+profile+'/'+points+'?overview=false&steps=false';
      const response = await fetch(url,{headers:{'User-Agent':'TokyoCinemaFinder/1.0 (+https://github.com/yukarinoki/tokyo_cinema)'},signal:AbortSignal.timeout(10000)});
      if(!response.ok) throw new Error('Public routing unavailable');
      const data=await response.json();
      const route=data.code==='Ok' && data.routes?.[0];
      if(!route || !Number.isFinite(route.duration) || route.duration<0) return null;
      return {seconds:Math.ceil(route.duration),distanceMeters:route.distance};
    });
    queue = promise.catch(()=>{});
    pending = {promise,expires:Date.now()+10*60000};
    if(cache.size>=100)cache.delete(cache.keys().next().value);
    cache.set(key,pending);
    promise.catch(()=>cache.delete(key));
  }
  const result=await pending.promise;
  return result ? {...result,arrivalAt:Date.now()+result.seconds*1000,estimated:false,
    source:'FOSSGIS / OpenStreetMap（道路経路の所要時間目安）',checkedAt:Date.now()} : null;
}
module.exports={publicRoute};

