/**
 * keyBundlerSortAxes — boundary contract for the configurable axis-order
 * comparator used by keyBundler's passenger sort and the frontend Loop
 * chain sort. parseAxisOrder normalizes user-provided CSVs; buildSortComparator
 * emits a comparator honoring (axisOrder..., currentRides?, fieldKey) ASC.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_AXIS_ORDER,
  KNOWN_AXES,
  parseAxisOrder,
  buildSortComparator,
} from '../keyBundlerSortAxes.js';

const LEGACY_ORDER = ['required_level', 'availability', 'difficulty'];

// ── parseAxisOrder ──────────────────────────────────────────────────────

describe('parseAxisOrder', () => {
  it('empty string → default order', () => {
    assert.deepEqual(parseAxisOrder(''), DEFAULT_AXIS_ORDER);
  });

  it('null / undefined → default order', () => {
    assert.deepEqual(parseAxisOrder(null), DEFAULT_AXIS_ORDER);
    assert.deepEqual(parseAxisOrder(undefined), DEFAULT_AXIS_ORDER);
  });

  it('garbage tokens only → default order (no valid axis)', () => {
    assert.deepEqual(parseAxisOrder('foo,bar,baz'), DEFAULT_AXIS_ORDER);
  });

  it('full valid CSV preserves user order', () => {
    assert.deepEqual(
      parseAxisOrder('required_level,availability,difficulty'),
      LEGACY_ORDER,
    );
    assert.deepEqual(
      parseAxisOrder('difficulty,required_level,availability'),
      ['difficulty', 'required_level', 'availability'],
    );
  });

  it('tolerates whitespace around tokens', () => {
    assert.deepEqual(
      parseAxisOrder(' difficulty , required_level , availability '),
      ['difficulty', 'required_level', 'availability'],
    );
  });

  it('partial CSV (2 axes) appends missing axis in default order', () => {
    // User picked difficulty, availability — required_level missing.
    // Missing axis appended from DEFAULT_AXIS_ORDER (difficulty → required_level → availability).
    const got = parseAxisOrder('difficulty,availability');
    assert.deepEqual(got, ['difficulty', 'availability', 'required_level']);
  });

  it('single-axis CSV appends the other two in default order', () => {
    const got = parseAxisOrder('availability');
    assert.deepEqual(got, ['availability', 'difficulty', 'required_level']);
  });

  it('duplicates deduped on first occurrence', () => {
    const got = parseAxisOrder('availability,difficulty,availability,required_level');
    assert.deepEqual(got, ['availability', 'difficulty', 'required_level']);
  });

  it('mixes valid + garbage tokens — drops garbage, appends missing', () => {
    const got = parseAxisOrder('difficulty,foo,required_level');
    assert.deepEqual(got, ['difficulty', 'required_level', 'availability']);
  });

  it('KNOWN_AXES matches the 3 canonical names', () => {
    assert.deepEqual(
      [...KNOWN_AXES].sort(),
      ['availability', 'difficulty', 'required_level'],
    );
  });

  it('DEFAULT_AXIS_ORDER is difficulty → required → availability', () => {
    assert.deepEqual(DEFAULT_AXIS_ORDER, ['difficulty', 'required_level', 'availability']);
  });
});

// ── buildSortComparator ─────────────────────────────────────────────────

// Fixture: 4 peers with distinct (required, availability, difficulty) triples.
// Shape matches keyBundler's `eligible` input (fieldKey + fieldRule).
const FIXTURE = [
  { fieldKey: 'mand_rare_easy',    fieldRule: { required_level: 'mandatory',     availability: 'rare',     difficulty: 'easy'   } },
  { fieldKey: 'mand_always_hard',  fieldRule: { required_level: 'mandatory',     availability: 'always',   difficulty: 'hard'   } },
  { fieldKey: 'opt_always_easy',   fieldRule: { required_level: 'non_mandatory', availability: 'always',   difficulty: 'easy'   } },
  { fieldKey: 'opt_rare_very_hard', fieldRule: { required_level: 'non_mandatory', availability: 'rare',     difficulty: 'very_hard' } },
];

function sorted(fixture, comparator) {
  return [...fixture].sort(comparator).map((x) => x.fieldKey);
}

describe('buildSortComparator — legacy axis order (required → availability → difficulty)', () => {
  it('mandatory always packs before non_mandatory regardless of other axes', () => {
    const cmp = buildSortComparator(LEGACY_ORDER, { tiebreaker: 'none' });
    const out = sorted(FIXTURE, cmp);
    // All mandatories first (sorted among themselves by availability then difficulty):
    //   mand_always_hard (always) < mand_rare_easy (rare)
    // Then non_mandatories:
    //   opt_always_easy (always+easy) < opt_rare_very_hard
    assert.deepEqual(out, [
      'mand_always_hard',
      'mand_rare_easy',
      'opt_always_easy',
      'opt_rare_very_hard',
    ]);
  });
});

describe('buildSortComparator — default axis order (difficulty → required → availability)', () => {
  it('easy peers pack before hard peers regardless of required_level', () => {
    const cmp = buildSortComparator(DEFAULT_AXIS_ORDER, { tiebreaker: 'none' });
    const out = sorted(FIXTURE, cmp);
    // Easies first — within easy, mandatory beats non_mandatory:
    //   mand_rare_easy (easy+mand)   < opt_always_easy (easy+opt)
    //   then mand_always_hard (hard) < opt_rare_very_hard
    assert.deepEqual(out, [
      'mand_rare_easy',
      'opt_always_easy',
      'mand_always_hard',
      'opt_rare_very_hard',
    ]);
  });

  it('at equal difficulty + required, availability breaks the tie', () => {
    const fixture = [
      { fieldKey: 'rare_e',    fieldRule: { required_level: 'mandatory', availability: 'rare',      difficulty: 'easy' } },
      { fieldKey: 'always_e',  fieldRule: { required_level: 'mandatory', availability: 'always',    difficulty: 'easy' } },
      { fieldKey: 'somet_e',   fieldRule: { required_level: 'mandatory', availability: 'sometimes', difficulty: 'easy' } },
    ];
    const cmp = buildSortComparator(DEFAULT_AXIS_ORDER, { tiebreaker: 'none' });
    assert.deepEqual(sorted(fixture, cmp), ['always_e', 'somet_e', 'rare_e']);
  });

  it('field_key is final tiebreaker when all axes tie', () => {
    const fixture = [
      { fieldKey: 'zulu',  fieldRule: { required_level: 'mandatory', availability: 'always', difficulty: 'easy' } },
      { fieldKey: 'alpha', fieldRule: { required_level: 'mandatory', availability: 'always', difficulty: 'easy' } },
      { fieldKey: 'mango', fieldRule: { required_level: 'mandatory', availability: 'always', difficulty: 'easy' } },
    ];
    const cmp = buildSortComparator(DEFAULT_AXIS_ORDER, { tiebreaker: 'none' });
    assert.deepEqual(sorted(fixture, cmp), ['alpha', 'mango', 'zulu']);
  });
});

describe('buildSortComparator — currentRides tiebreaker (bundler only)', () => {
  it('tiebreaker=currentRides sorts same-axis peers by rides ASC before field_key', () => {
    const fixture = [
      { fieldKey: 'x', fieldRule: { required_level: 'mandatory', availability: 'always', difficulty: 'easy' }, currentRides: 4 },
      { fieldKey: 'y', fieldRule: { required_level: 'mandatory', availability: 'always', difficulty: 'easy' }, currentRides: 0 },
      { fieldKey: 'z', fieldRule: { required_level: 'mandatory', availability: 'always', difficulty: 'easy' }, currentRides: 2 },
    ];
    const cmp = buildSortComparator(DEFAULT_AXIS_ORDER, { tiebreaker: 'currentRides' });
    assert.deepEqual(sorted(fixture, cmp), ['y', 'z', 'x']);
  });

  it('tiebreaker=none ignores currentRides (frontend Loop chain mode)', () => {
    // Same fixture as above — without rides tiebreaker, field_key decides.
    const fixture = [
      { fieldKey: 'x', fieldRule: { required_level: 'mandatory', availability: 'always', difficulty: 'easy' }, currentRides: 4 },
      { fieldKey: 'y', fieldRule: { required_level: 'mandatory', availability: 'always', difficulty: 'easy' }, currentRides: 0 },
      { fieldKey: 'z', fieldRule: { required_level: 'mandatory', availability: 'always', difficulty: 'easy' }, currentRides: 2 },
    ];
    const cmp = buildSortComparator(DEFAULT_AXIS_ORDER, { tiebreaker: 'none' });
    assert.deepEqual(sorted(fixture, cmp), ['x', 'y', 'z']);
  });

  it('treats missing currentRides as 0', () => {
    const fixture = [
      { fieldKey: 'a', fieldRule: { required_level: 'mandatory', availability: 'always', difficulty: 'easy' }, currentRides: 5 },
      { fieldKey: 'b', fieldRule: { required_level: 'mandatory', availability: 'always', difficulty: 'easy' } }, // undefined
    ];
    const cmp = buildSortComparator(DEFAULT_AXIS_ORDER, { tiebreaker: 'currentRides' });
    assert.deepEqual(sorted(fixture, cmp), ['b', 'a']);
  });
});

describe('buildSortComparator — axis-value fallbacks (defensive)', () => {
  it('unknown axis value sorts to the back (higher rank than known values)', () => {
    const fixture = [
      { fieldKey: 'bogus', fieldRule: { required_level: 'mandatory', availability: 'always', difficulty: 'whatever' } },
      { fieldKey: 'easy',  fieldRule: { required_level: 'mandatory', availability: 'always', difficulty: 'easy' } },
    ];
    const cmp = buildSortComparator(DEFAULT_AXIS_ORDER, { tiebreaker: 'none' });
    assert.deepEqual(sorted(fixture, cmp), ['easy', 'bogus']);
  });

  it('empty required_level sorts after non_mandatory', () => {
    const fixture = [
      { fieldKey: 'empty', fieldRule: { required_level: '',              availability: 'always', difficulty: 'easy' } },
      { fieldKey: 'opt',   fieldRule: { required_level: 'non_mandatory', availability: 'always', difficulty: 'easy' } },
    ];
    const cmp = buildSortComparator(['required_level', 'difficulty', 'availability'], { tiebreaker: 'none' });
    assert.deepEqual(sorted(fixture, cmp), ['opt', 'empty']);
  });
});
