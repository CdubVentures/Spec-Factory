import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import {
  seedFieldRules,
  seedComponentDb,
  seedKnownValues,
  seedWorkbookMap,
  writeJson,
  findFreePort,
  waitForServerReady,
  stopProcess,
} from './fixtures/reviewLaneFixtures.js';

const CATEGORY = 'mouse_runtime_ops_search_worker_inline_results';
const RUN_ID = 'run-runtime-ops-search-worker-inline-results';

async function ensureGuiBuilt() {
  const distIndex = path.join(path.resolve('.'), 'tools', 'gui-react', 'dist', 'index.html');
  await fs.access(distIndex);
}

async function waitForCondition(predicate, timeoutMs = 20_000, intervalMs = 150, label = 'condition') {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await predicate();
    if (ok) return;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`timeout_waiting_for_condition:${label}`);
}

async function selectCategory(page, category) {
  const categorySelect = page.locator('aside select').first();
  await waitForCondition(
    async () => (await categorySelect.locator(`option[value="${category}"]`).count()) > 0,
    20_000,
    150,
    'category_option_visible',
  );
  await categorySelect.selectOption(category);
  await waitForCondition(
    async () => (await categorySelect.inputValue()) === category,
    20_000,
    150,
    'category_selected',
  );
}

async function seedCategory(helperRoot, category) {
  await seedFieldRules(helperRoot, category);
  await seedComponentDb(helperRoot, category);
  await seedKnownValues(helperRoot, category);
  await seedWorkbookMap(helperRoot, category);
}

function makeEvent(ts, event, payload) {
  return { ts, event, payload };
}

