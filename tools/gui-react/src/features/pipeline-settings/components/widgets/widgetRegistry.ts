import type { ComponentType } from 'react';
import type { FinderSettingsEntry } from '../../state/finderSettingsRegistry.generated.ts';

export interface FinderSettingWidgetProps {
  entry: FinderSettingsEntry;
  value: string;
  allSettings: Record<string, string>;
  category: string;
  isSaving: boolean;
  onSave: (key: string, value: string) => void;
}

export type FinderSettingWidget = ComponentType<FinderSettingWidgetProps>;

const REGISTRY = new Map<string, FinderSettingWidget>();

export function registerSettingWidget(name: string, component: FinderSettingWidget): void {
  if (!name) throw new Error('registerSettingWidget: name is required');
  if (REGISTRY.has(name)) throw new Error(`registerSettingWidget: "${name}" is already registered`);
  REGISTRY.set(name, component);
}

export function getSettingWidget(name: string): FinderSettingWidget | null {
  return REGISTRY.get(name) ?? null;
}

export function isSettingWidgetRegistered(name: string): boolean {
  return REGISTRY.has(name);
}

export function clearSettingWidgetRegistry(): void {
  REGISTRY.clear();
}
