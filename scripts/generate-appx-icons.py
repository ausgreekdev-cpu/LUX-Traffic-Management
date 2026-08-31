#!/usr/bin/env python3
"""
Generate Microsoft Store appx icon scales (100/125/150/200/400) from source.

Sources: assets/icon.png (256) or frontend/public/pwa-512x512.png (512) — picks largest available.
Outputs: build/appx/*.png + *.scale-*.png variants for each logical asset.
- StoreLogo 50x50
- Square44x44Logo 44x44
- Square150x150Logo 150x150
- Wide310x150Logo 310x150
- LargeTile 310x310
- SmallTile 71x71
- SplashScreen 620x300

Each variant: e.g. StoreLogo.png (50) + StoreLogo.scale-100.png (50), .scale-125 (63), .scale-150 (75), .scale-200 (100), .scale-400 (200)
Uses PIL LANCZOS for crisp downscale. Run: python3 scripts/generate-appx-icons.py
Also via npm: npm run build:appx-icons
"""
import os
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Pillow not installed: python3 -m pip install Pillow", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
ASSETS = [
    ROOT / "frontend/public/pwa-512x512.png",
    ROOT / "assets/icon.png",
]
OUT_DIR = ROOT / "build/appx"

# logical assets: filename base : (w,h)
ASSETS_DEFS = {
    "StoreLogo": (50, 50),
    "Square44x44Logo": (44, 44),
    "Square150x150Logo": (150, 150),
    "Wide310x150Logo": (310, 150),
    "LargeTile": (310, 310),
    "SmallTile": (71, 71),
    "SplashScreen": (620, 300),
}
SCALES = [100, 125, 150, 200, 400]

def pick_source():
    for p in ASSETS:
        if p.exists():
            return p
    raise FileNotFoundError(f"No source icon found, checked {ASSETS}")

def main():
    src_path = pick_source()
    # Prefer largest; pwa-512 is first and largest. If we have both, still pick 512.
    print(f"Source: {src_path} ({src_path.stat().st_size} bytes)")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    img = Image.open(src_path).convert("RGBA")
    # Ensure square source for square targets gets centered; PIL will stretch non-square to exact target which is OK for icons
    for name, (base_w, base_h) in ASSETS_DEFS.items():
        for scale in SCALES:
            w = round(base_w * scale / 100)
            h = round(base_h * scale / 100)
            resized = img.resize((w, h), Image.LANCZOS)
            # scale suffix naming per MSIX: Asset.scale-100.png etc.
            scale_name = f"{name}.scale-{scale}.png"
            base_name = f"{name}.png" if scale == 100 else None
            out_scale = OUT_DIR / scale_name
            resized.save(out_scale, "PNG", optimize=True)
            print(f"Wrote {out_scale} {w}x{h}")
            if base_name:
                out_base = OUT_DIR / base_name
                # Overwrite base with scale-100 (identical)
                resized.save(out_base, "PNG", optimize=True)
                print(f"Wrote {out_base} {w}x{h} (base)")

if __name__ == "__main__":
    main()
