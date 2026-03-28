/**
 * Prepared statements for SpecDb.
 * Extracted from specDb.js constructor — pure statement compilation, no logic.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {Record<string, import('better-sqlite3').Statement>}
 */
export function prepareStatements(db) {
  return {
    _insertCandidate: db.prepare(`
      INSERT OR REPLACE INTO candidates (
        candidate_id, category, product_id, field_key, value, normalized_value,
        score, rank, source_url, source_host, source_root_domain, source_tier,
        source_method, approved_domain, snippet_id, snippet_hash, snippet_text,
        quote, quote_span_start, quote_span_end, evidence_url, evidence_retrieved_at,
        is_component_field, component_type, is_list_field, llm_extract_model,
        extracted_at, run_id
      ) VALUES (
        @candidate_id, @category, @product_id, @field_key, @value, @normalized_value,
        @score, @rank, @source_url, @source_host, @source_root_domain, @source_tier,
        @source_method, @approved_domain, @snippet_id, @snippet_hash, @snippet_text,
        @quote, @quote_span_start, @quote_span_end, @evidence_url, @evidence_retrieved_at,
        @is_component_field, @component_type, @is_list_field, @llm_extract_model,
        @extracted_at, @run_id
      )
    `),

    _upsertReview: db.prepare(`
      INSERT INTO candidate_reviews (
        candidate_id, context_type, context_id, human_accepted, human_accepted_at,
        ai_review_status, ai_confidence, ai_reason, ai_reviewed_at, ai_review_model,
        human_override_ai, human_override_ai_at
      ) VALUES (
        @candidate_id, @context_type, @context_id, @human_accepted, @human_accepted_at,
        @ai_review_status, @ai_confidence, @ai_reason, @ai_reviewed_at, @ai_review_model,
        @human_override_ai, @human_override_ai_at
      )
      ON CONFLICT(candidate_id, context_type, context_id) DO UPDATE SET
        human_accepted = excluded.human_accepted,
        human_accepted_at = COALESCE(excluded.human_accepted_at, human_accepted_at),
        ai_review_status = excluded.ai_review_status,
        ai_confidence = COALESCE(excluded.ai_confidence, ai_confidence),
        ai_reason = COALESCE(excluded.ai_reason, ai_reason),
        ai_reviewed_at = COALESCE(excluded.ai_reviewed_at, ai_reviewed_at),
        ai_review_model = COALESCE(excluded.ai_review_model, ai_review_model),
        human_override_ai = excluded.human_override_ai,
        human_override_ai_at = COALESCE(excluded.human_override_ai_at, human_override_ai_at),
        updated_at = datetime('now')
    `),

    _upsertComponentIdentity: db.prepare(`
      INSERT INTO component_identity (category, component_type, canonical_name, maker, links, source)
      VALUES (@category, @component_type, @canonical_name, @maker, @links, @source)
      ON CONFLICT(category, component_type, canonical_name, maker) DO UPDATE SET
        links = COALESCE(excluded.links, links),
        source = excluded.source,
        updated_at = datetime('now')
    `),

    _insertAlias: db.prepare(`
      INSERT INTO component_aliases (component_id, alias, source)
      VALUES (@component_id, @alias, @source)
      ON CONFLICT(component_id, alias) DO NOTHING
    `),

    _upsertComponentValue: db.prepare(`
      INSERT INTO component_values (
        category, component_type, component_name, component_maker, component_identity_id, property_key,
        value, confidence, variance_policy, source, accepted_candidate_id,
        needs_review, overridden, constraints
      ) VALUES (
        @category, @component_type, @component_name, @component_maker, @component_identity_id, @property_key,
        @value, @confidence, @variance_policy, @source, @accepted_candidate_id,
        @needs_review, @overridden, @constraints
      )
      ON CONFLICT(category, component_type, component_name, component_maker, property_key) DO UPDATE SET
        component_identity_id = COALESCE(excluded.component_identity_id, component_identity_id),
        value = excluded.value,
        confidence = excluded.confidence,
        variance_policy = COALESCE(excluded.variance_policy, variance_policy),
        source = excluded.source,
        accepted_candidate_id = COALESCE(excluded.accepted_candidate_id, accepted_candidate_id),
        needs_review = excluded.needs_review,
        overridden = excluded.overridden,
        constraints = COALESCE(excluded.constraints, constraints),
        updated_at = datetime('now')
    `),

    _upsertEnumList: db.prepare(`
      INSERT INTO enum_lists (category, field_key, source)
      VALUES (@category, @field_key, @source)
      ON CONFLICT(category, field_key) DO UPDATE SET
        source = COALESCE(excluded.source, source),
        updated_at = datetime('now')
    `),

    _upsertListValue: db.prepare(`
      INSERT INTO list_values (
        category, list_id, field_key, value, normalized_value, source,
        accepted_candidate_id, enum_policy, needs_review, overridden, source_timestamp
      ) VALUES (
        @category, @list_id, @field_key, @value, @normalized_value, @source,
        @accepted_candidate_id, @enum_policy, @needs_review, @overridden, @source_timestamp
      )
      ON CONFLICT(category, field_key, value) DO UPDATE SET
        list_id = COALESCE(excluded.list_id, list_id),
        normalized_value = COALESCE(excluded.normalized_value, normalized_value),
        source = excluded.source,
        accepted_candidate_id = COALESCE(excluded.accepted_candidate_id, accepted_candidate_id),
        enum_policy = COALESCE(excluded.enum_policy, enum_policy),
        needs_review = excluded.needs_review,
        overridden = excluded.overridden,
        source_timestamp = COALESCE(excluded.source_timestamp, source_timestamp),
        updated_at = datetime('now')
    `),

    _upsertItemFieldState: db.prepare(`
      INSERT INTO item_field_state (
        category, product_id, field_key, value, confidence, source,
        accepted_candidate_id, overridden, needs_ai_review, ai_review_complete
      ) VALUES (
        @category, @product_id, @field_key, @value, @confidence, @source,
        @accepted_candidate_id, @overridden, @needs_ai_review, @ai_review_complete
      )
      ON CONFLICT(category, product_id, field_key) DO UPDATE SET
        value = excluded.value,
        confidence = excluded.confidence,
        source = excluded.source,
        accepted_candidate_id = COALESCE(excluded.accepted_candidate_id, accepted_candidate_id),
        overridden = excluded.overridden,
        needs_ai_review = excluded.needs_ai_review,
        ai_review_complete = excluded.ai_review_complete,
        updated_at = datetime('now')
    `),

    _upsertItemComponentLink: db.prepare(`
      INSERT INTO item_component_links (
        category, product_id, field_key, component_type, component_name,
        component_maker, match_type, match_score
      ) VALUES (
        @category, @product_id, @field_key, @component_type, @component_name,
        @component_maker, @match_type, @match_score
      )
      ON CONFLICT(category, product_id, field_key) DO UPDATE SET
        component_type = excluded.component_type,
        component_name = excluded.component_name,
        component_maker = COALESCE(excluded.component_maker, component_maker),
        match_type = excluded.match_type,
        match_score = excluded.match_score,
        updated_at = datetime('now')
    `),

    _upsertItemListLink: db.prepare(`
      INSERT INTO item_list_links (category, product_id, field_key, list_value_id)
      VALUES (@category, @product_id, @field_key, @list_value_id)
      ON CONFLICT(category, product_id, field_key, list_value_id) DO NOTHING
    `),

    _upsertQueueProduct: db.prepare(`
      INSERT INTO product_queue (
        category, product_id, s3key, status, priority,
        attempts_total, retry_count, max_attempts, next_retry_at, last_run_id,
        cost_usd_total, rounds_completed, next_action_hint, last_urls_attempted,
        last_error, last_started_at, last_completed_at, dirty_flags, last_summary
      ) VALUES (
        @category, @product_id, @s3key, @status, @priority,
        @attempts_total, @retry_count, @max_attempts, @next_retry_at, @last_run_id,
        @cost_usd_total, @rounds_completed, @next_action_hint, @last_urls_attempted,
        @last_error, @last_started_at, @last_completed_at, @dirty_flags, @last_summary
      )
      ON CONFLICT(category, product_id) DO UPDATE SET
        s3key = COALESCE(excluded.s3key, s3key),
        status = excluded.status,
        priority = excluded.priority,
        attempts_total = excluded.attempts_total,
        retry_count = excluded.retry_count,
        max_attempts = excluded.max_attempts,
        next_retry_at = excluded.next_retry_at,
        last_run_id = COALESCE(excluded.last_run_id, last_run_id),
        cost_usd_total = excluded.cost_usd_total,
        rounds_completed = excluded.rounds_completed,
        next_action_hint = excluded.next_action_hint,
        last_urls_attempted = excluded.last_urls_attempted,
        last_error = excluded.last_error,
        last_started_at = excluded.last_started_at,
        last_completed_at = excluded.last_completed_at,
        dirty_flags = excluded.dirty_flags,
        last_summary = excluded.last_summary,
        updated_at = datetime('now')
    `),

    _upsertProductRun: db.prepare(`
      INSERT INTO product_runs (
        category, product_id, run_id, is_latest, summary_json,
        validated, confidence, cost_usd_run, sources_attempted, run_at
      ) VALUES (
        @category, @product_id, @run_id, @is_latest, @summary_json,
        @validated, @confidence, @cost_usd_run, @sources_attempted, @run_at
      )
      ON CONFLICT(category, product_id, run_id) DO UPDATE SET
        is_latest = excluded.is_latest,
        summary_json = COALESCE(excluded.summary_json, summary_json),
        validated = excluded.validated,
        confidence = excluded.confidence,
        cost_usd_run = excluded.cost_usd_run,
        sources_attempted = excluded.sources_attempted,
        run_at = excluded.run_at
    `),

    _updateRunStorageLocation: db.prepare(`
      UPDATE product_runs SET
        storage_state = @storage_state,
        local_path = @local_path,
        s3_key = @s3_key,
        size_bytes = @size_bytes,
        relocated_at = @relocated_at
      WHERE category = @category AND product_id = @product_id AND run_id = @run_id
    `),

    _getRunStorageLocation: db.prepare(
      `SELECT run_id, storage_state, local_path, s3_key, size_bytes, relocated_at
       FROM product_runs WHERE category = ? AND product_id = ? AND run_id = ?`
    ),

    _listRunsByStorageState: db.prepare(
      `SELECT * FROM product_runs WHERE category = ? AND storage_state = ? ORDER BY run_at DESC`
    ),

    _countRunsByStorageState: db.prepare(
      `SELECT storage_state, COUNT(*) as count FROM product_runs WHERE category = ? GROUP BY storage_state`
    ),

    _upsertProduct: db.prepare(`
      INSERT INTO products (
        category, product_id, brand, model, variant, status, seed_urls, identifier
      ) VALUES (
        @category, @product_id, @brand, @model, @variant, @status, @seed_urls, @identifier
      )
      ON CONFLICT(category, product_id) DO UPDATE SET
        brand = COALESCE(excluded.brand, brand),
        model = COALESCE(excluded.model, model),
        variant = COALESCE(excluded.variant, variant),
        status = excluded.status,
        seed_urls = COALESCE(excluded.seed_urls, seed_urls),
        identifier = COALESCE(excluded.identifier, identifier),
        updated_at = datetime('now')
    `),

    _upsertLlmRoute: db.prepare(`
      INSERT INTO llm_route_matrix (
        category, scope, route_key, required_level, difficulty, availability, effort, effort_band,
        single_source_data, all_source_data, enable_websearch, model_ladder_today, all_sources_confidence_repatch, max_tokens,
        studio_key_navigation_sent_in_extract_review,
        studio_contract_rules_sent_in_extract_review,
        studio_extraction_guidance_sent_in_extract_review,
        studio_tooltip_or_description_sent_when_present,
        studio_enum_options_sent_when_present,
        studio_component_variance_constraints_sent_in_component_review,
        studio_parse_template_sent_direct_in_extract_review,
        studio_ai_mode_difficulty_effort_sent_direct_in_extract_review,
        studio_required_level_sent_in_extract_review,
        studio_component_entity_set_sent_when_component_field,
        studio_evidence_policy_sent_direct_in_extract_review,
        studio_variance_policy_sent_in_component_review,
        studio_constraints_sent_in_component_review,
        studio_send_booleans_prompted_to_model,
        scalar_linked_send, component_values_send, list_values_send,
        llm_output_min_evidence_refs_required, insufficient_evidence_action
      ) VALUES (
        @category, @scope, @route_key, @required_level, @difficulty, @availability, @effort, @effort_band,
        @single_source_data, @all_source_data, @enable_websearch, @model_ladder_today, @all_sources_confidence_repatch, @max_tokens,
        @studio_key_navigation_sent_in_extract_review,
        @studio_contract_rules_sent_in_extract_review,
        @studio_extraction_guidance_sent_in_extract_review,
        @studio_tooltip_or_description_sent_when_present,
        @studio_enum_options_sent_when_present,
        @studio_component_variance_constraints_sent_in_component_review,
        @studio_parse_template_sent_direct_in_extract_review,
        @studio_ai_mode_difficulty_effort_sent_direct_in_extract_review,
        @studio_required_level_sent_in_extract_review,
        @studio_component_entity_set_sent_when_component_field,
        @studio_evidence_policy_sent_direct_in_extract_review,
        @studio_variance_policy_sent_in_component_review,
        @studio_constraints_sent_in_component_review,
        @studio_send_booleans_prompted_to_model,
        @scalar_linked_send, @component_values_send, @list_values_send,
        @llm_output_min_evidence_refs_required, @insufficient_evidence_action
      )
      ON CONFLICT(category, route_key) DO UPDATE SET
        scope = excluded.scope,
        required_level = excluded.required_level,
        difficulty = excluded.difficulty,
        availability = excluded.availability,
        effort = excluded.effort,
        effort_band = excluded.effort_band,
        single_source_data = excluded.single_source_data,
        all_source_data = excluded.all_source_data,
        enable_websearch = excluded.enable_websearch,
        model_ladder_today = excluded.model_ladder_today,
        all_sources_confidence_repatch = excluded.all_sources_confidence_repatch,
        max_tokens = excluded.max_tokens,
        studio_key_navigation_sent_in_extract_review = excluded.studio_key_navigation_sent_in_extract_review,
        studio_contract_rules_sent_in_extract_review = excluded.studio_contract_rules_sent_in_extract_review,
        studio_extraction_guidance_sent_in_extract_review = excluded.studio_extraction_guidance_sent_in_extract_review,
        studio_tooltip_or_description_sent_when_present = excluded.studio_tooltip_or_description_sent_when_present,
        studio_enum_options_sent_when_present = excluded.studio_enum_options_sent_when_present,
        studio_component_variance_constraints_sent_in_component_review = excluded.studio_component_variance_constraints_sent_in_component_review,
        studio_parse_template_sent_direct_in_extract_review = excluded.studio_parse_template_sent_direct_in_extract_review,
        studio_ai_mode_difficulty_effort_sent_direct_in_extract_review = excluded.studio_ai_mode_difficulty_effort_sent_direct_in_extract_review,
        studio_required_level_sent_in_extract_review = excluded.studio_required_level_sent_in_extract_review,
        studio_component_entity_set_sent_when_component_field = excluded.studio_component_entity_set_sent_when_component_field,
        studio_evidence_policy_sent_direct_in_extract_review = excluded.studio_evidence_policy_sent_direct_in_extract_review,
        studio_variance_policy_sent_in_component_review = excluded.studio_variance_policy_sent_in_component_review,
        studio_constraints_sent_in_component_review = excluded.studio_constraints_sent_in_component_review,
        studio_send_booleans_prompted_to_model = excluded.studio_send_booleans_prompted_to_model,
        scalar_linked_send = excluded.scalar_linked_send,
        component_values_send = excluded.component_values_send,
        list_values_send = excluded.list_values_send,
        llm_output_min_evidence_refs_required = excluded.llm_output_min_evidence_refs_required,
        insufficient_evidence_action = excluded.insufficient_evidence_action,
        updated_at = datetime('now')
    `),

    _upsertSourceRegistry: db.prepare(`
      INSERT INTO source_registry (
        source_id, category, item_identifier, product_id, run_id, source_url,
        source_host, source_root_domain, source_tier, source_method,
        crawl_status, http_status, fetched_at
      ) VALUES (
        @source_id, @category, @item_identifier, @product_id, @run_id, @source_url,
        @source_host, @source_root_domain, @source_tier, @source_method,
        @crawl_status, @http_status, @fetched_at
      )
      ON CONFLICT(source_id) DO UPDATE SET
        source_url = excluded.source_url,
        source_host = COALESCE(excluded.source_host, source_host),
        source_root_domain = COALESCE(excluded.source_root_domain, source_root_domain),
        source_tier = COALESCE(excluded.source_tier, source_tier),
        source_method = COALESCE(excluded.source_method, source_method),
        crawl_status = COALESCE(excluded.crawl_status, crawl_status),
        http_status = COALESCE(excluded.http_status, http_status),
        fetched_at = COALESCE(excluded.fetched_at, fetched_at),
        updated_at = datetime('now')
    `),

    _insertSourceArtifact: db.prepare(`
      INSERT INTO source_artifacts (
        source_id, artifact_type, local_path, content_hash, mime_type, size_bytes
      ) VALUES (
        @source_id, @artifact_type, @local_path, @content_hash, @mime_type, @size_bytes
      )
    `),

    _upsertSourceAssertion: db.prepare(`
      INSERT INTO source_assertions (
        assertion_id, source_id, field_key, context_kind, context_ref,
        item_field_state_id, component_value_id, list_value_id, enum_list_id,
        value_raw, value_normalized, unit, candidate_id, extraction_method
      ) VALUES (
        @assertion_id, @source_id, @field_key, @context_kind, @context_ref,
        @item_field_state_id, @component_value_id, @list_value_id, @enum_list_id,
        @value_raw, @value_normalized, @unit, @candidate_id, @extraction_method
      )
      ON CONFLICT(assertion_id) DO UPDATE SET
        item_field_state_id = COALESCE(excluded.item_field_state_id, item_field_state_id),
        component_value_id = COALESCE(excluded.component_value_id, component_value_id),
        list_value_id = COALESCE(excluded.list_value_id, list_value_id),
        enum_list_id = COALESCE(excluded.enum_list_id, enum_list_id),
        value_raw = COALESCE(excluded.value_raw, value_raw),
        value_normalized = COALESCE(excluded.value_normalized, value_normalized),
        unit = COALESCE(excluded.unit, unit),
        extraction_method = COALESCE(excluded.extraction_method, extraction_method),
        updated_at = datetime('now')
    `),

    _insertSourceEvidenceRef: db.prepare(`
      INSERT INTO source_evidence_refs (
        assertion_id, evidence_url, snippet_id, quote, method, tier, retrieved_at
      ) VALUES (
        @assertion_id, @evidence_url, @snippet_id, @quote, @method, @tier, @retrieved_at
      )
    `),

    _insertKeyReviewState: db.prepare(`
      INSERT INTO key_review_state (
        category, target_kind, item_identifier, field_key, enum_value_norm,
        component_identifier, property_key,
        item_field_state_id, component_value_id, component_identity_id, list_value_id, enum_list_id,
        required_level, availability, difficulty, effort, ai_mode, parse_template,
        evidence_policy, min_evidence_refs_effective, min_distinct_sources_required,
        send_mode, component_send_mode, list_send_mode,
        selected_value, selected_candidate_id, confidence_score, confidence_level,
        flagged_at, resolved_at,
        ai_confirm_primary_status, ai_confirm_primary_confidence, ai_confirm_primary_at,
        ai_confirm_primary_interrupted, ai_confirm_primary_error,
        ai_confirm_shared_status, ai_confirm_shared_confidence, ai_confirm_shared_at,
        ai_confirm_shared_interrupted, ai_confirm_shared_error,
        user_accept_primary_status, user_accept_primary_at, user_accept_primary_by,
        user_accept_shared_status, user_accept_shared_at, user_accept_shared_by,
        user_override_ai_primary, user_override_ai_primary_at, user_override_ai_primary_reason,
        user_override_ai_shared, user_override_ai_shared_at, user_override_ai_shared_reason
      ) VALUES (
        @category, @target_kind, @item_identifier, @field_key, @enum_value_norm,
        @component_identifier, @property_key,
        @item_field_state_id, @component_value_id, @component_identity_id, @list_value_id, @enum_list_id,
        @required_level, @availability, @difficulty, @effort, @ai_mode, @parse_template,
        @evidence_policy, @min_evidence_refs_effective, @min_distinct_sources_required,
        @send_mode, @component_send_mode, @list_send_mode,
        @selected_value, @selected_candidate_id, @confidence_score, @confidence_level,
        @flagged_at, @resolved_at,
        @ai_confirm_primary_status, @ai_confirm_primary_confidence, @ai_confirm_primary_at,
        @ai_confirm_primary_interrupted, @ai_confirm_primary_error,
        @ai_confirm_shared_status, @ai_confirm_shared_confidence, @ai_confirm_shared_at,
        @ai_confirm_shared_interrupted, @ai_confirm_shared_error,
        @user_accept_primary_status, @user_accept_primary_at, @user_accept_primary_by,
        @user_accept_shared_status, @user_accept_shared_at, @user_accept_shared_by,
        @user_override_ai_primary, @user_override_ai_primary_at, @user_override_ai_primary_reason,
        @user_override_ai_shared, @user_override_ai_shared_at, @user_override_ai_shared_reason
      )
    `),

    _insertKeyReviewRun: db.prepare(`
      INSERT INTO key_review_runs (
        key_review_state_id, stage, status, provider, model_used, prompt_hash,
        response_schema_version, input_tokens, output_tokens, latency_ms,
        cost_usd, error, started_at, finished_at
      ) VALUES (
        @key_review_state_id, @stage, @status, @provider, @model_used, @prompt_hash,
        @response_schema_version, @input_tokens, @output_tokens, @latency_ms,
        @cost_usd, @error, @started_at, @finished_at
      )
    `),

    _insertKeyReviewRunSource: db.prepare(`
      INSERT INTO key_review_run_sources (
        key_review_run_id, assertion_id, packet_role, position
      ) VALUES (
        @key_review_run_id, @assertion_id, @packet_role, @position
      )
    `),

    _insertKeyReviewAudit: db.prepare(`
      INSERT INTO key_review_audit (
        key_review_state_id, event_type, actor_type, actor_id,
        old_value, new_value, reason
      ) VALUES (
        @key_review_state_id, @event_type, @actor_type, @actor_id,
        @old_value, @new_value, @reason
      )
    `),

    _insertBillingEntry: db.prepare(`
      INSERT INTO billing_entries (
        ts, month, day, provider, model, category, product_id, run_id, round,
        prompt_tokens, completion_tokens, cached_prompt_tokens, total_tokens,
        cost_usd, reason, host, url_count, evidence_chars, estimated_usage, meta
      ) VALUES (
        @ts, @month, @day, @provider, @model, @category, @product_id, @run_id, @round,
        @prompt_tokens, @completion_tokens, @cached_prompt_tokens, @total_tokens,
        @cost_usd, @reason, @host, @url_count, @evidence_chars, @estimated_usage, @meta
      )
    `),

    _insertMetric: db.prepare(`
      INSERT INTO metrics (ts, metric_type, name, value, labels)
      VALUES (@ts, @metric_type, @name, @value, @labels)
    `),

    _upsertLlmCache: db.prepare(`
      INSERT OR REPLACE INTO llm_cache (cache_key, response, timestamp, ttl)
      VALUES (@cache_key, @response, @timestamp, @ttl)
    `),

    _getLlmCache: db.prepare(
      'SELECT response, timestamp, ttl FROM llm_cache WHERE cache_key = ?'
    ),

    _evictExpiredCache: db.prepare(
      'DELETE FROM llm_cache WHERE (timestamp + ttl) < ?'
    ),

    _upsertLearningProfile: db.prepare(`
      INSERT OR REPLACE INTO learning_profiles (
        profile_id, category, brand, model, variant,
        runs_total, validated_runs, validated,
        unknown_field_rate, unknown_field_rate_avg, parser_health_avg,
        preferred_urls, feedback_urls, uncertain_fields,
        host_stats, critical_fields_below, last_run, parser_health, updated_at
      ) VALUES (
        @profile_id, @category, @brand, @model, @variant,
        @runs_total, @validated_runs, @validated,
        @unknown_field_rate, @unknown_field_rate_avg, @parser_health_avg,
        @preferred_urls, @feedback_urls, @uncertain_fields,
        @host_stats, @critical_fields_below, @last_run, @parser_health, @updated_at
      )
    `),

    _upsertCategoryBrain: db.prepare(`
      INSERT OR REPLACE INTO category_brain (category, artifact_name, payload, updated_at)
      VALUES (@category, @artifact_name, @payload, @updated_at)
    `),

    _upsertSourceCorpus: db.prepare(`
      INSERT OR REPLACE INTO source_corpus (
        url, category, host, root_domain, path, title, snippet, tier, role,
        fields, methods, identity_match, approved_domain, brand, model_name, variant,
        first_seen_at, last_seen_at
      ) VALUES (
        @url, @category, @host, @root_domain, @path, @title, @snippet, @tier, @role,
        @fields, @methods, @identity_match, @approved_domain, @brand, @model_name, @variant,
        @first_seen_at, @last_seen_at
      )
    `),

    _upsertDataAuthoritySync: db.prepare(`
      INSERT INTO data_authority_sync (
        category, specdb_sync_version, last_sync_status, last_sync_at, last_sync_meta
      ) VALUES (
        @category, @specdb_sync_version, @last_sync_status, @last_sync_at, @last_sync_meta
      )
      ON CONFLICT(category) DO UPDATE SET
        specdb_sync_version = excluded.specdb_sync_version,
        last_sync_status = excluded.last_sync_status,
        last_sync_at = excluded.last_sync_at,
        last_sync_meta = excluded.last_sync_meta
    `),

    _getDataAuthoritySync: db.prepare(`
      SELECT category, specdb_sync_version, last_sync_status, last_sync_at, last_sync_meta
      FROM data_authority_sync
      WHERE category = ?
      LIMIT 1
    `),

    _insertRuntimeEvent: db.prepare(`
      INSERT INTO runtime_events (ts, level, event, category, product_id, run_id, data)
      VALUES (@ts, @level, @event, @category, @product_id, @run_id, @data)
    `),

    _insertBridgeEvent: db.prepare(`
      INSERT INTO bridge_events (run_id, category, product_id, ts, stage, event, payload)
      VALUES (@run_id, @category, @product_id, @ts, @stage, @event, @payload)
    `),

    _getBridgeEventsByRunId: db.prepare(`
      SELECT run_id, category, product_id, ts, stage, event, payload
      FROM bridge_events
      WHERE run_id = ?
      ORDER BY id DESC
      LIMIT ?
    `),

    // WHY: Wave 5.5 — slimmed from 22 to 13 columns. GUI telemetry now in run-summary.json.
    _upsertRun: db.prepare(`
      INSERT INTO runs (
        run_id, category, product_id, status, started_at, ended_at,
        phase_cursor,
        identity_fingerprint, identity_lock_status, dedupe_mode,
        s3key, out_root, counters,
        updated_at
      ) VALUES (
        @run_id, @category, @product_id, @status, @started_at, @ended_at,
        @phase_cursor,
        @identity_fingerprint, @identity_lock_status, @dedupe_mode,
        @s3key, @out_root, @counters,
        datetime('now')
      )
      ON CONFLICT(run_id) DO UPDATE SET
        category = excluded.category,
        product_id = excluded.product_id,
        status = excluded.status,
        started_at = excluded.started_at,
        ended_at = excluded.ended_at,
        phase_cursor = excluded.phase_cursor,
        identity_fingerprint = excluded.identity_fingerprint,
        identity_lock_status = excluded.identity_lock_status,
        dedupe_mode = excluded.dedupe_mode,
        s3key = excluded.s3key,
        out_root = excluded.out_root,
        counters = excluded.counters,
        updated_at = datetime('now')
    `),

    _getRunByRunId: db.prepare(`
      SELECT * FROM runs WHERE run_id = ?
    `),

    _getRunsByCategory: db.prepare(`
      SELECT * FROM runs WHERE category = ? ORDER BY created_at DESC, id DESC LIMIT ?
    `),

    _upsertRunArtifact: db.prepare(`
      INSERT INTO run_artifacts (run_id, artifact_type, category, payload, updated_at)
      VALUES (@run_id, @artifact_type, @category, @payload, datetime('now'))
      ON CONFLICT(run_id, artifact_type) DO UPDATE SET
        category = excluded.category,
        payload = excluded.payload,
        updated_at = datetime('now')
    `),

    _getRunArtifact: db.prepare(`
      SELECT * FROM run_artifacts WHERE run_id = ? AND artifact_type = ?
    `),

    _getRunArtifactsByRunId: db.prepare(`
      SELECT * FROM run_artifacts WHERE run_id = ? ORDER BY artifact_type
    `),

    _upsertFieldHistory: db.prepare(`
      INSERT INTO field_history (category, product_id, field_key, round, run_id, history_json, updated_at)
      VALUES (@category, @product_id, @field_key, @round, @run_id, @history_json, CURRENT_TIMESTAMP)
      ON CONFLICT(category, product_id, field_key)
      DO UPDATE SET round = excluded.round, run_id = excluded.run_id, history_json = excluded.history_json, updated_at = CURRENT_TIMESTAMP
    `),

    _getFieldHistories: db.prepare(`
      SELECT field_key, history_json FROM field_history WHERE category = @category AND product_id = @product_id
    `),

    _deleteFieldHistories: db.prepare(`
      DELETE FROM field_history WHERE category = @category AND product_id = @product_id
    `),

    // --- Artifact store (crawl_sources, source_screenshots, source_pdfs) ---

    _insertCrawlSource: db.prepare(`
      INSERT OR REPLACE INTO crawl_sources (
        content_hash, category, product_id, run_id, source_url, final_url,
        host, http_status, doc_kind, source_tier, content_type, size_bytes,
        file_path, has_screenshot, has_pdf, has_ldjson, has_dom_snippet, crawled_at
      ) VALUES (
        @content_hash, @category, @product_id, @run_id, @source_url, @final_url,
        @host, @http_status, @doc_kind, @source_tier, @content_type, @size_bytes,
        @file_path, @has_screenshot, @has_pdf, @has_ldjson, @has_dom_snippet, @crawled_at
      )
    `),

    _insertScreenshot: db.prepare(`
      INSERT OR REPLACE INTO source_screenshots (
        screenshot_id, content_hash, category, product_id, run_id, source_url,
        host, selector, format, width, height, size_bytes,
        file_path, captured_at, doc_kind, source_tier
      ) VALUES (
        @screenshot_id, @content_hash, @category, @product_id, @run_id, @source_url,
        @host, @selector, @format, @width, @height, @size_bytes,
        @file_path, @captured_at, @doc_kind, @source_tier
      )
    `),

    _insertPdf: db.prepare(`
      INSERT OR REPLACE INTO source_pdfs (
        pdf_id, content_hash, parent_content_hash, category, product_id, run_id,
        source_url, host, filename, size_bytes, file_path,
        pages_scanned, tables_found, pair_count, crawled_at
      ) VALUES (
        @pdf_id, @content_hash, @parent_content_hash, @category, @product_id, @run_id,
        @source_url, @host, @filename, @size_bytes, @file_path,
        @pages_scanned, @tables_found, @pair_count, @crawled_at
      )
    `),

    _getCrawlSourcesByProduct: db.prepare(`
      SELECT * FROM crawl_sources WHERE product_id = ? ORDER BY crawled_at DESC
    `),

    _getScreenshotsByProduct: db.prepare(`
      SELECT * FROM source_screenshots WHERE product_id = ? ORDER BY captured_at DESC
    `),

    _insertVideo: db.prepare(`
      INSERT OR REPLACE INTO source_videos (
        video_id, content_hash, category, product_id, run_id, source_url,
        host, worker_id, format, width, height, size_bytes,
        duration_ms, file_path, captured_at
      ) VALUES (
        @video_id, @content_hash, @category, @product_id, @run_id, @source_url,
        @host, @worker_id, @format, @width, @height, @size_bytes,
        @duration_ms, @file_path, @captured_at
      )
    `),

    _getVideosByProduct: db.prepare(`
      SELECT * FROM source_videos WHERE product_id = ? ORDER BY captured_at DESC
    `),

    _getCrawlSourceByHash: db.prepare(`
      SELECT * FROM crawl_sources WHERE content_hash = ? AND product_id = ?
    `),

    // Telemetry indexes
    _insertKnobSnapshot: db.prepare(`
      INSERT INTO knob_snapshots (category, run_id, ts, mismatch_count, total_knobs, entries)
      VALUES (@category, @run_id, @ts, @mismatch_count, @total_knobs, @entries)
    `),
    _getKnobSnapshots: db.prepare(`
      SELECT * FROM knob_snapshots WHERE category = ? ORDER BY ts DESC LIMIT ?
    `),
    _insertQueryIndexEntry: db.prepare(`
      INSERT INTO query_index (category, run_id, product_id, query, provider, result_count, field_yield, ts)
      VALUES (@category, @run_id, @product_id, @query, @provider, @result_count, @field_yield, @ts)
    `),
    _getQueryIndexByCategory: db.prepare(`
      SELECT * FROM query_index WHERE category = ? ORDER BY ts DESC LIMIT ?
    `),
    _insertUrlIndexEntry: db.prepare(`
      INSERT INTO url_index (category, run_id, url, host, tier, doc_kind, fields_filled, fetch_success, ts)
      VALUES (@category, @run_id, @url, @host, @tier, @doc_kind, @fields_filled, @fetch_success, @ts)
    `),
    _getUrlIndexByCategory: db.prepare(`
      SELECT * FROM url_index WHERE category = ? ORDER BY ts DESC LIMIT ?
    `),
    _insertPromptIndexEntry: db.prepare(`
      INSERT INTO prompt_index (category, run_id, prompt_version, model, token_count, success, ts)
      VALUES (@category, @run_id, @prompt_version, @model, @token_count, @success, @ts)
    `),
    _getPromptIndexByCategory: db.prepare(`
      SELECT * FROM prompt_index WHERE category = ? ORDER BY ts DESC LIMIT ?
    `),
  };
}
