import { useState } from 'react';
import { CONVERGENCE_KNOB_GROUPS, CONVERGENCE_SETTING_DEFAULTS, useConvergenceSettingsAuthority } from '../../stores/convergenceSettingsAuthority';
import { useSourceStrategyAuthority, type SourceStrategyRow } from '../../stores/sourceStrategyAuthority';
import { useUiStore } from '../../stores/uiStore';
import { useSettingsAuthorityStore } from '../../stores/settingsAuthorityStore';

const cardCls = 'bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-4';
const inputCls = 'px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 w-full';

function KnobInput({
  knob,
  value,
  onChange,
}: {
  knob: (typeof CONVERGENCE_KNOB_GROUPS)[number]['knobs'][number];
  value: number | boolean | undefined;
  onChange: (v: number | boolean) => void;
}) {
  if (knob.type === 'bool') {
    const fallback = CONVERGENCE_SETTING_DEFAULTS[knob.key as keyof typeof CONVERGENCE_SETTING_DEFAULTS];
    const boolValue = typeof value === 'boolean'
      ? value
      : (typeof fallback === 'boolean' ? fallback : false);
    return (
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={boolValue}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{knob.label}</span>
      </label>
    );
  }

  const defaultValue = CONVERGENCE_SETTING_DEFAULTS[knob.key as keyof typeof CONVERGENCE_SETTING_DEFAULTS];
  const fallback = typeof defaultValue === 'number' ? defaultValue : knob.min;
  const numValue = typeof value === 'number' ? value : fallback;
  const step = 'step' in knob ? knob.step : 1;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-gray-500">{knob.label}</span>
        <span className="text-[11px] font-mono text-gray-700 dark:text-gray-300">
          {knob.type === 'float' ? numValue.toFixed(2) : numValue}
        </span>
      </div>
      <input
        type="range"
        className="w-full"
        min={knob.min}
        max={knob.max}
        step={step}
        value={numValue}
        onChange={(e) => {
          const parsed = knob.type === 'float'
            ? Number.parseFloat(e.target.value)
            : Number.parseInt(e.target.value, 10);
          onChange(Number.isFinite(parsed) ? parsed : fallback);
        }}
      />
      <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
        <span>{knob.min}</span>
        <span>{knob.max}</span>
      </div>
    </div>
  );
}

