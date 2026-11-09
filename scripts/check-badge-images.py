#!/usr/bin/env python3
"""Check the actual published image URLs, including redirects and response bodies."""
import concurrent.futures
import json
from pathlib import Path
import sys
import urllib.request
import xml.etree.ElementTree as ET


def check(badge):
    try:
        with urllib.request.urlopen(badge['imageURL'], timeout=20) as response:
            mime = response.headers.get_content_type()
            body = response.read(2 * 1024 * 1024 + 1)
        if len(body) > 2 * 1024 * 1024:
            raise ValueError('image exceeds 2 MiB')
        if mime == 'image/png':
            if not body.startswith(b'\x89PNG\r\n\x1a\n'):
                raise ValueError('invalid PNG signature')
        elif mime == 'image/svg+xml':
            if ET.fromstring(body).tag != '{http://www.w3.org/2000/svg}svg':
                raise ValueError('invalid SVG root')
        else:
            raise ValueError('unexpected content type: ' + mime)
        return None
    except Exception as error:
        return f"{badge['id']}: {error} ({badge['imageURL']})"


if __name__ == '__main__':
    pack = json.loads((Path(__file__).resolve().parent.parent / 'badges.json').read_text())
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        failures = [result for result in pool.map(check, pack['filters']) if result]
    for failure in failures:
        print(failure, file=sys.stderr)
    print(f"Published badge images: {len(pack['filters']) - len(failures)}/{len(pack['filters'])} valid")
    sys.exit(bool(failures))
