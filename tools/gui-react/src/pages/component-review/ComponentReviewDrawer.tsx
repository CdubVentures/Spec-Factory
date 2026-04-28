import { useMemo, useState } from 'react';
import { useMutation, type QueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.ts';
import { trafficColor, trafficTextColor, sourceBadgeClass, SOURCE_BADGE_FALLBACK } from '../../utils/colors.ts';
import { formatCellValue, hasKnownValue } from '../../utils/fieldNormalize.ts';
import { useFieldLabels } from '../../hooks/useFieldLabels.ts';
import {
  DrawerShell,
  DrawerSection,
  DrawerCard,
  DrawerBadges,
} from '../../shared/ui/overlay/DrawerShell.tsx';
import { ActionTooltip } from '../../shared/ui/feedback/ActionTooltip.tsx';
import { CellDrawer } from '../../shared/ui/overlay/CellDrawer.tsx';
import {
  buildComponentReviewGridLinkedProducts,
  cancelLinkedReviewProductFields,
  restoreLinkedReviewProductFields,
  updateLinkedReviewProductFields,
  type LinkedReviewProductFieldSnapshot,
} from './componentReviewCache.ts';
import { invalidateComponentImpactForCategory } from './componentImpactInvalidation.ts';
import type { ComponentReviewItem, ComponentPropertyState, ComponentReviewPayload } from '../../types/componentReview.ts';

interface ComponentReviewDrawerProps {
  item: ComponentReviewItem;
  componentType: string;
  category: string;
  onClose: () => void;
  queryClient: QueryClient;
  focusedProperty?: string;
  rowIndex?: number;
  propertyColumns?: string[];
}

type ComponentDrawerMutationValue = string | string[];

interface ComponentDrawerOverrideMutationBody {
  componentType: string;
  name: string;
  maker: string;
  property: string;
  value: ComponentDrawerMutationValue;
  componentIdentityId?: number;
}

interface ComponentDrawerMutationContext {
  previousComponentReviewData?: ComponentReviewPayload;
  previousLinkedReviewProductFields?: LinkedReviewProductFieldSnapshot;
}

const varianceBadge: Record<string, string> = {
  authoritative: 'sf-chip-info',
  upper_bound: 'sf-chip-accent',
  lower_bound: 'sf-chip-neutral',
  range: 'sf-chip-info',
  override_allowed: 'sf-chip-warning',
};

function toPositiveId(value: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  const id = Math.trunc(n);
  return id > 0 ? id : undefined;
}

function buildPropertyBadges(state: ComponentPropertyState): Array<{ label: string; className: string }> {
  const badges: Array<{ label: string; className: string }> = [];

  if (state.source && state.source !== 'unknown' && !(state.source === 'user' && state.overridden)) {
    badges.push({ label: state.source, className: sourceBadgeClass[state.source] || SOURCE_BADGE_FALLBACK });
  }

  if (state.variance_policy) {
    badges.push({
      label: state.variance_policy,
      className: varianceBadge[state.variance_policy] || 'sf-chip-neutral',
    });
  }

  if (state.overridden) {
    badges.push({ label: 'overridden', className: 'sf-chip-warning' });
  }

  for (const constraint of state.constraints) {
    badges.push({ label: constraint, className: 'sf-chip-warning' });
  }

  return badges;
}

function PropertyCard({
  propKey,
  state,
  getLabel,
}: {
  propKey: string;
  state: ComponentPropertyState;
  getLabel: (key: string) => string;
}) {
  const badges = buildPropertyBadges(state);
  const value = hasKnownValue(state.selected.value) ? formatCellValue(state.selected.value) : '';

  return (
    <DrawerCard>
      <div className="flex items-center gap-2">
        <span className={`inline-block w-3 h-3 rounded-full flex-shrink-0 ${trafficColor(state.selected.color)}`} />
        <span className="text-xs font-medium sf-text-muted flex-shrink-0">
          {getLabel(propKey)}
        </span>
        <span
          className={`font-mono text-sm font-semibold flex-1 truncate ${trafficTextColor(state.selected.color)}`}
          title={value}
        >
          {value}
        </span>
        <span className="text-xs sf-text-muted ml-auto flex-shrink-0">
          {state.candidate_count} candidates
        </span>
      </div>

      <DrawerBadges badges={badges} />
    </DrawerCard>
  );
}

function IdentityOverrideRow({
  label,
  value,
  tracked,
  property,
  onOverride,
  isPending,
}: {
  label: string;
  value: string;
  tracked?: ComponentPropertyState;
  property: string;
  onOverride: (property: string, value: string) => void;
  isPending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  return (
    <div className="flex items-center gap-2 sf-text-label">
      <span className="sf-text-muted w-12 flex-shrink-0">{label}</span>
      {editing ? (
        <div className="flex gap-1 flex-1 min-w-0">
          <input
            type="text"
            autoFocus
            value={editValue}
            onChange={(event) => setEditValue(event.target.value)}
            className="flex-1 px-1.5 py-0.5 sf-text-label sf-drawer-input min-w-0"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && editValue.trim()) {
                onOverride(property, editValue.trim());
                setEditing(false);
              }
              if (event.key === 'Escape') setEditing(false);
            }}
          />
          <ActionTooltip text="Save this identity value.">
            <button
              onClick={() => {
                onOverride(property, editValue.trim());
                setEditing(false);
              }}
              disabled={!editValue.trim() || isPending}
              className="px-2 py-0.5 sf-text-nano sf-confirm-button-solid rounded disabled:opacity-50"
            >
              Save
            </button>
          </ActionTooltip>
          <button
            onClick={() => setEditing(false)}
            className="sf-summary-toggle text-sm"
          >
            Cancel
          </button>
        </div>
      ) : (
        <>
          <span className="font-medium truncate min-w-0">{value || ''}</span>
          {tracked?.overridden && (
            <span className="sf-text-micro sf-status-text-warning font-bold flex-shrink-0">OVR</span>
          )}
          {tracked?.source && (
            <span className="sf-text-micro sf-text-muted flex-shrink-0">{tracked.source}</span>
          )}
          <button
            onClick={() => {
              setEditValue(value);
              setEditing(true);
            }}
            className="sf-link-accent hover:underline sf-text-nano ml-auto flex-shrink-0"
          >
            Edit
          </button>
        </>
      )}
    </div>
  );
}

