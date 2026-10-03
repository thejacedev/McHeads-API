const { stubUpstream, makeSkin, texturesProperty, mojangProfile } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePlayer, getSkinInfo, getSkinImage, DEFAULT_SKIN } = require('../utils/minecraft');
const { HttpError } = require('../utils/errors');

const isStatus = status => error => error instanceof HttpError && error.status === status;

test('parsePlayer recognises Java usernames and UUIDs', () => {
    assert.deepEqual(parsePlayer('Notch'), { edition: 'java', type: 'username', value: 'Notch', id: 'name:notch' });

    const dashed = parsePlayer('069A79F4-44E9-4726-A5BE-FCA90E38AAF5');
    assert.equal(dashed.edition, 'java');
    assert.equal(dashed.value, '069a79f444e94726a5befca90e38aaf5');
    assert.equal(parsePlayer('069a79f444e94726a5befca90e38aaf5').id, dashed.id);
});

test('parsePlayer keeps Java players whose name or UUID starts with 0000', () => {
    assert.equal(parsePlayer('0000abc').edition, 'java');
    assert.equal(parsePlayer('00001234').edition, 'java');
    assert.equal(parsePlayer('0000f4c5-d1e9-4b0c-8c3a-3f2e1d0c9b8a').edition, 'java');
});

test('parsePlayer recognises Bedrock gamertags, prefixed XUIDs and Floodgate UUIDs', () => {
    assert.deepEqual(parsePlayer('.Some Player'), { edition: 'bedrock', type: 'gamertag', value: 'Some Player', id: 'gt:some player' });
    assert.deepEqual(parsePlayer('00002535468413142004'), { edition: 'bedrock', type: 'xuid', value: '2535468413142004', id: 'xuid:2535468413142004' });
    assert.equal(parsePlayer('00000000-0000-0000-0009-01febe1ac3f4').value, '2535468413142004');
    assert.equal(parsePlayer('0000000000000000000901febe1ac3f4').value, '2535468413142004');
});

test('parsePlayer rejects malformed input', () => {
    for (const input of ['', '.', '..', '../x', '.../etc', 'has space', 'a'.repeat(17), `.${'a'.repeat(17)}`, 'semi;colon', undefined]) {
        assert.throws(() => parsePlayer(input), isStatus(400), `expected ${JSON.stringify(input)} to be rejected`);
    }
});

test('Java skins come from the session server, upgraded to https, with the model', async () => {
    const calls = stubUpstream(url => {
        if (url.endsWith('/minecraft/SlimJava')) return { data: { id: 'aaaa0000aaaa4000aaaa0000aaaa0001' } };
        if (url.includes('/profile/aaaa0000aaaa4000aaaa0000aaaa0001')) {
            return { data: mojangProfile('aaaa0000aaaa4000aaaa0000aaaa0001', 'http://textures.minecraft.net/texture/abc', 'slim') };
        }
    });
    assert.deepEqual(await getSkinInfo(parsePlayer('SlimJava')), {
        skinUrl: 'https://textures.minecraft.net/texture/abc',
        slim: true
    });
    assert.equal(calls.length, 2);
});

test('Java players on a default skin get the default skin', async () => {
    stubUpstream(url => {
        if (url.endsWith('/minecraft/DefaultJava')) return { data: { id: 'bbbb0000bbbb4000bbbb0000bbbb0001' } };
        if (url.includes('/profile/')) return { data: mojangProfile('bbbb0000bbbb4000bbbb0000bbbb0001', null) };
    });
    assert.deepEqual(await getSkinInfo(parsePlayer('DefaultJava')), DEFAULT_SKIN);
});

