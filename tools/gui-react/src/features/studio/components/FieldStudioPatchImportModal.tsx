import { useMemo, useRef, useState, type DragEvent, type ChangeEvent } from "react";
import {
  applyFieldStudioPatchImport,
  buildFieldStudioPatchImportRequest,
  previewFieldStudioPatchImport,
  resolveFieldStudioPatchChangeKey,
  summarizeFieldStudioPatchImportPreview,
  type FieldStudioPatchApplyResponse,
  type FieldStudioPatchImportChange,
  type FieldStudioPatchImportPreview,
  type FieldStudioPatchImportRequest,
} from "../state/fieldStudioPatchImport.ts";
import { btnPrimary, btnSecondary } from "./studioSharedTypes.ts";

export interface FieldStudioPatchImportModalProps {
  category: string;
  open: boolean;
  onClose: () => void;
  onApplied: () => void | Promise<void>;
}

function compactJson(value: unknown): string {
  if (value === undefined) return "empty";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function formatImportError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const bodyMatch = message.match(/^API \d+:\s*(.*)$/s);
  if (!bodyMatch) return message;
  try {
    const parsed = JSON.parse(bodyMatch[1]);
    if (typeof parsed?.message === "string") return parsed.message;
    if (Array.isArray(parsed?.errors)) return parsed.errors.join("; ");
  } catch {
    return message;
  }
  return message;
}

function changeBadgeClass(change: FieldStudioPatchImportChange): string {
  if (change.action === "added") return "sf-chip-success";
  if (change.kind === "key_added") return "sf-chip-success";
  if (change.kind === "group_added") return "sf-chip-info";
  if (change.kind === "rename_proposed") return "sf-chip-warning-soft";
  if (change.kind === "component_source" || change.kind === "component_property") return "sf-chip-info";
  return "sf-chip-warning-soft";
}

function changeActionLabel(change: FieldStudioPatchImportChange): string {
  if (change.action) return change.action;
  if (change.kind === "key_added" || change.kind === "group_added") return "added";
  if (change.kind === "key_moved") return "moved";
  if (change.kind === "rename_proposed") return "proposed";
  return "changed";
}

function changePathLabel(change: FieldStudioPatchImportChange): string {
  if (change.path) return change.path;
  if (change.kind === "key_added" && change.key) return `field_key_order.${change.key}`;
  if (change.kind === "key_moved" && change.key) return `field_key_order.${change.key}`;
  if (change.kind === "group_added" && change.groupKey) return `field_key_order.group.${change.groupKey}`;
  if (change.kind === "rename_proposed" && change.from && change.to) return `rename_keys.${change.from}.${change.to}`;
  return change.kind;
}

function changeBeforeValue(change: FieldStudioPatchImportChange): unknown {
  if (change.before !== undefined) return change.before;
  if (change.beforeIndex !== undefined) return change.beforeIndex;
  if (change.kind === "rename_proposed") return change.from;
  return undefined;
}

function changeAfterValue(change: FieldStudioPatchImportChange): unknown {
  if (change.after !== undefined) return change.after;
  if (change.afterIndex !== undefined) return change.afterIndex;
  if (change.kind === "rename_proposed") return change.to;
  if (change.kind === "key_added") return change.groupKey;
  return undefined;
}

