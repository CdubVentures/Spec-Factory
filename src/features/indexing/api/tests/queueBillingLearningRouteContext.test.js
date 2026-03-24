import test from 'node:test';
import { createQueueBillingLearningRouteContext } from '../queueBillingLearningRouteContext.js';
import {
  assertRouteContextContract,
  assertRouteContextRejectsInvalidInput,
} from '../../../../shared/tests/helpers/routeContextContractHarness.js';

const FORWARDED_KEYS = [
  'jsonRes', 'readJsonBody', 'toInt', 'config', 'storage', 'OUTPUT_ROOT', 'path',
  'getSpecDb', 'broadcastWs', 'safeReadJson', 'safeStat', 'listFiles',
  'loadProductCatalog',
];

const HELPER_KEYS = [
  'buildReviewQueue', 'loadQueueState', 'saveQueueState', 'upsertQueueProduct',
];

test('createQueueBillingLearningRouteContext throws TypeError on non-object input', () => {
  assertRouteContextRejectsInvalidInput(createQueueBillingLearningRouteContext);
});

test('createQueueBillingLearningRouteContext forwards dependencies and exposes queue helpers', () => {
  assertRouteContextContract({
    createContext: createQueueBillingLearningRouteContext,
    forwardedKeys: FORWARDED_KEYS,
    helperKeys: HELPER_KEYS,
  });
});
