import { useState, useMemo } from 'react';
import { useMutation, useQuery, type QueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.ts';
import { trafficColor, trafficTextColor, sourceBadgeClass, SOURCE_BADGE_FALLBACK } from '../../utils/colors.ts';
import { hasKnownValue } from '../../utils/fieldNormalize.ts';
import { useFieldLabels } from '../../hooks/useFieldLabels.ts';
import { pct } from '../../utils/formatting.ts';
import {
  DrawerShell,
  DrawerSection,
  DrawerCard,
  DrawerValueRow,
  DrawerBadges,
  DrawerManualOverride,
} from '../../shared/ui/overlay/DrawerShell.tsx';
import { ActionTooltip } from '../../shared/ui/feedback/ActionTooltip.tsx';
import { CellDrawer } from '../../shared/ui/overlay/CellDrawer.tsx';
import { FlagsSection, FlagsOverviewSection } from '../../shared/ui/feedback/FlagsSection.tsx';
import { PendingAIReviewSection } from './PendingAIReviewSection.tsx';
import { LinkedProductsList } from './LinkedProductsList.tsx';
import type { ComponentReviewItem, ComponentPropertyState, ComponentReviewPayload, ComponentReviewFlaggedItem } from '../../types/componentReview.ts';

interface ComponentImpactResult {
  affected_products: Array<{ productId: string; field: string; value: string; match_type: string }>;
  total: number;
}

interface ComponentReviewDrawerProps {
  item: ComponentReviewItem;
  componentType: string;
  category: string;
  onClose: () => void;
  queryClient: QueryClient;
  focusedProperty?: string;
  rowIndex?: number;
  pendingReviewItems?: ComponentReviewFlaggedItem[];
  isSynthetic?: boolean;
  debugLinkedProducts?: boolean;
  propertyColumns?: string[];
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

  // Show source badge — skip 'user' when overridden to avoid redundancy with 'overridden' badge
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

  for (const reasonCode of state.reason_codes) {
    if (reasonCode === 'manual_override' && state.overridden) continue;
    badges.push({ label: reasonCode, className: 'sf-chip-warning' });
  }

  return badges;
}

function hasActionablePending(state: ComponentPropertyState | null | undefined): boolean {
  if (!state?.needs_review) return false;
  const candidateRows = (state.candidates || []).filter((candidate) => {
    const candidateId = String(candidate?.candidate_id || '').trim();
    return Boolean(candidateId) && hasKnownValue(candidate?.value);
  });
  return candidateRows.some((candidate) => !candidate?.is_synthetic_selected);
}

function PropertyCard({
  propKey,
  state,
  onOverride,
  isPending,
  getLabel,
}: {
  propKey: string;
  state: ComponentPropertyState;
  onOverride: (value: string) => void;
  isPending: boolean;
  getLabel: (key: string) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const badges = buildPropertyBadges(state);

  return (
    <DrawerCard>
      <div className="flex items-center gap-2">
        <span className={`inline-block w-3 h-3 rounded-full flex-shrink-0 ${trafficColor(state.selected.color)}`} />
        <span className="text-xs font-medium sf-text-muted flex-shrink-0">
          {getLabel(propKey)}
        </span>
        <span
          className={`font-mono text-sm font-semibold flex-1 truncate ${trafficTextColor(state.selected.color)}`}
          title={String(state.selected.value ?? '')}
        >
          {state.selected.value !== null && state.selected.value !== undefined ? String(state.selected.value) : ''}
        </span>
        <span className="text-xs sf-text-muted ml-auto flex-shrink-0">
          {pct(state.selected.confidence)} conf
        </span>
      </div>

      <DrawerBadges badges={badges} />

      {!editing ? (
        <button
          onClick={() => {
            setEditing(true);
            setEditValue(String(state.selected.value ?? ''));
          }}
          className="sf-text-nano sf-link-accent hover:underline"
        >
          Override
        </button>
      ) : (
        <div className="flex gap-2 mt-1">
          {state.enum_policy === 'closed' && state.enum_values && state.enum_values.length > 0 ? (
            <select
              value={editValue}
              onChange={(event) => {
                setEditValue(event.target.value);
                if (event.target.value) {
                  onOverride(event.target.value);
                  setEditing(false);
                }
              }}
              className="flex-1 px-2 py-1 text-sm sf-drawer-input"
              autoFocus
            >
              <option value="">Select value...</option>
              {state.enum_values.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          ) : state.enum_values && state.enum_values.length > 0 ? (
            <>
              <select
                value={state.enum_values.includes(editValue) ? editValue : '__other__'}
                onChange={(event) => {
                  if (event.target.value === '__other__') return;
                  setEditValue(event.target.value);
                  onOverride(event.target.value);
                  setEditing(false);
                }}
                className="flex-1 px-2 py-1 text-sm sf-drawer-input"
                autoFocus
              >
                <option value="">Select value...</option>
                {state.enum_values.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
                <option value="__other__">Other...</option>
              </select>
              {!state.enum_values.includes(editValue) && (
                <input
                  type="text"
                  value={editValue}
                  onChange={(event) => setEditValue(event.target.value)}
                  className="flex-1 px-2 py-1 text-sm sf-drawer-input"
                  placeholder="Custom value..."
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && editValue) {
                      onOverride(editValue);
                      setEditing(false);
                    }
                    if (event.key === 'Escape') setEditing(false);
                  }}
                />
              )}
            </>
          ) : (
            <input
              type="text"
              value={editValue}
              onChange={(event) => setEditValue(event.target.value)}
              className="flex-1 px-2 py-1 text-sm sf-drawer-input"
              autoFocus
              placeholder="Enter new value..."
              onKeyDown={(event) => {
                if (event.key === 'Enter' && editValue) {
                  onOverride(editValue);
                  setEditing(false);
                }
                if (event.key === 'Escape') setEditing(false);
              }}
            />
          )}
          {!(state.enum_policy === 'closed' && state.enum_values && state.enum_values.length > 0) && (
            <ActionTooltip text="Apply this property override value.">
              <button
                onClick={() => {
                  onOverride(editValue);
                  setEditing(false);
                }}
                disabled={!editValue || isPending}
                className="px-3 py-1 text-sm sf-drawer-apply-button rounded disabled:opacity-50"
              >
                Apply
              </button>
            </ActionTooltip>
          )}
        </div>
      )}
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
            onChange={(e) => setEditValue(e.target.value)}
            className="flex-1 px-1.5 py-0.5 sf-text-label sf-drawer-input min-w-0"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && editValue.trim()) {
                onOverride(property, editValue.trim());
                setEditing(false);
              }
              if (e.key === 'Escape') setEditing(false);
            }}
          />
          <ActionTooltip text="Confirm and save this identity override.">
            <button
              onClick={() => { onOverride(property, editValue.trim()); setEditing(false); }}
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
            ×
          </button>
        </div>
      ) : (
        <>
          <span className="font-medium truncate min-w-0">{value || '—'}</span>
          {tracked?.overridden && (
            <span className="sf-text-micro sf-status-text-warning font-bold flex-shrink-0">OVR</span>
          )}
          {tracked && (
            <span className="sf-text-micro sf-text-muted flex-shrink-0">{tracked.source}</span>
          )}
          <button
            onClick={() => { setEditValue(value); setEditing(true); }}
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

  const addAlias = () => {
    const trimmed = newAlias.trim();
    if (trimmed && !items.includes(trimmed)) {
      setItems([...items, trimmed]);
    }
    setNewAlias('');
  };
  const removeAlias = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const editAlias = (idx: number, val: string) => {
    const copy = [...items];
    copy[idx] = val;
    setItems(copy);
  };

  return (
    <DrawerSection
      title="Aliases"
      meta={overridden ? <span className="sf-text-micro sf-status-text-warning font-bold">OVR</span> : undefined}
    >
      <div className="space-y-1">
        {items.map((alias, i) => (
          <div key={i} className="flex items-center gap-1">
            <input
              value={alias}
              onChange={(e) => editAlias(i, e.target.value)}
              className="flex-1 px-1.5 py-0.5 sf-text-label sf-drawer-input min-w-0"
            />
            <button
              onClick={() => removeAlias(i)}
              className="sf-status-text-danger text-xs flex-shrink-0"
              title="Remove alias"
            >
              ×
            </button>
          </div>
        ))}
        <div className="flex gap-1">
          <input
            value={newAlias}
            onChange={(e) => setNewAlias(e.target.value)}
            placeholder="Add alias..."
            className="flex-1 px-1.5 py-0.5 sf-text-label sf-drawer-input min-w-0"
            onKeyDown={(e) => { if (e.key === 'Enter') addAlias(); }}
          />
          <button
            onClick={addAlias}
            disabled={!newAlias.trim()}
            className="px-2 py-0.5 sf-text-label sf-link-accent hover:underline disabled:opacity-50 flex-shrink-0"
          >
            +
          </button>
        </div>
        {dirty && (
          <ActionTooltip text="Confirm and save alias changes.">
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

function LinksEditor({
  links,
  tracked,
  onSave,
  isPending,
}: {
  links: string[];
  tracked: Array<{ overridden: boolean; source: string }>;
  onSave: (items: string[]) => void;
  isPending: boolean;
}) {
  const [items, setItems] = useState(links);
  const [newLink, setNewLink] = useState('');
  const dirty = JSON.stringify(items) !== JSON.stringify(links);
  const anyOverridden = tracked.some((t) => t.overridden);

  const addLink = () => {
    const trimmed = newLink.trim();
    if (trimmed && !items.includes(trimmed)) {
      setItems([...items, trimmed]);
    }
    setNewLink('');
  };
  const removeLink = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const editLink = (idx: number, val: string) => {
    const copy = [...items];
    copy[idx] = val;
    setItems(copy);
  };

  return (
    <DrawerSection
      title="Links"
      meta={anyOverridden ? <span className="sf-text-micro sf-status-text-warning font-bold">OVR</span> : undefined}
    >
      <div className="space-y-1">
        {items.map((url, i) => (
          <div key={i} className="flex items-center gap-1">
            <input
              value={url}
              onChange={(e) => editLink(i, e.target.value)}
              className="flex-1 px-1.5 py-0.5 sf-text-label sf-drawer-input min-w-0"
            />
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="sf-link-accent sf-text-nano flex-shrink-0"
              title="Open link"
            >
              ↗
            </a>
            <button
              onClick={() => removeLink(i)}
              className="sf-status-text-danger text-xs flex-shrink-0"
              title="Remove link"
            >
              ×
            </button>
          </div>
        ))}
        <div className="flex gap-1">
          <input
            value={newLink}
            onChange={(e) => setNewLink(e.target.value)}
            placeholder="Add link..."
            className="flex-1 px-1.5 py-0.5 sf-text-label sf-drawer-input min-w-0"
            onKeyDown={(e) => { if (e.key === 'Enter') addLink(); }}
          />
          <button
            onClick={addLink}
            disabled={!newLink.trim()}
            className="px-2 py-0.5 sf-text-label sf-link-accent hover:underline disabled:opacity-50 flex-shrink-0"
          >
            +
          </button>
        </div>
        {dirty && (
          <ActionTooltip text="Confirm and save link changes.">
            <button
              onClick={() => onSave(items)}
              disabled={isPending}
              className="px-3 py-1 sf-text-label sf-confirm-button-solid rounded disabled:opacity-50"
            >
              Save Links
            </button>
          </ActionTooltip>
        )}
      </div>
    </DrawerSection>
  );
}

function confidenceColor(confidence: number, reasonCodes: string[] = []): string {
  if (confidence <= 0) return 'gray';
  if (
    confidence < 0.6 ||
    reasonCodes.includes('constraint_conflict') ||
    reasonCodes.includes('critical_field_below_pass_target') ||
    reasonCodes.includes('below_pass_target')
  ) return 'red';
  if (confidence < 0.85) return 'yellow';
  return 'green';
}

/** Optimistically apply a manual override — source='user', overridden=true */
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
      // Prefer exact rowIndex to avoid updating duplicate name+maker rows
      if (rowIndex != null && rowIndex >= 0) {
        if (i !== rowIndex) return item;
      } else {
        if (item.name !== name || item.maker !== maker) return item;
      }
      const strVal = String(Array.isArray(value) ? value[0] || '' : value);
      const greenSelected = { value: strVal, confidence: 1.0, status: 'override', color: 'green' as const };

      if (property === '__name') {
        return { ...item, name: strVal, name_tracked: { ...item.name_tracked, selected: greenSelected, source: 'user', source_timestamp: now, overridden: true, needs_review: false, reason_codes: ['manual_override'], accepted_candidate_id: null } };
      }
      if (property === '__maker') {
        return { ...item, maker: strVal, maker_tracked: { ...item.maker_tracked, selected: greenSelected, source: 'user', source_timestamp: now, overridden: true, needs_review: false, reason_codes: ['manual_override'], accepted_candidate_id: null } };
      }
      if (property === '__aliases') {
        return { ...item, aliases: Array.isArray(value) ? value.map(String) : [strVal], aliases_overridden: true };
      }
      if (property === '__links') {
        const newLinks = Array.isArray(value) ? value.map(String) : [strVal];
        return {
          ...item,
          links: newLinks,
          links_tracked: newLinks.map((url) => ({
            selected: { value: url, confidence: 1.0, status: 'override', color: 'green' as const },
            needs_review: false,
            reason_codes: ['manual_override'] as string[],
            source: 'user',
            source_timestamp: now,
            overridden: true,
          })),
        };
      }

      const prop = item.properties[property];
      if (!prop) return item;
      return {
        ...item,
        properties: {
          ...item.properties,
          [property]: { ...prop, selected: { value, confidence: 1.0, status: 'override', color: 'green' as const }, source: 'user', source_timestamp: now, overridden: true, needs_review: false, reason_codes: ['manual_override'], accepted_candidate_id: null },
        },
      };
    }),
  };
}

