import { useMemo } from 'react';
import type { CatalogRow } from '../../types/product.ts';
import {
  useOverviewSelectionStore,
  useSelectionSize,
} from './overviewSelectionStore.ts';
import { useRunningModulesByProduct } from '../../features/operations/hooks/useFinderOperations.ts';
import './SelectionStrip.css';

export interface SelectionStripProps {
  readonly category: string;
  readonly allRows: readonly CatalogRow[];
}

const MODULE_ORDER: readonly string[] = ['cef', 'pif', 'rdf', 'skf', 'kf'];
const MODULE_LABEL: Readonly<Record<string, string>> = {
  cef: 'CEF', pif: 'PIF', rdf: 'RDF', skf: 'SKU', kf: 'KF',
};

function MiniIcon({ mod }: { mod: string }) {
  if (mod === 'cef') {
    return (
      <svg viewBox="0 0 22 10" width="14" height="7" aria-hidden>
        <polygon points="5,1 9,5 5,9 1,5" fill="currentColor" opacity="0.85" />
        <polygon points="17,1 21,5 17,9 13,5" fill="currentColor" opacity="0.55" />
      </svg>
    );
  }
  if (mod === 'pif') {
    return (
      <svg viewBox="0 0 12 12" width="9" height="9" aria-hidden>
        <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="6" cy="6" r="3" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
        <circle cx="6" cy="6" r="1.2" fill="currentColor" opacity="0.7" />
      </svg>
    );
  }
  if (mod === 'rdf' || mod === 'skf') {
    return (
      <svg viewBox="0 0 12 12" width="9" height="9" aria-hidden>
        <polygon points="6,1 11,6 6,11 1,6" fill="currentColor" opacity="0.85" />
      </svg>
    );
  }
  if (mod === 'kf') {
    return (
      <svg viewBox="0 0 24 8" width="16" height="6" aria-hidden>
        {[3, 9, 15, 21].map((cx, i) => (
          <circle key={cx} cx={cx} cy="4" r="2.2" fill="currentColor" opacity={1 - i * 0.15} />
        ))}
      </svg>
    );
  }
  return null;
}

interface BadgeProps {
  readonly row: CatalogRow;
  readonly runningModules: ReadonlySet<string>;
  readonly onRemove: () => void;
}

function SelectionBadge({ row, runningModules, onRemove }: BadgeProps) {
  const isActive = runningModules.size > 0;
  const labelMain = row.base_model || row.identifier || row.productId;
  const labelSub = row.variant ? row.variant : '';
  const tooltipParts = [
    `${row.brand}${row.base_model ? ` ${row.base_model}` : ''}${row.variant ? ` · ${row.variant}` : ''}`,
    isActive
      ? `Running: ${[...runningModules].map((m) => MODULE_LABEL[m] ?? m.toUpperCase()).join(', ')}`
      : 'Idle',
  ];
  return (
    <span className={`sf-ss-badge${isActive ? ' is-active' : ''}`} title={tooltipParts.join('\n')}>
      <span className="sf-ss-text">
        {row.brand && <span className="sf-ss-brand">{row.brand}</span>}
        <span className="sf-ss-model">{labelMain}</span>
        {labelSub && <span className="sf-ss-variant">{labelSub}</span>}
      </span>
      {isActive && (
        <span className="sf-ss-mods">
          {MODULE_ORDER.filter((m) => runningModules.has(m)).map((m) => (
            <span
              key={m}
              className={`sf-ss-mod sf-ss-mod-${m}`}
              aria-label={`${MODULE_LABEL[m] ?? m} running`}
            >
              <MiniIcon mod={m} />
            </span>
          ))}
        </span>
      )}
      <button
        type="button"
        className="sf-ss-remove"
        onClick={onRemove}
        aria-label="Remove from selection"
        title="Remove from selection"
      >
        {'\u00D7'}
      </button>
    </span>
  );
}

export function SelectionStrip({ category, allRows }: SelectionStripProps) {
  const selectedSet = useOverviewSelectionStore((s) => s.byCategory[category]);
  const selectedSize = useSelectionSize(category);
  const toggle = useOverviewSelectionStore((s) => s.toggle);
  const clear = useOverviewSelectionStore((s) => s.clear);
  const runningByProduct = useRunningModulesByProduct(category);

  const selectedRows = useMemo<readonly CatalogRow[]>(() => {
    if (!selectedSet || selectedSet.size === 0) return [];
    const byId = new Map(allRows.map((r) => [r.productId, r]));
    const out: CatalogRow[] = [];
    for (const id of selectedSet) {
      const row = byId.get(id);
      if (row) out.push(row);
    }
    return out;
  }, [allRows, selectedSet]);

  if (selectedSize === 0) return null;

  const activeCount = selectedRows.reduce(
    (n, r) => ((runningByProduct.get(r.productId)?.size ?? 0) > 0 ? n + 1 : n),
    0,
  );

  return (
    <div className="sf-ss-row" role="region" aria-label="Selected products">
      <div className="sf-ss-eyebrow">
        <span className="sf-ss-count">{selectedSize}</span>
        <span className="sf-ss-eyebrow-label">selected</span>
        {activeCount > 0 && (
          <span className="sf-ss-eyebrow-active" title={`${activeCount} of ${selectedSize} have a running finder.`}>
            {activeCount} active
          </span>
        )}
      </div>
      <div className="sf-ss-track">
        {selectedRows.map((row) => (
          <SelectionBadge
            key={row.productId}
            row={row}
            runningModules={runningByProduct.get(row.productId) ?? EMPTY_SET}
            onRemove={() => toggle(category, row.productId)}
          />
        ))}
      </div>
      <button
        type="button"
        className="sf-ss-clear"
        onClick={() => clear(category)}
        title="Deselect every product."
      >
        Clear
      </button>
    </div>
  );
}

const EMPTY_SET: ReadonlySet<string> = new Set();
