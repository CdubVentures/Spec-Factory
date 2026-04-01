import {
  buildExtractionFields,
  buildFallbackEvents,
  buildQueueState,
} from '../../runtimeOpsDataBuilders.js';

export {
  buildExtractionFields,
  buildFallbackEvents,
  buildQueueState,
};

export function makeEvent(event, payload = {}, ts = '2026-02-23T12:00:00.000Z') {
  return { event, ts, payload };
}
