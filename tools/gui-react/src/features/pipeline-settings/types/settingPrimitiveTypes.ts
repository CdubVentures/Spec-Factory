import type { ReactNode } from 'react';

export type { NumberBound, RuntimeDraft } from '../state/RuntimeFlowDraftContracts';

export interface SettingGroupBlockProps {
  title: string;
  children: ReactNode;
}

export interface SettingRowProps {
  label: string;
  tip: string;
  children: ReactNode;
  disabled?: boolean;
  description?: string;
}

export interface SettingToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}

export interface MasterSwitchRowProps {
  label: string;
  tip: string;
  children: ReactNode;
  disabled?: boolean;
  description?: string;
  hint?: string;
}

export interface AdvancedSettingsBlockProps {
  title: string;
  count: number;
  children: ReactNode;
}

export interface FlowOptionPanelProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  disabled?: boolean;
}
