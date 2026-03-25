// WHY: Renders all settings for a specific section grouped by uiGroup.
// Heroes render at top (blue bg). Named groups render as collapsible blocks.
// Adding uiGroup to a registry entry auto-groups it — no per-setting .tsx code.

import { SettingGroupBlock } from './RuntimeFlowPrimitives.tsx';
import { GenericSettingRenderer } from './GenericSettingRenderer.tsx';
import { getGroupedSettingsForSection, getDisabledByKey } from '../state/settingsCategoryMaps.ts';
import type { SettingsCategoryId } from '../state/SettingsCategoryRegistry.ts';
import type { NumberBound } from '../../../shared/registryDerivedSettingsMaps.ts';

export interface GenericSectionPanelProps {
  categoryId: SettingsCategoryId;
  sectionId: string;
  runtimeDraft: Record<string, unknown>;
  onBoolChange: (key: string, next: boolean) => void;
  onNumberChange: (key: string, eventValue: string, bounds: NumberBound) => void;
  onStringChange: (key: string, value: string) => void;
  disabled?: boolean;
}

export function GenericSectionPanel({
  categoryId,
  sectionId,
  runtimeDraft,
  onBoolChange,
  onNumberChange,
  onStringChange,
  disabled = false,
}: GenericSectionPanelProps) {
  const { heroes, groups } = getGroupedSettingsForSection(categoryId, sectionId);
  if (heroes.length === 0 && groups.length === 0) return null;

  return (
    <>
      {/* Heroes: blue bg, ungrouped, always visible */}
      {heroes.map((entry) => (
        <GenericSettingRenderer
          key={entry.key}
          entry={entry}
          value={runtimeDraft[entry.key]}
          onBoolChange={onBoolChange}
          onNumberChange={onNumberChange}
          onStringChange={onStringChange}
          disabled={disabled}
        />
      ))}

      {/* Named groups: collapsible blocks */}
      {groups.map((group) => (
        <SettingGroupBlock
          key={group.label}
          title={group.label}
          collapsible={group.entries.length > 2}
          defaultCollapsed={group.collapsed}
          storageKey={`settings-group:${categoryId}:${sectionId}:${group.label}`}
        >
          {group.entries.map((entry) => {
            const parentKey = getDisabledByKey(entry.key);
            const isDisabled = parentKey ? !runtimeDraft[parentKey] : false;
            return (
              <GenericSettingRenderer
                key={entry.key}
                entry={entry}
                value={runtimeDraft[entry.key]}
                onBoolChange={onBoolChange}
                onNumberChange={onNumberChange}
                onStringChange={onStringChange}
                disabled={disabled || isDisabled}
              />
            );
          })}
        </SettingGroupBlock>
      ))}
    </>
  );
}
