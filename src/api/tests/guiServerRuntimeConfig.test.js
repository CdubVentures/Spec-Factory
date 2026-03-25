import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  resolveProjectPath,
  normalizeRuntimeArtifactWorkspaceDefaults,
  assertNoShadowHelperRuntime,
  resolveStorageBackedWorkspaceRoots,
  createRunDataArchiveStorage,
  resolveCurrentIndexLabRoot,
} from '../guiServerRuntimeConfig.js';

test('resolveProjectPath resolves project-relative and absolute paths', () => {
  const projectRoot = path.resolve('spec-factory-project');
  const relative = resolveProjectPath({
    projectRoot,
    value: 'tmp/output',
    fallback: 'fallback/output',
  });
  const absolute = resolveProjectPath({
    projectRoot,
    value: path.join(projectRoot, 'already-absolute'),
    fallback: 'fallback/output',
  });
  const fallback = resolveProjectPath({
    projectRoot,
    value: '',
    fallback: 'fallback/output',
  });

  assert.equal(relative, path.join(projectRoot, 'tmp', 'output'));
  assert.equal(absolute, path.join(projectRoot, 'already-absolute'));
  assert.equal(fallback, path.join(projectRoot, 'fallback', 'output'));
});

test('normalizeRuntimeArtifactWorkspaceDefaults migrates known-default workspace roots together', () => {
  const projectRoot = path.resolve('spec-factory-project');
  const previousOutputRoot = path.join(projectRoot, 'workspace-old', 'output');
  const nextOutputRoot = path.join(projectRoot, 'workspace-new', 'output');
  const previousSpecDbDir = path.join(projectRoot, 'workspace-old', '.specfactory_tmp');
  const nextSpecDbDir = path.join(projectRoot, 'workspace-new', '.specfactory_tmp');
  const config = {
    localOutputRoot: previousOutputRoot,
    specDbDir: previousSpecDbDir,
  };

  normalizeRuntimeArtifactWorkspaceDefaults({
    config,
    projectRoot,
    explicitLocalOutputRoot: '',
    persistedRuntimeSettings: {
      localOutputRoot: previousOutputRoot,
    },
    defaultLocalOutputRoot: () => nextOutputRoot,
    repoDefaultOutputRoot: previousOutputRoot,
  });

  assert.equal(config.localOutputRoot, nextOutputRoot);
  assert.equal(config.specDbDir, nextSpecDbDir);
});

test('assertNoShadowHelperRuntime rejects legacy helper runtime shadows', () => {
  const launchCwd = path.resolve('launch-root');
  const helperRoot = path.resolve('canonical-helper-root');

  assert.throws(
    () =>
      assertNoShadowHelperRuntime({
        helperRoot,
        launchCwd,
        existsSync(targetPath) {
          return targetPath === path.join(launchCwd, 'helper_files', '_runtime');
        },
      }),
    /shadow_helper_runtime_detected/,
  );
});

test('resolveStorageBackedWorkspaceRoots maps local and s3 storage to workspace roots', () => {
  const localRoots = resolveStorageBackedWorkspaceRoots({
    settings: {
      enabled: true,
      destinationType: 'local',
      localDirectory: path.resolve('run-data'),
    },
  });
  const s3Roots = resolveStorageBackedWorkspaceRoots({
    settings: {
      enabled: true,
      destinationType: 's3',
    },
    defaultLocalOutputRoot: () => path.resolve('workspace', 'output'),
  });

  assert.deepEqual(localRoots, {
    outputRoot: path.resolve('run-data', 'output'),
    indexLabRoot: path.resolve('run-data', 'indexlab'),
    specDbDir: path.resolve('run-data', '.specfactory_tmp'),
  });
  assert.deepEqual(s3Roots, {
    outputRoot: null,
    indexLabRoot: null,
    specDbDir: path.resolve('workspace', '.specfactory_tmp'),
  });
});

