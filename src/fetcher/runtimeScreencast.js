import { configInt, configBool } from '../shared/settingsAccessor.js';

function screencastIntervalMs(config = {}) {
  const requestedFps = configInt(config, 'runtimeScreencastFps');
  const screenshotFps = Math.min(requestedFps, 2);
  return Math.max(250, Math.round(1000 / screenshotFps));
}

function screencastQuality(config = {}) {
  return configInt(config, 'runtimeScreencastQuality');
}

function viewportSnapshot(page) {
  try {
    const viewport = typeof page?.viewportSize === 'function' ? page.viewportSize() : null;
    return {
      width: Number(viewport?.width || 0),
      height: Number(viewport?.height || 0),
    };
  } catch {
    return { width: 0, height: 0 };
  }
}

function emitRuntimeFrame({ onFrame, workerId, data, width, height }) {
  if (typeof onFrame !== 'function' || !data) {
    return;
  }
  try {
    onFrame({
      worker_id: workerId,
      data,
      width,
      height,
      ts: new Date().toISOString(),
    });
  } catch {
    // ignore stream callback failures
  }
}

function createInterruptibleWaitController() {
  let interruptWait = null;

  return {
    async wait(ms) {
      if (ms <= 0) {
        return;
      }
      await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          interruptWait = null;
          resolve();
        };
        const timeout = setTimeout(finish, ms);
        interruptWait = () => {
          clearTimeout(timeout);
          finish();
        };
      });
    },
    interrupt() {
      if (typeof interruptWait === 'function') {
        interruptWait();
      }
    },
  };
}

export async function attachRuntimeScreencast({
  page,
  config = {},
  workerId = '',
  onFrame,
} = {}) {
  if (!page || typeof onFrame !== 'function' || !configBool(config, 'runtimeScreencastEnabled')) {
    return async () => {};
  }

  const intervalMs = screencastIntervalMs(config);
  const fallbackDelayMs = Math.min(intervalMs, 500);
  let stopped = false;
  let cdpSession = null;
  let cdpFrameCount = 0;
  const waitController = createInterruptibleWaitController();

  const captureScreenshotFrame = async ({ allowWhenStopped = false } = {}) => {
    if ((stopped && !allowWhenStopped) || typeof page?.screenshot !== 'function') {
      return false;
    }
    try {
      const bytes = await page.screenshot({
        type: 'jpeg',
        quality: screencastQuality(config)
      });
      if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
        return false;
      }
      const viewport = viewportSnapshot(page);
      emitRuntimeFrame({
        onFrame,
        workerId,
        data: bytes.toString('base64'),
        width: viewport.width,
        height: viewport.height,
      });
      return true;
    } catch {
      return false;
    }
  };

  try {
    cdpSession = await page.context().newCDPSession(page);
    await cdpSession.send('Page.startScreencast', {
      format: 'jpeg',
      quality: configInt(config, 'runtimeScreencastQuality'),
      maxWidth: configInt(config, 'runtimeScreencastMaxWidth'),
      maxHeight: configInt(config, 'runtimeScreencastMaxHeight'),
      everyNthFrame: Math.max(1, Math.ceil(60 / configInt(config, 'runtimeScreencastFps'))),
    });
    cdpSession.on('Page.screencastFrame', (params) => {
      try {
        cdpFrameCount += 1;
        waitController.interrupt();
        cdpSession.send('Page.screencastFrameAck', { sessionId: params.sessionId }).catch(() => {});
        emitRuntimeFrame({
          onFrame,
          workerId,
          data: params.data || '',
          width: Number(params.metadata?.deviceWidth || 0),
          height: Number(params.metadata?.deviceHeight || 0),
        });
      } catch {
        // ignore frame callback failures
      }
    });
  } catch {
    cdpSession = null;
  }

  const fallbackLoop = (async () => {
    await waitController.wait(fallbackDelayMs);
    if (stopped || cdpFrameCount > 0) {
      return;
    }
    await captureScreenshotFrame();
    while (!stopped && cdpFrameCount === 0) {
      await waitController.wait(intervalMs);
      if (stopped || cdpFrameCount > 0) {
        return;
      }
      await captureScreenshotFrame();
    }
  })();

  return async () => {
    const needsFinalCapture = cdpFrameCount === 0;
    stopped = true;
    waitController.interrupt();
    await fallbackLoop.catch(() => {});
    if (needsFinalCapture) {
      await captureScreenshotFrame({ allowWhenStopped: true });
    }
    if (!cdpSession) {
      return;
    }
    try {
      await cdpSession.send('Page.stopScreencast');
    } catch {
      // ignore
    }
    try {
      await cdpSession.detach();
    } catch {
      // ignore
    }
  };
}
