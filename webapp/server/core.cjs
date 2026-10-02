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
        const start = Array.isArray(raw) ? raw[0] : raw;
        const startsAt = screeningTime(t.schedule_date, start);
        if (startsAt === null || startsAt <= now || startsAt > now + 24*60*MINUTE) continue;
        const key = [m.title,m.subtitle,m.screen_type,startsAt].join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        screenings.push({ title: m.title, subtitle: m.subtitle || '', screenType: m.screen_type || '', startsAt });
      }
    }
    if (screenings.length) theaters.push({ name:t.theater_name, latitude:t.latitude, longitude:t.longitude,
      address:typeof t.address === 'string' ? t.address : '', sourceUrl:source, verifiedAt:verified, screenings });
  }
  return { theaters, rejected, total:data.length };
}
function reachable(theaters, routes, now, margin, query='') {
  const results = [];
  const filter = query.trim().toLocaleLowerCase();
  theaters.forEach((theater, i) => {
    const route = routes[i];
    if (!route || !Number.isFinite(route.seconds) || route.seconds < 0 || !Number.isFinite(route.arrivalAt)) return;
    for (const screening of theater.screenings) {
      if (screening.startsAt <= now || screening.startsAt < Math.max(now,route.arrivalAt) + margin*MINUTE) continue;
      if (filter && !(screening.title+' '+theater.name).toLocaleLowerCase().includes(filter)) continue;
      results.push({ ...screening, theater, route,
        spareMinutes:Math.floor((screening.startsAt - Math.max(now,route.arrivalAt))/MINUTE) - margin });
    }
  });
  return results.sort((a,b) => a.startsAt-b.startsAt || a.route.seconds-b.route.seconds || a.theater.name.localeCompare(b.theater.name));
}
module.exports = { MINUTE, coordinates, tokyoDate, screeningTime, safeUrl, distance, estimate, normalize, reachable };
