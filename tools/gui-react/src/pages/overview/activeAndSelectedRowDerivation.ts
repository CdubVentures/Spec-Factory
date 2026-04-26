import type { CatalogRow } from '../../types/product.ts';

export interface ActiveAndSelectedGroups {
  readonly active: readonly CatalogRow[];
  readonly selected: readonly CatalogRow[];
}

/**
 * Split a catalog into the Active row's two visible groups.
 *
 * - Active: products with any running op, regardless of selection.
 * - Selected: every checked product. Selected-and-active products intentionally
 *   appear in both groups so the strip matches Command Console targeting.
 *
 * Pure function: given the same inputs, returns the same groups. No global
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
  const selected: CatalogRow[] = [];
  if (selectedIds) {
    for (const id of selectedIds) {
      const row = byId.get(id);
      if (row) selected.push(row);
    }
  }
  return { active, selected };
}
