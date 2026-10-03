const {filmIdentity,artwork,resolveArtwork}=require('./films.cjs');
const MINUTE = 60000;
const JST = 9 * 60 * MINUTE;
function coordinates(p) {
  return p && typeof p.latitude === 'number' && typeof p.longitude === 'number' &&
    Number.isFinite(p.latitude) && Number.isFinite(p.longitude) &&
    Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180;
}
function tokyoDate(now) { return new Date(now + JST).toISOString().slice(0, 10); }
function screeningTime(date, clock) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{1,2}:\d{2}$/.test(clock || '')) return null;
  const base = Date.parse(date + 'T00:00:00+09:00');
  if (!Number.isFinite(base) || tokyoDate(base) !== date) return null;
  const [hour, minute] = clock.split(':').map(Number);
  // Japanese cinema business days may use 24:xx through 29:xx.
  if (hour > 29 || minute > 59) return null;
  return base + (hour * 60 + minute) * MINUTE;
}
function safeUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' ? u.href : null; } catch { return null; }
}
function distance(a, b) {
  const rad = n => n * Math.PI / 180;
  const x = Math.sin(rad(b.latitude-a.latitude)/2) ** 2 +
    Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(rad(b.longitude-a.longitude)/2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0,1-x)));
}
function estimate(origin, theater, mode, now) {
  if (!['walk','bicycle'].includes(mode)) return null;
  const minutes = Math.ceil(distance(origin,theater) * 1.4 / (mode === 'walk' ? 4.5 : 12) * 60);
  return { seconds: minutes * 60, arrivalAt: now + minutes * MINUTE, estimated: true,
    source: '直線距離 × 1.4 / ' + (mode === 'walk' ? '徒歩 4.5' : '自転車 12') + ' km/h',
    checkedAt: now };
}

function departureTiming(startsAt,seconds,margin,now) {
  if (![startsAt,seconds,margin,now].every(Number.isFinite) || seconds<0 || margin<0) return null;
  const departureAt=startsAt-seconds*1000-margin*MINUTE;
  return {departureAt,departureMinutes:Math.floor((departureAt-now)/MINUTE)};
}
function featureTiming(date,start,end,runtimeMinutes) {
  const startsAt=screeningTime(date,start);
  if(!end) return {featureStatus:'missing_end',endsAt:null,featureStartsAt:null,runtimeMinutes:null};
  let endsAt=screeningTime(date,end);
  if(startsAt===null || endsAt===null) return {featureStatus:'invalid',endsAt:null,featureStartsAt:null,runtimeMinutes:null};
  if(endsAt<startsAt) endsAt+=24*60*MINUTE;
  if(endsAt<=startsAt || endsAt-startsAt>12*60*MINUTE) return {featureStatus:'invalid',endsAt:null,featureStartsAt:null,runtimeMinutes:null};
  if(runtimeMinutes===undefined || runtimeMinutes===null) return {featureStatus:'missing_runtime',endsAt,featureStartsAt:null,runtimeMinutes:null};
  if(!Number.isInteger(runtimeMinutes) || runtimeMinutes<=0 || runtimeMinutes>600 ||
      endsAt-runtimeMinutes*MINUTE<startsAt) return {featureStatus:'invalid',endsAt,featureStartsAt:null,runtimeMinutes:null};
  return {featureStatus:'estimated',endsAt,featureStartsAt:endsAt-runtimeMinutes*MINUTE,runtimeMinutes};
}

