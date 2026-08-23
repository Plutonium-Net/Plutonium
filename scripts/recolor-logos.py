#!/usr/bin/env python3
"""Recolor the Plutonium brand logos into the 8 accent-color variants.

The source images (img/brand-logo.png, img/logo.png, img/brand/icon.png) are
the pink Plutonium script logo. This shifts the pink hue to each accent color,
preserving the black/transparent parts and keeping the neon feel.
"""

from pathlib import Path
from PIL import Image, ImageFilter
import colorsys

# ── Accent colours (hue targets) ────────────────────────────────────────────
ACCENTS = {
    "plutonium-pink": "#e8175d",
    "violet":         "#7c3aed",
    "blue":           "#2563eb",
    "emerald":        "#059669",
    "amber":          "#d97706",
    "red":            "#dc2626",
    "cyan":           "#0891b2",
    "fuchsia":        "#c026d3",
}

SRC = {
    "brand-logo": "img/brand-logo.png",
    "logo":       "img/logo.png",
    "icon":       "img/brand/icon.png",
}

OUT_DIR = Path(__file__).resolve().parent.parent / "img" / "logos"

# The source pink ≈ hue 345° (0-360). Anything reddish/pink gets remapped to
# the target accent hue; grey/black/white pixels keep their colour.
SRC_HUE = 345.0
HUE_TOLERANCE = 40.0  # degrees either side of SRC_HUE
SAT_MIN = 0.15        # ignore near-grey pixels
LIGHT_MIN = 0.08
LIGHT_MAX = 0.95


def hex_to_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def recolor(img: Image.Image, accent_hex: str) -> Image.Image:
    """Shift pink-ish pixels toward the target accent hue."""
    target_hue = colorsys.rgb_to_hls(*[c / 255.0 for c in hex_to_rgb(accent_hex)])[0] * 360.0
    img = img.convert("RGBA")
    rgba = img.load()
    w, h = img.size

    # Rotate the source hue so the logo's pink becomes the accent colour
    hue_shift = (target_hue - SRC_HUE) % 360.0
    if hue_shift > 180:
        hue_shift -= 360.0

    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    opx = out.load()

    for y in range(h):
        for x in range(w):
            r, g, b, a = rgba[x, y]
            if a == 0:
                opx[x, y] = (0, 0, 0, 0)
                continue
            hh, ll, ss = colorsys.rgb_to_hls(r / 255.0, g / 255.0, b / 255.0)
            hue_deg = hh * 360.0
            # Rotate hue only for pink-ish, saturated, mid-lightness pixels
            if ss >= SAT_MIN and LIGHT_MIN <= ll <= LIGHT_MAX:
                delta = min(abs(hue_deg - SRC_HUE), 360 - abs(hue_deg - SRC_HUE))
                if delta <= HUE_TOLERANCE:
                    hue_deg = (hue_deg + hue_shift) % 360.0
            nr, ng, nb = colorsys.hls_to_rgb(hue_deg / 360.0, ll, ss)
            opx[x, y] = (int(nr * 255), int(ng * 255), int(nb * 255), a)
    return out


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, src in SRC.items():
        img = Image.open(src)
        for color, hex_color in ACCENTS.items():
            out = recolor(img, hex_color)
            out_path = OUT_DIR / f"{name}-{color}.png"
            out.save(out_path, "PNG")
        print(f"  + {name}: 8 variants")

    print(f"\nGenerated {len(SRC) * len(ACCENTS)} recolored logos -> {OUT_DIR}")


if __name__ == "__main__":
    main()
