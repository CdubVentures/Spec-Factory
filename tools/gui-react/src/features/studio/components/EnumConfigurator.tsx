import { useState } from 'react';
import { FIELD_RULE_ENUM_CONTROLS } from '../../../../../../src/field-rules/fieldRuleSchema.js';
import { Tip } from '../../../shared/ui/feedback/Tip.tsx';
import { SubSection } from './Section.tsx';
import { selectCls, labelCls, STUDIO_TIPS } from './studioConstants.ts';
import { strN } from '../state/nestedValueHelpers.ts';
import { FormatPatternInput } from '../../publisher/index.ts';
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
  isEgLocked?: boolean;
}

const VALUE_CHIP_CLS = 'inline-flex items-center px-2 py-0.5 text-xs rounded-full font-medium sf-chip-info-soft';

function enumControl(controlId: string): typeof FIELD_RULE_ENUM_CONTROLS[number] {
  const control = FIELD_RULE_ENUM_CONTROLS.find((entry) => entry.controlId === controlId);
  if (!control) throw new Error(`Missing enum control metadata for ${controlId}`);
  return control;
}

const ENUM_POLICY_CONTROL = enumControl('enum_policy');
const ENUM_SOURCE_CONTROL = enumControl('enum_source');
const ENUM_FORMAT_HINT_CONTROL = enumControl('enum_format_hint');

type RegexCheck =
  | { state: 'empty' }
  | { state: 'invalid_pattern'; reason: string }
  | { state: 'match' }
  | { state: 'no_match' };

function evaluatePattern(pattern: string, value: string): RegexCheck {
  if (!pattern || !value) return { state: 'empty' };
  try {
    const re = new RegExp(pattern);
    return re.test(value) ? { state: 'match' } : { state: 'no_match' };
  } catch (err) {
    return { state: 'invalid_pattern', reason: (err as Error).message };
  }
}

