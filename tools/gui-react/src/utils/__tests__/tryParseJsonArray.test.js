import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../src/shared/tests/helpers/loadBundledModule.js';

let tryParseJsonArray;

describe('tryParseJsonArray', () => {
  before(async () => {
    ({ tryParseJsonArray } = await loadBundledModule(
      'tools/gui-react/src/utils/fieldNormalize.ts',
      { prefix: 'utils-field-normalize-' },
    ));
  });

  const cases = [
    // JSON array strings → parsed
    ['["black","white","silver"]', ['black', 'white', 'silver']],
    ['["white+silver"]', ['white+silver']],
    ['["a"]', ['a']],

    // Actual arrays → passed through
    [['a', 'b'], ['a', 'b']],
    [['one'], ['one']],

    // Empty → null
    ['[]', null],
    [[], null],

    // Non-array JSON → null
    ['{"k":"v"}', null],
    ['"just a string"', null],

    // Plain values → null
    ['not json', null],
    ['hello', null],
    [null, null],
    [undefined, null],
    [42, null],
    [0, null],
    [true, null],
    ['', null],
    ['  ', null],
  ];

  for (const [input, expected] of cases) {
    const label = input === null ? 'null'
      : input === undefined ? 'undefined'
      : typeof input === 'string' ? `"${input}"`
      : JSON.stringify(input);

    it(`${label} → ${JSON.stringify(expected)}`, () => {
      assert.deepEqual(tryParseJsonArray(input), expected);
    });
  }

  it('filters null and empty entries from JSON string', () => {
    assert.deepEqual(tryParseJsonArray('[null, "", "ok"]'), ['ok']);
  });

  it('trims whitespace in entries', () => {
    assert.deepEqual(tryParseJsonArray('["  spaced  ", "tight"]'), ['spaced', 'tight']);
  });

  it('returns null when all entries filter out', () => {
    assert.deepEqual(tryParseJsonArray('[null, "", "  "]'), null);
  });
});
