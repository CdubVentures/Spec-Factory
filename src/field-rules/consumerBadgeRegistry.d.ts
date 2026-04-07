// WHY: Type declaration for the JS ESM consumer badge registry, consumed by GUI TypeScript.

export interface ConsumerDesc {
  desc: string;
}

export interface ConsumerBadgeEntry {
  path: string;
  type: 'string' | 'array' | 'filteredArray' | 'presence';
  flatAliases?: string[];
  section?: string;
  key?: string;
  consumers: Record<string, ConsumerDesc>;
}

export interface ParentGroupConfig {
  label: string;
  title: string;
}

export const CONSUMER_BADGE_REGISTRY: ReadonlyArray<ConsumerBadgeEntry>;

export const PARENT_GROUPS: Readonly<Record<string, ParentGroupConfig>>;

export const FIELD_PARENT_MAP: Readonly<Record<string, string[]>>;

export const FIELD_CONSUMER_MAP: Readonly<Record<string, Record<string, ConsumerDesc>>>;

export const IDX_FIELD_PATHS: ReadonlyArray<string>;

export const BADGE_FIELD_PATHS: ReadonlyArray<string>;

export const NAVIGATION_MAP: Readonly<Record<string, { section: string; key: string }>>;

export function buildExtractor(entry: ConsumerBadgeEntry): (rule: Record<string, unknown>) => boolean;
