import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../src/shared/tests/helpers/loadBundledModule.js';

async function loadStudioBehaviorContracts() {
  return loadBundledModule('tools/gui-react/src/features/studio/state/studioBehaviorContracts.ts', {
    prefix: 'studio-behavior-contracts-',
  });
}

async function loadStudioConstants() {
  return loadBundledModule('tools/gui-react/src/utils/studioConstants.ts', {
    prefix: 'studio-constants-contracts-',
  });
}

async function loadSystemMapping() {
  return loadBundledModule('tools/gui-react/src/features/studio/workbench/systemMapping.ts', {
    prefix: 'studio-system-mapping-contracts-',
  });
}

test('studio behavior contracts flush autosave only when a new fingerprint still needs persistence', async () => {
  const {
    shouldFlushStudioDocsOnUnmount,
    shouldFlushStudioMapOnUnmount,
  } = await loadStudioBehaviorContracts();

  assert.equal(
    shouldFlushStudioDocsOnUnmount({
      autoSaveEnabled: true,
      initialized: true,
      hydrated: true,
      authorityConflictVersion: 0,
      isPending: false,
      nextFingerprint: 'next-docs',
      lastSavedFingerprint: 'saved-docs',
    }),
    true,
  );
  assert.equal(
    shouldFlushStudioDocsOnUnmount({
      autoSaveEnabled: true,
      initialized: true,
      hydrated: true,
      authorityConflictVersion: 0,
      isPending: false,
      nextFingerprint: 'saved-docs',
      lastSavedFingerprint: 'saved-docs',
    }),
    false,
  );

  assert.equal(
    shouldFlushStudioMapOnUnmount({
      autoSaveMapEnabled: true,
      mapHydrated: true,
      saving: false,
      nextFingerprint: 'next-map',
      lastSavedFingerprint: 'saved-map',
    }),
    true,
  );
  assert.equal(
    shouldFlushStudioMapOnUnmount({
      autoSaveMapEnabled: true,
      mapHydrated: true,
      saving: true,
      nextFingerprint: 'next-map',
      lastSavedFingerprint: 'saved-map',
    }),
    false,
  );
});

test('studio consumer-toggle contracts persist explicit false overrides and prune empty override maps', async () => {
  const { buildNextConsumerOverrides } = await loadStudioBehaviorContracts();

  assert.deepEqual(
    buildNextConsumerOverrides({}, 'contract.range', 'indexlab', false),
    {
      'contract.range': { indexlab: false },
    },
  );

  assert.equal(
    buildNextConsumerOverrides({ 'contract.range': { indexlab: false } }, 'contract.range', 'indexlab', true),
    undefined,
  );
});

test('studio deferred-lock and tooltip contracts stay scoped to real deferred fields and unknown-token guidance', async () => {
  const [
    { isStudioContractFieldDeferredLocked },
    { STUDIO_TIPS },
    { formatStaticConsumerTooltip },
  ] = await Promise.all([
    loadStudioBehaviorContracts(),
    loadStudioConstants(),
    loadSystemMapping(),
  ]);

  assert.equal(isStudioContractFieldDeferredLocked('contract.unknown_token'), true);
  assert.equal(isStudioContractFieldDeferredLocked('contract.rounding.mode'), true);
  assert.equal(isStudioContractFieldDeferredLocked('contract.unknown_reason_required'), true);
  assert.equal(isStudioContractFieldDeferredLocked('contract.rounding.decimals'), false);
  assert.equal(isStudioContractFieldDeferredLocked('contract.range'), false);
  assert.equal(isStudioContractFieldDeferredLocked('contract.list_rules'), false);

  assert.equal(
    STUDIO_TIPS.unknown_token,
    "Field-specific placeholder used in extraction guidance when data can't be determined.",
  );
  assert.equal(
    formatStaticConsumerTooltip('contract.unknown_token', 'indexlab').includes(
      'Key Navigation > Contract (Type, Shape, Unit) > Unknown Token',
    ),
    true,
  );
  assert.equal(
    formatStaticConsumerTooltip('contract.unknown_token', 'indexlab').includes(
      'passes this token into field-specific extraction guidance and runtime metadata when the field is unresolved.',
    ),
    true,
  );
});
