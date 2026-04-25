import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { productImageFinderResponseSchema } from '../productImageSchema.js';

// WHY: PIF is the evidence-refs exception across finders. The image URL IS
// the evidence, and images don't flow through the publisher candidate gate.
// There are no tier/evidence_refs assertions here on purpose.

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

  it('parses image with minimum required fields (view + url)', () => {
    const input = { images: [{ view: 'hero', url: 'https://cdn.example.com/x.jpg' }] };
    const result = productImageFinderResponseSchema.parse(input);
    assert.equal(result.images.length, 1);
    assert.equal(result.images[0].source_page, '');
    assert.equal(result.images[0].alt_text, '');
  });

  it('does not add an evidence_refs field (PIF exception — image URL is its own evidence)', () => {
    const input = { images: [baseImage] };
    const result = productImageFinderResponseSchema.parse(input);
    assert.ok(
      !('evidence_refs' in result.images[0]),
      'PIF images must not carry evidence_refs — the URL itself is the evidence',
    );
  });

  it('accepts an optional run_scope_key string and round-trips it', () => {
    const result = productImageFinderResponseSchema.parse({
      images: [baseImage],
      run_scope_key: 'view:top',
    });
    assert.equal(result.run_scope_key, 'view:top');
  });

  it('omits run_scope_key when not provided (legacy compatibility)', () => {
    const result = productImageFinderResponseSchema.parse({ images: [baseImage] });
    assert.equal(result.run_scope_key, undefined);
  });
});
