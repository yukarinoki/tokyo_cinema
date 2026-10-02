const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { coordinates, distance, estimate, normalize, reachable } = require('./core.cjs');
const { publicRoute } = require('./public-routing.cjs');
const PUBLIC_ROUTING = process.env.DISABLE_PUBLIC_ROUTING !== '1';
const ROOT = path.resolve(__dirname, '..');
const FEED = path.resolve(process.env.SHOWTIMES_FILE || path.join(ROOT,'public/data/movie_schedules_latest.json'));
const GOOGLE_KEY = process.env.GOOGLE_ROUTES_API_KEY;
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '127.0.0.1';
const PREVIEW_ORIGINS = (process.env.PREVIEW_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean);
let feedRefresh = null;
let lastRefreshAttempt = 0;
let refreshFailure = '';
async function ensureCurrentFeed() {
  if(process.env.SHOWTIMES_FILE || process.env.DISABLE_SHOWTIME_REFRESH==='1') return '';
  try {
    const rows=JSON.parse(await fs.readFile(FEED,'utf8'));
    if(rows.length && rows.every(t=>t.collector==='tokyo-official-v1' && Date.now()-Date.parse(t.verified_at)<30*60000)) return '';
  } catch {}
  if(!feedRefresh && Date.now()-lastRefreshAttempt>=30*60000) {
    lastRefreshAttempt=Date.now();
    const {execFile}=require('node:child_process');
    // Slow, rate-limited source reads run in the background. Keep searches responsive.
    feedRefresh=new Promise(resolve=>{
      execFile(process.env.PYTHON_EXECUTABLE || 'python',[path.resolve(ROOT,'../scrape/verified_tokyo.py')],{
        cwd:path.resolve(ROOT,'..'),windowsHide:true,timeout:15*60000,maxBuffer:65536,
        env:{...process.env,PYTHONIOENCODING:'utf-8'}
      },error=>{refreshFailure=error?'公式上映データの更新に失敗しました。取得済み情報の確認日時に注意してください。':'';resolve();});
    }).finally(()=>{feedRefresh=null;});
  }
  return feedRefresh?'公式上映データをバックグラウンド更新中です。取得済みの確認済みデータを表示します。':refreshFailure;
}
let geocodeNext = 0;
const geocodeCache = new Map();
function fail(message,status=400) { return Object.assign(new Error(message),{status}); }
async function jsonFetch(url, options={}) {
  const response = await fetch(url,{...options,signal:AbortSignal.timeout(12000)});
  if (!response.ok) throw fail('外部サービスに接続できません。時間をおいて再検索してください。',502);
  return response.json();
}
async function geocode(q) {
  if (!q || q.length > 180) throw fail('住所・駅名を入力してください。');
  if (geocodeCache.has(q)) return geocodeCache.get(q);
  if (Date.now() < geocodeNext) throw fail('少し待ってから場所を再検索してください。',429);
  geocodeNext = Date.now()+1100;
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.search = new URLSearchParams({q,format:'jsonv2',countrycodes:'jp',limit:'5','accept-language':'ja'}).toString();
  const data = await jsonFetch(url,{headers:{'User-Agent':'TokyoCinemaFinder/1.0 (local development; github.com/yukarinoki/tokyo_cinema)'}});
  const places = data.map(p=>({label:p.display_name,latitude:Number(p.lat),longitude:Number(p.lon)})).filter(coordinates);
  if (geocodeCache.size > 100) geocodeCache.clear();
  geocodeCache.set(q,places);
  return places;
}
async function googleRoute(origin, destination, mode, now) {
  const payload = {
    origin:{location:{latLng:origin}},
    destination:{location:{latLng:{latitude:destination.latitude,longitude:destination.longitude}}},
    travelMode:{walk:'WALK',bicycle:'BICYCLE',transit:'TRANSIT'}[mode],
    ...(mode === 'transit' ? {departureTime:new Date(now).toISOString()} : {}),
    languageCode:'ja'
  };
  const data = await jsonFetch('https://routes.googleapis.com/directions/v2:computeRoutes',{
    method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':GOOGLE_KEY,
      'X-Goog-FieldMask':'routes.duration,routes.legs.steps.staticDuration,routes.legs.steps.transitDetails.stopDetails'},
    body:JSON.stringify(payload)
  });
  const r = data.routes?.[0];
  if (!r) return null;
  const seconds = Number(String(r.duration).replace(/s$/,''));
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  // Include initial waiting, transfers, and the final walk. A provider duration alone
  // can exclude the wait before the first vehicle departure.
  let arrivalAt = now + seconds*1000;
  if (mode === 'transit') {
    let cursor = now;
    for (const leg of r.legs || []) for (const step of leg.steps || []) {
      if (step.transitDetails?.stopDetails?.arrivalTime) {
        const end = Date.parse(step.transitDetails.stopDetails.arrivalTime);
        if (Number.isFinite(end)) cursor = Math.max(cursor,end);
      } else {
        const duration = Number(String(step.staticDuration || '0s').replace(/s$/,''));
        if (Number.isFinite(duration)) cursor += duration*1000;
      }
    }
    arrivalAt = Math.max(arrivalAt,cursor);
  }
  return {seconds:Math.ceil((arrivalAt-now)/1000),arrivalAt,estimated:false,source:'Google Maps',checkedAt:now};
}
async function search(input) {
  const {origin,mode,margin,allowEstimates} = input;
  const cinemaScope=typeof input.cinemaScope==='string' ? input.cinemaScope.trim().slice(0,100) : '';
  if (!coordinates(origin) || !['walk','bicycle','transit'].includes(mode) ||
      !Number.isInteger(margin) || margin<0 || margin>60) throw fail('出発地・移動手段・到着余裕（0〜60分）を確認してください。');
  const refreshWarning=await ensureCurrentFeed();
  const now = Date.now();
  let raw;
  try { raw = JSON.parse(await fs.readFile(FEED,'utf8')); }
  catch { throw fail('上映データを読み込めません。管理者によるデータ更新が必要です。',503); }
  const feed = normalize(raw,now);
  const warnings = refreshWarning ? [refreshWarning] : [];
  const coverage=raw.find(t=>t?.coverage)?.coverage;
  if(coverage) warnings.push(`公式上映データ：${coverage.verified_cinemas || new Set(raw.map(t=>t.theater_name)).size}/${coverage.expected_cinemas}館。全映画館を網羅するものではありません。`);
  if(cinemaScope) feed.theaters=feed.theaters.filter(t=>t.name.toLocaleLowerCase().includes(cinemaScope.toLocaleLowerCase()));
  feed.theaters.sort((a,b)=>distance(origin,a)-distance(origin,b));
  const limited=PUBLIC_ROUTING && !GOOGLE_KEY && mode!=='transit' && feed.theaters.length>10;
  const omitted=limited ? feed.theaters.slice(10).map(t=>t.name) : [];
  if(limited) warnings.push('公開経路サービスの負荷を抑えるため、出発地に直線距離で近い10館の道路経路を検索します。'+(allowEstimates?'残りは許可された概算です。':'それ以外は経路未検索です。')+'対象を変えるには「検索対象の映画館名」を指定してください。道路経路の対象外は'+omitted.length+'館です。');
  const failedSources=[...new Set(raw.flatMap(t=>t?.coverage?.failed_sources || []))];
  if(failedSources.length) warnings.push('上映情報を取得できなかった映画館：'+failedSources.join(' / '));
  if (feed.rejected) warnings.push(feed.rejected+'館分の古い・未確認・不正なデータを除外しました。');
  if (!GOOGLE_KEY && (mode==='transit' || (!PUBLIC_ROUTING && !allowEstimates)))
    warnings.push('経路サービスが未設定です。電車・公共交通の到着判定はできません。徒歩・自転車は概算を許可すると検索できます。');
  if (!feed.theaters.length) return {results:[],warnings,reason:feed.rejected ? 'freshness' : 'empty',searchedAt:now,checkedTheaters:0,unavailableRoutes:0};
  let unavailableRoutes = 0;
  const routes = [];
  // Bounded batches avoid uncontrolled provider fan-out.
  for (let start=0; start<feed.theaters.length; start+=4) {
    if (Date.now() - now > 60000) {
      unavailableRoutes += feed.theaters.length-start;
      routes.push(...Array(feed.theaters.length-start).fill(null));
      break;
    }
    const batch = await Promise.all(feed.theaters.slice(start,start+4).map(async theater => {
      if (GOOGLE_KEY) {
        try { const r = await googleRoute(origin,theater,mode,Date.now()); if(r) return r; } catch {}
      }
      if (PUBLIC_ROUTING && mode!=='transit' && feed.theaters.indexOf(theater)<10) {
        try { const r=await publicRoute(origin,theater,mode,Date.now()); if(r) return r; } catch {}
      }
      if (allowEstimates && mode!=='transit') return estimate(origin,theater,mode,Date.now());
      unavailableRoutes++;
      return null;
    }));
    routes.push(...batch);
  }
  if (unavailableRoutes) warnings.push(unavailableRoutes+'館の経路を取得できなかったため、結果から除外しました。');
  if(routes.some(r=>r?.estimated)) warnings.push('概算は道路・踏切・通行制限・信号を考慮しません。到着を保証せず、電車の推定には使用しません。');
  const searchedAt = Date.now();
  return {results:reachable(feed.theaters,routes,searchedAt,margin),warnings,searchedAt,
    reason:routes.every(r=>!r)?'routing':'ok',checkedTheaters:feed.theaters.length,routedTheaters:routes.filter(Boolean).length,omittedTheaters:omitted,unavailableRoutes};
}
async function readBody(req) {
  let body='';
  for await(const chunk of req) { body+=chunk; if(body.length>4096) throw fail('リクエストが大きすぎます。',413); }
  try { return JSON.parse(body); } catch { throw fail('JSON が正しくありません。'); }
}
function send(res,status,data) { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(data)); }
function createServer() {
  return http.createServer(async(req,res)=>{
    try {
      const url = new URL(req.url,'http://localhost');
      if(url.pathname.startsWith('/api/')) {
        if(req.headers.origin && !['http://localhost:3000','http://127.0.0.1:3000','http://localhost:'+PORT,'http://127.0.0.1:'+PORT,...PREVIEW_ORIGINS].includes(req.headers.origin))
          throw fail('許可されていないアクセスです。',403);
        if(req.method==='GET' && url.pathname==='/api/status') {
          let coverage=null;try {coverage=JSON.parse(await fs.readFile(path.join(path.dirname(FEED),'coverage_latest.json'),'utf8'));}catch{}
          return send(res,200,{routesConfigured:!!GOOGLE_KEY,publicRouting:PUBLIC_ROUTING,coverage,refreshing:!!feedRefresh});
        }
        if(req.method==='GET' && url.pathname==='/api/places') return send(res,200,{places:await geocode((url.searchParams.get('q')||'').trim())});
        if(req.method==='POST' && url.pathname==='/api/search') return send(res,200,await search(await readBody(req)));
        return send(res,404,{error:'API が見つかりません。'});
      }
      if(req.method!=='GET') return send(res,405,{error:'Method not allowed'});
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const build = path.join(ROOT,'build');
      const requested = path.resolve(build,relative || 'index.html');
      if(!requested.startsWith(build+path.sep)) throw fail('Not found',404);
      let file=requested;
      try { if(!(await fs.stat(file)).isFile()) file=path.join(build,'index.html'); }
      catch { file=path.join(build,'index.html'); }
      const content=await fs.readFile(file);
      const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
      res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
      res.end(content);
    } catch(e) { send(res,e.status||503,{error:e.status?e.message:'サービスを利用できません。時間をおいて再試行してください。'}); }
  });
}
if(require.main===module) createServer().listen(PORT,HOST,()=>console.log('Tokyo Cinema: http://localhost:'+PORT+' (listening on '+HOST+':'+PORT+')'));
module.exports={createServer,search,googleRoute};
