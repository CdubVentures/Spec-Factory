import test from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS_DEFAULTS } from '../src/shared/settingsDefaults.js';
import { loadBundledModule } from './helpers/loadBundledModule.js';

function loadModule(entryRelativePath, { stubs = {} } = {}) {
  return loadBundledModule(entryRelativePath, {
    prefix: 'storage-settings-contract-',
    stubs,
  });
}

async function loadStorageSettingsAuthorityModule() {
  return loadModule(
    'tools/gui-react/src/features/pipeline-settings/state/storageSettingsAuthority.ts',
    {
      stubs: {
        react: `
          export function useEffect() {}
          export function useMemo(factory) { return factory(); }
          export function useRef(value) { return { current: value }; }
        `,
        '@tanstack/react-query': `
          export function useMutation() {
            return { mutate() {}, isPending: false };
          }
          export function useQuery() {
            return { data: undefined, isLoading: false, refetch: async () => ({ data: undefined }) };
          }
          export function useQueryClient() {
            return {
              getQueryData() { return undefined; },
              setQueryData() {},
            };
          }
        `,
        '../../../api/client': `
          export const api = {
            get: async () => ({}),
            put: async () => ({}),
          };
        `,
        '../../../stores/autoSaveFingerprint': `
          export function autoSaveFingerprint(value) {
            return JSON.stringify(value);
          }
        `,
        '../../../stores/settingsMutationContract': `
          export function createSettingsOptimisticMutationContract(contract) {
            return contract;
          }
        `,
        '../../../stores/settingsPropagationContract': `
          export function publishSettingsPropagation() {}
        `,
      },
    },
  );
}

test('STORAGE_SETTING_DEFAULTS mirrors the shared storage defaults contract', async () => {
  const { STORAGE_SETTING_DEFAULTS } = await loadModule('tools/gui-react/src/stores/settingsManifest.ts');

  assert.deepEqual(STORAGE_SETTING_DEFAULTS, SETTINGS_DEFAULTS.storage);
});

test('storage settings bootstrap and snapshot preserve explicit empty strings while defaulting missing values', async () => {
  const {
    readStorageSettingsBootstrap,
    readStorageSettingsSnapshot,
  } = await loadStorageSettingsAuthorityModule();

  const queryClient = {
    getQueryData() {
      return {
        enabled: true,
        destinationType: 's3',
        localDirectory: null,
        awsRegion: null,
        s3Bucket: '',
        s3Prefix: '',
        s3AccessKeyId: '',
        hasS3SecretAccessKey: true,
        hasS3SessionToken: false,
        updatedAt: null,
      };
    },
  };

  const snapshot = readStorageSettingsSnapshot(queryClient);
  const bootstrap = readStorageSettingsBootstrap(queryClient);

  assert.equal(snapshot.enabled, true);
  assert.equal(snapshot.destinationType, 's3');
  assert.equal(snapshot.localDirectory, SETTINGS_DEFAULTS.storage.localDirectory);
  assert.equal(snapshot.awsRegion, SETTINGS_DEFAULTS.storage.awsRegion);
  assert.equal(snapshot.s3Bucket, '');
  assert.equal(snapshot.s3Prefix, '');
  assert.equal(snapshot.s3AccessKeyId, '');
  assert.equal(snapshot.hasS3SecretAccessKey, true);

  assert.equal(bootstrap.localDirectory, SETTINGS_DEFAULTS.storage.localDirectory);
  assert.equal(bootstrap.awsRegion, SETTINGS_DEFAULTS.storage.awsRegion);
  assert.equal(bootstrap.s3Bucket, '');
  assert.equal(bootstrap.s3Prefix, '');
  assert.equal(bootstrap.s3AccessKeyId, '');
});

test('storage settings bootstrap falls back to manifest defaults when no cache snapshot exists', async () => {
  const { readStorageSettingsBootstrap } = await loadStorageSettingsAuthorityModule();

  const bootstrap = readStorageSettingsBootstrap({
    getQueryData() {
      return undefined;
    },
  });

  assert.deepEqual(bootstrap, {
    ...SETTINGS_DEFAULTS.storage,
    hasS3SecretAccessKey: false,
    hasS3SessionToken: false,
    stagingTempDirectory: undefined,
    updatedAt: null,
  });
});
