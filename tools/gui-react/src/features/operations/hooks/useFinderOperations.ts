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
