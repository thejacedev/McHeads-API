---
order: 4
title: Isometric Rendering
---

# Isometric 3D Rendering

The isometric render creates a 3D perspective view of a Minecraft player's head
or full body by projecting flat skin faces onto an isometric cube using Canvas 2D
affine transforms. This is the most complex rendering pipeline in the API,
combining **node-canvas** for geometry and **Sharp** for final resampling.

The two render functions are `createIsometricHeadRender(skinBuffer, size,
direction)` and `createIsometricBodyRender(skinBuffer, size, direction, slim)`.
Both receive the skin PNG as a buffer; the skin is fetched beforehand by
`getSkinImage`.

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

Every face is drawn by the `drawFace` helper, which applies one matrix, draws
one source rectangle of the skin into a `dw x dh` destination, and restores the
context:

```js
function drawFace(ctx, img, matrix, src, [dw, dh]) {
    ctx.save();
    ctx.transform(...matrix);
    ctx.drawImage(img, ...src, 0, 0, dw, dh);
    ctx.restore();
}
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

    const canvas = createCanvas(newWidth, newHeight);
    const ctx = canvas.getContext('2d');

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(skinImage, 0, 0, newWidth, newHeight);

    return canvas;
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

The `createIsometricHeadRender` function draws the head cube's visible faces
plus the hat overlay. The drawing is shared with the body render through
`drawIsometricHead`, which makes **8 `drawFace` calls** in total.

### Working Canvas Size

The working canvas dimensions are calculated from the `side` parameter:

```
rectWidth = side * 2.175
rectHeight = side * 2.175
```

This creates a square canvas large enough to contain the isometric cube with
some padding.

### The 8 Transforms

Each `drawFace` call (a `ctx.save()` / `ctx.transform()` / `ctx.drawImage()` /
`ctx.restore()` block) draws one face of the cube, in this order (`bs` =
`blockSize`, one 8-pixel block of the skin):

| # | Face | Transform | Source region |
|---|------|-----------|---------------|
| 1 | Hat left, behind the head (shows through the hat edges) | `(-1, -0.5, 0, 1, ...)` | Hat left (6*bs, 1*bs) = skin (48, 8) |
| 2 | Hat back, behind the head (shows through the hat edges) | `(1, -0.5, 0, 1, ...)` | Hat back (7*bs, 1*bs) = skin (56, 8) |
| 3 | Head front | `(1, -0.5, 0, 1, ...)` | Head front (1*bs, 1*bs) = skin (8, 8) |
| 4 | Head right side | `(1, 0.5, 0, 1, ...)` | Head right (0, 1*bs) = skin (0, 8) |
| 5 | Head top | `(1, -0.5, 1, 0.5, ...)` | Head top (1*bs, 0) = skin (8, 0) |
| 6 | Hat right side | `(1, 0.5, 0, 1, ...)` | Hat right (4*bs, 1*bs) = skin (32, 8) |
| 7 | Hat front | `(1, -0.5, 0, 1, ...)` | Hat front (5*bs, 1*bs) = skin (40, 8) |
| 8 | Hat top | `(1, -0.5, 1, 0.5, ...)` | Hat top (5*bs, 0) = skin (40, 0) |

In the right-facing render the front is the face on the viewer's right and the
player's right side is the face on the viewer's left. The hat faces (1, 2, 6, 7
and 8) are always drawn; the isometric renders have no `hat` option.

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

The body is drawn back-to-front so that closer parts overlap farther ones. In
the right-facing render the player's right side is nearest the viewer ("right"
and "left" are the player's own sides):

1. **Right leg** -- front face.
2. **Left leg** -- front face; for legacy skins, mirrored from the right leg;
   for modern skins, drawn from the dedicated left leg texture plus overlay.
3. **Right leg** -- side face, then overlay (modern format).
4. **Left arm** (far) -- front and top faces; for legacy skins, mirrored from
   the right arm; for modern skins, drawn from the dedicated left arm region
   plus overlay.
5. **Torso** -- front and side faces, plus overlay (modern format).
6. **Right arm** (near) -- outer side, front and top faces, plus overlay
   (modern format).
7. **Head** -- the same 8 transforms as the isometric head render
   (`drawIsometricHead`), drawn last so it sits on top of everything.

### Legacy vs Modern Format

Format detection compares the image dimensions:

```js
const isNewFormat = skinImage.height === skinImage.width;
```

For legacy 64x32 skins:
- The left arm and left leg are drawn by mirroring the right arm and right leg
  regions using `transform(-1, 0.5, ...)`, which flips the x-axis.
- No overlay layers are drawn for the torso or limbs (the head's hat layer is
  still drawn).

For modern 64x64 skins:
- Each limb has its own source region on the skin texture.
- Overlay layers are drawn for all parts (torso, both arms, both legs).

### Slim (Alex) Arms

When `slim` is true and the skin is in the modern format, the arms are drawn
3 skin pixels wide instead of 4: the source rectangles and the destination
widths of the arm front, top and overlay faces are narrowed to three quarters.
The far arm keeps its torso-side edge, and the near arm slides 1 pixel along
its front face toward the torso so it stays attached. With `slim` false (the
default) the output is unchanged.

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

Sizes are clamped to 8–512. All three routes require a `direction` parameter
of either `left` or `right`. Passing any other value returns a `400` error:

```json
{ "error": "Direction must be \"left\" or \"right\"" }
```

Routes defined in `routes/ios.js` and `routes/avatar.js`, calling functions in
`utils/imageProcessor.js`.
