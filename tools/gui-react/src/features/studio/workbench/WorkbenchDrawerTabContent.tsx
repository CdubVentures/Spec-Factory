// WHY: Single dispatcher routes the active drawer tab to the matching shared
// Key*Body component. Same body components are used by the Key Navigator —
// 1:1 SSOT between the two surfaces.
import type { ComponentType } from 'react';
import type { EnumEntry } from '../../../types/studio.ts';
import type { BadgeSlot, DrawerTab } from './workbenchTypes.ts';
// WHY: Re-exported through WorkbenchDrawerTabPanels.tsx so tests can stub a single
// module (matches the prior shape of this dispatcher's tab imports).
import {
  KeyContractBody,
  KeyPriorityBody,
  KeyAiAssistBody,
  KeyEnumBody,
  KeyConstraintsBody,
  KeyEvidenceBody,
  KeyTooltipBody,
  KeySearchHintsBody,
} from './WorkbenchDrawerTabPanels.tsx';
import { useStudioFieldRulesState } from '../state/studioFieldRulesController.ts';

export interface WorkbenchDrawerTabContentProps {
  activeTab: DrawerTab;
  category: string;
  fieldKey: string;
  rule: Record<string, unknown>;
  knownValues: Record<string, string[]>;
  enumLists: EnumEntry[];
  fieldOrder: string[];
  onUpdate: (path: string, value: unknown) => void;
  onNavigate: (key: string) => void;
  isEgLocked?: boolean;
  isIdentityLocked?: boolean;
  disabled?: boolean;
  B: BadgeSlot;
}

export function WorkbenchDrawerTabContent({
  activeTab,
  category,
  fieldKey,
  rule,
  knownValues,
  enumLists,
  fieldOrder,
  onUpdate,
  onNavigate,
  disabled = false,
  B,
}: WorkbenchDrawerTabContentProps) {
  const { editedRules } = useStudioFieldRulesState();

  // WHY: Bodies use a uniform updateField(key, path, value) signature so they
  // can be reused in the Key Navigator. The drawer's onUpdate already binds
  // the field key, so we adapt the signature here.
  const updateField = (_key: string, path: string, value: unknown) => onUpdate(path, value);

  const baseProps = {
    selectedKey: fieldKey,
    currentRule: rule,
    updateField,
    category,
    BadgeRenderer: B as ComponentType<{ p: string }>,
    saveIfAutoSaveEnabled: () => {},
    disabled,
  };

  if (activeTab === 'contract') {
    return <KeyContractBody {...baseProps} />;
  }
  if (activeTab === 'priority') {
    return <KeyPriorityBody {...baseProps} />;
  }
  if (activeTab === 'aiAssist') {
    return <KeyAiAssistBody {...baseProps} />;
  }
  if (activeTab === 'enum') {
    return <KeyEnumBody {...baseProps} knownValues={knownValues} enumLists={enumLists} />;
  }
  if (activeTab === 'constraints') {
    return (
      <KeyConstraintsBody
        {...baseProps}
        fieldOrder={fieldOrder}
        editedRules={editedRules}
      />
    );
  }
  if (activeTab === 'evidence') {
    return <KeyEvidenceBody {...baseProps} />;
  }
  if (activeTab === 'tooltip') {
    return <KeyTooltipBody {...baseProps} />;
  }
  // search
  void onNavigate;
  return <KeySearchHintsBody {...baseProps} />;
}
