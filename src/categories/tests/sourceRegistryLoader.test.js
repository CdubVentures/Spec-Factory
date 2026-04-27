import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadCategoryConfig } from '../loader.js';
import { withTempCategoryRoots, writeJson } from './helpers/categoryLoaderHarness.js';
import { SpecDb } from '../../db/specDb.js';

test('loadCategoryConfig maps rich source registry metadata to source hosts', async () => {
  const category = 'mouse';

  await withTempCategoryRoots('phase4-source-registry-', async ({ helperRoot }) => {
    await writeJson(path.join(helperRoot, category, '_generated', 'field_rules.json'), {
      category: 'mouse',
      fields: {
        weight: {
          required_level: 'required',
          availability: 'expected',
          difficulty: 'easy',
        },
      },
    });

    await writeJson(path.join(helperRoot, category, 'sources.json'), {
      category: 'mouse',
      version: '1.0.0',
      approved: {
        manufacturer: [],
        lab: [],
        database: [],
        retailer: [],
      },
      sources: {
        razer_com: {
          display_name: 'Razer',
          tier: 'tier1_manufacturer',
          base_url: 'https://www.razer.com',
          crawl_config: {
            method: 'playwright',
            rate_limit_ms: 2200,
            robots_txt_compliant: true,
          },
          field_coverage: {
            high: ['weight', 'dpi'],
          },
        },
        rtings_com: {
          display_name: 'RTINGS',
          tier: 'tier2_lab',
          base_url: 'https://www.rtings.com',
          crawl_config: {
            method: 'playwright',
            rate_limit_ms: 3000,
            robots_txt_compliant: true,
          },
        },
      },
    });

    const config = await loadCategoryConfig(category, {
      config: {
        categoryAuthorityRoot: helperRoot,
      },
    });

    const hostMap = config.sourceHostMap || new Map();
    assert.deepEqual([...hostMap.keys()].sort(), ['razer.com', 'rtings.com']);
    assert.deepEqual(hostMap.get('razer.com'), {
      host: 'razer.com',
      tierName: 'manufacturer',
      sourceId: 'razer_com',
      displayName: 'Razer',
      crawlConfig: {
        method: 'playwright',
        rate_limit_ms: 2200,
        robots_txt_compliant: true,
      },
      fieldCoverage: {
        high: ['weight', 'dpi'],
      },
      health: null,
      robotsTxtCompliant: true,
      requires_js: true,
      baseUrl: 'https://www.razer.com',
    });
    assert.equal(hostMap.get('rtings.com').tierName, 'lab');
    assert.equal(hostMap.get('rtings.com').requires_js, true);
    assert.deepEqual(
      config.sourceHosts.map((row) => row.host).sort(),
      ['razer.com', 'rtings.com'],
    );
  });
});

test('loadCategoryConfig uses SQL source strategy and spec seeds when specDb is supplied', async () => {
  const category = 'mouse';

  await withTempCategoryRoots('phase4-source-registry-sql-', async ({ helperRoot }) => {
    const specDb = new SpecDb({ dbPath: ':memory:', category });
    try {
      await writeJson(path.join(helperRoot, category, '_generated', 'field_rules.json'), {
        category,
        fields: {
          weight: {
            required_level: 'required',
            availability: 'expected',
            difficulty: 'easy',
          },
        },
      });
      await writeJson(path.join(helperRoot, category, 'sources.json'), {
        category,
        version: '1.0.0',
        approved: { lab: [], database: [], retailer: [] },
        denylist: [],
        sources: {
          json_lab: {
            display_name: 'JSON Lab',
            tier: 'tier2_lab',
            base_url: 'https://json-lab.example',
          },
        },
      });
      await writeJson(path.join(helperRoot, category, 'spec_seeds.json'), ['{product} json specs']);
      specDb.replaceSourceStrategyDocument({
        category,
        version: '1.0.0',
        approved: { lab: [], database: [], retailer: [] },
        denylist: [],
        sources: {
          sql_lab: {
            display_name: 'SQL Lab',
            tier: 'tier2_lab',
            base_url: 'https://sql-lab.example',
          },
        },
      });
      specDb.replaceSpecSeedTemplates(['{product} sql specs']);

      const config = await loadCategoryConfig(category, {
        config: { categoryAuthorityRoot: helperRoot },
        specDb,
      });

      const hostMap = config.sourceHostMap || new Map();
      assert.deepEqual([...hostMap.keys()], ['sql-lab.example']);
      assert.equal(hostMap.get('sql-lab.example').displayName, 'SQL Lab');
      assert.deepEqual(config.specSeeds, ['{product} sql specs']);
    } finally {
      specDb.close();
    }
  });
});

