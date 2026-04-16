import type { Operation } from '../../operations/state/operationsStore.ts';

export interface StudioOperationsState {
  readonly compileRunning: boolean;
  readonly validateRunning: boolean;
  readonly compileError: string | null;
  readonly validateError: string | null;
  readonly anyStudioOpRunning: boolean;
}

/**
 * Derive compile/validate running state from the multi-slot operations store
 * scoped to a specific category. Replaces the fragile processCommand.includes()
 * string inspection pattern.
 */
export function deriveStudioOperationsState(
  operations: ReadonlyMap<string, Operation>,
  category: string,
): StudioOperationsState {
  let compileRunning = false;
  let validateRunning = false;
  let compileError: string | null = null;
  let validateError: string | null = null;

  for (const op of operations.values()) {
    if (op.category !== category) continue;

    if (op.type === 'compile') {
      if (op.status === 'running') compileRunning = true;
      if (op.status === 'error') compileError = op.error;
    }
    if (op.type === 'validate') {
      if (op.status === 'running') validateRunning = true;
      if (op.status === 'error') validateError = op.error;
    }
  }

  return {
    compileRunning,
    validateRunning,
    compileError,
    validateError,
    anyStudioOpRunning: compileRunning || validateRunning,
  };
}
