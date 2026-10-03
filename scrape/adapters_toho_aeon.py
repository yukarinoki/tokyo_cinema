"""Dated official TOHO / AEON schedules. HTTP policy belongs to caller's client."""
from datetime import datetime, timedelta, timezone
import re
from artwork import toho_metadata, aeon_metadata, enrich_toho_artwork

JST = timezone(timedelta(hours=9))
AEON_MASTER = 'https://theater.aeoncinema.com/schedule/v2/data/__master/movies.json'
EVENT = re.compile(r'舞台挨拶|舞台あいさつ|ライブ|ライヴ|中継|イベント|トーク|応援上映|発声|LIVE|LV', re.I)

def _json(client, url):
    response = client.get(url)
    response.raise_for_status()
    return response.json()

def _clock(value):
    match = re.fullmatch(r'(\d{1,2}):(\d{2})', str(value or ''))
    if not match or int(match[1]) > 29 or int(match[2]) > 59:
        return None
    return f'{int(match[1]):02d}:{match[2]}'

def _minutes(value):
    try:
        number = int(value)
        return number if 1 <= number <= 600 else None
    except (ValueError, TypeError):
        return None

def _duration(value):
    match = re.fullmatch(r'PT(?:(\d+)H)?(?:(\d+)M)?', str(value or ''))
    return _minutes(int(match[1] or 0) * 60 + int(match[2] or 0)) if match else None

def parse_toho(payload, requested_date, url):
    if str(payload.get('status')) != '0':
        raise ValueError('TOHO returned an unsuccessful schedule status')
    rows = []
    for day in payload.get('data', []):
        raw = str(day.get('showDay', {}).get('date', ''))
        if raw != requested_date.replace('-', ''):
            continue
        base_titles = {str(m.get('mcode')): m.get('name') for v in day.get('list', [])
                       for m in v.get('list', []) if m.get('mcode') and m.get('mcode') == m.get('code')}
        for venue in day.get('list', []):
            for movie in venue.get('list', []):
                title = str(movie.get('name', '')).strip()
                for show in movie.get('list', []):
                    start, end = _clock(show.get('showingStart')), _clock(show.get('showingEnd'))
                    if not title or not start:
                        continue
                    runtime = None if EVENT.search(title) or show.get('eventIcon') else _minutes(movie.get('hours'))
                    screen = show.get('screen') or {}
                    rows.append(dict(date=requested_date, title=title, start=start, end=end,
                        runtime_minutes=runtime, screen=str(screen.get('name', '')),
                        source_data_url=url, runtime_source_url=url if runtime else None,
                        venue_name=venue.get('name', ''), site_code=str(screen.get('theaterCd') or venue.get('code', '')),
                        **toho_metadata(movie, url, base_titles.get(str(movie.get('mcode'))))))
    return rows

def _name(value):
    return value.get('ja') or value.get('en', '') if isinstance(value, dict) else str(value or '')

def parse_aeon(payload, master, dates, url):
    by_id = {str(item.get('id')): item for item in master.values() if isinstance(item, dict) and item.get('id')}
    rows, seen = [], set()
    # ISO timestamps, not JSON business-day keys, determine the actual JST date.
    for groups in payload.values():
        if not isinstance(groups, dict):
            continue
        for shows in groups.values():
            if not isinstance(shows, list):
                continue
            for show in shows:
                try:
                    start = datetime.fromisoformat(show['startDate'].replace('Z', '+00:00'))
                    if start.tzinfo is None:
                        continue
                    start = start.astimezone(JST)
                except (KeyError, ValueError, TypeError):
                    continue
                if start.date().isoformat() not in dates:
                    continue
                try:
                    end = datetime.fromisoformat(show['endDate'].replace('Z', '+00:00'))
                    end = end.astimezone(JST) if end.tzinfo else None
                    if end and not 0 < (end - start).total_seconds() <= 36000:
                        end = None
                except (KeyError, ValueError, TypeError):
                    end = None
                title = _name(show.get('name'))
                if not title:
                    continue
                super_event = show.get('superEvent') or {}
                work = super_event.get('workPerformed') or show.get('workPerformed') or {}
                movie = by_id.get(str(work.get('id')), {})
                # Exact work ID only; never infer runtime from the advertised slot duration.
                runtime = None if EVENT.search(title) else _duration(movie.get('duration'))
                screen = _name((show.get('location') or {}).get('name'))
                key = (title, start.isoformat(), screen)
                if key in seen:
                    continue
                seen.add(key)
                end_clock = None
                if end:
                    hours = end.hour + (end.date() - start.date()).days * 24
                    end_clock = f'{hours:02d}:{end.minute:02d}' if hours <= 29 else None
                rows.append(dict(date=start.date().isoformat(), title=title, start=start.strftime('%H:%M'), end=end_clock,
                    runtime_minutes=runtime, screen=screen, source_data_url=url,
                    runtime_source_url=AEON_MASTER if runtime else None,
                    **aeon_metadata(work, movie, AEON_MASTER)))
    return rows

def collect(source, client, dates):
    dates = [d.isoformat() if hasattr(d, 'isoformat') else str(d) for d in dates]
    if source['chain'] == 'toho':
        rows = []
        code = source['provider_id']
        for day in dates:
            url = f'https://api2.tohotheater.jp/api/schedule/v2/schedule/{code}/TNPI3050J05?__type__=html&vg_cd={code}&show_day={day.replace("-", "")}&isMember=false&enter_kbn='
            rows.extend(parse_toho(_json(client, url), day, url))
        return enrich_toho_artwork(rows, client)
    if source['chain'] == 'aeon':
        # Match the public UI's versioned URL: unversioned CDN responses can be weeks stale.
        version = datetime.now(JST).strftime('%Y%m%d%H%M')
        url = f'https://theater.aeoncinema.com/schedule/v2/data/{source["slug"]}/schedule.json?v={version}'
        payload = _json(client, url)
        try:
            master = _json(client, f'{AEON_MASTER}?v={version[:10]}')
        except Exception:
            master = {}  # Schedules remain useful; unknown film runtime stays unavailable.
        return parse_aeon(payload, master, dates, url)
    raise ValueError('Unsupported chain')
