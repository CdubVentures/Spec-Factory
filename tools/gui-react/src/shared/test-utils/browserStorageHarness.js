export function createStorage(initial = {}, { trackCalls = true } = {}) {
  const values = new Map(Object.entries(initial));
  const calls = [];

  function record(entry) {
    if (trackCalls) {
      calls.push(entry);
    }
  }

  return {
    calls,
    getItem(key) {
      record({ op: 'getItem', key });
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      const normalized = String(value);
      record({ op: 'setItem', key, value: normalized });
      values.set(key, normalized);
    },
    removeItem(key) {
      record({ op: 'removeItem', key });
      values.delete(key);
    },
    peek(key) {
      return values.has(key) ? values.get(key) : null;
    },
  };
}

export function withWindowStub(windowStub, run) {
  const previousWindow = globalThis.window;
  const restore = () => {
    if (typeof previousWindow === 'undefined') {
      delete globalThis.window;
      return;
    }
    globalThis.window = previousWindow;
  };

  globalThis.window = windowStub;

  try {
    const result = run();
    if (result && typeof result === 'object' && typeof result.then === 'function') {
      return result.finally(restore);
    }

    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

export function nextTick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
