/**
 * KeyModelStrip — four difficulty-tier chips rendered inside the Key panel's
 * unified header model slot. Uses the same FinderRunModelBadge component the
 * other finder panels use, so the visual language is identical across CEF,
 * PIF, RDF, SKU, Pipeline, and Key — only the tier labelPrefix differs.
 */

import { FinderRunModelBadge } from '../../../shared/ui/finder/FinderRunModelBadge.tsx';
import { useKeyDifficultyModelMap } from '../hooks/useKeyDifficultyModelMap.ts';
import type { DifficultyTier } from '../hooks/useKeyDifficultyModelMap.ts';

interface TierSpec {
  readonly tier: DifficultyTier;
  readonly label: string;
}

const TIERS: readonly TierSpec[] = [
  { tier: 'easy',      label: 'EASY' },
  { tier: 'medium',    label: 'MED' },
  { tier: 'hard',      label: 'HARD' },
  { tier: 'very_hard', label: 'V.HARD' },
];

export function KeyModelStrip() {
  const map = useKeyDifficultyModelMap();
  return (
    <>
      {TIERS.map((t) => {
        const r = map[t.tier];
        return (
          <FinderRunModelBadge
            key={t.tier}
            labelPrefix={t.label}
            model={r.model}
            accessMode={r.accessMode}
            thinking={r.thinking}
            webSearch={r.webSearch}
            effortLevel={r.effortLevel}
          />
        );
      })}
    </>
  );
}
