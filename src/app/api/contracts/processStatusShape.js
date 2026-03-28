// WHY: O(1) Feature Scaling — SSOT for ProcessStatus response shape.
// Backend producer: processLifecycleState.js deriveProcessStatus().
// WHY dual naming: run_id/runId, product_id/productId, storage_destination/storageDestination
// are intentional legacy compat — both camelCase and snake_case sent to frontend.

export const PROCESS_STATUS_KEYS = Object.freeze([
  'running',
  'run_id', 'runId',
  'category',
  'product_id', 'productId',
  'brand', 'model', 'variant',
  'storage_destination', 'storageDestination',
  'pid', 'command', 'startedAt', 'endedAt', 'exitCode',
]);
