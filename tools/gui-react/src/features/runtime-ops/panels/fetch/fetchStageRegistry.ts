// WHY: O(1) Feature Scaling — keys, types, labels, tips, and tones are
// auto-generated from the backend SSOT (src/core/config/runtimeStageDefs.js).
// Adding a new fetch stage = add one entry in runtimeStageDefs.js + run
// codegen + add component + add selectProps entry.

import type { ComponentType } from 'react';
import { buildStageEntry, type StageEntry } from '../shared/stageGroupContracts.ts';
import { FETCH_STAGE_KEYS, FETCH_STAGE_META, type FetchTabKey } from './fetchStageKeys.generated.ts';
import { FETCH_SELECT_PROPS, type FetchPanelContext } from './fetchStageSelectProps.ts';
import { FetchStealthPanel } from './FetchStealthPanel.tsx';
import { FetchAutoScrollPanel } from './FetchAutoScrollPanel.tsx';
import { FetchDomExpansionPanel } from './FetchDomExpansionPanel.tsx';
import { FetchCssOverridePanel } from './FetchCssOverridePanel.tsx';

export type FetchStageEntry = StageEntry<FetchTabKey, FetchPanelContext>;

export { FETCH_STAGE_KEYS, type FetchTabKey } from './fetchStageKeys.generated.ts';
export { FETCH_SELECT_PROPS, type FetchPanelContext } from './fetchStageSelectProps.ts';

// WHY: Typed against generated FetchTabKey — TypeScript errors if a key is
// missing after a new stage is added to the backend SSOT.
/* eslint-disable @typescript-eslint/no-explicit-any -- Component generics erased at registry boundary */
const FETCH_COMPONENTS: Record<FetchTabKey, ComponentType<any>> = {
  stealth: FetchStealthPanel,
  auto_scroll: FetchAutoScrollPanel,
  dom_expansion: FetchDomExpansionPanel,
  css_override: FetchCssOverridePanel,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export const FETCH_STAGE_REGISTRY: readonly FetchStageEntry[] = FETCH_STAGE_KEYS.map((key) => {
  const { label, tip, tone } = FETCH_STAGE_META[key];
  return buildStageEntry<FetchTabKey, FetchPanelContext>(
    key, label, tip,
    `sf-prefetch-dot-${tone}`, `sf-prefetch-tab-idle-${tone}`, `sf-prefetch-tab-outline-${tone}`,
    FETCH_COMPONENTS[key], FETCH_SELECT_PROPS[key],
  );
});
