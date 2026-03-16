import { normalizeToken } from '../helpers';
import type { IndexLabRunSummary } from '../types';

interface DeriveRunAutoSelectionDecisionInput {
  indexlabRuns: IndexLabRunSummary[];
  selectedIndexLabRunId: string;
  processStatusRunId: string;
  isProcessRunning: boolean;
}

type RunAutoSelectionDecision =
  | { type: 'keep' }
  | { type: 'set'; runId: string };

export function deriveNewestCompletedRunId(indexlabRuns: IndexLabRunSummary[]) {
  return indexlabRuns.find((row) =>
    normalizeToken(row.status) === 'completed'
    && row.has_needset !== false
    && row.has_search_profile !== false
  )?.run_id
    || indexlabRuns.find((row) => normalizeToken(row.status) === 'completed')?.run_id
    || '';
}

export function deriveRunAutoSelectionDecision({
  indexlabRuns,
  selectedIndexLabRunId,
  processStatusRunId,
  isProcessRunning,
}: DeriveRunAutoSelectionDecisionInput): RunAutoSelectionDecision {
  const selectedRunId = String(selectedIndexLabRunId || '').trim();
  const activeRunId = String(processStatusRunId || '').trim();
  const newestRunId = String(indexlabRuns[0]?.run_id || '').trim();
  const selectedExists = Boolean(
    selectedRunId
    && indexlabRuns.some((row) => String(row.run_id || '').trim() === selectedRunId)
  );

  if (!newestRunId && !activeRunId) {
    if (!selectedRunId) return { type: 'keep' };
    return { type: 'set', runId: '' };
  }
  if (isProcessRunning) {
    if (selectedExists) return { type: 'keep' };
    const targetRunId = activeRunId || newestRunId;
    if (!targetRunId || targetRunId === selectedRunId) return { type: 'keep' };
    return { type: 'set', runId: targetRunId };
  }
  if (selectedExists) return { type: 'keep' };

  const newestCompletedRunId = deriveNewestCompletedRunId(indexlabRuns) || newestRunId;
  if (!newestCompletedRunId || newestCompletedRunId === selectedRunId) return { type: 'keep' };
  return { type: 'set', runId: newestCompletedRunId };
}
