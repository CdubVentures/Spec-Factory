import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { usePersistedToggle } from "../../../stores/collapseStore.ts";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useUiCategoryStore } from "../../../stores/uiCategoryStore.ts";
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
  createEmptyComponentSource as emptyComponentSource,
} from "../state/studioComponentSources.ts";
import {
  shouldFlushStudioMapPayloadOnUnmount,
  shouldPersistStudioMapPayload,
} from "../state/studioPagePersistence.ts";
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
} from "../../../types/studio.ts";
import { EditableDataList } from "./EditableDataList.tsx";
import { EditableComponentSource } from "./EditableComponentSource.tsx";
import { useStudioFieldRulesState, useStudioFieldRulesActions } from "../state/studioFieldRulesController.ts";
import {
  buildStudioEnumDataListSeedVersion,
  deriveStudioEnumDataLists,
  type StudioEnumDataListEntry,
} from "../state/studioEnumDataLists.ts";

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
  const { updateField } = useStudioFieldRulesActions();
  const [tooltipPath, setTooltipPath] = useState("");
  const [compSources, setCompSources] = useState<ComponentSource[]>([]);
  const [dataLists, setDataLists] = useState<StudioEnumDataListEntry[]>([]);
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
  const studioMapAutoSaveLabel = SETTINGS_AUTOSAVE_DEBOUNCE_MS.studioMap > 0
    ? `saved after ${(SETTINGS_AUTOSAVE_DEBOUNCE_MS.studioMap / 1000).toFixed(1)}s of inactivity`
    : 'saved instantly on change';

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
    const enumDataListSeedVersion = buildStudioEnumDataListSeedVersion({
      rawEnumLists,
      rules,
      egLockedKeys,
      knownValues,
    });
    return [
      String(wbMap.version || ""),
      String(wbMap.version_snapshot || ""),
      String(wbMap.tooltip_source?.path || ""),
      String(componentSourceCount),
      enumDataListSeedVersion,
    ].join("|");
  }, [wbMap, rules, egLockedKeys, knownValues]);

  useEffect(() => {
    if (seededVersion === mapSeedVersion) return;
    setTooltipPath(wbMap.tooltip_source?.path || "");
    const sources = wbMap.component_sources || [];
    const normalizedCompSources = (Array.isArray(sources) ? sources : []).map(
      (src) => (src || {}) as ComponentSource,
    );
    setCompSources(normalizedCompSources);
    const rawEnumLists = (
      Array.isArray(wbMap.data_lists) && wbMap.data_lists.length > 0
        ? wbMap.data_lists
        : Array.isArray(wbMap.enum_lists)
          ? wbMap.enum_lists
          : []
    ) as EnumEntry[];
    const seededLists = deriveStudioEnumDataLists({
      rawEnumLists,
      rules,
      egLockedKeys,
      knownValues,
    });
    setDataLists(seededLists);
    // WHY: assembleMap converts data_lists into the derived enum_lists on
    // save. The seeded fingerprint must use the same shape so the auto-save
    // dedup gate sees a match and doesn't fire a spurious save after every
    // rehydration.
    const { data_lists: _omitSeedDl, ...cleanSeedBase } = wbMap as StudioConfig & { data_lists?: unknown };
    const seededPayload: StudioConfig = {
      ...cleanSeedBase,
      tooltip_source: {
        path: wbMap.tooltip_source?.path || "",
      },
      component_sources: normalizedCompSources,
      enum_lists: seededLists.map((dl) => ({
        field: dl.field,
        normalize: dl.normalize,
        values: dl.manual_values,
      })),
    };
    lastMapAutoSaveFingerprintRef.current = shouldPersistStudioMapPayload({
      payload: seededPayload,
      force: false,
    })
      ? autoSaveFingerprint(seededPayload)
      : '';
    setSeededVersion(mapSeedVersion);
  }, [wbMap, mapSeedVersion, seededVersion, rules]);

  const assembleMap = useCallback((): StudioConfig => {
    // WHY: assembleMap converts the UI's dataLists state into the derived
    // enum_lists array. data_lists is omitted because the enum_lists output
    // below already carries the merged result. On reload, seeding re-derives
    // from whichever source is present.
    const { data_lists: _omitDl, ...cleanMap } = wbMap as StudioConfig & { data_lists?: unknown };
    return {
      ...cleanMap,
      tooltip_source: {
        path: tooltipPath,
      },
      component_sources: compSources,
      enum_lists: dataLists.map((dl) => ({
        field: dl.field,
        normalize: dl.normalize,
        values: dl.manual_values,
      })),
    };
  }, [wbMap, tooltipPath, compSources, dataLists]);

  function handleSave() {
    const nextMap = assembleMap();
    if (!shouldPersistStudioMapPayload({ payload: nextMap, force: false })) return;
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
    if (!shouldPersistStudioMapPayload({ payload: nextMap, force: false })) return;
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
        if (!shouldPersistStudioMapPayload({ payload: nextMap, force: false })) return false;
        const fp = autoSaveFingerprint(nextMap);
        return Boolean(fp) && fp !== lastMapAutoSaveFingerprintRef.current;
      },
      getPayload: () => {
        const cat = useUiCategoryStore.getState().category;
        const nextMap = assembleMap();
        return {
          url: `/api/v1/studio/${cat}/field-studio-map`,
          method: 'PUT' as const,
          body: nextMap,
        };
      },
      markFlushed: () => {
        const nextMap = assembleMap();
        lastMapAutoSaveFingerprintRef.current = shouldPersistStudioMapPayload({
          payload: nextMap,
          force: false,
        })
          ? autoSaveFingerprint(nextMap)
          : '';
      },
    });
  }, [autoSaveMapEnabled, assembleMap]);

  useEffect(
    () => () => {
      if (isDomainFlushedByUnload('studioMap')) return;
      const nextMap = assembleMap();
      if (!shouldFlushStudioMapPayloadOnUnmount(nextMap)) return;
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
  function updateDataList(idx: number, updates: Partial<StudioEnumDataListEntry>) {
    setDataLists((prev) =>
      prev.map((dl, i) => (i === idx ? { ...dl, ...updates } : dl)),
    );
  }

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
                className={`absolute inline-block h-2.5 w-2.5 rounded-full ${saving ? "sf-dot-pending animate-pulse" : saveSuccess ? "sf-success-bg-500" : "sf-dot-subtle sf-dk-surface-600"} border border-sf-surface-elevated shadow-sm`}
                style={{ right: "3px", bottom: "3px" }}
              />
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                className="sf-tooltip-content z-50 max-w-xs px-3 py-2 text-xs leading-snug whitespace-pre-line rounded shadow-lg"
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
                  : `Auto-Save Mapping\n\nWhen enabled, mapping changes are automatically\n${studioMapAutoSaveLabel}.\n\nWhat gets saved:\n\u2022 Tooltip source configuration\n\u2022 Component source mappings\n\u2022 Enum / data list definitions\n\nDefault: On. Setting persists across sessions.`
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
              Declare component identity keys and their properties.
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
                {compSources.map((src, idx) => {
                  const lockedComponentKeys = compSources
                    .map((entry) => entry.component_type || "")
                    .filter((key, entryIdx) => key && entryIdx !== idx);
                  return (
                    <EditableComponentSource
                      key={idx}
                      index={idx}
                      source={src}
                      onUpdate={(updates) => updateComponentSource(idx, updates)}
                      onRemove={() => removeComponentSource(idx)}
                      rules={rules}
                      fieldOrder={fieldOrder}
                      knownValues={knownValues}
                      lockedComponentKeys={lockedComponentKeys}
                      onComponentTypeChange={(oldType, newType) => {
                        // Phase 3 auto-link: clear OLD key's enum.source, set NEW
                        // key's to component_db.<new>. The fieldCascadeRegistry
                        // enum.source cascade coerces contract.type/shape and
                        // policy on the new key automatically.
                        if (oldType) updateField(oldType, "enum.source", "");
                        if (newType) updateField(newType, "enum.source", `component_db.${newType}`);
                      }}
                    />
                  );
                })}
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
            {dataLists.length > 0 ? (
              <div className="space-y-3">
                {dataLists.map((dl, idx) => {
                  const isLocked = egLockedKeys.includes(dl.field);
                  return (
                    <div key={idx} className={isLocked ? 'pointer-events-none opacity-60' : ''}>
                      <EditableDataList
                        entry={dl}
                        index={idx}
                        isDuplicate={false}
                        onUpdate={isLocked ? () => {} : (updates) => updateDataList(idx, updates)}
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
                No enums configured.
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
