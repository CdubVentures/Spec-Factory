export function runCommandCapture(command, args = [], {
  cwd, env, timeoutMs,
  spawn, processRef, path, setTimeoutFn, clearTimeoutFn,
} = {}) {
  const resolvedTimeoutMs = Math.max(1_000, Number.parseInt(String(timeoutMs || 20_000), 10) || 20_000);
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let proc = null;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    try {
      proc = spawn(command, args, {
        cwd: cwd || path.resolve('.'),
        env: env || processRef.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      finish({
        ok: false,
        code: null,
        stdout,
        stderr,
        error: error?.message || String(error || ''),
      });
      return;
    }

    const timer = setTimeoutFn(() => {
      try { proc.kill('SIGTERM'); } catch { /* ignore */ }
      finish({
        ok: false,
        code: null,
        stdout,
        stderr: `${stderr}\ncommand_timeout`.trim(),
        error: 'command_timeout',
      });
    }, resolvedTimeoutMs);

    proc.stdout.on('data', (chunk) => {
      stdout += String(chunk || '');
    });
    proc.stderr.on('data', (chunk) => {
      stderr += String(chunk || '');
    });
    proc.on('error', (error) => {
      clearTimeoutFn(timer);
      finish({
        ok: false,
        code: null,
        stdout,
        stderr,
        error: error?.message || String(error || ''),
      });
    });
    proc.on('exit', (code) => {
      clearTimeoutFn(timer);
      finish({
        ok: code === 0,
        code: Number.isFinite(code) ? code : null,
        stdout,
        stderr,
      });
    });
  });
}
