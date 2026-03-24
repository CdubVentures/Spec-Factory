// Pipeline feature — top-level public API barrel.
// Each phase exports through its own index.js; this barrel aggregates for external consumers.

export { runDiscoverySeedPlan, buildDiscoverySeedPlanContext } from './orchestration/index.js';

// Shared utilities (cross-phase)
export * from './shared/index.js';
