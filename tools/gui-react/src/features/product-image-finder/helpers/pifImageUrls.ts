/** Build the serve URL for a processed PIF image. */
export function imageServeUrl(category: string, productId: string, filename: string, cacheBust?: number): string {
  const base = `/api/v1/product-image-finder/${category}/${productId}/images/${encodeURIComponent(filename)}`;
  return cacheBust ? `${base}?v=${cacheBust}` : base;
}

/** Build the serve URL for the original (pre-RMBG) image. */
export function originalImageServeUrl(category: string, productId: string, filename: string): string {
  return `/api/v1/product-image-finder/${category}/${productId}/images/originals/${encodeURIComponent(filename)}`;
}