test('unknown Java players are a 404, upstream failures a 502', async () => {
    stubUpstream(url => {
        if (url.endsWith('/minecraft/NoSuchName')) return { status: 404, data: { errorMessage: 'not found' } };
        if (url.includes('/profile/cccc')) return { status: 204, data: '' };
        if (url.endsWith('/minecraft/MojangDown')) return { status: 500, data: {} };
        if (url.endsWith('/minecraft/Unreachable')) throw new Error('ECONNRESET');
    });
    await assert.rejects(getSkinInfo(parsePlayer('NoSuchName')), isStatus(404));
    await assert.rejects(getSkinInfo(parsePlayer('cccc0000cccc4000cccc0000cccc0001')), isStatus(404));
    await assert.rejects(getSkinInfo(parsePlayer('MojangDown')), isStatus(502));
    await assert.rejects(getSkinInfo(parsePlayer('Unreachable')), isStatus(502));
});

test('Bedrock skins are read from the GeyserMC skin record', async () => {
    stubUpstream(url => {
        if (url.endsWith('/xbox/xuid/BedrockGuy')) return { data: { xuid: 2535468413142004 } };
        if (url.endsWith('/skin/2535468413142004')) {
            // Shape of a real /v2/skin/{xuid} response.
            return {
                data: {
                    hash: 'h',
                    is_steve: false,
                    last_update: 1770210174746,
                    signature: 's',
                    texture_id: 'df25b6',
                    value: texturesProperty('http://textures.minecraft.net/texture/df25b6', 'slim')
                }
            };
        }
    });
    assert.deepEqual(await getSkinInfo(parsePlayer('.BedrockGuy')), {
        skinUrl: 'https://textures.minecraft.net/texture/df25b6',
        slim: true
    });
});

test('Bedrock players without a stored skin get the default skin', async () => {
    stubUpstream(url => (url.endsWith('/skin/1234567890123456') ? { data: {} } : undefined));
    assert.deepEqual(await getSkinInfo(parsePlayer('00001234567890123456')), DEFAULT_SKIN);
});

test('unknown gamertags are a 404, GeyserMC failures a 502', async () => {
    stubUpstream(url => {
        if (url.endsWith('/xbox/xuid/Ghost')) {
            return { status: 503, data: { message: 'Unable to find user in our cache. Please try specifying their Floodgate UUID instead' } };
        }
        if (url.endsWith('/xbox/xuid/GeyserDown')) return { status: 503, data: { message: 'Service unavailable' } };
    });
    await assert.rejects(getSkinInfo(parsePlayer('.Ghost')), isStatus(404));
    await assert.rejects(getSkinInfo(parsePlayer('.GeyserDown')), isStatus(502));
});

test('profile lookups are shared between concurrent requests and cached', async () => {
    const calls = stubUpstream(url => {
        if (url.endsWith('/minecraft/Popular')) return { data: { id: 'dddd0000dddd4000dddd0000dddd0001' } };
        if (url.includes('/profile/')) return { data: mojangProfile('dddd0000dddd4000dddd0000dddd0001', 'https://textures.minecraft.net/texture/p') };
    });
    await Promise.all([getSkinInfo(parsePlayer('Popular')), getSkinInfo(parsePlayer('popular'))]);
    await getSkinInfo(parsePlayer('POPULAR'));
    assert.equal(calls.length, 2);
});

test('failed lookups are not cached', async () => {
    let fail = true;
    stubUpstream(url => {
        if (fail) throw new Error('timeout');
        if (url.endsWith('/minecraft/Flaky')) return { data: { id: 'eeee0000eeee4000eeee0000eeee0001' } };
        return { data: mojangProfile('eeee0000eeee4000eeee0000eeee0001', 'https://textures.minecraft.net/texture/f') };
    });
    await assert.rejects(getSkinInfo(parsePlayer('Flaky')), isStatus(502));
    fail = false;
    assert.equal((await getSkinInfo(parsePlayer('Flaky'))).skinUrl, 'https://textures.minecraft.net/texture/f');
});

test('skin images are downloaded once per texture URL', async () => {
    const skin = makeSkin();
    const calls = stubUpstream(() => ({ data: skin }));
    const url = 'https://textures.minecraft.net/texture/once';
    assert.deepEqual(await getSkinImage(url), skin);
    assert.deepEqual(await getSkinImage(url), skin);
    assert.equal(calls.length, 1);
});
