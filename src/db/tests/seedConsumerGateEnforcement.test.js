import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { SpecDb } from '../specDb.js';
import { seedSpecDb } from '../seed.js';

test('seed consumer gate disables component link creation when component.type is off', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'seed-consumer-gate-'));
  const category = 'mouse';
  const config = {
    categoryAuthorityRoot: path.join(tempRoot, 'category_authority'),
    localOutputRoot: path.join(tempRoot, 'out')
  };
  const dbPath = path.join(tempRoot, 'spec.db');
  const db = new SpecDb({ dbPath, category });

  try {
    const latestDir = path.join(
      config.localOutputRoot,
      'specs',
      'outputs',
      category,
      'product_1',
      'latest'
    );
    await fs.mkdir(latestDir, { recursive: true });
    await fs.writeFile(
      path.join(latestDir, 'normalized.json'),
      JSON.stringify({
        runId: 'run_1',
        fields: {
          sensor: 'PMW3389'
        }
      }, null, 2),
      'utf8'
    );
    await fs.writeFile(path.join(latestDir, 'candidates.json'), JSON.stringify({}, null, 2), 'utf8');
    await fs.writeFile(path.join(latestDir, 'provenance.json'), JSON.stringify({}, null, 2), 'utf8');

    const sensorEntry = {
      canonical_name: 'PMW3389',
      maker: 'PixArt',
      aliases: ['PixArt PMW3389'],
      properties: {}
    };

    const fieldRules = {
      rules: {
        fields: {
          sensor: {
            contract: { type: 'string', shape: 'scalar' },
            component: { type: 'sensor' },
            consumers: {
              'component.type': {
                seed: false
              }
            }
          }
        }
      },
      knownValues: { enums: {} },
      componentDBs: {
        sensor: {
          entries: {
            pmw3389: sensorEntry
          },
          __index: new Map([
            ['pmw3389', sensorEntry],
            ['pixartpmw3389', sensorEntry]
          ]),
          __indexAll: new Map([
            ['pmw3389', [sensorEntry]]
          ])
        }
      }
    };

    await seedSpecDb({
      db,
      config,
      category,
      fieldRules,
      logger: null
    });

    const links = db.db.prepare(
      'SELECT id FROM item_component_links WHERE category = ? AND product_id = ? AND field_key = ?'
    ).all(category, 'product_1', 'sensor');
    assert.equal(links.length, 0);
  } finally {
    db.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

