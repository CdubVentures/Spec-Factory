import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, type QueryClient } from '@tanstack/react-query';
import * as Tooltip from '@radix-ui/react-tooltip';
import { api } from '../../api/client.ts';
import { ActionTooltip } from '../../shared/ui/feedback/ActionTooltip.tsx';
import { InlineCellEditor } from '../../shared/ui/forms/InlineCellEditor.tsx';
import { ReviewValueCell, type ReviewValueCellState } from '../../shared/ui/data-display/ReviewValueCell.tsx';
import { CellDrawer } from '../../shared/ui/overlay/CellDrawer.tsx';
import { FlagIcon } from '../../shared/ui/icons/FlagIcon.tsx';
import { FlagsSection } from '../../shared/ui/feedback/FlagsSection.tsx';
import { usePersistedToggle } from '../../stores/collapseStore.ts';
import { usePersistedTab } from '../../stores/tabStore.ts';
import { LinkedProductsList } from './LinkedProductsList.tsx';
import { useComponentReviewStore } from '../../stores/componentReviewStore.ts';
import { hasKnownValue } from '../../utils/fieldNormalize.ts';
import { useFieldLabels } from '../../hooks/useFieldLabels.ts';
import { sourceBadgeClass, SOURCE_BADGE_FALLBACK } from '../../utils/colors.ts';
import {
  getEnumReviewQueryKey,
  invalidateEnumAuthorityQueries,
  invalidateEnumReviewDataQuery,
  setEnumReviewQueryData,
} from './enumReviewStore.js';
import { useFieldRulesStore } from '../../features/studio/state/useFieldRulesStore.ts';
import {
  cancelLinkedReviewProductFields,
  clearLinkedReviewProductFields,
  restoreLinkedReviewProductFields,
  updateLinkedReviewProductFields,
  type LinkedReviewProductFieldSnapshot,
} from './componentReviewCache.ts';
import type { EnumReviewPayload, EnumFieldReview, EnumValueReviewItem, LinkedProduct } from '../../types/componentReview.ts';

interface EnumSubTabProps {
  data: EnumReviewPayload;
  category: string;
  queryClient: QueryClient;
  debugLinkedProducts?: boolean;
}

interface EnumAcceptMutationBody {
  field: string;
  action: string;
  value: string;
  candidateId?: string;
  candidateSource?: string;
  oldValue?: string;
  listValueId?: number;
  enumListId?: number;
  valueIndex?: number;
  linkedProducts?: readonly LinkedProduct[];
}

interface EnumRemoveMutationBody {
  field: string;
  action: string;
  value: string;
  listValueId?: number;
  enumListId?: number;
  valueIndex?: number;
  linkedProducts?: readonly LinkedProduct[];
}

interface EnumRenameMutationBody {
  field: string;
  oldValue: string;
  newValue: string;
  valueIndex?: number;
  listValueId?: number;
  enumListId?: number;
  linkedProducts?: readonly LinkedProduct[];
}

