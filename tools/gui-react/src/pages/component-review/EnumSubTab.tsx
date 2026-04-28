import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.ts';
import { useFieldLabels } from '../../hooks/useFieldLabels.ts';
import { useComponentReviewStore } from '../../stores/componentReviewStore.ts';
import { useFieldRulesStore } from '../../features/studio/state/useFieldRulesStore.ts';
import {
  invalidateEnumAuthorityQueries,
  invalidateEnumReviewDataQuery,
  setEnumReviewQueryData,
} from './enumReviewStore.js';
import type { EnumReviewPayload, EnumFieldReview, EnumValueReviewItem } from '../../types/componentReview.ts';

interface EnumSubTabProps {
  data: EnumReviewPayload;
  category: string;
  queryClient: QueryClient;
  debugLinkedProducts?: boolean;
}

interface EnumFieldListItemProps {
  field: EnumFieldReview;
  isSelected: boolean;
  label: string;
  onClick: () => void;
}

interface EnumValueRowProps {
  item: EnumValueReviewItem;
  isSelected: boolean;
  disabled: boolean;
  onClick: () => void;
}

interface EnumValueSectionProps {
  title: string;
  values: readonly EnumValueReviewItem[];
  selectedValue: string;
  disabled: boolean;
  onValueClick: (item: EnumValueReviewItem) => void;
  region: string;
}

interface EnumValueDrawerProps {
  category: string;
  field: EnumFieldReview;
  fieldLabel: string;
  valueItem: EnumValueReviewItem;
  queryClient: QueryClient;
  onClose: () => void;
  onRenamed: (field: string, value: string) => void;
}

type EnumValueFormElements = HTMLFormControlsCollection & {
  enumValue?: HTMLInputElement;
};

const SOURCE_DISCOVERED = new Set(['pipeline', 'discovered']);

function normalizeToken(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function toPositiveId(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const id = Math.trunc(n);
  return id > 0 ? id : null;
}

function isDiscoveredValue(item: EnumValueReviewItem): boolean {
  return SOURCE_DISCOVERED.has(normalizeToken(item.source));
}

function sortValues(values: readonly EnumValueReviewItem[]): EnumValueReviewItem[] {
  return [...values].sort((left, right) => String(left.value || '').localeCompare(String(right.value || '')));
}

function FieldListItem({ field, isSelected, label, onClick }: EnumFieldListItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between rounded transition-colors ${
        isSelected
          ? 'sf-review-enum-field-selected'
          : 'sf-review-enum-field-idle'
      }`}
    >
      <span className="truncate">{label}</span>
      <span className="sf-text-nano sf-text-muted flex-shrink-0 ml-2">{field.values.length}</span>
    </button>
  );
}

function ValueRow({ item, isSelected, disabled, onClick }: EnumValueRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left px-3 py-1.5 flex items-center gap-2 rounded transition-colors ${
        isSelected
          ? 'sf-review-enum-row-selected'
          : 'sf-review-enum-row-default'
      } disabled:opacity-50`}
      data-region="enum-review-value-row"
    >
      <span className="truncate sf-text-label">{item.value}</span>
    </button>
  );
}

function EnumValueSection({
  title,
  values,
  selectedValue,
  disabled,
  onValueClick,
  region,
}: EnumValueSectionProps) {
  return (
    <section className="p-2 space-y-1" data-region={region}>
      <div className="px-1 py-1 flex items-center justify-between">
        <h3 className="text-xs font-medium sf-text-muted">{title}</h3>
        <span className="sf-text-nano sf-text-muted">{values.length}</span>
      </div>
      {values.length > 0 ? (
        <div className="space-y-0.5">
          {values.map((item) => (
            <ValueRow
              key={`${item.list_value_id ?? item.value}-${item.value}`}
              item={item}
              isSelected={normalizeToken(selectedValue) === normalizeToken(item.value)}
              disabled={disabled}
              onClick={() => onValueClick(item)}
            />
          ))}
        </div>
      ) : (
        <p className="px-3 py-2 sf-text-caption sf-text-muted">No values</p>
      )}
    </section>
  );
}

