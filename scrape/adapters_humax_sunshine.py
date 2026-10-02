"""Official HUMAX HTML and Cinema Sunshine public website JSON schedules.

HTTP, robots, caching and rate limits are enforced by the supplied client.
Sunshine endpoints were observed on ordinary public theater pages; no ticket API,
login, cookies or credentials are required. Film variants retain their own runtime.
"""
import re
from datetime import datetime, timedelta, timezone
from bs4 import BeautifulSoup

JST = timezone(timedelta(hours=9))
SUN_BASE = 'https://www.cinemasunshine.co.jp/schedule/data/'
SUN_THEATERS = {'gdcs': '020', 'heiwajima': '002'}
EVENT = re.compile(r'舞台挨拶|舞台あいさつ|ライブ.?ビューイング|ライヴ.?ビューイング|生中継|トーク|イベント|応援上映|一挙上映|LIVE', re.I)
CLOCK = re.compile(r'(?<!\d)([0-2]?\d:[0-5]\d)(?!\d)')


def _text(node):
    return node.get_text(' ', strip=True) if node else ''


def _runtime(text, title):
    if EVENT.search(title):
        return None
    m = re.fullmatch(r'PT(?:(\d+)H)?(?:(\d+)M)?', text or '')
    if m:
        value = int(m[1] or 0) * 60 + int(m[2] or 0)
    else:
        m = re.fullmatch(r'(?:上映時間\s*[:：]\s*)?(\d+)\s*分', (text or '').strip())
        value = int(m[1]) if m else 0
    return value if 0 < value <= 600 else None


def parse_humax(html, allowed_dates, url):
    soup = BeautifulSoup(html, 'html.parser')
    results = []
    for day in soup.select('.schedule-content[data-schedule-date]'):
        date = day['data-schedule-date']
        if date not in allowed_dates:
            continue
        for movie in day.select('li.schedule-movie-item'):
            title = _text(movie.select_one('.schedule-movie-information-title'))
            runtime = _runtime(_text(movie.select_one('.schedule-movie-information-duration')), title)
            for show in movie.select('.schedule-showtime-item'):
                start = _text(show.select_one('.schedule-showtime-time-start'))
                times = CLOCK.findall(_text(show.select_one('.schedule-showtime-time')))
                if not title or not CLOCK.fullmatch(start):
                    continue
                results.append(dict(date=date, title=title, start=start.zfill(5),
                    end=times[1].zfill(5) if len(times) == 2 else None,
                    runtime_minutes=runtime, screen=_text(show.select_one('.schedule-showtime-screen')),
                    source_data_url=url, runtime_source_url=url if runtime else None))
    return results


def _instant(raw):
    try:
        value = re.sub(r'([+-]\d{2})(\d{2})$', r'\1:\2', str(raw).replace('Z', '+00:00'))
        stamp = datetime.fromisoformat(value)
        return stamp.astimezone(JST) if stamp.tzinfo else None
    except (ValueError, TypeError):
        return None


def parse_sunshine(data, allowed_dates, url):
    if not isinstance(data, dict):
        raise ValueError('Cinema Sunshine schedule schema changed')
    results = []
    for screens in data.values():
        if not isinstance(screens, dict):
            continue
        for show in screens.values():
            if not isinstance(show, dict):
                continue
            start = _instant(show.get('startDate'))
            end = _instant(show.get('endDate'))
            title = show.get('name', {}).get('ja', '').strip()
            if not start or start.date().isoformat() not in allowed_dates or not title:
                continue
            runtime = _runtime(show.get('workPerformed', {}).get('duration', ''), title)
            # Keep next-day end explicit with 24+ hour clock, never roll bad dates.
            end_clock = None
            if end and start < end <= start + timedelta(hours=12):
                hour = end.hour + 24 * (end.date() - start.date()).days
                end_clock = f'{hour:02d}:{end.minute:02d}'
            results.append(dict(date=start.date().isoformat(), title=title,
                start=start.strftime('%H:%M'), end=end_clock, runtime_minutes=runtime,
                screen=show.get('location', {}).get('name', {}).get('ja', ''),
                source_data_url=url, runtime_source_url=url if runtime else None))
    return results


def collect(source, client, dates):
    dates = {d.isoformat() if hasattr(d, 'isoformat') else str(d) for d in dates}
    results = []
    if source['chain'] == 'humax':
        for date in sorted(dates):
            url = f"https://humax-cinema.co.jp/{source['slug']}/schedule/?date={date}"
            response = client.get(url)
            response.raise_for_status()
            results.extend(parse_humax(response.content, dates & {date}, url))
    elif source['chain'] == 'sunshine':
        theater = SUN_THEATERS[source['slug']]
        # Website uses v=timestamp; hourly cache key avoids stale CDN index while sharing requests.
        version = datetime.now(timezone.utc).strftime('%Y%m%d%H')
        response = client.get(SUN_BASE + 'schedule.json?v=' + version)
        response.raise_for_status()
        index = response.json()
        if not isinstance(index, dict):
            raise ValueError('Cinema Sunshine index schema changed')
        for film, theaters in index.items():
            if not re.fullmatch(r'\d+', film) or not isinstance(theaters, dict):
                continue
            for date in sorted(dates):
                day = date.replace('-', '')
                if day not in theaters.get(theater, {}):
                    continue
                url = f'{SUN_BASE}{film}/{theater}/{day}.json'
                response = client.get(url)
                response.raise_for_status()
                results.extend(parse_sunshine(response.json(), dates, url))
    else:
        raise ValueError('Unsupported chain')
    # Identical index entries must not produce duplicate screenings.
    return list({(r['date'], r['title'], r['start'], r['screen']): r for r in results}.values())
