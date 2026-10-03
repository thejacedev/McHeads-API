---
order: 1
title: Rendering Overview
---

# Rendering Overview

The Minecraft Heads API uses two image-processing libraries to turn a 64x64
Minecraft skin texture into rendered head, body, and isometric 3D images. Each
library has a distinct role in the pipeline, and they hand off work to one
another depending on the type of render requested.

All render functions take the skin PNG as a buffer. Fetching the skin happens
before rendering, in `getSkinImage` (`utils/minecraft.js`), which downloads the
texture and keeps it in an in-memory cache for 24 hours.

---

## The Two Image Libraries

### Sharp

[Sharp](https://sharp.pixelplumbing.com/) is a high-performance Node.js binding
to libvips. The API uses it for:

- **Pixel-region extraction** -- cropping specific rectangles from the skin
  texture (e.g., the 8x8 face at position (8,8)).
- **Nearest-neighbor resizing** -- upscaling small skin regions to the requested
  output size while preserving hard pixel edges (no blurring).
- **Raw pixel decoding** -- decoding the skin once into a raw RGBA buffer for the
  flat body render, which then samples and blends pixels in JavaScript.
- **PNG optimization** -- encoding the final buffer as a compressed PNG.
- **Layer compositing** -- overlaying the hat layer on top of the base head.
- **Lanczos3 resampling** -- downscaling the large working canvas of isometric
  renders to the final output size with smooth anti-aliasing.

Sharp handles all `createHeadRender` calls entirely on its own, decodes and
encodes the flat body render (`createBodyRender`), and performs the final resize
step for isometric renders after Canvas has done the 3D transformation work.

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
for the 3D projection math.

---

## How They Work Together

The render pipeline varies by endpoint:

```
/head  -->  [Sharp]  extract face --> resize --> composite hat --> PNG out

/player --> [Sharp]  decode skin to raw RGBA
            [JS]     sample each body part (nearest-neighbor) into an output
                     buffer, blending overlays source-over
            [Sharp]  encode raw buffer --> PNG out

/avatar, /ioshead, /iosbody -->
    [Canvas]  load skin buffer as Image
           --> scale skin to working size (nearest-neighbor)
           --> apply affine transforms per cube face
           --> export raw PNG buffer
    [Sharp]   resize raw buffer to final size (Lanczos3)
           --> optimize PNG --> out
```

### Head Render Pipeline (Sharp only)

1. Receive the skin PNG buffer.
2. `sharp(skinBuffer).extract({left:8, top:8, width:8, height:8})` -- crop face
   (coordinates scaled by `width / 64` for HD skins).
3. `.resize(size, size, {kernel:'nearest'})` -- upscale to target.
4. If hat requested: extract hat layer at (40,8), resize, composite on top.
5. `.png().toBuffer()` -- encode and return.

### Body Render Pipeline (Sharp + JavaScript)

1. Receive the skin PNG buffer and the slim flag.
2. `sharp(skinBuffer).ensureAlpha().raw()` -- decode once into RGBA pixels.
3. For each entry in the `BODY_PARTS` layout table: nearest-neighbor sample its
   skin region into the `size` x `size*2` output buffer (3px arms for slim
   skins; mirrored right limbs for the left limbs of legacy skins).
4. If hat requested: blend each overlay region on top (only the head overlay on
   legacy skins).
5. `sharp(out, {raw: ...}).png()` -- encode and return.

### Isometric Render Pipeline (Canvas + Sharp)

1. Receive the skin PNG buffer.
2. Load the buffer into a `canvas.Image`.
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
| `createHeadRender` | Sharp | skinBuffer, size, hat | PNG buffer (size x size) |
| `createBodyRender` | Sharp + JS | skinBuffer, size, hat, slim | PNG buffer (size x size*2) |
| `createIsometricHeadRender` | Canvas + Sharp | skinBuffer, size, direction | PNG buffer (size x size) |
| `createIsometricBodyRender` | Canvas + Sharp | skinBuffer, size, direction, slim | PNG buffer (size x size*ratio) |

`/skin` and `/download` return the skin buffer from `getSkinImage` unchanged,
without calling a render function.

---

## Source Files

All rendering logic lives in `utils/imageProcessor.js`. Every image route in
`routes/` is built with `imageRoute` (`utils/imageRoute.js`), which parses the
player, checks the cache, resolves the skin with `getSkinInfo` and
`getSkinImage`, and then calls the route's render function.
