---
order: 4
title: Isometric Rendering
---

# Isometric 3D Rendering

The isometric render creates a 3D perspective view of a Minecraft player's head
or full body by projecting flat skin faces onto an isometric cube using Canvas 2D
affine transforms. This is the most complex rendering pipeline in the API,
combining **node-canvas** for geometry and **Sharp** for final resampling.

---

## How Isometric Projection Works

An isometric view shows three faces of a cube simultaneously: the front, the
side, and the top. Instead of true 3D rendering with a perspective camera, this
API uses 2D affine transformations (skew, scale, translate) to distort each flat
skin face so it appears as one face of a 3D cube.

Each face is drawn with `ctx.transform(a, b, c, d, e, f)` which applies a
2x3 affine matrix:

```
| a  c  e |     | scaleX  skewX   translateX |
| b  d  f |  =  | skewY   scaleY  translateY |
```

By choosing the right matrix values, a flat rectangle can be skewed to look like
one side of an isometric cube:

```
     Top face:  transform(1, -0.5, 1, 0.5, ...)
                Skews the rectangle into a diamond shape.

    Left face:  transform(1, 0.5, 0, 1, ...)
                Shears the rectangle down-right.

   Right face:  transform(1, -0.5, 0, 1, ...)
                Shears the rectangle down-left.

    Back face:  transform(-1, -0.5, 0, 1, ...)
                Mirrors and shears for the back.
```

---

## Scaling the Skin

Before any transforms, the skin texture is upscaled to a working size so that
the affine transforms operate on enough pixels to produce clean output.

```js
function generateScaledSkin(skinImage, targetBlockSize) {
    const minWidth = targetBlockSize * 8;
    let newWidth = skinImage.width;
    let newHeight = skinImage.height;

    while (newWidth < minWidth) {
        newWidth *= 2;
        newHeight *= 2;
    }

    const tmpCanvas = createCanvas(newWidth, newHeight);
    const tmpCtx = tmpCanvas.getContext('2d');
    tmpCtx.imageSmoothingEnabled = false;
    tmpCtx.drawImage(skinImage, 0, 0, newWidth, newHeight);

    return tmpImg;
}
```

Key points:

- The skin is doubled in size repeatedly until its width reaches at least
  `targetBlockSize * 8`.
- **`imageSmoothingEnabled = false`** ensures nearest-neighbor upscaling, so each
  skin pixel becomes a clean block of identical pixels with no blurring.
- The target block size (`side`) starts at 60 and doubles until it reaches the
  requested output size. The minimum is **120 px**.
- `blockSize = img.width / 8` gives the number of canvas pixels per skin-pixel.
  At a scaled width of 960, each of the 8 columns in the head is 120 px wide.

---

## Isometric Head Render

The `createIsometricHeadRender` function draws a cube with six visible faces
(front, left, right, top, plus overlay faces). It uses **9 canvas transforms**
in total.

### Working Canvas Size

The working canvas dimensions are calculated from the `side` parameter:

```
rectWidth = side * 2.175
rectHeight = side * 2.175
```

This creates a square canvas large enough to contain the isometric cube with
some padding.

### The 9 Transforms

Each `ctx.save()` / `ctx.transform()` / `ctx.drawImage()` / `ctx.restore()`
block draws one face of the cube:

| # | Face | Transform | Source region |
|---|------|-----------|---------------|
| 1 | Back-left | `(-1, -0.5, 0, 1, ...)` | Head left (6*bs, 1*bs) |
| 2 | Back-right | `(1, -0.5, 0, 1, ...)` | Head right (7*bs, 1*bs) |
| 3 | Right side | `(1, -0.5, 0, 1, ...)` | Head right (1*bs, 1*bs) |
| 4 | Left side (front) | `(1, 0.5, 0, 1, ...)` | Head front (0, 1*bs) |
| 5 | Top | `(1, -0.5, 1, 0.5, ...)` | Head top (1*bs, 0) |
| 6 | Front-left overlay | `(1, 0.5, 0, 1, ...)` | Hat front-left (4*bs, 1*bs) |
| 7 | Front-right overlay | `(1, -0.5, 0, 1, ...)` | Hat front-right (5*bs, 1*bs) |
| 8 | Top overlay | `(1, -0.5, 1, 0.5, ...)` | Hat top (5*bs, 0) |

