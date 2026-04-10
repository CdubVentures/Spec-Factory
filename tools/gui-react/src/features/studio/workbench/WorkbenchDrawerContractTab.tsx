import { ComboSelect } from '../../../shared/ui/forms/ComboSelect.tsx';
import { Tip } from '../../../shared/ui/feedback/Tip.tsx';
import {
  parseBoundedIntInput,
  parseIntegerInput,
} from '../state/numericInputHelpers.ts';
import {
  STUDIO_NUMERIC_KNOB_BOUNDS,
} from '../state/studioNumericKnobBounds.ts';
import {
  isStudioContractFieldDeferredLocked,
} from '../state/studioBehaviorContracts.ts';
import {
  boolN,
  numN,
  strN,
} from './workbenchHelpers.ts';
import {
  inputCls,
  labelCls,
  selectCls,
  STUDIO_TIPS,
} from '../components/studioConstants.ts';
import { useUnitRegistryQuery } from '../../../pages/unit-registry/unitRegistryQueries.ts';
import type { BadgeSlot } from './WorkbenchDrawerSimpleTabs.tsx';

const TEXT_GRAY_400 = 'sf-text-subtle';
const TEXT_GRAY_500 = 'sf-text-subtle';
const SECTION_HEADING_CLASS = `text-xs font-semibold ${TEXT_GRAY_500} mt-4`;
const MUTED_ITALIC_TEXT_CLASS = `text-xs ${TEXT_GRAY_400} italic`;
const MUTED_LABEL_W12_CLASS = `${TEXT_GRAY_400} w-12`;
const EFFECTIVE_CONFIG_LABEL_CLASS = `text-[10px] font-semibold ${TEXT_GRAY_400} mb-1`;
const PREVIEW_LABEL_CLASS = `text-[10px] ${TEXT_GRAY_400} mb-1 font-medium`;
const MUTED_ITALIC_T10_CLASS = `${TEXT_GRAY_400} italic text-[10px]`;
const INFO_SURFACE_CLASS = 'sf-surface-card rounded p-2 border sf-border-default';
const NEUTRAL_INLINE_BADGE_CLASS = 'text-[9px] px-1 py-0.5 rounded sf-chip-neutral italic font-medium';
const SOFT_INFO_LINK_CLASS = 'text-[10px] text-accent hover:opacity-80 mt-0.5';

