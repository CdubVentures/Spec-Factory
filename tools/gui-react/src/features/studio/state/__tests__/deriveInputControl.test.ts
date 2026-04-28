import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveInputControl } from '../deriveInputControl.ts';
import type { DeriveInputControlOptions } from '../deriveInputControl.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATEGORY_ROOT = resolve(__dirname, '..', '..', '..', '..', '..', '..', '..', 'category_authority');

// ── Section A: Unit test matrix (table-driven) ─────────────────────────

interface TestCase {
  description: string;
  input: DeriveInputControlOptions;
  expected: string;
}

const CASES: TestCase[] = [
  // Rule 1: component_db source → component_picker
  {
    description: 'component_db via enum.source',
    input: { type: 'string', shape: 'scalar', enumSource: 'component_db.sensor', enumPolicy: 'open' },
    expected: 'component_picker',
  },
  // Phase 2: enum.source is the single component_db linkage. The legacy
  // componentSource parameter was retired alongside the rule.component.* block.
  {
    description: 'component_db via enum.source — open policy',
    input: { type: 'string', shape: 'scalar', enumSource: 'component_db.encoder', enumPolicy: 'open' },
    expected: 'component_picker',
  },

  // Rule 2: list + non-string → list_editor
  {
    description: 'list + mixed_number_range',
    input: { type: 'mixed_number_range', shape: 'list' },
    expected: 'list_editor',
  },
  {
    description: 'list + number',
    input: { type: 'number', shape: 'list', enumPolicy: 'open_prefer_known' },
    expected: 'list_editor',
  },
  {
    description: 'list + integer',
    input: { type: 'integer', shape: 'list' },
    expected: 'list_editor',
  },

  // Rule 3: list + string → token_list
  {
    description: 'list + string (default)',
    input: { type: 'string', shape: 'list' },
    expected: 'token_list',
  },
  {
    description: 'list + string + data_lists closed',
    input: { type: 'string', shape: 'list', enumSource: 'data_lists.colors', enumPolicy: 'closed' },
    expected: 'token_list',
  },
  {
    description: 'list + string + data_lists open_prefer_known',
    input: { type: 'string', shape: 'list', enumSource: 'data_lists.coating', enumPolicy: 'open_prefer_known' },
    expected: 'token_list',
  },

  // Rule 4: type coupling
  {
    description: 'boolean scalar',
    input: { type: 'boolean', shape: 'scalar', enumSource: 'yes_no', enumPolicy: 'closed' },
    expected: 'text',
  },
  {
    description: 'url scalar',
    input: { type: 'url', shape: 'scalar' },
    expected: 'url',
  },
  {
    description: 'date scalar',
    input: { type: 'date', shape: 'scalar' },
    expected: 'date',
  },
  {
    description: 'number scalar',
    input: { type: 'number', shape: 'scalar' },
    expected: 'number',
  },
  {
    description: 'integer scalar',
    input: { type: 'integer', shape: 'scalar' },
    expected: 'number',
  },

  // Rule 5: scalar + data_lists + restrictive policy → select
  {
    description: 'scalar + data_lists + closed',
    input: { type: 'string', shape: 'scalar', enumSource: 'data_lists.form_factor', enumPolicy: 'closed' },
    expected: 'select',
  },
  {
    description: 'scalar + data_lists + open_prefer_known',
    input: { type: 'string', shape: 'scalar', enumSource: 'data_lists.connection', enumPolicy: 'open_prefer_known' },
    expected: 'select',
  },
  {
    description: 'scalar + data_lists + open (no select)',
    input: { type: 'string', shape: 'scalar', enumSource: 'data_lists.foo', enumPolicy: 'open' },
    expected: 'text',
  },

  // Rule 6: fallback
  {
    description: 'scalar + yes_no source (falls through to text)',
    input: { type: 'string', shape: 'scalar', enumSource: 'yes_no', enumPolicy: 'closed' },
    expected: 'text',
  },
  {
    description: 'scalar string no source',
    input: { type: 'string', shape: 'scalar' },
    expected: 'text',
  },
  {
    description: 'all null/undefined inputs',
    input: {},
    expected: 'text',
  },

  // Priority: component_db wins over shape and type
  {
    description: 'component_db + list shape (component wins)',
    input: { type: 'string', shape: 'list', enumSource: 'component_db.x' },
    expected: 'component_picker',
  },
  {
    description: 'component_db + number type (component wins)',
    input: { type: 'number', shape: 'scalar', enumSource: 'component_db.x' },
    expected: 'component_picker',
  },
];

describe('deriveInputControl — unit matrix', () => {
  for (const { description, input, expected } of CASES) {
    it(description, () => {
      assert.equal(deriveInputControl(input), expected);
    });
  }
});

// ── Section B: Regression guard — input_control must not exist in generated JSON

const CATEGORIES = ['keyboard', 'monitor', 'mouse'] as const;

describe('deriveInputControl — regression: no input_control in generated JSON', () => {
  for (const category of CATEGORIES) {
    it(`${category}/field_rules.json has no input_control`, () => {
      const rulesPath = resolve(CATEGORY_ROOT, category, '_generated', 'field_rules.json');
      const raw = readFileSync(rulesPath, 'utf8');
      assert.equal(raw.includes('"input_control"'), false);
    });

    it(`${category}/ui_field_catalog.json has no input_control`, () => {
      const catalogPath = resolve(CATEGORY_ROOT, category, '_generated', 'ui_field_catalog.json');
      const raw = readFileSync(catalogPath, 'utf8');
      assert.equal(raw.includes('"input_control"'), false);
    });
  }
});
