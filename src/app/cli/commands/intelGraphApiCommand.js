export function createIntelGraphApiCommand({
  startIntelGraphApi,
}) {
  return async function commandIntelGraphApi(config, storage, args) {
    const category = args.category || 'mouse';
    const host = String(args.host || '0.0.0.0');
    const port = Math.max(1, Number.parseInt(String(args.port || '8787'), 10) || 8787);

    const started = await startIntelGraphApi({
      storage,
      config,
      category,
      host,
      port,
    });

    return {
      command: 'intel-graph-api',
      category,
      host: started.host,
      port: started.port,
      graphql_url: started.graphqlUrl,
      health_url: started.healthUrl,
    };
  };
}
