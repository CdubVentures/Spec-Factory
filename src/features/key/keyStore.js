/**
 * Key Finder — JSON store + rebuild (Phase 2 stub).
 *
 * Registry wiring needs a rebuild function to round-trip reseed contracts.
 * The orchestrator (Phase 3) will fill in merge semantics and actual disk
 * shape; for now this is a no-op.
 */

import { createFinderJsonStore } from '../../core/finder/finderJsonStore.js';

const store = createFinderJsonStore({
  filePrefix: 'key_finder',
  emptySelected: () => ({ keys: {} }),
});

export const readKeyFinder = store.read;
export const writeKeyFinder = store.write;
export const mergeKeyFinderDiscovery = store.merge;
export const deleteKeyFinderRun = store.deleteRun;
export const deleteKeyFinderAll = store.deleteAll;

/**
 * Rebuild SQL projection from JSON on disk. Phase 3 fills this in —
 * the stub is a no-op so the reseed contract doesn't blow up at boot.
 */
export async function rebuildKeyFinderFromJson(/* { specDb, productRoot } */) {
  return { modules: 0, products: 0, runs: 0 };
}