async function seedRuntimeOpsRun(indexLabRoot, category) {
  const runDir = path.join(indexLabRoot, RUN_ID);
  await fs.mkdir(runDir, { recursive: true });

  await writeJson(path.join(runDir, 'run.json'), {
    run_id: RUN_ID,
    category,
    product_id: `${category}-test-product`,
    started_at: '2026-02-25T00:00:00.000Z',
    ended_at: '2026-02-25T00:05:00.000Z',
    status: 'completed',
    round: 1,
  });

  const events = [
    makeEvent('2026-02-25T00:00:00.500Z', 'search_started', {
      worker_id: 'search-b',
      scope: 'query',
      slot: 'b',
      tasks_started: 1,
      query: 'acme orbit x1 battery life',
      provider: 'google',
    }),
    makeEvent('2026-02-25T00:00:00.800Z', 'search_finished', {
      worker_id: 'search-b',
      scope: 'query',
      slot: 'b',
      tasks_started: 1,
      query: 'acme orbit x1 battery life',
      provider: 'google',
      result_count: 0,
      duration_ms: 320,
    }),
    makeEvent('2026-02-25T00:00:01.000Z', 'search_started', {
      worker_id: 'search-a',
      scope: 'query',
      slot: 'a',
      tasks_started: 1,
      current_query: 'acme orbit x1 weight',
      current_provider: 'google',
      query: 'acme orbit x1 weight',
      provider: 'google',
    }),
    makeEvent('2026-02-25T00:00:02.000Z', 'search_finished', {
      worker_id: 'search-a',
      scope: 'query',
      slot: 'a',
      tasks_started: 1,
      current_query: 'acme orbit x1 weight',
      current_provider: 'google',
      query: 'acme orbit x1 weight',
      provider: 'google',
      result_count: 3,
      duration_ms: 420,
    }),
    makeEvent('2026-02-25T00:00:02.200Z', 'search_results_collected', {
      scope: 'query',
      query: 'acme orbit x1 weight',
      provider: 'google',
      dedupe_count: 0,
      results: [
        {
          title: 'Acme Orbit X1 specs',
          url: 'https://www.acme.test/products/orbit-x1',
          domain: 'acme.test',
          rank: 1,
          provider: 'google',
        },
        {
          title: 'Acme Orbit X1 support detail',
          url: 'https://www.acme.test/products/orbit-x1/support',
          domain: 'acme.test',
          rank: 2,
          provider: 'google',
        },
        {
          title: 'Acme Orbit X1 forum thread',
          url: 'https://community.example/acme-orbit-x1',
          domain: 'reddit.com',
          rank: 3,
          provider: 'google',
        }
      ],
    }),
    makeEvent('2026-02-25T00:00:02.300Z', 'serp_triage_completed', {
      query: 'acme orbit x1 weight',
      kept_count: 1,
      dropped_count: 1,
      triage_min_score: 3,
      triage_max_urls: 20,
      candidates: [
        {
          url: 'https://www.acme.test/products/orbit-x1',
          title: 'Acme Orbit X1 specs',
          domain: 'acme.test',
          score: 8.2,
          decision: 'keep',
          rationale: 'official spec page',
          score_components: {
            base_relevance: 4.8,
            tier_boost: 1.5,
            identity_match: 2.1,
            penalties: -0.2,
          },
        },
        {
          url: 'https://www.acme.test/products/orbit-x1/support',
          title: 'Acme Orbit X1 support detail',
          domain: 'acme.test',
          score: 5.3,
          decision: 'maybe',
          rationale: 'same-host support detail',
          score_components: {
            base_relevance: 2.9,
            tier_boost: 1.5,
            identity_match: 1.3,
            penalties: -0.4,
          },
        },
        {
          url: 'https://community.example/acme-orbit-x1',
          title: 'Acme Orbit X1 forum thread',
          domain: 'reddit.com',
          score: 0.4,
          decision: 'drop',
          rationale: 'community chatter',
          score_components: {
            base_relevance: 0.8,
            tier_boost: 0,
            identity_match: 0.3,
            penalties: -0.7,
          },
        },
      ],
    }),
    makeEvent('2026-02-25T00:00:03.000Z', 'search_started', {
      worker_id: 'search-b',
      scope: 'query',
      slot: 'b',
      tasks_started: 2,
      query: 'acme orbit x1 connection',
      provider: 'searxng',
    }),
    makeEvent('2026-02-25T00:00:03.500Z', 'search_finished', {
      worker_id: 'search-b',
      scope: 'query',
      slot: 'b',
      tasks_started: 2,
      query: 'acme orbit x1 connection',
      provider: 'searxng',
      result_count: 1,
      duration_ms: 515,
    }),
    makeEvent('2026-02-25T00:00:03.700Z', 'search_results_collected', {
      scope: 'query',
      query: 'acme orbit x1 connection',
      provider: 'searxng',
      results: [
        {
          title: 'Acme Orbit X1 support',
          url: 'https://support.acme.test/orbit-x1',
          domain: 'support.acme.test',
          rank: 1,
        },
      ],
    }),
    makeEvent('2026-02-25T00:00:04.500Z', 'fetch_started', {
      worker_id: 'fetch-9',
      scope: 'url',
      url: 'https://downloads.example.com/manual.pdf',
      fetch_mode: 'http',
    }),
    makeEvent('2026-02-25T00:00:04.800Z', 'fetch_started', {
      worker_id: 'fetch-2',
      scope: 'url',
      url: 'https://support.acme.test/orbit-x1',
      fetch_mode: 'http',
    }),
    makeEvent('2026-02-25T00:00:05.000Z', 'fetch_started', {
      worker_id: 'fetch-1',
      scope: 'url',
      url: 'https://www.acme.test/products/orbit-x1',
      fetch_mode: 'http',
    }),
    makeEvent('2026-02-25T00:00:06.000Z', 'fetch_finished', {
      worker_id: 'fetch-1',
      scope: 'url',
      url: 'https://www.acme.test/products/orbit-x1',
      status_code: 200,
      bytes: 4096,
      content_type: 'text/html',
    }),
  ];

  await fs.writeFile(
    path.join(runDir, 'run_events.ndjson'),
    `${events.map((row) => JSON.stringify(row)).join('\n')}\n`,
    'utf8',
  );
}

function runtimeOpsRunSelect(page) {
  return page.locator('xpath=//label[normalize-space()="Run:"]/following-sibling::select[1]').first();
}

async function laneLabels(page, laneClass) {
  return page.locator(`div.${laneClass} button`).evaluateAll((nodes) =>
    nodes
      .map((node) => node.querySelector('span.font-mono')?.textContent?.trim() || '')
      .filter(Boolean)
  );
}

