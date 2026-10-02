"""Low-rate official Tokyo cinema feed refresh, with per-source failure reporting."""
import argparse
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import threading
import time
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser
import requests
from verified_tjoy import parse_schedule, AGENT, JST
from adapters_toho_aeon import collect as collect_ta
from adapters_humax_sunshine import collect as collect_hs

ROOT = Path(__file__).resolve().parents[1]

class PublicClient:
    """Serialize public reads per host, cache within refresh, honor robots and redirects."""
    def __init__(self):
        self.cache = {}
        self.rules = {}
        self.locks = defaultdict(threading.Lock)
        self.last = defaultdict(float)

    def _read(self, url):
        host = urlsplit(url).netloc
        time.sleep(max(0, self.last[host] + 2.5 - time.monotonic()))
        response = requests.get(url, headers={'User-Agent': AGENT}, timeout=25, allow_redirects=False)
        self.last[host] = time.monotonic()
        if response.status_code != 200:
            raise ValueError(f'Public source HTTP {response.status_code}: {urlsplit(url).path}')
        return response

    def get(self, url):
        parsed = urlsplit(url)
        if parsed.scheme != 'https':
            raise ValueError('Only official HTTPS sources allowed')
        with self.locks[parsed.netloc]:
            if url in self.cache:
                return self.cache[url]
            if parsed.netloc not in self.rules:
                robots_url = f'https://{parsed.netloc}/robots.txt'
                time.sleep(max(0, self.last[parsed.netloc] + 2.5 - time.monotonic()))
                response = requests.get(robots_url, headers={'User-Agent': AGENT}, timeout=20, allow_redirects=False)
                self.last[parsed.netloc] = time.monotonic()
                rules = RobotFileParser()
                if response.status_code == 200:
                    rules.parse(response.text.splitlines())
                elif 400 <= response.status_code < 500 and response.status_code != 429:
                    # RFC 9309 section 2.3.1.3: unavailable robots is not a schedule authorization bypass.
                    rules.parse([])
                else:
                    raise ValueError(f'Robots policy unavailable HTTP {response.status_code}')
                self.rules[parsed.netloc] = rules
            if not self.rules[parsed.netloc].can_fetch(AGENT, url):
                raise ValueError('robots.txt disallows source')
            response = self._read(url)
            self.cache[url] = response
            return response


def collect_one(source, client, dates):
    checked = datetime.now(timezone.utc).isoformat()
    base = dict(theater_name=source['name'], source_url=source['url'],
                latitude=source['latitude'], longitude=source['longitude'], address=source.get('address', ''),
                chain=source['chain'], source_id=source['id'], verified_at=checked, collector='tokyo-official-v1')
    if source['chain'] == 'tjoy':
        response = client.get(source['url'])
        response.encoding = 'utf-8'
        rows = parse_schedule(response.text, base, checked)
        return [{**r, 'collector': 'tokyo-official-v1'} for r in rows if r['schedule_date'] in dates]
    if source['chain'] in ('toho', 'aeon'):
        screenings = collect_ta(source, client, dates)
    elif source['chain'] in ('humax', 'sunshine'):
        screenings = collect_hs(source, client, dates)
    else:
        from adapters_smt_109_united import collect as collect_other
        screenings = collect_other(source, client, dates)
    if source.get('site_code'):
        screenings = [r for r in screenings if str(r.get('site_code')) == str(source['site_code'])]
    groups = defaultdict(lambda: defaultdict(list))
    for s in screenings:
        groups[s['date']][s['title']].append({k: s.get(k) for k in
            ('start', 'end', 'runtime_minutes', 'screen', 'source_data_url', 'runtime_source_url')})
    if not groups:
        raise ValueError('No dated screenings for requested days; empty or changed source')
    return [{**base, 'schedule_date': day, 'movies': [{'title': title, 'showtimes': shows}
            for title, shows in movies.items()]} for day, movies in sorted(groups.items())]


def collect(output, minimum_age_minutes=30):
    output = Path(output)
    if output.exists():
        previous = json.loads(output.read_text(encoding='utf-8-sig'))
        if previous and all(r.get('collector') == 'tokyo-official-v1' and
                datetime.now(timezone.utc)-datetime.fromisoformat(r['verified_at']) < timedelta(minutes=minimum_age_minutes)
                for r in previous):
            print('Recent verified feed retained; no network reads.')
            return previous
    sources = json.loads((Path(__file__).parent/'theaters_tokyo.json').read_text(encoding='utf-8-sig'))
    today = datetime.now(JST).date()
    dates = [(today+timedelta(days=n)).isoformat() for n in (0, 1)]
    client = PublicClient()
    def task(source):
        try:
            rows = collect_one(source, client, dates)
            count = sum(len(m['showtimes']) for r in rows for m in r['movies'])
            print(source['id'], count, 'screenings', flush=True)
            return rows, dict(id=source['id'], name=source['name'], chain=source['chain'], count=count, status='ok')
        except Exception as exc:
            print(source['id'], type(exc).__name__, str(exc)[:160], flush=True)
            return [], dict(id=source['id'], name=source['name'], chain=source['chain'], count=0, status='unavailable', error=str(exc)[:160])
    # Different public hosts can progress independently; each host stays serialized.
    with ThreadPoolExecutor(max_workers=6) as pool:
        outcomes = list(pool.map(task, sources))
    rows = [r for result, _ in outcomes for r in result]
    report = dict(verified_at=datetime.now(timezone.utc).isoformat(), dates=dates,
                  expected_cinemas=len(sources), sources=[s for _, s in outcomes])
    if not rows:
        raise RuntimeError('All sources unavailable; previous feed preserved')
    coverage = dict(expected_cinemas=len(sources), verified_cinemas=sum(s['status']=='ok' for s in report['sources']),
                    failed_sources=[s['name']+': '+s['error'] for s in report['sources'] if s['status']!='ok'])
    for row in rows:
        row['coverage'] = coverage
    output.parent.mkdir(parents=True, exist_ok=True)
    for file, data in [(output, rows), (output.with_name('coverage_latest.json'), report)]:
        temp = file.with_suffix('.tmp')
        temp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf8')
        os.replace(temp, file)
    print('Published', coverage['verified_cinemas'], '/', len(sources), 'cinemas', flush=True)
    return rows

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT/'webapp/public/data/movie_schedules_latest.json')
    parser.add_argument('--force', action='store_true')
    args = parser.parse_args()
    collect(args.output, 0 if args.force else 30)
