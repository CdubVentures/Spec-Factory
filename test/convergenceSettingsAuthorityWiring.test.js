import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const INDEXING_PAGE = path.resolve('tools/gui-react/src/pages/indexing/IndexingPage.tsx');
const PIPELINE_SETTINGS_PAGE = path.resolve('tools/gui-react/src/pages/pipeline-settings/PipelineSettingsPage.tsx');
const CONVERGENCE_AUTHORITY = path.resolve('tools/gui-react/src/stores/convergenceSettingsAuthority.ts');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('convergence settings are owned by a shared authority module', () => {
  assert.equal(fs.existsSync(CONVERGENCE_AUTHORITY), true, 'convergence settings authority module should exist');

  const authorityText = readText(CONVERGENCE_AUTHORITY);
  const indexingPageText = readText(INDEXING_PAGE);
  const pipelineSettingsText = readText(PIPELINE_SETTINGS_PAGE);

  assert.equal(authorityText.includes('/convergence-settings'), true, 'authority module should own convergence settings API route usage');
  assert.equal(indexingPageText.includes('useConvergenceSettingsAuthority'), true, 'Indexing page should use shared convergence settings authority');
  assert.equal(pipelineSettingsText.includes('useConvergenceSettingsAuthority'), true, 'Pipeline Settings page should use shared convergence settings authority');
  assert.equal(pipelineSettingsText.includes('useSettingsAuthorityStore'), true, 'Pipeline Settings page should read readiness from shared settings authority snapshot');
  assert.equal(pipelineSettingsText.includes('const convergenceHydrated = convergenceSettingsReady && !isLoading;'), true, 'Pipeline settings should gate control readiness on shared convergence snapshot readiness');
  assert.equal(pipelineSettingsText.includes('const sourceStrategyHydrated = isAll || (sourceStrategySettingsReady && !sourceStrategyLoading);'), true, 'Pipeline settings should gate source strategy rendering on shared source-strategy snapshot readiness');
  assert.equal(indexingPageText.includes('/convergence-settings'), false, 'Indexing page should not directly read/write convergence settings endpoint');
  assert.equal(pipelineSettingsText.includes('/convergence-settings'), false, 'Pipeline Settings page should not directly read/write convergence settings endpoint');
});

test('hydrate useEffect does not include settings in its dependency array', () => {
  const authorityText = readText(CONVERGENCE_AUTHORITY);
  const lines = authorityText.split('\n');

  let inHydrateEffect = false;
  let foundHydrateEffect = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('useEffect(') && !inHydrateEffect) {
      const lookahead = lines.slice(i, i + 10).join('\n');
      if (lookahead.includes('hydrate(')) {
        inHydrateEffect = true;
        foundHydrateEffect = true;
      }
    }
    if (inHydrateEffect) {
      const depsMatch = line.match(/\},\s*\[([^\]]*)\]\s*\)/);
      if (depsMatch) {
        const deps = depsMatch[1].split(',').map((d) => d.trim());
        assert.equal(
          deps.includes('settings'),
          false,
          'hydrate useEffect must NOT include "settings" in dependency array (causes infinite re-render loop)',
        );
        inHydrateEffect = false;
      }
    }
  }
  assert.ok(foundHydrateEffect, 'should have a useEffect that calls hydrate');
});
