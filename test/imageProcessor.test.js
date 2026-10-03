const { makeSkin } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const {
    createHeadRender,
    createBodyRender,
    createIsometricHeadRender,
    createIsometricBodyRender
} = require('../utils/imageProcessor');

async function pixels(png) {
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return {
        width: info.width,
        height: info.height,
        at: (x, y) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)]
    };
}

const GREEN = [0, 255, 0, 255];
const RED = [255, 0, 0, 255];
const BLUE = [0, 0, 255, 255];
const CLEAR = [0, 0, 0, 0];

test('head render is size x size, with or without the hat', async () => {
    for (const hat of [false, true]) {
        const image = await pixels(await createHeadRender(makeSkin(), 40, hat));
        assert.equal(image.width, 40);
        assert.equal(image.height, 40);
    }
});

test('body render handles legacy 64x32 skins with the hat option', async () => {
    const legacy = makeSkin({
        height: 32,
        paint: ctx => {
            ctx.fillStyle = '#3366cc';
            ctx.fillRect(0, 0, 64, 32);
            // Right arm front: left column green, the rest red.
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(44, 20, 4, 12);
            ctx.fillStyle = '#00ff00';
            ctx.fillRect(44, 20, 1, 12);
        }
    });
    const image = await pixels(await createBodyRender(legacy, 16, true));
    assert.equal(image.width, 16);
    assert.equal(image.height, 32);
    // The left arm mirrors the right arm, so the green column ends up on its outside edge.
    assert.deepEqual(image.at(0, 10), GREEN);
    assert.deepEqual(image.at(15, 10), GREEN);
    assert.deepEqual(image.at(12, 10), RED);
});

test('an opaque legacy hat layer is ignored, as in Minecraft', async () => {
    // Old skins often filled the whole texture, hat area included, with solid colour.
    const opaqueHat = makeSkin({
        height: 32,
        paint: ctx => {
            ctx.fillStyle = '#0000ff';
            ctx.fillRect(0, 0, 64, 32);
            ctx.fillStyle = '#000000';
            ctx.fillRect(32, 0, 32, 16);
        }
    });
    assert.deepEqual((await pixels(await createHeadRender(opaqueHat, 8, true))).at(4, 4), BLUE);
    assert.deepEqual((await pixels(await createBodyRender(opaqueHat, 16, true))).at(8, 4), BLUE);

    const iso = await pixels(await createIsometricHeadRender(opaqueHat, 64, 'right'));
    for (let y = 0; y < iso.height; y++) {
        for (let x = 0; x < iso.width; x++) {
            const [r, g, b, a] = iso.at(x, y);
            assert.ok(!(a === 255 && r + g + b === 0), `black hat pixel at ${x},${y}`);
        }
    }

    // A legacy skin with any transparency in that area keeps its hat.
    const realHat = makeSkin({
        height: 32,
        paint: ctx => {
            ctx.fillStyle = '#0000ff';
            ctx.fillRect(0, 0, 64, 32);
            ctx.clearRect(32, 0, 32, 16);
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(40, 8, 8, 8);
        }
    });
    assert.deepEqual((await pixels(await createHeadRender(realHat, 8, true))).at(4, 4), RED);
});

test('body render keeps semi-transparent pixels intact', async () => {
    const skin = makeSkin({
        paint: ctx => {
            ctx.fillStyle = 'rgba(200, 100, 50, 0.5)';
            ctx.fillRect(20, 20, 8, 12);
        }
    });
    const source = await pixels(skin);
    const image = await pixels(await createBodyRender(skin, 16));
    assert.deepEqual(image.at(4, 8), source.at(20, 20));
});

test('slim skins render 3px arms attached to the torso', async () => {
    const skin = makeSkin({
        paint: ctx => {
            ctx.fillStyle = '#0000ff';
            ctx.fillRect(20, 20, 8, 12); // torso front
            // Right arm front: 3 slim columns, then a 4th column that belongs to the arm's side.
            ctx.fillStyle = '#00ff00';
            ctx.fillRect(44, 20, 3, 12);
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(47, 20, 1, 12);
        }
    });

    const classic = await pixels(await createBodyRender(skin, 16, false, false));
    assert.deepEqual(classic.at(0, 10), GREEN);
    assert.deepEqual(classic.at(3, 10), RED);

    const slim = await pixels(await createBodyRender(skin, 16, false, true));
    assert.deepEqual(slim.at(0, 10), CLEAR);
    assert.deepEqual(slim.at(1, 10), GREEN);
    assert.deepEqual(slim.at(3, 10), GREEN);
    assert.deepEqual(slim.at(4, 10), BLUE);
});

test('body render parts stay flush at sizes that are not a multiple of 16', async () => {
    const image = await pixels(await createBodyRender(makeSkin(), 100));
    assert.equal(image.width, 100);
    assert.equal(image.height, 200);
    for (let x = 0; x < 100; x++) {
        assert.equal(image.at(x, 100)[3], 255, `gap at column ${x}`);
    }
});

test('isometric renders have the documented proportions', async () => {
    const head = await pixels(await createIsometricHeadRender(makeSkin(), 64, 'left'));
    assert.equal(head.width, 64);
    assert.equal(head.height, 64);

    const body = await pixels(await createIsometricBodyRender(makeSkin(), 64, 'right'));
    assert.equal(body.width, 64);
    assert.equal(body.height, 131);
});

test('isometric body render draws slim arms differently', async () => {
    const skin = makeSkin({
        paint: ctx => {
            ctx.fillStyle = '#3366cc';
            ctx.fillRect(0, 0, 64, 64);
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(47, 16, 1, 16);
            ctx.fillRect(39, 48, 1, 16);
        }
    });
    const classic = await createIsometricBodyRender(skin, 128, 'right', false);
    const slim = await createIsometricBodyRender(skin, 128, 'right', true);
    assert.notDeepEqual(classic, slim);
});

test('renderers reject images that are not skins', async () => {
    const notASkin = makeSkin({ width: 30, height: 20 });
    await assert.rejects(createHeadRender(notASkin, 64), /Unsupported skin dimensions/);
    await assert.rejects(createBodyRender(notASkin, 64), /Unsupported skin dimensions/);
});
