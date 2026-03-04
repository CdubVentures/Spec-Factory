import { useState } from 'react';
import {
  CONVERGENCE_KNOB_GROUPS,
  parseConvergenceNumericInput,
  readConvergenceKnobValue,
  useConvergenceSettingsAuthority,
} from '../../stores/convergenceSettingsAuthority';
import { useSourceStrategyAuthority, type SourceStrategyRow } from '../../stores/sourceStrategyAuthority';
import { useUiStore } from '../../stores/uiStore';
import { useSettingsAuthorityStore } from '../../stores/settingsAuthorityStore';
import { RuntimeSettingsFlowCard } from './RuntimeSettingsFlowCard';
import { usePersistedTab } from '../../stores/tabStore';
import { Tip } from '../../components/common/Tip';

type PipelineSectionId = 'runtime-flow' | 'convergence' | 'source-strategy';

const PIPELINE_SECTION_IDS = [
  'runtime-flow',
  'convergence',
  'source-strategy',
] as const satisfies readonly PipelineSectionId[];

interface PipelineSection {
  id: PipelineSectionId;
  label: string;
  phase: string;
  subtitle: string;
  tip: string;
}

const PIPELINE_SECTIONS: PipelineSection[] = [
  {
    id: 'runtime-flow',
    label: 'Runtime Flow',
    phase: '01-06',
    subtitle: 'Pipeline execution',
    tip: 'Configure runtime behavior in pipeline order from bootstrap through fallback routing.',
  },
  {
    id: 'convergence',
    label: 'Convergence',
    phase: 'ALGO',
    subtitle: 'Scoring & retrieval',
    tip: 'Tune consensus scoring, SERP triage thresholds, and retrieval parameters.',
  },
  {
    id: 'source-strategy',
    label: 'Source Strategy',
    phase: 'SRCS',
    subtitle: 'Per-host source rules',
    tip: 'Configure per-host fetch and discovery strategies for each category.',
  },
];

interface SourceStrategyDraft {
  host: string;
  display_name: string;
  source_type: string;
  default_tier: string;
  discovery_method: string;
  search_pattern: string;
  priority: string;
  enabled: string;
  category_scope: string;
  notes: string;
}