interface EnumReviewMutationContext {
  previousEnumReviewData?: EnumReviewPayload;
  previousLinkedReviewProductFields?: LinkedReviewProductFieldSnapshot;
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
  return candidateRows.some((candidate) => !candidate?.is_synthetic_selected);
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
          pendingAIShared={isPipelineReview}
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
  const egLockedKeys = useFieldRulesStore((s) => s.egLockedKeys);
  const enumFieldIds = useMemo(
    () => data.fields.map((field) => field.field),
    [data.fields],
  );
  // WHY: Sort once per data change instead of on every render.
  const sortedFields = useMemo(
    () => [...data.fields].sort((a, b) => a.field.localeCompare(b.field)),
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

  const acceptMutation = useMutation<unknown, Error, EnumAcceptMutationBody, EnumReviewMutationContext>({
    mutationFn: (body) =>
      api.post(`/review-components/${category}/enum-override`, body),
    onMutate: async (body) => {
      const queryKey = getEnumReviewQueryKey(category);
      const previousEnumReviewData = queryClient.getQueryData<EnumReviewPayload>(queryKey);
      const linkedProducts = body.linkedProducts ?? [];
      await Promise.all([
        queryClient.cancelQueries({ queryKey }),
        linkedProducts.length > 0 ? cancelLinkedReviewProductFields(queryClient, category) : Promise.resolve(),
      ]);
      if (body.valueIndex !== undefined) {
        optimisticAccept(body.field, body.valueIndex, body.candidateId ?? null, body.value);
      }
      const source = String(body.candidateSource || 'enum').trim() || 'enum';
      const previousLinkedReviewProductFields = linkedProducts.length > 0
        ? updateLinkedReviewProductFields(queryClient, {
          category,
          field: body.field,
          linkedProducts,
          value: body.value,
          source,
          timestamp: new Date().toISOString(),
          acceptedCandidateId: body.candidateId ?? null,
          overridden: false,
        })
        : undefined;
      return { previousEnumReviewData, previousLinkedReviewProductFields };
    },
    onSuccess: () => {
      invalidateEnumAuthorityQueries(queryClient, category);
    },
    onError: (_error, _body, context) => {
      if (context?.previousEnumReviewData !== undefined) {
        queryClient.setQueryData(getEnumReviewQueryKey(category), context.previousEnumReviewData);
      }
      if (context?.previousLinkedReviewProductFields) {
        restoreLinkedReviewProductFields(queryClient, context.previousLinkedReviewProductFields);
      }
      invalidateEnumReviewDataQuery(queryClient, category);
    },
  });

  const removeMutation = useMutation<unknown, Error, EnumRemoveMutationBody, EnumReviewMutationContext>({
    mutationFn: (body) =>
      api.post(`/review-components/${category}/enum-override`, body),
    onMutate: async (body) => {
      const queryKey = getEnumReviewQueryKey(category);
      const previousEnumReviewData = queryClient.getQueryData<EnumReviewPayload>(queryKey);
      const linkedProducts = body.linkedProducts ?? [];
      await Promise.all([
        queryClient.cancelQueries({ queryKey }),
        linkedProducts.length > 0 ? cancelLinkedReviewProductFields(queryClient, category) : Promise.resolve(),
      ]);
      if (body.valueIndex !== undefined) {
        optimisticRemove(body.field, body.valueIndex);
      }
      const previousLinkedReviewProductFields = linkedProducts.length > 0
        ? clearLinkedReviewProductFields(queryClient, {
          category,
          field: body.field,
          linkedProducts,
        })
        : undefined;
      return { previousEnumReviewData, previousLinkedReviewProductFields };
    },
    onSuccess: () => {
      invalidateEnumAuthorityQueries(queryClient, category);
      closeEnumDrawer();
    },
    onError: (_error, _body, context) => {
      if (context?.previousEnumReviewData !== undefined) {
        queryClient.setQueryData(getEnumReviewQueryKey(category), context.previousEnumReviewData);
      }
      if (context?.previousLinkedReviewProductFields) {
        restoreLinkedReviewProductFields(queryClient, context.previousLinkedReviewProductFields);
      }
      invalidateEnumReviewDataQuery(queryClient, category);
    },
  });

  const drawerRenameMutation = useMutation<unknown, Error, EnumRenameMutationBody, EnumReviewMutationContext>({
    mutationFn: ({
      field,
      oldValue,
      newValue: newVal,
      listValueId,
      enumListId,
    }) => api.post(`/review-components/${category}/enum-rename`, {
      field,
      oldValue,
      newValue: newVal,
      listValueId,
      enumListId,
    }),
    onMutate: async ({ field, newValue: newVal, valueIndex, listValueId, linkedProducts = [] }) => {
      if (!toPositiveId(listValueId)) return {};
      const queryKey = getEnumReviewQueryKey(category);
      const previousEnumReviewData = queryClient.getQueryData<EnumReviewPayload>(queryKey);
      await Promise.all([
        queryClient.cancelQueries({ queryKey }),
        linkedProducts.length > 0 ? cancelLinkedReviewProductFields(queryClient, category) : Promise.resolve(),
      ]);
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
      const previousLinkedReviewProductFields = linkedProducts.length > 0
        ? updateLinkedReviewProductFields(queryClient, {
          category,
          field,
          linkedProducts,
          value: newVal,
          source: 'user',
          timestamp: new Date().toISOString(),
          acceptedCandidateId: null,
          overridden: true,
        })
        : undefined;
      return { previousEnumReviewData, previousLinkedReviewProductFields };
    },
    onSuccess: () => {
      invalidateEnumAuthorityQueries(queryClient, category);
    },
    onError: (_error, _body, context) => {
      if (context?.previousEnumReviewData !== undefined) {
        queryClient.setQueryData(getEnumReviewQueryKey(category), context.previousEnumReviewData);
      }
      if (context?.previousLinkedReviewProductFields) {
        restoreLinkedReviewProductFields(queryClient, context.previousLinkedReviewProductFields);
      }
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

  // WHY: Lifted from an IIFE in the render body so we don't refilter every render.
  const selectedFieldPipelineCount = useMemo(
    () => selectedFieldData?.values.filter((v) => hasActionablePending(v) && v.source === 'pipeline').length ?? 0,
    [selectedFieldData],
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
    const linkedProducts = selectedFieldData.values[idx]?.linked_products ?? [];
    const queryKey = getEnumReviewQueryKey(category);
    const previousEnumReviewData = queryClient.getQueryData<EnumReviewPayload>(queryKey);
    let previousLinkedReviewProductFields: LinkedReviewProductFieldSnapshot | undefined;
    await Promise.all([
      queryClient.cancelQueries({ queryKey }),
      linkedProducts.length > 0 ? cancelLinkedReviewProductFields(queryClient, category) : Promise.resolve(),
    ]);

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
    if (linkedProducts.length > 0) {
      previousLinkedReviewProductFields = updateLinkedReviewProductFields(queryClient, {
        category,
        field,
        linkedProducts,
        value: trimmed,
        source: 'user',
        timestamp: new Date().toISOString(),
        acceptedCandidateId: null,
        overridden: true,
      });
    }

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
      if (previousEnumReviewData !== undefined) {
        queryClient.setQueryData(queryKey, previousEnumReviewData);
      }
      if (previousLinkedReviewProductFields) {
        restoreLinkedReviewProductFields(queryClient, previousLinkedReviewProductFields);
      }
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
            {sortedFields.map((field) => (
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
                {egLockedKeys.includes(selectedFieldData.field) && (
                  <div className="px-3 py-2 sf-surface-alt border-b sf-border-default flex items-center gap-2 text-[11px] sf-text-subtle">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                    EG-managed enum &middot; Read-only &middot; {selectedFieldData.values.length} registered values
                  </div>
                )}
                <div className={egLockedKeys.includes(selectedFieldData.field) ? 'pointer-events-none opacity-50' : ''}>
                <div className="sticky top-0 sf-surface-elevated px-3 py-2 border-b sf-border-default flex items-center justify-between">
                  <p className="text-xs font-medium sf-text-muted">
                    {getLabel(selectedFieldData.field)} - {selectedFieldData.values.length} values
                  </p>
                  {(() => {
                    const pipelineCount = selectedFieldPipelineCount;
                    const otherCount = selectedFieldData.metrics.flags - pipelineCount;
                    return (
                      <div className="flex items-center gap-1.5">
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
                    valueIndex: idx,
                    linkedProducts: vi.linked_products ?? [],
                  });
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
                const pendingCandidates = candidates.filter((candidate) => !candidate?.is_synthetic_selected);
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
                pendingAIShared={hasSharedPending}
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
                    linkedProducts: vi.linked_products ?? [],
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
                    valueIndex: viIndex,
                    linkedProducts: vi.linked_products ?? [],
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
                    valueIndex: viIndex,
                    linkedProducts: vi.linked_products ?? [],
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
                    valueIndex: viIndex,
                    linkedProducts: vi.linked_products ?? [],
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
