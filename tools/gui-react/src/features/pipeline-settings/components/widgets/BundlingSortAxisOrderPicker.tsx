// WHY: Drag-and-drop widget for reordering the 3-axis precedence used by
// the keyFinder bundler and bulk Run/Loop dispatch lines. Same visual pattern
// as TierHierarchyPanel (dnd-kit vertical sortable list with FlowArrows between
// cards). Reads and writes the `bundlingSortAxisOrder` CSV knob via
// FinderSettingWidgetProps.

import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
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
import type { FinderSettingWidgetProps } from './widgetRegistry.ts';

type AxisId = 'difficulty' | 'required_level' | 'availability';

const DEFAULT_ORDER: readonly AxisId[] = ['difficulty', 'required_level', 'availability'];
const KNOWN_AXES: ReadonlySet<string> = new Set(DEFAULT_ORDER);

interface AxisMeta {
  readonly id: AxisId;
  readonly label: string;
  readonly description: string;
  readonly withinRank: string;
}

const AXIS_META: Record<AxisId, AxisMeta> = {
  difficulty: {
    id: 'difficulty',
    label: 'Difficulty',
    description: 'Tier of the key — easier keys run or ride first.',
    withinRank: 'easy < medium < hard < very_hard',
  },
  required_level: {
    id: 'required_level',
    label: 'Required Level',
    description: 'Mandatory vs. non-mandatory under the category contract.',
    withinRank: 'mandatory < non_mandatory',
  },
  availability: {
    id: 'availability',
    label: 'Availability',
    description: 'How often the field is published across products.',
    withinRank: 'always < sometimes < rare',
  },
};

function parseCsv(csv: string): AxisId[] {
  const raw = String(csv ?? '').trim();
  if (!raw) return [...DEFAULT_ORDER];
  const seen = new Set<string>();
  const result: AxisId[] = [];
  for (const token of raw.split(',')) {
    const id = token.trim();
    if (KNOWN_AXES.has(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id as AxisId);
    }
  }
  if (result.length === 0) return [...DEFAULT_ORDER];
  for (const axis of DEFAULT_ORDER) {
    if (!seen.has(axis)) result.push(axis);
  }
  return result;
}

function SortableAxisCard({ meta, position, disabled, isDragOverlay }: {
  readonly meta: AxisMeta;
  readonly position: number;
  readonly disabled?: boolean;
  readonly isDragOverlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: meta.id,
    disabled,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const content = (
    <div className="flex items-center gap-3">
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full sf-callout sf-callout-info text-xs font-bold">
        {position}
      </span>
      <div className="min-w-0 flex-1">
        <div className="sf-text-label font-semibold">{meta.label}</div>
        <p className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>{meta.description}</p>
        <p className="sf-text-caption font-mono text-[10px] mt-0.5" style={{ color: 'var(--sf-muted)' }}>
          {meta.withinRank}
        </p>
      </div>
      <span
        className="cursor-grab active:cursor-grabbing sf-text-subtle hover:sf-text-muted select-none text-base px-1"
        {...(isDragOverlay || disabled ? {} : { ...attributes, ...listeners })}
        aria-label={`Drag to reorder ${meta.label}`}
      >
        &#x2630;
      </span>
    </div>
  );

  if (isDragOverlay) {
    return (
      <div className="rounded sf-surface-elevated shadow-lg border border-accent/30 px-3 py-2.5">
        {content}
      </div>
    );
  }
  return (
    <div ref={setNodeRef} style={style} className="rounded sf-surface-card border sf-border-soft px-3 py-2.5">
      {content}
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

export function BundlingSortAxisOrderPicker({ entry, value, isSaving, onSave }: FinderSettingWidgetProps) {
  const order = useMemo(() => parseCsv(value), [value]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // If the stored CSV isn't canonical (missing axis, garbage, wrong casing),
  // normalize it the first time the widget mounts so the knob converges to
  // a valid state without user action.
  const normalizedOnce = useRef(false);
  useEffect(() => {
    if (normalizedOnce.current) return;
    normalizedOnce.current = true;
    const canonical = order.join(',');
    if (canonical !== (value ?? '').trim()) {
      onSave(entry.key, canonical);
    }
  }, [order, value, entry.key, onSave]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id || isSaving) return;
    const oldIndex = order.indexOf(active.id as AxisId);
    const newIndex = order.indexOf(over.id as AxisId);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(order as AxisId[], oldIndex, newIndex);
    onSave(entry.key, next.join(','));
  }, [order, onSave, isSaving, entry.key]);

  const activeMeta = activeId ? AXIS_META[activeId as AxisId] : null;
  const activePosition = activeId ? order.indexOf(activeId as AxisId) + 1 : 0;

  const label = entry.uiLabel ?? 'Bulk and bundling sort order';
  const tip = typeof entry.uiTip === 'string' && entry.uiTip.length > 0
    ? entry.uiTip
    : 'Drag to reorder passenger packing and bulk Run/Loop dispatch. The first row is most significant.';

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <span className="sf-text-label sf-text-primary">{label}</span>
        <p className="sf-text-caption sf-text-muted">{tip}</p>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={order as string[]} strategy={verticalListSortingStrategy}>
          <div className="space-y-0">
            {order.map((id, idx) => (
              <div key={id}>
                {idx > 0 && <FlowArrow />}
                <SortableAxisCard meta={AXIS_META[id]} position={idx + 1} disabled={isSaving} />
              </div>
            ))}
          </div>
        </SortableContext>
        <DragOverlay>
          {activeMeta ? (
            <SortableAxisCard meta={activeMeta} position={activePosition} isDragOverlay />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
