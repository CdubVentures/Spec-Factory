export function buildFinalizationEventPayloads({
  productId,
  runId,
  category,
  needSet = {},
  needSetRunKey = '',
  phase07PrimeSources = {},
  phase07RunKey = '',
  phase08Extraction = {},
  phase08RunKey = '',
  indexingSchemaPackets = {},
  sourcePacketsRunKey = '',
  itemPacketRunKey = '',
  runMetaPacketRunKey = '',
} = {}) {
  const fields = Array.isArray(needSet.fields) ? needSet.fields : [];
  const unresolved = fields.filter((f) => f.state !== 'accepted');
  const needsetComputedPayload = {
    productId,
    runId,
    category,
    needset_size: unresolved.length,
    total_fields: needSet.total_fields || fields.length,
    identity_lock_state: needSet.identity?.state || null,
    summary: needSet.summary || {},
    blockers: needSet.blockers || {},
    top_fields: unresolved.slice(0, 12).map((f) => f.field_key),
    needset_key: needSetRunKey,
    // Schema 4 panel data (projected from enriched needSet)
    bundles: Array.isArray(needSet.bundles) ? needSet.bundles : [],
    profile_influence: needSet.profile_influence || null,
    deltas: Array.isArray(needSet.deltas) ? needSet.deltas : [],
    round: typeof needSet.round === 'number' ? needSet.round : 0,
    schema_version: needSet.schema_version || null,
    // WHY: rows[] carries the planner drilldown grid (field_key, priority_bucket,
    // state, bundle_id) consumed by the Field Drilldown section in the GUI.
    rows: Array.isArray(needSet.rows) ? needSet.rows : [],
    // WHY: fields[] carries per-field history (existing_queries, domains_tried,
    // host_classes_tried, etc.) needed by the Field History panel section.
    fields,
  };

  const phase07PrimeSourcesBuiltPayload = {
    productId,
    runId,
    category,
    fields_attempted: Number(phase07PrimeSources?.summary?.fields_attempted || 0),
    fields_with_hits: Number(phase07PrimeSources?.summary?.fields_with_hits || 0),
    fields_satisfied_min_refs: Number(phase07PrimeSources?.summary?.fields_satisfied_min_refs || 0),
    refs_selected_total: Number(phase07PrimeSources?.summary?.refs_selected_total || 0),
    distinct_sources_selected: Number(phase07PrimeSources?.summary?.distinct_sources_selected || 0),
    phase07_key: phase07RunKey,
    fields: Array.isArray(phase07PrimeSources?.fields)
      ? phase07PrimeSources.fields.slice(0, 32).map((row) => ({
        field_key: row.field_key,
        min_refs_required: row.min_refs_required,
        refs_selected: row.refs_selected,
        min_refs_satisfied: row.min_refs_satisfied,
        distinct_sources_required: row.distinct_sources_required,
        distinct_sources_selected: row.distinct_sources_selected,
        top_hit_score: Number((row.hits || [])[0]?.score || 0),
      }))
      : [],
  };

  const phase08ExtractionContextBuiltPayload = {
    productId,
    runId,
    category,
    batch_count: Number(phase08Extraction?.summary?.batch_count || 0),
    batch_error_count: Number(phase08Extraction?.summary?.batch_error_count || 0),
    schema_fail_rate: Number(phase08Extraction?.summary?.schema_fail_rate || 0),
    raw_candidate_count: Number(phase08Extraction?.summary?.raw_candidate_count || 0),
    accepted_candidate_count: Number(phase08Extraction?.summary?.accepted_candidate_count || 0),
    dangling_snippet_ref_count: Number(phase08Extraction?.summary?.dangling_snippet_ref_count || 0),
    evidence_policy_violation_count: Number(phase08Extraction?.summary?.evidence_policy_violation_count || 0),
    min_refs_satisfied_count: Number(phase08Extraction?.summary?.min_refs_satisfied_count || 0),
    min_refs_total: Number(phase08Extraction?.summary?.min_refs_total || 0),
    field_context_count: Object.keys(phase08Extraction?.field_contexts || {}).length,
    prime_source_rows: Number(phase08Extraction?.prime_sources?.rows?.length || 0),
    phase08_key: phase08RunKey,
  };

  const indexingSchemaPacketsWrittenPayload = {
    productId,
    runId,
    category,
    source_packet_count: Number(indexingSchemaPackets?.sourceCollection?.source_packet_count || 0),
    source_packets_key: sourcePacketsRunKey,
    item_packet_key: itemPacketRunKey,
    run_meta_packet_key: runMetaPacketRunKey,
  };

  return {
    needsetComputedPayload,
    phase07PrimeSourcesBuiltPayload,
    phase08ExtractionContextBuiltPayload,
    indexingSchemaPacketsWrittenPayload,
  };
}
