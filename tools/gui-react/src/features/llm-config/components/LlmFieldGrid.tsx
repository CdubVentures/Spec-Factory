// WHY: Generic grid renderer for simple LLM settings (numbers, bools, strings).
// Reads labels, tips, and bounds from the registry SSOT.
// Adding a new simple LLM field = add one registry entry with the matching
// uiGroup — it auto-appears in the grid. Zero per-field JSX.

import { RUNTIME_SETTINGS_REGISTRY, REGISTRY_BOUNDS, type RegistryEntry } from '../../../shared/registryDerivedSettingsMaps.ts';
import type { NumberBound, RuntimeDraft } from '../../pipeline-settings/types/settingPrimitiveTypes.ts';
import { Tip } from '../../../shared/ui/feedback/Tip.tsx';

interface LlmFieldGridProps {
  /** Registry keys to render. Order is preserved. */
  keys: readonly string[];
  runtimeDraft: RuntimeDraft;
  inputCls: string;
  updateDraft: <K extends keyof RuntimeDraft>(key: K, value: RuntimeDraft[K]) => void;
  onNumberChange: <K extends keyof RuntimeDraft>(key: K, eventValue: string, bounds: NumberBound) => void;
  getNumberBounds: <K extends keyof RuntimeDraft>(key: K) => NumberBound;
  columns?: 2 | 3;
}

/** Convert camelCase key to "Camel Case" label */
function humanize(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

const _entryMap = new Map<string, RegistryEntry>();
for (const entry of RUNTIME_SETTINGS_REGISTRY) {
  _entryMap.set(entry.key, entry);
}

function renderField(
  entry: RegistryEntry,
  runtimeDraft: RuntimeDraft,
  inputCls: string,
  updateDraft: LlmFieldGridProps['updateDraft'],
  onNumberChange: LlmFieldGridProps['onNumberChange'],
  getNumberBounds: LlmFieldGridProps['getNumberBounds'],
) {
  const key = entry.key as keyof RuntimeDraft;
  const label = entry.uiLabel ?? humanize(entry.key);
  const tip = entry.uiTip ?? '';

  if (entry.type === 'int' || entry.type === 'float') {
    const step = entry.type === 'float' ? 0.01 : 1;
    return (
      <div key={entry.key} className="flex flex-col gap-1">
        <label className="sf-text-caption inline-flex items-center gap-1" style={{ color: 'var(--sf-muted)' }}>
          {label}
          <Tip text={tip} />
        </label>
        <input
          className={inputCls}
          type="number"
          step={step}
          value={runtimeDraft[key] as number}
          onChange={(e) => onNumberChange(key, e.target.value, getNumberBounds(key))}
        />
      </div>
    );
  }

  if (entry.type === 'bool') {
    return (
      <div key={entry.key} className="flex flex-col gap-1">
        <label className="sf-text-caption inline-flex items-center gap-1" style={{ color: 'var(--sf-muted)' }}>
          {label}
          <Tip text={tip} />
        </label>
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(runtimeDraft[key])}
          onClick={() => updateDraft(key, !runtimeDraft[key] as RuntimeDraft[typeof key])}
          className={`inline-flex w-full items-center justify-between sf-switch px-2.5 py-1.5 sf-text-label font-semibold transition ${
            runtimeDraft[key] ? 'sf-switch-on' : 'sf-switch-off'
          }`}
        >
          <span>{runtimeDraft[key] ? 'Enabled' : 'Disabled'}</span>
        </button>
      </div>
    );
  }

  // String / enum fallback
  const inputType = entry.secret ? 'password' : 'text';
  return (
    <div key={entry.key} className="flex flex-col gap-1">
      <label className="sf-text-caption inline-flex items-center gap-1" style={{ color: 'var(--sf-muted)' }}>
        {label}
        <Tip text={tip} />
      </label>
      <input
        className={inputCls}
        type={inputType}
        value={String(runtimeDraft[key] ?? '')}
        onChange={(e) => updateDraft(key, e.target.value as RuntimeDraft[typeof key])}
      />
    </div>
  );
}

/**
 * Renders a grid of simple LLM settings from registry metadata.
 * Pass explicit keys to control order and selection.
 */
export function LlmFieldGrid({
  keys,
  runtimeDraft,
  inputCls,
  updateDraft,
  onNumberChange,
  getNumberBounds,
  columns = 3,
}: LlmFieldGridProps) {
  const entries = keys.map((k) => _entryMap.get(k)).filter(Boolean) as RegistryEntry[];
  if (entries.length === 0) return null;

  const gridCls = columns === 2
    ? 'grid grid-cols-2 gap-x-3.5 gap-y-2.5'
    : 'grid grid-cols-3 gap-x-3.5 gap-y-2.5';

  return (
    <div className={gridCls}>
      {entries.map((entry) =>
        renderField(entry, runtimeDraft, inputCls, updateDraft, onNumberChange, getNumberBounds),
      )}
    </div>
  );
}

/**
 * Get all registry keys for a given uiCategory + uiGroup combo.
 * Use this to discover keys dynamically instead of hardcoding them.
 */
export function getLlmFieldKeys(uiGroup: string, uiCategory = 'extraction'): string[] {
  return RUNTIME_SETTINGS_REGISTRY
    .filter((e) =>
      e.uiCategory === uiCategory &&
      (e as unknown as Record<string, unknown>).uiGroup === uiGroup,
    )
    .map((e) => e.key);
}
