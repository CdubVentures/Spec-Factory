// WHY: Renders a single setting based on its registry metadata.
// No per-setting .tsx code needed — the registry entry drives the control type.

import {
  SettingRow,
  MasterSwitchRow,
  SettingToggle,
  SettingNumberInput,
} from './RuntimeFlowPrimitives';
import {
  REGISTRY_BOUNDS,
  REGISTRY_ENUM_MAP,
  type RegistryEntry,
  type NumberBound,
} from '../../../shared/registryDerivedSettingsMaps';

export interface GenericSettingRendererProps {
  entry: RegistryEntry;
  value: unknown;
  onBoolChange: (key: string, next: boolean) => void;
  onNumberChange: (key: string, eventValue: string, bounds: NumberBound) => void;
  onStringChange: (key: string, value: string) => void;
  disabled?: boolean;
}

const INPUT_CLASS =
  'sf-input w-full py-2 sf-text-label leading-5 focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-60';

/** Convert camelCase key to "Camel Case" label */
function humanize(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

function renderBoolControl(
  entry: RegistryEntry,
  value: unknown,
  onBoolChange: GenericSettingRendererProps['onBoolChange'],
  disabled: boolean,
) {
  const checked = Boolean(value);
  const label = entry.uiLabel ?? humanize(entry.key);
  const tip = entry.uiTip ?? '';
  const toggle = <SettingToggle checked={checked} onChange={(next) => onBoolChange(entry.key, next)} disabled={disabled} />;

  if (entry.uiHero) {
    return (
      <MasterSwitchRow label={label} tip={tip}>
        {toggle}
      </MasterSwitchRow>
    );
  }
  return (
    <SettingRow label={label} tip={tip} disabled={disabled}>
      {toggle}
    </SettingRow>
  );
}

function renderNumberControl(
  entry: RegistryEntry,
  value: unknown,
  onNumberChange: GenericSettingRendererProps['onNumberChange'],
  disabled: boolean,
) {
  const bounds = REGISTRY_BOUNDS[entry.key];
  if (!bounds) return null;

  const label = entry.uiLabel ?? humanize(entry.key);
  const tip = entry.uiTip ?? '';
  const numValue = typeof value === 'number' ? value : Number(value) || 0;

  return (
    <SettingRow label={label} tip={tip} disabled={disabled}>
      <SettingNumberInput
        draftKey={entry.key as keyof import('../types/settingPrimitiveTypes').RuntimeDraft}
        value={numValue}
        bounds={bounds}
        disabled={disabled}
        onNumberChange={(_, eventValue, b) => onNumberChange(entry.key, eventValue, b)}
      />
    </SettingRow>
  );
}

function renderEnumControl(
  entry: RegistryEntry,
  value: unknown,
  onStringChange: GenericSettingRendererProps['onStringChange'],
  disabled: boolean,
) {
  const options = REGISTRY_ENUM_MAP[entry.key] ?? [];
  const label = entry.uiLabel ?? humanize(entry.key);
  const tip = entry.uiTip ?? '';
  const strValue = typeof value === 'string' ? value : String(value ?? '');

  return (
    <SettingRow label={label} tip={tip} disabled={disabled}>
      <select
        value={strValue}
        onChange={(e) => onStringChange(entry.key, e.target.value)}
        disabled={disabled}
        className={INPUT_CLASS}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </SettingRow>
  );
}

function renderStringControl(
  entry: RegistryEntry,
  value: unknown,
  onStringChange: GenericSettingRendererProps['onStringChange'],
  disabled: boolean,
) {
  const label = entry.uiLabel ?? humanize(entry.key);
  const tip = entry.uiTip ?? '';
  const strValue = typeof value === 'string' ? value : String(value ?? '');
  const inputType = entry.secret ? 'password' : 'text';

  return (
    <SettingRow label={label} tip={tip} disabled={disabled}>
      <input
        type={inputType}
        value={strValue}
        onChange={(e) => onStringChange(entry.key, e.target.value)}
        disabled={disabled}
        className={INPUT_CLASS}
      />
    </SettingRow>
  );
}

export function GenericSettingRenderer({
  entry,
  value,
  onBoolChange,
  onNumberChange,
  onStringChange,
  disabled = false,
}: GenericSettingRendererProps) {
  switch (entry.type) {
    case 'bool':
      return renderBoolControl(entry, value, onBoolChange, disabled);
    case 'int':
    case 'float':
      return renderNumberControl(entry, value, onNumberChange, disabled);
    case 'enum':
    case 'csv_enum':
      return renderEnumControl(entry, value, onStringChange, disabled);
    case 'string':
      return renderStringControl(entry, value, onStringChange, disabled);
    default:
      return null;
  }
}
