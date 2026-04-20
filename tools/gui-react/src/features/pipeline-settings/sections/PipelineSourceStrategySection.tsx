import { useMemo, useState, useEffect } from 'react';
import { usePersistedNullableTab, usePersistedTab } from '../../../stores/tabStore.ts';
import { NumberStepper } from '../../../shared/ui/forms/NumberStepper.tsx';
import { type SourceEntry } from '../state/sourceStrategyAuthority.ts';
import { SectionNavIcon } from '../components/PipelineSettingsPageShell.tsx';
// WHY: O(1) — types and enum options derived from backend contract SSOT.
import {
  TIER_OPTIONS,
  AUTHORITY_OPTIONS,
  DISCOVERY_METHOD_OPTIONS,
  type SourceFormEntry,
  type SourceFormEntryField,
} from '../state/sourceEntryDerived.ts';
export type { SourceFormEntry, SourceFormEntryField } from '../state/sourceEntryDerived.ts';

type SortColumn = 'host' | 'name' | 'tier' | 'authority' | 'discovery' | 'priority' | 'enabled';
type SortDirection = 'asc' | 'desc';

function resolveSourceId(entry: SourceEntry): string {
  return String(entry.sourceId || '').trim();
}

function resolveSourceHostLabel(entry: SourceEntry): string {
  const fallbackId = String(entry.sourceId || '').replace(/_/g, '.');
  const fallback = fallbackId || String(entry.display_name || '').trim() || 'unknown-source';
  if (!entry.base_url) return fallback;
  try {
    return new URL(entry.base_url).hostname;
  } catch {
    return fallback;
  }
}

function formatTierLabel(tier: string): string {
  const normalized = String(entryOrValue(tier) || '').trim();
  if (!normalized) return 'Unknown';
  return normalized.replace('tier', 'T').replace('_', ' ');
}

function entryOrValue(value: unknown): string {
  return String(value || '').trim();
}

function tierChipClass(tier: string): string {
  const normalized = String(entryOrValue(tier) || '').toLowerCase();
  if (normalized.includes('manufacturer')) return 'sf-chip-info';
  if (normalized.includes('lab')) return 'sf-chip-success';
  if (normalized.includes('retailer')) return 'sf-chip-warning';
  if (normalized.includes('community')) return 'sf-chip-neutral';
  return 'sf-chip-neutral';
}

function discoveryBadgeClass(method: string): string {
  const normalized = String(entryOrValue(method) || 'manual').toLowerCase();
  if (normalized === 'search_first') return 'sf-chip-info';
  return 'sf-chip-neutral';
}

interface PipelineSourceStrategySectionProps {
  category: string;
  sourceStrategyHydrated: boolean;
  sourceStrategyEntries: SourceEntry[];
  sourceStrategyLoading: boolean;
  sourceStrategyErrorMessage: string;
  sourceStrategySaving: boolean;
  sourceDraftMode: 'create' | 'edit' | null;
  sourceDraft: SourceFormEntry;
  sourceInputCls: string;
  onToggleEntry: (entry: SourceEntry) => void;
  onEditEntry: (entry: SourceEntry) => void;
  onDeleteEntry: (sourceId: string) => void;
  onUpdateSourceDraft: (key: SourceFormEntryField, value: string | number | boolean | string[]) => void;
  onSaveEntryDraft: () => void;
  onCancelSourceDraft: () => void;
}

const SORTABLE_COLUMNS: { key: SortColumn; label: string }[] = [
  { key: 'host', label: 'Host' },
  { key: 'name', label: 'Name' },
  { key: 'tier', label: 'Tier' },
  { key: 'authority', label: 'Authority' },
  { key: 'discovery', label: 'Discovery' },
  { key: 'priority', label: 'Priority' },
  { key: 'enabled', label: 'Enabled' },
];

