#!/usr/bin/env node
// Usage:
//   node scripts/testGoogleCrawlee.js                    (fetch-only, 30 queries)
//   node scripts/testGoogleCrawlee.js --screenshots      (browser + screenshots)
//   node scripts/testGoogleCrawlee.js --count 5          (5 queries)
//
// Saves screenshots to .workspace/crawlee_test/{fetch,browser}/
// Serves gallery on http://localhost:9000.

import { createServer } from 'node:http';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { searchGoogle, resetGoogleSearchPacingForTests } from '../src/features/indexing/search/searchGoogle.js';

const args = process.argv.slice(2);
const countFlag = args.find(a => a.startsWith('--count='));
const countIdx = args.indexOf('--count');
const count = Number(
  countFlag ? countFlag.slice(8) : countIdx >= 0 ? args[countIdx + 1] : 30,
) || 30;

const screenshots = args.includes('--screenshots');
// WHY: "no-screenshot" = browser without screenshots (lower bandwidth).
// "screenshot" = browser with screenshots. --both runs both for comparison.
const modes = screenshots ? ['screenshot'] : args.includes('--both') ? ['no-screenshot', 'screenshot'] : ['no-screenshot'];

const PORT = 9000;
const OUT_ROOT = join(process.cwd(), '.workspace', 'crawlee_test');

const QUERIES = [
  'Razer Viper V3 Pro specifications',
  'Logitech G Pro X Superlight 2 specs',
  'Endgame Gear XM2we 8k specifications',
  'Pulsar X2H Mini gaming mouse weight sensor',
  'Lamzu Atlantis Mini 4K specifications',
  'Finalmouse UltralightX specifications weight',
  'Zowie EC2-CW wireless specs',
  'SteelSeries Aerox 5 Wireless specifications',
  'WLMouse Beast X 8K specifications polling rate',
  'Corsair M75 Air wireless mouse specs',
  'HyperX Pulsefire Haste 2 specifications',
  'Ninjutso Sora V2 gaming mouse specs',
  'Glorious Model O 2 specifications weight',
  'Roccat Kone XP Air specifications',
  'Cooler Master MM712 wireless mouse specs',
  'BenQ Zowie FK1-C specifications',
  'Razer DeathAdder V3 HyperSpeed specifications',
  'G-Wolves HTS Plus 4K specs',
  'Vaxee XE-S wired mouse specifications',
  'Lethal Gaming Gear LA-1 specs weight',
  'Ducky Feather specifications',
  'ASUS ROG Harpe Ace Aim Lab Edition specs',
  'Xtrfy M42 Wireless specifications',
  'Fantech Aria XD7 specifications',
  'Razer Viper Mini Signature Edition specs',
  'SteelSeries Prime Mini Wireless specifications',
  'Logitech G502 X Plus specifications weight',
  'Endgame Gear OP1 8k specifications',
  'Pulsar Xlite V3 specifications weight sensor',
  'Lamzu Thorn 4K gaming mouse specs',
];

const proxyUrls = ['http://zruyrjpq-rotate:dfm4udpzx5p0@p.webshare.io:80'];

async function runQuery(query, idx, mode, outDir) {
  const withScreenshots = mode === 'screenshot';
  const pad = String(idx + 1).padStart(2, '0');
  const slug = query.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 60).toLowerCase();
  const t0 = Date.now();

  const result = await searchGoogle({
    query,
    limit: 10,
    timeoutMs: 30_000,
    proxyUrls,
    minQueryIntervalMs: 1_000,
    maxRetries: 3,
    screenshotsEnabled: withScreenshots,
    logger: {
      info: () => {},
      warn: (evt, data) => console.log(`    [warn] ${evt} ${JSON.stringify(data)}`),
    },
  });

  const durationMs = Date.now() - t0;
  const results = result?.results || [];
  const proxyKB = result?.proxyKB || 0;
  const screenshotFile = `${pad}-${slug}.jpg`;
  const screenshotKB = result?.screenshot?.buffer ? Math.round(result.screenshot.buffer.length / 1024) : 0;

  if (result?.screenshot?.buffer) {
    await writeFile(join(outDir, screenshotFile), result.screenshot.buffer);
  }

  const status = results.length >= 10 ? 'PASS' : results.length > 0 ? 'WARN' : 'FAIL';
  console.log(`  [${status}] #${pad} ${mode} | ${results.length}/10 | ${durationMs}ms | proxy:${proxyKB}KB | ss:${screenshotKB}KB | ${query}`);

  return {
    idx: idx + 1, query, mode, resultCount: results.length,
    durationMs, status, proxyKB, screenshotKB,
    screenshotFile: result?.screenshot?.buffer ? screenshotFile : null,
    results,
  };
}

const allRuns = [];

