import type { KeyTierProgressGen } from '../../types/product.generated.ts';
import { buildRingDasharray } from './pifRingMath.ts';
import { useIsModuleRunning } from '../../features/operations/hooks/useFinderOperations.ts';
import { KeyTierPopover, type KeyTierName } from './KeyTierPopover.tsx';
import './KeyTierRings.css';

export interface KeyTierRingsProps {
  readonly productId: string;
  readonly category: string;
  readonly tiers: readonly KeyTierProgressGen[];
}

const TIER_LABEL: Readonly<Record<string, string>> = {
  easy: 'E',
  medium: 'M',
  hard: 'H',
  very_hard: 'VH',
  mandatory: '\u2605', // ★
};

function ringState(filled: number, target: number): 'done' | 'part' | 'empty' {
  if (target > 0 && filled >= target) return 'done';
  if (filled > 0) return 'part';
  return 'empty';
}

function isKnownTier(t: string): t is KeyTierName {
  return t === 'easy' || t === 'medium' || t === 'hard' || t === 'very_hard' || t === 'mandatory';
}

/**
 * 5-cluster KeyFinder progress cell — each tier is now a clickable popover
 * trigger that opens a filtered, group-ordered list of keys with Run + Loop
 * actions per key. When any keyFinder op is running for this product, every
 * tier's SVG pulses; individual key rows inside the popover pulse on their
 * own when that specific field_key is in flight.
 */
export function KeyTierRings({ productId, category, tiers }: KeyTierRingsProps) {
  const anyKfRunning = useIsModuleRunning('kf', productId);
  if (!tiers.length) {
    return <span className="sf-text-subtle text-xs italic">—</span>;
  }
  return (
    <span className={`sf-ktr-strip${anyKfRunning ? ' sf-pulsing' : ''}`}>
      {tiers.map((t) => {
        const total = Number(t.total) || 0;
        const resolved = Number(t.resolved) || 0;
        const perfect = Number(t.perfect) || 0;
        const isMandatory = t.tier === 'mandatory';
        const label = TIER_LABEL[t.tier] ?? t.tier;
        if (!isKnownTier(t.tier)) return null;

        const clusterBody = total === 0 ? (
          <span className="sf-ktr-cluster sf-ktr-empty">
            <span className={`sf-ktr-label${isMandatory ? ' sf-ktr-mandatory' : ''}`}>{label}</span>
            <svg className="sf-ktr-svg" viewBox="0 0 50 50" aria-hidden>
              <circle className="sf-ktr-track" cx="25" cy="25" r="21"/>
              <circle className="sf-ktr-track" cx="25" cy="25" r="12"/>
            </svg>
            <span className="sf-ktr-frac">—</span>
          </span>
        ) : (() => {
          const outer = buildRingDasharray({ filled: resolved, target: total, radius: 21 });
          const inner = buildRingDasharray({ filled: perfect, target: total, radius: 12 });
          const outerState = ringState(resolved, total);
          const innerState = ringState(perfect, total);
          return (
            <span className="sf-ktr-cluster">
              <span className={`sf-ktr-label${isMandatory ? ' sf-ktr-mandatory' : ''}`}>{label}</span>
              <svg className="sf-ktr-svg" viewBox="0 0 50 50" aria-hidden>
                <circle
                  className={`sf-ktr-track sf-ktr-track-outer ${outerState}`}
                  cx="25" cy="25" r="21"
                  {...(outer.track ? { strokeDasharray: outer.track } : {})}
                />
                {outer.fill && (
                  <circle
                    className={`sf-ktr-fill sf-ktr-fill-outer ${outerState}`}
                    cx="25" cy="25" r="21"
                    strokeDasharray={outer.fill}
                  />
                )}
                <circle
                  className={`sf-ktr-track sf-ktr-track-inner ${innerState}`}
                  cx="25" cy="25" r="12"
                  {...(inner.track ? { strokeDasharray: inner.track } : {})}
                />
                {inner.fill && (
                  <circle
                    className={`sf-ktr-fill sf-ktr-fill-inner ${innerState}`}
                    cx="25" cy="25" r="12"
                    strokeDasharray={inner.fill}
                  />
                )}
              </svg>
              <span className="sf-ktr-frac">
                <span className="sf-ktr-frac-resolved">{resolved}</span>
                <span className="sf-ktr-frac-sep">/</span>
                <span className="sf-ktr-frac-total">{total}</span>
              </span>
            </span>
          );
        })();

        return (
          <KeyTierPopover
            key={t.tier}
            productId={productId}
            category={category}
            tier={t.tier}
            resolved={resolved}
            total={total}
            trigger={clusterBody}
          />
        );
      })}
    </span>
  );
}
