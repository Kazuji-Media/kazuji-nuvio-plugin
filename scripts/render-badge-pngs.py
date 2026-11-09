#!/usr/bin/env python3
"""Regenerate uniform PNGs from committed originals; requires Pillow and Inkscape."""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
subprocess.run(['node', str(ROOT / 'scripts/build-badges.js'), '--sources-only'], check=True)
manifest = ROOT / 'src/fusion-images.json'
images = json.loads(manifest.read_text())
with tempfile.TemporaryDirectory() as temp:
    for entry in images:
        source = ROOT / entry['source']
        raster = source
        if source.suffix == '.svg':
            raster = Path(temp) / (entry['id'] + '.png')
            subprocess.run(['inkscape', str(source), '--export-type=png',
                            '--export-filename=' + str(raster)], check=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        with Image.open(raster) as original:
            image = original.convert('RGBA')
            width = round(image.width * 80 / image.height)
            image = image.resize((width, 80), Image.Resampling.LANCZOS)
            # Keep antialiasing in alpha, with a consistent white foreground.
            alpha = image.getchannel('A')
            if not alpha.getbbox() or alpha.getextrema()[0] != 0:
                raise ValueError('Missing artwork or transparency: ' + entry['id'])
            output = Image.new('RGBA', image.size, 'white')
            output.putalpha(alpha)
            target = ROOT / 'assets/fusion' / (entry['id'] + '-v3.png')
            output.save(target, optimize=True)
        entry['sourceSha256'] = hashlib.sha256(source.read_bytes()).hexdigest()
        entry['pngSha256'] = hashlib.sha256(target.read_bytes()).hexdigest()
manifest.write_text(json.dumps(images, indent=2) + '\n')
print(f"Fusion: {len(images)} transparent RGBA PNGs rendered at 80px height")
