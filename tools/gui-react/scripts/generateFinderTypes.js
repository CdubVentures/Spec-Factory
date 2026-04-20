// WHY: O(1) Feature Scaling — auto-generates editorial types (LLM response +
// GET response) from each finder's Zod schemas. Finders opt in by declaring
// `getResponseSchemaExport` in finderModuleRegistry.js. Writes one
// types.generated.ts per opted-in finder.
//
// Usage:
//   node tools/gui-react/scripts/generateFinderTypes.js                  — regenerate all opted-in finders
//   node tools/gui-react/scripts/generateFinderTypes.js releaseDateFinder — regenerate one
//
// Output: tools/gui-react/src/features/{panelFeaturePath}/types.generated.ts

import fs from 'node:fs';
import path from 'node:path';
import { FINDER_MODULES, deriveFinderPaths } from '../../../src/core/finder/finderModuleRegistry.js';

// WHY: Shared editorial schemas produce named types (EvidenceRef,
// PublisherCandidateRef, RejectionMetadata) that MANY finders reference.
// The walker emits these as named types and replaces structural matches
// in the per-finder schemas with type references. Matching is by
// field-name heuristic — the only three shared types we know about today.
const SHARED_TYPE_REFS = {
  evidence_refs: 'EvidenceRef',
  sources: 'EvidenceRef',
  publisher_candidates: 'PublisherCandidateRef',
  rejection_reasons: 'RejectionMetadata',
};

const SHARED_TYPE_DECLARATIONS = `export interface EvidenceRef {
  url: string;
  tier: string;
  confidence: number;
  // Evidence-upgrade fields — populated by RDF + variantScalarFieldProducer
  // when they opt into the extended evidence shape. CEF/PIF/carousel leave
  // these undefined. Optional so legacy pre-upgrade refs still parse cleanly.
  supporting_evidence?: string;
  evidence_kind?: string;
}

export interface PublisherCandidateRef {
  candidate_id: number;
  source_id: string;
  source_type: string;
  model: string;
  value: string;
  confidence: number;
  status: string;
  submitted_at: string;
  metadata?: Record<string, unknown>;
}

export interface RejectionMetadata {
  reason_code: string;
  detail?: unknown;
}`;

/**
 * Resolve a JSON-Schema `type` field (may be string or array of strings).
 * Returns { base, nullable } where base is 'string'|'number'|... and nullable
 * is true iff 'null' appears in the type list.
 */
function resolveType(schema) {
  if (!schema || !schema.type) return { base: null, nullable: false };
  if (Array.isArray(schema.type)) {
    const nullable = schema.type.includes('null');
    const others = schema.type.filter((t) => t !== 'null');
    return { base: others[0] || null, nullable };
  }
  return { base: schema.type, nullable: false };
}

/**
 * Walk a JSON schema and emit TypeScript. Handles arrays, objects,
 * nullables, primitive types, and special-cased shared refs by field name.
 */
function jsonSchemaToTs(schema, indent, keyHint = null) {
  if (!schema) return 'unknown';
  // anyOf/oneOf: emit as union
  if (Array.isArray(schema.anyOf)) {
    const members = schema.anyOf.map((s) => jsonSchemaToTs(s, indent));
    return members.join(' | ');
  }
  const { base, nullable } = resolveType(schema);
  if (!base) {
    // No type + no anyOf: treat as unknown
    return nullable ? 'null' : 'unknown';
  }
  let ts;
  switch (base) {
    case 'null':
      ts = 'null';
      break;
    case 'string':
      ts = 'string';
      break;
    case 'integer':
    case 'number':
      ts = 'number';
      break;
    case 'boolean':
      ts = 'boolean';
      break;
    case 'array': {
      const itemTs = SHARED_TYPE_REFS[keyHint]
        ? SHARED_TYPE_REFS[keyHint]
        : jsonSchemaToTs(schema.items, indent);
      ts = `${itemTs}[]`;
      break;
    }
    case 'object': {
      if (schema.additionalProperties !== undefined && !schema.properties) {
        // record<string, T>
        const valTs = typeof schema.additionalProperties === 'object'
          ? jsonSchemaToTs(schema.additionalProperties, indent)
          : 'unknown';
        ts = `Record<string, ${valTs}>`;
        break;
      }
      const pad = '  '.repeat(indent + 1);
      const closing = '  '.repeat(indent);
      const required = new Set(schema.required || []);
      const props = schema.properties || {};
      const lines = ['{'];
      for (const [k, v] of Object.entries(props)) {
        const opt = required.has(k) ? '' : '?';
        lines.push(`${pad}${k}${opt}: ${jsonSchemaToTs(v, indent + 1, k)};`);
      }
      lines.push(`${closing}}`);
      ts = lines.join('\n');
      break;
    }
    default:
      ts = 'unknown';
  }
  return nullable ? `${ts} | null` : ts;
}