function SourceStrategyTable({
  rows,
  isLoading,
  isSaving,
  onToggleRow,
  onDeleteRow,
}: {
  rows: SourceStrategyRow[];
  isLoading: boolean;
  isSaving: boolean;
  onToggleRow: (row: SourceStrategyRow) => void;
  onDeleteRow: (id: number) => void;
}) {
  if (isLoading) return <p className="text-xs text-gray-500">Loading sources...</p>;
  if (!rows || rows.length === 0) return <p className="text-xs text-gray-500">No source strategies configured.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500">
            <th className="py-2 px-2">Host</th>
            <th className="py-2 px-2">Name</th>
            <th className="py-2 px-2">Type</th>
            <th className="py-2 px-2">Tier</th>
            <th className="py-2 px-2">Method</th>
            <th className="py-2 px-2">Priority</th>
            <th className="py-2 px-2">Enabled</th>
            <th className="py-2 px-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
              <td className="py-1.5 px-2 font-mono">{row.host}</td>
              <td className="py-1.5 px-2">{row.display_name}</td>
              <td className="py-1.5 px-2">
                <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-[10px]">{row.source_type}</span>
              </td>
              <td className="py-1.5 px-2">{row.default_tier}</td>
              <td className="py-1.5 px-2">{row.discovery_method}</td>
              <td className="py-1.5 px-2">{row.priority}</td>
              <td className="py-1.5 px-2">
                <button
                  onClick={() => onToggleRow(row)}
                  disabled={isSaving}
                  className={`px-2 py-0.5 rounded text-[10px] border ${
                    row.enabled
                      ? 'border-emerald-300 text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800'
                      : 'border-gray-300 text-gray-500 bg-gray-50 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600'
                  }`}
                >
                  {row.enabled ? 'ON' : 'OFF'}
                </button>
              </td>
              <td className="py-1.5 px-2">
                <button
                  onClick={() => {
                    if (!confirm(`Delete ${row.host}?`)) return;
                    onDeleteRow(row.id);
                  }}
                  disabled={isSaving}
                  className="text-[10px] text-red-500 hover:text-red-700"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PipelineSettingsPage() {
  const category = useUiStore((s) => s.category);
  const isAll = category === 'all';
  const convergenceSettingsReady = useSettingsAuthorityStore((s) => s.snapshot.convergenceReady);
  const sourceStrategySettingsReady = useSettingsAuthorityStore((s) => s.snapshot.sourceStrategyReady);
  const [sourceStrategySaveState, setSourceStrategySaveState] = useState<{
    kind: 'idle' | 'ok' | 'error';
    message: string;
  }>({ kind: 'idle', message: '' });

  const [saveStatus, setSaveStatus] = useState<{
    kind: 'idle' | 'ok' | 'partial' | 'error';
    message: string;
  }>({ kind: 'idle', message: '' });

  const {
    settings,
    dirty,
    isLoading,
    isSaving,
    updateSetting,
    reload,
    save,
  } = useConvergenceSettingsAuthority({
    onPersisted: (result) => {
      const rejectedKeys = Object.keys(result.rejected);
      if (rejectedKeys.length === 0 && result.ok) {
        setSaveStatus({ kind: 'ok', message: 'Pipeline settings saved.' });
        return;
      }
      if (rejectedKeys.length > 0) {
        setSaveStatus({
          kind: 'partial',
          message: `Pipeline settings partially saved. Rejected ${rejectedKeys.length} key(s): ${rejectedKeys.join(', ')}`,
        });
        return;
      }
      setSaveStatus({ kind: 'error', message: 'Pipeline settings save failed.' });
    },
    onError: (error) => {
      setSaveStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Pipeline settings save failed.',
      });
    },
  });

  const {
    rows: sourceStrategyRows,
    isLoading: sourceStrategyLoading,
    isSaving: sourceStrategySaving,
    toggleEnabled,
    deleteRow,
  } = useSourceStrategyAuthority({
    category,
    enabled: !isAll,
    onError: (error) => {
      setSourceStrategySaveState({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Source strategy update failed.',
      });
    },
    onToggled: () => {
      setSourceStrategySaveState({ kind: 'ok', message: 'Source strategy updated.' });
    },
    onDeleted: () => {
      setSourceStrategySaveState({ kind: 'ok', message: 'Source strategy removed.' });
    },
  });

  const convergenceHydrated = convergenceSettingsReady && !isLoading;
  const sourceStrategyHydrated = isAll || (sourceStrategySettingsReady && !sourceStrategyLoading);

  return (
    <div className="space-y-4">
      <div className={cardCls}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Pipeline Settings</h2>
            <p className="text-xs text-gray-500 mt-1">
              Convergence loop, consensus scoring, SERP triage, and retrieval knobs.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { void reload(); }}
              disabled={!convergenceHydrated || isSaving}
              className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Reload
            </button>
            <button
              onClick={save}
              disabled={!convergenceHydrated || !dirty || isSaving}
              className="px-3 py-1.5 text-xs bg-accent text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
        <p
          className={`text-[11px] mt-2 ${
            isSaving
              ? 'text-blue-600 dark:text-blue-400'
              : saveStatus.kind === 'error'
              ? 'text-rose-600 dark:text-rose-300'
              : saveStatus.kind === 'partial'
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-gray-500'
          }`}
        >
          {isSaving
            ? 'Saving...'
            : saveStatus.kind === 'error' || saveStatus.kind === 'partial'
            ? saveStatus.message
            : dirty
            ? 'Unsaved changes'
            : 'All changes saved.'}
        </p>
      </div>

      {!convergenceHydrated ? (
        <p className="text-xs text-gray-500">Loading settings...</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {CONVERGENCE_KNOB_GROUPS.map((group) => (
            <div key={group.label} className={cardCls}>
              <h3 className="text-xs font-semibold mb-3">{group.label}</h3>
              <div className="space-y-3">
                {group.knobs.map((knob) => (
                  <KnobInput
                    key={knob.key}
                    knob={knob}
                    value={settings[knob.key] as number | boolean | undefined}
                    onChange={(v) => updateSetting(knob.key, v)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={cardCls}>
        <div className="text-xs text-gray-700 dark:text-gray-300 mb-2">
          {sourceStrategySaving
            ? 'Updating source strategy...'
            : sourceStrategySaveState.kind === 'error'
              ? sourceStrategySaveState.message
              : sourceStrategySaveState.kind === 'ok'
                ? sourceStrategySaveState.message
                : ''}
        </div>
        <h3 className="text-xs font-semibold mb-3">Source Strategy</h3>
        <p className="text-[11px] text-gray-500 mb-3">
          Configurable source table — replaces hardcoded adapters. LLM predicts URLs for enabled sources.
        </p>
        {isAll ? (
          <p className="text-xs text-gray-500">Select a specific category to manage source strategy rows.</p>
        ) : !sourceStrategyHydrated ? (
          <p className="text-xs text-gray-500">Loading source strategy...</p>
        ) : (
          <SourceStrategyTable
            rows={sourceStrategyRows}
            isLoading={sourceStrategyLoading}
            isSaving={sourceStrategySaving}
            onToggleRow={(row) => {
              toggleEnabled(row);
            }}
            onDeleteRow={(id) => {
              deleteRow(id);
            }}
          />
        )}
      </div>
    </div>
  );
}

