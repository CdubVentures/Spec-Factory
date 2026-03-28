import path from 'node:path';
import fsSync from 'node:fs';
import { gzipBuffer, toNdjson } from '../shared/serialization.js';
import { SpecDb } from '../db/specDb.js';
import { buildScopedItemCandidateId } from '../utils/candidateIdentifier.js';
import { resolveSourceDir, computePageContentHash, computeFileContentHash } from './artifactPathResolver.js';

function jsonBuffer(value) {
  return Buffer.from(JSON.stringify(value, null, 2), 'utf8');
}

function safeName(value, fallback = 'artifact') {
  const text = String(value || fallback).replace(/[^a-zA-Z0-9._-]/g, '_');
  return text || fallback;
}

function screenshotBuffer(artifact = {}) {
  if (Buffer.isBuffer(artifact?.bytes)) {
    return artifact.bytes;
  }
  const raw = artifact?.bytes;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return Buffer.from(raw, 'base64');
    } catch {
      return null;
    }
  }
  return null;
}

async function writePageArtifacts({ writes, storage, category, productId, runId, host, artifact, artifactStore }) {
  const htmlContent = String(artifact.html || '');
  const pageHash = computePageContentHash(htmlContent);
  if (!pageHash) return;

  const sourceDir = resolveSourceDir({ category, productId, contentHash: pageHash });
  if (!sourceDir) return;

  // WHY: Content-addressed dedup — skip binary writes if this exact content already indexed.
  const existing = artifactStore?.getCrawlSourceByHash(pageHash, productId);
  const skipBinaryWrites = Boolean(existing) || Boolean(artifact?.pageArtifactsPersisted);

  const hasLdjson = Array.isArray(artifact.ldjsonBlocks) && artifact.ldjsonBlocks.length > 0;
  const domSnippetHtml = String(artifact?.domSnippet?.html || '').trim();
  const screenshot = screenshotBuffer(artifact?.screenshot || {});
  const hasScreenshot = Boolean(screenshot && screenshot.length > 0);

  if (!skipBinaryWrites) {
    writes.push(
      storage.writeObject(
        `${sourceDir}page.html.gz`,
        gzipBuffer(htmlContent),
        { contentType: 'text/html', contentEncoding: 'gzip' }
      )
    );

    if (hasLdjson) {
      writes.push(
        storage.writeObject(
          `${sourceDir}ldjson.json`,
          jsonBuffer(artifact.ldjsonBlocks),
          { contentType: 'application/json' }
        )
      );
    }

    if (artifact.embeddedState && Object.keys(artifact.embeddedState).length > 0) {
      writes.push(
        storage.writeObject(
          `${sourceDir}embedded_state.json`,
          jsonBuffer(artifact.embeddedState),
          { contentType: 'application/json' }
        )
      );
    }

    if (domSnippetHtml) {
      writes.push(
        storage.writeObject(
          `${sourceDir}dom_snippet.html`,
          Buffer.from(domSnippetHtml, 'utf8'),
          { contentType: 'text/html; charset=utf-8' }
        )
      );
    }

    if (hasScreenshot) {
      const format = String(artifact?.screenshot?.format || 'jpeg').trim().toLowerCase();
      const ext = format === 'png' ? 'png' : 'jpg';
      const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
      writes.push(
        storage.writeObject(
          `${sourceDir}screenshot.${ext}`,
          screenshot,
          { contentType }
        )
      );
    }

    for (const pdf of artifact.pdfDocs || []) {
      const filename = safeName(pdf.filename || path.basename(pdf.url || '') || 'doc.pdf');
      writes.push(
        storage.writeObject(
          `${sourceDir}${filename}`,
          pdf.bytes,
          { contentType: 'application/pdf' }
        )
      );
    }
  }

  // SQL metadata inserts (always, even on dedup — updates run_id to latest)
  if (artifactStore) {
    try {
      artifactStore.insertCrawlSource({
        content_hash: pageHash,
        category,
        product_id: productId,
        run_id: runId,
        source_url: String(artifact.url || '').trim(),
        final_url: String(artifact.finalUrl || artifact.url || '').trim(),
        host: String(host || '').trim(),
        http_status: Number(artifact.status || 0),
        doc_kind: String(artifact.docKind || 'other').trim(),
        source_tier: Number(artifact.sourceTier || 5),
        content_type: String(artifact.contentType || 'text/html').trim(),
        size_bytes: Buffer.byteLength(htmlContent, 'utf8'),
        file_path: `${sourceDir}page.html.gz`,
        has_screenshot: hasScreenshot ? 1 : 0,
        has_pdf: (artifact.pdfDocs || []).length > 0 ? 1 : 0,
        has_ldjson: hasLdjson ? 1 : 0,
        has_dom_snippet: domSnippetHtml ? 1 : 0,
        crawled_at: new Date().toISOString(),
      });

      if (hasScreenshot) {
        const format = String(artifact?.screenshot?.format || 'jpeg').trim().toLowerCase();
        const ext = format === 'png' ? 'png' : 'jpg';
        const shotHash = computeFileContentHash(screenshot);
        artifactStore.insertScreenshot({
          screenshot_id: shotHash || `shot_${pageHash.slice(0, 16)}`,
          content_hash: pageHash,
          category,
          product_id: productId,
          run_id: runId,
          source_url: String(artifact.url || '').trim(),
          host: String(host || '').trim(),
          selector: String(artifact?.screenshot?.selector || '').trim() || 'fullpage',
          format: ext,
          width: Number(artifact?.screenshot?.width || 0),
          height: Number(artifact?.screenshot?.height || 0),
          size_bytes: screenshot.length,
          file_path: `${sourceDir}screenshot.${ext}`,
          captured_at: String(artifact?.screenshot?.captured_at || '').trim() || new Date().toISOString(),
          doc_kind: String(artifact.docKind || 'other').trim(),
          source_tier: Number(artifact.sourceTier || 5),
        });
      }

      for (const pdf of artifact.pdfDocs || []) {
        const filename = safeName(pdf.filename || path.basename(pdf.url || '') || 'doc.pdf');
        const pdfHash = computeFileContentHash(pdf.bytes);
        artifactStore.insertPdf({
          pdf_id: pdfHash || `pdf_${pageHash.slice(0, 12)}_${filename}`,
          content_hash: pdfHash || '',
          parent_content_hash: pageHash,
          category,
          product_id: productId,
          run_id: runId,
          source_url: String(pdf.url || '').trim(),
          host: String(host || '').trim(),
          filename,
          size_bytes: Buffer.isBuffer(pdf.bytes) ? pdf.bytes.length : 0,
          file_path: `${sourceDir}${filename}`,
          pages_scanned: Number(pdf.pages_scanned || 0),
          tables_found: Number(pdf.tables_found || 0),
          pair_count: Number(pdf.pair_count || 0),
          crawled_at: new Date().toISOString(),
        });
      }
    } catch (err) {
      // WHY: Best-effort — don't fail the export if SQL insert fails.
      if (typeof console !== 'undefined') console.error('[exporter] artifact SQL insert error:', err.message);
    }
  }
}

