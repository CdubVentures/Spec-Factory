import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  shouldShowSearchProfileGateBadges,
  normalizeIdentityAliasEntries,
} from '../tools/gui-react/src/pages/runtime-ops/panels/prefetchSearchProfileDisplayHelpers.js';

describe('shouldShowSearchProfileGateBadges', () => {
  it('defaults to visible when no option is provided', () => {
    assert.equal(shouldShowSearchProfileGateBadges(), true);
  });

  it('returns false when explicitly disabled', () => {
    assert.equal(shouldShowSearchProfileGateBadges({ showGateBadges: false }), false);
  });

  it('returns true only when explicitly enabled', () => {
    assert.equal(shouldShowSearchProfileGateBadges({ showGateBadges: true }), true);
  });
});

describe('normalizeIdentityAliasEntries', () => {
  it('normalizes object aliases for safe chip rendering', () => {
    const rows = normalizeIdentityAliasEntries([
      { alias: 'op1w', source: 'identity_lock', weight: 0.8 },
      { alias: 'op1 4k', source: 'llm', weight: 0.6 },
    ]);

    assert.equal(rows.length, 2);
    assert.equal(rows[0].label, 'op1w (identity_lock, w:0.8)');
    assert.equal(rows[1].label, 'op1 4k (llm, w:0.6)');
    assert.equal(typeof rows[0].key, 'string');
  });

  it('keeps plain string aliases and drops invalid rows', () => {
    const rows = normalizeIdentityAliasEntries([
      'endgame gear op1w',
      '',
      null,
      { alias: '' },
      { alias: 'op1we' },
    ]);

    assert.deepEqual(rows.map((row) => row.label), [
      'endgame gear op1w',
      'op1we',
    ]);
  });
});
