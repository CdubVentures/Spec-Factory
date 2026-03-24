import type { ProcessStatus } from '../../../types/events.ts';
import type {
  ArtifactEntry,
  ComponentDbResponse,
  ComponentSource,
  EnumEntry,
  FieldRule,
  StudioConfig,
} from '../../../types/studio.ts';
import type { StudioPageActivePanelProps } from '../components/studioPagePanelContracts.ts';
import type { StudioTabId } from './studioPageTabs.ts';

function normalizeKnownValuesFields(
  knownValuesFields: Record<string, string[]> | undefined,
): Record<string, string[]> {
  return knownValuesFields && typeof knownValuesFields === 'object'
    ? knownValuesFields
    : {};
}

function normalizeComponentDb(
  componentDb: ComponentDbResponse | undefined,
): ComponentDbResponse {
  return componentDb && typeof componentDb === 'object' ? componentDb : {};
}

function normalizeComponentSources(
  componentSources: ComponentSource[] | undefined,
): ComponentSource[] {
  return Array.isArray(componentSources) ? componentSources : [];
}

function normalizeArtifacts(
  artifacts: ArtifactEntry[] | undefined,
): ArtifactEntry[] {
  return Array.isArray(artifacts) ? artifacts : [];
}

function normalizeGuardrails(
  guardrails: Record<string, unknown> | null | undefined,
): Record<string, unknown> | undefined {
  return guardrails && typeof guardrails === 'object' ? guardrails : undefined;
}

export interface BuildStudioPageActivePanelPropsInput {
  activeTab: StudioTabId;
  category: string;
  knownValuesSpecDbNotReady: boolean;
  wbMap: StudioConfig;
  tooltipCount: number;
  tooltipCoverage: number;
  tooltipFiles: string[];
  onSaveMap: (map: StudioConfig) => void;
  saveMapPending: boolean;
  saveMapSuccess: boolean;
  saveMapErrorMessage: string;
  rules: Record<string, FieldRule>;
  fieldOrder: string[];
  knownValuesFields: Record<string, string[]> | undefined;
  autoSaveMapEnabled: boolean;
  setAutoSaveMapEnabled: (nextValue: boolean) => void;
  autoSaveMapLocked: boolean;
  selectedKey: string;
  onSelectKey: (nextKey: string) => void;
  onSave: () => void;
  savePending: boolean;
  saveSuccess: boolean;
  enumLists: EnumEntry[];
  componentDb: ComponentDbResponse | undefined;
  componentSources: ComponentSource[] | undefined;
  autoSaveEnabled: boolean;
  setAutoSaveEnabled: (nextValue: boolean) => void;
  autoSaveLocked: boolean;
  autoSaveLockReason: string;
  onRunEnumConsistency: (
    fieldKey: string,
    options?: {
      reviewEnabled?: boolean;
      formatGuidance?: string;
    },
  ) => Promise<unknown>;
  enumConsistencyPending: boolean;
  guardrails: Record<string, unknown> | null | undefined;
  artifacts: ArtifactEntry[] | undefined;
  compileErrors: string[];
  compileWarnings: string[];
  compilePending: boolean;
  compileIsError: boolean;
  compileErrorMessage?: string;
  validatePending: boolean;
  validateIsError: boolean;
  validateErrorMessage?: string;
  processStatus?: ProcessStatus | null;
  onRunCompile: () => void | Promise<unknown>;
  onRunValidate: () => void | Promise<unknown>;
}

export function buildStudioPageActivePanelProps({
  activeTab,
  category,
  knownValuesSpecDbNotReady,
  wbMap,
  tooltipCount,
  tooltipCoverage,
  tooltipFiles,
  onSaveMap,
  saveMapPending,
  saveMapSuccess,
  saveMapErrorMessage,
  rules,
  fieldOrder,
  knownValuesFields,
  autoSaveMapEnabled,
  setAutoSaveMapEnabled,
  autoSaveMapLocked,
  selectedKey,
  onSelectKey,
  onSave,
  savePending,
  saveSuccess,
  enumLists,
  componentDb,
  componentSources,
  autoSaveEnabled,
  setAutoSaveEnabled,
  autoSaveLocked,
  autoSaveLockReason,
  onRunEnumConsistency,
  enumConsistencyPending,
  guardrails,
  artifacts,
  compileErrors,
  compileWarnings,
  compilePending,
  compileIsError,
  compileErrorMessage,
  validatePending,
  validateIsError,
  validateErrorMessage,
  processStatus,
  onRunCompile,
  onRunValidate,
}: BuildStudioPageActivePanelPropsInput): StudioPageActivePanelProps {
  const normalizedKnownValues = normalizeKnownValuesFields(knownValuesFields);
  const normalizedComponentDb = normalizeComponentDb(componentDb);
  const normalizedComponentSources =
    normalizeComponentSources(componentSources);
  const normalizedGuardrails = normalizeGuardrails(guardrails);

  return {
    activeTab,
    category,
    knownValuesSpecDbNotReady,
    mappingTabProps: {
      wbMap,
      tooltipCount,
      tooltipCoverage,
      tooltipFiles,
      onSaveMap,
      saving: saveMapPending,
      saveSuccess: saveMapSuccess,
      saveErrorMessage: saveMapErrorMessage,
      rules,
      fieldOrder,
      knownValues: normalizedKnownValues,
      autoSaveMapEnabled,
      setAutoSaveMapEnabled,
      autoSaveMapLocked,
    },
    keyNavigatorTabProps: {
      category,
      selectedKey,
      onSelectKey,
      onSave,
      saving: savePending,
      saveSuccess,
      knownValues: normalizedKnownValues,
      enumLists,
      componentDb: normalizedComponentDb,
      componentSources: normalizedComponentSources,
      autoSaveEnabled,
      setAutoSaveEnabled,
      autoSaveLocked,
      autoSaveLockReason,
      onRunEnumConsistency,
      enumConsistencyPending,
    },
    contractTabProps: {
      category,
      knownValues: normalizedKnownValues,
      enumLists,
      componentDb: normalizedComponentDb,
      componentSources: normalizedComponentSources,
      wbMap,
      guardrails: normalizedGuardrails,
      onSave,
      saving: savePending,
      saveSuccess,
      autoSaveEnabled,
      setAutoSaveEnabled,
      autoSaveLocked,
      autoSaveLockReason,
    },
    reportsTabProps: {
      artifacts: normalizeArtifacts(artifacts),
      compileErrors,
      compileWarnings,
      guardrails: normalizedGuardrails,
      compilePending,
      compileIsError,
      compileErrorMessage,
      validatePending,
      validateIsError,
      validateErrorMessage,
      processStatus,
      onRunCompile,
      onRunValidate,
    },
  };
}
