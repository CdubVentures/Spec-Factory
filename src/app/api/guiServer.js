import fsSync from 'node:fs';
import path from 'node:path';
import { exec as execCb } from 'node:child_process';
import { createGuiServerRuntime } from './guiServerRuntime.js';

const distRoot = process.env.__GUI_DIST_ROOT
  ? process.env.__GUI_DIST_ROOT
  : 'tools/gui-react/dist';

const {
  server,
  setupWatchers,
  metadata: {
    projectRoot,
    PORT,
    HELPER_ROOT,
    OUTPUT_ROOT,
    INDEXLAB_ROOT,
    LAUNCH_CWD,
    DIST_ROOT,
  },
} = createGuiServerRuntime({
  distRoot,
});

server.listen(PORT, '0.0.0.0', () => {
  const msg = `[gui-server] running on http://localhost:${PORT}`;
  console.log(msg);
  console.log(`[gui-server] API:     http://localhost:${PORT}/api/v1/health`);
  console.log(`[gui-server] WS:      ws://localhost:${PORT}/ws`);
  console.log(`[gui-server] Project: ${projectRoot}`);
  console.log(`[gui-server] CWD:     ${LAUNCH_CWD}`);
  console.log(`[gui-server] Helper:  ${HELPER_ROOT}`);
  console.log(`[gui-server] Output:  ${OUTPUT_ROOT}`);
  console.log(`[gui-server] IndexLab:${INDEXLAB_ROOT}`);
  console.log(`[gui-server] Canonical settings writes: ON`);
  console.log(`[gui-server] Static:  ${DIST_ROOT}`);
  try {
    const distFiles = fsSync.readdirSync(path.join(DIST_ROOT, 'assets'));
    console.log(`[gui-server] Assets:  ${distFiles.join(', ')}`);
  } catch {
    console.log('[gui-server] Assets:  (could not list)');
  }
  setupWatchers();

  if (process.argv.includes('--open')) {
    const url = `http://localhost:${PORT}?_=${Date.now()}`;
    console.log(`[gui-server] Opening browser -> ${url}`);
    const cmd = process.platform === 'win32' ? `start "" "${url}"`
      : process.platform === 'darwin' ? `open "${url}"`
      : `xdg-open "${url}"`;
    execCb(cmd);
  }
});
