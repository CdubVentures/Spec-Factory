import { computeActivityStats } from '../helpers.tsx';
import type { TimedIndexLabEvent } from '../types.ts';

interface ActivitySelectorInput {
  timedIndexlabEvents: TimedIndexLabEvent[];
  activityNowMs: number;
}

interface ProductPickerActivitySelectorInput extends ActivitySelectorInput {
  activeMonitorProductId: string;
}

export function deriveRuntimeActivity({
  timedIndexlabEvents,
  activityNowMs,
}: ActivitySelectorInput) {
  return computeActivityStats(timedIndexlabEvents, activityNowMs, () => true);
}

export function deriveProductPickerActivity({
  timedIndexlabEvents,
  activityNowMs,
  activeMonitorProductId,
}: ProductPickerActivitySelectorInput) {
  return computeActivityStats(
    timedIndexlabEvents,
    activityNowMs,
    (event) => Boolean(activeMonitorProductId) && event.productId === activeMonitorProductId
  );
}

export function deriveEventStreamActivity({
  timedIndexlabEvents,
  activityNowMs,
}: ActivitySelectorInput) {
  return computeActivityStats(
    timedIndexlabEvents,
    activityNowMs,
    (event) => ['search', 'fetch', 'parse', 'index'].includes(event.stage)
  );
}

export function deriveNeedsetActivity({
  timedIndexlabEvents,
  activityNowMs,
}: ActivitySelectorInput) {
  return computeActivityStats(
    timedIndexlabEvents,
    activityNowMs,
    (event) => event.event === 'needset_computed' || event.stage === 'index'
  );
}

export function deriveLlmActivity({
  timedIndexlabEvents,
  activityNowMs,
}: ActivitySelectorInput) {
  return computeActivityStats(
    timedIndexlabEvents,
    activityNowMs,
    (event) => event.stage === 'llm'
  );
}
