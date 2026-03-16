import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { usePersistedToggle } from "../../../stores/collapseStore";
import { usePersistedTab } from "../../../stores/tabStore";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Tooltip from "@radix-ui/react-tooltip";
import { api } from "../../../api/client";
import { useUiStore } from "../../../stores/uiStore";
import { useRuntimeStore } from "../../runtime-ops/state/runtimeStore";
import { JsonViewer } from "../../../shared/ui/data-display/JsonViewer";
import { Spinner } from "../../../shared/ui/feedback/Spinner";
import { resolveStudioSaveStatus } from "../../../shared/ui/feedback/settingsStatus";
import { Tip } from "../../../shared/ui/feedback/Tip";
import { ComboSelect } from "../../../shared/ui/forms/ComboSelect";
import { TagPicker } from "../../../shared/ui/forms/TagPicker";
import { TierPicker } from "../../../shared/ui/forms/TierPicker";
import { EnumConfigurator } from "../../../shared/ui/forms/EnumConfigurator";
import { FieldRulesWorkbench } from "../workbench/FieldRulesWorkbench";
import { SystemBadges } from "../workbench/SystemBadges";
import type { DownstreamSystem } from "../workbench/systemMapping";
import {
  useStudioFieldRulesActions,
  useStudioFieldRulesState,
} from "../state/studioFieldRulesController";
import {
  decideStudioAuthorityAction,
  shouldOpenStudioAuthorityConflict,
} from "../state/authoritySync.js";
import {
  validateNewKeyTs,
  rewriteConstraintsTs,
  constraintRefsKey,
  reorderFieldOrder,
  deriveGroupsTs,
  validateNewGroupTs,
  validateBulkRows,
  type BulkKeyRow,
} from "../state/keyUtils";
import DraggableKeyList from "./DraggableKeyList";
import { Section } from "./Section";
import { StaticBadges } from "./StaticBadges";
import { invalidateFieldRulesQueries } from "../state/invalidateFieldRulesQueries";
import { useStudioPersistenceAuthority } from "../state/studioPersistenceAuthority";
import { assertFieldStudioMapValidationOrThrow } from "../state/mapValidationPreflight.js";
import { useAuthoritySnapshot } from "../../../hooks/useAuthoritySnapshot.js";
import { buildAuthorityVersionToken } from "../../../hooks/authoritySnapshotHelpers.js";
import BulkPasteGrid, {
  type BulkGridRow,
} from "../../../components/common/BulkPasteGrid";
import { autoSaveFingerprint } from "../../../stores/autoSaveFingerprint";
import {
  SETTINGS_AUTOSAVE_DEBOUNCE_MS,
  SETTINGS_AUTOSAVE_STATUS_MS,
} from "../../../stores/settingsManifest";
import {
  clampNumber,
  parseBoundedFloatInput,
  parseBoundedIntInput,
  parseIntegerInput,
  parseOptionalPositiveIntInput,
} from "../state/numericInputHelpers";
import {
  arrN,
  boolN,
  getN,
  numN,
  strN,
} from "../state/nestedValueHelpers";
import {
  STUDIO_COMPONENT_MATCH_DEFAULTS,
  STUDIO_NUMERIC_KNOB_BOUNDS,
} from "../state/studioNumericKnobBounds";
import {
  buildNextConsumerOverrides,
  shouldFlushStudioDocsOnUnmount,
  shouldFlushStudioMapOnUnmount,
  isStudioContractFieldDeferredLocked,
} from "../state/studioBehaviorContracts";
import {
  DEFAULT_PRIORITY_PROFILE,
  deriveAiCallsFromEffort,
  deriveAiModeFromPriority,
  deriveComponentSourcePriority,
  deriveListPriority,
  hasExplicitPriority,
  normalizeAiAssistConfig,
  normalizePriorityProfile,
} from "../state/studioPriority";
import {
  VARIANCE_POLICIES,
  createEmptyComponentSource as emptyComponentSource,
  migrateProperty,
  type PropertyMapping,
} from "../state/studioComponentSources";
import {
  deriveStudioCompileStatus,
  deriveStudioEnumListsWithValues,
  deriveStudioPageProcessState,
  deriveStudioPageRootDerivedState,
  deriveStudioPageShellState,
  deriveStudioPageViewState,
} from "../state/studioPageDerivedState";
import { displayLabel } from "../state/studioDisplayLabel";
import {
  buildStudioPersistMap as buildStudioPersistMapPayload,
  shouldPersistStudioDocsAttempt,
} from "../state/studioPagePersistence";
import {
  areTypesCompatible,
  CONSTRAINT_OPS,
  deriveTypeGroup,
  groupRangeConstraints,
  TYPE_GROUP_OPS,
  type FieldTypeGroup,
} from "../state/studioConstraintGroups";
import { CompileReportsTab } from "../tabs/CompileReportsTab";
import {
  selectCls,
  inputCls,
  labelCls,
  UNITS,
  UNKNOWN_TOKENS,
  GROUPS,
  COMPONENT_TYPES,
  PREFIXES,
  SUFFIXES,
  DOMAIN_HINT_SUGGESTIONS,
  CONTENT_TYPE_SUGGESTIONS,
  UNIT_ACCEPTS_SUGGESTIONS,
  STUDIO_TIPS,
  NORMALIZE_MODES,
} from "./studioConstants";
import { STUDIO_TAB_IDS, StudioPageShell, type StudioTabId } from "./StudioPageShell";
import type { StudioPageActivePanelKeyProps as KeyNavigatorTabProps } from "./studioPagePanelContracts";
import type {
  FieldRule,
  StudioPayload,
  FieldStudioMapResponse,
  StudioConfig,
  TooltipBankResponse,
  ArtifactEntry,
  ComponentSource,
  ComponentSourceProperty,
  KnownValuesResponse,
  EnumEntry,
  ComponentDbResponse,
  PriorityProfile,
  AiAssistConfig,
} from "../../../types/studio";
import type { ProcessStatus } from "../../../types/events";

interface DataListEntry {
  field: string;
  normalize: string;
  delimiter: string;
  manual_values: string[];
  priority?: PriorityProfile;
  ai_assist?: AiAssistConfig;
}

interface ComponentSourceRoles {
  maker?: string;
  aliases?: string[];
  links?: string[];
  properties?: Array<Record<string, unknown>>;
  [k: string]: unknown;
}

interface FieldStudioMapValidationResponse {
  valid?: boolean;
  ok?: boolean;
  errors?: string[];
  warnings?: string[];
  normalized?: StudioConfig | null;
}

// ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Shared styles ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬
const btnPrimary =
  "px-4 py-2 text-sm sf-primary-button transition-colors disabled:opacity-50";
const btnAction =
  "px-3 py-1.5 text-sm sf-icon-button transition-colors disabled:opacity-50";
const btnSecondary =
  "px-3 py-1.5 text-sm sf-icon-button transition-colors disabled:opacity-50";
const btnDanger =
  "px-3 py-1.5 text-sm sf-danger-button transition-colors disabled:opacity-50";
const sectionCls =
  "bg-white sf-dk-surface-800 rounded border sf-border-default p-4";
const actionBtnWidth = "w-56";

// ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Field Rule Table Columns ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬
// ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Role definitions ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬
const ROLE_DEFS = [
  { id: "aliases", label: "Name Variants (Aliases)" },
  { id: "maker", label: "Maker (Brand)" },
  { id: "links", label: "Reference URLs (Links)" },
  { id: "properties", label: "Attributes (Properties)" },
] as const;

type RoleId = (typeof ROLE_DEFS)[number]["id"];

// ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Property row type ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬
// Legacy property key ÃƒÂ¢Ã¢â‚¬Â ' product field key mapping (used during migration)


// ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Tabs ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬


// ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬

