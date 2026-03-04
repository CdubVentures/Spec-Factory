export function createCliCommandDispatcher({ handlers }) {
  return async function dispatchCliCommand({ command, config, storage, args }) {
    const handler = handlers[command];
    if (!handler) {
      throw new Error(`Unknown command: ${command}`);
    }
    return handler({ config, storage, args });
  };
}
