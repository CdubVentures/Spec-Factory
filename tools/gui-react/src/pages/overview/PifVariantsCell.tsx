import { memo } from 'react';
import type { PifVariantProgressGen } from '../../types/product.generated.ts';
import { useRunningVariantKeysAny } from '../../features/operations/hooks/useFinderOperations.ts';
import { PifVariantPopover } from './PifVariantPopover.tsx';
import './PifVariantRings.css';

export interface PifVariantsCellProps {
  readonly productId: string;
  readonly category: string;
  readonly variants: readonly PifVariantProgressGen[];
  readonly pifDependencyReady?: boolean;
  readonly pifDependencyMissingKeys?: readonly string[];
  readonly hexMap: ReadonlyMap<string, string>;
  readonly brand: string;
  readonly baseModel: string;
}

/**
 * Overview PIF cell — one clickable popover-trigger cluster per variant.
 * Each cluster is color chip + 3-ring progress + fraction; clicking opens a
 * per-variant popover with Run View / Hero / Loop / Evaluate actions.
 */
function PifVariantsCellInner({
  productId,
  category,
  variants,
  pifDependencyReady,
  pifDependencyMissingKeys = [],
  hexMap,
  brand,
  baseModel,
}: PifVariantsCellProps) {
  // Subscribe once per product; each variant reads from the shared set so we
  // don't multiply store subscriptions across 5–10 variants × 359 products.
  const runningKeys = useRunningVariantKeysAny('pif', productId);
  if (!variants.length) {
    return <span className="sf-text-subtle text-xs italic">—</span>;
  }
  return (
    <span className="inline-flex gap-2.5 flex-wrap items-start">
      {variants.map((v) => (
        <PifVariantPopover
          key={v.variant_id}
          productId={productId}
          category={category}
          variant={v}
          pifDependencyReady={pifDependencyReady}
          pifDependencyMissingKeys={pifDependencyMissingKeys}
          hexMap={hexMap}
          brand={brand}
          baseModel={baseModel}
          pulsing={runningKeys.has(v.variant_key)}
        />
      ))}
    </span>
  );
}

// WHY: Memoized so a parent re-render of OverviewPage (e.g. filter changes,
// active-row recompute) doesn't cascade into 350-600 cell re-renders. Parent
// passes stable refs (hexMap useMemo, category from store, scalars from row).
export const PifVariantsCell = memo(PifVariantsCellInner);
