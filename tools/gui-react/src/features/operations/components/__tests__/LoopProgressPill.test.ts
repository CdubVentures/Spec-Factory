import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

/*
 * LoopProgressPill is a React component — per repo convention (node --test, no
 * jsdom/vitest) we test the extracted label / icon / chip-class / bar-color
 * helpers directly. Renders are exercised only indirectly by bun build passing.
 */

type PillPublish = { count: number; target: number; satisfied: boolean; confidence: number | null };
type PillCallBudget = { used: number; budget: number; exhausted: boolean };
type FinalStatus = 'published' | 'definitive_unk' | 'budget_exhausted' | 'skipped_resolved' | 'aborted' | null;

let publishLineIcon: (pub: PillPublish, final: FinalStatus) => string;
let publishLineText: (pub: PillPublish, final: FinalStatus) => string;
let statusChipClass: (status: NonNullable<FinalStatus>) => string;
let isBarDanger: (pub: PillPublish, cb: PillCallBudget) => boolean;

before(async () => {
  const mod = await loadBundledModule(
    'tools/gui-react/src/features/operations/components/LoopProgressPill.tsx',
    {
      prefix: 'loop-progress-pill-',
      stubs: {
        'react/jsx-runtime': `
          export function jsx(type, props) { return { type, props: props || {} }; }
          export const jsxs = jsx;
          export const Fragment = Symbol.for('fragment');
        `,
      },
    },
  );
  ({ publishLineIcon, publishLineText, statusChipClass, isBarDanger } = mod);
});

const notSatisfied: PillPublish = { count: 0, target: 1, satisfied: false, confidence: null };
const satisfied88: PillPublish = { count: 1, target: 1, satisfied: true, confidence: 88 };
const satisfiedNoConf: PillPublish = { count: 1, target: 1, satisfied: true, confidence: null };

describe('publishLineIcon', () => {
  it('returns check for satisfied rows regardless of final_status', () => {
    assert.equal(publishLineIcon(satisfied88, null), '\u2713');
    assert.equal(publishLineIcon(satisfied88, 'published'), '\u2713');
  });

  it('returns cross when loop terminated in a failure state (unk / budget / aborted)', () => {
    assert.equal(publishLineIcon(notSatisfied, 'definitive_unk'), '\u2717');
    assert.equal(publishLineIcon(notSatisfied, 'budget_exhausted'), '\u2717');
    assert.equal(publishLineIcon(notSatisfied, 'aborted'), '\u2717');
  });

  it('returns dot while loop is still running (final_status=null, not satisfied)', () => {
    assert.equal(publishLineIcon(notSatisfied, null), '\u00B7');
  });

  it('returns dot for skipped_resolved (target met because pre-resolved; no failure)', () => {
    // NOTE: skipped_resolved sets publish.satisfied=true in keyFinderLoop, so
    // this path would normally hit the satisfied branch. Guard anyway.
    assert.equal(publishLineIcon(notSatisfied, 'skipped_resolved'), '\u00B7');
  });
});

describe('publishLineText', () => {
  it('renders "1/1 published · conf 88" when satisfied with confidence', () => {
    assert.equal(publishLineText(satisfied88, 'published'), '1/1 published \u00B7 conf 88');
  });

  it('renders "1/1 published" with no confidence segment when confidence is null (RDF/SKU)', () => {
    assert.equal(publishLineText(satisfiedNoConf, 'published'), '1/1 published');
  });

  it('renders "0/1 not yet" during intermediate iteration (final_status=null)', () => {
    assert.equal(publishLineText(notSatisfied, null), '0/1 not yet');
  });

  it('renders "0/1 definitive unk" on terminal definitive_unk', () => {
    assert.equal(publishLineText(notSatisfied, 'definitive_unk'), '0/1 definitive unk');
  });

  it('renders "0/1 budget exhausted" on terminal budget_exhausted', () => {
    assert.equal(publishLineText(notSatisfied, 'budget_exhausted'), '0/1 budget exhausted');
  });

  it('renders "0/1 aborted" on terminal aborted', () => {
    assert.equal(publishLineText(notSatisfied, 'aborted'), '0/1 aborted');
  });

  it('renders skipped path', () => {
    // When skipped, keyFinderLoop emits count=target=1, satisfied=true, confidence=null.
    const skippedShape: PillPublish = { count: 1, target: 1, satisfied: true, confidence: null };
    // satisfied wins over "skipped" text since satisfied branch fires first.
    assert.equal(publishLineText(skippedShape, 'skipped_resolved'), '1/1 published');
  });

  it('renders multi-count publish target (e.g. RDF multi-field batched)', () => {
    const multi: PillPublish = { count: 2, target: 5, satisfied: false, confidence: null };
    assert.equal(publishLineText(multi, null), '2/5 not yet');
  });
});

describe('statusChipClass', () => {
  it('returns success class for published', () => {
    assert.equal(statusChipClass('published'), 'sf-text-success');
  });

  it('returns subtle class for skipped_resolved', () => {
    assert.equal(statusChipClass('skipped_resolved'), 'sf-text-subtle');
  });

  it('returns danger class for unk / budget / aborted', () => {
    assert.equal(statusChipClass('definitive_unk'), 'text-[var(--sf-state-danger-fg)]');
    assert.equal(statusChipClass('budget_exhausted'), 'text-[var(--sf-state-danger-fg)]');
    assert.equal(statusChipClass('aborted'), 'text-[var(--sf-state-danger-fg)]');
  });
});

describe('isBarDanger', () => {
  it('returns true ONLY when budget is exhausted AND publish did not satisfy', () => {
    assert.equal(isBarDanger(notSatisfied, { used: 5, budget: 5, exhausted: true }), true);
  });

  it('returns false when budget is exhausted but target was met early', () => {
    // Shouldn't visually panic the user — they already got what they wanted.
    assert.equal(isBarDanger(satisfied88, { used: 5, budget: 5, exhausted: true }), false);
  });

  it('returns false when budget is NOT exhausted, satisfied or not', () => {
    assert.equal(isBarDanger(notSatisfied, { used: 2, budget: 5, exhausted: false }), false);
    assert.equal(isBarDanger(satisfied88, { used: 2, budget: 5, exhausted: false }), false);
  });

  it('returns false when budget=0 (skip path — never "dangerous")', () => {
    assert.equal(isBarDanger(notSatisfied, { used: 0, budget: 0, exhausted: false }), false);
  });
});
