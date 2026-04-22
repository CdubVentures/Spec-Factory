/**
 * SearchBox — styled search input with leading magnifier, trailing keyboard
 * hint (or × clear when dirty), and `Esc` handler that clears the value.
 *
 * Uses the repo's `.sf-input` styling for base — the icon + hint are
 * absolutely positioned overlays matching BillingFilterBar geometry.
 */

import { memo, useCallback } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { SearchIcon, CloseIcon } from './icons.tsx';

interface SearchBoxProps {
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly placeholder?: string;
  readonly keyboardHint?: string;
  readonly ariaLabel?: string;
}

export const SearchBox = memo(function SearchBox({
  value,
  onChange,
  placeholder = 'Search…',
  keyboardHint = '/',
  ariaLabel,
}: SearchBoxProps) {
  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => { onChange(e.target.value); },
    [onChange],
  );
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape' && value !== '') {
        e.preventDefault();
        onChange('');
      }
    },
    [value, onChange],
  );
  const handleClear = useCallback(() => onChange(''), [onChange]);

  const dirty = value !== '';

  return (
    <div className="relative inline-flex items-center flex-[0_1_340px] min-w-[200px]">
      <SearchIcon className="absolute left-2.5 w-3.5 h-3.5 sf-text-muted pointer-events-none" />
      <input
        type="search"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className="sf-input w-full pl-8 pr-8 py-1.5 text-[12.5px]"
      />
      {dirty ? (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear search"
          className="absolute right-1.5 w-[18px] h-[18px] flex items-center justify-center rounded-full sf-surface-alt hover:sf-surface-soft sf-text-muted"
        >
          <CloseIcon className="w-2.5 h-2.5" />
        </button>
      ) : (
        <span
          aria-hidden
          className="absolute right-2 sf-surface-alt sf-text-muted font-mono text-[10.5px] font-semibold px-1.5 py-0.5 rounded border sf-border-soft leading-none"
        >
          {keyboardHint}
        </span>
      )}
    </div>
  );
});
