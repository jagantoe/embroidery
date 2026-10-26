"""Golden check: read our files back with pyembroidery and compare to the plan,
and compare our PES bytes with pyembroidery's own PES writer for the same stitches."""
import json, sys, io
import pyembroidery as pe

norm = json.load(open('tests/out/sample.norm.json'))
pts = norm['pts']
want = [(p['x'], p['y']) for p in pts if p['cmd'] == 'stitch']
ok = True

def stitched(p):
    return [(int(s[0]), int(s[1])) for s in p.stitches if (s[2] & pe.COMMAND_MASK) == pe.STITCH]

def check(fn):
    global ok
    p = pe.read(fn)
    got = stitched(p)
    # PEC/EXP/DST readers may add 0-length lock stitches; compare the de-duplicated sequences
    dedupe = lambda seq: [v for i, v in enumerate(seq) if i == 0 or v != seq[i-1]]
    g, w = dedupe(got), dedupe(want)
    # DST/EXP have no absolute origin; compare relative to first point
    off = (g[0][0]-w[0][0], g[0][1]-w[0][1])
    rel = [(x-off[0], y-off[1]) for x, y in g]
    same = rel == w
    print(fn, 'stitches', len(g), 'expected', len(w), 'match' if same else 'MISMATCH', 'colours', p.count_color_changes())
    if not same:
        ok = False
        for i,(a,b) in enumerate(zip(rel,w)):
            if a!=b: print('  first diff at', i, a, b); break
    return p

p = check('tests/out/sample.pes')
print('pes threads', [t.hex_color() for t in p.threadlist])
check('tests/out/sample.dst')
check('tests/out/sample.exp')

# byte comparison against pyembroidery's PES v1 writer
pat = pe.EmbPattern()
pat.add_thread(pe.EmbThread('#000000')); pat.add_thread(pe.EmbThread('#ed171f'))
for q in pts:
    c = {'stitch': pe.STITCH, 'jump': pe.JUMP, 'trim': pe.TRIM, 'colour': pe.COLOR_CHANGE, 'end': pe.END}[q['cmd']]
    pat.add_stitch_absolute(c, q['x'], q['y'])
pat.metadata('name', 'TEST')
buf = io.BytesIO()
pe.write_pes(pat, buf, {'version': 1})
theirs = buf.getvalue()
ours = open('tests/out/sample.pes', 'rb').read()
import struct
pec = struct.unpack('<I', ours[8:12])[0]
thumbs = pec + 512 + int.from_bytes(ours[pec+514:pec+517], 'little')
same_core = ours[:thumbs] == theirs[:thumbs]
print('pes bytes ours', len(ours), 'pyembroidery', len(theirs), 'header+stitches identical' if same_core else 'DIFFERENT',
      '(thumbnails differ by', sum(a != b for a, b in zip(ours[thumbs:], theirs[thumbs:])), 'bytes)')
ok = ok and same_core and len(ours) == len(theirs)
if not same_core:
    for i,(a,b) in enumerate(zip(ours,theirs)):
        if a!=b: print('  first byte diff at', i, hex(a), hex(b)); break
    pe.write_pes(pat, 'tests/out/sample.pyemb.pes', {'version': 1})
sys.exit(0 if ok else 1)
