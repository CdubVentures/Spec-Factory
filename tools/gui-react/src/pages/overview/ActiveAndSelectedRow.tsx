import { useMemo } from 'react';
import type { CatalogRow } from '../../types/product.ts';
import {
  useOverviewSelectionStore,
} from './overviewSelectionStore.ts';
import {
  useRunningProductIds,
  useRunningModulesByProduct,
} from '../../features/operations/hooks/useFinderOperations.ts';
import {
  MODULE_ORDER,
  MODULE_LABEL,
  MiniIcon,
} from '../../features/operations/components/moduleIcons.tsx';
import { deriveActiveAndSelectedGroups } from './activeAndSelectedRowDerivation.ts';
import './ActiveAndSelectedRow.css';

export interface ActiveAndSelectedRowProps {
  readonly category: string;
  readonly allRows: readonly CatalogRow[];
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

  // WHY: Always render the row container — even when empty — so the strip's
  // appearance/disappearance doesn't push the table down/up and shift the
  // popover triggers. The empty-state class flattens the visuals (no border,
  // no eyebrow) but keeps the reserved height so layout stays stable.
  const isEmpty = groups.active.length === 0 && groups.selectedIdle.length === 0;

  return (
    <div
      className={`sf-aas-row${isEmpty ? ' sf-aas-empty' : ''}`}
      role="region"
      aria-label="Active and selected products"
      aria-hidden={isEmpty || undefined}
    >
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
