// WHY: Node-side stdio client for the Python crawl4ai sidecar. One
// long-running subprocess per IndexLab run. Requests keyed by id, auto-
// restart up to N times on death, stop() drains outstanding requests.
//
// Designed so unit tests inject a fake `spawn` function that returns a
// stubbed ChildProcess-like object — no real Python required.

import { spawn as nodeSpawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_CONCURRENT = 4;
const DEFAULT_MAX_RESTARTS = 3;

// WHY: Locate the sidecar dir relative to this file, not the parent's CWD.
// The package lives at <repo>/pipeline-extraction-sidecar/pipeline_extraction_sidecar/.
// Python's `-m pipeline_extraction_sidecar` needs the CWD set to the PARENT
// of the package (so the package directory is importable as a module). This
// is a 4-hop climb from this file: plugins/crawl4ai/ → plugins/ → extraction/
// → features/ → src/ → repo-root/pipeline-extraction-sidecar/
const _thisDir = dirname(fileURLToPath(import.meta.url));
const SIDECAR_CWD = resolve(_thisDir, '..', '..', '..', '..', '..', 'pipeline-extraction-sidecar');

/**
 * @param {{
 *   pythonBin?: string,
 *   timeoutMs?: number,
 *   maxConcurrent?: number,
 *   maxRestarts?: number,
 *   spawn?: typeof nodeSpawn,
 *   logger?: { info?: Function, warn?: Function, error?: Function },
 *   onSidecarEvent?: (event: string, payload: object) => void,
 * }} opts
 */
export function createCrawl4aiClient(opts = {}) {
  const pythonBin = String(opts.pythonBin || 'python');
  const timeoutMs = Math.max(1000, Number(opts.timeoutMs || DEFAULT_TIMEOUT_MS));
  const maxConcurrent = Math.max(1, Number(opts.maxConcurrent || DEFAULT_MAX_CONCURRENT));
  const maxRestarts = Math.max(0, Number(opts.maxRestarts ?? DEFAULT_MAX_RESTARTS));
  const spawn = typeof opts.spawn === 'function' ? opts.spawn : nodeSpawn;
  const logger = opts.logger;
  const emit = typeof opts.onSidecarEvent === 'function' ? opts.onSidecarEvent : () => {};

  let proc = null;
  let stopped = false;
  let restartCount = 0;
  let nextId = 1;
  let inFlight = 0;
  const pending = new Map(); // id → { resolve, reject, timer }
  const queue = []; // Array<{ req, resolve, reject }>
  let stdoutBuf = '';

  function sanitizeRequest(req) {
    // WHY: Security — never pass env vars or unknown keys into the sidecar.
    // Protocol envelope is strict: id, url, html, features.
    return {
      id: String(req.id || ''),
      url: String(req.url || ''),
      html: String(req.html || ''),
      features: Array.isArray(req.features) ? req.features.filter((f) => typeof f === 'string') : [],
    };
  }

  function handleLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg;
    try { msg = JSON.parse(trimmed); }
    catch { return; }
    if (!msg || typeof msg !== 'object') return;
    const id = String(msg.id || '');
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    inFlight = Math.max(0, inFlight - 1);
    if (entry.timer) clearTimeout(entry.timer);
    entry.resolve(msg);
    drainQueue();
  }

  function drainQueue() {
    while (queue.length > 0 && inFlight < maxConcurrent && proc && !proc.killed) {
      const { req, resolve, reject } = queue.shift();
      dispatch(req, resolve, reject);
    }
  }

  function dispatch(req, resolve, reject) {
    if (!proc || proc.killed || !proc.stdin || proc.stdin.destroyed || !proc.stdin.writable) {
      reject(new Error('crawl4ai_sidecar_not_running'));
      return;
    }
    const timer = setTimeout(() => {
      pending.delete(req.id);
      inFlight = Math.max(0, inFlight - 1);
      reject(new Error('crawl4ai_sidecar_timeout'));
      drainQueue();
    }, timeoutMs);
    pending.set(req.id, { resolve, reject, timer });
    inFlight += 1;
    try {
      // WHY: callback form of write() captures async pipe errors that
      // the sync path misses. Without this, a broken pipe (subprocess
      // crashed between requests) produces an unhandled 'error' on the
      // stdin Socket, crashing the parent.
      proc.stdin.write(`${JSON.stringify(req)}\n`, (err) => {
        if (err) {
          const entry = pending.get(req.id);
          if (entry) {
            pending.delete(req.id);
            inFlight = Math.max(0, inFlight - 1);
            clearTimeout(entry.timer);
            entry.reject(err instanceof Error ? err : new Error(String(err)));
          }
        }
      });
    } catch (err) {
      pending.delete(req.id);
      inFlight = Math.max(0, inFlight - 1);
      clearTimeout(timer);
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  }

  function handleExit(code, signal) {
    const deaths = pending.size;
    // Reject any in-flight requests — sidecar died mid-flight.
    for (const [, entry] of pending) {
      if (entry.timer) clearTimeout(entry.timer);
      entry.reject(new Error('crawl4ai_sidecar_died'));
    }
    pending.clear();
    inFlight = 0;
    proc = null;

    if (stopped) return;

    if (restartCount < maxRestarts) {
      restartCount += 1;
      emit('crawl4ai_sidecar_restarted', {
        attempt: restartCount,
        max: maxRestarts,
        exit_code: code ?? null,
        signal: signal ?? null,
        lost_requests: deaths,
      });
      logger?.warn?.('crawl4ai_sidecar_restarted', { attempt: restartCount, max: maxRestarts });
      try { spawnProc(); drainQueue(); }
      catch (err) {
        emit('crawl4ai_sidecar_error', { reason: err?.message || String(err) });
      }
    } else {
      emit('crawl4ai_sidecar_error', {
        reason: 'max_restarts_exceeded',
        attempts: restartCount,
        exit_code: code ?? null,
      });
      logger?.error?.('crawl4ai_sidecar_error', { reason: 'max_restarts_exceeded' });
      // Remaining queued requests can't be served.
      while (queue.length > 0) {
        const { reject } = queue.shift();
        reject(new Error('crawl4ai_sidecar_exhausted'));
      }
    }
  }

  function spawnProc() {
    stdoutBuf = '';
    proc = spawn(pythonBin, ['-m', 'pipeline_extraction_sidecar'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: SIDECAR_CWD,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' },
    });
    emit('crawl4ai_sidecar_started', { pid: proc.pid ?? null, python_bin: pythonBin });
    logger?.info?.('crawl4ai_sidecar_started', { pid: proc.pid ?? null });

    // WHY: CRITICAL — attach 'error' listeners to every stdio stream. Node
    // emits an unhandled-error on the stdin/stdout/stderr Socket when the
    // subprocess pipe dies (ECONNRESET / EOF), and if we don't handle it
    // the parent IndexLab process crashes with "Unhandled 'error' event"
    // (seen as exit code 1 at Crawl stage). Swallow the event — the
    // 'exit' handler already drives restart / exhaust logic.
    const handleStreamError = (streamName) => (err) => {
      logger?.warn?.(`crawl4ai_sidecar_${streamName}_error`, {
        reason: err?.message || String(err),
        code: err?.code || '',
      });
    };
    proc.stdin?.on?.('error', handleStreamError('stdin'));
    proc.stdout?.on?.('error', handleStreamError('stdout'));
    proc.stderr?.on?.('error', handleStreamError('stderr'));

    proc.stdout.on('data', (chunk) => {
      stdoutBuf += String(chunk);
      let idx;
      while ((idx = stdoutBuf.indexOf('\n')) !== -1) {
        const line = stdoutBuf.slice(0, idx);
        stdoutBuf = stdoutBuf.slice(idx + 1);
        handleLine(line);
      }
    });
    proc.stderr?.on?.('data', (chunk) => {
      const text = String(chunk).trim();
      if (text) logger?.warn?.('crawl4ai_sidecar_stderr', { text: text.slice(0, 500) });
    });
    proc.on('exit', (code, signal) => handleExit(code, signal));
    proc.on('error', (err) => {
      emit('crawl4ai_sidecar_error', { reason: err?.message || String(err) });
      logger?.error?.('crawl4ai_sidecar_error', { reason: err?.message || String(err) });
    });
  }

  function start() {
    if (proc || stopped) return;
    spawnProc();
  }

  function stop() {
    stopped = true;
    // Reject remaining queued requests.
    while (queue.length > 0) {
      const { reject } = queue.shift();
      reject(new Error('crawl4ai_sidecar_stopped'));
    }
    for (const [, entry] of pending) {
      if (entry.timer) clearTimeout(entry.timer);
      entry.reject(new Error('crawl4ai_sidecar_stopped'));
    }
    pending.clear();
    inFlight = 0;
    if (proc && !proc.killed) {
      try { proc.stdin.end(); } catch { /* ignore */ }
      try { proc.kill('SIGTERM'); } catch { /* ignore */ }
    }
    proc = null;
  }

  async function extract({ url, html, features }) {
    if (stopped) throw new Error('crawl4ai_sidecar_stopped');
    if (!proc) start();
    const req = sanitizeRequest({ id: `req-${nextId++}`, url, html, features });
    return new Promise((resolve, reject) => {
      if (inFlight >= maxConcurrent) {
        queue.push({ req, resolve, reject });
        return;
      }
      dispatch(req, resolve, reject);
    });
  }

  return { start, stop, extract };
}
