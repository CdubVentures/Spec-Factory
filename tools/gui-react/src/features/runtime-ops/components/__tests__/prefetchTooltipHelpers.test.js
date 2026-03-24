import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { formatTooltip } from '../prefetchTooltipHelpers.js';

describe('formatTooltip', () => {
  it('formats tooltip sections with stable headings', () => {
    const text = formatTooltip({
      what: 'Shows query gate coverage.',
      effect: 'Lets operators see if field-rules hints were used.',
      setBy: 'Search Profile panel top-level badges.',
    });

    assert.equal(
      text,
      [
        'What it does',
        'Shows query gate coverage.',
        '',
        'Effect on planner',
        'Lets operators see if field-rules hints were used.',
        '',
        'How to set',
        'Search Profile panel top-level badges.',
      ].join('\n'),
    );
  });
});
