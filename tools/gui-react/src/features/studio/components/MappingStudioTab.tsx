import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { usePersistedToggle } from "../../../stores/collapseStore.ts";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useUiStore } from "../../../stores/uiStore.ts";
import { Tip } from "../../../shared/ui/feedback/Tip.tsx";
import { autoSaveFingerprint } from "../../../stores/autoSaveFingerprint.ts";
import {
  SETTINGS_AUTOSAVE_DEBOUNCE_MS,
} from "../../../stores/settingsManifest.ts";
import {
  shouldFlushStudioMapOnUnmount,
} from "../state/studioBehaviorContracts.ts";
import {
  registerUnloadGuard,
  markDomainFlushedByUnmount,
  isDomainFlushedByUnload,
} from "../../../stores/settingsUnloadGuard.ts";
import {
  DEFAULT_PRIORITY_PROFILE,
  deriveComponentSourcePriority,
  deriveListPriority,
  hasExplicitPriority,
  normalizeAiAssistConfig,
  normalizePriorityProfile,
} from "../state/studioPriority.ts";
import {
  createEmptyComponentSource as emptyComponentSource,
} from "../state/studioComponentSources.ts";
import {
  inputCls,
  labelCls,
  STUDIO_TIPS,
} from "./studioConstants.ts";
import type { StudioPageActivePanelMappingProps as MappingStudioTabProps } from "./studioPagePanelContracts.ts";
import type {
  StudioConfig,
  ComponentSource,
  EnumEntry,
  PriorityProfile,
  AiAssistConfig,
} from "../../../types/studio.ts";
import { EditableDataList } from "./EditableDataList.tsx";
import { EditableComponentSource } from "./EditableComponentSource.tsx";
import { useStudioFieldRulesState } from "../state/studioFieldRulesController.ts";

interface DataListEntry {
  field: string;
  normalize: string;
  delimiter: string;
  manual_values: string[];
  priority?: PriorityProfile;
  ai_assist?: AiAssistConfig;
}


// ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Shared styles ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬
import { btnPrimary, btnSecondary, sectionCls, actionBtnWidth } from '../../../shared/ui/buttonClasses.ts';

// ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Field Rule Table Columns ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬
// ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Role definitions ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬

// ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Property row type ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬
// Legacy property key ÃƒÂ¢Ã¢â‚¬Â ' product field key mapping (used during migration)


// ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Tabs ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬


// ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬

