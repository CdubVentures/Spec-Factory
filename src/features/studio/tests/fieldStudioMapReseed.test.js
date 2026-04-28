import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { sha256Hex } from '../../../shared/contentHash.js';
import {
  reseedCompiledRulesAndBootConfig,
  reseedFieldStudioMapFromJson,
} from '../fieldStudioMapReseed.js';

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeMinimalGeneratedArtifacts({ tempRoot, category, reportHash }) {
  const generatedRoot = path.join(tempRoot, category, '_generated');
  await writeJson(path.join(generatedRoot, 'field_rules.json'), {
    category,
    generated_at: '2026-04-28T20:00:00.000Z',
    fields: {
      dpi: {
        ui: { label: 'DPI' },
        priority: { required_level: 'non_mandatory' },
      },
    },
  });
  await writeJson(path.join(generatedRoot, 'ui_field_catalog.json'), {
    category,
    fields: [{ key: 'dpi', label: 'DPI' }],
  });
  await writeJson(path.join(generatedRoot, 'known_values.json'), { fields: {} });
  await writeJson(path.join(generatedRoot, 'parse_templates.json'), {});
  await writeJson(path.join(generatedRoot, 'cross_validation_rules.json'), []);
  await writeJson(path.join(generatedRoot, 'field_groups.json'), { groups: [] });
  await writeJson(path.join(generatedRoot, 'key_migrations.json'), {});
  await writeJson(path.join(generatedRoot, '_compile_report.json'), {
    compiled: true,
    compiled_at: '2026-04-28T21:00:00.000Z',
    field_studio_map_hash: reportHash,
  });
  await writeJson(path.join(generatedRoot, 'manifest.json'), {
    generated_at: '2026-04-22T21:07:14.006Z',
    source_map_hash: 'stale-manifest-hash',
  });
}

test('compiled rules sync uses current compile report map hash when manifest is stale', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-reseed-'));
  try {
    const category = 'mouse';
    await writeMinimalGeneratedArtifacts({
      tempRoot,
      category,
      reportHash: 'current-map-hash',
    });

    const writes = [];
    const specDb = {
      category,
      upsertCompiledRules: (compiledRulesJson, bootConfigJson) => {
        writes.push({
          compiledRules: JSON.parse(compiledRulesJson),
          bootConfig: JSON.parse(bootConfigJson),
        });
      },
    };

    const result = await reseedCompiledRulesAndBootConfig({
      specDb,
      helperRoot: tempRoot,
    });

    assert.equal(result.reseeded, true);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].compiledRules.source_map_hash, 'current-map-hash');
    assert.equal(writes[0].compiledRules.compiled_at, '2026-04-28T21:00:00.000Z');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('map reseed still refreshes compiled rules when map file hash is unchanged', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-reseed-'));
  try {
    const category = 'keyboard';
    const mapPath = path.join(tempRoot, category, '_control_plane', 'field_studio_map.json');
    await writeJson(mapPath, { version: 2, selected_keys: ['dpi'], field_overrides: {} });
    const rawMap = await fs.readFile(mapPath, 'utf8');
    const fileSeedHash = sha256Hex(rawMap);
    await writeMinimalGeneratedArtifacts({
      tempRoot,
      category,
      reportHash: 'current-map-hash',
    });

    const writes = [];
    const specDb = {
      category,
      getFileSeedHash: () => fileSeedHash,
      upsertCompiledRules: (compiledRulesJson, bootConfigJson) => {
        writes.push({
          compiledRules: JSON.parse(compiledRulesJson),
          bootConfig: JSON.parse(bootConfigJson),
        });
      },
    };

    const result = await reseedFieldStudioMapFromJson({
      specDb,
      helperRoot: tempRoot,
    });

    assert.equal(result.reseeded, false);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].compiledRules.source_map_hash, 'current-map-hash');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
