import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const GLOBAL_STATUSLINE_MJS = 'C:/Users/Chris/.claude/statusline.mjs';
const GLOBAL_STATUSLINE_SCRIPT = 'C:/Users/Chris/.claude/statusline.sh';
const LOCAL_STATUSLINE_SCRIPT = 'C:/Users/Chris/Desktop/Spec Factory/.claude/statusline.sh';
const LOCAL_SETTINGS_PATH = 'C:/Users/Chris/Desktop/Spec Factory/.claude/settings.json';
const GLOBAL_STATUSLINE_COMMAND = 'node C:/Users/Chris/.claude/statusline.mjs';

function runStatusline({ scriptPath, input, env = {} }) {
  // The .sh wrapper just calls `node statusline.mjs`. Run node directly to
  // avoid WSL path issues on Windows. For local scripts that delegate to
  // global, fall back to the global .mjs.
  let mjsPath = scriptPath.replace(/\.sh$/, '.mjs');
  if (!existsSync(mjsPath)) {
    mjsPath = GLOBAL_STATUSLINE_MJS;
  }
  const output = execFileSync('node', [mjsPath], {
    encoding: 'utf8',
    env: {
      ...process.env,
      NO_COLOR: '1',
      ...env
    },
    input: `${JSON.stringify(input)}\n`
  }).trim();

  return output.replace(/\u001b\[[0-9;]*m/g, '');
}

async function createFixture({ settingsEffort = 'high', transcriptLines = [] } = {}) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-factory-statusline-'));
  const projectDir = path.join(rootDir, 'workspace');
  const claudeDir = path.join(projectDir, '.claude');
  const transcriptPath = path.join(rootDir, 'session.jsonl');

  await fs.mkdir(claudeDir, { recursive: true });

  if (settingsEffort !== null) {
    await fs.writeFile(
      path.join(claudeDir, 'settings.json'),
      `${JSON.stringify({ effortLevel: settingsEffort }, null, 2)}\n`,
      'utf8'
    );
  }

  await fs.writeFile(
    transcriptPath,
    transcriptLines.length > 0 ? `${transcriptLines.join('\n')}\n` : '',
    'utf8'
  );

  return { projectDir, rootDir, transcriptPath };
}

async function removeFixture(rootDir) {
  await fs.rm(rootDir, { recursive: true, force: true });
}

function buildInput({ projectDir, transcriptPath, contextWindow = {}, displayName = 'Opus 4.6' }) {
  return {
    session_id: 'test-session',
    transcript_path: transcriptPath,
    cwd: projectDir,
    model: {
      id: 'claude-opus-4-6',
      display_name: displayName
    },
    workspace: {
      current_dir: projectDir,
      project_dir: projectDir,
      added_dirs: []
    },
    version: '2.1.76',
    context_window: {
      total_input_tokens: 0,
      total_output_tokens: 0,
      context_window_size: 1000000,
      current_usage: null,
      used_percentage: null,
      remaining_percentage: null,
      ...contextWindow
    }
  };
}

function transcriptStdoutLine(content) {
  return JSON.stringify({
    type: 'user',
    message: {
      role: 'user',
      content: `<local-command-stdout>${content}</local-command-stdout>`
    }
  });
}

test('global statusline prefers context remaining_percentage over token math', async () => {
  const fixture = await createFixture();

  try {
    const input = buildInput({
      projectDir: fixture.projectDir,
      transcriptPath: fixture.transcriptPath,
      contextWindow: {
        context_window_size: 1000000,
        total_input_tokens: 950000,
        total_output_tokens: 0,
        used_percentage: 38,
        remaining_percentage: 62
      }
    });

    const output = runStatusline({
      scriptPath: GLOBAL_STATUSLINE_SCRIPT,
      input
    });

    assert.equal(output, 'Opus 4.6 | 62% [####----] | High');
  } finally {
    await removeFixture(fixture.rootDir);
  }
});

