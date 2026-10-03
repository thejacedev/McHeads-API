// MIT License
//
// Copyright (c) 2026 Jace Sleeman
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

const sharp = require('sharp');
const { createCanvas, Image } = require('canvas');

// Front faces for the flat body render, laid out on a 16x32 grid of skin pixels.
// `src` and `overlay` are texture coordinates in a 64-pixel-wide skin. Legacy
// 64x32 skins only store the right-hand limbs (and no body overlays except the
// hat), so the left limbs mirror `legacySrc`. Slim arms are 3px wide; `slimShift`
// moves the viewer-left arm so it stays attached to the torso.
const BODY_PARTS = [
    { dest: [4, 0, 8, 8], src: [8, 8], overlay: [40, 8], legacyOverlay: true },  // head
    { dest: [4, 8, 8, 12], src: [20, 20], overlay: [20, 36] },                    // torso
    { dest: [0, 8, 4, 12], src: [44, 20], overlay: [44, 36], arm: true, slimShift: 1 }, // right arm
    { dest: [12, 8, 4, 12], src: [36, 52], overlay: [52, 52], arm: true, legacySrc: [44, 20] }, // left arm
    { dest: [4, 20, 4, 12], src: [4, 20], overlay: [4, 36] },                     // right leg
    { dest: [8, 20, 4, 12], src: [20, 52], overlay: [4, 52], legacySrc: [4, 20] } // left leg
];

function skinFormat(width, height) {
    if (!width || (height !== width && height * 2 !== width)) {
        throw new Error(`Unsupported skin dimensions: ${width}x${height}`);
    }
    return { scale: width / 64, isNewFormat: height === width };
}

// Minecraft ignores the hat layer of a legacy 64x32 skin when the right half of
// the texture (x 32-64, y 0-32) has no transparent pixels: many old skins filled
// the unused hat area with a solid colour that never showed in game. Clears the
// hat layer in raw RGBA `data` in that case and reports whether it did.
function clearOpaqueLegacyHat(data, width, scale) {
    const alphaAt = (x, y) => (y * width + x) * 4 + 3;
    for (let y = 0; y < 32 * scale; y++) {
        for (let x = 32 * scale; x < 64 * scale; x++) {
            if (data[alphaAt(x, y)] < 128) return false;
        }
    }
    for (let y = 0; y < 16 * scale; y++) {
        for (let x = 32 * scale; x < 64 * scale; x++) {
            data[alphaAt(x, y)] = 0;
        }
    }
    return true;
}

// Decodes a skin to raw RGBA, applying the legacy hat rule above.
async function decodeSkin(skinBuffer) {
    const { data, info } = await sharp(skinBuffer)
        .ensureAlpha()
        .toColourspace('srgb')
        .raw()
        .toBuffer({ resolveWithObject: true });
    const format = skinFormat(info.width, info.height);
    const hatCleared = !format.isNewFormat && clearOpaqueLegacyHat(data, info.width, format.scale);
    return { data, width: info.width, height: info.height, ...format, hatCleared };
}

// The skin as a PNG with the legacy hat rule applied; the original buffer when
// nothing needed changing.
async function prepareSkin(skinBuffer) {
    const skin = await decodeSkin(skinBuffer);
    if (!skin.hatCleared) return skinBuffer;
    return sharp(skin.data, { raw: { width: skin.width, height: skin.height, channels: 4 } })
        .png()
        .toBuffer();
}

// Draws the RGBA pixel src[s] over dst[d] (source-over on straight alpha). Done by
// hand because premultiplied compositing loses precision on semi-transparent pixels.
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

async function createHeadRender(skinBuffer, size = 128, hat = false) {
    try {
        const skinPng = hat ? await prepareSkin(skinBuffer) : skinBuffer;
        const { width, height } = await sharp(skinPng).metadata();
        const { scale } = skinFormat(width, height);
        const face = (x, y) => sharp(skinPng)
            .extract({ left: x * scale, top: y * scale, width: 8 * scale, height: 8 * scale })
            .resize(size, size, { kernel: 'nearest' })
            .toBuffer();

        let image = sharp(await face(8, 8));
        if (hat) {
            image = image.composite([{ input: await face(40, 8) }]);
        }

        return await image.png().toBuffer();
    } catch (error) {
        throw new Error(`Failed to create head render: ${error.message}`);
    }
}

