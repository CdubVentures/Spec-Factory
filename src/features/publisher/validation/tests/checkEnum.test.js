import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkEnum } from '../checks/checkEnum.js';

describe('checkEnum — no enum constraint (passthrough)', () => {
  it('null policy → pass', () => {
    const r = checkEnum('black', null, []);
    assert.equal(r.pass, true);
  });

  it('undefined policy, null values → pass', () => {
    const r = checkEnum('black', undefined, null);
    assert.equal(r.pass, true);
  });

  it('open policy → all pass, no review', () => {
    const r = checkEnum('anything', 'open', ['a', 'b']);
    assert.equal(r.pass, true);
    assert.equal(r.needsReview, false);
  });
});

describe('checkEnum — null (absence) passthrough', () => {
  it('null passes closed enum', () => {
    const r = checkEnum(null, 'closed', ['a']);
    assert.equal(r.pass, true);
  });

  it('null passes open_prefer_known enum', () => {
    const r = checkEnum(null, 'open_prefer_known', ['a']);
    assert.equal(r.pass, true);
  });
});

describe('checkEnum — closed scalar', () => {
  const known = ['black', 'white', 'red'];

  it('exact match → pass', () => {
    const r = checkEnum('black', 'closed', known);
    assert.equal(r.pass, true);
    assert.deepStrictEqual(r.unknown, []);
  });

  it('not in set → reject + needs review', () => {
    const r = checkEnum('midnight-blue', 'closed', known);
    assert.equal(r.pass, false);
    assert.deepStrictEqual(r.unknown, ['midnight-blue']);
    assert.equal(r.needsReview, true);
  });
});

describe('checkEnum — open_prefer_known scalar', () => {
  const known = ['wired', 'wireless'];

  it('known value → pass, no flag', () => {
    const r = checkEnum('wired', 'open_prefer_known', known);
    assert.equal(r.pass, true);
    assert.deepStrictEqual(r.unknown, []);
    assert.equal(r.needsReview, false);
  });

  it('unknown value → pass but flagged, needs review', () => {
    const r = checkEnum('usb-c', 'open_prefer_known', known);
    assert.equal(r.pass, true);
    assert.deepStrictEqual(r.unknown, ['usb-c']);
    assert.equal(r.needsReview, true);
  });
});

describe('checkEnum — list enum check (array values)', () => {
  const known = ['black', 'white', 'red'];

  it('all known → pass', () => {
    const r = checkEnum(['black', 'white'], 'closed', known);
    assert.equal(r.pass, true);
    assert.deepStrictEqual(r.known, ['black', 'white']);
    assert.deepStrictEqual(r.unknown, []);
  });

  it('some unknown in closed → reject', () => {
    const r = checkEnum(['black', 'pink'], 'closed', known);
    assert.equal(r.pass, false);
    assert.deepStrictEqual(r.known, ['black']);
    assert.deepStrictEqual(r.unknown, ['pink']);
    assert.equal(r.needsReview, true);
  });

  it('unknown in open_prefer_known → pass but flagged', () => {
    const r = checkEnum(['wired', 'usb-c'], 'open_prefer_known', ['wired']);
    assert.equal(r.pass, true);
    assert.deepStrictEqual(r.known, ['wired']);
    assert.deepStrictEqual(r.unknown, ['usb-c']);
    assert.equal(r.needsReview, true);
  });

  it('open list → all pass', () => {
    const r = checkEnum(['a', 'b'], 'open', ['a']);
    assert.equal(r.pass, true);
    assert.deepStrictEqual(r.known, ['a', 'b']);
    assert.deepStrictEqual(r.unknown, []);
  });
});

describe('checkEnum — multi-color atoms (+ split)', () => {
  const known = ['black', 'red', 'white'];

  it('both atoms known → pass', () => {
    const r = checkEnum('black+red', 'closed', known);
    assert.equal(r.pass, true);
    assert.deepStrictEqual(r.unknown, []);
  });

  it('one atom unknown → reject', () => {
    const r = checkEnum('black+pink', 'closed', known);
    assert.equal(r.pass, false);
    assert.deepStrictEqual(r.unknown, ['pink']);
    assert.equal(r.needsReview, true);
  });
});

// ── open_prefer_known — alias resolution ────────────────────────────────────

