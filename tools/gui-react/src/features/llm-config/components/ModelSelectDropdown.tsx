import { memo, useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { ensureValueInOptions } from '../state/llmModelDropdownOptions.ts';
import type { DropdownModelOption } from '../state/llmModelDropdownOptions.ts';
import { ROLE_BADGE_STYLE, ROLE_LABEL } from '../state/llmRoleBadgeStyles.ts';
import type { LlmModelRole } from '../types/llmProviderRegistryTypes.ts';

/** Small "inherit from global" indicator rendered next to a dropdown when using the global default. */
export function GlobalDefaultIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Using global default"
      style={{ color: 'var(--sf-muted)' }}
    >
      <circle cx="8" cy="8" r="6.5" />
      <ellipse cx="8" cy="8" rx="3" ry="6.5" />
      <path d="M1.5 8h13M2.5 4.5h11M2.5 11.5h11" />
    </svg>
  );
}

interface ModelSelectDropdownProps {
  options: readonly DropdownModelOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  style?: React.CSSProperties;
  allowNone?: boolean;
  noneLabel?: string;
  /** Model ID of the inherited default — used to derive the role badge for the none/default item. */
  noneModelId?: string;
  disabled?: boolean;
}

/** Reusable model-selection dropdown with SVG role badges in every item. */
export const ModelSelectDropdown = memo(function ModelSelectDropdown({
  options,
  value,
  onChange,
  className,
  style,
  allowNone = false,
  noneLabel = '(none)',
  noneModelId,
  disabled,
}: ModelSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const missingOption = useMemo(() => ensureValueInOptions(options, value), [options, value]);

  // Build the full item list (none + missing + options)
  const items = useMemo(() => {
    const list: Array<{ key: string; value: string; label: string; role?: LlmModelRole; muted?: boolean }> = [];
    const derivedNoneRole = noneModelId ? options.find((o) => o.value === noneModelId)?.role : undefined;
    if (allowNone) list.push({ key: '__none__', value: '', label: noneLabel, role: derivedNoneRole });
    if (missingOption) list.push({ key: `missing-${missingOption.value}`, value: missingOption.value, label: missingOption.label, muted: true });
    for (const o of options) {
      list.push({
        key: o.providerId ? `reg-${o.providerId}-${o.value}` : o.value,
        value: o.value,
        label: o.label,
        role: o.role,
      });
    }
    return list;
  }, [options, allowNone, noneLabel, missingOption]);

  // Find display label for current value
  const selectedItem = useMemo(() => items.find((i) => i.value === value), [items, value]);
  const displayLabel = selectedItem?.label || value || noneLabel;
  const selectedRole = selectedItem?.role;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Scroll focused item into view
  useEffect(() => {
    if (!open || focusIdx < 0 || !listRef.current) return;
    const el = listRef.current.children[focusIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, focusIdx]);

  const handleSelect = useCallback((val: string) => {
    onChange(val);
    setOpen(false);
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
        const idx = items.findIndex((i) => i.value === value);
        setFocusIdx(idx >= 0 ? idx : 0);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusIdx((prev) => Math.min(prev + 1, items.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusIdx((prev) => Math.max(prev - 1, 0));
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (focusIdx >= 0 && focusIdx < items.length) {
          handleSelect(items[focusIdx].value);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  }, [disabled, open, items, value, focusIdx, handleSelect]);

  const handleTriggerClick = useCallback(() => {
    if (disabled) return;
    setOpen((prev) => {
      if (!prev) {
        const idx = items.findIndex((i) => i.value === value);
        setFocusIdx(idx >= 0 ? idx : 0);
      }
      return !prev;
    });
  }, [disabled, items, value]);

  return (
    <div ref={containerRef} className="sf-custom-select" onKeyDown={handleKeyDown}>
      <button
        type="button"
        className={`sf-custom-select-trigger${className ? ` ${className}` : ''}`}
        style={style}
        onClick={handleTriggerClick}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="sf-custom-select-value">
          {selectedRole && (
            <span className="sf-custom-select-role-tag" style={{ color: ROLE_BADGE_STYLE[selectedRole].fg }}>
              {ROLE_LABEL[selectedRole]}
            </span>
          )}
          <span className="sf-custom-select-label">{displayLabel}</span>
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" className="sf-custom-select-chevron">
          <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div ref={listRef} className="sf-custom-select-panel" role="listbox">
          {items.map((item, idx) => (
            <div
              key={item.key}
              role="option"
              aria-selected={item.value === value}
              className={`sf-custom-select-item${idx === focusIdx ? ' sf-custom-select-item-focused' : ''}${item.value === value ? ' sf-custom-select-item-selected' : ''}`}
              style={item.muted ? { opacity: 0.5 } : undefined}
              onMouseEnter={() => setFocusIdx(idx)}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(item.value); }}
            >
              {item.role && (
                <span className="sf-custom-select-role-tag" style={{ color: ROLE_BADGE_STYLE[item.role].fg }}>
                  {ROLE_LABEL[item.role]}
                </span>
              )}
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
