import unittest
from verified_tjoy import parse_schedule, SOURCES

HTML = """<input id="showDate" value="2026-10-03">
<section class="section-container"><h5 class="js-title-film">TEST film</h5>
<li class="schedule-box"><div onclick="location.href='/x/reservation/index/1/F/2/2026-10-03?type=film'">
<p class="schedule-time">25:10 <span>～ 27:30</span></p></div></li>
<li class="schedule-box"><div onclick="location.href='/x/reservation/index/1/F/2/2026-10-03?type=film'">
<p class="schedule-time">25:10 <span>～ 27:30</span></p></div></li>
<li class="schedule-box"><p class="schedule-time">12:00</p></li>
<li class="schedule-box"><div onclick="location.href='/x/reservation/index/1/F/2/2026-10-04?type=film'">
<p class="schedule-time">10:00 <span>～ 12:00</span></p></div></li></section>"""


class TestVerifiedTjoy(unittest.TestCase):
    def test_date_provenance_dedup_end_times_and_midnight(self):
        rows = parse_schedule(HTML, SOURCES[0], "2026-10-03T00:00:00+00:00")
        self.assertEqual([r["schedule_date"] for r in rows], ["2026-10-03", "2026-10-04"])
        self.assertEqual(rows[0]["movies"][0]["showtimes"], ["25:10"])
        self.assertEqual(rows[1]["movies"][0]["showtimes"], ["10:00"])
        self.assertEqual(len(rows[0]["source_sha256"]), 64)

    def test_missing_date_challenge_and_stale_pages_rejected(self):
        for html in ("Access denied", HTML.replace('id="showDate"', 'id="missing"'),
                     HTML.replace('value="2026-10-03"', 'value="2025-10-03"')):
            with self.assertRaises(ValueError):
                parse_schedule(html, SOURCES[0], "2026-10-03T00:00:00+00:00")

    def test_old_collector_contract_is_preserved(self):
        from movie_scraper import title_normalize, normalize_title, TheaterSeries, ScreenType
        _, _, scalar = title_normalize("Film IMAX 4DX", TheaterSeries.OTHER)
        _, _, formats = normalize_title("Film IMAX 4DX", TheaterSeries.OTHER)
        self.assertEqual(scalar, ScreenType.IMAX)
        self.assertEqual(formats, [ScreenType.IMAX, ScreenType.FOURDX])


if __name__ == "__main__":
    unittest.main()