export function MappingStudioTab({
  wbMap,
  tooltipCount,
  tooltipCoverage,
  tooltipFiles,
  onSaveMap,
  saving,
  saveSuccess,
  saveErrorMessage,
  rules,
  fieldOrder,
  knownValues,
  autoSaveMapEnabled,
  setAutoSaveMapEnabled,
  autoSaveMapLocked,
}: MappingStudioTabProps) {
  const { egLockedKeys } = useStudioFieldRulesState();
  const [tooltipPath, setTooltipPath] = useState("");
  const [compSources, setCompSources] = useState<ComponentSource[]>([]);
  const [dataLists, setDataLists] = useState<DataListEntry[]>([]);
  const [seededVersion, setSeededVersion] = useState("");
  const lastMapAutoSaveFingerprintRef = useRef("");
  const [showTooltipSource, toggleTooltipSource] = usePersistedToggle(
    "studio:drawer:tooltipSource",
    false,
  );
  const [showComponentSourceMapping, toggleComponentSourceMapping] =
    usePersistedToggle("studio:drawer:componentSourceMapping", false);
  const [showEnumSection, toggleEnumSection] = usePersistedToggle(
    "studio:drawer:enumSection",
    false,
  );
  const studioMapAutoSaveDelaySeconds = (
    SETTINGS_AUTOSAVE_DEBOUNCE_MS.studioMap / 1000
  ).toFixed(1);

  const mapSeedVersion = useMemo(() => {
    const componentSourceCount = Array.isArray(wbMap.component_sources)
      ? wbMap.component_sources.length
      : 0;
    const rawEnumLists = (
      Array.isArray(wbMap.data_lists) && wbMap.data_lists.length > 0
        ? wbMap.data_lists
        : Array.isArray(wbMap.enum_lists)
          ? wbMap.enum_lists
          : []
    ) as EnumEntry[];
    const manualMap =
      wbMap.manual_enum_values && typeof wbMap.manual_enum_values === "object"
        ? (wbMap.manual_enum_values as Record<string, unknown>)
        : {};
    return [
      String(wbMap.version || ""),
      String(wbMap.version_snapshot || ""),
      String(wbMap.tooltip_source?.path || ""),
      String(componentSourceCount),
      String(rawEnumLists.length),
      String(Object.keys(manualMap).length),
    ].join("|");
  }, [wbMap]);

  useEffect(() => {
    if (seededVersion === mapSeedVersion) return;
    setTooltipPath(wbMap.tooltip_source?.path || "");
    const sources = wbMap.component_sources || [];
    const normalizedCompSources = (Array.isArray(sources) ? sources : []).map(
      (src) => {
        const source = (src || {}) as ComponentSource;
        const inferredPriority = deriveComponentSourcePriority(source, rules);
        return {
          ...source,
          priority: hasExplicitPriority(source.priority)
            ? normalizePriorityProfile(source.priority)
            : inferredPriority,
          ai_assist: normalizeAiAssistConfig(source.ai_assist),
        } as ComponentSource;
      },
    );
    setCompSources(normalizedCompSources);
    const rawEnumLists = (
      Array.isArray(wbMap.data_lists) && wbMap.data_lists.length > 0
        ? wbMap.data_lists
        : Array.isArray(wbMap.enum_lists)
          ? wbMap.enum_lists
          : []
    ) as EnumEntry[];
    const manualEnumValues = wbMap.manual_enum_values;
    const manualMap =
      manualEnumValues && typeof manualEnumValues === "object"
        ? manualEnumValues
        : ({} as Record<string, string[]>);
    const seenFields = new Set<string>();
    const seededLists: DataListEntry[] = [];
    for (const el of rawEnumLists) {
      seenFields.add(el.field);
      seededLists.push({
        field: el.field,
        normalize: el.normalize || "lower_trim",
        delimiter: el.delimiter || "",
        manual_values: Array.isArray(el.values)
          ? el.values
          : Array.isArray(el.manual_values)
            ? el.manual_values
            : Array.isArray(manualMap[el.field])
              ? manualMap[el.field]
              : [],
        priority: hasExplicitPriority(el.priority)
          ? normalizePriorityProfile(el.priority)
          : deriveListPriority(el.field, rules),
        ai_assist: normalizeAiAssistConfig(el.ai_assist),
      });
    }
    for (const [field, values] of Object.entries(manualMap)) {
      if (
        !seenFields.has(field) &&
        Array.isArray(values) &&
        values.length > 0
      ) {
        seededLists.push({
          field,
          normalize: "lower_trim",
          delimiter: "",
          manual_values: values,
          priority: { ...DEFAULT_PRIORITY_PROFILE },
          ai_assist: normalizeAiAssistConfig(undefined),
        });
      }
    }
    // WHY: EG-locked fields with known_values (e.g., colors from registry)
    // appear as locked enum entries. O(1): driven by egLockedKeys + knownValues.
    for (const egKey of egLockedKeys) {
      if (seenFields.has(egKey)) continue;
      const egValues = knownValues[egKey];
      if (!Array.isArray(egValues) || egValues.length === 0) continue;
      seededLists.push({
        field: egKey,
        normalize: 'lower_trim',
        delimiter: '',
        manual_values: egValues,
        priority: deriveListPriority(egKey, rules),
        ai_assist: normalizeAiAssistConfig(undefined),
      });
    }
    setDataLists(seededLists);
    // WHY: assembleMap converts data_lists + manual_enum_values into the
    // derived enum_lists on save. The seeded fingerprint must use the same
    // shape so the auto-save dedup gate sees a match and doesn't fire a
    // spurious save after every rehydration.
    const { data_lists: _omitSeedDl, manual_enum_values: _omitSeedMev, ...cleanSeedBase } = wbMap as StudioConfig & { data_lists?: unknown; manual_enum_values?: unknown };
    const seededPayload: StudioConfig = {
      ...cleanSeedBase,
      tooltip_source: {
        path: wbMap.tooltip_source?.path || "",
      },
      component_sources: normalizedCompSources.map((src) => ({
        ...src,
        priority: normalizePriorityProfile(src.priority),
        ai_assist: normalizeAiAssistConfig(src.ai_assist),
      })),
      enum_lists: seededLists.map((dl) => ({
        field: dl.field,
        normalize: dl.normalize,
        values: dl.manual_values,
        priority: normalizePriorityProfile(dl.priority),
        ai_assist: normalizeAiAssistConfig(dl.ai_assist),
      })),
    };
    lastMapAutoSaveFingerprintRef.current = autoSaveFingerprint(seededPayload);
    setSeededVersion(mapSeedVersion);
  }, [wbMap, mapSeedVersion, seededVersion, rules]);

  const assembleMap = useCallback((): StudioConfig => {
    // WHY: assembleMap converts the UI's dataLists state into the derived
    // enum_lists array. data_lists (authoring config) and manual_enum_values
    // (scratch-mode values) are omitted because the enum_lists output below
    // already carries the merged result. On reload, seeding re-derives them
    // from whichever source is present.
    const { data_lists: _omitDl, manual_enum_values: _omitMev, ...cleanMap } = wbMap as StudioConfig & { data_lists?: unknown; manual_enum_values?: unknown };
    return {
      ...cleanMap,
      tooltip_source: {
        path: tooltipPath,
      },
      component_sources: compSources.map((src) => ({
        ...src,
        priority: normalizePriorityProfile(src.priority),
        ai_assist: normalizeAiAssistConfig(src.ai_assist),
      })),
      enum_lists: dataLists.map((dl) => ({
        field: dl.field,
        normalize: dl.normalize,
        values: dl.manual_values,
        priority: normalizePriorityProfile(dl.priority),
        ai_assist: normalizeAiAssistConfig(dl.ai_assist),
      })),
    };
  }, [wbMap, tooltipPath, compSources, dataLists]);

  function handleSave() {
    const nextMap = assembleMap();
    lastMapAutoSaveFingerprintRef.current = autoSaveFingerprint(nextMap);
    onSaveMap(nextMap);
  }

  const mapHydrated = useRef(false);
  const hasMapPayload = Object.keys(wbMap || {}).length > 0;
  useEffect(() => {
    if (seededVersion && hasMapPayload) mapHydrated.current = true;
  }, [seededVersion, hasMapPayload]);

  useEffect(() => {
    if (!autoSaveMapEnabled || !mapHydrated.current) return;
    const nextMap = assembleMap();
    const nextFingerprint = autoSaveFingerprint(nextMap);
    if (
      nextFingerprint &&
      nextFingerprint === lastMapAutoSaveFingerprintRef.current
    )
      return;
    const timer = setTimeout(() => {
      onSaveMap(nextMap);
      lastMapAutoSaveFingerprintRef.current = nextFingerprint;
    }, SETTINGS_AUTOSAVE_DEBOUNCE_MS.studioMap);
    return () => clearTimeout(timer);
  }, [
    autoSaveMapEnabled,
    tooltipPath,
    compSources,
    dataLists,
    assembleMap,
    onSaveMap,
  ]);

  useEffect(() => {
    return registerUnloadGuard({
      domain: 'studioMap',
      isDirty: () => {
        if (!autoSaveMapEnabled || !mapHydrated.current) return false;
        const nextMap = assembleMap();
        const fp = autoSaveFingerprint(nextMap);
        return Boolean(fp) && fp !== lastMapAutoSaveFingerprintRef.current;
      },
      getPayload: () => {
        const cat = useUiStore.getState().category;
        const nextMap = assembleMap();
        return {
          url: `/api/v1/studio/${cat}/field-studio-map`,
          method: 'PUT' as const,
          body: nextMap,
        };
      },
      markFlushed: () => {
        const nextMap = assembleMap();
        lastMapAutoSaveFingerprintRef.current = autoSaveFingerprint(nextMap);
      },
    });
  }, [autoSaveMapEnabled, assembleMap]);

  useEffect(
    () => () => {
      if (isDomainFlushedByUnload('studioMap')) return;
      const nextMap = assembleMap();
      const nextFingerprint = autoSaveFingerprint(nextMap);
      if (
        !shouldFlushStudioMapOnUnmount({
          autoSaveMapEnabled,
          mapHydrated: mapHydrated.current,
          saving,
          nextFingerprint,
          lastSavedFingerprint: lastMapAutoSaveFingerprintRef.current,
        })
      ) return;
      onSaveMap(nextMap);
      lastMapAutoSaveFingerprintRef.current = nextFingerprint;
      markDomainFlushedByUnmount('studioMap');
    },
    [
      autoSaveMapEnabled,
      saving,
      tooltipPath,
      compSources,
      dataLists,
      assembleMap,
      onSaveMap,
    ],
  );

  // ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Component source handlers ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬
  function addComponentSource() {
    setCompSources((prev) => [...prev, emptyComponentSource()]);
  }

  function removeComponentSource(idx: number) {
    setCompSources((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateComponentSource(
    idx: number,
    updates: Partial<ComponentSource>,
  ) {
    setCompSources((prev) =>
      prev.map((src, i) => (i === idx ? { ...src, ...updates } : src)),
    );
  }

  // ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Data list handlers ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬
  function addDataList() {
    setDataLists((prev) => [
      ...prev,
      {
        field: "",
        normalize: "lower_trim",
        delimiter: "",
        manual_values: [],
        priority: { ...DEFAULT_PRIORITY_PROFILE },
        ai_assist: normalizeAiAssistConfig(undefined),
      },
    ]);
  }

  function removeDataList(idx: number) {
    setDataLists((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateDataList(idx: number, updates: Partial<DataListEntry>) {
    setDataLists((prev) =>
      prev.map((dl, i) => (i === idx ? { ...dl, ...updates } : dl)),
    );
  }

  // Detect duplicate field names in data lists
  const duplicateDataListFields = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const dl of dataLists) {
      if (dl.field) counts[dl.field] = (counts[dl.field] || 0) + 1;
    }
    return new Set(Object.keys(counts).filter((k) => counts[k] > 1));
  }, [dataLists]);

  return (
    <div className="space-y-6">
      {/* -- Header: description left, save right -- */}
      <div className="flex items-center gap-3">
        <p className="text-xs sf-text-muted leading-relaxed max-w-[50%]">
          Configure how the compiler reads your Field Studio mapping. Define
          component types and their property slots, then set up enum / data
          lists with normalization rules.
        </p>
        <div className="flex-1" />
        <button
          onClick={handleSave}
          disabled={saving || autoSaveMapEnabled}
          className={`${autoSaveMapEnabled ? btnSecondary : btnPrimary} relative h-11 min-h-11 text-sm rounded inline-flex items-center justify-center overflow-visible whitespace-nowrap ${actionBtnWidth}`}
        >
          <span className="w-full text-center font-medium truncate">
            Save Mapping
          </span>
          <span className="absolute top-0 right-0 -ml-1 translate-x-1/2 -translate-y-1/2">
            <Tip
              text={
                "Save Mapping (manual)\n\nWrites your Field Studio map configuration to disk.\nThis is the authoritative contract input for compile."
              }
            />
          </span>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <span
                tabIndex={0}
                aria-label={`Map save status: ${saving ? "Saving\u2026" : saveSuccess ? "Saved" : "Ready"}`}
                className={`absolute inline-block h-2.5 w-2.5 rounded-full ${saving ? "sf-dot-pending animate-pulse" : saveSuccess ? "sf-success-bg-500" : "sf-dot-subtle sf-dk-surface-600"} border border-white/90 shadow-sm`}
                style={{ right: "3px", bottom: "3px" }}
              />
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                className="z-50 max-w-xs px-3 py-2 text-xs leading-snug whitespace-pre-line sf-text-primary bg-white border sf-border-default rounded shadow-lg sf-dk-fg-100 sf-dk-surface-900 dark:sf-border-default"
                sideOffset={5}
              >
                {saving ? "Saving\u2026" : saveSuccess ? "Saved" : "Ready"}
                <Tooltip.Arrow className="sf-tooltip-arrow" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </button>

        <button
          onClick={() => {
            if (autoSaveMapLocked) return;
            setAutoSaveMapEnabled(!autoSaveMapEnabled);
          }}
          disabled={autoSaveMapLocked}
          className={`relative h-11 min-h-11 text-sm rounded inline-flex items-center justify-center overflow-visible whitespace-nowrap ${actionBtnWidth} transition-colors ${
            autoSaveMapEnabled ? "sf-primary-button" : "sf-action-button"
          } ${autoSaveMapLocked ? "opacity-80 cursor-not-allowed" : ""}`}
        >
          <span className="w-full text-center font-medium truncate">
            {autoSaveMapLocked
              ? "Auto-Save On (Locked)"
              : autoSaveMapEnabled
                ? "Auto-Save On"
                : "Auto-Save Off"}
          </span>
          <span className="absolute top-0 right-0 -ml-1 translate-x-1/2 -translate-y-1/2">
            <Tip
              text={
                autoSaveMapLocked
                  ? "Locked"
                  : `Auto-Save Mapping\n\nWhen enabled, mapping changes are automatically\nsaved after ${studioMapAutoSaveDelaySeconds}s of inactivity.\n\nWhat gets saved:\n\u2022 Tooltip source configuration\n\u2022 Component source mappings\n\u2022 Enum / data list definitions\n\nDefault: On. Setting persists across sessions.`
              }
            />
          </span>
        </button>
      </div>
      {saveErrorMessage ? (
        <p className="text-xs sf-status-text-danger">{saveErrorMessage}</p>
      ) : null}

      {/* Tooltip Bank */}
      <div className={`${sectionCls} relative`}>
        <button
          type="button"
          aria-expanded={showTooltipSource}
          onClick={() => toggleTooltipSource()}
          className="w-full flex items-center justify-between gap-2 text-left text-sm font-semibold sf-text-muted sf-dk-fg-100 hover:sf-text-primary sf-dk-hover-fg-white"
        >
          <span className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 border sf-border-soft rounded text-xs font-medium sf-text-muted">
              {showTooltipSource ? "-" : "+"}
            </span>
            <span>Tooltips Source</span>
          </span>
        </button>
        <span className="absolute top-0 right-0 -ml-1 translate-x-1/2 -translate-y-1/2">
          <Tip text={STUDIO_TIPS.tooltip_section_tooltip_bank} />
        </span>
        {showTooltipSource ? (
          <div className="mt-3">
            <div className="grid grid-cols-4 gap-3">
              <div className="col-span-2">
                <div className={labelCls}>
                  Tooltip Bank File (JS/JSON/MD)
                  <Tip
                    style={{ position: "relative", left: "-3px", top: "-4px" }}
                    text={STUDIO_TIPS.tooltip_bank_file}
                  />
                </div>
                <input
                  className={`${inputCls} w-full font-mono text-xs`}
                  value={tooltipPath}
                  onChange={(e) => setTooltipPath(e.target.value)}
                  placeholder="(auto-discover hbs_tooltips*)"
                />
              </div>
              <div>
                <div className={labelCls}>Bank Keys</div>
                <span className="text-lg font-semibold">{tooltipCount}</span>
              </div>
              <div>
                <div className={labelCls}>Coverage</div>
                <span className="text-lg font-semibold">
                  {tooltipCoverage}%
                </span>
              </div>
            </div>
            {tooltipFiles.length > 0 ? (
              <p className="text-xs sf-text-subtle mt-2">
                Files: {tooltipFiles.join(", ")}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Component Source Mapping */}
      <div className={`${sectionCls} relative`}>
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            aria-expanded={showComponentSourceMapping}
            onClick={() => toggleComponentSourceMapping()}
            className="flex-1 flex items-center justify-between gap-2 text-left text-sm font-semibold sf-text-muted sf-dk-fg-100 hover:sf-text-primary sf-dk-hover-fg-white"
          >
            <span className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 border sf-border-soft rounded text-xs font-medium sf-text-muted">
                {showComponentSourceMapping ? "-" : "+"}
              </span>
              <span>Component Source Mapping</span>
            </span>
          </button>
          <span className="absolute top-0 right-0 -ml-1 translate-x-1/2 -translate-y-1/2">
            <Tip text={STUDIO_TIPS.tooltip_section_component_sources} />
          </span>
          <div className="pt-0.5">
            <p className="text-xs sf-text-muted mt-1">
              Required: Primary Identifier role. Optional: Maker, Name Variants,
              Reference URLs, Attributes.
            </p>
          </div>
        </div>
        {showComponentSourceMapping ? (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-3">
              <div></div>
              <div className="flex gap-2">
                <button onClick={addComponentSource} className={btnSecondary}>
                  + Add Source
                </button>
              </div>
            </div>
            {compSources.length > 0 ? (
              <div className="space-y-6">
                {compSources.map((src, idx) => (
                  <EditableComponentSource
                    key={idx}
                    index={idx}
                    source={src}
                    onUpdate={(updates) => updateComponentSource(idx, updates)}
                    onRemove={() => removeComponentSource(idx)}
                    rules={rules}
                    fieldOrder={fieldOrder}
                    knownValues={knownValues}
                  />
                ))}
              </div>
            ) : (
              <div className="text-sm sf-text-subtle text-center py-4">
                No component sources configured. Click "Add Source" to add one.
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Enum Value Lists */}
      <div className={`${sectionCls} relative`}>
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            aria-expanded={showEnumSection}
            onClick={() => toggleEnumSection()}
            className="flex-1 flex items-center justify-between gap-2 text-left text-sm font-semibold sf-text-muted sf-dk-fg-100 hover:sf-text-primary sf-dk-hover-fg-white"
          >
            <span className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 border sf-border-soft rounded text-xs font-medium sf-text-muted">
                {showEnumSection ? "-" : "+"}
              </span>
              <span>Enum</span>
            </span>
          </button>
          <span className="absolute top-0 right-0 -ml-1 translate-x-1/2 -translate-y-1/2">
            <Tip text={STUDIO_TIPS.tooltip_section_enums} />
          </span>
          <div className="pt-0.5">
            <p className="text-xs sf-text-muted mt-1">
              Define allowed values for enum fields.
            </p>
          </div>
        </div>
        {showEnumSection ? (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-3">
              <div></div>
              <button onClick={addDataList} className={btnSecondary}>
                + Add Enum
              </button>
            </div>
            {dataLists.length > 0 ? (
              <div className="space-y-3">
                {dataLists.map((dl, idx) => {
                  const isLocked = egLockedKeys.includes(dl.field);
                  return (
                    <div key={idx} className={isLocked ? 'pointer-events-none opacity-60' : ''}>
                      <EditableDataList
                        entry={dl}
                        index={idx}
                        isDuplicate={duplicateDataListFields.has(dl.field)}
                        onUpdate={isLocked ? () => {} : (updates) => updateDataList(idx, updates)}
                        onRemove={isLocked ? () => {} : () => removeDataList(idx)}
                      />
                      {isLocked && (
                        <div className="flex items-center gap-1.5 mt-1 px-2 text-[10px] sf-text-subtle">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                          EG-managed &middot; Linked to color registry
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm sf-text-subtle text-center py-4">
                No enums configured. Click "+ Add Enum" to define enum value
                lists.
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
// ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Key Navigator ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬
// Helper to safely get nested values
// Collapsible section component