test('global statusline derives remaining percentage from used_percentage when needed', async () => {
  const fixture = await createFixture();

  try {
    const input = buildInput({
      projectDir: fixture.projectDir,
      transcriptPath: fixture.transcriptPath,
      contextWindow: {
        used_percentage: 17,
        remaining_percentage: null
      }
    });

    const output = runStatusline({
      scriptPath: GLOBAL_STATUSLINE_SCRIPT,
      input
    });

    assert.equal(output, 'Opus 4.6 | 83% [######--] | High');
  } finally {
    await removeFixture(fixture.rootDir);
  }
});

test('global statusline derives accurate context from current_usage when percentages are unavailable', async () => {
  const fixture = await createFixture();

  try {
    const input = buildInput({
      projectDir: fixture.projectDir,
      transcriptPath: fixture.transcriptPath,
      contextWindow: {
        context_window_size: 200000,
        used_percentage: null,
        remaining_percentage: null,
        current_usage: {
          input_tokens: 25000,
          output_tokens: 50000,
          cache_creation_input_tokens: 25000,
          cache_read_input_tokens: 0
        }
      }
    });

    const output = runStatusline({
      scriptPath: GLOBAL_STATUSLINE_SCRIPT,
      input
    });

    assert.equal(output, 'Opus 4.6 | 75% [######--] | High');
  } finally {
    await removeFixture(fixture.rootDir);
  }
});

test('global statusline shows unknown context before Claude exposes live context usage', async () => {
  const fixture = await createFixture();

  try {
    const input = buildInput({
      projectDir: fixture.projectDir,
      transcriptPath: fixture.transcriptPath,
      contextWindow: {
        context_window_size: 200000,
        total_input_tokens: 150343,
        total_output_tokens: 1239259,
        used_percentage: null,
        remaining_percentage: null,
        current_usage: null
      }
    });

    const output = runStatusline({
      scriptPath: GLOBAL_STATUSLINE_SCRIPT,
      input
    });

    assert.equal(output, 'Opus 4.6 | -- [--------] | High');
  } finally {
    await removeFixture(fixture.rootDir);
  }
});

test('global statusline prefers the latest transcript effort and model label over stale settings', async () => {
  const fixture = await createFixture({
    settingsEffort: 'high',
    transcriptLines: [
      transcriptStdoutLine('Current effort level: high (Comprehensive implementation with extensive testing and documentation)'),
      transcriptStdoutLine('Set model to Opus 4.6 (1M context) (default) with max effort'),
      transcriptStdoutLine('Set model to Opus 4.6 (1M context) (default) with low effort')
    ]
  });

  try {
    const input = buildInput({
      projectDir: fixture.projectDir,
      transcriptPath: fixture.transcriptPath,
      contextWindow: {
        remaining_percentage: 100
      }
    });

    const output = runStatusline({
      scriptPath: GLOBAL_STATUSLINE_SCRIPT,
      input
    });

    assert.equal(output, 'Opus 4.6 (1M context) | 100% [########] | Low');
  } finally {
    await removeFixture(fixture.rootDir);
  }
});

test('global statusline handles escaped ANSI model transcripts and surfaces max effort', async () => {
  const fixture = await createFixture({
    settingsEffort: 'high',
    transcriptLines: [
      transcriptStdoutLine('Set model to \\u001b[1mOpus 4.6 (1M context) (default)\\u001b[22m with \\u001b[1mmax\\u001b[22m effort')
    ]
  });

  try {
    const input = buildInput({
      projectDir: fixture.projectDir,
      transcriptPath: fixture.transcriptPath,
      contextWindow: {
        remaining_percentage: 100
      }
    });

    const output = runStatusline({
      scriptPath: GLOBAL_STATUSLINE_SCRIPT,
      input
    });

    assert.equal(output, 'Opus 4.6 (1M context) | 100% [########] | Max');
  } finally {
    await removeFixture(fixture.rootDir);
  }
});

