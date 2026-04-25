/**
 * Focused operations selectors — prevent cross-product/cross-module re-renders.
 *
 * WHY: useOperationsStore((s) => s.operations) returns a new Map reference on
 * every upsert, causing every subscriber to re-render even for unrelated products.
 * These hooks return primitives (boolean/string) so Zustand's default Object.is
 * equality prevents re-renders when the derived value hasn't actually changed.
 */
import { useCallback, useMemo } from 'react';
import { useOperationsStore, type Operation } from '../state/operationsStore.ts';

/* ── Pure selectors (testable without React) ───────────────────────── */

export function selectIsRunning(
  ops: ReadonlyMap<string, Operation>,
  type: string,
  productId: string,
): boolean {
  for (const op of ops.values()) {
    if (op.type === type && op.productId === productId && op.status === 'running') return true;
  }
  return false;
}

export function selectRunningVariantKeys(
  ops: ReadonlyMap<string, Operation>,
  type: string,
  productId: string,
  subType: string,
): string {
  const keys = new Set<string>();
  for (const op of ops.values()) {
    if (
      op.type === type &&
      op.productId === productId &&
      op.status === 'running' &&
      op.subType === subType &&
      op.variantKey
    ) {
      keys.add(op.variantKey);
    }
  }
  return [...keys].sort().join('|');
}

/** Per-key scope (keyFinder): which field_keys are currently running for this product. */
export function selectRunningFieldKeys(
  ops: ReadonlyMap<string, Operation>,
  type: string,
  productId: string,
): string {
  const keys = new Set<string>();
  for (const op of ops.values()) {
    if (
      op.type === type &&
      op.productId === productId &&
      op.status === 'running' &&
      op.fieldKey
    ) {
      keys.add(op.fieldKey);
    }
  }
  return [...keys].sort().join('|');
}

/**
 * Per-key scope (keyFinder) extended: per-fieldKey operation state and mode.
 * Returned as a pipe-separated signature string for stable Zustand equality.
 * Format: `fieldKey:status:mode|fieldKey:status:mode|...` sorted by fieldKey.
 * Only non-terminal ops are included (running + queued). Later ops on the
 * same key win (the ops map preserves insertion order; the last match stays).
 */
export function selectKeyFieldOpStatesSignature(
  ops: ReadonlyMap<string, Operation>,
  type: string,
  productId: string,
): string {
  const byFieldKey = new Map<string, { status: 'running' | 'queued'; mode: 'run' | 'loop' }>();
  for (const op of ops.values()) {
    if (op.type !== type || op.productId !== productId || !op.fieldKey) continue;
    if (op.status !== 'running' && op.status !== 'queued') continue;
    const mode = op.subType === 'loop' ? 'loop' : 'run';
    // Later ops on the same key overwrite — most recent state wins.
    byFieldKey.set(op.fieldKey, { status: op.status, mode });
  }
  return [...byFieldKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fk, { status, mode }]) => `${fk}:${status}:${mode}`)
    .join('|');
}

/* ── React hooks (thin wrappers) ───────────────────────────────────── */

export function useIsModuleRunning(type: string, productId: string): boolean {
  return useOperationsStore(
    useCallback(
      (s: { operations: ReadonlyMap<string, Operation> }) =>
        selectIsRunning(s.operations, type, productId),
      [type, productId],
    ),
  );
}

export function useRunningVariantKeys(type: string, productId: string, subType: string): ReadonlySet<string> {
  const serialized = useOperationsStore(
    useCallback(
      (s: { operations: ReadonlyMap<string, Operation> }) =>
        selectRunningVariantKeys(s.operations, type, productId, subType),
      [type, productId, subType],
    ),
  );
  return useMemo(
    () => new Set(serialized ? serialized.split('|') : []),
    [serialized],
  );
}

/**
 * Any-subtype variant-scope selector. Returns variant_keys with a currently-
 * running op of any subtype (view/hero/loop/evaluate/run). Used by the Overview
 * cells to drive the per-variant "pulsing" indicator — we want the cluster to
 * pulse regardless of which flavor of work is active.
 */
export function selectRunningVariantKeysAny(
  ops: ReadonlyMap<string, Operation>,
  type: string,
  productId: string,
): string {
  const keys = new Set<string>();
  for (const op of ops.values()) {
    if (
      op.type === type &&
      op.productId === productId &&
      op.status === 'running' &&
      op.variantKey
    ) {
      keys.add(op.variantKey);
    }
  }
  return [...keys].sort().join('|');
}

