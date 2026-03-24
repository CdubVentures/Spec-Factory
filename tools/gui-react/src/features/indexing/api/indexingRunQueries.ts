import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import { getRefetchInterval } from '../helpers.tsx';
import type {
  IndexLabRunEventsResponse,
} from '../types.ts';

interface UseIndexingRunQueriesInput {
  selectedIndexLabRunId: string;
  runViewCleared: boolean;
  isProcessRunning: boolean;
  panelCollapsed: { picker: boolean };
}

export function useIndexingRunQueries(input: UseIndexingRunQueriesInput) {
  const {
    selectedIndexLabRunId,
    runViewCleared,
    isProcessRunning,
  } = input;
  const runQueryEnabled = Boolean(selectedIndexLabRunId) && !runViewCleared;

  const { data: indexlabEventsResp } = useQuery({
    queryKey: ['indexlab', 'run', selectedIndexLabRunId, 'events'],
    queryFn: () =>
      api.get<IndexLabRunEventsResponse>(
        `/indexlab/run/${encodeURIComponent(selectedIndexLabRunId)}/events?limit=3000`,
      ),
    enabled: runQueryEnabled,
    refetchInterval: getRefetchInterval(isProcessRunning, false),
  });

  return {
    indexlabEventsResp,
  };
}
