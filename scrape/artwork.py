"""Source identity and artwork policy. No fuzzy title joins, downloads, or proxying.

TOHO's terms permit private use only. Callers must gate personal-use artwork
before display; this permission is NOT a license for public deployment.
AEON expressly restricts unauthorized image use, so its images remain absent.
"""
from urllib.parse import urlparse
import re

TOHO_POLICY = 'https://www.tohotheater.jp/info/help.html'
AEON_POLICY = 'https://www.aeoncinema.com/sitepolicy/'

def source_identity(provider, value):
    value = str(value or '').strip()
    return f'{provider}:{value}' if re.fullmatch(r'[A-Za-z0-9_-]+', value) else None

def approved_url(value, hosts):
    """Only exact, trusted HTTPS hosts. Never repair arbitrary or protocol URLs."""
    if not isinstance(value, str):
        return None
    try:
        parsed = urlparse(value)
        port = parsed.port
    except ValueError:
        return None
    if parsed.scheme != 'https' or parsed.hostname not in hosts or parsed.username or parsed.password or port not in (None, 443):
        return None
    return value

def toho_metadata(movie, source_url, canonical_title=None, credit=None):
    image = approved_url(movie.get('thumbnail'), {'www.tohotheater.jp', 'hlo.tohotheater.jp'})
    return dict(film_id=source_identity('toho', movie.get('mcode') or movie.get('code')),
        canonical_title=canonical_title or movie.get('name') or None,
        artwork_url=image, artwork_source_url=source_url,
        artwork_credit=credit or None, artwork_permission='personal-use' if image else None,
        artwork_policy_url=TOHO_POLICY)

def aeon_metadata(work, movie, source_url):
    # The exact master id must match; a translated/normalized title is not identity.
    matched = bool(work.get('id') and str(work['id']) == str(movie.get('id')))
    title = movie.get('name', {}) if matched else {}
    title = title.get('ja') or title.get('en') if isinstance(title, dict) else title
    return dict(film_id=source_identity('aeon', work.get('id')),
        canonical_title=title or None, artwork_url=None,
        artwork_source_url=source_url, artwork_credit=None,
        artwork_permission=None, artwork_policy_url=AEON_POLICY)

TOHO_CATALOG_URL = 'https://hlo.tohotheater.jp/data_net/json/movie/TNPI3090.JSON'
TOHO_CATALOG_PAGE = 'https://hlo.tohotheater.jp/net/movie/TNPI3090J01.do'


def parse_toho_catalog(payload):
    """Image directory pattern observed in the ordinary rendered official catalog.

    mcode and the exact image filename both come from its public catalog response.
    Missing filenames remain missing; do not manufacture poster filenames.
    """
    result = {}
    for movie in payload.get('data', []):
        code, filename = str(movie.get('mcode', '')), movie.get('sakuhinGazouNm')
        if not re.fullmatch(r'\d{6}', code) or not isinstance(filename, str):
            continue
        if not re.fullmatch(r'[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp)', filename, re.I):
            continue
        image = f'https://www.tohotheater.jp/images_net/movie/{code}/{filename}'
        metadata = dict(artwork_url=image,
                        artwork_source_url=f'https://hlo.tohotheater.jp/net/movie/TNPI3060J01.do?sakuhin_cd={code}',
                        artwork_metadata_url=TOHO_CATALOG_URL,
                        artwork_credit=movie.get('copyrightNm') or None,
                        artwork_permission='personal-use', artwork_policy_url=TOHO_POLICY,
                        artwork_match_title=movie.get('name') or None)
        identity = source_identity('toho', code)
        if identity in result and result[identity] != metadata:
            # Ambiguous duplicate identities are unsafe to attach automatically.
            result[identity] = None
        elif identity not in result:
            result[identity] = metadata
    return {key: value for key, value in result.items() if value}


def enrich_toho_artwork(rows, client):
    """One shared, rate-controlled metadata request; never fetch image bytes.

    A metadata failure must not hide otherwise valid showtimes. Cache empty failures
    for this collector client as well, so every cinema does not retry an outage.
    Existing film identity / canonical title (including watched keys) are unchanged.
    """
    cache_name = '_tokyo_cinema_toho_artwork'
    if not hasattr(client, cache_name):
        catalog = {}
        try:
            response = client.get(TOHO_CATALOG_URL)
            response.raise_for_status()
            catalog = parse_toho_catalog(response.json())
        except Exception:
            pass
        setattr(client, cache_name, catalog)
    catalog = getattr(client, cache_name)
    for row in rows:
        metadata = catalog.get(row.get('film_id'))
        if metadata:
            row.update(metadata)
    return rows