export async function exportRunArtifacts({
  storage,
  category,
  productId,
  runId,
  artifactsByHost,
  adapterArtifacts,
  normalized,
  provenance,
  candidates,
  specDb,
  summary,
  events,
  rowTsv,
  needSetFields,
  round,
}) {
  const runBase = storage.resolveOutputKey(category, productId, 'runs', runId);
  // WHY: latestBase kept in return value for callers that still reference it.
  // No files are written to latest/ anymore — SQL is the read source.
  const latestBase = storage.resolveOutputKey(category, productId, 'latest');

  // WHY: Resolve artifactStore from specDb for SQL metadata inserts.
  let db = specDb;
  if (!db) {
    try {
      const dbPath = path.join('.specfactory_tmp', category, 'spec.sqlite');
      fsSync.accessSync(dbPath);
      db = new SpecDb({ dbPath, category });
    } catch { /* no DB available */ }
  }
  const artifactStore = db || null;

  const writes = [];

  for (const [host, artifact] of Object.entries(artifactsByHost)) {
    await writePageArtifacts({ writes, storage, category, productId, runId, host, artifact, artifactStore });
  }

  // WHY: Normalized, provenance, events still written to run-scoped paths.
  // These move to SQL in migration waves C-D.
  writes.push(
    storage.writeObject(
      `${runBase}/normalized/${category}.normalized.json`,
      jsonBuffer(normalized),
      { contentType: 'application/json' }
    )
  );

  writes.push(
    storage.writeObject(
      `${runBase}/provenance/fields.provenance.json`,
      jsonBuffer(provenance),
      { contentType: 'application/json' }
    )
  );

  writes.push(
    storage.writeObject(
      `${runBase}/provenance/fields.candidates.json`,
      jsonBuffer(candidates || {}),
      { contentType: 'application/json' }
    )
  );

  writes.push(
    storage.writeObject(
      `${runBase}/logs/events.jsonl.gz`,
      gzipBuffer(toNdjson(events || [])),
      { contentType: 'application/x-ndjson', contentEncoding: 'gzip' }
    )
  );

  await Promise.all(writes);

  // Dual-write to SpecDb (db already resolved above for artifactStore)
  if (db) {
    try {
      exportToSpecDb({ specDb: db, category, productId, runId, normalized, provenance, candidates, summary, needSetFields, round });
    } catch (err) {
      // Best-effort — don't fail the export if SpecDb write fails
      if (typeof console !== 'undefined') console.error('[exporter] SpecDb dual-write error:', err.message);
    } finally {
      // Close if we opened it ourselves
      if (!specDb && db) try { db.close(); } catch { /* */ }
    }
  }

  return {
    runBase,
    latestBase
  };
}

