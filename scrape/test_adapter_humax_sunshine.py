import unittest
from adapters_humax_sunshine import parse_humax, parse_sunshine, _runtime

class ParserTests(unittest.TestCase):
    def test_humax_dated_variants_and_event_runtime(self):
        html = '''<div class="schedule-content" data-schedule-date="2026-10-03"><li class="schedule-movie-item"><h3 class="schedule-movie-information-title">Film IMAX</h3><p class="schedule-movie-information-duration">上映時間：128分</p><li class="schedule-showtime-item"><span class="schedule-showtime-time"><span class="schedule-showtime-time-start">23:30</span>～25:48</span><span class="schedule-showtime-screen">1</span></li></li></div>'''
        row = parse_humax(html, {'2026-10-03'}, 'https://official')[0]
        self.assertEqual((row['start'], row['end'], row['runtime_minutes']), ('23:30', '25:48', 128))
        self.assertEqual(parse_humax(html, {'2026-10-04'}, 'url'), [])
        self.assertIsNone(parse_humax(html.replace('Film IMAX', 'Film 舞台挨拶'), {'2026-10-03'}, 'url')[0]['runtime_minutes'])

    def test_runtime_requires_exact_and_non_event(self):
        for raw in ('約100分', '0分', '-5分', 'PT2H3M4S', ''):
            self.assertIsNone(_runtime(raw, 'Film'))
        self.assertEqual(_runtime('PT2H53M', 'Film 字幕'), 173)
        self.assertIsNone(_runtime('PT2H', 'ライブビューイング'))

    def test_sunshine_timezone_midnight_and_invalid_end(self):
        show = {'name': {'ja': 'Film 4DX'}, 'startDate': '2026-10-03T14:30:00Z', 'endDate': '2026-10-04T01:50:00+0900', 'workPerformed': {'duration': 'PT2H10M'}, 'location': {'name': {'ja': '4DX'}}}
        rows = parse_sunshine({'2330': {'1': show}}, {'2026-10-03'}, 'url')
        self.assertEqual((rows[0]['date'], rows[0]['start'], rows[0]['end'], rows[0]['runtime_minutes']), ('2026-10-03', '23:30', '25:50', 130))
        show['endDate'] = '2026-10-03T01:00:00+0900'
        show['workPerformed'] = {}
        row = parse_sunshine({'2330': {'1': show}}, {'2026-10-03'}, 'url')[0]
        self.assertIsNone(row['end'])
        self.assertIsNone(row['runtime_minutes'])
        self.assertEqual(parse_sunshine({'2330': {'1': show}}, {'2026-10-04'}, 'url'), [])
        show['startDate'] = '2026-10-03T23:30:00'
        self.assertEqual(parse_sunshine({'2330': {'1': show}}, {'2026-10-03'}, 'url'), [])


    def test_artwork_is_not_licensed_by_public_availability(self):
        from adapters_humax_sunshine import _film_metadata
        for chain in ('humax', 'sunshine'):
            meta = _film_metadata(chain, 'Film【IMAX字幕】', 'https://official.example/film')
            self.assertEqual(meta['canonical_title'], 'Film【IMAX字幕】')
            self.assertEqual(meta['artwork_source_url'], 'https://official.example/film')
            for field in ('artwork_url', 'artwork_credit', 'artwork_permission', 'release_year'):
                self.assertIsNone(meta[field])
            self.assertTrue(meta['artwork_policy_url'].endswith('/sitepolicy/'))

    def test_sunshine_uses_explicit_variant_identifier_not_screening_id(self):
        show = {'name': {'ja': 'Film【IMAX字幕】'}, 'smartTheaterNo': '2915400',
                'id': 'SCREENING-ONLY', 'startDate': '2026-10-03T10:00:00+0900',
                'endDate': '2026-10-03T12:00:00+0900'}
        row = parse_sunshine({'1000': {'1': show}}, {'2026-10-03'}, 'https://official')[0]
        self.assertEqual(row['source_film_id'], 'sunshine:2915400')
        self.assertEqual(row['canonical_title'], 'Film【IMAX字幕】')
        self.assertIsNone(row['artwork_url'])
        del show['smartTheaterNo']
        row = parse_sunshine({'1000': {'1': show}}, {'2026-10-03'}, 'https://official')[0]
        self.assertIsNone(row['source_film_id'])

if __name__ == '__main__':
    unittest.main()
