import type { CatalogRow } from '../../../types/product.ts';
import type { PifVariantProgressGen } from '../../../types/product.generated.ts';
import type {
  ProductImageEntry,
  ProductImageFinderResult,
  ProductImageFinderSummary,
} from '../types.ts';

interface PifVariantSelector {
  readonly variantKey?: string;
  readonly variantId?: string;
}

interface PifRunWithImages {
  readonly selected?: {
    readonly images?: readonly ProductImageEntry[];
  };
  readonly response?: {
    readonly images?: readonly ProductImageEntry[];
  };
}

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

function zeroPifVariantCarousel(variant: PifVariantProgressGen): PifVariantProgressGen {
  return {
    ...variant,
    priority_filled: 0,
    loop_filled: 0,
    hero_filled: 0,
  };
}

function matchesVariant(image: ProductImageEntry, selector: PifVariantSelector): boolean {
  const selectorId = String(selector.variantId || '').trim();
  const imageId = String(image.variant_id || '').trim();
  if (selectorId && imageId) return selectorId === imageId;

  const selectorKey = String(selector.variantKey || '').trim();
  const imageKey = String(image.variant_key || '').trim();
  if (!selectorKey || !imageKey) return false;
  return selectorKey === imageKey;
}

function shouldClearImage(image: ProductImageEntry, selector: PifVariantSelector): boolean {
  if (!selector.variantKey && !selector.variantId) return true;
  return matchesVariant(image, selector);
}

function clearImageCarouselFields(image: ProductImageEntry, selector: PifVariantSelector): ProductImageEntry {
  if (!shouldClearImage(image, selector)) return image;
  const {
    eval_best: _evalBest,
    eval_flags: _evalFlags,
    eval_reasoning: _evalReasoning,
    eval_source: _evalSource,
    eval_actual_view: _evalActualView,
    eval_matches_requested_view: _evalMatchesRequestedView,
    eval_usable_as_required_view: _evalUsableAsRequiredView,
    eval_usable_as_carousel_extra: _evalUsableAsCarouselExtra,
    eval_duplicate: _evalDuplicate,
    eval_quality: _evalQuality,
    eval_dependency_status: _evalDependencyStatus,
    eval_dependency_mismatch_keys: _evalDependencyMismatchKeys,
    hero: _hero,
    hero_rank: _heroRank,
    ...rest
  } = image;
  return rest;
}

function clearImageListCarouselFields(
  images: readonly ProductImageEntry[] | undefined,
  selector: PifVariantSelector,
): ProductImageEntry[] {
  return (images ?? []).map((image) => clearImageCarouselFields(image, selector));
}

function clearRunCarouselFields<TRun extends PifRunWithImages>(
  run: TRun,
  selector: PifVariantSelector,
): TRun {
  const selectedImages = run.selected?.images;
  const responseImages = run.response?.images;
  return {
    ...run,
    ...(selectedImages
      ? {
          selected: {
            ...run.selected,
            images: clearImageListCarouselFields(selectedImages, selector),
          },
        }
      : {}),
    ...(responseImages
      ? {
          response: {
            ...run.response,
            images: clearImageListCarouselFields(responseImages, selector),
          },
        }
      : {}),
  };
}

function clearCarouselSlots(
  carouselSlots: Record<string, Record<string, string | null>> | undefined,
  selector: PifVariantSelector,
): Record<string, Record<string, string | null>> {
  if (!selector.variantKey) return {};
  const next = { ...(carouselSlots ?? {}) };
  delete next[selector.variantKey];
  return next;
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

export function clearPifCarouselSelections<TPifData extends ProductImageFinderResult | ProductImageFinderSummary>(
  data: TPifData | undefined,
  selector: PifVariantSelector = {},
): TPifData | undefined {
  if (!data) return data;
  const selected = 'selected' in data
    ? {
        selected: {
          ...data.selected,
          images: clearImageListCarouselFields(data.selected.images, selector),
        },
      }
    : {};
  return {
    ...data,
    ...selected,
    carousel_slots: clearCarouselSlots(data.carousel_slots, selector),
    runs: data.runs.map((run) => clearRunCarouselFields(run, selector)),
  };
}

export function zeroCatalogPifCarouselProgress<TCatalogRow extends Pick<CatalogRow, 'productId' | 'pifVariants'>>(
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
        return zeroPifVariantCarousel(variant);
      }),
    };
  });
}
