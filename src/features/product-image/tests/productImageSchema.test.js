import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { productImageFinderResponseSchema } from '../productImageSchema.js';

describe('productImageFinderResponseSchema', () => {
  const baseImage = {
    view: 'top',
    url: 'https://cdn.razer.com/m1-top.jpg',
    source_page: 'https://razer.com/m1',
    alt_text: 'Razer M1 Top',
  };

  it('parses a response with a valid image array', () => {
    const input = { images: [baseImage] };
    const result = productImageFinderResponseSchema.parse(input);
    assert.equal(result.images.length, 1);
    assert.equal(result.images[0].view, 'top');
    assert.equal(result.images[0].url, baseImage.url);
  });

  it('rejects image with invalid view enum', () => {
    const input = { images: [{ ...baseImage, view: 'not-a-view' }] };
    assert.throws(() => productImageFinderResponseSchema.parse(input));
  });

  // ── evidence_refs ──

  it('parses an image with evidence_refs', () => {
    const input = {
      images: [{
        ...baseImage,
        evidence_refs: [{ url: 'https://razer.com/m1', tier: 'tier1' }],
      }],
    };
    const result = productImageFinderResponseSchema.parse(input);
    assert.deepEqual(
      result.images[0].evidence_refs,
      [{ url: 'https://razer.com/m1', tier: 'tier1' }],
    );
  });

  it('evidence_refs defaults to empty array when omitted from image', () => {
    const input = { images: [baseImage] };
    const result = productImageFinderResponseSchema.parse(input);
    assert.deepEqual(result.images[0].evidence_refs, []);
  });

  it('rejects evidence_refs entry missing url', () => {
    const input = {
      images: [{ ...baseImage, evidence_refs: [{ tier: 'tier1' }] }],
    };
    assert.throws(() => productImageFinderResponseSchema.parse(input));
  });

  it('rejects evidence_refs entry missing tier', () => {
    const input = {
      images: [{ ...baseImage, evidence_refs: [{ url: 'https://razer.com' }] }],
    };
    assert.throws(() => productImageFinderResponseSchema.parse(input));
  });

  it('accepts all 6 tier codes on image evidence_refs', () => {
    const input = {
      images: [{
        ...baseImage,
        evidence_refs: [
          { url: 'u1', tier: 'tier1' },
          { url: 'u2', tier: 'tier2' },
          { url: 'u3', tier: 'tier3' },
          { url: 'u4', tier: 'tier4' },
          { url: 'u5', tier: 'tier5' },
          { url: 'u6', tier: 'other' },
        ],
      }],
    };
    const result = productImageFinderResponseSchema.parse(input);
    assert.equal(result.images[0].evidence_refs.length, 6);
  });

  it('backward compat: legacy response without evidence_refs still parses', () => {
    const legacy = {
      images: [{ view: 'top', url: 'https://cdn.razer.com/m1-top.jpg' }],
      discovery_log: {
        urls_checked: ['https://razer.com/m1'],
        queries_run: ['razer m1'],
        notes: [],
      },
    };
    const result = productImageFinderResponseSchema.parse(legacy);
    assert.equal(result.images.length, 1);
    assert.deepEqual(result.images[0].evidence_refs, []);
  });
});
