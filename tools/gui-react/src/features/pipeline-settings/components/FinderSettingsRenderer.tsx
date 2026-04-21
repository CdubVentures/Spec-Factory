import { useEffect, useMemo, useState } from 'react';
import { useModuleSettingsAuthority } from '../state/moduleSettingsAuthority.ts';
import { NumberStepper } from '../../../shared/ui/forms/NumberStepper.tsx';
import {
  FINDER_SETTINGS_REGISTRY,
  FINDER_IDS_WITH_SETTINGS,
  type FinderSettingsEntry,
  type FinderIdWithSettings,
} from '../state/finderSettingsRegistry.generated.ts';
import { getSettingWidget } from './widgets/widgetRegistry.ts';
// WHY: Side-effect import registers all built-in widgets with the registry at module load.
import './widgets/index.ts';

interface FinderSettingsRendererProps {
  finderId: string;
  category: string;
}

export function FinderSettingsRenderer({ finderId, category }: FinderSettingsRendererProps) {
  const { settings, isSaving, saveSetting } = useModuleSettingsAuthority({ category, moduleId: finderId });

  const schema = isFinderIdWithSettings(finderId) ? FINDER_SETTINGS_REGISTRY[finderId] : null;

  const { groups, claimedKeys } = useMemo(() => groupSchema(schema ?? []), [schema]);

  if (!schema) {
    return (
      <p className="sf-text-caption sf-text-muted">
        No settings schema registered for &ldquo;{finderId}&rdquo;.
      </p>
    );
  }

  const visibleEntries = schema.filter((e) => !e.hidden && !claimedKeys.has(e.key));
  if (visibleEntries.length === 0) {
    return (
      <div className="sf-surface-elevated sf-border-soft rounded p-4">
        <p className="sf-text-caption sf-text-muted">
          This module has no per-category settings.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map(({ label, entries }) => (
        <SettingsGroup key={label} label={label}>
          {entries.map((entry) => (
            <SettingsEntryRow
              key={entry.key}
              entry={entry}
              settings={settings}
              category={category}
              isSaving={isSaving}
              onSave={saveSetting}
            />
          ))}
        </SettingsGroup>
      ))}
    </div>
  );
}

function isFinderIdWithSettings(id: string): id is FinderIdWithSettings {
  return (FINDER_IDS_WITH_SETTINGS as readonly string[]).includes(id);
}

interface GroupedSchema {
  groups: { label: string; entries: FinderSettingsEntry[] }[];
  claimedKeys: Set<string>;
}

function groupSchema(schema: readonly FinderSettingsEntry[]): GroupedSchema {
  const claimedKeys = new Set<string>();
  for (const entry of schema) {
    if (entry.widget && entry.widgetProps) {
      const child = (entry.widgetProps as { childKeys?: readonly string[] }).childKeys;
      if (Array.isArray(child)) child.forEach((k) => claimedKeys.add(k));
    }
  }

  const groupMap = new Map<string, FinderSettingsEntry[]>();
  for (const entry of schema) {
    if (entry.hidden || claimedKeys.has(entry.key)) continue;
    const label = entry.uiGroup ?? 'General';
    const list = groupMap.get(label) ?? [];
    list.push(entry);
    groupMap.set(label, list);
  }

  return {
    groups: Array.from(groupMap, ([label, entries]) => ({ label, entries })),
    claimedKeys,
  };
}

function SettingsGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="sf-surface-elevated sf-border-soft rounded p-4 space-y-3">
      <h3 className="sf-text-label sf-text-primary">{label}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

interface EntryRowProps {
  entry: FinderSettingsEntry;
  settings: Record<string, string>;
  category: string;
  isSaving: boolean;
  onSave: (key: string, value: string) => void;
}

function SettingsEntryRow({ entry, settings, category, isSaving, onSave }: EntryRowProps) {
  const rawValue = settings[entry.key] ?? stringifyDefault(entry);
  const disabled = isSaving || Boolean(entry.disabledBy && settings[entry.disabledBy] === 'false');

  if (entry.widget) {
    const Widget = getSettingWidget(entry.widget);
    if (Widget) {
      return (
        <Widget
          entry={entry}
          value={rawValue}
          allSettings={settings}
          category={category}
          isSaving={isSaving}
          onSave={onSave}
        />
      );
    }
    return (
      <LabelledRow entry={entry}>
        <p className="sf-text-caption sf-text-muted">
          Widget &ldquo;{entry.widget}&rdquo; is not registered.
        </p>
        <StringControl
          value={rawValue}
          disabled={disabled}
          secret={entry.secret}
          onCommit={(next) => onSave(entry.key, next)}
        />
      </LabelledRow>
    );
  }

  return (
    <LabelledRow entry={entry}>
      <TypedControl entry={entry} value={rawValue} disabled={disabled} onSave={onSave} />
    </LabelledRow>
  );
}

