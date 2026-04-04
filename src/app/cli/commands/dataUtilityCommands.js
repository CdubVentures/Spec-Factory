import { assertCategorySchemaReady } from '../cliHelpers.js';
import fsNode from 'node:fs/promises';
import pathNode from 'node:path';
import { configValue } from '../../../shared/settingsAccessor.js';

export function createDataUtilityCommands({
  asBool,
  ingestCsvFile,
  EventLogger,
  generateTypesForCategory,
  openSpecDbForCategory = null,
}) {
  async function commandIngestCsv(config, storage, args) {
    const category = String(args.category || '').trim();
    const csvPath = String(args.path || '').trim();
    if (!category) {
      throw new Error('ingest-csv requires --category <category>');
    }
    if (!csvPath) {
      throw new Error('ingest-csv requires --path <csv>');
    }
    await assertCategorySchemaReady({ category, storage, config });
    const specDb = typeof openSpecDbForCategory === 'function'
      ? await openSpecDbForCategory(config, category)
      : null;
    const result = await ingestCsvFile({
      storage,
      config,
      category,
      csvPath,
      importsRoot: args['imports-root'] || config.importsRoot,
      specDb,
    });
    return {
      command: 'ingest-csv',
      ...result
    };
  }


  async function commandSeedDb(config, _storage, args) {
    const category = String(args.category || '').trim();
    if (!category) throw new Error('seed-db requires --category');

    const { SpecDb } = await import('../../../db/specDb.js');
    const { syncSpecDbForCategory } = await import('../../../api/services/specDbSyncService.js');

    const dbDir = pathNode.join(config.specDbDir || '.workspace/db', category);
    await fsNode.mkdir(dbDir, { recursive: true });
    const dbPath = pathNode.join(dbDir, 'spec.sqlite');
    const db = new SpecDb({ dbPath, category });

    try {
      const result = await syncSpecDbForCategory({
        category,
        config,
        getSpecDbReady: async () => db,
      });
      return { command: 'seed-db', category, db_path: dbPath, ...result };
    } finally {
      db.close();
    }
  }

  async function commandGenerateTypes(config, _storage, args) {
    const category = String(args.category || '').trim();
    if (!category) {
      throw new Error('generate-types requires --category <category>');
    }
    const outDir = String(args['out-dir'] || '').trim();
    const result = await generateTypesForCategory({
      category,
      config,
      outDir
    });
    return {
      command: 'generate-types',
      ...result
    };
  }

  async function commandSeedCheckpoint(config, _storage, args) {
    const category = String(args.category || '').trim();
    if (!category) throw new Error('seed-checkpoint requires --category');

    const { SpecDb } = await import('../../../db/specDb.js');
    const { scanAndSeedCheckpoints } = await import('../../../pipeline/checkpoint/scanAndSeedCheckpoints.js');
    const { defaultIndexLabRoot } = await import('../../../core/config/runtimeArtifactRoots.js');

    const indexLabRoot = String(args.out || defaultIndexLabRoot()).trim();
    const dbDir = pathNode.join(config.specDbDir || '.workspace/db', category);
    await fsNode.mkdir(dbDir, { recursive: true });
    const dbPath = pathNode.join(dbDir, 'spec.sqlite');
    const db = new SpecDb({ dbPath, category });

    try {
      const result = await scanAndSeedCheckpoints({ specDb: db, indexLabRoot });
      return { command: 'seed-checkpoint', category, db_path: dbPath, ...result };
    } finally {
      db.close();
    }
  }

  return {
    commandIngestCsv,
    commandSeedDb,
    commandSeedCheckpoint,
    commandGenerateTypes,
  };
}
