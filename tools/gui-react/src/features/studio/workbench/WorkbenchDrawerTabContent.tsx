import type { EnumEntry, ComponentDbResponse, ComponentSource } from '../../../types/studio.ts';
import type { DrawerTab } from './workbenchTypes.ts';
import {
  ContractTab,
  DepsTab,
  EnumTab,
  EvidenceTab,
  PreviewTab,
  SearchTab,
  type BadgeSlot,
} from './WorkbenchDrawerTabPanels.tsx';

export interface WorkbenchDrawerTabContentProps {
  activeTab: DrawerTab;
  category: string;
  fieldKey: string;
  rule: Record<string, unknown>;
  knownValues: Record<string, string[]>;
  enumLists: EnumEntry[];
  componentDb: ComponentDbResponse;
  componentSources: ComponentSource[];
  consistencyPending: boolean;
  consistencyMessage: string;
  consistencyError: string;
  onRunConsistency: (options?: {
    formatGuidance?: string;
    reviewEnabled?: boolean;
  }) => Promise<void>;
  onUpdate: (path: string, value: unknown) => void;
  onNavigate: (key: string) => void;
  isEgLocked?: boolean;
  B: BadgeSlot;
}

export function WorkbenchDrawerTabContent({
  activeTab,
  category,
  fieldKey,
  rule,
  knownValues,
  enumLists,
  componentDb,
  componentSources,
  consistencyPending,
  consistencyMessage,
  consistencyError,
  onRunConsistency,
  onUpdate,
  onNavigate,
  isEgLocked = false,
  B,
}: WorkbenchDrawerTabContentProps) {
  if (activeTab === 'contract') {
    return <ContractTab fieldKey={fieldKey} rule={rule} onUpdate={onUpdate} B={B} />;
  }
  if (activeTab === 'enum') {
    return (
      <EnumTab
        category={category}
        fieldKey={fieldKey}
        rule={rule}
        knownValues={knownValues}
        enumLists={enumLists}
        onUpdate={onUpdate}
        onRunConsistency={onRunConsistency}
        consistencyPending={consistencyPending}
        consistencyMessage={consistencyMessage}
        consistencyError={consistencyError}
        isEgLocked={isEgLocked}
        B={B}
      />
    );
  }
  if (activeTab === 'evidence') {
    return <EvidenceTab rule={rule} onUpdate={onUpdate} B={B} />;
  }
  if (activeTab === 'search') {
    return <SearchTab rule={rule} onUpdate={onUpdate} B={B} />;
  }
  if (activeTab === 'deps') {
    return (
      <DepsTab
        rule={rule}
        fieldKey={fieldKey}
        onUpdate={onUpdate}
        componentSources={componentSources}
        knownValues={knownValues}
        onNavigate={onNavigate}
        B={B}
      />
    );
  }
  return (
    <PreviewTab
      fieldKey={fieldKey}
      rule={rule}
      knownValues={knownValues}
      componentDb={componentDb}
      enumLists={enumLists}
    />
  );
}
