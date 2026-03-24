import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import { getRefetchInterval } from '../helpers.tsx';
import {
  deriveDomainChecklistCategory,
  deriveIndexLabRuns,
  deriveSelectedRunForChecklist,
} from '../selectors/indexingRunSelectors.ts';
import { deriveRunAutoSelectionDecision } from './indexingRunSelection.ts';
import { buildIndexLabRunsQueryKey, buildIndexLabRunsRequestPath } from './indexlabRunsQuery.ts';
import type { IndexLabRunsResponse } from '../types.ts';

interface UseIndexingRunSelectionStateInput {
  isProcessRunning: boolean;
  isAll: boolean;
  category: string;
  processStatusRunId: string;
  processStartedAt: string;
  selectedIndexLabRunId: string;
  setSelectedIndexLabRunId: (value: string) => void;
  clearedRunViewId: string;
  setClearedRunViewId: (value: string) => void;
}

export function useIndexingRunSelectionState(input: UseIndexingRunSelectionStateInput) {
  const {
    isProcessRunning,
    isAll,
    category,
    processStatusRunId,
    processStartedAt,
    selectedIndexLabRunId,
    setSelectedIndexLabRunId,
    clearedRunViewId,
    setClearedRunViewId,
  } = input;
  const categoryScope = isAll ? '' : category;

  const { data: indexlabRunsResp } = useQuery({
    queryKey: buildIndexLabRunsQueryKey({ category: categoryScope, limit: 80 }),
    queryFn: () => api.get<IndexLabRunsResponse>(buildIndexLabRunsRequestPath({ category: categoryScope, limit: 80 })),
    refetchInterval: getRefetchInterval(isProcessRunning, false),
  });

  const indexlabRuns = useMemo(
    () => deriveIndexLabRuns({
      indexlabRunsResp,
      isAll,
      category,
      processStatusRunId,
      selectedIndexLabRunId,
      isProcessRunning,
      processStartedAt,
    }),
    [
      indexlabRunsResp,
      isAll,
      category,
      processStatusRunId,
      selectedIndexLabRunId,
      isProcessRunning,
      processStartedAt,
    ],
  );

  const selectedRunForChecklist = useMemo(
    () => deriveSelectedRunForChecklist(indexlabRuns, selectedIndexLabRunId),
    [indexlabRuns, selectedIndexLabRunId],
  );

  const domainChecklistCategory = useMemo(
    () => deriveDomainChecklistCategory({
      isAll,
      category,
      selectedRunForChecklist,
    }),
    [isAll, category, selectedRunForChecklist],
  );

  const runViewCleared = Boolean(
    selectedIndexLabRunId
    && selectedIndexLabRunId === clearedRunViewId,
  );

  useEffect(() => {
    const selectionDecision = deriveRunAutoSelectionDecision({
      indexlabRuns,
      selectedIndexLabRunId,
      processStatusRunId,
      isProcessRunning,
    });
    if (selectionDecision.type === 'set') {
      setSelectedIndexLabRunId(selectionDecision.runId);
    }
  }, [
    indexlabRuns,
    selectedIndexLabRunId,
    isProcessRunning,
    processStatusRunId,
    setSelectedIndexLabRunId,
  ]);

  useEffect(() => {
    if (!selectedIndexLabRunId) {
      if (clearedRunViewId) setClearedRunViewId('');
      return;
    }
    if (clearedRunViewId && clearedRunViewId !== selectedIndexLabRunId) {
      setClearedRunViewId('');
    }
  }, [selectedIndexLabRunId, clearedRunViewId, setClearedRunViewId]);

  return {
    indexlabRuns,
    selectedRunForChecklist,
    domainChecklistCategory,
    runViewCleared,
  };
}
