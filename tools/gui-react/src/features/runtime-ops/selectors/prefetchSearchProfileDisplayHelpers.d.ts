export interface PrefetchSearchProfileDisplayOptions {
  showGateBadges?: boolean;
}

export interface PrefetchSearchProfileAliasValue {
  alias?: string;
  source?: string;
  weight?: number;
}

export interface PrefetchSearchProfileAliasEntry {
  key: string;
  label: string;
}

export function shouldShowSearchProfileGateBadges(options?: PrefetchSearchProfileDisplayOptions): boolean;
export function normalizeIdentityAliasEntries(
  identityAliases?: Array<string | PrefetchSearchProfileAliasValue | null | undefined>,
): PrefetchSearchProfileAliasEntry[];
