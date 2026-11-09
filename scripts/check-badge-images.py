#!/usr/bin/env python3
"""Check the actual published image URLs, including redirects and response bodies."""
import concurrent.futures
import json
import hashlib
import os
from pathlib import Path
import sys
import urllib.request
import urllib.parse

ROOT = Path(__file__).resolve().parent.parent
PREFIX = 'https://raw.githubusercontent.com/Kazuji-Media/kazuji-nuvio-plugin/'
REF = os.environ.get('BADGE_IMAGE_REF', 'main')
IMAGES = {image['id']: image for image in json.loads((ROOT / 'src/fusion-images.json').read_text())}


def check(badge):
    url = badge['imageURL']
    try:
        expected = PREFIX + 'main/assets/fusion/' + badge['id'] + '-v3.png'
        if badge['imageURL'] != expected:
            raise ValueError('badge must use a PNG from this repository')
        url = PREFIX + urllib.parse.quote(REF, safe='/') + '/assets/fusion/' + badge['id'] + '-v3.png'
        with urllib.request.urlopen(url, timeout=20) as response:
            mime = response.headers.get_content_type()
            body = response.read(2 * 1024 * 1024 + 1)
        if len(body) > 2 * 1024 * 1024:
            raise ValueError('image exceeds 2 MiB')
        if mime != 'image/png':
            raise ValueError('unexpected content type: ' + mime)
        if not body.startswith(b'\x89PNG\r\n\x1a\n'):
            raise ValueError('invalid PNG signature')
        if hashlib.sha256(body).hexdigest() != IMAGES[badge['id']]['pngSha256']:
            raise ValueError('published PNG differs from the committed image')
        return None
    except Exception as error:
        return f"{badge['id']}: {error} ({url})"


if __name__ == '__main__':
    pack = json.loads((ROOT / 'badges.json').read_text())
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        failures = [result for result in pool.map(check, pack['filters']) if result]
    for failure in failures:
        print(failure, file=sys.stderr)
    print(f"Published badge images: {len(pack['filters']) - len(failures)}/{len(pack['filters'])} valid")
    sys.exit(bool(failures))
