import { resolveVariantColorAtoms } from '../../../shared/ui/finder/finderSelectors.ts';
import type { Operation } from './operationsStore.ts';

/**
 * Hex parts for a per-variant operation's color swatch, or [] when no swatch
 * should render.
 *
 * Swatch renders for PIF and RDF variant runs on BOTH `color:` and `edition:`
 * variant keys. CEF has no variant (it IS the variant generator).
 *
 * Resolution order:
 *   1. `atomsByKey` registry lookup — authoritative for both color: and edition:
 *      (sourced from CEF variant_registry: `{variant_key, color_atoms}`). Edition
 *      combos come from here because they aren't encoded in the variant key.
 *   2. Fallback for `color:` keys — parse atoms from the key directly. Lets the
 *      swatch render instantly for color: variants even before the CEF registry
 *      fetch resolves.
 *
 * Atoms with no hex in the registry are silently dropped; an all-missing
 * variant renders no swatch.
 */
export function variantHexPartsForOp(
  op: Pick<Operation, 'type' | 'variantKey'>,
  hexMap: ReadonlyMap<string, string>,
  atomsByKey: ReadonlyMap<string, readonly string[]> = new Map(),
): string[] {
  if (op.type !== 'pif' && op.type !== 'rdf') return [];
  const key = op.variantKey ?? '';
  if (!key) return [];

  const registryAtoms = atomsByKey.get(key);
  if (registryAtoms && registryAtoms.length > 0) {
    return registryAtoms
      .map((a) => hexMap.get(a))
      .filter((h): h is string => Boolean(h));
  }

  if (key.startsWith('color:')) {
    const atoms = resolveVariantColorAtoms(key, {});
    return atoms
      .map((a) => hexMap.get(a))
      .filter((h): h is string => Boolean(h));
  }

  return [];
}
