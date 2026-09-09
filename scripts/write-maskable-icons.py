#!/usr/bin/env python3
"""Paint maskable / home-screen icons with a safe zone so OS masks do not crop the mark."""
from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'public' / 'icon.png'
OUTPUT = ROOT / 'public' / 'icons'
INNER = 0.64
FILL = (8, 16, 27)

def read_png(path):
    data = path.read_bytes()
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError(f'{path} is not a PNG')
    pos = 8
    idat = b''
    while pos < len(data):
        length = int.from_bytes(data[pos:pos + 4], 'big')
        typ = data[pos + 4:pos + 8]
        chunk = data[pos + 8:pos + 8 + length]
        if typ == b'IHDR':
            width, height, bit, color, *_ = struct.unpack('>IIBBBBB', chunk)
        elif typ == b'IDAT':
            idat += chunk
        pos += 12 + length
        if typ == b'IEND':
            break
    if bit != 8 or color not in (2, 6):
        raise ValueError('expected 8-bit RGB or RGBA PNG')
    bpp = 3 if color == 2 else 4
    raw = zlib.decompress(idat)
    stride = width * bpp
    rows = []
    prev = bytes(stride)
    i = 0
    for _ in range(height):
        filt = raw[i]
        i += 1
        row = bytearray(raw[i:i + stride])
        i += stride
        if filt == 1:
            for x in range(stride):
                row[x] = (row[x] + (row[x - bpp] if x >= bpp else 0)) & 255
        elif filt == 2:
            for x in range(stride):
                row[x] = (row[x] + prev[x]) & 255
        elif filt == 3:
            for x in range(stride):
                a = row[x - bpp] if x >= bpp else 0
                row[x] = (row[x] + ((a + prev[x]) // 2)) & 255
        elif filt == 4:
            for x in range(stride):
                a = row[x - bpp] if x >= bpp else 0
                b = prev[x]
                c = prev[x - bpp] if x >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if pa <= pb and pa <= pc else b if pb <= pc else c
                row[x] = (row[x] + pr) & 255
        elif filt != 0:
            raise ValueError(f'unsupported PNG filter {filt}')
        rows.append(bytes(row))
        prev = row
    rgb = []
    for row in rows:
        if bpp == 3:
            rgb.append(row)
        else:
            rgb.append(bytes(ch for i in range(0, len(row), 4) for ch in row[i:i + 3]))
    return width, height, rgb

def sample(rows, width, height, x, y):
    x = min(max(x, 0), width - 1)
    y = min(max(y, 0), height - 1)
    x0, y0 = int(x), int(y)
    x1, y1 = min(x0 + 1, width - 1), min(y0 + 1, height - 1)
    fx, fy = x - x0, y - y0
    def pix(px, py):
        i = px * 3
        return rows[py][i:i + 3]
    c00, c10, c01, c11 = pix(x0, y0), pix(x1, y0), pix(x0, y1), pix(x1, y1)
    out = bytearray(3)
    for i in range(3):
        top = c00[i] + (c10[i] - c00[i]) * fx
        bot = c01[i] + (c11[i] - c01[i]) * fx
        out[i] = int(top + (bot - top) * fy + 0.5)
    return bytes(out)

def write_png(path, width, height, rows):
    def chunk(tag, payload):
        return struct.pack('>I', len(payload)) + tag + payload + struct.pack('>I', zlib.crc32(tag + payload) & 0xffffffff)
    raw = b''.join(b'\x00' + row for row in rows)
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

def render(size, src_w, src_h, src_rows):
    pad = (1 - INNER) / 2 * size
    inner = size * INNER
    fill = bytes(FILL)
    rows = []
    for y in range(size):
        row = bytearray(size * 3)
        sy = (y + 0.5 - pad) / inner * src_h - 0.5
        for x in range(size):
            sx = (x + 0.5 - pad) / inner * src_w - 0.5
            if x + 0.5 < pad or y + 0.5 < pad or x + 0.5 >= pad + inner or y + 0.5 >= pad + inner:
                row[x * 3:x * 3 + 3] = fill
            else:
                row[x * 3:x * 3 + 3] = sample(src_rows, src_w, src_h, sx, sy)
        rows.append(bytes(row))
    return rows

def main():
    width, height, rows = read_png(SOURCE)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    targets = {
        'icon-192-maskable.png': 192,
        'icon-512-maskable.png': 512,
        'apple-touch-icon.png': 180,
    }
    for name, size in targets.items():
        write_png(OUTPUT / name, size, size, render(size, width, height, rows))
    print(f'Wrote maskable icons at {int(INNER * 100)}% safe-zone from {SOURCE.name}.')

if __name__ == '__main__':
    main()
