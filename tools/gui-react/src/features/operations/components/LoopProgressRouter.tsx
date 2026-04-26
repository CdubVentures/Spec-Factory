// WHY: Single entry point that shape-detects op.loopProgress and renders the
// correct component. PIF wins the first branch (its view[] shape is unique);
// everything else with the canonical {publish, callBudget} pill shape falls
// through to the second branch. Unrecognized shapes render nothing — the same
// silent behavior the frontend had before the pill existed.

import { memo } from 'react';
import type { LoopProgress } from '../state/operationsStore.ts';
import { isCarouselLoopProgress, isPillLoopProgress } from '../state/operationsStore.ts';
import { LoopProgressGrid } from './LoopProgressGrid.tsx';
import { LoopProgressPill } from './LoopProgressPill.tsx';

// WHY: Memoized so an OpCard re-render (e.g. status flip) doesn't redraw the
// loop-progress subtree when `lp` reference is unchanged. Inside an OpCard
// that's already memoized, this is mostly belt-and-suspenders — but cheap.
export const LoopProgressRouter = memo(function LoopProgressRouterInner({ lp }: { readonly lp: LoopProgress | null | undefined }) {
  if (!lp) return null;
  if (isCarouselLoopProgress(lp)) return <LoopProgressGrid lp={lp} />;
  if (isPillLoopProgress(lp)) return <LoopProgressPill lp={lp} />;
  return null;
});
