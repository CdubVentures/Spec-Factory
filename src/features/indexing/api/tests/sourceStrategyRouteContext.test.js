import test from 'node:test';
import { createSourceStrategyRouteContext } from '../sourceStrategyRouteContext.js';
import {
  assertRouteContextContract,
  assertRouteContextRejectsInvalidInput,
} from '../../../../shared/tests/helpers/routeContextContractHarness.js';

const FORWARDED_KEYS = ['jsonRes', 'readJsonBody', 'config', 'resolveCategoryAlias', 'broadcastWs'];

test('createSourceStrategyRouteContext throws TypeError on non-object input', () => {
  assertRouteContextRejectsInvalidInput(createSourceStrategyRouteContext);
});

test('createSourceStrategyRouteContext forwards its public contract and drops extras', () => {
  assertRouteContextContract({
    createContext: createSourceStrategyRouteContext,
    forwardedKeys: FORWARDED_KEYS,
  });
});
