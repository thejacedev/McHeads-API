require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSize, parseDirection, cleanParams, MAX_SIZE, MIN_SIZE } = require('../utils/urlHelpers');
const { HttpError } = require('../utils/errors');

test('parseSize falls back to the default for missing or invalid sizes', () => {
    assert.equal(parseSize(undefined), 128);
    assert.equal(parseSize('abc'), 128);
    assert.equal(parseSize('hat'), 128);
    assert.equal(parseSize('0'), 128);
    assert.equal(parseSize('-5'), 128);
    assert.equal(parseSize(undefined, 64), 64);
    assert.equal(parseSize('abc', 64), 64);
});

test('parseSize parses integers and strips .png', () => {
    assert.equal(parseSize('64'), 64);
    assert.equal(parseSize('256.png'), 256);
});

test('parseSize clamps to the supported range', () => {
    assert.equal(parseSize('3'), MIN_SIZE);
    assert.equal(parseSize('99999'), MAX_SIZE);
    assert.equal(parseSize(String(MAX_SIZE)), MAX_SIZE);
});

test('parseDirection accepts left and right only', () => {
    assert.equal(parseDirection('left'), 'left');
    assert.equal(parseDirection('right'), 'right');
    assert.throws(() => parseDirection('up'), error => error instanceof HttpError && error.status === 400);
    assert.throws(() => parseDirection(undefined), HttpError);
});

test('cleanParams strips a .png suffix from every string param', () => {
    assert.deepEqual(cleanParams({ input: 'Notch.png', size: '64.PNG', option: undefined }), {
        input: 'Notch',
        size: '64',
        option: undefined
    });
});
