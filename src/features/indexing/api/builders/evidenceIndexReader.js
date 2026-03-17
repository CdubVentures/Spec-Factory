import { toInt } from '../../../../shared/valueNormalizers.js';
import { buildEvidenceSearchPayload } from '../../../../api/evidenceSearch.js';

export function createEvidenceIndexReader({
  resolveContext,
  readEvents,
  getSpecDbReady,
}) {
  async function readIndexLabRunEvidenceIndex(runId, { query = '', limit = 40 } = {}) {
    const context = await resolveContext(runId);
    if (!context) return null;
    const requestedQuery = String(query || '').trim();
    const requestedLimit = Math.max(1, Math.min(120, toInt(limit, 40)));
    const specDb = await getSpecDbReady(context.category);
    if (!specDb?.db) {
      return {
        generated_at: new Date().toISOString(),
        run_id: context.resolvedRunId,
        category: context.category,
        product_id: context.productId,
        db_ready: false,
        scope: {
          mode: 'none',
          run_match: false,
          run_id: context.resolvedRunId
        },
        summary: {
          documents: 0,
          artifacts: 0,
          artifacts_with_hash: 0,
          unique_hashes: 0,
          assertions: 0,
          evidence_refs: 0,
          fields_covered: 0
        },
        documents: [],
        top_fields: [],
        search: {
          query: requestedQuery,
          limit: requestedLimit,
          count: 0,
          rows: [],
          note: 'spec_db_not_ready'
        }
      };
    }

    const db = specDb.db;
    const scopeBaseSql = `
      sr.category = @category
      AND (
        sr.product_id = @product_id
        OR sr.item_identifier = @product_id
      )
    `;
    const scopeParams = {
      category: context.category,
      product_id: context.productId,
      run_id: context.resolvedRunId
    };
    const runCountRow = db.prepare(
      `SELECT COUNT(*) AS c FROM source_registry sr WHERE ${scopeBaseSql} AND sr.run_id = @run_id`
    ).get(scopeParams);
    const runMatch = toInt(runCountRow?.c, 0) > 0;
    const scopeMode = runMatch ? 'run' : 'product_fallback';
    const scopeSql = runMatch
      ? `${scopeBaseSql} AND sr.run_id = @run_id`
      : scopeBaseSql;

    const summaryRow = db.prepare(`
      SELECT
        COUNT(DISTINCT sr.source_id) AS documents,
        COUNT(sa.artifact_id) AS artifacts,
        SUM(CASE WHEN TRIM(COALESCE(sa.content_hash, '')) <> '' THEN 1 ELSE 0 END) AS artifacts_with_hash,
        COUNT(DISTINCT CASE WHEN TRIM(COALESCE(sa.content_hash, '')) <> '' THEN sa.content_hash END) AS unique_hashes,
        COUNT(DISTINCT asr.assertion_id) AS assertions,
        COUNT(ser.evidence_ref_id) AS evidence_refs,
        COUNT(DISTINCT asr.field_key) AS fields_covered
      FROM source_registry sr
      LEFT JOIN source_artifacts sa ON sa.source_id = sr.source_id
      LEFT JOIN source_assertions asr ON asr.source_id = sr.source_id
      LEFT JOIN source_evidence_refs ser ON ser.assertion_id = asr.assertion_id
      WHERE ${scopeSql}
    `).get(scopeParams) || {};

    const documents = db.prepare(`
      SELECT
        sr.source_id,
        sr.source_url,
        sr.source_host,
        sr.source_tier,
        sr.crawl_status,
        sr.http_status,
        sr.fetched_at,
        sr.run_id,
        COUNT(DISTINCT sa.artifact_id) AS artifact_count,
        SUM(CASE WHEN TRIM(COALESCE(sa.content_hash, '')) <> '' THEN 1 ELSE 0 END) AS hash_count,
        COUNT(DISTINCT CASE WHEN TRIM(COALESCE(sa.content_hash, '')) <> '' THEN sa.content_hash END) AS unique_hashes,
        COUNT(DISTINCT asr.assertion_id) AS assertion_count,
        COUNT(ser.evidence_ref_id) AS evidence_ref_count
      FROM source_registry sr
      LEFT JOIN source_artifacts sa ON sa.source_id = sr.source_id
      LEFT JOIN source_assertions asr ON asr.source_id = sr.source_id
      LEFT JOIN source_evidence_refs ser ON ser.assertion_id = asr.assertion_id
      WHERE ${scopeSql}
      GROUP BY sr.source_id
      ORDER BY COALESCE(sr.fetched_at, sr.updated_at, sr.created_at) DESC, sr.source_id
      LIMIT 120
    `).all(scopeParams);

    const topFields = db.prepare(`
      SELECT
        asr.field_key,
        COUNT(DISTINCT asr.assertion_id) AS assertions,
        COUNT(ser.evidence_ref_id) AS evidence_refs,
        COUNT(DISTINCT asr.source_id) AS distinct_sources
      FROM source_assertions asr
      JOIN source_registry sr ON sr.source_id = asr.source_id
      LEFT JOIN source_evidence_refs ser ON ser.assertion_id = asr.assertion_id
      WHERE ${scopeSql}
      GROUP BY asr.field_key
      ORDER BY assertions DESC, evidence_refs DESC, asr.field_key
      LIMIT 80
    `).all(scopeParams);

    let searchRows = [];
    if (requestedQuery) {
      const queryToken = requestedQuery.toLowerCase();
      const queryLike = `%${queryToken}%`;
      const rankedRows = db.prepare(`
        SELECT
          sr.source_id,
          sr.source_url,
          sr.source_host,
          sr.source_tier,
          sr.run_id,
          asr.assertion_id,
          asr.field_key,
          asr.context_kind,
          asr.value_raw,
          asr.value_normalized,
          ser.snippet_id,
          ser.evidence_url,
          ser.quote,
          c.snippet_text
        FROM source_registry sr
        JOIN source_assertions asr ON asr.source_id = sr.source_id
        LEFT JOIN source_evidence_refs ser ON ser.assertion_id = asr.assertion_id
        LEFT JOIN candidates c
          ON c.candidate_id = asr.candidate_id
         AND c.category = sr.category
        WHERE ${scopeSql}
          AND (
            LOWER(COALESCE(asr.field_key, '')) LIKE @query_like
            OR LOWER(COALESCE(asr.value_raw, '')) LIKE @query_like
            OR LOWER(COALESCE(asr.value_normalized, '')) LIKE @query_like
            OR LOWER(COALESCE(ser.quote, '')) LIKE @query_like
            OR LOWER(COALESCE(c.snippet_text, '')) LIKE @query_like
          )
        ORDER BY
          CASE
            WHEN LOWER(COALESCE(asr.field_key, '')) = @query_exact THEN 0
            WHEN LOWER(COALESCE(asr.field_key, '')) LIKE @query_like THEN 1
            WHEN LOWER(COALESCE(asr.value_raw, '')) LIKE @query_like THEN 2
            WHEN LOWER(COALESCE(ser.quote, '')) LIKE @query_like THEN 3
            ELSE 4
          END,
          COALESCE(sr.source_tier, 99) ASC,
          COALESCE(sr.fetched_at, sr.updated_at, sr.created_at) DESC,
          sr.source_id
        LIMIT @limit
      `).all({
        ...scopeParams,
        query_like: queryLike,
        query_exact: queryToken,
        limit: requestedLimit
      });

      searchRows = rankedRows.map((row) => ({
        source_id: String(row.source_id || '').trim(),
        source_url: String(row.source_url || '').trim(),
        source_host: String(row.source_host || '').trim(),
        source_tier: row.source_tier === null || row.source_tier === undefined
          ? null
          : toInt(row.source_tier, 0),
        run_id: String(row.run_id || '').trim() || null,
        field_key: String(row.field_key || '').trim(),
        context_kind: String(row.context_kind || '').trim(),
        assertion_id: String(row.assertion_id || '').trim(),
        snippet_id: String(row.snippet_id || '').trim() || null,
        evidence_url: String(row.evidence_url || '').trim() || null,
        quote_preview: String(row.quote || '').trim().slice(0, 280),
        snippet_preview: String(row.snippet_text || '').trim().slice(0, 280),
        value_preview: String(row.value_raw || row.value_normalized || '').trim().slice(0, 160)
      }));
    }

    return {
      generated_at: new Date().toISOString(),
      run_id: context.resolvedRunId,
      category: context.category,
      product_id: context.productId,
      db_ready: true,
      scope: {
        mode: scopeMode,
        run_match: runMatch,
        run_id: context.resolvedRunId
      },
      summary: {
        documents: toInt(summaryRow.documents, 0),
        artifacts: toInt(summaryRow.artifacts, 0),
        artifacts_with_hash: toInt(summaryRow.artifacts_with_hash, 0),
        unique_hashes: toInt(summaryRow.unique_hashes, 0),
        assertions: toInt(summaryRow.assertions, 0),
        evidence_refs: toInt(summaryRow.evidence_refs, 0),
        fields_covered: toInt(summaryRow.fields_covered, 0)
      },
      documents: documents.map((row) => ({
        source_id: String(row.source_id || '').trim(),
        source_url: String(row.source_url || '').trim(),
        source_host: String(row.source_host || '').trim(),
        source_tier: row.source_tier === null || row.source_tier === undefined
          ? null
          : toInt(row.source_tier, 0),
        crawl_status: String(row.crawl_status || '').trim(),
        http_status: row.http_status === null || row.http_status === undefined
          ? null
          : toInt(row.http_status, 0),
        fetched_at: String(row.fetched_at || '').trim() || null,
        run_id: String(row.run_id || '').trim() || null,
        artifact_count: toInt(row.artifact_count, 0),
        hash_count: toInt(row.hash_count, 0),
        unique_hashes: toInt(row.unique_hashes, 0),
        assertion_count: toInt(row.assertion_count, 0),
        evidence_ref_count: toInt(row.evidence_ref_count, 0)
      })),
      top_fields: topFields.map((row) => ({
        field_key: String(row.field_key || '').trim(),
        assertions: toInt(row.assertions, 0),
        evidence_refs: toInt(row.evidence_refs, 0),
        distinct_sources: toInt(row.distinct_sources, 0)
      })),
      search: {
        query: requestedQuery,
        limit: requestedLimit,
        count: searchRows.length,
        rows: searchRows
      },
      dedupe_stream: await (async () => {
        try {
          const events = await readEvents(context.resolvedRunId, 8000);
          const DEDUPE_EVENT_NAMES = new Set(['indexed_new', 'dedupe_hit', 'dedupe_updated']);
          const dedupeEvents = events.filter((e) => DEDUPE_EVENT_NAMES.has(e?.event));
          const payload = buildEvidenceSearchPayload({ dedupeEvents, query: requestedQuery });
          return payload.dedupe_stream;
        } catch {
          return { total: 0, new_count: 0, reused_count: 0, updated_count: 0, total_chunks_indexed: 0 };
        }
      })()
    };
  }

  return { readIndexLabRunEvidenceIndex };
}
