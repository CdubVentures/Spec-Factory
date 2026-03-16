import { normalizeToken } from '../helpers';
import type { IndexLabRunSummary, IndexLabRunsResponse } from '../types';

interface DeriveIndexLabRunsInput {
  indexlabRunsResp: IndexLabRunsResponse | undefined;
  isAll: boolean;
  category: string;
  processStatusRunId: string;
  selectedIndexLabRunId: string;
  isProcessRunning: boolean;
  processStartedAt: string;
}

interface DeriveDomainChecklistCategoryInput {
  isAll: boolean;
  category: string;
  selectedRunForChecklist: IndexLabRunSummary | null;
}

export function deriveIndexLabRuns({
  indexlabRunsResp,
  isAll,
  category,
  processStatusRunId,
  selectedIndexLabRunId,
  isProcessRunning,
  processStartedAt,
}: DeriveIndexLabRunsInput): IndexLabRunSummary[] {
  const rows = indexlabRunsResp?.runs || [];
  const scopedRows = isAll
    ? rows
    : rows.filter((row) => normalizeToken(row.category) === normalizeToken(category));
  const activeRunId = String(processStatusRunId || selectedIndexLabRunId || '').trim();
  if (!activeRunId || scopedRows.some((row) => String(row.run_id || '').trim() === activeRunId)) {
    return scopedRows;
  }
  return [{
    run_id: activeRunId,
    category: String(category || '').trim(),
    product_id: '',
    status: isProcessRunning ? 'running' : 'starting',
    started_at: String(processStartedAt || ''),
    ended_at: '',
    has_needset: false,
    has_search_profile: false,
  }, ...scopedRows];
}

export function deriveSelectedRunForChecklist(indexlabRuns: IndexLabRunSummary[], selectedIndexLabRunId: string) {
  return indexlabRuns.find((row) => row.run_id === selectedIndexLabRunId) || null;
}

export function deriveDomainChecklistCategory({
  isAll,
  category,
  selectedRunForChecklist,
}: DeriveDomainChecklistCategoryInput) {
  if (!isAll) return String(category || '').trim();
  return String(selectedRunForChecklist?.category || '').trim();
}
