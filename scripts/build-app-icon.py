# /// script
# requires-python = ">=3.11"
# dependencies = ["Pillow>=10.0"]
# ///
"""
Build the macOS app icon (.icns) for PReviewer — a dark editor-surface
squircle with stacked "code line" bars, one added (green) and one removed
(rose), reading as a diff even at small sizes. Colors echo the in-app
Monokai accents.

Produces:
  assets/icon.png        — 1024x1024 master
  assets/icon.iconset/   — per-size PNGs for `iconutil`
  assets/icon.icns       — via `iconutil` (run automatically at the end)

Run with uv:  uv run scripts/build-app-icon.py
"""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
ICONSET = ASSETS / "icon.iconset"

SIZE = 1024
SS = 4  # supersample factor for crisper edges
CORNER_RADIUS_RATIO = 0.225  # macOS Big Sur+ squircle approximation

# Editor-surface gradient (top → bottom), echoing the dark canvas.
BG_TOP = (44, 42, 46)     # #2C2A2E
BG_BOTTOM = (22, 22, 22)  # #161616

# Bar palette: muted neutrals for context, Monokai green/rose for the
# added/removed lines.
NEUTRAL = (91, 89, 92)    # #5B595C
GREEN = (169, 220, 118)   # #A9DC76 (added)
ROSE = (255, 97, 136)     # #FF6188 (removed)


def vertical_gradient(size: int, top, bottom) -> Image.Image:
    strip = Image.new("RGB", (1, size))
    for y in range(size):
        t = y / (size - 1)
        strip.putpixel(
            (0, y),
            (
                round(top[0] + (bottom[0] - top[0]) * t),
                round(top[1] + (bottom[1] - top[1]) * t),
                round(top[2] + (bottom[2] - top[2]) * t),
            ),
        )
    return strip.resize((size, size))


def rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def draw_bars(canvas: Image.Image) -> None:
    """Four stacked pill bars (lines of code); the 2nd is added-green and
    the 3rd is removed-rose. Composed at supersample resolution."""
    w = canvas.size[0]
    layer = Image.new("RGBA", (w * SS, w * SS), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)

    # Geometry in master (1024) coords, scaled by SS.
    bar_h = 96
    gap = 68
    left = 268
    radius = bar_h // 2
    # (width, color) per line — varied widths read as real code.
    bars = [
        (488, NEUTRAL),
        (372, GREEN),
        (436, ROSE),
        (300, NEUTRAL),
    ]
    total_h = len(bars) * bar_h + (len(bars) - 1) * gap
    y = (SIZE - total_h) // 2

    for width, color in bars:
        x0 = left * SS
        y0 = y * SS
        x1 = (left + width) * SS
        y1 = (y + bar_h) * SS
        draw.rounded_rectangle((x0, y0, x1, y1), radius=radius * SS, fill=(*color, 255))
        y += bar_h + gap

    layer = layer.resize((w, w), Image.LANCZOS)
    canvas.alpha_composite(layer)


def build_master() -> Image.Image:
    bg = vertical_gradient(SIZE, BG_TOP, BG_BOTTOM).convert("RGBA")
    radius = round(SIZE * CORNER_RADIUS_RATIO)
    mask = rounded_mask(SIZE, radius)
    squircle = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    squircle.paste(bg, (0, 0), mask)
    draw_bars(squircle)
    return squircle


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    master = build_master()
    master.save(ASSETS / "icon.png")

    if ICONSET.exists():
        shutil.rmtree(ICONSET)
    ICONSET.mkdir()
    # macOS iconset sizes (1x + 2x).
    for base in (16, 32, 128, 256, 512):
        for scale in (1, 2):
            px = base * scale
            name = f"icon_{base}x{base}{'@2x' if scale == 2 else ''}.png"
            master.resize((px, px), Image.LANCZOS).save(ICONSET / name)

    icns = ASSETS / "icon.icns"
    subprocess.run(["iconutil", "-c", "icns", str(ICONSET), "-o", str(icns)], check=True)
    shutil.rmtree(ICONSET)
    print(f"wrote {ASSETS / 'icon.png'} and {icns}")


if __name__ == "__main__":
    main()
