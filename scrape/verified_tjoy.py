"""Small, explicit, public-page collector. No login, search API, browser stealth or ticket operations."""
import argparse
import hashlib
import json
import os
import re
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
JST = timezone(timedelta(hours=9))
AGENT = "TokyoCinemaFinder/1.0 (+https://github.com/yukarinoki/tokyo_cinema)"
SOURCES = [
    {"theater_name": "新宿バルト9", "source_url": "https://tjoy.jp/shinjuku_wald9",
     "latitude": 35.6901173, "longitude": 139.7059134, "address": "東京都新宿区新宿3-1-26"},
    {"theater_name": "T・ジョイPRINCE品川", "source_url": "https://tjoy.jp/tjoy-prince-shinagawa",
     "latitude": 35.6283914, "longitude": 139.7359119, "address": "東京都港区高輪4-10-30"},
    {"theater_name": "T・ジョイSEIBU大泉", "source_url": "https://tjoy.jp/t-joy_seibu_oizumi",
     "latitude": 35.7530358, "longitude": 139.5948388, "address": "東京都練馬区東大泉2-34-1"},
]


def parse_schedule(html, source, verified_at):
    soup = BeautifulSoup(html, "html.parser")
    selected = soup.select_one("#showDate")
    if not selected or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", selected.get("value", "")):
        raise ValueError("Missing explicit page schedule date; refusing undated content")
    page_date = datetime.strptime(selected["value"], "%Y-%m-%d").date()
    checked = datetime.fromisoformat(verified_at).astimezone(JST)
    if abs((checked.date() - page_date).days) > 1:
        raise ValueError("Page schedule date is stale or unexpectedly far in the future")
    groups = defaultdict(lambda: defaultdict(set))
    for section in soup.select("section.section-container"):
        heading = section.select_one("h5.js-title-film")
        if not heading:
            continue
        title = heading.get_text(" ", strip=True)
        for box in section.select("li.schedule-box"):
            time_element = box.select_one("p.schedule-time")
            if not time_element:
                continue
            # Read each screening's date from the public link, never from retrieval date.
            dates = set()
            for link in box.select("[onclick], [href]"):
                match = re.search(r"/reservation/index/[^'\s?]+/(\d{4}-\d{2}-\d{2})(?:\?|['\s])",
                                  link.get("onclick", "") + " " + link.get("href", ""))
                if match:
                    dates.add(match[1])
            if len(dates) != 1:
                continue
            date = dates.pop()
            datetime.strptime(date, "%Y-%m-%d")
            # A span holds the ending time. Only the first time is the start.
            match = re.match(r"\s*(\d{1,2}):(\d{2})", time_element.get_text(" ", strip=True))
            if not match:
                continue
            hour, minute = map(int, match.groups())
            if hour > 29 or minute > 59:
                continue
            start = f"{hour:02d}:{minute:02d}"
            groups[date][title].add(start)
    if not groups:
        raise ValueError("No dated screenings parsed; possible markup change or access challenge")
    digest = hashlib.sha256(html.encode("utf8")).hexdigest()
    return [{**source, "schedule_date": date, "scrape_date": checked.date().isoformat(),
             "verified_at": verified_at, "source_page_date": page_date.isoformat(),
             "source_sha256": digest, "collector": "tjoy-public-html-v1",
             "movies": [{"title": title, "showtimes": sorted(times)}
                        for title, times in movies.items()]}
            for date, movies in sorted(groups.items())]


def collect(output, minimum_age_minutes=30):
    output = Path(output)
    if output.exists():
        previous = json.loads(output.read_text(encoding="utf-8-sig"))
        timestamps = [datetime.fromisoformat(t["verified_at"]) for t in previous
                      if t.get("collector") == "tjoy-public-html-v1"]
        if timestamps and datetime.now(timezone.utc) - min(timestamps) < timedelta(minutes=minimum_age_minutes):
            print("Verified feed is recent; no network requests made.")
            return previous
    session = requests.Session()
    session.headers["User-Agent"] = AGENT
    robots = session.get("https://tjoy.jp/robots.txt", timeout=20)
    if robots.status_code == 200:
        rules = RobotFileParser()
        rules.parse(robots.text.splitlines())
        if any(not rules.can_fetch(AGENT, s["source_url"]) for s in SOURCES):
            raise RuntimeError("robots.txt disallows collection")
    elif robots.status_code != 404:
        raise RuntimeError(f"Cannot verify robots policy: HTTP {robots.status_code}")
    results, failures = [], []
    for source in SOURCES:
        time.sleep(3)  # Serial, low-rate public page reads; never retry a challenge.
        try:
            response = session.get(source["source_url"], timeout=25, allow_redirects=False)
            response.raise_for_status()
            if response.status_code != 200:
                raise ValueError("Unexpected redirect or response")
            response.encoding = "utf-8"
            verified = datetime.now(timezone.utc).isoformat()
            rows = parse_schedule(response.text, source, verified)
            results.extend(rows)
            print(source["theater_name"], sum(len(m["showtimes"]) for r in rows for m in r["movies"]), "dated screenings")
        except (requests.RequestException, ValueError) as exc:
            failures.append(source["theater_name"] + ": " + type(exc).__name__)
    if not results:
        raise RuntimeError("No verified schedules; existing feed preserved. " + "; ".join(failures))
    # Publish one complete snapshot of sources that succeeded; failures are explicit.
    for result in results:
        result["coverage"] = {"expected_cinemas": len(SOURCES), "failed_sources": failures}
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".tmp")
    temporary.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf8")
    os.replace(temporary, output)
    print("Published", len({r["theater_name"] for r in results}), "cinemas to", output)
    if failures:
        print("Unavailable sources:", "; ".join(failures))
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "webapp/public/data/movie_schedules_latest.json")
    args = parser.parse_args()
    collect(args.output)

