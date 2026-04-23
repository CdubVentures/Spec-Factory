import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

/*
 * LoopProgressPill is a React component — per repo convention (node --test, no
 * jsdom/vitest) we test the extracted label / icon / chip-class / bar-color
 * helpers directly. Renders are exercised only indirectly by `npm run build`.
 */

type PillPublish = {
  evidenceCount: number;
  evidenceTarget: number;
  satisfied: boolean;
  confidence: number | null;
  threshold: number | null;
};
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

const notSatisfied: PillPublish = {
  evidenceCount: 0, evidenceTarget: 1, satisfied: false, confidence: null, threshold: 95,
};
const satisfied88: PillPublish = {
  evidenceCount: 1, evidenceTarget: 1, satisfied: true, confidence: 88, threshold: 70,
};
const satisfiedNoConf: PillPublish = {
  evidenceCount: 1, evidenceTarget: 1, satisfied: true, confidence: null, threshold: 95,
};

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
});

describe('publishLineText (publisher-driven)', () => {
  it('renders "1/1 evidence · 88 conf" when satisfied with confidence', () => {
    assert.equal(publishLineText(satisfied88, 'published'), '1/1 evidence \u00B7 88 conf');
  });

  it('renders "1/1 evidence published" when satisfied with no confidence (RDF/SKU stub)', () => {
    assert.equal(publishLineText(satisfiedNoConf, 'published'), '1/1 evidence published');
  });

  it('renders "0/1 evidence · need ≥95 conf" during pre-iter (no candidate yet, threshold known)', () => {
    assert.equal(publishLineText(notSatisfied, null), '0/1 evidence \u00B7 need \u226595 conf');
  });

  it('renders "1/2 evidence · 70 conf (need ≥95)" during post-iter (latest candidate below threshold)', () => {
    const inFlight: PillPublish = {
      evidenceCount: 1, evidenceTarget: 2, satisfied: false, confidence: 70, threshold: 95,
    };
    assert.equal(publishLineText(inFlight, null), '1/2 evidence \u00B7 70 conf (need \u226595)');
  });

  it('renders "0/2 evidence · need ≥95 conf" terminal definitive_unk', () => {
    const unk: PillPublish = {
      evidenceCount: 0, evidenceTarget: 2, satisfied: false, confidence: null, threshold: 95,
    };
    assert.equal(publishLineText(unk, 'definitive_unk'), '0/2 evidence \u00B7 need \u226595 conf');
  });

  it('renders "1/2 evidence · 60 conf (need ≥95)" terminal budget_exhausted', () => {
    const exhausted: PillPublish = {
      evidenceCount: 1, evidenceTarget: 2, satisfied: false, confidence: 60, threshold: 95,
    };
    assert.equal(publishLineText(exhausted, 'budget_exhausted'), '1/2 evidence \u00B7 60 conf (need \u226595)');
  });

  it('renders "1/1 evidence · skipped (resolved)" for skipped_resolved (already resolved at entry)', () => {
    const skipped: PillPublish = {
      evidenceCount: 1, evidenceTarget: 1, satisfied: true, confidence: null, threshold: 95,
    };
    assert.equal(publishLineText(skipped, 'skipped_resolved'), '1/1 evidence \u00B7 skipped (resolved)');
  });

  it('renders bare "0/1 evidence" when nothing is known (no candidate, no threshold)', () => {
    const bare: PillPublish = {
      evidenceCount: 0, evidenceTarget: 1, satisfied: false, confidence: null, threshold: null,
    };
    assert.equal(publishLineText(bare, null), '0/1 evidence');
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
