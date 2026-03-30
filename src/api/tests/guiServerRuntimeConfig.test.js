import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  resolveProjectPath,
  normalizeRuntimeArtifactWorkspaceDefaults,
  assertNoShadowHelperRuntime,
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

