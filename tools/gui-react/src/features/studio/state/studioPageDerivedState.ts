import type { EnumEntry, FieldRule } from '../../../types/studio.ts';

export interface StudioPageRootDerivedStateOptions {
  fieldOrder: string[];
  tooltipEntries?: Record<string, unknown> | null;
  guardrails?: unknown;
  knownValuesTabActive: boolean;
  knownValuesIsError: boolean;
  knownValuesErrorMessage?: string;
}

export interface StudioPageRootDerivedState {
  compileErrors: string[];
  compileWarnings: string[];
  tooltipCount: number;
  tooltipCoverage: number;
  knownValuesSpecDbNotReady: boolean;
}

export interface StudioPageStatusPresentation {
  label: string;
  dot: string;
  text: string;
  border: string;
}

export interface StudioPageShellStateOptions {
  fieldCount: number;
  compileErrorsCount: number;
  compileWarningsCount: number;
  saveStatus: StudioPageStatusPresentation | null;
  compileStatus: StudioPageStatusPresentation | null;
}

export interface StudioPageShellState {
  fieldCount: number;
  compileErrorsCount: number;
  compileWarningsCount: number;
  saveStatusLabel: string;
  saveStatusDot: string;
  compileStatusLabel: string;
  compileStatusDot: string;
}

export interface StudioPageViewStateOptions {
  activeTab: string;
  autoSaveAllEnabled: boolean;
  autoSaveEnabled: boolean;
  autoSaveMapEnabled: boolean;
  initialized: boolean;
  serverRules: Record<string, FieldRule>;
  serverFieldOrder: string[];
  editedRules: Record<string, FieldRule>;
  editedFieldOrder: string[];
}

export interface StudioPageViewState {
  knownValuesTabActive: boolean;
  effectiveAutoSaveEnabled: boolean;
  effectiveAutoSaveMapEnabled: boolean;
  storeRules: Record<string, FieldRule>;
  storeFieldOrder: string[];
  hasUnsavedChanges: boolean;
}

export interface StudioCompileStatusOptions {
  mutationPending: boolean;
  mutationIsError: boolean;
  mutationErrorMessage?: string;
  compileProcessRunning: boolean;
  compileProcessFailed: boolean;
  processExitCode?: number | null;
  compileStale?: boolean;
  runningLabel?: string;
}

export interface StudioPageProcessStateOptions {
  processCommand?: string | null;
  processRunning?: boolean;
  processExitCode?: number | null;
  compilePending: boolean;
  validatePending: boolean;
}

export interface StudioPageProcessState {
  isCompileProcessCommand: boolean;
  isValidateProcessCommand: boolean;
  compileProcessRunning: boolean;
  compileProcessFailed: boolean;
  reportsTabRunning: boolean;
}

export interface StudioKnownValuesSource {
  enum_lists?: Array<Record<string, unknown>> | null;
  fields?: Record<string, unknown> | null;
}

export interface StudioEnumListEntry extends EnumEntry {
  field: string;
  normalize: string;
  values: string[];
}

export interface StudioFieldRow {
  key: string;
  label: string;
  group: string;
  type: string;
  required: string;
  unit: string;
  enumName: string;
}

export interface StudioFieldRowsOptions {
  fieldOrder: string[];
  rules: Record<string, unknown>;
  resolveLabel: (
    key: string,
    rule?: Record<string, unknown> | null,
  ) => string;
}

interface StudioGuardrailMessageState {
  compileErrors: string[];
  compileWarnings: string[];
}

function deriveStudioGuardrailMessageState(
  guardrails: unknown,
): StudioGuardrailMessageState {
  if (!guardrails || typeof guardrails !== 'object') {
    return {
      compileErrors: [],
      compileWarnings: [],
    };
  }

  const record = guardrails as Record<string, unknown>;

  return {
    compileErrors: Array.isArray(record.errors) ? record.errors.map(String) : [],
    compileWarnings: Array.isArray(record.warnings)
      ? record.warnings.map(String)
      : [],
  };
}

