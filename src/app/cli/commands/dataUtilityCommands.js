import { assertCategorySchemaReady } from '../cliHelpers.js';

export function createDataUtilityCommands({
  asBool,
  EventLogger,
  generateTypesForCategory,
  openSpecDbForCategory,
}) {
  async function commandSeedDb(config, _storage, args) {
    const category = String(args.category || '').trim();
    if (!category) throw new Error('seed-db requires --category');

    const { syncSpecDbForCategory } = await import('../../../app/api/services/specDbSyncService.js');

    const db = await openSpecDbForCategory(config, category);
    try {
      const result = await syncSpecDbForCategory({
        category,
        config,
        getSpecDbReady: async () => db,
      });
      return { command: 'seed-db', category, ...result };
    } finally {
      try { db?.close(); } catch { /* best-effort */ }
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

    const { scanAndSeedCheckpoints } = await import('../../../pipeline/checkpoint/scanAndSeedCheckpoints.js');
    const { defaultIndexLabRoot } = await import('../../../core/config/runtimeArtifactRoots.js');

    const indexLabRoot = String(args.out || defaultIndexLabRoot()).trim();
    const db = await openSpecDbForCategory(config, category);

    try {
      const result = await scanAndSeedCheckpoints({ specDb: db, indexLabRoot });
      return { command: 'seed-checkpoint', category, ...result };
    } finally {
      try { db?.close(); } catch { /* best-effort */ }
    }
  }

  return {
    commandSeedDb,
    commandSeedCheckpoint,
    commandGenerateTypes,
  };
}