test('spec factory local statusline entrypoint matches the global behavior contract', async () => {
  const fixture = await createFixture({
    settingsEffort: 'high',
    transcriptLines: [
      transcriptStdoutLine('Current effort level: high (Comprehensive implementation with extensive testing and documentation)'),
      transcriptStdoutLine('Set model to \\u001b[1mOpus 4.6 (1M context) (default)\\u001b[22m with \\u001b[1mmax\\u001b[22m effort')
    ]
  });

  try {
    const input = buildInput({
      projectDir: fixture.projectDir,
      transcriptPath: fixture.transcriptPath,
      contextWindow: {
        remaining_percentage: 100
      }
    });

    const output = runStatusline({
      scriptPath: LOCAL_STATUSLINE_SCRIPT,
      input
    });

    assert.equal(output, 'Opus 4.6 (1M context) | 100% [########] | Max');
  } finally {
    await removeFixture(fixture.rootDir);
  }
});

test('global statusline reuses cached transcript state so repeated updates stay fast', async () => {
  const fillerLine = JSON.stringify({
    type: 'assistant',
    message: {
      role: 'assistant',
      content: 'later transcript content that should not change the latest effort state'
    }
  });

  const transcriptLines = [
    transcriptStdoutLine('Set model to Opus 4.6 (1M context) (default) with max effort'),
    ...Array.from({ length: 40000 }, () => fillerLine)
  ];

  const fixture = await createFixture({
    settingsEffort: 'high',
    transcriptLines
  });
  const cachePath = path.join(fixture.rootDir, 'statusline-cache.json');
  const input = buildInput({
    projectDir: fixture.projectDir,
    transcriptPath: fixture.transcriptPath,
    contextWindow: {
      remaining_percentage: 100
    }
  });

  try {
    runStatusline({
      scriptPath: GLOBAL_STATUSLINE_SCRIPT,
      input,
      env: {
        CLAUDE_STATUSLINE_CACHE_PATH: cachePath
      }
    });

    const startTime = process.hrtime.bigint();
    const output = runStatusline({
      scriptPath: GLOBAL_STATUSLINE_SCRIPT,
      input,
      env: {
        CLAUDE_STATUSLINE_CACHE_PATH: cachePath
      }
    });
    const durationMs = Number(process.hrtime.bigint() - startTime) / 1e6;

    assert.equal(output, 'Opus 4.6 (1M context) | 100% [########] | Max');
    assert.ok(durationMs < 750, `expected cached statusline run to stay under 750ms, got ${durationMs.toFixed(2)}ms`);
  } finally {
    await removeFixture(fixture.rootDir);
  }
});

test('global statusline reuses cached transcript state when the transcript file is temporarily unavailable', async () => {
  const fixture = await createFixture({
    settingsEffort: 'high',
    transcriptLines: [
      transcriptStdoutLine('Set model to Opus 4.6 (1M context) (default) with max effort')
    ]
  });
  const cachePath = path.join(fixture.rootDir, 'statusline-cache.json');
  const input = buildInput({
    projectDir: fixture.projectDir,
    transcriptPath: fixture.transcriptPath,
    contextWindow: {
      remaining_percentage: 100
    }
  });

  try {
    const warmOutput = runStatusline({
      scriptPath: GLOBAL_STATUSLINE_SCRIPT,
      input,
      env: {
        CLAUDE_STATUSLINE_CACHE_PATH: cachePath
      }
    });

    assert.equal(warmOutput, 'Opus 4.6 (1M context) | 100% [########] | Max');

    await fs.rm(fixture.transcriptPath, { force: true });

    const cachedOutput = runStatusline({
      scriptPath: GLOBAL_STATUSLINE_SCRIPT,
      input,
      env: {
        CLAUDE_STATUSLINE_CACHE_PATH: cachePath
      }
    });

    assert.equal(cachedOutput, 'Opus 4.6 (1M context) | 100% [########] | Max');
  } finally {
    await removeFixture(fixture.rootDir);
  }
});

test('spec factory claude settings point at the global statusline entrypoint', async () => {
  const settings = JSON.parse(await fs.readFile(LOCAL_SETTINGS_PATH, 'utf8'));
  assert.equal(settings.statusLine?.command, GLOBAL_STATUSLINE_COMMAND);
});
