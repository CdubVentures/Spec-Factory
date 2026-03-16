import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client';
import { getRefetchInterval } from '../helpers';
import {
  deriveDomainChecklistCategory,
  deriveIndexLabRuns,
  deriveSelectedRunForChecklist,
} from '../selectors/indexingRunSelectors';
import { deriveRunAutoSelectionDecision } from './indexingRunSelection';
import type { IndexLabRunsResponse } from '../types';

interface UseIndexingRunSelectionStateInput {
  isProcessRunning: boolean;
  isAll: boolean;
  category: string;
  processStatusRunId: string;
  processStartedAt: string;
  processRunning: boolean;
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
    processRunning,
    selectedIndexLabRunId,
    setSelectedIndexLabRunId,
    clearedRunViewId,
    setClearedRunViewId,
  } = input;

  const { data: indexlabRunsResp } = useQuery({
    queryKey: ['indexlab', 'runs'],
    queryFn: () => api.get<IndexLabRunsResponse>('/indexlab/runs?limit=80'),
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
      isProcessRunning: processRunning,
    });
    if (selectionDecision.type === 'set') {
      setSelectedIndexLabRunId(selectionDecision.runId);
    }
  }, [
    indexlabRuns,
    selectedIndexLabRunId,
    processRunning,
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
