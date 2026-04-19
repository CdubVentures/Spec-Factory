// WHY: O(1) Feature Scaling — auto-generates RDF response + evidence types
// from the Zod schema (single source of truth). Replaces hand-written types
// that had drifted from the runtime shape (source_url/excerpt never existed;
// real shape is {url, tier, confidence}).
//
// Usage: node tools/gui-react/scripts/generateRdfTypes.js
// Output: tools/gui-react/src/features/release-date-finder/types.generated.ts

import fs from 'node:fs';
import path from 'node:path';
import { releaseDateFinderResponseSchema } from '../../../src/features/release-date/releaseDateSchema.js';

function jsonSchemaToTs(schema, indent, evidenceRefRef = null) {
  if (!schema || !schema.type) return 'unknown';
  const pad = '  '.repeat(indent + 1);
  const closingPad = '  '.repeat(indent);

  switch (schema.type) {
    case 'string': return 'string';
    case 'integer':
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'array':
      return `${jsonSchemaToTs(schema.items, indent, evidenceRefRef)}[]`;
    case 'object': {
      const required = new Set(schema.required || []);
      const props = schema.properties || {};
      const lines = ['{'];
      for (const [k, v] of Object.entries(props)) {
        const opt = required.has(k) ? '' : '?';
        if (evidenceRefRef && k === 'evidence_refs' && v.type === 'array') {
          lines.push(`${pad}${k}${opt}: ${evidenceRefRef}[];`);
        } else {
          lines.push(`${pad}${k}${opt}: ${jsonSchemaToTs(v, indent + 1, evidenceRefRef)};`);
        }
      }
      lines.push(`${closingPad}}`);
      return lines.join('\n');
    }
    default: return 'unknown';
  }
}

function emitInterface(name, schema, evidenceRefRef = null) {
  return `export interface ${name} ${jsonSchemaToTs(schema, 0, evidenceRefRef)}`;
}

const rootSchema = releaseDateFinderResponseSchema.toJSONSchema();
const evidenceRefItemSchema = rootSchema.properties?.evidence_refs?.items || null;

const chunks = [
  '// AUTO-GENERATED from src/features/release-date/releaseDateSchema.js',
  '// Run: node tools/gui-react/scripts/generateRdfTypes.js',
  '// Do not edit manually.',
  '',
];

if (evidenceRefItemSchema) {
  chunks.push(emitInterface('EvidenceRefGen', evidenceRefItemSchema));
  chunks.push('');
}

chunks.push(emitInterface('ReleaseDateFinderLlmResponseGen', rootSchema, evidenceRefItemSchema ? 'EvidenceRefGen' : null));
chunks.push('');

const outPath = path.resolve(
  import.meta.dirname,
  '../src/features/release-date-finder/types.generated.ts',
);
const content = chunks.join('\n');
fs.writeFileSync(outPath, content, 'utf8');
console.log(`Wrote ${outPath} (${content.split('\n').length} lines)`);
