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
