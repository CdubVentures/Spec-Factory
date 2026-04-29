import { api } from "../../../api/client.ts";

export const FIELD_STUDIO_PATCH_FILE_SUFFIX = ".field-studio-patch.v1.json";
export const KEY_ORDER_PATCH_FILE_SUFFIX = ".key-order-patch.v1.json";
const OS_DUPLICATE_SUFFIX_RE = /\s+\(\d+\)(?=\.json$)/i;

export type AuditorJsonImportKind = "field_studio_patch" | "key_order_patch";

export interface FieldStudioPatchBrowserFile {
  readonly name: string;
  text: () => Promise<string>;
}

export interface FieldStudioPatchImportFileRequest {
  fileName: string;
  content: string;
}

export interface FieldStudioPatchImportRequest {
  kind: AuditorJsonImportKind;
  files: FieldStudioPatchImportFileRequest[];
}

export interface FieldStudioPatchImportFileSummary {
  fileName: string;
  fieldKey?: string;
  navigatorOrdinal?: number | null;
  verdict?: string;
  groupCount?: number;
  addKeyCount?: number;
  renameKeyCount?: number;
}

export interface FieldStudioPatchImportChange {
  kind: string;
  action?: string;
  path?: string;
  label?: string;
  fieldKey?: string;
  componentType?: string;
  key?: string;
  groupKey?: string;
  from?: string;
  to?: string;
  beforeIndex?: number;
  afterIndex?: number;
  rationale?: string;
  before?: unknown;
  after?: unknown;
}

export interface FieldStudioPatchImportPreview {
  category: string;
  valid: boolean;
  files: FieldStudioPatchImportFileSummary[];
  changes: FieldStudioPatchImportChange[];
  errors: string[];
  warnings: string[];
  order?: string[];
}

export interface FieldStudioPatchApplyResponse extends FieldStudioPatchImportPreview {
  applied: FieldStudioPatchImportFileSummary[];
  map_hash?: string;
  storageDir: string;
}

export interface FieldStudioPatchImportSummary {
  fileCount: number;
  changeCount: number;
  keyCount: number;
  componentCount: number;
  warningCount: number;
  errorCount: number;
}

function normalizeDuplicatePatchFileName(fileName: string): string {
  return fileName.replace(OS_DUPLICATE_SUFFIX_RE, "");
}

function detectImportKind(fileName: string, content: string): AuditorJsonImportKind {
  try {
    const parsed: unknown = JSON.parse(content);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const schemaVersion = (parsed as { schema_version?: unknown }).schema_version;
      if (schemaVersion === "key-order-patch.v1") return "key_order_patch";
      if (schemaVersion === "field-studio-patch.v1") return "field_studio_patch";
    }
  } catch {
    // Fall back to filename suffix so backend can own the JSON parse error.
  }
  const normalizedFileName = normalizeDuplicatePatchFileName(fileName);
  if (normalizedFileName.endsWith(KEY_ORDER_PATCH_FILE_SUFFIX)) return "key_order_patch";
  return "field_studio_patch";
}

function assertOneImportKind(entries: FieldStudioPatchImportFileRequest[]): AuditorJsonImportKind {
  const kinds = new Set(entries.map((entry) => detectImportKind(entry.fileName, entry.content)));
  if (kinds.size > 1) {
    throw new Error("Upload either Field Studio patch files or one key-order patch file, not both at once.");
  }
  const [kind] = kinds;
  if (kind === "key_order_patch" && entries.length !== 1) {
    throw new Error("Key-order import accepts exactly one JSON file.");
  }
  return kind;
}

export async function buildFieldStudioPatchImportRequest(
  files: readonly FieldStudioPatchBrowserFile[],
): Promise<FieldStudioPatchImportRequest> {
  const entries = await Promise.all(
    files.map(async (file) => ({
      fileName: file.name,
      content: await file.text(),
    })),
  );
  return {
    kind: assertOneImportKind(entries),
    files: entries,
  };
}

export function summarizeFieldStudioPatchImportPreview(
  preview: FieldStudioPatchImportPreview | null,
): FieldStudioPatchImportSummary {
  if (!preview) {
    return {
      fileCount: 0,
      changeCount: 0,
      keyCount: 0,
      componentCount: 0,
      warningCount: 0,
      errorCount: 0,
    };
  }

  const keys = new Set<string>();
  const components = new Set<string>();
  for (const file of preview.files) {
    if (file.fieldKey) keys.add(file.fieldKey);
  }
  for (const change of preview.changes) {
    if (change.fieldKey) keys.add(change.fieldKey);
    if (change.key) keys.add(change.key);
    if (change.from) keys.add(change.from);
    if (change.to) keys.add(change.to);
    if (change.componentType) components.add(change.componentType);
  }

  return {
    fileCount: preview.files.length,
    changeCount: preview.changes.length,
    keyCount: keys.size,
    componentCount: components.size,
    warningCount: preview.warnings.length,
    errorCount: preview.errors.length,
  };
}

export function resolveFieldStudioPatchChangeKey(
  change: FieldStudioPatchImportChange,
): string {
  if (change.fieldKey) return change.fieldKey;
  if (change.key) return change.key;
  if (change.from || change.to) return [change.from, change.to].filter(Boolean).join(" -> ");
  if (change.componentType) return `component:${change.componentType}`;
  if (change.groupKey) return `group:${change.groupKey}`;
  if (!change.path) return change.label || change.kind || "unknown";
  const pathParts = change.path.split(".");
  if (pathParts[0] === "data_lists" && pathParts[1]) return pathParts[1];
  if (pathParts[0] === "field_overrides" && pathParts[1]) return pathParts[1];
  return pathParts[1] || pathParts[0] || "unknown";
}

function importEndpointSegment(kind: AuditorJsonImportKind): string {
  return kind === "key_order_patch" ? "key-order-patches" : "field-studio-patches";
}

export function previewFieldStudioPatchImport(
  category: string,
  request: FieldStudioPatchImportRequest,
): Promise<FieldStudioPatchImportPreview> {
  return api.post<FieldStudioPatchImportPreview>(
    `/studio/${category}/${importEndpointSegment(request.kind)}/preview`,
    request,
  );
}

export function applyFieldStudioPatchImport(
  category: string,
  request: FieldStudioPatchImportRequest,
): Promise<FieldStudioPatchApplyResponse> {
  return api.post<FieldStudioPatchApplyResponse>(
    `/studio/${category}/${importEndpointSegment(request.kind)}/apply`,
    request,
  );
}
