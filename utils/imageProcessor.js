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

const axios = require('axios');
const sharp = require('sharp');
const Jimp = require('jimp');
const { createCanvas, Image } = require('canvas');

async function createHeadRender(skinUrl, size = 128, hat = false) {
    try {
        const skinResponse = await axios.get(skinUrl, { responseType: 'arraybuffer' });
        const skinBuffer = Buffer.from(skinResponse.data);

        const baseHead = await sharp(skinBuffer)
            .extract({ left: 8, top: 8, width: 8, height: 8 })
            .resize(size, size, { kernel: 'nearest' })
            .toBuffer();

        let image = sharp(baseHead);

        if (hat) {
            const hatLayer = await sharp(skinBuffer)
                .extract({ left: 40, top: 8, width: 8, height: 8 })
                .resize(size, size, { kernel: 'nearest' })
                .toBuffer();

            image = image.composite([{ input: hatLayer }]);
        }

        return await image
            .png()
            .toBuffer();
    } catch (error) {
        throw new Error(`Failed to create head render: ${error.message}`);
    }
}

async function createAvatarRender(skinUrl, size = 128) {
    try {
        const skinResponse = await axios.get(skinUrl, { responseType: 'arraybuffer' });
        const skinBuffer = Buffer.from(skinResponse.data);

        const skin = await Jimp.read(skinBuffer);

        const avatar = new Jimp(size, size);

        const head = skin.clone().crop(8, 8, 8, 8).resize(size, size, Jimp.RESIZE_NEAREST_NEIGHBOR);
        avatar.composite(head, 0, 0);

        try {
            const hat = skin.clone().crop(40, 8, 8, 8).resize(size, size, Jimp.RESIZE_NEAREST_NEIGHBOR);
            avatar.composite(hat, 0, 0);
        } catch (hatError) {
        }

        return await avatar.getBufferAsync(Jimp.MIME_PNG);
    } catch (error) {
        throw new Error(`Failed to create avatar render: ${error.message}`);
    }
}

async function createBodyRender(skinUrl, size = 128) {
    try {
        const skinResponse = await axios.get(skinUrl, { responseType: 'arraybuffer' });
        const skinBuffer = Buffer.from(skinResponse.data);

        const skin = await Jimp.read(skinBuffer);

        const isNewFormat = skin.bitmap.height >= 64;

        const body = new Jimp(size, size * 2);

        const head = skin.clone().crop(8, 8, 8, 8).resize(size/2, size/2, Jimp.RESIZE_NEAREST_NEIGHBOR);
        body.composite(head, size/4, 0);

        const torso = skin.clone().crop(20, 20, 8, 12).resize(size/2, size*3/4, Jimp.RESIZE_NEAREST_NEIGHBOR);
        body.composite(torso, size/4, size/2);

        const leftArm = skin.clone().crop(44, 20, 4, 12).resize(size/4, size*3/4, Jimp.RESIZE_NEAREST_NEIGHBOR);
        body.composite(leftArm, 0, size/2);

        let rightArm;
        if (isNewFormat) {
            rightArm = skin.clone().crop(36, 52, 4, 12).resize(size/4, size*3/4, Jimp.RESIZE_NEAREST_NEIGHBOR);
        } else {
            rightArm = leftArm.clone().flip(true, false);
        }
        body.composite(rightArm, size*3/4, size/2);

        const leftLeg = skin.clone().crop(4, 20, 4, 12).resize(size/4, size*3/4, Jimp.RESIZE_NEAREST_NEIGHBOR);
        body.composite(leftLeg, size/4, size*5/4);

        let rightLeg;
        if (isNewFormat) {
            rightLeg = skin.clone().crop(20, 52, 4, 12).resize(size/4, size*3/4, Jimp.RESIZE_NEAREST_NEIGHBOR);
        } else {
            rightLeg = leftLeg.clone().flip(true, false);
        }
        body.composite(rightLeg, size/2, size*5/4);

        return await body.getBufferAsync(Jimp.MIME_PNG);
    } catch (error) {
        throw new Error(`Failed to create body render: ${error.message}`);
    }
}