/** Optimistically apply a candidate acceptance — preserve candidate source, overridden=false */
function applyDrawerCandidateAccept(
  payload: ComponentReviewPayload,
  name: string,
  maker: string,
  property: string,
  value: string,
  candidateId: string | null = null,
  rowIndex?: number,
): ComponentReviewPayload {
  const now = new Date().toISOString();
  return {
    ...payload,
    items: payload.items.map((item, i) => {
      if (rowIndex != null && rowIndex >= 0) {
        if (i !== rowIndex) return item;
      } else {
        if (item.name !== name || item.maker !== maker) return item;
      }
      const greenSelected = { value, confidence: 1.0, status: 'accepted', color: 'green' as const };

      if (property === '__name') {
        return {
          ...item,
          name: value,
          name_tracked: {
            ...item.name_tracked,
            selected: greenSelected,
            source: item.name_tracked.source || 'pipeline',
            source_timestamp: now,
            overridden: false,
            // Accept must not implicitly confirm shared AI.
            needs_review: item.name_tracked.needs_review,
            reason_codes: item.name_tracked.reason_codes,
            accepted_candidate_id: candidateId,
          },
        };
      }
      if (property === '__maker') {
        return {
          ...item,
          maker: value,
          maker_tracked: {
            ...item.maker_tracked,
            selected: greenSelected,
            source: item.maker_tracked.source || 'pipeline',
            source_timestamp: now,
            overridden: false,
            // Accept must not implicitly confirm shared AI.
            needs_review: item.maker_tracked.needs_review,
            reason_codes: item.maker_tracked.reason_codes,
            accepted_candidate_id: candidateId,
          },
        };
      }

      const prop = item.properties[property];
      if (!prop) return item;
      return {
        ...item,
        properties: {
          ...item.properties,
          [property]: {
            ...prop,
            selected: greenSelected,
            source: prop.source || 'pipeline',
            source_timestamp: now,
            overridden: false,
            // Accept must not implicitly confirm shared AI.
            needs_review: prop.needs_review,
            reason_codes: prop.reason_codes,
            accepted_candidate_id: candidateId,
          },
        },
      };
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
  pendingReviewItems = [],
  isSynthetic = false,
  debugLinkedProducts = false,
  propertyColumns = [],
}: ComponentReviewDrawerProps) {
  const { getLabel } = useFieldLabels(category);
  const sortedPropertyEntries = useMemo(() => {
    const entries = Object.entries(item.properties);
    if (propertyColumns.length > 0) {
      const orderIndex = new Map(propertyColumns.map((k, i) => [k, i]));
      return [...entries].sort(([a], [b]) => {
        const ai = orderIndex.has(a) ? orderIndex.get(a)! : Number.MAX_SAFE_INTEGER;
        const bi = orderIndex.has(b) ? orderIndex.get(b)! : Number.MAX_SAFE_INTEGER;
        return ai - bi;
      });
    }
    return entries;
  }, [item.properties, propertyColumns]);
  const drawerPendingReviewItems = (() => {
    const propKey = String(focusedProperty || '').trim();
    if (!propKey) return pendingReviewItems;
    if (propKey.startsWith('__')) return pendingReviewItems;
    return pendingReviewItems.filter((reviewItem) => {
      const directFieldKey = String(reviewItem?.field_key || '').trim();
      if (directFieldKey && directFieldKey === propKey) return true;
      const attrs = reviewItem?.product_attributes;
      if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) return false;
      return Object.prototype.hasOwnProperty.call(attrs, propKey);
    });
  })();

  // Mutation: approve individual review items (approve_new / dismiss)
  const reviewActionMut = useMutation({
    mutationFn: (body: { review_id: string; action: string; merge_target?: string }) =>
      api.post(`/review-components/${category}/component-review-action`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['componentReview', category] });
      queryClient.invalidateQueries({ queryKey: ['componentReviewData', category] });
      queryClient.invalidateQueries({ queryKey: ['reviewProductsIndex', category] });
    },
  });

  const overrideMut = useMutation({
    mutationFn: (body: {
      componentType: string;
      name: string;
      maker: string;
      property: string;
      value: string | string[];
      componentIdentityId?: number;
      componentValueId?: number;
    }) =>
      api.post(`/review-components/${category}/component-override`, body),
    onMutate: async (body) => {
      const isIdentityProperty = String(body?.property || '').trim().startsWith('__');
      const hasRequiredId = isIdentityProperty
        ? Boolean(toPositiveId(body?.componentIdentityId))
        : Boolean(toPositiveId(body?.componentValueId));
      if (!hasRequiredId) return;
      const queryKey = ['componentReviewData', category, componentType];
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData<ComponentReviewPayload>(queryKey, (old) =>
        old ? applyDrawerManualOverride(old, body.name, body.maker, body.property, body.value, rowIndex) : old,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['componentReviewData', category, componentType] });
      queryClient.invalidateQueries({ queryKey: ['reviewProductsIndex', category] });
      queryClient.invalidateQueries({ queryKey: ['product', category] });
      queryClient.invalidateQueries({ queryKey: ['componentImpact'] });
    },
  });

  // Separate mutation for candidate acceptance — uses applyDrawerCandidateAccept (overridden=false)
  // so the optimistic update doesn't get overwritten by overrideMut's onMutate.
  const candidateAcceptMut = useMutation({
    mutationFn: (body: {
      componentType: string;
      name: string;
      maker: string;
      property: string;
      value: string;
      candidateId?: string;
      candidateSource?: string;
      componentIdentityId?: number;
      componentValueId?: number;
    }) =>
      api.post(`/review-components/${category}/component-override`, body),
    onMutate: async (body) => {
      const isIdentityProperty = String(body?.property || '').trim().startsWith('__');
      const hasRequiredId = isIdentityProperty
        ? Boolean(toPositiveId(body?.componentIdentityId))
        : Boolean(toPositiveId(body?.componentValueId));
      if (!hasRequiredId) return;
      const queryKey = ['componentReviewData', category, componentType];
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData<ComponentReviewPayload>(queryKey, (old) =>
        old ? applyDrawerCandidateAccept(old, body.name, body.maker, body.property, body.value, body.candidateId ?? null, rowIndex) : old,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['componentReviewData', category, componentType] });
      queryClient.invalidateQueries({ queryKey: ['reviewProductsIndex', category] });
      queryClient.invalidateQueries({ queryKey: ['product', category] });
      queryClient.invalidateQueries({ queryKey: ['componentImpact'] });
    },
  });

  const confirmSharedLaneMut = useMutation({
    mutationFn: (body: {
      componentType: string;
      name: string;
      maker: string;
      property: string;
      candidateId?: string;
      candidateValue?: string;
      candidateConfidence?: number;
      componentIdentityId?: number;
      componentValueId?: number;
    }) => api.post(`/review-components/${category}/component-key-review-confirm`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['componentReviewData', category, componentType] });
      queryClient.invalidateQueries({ queryKey: ['reviewProductsIndex', category] });
    },
  });

  // Fetch impact data (how many products reference this component)
  const impactQuery = useQuery({
    queryKey: ['componentImpact', category, componentType, item.name],
    queryFn: () => api.get<ComponentImpactResult>(`/review-components/${category}/component-impact?type=${encodeURIComponent(componentType)}&name=${encodeURIComponent(item.name)}`),
    staleTime: 60_000,
  });

  // Build shared impact section (used by both name/maker and property focused views)
  const impactSection = impactQuery.data && impactQuery.data.total > 0 ? (
    <DrawerSection title="Affected Products">
      <div className="sf-text-nano sf-text-muted">
        {impactQuery.data.total} product{impactQuery.data.total !== 1 ? 's' : ''} use this component
      </div>
      <div className="max-h-[120px] overflow-y-auto space-y-0.5">
        {(impactQuery.data.affected_products || []).slice(0, 20).map((p) => (
          <div key={p.productId} className="sf-text-nano sf-text-muted truncate">{p.productId}</div>
        ))}
      </div>
    </DrawerSection>
  ) : null;

  function getMutationIds(property: string): { componentIdentityId?: number; componentValueId?: number } {
    const componentIdentityId = toPositiveId(item.component_identity_id);
    const componentValueId = property.startsWith('__')
      ? undefined
      : toPositiveId(item.properties?.[property]?.slot_id);
    return { componentIdentityId, componentValueId };
  }

  function canMutateProperty(property: string): boolean {
    const ids = getMutationIds(property);
    return property.startsWith('__')
      ? Boolean(ids.componentIdentityId)
      : Boolean(ids.componentValueId);
  }

  const debugComponentIdentityId = toPositiveId(item.component_identity_id);
  function renderDebugIdentitySection(slotId?: number | null) {
    if (!debugLinkedProducts) return null;
    const componentValueId = toPositiveId(slotId);
    return (
      <DrawerSection title="Debug Identity">
        <div className="sf-text-nano sf-status-text-info space-y-0.5">
          <div>{`row: ${componentType} | ${item.name} | ${item.maker || '(blank maker)'}`}</div>
          <div>{`componentIdentityId: ${debugComponentIdentityId ?? 'n/a'}`}</div>
          <div>{`componentValueId: ${componentValueId ?? 'n/a'}`}</div>
          <div>{`focusedProperty: ${focusedProperty || 'n/a'}`}</div>
        </div>
      </DrawerSection>
    );
  }

  function buildPendingSharedCandidateIds({
    hasSharedPending,
    candidates,
  }: {
    hasSharedPending: boolean;
    candidates: import('../../types/review.ts').ReviewCandidate[];
  }): string[] {
    if (!hasSharedPending) return [];
    const allCandidates = (candidates || []).filter((candidate) => {
      const candidateId = String(candidate?.candidate_id || '').trim();
      return Boolean(candidateId) && hasKnownValue(candidate?.value);
    });
    const pendingCandidates = allCandidates.filter((candidate) => !candidate?.is_synthetic_selected);
    return [...new Set(
      pendingCandidates
      .map((candidate) => String(candidate?.candidate_id || '').trim())
      .filter(Boolean),
    )];
  }

  // Handle __name/__maker in focused mode via CellDrawer
  if (focusedProperty === '__name' || focusedProperty === '__maker') {
    const state = focusedProperty === '__name' ? item.name_tracked : item.maker_tracked;
    const subtitle = `${item.name} | ${item.maker || componentType}`;
    const badges = buildPropertyBadges(state);
    const hasValue = hasKnownValue(state.selected.value);
    const isAccepted = hasValue
      && !state.needs_review
      && !state.overridden
      && (
        Boolean(state.accepted_candidate_id)
        || state.source === 'reference'
        || state.source === 'manual'
        || state.source === 'user'
      );
    const candidates = state.candidates ?? [];
    const hasSharedPending = hasActionablePending(state);
    const pendingSharedCandidateIds = buildPendingSharedCandidateIds({
      hasSharedPending,
      candidates,
    });
    const fallbackSharedConfirmCandidateId = String(
      state.accepted_candidate_id
      || pendingSharedCandidateIds[0]
      || '',
    ).trim() || undefined;
    const focusedMutationIds = getMutationIds(focusedProperty);
    const canMutateFocused = canMutateProperty(focusedProperty);

    return (
      <CellDrawer
        title={focusedProperty === '__name' ? 'Name' : 'Maker'}
        subtitle={subtitle}
        onClose={onClose}
        currentValue={{
          value: hasValue ? String(state.selected.value) : '',
          confidence: state.selected.confidence,
          color: state.selected.color,
          source: state.source,
          sourceTimestamp: state.source_timestamp,
          overridden: state.overridden,
          acceptedCandidateId: state.accepted_candidate_id ?? null,
        }}
        badges={badges}
        isCurrentAccepted={isAccepted}
        pendingAIConfirmation={hasSharedPending}
        pendingSharedCandidateIds={pendingSharedCandidateIds}
        candidateUiContext="shared"
        showCandidateDebugIds={debugLinkedProducts}
        onManualOverride={(value) => {
          if (!canMutateFocused) return;
          overrideMut.mutate({
            componentType,
            name: item.name,
            maker: item.maker,
            property: focusedProperty,
            value,
            ...focusedMutationIds,
          });
        }}
        isPending={overrideMut.isPending || candidateAcceptMut.isPending || confirmSharedLaneMut.isPending || reviewActionMut.isPending}
        candidates={candidates}
        onAcceptCandidate={canMutateFocused ? (candidateId, candidate) => {
          candidateAcceptMut.mutate({
            componentType,
            name: item.name,
            maker: item.maker,
            property: focusedProperty,
            value: String(candidate.value ?? ''),
            candidateId,
            candidateSource: candidate.source_id || candidate.source || '',
            ...focusedMutationIds,
          });
        } : undefined}
        onConfirmSharedCandidate={hasSharedPending && canMutateFocused ? (candidateId, candidate) => {
          confirmSharedLaneMut.mutate({
            componentType,
            name: item.name,
            maker: item.maker,
            property: focusedProperty,
            candidateId,
            candidateValue: hasKnownValue(candidate?.value)
              ? String(candidate.value)
              : (hasValue ? String(state.selected.value) : undefined),
            candidateConfidence: Number.isFinite(Number(candidate?.score))
              ? Number(candidate.score)
              : Number(state.selected.confidence ?? 0),
            ...focusedMutationIds,
          });
        } : undefined}
        onConfirmShared={hasSharedPending && canMutateFocused ? () => {
          confirmSharedLaneMut.mutate({
            componentType,
            name: item.name,
            maker: item.maker,
            property: focusedProperty,
            candidateId: fallbackSharedConfirmCandidateId,
            candidateValue: hasValue ? String(state.selected.value) : undefined,
            candidateConfidence: Number(state.selected.confidence ?? 0),
            ...focusedMutationIds,
          });
        } : undefined}
        extraSections={
          <>
            {drawerPendingReviewItems.length > 0 && (
              <PendingAIReviewSection
                items={drawerPendingReviewItems}
                pendingCandidateCount={pendingSharedCandidateIds.length}
                category={category}
                queryClient={queryClient}
              />
            )}
            {state.reason_codes?.length > 0 && <FlagsSection reasonCodes={state.reason_codes} />}
            {item.linked_products && item.linked_products.length > 0 && (
              <LinkedProductsList
                products={item.linked_products}
                headerLabel="Match Type"
                maxHeight={180}
                defaultExpanded
              />
            )}
            {renderDebugIdentitySection(state.slot_id ?? null)}
            {impactSection}
          </>
        }
      />
    );
  }

  if (focusedProperty && item.properties[focusedProperty]) {
    const state = item.properties[focusedProperty];
    const subtitle = `${item.name} | ${item.maker || componentType}`;
    const badges = buildPropertyBadges(state);
    const hasValue = hasKnownValue(state.selected.value);
    const isAccepted = hasValue
      && !state.needs_review
      && !state.overridden
      && (
        Boolean(state.accepted_candidate_id)
        || state.source === 'reference'
        || state.source === 'manual'
        || state.source === 'user'
      );
    const candidates = state.candidates ?? [];
    const hasSharedPending = hasActionablePending(state);
    const pendingSharedCandidateIds = buildPendingSharedCandidateIds({
      hasSharedPending,
      candidates,
    });
    const fallbackSharedConfirmCandidateId = String(
      state.accepted_candidate_id
      || pendingSharedCandidateIds[0]
      || '',
    ).trim() || undefined;
    const focusedMutationIds = getMutationIds(focusedProperty);
    const canMutateFocused = canMutateProperty(focusedProperty);

    return (
      <CellDrawer
        title={getLabel(focusedProperty)}
        subtitle={subtitle}
        onClose={onClose}
        currentValue={{
          value: state.selected.value !== null && state.selected.value !== undefined ? String(state.selected.value) : '',
          confidence: state.selected.confidence,
          color: state.selected.color,
          source: state.source,
          sourceTimestamp: state.source_timestamp,
          overridden: state.overridden,
          acceptedCandidateId: state.accepted_candidate_id ?? null,
        }}
        badges={badges}
        isCurrentAccepted={isAccepted}
        pendingAIConfirmation={hasSharedPending}
        pendingSharedCandidateIds={pendingSharedCandidateIds}
        candidateUiContext="shared"
        showCandidateDebugIds={debugLinkedProducts}
        onManualOverride={(value) => {
          if (!canMutateFocused) return;
          overrideMut.mutate({
            componentType,
            name: item.name,
            maker: item.maker,
            property: focusedProperty,
            value,
            ...focusedMutationIds,
          });
        }}
        isPending={overrideMut.isPending || candidateAcceptMut.isPending || confirmSharedLaneMut.isPending || reviewActionMut.isPending}
        candidates={candidates}
        onAcceptCandidate={canMutateFocused ? (candidateId, candidate) => {
          candidateAcceptMut.mutate({
            componentType,
            name: item.name,
            maker: item.maker,
            property: focusedProperty,
            value: String(candidate.value ?? ''),
            candidateId,
            candidateSource: candidate.source_id || candidate.source || '',
            ...focusedMutationIds,
          });
        } : undefined}
        onConfirmSharedCandidate={hasSharedPending && canMutateFocused ? (candidateId, candidate) => {
          confirmSharedLaneMut.mutate({
            componentType,
            name: item.name,
            maker: item.maker,
            property: focusedProperty,
            candidateId,
            candidateValue: hasKnownValue(candidate?.value)
              ? String(candidate.value)
              : (hasValue ? String(state.selected.value) : undefined),
            candidateConfidence: Number.isFinite(Number(candidate?.score))
              ? Number(candidate.score)
              : Number(state.selected.confidence ?? 0),
            ...focusedMutationIds,
          });
        } : undefined}
        onConfirmShared={hasSharedPending && canMutateFocused ? () => {
          confirmSharedLaneMut.mutate({
            componentType,
            name: item.name,
            maker: item.maker,
            property: focusedProperty,
            candidateId: fallbackSharedConfirmCandidateId,
            candidateValue: hasValue ? String(state.selected.value) : undefined,
            candidateConfidence: Number(state.selected.confidence ?? 0),
            ...focusedMutationIds,
          });
        } : undefined}
        extraSections={
          <>
            {drawerPendingReviewItems.length > 0 && (
              <PendingAIReviewSection
                items={drawerPendingReviewItems}
                pendingCandidateCount={pendingSharedCandidateIds.length}
                category={category}
                queryClient={queryClient}
              />
            )}
            {state.reason_codes?.length > 0 && <FlagsSection reasonCodes={state.reason_codes} />}
            {item.linked_products && item.linked_products.length > 0 && (
              <LinkedProductsList
                products={item.linked_products}
                headerLabel={state.variance_policy || 'Match Type'}
                maxHeight={180}
                defaultExpanded
              />
            )}
            {renderDebugIdentitySection(state.slot_id ?? null)}
            {impactSection}
          </>
        }
      />
    );
  }

  const propertyKeys = Object.keys(item.properties).sort();
  const subtitle = [item.maker, componentType].filter(Boolean).join(' | ');
  const componentIdentityId = debugComponentIdentityId;

  const topBadges: Array<{ label: string; className: string }> = [
    { label: `${item.metrics.property_count} properties`, className: 'sf-chip-neutral' },
  ];
  if (item.metrics.flags > 0) {
    topBadges.push({ label: `${item.metrics.flags} flags`, className: 'sf-chip-warning' });
  }

  // "Accept Entire Row" — approves all review items and applies best values as overrides
  const acceptEntireRowMut = useMutation({
    mutationFn: async () => {
      const promises: Promise<unknown>[] = [];
      // 1. Approve all review items
      for (const ri of drawerPendingReviewItems) {
        promises.push(
          api.post(`/review-components/${category}/component-review-action`, {
            review_id: ri.review_id,
            action: ri.match_type === 'new_component' ? 'approve_new' : 'merge_alias',
            merge_target: ri.matched_component || undefined,
          }),
        );
      }
      // 2. Apply best candidate values for each property as overrides
      for (const [propKey, state] of sortedPropertyEntries) {
        const componentValueId = toPositiveId(state.slot_id);
        if (!componentValueId) continue;
        const bestCandidate = state.candidates?.[0];
        if (bestCandidate?.value != null && String(bestCandidate.value).trim()) {
          promises.push(
            api.post(`/review-components/${category}/component-override`, {
              componentType,
              name: item.name,
              maker: item.maker,
              property: propKey,
              value: String(bestCandidate.value),
              componentIdentityId,
              componentValueId,
            }),
          );
        }
      }
      // 3. Apply name + maker if they have pipeline candidates
      if (componentIdentityId && item.name_tracked?.candidates?.[0]?.source_id === 'pipeline') {
        promises.push(
          api.post(`/review-components/${category}/component-override`, {
            componentType,
            name: item.name,
            maker: item.maker,
            property: '__name',
            value: item.name,
            componentIdentityId,
          }),
        );
      }
      if (componentIdentityId && item.maker_tracked?.candidates?.[0]?.source_id === 'pipeline' && item.maker) {
        promises.push(
          api.post(`/review-components/${category}/component-override`, {
            componentType,
            name: item.name,
            maker: item.maker,
            property: '__maker',
            value: item.maker,
            componentIdentityId,
          }),
        );
      }
      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['componentReview', category] });
      queryClient.invalidateQueries({ queryKey: ['componentReviewData', category] });
      queryClient.invalidateQueries({ queryKey: ['reviewProductsIndex', category] });
      queryClient.invalidateQueries({ queryKey: ['componentImpact'] });
    },
  });

  return (
    <DrawerShell title={item.name} subtitle={subtitle} onClose={onClose}>
      {isSynthetic && (
        <DrawerSection title="New Component">
          <div className="px-3 py-2 sf-callout sf-callout-accent rounded space-y-2">
            <div className="text-xs sf-status-text-info font-medium">
              This component was discovered by the pipeline but doesn't exist in the database yet.
            </div>
            <ActionTooltip text="Accept all suggested values and approve this entire new component row.">
              <button
                onClick={() => acceptEntireRowMut.mutate()}
                disabled={acceptEntireRowMut.isPending || overrideMut.isPending}
                className="w-full px-3 py-2 text-sm font-medium rounded sf-primary-button disabled:opacity-50"
              >
                {acceptEntireRowMut.isPending ? 'Accepting...' : 'Accept Entire Row'}
              </button>
            </ActionTooltip>
            <div className="sf-text-nano sf-text-muted">
              Approves all review items and accepts best candidate values for every property.
            </div>
          </div>
        </DrawerSection>
      )}
      {!isSynthetic && drawerPendingReviewItems.length > 0 && (
        <DrawerSection title="AI Review">
          <div className="px-3 py-2 sf-callout sf-callout-accent rounded space-y-2">
            <div className="text-xs sf-status-text-info font-medium">
              {drawerPendingReviewItems.length} pipeline match{drawerPendingReviewItems.length !== 1 ? 'es' : ''} pending review
            </div>
            <ActionTooltip text="Accept all best candidate values and approve pending AI review items for this component.">
              <button
                onClick={() => acceptEntireRowMut.mutate()}
                disabled={acceptEntireRowMut.isPending || overrideMut.isPending}
                className="w-full px-3 py-1.5 sf-text-label font-medium rounded sf-drawer-apply-button disabled:opacity-50"
              >
                {acceptEntireRowMut.isPending ? 'Accepting...' : 'Accept All Values + Approve'}
              </button>
            </ActionTooltip>
            <div className="sf-text-nano sf-text-muted">
              Approves review items and accepts best candidate values for every property.
            </div>
          </div>
        </DrawerSection>
      )}
      {drawerPendingReviewItems.length > 0 && (
        <PendingAIReviewSection items={drawerPendingReviewItems} category={category} queryClient={queryClient} />
      )}
      <DrawerSection title="Identity">
        <DrawerValueRow
          color={confidenceColor(item.metrics.confidence)}
          value={item.name}
          confidence={item.metrics.confidence}
        />
        <DrawerBadges badges={topBadges} />
        <div className="mt-2 space-y-1.5">
          <IdentityOverrideRow
            label="Name"
            value={item.name}
            tracked={item.name_tracked}
            property="__name"
            onOverride={(prop, val) => {
              if (!canMutateProperty(prop)) return;
              overrideMut.mutate({
                componentType,
                name: item.name,
                maker: item.maker,
                property: prop,
                value: val,
                ...getMutationIds(prop),
              });
            }}
            isPending={overrideMut.isPending}
          />
          <IdentityOverrideRow
            label="Maker"
            value={item.maker}
            tracked={item.maker_tracked}
            property="__maker"
            onOverride={(prop, val) => {
              if (!canMutateProperty(prop)) return;
              overrideMut.mutate({
                componentType,
                name: item.name,
                maker: item.maker,
                property: prop,
                value: val,
                ...getMutationIds(prop),
              });
            }}
            isPending={overrideMut.isPending}
          />
        </div>
      </DrawerSection>

      {(() => {
        const flaggedProps = sortedPropertyEntries
          .filter(([, state]) => state.needs_review)
          .map(([key, state]) => ({ key, reasonCodes: state.reason_codes || ['missing_value'] }));
        return flaggedProps.length > 0 ? <FlagsOverviewSection flaggedProperties={flaggedProps} /> : null;
      })()}

      <AliasEditor
        aliases={item.aliases}
        overridden={item.aliases_overridden}
        onSave={(items) => {
          if (!canMutateProperty('__aliases')) return;
          overrideMut.mutate({
            componentType,
            name: item.name,
            maker: item.maker,
            property: '__aliases',
            value: items,
            ...getMutationIds('__aliases'),
          });
        }}
        isPending={overrideMut.isPending}
      />

      <LinksEditor
        links={item.links}
        tracked={item.links_tracked}
        onSave={(items) => {
          if (!canMutateProperty('__links')) return;
          overrideMut.mutate({
            componentType,
            name: item.name,
            maker: item.maker,
            property: '__links',
            value: items,
            ...getMutationIds('__links'),
          });
        }}
        isPending={overrideMut.isPending}
      />

      {impactQuery.data && impactQuery.data.total > 0 && (
        <DrawerSection title="Product Impact">
          <div className="px-3 py-2 sf-callout sf-callout-info rounded text-xs">
            {impactQuery.data.total} product{impactQuery.data.total !== 1 ? 's' : ''} reference this component. Changes will cascade.
          </div>
          <div className="max-h-[100px] overflow-y-auto space-y-0.5 mt-1">
            {(impactQuery.data.affected_products || []).slice(0, 15).map((p) => (
              <div key={p.productId} className="sf-text-nano sf-text-muted truncate">{p.productId}</div>
            ))}
          </div>
        </DrawerSection>
      )}

      {item.linked_products && item.linked_products.length > 0 && (
        <DrawerSection title="Linked Products">
          <LinkedProductsList
            products={item.linked_products}
            headerLabel="Match Type"
            maxHeight={220}
            defaultExpanded
          />
        </DrawerSection>
      )}

      <DrawerSection title={`Properties (${propertyKeys.length})`} bodyClassName="space-y-2">
        {propertyKeys.map((key) => (
          <PropertyCard
            key={key}
            propKey={key}
            state={item.properties[key]}
            onOverride={(value) => {
              if (!canMutateProperty(key)) return;
              overrideMut.mutate({
                componentType,
                name: item.name,
                maker: item.maker,
                property: key,
                value,
                ...getMutationIds(key),
              });
            }}
            isPending={overrideMut.isPending}
            getLabel={getLabel}
          />
        ))}
      </DrawerSection>
    </DrawerShell>
  );
}
