/**
 * scalarFinderPromptGolden — byte-identical fixtures of SKU + RDF rendered
 * prompts. Safety net for the structural extraction that moves source
 * guidance + VARIANT DISAMBIGUATION into parameterized globals.
 *
 * Regenerate intentionally:
 *   REGEN_SCALAR_GOLDEN=1 node --test src/core/finder/tests/scalarFinderPromptGolden.test.js
 *
 * A failure here without an intentional regen means prompt composition
 * drifted — either fix the drift or regen + commit the new fixture.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSkuFinderPrompt } from '../../../features/sku/skuLlmAdapter.js';
import { buildReleaseDateFinderPrompt } from '../../../features/release-date/releaseDateLlmAdapter.js';
import { setGlobalPromptsSnapshot } from '../../llm/prompts/globalPromptStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'scalarPromptGolden');
const REGEN = process.env.REGEN_SCALAR_GOLDEN === '1';

const GOLDEN_INPUTS = {
  product: { brand: 'Corsair', model: 'M75 Air Wireless', base_model: 'M75', variant: 'black' },
  variantLabel: 'black',
  variantType: 'color',
  variantKey: 'color:black',
  allVariants: [
    { key: 'color:black', label: 'Black', type: 'color' },
    { key: 'color:white', label: 'White', type: 'color' },
  ],
  siblingsExcluded: ['Corsair M75', 'Corsair M75 Wireless'],
  familyModelCount: 3,
  ambiguityLevel: 'medium',
  previousDiscovery: { urlsChecked: [], queriesRun: [] },
};

function compareOrRegen(name, rendered) {
  const fixturePath = path.join(FIXTURES_DIR, `${name}.expected.txt`);
  if (REGEN) {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
    fs.writeFileSync(fixturePath, rendered, 'utf8');
    console.log(`WROTE fixture ${fixturePath} (${rendered.length} bytes)`);
    return;
  }
  const expected = fs.readFileSync(fixturePath, 'utf8');
  assert.equal(
    rendered,
    expected,
    `${name} rendered prompt drifted from golden fixture — regenerate with REGEN_SCALAR_GOLDEN=1 if intentional`,
  );
}

describe('scalar finder prompt goldens (byte-identical safety net)', () => {
  before(() => {
    setGlobalPromptsSnapshot({});
  });

  it('SKU prompt matches golden fixture', () => {
    const rendered = buildSkuFinderPrompt(GOLDEN_INPUTS);
    compareOrRegen('sku', rendered);
  });

  it('RDF prompt matches golden fixture', () => {
    const rendered = buildReleaseDateFinderPrompt(GOLDEN_INPUTS);
    compareOrRegen('rdf', rendered);
  });
});
