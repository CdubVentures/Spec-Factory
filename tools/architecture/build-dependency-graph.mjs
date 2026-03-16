import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  getLegacyBoundaryMatrixPath,
  getRefreshedDependencyGraphPath,
} from './archivePaths.mjs';

const SOURCE_EXTENSIONS = ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx'];

function toObject(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

function toArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

function normalizePathToken(value) {
  return String(value || '').trim();
}

function normalizeSlashes(filePath) {
  return String(filePath || '').split(path.sep).join('/');
}

function collectSourceFiles(rootDir) {
  const files = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const rows = fs.readdirSync(current, { withFileTypes: true });
    for (const row of rows) {
      const full = path.join(current, row.name);
      if (row.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!row.isFile()) continue;
      if (!SOURCE_EXTENSIONS.includes(path.extname(row.name))) continue;
      files.push(full);
    }
  }
  return files.sort();
}

function extractImportSpecifiers(source) {
  const specs = [];
  const regexes = [
    /\bimport\s+[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bexport\s+[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const regex of regexes) {
    let match = regex.exec(source);
    while (match) {
      specs.push(String(match[1] || '').trim());
      match = regex.exec(source);
    }
  }
  return specs.filter((item) => item.startsWith('.'));
}

function resolveRelativeImport(fromFile, specifier) {
  const resolvedBase = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [];
  if (path.extname(resolvedBase)) {
    candidates.push(resolvedBase);
  } else {
    candidates.push(resolvedBase);
    for (const ext of SOURCE_EXTENSIONS) {
      candidates.push(`${resolvedBase}${ext}`);
    }
    for (const ext of SOURCE_EXTENSIONS) {
      candidates.push(path.join(resolvedBase, `index${ext}`));
    }
  }

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const stat = fs.statSync(candidate);
    if (stat.isFile()) return candidate;
  }
  return null;
}

function buildZoneIndex(lanes = {}) {
  const out = new Map();
  for (const [lane, zones] of Object.entries(toObject(lanes, {}))) {
    for (const zone of toArray(zones, [])) {
      const token = normalizePathToken(zone);
      if (!token) continue;
      out.set(token, lane);
    }
  }
  return out;
}

function resolveZoneToken(filePath, rootDir, zoneIndex) {
  const rel = normalizeSlashes(path.relative(rootDir, filePath));
  const parts = rel.split('/').filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) {
    const token = parts[0];
    return zoneIndex.has(token) ? token : '';
  }
  const token = parts[0];
  return zoneIndex.has(token) ? token : '';
}

function incrementMap(map, key, delta = 1) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + delta);
}

function toSortedPairs(counts) {
  return [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return String(a[0]).localeCompare(String(b[0]));
  });
}

function computeCycles(nodes, adjacency) {
  let index = 0;
  const stack = [];
  const onStack = new Set();
  const indices = new Map();
  const lowLink = new Map();
  const cycles = [];

  function strongConnect(node) {
    indices.set(node, index);
    lowLink.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);

    for (const next of adjacency.get(node) || []) {
      if (!indices.has(next)) {
        strongConnect(next);
        lowLink.set(node, Math.min(lowLink.get(node), lowLink.get(next)));
      } else if (onStack.has(next)) {
        lowLink.set(node, Math.min(lowLink.get(node), indices.get(next)));
      }
    }

    if (lowLink.get(node) !== indices.get(node)) return;

    const component = [];
    while (stack.length > 0) {
      const top = stack.pop();
      if (!top) break;
      onStack.delete(top);
      component.push(top);
      if (top === node) break;
    }

    if (component.length > 1) {
      cycles.push(component.sort());
      return;
    }
    const only = component[0];
    if (!only) return;
    if ((adjacency.get(only) || []).has(only)) {
      cycles.push(component);
    }
  }

  for (const node of nodes) {
    if (!indices.has(node)) strongConnect(node);
  }

  return cycles;
}

function buildBidirectionalPairs(crossPairCounts) {
  const visited = new Set();
  const rows = [];
  for (const [pair, ab] of crossPairCounts.entries()) {
    const [a, b] = String(pair).split('=>');
    if (!a || !b) continue;
    if (visited.has(pair)) continue;
    const reverse = `${b}=>${a}`;
    const ba = crossPairCounts.get(reverse) || 0;
    if (ba <= 0) continue;
    visited.add(pair);
    visited.add(reverse);
    rows.push({
      a,
      b,
      ab,
      ba,
      total: ab + ba,
    });
  }
  return rows.sort((left, right) => {
    if (right.total !== left.total) return right.total - left.total;
    const leftKey = `${left.a}|${left.b}`;
    const rightKey = `${right.a}|${right.b}`;
    return leftKey.localeCompare(rightKey);
  });
}

