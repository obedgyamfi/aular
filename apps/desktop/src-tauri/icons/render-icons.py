"""Renders the AULAR mark to the PNG sizes the bundlers need.

The mark is defined once, in src/components/logo.tsx. This script mirrors that
path so the app icon and the in-app logo can never drift apart. Re-run it if
the mark changes.
"""
import struct, zlib, os

W, H = 16, 20                       # the mark's grid
BG = (232, 163, 77)                 # accent tile
FG = (32, 29, 29)                   # the glyph, on the tile
SHADOW = (32, 29, 29, 0x38)

def inside_a(x, y):
    """The mark's path, evaluated on the grid — mirrors the SVG in logo.tsx:

      outer   M5 0 H11 L16 5 V20 H12 V16 H4 V20 H0 V5 L5 0
      counter M4 6 V12 H12 V6 L10 4 H6 L4 6      (chamfered top, like the outer)
    """
    # Outer shoulders: the silhouette bevels out from x5..11 at the apex to the
    # full width by y=5.
    if y < 5 and (x < 5 - y or x >= 11 + y):
        return False
    # The open bottom between the two legs.
    if y >= 16 and 4 <= x < 12:
        return False
    # The counter, chamfered the same way the shoulders are.
    if 4 <= y < 6 and (6 - (y - 4)) <= x < (10 + (y - 4)):
        return False
    if 6 <= y < 12 and 4 <= x < 12:
        return False
    return True


def png(path, size):
    scale = size / max(W, H)
    pad = size * 0.16
    inner = size - 2 * pad
    gw = inner * (W / H)
    ox = (size - gw) / 2
    r = size * 0.22                 # tile corner radius

    px = [[(0, 0, 0, 0)] * size for _ in range(size)]
    for y in range(size):
        row = px[y]
        for x in range(size):
            cx, cy = min(x, size - 1 - x), min(y, size - 1 - y)
            if cx < r and cy < r and (r - cx) ** 2 + (r - cy) ** 2 > r * r:
                continue
            row[x] = (*BG, 255)
            gx = (x - ox) / gw * W
            gy = (y - pad) / inner * H
            if 0 <= gx < W and 0 <= gy < H and inside_a(gx, gy):
                row[x] = (*FG, 255)
        px[y] = row

    raw = b"".join(b"\x00" + b"".join(bytes(p) for p in row) for row in px)
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    open(path, "wb").write(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b""))

def png_bytes(size):
    """The same render, returned instead of written (for the containers)."""
    import io, tempfile
    tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    tmp.close()
    png(tmp.name, size)
    data = open(tmp.name, "rb").read()
    os.unlink(tmp.name)
    return data


def ico(path, sizes):
    """icon.ico — the Windows resource icon. ICO entries may be whole PNGs
    (Vista+), so this is just a directory over the renders."""
    images = [(s, png_bytes(s)) for s in sizes]
    out = struct.pack("<HHH", 0, 1, len(images))
    offset = 6 + 16 * len(images)
    dirs, blobs = b"", b""
    for s, data in images:
        dirs += struct.pack(
            "<BBBBHHII", s % 256, s % 256, 0, 0, 1, 32, len(data), offset)
        blobs += data
        offset += len(data)
    open(path, "wb").write(out + dirs + blobs)


def icns(path):
    """icon.icns — the mac icon. ICNS chunks are typed PNGs."""
    types = [(b"ic11", 32), (b"ic07", 128), (b"ic13", 256),
             (b"ic08", 256), (b"ic09", 512)]
    body = b""
    for t, s in types:
        data = png_bytes(s)
        body += t + struct.pack(">I", 8 + len(data)) + data
    open(path, "wb").write(b"icns" + struct.pack(">I", 8 + len(body)) + body)


here = os.path.dirname(os.path.abspath(__file__))
for s in (32, 128, 256, 512):
    png(os.path.join(here, f"{s}x{s}.png"), s)
png(os.path.join(here, "128x128@2x.png"), 256)
png(os.path.join(here, "icon.png"), 512)
ico(os.path.join(here, "icon.ico"), (16, 24, 32, 48, 64, 128, 256))
icns(os.path.join(here, "icon.icns"))
print("icons rendered from the mark")
