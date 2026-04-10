import { Tip } from '../../../shared/ui/feedback/Tip.tsx';
import { selectCls, inputCls, labelCls, STUDIO_TIPS } from './studioConstants.ts';
import type { EnumEntry } from '../../../types/studio.ts';

// ── Types ────────────────────────────────────────────────────────────
interface EnumConfiguratorProps {
  fieldKey: string;
  rule: Record<string, unknown>;
  knownValues: Record<string, string[]>;
  enumLists: EnumEntry[];
  contractType: string;
  onUpdate: (path: string, value: unknown) => void;
  renderLabelSuffix?: (fieldPath: string) => React.ReactNode;
  onRunConsistency?: (options?: { formatGuidance?: string; reviewEnabled?: boolean }) => Promise<unknown> | void;
  consistencyPending?: boolean;
  consistencyMessage?: string;
  consistencyError?: string;
  isEgLocked?: boolean;
  enumConsistencyMode?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────
function getN(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}
function strN(obj: Record<string, unknown>, path: string, fallback = ''): string {
  const v = getN(obj, path);
  return v != null ? String(v) : fallback;
}
function numN(obj: Record<string, unknown>, path: string, fallback = 0): number {
  const v = getN(obj, path);
  return typeof v === 'number' ? v : (parseInt(String(v), 10) || fallback);
}

function consistencyFormatPlaceholder(fieldKey: string): string {
  const token = String(fieldKey || '').trim().toLowerCase();
  if (token.includes('lighting')) return 'XXXX zone (YYYY)';
  if (token.includes('feet') && token.includes('material')) return 'YYYY';
  return 'e.g. XXXX zone (YYYY)';
}

// ── Chip styles ──────────────────────────────────────────────────────
const chipBase = 'inline-flex items-center px-2 py-0.5 text-xs rounded-full font-medium';
const chipBlue = `${chipBase} bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300`;

// ── Component ────────────────────────────────────────────────────────
export function EnumConfigurator({
  fieldKey,
  rule,
  knownValues,
  enumLists,
  contractType,
  onUpdate,
  renderLabelSuffix,
  onRunConsistency,
  consistencyPending = false,
  consistencyMessage = '',
  consistencyError = '',
  isEgLocked = false,
  enumConsistencyMode = false,
}: EnumConfiguratorProps) {
  const currentSource = strN(rule, 'enum.source', strN(rule, 'enum_source'));
  const currentPolicy = strN(rule, 'enum.policy', strN(rule, 'enum_policy', 'open'));
  const matchStrategy = strN(rule, 'enum.match.strategy', 'alias');

  const isBoolean = contractType === 'boolean';

  // Known values for this field
  const fieldKnownValues = knownValues[fieldKey] || [];
  const consumers = (rule?.consumers || {}) as Record<string, Record<string, boolean>>;
  const consistencyFormatReviewEnabled = consumers?.['enum.match.format_hint']?.review !== false;
  const consistencyFormatHint = strN(rule, 'enum.match.format_hint');
  const reviewToggleFields = ['enum.match.strategy', 'enum.match.format_hint'] as const;
  const reviewToggleOn = reviewToggleFields.every((fieldPath) => consumers?.[fieldPath]?.review !== false);

  // Derive selected enum list name from source
  const selectedEnumList = currentSource.startsWith('data_lists.')
    ? currentSource.replace('data_lists.', '')
    : '';
  const selectedListEntry = enumLists.find((e) => e.field === selectedEnumList);

  function handleEnumListSelect(listName: string) {
    if (listName) {
      onUpdate('enum.source', `data_lists.${listName}`);
    } else {
      onUpdate('enum.source', '');
    }
  }

  function handleReviewModeToggle() {
    if (consistencyPending) return;
    const nextEnabled = !reviewToggleOn;
    const currentConsumers = (rule?.consumers || {}) as Record<string, Record<string, boolean>>;
    const nextConsumers: Record<string, Record<string, boolean>> = { ...currentConsumers };
    reviewToggleFields.forEach((fieldPath) => {
      const overrides = { ...(nextConsumers[fieldPath] || {}) };
      if (nextEnabled) {
        delete overrides.review;
      } else {
        overrides.review = false;
      }
      if (Object.keys(overrides).length === 0) {
        delete nextConsumers[fieldPath];
      } else {
        nextConsumers[fieldPath] = overrides;
      }
    });
    onUpdate('consumers', Object.keys(nextConsumers).length > 0 ? nextConsumers : undefined);
    // WHY: When consistency is toggled ON and policy is 'open', upgrade to 'open_prefer_known'
    // so the validator flags unknown values for LLM normalization via P2 prompt.
    if (nextEnabled && currentPolicy === 'open') {
      onUpdate('enum.policy', 'open_prefer_known');
    }
    if (typeof onRunConsistency === 'function') {
      const formatGuidance = consistencyFormatHint.trim() || undefined;
      if (!nextEnabled) {
        void onRunConsistency({ formatGuidance, reviewEnabled: false });
      } else {
        void onRunConsistency({ formatGuidance, reviewEnabled: true });
      }
    }
  }

  // WHY: EG-locked fields show known_values as a read-only list.
  // The enum policy, match strategy, and values are all managed by the EG preset.
  if (isEgLocked && fieldKnownValues.length > 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-3 py-2 rounded sf-surface-alt sf-border-soft border text-[11px] sf-text-subtle">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          <span>EG-managed enum. Policy: <strong>{currentPolicy}</strong> &middot; Match: <strong>{matchStrategy}</strong> &middot; {fieldKnownValues.length} registered values</span>
        </div>
        <div>
          <div className={`${labelCls} flex items-center`}>
            <span>Registered Values ({fieldKnownValues.length})</span>
            {renderLabelSuffix?.('enum.policy')}
          </div>
          <div className="max-h-64 overflow-y-auto flex flex-wrap gap-1 p-3 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800">
            {fieldKnownValues.map((v) => (
              <span key={v} className={chipBlue}>{v}</span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Boolean info banner ─────────────────────────────────── */}
      {isBoolean ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
          <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span className="text-xs text-blue-600 dark:text-blue-400">Boolean type auto-locks enum to closed/yes_no</span>
        </div>
      ) : null}

      {/* ── Row 1: Policy + Match Settings ──────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className={`${labelCls} flex items-center`}><span>Enum Policy<Tip text={STUDIO_TIPS.enum_policy} /></span>{renderLabelSuffix?.('enum.policy')}</div>
          {(enumConsistencyMode || reviewToggleOn) && (currentPolicy === 'open' || currentPolicy === 'open_prefer_known') ? (
            <div className="flex items-center gap-1.5 px-2 py-1.5 rounded border sf-border-soft sf-surface-alt text-[11px] sf-text-muted" title="Consistency mode active — open overridden to open_prefer_known">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              open_prefer_known <span className="sf-text-subtle">({enumConsistencyMode ? 'global' : 'review'})</span>
            </div>
          ) : (
            <select
              className={`${selectCls} w-full`}
              value={currentPolicy}
              onChange={(e) => onUpdate('enum.policy', e.target.value)}
            >
              <option value="open">open</option>
              <option value="closed">closed</option>
              <option value="open_prefer_known">open_prefer_known</option>
            </select>
          )}
        </div>
        <div>
          <div className={`${labelCls} flex items-center`}><span>Match Strategy<Tip text={STUDIO_TIPS.match_strategy} /></span>{renderLabelSuffix?.('enum.match.strategy')}</div>
          <select
            className={`${selectCls} w-full`}
            value={matchStrategy}
            onChange={(e) => onUpdate('enum.match.strategy', e.target.value)}
          >
            <option value="alias">alias</option>
            <option value="exact">exact</option>
            <option value="fuzzy">fuzzy</option>
          </select>
        </div>
        {matchStrategy === 'fuzzy' ? (
          <div>
            <div className={`${labelCls} flex items-center`}><span>Fuzzy Threshold<Tip text={STUDIO_TIPS.fuzzy_threshold} /></span>{renderLabelSuffix?.('enum.match.fuzzy_threshold')}</div>
            <input
              className={`${inputCls} w-full`}
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={numN(rule, 'enum.match.fuzzy_threshold', 0.92)}
              onChange={(e) => onUpdate('enum.match.fuzzy_threshold', parseFloat(e.target.value) || 0.92)}
            />
          </div>
        ) : (
          <div />
        )}
      </div>

      {/* ── Enum Source ───────────────────────────────────────────── */}
      {!isBoolean ? (
        <div>
          <div className={`${labelCls} flex items-center`}><span>Enum Source<Tip text={STUDIO_TIPS.enum_source} /></span>{renderLabelSuffix?.('enum.source')}</div>
          <div className="border border-gray-200 dark:border-gray-700 rounded p-3 bg-white dark:bg-gray-800 space-y-3">
            <div>
              <div className={`${labelCls} flex items-center`}><span>Enum List</span>{renderLabelSuffix?.('enum.source')}</div>
              <select
                className={`${selectCls} w-full`}
                value={selectedEnumList}
                onChange={(e) => handleEnumListSelect(e.target.value)}
              >
                <option value="">(none)</option>
                {enumLists.map((el) => (
                  <option key={el.field} value={el.field}>
                    {el.field} ({(el.values || []).length} values)
                  </option>
                ))}
              </select>
            </div>
            {selectedEnumList ? (
              <div className="text-xs text-gray-500">
                Source: <span className="font-mono text-accent">data_lists.{selectedEnumList}</span>
              </div>
            ) : null}

            {/* Show values from the selected enum list */}
            {selectedListEntry && (selectedListEntry.values || []).length > 0 ? (
              <div>
                <div className={labelCls}>
                  Enum Values ({(selectedListEntry.values || []).length})
                </div>
                <div className="max-h-48 overflow-y-auto flex flex-wrap gap-1">
                  {(selectedListEntry.values || []).map((v) => (
                    <span key={v} className={chipBlue}>{v}</span>
                  ))}
                </div>
              </div>
            ) : selectedEnumList ? (
              <div className="text-xs text-gray-400 italic">No values in this enum list.</div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        {typeof onRunConsistency === 'function' ? (
          <div className="space-y-1">
            <div className={`${labelCls} flex items-center`}>
              <span className="flex items-center gap-1.5">
                <span>Consistency Mode</span>
                <Tip text="Backend-linked review mode. ON enables review consumers and runs enum-consistency with current format guidance when allowed. OFF disables review consumers and sends gated backend request." />
                {renderLabelSuffix?.('enum.match.strategy')}
              </span>
            </div>
            {/* WHY: Closed enum already rejects unknowns via P1 — consistency (P2) doesn't apply. Lock OFF. */}
            {currentPolicy === 'closed' ? (
              <>
                <div className="inline-flex rounded border border-gray-300 dark:border-gray-600 overflow-hidden opacity-50">
                  <button type="button" disabled className="px-3 py-1 text-[11px] font-medium bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">On</button>
                  <button type="button" disabled className="px-3 py-1 text-[11px] font-medium border-l border-gray-300 dark:border-gray-600 bg-gray-700 text-white shadow-inner">Off</button>
                </div>
                <div className="text-[10px] text-gray-500">Locked: closed enum rejects unknowns via P1. Consistency not applicable.</div>
              </>
            ) : (
              <>
                <div className="inline-flex rounded border border-gray-300 dark:border-gray-600 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => { if (!reviewToggleOn) handleReviewModeToggle(); }}
                    disabled={Boolean(consistencyPending)}
                    className={`px-3 py-1 text-[11px] font-medium disabled:opacity-50 ${reviewToggleOn ? 'bg-blue-600 text-white shadow-inner' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}
                    title="Enable review mode for Format Pattern and Consistency."
                  >On</button>
                  <button
                    type="button"
                    onClick={() => { if (reviewToggleOn) handleReviewModeToggle(); }}
                    disabled={Boolean(consistencyPending)}
                    className={`px-3 py-1 text-[11px] font-medium border-l border-gray-300 dark:border-gray-600 disabled:opacity-50 ${reviewToggleOn ? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' : 'bg-gray-700 text-white shadow-inner'}`}
                    title="Disable review mode for Format Pattern and Consistency."
                  >Off</button>
                </div>
                <div className="text-[10px] text-gray-500">
                  {reviewToggleOn
                    ? 'ON: review consumers enabled and backend consistency run can execute.'
                    : 'OFF: review consumers disabled and backend consistency is gated.'}
                </div>
              </>
            )}
          </div>
        ) : null}

        <div className="space-y-1">
          <div className={`${labelCls} flex items-center`}>
            <span className="flex items-center gap-1.5">
              <span>Format Pattern</span>
              <Tip text="Exact output template sent to LLM as formatGuidance. Use XXXX for changing numeric/count tokens and YYYY for changing text tokens. Example lighting: XXXX zone (YYYY). Example feet material: YYYY." />
              {renderLabelSuffix?.('enum.match.format_hint')}
            </span>
          </div>
          <input
            className={`${inputCls} w-full`}
            value={consistencyFormatHint}
            disabled={!consistencyFormatReviewEnabled || currentPolicy === 'closed'}
            onChange={(event) => onUpdate('enum.match.format_hint', event.target.value)}
            placeholder={currentPolicy === 'closed' ? 'N/A — closed enum' : consistencyFormatPlaceholder(fieldKey)}
          />
          <div className="text-[10px] text-gray-500">
            {consistencyFormatReviewEnabled
              ? 'Review-only guidance. Not used for parse-time input matching.'
              : 'Off (review consumer disabled).'}
          </div>
        </div>

        {typeof onRunConsistency === 'function' ? (
          <div className="text-[10px] text-gray-500">
            {consistencyPending
              ? 'Consistency run in progress.'
              : 'Consistency execution is controlled by the mode above.'}
          </div>
        ) : null}
        {consistencyMessage ? (
          <div className="text-[11px] text-blue-700 dark:text-blue-300">{consistencyMessage}</div>
        ) : null}
        {consistencyError ? (
          <div className="text-[11px] text-red-600 dark:text-red-400">{consistencyError}</div>
        ) : null}

        {/* Open policy note */}
        {(currentPolicy === 'open' || currentPolicy === 'open_prefer_known') && fieldKnownValues.length > 0 ? (
          <p className="text-xs text-gray-400 italic">
            New values may be added during pipeline runs.
          </p>
        ) : null}
      </div>
    </div>
  );
}
