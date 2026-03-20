---
order: 2
title: Head Rendering
---

# Head Rendering

Head rendering is the simplest and fastest render type in the API. It extracts
the 8x8 face region from a Minecraft skin texture, upscales it to the requested
size with nearest-neighbor interpolation, and optionally overlays the hat layer.
The entire pipeline uses **Sharp** -- no Jimp or Canvas involved.

---

## The Face Region

A Minecraft skin texture is a 64x64 (or 64x32 for legacy skins) PNG image. The
front face of the head occupies an **8x8 pixel region** starting at position
**(8, 8)** -- that is, column 8, row 8, extending 8 pixels wide and 8 pixels
tall.

```
Skin texture (64x64), head area detail:

     0   8  16  24  32  40  48  56  63
   +----+----+----+----+----+----+----+----+
 0 |    |Head|    |    |    |Hat |    |    |
   |    |Top |    |    |    |Top |    |    |
   +----+----+----+----+----+----+----+----+
 8 |Head|HEAD|Head|Head|Hat |HAT |Hat |Hat |
   |Rgt |FRNT|Left|Back|Rgt |FRNT|Left|Back|
   +----+----+----+----+----+----+----+----+
16 |    |    |    |    |    |    |    |    |
   ...

   Each cell is 8x8 pixels.
   HEAD FRONT = (8, 8) to (15, 15)
   HAT  FRONT = (40, 8) to (47, 15)
```

The `createHeadRender` function extracts exactly this region.

---

## Extraction and Resize

Sharp performs the extraction in a single chained call:

```js
const baseHead = await sharp(skinBuffer)
    .extract({ left: 8, top: 8, width: 8, height: 8 })
    .resize(size, size, { kernel: 'nearest' })
    .toBuffer();
```

Key details:

- **`extract`** crops the 8x8 face from the full skin buffer. This is a
  zero-copy operation in libvips -- it sets a viewport into the existing image
  data without allocating a new buffer for the cropped region.
- **`resize` with `kernel: 'nearest'`** performs nearest-neighbor upscaling. This
  is critical for preserving the blocky pixel-art look of Minecraft skins. Each
  original pixel becomes a solid square of `(size/8) x (size/8)` pixels. For
  example, at size 128, each skin pixel becomes a 16x16 block.
- **`toBuffer`** encodes the result as an in-memory PNG buffer.

No intermediate files are written to disk. The entire operation happens in
memory.

---

## The Hat (Overlay) Layer

Minecraft skins have a second layer that sits on top of the head. This overlay
layer is commonly used for hats, glasses, beards, hair, masks, or other
accessories. It is located at position **(40, 8)** on the skin texture -- the
same 8x8 dimensions as the base face but offset 32 pixels to the right.

When the `hat` option is `true`, the API extracts and composites this layer:

```js
if (hat) {
    const hatLayer = await sharp(skinBuffer)
        .extract({ left: 40, top: 8, width: 8, height: 8 })
        .resize(size, size, { kernel: 'nearest' })
        .toBuffer();

    image = image.composite([{ input: hatLayer }]);
}
```

The compositing uses Sharp's `composite` method, which alpha-blends the hat
layer on top of the base head. Transparent pixels in the hat layer show the base
head underneath; opaque pixels replace the base head pixels.

The hat layer is **the same physical size** as the base head after resizing, so
the overlay aligns pixel-for-pixel. In the actual Minecraft game, the hat layer
is rendered slightly larger than the head (1.125x) to create a floating effect,
but this API renders them at 1:1 for simplicity and consistency.

---

## Avatar Render (Jimp Alternative)

The API also provides `createAvatarRender`, which produces the same visual
result as a head render with hat but uses **Jimp** instead of Sharp:

```js
const head = skin.clone()
    .crop(8, 8, 8, 8)
    .resize(size, size, Jimp.RESIZE_NEAREST_NEIGHBOR);
avatar.composite(head, 0, 0);

const hat = skin.clone()
    .crop(40, 8, 8, 8)
    .resize(size, size, Jimp.RESIZE_NEAREST_NEIGHBOR);
avatar.composite(hat, 0, 0);
```

The avatar render always includes the hat layer (there is no option to disable
it). The hat extraction is wrapped in a try/catch that silently ignores failures,
which handles legacy skins that may not have a valid hat region.

---

## Output Format

Both head render functions return a **PNG buffer**. The output dimensions are:

- `createHeadRender`: `size x size` pixels.
- `createAvatarRender`: `size x size` pixels.

The default size is **128 px** when no size parameter is provided by the caller.

---

## Cache Behavior

Head renders are cached with the key format:

```
head_{input}_{size}_{option}
```

For example:
- `/head/Notch/256/hat` --> `head_Notch_256_hat`
- `/head/Notch/128` --> `head_Notch_128_default`

The cache TTL is 1 hour. On a cache hit, the PNG buffer is returned directly
from the database without touching Sharp, Mojang, or the skin texture at all.

---

## Performance Characteristics

Head rendering is the lightest operation in the API:

- **One HTTP request** to download the skin texture (or zero if the skin URL is
  already cached by the Mojang profile lookup).
- **Two Sharp operations** (extract + resize), or three if the hat layer is
  included.
- **No Canvas or Jimp overhead** -- Sharp's libvips backend is implemented in
  C++ and processes the 8x8 region in under 5 ms on typical hardware.
- **Small output size** -- an 8x8 region upscaled to 128 px compresses to
  roughly 500 bytes to 3 KB as PNG depending on the skin's color complexity.

---

## Endpoint Mapping

| Route | Function | Hat support |
| ----- | -------- | ----------- |
| `GET /head/:input/:size?/:option?` | `createHeadRender` | Yes (pass `hat` as option) |
| (internal, used by avatar route) | `createAvatarRender` | Always on |

The `/head` route is defined in `routes/head.js`. The avatar render is used
internally but the `/avatar` route actually calls `createIsometricBodyRender`
for a 3D isometric body, not the 2D `createAvatarRender`. The
`createAvatarRender` function exists as a utility for cases where a simple
2D head-with-hat is needed via Jimp instead of Sharp.
