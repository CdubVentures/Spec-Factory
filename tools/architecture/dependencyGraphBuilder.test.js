import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildDependencyGraph } from './build-dependency-graph.mjs';

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

test('buildDependencyGraph computes cross-zone edges and cycle count from live source', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-graph-'));

  writeFile(path.join(tempDir, 'main.tsx'), "import { App } from './App';\nexport { App };");
  writeFile(path.join(tempDir, 'App.tsx'), "import { Button } from './components/Button';\nexport { Button };");
  writeFile(path.join(tempDir, 'components', 'Button.tsx'), "import { useThing } from '../hooks/useThing';\nexport const Button = () => useThing();");
  writeFile(path.join(tempDir, 'hooks', 'useThing.ts'), "import { api } from '../api/client';\nexport const useThing = () => api;");
  writeFile(path.join(tempDir, 'api', 'client.ts'), 'export const api = {};');
  writeFile(path.join(tempDir, 'stores', 'a.ts'), "import { b } from './b';\nexport const a = () => b;");
  writeFile(path.join(tempDir, 'stores', 'b.ts'), "import { a } from './a';\nexport const b = () => a;");

  const graph = buildDependencyGraph({
    label: 'gui',
    rootDir: tempDir,
    lanes: {
      entry: ['main.tsx', 'App.tsx'],
      components: ['components'],
      hooks: ['hooks'],
      stores: ['stores'],
      api: ['api'],
      foundation: ['types', 'utils'],
    },
  });

  assert.equal(graph.label, 'gui');
  assert.equal(graph.files, 7);
  assert.equal(graph.edges, 6);
  assert.equal(graph.cycle_count, 1);

  const toMap = new Map(graph.top_cross_zone_edges.map((row) => [row.pair, row.edges]));
  assert.equal(toMap.get('main.tsx=>App.tsx'), 1);
  assert.equal(toMap.get('App.tsx=>components'), 1);
  assert.equal(toMap.get('components=>hooks'), 1);
  assert.equal(toMap.get('hooks=>api'), 1);
});

