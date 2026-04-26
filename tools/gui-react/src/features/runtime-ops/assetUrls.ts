export type RuntimeAssetVariant = 'full' | 'preview' | 'thumb';

interface RuntimeAssetUrlOptions {
  readonly variant?: RuntimeAssetVariant;
}

export function runtimeAssetUrl(runId: string, filename: string, options: RuntimeAssetUrlOptions = {}): string {
  const base = `/api/v1/indexlab/run/${encodeURIComponent(runId)}/runtime/assets/${encodeURIComponent(filename)}`;
  const params = new URLSearchParams();
  if (options.variant && options.variant !== 'full') params.set('variant', options.variant);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}
