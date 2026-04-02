import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hexToRgb, rgbToHex } from '../utils/colorConversions.ts';

describe('hexToRgb', () => {
  it('converts #ff0000 to red', () => {
    assert.deepEqual(hexToRgb('#ff0000'), { r: 255, g: 0, b: 0 });
  });

  it('converts #000000 to black', () => {
    assert.deepEqual(hexToRgb('#000000'), { r: 0, g: 0, b: 0 });
  });

  it('converts #ffffff to white', () => {
    assert.deepEqual(hexToRgb('#ffffff'), { r: 255, g: 255, b: 255 });
  });

  it('converts #3b82f6 correctly', () => {
    assert.deepEqual(hexToRgb('#3b82f6'), { r: 59, g: 130, b: 246 });
  });

  it('returns null for invalid hex', () => {
    assert.equal(hexToRgb('invalid'), null);
    assert.equal(hexToRgb('#fff'), null);
    assert.equal(hexToRgb(''), null);
    assert.equal(hexToRgb('#gggggg'), null);
  });
});

describe('rgbToHex', () => {
  it('converts 255,0,0 to #ff0000', () => {
    assert.equal(rgbToHex(255, 0, 0), '#ff0000');
  });

  it('converts 0,0,0 to #000000', () => {
    assert.equal(rgbToHex(0, 0, 0), '#000000');
  });

  it('converts 255,255,255 to #ffffff', () => {
    assert.equal(rgbToHex(255, 255, 255), '#ffffff');
  });

  it('clamps values above 255', () => {
    assert.equal(rgbToHex(300, 0, 0), '#ff0000');
  });

  it('clamps values below 0', () => {
    assert.equal(rgbToHex(-10, 0, 0), '#000000');
  });
});

describe('hex ↔ rgb round-trip', () => {
  const testCases = ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#3b82f6', '#ef4444'];

  for (const hex of testCases) {
    it(`round-trips ${hex}`, () => {
      const rgb = hexToRgb(hex);
      assert.ok(rgb, `hexToRgb should parse ${hex}`);
      assert.equal(rgbToHex(rgb.r, rgb.g, rgb.b), hex);
    });
  }
});
