import { assertCategorySchemaReady } from '../cliHelpers.js';
import fsNode from 'node:fs/promises';
import pathNode from 'node:path';

export function createDataUtilityCommands({
  asBool,
  ingestCsvFile,
  EventLogger,
  runWatchImports,
  runDaemon,
  runS3Integration,
  generateTypesForCategory,
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
    const result = await ingestCsvFile({
      storage,
      config,
      category,
      csvPath,
      importsRoot: args['imports-root'] || config.importsRoot
    });
    return {
      command: 'ingest-csv',
      ...result
    };
  }

  async function commandWatchImports(config, storage, args) {
    const importsRoot = args['imports-root'] || config.importsRoot;
    const category = args.category || null;
    const all = asBool(args.all, !category);
    const once = asBool(args.once, false);
    const logger = new EventLogger({
      storage,
      runtimeEventsKey: config.runtimeEventsKey || '_runtime/events.jsonl',
      context: {
        category
      }
    });
    const result = await runWatchImports({
      storage,
      config,
      importsRoot,
      category,
      all,
      once,
      logger
    });
    await logger.flush();
    return {
      command: 'watch-imports',
      ...result,
      events: logger.events.slice(-100)
    };
  }

  async function commandDaemon(config, storage, args) {
    const importsRoot = args['imports-root'] || config.importsRoot;
    const category = args.category || null;
    const all = asBool(args.all, !category);
    const once = asBool(args.once, false);
    const logger = new EventLogger({
      storage,
      runtimeEventsKey: config.runtimeEventsKey || '_runtime/events.jsonl',
      context: {
        category: category || 'all'
      }
    });

    const result = await runDaemon({
      storage,
      config,
      importsRoot,
      category,
      all,
      once,
      logger
    });
    await logger.flush();
    return {
      command: 'daemon',
      ...result,
      events: logger.events.slice(-200)
    };
  }

  async function commandSeedDb(config, _storage, args) {
    const category = String(args.category || '').trim();
    if (!category) throw new Error('seed-db requires --category');

    const { SpecDb } = await import('../../../db/specDb.js');
    const { syncSpecDbForCategory } = await import('../../../api/services/specDbSyncService.js');

    const dbDir = pathNode.join(config.specDbDir || '.specfactory_tmp', category);
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

  async function commandTestS3() {
    const output = await runS3Integration(process.argv.slice(3));
    return {
      command: 'test-s3',
      ...output
    };
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

  return {
    commandIngestCsv,
    commandWatchImports,
    commandDaemon,
    commandSeedDb,
    commandTestS3,
    commandGenerateTypes,
  };
}
