import { nowIso } from './shared/primitives.js';

function parseBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const token = String(value).trim().toLowerCase();
  return token === '1' || token === 'true' || token === 'yes' || token === 'on';
}

export class EventLogger {
  constructor(options = {}) {
    this.events = [];
    this.echoStdout = options.echoStdout ?? parseBool(process.env.LOG_STDOUT, false);
    this.baseContext = {
      ...(options.context || {})
    };
    this._onEventQueue = Promise.resolve();
    this.onEvent = typeof options.onEvent === 'function' ? options.onEvent : null;
  }

  setContext(context = {}) {
    this.baseContext = {
      ...this.baseContext,
      ...context
    };
  }

  push(level, event, data = {}) {
    const row = {
      ts: nowIso(),
      level,
      event,
      ...this.baseContext,
      ...data
    };
    this.events.push(row);
    if (this.onEvent) {
      try {
        const result = this.onEvent(row);
        if (result && typeof result.then === 'function') {
          this._onEventQueue = this._onEventQueue
            .then(() => result)
            .catch(() => {});
        }
      } catch {
        // ignore observer hook failures
      }
    }
    if (this.echoStdout) {
      process.stderr.write(`${JSON.stringify(row)}\n`);
    }

  }

  info(event, data = {}) {
    this.push('info', event, data);
  }

  warn(event, data = {}) {
    this.push('warn', event, data);
  }

  error(event, data = {}) {
    this.push('error', event, data);
  }

  async flush() {
    await this._onEventQueue;
  }
}