function normalize(data, now) {
  if (!Array.isArray(data)) throw new Error('上映データの形式が正しくありません。');
  const theaters = [];
  let rejected = 0;
  for (const t of data) {
    // scrape_date is a retrieval date, never proof of a performance date.
    const verified = Date.parse(t?.verified_at);
    const source = safeUrl(t?.source_url);
    if (!coordinates(t) || !t.theater_name || !Array.isArray(t.movies) ||
        !source || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(t.verified_at || '') || !Number.isFinite(verified) || verified > now + 5*MINUTE ||
        now - verified > 36*60*MINUTE || !t.schedule_date) { rejected++; continue; }
    const screenings = [];
    const seen = new Set();
    for (const m of t.movies) {
      if (!m || typeof m.title !== 'string' || !Array.isArray(m.showtimes)) continue;
      for (const raw of m.showtimes) {
        const details=raw && typeof raw==='object' && !Array.isArray(raw) ? raw : {};
        const start = Array.isArray(raw) ? raw[0] : details.start || raw;
        const end=Array.isArray(raw) ? raw[1] : details.end;
        const timing=featureTiming(t.schedule_date,start,end,details.runtime_minutes ?? m.runtime_minutes);
        const startsAt = screeningTime(t.schedule_date, start);
        if (startsAt === null || startsAt <= now || startsAt > now + 24*60*MINUTE) continue;
        const key = [m.title,m.subtitle,m.screen_type,details.screen,startsAt].join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        const filmMetadata={...m,...details};
        screenings.push({ ...filmIdentity(m.title,filmMetadata,source),artwork:artwork(filmMetadata),
          artworkMatchTitle:filmMetadata.artwork_match_title || null,
          releaseYear:filmMetadata.artwork_release_year ?? filmMetadata.release_year ?? null,
          filmRuntimeMinutes:Number.isInteger(filmMetadata.runtime_minutes)&&filmMetadata.runtime_minutes>0&&filmMetadata.runtime_minutes<=600?filmMetadata.runtime_minutes:null,
          filmSourceHost:new URL(source).hostname, title: m.title, subtitle: m.subtitle || '', screenType: m.screen_type || '', screen:details.screen || '', startsAt, ...timing, runtimeSourceUrl:safeUrl(details.runtime_source_url || t.source_url) });
      }
    }
    if (screenings.length) theaters.push({ name:t.theater_name, latitude:t.latitude, longitude:t.longitude,
      address:typeof t.address === 'string' ? t.address : '', sourceUrl:source, verifiedAt:verified, screenings });
  }
  // One route per physical cinema, including screenings on both sides of midnight.
  const merged = new Map();
  for (const theater of theaters) {
    const key=[theater.name,theater.latitude,theater.longitude].join('|');
    if(!merged.has(key)) merged.set(key,{...theater,screenings:[]});
    const item=merged.get(key);
    item.verifiedAt=Math.min(item.verifiedAt,theater.verifiedAt);
    item.screenings.push(...theater.screenings);
  }
  for(const theater of merged.values()) {
    theater.screenings=[...new Map(theater.screenings.map(s=>[[s.title,s.screen,s.startsAt].join('|'),s])).values()];
  }
  const artworkCoverage=resolveArtwork([...merged.values()]);
  return { theaters:[...merged.values()], rejected, total:data.length,artworkCoverage };
}
function reachable(theaters, routes, now, margin, query='') {
  const results = [];
  const filter = query.trim().toLocaleLowerCase();
  theaters.forEach((theater, i) => {
    const route = routes[i];
    if (!route || !Number.isFinite(route.seconds) || route.seconds < 0 || !Number.isFinite(route.arrivalAt)) return;
    const arrivalAt=Math.max(route.arrivalAt,now+route.seconds*1000);
    for (const screening of theater.screenings) {
      if (screening.startsAt <= now || screening.startsAt < arrivalAt + margin*MINUTE) continue;
      if (filter && !(screening.title+' '+theater.name).toLocaleLowerCase().includes(filter)) continue;
      const {screenings: allScreenings, ...venue}=theater;
      results.push({ ...screening, theater:venue, route, ...departureTiming(screening.startsAt,route.seconds,margin,now),
        spareMinutes:Math.floor((screening.startsAt - arrivalAt)/MINUTE) - margin });
    }
  });
  return results.sort((a,b) => a.startsAt-b.startsAt || a.route.seconds-b.route.seconds || a.theater.name.localeCompare(b.theater.name));
}
module.exports = { departureTiming, featureTiming, MINUTE, coordinates, tokyoDate, screeningTime, safeUrl, distance, estimate, normalize, reachable };