function EnumValueDrawer({
  category,
  field,
  fieldLabel,
  valueItem,
  queryClient,
  onClose,
  onRenamed,
}: EnumValueDrawerProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const listValueId = toPositiveId(valueItem.list_value_id);
  const enumListId = toPositiveId(valueItem.enum_list_id) ?? toPositiveId(field.enum_list_id);
  const canRename = Boolean(listValueId);

  const handleSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canRename || isSaving) return;

    const controls = event.currentTarget.elements as EnumValueFormElements;
    const nextValue = String(controls.enumValue?.value ?? '').trim();
    const oldValue = String(valueItem.value ?? '').trim();
    if (!nextValue || nextValue === oldValue) return;

    setError('');
    setIsSaving(true);
    try {
      await api.post(`/review-components/${category}/enum-rename`, {
        field: field.field,
        oldValue,
        newValue: nextValue,
        listValueId: listValueId ?? undefined,
        enumListId: enumListId ?? undefined,
      });

      setEnumReviewQueryData(queryClient, category, (old: EnumReviewPayload | undefined) => {
        if (!old) return old;
        return {
          ...old,
          fields: old.fields.map((enumField) => {
            if (enumField.field !== field.field) return enumField;
            return {
              ...enumField,
              values: enumField.values.map((enumValue) => (
                toPositiveId(enumValue.list_value_id) === listValueId
                  ? { ...enumValue, value: nextValue }
                  : enumValue
              )),
            };
          }),
        };
      });
      invalidateEnumAuthorityQueries(queryClient, category);
      onRenamed(field.field, nextValue);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Failed to update enum value.');
      invalidateEnumReviewDataQuery(queryClient, category);
    } finally {
      setIsSaving(false);
    }
  }, [
    canRename,
    category,
    enumListId,
    field.field,
    isSaving,
    listValueId,
    onRenamed,
    queryClient,
    valueItem.value,
  ]);

  return (
    <aside
      className="border sf-border-default rounded-lg sf-surface-elevated min-w-0"
      data-region="enum-review-value-drawer"
    >
      <div className="px-3 py-2 border-b sf-border-default flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium sf-text-muted">Value</p>
          <p className="text-sm font-medium truncate">{fieldLabel}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="sf-icon-button rounded px-2 py-1 sf-text-label"
          aria-label="Close enum value drawer"
        >
          &times;
        </button>
      </div>

      <form className="p-3 space-y-3" onSubmit={handleSubmit}>
        <label className="block space-y-1">
          <span className="sf-text-caption sf-text-muted">Value</span>
          <input
            name="enumValue"
            defaultValue={valueItem.value}
            className="sf-drawer-input w-full text-sm"
            disabled={!canRename || isSaving}
            data-region="enum-review-value-input"
          />
        </label>

        <p className="sf-callout sf-callout-warning rounded px-3 py-2 sf-text-caption">
          Changing this enum value will propagate to all affected review, publisher, component, and mapped-field records.
        </p>

        {error && (
          <p className="sf-callout sf-callout-danger rounded px-3 py-2 sf-text-caption">{error}</p>
        )}

        <button
          type="submit"
          disabled={!canRename || isSaving}
          className="w-full px-3 py-1.5 text-sm sf-primary-button rounded disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Update Value'}
        </button>
      </form>
    </aside>
  );
}

