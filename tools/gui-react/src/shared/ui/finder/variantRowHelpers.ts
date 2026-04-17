import { formatAtomLabel } from './finderSelectors.ts';

export interface FinderVariantRowData {
  readonly variant_id: string | null;
  readonly variant_key: string;
  readonly variant_label: string;
  readonly variant_type: 'color' | 'edition';
}

export interface CefLikeRegistryEntry {
  readonly variant_id?: string | null;
  readonly variant_key?: string;
  readonly variant_type?: 'color' | 'edition';
  readonly variant_label?: string;
  readonly edition_slug?: string | null;
  readonly edition_display_name?: string | null;
}

export interface CefLikePublished {
  readonly color_names?: Readonly<Record<string, string>>;
  readonly edition_details?: Readonly<Record<string, { readonly display_name?: string; readonly colors?: readonly string[] }>>;
}

export interface CefLikeData {
  readonly variant_registry?: readonly CefLikeRegistryEntry[];
  readonly published?: CefLikePublished;
}

/**
 * Build the canonical variant row list for any variant-dependent finder panel.
 *
 * Label precedence (mirrors PIF's buildVariantList):
 *   - edition → edition_display_name → variant_label → edition_slug → variant_key
 *   - color   → color_names[combo] (if different from combo) → formatAtomLabel(combo)
 *
 * Returned list is sorted per the CEF variant_registry order (SSOT).
 */
export function buildFinderVariantRows(cefData: CefLikeData | null | undefined): readonly FinderVariantRowData[] {
  const registry = cefData?.variant_registry ?? [];
  const colorNames = cefData?.published?.color_names ?? {};
  return registry.map((v) => {
    const variant_type = (v.variant_type ?? 'color') as 'color' | 'edition';
    const variant_key = v.variant_key ?? '';
    const variant_id = v.variant_id ?? null;
    if (variant_type === 'edition') {
      const label = v.edition_display_name
        || v.variant_label
        || v.edition_slug
        || variant_key
        || '';
      return { variant_id, variant_key, variant_label: label, variant_type };
    }
    const combo = variant_key.replace(/^color:/, '');
    const named = colorNames[combo] || v.variant_label || '';
    const hasNamedLabel = !!(named && named.toLowerCase() !== combo.toLowerCase());
    return {
      variant_id,
      variant_key,
      variant_label: hasNamedLabel ? named : formatAtomLabel(combo),
      variant_type,
    };
  });
}

export function buildEditionsMap(
  cefData: CefLikeData | null | undefined,
): Record<string, { display_name?: string; colors?: readonly string[] }> {
  return (cefData?.published?.edition_details ?? {}) as Record<string, { display_name?: string; colors?: readonly string[] }>;
}
