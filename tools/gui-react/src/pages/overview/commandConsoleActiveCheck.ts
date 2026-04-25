import type { CatalogRow } from '../../types/product.ts';

/**
 * Filter a list of selected products to those with an active op of the given
 * worker type (active = queued OR running, matching `bulkDispatch.ts::activeStatus`).
 *
 * Pure: caller passes the current `activeModulesByProduct` map (built from the
 * operations store via `useActiveModulesByProduct`) so this helper has no
 * runtime dependency on Zustand and can be unit-tested in isolation.
 */
export function selectActiveProductsForType(
  type: string,
  products: readonly CatalogRow[],
  activeModulesByProduct: ReadonlyMap<string, ReadonlySet<string>>,
): readonly CatalogRow[] {
  return products.filter((p) => activeModulesByProduct.get(p.productId)?.has(type) ?? false);
}

/**
 * Build the warn-confirm dialog copy fired before a Command Console dispatch
 * when at least one selected product already has an active op of the same type.
 *
 * The copy is intentionally informational — it does not promise any specific
 * behavior on Continue. Today's dispatch helpers already filter by active
 * status for some modes (CEF Run, all Loop modes) and not others (RDF Run,
 * SKU Run, KF Run); whatever happens after Continue is governed by those
 * existing dispatch contracts, not by this dialog.
 */
export function formatActiveWarnMessage(
  workerLabel: string,
  activeCount: number,
  totalSelected: number,
): string {
  return `${activeCount} of ${totalSelected} selected products already have a ${workerLabel} op queued or running.\nContinue with dispatch?`;
}
