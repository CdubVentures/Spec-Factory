import type { ColorEntry } from '../types.ts';

export interface ColorMatrixRow {
  readonly baseName: string;
  readonly cells: Readonly<Record<string, ColorEntry | null>>;
}

export interface ColorMatrix {
  readonly prefixes: readonly string[];
  readonly rows: readonly ColorMatrixRow[];
}

/**
 * Builds a color matrix aligning base colors with their prefix variants.
 *
 * Prefix detection: for each hyphenated color name, the first token before
 * the hyphen is a prefix candidate if the remainder (base name) also exists
 * as a standalone color OR appears as the remainder for another prefix.
 *
 * @param colors - all color entries
 * @param extraPrefixes - additional prefix columns to include (even if empty)
 */
export function buildColorMatrix(
  colors: readonly ColorEntry[],
  extraPrefixes: readonly string[] = [],
): ColorMatrix {
  if (colors.length === 0 && extraPrefixes.length === 0) {
    return { prefixes: [], rows: [] };
  }

  const standaloneNames = new Set<string>();
  const hyphenated: Array<{ entry: ColorEntry; prefix: string; base: string }> = [];

  for (const c of colors) {
    const idx = c.name.indexOf('-');
    if (idx === -1) {
      standaloneNames.add(c.name);
    } else {
      hyphenated.push({
        entry: c,
        prefix: c.name.slice(0, idx),
        base: c.name.slice(idx + 1),
      });
    }
  }

  // A prefix token is valid when ANY of these hold:
  // 1. Its base exists as a standalone color (light-red where red exists)
  // 2. It appears in 2+ hyphenated names (light-red, light-blue)
  // 3. Another prefix token shares the same base (light-yellow + dark-yellow)
  const prefixCounts = new Map<string, number>();
  const prefixHasStandaloneBase = new Set<string>();
  const baseToPrefixes = new Map<string, Set<string>>();

  for (const h of hyphenated) {
    prefixCounts.set(h.prefix, (prefixCounts.get(h.prefix) ?? 0) + 1);
    if (standaloneNames.has(h.base)) {
      prefixHasStandaloneBase.add(h.prefix);
    }
    if (!baseToPrefixes.has(h.base)) baseToPrefixes.set(h.base, new Set());
    baseToPrefixes.get(h.base)!.add(h.prefix);
  }

  const detectedPrefixes = new Set<string>();
  for (const h of hyphenated) {
    const hasStandaloneBase = prefixHasStandaloneBase.has(h.prefix);
    const appearsMultiple = (prefixCounts.get(h.prefix) ?? 0) >= 2;
    const sharedBase = (baseToPrefixes.get(h.base)?.size ?? 0) >= 2;
    if (hasStandaloneBase || appearsMultiple || sharedBase) {
      detectedPrefixes.add(h.prefix);
    }
  }

  for (const p of extraPrefixes) {
    detectedPrefixes.add(p);
  }

  const prefixes = [...detectedPrefixes].sort();

  // Classify colors into the matrix
  const baseNameSet = new Set<string>(standaloneNames);
  const variantMap = new Map<string, Map<string, ColorEntry>>();

  for (const h of hyphenated) {
    if (detectedPrefixes.has(h.prefix)) {
      baseNameSet.add(h.base);
      if (!variantMap.has(h.base)) variantMap.set(h.base, new Map());
      variantMap.get(h.base)!.set(h.prefix, h.entry);
    } else {
      baseNameSet.add(h.entry.name);
    }
  }

  const baseEntryMap = new Map<string, ColorEntry>();
  for (const c of colors) {
    if (standaloneNames.has(c.name)) {
      baseEntryMap.set(c.name, c);
    }
  }

  // Also add non-prefix hyphenated as base entries
  for (const h of hyphenated) {
    if (!detectedPrefixes.has(h.prefix)) {
      baseEntryMap.set(h.entry.name, h.entry);
    }
  }

  const sortedBaseNames = [...baseNameSet].sort();

  const rows: ColorMatrixRow[] = sortedBaseNames.map((baseName) => {
    const cells: Record<string, ColorEntry | null> = {
      base: baseEntryMap.get(baseName) ?? null,
    };
    for (const p of prefixes) {
      cells[p] = variantMap.get(baseName)?.get(p) ?? null;
    }
    return { baseName, cells };
  });

  return { prefixes, rows };
}
