import { executeCli } from '../../spec.js';

async function runCliJsonOnce(args, { env = {}, expectExitCode = 0 } = {}) {
  const stdoutChunks = [];
  const stderrChunks = [];
  const stdout = {
    write(chunk) {
      stdoutChunks.push(String(chunk));
      return true;
    }
  };
  const stderr = {
    write(chunk) {
      stderrChunks.push(String(chunk));
      return true;
    }
  };

  const result = await executeCli(args, { env, stdout, stderr });
  if (result.exitCode !== expectExitCode) {
    const error = new Error(
      `cli_exit_code:${result.exitCode}\n${stderrChunks.join('') || stdoutChunks.join('')}`.trim()
    );
    error.exitCode = result.exitCode;
    error.stdout = stdoutChunks.join('');
    error.stderr = stderrChunks.join('');
    throw error;
  }
  return result.output;
}

export function createCliJsonHarness() {
  let runQueue = Promise.resolve();

  return function runCliJson(args, options = {}) {
    const scheduled = runQueue.then(() => runCliJsonOnce(args, options));
    runQueue = scheduled.then(
      () => undefined,
      () => undefined,
    );
    return scheduled;
  };
}

export const runCliJson = createCliJsonHarness();