function AliasEditor({
  aliases,
  overridden,
  onSave,
  isPending,
}: {
  aliases: string[];
  overridden: boolean;
  onSave: (items: string[]) => void;
  isPending: boolean;
}) {
  const [items, setItems] = useState(aliases);
  const [newAlias, setNewAlias] = useState('');
  const dirty = JSON.stringify(items) !== JSON.stringify(aliases);

  function addAlias() {
    const trimmed = newAlias.trim();
    if (trimmed && !items.includes(trimmed)) {
      setItems([...items, trimmed]);
    }
    setNewAlias('');
  }

  return (
    <DrawerSection
      title="Aliases"
      meta={overridden ? <span className="sf-text-micro sf-status-text-warning font-bold">OVR</span> : undefined}
    >
      <div className="space-y-1">
        {items.map((alias, index) => (
          <div key={`${alias}-${index}`} className="flex items-center gap-1">
            <input
              value={alias}
              onChange={(event) => {
                const next = [...items];
                next[index] = event.target.value;
                setItems(next);
              }}
              className="flex-1 px-1.5 py-0.5 sf-text-label sf-drawer-input min-w-0"
            />
            <button
              onClick={() => setItems(items.filter((_, i) => i !== index))}
              className="sf-status-text-danger text-xs flex-shrink-0"
              title="Remove alias"
            >
              Remove
            </button>
          </div>
        ))}
        <div className="flex gap-1">
          <input
            value={newAlias}
            onChange={(event) => setNewAlias(event.target.value)}
            placeholder="Add alias..."
            className="flex-1 px-1.5 py-0.5 sf-text-label sf-drawer-input min-w-0"
            onKeyDown={(event) => {
              if (event.key === 'Enter') addAlias();
            }}
          />
          <button
            onClick={addAlias}
            disabled={!newAlias.trim()}
            className="px-2 py-0.5 sf-text-label sf-link-accent hover:underline disabled:opacity-50 flex-shrink-0"
          >
            Add
          </button>
        </div>
        {dirty && (
          <ActionTooltip text="Save alias changes.">
            <button
              onClick={() => onSave(items)}
              disabled={isPending}
              className="px-3 py-1 sf-text-label sf-confirm-button-solid rounded disabled:opacity-50"
            >
              Save Aliases
            </button>
          </ActionTooltip>
        )}
      </div>
    </DrawerSection>
  );
}

