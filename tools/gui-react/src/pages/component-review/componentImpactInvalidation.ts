interface ComponentImpactInvalidationQueryClient {
  invalidateQueries: (options: { queryKey: readonly unknown[] }) => unknown;
}

interface InvalidateComponentImpactForCategoryInput {
  queryClient: ComponentImpactInvalidationQueryClient;
  category: string;
}

export function invalidateComponentImpactForCategory({
  queryClient,
  category,
}: InvalidateComponentImpactForCategoryInput): void {
  queryClient.invalidateQueries({ queryKey: ['componentImpact', category] });
}