describe('checkEnum — open_prefer_known policy (alias resolution, case-insensitive)', () => {
  const known = ['Cherry MX Red', 'Cherry MX Brown', 'Cherry MX Blue'];

  it('exact match → pass', () => {
    const r = checkEnum('Cherry MX Red', 'open_prefer_known', known);
    assert.equal(r.pass, true);
    assert.deepStrictEqual(r.unknown, []);
  });

  it('case-insensitive match → pass + repair', () => {
    const r = checkEnum('cherry mx red', 'open_prefer_known', known);
    assert.equal(r.pass, true);
    assert.deepStrictEqual(r.unknown, []);
    assert.equal(r.repaired, 'Cherry MX Red');
  });

  it('mixed case → resolves to canonical', () => {
    const r = checkEnum('CHERRY MX BROWN', 'open_prefer_known', known);
    assert.equal(r.pass, true);
    assert.equal(r.repaired, 'Cherry MX Brown');
  });

  it('no match → accept + flag unknown', () => {
    const r = checkEnum('Gateron Red', 'open_prefer_known', known);
    assert.equal(r.pass, true);
    assert.equal(r.needsReview, true);
    assert.deepStrictEqual(r.unknown, ['Gateron Red']);
  });
});

describe('checkEnum — open_prefer_known (normalized matching: hyphens/underscores/spaces)', () => {
  const known = ['3 Zone (RGB)', '4 Zone (RGB)', 'None'];

  it('hyphenated input matches spaced canonical', () => {
    const r = checkEnum('3-zone-(rgb)', 'open_prefer_known', known);
    assert.equal(r.pass, true);
    assert.equal(r.repaired, '3 Zone (RGB)');
  });

  it('underscored input matches spaced canonical', () => {
    const r = checkEnum('4_zone_(rgb)', 'open_prefer_known', known);
    assert.equal(r.pass, true);
    assert.equal(r.repaired, '4 Zone (RGB)');
  });

  it('collapsed no-separator input matches', () => {
    const r = checkEnum('none', 'open_prefer_known', known);
    assert.equal(r.pass, true);
    assert.equal(r.repaired, 'None');
  });

  it('completely wrong value → accept + flag', () => {
    const r = checkEnum('5 Zone (RGB)', 'open_prefer_known', known);
    assert.equal(r.pass, true);
    assert.equal(r.needsReview, true);
    assert.deepStrictEqual(r.unknown, ['5 Zone (RGB)']);
  });
});

describe('checkEnum — open_prefer_known with + atoms', () => {
  const known = ['black', 'white', 'red'];

  it('case-insensitive atoms → pass + repaired', () => {
    const r = checkEnum('Black+White', 'open_prefer_known', known);
    assert.equal(r.pass, true);
    assert.equal(r.repaired, 'black+white');
  });

  it('one atom unknown → accept + flag', () => {
    const r = checkEnum('Black+Pink', 'open_prefer_known', known);
    assert.equal(r.pass, true);
    assert.equal(r.needsReview, true);
    assert.deepStrictEqual(r.unknown, ['Pink']);
  });
});

describe('checkEnum — open_prefer_known with list arrays', () => {
  const known = ['Cherry MX Red', 'Cherry MX Brown'];

  it('array with case-insensitive matches → pass + repaired array', () => {
    const r = checkEnum(['cherry mx red', 'cherry mx brown'], 'open_prefer_known', known);
    assert.equal(r.pass, true);
    assert.deepStrictEqual(r.repaired, ['Cherry MX Red', 'Cherry MX Brown']);
  });

  it('array with one miss → accept + flag', () => {
    const r = checkEnum(['cherry mx red', 'gateron red'], 'open_prefer_known', known);
    assert.equal(r.pass, true);
    assert.equal(r.needsReview, true);
    assert.deepStrictEqual(r.unknown, ['gateron red']);
  });
});

// ── closed — exact match, no alias ──────────────────────────────────────────

describe('checkEnum — closed policy (exact match, no alias)', () => {
  const known = ['black', 'white'];

  it('case mismatch → reject', () => {
    const r = checkEnum('Black', 'closed', known);
    assert.equal(r.pass, false);
    assert.deepStrictEqual(r.unknown, ['Black']);
  });

  it('exact match → pass', () => {
    const r = checkEnum('black', 'closed', known);
    assert.equal(r.pass, true);
    assert.deepStrictEqual(r.unknown, []);
  });
});

describe('checkEnum — non-string passthrough', () => {
  it('number → pass', () => {
    const r = checkEnum(42, 'closed', ['a']);
    assert.equal(r.pass, true);
  });

  it('null → pass', () => {
    const r = checkEnum(null, 'closed', ['a']);
    assert.equal(r.pass, true);
  });

  it('boolean → pass', () => {
    const r = checkEnum(true, 'closed', ['a']);
    assert.equal(r.pass, true);
  });
});
