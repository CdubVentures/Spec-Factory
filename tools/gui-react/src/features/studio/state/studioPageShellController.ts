import { resolveStudioSaveStatus, type StudioAutoSaveStatus } from '../../../shared/ui/feedback/settingsStatus.ts';
import type { StudioOperationsState } from './studioOperationsSelectors.ts';
import type {
  ArtifactEntry,
  ComponentDbResponse,
  ComponentSource,
  FieldRule,
  StudioConfig,
} from '../../../types/studio.ts';
import type { StudioPageActivePanelProps } from '../components/studioPagePanelContracts.ts';
import {
  buildStudioPageActivePanelProps,
} from './studioPagePanelProps.ts';
import type { StudioTabId } from './studioPageTabs.ts';
import {
  deriveStudioCompileStatus,
  deriveStudioEnumListsWithValues,
  deriveStudioPageProcessState,
  deriveStudioPageRootDerivedState,
  deriveStudioPageShellState,
  type StudioKnownValuesSource,
} from './studioPageDerivedState.ts';

export const STUDIO_CATEGORY_GUARD_MESSAGE =
  'Select a specific category from the sidebar to configure field rules.';

interface StudioMutationState {
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: unknown;
}

interface BuildStudioPageShellControllerStateInput {
  category: string;
  isLoading: boolean;
  activeTab: StudioTabId;
  autoSaveAllEnabled: boolean;
  selectedKey: string;
  opsState: StudioOperationsState;
  rules: Record<string, FieldRule>;
  fieldOrder: string[];
  wbMap: StudioConfig;
  tooltipEntries?: Record<string, unknown> | null;
  tooltipFiles: string[];
  guardrails?: Record<string, unknown> | null;
  compileStale?: boolean;
  artifacts?: ArtifactEntry[] | undefined;
  knownValuesSource?: StudioKnownValuesSource | null;
  knownValuesIsError: boolean;
  knownValuesErrorMessage?: string;
  knownValuesTabActive: boolean;
  componentDb?: ComponentDbResponse | undefined;
  componentSources?: ComponentSource[] | undefined;
  fieldRulesInitialized: boolean;
  authorityConflictVersion?: string | null;
  authorityConflictDetectedAt?: string | null;
  autoSaveStatus: StudioAutoSaveStatus;
  effectiveAutoSaveEnabled: boolean;
  effectiveAutoSaveMapEnabled: boolean;
  hasUnsavedChanges: boolean;
  saveMapMutState: StudioMutationState & { mutate?: (payload: StudioConfig) => void };
  saveStudioDocsMutState: StudioMutationState;
  compileMutState: StudioMutationState;
  validateRulesMutState: StudioMutationState;
  setAutoSaveMapEnabled: (nextValue: boolean) => void;
  setSelectedKey: (nextKey: string) => void;
  saveFromStore: (options?: { force?: boolean }) => void | Promise<unknown>;
  persistFieldKeyOrder: (order: string[]) => void;
  setAutoSaveEnabled: (nextValue: boolean) => void;
  runCompileFromStudio: () => void | Promise<unknown>;
  runValidate: () => void | Promise<unknown>;
}

export interface StudioPageShellControllerShellState {
  category: string;
  reportsTabRunning: boolean;
  fieldCount: number;
  compileErrorsCount: number;
  compileWarningsCount: number;
  authorityConflictVersion?: string | null;
  authorityConflictDetectedAt?: string | null;
  saveStatusLabel: string;
  saveStatusDot: string;
  savePending: boolean;
  autoSaveAllEnabled: boolean;
  compileStatusLabel: string;
  compileStatusDot: string;
  compilePending: boolean;
  compileProcessRunning: boolean;
  processRunning: boolean;
}

export type StudioPageShellControllerState =
  | {
      kind: 'category_guard';
      message: string;
    }
  | {
      kind: 'loading';
    }
  | {
      kind: 'ready';
      shellState: StudioPageShellControllerShellState;
      activePanelProps: StudioPageActivePanelProps;
    };

function errorMessageOf(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === 'string' ? error : undefined;
}

