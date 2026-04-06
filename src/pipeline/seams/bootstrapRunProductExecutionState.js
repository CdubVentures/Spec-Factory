import fs from 'node:fs';
import path from 'node:path';

import {
  stableHash,
} from '../../features/indexing/orchestration/shared/index.js';
import {
  createRunLlmRuntime,
} from '../../features/indexing/orchestration/bootstrap/index.js';
import { readBillingSnapshot } from '../../billing/costLedger.js';
import { defaultIndexLabRoot } from '../../core/config/runtimeArtifactRoots.js';
import { normalizeCostRates } from '../../billing/costRates.js';
import { computeNeedSet } from '../../features/indexing/pipeline/needSet/needsetEngine.js';
import { appendCostLedgerEntry } from '../../billing/costLedger.js';
import { loadPipelineBootConfig } from './loadPipelineBootConfig.js';

const DEFAULT_DEPS = {
  loadPipelineBootConfigFn: loadPipelineBootConfig,
  readBillingSnapshotFn: readBillingSnapshot,
  createRunLlmRuntimeFn: createRunLlmRuntime,
  normalizeCostRatesFn: normalizeCostRates,
  appendCostLedgerEntryFn: appendCostLedgerEntry,
  recordPromptResultFn: () => {},
  defaultIndexLabRootFn: defaultIndexLabRoot,
  joinPathFn: path.join,
  mkdirSyncFn: fs.mkdirSync,
  computeNeedSetFn: computeNeedSet,
};

export async function bootstrapRunConfig({
  storage,
  config,
  logger,
  category,
  productId,
  runId,
  roundContext,
  runtimeMode,
  job,
  identityLock,
  identityLockStatus,
  runArtifactsBase,
  syncRuntimeOverrides,
  frontierDb,
  specDb = null,
  deps = {},
} = {}) {
  const runtimeDeps = { ...DEFAULT_DEPS, ...deps };

  // WHY: DB-first boot — reads one cached row instead of ~11 JSON files.
  logger.info('bootstrap_step', { step: 'config', progress: 0 });
  const categoryConfig = runtimeDeps.loadPipelineBootConfigFn({ specDb, category });

  const billingMonth = new Date().toISOString().slice(0, 7);
  const fieldOrder = categoryConfig.fieldOrder;
  const requiredFields = job.requirements?.requiredFields || categoryConfig.requiredFields;

  // WHY: syncRuntimeOverrides and readBillingSnapshot are independent — run in parallel.
  logger.info('bootstrap_step', { step: 'billing', progress: 40 });
  const [runtimeOverrides, billingSnapshot] = await Promise.all([
    syncRuntimeOverrides({ force: true }),
    runtimeDeps.readBillingSnapshotFn({ storage, month: billingMonth, productId, specDb }),
  ]);
  const blockedHosts = new Set(runtimeOverrides?.blocked_domains || []);

  const brand = String(identityLock.brand || job?.identityLock?.brand || job?.brand || '').trim();
  const model = String(identityLock.model || job?.identityLock?.model || '').trim();

  logger.info('bootstrap_step', { step: 'llm', progress: 65 });
  const llmRuntime = runtimeDeps.createRunLlmRuntimeFn({
    storage,
    config,
    category,
    productId,
    runId,
    roundContext,
    runtimeMode,
    runtimeOverrides,
    specDb,
    billingSnapshot,
    stableHashFn: stableHash,
    normalizeCostRatesFn: runtimeDeps.normalizeCostRatesFn,
    appendCostLedgerEntryFn: runtimeDeps.appendCostLedgerEntryFn,
    recordPromptResultFn: runtimeDeps.recordPromptResultFn,
    defaultIndexLabRootFn: runtimeDeps.defaultIndexLabRootFn,
    joinPathFn: runtimeDeps.joinPathFn,
    mkdirSyncFn: runtimeDeps.mkdirSyncFn,
  });
  const llmContext = llmRuntime.llmContext;

  logger.info('bootstrap_step', { step: 'needset', progress: 85 });
  const initialNeedSet = runtimeDeps.computeNeedSetFn({
    runId,
    category,
    productId,
    fieldOrder,
    provenance: {},
    fieldRules: categoryConfig.fieldRules,
    fieldReasoning: {},
    constraintAnalysis: {},
    identityContext: {
      status: identityLockStatus || 'unknown',
      confidence: 0,
      identity_gate_validated: false,
      extraction_gate_open: true,
      family_model_count: Number(identityLock.family_model_count || 0),
      ambiguity_level: String(identityLock.ambiguity_level || '').trim().toLowerCase(),
      publishable: false,
      publish_blockers: [],
      reason_codes: [],
      page_count: 0,
      max_match_score: 0,
    },
    brand,
    model,
    baseModel: String(identityLock.base_model || job?.identityLock?.base_model || '').trim(),
    round: 0,
  });
  logger.info('needset_computed', {
    ...initialNeedSet,
    productId,
    runId,
    category,
    scope: 'initial',
    needset_size: Array.isArray(initialNeedSet.fields)
      ? initialNeedSet.fields.filter((f) => f.state !== 'accepted').length : 0,
  });

  return {
    categoryConfig,
    runtimeOverrides,
    llmContext,
    initialNeedSet,
    blockedHosts,
    requiredFields,
  };
}