export function EnumSubTab({
  data,
  category,
  queryClient,
}: EnumSubTabProps) {
  const { getLabel } = useFieldLabels(category);
  const egLockedKeys = useFieldRulesStore((state) => state.egLockedKeys);
  const selectedEnumField = useComponentReviewStore((state) => state.selectedEnumField);
  const setSelectedEnumField = useComponentReviewStore((state) => state.setSelectedEnumField);
  const enumDrawerOpen = useComponentReviewStore((state) => state.enumDrawerOpen);
  const openEnumDrawer = useComponentReviewStore((state) => state.openEnumDrawer);
  const closeEnumDrawer = useComponentReviewStore((state) => state.closeEnumDrawer);
  const selectedEnumValue = useComponentReviewStore((state) => state.selectedEnumValue);

  const sortedFields = useMemo(
    () => [...data.fields].sort((left, right) => {
      const labelCompare = getLabel(left.field).localeCompare(getLabel(right.field));
      return labelCompare || left.field.localeCompare(right.field);
    }),
    [data.fields, getLabel],
  );

  useEffect(() => {
    if (sortedFields.length === 0) return;
    if (sortedFields.some((field) => field.field === selectedEnumField)) return;
    setSelectedEnumField(sortedFields[0].field);
  }, [selectedEnumField, setSelectedEnumField, sortedFields]);

  const selectedFieldData = useMemo(
    () => sortedFields.find((field) => field.field === selectedEnumField) ?? sortedFields[0] ?? null,
    [selectedEnumField, sortedFields],
  );

  const groupedValues = useMemo(() => {
    const values = selectedFieldData?.values ?? [];
    return {
      manual: sortValues(values.filter((item) => !isDiscoveredValue(item))),
      discovered: sortValues(values.filter(isDiscoveredValue)),
    };
  }, [selectedFieldData]);

  const selectedValueItem = useMemo(() => {
    if (!selectedFieldData || !enumDrawerOpen) return null;
    const selectedToken = normalizeToken(selectedEnumValue);
    if (!selectedToken) return null;
    return selectedFieldData.values.find((item) => normalizeToken(item.value) === selectedToken) ?? null;
  }, [enumDrawerOpen, selectedEnumValue, selectedFieldData]);

  const isFieldLocked = Boolean(selectedFieldData && egLockedKeys.includes(selectedFieldData.field));

  const handleFieldSelect = useCallback((field: EnumFieldReview) => {
    setSelectedEnumField(field.field);
    closeEnumDrawer();
  }, [closeEnumDrawer, setSelectedEnumField]);

  const handleValueClick = useCallback((item: EnumValueReviewItem) => {
    if (!selectedFieldData || isFieldLocked) return;
    openEnumDrawer(selectedFieldData.field, item.value);
  }, [isFieldLocked, openEnumDrawer, selectedFieldData]);

  return (
    <div className="grid grid-cols-[220px,1fr] gap-3 min-h-[400px]" data-region="enum-review-grid">
      <div className="border sf-border-default rounded-lg overflow-y-auto max-h-[calc(100vh-320px)]">
        <div className="sticky top-0 sf-surface-elevated px-3 py-2 border-b sf-border-default">
          <p className="text-xs font-medium sf-text-muted">Fields ({data.fields.length})</p>
        </div>
        <div className="p-1 space-y-0.5">
          {sortedFields.map((field) => (
            <FieldListItem
              key={field.field}
              field={field}
              label={getLabel(field.field)}
              isSelected={field.field === selectedFieldData?.field}
              onClick={() => handleFieldSelect(field)}
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
                {isFieldLocked && (
                  <span className="sf-text-nano sf-text-muted">Read-only</span>
                )}
              </div>

              <EnumValueSection
                title="Manual values"
                values={groupedValues.manual}
                selectedValue={selectedEnumValue}
                disabled={isFieldLocked}
                onValueClick={handleValueClick}
                region="enum-review-manual-values"
              />
              <EnumValueSection
                title="Discovered values"
                values={groupedValues.discovered}
                selectedValue={selectedEnumValue}
                disabled={isFieldLocked}
                onValueClick={handleValueClick}
                region="enum-review-discovered-values"
              />
            </>
          ) : (
            <div className="flex items-center justify-center h-full sf-text-muted text-sm">
              Select a field from the list
            </div>
          )}
        </div>

        {enumDrawerOpen && selectedValueItem && selectedFieldData && (
          <EnumValueDrawer
            category={category}
            field={selectedFieldData}
            fieldLabel={getLabel(selectedFieldData.field)}
            valueItem={selectedValueItem}
            queryClient={queryClient}
            onClose={closeEnumDrawer}
            onRenamed={openEnumDrawer}
          />
        )}
      </div>
    </div>
  );
}
