import { JsonViewer } from '../../../shared/ui/data-display/JsonViewer.tsx';
import { Tip } from '../../../shared/ui/feedback/Tip.tsx';
import { EnumConfigurator } from '../components/EnumConfigurator.tsx';
import { useRuntimeSettingsValueStore } from '../../../stores/runtimeSettingsValueStore.ts';
import { TagPicker } from '../../../shared/ui/forms/TagPicker.tsx';
import { TierPicker } from '../../../shared/ui/forms/TierPicker.tsx';
import {
  parseBoundedIntInput,
} from '../state/numericInputHelpers.ts';
import {
  STUDIO_NUMERIC_KNOB_BOUNDS,
} from '../state/studioNumericKnobBounds.ts';
import {
  arrN,
  boolN,
  numN,
  strN,
} from './workbenchHelpers.ts';
import {
  CONTENT_TYPE_SUGGESTIONS,
  DOMAIN_HINT_SUGGESTIONS,
  inputCls,
  labelCls,
  selectCls,
  STUDIO_TIPS,
} from '../components/studioConstants.ts';
import type {
  ComponentDbResponse,
  EnumEntry,
} from '../../../types/studio.ts';
import type { ComponentType } from 'react';

export type BadgeSlot = ComponentType<{ p: string }>;

const TEXT_GRAY_400 = 'sf-text-subtle';
const TEXT_GRAY_500 = 'sf-text-subtle';
const SECTION_HEADING_CLASS = `text-xs font-semibold ${TEXT_GRAY_500} mt-4`;
const MUTED_ITALIC_TEXT_CLASS = `text-xs ${TEXT_GRAY_400} italic`;
const MUTED_TEXT_XS_CLASS = `text-xs ${TEXT_GRAY_400}`;

export function EnumTab({
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
  isEgLocked = false,
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
  isEgLocked?: boolean;
  B: BadgeSlot;
}) {
  const contractType = strN(rule, 'contract.type', 'string');
  const enumConsistencyMode = useRuntimeSettingsValueStore((s) => Boolean(s.values?.enumConsistencyMode));
  return (
    <EnumConfigurator
      persistTabKey={`studio:workbench:enumSourceTab:${category}:${fieldKey}`}
      fieldKey={fieldKey}
      rule={rule}
      knownValues={knownValues}
      enumLists={enumLists}
      contractType={contractType}
      onUpdate={onUpdate}
      onRunConsistency={onRunConsistency}
      consistencyPending={consistencyPending}
      consistencyMessage={consistencyMessage}
      consistencyError={consistencyError}
      isEgLocked={isEgLocked}
      enumConsistencyMode={enumConsistencyMode}
      renderLabelSuffix={(path) => <B p={path} />}
    />
  );
}

export function EvidenceTab({
  rule,
  onUpdate,
  B,
}: {
  rule: Record<string, unknown>;
  onUpdate: (path: string, val: unknown) => void;
  B: BadgeSlot;
}) {
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

      <h4 className={SECTION_HEADING_CLASS}>What would fail publish</h4>
      <div className="text-xs sf-bg-surface-soft sf-dk-surface-800a50 rounded p-2 border sf-border-default dark:sf-border-default space-y-1">
        {pubGate && (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full sf-dot-danger flex-shrink-0" />
            <span>Publish Gate is ON - value must be non-unknown to publish</span>
          </div>
        )}
        {blockUnk && (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full sf-dot-danger flex-shrink-0" />
            <span>Block when UNK - unknown token blocks publish</span>
          </div>
        )}
        {evReq && minRefs > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full sf-dot-warning flex-shrink-0" />
            <span>Evidence required - at least {minRefs} source ref{minRefs > 1 ? 's' : ''} needed</span>
          </div>
        )}
        {!pubGate && !blockUnk && !(evReq && minRefs > 0) && (
          <div className={`${TEXT_GRAY_400} italic`}>No publish-blocking rules configured</div>
        )}
      </div>
    </div>
  );
}

export function SearchTab({
  rule,
  onUpdate,
  B,
}: {
  rule: Record<string, unknown>;
  onUpdate: (path: string, val: unknown) => void;
  B: BadgeSlot;
}) {
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

export function PreviewTab({
  fieldKey,
  rule,
  knownValues,
  componentDb,
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

      <div>
        <div className={labelCls}>Known Values ({kv.length})</div>
        {kv.length > 0 ? (
          <div className="flex flex-wrap gap-1 mt-1 max-h-32 overflow-y-auto">
            {kv.slice(0, 80).map((value) => (
              <span key={value} className="px-1.5 py-0.5 text-[11px] rounded sf-chip-info-strong font-mono">
                {value}
              </span>
            ))}
            {kv.length > 80 && <span className={MUTED_TEXT_XS_CLASS}>+{kv.length - 80} more</span>}
          </div>
        ) : (
          <span className={MUTED_ITALIC_TEXT_CLASS}>No known values</span>
        )}
      </div>

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
                  {compEntities.slice(0, 40).map((entity, index) => (
                    <tr key={index} className="sf-border-top-subtle">
                      <td className="py-0.5 font-mono">{entity.name}</td>
                      <td className="py-0.5 sf-text-subtle">{entity.maker || '-'}</td>
                      <td className="py-0.5 sf-text-subtle text-[10px] truncate max-w-[120px]">
                        {entity.aliases?.length > 0 ? entity.aliases.join(', ') : '-'}
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

      <details>
        <summary className={`${MUTED_TEXT_XS_CLASS} cursor-pointer`}>Full Rule JSON</summary>
        <div className="mt-2"><JsonViewer data={rule} maxDepth={3} /></div>
      </details>
    </div>
  );
}