function applyDrawerManualOverride(
  payload: ComponentReviewPayload,
  name: string,
  maker: string,
  property: string,
  value: string | string[],
  rowIndex?: number,
): ComponentReviewPayload {
  const now = new Date().toISOString();
  return {
    ...payload,
    items: payload.items.map((item, i) => {
      if (rowIndex != null && rowIndex >= 0) {
        if (i !== rowIndex) return item;
      } else if (item.name !== name || item.maker !== maker) {
        return item;
      }

      const strVal = String(Array.isArray(value) ? value[0] || '' : value);
      const selected = { value: strVal, confidence: 1.0, status: 'override', color: 'green' as const };

      if (property === '__name') {
        return {
          ...item,
          name: strVal,
          name_tracked: {
            ...item.name_tracked,
            selected,
            source: 'user',
            source_timestamp: now,
            overridden: true,
            needs_review: false,
            reason_codes: ['manual_override'],
            accepted_candidate_id: null,
          },
        };
      }

      if (property === '__maker') {
        return {
          ...item,
          maker: strVal,
          maker_tracked: {
            ...item.maker_tracked,
            selected,
            source: 'user',
            source_timestamp: now,
            overridden: true,
            needs_review: false,
            reason_codes: ['manual_override'],
            accepted_candidate_id: null,
          },
        };
      }

      if (property === '__aliases') {
        return { ...item, aliases: Array.isArray(value) ? value.map(String) : [strVal], aliases_overridden: true };
      }

      return item;
    }),
  };
}

