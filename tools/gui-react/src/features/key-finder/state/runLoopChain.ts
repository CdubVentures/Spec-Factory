/**
 * runLoopChain — pure async orchestrator for Loop Group / Loop All chains.
 *
 * Fires one Loop at a time, awaiting each op's terminal status before
 * advancing. Between iterations, consults `isResolved` against the LATEST
 * store/query state so keys that became resolved mid-chain (e.g. as a
 * passenger on a prior iteration's primary) are skipped instead of re-Looped.
 *
 * Caller is responsible for passing an `isResolved` closure that reads
 * fresh state each call (typically via a ref pointing at the latest
 * `grouped.groups` snapshot — NOT the snapshot captured at chain start).
 */

export type ChainOutcome = 'complete' | 'cancelled';
export type ChainAction = 'firing' | 'skipped';

export interface ChainStep {
  readonly index: number;
  readonly fk: string;
  readonly action: ChainAction;
}

export interface RunLoopChainArgs {
  readonly keys: readonly string[];
  /** Latest-state predicate — called once per slot, re-reads external state
   *  each call. Returning true skips the slot without firing. */
  readonly isResolved: (fk: string) => boolean;
  /** Latest-state dependency predicate. Returning true skips the slot. */
  readonly isBlocked?: (fk: string) => boolean;
  /** Dispatch one Loop; resolve with the server-assigned operationId. */
  readonly fireOne: (fk: string) => Promise<string>;
  /** Await an op's terminal status. Returning 'cancelled' halts the chain. */
  readonly awaitTerminal: (opId: string) => Promise<'done' | 'error' | 'cancelled'>;
  /** Progress hook — fires once per slot with action='firing' or 'skipped'. */
  readonly onStep?: (step: ChainStep) => void;
}

export async function runLoopChain({
  keys,
  isResolved,
  isBlocked = () => false,
  fireOne,
  awaitTerminal,
  onStep,
}: RunLoopChainArgs): Promise<ChainOutcome> {
  for (let i = 0; i < keys.length; i += 1) {
    const fk = keys[i];
    if (isResolved(fk) || isBlocked(fk)) {
      onStep?.({ index: i, fk, action: 'skipped' });
      continue;
    }
    onStep?.({ index: i, fk, action: 'firing' });
    const opId = await fireOne(fk);
    const terminal = await awaitTerminal(opId);
    if (terminal === 'cancelled') return 'cancelled';
  }
  return 'complete';
}