export function buildDependencyGraph({
  label,
  rootDir,
  lanes,
} = {}) {
  const token = normalizePathToken(label) || 'graph';
  const root = path.resolve(rootDir || '.');
  const laneConfig = toObject(lanes, {});
  const zoneIndex = buildZoneIndex(laneConfig);
  const files = collectSourceFiles(root);
  const fileSet = new Set(files);
  const outgoingByZone = new Map();
  const incomingByZone = new Map();
  const crossPairCounts = new Map();
  const adjacency = new Map();

  for (const filePath of files) {
    adjacency.set(filePath, new Set());
  }

  let edgeCount = 0;
  for (const filePath of files) {
    const source = fs.readFileSync(filePath, 'utf8');
    const fromZone = resolveZoneToken(filePath, root, zoneIndex);
    const specs = extractImportSpecifiers(source);
    for (const spec of specs) {
      const resolved = resolveRelativeImport(filePath, spec);
      if (!resolved) continue;
      if (!fileSet.has(resolved)) continue;
      edgeCount += 1;
      adjacency.get(filePath)?.add(resolved);
      const toZone = resolveZoneToken(resolved, root, zoneIndex);
      incrementMap(outgoingByZone, fromZone, 1);
      incrementMap(incomingByZone, toZone, 1);
      if (fromZone && toZone && fromZone !== toZone) {
        const pair = `${fromZone}=>${toZone}`;
        incrementMap(crossPairCounts, pair, 1);
      }
    }
  }

  const cycleComponents = computeCycles(files, adjacency);
  const cycles = cycleComponents.map((component) => (
    component
      .map((filePath) => normalizeSlashes(path.relative(process.cwd(), filePath)))
      .sort()
  )).sort((a, b) => {
    const left = a.join('|');
    const right = b.join('|');
    return left.localeCompare(right);
  });

  const topCross = [...crossPairCounts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return String(a[0]).localeCompare(String(b[0]));
  }).map(([pair, edges]) => {
    const [from, to] = String(pair).split('=>');
    return { pair, from, to, edges };
  });

  return {
    label: token,
    generated_at: new Date().toISOString(),
    root: path.relative(process.cwd(), root),
    files: files.length,
    edges: edgeCount,
    cycle_count: cycles.length,
    cycles,
    top_outgoing_zones: toSortedPairs(outgoingByZone),
    top_incoming_zones: toSortedPairs(incomingByZone),
    top_cross_zone_edges: topCross,
    bidirectional_zone_pairs: buildBidirectionalPairs(crossPairCounts),
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i] || '');
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !String(next).startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = 'true';
    }
  }
  return args;
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveDomainInput(domainArg) {
  const token = String(domainArg || '').trim().toLowerCase();
  if (token === 'backend' || token === 'gui') return token;
  return '';
}

export function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const matrixPath = path.resolve(args.matrix || getLegacyBoundaryMatrixPath());
  const domain = resolveDomainInput(args.domain);
  if (!domain) {
    console.error('error=domain_required');
    console.error('usage=--domain backend|gui [--matrix <path>] [--root <path>] --out <path>');
    return 1;
  }
  const rootArg = args.root || (domain === 'backend' ? 'src' : path.join('tools', 'gui-react', 'src'));
  const rootDir = path.resolve(rootArg);
  const outPath = path.resolve(
    args.out
      || getRefreshedDependencyGraphPath({
        domain,
        date: new Date().toISOString().slice(0, 10),
      }),
  );
  const matrix = readJson(matrixPath);
  const lanes = toObject(matrix?.[domain]?.lanes, {});
  const graph = buildDependencyGraph({
    label: domain,
    rootDir,
    lanes,
  });
  ensureParentDir(outPath);
  fs.writeFileSync(outPath, JSON.stringify(graph, null, 2));
  console.log(`dependency_graph=${outPath}`);
  console.log(`domain=${domain}`);
  console.log(`files=${graph.files}`);
  console.log(`edges=${graph.edges}`);
  console.log(`cycle_count=${graph.cycle_count}`);
  return 0;
}

const isCliEntry = (() => {
  const entryArg = process.argv[1];
  if (!entryArg) return false;
  return import.meta.url === pathToFileURL(path.resolve(entryArg)).href;
})();

if (isCliEntry) {
  const code = runCli(process.argv.slice(2));
  if (code !== 0) process.exit(code);
}
