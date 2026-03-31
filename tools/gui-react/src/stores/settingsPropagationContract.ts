export const SETTINGS_PROPAGATION_STORAGE_KEY = 'spec-factory:settings-propagation:v1';

export const SETTINGS_PROPAGATION_DOMAINS = Object.freeze([
  'runtime',
  'ui',
  'llm',
  'source-strategy',
] as const);

export type SettingsPropagationDomain = (typeof SETTINGS_PROPAGATION_DOMAINS)[number];

export interface SettingsPropagationEvent {
  domain: SettingsPropagationDomain;
  category?: string;
  timestamp: string;
  nonce: string;
}

interface PublishSettingsPropagationInput {
  domain: SettingsPropagationDomain;
  category?: string;
}

function canUseWindowStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function createNonce(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeDomain(value: unknown): SettingsPropagationDomain | null {
  const token = String(value || '').trim().toLowerCase();
  if ((SETTINGS_PROPAGATION_DOMAINS as readonly string[]).includes(token)) {
    return token as SettingsPropagationDomain;
  }
  return null;
}

export function publishSettingsPropagation({ domain, category }: PublishSettingsPropagationInput): void {
  if (!canUseWindowStorage()) return;
  const message: SettingsPropagationEvent = {
    domain,
    category: category ? String(category) : undefined,
    timestamp: new Date().toISOString(),
    nonce: createNonce(),
  };
  try {
    window.localStorage.setItem(SETTINGS_PROPAGATION_STORAGE_KEY, JSON.stringify(message));
  } catch {
    return;
  }
}

function parseSettingsPropagationEvent(raw: string): SettingsPropagationEvent | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed)) return null;
    const domain = normalizeDomain(parsed.domain);
    if (!domain) return null;
    const category = typeof parsed.category === 'string' && parsed.category.trim().length > 0
      ? parsed.category
      : undefined;
    const timestamp = typeof parsed.timestamp === 'string' && parsed.timestamp
      ? parsed.timestamp
      : new Date().toISOString();
    const nonce = typeof parsed.nonce === 'string' && parsed.nonce
      ? parsed.nonce
      : createNonce();
    return {
      domain,
      category,
      timestamp,
      nonce,
    };
  } catch {
    return null;
  }
}

export function subscribeSettingsPropagation(
  onEvent: (event: SettingsPropagationEvent) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};

  const listener = (event: StorageEvent) => {
    if (event.key !== SETTINGS_PROPAGATION_STORAGE_KEY) return;
    const parsed = parseSettingsPropagationEvent(event.newValue || '');
    if (!parsed) return;
    onEvent(parsed);
  };

  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener('storage', listener);
  };
}