async function createBodyRender(skinBuffer, size = 128, hat = false, slim = false) {
    try {
        const { data: skin, width: skinWidth, scale, isNewFormat } = await decodeSkin(skinBuffer);
        const thinArms = slim && isNewFormat;

        // Rounding each edge (rather than each width) keeps parts flush at any size.
        const px = units => Math.round(units * size / 16);
        const outWidth = size;
        const outHeight = px(32);
        const out = Buffer.alloc(outWidth * outHeight * 4);

        // Nearest-neighbour scales the w x h texture region at (sx, sy) into dest.
        // Mirroring flips the scaled output, so a mirrored limb is an exact mirror
        // image of the original even when the scale factor isn't a whole number.
        const drawRegion = ([sx, sy], [x, y, w, h], mirror) => {
            const left = px(x);
            const top = px(y);
            const width = px(x + w) - left;
            const height = px(y + h) - top;
            const srcW = w * scale;
            const srcH = h * scale;

            for (let dy = 0; dy < height; dy++) {
                const v = sy * scale + Math.floor(dy * srcH / height);
                for (let dx = 0; dx < width; dx++) {
                    const u = Math.floor((mirror ? width - 1 - dx : dx) * srcW / width);
                    blendPixel(out, ((top + dy) * outWidth + left + dx) * 4, skin, (v * skinWidth + sx * scale + u) * 4);
                }
            }
        };

        for (const part of BODY_PARTS) {
            const dest = [...part.dest];
            if (part.arm && thinArms) {
                dest[0] += part.slimShift || 0;
                dest[2] = 3;
            }

            if (isNewFormat || !part.legacySrc) {
                drawRegion(part.src, dest, false);
            } else {
                drawRegion(part.legacySrc, dest, true);
            }
            if (hat && (isNewFormat || part.legacyOverlay)) {
                drawRegion(part.overlay, dest, false);
            }
        }

        return await sharp(out, { raw: { width: outWidth, height: outHeight, channels: 4 } })
            .png()
            .toBuffer();
    } catch (error) {
        throw new Error(`Failed to create body render: ${error.message}`);
    }
}

function loadImageFromBuffer(buffer) {
    const img = new Image();
    img.src = buffer;

    if (!img.width) {
        throw new Error('Failed to load skin image');
    }

    return img;
}

// Upscales the skin (nearest-neighbour) by powers of two until each 8px block is
// at least targetBlockSize wide, so the transformed faces stay sharp.
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

// Draws the source rectangle `src` of `img` as a dw x dh face under transform `matrix`.
function drawFace(ctx, img, matrix, src, [dw, dh]) {
    ctx.save();
    ctx.transform(...matrix);
    ctx.drawImage(img, ...src, 0, 0, dw, dh);
    ctx.restore();
}

// Shared by the isometric head and body renders: the head's three visible faces,
// the back faces that show through the hat edges, and the hat overlay.
function drawIsometricHead(ctx, img, { blockSize, hB, sB, w, h, baseOffsetL, baseOffsetT }) {
    const block = (x, y) => [x + 1, y + 1, blockSize - 2, blockSize - 2];

    drawFace(ctx, img, [-1, -0.5, 0, 1, baseOffsetL + w * 2 + sB * 0.667, baseOffsetT - sB * 0.334], block(blockSize * 6, blockSize), [w * 1.1, h * 1.1]);
    drawFace(ctx, img, [1, -0.5, 0, 1, baseOffsetL - w / 8 * 0.667, baseOffsetT - sB * 0.334], block(blockSize * 7, blockSize), [w * 1.1, h * 1.1]);
    drawFace(ctx, img, [1, -0.5, 0, 1, baseOffsetL + w, baseOffsetT + w * 0.5], block(blockSize, blockSize), [w, h]);
    drawFace(ctx, img, [1, 0.5, 0, 1, baseOffsetL + 0.5, baseOffsetT], block(0, blockSize), [w, h]);
    drawFace(ctx, img, [1, -0.5, 1, 0.5, baseOffsetL, baseOffsetT + 1], block(blockSize, 0), [w, w]);
    drawFace(ctx, img, [1, 0.5, 0, 1, baseOffsetL - w / 8 * 0.667, baseOffsetT - h / 8 * 0.3334 + 1], block(blockSize * 4, blockSize), [w * 1.1, h * 1.1]);
    drawFace(ctx, img, [1, -0.5, 0, 1, baseOffsetL + w, baseOffsetT + h * 0.4625], block(blockSize * 5, blockSize), [w * 1.1, h * 1.1]);
    drawFace(ctx, img, [1, -0.5, 1, 0.5, baseOffsetL - sB / 1.75 - 1.5, baseOffsetT - sB / 4], block(hB * 10, 0), [w * 1.1 + 0.5, w * 1.1 + 0.5]);
}