for (const mode of modes) {
  const outDir = join(OUT_ROOT, mode);
  await mkdir(outDir, { recursive: true });

  console.log(`\n=== ${mode.toUpperCase()} MODE (${count} queries) ===\n`);
  resetGoogleSearchPacingForTests();

  for (let i = 0; i < Math.min(count, QUERIES.length); i++) {
    try {
      const run = await runQuery(QUERIES[i], i, mode, outDir);
      allRuns.push(run);
    } catch (err) {
      console.log(`  [ERR]  #${String(i + 1).padStart(2, '0')} ${mode} | ${err.message}`);
      allRuns.push({
        idx: i + 1, query: QUERIES[i], mode,
        resultCount: 0, durationMs: 0, status: 'ERR', proxyKB: 0, screenshotKB: 0,
        screenshotFile: null, results: [],
      });
    }
  }
}

console.log('\n=== SUMMARY ===\n');
for (const mode of modes) {
  const runs = allRuns.filter(r => r.mode === mode);
  const pass = runs.filter(r => r.status === 'PASS').length;
  const warn = runs.filter(r => r.status === 'WARN').length;
  const fail = runs.filter(r => r.status === 'FAIL' || r.status === 'ERR').length;
  const avgMs = Math.round(runs.reduce((s, r) => s + r.durationMs, 0) / (runs.length || 1));
  const avgResults = (runs.reduce((s, r) => s + r.resultCount, 0) / (runs.length || 1)).toFixed(1);
  const totalProxyKB = runs.reduce((s, r) => s + r.proxyKB, 0).toFixed(1);
  const totalScreenshotKB = runs.reduce((s, r) => s + r.screenshotKB, 0);
  console.log(`${mode.toUpperCase()}: ${pass} pass, ${warn} warn, ${fail} fail | avg ${avgMs}ms | avg ${avgResults} res/q | proxy: ${totalProxyKB}KB total | ss: ${totalScreenshotKB}KB`);
}

console.log(`\nScreenshots: ${OUT_ROOT}`);

const report = allRuns.map(({ results, ...rest }) => rest);
await writeFile(join(OUT_ROOT, 'report.json'), JSON.stringify(report, null, 2));

// Gallery server
const server = createServer(async (req, res) => {
  const imgMatch = req.url?.match(/^\/(no-screenshot|screenshot)\/(.+\.jpg)$/);
  if (imgMatch) {
    try {
      const buf = await readFile(join(OUT_ROOT, imgMatch[1], imgMatch[2]));
      res.writeHead(200, { 'Content-Type': 'image/jpeg' });
      res.end(buf);
    } catch { res.writeHead(404); res.end('not found'); }
    return;
  }

  const modeBlocks = modes.map(mode => {
    const runs = allRuns.filter(r => r.mode === mode);
    const rows = runs.map(r => {
      const cls = r.status === 'PASS' ? 'pass' : r.status === 'WARN' ? 'warn' : 'fail';
      return `<div class="card">
        <div class="card-head">
          <span class="${cls}">[${r.status}]</span> #${r.idx} &middot; ${r.resultCount}/10 &middot; ${r.durationMs}ms &middot; proxy:${r.proxyKB}KB
        </div>
        <div class="query">${r.query}</div>
        ${r.screenshotFile ? `<img src="/${mode}/${r.screenshotFile}" loading="lazy" />` : ''}
      </div>`;
    }).join('');
    return `<h2>${mode.toUpperCase()} (${runs.length} queries)</h2><div class="grid">${rows}</div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Crawlee Test Gallery</title>
<style>
  body { font-family: system-ui; margin: 2em; background: #111; color: #eee; }
  h1 { font-size: 1.4em; } h2 { font-size: 1.2em; margin-top: 2em; border-bottom: 1px solid #333; padding-bottom: 0.4em; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 1.2em; margin-top: 1em; }
  .card { background: #1a1a1a; border: 1px solid #333; border-radius: 6px; padding: 0.8em; }
  .card-head { font-size: 0.85em; color: #aaa; margin-bottom: 0.3em; }
  .query { font-size: 0.8em; color: #888; margin-bottom: 0.5em; word-break: break-word; }
  .pass { color: #4f4; } .warn { color: #ff4; } .fail { color: #f44; }
  img { max-width: 100%; border: 1px solid #333; border-radius: 4px; }
</style></head><body>
  <h1>Google Crawlee Test Gallery</h1>
  <p style="color:#aaa">${allRuns.length} total queries &middot; Screenshots in <code>${OUT_ROOT}</code></p>
  ${modeBlocks}
</body></html>`;

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
});

server.listen(PORT, () => {
  console.log(`\nGallery: http://localhost:${PORT}`);
  console.log('Press Ctrl+C to exit.\n');
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`\nPort ${PORT} in use — skipping gallery server.`);
  }
});
