import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, type QueryClient } from '@tanstack/react-query';
import * as Tooltip from '@radix-ui/react-tooltip';
import { api } from '../../api/client';
import { ActionTooltip } from '../../components/common/ActionTooltip';
import { InlineCellEditor } from '../../components/common/InlineCellEditor';
import { ReviewValueCell, type ReviewValueCellState } from '../../components/common/ReviewValueCell';
import { CellDrawer } from '../../components/common/CellDrawer';
import { FlagIcon } from '../../components/common/FlagIcon';
import { FlagsSection } from '../../components/common/FlagsSection';
import { usePersistedToggle } from '../../stores/collapseStore';
import { usePersistedTab } from '../../stores/tabStore';
import { LinkedProductsList } from '../../components/common/LinkedProductsList';
import { useComponentReviewStore } from '../../stores/componentReviewStore';
import { hasKnownValue } from '../../utils/fieldNormalize';
import { useFieldLabels } from '../../hooks/useFieldLabels';
import { sourceBadgeClass, SOURCE_BADGE_FALLBACK } from '../../utils/colors';
import {
  invalidateEnumAuthorityQueries,
  invalidateEnumReviewDataQuery,
  setEnumReviewQueryData,
} from './enumReviewStore.js';
import type { EnumReviewPayload, EnumFieldReview, EnumValueReviewItem } from '../../types/componentReview';

interface EnumSubTabProps {
  data: EnumReviewPayload;
  category: string;
  queryClient: QueryClient;
  debugLinkedProducts?: boolean;
}

interface EnumConsistencyResponse {
  decisions?: Array<{
    value: string;
    decision: 'map_to_existing' | 'keep_new' | 'uncertain';
    target_value?: string | null;
    confidence?: number;
    reasoning?: string;
  }>;
  applied?: {
    mapped: number;
    kept: number;
    uncertain: number;
    changed: number;
  };
  skipped_reason?: string | null;
}

function enumToCellState(valueItem: EnumValueReviewItem): ReviewValueCellState {
  return {
    selected: {
      value: valueItem.value,
      confidence: valueItem.confidence,
      color: valueItem.color,
    },
    needs_review: valueItem.needs_review,
    reason_codes: valueItem.needs_review ? ['needs_review'] : [],
    source: valueItem.source,
  };
}

function hasActionablePending(item: EnumValueReviewItem): boolean {
  if (!item?.needs_review) return false;
  const candidateRows = (item.candidates || []).filter((candidate) => {
    const candidateId = String(candidate?.candidate_id || '').trim();
    return Boolean(candidateId) && hasKnownValue(candidate?.value);
  });
  return candidateRows.some((candidate) => {
    if (candidate?.is_synthetic_selected) return false;
    const sharedStatus = String(candidate?.shared_review_status || '').trim().toLowerCase();
    return sharedStatus ? sharedStatus === 'pending' : true;
  });
}

function toPositiveId(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const id = Math.trunc(n);
  return id > 0 ? id : null;
}

