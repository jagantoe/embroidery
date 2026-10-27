"""Compare two embroidery files (e.g. our auto-digitized output vs. a hand-digitized reference).

    python3 -I tests/compare_pes.py ours.pes reference.pes [source.rgba W H] [--png out.png]

Prints a side-by-side table per file and per colour: size, stitches, trims, jumps,
stitch-length spread and dominant stitch angles. With the source raster it also
reports where each colour's needle points land on the original artwork, which
shows layering strategy (fills running under outlines) and outline widening.
"""
import math
import sys
from collections import Counter

import pyembroidery as pe

args = [a for a in sys.argv[1:] if not a.startswith('--')]
png = None
if '--png' in sys.argv:
    png = sys.argv[sys.argv.index('--png') + 1]
    args = [a for a in args if a != png]
files = args[:2]
raster = None
if len(args) >= 5:
    import numpy as np
    W, H = int(args[3]), int(args[4])
    raster = np.frombuffer(open(args[2], 'rb').read(), np.uint8).reshape(H, W, 4)


def classify(px):
    r, g, b, a = (int(v) for v in px)
    if a < 128:
        return 'empty'
    if r > 200 and g > 200 and b > 200:
        return 'white'
    if r < 60 and g < 60 and b < 60:
        return 'black'
    if r > 120 and g < 80 and b < 80:
        return 'red'
    if g > 90 and r < 100 and b < 100:
        return 'green'
    if b > 120 and r < 100:
        return 'blue'
    if r > 180 and g > 150 and b < 100:
        return 'yellow'
    return 'other'


def analyse(fn):
    p = pe.read(fn)
    x0, y0, x1, y1 = p.bounds()
    blocks = [{'stitches': [], 'trims': 0, 'jumps': []}]
    prev = None
    for x, y, c in p.stitches:
        c &= pe.COMMAND_MASK
        b = blocks[-1]
        if c == pe.COLOR_CHANGE:
            blocks.append({'stitches': [], 'trims': 0, 'jumps': []})
            prev = None
        elif c == pe.STITCH:
            b['stitches'].append((x / 10, y / 10))
            prev = (x, y)
        elif c == pe.TRIM:
            b['trims'] += 1
        elif c == pe.JUMP:
            if prev:
                b['jumps'].append(math.dist(prev, (x, y)) / 10)
            prev = (x, y)
    blocks = [b for b in blocks if b['stitches']]
    out = {'size': ((x1 - x0) / 10, (y1 - y0) / 10), 'bounds': (x0 / 10, y0 / 10, x1 / 10, y1 / 10), 'blocks': []}
    for i, b in enumerate(blocks):
        t = p.threadlist[i] if i < len(p.threadlist) else None
        st = b['stitches']
        lens = sorted(math.dist(st[k - 1], st[k]) for k in range(1, len(st)))
        q = lambda f: lens[int(f * (len(lens) - 1))] if lens else 0
        ang = Counter()
        for k in range(1, len(st)):
            d = math.dist(st[k - 1], st[k])
            if d > 2.0:
                a = math.degrees(math.atan2(st[k][1] - st[k - 1][1], st[k][0] - st[k - 1][0])) % 180
                ang[int(round(a / 15) * 15) % 180] += 1
        land = Counter()
        if raster is not None:
            Hh, Ww = raster.shape[:2]
            bx0, by0, bx1, by1 = out['bounds']
            for x, y in st:
                u = int((x - bx0) / max(1e-6, bx1 - bx0) * (Ww - 1))
                v = int((y - by0) / max(1e-6, by1 - by0) * (Hh - 1))
                land[classify(raster[min(Hh - 1, max(0, v)), min(Ww - 1, max(0, u))])] += 1
        out['blocks'].append({
            'name': f"{t.description} #{t.catalog_number}" if t is not None and t.description else (t.hex_color() if t is not None else '?'),
            'stitches': len(st), 'trims': b['trims'], 'jumps': len(b['jumps']),
            'long_jumps': sum(j > 3 for j in b['jumps']),
            'len_p10_p50_p90': (round(q(.1), 2), round(q(.5), 2), round(q(.9), 2)),
            'angles': [a for a, _ in ang.most_common(2)],
            'lands_on': {k: round(v * 100 / max(1, len(st))) for k, v in land.most_common(4)},
        })
    out['total'] = sum(b['stitches'] for b in out['blocks'])
    out['trims'] = sum(b['trims'] for b in out['blocks'])
    return out


res = [analyse(f) for f in files]
for f, r in zip(files, res):
    print(f"\n== {f}: {r['size'][0]:.1f} × {r['size'][1]:.1f} mm · {r['total']:,} stitches · {len(r['blocks'])} colours · {r['trims']} trims")
    for b in r['blocks']:
        print(f"  {b['name']:<22} {b['stitches']:>6} st  trims {b['trims']:>3}  jumps>3mm {b['long_jumps']:>3}  len p10/50/90 {b['len_p10_p50_p90']}  angles {b['angles']}  lands on {b['lands_on']}")

if png:
    from PIL import Image, ImageDraw
    scale = 6
    ims = []
    for f in files:
        p = pe.read(f)
        x0, y0, x1, y1 = p.bounds()
        im = Image.new('RGB', (int((x1 - x0) / 10 * scale) + 20, int((y1 - y0) / 10 * scale) + 40), (236, 232, 226))
        d = ImageDraw.Draw(im)
        d.text((10, 5), f.split('/')[-1], fill=(0, 0, 0))
        cols = [t.color for t in p.threadlist] or [0]
        ti, prev = 0, None
        for x, y, c in p.stitches:
            c &= pe.COMMAND_MASK
            X, Y = (x - x0) / 10 * scale + 10, (y - y0) / 10 * scale + 30
            if c == pe.STITCH:
                col = cols[min(ti, len(cols) - 1)]
                if prev:
                    d.line([prev, (X, Y)], fill=((col >> 16) & 255, (col >> 8) & 255, col & 255), width=2)
                prev = (X, Y)
            elif c == pe.COLOR_CHANGE:
                ti += 1
                prev = None
            elif c == pe.JUMP:
                prev = None
        ims.append(im)
    out = Image.new('RGB', (sum(i.width for i in ims) + 10, max(i.height for i in ims)), (255, 255, 255))
    x = 0
    for i in ims:
        out.paste(i, (x, 0))
        x += i.width + 10
    out.save(png)
    print('\nwrote', png)
