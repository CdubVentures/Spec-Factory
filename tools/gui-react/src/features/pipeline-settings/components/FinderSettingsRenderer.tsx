import { useMemo } from 'react';
import { useModuleSettingsAuthority } from '../state/moduleSettingsAuthority.ts';
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
  const rawValue = settings[entry.key] ?? stringifyDefault(entry.default);
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
          Widget &ldquo;{entry.widget}&rdquo; is not registered. Falling back to raw JSON editor.
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
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            className="sf-checkbox"
            checked={value === 'true'}
            disabled={disabled}
            onChange={(e) => onSave(entry.key, e.target.checked ? 'true' : 'false')}
          />
          <span className="sf-text-caption sf-text-muted">
            {value === 'true' ? 'Enabled' : 'Disabled'}
          </span>
        </label>
      );
    case 'int':
    case 'float':
      return (
        <input
          type="number"
          className="sf-input w-32"
          value={value}
          min={entry.min}
          max={entry.max}
          step={entry.type === 'int' ? 1 : 'any'}
          disabled={disabled}
          onBlur={(e) => onSave(entry.key, e.target.value)}
          onChange={(e) => {
            // WHY: Local state would require a lift-up; blurring commits. Keep it simple.
            e.currentTarget.value = e.target.value;
          }}
        />
      );
    case 'enum':
      return (
        <select
          className="sf-input w-full"
          value={value}
          disabled={disabled}
          onChange={(e) => onSave(entry.key, e.target.value)}
        >
          {(entry.allowed ?? []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
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
  // Textareas for long values; single-line input for secrets.
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

function stringifyDefault(def: boolean | number | string): string {
  if (typeof def === 'boolean') return def ? 'true' : 'false';
  return String(def);
}
