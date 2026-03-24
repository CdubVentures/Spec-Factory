import test from 'node:test';
import { createRuntimeOpsRouteContext } from '../runtimeOpsRouteContext.js';
import {
  assertRouteContextContract,
  assertRouteContextRejectsInvalidInput,
} from '../../../../shared/tests/helpers/routeContextContractHarness.js';

const FORWARDED_KEYS = [
  'jsonRes', 'toInt', 'INDEXLAB_ROOT', 'OUTPUT_ROOT', 'config', 'storage',
  'getIndexLabRoot',
  'processStatus', 'getLastScreencastFrame', 'safeReadJson', 'safeJoin', 'path',
];

const HELPER_KEYS = [
  'readIndexLabRunEvents', 'readIndexLabRunSearchProfile', 'readIndexLabRunMeta',
  'readIndexLabRunSourceIndexingPackets', 'resolveIndexLabRunDirectory',
];

test('createRuntimeOpsRouteContext throws TypeError on non-object input', () => {
  assertRouteContextRejectsInvalidInput(createRuntimeOpsRouteContext);
});

test('createRuntimeOpsRouteContext forwards dependencies and exposes runtime readers', () => {
  assertRouteContextContract({
    createContext: createRuntimeOpsRouteContext,
    forwardedKeys: FORWARDED_KEYS,
    helperKeys: HELPER_KEYS,
  });
});
