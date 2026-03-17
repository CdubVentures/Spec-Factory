import type { SortingState } from '@tanstack/react-table';

const WORKBENCH_SESSION_KEY_PREFIX = 'studio:workbench:sessionState:';

export interface WorkbenchSessionState {
  columnVisibility: Record<string, boolean>;
  sorting: SortingState;
  globalFilter: string;
  rowSelection: Record<string, boolean>;
  drawerKey: string | null;
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

function parseBooleanRecord(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, boolean>>((acc, [key, entry]) => {
    if (!key || typeof entry !== 'boolean') return acc;
    acc[key] = entry;
    return acc;
  }, {});
}

function parseRowSelection(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, boolean>>((acc, [key, entry]) => {
    if (!key || entry !== true) return acc;
    acc[key] = true;
    return acc;
  }, {});
}

function parseSorting(value: unknown): SortingState {
  if (!Array.isArray(value)) return [];
  return value.reduce<SortingState>((acc, entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return acc;
    const id = (entry as { id?: unknown }).id;
    const desc = (entry as { desc?: unknown }).desc;
    if (typeof id !== 'string' || id.length === 0) return acc;
    if (typeof desc !== 'boolean') return acc;
    acc.push({ id, desc });
    return acc;
  }, []);
}

function parseGlobalFilter(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function parseDrawerKey(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function parseStateObject(value: unknown): WorkbenchSessionState {
  const base = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    columnVisibility: parseBooleanRecord(base.columnVisibility),
    sorting: parseSorting(base.sorting),
    globalFilter: parseGlobalFilter(base.globalFilter),
    rowSelection: parseRowSelection(base.rowSelection),
    drawerKey: parseDrawerKey(base.drawerKey),
  };
}

export function buildWorkbenchSessionStorageKey(category: string): string {
  const token = String(category || '').trim() || 'default';
  return `${WORKBENCH_SESSION_KEY_PREFIX}${token}`;
}

export function parseWorkbenchSessionState(raw: string | null | undefined): WorkbenchSessionState {
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

export function readWorkbenchSessionState(category: string): WorkbenchSessionState {
  const storage = getStorage();
  if (!storage) return parseStateObject({});
  const key = buildWorkbenchSessionStorageKey(category);
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
    return parseWorkbenchSessionState(raw);
  } catch {
    return parseStateObject({});
  }
}

export function writeWorkbenchSessionState(category: string, state: WorkbenchSessionState): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    const safeState = parseStateObject(state);
    storage.setItem(
      buildWorkbenchSessionStorageKey(category),
      JSON.stringify(safeState),
    );
  } catch {
    return;
  }
}
