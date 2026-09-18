from pathlib import Path

from PIL import Image, ImageFilter

assets = Path(r"C:\Users\iaaoa\.cursor\projects\c-Users-iaaoa-OneDrive-FOAM\assets")
public = Path(r"C:\Users\iaaoa\OneDrive\שולחן העבודה\FOAM\public")


def first_text_row(im: Image.Image, min_count: int = 6) -> int:
    w = im.width
    max_scan = min(im.height // 2, 500)
    for y in range(max_scan):
        row = [im.getpixel((x, y))[:3] for x in range(0, w, 2)]
        textish = sum(
            1
            for c in row
            if c[0] < 90 and c[1] < 110 and c[2] < 160 and (c[0] + c[1] + c[2]) / 3 < 110
        )
        if textish >= min_count:
            return y
    return 0


def trim_above_text(im: Image.Image, pad: int = 18) -> Image.Image:
    im = im.convert("RGB")
    y = first_text_row(im)
    if y <= pad + 4:
        return im
    cut = y - pad
    print(f"  text@{y} cut {cut}px keep {pad}px sky")
    return im.crop((0, cut, im.width, im.height))


def to_9_10_keep_top(im: Image.Image) -> Image.Image:
    im = im.convert("RGB")
    w, h = im.size
    target_h = int(round(w * 10 / 9))
    if h == target_h:
        return im
    if h > target_h:
        return im.crop((0, 0, w, target_h))
    sky = im.getpixel((w // 2, min(8, h - 1)))
    out = Image.new("RGB", (w, target_h), sky)
    out.paste(im, (0, 0))
    return out


def upscale(im: Image.Image, target_w: int) -> Image.Image:
    im = im.convert("RGB")
    w, h = im.size
    if w == target_w:
        return im
    target_h = int(round(h * (target_w / w)))
    out = im.resize((target_w, target_h), Image.Resampling.LANCZOS)
    return out.filter(ImageFilter.UnsharpMask(radius=1.2, percent=120, threshold=2))


paths = [
    ("hero", assets / "day-mobile-01-hero-lower-text.png", False, False),
    ("how", assets / "day-mobile-02-how-nopillars.png", True, False),
    ("living", assets / "day-mobile-03-living-910.png", True, True),
    ("services", assets / "day-mobile-04-services.png", True, False),
    ("pricing", assets / "day-mobile-05-pricing.png", False, False),
    ("cta", assets / "day-mobile-06-cta-910-final.png", False, True),
]

scaled = []
for name, path, do_trim, force_910 in paths:
    print(name)
    im = Image.open(path).convert("RGB")
    if do_trim:
        im = trim_above_text(im, pad=16)
    if force_910:
        im = to_9_10_keep_top(im)
    im = upscale(im, 1440)
    if do_trim:
        im = trim_above_text(im, pad=22)
    if force_910:
        th = int(round(1440 * 10 / 9))
        if im.height > th:
            im = im.crop((0, 0, 1440, th))
        elif im.height < th:
            sky = im.getpixel((720, 0))
            out = Image.new("RGB", (1440, th), sky)
            out.paste(im, (0, 0))
            im = out
    scaled.append(im)
    print(f"  final {im.size}")

total_h = sum(s.height for s in scaled)
canvas = Image.new("RGB", (1440, total_h), (255, 255, 255))
y = 0
for im in scaled:
    canvas.paste(im, (0, y))
    y += im.height

out = public / "home-mockup-mobile-v17.png"
canvas.save(out, "PNG", optimize=True)
print("mobile", canvas.size, out)

bounds = [0]
for s in scaled:
    bounds.append(bounds[-1] + s.height)
for i, b in enumerate(bounds[1:-1], 1):
    print(f"seam {i} @{b}")
    for y in (b - 1, b, b + 10, b + 25):
        row = [canvas.getpixel((x, y))[:3] for x in range(0, 1440, 24)]
        avg = tuple(int(sum(c[j] for c in row) / len(row)) for j in range(3))
        print(" ", y, avg)
