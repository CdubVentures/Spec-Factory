import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeNeedSet,
  makeIdentityLocked,
  makeIdentityUnlocked,
  makeIdentityConflict,
  makeBaseRules,
  makeBaseInput,
} from './helpers/needSetHarness.js';

// --- Test groups ---

describe('Phase 01 â€” Logic Box 1: idx hint normalization', () => {
  it('query_terms are lowercased and trimmed', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['weight'],
      fieldRules: {
        weight: {
          required_level: 'required',
          search_hints: { query_terms: ['  Weight ', 'GRAMS', 'Mouse Weight'] }
        }
      }
    }));
    const wField = result.fields.find((f) => f.field_key === 'weight');
    assert.deepStrictEqual(wField.idx.query_terms, ['weight', 'grams', 'mouse weight']);
  });

  it('query_terms are deduplicated after normalization', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['weight'],
      fieldRules: {
        weight: {
          required_level: 'required',
          search_hints: { query_terms: ['weight', 'Weight', 'WEIGHT', ' weight '] }
        }
      }
    }));
    const wField = result.fields.find((f) => f.field_key === 'weight');
    assert.deepStrictEqual(wField.idx.query_terms, ['weight']);
  });

  it('domain_hints are normalized to canonical host form (no protocol, no path)', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['weight'],
      fieldRules: {
        weight: {
          required_level: 'required',
          search_hints: { domain_hints: ['https://rtings.com/mouse/reviews', 'HTTP://LOGITECHG.COM', 'sensor.fyi'] }
        }
      }
    }));
    const wField = result.fields.find((f) => f.field_key === 'weight');
    assert.deepStrictEqual(wField.idx.domain_hints, ['rtings.com', 'logitechg.com', 'sensor.fyi']);
  });

  it('domain_hints are deduplicated after normalization', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['weight'],
      fieldRules: {
        weight: {
          required_level: 'required',
          search_hints: { domain_hints: ['rtings.com', 'https://rtings.com', 'RTINGS.COM'] }
        }
      }
    }));
    const wField = result.fields.find((f) => f.field_key === 'weight');
    assert.deepStrictEqual(wField.idx.domain_hints, ['rtings.com']);
  });

  it('content_types are deduplicated', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['weight'],
      fieldRules: {
        weight: {
          required_level: 'required',
          search_hints: { content_types: ['spec_sheet', 'product_page', 'spec_sheet', 'product_page'] }
        }
      }
    }));
    const wField = result.fields.find((f) => f.field_key === 'weight');
    assert.deepStrictEqual(wField.idx.content_types, ['spec_sheet', 'product_page']);
  });

  it('content_types are lowercased and trimmed', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['weight'],
      fieldRules: {
        weight: {
          required_level: 'required',
          search_hints: { content_types: [' Spec_Sheet ', 'PRODUCT_PAGE'] }
        }
      }
    }));
    const wField = result.fields.find((f) => f.field_key === 'weight');
    assert.deepStrictEqual(wField.idx.content_types, ['spec_sheet', 'product_page']);
  });

  it('empty strings are removed from query_terms', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['weight'],
      fieldRules: {
        weight: {
          required_level: 'required',
          search_hints: { query_terms: ['weight', '', '  ', null, 'grams'] }
        }
      }
    }));
    const wField = result.fields.find((f) => f.field_key === 'weight');
    assert.ok(!wField.idx.query_terms.includes(''));
    assert.ok(!wField.idx.query_terms.includes(null));
    assert.equal(wField.idx.query_terms.length, 2);
  });
});

// ============================================================
// GAP-2: blockers.search_exhausted derivation
// ============================================================
