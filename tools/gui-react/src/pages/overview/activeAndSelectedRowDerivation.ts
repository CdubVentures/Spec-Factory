import type { CatalogRow } from '../../types/product.ts';

export interface ActiveAndSelectedGroups {
  readonly active: readonly CatalogRow[];
  readonly selectedIdle: readonly CatalogRow[];
}

/**
 * Split a catalog into the Active row's two visible groups.
 *
 * - Active: products with any running op (regardless of selection).
 * - Selected, idle: products in the user's selection that are NOT currently active —
 *   a selected-and-active product appears only in Active during its run, then
 *   migrates back to Selected-idle on terminal status (selection persists).
 *
 * Pure function — given the same inputs, returns the same groups. No global
 * state; the React hook layer reads activeIds / selectedIds and passes them in.
 */
export function deriveActiveAndSelectedGroups(
  rows: readonly CatalogRow[],
  activeIds: ReadonlySet<string>,
  selectedIds: ReadonlySet<string> | undefined,
): ActiveAndSelectedGroups {
  const byId = new Map(rows.map((r) => [r.productId, r]));
  const active: CatalogRow[] = [];
  for (const id of activeIds) {
    const row = byId.get(id);
    if (row) active.push(row);
  }
  const selectedIdle: CatalogRow[] = [];
  if (selectedIds) {
    for (const id of selectedIds) {
      if (activeIds.has(id)) continue;
      const row = byId.get(id);
      if (row) selectedIdle.push(row);
    }
  }
  return { active, selectedIdle };
}
