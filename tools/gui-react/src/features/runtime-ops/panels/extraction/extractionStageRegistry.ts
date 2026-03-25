import { buildStageEntry, type StageEntry } from '../shared/stageGroupContracts.ts';
import { type ExtractionTabKey, EXTRACTION_STAGE_KEYS } from './extractionStageKeys.ts';
import { EXTRACTION_SELECT_PROPS, type ExtractionPanelContext } from './extractionStageSelectProps.ts';
import { ExtractionPlaceholderPanel } from './ExtractionPlaceholderPanel.tsx';

export type ExtractionStageEntry = StageEntry<ExtractionTabKey, ExtractionPanelContext>;

export { EXTRACTION_STAGE_KEYS, type ExtractionTabKey } from './extractionStageKeys.ts';
export { type ExtractionPanelContext } from './extractionStageSelectProps.ts';

export const EXTRACTION_STAGE_REGISTRY: readonly ExtractionStageEntry[] = [
  buildStageEntry<ExtractionTabKey, ExtractionPanelContext>(
    'placeholder', 'Extraction Overview', 'Extraction pipeline modules — under development.',
    'sf-prefetch-dot-warning', 'sf-prefetch-tab-idle-warning', 'sf-prefetch-tab-outline-warning',
    ExtractionPlaceholderPanel, EXTRACTION_SELECT_PROPS.placeholder,
  ),
];
