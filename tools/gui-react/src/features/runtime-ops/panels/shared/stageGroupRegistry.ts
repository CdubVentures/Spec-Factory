// WHY: Single source of truth for all stage groups in the RuntimeOps Workers tab.
// Adding a new stage group = add one entry here + create the group directory.
// Adding a panel to an existing group = modify that group's registry only.

import { STAGE_GROUP_KEYS, type StageGroupId, type AnyStageGroupDef } from './stageGroupContracts.ts';
import { PREFETCH_STAGE_KEYS, PREFETCH_STAGE_REGISTRY } from '../prefetch/prefetchStageRegistry.ts';
import { FETCH_STAGE_KEYS, FETCH_STAGE_REGISTRY } from '../fetch/fetchStageRegistry.ts';
import { EXTRACTION_STAGE_KEYS, EXTRACTION_STAGE_REGISTRY } from '../extraction/extractionStageRegistry.ts';
import { VALIDATION_STAGE_KEYS, VALIDATION_STAGE_REGISTRY } from '../validation/validationStageRegistry.ts';

export { STAGE_GROUP_KEYS, type StageGroupId } from './stageGroupContracts.ts';

export const STAGE_GROUP_REGISTRY: readonly AnyStageGroupDef[] = [
  {
    id: 'prefetch',
    label: 'Pre-Fetch',
    tip: 'Pipeline planning stages: NeedSet through Domain Classifier',
    keys: PREFETCH_STAGE_KEYS,
    registry: PREFETCH_STAGE_REGISTRY,
  },
  {
    id: 'fetch',
    label: 'Fetch',
    tip: 'Document fetching and browser pipeline modules',
    keys: FETCH_STAGE_KEYS,
    registry: FETCH_STAGE_REGISTRY,
  },
  {
    id: 'extraction',
    label: 'Extraction',
    tip: 'Data extraction and field parsing modules',
    keys: EXTRACTION_STAGE_KEYS,
    registry: EXTRACTION_STAGE_REGISTRY,
  },
  {
    id: 'validation',
    label: 'Validation',
    tip: 'Schema enforcement and quality gate modules',
    keys: VALIDATION_STAGE_KEYS,
    registry: VALIDATION_STAGE_REGISTRY,
  },
];
