---
order: 2
title: Skin Format
---

# Minecraft Skin Texture Format

Minecraft player skins are PNG images that map flat 2D pixel regions to the 3D
faces of a player model. Understanding the skin layout is essential to
understanding how the API extracts and renders each body part.

---

## Dimensions

There are two skin formats:

| Format | Dimensions | Introduced |
| ------ | ---------- | ---------- |
| Legacy | 64x32 pixels | Original Minecraft |
| Modern | 64x64 pixels | Minecraft 1.8+ |

Both formats use the same upper half (rows 0-31) for the head, torso, right arm,
and right leg. The modern format adds the lower half (rows 32-63) for overlay
layers and dedicated left-side limb textures. "Right" and "left" are the
player's own sides, so in a front view the right arm appears on the viewer's
left.

The API detects the format from the image dimensions (`skinFormat` in
`utils/imageProcessor.js`): square images are modern, 2:1 images are legacy, and
anything else is rejected. HD skins wider than 64 pixels are supported, with
all coordinates scaled by `width / 64`:

```js
function skinFormat(width, height) {
    if (!width || (height !== width && height * 2 !== width)) {
        throw new Error(`Unsupported skin dimensions: ${width}x${height}`);
    }
    return { scale: width / 64, isNewFormat: height === width };
}
```

---

## Full Skin Layout (64x64 Modern)

Each body part is mapped to a cross-shaped unfolding on the texture, similar to
how a cardboard box unfolds. The cross contains the top, bottom, front, back,
left, and right faces of that body part.

```
Full 64x64 Skin Texture:

  Column:  0       8      16      24      32      40      48      56     63
       +-------+-------+-------+-------+-------+-------+-------+-------+
  0    |       | Head  | Head  |       |       | Hat   | Hat   |       |
       |       | Top   | Bot   |       |       | Top   | Bot   |       |
       |       | 8x8   | 8x8   |       |       | 8x8   | 8x8   |       |
       +-------+-------+-------+-------+-------+-------+-------+-------+
  8    | Head  | Head  | Head  | Head  | Hat   | Hat   | Hat   | Hat   |
       | Right | FRONT | Left  | Back  | Right | FRONT | Left  | Back  |
       | 8x8   | 8x8   | 8x8   | 8x8   | 8x8   | 8x8   | 8x8   | 8x8   |
       +-------+-------+-------+-------+-------+-------+-------+-------+
  16   |       | Leg   | Leg   |       |       | Torso | Torso |       |
       |       | Top   | Bot   |       |       | Top   | Bot   |       |
       |       | 4x4   | 4x4   |       |       | 8x4   | 8x4   |       |
       +-------+-------+-------+-------+-------+-------+-------+-------+
  20   | Leg   | Leg   | Leg   | Leg   | Arm   | Torso | Torso | Arm   |
       | Right | FRONT | Left  | Back  | Right | FRONT | Left  | Back  |
       | 4x12  | 4x12  | 4x12  | 4x12  | 4x12  | 8x12  | 8x12  | 4x12  |
       +-------+-------+-------+-------+-------+-------+-------+-------+
  32   |       | LegOv | LegOv |       |       | TorOv | TorOv |       |
       |       | Top   | Bot   |       |       | Top   | Bot   |       |
       +-------+-------+-------+-------+-------+-------+-------+-------+
  36   | LegOv | LegOv | LegOv | LegOv | ArmOv | TorOv | TorOv | ArmOv |
       | Right | FRONT | Left  | Back  | Right | FRONT | Left  | Back  |
       | 4x12  | 4x12  | 4x12  | 4x12  | 4x12  | 8x12  | 8x12  | 4x12  |
       +-------+-------+-------+-------+-------+-------+-------+-------+
  48   |       | LLeg  | LLeg  |       |       | LArm  | LArm  |       |
       |       | Top   | Bot   |       |       | Top   | Bot   |       |
       +-------+-------+-------+-------+-------+-------+-------+-------+
  52   | LLeg  | LLeg  | LLeg  | LLeg  | LArm  | LArm  | LArm  | LArm  |
       | Right | FRONT | Left  | Back  | Right | FRONT | Left  | Back  |
       | 4x12  | 4x12  | 4x12  | 4x12  | 4x12  | 4x12  | 4x12  | 4x12  |
       +-------+-------+-------+-------+-------+-------+-------+-------+
  64

  "Ov" = Overlay layer.  "L" prefix = Left-side limb (modern format only).
  Unprefixed "Leg" and "Arm" in rows 16-31 are the right-side limbs.
  Rows 32-63 do not exist in legacy 64x32 skins.
```

---

## Pixel Region Coordinates

All coordinates are **(x, y, width, height)** from the top-left corner.

### Head

