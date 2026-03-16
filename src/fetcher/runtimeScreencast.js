import { wait } from '../utils/common.js';

function screencastIntervalMs(config = {}) {
  const requestedFps = Math.max(1, Number(config.runtimeScreencastFps || 2));
  const screenshotFps = Math.min(requestedFps, 2);
  return Math.max(250, Math.round(1000 / screenshotFps));
}

function screencastQuality(config = {}) {
  return Math.max(20, Math.min(90, Number(config.runtimeScreencastQuality || 50)));
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

export async function attachRuntimeScreencast({
  page,
  config = {},
  workerId = '',
  onFrame,
} = {}) {
  if (!page || typeof onFrame !== 'function' || config.runtimeScreencastEnabled === false) {
    return async () => {};
  }

  const intervalMs = screencastIntervalMs(config);
  const fallbackDelayMs = Math.min(intervalMs, 500);
  let stopped = false;
  let cdpSession = null;
  let cdpFrameCount = 0;

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
      quality: Math.max(10, Math.min(100, Number(config.runtimeScreencastQuality || 50))),
      maxWidth: Math.max(320, Number(config.runtimeScreencastMaxWidth || 1280)),
      maxHeight: Math.max(240, Number(config.runtimeScreencastMaxHeight || 720)),
      everyNthFrame: Math.max(1, Math.ceil(60 / Math.max(1, Number(config.runtimeScreencastFps || 10)))),
    });
    cdpSession.on('Page.screencastFrame', (params) => {
      try {
        cdpFrameCount += 1;
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
    await wait(fallbackDelayMs);
    if (stopped || cdpFrameCount > 0) {
      return;
    }
    await captureScreenshotFrame();
    while (!stopped && cdpFrameCount === 0) {
      await wait(intervalMs);
      if (stopped || cdpFrameCount > 0) {
        return;
      }
      await captureScreenshotFrame();
    }
  })();

  return async () => {
    const needsFinalCapture = cdpFrameCount === 0;
    stopped = true;
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
