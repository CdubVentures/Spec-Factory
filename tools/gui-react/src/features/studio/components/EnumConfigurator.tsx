import { Tip } from '../../../shared/ui/feedback/Tip.tsx';
import { SubSection } from './Section.tsx';
import { selectCls, inputCls, labelCls, STUDIO_TIPS } from './studioConstants.ts';
import { strN } from '../state/nestedValueHelpers.ts';
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
function consistencyFormatPlaceholder(fieldKey: string): string {
  const token = String(fieldKey || '').trim().toLowerCase();
  if (token.includes('lighting')) return 'XXXX zone (YYYY)';
  if (token.includes('feet') && token.includes('material')) return 'YYYY';
  return 'e.g. XXXX zone (YYYY)';
}

const VALUE_CHIP_CLS = 'inline-flex items-center px-2 py-0.5 text-xs rounded-full font-medium sf-chip-info-soft';

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
  const isBoolean = contractType === 'boolean';

  const fieldKnownValues = knownValues[fieldKey] || [];
  const consumers = (rule?.consumers || {}) as Record<string, Record<string, boolean>>;
  const consistencyFormatReviewEnabled = consumers?.['enum.match.format_hint']?.review !== false;
  const consistencyFormatHint = strN(rule, 'enum.match.format_hint');
  const reviewToggleFields = ['enum.match.format_hint'] as const;
  const reviewToggleOn = reviewToggleFields.every((fieldPath) => consumers?.[fieldPath]?.review !== false);

  const selectedEnumList = currentSource.startsWith('data_lists.')
    ? currentSource.replace('data_lists.', '')
    : '';
  const selectedListEntry = enumLists.find((e) => e.field === selectedEnumList);

  function handleEnumListSelect(listName: string) {
    onUpdate('enum.source', listName ? `data_lists.${listName}` : '');
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
      void onRunConsistency({ formatGuidance, reviewEnabled: nextEnabled });
    }
  }

  // WHY: EG-locked fields show known_values as a read-only list.
  if (isEgLocked && fieldKnownValues.length > 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded sf-surface-alt sf-border-soft border text-[11px] sf-text-subtle">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          <span>EG-managed enum. Policy: <strong>{currentPolicy}</strong> · {fieldKnownValues.length} registered values</span>
        </div>
        <div>
          <div className={`${labelCls} flex items-center`}>
            <span>Registered Values ({fieldKnownValues.length})</span>
            {renderLabelSuffix?.('enum.policy')}
          </div>
          <div className="max-h-64 overflow-y-auto flex flex-wrap gap-1 p-3 border sf-border-default rounded sf-surface-card">
            {fieldKnownValues.map((v) => (
              <span key={v} className={VALUE_CHIP_CLS}>{v}</span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Banners ────────────────────────────────────────────── */}
      {isBoolean ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded sf-surface-info-soft border sf-border-info text-xs sf-text-info">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span>Boolean type auto-locks enum to closed / yes_no</span>
        </div>
      ) : null}

      {!isBoolean && currentPolicy === 'closed' && fieldKnownValues.length === 0 ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded sf-surface-warning-soft border sf-border-warning text-xs">
          Closed enum with zero known values — all extraction values will be rejected.
        </div>
      ) : null}

      {/* ── Policy & Source ────────────────────────────────────── */}
      <SubSection label="Policy & Source">
        <div className={`grid ${isBoolean ? 'grid-cols-1' : 'grid-cols-2'} gap-3`}>
          <div>
            <div className={`${labelCls} flex items-center`}>
              <span>Policy<Tip text={STUDIO_TIPS.enum_policy} /></span>
              {renderLabelSuffix?.('enum.policy')}
            </div>
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
          {!isBoolean ? (
            <div>
              <div className={`${labelCls} flex items-center`}>
                <span>Source<Tip text={STUDIO_TIPS.enum_source} /></span>
                {renderLabelSuffix?.('enum.source')}
              </div>
              <select
                className={`${selectCls} w-full`}
                value={selectedEnumList}
                onChange={(e) => handleEnumListSelect(e.target.value)}
              >
                <option value="">(none)</option>
                {enumLists.map((el) => (
                  <option key={el.field} value={el.field}>
                    {el.field} ({(el.values || []).length})
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        {/* Known values preview */}
        {selectedListEntry && (selectedListEntry.values || []).length > 0 ? (
          <div className="mt-2">
            <div className={labelCls}>
              Values ({(selectedListEntry.values || []).length})
            </div>
            <div className="max-h-36 overflow-y-auto flex flex-wrap gap-1 p-2 rounded border sf-border-default sf-surface-card">
              {(selectedListEntry.values || []).map((v) => (
                <span key={v} className={VALUE_CHIP_CLS}>{v}</span>
              ))}
            </div>
          </div>
        ) : selectedEnumList ? (
          <div className="text-xs sf-text-subtle italic mt-2">No values in this enum list.</div>
        ) : null}

        {(currentPolicy === 'open' || currentPolicy === 'open_prefer_known') && fieldKnownValues.length > 0 ? (
          <p className="text-xs sf-text-subtle italic mt-2">
            New values may be added during pipeline runs.
          </p>
        ) : null}
      </SubSection>

      {/* ── Consistency & Format ───────────────────────────────── */}
      {typeof onRunConsistency === 'function' ? (
        <SubSection label="Consistency & Format">
          <div className="space-y-3">
            <div>
              <div className={`${labelCls} flex items-center`}>
                <span>Mode<Tip text="Backend-linked review mode. ON enables review consumers and runs enum-consistency with current format guidance. OFF disables review consumers and gates backend consistency." /></span>
              </div>
              {currentPolicy === 'closed' ? (
                <div className="space-y-1">
                  <div className="inline-flex rounded border sf-border-default overflow-hidden opacity-50">
                    <button type="button" disabled className="px-3 py-1 text-[11px] font-medium sf-bg-surface-soft sf-text-subtle">On</button>
                    <button type="button" disabled className="px-3 py-1 text-[11px] font-medium border-l sf-border-default sf-bg-surface-soft-strong sf-text-on-emphasis shadow-inner">Off</button>
                  </div>
                  <div className="text-[10px] sf-text-subtle">Locked: closed enum rejects unknowns via P1. Consistency not applicable.</div>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="inline-flex rounded border sf-border-default overflow-hidden">
                    <button
                      type="button"
                      onClick={() => { if (!reviewToggleOn) handleReviewModeToggle(); }}
                      disabled={Boolean(consistencyPending)}
                      className={`px-3 py-1 text-[11px] font-medium disabled:opacity-50 ${reviewToggleOn ? 'sf-bg-accent sf-text-on-emphasis shadow-inner' : 'sf-bg-surface-soft sf-text-subtle'}`}
                      title="Enable review mode for Format Pattern and Consistency."
                    >On</button>
                    <button
                      type="button"
                      onClick={() => { if (reviewToggleOn) handleReviewModeToggle(); }}
                      disabled={Boolean(consistencyPending)}
                      className={`px-3 py-1 text-[11px] font-medium border-l sf-border-default disabled:opacity-50 ${reviewToggleOn ? 'sf-bg-surface-soft sf-text-subtle' : 'sf-bg-surface-soft-strong sf-text-on-emphasis shadow-inner'}`}
                      title="Disable review mode for Format Pattern and Consistency."
                    >Off</button>
                  </div>
                  <div className="text-[10px] sf-text-subtle">
                    {reviewToggleOn
                      ? 'ON: review consumers enabled and backend consistency run can execute.'
                      : 'OFF: review consumers disabled and backend consistency is gated.'}
                  </div>
                </div>
              )}
            </div>

            <div>
              <div className={`${labelCls} flex items-center`}>
                <span>Format Pattern<Tip text="Exact output template sent to LLM as formatGuidance. Use XXXX for numeric/count tokens and YYYY for text tokens." /></span>
                {renderLabelSuffix?.('enum.match.format_hint')}
              </div>
              <input
                className={`${inputCls} w-full`}
                value={consistencyFormatHint}
                disabled={!consistencyFormatReviewEnabled || currentPolicy === 'closed'}
                onChange={(event) => onUpdate('enum.match.format_hint', event.target.value)}
                placeholder={currentPolicy === 'closed' ? 'N/A — closed enum' : consistencyFormatPlaceholder(fieldKey)}
              />
              <div className="text-[10px] sf-text-subtle mt-1">
                {consistencyFormatReviewEnabled
                  ? 'Review-only guidance. Not used for parse-time input matching.'
                  : 'Off (review consumer disabled).'}
              </div>
            </div>

            {consistencyMessage ? (
              <div className="text-[11px] sf-text-info">{consistencyMessage}</div>
            ) : null}
            {consistencyError ? (
              <div className="text-[11px] sf-text-danger">{consistencyError}</div>
            ) : null}
          </div>
        </SubSection>
      ) : null}
    </div>
  );
}
