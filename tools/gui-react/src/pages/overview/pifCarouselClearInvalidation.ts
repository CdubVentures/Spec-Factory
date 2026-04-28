interface PifCarouselClearProductRef {
  readonly productId: string;
}

interface PifCarouselClearInvalidationQueryClient {
  invalidateQueries: (options: { readonly queryKey: readonly unknown[]; readonly exact?: boolean }) => unknown;
}

interface InvalidatePifCarouselClearAllQueriesInput {
  readonly queryClient: PifCarouselClearInvalidationQueryClient;
  readonly category: string;
  readonly products: readonly PifCarouselClearProductRef[];
}

export function invalidatePifCarouselClearAllQueries({
  queryClient,
  category,
  products,
}: InvalidatePifCarouselClearAllQueriesInput): void {
  queryClient.invalidateQueries({ queryKey: ['catalog', category] });
  for (const product of products) {
    const productId = String(product.productId || '').trim();
    if (!productId) continue;
    queryClient.invalidateQueries({
      queryKey: ['product-image-finder', category, productId],
      exact: true,
    });
    queryClient.invalidateQueries({
      queryKey: ['product-image-finder', category, productId, 'summary'],
      exact: true,
    });
  }
}
