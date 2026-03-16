import { useEffect, useMemo, useState } from 'react';
import type { IndexLabEvent } from '../state/indexlabStore';
import {
  deriveIndexLabEvents,
  deriveIndexLabLiveEvents,
  deriveTimedIndexLabEvents,
} from './indexingEventSelectors';
import {
  deriveProductPickerActivity,
} from './indexingActivitySelectors';
import type {
  IndexLabRunEventsResponse,
  IndexLabRunSummary,
} from '../types';

interface UseIndexingEventActivityDerivationsInput {
  liveIndexLabByRun: Record<string, IndexLabEvent[]>;
  selectedIndexLabRunId: string;
  runViewCleared: boolean;
  indexlabEventsResp: IndexLabRunEventsResponse | undefined;
  indexlabRuns: IndexLabRunSummary[];
  singleProductId: string;
}

export function useIndexingEventActivityDerivations(input: UseIndexingEventActivityDerivationsInput) {
  const {
    liveIndexLabByRun,
    selectedIndexLabRunId,
    runViewCleared,
    indexlabEventsResp,
    indexlabRuns,
    singleProductId,
  } = input;

  const [activityNowMs, setActivityNowMs] = useState(() => Date.now());

  const indexlabLiveEvents = useMemo(
    () => deriveIndexLabLiveEvents({
      liveIndexLabByRun,
      selectedIndexLabRunId,
      runViewCleared,
    }),
    [liveIndexLabByRun, selectedIndexLabRunId, runViewCleared],
  );

  const indexlabEvents = useMemo(
    () => deriveIndexLabEvents(indexlabEventsResp, indexlabLiveEvents),
    [indexlabEventsResp, indexlabLiveEvents],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setActivityNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const timedIndexlabEvents = useMemo(
    () => deriveTimedIndexLabEvents(indexlabEvents),
    [indexlabEvents],
  );

  const selectedIndexLabRun = useMemo(
    () => indexlabRuns.find((row) => row.run_id === selectedIndexLabRunId) || null,
    [indexlabRuns, selectedIndexLabRunId],
  );

  const activeMonitorProductId = String(
    singleProductId
    || selectedIndexLabRun?.product_id
    || '',
  ).trim();

  const productPickerActivity = useMemo(
    () => deriveProductPickerActivity({ timedIndexlabEvents, activityNowMs, activeMonitorProductId }),
    [timedIndexlabEvents, activityNowMs, activeMonitorProductId],
  );

  return {
    activityNowMs,
    indexlabLiveEvents,
    indexlabEvents,
    timedIndexlabEvents,
    selectedIndexLabRun,
    activeMonitorProductId,
    productPickerActivity,
  };
}
