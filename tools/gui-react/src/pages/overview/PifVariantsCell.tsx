import type { PifVariantProgressGen } from '../../types/product.generated.ts';
import { useRunningVariantKeysAny } from '../../features/operations/hooks/useFinderOperations.ts';
import { PifVariantPopover } from './PifVariantPopover.tsx';
import './PifVariantRings.css';

export interface PifVariantsCellProps {
  readonly productId: string;
  readonly category: string;
  readonly variants: readonly PifVariantProgressGen[];
  readonly hexMap: ReadonlyMap<string, string>;
}

/**
 * Overview PIF cell — one clickable popover-trigger cluster per variant.
 * Each cluster is color chip + 3-ring progress + fraction; clicking opens a
 * per-variant popover with Run View / Hero / Loop / Evaluate actions.
 */
export function PifVariantsCell({ productId, category, variants, hexMap }: PifVariantsCellProps) {
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
          hexMap={hexMap}
          pulsing={runningKeys.has(v.variant_key)}
        />
      ))}
    </span>
  );
}
