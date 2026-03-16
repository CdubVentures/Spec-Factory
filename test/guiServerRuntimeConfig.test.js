import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  resolveProjectPath,
  normalizeRuntimeArtifactWorkspaceDefaults,
  assertNoShadowHelperRuntime,
  resolveStorageBackedWorkspaceRoots,
  resolveRunDataDestinationType,
  createRunDataArchiveStorage,
} from '../src/api/guiServerRuntimeConfig.js';

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
    llmExtractionCacheDir: path.join(previousSpecDbDir, 'llm_cache'),
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
  assert.equal(
    config.llmExtractionCacheDir,
    path.join(nextSpecDbDir, 'llm_cache'),
  );
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
    llmExtractionCacheDir: path.resolve(
      'run-data',
      '.specfactory_tmp',
      'llm_cache',
    ),
  });
  assert.deepEqual(s3Roots, {
    outputRoot: null,
    indexLabRoot: null,
    specDbDir: path.resolve('workspace', '.specfactory_tmp'),
    llmExtractionCacheDir: path.resolve(
      'workspace',
      '.specfactory_tmp',
      'llm_cache',
    ),
  });
});

test('resolveRunDataDestinationType and createRunDataArchiveStorage honor s3 storage settings', () => {
  const destinationType = resolveRunDataDestinationType({
    env: {
      S3_BUCKET: 'spec-factory-bucket',
    },
  });
  const calls = [];
  const archiveStorage = createRunDataArchiveStorage({
    runDataStorageState: {
      enabled: true,
      destinationType,
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
      calls.push(input);
      return { ok: true, input };
    },
  });

  assert.equal(destinationType, 's3');
  assert.deepEqual(calls, [
    {
      outputMode: 's3',
      localMode: false,
      awsRegion: 'us-east-2',
      s3Bucket: 'spec-factory-bucket',
      s3InputPrefix: 'specs/inputs',
      s3OutputPrefix: 'specs/outputs',
      localInputRoot: path.resolve('fixtures', 's3'),
      localOutputRoot: path.resolve('workspace', 'output'),
    },
  ]);
  assert.deepEqual(archiveStorage, {
    ok: true,
    input: calls[0],
  });
});