export function useRunningVariantKeysAny(type: string, productId: string): ReadonlySet<string> {
  const serialized = useOperationsStore(
    useCallback(
      (s: { operations: ReadonlyMap<string, Operation> }) =>
        selectRunningVariantKeysAny(s.operations, type, productId),
      [type, productId],
    ),
  );
  return useMemo(
    () => new Set(serialized ? serialized.split('|') : []),
    [serialized],
  );
}

/**
 * Category-scoped product-id set: which products have ANY running finder op
 * (CEF / PIF / SKF / RDF / KF — any type, any subtype). Used by the Overview
 * filter bar's "Active first" sort to float running rows to the top.
 */
export function selectRunningProductIds(
  ops: ReadonlyMap<string, Operation>,
  category: string,
): string {
  const ids = new Set<string>();
  for (const op of ops.values()) {
    if (op.status !== 'running') continue;
    if (!op.productId) continue;
    if (category && op.category !== category) continue;
    ids.add(op.productId);
  }
  return [...ids].sort().join('|');
}

export function useRunningProductIds(category: string): ReadonlySet<string> {
  const serialized = useOperationsStore(
    useCallback(
      (s: { operations: ReadonlyMap<string, Operation> }) =>
        selectRunningProductIds(s.operations, category),
      [category],
    ),
  );
  return useMemo(
    () => new Set(serialized ? serialized.split('|') : []),
    [serialized],
  );
}

/**
 * Per-product map of currently-running module types within a category. Drives
 * the Overview selection strip's per-badge module indicators.
 *
 * Format: `pid:cef,pif|pid2:kf` — sorted, pipe-delimited so Zustand's Object.is
 * skips re-renders when nothing changed.
 */
export function selectRunningModulesByProduct(
  ops: ReadonlyMap<string, Operation>,
  category: string,
): string {
  const byPid = new Map<string, Set<string>>();
  for (const op of ops.values()) {
    if (op.status !== 'running') continue;
    if (!op.productId) continue;
    if (category && op.category !== category) continue;
    let set = byPid.get(op.productId);
    if (!set) { set = new Set(); byPid.set(op.productId, set); }
    set.add(op.type);
  }
  return [...byPid.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([pid, mods]) => `${pid}:${[...mods].sort().join(',')}`)
    .join('|');
}

export function useRunningModulesByProduct(category: string): ReadonlyMap<string, ReadonlySet<string>> {
  const serialized = useOperationsStore(
    useCallback(
      (s: { operations: ReadonlyMap<string, Operation> }) =>
        selectRunningModulesByProduct(s.operations, category),
      [category],
    ),
  );
  return useMemo(() => deserializeModulesByProduct(serialized), [serialized]);
}

/**
 * Per-product map of currently-active module types within a category, where
 * "active" = queued OR running. Mirrors `selectRunningModulesByProduct` but
 * uses the broader predicate that the dispatch helpers (bulkDispatch.ts:129)
 * already treat as collision-worthy.
 *
 * Use this for **dispatch-collision detection** (e.g. the Command Console
 * warn-confirm before firing an op type onto a product). For **visual
 * indicators** (pulsing badges) use `selectRunningModulesByProduct` — pulsing
 * on queued ops would misrepresent the actual work.
 *
 * Format: identical to the running-only sibling — `pid:cef,pif|pid2:kf`.
 */
export function selectActiveModulesByProduct(
  ops: ReadonlyMap<string, Operation>,
  category: string,
): string {
  const byPid = new Map<string, Set<string>>();
  for (const op of ops.values()) {
    if (op.status !== 'running' && op.status !== 'queued') continue;
    if (!op.productId) continue;
    if (category && op.category !== category) continue;
    let set = byPid.get(op.productId);
    if (!set) { set = new Set(); byPid.set(op.productId, set); }
    set.add(op.type);
  }
  return [...byPid.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([pid, mods]) => `${pid}:${[...mods].sort().join(',')}`)
    .join('|');
}

export function useActiveModulesByProduct(category: string): ReadonlyMap<string, ReadonlySet<string>> {
  const serialized = useOperationsStore(
    useCallback(
      (s: { operations: ReadonlyMap<string, Operation> }) =>
        selectActiveModulesByProduct(s.operations, category),
      [category],
    ),
  );
  return useMemo(() => deserializeModulesByProduct(serialized), [serialized]);
}

function deserializeModulesByProduct(serialized: string): ReadonlyMap<string, ReadonlySet<string>> {
  const map = new Map<string, ReadonlySet<string>>();
  if (!serialized) return map;
  for (const token of serialized.split('|')) {
    if (!token) continue;
    const colonIdx = token.indexOf(':');
    if (colonIdx <= 0) continue;
    const pid = token.slice(0, colonIdx);
    const mods = token.slice(colonIdx + 1).split(',').filter(Boolean);
    if (mods.length > 0) map.set(pid, new Set(mods));
  }
  return map;
}

