import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { usePersistedScroll } from '../../../hooks/usePersistedScroll.ts';
import './DrillColumn.css';

export interface DrillColumnItem {
  readonly value: string;
  readonly label: string;
  readonly count?: number;
  readonly matches?: Array<[number, number]>;
  readonly italic?: boolean;
}

export type DrillColumnStatus = 'done' | 'active' | 'pending';

export interface DrillColumnProps {
  readonly step: 1 | 2 | 3;
  readonly label: string;
  readonly status: DrillColumnStatus;
  readonly items: DrillColumnItem[];
  readonly selectedValue?: string;
  readonly onSelect: (value: string) => void;
  readonly onDrillRight?: () => void;
  readonly onDrillLeft?: () => void;
  readonly autoFocus?: boolean;
  readonly disabled?: boolean;
  readonly emptyHint?: string;
  readonly totalHeaderCount?: number;
  /** When provided, the list's scroll position is persisted under this key
   *  via usePersistedScroll so it survives tab-away / remount. */
  readonly scrollPersistKey?: string;
}

function highlight(label: string, matches?: Array<[number, number]>) {
  if (!matches || matches.length === 0) return label;
  const parts: Array<string | JSX.Element> = [];
  let cursor = 0;
  matches.forEach(([start, end], idx) => {
    if (start > cursor) parts.push(label.slice(cursor, start));
    parts.push(
      <span key={`m-${idx}-${start}`} className="sf-drill-match">{label.slice(start, end)}</span>,
    );
    cursor = end;
  });
  if (cursor < label.length) parts.push(label.slice(cursor));
  return <>{parts}</>;
}

export function DrillColumn({
  step,
  label,
  status,
  items,
  selectedValue,
  onSelect,
  onDrillRight,
  onDrillLeft,
  autoFocus,
  disabled,
  emptyHint,
  totalHeaderCount,
  scrollPersistKey,
}: DrillColumnProps) {
  const listRef = useRef<HTMLUListElement | null>(null);
  const selectedItemRef = useRef<HTMLLIElement>(null);
  const persistedScrollRef = usePersistedScroll(scrollPersistKey ?? '');
  const setListRef = useCallback((node: HTMLUListElement | null) => {
    listRef.current = node;
    if (scrollPersistKey) persistedScrollRef(node);
  }, [scrollPersistKey, persistedScrollRef]);
  const initialIndex = useMemo(() => {
    if (!selectedValue) return 0;
    const idx = items.findIndex((i) => i.value === selectedValue);
    return idx >= 0 ? idx : 0;
  }, [items, selectedValue]);

  const [focusIdx, setFocusIdx] = useState(initialIndex);

  useEffect(() => {
    if (focusIdx >= items.length && items.length > 0) setFocusIdx(items.length - 1);
  }, [items.length, focusIdx]);

  useEffect(() => {
    if (autoFocus && listRef.current) listRef.current.focus();
  }, [autoFocus]);

  // WHY: When the picker re-opens or the catalog reshuffles, scroll the
  // current selection into view so the user doesn't have to hunt for it.
  useEffect(() => {
    const node = selectedItemRef.current;
    if (!node || typeof node.scrollIntoView !== 'function') return;
    node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selectedValue, items.length]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLUListElement>) => {
      if (disabled || items.length === 0) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setFocusIdx((i) => Math.min(items.length - 1, i + 1));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setFocusIdx((i) => Math.max(0, i - 1));
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        const focused = items[focusIdx];
        if (focused) {
          onSelect(focused.value);
          onDrillRight?.();
        }
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        onDrillRight?.();
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onDrillLeft?.();
      }
    },
    [disabled, items, focusIdx, onSelect, onDrillRight, onDrillLeft],
  );

  const showEmpty = items.length === 0;
  const headerCount = totalHeaderCount ?? items.length;

  return (
    <div className="sf-drill-col" data-status={status} data-disabled={disabled ? 'true' : undefined}>
      <div className="sf-drill-head">
        <span className="sf-drill-step" data-status={status}>
          {status === 'done' ? '✓' : step}
        </span>
        <span className="sf-drill-label">{label}</span>
        <span className="sf-drill-count">{showEmpty && disabled ? '—' : headerCount}</span>
      </div>
      <ul
        ref={setListRef}
        className="sf-drill-list"
        role="listbox"
        aria-label={label}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={handleKeyDown}
      >
        {showEmpty ? (
          <li className="sf-drill-empty">
            <span className="sf-drill-empty-icon" aria-hidden="true">→</span>
            {emptyHint ?? 'no items'}
          </li>
        ) : (
          items.map((item, i) => {
            const isSelected = selectedValue === item.value;
            const isFocused = i === focusIdx;
            return (
              <li
                key={item.value}
                ref={isSelected ? selectedItemRef : undefined}
                role="option"
                aria-selected={isSelected}
                className="sf-drill-item"
                data-selected={isSelected ? 'true' : undefined}
                data-focused={isFocused ? 'true' : undefined}
                data-italic={item.italic ? 'true' : undefined}
                onClick={() => {
                  setFocusIdx(i);
                  onSelect(item.value);
                }}
              >
                <span className="sf-drill-name">{highlight(item.label, item.matches)}</span>
                {typeof item.count === 'number' ? (
                  <span className="sf-drill-ct">{item.count}</span>
                ) : null}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
