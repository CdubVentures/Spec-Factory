export function createFieldRulesCommands({
  asBool,
  compileCategoryFieldStudio,
  compileRules,
  compileRulesAll,
  readCompileReport,
  rulesDiff,
  watchCompileRules,
  validateRules,
  initCategory,
  listFields,
  fieldReport,
  verifyGeneratedFieldRules,
}) {
  async function commandCategoryCompile(config, _storage, args) {
    const category = String(args.category || '').trim();
    if (!category) {
      throw new Error('category-compile requires --category <category>');
    }
    const fieldStudioSourcePath = String(args['field-studio-source'] || '').trim();
    const mapPath = String(args.map || '').trim();
    const result = await compileCategoryFieldStudio({
      category,
      fieldStudioSourcePath,
      config,
      mapPath: mapPath || null
    });
    return {
      command: 'category-compile',
      ...result
    };
  }

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

  async function commandCompileReport(config, _storage, args) {
    const category = String(args.category || '').trim();
    if (!category) {
      throw new Error('compile-report requires --category <category>');
    }
    const result = await readCompileReport({
      category,
      config
    });
    return {
      command: 'compile-report',
      ...result
    };
  }

  async function commandRulesDiff(config, _storage, args) {
    const category = String(args.category || '').trim();
    if (!category) {
      throw new Error('rules-diff requires --category <category>');
    }
    const result = await rulesDiff({
      category,
      config
    });
    return {
      command: 'rules-diff',
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

  async function commandInitCategory(config, _storage, args) {
    const category = String(args.category || '').trim();
    if (!category) {
      throw new Error('init-category requires --category <category>');
    }
    const template = String(args.template || 'electronics').trim() || 'electronics';
    const result = await initCategory({
      category,
      template,
      config
    });
    return {
      command: 'init-category',
      ...result
    };
  }

  async function commandListFields(config, _storage, args) {
    const category = String(args.category || '').trim();
    if (!category) {
      throw new Error('list-fields requires --category <category>');
    }
    const result = await listFields({
      category,
      config,
      group: String(args.group || ''),
      requiredLevel: String(args['required-level'] || '')
    });
    return {
      command: 'list-fields',
      ...result
    };
  }

  async function commandFieldReport(config, _storage, args) {
    const category = String(args.category || '').trim();
    if (!category) {
      throw new Error('field-report requires --category <category>');
    }
    const format = String(args.format || 'md').trim().toLowerCase();
    const result = await fieldReport({
      category,
      config,
      format
    });
    return {
      command: 'field-report',
      ...result
    };
  }

  async function commandFieldRulesVerify(config, _storage, args) {
    const category = String(args.category || '').trim();
    if (!category) {
      throw new Error('field-rules-verify requires --category <category>');
    }
    const fixturePath = String(args.fixture || '').trim();
    const strictBytes = asBool(args['strict-bytes'], false);
    const result = await verifyGeneratedFieldRules({
      category,
      config,
      fixturePath,
      strictBytes
    });
    return {
      command: 'field-rules-verify',
      ...result
    };
  }

  return {
    commandCategoryCompile,
    commandCompileRules,
    commandCompileReport,
    commandRulesDiff,
    commandValidateRules,
    commandInitCategory,
    commandListFields,
    commandFieldReport,
    commandFieldRulesVerify,
  };
}
