from pathlib import Path

from PIL import Image, ImageFilter

assets = Path(r"C:\Users\iaaoa\.cursor\projects\c-Users-iaaoa-OneDrive-FOAM\assets")
public = Path(r"C:\Users\iaaoa\OneDrive\שולחן העבודה\FOAM\public")


def to_9_10(im: Image.Image, top_bias: float = 0.0) -> Image.Image:
    """Crop/pad to exact 9:10 (width:height). top_bias 0=center, >0 keeps more top."""
    im = im.convert("RGB")
    w, h = im.size
    target_h = int(round(w * 10 / 9))
    if h == target_h:
        return im
    if h > target_h:
        # crop vertically — prefer keeping a bit more top for header clearance
        extra = h - target_h
        top = int(round(extra * (0.35 - top_bias)))  # slightly favor top
        top = max(0, min(extra, top))
        return im.crop((0, top, w, top + target_h))
    # pad vertically with sky sampled from top
    samples = [im.getpixel((x, y)) for y in range(0, min(6, h)) for x in range(w // 5, 4 * w // 5, 10)]
    sky = tuple(sum(c[i] for c in samples) // len(samples) for i in range(3))
    pad = target_h - h
    # put most padding on top so text sits lower under header
    top_pad = int(round(pad * 0.7))
    bottom_pad = pad - top_pad
    out = Image.new("RGB", (w, target_h), sky)
    out.paste(im, (0, top_pad))
    if bottom_pad > 0:
        # already sky-filled
        pass
    return out


def upscale(im: Image.Image, target_w: int) -> Image.Image:
    im = im.convert("RGB")
    w, h = im.size
    if w == target_w:
        return im
    target_h = int(round(h * (target_w / w)))
    out = im.resize((target_w, target_h), Image.Resampling.LANCZOS)
    return out.filter(ImageFilter.UnsharpMask(radius=1.2, percent=120, threshold=2))


living = to_9_10(Image.open(assets / "day-mobile-03-living-910.png"), top_bias=0.1)
# extra header clearance on living text
lw, lh = living.size
pad = max(48, int(round(lh * 0.06)))
samples = [living.getpixel((x, y)) for y in range(0, 6) for x in range(lw // 4, 3 * lw // 4, 8)]
sky = tuple(sum(c[i] for c in samples) // len(samples) for i in range(3))
living_padded = Image.new("RGB", (lw, lh + pad), sky)
living_padded.paste(living, (0, pad))
# re-crop to 9:10 after pad (trim bottom)
target_h = int(round(lw * 10 / 9))
if living_padded.height > target_h:
    living = living_padded.crop((0, 0, lw, target_h))
else:
    living = living_padded

cta = to_9_10(Image.open(assets / "day-mobile-06-cta-different-910.png"), top_bias=0.05)

living.save(assets / "day-mobile-03-living-910-final.png", "PNG", optimize=True)
cta.save(assets / "day-mobile-06-cta-910-final.png", "PNG", optimize=True)
print("living", living.size, "ratio", living.width / living.height)
print("cta", cta.size, "ratio", cta.width / cta.height)

mobile_files = [
    assets / "day-mobile-01-hero-lower-text.png",
    assets / "day-mobile-02-how-nopillars.png",
    assets / "day-mobile-03-living-910-final.png",
    assets / "day-mobile-04-services.png",
    assets / "day-mobile-05-pricing.png",
    assets / "day-mobile-06-cta-910-final.png",
]

scaled = [upscale(Image.open(p), 1440) for p in mobile_files]
# force living + cta sections to exact 9:10 at 1440
for i in (2, 5):
    im = scaled[i]
    th = int(round(1440 * 10 / 9))
    if im.height != th:
        scaled[i] = upscale(to_9_10(im), 1440)
        # ensure exact
        if scaled[i].height != th:
            scaled[i] = scaled[i].resize((1440, th), Image.Resampling.LANCZOS)

total_h = sum(im.height for im in scaled)
canvas = Image.new("RGB", (1440, total_h), (255, 255, 255))
y = 0
for im in scaled:
    canvas.paste(im, (0, y))
    y += im.height

out = public / "home-mockup-mobile-v16.png"
canvas.save(out, "PNG", optimize=True)
print("mobile", canvas.size, out)
for i, im in enumerate(scaled):
    print(i, im.size, round(im.width / im.height, 3))
