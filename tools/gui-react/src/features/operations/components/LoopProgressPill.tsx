// WHY: Canonical two-budget pill renderer for keyFinderLoop + variantFieldLoop
// per the active-operations-upgrade guide §6. Two rows stacked:
//   Row 1 publish — "✓ 1/1 published · conf 88" (or "0/1 not yet", etc.)
//   Row 2 callBudget — "used/budget attempts" with a progress bar that turns
//                      red when the budget ran out BEFORE the target was met.
// A header line carries loop_id (truncated), optional variantLabel chip, and
// a final_status chip when the loop has terminated. PIF keeps LoopProgressGrid.

import type { PillLoopProgress } from '../state/operationsStore.ts';

const STATUS_LABELS: Record<NonNullable<PillLoopProgress['final_status']>, string> = {
  published: 'published',
  definitive_unk: 'definitive unk',
  budget_exhausted: 'budget exhausted',
  skipped_resolved: 'skipped',
  aborted: 'aborted',
};

// WHY: Helpers are exported so the test harness can verify the label /
// icon / chip-class matrix without spinning up a DOM (node --test + no jsdom
// is the repo convention).
export function statusChipClass(status: NonNullable<PillLoopProgress['final_status']>): string {
  if (status === 'published') return 'sf-text-success';
  if (status === 'skipped_resolved') return 'sf-text-subtle';
  return 'text-[var(--sf-state-danger-fg)]';
}

export function publishLineIcon(pub: PillLoopProgress['publish'], final: PillLoopProgress['final_status']): string {
  if (pub.satisfied) return '\u2713'; // ✓
  if (final === 'definitive_unk' || final === 'budget_exhausted' || final === 'aborted') return '\u2717'; // ✗
  return '\u00B7'; // ·
}

export function publishLineText(pub: PillLoopProgress['publish'], final: PillLoopProgress['final_status']): string {
  const core = `${pub.count}/${pub.target}`;
  if (pub.satisfied) {
    const confPart = pub.confidence != null ? ` \u00B7 conf ${pub.confidence}` : '';
    return `${core} published${confPart}`;
  }
  if (final === 'definitive_unk') return `${core} definitive unk`;
  if (final === 'skipped_resolved') return `${core} skipped (resolved)`;
  if (final === 'budget_exhausted') return `${core} budget exhausted`;
  if (final === 'aborted') return `${core} aborted`;
  return `${core} not yet`;
}

export function isBarDanger(pub: PillLoopProgress['publish'], cb: PillLoopProgress['callBudget']): boolean {
  return cb.exhausted && !pub.satisfied;
}

export function LoopProgressPill({ lp }: { readonly lp: PillLoopProgress }) {
  const { publish, callBudget, final_status, loop_id, variantLabel } = lp;
  const pctUsed = callBudget.budget > 0
    ? Math.min(100, Math.round((callBudget.used / callBudget.budget) * 100))
    : 0;
  // Bar turns red only when the budget ran out without meeting the target —
  // signals "we ran out of attempts" visually distinct from "target met early".
  const barDanger = isBarDanger(publish, callBudget);
  const shortLoopId = loop_id.slice(0, 8);

  return (
    <div className="flex flex-col gap-0.5">
      {/* Header: loop_id · variantLabel chip · final_status chip */}
      <span className="flex items-center gap-1.5 text-[9px] font-mono sf-text-subtle leading-[1.3]">
        <span className="opacity-60">{shortLoopId}</span>
        {variantLabel && (
          <span className="inline-flex items-center px-1 text-[8px] font-mono rounded-[2px] border border-current leading-[1.5] sf-chip-neutral">
            {variantLabel}
          </span>
        )}
        {final_status && (
          <span className={`inline-flex items-center px-1 text-[8px] font-bold font-mono uppercase rounded-[2px] border border-current leading-[1.5] ${statusChipClass(final_status)}`}>
            {STATUS_LABELS[final_status]}
          </span>
        )}
      </span>

      {/* Row 1: publish */}
      <span className={`text-[9px] font-mono font-semibold leading-[1.4] ${publish.satisfied ? 'sf-text-success' : (final_status ? 'sf-text-subtle' : 'sf-text-muted')}`}>
        {publishLineIcon(publish, final_status)} {publishLineText(publish, final_status)}
      </span>

      {/* Row 2: callBudget attempts + progress bar. "call N/M" makes the
          current-in-flight iteration explicit; "N left" surfaces the remaining
          budget so the user doesn't have to do the math. */}
      <span className="flex items-center gap-1.5 text-[9px] font-mono sf-text-subtle leading-[1.3]">
        <span className="shrink-0">
          call <strong className="sf-text-primary font-semibold">{callBudget.used}/{callBudget.budget}</strong>
          {!final_status && callBudget.budget - callBudget.used > 0 && (
            <span className="opacity-60"> {'\u00B7'} {callBudget.budget - callBudget.used} left</span>
          )}
        </span>
        <span
          aria-hidden="true"
          className="flex-1 h-[3px] rounded-[1px] overflow-hidden bg-[rgb(var(--sf-color-surface-elevated-rgb)/0.6)] border border-[rgb(var(--sf-color-border-subtle-rgb)/0.3)]"
        >
          <span
            className={`block h-full ${barDanger
              ? 'bg-[var(--sf-state-danger-fg)]'
              : 'bg-[rgb(var(--sf-color-accent-strong-rgb))]'}`}
            style={{ width: `${pctUsed}%` }}
          />
        </span>
      </span>
    </div>
  );
}
