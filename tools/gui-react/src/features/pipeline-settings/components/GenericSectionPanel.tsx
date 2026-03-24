// WHY: Renders all settings for a specific section within a category.
// Hero settings render standalone above the group block; regular settings
// are wrapped in a SettingGroupBlock with the section label.

import { SettingGroupBlock } from './RuntimeFlowPrimitives';
import { GenericSettingRenderer } from './GenericSettingRenderer';
import { getSettingsForSection, isHeroSetting, getDisabledByKey } from '../state/settingsCategoryMaps';
import { findSection } from '../state/SettingsCategoryRegistry';
import type { SettingsCategoryId } from '../state/SettingsCategoryRegistry';
import type { NumberBound } from '../../../shared/registryDerivedSettingsMaps';

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
  const entries = getSettingsForSection(categoryId, sectionId);
  if (entries.length === 0) return null;

  const heroEntries = entries.filter(isHeroSetting);
  const regularEntries = entries.filter((e) => !isHeroSetting(e));
  const section = findSection(categoryId, sectionId);
  const sectionLabel = section?.label ?? sectionId;

  return (
    <>
      {heroEntries.map((entry) => (
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
      {regularEntries.length > 0 && (
        <SettingGroupBlock title={sectionLabel}>
          <div className="space-y-2.5">
            {regularEntries.map((entry) => {
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
          </div>
        </SettingGroupBlock>
      )}
    </>
  );
}
