import { buildStageEntry, type StageEntry } from '../shared/stageGroupContracts.ts';
import { type FetchTabKey, FETCH_STAGE_KEYS } from './fetchStageKeys.ts';
import { FETCH_SELECT_PROPS, type FetchPanelContext } from './fetchStageSelectProps.ts';
import { FetchStealthPanel } from './FetchStealthPanel.tsx';
import { FetchPlaceholderPanel } from './FetchPlaceholderPanel.tsx';

export type FetchStageEntry = StageEntry<FetchTabKey, FetchPanelContext>;

export { FETCH_STAGE_KEYS, type FetchTabKey } from './fetchStageKeys.ts';
export { FETCH_SELECT_PROPS, type FetchPanelContext } from './fetchStageSelectProps.ts';

export const FETCH_STAGE_REGISTRY: readonly FetchStageEntry[] = [
  buildStageEntry<FetchTabKey, FetchPanelContext>(
    'stealth', 'Stealth', 'Anti-detection fingerprint injection — masks webdriver flag, spoofs plugins and languages.',
    'sf-prefetch-dot-info', 'sf-prefetch-tab-idle-info', 'sf-prefetch-tab-outline-info',
    FetchStealthPanel, FETCH_SELECT_PROPS.stealth,
  ),
  buildStageEntry<FetchTabKey, FetchPanelContext>(
    'auto_scroll', 'Auto-Scroll', 'Scroll passes to trigger lazy-loaded content — under development.',
    'sf-prefetch-dot-info', 'sf-prefetch-tab-idle-info', 'sf-prefetch-tab-outline-info',
    FetchPlaceholderPanel, FETCH_SELECT_PROPS.auto_scroll,
  ),
  buildStageEntry<FetchTabKey, FetchPanelContext>(
    'dom_expansion', 'DOM Expansion', 'Click expand/show-more buttons to reveal collapsed sections — under development.',
    'sf-prefetch-dot-info', 'sf-prefetch-tab-idle-info', 'sf-prefetch-tab-outline-info',
    FetchPlaceholderPanel, FETCH_SELECT_PROPS.dom_expansion,
  ),
  buildStageEntry<FetchTabKey, FetchPanelContext>(
    'css_override', 'CSS Override', 'Force display:block on hidden elements for full capture — under development.',
    'sf-prefetch-dot-info', 'sf-prefetch-tab-idle-info', 'sf-prefetch-tab-outline-info',
    FetchPlaceholderPanel, FETCH_SELECT_PROPS.css_override,
  ),
];
