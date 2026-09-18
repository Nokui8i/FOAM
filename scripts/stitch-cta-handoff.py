from pathlib import Path

from PIL import Image, ImageFilter

assets = Path(r"C:\Users\iaaoa\.cursor\projects\c-Users-iaaoa-OneDrive-FOAM\assets")
public = Path(r"C:\Users\iaaoa\OneDrive\שולחן העבודה\FOAM\public")


def upscale(im: Image.Image, target_w: int) -> Image.Image:
    im = im.convert("RGB")
    w, h = im.size
    if w == target_w:
        return im
    target_h = int(round(h * (target_w / w)))
    out = im.resize((target_w, target_h), Image.Resampling.LANCZOS)
    return out.filter(ImageFilter.UnsharpMask(radius=1.2, percent=120, threshold=2))


def to_9_10(im: Image.Image) -> Image.Image:
    im = im.convert("RGB")
    w, h = im.size
    target_h = int(round(w * 10 / 9))
    if h == target_h:
        return im
    if h > target_h:
        # keep top text — crop bottom slightly if needed
        return im.crop((0, 0, w, target_h))
    sky = im.getpixel((w // 2, 8))
    out = Image.new("RGB", (w, target_h), sky)
    out.paste(im, (0, 0))
    return out


# --- Desktop: rebuild with new CTA ---
desktop_files = [
    assets / "day-desktop-01-hero-yellow.png",
    assets / "day-desktop-02-how.png",
    assets / "day-desktop-03-living.png",
    assets / "day-desktop-04-services.png",
    assets / "day-desktop-05-pricing.png",
    assets / "day-desktop-06-cta-koala-handoff.png",
]
desk_scaled = [upscale(Image.open(p), 3840) for p in desktop_files]
desk_h = sum(im.height for im in desk_scaled)
desk = Image.new("RGB", (3840, desk_h), (255, 255, 255))
y = 0
for im in desk_scaled:
    desk.paste(im, (0, y))
    y += im.height
desk_out = public / "home-mockup-desktop-v21.png"
desk.save(desk_out, "PNG", optimize=True)
print("desktop", desk.size, desk_out)

# --- Mobile: keep v17 body, replace CTA ---
# Rebuild from known good sources used in v17 trim script
from importlib.machinery import SourceFileLoader

# Inline mobile rebuild with new CTA
mobile_parts = []

def first_text_row(im, min_count=6):
    w = im.width
    for y in range(min(im.height // 2, 500)):
        row = [im.getpixel((x, y))[:3] for x in range(0, w, 2)]
        textish = sum(
            1
            for c in row
            if c[0] < 90 and c[1] < 110 and c[2] < 160 and (c[0] + c[1] + c[2]) / 3 < 110
        )
        if textish >= min_count:
            return y
    return 0


def trim_above_text(im, pad=16):
    im = im.convert("RGB")
    y = first_text_row(im)
    if y <= pad + 4:
        return im
    return im.crop((0, y - pad, im.width, im.height))


# hero - keep lower text pad version
mobile_parts.append(upscale(Image.open(assets / "day-mobile-01-hero-lower-text.png"), 1440))

# how
how = trim_above_text(Image.open(assets / "day-mobile-02-how-nopillars.png"), 16)
how = upscale(how, 1440)
how = trim_above_text(how, 22)
mobile_parts.append(how)

# living 9:10
living = trim_above_text(Image.open(assets / "day-mobile-03-living-910.png"), 16)
living = to_9_10(living)
living = upscale(living, 1440)
th = int(round(1440 * 10 / 9))
if living.height != th:
    living = living.resize((1440, th), Image.Resampling.LANCZOS)
mobile_parts.append(living)

# services
services = trim_above_text(Image.open(assets / "day-mobile-04-services.png"), 16)
services = upscale(services, 1440)
services = trim_above_text(services, 22)
mobile_parts.append(services)

# pricing
mobile_parts.append(upscale(Image.open(assets / "day-mobile-05-pricing.png"), 1440))

# NEW CTA 9:10
cta = to_9_10(Image.open(assets / "day-mobile-06-cta-koala-handoff-910.png"))
cta = upscale(cta, 1440)
if cta.height != th:
    cta = cta.resize((1440, th), Image.Resampling.LANCZOS)
mobile_parts.append(cta)

mob_h = sum(im.height for im in mobile_parts)
mob = Image.new("RGB", (1440, mob_h), (255, 255, 255))
y = 0
for im in mobile_parts:
    mob.paste(im, (0, y))
    y += im.height
mob_out = public / "home-mockup-mobile-v18.png"
mob.save(mob_out, "PNG", optimize=True)
print("mobile", mob.size, mob_out)
for i, im in enumerate(mobile_parts):
    print(i, im.size)
