import { useMemo, useRef, useEffect, memo, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import * as Tooltip from '@radix-ui/react-tooltip';
import { pct } from '../../../utils/formatting.ts';
import { InlineCellEditor } from '../../../shared/ui/forms/InlineCellEditor.tsx';
import { ReviewValueCell } from '../../../shared/ui/data-display/ReviewValueCell.tsx';
import { useScrollStore, resolveScrollPosition } from '../../../stores/scrollStore.ts';
import { useReviewStore, useEditingValue } from '../state/reviewStore.ts';
import { useGridPan } from '../hooks/useGridPan.ts';
import {
  deriveReviewFieldRowActionState,
  deriveReviewProductHeaderActionState,
  type ReviewFieldRowActionKind,
  type ReviewProductHeaderActionKind,
} from '../selectors/reviewFieldRowActions.ts';
import type { ReviewLayout, ProductReviewPayload, CellMode, ReviewLayoutRow } from '../../../types/review.ts';

interface ReviewMatrixProps {
  layout: ReviewLayout;
  products: ProductReviewPayload[];
  onCellClick: (productId: string, field: string) => void;
  activeCell: { productId: string; field: string } | null;
  cellMode: CellMode;
  onCommitEditing: () => void;
  onCancelEditing: () => void;
  onStartEditing: (productId: string, field: string, initialValue: string) => void;
  category: string;
  onFieldRowAction?: (action: ReviewFieldRowActionKind, fieldKey: string) => void;
  fieldRowActionPending?: boolean;
  onProductHeaderAction?: (action: ReviewProductHeaderActionKind, productId: string, productLabel: string) => void;
  productHeaderActionPending?: boolean;
}

/** Reads editingValue from store — only this component re-renders per keystroke. */
function EditingCellContent({ onCommit, onCancel }: { onCommit: () => void; onCancel: () => void }) {
  const editingValue = useEditingValue();
  const setEditingValue = useReviewStore((s) => s.setEditingValue);

  return (
    <InlineCellEditor
      value={editingValue}
      onChange={setEditingValue}
      onCommit={onCommit}
      onCancel={onCancel}
      className="w-full h-full px-1 text-[11px] sf-review-matrix-inline-editor ring-2 ring-accent"
      stopClickPropagation
    />
  );
}

const COL_WIDTH = 170;
const ROW_HEIGHT = 30;
const FIELD_COL_WIDTH = 190;
const HEADER_HEIGHT = 56;

function VariantKeyIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className="sf-review-matrix-variant-icon"
      aria-hidden="true"
    >
      <path d="M8 2.25v11.5M3.5 5.25h9M3.5 10.75h9" />
      <path d="M5.75 2.25c1.2 1.55 1.8 3.47 1.8 5.75s-.6 4.2-1.8 5.75M10.25 2.25C9.05 3.8 8.45 5.72 8.45 8s.6 4.2 1.8 5.75" />
      <circle cx="8" cy="8" r="5.75" />
    </svg>
  );
}

function MenuChevronIcon() {
  return (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="sf-review-matrix-field-chevron" aria-hidden="true">
      <path d="M3 4.5L6 7.5L9 4.5" />
    </svg>
  );
}

