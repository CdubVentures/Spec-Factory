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

type PillBucket = {
  fp: string;
  label: string;
  count: number;
  required: number;
  qualifies: boolean;
  topConf: number | null;
};

let publishLineIcon: (pub: PillPublish, final: FinalStatus) => string;
let publishLineText: (pub: PillPublish, final: FinalStatus) => string;
let statusChipClass: (status: NonNullable<FinalStatus>) => string;
let isBarDanger: (pub: PillPublish, cb: PillCallBudget) => boolean;
let BucketsRow: (props: { buckets: ReadonlyArray<PillBucket> | null | undefined }) => unknown;

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
  ({ publishLineIcon, publishLineText, statusChipClass, isBarDanger, BucketsRow } = mod);
});

function flattenChildren(node: unknown): unknown[] {
  if (node === null || node === undefined || node === false) return [];
  if (Array.isArray(node)) return node.flatMap(flattenChildren);
  return [node];
}

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

describe('BucketsRow', () => {
  it('returns null when buckets is null/undefined/empty', () => {
    assert.equal(BucketsRow({ buckets: null }), null);
    assert.equal(BucketsRow({ buckets: undefined }), null);
    assert.equal(BucketsRow({ buckets: [] }), null);
  });

  it('renders one chip per bucket with count/required and qualify class', () => {
    const node = BucketsRow({ buckets: [
      { fp: 'paw3395', label: 'PAW3395', count: 2, required: 2, qualifies: true, topConf: 94 },
      { fp: 'hero', label: 'HERO', count: 1, required: 2, qualifies: false, topConf: 70 },
    ]}) as { type: string; props: { children?: unknown } };

    const chips = flattenChildren(node.props.children) as Array<{ props: { className?: string; title?: string; children?: unknown } }>;
    assert.equal(chips.length, 2);

    assert.match(String(chips[0].props.className), /sf-chip-success/);
    assert.match(String(chips[0].props.title), /PAW3395/);
    assert.match(String(chips[0].props.title), /2\/2 qualifying refs/);
    assert.match(String(chips[0].props.title), /94%/);

    assert.match(String(chips[1].props.className), /sf-chip-neutral/);
    assert.match(String(chips[1].props.title), /HERO/);
    assert.match(String(chips[1].props.title), /1\/2 qualifying refs/);
  });

  it('renders overflow chip distinctly without count/required', () => {
    const node = BucketsRow({ buckets: [
      { fp: 'a', label: 'A', count: 0, required: 1, qualifies: false, topConf: null },
      { fp: '__more__', label: '+3 more', count: 0, required: 0, qualifies: false, topConf: null },
    ]}) as { type: string; props: { children?: unknown } };
    const chips = flattenChildren(node.props.children) as Array<{ props: { className?: string } }>;
    assert.equal(chips.length, 2);
    const overflowClass = String(chips[1].props.className);
    assert.match(overflowClass, /sf-text-subtle/);
    assert.doesNotMatch(overflowClass, /sf-chip-success/);
    assert.doesNotMatch(overflowClass, /sf-chip-neutral/);
  });

  it('omits "top%" from tooltip when topConf is null', () => {
    const node = BucketsRow({ buckets: [
      { fp: 'x', label: 'X', count: 0, required: 2, qualifies: false, topConf: null },
    ]}) as { type: string; props: { children?: unknown } };
    const chips = flattenChildren(node.props.children) as Array<{ props: { title?: string } }>;
    assert.equal(chips.length, 1);
    assert.doesNotMatch(String(chips[0].props.title), /top/);
  });
});
