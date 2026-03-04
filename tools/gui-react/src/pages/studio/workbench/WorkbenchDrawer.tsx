// ── WorkbenchDrawer: right-side detail panel with 7 tabs ─────────────
import { useEffect, useState } from 'react';
import { Tip } from '../../../components/common/Tip';
import { ComboSelect } from '../../../components/common/ComboSelect';
import { TagPicker } from '../../../components/common/TagPicker';
import { TierPicker } from '../../../components/common/TierPicker';
import { EnumConfigurator } from '../../../components/common/EnumConfigurator';
import { JsonViewer } from '../../../components/common/JsonViewer';
import { api } from '../../../api/client';
import { usePersistedTab } from '../../../stores/tabStore';
import { humanizeField } from '../../../utils/fieldNormalize';
import { strN, numN, boolN, arrN, extractConstraintVariables } from './workbenchHelpers';
import {
  selectCls, inputCls, labelCls,
  UNITS, UNKNOWN_TOKENS, COMPONENT_TYPES,
  DOMAIN_HINT_SUGGESTIONS, CONTENT_TYPE_SUGGESTIONS, UNIT_ACCEPTS_SUGGESTIONS,
  STUDIO_TIPS,
} from '../studioConstants';
import { useFieldRulesStore } from '../useFieldRulesStore';
import { SystemBadges } from './SystemBadges';
import {
  clampNumber,
  parseBoundedFloatInput,
  parseBoundedIntInput,
  parseOptionalPositiveIntInput,
} from '../numericInputHelpers';
import {
  STUDIO_COMPONENT_MATCH_DEFAULTS,
  STUDIO_NUMERIC_KNOB_BOUNDS,
} from '../studioNumericKnobBounds';
import type { DownstreamSystem } from './systemMapping';
import type { DrawerTab } from './workbenchTypes';
import type { EnumEntry, ComponentDbResponse, ComponentSource, ComponentSourceProperty } from '../../../types/studio';

interface Props {
  category: string;
  fieldKey: string;
  rule: Record<string, unknown>;
  fieldOrder: string[];
  knownValues: Record<string, string[]>;
  enumLists: EnumEntry[];
  componentDb: ComponentDbResponse;
  componentSources: ComponentSource[];
  onCommitImmediate: () => void;
  onClose: () => void;
  onNavigate: (key: string) => void;
}

const DRAWER_TABS: { id: DrawerTab; label: string }[] = [
  { id: 'contract', label: 'Contract' },
  { id: 'parse', label: 'Parse' },
  { id: 'enum', label: 'Enum' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'search', label: 'Search' },
  { id: 'deps', label: 'Deps' },
  { id: 'preview', label: 'Preview' },
];
const DRAWER_TAB_IDS = [
  'contract',
  'parse',
  'enum',
  'evidence',
  'search',
  'deps',
  'preview',
] as const satisfies ReadonlyArray<DrawerTab>;

const TEXT_GRAY_400 = 'sf-text-subtle';
const TEXT_GRAY_500 = 'sf-text-subtle';
const DRAWER_ICON_BUTTON_CLASS = `${TEXT_GRAY_400} hover:sf-text-muted disabled:opacity-30 text-sm`;
const DRAWER_CLOSE_BUTTON_CLASS = `${TEXT_GRAY_400} hover:sf-text-muted text-lg leading-none`;
const FIELD_KEY_BADGE_CLASS = `text-[10px] ${TEXT_GRAY_400} font-mono`;
const DRAWER_TAB_IDLE_CLASS = `border-transparent ${TEXT_GRAY_500} hover:sf-text-muted`;
const SECTION_HEADING_CLASS = `text-xs font-semibold ${TEXT_GRAY_500} mt-4`;
const MUTED_ITALIC_TEXT_CLASS = `text-xs ${TEXT_GRAY_400} italic`;
const MUTED_LABEL_W12_CLASS = `${TEXT_GRAY_400} w-12`;
const EFFECTIVE_CONFIG_LABEL_CLASS = `text-[10px] font-semibold ${TEXT_GRAY_400} mb-1`;
const PREVIEW_LABEL_CLASS = `text-[10px] ${TEXT_GRAY_400} mb-1 font-medium`;
const MUTED_ITALIC_T10_CLASS = `${TEXT_GRAY_400} italic text-[10px]`;
const MUTED_TEXT_9_CLASS = `text-[9px] ${TEXT_GRAY_400}`;
const MUTED_TEXT_XS_CLASS = `text-xs ${TEXT_GRAY_400}`;
const SUBHEADING_GRAY_CLASS = `text-[11px] font-medium ${TEXT_GRAY_400} mb-1`;
const DRAWER_SHELL_CLASS = 'border-l sf-border-default sf-surface-shell overflow-y-auto';
const DRAWER_HEADER_CLASS = 'sticky top-0 z-10 sf-surface-shell border-b sf-border-default px-4 py-3';
const INFO_SURFACE_CLASS = 'sf-surface-card rounded p-2 border sf-border-default';
const NEUTRAL_INLINE_BADGE_CLASS = 'text-[9px] px-1 py-0.5 rounded sf-chip-neutral italic font-medium';
const SOFT_INFO_LINK_CLASS = 'text-[10px] text-accent hover:opacity-80 mt-0.5';

