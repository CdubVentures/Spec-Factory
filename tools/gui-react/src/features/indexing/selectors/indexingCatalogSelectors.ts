import type { CatalogRow } from '../../../types/product';
import { ambiguityLevelFromFamilyCount, cleanVariant, displayVariant, normalizeToken } from '../helpers';

export interface CatalogVariantOption {
  productId: string;
  label: string;
}

export interface SelectedAmbiguityMeter {
  count: number;
  level: string;
  label: string;
  badgeCls: string;
  barCls: string;
  widthPct: number;
}

interface SelectedAmbiguityMeterInput {
  catalogFamilyCountLookup: Map<string, number>;
  selectedCatalogProduct: CatalogRow | null;
  singleBrand: string;
  singleModel: string;
}

function unknownAmbiguityMeter(count = 0): SelectedAmbiguityMeter {
  return {
    count,
    level: 'unknown',
    label: 'unknown',
    badgeCls: 'sf-chip-neutral',
    barCls: 'sf-status-text-muted',
    widthPct: 0,
  };
}

export function deriveCatalogRows(catalog: CatalogRow[]) {
  return [...catalog]
    .filter((row) => row.brand && row.model)
    .sort((a, b) => {
      const brandCmp = String(a.brand || '').localeCompare(String(b.brand || ''));
      if (brandCmp !== 0) return brandCmp;
      const modelCmp = String(a.model || '').localeCompare(String(b.model || ''));
      if (modelCmp !== 0) return modelCmp;
      const variantCmp = cleanVariant(a.variant || '').localeCompare(cleanVariant(b.variant || ''));
      if (variantCmp !== 0) return variantCmp;
      return String(a.productId || '').localeCompare(String(b.productId || ''));
    });
}

export function deriveBrandOptions(catalogRows: CatalogRow[]) {
  return [...new Set(catalogRows.map((row) => String(row.brand || '').trim()).filter(Boolean))];
}

export function deriveModelOptions(catalogRows: CatalogRow[], singleBrand: string) {
  if (!singleBrand) return [];
  return [
    ...new Set(
      catalogRows
        .filter((row) => normalizeToken(row.brand) === normalizeToken(singleBrand))
        .map((row) => String(row.base_model || row.model || '').trim())
        .filter(Boolean)
    ),
  ];
}

export function deriveVariantOptions(catalogRows: CatalogRow[], singleBrand: string, singleModel: string): CatalogVariantOption[] {
  if (!singleBrand || !singleModel) return [];
  return catalogRows
    .filter((row) => normalizeToken(row.brand) === normalizeToken(singleBrand) && normalizeToken(row.base_model || row.model) === normalizeToken(singleModel))
    .map((row) => ({
      productId: row.productId,
      label: row.variant ? displayVariant(String(row.variant)) : String(row.model || ''),
    }));
}

export function deriveSelectedCatalogProduct(catalogRows: CatalogRow[], singleProductId: string) {
  return catalogRows.find((row) => row.productId === singleProductId) || null;
}

export function deriveCatalogFamilyCountLookup(catalogRows: CatalogRow[]) {
  const map = new Map<string, number>();
  for (const row of catalogRows) {
    const brand = normalizeToken(row.brand);
    const baseModel = normalizeToken(row.base_model || row.model);
    if (!brand || !baseModel) continue;
    const key = `${brand}||${baseModel}`;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

export function deriveSelectedAmbiguityMeter({
  catalogFamilyCountLookup,
  selectedCatalogProduct,
  singleBrand,
  singleModel,
}: SelectedAmbiguityMeterInput): SelectedAmbiguityMeter {
  const activeBrand = String(selectedCatalogProduct?.brand || singleBrand || '').trim();
  const activeModel = String(selectedCatalogProduct?.base_model || selectedCatalogProduct?.model || singleModel || '').trim();
  if (!activeBrand || !activeModel) {
    return unknownAmbiguityMeter();
  }

  const key = `${normalizeToken(activeBrand)}||${normalizeToken(activeModel)}`;
  const count = Number(catalogFamilyCountLookup.get(key) || 1);
  const level = ambiguityLevelFromFamilyCount(count);
  if (level === 'easy') {
    return {
      count,
      level,
      label: 'easy',
      badgeCls: 'sf-chip-success',
      barCls: 'sf-status-text-success',
      widthPct: 34,
    };
  }
  if (level === 'medium') {
    return {
      count,
      level,
      label: 'medium',
      badgeCls: 'sf-chip-warning',
      barCls: 'sf-status-text-warning',
      widthPct: 67,
    };
  }
  if (level === 'hard') {
    return {
      count,
      level,
      label: 'hard',
      badgeCls: 'sf-chip-danger',
      barCls: 'sf-status-text-danger',
      widthPct: 60,
    };
  }
  if (level === 'very_hard') {
    return {
      count,
      level,
      label: 'very hard',
      badgeCls: 'sf-chip-danger',
      barCls: 'sf-status-text-danger',
      widthPct: 80,
    };
  }
  if (level === 'extra_hard') {
    return {
      count,
      level,
      label: 'extra hard',
      badgeCls: 'sf-chip-danger',
      barCls: 'sf-status-text-danger',
      widthPct: 100,
    };
  }
  return unknownAmbiguityMeter(count);
}