export function ComponentReviewDrawer({
  item,
  componentType,
  category,
  onClose,
  queryClient,
  focusedProperty,
  rowIndex,
  propertyColumns = [],
}: ComponentReviewDrawerProps) {
  const { getLabel } = useFieldLabels(category);
  const sortedPropertyEntries = useMemo(() => {
    const entries = Object.entries(item.properties);
    if (propertyColumns.length === 0) return entries;

    const orderIndex = new Map(propertyColumns.map((key, index) => [key, index]));
    return [...entries].sort(([a], [b]) => {
      const ai = orderIndex.has(a) ? orderIndex.get(a)! : Number.MAX_SAFE_INTEGER;
      const bi = orderIndex.has(b) ? orderIndex.get(b)! : Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });
  }, [item.properties, propertyColumns]);

  function getMutationIds(): { componentIdentityId?: number } {
    return { componentIdentityId: toPositiveId(item.component_identity_id) };
  }

  function canMutateIdentity(): boolean {
    return Boolean(getMutationIds().componentIdentityId);
  }

  const overrideMut = useMutation<unknown, Error, ComponentDrawerOverrideMutationBody, ComponentDrawerMutationContext>({
    mutationFn: (body) =>
      api.post(`/review-components/${category}/component-override`, body),
    onMutate: async (body) => {
      if (!toPositiveId(body?.componentIdentityId)) return {};

      const queryKey = ['componentReviewData', category, componentType];
      const previousComponentReviewData = queryClient.getQueryData<ComponentReviewPayload>(queryKey);
      const linkedProducts = buildComponentReviewGridLinkedProducts({
        componentType,
        property: body.property,
        linkedProducts: item.linked_products ?? [],
      });

      await Promise.all([
        queryClient.cancelQueries({ queryKey }),
        linkedProducts.length > 0 ? cancelLinkedReviewProductFields(queryClient, category) : Promise.resolve(),
      ]);

      queryClient.setQueryData<ComponentReviewPayload>(queryKey, (old) =>
        old ? applyDrawerManualOverride(old, body.name, body.maker, body.property, body.value, rowIndex) : old,
      );

      const previousLinkedReviewProductFields = linkedProducts.length > 0
        ? updateLinkedReviewProductFields(queryClient, {
          category,
          field: body.property,
          linkedProducts,
          value: Array.isArray(body.value) ? body.value[0] ?? '' : body.value,
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
        queryClient.setQueryData(['componentReviewData', category, componentType], context.previousComponentReviewData);
      }
      if (context?.previousLinkedReviewProductFields) {
        restoreLinkedReviewProductFields(queryClient, context.previousLinkedReviewProductFields);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['componentReviewData', category, componentType] });
      queryClient.invalidateQueries({ queryKey: ['reviewProductsIndex', category] });
      queryClient.invalidateQueries({ queryKey: ['product', category] });
      invalidateComponentImpactForCategory({ queryClient, category });
    },
  });

  function saveIdentity(property: string, value: string | string[]) {
    if (!canMutateIdentity()) return;
    overrideMut.mutate({
      componentType,
      name: item.name,
      maker: item.maker,
      property,
      value,
      ...getMutationIds(),
    });
  }

  if (focusedProperty === '__name' || focusedProperty === '__maker') {
    const isName = focusedProperty === '__name';

    return (
      <DrawerShell title={isName ? 'Name' : 'Brand'} subtitle={`${item.name} | ${item.maker || componentType}`} onClose={onClose}>
        <DrawerSection title="Identity">
          <IdentityOverrideRow
            label={isName ? 'Name' : 'Brand'}
            value={isName ? item.name : item.maker}
            tracked={isName ? item.name_tracked : item.maker_tracked}
            property={focusedProperty}
            onOverride={saveIdentity}
            isPending={overrideMut.isPending}
          />
        </DrawerSection>
      </DrawerShell>
    );
  }

  if (focusedProperty === '__links') {
    const state = item.links_state;

    return (
      <CellDrawer
        title="Links"
        subtitle={`${item.name} | ${item.maker || componentType}`}
        onClose={onClose}
        currentValue={{
          value: '',
          confidence: 0,
          color: state.selected.color,
          source: state.source,
          sourceTimestamp: state.source_timestamp,
          overridden: state.overridden,
          acceptedCandidateId: state.accepted_candidate_id ?? null,
        }}
        showCurrentConfidence={false}
        badges={buildPropertyBadges(state)}
        isPending={false}
        candidates={state.candidates ?? []}
      />
    );
  }

  if (focusedProperty && item.properties[focusedProperty]) {
    const state = item.properties[focusedProperty];
    const hasValue = hasKnownValue(state.selected.value);

    return (
      <CellDrawer
        title={getLabel(focusedProperty)}
        subtitle={`${item.name} | ${item.maker || componentType}`}
        onClose={onClose}
        currentValue={{
          value: hasValue ? formatCellValue(state.selected.value) : '',
          confidence: state.selected.confidence,
          color: state.selected.color,
          source: state.source,
          sourceTimestamp: state.source_timestamp,
          overridden: state.overridden,
          acceptedCandidateId: state.accepted_candidate_id ?? null,
        }}
        showCurrentConfidence={false}
        badges={buildPropertyBadges(state)}
        isPending={false}
        candidates={state.candidates ?? []}
      />
    );
  }

  return (
    <DrawerShell title={item.name} subtitle={item.maker || componentType} onClose={onClose}>
      <DrawerSection title="Identity">
        <div className="space-y-1.5">
          <IdentityOverrideRow
            label="Name"
            value={item.name}
            tracked={item.name_tracked}
            property="__name"
            onOverride={saveIdentity}
            isPending={overrideMut.isPending}
          />
          <IdentityOverrideRow
            label="Brand"
            value={item.maker}
            tracked={item.maker_tracked}
            property="__maker"
            onOverride={saveIdentity}
            isPending={overrideMut.isPending}
          />
        </div>
      </DrawerSection>

      <AliasEditor
        aliases={item.aliases}
        overridden={item.aliases_overridden}
        onSave={(items) => saveIdentity('__aliases', items)}
        isPending={overrideMut.isPending}
      />

      {(item.links_state || sortedPropertyEntries.length > 0) && (
        <DrawerSection title="Attributes">
          <div className="space-y-2">
            {item.links_state && (
              <PropertyCard
                propKey="__links"
                state={item.links_state}
                getLabel={() => 'Links'}
              />
            )}
            {sortedPropertyEntries.map(([propKey, state]) => (
              <PropertyCard
                key={propKey}
                propKey={propKey}
                state={state}
                getLabel={getLabel}
              />
            ))}
          </div>
        </DrawerSection>
      )}
    </DrawerShell>
  );
}