export function WorkbenchDrawer({
  category,
  fieldKey,
  rule,
  fieldOrder,
  knownValues,
  enumLists,
  componentDb,
  componentSources,
  onCommitImmediate,
  onClose,
  onNavigate,
}: Props) {
  const [activeTab, setActiveTab] = usePersistedTab<DrawerTab>(
    'studio:workbench:drawerTab',
    'contract',
    { validValues: DRAWER_TAB_IDS },
  );
  const [consistencyPending, setConsistencyPending] = useState(false);
  const [consistencyMessage, setConsistencyMessage] = useState('');
  const [consistencyError, setConsistencyError] = useState('');
  const { updateField } = useFieldRulesStore();

  const update = (path: string, value: unknown) => updateField(fieldKey, path, value);

  useEffect(() => {
    setConsistencyMessage('');
    setConsistencyError('');
  }, [fieldKey]);

  async function runEnumConsistency(options?: { formatGuidance?: string; reviewEnabled?: boolean }) {
    if (consistencyPending) return;
    setConsistencyPending(true);
    setConsistencyMessage('');
    setConsistencyError('');
    try {
      const response = await api.post(`/studio/${category}/enum-consistency`, {
        field: fieldKey,
        apply: options?.reviewEnabled !== false,
        formatGuidance: options?.formatGuidance,
        reviewEnabled: options?.reviewEnabled,
      }) as {
        ok?: boolean;
        applied?: { changed?: number };
        skipped_reason?: string | null;
        error?: string;
      };
      if (response?.ok === false) {
        throw new Error(response?.error || 'Consistency run failed.');
      }
      const changed = Number(response?.applied?.changed || 0);
      if (changed > 0) {
        setConsistencyMessage(`Consistency applied ${changed} change${changed === 1 ? '' : 's'}.`);
      } else if (response?.skipped_reason) {
        setConsistencyMessage(`Consistency skipped: ${String(response.skipped_reason).replace(/_/g, ' ')}.`);
      } else {
        setConsistencyMessage('Consistency finished with no changes.');
      }
    } catch (error) {
      setConsistencyError(error instanceof Error ? error.message : 'Consistency run failed.');
    } finally {
      setConsistencyPending(false);
    }
  }

  const handleConsumerToggle = (fieldPath: string, system: DownstreamSystem, enabled: boolean) => {
    const currentConsumers = (rule.consumers || {}) as Record<string, Record<string, boolean>>;
    const fieldOverrides = { ...(currentConsumers[fieldPath] || {}) };
    if (enabled) {
      delete fieldOverrides[system];
    } else {
      fieldOverrides[system] = false;
    }
    const nextConsumers = { ...currentConsumers };
    if (Object.keys(fieldOverrides).length === 0) {
      delete nextConsumers[fieldPath];
    } else {
      nextConsumers[fieldPath] = fieldOverrides;
    }
    update('consumers', Object.keys(nextConsumers).length > 0 ? nextConsumers : undefined);
    onCommitImmediate();
  };

  const B = ({ p }: { p: string }) => (
    <SystemBadges fieldPath={p} rule={rule} onToggle={handleConsumerToggle} />
  );

  // Navigation
  const idx = fieldOrder.indexOf(fieldKey);
  const prevKey = idx > 0 ? fieldOrder[idx - 1] : null;
  const nextKey = idx < fieldOrder.length - 1 ? fieldOrder[idx + 1] : null;

  // Required level badge
  const reqLevel = strN(rule, 'priority.required_level', strN(rule, 'required_level', 'expected'));
  const reqColors: Record<string, string> = {
    identity: 'sf-llm-soft-badge',
    required: 'sf-chip-danger',
    critical: 'sf-chip-danger',
    expected: 'sf-chip-info',
    optional: 'sf-chip-neutral',
  };

  return (
    <div className={DRAWER_SHELL_CLASS} style={{ maxHeight: 'calc(100vh - 340px)' }}>
      {/* Header */}
      <div className={DRAWER_HEADER_CLASS}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <button
              onClick={() => prevKey && onNavigate(prevKey)}
              disabled={!prevKey}
              className={DRAWER_ICON_BUTTON_CLASS}
              title="Previous field"
            >
              &#9664;
            </button>
            <button
              onClick={() => nextKey && onNavigate(nextKey)}
              disabled={!nextKey}
              className={DRAWER_ICON_BUTTON_CLASS}
              title="Next field"
            >
              &#9654;
            </button>
          </div>
          <button
            onClick={onClose}
            className={DRAWER_CLOSE_BUTTON_CLASS}
            title="Close"
          >
            &#10005;
          </button>
        </div>
        <div>
          <h3 className="text-sm font-semibold">{humanizeField(fieldKey)}</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={FIELD_KEY_BADGE_CLASS}>{fieldKey}</span>
            <span className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${reqColors[reqLevel] || reqColors.optional}`}>
              {reqLevel}
            </span>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-0.5 mt-3 -mb-px">
          {DRAWER_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-2 py-1 text-[11px] font-medium rounded-t border-b-2 ${
                activeTab === tab.id
                  ? 'border-accent text-accent'
                  : DRAWER_TAB_IDLE_CLASS
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="p-4 space-y-3">
        {activeTab === 'contract' && (
          <ContractTab fieldKey={fieldKey} rule={rule} onUpdate={update} B={B} />
        )}
        {activeTab === 'parse' && (
          <ParseTab rule={rule} onUpdate={update} B={B} />
        )}
        {activeTab === 'enum' && (
          <EnumTab
            category={category}
            fieldKey={fieldKey}
            rule={rule}
            knownValues={knownValues}
            enumLists={enumLists}
            onUpdate={update}
            onRunConsistency={runEnumConsistency}
            consistencyPending={consistencyPending}
            consistencyMessage={consistencyMessage}
            consistencyError={consistencyError}
            B={B}
          />
        )}
        {activeTab === 'evidence' && (
          <EvidenceTab rule={rule} onUpdate={update} B={B} />
        )}
        {activeTab === 'search' && (
          <SearchTab rule={rule} onUpdate={update} B={B} />
        )}
        {activeTab === 'deps' && (
          <DepsTab rule={rule} fieldKey={fieldKey} onUpdate={update} componentSources={componentSources} knownValues={knownValues} onNavigate={onNavigate} B={B} />
        )}
        {activeTab === 'preview' && (
          <PreviewTab
            fieldKey={fieldKey}
            rule={rule}
            knownValues={knownValues}
            componentDb={componentDb}
            enumLists={enumLists}
          />
        )}
      </div>
    </div>
  );
}

type BadgeSlot = React.ComponentType<{ p: string }>;

// ── Contract Tab ─────────────────────────────────────────────────────
function ContractTab({ fieldKey, rule, onUpdate, B }: { fieldKey: string; rule: Record<string, unknown>; onUpdate: (path: string, val: unknown) => void; B: BadgeSlot }) {
  const tooltipMd = strN(rule, 'ui.tooltip_md');
  const contractDeferredLocked = true;

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
          <ComboSelect value={strN(rule, 'contract.unit')} onChange={(v) => onUpdate('contract.unit', v || null)} options={UNITS} placeholder="e.g. g, mm" />
        </div>
        <div>
          <div className={`${labelCls} flex items-center`}><span>Unknown Token<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.unknown_token} /></span><B p="contract.unknown_token" /></div>
          <ComboSelect value={strN(rule, 'contract.unknown_token', 'unk')} onChange={(v) => onUpdate('contract.unknown_token', v)} options={UNKNOWN_TOKENS} placeholder="unk" disabled={contractDeferredLocked} />
        </div>
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
          <select className={`${selectCls} w-full`} value={strN(rule, 'contract.rounding.mode', 'nearest')} onChange={(e) => onUpdate('contract.rounding.mode', e.target.value)} disabled={contractDeferredLocked}>
            <option value="nearest">nearest</option>
            <option value="floor">floor</option>
            <option value="ceil">ceil</option>
          </select>
        </div>
      </div>
      <div className="text-xs sf-status-text-danger">Deferred: runtime wiring in progress</div>

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
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={boolN(rule, 'priority.publish_gate', boolN(rule, 'publish_gate'))} onChange={(e) => onUpdate('priority.publish_gate', e.target.checked)} className="rounded sf-border-soft" />
          Publish Gate<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.publish_gate} />
          <B p="priority.publish_gate" />
        </label>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={boolN(rule, 'priority.block_publish_when_unk', boolN(rule, 'block_publish_when_unk'))} onChange={(e) => onUpdate('priority.block_publish_when_unk', e.target.checked)} className="rounded sf-border-soft" />
          Block when unk<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.block_publish_when_unk} />
          <B p="priority.block_publish_when_unk" />
        </label>
      </div>

      {/* AI Assist */}
      <h4 className={SECTION_HEADING_CLASS}>AI Assist</h4>
      {(() => {
        const explicitMode = strN(rule, 'ai_assist.mode');
        const strategy = strN(rule, 'ai_assist.model_strategy', 'auto');
        const explicitCalls = numN(rule, 'ai_assist.max_calls', 0);
        const rl = strN(rule, 'priority.required_level', strN(rule, 'required_level', 'expected'));
        const diff = strN(rule, 'priority.difficulty', strN(rule, 'difficulty', 'easy'));
        const effort = numN(rule, 'priority.effort', numN(rule, 'effort', 3));

        let derivedMode = 'off';
        if (['identity', 'required', 'critical'].includes(rl)) derivedMode = 'judge';
        else if (rl === 'expected' && diff === 'hard') derivedMode = 'planner';
        else if (rl === 'expected') derivedMode = 'advisory';
        const effectiveMode = explicitMode || derivedMode;

        const derivedCalls = effort <= 3 ? 1 : effort <= 6 ? 2 : 3;
        const effectiveCalls = explicitCalls > 0 ? Math.min(explicitCalls, 10) : derivedCalls;

        const modeToModel: Record<string, { model: string; reasoning: boolean }> = {
          off: { model: 'none', reasoning: false },
          advisory: { model: 'gpt-5-low', reasoning: false },
          planner: { model: 'gpt-5-low \u2192 gpt-5.2-high', reasoning: false },
          judge: { model: 'gpt-5.2-high', reasoning: true },
        };
        let effectiveModel = modeToModel[effectiveMode] || modeToModel.off;
        if (strategy === 'force_fast') effectiveModel = { model: 'gpt-5-low (forced)', reasoning: false };
        else if (strategy === 'force_deep') effectiveModel = { model: 'gpt-5.2-high (forced)', reasoning: true };

        return (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className={`${labelCls} flex items-center`}><span>Mode<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.ai_mode} /></span><B p="ai_assist.mode" /></div>
                <select className={`${selectCls} w-full`} value={explicitMode} onChange={(e) => onUpdate('ai_assist.mode', e.target.value || null)}>
                  <option value="">auto ({derivedMode})</option>
                  <option value="off">off — no LLM</option>
                  <option value="advisory">advisory — gpt-5-low</option>
                  <option value="planner">planner — 5-low→5.2-high</option>
                  <option value="judge">judge — gpt-5.2-high</option>
                </select>
              </div>
              <div>
                <div className={`${labelCls} flex items-center`}><span>Model Strategy<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.ai_model_strategy} /></span><B p="ai_assist.model_strategy" /></div>
                <select className={`${selectCls} w-full`} value={strategy} onChange={(e) => onUpdate('ai_assist.model_strategy', e.target.value)}>
                  <option value="auto">auto — mode decides</option>
                  <option value="force_fast">force_fast — gpt-5-low</option>
                  <option value="force_deep">force_deep — gpt-5.2-high</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className={`${labelCls} flex items-center`}><span>Max Calls<Tip text={STUDIO_TIPS.ai_max_calls} style={{ position: 'relative', left: '-3px', top: '-4px' }} /></span><B p="ai_assist.max_calls" /></div>
                <input
                  className={`${inputCls} w-full`}
                  type="number"
                  min={STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxCalls.min}
                  max={STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxCalls.max}
                  value={explicitCalls || ''}
                  onChange={(e) => {
                    const parsed = parseOptionalPositiveIntInput(e.target.value);
                    onUpdate(
                      'ai_assist.max_calls',
                      parsed === null
                        ? null
                        : clampNumber(parsed, STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxCalls.min, STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxCalls.max),
                    );
                  }}
                  placeholder={`auto (${derivedCalls})`}
                />
              </div>
              <div>
                <div className={`${labelCls} flex items-center`}><span>Max Tokens<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.ai_max_tokens} /></span><B p="ai_assist.max_tokens" /></div>
                <input
                  className={`${inputCls} w-full`}
                  type="number"
                  min={STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxTokens.min}
                  max={STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxTokens.max}
                  step={1024}
                  value={numN(rule, 'ai_assist.max_tokens', 0) || ''}
                  onChange={(e) => {
                    const parsed = parseOptionalPositiveIntInput(e.target.value);
                    onUpdate(
                      'ai_assist.max_tokens',
                      parsed === null
                        ? null
                        : clampNumber(parsed, STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxTokens.min, STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxTokens.max),
                    );
                  }}
                  placeholder={`auto (${effectiveMode === 'off' ? '0' : effectiveMode === 'advisory' ? '4096' : effectiveMode === 'planner' ? '8192' : '16384'})`}
                />
              </div>
            </div>

            {/* Effective resolution summary */}
            <div className={`text-[11px] ${INFO_SURFACE_CLASS} space-y-1`}>
              <div className={EFFECTIVE_CONFIG_LABEL_CLASS}>Effective Config</div>
              <div className="flex items-center gap-1.5">
                <span className={MUTED_LABEL_W12_CLASS}>Mode:</span>
                <span className={`px-1 py-0.5 rounded text-[10px] font-medium ${
                  effectiveMode === 'judge' ? 'sf-llm-soft-badge'
                  : effectiveMode === 'planner' ? 'sf-chip-info'
                  : effectiveMode === 'advisory' ? 'sf-chip-success'
                  : 'sf-chip-neutral'
                }`}>{effectiveMode}</span>
                {!explicitMode && <span className={MUTED_ITALIC_T10_CLASS}>({rl}{diff !== 'easy' ? `+${diff}` : ''})</span>}
              </div>
              <div className="flex items-center gap-1.5">
                <span className={MUTED_LABEL_W12_CLASS}>Model:</span>
                <span className="sf-text-muted font-mono text-[10px]">{effectiveModel.model}</span>
                {effectiveModel.reasoning && <span className="text-[9px] px-1 rounded sf-chip-warning font-medium">REASONING</span>}
              </div>
              <div className="flex items-center gap-1.5">
                <span className={MUTED_LABEL_W12_CLASS}>Budget:</span>
                <span className="sf-text-muted">{effectiveMode === 'off' ? '0' : effectiveCalls} call{effectiveCalls !== 1 ? 's' : ''}</span>
                {!explicitCalls && effectiveMode !== 'off' && <span className={MUTED_ITALIC_T10_CLASS}>(effort {effort})</span>}
              </div>
            </div>

            {(() => {
              const explicitNote = strN(rule, 'ai_assist.reasoning_note');
              const type = strN(rule, 'contract.data_type', strN(rule, 'data_type', 'string'));
              const shape = strN(rule, 'contract.shape', strN(rule, 'shape', 'scalar'));
              const unit = strN(rule, 'contract.unit', strN(rule, 'unit'));
              const enumPolicy = strN(rule, 'enum.policy', strN(rule, 'enum_policy', 'open'));
              const enumSource = strN(rule, 'enum.source', strN(rule, 'enum_source'));
              const evidenceReq = boolN(rule, 'evidence.evidence_required', boolN(rule, 'evidence_required'));
              const minRefs = numN(
                rule,
                'evidence.min_evidence_refs',
                numN(rule, 'min_evidence_refs', STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.fallback),
              );
              const parseTemplate = strN(rule, 'parse.template', strN(rule, 'parse_template'));
              const componentType = strN(rule, 'component.type', strN(rule, 'component_type'));

              const gp: string[] = [];
              if (rl === 'identity') gp.push('Identity field \u2014 must exactly match the product.');
              if (componentType || parseTemplate === 'component_reference') {
                const ct = componentType || enumSource.replace('component_db.', '');
                gp.push(`Component ref (${ct}). Match to known names/aliases.`);
              }
              if (type === 'boolean' || parseTemplate?.startsWith('boolean_')) {
                gp.push('Boolean \u2014 determine yes or no from explicit evidence.');
              } else if ((type === 'number' || type === 'integer') && unit) {
                gp.push(`Numeric \u2014 extract exact value in ${unit}.`);
              } else if (type === 'url') {
                gp.push('URL \u2014 extract full, valid URL.');
              } else if (type === 'date' || fieldKey.includes('date')) {
                gp.push('Date \u2014 extract actual date from official sources.');
              } else if (type === 'string' && !componentType && !parseTemplate?.startsWith('boolean_')) {
                gp.push('Text \u2014 extract exact value as stated.');
              }
              if (shape === 'list') gp.push('Multiple values \u2014 extract all distinct.');
              if (enumPolicy === 'closed' && enumSource) gp.push(`Closed enum \u2014 must match ${enumSource}.`);
              if (diff === 'hard') gp.push('Often inconsistent \u2014 prefer manufacturer spec sheets.');
              else if (diff === 'instrumented') gp.push('Lab-measured \u2014 only from independent tests.');
              if (evidenceReq && minRefs >= 2) gp.push(`Requires ${minRefs}+ independent refs.`);
              if (rl === 'required' || rl === 'critical') gp.push('High-priority \u2014 blocked if unknown.');
              if (gp.length === 0) gp.push('Extract from most authoritative source.');
              const autoNote = gp.join(' ');
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
          </>
        );
      })()}

      {/* Tooltip / description preview */}
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

// ── Parse Tab ────────────────────────────────────────────────────────
function ParseTab({ rule, onUpdate, B }: { rule: Record<string, unknown>; onUpdate: (path: string, val: unknown) => void; B: BadgeSlot }) {
  const pt = strN(rule, 'parse.template', strN(rule, 'parse_template'));
  const showUnits = ['number_with_unit', 'list_of_numbers_with_unit', 'list_numbers_or_ranges_with_unit'].includes(pt);

  return (
    <div className="space-y-3">
      <div>
        <div className={`${labelCls} flex items-center`}><span>Parse Template<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.parse_template} /></span><B p="parse.template" /></div>
        <select className={`${selectCls} w-full`} value={pt} onChange={(e) => onUpdate('parse.template', e.target.value)}>
          <option value="">none</option>
          <option value="text_field">text_field</option>
          <option value="number_with_unit">number_with_unit</option>
          <option value="boolean_yes_no_unk">boolean_yes_no_unk</option>
          <option value="component_reference">component_reference</option>
          <option value="date_field">date_field</option>
          <option value="url_field">url_field</option>
          <option value="list_of_numbers_with_unit">list_of_numbers_with_unit</option>
          <option value="list_numbers_or_ranges_with_unit">list_numbers_or_ranges_with_unit</option>
          <option value="list_of_tokens_delimited">list_of_tokens_delimited</option>
          <option value="token_list">token_list</option>
          <option value="text_block">text_block</option>
        </select>
      </div>

      {/* Output type derived from template */}
      {pt && (
        <div className="flex items-center gap-2">
          <span className={PREVIEW_LABEL_CLASS}>Output type:</span>
          <span className="px-1.5 py-0.5 text-[10px] rounded sf-chip-neutral font-mono">
            {pt === 'boolean_yes_no_unk' ? 'boolean'
              : pt === 'number_with_unit' || pt === 'list_of_numbers_with_unit' || pt === 'list_numbers_or_ranges_with_unit' ? 'number'
              : pt === 'url_field' ? 'url'
              : pt === 'date_field' ? 'date'
              : pt === 'list_of_tokens_delimited' || pt === 'token_list' ? 'list'
              : pt === 'component_reference' ? 'component_ref'
              : 'string'}
          </span>
        </div>
      )}

      {showUnits && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className={`${labelCls} flex items-center`}><span>Parse Unit<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.parse_unit} /></span><B p="parse.unit" /></div>
              <ComboSelect value={strN(rule, 'parse.unit')} onChange={(v) => onUpdate('parse.unit', v)} options={UNITS} placeholder="e.g. g" />
            </div>
            <div>
              <div className={`${labelCls} flex items-center`}><span>Unit Accepts<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.unit_accepts} /></span><B p="parse.unit_accepts" /></div>
              <TagPicker values={arrN(rule, 'parse.unit_accepts')} onChange={(v) => onUpdate('parse.unit_accepts', v)} suggestions={UNIT_ACCEPTS_SUGGESTIONS} placeholder="g, grams..." />
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={boolN(rule, 'parse.allow_unitless')} onChange={(e) => onUpdate('parse.allow_unitless', e.target.checked)} className="rounded sf-border-soft" />
              Allow unitless<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.allow_unitless} />
              <B p="parse.allow_unitless" />
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={boolN(rule, 'parse.allow_ranges')} onChange={(e) => onUpdate('parse.allow_ranges', e.target.checked)} className="rounded sf-border-soft" />
              Allow ranges<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.allow_ranges} />
              <B p="parse.allow_ranges" />
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={boolN(rule, 'parse.strict_unit_required')} onChange={(e) => onUpdate('parse.strict_unit_required', e.target.checked)} className="rounded sf-border-soft" />
              Strict unit<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.strict_unit_required} />
              <B p="parse.strict_unit_required" />
            </label>
          </div>
        </>
      )}
      {!showUnits && pt && (
        <div className={MUTED_ITALIC_TEXT_CLASS}>
          Unit settings hidden &mdash; {pt.replace(/_/g, ' ')} template does not use units.
        </div>
      )}
    </div>
  );
}

// ── Enum Tab ─────────────────────────────────────────────────────────
function EnumTab({
  category,
  fieldKey,
  rule,
  knownValues,
  enumLists,
  onUpdate,
  onRunConsistency,
  consistencyPending,
  consistencyMessage,
  consistencyError,
  B,
}: {
  category: string;
  fieldKey: string;
  rule: Record<string, unknown>;
  knownValues: Record<string, string[]>;
  enumLists: EnumEntry[];
  onUpdate: (path: string, val: unknown) => void;
  onRunConsistency: (options?: { formatGuidance?: string; reviewEnabled?: boolean }) => Promise<void>;
  consistencyPending: boolean;
  consistencyMessage: string;
  consistencyError: string;
  B: BadgeSlot;
}) {
  const parseTemplate = strN(rule, 'parse.template', strN(rule, 'parse_template'));
  return (
    <EnumConfigurator
      persistTabKey={`studio:workbench:enumSourceTab:${category}:${fieldKey}`}
      fieldKey={fieldKey}
      rule={rule}
      knownValues={knownValues}
      enumLists={enumLists}
      parseTemplate={parseTemplate}
      onUpdate={onUpdate}
      onRunConsistency={onRunConsistency}
      consistencyPending={consistencyPending}
      consistencyMessage={consistencyMessage}
      consistencyError={consistencyError}
      renderLabelSuffix={(path) => <B p={path} />}
    />
  );
}

// ── Evidence Tab ─────────────────────────────────────────────────────
function EvidenceTab({ rule, onUpdate, B }: { rule: Record<string, unknown>; onUpdate: (path: string, val: unknown) => void; B: BadgeSlot }) {
  const pubGate = boolN(rule, 'priority.publish_gate', boolN(rule, 'publish_gate'));
  const blockUnk = boolN(rule, 'priority.block_publish_when_unk', boolN(rule, 'block_publish_when_unk'));
  const evReq = boolN(rule, 'evidence.required', boolN(rule, 'evidence_required', true));
  const minRefs = numN(
    rule,
    'evidence.min_evidence_refs',
    numN(rule, 'min_evidence_refs', STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.fallback),
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={evReq} onChange={(e) => onUpdate('evidence.required', e.target.checked)} className="rounded sf-border-soft" />
          Evidence Required<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.evidence_required} />
          <B p="evidence.required" />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className={`${labelCls} flex items-center`}><span>Min Evidence Refs<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.min_evidence_refs} /></span><B p="evidence.min_evidence_refs" /></div>
          <input
            className={`${inputCls} w-full`}
            type="number"
            min={STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.min}
            max={STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.max}
            value={minRefs}
            onChange={(e) => onUpdate(
              'evidence.min_evidence_refs',
              parseBoundedIntInput(
                e.target.value,
                STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.min,
                STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.max,
                STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.fallback,
              ),
            )}
          />
        </div>
        <div>
          <div className={`${labelCls} flex items-center`}><span>Conflict Policy<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.conflict_policy} /></span><B p="evidence.conflict_policy" /></div>
          <select className={`${selectCls} w-full`} value={strN(rule, 'evidence.conflict_policy', 'resolve_by_tier_else_unknown')} onChange={(e) => onUpdate('evidence.conflict_policy', e.target.value)}>
            <option value="resolve_by_tier_else_unknown">resolve_by_tier_else_unknown</option>
            <option value="prefer_highest_tier">prefer_highest_tier</option>
            <option value="prefer_most_recent">prefer_most_recent</option>
            <option value="flag_for_review">flag_for_review</option>
          </select>
        </div>
      </div>
      <div>
        <div className={`${labelCls} flex items-center`}><span>Tier Preference<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.tier_preference} /></span><B p="evidence.tier_preference" /></div>
        <TierPicker
          value={arrN(rule, 'evidence.tier_preference').length > 0 ? arrN(rule, 'evidence.tier_preference') : ['tier1', 'tier2', 'tier3']}
          onChange={(v) => onUpdate('evidence.tier_preference', v)}
        />
      </div>

      {/* Publish failure summary */}
      <h4 className={SECTION_HEADING_CLASS}>What would fail publish</h4>
      <div className="text-xs sf-bg-surface-soft sf-dk-surface-800a50 rounded p-2 border sf-border-default dark:sf-border-default space-y-1">
        {pubGate && (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full sf-dot-danger flex-shrink-0" />
            <span>Publish Gate is ON &mdash; value must be non-unknown to publish</span>
          </div>
        )}
        {blockUnk && (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full sf-dot-danger flex-shrink-0" />
            <span>Block when UNK &mdash; unknown token blocks publish</span>
          </div>
        )}
        {evReq && minRefs > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full sf-dot-warning flex-shrink-0" />
            <span>Evidence required &mdash; at least {minRefs} source ref{minRefs > 1 ? 's' : ''} needed</span>
          </div>
        )}
        {!pubGate && !blockUnk && !(evReq && minRefs > 0) && (
          <div className={`${TEXT_GRAY_400} italic`}>No publish-blocking rules configured</div>
        )}
      </div>
    </div>
  );
}

// ── Search Tab ───────────────────────────────────────────────────────
function SearchTab({ rule, onUpdate, B }: { rule: Record<string, unknown>; onUpdate: (path: string, val: unknown) => void; B: BadgeSlot }) {
  return (
    <div className="space-y-3">
      <div>
        <div className={`${labelCls} flex items-center`}><span>Domain Hints<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.domain_hints} /></span><B p="search_hints.domain_hints" /></div>
        <TagPicker values={arrN(rule, 'search_hints.domain_hints')} onChange={(v) => onUpdate('search_hints.domain_hints', v)} suggestions={DOMAIN_HINT_SUGGESTIONS} placeholder="manufacturer, rtings.com..." />
      </div>
      <div>
        <div className={`${labelCls} flex items-center`}><span>Content Types<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.content_types} /></span><B p="search_hints.preferred_content_types" /></div>
        <TagPicker values={arrN(rule, 'search_hints.preferred_content_types')} onChange={(v) => onUpdate('search_hints.preferred_content_types', v)} suggestions={CONTENT_TYPE_SUGGESTIONS} placeholder="spec_sheet, datasheet..." />
      </div>
      <div>
        <div className={`${labelCls} flex items-center`}><span>Query Terms<Tip style={{ position: 'relative', left: '-3px', top: '-4px' }} text={STUDIO_TIPS.query_terms} /></span><B p="search_hints.query_terms" /></div>
        <TagPicker values={arrN(rule, 'search_hints.query_terms')} onChange={(v) => onUpdate('search_hints.query_terms', v)} placeholder="alternative search terms" />
      </div>
    </div>
  );
}

// ── Deps (Component) Tab ─────────────────────────────────────────────
function DepsTab({
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
  const { editedRules } = useFieldRulesStore();
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
          {/* ── Match Settings ─────────────────────── */}
          <details className="border sf-border-default dark:sf-border-default rounded">
            <summary className="px-2 py-1 text-xs font-semibold cursor-pointer sf-bg-surface-soft sf-dk-surface-700a50">Match Settings</summary>
            <div className="p-2 space-y-2">
              {/* Name Matching */}
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
              {/* Property Matching */}
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
                      s => (s.component_type || s.type) === compType
                    );
                    const derivedProps = (compSource?.roles?.properties || []).filter(p => p.field_key);
                    const NUMERIC_ONLY_VP = ['upper_bound', 'lower_bound', 'range'];
                    return (
                      <div className="space-y-1">
                        {derivedProps.map(p => {
                          const raw = p.variance_policy || 'authoritative';
                          const fieldRule = editedRules[p.field_key || ''] as Record<string, unknown> | undefined;
                          const enumSrc = fieldRule ? strN(fieldRule, 'enum.source') : '';
                          const contractType = fieldRule ? strN(fieldRule, 'contract.type') : '';
                          const parseTemplate = fieldRule ? strN(fieldRule, 'parse.template') : '';
                          const isBool = contractType === 'boolean';
                          const hasEnum = !!enumSrc;
                          const isComponentDb = hasEnum && enumSrc.startsWith('component_db');
                          const isExtEnum = hasEnum && !isComponentDb;
                          const isLocked = contractType !== 'number' || isBool || hasEnum;
                          const vp = isLocked && NUMERIC_ONLY_VP.includes(raw) ? 'authoritative' : raw;
                          const fieldValues = knownValues[p.field_key || ''] || [];
                          const lockReason = isBool
                            ? 'Boolean field — locked to authoritative'
                            : isComponentDb
                              ? `enum.db (${enumSrc.replace(/^component_db\./, '')}) — locked to authoritative`
                              : isExtEnum
                                ? `Enum (${enumSrc.replace(/^(known_values|data_lists)\./, '')}) — locked to authoritative`
                                : contractType !== 'number' && fieldValues.length > 0
                                  ? `Manual values (${fieldValues.length}) — locked to authoritative`
                                  : isLocked
                                    ? 'String property — locked to authoritative'
                                    : '';
                          return (
                            <div key={p.field_key} className="flex items-start gap-1.5 px-1.5 py-0.5 rounded border sf-progress-active-shell text-[11px]">
                              <span className="font-medium sf-status-text-info shrink-0">{p.field_key}</span>
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
                                  {fieldValues.map(v => <span key={v} className="text-[9px] px-1 rounded sf-bg-surface-soft-strong sf-text-subtle sf-dk-surface-700 dark:sf-text-subtle">{v}</span>)}
                                </div>
                              ) : null}
                              {!isBool && !hasEnum && isLocked && fieldValues.length > 6 ? (
                                <span className={MUTED_TEXT_9_CLASS} title={fieldValues.join(', ')}>manual: {fieldValues.length} values</span>
                              ) : null}
                            </div>
                          );
                        })}
                        {derivedProps.length === 0 ? (
                          <span className={MUTED_ITALIC_TEXT_CLASS}>No properties mapped — add in Mapping Studio</span>
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

// ── Preview Tab ──────────────────────────────────────────────────────
function PreviewTab({
  fieldKey,
  rule,
  knownValues,
  componentDb,
  enumLists,
}: {
  fieldKey: string;
  rule: Record<string, unknown>;
  knownValues: Record<string, string[]>;
  componentDb: ComponentDbResponse;
  enumLists: EnumEntry[];
}) {
  const kv = knownValues[fieldKey] || [];
  const compType = strN(rule, 'component.type');
  const compEntities = compType && componentDb[compType] ? componentDb[compType] : [];
  const enumSource = strN(rule, 'enum.source', strN(rule, 'enum_source'));

  return (
    <div className="space-y-3">
      {/* Source summary */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className={`${TEXT_GRAY_400} font-medium`}>Source:</span>
        {enumSource ? (
          <span className="px-1.5 py-0.5 rounded sf-bg-surface-soft-strong sf-dk-surface-700 sf-text-muted dark:sf-text-muted font-mono">
            {enumSource}
          </span>
        ) : (
          <span className={`${TEXT_GRAY_400} italic`}>none</span>
        )}
      </div>

      {/* Known values */}
      <div>
        <div className={labelCls}>Known Values ({kv.length})</div>
        {kv.length > 0 ? (
          <div className="flex flex-wrap gap-1 mt-1 max-h-32 overflow-y-auto">
            {kv.slice(0, 80).map((v) => (
              <span key={v} className="px-1.5 py-0.5 text-[11px] rounded sf-chip-info-strong font-mono">
                {v}
              </span>
            ))}
            {kv.length > 80 && <span className={MUTED_TEXT_XS_CLASS}>+{kv.length - 80} more</span>}
          </div>
        ) : (
          <span className={MUTED_ITALIC_TEXT_CLASS}>No known values</span>
        )}
      </div>

      {/* Component DB entities */}
      {compType && (
        <div>
          <div className={labelCls}>Component DB: {compType} ({compEntities.length})</div>
          {compEntities.length > 0 ? (
            <div className="max-h-48 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="sf-text-subtle">
                    <th className="text-left py-0.5">Name</th>
                    <th className="text-left py-0.5">Maker</th>
                    <th className="text-left py-0.5">Aliases</th>
                  </tr>
                </thead>
                <tbody>
                  {compEntities.slice(0, 40).map((e, i) => (
                    <tr key={i} className="sf-border-top-subtle">
                      <td className="py-0.5 font-mono">{e.name}</td>
                      <td className="py-0.5 sf-text-subtle">{e.maker || '\u2014'}</td>
                      <td className="py-0.5 sf-text-subtle text-[10px] truncate max-w-[120px]">
                        {e.aliases?.length > 0 ? e.aliases.join(', ') : '\u2014'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {compEntities.length > 40 && <span className={MUTED_TEXT_XS_CLASS}>+{compEntities.length - 40} more</span>}
            </div>
          ) : (
            <span className={MUTED_ITALIC_TEXT_CLASS}>No entities</span>
          )}
        </div>
      )}

      {/* Raw rule JSON */}
      <details>
        <summary className={`${MUTED_TEXT_XS_CLASS} cursor-pointer`}>Full Rule JSON</summary>
        <div className="mt-2"><JsonViewer data={rule} maxDepth={3} /></div>
      </details>
    </div>
  );
}