export function ContractTab({
  fieldKey,
  rule,
  onUpdate,
  B,
}: {
  fieldKey: string;
  rule: Record<string, unknown>;
  onUpdate: (path: string, val: unknown) => void;
  B: BadgeSlot;
}) {
  const { data: unitRegistryData } = useUnitRegistryQuery();
  const registryUnits = (unitRegistryData?.units ?? []).map(u => u.canonical);
  const tooltipMd = strN(rule, 'ui.tooltip_md');
  const contractType = strN(rule, 'contract.type', 'string');
  const contractShape = strN(rule, 'contract.shape', 'scalar');
  const isNumericContract = contractType === 'number' || contractType === 'integer';
  const isListContract = contractShape === 'list';

  const parseRangeValue = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (contractType === 'integer') {
      return parseIntegerInput(trimmed) ?? undefined;
    }
    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  };


  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className={`${labelCls} flex items-center`}><span>Data Type<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.data_type} /></span><B p="contract.type" /></div>
          <select className={`${selectCls} w-full`} value={strN(rule, 'contract.type', 'string')} onChange={(e) => onUpdate('contract.type', e.target.value)}>
            <option value="string">string</option>
            <option value="number">number</option>
            <option value="integer">integer</option>
            <option value="boolean">boolean</option>
            <option value="date">date</option>
            <option value="url">url</option>
            <option value="enum">enum</option>
          </select>
        </div>
        <div>
          <div className={`${labelCls} flex items-center`}><span>Shape<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.shape} /></span><B p="contract.shape" /></div>
          <select className={`${selectCls} w-full`} value={strN(rule, 'contract.shape', 'scalar')} onChange={(e) => onUpdate('contract.shape', e.target.value)}>
            <option value="scalar">scalar</option>
            <option value="list">list</option>
            <option value="structured">structured</option>
            <option value="key_value">key_value</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className={`${labelCls} flex items-center`}><span>Unit<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.contract_unit} /></span><B p="contract.unit" /></div>
          <select className={selectCls} value={strN(rule, 'contract.unit')} onChange={(e) => onUpdate('contract.unit', e.target.value || null)}>
            <option value="">— none —</option>
            {registryUnits.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <div className={`${labelCls} flex items-center`}><span>Range<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.contract_range} /></span><B p="contract.range" /></div>
        <div className="grid grid-cols-2 gap-3">
          <input
            className={`${inputCls} w-full`}
            type="number"
            step={contractType === 'integer' ? 1 : 'any'}
            value={strN(rule, 'contract.range.min')}
            onChange={(e) => onUpdate('contract.range.min', parseRangeValue(e.target.value))}
            placeholder="Min"
            disabled={!isNumericContract}
          />
          <input
            className={`${inputCls} w-full`}
            type="number"
            step={contractType === 'integer' ? 1 : 'any'}
            value={strN(rule, 'contract.range.max')}
            onChange={(e) => onUpdate('contract.range.max', parseRangeValue(e.target.value))}
            placeholder="Max"
            disabled={!isNumericContract}
          />
        </div>
        {!isNumericContract ? (
          <div className={MUTED_ITALIC_TEXT_CLASS}>Available for number and integer contracts.</div>
        ) : null}
      </div>
      <div className="space-y-2">
        <div className={`${labelCls} flex items-center`}><span>List Rules<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.list_rules} /></span><B p="contract.list_rules" /></div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={boolN(rule, 'contract.list_rules.dedupe', true)}
              onChange={(e) => onUpdate('contract.list_rules.dedupe', e.target.checked)}
              className="rounded sf-border-soft"
              disabled={!isListContract}
            />
            <span>Dedupe<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.list_rules_dedupe} /></span>
          </label>
          <div>
            <div className={labelCls}>Sort<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.list_rules_sort} /></div>
            <select className={`${selectCls} w-full`} value={strN(rule, 'contract.list_rules.sort', 'none')} onChange={(e) => onUpdate('contract.list_rules.sort', e.target.value)} disabled={!isListContract}>
              <option value="none">none</option>
              <option value="asc">asc</option>
              <option value="desc">desc</option>
            </select>
          </div>
          <div className="col-span-2">
            <div className={labelCls}>Item Union<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.list_rules_item_union} /></div>
            <select className={`${selectCls} w-full`} value={strN(rule, 'contract.list_rules.item_union')} onChange={(e) => onUpdate('contract.list_rules.item_union', e.target.value || undefined)} disabled={!isListContract}>
              <option value="">winner_only</option>
              <option value="set_union">set_union</option>
              <option value="ordered_union">ordered_union</option>
            </select>
          </div>
        </div>
        {!isListContract ? (
          <div className={MUTED_ITALIC_TEXT_CLASS}>Available when contract shape is list.</div>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className={`${labelCls} flex items-center`}><span>Rounding<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.rounding_decimals} /></span><B p="contract.rounding.decimals" /></div>
          <input
            className={`${inputCls} w-full`}
            type="number"
            min={STUDIO_NUMERIC_KNOB_BOUNDS.contractRoundingDecimals.min}
            max={STUDIO_NUMERIC_KNOB_BOUNDS.contractRoundingDecimals.max}
            value={numN(rule, 'contract.rounding.decimals', 0)}
            onChange={(e) => onUpdate(
              'contract.rounding.decimals',
              parseBoundedIntInput(
                e.target.value,
                STUDIO_NUMERIC_KNOB_BOUNDS.contractRoundingDecimals.min,
                STUDIO_NUMERIC_KNOB_BOUNDS.contractRoundingDecimals.max,
                STUDIO_NUMERIC_KNOB_BOUNDS.contractRoundingDecimals.fallback,
              ),
            )}
          />
        </div>
        <div>
          <div className={`${labelCls} flex items-center`}><span>Rounding Mode<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.rounding_mode} /></span><B p="contract.rounding.mode" /></div>
          <select className={`${selectCls} w-full`} value={strN(rule, 'contract.rounding.mode', 'nearest')} onChange={(e) => onUpdate('contract.rounding.mode', e.target.value)} disabled={isStudioContractFieldDeferredLocked('contract.rounding.mode')}>
            <option value="nearest">nearest</option>
            <option value="floor">floor</option>
            <option value="ceil">ceil</option>
          </select>
        </div>
      </div>
      <h4 className={SECTION_HEADING_CLASS}>Priority & Effort</h4>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className={`${labelCls} flex items-center`}><span>Required Level<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.required_level} /></span><B p="priority.required_level" /></div>
          <select className={`${selectCls} w-full`} value={strN(rule, 'priority.required_level', strN(rule, 'required_level', 'expected'))} onChange={(e) => onUpdate('priority.required_level', e.target.value)}>
            <option value="identity">identity</option>
            <option value="required">required</option>
            <option value="critical">critical</option>
            <option value="expected">expected</option>
            <option value="optional">optional</option>
            <option value="editorial">editorial</option>
            <option value="commerce">commerce</option>
          </select>
        </div>
        <div>
          <div className={`${labelCls} flex items-center`}><span>Availability<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.availability} /></span><B p="priority.availability" /></div>
          <select className={`${selectCls} w-full`} value={strN(rule, 'priority.availability', strN(rule, 'availability', 'expected'))} onChange={(e) => onUpdate('priority.availability', e.target.value)}>
            <option value="always">always</option>
            <option value="expected">expected</option>
            <option value="sometimes">sometimes</option>
            <option value="rare">rare</option>
            <option value="editorial_only">editorial_only</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className={`${labelCls} flex items-center`}><span>Difficulty<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.difficulty} /></span><B p="priority.difficulty" /></div>
          <select className={`${selectCls} w-full`} value={strN(rule, 'priority.difficulty', strN(rule, 'difficulty', 'easy'))} onChange={(e) => onUpdate('priority.difficulty', e.target.value)}>
            <option value="easy">easy</option>
            <option value="medium">medium</option>
            <option value="hard">hard</option>
            <option value="instrumented">instrumented</option>
          </select>
        </div>
        <div>
          <div className={`${labelCls} flex items-center`}><span>Effort (1-10)<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.effort} /></span><B p="priority.effort" /></div>
          <input
            className={`${inputCls} w-full`}
            type="number"
            min={STUDIO_NUMERIC_KNOB_BOUNDS.priorityEffort.min}
            max={STUDIO_NUMERIC_KNOB_BOUNDS.priorityEffort.max}
            value={numN(rule, 'priority.effort', numN(rule, 'effort', 3))}
            onChange={(e) => onUpdate(
              'priority.effort',
              parseBoundedIntInput(
                e.target.value,
                STUDIO_NUMERIC_KNOB_BOUNDS.priorityEffort.min,
                STUDIO_NUMERIC_KNOB_BOUNDS.priorityEffort.max,
                STUDIO_NUMERIC_KNOB_BOUNDS.priorityEffort.fallback,
              ),
            )}
          />
        </div>
      </div>

      <h4 className={SECTION_HEADING_CLASS}>Extraction Guidance</h4>
      {(() => {
        const rl = strN(rule, 'priority.required_level', strN(rule, 'required_level', 'expected'));
        const diff = strN(rule, 'priority.difficulty', strN(rule, 'difficulty', 'easy'));
        const explicitNote = strN(rule, 'ai_assist.reasoning_note');
        const type = strN(rule, 'contract.data_type', strN(rule, 'data_type', 'string'));
        const shape = strN(rule, 'contract.shape', strN(rule, 'shape', 'scalar'));
        const unit = strN(rule, 'contract.unit', strN(rule, 'unit'));
        const enumPolicy = strN(rule, 'enum.policy', strN(rule, 'enum_policy', 'open'));
        const enumSource = strN(rule, 'enum.source', strN(rule, 'enum_source'));
        const minRefs = numN(
          rule,
          'evidence.min_evidence_refs',
          numN(rule, 'min_evidence_refs', STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.fallback),
        );
        const componentType = strN(rule, 'component.type', strN(rule, 'component_type'));

        const guidanceParts: string[] = [];
        if (rl === 'identity') guidanceParts.push('Identity field - must exactly match the product.');
        if (componentType) {
          const ct = componentType || enumSource.replace('component_db.', '');
          guidanceParts.push(`Component ref (${ct}). Match to known names/aliases.`);
        }
        if (type === 'boolean') {
          guidanceParts.push('Boolean - determine yes or no from explicit evidence.');
        } else if ((type === 'number' || type === 'integer') && unit) {
          guidanceParts.push(`Numeric - extract exact value in ${unit}.`);
        } else if (type === 'url') {
          guidanceParts.push('URL - extract full, valid URL.');
        } else if (type === 'date' || fieldKey.includes('date')) {
          guidanceParts.push('Date - extract actual date from official sources.');
        } else if (type === 'string' && !componentType) {
          guidanceParts.push('Text - extract exact value as stated.');
        }
        if (shape === 'list') guidanceParts.push('Multiple values - extract all distinct.');
        if (enumPolicy === 'closed' && enumSource) guidanceParts.push(`Closed enum - must match ${enumSource}.`);
        if (diff === 'hard') guidanceParts.push('Often inconsistent - prefer manufacturer spec sheets.');
        else if (diff === 'instrumented') guidanceParts.push('Lab-measured - only from independent tests.');
        if (minRefs >= 2) guidanceParts.push(`Requires ${minRefs}+ independent refs.`);
        if (rl === 'required' || rl === 'critical') guidanceParts.push('High-priority - blocked if unknown.');
        if (guidanceParts.length === 0) guidanceParts.push('Extract from most authoritative source.');
        const autoNote = guidanceParts.join(' ');
        const hasExplicit = explicitNote.length > 0;

        return (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={labelCls.replace(' mb-1', '')}>Extraction Guidance<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.ai_reasoning_note} /></span><B p="ai_assist.reasoning_note" />
              {!hasExplicit && <span className={NEUTRAL_INLINE_BADGE_CLASS}>Auto</span>}
            </div>
            <textarea
              className={`${inputCls} w-full`}
              rows={2}
              value={explicitNote}
              onChange={(e) => onUpdate('ai_assist.reasoning_note', e.target.value)}
              placeholder={`Auto: ${autoNote}`}
            />
            {hasExplicit && (
              <button
                className={SOFT_INFO_LINK_CLASS}
                onClick={() => onUpdate('ai_assist.reasoning_note', '')}
              >
                Clear &amp; revert to auto
              </button>
            )}
          </div>
        );
      })()}

      <h4 className={SECTION_HEADING_CLASS}>Description & Tooltip</h4>
      <div>
        <div className={`${labelCls} flex items-center`}><span>Tooltip / Guidance<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.tooltip_guidance} /></span><B p="ui.tooltip_md" /></div>
        <textarea
          className={`${inputCls} w-full`}
          rows={3}
          value={tooltipMd}
          onChange={(e) => onUpdate('ui.tooltip_md', e.target.value)}
          placeholder="Describe how this field should be interpreted..."
        />
      </div>
      {tooltipMd && (
        <div className={`text-xs ${INFO_SURFACE_CLASS}`}>
          <div className={PREVIEW_LABEL_CLASS}>Preview:</div>
          <div className="sf-text-muted whitespace-pre-wrap">{tooltipMd}</div>
        </div>
      )}
    </div>
  );
}