function FieldListItem({
  field,
  isSelected,
  onClick,
  getLabel,
}: {
  field: EnumFieldReview;
  isSelected: boolean;
  onClick: () => void;
  getLabel: (key: string) => string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between rounded transition-colors ${
        isSelected
          ? 'sf-review-enum-field-selected'
          : 'sf-review-enum-field-idle'
      }`}
    >
      <span className="truncate">{getLabel(field.field)}</span>
      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
        <span className="sf-text-nano sf-text-muted">{field.metrics.total}</span>
        {(() => {
          const pipelineReviewCount = field.values.filter((v) => hasActionablePending(v) && v.source === 'pipeline').length;
          const otherFlagCount = field.metrics.flags - pipelineReviewCount;
          return (
            <>
              {pipelineReviewCount > 0 && (
                <span className="px-1.5 py-0.5 sf-text-nano sf-chip-accent rounded">
                  {pipelineReviewCount} AI
                </span>
              )}
              {otherFlagCount > 0 && (
                <span className="px-1.5 py-0.5 sf-text-nano sf-chip-danger rounded">
                  {otherFlagCount}
                </span>
              )}
            </>
          );
        })()}
      </div>
    </button>
  );
}

const sourceBadge = sourceBadgeClass;

function ValueRow({
  item,
  isEditing,
  isSelected,
  editText,
  onEditChange,
  onEditCommit,
  onEditCancel,
  onRunAIReview,
  aiPending,
  onClick,
  debugLinkedProducts,
}: {
  item: EnumValueReviewItem;
  isEditing: boolean;
  isSelected: boolean;
  editText: string;
  onEditChange: (v: string) => void;
  onEditCommit: () => void;
  onEditCancel: () => void;
  onRunAIReview: () => void;
  aiPending: boolean;
  onClick: () => void;
  debugLinkedProducts: boolean;
}) {
  const [linksExpanded, toggleLinksExpanded] = usePersistedToggle(`componentReview:enumRow:${item.value}:links`, false);
  const linkedCount = item.linked_products?.length ?? 0;

  if (isEditing) {
    return (
      <div className="w-full px-3 py-1 flex items-center gap-2 rounded sf-callout sf-callout-info">
        <InlineCellEditor
          value={editText}
          onChange={onEditChange}
          onCommit={onEditCommit}
          onCancel={onEditCancel}
          className="w-48 max-w-[50%] px-2 py-0.5 sf-text-label sf-review-enum-inline-editor"
          stopClickPropagation
        />
        <span className={`ml-auto px-1.5 py-0.5 rounded sf-text-nano font-medium flex-shrink-0 ${sourceBadge[item.source] || SOURCE_BADGE_FALLBACK}`}>
          {item.source}
        </span>
      </div>
    );
  }

  const isPipelineReview = hasActionablePending(item) && item.source === 'pipeline';

  return (
    <div>
      <button
        onClick={onClick}
        className={`w-full text-left px-3 py-1 flex items-center gap-2 rounded transition-colors ${
          isSelected
            ? 'sf-review-enum-row-selected'
            : isPipelineReview
              ? 'sf-review-enum-row-pipeline'
              : 'sf-review-enum-row-default'
        } ${item.needs_review ? (isPipelineReview ? 'sf-review-enum-row-flag-ai' : 'sf-review-enum-row-flag-review') : ''}`}
      >
        {item.needs_review && (
          <span className={`inline-flex items-center flex-shrink-0 ${isPipelineReview ? 'sf-status-text-info' : 'sf-status-text-warning'}`} title="Needs review">
            <FlagIcon className="w-2.5 h-2.5" />
          </span>
        )}
        <ReviewValueCell
          state={enumToCellState(item)}
          className="flex-1 min-w-0"
          valueMaxChars={linkedCount > 0 ? 36 : 48}
          showConfidence
          pendingAI={isPipelineReview}
          showLinkedProductBadge={debugLinkedProducts}
          linkedProductCount={linkedCount}
        />
        {linkedCount > 0 && (
          <span
            onClick={(e) => { e.stopPropagation(); toggleLinksExpanded(); }}
            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded sf-text-nano font-medium flex-shrink-0 cursor-pointer transition-colors ${
              linksExpanded
                ? 'sf-review-enum-linked-chip-open'
                : 'sf-review-enum-linked-chip'
            }`}
            title={`${linkedCount} linked product${linkedCount !== 1 ? 's' : ''} - click to ${linksExpanded ? 'collapse' : 'expand'}`}
          >
            <span className="sf-text-micro">{linksExpanded ? '\u25BC' : '\u25B6'}</span>
            {linkedCount}p
          </span>
        )}
        <ActionTooltip text="Run AI Review for pending list/component matches in this enum field.">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRunAIReview();
            }}
            disabled={aiPending}
            className="px-1.5 py-0.5 rounded sf-text-nano font-medium sf-run-ai-button disabled:opacity-50 flex-shrink-0"
          >
            {aiPending ? '...' : 'Run AI'}
          </button>
        </ActionTooltip>
        <span className={`px-1.5 py-0.5 rounded sf-text-nano font-medium flex-shrink-0 ${sourceBadge[item.source] || SOURCE_BADGE_FALLBACK}`}>
          {item.source}
        </span>
      </button>
      {linksExpanded && item.linked_products && item.linked_products.length > 0 && (
        <div className="ml-6 mr-2 mb-1">
          <LinkedProductsList
            products={item.linked_products}
            headerLabel={item.value}
            maxHeight={160}
            defaultExpanded
          />
        </div>
      )}
    </div>
  );
}

