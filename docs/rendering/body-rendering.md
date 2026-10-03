---
order: 3
title: Body Rendering
---

# Body Rendering

The 2D body render assembles a full player model from six body parts extracted
from the skin texture: head, torso, right arm, left arm, right leg, and left
leg. The function, `createBodyRender(skinBuffer, size, hat, slim)`, decodes the
skin once with **Sharp**, nearest-neighbor samples each part into a single
output buffer, and encodes the result as PNG with Sharp. The skin is fetched
beforehand by `getSkinImage`, and `slim` comes from the player's skin model.

"Right" and "left" below are the player's own sides: in the front-facing render
the right arm and right leg appear on the viewer's left.

---

## Body Part Regions

Each body part occupies a specific rectangle on the Minecraft skin texture. The
coordinates below are in the format **(x, y, width, height)** relative to the
top-left corner of a 64-pixel-wide skin PNG. HD skins are supported by scaling
every coordinate by `width / 64`.

### Base Layer Parts

| Part | Position | Size | Notes |
| ---- | -------- | ---- | ----- |
| Head front | (8, 8) | 8x8 | Same as head render |
| Torso front | (20, 20) | 8x12 | |
| Right arm front | (44, 20) | 4x12 | 3x12 for slim skins |
| Left arm front | (36, 52) | 4x12 | New format only; 3x12 for slim skins |
| Right leg front | (4, 20) | 4x12 | |
| Left leg front | (20, 52) | 4x12 | New format only |

### Overlay Layer Parts

| Part | Position | Size | Notes |
| ---- | -------- | ---- | ----- |
| Head overlay | (40, 8) | 8x8 | Hat layer, all skins |
| Torso overlay | (20, 36) | 8x12 | New format only |
| Right arm overlay | (44, 36) | 4x12 | New format only |
| Left arm overlay | (52, 52) | 4x12 | New format only |
| Right leg overlay | (4, 36) | 4x12 | New format only |
| Left leg overlay | (4, 52) | 4x12 | New format only |

These regions, together with each part's position in the output, are defined in
one layout table, `BODY_PARTS`, in `utils/imageProcessor.js`. Destinations are
on a 16x32 grid of skin pixels:

```js
const BODY_PARTS = [
    { dest: [4, 0, 8, 8], src: [8, 8], overlay: [40, 8], legacyOverlay: true },  // head
    { dest: [4, 8, 8, 12], src: [20, 20], overlay: [20, 36] },                    // torso
    { dest: [0, 8, 4, 12], src: [44, 20], overlay: [44, 36], arm: true, slimShift: 1 }, // right arm
    { dest: [12, 8, 4, 12], src: [36, 52], overlay: [52, 52], arm: true, legacySrc: [44, 20] }, // left arm
    { dest: [4, 20, 4, 12], src: [4, 20], overlay: [4, 36] },                     // right leg
    { dest: [8, 20, 4, 12], src: [20, 52], overlay: [4, 52], legacySrc: [4, 20] } // left leg
];
```

---

## Skin Layout Diagram

```
64x64 Modern Skin Texture Map:

         0    4    8   16   20   28   32   36   40   44   48   52   56
     0   +----+----+----+----+----+----+----+----+----+----+----+----+
         |         |Head     |         |         |Hat      |         |
     8   |         |Top      |         |         |Top      |         |
         +---------+---------+---------+---------+---------+---------+
         |Head|Head|Head|Head|Hat |Hat  |Hat |Hat |         |         |
    16   |Rgt |Frnt|Left|Back|Rgt |Front|Left|Back|         |         |
         +----+----+----+----+----+-----+----+----+---------+---------+
         |    |Leg |    |    |    |Torso|    |    |    |Arm |    |    |
    20   |    |Frnt|    |    |    |Front|    |    |    |Frnt|    |    |
         |    |4x12|    |    |    |8x12 |    |    |    |4x12|    |    |
    32   +----+----+----+----+----+-----+----+----+----+----+----+----+
         |    |Leg |    |    |    |Torso|    |    |    |Arm |    |    |
    36   |    |Ovly|    |    |    |Ovly |    |    |    |Ovly|    |    |
         |    |4x12|    |    |    |8x12 |    |    |    |4x12|    |    |
    48   +----+----+----+----+----+-----+----+----+----+----+----+----+
         |    |LLeg|    |    |    |LArm |    |    |    |    |    |    |
    52   |    |Frnt|    |    |    |Front|    |    |    |    |    |    |
         |    |4x12|    |    |    |4x12 |    |    |    |    |    |    |
    64   +----+----+----+----+----+-----+----+----+----+----+----+----+

   Unprefixed "Leg" and "Arm" (rows 16-47) = right side.
   "L" prefix = left side (new format only, rows 48-63)
   Overlay rows (32-47) mirror base rows (16-31) for each part.
```

---

## Legacy vs Modern Skin Format

Minecraft skins come in two sizes:

- **Legacy format**: 64x32 pixels. Only the right arm and right leg are defined.
  The left arm and left leg are created by mirroring (horizontally flipping)
  the right side. The only overlay is the head (hat) layer.
- **Modern format**: 64x64 pixels. Both left and right limbs have independent
  textures, plus overlay layers for every body part.

The API detects the format from the image dimensions. Square images are modern,
2:1 images are legacy, and anything else is rejected (the request fails with
HTTP 500):

```js
function skinFormat(width, height) {
    if (!width || (height !== width && height * 2 !== width)) {
        throw new Error(`Unsupported skin dimensions: ${width}x${height}`);
    }
    return { scale: width / 64, isNewFormat: height === width };
}
```

