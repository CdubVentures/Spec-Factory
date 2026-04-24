import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FieldRulesEngine, writeJson } from './fieldRulesEngineHarness.js';

async function seedGeneratedRoot(generatedRoot, { fields, uiFields }) {
  await writeJson(path.join(generatedRoot, 'field_rules.json'), {
    category: 'mouse',
    fields
  });

  await writeJson(path.join(generatedRoot, 'known_values.json'), {
    category: 'mouse',
    enums: {}
  });
  await writeJson(path.join(generatedRoot, 'parse_templates.json'), {
    category: 'mouse',
    templates: {}
  });
  await writeJson(path.join(generatedRoot, 'cross_validation_rules.json'), {
    category: 'mouse',
    rules: []
  });
  await writeJson(path.join(generatedRoot, 'key_migrations.json'), {
    version: '1.0.0',
    previous_version: '1.0.0',
    bump: 'patch',
    summary: { added_count: 0, removed_count: 0, changed_count: 0 },
    key_map: {},
    migrations: []
  });
  await writeJson(path.join(generatedRoot, 'ui_field_catalog.json'), {
    category: 'mouse',
    fields: uiFields
  });
}

async function createHarness({ tempPrefix, fields, uiFields }) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), tempPrefix));
  const helperRoot = path.join(root, 'category_authority');
  const generatedRoot = path.join(helperRoot, 'mouse', '_generated');

  await seedGeneratedRoot(generatedRoot, { fields, uiFields });

  const engine = await FieldRulesEngine.create('mouse', {
    config: { categoryAuthorityRoot: helperRoot }
  });

  return {
    root,
    helperRoot,
    engine,
    async cleanup() {
      await fs.rm(root, { recursive: true, force: true });
    }
  };
}

export async function createListRulesHarness() {
  return createHarness({
    tempPrefix: 'list-rules-',
    fields: {
      colors: {
        required_level: 'non_mandatory',
        difficulty: 'easy',
        availability: 'always',
        contract: {
          type: 'string',
          shape: 'list',
          list_rules: { dedupe: true, sort: 'none' }
        },
        evidence: { required: false }
      },
      features: {
        required_level: 'non_mandatory',
        difficulty: 'easy',
        availability: 'always',
        contract: {
          type: 'string',
          shape: 'list',
          list_rules: { dedupe: true, sort: 'asc' }
        },
        evidence: { required: false }
      },
      sizes: {
        required_level: 'non_mandatory',
        difficulty: 'easy',
        availability: 'always',
        contract: {
          type: 'number',
          shape: 'list',
          list_rules: { dedupe: true, sort: 'desc' }
        },
        evidence: { required: false }
      },
      tags: {
        required_level: 'non_mandatory',
        difficulty: 'easy',
        availability: 'always',
        contract: {
          type: 'string',
          shape: 'list',
          list_rules: { dedupe: false, sort: 'none' }
        },
        evidence: { required: false }
      },
      weight: {
        required_level: 'mandatory',
        difficulty: 'easy',
        availability: 'always',
        contract: {
          type: 'number',
          shape: 'scalar',
          unit: 'g',
          range: { min: 30, max: 200 }
        },
        evidence: { required: false }
      }
    },
    uiFields: [
      { key: 'colors', group: 'physical' },
      { key: 'features', group: 'features' },
      { key: 'sizes', group: 'physical' },
      { key: 'tags', group: 'meta' },
      { key: 'weight', group: 'physical' }
    ]
  });
}

export async function createListRulesNoLimitsHarness() {
  return createHarness({
    tempPrefix: 'list-rules-nolimits-',
    fields: {
      colors: {
        required_level: 'non_mandatory',
        difficulty: 'easy',
        availability: 'always',
        contract: {
          type: 'string',
          shape: 'list',
          list_rules: { dedupe: true, sort: 'none' }
        },
        evidence: { required: false }
      },
      features: {
        required_level: 'non_mandatory',
        difficulty: 'easy',
        availability: 'always',
        contract: {
          type: 'string',
          shape: 'list',
          list_rules: { dedupe: true, sort: 'asc' }
        },
        evidence: { required: false }
      },
      sizes: {
        required_level: 'non_mandatory',
        difficulty: 'easy',
        availability: 'always',
        contract: {
          type: 'number',
          shape: 'list',
          list_rules: { dedupe: true, sort: 'desc' }
        },
        evidence: { required: false }
      },
      tags: {
        required_level: 'non_mandatory',
        difficulty: 'easy',
        availability: 'always',
        contract: {
          type: 'string',
          shape: 'list',
          list_rules: { dedupe: false, sort: 'none' }
        },
        evidence: { required: false }
      },
      weight: {
        required_level: 'mandatory',
        difficulty: 'easy',
        availability: 'always',
        contract: {
          type: 'number',
          shape: 'scalar',
          unit: 'g',
          range: { min: 30, max: 200 }
        },
        evidence: { required: false }
      }
    },
    uiFields: [
      { key: 'colors', group: 'physical' },
      { key: 'features', group: 'features' },
      { key: 'sizes', group: 'physical' },
      { key: 'tags', group: 'meta' },
      { key: 'weight', group: 'physical' }
    ]
  });
}

export async function createListRulesNoConfigHarness() {
  return createHarness({
    tempPrefix: 'list-rules-noconfig-',
    fields: {
      labels: {
        required_level: 'non_mandatory',
        difficulty: 'easy',
        availability: 'always',
        contract: {
          type: 'string',
          shape: 'list'
        },
        evidence: { required: false }
      }
    },
    uiFields: [
      { key: 'labels', group: 'meta' }
    ]
  });
}
