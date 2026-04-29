import { useMemo, useCallback, useRef, useState } from 'react';
import { useMutation, type QueryClient } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import * as Tooltip from '@radix-ui/react-tooltip';
import { DataTable } from '../../shared/ui/data-display/DataTable.tsx';
import { InlineCellEditor } from '../../shared/ui/forms/InlineCellEditor.tsx';
import { ReviewValueCell } from '../../shared/ui/data-display/ReviewValueCell.tsx';
import { useComponentReviewStore } from '../../stores/componentReviewStore.ts';
import { api } from '../../api/client.ts';
import { formatCellValue, humanizeField } from '../../utils/fieldNormalize.ts';
import { useFieldLabels } from '../../hooks/useFieldLabels.ts';
import { ComponentReviewDrawer } from './ComponentReviewDrawer.tsx';
import {
  ComponentReviewHeaderActionDrawer,
  ComponentReviewRowActionDrawer,
} from './ComponentReviewActionDrawers.tsx';
import {
  buildComponentReviewGridLinkedProducts,
  cancelLinkedReviewProductFields,
  removeAllComponentReviewRowsFromCache,
  removeComponentReviewRowFromCache,
  restoreComponentReviewPayload,
  restoreLinkedReviewProductFields,
  updateLinkedReviewProductFields,
  type ComponentReviewPayloadSnapshot,
  type LinkedReviewProductFieldSnapshot,
} from './componentReviewCache.ts';
import { invalidateComponentImpactForCategory } from './componentImpactInvalidation.ts';
import type { ComponentReviewPayload, ComponentReviewItem } from '../../types/componentReview.ts';
import { FinderDeleteConfirmModal } from '../../shared/ui/finder/FinderDeleteConfirmModal.tsx';
import type { DeleteTarget } from '../../shared/ui/finder/types.ts';

interface ComponentSubTabProps {
  data: ComponentReviewPayload;
  category: string;
  queryClient: QueryClient;
}

interface ComponentOverrideMutationBody {
  componentType: string;
  name: string;
  maker: string;
  property: string;
  value: string;
  componentIdentityId?: number;
  componentValueId?: number;
}

interface ComponentOverrideMutationContext {
  previousComponentReviewData?: ComponentReviewPayload;
  previousLinkedReviewProductFields?: LinkedReviewProductFieldSnapshot;
}

interface ComponentRowDeleteMutationBody {
  item: ComponentReviewItem;
}

interface ComponentRowDeleteMutationContext {
  previousComponentReviewData?: ComponentReviewPayloadSnapshot;
}

interface ComponentTypeDeleteMutationContext {
  previousComponentReviewData?: ComponentReviewPayloadSnapshot;
}

interface PropertyColumnAggregate {
  variancePolicy: string | null;
  constraints: readonly string[];
}

function isCellSelected(
  selectedCell: { name: string; maker: string; property: string; rowIndex: number } | null,
  rowIndex: number,
  property: string,
): boolean {
  return selectedCell?.rowIndex === rowIndex && selectedCell?.property === property;
}

function toPositiveId(value: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  const id = Math.trunc(n);
  return id > 0 ? id : undefined;
}

function ComponentEditingCell({
  onCommit,
  onCancel,
  className,
}: {
  onCommit: () => void;
  onCancel: () => void;
  className?: string;
}) {
  const cellEditValue = useComponentReviewStore((s) => s.cellEditValue);
  const setCellEditValue = useComponentReviewStore((s) => s.setCellEditValue);

  return (
    <InlineCellEditor
      value={cellEditValue}
      onChange={setCellEditValue}
      onCommit={onCommit}
      onCancel={onCancel}
      className={className}
      stopClickPropagation
    />
  );
}

