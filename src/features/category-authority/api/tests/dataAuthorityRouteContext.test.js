import test from 'node:test';
import { createDataAuthorityRouteContext } from '../dataAuthorityRouteContext.js';
import {
  assertRouteContextContract,
  assertRouteContextRejectsInvalidInput,
} from '../../../../shared/tests/helpers/routeContextContractHarness.js';

const FORWARDED_KEYS = ['jsonRes', 'config', 'sessionCache', 'getSpecDb'];

test('createDataAuthorityRouteContext throws TypeError on non-object input', () => {
  assertRouteContextRejectsInvalidInput(createDataAuthorityRouteContext);
});

test('createDataAuthorityRouteContext forwards its public contract and drops extras', () => {
  assertRouteContextContract({
    createContext: createDataAuthorityRouteContext,
    forwardedKeys: FORWARDED_KEYS,
  });
});