test('loadCategoryConfig keeps only explicit source hosts when removed manufacturer overrides are absent', async () => {
  const category = 'mouse';

  await withTempCategoryRoots('phase4-manufacturer-overrides-', async ({ helperRoot }) => {
    await writeJson(path.join(helperRoot, category, '_generated', 'field_rules.json'), {
      category: 'mouse',
      fields: {
        sensor: {
          required_level: 'required',
          availability: 'expected',
          difficulty: 'easy',
        },
      },
    });

    await writeJson(path.join(helperRoot, category, 'sources.json'), {
      category: 'mouse',
      version: '1.0.0',
      approved: {
        manufacturer: [],
        lab: ['rtings.com'],
        database: [],
        retailer: [],
      },
      sources: {
        rtings_com: {
          display_name: 'RTINGS',
          tier: 'tier2_lab',
          base_url: 'https://www.rtings.com',
          crawl_config: {
            method: 'playwright',
            rate_limit_ms: 3000,
            robots_txt_compliant: true,
          },
        },
      },
    });

    const config = await loadCategoryConfig(category, {
      config: {
        categoryAuthorityRoot: helperRoot,
      },
    });

    const hostMap = config.sourceHostMap || new Map();
    assert.deepEqual([...hostMap.keys()], ['rtings.com']);
    assert.deepEqual(hostMap.get('rtings.com'), {
      host: 'rtings.com',
      tierName: 'lab',
      sourceId: 'rtings_com',
      displayName: 'RTINGS',
      crawlConfig: {
        method: 'playwright',
        rate_limit_ms: 3000,
        robots_txt_compliant: true,
      },
      fieldCoverage: null,
      health: null,
      robotsTxtCompliant: true,
      requires_js: true,
      baseUrl: 'https://www.rtings.com',
    });
    assert.equal(hostMap.has('razer.com'), false, 'manufacturer overrides no longer materialized');
  });
});

test('loadCategoryConfig resolves hosts from url templates and preserves stronger approved tiers', async () => {
  const category = 'monitor';

  await withTempCategoryRoots('phase4-source-registry-templates-', async ({ helperRoot }) => {
    await writeJson(path.join(helperRoot, category, '_generated', 'field_rules.json'), {
      category,
      fields: {
        brightness: {
          required_level: 'required',
          availability: 'expected',
          difficulty: 'easy',
        },
      },
    });

    await writeJson(path.join(helperRoot, category, 'sources.json'), {
      category,
      version: '1.0.0',
      approved: {
        manufacturer: ['manuals.example.com'],
        lab: [],
        database: [],
        retailer: [],
      },
      sources: {
        manuals_example: {
          display_name: 'Manuals',
          tier: 'tier3_retailer',
          url_templates: ['https://manuals.example.com/products/{sku}'],
        },
        docs_example: {
          display_name: 'Docs',
          tier: 'tier4_community',
          base_url: 'not a url',
          url_templates: ['  ', 'https://docs.example.com/specs/{slug}'],
        },
      },
    });

    const config = await loadCategoryConfig(category, {
      config: {
        categoryAuthorityRoot: helperRoot,
      },
    });

    const hostMap = config.sourceHostMap || new Map();
    assert.deepEqual([...hostMap.keys()].sort(), ['docs.example.com', 'manuals.example.com']);
    assert.equal(hostMap.get('manuals.example.com').tierName, 'manufacturer');
    assert.equal(hostMap.get('manuals.example.com').sourceId, 'manuals_example');
    assert.equal(hostMap.get('docs.example.com').tierName, 'database');
    assert.equal(hostMap.get('docs.example.com').baseUrl, 'not a url');
    assert.equal(hostMap.get('docs.example.com').requires_js, false);
  });
});
