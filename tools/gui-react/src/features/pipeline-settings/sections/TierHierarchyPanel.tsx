// WHY: Drag-and-drop panel for reordering Tier 1 query generation priority.
// Reads/writes the tierHierarchyOrder CSV setting via the standard onStringChange callback.

import { useState, useCallback, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type TierGroupId = 'brand_seeds' | 'spec_seeds' | 'source_seeds' | 'group_searches' | 'key_searches';

const KNOWN_TIERS: readonly TierGroupId[] = ['brand_seeds', 'spec_seeds', 'source_seeds', 'group_searches', 'key_searches'];
const DEFAULT_ORDER: readonly TierGroupId[] = ['brand_seeds', 'spec_seeds', 'source_seeds', 'group_searches', 'key_searches'];

interface TierMeta {
  readonly id: TierGroupId;
  readonly label: string;
  readonly description: string;
  readonly detail?: string;
}

const TIER_META: Record<TierGroupId, TierMeta> = {
  brand_seeds: { id: 'brand_seeds', label: 'Brand Seeds', description: 'Official brand and support domain queries from Brand Resolver' },
  spec_seeds: { id: 'spec_seeds', label: 'Specification Seeds', description: 'Per-category spec seed templates (configured in Deterministic Strategy)' },
  source_seeds: { id: 'source_seeds', label: 'Source Seeds', description: 'Category source host queries from NeedSet seed status' },
  group_searches: { id: 'group_searches', label: 'Group Searches', description: 'Broad queries per search-worthy field group, ordered by productivity' },
  key_searches: { id: 'key_searches', label: 'Key Searches', description: 'Individual field queries with progressive enrichment', detail: '3a: bare query \u2192 3b: +aliases \u2192 3c: +domain hints \u2192 3d: +content types' },
};

function parseTierOrder(csv: unknown): TierGroupId[] {
  const raw = String(csv ?? '').trim();
  if (!raw) return [...DEFAULT_ORDER];
  const seen = new Set<string>();
  const result: TierGroupId[] = [];
  for (const token of raw.split(',')) {
    const id = token.trim() as TierGroupId;
    if ((KNOWN_TIERS as readonly string[]).includes(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result.length > 0 ? result : [...DEFAULT_ORDER];
}

interface SortableTierCardProps {
  tier: TierMeta;
  position: number;
  isDragOverlay?: boolean;
}

function SortableTierCard({ tier, position, isDragOverlay }: SortableTierCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tier.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const cardContent = (
    <div className="flex items-center gap-3">
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full sf-callout sf-callout-info text-xs font-bold">
        {position}
      </span>
      <div className="min-w-0 flex-1">
        <div className="sf-text-label font-semibold">{tier.label}</div>
        <p className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>{tier.description}</p>
        {tier.detail && (
          <p className="sf-text-caption font-mono text-[10px] mt-0.5" style={{ color: 'var(--sf-muted)' }}>{tier.detail}</p>
        )}
      </div>
      <span
        className="cursor-grab active:cursor-grabbing sf-text-subtle hover:sf-text-muted select-none text-base px-1"
        {...(isDragOverlay ? {} : { ...attributes, ...listeners })}
        aria-label={`Drag to reorder ${tier.label}`}
      >
        &#x2630;
      </span>
    </div>
  );

  if (isDragOverlay) {
    return (
      <div className="rounded sf-surface-elevated shadow-lg border border-accent/30 px-3 py-2.5">
        {cardContent}
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} className="rounded sf-surface-card border sf-border-soft px-3 py-2.5">
      {cardContent}
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="flex justify-center py-0.5">
      <svg viewBox="0 0 12 16" className="h-4 w-3 sf-text-subtle" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
        <path d="M6 1v11M3 9l3 4 3-4" />
      </svg>
    </div>
  );
}

// ── Key Search Enrichment (3a/3b/3c/3d) ──

type EnrichmentId = 'aliases' | 'domain_hints' | 'content_types';

const KNOWN_ENRICHMENTS: readonly EnrichmentId[] = ['aliases', 'domain_hints', 'content_types'];
const DEFAULT_ENRICHMENT_ORDER: readonly EnrichmentId[] = ['aliases', 'domain_hints', 'content_types'];

interface EnrichmentMeta {
  readonly id: EnrichmentId;
  readonly label: string;
  readonly description: string;
}

const ENRICHMENT_META: Record<EnrichmentId, EnrichmentMeta> = {
  aliases: { id: 'aliases', label: 'Aliases', description: 'Field name synonyms and alternate terms' },
  domain_hints: { id: 'domain_hints', label: 'Domain Hints', description: 'Preferred source domains (untried first)' },
  content_types: { id: 'content_types', label: 'Content Types', description: 'Document type hints (spec sheet, review, etc.)' },
};

function parseEnrichmentOrder(csv: unknown): EnrichmentId[] {
  const raw = String(csv ?? '').trim();
  if (!raw) return [...DEFAULT_ENRICHMENT_ORDER];
  const seen = new Set<string>();
  const result: EnrichmentId[] = [];
  for (const token of raw.split(',')) {
    const id = token.trim() as EnrichmentId;
    if ((KNOWN_ENRICHMENTS as readonly string[]).includes(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result.length > 0 ? result : [...DEFAULT_ENRICHMENT_ORDER];
}

function SortableEnrichmentItem({ meta, position, isDragOverlay }: { meta: EnrichmentMeta; position: number; isDragOverlay?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: meta.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const content = (
    <div className="flex items-center gap-2">
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full sf-callout sf-callout-neutral text-[10px] font-bold">
        {position}
      </span>
      <div className="min-w-0 flex-1">
        <span className="sf-text-label font-medium text-sm">{meta.label}</span>
        <span className="sf-text-caption ml-1.5" style={{ color: 'var(--sf-muted)' }}>{meta.description}</span>
      </div>
      <span
        className="cursor-grab active:cursor-grabbing sf-text-subtle hover:sf-text-muted select-none text-xs px-0.5"
        {...(isDragOverlay ? {} : { ...attributes, ...listeners })}
      >
        &#x2630;
      </span>
    </div>
  );

  if (isDragOverlay) {
    return <div className="rounded sf-surface-elevated shadow-lg border border-accent/30 px-2.5 py-1.5">{content}</div>;
  }
  return <div ref={setNodeRef} style={style} className="rounded sf-surface-card border sf-border-soft px-2.5 py-1.5">{content}</div>;
}

export interface TierHierarchyPanelProps {
  runtimeDraft: Record<string, unknown>;
  onStringChange: (key: string, value: string) => void;
  disabled?: boolean;
}

export default function TierHierarchyPanel({ runtimeDraft, onStringChange, disabled }: TierHierarchyPanelProps) {
  const order = useMemo(() => parseTierOrder(runtimeDraft.tierHierarchyOrder), [runtimeDraft.tierHierarchyOrder]);
  const enrichmentOrder = useMemo(() => parseEnrichmentOrder(runtimeDraft.keySearchEnrichmentOrder), [runtimeDraft.keySearchEnrichmentOrder]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeEnrichmentId, setActiveEnrichmentId] = useState<string | null>(null);

  // WHY: Each DndContext needs its own sensor instance to avoid event listener conflicts.
  const tierSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  const enrichmentSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id || disabled) return;
    const oldIndex = order.indexOf(active.id as TierGroupId);
    const newIndex = order.indexOf(over.id as TierGroupId);
    if (oldIndex < 0 || newIndex < 0) return;
    const newOrder = arrayMove(order, oldIndex, newIndex);
    onStringChange('tierHierarchyOrder', newOrder.join(','));
  }, [order, onStringChange, disabled]);

  const activeTier = activeId ? TIER_META[activeId as TierGroupId] : null;
  const activePosition = activeId ? order.indexOf(activeId as TierGroupId) + 1 : 0;

  const budgetCap = typeof runtimeDraft.searchProfileQueryCap === 'number'
    ? runtimeDraft.searchProfileQueryCap
    : 10;

  return (
    <div className="space-y-3">
      <p className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
        Drag to reorder query generation priority. Higher tiers get first dibs on the query budget.
      </p>

      <DndContext
        sensors={tierSensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <div className="space-y-0">
            {order.map((id, idx) => (
              <div key={id}>
                {idx > 0 && <FlowArrow />}
                <SortableTierCard tier={TIER_META[id]} position={idx + 1} />
              </div>
            ))}
          </div>
        </SortableContext>
        <DragOverlay>
          {activeTier ? <SortableTierCard tier={activeTier} position={activePosition} isDragOverlay /> : null}
        </DragOverlay>
      </DndContext>

      <FlowArrow />

      {/* Budget cap indicator (read-only) */}
      <div className="rounded sf-surface-card border sf-border-soft px-3 py-2.5">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full sf-callout sf-callout-neutral text-xs font-bold">
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <rect x="2" y="4" width="12" height="8" rx="1" />
              <path d="M5 4V2.5a1.5 1.5 0 0 1 3 0V4M8 4V2.5a1.5 1.5 0 0 1 3 0V4" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <div className="sf-text-label font-semibold">Budget Cap</div>
            <p className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
              searchProfileQueryCap = {String(budgetCap)} — total queries across all tiers
            </p>
          </div>
        </div>
      </div>

      {/* Key Search Enrichment Order — separate DnD context, only visible when key_searches is in the tier order */}
      {order.includes('key_searches') && (
        <div className="mt-4 space-y-2">
          <div className="sf-text-caption font-semibold uppercase" style={{ color: 'var(--sf-muted)' }}>
            Key Search Enrichment Order
          </div>
          <p className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
            Controls what gets appended after <code className="font-mono text-xs">{'{product} {key}'}</code> at each repeat level.
          </p>

          <div className="rounded sf-surface-card border sf-border-soft px-2.5 py-1.5">
            <span className="sf-text-label text-sm font-mono" style={{ color: 'var(--sf-muted)' }}>
              base: {'{product} {key}'}
            </span>
            <span className="sf-text-caption ml-2" style={{ color: 'var(--sf-muted)' }}>(always first)</span>
          </div>

          <DndContext
            sensors={enrichmentSensors}
            collisionDetection={closestCenter}
            onDragStart={(e) => setActiveEnrichmentId(String(e.active.id))}
            onDragEnd={(e) => {
              setActiveEnrichmentId(null);
              const { active, over } = e;
              if (!over || active.id === over.id || disabled) return;
              const oldIdx = enrichmentOrder.indexOf(active.id as EnrichmentId);
              const newIdx = enrichmentOrder.indexOf(over.id as EnrichmentId);
              if (oldIdx < 0 || newIdx < 0) return;
              const next = arrayMove(enrichmentOrder, oldIdx, newIdx);
              onStringChange('keySearchEnrichmentOrder', next.join(','));
            }}
          >
            <SortableContext items={enrichmentOrder} strategy={verticalListSortingStrategy}>
              <div className="space-y-1">
                {enrichmentOrder.map((id, idx) => (
                  <SortableEnrichmentItem key={id} meta={ENRICHMENT_META[id]} position={idx + 1} />
                ))}
              </div>
            </SortableContext>
            <DragOverlay>
              {activeEnrichmentId ? (
                <SortableEnrichmentItem
                  meta={ENRICHMENT_META[activeEnrichmentId as EnrichmentId]}
                  position={enrichmentOrder.indexOf(activeEnrichmentId as EnrichmentId) + 1}
                  isDragOverlay
                />
              ) : null}
            </DragOverlay>
          </DndContext>

          <p className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
            repeat=1 applies enrichment #1, repeat=2 applies #1+#2, repeat=3+ applies all.
          </p>
        </div>
      )}
    </div>
  );
}
