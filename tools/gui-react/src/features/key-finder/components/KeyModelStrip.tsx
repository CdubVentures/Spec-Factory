/**
 * KeyModelStrip — four difficulty-tier chips rendered inside the Key panel's
 * unified header model slot. Uses the same FinderRunModelBadge component the
 * other finder panels use, so the visual language is identical across CEF,
 * PIF, RDF, SKU, Pipeline, and Key — only the tier labelPrefix differs.
 */

import { FinderRunModelBadge } from '../../../shared/ui/finder/FinderRunModelBadge.tsx';
import { FinderModelPickerPopover } from '../../../shared/ui/finder/FinderModelPickerPopover.tsx';
import { useKeyDifficultyModelMap } from '../hooks/useKeyDifficultyModelMap.ts';
import type { DifficultyTier } from '../hooks/useKeyDifficultyModelMap.ts';

interface TierSpec {
  readonly tier: DifficultyTier;
  readonly label: string;
  readonly title: string;
}

const TIERS: readonly TierSpec[] = [
  { tier: 'easy',      label: 'EASY',   title: 'KF - Easy Tier' },
  { tier: 'medium',    label: 'MED',    title: 'KF - Medium Tier' },
  { tier: 'hard',      label: 'HARD',   title: 'KF - Hard Tier' },
  { tier: 'very_hard', label: 'V.HARD', title: 'KF - Very Hard Tier' },
];

export function KeyModelStrip() {
  const map = useKeyDifficultyModelMap();
  return (
    <>
      {TIERS.map((t) => {
        const r = map[t.tier];
        const badge = (
          <FinderRunModelBadge
            labelPrefix={t.label}
            model={r.model}
            accessMode={r.accessMode}
            thinking={r.thinking}
            webSearch={r.webSearch}
            effortLevel={r.effortLevel}
          />
        );
        return (
          <FinderModelPickerPopover
            key={t.tier}
            binding="kfTier"
            tier={t.tier}
            title={t.title}
            trigger={badge}
          />
        );
      })}
    </>
  );
}
