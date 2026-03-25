// WHY: Per-category spec seed template editor.
// Simple ordered list of template strings with add/remove/edit.

import { useState, useCallback } from 'react';
import { useUiStore } from '../../../stores/uiStore.ts';
import { useSpecSeedsAuthority } from '../state/specSeedsAuthority.ts';

const TEMPLATE_VARIABLES = ['{product}', '{brand}', '{model}', '{variant}', '{category}'];

interface TemplateRowProps {
  value: string;
  index: number;
  onChange: (index: number, value: string) => void;
  onRemove: (index: number) => void;
  disabled: boolean;
}

function TemplateRow({ value, index, onChange, onRemove, disabled }: TemplateRowProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full sf-callout sf-callout-neutral text-[10px] font-bold">
        {index + 1}
      </span>
      <input
        type="text"
        className="flex-1 rounded sf-input px-2.5 py-1.5 sf-text-label"
        value={value}
        onChange={(e) => onChange(index, e.target.value)}
        disabled={disabled}
        placeholder="{product} specifications"
      />
      <button
        type="button"
        onClick={() => onRemove(index)}
        disabled={disabled}
        className="shrink-0 rounded px-1.5 py-1 sf-text-label sf-status-text-danger hover:opacity-80 disabled:opacity-40"
        title="Remove template"
      >
        &#x2715;
      </button>
    </div>
  );
}

export function PipelineDeterministicStrategySection() {
  const category = useUiStore((s) => s.category);
  const isAll = category === 'all';

  const {
    seeds,
    isLoading,
    isError,
    errorMessage,
    isSaving,
    saveSeeds,
  } = useSpecSeedsAuthority({
    category,
    enabled: !isAll,
    onError: () => {},
    onSaved: () => {},
  });

  const [draft, setDraft] = useState<string[] | null>(null);
  const effectiveSeeds = draft ?? seeds;

  const commitDraft = useCallback((next: string[]) => {
    setDraft(next);
    const cleaned = next.map((s) => s.trim()).filter(Boolean);
    if (cleaned.length > 0) {
      saveSeeds(cleaned);
    }
  }, [saveSeeds]);

  const handleChange = useCallback((index: number, value: string) => {
    const next = [...effectiveSeeds];
    next[index] = value;
    setDraft(next);
  }, [effectiveSeeds]);

  const handleBlur = useCallback(() => {
    if (draft) {
      commitDraft(draft);
    }
  }, [draft, commitDraft]);

  const handleRemove = useCallback((index: number) => {
    const next = effectiveSeeds.filter((_, i) => i !== index);
    commitDraft(next.length > 0 ? next : ['{product} specifications']);
  }, [effectiveSeeds, commitDraft]);

  const handleAdd = useCallback(() => {
    commitDraft([...effectiveSeeds, '']);
  }, [effectiveSeeds, commitDraft]);

  if (isAll) {
    return (
      <div className="rounded sf-surface-elevated p-6 text-center">
        <p className="sf-text-label" style={{ color: 'var(--sf-muted)' }}>
          Select a category to configure its deterministic spec seed templates.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded sf-surface-elevated p-6 text-center">
        <p className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>Loading spec seeds...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded sf-surface-elevated px-3 py-3">
        <div className="flex items-start gap-2">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded sf-callout sf-callout-info">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16M4 10h16M4 14h10" />
              <circle cx="19" cy="14" r="2.5" />
              <path d="M19 17v3" />
            </svg>
          </span>
          <div>
            <h3 className="text-base font-semibold" style={{ color: 'var(--sf-text)' }}>
              Deterministic Strategy
              <span className="ml-2 text-sm font-normal" style={{ color: 'var(--sf-muted)' }}>
                {category}
              </span>
            </h3>
            <p className="sf-text-label" style={{ color: 'var(--sf-muted)' }}>
              Ordered spec seed query templates for Tier 1 generation. Each template becomes a search query.
            </p>
          </div>
        </div>
      </div>

      {isError && (
        <div className="rounded sf-surface-card border sf-border-danger-soft px-3 py-2">
          <p className="sf-text-label sf-status-text-danger">{errorMessage || 'Failed to load spec seeds.'}</p>
        </div>
      )}

      {/* Template list */}
      <div className="rounded sf-surface-elevated px-3 py-3 space-y-2">
        <div className="sf-text-caption font-semibold uppercase" style={{ color: 'var(--sf-muted)' }}>
          Spec Seed Templates (in priority order)
        </div>

        <div className="space-y-1.5" onBlur={handleBlur}>
          {effectiveSeeds.map((seed, idx) => (
            <TemplateRow
              key={idx}
              value={seed}
              index={idx}
              onChange={handleChange}
              onRemove={handleRemove}
              disabled={isSaving}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={handleAdd}
          disabled={isSaving}
          className="rounded sf-primary-button px-2.5 py-1 sf-text-label font-semibold transition-colors disabled:opacity-50"
        >
          + Add Template
        </button>

        {/* Variable hints */}
        <div className="pt-2 border-t sf-border-soft">
          <p className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
            Available variables:{' '}
            {TEMPLATE_VARIABLES.map((v, i) => (
              <span key={v}>
                {i > 0 && ', '}
                <code className="sf-text-label font-mono text-xs">{v}</code>
              </span>
            ))}
          </p>
          <p className="sf-text-caption mt-0.5" style={{ color: 'var(--sf-muted)' }}>
            <code className="font-mono text-xs">{'{product}'}</code> = brand + model + variant combined
          </p>
        </div>
      </div>

      {isSaving && (
        <p className="sf-text-caption font-semibold" style={{ color: 'rgb(var(--sf-color-accent-rgb))' }}>
          Saving...
        </p>
      )}
    </div>
  );
}
