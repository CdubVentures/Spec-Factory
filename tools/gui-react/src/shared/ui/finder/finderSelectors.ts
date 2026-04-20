/** Titlecase a raw color atom/combo: `light-blue+dark-blue` → `Light Blue + Dark Blue` */
export function formatAtomLabel(atom: string): string {
  return atom.split('+').map(part =>
    part.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
  ).join(' + ');
}

/**
 * Resolve color atoms from a variant_key. Shared across all finder panels
 * that render color swatches per variant row (PIF, RDF, future).
 *
 * - "color:black+red" → ["black", "red"]
 * - "edition:cod-edition" → looks up edition's colors combo → ["black", "orange"]
 */
export function resolveVariantColorAtoms(
  variantKey: string,
  editions: Record<string, { display_name?: string; colors?: readonly string[] }>,
): string[] {
  if (variantKey.startsWith('edition:')) {
    const slug = variantKey.replace('edition:', '');
    const ed = editions[slug];
    const combo = ed?.colors?.[0] || '';
    return combo.split('+').filter(Boolean);
  }
  return variantKey.replace(/^color:/, '').split('+').filter(Boolean);
}
