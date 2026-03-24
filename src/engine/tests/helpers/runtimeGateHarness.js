import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FieldRulesEngine } from '../../fieldRulesEngine.js';

export async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function createEngineFixtureRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-gate-'));
  const helperRoot = path.join(root, 'category_authority');
  const generatedRoot = path.join(helperRoot, 'mouse', '_generated');

  await writeJson(path.join(generatedRoot, 'field_rules.json'), {
    category: 'mouse',
    fields: {
      weight: {
        required_level: 'required',
        difficulty: 'easy',
        availability: 'always',
        contract: {
          type: 'number',
          shape: 'scalar',
          unit: 'g',
          range: { min: 30, max: 200 }
        }
      },
      connection: {
        required_level: 'required',
        difficulty: 'easy',
        availability: 'always',
        enum_policy: 'closed',
        contract: {
          type: 'string',
          shape: 'scalar'
        }
      },
      dpi: {
        required_level: 'expected',
        difficulty: 'easy',
        availability: 'always',
        contract: {
          type: 'number',
          shape: 'scalar'
        }
      },
      coating: {
        required_level: 'optional',
        difficulty: 'medium',
        availability: 'sometimes',
        enum_policy: 'open',
        contract: {
          type: 'string',
          shape: 'scalar'
        }
      }
    }
  });

  await writeJson(path.join(generatedRoot, 'known_values.json'), {
    category: 'mouse',
    enums: {
      connection: {
        policy: 'closed',
        values: [
          { canonical: 'wired', aliases: ['usb wired'] },
          { canonical: 'wireless', aliases: ['2.4ghz'] }
        ]
      },
      coating: {
        policy: 'open',
        values: [
          { canonical: 'matte', aliases: ['matte finish'] }
        ]
      }
    }
  });

  await writeJson(path.join(generatedRoot, 'parse_templates.json'), {
    category: 'mouse',
    templates: {}
  });

  await writeJson(path.join(generatedRoot, 'cross_validation_rules.json'), {
    category: 'mouse',
    rules: [
      {
        rule_id: 'dpi_plausibility',
        trigger_field: 'dpi',
        check: {
          type: 'range',
          min: 100,
          max: 30000
        }
      }
    ]
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
    fields: [
      { key: 'weight', group: 'physical' },
      { key: 'connection', group: 'connectivity' },
      { key: 'dpi', group: 'sensor' },
      { key: 'coating', group: 'physical' }
    ]
  });

  return {
    root,
    helperRoot
  };
}

export async function withBaseEngine(fn) {
  const fixture = await createEngineFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });
    await fn(engine, fixture);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
}

export async function createEvidenceFixtureRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'runtimegate-evidence-'));
  const helperRoot = path.join(root, 'category_authority');
  const generatedRoot = path.join(helperRoot, 'mouse', '_generated');

  await writeJson(path.join(generatedRoot, 'field_rules.json'), {
    category: 'mouse',
    fields: {
      weight: {
        required_level: 'required',
        difficulty: 'easy',
        availability: 'always',
        evidence_required: true,
        contract: {
          type: 'number',
          shape: 'scalar',
          unit: 'g',
          range: { min: 30, max: 200 }
        }
      },
      connection: {
        required_level: 'required',
        difficulty: 'easy',
        availability: 'always',
        evidence_required: false,
        enum_policy: 'closed',
        contract: {
          type: 'string',
          shape: 'scalar'
        }
      },
      sensor: {
        required_level: 'critical',
        difficulty: 'easy',
        availability: 'always',
        evidence_required: true,
        contract: {
          type: 'string',
          shape: 'scalar'
        }
      }
    }
  });

  await writeJson(path.join(generatedRoot, 'known_values.json'), {
    category: 'mouse',
    enums: {
      connection: {
        policy: 'closed',
        values: [
          { canonical: 'wired', aliases: ['usb wired'] },
          { canonical: 'wireless', aliases: ['2.4ghz'] },
          { canonical: 'bluetooth', aliases: ['bt'] }
        ]
      }
    }
  });

  await writeJson(path.join(generatedRoot, 'parse_templates.json'), {
    category: 'mouse',
    templates: {
      weight: {
        patterns: [{ regex: '([\\d.]+)\\s*(g|oz)', group: 1 }]
      }
    }
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

  await writeJson(path.join(generatedRoot, 'component_db', 'sensors.json'), {
    component_type: 'sensor',
    db_name: 'sensors',
    entries: {}
  });

  await writeJson(path.join(generatedRoot, 'ui_field_catalog.json'), {
    category: 'mouse',
    fields: [
      { key: 'weight', group: 'physical' },
      { key: 'connection', group: 'connectivity' },
      { key: 'sensor', group: 'sensor' }
    ]
  });

  return { root, helperRoot };
}

export async function withEvidenceEngine(fn) {
  const fixture = await createEvidenceFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });
    await fn(engine, fixture);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
}

