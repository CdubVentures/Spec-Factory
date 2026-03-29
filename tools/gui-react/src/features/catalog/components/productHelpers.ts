export const PRODUCT_STATUS_VALUES = ['active', 'inactive'] as const;

export const BULK_VARIANT_PLACEHOLDERS = new Set([
  '', 'unk', 'unknown', 'na', 'n/a', 'none', 'null', '-', 'default'
]);

export function slugToken(value: string): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function cleanVariantToken(variant: string): string {
  const trimmed = String(variant || '').trim();
  if (!trimmed) return '';
  return BULK_VARIANT_PLACEHOLDERS.has(trimmed.toLowerCase()) ? '' : trimmed;
}

export function isFabricatedVariantToken(model: string, variant: string): boolean {
  const cleanedVariant = cleanVariantToken(variant);
  if (!cleanedVariant) return false;
  const modelSlug = slugToken(model);
  const variantSlug = slugToken(cleanedVariant);
  if (!modelSlug || !variantSlug) return false;
  if (modelSlug.includes(variantSlug)) return true;
  const modelTokens = new Set(modelSlug.split('-'));
  const variantTokens = variantSlug.split('-');
  return variantTokens.length > 0 && variantTokens.every((token) => modelTokens.has(token));
}


export function isHeaderRow(model: string, variant: string): boolean {
  const m = String(model || '').trim().toLowerCase();
  const v = String(variant || '').trim().toLowerCase();
  return (m === 'model' || m === 'models') && (v === 'variant' || v === 'varaint' || v === 'variants');
}

export function relativeTime(iso: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