test('runtime ops workers tab shows stable labels and inline fetch attribution', { timeout: 180_000 }, async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-ops-search-worker-inline-'));
  const categoryAuthorityRoot = path.join(tempRoot, 'category_authority');
  const localOutputRoot = path.join(tempRoot, 'out');
  const indexLabRoot = path.join(tempRoot, 'indexlab');
  const repoRoot = path.resolve('.');
  const guiDistRoot = path.join(repoRoot, 'tools', 'gui-react', 'dist');

  let child = null;
  let browser = null;
  let context = null;
  let page = null;

  try {
    await ensureGuiBuilt();
    await seedCategory(categoryAuthorityRoot, 'mouse');
    await seedCategory(categoryAuthorityRoot, CATEGORY);
    await seedRuntimeOpsRun(indexLabRoot, CATEGORY);

    const port = await findFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const guiServerPath = path.resolve('src/api/guiServer.js');
    child = spawn('node', [guiServerPath, '--port', String(port), '--local', '--indexlab-root', indexLabRoot], {
      cwd: tempRoot,
      env: {
        ...process.env,
        HELPER_FILES_ROOT: categoryAuthorityRoot,
        LOCAL_OUTPUT_ROOT: localOutputRoot,
        LOCAL_INPUT_ROOT: path.join(tempRoot, 'fixtures'),
        OUTPUT_MODE: 'local',
        LOCAL_MODE: 'true',
        __GUI_DIST_ROOT: guiDistRoot,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    await waitForServerReady(baseUrl, child);

    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    page = await context.newPage();

    await page.goto(`${baseUrl}/#/runtime-ops`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Spec Factory', { timeout: 25_000 });
    await selectCategory(page, CATEGORY);

    const runtimeSelect = runtimeOpsRunSelect(page);
    await runtimeSelect.waitFor({ state: 'visible', timeout: 20_000 });
    await waitForCondition(
      async () => (await runtimeSelect.locator(`option[value="${RUN_ID}"]`).count()) > 0,
      20_000,
      150,
      'runtime_run_visible',
    );
    await runtimeSelect.selectOption(RUN_ID);

    await page.getByRole('button', { name: 'Workers' }).click();
    await page.getByRole('button', { name: /slot a/i }).waitFor({ state: 'visible', timeout: 20_000 });
    await page.getByRole('button', { name: /fetch-a1/i }).waitFor({ state: 'visible', timeout: 20_000 });
    await page.getByRole('button', { name: /fetch-b2/i }).waitFor({ state: 'visible', timeout: 20_000 });

    assert.deepEqual(await laneLabels(page, 'sf-pool-lane-search'), ['slot a', 'slot b']);
    assert.deepEqual(await laneLabels(page, 'sf-pool-lane-fetch'), ['fetch-a1', 'fetch-b2', 'fetch-9']);

    await page.getByRole('button', { name: /slot a/i }).click();

    await page.getByText('search-a').first().waitFor({ state: 'visible', timeout: 20_000 });
    await page.getByText('Current query').waitFor({ state: 'visible', timeout: 20_000 });
    await page.getByText('Query results').first().waitFor({ state: 'visible', timeout: 20_000 });
    await page.getByText('Acme Orbit X1 specs').waitFor({ state: 'visible', timeout: 20_000 });
    await page.getByText('Exact fetch-1').first().waitFor({ state: 'visible', timeout: 20_000 });
    await page.getByText('Host fallback fetch-1').first().waitFor({ state: 'visible', timeout: 20_000 });
    assert.equal(await page.getByText('Pending fetch').count(), 0);

    await page.getByRole('button', { name: 'URLs' }).click();
    await page.getByText('Search Results').first().waitFor({ state: 'visible', timeout: 20_000 });
    await page.getByText('Exact fetch-1').first().waitFor({ state: 'visible', timeout: 20_000 });
    await page.getByText('Host fallback fetch-1').first().waitFor({ state: 'visible', timeout: 20_000 });
  } finally {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await stopProcess(child);
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  }
});
