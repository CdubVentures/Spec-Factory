export type PifImageVariant = 'full' | 'preview' | 'thumb';

interface ImageServeOptions {
  readonly cacheBust?: number;
  readonly variant?: PifImageVariant;
}

function normalizeOptions(cacheBustOrOptions?: number | ImageServeOptions): ImageServeOptions {
  if (typeof cacheBustOrOptions === 'number') return { cacheBust: cacheBustOrOptions };
  return cacheBustOrOptions ?? {};
}

/** Build the serve URL for a processed PIF image. */
export function imageServeUrl(
  category: string,
  productId: string,
  filename: string,
  cacheBustOrOptions?: number | ImageServeOptions,
): string {
  const base = `/api/v1/product-image-finder/${category}/${productId}/images/${encodeURIComponent(filename)}`;
  const options = normalizeOptions(cacheBustOrOptions);
  const params = new URLSearchParams();
  if (options.variant && options.variant !== 'full') params.set('variant', options.variant);
  if (options.cacheBust) params.set('v', String(options.cacheBust));
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

/** Build the serve URL for the original (pre-RMBG) image. */
export function originalImageServeUrl(category: string, productId: string, filename: string): string {
  return `/api/v1/product-image-finder/${category}/${productId}/images/originals/${encodeURIComponent(filename)}`;
}