function emitInterface(name, schema) {
  return `export interface ${name} ${jsonSchemaToTs(schema, 0)}`;
}

/**
 * Capitalize first letter. 'releaseDateFinder' → 'ReleaseDateFinder'
 */
function pascal(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}

/**
 * Build the generated types for one finder module.
 */
export async function buildFinderTypesSource(module) {
  const { id, responseSchemaExport, getResponseSchemaExport } = module;
  if (!getResponseSchemaExport) {
    throw new Error(`finder ${id} does not declare getResponseSchemaExport`);
  }
  const { featurePath, schemaModule } = deriveFinderPaths(id);

  // Import the feature's schema module (dynamic import relative to repo root)
  const schemaPath = path.resolve(
    import.meta.dirname,
    `../../../src/features/${featurePath}/${schemaModule}.js`,
  );
  const schemaImports = await import(`file://${schemaPath.replace(/\\/g, '/')}`);

  const llmSchema = schemaImports[responseSchemaExport];
  const getSchema = schemaImports[getResponseSchemaExport];
  if (!llmSchema) throw new Error(`${id}: ${responseSchemaExport} not found in schema module`);
  if (!getSchema) throw new Error(`${id}: ${getResponseSchemaExport} not found in schema module`);

  const llmJson = llmSchema.toJSONSchema();
  const getJson = getSchema.toJSONSchema();

  // Derive feature-scoped type names
  const base = pascal(id); // 'ReleaseDateFinder'
  const llmName = `${base}LlmResponse`;
  const resultName = `${base}Result`;

  // For GET response: extract `candidates` item and `runs` item into named types
  const candidateSchema = getJson.properties?.candidates?.items;
  const runSchema = getJson.properties?.runs?.items;
  const candidateName = `${base}Candidate`;
  const runName = `${base}Run`;

  const chunks = [
    `// AUTO-GENERATED from src/features/${featurePath}/*Schema.js`,
    `// Run: node tools/gui-react/scripts/generateFinderTypes.js ${id}`,
    `// Do not edit manually.`,
    '',
    SHARED_TYPE_DECLARATIONS,
    '',
    emitInterface(llmName, llmJson),
    '',
  ];

  if (candidateSchema) {
    chunks.push(emitInterface(candidateName, candidateSchema));
    chunks.push('');
  }
  if (runSchema) {
    // WHY: Run.selected.candidates[] references the named Candidate type so
    // consumers can assign `run.selected.candidates[0]` to a ReleaseDateFinderCandidate
    // variable without needing structural inference.
    const runWithNamedRefs = {
      ...runSchema,
      properties: {
        ...runSchema.properties,
        selected: {
          type: 'object',
          required: ['candidates'],
          properties: {
            candidates: { type: 'array', items: { $named: candidateName } },
          },
        },
      },
    };
    chunks.push(`export interface ${runName} ${jsonSchemaToTsWithNamedRefs(runWithNamedRefs, 0)}`);
    chunks.push('');
  }

  // Emit the top-level Result interface, referencing the named types
  // for candidates[] and runs[].
  const getJsonWithRefs = {
    ...getJson,
    properties: {
      ...getJson.properties,
      candidates: { type: 'array', items: { $named: candidateName } },
      runs: { type: 'array', items: { $named: runName } },
      selected: {
        type: 'object',
        required: ['candidates'],
        properties: {
          candidates: { type: 'array', items: { $named: candidateName } },
        },
      },
    },
  };
  chunks.push(`export interface ${resultName} ${jsonSchemaToTsWithNamedRefs(getJsonWithRefs, 0)}`);
  chunks.push('');

  return chunks.join('\n');
}

