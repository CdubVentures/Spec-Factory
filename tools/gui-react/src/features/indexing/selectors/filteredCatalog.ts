import type { CatalogRow } from '../../../types/product.ts';
import { displayVariant, normalizeToken } from '../indexingHelpers.ts';
import { fuzzyMatch } from '../../../shared/utils/fuzzyMatch.ts';

export interface DrillItem {
  value: string;
  label: string;
  count?: number;
  matches: Array<[number, number]>;
  score: number;
}

export interface VariantDrillItem extends DrillItem {
  productId: string;
}

export interface FilteredCatalogInput {
  catalogRows: CatalogRow[];
  singleBrand: string;
  singleModel: string;
  searchQuery: string;
}

export interface FilteredCatalogResult {
  brandList: DrillItem[];
  modelList: DrillItem[];
  variantList: VariantDrillItem[];
  totalMatches: number;
}

function countBrandRows(rows: CatalogRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const brand = String(row.brand || '').trim();
    if (!brand) continue;
    counts.set(brand, (counts.get(brand) || 0) + 1);
  }
  return counts;
}

function countModelRows(rows: CatalogRow[], brand: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (normalizeToken(row.brand) !== normalizeToken(brand)) continue;
    const bm = String(row.base_model || '').trim();
    if (!bm) continue;
    counts.set(bm, (counts.get(bm) || 0) + 1);
  }
  return counts;
}

export function deriveFilteredCatalog({
  catalogRows,
  singleBrand,
  singleModel,
  searchQuery,
}: FilteredCatalogInput): FilteredCatalogResult {
  const query = String(searchQuery || '').trim();

  const brandCounts = countBrandRows(catalogRows);
  const brandNames = Array.from(brandCounts.keys());
  const brandResults = fuzzyMatch(query, brandNames);
  const brandList: DrillItem[] = brandResults.map((r) => ({
    value: r.text,
    label: r.text,
    count: brandCounts.get(r.text) || 0,
    matches: r.matches,
    score: r.score,
  }));

  let modelList: DrillItem[] = [];
  if (singleBrand) {
    const modelCounts = countModelRows(catalogRows, singleBrand);
    const modelNames = Array.from(modelCounts.keys());
    const modelResults = fuzzyMatch(query, modelNames);
    modelList = modelResults.map((r) => ({
      value: r.text,
      label: r.text,
      count: modelCounts.get(r.text) || 0,
      matches: r.matches,
      score: r.score,
    }));
  }

  let variantList: VariantDrillItem[] = [];
  if (singleBrand && singleModel) {
    const rows = catalogRows.filter((r) =>
      normalizeToken(r.brand) === normalizeToken(singleBrand) &&
      normalizeToken(r.base_model) === normalizeToken(singleModel),
    );
    const items = rows.map((r) => ({ productId: r.productId, label: displayVariant(String(r.variant || '')) }));
    const labels = items.map((i) => i.label);
    const variantResults = fuzzyMatch(query, labels);

    const consumed = new Array(items.length).fill(false);
    variantList = variantResults.map((r) => {
      const idx = items.findIndex((item, i) => !consumed[i] && item.label === r.text);
      if (idx >= 0) consumed[idx] = true;
      const item = idx >= 0 ? items[idx] : items[0];
      return {
        productId: item.productId,
        value: item.productId,
        label: r.text,
        matches: r.matches,
        score: r.score,
      };
    });
  }

  const totalMatches = query
    ? fuzzyMatch(
        query,
        catalogRows.map((r) => `${r.brand} ${r.base_model} ${r.variant} ${r.productId}`),
      ).length
    : catalogRows.length;

  return { brandList, modelList, variantList, totalMatches };
}
