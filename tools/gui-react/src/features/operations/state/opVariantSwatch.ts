import { resolveVariantColorAtoms } from '../../../shared/ui/finder/finderSelectors.ts';
import type { Operation } from './operationsStore.ts';

/**
 * Hex parts for a per-variant operation's color swatch, or [] when no swatch
 * should render.
 *
 * Swatch renders ONLY for PIF and RDF variant runs with `color:`-prefixed
 * variant keys. CEF has no variant (it IS the variant generator), and
 * `edition:` keys would require per-product edition lookup (out of scope here —
 * they show their text label instead).
 *
 * Atoms with no hex in the registry are silently dropped; an all-missing
 * variant renders no swatch.
 */
export function variantHexPartsForOp(
  op: Pick<Operation, 'type' | 'variantKey'>,
  hexMap: ReadonlyMap<string, string>,
): string[] {
  if (op.type !== 'pif' && op.type !== 'rdf') return [];
  const key = op.variantKey ?? '';
  if (!key.startsWith('color:')) return [];
  const atoms = resolveVariantColorAtoms(key, {});
  return atoms
    .map((a) => hexMap.get(a))
    .filter((h): h is string => Boolean(h));
}
