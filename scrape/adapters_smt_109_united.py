"""Read public, dated schedule pages; never follow ticket/booking URLs.

Network access is delegated to the caller's robots-aware, rate-limited client.
"""
import re
from datetime import date
from urllib.parse import parse_qs, urljoin, urlsplit

from bs4 import BeautifulSoup


def _soup(response):
    response.raise_for_status()
    return BeautifulSoup(response.content, 'html.parser')


def _text(node):
    return node.get_text(' ', strip=True) if node else ''


def _clock(node):
    match = re.search(r'(?<!\d)(\d{1,2}):([0-5]\d)(?!\d)', _text(node))
    return f'{int(match[1]):02}:{match[2]}' if match and int(match[1]) < 30 else None


def _date(value):
    try:
        return date.fromisoformat(f'{value[:4]}-{value[4:6]}-{value[6:8]}').isoformat()
    except (ValueError, TypeError):
        return None


def _runtime(text):
    match = re.search(r'(\d+)\s*(?:分|min\b)', text)
    value = int(match[1]) if match else None
    return value if value and value <= 600 else None


def _identity(chain, title, link, page_url, image=None):
    """Use the source's explicit master film key, never title-based matching.

    SMT's aboutsite policy explicitly allows personal use (checked 2026-10-03).
    The consumer must gate this metadata to the private personal preview.
    109's referenced policy has no such exception; United permission is unknown.
    """
    href = link.get('href', '') if link else ''
    detail_url = urljoin(page_url, href) if href else None
    film_key = None
    if chain == '109':
        match = re.search(r'/movies/(\d+)\.html(?:$|[?#])', href)
        if not match:
            match = re.search(r'movies\.html\?id=(\d+)(?:$|&)', href)
        film_key = match[1] if match else None
    elif chain == 'united':
        match = re.search(r'film\.php\?film=(\d+)(?:$|[?&])', href)
        film_key = match[1] if match else None
    elif chain == 'smt':
        film_key = parse_qs(urlsplit(href).query).get('cinemaid', [None])[0]
        if film_key and not re.fullmatch(r'[A-Z]\d+', film_key):
            film_key = None
    artwork = None
    if chain == 'smt' and film_key and image:
        candidate = urljoin(page_url, image.get('src', ''))
        parsed = urlsplit(candidate)
        # Same-film image only. Never infer a filename or accept noimage/ad art.
        if (parsed.scheme == 'https' and parsed.netloc == 'www.smt-cinema.com'
                and parsed.path.startswith(f'/movie_data/{film_key}/')
                and re.search(r'\.(?:jpe?g|png|webp)$', parsed.path, re.I)):
            artwork = candidate
    policy = {'smt': 'https://www.smt-cinema.com/aboutsite/',
              '109': 'https://www.tokyu-rec.co.jp/company/sitepolicy/'}
    return dict(film_id=f'{chain}:{film_key}' if film_key else None,
                canonical_title=title, release_year=None, film_source_url=detail_url,
                artwork_url=artwork, artwork_source_url=detail_url if artwork else None,
                artwork_credit='画像出典：松竹マルチプレックスシアターズ公式サイト（各権利者に帰属）' if artwork else None,
                artwork_permission='personal-use' if artwork else None,
                artwork_policy_url=policy.get(chain))


def _row(day, title, start, end, runtime, screen, url, identity=None):
    # Event duration often includes a talk/live segment rather than film runtime.
    if re.search(r'舞台挨拶|ライブ|ライヴ|ビューイング|生中継|トーク|応援上映|LIVE|\bLV\b|ODS|一挙上映', title, re.I):
        runtime = None
    return dict(date=day, title=title, start=start, end=end,
                runtime_minutes=runtime, screen=screen, source_data_url=url,
                runtime_source_url=url if runtime else None, **(identity or {}))


def parse_109(soup, url, dates):
    rows = []
    for article in soup.select('article'):
        title = _text(article.select_one('h2'))
        identity = _identity('109', title, article.select_one('header a[href]'), url)
        for table in article.select('ul.timetable'):
            runtime = _runtime(_text(table.select_one('li.theatre small')))
            screen = _text(table.select_one('.theatre-num'))
            for showing in table.select('.check_date[data-date]'):
                stamp = showing['data-date']
                day = _date(stamp[:8])
                start = _clock(showing.select_one('time.start'))
                if day in dates and title and start and len(stamp) >= 12:
                    if start.replace(':', '') != stamp[8:12]:
                        continue
                    rows.append(_row(day, title, start, _clock(showing.select_one('time.end')),
                                     runtime, screen, url, identity))
    return rows


