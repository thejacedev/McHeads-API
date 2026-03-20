---
order: 1
title: Rendering Overview
---

# Rendering Overview

The Minecraft Heads API uses three image-processing libraries to turn a 64x64
Minecraft skin texture into rendered head, body, and isometric 3D images. Each
library has a distinct role in the pipeline, and they hand off work to one
another depending on the type of render requested.

---

## The Three Image Libraries

### Sharp

[Sharp](https://sharp.pixelplumbing.com/) is a high-performance Node.js binding
to libvips. The API uses it for:

- **Pixel-region extraction** -- cropping specific rectangles from the skin
  texture (e.g., the 8x8 face at position (8,8)).
- **Nearest-neighbor resizing** -- upscaling small skin regions to the requested
  output size while preserving hard pixel edges (no blurring).
- **PNG optimization** -- encoding the final buffer as a compressed PNG.
- **Layer compositing** -- overlaying the hat layer on top of the base head.
- **Lanczos3 resampling** -- downscaling the large working canvas of isometric
  renders to the final output size with smooth anti-aliasing.

Sharp is the fastest of the three libraries and handles all `createHeadRender`
calls entirely on its own. It also performs the final resize step for isometric
renders after Canvas has done the 3D transformation work.

### Jimp

[Jimp](https://github.com/jimp-dev/jimp) is a pure-JavaScript image library
with no native dependencies. The API uses it for:

- **Pixel-level manipulation** -- reading individual pixels and regions from the
  skin texture for body-part extraction.
- **Clone and crop** -- creating independent copies of skin sub-regions for each
  body part (head, torso, arms, legs).
- **Nearest-neighbor resize** -- upscaling each body part to the proportionally
  correct size using `Jimp.RESIZE_NEAREST_NEIGHBOR`.
- **Compositing** -- layering body parts and their overlay counterparts onto a
  single output canvas in the correct positions.
- **Horizontal flip** -- mirroring the left arm/leg to create the right
  arm/leg on legacy 64x32 skins that lack separate right-side textures.

Jimp handles all 2D body renders (`createBodyRender`) and the avatar render
(`createAvatarRender`). Its pure-JS nature makes it slightly slower than Sharp
but gives it the flexibility needed for multi-part compositing with per-pixel
control.

### Canvas (node-canvas)

[node-canvas](https://github.com/Automattic/node-canvas) provides a
Cairo-backed HTML5 Canvas API for Node.js. The API uses it for:

- **2D affine transforms** -- skew, scale, and translate operations that project
  flat skin faces onto an isometric 3D cube.
- **Nearest-neighbor upscaling** -- scaling the skin texture to a large working
  size (`imageSmoothingEnabled = false`) so that each skin pixel becomes a clean
  block of identical pixels before transformation.
- **Direction flipping** -- calling `ctx.scale(-1, 1)` to mirror the entire
  isometric render for left-facing views.
- **Buffer export** -- writing the canvas contents to a PNG buffer that Sharp
  then resizes to the final output dimensions.

Canvas is used exclusively for isometric renders (`createIsometricHeadRender`
and `createIsometricBodyRender`). Its affine transform support is essential
for the 3D projection math that Sharp and Jimp cannot do.

---

## How They Work Together

The render pipeline varies by endpoint:

```
/head  -->  [Sharp]  extract face --> resize --> composite hat --> PNG out

/player --> [Jimp]   extract parts --> resize each --> composite all --> PNG out

/avatar, /ioshead, /iosbody -->
    [Canvas]  load skin buffer as Image
           --> scale skin to working size (nearest-neighbor)
           --> apply 8-9 affine transforms per cube face
           --> export raw PNG buffer
    [Sharp]   resize raw buffer to final size (Lanczos3)
           --> optimize PNG --> out
```

### Head Render Pipeline (Sharp only)

1. Download skin PNG from Mojang/GeyserMC.
2. `sharp(skinBuffer).extract({left:8, top:8, width:8, height:8})` -- crop face.
3. `.resize(size, size, {kernel:'nearest'})` -- upscale to target.
4. If hat requested: extract hat layer at (40,8), resize, composite on top.
5. `.png().toBuffer()` -- encode and return.

### Body Render Pipeline (Jimp)

1. Download skin PNG.
2. `Jimp.read(skinBuffer)` -- parse into a Jimp image.
3. For each body part: `.clone().crop(x, y, w, h).resize(...)`.
4. Composite each part onto a `new Jimp(size, size*2)` output canvas.
5. If hat requested: extract and composite overlay for each part.
6. `.getBufferAsync(Jimp.MIME_PNG)` -- encode and return.

### Isometric Render Pipeline (Canvas + Sharp)

1. Download skin PNG.
2. Load buffer into a `canvas.Image` via base64 data URL.
3. Scale skin to working size (multiples of 120 px) with nearest-neighbor.
4. Create a working canvas (approx. 2.175x the side length for heads, 2.5x5.1x
   for bodies).
5. Apply 8 affine transforms (head) or 20+ transforms (body) to draw each cube
   face.
6. If direction is `left`: pre-apply `ctx.scale(-1, 1)` to mirror everything.
7. Export the working canvas to a PNG buffer.
8. `sharp(rawBuffer).resize(size, size, {kernel:'lanczos3'}).png()` -- final
   downscale with smooth resampling.

---

## Render Functions Summary

| Function | Library | Input | Output |
| -------- | ------- | ----- | ------ |
| `createHeadRender` | Sharp | skinUrl, size, hat | PNG buffer (size x size) |
| `createAvatarRender` | Jimp | skinUrl, size | PNG buffer (size x size) |
| `createBodyRender` | Jimp | skinUrl, size, hat | PNG buffer (size x size*2) |
| `createIsometricHeadRender` | Canvas + Sharp | skinUrl, size, direction | PNG buffer (size x size) |
| `createIsometricBodyRender` | Canvas + Sharp | skinUrl, size, direction | PNG buffer (size x size*ratio) |
| `getRawSkin` | Axios only | skinUrl | Raw skin PNG buffer |

---

## Source Files

All rendering logic lives in `utils/imageProcessor.js`. Route handlers in
`routes/` call these functions after resolving the player profile and checking
the cache.
