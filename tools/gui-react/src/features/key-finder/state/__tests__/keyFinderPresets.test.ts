/**
 * keyFinderPresets — preset registry + pure derivation tests.
 *
 * BEHAVIORAL boundary: presets are a computed mapping between filter state
 * and a small set of named quick queries. Tested as two pure functions:
 *   - matchingPreset(filters) → PresetId | null
 *   - applyPreset(id, currentSearch) → KeyFilterState
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  KEY_FINDER_PRESETS,
  matchingPreset,
  applyPreset,
} from '../keyFinderPresets.ts';
import { DEFAULT_FILTERS } from '../../types.ts';

describe('KEY_FINDER_PRESETS registry', () => {
  it('is frozen and declares exactly 6 entries in known order', () => {
    assert.equal(Object.isFrozen(KEY_FINDER_PRESETS), true);
    assert.equal(KEY_FINDER_PRESETS.length, 6);
    assert.deepEqual(
      KEY_FINDER_PRESETS.map((p) => p.id),
      ['all', 'unresolved', 'mandatory_unresolved', 'running', 'below_threshold', 'resolved'],
    );
  });
});

describe('matchingPreset', () => {
  it('DEFAULT_FILTERS matches "all"', () => {
    assert.equal(matchingPreset(DEFAULT_FILTERS), 'all');
  });

  it('status=unresolved alone matches "unresolved"', () => {
    assert.equal(
      matchingPreset({ ...DEFAULT_FILTERS, status: 'unresolved' }),
      'unresolved',
    );
  });

  it('required=mandatory + status=unresolved matches "mandatory_unresolved"', () => {
    assert.equal(
      matchingPreset({ ...DEFAULT_FILTERS, required: 'mandatory', status: 'unresolved' }),
      'mandatory_unresolved',
    );
  });

  it('status=running matches "running"', () => {
    assert.equal(
      matchingPreset({ ...DEFAULT_FILTERS, status: 'running' }),
      'running',
    );
  });

  it('status=below_threshold matches "below_threshold"', () => {
    assert.equal(
      matchingPreset({ ...DEFAULT_FILTERS, status: 'below_threshold' }),
      'below_threshold',
    );
  });

  it('status=resolved matches "resolved"', () => {
    assert.equal(
      matchingPreset({ ...DEFAULT_FILTERS, status: 'resolved' }),
      'resolved',
    );
  });

  it('search is orthogonal — does not disqualify a preset match', () => {
    assert.equal(
      matchingPreset({ ...DEFAULT_FILTERS, status: 'unresolved', search: 'sensor' }),
      'unresolved',
    );
    assert.equal(
      matchingPreset({ ...DEFAULT_FILTERS, search: 'anything' }),
      'all',
    );
  });

  it('extra non-preset axis disqualifies a preset match', () => {
    // unresolved preset pins only status; adding difficulty=hard means no preset fits
    assert.equal(
      matchingPreset({ ...DEFAULT_FILTERS, status: 'unresolved', difficulty: 'hard' }),
      null,
    );
  });

  it('partial preset match disqualifies — required alone matches nothing', () => {
    assert.equal(
      matchingPreset({ ...DEFAULT_FILTERS, required: 'mandatory' }),
      null,
    );
  });

  it('availability alone is a custom query — returns null', () => {
    assert.equal(
      matchingPreset({ ...DEFAULT_FILTERS, availability: 'always' }),
      null,
    );
  });
});

describe('applyPreset', () => {
  it('returns mandatory_unresolved filter set with search preserved', () => {
    assert.deepEqual(
      applyPreset('mandatory_unresolved', 'sensor'),
      {
        search: 'sensor',
        difficulty: '',
        availability: '',
        required: 'mandatory',
        status: 'unresolved',
      },
    );
  });

  it('returns DEFAULT_FILTERS for "all" with search preserved', () => {
    assert.deepEqual(
      applyPreset('all', 'sensor'),
      { ...DEFAULT_FILTERS, search: 'sensor' },
    );
  });

  it('applies single-axis preset correctly', () => {
    assert.deepEqual(
      applyPreset('running', ''),
      { ...DEFAULT_FILTERS, status: 'running' },
    );
  });

  it('throws on unknown preset id', () => {
    assert.throws(
      () => applyPreset('bogus_preset_id', ''),
      /unknown preset/i,
    );
  });
});
