// WHY: Shared helper for contract alignment tests. Parses TS interface
// declarations from source text and extracts top-level property names.
// Used by all *ShapeAlignment.test.js files to verify backend shape
// descriptors match frontend TS interfaces.

import { ok } from 'node:assert';

export function extractInterfaceKeys(source, interfaceName) {
  const pattern = new RegExp(
    `(?:export\\s+)?interface\\s+${interfaceName}\\s*(?:extends\\s+([^{]+))?\\{`,
  );
  const match = source.match(pattern);
  if (!match) return null;

  const keys = [];
  if (match[1]) {
    const parents = match[1].split(',').map((p) => p.trim()).filter(Boolean);
    for (const parent of parents) {
      const parentKeys = extractInterfaceKeys(source, parent);
      if (parentKeys) keys.push(...parentKeys);
    }
  }

  const startIdx = match.index + match[0].length;
  let depth = 1;
  let blockEnd = startIdx;
  for (let i = startIdx; i < source.length && depth > 0; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') depth--;
    if (depth === 0) blockEnd = i;
  }

  const block = source.slice(startIdx, blockEnd);
  let nestedDepth = 0;
  for (const line of block.split('\n')) {
    for (const ch of line) {
      if (ch === '{' || ch === '[' || ch === '(') nestedDepth++;
      if (ch === '}' || ch === ']' || ch === ')') nestedDepth = Math.max(0, nestedDepth - 1);
    }
    if (nestedDepth <= 1) {
      const fieldMatch = line.match(/^\s{2}(\w+)\??:/);
      if (fieldMatch) keys.push(fieldMatch[1]);
    }
  }
  return keys;
}

export function assertContractKeysInInterface(typesSource, contractKeys, interfaceName) {
  const tsKeys = extractInterfaceKeys(typesSource, interfaceName);
  ok(tsKeys !== null, `interface ${interfaceName} not found in types source`);
  const tsKeySet = new Set(tsKeys);
  const missing = contractKeys.filter((k) => !tsKeySet.has(k));
  ok(
    missing.length === 0,
    `${interfaceName} is missing contract keys: [${missing.join(', ')}]`,
  );
}