For legacy skins, the left limbs are drawn from the right limbs' region
(`legacySrc`) with mirroring. Mirroring flips the scaled output, so a mirrored
limb is an exact mirror image of the original even when the scale factor isn't
a whole number:

```js
if (isNewFormat || !part.legacySrc) {
    drawRegion(part.src, dest, false);
} else {
    drawRegion(part.legacySrc, dest, true);
}
```

---

## Slim (Alex) Arms

When the player's skin uses the slim model and the skin is in the modern
format, both arms are drawn 3 skin pixels wide instead of 4 (both the source
region and the destination are narrowed). The right arm is shifted 1 grid unit
toward the torso (`slimShift`) so it stays attached; the left arm already starts
at the torso's edge:

```js
if (part.arm && thinArms) {
    dest[0] += part.slimShift || 0;
    dest[2] = 3;
}
```

---

## Composite Layout

The output canvas is `size` pixels wide and `size * 2` pixels tall (portrait
orientation). Body parts are positioned relative to the `size` parameter, as
seen by the viewer:

```
Output canvas (size x size*2):

     0         size/4      size/2      3*size/4      size
     +----------+----------+----------+----------+
  0  |          |          |          |          |
     |          | HEAD     | HEAD     |          |
     |          | (size/2 x size/2)   |          |
     |          |          |          |          |
size/2+---------+----------+----------+----------+
     | RIGHT ARM| TORSO               | LEFT ARM |
     | (size/4  | (size/2 x size*3/4) | (size/4  |
     |  x       |                     |  x       |
     | size*3/4)|                     | size*3/4)|
5s/4 +----------+----------+----------+----------+
     |          | RIGHT LEG| LEFT LEG |          |
     |          | (size/4  | (size/4  |          |
     |          |  x       |  x       |          |
     |          | size*3/4)| size*3/4)|          |
 2s  +----------+----------+----------+----------+
```

### Part Positions (in pixels)

| Part | X offset | Y offset | Render size |
| ---- | -------- | -------- | ----------- |
| Head | size/4 | 0 | size/2 x size/2 |
| Torso | size/4 | size/2 | size/2 x size*3/4 |
| Right arm (viewer's left) | 0 (size/16 when slim) | size/2 | size/4 (size*3/16 when slim) x size*3/4 |
| Left arm (viewer's right) | size*3/4 | size/2 | size/4 (size*3/16 when slim) x size*3/4 |
| Right leg (viewer's left) | size/4 | size*5/4 | size/4 x size*3/4 |
| Left leg (viewer's right) | size/2 | size*5/4 | size/4 x size*3/4 |

Each grid unit is `size / 16` pixels. Rather than rounding each part's width,
the renderer rounds each edge, so adjacent parts stay flush with no gaps or
overlaps when `size` isn't a multiple of 16:

```js
const px = units => Math.round(units * size / 16);
```

---

## Overlay Compositing

When the `hat` option is enabled, overlay layers are drawn on top of each base
part. The overlay regions for the torso, right arm and right leg are located 16
rows below their base regions on the skin texture (e.g., torso base at row 20,
torso overlay at row 36).

The compositing order is bottom-to-top for each part:

1. Draw base part.
2. Draw overlay part at the same position, blended on top.

Blending is done by hand, source-over on straight (non-premultiplied) alpha, so
semi-transparent overlay pixels keep their exact colors:

```js
function blendPixel(dst, d, src, s) {
    const srcAlpha = src[s + 3] / 255;
    if (srcAlpha === 0) return;
    const dstAlpha = dst[d + 3] / 255;
    const outAlpha = srcAlpha + dstAlpha * (1 - srcAlpha);
    for (let c = 0; c < 3; c++) {
        dst[d + c] = Math.round((src[s + c] * srcAlpha + dst[d + c] * dstAlpha * (1 - srcAlpha)) / outAlpha);
    }
    dst[d + 3] = Math.round(outAlpha * 255);
}
```

For legacy skins, only the head overlay is drawn, because the 64x32 texture has
no other overlay regions. The head overlay is skipped entirely when the legacy
hat area is fully opaque, matching Minecraft (`decodeSkin` clears it; see
[Skin Format](../reference/skin-format.md)):

```js
if (hat && (isNewFormat || part.legacyOverlay)) {
    drawRegion(part.overlay, dest, false);
}
```

---

## Rendering Order

Parts are drawn in `BODY_PARTS` order:

1. Head (base)
2. Head overlay (if hat)
3. Torso (base)
4. Torso overlay (if hat and new format)
5. Right arm (base)
6. Right arm overlay (if hat and new format)
7. Left arm (base, from new format or mirrored right arm)
8. Left arm overlay (if hat and new format)
9. Right leg (base)
10. Right leg overlay (if hat and new format)
11. Left leg (base, from new format or mirrored right leg)
12. Left leg overlay (if hat and new format)

The parts don't overlap each other, so the order only matters in that each
overlay is drawn after its base part.

---

## Output

The raw RGBA buffer is encoded with
`sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer()`. The
output dimensions are always **size x (size * 2)** pixels. For the default size
of 128, that produces a 128x256 pixel image.

---

## Endpoint

```
GET /player/:input/:size?/:option?
```

- `input` -- username, UUID, or Bedrock identifier.
- `size` -- width in pixels (default 128, clamped to 8–512). Height is always 2x the width.
- `option` -- pass `hat` to include overlay layers.

Route defined in `routes/player.js`, calls `createBodyRender` in
`utils/imageProcessor.js` with the player's `slim` flag.
