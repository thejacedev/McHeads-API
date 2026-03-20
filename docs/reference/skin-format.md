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

Both formats use the same upper half (rows 0-31) for the head, torso, left arm,
and left leg. The modern format adds the lower half (rows 32-63) for overlay
layers and dedicated right-side limb textures.

The API detects the format by checking the image height:

```js
const isNewFormat = skin.bitmap.height >= 64;
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
  48   |       | RLeg  | RLeg  |       |       | RArm  | RArm  |       |
       |       | Top   | Bot   |       |       | Top   | Bot   |       |
       +-------+-------+-------+-------+-------+-------+-------+-------+
  52   | RLeg  | RLeg  | RLeg  | RLeg  | RArm  | RArm  | RArm  | RArm  |
       | Right | FRONT | Left  | Back  | Right | FRONT | Left  | Back  |
       | 4x12  | 4x12  | 4x12  | 4x12  | 4x12  | 4x12  | 4x12  | 4x12  |
       +-------+-------+-------+-------+-------+-------+-------+-------+
  64

  "Ov" = Overlay layer.  "R" prefix = Right-side (modern format only).
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

### Left Arm

| Face | Position | Size |
| ---- | -------- | ---- |
| Top | (44, 16) | 4x4 |
| Bottom | (48, 16) | 4x4 |
| Right | (40, 20) | 4x12 |
| **Front** | **(44, 20)** | **4x12** |
| Left | (48, 20) | 4x12 |
| Back | (52, 20) | 4x12 |

### Left Leg

| Face | Position | Size |
| ---- | -------- | ---- |
| Top | (4, 16) | 4x4 |
| Bottom | (8, 16) | 4x4 |
| Right | (0, 20) | 4x12 |
| **Front** | **(4, 20)** | **4x12** |
| Left | (8, 20) | 4x12 |
| Back | (12, 20) | 4x12 |

### Right Arm (Modern Format Only)

| Face | Position | Size |
| ---- | -------- | ---- |
| Top | (36, 48) | 4x4 |
| Bottom | (40, 48) | 4x4 |
| Right | (32, 52) | 4x12 |
| **Front** | **(36, 52)** | **4x12** |
| Left | (40, 52) | 4x12 |
| Back | (44, 52) | 4x12 |

### Right Leg (Modern Format Only)

| Face | Position | Size |
| ---- | -------- | ---- |
| Top | (20, 48) | 4x4 |
| Bottom | (24, 48) | 4x4 |
| Right | (16, 52) | 4x12 |
| **Front** | **(20, 52)** | **4x12** |
| Left | (24, 52) | 4x12 |
| Back | (28, 52) | 4x12 |

---

## Overlay Layers

The overlay (or "second layer") sits on top of the base layer with alpha
blending. Each base part has a corresponding overlay region located 16 rows
below it in the texture (for the torso, arms, and legs) or 32 columns to the
right (for the head).

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
- The right arm and right leg have no dedicated regions.
- The API creates them by **horizontally mirroring** the left arm and left leg.
- No overlay layers exist for the torso, arms, or legs (only the head hat
  layer is available).

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
- Some legacy skins use pure black `(0, 0, 0, 255)` in the hat layer instead
  of transparency, which renders as a black overlay. The API does not attempt
  to detect or fix this.