function deriveStudioTooltipCoverageState(
  fieldOrder: string[],
  tooltipEntries: Record<string, unknown> | null | undefined,
): Pick<StudioPageRootDerivedState, 'tooltipCount' | 'tooltipCoverage'> {
  const entries = tooltipEntries && typeof tooltipEntries === 'object'
    ? tooltipEntries
    : {};
  const tooltipCount = Object.keys(entries).length;
  if (fieldOrder.length === 0) {
    return {
      tooltipCount,
      tooltipCoverage: 0,
    };
  }

  const coveredFieldCount = fieldOrder.filter((fieldKey) => fieldKey in entries)
    .length;

  return {
    tooltipCount,
    tooltipCoverage: Math.round((coveredFieldCount / fieldOrder.length) * 100),
  };
}

function deriveKnownValuesSpecDbNotReadyState({
  knownValuesTabActive,
  knownValuesIsError,
  knownValuesErrorMessage = '',
}: Pick<
  StudioPageRootDerivedStateOptions,
  'knownValuesTabActive' | 'knownValuesIsError' | 'knownValuesErrorMessage'
>): boolean {
  const normalizedErrorMessage = String(knownValuesErrorMessage).toLowerCase();
  return (
    knownValuesTabActive &&
    knownValuesIsError &&
    normalizedErrorMessage.includes('api 503') &&
    (normalizedErrorMessage.includes('specdb_not_ready') ||
      normalizedErrorMessage.includes('specdb not ready'))
  );
}

export function deriveStudioCompileStatus({
  mutationPending,
  mutationIsError,
  mutationErrorMessage,
  compileProcessRunning,
  compileProcessFailed,
  processExitCode,
  compileStale,
  runningLabel = 'Compiling...',
}: StudioCompileStatusOptions): StudioPageStatusPresentation | null {
  if (mutationPending || compileProcessRunning) {
    return {
      label: runningLabel,
      dot: 'sf-dot-neutral',
      text: 'sf-text-muted',
      border: 'sf-state-border-neutral-soft',
    };
  }

  if (mutationIsError) {
    return {
      label: mutationErrorMessage
        ? mutationErrorMessage.slice(0, 36)
        : 'Compile failed',
      dot: 'sf-danger-bg-soft0',
      text: 'sf-status-text-danger',
      border: 'sf-state-border-danger-soft',
    };
  }

  if (compileProcessFailed) {
    return {
      label:
        processExitCode !== null && processExitCode !== undefined
          ? `Compile failed (${processExitCode})`
          : 'Compile failed',
      dot: 'sf-danger-bg-soft0',
      text: 'sf-status-text-danger',
      border: 'sf-state-border-danger-soft',
    };
  }

  if (compileStale === true) {
    return {
      label: 'Not compiled',
      dot: 'sf-dot-warning',
      text: 'sf-status-text-warning',
      border: 'sf-state-border-warning-soft',
    };
  }

  if (compileStale === false) {
    return {
      label: 'Compiled',
      dot: 'sf-success-bg-500',
      text: 'sf-status-text-success',
      border: 'sf-state-border-success-soft',
    };
  }

  return null;
}

export function deriveStudioPageProcessState({
  processCommand,
  processRunning = false,
  processExitCode,
  compilePending,
  validatePending,
}: StudioPageProcessStateOptions): StudioPageProcessState {
  const processCommandToken = String(processCommand || '').toLowerCase();
  const isCompileProcessCommand =
    processCommandToken.includes('compile-rules') ||
    processCommandToken.includes('category-compile');
  const isValidateProcessCommand =
    processCommandToken.includes('validate-rules');
  const compileProcessRunning =
    Boolean(processRunning) && isCompileProcessCommand;
  const compileProcessFailed =
    !processRunning &&
    isCompileProcessCommand &&
    processExitCode !== null &&
    processExitCode !== undefined &&
    Number(processExitCode) !== 0;

  return {
    isCompileProcessCommand,
    isValidateProcessCommand,
    compileProcessRunning,
    compileProcessFailed,
    reportsTabRunning:
      compilePending ||
      validatePending ||
      (Boolean(processRunning) &&
        (isCompileProcessCommand || isValidateProcessCommand)),
  };
}

