export type PipelineStageId =
  | 'cef_1'
  | 'cef_2'
  | 'pif_dep'
  | 'pif_loop'
  | 'pif_eval'
  | 'rdf_run'
  | 'sku_run'
  | 'kf_early'
  | 'kf_context';

export type PipelineStageKind =
  | 'cef'
  | 'pif-dep'
  | 'pif-loop'
  | 'pif-eval'
  | 'rdf-run'
  | 'sku-run'
  | 'kf-early'
  | 'kf-context';

export type PipelineProgressStepId =
  | 'cef'
  | 'dp'
  | 'pif'
  | 'eval'
  | 'rdf'
  | 'sku'
  | 'kf';

export interface PipelineStage {
  readonly id: PipelineStageId;
  readonly label: string;
  readonly kind: PipelineStageKind;
  readonly progressStepId: PipelineProgressStepId;
  readonly dependencies: readonly PipelineStageId[];
}

export interface PipelineKfSummaryLike {
  readonly field_key: string;
  readonly product_image_dependent?: boolean;
  readonly uses_variant_inventory?: boolean;
  readonly uses_pif_priority_images?: boolean;
  readonly variant_dependent?: boolean;
}

export type PipelineKfBucket = 'early' | 'contextual' | 'pif-dependency' | 'excluded';

export const PIPELINE_STAGES: readonly PipelineStage[] = Object.freeze([
  {
    id: 'cef_1',
    label: 'CEF run 1',
    kind: 'cef',
    progressStepId: 'cef',
    dependencies: [],
  },
  {
    id: 'cef_2',
    label: 'CEF run 2',
    kind: 'cef',
    progressStepId: 'cef',
    dependencies: ['cef_1'],
  },
  {
    id: 'pif_dep',
    label: 'Dependency keys',
    kind: 'pif-dep',
    progressStepId: 'dp',
    dependencies: ['cef_2'],
  },
  {
    id: 'rdf_run',
    label: 'RDF run',
    kind: 'rdf-run',
    progressStepId: 'rdf',
    dependencies: ['cef_2'],
  },
  {
    id: 'sku_run',
    label: 'SKU run',
    kind: 'sku-run',
    progressStepId: 'sku',
    dependencies: ['cef_2'],
  },
  {
    id: 'pif_loop',
    label: 'PIF loop',
    kind: 'pif-loop',
    progressStepId: 'pif',
    dependencies: ['pif_dep'],
  },
  {
    id: 'pif_eval',
    label: 'PIF eval',
    kind: 'pif-eval',
    progressStepId: 'eval',
    dependencies: ['pif_loop'],
  },
  {
    id: 'kf_early',
    label: 'KF independent keys',
    kind: 'kf-early',
    progressStepId: 'kf',
    dependencies: [],
  },
  {
    id: 'kf_context',
    label: 'KF contextual keys',
    kind: 'kf-context',
    progressStepId: 'kf',
    dependencies: ['kf_early', 'rdf_run', 'sku_run', 'pif_eval'],
  },
]);

const PIPELINE_STAGE_BY_ID = new Map<PipelineStageId, PipelineStage>(
  PIPELINE_STAGES.map((stage) => [stage.id, stage]),
);

export function getPipelineStage(stageId: PipelineStageId): PipelineStage {
  const stage = PIPELINE_STAGE_BY_ID.get(stageId);
  if (!stage) throw new Error(`unknown_pipeline_stage:${stageId}`);
  return stage;
}

export function getRunnablePipelineStageIds({
  completed,
  running,
}: {
  readonly completed: ReadonlySet<PipelineStageId>;
  readonly running: ReadonlySet<PipelineStageId>;
}): readonly PipelineStageId[] {
  return PIPELINE_STAGES
    .filter((stage) => !completed.has(stage.id))
    .filter((stage) => !running.has(stage.id))
    .filter((stage) => stage.dependencies.every((dependency) => completed.has(dependency)))
    .map((stage) => stage.id);
}

export function getPipelineStageBatches(): readonly (readonly PipelineStageId[])[] {
  const completed = new Set<PipelineStageId>();
  const batches: PipelineStageId[][] = [];

  while (completed.size < PIPELINE_STAGES.length) {
    const next = getRunnablePipelineStageIds({ completed, running: new Set() })
      .filter((stageId) => !completed.has(stageId));
    if (next.length === 0) throw new Error('pipeline_stage_graph_cycle');
    batches.push(next);
    for (const stageId of next) completed.add(stageId);
  }

  return batches;
}

export function classifyPipelineKfBucket(
  row: PipelineKfSummaryLike,
  reservedKeys: ReadonlySet<string>,
): PipelineKfBucket {
  const fieldKey = String(row.field_key || '').trim();
  if (!fieldKey) return 'excluded';
  if (reservedKeys.has(fieldKey)) return 'excluded';
  if (row.variant_dependent === true) return 'excluded';
  if (row.product_image_dependent === true) return 'pif-dependency';
  if (row.uses_variant_inventory === true || row.uses_pif_priority_images === true) {
    return 'contextual';
  }
  return 'early';
}
