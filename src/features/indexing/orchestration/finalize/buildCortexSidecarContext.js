import { CortexClient } from '../../../../core/llm/cortex/cortexClient.js';

export async function buildCortexSidecarContext({
  config = {},
  confidence = 0,
  criticalFieldsBelowPassTarget = [],
  anchorMajorConflictsCount = 0,
  constraintAnalysis = {},
  completenessStats = {},
  logger = { warn: () => {} },
  createCortexClientFn = (args) => new CortexClient(args),
} = {}) {
  if (!config.cortexEnabled) {
    return {
      enabled: false,
      attempted: false,
      mode: 'disabled',
      fallback_to_non_sidecar: true,
      fallback_reason: 'sidecar_disabled',
      deep_task_count: 0,
    };
  }

  const cortexTasks = [
    {
      id: 'evidence-audit',
      type: 'evidence_audit',
      critical: true,
      payload: {
        critical_fields_below_pass_target: criticalFieldsBelowPassTarget,
      },
    },
    {
      id: 'conflict-triage',
      type: 'conflict_resolution',
      critical: true,
      payload: {
        anchor_major_conflicts_count: anchorMajorConflictsCount,
        contradiction_count: constraintAnalysis?.contradictionCount || 0,
      },
    },
    {
      id: 'critical-gap-fill',
      type: 'critical_gap_fill',
      critical: true,
      payload: {
        missing_required_fields: completenessStats.missingRequiredFields,
      },
    },
  ];

  try {
    const client = createCortexClientFn({ config });
    const cortexResult = await client.runPass({
      tasks: cortexTasks,
      context: {
        confidence,
        critical_conflicts_remain:
          anchorMajorConflictsCount > 0 || (constraintAnalysis?.contradictionCount || 0) > 0,
        critical_gaps_remain: criticalFieldsBelowPassTarget.length > 0,
        evidence_audit_failed_on_critical: false,
      },
    });
    return {
      enabled: true,
      attempted: true,
      mode: cortexResult.mode,
      fallback_to_non_sidecar: Boolean(cortexResult.fallback_to_non_sidecar),
      fallback_reason: cortexResult.fallback_reason || null,
      deep_task_count: Number(cortexResult?.plan?.deep_task_count || 0),
    };
  } catch (error) {
    logger.warn('cortex_sidecar_failed', {
      message: error.message,
    });
    return {
      enabled: true,
      attempted: true,
      mode: 'fallback',
      fallback_to_non_sidecar: true,
      fallback_reason: 'sidecar_execution_error',
      deep_task_count: 0,
    };
  }
}
