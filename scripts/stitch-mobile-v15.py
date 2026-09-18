from pathlib import Path

from PIL import Image, ImageFilter

assets = Path(r"C:\Users\iaaoa\.cursor\projects\c-Users-iaaoa-OneDrive-FOAM\assets")
public = Path(r"C:\Users\iaaoa\OneDrive\שולחן העבודה\FOAM\public")

# Desktop unchanged (v20 already good) — only rebuild mobile
mobile_files = [
    assets / "day-mobile-01-hero-lower-text.png",
    assets / "day-mobile-02-how-nopillars.png",
    assets / "day-mobile-03-living.png",
    assets / "day-mobile-04-services.png",
    assets / "day-mobile-05-pricing.png",
    assets / "day-mobile-06-cta-v2.png",
]


def upscale(im: Image.Image, target_w: int) -> Image.Image:
    im = im.convert("RGB")
    w, h = im.size
    if w == target_w:
        return im
    target_h = int(round(h * (target_w / w)))
    out = im.resize((target_w, target_h), Image.Resampling.LANCZOS)
    out = out.filter(ImageFilter.UnsharpMask(radius=1.2, percent=120, threshold=2))
    return out


scaled = [upscale(Image.open(p), 1440) for p in mobile_files]
total_h = sum(im.height for im in scaled)
canvas = Image.new("RGB", (1440, total_h), (255, 255, 255))
y = 0
for im in scaled:
    canvas.paste(im, (0, y))
    y += im.height

out = public / "home-mockup-mobile-v15.png"
canvas.save(out, "PNG", optimize=True)
print("mobile", canvas.size, out)
