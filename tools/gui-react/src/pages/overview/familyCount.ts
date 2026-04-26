import type { CatalogRow } from '../../types/product.ts';

// WHY: A product's "family size" is the count of catalog rows sharing the
// same (brand, base_model). Computed client-side from the same `/catalog`
// payload Overview already loads — no backend wiring needed.
export function deriveFamilyCountByProductId(
  rows: readonly CatalogRow[],
): Map<string, number> {
  const groupSizes = new Map<string, number>();
  for (const row of rows) {
    const key = familyKey(row);
    if (!key) continue;
    groupSizes.set(key, (groupSizes.get(key) ?? 0) + 1);
  }
  const out = new Map<string, number>();
  for (const row of rows) {
    const key = familyKey(row);
    if (!key) continue;
    const size = groupSizes.get(key);
    if (size !== undefined) out.set(row.productId, size);
  }
  return out;
}

function familyKey(row: CatalogRow): string {
  const brand = String(row.brand ?? '').trim().toLowerCase();
  const baseModel = String(row.base_model ?? '').trim().toLowerCase();
  if (!brand || !baseModel) return '';
  return `${brand}||${baseModel}`;
}
