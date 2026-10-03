import unittest
from artwork import approved_url, source_identity, toho_metadata, aeon_metadata, parse_toho_catalog, enrich_toho_artwork

class ArtworkTest(unittest.TestCase):
    def test_exact_source_identity(self):
        self.assertEqual(source_identity('toho','029011'),'toho:029011')
        self.assertNotEqual(source_identity('toho','123'),source_identity('aeon','123'))
        self.assertIsNone(source_identity('toho','../123'))
    def test_reject_external_credentials_and_insecure(self):
        for u in ['https://www.tohotheater.jp:bad/a.jpg','http://www.tohotheater.jp/a.jpg','https://www.tohotheater.jp.evil.test/a.jpg','https://user@www.tohotheater.jp/a.jpg','https://www.tohotheater.jp:8000/a.jpg']:
            self.assertIsNone(approved_url(u,{'www.tohotheater.jp'}))
    def test_personal_permission_is_explicit(self):
        d=toho_metadata({'mcode':'123','name':'Exact title','thumbnail':'https://www.tohotheater.jp/image.jpg'},'official',credit='Rights holder')
        self.assertEqual(d['artwork_permission'],'personal-use')
        self.assertEqual(d['artwork_credit'],'Rights holder')
        self.assertIsNone(toho_metadata({'mcode':'123'},'official')['artwork_permission'])
    def test_aeon_no_inline_art_even_with_poster(self):
        d=aeon_metadata({'id':'abc'},{'id':'abc','name':{'ja':'Exact work'},'thumbnailUrl':'https://www.aeoncinema.com/poster.jpg'},'official')
        self.assertEqual(d['canonical_title'],'Exact work')
        self.assertIsNone(d['artwork_url'])
        self.assertIsNone(aeon_metadata({'id':'abc'},{'id':'other','name':{'ja':'Wrong'}},'official')['canonical_title'])

class CatalogTest(unittest.TestCase):
    def test_exact_id_missing_and_invalid_filename(self):
        data={'data':[{'mcode':'028671','sakuhinGazouNm':'SAKUHIN028671_2.jpg','name':'Catalog title','copyrightNm':'Rights'},
                      {'mcode':'029000','sakuhinGazouNm':''}, {'mcode':'029001','sakuhinGazouNm':'../wrong.jpg'}]}
        result=parse_toho_catalog(data)
        self.assertEqual(list(result),['toho:028671'])
        self.assertEqual(result['toho:028671']['artwork_credit'],'Rights')
        self.assertEqual(result['toho:028671']['artwork_source_url'],'https://hlo.tohotheater.jp/net/movie/TNPI3060J01.do?sakuhin_cd=028671')
        self.assertEqual(result['toho:028671']['artwork_url'],'https://www.tohotheater.jp/images_net/movie/028671/SAKUHIN028671_2.jpg')
    def test_shared_cache_preserves_watched_identity_and_handles_failure(self):
        class Response:
            def raise_for_status(self): pass
            def json(self):return {'data':[{'mcode':'028671','sakuhinGazouNm':'actual.jpg','name':'New title'}]}
        class Client:
            calls=0
            def get(self,url):self.calls+=1;return Response()
        c=Client();r={'film_id':'toho:028671','canonical_title':'Keep this','title':'Same screening'}
        enrich_toho_artwork([r],c);enrich_toho_artwork([r],c)
        self.assertEqual(c.calls,1)
        self.assertEqual(r['canonical_title'],'Keep this')
        self.assertEqual(r['film_id'],'toho:028671')
        self.assertEqual(r['artwork_match_title'],'New title')
        other={'film_id':'aeon:028671'};enrich_toho_artwork([other],c)
        self.assertNotIn('artwork_url',other)
        class Failure:
            calls=0
            def get(self,url):self.calls+=1;raise ValueError('blocked')
        c=Failure();enrich_toho_artwork([r],c);enrich_toho_artwork([r],c)
        self.assertEqual(c.calls,1)
    def test_conflicting_catalog_identity_is_not_used(self):
        self.assertEqual(parse_toho_catalog({'data':[{'mcode':'028671','sakuhinGazouNm':'a.jpg'}, {'mcode':'028671','sakuhinGazouNm':'b.jpg'}]}),{})

if __name__ == '__main__':unittest.main()
