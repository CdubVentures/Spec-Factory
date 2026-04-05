import { createGuiServerRuntime } from '../../guiServerRuntime.js';
import { getFreePort } from './guiServerHttpHarness.js';

export async function startInProcessGuiServer(t, {
  env = {},
  argv = [],
  host = '127.0.0.1',
  distRoot = null,
  port = null,
  cwd = null,
} = {}) {
  const resolvedPort = port ?? await getFreePort();
  const runtime = createGuiServerRuntime({
    env,
    argv: ['--port', String(resolvedPort), ...argv],
    distRoot,
    cwd,
  });

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      runtime.server.off('error', onError);
      reject(error);
    };
    runtime.server.on('error', onError);
    runtime.server.listen(resolvedPort, host, () => {
      runtime.server.off('error', onError);
      resolve();
    });
  });

  async function close() {
    if (!runtime.server.listening) return;
    runtime.server.unref();
    await new Promise((resolve, reject) => {
      runtime.server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    // WHY: Windows UV_HANDLE_CLOSING assertion race — let libuv drain before test runner exits.
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  t?.after?.(() => close().catch(() => {}));

  return {
    ...runtime,
    port: resolvedPort,
    baseUrl: `http://${host}:${resolvedPort}`,
    close,
  };
}
