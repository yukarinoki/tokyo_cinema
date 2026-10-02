import unittest
from adapters_toho_aeon import parse_toho, parse_aeon, collect

class OfficialAdaptersTest(unittest.TestCase):
    def test_aeon_uses_official_versioned_public_urls(self):
        class Response:
            def raise_for_status(self): pass
            def json(self): return {}
        class Client:
            def __init__(self): self.urls = []
            def get(self, url):
                self.urls.append(url)
                return Response()
        client = Client()
        self.assertEqual(collect({'chain':'aeon','slug':'musashino'}, client, ['2026-10-03']), [])
        self.assertRegex(client.urls[0], r'/musashino/schedule.json\?v=\d{12}$')
        self.assertRegex(client.urls[1], r'/__master/movies.json\?v=\d{10}$')

    def test_toho_date_runtime_event_and_physical_site(self):
        show = {'showingStart':'9:05','showingEnd':'11:10','screen':{'name':'SCREEN 1','theaterCd':'0292'}}
        movie = {'name':'Film IMAX','hours':120,'list':[show]}
        data = {'status':'0','data':[{'showDay':{'date':'20261003'},'list':[{'name':'Kinshicho Orinas','code':'029','list':[movie]}]}]}
        row = parse_toho(data,'2026-10-03','official')[0]
        self.assertEqual((row['start'],row['runtime_minutes'],row['site_code']),('09:05',120,'0292'))
        self.assertEqual(parse_toho(data,'2026-10-04','official'),[])
        show['eventIcon'] = 'stage-event.gif'
        self.assertIsNone(parse_toho(data,'2026-10-03','official')[0]['runtime_minutes'])

    def event(self, **changes):
        data = {'id':'a','name':{'ja':'Film IMAX'},'startDate':'2026-10-03T14:30:00Z','endDate':'2026-10-03T16:45:00Z','location':{'name':{'ja':'Screen 1'}},'superEvent':{'workPerformed':{'id':'exact'}}}
        data.update(changes)
        return data

    def parse(self, event, master=None):
        return parse_aeon({'20261003':{'film':[event]}},master or {},['2026-10-03','2026-10-04'],'official')

    def test_aeon_exact_runtime_and_midnight(self):
        row = self.parse(self.event(),{'film':{'id':'exact','duration':'PT2H'}})[0]
        self.assertEqual((row['date'],row['start'],row['end'],row['runtime_minutes']),('2026-10-03','23:30','25:45',120))
        self.assertIsNotNone(row['runtime_source_url'])

    def test_actual_jst_date_not_business_key(self):
        row = self.parse(self.event(startDate='2026-10-03T15:30:00Z'))[0]
        self.assertEqual((row['date'],row['start']),('2026-10-04','00:30'))

    def test_no_fabricated_runtime_and_invalid_end(self):
        row = self.parse(self.event(endDate='2026-10-03T12:00:00Z'),{'film':{'id':'different','duration':'PT2H'}})[0]
        self.assertIsNone(row['runtime_minutes'])
        self.assertIsNone(row['end'])
        self.assertEqual(self.parse(self.event(startDate='2026-10-03T14:30:00')),[])

    def test_events_and_invalid_duration(self):
        for title,duration in [('舞台挨拶 Film','PT2H'),('Film','PT0M'),('Film','PT-2H')]:
            row=self.parse(self.event(name={'ja':title}),{'film':{'id':'exact','duration':duration}})[0]
            self.assertIsNone(row['runtime_minutes'])

if __name__ == '__main__':
    unittest.main()