// ── Component ────────────────────────────────────────────────────────
export function EnumConfigurator({
  fieldKey,
  rule,
  knownValues,
  enumLists,
  contractType,
  onUpdate,
  renderLabelSuffix,
  isEgLocked = false,
}: EnumConfiguratorProps) {
  const currentSource = strN(rule, ENUM_SOURCE_CONTROL.path, strN(rule, 'enum_source'));
  const currentPolicy = strN(rule, ENUM_POLICY_CONTROL.path, strN(rule, 'enum_policy', String(ENUM_POLICY_CONTROL.fallback)));
  const isBoolean = contractType === 'boolean';
  const effectivePolicy = isBoolean ? 'closed' : currentPolicy;

  // Phase 4: lock display requires SELF-lock (enum.source = component_db.<self>).
  // Cross-locks (e.g. property rule with enum.source pointing at parent
  // component) are bugs INV-2 catches at compile time — the GUI must not
  // display them as locked, otherwise authors can't clear the bad value.
  const isComponentLocked = currentSource === `component_db.${fieldKey}`;
  const componentTypeLabel = isComponentLocked ? fieldKey : '';

  const fieldKnownValues = knownValues[fieldKey] || [];

  const selectedEnumList = currentSource.startsWith('data_lists.')
    ? currentSource.replace('data_lists.', '')
    : '';
  const selectedListEntry = enumLists.find((e) => e.field === selectedEnumList);

  function handleEnumListSelect(listName: string) {
    onUpdate(ENUM_SOURCE_CONTROL.path, listName ? `data_lists.${listName}` : '');
  }

  // Live preview validation for enum.match.format_hint regex.
  const formatHintValue = strN(rule, ENUM_FORMAT_HINT_CONTROL.path);
  const [previewValue, setPreviewValue] = useState('');
  const previewCheck = evaluatePattern(formatHintValue, previewValue);

  // WHY: EG-locked fields show known_values as a read-only list.
  if (isEgLocked && fieldKnownValues.length > 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded sf-surface-alt sf-border-soft border text-[11px] sf-text-subtle">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          <span>EG-managed enum. Policy: <strong>{effectivePolicy}</strong> · {fieldKnownValues.length} registered values</span>
        </div>
        <div>
          <div className={`${labelCls} flex items-center`}>
            <span>Registered Values ({fieldKnownValues.length})</span>
            {renderLabelSuffix?.(ENUM_POLICY_CONTROL.path)}
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

      {isComponentLocked ? (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded sf-surface-alt sf-border-soft border text-[11px] sf-text-subtle"
          title={STUDIO_TIPS.component_lock}
        >
          <span aria-label="component-lock" role="img">🔧</span>
          <span>Component Property Key &mdash; <strong>{componentTypeLabel}</strong>. Source is owned by the Field Studio Map.</span>
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
              <span>{ENUM_POLICY_CONTROL.label}<Tip text={STUDIO_TIPS[ENUM_POLICY_CONTROL.tooltipKey || '']} /></span>
              {renderLabelSuffix?.(ENUM_POLICY_CONTROL.path)}
            </div>
            <select
              className={`${selectCls} w-full`}
              value={effectivePolicy}
              onChange={(e) => onUpdate(ENUM_POLICY_CONTROL.path, e.target.value)}
              disabled={isBoolean}
            >
              {(ENUM_POLICY_CONTROL.options || []).map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </div>
          {!isBoolean ? (
            <div>
              <div className={`${labelCls} flex items-center`}>
                <span>{ENUM_SOURCE_CONTROL.label}<Tip text={STUDIO_TIPS[ENUM_SOURCE_CONTROL.tooltipKey || '']} /></span>
                {renderLabelSuffix?.(ENUM_SOURCE_CONTROL.path)}
              </div>
              {isComponentLocked ? (
                <div className="sf-input w-full rounded border px-2 py-1.5 sf-text-label sf-bg-surface-soft-strong sf-text-muted font-mono flex items-center gap-2">
                  <span>{currentSource}</span>
                  <span className="text-[10px] px-1 rounded sf-chip-info-soft">🔧 locked</span>
                </div>
              ) : (
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
              )}
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

        {!isBoolean && (effectivePolicy === 'open' || effectivePolicy === 'open_prefer_known') && fieldKnownValues.length > 0 ? (
          <p className="text-xs sf-text-subtle italic mt-2">
            New values may be added during pipeline runs.
          </p>
        ) : null}
      </SubSection>

      {/* ── Format Pattern (publisher-owned) ────────────────────── */}
      {!isBoolean ? (
        <SubSection label="Format Pattern">
          <FormatPatternInput
            fieldPath={ENUM_FORMAT_HINT_CONTROL.path}
            value={formatHintValue}
            onChange={(nextValue) => onUpdate(ENUM_FORMAT_HINT_CONTROL.path, nextValue)}
            fieldKey={fieldKey}
            disabled={currentPolicy === 'closed'}
            disabledReason="N/A — closed enum"
            renderLabelSuffix={renderLabelSuffix}
          />
          {/* Live preview validation against the rendered pattern. */}
          {currentPolicy !== 'closed' && formatHintValue ? (
            <div className="mt-2">
              <label className={`${labelCls} flex items-center`}>
                <span>Preview value (test pattern)</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  className="sf-input flex-1 rounded border px-2 py-1.5 sf-text-label"
                  value={previewValue}
                  onChange={(e) => setPreviewValue(e.target.value)}
                  placeholder="Type a sample value"
                  aria-label="format-pattern-preview"
                />
                {previewCheck.state === 'match' ? (
                  <span className="text-[11px] px-2 py-1 rounded sf-chip-success-strong" title="Matches pattern">✓ matches</span>
                ) : null}
                {previewCheck.state === 'no_match' ? (
                  <span className="text-[11px] px-2 py-1 rounded sf-chip-warning-soft" title="Does not match pattern">✗ no match</span>
                ) : null}
                {previewCheck.state === 'invalid_pattern' ? (
                  <span
                    className="text-[11px] px-2 py-1 rounded sf-chip-warning-soft"
                    title={previewCheck.reason}
                  >
                    ✗ invalid pattern
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
        </SubSection>
      ) : null}
    </div>
  );
}