function FieldRowActionIcon({ action }: { readonly action: ReviewFieldRowActionKind }) {
  if (action === 'unpublish-all') {
    return (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="sf-review-matrix-field-menu-icon" aria-hidden="true">
        <path d="M3 8.5h10M6.5 5L3 8.5L6.5 12" />
        <path d="M13 4v8" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="sf-review-matrix-field-menu-icon" aria-hidden="true">
      <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4" />
      <path d="M4 4l.667 10h6.666L12 4M6.75 6.5v5M9.25 6.5v5" />
    </svg>
  );
}

interface FieldHeaderCellProps {
  readonly row: ReviewLayoutRow;
  readonly group: string;
  readonly showGroup: boolean;
  readonly onFieldRowAction?: (action: ReviewFieldRowActionKind, fieldKey: string) => void;
  readonly actionPending: boolean;
}

function FieldHeaderCell({
  row,
  group,
  showGroup,
  onFieldRowAction,
  actionPending,
}: FieldHeaderCellProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const actionState = deriveReviewFieldRowActionState({
    fieldKey: row.key,
    variantDependent: row.field_rule.variant_dependent === true,
  });
  const hasActions = actionState.actions.length > 0 && typeof onFieldRowAction === 'function';

  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const fieldRuleTitle = (() => {
    const r = row.field_rule;
    const parts: string[] = [`Type: ${r.type}`];
    if (r.required) parts.push('Required');
    if (r.units) parts.push(`Units: ${r.units}`);
    if (actionState.variantIconVisible) parts.push('Variant key');
    return parts.join(' - ');
  })();

  return (
    <div
      className={`shrink-0 flex items-center gap-1 sf-review-matrix-field-cell px-2 sticky left-0 ${open ? 'sf-review-matrix-field-cell-open' : 'z-[5]'}`}
      style={{ width: FIELD_COL_WIDTH, minWidth: FIELD_COL_WIDTH }}
    >
      {showGroup ? (
        <span className="sf-text-micro sf-text-subtle uppercase w-14 truncate" title={group}>
          {group}
        </span>
      ) : (
        <span className="w-14" />
      )}
      <div ref={menuRef} className="sf-review-matrix-field-menu-root" onPointerDown={(event) => event.stopPropagation()}>
        <button
          type="button"
          className={`sf-review-matrix-field-button ${hasActions ? 'sf-review-matrix-field-button-actionable' : ''}`}
          title={fieldRuleTitle}
          aria-label={`${row.label} field actions`}
          aria-haspopup={hasActions ? 'menu' : undefined}
          aria-expanded={hasActions ? open : undefined}
          aria-disabled={!hasActions}
          onClick={(event) => {
            event.stopPropagation();
            if (!hasActions) return;
            setOpen((current) => !current);
          }}
        >
          <span className="sf-review-matrix-field-label">{row.label}</span>
          {actionState.variantIconVisible && <VariantKeyIcon />}
          {hasActions && <MenuChevronIcon />}
        </button>
        {open && hasActions && (
          <div className="sf-review-matrix-field-menu" role="menu">
            {actionState.actions.map((action) => (
              <button
                key={action.kind}
                type="button"
                role="menuitem"
                className={`sf-review-matrix-field-menu-item ${action.kind === 'delete-all' ? 'sf-review-matrix-field-menu-item-danger' : ''}`}
                disabled={actionPending}
                onClick={(event) => {
                  event.stopPropagation();
                  onFieldRowAction?.(action.kind, row.key);
                  setOpen(false);
                }}
              >
                <FieldRowActionIcon action={action.kind} />
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProductHeaderActionIcon({ action }: { readonly action: ReviewProductHeaderActionKind }) {
  if (action === 'unpublish-non-variant-keys') {
    return (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="sf-review-matrix-field-menu-icon" aria-hidden="true">
        <path d="M3 8.5h10M6.5 5L3 8.5L6.5 12" />
        <path d="M13 4v8" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="sf-review-matrix-field-menu-icon" aria-hidden="true">
      <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4" />
      <path d="M4 4l.667 10h6.666L12 4M6.75 6.5v5M9.25 6.5v5" />
    </svg>
  );
}

function productHeaderLabel(product: ProductReviewPayload): string {
  const brand = String(product.identity.brand || '').trim();
  const model = String(product.identity.model || '').trim();
  const id = product.identity.id ? `#${product.identity.id}` : '';
  return [brand, model, id].filter(Boolean).join(' ') || product.product_id;
}

interface ProductHeaderCellProps {
  readonly product: ProductReviewPayload;
  readonly left: number;
  readonly width: number;
  readonly height: number;
  readonly dimmed: boolean;
  readonly filledFields: number;
  readonly totalFields: number;
  readonly actions: readonly { readonly kind: ReviewProductHeaderActionKind; readonly label: string }[];
  readonly onProductHeaderAction?: (action: ReviewProductHeaderActionKind, productId: string, productLabel: string) => void;
  readonly actionPending: boolean;
}

function ProductHeaderCell({
  product,
  left,
  width,
  height,
  dimmed,
  filledFields,
  totalFields,
  actions,
  onProductHeaderAction,
  actionPending,
}: ProductHeaderCellProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const label = productHeaderLabel(product);
  const hasActions = actions.length > 0 && typeof onProductHeaderAction === 'function';

  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div
      className={`absolute top-0 sf-review-matrix-product-header px-1.5 py-1 text-center flex flex-col justify-center ${hasActions ? 'sf-review-matrix-product-header-has-actions' : ''} ${open ? 'sf-review-matrix-product-header-open' : ''} ${dimmed ? 'opacity-40 sf-review-matrix-product-header-dimmed' : ''}`}
      style={{ width, left, height }}
    >
      {hasActions && (
        <div ref={menuRef} className="sf-review-matrix-product-menu-root" onPointerDown={(event) => event.stopPropagation()}>
          <button
            type="button"
            className="sf-review-matrix-product-menu-button"
            aria-label={`${label} non-variant key actions`}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={(event) => {
              event.stopPropagation();
              setOpen((current) => !current);
            }}
          >
            <MenuChevronIcon />
          </button>
          {open && (
            <div className="sf-review-matrix-product-menu" role="menu">
              {actions.map((action) => (
                <button
                  key={action.kind}
                  type="button"
                  role="menuitem"
                  className={`sf-review-matrix-field-menu-item ${action.kind === 'delete-non-variant-keys' ? 'sf-review-matrix-field-menu-item-danger' : ''}`}
                  disabled={actionPending}
                  onClick={(event) => {
                    event.stopPropagation();
                    onProductHeaderAction?.(action.kind, product.product_id, label);
                    setOpen(false);
                  }}
                >
                  <ProductHeaderActionIcon action={action.kind} />
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="text-[11px] font-semibold truncate">{product.identity.brand}</div>
      <div className="sf-text-caption sf-status-text-muted truncate">{product.identity.model}</div>
      <div className="sf-text-nano sf-text-subtle font-mono truncate">
        {product.identity.id ? `#${product.identity.id}` : '#--'} | {product.identity.identifier ? product.identity.identifier.slice(0, 6) : 'no-id'}
      </div>
      <div className="sf-text-nano sf-text-subtle flex items-center justify-center gap-1">
        <span>{pct(product.metrics.confidence)}</span>
        <span>|</span>
        <span>{filledFields}/{totalFields}</span>
      </div>
    </div>
  );
}

export const ReviewMatrix = memo(function ReviewMatrix({
  layout,
  products,
  onCellClick,
  activeCell,
  cellMode,
  onCommitEditing,
  onCancelEditing,
  onStartEditing,
  category,
  onFieldRowAction,
  fieldRowActionPending = false,
  onProductHeaderAction,
  productHeaderActionPending = false,
}: ReviewMatrixProps) {
  const rows = layout.rows;
  const parentRef = useRef<HTMLDivElement>(null);
  const { isPanning, panHandlers } = useGridPan(parentRef);

  // Grid scroll persistence
  const scrollKey = `review:grid:scroll:${category}`;
  const scrollSet = useScrollStore((s) => s.set);

  useEffect(() => {
    requestAnimationFrame(() => {
      const stored = resolveScrollPosition(useScrollStore.getState().values[scrollKey]);
      if (stored && parentRef.current) {
        parentRef.current.scrollTop = stored.top;
        parentRef.current.scrollLeft = stored.left;
      }
    });
    return () => {
      if (parentRef.current) {
        scrollSet(scrollKey, { top: parentRef.current.scrollTop, left: parentRef.current.scrollLeft });
      }
    };
  }, [scrollKey, scrollSet]);

  // Row virtualization
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 15,
  });

  // Column virtualization for products
  const colVirtualizer = useVirtualizer({
    horizontal: true,
    count: products.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => COL_WIDTH,
    overscan: 5,
  });

  // Group tracking for row labels
  const groupMap = useMemo(() => {
    const map = new Map<number, string>();
    let currentGroup = '';
    rows.forEach((row, i) => {
      if (row.group) currentGroup = row.group;
      map.set(i, currentGroup);
    });
    return map;
  }, [rows]);

  // Typing while selected enters edit mode with typed character.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (cellMode !== 'selected' || !activeCell) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key.length !== 1) return;
      event.preventDefault();
      onStartEditing(activeCell.productId, activeCell.field, event.key);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cellMode, activeCell, onStartEditing]);

  const totalColWidth = FIELD_COL_WIDTH + colVirtualizer.getTotalSize();
  const productHeaderActionState = useMemo(
    () => deriveReviewProductHeaderActionState({ rows }),
    [rows],
  );

  return (
    <Tooltip.Provider delayDuration={200}>
      <div className="sf-table-shell rounded-lg overflow-hidden">
        <div
          ref={parentRef}
          className={`overflow-auto ${isPanning ? 'sf-grid-panning' : 'sf-grid-pannable'}`}
          style={{ height: 'calc(100vh - 340px)' }}
          onPointerDown={panHandlers.onPointerDown}
        >
          <div style={{ width: totalColWidth, position: 'relative' }}>
            <div className="flex sf-table-head sticky top-0 z-20" style={{ width: totalColWidth, height: HEADER_HEIGHT }}>
              <div
                className="shrink-0 sf-review-matrix-field-header px-2 py-1 sf-text-caption font-semibold uppercase flex items-center sticky left-0 z-30"
                style={{ width: FIELD_COL_WIDTH, minWidth: FIELD_COL_WIDTH }}
              >
                Field
              </div>
              <div style={{ width: colVirtualizer.getTotalSize(), position: 'relative', height: HEADER_HEIGHT }}>
                {colVirtualizer.getVirtualItems().map((vCol) => {
                  const p = products[vCol.index];
                  const dimmed = p.hasRun === false;
                  const totalFields = rows.length;
                  const filledFields = rows.filter((r) => {
                    const fs = p.fields[r.key];
                    return fs && fs.selected.confidence > 0;
                  }).length;
                  return (
                    <ProductHeaderCell
                      key={p.product_id}
                      product={p}
                      left={vCol.start}
                      width={vCol.size}
                      height={HEADER_HEIGHT}
                      dimmed={dimmed}
                      filledFields={filledFields}
                      totalFields={totalFields}
                      actions={productHeaderActionState.actions}
                      onProductHeaderAction={onProductHeaderAction}
                      actionPending={productHeaderActionPending}
                    />
                  );
                })}
              </div>
            </div>

            <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
              {rowVirtualizer.getVirtualItems().map((vRow) => {
                const row = rows[vRow.index];
                const group = groupMap.get(vRow.index) || '';
                const showGroup = vRow.index === 0 || groupMap.get(vRow.index - 1) !== group;

                return (
                  <div
                    key={row.key}
                    className="absolute flex w-full sf-review-matrix-row"
                    style={{
                      height: ROW_HEIGHT,
                      top: vRow.start,
                      width: totalColWidth,
                    }}
                  >
                    <FieldHeaderCell
                      row={row}
                      group={group}
                      showGroup={showGroup}
                      onFieldRowAction={onFieldRowAction}
                      actionPending={fieldRowActionPending}
                    />

                    <div style={{ width: colVirtualizer.getTotalSize(), position: 'relative', height: ROW_HEIGHT }}>
                      {colVirtualizer.getVirtualItems().map((vCol) => {
                        const p = products[vCol.index];
                        const fieldState = p.fields[row.key];
                        const isActive = activeCell?.productId === p.product_id && activeCell?.field === row.key;
                        const isEditing = isActive && cellMode === 'editing';
                        const dimmed = p.hasRun === false;
                        return (
                          <div
                            key={p.product_id}
                            data-product-id={p.product_id}
                            data-field-key={row.key}
                            className={`absolute top-0 flex items-center sf-review-matrix-cell ${
                              isEditing
                                ? 'sf-review-matrix-cell-editing cursor-text'
                                : isActive
                                  ? 'ring-2 ring-accent ring-inset sf-review-matrix-cell-active cursor-text'
                                  : dimmed
                                    ? 'sf-review-matrix-cell-dimmed cursor-pointer'
                                    : 'cursor-pointer'
                            }`}
                            style={{ width: vCol.size, left: vCol.start, height: ROW_HEIGHT }}
                            onClick={() => onCellClick(p.product_id, row.key)}
                          >
                            {isEditing ? (
                              <EditingCellContent onCommit={onCommitEditing} onCancel={onCancelEditing} />
                            ) : (
                              <ReviewValueCell
                                state={fieldState}
                                hasRun={p.hasRun}
                                className="px-1 w-full"
                                valueClassName="text-[11px]"
                                valueMaxChars={22}
                                unknownLabel=""
                                showConfidence
                                showOverrideBadge
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Tooltip.Provider>
  );
});
