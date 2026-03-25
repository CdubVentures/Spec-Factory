import { buildStageEntry, type StageEntry } from '../shared/stageGroupContracts.ts';
import { type ValidationTabKey, VALIDATION_STAGE_KEYS } from './validationStageKeys.ts';
import { VALIDATION_SELECT_PROPS, type ValidationPanelContext } from './validationStageSelectProps.ts';
import { ValidationPlaceholderPanel } from './ValidationPlaceholderPanel.tsx';

export type ValidationStageEntry = StageEntry<ValidationTabKey, ValidationPanelContext>;

export { VALIDATION_STAGE_KEYS, type ValidationTabKey } from './validationStageKeys.ts';
export { type ValidationPanelContext } from './validationStageSelectProps.ts';

export const VALIDATION_STAGE_REGISTRY: readonly ValidationStageEntry[] = [
  buildStageEntry<ValidationTabKey, ValidationPanelContext>(
    'placeholder', 'Validation Overview', 'Validation pipeline modules — under development.',
    'sf-prefetch-dot-accent', 'sf-prefetch-tab-idle-accent', 'sf-prefetch-tab-outline-accent',
    ValidationPlaceholderPanel, VALIDATION_SELECT_PROPS.placeholder,
  ),
];