async function createIsometricHeadRender(skinBuffer, size = 128, direction = 'right') {
    try {
        const skinImage = loadImageFromBuffer(await prepareSkin(skinBuffer));

        let side = 60;
        const targetSide = size / 2.175; // reverse of rectSize calculation
        while (side < targetSide) {
            side *= 2;
        }
        if (side < 120) side = 120;

        const img = generateScaledSkin(skinImage, side);
        const blockSize = img.width / 8;
        const hB = blockSize / 2;
        const sB = blockSize / 8;

        const rectSize = side * 2.175;
        const canvas = createCanvas(rectSize, rectSize);
        const ctx = canvas.getContext('2d');

        ctx.imageSmoothingEnabled = false;

        if (direction === 'left') {
            ctx.translate(rectSize, 0);
            ctx.scale(-1, 1);
        }

        drawIsometricHead(ctx, img, {
            blockSize, hB, sB,
            w: side * 0.9,
            h: side,
            baseOffsetL: side / 8,
            baseOffsetT: side / 2 + sB / 2
        });

        return await sharp(canvas.toBuffer('image/png'))
            .resize(size, size, { kernel: 'lanczos3' })
            .png()
            .toBuffer();
    } catch (error) {
        throw new Error(`Failed to create isometric head render: ${error.message}`);
    }
}

