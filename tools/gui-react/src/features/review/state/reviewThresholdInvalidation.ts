interface ReviewThresholdInvalidationQueryClient {
  invalidateQueries: (options: { queryKey: readonly unknown[] }) => unknown;
}

interface InvalidateReviewThresholdCachesInput {
  queryClient: ReviewThresholdInvalidationQueryClient;
  category: string;
}

export function invalidateReviewThresholdCaches({
  queryClient,
  category,
}: InvalidateReviewThresholdCachesInput): void {
  queryClient.invalidateQueries({ queryKey: ['candidates', category] });
  queryClient.invalidateQueries({ queryKey: ['reviewProductsIndex', category] });
}
