#!/usr/bin/env python3
"""Builds 3 hook variants from one base clip: hook text for 0-4s, end card for the last 3s.
Usage: python3 make-variants.py base.mp4   (needs Pillow + ffmpeg; text is drawn as PNG overlays)"""
import subprocess, sys
from PIL import Image, ImageDraw, ImageFont
base = sys.argv[1] if len(sys.argv) > 1 else "base.mp4"
W, H = 720, 1280
FONT = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", base]))
VARIANTS = [
    ("corgi-pop-zoomies",    ["Your corgi called.", "It wants a Corgi Pop."],  "Fizz worth zooming for"),
    ("corgi-pop-beat-heat",  ["Too hot for walkies?", "Crack a cold one."],    "Ice cold. Corgi approved."),
    ("corgi-pop-taste-test", ["We asked a corgi", "to taste test soda."],      "Verdict: 10/10 boops"),
]
def centered(d, y, text, font, fill, stroke=0):
    w = d.textbbox((0, 0), text, font=font, stroke_width=stroke)[2]
    d.text(((W - w) / 2, y), text, font=font, fill=fill, stroke_width=stroke, stroke_fill=(0, 0, 0, 200))
for name, hook, end in VARIANTS:
    h = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(h)
    f1, f2 = ImageFont.truetype(FONT, 58), ImageFont.truetype(FONT, 46)
    centered(d, 120, hook[0], f1, "white", 5); centered(d, 195, hook[1], f2, "white", 5)
    h.save(f"/tmp/{name}-hook.png")
    e = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(e)
    d.rectangle([0, int(H * .76), W, int(H * .92)], fill=(0, 0, 0, 120))
    centered(d, int(H * .78), end, ImageFont.truetype(FONT, 50), "white")
    centered(d, int(H * .85), "CORGI POP", ImageFont.truetype(FONT, 46), (255, 179, 122))
    e.save(f"/tmp/{name}-end.png")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", base, "-i", f"/tmp/{name}-hook.png", "-i", f"/tmp/{name}-end.png",
        "-filter_complex", f"[0:v][1:v]overlay=enable='lt(t,4)'[a];[a][2:v]overlay=enable='gte(t,{dur-3:.2f})'",
        "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart", f"{name}.mp4"], check=True)
    print("built", f"{name}.mp4")
