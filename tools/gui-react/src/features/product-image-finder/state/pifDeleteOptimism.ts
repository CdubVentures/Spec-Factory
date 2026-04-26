import type { CatalogRow } from '../../../types/product.ts';
import type { PifVariantProgressGen } from '../../../types/product.generated.ts';
import type { ProductImageFinderSummary } from '../types.ts';

function normalizeFilenameSet(filenames: readonly string[]): ReadonlySet<string> {
  return new Set(filenames.map((filename) => String(filename || '').trim()).filter(Boolean));
}

function zeroPifVariant(variant: PifVariantProgressGen): PifVariantProgressGen {
  return {
    ...variant,
    priority_filled: 0,
    loop_filled: 0,
    hero_filled: 0,
    image_count: 0,
  };
}

export function removeImagesFromPifSummary(
  summary: ProductImageFinderSummary | undefined,
  filenames: readonly string[],
): ProductImageFinderSummary | undefined {
  if (!summary) return summary;
  const removeSet = normalizeFilenameSet(filenames);
  if (removeSet.size === 0) return summary;

  const images = summary.images.filter((image) => !removeSet.has(image.filename));
  return {
    ...summary,
    images,
    image_count: images.length,
    runs: summary.runs.map((run) => ({
      ...run,
      selected: {
        ...run.selected,
        images: run.selected.images.filter((image) => !removeSet.has(image.filename)),
      },
    })),
  };
}

export function zeroCatalogPifProgress<TCatalogRow extends Pick<CatalogRow, 'productId' | 'pifVariants'>>(
  rows: readonly TCatalogRow[] | undefined,
  target: { readonly productId: string; readonly variantKey?: string },
): TCatalogRow[] | undefined {
  if (!rows) return rows;
  const productId = String(target.productId || '').trim();
  const variantKey = String(target.variantKey || '').trim();
  if (!productId) return [...rows];

  return rows.map((row) => {
    if (row.productId !== productId) return row;
    return {
      ...row,
      pifVariants: row.pifVariants.map((variant) => {
        if (variantKey && variant.variant_key !== variantKey) return variant;
        return zeroPifVariant(variant);
      }),
    };
  });
}
