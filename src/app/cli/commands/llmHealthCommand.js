export function createLlmHealthCommand({
  runLlmHealthCheck,
}) {
  return async function commandLlmHealth(config, storage, args) {
    const provider = String(args.provider || '').trim().toLowerCase();
    const model = String(args.model || '').trim();
    const result = await runLlmHealthCheck({
      storage,
      config,
      provider,
      model,
      appDb: config.appDb || null,
    });
    return {
      command: 'llm-health',
      ...result,
    };
  };
}
