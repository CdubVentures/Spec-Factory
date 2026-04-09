import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkFormat } from '../checks/checkFormat.js';

describe('checkFormat — boolean', () => {
  const pass = ['yes', 'no', 'unk'];
  for (const v of pass) {
    it(`pass: "${v}"`, () => {
      assert.equal(checkFormat(v, 'boolean').pass, true);
    });
  }

  const fail = ['maybe', 'true', 'false', '1', ''];
  for (const v of fail) {
    it(`fail: "${v}"`, () => {
      assert.equal(checkFormat(v, 'boolean').pass, false);
    });
  }
});

describe('checkFormat — date (ISO)', () => {
  const pass = ['2024-10-01', '1999-01-01', '2030-12-31'];
  for (const v of pass) {
    it(`pass: "${v}"`, () => {
      assert.equal(checkFormat(v, 'date').pass, true);
    });
  }

  const fail = ['2024-1-1', '10/01/2024', '2024', 'Oct 2024', ''];
  for (const v of fail) {
    it(`fail: "${v}"`, () => {
      assert.equal(checkFormat(v, 'date').pass, false);
    });
  }
});

describe('checkFormat — url', () => {
  it('valid https URL passes', () => {
    assert.equal(checkFormat('https://example.com/spec', 'url').pass, true);
  });

  it('valid http URL passes', () => {
    assert.equal(checkFormat('http://example.com', 'url').pass, true);
  });

  it('non-URL string fails', () => {
    const r = checkFormat('not a url', 'url');
    assert.equal(r.pass, false);
    assert.ok(r.reason.includes('url'));
  });

  it('bare domain fails', () => {
    assert.equal(checkFormat('example.com', 'url').pass, false);
  });

  it('unk passes', () => {
    assert.equal(checkFormat('unk', 'url').pass, true);
  });
});

describe('checkFormat — string type (no format regex)', () => {
  const cases = [
    ['launch-edition',  'kebab'],
    ['bluetooth-5.0',   'with period'],
    ['some random text','free form'],
    ['',                'empty string'],
  ];

  for (const [value, label] of cases) {
    it(`always pass: ${label}`, () => {
      assert.equal(checkFormat(value, 'string').pass, true);
    });
  }
});

describe('checkFormat — types with no format regex (always pass)', () => {
  const types = ['number', 'integer', 'range', 'mixed_number_range'];

  for (const type of types) {
    it(`${type}: always pass`, () => {
      assert.equal(checkFormat('anything', type).pass, true);
    });
  }
});

describe('checkFormat — unknown type (no regex → pass)', () => {
  it('unknown type passes', () => {
    assert.equal(checkFormat('anything', 'unknown_type_xyz').pass, true);
  });

  it('null type passes', () => {
    assert.equal(checkFormat('anything', null).pass, true);
  });

  it('undefined type passes', () => {
    assert.equal(checkFormat('anything', undefined).pass, true);
  });
});

describe('checkFormat — unk passthrough', () => {
  it('unk passes boolean format', () => {
    assert.equal(checkFormat('unk', 'boolean').pass, true);
  });

  it('unk passes date format', () => {
    assert.equal(checkFormat('unk', 'date').pass, true);
  });

  it('unk passes url format', () => {
    assert.equal(checkFormat('unk', 'url').pass, true);
  });
});

// ── format_hint: custom regex from field rule ────────────────────────────────

describe('checkFormat — custom format_hint regex', () => {
  const hint = '^\\d+ Zone \\(RGB\\)$';

  it('matching value passes', () => {
    const r = checkFormat('3 Zone (RGB)', 'string', hint);
    assert.equal(r.pass, true);
  });

  it('non-matching value fails', () => {
    const r = checkFormat('3 rgb zones', 'string', hint);
    assert.equal(r.pass, false);
    assert.ok(r.reason.includes('format_hint'));
  });

  it('unk still passes with format_hint', () => {
    const r = checkFormat('unk', 'string', hint);
    assert.equal(r.pass, true);
  });

  it('null format_hint → no extra check', () => {
    const r = checkFormat('anything', 'string', null);
    assert.equal(r.pass, true);
  });

  it('empty string format_hint → no extra check', () => {
    const r = checkFormat('anything', 'string', '');
    assert.equal(r.pass, true);
  });

  it('format_hint runs after type registry check', () => {
    const r = checkFormat('INVALID', 'boolean', '^.*$');
    assert.equal(r.pass, false);
  });

  it('format_hint applies even when no type registry entry', () => {
    const r = checkFormat('bad value', 'string', '^good$');
    assert.equal(r.pass, false);
  });
});

describe('checkFormat — non-string passthrough', () => {
  const cases = [42, null, true, undefined, ['a'], { a: 1 }];

  for (const value of cases) {
    it(`${typeof value} (${JSON.stringify(value)}) passes`, () => {
      assert.equal(checkFormat(value, 'boolean').pass, true);
    });
  }
});
