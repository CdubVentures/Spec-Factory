const REVIEW_DRAWER_KEY_PREFIX = 'review:drawer:sessionState:';

export interface ReviewDrawerSessionState {
  drawerOpen: boolean;
  productId: string;
  field: string;
}

const DEFAULTS: ReviewDrawerSessionState = {
  drawerOpen: false,
  productId: '',
  field: '',
};

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

function parseStateObject(value: unknown): ReviewDrawerSessionState {
  const base = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

  return {
    drawerOpen: base.drawerOpen === true,
    productId: typeof base.productId === 'string' ? base.productId.trim() : '',
    field: typeof base.field === 'string' ? base.field.trim() : '',
  };
}

export function buildReviewDrawerStorageKey(category: string): string {
  const token = String(category || '').trim() || 'default';
  return `${REVIEW_DRAWER_KEY_PREFIX}${token}`;
}

export function parseReviewDrawerSessionState(raw: string | null | undefined): ReviewDrawerSessionState {
  if (typeof raw !== 'string' || raw.length === 0) {
    return { ...DEFAULTS };
  }
  try {
    const parsed = JSON.parse(raw);
    return parseStateObject(parsed);
  } catch {
    return { ...DEFAULTS };
  }
}

export function readReviewDrawerSessionState(category: string): ReviewDrawerSessionState {
  const storage = getStorage();
  if (!storage) return { ...DEFAULTS };
  const key = buildReviewDrawerStorageKey(category);
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
    return parseReviewDrawerSessionState(raw);
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeReviewDrawerSessionState(category: string, state: ReviewDrawerSessionState): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    const safeState = parseStateObject(state);
    storage.setItem(
      buildReviewDrawerStorageKey(category),
      JSON.stringify(safeState),
    );
  } catch {
    return;
  }
}