function toSourceStrategyDraftValue(value: unknown, fallback = ''): string {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function toSourceStrategyNumber(value: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function makeSourceStrategyDraft(category: string): SourceStrategyDraft {
  return {
    host: '',
    display_name: '',
    source_type: 'lab_review',
    default_tier: '2',
    discovery_method: 'search_first',
    search_pattern: '',
    priority: '50',
    enabled: '1',
    category_scope: category === 'all' ? '' : category,
    notes: '',
  };
}

function sourceStrategyDraftFromRow(row: SourceStrategyRow): SourceStrategyDraft {
  return {
    host: toSourceStrategyDraftValue(row.host),
    display_name: toSourceStrategyDraftValue(row.display_name),
    source_type: toSourceStrategyDraftValue(row.source_type, 'lab_review'),
    default_tier: String(row.default_tier ?? 2),
    discovery_method: toSourceStrategyDraftValue(row.discovery_method, 'search_first'),
    search_pattern: toSourceStrategyDraftValue(row.search_pattern),
    priority: String(row.priority ?? 50),
    enabled: String(row.enabled ? 1 : 0),
    category_scope: toSourceStrategyDraftValue(row.category_scope),
    notes: toSourceStrategyDraftValue(row.notes),
  };
}

function sourceStrategyPayloadFromDraft(draft: SourceStrategyDraft): Partial<SourceStrategyRow> {
  const host = String(draft.host || '').trim();
  return {
    host,
    display_name: String(draft.display_name || '').trim() || host,
    source_type: String(draft.source_type || '').trim() || 'lab_review',
    default_tier: toSourceStrategyNumber(draft.default_tier, 2, 1, 5),
    discovery_method: String(draft.discovery_method || '').trim() || 'search_first',
    search_pattern: String(draft.search_pattern || '').trim() || null,
    priority: toSourceStrategyNumber(draft.priority, 50, 0, 1000),
    enabled: String(draft.enabled || '1').trim() === '0' ? 0 : 1,
    category_scope: String(draft.category_scope || '').trim() || null,
    notes: String(draft.notes || '').trim() || null,
  };
}

function SectionNavIcon({ id, active }: { id: PipelineSectionId; active: boolean }) {
  const toneClass = active
    ? 'sf-callout sf-callout-info'
    : 'sf-callout sf-callout-neutral';
  return (
    <span
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded ${toneClass}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {id === 'runtime-flow' && (
          <>
            <path d="M4 7h6l2 2h8" />
            <path d="M4 17h6l2-2h8" />
            <circle cx="4" cy="7" r="1.5" />
            <circle cx="4" cy="17" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <path d="M12 9.5v5" />
          </>
        )}
        {id === 'convergence' && (
          <>
            <circle cx="12" cy="12" r="8" />
            <circle cx="12" cy="12" r="3.25" />
            <path d="M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4" />
          </>
        )}
        {id === 'source-strategy' && (
          <>
            <ellipse cx="12" cy="6" rx="7" ry="2.5" />
            <path d="M5 6v5c0 1.4 3.13 2.5 7 2.5s7-1.1 7-2.5V6" />
            <path d="M5 11v5c0 1.4 3.13 2.5 7 2.5s7-1.1 7-2.5v-5" />
            <path d="M3 18h4M17 18h4" />
          </>
        )}
      </svg>
    </span>
  );
}

function ConvergenceGroupIcon({ label, active }: { label: string; active: boolean }) {
  const toneClass = active
    ? 'sf-callout sf-callout-info'
    : 'sf-callout sf-callout-neutral';

  return (
    <span
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded ${toneClass}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4.5 w-4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {label === 'Convergence Loop' ? (
          <>
            <circle cx="12" cy="12" r="7" />
            <path d="M15.5 8.5 17 7l1.5 1.5" />
            <path d="M8.5 15.5 7 17l-1.5-1.5" />
          </>
        ) : null}
        {label === 'NeedSet Identity Caps' ? (
          <>
            <path d="m12 3 7 3.5v5.8c0 4.4-2.9 7.1-7 8-4.1-.9-7-3.6-7-8V6.5z" />
            <path d="M9 12h6" />
            <path d="M9 9h6" />
          </>
        ) : null}
        {label === 'NeedSet Freshness Decay' ? (
          <>
            <circle cx="12" cy="12" r="7" />
            <path d="M12 8v4l3 2" />
            <path d="M8 4.5h8" />
          </>
        ) : null}
        {label === 'Consensus - LLM Weights' ? (
          <>
            <circle cx="6" cy="8" r="2" />
            <circle cx="18" cy="8" r="2" />
            <circle cx="12" cy="16" r="2" />
            <path d="M8 8h8" />
            <path d="M7.7 9.4 10.6 14" />
            <path d="M16.3 9.4 13.4 14" />
          </>
        ) : null}
        {label === 'Consensus - Tier Weights' ? (
          <>
            <path d="M6 18V8" />
            <path d="M12 18V6" />
            <path d="M18 18V10" />
            <path d="M4 18h16" />
          </>
        ) : null}
        {label === 'SERP Triage' ? (
          <>
            <path d="M4 6h16l-6 7v5l-4-2v-3z" />
            <path d="M9 10h6" />
          </>
        ) : null}
        {label === 'Retrieval' ? (
          <>
            <circle cx="10.5" cy="10.5" r="5.5" />
            <path d="m15 15 4 4" />
            <path d="M8.5 10.5h4" />
          </>
        ) : null}
        {label === 'Lane Concurrency' ? (
          <>
            <path d="M4 7h11" />
            <path d="M4 12h11" />
            <path d="M4 17h11" />
            <circle cx="18" cy="7" r="1.5" />
            <circle cx="18" cy="12" r="1.5" />
            <circle cx="18" cy="17" r="1.5" />
          </>
        ) : null}
      </svg>
    </span>
  );
}

function KnobInput({
  knob,
  value,
  onChange,
}: {
  knob: (typeof CONVERGENCE_KNOB_GROUPS)[number]['knobs'][number];
  value: number | boolean | undefined;
  onChange: (v: number | boolean) => void;
}) {
  const knobSettings = value === undefined ? undefined : { [knob.key]: value };

  if (knob.type === 'bool') {
    const boolValue = readConvergenceKnobValue(knobSettings, knob);
    return (
      <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_minmax(220px,300px)] xl:items-center">
        <label className="inline-flex min-w-0 flex-wrap items-center gap-1 sf-text-label font-semibold" style={{ color: 'var(--sf-text)' }}>
          {knob.label}
          <Tip text={knob.tip || ''} />
          <input
            type="checkbox"
            checked={Boolean(boolValue)}
            onChange={(event) => onChange(event.target.checked)}
            className="h-4 w-4 opacity-0"
          />
        </label>
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(boolValue)}
          aria-label={knob.label}
          onClick={() => onChange(!Boolean(boolValue))}
          className={`inline-flex w-full items-center justify-between sf-switch px-2.5 py-1.5 sf-text-label font-semibold transition focus:outline-none focus:ring-2 focus:ring-blue-500/25 ${
            boolValue
              ? 'sf-switch-on'
              : 'sf-switch-off'
          }`}
        >
          <span>{boolValue ? 'Enabled' : 'Disabled'}</span>
          <span
            className={`relative inline-flex h-5 w-9 items-center rounded-full sf-switch-track transition ${
              boolValue
                ? 'sf-switch-track-on'
                : ''
            }`}
            aria-hidden="true"
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full sf-switch-thumb transition-transform ${
                boolValue ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </span>
        </button>
      </div>
    );
  }

  const resolvedValue = readConvergenceKnobValue(knobSettings, knob);
  const numValue = typeof resolvedValue === 'number' ? resolvedValue : knob.min;
  const step = 'step' in knob ? knob.step : 1;

  return (
    <div className="space-y-1.5 min-w-0">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="inline-flex min-w-0 flex-wrap items-center gap-1 sf-text-label font-semibold" style={{ color: 'var(--sf-text)' }}>
          {knob.label}
          <Tip text={knob.tip || ''} />
        </span>
        <span className="shrink-0 rounded sf-callout sf-callout-neutral px-1.5 py-0.5 sf-text-label font-mono">
          {knob.type === 'float' ? numValue.toFixed(2) : numValue}
        </span>
      </div>
      <input
        type="range"
        className="w-full accent-blue-600"
        min={knob.min}
        max={knob.max}
        step={step}
        value={numValue}
        onChange={(e) => {
          onChange(parseConvergenceNumericInput(knob, e.target.value, numValue));
        }}
      />
      <div className="mt-0.5 flex justify-between sf-text-label" style={{ color: 'var(--sf-muted)' }}>
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
  onEditRow,
  onDeleteRow,
}: {
  rows: SourceStrategyRow[];
  isLoading: boolean;
  isSaving: boolean;
  onToggleRow: (row: SourceStrategyRow) => void;
  onEditRow: (row: SourceStrategyRow) => void;
  onDeleteRow: (id: number) => void;
}) {
  if (isLoading)
    return (
      <p className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
        Loading sources...
      </p>
    );
  if (!rows || rows.length === 0)
    return (
      <p className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
        No source strategies configured.
      </p>
    );

  return (
    <div className="sf-table-shell overflow-x-auto rounded">
      <table className="w-full sf-text-label">
        <thead>
          <tr className="sf-table-head border-b" style={{ borderColor: 'var(--sf-surface-border)' }}>
            {['Host', 'Name', 'Type', 'Tier', 'Method', 'Priority', 'Enabled', '', ''].map((h) => (
              <th
                key={h}
                className="sf-table-head-cell px-3 py-2.5"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="sf-table-row border-b"
              style={{ borderColor: 'rgb(var(--sf-color-border-default-rgb) / 0.78)' }}
            >
              <td className="px-3 py-2.5 font-mono sf-text-label" style={{ color: 'var(--sf-text)' }}>
                {row.host}
              </td>
              <td className="px-3 py-2.5" style={{ color: 'var(--sf-text)' }}>
                {row.display_name}
              </td>
              <td className="px-3 py-2.5">
                <span className="inline-flex rounded sf-chip-neutral px-1.5 py-0.5 sf-text-label font-medium">
                  {row.source_type}
                </span>
              </td>
              <td className="px-3 py-2.5" style={{ color: 'var(--sf-text)' }}>
                {row.default_tier}
              </td>
              <td className="px-3 py-2.5" style={{ color: 'var(--sf-muted)' }}>
                {row.discovery_method}
              </td>
              <td className="px-3 py-2.5 font-mono sf-text-label" style={{ color: 'var(--sf-text)' }}>
                {row.priority}
              </td>
              <td className="px-3 py-2.5">
                <button
                  onClick={() => onToggleRow(row)}
                  disabled={isSaving}
                  className={`inline-flex min-w-[60px] items-center justify-center rounded sf-switch px-2.5 py-1 sf-text-label font-semibold transition-colors disabled:opacity-50 ${
                    row.enabled
                      ? 'sf-switch-on'
                      : 'sf-switch-off'
                  }`}
                >
                  {row.enabled ? 'ON' : 'OFF'}
                </button>
              </td>
              <td className="px-3 py-2.5">
                <button
                  onClick={() => onEditRow(row)}
                  disabled={isSaving}
                  className="rounded sf-icon-button px-2 py-1 sf-text-label font-semibold transition-colors disabled:opacity-50"
                >
                  Edit
                </button>
              </td>
              <td className="px-3 py-2.5">
                <button
                  onClick={() => {
                    if (!confirm(`Delete ${row.host}?`)) return;
                    onDeleteRow(row.id);
                  }}
                  disabled={isSaving}
                  className="rounded sf-danger-button px-2 py-1 sf-text-label font-semibold transition-colors disabled:opacity-50"
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
  const sourceStrategySettingsReady = useSettingsAuthorityStore(
    (s) => s.snapshot.sourceStrategyReady,
  );

  const [sourceStrategySaveState, setSourceStrategySaveState] = useState<{
    kind: 'idle' | 'ok' | 'error';
    message: string;
  }>({ kind: 'idle', message: '' });
  const [sourceDraftMode, setSourceDraftMode] = useState<'create' | 'edit' | null>(null);
  const [sourceDraftId, setSourceDraftId] = useState<number | null>(null);
  const [sourceDraft, setSourceDraft] = useState<SourceStrategyDraft>(() => makeSourceStrategyDraft(category));

  const [saveStatus, setSaveStatus] = useState<{
    kind: 'idle' | 'ok' | 'partial' | 'error';
    message: string;
  }>({ kind: 'idle', message: '' });
  const [runtimeHeaderActionMount, setRuntimeHeaderActionMount] = useState<HTMLDivElement | null>(null);

  const [activeSection, setActiveSection] = usePersistedTab<PipelineSectionId>(
    'pipeline-settings:active-section',
    'runtime-flow',
    { validValues: PIPELINE_SECTION_IDS },
  );

  const convergenceGroupLabels = CONVERGENCE_KNOB_GROUPS.map((g) => g.label);
  const [activeKnobGroupLabel, setActiveKnobGroupLabel] = usePersistedTab<string>(
    'pipeline-settings:convergence:knob-group',
    convergenceGroupLabels.find((label) => label === 'SERP Triage') ?? convergenceGroupLabels[0] ?? '',
  );
  const activeGroup =
    CONVERGENCE_KNOB_GROUPS.find((g) => g.label === activeKnobGroupLabel) ??
    CONVERGENCE_KNOB_GROUPS[0];

  const { settings, dirty, isLoading, isSaving, updateSetting, reload, save } =
    useConvergenceSettingsAuthority({
      onPersisted: (result) => {
        const rejectedKeys = Object.keys(result.rejected);
        if (rejectedKeys.length === 0 && result.ok) {
          setSaveStatus({ kind: 'ok', message: 'Convergence settings saved.' });
          return;
        }
        if (rejectedKeys.length > 0) {
          setSaveStatus({
            kind: 'partial',
            message: `Partially saved. Rejected ${rejectedKeys.length} key(s): ${rejectedKeys.join(', ')}`,
          });
          return;
        }
        setSaveStatus({ kind: 'error', message: 'Convergence settings save failed.' });
      },
      onError: (error) => {
        setSaveStatus({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Convergence settings save failed.',
        });
      },
    });

  const {
    rows: sourceStrategyRows,
    isLoading: sourceStrategyLoading,
    isSaving: sourceStrategySaving,
    createRow,
    updateRow,
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
    onCreated: () => {
      setSourceStrategySaveState({ kind: 'ok', message: 'Source strategy created.' });
    },
    onUpdated: () => {
      setSourceStrategySaveState({ kind: 'ok', message: 'Source strategy updated.' });
    },
    onDeleted: () => {
      setSourceStrategySaveState({ kind: 'ok', message: 'Source strategy removed.' });
    },
  });

  const convergenceHydrated = convergenceSettingsReady && !isLoading;
  const sourceStrategyHydrated = isAll || (sourceStrategySettingsReady && !sourceStrategyLoading);
  const activeSectionData =
    PIPELINE_SECTIONS.find((s) => s.id === activeSection) ?? PIPELINE_SECTIONS[0];

  const convergenceStatusText = isSaving
    ? 'Saving...'
    : saveStatus.kind === 'error' || saveStatus.kind === 'partial'
      ? saveStatus.message
      : dirty
        ? 'Unsaved changes'
        : saveStatus.kind === 'ok'
          ? 'All changes saved.'
          : '';

  const convergenceStatusClass = isSaving
    ? 'sf-status-text-info'
    : saveStatus.kind === 'error'
      ? 'sf-status-text-danger'
      : saveStatus.kind === 'partial'
        ? 'sf-status-text-warning'
        : dirty
          ? 'sf-status-text-warning'
          : 'sf-status-text-muted';

  function beginCreateSourceDraft() {
    setSourceDraftMode('create');
    setSourceDraftId(null);
    setSourceDraft(makeSourceStrategyDraft(category));
  }

  function beginEditSourceDraft(row: SourceStrategyRow) {
    setSourceDraftMode('edit');
    setSourceDraftId(row.id);
    setSourceDraft(sourceStrategyDraftFromRow(row));
  }

  function cancelSourceDraft() {
    setSourceDraftMode(null);
    setSourceDraftId(null);
  }

  function updateSourceDraft<K extends keyof SourceStrategyDraft>(key: K, value: SourceStrategyDraft[K]) {
    setSourceDraft((previous) => ({ ...previous, [key]: value }));
  }

  function saveRowDraft() {
    const host = String(sourceDraft.host || '').trim();
    if (!host) {
      setSourceStrategySaveState({ kind: 'error', message: 'Host is required.' });
      return;
    }
    const payload = sourceStrategyPayloadFromDraft(sourceDraft);
    if (sourceDraftMode === 'create') {
      createRow(payload);
      cancelSourceDraft();
      return;
    }
    if (sourceDraftMode === 'edit' && sourceDraftId !== null) {
      updateRow(sourceDraftId, payload);
      cancelSourceDraft();
    }
  }

  const sourceInputCls = 'w-full rounded sf-input px-2.5 py-2 sf-text-label';

  return (
    <div
      className="flex h-full min-h-0 rounded overflow-hidden sf-shell border"
      style={{ borderColor: 'var(--sf-surface-border)' }}
    >
      {/* â”€â”€ Left sidebar â”€â”€ */}
      <aside className="sf-sidebar w-60 shrink-0 min-h-0 flex flex-col gap-0.5 overflow-y-auto overflow-x-hidden p-3">
        <div
          className="mb-3 px-2 pt-1 sf-text-caption font-bold uppercase tracking-widest"
          style={{ color: 'var(--sf-muted)' }}
        >
          Pipeline Settings
        </div>
        {PIPELINE_SECTIONS.map((section) => {
          const isActive = activeSection === section.id;
          return (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`group w-full min-h-[74px] sf-nav-item px-2.5 py-2.5 text-left ${isActive ? 'sf-nav-item-active' : ''}`}
            >
              <div className="flex items-center gap-2.5">
                <SectionNavIcon id={section.id} active={isActive} />
                <div className="min-w-0 flex-1">
                  <div
                    className="sf-text-label font-semibold leading-5"
                    style={{ color: isActive ? 'rgb(var(--sf-color-accent-strong-rgb))' : 'var(--sf-text)' }}
                  >
                    {section.label}
                  </div>
                  <div
                    className="sf-text-caption leading-4"
                    style={{ color: 'var(--sf-muted)' }}
                  >
                    {section.subtitle}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </aside>

      {/* â”€â”€ Right main panel â”€â”€ */}
      <div className="sf-shell-main flex-1 min-w-0 min-h-0 overflow-y-auto overflow-x-hidden p-4 md:p-5 space-y-4">
        {/* Section breadcrumb header */}
        <div
          className="flex items-start justify-between gap-4 pb-4 border-b"
          style={{ borderColor: 'var(--sf-surface-border)' }}
        >
          <div className="flex items-start gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold" style={{ color: 'var(--sf-text)' }}>
                  {activeSectionData.label}
                </h2>
                <Tip text={activeSectionData.tip} />
              </div>
              <p className="mt-1 sf-text-label" style={{ color: 'var(--sf-muted)' }}>
                {activeSectionData.subtitle}
              </p>
            </div>
          </div>

          {/* Convergence save controls â€” contextual to the active section */}
          <div className="flex flex-wrap items-start justify-end gap-3 shrink-0">
            {activeSection === 'runtime-flow' ? (
              <div
                ref={setRuntimeHeaderActionMount}
                className="flex flex-wrap items-center gap-2"
              />
            ) : null}
            {activeSection === 'convergence' ? (
              <div className="flex items-center gap-2">
                {convergenceStatusText ? (
                  <p className={`sf-text-label font-semibold ${convergenceStatusClass}`}>
                    {convergenceStatusText}
                  </p>
                ) : null}
                <button
                  onClick={() => {
                    void reload();
                  }}
                  disabled={!convergenceHydrated || isSaving}
                  className="rounded sf-icon-button px-3 py-1.5 sf-text-label transition-colors disabled:opacity-50"
                >
                  Reload
                </button>
                <button
                  onClick={save}
                  disabled={!convergenceHydrated || !dirty || isSaving}
                  className="rounded sf-primary-button px-3 py-1.5 sf-text-label transition-colors disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            ) : null}
            {activeSection === 'source-strategy' ? (
              <div className="flex items-center gap-2">
                {sourceStrategySaving ? (
                  <span className="sf-status-text-info sf-text-label font-semibold">Updating...</span>
                ) : sourceStrategySaveState.kind === 'error' ? (
                  <span className="sf-status-text-danger sf-text-label font-semibold">
                    {sourceStrategySaveState.message}
                  </span>
                ) : sourceStrategySaveState.kind === 'ok' ? (
                  <span className="sf-status-text-muted sf-text-label font-semibold">
                    {sourceStrategySaveState.message}
                  </span>
                ) : null}
                {!isAll ? (
                  <button
                    type="button"
                    onClick={beginCreateSourceDraft}
                    disabled={sourceStrategySaving}
                    className="rounded sf-primary-button px-2.5 py-1 sf-text-label font-semibold transition-colors disabled:opacity-50"
                  >
                    Add Source
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {/* â”€â”€ Runtime Flow â”€â”€ */}
        {activeSection === 'runtime-flow' && (
          <RuntimeSettingsFlowCard
            actionPortalTarget={runtimeHeaderActionMount}
            suppressInlineHeaderControls
          />
        )}

        {/* â”€â”€ Convergence â”€â”€ */}
        {activeSection === 'convergence' && (
          <div
            className={`grid min-h-0 grid-cols-1 gap-3 xl:grid-cols-[280px_minmax(0,1fr)] ${
              !convergenceHydrated ? 'opacity-60 pointer-events-none select-none' : ''
            }`}
          >
            {/* Knob group sub-sidebar */}
            <aside className="rounded sf-surface-elevated p-2.5 sm:p-3 flex min-h-0 flex-col">
              <div className="mb-2 px-2 sf-text-label font-semibold uppercase tracking-wide" style={{ color: 'var(--sf-muted)' }}>
                Convergence
              </div>
              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden pr-1">
                {CONVERGENCE_KNOB_GROUPS.map((group) => {
                  const isGroupActive = activeKnobGroupLabel === group.label;
                  return (
                    <button
                      key={group.label}
                      onClick={() => setActiveKnobGroupLabel(group.label)}
                      className={`group w-full min-h-[74px] sf-nav-item px-2.5 py-2.5 text-left ${isGroupActive ? 'sf-nav-item-active' : ''}`}
                    >
                      <div className="flex items-start gap-2">
                        <ConvergenceGroupIcon label={group.label} active={isGroupActive} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="sf-text-label font-semibold leading-5">
                              {group.label}
                            </div>
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full"
                              style={{
                                backgroundColor: isGroupActive
                                  ? 'rgb(var(--sf-color-accent-rgb))'
                                  : 'rgb(var(--sf-color-border-subtle-rgb) / 0.7)',
                              }}
                              aria-hidden="true"
                            />
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* Knob detail panel */}
            <section className="space-y-3 rounded sf-surface-elevated p-3 md:p-4 min-h-0 overflow-x-hidden">
              {!convergenceHydrated ? (
                <p className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
                  Loading settings...
                </p>
              ) : activeGroup ? (
                <>
                  <header className="rounded sf-surface-elevated px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2">
                        <ConvergenceGroupIcon label={activeGroup.label} active />
                        <div>
                          <h3 className="text-base font-semibold" style={{ color: 'var(--sf-text)' }}>
                            {activeGroup.label}
                          </h3>
                          <p className="sf-text-label" style={{ color: 'var(--sf-muted)' }}>
                            Tune convergence controls for this section.
                          </p>
                        </div>
                      </div>
                    </div>
                  </header>
                  <div className="space-y-4">
                    {activeGroup.knobs.map((knob) => (
                      <KnobInput
                        key={knob.key}
                        knob={knob}
                        value={settings[knob.key] as number | boolean | undefined}
                        onChange={(v) => updateSetting(knob.key, v)}
                      />
                    ))}
                  </div>
                </>
              ) : null}
            </section>
          </div>

        )}
        {/* â”€â”€ Source Strategy â”€â”€ */}
        {activeSection === 'source-strategy' && (
          <div className="space-y-3 rounded sf-surface-elevated p-3 md:p-4">
            <header className="rounded sf-surface-elevated px-3 py-2.5">
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex items-start gap-2">
                  <SectionNavIcon id="source-strategy" active />
                  <div>
                    <h3 className="text-sm font-semibold" style={{ color: 'var(--sf-text)' }}>
                      Source Strategy
                    </h3>
                    <p className="mt-0.5 sf-text-label" style={{ color: 'var(--sf-muted)' }}>
                      Configurable source table. LLM predicts URLs for enabled sources per category.
                    </p>
                  </div>
                </div>
              </div>
            </header>
            {isAll ? (
              <p className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
                Select a specific category to manage source strategy rows.
              </p>
            ) : !sourceStrategyHydrated ? (
              <p className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
                Loading source strategy...
              </p>
            ) : (
              <>
                <SourceStrategyTable
                  rows={sourceStrategyRows}
                  isLoading={sourceStrategyLoading}
                  isSaving={sourceStrategySaving}
                  onToggleRow={(row) => {
                    toggleEnabled(row);
                  }}
                  onEditRow={(row) => {
                    beginEditSourceDraft(row);
                  }}
                  onDeleteRow={(id) => {
                    deleteRow(id);
                  }}
                />
                {sourceDraftMode ? (
                  <section className="rounded sf-surface-elevated p-3 space-y-3">
                    <header className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold" style={{ color: 'var(--sf-text)' }}>
                        {sourceDraftMode === 'create' ? 'Create Source Strategy Row' : 'Edit Source Strategy Row'}
                      </h4>
                      <p className="sf-text-label" style={{ color: 'var(--sf-muted)' }}>
                        Category: {category}
                      </p>
                    </header>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <label className="space-y-1">
                        <span className="sf-text-label font-semibold" style={{ color: 'var(--sf-text)' }}>Host</span>
                        <input
                          value={sourceDraft.host}
                          onChange={(event) => updateSourceDraft('host', event.target.value)}
                          className={sourceInputCls}
                          placeholder="example.com"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="sf-text-label font-semibold" style={{ color: 'var(--sf-text)' }}>Display Name</span>
                        <input
                          value={sourceDraft.display_name}
                          onChange={(event) => updateSourceDraft('display_name', event.target.value)}
                          className={sourceInputCls}
                          placeholder="Example Source"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="sf-text-label font-semibold" style={{ color: 'var(--sf-text)' }}>Source Type</span>
                        <input
                          value={sourceDraft.source_type}
                          onChange={(event) => updateSourceDraft('source_type', event.target.value)}
                          className={sourceInputCls}
                          placeholder="lab_review"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="sf-text-label font-semibold" style={{ color: 'var(--sf-text)' }}>Default Tier</span>
                        <input
                          type="number"
                          min={1}
                          max={5}
                          value={sourceDraft.default_tier}
                          onChange={(event) => updateSourceDraft('default_tier', event.target.value)}
                          className={sourceInputCls}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="sf-text-label font-semibold" style={{ color: 'var(--sf-text)' }}>Discovery Method</span>
                        <input
                          value={sourceDraft.discovery_method}
                          onChange={(event) => updateSourceDraft('discovery_method', event.target.value)}
                          className={sourceInputCls}
                          placeholder="search_first"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="sf-text-label font-semibold" style={{ color: 'var(--sf-text)' }}>Priority</span>
                        <input
                          type="number"
                          min={0}
                          max={1000}
                          value={sourceDraft.priority}
                          onChange={(event) => updateSourceDraft('priority', event.target.value)}
                          className={sourceInputCls}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="sf-text-label font-semibold" style={{ color: 'var(--sf-text)' }}>Enabled</span>
                        <select
                          value={sourceDraft.enabled}
                          onChange={(event) => updateSourceDraft('enabled', event.target.value)}
                          className={sourceInputCls}
                        >
                          <option value="1">on</option>
                          <option value="0">off</option>
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="sf-text-label font-semibold" style={{ color: 'var(--sf-text)' }}>Category Scope</span>
                        <input
                          value={sourceDraft.category_scope}
                          onChange={(event) => updateSourceDraft('category_scope', event.target.value)}
                          className={sourceInputCls}
                          placeholder={category}
                        />
                      </label>
                    </div>
                    <label className="space-y-1 block">
                      <span className="sf-text-label font-semibold" style={{ color: 'var(--sf-text)' }}>Search Pattern</span>
                      <input
                        value={sourceDraft.search_pattern}
                        onChange={(event) => updateSourceDraft('search_pattern', event.target.value)}
                        className={sourceInputCls}
                        placeholder="{brand} {model} specs"
                      />
                    </label>
                    <label className="space-y-1 block">
                      <span className="sf-text-label font-semibold" style={{ color: 'var(--sf-text)' }}>Notes</span>
                      <textarea
                        value={sourceDraft.notes}
                        onChange={(event) => updateSourceDraft('notes', event.target.value)}
                        className={`${sourceInputCls} min-h-[84px]`}
                      />
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={saveRowDraft}
                        disabled={sourceStrategySaving}
                        className="rounded sf-primary-button px-3 py-1.5 sf-text-label font-semibold transition-colors disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={cancelSourceDraft}
                        disabled={sourceStrategySaving}
                        className="rounded sf-icon-button px-3 py-1.5 sf-text-label font-semibold transition-colors disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </section>
                ) : null}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
