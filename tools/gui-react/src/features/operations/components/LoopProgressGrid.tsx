// WHY: PIF carousel grid renderer. LoopProgressRouter picks this when
// op.loopProgress has the `views[]` / `hero` shape. Visual is unchanged from
// the inline version OperationsTracker originally carried — extracted so the
// Router can compose grid (PIF) + pill (keyFinder + future loops).

import type { CarouselLoopProgress } from '../state/operationsStore.ts';

type CarouselLoopProgressGridInput = CarouselLoopProgress & {
  readonly views: NonNullable<CarouselLoopProgress['views']>;
};

export function LoopProgressGrid({ lp }: { readonly lp: CarouselLoopProgressGridInput }) {
  const variantTotal = lp.variantTotal ?? 1;
  const variantIndex = lp.variantIndex ?? 0;
  const variantPos = variantTotal > 1 ? ` (${variantIndex + 1}/${variantTotal})` : '';
  const target = lp.mode === 'hero' ? 'hero' : (lp.focusView || '\u2013');

  const cells: Array<{ label: string; count: number; target: number; attempts: number; attemptBudget: number; done: boolean; fail: boolean; active: boolean }> = [];
  for (const v of lp.views) {
    cells.push({ label: v.view, count: v.count, target: v.target, attempts: v.attempts, attemptBudget: v.attemptBudget, done: v.satisfied, fail: v.exhausted, active: lp.mode === 'view' && lp.focusView === v.view });
  }
  if (lp.hero) {
    cells.push({ label: 'hero', count: lp.hero.count, target: lp.hero.target, attempts: lp.hero.attempts, attemptBudget: lp.hero.attemptBudget, done: lp.hero.satisfied, fail: lp.hero.exhausted, active: lp.mode === 'hero' });
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] font-mono sf-text-subtle leading-[1.3]">
        {lp.variantLabel}{variantPos} {'\u00B7'} call {lp.callNumber} {'\u00B7'} {lp.mode}: {target} {'\u00B7'} ~{lp.estimatedRemaining} left
      </span>
      <span className="grid gap-x-1.5 gap-y-0" style={{ gridTemplateColumns: `repeat(${Math.min(cells.length, 3)}, 1fr)` }}>
        {cells.map((c) => {
          const icon = c.done ? '\u2713' : c.fail ? '\u2717' : c.active ? '\u25B8' : ' ';
          const cls = c.done
            ? 'sf-text-success'
            : c.fail
              ? 'text-[var(--sf-state-danger-fg)] opacity-50'
              : c.active
                ? 'text-[rgb(var(--sf-color-accent-strong-rgb))]'
                : 'sf-text-subtle opacity-60';
          return (
            <span key={c.label} className={`text-[8px] font-mono font-semibold leading-[1.6] ${cls}`}>
              {icon} {c.label} {c.count}/{c.target}
              <span className="opacity-50 font-normal"> ({c.attempts}/{c.attemptBudget})</span>
            </span>
          );
        })}
      </span>
    </div>
  );
}
