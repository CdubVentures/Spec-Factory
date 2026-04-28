import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
export { FieldRulesEngine } from '../../fieldRulesEngine.js';

// Shared temp-fixture builders for FieldRulesEngine test slices.

export async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function createEngineFixtureRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'phase3-engine-'));
  const helperRoot = path.join(root, 'category_authority');
  const generatedRoot = path.join(helperRoot, 'mouse', '_generated');

  await writeJson(path.join(generatedRoot, 'field_rules.json'), {
    category: 'mouse',
    fields: {
      weight: {
        required_level: 'mandatory',
        difficulty: 'easy',
        availability: 'always',
        contract: {
          type: 'number',
          shape: 'scalar',
          unit: 'g',
          range: {
            min: 30,
            max: 200
          }
        }
      },
      connection: {
        required_level: 'mandatory',
        difficulty: 'easy',
        availability: 'always',
        enum_policy: 'closed',
        contract: {
          type: 'string',
          shape: 'scalar'
        }
      },
      battery_hours: {
        required_level: 'non_mandatory',
        difficulty: 'medium',
        availability: 'sometimes',
        contract: {
          type: 'number',
          shape: 'scalar',
          range: { min: 1, max: 400 }
        }
      },
      sensor: {
        required_level: 'mandatory',
        difficulty: 'easy',
        availability: 'always',
        // Phase 2: enum.source is the SSOT linkage to a component_db.
        enum: { source: 'component_db.sensor', policy: 'open_prefer_known' },
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
          {
            canonical: 'wired',
            aliases: ['usb wired']
          },
          {
            canonical: 'wireless',
            aliases: ['2.4ghz']
          },
          {
            canonical: 'bluetooth',
            aliases: ['bt']
          }
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
    rules: [
      {
        rule_id: 'wireless_battery_required',
        trigger_field: 'connection',
        condition: "connection IN ['wireless','bluetooth']",
        requires_field: 'battery_hours',
        on_fail: 'set_unknown_with_reason'
      }
    ]
  });

  await writeJson(path.join(generatedRoot, 'key_migrations.json'), {
    version: '1.2.0',
    previous_version: '1.1.0',
    bump: 'minor',
    summary: {
      added_count: 1,
      removed_count: 0,
      changed_count: 0
    },
    key_map: {
      mouse_side_connector: 'connection'
    },
    migrations: [
      {
        type: 'rename',
        from: 'mouse_side_connector',
        to: 'connection',
        reason: 'generalize connector naming'
      }
    ]
  });

  await writeJson(path.join(generatedRoot, 'component_db', 'sensors.json'), {
    component_type: 'sensor',
    db_name: 'sensors',
    entries: {
      PAW3395: {
        canonical_name: 'PAW3395',
        aliases: ['pixart 3395'],
        properties: {
          max_dpi: 26000
        }
      }
    }
  });

  await writeJson(path.join(generatedRoot, 'ui_field_catalog.json'), {
    category: 'mouse',
    fields: [
      { key: 'weight', group: 'physical' },
      { key: 'connection', group: 'connectivity' },
      { key: 'battery_hours', group: 'connectivity' },
      { key: 'sensor', group: 'sensor' }
    ]
  });

  return {
    root,
    helperRoot
  };
}

export async function createAdvancedEngineFixtureRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'phase3-engine-advanced-'));
  const helperRoot = path.join(root, 'category_authority');
  const generatedRoot = path.join(helperRoot, 'mouse', '_generated');

  await writeJson(path.join(generatedRoot, 'field_rules.json'), {
    category: 'mouse',
    fields: {
      sensor: {
        required_level: 'mandatory',
        difficulty: 'easy',
        availability: 'always',
        // Phase 2: enum.source = component_db.<X> is the SSOT linkage.
        enum: { source: 'component_db.sensor', policy: 'open_prefer_known' },
        contract: { type: 'component_ref', shape: 'scalar' }
      },
      dpi: {
        required_level: 'mandatory',
        difficulty: 'easy',
        availability: 'always',
        contract: { type: 'number', shape: 'scalar', range: { min: 100, max: 50000 } }
      },
      spec_url: {
        required_level: 'non_mandatory',
        difficulty: 'easy',
        availability: 'sometimes',
        contract: { type: 'url', shape: 'scalar' }
      },
      coating: {
        required_level: 'non_mandatory',
        difficulty: 'medium',
        availability: 'sometimes',
        enum_policy: 'open',
        contract: { type: 'string', shape: 'scalar' }
      },
      lngth: {
        required_level: 'non_mandatory',
        difficulty: 'easy',
        availability: 'always',
        contract: { type: 'number', shape: 'scalar', unit: 'mm' }
      },
      width: {
        required_level: 'non_mandatory',
        difficulty: 'easy',
        availability: 'always',
        contract: { type: 'number', shape: 'scalar', unit: 'mm' }
      },
      height: {
        required_level: 'non_mandatory',
        difficulty: 'easy',
        availability: 'always',
        contract: { type: 'number', shape: 'scalar', unit: 'mm' }
      },
      connection: {
        required_level: 'mandatory',
        difficulty: 'easy',
        availability: 'always',
        contract: { type: 'string', shape: 'scalar' }
      },
      battery_hours: {
        required_level: 'non_mandatory',
        difficulty: 'medium',
        availability: 'sometimes',
        contract: { type: 'number', shape: 'scalar', range: { min: 1, max: 400 } }
      },
      polling_rates: {
        required_level: 'non_mandatory',
        difficulty: 'easy',
        availability: 'sometimes',
        contract: {
          type: 'integer',
          shape: 'list',
          normalization_fn: 'parse_polling_list'
        }
      }
    }
  });

  await writeJson(path.join(generatedRoot, 'known_values.json'), {
    category: 'mouse',
    enums: {
      coating: {
        policy: 'open',
        values: [
          { canonical: 'matte', aliases: ['matte finish'] },
          { canonical: 'glossy', aliases: ['gloss'] }
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
        rule_id: 'sensor_dpi_limit',
        trigger_field: 'dpi',
        check: {
          type: 'component_db_lookup',
          db: 'sensor',
          lookup_field: 'sensor',
          compare_field: 'max_dpi',
          tolerance_percent: 0
        }
      },
      {
        rule_id: 'dimensions_triplet',
        trigger_field: 'lngth',
        check: {
          type: 'group_completeness',
          minimum_present: 3
        },
        related_fields: ['lngth', 'width', 'height']
      },
      {
        rule_id: 'wired_has_no_battery',
        trigger_field: 'connection',
        condition: "connection IN ['wired']",
        check: {
          type: 'mutual_exclusion'
        },
        related_fields: ['battery_hours']
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

  await writeJson(path.join(generatedRoot, 'component_db', 'sensors.json'), {
    component_type: 'sensor',
    db_name: 'sensors',
    entries: {
      PAW3395: {
        canonical_name: 'PAW3395',
        aliases: ['pixart 3395'],
        properties: {
          max_dpi: 26000
        }
      }
    }
  });

  await writeJson(path.join(generatedRoot, 'ui_field_catalog.json'), {
    category: 'mouse',
    fields: [
      { key: 'sensor', group: 'sensor' },
      { key: 'dpi', group: 'sensor' },
      { key: 'spec_url', group: 'identity' },
      { key: 'coating', group: 'physical' }
    ]
  });

  return {
    root,
    helperRoot
  };
}
