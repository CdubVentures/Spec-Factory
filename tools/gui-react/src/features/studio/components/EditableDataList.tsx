import { usePersistedToggle } from "../../../stores/collapseStore.ts";
import { Tip } from "../../../shared/ui/feedback/Tip.tsx";
import { TagPicker } from "../../../shared/ui/forms/TagPicker.tsx";
import {
  labelCls,
  STUDIO_TIPS,
} from "./studioConstants.ts";
import { type DataListEntry } from "./studioSharedTypes.ts";
import { displayLabel } from "../state/studioDisplayLabel.ts";

export interface EditableDataListProps {
  entry: DataListEntry;
  index: number;
  isDuplicate: boolean;
  onUpdate: (updates: Partial<DataListEntry>) => void;
}

export function EditableDataList({
  entry,
  index,
  isDuplicate,
  onUpdate,
}: EditableDataListProps) {
  const dlKey = entry.field || `idx-${index}`;
  const [expanded, , setExpanded] = usePersistedToggle(
    `studio:dataList:${dlKey}:expanded`,
    false,
  );

  const valueCount = entry.manual_values.length;
  const listTitle = entry.field
    ? entry.label || displayLabel(entry.field)
    : `Enum ${index + 1}`;

  // Collapsed view
  if (!expanded) {
    return (
      <div className="border sf-border-default rounded sf-bg-surface-soft sf-dk-surface-750">
        <div className="w-full flex items-center gap-2 px-3 py-2">
          <button
            type="button"
            onClick={() => {
              setExpanded(true);
            }}
            className="relative flex-1 min-w-0 py-2 text-sm font-semibold text-left sf-text-muted sf-dk-fg-100 hover:sf-text-primary sf-dk-hover-fg-white"
          >
            <span className="absolute left-0 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-5 h-5 border sf-border-soft rounded text-xs font-medium sf-text-muted">
              +
            </span>
            <span className="w-full text-left px-6 truncate">{listTitle}</span>
            <span className="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center gap-2">
              {valueCount > 0 ? (
                <span className="text-xs sf-text-muted">
                  {valueCount} values
                </span>
              ) : null}
              {isDuplicate ? (
                <span className="text-xs sf-danger-text-soft font-medium">
                  Duplicate!
                </span>
              ) : null}
            </span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border sf-border-default rounded p-3 space-y-3 sf-bg-surface-soft sf-dk-surface-750">
      {/* Single header row: collapse + title + identity chips + counts */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="inline-flex items-center gap-2 text-sm font-semibold text-left sf-text-muted sf-dk-fg-100 hover:sf-text-primary sf-dk-hover-fg-white"
        >
          <span className="inline-flex items-center justify-center w-5 h-5 border sf-border-soft rounded text-xs font-medium sf-text-muted">
            -
          </span>
          <span className="truncate">{listTitle}</span>
        </button>
        <span className="text-[10px] px-1.5 py-0.5 rounded border sf-border-soft sf-text-subtle font-mono">
          Key: {entry.field}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded border sf-border-soft sf-text-subtle font-mono">
          Enum: data_lists.{entry.field}
        </span>
        <span className="flex-1" />
        {valueCount > 0 ? (
          <span className="text-xs sf-text-muted">{valueCount} values</span>
        ) : null}
        {isDuplicate ? (
          <span className="text-xs sf-danger-text-soft font-medium">
            Duplicate!
          </span>
        ) : null}
      </div>

      {isDuplicate && (
        <div className="text-xs sf-callout sf-callout-danger rounded px-2 py-1">
          Warning: Another data list uses the same field name "{entry.field}".
          Each field should have only one list.
        </div>
      )}

      {/* Manual values */}
      <div>
        <label className={labelCls}>
          Values{" "}
          <Tip
            style={{ position: "relative", left: "-3px", top: "-4px" }}
            text={STUDIO_TIPS.data_list_manual_values}
          />
        </label>
        <TagPicker
          values={entry.manual_values}
          onChange={(v) => onUpdate({ manual_values: v })}
          placeholder="Type a value and press Enter..."
        />
      </div>
    </div>
  );
}
