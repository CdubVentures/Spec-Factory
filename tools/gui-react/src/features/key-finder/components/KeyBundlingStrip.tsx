/**
 * KeyBundlingStrip — top-of-panel status row showing the 3 critical bundling
 * knobs at a glance (enabled / scope / passenger-difficulty policy) as plain
 * text. Data comes from GET /key-finder/:cat/bundling-config. Refetches on
 * the 'settings' WS domain.
 */

import { memo } from 'react';
import type { BundlingConfig } from '../api/keyFinderQueries.ts';
import { useKeyFinderBundlingConfigQuery } from '../api/keyFinderQueries.ts';

const POLICY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  less_or_equal: 'same or easier',
  same_only: 'same only',
  any_but_very_hard: 'any except very_hard',
  any_but_hard_very_hard: 'easy + medium only',
});

function formatCost(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '?';
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

interface KeyBundlingStripProps {
  readonly category: string;
  readonly productId: string;
}

export const KeyBundlingStrip = memo(function KeyBundlingStrip({ category, productId }: KeyBundlingStripProps) {
  const { data, isLoading } = useKeyFinderBundlingConfigQuery(category, productId);
  if (isLoading || !data) return null;

  const cfg: BundlingConfig = data;
  const scopeLabel = cfg.groupBundlingOnly ? 'same-group only' : 'cross-group';
  const policyLabel = POLICY_LABELS[cfg.passengerDifficultyPolicy] || cfg.passengerDifficultyPolicy;
  const pool = cfg.poolPerPrimary || {};
  const cost = cfg.passengerCost || {};
  const surcharge = Number.isFinite(cfg.passengerVariantCostPerExtra)
    ? cfg.passengerVariantCostPerExtra
    : 0;
  const extraFamilyMembers = Math.max(0, Math.floor(cfg.familySize || 1) - 1);
  const effective = (base: number | undefined) => (
    Number.isFinite(base) ? Number(base) + (extraFamilyMembers * surcharge) : undefined
  );

  return (
    <div className="flex items-center gap-6 px-5 py-2 sf-surface-soft border-b sf-border-soft flex-wrap text-[11.5px]">
      <span className="font-bold uppercase tracking-wide sf-text-muted">Bundling</span>

      <span className="sf-text-primary">
        <span className="sf-text-muted">status: </span>
        <span className="font-semibold">{cfg.enabled ? 'ON' : 'OFF'}</span>
      </span>

      {cfg.enabled && (
        <>
          <span className="sf-text-primary">
            <span className="sf-text-muted">scope: </span>
            <span>{scopeLabel}</span>
          </span>
          <span className="sf-text-primary">
            <span className="sf-text-muted">policy: </span>
            <span>{policyLabel}</span>
          </span>
          <span
            className="sf-text-primary font-mono text-[11px]"
            title={`Primary pool caps how many points a primary can spend on passengers:\n  easy primary: ${pool.easy ?? '?'} pts\n  medium primary: ${pool.medium ?? '?'} pts\n  hard primary: ${pool.hard ?? '?'} pts\n  very_hard primary: ${pool.very_hard ?? '?'} pts`}
          >
            <span className="sf-text-muted font-sans">pool: </span>
            e{pool.easy ?? '?'}/m{pool.medium ?? '?'}/h{pool.hard ?? '?'}/v{pool.very_hard ?? '?'}
          </span>
          <span
            className="sf-text-primary font-mono text-[11px]"
            title={`Passenger cost by difficulty. Effective cost adds ${formatCost(surcharge)} for each product-family member beyond the first (${cfg.familySize} products in family):\n  easy: ${formatCost(cost.easy)} -> ${formatCost(effective(cost.easy))}\n  medium: ${formatCost(cost.medium)} -> ${formatCost(effective(cost.medium))}\n  hard: ${formatCost(cost.hard)} -> ${formatCost(effective(cost.hard))}\n  very_hard: ${formatCost(cost.very_hard)} -> ${formatCost(effective(cost.very_hard))}`}
          >
            <span className="sf-text-muted font-sans">cost: </span>
            e{formatCost(effective(cost.easy))}/m{formatCost(effective(cost.medium))}/h{formatCost(effective(cost.hard))}/v{formatCost(effective(cost.very_hard))}
          </span>
        </>
      )}

      <span className="ml-auto sf-text-subtle italic text-[11px]">
        Pipeline Settings → Key Finder → Bundling
      </span>
    </div>
  );
});
