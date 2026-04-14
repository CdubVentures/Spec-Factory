/**
 * matchVariant — contract tests.
 *
 * Pure predicate: matches an image/record to a variant selector.
 * variant_id wins when both sides have it; falls back to variant_key.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchVariant } from '../variantMatch.js';

/* ── Table-driven boundary matrix ──────────────────────────────── */

describe('matchVariant', () => {
  const cases = [
    // ── variant_id present on both sides ──
    {
      name: 'both have variant_id, IDs match -> true',
      img: { variant_id: 'v_abc12345', variant_key: 'color:black' },
      selector: { variantId: 'v_abc12345', variantKey: 'color:black' },
      expected: true,
    },
    {
      name: 'both have variant_id, IDs differ -> false (even if variant_key matches)',
      img: { variant_id: 'v_abc12345', variant_key: 'color:black' },
      selector: { variantId: 'v_zzz99999', variantKey: 'color:black' },
      expected: false,
    },
    {
      name: 'variant_id match but variant_key mismatch -> true (variant_id wins)',
      img: { variant_id: 'v_abc12345', variant_key: 'color:ocean-blue' },
      selector: { variantId: 'v_abc12345', variantKey: 'color:deep-ocean-blue' },
      expected: true,
    },

    // ── variant_id missing on one or both sides -> fall back to variant_key ──
    {
      name: 'image has variant_id, selector has none -> fall back to variant_key match',
      img: { variant_id: 'v_abc12345', variant_key: 'color:black' },
      selector: { variantId: null, variantKey: 'color:black' },
      expected: true,
    },
    {
      name: 'image has no variant_id, selector has one -> fall back to variant_key match',
      img: { variant_key: 'color:black' },
      selector: { variantId: 'v_abc12345', variantKey: 'color:black' },
      expected: true,
    },
    {
      name: 'neither has variant_id -> fall back to variant_key match',
      img: { variant_key: 'color:black' },
      selector: { variantKey: 'color:black' },
      expected: true,
    },
    {
      name: 'neither has variant_id, variant_key mismatch -> false',
      img: { variant_key: 'color:black' },
      selector: { variantKey: 'color:white' },
      expected: false,
    },

    // ── Edge cases ──
    {
      name: 'null image -> false',
      img: null,
      selector: { variantId: 'v_abc12345', variantKey: 'color:black' },
      expected: false,
    },
    {
      name: 'undefined image -> false',
      img: undefined,
      selector: { variantKey: 'color:black' },
      expected: false,
    },
    {
      name: 'empty strings for both variant_id and variant_key -> false',
      img: { variant_id: '', variant_key: '' },
      selector: { variantId: '', variantKey: '' },
      expected: false,
    },
    {
      name: 'image variant_id is empty string, selector has real ID -> fall back to variant_key',
      img: { variant_id: '', variant_key: 'color:black' },
      selector: { variantId: 'v_abc12345', variantKey: 'color:black' },
      expected: true,
    },
    {
      name: 'selector variantId is undefined -> fall back to variant_key',
      img: { variant_id: 'v_abc12345', variant_key: 'color:black' },
      selector: { variantKey: 'color:black' },
      expected: true,
    },
  ];

  for (const { name, img, selector, expected } of cases) {
    it(name, () => {
      assert.equal(matchVariant(img, selector), expected);
    });
  }
});