/** Per-key scope (keyFinder). Returns the set of field_keys currently running. */
export function useRunningFieldKeys(type: string, productId: string): ReadonlySet<string> {
  const serialized = useOperationsStore(
    useCallback(
      (s: { operations: ReadonlyMap<string, Operation> }) =>
        selectRunningFieldKeys(s.operations, type, productId),
      [type, productId],
    ),
  );
  return useMemo(
    () => new Set(serialized ? serialized.split('|') : []),
    [serialized],
  );
}

export interface KeyFieldOpState {
  readonly status: 'running' | 'queued';
  readonly mode: 'run' | 'loop';
}

/**
 * Per-key passenger-rides map (keyFinder). For each passenger fieldKey currently
 * being carried on one or more live keyFinder ops, lists the primary fieldKeys
 * carrying it. Used by the KeyRow's "Riding" column to render "riding with X,
 * Y" with live spinners per primary.
 *
 * Only includes ops that are running AND have passengersRegistered=true; queued
 * / pre-registration ops don't contribute to the map because their passenger
 * slate isn't known yet.
 *
 * Returns a pipe-serialized signature for Zustand equality: `fk:p1,p2|fk:p3`.
 * Consumers deserialize via the `usePassengerRides` hook.
 */
export function selectPassengerRidesSignature(
  ops: ReadonlyMap<string, Operation>,
  type: string,
  productId: string,
): string {
  const byPassenger = new Map<string, string[]>();
  for (const op of ops.values()) {
    if (op.type !== type || op.productId !== productId) continue;
    if (op.status !== 'running') continue;
    if (!Array.isArray(op.passengerFieldKeys) || op.passengerFieldKeys.length === 0) continue;
    const primary = op.fieldKey;
    if (!primary) continue;
    for (const passenger of op.passengerFieldKeys) {
      if (!passenger || passenger === primary) continue;
      let list = byPassenger.get(passenger);
      if (!list) { list = []; byPassenger.set(passenger, list); }
      if (!list.includes(primary)) list.push(primary);
    }
  }
  return [...byPassenger.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fk, primaries]) => `${fk}:${primaries.slice().sort().join(',')}`)
    .join('|');
}

export function usePassengerRides(type: string, productId: string): ReadonlyMap<string, readonly string[]> {
  const serialized = useOperationsStore(
    useCallback(
      (s: { operations: ReadonlyMap<string, Operation> }) =>
        selectPassengerRidesSignature(s.operations, type, productId),
      [type, productId],
    ),
  );
  return useMemo(() => {
    const map = new Map<string, readonly string[]>();
    if (!serialized) return map;
    for (const token of serialized.split('|')) {
      if (!token) continue;
      const colonIdx = token.indexOf(':');
      if (colonIdx <= 0) continue;
      const fk = token.slice(0, colonIdx);
      const primaries = token.slice(colonIdx + 1).split(',').filter(Boolean);
      if (primaries.length > 0) map.set(fk, primaries);
    }
    return map;
  }, [serialized]);
}

/**
 * Per-primary active-passengers map — the dual of selectPassengerRidesSignature.
 * For each running primary, lists the passengers it's currently carrying.
 * Used by the KeyRow's "Passengers" column: a row that's running as a primary
 * shows the field_keys it's taking along for the ride, each with a live spinner.
 *
 * Format: `primaryFk:p1,p2|primaryFk2:p3` — identical serialization shape to
 * the Riding side, just flipped direction.
 */
export function selectActivePassengersSignature(
  ops: ReadonlyMap<string, Operation>,
  type: string,
  productId: string,
): string {
  const byPrimary = new Map<string, string[]>();
  for (const op of ops.values()) {
    if (op.type !== type || op.productId !== productId) continue;
    if (op.status !== 'running') continue;
    const primary = op.fieldKey;
    if (!primary) continue;
    if (!Array.isArray(op.passengerFieldKeys) || op.passengerFieldKeys.length === 0) continue;
    let list = byPrimary.get(primary);
    if (!list) { list = []; byPrimary.set(primary, list); }
    for (const p of op.passengerFieldKeys) {
      if (!p || p === primary) continue;
      if (!list.includes(p)) list.push(p);
    }
  }
  return [...byPrimary.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fk, passengers]) => `${fk}:${passengers.slice().sort().join(',')}`)
    .join('|');
}

