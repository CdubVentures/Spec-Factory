// ── Bulk edit floating bar for selected rows ─────────────────────────
import { useState } from 'react';
import { parseBoundedIntInput } from '../state/numericInputHelpers.ts';
import { STUDIO_NUMERIC_KNOB_BOUNDS } from '../state/studioNumericKnobBounds.ts';

interface Props {
  selectedCount: number;
  onApply: (field: string, value: unknown) => void;
  onClear: () => void;
}

import { REQUIRED_LEVEL_OPTIONS as REQUIRED_OPTIONS, ENUM_POLICY_OPTIONS as POLICY_OPTIONS } from '../../../registries/fieldRuleTaxonomy.ts';

export function WorkbenchBulkBar({ selectedCount, onApply, onClear }: Props) {
  const [bulkRequired, setBulkRequired] = useState('');
  const [bulkPolicy, setBulkPolicy] = useState('');
  const [bulkPubGate, setBulkPubGate] = useState<boolean | null>(null);
  const [bulkMinRefs, setBulkMinRefs] = useState('');

  function handleApply() {
    if (bulkRequired) onApply('priority.required_level', bulkRequired);
    if (bulkPolicy) onApply('enum.policy', bulkPolicy);
    if (bulkPubGate !== null) onApply('priority.publish_gate', bulkPubGate);
    if (bulkMinRefs !== '') onApply(
      'evidence.min_evidence_refs',
      parseBoundedIntInput(
        bulkMinRefs,
        STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.min,
        STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.max,
        STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.fallback,
      ),
    );
    // Reset
    setBulkRequired('');
    setBulkPolicy('');
    setBulkPubGate(null);
    setBulkMinRefs('');
  }

  const hasChanges = bulkRequired || bulkPolicy || bulkPubGate !== null || bulkMinRefs !== '';

  const selCls = 'px-1.5 py-1 text-xs border sf-border-soft rounded sf-input';

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 sf-surface-card rounded-lg shadow-xl px-4 py-2.5">
      <span className="text-xs font-semibold text-accent">{selectedCount} selected</span>
      <span className="sf-text-muted dark:sf-text-muted">|</span>

      <label className="flex items-center gap-1.5 text-xs sf-text-muted dark:sf-text-muted">
        Required:
        <select className={selCls} value={bulkRequired} onChange={(e) => setBulkRequired(e.target.value)}>
          <option value="">\u2014</option>
          {REQUIRED_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>

      <label className="flex items-center gap-1.5 text-xs sf-text-muted dark:sf-text-muted">
        Policy:
        <select className={selCls} value={bulkPolicy} onChange={(e) => setBulkPolicy(e.target.value)}>
          <option value="">\u2014</option>
          {POLICY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>

      <label className="flex items-center gap-1.5 text-xs sf-text-muted dark:sf-text-muted">
        Min Refs:
        <input
          type="number"
          min={STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.min}
          max={STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.max}
          className={`${selCls} w-14`}
          value={bulkMinRefs}
          onChange={(e) => setBulkMinRefs(e.target.value)}
          placeholder="\u2014"
        />
      </label>

      <label className="flex items-center gap-1.5 text-xs sf-text-muted dark:sf-text-muted">
        <input
          type="checkbox"
          ref={(el) => { if (el) el.indeterminate = bulkPubGate === null; }}
          checked={bulkPubGate === true}
          onChange={() => {
            if (bulkPubGate === null) setBulkPubGate(true);
            else if (bulkPubGate === true) setBulkPubGate(false);
            else setBulkPubGate(null);
          }}
          className="rounded sf-border-soft"
        />
        Pub Gate
      </label>

      <span className="sf-text-muted dark:sf-text-muted">|</span>

      <button
        onClick={handleApply}
        disabled={!hasChanges}
        className="px-3 py-1 text-xs sf-primary-button disabled:opacity-50"
      >
        Apply
      </button>
      <button
        onClick={onClear}
        className="px-3 py-1 text-xs sf-icon-button"
      >
        Clear
      </button>
    </div>
  );
}
