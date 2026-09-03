"""Assert a crop rectangle sits on the mock window's own border.

Used by scripts/demo-video.mjs before every encode. This exists because the
DOM's idea of where the card is and the screencast's have disagreed — by ~10px
in one theme and not the other — and a crop that is off by even a few pixels
either clips the window's title bar or drags the landing page's step timeline
in underneath the card. Both shipped in videos before this check existed.

Detecting the card by colour does not work in both themes: the dark card is
brighter than the page behind it, but the light card is white on white and
differs only by its 1px border. So look for the BORDER — a local tonal step —
and require one within a couple of pixels of each crop edge.

    python3 check-crop-edges.py FRAME.png X Y W H
    -> "OK: ..."  or a description of which edge is wrong

Verified to reject the two real failure modes: a crop shifted 10px up, and one
20px too tall.
"""
import sys

from PIL import Image

path, x, y, w, h = sys.argv[1], *map(int, sys.argv[2:6])
im = Image.open(path).convert("RGB")
W, H = im.size
px = im.load()


def lum(p):
    return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]


def step_index(vals, min_step=6):
    """Index of the largest jump between consecutive samples, if any."""
    steps = [abs(vals[i + 1] - vals[i]) for i in range(len(vals) - 1)]
    if not steps or max(steps) < min_step:
        return None
    return steps.index(max(steps))


mx, my = x + w // 2, y + h // 2
problems = []


def check(band, expect, label):
    i = step_index(band)
    if i is None or abs(i - expect) > 2:
        problems.append(f"no card border at the {label} edge")


check([lum(px[mx, yy]) for yy in range(max(0, y - 5), min(H, y + 6))], 4, "TOP")
check([lum(px[mx, yy]) for yy in range(max(0, y + h - 6), min(H, y + h + 5))], 5, "BOTTOM")
check([lum(px[xx, my]) for xx in range(max(0, x - 5), min(W, x + 6))], 4, "LEFT")
check([lum(px[xx, my]) for xx in range(max(0, x + w - 6), min(W, x + w + 5))], 5, "RIGHT")

print("OK: crop sits on the card border" if not problems else "; ".join(problems))
