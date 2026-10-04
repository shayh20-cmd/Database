"""Builds Project Hub's icons from its brand mark (the cube in the sidebar's BrandLockup):
  tools/quick-access/project-hub-cube.ico           the app (Start menu "Project Hub")
  tools/quick-access/project-hub-cube-new-task.ico  the app with a green "+" (new task / the quick window)
  icon-192.png, icon-512.png                   the site's favicon and installed-app icon
  icon-new-task-192.png                        the quick window's favicon (the cube with the "+")
  chrome-extension/icon-16..128.png            the Chrome extension's icons (the cube with the "+")
  icon-512-maskable.png                        the same on a white tile, inside the maskable safe zone
In the .ico files sizes up to 128 are classic 32-bit bitmaps and only 256 is PNG: Explorer and the
taskbar draw a blank page for small PNG-only entries.  Run: python tools/quick-access/make-icons.py
"""
import io
import os
import struct

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
S = 1024

# the mark's SVG (viewBox 0 0 64 64) and colours, as in project_hub_01.html's .brand-lockup CSS
TOP = [(32, 6.2), (52.2, 17.9), (32, 29.6), (11.8, 17.9)]
LEFT = [(9.9, 21.2), (30.1, 32.9), (30.1, 56.2), (9.9, 44.5)]
RIGHT = [(33.9, 32.9), (54.1, 21.2), (54.1, 44.5), (33.9, 56.2)]
NODE = (32, 31.8, 4.4)
C_TOP, C_LEFT, C_RIGHT, C_STROKE = '#7cc4f5', '#1d63c9', '#0a2540', '#1d63c9'


def cube(size=S, inset=0.0, bg=None):
    """The mark on a transparent (or bg-coloured) square; inset shrinks it toward the centre."""
    im = Image.new('RGBA', (size, size), bg or (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # the mark spans x 9.9..54.1, y 6.2..56.2 — centre it and fill the square
    span = 50.0
    k = size * (1 - 2 * inset) / span
    ox = size / 2 - 32 * k
    oy = size / 2 - 31.2 * k
    pt = lambda p: (ox + p[0] * k, oy + p[1] * k)
    for poly, col in ((TOP, C_TOP), (LEFT, C_LEFT), (RIGHT, C_RIGHT)):
        d.polygon([pt(p) for p in poly], fill=col)
    cx, cy = pt(NODE[:2])
    r = NODE[2] * k
    w = 2.4 * k
    d.ellipse([cx - r - w / 2, cy - r - w / 2, cx + r + w / 2, cy + r + w / 2], fill=C_STROKE)
    d.ellipse([cx - r + w / 2, cy - r + w / 2, cx + r - w / 2, cy + r - w / 2], fill='white')
    return im


def base():
    return cube(inset=0.02)


def with_plus(im):
    im = im.copy()
    d = ImageDraw.Draw(im)
    r = int(S * .25)
    cx = cy = S - r - int(S * .01)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, 255))
    r2 = int(r * .82)
    d.ellipse([cx - r2, cy - r2, cx + r2, cy + r2], fill=(22, 163, 74, 255))
    w, ln = int(r * .26), int(r * .55)
    d.rounded_rectangle([cx - ln, cy - w // 2, cx + ln, cy + w // 2], radius=w // 2, fill='white')
    d.rounded_rectangle([cx - w // 2, cy - ln, cx + w // 2, cy + ln], radius=w // 2, fill='white')
    return im


def write_ico(im, path):
    entries = []
    for n in (16, 20, 24, 32, 40, 48, 64, 96, 128, 256):
        img = im.resize((n, n), Image.LANCZOS)
        if n == 256:
            b = io.BytesIO()
            img.save(b, 'PNG')
            data = b.getvalue()
        else:
            px = img.tobytes('raw', 'BGRA')
            rows = [px[y * n * 4:(y + 1) * n * 4] for y in range(n)][::-1]  # bottom-up
            hdr = struct.pack('<IiiHHIIiiII', 40, n, n * 2, 1, 32, 0, n * n * 4, 0, 0, 0, 0)
            data = hdr + b''.join(rows) + b'\x00' * (((n + 31) // 32) * 4) * n  # + empty AND mask
        entries.append((n, data))
    out = struct.pack('<HHH', 0, 1, len(entries))
    off = 6 + 16 * len(entries)
    for n, data in entries:
        out += struct.pack('<BBBBHHII', n % 256, n % 256, 0, 0, 1, 32, len(data), off)
        off += len(data)
    with open(path, 'wb') as f:
        f.write(out + b''.join(d for _, d in entries))


if __name__ == '__main__':
    app = base()
    write_ico(app, os.path.join(HERE, 'project-hub-cube.ico'))
    write_ico(with_plus(app), os.path.join(HERE, 'project-hub-cube-new-task.ico'))
    for n in (192, 512):
        app.resize((n, n), Image.LANCZOS).save(os.path.join(ROOT, f'icon-{n}.png'))
    with_plus(app).resize((192, 192), Image.LANCZOS).save(os.path.join(ROOT, 'icon-new-task-192.png'))
    ext = os.path.join(HERE, 'chrome-extension')
    for n in (16, 32, 48, 128):
        with_plus(app).resize((n, n), Image.LANCZOS).save(os.path.join(ext, f'icon-{n}.png'))
    cube(inset=0.2, bg=(255, 255, 255, 255)).resize((512, 512), Image.LANCZOS).save(os.path.join(ROOT, 'icon-512-maskable.png'))
    print('icons written')
