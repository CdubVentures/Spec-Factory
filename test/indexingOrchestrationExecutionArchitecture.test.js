import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ORCHESTRATION_ROOT = path.resolve('src/features/indexing/orchestration');
const ORCHESTRATION_INDEX = path.join(ORCHESTRATION_ROOT, 'index.js');
const EXECUTION_ROOT = path.join(ORCHESTRATION_ROOT, 'execution');

function readModuleEdges(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const edges = [];

  for (const match of source.matchAll(/^(?:import|export)\s+(?:[\s\S]*?)\s+from\s+'([^']+)'/gm)) {
    const specifier = match[1];
    if (!specifier.startsWith('.')) {
      continue;
    }
    const resolved = path.resolve(
      path.dirname(filePath),
      specifier.endsWith('.js') ? specifier : `${specifier}.js`,
    );
    edges.push(resolved);
  }

  return edges;
}

function findCycleFrom(startPath, graph) {
  const stack = [];
  const active = new Set();

  function visit(node) {
    if (active.has(node)) {
      const cycleStart = stack.indexOf(node);
      return stack.slice(cycleStart).concat(node);
    }

    active.add(node);
    stack.push(node);
    for (const next of graph.get(node) || []) {
      const cycle = visit(next);
      if (cycle) {
        return cycle;
      }
    }
    stack.pop();
    active.delete(node);
    return null;
  }

  return visit(startPath);
}

test('planner-loop execution modules do not participate in barrel-mediated orchestration cycles', () => {
  const files = [
    ORCHESTRATION_INDEX,
    path.join(EXECUTION_ROOT, 'buildProcessPlannerQueueExecutionContexts.js'),
    path.join(EXECUTION_ROOT, 'runProcessPlannerQueuePhase.js'),
  ];
  const graph = new Map(files.map((filePath) => [filePath, readModuleEdges(filePath)]));

  const cycles = files
    .map((filePath) => findCycleFrom(filePath, graph))
    .filter(Boolean)
    .map((cycle) => cycle.map((segment) => path.relative(ORCHESTRATION_ROOT, segment)));

  assert.deepEqual(cycles, []);
});
