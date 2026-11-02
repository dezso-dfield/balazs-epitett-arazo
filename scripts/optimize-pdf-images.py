#!/usr/bin/env python3
"""
PDF-hez optimalizált képmásolatok: a public/uploads alatti nagy képekből (> 150 KB)
max. 1600 px-es JPEG készül a public/uploads/_pdf/<útvonal>.jpg helyre. A PDF-készítő
ezt használja, ha létezik, így az ajánlat PDF jóval kisebb és gyorsabban elkészül.
Az eredeti képek változatlanok maradnak (az alkalmazás azokat mutatja).
Futtatás: python3 scripts/optimize-pdf-images.py   (Pillow szükséges)
"""
import os
import sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'uploads')
OUT = os.path.join(ROOT, '_pdf')
MIN_BYTES = 60 * 1024
MAX_SIDE = 1400

done = skipped = 0
for dirpath, _dirs, files in os.walk(ROOT):
    # A saját kimenet és az előnézeti képek (_thumb) nem forrásképek
    if os.path.abspath(dirpath).startswith((os.path.abspath(OUT), os.path.join(os.path.abspath(ROOT), '_thumb'))):
        continue
    for name in files:
        if not name.lower().endswith(('.png', '.jpg', '.jpeg')):
            continue
        src = os.path.join(dirpath, name)
        if os.path.getsize(src) < MIN_BYTES:
            skipped += 1
            continue
        rel = os.path.relpath(src, ROOT)
        dst = os.path.join(OUT, rel + '.jpg')
        if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
            continue
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        im = Image.open(src)
        if im.mode in ('RGBA', 'LA', 'P'):
            im = im.convert('RGBA')
            bg = Image.new('RGB', im.size, 'white')
            bg.paste(im, mask=im.split()[-1])
            im = bg
        else:
            im = im.convert('RGB')
        im.thumbnail((MAX_SIDE, MAX_SIDE))
        im.save(dst, 'JPEG', quality=76, optimize=True, progressive=True)
        done += 1
print(f'Optimalizálva: {done}, kicsi (kihagyva): {skipped}', file=sys.stderr)
