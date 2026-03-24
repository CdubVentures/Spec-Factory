/**
 * Cumulative Pipeline Context Schema
 *
 * One schema that grows as data flows through the 8-stage prefetch pipeline.
 * Each checkpoint extends the previous — fields are only added, never removed.
 *
 * Seed → AfterBootstrap → AfterProfile → AfterPlanner → AfterJourney
 *      → AfterExecution → AfterResults → Final
 *
 * Services (storage, logger, frontierDb, traceWriter, planner, *Fn DI seams)
 * are NOT in this schema — they are infrastructure, not accumulated pipeline data.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Sub-schemas: NeedSet phase output shapes
// ---------------------------------------------------------------------------

export const focusGroupElementSchema = z.object({
  key: z.string(),
  label: z.string(),
  field_keys: z.array(z.string()),
  unresolved_field_keys: z.array(z.string()),
  priority: z.string(),
  phase: z.string(),
  group_search_worthy: z.boolean(),
  skip_reason: z.string().nullable(),
  normalized_key_queue: z.array(z.object({}).passthrough()),
}).passthrough();

export const seedStatusSchema = z.object({
  specs_seed: z.object({ is_needed: z.boolean() }).passthrough(),
  source_seeds: z.record(z.string(), z.object({}).passthrough()).optional().default({}),
}).passthrough();

export const seedSearchPlanSchema = z.object({
  schema_version: z.string(),
  run: z.object({}).passthrough(),
  planner: z.object({
    mode: z.string(),
    planner_complete: z.boolean(),
  }).passthrough(),
  search_plan_handoff: z.object({
    queries: z.array(z.unknown()),
    total: z.number(),
  }).passthrough(),
  panel: z.object({}).passthrough(),
  learning_writeback: z.object({}).passthrough(),
}).passthrough();

// ---------------------------------------------------------------------------
// Sub-schemas: Search Profile phase output shapes
// ---------------------------------------------------------------------------

export const queryRowSchema = z.object({
  query: z.string(),
  hint_source: z.string(),
  tier: z.string(),
  target_fields: z.array(z.string()),
}).passthrough();

export const searchProfileBaseSchema = z.object({
  category: z.string(),
  identity: z.object({}).passthrough(),
  queries: z.array(z.string()),
  query_rows: z.array(queryRowSchema),
  identity_aliases: z.array(z.unknown()),
  variant_guard_terms: z.array(z.string()),
  base_templates: z.array(z.string()),
  focus_fields: z.array(z.string()),
  query_reject_log: z.array(z.unknown()),
}).passthrough();

// ---------------------------------------------------------------------------
// Sub-schemas: typed elements for Search Execution phase array outputs
// ---------------------------------------------------------------------------

export const rawResultElementSchema = z.object({
  url: z.string(),
  title: z.string().optional().default(''),
  snippet: z.string().optional().default(''),
  provider: z.string(),
  query: z.string(),
  rank: z.number().optional(),
}).passthrough();

export const searchAttemptElementSchema = z.object({
  query: z.string(),
  provider: z.string(),
  result_count: z.number(),
  reason_code: z.string(),
  duration_ms: z.number().optional(),
}).passthrough();

export const searchJournalElementSchema = z.object({
  ts: z.string(),
  query: z.string(),
  provider: z.string(),
  result_count: z.number(),
  action: z.string().optional(),
  reason: z.string().optional(),
  duration_ms: z.number().optional(),
  reason_code: z.string().optional(),
}).passthrough();

// ---------------------------------------------------------------------------
// Checkpoint: Seed — required before any stage runs
// ---------------------------------------------------------------------------

export const pipelineContextSeed = z.object({
  config: z.record(z.string(), z.unknown()),
  job: z.object({}).passthrough(),
  category: z.string(),
  categoryConfig: z.object({}).passthrough(),
  runId: z.string().optional().default(''),
}).passthrough();

// ---------------------------------------------------------------------------
// Checkpoint: AfterBootstrap — NeedSet + Brand Resolver phases parallel + orchestrator computations
// ---------------------------------------------------------------------------

export const pipelineContextAfterBootstrap = pipelineContextSeed.extend({
  // NeedSet phase output
  focusGroups: z.array(focusGroupElementSchema),
  seedStatus: seedStatusSchema.nullable(),
  seedSearchPlan: seedSearchPlanSchema.nullable(),

  // Brand Resolver phase output
  brandResolution: z.object({
    officialDomain: z.string().optional(),
    aliases: z.array(z.string()).optional(),
    supportDomain: z.string().optional(),
    confidence: z.number().optional(),
    reasoning: z.array(z.string()).optional(),
  }).passthrough().nullable(),

  // Computed by orchestrator after NeedSet + Brand Resolver phases
  variables: z.object({
    brand: z.string().optional().default(''),
    model: z.string().optional().default(''),
    variant: z.string().optional().default(''),
    category: z.string().optional().default(''),
  }).passthrough(),
  identityLock: z.object({
    brand: z.string().optional().default(''),
    model: z.string().optional().default(''),
    variant: z.string().optional().default(''),
    productId: z.string().optional().default(''),
  }).passthrough(),
  missingFields: z.array(z.string()),
  learning: z.object({}).passthrough(),
  enrichedLexicon: z.object({}).passthrough(),
  searchProfileCaps: z.object({}).passthrough(),
  planningHints: z.object({}).passthrough(),
  queryExecutionHistory: z.object({}).passthrough(),
});

// ---------------------------------------------------------------------------
// Checkpoint: AfterProfile — Search Profile phase
// ---------------------------------------------------------------------------

export const pipelineContextAfterProfile = pipelineContextAfterBootstrap.extend({
  searchProfileBase: searchProfileBaseSchema,
});

// ---------------------------------------------------------------------------
// Checkpoint: AfterPlanner — Search Planner phase
// ---------------------------------------------------------------------------

export const pipelineContextAfterPlanner = pipelineContextAfterProfile.extend({
  enhancedRows: z.array(z.unknown()),
});

// ---------------------------------------------------------------------------
// Checkpoint: AfterJourney — Query Journey phase
// ---------------------------------------------------------------------------

export const pipelineContextAfterJourney = pipelineContextAfterPlanner.extend({
  queries: z.array(z.string()),
  selectedQueryRowMap: z.unknown(),
  profileQueryRowsByQuery: z.unknown(),
  searchProfilePlanned: z.object({}).passthrough(),
  searchProfileKeys: z.object({}).passthrough(),
  executionQueryLimit: z.number(),
  queryLimit: z.number(),
  queryRejectLogCombined: z.array(z.unknown()),
});

// ---------------------------------------------------------------------------
// Checkpoint: AfterExecution — Search Execution phase
// ---------------------------------------------------------------------------

export const pipelineContextAfterExecution = pipelineContextAfterJourney.extend({
  // Computed by orchestrator before Search Execution phase
  resultsPerQuery: z.number(),
  discoveryCap: z.number(),
  queryConcurrency: z.number(),
  providerState: z.object({}).passthrough(),
  requiredOnlySearch: z.boolean(),
  missingRequiredFields: z.array(z.string()),

  // Search Execution phase output
  rawResults: z.array(rawResultElementSchema),
  searchAttempts: z.array(searchAttemptElementSchema),
  searchJournal: z.array(searchJournalElementSchema),
  internalSatisfied: z.boolean(),
  externalSearchReason: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Sub-schemas: Result Processing phase output shapes
// ---------------------------------------------------------------------------

export const candidateRowSchema = z.object({
  url: z.string(),
  host: z.string(),
  query: z.string(),
  provider: z.string(),
  approvedDomain: z.boolean(),
  tier: z.number().nullable(),
  doc_kind_guess: z.string().optional().default(''),
  identity_match_level: z.string().optional().default(''),
  triage_disposition: z.string().optional().default(''),
  score: z.number().optional().default(0),
}).passthrough();

export const serpQueryRowSchema = z.object({
  query: z.string(),
  result_count: z.number(),
  candidate_count: z.number(),
  selected_count: z.number(),
}).passthrough();

export const serpExplorerSchema = z.object({
  generated_at: z.string(),
  query_count: z.number(),
  candidates_checked: z.number(),
  urls_selected: z.number(),
  urls_rejected: z.number(),
  hard_drop_count: z.number(),
  queries: z.array(serpQueryRowSchema),
}).passthrough();

export const discoveryResultSchema = z.object({
  enabled: z.boolean(),
  discoveryKey: z.string(),
  candidatesKey: z.string(),
  candidates: z.array(candidateRowSchema),
  selectedUrls: z.array(z.string()),
  allCandidateUrls: z.array(z.string()),
  queries: z.array(z.unknown()),
  llm_queries: z.array(z.unknown()),
  search_profile: z.object({}).passthrough(),
  search_profile_key: z.string(),
  search_profile_run_key: z.string(),
  search_profile_latest_key: z.string(),
  provider_state: z.object({}).passthrough(),
  query_concurrency: z.number(),
  internal_satisfied: z.boolean(),
  external_search_reason: z.string().nullable(),
  search_attempts: z.array(z.unknown()),
  search_journal: z.array(z.unknown()),
  serp_explorer: serpExplorerSchema,
}).passthrough();

// ---------------------------------------------------------------------------
// Checkpoint: AfterResults — Result Processing phase
// WHY: discoveryResult stays nested because it IS the final pipeline output.
// Domain Classifier phase attaches enqueue_summary directly onto it.
// ---------------------------------------------------------------------------

export const pipelineContextAfterResults = pipelineContextAfterExecution.extend({
  discoveryResult: discoveryResultSchema,
});

// ---------------------------------------------------------------------------
// Checkpoint: Final — Domain Classifier phase
// WHY: No new top-level fields. Domain Classifier phase attaches enqueue_summary to
// discoveryResult, which is already captured above via .passthrough().
// ---------------------------------------------------------------------------

export const pipelineContextFinal = pipelineContextAfterResults;

// ---------------------------------------------------------------------------
// Checkpoint registry + convenience validator
// ---------------------------------------------------------------------------

const checkpoints = {
  seed: pipelineContextSeed,
  afterBootstrap: pipelineContextAfterBootstrap,
  afterProfile: pipelineContextAfterProfile,
  afterPlanner: pipelineContextAfterPlanner,
  afterJourney: pipelineContextAfterJourney,
  afterExecution: pipelineContextAfterExecution,
  afterResults: pipelineContextAfterResults,
  final: pipelineContextFinal,
};

/**
 * Validate pipeline context against a named checkpoint.
 *
 * @param {string} checkpointName - Key in the checkpoints registry
 * @param {object} data - The accumulated pipeline context
 * @param {object} [logger] - Optional logger for warnings
 * @param {object} [config] - Optional config for enforcement mode
 * @returns {{ valid: boolean, errors?: Array }}
 */
export function validatePipelineCheckpoint(checkpointName, data, logger, config) {
  const mode = config?.pipelineSchemaEnforcementMode || 'warn';
  if (mode === 'off') return { valid: true };

  const schema = checkpoints[checkpointName];
  if (!schema) {
    return { valid: false, errors: [{ message: `Unknown checkpoint: ${checkpointName}` }] };
  }
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    }));
    if (mode === 'enforce') {
      throw new Error(`Pipeline schema validation failed at ${checkpointName}: ${errors[0]?.message}`);
    }
    logger?.warn?.('pipeline_context_validation_failed', {
      checkpoint: checkpointName,
      error_count: errors.length,
      errors: errors.slice(0, 10),
    });
    return { valid: false, errors };
  }
  return { valid: true };
}
