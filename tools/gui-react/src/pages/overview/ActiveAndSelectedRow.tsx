import { useMemo } from 'react';
import type { CatalogRow } from '../../types/product.ts';
import {
  useOverviewSelectionStore,
} from './overviewSelectionStore.ts';
import {
  useRunningProductIds,
  useRunningModulesByProduct,
} from '../../features/operations/hooks/useFinderOperations.ts';
import { deriveActiveAndSelectedGroups } from './activeAndSelectedRowDerivation.ts';
import './ActiveAndSelectedRow.css';

export interface ActiveAndSelectedRowProps {
  readonly category: string;
  readonly allRows: readonly CatalogRow[];
}

const MODULE_ORDER: readonly string[] = ['cef', 'pif', 'rdf', 'skf', 'kf', 'pipeline'];
const MODULE_LABEL: Readonly<Record<string, string>> = {
  cef: 'CEF',
  pif: 'PIF',
  rdf: 'RDF',
  skf: 'SKU',
  kf: 'KF',
  pipeline: 'PL',
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
  if (mod === 'pipeline') {
    return (
      <svg viewBox="0 0 24 8" width="16" height="6" aria-hidden>
        {[0, 5, 10, 15, 20].map((x, i) => (
          <rect key={x} x={x} y="1.5" width="3.5" height="5" fill="currentColor" opacity={1 - i * 0.15} rx="0.6" />
        ))}
      </svg>
    );
  }
  return null;
}

interface ActiveBadgeProps {
  readonly row: CatalogRow;
  readonly runningModules: ReadonlySet<string>;
}

function ActiveBadge({ row, runningModules }: ActiveBadgeProps) {
  const labelMain = row.base_model || row.identifier || row.productId;
  const labelSub = row.variant ? row.variant : '';
  const tooltipParts = [
    `${row.brand}${row.base_model ? ` ${row.base_model}` : ''}${row.variant ? ` \u00B7 ${row.variant}` : ''}`,
    `Running: ${[...runningModules].map((m) => MODULE_LABEL[m] ?? m.toUpperCase()).join(', ')}`,
  ];
  return (
    <span className="sf-aas-badge sf-aas-badge-active" title={tooltipParts.join('\n')}>
      <span className="sf-aas-text">
        {row.brand && <span className="sf-aas-brand">{row.brand}</span>}
        <span className="sf-aas-model">{labelMain}</span>
        {labelSub && <span className="sf-aas-variant">{labelSub}</span>}
      </span>
      <span className="sf-aas-mods">
        {MODULE_ORDER.filter((m) => runningModules.has(m)).map((m) => (
          <span
            key={m}
            className={`sf-aas-mod sf-aas-mod-${m}`}
            aria-label={`${MODULE_LABEL[m] ?? m} running`}
          >
            <MiniIcon mod={m} />
          </span>
        ))}
      </span>
    </span>
  );
}

interface SelectedIdleBadgeProps {
  readonly row: CatalogRow;
  readonly onRemove: () => void;
}

function SelectedIdleBadge({ row, onRemove }: SelectedIdleBadgeProps) {
  const labelMain = row.base_model || row.identifier || row.productId;
  const labelSub = row.variant ? row.variant : '';
  const tooltip = [
    `${row.brand}${row.base_model ? ` ${row.base_model}` : ''}${row.variant ? ` \u00B7 ${row.variant}` : ''}`,
    'Selected — Command Console will start ops on this product.',
  ].join('\n');
  return (
    <span className="sf-aas-badge sf-aas-badge-idle" title={tooltip}>
      <span className="sf-aas-text">
        {row.brand && <span className="sf-aas-brand">{row.brand}</span>}
        <span className="sf-aas-model">{labelMain}</span>
        {labelSub && <span className="sf-aas-variant">{labelSub}</span>}
      </span>
      <button
        type="button"
        className="sf-aas-remove"
        onClick={onRemove}
        aria-label="Remove from selection"
        title="Remove from selection"
      >
        {'\u00D7'}
      </button>
    </span>
  );
}

const EMPTY_SET: ReadonlySet<string> = new Set();

export function ActiveAndSelectedRow({ category, allRows }: ActiveAndSelectedRowProps) {
  const selectedSet = useOverviewSelectionStore((s) => s.byCategory[category]);
  const toggle = useOverviewSelectionStore((s) => s.toggle);
  const clear = useOverviewSelectionStore((s) => s.clear);
  const activeIds = useRunningProductIds(category);
  const runningByProduct = useRunningModulesByProduct(category);

  const groups = useMemo(
    () => deriveActiveAndSelectedGroups(allRows, activeIds, selectedSet),
    [allRows, activeIds, selectedSet],
  );

  if (groups.active.length === 0 && groups.selectedIdle.length === 0) return null;

  return (
    <div className="sf-aas-row" role="region" aria-label="Active and selected products">
      {groups.active.length > 0 && (
        <div className="sf-aas-group sf-aas-group-active">
          <div className="sf-aas-eyebrow">
            <span className="sf-aas-count sf-aas-count-active">{groups.active.length}</span>
            <span className="sf-aas-eyebrow-label">active</span>
          </div>
          <div className="sf-aas-track">
            {groups.active.map((row) => (
              <ActiveBadge
                key={row.productId}
                row={row}
                runningModules={runningByProduct.get(row.productId) ?? EMPTY_SET}
              />
            ))}
          </div>
        </div>
      )}

      {groups.selectedIdle.length > 0 && (
        <div className="sf-aas-group sf-aas-group-idle">
          <div className="sf-aas-eyebrow">
            <span className="sf-aas-count sf-aas-count-idle">{groups.selectedIdle.length}</span>
            <span className="sf-aas-eyebrow-label">selected, idle</span>
          </div>
          <div className="sf-aas-track">
            {groups.selectedIdle.map((row) => (
              <SelectedIdleBadge
                key={row.productId}
                row={row}
                onRemove={() => toggle(category, row.productId)}
              />
            ))}
          </div>
          <button
            type="button"
            className="sf-aas-clear"
            onClick={() => clear(category)}
            title="Deselect every product."
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