function LabelledRow({ entry, children }: { entry: FinderSettingsEntry; children: React.ReactNode }) {
  const label = entry.uiLabel ?? entry.key;
  return (
    <div className="space-y-1">
      <span className="sf-text-label sf-text-primary">{label}</span>
      {entry.uiTip && <p className="sf-text-caption sf-text-muted">{entry.uiTip}</p>}
      <div>{children}</div>
    </div>
  );
}

interface TypedControlProps {
  entry: FinderSettingsEntry;
  value: string;
  disabled: boolean;
  onSave: (key: string, value: string) => void;
}

function TypedControl({ entry, value, disabled, onSave }: TypedControlProps) {
  switch (entry.type) {
    case 'bool':
      return (
        <ToggleSwitch
          value={value}
          disabled={disabled}
          ariaLabel={entry.uiLabel ?? entry.key}
          onChange={(next) => onSave(entry.key, next)}
        />
      );
    case 'int':
    case 'float':
      return (
        <NumberStepper
          value={value}
          className="w-32"
          min={entry.min}
          max={entry.max}
          step={entry.type === 'int' ? 1 : 0.01}
          disabled={disabled}
          ariaLabel={entry.key}
          onCommit={(next) => onSave(entry.key, next)}
        />
      );
    case 'enum': {
      const allowed = entry.allowed ?? [];
      const optionLabels = entry.optionLabels ?? {};
      return (
        <select
          className="sf-input w-full"
          value={value}
          disabled={disabled}
          onChange={(e) => onSave(entry.key, e.target.value)}
        >
          {allowed.map((opt) => (
            <option key={opt} value={opt}>
              {optionLabels[opt] ?? opt}
            </option>
          ))}
        </select>
      );
    }
    case 'intMap':
      return (
        <IntMapControl
          entry={entry}
          value={value}
          disabled={disabled}
          onSave={onSave}
        />
      );
    case 'string':
    default:
      return (
        <StringControl
          value={value}
          disabled={disabled}
          secret={entry.secret}
          onCommit={(next) => onSave(entry.key, next)}
        />
      );
  }
}

function StringControl({
  value,
  disabled,
  secret,
  onCommit,
}: {
  value: string;
  disabled: boolean;
  secret?: boolean;
  onCommit: (next: string) => void;
}) {
  const isLong = value.length > 80 || value.includes('\n');
  if (secret || !isLong) {
    return (
      <input
        type={secret ? 'password' : 'text'}
        className="sf-input w-full"
        defaultValue={value}
        disabled={disabled}
        onBlur={(e) => {
          if (e.target.value !== value) onCommit(e.target.value);
        }}
      />
    );
  }
  return (
    <textarea
      className="sf-input w-full min-h-[80px]"
      defaultValue={value}
      disabled={disabled}
      onBlur={(e) => {
        if (e.target.value !== value) onCommit(e.target.value);
      }}
    />
  );
}

function ToggleSwitch({
  value,
  disabled,
  ariaLabel,
  onChange,
}: {
  value: string;
  disabled: boolean;
  ariaLabel: string;
  onChange: (next: string) => void;
}) {
  const isOn = value === 'true';
  const activeStyle: React.CSSProperties = {
    background: 'rgb(var(--sf-color-text-primary-rgb) / 0.12)',
    color: 'rgb(var(--sf-color-text-primary-rgb))',
  };
  const idleStyle: React.CSSProperties = {
    color: 'rgb(var(--sf-color-text-muted-rgb))',
  };
  return (
    <div
      className="sf-stepper sf-stepper-compact inline-flex items-stretch"
      role="radiogroup"
      aria-label={ariaLabel}
      style={{ height: '1.75rem' }}
    >
      <button
        type="button"
        role="radio"
        aria-checked={isOn}
        disabled={disabled}
        onClick={() => { if (!isOn) onChange('true'); }}
        className="sf-stepper-btn sf-stepper-btn-compact"
        style={isOn ? activeStyle : idleStyle}
      >
        On
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={!isOn}
        disabled={disabled}
        onClick={() => { if (isOn) onChange('false'); }}
        className="sf-stepper-btn sf-stepper-btn-compact"
        style={!isOn ? activeStyle : idleStyle}
      >
        Off
      </button>
    </div>
  );
}

