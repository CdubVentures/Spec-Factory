import { useEffect, useMemo } from 'react';
import type { CatalogRow } from '../../../types/product.ts';
import { normalizeToken } from '../helpers.tsx';
import {
  deriveBrandOptions,
  deriveCatalogFamilyCountLookup,
  deriveCatalogRows,
  deriveModelOptions,
  deriveSelectedAmbiguityMeter,
  deriveSelectedCatalogProduct,
  deriveVariantOptions,
} from './indexingCatalogSelectors.ts';

interface UseIndexingCatalogDerivationsInput {
  catalog: CatalogRow[];
  singleBrand: string;
  singleModel: string;
  singleProductId: string;
  setSingleBrand: (value: string) => void;
  setSingleModel: (value: string) => void;
  setSingleProductId: (value: string) => void;
}

export function useIndexingCatalogDerivations(input: UseIndexingCatalogDerivationsInput) {
  const {
    catalog,
    singleBrand,
    singleModel,
    singleProductId,
    setSingleBrand,
    setSingleModel,
    setSingleProductId,
  } = input;

  const catalogRows = useMemo(
    () => deriveCatalogRows(catalog),
    [catalog],
  );

  const brandOptions = useMemo(
    () => deriveBrandOptions(catalogRows),
    [catalogRows],
  );

  const modelOptions = useMemo(
    () => deriveModelOptions(catalogRows, singleBrand),
    [catalogRows, singleBrand],
  );

  const variantOptions = useMemo(
    () => deriveVariantOptions(catalogRows, singleBrand, singleModel),
    [catalogRows, singleBrand, singleModel],
  );

  const selectedCatalogProduct = useMemo(
    () => deriveSelectedCatalogProduct(catalogRows, singleProductId),
    [catalogRows, singleProductId],
  );

  const catalogFamilyCountLookup = useMemo(
    () => deriveCatalogFamilyCountLookup(catalogRows),
    [catalogRows],
  );

  const selectedAmbiguityMeter = useMemo(
    () => deriveSelectedAmbiguityMeter({
      catalogFamilyCountLookup,
      selectedCatalogProduct,
      singleBrand,
      singleModel,
    }),
    [catalogFamilyCountLookup, selectedCatalogProduct, singleBrand, singleModel],
  );

  // WHY: ProductId is the stable anchor. If it's still in the catalog, restore
  // brand/model from the catalog entry (they may have been renamed).
  useEffect(() => {
    if (catalogRows.length === 0) return;

    if (singleProductId) {
      const entry = catalogRows.find((r) => r.productId === singleProductId);
      if (entry) {
        if (normalizeToken(entry.brand) !== normalizeToken(singleBrand)) {
          setSingleBrand(entry.brand);
        }
        if (normalizeToken(entry.model) !== normalizeToken(singleModel)) {
          setSingleModel(entry.model);
        }
        return;
      }
    }

    if (singleBrand && !brandOptions.some((brand) => normalizeToken(brand) === normalizeToken(singleBrand))) {
      setSingleBrand('');
      setSingleModel('');
      setSingleProductId('');
      return;
    }

    if (singleModel && !modelOptions.some((model) => normalizeToken(model) === normalizeToken(singleModel))) {
      setSingleModel('');
      setSingleProductId('');
      return;
    }

    if (singleProductId && !variantOptions.some((option) => option.productId === singleProductId)) {
      setSingleProductId('');
    }
  }, [
    catalogRows.length,
    brandOptions,
    modelOptions,
    variantOptions,
    singleBrand,
    singleModel,
    singleProductId,
    setSingleBrand,
    setSingleModel,
    setSingleProductId,
  ]);

  return {
    catalogRows,
    brandOptions,
    modelOptions,
    variantOptions,
    selectedCatalogProduct,
    selectedAmbiguityMeter,
  };
}

