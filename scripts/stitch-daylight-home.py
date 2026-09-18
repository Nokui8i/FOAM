from pathlib import Path

from PIL import Image, ImageFilter

assets = Path(r"C:\Users\iaaoa\.cursor\projects\c-Users-iaaoa-OneDrive-FOAM\assets")
preview = Path(r"C:\Users\iaaoa\OneDrive\שולחן העבודה\FOAM\preview-sections")
public = Path(r"C:\Users\iaaoa\OneDrive\שולחן העבודה\FOAM\public")
preview.mkdir(exist_ok=True)

desktop_files = [
    assets / "day-desktop-01-hero-v2.png",
    assets / "day-desktop-02-how.png",
    assets / "day-desktop-03-living.png",
    assets / "day-desktop-04-services.png",
    assets / "day-desktop-05-pricing.png",
    assets / "day-desktop-06-cta.png",
]
mobile_files = [
    assets / "day-mobile-01-hero.png",
    assets / "day-mobile-02-how.png",
    assets / "day-mobile-03-living.png",
    assets / "day-mobile-04-services.png",
    assets / "day-mobile-05-pricing.png",
    assets / "day-mobile-06-cta-v2.png",
]

names = ["01-hero", "02-how", "03-living", "04-services", "05-pricing", "06-cta"]


def upscale(im: Image.Image, target_w: int) -> Image.Image:
    im = im.convert("RGB")
    w, h = im.size
    if w == target_w:
        return im
    target_h = int(round(h * (target_w / w)))
    out = im.resize((target_w, target_h), Image.Resampling.LANCZOS)
    out = out.filter(ImageFilter.UnsharpMask(radius=1.2, percent=120, threshold=2))
    return out


def hard_abut(paths, target_w: int) -> Image.Image:
    scaled = [upscale(Image.open(p), target_w) for p in paths]
    total_h = sum(im.height for im in scaled)
    canvas = Image.new("RGB", (target_w, total_h), (255, 255, 255))
    y = 0
    for im in scaled:
        canvas.paste(im, (0, y))
        y += im.height
    return canvas


for i, p in enumerate(desktop_files):
    Image.open(p).convert("RGB").save(preview / f"day-desktop-{names[i]}.png", optimize=True)
for i, p in enumerate(mobile_files):
    Image.open(p).convert("RGB").save(preview / f"day-mobile-{names[i]}.png", optimize=True)

desk = hard_abut(desktop_files, 3840)
mob = hard_abut(mobile_files, 1440)

desk_out = public / "home-mockup-desktop-v19.png"
mob_out = public / "home-mockup-mobile-v13.png"
desk.save(desk_out, "PNG", optimize=True)
mob.save(mob_out, "PNG", optimize=True)
print("desktop", desk.size, desk_out)
print("mobile", mob.size, mob_out)