| Face | Position | Size |
| ---- | -------- | ---- |
| Top | (8, 0) | 8x8 |
| Bottom | (16, 0) | 8x8 |
| Right | (0, 8) | 8x8 |
| **Front** | **(8, 8)** | **8x8** |
| Left | (16, 8) | 8x8 |
| Back | (24, 8) | 8x8 |

### Head Overlay (Hat)

| Face | Position | Size |
| ---- | -------- | ---- |
| Top | (40, 0) | 8x8 |
| Bottom | (48, 0) | 8x8 |
| Right | (32, 8) | 8x8 |
| **Front** | **(40, 8)** | **8x8** |
| Left | (48, 8) | 8x8 |
| Back | (56, 8) | 8x8 |

### Torso

| Face | Position | Size |
| ---- | -------- | ---- |
| Top | (20, 16) | 8x4 |
| Bottom | (28, 16) | 8x4 |
| Right | (16, 20) | 4x12 |
| **Front** | **(20, 20)** | **8x12** |
| Left | (28, 20) | 4x12 |
| Back | (32, 20) | 8x12 |

### Right Arm

| Face | Position | Size |
| ---- | -------- | ---- |
| Top | (44, 16) | 4x4 |
| Bottom | (48, 16) | 4x4 |
| Right | (40, 20) | 4x12 |
| **Front** | **(44, 20)** | **4x12** |
| Left | (48, 20) | 4x12 |
| Back | (52, 20) | 4x12 |

### Right Leg

| Face | Position | Size |
| ---- | -------- | ---- |
| Top | (4, 16) | 4x4 |
| Bottom | (8, 16) | 4x4 |
| Right | (0, 20) | 4x12 |
| **Front** | **(4, 20)** | **4x12** |
| Left | (8, 20) | 4x12 |
| Back | (12, 20) | 4x12 |

### Left Arm (Modern Format Only)

| Face | Position | Size |
| ---- | -------- | ---- |
| Top | (36, 48) | 4x4 |
| Bottom | (40, 48) | 4x4 |
| Right | (32, 52) | 4x12 |
| **Front** | **(36, 52)** | **4x12** |
| Left | (40, 52) | 4x12 |
| Back | (44, 52) | 4x12 |

### Left Leg (Modern Format Only)

| Face | Position | Size |
| ---- | -------- | ---- |
| Top | (20, 48) | 4x4 |
| Bottom | (24, 48) | 4x4 |
| Right | (16, 52) | 4x12 |
| **Front** | **(20, 52)** | **4x12** |
| Left | (24, 52) | 4x12 |
| Back | (28, 52) | 4x12 |

### Slim (Alex) Arms

Skins that use the slim model (`metadata.model: "slim"` in the textures data
from Mojang or GeyserMC) have arms 3 pixels wide instead of 4. The arm front
faces start at the same positions listed above but are 3 pixels wide. The API
reads the model and draws 3px arms in the `/player`, `/avatar` and `/iosbody`
renders for modern-format skins.

---

## Overlay Layers

The overlay (or "second layer") sits on top of the base layer with alpha
blending. Each base part has a corresponding overlay region located 16 rows
below it in the texture (for the torso, right arm and right leg), 16 columns
beside it (for the left arm and left leg, whose overlays are at (52, 52) and
(4, 52)), or 32 columns to the right (for the head).

Overlay pixels with alpha = 0 (fully transparent) show the base layer
underneath. Overlay pixels with alpha = 255 (fully opaque) replace the base
layer. Partial transparency is supported but rarely used in practice.

Common uses of overlay layers:
- **Head overlay**: glasses, hats, beards, masks, hair.
- **Torso overlay**: jackets, capes, armor details.
- **Arm/leg overlays**: sleeves, boots, bracers.

---

## Legacy Skin Handling

For 64x32 skins:

- Only the upper half of the texture exists.
- The left arm and left leg have no dedicated regions.
- The API creates them by **horizontally mirroring** the right arm and right leg.
- No overlay layers exist for the torso, arms, or legs (only the head hat
  layer is available), so `/player/.../hat` draws only the head overlay.

This mirroring means legacy skins always have symmetrical arms and legs, which
was the intended design before Minecraft 1.8 introduced asymmetric skins.

---

## Color Format

Skin textures use **RGBA** color with 8 bits per channel (32 bits per pixel).
The alpha channel is significant:

- The base head layer should be fully opaque (alpha = 255) for all 64 pixels.
- The overlay layers can have transparent pixels.
- Fully transparent pixels `(0, 0, 0, 0)` in the overlay are common and mean
  "show the base layer here."
- Many legacy 64x32 skins (Notch's included) fill the unused hat area with a
  solid colour such as pure black `(0, 0, 0, 255)` instead of transparency.
  Minecraft ignores the hat layer of a legacy skin when the right half of the
  texture (x 32-64, y 0-32) has no pixel with alpha below 128, and the API
  renderers do the same, so these skins don't get a solid black head. The rule
  only applies to rendered images; `/skin` and `/download` return the texture
  unchanged.