function sortEntryValue(entry: SourceEntry, col: SortColumn): string | number {
  switch (col) {
    case 'host': return resolveSourceHostLabel(entry).toLowerCase();
    case 'name': return (entry.display_name || '').toLowerCase();
    case 'tier': return entry.tier || '';
    case 'authority': return (entry.authority || 'unknown').toLowerCase();
    case 'discovery': return (entry.discovery?.method || 'manual').toLowerCase();
    case 'priority': return entry.discovery?.priority ?? 50;
    case 'enabled': return entry.discovery?.enabled ? 1 : 0;
    default: return '';
  }
}

function SortIndicator({ column, sortColumn, sortDirection }: { column: SortColumn; sortColumn: SortColumn | null; sortDirection: SortDirection }) {
  if (sortColumn !== column) return <span className="ml-1 opacity-30">{'\u2195'}</span>;
  return <span className="ml-1">{sortDirection === 'asc' ? '\u2191' : '\u2193'}</span>;
}

function SourceStrategyTable({
  entries,
  isLoading,
  errorMessage,
  isSaving,
  onToggleEntry,
  onEditEntry,
  onDeleteEntry,
  category,
}: {
  entries: SourceEntry[];
  isLoading: boolean;
  errorMessage: string;
  isSaving: boolean;
  onToggleEntry: (entry: SourceEntry) => void;
  onEditEntry: (entry: SourceEntry) => void;
  onDeleteEntry: (sourceId: string) => void;
  category: string;
}) {
  const SORT_COLUMN_VALUES = ['host', 'name', 'tier', 'authority', 'discovery', 'priority', 'enabled'] as const;
  const SORT_DIR_VALUES = ['asc', 'desc'] as const;
  const [sortColumn, setSortColumn] = usePersistedNullableTab<SortColumn>(`pipelineSettings:sourceSort:column:${category}`, 'priority', { validValues: SORT_COLUMN_VALUES });
  const [sortDirection, setSortDirection] = usePersistedTab<SortDirection>(`pipelineSettings:sourceSort:dir:${category}`, 'desc', { validValues: SORT_DIR_VALUES });

  const sortedEntries = useMemo(() => {
    if (!entries || entries.length === 0 || !sortColumn) return entries;
    const sorted = [...entries].sort((a, b) => {
      const aVal = sortEntryValue(a, sortColumn);
      const bVal = sortEntryValue(b, sortColumn);
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [entries, sortColumn, sortDirection]);

  function handleSort(col: SortColumn) {
    if (sortColumn === col) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(col);
      setSortDirection(col === 'priority' ? 'desc' : 'asc');
    }
  }

  if (isLoading)
    return (
      <p className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
        Loading sources...
      </p>
    );
  if (errorMessage)
    return (
      <div className="rounded sf-callout sf-callout-danger px-3 py-2.5">
        <p className="sf-text-label font-semibold">Unable to load source strategy.</p>
        <p className="mt-1 sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
          {errorMessage}
        </p>
      </div>
    );
  if (!entries || entries.length === 0)
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
            {SORTABLE_COLUMNS.map((col) => (
              <th
                key={col.key}
                className="sf-table-head-cell px-3 py-2.5 cursor-pointer select-none"
                onClick={() => handleSort(col.key)}
              >
                {col.label}
                <SortIndicator column={col.key} sortColumn={sortColumn} sortDirection={sortDirection} />
              </th>
            ))}
            <th className="sf-table-head-cell px-3 py-2.5" />
            <th className="sf-table-head-cell px-3 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {sortedEntries.map((entry, index) => {
            const sourceId = resolveSourceId(entry);
            const rowKey = sourceId || `${resolveSourceHostLabel(entry)}-${String(index)}`;
            const displayName = String(entry.display_name || '').trim() || sourceId || resolveSourceHostLabel(entry);
            const authority = String(entry.authority || '').trim() || 'unknown';
            const discoveryMethod = String(entry.discovery?.method || 'manual');
            const discoveryPriority = entry.discovery?.priority ?? 50;
            const discoveryEnabled = Boolean(entry.discovery?.enabled);
            const actionDisabled = isSaving || !sourceId;

            return (
            <tr
              key={rowKey}
              className="sf-table-row border-b"
              style={{ borderColor: 'rgb(var(--sf-color-border-default-rgb) / 0.78)' }}
            >
              <td className="px-3 py-2.5 font-mono sf-text-label" style={{ color: 'var(--sf-text)' }}>
                {resolveSourceHostLabel(entry)}
              </td>
              <td className="px-3 py-2.5" style={{ color: 'var(--sf-text)' }}>
                {displayName}
              </td>
              <td className="px-3 py-2.5">
                <span className={`inline-flex rounded px-1.5 py-0.5 sf-text-label font-medium ${tierChipClass(String(entry.tier || ''))}`}>
                  {formatTierLabel(String(entry.tier || ''))}
                </span>
              </td>
              <td className="px-3 py-2.5" style={{ color: 'var(--sf-text)' }}>
                {authority}
              </td>
              <td className="px-3 py-2.5">
                <span className={`inline-flex rounded px-1.5 py-0.5 sf-text-label font-medium ${discoveryBadgeClass(String(entry.discovery?.method || 'manual'))}`}>
                  {discoveryMethod}
                </span>
              </td>
              <td className="px-3 py-2.5 font-mono sf-text-label" style={{ color: 'var(--sf-text)' }}>
                {discoveryPriority}
              </td>
              <td className="px-3 py-2.5">
                <button
                  onClick={() => onToggleEntry(entry)}
                  disabled={actionDisabled}
                  className={`inline-flex min-w-[60px] items-center justify-center rounded sf-switch px-2.5 py-1 sf-text-label font-semibold transition-colors disabled:opacity-50 ${
                    discoveryEnabled
                      ? 'sf-switch-on'
                      : 'sf-switch-off'
                  }`}
                >
                  {discoveryEnabled ? 'ON' : 'OFF'}
                </button>
              </td>
              <td className="px-3 py-2.5">
                <button
                  onClick={() => onEditEntry(entry)}
                  disabled={actionDisabled}
                  className="rounded sf-icon-button px-2 py-1 sf-text-label font-semibold transition-colors disabled:opacity-50"
                >
                  Edit
                </button>
              </td>
              <td className="px-3 py-2.5">
                <button
                  onClick={() => {
                    if (!sourceId) return;
                    if (!confirm(`Delete ${displayName}?`)) return;
                    onDeleteEntry(sourceId);
                  }}
                  disabled={actionDisabled}
                  className="rounded sf-danger-button px-2 py-1 sf-text-label font-semibold transition-colors disabled:opacity-50"
                >
                  Delete
                </button>
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FormSelect({
  label,
  value,
  options,
  onChange,
  cls,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
  cls: string;
}) {
  return (
    <label className="space-y-1">
      <span className="sf-text-label font-semibold" style={{ color: 'var(--sf-text)' }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={cls}>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

function FormInput({
  label,
  value,
  onChange,
  cls,
  placeholder,
  type,
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  cls: string;
  placeholder?: string;
  type?: string;
  min?: number;
  max?: number;
}) {
  return (
    <label className="space-y-1">
      <span className="sf-text-label font-semibold" style={{ color: 'var(--sf-text)' }}>{label}</span>
      {type === 'number' ? (
        <NumberStepper
          value={value}
          onChange={onChange}
          min={min}
          max={max}
          ariaLabel={label}
          className={cls}
        />
      ) : (
        <input
          type={type || 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cls}
          placeholder={placeholder}
          min={min}
          max={max}
        />
      )}
    </label>
  );
}

function FormCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4"
      />
      <span className="sf-text-label font-semibold" style={{ color: 'var(--sf-text)' }}>{label}</span>
    </label>
  );
}

function FormCsvInput({
  label,
  value,
  onChange,
  cls,
  placeholder,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  cls: string;
  placeholder?: string;
}) {
  const joined = (value ?? []).join(', ');
  const [text, setText] = useState(joined);
  useEffect(() => { setText(joined); }, [joined]);
  return (
    <label className="space-y-1">
      <span className="sf-text-label font-semibold" style={{ color: 'var(--sf-text)' }}>{label}</span>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const arr = text.split(',').map((s) => s.trim()).filter(Boolean);
          onChange(arr);
          setText(arr.join(', '));
        }}
        className={cls}
        placeholder={placeholder}
      />
    </label>
  );
}

export function PipelineSourceStrategySection({
  category,
  sourceStrategyHydrated,
  sourceStrategyEntries,
  sourceStrategyLoading,
  sourceStrategyErrorMessage,
  sourceStrategySaving,
  sourceDraftMode,
  sourceDraft,
  sourceInputCls,
  onToggleEntry,
  onEditEntry,
  onDeleteEntry,
  onUpdateSourceDraft,
  onSaveEntryDraft,
  onCancelSourceDraft,
}: PipelineSourceStrategySectionProps) {
  return (
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
                Manage data sources per category. Edits write directly to sources.json.
              </p>
            </div>
          </div>
        </div>
      </header>
      {!sourceStrategyHydrated ? (
        <p className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
          Loading source strategy...
        </p>
      ) : (
        <>
          <SourceStrategyTable
            entries={sourceStrategyEntries}
            isLoading={sourceStrategyLoading}
            errorMessage={sourceStrategyErrorMessage}
            isSaving={sourceStrategySaving}
            onToggleEntry={onToggleEntry}
            onEditEntry={onEditEntry}
            onDeleteEntry={onDeleteEntry}
            category={category}
          />
          {sourceDraftMode ? (
            <section className="rounded sf-surface-elevated p-3 space-y-4">
              <header className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold" style={{ color: 'var(--sf-text)' }}>
                  {sourceDraftMode === 'create' ? 'Create Source Entry' : 'Edit Source Entry'}
                </h4>
                <p className="sf-text-label" style={{ color: 'var(--sf-muted)' }}>
                  Category: {category}
                </p>
              </header>

              {/* Identity */}
              <fieldset className="space-y-2">
                <legend className="sf-text-label font-semibold uppercase tracking-wide" style={{ color: 'var(--sf-muted)' }}>Identity</legend>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <FormInput label="Host" value={sourceDraft.host} onChange={(v) => onUpdateSourceDraft('host', v)} cls={sourceInputCls} placeholder="example.com" />
                  <FormInput label="Display Name" value={sourceDraft.display_name} onChange={(v) => onUpdateSourceDraft('display_name', v)} cls={sourceInputCls} placeholder="Example Source" />
                  <FormSelect label="Tier" value={sourceDraft.tier} options={TIER_OPTIONS} onChange={(v) => onUpdateSourceDraft('tier', v)} cls={sourceInputCls} />
                  <FormSelect label="Authority" value={sourceDraft.authority} options={AUTHORITY_OPTIONS} onChange={(v) => onUpdateSourceDraft('authority', v)} cls={sourceInputCls} />
                  <FormInput label="Base URL" value={sourceDraft.base_url} onChange={(v) => onUpdateSourceDraft('base_url', v)} cls={sourceInputCls} placeholder="https://example.com" />
                </div>
              </fieldset>

              {/* Discovery */}
              <fieldset className="space-y-2">
                <legend className="sf-text-label font-semibold uppercase tracking-wide" style={{ color: 'var(--sf-muted)' }}>Discovery</legend>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <FormSelect label="Method" value={sourceDraft.discovery.method} options={DISCOVERY_METHOD_OPTIONS} onChange={(v) => onUpdateSourceDraft('discovery.method', v)} cls={sourceInputCls} />
                  <FormInput label="Source Type" value={sourceDraft.discovery.source_type} onChange={(v) => onUpdateSourceDraft('discovery.source_type', v)} cls={sourceInputCls} placeholder="lab_review" />
                  <FormInput label="Priority" value={String(sourceDraft.discovery.priority)} onChange={(v) => onUpdateSourceDraft('discovery.priority', parseInt(v, 10) || 50)} cls={sourceInputCls} type="number" min={0} max={1000} />
                  <FormCheckbox label="Enabled" checked={sourceDraft.discovery.enabled} onChange={(v) => onUpdateSourceDraft('discovery.enabled', v)} />
                </div>
                <FormInput label="Search Pattern" value={sourceDraft.discovery.search_pattern} onChange={(v) => onUpdateSourceDraft('discovery.search_pattern', v)} cls={sourceInputCls} placeholder="{brand} {model} specs" />
                <label className="space-y-1 block">
                  <span className="sf-text-label font-semibold" style={{ color: 'var(--sf-text)' }}>Notes</span>
                  <textarea
                    value={sourceDraft.discovery.notes}
                    onChange={(e) => onUpdateSourceDraft('discovery.notes', e.target.value)}
                    className={`${sourceInputCls} min-h-[84px]`}
                  />
                </label>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="sf-text-label font-semibold uppercase tracking-wide" style={{ color: 'var(--sf-muted)' }}>Document Hints</legend>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <FormCsvInput label="Content Types" value={sourceDraft.content_types} onChange={(v) => onUpdateSourceDraft('content_types', v)} cls={sourceInputCls} placeholder="review, spec_sheet, manual_pdf" />
                  <FormCsvInput label="Doc Kinds" value={sourceDraft.doc_kinds} onChange={(v) => onUpdateSourceDraft('doc_kinds', v)} cls={sourceInputCls} placeholder="review, product_page, support" />
                </div>
              </fieldset>

              {/* Crawl Config */}
              <fieldset className="space-y-2">
                <legend className="sf-text-label font-semibold uppercase tracking-wide" style={{ color: 'var(--sf-muted)' }}>Crawl Config</legend>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <FormSelect label="Method" value={sourceDraft.crawl_config.method} options={['playwright', 'http']} onChange={(v) => onUpdateSourceDraft('crawl_config.method', v)} cls={sourceInputCls} />
                  <FormInput label="Rate Limit (ms)" value={String(sourceDraft.crawl_config.rate_limit_ms)} onChange={(v) => onUpdateSourceDraft('crawl_config.rate_limit_ms', parseInt(v, 10) || 2000)} cls={sourceInputCls} type="number" min={0} max={60000} />
                  <FormInput label="Timeout (ms)" value={String(sourceDraft.crawl_config.timeout_ms)} onChange={(v) => onUpdateSourceDraft('crawl_config.timeout_ms', parseInt(v, 10) || 12000)} cls={sourceInputCls} type="number" min={0} max={120000} />
                  <FormCheckbox label="Robots.txt Compliant" checked={sourceDraft.crawl_config.robots_txt_compliant} onChange={(v) => onUpdateSourceDraft('crawl_config.robots_txt_compliant', v)} />
                </div>
              </fieldset>

              {/* Field Coverage */}
              <fieldset className="space-y-2">
                <legend className="sf-text-label font-semibold uppercase tracking-wide" style={{ color: 'var(--sf-muted)' }}>Field Coverage</legend>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <FormCsvInput label="High" value={sourceDraft.field_coverage.high} onChange={(v) => onUpdateSourceDraft('field_coverage.high', v)} cls={sourceInputCls} placeholder="weight, sensor" />
                  <FormCsvInput label="Medium" value={sourceDraft.field_coverage.medium} onChange={(v) => onUpdateSourceDraft('field_coverage.medium', v)} cls={sourceInputCls} placeholder="connection" />
                  <FormCsvInput label="Low" value={sourceDraft.field_coverage.low} onChange={(v) => onUpdateSourceDraft('field_coverage.low', v)} cls={sourceInputCls} placeholder="battery" />
                </div>
              </fieldset>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onSaveEntryDraft}
                  disabled={sourceStrategySaving}
                  className="rounded sf-primary-button px-3 py-1.5 sf-text-label font-semibold transition-colors disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={onCancelSourceDraft}
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
  );
}
