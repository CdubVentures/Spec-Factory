// WHY: Centralized deletion service that cascades deletes through all three
// persistence layers: SQL tables, checkpoint JSON files, and filesystem artifacts.
// Execution order: resolve scope → SQL transaction → rewrite checkpoints → delete files.
// This prevents re-seeding by scanAndSeedCheckpoints or seed.js after deletion.

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

function safeReadJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function safeWriteJson(filePath, data) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch { return false; }
}

function safeRmDir(dirPath) {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
      return true;
    }
  } catch { /* best-effort */ }
  return false;
}

function safeRmFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch { /* best-effort */ }
  return false;
}

function placeholders(ids) {
  return ids.map(() => '?').join(',');
}

/**
 * @param {{ db: import('better-sqlite3').Database, category: string }} deps
 */
export function createDeletionStore({ db, category: defaultCategory }) {

  // ── deleteRun ───────────────────────────────────────────────────────────

  function deleteRun({ runId, productId, category = defaultCategory, fsRoots }) {
    const rid = String(runId || '').trim();
    const pid = String(productId || '').trim();
    const cat = String(category || defaultCategory || '').trim();
    if (!rid) throw new Error('deleteRun requires runId');
    if (!pid) throw new Error('deleteRun requires productId');

    // Step 1: Check if run exists
    const runExists = db.prepare('SELECT 1 FROM runs WHERE run_id = ?').get(rid)
      || db.prepare('SELECT 1 FROM crawl_sources WHERE run_id = ?').get(rid);
    if (!runExists) return { ok: false, run_id: rid, reason: 'run_not_found' };

    let totalDeleted = 0;

    // Step 2: SQL transaction
    const tx = db.transaction(() => {
      // Phase 1 — Leaf tables
      try { totalDeleted += db.prepare('DELETE FROM bridge_events WHERE run_id = ?').run(rid).changes; } catch { /* table may not exist */ }
      totalDeleted += db.prepare('DELETE FROM knob_snapshots WHERE run_id = ?').run(rid).changes;
      totalDeleted += db.prepare('DELETE FROM query_index WHERE run_id = ?').run(rid).changes;
      totalDeleted += db.prepare('DELETE FROM url_index WHERE run_id = ?').run(rid).changes;
      totalDeleted += db.prepare('DELETE FROM prompt_index WHERE run_id = ?').run(rid).changes;
      // Phase 4 — Artifact tables
      const contentHashes = db.prepare('SELECT content_hash FROM crawl_sources WHERE run_id = ?').all(rid).map((r) => r.content_hash).filter(Boolean);
      totalDeleted += db.prepare('DELETE FROM crawl_sources WHERE run_id = ?').run(rid).changes;
      totalDeleted += db.prepare('DELETE FROM source_screenshots WHERE run_id = ?').run(rid).changes;
      totalDeleted += db.prepare('DELETE FROM source_videos WHERE run_id = ?').run(rid).changes;

      // Phase 5 — Run metadata
      totalDeleted += db.prepare('DELETE FROM run_artifacts WHERE run_id = ?').run(rid).changes;
      totalDeleted += db.prepare('DELETE FROM runs WHERE run_id = ?').run(rid).changes;

      // Phase 7 — Accumulated tables (conditional cleanup)
      // Delete cooldowns where this is the only run that created them
      totalDeleted += db.prepare('DELETE FROM query_cooldowns WHERE product_id = ? AND category = ? AND query_hash LIKE ?').run(pid, cat, `qh_${rid}%`).changes;
      // For url_crawl_ledger: delete entries where both first/last point to this run
      totalDeleted += db.prepare('DELETE FROM url_crawl_ledger WHERE product_id = ? AND first_seen_run_id = ? AND last_seen_run_id = ?').run(pid, rid, rid).changes;
      // Update entries where only last_seen points to this run
      db.prepare('UPDATE url_crawl_ledger SET last_seen_run_id = first_seen_run_id WHERE product_id = ? AND last_seen_run_id = ?').run(pid, rid);
    });
    tx();

    // Step 3: Rewrite product.json
    let productJsonUpdated = false;
    if (fsRoots?.products) {
      const cpPath = path.join(fsRoots.products, pid, 'product.json');
      const cp = safeReadJson(cpPath);
      if (cp && cp.checkpoint_type === 'product') {
        cp.sources = (cp.sources || []).filter((s) =>
          !(s.first_seen_run_id === rid && s.last_seen_run_id === rid)
        );
        // Clear last_seen_run_id if it points to deleted run
        for (const s of cp.sources) {
          if (s.last_seen_run_id === rid) s.last_seen_run_id = s.first_seen_run_id;
        }
        cp.query_cooldowns = (cp.query_cooldowns || []).filter((cd) => cd.query_hash !== `qh_${rid}`);
        cp.runs_completed = Math.max(0, (cp.runs_completed || 0) - 1);
        // Update latest_run_id to the next most recent surviving run
        if (cp.latest_run_id === rid) {
          const surviving = db.prepare('SELECT run_id FROM runs WHERE product_id = ? AND category = ? ORDER BY started_at DESC LIMIT 1').get(pid, cat);
          cp.latest_run_id = surviving?.run_id || '';
        }
        cp.updated_at = new Date().toISOString();
        productJsonUpdated = safeWriteJson(cpPath, cp);
      }
    }

    // Step 4: Delete filesystem artifacts
    let runDirDeleted = false;
    let outputDirDeleted = false;
    if (fsRoots?.runs) {
      runDirDeleted = safeRmDir(path.join(fsRoots.runs, rid));
    }
    if (fsRoots?.output) {
      outputDirDeleted = safeRmDir(path.join(fsRoots.output, cat, pid, 'runs', rid));
    }

    return {
      ok: true,
      run_id: rid,
      sql: { rows_deleted: totalDeleted },
      fs: { run_dir_deleted: runDirDeleted, output_dir_deleted: outputDirDeleted, product_json_updated: productJsonUpdated },
    };
  }

  // ── deleteUrl ───────────────────────────────────────────────────────────

  function deleteUrl({ url, productId, category = defaultCategory, fsRoots }) {
    const u = String(url || '').trim();
    const pid = String(productId || '').trim();
    const cat = String(category || defaultCategory || '').trim();
    if (!u) throw new Error('deleteUrl requires url');
    if (!pid) throw new Error('deleteUrl requires productId');

    // Step 1: Resolve scope — find all content_hashes and run_ids for this URL
    const crawlRows = db.prepare('SELECT content_hash, run_id FROM crawl_sources WHERE source_url = ? AND product_id = ?').all(u, pid);
    if (!crawlRows.length) {
      return { ok: false, url: u, product_id: pid, reason: 'url_not_found' };
    }

    const contentHashes = crawlRows.map((r) => r.content_hash).filter(Boolean);
    const affectedRunIds = [...new Set(crawlRows.map((r) => r.run_id).filter(Boolean))];
    let totalDeleted = 0;
    let filesDeleted = 0;

    // Step 2: SQL transaction
    const tx = db.transaction(() => {
      // Artifact tables
      totalDeleted += db.prepare('DELETE FROM source_screenshots WHERE source_url = ? AND product_id = ?').run(u, pid).changes;
      totalDeleted += db.prepare('DELETE FROM source_videos WHERE source_url = ? AND product_id = ?').run(u, pid).changes;
      totalDeleted += db.prepare('DELETE FROM crawl_sources WHERE source_url = ? AND product_id = ?').run(u, pid).changes;

      // Accumulated tables
      totalDeleted += db.prepare('DELETE FROM url_crawl_ledger WHERE canonical_url = ? AND product_id = ?').run(u, pid).changes;
      totalDeleted += db.prepare('DELETE FROM url_index WHERE url = ? AND category = ?').run(u, cat).changes;
    });
    tx();

    // Step 3: Rewrite product.json — remove source entries for this URL
    let productJsonUpdated = false;
    if (fsRoots?.products) {
      const cpPath = path.join(fsRoots.products, pid, 'product.json');
      const cp = safeReadJson(cpPath);
      if (cp && cp.checkpoint_type === 'product') {
        cp.sources = (cp.sources || []).filter((s) => s.url !== u);
        cp.updated_at = new Date().toISOString();
        productJsonUpdated = safeWriteJson(cpPath, cp);
      }
    }

    // Step 4: Rewrite run.json files — remove URL from sources
    if (fsRoots?.runs) {
      for (const rid of affectedRunIds) {
        const runJsonPath = path.join(fsRoots.runs, rid, 'run.json');
        const runJson = safeReadJson(runJsonPath);
        if (runJson && Array.isArray(runJson.sources)) {
          runJson.sources = runJson.sources.filter((s) => s.url !== u);
          if (runJson.counters) {
            runJson.counters.urls_crawled = runJson.sources.length;
            runJson.counters.urls_successful = runJson.sources.filter((s) => s.success !== false).length;
          }
          safeWriteJson(runJsonPath, runJson);
        }
      }
    }

    // Step 5: Delete filesystem artifacts for this URL
    if (fsRoots?.runs) {
      for (const hash of contentHashes) {
        for (const rid of affectedRunIds) {
          if (safeRmFile(path.join(fsRoots.runs, rid, 'html', `${hash.slice(0, 12)}.html.gz`))) filesDeleted++;
        }
      }
      // Best-effort screenshot cleanup by content_hash prefix
      for (const rid of affectedRunIds) {
        const ssDir = path.join(fsRoots.runs, rid, 'screenshots');
        try {
          const files = fs.readdirSync(ssDir);
          for (const f of files) {
            for (const hash of contentHashes) {
              if (f.includes(hash.slice(0, 8))) {
                if (safeRmFile(path.join(ssDir, f))) filesDeleted++;
              }
            }
          }
        } catch { /* dir may not exist */ }
      }
    }

    // Step 6: Delete extracted source directories from output
    if (fsRoots?.output) {
      let host = '';
      try { host = new URL(u).hostname; } catch { /* invalid URL */ }
      if (host) {
        for (const rid of affectedRunIds) {
          const extractedBase = path.join(fsRoots.output, cat, pid, 'runs', rid, 'extracted');
          try {
            const dirs = fs.readdirSync(extractedBase);
            for (const d of dirs) {
              if (d.startsWith(host)) {
                if (safeRmDir(path.join(extractedBase, d))) filesDeleted++;
              }
            }
          } catch { /* dir may not exist */ }
        }
      }
    }

    return {
      ok: true,
      url: u,
      product_id: pid,
      sql: { rows_deleted: totalDeleted },
      fs: { files_deleted: filesDeleted, product_json_updated: productJsonUpdated },
    };
  }

  // ── deleteProductHistory ────────────────────────────────────────────────

  function deleteProductHistory({ productId, category = defaultCategory, fsRoots }) {
    const pid = String(productId || '').trim();
    const cat = String(category || defaultCategory || '').trim();
    if (!pid) throw new Error('deleteProductHistory requires productId');

    // Step 1: Collect all run_ids for this product
    const allRunIds = db.prepare('SELECT run_id FROM runs WHERE product_id = ? AND category = ?').all(pid, cat).map((r) => r.run_id);

    let totalDeleted = 0;

    // Step 2: SQL transaction
    const tx = db.transaction(() => {
      // Phase 1 — Leaf/telemetry tables
      totalDeleted += db.prepare('DELETE FROM query_index WHERE product_id = ?').run(pid).changes;
      totalDeleted += db.prepare('DELETE FROM query_cooldowns WHERE product_id = ?').run(pid).changes;
      totalDeleted += db.prepare('DELETE FROM url_crawl_ledger WHERE product_id = ?').run(pid).changes;

      if (allRunIds.length) {
        const ph = placeholders(allRunIds);
        try { totalDeleted += db.prepare(`DELETE FROM bridge_events WHERE run_id IN (${ph})`).run(...allRunIds).changes; } catch { /* table may not exist */ }
        totalDeleted += db.prepare(`DELETE FROM knob_snapshots WHERE run_id IN (${ph})`).run(...allRunIds).changes;
        totalDeleted += db.prepare(`DELETE FROM url_index WHERE run_id IN (${ph})`).run(...allRunIds).changes;
        totalDeleted += db.prepare(`DELETE FROM prompt_index WHERE run_id IN (${ph})`).run(...allRunIds).changes;
      }

      // Phase 2 — Key review cascade (retired in Phase 1b)

      // Phase 4 — Item links
      totalDeleted += db.prepare('DELETE FROM item_list_links WHERE product_id = ? AND category = ?').run(pid, cat).changes;
      totalDeleted += db.prepare('DELETE FROM item_component_links WHERE product_id = ? AND category = ?').run(pid, cat).changes;

      // Phase 5 — Artifact tables
      const contentHashes = db.prepare('SELECT DISTINCT content_hash FROM crawl_sources WHERE product_id = ?').all(pid).map((r) => r.content_hash).filter(Boolean);
      totalDeleted += db.prepare('DELETE FROM crawl_sources WHERE product_id = ?').run(pid).changes;
      totalDeleted += db.prepare('DELETE FROM source_screenshots WHERE product_id = ?').run(pid).changes;
      totalDeleted += db.prepare('DELETE FROM source_videos WHERE product_id = ?').run(pid).changes;

      // Phase 6 — Run metadata
      if (allRunIds.length) {
        const ph = placeholders(allRunIds);
        totalDeleted += db.prepare(`DELETE FROM run_artifacts WHERE run_id IN (${ph})`).run(...allRunIds).changes;
      }
      totalDeleted += db.prepare('DELETE FROM runs WHERE product_id = ? AND category = ?').run(pid, cat).changes;
    });
    tx();

    // Step 3: Rewrite product.json to identity-only state
    let productJsonReset = false;
    if (fsRoots?.products) {
      const cpPath = path.join(fsRoots.products, pid, 'product.json');
      const cp = safeReadJson(cpPath);
      if (cp && cp.checkpoint_type === 'product') {
        cp.sources = [];
        cp.query_cooldowns = [];
        cp.runs_completed = 0;
        cp.latest_run_id = '';
        cp.fields = {};
        cp.provenance = {};
        cp.updated_at = new Date().toISOString();
        productJsonReset = safeWriteJson(cpPath, cp);
      }
    }

    // Step 4: Delete filesystem artifacts
    let runDirsDeleted = 0;
    if (fsRoots?.runs) {
      for (const rid of allRunIds) {
        if (safeRmDir(path.join(fsRoots.runs, rid))) runDirsDeleted++;
      }
    }
    let outputDirDeleted = false;
    if (fsRoots?.output) {
      outputDirDeleted = safeRmDir(path.join(fsRoots.output, cat, pid));
    }

    return {
      ok: true,
      product_id: pid,
      runs_deleted: allRunIds.length,
      sql: { rows_deleted: totalDeleted },
      fs: { run_dirs_deleted: runDirsDeleted, output_dir_deleted: outputDirDeleted, product_json_reset: productJsonReset },
    };
  }

  return { deleteRun, deleteUrl, deleteProductHistory };
}
