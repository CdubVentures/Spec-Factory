// WHY: O(1) Feature Scaling — keys, types, labels, tips, and tones are
// auto-generated from the backend SSOT (src/core/config/runtimeStageDefs.js).
// Adding a new extraction stage = add one entry in runtimeStageDefs.js + run
// codegen + add component + add selectProps entry.

import type { ComponentType } from 'react';
import { buildStageEntry, type StageEntry } from '../shared/stageGroupContracts.ts';
import { EXTRACTION_STAGE_KEYS, EXTRACTION_STAGE_META, type ExtractionTabKey } from './extractionStageKeys.generated.ts';
import { EXTRACTION_SELECT_PROPS, type ExtractionPanelContext } from './extractionStageSelectProps.ts';
import { ExtractionScreenshotPanel } from './ExtractionScreenshotPanel.tsx';
import { ExtractionVideoPanel } from './ExtractionVideoPanel.tsx';

export type ExtractionStageEntry = StageEntry<ExtractionTabKey, ExtractionPanelContext>;

export { EXTRACTION_STAGE_KEYS, type ExtractionTabKey } from './extractionStageKeys.generated.ts';
export { type ExtractionPanelContext } from './extractionStageSelectProps.ts';

// WHY: Typed against generated ExtractionTabKey — TypeScript errors if a key is
// missing after a new stage is added to the backend SSOT.
/* eslint-disable @typescript-eslint/no-explicit-any -- Component generics erased at registry boundary */
const EXTRACTION_COMPONENTS: Record<ExtractionTabKey, ComponentType<any>> = {
  screenshot: ExtractionScreenshotPanel,
  video: ExtractionVideoPanel,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export const EXTRACTION_STAGE_REGISTRY: readonly ExtractionStageEntry[] = EXTRACTION_STAGE_KEYS.map((key) => {
  const { label, tip, tone } = EXTRACTION_STAGE_META[key];
  return buildStageEntry<ExtractionTabKey, ExtractionPanelContext>(
    key, label, tip,
    `sf-prefetch-dot-${tone}`, `sf-prefetch-tab-idle-${tone}`, `sf-prefetch-tab-outline-${tone}`,
    EXTRACTION_COMPONENTS[key], EXTRACTION_SELECT_PROPS[key],
  );
});
