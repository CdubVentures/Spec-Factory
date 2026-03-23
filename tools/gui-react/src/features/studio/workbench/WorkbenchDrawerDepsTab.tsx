import { useState } from 'react';

import { TagPicker } from '../../../shared/ui/forms/TagPicker';
import { Tip } from '../../../shared/ui/feedback/Tip';
import {
  parseBoundedFloatInput,
} from '../state/numericInputHelpers';
import {
  STUDIO_COMPONENT_MATCH_DEFAULTS,
  STUDIO_NUMERIC_KNOB_BOUNDS,
} from '../state/studioNumericKnobBounds';
import { useStudioFieldRulesState } from '../state/studioFieldRulesController';
import {
  arrN,
  extractConstraintVariables,
  numN,
  strN,
} from './workbenchHelpers';
import {
  COMPONENT_TYPES,
  inputCls,
  labelCls,
  selectCls,
  STUDIO_TIPS,
} from '../components/studioConstants';
import type { ComponentSource } from '../../../types/studio';
import type { BadgeSlot } from './WorkbenchDrawerSimpleTabs';

const TEXT_GRAY_400 = 'sf-text-subtle';
const MUTED_ITALIC_TEXT_CLASS = `text-xs ${TEXT_GRAY_400} italic`;
const MUTED_TEXT_9_CLASS = `text-[9px] ${TEXT_GRAY_400}`;
const SUBHEADING_GRAY_CLASS = `text-[11px] font-medium ${TEXT_GRAY_400} mb-1`;

