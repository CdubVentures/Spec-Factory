import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkFormat } from '../checks/checkFormat.js';

describe('checkFormat — list_of_tokens_delimited (color token)', () => {
  const pass = [
    ['black',       'single color'],
    ['light-blue',  'hyphenated'],
    ['black+red',   'multi-color'],
    ['a1-b2',       'alphanumeric'],
  ];

  for (const [value, label] of pass) {
    it(`pass: ${label}`, () => {
      assert.equal(checkFormat(value, 'list_of_tokens_delimited').pass, true);
    });
  }

  const fail = [
    ['',          'empty string'],
    ['black red', 'space instead of hyphen'],
    ['123',       'starts with number'],
    ['black+',    'trailing +'],
    ['+black',    'leading +'],
  ];

  for (const [value, label] of fail) {
    it(`fail: ${label}`, () => {
      const r = checkFormat(value, 'list_of_tokens_delimited');
      assert.equal(r.pass, false);
      assert.equal(typeof r.reason, 'string');
    });
  }
});

describe('checkFormat — boolean_yes_no_unk', () => {
  const pass = ['yes', 'no', 'unk'];
  for (const v of pass) {
    it(`pass: "${v}"`, () => {
      assert.equal(checkFormat(v, 'boolean_yes_no_unk').pass, true);
    });
  }

  const fail = ['maybe', 'true', 'false', '1', ''];
  for (const v of fail) {
    it(`fail: "${v}"`, () => {
      assert.equal(checkFormat(v, 'boolean_yes_no_unk').pass, false);
    });
  }
});

describe('checkFormat — date_field (ISO)', () => {
  const pass = ['2024-10-01', '1999-01-01', '2030-12-31'];
  for (const v of pass) {
    it(`pass: "${v}"`, () => {
      assert.equal(checkFormat(v, 'date_field').pass, true);
    });
  }

  const fail = ['2024-1-1', '10/01/2024', '2024', 'Oct 2024', ''];
  for (const v of fail) {
    it(`fail: "${v}"`, () => {
      assert.equal(checkFormat(v, 'date_field').pass, false);
    });
  }
});

describe('checkFormat — text_field (no format regex)', () => {
  const cases = [
    ['launch-edition',  'kebab'],
    ['bluetooth-5.0',   'with period'],
    ['some random text','free form'],
    ['',                'empty string'],
  ];

  for (const [value, label] of cases) {
    it(`always pass: ${label}`, () => {
      assert.equal(checkFormat(value, 'text_field').pass, true);
    });
  }
});

describe('checkFormat — templates with null regex (always pass)', () => {
  const templates = [
    'number_with_unit', 'integer_field', 'integer_with_unit',
    'component_reference', 'latency_list_modes_ms',
    'list_of_numbers_with_unit', 'list_numbers_or_ranges',
  ];

  for (const tmpl of templates) {
    it(`${tmpl}: always pass`, () => {
      assert.equal(checkFormat('anything', tmpl).pass, true);
    });
  }
});

describe('checkFormat — unknown template (no regex → pass)', () => {
  it('unknown template passes', () => {
    assert.equal(checkFormat('anything', 'unknown_template_xyz').pass, true);
  });

  it('null template passes', () => {
    assert.equal(checkFormat('anything', null).pass, true);
  });

  it('undefined template passes', () => {
    assert.equal(checkFormat('anything', undefined).pass, true);
  });
});

describe('checkFormat — unk passthrough', () => {
  it('unk passes any format', () => {
    assert.equal(checkFormat('unk', 'boolean_yes_no_unk').pass, true);
  });

  it('unk passes color format', () => {
    assert.equal(checkFormat('unk', 'list_of_tokens_delimited').pass, true);
  });

  it('unk passes date format', () => {
    assert.equal(checkFormat('unk', 'date_field').pass, true);
  });
});

// ── url_field ────────────────────────────────────────────────────────────────

describe('checkFormat — url_field', () => {
  it('valid https URL passes', () => {
    assert.equal(checkFormat('https://example.com/spec', 'url_field').pass, true);
  });

  it('valid http URL passes', () => {
    assert.equal(checkFormat('http://example.com', 'url_field').pass, true);
  });

  it('non-URL string fails', () => {
    const r = checkFormat('not a url', 'url_field');
    assert.equal(r.pass, false);
    assert.ok(r.reason.includes('url_field'));
  });

  it('bare domain fails', () => {
    assert.equal(checkFormat('example.com', 'url_field').pass, false);
  });

  it('unk passes', () => {
    assert.equal(checkFormat('unk', 'url_field').pass, true);
  });
});

// ── format_hint: custom regex from field rule ────────────────────────────────

describe('checkFormat — custom format_hint regex', () => {
  // WHY: format_hint is a user-defined regex string from enum.match.format_hint
  const hint = '^\\d+ Zone \\(RGB\\)$';

  it('matching value passes', () => {
    const r = checkFormat('3 Zone (RGB)', 'text_field', hint);
    assert.equal(r.pass, true);
  });

  it('non-matching value fails', () => {
    const r = checkFormat('3 rgb zones', 'text_field', hint);
    assert.equal(r.pass, false);
    assert.ok(r.reason.includes('format_hint'));
  });

  it('unk still passes with format_hint', () => {
    const r = checkFormat('unk', 'text_field', hint);
    assert.equal(r.pass, true);
  });

  it('null format_hint → no extra check', () => {
    const r = checkFormat('anything', 'text_field', null);
    assert.equal(r.pass, true);
  });

  it('empty string format_hint → no extra check', () => {
    const r = checkFormat('anything', 'text_field', '');
    assert.equal(r.pass, true);
  });

  it('format_hint runs after template registry check', () => {
    // WHY: if template registry rejects, format_hint doesn't override that
    const r = checkFormat('INVALID', 'boolean_yes_no_unk', '^.*$');
    assert.equal(r.pass, false);
  });

  it('format_hint applies even when no template registry entry', () => {
    // text_field has no FORMAT_REGISTRY entry, so format_hint is the only check
    const r = checkFormat('bad value', 'text_field', '^good$');
    assert.equal(r.pass, false);
  });
});

describe('checkFormat — non-string passthrough', () => {
  const cases = [42, null, true, undefined, ['a'], { a: 1 }];

  for (const value of cases) {
    it(`${typeof value} (${JSON.stringify(value)}) passes`, () => {
      assert.equal(checkFormat(value, 'boolean_yes_no_unk').pass, true);
    });
  }
});