/**
 * Variant of the walker that honors `$named` refs emitted by
 * buildFinderTypesSource (used only for the top-level Result type).
 */
function jsonSchemaToTsWithNamedRefs(schema, indent, keyHint = null) {
  if (schema && schema.$named) return schema.$named;
  if (!schema) return 'unknown';
  if (Array.isArray(schema.anyOf)) {
    return schema.anyOf.map((s) => jsonSchemaToTsWithNamedRefs(s, indent)).join(' | ');
  }
  const { base, nullable } = resolveType(schema);
  if (!base) return nullable ? 'null' : 'unknown';
  let ts;
  switch (base) {
    case 'null': ts = 'null'; break;
    case 'string': ts = 'string'; break;
    case 'integer':
    case 'number': ts = 'number'; break;
    case 'boolean': ts = 'boolean'; break;
    case 'array': {
      const itemTs = schema.items?.$named
        ? schema.items.$named
        : (SHARED_TYPE_REFS[keyHint] || jsonSchemaToTsWithNamedRefs(schema.items, indent));
      ts = `${itemTs}[]`;
      break;
    }
    case 'object': {
      if (schema.additionalProperties !== undefined && !schema.properties) {
        const valTs = typeof schema.additionalProperties === 'object'
          ? jsonSchemaToTsWithNamedRefs(schema.additionalProperties, indent)
          : 'unknown';
        ts = `Record<string, ${valTs}>`;
        break;
      }
      const pad = '  '.repeat(indent + 1);
      const closing = '  '.repeat(indent);
      const required = new Set(schema.required || []);
      const props = schema.properties || {};
      const lines = ['{'];
      for (const [k, v] of Object.entries(props)) {
        const opt = required.has(k) ? '' : '?';
        lines.push(`${pad}${k}${opt}: ${jsonSchemaToTsWithNamedRefs(v, indent + 1, k)};`);
      }
      lines.push(`${closing}}`);
      ts = lines.join('\n');
      break;
    }
    default: ts = 'unknown';
  }
  return nullable ? `${ts} | null` : ts;
}

/**
 * Entry point — regenerate one or all finders.
 */
async function main() {
  const arg = process.argv[2];
  const modules = FINDER_MODULES.filter((m) => m.getResponseSchemaExport);
  const target = arg
    ? modules.filter((m) => m.id === arg)
    : modules;

  if (arg && target.length === 0) {
    const opted = modules.map((m) => m.id).join(', ');
    throw new Error(`finder ${arg} not found or does not declare getResponseSchemaExport (opted-in: ${opted || '(none)'})`);
  }

  for (const module of target) {
    const source = await buildFinderTypesSource(module);
    const { panelFeaturePath } = deriveFinderPaths(module.id);
    const outPath = path.resolve(
      import.meta.dirname,
      `../src/features/${panelFeaturePath}/types.generated.ts`,
    );
    fs.writeFileSync(outPath, source, 'utf8');
    console.log(`Wrote ${outPath} (${source.split('\n').length} lines)`);
  }
}

// Run when invoked as CLI (detect by matching script basename in argv[1]).
// When imported by tests, argv[1] is the test file, so main() is skipped.
const argvScript = (process.argv[1] || '').replace(/\\/g, '/');
if (argvScript.endsWith('generateFinderTypes.js')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