/** Dual-write pipeline outputs into SpecDb tables */
function exportToSpecDb({ specDb, category, productId, runId, normalized, provenance, candidates, summary, needSetFields, round }) {
  const fields = normalized?.fields || {};
  const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
  const usedCandidateIds = new Set();
  const reserveCandidateId = (candidateIdBase) => {
    let next = String(candidateIdBase || '').trim();
    if (!next) return next;
    if (!usedCandidateIds.has(next)) {
      usedCandidateIds.add(next);
      return next;
    }
    let ordinal = 1;
    while (usedCandidateIds.has(`${next}::dup_${ordinal}`)) ordinal += 1;
    next = `${next}::dup_${ordinal}`;
    usedCandidateIds.add(next);
    return next;
  };

  const tx = specDb.db.transaction(() => {
    // 1. Product run record
    specDb.upsertProductRun({
      product_id: productId,
      run_id: runId,
      is_latest: true,
      summary: summary || {},
      validated: summary?.validated || false,
      confidence: summary?.confidence ?? 0,
      cost_usd_run: summary?.cost_usd ?? 0,
      sources_attempted: summary?.sources_attempted ?? 0,
      run_at: new Date().toISOString()
    });

    // 2. Item field state from normalized
    for (const [fieldKey, rawValue] of Object.entries(fields)) {
      const prov = isObj(provenance) ? provenance[fieldKey] : null;
      const nextValue = rawValue != null ? String(rawValue) : null;
      specDb.upsertItemFieldState({
        productId,
        fieldKey,
        value: nextValue,
        confidence: prov?.confidence ?? 0,
        source: 'pipeline',
        overridden: false,
        needsAiReview: (prov?.confidence ?? 0) < 0.8,
        aiReviewComplete: false
      });
      specDb.syncItemListLinkForFieldValue({
        productId,
        fieldKey,
        value: nextValue,
      });
    }

    // 3. Candidates
    if (isObj(candidates)) {
      for (const [fieldKey, fieldCandidates] of Object.entries(candidates)) {
        if (!Array.isArray(fieldCandidates)) continue;
        for (let i = 0; i < fieldCandidates.length; i++) {
          const c = fieldCandidates[i];
          if (!isObj(c)) continue;
          const baseCandidateId = buildScopedItemCandidateId({
            productId,
            fieldKey,
            rawCandidateId: c.candidate_id || c.id || '',
            value: c.value ?? '',
            sourceHost: c.source_host ?? c.evidence?.host ?? '',
            sourceMethod: c.source_method ?? c.method ?? c.evidence?.method ?? '',
            index: c.rank ?? i,
            runId: runId || '',
          });
          const candidateId = reserveCandidateId(baseCandidateId);
          specDb.insertCandidate({
            candidate_id: candidateId,
            category,
            product_id: productId,
            field_key: fieldKey,
            value: c.value ?? null,
            normalized_value: c.normalized_value ?? null,
            score: c.score ?? c.confidence ?? 0,
            rank: c.rank ?? i,
            source_url: c.source_url ?? c.evidence?.url ?? null,
            source_host: c.source_host ?? c.evidence?.host ?? null,
            source_root_domain: c.source_root_domain ?? c.evidence?.rootDomain ?? null,
            source_tier: c.source_tier ?? c.evidence?.tier ?? null,
            source_method: c.source_method ?? c.evidence?.method ?? null,
            approved_domain: c.approved_domain ?? c.evidence?.approvedDomain ?? false,
            snippet_id: c.snippet_id ?? null,
            snippet_hash: c.snippet_hash ?? null,
            snippet_text: c.snippet_text ?? null,
            quote: c.quote ?? c.evidence?.quote ?? null,
            quote_span_start: c.quote_span?.[0] ?? null,
            quote_span_end: c.quote_span?.[1] ?? null,
            evidence_url: c.evidence_url ?? c.evidence?.url ?? null,
            evidence_retrieved_at: c.evidence_retrieved_at ?? c.evidence?.retrieved_at ?? null,
            extracted_at: c.extracted_at || new Date().toISOString(),
            run_id: runId
          });
        }
      }
    }

    // 4. Update queue product with run results
    const existingQueue = specDb.getQueueProduct(productId);
    if (existingQueue) {
      specDb.upsertQueueProduct({
        product_id: productId,
        status: summary?.validated ? 'complete' : existingQueue.status,
        last_run_id: runId,
        rounds_completed: (existingQueue.rounds_completed || 0) + 1,
        cost_usd_total: (existingQueue.cost_usd_total || 0) + (summary?.cost_usd ?? 0),
        attempts_total: (existingQueue.attempts_total || 0) + 1,
        last_completed_at: new Date().toISOString(),
        last_summary: summary ? JSON.stringify(summary) : null,
        // Preserve existing fields
        s3key: existingQueue.s3key,
        priority: existingQueue.priority,
        retry_count: existingQueue.retry_count,
        max_attempts: existingQueue.max_attempts,
        next_retry_at: existingQueue.next_retry_at,
        next_action_hint: existingQueue.next_action_hint,
        last_urls_attempted: existingQueue.last_urls_attempted,
        last_error: existingQueue.last_error,
        last_started_at: existingQueue.last_started_at,
        dirty_flags: existingQueue.dirty_flags
      });
    }

    // 5. Field histories (crash-recovery persistence for search progression)
    if (Array.isArray(needSetFields) && typeof specDb.upsertFieldHistory === 'function') {
      for (const field of needSetFields) {
        if (field?.field_key && field?.history) {
          specDb.upsertFieldHistory({
            product_id: productId,
            field_key: field.field_key,
            round: round ?? 0,
            run_id: runId,
            history_json: JSON.stringify(field.history),
          });
        }
      }
    }
  });
  tx();
}
