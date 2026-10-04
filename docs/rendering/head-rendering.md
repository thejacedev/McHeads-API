---
order: 2
title: Head Rendering
---

# Head Rendering

Head rendering is the simplest and fastest render type in the API. It extracts
the 8x8 face region from a Minecraft skin texture, upscales it to the requested
size with nearest-neighbor interpolation, and optionally overlays the hat layer.
The entire pipeline uses **Sharp** -- no Canvas involved. The function,
`createHeadRender(skinBuffer, size, hat)`, receives the skin PNG as a buffer;
the skin is fetched beforehand by `getSkinImage`.

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

Sharp performs the extraction in a single chained call. A small helper extracts
any 8x8 face, scaling the coordinates by `width / 64` so HD skins work too:

```js
const { width, height } = await sharp(skinBuffer).metadata();
const { scale } = skinFormat(width, height);
const face = (x, y) => sharp(skinBuffer)
    .extract({ left: x * scale, top: y * scale, width: 8 * scale, height: 8 * scale })
    .resize(size, size, { kernel: 'nearest' })
    .toBuffer();

let image = sharp(await face(8, 8));
```

`skinFormat` rejects images that are neither square nor 2:1, which makes the
request fail with HTTP 500.

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
    image = image.composite([{ input: await face(40, 8) }]);
}

return await image.png().toBuffer();
```

The hat region exists in legacy 64x32 skins as well, so `hat` works for every
skin. Like Minecraft, the renderer ignores a legacy skin's hat layer when the
right half of the texture (x 32-64, y 0-32) has no transparent pixels, because
old skins often filled that area with solid colour. `prepareSkin` applies this
before the hat is composited (see [Skin Format](../reference/skin-format.md)).

The compositing uses Sharp's `composite` method, which alpha-blends the hat
layer on top of the base head. Transparent pixels in the hat layer show the base
head underneath; opaque pixels replace the base head pixels.

The hat layer is **the same physical size** as the base head after resizing, so
the overlay aligns pixel-for-pixel. In the actual Minecraft game, the hat layer
is rendered slightly larger than the head (1.125x) to create a floating effect,
but this API renders them at 1:1 for simplicity and consistency.

---

## Output Format

`createHeadRender` returns a **PNG buffer** of `size x size` pixels.

The default size is **128 px** when no size parameter is provided by the caller.
The route clamps other sizes to the range 8–512.

---

## Cache Behavior

Head renders are cached with the key format:

```
head:{playerId}:{size}:{hat|nohat}
```

For example:
- `/head/Notch/256/hat` --> `head:name:notch:256:hat`
- `/head/Notch/128` and `/head/Notch` --> `head:name:notch:128:nohat`

The cache TTL is 1 hour. On a cache hit, the PNG buffer is returned directly
from the database without touching Sharp, Mojang, or the skin texture at all.

---

## Performance Characteristics

Head rendering is the lightest operation in the API:

- **One HTTP request** to download the skin texture (or zero if the skin is
  already in the in-memory skin cache), after the player lookup (which is itself
  cached in memory for 30 minutes).
- **Two Sharp operations** (extract + resize), or three if the hat layer is
  included.
- **No Canvas overhead** -- Sharp's libvips backend is implemented in
  C++ and processes the 8x8 region in under 5 ms on typical hardware.
- **Small output size** -- an 8x8 region upscaled to 128 px compresses to
  roughly 500 bytes to 3 KB as PNG depending on the skin's color complexity.

---

## Endpoint Mapping

| Route | Function | Hat support |
| ----- | -------- | ----------- |
| `GET /head/:input/:size?/:option?` | `createHeadRender` | Yes (pass `hat` as option) |

The `/head` route is defined in `routes/head.js`. (The `/avatar` route renders
a 3D isometric body with `createIsometricBodyRender`; see
[Isometric Rendering](isometric-rendering.md).)
