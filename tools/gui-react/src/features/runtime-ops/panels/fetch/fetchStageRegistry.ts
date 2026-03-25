import { buildStageEntry, type StageEntry } from '../shared/stageGroupContracts.ts';
import { type FetchTabKey, FETCH_STAGE_KEYS } from './fetchStageKeys.ts';
import { FETCH_SELECT_PROPS, type FetchPanelContext } from './fetchStageSelectProps.ts';
import { FetchPlaceholderPanel } from './FetchPlaceholderPanel.tsx';

export type FetchStageEntry = StageEntry<FetchTabKey, FetchPanelContext>;

export { FETCH_STAGE_KEYS, type FetchTabKey } from './fetchStageKeys.ts';
export { type FetchPanelContext } from './fetchStageSelectProps.ts';

export const FETCH_STAGE_REGISTRY: readonly FetchStageEntry[] = [
  buildStageEntry<FetchTabKey, FetchPanelContext>(
    'placeholder', 'Fetch Overview', 'Fetch pipeline modules — under development.',
    'sf-prefetch-dot-info', 'sf-prefetch-tab-idle-info', 'sf-prefetch-tab-outline-info',
    FetchPlaceholderPanel, FETCH_SELECT_PROPS.placeholder,
  ),
];