export function useActivePassengers(type: string, productId: string): ReadonlyMap<string, readonly string[]> {
  const serialized = useOperationsStore(
    useCallback(
      (s: { operations: ReadonlyMap<string, Operation> }) =>
        selectActivePassengersSignature(s.operations, type, productId),
      [type, productId],
    ),
  );
  return useMemo(() => {
    const map = new Map<string, readonly string[]>();
    if (!serialized) return map;
    for (const token of serialized.split('|')) {
      if (!token) continue;
      const colonIdx = token.indexOf(':');
      if (colonIdx <= 0) continue;
      const fk = token.slice(0, colonIdx);
      const passengers = token.slice(colonIdx + 1).split(',').filter(Boolean);
      if (passengers.length > 0) map.set(fk, passengers);
    }
    return map;
  }, [serialized]);
}

/* ── Imperative promise helpers (for chain orchestration) ─────────── */

const TERMINAL_STATUSES: ReadonlySet<Operation['status']> = new Set(['done', 'error', 'cancelled']);

export type PassengersRegisteredOutcome = 'registered' | 'terminal' | 'timeout';

/**
 * Resolve when the server-side passengersRegistered flag lands for the given
 * operation — keyFinder's runKeysSequential awaits this per-opId so the N-th
 * POST is registration-ordered behind the (N-1)-th's in-flight registry entries.
 *
 * Resolves immediately if the op already has the flag (race-safe) OR if the
 * op has already reached a terminal status (no chain can ever come). Falls
 * through with 'timeout' after `timeoutMs` so a flaky server never deadlocks
 * a chain — callers log + fire the next POST anyway.
 */
export function awaitPassengersRegistered(
  operationId: string,
  { timeoutMs = 10_000 }: { readonly timeoutMs?: number } = {},
): Promise<PassengersRegisteredOutcome> {
  return new Promise<PassengersRegisteredOutcome>((resolve) => {
    const current = useOperationsStore.getState().operations.get(operationId);
    if (current?.passengersRegistered) { resolve('registered'); return; }
    if (current && TERMINAL_STATUSES.has(current.status)) { resolve('terminal'); return; }

    let done = false;
    const finalize = (outcome: PassengersRegisteredOutcome) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(outcome);
    };

    const unsubscribe = useOperationsStore.subscribe((state) => {
      const op = state.operations.get(operationId);
      if (!op) return;
      if (op.passengersRegistered) { finalize('registered'); return; }
      if (TERMINAL_STATUSES.has(op.status)) finalize('terminal');
    });

    const timer = setTimeout(() => finalize('timeout'), timeoutMs);
  });
}

export type TerminalStatus = 'done' | 'error' | 'cancelled';

/**
 * Resolve when the given operation reaches a terminal status (done / error /
 * cancelled). Used by the Loop chain orchestrator in KeyFinderPanel to run
 * one Loop at a time — fire, await, advance.
 *
 * Returns the terminal status so the caller can decide whether to continue
 * (advance after done / error / cancelled) or halt (cancel → stop chain).
 * If the op never appears in the store (bad opId), the promise never resolves
 * — callers should guard with an AbortSignal or timeout if they want a bound.
 */
export function awaitOperationTerminal(operationId: string): Promise<TerminalStatus> {
  return new Promise<TerminalStatus>((resolve) => {
    const current = useOperationsStore.getState().operations.get(operationId);
    if (current && TERMINAL_STATUSES.has(current.status)) {
      resolve(current.status as TerminalStatus);
      return;
    }

    const unsubscribe = useOperationsStore.subscribe((state) => {
      const op = state.operations.get(operationId);
      if (!op) return;
      if (TERMINAL_STATUSES.has(op.status)) {
        unsubscribe();
        resolve(op.status as TerminalStatus);
      }
    });
  });
}

/**
 * Per-key scope with mode + status. Returns a Map from fieldKey to
 * { status, mode } for every non-terminal op on this product. Used by the
 * per-key row to distinguish running Run vs running Loop vs queued Loop,
 * so the correct button shows the spinner / queued pill.
 */
export function useKeyFieldOpStates(type: string, productId: string): ReadonlyMap<string, KeyFieldOpState> {
  const serialized = useOperationsStore(
    useCallback(
      (s: { operations: ReadonlyMap<string, Operation> }) =>
        selectKeyFieldOpStatesSignature(s.operations, type, productId),
      [type, productId],
    ),
  );
  return useMemo(() => {
    const map = new Map<string, KeyFieldOpState>();
    if (!serialized) return map;
    for (const token of serialized.split('|')) {
      if (!token) continue;
      const [fk, status, mode] = token.split(':');
      if (!fk) continue;
      if ((status === 'running' || status === 'queued') && (mode === 'run' || mode === 'loop')) {
        map.set(fk, { status, mode });
      }
    }
    return map;
  }, [serialized]);
}
