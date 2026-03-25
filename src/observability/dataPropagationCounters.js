// WHY: Canonical home moved to src/core/events/dataPropagationCounters.js
// to eliminate core→observability upward dependency.
// Re-exported here so existing feature consumers keep working.

export {
  resetDataPropagationCounters,
  recordDataChangeBroadcast,
  recordQueueCleanupOutcome,
  getDataPropagationCountersSnapshot,
} from '../core/events/dataPropagationCounters.js';
