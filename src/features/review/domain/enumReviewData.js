// ── Enum Review Data ────────────────────────────────────────────────
//
// Builds enum review payloads from SpecDb.
// Extracted from componentReviewData.js.

import {
  buildPipelineEnumCandidateId,
  buildReferenceEnumCandidateId,
} from '../../../utils/candidateIdentifier.js';
import { normalizeFieldKey, slugify } from './reviewNormalization.js';
import {
  hasKnownValue,
  hasActionableCandidate,
  ensureEnumValueCandidateInvariant,
  isSharedLanePending,
  shouldIncludeEnumValueEntry,
} from './candidateInfrastructure.js';

export async function buildEnumReviewPayloadsSpecDb({ config = {}, category, specDb, enabledEnumFields = null }) {
  const rawFieldKeys = specDb.getAllEnumFields();
  const fieldKeys = enabledEnumFields instanceof Set
    ? rawFieldKeys.filter((fieldKey) => enabledEnumFields.has(normalizeFieldKey(fieldKey)))
    : rawFieldKeys;
  const fields = [];

  for (const field of fieldKeys) {
    const enumListRow = specDb.getEnumList(field);
    const listRows = specDb.getListValues(field);
    const valueMap = new Map();

    for (const row of listRows) {
      const normalized = String(row.value).trim().toLowerCase();
      if (!normalized) continue;

      const enumKeyState = specDb.getKeyReviewState({
        category,
        targetKind: 'enum_key',
        fieldKey: field,
        enumValueNorm: normalized,
        listValueId: row.id ?? null,
      });
      const basePending = Boolean(row.needs_review);
      const isPending = isSharedLanePending(enumKeyState, basePending);
      const source = row.source || 'known_values';
      const confidence = isPending ? 0.6 : 1.0;
      const color = isPending ? 'yellow' : 'green';

      // Build candidate based on source
      const candidates = [];
      if (source === 'pipeline') {
        candidates.push({
          candidate_id: buildPipelineEnumCandidateId({ fieldKey: field, value: row.value }),
          value: row.value,
          score: isPending ? 0.6 : 1.0,
          source_id: 'pipeline',
          source: 'Pipeline',
          tier: null,
          method: 'pipeline_extraction',
          evidence: {
            url: '', retrieved_at: row.source_timestamp || '',
            snippet_id: '', snippet_hash: '',
            quote: isPending ? 'Discovered by pipeline' : 'Discovered by pipeline, accepted by user',
            quote_span: null,
            snippet_text: isPending ? 'Discovered by pipeline' : 'Discovered by pipeline, accepted by user',
            source_id: 'pipeline',
          },
        });
      } else if (source !== 'manual') {
        candidates.push({
          candidate_id: buildReferenceEnumCandidateId({ fieldKey: field, value: row.value }),
          value: row.value,
          score: 1.0,
          source_id: 'reference',
          source: 'Reference',
          tier: null,
          method: 'reference_data',
          evidence: {
            url: '', retrieved_at: '',
            snippet_id: '', snippet_hash: '',
            quote: `From reference database`,
            quote_span: null,
            snippet_text: `From reference database`,
            source_id: 'reference',
          },
        });
      }

      const entry = {
        list_value_id: row.id ?? null,
        enum_list_id: row.list_id ?? null,
        value: row.value,
        source,
        source_timestamp: row.source_timestamp || null,
        confidence,
        color,
        needs_review: isPending,
        candidates,
        normalized_value: row.normalized_value || null,
        enum_policy: row.enum_policy || null,
        accepted_candidate_id: String(enumKeyState?.selected_candidate_id || '').trim()
          || row.accepted_candidate_id
          || null,
      };

      // SpecDb enrichment: linked products and additional candidates
      try {
        const productRows = specDb.getProductsByListValueId(row.id);
        if (productRows.length > 0) {
          entry.linked_products = productRows.map(r => ({
            product_id: r.product_id,
            field_key: r.field_key,
          }));
        }

      } catch (_) {
        // Best-effort enrichment
      }

      ensureEnumValueCandidateInvariant(entry, {
        fieldKey: field,
        fallbackQuote: `Selected ${field} enum value retained for authoritative review`,
      });

      valueMap.set(normalized, entry);
    }

    const values = [...valueMap.values()]
      .filter((entry) => shouldIncludeEnumValueEntry(entry, {
        requireLinkedPendingPipeline: true,
      }))
      .sort((a, b) => a.value.localeCompare(b.value));
    const flagCount = values.filter(v => (
      v.needs_review
      && hasActionableCandidate(v.candidates)
    )).length;

    fields.push({
      field,
      enum_list_id: enumListRow?.id ?? null,
      values,
      metrics: { total: values.length, flags: flagCount },
    });
  }

  return { category, fields };
}
