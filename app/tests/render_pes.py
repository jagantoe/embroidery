"""Render a .pes file (as read by pyembroidery) to a PNG for visual checks."""
import sys
import pyembroidery as pe
from PIL import Image, ImageDraw
fn, out = sys.argv[1], sys.argv[2]
scale = float(sys.argv[3]) if len(sys.argv) > 3 else 8  # px per mm
p = pe.read(fn)
x0, y0, x1, y1 = p.bounds()
W, H = int((x1 - x0) / 10 * scale) + 40, int((y1 - y0) / 10 * scale) + 40
im = Image.new('RGB', (W, H), (236, 232, 226))
d = ImageDraw.Draw(im)
ti = 0
colours = [t.color for t in p.threadlist] or [0]
prev = None
jumps = 0
for x, y, c in p.stitches:
    cmd = c & pe.COMMAND_MASK
    X, Y = (x - x0) / 10 * scale + 20, (y - y0) / 10 * scale + 20
    if cmd == pe.STITCH:
        if prev is not None:
            col = colours[min(ti, len(colours) - 1)]
            rgb = ((col >> 16) & 255, (col >> 8) & 255, col & 255)
            d.line([prev, (X, Y)], fill=rgb, width=max(1, int(scale * 0.35)))
        prev = (X, Y)
    elif cmd == pe.COLOR_CHANGE:
        ti += 1; prev = None
    elif cmd in (pe.JUMP, pe.TRIM):
        prev = None
        if cmd == pe.JUMP: jumps += 1
im.save(out)
print(out, 'stitches', p.count_stitch_commands(pe.STITCH), 'jumps', jumps, 'colours', len(p.threadlist), 'size mm', (x1-x0)/10, (y1-y0)/10)