async function createIsometricBodyRender(skinBuffer, size = 128, direction = 'right', slim = false) {
    try {
        const skinImage = loadImageFromBuffer(await prepareSkin(skinBuffer));
        const isNewFormat = skinImage.height === skinImage.width;

        let side = 60;
        const targetSide = size / 2.5; // reverse of rectWidth calculation
        while (side < targetSide) {
            side *= 2;
        }
        if (side < 120) side = 120;

        const img = generateScaledSkin(skinImage, side);
        const blockSize = img.width / 8;
        const hB = blockSize / 2;
        const sB = blockSize / 8;

        const [rectWidth, rectHeight] = [side * 2.5, side * 5.1];
        const canvas = createCanvas(rectWidth, rectHeight);
        const ctx = canvas.getContext('2d');

        ctx.imageSmoothingEnabled = false;

        const w = side * 0.9;
        const h = side;
        const baseOffsetL = side * 0.25;
        const baseOffsetT = side * 0.55;

        // Slim arms are 3px wide instead of 4. The far arm keeps its torso-side
        // edge; the near arm slides 1px along its front face toward the torso.
        const thinArms = slim && isNewFormat;
        const armSrcW = thinArms ? hB * 0.75 : hB;
        const armW = thinArms ? (w / 2) * 0.75 : w / 2;
        const shift = thinArms ? w / 8 : 0;
        const near = (x, y) => [x + shift, y - shift / 2];

        if (direction === 'left') {
            ctx.translate(rectWidth, 0);
            ctx.scale(-1, 1);
        }

        // Right leg front
        drawFace(ctx, img, [1, -0.5, 0, 1, baseOffsetL + side * 6 / 8, baseOffsetT + side * 23 / 8 - 1 - sB / 16], [hB + 1, hB * 5 + 1, hB - 2, hB * 3 - 2], [w / 2, h * 1.5]);

        // Left leg front (mirrored right leg on legacy skins) and its overlay
        if (!isNewFormat) {
            drawFace(ctx, img, [-1, 0.5, 0, 1, baseOffsetL + side * 13 / 8 + sB / 7, baseOffsetT + side * 19 / 8 + sB / 3 - 0.5 - sB / 16], [hB, hB * 5 + 1, hB - 2, hB * 3 - 2], [w / 2, h * 1.5]);
        } else {
            drawFace(ctx, img, [1, -0.5, 0, 1, baseOffsetL + side * 9 / 8 + sB / 2, baseOffsetT + side * 21 / 8 + sB / 8 - sB / 16], [hB * 5 + 1, hB * 13 + 1, hB - 2, hB * 3 - 2], [w / 2, h * 1.5]);
            drawFace(ctx, img, [1, -0.5, 0, 1, baseOffsetL + side * 9 / 8 + sB / 2, baseOffsetT + side * 21 / 8 - sB / 8], [hB + 1, hB * 13 + 1, hB - 2, hB * 3 - 2], [(w / 2) * 1.1, (h * 1.5) * 1.1]);
        }

        // Right leg side
        drawFace(ctx, img, [1, 0.5, 0, 1, baseOffsetL + side * 2 / 8 + sB / 2, baseOffsetT + side * 21 / 8 + sB / 8 - sB / 16], [1, hB * 5 + 1, hB - 2, hB * 3 - 2], [w / 2, h * 1.5]);

        // Right leg overlay
        if (isNewFormat) {
            drawFace(ctx, img, [1, -0.5, 0, 1, baseOffsetL + side * 6 / 8 - 1, baseOffsetT + side * 23 / 8 - sB / 4], [hB + 1, hB * 9 + 1, hB - 2, hB * 3 - 2], [(w / 2) * 1.1, (h * 1.5) * 1.1]);
            drawFace(ctx, img, [1, 0.5, 0, 1, baseOffsetL + side * 2 / 8, baseOffsetT + side * 21 / 8 - sB / 4], [1, hB * 9 + 1, hB - 2, hB * 3 - 2], [(w / 2) * 1.1, (h * 1.5) * 1.1]);
        }

        // Far (left) arm: front and top, plus overlay on 64x64 skins
        if (!isNewFormat) {
            drawFace(ctx, img, [-1, 0.5, 0, 1, baseOffsetL + (side * 16.75 / 8) - sB / 16, baseOffsetT + (side * 6 / 8) - sB / 4], [hB * 11 + 1, hB * 5 + 1, hB - 2, hB * 3 - 2], [w * 0.5, h * 1.5]);
            drawFace(ctx, img, [1, 0.5, -1, 0.5, baseOffsetL + (side * 13 / 8) + sB / 8, baseOffsetT + (side * 4 / 8)], [hB * 11 + 1, hB * 4 + 1, sB * 3 - 2, hB - 2], [w / 2, w / 2]);
        } else {
            drawFace(ctx, img, [1, -0.5, 0, 1, baseOffsetL + (side * 13 / 8) + sB / 8 - sB / 16, baseOffsetT + (side * 7.5 / 8)], [hB * 9 + 1, hB * 13 + 1, armSrcW - 2, hB * 3 - 2], [armW, h * 1.5]);
            drawFace(ctx, img, [1, -0.5, 1, 0.5, baseOffsetL + (side * 10 / 8) - sB / 2.5, baseOffsetT + (side * 6 / 8) - sB / 4], [hB * 9 + 1, hB * 12 + 1, armSrcW - 2, hB - 2], [armW, w / 2]);
            drawFace(ctx, img, [1, -0.5, 0, 1, baseOffsetL + (side * 13 / 8) + sB / 8, baseOffsetT + (side * 7.5 / 8) - sB * 0.667], [hB * 13 + 1, hB * 13 + 1, armSrcW - 2, hB * 3 - 2], [armW * 1.1, (h * 1.5) * 1.1]);
            drawFace(ctx, img, [1, -0.5, 1, 0.5, baseOffsetL + (side * 9 / 8) + sB / 8, baseOffsetT + (side * 5 / 8) - sB / 8], [hB * 13 + 1, hB * 12 + 1, armSrcW - 2, hB - 2], [armW * 1.1, (w / 2) * 1.1]);
        }

        // Torso front and side
        drawFace(ctx, img, [1, -0.5, 0, 1, baseOffsetL + side * 0.75, baseOffsetT + side * 11 / 8], [hB * 5 + 1, hB * 5 + 1, hB * 2 - 2, hB * 3 - 2], [w, h * 1.5]);
        drawFace(ctx, img, [1, 0.5, 0, 1, baseOffsetL + side * 0.25 + sB / 2, baseOffsetT + side * 9.180 / 8], [hB * 4 + 1, hB * 5 + 1, hB - 2, hB * 3 - 2], [w / 2, h * 1.5]);

        // Torso overlay
        if (isNewFormat) {
            drawFace(ctx, img, [1, -0.5, 0, 1, baseOffsetL + side * 0.75, baseOffsetT + side * 11 / 8 - sB / 2], [hB * 5 + 1, hB * 9 + 1, hB * 2 - 2, hB * 3 - 2], [w * 1.1, h * 1.65]);
            drawFace(ctx, img, [1, 0.5, 0, 1, baseOffsetL + side * 0.25 + sB / 8, baseOffsetT + side * 9 / 8 - sB / 2], [hB * 4 + 1, hB * 9 + 1, hB - 2, hB * 3 - 2], [w * 0.55, h * 1.65]);
        }

        // Near (right) arm: outer side, front and top
        drawFace(ctx, img, [1, 0.5, 0, 1, ...near(baseOffsetL - (side * 0.25) + sB / 2 + sB / 16, baseOffsetT + side * 11 / 8 + sB / 4)], [hB * 10 + 1, hB * 5 + 1, hB - 2, hB * 3 - 2], [w / 2, h * 1.5]);
        drawFace(ctx, img, [1, -0.5, 0, 1, ...near(baseOffsetL + (side * 0.25) + sB / 8, baseOffsetT + (side * 13 / 8))], [hB * 11 + 1, hB * 5 + 1, armSrcW - 2, hB * 3 - 2], [armW, h * 1.5]);
        drawFace(ctx, img, [1, -0.5, 1, 0.5, ...near(baseOffsetL - (side * 1.5 / 8), baseOffsetT + (side * 11 / 8) + sB / 4 + 1)], [hB * 11 + 1, hB * 4 + 1, armSrcW - 2, hB - 2], [armW, w / 2]);

        // Near arm overlay
        if (isNewFormat) {
            drawFace(ctx, img, [1, 0.5, 0, 1, ...near(baseOffsetL - (side * 0.25) + sB / 2 - w / 8 * 0.3344, baseOffsetT + side * 10 / 8 + sB / 4 + 1)], [hB * 10 + 1, hB * 9 + 1, hB - 2, hB * 3 - 2], [(w * 1.1) / 2, (h * 1.1) * 1.5]);
            drawFace(ctx, img, [1, -0.5, 0, 1, ...near(baseOffsetL + (side * 0.25) + sB / 8, baseOffsetT + (side * 13 / 8) - sB * 0.75)], [hB * 11 + 1, hB * 9 + 1, armSrcW - 2, hB * 3 - 2], [armW * 1.1, (h * 1.5) * 1.1]);
            drawFace(ctx, img, [1, -0.5, 1, 0.5, ...near(baseOffsetL - (side * 1.5 / 8) - (sB * 0.25), baseOffsetT + (side * 11 / 8) - (sB * 0.667) + 1)], [hB * 11 + 1, hB * 8 + 1, armSrcW - 2, hB - 2], [armW * 1.1, (w / 2) * 1.1]);
        }

        drawIsometricHead(ctx, img, { blockSize, hB, sB, w, h, baseOffsetL, baseOffsetT });

        const outputHeight = Math.round(size * (rectHeight / rectWidth));

        return await sharp(canvas.toBuffer('image/png'))
            .resize(size, outputHeight, { kernel: 'lanczos3' })
            .png()
            .toBuffer();
    } catch (error) {
        throw new Error(`Failed to create isometric body render: ${error.message}`);
    }
}

module.exports = {
    createHeadRender,
    createBodyRender,
    createIsometricHeadRender,
    createIsometricBodyRender
};
