import BulkPasteGrid, {
  type BulkGridRow,
} from "../../../shared/ui/forms/BulkPasteGrid.tsx";
import type { BulkKeyRow } from "../state/keyUtils.ts";
import {
  selectCls,
  labelCls,
} from "./studioConstants.ts";
import {
  btnPrimary,
  btnSecondary,
} from "./studioSharedTypes.ts";

export interface KeyBulkPasteModalProps {
  bulkGridRows: BulkGridRow[];
  onGridRowsChange: (rows: BulkGridRow[]) => void;
  bulkGroup: string;
  onBulkGroupChange: (group: string) => void;
  bulkPreviewRows: BulkKeyRow[];
  bulkCounts: { ready: number; existing: number; duplicate: number; invalid: number };
  bulkReadyRows: BulkKeyRow[];
  existingGroups: string[];
  onImport: () => void;
  onClose: () => void;
}

export function KeyBulkPasteModal({
  bulkGridRows,
  onGridRowsChange,
  bulkGroup,
  onBulkGroupChange,
  bulkPreviewRows,
  bulkCounts,
  bulkReadyRows,
  existingGroups,
  onImport,
  onClose,
}: KeyBulkPasteModalProps) {
  return (
    <div className="sf-overlay-muted fixed inset-0 z-40 p-4 flex items-start md:items-center justify-center">
      <div className="sf-surface-elevated w-full max-w-5xl max-h-[92vh] overflow-hidden rounded border sf-border-default shadow-2xl flex flex-col">
        <div className="px-4 py-3 border-b sf-border-default flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold">
              Bulk Paste Keys + Labels
            </h4>
            <p className="text-xs sf-text-muted mt-0.5">
              Paste two columns: <strong>Key</strong> and{" "}
              <strong>Label</strong> (tab-separated from your spreadsheet
              tool).
            </p>
          </div>
          <button
            onClick={onClose}
            className="sf-text-subtle hover:sf-text-muted text-lg leading-snug"
            aria-label="Close bulk paste modal"
          >
            &times;
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-auto">
          <div className="grid grid-cols-1 md:grid-cols-[260px,1fr] gap-3 items-end">
            <div>
              <label className={labelCls}>Group</label>
              <select
                value={bulkGroup}
                onChange={(e) => onBulkGroupChange(e.target.value)}
                className={`${selectCls} w-full`}
              >
                <option value="">ungrouped</option>
                {existingGroups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div className="text-xs sf-text-muted">
              Type or paste two columns from a spreadsheet. Label is
              optional (auto-generated from key).
            </div>
          </div>

          <BulkPasteGrid
            col1Header="Key"
            col2Header="Label"
            col1Placeholder="sensor_dpi_max"
            col2Placeholder="Max DPI"
            rows={bulkGridRows}
            onChange={onGridRowsChange}
            col1Mono
          />

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-2 py-1 rounded sf-chip-success">
              Ready: {bulkCounts.ready}
            </span>
            <span className="px-2 py-1 rounded sf-chip-info">
              Existing: {bulkCounts.existing}
            </span>
            <span className="px-2 py-1 rounded sf-chip-warning-soft">
              Duplicates: {bulkCounts.duplicate}
            </span>
            <span className="px-2 py-1 rounded sf-chip-danger">
              Invalid: {bulkCounts.invalid}
            </span>
            <span className="px-2 py-1 rounded sf-bg-surface-soft-strong sf-dk-surface-700 sf-text-muted sf-dk-fg-200">
              Rows: {bulkPreviewRows.length}
            </span>
          </div>

          {bulkPreviewRows.length > 0 && (
            <div className="border sf-border-default rounded overflow-auto max-h-[24vh]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 sf-bg-surface-soft sf-dk-surface-900a70 border-b sf-border-default">
                  <tr>
                    <th className="text-left px-2 py-1.5 w-12">#</th>
                    <th className="text-left px-2 py-1.5">Key</th>
                    <th className="text-left px-2 py-1.5">Label</th>
                    <th className="text-left px-2 py-1.5 w-36">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkPreviewRows.map((row) => {
                    const statusCls =
                      row.status === "ready"
                        ? "sf-chip-success"
                        : row.status === "duplicate_existing"
                          ? "sf-chip-info"
                          : row.status === "duplicate_in_paste"
                            ? "sf-chip-warning-soft"
                            : "sf-chip-danger";
                    return (
                      <tr
                        key={`${row.rowNumber}-${row.key}-${row.raw}`}
                        className="sf-divider-soft"
                      >
                        <td className="px-2 py-1.5 sf-text-muted">
                          {row.rowNumber}
                        </td>
                        <td className="px-2 py-1.5 font-mono">
                          {row.key || (
                            <span className="italic sf-text-subtle">
                              &mdash;
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          {row.label || (
                            <span className="italic sf-text-subtle">
                              &mdash;
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full ${statusCls}`}
                          >
                            {row.reason}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t sf-border-default flex items-center justify-between gap-2">
          <div className="text-xs sf-text-muted">
            Ready rows will be added to group{" "}
            <strong>{bulkGroup || "ungrouped"}</strong>.
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className={btnSecondary}
            >
              Close
            </button>
            <button
              onClick={onImport}
              disabled={bulkReadyRows.length === 0}
              className={btnPrimary}
            >
              {`Import ${bulkReadyRows.length} Ready Row${bulkReadyRows.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