function KeyConstraintEditor({
  currentKey,
  constraints,
  onChange,
  fieldOrder,
  rules,
}: {
  currentKey: string;
  constraints: string[];
  onChange: (next: string[]) => void;
  fieldOrder: string[];
  rules: Record<string, Record<string, unknown>>;
}) {
  const [adding, setAdding] = useState(false);
  const [op, setOp] = useState<string>("<=");
  const [rightMode, setRightMode] = useState<"field" | "value" | "range">(
    "field",
  );
  const [rightField, setRightField] = useState("");
  const [rightLiteral, setRightLiteral] = useState("");
  const [rangeMin, setRangeMin] = useState("");
  const [rangeMax, setRangeMax] = useState("");
  const [rangeLowerOp, setRangeLowerOp] = useState<string>("<=");
  const [rangeUpperOp, setRangeUpperOp] = useState<string>("<=");

  const currentRule = rules[currentKey] || {};
  const currentTypeGroup = deriveTypeGroup(currentRule);
  const allowedOps = TYPE_GROUP_OPS[currentTypeGroup];
  const supportsRange =
    currentTypeGroup === "numeric" || currentTypeGroup === "date";

  function resetState() {
    setOp("<=");
    setRightField("");
    setRightLiteral("");
    setRightMode("field");
    setRangeMin("");
    setRangeMax("");
    setRangeLowerOp("<=");
    setRangeUpperOp("<=");
    setAdding(false);
  }

  function addConstraint() {
    if (rightMode === "range") {
      const exprs: string[] = [];
      const min = rangeMin.trim();
      const max = rangeMax.trim();
      if (min) {
        const lowerOp = rangeLowerOp === "<=" ? ">=" : ">";
        exprs.push(`${currentKey} ${lowerOp} ${min}`);
      }
      if (max) {
        exprs.push(`${currentKey} ${rangeUpperOp} ${max}`);
      }
      if (exprs.length === 0) return;
      onChange([...constraints, ...exprs]);
      resetState();
      return;
    }
    const rightValue = rightMode === "field" ? rightField : rightLiteral.trim();
    if (!rightValue) return;
    const expr = `${currentKey} ${op} ${rightValue}`;
    onChange([...constraints, expr]);
    resetState();
  }

  function removeConstraint(idx: number) {
    onChange(constraints.filter((_, i) => i !== idx));
  }

  function removeRangePair(lowerIdx: number, upperIdx: number) {
    onChange(constraints.filter((_, i) => i !== lowerIdx && i !== upperIdx));
  }

  const { compatible, incompatible } = useMemo(() => {
    const comp: Array<{ value: string; label: string }> = [];
    const incompat: Array<{ value: string; label: string }> = [];
    for (const key of fieldOrder) {
      if (key.startsWith("__grp::") || key === currentKey) continue;
      const rule = rules[key] || {};
      const targetGroup = deriveTypeGroup(rule);
      const entry = { value: key, label: key };
      if (
        op === "requires" ||
        areTypesCompatible(currentTypeGroup, targetGroup)
      ) {
        comp.push(entry);
      } else {
        incompat.push(entry);
      }
    }
    return { compatible: comp, incompatible: incompat };
  }, [fieldOrder, currentKey, rules, currentTypeGroup, op]);

  const { ranges, singles } = useMemo(
    () => groupRangeConstraints(constraints, currentKey),
    [constraints, currentKey],
  );

  const literalPlaceholder =
    currentTypeGroup === "numeric"
      ? "100"
      : currentTypeGroup === "date"
        ? "2024-01-15"
        : currentTypeGroup === "boolean"
          ? "yes"
          : "'wireless'";
  const rangePlaceholder = currentTypeGroup === "date" ? "2024-01-01" : "0";

  const isRequires = op === "requires";
  const canAddField = rightMode === "field" && rightField !== "";
  const canAddLiteral = rightMode === "value" && rightLiteral.trim() !== "";
  const canAddRange =
    rightMode === "range" && (rangeMin.trim() !== "" || rangeMax.trim() !== "");
  const canAdd = isRequires
    ? rightField !== ""
    : canAddField || canAddLiteral || canAddRange;

  const fieldBadgesFor = useCallback(
    (key: string): Array<{ text: string; cls: string }> => {
      const r = rules[key] || {};
      const badges: Array<{ text: string; cls: string }> = [];
      const tg = deriveTypeGroup(r);
      badges.push({
        text: tg,
        cls: "sf-bg-surface-soft-strong sf-dk-surface-700 sf-text-muted",
      });
      const contract = (r.contract || {}) as Record<string, unknown>;
      const unit = String(contract.unit || "").trim();
      if (unit)
        badges.push({
          text: unit,
          cls: "sf-chip-sky-strong",
        });
      const shape = String(contract.shape || "").trim();
      if (shape && shape !== "scalar")
        badges.push({
          text: shape,
          cls: "sf-chip-teal-strong",
        });
      return badges;
    },
    [rules],
  );

  const currentBadges = useMemo(
    () => fieldBadgesFor(currentKey),
    [fieldBadgesFor, currentKey],
  );
  const rightBadges = useMemo(
    () => (rightField ? fieldBadgesFor(rightField) : []),
    [fieldBadgesFor, rightField],
  );

  const pillCls =
    "inline-flex items-center gap-1 sf-chip-confirm px-1.5 py-0.5 rounded text-[10px]";
  const removeBtnCls = "sf-status-text-warning sf-status-warning-hover ml-0.5";
  const modeBtnBase = "px-1.5 py-0.5";
  const modeBtnActive =
    "sf-chip-info-active font-medium";
  const modeBtnInactive =
    "sf-text-muted sf-hover-bg-surface-soft-strong sf-dk-hover-surface-700";
  const badgeCls = "text-[9px] px-1 py-0 rounded";

  return (
    <div className="text-[11px]">
      <div className="flex items-center gap-2 flex-wrap">
        {ranges.map((rp) => (
          <span
            key={`rp-${rp.lowerIdx}-${rp.upperIdx}`}
            className={`${pillCls} sf-review-ai-pending-badge`}
          >
            {rp.display}
            <button
              onClick={() => removeRangePair(rp.lowerIdx, rp.upperIdx)}
              className="sf-run-ai-text sf-run-ai-text-hover ml-0.5"
              title="Remove range"
            >
              &#10005;
            </button>
          </span>
        ))}
        {singles.map((s) => (
          <span key={s.idx} className={pillCls}>
            {s.expr}
            <button
              onClick={() => removeConstraint(s.idx)}
              className={removeBtnCls}
              title="Remove constraint"
            >
              &#10005;
            </button>
          </span>
        ))}
        {!adding ? (
          <button
            onClick={() => setAdding(true)}
            className="text-[10px] sf-link-accent hover:opacity-80"
          >
            + Add constraint
          </button>
        ) : null}
      </div>
      {adding ? (
        <div className="mt-1.5 space-y-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono text-[10px] sf-text-muted sf-bg-surface-soft-strong sf-dk-surface-700 px-1.5 py-0.5 rounded">
              {currentKey}
            </span>
            {currentBadges.map((b, i) => (
              <span key={i} className={`${badgeCls} ${b.cls}`}>
                {b.text}
              </span>
            ))}
            {!isRequires ? (
              <span className="inline-flex rounded border sf-border-soft overflow-hidden text-[9px]">
                <button
                  onClick={() => setRightMode("field")}
                  className={`${modeBtnBase} ${rightMode === "field" ? modeBtnActive : modeBtnInactive}`}
                >
                  Field
                </button>
                <button
                  onClick={() => setRightMode("value")}
                  className={`${modeBtnBase} ${rightMode === "value" ? modeBtnActive : modeBtnInactive}`}
                >
                  Value
                </button>
                {supportsRange ? (
                  <button
                    onClick={() => setRightMode("range")}
                    className={`${modeBtnBase} ${rightMode === "range" ? modeBtnActive : modeBtnInactive}`}
                  >
                    Range
                  </button>
                ) : null}
              </span>
            ) : null}
          </div>
          {rightMode === "range" ? (
            <div className="flex items-center gap-1 flex-wrap">
              <input
                type="text"
                className={`${inputCls} text-[11px] py-0.5 w-20`}
                placeholder={rangePlaceholder}
                value={rangeMin}
                onChange={(e) => setRangeMin(e.target.value)}
              />
              <select
                className={`${selectCls} text-[11px] py-0.5 w-10`}
                value={rangeLowerOp}
                onChange={(e) => setRangeLowerOp(e.target.value)}
              >
                <option value="<=">{"\u2264"}</option>
                <option value="<">{"<"}</option>
              </select>
              <span className="font-mono text-[10px] sf-text-muted sf-bg-surface-soft-strong sf-dk-surface-700 px-1.5 py-0.5 rounded">
                {currentKey}
              </span>
              <select
                className={`${selectCls} text-[11px] py-0.5 w-10`}
                value={rangeUpperOp}
                onChange={(e) => setRangeUpperOp(e.target.value)}
              >
                <option value="<=">{"\u2264"}</option>
                <option value="<">{"<"}</option>
              </select>
              <input
                type="text"
                className={`${inputCls} text-[11px] py-0.5 w-20`}
                placeholder={
                  currentTypeGroup === "date" ? "2025-12-31" : "30000"
                }
                value={rangeMax}
                onChange={(e) => setRangeMax(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addConstraint();
                }}
              />
              <button
                onClick={addConstraint}
                disabled={!canAddRange}
                className="text-[10px] sf-status-text-success hover:opacity-80 disabled:opacity-40 font-medium"
              >
                Add
              </button>
              <button
                onClick={resetState}
                className="text-[10px] sf-text-subtle hover:sf-text-muted"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 flex-wrap">
              <select
                className={`${selectCls} text-[11px] py-0.5 w-[4.5rem]`}
                value={op}
                onChange={(e) => {
                  setOp(e.target.value);
                  if (e.target.value === "requires") setRightMode("field");
                }}
              >
                {CONSTRAINT_OPS.map((o) => (
                  <option key={o} value={o} disabled={!allowedOps.has(o)}>
                    {o}
                  </option>
                ))}
              </select>
              {isRequires || rightMode === "field" ? (
                <select
                  className={`${selectCls} text-[11px] py-0.5 min-w-0`}
                  value={rightField}
                  onChange={(e) => setRightField(e.target.value)}
                >
                  <option value="">Select field...</option>
                  {compatible.length > 0 ? (
                    <optgroup label="Compatible">
                      {compatible.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {incompatible.length > 0 ? (
                    <optgroup label="Incompatible type">
                      {incompatible.map((f) => (
                        <option key={f.value} value={f.value} disabled>
                          {f.label}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              ) : (
                <input
                  type="text"
                  className={`${inputCls} text-[11px] py-0.5 w-28`}
                  placeholder={literalPlaceholder}
                  value={rightLiteral}
                  onChange={(e) => setRightLiteral(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addConstraint();
                  }}
                />
              )}
              {rightBadges.length > 0
                ? rightBadges.map((b, i) => (
                    <span key={i} className={`${badgeCls} ${b.cls}`}>
                      {b.text}
                    </span>
                  ))
                : null}
              <button
                onClick={addConstraint}
                disabled={!canAdd}
                className="text-[10px] sf-status-text-success hover:opacity-80 disabled:opacity-40 font-medium"
              >
                Add
              </button>
              <button
                onClick={resetState}
                className="text-[10px] sf-text-subtle hover:sf-text-muted"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Editable Enum List ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬

export function KeyNavigatorTab({
  category,
  selectedKey,
  onSelectKey,
  onSave,
  saving,
  saveSuccess,
  knownValues,
  enumLists,
  componentDb,
  componentSources,
  autoSaveEnabled,
  setAutoSaveEnabled,
  autoSaveLocked,
  autoSaveLockReason,
  onRunEnumConsistency,
  enumConsistencyPending,
}: KeyNavigatorTabProps) {
  const { editedRules, editedFieldOrder } = useStudioFieldRulesState();
  const {
    updateField,
    addKey,
    removeKey,
    renameKey,
    bulkAddKeys,
    reorder,
    addGroup,
    removeGroup,
    renameGroup,
  } = useStudioFieldRulesActions();
  // Add key UI state
  const [showAddForm, setShowAddForm] = useState(false);
  const [addKeyValue, setAddKeyValue] = useState("");
  const [addKeyGroup, setAddKeyGroup] = useState("");

  // Rename UI state
  const [renamingKey, setRenamingKey] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  // Label edit state
  const [editingLabel, setEditingLabel] = useState(false);
  const [editLabelValue, setEditLabelValue] = useState("");

  // Delete confirmation state
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [enumConsistencyMessage, setEnumConsistencyMessage] = useState("");
  const [enumConsistencyError, setEnumConsistencyError] = useState("");

  // Group UI state
  const [selectedGroup, setSelectedGroup] = usePersistedTab<string>(
    `studio:keyNavigator:selectedGroup:${category}`,
    "",
  );
  const [showAddGroupForm, setShowAddGroupForm] = useState(false);
  const [addGroupValue, setAddGroupValue] = useState("");

  // Bulk paste modal state
  const [bulkOpen, , setBulkOpen] = usePersistedToggle(
    `studio:keyNavigator:bulkOpen:${category}`,
    false,
  );
  const [bulkGridRows, setBulkGridRows] = useState<BulkGridRow[]>([]);
  const [bulkGroup, setBulkGroup] = usePersistedTab<string>(
    `studio:keyNavigator:bulkGroup:${category}`,
    "",
  );
  const [showFullRuleJson, , setShowFullRuleJson] = usePersistedToggle(
    `studio:keyNavigator:section:fullRuleJson:${category}`,
    false,
  );

  useEffect(() => {
    setRenamingKey(false);
    setEditingLabel(false);
    setConfirmDelete(false);
  }, [selectedKey]);

  const activeFieldOrder = editedFieldOrder;
  const activeFieldKeys = useMemo(
    () => activeFieldOrder.filter((key) => !key.startsWith("__grp::")),
    [activeFieldOrder],
  );

  useEffect(() => {
    if (activeFieldKeys.length === 0) {
      if (selectedKey) onSelectKey("");
      return;
    }
    if (!selectedKey || !activeFieldKeys.includes(selectedKey)) {
      onSelectKey(activeFieldKeys[0]);
    }
  }, [selectedKey, activeFieldKeys, onSelectKey]);

  const groups = useMemo(() => {
    return deriveGroupsTs(activeFieldOrder, editedRules);
  }, [activeFieldOrder, editedRules]);

  useEffect(() => {
    if (!selectedGroup) return;
    const groupExists = groups.some(
      ([groupName]) => groupName === selectedGroup,
    );
    if (!groupExists) {
      setSelectedGroup("");
    }
  }, [selectedGroup, groups, setSelectedGroup]);

  const existingGroups = useMemo(() => {
    const gs = new Set<string>();
    for (const [g] of groups) gs.add(g);
    return Array.from(gs);
  }, [groups]);

  const existingLabels = useMemo(() => {
    return activeFieldKeys.map((key) => displayLabel(key, editedRules[key]));
  }, [activeFieldKeys, editedRules]);

  const bulkPreviewRows: BulkKeyRow[] = useMemo(() => {
    const filled = bulkGridRows.filter((r) => r.col1.trim() || r.col2.trim());
    if (filled.length === 0) return [];
    const lines = filled.map((r) =>
      r.col2.trim() ? `${r.col1}\t${r.col2}` : r.col1,
    );
    const existingKeys = activeFieldOrder.filter(
      (k) => !k.startsWith("__grp::"),
    );
    return validateBulkRows(lines, existingKeys, existingLabels);
  }, [bulkGridRows, activeFieldOrder, existingLabels]);

  const bulkCounts = useMemo(() => {
    const c = { ready: 0, existing: 0, duplicate: 0, invalid: 0 };
    for (const row of bulkPreviewRows) {
      if (row.status === "ready") c.ready++;
      else if (row.status === "duplicate_existing") c.existing++;
      else if (row.status === "duplicate_in_paste") c.duplicate++;
      else c.invalid++;
    }
    return c;
  }, [bulkPreviewRows]);

  const bulkReadyRows = useMemo(
    () => bulkPreviewRows.filter((r) => r.status === "ready"),
    [bulkPreviewRows],
  );

  const saveIfAutoSaveEnabled = useCallback(() => {
    if (!autoSaveEnabled) return;
    onSave();
  }, [autoSaveEnabled, onSave]);

  const handleReorder = useCallback(
    (activeItem: string, overItem: string) => {
      reorder(activeItem, overItem);
      saveIfAutoSaveEnabled();
    },
    [reorder, saveIfAutoSaveEnabled],
  );

  function handleSaveAll() {
    onSave();
  }

  function handleAddKey() {
    const key = addKeyValue.trim();
    const err = validateNewKeyTs(key, activeFieldOrder);
    if (err) return;
    const label = key
      .split("_")
      .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    addKey(
      key,
      {
        label,
        group: addKeyGroup || "ungrouped",
        ui: { label, group: addKeyGroup || "ungrouped" },
        constraints: [],
      },
      selectedKey || undefined,
    );
    setShowAddForm(false);
    setAddKeyValue("");
    setAddKeyGroup("");
    setSelectedGroup("");
    onSelectKey(key);
    saveIfAutoSaveEnabled();
  }

  function handleDeleteKey() {
    if (!selectedKey) return;
    const deletedKey = selectedKey;
    removeKey(deletedKey);
    setConfirmDelete(false);
    const nextOrder = activeFieldOrder.filter((k) => k !== deletedKey);
    const idx = activeFieldOrder.indexOf(deletedKey);
    const nextKey = nextOrder[Math.min(idx, nextOrder.length - 1)] || "";
    onSelectKey(nextKey);
    saveIfAutoSaveEnabled();
  }

  function handleRenameKey() {
    const newKey = renameValue.trim();
    if (!selectedKey || !newKey || newKey === selectedKey) {
      setRenamingKey(false);
      return;
    }
    const err = validateNewKeyTs(
      newKey,
      activeFieldOrder.filter((k) => k !== selectedKey),
    );
    if (err) {
      return;
    }
    renameKey(selectedKey, newKey, rewriteConstraintsTs, constraintRefsKey);
    setRenamingKey(false);
    onSelectKey(newKey);
    saveIfAutoSaveEnabled();
  }

  function handleAddGroup() {
    const name = addGroupValue.trim();
    const err = validateNewGroupTs(name, existingGroups);
    if (err) return;
    addGroup(name);
    setShowAddGroupForm(false);
    setAddGroupValue("");
    saveIfAutoSaveEnabled();
  }

  function handleBulkImport() {
    if (bulkReadyRows.length === 0) return;
    const group = bulkGroup || "ungrouped";
    bulkAddKeys(
      bulkReadyRows.map((row) => ({
        key: row.key,
        rule: {
          label: row.label,
          group,
          ui: { label: row.label, group },
          constraints: [],
        },
      })),
    );
    saveIfAutoSaveEnabled();
    setBulkOpen(false);
    setBulkGridRows([]);
    setBulkGroup("");
  }

  function handleDeleteGroup(group: string) {
    if (
      !window.confirm(
        `Delete group "${group}"? Fields in this group will become ungrouped.`,
      )
    )
      return;
    removeGroup(group);
    setSelectedGroup("");
    saveIfAutoSaveEnabled();
  }

  function handleRenameGroup(oldName: string, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    const otherGroups = existingGroups.filter(
      (g) => g.toLowerCase() !== oldName.toLowerCase(),
    );
    if (validateNewGroupTs(trimmed, otherGroups)) return;
    renameGroup(oldName, trimmed);
    setSelectedGroup(trimmed);
    saveIfAutoSaveEnabled();
  }

  function handleSelectGroup(group: string) {
    setSelectedGroup(selectedGroup === group ? "" : group);
    onSelectKey("");
  }

  function handleSelectKey(key: string) {
    setSelectedGroup("");
    onSelectKey(key);
  }

  const currentRule = selectedKey ? editedRules[selectedKey] || null : null;
  const currentContractType = currentRule
    ? strN(currentRule, "contract.type", "string")
    : "string";
  const currentContractShape = currentRule
    ? strN(currentRule, "contract.shape", "scalar")
    : "scalar";
  const isNumericContract =
    currentContractType === "number" || currentContractType === "integer";
  const isListContract = currentContractShape === "list";

  function parseContractRangeValue(value: string): number | undefined {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (currentContractType === "integer") {
      return parseIntegerInput(trimmed) ?? undefined;
    }
    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  function parseListRuleCount(value: string): number | undefined {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = parseIntegerInput(trimmed);
    if (parsed === null) return undefined;
    return Math.max(0, parsed);
  }

  const handleConsumerToggle = useCallback(
    (fieldPath: string, system: DownstreamSystem, enabled: boolean) => {
      if (!selectedKey || !currentRule) return;
      const cur = (currentRule.consumers || {}) as Record<
        string,
        Record<string, boolean>
      >;
      updateField(
        selectedKey,
        "consumers",
        buildNextConsumerOverrides(cur, fieldPath, system, enabled),
      );
      saveIfAutoSaveEnabled();
    },
    [selectedKey, currentRule, updateField, saveIfAutoSaveEnabled],
  );

  const B = useCallback(
    ({ p }: { p: string }) =>
      currentRule ? (
        <SystemBadges
          fieldPath={p}
          rule={currentRule}
          onToggle={handleConsumerToggle}
        />
      ) : null,
    [currentRule, handleConsumerToggle],
  );

  return (
    <>
      <div className="flex gap-4" style={{ minHeight: "calc(100vh - 350px)" }}>
        {/* Key list */}
        <div className="w-56 flex-shrink-0 border-r sf-border-default pr-3 overflow-y-auto max-h-[calc(100vh-350px)]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs sf-text-muted">Click a key to edit</p>
            <span className="text-xs sf-text-subtle">
              {activeFieldOrder.filter((k) => !k.startsWith("__grp::")).length}{" "}
              keys
            </span>
          </div>

          {/* Add Key Button + Add Group Button + Bulk Paste */}
          {!showAddForm && !showAddGroupForm && (
            <div className="flex flex-col gap-1 mb-2">
              <div className="flex gap-1">
                <button
                  onClick={() => setShowAddForm(true)}
                  className={`${btnSecondary} flex-1 text-xs`}
                >
                  + Add Key
                </button>
                <button
                  onClick={() => setShowAddGroupForm(true)}
                  className={`${btnSecondary} flex-1 text-xs`}
                >
                  + Add Group
                </button>
              </div>
              <button
                onClick={() => setBulkOpen(true)}
                className={`${btnSecondary} w-full text-xs`}
              >
                Bulk Paste
              </button>
            </div>
          )}

          {/* Add Key Inline Form */}
          {showAddForm && (
            <div className="mb-3 p-2 rounded sf-callout sf-callout-info space-y-1.5">
              <input
                autoFocus
                className={`${inputCls} w-full text-xs`}
                placeholder="new_field_key"
                value={addKeyValue}
                onChange={(e) => setAddKeyValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddKey();
                  if (e.key === "Escape") {
                    setShowAddForm(false);
                    setAddKeyValue("");
                  }
                }}
              />
              {addKeyValue &&
                validateNewKeyTs(addKeyValue.trim(), activeFieldOrder) && (
                  <p className="text-[10px] sf-danger-text-soft">
                    {validateNewKeyTs(addKeyValue.trim(), activeFieldOrder)}
                  </p>
                )}
              <select
                className={`${selectCls} w-full text-xs`}
                value={addKeyGroup}
                onChange={(e) => setAddKeyGroup(e.target.value)}
              >
                <option value="">Group: ungrouped</option>
                {existingGroups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <div className="flex gap-1">
                <button
                  onClick={handleAddKey}
                  disabled={
                    !!validateNewKeyTs(addKeyValue.trim(), activeFieldOrder)
                  }
                  className={`${btnPrimary} text-xs py-1 flex-1`}
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setAddKeyValue("");
                  }}
                  className={`${btnSecondary} text-xs py-1 flex-1`}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Add Group Inline Form */}
          {showAddGroupForm && (
            <div className="mb-3 p-2 rounded sf-callout sf-callout-success space-y-1.5">
              <input
                autoFocus
                className={`${inputCls} w-full text-xs`}
                placeholder="Group name"
                value={addGroupValue}
                onChange={(e) => setAddGroupValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddGroup();
                  if (e.key === "Escape") {
                    setShowAddGroupForm(false);
                    setAddGroupValue("");
                  }
                }}
              />
              {addGroupValue &&
                validateNewGroupTs(addGroupValue.trim(), existingGroups) && (
                  <p className="text-[10px] sf-danger-text-soft">
                    {validateNewGroupTs(addGroupValue.trim(), existingGroups)}
                  </p>
                )}
              <div className="flex gap-1">
                <button
                  onClick={handleAddGroup}
                  disabled={
                    !!validateNewGroupTs(addGroupValue.trim(), existingGroups)
                  }
                  className={`${btnPrimary} text-xs py-1 flex-1`}
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setShowAddGroupForm(false);
                    setAddGroupValue("");
                  }}
                  className={`${btnSecondary} text-xs py-1 flex-1`}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <DraggableKeyList
            fieldOrder={activeFieldOrder}
            selectedKey={selectedKey}
            editedRules={editedRules}
            rules={editedRules}
            displayLabel={displayLabel}
            onSelectKey={handleSelectKey}
            onReorder={handleReorder}
            selectedGroup={selectedGroup}
            onSelectGroup={handleSelectGroup}
            onDeleteGroup={handleDeleteGroup}
            onRenameGroup={handleRenameGroup}
            existingGroups={existingGroups}
          />
        </div>

        {/* Key detail editor */}
        <div className="flex-1 overflow-y-auto max-h-[calc(100vh-350px)] pr-2">
          {selectedKey && currentRule ? (
            <div key={selectedKey} className="space-y-3">
              <div className="sticky top-0 bg-white sf-dk-surface-900 z-10 border-b sf-border-default mb-1">
                {editingLabel ? (
                  (() => {
                    const trimmedLabel = editLabelValue.trim();
                    const otherLabels = activeFieldOrder
                      .filter(
                        (k) => !k.startsWith("__grp::") && k !== selectedKey,
                      )
                      .map((k) =>
                        displayLabel(k, editedRules[k]).toLowerCase(),
                      );
                    const labelDup =
                      trimmedLabel &&
                      otherLabels.includes(trimmedLabel.toLowerCase())
                        ? "A field with this label already exists"
                        : null;
                    const labelDisabled = !trimmedLabel || !!labelDup;
                    const commitLabel = () => {
                      if (labelDisabled) return;
                      updateField(selectedKey, "ui.label", trimmedLabel);
                      setEditingLabel(false);
                    };
                    return (
                      <div className="flex flex-col justify-center gap-1 px-4 min-h-[44px]">
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            className={`${inputCls} text-lg font-semibold py-1 px-2 w-64`}
                            value={editLabelValue}
                            onChange={(e) => setEditLabelValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitLabel();
                              if (e.key === "Escape") setEditingLabel(false);
                            }}
                          />
                          <button
                            onClick={commitLabel}
                            disabled={labelDisabled}
                            className={`${btnPrimary} px-3 py-1.5 text-xs font-medium`}
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingLabel(false)}
                            className="px-3 py-1.5 text-xs sf-text-muted hover:sf-text-muted sf-dk-hover-fg-300"
                          >
                            Cancel
                          </button>
                        </div>
                        {labelDup && (
                          <span className="text-[10px] sf-danger-text-soft pl-1">
                            {labelDup}
                          </span>
                        )}
                      </div>
                    );
                  })()
                ) : renamingKey ? (
                  (() => {
                    const renameErr =
                      renameValue && renameValue.trim() !== selectedKey
                        ? validateNewKeyTs(
                            renameValue.trim(),
                            activeFieldOrder.filter((k) => k !== selectedKey),
                          )
                        : null;
                    const renameDisabled =
                      !renameValue.trim() ||
                      renameValue.trim() === selectedKey ||
                      !!renameErr;
                    return (
                      <div className="flex flex-col justify-center gap-1 px-4 min-h-[44px]">
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            className={`${inputCls} text-sm font-mono py-1 px-2 w-52`}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !renameDisabled)
                                handleRenameKey();
                              if (e.key === "Escape") setRenamingKey(false);
                            }}
                          />
                          {renameErr && (
                            <span className="text-[10px] sf-danger-text-soft">
                              {renameErr}
                            </span>
                          )}
                          <button
                            onClick={handleRenameKey}
                            disabled={renameDisabled}
                            className={`${btnPrimary} px-3 py-1.5 text-xs font-medium`}
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setRenamingKey(false)}
                            className="px-3 py-1.5 text-xs sf-text-muted hover:sf-text-muted sf-dk-hover-fg-300"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="flex items-center gap-3 px-4 min-h-[44px]">
                    {/* Identity: label + key */}
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="text-lg font-semibold sf-text-primary dark:text-white truncate cursor-pointer hover:text-accent transition-colors leading-snug"
                        onClick={() => {
                          setEditingLabel(true);
                          setEditLabelValue(
                            displayLabel(
                              selectedKey,
                              currentRule as Record<string, unknown>,
                            ),
                          );
                        }}
                        title="Click to edit label"
                      >
                        {displayLabel(
                          selectedKey,
                          currentRule as Record<string, unknown>,
                        )}
                      </span>
                      <span
                        className="text-[10px] sf-text-subtle cursor-pointer hover:text-accent transition-colors flex-shrink-0"
                        onClick={() => {
                          setEditingLabel(true);
                          setEditLabelValue(
                            displayLabel(
                              selectedKey,
                              currentRule as Record<string, unknown>,
                            ),
                          );
                        }}
                      >
                        &#9998;
                      </span>
                      <span className="sf-text-subtle select-none text-lg leading-snug">
                        |
                      </span>
                      <span
                        className="text-sm sf-text-muted font-mono truncate cursor-pointer hover:text-accent transition-colors leading-snug"
                        onClick={() => {
                          setRenamingKey(true);
                          setRenameValue(selectedKey);
                        }}
                        title="Click to rename key"
                      >
                        {selectedKey}
                      </span>
                      <span
                        className="text-[10px] sf-text-subtle cursor-pointer hover:text-accent transition-colors flex-shrink-0"
                        onClick={() => {
                          setRenamingKey(true);
                          setRenameValue(selectedKey);
                        }}
                      >
                        &#9998;
                      </span>
                      {Boolean(currentRule._edited) && (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full sf-chip-warning-strong flex-shrink-0">
                          Modified
                        </span>
                      )}
                    </div>

                    <div className="flex-1" />

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={handleSaveAll}
                        disabled={saving || autoSaveEnabled}
                        className={`relative px-3 py-1.5 text-xs font-medium rounded transition-colors disabled:opacity-50 ${
                          autoSaveEnabled
                            ? "sf-icon-button"
                            : "sf-primary-button"
                        }`}
                      >
                        {saving ? "Saving\u2026" : "Save"}
                      </button>
                      <button
                        onClick={() => {
                          if (autoSaveLocked) return;
                          setAutoSaveEnabled(!autoSaveEnabled);
                        }}
                        disabled={autoSaveLocked}
                        className={`relative px-3 py-1.5 text-xs font-medium rounded transition-colors overflow-visible ${
                          autoSaveEnabled
                            ? "sf-primary-button"
                            : "sf-action-button"
                        } ${autoSaveLocked ? "opacity-80 cursor-not-allowed" : ""}`}
                      >
                        {autoSaveLocked
                          ? "Auto-Save On (Locked)"
                          : autoSaveEnabled
                            ? "Auto-Save On"
                            : "Auto-Save Off"}
                        {saving && (
                          <span
                            className="absolute inline-block h-2 w-2 rounded-full sf-dot-pending animate-pulse border border-white/90 shadow-sm"
                            style={{ right: "2px", bottom: "2px" }}
                          />
                        )}
                        {!saving && saveSuccess && (
                          <span
                            className="absolute inline-block h-2 w-2 rounded-full sf-success-bg-500 border border-white/90 shadow-sm"
                            style={{ right: "2px", bottom: "2px" }}
                          />
                        )}
                      </button>
                      {!confirmDelete ? (
                        <button
                          onClick={() => setConfirmDelete(true)}
                          className="px-3 py-1.5 text-xs font-medium sf-danger-text rounded border sf-danger-action-outline sf-danger-action-outline-hover transition-colors"
                        >
                          Delete
                        </button>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <span className="text-xs sf-danger-text-soft font-medium">
                            Delete?
                          </span>
                          <button
                            onClick={handleDeleteKey}
                            className="px-2.5 py-1 text-xs font-medium rounded sf-danger-solid-button"
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setConfirmDelete(false)}
                            className="px-2.5 py-1 text-xs sf-text-muted hover:sf-text-muted sf-dk-hover-fg-300"
                          >
                            No
                          </button>
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Field Coupling Summary ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ */}
              {(() => {
                const pt = strN(
                  currentRule,
                  "parse.template",
                  strN(currentRule, "parse_template"),
                );
                const es = strN(
                  currentRule,
                  "enum.source",
                  strN(currentRule, "enum_source"),
                );
                const ep = strN(
                  currentRule,
                  "enum.policy",
                  strN(currentRule, "enum_policy", "open"),
                );
                const ct = strN(currentRule, "component.type");
                const chipCls =
                  "px-2 py-0.5 text-[11px] rounded-full font-medium";
                const isComponent = pt === "component_reference";
                const isBoolean = pt === "boolean_yes_no_unk";
                const isNumeric = [
                  "number_with_unit",
                  "list_of_numbers_with_unit",
                  "list_numbers_or_ranges_with_unit",
                ].includes(pt);
                return (
                  <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded border sf-border-default sf-bg-surface-soft sf-dk-surface-800a50 text-xs">
                    <span className="sf-text-subtle font-medium mr-1">
                      Pipeline:
                    </span>
                    <span
                      className={`${chipCls} ${isComponent ? "sf-review-ai-pending-badge" : isBoolean ? "sf-chip-info-strong" : isNumeric ? "sf-chip-orange-strong" : "sf-chip-success-strong"}`}
                    >
                      {pt || "none"}
                    </span>
                    <span className="sf-text-subtle">|</span>
                    <span className="sf-text-muted">
                      Enum: <span className="font-mono">{ep}</span>
                    </span>
                    {es ? (
                      <>
                        <span className="sf-text-subtle">|</span>
                        <span className="sf-text-muted">
                          Source: <span className="font-mono">{es}</span>
                        </span>
                      </>
                    ) : null}
                    {ct ? (
                      <>
                        <span className="sf-text-subtle">|</span>
                        <span
                          className={`${chipCls} sf-review-ai-pending-badge`}
                        >
                          DB: {ct}
                        </span>
                      </>
                    ) : null}
                  </div>
                );
              })()}

              {/* ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Contract ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ */}
              <Section
                title="Contract (Type, Shape, Unit)"
                persistKey={`studio:keyNavigator:section:contract:${category}`}
                titleTooltip={STUDIO_TIPS.key_section_contract}
              >
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <div className={`${labelCls} flex items-center`}>
                      <span>
                        Data Type
                        <Tip
                          style={{
                            position: "relative",
                            left: "-3px",
                            top: "-4px",
                          }}
                          text={STUDIO_TIPS.data_type}
                        />
                      </span>
                      <B p="contract.type" />
                    </div>
                    <select
                      className={`${selectCls} w-full`}
                      value={strN(currentRule, "contract.type", "string")}
                      onChange={(e) =>
                        updateField(
                          selectedKey,
                          "contract.type",
                          e.target.value,
                        )
                      }
                    >
                      <option value="string">string</option>
                      <option value="number">number</option>
                      <option value="integer">integer</option>
                      <option value="boolean">boolean</option>
                      <option value="date">date</option>
                      <option value="url">url</option>
                      <option value="enum">enum</option>
                    </select>
                  </div>
                  <div>
                    <div className={`${labelCls} flex items-center`}>
                      <span>
                        Shape
                        <Tip
                          style={{
                            position: "relative",
                            left: "-3px",
                            top: "-4px",
                          }}
                          text={STUDIO_TIPS.shape}
                        />
                      </span>
                      <B p="contract.shape" />
                    </div>
                    <select
                      className={`${selectCls} w-full`}
                      value={strN(currentRule, "contract.shape", "scalar")}
                      onChange={(e) =>
                        updateField(
                          selectedKey,
                          "contract.shape",
                          e.target.value,
                        )
                      }
                    >
                      <option value="scalar">scalar</option>
                      <option value="list">list</option>
                      <option value="structured">structured</option>
                      <option value="key_value">key_value</option>
                    </select>
                  </div>
                  <div>
                    <div className={`${labelCls} flex items-center`}>
                      <span>
                        Unit
                        <Tip
                          style={{
                            position: "relative",
                            left: "-3px",
                            top: "-4px",
                          }}
                          text={STUDIO_TIPS.contract_unit}
                        />
                      </span>
                      <B p="contract.unit" />
                    </div>
                    <ComboSelect
                      value={strN(currentRule, "contract.unit")}
                      onChange={(v) =>
                        updateField(selectedKey, "contract.unit", v || null)
                      }
                      options={UNITS}
                      placeholder="e.g. g, mm, Hz"
                    />
                  </div>
                  <div>
                    <div className={`${labelCls} flex items-center`}>
                      <span>
                        Unknown Token
                        <Tip
                          style={{
                            position: "relative",
                            left: "-3px",
                            top: "-4px",
                          }}
                          text={STUDIO_TIPS.unknown_token}
                        />
                      </span>
                      <B p="contract.unknown_token" />
                    </div>
                    <ComboSelect
                      value={strN(currentRule, "contract.unknown_token", "unk")}
                      onChange={(v) =>
                        updateField(selectedKey, "contract.unknown_token", v)
                      }
                      options={UNKNOWN_TOKENS}
                      placeholder="unk"
                      disabled={isStudioContractFieldDeferredLocked("contract.unknown_token")}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className={`${labelCls} flex items-center`}>
                    <span>
                      Range
                      <Tip
                        style={{
                          position: "relative",
                          left: "-3px",
                          top: "-4px",
                        }}
                        text={STUDIO_TIPS.contract_range}
                      />
                    </span>
                    <B p="contract.range" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      className={`${inputCls} w-full`}
                      type="number"
                      step={currentContractType === "integer" ? 1 : "any"}
                      value={strN(currentRule, "contract.range.min")}
                      onChange={(e) =>
                        updateField(
                          selectedKey,
                          "contract.range.min",
                          parseContractRangeValue(e.target.value),
                        )
                      }
                      placeholder="Min"
                      disabled={!isNumericContract}
                    />
                    <input
                      className={`${inputCls} w-full`}
                      type="number"
                      step={currentContractType === "integer" ? 1 : "any"}
                      value={strN(currentRule, "contract.range.max")}
                      onChange={(e) =>
                        updateField(
                          selectedKey,
                          "contract.range.max",
                          parseContractRangeValue(e.target.value),
                        )
                      }
                      placeholder="Max"
                      disabled={!isNumericContract}
                    />
                  </div>
                  {!isNumericContract ? (
                    <div className="text-xs sf-text-subtle italic">
                      Available for number and integer contracts.
                    </div>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <div className={`${labelCls} flex items-center`}>
                    <span>
                      List Rules
                      <Tip
                        style={{
                          position: "relative",
                          left: "-3px",
                          top: "-4px",
                        }}
                        text={STUDIO_TIPS.list_rules}
                      />
                    </span>
                    <B p="contract.list_rules" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={boolN(
                          currentRule,
                          "contract.list_rules.dedupe",
                          true,
                        )}
                        onChange={(e) =>
                          updateField(
                            selectedKey,
                            "contract.list_rules.dedupe",
                            e.target.checked,
                          )
                        }
                        className="rounded sf-border-soft"
                        disabled={!isListContract}
                      />
                      <span className="text-xs sf-text-muted">
                        Dedupe
                        <Tip
                          style={{
                            position: "relative",
                            left: "-3px",
                            top: "-4px",
                          }}
                          text={STUDIO_TIPS.list_rules_dedupe}
                        />
                      </span>
                    </label>
                    <div>
                      <div className={labelCls}>
                        Sort
                        <Tip
                          style={{
                            position: "relative",
                            left: "-3px",
                            top: "-4px",
                          }}
                          text={STUDIO_TIPS.list_rules_sort}
                        />
                      </div>
                      <select
                        className={`${selectCls} w-full`}
                        value={strN(currentRule, "contract.list_rules.sort", "none")}
                        onChange={(e) =>
                          updateField(
                            selectedKey,
                            "contract.list_rules.sort",
                            e.target.value,
                          )
                        }
                        disabled={!isListContract}
                      >
                        <option value="none">none</option>
                        <option value="asc">asc</option>
                        <option value="desc">desc</option>
                      </select>
                    </div>
                    <div>
                      <div className={labelCls}>
                        Min Items
                        <Tip
                          style={{
                            position: "relative",
                            left: "-3px",
                            top: "-4px",
                          }}
                          text={STUDIO_TIPS.list_rules_min_items}
                        />
                      </div>
                      <input
                        className={`${inputCls} w-full`}
                        type="number"
                        min={0}
                        step={1}
                        value={strN(currentRule, "contract.list_rules.min_items")}
                        onChange={(e) =>
                          updateField(
                            selectedKey,
                            "contract.list_rules.min_items",
                            parseListRuleCount(e.target.value),
                          )
                        }
                        placeholder="0"
                        disabled={!isListContract}
                      />
                    </div>
                    <div>
                      <div className={labelCls}>
                        Max Items
                        <Tip
                          style={{
                            position: "relative",
                            left: "-3px",
                            top: "-4px",
                          }}
                          text={STUDIO_TIPS.list_rules_max_items}
                        />
                      </div>
                      <input
                        className={`${inputCls} w-full`}
                        type="number"
                        min={0}
                        step={1}
                        value={strN(currentRule, "contract.list_rules.max_items")}
                        onChange={(e) =>
                          updateField(
                            selectedKey,
                            "contract.list_rules.max_items",
                            parseListRuleCount(e.target.value),
                          )
                        }
                        placeholder="100"
                        disabled={!isListContract}
                      />
                    </div>
                    <div className="col-span-2">
                      <div className={labelCls}>
                        Item Union
                        <Tip
                          style={{
                            position: "relative",
                            left: "-3px",
                            top: "-4px",
                          }}
                          text={STUDIO_TIPS.list_rules_item_union}
                        />
                      </div>
                      <select
                        className={`${selectCls} w-full`}
                        value={strN(currentRule, "contract.list_rules.item_union")}
                        onChange={(e) =>
                          updateField(
                            selectedKey,
                            "contract.list_rules.item_union",
                            e.target.value || undefined,
                          )
                        }
                        disabled={!isListContract}
                      >
                        <option value="">winner_only</option>
                        <option value="set_union">set_union</option>
                        <option value="ordered_union">ordered_union</option>
                      </select>
                    </div>
                  </div>
                  {!isListContract ? (
                    <div className="text-xs sf-text-subtle italic">
                      Available when contract shape is list.
                    </div>
                  ) : null}
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <div className={`${labelCls} flex items-center`}>
                      <span>
                        Rounding Decimals
                        <Tip
                          style={{
                            position: "relative",
                            left: "-3px",
                            top: "-4px",
                          }}
                          text={STUDIO_TIPS.rounding_decimals}
                        />
                      </span>
                      <B p="contract.rounding.decimals" />
                    </div>
                    <input
                      className={`${inputCls} w-full`}
                      type="number"
                      min={
                        STUDIO_NUMERIC_KNOB_BOUNDS.contractRoundingDecimals.min
                      }
                      max={
                        STUDIO_NUMERIC_KNOB_BOUNDS.contractRoundingDecimals.max
                      }
                      value={numN(currentRule, "contract.rounding.decimals", 0)}
                      onChange={(e) =>
                        updateField(
                          selectedKey,
                          "contract.rounding.decimals",
                          parseBoundedIntInput(
                            e.target.value,
                            STUDIO_NUMERIC_KNOB_BOUNDS.contractRoundingDecimals
                              .min,
                            STUDIO_NUMERIC_KNOB_BOUNDS.contractRoundingDecimals
                              .max,
                            STUDIO_NUMERIC_KNOB_BOUNDS.contractRoundingDecimals
                              .fallback,
                          ),
                        )
                      }
                    />
                  </div>
                  <div>
                    <div className={`${labelCls} flex items-center`}>
                      <span>
                        Rounding Mode
                        <Tip
                          style={{
                            position: "relative",
                            left: "-3px",
                            top: "-4px",
                          }}
                          text={STUDIO_TIPS.rounding_mode}
                        />
                      </span>
                      <B p="contract.rounding.mode" />
                    </div>
                    <select
                      className={`${selectCls} w-full`}
                      value={strN(
                        currentRule,
                        "contract.rounding.mode",
                        "nearest",
                      )}
                      onChange={(e) =>
                        updateField(
                          selectedKey,
                          "contract.rounding.mode",
                          e.target.value,
                        )
                      }
                      disabled={isStudioContractFieldDeferredLocked("contract.rounding.mode")}
                    >
                      <option value="nearest">nearest</option>
                      <option value="floor">floor</option>
                      <option value="ceil">ceil</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={boolN(
                          currentRule,
                          "contract.unknown_reason_required",
                          true,
                        )}
                        onChange={(e) =>
                          updateField(
                            selectedKey,
                            "contract.unknown_reason_required",
                            e.target.checked,
                          )
                        }
                        className="rounded sf-border-soft"
                        disabled={isStudioContractFieldDeferredLocked("contract.unknown_reason_required")}
                      />
                      <span className="text-xs sf-text-muted">
                        Require unknown reason
                        <Tip
                          style={{
                            position: "relative",
                            left: "-3px",
                            top: "-4px",
                          }}
                          text={STUDIO_TIPS.require_unknown_reason}
                        />
                      </span>
                    </label>
                  </div>
                </div>
              </Section>

              {/* ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Priority ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ */}
              <Section
                title="Priority & Effort"
                persistKey={`studio:keyNavigator:section:priority:${category}`}
                titleTooltip={STUDIO_TIPS.key_section_priority}
              >
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <div className={`${labelCls} flex items-center`}>
                      <span>
                        Required Level
                        <Tip
                          style={{
                            position: "relative",
                            left: "-3px",
                            top: "-4px",
                          }}
                          text={STUDIO_TIPS.required_level}
                        />
                      </span>
                      <B p="priority.required_level" />
                    </div>
                    <select
                      className={`${selectCls} w-full`}
                      value={strN(
                        currentRule,
                        "priority.required_level",
                        strN(currentRule, "required_level", "expected"),
                      )}
                      onChange={(e) =>
                        updateField(
                          selectedKey,
                          "priority.required_level",
                          e.target.value,
                        )
                      }
                    >
                      <option value="identity">identity</option>
                      <option value="required">required</option>
                      <option value="critical">critical</option>
                      <option value="expected">expected</option>
                      <option value="optional">optional</option>
                      <option value="editorial">editorial</option>
                      <option value="commerce">commerce</option>
                    </select>
                  </div>
                  <div>
                    <div className={`${labelCls} flex items-center`}>
                      <span>
                        Availability
                        <Tip
                          style={{
                            position: "relative",
                            left: "-3px",
                            top: "-4px",
                          }}
                          text={STUDIO_TIPS.availability}
                        />
                      </span>
                      <B p="priority.availability" />
                    </div>
                    <select
                      className={`${selectCls} w-full`}
                      value={strN(
                        currentRule,
                        "priority.availability",
                        strN(currentRule, "availability", "expected"),
                      )}
                      onChange={(e) =>
                        updateField(
                          selectedKey,
                          "priority.availability",
                          e.target.value,
                        )
                      }
                    >
                      <option value="always">always</option>
                      <option value="expected">expected</option>
                      <option value="sometimes">sometimes</option>
                      <option value="rare">rare</option>
                      <option value="editorial_only">editorial_only</option>
                    </select>
                  </div>
                  <div>
                    <div className={`${labelCls} flex items-center`}>
                      <span>
                        Difficulty
                        <Tip
                          style={{
                            position: "relative",
                            left: "-3px",
                            top: "-4px",
                          }}
                          text={STUDIO_TIPS.difficulty}
                        />
                      </span>
                      <B p="priority.difficulty" />
                    </div>
                    <select
                      className={`${selectCls} w-full`}
                      value={strN(
                        currentRule,
                        "priority.difficulty",
                        strN(currentRule, "difficulty", "easy"),
                      )}
                      onChange={(e) =>
                        updateField(
                          selectedKey,
                          "priority.difficulty",
                          e.target.value,
                        )
                      }
                    >
                      <option value="easy">easy</option>
                      <option value="medium">medium</option>
                      <option value="hard">hard</option>
                      <option value="instrumented">instrumented</option>
                    </select>
                  </div>
                  <div>
                    <div className={`${labelCls} flex items-center`}>
                      <span>
                        Effort (1-10)
                        <Tip
                          style={{
                            position: "relative",
                            left: "-3px",
                            top: "-4px",
                          }}
                          text={STUDIO_TIPS.effort}
                        />
                      </span>
                      <B p="priority.effort" />
                    </div>
                    <input
                      className={`${inputCls} w-full`}
                      type="number"
                      min={STUDIO_NUMERIC_KNOB_BOUNDS.priorityEffort.min}
                      max={STUDIO_NUMERIC_KNOB_BOUNDS.priorityEffort.max}
                      value={numN(
                        currentRule,
                        "priority.effort",
                        numN(currentRule, "effort", 3),
                      )}
                      onChange={(e) =>
                        updateField(
                          selectedKey,
                          "priority.effort",
                          parseBoundedIntInput(
                            e.target.value,
                            STUDIO_NUMERIC_KNOB_BOUNDS.priorityEffort.min,
                            STUDIO_NUMERIC_KNOB_BOUNDS.priorityEffort.max,
                            STUDIO_NUMERIC_KNOB_BOUNDS.priorityEffort.fallback,
                          ),
                        )
                      }
                    />
                  </div>
                </div>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={boolN(
                        currentRule,
                        "priority.publish_gate",
                        boolN(currentRule, "publish_gate"),
                      )}
                      onChange={(e) =>
                        updateField(
                          selectedKey,
                          "priority.publish_gate",
                          e.target.checked,
                        )
                      }
                      className="rounded sf-border-soft"
                    />
                    <span className="text-xs sf-text-muted flex items-center gap-1">
                      Publish Gate
                      <Tip
                        style={{
                          position: "relative",
                          left: "-3px",
                          top: "-4px",
                        }}
                        text={STUDIO_TIPS.publish_gate}
                      />
                      <B p="priority.publish_gate" />
                    </span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={boolN(
                        currentRule,
                        "priority.block_publish_when_unk",
                        boolN(currentRule, "block_publish_when_unk"),
                      )}
                      onChange={(e) =>
                        updateField(
                          selectedKey,
                          "priority.block_publish_when_unk",
                          e.target.checked,
                        )
                      }
                      className="rounded sf-border-soft"
                    />
                    <span className="text-xs sf-text-muted flex items-center gap-1">
                      Block publish when unk
                      <Tip
                        style={{
                          position: "relative",
                          left: "-3px",
                          top: "-4px",
                        }}
                        text={STUDIO_TIPS.block_publish_when_unk}
                      />
                      <B p="priority.block_publish_when_unk" />
                    </span>
                  </label>
                </div>

                {/* AI Assist */}
                <h4 className="text-xs font-semibold sf-text-muted mt-4 mb-1">
                  AI Assist
                  <Tip
                    style={{ position: "relative", left: "-3px", top: "-4px" }}
                    text={STUDIO_TIPS.ai_mode}
                  />
                </h4>
                {(() => {
                  const explicitMode = strN(currentRule, "ai_assist.mode");
                  const strategy = strN(
                    currentRule,
                    "ai_assist.model_strategy",
                    "auto",
                  );
                  const explicitCalls = numN(
                    currentRule,
                    "ai_assist.max_calls",
                    0,
                  );
                  const reqLvl = strN(
                    currentRule,
                    "priority.required_level",
                    strN(currentRule, "required_level", "expected"),
                  );
                  const diff = strN(
                    currentRule,
                    "priority.difficulty",
                    strN(currentRule, "difficulty", "easy"),
                  );
                  const effort = numN(
                    currentRule,
                    "priority.effort",
                    numN(currentRule, "effort", 3),
                  );

                  // Derive effective mode
                  let derivedMode = "off";
                  if (["identity", "required", "critical"].includes(reqLvl))
                    derivedMode = "judge";
                  else if (reqLvl === "expected" && diff === "hard")
                    derivedMode = "planner";
                  else if (reqLvl === "expected") derivedMode = "advisory";
                  const effectiveMode = explicitMode || derivedMode;

                  // Derive effective max_calls
                  const derivedCalls = effort <= 3 ? 1 : effort <= 6 ? 2 : 3;
                  const effectiveCalls =
                    explicitCalls > 0
                      ? Math.min(explicitCalls, 10)
                      : derivedCalls;

                  // Resolve effective model ÃƒÂ¢Ã¢â€šÂ¬" actual model names from env config
                  const modeToModel: Record<
                    string,
                    { model: string; reasoning: boolean }
                  > = {
                    off: { model: "none", reasoning: false },
                    advisory: { model: "gpt-5-low", reasoning: false },
                    planner: {
                      model: "gpt-5-low \u2192 gpt-5.2-high on escalation",
                      reasoning: false,
                    },
                    judge: { model: "gpt-5.2-high", reasoning: true },
                  };
                  let effectiveModel =
                    modeToModel[effectiveMode] || modeToModel.off;
                  if (strategy === "force_fast")
                    effectiveModel = {
                      model: "gpt-5-low (forced)",
                      reasoning: false,
                    };
                  else if (strategy === "force_deep")
                    effectiveModel = {
                      model: "gpt-5.2-high (forced)",
                      reasoning: true,
                    };

                  return (
                    <>
                      <div className="grid grid-cols-4 gap-3">
                        <div>
                          <div className={`${labelCls} flex items-center`}>
                            <span>
                              Mode
                              <Tip
                                style={{
                                  position: "relative",
                                  left: "-3px",
                                  top: "-4px",
                                }}
                                text={STUDIO_TIPS.ai_mode}
                              />
                            </span>
                            <B p="ai_assist.mode" />
                          </div>
                          <select
                            className={`${selectCls} w-full`}
                            value={explicitMode}
                            onChange={(e) =>
                              updateField(
                                selectedKey,
                                "ai_assist.mode",
                                e.target.value || null,
                              )
                            }
                          >
                            <option value="">auto ({derivedMode})</option>
                            <option value="off">
                              off &mdash; no LLM, deterministic only
                            </option>
                            <option value="advisory">
                              advisory &mdash; gpt-5-low, single pass
                            </option>
                            <option value="planner">
                              planner &mdash; gpt-5-low &rarr; gpt-5.2-high
                            </option>
                            <option value="judge">
                              judge &mdash; gpt-5.2-high, reasoning
                            </option>
                          </select>
                        </div>
                        <div>
                          <div className={`${labelCls} flex items-center`}>
                            <span>
                              Model Strategy
                              <Tip
                                style={{
                                  position: "relative",
                                  left: "-3px",
                                  top: "-4px",
                                }}
                                text={STUDIO_TIPS.ai_model_strategy}
                              />
                            </span>
                            <B p="ai_assist.model_strategy" />
                          </div>
                          <select
                            className={`${selectCls} w-full`}
                            value={strategy}
                            onChange={(e) =>
                              updateField(
                                selectedKey,
                                "ai_assist.model_strategy",
                                e.target.value,
                              )
                            }
                          >
                            <option value="auto">
                              auto &mdash; mode decides model
                            </option>
                            <option value="force_fast">
                              force_fast &mdash; always gpt-5-low
                            </option>
                            <option value="force_deep">
                              force_deep &mdash; always gpt-5.2-high
                            </option>
                          </select>
                        </div>
                        <div>
                          <div className={`${labelCls} flex items-center`}>
                            <span>
                              Max Calls
                              <Tip
                                text={STUDIO_TIPS.ai_max_calls}
                                style={{
                                  position: "relative",
                                  left: "-3px",
                                  top: "-4px",
                                }}
                              />
                            </span>
                            <B p="ai_assist.max_calls" />
                          </div>
                          <input
                            className={`${inputCls} w-full`}
                            type="number"
                            min={STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxCalls.min}
                            max={STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxCalls.max}
                            value={explicitCalls || ""}
                            onChange={(e) => {
                              const parsed = parseOptionalPositiveIntInput(
                                e.target.value,
                              );
                              updateField(
                                selectedKey,
                                "ai_assist.max_calls",
                                parsed === null
                                  ? null
                                  : clampNumber(
                                      parsed,
                                      STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxCalls.min,
                                      STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxCalls.max,
                                    ),
                              );
                            }}
                            placeholder={`auto (${derivedCalls})`}
                          />
                        </div>
                        <div>
                          <div className={`${labelCls} flex items-center`}>
                            <span>
                              Max Tokens
                              <Tip
                                style={{
                                  position: "relative",
                                  left: "-3px",
                                  top: "-4px",
                                }}
                                text={STUDIO_TIPS.ai_max_tokens}
                              />
                            </span>
                            <B p="ai_assist.max_tokens" />
                          </div>
                          <input
                            className={`${inputCls} w-full`}
                            type="number"
                            min={STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxTokens.min}
                            max={STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxTokens.max}
                            step={1024}
                            value={
                              numN(currentRule, "ai_assist.max_tokens", 0) || ""
                            }
                            onChange={(e) => {
                              const parsed = parseOptionalPositiveIntInput(
                                e.target.value,
                              );
                              updateField(
                                selectedKey,
                                "ai_assist.max_tokens",
                                parsed === null
                                  ? null
                                  : clampNumber(
                                      parsed,
                                      STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxTokens
                                        .min,
                                      STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxTokens
                                        .max,
                                    ),
                              );
                            }}
                            placeholder={`auto (${effectiveMode === "off" ? "0" : effectiveMode === "advisory" ? "4096" : effectiveMode === "planner" ? "8192" : "16384"})`}
                          />
                        </div>
                      </div>

                      {/* Effective resolution summary */}
                      <div className="mt-2 text-[11px] sf-bg-surface-soft sf-dk-surface-800a50 rounded p-2.5 border sf-border-default space-y-1">
                        <div className="text-[10px] font-semibold sf-text-subtle mb-1.5">
                          Effective AI Configuration
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="sf-text-subtle w-14">Mode:</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              effectiveMode === "judge"
                                ? "sf-review-ai-pending-badge"
                                : effectiveMode === "planner"
                                  ? "sf-chip-info-strong"
                                  : effectiveMode === "advisory"
                                    ? "sf-chip-success-strong"
                                    : "sf-bg-surface-soft-strong sf-text-muted sf-dk-surface-700 dark:sf-text-subtle"
                            }`}
                          >
                            {effectiveMode}
                          </span>
                          {!explicitMode && (
                            <span className="sf-text-subtle italic text-[10px]">
                              (auto from {reqLvl}
                              {diff !== "easy" ? ` + ${diff}` : ""})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="sf-text-subtle w-14">Model:</span>
                          <span className="sf-text-muted font-mono text-[10px]">
                            {effectiveModel.model}
                          </span>
                          {effectiveModel.reasoning && (
                            <span className="text-[9px] px-1 py-0.5 rounded sf-chip-warning-strong font-medium">
                              REASONING
                            </span>
                          )}
                          {effectiveMode === "off" && (
                            <span className="text-[9px] px-1 py-0.5 rounded sf-bg-surface-soft-strong sf-text-muted sf-dk-surface-700 dark:sf-text-subtle">
                              NO API CALLS
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="sf-text-subtle w-14">Budget:</span>
                          <span className="sf-text-muted">
                            {effectiveMode === "off" ? "0" : effectiveCalls}{" "}
                            call{effectiveCalls !== 1 ? "s" : ""}
                          </span>
                          {!explicitCalls && effectiveMode !== "off" && (
                            <span className="sf-text-subtle italic text-[10px]">
                              (auto from effort {effort})
                            </span>
                          )}
                        </div>
                        {effectiveMode === "planner" && (
                          <div className="text-[10px] sf-text-subtle mt-1 border-t sf-border-default dark:sf-border-soft pt-1">
                            Starts with fast model. Escalates to reasoning model
                            if conflicts detected or confidence is low.
                          </div>
                        )}
                        {effectiveMode === "judge" && (
                          <div className="text-[10px] sf-text-subtle mt-1 border-t sf-border-default dark:sf-border-soft pt-1">
                            Uses reasoning model from the start. Full conflict
                            resolution, evidence audit, multi-source
                            verification.
                          </div>
                        )}
                      </div>

                      {(() => {
                        // ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Auto-generate extraction guidance (mirrors backend autoGenerateExtractionGuidance) ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬
                        const explicitNote = strN(
                          currentRule,
                          "ai_assist.reasoning_note",
                        );
                        const type = strN(
                          currentRule,
                          "contract.data_type",
                          strN(currentRule, "data_type", "string"),
                        );
                        const shape = strN(
                          currentRule,
                          "contract.shape",
                          strN(currentRule, "shape", "scalar"),
                        );
                        const unit = strN(
                          currentRule,
                          "contract.unit",
                          strN(currentRule, "unit"),
                        );
                        const enumPolicy = strN(
                          currentRule,
                          "enum.policy",
                          strN(currentRule, "enum_policy", "open"),
                        );
                        const enumSource = strN(
                          currentRule,
                          "enum.source",
                          strN(currentRule, "enum_source"),
                        );
                        const evidenceReq = boolN(
                          currentRule,
                          "evidence.evidence_required",
                          boolN(currentRule, "evidence_required"),
                        );
                        const minRefs = numN(
                          currentRule,
                          "evidence.min_evidence_refs",
                          numN(
                            currentRule,
                            "min_evidence_refs",
                            STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.fallback,
                          ),
                        );
                        const parseTemplate = strN(
                          currentRule,
                          "parse.template",
                          strN(currentRule, "parse_template"),
                        );
                        const componentType = strN(
                          currentRule,
                          "component.type",
                          strN(currentRule, "component_type"),
                        );

                        const guidanceParts: string[] = [];

                        // Identity fields
                        if (reqLvl === "identity") {
                          guidanceParts.push(
                            "Identity field \u2014 must exactly match the product. Do not infer or guess. Cross-reference multiple sources to confirm.",
                          );
                        }

                        // Component reference
                        if (
                          componentType ||
                          parseTemplate === "component_reference"
                        ) {
                          const cType =
                            componentType ||
                            enumSource.replace("component_db.", "");
                          guidanceParts.push(
                            `Component reference (${cType}). Match to known component names and aliases in the database. If not listed, provide the full name exactly as stated in the source.`,
                          );
                        }

                        // Data type guidance
                        if (
                          type === "boolean" ||
                          parseTemplate === "boolean" ||
                          parseTemplate.startsWith("boolean_")
                        ) {
                          guidanceParts.push(
                            "Boolean field \u2014 determine yes or no from explicit evidence. If the feature is not mentioned, it likely means no, but confirm before assuming.",
                          );
                        } else if (
                          (type === "number" || type === "integer") &&
                          unit
                        ) {
                          guidanceParts.push(
                            `Numeric field \u2014 extract the exact value in ${unit}. Convert from other units if needed. If a range is given, extract the primary/default value.`,
                          );
                        } else if (type === "url") {
                          guidanceParts.push(
                            "URL field \u2014 extract the full, valid URL. Prefer manufacturer or official sources.",
                          );
                        } else if (
                          type === "date" ||
                          (selectedKey || "").includes("date")
                        ) {
                          guidanceParts.push(
                            "Date field \u2014 extract the actual date. Prefer official announcement or first-availability dates from manufacturer sources.",
                          );
                        } else if (
                          type === "string" &&
                          !componentType &&
                          !parseTemplate.startsWith("boolean_")
                        ) {
                          guidanceParts.push(
                            "Text field \u2014 extract the exact value as stated in the source. Do not paraphrase or abbreviate.",
                          );
                        }

                        // List shape
                        if (shape === "list") {
                          guidanceParts.push(
                            "Multiple values \u2014 extract all distinct values found across sources.",
                          );
                        }

                        // Enum constraint
                        if (enumPolicy === "closed" && enumSource) {
                          guidanceParts.push(
                            `Closed enum \u2014 value must match one of the known options from ${enumSource}.`,
                          );
                        } else if (
                          enumPolicy === "open_prefer_known" &&
                          enumSource
                        ) {
                          guidanceParts.push(
                            `Prefer known values from ${enumSource}, but accept new values if backed by clear evidence.`,
                          );
                        }

                        // Difficulty
                        if (diff === "hard") {
                          guidanceParts.push(
                            "Often inconsistent across sources \u2014 check manufacturer spec sheets and PDFs first.",
                          );
                        } else if (diff === "instrumented") {
                          guidanceParts.push(
                            "Lab-measured value \u2014 only accept from independent test labs.",
                          );
                        }

                        // Evidence
                        if (evidenceReq && minRefs >= 2) {
                          guidanceParts.push(
                            `Requires ${minRefs}+ independent source references.`,
                          );
                        }

                        // Required/critical
                        if (
                          (reqLvl === "required" || reqLvl === "critical") &&
                          !guidanceParts.some((p) => p.includes("Identity"))
                        ) {
                          guidanceParts.push(
                            "High-priority \u2014 publication blocked if unknown.",
                          );
                        }

                        // Baseline fallback
                        if (guidanceParts.length === 0) {
                          guidanceParts.push(
                            "Extract from the most authoritative available source.",
                          );
                        }

                        const autoNote = guidanceParts.join(" ");
                        const hasExplicit = explicitNote.length > 0;

                        return (
                          <div className="mt-2">
                            <div className="flex items-center gap-2 mb-1">
                              <span
                                className={`${labelCls.replace(" mb-1", "")} flex items-center`}
                              >
                                <span>
                                  Extraction Guidance (sent to LLM)
                                  <Tip
                                    style={{
                                      position: "relative",
                                      left: "-3px",
                                      top: "-4px",
                                    }}
                                    text={STUDIO_TIPS.ai_reasoning_note}
                                  />
                                </span>
                                <B p="ai_assist.reasoning_note" />
                              </span>
                              {!hasExplicit && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded sf-bg-surface-soft-strong sf-text-subtle sf-dk-surface-700 dark:sf-text-muted italic font-medium">
                                  Auto
                                </span>
                              )}
                            </div>
                            <textarea
                              className={`${inputCls} w-full`}
                              rows={3}
                              value={explicitNote}
                              onChange={(e) =>
                                updateField(
                                  selectedKey!,
                                  "ai_assist.reasoning_note",
                                  e.target.value,
                                )
                              }
                              placeholder={`Auto: ${autoNote}`}
                            />
                            {hasExplicit && (
                              <button
                                className="text-[10px] sf-link-accent hover:opacity-80 mt-1"
                                onClick={() =>
                                  updateField(
                                    selectedKey!,
                                    "ai_assist.reasoning_note",
                                    "",
                                  )
                                }
                              >
                                Clear &amp; revert to auto-generated guidance
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </>
                  );
                })()}
              </Section>

              {/* ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Parse ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ */}
              <Section
                title="Parse Rules"
                persistKey={`studio:keyNavigator:section:parse:${category}`}
                titleTooltip={STUDIO_TIPS.key_section_parse}
              >
                {(() => {
                  const pt = strN(
                    currentRule,
                    "parse.template",
                    strN(currentRule, "parse_template"),
                  );
                  const showUnits =
                    pt === "number_with_unit" ||
                    pt === "list_of_numbers_with_unit" ||
                    pt === "list_numbers_or_ranges_with_unit";
                  return (
                    <>
                      <div
                        className={showUnits ? "grid grid-cols-4 gap-3" : ""}
                      >
                        <div>
                          <div className={`${labelCls} flex items-center`}>
                            <span>
                              Parse Template
                              <Tip
                                style={{
                                  position: "relative",
                                  left: "-3px",
                                  top: "-4px",
                                }}
                                text={STUDIO_TIPS.parse_template}
                              />
                            </span>
                            <B p="parse.template" />
                          </div>
                          <select
                            className={`${selectCls} w-full`}
                            value={pt}
                            onChange={(e) =>
                              updateField(
                                selectedKey,
                                "parse.template",
                                e.target.value,
                              )
                            }
                          >
                            <option value="">none</option>
                            <option value="text_field">text_field</option>
                            <option value="number_with_unit">
                              number_with_unit
                            </option>
                            <option value="boolean_yes_no_unk">
                              boolean_yes_no_unk
                            </option>
                            <option value="component_reference">
                              component_reference
                            </option>
                            <option value="date_field">date_field</option>
                            <option value="url_field">url_field</option>
                            <option value="list_of_numbers_with_unit">
                              list_of_numbers_with_unit
                            </option>
                            <option value="list_numbers_or_ranges_with_unit">
                              list_numbers_or_ranges_with_unit
                            </option>
                            <option value="list_of_tokens_delimited">
                              list_of_tokens_delimited
                            </option>
                            <option value="token_list">token_list</option>
                            <option value="text_block">text_block</option>
                          </select>
                        </div>
                        {showUnits ? (
                          <>
                            <div>
                              <div className={`${labelCls} flex items-center`}>
                                <span>
                                  Parse Unit
                                  <Tip
                                    style={{
                                      position: "relative",
                                      left: "-3px",
                                      top: "-4px",
                                    }}
                                    text={STUDIO_TIPS.parse_unit}
                                  />
                                </span>
                                <B p="parse.unit" />
                              </div>
                              <ComboSelect
                                value={strN(currentRule, "parse.unit")}
                                onChange={(v) =>
                                  updateField(selectedKey, "parse.unit", v)
                                }
                                options={UNITS}
                                placeholder="e.g. g"
                              />
                            </div>
                            <div className="col-span-2">
                              <div className={`${labelCls} flex items-center`}>
                                <span>
                                  Unit Accepts
                                  <Tip
                                    style={{
                                      position: "relative",
                                      left: "-3px",
                                      top: "-4px",
                                    }}
                                    text={STUDIO_TIPS.unit_accepts}
                                  />
                                </span>
                                <B p="parse.unit_accepts" />
                              </div>
                              <TagPicker
                                values={arrN(currentRule, "parse.unit_accepts")}
                                onChange={(v) =>
                                  updateField(
                                    selectedKey,
                                    "parse.unit_accepts",
                                    v,
                                  )
                                }
                                suggestions={UNIT_ACCEPTS_SUGGESTIONS}
                                placeholder="g, grams..."
                              />
                            </div>
                          </>
                        ) : null}
                      </div>
                      {showUnits ? (
                        <div className="flex gap-6 flex-wrap">
                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={boolN(
                                currentRule,
                                "parse.allow_unitless",
                              )}
                              onChange={(e) =>
                                updateField(
                                  selectedKey,
                                  "parse.allow_unitless",
                                  e.target.checked,
                                )
                              }
                              className="rounded sf-border-soft"
                            />
                            <span className="text-xs sf-text-muted flex items-center gap-1">
                              Allow unitless
                              <Tip
                                style={{
                                  position: "relative",
                                  left: "-3px",
                                  top: "-4px",
                                }}
                                text={STUDIO_TIPS.allow_unitless}
                              />
                              <B p="parse.allow_unitless" />
                            </span>
                          </label>
                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={boolN(currentRule, "parse.allow_ranges")}
                              onChange={(e) =>
                                updateField(
                                  selectedKey,
                                  "parse.allow_ranges",
                                  e.target.checked,
                                )
                              }
                              className="rounded sf-border-soft"
                            />
                            <span className="text-xs sf-text-muted flex items-center gap-1">
                              Allow ranges
                              <Tip
                                style={{
                                  position: "relative",
                                  left: "-3px",
                                  top: "-4px",
                                }}
                                text={STUDIO_TIPS.allow_ranges}
                              />
                              <B p="parse.allow_ranges" />
                            </span>
                          </label>
                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={boolN(
                                currentRule,
                                "parse.strict_unit_required",
                              )}
                              onChange={(e) =>
                                updateField(
                                  selectedKey,
                                  "parse.strict_unit_required",
                                  e.target.checked,
                                )
                              }
                              className="rounded sf-border-soft"
                            />
                            <span className="text-xs sf-text-muted flex items-center gap-1">
                              Strict unit required
                              <Tip
                                style={{
                                  position: "relative",
                                  left: "-3px",
                                  top: "-4px",
                                }}
                                text={STUDIO_TIPS.strict_unit_required}
                              />
                              <B p="parse.strict_unit_required" />
                            </span>
                          </label>
                        </div>
                      ) : null}
                      {!showUnits && pt ? (
                        <div className="text-xs sf-text-subtle italic mt-1">
                          Unit settings hidden ÃƒÂ¢Ã¢â€šÂ¬"{" "}
                          {pt === "boolean_yes_no_unk"
                            ? "boolean"
                            : pt === "component_reference"
                              ? "component reference"
                              : pt.replace(/_/g, " ")}{" "}
                          template does not use units.
                        </div>
                      ) : null}
                    </>
                  );
                })()}
              </Section>

              {/* ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Enum ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ */}
              <Section
                title="Enum Policy"
                persistKey={`studio:keyNavigator:section:enum:${category}`}
                titleTooltip={STUDIO_TIPS.key_section_enum}
              >
                <EnumConfigurator
                  persistTabKey={`studio:keyNavigator:enumSourceTab:${category}:${selectedKey}`}
                  fieldKey={selectedKey}
                  rule={currentRule}
                  knownValues={knownValues}
                  enumLists={enumLists}
                  parseTemplate={strN(
                    currentRule,
                    "parse.template",
                    strN(currentRule, "parse_template"),
                  )}
                  onUpdate={(path, value) =>
                    updateField(selectedKey, path, value)
                  }
                  renderLabelSuffix={(path) => <B p={path} />}
                  onRunConsistency={async (options) => {
                    if (!selectedKey) return;
                    setEnumConsistencyMessage("");
                    setEnumConsistencyError("");
                    try {
                      const result = (await onRunEnumConsistency(
                        selectedKey,
                        options,
                      )) as {
                        applied?: {
                          changed?: number;
                          mapped?: number;
                          kept?: number;
                          uncertain?: number;
                        };
                        skipped_reason?: string | null;
                      };
                      const changed = Number(result?.applied?.changed || 0);
                      if (changed > 0) {
                        setEnumConsistencyMessage(
                          `Consistency applied ${changed} change${changed === 1 ? "" : "s"}.`,
                        );
                      } else if (result?.skipped_reason) {
                        setEnumConsistencyMessage(
                          `Consistency skipped: ${String(result.skipped_reason).replace(/_/g, " ")}.`,
                        );
                      } else {
                        setEnumConsistencyMessage(
                          "Consistency finished with no changes.",
                        );
                      }
                    } catch (error) {
                      setEnumConsistencyError(
                        (error as Error)?.message || "Consistency run failed.",
                      );
                    }
                  }}
                  consistencyPending={enumConsistencyPending}
                  consistencyMessage={enumConsistencyMessage}
                  consistencyError={enumConsistencyError}
                />
              </Section>

              {/* Components - Component DB & Match Settings */}
              <Section
                title="Components"
                persistKey={`studio:keyNavigator:section:components:${category}`}
                titleTooltip={STUDIO_TIPS.key_section_components}
              >
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <div className={`${labelCls} flex items-center`}>
                      <span>
                        Component DB
                        <Tip
                          style={{
                            position: "relative",
                            left: "-3px",
                            top: "-4px",
                          }}
                          text={STUDIO_TIPS.component_db}
                        />
                      </span>
                      <B p="component.type" />
                    </div>
                    <select
                      className={`${selectCls} w-full`}
                      value={strN(currentRule, "component.type")}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) {
                          updateField(selectedKey, "component", null);
                          // Clear component reference coupling
                          if (
                            strN(currentRule, "parse.template") ===
                            "component_reference"
                          ) {
                            updateField(
                              selectedKey,
                              "parse.template",
                              "text_field",
                            );
                          }
                        } else {
                          updateField(selectedKey, "component", {
                            type: v,
                            source: `component_db.${v}`,
                            allow_new_components: true,
                            require_identity_evidence: true,
                          });
                          // Cascade: Component DB ÃƒÂ¢Ã¢â‚¬Â ' Parse Template + Enum + UI
                          updateField(
                            selectedKey,
                            "parse.template",
                            "component_reference",
                          );
                          updateField(
                            selectedKey,
                            "enum.source",
                            `component_db.${v}`,
                          );
                          updateField(
                            selectedKey,
                            "enum.policy",
                            "open_prefer_known",
                          );
                          updateField(
                            selectedKey,
                            "enum.match.strategy",
                            "alias",
                          );
                          updateField(
                            selectedKey,
                            "ui.input_control",
                            "component_picker",
                          );
                        }
                      }}
                    >
                      <option value="">(none)</option>
                      {COMPONENT_TYPES.map((ct) => (
                        <option key={ct} value={ct}>
                          {ct}
                        </option>
                      ))}
                    </select>
                  </div>
                  {strN(currentRule, "component.type") ? (
                    <>
                      <div className="col-span-3 flex items-end">
                        <div className="flex items-center gap-3 text-xs">
                          <span className="px-2 py-0.5 rounded-full sf-review-ai-pending-badge font-medium">
                            component_reference
                          </span>
                          <span className="sf-text-subtle">
                            Parse:{" "}
                            <span className="font-mono">
                              {strN(currentRule, "parse.template")}
                            </span>
                            {" | "}Enum:{" "}
                            <span className="font-mono">
                              {strN(currentRule, "enum.source")}
                            </span>
                            {" | "}Input:{" "}
                            <span className="font-mono">
                              {strN(currentRule, "ui.input_control")}
                            </span>
                          </span>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
                {strN(currentRule, "component.type")
                  ? (() => {
                      const compType = strN(currentRule, "component.type");
                      const compSource = componentSources.find(
                        (s) => (s.component_type || s.type) === compType,
                      );
                      const NUMERIC_ONLY_POLICIES = [
                        "upper_bound",
                        "lower_bound",
                        "range",
                      ];
                      const derivedProps = (
                        compSource?.roles?.properties || []
                      ).filter((p) => p.field_key);
                      return (
                        <>
                          {/* ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Match Settings ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ */}
                          <div className="mt-3 border-t sf-border-default pt-3">
                            <div className="text-xs font-semibold sf-text-muted mb-2">
                              Match Settings
                            </div>
                            {/* Name Matching */}
                            <div className="text-[11px] font-medium sf-text-subtle mb-1">
                              Name Matching
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <div
                                  className={`${labelCls} flex items-center`}
                                >
                                  <span>
                                    Fuzzy Threshold
                                    <Tip
                                      style={{
                                        position: "relative",
                                        left: "-3px",
                                        top: "-4px",
                                      }}
                                      text={
                                        STUDIO_TIPS.comp_match_fuzzy_threshold
                                      }
                                    />
                                  </span>
                                  <B p="component.match.fuzzy_threshold" />
                                </div>
                                <input
                                  type="number"
                                  min={
                                    STUDIO_NUMERIC_KNOB_BOUNDS.componentMatch
                                      .min
                                  }
                                  max={
                                    STUDIO_NUMERIC_KNOB_BOUNDS.componentMatch
                                      .max
                                  }
                                  step={0.05}
                                  className={`${selectCls} w-full`}
                                  value={numN(
                                    currentRule,
                                    "component.match.fuzzy_threshold",
                                    STUDIO_COMPONENT_MATCH_DEFAULTS.fuzzyThreshold,
                                  )}
                                  onChange={(e) =>
                                    updateField(
                                      selectedKey,
                                      "component.match.fuzzy_threshold",
                                      parseBoundedFloatInput(
                                        e.target.value,
                                        STUDIO_NUMERIC_KNOB_BOUNDS
                                          .componentMatch.min,
                                        STUDIO_NUMERIC_KNOB_BOUNDS
                                          .componentMatch.max,
                                        STUDIO_COMPONENT_MATCH_DEFAULTS.fuzzyThreshold,
                                      ),
                                    )
                                  }
                                />
                              </div>
                              <div>
                                <div
                                  className={`${labelCls} flex items-center`}
                                >
                                  <span>
                                    Name Weight
                                    <Tip
                                      style={{
                                        position: "relative",
                                        left: "-3px",
                                        top: "-4px",
                                      }}
                                      text={STUDIO_TIPS.comp_match_name_weight}
                                    />
                                  </span>
                                  <B p="component.match.name_weight" />
                                </div>
                                <input
                                  type="number"
                                  min={
                                    STUDIO_NUMERIC_KNOB_BOUNDS.componentMatch
                                      .min
                                  }
                                  max={
                                    STUDIO_NUMERIC_KNOB_BOUNDS.componentMatch
                                      .max
                                  }
                                  step={0.05}
                                  className={`${selectCls} w-full`}
                                  value={numN(
                                    currentRule,
                                    "component.match.name_weight",
                                    STUDIO_COMPONENT_MATCH_DEFAULTS.nameWeight,
                                  )}
                                  onChange={(e) =>
                                    updateField(
                                      selectedKey,
                                      "component.match.name_weight",
                                      parseBoundedFloatInput(
                                        e.target.value,
                                        STUDIO_NUMERIC_KNOB_BOUNDS
                                          .componentMatch.min,
                                        STUDIO_NUMERIC_KNOB_BOUNDS
                                          .componentMatch.max,
                                        STUDIO_COMPONENT_MATCH_DEFAULTS.nameWeight,
                                      ),
                                    )
                                  }
                                />
                              </div>
                              <div>
                                <div
                                  className={`${labelCls} flex items-center`}
                                >
                                  <span>
                                    Auto-Accept Score
                                    <Tip
                                      style={{
                                        position: "relative",
                                        left: "-3px",
                                        top: "-4px",
                                      }}
                                      text={
                                        STUDIO_TIPS.comp_match_auto_accept_score
                                      }
                                    />
                                  </span>
                                  <B p="component.match.auto_accept_score" />
                                </div>
                                <input
                                  type="number"
                                  min={
                                    STUDIO_NUMERIC_KNOB_BOUNDS.componentMatch
                                      .min
                                  }
                                  max={
                                    STUDIO_NUMERIC_KNOB_BOUNDS.componentMatch
                                      .max
                                  }
                                  step={0.05}
                                  className={`${selectCls} w-full`}
                                  value={numN(
                                    currentRule,
                                    "component.match.auto_accept_score",
                                    STUDIO_COMPONENT_MATCH_DEFAULTS.autoAcceptScore,
                                  )}
                                  onChange={(e) =>
                                    updateField(
                                      selectedKey,
                                      "component.match.auto_accept_score",
                                      parseBoundedFloatInput(
                                        e.target.value,
                                        STUDIO_NUMERIC_KNOB_BOUNDS
                                          .componentMatch.min,
                                        STUDIO_NUMERIC_KNOB_BOUNDS
                                          .componentMatch.max,
                                        STUDIO_COMPONENT_MATCH_DEFAULTS.autoAcceptScore,
                                      ),
                                    )
                                  }
                                />
                              </div>
                              <div>
                                <div
                                  className={`${labelCls} flex items-center`}
                                >
                                  <span>
                                    Flag Review Score
                                    <Tip
                                      style={{
                                        position: "relative",
                                        left: "-3px",
                                        top: "-4px",
                                      }}
                                      text={
                                        STUDIO_TIPS.comp_match_flag_review_score
                                      }
                                    />
                                  </span>
                                  <B p="component.match.flag_review_score" />
                                </div>
                                <input
                                  type="number"
                                  min={
                                    STUDIO_NUMERIC_KNOB_BOUNDS.componentMatch
                                      .min
                                  }
                                  max={
                                    STUDIO_NUMERIC_KNOB_BOUNDS.componentMatch
                                      .max
                                  }
                                  step={0.05}
                                  className={`${selectCls} w-full`}
                                  value={numN(
                                    currentRule,
                                    "component.match.flag_review_score",
                                    STUDIO_COMPONENT_MATCH_DEFAULTS.flagReviewScore,
                                  )}
                                  onChange={(e) =>
                                    updateField(
                                      selectedKey,
                                      "component.match.flag_review_score",
                                      parseBoundedFloatInput(
                                        e.target.value,
                                        STUDIO_NUMERIC_KNOB_BOUNDS
                                          .componentMatch.min,
                                        STUDIO_NUMERIC_KNOB_BOUNDS
                                          .componentMatch.max,
                                        STUDIO_COMPONENT_MATCH_DEFAULTS.flagReviewScore,
                                      ),
                                    )
                                  }
                                />
                              </div>
                            </div>
                            {/* Property Matching */}
                            <div className="text-[11px] font-medium sf-text-subtle mb-1 mt-3">
                              Property Matching
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <div
                                  className={`${labelCls} flex items-center`}
                                >
                                  <span>
                                    Property Weight
                                    <Tip
                                      style={{
                                        position: "relative",
                                        left: "-3px",
                                        top: "-4px",
                                      }}
                                      text={
                                        STUDIO_TIPS.comp_match_property_weight
                                      }
                                    />
                                  </span>
                                  <B p="component.match.property_weight" />
                                </div>
                                <input
                                  type="number"
                                  min={
                                    STUDIO_NUMERIC_KNOB_BOUNDS.componentMatch
                                      .min
                                  }
                                  max={
                                    STUDIO_NUMERIC_KNOB_BOUNDS.componentMatch
                                      .max
                                  }
                                  step={0.05}
                                  className={`${selectCls} w-full`}
                                  value={numN(
                                    currentRule,
                                    "component.match.property_weight",
                                    STUDIO_COMPONENT_MATCH_DEFAULTS.propertyWeight,
                                  )}
                                  onChange={(e) =>
                                    updateField(
                                      selectedKey,
                                      "component.match.property_weight",
                                      parseBoundedFloatInput(
                                        e.target.value,
                                        STUDIO_NUMERIC_KNOB_BOUNDS
                                          .componentMatch.min,
                                        STUDIO_NUMERIC_KNOB_BOUNDS
                                          .componentMatch.max,
                                        STUDIO_COMPONENT_MATCH_DEFAULTS.propertyWeight,
                                      ),
                                    )
                                  }
                                />
                              </div>
                              <div className="col-span-2">
                                <div className={labelCls}>
                                  Property Keys
                                  <Tip
                                    style={{
                                      position: "relative",
                                      left: "-3px",
                                      top: "-4px",
                                    }}
                                    text={STUDIO_TIPS.comp_match_property_keys}
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  {derivedProps.map((p) => {
                                    const raw =
                                      p.variance_policy || "authoritative";
                                    const fieldRule = editedRules[
                                      p.field_key || ""
                                    ] as Record<string, unknown> | undefined;
                                    const contractType = fieldRule
                                      ? strN(fieldRule, "contract.type")
                                      : "";
                                    const parseTemplate = fieldRule
                                      ? strN(fieldRule, "parse.template")
                                      : "";
                                    const enumSrc = fieldRule
                                      ? strN(fieldRule, "enum.source")
                                      : "";
                                    const isBool = contractType === "boolean";
                                    const hasEnum = !!enumSrc;
                                    const isComponentDb =
                                      hasEnum &&
                                      enumSrc.startsWith("component_db");
                                    const isExtEnum = hasEnum && !isComponentDb;
                                    const isLocked =
                                      contractType !== "number" ||
                                      isBool ||
                                      hasEnum;
                                    const vp =
                                      isLocked &&
                                      NUMERIC_ONLY_POLICIES.includes(raw)
                                        ? "authoritative"
                                        : raw;
                                    const fieldValues =
                                      knownValues[p.field_key || ""] || [];
                                    const lockReason = isBool
                                      ? 'Boolean field ÃƒÂ¢Ã¢â€šÂ¬" variance locked to authoritative'
                                      : isComponentDb
                                        ? `enum.db (${enumSrc.replace(/^component_db\./, "")}) ÃƒÂ¢Ã¢â€šÂ¬" variance locked to authoritative`
                                        : isExtEnum
                                          ? `Enum (${enumSrc.replace(/^(known_values|data_lists)\./, "")}) ÃƒÂ¢Ã¢â€šÂ¬" variance locked to authoritative`
                                          : contractType !== "number" &&
                                              fieldValues.length > 0
                                            ? `Manual values (${fieldValues.length}) ÃƒÂ¢Ã¢â€šÂ¬" variance locked to authoritative`
                                            : isLocked
                                              ? 'String property ÃƒÂ¢Ã¢â€šÂ¬" variance locked to authoritative'
                                              : "";
                                    return (
                                      <div
                                        key={p.field_key}
                                        className="flex items-start gap-2 px-2 py-1 rounded sf-callout sf-callout-info"
                                      >
                                        <span className="text-[11px] font-medium sf-status-text-info shrink-0">
                                          {p.field_key}
                                        </span>
                                        <span
                                          className={`text-[9px] px-1 rounded shrink-0 ${vp === "override_allowed" ? "sf-chip-teal-strong" : isLocked ? "sf-bg-surface-soft-strong sf-text-subtle sf-dk-surface-700 dark:sf-text-muted" : "sf-chip-info-soft"}`}
                                          title={
                                            lockReason ||
                                            (vp === "override_allowed"
                                              ? "Products can override this value without triggering review"
                                              : `Variance policy: ${vp}`)
                                          }
                                        >
                                          {vp === "override_allowed"
                                            ? "override"
                                            : vp}
                                        </span>
                                        {parseTemplate ? (
                                          <span className="text-[9px] px-1 rounded sf-bg-surface-soft sf-text-subtle sf-dk-surface-800 dark:sf-text-muted shrink-0">
                                            {parseTemplate}
                                          </span>
                                        ) : null}
                                        {isBool ? (
                                          <span className="text-[9px] px-1 rounded sf-chip-warning-soft shrink-0">
                                            boolean: yes / no
                                          </span>
                                        ) : null}
                                        {isComponentDb ? (
                                          <span
                                            className="text-[9px] px-1 rounded sf-review-ai-pending-badge shrink-0 truncate max-w-[140px]"
                                            title={enumSrc}
                                          >
                                            enum.db:{" "}
                                            {enumSrc.replace(
                                              /^component_db\./,
                                              "",
                                            )}
                                          </span>
                                        ) : null}
                                        {isExtEnum ? (
                                          <span
                                            className="text-[9px] px-1 rounded sf-review-ai-pending-badge shrink-0 truncate max-w-[140px]"
                                            title={enumSrc}
                                          >
                                            enum:{" "}
                                            {enumSrc.replace(
                                              /^(known_values|data_lists)\./,
                                              "",
                                            )}
                                          </span>
                                        ) : null}
                                        {!isBool &&
                                        !hasEnum &&
                                        isLocked &&
                                        fieldValues.length > 0 &&
                                        fieldValues.length <= 8 ? (
                                          <div className="flex flex-wrap gap-0.5">
                                            <span className="text-[9px] sf-text-subtle mr-0.5">
                                              manual:
                                            </span>
                                            {fieldValues.map((v) => (
                                              <span
                                                key={v}
                                                className="text-[9px] px-1 rounded sf-bg-surface-soft-strong sf-text-muted sf-dk-surface-700 dark:sf-text-subtle"
                                              >
                                                {v}
                                              </span>
                                            ))}
                                          </div>
                                        ) : null}
                                        {!isBool &&
                                        !hasEnum &&
                                        isLocked &&
                                        fieldValues.length > 8 ? (
                                          <span
                                            className="text-[9px] sf-text-subtle"
                                            title={fieldValues.join(", ")}
                                          >
                                            manual: {fieldValues.length} values
                                          </span>
                                        ) : null}
                                      </div>
                                    );
                                  })}
                                  {derivedProps.length === 0 ? (
                                    <span className="text-xs sf-text-subtle italic">
                                      No properties mapped ÃƒÂ¢Ã¢â€šÂ¬" add in Mapping
                                      Studio
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </div>
                        </>
                      );
                    })()
                  : null}
              </Section>

              <Section
                title={
                  <span className="flex items-center gap-1">
                    Cross-Field Constraints
                    <B p="constraints" />
                  </span>
                }
                persistKey={`studio:keyNavigator:section:constraints:${category}`}
                titleTooltip={STUDIO_TIPS.key_section_constraints}
              >
                <KeyConstraintEditor
                  currentKey={selectedKey}
                  constraints={arrN(currentRule, "constraints")}
                  onChange={(next) =>
                    updateField(selectedKey, "constraints", next)
                  }
                  fieldOrder={activeFieldOrder}
                  rules={editedRules}
                />
              </Section>

              <Section
                title="Evidence Requirements"
                persistKey={`studio:keyNavigator:section:evidence:${category}`}
                titleTooltip={STUDIO_TIPS.key_section_evidence}
              >
                <div className="grid grid-cols-3 gap-3 items-start">
                  <div className="space-y-2">
                    <div>
                      <div className={`${labelCls} flex items-center`}>
                        <span>
                          Min Evidence Refs
                          <Tip
                            style={{
                              position: "relative",
                              left: "-3px",
                              top: "-4px",
                            }}
                            text={STUDIO_TIPS.min_evidence_refs}
                          />
                        </span>
                        <B p="evidence.min_evidence_refs" />
                      </div>
                      <input
                        className={`${inputCls} w-full`}
                        type="number"
                        min={STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.min}
                        max={STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.max}
                        value={numN(
                          currentRule,
                          "evidence.min_evidence_refs",
                          numN(
                            currentRule,
                            "min_evidence_refs",
                            STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.fallback,
                          ),
                        )}
                        onChange={(e) =>
                          updateField(
                            selectedKey,
                            "evidence.min_evidence_refs",
                            parseBoundedIntInput(
                              e.target.value,
                              STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.min,
                              STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.max,
                              STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs
                                .fallback,
                            ),
                          )
                        }
                      />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={boolN(
                          currentRule,
                          "evidence.required",
                          boolN(currentRule, "evidence_required", true),
                        )}
                        onChange={(e) =>
                          updateField(
                            selectedKey,
                            "evidence.required",
                            e.target.checked,
                          )
                        }
                        className="rounded sf-border-soft"
                      />
                      <span className="text-xs sf-text-muted flex items-center gap-1">
                        Evidence required
                        <Tip
                          style={{
                            position: "relative",
                            left: "-3px",
                            top: "-4px",
                          }}
                          text={STUDIO_TIPS.evidence_required}
                        />
                        <B p="evidence.required" />
                      </span>
                    </label>
                  </div>
                  <div>
                    <div className={`${labelCls} flex items-center`}>
                      <span>
                        Conflict Policy
                        <Tip
                          style={{
                            position: "relative",
                            left: "-3px",
                            top: "-4px",
                          }}
                          text={STUDIO_TIPS.conflict_policy}
                        />
                      </span>
                      <B p="evidence.conflict_policy" />
                    </div>
                    <select
                      className={`${selectCls} w-full`}
                      value={strN(
                        currentRule,
                        "evidence.conflict_policy",
                        "resolve_by_tier_else_unknown",
                      )}
                      onChange={(e) =>
                        updateField(
                          selectedKey,
                          "evidence.conflict_policy",
                          e.target.value,
                        )
                      }
                    >
                      <option value="resolve_by_tier_else_unknown">
                        resolve_by_tier_else_unknown
                      </option>
                      <option value="prefer_highest_tier">
                        prefer_highest_tier
                      </option>
                      <option value="prefer_most_recent">
                        prefer_most_recent
                      </option>
                      <option value="flag_for_review">flag_for_review</option>
                    </select>
                  </div>
                  <div>
                    <div className={`${labelCls} flex items-center`}>
                      <span>
                        Tier Preference
                        <Tip
                          style={{
                            position: "relative",
                            left: "-3px",
                            top: "-4px",
                          }}
                          text={STUDIO_TIPS.tier_preference}
                        />
                      </span>
                      <B p="evidence.tier_preference" />
                    </div>
                    <TierPicker
                      value={
                        arrN(currentRule, "evidence.tier_preference").length > 0
                          ? arrN(currentRule, "evidence.tier_preference")
                          : ["tier1", "tier2", "tier3"]
                      }
                      onChange={(v) =>
                        updateField(selectedKey, "evidence.tier_preference", v)
                      }
                    />
                  </div>
                </div>
              </Section>

              {/* ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Extraction Hints & Aliases ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ */}
              <Section
                title="Extraction Hints & Aliases"
                persistKey={`studio:keyNavigator:section:uiDisplay:${category}`}
                titleTooltip={STUDIO_TIPS.key_section_ui}
              >
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className={labelCls}>
                      Input Control
                      <Tip
                        style={{
                          position: "relative",
                          left: "-3px",
                          top: "-4px",
                        }}
                        text={STUDIO_TIPS.input_control}
                      />
                    </div>
                    <select
                      className={`${selectCls} w-full`}
                      value={strN(currentRule, "ui.input_control", "text")}
                      onChange={(e) =>
                        updateField(
                          selectedKey,
                          "ui.input_control",
                          e.target.value,
                        )
                      }
                    >
                      <option value="text">text</option>
                      <option value="number">number</option>
                      <option value="select">select</option>
                      <option value="multi_select">multi_select</option>
                      <option value="component_picker">component_picker</option>
                      <option value="checkbox">checkbox</option>
                      <option value="token_list">token_list</option>
                      <option value="text_list">text_list</option>
                      <option value="date">date</option>
                      <option value="url">url</option>
                    </select>
                  </div>
                </div>
                <div>
                  <div className={`${labelCls} flex items-center`}>
                    <span>
                      Tooltip / Guidance
                      <Tip
                        style={{
                          position: "relative",
                          left: "-3px",
                          top: "-4px",
                        }}
                        text={STUDIO_TIPS.tooltip_guidance}
                      />
                    </span>
                    <B p="ui.tooltip_md" />
                  </div>
                  <textarea
                    className={`${inputCls} w-full`}
                    rows={2}
                    value={strN(currentRule, "ui.tooltip_md")}
                    onChange={(e) =>
                      updateField(selectedKey, "ui.tooltip_md", e.target.value)
                    }
                    placeholder="Define how this field should be interpreted..."
                  />
                </div>
                <div>
                  <div className={`${labelCls} flex items-center`}>
                    <span>
                      Aliases
                      <Tip
                        style={{
                          position: "relative",
                          left: "-3px",
                          top: "-4px",
                        }}
                        text={STUDIO_TIPS.aliases}
                      />
                    </span>
                    <B p="aliases" />
                  </div>
                  <TagPicker
                    values={arrN(currentRule, "aliases")}
                    onChange={(v) => updateField(selectedKey, "aliases", v)}
                    placeholder="alternative names for this key"
                  />
                </div>
              </Section>

              {/* ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Search Hints ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ */}
              <Section
                title="Search Hints"
                persistKey={`studio:keyNavigator:section:searchHints:${category}`}
                titleTooltip={STUDIO_TIPS.key_section_search}
              >
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className={`${labelCls} flex items-center`}>
                      <span>
                        Domain Hints
                        <Tip
                          style={{
                            position: "relative",
                            left: "-3px",
                            top: "-4px",
                          }}
                          text={STUDIO_TIPS.domain_hints}
                        />
                      </span>
                      <B p="search_hints.domain_hints" />
                    </div>
                    <TagPicker
                      values={arrN(currentRule, "search_hints.domain_hints")}
                      onChange={(v) =>
                        updateField(selectedKey, "search_hints.domain_hints", v)
                      }
                      suggestions={DOMAIN_HINT_SUGGESTIONS}
                      placeholder="manufacturer, rtings.com..."
                    />
                  </div>
                  <div>
                    <div className={`${labelCls} flex items-center`}>
                      <span>
                        Content Types
                        <Tip
                          style={{
                            position: "relative",
                            left: "-3px",
                            top: "-4px",
                          }}
                          text={STUDIO_TIPS.content_types}
                        />
                      </span>
                      <B p="search_hints.preferred_content_types" />
                    </div>
                    <TagPicker
                      values={arrN(
                        currentRule,
                        "search_hints.preferred_content_types",
                      )}
                      onChange={(v) =>
                        updateField(
                          selectedKey,
                          "search_hints.preferred_content_types",
                          v,
                        )
                      }
                      suggestions={CONTENT_TYPE_SUGGESTIONS}
                      placeholder="spec_sheet, datasheet..."
                    />
                  </div>
                </div>
                <div>
                  <div className={`${labelCls} flex items-center`}>
                    <span>
                      Query Terms
                      <Tip
                        style={{
                          position: "relative",
                          left: "-3px",
                          top: "-4px",
                        }}
                        text={STUDIO_TIPS.query_terms}
                      />
                    </span>
                    <B p="search_hints.query_terms" />
                  </div>
                  <TagPicker
                    values={arrN(currentRule, "search_hints.query_terms")}
                    onChange={(v) =>
                      updateField(selectedKey, "search_hints.query_terms", v)
                    }
                    placeholder="alternative search terms"
                  />
                </div>
              </Section>

              <details
                className="mt-2"
                open={showFullRuleJson}
                onToggle={(event) =>
                  setShowFullRuleJson(event.currentTarget.open)
                }
              >
                <summary className="text-xs sf-text-subtle cursor-pointer">
                  Full Rule JSON
                </summary>
                <div className="mt-2">
                  <JsonViewer data={currentRule} maxDepth={3} />
                </div>
              </details>
            </div>
          ) : (
            <div className="text-sm sf-text-subtle mt-12 text-center">
              Select a key from the list to configure its field rule. Each key
              has Contract, Priority, Parse, Enum, Evidence, UI, and Search
              settings.
            </div>
          )}
        </div>
      </div>

      {bulkOpen && (
        <div className="fixed inset-0 z-40 bg-black/45 p-4 flex items-start md:items-center justify-center">
          <div className="w-full max-w-5xl max-h-[92vh] overflow-hidden bg-white sf-dk-surface-800 rounded border sf-border-default shadow-2xl flex flex-col">
            <div className="px-4 py-3 border-b sf-border-default flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold">
                  Bulk Paste Keys + Labels
                </h4>
                <p className="text-xs sf-text-muted mt-0.5">
                  Paste two columns: <strong>Key</strong> and{" "}
                  <strong>Label</strong> (tab-separated from your spreadsheet
                  tool).
                </p>
              </div>
              <button
                onClick={() => {
                  setBulkOpen(false);
                  setBulkGridRows([]);
                  setBulkGroup("");
                }}
                className="sf-text-subtle hover:sf-text-muted text-lg leading-snug"
                aria-label="Close bulk paste modal"
              >
                &times;
              </button>
            </div>

            <div className="p-4 space-y-3 overflow-auto">
              <div className="grid grid-cols-1 md:grid-cols-[260px,1fr] gap-3 items-end">
                <div>
                  <label className={labelCls}>Group</label>
                  <select
                    value={bulkGroup}
                    onChange={(e) => setBulkGroup(e.target.value)}
                    className={`${selectCls} w-full`}
                  >
                    <option value="">ungrouped</option>
                    {existingGroups.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="text-xs sf-text-muted">
                  Type or paste two columns from a spreadsheet. Label is
                  optional (auto-generated from key).
                </div>
              </div>

              <BulkPasteGrid
                col1Header="Key"
                col2Header="Label"
                col1Placeholder="sensor_dpi_max"
                col2Placeholder="Max DPI"
                rows={bulkGridRows}
                onChange={setBulkGridRows}
                col1Mono
              />

              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2 py-1 rounded sf-chip-success">
                  Ready: {bulkCounts.ready}
                </span>
                <span className="px-2 py-1 rounded sf-chip-info">
                  Existing: {bulkCounts.existing}
                </span>
                <span className="px-2 py-1 rounded sf-chip-warning-soft">
                  Duplicates: {bulkCounts.duplicate}
                </span>
                <span className="px-2 py-1 rounded sf-chip-danger">
                  Invalid: {bulkCounts.invalid}
                </span>
                <span className="px-2 py-1 rounded sf-bg-surface-soft-strong sf-dk-surface-700 sf-text-muted sf-dk-fg-200">
                  Rows: {bulkPreviewRows.length}
                </span>
              </div>

              {bulkPreviewRows.length > 0 && (
                <div className="border sf-border-default rounded overflow-auto max-h-[24vh]">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 sf-bg-surface-soft sf-dk-surface-900a70 border-b sf-border-default">
                      <tr>
                        <th className="text-left px-2 py-1.5 w-12">#</th>
                        <th className="text-left px-2 py-1.5">Key</th>
                        <th className="text-left px-2 py-1.5">Label</th>
                        <th className="text-left px-2 py-1.5 w-36">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkPreviewRows.map((row) => {
                        const statusCls =
                          row.status === "ready"
                            ? "sf-chip-success"
                            : row.status === "duplicate_existing"
                              ? "sf-chip-info"
                              : row.status === "duplicate_in_paste"
                                ? "sf-chip-warning-soft"
                                : "sf-chip-danger";
                        return (
                          <tr
                            key={`${row.rowNumber}-${row.key}-${row.raw}`}
                            className="sf-divider-soft"
                          >
                            <td className="px-2 py-1.5 sf-text-muted">
                              {row.rowNumber}
                            </td>
                            <td className="px-2 py-1.5 font-mono">
                              {row.key || (
                                <span className="italic sf-text-subtle">
                                  &mdash;
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-1.5">
                              {row.label || (
                                <span className="italic sf-text-subtle">
                                  &mdash;
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-1.5">
                              <span
                                className={`inline-block px-2 py-0.5 rounded-full ${statusCls}`}
                              >
                                {row.reason}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="px-4 py-3 border-t sf-border-default flex items-center justify-between gap-2">
              <div className="text-xs sf-text-muted">
                Ready rows will be added to group{" "}
                <strong>{bulkGroup || "ungrouped"}</strong>.
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setBulkOpen(false);
                    setBulkGridRows([]);
                    setBulkGroup("");
                  }}
                  className={btnSecondary}
                >
                  Close
                </button>
                <button
                  onClick={handleBulkImport}
                  disabled={bulkReadyRows.length === 0}
                  className={btnPrimary}
                >
                  {`Import ${bulkReadyRows.length} Ready Row${bulkReadyRows.length === 1 ? "" : "s"}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Field Contract ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬
// ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Compile & Reports ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬
 
