import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { executeCli } from '../spec.js';
import { createCliJsonHarness } from './helpers/cliJsonHarness.js';

async function ensureFile(filePath, content = '') {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, String(content), 'utf8');
}

async function captureCliUsage(argv = []) {
  const stdout = [];
  const stderr = [];
  const result = await executeCli(argv, {
    stdout: {
      write(chunk) {
        stdout.push(String(chunk));
      },
    },
    stderr: {
      write(chunk) {
        stderr.push(String(chunk));
      },
    },
  });
  return {
    result,
    stdout: stdout.join(''),
    stderr: stderr.join(''),
  };
}

test('CLI usage does not advertise retired phase10 alias', async () => {
  const { result, stdout } = await captureCliUsage([]);

  assert.equal(result.exitCode, 1);
  assert.equal(stdout.includes('phase10-bootstrap'), false);
});

test('retired phase10 bootstrap alias is rejected at the CLI dispatcher boundary', async () => {
  const sink = {
    write() {
      return true;
    },
  };

  await assert.rejects(
    executeCli(['phase10-bootstrap'], { stdout: sink, stderr: sink }),
    /Unknown command: phase10-bootstrap/,
  );
});
