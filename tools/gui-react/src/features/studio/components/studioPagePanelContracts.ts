import type { ProcessStatus } from '../../../types/events';
import type {
  ArtifactEntry,
  ComponentDbResponse,
  ComponentSource,
  EnumEntry,
  FieldRule,
  StudioConfig,
} from '../../../types/studio';
import type { StudioTabId } from '../state/studioPageTabs';

export interface StudioPageActivePanelMappingProps {
  wbMap: StudioConfig;
  tooltipCount: number;
  tooltipCoverage: number;
  tooltipFiles: string[];
  onSaveMap: (map: StudioConfig) => void;
  saving: boolean;
  saveSuccess: boolean;
  saveErrorMessage: string;
  rules: Record<string, FieldRule>;
  fieldOrder: string[];
  knownValues: Record<string, string[]>;
  autoSaveMapEnabled: boolean;
  setAutoSaveMapEnabled: (nextValue: boolean) => void;
  autoSaveMapLocked: boolean;
}

export interface StudioPageActivePanelKeyProps {
  category: string;
  selectedKey: string;
  onSelectKey: (nextKey: string) => void;
  onSave: () => void;
  saving: boolean;
  saveSuccess: boolean;
  knownValues: Record<string, string[]>;
  enumLists: EnumEntry[];
  componentDb: ComponentDbResponse;
  componentSources: ComponentSource[];
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
}

export interface StudioPageActivePanelContractProps {
  category: string;
  knownValues: Record<string, string[]>;
  enumLists: EnumEntry[];
  componentDb: ComponentDbResponse;
  componentSources: ComponentSource[];
  wbMap: StudioConfig;
  guardrails?: Record<string, unknown>;
  onSave: () => void;
  saving: boolean;
  saveSuccess: boolean;
  autoSaveEnabled: boolean;
  setAutoSaveEnabled: (nextValue: boolean) => void;
  autoSaveLocked: boolean;
  autoSaveLockReason: string;
}

export interface StudioPageActivePanelReportsProps {
  artifacts: ArtifactEntry[];
  compileErrors: string[];
  compileWarnings: string[];
  guardrails?: Record<string, unknown> | null;
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

export interface StudioPageActivePanelProps {
  activeTab: StudioTabId;
  category: string;
  knownValuesSpecDbNotReady: boolean;
  mappingTabProps: StudioPageActivePanelMappingProps;
  keyNavigatorTabProps: StudioPageActivePanelKeyProps;
  contractTabProps: StudioPageActivePanelContractProps;
  reportsTabProps: StudioPageActivePanelReportsProps;
}
