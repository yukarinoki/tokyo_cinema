import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import verified_tokyo

class CollectorTests(unittest.TestCase):
    def test_all_failed_keeps_previous_verified_feed(self):
        with tempfile.TemporaryDirectory() as tmp:
            output=Path(tmp)/'feed.json'
            original='[{"collector":"old"}]'
            output.write_text(original,encoding='utf8')
            with patch.object(verified_tokyo,'collect_one',side_effect=ValueError('official page denied')):
                with self.assertRaisesRegex(RuntimeError,'previous feed preserved'):
                    verified_tokyo.collect(output,0)
            self.assertEqual(output.read_text(encoding='utf8'),original)

    def test_partial_failure_is_explicit_and_never_invents_screenings(self):
        def read(source,client,dates):
            if source['chain']!='tjoy':
                raise ValueError('TEST unavailable source')
            return [dict(theater_name=source['name'],schedule_date=dates[0],movies=[dict(title='TEST',showtimes=['12:00'])])]
        with tempfile.TemporaryDirectory() as tmp:
            output=Path(tmp)/'feed.json'
            with patch.object(verified_tokyo,'collect_one',side_effect=read):
                rows=verified_tokyo.collect(output,0)
            report=json.loads(output.with_name('coverage_latest.json').read_text(encoding='utf8'))
            self.assertEqual(len(rows),3)
            self.assertEqual(report['expected_cinemas'],41)
            self.assertEqual(sum(s['status']=='ok' for s in report['sources']),3)
            self.assertEqual(len(rows[0]['coverage']['failed_sources']),38)

if __name__=='__main__':
    unittest.main()
