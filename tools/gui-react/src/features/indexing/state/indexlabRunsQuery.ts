export function buildIndexLabRunsQueryKey({
  category = '',
  limit = 50,
}: {
  category?: string;
  limit?: number;
}) {
  const categoryToken = String(category || '').trim();
  return ['indexlab', 'runs', { category: categoryToken || 'all', limit }] as const;
}

export function buildIndexLabRunsRequestPath({
  category = '',
  limit = 50,
}: {
  category?: string;
  limit?: number;
}) {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  const categoryToken = String(category || '').trim();
  if (categoryToken && categoryToken.toLowerCase() !== 'all') {
    params.set('category', categoryToken);
  }
  return `/indexlab/runs?${params.toString()}`;
}