export function buildStudioPageShellControllerState({
  category,
  isLoading,
  activeTab,
  autoSaveAllEnabled,
  selectedKey,
  opsState,
  rules,
  fieldOrder,
  wbMap,
  tooltipEntries,
  tooltipFiles,
  guardrails,
  compileStale,
  artifacts,
  knownValuesSource,
  knownValuesIsError,
  knownValuesErrorMessage,
  knownValuesTabActive,
  componentDb,
  componentSources,
  fieldRulesInitialized,
  authorityConflictVersion,
  authorityConflictDetectedAt,
  autoSaveStatus,
  effectiveAutoSaveEnabled,
  effectiveAutoSaveMapEnabled,
  hasUnsavedChanges,
  saveMapMutState,
  saveStudioDocsMutState,
  compileMutState,
  validateRulesMutState,
  setAutoSaveMapEnabled,
  setSelectedKey,
  saveFromStore,
  persistFieldKeyOrder,
  setAutoSaveEnabled,
  runCompileFromStudio,
  runValidate,
}: BuildStudioPageShellControllerStateInput): StudioPageShellControllerState {
  if (category === 'all') {
    return {
      kind: 'category_guard',
      message: STUDIO_CATEGORY_GUARD_MESSAGE,
    };
  }

  if (isLoading) {
    return {
      kind: 'loading',
    };
  }

  const processState = deriveStudioPageProcessState({
    compileRunning: opsState.compileRunning,
    validateRunning: opsState.validateRunning,
    compileError: opsState.compileError,
    compilePending: compileMutState.isPending,
    validatePending: validateRulesMutState.isPending,
  });

  const rootDerivedState = deriveStudioPageRootDerivedState({
    fieldOrder,
    tooltipEntries,
    guardrails,
    knownValuesTabActive,
    knownValuesIsError,
    knownValuesErrorMessage,
  });

  const saveStatus = resolveStudioSaveStatus({
    isSaving: saveStudioDocsMutState.isPending,
    isError: saveStudioDocsMutState.isError,
    errorMessage: errorMessageOf(saveStudioDocsMutState.error),
    initialized: fieldRulesInitialized,
    hasUnsavedChanges,
    autoSaveEnabled: effectiveAutoSaveEnabled,
    autoSaveStatus,
  });

  const compileStatus = deriveStudioCompileStatus({
    mutationPending: compileMutState.isPending,
    mutationIsError: compileMutState.isError,
    mutationErrorMessage: errorMessageOf(compileMutState.error),
    compileProcessRunning: processState.compileProcessRunning,
    compileProcessFailed: processState.compileProcessFailed,
    processExitCode: undefined,
    compileStale,
    runningLabel: 'Compiling\u2026',
  });

  const shellPresentation = deriveStudioPageShellState({
    fieldCount: fieldOrder.length,
    compileErrorsCount: rootDerivedState.compileErrors.length,
    compileWarningsCount: rootDerivedState.compileWarnings.length,
    saveStatus,
    compileStatus,
  });

  const activePanelProps = buildStudioPageActivePanelProps({
    activeTab,
    category,
    knownValuesSpecDbNotReady: rootDerivedState.knownValuesSpecDbNotReady,
    wbMap,
    tooltipCount: rootDerivedState.tooltipCount,
    tooltipCoverage: rootDerivedState.tooltipCoverage,
    tooltipFiles,
    onSaveMap: (map) => {
      saveMapMutState.mutate?.(map);
    },
    saveMapPending: saveMapMutState.isPending,
    saveMapSuccess: saveMapMutState.isSuccess,
    saveMapErrorMessage: saveMapMutState.isError
      ? errorMessageOf(saveMapMutState.error) || 'Save failed'
      : '',
    rules,
    fieldOrder,
    knownValuesFields: (knownValuesSource?.fields ?? undefined) as Record<string, string[]> | undefined,
    autoSaveMapEnabled: effectiveAutoSaveMapEnabled,
    setAutoSaveMapEnabled,
    autoSaveMapLocked: autoSaveAllEnabled,
    selectedKey,
    onSelectKey: setSelectedKey,
    onSave: () => {
      void saveFromStore({ force: true });
    },
    onPersistOrder: persistFieldKeyOrder,
    savePending: saveStudioDocsMutState.isPending,
    saveSuccess: saveStudioDocsMutState.isSuccess,
    enumLists: deriveStudioEnumListsWithValues(knownValuesSource),
    componentDb,
    componentSources,
    autoSaveEnabled: effectiveAutoSaveEnabled,
    setAutoSaveEnabled,
    autoSaveLocked: autoSaveAllEnabled,
    autoSaveLockReason: autoSaveAllEnabled ? 'Auto-Save All' : '',
    guardrails,
    artifacts,
    compileErrors: rootDerivedState.compileErrors,
    compileWarnings: rootDerivedState.compileWarnings,
    compilePending: compileMutState.isPending,
    compileIsError: compileMutState.isError,
    compileErrorMessage: errorMessageOf(compileMutState.error),
    validatePending: validateRulesMutState.isPending,
    validateIsError: validateRulesMutState.isError,
    validateErrorMessage: errorMessageOf(validateRulesMutState.error),
    compileRunning: opsState.compileRunning,
    validateRunning: opsState.validateRunning,
    compileError: opsState.compileError,
    validateError: opsState.validateError,
    onRunCompile: runCompileFromStudio,
    onRunValidate: runValidate,
  });

  return {
    kind: 'ready',
    shellState: {
      category,
      reportsTabRunning: processState.reportsTabRunning,
      fieldCount: shellPresentation.fieldCount,
      compileErrorsCount: shellPresentation.compileErrorsCount,
      compileWarningsCount: shellPresentation.compileWarningsCount,
      authorityConflictVersion,
      authorityConflictDetectedAt,
      saveStatusLabel: shellPresentation.saveStatusLabel,
      saveStatusDot: shellPresentation.saveStatusDot,
      savePending: saveStudioDocsMutState.isPending,
      autoSaveAllEnabled,
      compileStatusLabel: shellPresentation.compileStatusLabel,
      compileStatusDot: shellPresentation.compileStatusDot,
      compilePending: compileMutState.isPending,
      compileProcessRunning: processState.compileProcessRunning,
      processRunning: opsState.anyStudioOpRunning,
    },
    activePanelProps,
  };
}
