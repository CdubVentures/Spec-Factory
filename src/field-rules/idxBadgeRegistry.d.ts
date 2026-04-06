// WHY: Type declaration for the JS ESM IDX badge registry, consumed by GUI TypeScript.

export interface IdxBadgeEntry {
  path: string;
  type: 'string' | 'array' | 'filteredArray' | 'presence';
  flatAliases: string[];
  section: string;
  key: string;
  on: string;
  off: string;
}

export const IDX_BADGE_REGISTRY: readonly IdxBadgeEntry[];
export const IDX_FIELD_PATHS: readonly string[];

export function buildExtractor(entry: IdxBadgeEntry): (rule: Record<string, unknown>) => boolean;