export function FieldStudioPatchImportModal({
  category,
  open,
  onClose,
  onApplied,
}: FieldStudioPatchImportModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [request, setRequest] = useState<FieldStudioPatchImportRequest | null>(null);
  const [preview, setPreview] = useState<FieldStudioPatchImportPreview | null>(null);
  const [applied, setApplied] = useState<FieldStudioPatchApplyResponse | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<"preview" | "apply" | null>(null);
  const summary = useMemo(
    () => summarizeFieldStudioPatchImportPreview(preview),
    [preview],
  );

  if (!open) return null;

  async function loadFiles(files: FileList | File[]) {
    const selected = Array.from(files);
    setApplied(null);
    setPreview(null);
    setError("");
    if (selected.length === 0) return;
    setPending("preview");
    try {
      const nextRequest = await buildFieldStudioPatchImportRequest(selected);
      setRequest(nextRequest);
      setPreview(await previewFieldStudioPatchImport(category, nextRequest));
    } catch (err) {
      setRequest(null);
      setError(formatImportError(err));
    } finally {
      setPending(null);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (files) void loadFiles(files);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    void loadFiles(event.dataTransfer.files);
  }

  async function handleApply() {
    if (!request || !preview?.valid || preview.changes.length === 0) return;
    setPending("apply");
    setError("");
    try {
      const response = await applyFieldStudioPatchImport(category, request);
      setApplied(response);
      await onApplied();
      onClose();
    } catch (err) {
      setError(formatImportError(err));
    } finally {
      setPending(null);
    }
  }

  return (
    <div
      className="sf-overlay-muted fixed inset-0 z-40 p-4 flex items-start md:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="field-studio-patch-import-title"
      onClick={onClose}
    >
      <div
        className="sf-surface-elevated w-[96vw] h-[92vh] max-w-[1800px] overflow-hidden rounded border sf-border-default shadow-2xl flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-4 py-3 border-b sf-border-default flex items-center justify-between">
          <div>
            <h4 id="field-studio-patch-import-title" className="text-sm font-semibold">
              Import Auditor JSON
            </h4>
            <p className="text-xs sf-text-muted mt-0.5">
              Category: <span className="font-mono sf-text-primary">{category}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="sf-text-subtle hover:sf-text-muted text-lg leading-snug"
            aria-label="Close import modal"
          >
            &times;
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-auto">
          <div
            className="border border-dashed sf-border-default rounded p-5 sf-bg-surface-soft text-center"
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".json"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              className={btnSecondary}
              onClick={() => inputRef.current?.click()}
              disabled={pending !== null}
            >
              Select JSON Files
            </button>
            <div className="text-xs sf-text-muted mt-2">
              Drop one or many auditor response files here.
            </div>
          </div>

          {error && (
            <div className="sf-chip-danger rounded px-3 py-2 text-xs">
              {error}
            </div>
          )}

          {pending === "preview" && (
            <div className="text-xs sf-text-muted">Validating files...</div>
          )}

          {preview && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2 py-1 rounded sf-chip-info">
                  Files: {summary.fileCount}
                </span>
                <span className="px-2 py-1 rounded sf-chip-warning-soft">
                  Changes: {summary.changeCount}
                </span>
                <span className="px-2 py-1 rounded sf-chip-success">
                  Keys: {summary.keyCount}
                </span>
                <span className="px-2 py-1 rounded sf-chip-info">
                  Components: {summary.componentCount}
                </span>
                {summary.warningCount > 0 && (
                  <span className="px-2 py-1 rounded sf-chip-warning-soft">
                    Warnings: {summary.warningCount}
                  </span>
                )}
              </div>

              <div className="border sf-border-default rounded overflow-auto max-h-[66vh]">
                <table className="w-full min-w-[1280px] text-xs table-fixed">
                  <thead className="sticky top-0 sf-bg-surface-soft border-b sf-border-default">
                    <tr>
                      <th className="text-left px-3 py-2 w-40">Key</th>
                      <th className="text-left px-3 py-2 w-24">Action</th>
                      <th className="text-left px-3 py-2 w-36">Kind</th>
                      <th className="text-left px-3 py-2 w-72">Path</th>
                      <th className="text-left px-3 py-2">Before</th>
                      <th className="text-left px-3 py-2">After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.changes.map((change, index) => (
                      <tr key={`${change.kind}-${changePathLabel(change)}-${index}`} className="sf-divider-soft">
                        <td className="px-3 py-2 align-top font-mono font-semibold">
                          {resolveFieldStudioPatchChangeKey(change)}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <span className={`inline-block px-2 py-0.5 rounded-full ${changeBadgeClass(change)}`}>
                            {changeActionLabel(change)}
                          </span>
                        </td>
                        <td className="px-3 py-2 align-top">{change.kind}</td>
                        <td className="px-3 py-2 align-top font-mono break-words">{changePathLabel(change)}</td>
                        <td className="px-3 py-2 align-top whitespace-pre-wrap break-words">{compactJson(changeBeforeValue(change))}</td>
                        <td className="px-3 py-2 align-top whitespace-pre-wrap break-words">{compactJson(changeAfterValue(change))}</td>
                      </tr>
                    ))}
                    {preview.changes.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-2 py-6 text-center sf-text-muted">
                          No map changes found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {preview.warnings.length > 0 && (
                <div className="space-y-1">
                  {preview.warnings.map((warning) => (
                    <div key={warning} className="text-xs sf-text-muted">
                      {warning}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {applied && (
            <div className="text-xs sf-text-muted">
              Imported {applied.applied.length} file{applied.applied.length === 1 ? "" : "s"}.
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t sf-border-default flex items-center justify-between gap-2">
          <div className="text-xs sf-text-muted">
            Accepted files are stored in auditors-responses.
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className={btnSecondary} disabled={pending !== null}>
              Close
            </button>
            <button
              onClick={handleApply}
              disabled={!request || !preview?.valid || preview.changes.length === 0 || pending !== null}
              className={btnPrimary}
            >
              {pending === "apply" ? "Importing..." : "Apply Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