export function deriveStudioEnumListsWithValues(
  knownValuesRes?: StudioKnownValuesSource | null,
): StudioEnumListEntry[] {
  const specDbLists = Array.isArray(knownValuesRes?.enum_lists)
    ? knownValuesRes.enum_lists
    : [];
  if (specDbLists.length > 0) {
    return specDbLists
      .map((entry) => ({
        field: String(entry.field || ''),
        normalize: String(entry.normalize || 'lower_trim'),
        values: Array.isArray(entry.values) ? entry.values.map(String) : [],
      }))
      .filter((entry) => entry.field)
      .sort((a, b) => a.field.localeCompare(b.field));
  }

  const knownFields =
    knownValuesRes?.fields && typeof knownValuesRes.fields === 'object'
      ? Object.entries(knownValuesRes.fields)
      : [];
  if (knownFields.length > 0) {
    return knownFields
      .map(([field, values]) => ({
        field: String(field || ''),
        normalize: 'lower_trim',
        values: Array.isArray(values) ? values.map(String) : [],
      }))
      .filter((entry) => entry.field)
      .sort((a, b) => a.field.localeCompare(b.field));
  }

  return [];
}

export function deriveStudioFieldRows({
  fieldOrder,
  rules,
  resolveLabel,
}: StudioFieldRowsOptions): StudioFieldRow[] {
  return fieldOrder.map((key) => {
    const rule =
      rules[key] && typeof rules[key] === 'object'
        ? (rules[key] as Record<string, unknown>)
        : {};
    const contract =
      rule.contract && typeof rule.contract === 'object'
        ? (rule.contract as Record<string, unknown>)
        : {};

    return {
      key,
      label: resolveLabel(key, rule),
      group: String(rule.group || ''),
      type: String(contract.type || 'string'),
      required: String(rule.required_level || ''),
      unit: String(contract.unit || ''),
      enumName: String(rule.enum_name || ''),
    };
  });
}

export function deriveStudioPageShellState({
  fieldCount,
  compileErrorsCount,
  compileWarningsCount,
  saveStatus,
  compileStatus,
}: StudioPageShellStateOptions): StudioPageShellState {
  return {
    fieldCount,
    compileErrorsCount,
    compileWarningsCount,
    saveStatusLabel: saveStatus?.label || 'All saved',
    saveStatusDot: saveStatus?.dot || 'sf-success-bg-500',
    compileStatusLabel: compileStatus?.label || 'Compiled',
    compileStatusDot: compileStatus?.dot || 'sf-success-bg-500',
  };
}

export function deriveStudioPageViewState({
  activeTab,
  autoSaveAllEnabled,
  autoSaveEnabled,
  autoSaveMapEnabled,
  initialized,
  serverRules,
  serverFieldOrder,
  editedRules,
  editedFieldOrder,
}: StudioPageViewStateOptions): StudioPageViewState {
  return {
    knownValuesTabActive:
      activeTab === 'mapping' ||
      activeTab === 'keys' ||
      activeTab === 'contract',
    effectiveAutoSaveEnabled: autoSaveAllEnabled || autoSaveEnabled,
    effectiveAutoSaveMapEnabled: autoSaveAllEnabled || autoSaveMapEnabled,
    storeRules: initialized ? editedRules : serverRules,
    storeFieldOrder: initialized ? editedFieldOrder : serverFieldOrder,
    hasUnsavedChanges: Object.values(editedRules).some((rule) =>
      Boolean((rule as Record<string, unknown>)?._edited),
    ),
  };
}

export function deriveStudioPageRootDerivedState({
  fieldOrder,
  tooltipEntries,
  guardrails,
  knownValuesTabActive,
  knownValuesIsError,
  knownValuesErrorMessage = '',
}: StudioPageRootDerivedStateOptions): StudioPageRootDerivedState {
  return {
    ...deriveStudioGuardrailMessageState(guardrails),
    ...deriveStudioTooltipCoverageState(fieldOrder, tooltipEntries),
    knownValuesSpecDbNotReady: deriveKnownValuesSpecDbNotReadyState({
      knownValuesTabActive,
      knownValuesIsError,
      knownValuesErrorMessage,
    }),
  };
}