def parse_united(soup, url, dates):
    rows = []
    # This source has mismatched </li> tags. Following title order avoids
    # dropping subsequent screens when an HTML parser closes the movie <li>.
    for start_node in soup.select('.startTime'):
        title_node = start_node.find_previous('span', class_='movieTitle')
        if not title_node:
            continue
        title = _text(title_node)
        identity = _identity('united', title, title_node.select_one('a[href]'), url)
        showing = start_node.find_parent('div')
        if not showing:
            continue
        start = _clock(start_node)
        end = _clock(showing.select_one('.endTime'))
        # Read embedded date evidence only; ticket URL is NOT requested.
        link = showing.select_one('a[href*="sd="][href*="st="]')
        query = parse_qs(urlsplit(link['href']).query) if link else {}
        stamp = query.get('st', [''])[0]
        day = _date(query.get('sd', [''])[0])
        if day not in dates or not title or not start or len(stamp) < 12:
            continue
        if _date(stamp[:8]) != day or stamp[8:12] != start.replace(':', ''):
            continue
        # Runtime in the current source exists only in HTML comments.
        rows.append(_row(day, title, start, end, None,
                         query.get('sc', [''])[0], url, identity))
    return rows


def parse_smt(soup, url, dates):
    rows = []
    for movie in soup.select('section.daily > section'):
        heading = movie.select_one('.movieTitle h2')
        if not heading:
            continue
        # English subtitles are not separate movie/version metadata.
        title = ' '.join(str(t).strip() for t in heading.find_all(string=True, recursive=False)).strip()
        runtime_match = re.search(r'[（(]本編\s*[:：]\s*(\d+)\s*分[）)]', title)
        runtime = int(runtime_match[1]) if runtime_match else None
        if runtime is not None and not 0 < runtime <= 600:
            runtime = None
        title = re.sub(r'[（(]本編\s*[:：]\s*\d+\s*分[）)]', '', title).strip()
        identity = _identity('smt', title, movie.select_one('.detailLink a[href]'), url,
                             movie.select_one('.thumbnail img[src]'))
        for block in movie.select('.select .block'):
            showing = block.select_one('.inner[id]')
            match = re.search(r'^\d+_\d+_\d+_(\d{8})_', showing['id']) if showing else None
            day = _date(match[1]) if match else None
            times = re.findall(r'(?<!\d)(\d{1,2}:[0-5]\d)(?!\d)', _text(block.select_one('p.time')))
            if day in dates and title and times:
                norm = lambda t: f'{int(t.split(":")[0]):02}:{t.split(":")[1]}'
                rows.append(_row(day, title, norm(times[0]), norm(times[1]) if len(times)>1 else None,
                                 runtime, _text(block.select_one('h3')), url, identity))
    return rows


def collect(source, client, dates):
    dates = {d.isoformat() if hasattr(d, 'isoformat') else str(d) for d in dates}
    chain = source['chain']
    rows = []
    if chain == 'united':
        for day in sorted(dates):
            url = f"https://www.unitedcinemas.jp/{source['slug']}/daily.php?date={day}"
            rows.extend(parse_united(_soup(client.get(url)), url, dates))
    elif chain == '109':
        page = _soup(client.get(source['url']))
        urls = set()
        for node in page.select('a[href],iframe[src]'):
            path = node.get('href') or node.get('src') or ''
            match = re.search(r'/schedules/(\d{8})\.html', path)
            # The premium page also contains duplicate CMS preview links.
            if match and _date(match[1]) in dates and urlsplit(urljoin(source['url'],path)).netloc == urlsplit(source['url']).netloc:
                urls.add(urljoin(source['url'], path))
        for url in sorted(urls):
            rows.extend(parse_109(_soup(client.get(url)), url, dates))
    elif chain == 'smt':
        page = _soup(client.get(source['url']))
        match = re.search(r'thnumber\s*=\s*[\"\'](\d+)', str(page))
        if not match:
            raise ValueError('SMT public schedule theater identifier unavailable')
        base = 'https://www.smt-cinema.com/html/site/pc/schedule/'
        date_url = f'{base}s0100_{match[1]}_schedule_daily_date_area.html'
        calendar = _soup(client.get(date_url))
        for node in calendar.select('[id]'):
            target = node['id']
            m = re.fullmatch(r'\d+_(\d{8})', target)
            if m and _date(m[1]) in dates and 'ng' not in node.get('class', []):
                url = f'{base}s0100_{target}_schedule_daily_movie_area.html'
                rows.extend(parse_smt(_soup(client.get(url)), url, dates))
    else:
        raise ValueError(f'Unsupported chain: {chain}')
    if not rows:
        raise ValueError('No explicitly dated public showtimes found for requested dates')
    unique = {(r['date'],r['title'],r['start'],r['screen']):r for r in rows}
    return list(unique.values())
