import { Spinner } from '../../../shared/ui/feedback/Spinner.tsx';
import type { IndexLabRunSummary } from '../../indexing/types.ts';

interface RuntimeOpsRunPickerProps {
  runs: IndexLabRunSummary[];
  value: string;
  onChange: (runId: string) => void;
  isLoading: boolean;
  isRefreshing: boolean;
}

const PICKER_WIDTH_CLASS = 'w-[400px] max-w-full';

function toToken(value: unknown): string {
  return String(value || '').trim();
}

function toOriginLabel(origin = '') {
  return toToken(origin).toLowerCase() === 's3' ? 'S3' : 'Local';
}

function toOriginBadgeClass(origin = '') {
  return toToken(origin).toLowerCase() === 's3'
    ? 'sf-chip-info'
    : 'sf-chip-teal-strong';
}

function toStorageStateLabel(state = '') {
  const token = toToken(state).toLowerCase();
  if (token === 'live') return 'Live';
  if (token === 'stored') return 'Stored';
  return '';
}

function toStorageStateBadgeClass(state = '') {
  const token = toToken(state).toLowerCase();
  if (token === 'live') return 'sf-chip-success';
  return 'sf-chip-neutral';
}

function titleCaseWords(value = ''): string {
  const words = toToken(value).split(/\s+/).filter(Boolean);
  return words.map((word) => {
    if (/\d/.test(word)) {
      return word.toUpperCase();
    }
    const lower = word.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join(' ');
}

function humanizeProductId({
  category = '',
  productId = '',
}: {
  category?: string;
  productId?: string;
}): string {
  const categoryToken = toToken(category).toLowerCase();
  let productToken = toToken(productId);
  if (categoryToken && productToken.toLowerCase().startsWith(`${categoryToken}-`)) {
    productToken = productToken.slice(categoryToken.length + 1);
  }
  const humanized = titleCaseWords(productToken.replace(/[_-]+/g, ' '));
  return humanized || titleCaseWords(categoryToken);
}

function toRunDisplayToken(runId = ''): string {
  const token = toToken(runId);
  if (!token) return '';
  if (token.length <= 5) return token;
  const segments = token.split(/[^A-Za-z0-9]+/).filter(Boolean);
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = toToken(segments[index]);
    if (segment.length >= 5) {
      return segment.slice(-5);
    }
  }
  return token.slice(-5);
}

function extractRunTokenFromPickerLabel(pickerLabel = ''): string {
  const label = toToken(pickerLabel);
  if (!label) return '';
  const parts = label.split(' - ');
  return parts.length > 1 ? toToken(parts[parts.length - 1]) : '';
}

function extractIdentityFromPickerLabel({
  pickerLabel = '',
  categoryLabel = '',
  runToken = '',
}: {
  pickerLabel?: string;
  categoryLabel?: string;
  runToken?: string;
}): string {
  let label = toToken(pickerLabel);
  if (!label) return '';
  const categoryPrefix = categoryLabel ? `${categoryLabel} • ` : '';
  if (categoryPrefix && label.startsWith(categoryPrefix)) {
    label = label.slice(categoryPrefix.length);
  }
  const runSuffix = runToken ? ` - ${runToken}` : '';
  if (runSuffix && label.endsWith(runSuffix)) {
    label = label.slice(0, -runSuffix.length);
  }
  return toToken(label);
}

function buildRunTextParts(run: IndexLabRunSummary | null) {
  const categoryLabel = titleCaseWords(run?.category || '');
  const runToken = extractRunTokenFromPickerLabel(run?.picker_label || '')
    || toRunDisplayToken(run?.run_id || '');
  const fallbackLabel = toToken(run?.picker_label) || toToken(run?.run_id) || 'Select a run';
  const identityLabel = humanizeProductId({
    category: run?.category || '',
    productId: run?.product_id || '',
  }) || extractIdentityFromPickerLabel({
    pickerLabel: run?.picker_label || '',
    categoryLabel,
    runToken,
  }) || fallbackLabel;
  return {
    categoryLabel,
    identityLabel,
    runToken,
    fallbackLabel,
  };
}

function buildInlineRunLabel(run: IndexLabRunSummary | null): string {
  const parts = buildRunTextParts(run);
  const dedupedIdentityLabel = parts.identityLabel.toLowerCase() === parts.categoryLabel.toLowerCase()
    ? ''
    : parts.identityLabel;
  return [
    parts.categoryLabel,
    dedupedIdentityLabel || (!parts.categoryLabel ? parts.fallbackLabel : ''),
    parts.runToken,
  ].filter(Boolean).join(' ') || parts.fallbackLabel;
}

function StatusBadge({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  if (!label) return null;
  return (
    <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-medium ${className}`}>
      {label}
    </span>
  );
}

export function RuntimeOpsRunPicker({
  runs,
  value,
  onChange,
  isLoading,
  isRefreshing: _isRefreshing,
}: RuntimeOpsRunPickerProps) {
  const selectedRun = runs.find((run) => run.run_id === value) ?? runs[0] ?? null;
  const selectedLabel = buildInlineRunLabel(selectedRun);

  if (isLoading && runs.length === 0) {
    return (
      <div className={`flex ${PICKER_WIDTH_CLASS} items-center gap-2 sf-surface-elevated border sf-border-default px-2 py-1.5`}>
        <Spinner className="h-4 w-4" />
        <span className="sf-text-caption font-medium">Loading runs...</span>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className={`flex ${PICKER_WIDTH_CLASS} items-center gap-2 sf-surface-elevated border sf-border-default px-2 py-1.5`}>
        <span className="sf-text-caption sf-text-subtle italic">No runs yet</span>
      </div>
    );
  }

  return (
    <details className={`relative min-w-0 ${PICKER_WIDTH_CLASS}`}>
      <summary className="block w-full list-none cursor-pointer rounded-none sf-surface-elevated border sf-border-default px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate whitespace-nowrap sf-text-caption font-medium">
            {selectedLabel}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            <StatusBadge
              label={toStorageStateLabel(selectedRun?.storage_state)}
              className={toStorageStateBadgeClass(selectedRun?.storage_state)}
            />
            {selectedRun ? (
              <StatusBadge
                label={toOriginLabel(selectedRun.storage_origin)}
                className={toOriginBadgeClass(selectedRun.storage_origin)}
              />
            ) : null}
            <span className="shrink-0 sf-text-caption sf-text-muted" aria-hidden="true">v</span>
          </div>
        </div>
      </summary>

      <div className="absolute left-0 top-full z-20 mt-1 w-full overflow-auto rounded-none sf-surface-elevated border sf-border-default shadow-lg">
        {runs.map((run) => {
          const runLabel = buildInlineRunLabel(run);
          return (
            <button
              key={run.run_id}
              type="button"
              className={`flex w-full min-w-0 items-center gap-2 rounded-none px-3 py-2 text-left sf-nav-item ${
                run.run_id === selectedRun?.run_id ? 'sf-nav-item-active' : 'sf-nav-item-muted'
              }`}
              onClick={(event) => {
                onChange(run.run_id);
                event.currentTarget.closest('details')?.removeAttribute('open');
              }}
            >
              <span className="min-w-0 flex-1 truncate whitespace-nowrap sf-text-caption font-medium">
                {runLabel}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <StatusBadge
                  label={toStorageStateLabel(run.storage_state)}
                  className={toStorageStateBadgeClass(run.storage_state)}
                />
                <StatusBadge
                  label={toOriginLabel(run.storage_origin)}
                  className={toOriginBadgeClass(run.storage_origin)}
                />
              </div>
            </button>
          );
        })}
      </div>
    </details>
  );
}
