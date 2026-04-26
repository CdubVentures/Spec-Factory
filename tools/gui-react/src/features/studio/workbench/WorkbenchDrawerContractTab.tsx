import { ComboSelect } from '../../../shared/ui/forms/ComboSelect.tsx';
import { Tip } from '../../../shared/ui/feedback/Tip.tsx';
import { NumberStepper } from '../../../shared/ui/forms/NumberStepper.tsx';
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
import { isFieldAvailable } from '../state/fieldCascadeRegistry.ts';
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
import {
  REQUIRED_LEVEL_OPTIONS,
  AVAILABILITY_OPTIONS,
  DIFFICULTY_OPTIONS,
} from '../../../registries/fieldRuleTaxonomy.ts';
import { VALID_TYPES, VALID_SHAPES } from '../state/typeShapeRegistry.ts';
import { AiAssistToggleSubsection } from '../components/key-sections/AiAssistToggleSubsection.tsx';

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
  disabled = false,
}: {
  fieldKey: string;
  rule: Record<string, unknown>;
  onUpdate: (path: string, val: unknown) => void;
  B: BadgeSlot;
  disabled?: boolean;
}) {
  const { data: unitRegistryData } = useUnitRegistryQuery();
  const registryUnits = (unitRegistryData?.units ?? []).map(u => u.canonical);
  const tooltipMd = strN(rule, 'ui.tooltip_md');
  const contractType = strN(rule, 'contract.type', 'string');

  const parseRangeValue = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (contractType === 'integer') {
      return parseIntegerInput(trimmed) ?? undefined;
    }
    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  };


  const variantDependent = boolN(rule, 'variant_dependent', false);
  const productImageDependent = boolN(rule, 'product_image_dependent', false);

  return (
    <div className="space-y-3">
      {/* ── Variant Dependent (top-level knob, far-right) ─────────
          WHY: Declares that this field's published state is per-variant.
          Auto-true on EG defaults; user-toggleable on non-EG fields. */}
      <div className={`flex items-center justify-between gap-3 px-3 py-2 rounded-md sf-surface-panel border sf-border-soft ${variantDependent ? 'sf-switch-on' : ''}`}>
        <div className="flex items-center gap-2 min-w-0">
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className={`w-3.5 h-3.5 shrink-0 ${variantDependent ? '' : 'sf-text-subtle'}`}
            aria-hidden="true"
          >
            <circle cx="4" cy="4" r="1.5" />
            <circle cx="12" cy="4" r="1.5" />
            <circle cx="8" cy="12" r="1.5" />
            <path d="M4 4h8M4 4l4 8M12 4l-4 8" />
          </svg>
          <div className="flex flex-col min-w-0">
            <div className={`${labelCls} flex items-center m-0`}>
              <span className="font-semibold">Variant Dependent</span>
              <B p="variant_dependent" />
            </div>
            <span className="sf-text-nano sf-text-subtle leading-tight">
              {variantDependent
                ? 'One value per variant (colors, editions, release_date, …)'
                : 'One value per product (weight, dpi, connection, …)'}
            </span>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={variantDependent}
          aria-label={variantDependent ? 'Per-variant (on)' : 'Per-product (off)'}
          disabled={disabled}
          onClick={() => onUpdate('variant_dependent', !variantDependent)}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full sf-switch-track transition focus:outline-none focus:ring-2 focus:ring-accent/25 ${variantDependent ? 'sf-switch-track-on' : ''} disabled:opacity-60 disabled:cursor-not-allowed`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 rounded-full sf-switch-thumb transition-transform ${variantDependent ? 'translate-x-4' : 'translate-x-0.5'}`}
            aria-hidden="true"
          />
        </button>
      </div>

      <div className={`flex items-center justify-between gap-3 px-3 py-2 rounded-md sf-surface-panel border sf-border-soft ${productImageDependent ? 'sf-switch-on' : ''}`}>
        <div className="flex items-center gap-2 min-w-0">
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className={`w-3.5 h-3.5 shrink-0 ${productImageDependent ? '' : 'sf-text-subtle'}`}
            aria-hidden="true"
          >
            <rect x="2.5" y="3" width="11" height="8" rx="1.5" />
            <circle cx="5" cy="5.5" r="1" />
            <path d="M3.5 10l3-3 2 2 1.5-1.5 2.5 2.5" />
            <path d="M5 13h6" />
          </svg>
          <div className="flex flex-col min-w-0">
            <div className={`${labelCls} flex items-center m-0`}>
              <span className="font-semibold">Product Image Dependent</span>
              <B p="product_image_dependent" />
            </div>
            <span className="sf-text-nano sf-text-subtle leading-tight">
              {productImageDependent
                ? 'Resolved value is injected into PIF search and eval identity context'
                : 'PIF image prompts ignore this field value'}
            </span>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={productImageDependent}
          aria-label={productImageDependent ? 'Product image dependent (on)' : 'Product image dependent (off)'}
          disabled={disabled}
          onClick={() => onUpdate('product_image_dependent', !productImageDependent)}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full sf-switch-track transition focus:outline-none focus:ring-2 focus:ring-accent/25 ${productImageDependent ? 'sf-switch-track-on' : ''} disabled:opacity-60 disabled:cursor-not-allowed`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 rounded-full sf-switch-thumb transition-transform ${productImageDependent ? 'translate-x-4' : 'translate-x-0.5'}`}
            aria-hidden="true"
          />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className={`${labelCls} flex items-center`}><span>Data Type<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.data_type} /></span><B p="contract.type" /></div>
          <select className={`${selectCls} w-full`} value={strN(rule, 'contract.type', 'string')} onChange={(e) => onUpdate('contract.type', e.target.value)} disabled={disabled}>
            {VALID_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <div className={`${labelCls} flex items-center`}><span>Shape<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.shape} /></span><B p="contract.shape" /></div>
          <select className={`${selectCls} w-full`} value={strN(rule, 'contract.shape', 'scalar')} onChange={(e) => onUpdate('contract.shape', e.target.value)} disabled={disabled}>
            {VALID_SHAPES.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className={`${labelCls} flex items-center`}><span>Unit<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.contract_unit} /></span><B p="contract.unit" /></div>
          <select className={selectCls} value={strN(rule, 'contract.unit')} onChange={(e) => onUpdate('contract.unit', e.target.value || null)} disabled={disabled || !isFieldAvailable(rule, 'contract.unit')}>
            <option value="">— none —</option>
            {registryUnits.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className={`${labelCls} flex items-center`}><span>Range Min<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.contract_range} /></span><B p="contract.range.min" /></div>
            <input
              className={`${inputCls} w-full`}
              type="number"
              step={contractType === 'integer' ? 1 : 'any'}
              value={strN(rule, 'contract.range.min')}
              onChange={(e) => onUpdate('contract.range.min', parseRangeValue(e.target.value))}
              placeholder="Min"
              disabled={!isFieldAvailable(rule, 'contract.range.min')}
            />
          </div>
          <div>
            <div className={`${labelCls} flex items-center`}><span>Range Max</span><B p="contract.range.max" /></div>
            <input
              className={`${inputCls} w-full`}
              type="number"
              step={contractType === 'integer' ? 1 : 'any'}
              value={strN(rule, 'contract.range.max')}
              onChange={(e) => onUpdate('contract.range.max', parseRangeValue(e.target.value))}
              placeholder="Max"
              disabled={!isFieldAvailable(rule, 'contract.range.max')}
            />
          </div>
        </div>
        {!isFieldAvailable(rule, 'contract.range.min') ? (
          <div className={MUTED_ITALIC_TEXT_CLASS}>Available for numeric contracts.</div>
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
              disabled={!isFieldAvailable(rule, 'contract.list_rules.dedupe')}
            />
            <span>Dedupe<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.list_rules_dedupe} /></span>
          </label>
          <div>
            <div className={labelCls}>Sort<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.list_rules_sort} /></div>
            <select className={`${selectCls} w-full`} value={strN(rule, 'contract.list_rules.sort', 'none')} onChange={(e) => onUpdate('contract.list_rules.sort', e.target.value)} disabled={!isFieldAvailable(rule, 'contract.list_rules.dedupe')}>
              <option value="none">none</option>
              <option value="asc">asc</option>
              <option value="desc">desc</option>
            </select>
          </div>
          <div className="col-span-2">
            <div className={labelCls}>Item Union<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.list_rules_item_union} /></div>
            <select className={`${selectCls} w-full`} value={strN(rule, 'contract.list_rules.item_union')} onChange={(e) => onUpdate('contract.list_rules.item_union', e.target.value || undefined)} disabled={!isFieldAvailable(rule, 'contract.list_rules.dedupe')}>
              <option value="">winner_only</option>
              <option value="set_union">set_union</option>
              <option value="ordered_union">ordered_union</option>
            </select>
          </div>
        </div>
        {!isFieldAvailable(rule, 'contract.list_rules.dedupe') ? (
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
            disabled={!isFieldAvailable(rule, 'contract.rounding.decimals')}
          />
        </div>
        <div>
          <div className={`${labelCls} flex items-center`}><span>Rounding Mode<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.rounding_mode} /></span><B p="contract.rounding.mode" /></div>
          <select className={`${selectCls} w-full`} value={strN(rule, 'contract.rounding.mode', 'nearest')} onChange={(e) => onUpdate('contract.rounding.mode', e.target.value)} disabled={isStudioContractFieldDeferredLocked('contract.rounding.mode')} title="Locked: applied at compile time">
            <option value="nearest">nearest</option>
            <option value="floor">floor</option>
            <option value="ceil">ceil</option>
          </select>
        </div>
      </div>
      <h4 className={SECTION_HEADING_CLASS}>Extraction Priority & Guidance</h4>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className={`${labelCls} flex items-center`}><span>Required Level<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.required_level} /></span><B p="priority.required_level" /></div>
          <select className={`${selectCls} w-full`} value={strN(rule, 'priority.required_level', strN(rule, 'required_level', 'non_mandatory'))} onChange={(e) => onUpdate('priority.required_level', e.target.value)} disabled={disabled}>
            {REQUIRED_LEVEL_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <div className={`${labelCls} flex items-center`}><span>Availability<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.availability} /></span><B p="priority.availability" /></div>
          <select className={`${selectCls} w-full`} value={strN(rule, 'priority.availability', strN(rule, 'availability', 'sometimes'))} onChange={(e) => onUpdate('priority.availability', e.target.value)} disabled={disabled}>
            {AVAILABILITY_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3">
        <div>
          <div className={`${labelCls} flex items-center`}><span>Difficulty<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.difficulty} /></span><B p="priority.difficulty" /></div>
          <select className={`${selectCls} w-full`} value={strN(rule, 'priority.difficulty', strN(rule, 'difficulty', 'easy'))} onChange={(e) => onUpdate('priority.difficulty', e.target.value)} disabled={disabled}>
            {DIFFICULTY_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>

      <h4 className={SECTION_HEADING_CLASS}>Extraction Guidance</h4>
      {(() => {
        const rl = strN(rule, 'priority.required_level', strN(rule, 'required_level', 'non_mandatory'));
        const diff = strN(rule, 'priority.difficulty', strN(rule, 'difficulty', 'easy'));
        const explicitNote = strN(rule, 'ai_assist.reasoning_note');
        const type = strN(rule, 'contract.data_type', strN(rule, 'data_type', 'string'));
        const shape = strN(rule, 'contract.shape', strN(rule, 'shape', 'scalar'));
        const unit = strN(rule, 'contract.unit', strN(rule, 'unit'));
        const enumPolicy = contractType === 'boolean' ? 'closed' : strN(rule, 'enum.policy', strN(rule, 'enum_policy', 'open'));
        const enumSource = contractType === 'boolean' ? 'yes_no' : strN(rule, 'enum.source', strN(rule, 'enum_source'));
        const minRefs = numN(
          rule,
          'evidence.min_evidence_refs',
          numN(rule, 'min_evidence_refs', STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.fallback),
        );
        const componentType = strN(rule, 'component.type', strN(rule, 'component_type'));

        const guidanceParts: string[] = [];
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
        else if (diff === 'very_hard') guidanceParts.push('Lab-measured or multi-source synthesis - prefer independent tests.');
        if (minRefs >= 2) guidanceParts.push(`Requires ${minRefs}+ independent refs.`);
        if (rl === 'mandatory') guidanceParts.push('High-priority - blocked if unknown.');
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

      <AiAssistToggleSubsection
        selectedKey={fieldKey}
        currentRule={rule}
        updateField={(_key, path, value) => onUpdate(path, value)}
        BadgeRenderer={B}
        path="ai_assist.variant_inventory_usage"
        label="Variant Inventory Context"
        ariaLabel="Use variant inventory context"
        tooltipKey="variant_inventory_usage"
        disabled={disabled}
      />
      <AiAssistToggleSubsection
        selectedKey={fieldKey}
        currentRule={rule}
        updateField={(_key, path, value) => onUpdate(path, value)}
        BadgeRenderer={B}
        path="ai_assist.pif_priority_images"
        label="PIF Priority Images"
        ariaLabel="Use PIF priority images"
        tooltipKey="pif_priority_images"
        disabled={disabled}
      />

      <h4 className={SECTION_HEADING_CLASS}>Tooltip / Guidance</h4>
      <div>
        <div className={`${labelCls} flex items-center`}><span>Display Tooltip<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.tooltip_guidance} /></span><B p="ui.tooltip_md" /></div>
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
