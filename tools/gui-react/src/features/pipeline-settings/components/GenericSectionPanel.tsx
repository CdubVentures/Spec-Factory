// WHY: Renders all settings for a specific section as a SettingGroupBlock card.
// Hero settings render above the block; regular settings inside the bordered card.

import { SettingGroupBlock } from './RuntimeFlowPrimitives.tsx';
import { GenericSettingRenderer } from './GenericSettingRenderer.tsx';
import { getSettingsForSection, isHeroSetting, getDisabledByKey } from '../state/settingsCategoryMaps.ts';
import { findSection } from '../state/SettingsCategoryRegistry.ts';
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
        </SettingGroupBlock>
      )}
    </>
  );
}
