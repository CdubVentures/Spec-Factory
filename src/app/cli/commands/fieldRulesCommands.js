export function createFieldRulesCommands({
  asBool,
  compileRules,
  compileRulesAll,
  watchCompileRules,
  validateRules,
}) {
  async function commandCompileRules(config, _storage, args) {
    const all = asBool(args.all, false);
    const watch = asBool(args.watch, false);
    const fieldStudioSourcePath = String(args['field-studio-source'] || '').trim();
    const mapPath = String(args.map || '').trim();
    const dryRun = asBool(args['dry-run'], false);
    if (all) {
      if (watch) {
        throw new Error('compile-rules --all does not support --watch');
      }
      const result = await compileRulesAll({
        dryRun,
        config
      });
      return {
        command: 'compile-rules',
        mode: 'all',
        ...result
      };
    }

    const category = String(args.category || '').trim();
    if (!category) {
      throw new Error('compile-rules requires --category <category> or --all');
    }
    if (watch) {
      const watchSeconds = Math.max(0, Number.parseInt(String(args['watch-seconds'] || '0'), 10) || 0);
      const maxEvents = Math.max(0, Number.parseInt(String(args['max-events'] || '0'), 10) || 0);
      const debounceMs = Math.max(50, Number.parseInt(String(args['debounce-ms'] || '500'), 10) || 500);
      const watchResult = await watchCompileRules({
        category,
        config,
        fieldStudioSourcePath,
        mapPath: mapPath || null,
        watchSeconds,
        maxEvents,
        debounceMs
      });
      return {
        command: 'compile-rules',
        mode: 'watch',
        ...watchResult
      };
    }
    const result = await compileRules({
      category,
      fieldStudioSourcePath,
      dryRun,
      config,
      mapPath: mapPath || null
    });
    return {
      command: 'compile-rules',
      ...result
    };
  }

  async function commandValidateRules(config, _storage, args) {
    const category = String(args.category || '').trim();
    if (!category) {
      throw new Error('validate-rules requires --category <category>');
    }
    const result = await validateRules({
      category,
      config
    });
    return {
      command: 'validate-rules',
      ...result
    };
  }

  return {
    commandCompileRules,
    commandValidateRules,
  };
}
