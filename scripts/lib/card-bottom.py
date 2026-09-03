"""Report the last row of the mock window in a captured frame.

scripts/demo-video.mjs uses this to drop the trailing frames of a capture: the
loop's restart flips the timeline a beat AFTER the window has begun collapsing,
and on mobile the card loses ~28px, so a fixed crop starts exposing the page
underneath it. Comparing each trailing frame's card bottom against the steady
state finds where the reset begins.

Compares against the page background sampled at the frame's corner rather than
using absolute brightness, so it works on the light theme's white-on-white card
as well as the dark one.

    python3 card-bottom.py FRAME.png X Y W H   ->   last row (int)
"""
import sys

from PIL import Image

path, x, y, w, h = sys.argv[1], *map(int, sys.argv[2:6])
im = Image.open(path).convert("RGB")
W, H = im.size
px = im.load()
bg = px[2, 2]


def differs(p, tol=3):
    return (abs(p[0] - bg[0]) > tol or abs(p[1] - bg[1]) > tol
            or abs(p[2] - bg[2]) > tol)


# A column through the card's middle; scan the crop plus a little slack.
col = x + w // 2
last = y
for row in range(y, min(y + h + 30, H)):
    if differs(px[col, row]):
        last = row

print(last)
