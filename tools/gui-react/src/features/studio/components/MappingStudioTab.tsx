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
import type { StudioPageActivePanelMappingProps as MappingStudioTabProps } from "./studioPagePanelContracts";
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
    setDataLists(seededLists);
    const seededPayload: StudioConfig = {
      ...wbMap,
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
    return {
      ...wbMap,
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

  useEffect(
    () => () => {
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
                {dataLists.map((dl, idx) => (
                  <EditableDataList
                    key={idx}
                    entry={dl}
                    index={idx}
                    isDuplicate={duplicateDataListFields.has(dl.field)}
                    onUpdate={(updates) => updateDataList(idx, updates)}
                    onRemove={() => removeDataList(idx)}
                  />
                ))}
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

// ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Constraint Editor ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬
function ConstraintEditor({
  constraints,
  onChange,
  componentPropertyKeys,
  fieldOrder,
  rules,
}: {
  constraints: string[];
  onChange: (next: string[]) => void;
  componentPropertyKeys: string[];
  fieldOrder: string[];
  rules: Record<string, FieldRule>;
}) {
  const [adding, setAdding] = useState(false);
  const [leftField, setLeftField] = useState("");
  const [op, setOp] = useState<string>("<=");
  const [rightField, setRightField] = useState("");

  function addConstraint() {
    const expr = `${leftField} ${op} ${rightField}`.trim();
    if (!leftField || !rightField) return;
    onChange([...constraints, expr]);
    setLeftField("");
    setOp("<=");
    setRightField("");
    setAdding(false);
  }

  function removeConstraint(idx: number) {
    onChange(constraints.filter((_, i) => i !== idx));
  }

  // Left side: component property keys from this source
  const componentOptions = useMemo(() => {
    return componentPropertyKeys.map((key) => {
      return {
        value: key,
        label: displayLabel(key, rules[key] as Record<string, unknown>),
      };
    });
  }, [componentPropertyKeys, rules]);

  // Right side: product field keys
  const productOptions = useMemo(() => {
    return fieldOrder
      .filter((k) => !k.startsWith("__grp::"))
      .map((key) => {
        return {
          value: key,
          label: displayLabel(key, rules[key] as Record<string, unknown>),
        };
      });
  }, [fieldOrder, rules]);

  return (
    <div className="px-3 py-1.5 border-t sf-border-default text-[11px]">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="sf-text-muted inline-flex items-center gap-0.5">
          Constraints
          <Tip
            style={{ position: "relative", left: "-3px", top: "-4px" }}
            text={STUDIO_TIPS.comp_constraints}
          />
          <StaticBadges fieldPath="constraints" />
        </span>
        {constraints.length > 0 ? (
          <span className="text-[9px] sf-chip-warning-soft px-1.5 py-0.5 rounded font-medium">
            Migrate to Key Navigator
          </span>
        ) : null}
        {constraints.map((c, ci) => (
          <span
            key={ci}
            className="inline-flex items-center gap-1 sf-chip-confirm px-1.5 py-0.5 rounded text-[10px]"
          >
            {c}
            <button
              onClick={() => removeConstraint(ci)}
              className="sf-status-text-warning sf-status-warning-hover ml-0.5"
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
        <div className="flex items-center gap-1.5 mt-1.5">
          <select
            className={`${selectCls} text-[11px] py-0.5 min-w-0`}
            value={leftField}
            onChange={(e) => setLeftField(e.target.value)}
          >
            <option value="">Component prop...</option>
            {componentOptions.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <select
            className={`${selectCls} text-[11px] py-0.5 w-14`}
            value={op}
            onChange={(e) => setOp(e.target.value)}
          >
            {CONSTRAINT_OPS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <select
            className={`${selectCls} text-[11px] py-0.5 min-w-0`}
            value={rightField}
            onChange={(e) => setRightField(e.target.value)}
          >
            <option value="">Product field...</option>
            {productOptions.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <button
            onClick={addConstraint}
            disabled={!leftField || !rightField}
            className="text-[10px] sf-status-text-success hover:opacity-80 disabled:opacity-40 font-medium"
          >
            Add
          </button>
          <button
            onClick={() => setAdding(false)}
            className="text-[10px] sf-text-subtle hover:sf-text-muted"
          >
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Range constraint pill grouping ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬
// ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Key Constraint Editor (Key Navigator) ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬

function EditableDataList({
  entry,
  index,
  isDuplicate,
  onUpdate,
  onRemove,
}: {
  entry: DataListEntry;
  index: number;
  isDuplicate: boolean;
  onUpdate: (updates: Partial<DataListEntry>) => void;
  onRemove: () => void;
}) {
  const dlKey = entry.field || `idx-${index}`;
  const [expanded, toggleExpanded, setExpanded] = usePersistedToggle(
    `studio:dataList:${dlKey}:expanded`,
    false,
  );
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [showAiSections, toggleAiSections] = usePersistedToggle(
    `studio:dataList:${dlKey}:ai`,
    false,
  );

  const valueCount = entry.manual_values.length;
  const listPriority = normalizePriorityProfile(entry.priority);
  const listAiAssist = normalizeAiAssistConfig(entry.ai_assist);
  const listTitle = entry.field
    ? displayLabel(entry.field)
    : `Enum ${index + 1}`;
  function updatePriority(updates: Partial<PriorityProfile>) {
    onUpdate({ priority: { ...listPriority, ...updates } });
  }
  function updateAiAssist(updates: Partial<AiAssistConfig>) {
    onUpdate({ ai_assist: { ...listAiAssist, ...updates } });
  }

  // Collapsed view
  if (!expanded) {
    return (
      <div className="border sf-border-default rounded sf-bg-surface-soft sf-dk-surface-750">
        <div className="w-full flex items-center gap-2 px-3 py-2">
          <button
            type="button"
            onClick={() => {
              setExpanded(true);
              setConfirmingRemove(false);
            }}
            className="relative flex-1 min-w-0 py-2 text-sm font-semibold text-left sf-text-muted sf-dk-fg-100 hover:sf-text-primary sf-dk-hover-fg-white"
          >
            <span className="absolute left-0 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-5 h-5 border sf-border-soft rounded text-xs font-medium sf-text-muted">
              +
            </span>
            <span className="w-full text-left px-6 truncate">{listTitle}</span>
            <span className="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center gap-2">
              {valueCount > 0 ? (
                <span className="text-xs sf-text-muted">
                  {valueCount} values
                </span>
              ) : null}
              {isDuplicate ? (
                <span className="text-xs sf-danger-text-soft font-medium">
                  Duplicate!
                </span>
              ) : null}
            </span>
          </button>
          <div className="flex items-center gap-2">
            {confirmingRemove ? (
              <>
                <button
                  type="button"
                  onClick={() => setConfirmingRemove(false)}
                  className="px-2 py-1 text-[11px] rounded border sf-border-soft bg-white sf-dk-surface-800 sf-text-muted sf-hover-bg-surface-soft sf-dk-hover-surface-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmingRemove(false);
                    onRemove();
                  }}
                  className={`${btnDanger} !px-2 !py-1 text-[11px]`}
                >
                  Confirm remove
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingRemove(true)}
                className="px-2 py-1 text-[11px] rounded sf-danger-action-soft"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border sf-border-default rounded p-3 space-y-3 sf-bg-surface-soft sf-dk-surface-750">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setExpanded(false);
            setConfirmingRemove(false);
          }}
          className="relative flex-1 min-w-0 py-2 text-sm font-semibold text-left sf-text-muted sf-dk-fg-100 hover:sf-text-primary sf-dk-hover-fg-white"
        >
          <span className="absolute left-0 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-5 h-5 border sf-border-soft rounded text-xs font-medium sf-text-muted">
            -
          </span>
          <span className="w-full text-left px-6 truncate">{listTitle}</span>
          <span className="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center gap-2">
            {valueCount > 0 ? (
              <span className="text-xs sf-text-muted">{valueCount} values</span>
            ) : null}
            {isDuplicate ? (
              <span className="text-xs sf-danger-text-soft font-medium">
                Duplicate!
              </span>
            ) : null}
          </span>
        </button>
        <div className="flex items-center gap-2">
          {confirmingRemove ? (
            <>
              <button
                type="button"
                onClick={() => setConfirmingRemove(false)}
                className="px-2 py-1 text-[11px] rounded border sf-border-soft bg-white sf-dk-surface-800 sf-text-muted sf-hover-bg-surface-soft sf-dk-hover-surface-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmingRemove(false);
                  onRemove();
                }}
                className={`${btnDanger} !px-2 !py-1 text-[11px]`}
              >
                Confirm remove
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingRemove(true)}
              className="px-2 py-1 text-[11px] rounded sf-danger-action-soft"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {isDuplicate && (
        <div className="text-xs sf-callout sf-callout-danger rounded px-2 py-1">
          Warning: Another data list uses the same field name "{entry.field}".
          Each field should have only one list.
        </div>
      )}

      {/* Identity row: field name + normalize */}
      <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
        <div>
          <label className={labelCls}>
            Field Name{" "}
            <Tip
              style={{ position: "relative", left: "-3px", top: "-4px" }}
              text={STUDIO_TIPS.data_list_field}
            />
          </label>
          <input
            className={inputCls + " w-full"}
            value={entry.field}
            onChange={(e) =>
              onUpdate({
                field: e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9_]/g, "_")
                  .replace(/^_+|_+$/g, ""),
              })
            }
            placeholder="e.g. form_factor"
          />
        </div>
        <div>
          <label className={labelCls}>
            Normalize{" "}
            <Tip
              style={{ position: "relative", left: "-3px", top: "-4px" }}
              text={STUDIO_TIPS.data_list_normalize}
            />
          </label>
          <select
            className={selectCls + " w-full"}
            value={entry.normalize}
            onChange={(e) => onUpdate({ normalize: e.target.value })}
          >
            {NORMALIZE_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* List review priority / effort */}
      <button
        type="button"
        onClick={() => toggleAiSections()}
        className="w-full flex items-center gap-2 mb-2"
      >
        <span className="inline-flex items-center justify-center w-5 h-5 border sf-border-soft rounded text-xs font-medium sf-text-muted">
          {showAiSections ? "-" : "+"}
        </span>
        <span className="text-xs font-semibold sf-text-muted">
          AI Review Priority
        </span>
      </button>
      {showAiSections ? (
        <div className="border sf-border-default dark:sf-border-soft rounded p-2.5 bg-white sf-dk-surface-800a40">
          <div className="grid grid-cols-4 gap-2">
            <div>
              <label className={labelCls}>
                Required Level{" "}
                <Tip
                  style={{ position: "relative", left: "-3px", top: "-4px" }}
                  text={STUDIO_TIPS.required_level}
                />
              </label>
              <select
                className={selectCls + " w-full"}
                value={listPriority.required_level}
                onChange={(e) =>
                  updatePriority({ required_level: e.target.value })
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
              <label className={labelCls}>
                Availability{" "}
                <Tip
                  style={{ position: "relative", left: "-3px", top: "-4px" }}
                  text={STUDIO_TIPS.availability}
                />
              </label>
              <select
                className={selectCls + " w-full"}
                value={listPriority.availability}
                onChange={(e) =>
                  updatePriority({ availability: e.target.value })
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
              <label className={labelCls}>
                Difficulty{" "}
                <Tip
                  style={{ position: "relative", left: "-3px", top: "-4px" }}
                  text={STUDIO_TIPS.difficulty}
                />
              </label>
              <select
                className={selectCls + " w-full"}
                value={listPriority.difficulty}
                onChange={(e) => updatePriority({ difficulty: e.target.value })}
              >
                <option value="easy">easy</option>
                <option value="medium">medium</option>
                <option value="hard">hard</option>
                <option value="instrumented">instrumented</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>
                Effort (1-10){" "}
                <Tip
                  style={{ position: "relative", left: "-3px", top: "-4px" }}
                  text={STUDIO_TIPS.effort}
                />
              </label>
              <input
                type="number"
                min={STUDIO_NUMERIC_KNOB_BOUNDS.priorityEffort.min}
                max={STUDIO_NUMERIC_KNOB_BOUNDS.priorityEffort.max}
                className={inputCls + " w-full"}
                value={listPriority.effort}
                onChange={(e) =>
                  updatePriority({
                    effort: parseBoundedIntInput(
                      e.target.value,
                      STUDIO_NUMERIC_KNOB_BOUNDS.priorityEffort.min,
                      STUDIO_NUMERIC_KNOB_BOUNDS.priorityEffort.max,
                      STUDIO_NUMERIC_KNOB_BOUNDS.priorityEffort.fallback,
                    ),
                  })
                }
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* List-level AI assist (same controls as Key Navigator) */}
      <button
        type="button"
        onClick={() => toggleAiSections()}
        className="w-full flex items-center gap-2 mb-2 mt-2"
      >
        <span className="inline-flex items-center justify-center w-5 h-5 border sf-border-soft rounded text-xs font-medium sf-text-muted">
          {showAiSections ? "-" : "+"}
        </span>
        <span className="text-xs font-semibold sf-text-muted">AI Assist</span>
      </button>
      {showAiSections
        ? (() => {
            const explicitMode = listAiAssist.mode || "";
            const strategy = listAiAssist.model_strategy || "auto";
            const explicitCalls = listAiAssist.max_calls || 0;
            const reqLvl = listPriority.required_level;
            const diff = listPriority.difficulty;
            const effort = listPriority.effort;

            const derivedMode = deriveAiModeFromPriority(listPriority);
            const effectiveMode = explicitMode || derivedMode;

            const derivedCalls = deriveAiCallsFromEffort(effort);
            const effectiveCalls =
              explicitCalls > 0 ? Math.min(explicitCalls, 10) : derivedCalls;

            const modeToModel: Record<
              string,
              { model: string; reasoning: boolean }
            > = {
              off: { model: "none", reasoning: false },
              advisory: { model: "gpt-5-low", reasoning: false },
              planner: {
                model: "gpt-5-low -> gpt-5.2-high on escalation",
                reasoning: false,
              },
              judge: { model: "gpt-5.2-high", reasoning: true },
            };
            let effectiveModel = modeToModel[effectiveMode] || modeToModel.off;
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

            const explicitNote = listAiAssist.reasoning_note || "";
            const autoNote = [
              `List review for "${entry.field || "list"}".`,
              `Apply ${effectiveMode} mode with evidence-first extraction.`,
              `Required level ${reqLvl}, availability ${listPriority.availability}, difficulty ${diff}, effort ${effort}.`,
              "Return normalized values that match the list policy and preserve supporting evidence refs.",
            ].join(" ");
            const hasExplicit = explicitNote.length > 0;

            return (
              <div className="border sf-border-default dark:sf-border-soft rounded p-2.5 bg-white sf-dk-surface-800a40">
                <h4 className="text-xs font-semibold sf-text-muted mb-2">
                  AI Assist
                  <Tip
                    style={{ position: "relative", left: "-3px", top: "-4px" }}
                    text={STUDIO_TIPS.ai_mode}
                  />
                </h4>
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className={labelCls}>
                      Mode
                      <Tip
                        style={{
                          position: "relative",
                          left: "-3px",
                          top: "-4px",
                        }}
                        text={STUDIO_TIPS.ai_mode}
                      />
                    </label>
                    <select
                      className={selectCls + " w-full"}
                      value={explicitMode}
                      onChange={(e) =>
                        updateAiAssist({ mode: e.target.value || null })
                      }
                    >
                      <option value="">auto ({derivedMode})</option>
                      <option value="off">
                        off - no LLM, deterministic only
                      </option>
                      <option value="advisory">
                        advisory - gpt-5-low, single pass
                      </option>
                      <option value="planner">
                        planner - gpt-5-low -&gt; gpt-5.2-high
                      </option>
                      <option value="judge">
                        judge - gpt-5.2-high, reasoning
                      </option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>
                      Model Strategy
                      <Tip
                        style={{
                          position: "relative",
                          left: "-3px",
                          top: "-4px",
                        }}
                        text={STUDIO_TIPS.ai_model_strategy}
                      />
                    </label>
                    <select
                      className={selectCls + " w-full"}
                      value={strategy}
                      onChange={(e) =>
                        updateAiAssist({ model_strategy: e.target.value })
                      }
                    >
                      <option value="auto">auto - mode decides model</option>
                      <option value="force_fast">
                        force_fast - always gpt-5-low
                      </option>
                      <option value="force_deep">
                        force_deep - always gpt-5.2-high
                      </option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>
                      Max Calls
                      <Tip
                        text={STUDIO_TIPS.ai_max_calls}
                        style={{
                          position: "relative",
                          left: "-3px",
                          top: "-4px",
                        }}
                      />
                    </label>
                    <input
                      className={inputCls + " w-full"}
                      type="number"
                      min={STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxCalls.min}
                      max={STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxCalls.max}
                      value={explicitCalls || ""}
                      onChange={(e) => {
                        const parsed = parseOptionalPositiveIntInput(
                          e.target.value,
                        );
                        updateAiAssist({
                          max_calls:
                            parsed === null
                              ? null
                              : clampNumber(
                                  parsed,
                                  STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxCalls.min,
                                  STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxCalls.max,
                                ),
                        });
                      }}
                      placeholder={`auto (${derivedCalls})`}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>
                      Max Tokens
                      <Tip
                        style={{
                          position: "relative",
                          left: "-3px",
                          top: "-4px",
                        }}
                        text={STUDIO_TIPS.ai_max_tokens}
                      />
                    </label>
                    <input
                      className={inputCls + " w-full"}
                      type="number"
                      min={STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxTokens.min}
                      max={STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxTokens.max}
                      step={1024}
                      value={listAiAssist.max_tokens || ""}
                      onChange={(e) => {
                        const parsed = parseOptionalPositiveIntInput(
                          e.target.value,
                        );
                        updateAiAssist({
                          max_tokens:
                            parsed === null
                              ? null
                              : clampNumber(
                                  parsed,
                                  STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxTokens.min,
                                  STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxTokens.max,
                                ),
                        });
                      }}
                      placeholder={`auto (${effectiveMode === "off" ? "0" : effectiveMode === "advisory" ? "4096" : effectiveMode === "planner" ? "8192" : "16384"})`}
                    />
                  </div>
                </div>

                <div className="mt-2 text-[11px] sf-bg-surface-soft sf-dk-surface-800a50 rounded p-2 border sf-border-default space-y-1">
                  <div className="text-[10px] font-semibold sf-text-subtle mb-1">
                    Effective AI Configuration
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="sf-text-subtle w-14">Mode:</span>
                    <span className="sf-text-muted">{effectiveMode}</span>
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
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="sf-text-subtle w-14">Budget:</span>
                    <span className="sf-text-muted">
                      {effectiveMode === "off" ? "0" : effectiveCalls} call
                      {effectiveCalls !== 1 ? "s" : ""}
                    </span>
                    {!explicitCalls && effectiveMode !== "off" && (
                      <span className="sf-text-subtle italic text-[10px]">
                        (auto from effort {effort})
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={labelCls.replace(" mb-1", "")}>
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
                      updateAiAssist({ reasoning_note: e.target.value })
                    }
                    placeholder={`Auto: ${autoNote}`}
                  />
                  {hasExplicit && (
                    <button
                      className="text-[10px] sf-link-accent hover:opacity-80 mt-1"
                      onClick={() => updateAiAssist({ reasoning_note: "" })}
                    >
                      Clear &amp; revert to auto-generated guidance
                    </button>
                  )}
                </div>
              </div>
            );
          })()
        : null}

      {/* Manual values */}
      <div>
        <label className={labelCls}>
          Values{" "}
          <Tip
            style={{ position: "relative", left: "-3px", top: "-4px" }}
            text={STUDIO_TIPS.data_list_manual_values}
          />
        </label>
        <TagPicker
          values={entry.manual_values}
          onChange={(v) => onUpdate({ manual_values: v })}
          placeholder="Type a value and press Enter..."
        />
      </div>
    </div>
  );
}

// ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Read-only system badges for Mapping Studio ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬
// ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Editable Component Source ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬

function EditableComponentSource({
  index,
  source,
  onUpdate,
  onRemove,
  rules,
  fieldOrder,
  knownValues,
}: {
  index: number;
  source: ComponentSource;
  onUpdate: (updates: Partial<ComponentSource>) => void;
  onRemove: () => void;
  rules: Record<string, FieldRule>;
  fieldOrder: string[];
  knownValues: Record<string, string[]>;
}) {
  const roles = source.roles || {
    maker: "",
    aliases: [],
    links: [],
    properties: [],
  };
  const sourcePriority = normalizePriorityProfile(source.priority);
  const sourceAiAssist = normalizeAiAssistConfig(source.ai_assist);
  const [activeRoles, setActiveRoles] = useState<Set<RoleId>>(() => {
    const set = new Set<RoleId>();
    if (roles.maker) set.add("maker");
    if (Array.isArray(roles.aliases) && roles.aliases.length > 0)
      set.add("aliases");
    if (Array.isArray(roles.links) && roles.links.length > 0) set.add("links");
    if (Array.isArray(roles.properties) && roles.properties.length > 0)
      set.add("properties");
    return set;
  });

  const [propertyRows, setPropertyRows] = useState<PropertyMapping[]>(() => {
    if (!Array.isArray(roles.properties)) return [];
    return (roles.properties as unknown as typeof roles.properties).map((p) =>
      migrateProperty(p, rules),
    );
  });
  const [pendingFieldKey, setPendingFieldKey] = useState("");
  const csKey = source.component_type || source.type || `idx-${index}`;
  const [showAiSections, toggleCsAiSections] = usePersistedToggle(
    `studio:compSource:${csKey}:ai`,
    false,
  );
  const [showTrackedRoles, toggleTrackedRoles] = usePersistedToggle(
    `studio:compSource:${csKey}:roles`,
    false,
  );
  const [showAttributes, toggleAttributes] = usePersistedToggle(
    `studio:compSource:${csKey}:attrs`,
    false,
  );

  // Group field keys by ui.group for the field key picker
  const fieldKeyGroups = useMemo(() => {
    const groups: Record<
      string,
      { key: string; label: string; type: string }[]
    > = {};
    const usedKeys = new Set(propertyRows.map((r) => r.field_key));
    for (const key of fieldOrder) {
      if (key.startsWith("__grp::") || usedKeys.has(key)) continue;
      const rule = rules[key] || {};
      const ui = rule.ui || {};
      const contract = rule.contract || {};
      const group = String(ui.group || rule.group || "other");
      if (!groups[group]) groups[group] = [];
      groups[group].push({
        key,
        label: displayLabel(key, rule as Record<string, unknown>),
        type: String(contract.type || "string"),
      });
    }
    return groups;
  }, [fieldOrder, rules, propertyRows]);

  // Get inherited info from field rules for a field key
  function getInheritedInfo(fieldKey: string): {
    type: string;
    unit: string;
    template: string;
    evidenceRefs: number;
    constraints: string[];
    enumPolicy: string;
    enumSource: string;
    isBool: boolean;
    fieldValues: string[];
  } {
    const rule = rules[fieldKey] || {};
    const contract = rule.contract || {};
    const parse = (rule as Record<string, unknown>).parse as
      | Record<string, unknown>
      | undefined;
    const evidence = (rule as Record<string, unknown>).evidence as
      | Record<string, unknown>
      | undefined;
    const ruleAny = rule as Record<string, unknown>;
    const constraints = Array.isArray(ruleAny.constraints)
      ? ruleAny.constraints.map(String)
      : [];
    const contractAny = contract as Record<string, unknown>;
    const enumObj = ruleAny.enum as Record<string, unknown> | undefined;
    const enumPolicy = String(
      enumObj?.policy ||
        contractAny.enum_policy ||
        contractAny.list_policy ||
        "",
    );
    const enumSource = String(
      enumObj?.source ||
        contractAny.enum_source ||
        contractAny.list_source ||
        contractAny.data_list ||
        "",
    );
    const contractType = String(contract.type || "string");
    const isBool = contractType === "boolean";
    const fieldValues = knownValues[fieldKey] || [];
    return {
      type: contractType,
      unit: String(contract.unit || ""),
      template: String(parse?.template || parse?.parse_template || ""),
      evidenceRefs: Number(
        evidence?.min_refs || evidence?.min_evidence_refs || 0,
      ),
      constraints,
      enumPolicy,
      enumSource,
      isBool,
      fieldValues,
    };
  }

  function updateRoles(updates: Partial<typeof roles>) {
    onUpdate({ roles: { ...roles, ...updates } });
  }

  function updatePriority(updates: Partial<PriorityProfile>) {
    onUpdate({ priority: { ...sourcePriority, ...updates } });
  }
  function updateAiAssist(updates: Partial<AiAssistConfig>) {
    onUpdate({ ai_assist: { ...sourceAiAssist, ...updates } });
  }

  function removePropertyRow(pidx: number) {
    const next = propertyRows.filter((_, i) => i !== pidx);
    setPropertyRows(next);
    updateRoles({ properties: next as unknown as typeof roles.properties });
  }

  function updatePropertyField(
    pidx: number,
    updates: Partial<PropertyMapping>,
  ) {
    const next = propertyRows.map((row, i) =>
      i === pidx ? { ...row, ...updates } : row,
    );
    setPropertyRows(next);
    updateRoles({ properties: next as unknown as typeof roles.properties });
  }

  function selectFieldKey(pidx: number, fieldKey: string) {
    updatePropertyField(pidx, { field_key: fieldKey });
  }

  function addPropertyFromFieldKey(fieldKey: string) {
    if (propertyRows.some((r) => r.field_key === fieldKey)) return;
    const newRow: PropertyMapping = {
      field_key: fieldKey,
      variance_policy: "authoritative",
      tolerance: null,
    };
    const next = [...propertyRows, newRow];
    setPropertyRows(next);
    updateRoles({ properties: next as unknown as typeof roles.properties });
  }

  const compType = source.component_type || source.type || "";
  const [expanded, toggleCsExpanded, setExpanded] = usePersistedToggle(
    `studio:compSource:${compType || `idx-${index}`}:expanded`,
    false,
  );
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const sourceTitle = compType ? displayLabel(compType) : `Source ${index + 1}`;
  const trackedRoleCount = ["maker", "aliases", "links"].filter((role) =>
    activeRoles.has(role as RoleId),
  ).length;
  const componentSummary = [
    `${propertyRows.length} attribute${propertyRows.length !== 1 ? "s" : ""}`,
    `${trackedRoleCount} tracked role${trackedRoleCount !== 1 ? "s" : ""}`,
  ];

  if (!expanded) {
    return (
      <div className="border sf-border-default rounded sf-bg-surface-soft sf-dk-surface-750">
        <div className="w-full flex items-center gap-2 px-3 py-2">
          <button
            type="button"
            onClick={() => {
              setExpanded(true);
              setConfirmingRemove(false);
            }}
            className="relative flex-1 min-w-0 py-2 text-sm font-semibold text-left sf-text-muted sf-dk-fg-100 hover:sf-text-primary sf-dk-hover-fg-white"
          >
            <span className="absolute left-0 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-5 h-5 border sf-border-soft rounded text-xs font-medium sf-text-muted">
              +
            </span>
            <span className="w-full text-left px-6 truncate">
              {sourceTitle}
            </span>
            <span className="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center gap-2">
              {componentSummary.length > 0 ? (
                <span className="text-xs sf-text-muted">
                  {componentSummary.slice(0, 2).join(" | ")}
                </span>
              ) : null}
            </span>
          </button>
          <div className="flex items-center gap-2">
            {confirmingRemove ? (
              <>
                <button
                  type="button"
                  onClick={() => setConfirmingRemove(false)}
                  className="px-2 py-1 text-[11px] rounded border sf-border-soft bg-white sf-dk-surface-800 sf-text-muted sf-hover-bg-surface-soft sf-dk-hover-surface-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmingRemove(false);
                    onRemove();
                  }}
                  className={`${btnDanger} !px-2 !py-1 text-[11px]`}
                >
                  Confirm remove
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingRemove(true)}
                className="px-2 py-1 text-[11px] rounded sf-danger-action-soft"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border sf-border-default rounded p-4 sf-bg-surface-soft sf-dk-surface-750">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setExpanded(false);
            setConfirmingRemove(false);
          }}
          className="relative flex-1 min-w-0 py-2 text-sm font-semibold text-left sf-text-muted sf-dk-fg-100 hover:sf-text-primary sf-dk-hover-fg-white"
        >
          <span className="absolute left-0 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-5 h-5 border sf-border-soft rounded text-xs font-medium sf-text-muted">
            -
          </span>
          <span className="w-full text-left px-6 truncate">{sourceTitle}</span>
          <span className="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center gap-2">
            {componentSummary.length > 0 ? (
              <span className="text-xs sf-text-muted">
                {componentSummary.slice(0, 2).join(" | ")}
              </span>
            ) : null}
          </span>
        </button>
        <div className="flex items-center gap-2 pt-0.5">
          {confirmingRemove ? (
            <>
              <button
                type="button"
                onClick={() => setConfirmingRemove(false)}
                className="px-2 py-1 text-[11px] rounded border sf-border-soft bg-white sf-dk-surface-800 sf-text-muted sf-hover-bg-surface-soft sf-dk-hover-surface-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmingRemove(false);
                  onRemove();
                }}
                className={`${btnDanger} !px-2 !py-1 text-[11px]`}
              >
                Confirm remove
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingRemove(true)}
              className="px-2 py-1 text-[11px] rounded sf-danger-action-soft"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {/* Basic fields */}
      <div className="mb-3">
        <div className={labelCls}>
          Component Type
          <Tip
            style={{ position: "relative", left: "-3px", top: "-4px" }}
            text={STUDIO_TIPS.component_type}
          />
        </div>
        <ComboSelect
          value={compType}
          onChange={(v) => onUpdate({ component_type: v, type: v })}
          options={COMPONENT_TYPES}
          placeholder="e.g. sensor"
        />
      </div>

      {/* Component-level full review priority/effort */}
      <button
        type="button"
        onClick={() => toggleCsAiSections()}
        className="w-full flex items-center gap-2 mb-2"
      >
        <span className="inline-flex items-center justify-center w-5 h-5 border sf-border-soft rounded text-xs font-medium sf-text-muted">
          {showAiSections ? "-" : "+"}
        </span>
        <span className="text-xs font-semibold sf-text-muted">
          AI Review Priority
        </span>
      </button>
      {showAiSections ? (
        <div className="border sf-border-default rounded p-3 mb-4 sf-bg-surface-soft sf-dk-surface-900a20">
          <div className="text-xs font-semibold sf-text-muted mb-2">
            AI Review Priority
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <div className={labelCls}>
                Required Level
                <Tip
                  style={{ position: "relative", left: "-3px", top: "-4px" }}
                  text={STUDIO_TIPS.required_level}
                />
              </div>
              <select
                className={`${selectCls} w-full`}
                value={sourcePriority.required_level}
                onChange={(e) =>
                  updatePriority({ required_level: e.target.value })
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
              <div className={labelCls}>
                Availability
                <Tip
                  style={{ position: "relative", left: "-3px", top: "-4px" }}
                  text={STUDIO_TIPS.availability}
                />
              </div>
              <select
                className={`${selectCls} w-full`}
                value={sourcePriority.availability}
                onChange={(e) =>
                  updatePriority({ availability: e.target.value })
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
              <div className={labelCls}>
                Difficulty
                <Tip
                  style={{ position: "relative", left: "-3px", top: "-4px" }}
                  text={STUDIO_TIPS.difficulty}
                />
              </div>
              <select
                className={`${selectCls} w-full`}
                value={sourcePriority.difficulty}
                onChange={(e) => updatePriority({ difficulty: e.target.value })}
              >
                <option value="easy">easy</option>
                <option value="medium">medium</option>
                <option value="hard">hard</option>
                <option value="instrumented">instrumented</option>
              </select>
            </div>
            <div>
              <div className={labelCls}>
                Effort (1-10)
                <Tip
                  style={{ position: "relative", left: "-3px", top: "-4px" }}
                  text={STUDIO_TIPS.effort}
                />
              </div>
              <input
                className={`${inputCls} w-full`}
                type="number"
                min={STUDIO_NUMERIC_KNOB_BOUNDS.priorityEffort.min}
                max={STUDIO_NUMERIC_KNOB_BOUNDS.priorityEffort.max}
                value={sourcePriority.effort}
                onChange={(e) =>
                  updatePriority({
                    effort: parseBoundedIntInput(
                      e.target.value,
                      STUDIO_NUMERIC_KNOB_BOUNDS.priorityEffort.min,
                      STUDIO_NUMERIC_KNOB_BOUNDS.priorityEffort.max,
                      STUDIO_NUMERIC_KNOB_BOUNDS.priorityEffort.fallback,
                    ),
                  })
                }
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* Component table-level AI assist */}
      <button
        type="button"
        onClick={() => toggleCsAiSections()}
        className="w-full flex items-center gap-2 mb-2"
      >
        <span className="inline-flex items-center justify-center w-5 h-5 border sf-border-soft rounded text-xs font-medium sf-text-muted">
          {showAiSections ? "-" : "+"}
        </span>
        <span className="text-xs font-semibold sf-text-muted">AI Assist</span>
      </button>
      {showAiSections
        ? (() => {
            const explicitMode = sourceAiAssist.mode || "";
            const strategy = sourceAiAssist.model_strategy || "auto";
            const explicitCalls = sourceAiAssist.max_calls || 0;
            const reqLvl = sourcePriority.required_level;
            const diff = sourcePriority.difficulty;
            const effort = sourcePriority.effort;

            const derivedMode = deriveAiModeFromPriority(sourcePriority);
            const effectiveMode = explicitMode || derivedMode;

            const derivedCalls = deriveAiCallsFromEffort(effort);
            const effectiveCalls =
              explicitCalls > 0 ? Math.min(explicitCalls, 10) : derivedCalls;

            const modeToModel: Record<
              string,
              { model: string; reasoning: boolean }
            > = {
              off: { model: "none", reasoning: false },
              advisory: { model: "gpt-5-low", reasoning: false },
              planner: {
                model: "gpt-5-low -> gpt-5.2-high on escalation",
                reasoning: false,
              },
              judge: { model: "gpt-5.2-high", reasoning: true },
            };
            let effectiveModel = modeToModel[effectiveMode] || modeToModel.off;
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

            const explicitNote = sourceAiAssist.reasoning_note || "";
            const autoNote = [
              `Full component table review for "${compType || "component"}".`,
              `Apply ${effectiveMode} mode across all linked component rows and evidence.`,
              `Required level ${reqLvl}, availability ${sourcePriority.availability}, difficulty ${diff}, effort ${effort}.`,
              "Resolve conflicts across sources and keep output normalized for component identity + properties.",
            ].join(" ");
            const hasExplicit = explicitNote.length > 0;

            return (
              <div className="border sf-border-default rounded p-3 mb-4 sf-bg-surface-soft sf-dk-surface-900a20">
                <h4 className="text-xs font-semibold sf-text-muted mb-2">
                  AI Assist
                  <Tip
                    style={{ position: "relative", left: "-3px", top: "-4px" }}
                    text={STUDIO_TIPS.ai_mode}
                  />
                </h4>
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <div className={labelCls}>
                      Mode
                      <Tip
                        style={{
                          position: "relative",
                          left: "-3px",
                          top: "-4px",
                        }}
                        text={STUDIO_TIPS.ai_mode}
                      />
                    </div>
                    <select
                      className={`${selectCls} w-full`}
                      value={explicitMode}
                      onChange={(e) =>
                        updateAiAssist({ mode: e.target.value || null })
                      }
                    >
                      <option value="">auto ({derivedMode})</option>
                      <option value="off">
                        off - no LLM, deterministic only
                      </option>
                      <option value="advisory">
                        advisory - gpt-5-low, single pass
                      </option>
                      <option value="planner">
                        planner - gpt-5-low -&gt; gpt-5.2-high
                      </option>
                      <option value="judge">
                        judge - gpt-5.2-high, reasoning
                      </option>
                    </select>
                  </div>
                  <div>
                    <div className={labelCls}>
                      Model Strategy
                      <Tip
                        style={{
                          position: "relative",
                          left: "-3px",
                          top: "-4px",
                        }}
                        text={STUDIO_TIPS.ai_model_strategy}
                      />
                    </div>
                    <select
                      className={`${selectCls} w-full`}
                      value={strategy}
                      onChange={(e) =>
                        updateAiAssist({ model_strategy: e.target.value })
                      }
                    >
                      <option value="auto">auto - mode decides model</option>
                      <option value="force_fast">
                        force_fast - always gpt-5-low
                      </option>
                      <option value="force_deep">
                        force_deep - always gpt-5.2-high
                      </option>
                    </select>
                  </div>
                  <div>
                    <div className={labelCls}>
                      Max Calls
                      <Tip
                        text={STUDIO_TIPS.ai_max_calls}
                        style={{
                          position: "relative",
                          left: "-3px",
                          top: "-4px",
                        }}
                      />
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
                        updateAiAssist({
                          max_calls:
                            parsed === null
                              ? null
                              : clampNumber(
                                  parsed,
                                  STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxCalls.min,
                                  STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxCalls.max,
                                ),
                        });
                      }}
                      placeholder={`auto (${derivedCalls})`}
                    />
                  </div>
                  <div>
                    <div className={labelCls}>
                      Max Tokens
                      <Tip
                        style={{
                          position: "relative",
                          left: "-3px",
                          top: "-4px",
                        }}
                        text={STUDIO_TIPS.ai_max_tokens}
                      />
                    </div>
                    <input
                      className={`${inputCls} w-full`}
                      type="number"
                      min={STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxTokens.min}
                      max={STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxTokens.max}
                      step={1024}
                      value={sourceAiAssist.max_tokens || ""}
                      onChange={(e) => {
                        const parsed = parseOptionalPositiveIntInput(
                          e.target.value,
                        );
                        updateAiAssist({
                          max_tokens:
                            parsed === null
                              ? null
                              : clampNumber(
                                  parsed,
                                  STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxTokens.min,
                                  STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxTokens.max,
                                ),
                        });
                      }}
                      placeholder={`auto (${effectiveMode === "off" ? "0" : effectiveMode === "advisory" ? "4096" : effectiveMode === "planner" ? "8192" : "16384"})`}
                    />
                  </div>
                </div>

                <div className="mt-2 text-[11px] sf-bg-surface-soft sf-dk-surface-800a50 rounded p-2.5 border sf-border-default space-y-1">
                  <div className="text-[10px] font-semibold sf-text-subtle mb-1">
                    Effective AI Configuration
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="sf-text-subtle w-14">Mode:</span>
                    <span className="sf-text-muted">{effectiveMode}</span>
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
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="sf-text-subtle w-14">Budget:</span>
                    <span className="sf-text-muted">
                      {effectiveMode === "off" ? "0" : effectiveCalls} call
                      {effectiveCalls !== 1 ? "s" : ""}
                    </span>
                    {!explicitCalls && effectiveMode !== "off" && (
                      <span className="sf-text-subtle italic text-[10px]">
                        (auto from effort {effort})
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={labelCls.replace(" mb-1", "")}>
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
                      updateAiAssist({ reasoning_note: e.target.value })
                    }
                    placeholder={`Auto: ${autoNote}`}
                  />
                  {hasExplicit && (
                    <button
                      className="text-[10px] sf-link-accent hover:opacity-80 mt-1"
                      onClick={() => updateAiAssist({ reasoning_note: "" })}
                    >
                      Clear &amp; revert to auto-generated guidance
                    </button>
                  )}
                </div>
              </div>
            );
          })()
        : null}

      {/* Tracked Roles */}
      <div className="border-t sf-border-default pt-3">
        <button
          type="button"
          onClick={() => toggleTrackedRoles()}
          className="w-full flex items-center justify-between gap-2 mb-2"
        >
          <span className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 border sf-border-soft rounded text-xs font-medium sf-text-muted">
              {showTrackedRoles ? "-" : "+"}
            </span>
            <span className="text-xs font-semibold sf-text-muted">
              Tracked Roles
            </span>
          </span>
          <span className="text-[10px] sf-text-subtle">
            {trackedRoleCount} tracked roles
          </span>
        </button>
        {showTrackedRoles ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: "name" as const, label: "Name", alwaysOn: true },
                  {
                    id: "maker" as const,
                    label: "Maker (Brand)",
                    alwaysOn: false,
                  },
                  { id: "aliases" as const, label: "Aliases", alwaysOn: false },
                  {
                    id: "links" as const,
                    label: "Links (URLs)",
                    alwaysOn: false,
                  },
                ] as const
              ).map((role) => {
                const isOn =
                  role.alwaysOn ||
                  (role.id === "maker"
                    ? activeRoles.has("maker")
                    : role.id === "aliases"
                      ? activeRoles.has("aliases")
                      : activeRoles.has("links"));
                return (
                  <button
                    key={role.id}
                    disabled={role.alwaysOn}
                    className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors ${
                      isOn
                        ? "sf-chip-success"
                        : "sf-bg-surface-soft-strong sf-dk-surface-800 sf-text-muted sf-border-soft sf-hover-surface-soft-200 sf-dk-hover-surface-700"
                    } ${role.alwaysOn ? "cursor-default opacity-80" : ""}`}
                    onClick={() => {
                      if (role.alwaysOn) return;
                      const next = new Set(activeRoles);
                      if (role.id === "maker") {
                        if (next.has("maker")) {
                          next.delete("maker");
                          updateRoles({ maker: "" });
                        } else {
                          next.add("maker");
                          updateRoles({ maker: "yes" });
                        }
                      } else if (role.id === "aliases") {
                        if (next.has("aliases")) {
                          next.delete("aliases");
                          updateRoles({ aliases: [] });
                        } else {
                          next.add("aliases");
                        }
                      } else if (role.id === "links") {
                        if (next.has("links")) {
                          next.delete("links");
                          updateRoles({ links: [] });
                        } else {
                          next.add("links");
                        }
                      }
                      setActiveRoles(next);
                    }}
                  >
                    {role.label}
                  </button>
                );
              })}
            </div>
            <div className="text-[10px] sf-text-subtle mb-3">
              All tracked roles use{" "}
              <span className="font-semibold sf-text-muted">Authoritative</span>{" "}
              variance policy
            </div>

            {/* Alias values ÃƒÂ¢Ã¢â€šÂ¬" shown when aliases role is active */}
            {activeRoles.has("aliases") ? (
              <div className="mb-4 border sf-border-default rounded p-3 sf-bg-surface-soft sf-dk-surface-900a20">
                <div className="flex items-center gap-2 mb-2">
                  <div className={labelCls}>Alias Values</div>
                </div>
                <TagPicker
                  values={
                    Array.isArray(roles.aliases)
                      ? roles.aliases.filter(
                          (a) => a.length > 1 || !/^[A-Z]$/.test(a),
                        )
                      : []
                  }
                  onChange={(v) => updateRoles({ aliases: v })}
                  placeholder="Type an alias and press Enter..."
                />
              </div>
            ) : null}

            {/* Attributes (Properties) */}
            <button
              type="button"
              onClick={() => toggleAttributes()}
              className="w-full flex items-center justify-between gap-2 mb-2"
            >
              <span className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 border sf-border-soft rounded text-xs font-medium sf-text-muted">
                  {showAttributes ? "-" : "+"}
                </span>
                <span className="text-xs font-semibold sf-text-muted">
                  Attributes ({propertyRows.length})
                  <Tip
                    style={{ position: "relative", left: "-3px", top: "-4px" }}
                    text={STUDIO_TIPS.comp_field_key}
                  />
                </span>
              </span>
              <span className="text-xs sf-text-subtle">
                {propertyRows.length} attribute
                {propertyRows.length !== 1 ? "s" : ""}
              </span>
            </button>
            {showAttributes ? (
              <div className="mt-3">
                <div className="flex items-center justify-between mb-2">
                  <div className={labelCls}>
                    Attributes ({propertyRows.length})
                    <Tip
                      style={{
                        position: "relative",
                        left: "-3px",
                        top: "-4px",
                      }}
                      text={STUDIO_TIPS.comp_field_key}
                    />
                  </div>
                  {fieldOrder.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <select
                        className={`${selectCls} text-xs min-w-[180px]`}
                        value={pendingFieldKey}
                        onChange={(e) => setPendingFieldKey(e.target.value)}
                      >
                        <option value="">Select field key...</option>
                        {Object.entries(fieldKeyGroups).flatMap(([, keys]) =>
                          keys.map((k) => (
                            <option key={k.key} value={k.key}>
                              {k.label} ({k.type})
                            </option>
                          )),
                        )}
                      </select>
                      <button
                        className="px-3 py-1.5 text-xs font-medium sf-primary-button disabled:opacity-40"
                        disabled={!pendingFieldKey}
                        onClick={() => {
                          if (pendingFieldKey) {
                            addPropertyFromFieldKey(pendingFieldKey);
                            setPendingFieldKey("");
                          }
                        }}
                      >
                        + Add
                      </button>
                    </div>
                  ) : null}
                </div>
                {propertyRows.length > 0 ? (
                  <div className="space-y-2">
                    {propertyRows.map((prop, pidx) => {
                      const inherited = prop.field_key
                        ? getInheritedInfo(prop.field_key)
                        : null;
                      const hasEnumSource = inherited
                        ? !!inherited.enumSource
                        : false;
                      const isComponentDbEnum =
                        hasEnumSource &&
                        inherited!.enumSource.startsWith("component_db");
                      const isExternalEnum =
                        hasEnumSource && !isComponentDbEnum;
                      const varianceLocked = inherited
                        ? inherited.type !== "number" ||
                          inherited.isBool ||
                          hasEnumSource
                        : false;
                      const lockReason = inherited
                        ? inherited.isBool
                          ? 'Boolean field ÃƒÂ¢Ã¢â€šÂ¬" variance locked to authoritative (yes/no only)'
                          : isComponentDbEnum
                            ? `enum.db (${inherited.enumSource.replace(/^component_db\./, "")}) ÃƒÂ¢Ã¢â€šÂ¬" variance locked to authoritative`
                            : isExternalEnum
                              ? `Enum (${inherited.enumSource.replace(/^(known_values|data_lists)\./, "")}) ÃƒÂ¢Ã¢â€šÂ¬" variance locked to authoritative`
                              : inherited.type !== "number" &&
                                  inherited.fieldValues.length > 0
                                ? `Manual values (${inherited.fieldValues.length}) ÃƒÂ¢Ã¢â€šÂ¬" variance locked to authoritative`
                                : inherited.type !== "number"
                                  ? 'String property ÃƒÂ¢Ã¢â€šÂ¬" variance locked to authoritative (only number fields without enums support variance)'
                                  : ""
                        : "";
                      return (
                        <div
                          key={pidx}
                          className="border sf-border-default dark:sf-border-soft rounded overflow-hidden"
                        >
                          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end p-3 pb-2">
                            <div>
                              <div className="text-[10px] sf-text-subtle mb-0.5">
                                Field Key
                                <Tip
                                  style={{
                                    position: "relative",
                                    left: "-3px",
                                    top: "-4px",
                                  }}
                                  text={STUDIO_TIPS.comp_field_key}
                                />
                              </div>
                              <select
                                className={`${selectCls} w-full`}
                                value={prop.field_key}
                                onChange={(e) => {
                                  const newKey = e.target.value;
                                  selectFieldKey(pidx, newKey);
                                  if (newKey) {
                                    const info = getInheritedInfo(newKey);
                                    const shouldLock =
                                      info.type !== "number" ||
                                      info.isBool ||
                                      !!info.enumSource;
                                    if (shouldLock) {
                                      updatePropertyField(pidx, {
                                        field_key: newKey,
                                        variance_policy: "authoritative",
                                        tolerance: null,
                                      });
                                    }
                                  }
                                }}
                              >
                                <option value="">(select field key)</option>
                                {prop.field_key && rules[prop.field_key] ? (
                                  (() => {
                                    const r = rules[prop.field_key];
                                    const ct = r.contract || {};
                                    return (
                                      <option
                                        key={prop.field_key}
                                        value={prop.field_key}
                                      >
                                        {displayLabel(
                                          prop.field_key,
                                          r as Record<string, unknown>,
                                        )}{" "}
                                        ({String(ct.type || "string")}) &#10003;
                                      </option>
                                    );
                                  })()
                                ) : prop.field_key ? (
                                  <option
                                    key={prop.field_key}
                                    value={prop.field_key}
                                  >
                                    {prop.field_key} &#10003;
                                  </option>
                                ) : null}
                                {Object.entries(fieldKeyGroups).flatMap(
                                  ([, keys]) =>
                                    keys.map((k) => (
                                      <option key={k.key} value={k.key}>
                                        {k.label} ({k.type})
                                      </option>
                                    )),
                                )}
                              </select>
                            </div>
                            <div>
                              <div className="text-[10px] sf-text-subtle mb-0.5">
                                Variance
                                <Tip
                                  style={{
                                    position: "relative",
                                    left: "-3px",
                                    top: "-4px",
                                  }}
                                  text={STUDIO_TIPS.comp_variance_policy}
                                />
                              </div>
                              <select
                                className={`${selectCls} w-full ${varianceLocked || prop.variance_policy === "override_allowed" ? "opacity-50 cursor-not-allowed" : ""}`}
                                value={
                                  varianceLocked ||
                                  prop.variance_policy === "override_allowed"
                                    ? "authoritative"
                                    : prop.variance_policy
                                }
                                disabled={
                                  varianceLocked ||
                                  prop.variance_policy === "override_allowed"
                                }
                                title={
                                  prop.variance_policy === "override_allowed"
                                    ? 'Disabled ÃƒÂ¢Ã¢â€šÂ¬" override checkbox is active'
                                    : lockReason
                                }
                                onChange={(e) =>
                                  updatePropertyField(pidx, {
                                    variance_policy: e.target
                                      .value as PropertyMapping["variance_policy"],
                                  })
                                }
                              >
                                {VARIANCE_POLICIES.map((vp) => (
                                  <option key={vp.value} value={vp.value}>
                                    {vp.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <button
                                onClick={() => removePropertyRow(pidx)}
                                className="text-xs sf-danger-text-soft sf-status-danger-hover py-1.5 px-2"
                                title="Remove"
                              >
                                &#10005;
                              </button>
                            </div>
                          </div>

                          {/* Variance lock reason + enriched type metadata */}
                          {varianceLocked && inherited ? (
                            <div className="px-3 pb-2">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-[10px] px-1.5 py-0.5 rounded sf-bg-surface-soft-strong sf-text-subtle sf-dk-surface-700 dark:sf-text-muted">
                                  authoritative (locked)
                                </span>
                                {inherited.isBool ? (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded sf-chip-warning-soft">
                                    boolean: yes / no
                                  </span>
                                ) : null}
                                {isComponentDbEnum ? (
                                  <span
                                    className="text-[10px] px-1.5 py-0.5 rounded sf-review-ai-pending-badge truncate max-w-[200px]"
                                    title={inherited.enumSource}
                                  >
                                    enum.db:{" "}
                                    {inherited.enumSource.replace(
                                      /^component_db\./,
                                      "",
                                    )}
                                  </span>
                                ) : null}
                                {isExternalEnum ? (
                                  <span
                                    className="text-[10px] px-1.5 py-0.5 rounded sf-review-ai-pending-badge truncate max-w-[200px]"
                                    title={inherited.enumSource}
                                  >
                                    enum:{" "}
                                    {inherited.enumSource.replace(
                                      /^(known_values|data_lists)\./,
                                      "",
                                    )}
                                  </span>
                                ) : null}
                                {!inherited.isBool &&
                                !hasEnumSource &&
                                inherited.fieldValues.length > 0 &&
                                inherited.fieldValues.length <= 8 ? (
                                  <div className="flex flex-wrap gap-0.5">
                                    <span className="text-[10px] sf-text-subtle mr-0.5">
                                      manual:
                                    </span>
                                    {inherited.fieldValues.map((v) => (
                                      <span
                                        key={v}
                                        className="text-[9px] px-1 py-0.5 rounded sf-bg-surface-soft-strong sf-text-muted sf-dk-surface-700 dark:sf-text-subtle"
                                      >
                                        {v}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                                {!inherited.isBool &&
                                !hasEnumSource &&
                                inherited.fieldValues.length > 8 ? (
                                  <span
                                    className="text-[10px] sf-text-subtle"
                                    title={inherited.fieldValues.join(", ")}
                                  >
                                    manual: {inherited.fieldValues.length}{" "}
                                    values
                                  </span>
                                ) : null}
                                {!inherited.isBool &&
                                !hasEnumSource &&
                                inherited.fieldValues.length === 0 &&
                                inherited.type !== "number" ? (
                                  <span className="text-[10px] sf-text-subtle italic">
                                    string type
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          ) : null}

                          {/* Allow Product Override checkbox (shown for unlocked number fields) */}
                          {!varianceLocked ? (
                            <div className="px-3 pb-2">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={
                                    prop.variance_policy === "override_allowed"
                                  }
                                  onChange={(e) =>
                                    updatePropertyField(pidx, {
                                      variance_policy: e.target.checked
                                        ? "override_allowed"
                                        : "authoritative",
                                      tolerance: e.target.checked
                                        ? null
                                        : prop.tolerance,
                                    })
                                  }
                                  className="rounded sf-border-soft"
                                />
                                <span className="text-[10px] sf-text-muted">
                                  Allow Product Override
                                </span>
                                <Tip text={STUDIO_TIPS.comp_override_allowed} />
                              </label>
                            </div>
                          ) : null}

                          {/* Tolerance input (shown for unlocked numeric upper_bound/lower_bound/range) */}
                          {!varianceLocked &&
                          (prop.variance_policy === "upper_bound" ||
                            prop.variance_policy === "lower_bound" ||
                            prop.variance_policy === "range") ? (
                            <div className="px-3 pb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] sf-text-subtle">
                                  Tolerance
                                  <Tip
                                    style={{
                                      position: "relative",
                                      left: "-3px",
                                      top: "-4px",
                                    }}
                                    text={STUDIO_TIPS.comp_tolerance}
                                  />
                                </span>
                                <input
                                  className={`${inputCls} w-24`}
                                  type="number"
                                  min={0}
                                  step="any"
                                  value={prop.tolerance ?? ""}
                                  onChange={(e) =>
                                    updatePropertyField(pidx, {
                                      tolerance: e.target.value
                                        ? Number(e.target.value)
                                        : null,
                                    })
                                  }
                                  placeholder="e.g. 5"
                                />
                              </div>
                            </div>
                          ) : null}

                          {/* Inherited info banner */}
                          {inherited && prop.field_key ? (
                            <div className="sf-bg-surface-soft sf-dk-surface-900a50 px-3 py-2 text-[11px] sf-text-muted border-t sf-border-default">
                              <div className="flex flex-wrap gap-1.5 items-center">
                                <span className="font-medium sf-text-muted">
                                  Inherited:
                                </span>
                                <span className="inline-flex items-center gap-0.5">
                                  <span className="sf-chip-info px-1.5 py-0.5 rounded text-[10px]">
                                    {inherited.type}
                                  </span>
                                  <StaticBadges fieldPath="contract.type" />
                                </span>
                                {inherited.unit ? (
                                  <span className="inline-flex items-center gap-0.5">
                                    <span className="sf-chip-info px-1.5 py-0.5 rounded text-[10px]">
                                      {inherited.unit}
                                    </span>
                                    <StaticBadges fieldPath="contract.unit" />
                                  </span>
                                ) : null}
                                {inherited.template ? (
                                  <span className="inline-flex items-center gap-0.5">
                                    <span className="sf-review-ai-pending-badge px-1.5 py-0.5 rounded text-[10px]">
                                      {inherited.template}
                                    </span>
                                    <StaticBadges fieldPath="parse.template" />
                                  </span>
                                ) : null}
                                {inherited.evidenceRefs > 0 ? (
                                  <span className="inline-flex items-center gap-0.5">
                                    <span className="sf-chip-success px-1.5 py-0.5 rounded text-[10px]">
                                      evidence:{inherited.evidenceRefs} refs
                                    </span>
                                    <StaticBadges fieldPath="evidence.min_evidence_refs" />
                                  </span>
                                ) : null}
                                {isComponentDbEnum ? (
                                  <span className="inline-flex items-center gap-0.5">
                                    <span className="sf-chip-warning px-1.5 py-0.5 rounded text-[10px]">
                                      enum.db:{" "}
                                      {inherited.enumSource.replace(
                                        /^component_db\./,
                                        "",
                                      )}
                                    </span>
                                    <StaticBadges fieldPath="enum.source" />
                                  </span>
                                ) : isExternalEnum ? (
                                  <span className="inline-flex items-center gap-0.5">
                                    <span className="sf-chip-warning px-1.5 py-0.5 rounded text-[10px]">
                                      enum:{" "}
                                      {inherited.enumSource.replace(
                                        /^(known_values|data_lists)\./,
                                        "",
                                      )}
                                    </span>
                                    <StaticBadges fieldPath="enum.source" />
                                  </span>
                                ) : inherited.isBool ? (
                                  <span className="sf-chip-warning-soft px-1.5 py-0.5 rounded text-[10px]">
                                    boolean: yes / no
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          ) : null}

                          {/* Read-only constraints from field rule */}
                          {inherited && inherited.constraints.length > 0 ? (
                            <div className="px-3 py-1.5 border-t sf-border-default text-[11px]">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="sf-text-muted inline-flex items-center gap-0.5">
                                  Constraints
                                  <StaticBadges fieldPath="constraints" />
                                </span>
                                {inherited.constraints.map((c, ci) => (
                                  <span
                                    key={ci}
                                    className="sf-chip-confirm px-1.5 py-0.5 rounded text-[10px]"
                                  >
                                    {c}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs sf-text-subtle">
                    No attributes. Use the dropdown above to add field keys.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Summary line */}
        <div className="mt-3 text-xs sf-text-subtle flex flex-wrap gap-1.5">
          <span className="px-1.5 py-0.5 rounded sf-chip-success">
            {propertyRows.length} attribute
            {propertyRows.length !== 1 ? "s" : ""}
          </span>
          <span className="px-1.5 py-0.5 rounded sf-chip-info">
            {trackedRoleCount} tracked role{trackedRoleCount !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}

// ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Key Navigator ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬
// Helper to safely get nested values
// Collapsible section component