export function goodProvenance(field) {
  return {
    url: 'https://example.com/specs',
    source_id: 'example_com',
    snippet_id: 's1',
    snippet_hash: 'sha256:abc123',
    quote: field === 'weight' ? '54 g' : field === 'sensor' ? 'PAW3395' : 'wired',
    quote_span: null,
    retrieved_at: '2026-02-14T10:00:00Z',
    extraction_method: 'spec_table_match'
  };
}

export const goodEvidencePack = {
  snippets: {
    s1: {
      text: 'Weight: 54 g. Sensor: PAW3395. Connection: wired.',
      snippet_hash: 'sha256:abc123'
    }
  }
};

export async function createMinRefsFixtureRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'runtimegate-minrefs-'));
  const helperRoot = path.join(root, 'category_authority');
  const generatedRoot = path.join(helperRoot, 'mouse', '_generated');

  await writeJson(path.join(generatedRoot, 'field_rules.json'), {
    category: 'mouse',
    fields: {
      weight: {
        required_level: 'required',
        difficulty: 'easy',
        availability: 'always',
        evidence_required: true,
        evidence: {
          required: true,
          min_evidence_refs: 2,
          conflict_policy: 'resolve_by_tier_else_unknown',
          tier_preference: ['tier1', 'tier2', 'tier3']
        },
        contract: {
          type: 'number',
          shape: 'scalar',
          unit: 'g',
          range: { min: 30, max: 200 }
        }
      },
      connection: {
        required_level: 'required',
        difficulty: 'easy',
        availability: 'always',
        evidence_required: true,
        evidence: {
          required: true,
          min_evidence_refs: 1,
          conflict_policy: 'resolve_by_tier_else_unknown',
          tier_preference: ['tier1', 'tier2', 'tier3']
        },
        enum_policy: 'closed',
        contract: {
          type: 'string',
          shape: 'scalar'
        }
      },
      dpi: {
        required_level: 'expected',
        difficulty: 'easy',
        availability: 'always',
        evidence_required: false,
        evidence: {
          required: false,
          min_evidence_refs: 2,
          conflict_policy: 'resolve_by_tier_else_unknown',
          tier_preference: ['tier1', 'tier2', 'tier3']
        },
        contract: {
          type: 'number',
          shape: 'scalar',
          range: { min: 100, max: 50000 }
        }
      },
      coating: {
        required_level: 'optional',
        difficulty: 'medium',
        availability: 'sometimes',
        evidence_required: false,
        evidence: {
          required: false,
          min_evidence_refs: 0,
          conflict_policy: 'resolve_by_tier_else_unknown',
          tier_preference: ['tier1', 'tier2', 'tier3']
        },
        contract: {
          type: 'string',
          shape: 'scalar'
        }
      }
    }
  });

  await writeJson(path.join(generatedRoot, 'known_values.json'), {
    category: 'mouse',
    enums: {
      connection: {
        policy: 'closed',
        values: [
          { canonical: 'wired', aliases: ['usb wired'] },
          { canonical: 'wireless', aliases: ['2.4ghz'] }
        ]
      }
    }
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
    fields: [
      { key: 'weight', group: 'physical' },
      { key: 'connection', group: 'connectivity' },
      { key: 'dpi', group: 'sensor' },
      { key: 'coating', group: 'physical' }
    ]
  });

  return { root, helperRoot };
}

export async function withMinRefsEngine(fn) {
  const fixture = await createMinRefsFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });
    await fn(engine, fixture);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
}

export function buildProvenance(field, evidenceEntries) {
  return {
    [field]: {
      value: null,
      evidence: evidenceEntries
    }
  };
}

export function makeEvidence(url, snippetId, quote) {
  return {
    url,
    snippet_id: snippetId,
    quote,
    source_id: 'test_source',
    snippet_hash: 'sha256:test',
    retrieved_at: '2026-02-14T10:00:00Z',
    extraction_method: 'spec_table_match'
  };
}

export const minRefsEvidencePack = {
  snippets: {
    s1: { text: 'Weight: 54 g. DPI: 16000. Connection: wired. Coating: matte.', snippet_hash: 'sha256:test' },
    s2: { text: 'Weight confirmed 54 g by manufacturer spec sheet.', snippet_hash: 'sha256:test' },
    s3: { text: 'DPI specification: 16000.', snippet_hash: 'sha256:test' }
  }
};