test('createRunDataArchiveStorage creates S3 storage when destinationType is s3', () => {
  const archiveStorage = createRunDataArchiveStorage({
    runDataStorageState: {
      enabled: true,
      destinationType: 's3',
      awsRegion: 'us-east-2',
      s3Bucket: 'spec-factory-bucket',
    },
    config: {
      s3OutputPrefix: 'specs/outputs',
      s3InputPrefix: 'specs/inputs',
      localInputRoot: path.resolve('fixtures', 's3'),
      localOutputRoot: path.resolve('workspace', 'output'),
    },
    createStorage(input) {
      return { ok: true, input };
    },
  });

  assert.equal(archiveStorage?.ok, true);
  assert.equal(archiveStorage?.input?.outputMode, 's3');
  assert.equal(archiveStorage?.input?.awsRegion, 'us-east-2');
  assert.equal(archiveStorage?.input?.s3Bucket, 'spec-factory-bucket');
  assert.equal(archiveStorage?.input?.s3InputPrefix, 'specs/inputs');
  assert.equal(archiveStorage?.input?.s3OutputPrefix, 'specs/outputs');
  assert.equal(archiveStorage?.input?.localInputRoot, path.resolve('fixtures', 's3'));
  assert.equal(archiveStorage?.input?.localOutputRoot, path.resolve('workspace', 'output'));
});

// WHY: Contract test for resolveCurrentIndexLabRoot — SSOT dynamic derivation.
test('resolveCurrentIndexLabRoot returns local indexlab path when local storage enabled', () => {
  const state = { enabled: true, destinationType: 'local', localDirectory: '/my/storage' };
  const result = resolveCurrentIndexLabRoot({
    runDataStorageState: state,
    defaultIndexLabRoot: () => '/default/indexlab',
    defaultLocalOutputRoot: () => '/default/output',
  });
  assert.equal(result, path.resolve('/my/storage', 'indexlab'));
});

test('resolveCurrentIndexLabRoot returns default when s3 storage enabled', () => {
  const state = { enabled: true, destinationType: 's3', s3Bucket: 'test-bucket' };
  const result = resolveCurrentIndexLabRoot({
    runDataStorageState: state,
    defaultIndexLabRoot: () => '/default/indexlab',
    defaultLocalOutputRoot: () => '/default/output',
  });
  assert.equal(result, '/default/indexlab');
});

test('resolveCurrentIndexLabRoot returns default when storage disabled', () => {
  const state = { enabled: false, destinationType: 'local', localDirectory: '/my/storage' };
  const result = resolveCurrentIndexLabRoot({
    runDataStorageState: state,
    defaultIndexLabRoot: () => '/default/indexlab',
    defaultLocalOutputRoot: () => '/default/output',
  });
  assert.equal(result, '/default/indexlab');
});

test('resolveCurrentIndexLabRoot reflects runtime mutation of runDataStorageState', () => {
  const state = { enabled: true, destinationType: 'local', localDirectory: '/path-a' };
  const opts = {
    runDataStorageState: state,
    defaultIndexLabRoot: () => '/default/indexlab',
    defaultLocalOutputRoot: () => '/default/output',
  };
  const first = resolveCurrentIndexLabRoot(opts);
  assert.equal(first, path.resolve('/path-a', 'indexlab'));

  // Mutate the same object (simulates Object.assign in configPersistenceContext)
  Object.assign(state, { localDirectory: '/path-b' });
  const second = resolveCurrentIndexLabRoot(opts);
  assert.equal(second, path.resolve('/path-b', 'indexlab'));
});

test('resolveCurrentIndexLabRoot reflects destination type switch', () => {
  const state = { enabled: true, destinationType: 'local', localDirectory: '/my/storage' };
  const opts = {
    runDataStorageState: state,
    defaultIndexLabRoot: () => '/default/indexlab',
    defaultLocalOutputRoot: () => '/default/output',
  };
  assert.equal(resolveCurrentIndexLabRoot(opts), path.resolve('/my/storage', 'indexlab'));

  Object.assign(state, { destinationType: 's3' });
  assert.equal(resolveCurrentIndexLabRoot(opts), '/default/indexlab');

  Object.assign(state, { destinationType: 'local' });
  assert.equal(resolveCurrentIndexLabRoot(opts), path.resolve('/my/storage', 'indexlab'));
});
