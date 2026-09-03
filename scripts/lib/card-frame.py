"""Build the two alpha assets that frame the recorded card.

    python3 card-frame.py W H RADIUS PAD BLUR "R,G,B" ALPHA MASK_OUT SHADOW_OUT

  MASK_OUT    rounded-rect alpha, card-sized — rounds the video's corners
  SHADOW_OUT  RGBA drop shadow on a transparent canvas, card + 2*PAD

Composited by scripts/demo-video.mjs as: transparent canvas, then the shadow,
then the masked card on top.

The shadow is a SYMMETRIC halo, deliberately not the site's own downward-cast
--window-shadow: these clips sit on someone else's background, where an offset
shadow reads as the card being off-centre inside its own frame. With no offset
the four margins are equal by construction.

The card's own footprint is punched out of the shadow: the card is opaque and
sits on top, so shadow alpha underneath it would only darken the seam where the
two anti-aliased rounded edges overlap.
"""
import sys

from PIL import Image, ImageDraw, ImageFilter

w, h, radius, pad, blur = map(int, sys.argv[1:6])
shadow_rgb = tuple(int(v) for v in sys.argv[6].split(","))
shadow_alpha = int(sys.argv[7])
mask_out, shadow_out = sys.argv[8], sys.argv[9]

cw = (w + pad * 2 + 1) & ~1
ch = (h + pad * 2 + 1) & ~1

# 1) Card mask, supersampled so the rounded corners are smooth.
SS = 4
mask = Image.new("L", (w * SS, h * SS), 0)
ImageDraw.Draw(mask).rounded_rectangle(
    [0, 0, w * SS - 1, h * SS - 1], radius=radius * SS, fill=255
)
mask.resize((w, h), Image.LANCZOS).save(mask_out)

# 2) Shadow on a transparent canvas.
shadow = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
ImageDraw.Draw(shadow).rounded_rectangle(
    [pad, pad, pad + w, pad + h], radius=radius, fill=shadow_rgb + (shadow_alpha,)
)
shadow = shadow.filter(ImageFilter.GaussianBlur(blur))

hole = Image.new("L", (cw, ch), 0)
ImageDraw.Draw(hole).rounded_rectangle(
    [pad, pad, pad + w - 1, pad + h - 1], radius=radius, fill=255
)
alpha = Image.composite(Image.new("L", (cw, ch), 0), shadow.getchannel("A"), hole)
shadow.putalpha(alpha)
shadow.save(shadow_out)
