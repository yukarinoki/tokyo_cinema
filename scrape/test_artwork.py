import unittest
from artwork import approved_url, source_identity, toho_metadata, aeon_metadata

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

if __name__ == '__main__':unittest.main()
