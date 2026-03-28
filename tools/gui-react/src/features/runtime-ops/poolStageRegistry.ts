// WHY: Single source of truth for all pool/stage visual properties.
// Adding a new pool requires editing only this record — O(1) scaling.

export const POOL_STAGE_KEYS = ['search', 'fetch', 'parse', 'llm', 'index', 'extraction'] as const;
export type PoolStageKey = (typeof POOL_STAGE_KEYS)[number];

export interface PoolStageVisuals {
  badge: string;
  dot: string;
  meterFill: string;
  selectedTab: string;
  outlineTab: string;
  stageLabel: string;
  activeCount: string;
  laneClass: string;
  labelClass: string;
  tintClass: string;
  shortLabel: string;
}

const FALLBACK: Readonly<PoolStageVisuals> = Object.freeze({
  badge: 'sf-chip-neutral',
  dot: 'sf-dot-neutral',
  meterFill: 'sf-meter-fill-neutral',
  selectedTab: 'sf-prefetch-tab-idle-neutral',
  outlineTab: 'sf-prefetch-tab-outline-neutral',
  stageLabel: '',
  activeCount: 'sf-text-subtle',
  laneClass: 'sf-pool-lane-other',
  labelClass: 'sf-pool-label-other',
  tintClass: '',
  shortLabel: 'Other',
});

export const POOL_STAGE_REGISTRY: Record<PoolStageKey, PoolStageVisuals> = {
  search: {
    badge: 'sf-chip-accent',
    dot: 'sf-dot-accent',
    meterFill: 'sf-meter-fill',
    selectedTab: 'sf-prefetch-tab-idle-accent',
    outlineTab: 'sf-prefetch-tab-outline-accent',
    stageLabel: 'Searching',
    activeCount: 'sf-link-accent',
    laneClass: 'sf-pool-lane-search',
    labelClass: 'sf-pool-label-search',
    tintClass: 'sf-pool-tint-search',
    shortLabel: 'Search',
  },
  fetch: {
    badge: 'sf-chip-success',
    dot: 'sf-dot-success',
    meterFill: 'sf-meter-fill-success',
    selectedTab: 'sf-prefetch-tab-idle-success',
    outlineTab: 'sf-prefetch-tab-outline-success',
    stageLabel: 'Fetching',
    activeCount: 'sf-status-text-success',
    laneClass: 'sf-pool-lane-fetch',
    labelClass: 'sf-pool-label-fetch',
    tintClass: 'sf-pool-tint-fetch',
    shortLabel: 'Fetch',
  },
  parse: {
    badge: 'sf-chip-info',
    dot: 'sf-dot-info',
    meterFill: 'sf-meter-fill-info',
    selectedTab: 'sf-prefetch-tab-idle-info',
    outlineTab: 'sf-prefetch-tab-outline-info',
    stageLabel: 'Parsing',
    activeCount: 'sf-status-text-info',
    laneClass: 'sf-pool-lane-other',
    labelClass: 'sf-pool-label-other',
    tintClass: '',
    shortLabel: 'Parse',
  },
  llm: {
    badge: 'sf-chip-warning',
    dot: 'sf-dot-warning',
    meterFill: 'sf-meter-fill-warning',
    selectedTab: 'sf-prefetch-tab-idle-warning',
    outlineTab: 'sf-prefetch-tab-outline-warning',
    stageLabel: 'Extracting',
    activeCount: 'sf-status-text-warning',
    laneClass: 'sf-pool-lane-llm',
    labelClass: 'sf-pool-label-llm',
    tintClass: 'sf-pool-tint-llm',
    shortLabel: 'LLM',
  },
  index: {
    badge: 'sf-chip-success',
    dot: 'sf-dot-success',
    meterFill: 'sf-meter-fill-success',
    selectedTab: 'sf-prefetch-tab-idle-success',
    outlineTab: 'sf-prefetch-tab-outline-success',
    stageLabel: 'Indexing',
    activeCount: 'sf-status-text-success',
    laneClass: 'sf-pool-lane-other',
    labelClass: 'sf-pool-label-other',
    tintClass: '',
    shortLabel: 'Index',
  },
  extraction: {
    badge: 'sf-chip-confirm',
    dot: 'sf-dot-confirm',
    meterFill: 'sf-meter-fill-info',
    selectedTab: 'sf-prefetch-tab-idle-info',
    outlineTab: 'sf-prefetch-tab-outline-info',
    stageLabel: 'Extracting',
    activeCount: 'sf-status-text-info',
    laneClass: 'sf-pool-lane-other',
    labelClass: 'sf-pool-label-other',
    tintClass: '',
    shortLabel: 'Extraction',
  },
};

export function resolvePoolStage(key: string): PoolStageVisuals {
  return POOL_STAGE_REGISTRY[key as PoolStageKey] ?? FALLBACK;
}