async function getRawSkin(skinUrl) {
    try {
        const skinResponse = await axios.get(skinUrl, { responseType: 'arraybuffer' });
        return Buffer.from(skinResponse.data);
    } catch (error) {
        throw new Error(`Failed to get raw skin: ${error.message}`);
    }
}

function loadImageFromBuffer(buffer) {
    const img = new Image();
    const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`;
    img.src = dataUrl;

    if (!img.width || typeof img.width !== 'number' || img.width === 0) {
        throw new Error(`Failed to load skin image: width=${img.width}`);
    }

    return img;
}

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

    const tmpImg = new Image();
    tmpImg.src = tmpCanvas.toBuffer('image/png');

    return tmpImg;
}

async function createIsometricHeadRender(skinUrl, size = 128, direction = 'right') {
    console.log(`[IsometricHead] START - skinUrl: ${skinUrl}, size: ${size}, direction: ${direction}`);
    try {
        const skinResponse = await axios.get(skinUrl, { responseType: 'arraybuffer' });
        console.log(`[IsometricHead] Fetched skin, buffer length: ${skinResponse.data.byteLength}`);
        const skinBuffer = Buffer.from(skinResponse.data);
        const skinImage = loadImageFromBuffer(skinBuffer);

        console.log(`[IsometricHead] Skin loaded: ${skinImage.width}x${skinImage.height}`);

        let side = 60;
        const targetSide = size / 2.175; // reverse of rectSize calculation
        while (side < targetSide) {
            side *= 2;
        }
        if (side < 120) side = 120;

        const img = generateScaledSkin(skinImage, side);
        const blockSize = img.width / 8;

        console.log(`[IsometricHead] Scaled skin: ${img.width}x${img.height}, blockSize=${blockSize}`);
        const hB = blockSize / 2;
        const sB = blockSize / 8;

        const [rectWidth, rectHeight] = [side * 2.175, side * 2.175];
        const tmpCanvas = createCanvas(rectWidth, rectHeight);
        const ctx = tmpCanvas.getContext('2d');

        ctx.imageSmoothingEnabled = false;

        const baseOffsetL = side / 8;
        const baseOffsetT = side / 2 + sB / 2;
        const w = side * 0.9;
        const h = side;

        ctx.clearRect(0, 0, tmpCanvas.width, tmpCanvas.height);

        if (direction === 'left') {
            ctx.translate(rectWidth, 0);
            ctx.scale(-1, 1);
        }

        ctx.save();
        ctx.transform(-1, -0.5, 0, 1, baseOffsetL + w * 2 + sB * 0.667, baseOffsetT - sB * 0.334);
        ctx.drawImage(img, blockSize * 6 + 1, blockSize + 1, blockSize - 2, blockSize - 2, 0, 0, w * 1.1, h * 1.1);
        ctx.restore();

        ctx.save();
        ctx.transform(1, -0.5, 0, 1, baseOffsetL - w / 8 * 0.667, baseOffsetT - sB * 0.334);
        ctx.drawImage(img, blockSize * 7 + 1, blockSize + 1, blockSize - 2, blockSize - 2, 0, 0, w * 1.1, h * 1.1);
        ctx.restore();

        ctx.save();
        ctx.transform(1, -0.5, 0, 1, baseOffsetL + w, baseOffsetT + w * 0.5);
        ctx.drawImage(img, blockSize + 1, blockSize + 1, blockSize - 2, blockSize - 2, 0, 0, w, h);
        ctx.restore();

        ctx.save();
        ctx.transform(1, 0.5, 0, 1, baseOffsetL + 0.5, baseOffsetT);
        ctx.drawImage(img, 1, blockSize + 1, blockSize - 2, blockSize - 2, 0, 0, w, h);
        ctx.restore();

        ctx.save();
        ctx.transform(1, -0.5, 1, 0.5, baseOffsetL, baseOffsetT + 1);
        ctx.drawImage(img, blockSize + 1, 1, blockSize - 2, blockSize - 2, 0, 0, w, w);
        ctx.restore();

        ctx.save();
        ctx.transform(1, 0.5, 0, 1, baseOffsetL - w / 8 * 0.667, baseOffsetT - h / 8 * 0.3334 + 1);
        ctx.drawImage(img, blockSize * 4 + 1, blockSize + 1, blockSize - 2, blockSize - 2, 0, 0, w * 1.1, h * 1.1);
        ctx.restore();

        ctx.save();
        ctx.transform(1, -0.5, 0, 1, baseOffsetL + w, baseOffsetT + h * 0.4625);
        ctx.drawImage(img, blockSize * 5 + 1, blockSize + 1, blockSize - 2, blockSize - 2, 0, 0, w * 1.1, h * 1.1);
        ctx.restore();

        ctx.save();
        ctx.transform(1, -0.5, 1, 0.5, baseOffsetL - sB / 1.75 - 1.5, baseOffsetT - sB / 4);
        ctx.drawImage(img, hB * 10 + 1, 1, blockSize - 2, blockSize - 2, 0, 0, w * 1.1 + 0.5, w * 1.1 + 0.5);
        ctx.restore();

        const rawBuffer = tmpCanvas.toBuffer('image/png');
        const scaledBuffer = await sharp(rawBuffer)
            .resize(size, size, { kernel: 'lanczos3' })
            .png()
            .toBuffer();

        return scaledBuffer;
    } catch (error) {
        throw new Error(`Failed to create isometric head render: ${error.message}`);
    }
}

async function createIsometricBodyRender(skinUrl, size = 128, direction = 'right') {
    try {
        const skinResponse = await axios.get(skinUrl, { responseType: 'arraybuffer' });
        const skinBuffer = Buffer.from(skinResponse.data);
        const skinImage = loadImageFromBuffer(skinBuffer);

        const isNewFormat = skinImage.height === skinImage.width;
        const isAlex = false; // Could be detected or passed as parameter

        let side = 60;
        const targetSide = size / 2.5; // reverse of rectWidth calculation
        while (side < targetSide) {
            side *= 2;
        }
        if (side < 120) side = 120;

        const scaledSkin = generateScaledSkin(skinImage, side);
        const blockSize = scaledSkin.width / 8;
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

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (direction === 'left') {
            ctx.translate(rectWidth, 0);
            ctx.scale(-1, 1);
        }

        ctx.save();
        ctx.transform(1, -0.5, 0, 1, baseOffsetL + side * 6 / 8, baseOffsetT + side * 23 / 8 - 1 - sB / 16);
        ctx.drawImage(scaledSkin, hB + 1, hB * 5 + 1, hB - 2, hB * 3 - 2, 0, 0, w / 2, h * 1.5);
        ctx.restore();

        if (!isNewFormat) {
            ctx.save();
            ctx.transform(-1, 0.5, 0, 1, baseOffsetL + side * 13 / 8 + sB / 7, baseOffsetT + side * 19 / 8 + sB / 3 - 0.5 - sB / 16);
            ctx.drawImage(scaledSkin, hB, hB * 5 + 1, hB - 2, hB * 3 - 2, 0, 0, w / 2, h * 1.5);
            ctx.restore();
        } else {
            ctx.save();
            ctx.transform(1, -0.5, 0, 1, baseOffsetL + side * 9 / 8 + sB / 2, baseOffsetT + side * 21 / 8 + sB / 8 - sB / 16);
            ctx.drawImage(scaledSkin, hB * 5 + 1, hB * 13 + 1, hB - 2, hB * 3 - 2, 0, 0, w / 2, h * 1.5);
            ctx.restore();

            ctx.save();
            ctx.transform(1, -0.5, 0, 1, baseOffsetL + side * 9 / 8 + sB / 2, baseOffsetT + side * 21 / 8 - sB / 8);
            ctx.drawImage(scaledSkin, hB + 1, hB * 13 + 1, hB - 2, hB * 3 - 2, 0, 0, (w / 2) * 1.1, (h * 1.5) * 1.1);
            ctx.restore();
        }

        ctx.save();
        ctx.transform(1, 0.5, 0, 1, baseOffsetL + side * 2 / 8 + sB / 2, baseOffsetT + side * 21 / 8 + sB / 8 - sB / 16);
        ctx.drawImage(scaledSkin, 1, hB * 5 + 1, hB - 2, hB * 3 - 2, 0, 0, w / 2, h * 1.5);
        ctx.restore();

        if (isNewFormat) {
            ctx.save();
            ctx.transform(1, -0.5, 0, 1, baseOffsetL + side * 6 / 8 - 1, baseOffsetT + side * 23 / 8 - sB / 4);
            ctx.drawImage(scaledSkin, hB + 1, hB * 9 + 1, hB - 2, hB * 3 - 2, 0, 0, (w / 2) * 1.1, (h * 1.5) * 1.1);
            ctx.restore();

            ctx.save();
            ctx.transform(1, 0.5, 0, 1, baseOffsetL + side * 2 / 8, baseOffsetT + side * 21 / 8 - sB / 4);
            ctx.drawImage(scaledSkin, 1, hB * 9 + 1, hB - 2, hB * 3 - 2, 0, 0, (w / 2) * 1.1, (h * 1.5) * 1.1);
            ctx.restore();
        }

        if (!isNewFormat) {
            ctx.save();
            ctx.transform(-1, 0.5, 0, 1, baseOffsetL + (side * 16.75 / 8) - sB / 16, baseOffsetT + (side * 6 / 8) - sB / 4);
            ctx.drawImage(scaledSkin, hB * 11 + 1, hB * 5 + 1, hB - 2, hB * 3 - 2, 0, 0, w * 0.5, h * 1.5);
            ctx.restore();

            ctx.save();
            ctx.transform(1, 0.5, -1, 0.5, baseOffsetL + (side * 13 / 8) + sB / 8, baseOffsetT + (side * 4 / 8));
            ctx.drawImage(scaledSkin, hB * 11 + 1, hB * 4 + 1, sB * 3 - 2, hB - 2, 0, 0, w / 2, w / 2);
            ctx.restore();
        } else {
            ctx.save();
            ctx.transform(1, -0.5, 0, 1, baseOffsetL + (side * 13 / 8) + sB / 8 - sB / 16, baseOffsetT + (side * 7.5 / 8));
            ctx.drawImage(scaledSkin, hB * 9 + 1, hB * 13 + 1, hB - 2, hB * 3 - 2, 0, 0, w / 2, h * 1.5);
            ctx.restore();

            ctx.save();
            ctx.transform(1, -0.5, 1, 0.5, baseOffsetL + (side * 10 / 8) - sB / 2.5, baseOffsetT + (side * 6 / 8) - sB / 4);
            ctx.drawImage(scaledSkin, hB * 9 + 1, hB * 12 + 1, hB - 2, hB - 2, 0, 0, w / 2, w / 2);
            ctx.restore();

            ctx.save();
            ctx.transform(1, -0.5, 0, 1, baseOffsetL + (side * 13 / 8) + sB / 8, baseOffsetT + (side * 7.5 / 8) - sB * 0.667);
            ctx.drawImage(scaledSkin, hB * 13 + 1, hB * 13 + 1, hB - 2, hB * 3 - 2, 0, 0, (w / 2) * 1.1, (h * 1.5) * 1.1);
            ctx.restore();

            ctx.save();
            ctx.transform(1, -0.5, 1, 0.5, baseOffsetL + (side * 9 / 8) + sB / 8, baseOffsetT + (side * 5 / 8) - sB / 8);
            ctx.drawImage(scaledSkin, hB * 13 + 1, hB * 12 + 1, hB - 2, hB - 2, 0, 0, (w / 2) * 1.1, (w / 2) * 1.1);
            ctx.restore();
        }

        ctx.save();
        ctx.transform(1, -0.5, 0, 1, baseOffsetL + side * 0.75, baseOffsetT + side * 11 / 8);
        ctx.drawImage(scaledSkin, hB * 5 + 1, hB * 5 + 1, hB * 2 - 2, hB * 3 - 2, 0, 0, w, h * 1.5);
        ctx.restore();

        ctx.save();
        ctx.transform(1, 0.5, 0, 1, baseOffsetL + side * 0.25 + sB / 2, baseOffsetT + side * 9.180 / 8);
        ctx.drawImage(scaledSkin, hB * 4 + 1, hB * 5 + 1, hB - 2, hB * 3 - 2, 0, 0, w / 2, h * 1.5);
        ctx.restore();

        if (isNewFormat) {
            ctx.save();
            ctx.transform(1, -0.5, 0, 1, baseOffsetL + side * 0.75, baseOffsetT + side * 11 / 8 - sB / 2);
            ctx.drawImage(scaledSkin, hB * 5 + 1, hB * 9 + 1, hB * 2 - 2, hB * 3 - 2, 0, 0, w * 1.1, h * 1.65);
            ctx.restore();

            ctx.save();
            ctx.transform(1, 0.5, 0, 1, baseOffsetL + side * 0.25 + sB / 8, baseOffsetT + side * 9 / 8 - sB / 2);
            ctx.drawImage(scaledSkin, hB * 4 + 1, hB * 9 + 1, hB - 2, hB * 3 - 2, 0, 0, w * 0.55, h * 1.65);
            ctx.restore();
        }

        ctx.save();
        ctx.transform(1, 0.5, 0, 1, baseOffsetL - (side * 0.25) + sB / 2 + sB / 16, baseOffsetT + side * 11 / 8 + sB / 4);
        ctx.drawImage(scaledSkin, hB * 10 + 1, hB * 5 + 1, hB - 2, hB * 3 - 2, 0, 0, w / 2, h * 1.5);
        ctx.restore();

        ctx.save();
        ctx.transform(1, -0.5, 0, 1, baseOffsetL + (side * 0.25) + sB / 8, baseOffsetT + (side * 13 / 8));
        ctx.drawImage(scaledSkin, hB * 11 + 1, hB * 5 + 1, hB - 2, hB * 3 - 2, 0, 0, w / 2, h * 1.5);
        ctx.restore();

        ctx.save();
        ctx.transform(1, -0.5, 1, 0.5, baseOffsetL - (side * 1.5 / 8), baseOffsetT + (side * 11 / 8) + sB / 4 + 1);
        ctx.drawImage(scaledSkin, hB * 11 + 1, hB * 4 + 1, hB - 2, hB - 2, 0, 0, w / 2, w / 2);
        ctx.restore();

        if (isNewFormat) {
            ctx.save();
            ctx.transform(1, 0.5, 0, 1, baseOffsetL - (side * 0.25) + sB / 2 - w / 8 * 0.3344, baseOffsetT + side * 10 / 8 + sB / 4 + 1);
            ctx.drawImage(scaledSkin, hB * 10 + 1, hB * 9 + 1, hB - 2, hB * 3 - 2, 0, 0, (w * 1.1) / 2, (h * 1.1) * 1.5);
            ctx.restore();

            ctx.save();
            ctx.transform(1, -0.5, 0, 1, baseOffsetL + (side * 0.25) + sB / 8, baseOffsetT + (side * 13 / 8) - sB * 0.75);
            ctx.drawImage(scaledSkin, hB * 11 + 1, hB * 9 + 1, hB - 2, hB * 3 - 2, 0, 0, (w / 2) * 1.1, (h * 1.5) * 1.1);
            ctx.restore();

            ctx.save();
            ctx.transform(1, -0.5, 1, 0.5, baseOffsetL - (side * 1.5 / 8) - (sB * 0.25), baseOffsetT + (side * 11 / 8) - (sB * 0.667) + 1);
            ctx.drawImage(scaledSkin, hB * 11 + 1, hB * 8 + 1, hB - 2, hB - 2, 0, 0, (w / 2) * 1.1, (w / 2) * 1.1);
            ctx.restore();
        }

        ctx.save();
        ctx.transform(-1, -0.5, 0, 1, baseOffsetL + w * 2 + sB * 0.667, baseOffsetT - sB * 0.334);
        ctx.drawImage(scaledSkin, blockSize * 6 + 1, blockSize + 1, blockSize - 2, blockSize - 2, 0, 0, w * 1.1, h * 1.1);
        ctx.restore();

        ctx.save();
        ctx.transform(1, -0.5, 0, 1, baseOffsetL - w / 8 * 0.667, baseOffsetT - sB * 0.334);
        ctx.drawImage(scaledSkin, blockSize * 7 + 1, blockSize + 1, blockSize - 2, blockSize - 2, 0, 0, w * 1.1, h * 1.1);
        ctx.restore();

        ctx.save();
        ctx.transform(1, -0.5, 0, 1, baseOffsetL + w, baseOffsetT + w * 0.5);
        ctx.drawImage(scaledSkin, blockSize + 1, blockSize + 1, blockSize - 2, blockSize - 2, 0, 0, w, h);
        ctx.restore();

        ctx.save();
        ctx.transform(1, 0.5, 0, 1, baseOffsetL + 0.5, baseOffsetT);
        ctx.drawImage(scaledSkin, 1, blockSize + 1, blockSize - 2, blockSize - 2, 0, 0, w, h);
        ctx.restore();

        ctx.save();
        ctx.transform(1, -0.5, 1, 0.5, baseOffsetL, baseOffsetT + 1);
        ctx.drawImage(scaledSkin, blockSize + 1, 1, blockSize - 2, blockSize - 2, 0, 0, w, w);
        ctx.restore();

        ctx.save();
        ctx.transform(1, 0.5, 0, 1, baseOffsetL - w / 8 * 0.667, baseOffsetT - h / 8 * 0.3334 + 1);
        ctx.drawImage(scaledSkin, blockSize * 4 + 1, blockSize + 1, blockSize - 2, blockSize - 2, 0, 0, w * 1.1, h * 1.1);
        ctx.restore();

        ctx.save();
        ctx.transform(1, -0.5, 0, 1, baseOffsetL + w, baseOffsetT + h * 0.4625);
        ctx.drawImage(scaledSkin, blockSize * 5 + 1, blockSize + 1, blockSize - 2, blockSize - 2, 0, 0, w * 1.1, h * 1.1);
        ctx.restore();

        ctx.save();
        ctx.transform(1, -0.5, 1, 0.5, baseOffsetL - sB / 1.75 - 1.5, baseOffsetT - sB / 4);
        ctx.drawImage(scaledSkin, hB * 10 + 1, 1, blockSize - 2, blockSize - 2, 0, 0, w * 1.1 + 0.5, w * 1.1 + 0.5);
        ctx.restore();

        const aspectRatio = rectHeight / rectWidth;
        const outputWidth = size;
        const outputHeight = Math.round(size * aspectRatio);

        const rawBuffer = canvas.toBuffer('image/png');
        const scaledBuffer = await sharp(rawBuffer)
            .resize(outputWidth, outputHeight, { kernel: 'lanczos3' })
            .png()
            .toBuffer();

        return scaledBuffer;
    } catch (error) {
        throw new Error(`Failed to create isometric body render: ${error.message}`);
    }
}

module.exports = {
    createHeadRender,
    createAvatarRender,
    createBodyRender,
    createIsometricHeadRender,
    createIsometricBodyRender,
    getRawSkin
};