function IntMapControl({
  entry,
  value,
  disabled,
  onSave,
}: {
  entry: FinderSettingsEntry;
  value: string;
  disabled: boolean;
  onSave: (key: string, value: string) => void;
}) {
  const keys = entry.keys ?? [];
  const keyLabels = entry.keyLabels ?? {};

  const parsedFromValue = useMemo<Record<string, number>>(() => {
    const fallback: Record<string, number> = {};
    for (const k of keys) fallback[k] = 0;
    if (!value) return fallback;
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const out: Record<string, number> = { ...fallback };
        for (const k of keys) {
          const v = (parsed as Record<string, unknown>)[k];
          const n = typeof v === 'number' ? v : Number(v);
          if (Number.isFinite(n)) out[k] = Math.round(n);
        }
        return out;
      }
    } catch {
      // fall through to fallback
    }
    return fallback;
  }, [value, keys]);

  const [localMap, setLocalMap] = useState<Record<string, number>>(parsedFromValue);

  // WHY: sync local state when the authoritative value changes (e.g. another
  // stepper commit landed, or the settings query refetched for this category).
  useEffect(() => {
    setLocalMap(parsedFromValue);
  }, [parsedFromValue]);

  const commitKey = (k: string, nextRaw: string) => {
    const n = Number(nextRaw);
    const coerced = Number.isFinite(n) ? Math.round(n) : 0;
    const clamped =
      entry.min !== undefined && coerced < entry.min
        ? entry.min
        : entry.max !== undefined && coerced > entry.max
          ? entry.max
          : coerced;
    const next: Record<string, number> = { ...localMap, [k]: clamped };
    setLocalMap(next);
    const ordered: Record<string, number> = {};
    for (const declared of keys) {
      const v = next[declared];
      ordered[declared] = typeof v === 'number' && Number.isFinite(v) ? v : 0;
    }
    onSave(entry.key, JSON.stringify(ordered));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
      {keys.map((k) => {
        const current = localMap[k] ?? 0;
        const atMin = entry.min !== undefined && current <= entry.min;
        const atMax = entry.max !== undefined && current >= entry.max;
        return (
          <div
            key={k}
            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}
          >
            <span
              className="sf-text-caption sf-text-primary"
              style={{ flex: '0 0 12rem', width: '12rem' }}
            >
              {keyLabels[k] ?? k}
            </span>
            <div
              className="sf-stepper sf-stepper-compact"
              style={{ display: 'inline-flex', alignItems: 'stretch', width: '8rem', height: '1.75rem' }}
            >
              <button
                type="button"
                className="sf-stepper-btn sf-stepper-btn-compact"
                disabled={disabled || atMin}
                aria-label={`Decrease ${entry.key}-${k}`}
                onClick={() => commitKey(k, String(current - 1))}
              >
                −
              </button>
              <input
                type="number"
                className="sf-stepper-input text-center font-mono"
                value={String(current)}
                min={entry.min}
                max={entry.max}
                step={1}
                disabled={disabled}
                aria-label={`${entry.key}-${k}`}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n)) {
                    setLocalMap((prev) => ({ ...prev, [k]: Math.round(n) }));
                  }
                }}
                onBlur={(e) => commitKey(k, e.target.value)}
              />
              <button
                type="button"
                className="sf-stepper-btn sf-stepper-btn-compact"
                disabled={disabled || atMax}
                aria-label={`Increase ${entry.key}-${k}`}
                onClick={() => commitKey(k, String(current + 1))}
              >
                +
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function stringifyDefault(entry: FinderSettingsEntry): string {
  if (entry.type === 'bool') return entry.default ? 'true' : 'false';
  if (entry.type === 'intMap' && entry.keys && entry.default && typeof entry.default === 'object') {
    const ordered: Record<string, number> = {};
    const def = entry.default as Record<string, number>;
    for (const k of entry.keys) ordered[k] = def[k] ?? 0;
    return JSON.stringify(ordered);
  }
  return String(entry.default);
}