function IdentityValueCell({
  value,
  selected,
  className,
}: {
  value: unknown;
  selected: boolean;
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${selected ? 'ring-2 ring-accent ring-inset rounded px-0.5' : ''}`}>
      <span className={`block truncate text-[11px] sf-text-primary ${className || ''}`} title={formatCellValue(value)}>
        {formatCellValue(value)}
      </span>
    </div>
  );
}

function applyComponentOptimisticOverride(
  payload: ComponentReviewPayload,
  rowIndex: number,
  property: string,
  value: string,
): ComponentReviewPayload {
  const now = new Date().toISOString();
  return {
    ...payload,
    items: payload.items.map((item, i) => {
      if (i !== rowIndex) return item;
      const selected = { value, confidence: 1.0, status: 'override', color: 'green' as const };

      if (property === '__name') {
        return {
          ...item,
          name: value,
          name_tracked: {
            ...item.name_tracked,
            selected,
            source: 'user',
            source_timestamp: now,
            overridden: true,
            needs_review: false,
            reason_codes: ['manual_override'],
          },
        };
      }

      if (property === '__maker') {
        return {
          ...item,
          maker: value,
          maker_tracked: {
            ...item.maker_tracked,
            selected,
            source: 'user',
            source_timestamp: now,
            overridden: true,
            needs_review: false,
            reason_codes: ['manual_override'],
          },
        };
      }

      return item;
    }),
  };
}

function buildPropertyAggregates(
  items: readonly ComponentReviewItem[],
  propertyColumns: readonly string[],
): ReadonlyMap<string, PropertyColumnAggregate> {
  const map = new Map<string, { variancePolicy: string | null; constraints: readonly string[] }>();
  for (const propKey of propertyColumns) {
    map.set(propKey, { variancePolicy: null, constraints: [] });
  }

  for (const item of items) {
    for (const propKey of propertyColumns) {
      const aggregate = map.get(propKey);
      if (!aggregate) continue;
      const state = item.properties[propKey];
      if (aggregate.variancePolicy === null && state?.variance_policy) {
        aggregate.variancePolicy = state.variance_policy;
      }
      if (aggregate.constraints.length === 0 && (state?.constraints?.length ?? 0) > 0) {
        aggregate.constraints = state!.constraints!;
      }
    }
  }

  return map;
}

function formatConstraintLabel(expr: string): string {
  const opMatch = expr.match(/^(.+?)\s*(<=|>=|!=|==|<|>)\s*(.+)$/);
  if (!opMatch) return expr;
  return `${humanizeField(opMatch[1].trim())} ${opMatch[2]} ${humanizeField(opMatch[3].trim())}`;
}

function formatVarianceLabel(variancePolicy: string | null): string | null {
  if (variancePolicy === 'upper_bound') return 'Upper';
  if (variancePolicy === 'lower_bound') return 'Lower';
  if (variancePolicy === 'authoritative') return 'Equal';
  if (variancePolicy === 'range') return '+/-';
  return null;
}

export function ComponentSubTab({
  data,
  category,
  queryClient,
}: ComponentSubTabProps) {
  const { getLabel } = useFieldLabels(category);
  const items = data.items;
  const propertyAggregates = useMemo(
    () => buildPropertyAggregates(items, data.property_columns),
    [items, data.property_columns],
  );

  const selectedEntity = useComponentReviewStore((s) => s.selectedEntity);
  const drawerOpen = useComponentReviewStore((s) => s.drawerOpen);
  const openDrawer = useComponentReviewStore((s) => s.openDrawer);
  const closeDrawer = useComponentReviewStore((s) => s.closeDrawer);
  const selectedCell = useComponentReviewStore((s) => s.selectedCell);
  const cellEditMode = useComponentReviewStore((s) => s.cellEditMode);
  const selectComponentCell = useComponentReviewStore((s) => s.selectComponentCell);
  const selectAndEditComponentCell = useComponentReviewStore((s) => s.selectAndEditComponentCell);
  const cancelComponentEdit = useComponentReviewStore((s) => s.cancelComponentEdit);
  const commitComponentEdit = useComponentReviewStore((s) => s.commitComponentEdit);
  const clearComponentCell = useComponentReviewStore((s) => s.clearComponentCell);
  const [deleteTarget, setDeleteTarget] = useState<ComponentReviewItem | null>(null);
  const [deleteAllTarget, setDeleteAllTarget] = useState<DeleteTarget | null>(null);

  const overrideMut = useMutation<unknown, Error, ComponentOverrideMutationBody, ComponentOverrideMutationContext>({
    mutationFn: (body) =>
      api.post(`/review-components/${category}/component-override`, body),
    onMutate: async (body) => {
      const isIdentityProperty = String(body?.property || '').trim().startsWith('__');
      const hasRequiredId = isIdentityProperty
        ? Boolean(toPositiveId(body?.componentIdentityId))
        : Boolean(toPositiveId(body?.componentValueId));
      if (!hasRequiredId) return {};

      const queryKey = ['componentReviewData', category, data.componentType];
      const { selectedCell: cell } = useComponentReviewStore.getState();
      const idx = cell?.rowIndex ?? -1;
      const previousComponentReviewData = queryClient.getQueryData<ComponentReviewPayload>(queryKey);
      const row = previousComponentReviewData?.items?.[idx];
      const linkedProducts = row
        ? buildComponentReviewGridLinkedProducts({
          componentType: data.componentType,
          property: body.property,
          linkedProducts: row.linked_products ?? [],
        })
        : [];

      await Promise.all([
        queryClient.cancelQueries({ queryKey }),
        linkedProducts.length > 0 ? cancelLinkedReviewProductFields(queryClient, category) : Promise.resolve(),
      ]);

      queryClient.setQueryData<ComponentReviewPayload>(queryKey, (old) =>
        old && idx >= 0 && idx < old.items.length
          ? applyComponentOptimisticOverride(old, idx, body.property, body.value)
          : old,
      );

      const previousLinkedReviewProductFields = linkedProducts.length > 0
        ? updateLinkedReviewProductFields(queryClient, {
          category,
          field: body.property,
          linkedProducts,
          value: body.value,
          source: 'user',
          timestamp: new Date().toISOString(),
          acceptedCandidateId: null,
          overridden: true,
        })
        : undefined;

      return { previousComponentReviewData, previousLinkedReviewProductFields };
    },
    onError: (_error, _body, context) => {
      if (context?.previousComponentReviewData !== undefined) {
        queryClient.setQueryData(['componentReviewData', category, data.componentType], context.previousComponentReviewData);
      }
      if (context?.previousLinkedReviewProductFields) {
        restoreLinkedReviewProductFields(queryClient, context.previousLinkedReviewProductFields);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['componentReviewData', category, data.componentType] });
      queryClient.invalidateQueries({ queryKey: ['reviewProductsIndex', category] });
      queryClient.invalidateQueries({ queryKey: ['product', category] });
      invalidateComponentImpactForCategory({ queryClient, category });
    },
  });

  const overrideMutRef = useRef(overrideMut);
  overrideMutRef.current = overrideMut;

  const rowDeleteMut = useMutation<unknown, Error, ComponentRowDeleteMutationBody, ComponentRowDeleteMutationContext>({
    mutationFn: ({ item }) => {
      const componentIdentityId = toPositiveId(item.component_identity_id);
      if (!componentIdentityId) {
        throw new Error('component identity id is required for row delete');
      }
      return api.del(`/review-components/${category}/components/${encodeURIComponent(data.componentType)}/identity/${componentIdentityId}`);
    },
    onMutate: async ({ item }) => {
      const componentIdentityId = toPositiveId(item.component_identity_id);
      if (!componentIdentityId) return {};
      const queryKey = ['componentReviewData', category, data.componentType];
      await queryClient.cancelQueries({ queryKey });
      return {
        previousComponentReviewData: removeComponentReviewRowFromCache(queryClient, {
          category,
          componentType: data.componentType,
          componentIdentityId,
          name: item.name,
          maker: item.maker,
        }),
      };
    },
    onError: (_error, _body, context) => {
      if (context?.previousComponentReviewData) {
        restoreComponentReviewPayload(queryClient, context.previousComponentReviewData);
      }
    },
    onSuccess: () => {
      closeDrawer();
      clearComponentCell();
      queryClient.invalidateQueries({ queryKey: ['componentReviewData', category, data.componentType] });
      queryClient.invalidateQueries({ queryKey: ['componentReviewLayout', category] });
      queryClient.invalidateQueries({ queryKey: ['reviewProductsIndex', category] });
      queryClient.invalidateQueries({ queryKey: ['product', category] });
      invalidateComponentImpactForCategory({ queryClient, category });
    },
  });

  const componentTypeDeleteMut = useMutation<unknown, Error, void, ComponentTypeDeleteMutationContext>({
    mutationFn: () =>
      api.del(`/review-components/${category}/components/${encodeURIComponent(data.componentType)}/identities`),
    onMutate: async () => {
      const queryKey = ['componentReviewData', category, data.componentType];
      await queryClient.cancelQueries({ queryKey });
      return {
        previousComponentReviewData: removeAllComponentReviewRowsFromCache(queryClient, {
          category,
          componentType: data.componentType,
        }),
      };
    },
    onError: (_error, _body, context) => {
      if (context?.previousComponentReviewData) {
        restoreComponentReviewPayload(queryClient, context.previousComponentReviewData);
      }
    },
    onSuccess: () => {
      closeDrawer();
      clearComponentCell();
      queryClient.invalidateQueries({ queryKey: ['componentReviewData', category, data.componentType] });
      queryClient.invalidateQueries({ queryKey: ['componentReviewLayout', category] });
      queryClient.invalidateQueries({ queryKey: ['reviewProductsIndex', category] });
      queryClient.invalidateQueries({ queryKey: ['product', category] });
      invalidateComponentImpactForCategory({ queryClient, category });
    },
  });

  const handleCellClick = useCallback((row: ComponentReviewItem, columnId: string, visualIndex: number) => {
    const originalIndex = items.indexOf(row);
    const rowIndex = originalIndex >= 0 ? originalIndex : visualIndex;

    if (columnId === 'name') {
      openDrawer(data.componentType, row.name, row.maker, rowIndex);
      selectAndEditComponentCell(row.name, row.maker, '__name', row.name || '', rowIndex);
      return;
    }

    if (columnId === 'maker') {
      openDrawer(data.componentType, row.name, row.maker, rowIndex);
      selectAndEditComponentCell(row.name, row.maker, '__maker', row.maker || '', rowIndex);
      return;
    }

    if (columnId.startsWith('prop_')) {
      const property = columnId.replace(/^prop_/, '');
      openDrawer(data.componentType, row.name, row.maker, rowIndex);
      selectComponentCell(row.name, row.maker, property, rowIndex);
      return;
    }

    if (columnId === 'links') {
      openDrawer(data.componentType, row.name, row.maker, rowIndex);
      selectComponentCell(row.name, row.maker, '__links', rowIndex);
      return;
    }

    clearComponentCell();
    openDrawer(data.componentType, row.name, row.maker, rowIndex);
  }, [
    clearComponentCell,
    data.componentType,
    items,
    openDrawer,
    selectAndEditComponentCell,
    selectComponentCell,
  ]);

  const handleCommitEdit = useCallback(() => {
    const {
      selectedCell: cell,
      cellEditValue: editVal,
      originalCellEditValue: origVal,
    } = useComponentReviewStore.getState();

    if (cell && cell.property.startsWith('__') && editVal != null && editVal !== origVal) {
      const queryKey = ['componentReviewData', category, data.componentType] as const;
      const payload = queryClient.getQueryData<ComponentReviewPayload>(queryKey);
      const row = (
        Number.isFinite(Number(cell.rowIndex))
        && cell.rowIndex >= 0
        && payload?.items?.[cell.rowIndex]
      )
        ? payload.items[cell.rowIndex]
        : payload?.items?.find((entry) => entry.name === cell.name && entry.maker === cell.maker);
      const componentIdentityId = toPositiveId(row?.component_identity_id);
      if (!componentIdentityId) {
        commitComponentEdit();
        return;
      }

      overrideMutRef.current.mutate({
        componentType: data.componentType,
        name: cell.name,
        maker: cell.maker,
        property: cell.property,
        value: editVal,
        componentIdentityId,
      });
    }

    commitComponentEdit();
  }, [category, commitComponentEdit, data.componentType, queryClient]);

  const columns = useMemo<ColumnDef<ComponentReviewItem, unknown>[]>(() => {
    const cols: ColumnDef<ComponentReviewItem, unknown>[] = [
      {
        accessorKey: 'name',
        header: 'Name',
        size: 200,
        cell: ({ row }) => {
          const isSelected = isCellSelected(selectedCell, row.index, '__name');
          const isEditing = isSelected && cellEditMode;

          if (isEditing) {
            return (
              <ComponentEditingCell
                onCommit={handleCommitEdit}
                onCancel={cancelComponentEdit}
                className="w-full px-1 py-0.5 text-[11px] rounded font-semibold sf-component-inline-editor"
              />
            );
          }

          return (
            <IdentityValueCell
              value={row.original.name}
              selected={isSelected}
              className="font-semibold"
            />
          );
        },
      },
      {
        accessorKey: 'maker',
        header: 'Brand',
        size: 150,
        cell: ({ row }) => {
          const isSelected = isCellSelected(selectedCell, row.index, '__maker');
          const isEditing = isSelected && cellEditMode;

          if (isEditing) {
            return (
              <ComponentEditingCell
                onCommit={handleCommitEdit}
                onCancel={cancelComponentEdit}
                className="w-full px-1 py-0.5 text-[11px] rounded sf-component-inline-editor"
              />
            );
          }

          return (
            <IdentityValueCell
              value={row.original.maker}
              selected={isSelected}
            />
          );
        },
      },
      {
        id: 'aliases',
        header: 'Aliases',
        size: 180,
        accessorFn: (row) => row.aliases.join(', '),
        cell: ({ row }) => {
          const aliases = row.original.aliases;
          if (!aliases || aliases.length === 0) return null;
          return (
            <span className="text-[11px] sf-component-alias-text truncate block max-w-[180px]" title={aliases.join(', ')}>
              {aliases.join(', ')}
            </span>
          );
        },
      },
      {
        id: 'links',
        header: 'Links',
        size: 180,
        accessorFn: (row) => row.links_state?.candidate_count ?? 0,
        cell: ({ row }) => {
          const isSelected = isCellSelected(selectedCell, row.index, '__links');
          return (
            <ReviewValueCell
              state={row.original.links_state}
              selected={isSelected}
              valueMaxChars={28}
            />
          );
        },
      },
    ];

    for (const propKey of data.property_columns) {
      const aggregate = propertyAggregates.get(propKey);
      const varianceLabel = formatVarianceLabel(aggregate?.variancePolicy ?? null);
      const constraints = aggregate?.constraints ?? [];

      cols.push({
        id: `prop_${propKey}`,
        size: 160,
        header: () => (
          <span className="flex flex-col gap-0.5" title={propKey}>
            <span>{getLabel(propKey)}</span>
            {varianceLabel && (
              <span className="sf-text-micro sf-component-header-meta font-normal leading-tight">{varianceLabel}</span>
            )}
            {constraints.map((expr) => (
              <span key={expr} className="sf-text-micro sf-component-header-meta font-normal leading-tight">
                {formatConstraintLabel(expr)}
              </span>
            ))}
          </span>
        ),
        accessorFn: (row) => row.properties[propKey]?.selected?.value ?? '',
        cell: ({ row }) => {
          const state = row.original.properties[propKey];
          const isSelected = isCellSelected(selectedCell, row.index, propKey);
          return (
            <ReviewValueCell
              state={state}
              selected={isSelected}
              valueMaxChars={28}
            />
          );
        },
      });
    }

    cols.push({
      id: 'row_actions',
      header: () => (
        <div className="ml-auto flex justify-end">
          <ComponentReviewHeaderActionDrawer
            componentType={data.componentType}
            rowCount={items.length}
            onRequestDeleteAll={() => setDeleteAllTarget({
              kind: 'component-type-delete',
              label: data.componentType,
              count: items.length,
            })}
            deletePending={componentTypeDeleteMut.isPending}
          />
        </div>
      ),
      size: 170,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <ComponentReviewRowActionDrawer
            item={row.original}
            componentType={data.componentType}
            onRequestDelete={setDeleteTarget}
            deletePending={rowDeleteMut.isPending}
          />
        </div>
      ),
    });

    return cols;
  }, [
    cancelComponentEdit,
    cellEditMode,
    data.property_columns,
    data.componentType,
    componentTypeDeleteMut.isPending,
    getLabel,
    handleCommitEdit,
    items.length,
    propertyAggregates,
    rowDeleteMut.isPending,
    selectedCell,
  ]);

  const selectedItem = useMemo<ComponentReviewItem | null>(() => {
    if (!drawerOpen || !selectedEntity) return null;
    if (selectedEntity.rowIndex != null && selectedEntity.rowIndex >= 0 && selectedEntity.rowIndex < items.length) {
      const byIndex = items[selectedEntity.rowIndex];
      if (byIndex.name === selectedEntity.name && byIndex.maker === selectedEntity.maker) {
        return byIndex;
      }
      const byIdentity = items.find((item) => item.name === selectedEntity.name && item.maker === selectedEntity.maker) || null;
      return byIdentity || byIndex || null;
    }
    return items.find((item) => item.name === selectedEntity.name && item.maker === selectedEntity.maker) || null;
  }, [drawerOpen, selectedEntity, items]);

  const componentDeleteModalTarget = useMemo<DeleteTarget | null>(() => {
    if (deleteAllTarget) return deleteAllTarget;
    if (!deleteTarget) return null;
    return {
      kind: 'component-row-delete',
      label: `${deleteTarget.name}${deleteTarget.maker ? ` | ${deleteTarget.maker}` : ''}`,
      count: deleteTarget.linked_products?.length ?? 0,
    };
  }, [deleteAllTarget, deleteTarget]);

  const componentDrawerOpen = drawerOpen && selectedItem !== null;

  return (
    <Tooltip.Provider delayDuration={200}>
      <div className={`grid ${componentDrawerOpen ? 'grid-cols-[1fr,340px]' : 'grid-cols-1'} gap-3 min-w-0`}>
        <div className="min-w-0">
          <DataTable
            persistKey={`componentReview:table:${category}:${data.componentType}`}
            data={items}
            columns={columns}
            searchable
            maxHeight="max-h-[calc(100vh-320px)]"
            onCellClick={handleCellClick}
          />
        </div>

        {componentDrawerOpen && selectedItem && (
          <ComponentReviewDrawer
            item={selectedItem}
            componentType={data.componentType}
            category={category}
            onClose={closeDrawer}
            queryClient={queryClient}
            focusedProperty={
              selectedCell?.rowIndex != null
              && selectedEntity?.rowIndex != null
              && selectedCell.rowIndex === selectedEntity.rowIndex
                ? selectedCell.property
                : undefined
            }
            rowIndex={selectedEntity?.rowIndex}
            propertyColumns={data.property_columns}
          />
        )}
        {componentDeleteModalTarget && (
          <FinderDeleteConfirmModal
            target={componentDeleteModalTarget}
            onConfirm={() => {
              if (deleteAllTarget) {
                void componentTypeDeleteMut.mutateAsync()
                  .then(() => setDeleteAllTarget(null))
                  .catch((err: unknown) => {
                    const message = err instanceof Error ? err.message : String(err || 'Unknown error');
                    window.alert(`Delete failed: ${message}`);
                  });
                return;
              }
              if (deleteTarget) {
                void rowDeleteMut.mutateAsync({ item: deleteTarget })
                  .then(() => setDeleteTarget(null))
                  .catch((err: unknown) => {
                    const message = err instanceof Error ? err.message : String(err || 'Unknown error');
                    window.alert(`Delete failed: ${message}`);
                  });
              }
            }}
            onCancel={() => {
              setDeleteTarget(null);
              setDeleteAllTarget(null);
            }}
            isPending={rowDeleteMut.isPending || componentTypeDeleteMut.isPending}
            moduleLabel="Component Review"
            confirmLabel="Delete"
          />
        )}
      </div>
    </Tooltip.Provider>
  );
}