export function EnumSubTab({
  data,
  category,
  queryClient,
  debugLinkedProducts = false,
}: EnumSubTabProps) {
  const { getLabel } = useFieldLabels(category);
  const enumFieldIds = useMemo(
    () => data.fields.map((field) => field.field),
    [data.fields],
  );
  const enumFieldPersistKey = `componentReview:enumField:${category}`;
  const [persistedEnumField, setPersistedEnumField] = usePersistedTab<string>(
    enumFieldPersistKey,
    '',
    { validValues: enumFieldIds },
  );
  // Individual selectors to avoid re-renders from unrelated store changes
  const selectedEnumField = useComponentReviewStore((s) => s.selectedEnumField);
  const setSelectedEnumField = useComponentReviewStore((s) => s.setSelectedEnumField);
  const enumDrawerOpen = useComponentReviewStore((s) => s.enumDrawerOpen);
  const openEnumDrawer = useComponentReviewStore((s) => s.openEnumDrawer);
  const closeEnumDrawer = useComponentReviewStore((s) => s.closeEnumDrawer);
  const selectedEnumValue = useComponentReviewStore((s) => s.selectedEnumValue);
  const [newValue, setNewValue] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [selectedValueIndex, setSelectedValueIndex] = useState<number | null>(null);
  const [consistencyMessage, setConsistencyMessage] = useState('');
  const [consistencyError, setConsistencyError] = useState('');

  // ── Drawer mutations (moved from EnumReviewDrawer) ──────────────
  function optimisticAccept(field: string, valueIndex: number, candidateId?: string | null, candidateValue?: string) {
    const now = new Date().toISOString();
    setEnumReviewQueryData(
      queryClient,
      category,
      (old) => {
        if (!old) return old;
        return {
          ...old,
          fields: old.fields.map((f) => {
            if (f.field !== field) return f;
            const nextValues = f.values.map((v, i) =>
              i === valueIndex
                ? {
                  ...v,
                  value: candidateValue ?? v.value,
                  confidence: 1.0,
                  color: 'green' as const,
                  // Accept must not implicitly confirm shared AI.
                  needs_review: v.needs_review,
                  source_timestamp: now,
                  overridden: false,
                  accepted_candidate_id: candidateId ?? null,
                }
                : v,
            );
            return {
              ...f,
              values: nextValues,
              metrics: {
                ...f.metrics,
                flags: nextValues.filter((v) => v.needs_review).length,
              },
            };
          }),
        };
      },
    );
  }

  function optimisticRemove(field: string, valueIndex: number) {
    setEnumReviewQueryData(
      queryClient,
      category,
      (old) => {
        if (!old) return old;
        return {
          ...old,
          fields: old.fields.map((f) => {
            if (f.field !== field) return f;
            const newValues = f.values.filter((_, i) => i !== valueIndex);
            return {
              ...f,
              values: newValues,
              metrics: { total: newValues.length, flags: newValues.filter((v) => v.needs_review).length },
            };
          }),
        };
      },
    );
  }

  const acceptMutation = useMutation({
    mutationFn: (body: {
      field: string;
      action: string;
      value: string;
      candidateId?: string;
      candidateSource?: string;
      oldValue?: string;
      listValueId?: number;
      enumListId?: number;
    }) =>
      api.post(`/review-components/${category}/enum-override`, body),
    onSuccess: () => {
      invalidateEnumAuthorityQueries(queryClient, category);
    },
    onError: () => {
      invalidateEnumReviewDataQuery(queryClient, category);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (body: { field: string; action: string; value: string; listValueId?: number; enumListId?: number }) =>
      api.post(`/review-components/${category}/enum-override`, body),
    onSuccess: () => {
      invalidateEnumAuthorityQueries(queryClient, category);
      closeEnumDrawer();
    },
    onError: () => {
      invalidateEnumReviewDataQuery(queryClient, category);
    },
  });

  const drawerRenameMutation = useMutation({
    mutationFn: ({
      field,
      oldValue,
      newValue: newVal,
      listValueId,
      enumListId,
    }: {
      field: string;
      oldValue: string;
      newValue: string;
      valueIndex?: number;
      listValueId?: number;
      enumListId?: number;
    }) => api.post(`/review-components/${category}/enum-rename`, {
      field,
      oldValue,
      newValue: newVal,
      listValueId,
      enumListId,
    }),
    onMutate: async ({ field, newValue: newVal, valueIndex, listValueId }) => {
      if (!toPositiveId(listValueId)) return;
      setEnumReviewQueryData(
        queryClient,
        category,
        (old) => {
          if (!old) return old;
          return {
            ...old,
            fields: old.fields.map((f) => {
              if (f.field !== field) return f;
              return { ...f, values: f.values.map((v, i) => (valueIndex != null ? i === valueIndex : false) ? { ...v, value: newVal } : v) };
            }),
          };
        },
      );
    },
    onSuccess: () => {
      invalidateEnumAuthorityQueries(queryClient, category);
    },
    onError: () => {
      invalidateEnumReviewDataQuery(queryClient, category);
    },
  });

  // AI review batch mutation for enum pipeline values
  const aiReviewBatchMut = useMutation({
    mutationFn: () =>
      api.post(`/review-components/${category}/run-component-review-batch`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['componentReview', category] });
      invalidateEnumAuthorityQueries(queryClient, category, { includeStudioKnownValues: false });
    },
  });

  const enumConsistencyMut = useMutation({
    mutationFn: (body: { field: string; apply?: boolean }) =>
      api.post<EnumConsistencyResponse>(`/review-components/${category}/enum-consistency`, body),
    onMutate: () => {
      setConsistencyMessage('');
      setConsistencyError('');
    },
    onSuccess: (result) => {
      invalidateEnumAuthorityQueries(queryClient, category);
      const changed = Number(result?.applied?.changed || 0);
      if (changed > 0) {
        setConsistencyMessage(`Consistency applied ${changed} change${changed === 1 ? '' : 's'}.`);
      } else if (result?.skipped_reason) {
        setConsistencyMessage(`Consistency skipped: ${String(result.skipped_reason).replace(/_/g, ' ')}.`);
      } else {
        setConsistencyMessage('Consistency finished with no changes.');
      }
    },
    onError: (error) => {
      setConsistencyError((error as Error)?.message || 'Consistency run failed.');
      invalidateEnumReviewDataQuery(queryClient, category);
    },
  });

  useEffect(() => {
    if (enumFieldIds.length === 0) return;
    const hasSelected = enumFieldIds.includes(selectedEnumField);
    const hasPersisted = enumFieldIds.includes(persistedEnumField);
    const nextField = hasSelected
      ? selectedEnumField
      : (hasPersisted ? persistedEnumField : enumFieldIds[0]);
    if (!hasSelected) {
      setSelectedEnumField(nextField);
    }
    if (persistedEnumField !== nextField) {
      setPersistedEnumField(nextField);
    }
  }, [
    enumFieldIds,
    selectedEnumField,
    persistedEnumField,
    setSelectedEnumField,
    setPersistedEnumField,
  ]);

  const selectedFieldData = useMemo(
    () => data.fields.find((field) => field.field === selectedEnumField),
    [data.fields, selectedEnumField],
  );

  const resolvedSelectedValueIndex = useMemo(() => {
    if (!selectedFieldData) return null;
    const token = String(selectedEnumValue || '').trim().toLowerCase();
    if (token) {
      const idxByValue = selectedFieldData.values.findIndex((v) => String(v.value || '').trim().toLowerCase() === token);
      if (idxByValue >= 0) return idxByValue;
    }
    if (
      selectedValueIndex != null
      && selectedValueIndex >= 0
      && selectedValueIndex < selectedFieldData.values.length
    ) {
      return selectedValueIndex;
    }
    return null;
  }, [selectedFieldData, selectedEnumValue, selectedValueIndex]);

  const selectedValueItem = useMemo(
    () => resolvedSelectedValueIndex != null && selectedFieldData ? selectedFieldData.values[resolvedSelectedValueIndex] ?? null : null,
    [selectedFieldData, resolvedSelectedValueIndex],
  );

  const handleEnumEditCommit = useCallback(async () => {
    if (editingIndex == null || !editText.trim() || !selectedEnumField || !selectedFieldData) return;
    const oldVal = selectedFieldData.values[editingIndex]?.value;
    if (!oldVal || editText.trim() === oldVal) { setEditingIndex(null); return; }
    const slotId = toPositiveId(selectedFieldData.values[editingIndex]?.list_value_id);
    if (!slotId) {
      setEditingIndex(null);
      return;
    }

    const trimmed = editText.trim();
    const field = selectedEnumField;
    const idx = editingIndex;

    // Optimistic rename in cache — match by index
    setEnumReviewQueryData(queryClient, category, (old) => {
      if (!old) return old;
      return {
        ...old,
        fields: old.fields.map((f) => {
          if (f.field !== field) return f;
          return { ...f, values: f.values.map((v, i) => i === idx ? { ...v, value: trimmed } : v) };
        }),
      };
    });

    try {
      const enumListId = toPositiveId(selectedFieldData.enum_list_id);
      await api.post(`/review-components/${category}/enum-rename`, {
        field,
        oldValue: oldVal,
        newValue: trimmed,
        listValueId: slotId,
        enumListId: enumListId ?? undefined,
      });
    } catch (err) {
      console.error('Enum rename failed:', err);
    } finally {
      invalidateEnumAuthorityQueries(queryClient, category);
    }
    setEditingIndex(null);
  }, [editingIndex, editText, selectedEnumField, selectedFieldData, queryClient, category]);

  const handleAddValue = useCallback(async () => {
    if (!newValue.trim() || !selectedEnumField) return;
    const enumListId = toPositiveId(selectedFieldData?.enum_list_id);
    if (!enumListId) return;

    const trimmed = newValue.trim();
    const field = selectedEnumField;

    // Optimistic add to cache
    const now = new Date().toISOString();
    setEnumReviewQueryData(queryClient, category, (old) => {
      if (!old) return old;
      return {
        ...old,
        fields: old.fields.map((f) => {
          if (f.field !== field) return f;
          const newValues = [...f.values, { value: trimmed, source: 'manual' as const, source_timestamp: now, confidence: 1.0, color: 'green' as const, needs_review: false, candidates: [] }];
          return { ...f, values: newValues, metrics: { total: newValues.length, flags: f.values.filter((v) => v.needs_review).length } };
        }),
      };
    });

    try {
      await api.post(`/review-components/${category}/enum-override`, {
        field,
        action: 'add',
        value: trimmed,
        enumListId,
      });
    } catch (err) {
      console.error('Failed to add enum value:', err);
    } finally {
      invalidateEnumAuthorityQueries(queryClient, category);
    }
    setNewValue('');
  }, [newValue, selectedEnumField, selectedFieldData, queryClient, category]);

  const handleValueClick = useCallback((valueItem: EnumValueReviewItem, valueIndex: number) => {
    if (!selectedFieldData) return;
    // If already selected, enter edit mode
    if (selectedValueIndex === valueIndex && enumDrawerOpen) {
      setEditingIndex(valueIndex);
      setEditText(valueItem.value);
      return;
    }
    // First click: select + open drawer
    setSelectedValueIndex(valueIndex);
    openEnumDrawer(selectedFieldData.field, valueItem.value);
    setEditingIndex(null);
  }, [selectedFieldData, selectedValueIndex, enumDrawerOpen, openEnumDrawer]);

  return (
    <Tooltip.Provider delayDuration={200}>
      <div className="grid grid-cols-[220px,1fr] gap-3" style={{ minHeight: '400px' }}>
        <div className="border sf-border-default rounded-lg overflow-y-auto max-h-[calc(100vh-320px)]">
          <div className="sticky top-0 sf-surface-elevated px-3 py-2 border-b sf-border-default">
            <p className="text-xs font-medium sf-text-muted">Fields ({data.fields.length})</p>
          </div>
          <div className="p-1 space-y-0.5">
            {[...data.fields].sort((a, b) => a.field.localeCompare(b.field)).map((field) => (
              <FieldListItem
                key={field.field}
                field={field}
                isSelected={field.field === selectedEnumField}
                getLabel={getLabel}
                onClick={() => {
                  setSelectedEnumField(field.field);
                  setPersistedEnumField(field.field);
                  closeEnumDrawer();
                  setEditingIndex(null);
                  setSelectedValueIndex(null);
                }}
              />
            ))}
          </div>
        </div>

        <div className={`grid ${enumDrawerOpen && selectedValueItem ? 'grid-cols-[1fr,320px]' : 'grid-cols-1'} gap-3 min-w-0`}>
          <div className="border sf-border-default rounded-lg overflow-y-auto max-h-[calc(100vh-320px)] min-w-0">
            {selectedFieldData ? (
              <>
                <div className="sticky top-0 sf-surface-elevated px-3 py-2 border-b sf-border-default flex items-center justify-between">
                  <p className="text-xs font-medium sf-text-muted">
                    {getLabel(selectedFieldData.field)} - {selectedFieldData.values.length} values
                  </p>
                  {(() => {
                    const pipelineCount = selectedFieldData.values.filter((v) => hasActionablePending(v) && v.source === 'pipeline').length;
                    const otherCount = selectedFieldData.metrics.flags - pipelineCount;
                    return (
                      <div className="flex items-center gap-1.5">
                        <div className="flex items-center gap-1">
                          <ActionTooltip text="Apply enum consistency normalization using configured format rules. Uses Key Navigator placeholders like XXXX and YYYY when available.">
                            <button
                              onClick={() => enumConsistencyMut.mutate({ field: selectedFieldData.field, apply: true })}
                              disabled={enumConsistencyMut.isPending}
                              className="px-2 py-0.5 sf-llm-soft-button sf-text-nano rounded disabled:opacity-50"
                            >
                              {enumConsistencyMut.isPending ? 'Consistency...' : 'Consistency'}
                            </button>
                          </ActionTooltip>
                        </div>
                        <ActionTooltip text="Run AI Review across enum values with pending shared/component matches. This does not change accepted values until you accept or confirm.">
                          <button
                            onClick={() => aiReviewBatchMut.mutate()}
                            disabled={aiReviewBatchMut.isPending}
                            className="px-2 py-0.5 sf-run-ai-button sf-text-nano rounded disabled:opacity-50"
                          >
                            {aiReviewBatchMut.isPending ? 'Running...' : 'Run AI Review'}
                          </button>
                        </ActionTooltip>
                        {pipelineCount > 0 && (
                          <span className="px-1.5 py-0.5 sf-chip-accent sf-text-nano rounded">
                            {pipelineCount} AI review
                          </span>
                        )}
                        {otherCount > 0 && (
                          <span className="px-1.5 py-0.5 sf-chip-warning sf-text-nano rounded">
                            {otherCount} needs review
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
                {consistencyMessage ? (
                  <div className="px-3 py-1 sf-text-label sf-status-text-info">{consistencyMessage}</div>
                ) : null}
                {consistencyError ? (
                  <div className="px-3 py-1 sf-text-label sf-status-text-danger">{consistencyError}</div>
                ) : null}
                <div className="p-1 space-y-0.5">
                  {selectedFieldData.values.map((valueItem, valueIndex) => (
                    <ValueRow
                      key={`${valueItem.value}-${valueIndex}`}
                      item={valueItem}
                      isEditing={editingIndex === valueIndex}
                      isSelected={resolvedSelectedValueIndex === valueIndex && enumDrawerOpen}
                      editText={editText}
                      onEditChange={setEditText}
                      onEditCommit={() => { void handleEnumEditCommit(); }}
                      onEditCancel={() => { setEditingIndex(null); }}
                      onRunAIReview={() => aiReviewBatchMut.mutate()}
                      aiPending={aiReviewBatchMut.isPending}
                      onClick={() => handleValueClick(valueItem, valueIndex)}
                      debugLinkedProducts={debugLinkedProducts}
                    />
                  ))}
                </div>

                <div className="sticky bottom-0 sf-surface-elevated border-t sf-border-default p-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newValue}
                      onChange={(event) => setNewValue(event.target.value)}
                      className="flex-1 sf-drawer-input text-sm"
                      placeholder="Add new value..."
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && newValue.trim()) {
                          void handleAddValue();
                        }
                      }}
                    />
                    <button
                      onClick={() => { void handleAddValue(); }}
                      disabled={!newValue.trim()}
                      className="px-3 py-1 text-sm sf-primary-button rounded disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full sf-text-muted text-sm">
                Select a field from the list
              </div>
            )}
          </div>

          {enumDrawerOpen && selectedValueItem && selectedFieldData && resolvedSelectedValueIndex != null && (() => {
            const vi = selectedValueItem;
            const fd = selectedFieldData;
            const viIndex = resolvedSelectedValueIndex;
            const listValueId = toPositiveId(vi.list_value_id);
            const enumListId = toPositiveId(fd.enum_list_id);
            const canMutateValueSlot = Boolean(listValueId);
            const drawerBadges: Array<{ label: string; className: string }> = [];
            if (vi.needs_review) {
              drawerBadges.push({ label: 'needs_review', className: 'sf-chip-warning' });
            }
            const hasMeaningfulValue = hasKnownValue(vi.value);
            const isAccepted = hasMeaningfulValue
              && !vi.needs_review
              && (vi.source === 'manual' || vi.source === 'reference' || Boolean(vi.accepted_candidate_id));
            const drawerIsPending = acceptMutation.isPending || removeMutation.isPending || drawerRenameMutation.isPending;

            const extraActions = (
              <button
                onClick={() => {
                  // Capture values, fire mutation first, then update UI
                  const field = fd.field;
                  const value = vi.value;
                  const idx = viIndex;
                  removeMutation.mutate({
                    field,
                    action: 'remove',
                    value,
                    listValueId: listValueId ?? undefined,
                    enumListId: enumListId ?? undefined,
                  });
                  optimisticRemove(field, idx);
                  setSelectedValueIndex(null);
                }}
                disabled={removeMutation.isPending || !canMutateValueSlot}
                className="w-full px-3 py-1.5 text-sm sf-danger-button-solid rounded disabled:opacity-50"
              >
                {removeMutation.isPending ? 'Removing...' : 'Remove Value'}
              </button>
            );

            const hasSharedPending = hasActionablePending(vi);
            const pendingSharedCandidateIds = hasSharedPending
              ? (() => {
                const candidates = (vi.candidates || []).filter((candidate) => {
                  const candidateId = String(candidate?.candidate_id || '').trim();
                  return Boolean(candidateId) && hasKnownValue(candidate?.value);
                });
                const pendingCandidates = candidates.filter((candidate) => {
                  if (candidate?.is_synthetic_selected) return false;
                  const sharedStatus = String(candidate?.shared_review_status || '').trim().toLowerCase();
                  return !sharedStatus || sharedStatus === 'pending';
                });
                const matches = pendingCandidates
                  .map((candidate) => String(candidate?.candidate_id || '').trim())
                  .filter(Boolean);
                return [...new Set(matches)];
              })()
              : [];
            const fallbackSharedConfirmCandidateId = String(
              vi.accepted_candidate_id
              || pendingSharedCandidateIds[0]
              || '',
            ).trim() || undefined;

            return (
              <CellDrawer
                title={vi.value}
                subtitle={getLabel(fd.field)}
                onClose={closeEnumDrawer}
                currentValue={{
                  value: vi.value,
                  confidence: vi.confidence,
                  color: vi.color,
                  source: vi.source,
                  sourceTimestamp: vi.source_timestamp,
                  overridden: vi.source === 'manual',
                  acceptedCandidateId: vi.accepted_candidate_id ?? null,
                }}
                badges={drawerBadges}
                isCurrentAccepted={isAccepted}
                pendingAIConfirmation={hasSharedPending}
                pendingSharedCandidateIds={pendingSharedCandidateIds}
                candidateUiContext="shared"
                showCandidateDebugIds={debugLinkedProducts}
                onManualOverride={(newVal) => {
                  if (!canMutateValueSlot) return;
                  const trimmed = String(newVal || '').trim();
                  if (!trimmed) return;
                  openEnumDrawer(fd.field, trimmed);
                  setSelectedValueIndex(viIndex);
                  drawerRenameMutation.mutate({
                    field: fd.field,
                    oldValue: vi.value,
                    newValue: trimmed,
                    valueIndex: viIndex,
                    listValueId: listValueId ?? undefined,
                    enumListId: enumListId ?? undefined,
                  });
                }}
                manualOverrideLabel="Rename Value"
                manualOverridePlaceholder="Enter corrected value..."
                isPending={drawerIsPending}
                candidates={vi.candidates ?? []}
                onAcceptCandidate={canMutateValueSlot ? (candidateId, candidate) => {
                  const cid = String(candidateId || '').trim();
                  const acceptedValue = String(candidate.value ?? '').trim();
                  if (!cid || !acceptedValue) return;
                  optimisticAccept(fd.field, viIndex, candidateId, acceptedValue);
                  openEnumDrawer(fd.field, acceptedValue);
                  setSelectedValueIndex(viIndex);
                  acceptMutation.mutate({
                    field: fd.field,
                    action: 'accept',
                    value: acceptedValue,
                    oldValue: String(vi.value ?? '').trim(),
                    candidateId,
                    candidateSource: candidate.source_id || candidate.source || '',
                    listValueId: listValueId ?? undefined,
                    enumListId: enumListId ?? undefined,
                  });
                } : undefined}
                onConfirmSharedCandidate={hasSharedPending && canMutateValueSlot ? (candidateId, candidate) => {
                  const candidateValue = String(candidate?.value ?? '').trim();
                  const confirmValue = candidateValue || String(vi.value ?? '').trim();
                  if (!confirmValue) return;
                  acceptMutation.mutate({
                    field: fd.field,
                    action: 'confirm',
                    value: confirmValue,
                    candidateId: String(candidateId || '').trim() || undefined,
                    candidateSource: candidate.source_id || candidate.source || '',
                    listValueId: listValueId ?? undefined,
                    enumListId: enumListId ?? undefined,
                  });
                } : undefined}
                onConfirmShared={hasSharedPending && canMutateValueSlot ? () => {
                  const confirmValue = String(vi.value ?? '').trim();
                  if (!confirmValue) return;
                  acceptMutation.mutate({
                    field: fd.field,
                    action: 'confirm',
                    value: confirmValue,
                    candidateId: fallbackSharedConfirmCandidateId,
                    listValueId: listValueId ?? undefined,
                    enumListId: enumListId ?? undefined,
                  });
                } : undefined}
                extraActions={extraActions}
                extraSections={
                  <>
                    {vi.needs_review && <FlagsSection reasonCodes={['needs_review']} />}
                    {vi.linked_products && vi.linked_products.length > 0 && (
                      <LinkedProductsList
                        products={vi.linked_products}
                        headerLabel={[vi.normalized_value, vi.enum_policy].filter(Boolean).join(', ') || 'Value'}
                        maxHeight={180}
                        defaultExpanded
                      />
                    )}
                    {debugLinkedProducts && (
                      <div className="px-3 py-2 sf-callout sf-callout-info rounded sf-text-nano space-y-0.5">
                        <div>{`field: ${fd.field}`}</div>
                        <div>{`value: ${vi.value}`}</div>
                        <div>{`listValueId: ${listValueId ?? 'n/a'}`}</div>
                        <div>{`enumListId: ${enumListId ?? 'n/a'}`}</div>
                      </div>
                    )}
                  </>
                }
              />
            );
          })()}
        </div>
      </div>
    </Tooltip.Provider>
  );
}