export function DepsTab({
  rule,
  fieldKey,
  onUpdate,
  componentSources,
  knownValues,
  onNavigate,
  B,
}: {
  rule: Record<string, unknown>;
  fieldKey: string;
  onUpdate: (path: string, val: unknown) => void;
  componentSources: ComponentSource[];
  knownValues: Record<string, string[]>;
  onNavigate: (key: string) => void;
  B: BadgeSlot;
}) {
  const { editedRules } = useStudioFieldRulesState();
  const [newConstraint, setNewConstraint] = useState('');
  const constraints = arrN(rule, 'constraints');
  const constraintVariables = extractConstraintVariables(constraints, fieldKey);

  const addConstraint = () => {
    const expr = newConstraint.trim();
    if (!expr || constraints.includes(expr)) return;
    onUpdate('constraints', [...constraints, expr]);
    setNewConstraint('');
  };

  return (
    <div className="space-y-3">
      <div>
        <div className={`${labelCls} flex items-center`}><span>Component DB<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.component_db} /></span><B p="component.type" /></div>
        <select
          className={`${selectCls} w-full`}
          value={strN(rule, 'component.type')}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) {
              onUpdate('component', null);
              if (strN(rule, 'parse.template') === 'component_reference') {
                onUpdate('parse.template', 'text_field');
              }
            } else {
              onUpdate('component', {
                type: v,
                source: `component_db.${v}`,
                allow_new_components: true,
                require_identity_evidence: true,
              });
              onUpdate('parse.template', 'component_reference');
              onUpdate('enum.source', `component_db.${v}`);
              onUpdate('enum.policy', 'open_prefer_known');
              onUpdate('enum.match.strategy', 'alias');
              onUpdate('ui.input_control', 'component_picker');
            }
          }}
        >
          <option value="">(none)</option>
          {COMPONENT_TYPES.map((ct) => (
            <option key={ct} value={ct}>{ct}</option>
          ))}
        </select>
      </div>
      {strN(rule, 'component.type') && (
        <>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-2 py-0.5 rounded-full sf-review-ai-pending-badge font-medium">
              component_reference
            </span>
            <span className={TEXT_GRAY_400}>
              Parse: <span className="font-mono">{strN(rule, 'parse.template')}</span>
              {' | '}Enum: <span className="font-mono">{strN(rule, 'enum.source')}</span>
            </span>
          </div>
          <details className="border sf-border-default dark:sf-border-default rounded">
            <summary className="px-2 py-1 text-xs font-semibold cursor-pointer sf-bg-surface-soft sf-dk-surface-700a50">Match Settings</summary>
            <div className="p-2 space-y-2">
              <div className={SUBHEADING_GRAY_CLASS}>Name Matching</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className={`${labelCls} flex items-center`}><span>Fuzzy Threshold<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.comp_match_fuzzy_threshold} /></span><B p="component.match.fuzzy_threshold" /></div>
                  <input
                    type="number"
                    min={STUDIO_NUMERIC_KNOB_BOUNDS.componentMatch.min}
                    max={STUDIO_NUMERIC_KNOB_BOUNDS.componentMatch.max}
                    step={0.05}
                    className={`${selectCls} w-full`}
                    value={numN(rule, 'component.match.fuzzy_threshold', STUDIO_COMPONENT_MATCH_DEFAULTS.fuzzyThreshold)}
                    onChange={(e) => onUpdate(
                      'component.match.fuzzy_threshold',
                      parseBoundedFloatInput(
                        e.target.value,
                        STUDIO_NUMERIC_KNOB_BOUNDS.componentMatch.min,
                        STUDIO_NUMERIC_KNOB_BOUNDS.componentMatch.max,
                        STUDIO_COMPONENT_MATCH_DEFAULTS.fuzzyThreshold,
                      ),
                    )} />
                </div>
                <div>
                  <div className={`${labelCls} flex items-center`}><span>Name Weight<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.comp_match_name_weight} /></span><B p="component.match.name_weight" /></div>
                  <input
                    type="number"
                    min={STUDIO_NUMERIC_KNOB_BOUNDS.componentMatch.min}
                    max={STUDIO_NUMERIC_KNOB_BOUNDS.componentMatch.max}
                    step={0.05}
                    className={`${selectCls} w-full`}
                    value={numN(rule, 'component.match.name_weight', STUDIO_COMPONENT_MATCH_DEFAULTS.nameWeight)}
                    onChange={(e) => onUpdate(
                      'component.match.name_weight',
                      parseBoundedFloatInput(
                        e.target.value,
                        STUDIO_NUMERIC_KNOB_BOUNDS.componentMatch.min,
                        STUDIO_NUMERIC_KNOB_BOUNDS.componentMatch.max,
                        STUDIO_COMPONENT_MATCH_DEFAULTS.nameWeight,
                      ),
                    )} />
                </div>
                <div>
                  <div className={`${labelCls} flex items-center`}><span>Auto-Accept<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.comp_match_auto_accept_score} /></span><B p="component.match.auto_accept_score" /></div>
                  <input
                    type="number"
                    min={STUDIO_NUMERIC_KNOB_BOUNDS.componentMatch.min}
                    max={STUDIO_NUMERIC_KNOB_BOUNDS.componentMatch.max}
                    step={0.05}
                    className={`${selectCls} w-full`}
                    value={numN(rule, 'component.match.auto_accept_score', STUDIO_COMPONENT_MATCH_DEFAULTS.autoAcceptScore)}
                    onChange={(e) => onUpdate(
                      'component.match.auto_accept_score',
                      parseBoundedFloatInput(
                        e.target.value,
                        STUDIO_NUMERIC_KNOB_BOUNDS.componentMatch.min,
                        STUDIO_NUMERIC_KNOB_BOUNDS.componentMatch.max,
                        STUDIO_COMPONENT_MATCH_DEFAULTS.autoAcceptScore,
                      ),
                    )} />
                </div>
                <div>
                  <div className={`${labelCls} flex items-center`}><span>Flag Review<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.comp_match_flag_review_score} /></span><B p="component.match.flag_review_score" /></div>
                  <input
                    type="number"
                    min={STUDIO_NUMERIC_KNOB_BOUNDS.componentMatch.min}
                    max={STUDIO_NUMERIC_KNOB_BOUNDS.componentMatch.max}
                    step={0.05}
                    className={`${selectCls} w-full`}
                    value={numN(rule, 'component.match.flag_review_score', STUDIO_COMPONENT_MATCH_DEFAULTS.flagReviewScore)}
                    onChange={(e) => onUpdate(
                      'component.match.flag_review_score',
                      parseBoundedFloatInput(
                        e.target.value,
                        STUDIO_NUMERIC_KNOB_BOUNDS.componentMatch.min,
                        STUDIO_NUMERIC_KNOB_BOUNDS.componentMatch.max,
                        STUDIO_COMPONENT_MATCH_DEFAULTS.flagReviewScore,
                      ),
                    )} />
                </div>
              </div>
              <div className={`${SUBHEADING_GRAY_CLASS} mt-2`}>Property Matching</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className={`${labelCls} flex items-center`}><span>Prop Weight<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.comp_match_property_weight} /></span><B p="component.match.property_weight" /></div>
                  <input
                    type="number"
                    min={STUDIO_NUMERIC_KNOB_BOUNDS.componentMatch.min}
                    max={STUDIO_NUMERIC_KNOB_BOUNDS.componentMatch.max}
                    step={0.05}
                    className={`${selectCls} w-full`}
                    value={numN(rule, 'component.match.property_weight', STUDIO_COMPONENT_MATCH_DEFAULTS.propertyWeight)}
                    onChange={(e) => onUpdate(
                      'component.match.property_weight',
                      parseBoundedFloatInput(
                        e.target.value,
                        STUDIO_NUMERIC_KNOB_BOUNDS.componentMatch.min,
                        STUDIO_NUMERIC_KNOB_BOUNDS.componentMatch.max,
                        STUDIO_COMPONENT_MATCH_DEFAULTS.propertyWeight,
                      ),
                    )} />
                </div>
                <div className="col-span-2">
                  <div className={labelCls}>Property Keys<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.comp_match_property_keys} /></div>
                  {(() => {
                    const compType = strN(rule, 'component.type');
                    const compSource = componentSources.find(
                      (source) => (source.component_type || source.type) === compType,
                    );
                    const derivedProps = (compSource?.roles?.properties || []).filter((prop) => prop.field_key);
                    const numericOnlyPolicies = ['upper_bound', 'lower_bound', 'range'];
                    return (
                      <div className="space-y-1">
                        {derivedProps.map((prop) => {
                          const raw = prop.variance_policy || 'authoritative';
                          const fieldRule = editedRules[prop.field_key || ''] as Record<string, unknown> | undefined;
                          const enumSrc = fieldRule ? strN(fieldRule, 'enum.source') : '';
                          const contractType = fieldRule ? strN(fieldRule, 'contract.type') : '';
                          const parseTemplate = fieldRule ? strN(fieldRule, 'parse.template') : '';
                          const isBool = contractType === 'boolean';
                          const hasEnum = !!enumSrc;
                          const isComponentDb = hasEnum && enumSrc.startsWith('component_db');
                          const isExtEnum = hasEnum && !isComponentDb;
                          const isLocked = contractType !== 'number' || isBool || hasEnum;
                          const vp = isLocked && numericOnlyPolicies.includes(raw) ? 'authoritative' : raw;
                          const fieldValues = knownValues[prop.field_key || ''] || [];
                          const lockReason = isBool
                            ? 'Boolean field - locked to authoritative'
                            : isComponentDb
                              ? `enum.db (${enumSrc.replace(/^component_db\./, '')}) - locked to authoritative`
                              : isExtEnum
                                ? `Enum (${enumSrc.replace(/^(known_values|data_lists)\./, '')}) - locked to authoritative`
                                : contractType !== 'number' && fieldValues.length > 0
                                  ? `Manual values (${fieldValues.length}) - locked to authoritative`
                                  : isLocked
                                    ? 'String property - locked to authoritative'
                                    : '';
                          return (
                            <div key={prop.field_key} className="flex items-start gap-1.5 px-1.5 py-0.5 rounded border sf-progress-active-shell text-[11px]">
                              <span className="font-medium sf-status-text-info shrink-0">{prop.field_key}</span>
                              <span
                                className={`text-[9px] px-1 rounded shrink-0 ${vp === 'override_allowed' ? 'sf-chip-teal-strong' : isLocked ? 'sf-bg-surface-soft-strong sf-text-subtle sf-dk-surface-700 dark:sf-text-subtle' : 'sf-chip-info-soft'}`}
                                title={lockReason || (vp === 'override_allowed' ? 'Products can override this value without triggering review' : `Variance: ${vp}`)}
                              >{vp === 'override_allowed' ? 'override' : vp}</span>
                              {parseTemplate ? <span className="text-[9px] px-1 rounded sf-bg-surface-soft sf-text-subtle sf-dk-surface-800 dark:sf-text-subtle shrink-0">{parseTemplate}</span> : null}
                              {isBool ? <span className="text-[9px] px-1 rounded sf-chip-warning-strong shrink-0">boolean: yes / no</span> : null}
                              {isComponentDb ? <span className="text-[9px] px-1 rounded sf-review-ai-pending-badge shrink-0 truncate max-w-[120px]" title={enumSrc}>enum.db: {enumSrc.replace(/^component_db\./, '')}</span> : null}
                              {isExtEnum ? <span className="text-[9px] px-1 rounded sf-review-ai-pending-badge shrink-0 truncate max-w-[120px]" title={enumSrc}>enum: {enumSrc.replace(/^(known_values|data_lists)\./, '')}</span> : null}
                              {!isBool && !hasEnum && isLocked && fieldValues.length > 0 && fieldValues.length <= 6 ? (
                                <div className="flex flex-wrap gap-0.5">
                                  <span className={`${MUTED_TEXT_9_CLASS} mr-0.5`}>manual:</span>
                                  {fieldValues.map((value) => <span key={value} className="text-[9px] px-1 rounded sf-bg-surface-soft-strong sf-text-subtle sf-dk-surface-700 dark:sf-text-subtle">{value}</span>)}
                                </div>
                              ) : null}
                              {!isBool && !hasEnum && isLocked && fieldValues.length > 6 ? (
                                <span className={MUTED_TEXT_9_CLASS} title={fieldValues.join(', ')}>manual: {fieldValues.length} values</span>
                              ) : null}
                            </div>
                          );
                        })}
                        {derivedProps.length === 0 ? (
                          <span className={MUTED_ITALIC_TEXT_CLASS}>No properties mapped - add in Mapping Studio</span>
                        ) : null}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </details>
        </>
      )}
      <div>
        <div className={`${labelCls} flex items-center`}><span>Cross-Field Constraints<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.key_section_constraints} /></span><B p="constraints" /></div>
        <div className="space-y-2">
          {constraints.length > 0 ? (
            <div className="space-y-1">
              {constraints.map((expr, idx) => (
                <div key={`${expr}-${idx}`} className="flex items-center gap-1">
                  <code className="flex-1 text-[11px] px-2 py-1 rounded sf-bg-surface-soft sf-dk-surface-800 border sf-border-default dark:sf-border-default break-all">{expr}</code>
                  <button
                    className="text-xs px-2 py-1 rounded border sf-border-default dark:sf-border-default sf-hover-bg-surface-soft dark:hover:bg-gray-800"
                    onClick={() => onUpdate('constraints', constraints.filter((_, i) => i !== idx))}
                    title="Remove constraint"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className={MUTED_ITALIC_TEXT_CLASS}>No constraints configured</div>
          )}
          <div className="flex gap-1">
            <input
              className={`${inputCls} flex-1`}
              placeholder={`${fieldKey} <= other_field`}
              value={newConstraint}
              onChange={(e) => setNewConstraint(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addConstraint();
                }
              }}
            />
            <button
              className="text-xs px-2 py-1 rounded border sf-border-default dark:sf-border-default sf-hover-bg-surface-soft dark:hover:bg-gray-800 disabled:opacity-50"
              onClick={addConstraint}
              disabled={!newConstraint.trim()}
            >
              Add
            </button>
          </div>
          {constraintVariables.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {constraintVariables.map((dep) => {
                const isKnownField = Boolean(editedRules[dep]);
                if (!isKnownField) {
                  return (
                    <span key={dep} className="px-1.5 py-0.5 rounded text-[10px] sf-bg-surface-soft-strong sf-text-subtle sf-dk-surface-800 dark:sf-text-subtle">
                      {dep}
                    </span>
                  );
                }
                return (
                  <button
                    key={dep}
                    className="px-1.5 py-0.5 rounded text-[10px] sf-chip-info-strong sf-chip-info-strong-hover"
                    onClick={() => onNavigate(dep)}
                    title={`Open ${dep}`}
                  >
                    {dep}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
      <div>
        <div className={`${labelCls} flex items-center`}><span>Aliases<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.aliases} /></span><B p="aliases" /></div>
        <TagPicker values={arrN(rule, 'aliases')} onChange={(v) => onUpdate('aliases', v)} placeholder="alternative names for this key" />
      </div>
    </div>
  );
}
