/**
 * generateFinderTypes — unit tests.
 *
 * Locks the codegen output shape against the real RDF schema. Any drift must
 * be INTENTIONAL: re-running the script should produce byte-identical output
 * to what's committed (this is also enforced by the `git diff --exit-code`
 * CI check).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildFinderTypesSource } from '../generateFinderTypes.js';
import { FINDER_MODULES, deriveFinderPaths } from '../../../../src/core/finder/finderModuleRegistry.js';

function getRdfModule() {
  const m = FINDER_MODULES.find((x) => x.id === 'releaseDateFinder');
  if (!m) throw new Error('RDF module not found in registry');
  return m;
}

describe('generateFinderTypes — buildFinderTypesSource', () => {
  it('emits shared editorial types (EvidenceRef, PublisherCandidateRef, RejectionMetadata)', async () => {
    const source = await buildFinderTypesSource(getRdfModule());
    assert.match(source, /export interface EvidenceRef \{/);
    assert.match(source, /export interface PublisherCandidateRef \{/);
    assert.match(source, /export interface RejectionMetadata \{/);
  });

  it('emits feature-scoped LLM response + candidate + run + result types', async () => {
    const source = await buildFinderTypesSource(getRdfModule());
    assert.match(source, /export interface ReleaseDateFinderLlmResponse \{/);
    assert.match(source, /export interface ReleaseDateFinderCandidate \{/);
    assert.match(source, /export interface ReleaseDateFinderRun \{/);
    assert.match(source, /export interface ReleaseDateFinderResult \{/);
  });

  it('candidate uses EvidenceRef[] for sources and PublisherCandidateRef[] for publisher_candidates', async () => {
    const source = await buildFinderTypesSource(getRdfModule());
    // Narrow to the candidate interface body
    const candidateBody = source.match(/export interface ReleaseDateFinderCandidate \{[^}]+\}/s)?.[0] || '';
    assert.match(candidateBody, /sources: EvidenceRef\[\];/);
    assert.match(candidateBody, /publisher_candidates\?: PublisherCandidateRef\[\];/);
    assert.match(candidateBody, /rejection_reasons\?: RejectionMetadata\[\];/);
  });

  it('candidate carries nullable variant_id + optional rejected_by_gate', async () => {
    const source = await buildFinderTypesSource(getRdfModule());
    const candidateBody = source.match(/export interface ReleaseDateFinderCandidate \{[^}]+\}/s)?.[0] || '';
    assert.match(candidateBody, /variant_id: string \| null;/);
    assert.match(candidateBody, /rejected_by_gate\?: boolean;/);
    assert.match(candidateBody, /publisher_error\?: string;/);
  });

  it('Run.selected.candidates uses the named Candidate type (not inlined)', async () => {
    const source = await buildFinderTypesSource(getRdfModule());
    // Extract the Run interface body
    const runStart = source.indexOf('export interface ReleaseDateFinderRun');
    const runEnd = source.indexOf('export interface ReleaseDateFinderResult');
    const runBody = source.slice(runStart, runEnd);
    assert.match(runBody, /candidates: ReleaseDateFinderCandidate\[\];/);
  });

  it('Result references named Candidate[] + Run[] types', async () => {
    const source = await buildFinderTypesSource(getRdfModule());
    const resultBody = source.slice(source.indexOf('export interface ReleaseDateFinderResult'));
    assert.match(resultBody, /candidates: ReleaseDateFinderCandidate\[\];/);
    assert.match(resultBody, /runs: ReleaseDateFinderRun\[\];/);
    assert.match(resultBody, /published_confidence: number \| null;/);
  });

  it('output starts with DO-NOT-EDIT header referencing the regen command', async () => {
    const source = await buildFinderTypesSource(getRdfModule());
    assert.match(source, /^\/\/ AUTO-GENERATED from/);
    assert.match(source, /Run: node tools\/gui-react\/scripts\/generateFinderTypes\.js releaseDateFinder/);
    assert.match(source, /Do not edit manually\./);
  });

  it('throws a clear error when finder has no getResponseSchemaExport', async () => {
    const fakeModule = { id: 'fakeFinder' };
    await assert.rejects(
      () => buildFinderTypesSource(fakeModule),
      /does not declare getResponseSchemaExport/,
    );
  });

  it('generated finder type files are byte-identical to generator output', async () => {
    const modules = FINDER_MODULES.filter((module) => module.getResponseSchemaExport);
    assert.ok(modules.length > 0, 'at least one finder must opt into type generation');

    for (const module of modules) {
      const expected = await buildFinderTypesSource(module);
      const { panelFeaturePath } = deriveFinderPaths(module.id);
      const filePath = path.resolve(
        'tools/gui-react/src/features',
        panelFeaturePath,
        'types.generated.ts',
      );
      const actual = await fs.readFile(filePath, 'utf8');
      assert.equal(
        actual,
        expected,
        `${module.id} generated types drifted; run node tools/gui-react/scripts/generateFinderTypes.js ${module.id}`,
      );
    }
  });
});
