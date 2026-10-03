import unittest
from bs4 import BeautifulSoup
from adapters_smt_109_united import parse_109, parse_smt, parse_united, collect, _identity

def soup(html):
    return BeautifulSoup(html, 'html.parser')

class AdapterTests(unittest.TestCase):
    def test_109_explicit_date_and_version_runtime(self):
        html='''<article><h2>Film IMAX字幕</h2><ul class="timetable"><li class="theatre"><span class="theatre-num">7</span><small>106分</small></li><li class="check_date" data-date="202610032350"><time class="start">23:50</time><time class="end">01:45</time></li></ul></article>'''
        rows=parse_109(soup(html),'https://109cinemas.net/x',['2026-10-03'])
        self.assertEqual(len(rows),1)
        self.assertEqual((rows[0]['runtime_minutes'],rows[0]['end'],rows[0]['screen']),(106,'01:45','7'))
        self.assertEqual(parse_109(soup(html),'x',['2026-10-04']),[])
        self.assertEqual(parse_109(soup(html.replace('202610032350','202610031350')),'x',['2026-10-03']),[])

    def test_united_uses_embedded_date_not_request_date(self):
        html='''<li><h3><span class="movieTitle">Film 4DX吹替</span></h3><!--<p class="showingTime">120分</p>--><div><ol><li class="startTime">22:50</li><li class="endTime">～01:10</li></ol><a href="/all/cc.php?sd=20261003&amp;st=20261003225000&amp;sc=009">buy</a></div></li>'''
        rows=parse_united(soup(html),'https://www.unitedcinemas.jp/x',['2026-10-03'])
        self.assertEqual(len(rows),1)
        self.assertIsNone(rows[0]['runtime_minutes'])
        self.assertEqual(rows[0]['end'],'01:10')
        self.assertEqual(parse_united(soup(html.replace('sd=20261003','sd=20261004')),'x',['2026-10-03']),[])
        self.assertEqual(parse_united(soup(html.replace('st=20261003225000','st=20261003215000')),'x',['2026-10-03']),[])

    def test_smt_runtime_and_midnight(self):
        html='''<section class="daily"><section><div class="movieTitle"><h2>映画（本編：124分）<span class="enLabel">Film</span></h2></div><div class="select"><div class="block"><h3>シアター3</h3><div class="inner" id="0_1051_48941_20261003_5_03_0"><p class="time"><span>22:05～</span>0:20</p></div></div></div></section></section>'''
        rows=parse_smt(soup(html),'https://www.smt-cinema.com/x',['2026-10-03'])
        self.assertEqual(len(rows),1)
        self.assertEqual((rows[0]['title'],rows[0]['runtime_minutes'],rows[0]['end']),('映画',124,'00:20'))
        self.assertEqual(parse_smt(soup(html.replace('20261003','nodate')),'x',['2026-10-03']),[])
        self.assertIsNone(parse_smt(soup(html.replace('（本編：124分）','')),'x',['2026-10-03'])[0]['runtime_minutes'])

    def test_unknown_smt_system_fails_explicitly(self):
        class Response:
            content=b'<html>No public schedule identifier</html>'
            def raise_for_status(self):pass
        class Client:
            def get(self,url):return Response()
        with self.assertRaisesRegex(ValueError,'identifier unavailable'):
            collect({'chain':'smt','url':'https://www.smt-cinema.com/site/example/'},Client(),['2026-10-03'])

    def test_united_malformed_movie_li_keeps_later_screen(self):
        show=lambda hour,screen: f'<div><ol><li class="startTime">{hour}:00</li><li class="endTime">23:00</li></ol><a href="/all/cc.php?sd=20261003&amp;st=20261003{hour}0000&amp;sc={screen}">buy</a></div>'
        html='<li><span class="movieTitle">Film IMAX</span>'+show('18','01')+'</li>'+show('21','02')
        rows=parse_united(soup(html),'x',['2026-10-03'])
        self.assertEqual(len(rows),2)
        self.assertEqual(rows[1]['title'],'Film IMAX')
        self.assertEqual(rows[1]['screen'],'02')

    def test_109_premium_min_and_event_suppression(self):
        html='''<article><h2>Film 舞台挨拶</h2><ul class="timetable"><li class="theatre"><small>106min</small></li><li class="check_date" data-date="202610031200"><time class="start">12:00</time><time class="end">14:30</time></li></ul></article>'''
        self.assertIsNone(parse_109(soup(html),'x',['2026-10-03'])[0]['runtime_minutes'])
        self.assertEqual(parse_109(soup(html.replace('舞台挨拶','Dolby Atmos字幕')),'x',['2026-10-03'])[0]['runtime_minutes'],106)

    def test_source_qualified_identity_preserves_source_title(self):
        title='A very long film title IMAX 字幕'
        for chain, href, key in [('109','https://109cinemas.net/movies/5677.html','109:5677'),
                                 ('109','./movies.html?id=5538','109:5538'),
                                 ('united','film.php?film=22413?mute=1&from=daily','united:22413')]:
            meta=_identity(chain,title,soup(f'<a href="{href}">x</a>').a,'https://example.org/page')
            self.assertEqual(meta['film_id'],key)
            self.assertEqual(meta['canonical_title'],title)
            self.assertIsNone(meta['artwork_url'])
            self.assertIsNone(meta['artwork_permission'])
        self.assertIsNone(_identity('109','Film',None,'https://109cinemas.net/')['film_id'])

    def test_smt_artwork_requires_same_film_and_personal_use(self):
        link=soup('<a href="/site/shinjuku/movie/detail/?cinemaid=T0032285&mo=48805&type=0">detail</a>').a
        poster='/movie_data/T0032285/T0032285_leafletimg_r_l.jpg'
        img=lambda path:soup(f'<img src="{path}">').img
        meta=_identity('smt','Film',link,'https://www.smt-cinema.com/html/schedule.html',img(poster))
        self.assertEqual(meta['film_id'],'smt:T0032285')
        self.assertEqual(meta['artwork_url'],'https://www.smt-cinema.com'+poster)
        self.assertEqual(meta['artwork_permission'],'personal-use')
        self.assertEqual(meta['artwork_policy_url'],'https://www.smt-cinema.com/aboutsite/')
        self.assertIsNone(meta['release_year'])
        for bad in ['/img/movie_data/noimage.jpg',poster.replace('T0032285','T9999999'),
                    'https://evil.example'+poster,'http://www.smt-cinema.com'+poster]:
            self.assertIsNone(_identity('smt','Film',link,'https://www.smt-cinema.com/',img(bad))['artwork_url'])

if __name__=='__main__':unittest.main()