The source regions use `blockSize` as the unit. For example, `blockSize * 6 + 1`
means 6 block-widths from the left edge plus a 1-pixel inset to avoid sampling
boundary artifacts. Each source region is drawn `blockSize - 2` wide/tall (with
1-pixel inset on each side) and then rendered slightly oversized (`w * 1.1`) to
fill any sub-pixel gaps between faces.

---

## Direction Flipping

Both isometric functions support `left` and `right` directions. The default
facing direction is `right`. For left-facing renders, the entire canvas is
mirrored before any face transforms:

```js
if (direction === 'left') {
    ctx.translate(rectWidth, 0);
    ctx.scale(-1, 1);
}
```

This translates the origin to the right edge and flips the x-axis. All
subsequent transforms and draws are mirrored. The result is a perfect horizontal
mirror of the right-facing render.

---

## Isometric Body Render

The `createIsometricBodyRender` function draws a full body with head, torso, two
arms, and two legs, each rendered as isometric cubes or rectangular prisms. It
uses **20+ individual transforms**.

### Working Canvas Size

```
rectWidth = side * 2.5
rectHeight = side * 5.1
```

The canvas is taller than wide to accommodate the full body proportions.

### Rendering Order (Bottom to Top)

The body is drawn back-to-front so that closer parts overlap farther ones:

1. **Left leg** -- back faces, base and overlay.
2. **Right leg** -- for legacy skins, flipped from left leg; for modern skins,
   drawn from the dedicated right leg texture plus overlay.
3. **Left leg overlays** (modern format).
4. **Right arm** -- for legacy skins, flipped left arm; for modern skins, drawn
   from the dedicated right arm region. Includes top face for 3D effect.
5. **Torso** -- front and side faces, plus overlay (modern format).
6. **Left arm** -- front and side faces, plus top face and overlay.
7. **Head** -- the same 9 transforms as the isometric head render, drawn last
   so it sits on top of everything.

### Legacy vs Modern Format

Format detection uses the same approach as the 2D body render:

```js
const isNewFormat = skinImage.height === skinImage.width;
```

For legacy 64x32 skins:
- Right arm and right leg are drawn by mirroring the left-side transforms
  using `ctx.transform(-1, 0.5, ...)` which flips the x-axis.
- No overlay layers are drawn for right-side limbs.

For modern 64x64 skins:
- Each limb has its own source region on the skin texture.
- Overlay layers are drawn for all parts (torso, both arms, both legs).

---

## Final Resize with Sharp

After the canvas draws are complete, the working canvas is exported to a PNG
buffer and handed to Sharp for the final resize:

```js
const rawBuffer = canvas.toBuffer('image/png');
const scaledBuffer = await sharp(rawBuffer)
    .resize(size, size, { kernel: 'lanczos3' })
    .png()
    .toBuffer();
```

The **Lanczos3** kernel is used instead of nearest-neighbor because the
isometric canvas contains angled lines and smooth gradients created by the affine
transforms. Lanczos3 produces clean anti-aliased edges in the final output. This
is a deliberate departure from the nearest-neighbor approach used in flat head
renders, where preserving hard pixel edges is desirable.

For body renders, the output preserves the canvas aspect ratio:

```js
const aspectRatio = rectHeight / rectWidth;  // 5.1 / 2.5 = 2.04
const outputWidth = size;
const outputHeight = Math.round(size * aspectRatio);
```

So a body render at size 128 produces a 128x261 pixel image.

---

## Endpoints

| Route | Function | Default size |
| ----- | -------- | ------------ |
| `GET /ioshead/:input/:direction/:option?` | `createIsometricHeadRender` | 64 |
| `GET /iosbody/:input/:direction/:option?` | `createIsometricBodyRender` | 64 |
| `GET /avatar/:input/:direction/:size?` | `createIsometricBodyRender` | 128 |

All three routes require a `direction` parameter of either `left` or `right`.
Passing any other value returns a `400` error:

```json
{ "error": "Direction must be \"left\" or \"right\"" }
```

Routes defined in `routes/ios.js` and `routes/avatar.js`, calling functions in
`utils/imageProcessor.js`.
