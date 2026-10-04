"""Builds the Windows icons for the quick-access shortcuts from the app's icon-512.png:
  project-hub.ico           the app icon (the whole app)
  project-hub-new-task.ico  the app icon with a green "+" (new task / the quick window)
Sizes up to 128 are stored as classic 32-bit bitmaps and only 256 as PNG: Explorer and the taskbar
draw a blank page for small PNG-only entries.  Run: python tools/quick-access/make-icons.py
"""
import io
import os
import struct

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
S = 1024


def base():
    src = Image.open(os.path.join(ROOT, 'icon-512.png')).convert('RGBA').resize((S, S), Image.LANCZOS)
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * .22), fill=255)
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    im.paste(src, (0, 0), mask)
    return im


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
    write_ico(app, os.path.join(HERE, 'project-hub.ico'))
    write_ico(with_plus(app), os.path.join(HERE, 'project-hub-new-task.ico'))
    print('icons written')
