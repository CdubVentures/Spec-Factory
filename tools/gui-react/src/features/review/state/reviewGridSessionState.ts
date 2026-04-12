const REVIEW_GRID_SESSION_KEY_PREFIX = 'review:grid:sessionState:';
const SORT_MODES = new Set(['brand', 'recent', 'confidence']);
const BRAND_FILTER_MODES = new Set(['all', 'none', 'custom']);

export interface ReviewGridSessionState {
  sortMode: 'brand' | 'recent' | 'confidence';
  brandFilterMode: 'all' | 'none' | 'custom';
  selectedBrands: string[];
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function parseSortMode(value: unknown): ReviewGridSessionState['sortMode'] {
  if (typeof value !== 'string') return 'brand';
  return SORT_MODES.has(value) ? value as ReviewGridSessionState['sortMode'] : 'brand';
}

function parseBrandFilterMode(value: unknown): ReviewGridSessionState['brandFilterMode'] {
  if (typeof value !== 'string') return 'all';
  return BRAND_FILTER_MODES.has(value) ? value as ReviewGridSessionState['brandFilterMode'] : 'all';
}

function parseSelectedBrands(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const token of value) {
    if (typeof token !== 'string') continue;
    const brand = token.trim();
    if (!brand || seen.has(brand)) continue;
    seen.add(brand);
    result.push(brand);
  }
  return result;
}

function parseStateObject(value: unknown): ReviewGridSessionState {
  const base = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    sortMode: parseSortMode(base.sortMode),
    brandFilterMode: parseBrandFilterMode(base.brandFilterMode),
    selectedBrands: parseSelectedBrands(base.selectedBrands),
  };
}

export function buildReviewGridSessionStorageKey(category: string): string {
  const token = String(category || '').trim() || 'default';
  return `${REVIEW_GRID_SESSION_KEY_PREFIX}${token}`;
}

export function parseReviewGridSessionState(raw: string | null | undefined): ReviewGridSessionState {
  if (typeof raw !== 'string' || raw.length === 0) {
    return parseStateObject({});
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const wrappedState = (parsed as { state?: unknown }).state;
      if (wrappedState && typeof wrappedState === 'object' && !Array.isArray(wrappedState)) {
        return parseStateObject(wrappedState);
      }
    }
    return parseStateObject(parsed);
  } catch {
    return parseStateObject({});
  }
}

export function readReviewGridSessionState(category: string): ReviewGridSessionState {
  const storage = getStorage();
  if (!storage) return parseStateObject({});
  const key = buildReviewGridSessionStorageKey(category);
  try {
    let raw = storage.getItem(key);
    if (!raw) {
      const session = getSessionStorage();
      const legacy = session?.getItem(key) ?? null;
      if (legacy) {
        storage.setItem(key, legacy);
        session?.removeItem(key);
        raw = legacy;
      }
    }
    return parseReviewGridSessionState(raw);
  } catch {
    return parseStateObject({});
  }
}

export function writeReviewGridSessionState(category: string, state: ReviewGridSessionState): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    const safeState = parseStateObject(state);
    storage.setItem(
      buildReviewGridSessionStorageKey(category),
      JSON.stringify(safeState),
    );
  } catch {
    return;
  }
}
