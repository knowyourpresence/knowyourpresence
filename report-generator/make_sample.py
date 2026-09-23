"""
make_sample.py - Generates a REDACTED sample report for marketing use.

Why redacted: showing the full report free would remove the reason to buy.
Showing nothing leaves buyers guessing whether $19.99 gets them anything
substantial. This middle path proves the report is real and detailed -
14 pages, real charts, real structure - while blurring the specific
recommendations that are the actual product.

What stays visible: page count, layout, section headings, charts, the
score gauge, table structures. Buyers can see it's a serious document.

What gets redacted: the specific fix instructions, the written templates,
the exact action items - i.e. everything they'd otherwise just copy.

Usage:
    python3 make_sample.py <full-report.pdf> <redacted-sample.pdf>
"""

import sys
import io
from pdf2image import convert_from_path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

# Pages where the actionable content lives - these get blurred.
# Page numbers are 1-indexed to match what a reader sees.
# Only 2 pages stay fully readable - the cover (proves the scoring is real)
# and the score breakdown (proves the analysis has depth). Everything else is
# blurred, so the sample proves quality without being usable as a substitute
# for buying.
READABLE_PAGES = {1, 3}

# Every other page gets blurred with a label naming what's behind it.
REDACT_LABELS = {
    2: "Your executive summary & key findings",
    4: "Your AI search visibility analysis",
    5: "Your competitor benchmark",
    6: "Your detailed website & reputation findings",
    7: "Your full 90-day action plan",
    8: "Your personalized priority matrix",
    9: "Your ready-to-use message templates",
    10: "Your Google Business posts & hashtags",
    11: "Your review-generation sequence",
    12: "Your 4-week content calendar",
    13: "Your printable 7-day checklist",
    14: "Your complete toolkit summary",
}


def redact_page(img, label):
    """Blurs a page and overlays a lock message, so it reads as deliberately
    withheld rather than low quality."""
    blurred = img.filter(ImageFilter.GaussianBlur(radius=9))

    # Lighten it so the overlay text reads clearly
    white = Image.new("RGB", blurred.size, (255, 255, 255))
    blurred = Image.blend(blurred, white, 0.45)

    draw = ImageDraw.Draw(blurred)
    w, h = blurred.size

    # Centered banner
    band_h = int(h * 0.13)
    band_y = int(h * 0.42)
    draw.rectangle([0, band_y, w, band_y + band_h], fill=(10, 143, 82))

    try:
        font_big = ImageFont.truetype("/home/claude/kyp-scanner/report-generator/fonts/WorkSans-Bold.ttf", int(h * 0.024))
        font_small = ImageFont.truetype("/home/claude/kyp-scanner/report-generator/fonts/WorkSans-Regular.ttf", int(h * 0.016))
    except Exception:
        font_big = ImageFont.load_default()
        font_small = ImageFont.load_default()

    line1 = label
    line2 = "Included in your full report"

    bbox1 = draw.textbbox((0, 0), line1, font=font_big)
    bbox2 = draw.textbbox((0, 0), line2, font=font_small)
    draw.text(((w - (bbox1[2] - bbox1[0])) / 2, band_y + band_h * 0.22), line1, fill=(255, 255, 255), font=font_big)
    draw.text(((w - (bbox2[2] - bbox2[0])) / 2, band_y + band_h * 0.60), line2, fill=(230, 245, 236), font=font_small)

    return blurred


def main(src, dest):
    pages = convert_from_path(src, dpi=110)
    out = []

    for i, page in enumerate(pages, start=1):
        if i in READABLE_PAGES:
            out.append(page.convert("RGB"))
        else:
            label = REDACT_LABELS.get(i, "Included in your full report")
            out.append(redact_page(page.convert("RGB"), label))

    out[0].save(dest, "PDF", save_all=True, append_images=out[1:], resolution=110)
    print(f"Sample written to {dest}: {len(out)} pages, {len(READABLE_PAGES)} readable, {len(out) - len(READABLE_PAGES)} blurred")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
