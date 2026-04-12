/**
 * Prepared statements for SpecDb.
 * Extracted from specDb.js constructor — pure statement compilation, no logic.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {Record<string, import('better-sqlite3').Statement>}
 */
export function prepareStatements(db) {
  return {
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
        value, unit, confidence, variance_policy, source, accepted_candidate_id,
        needs_review, overridden, constraints
      ) VALUES (
        @category, @component_type, @component_name, @component_maker, @component_identity_id, @property_key,
        @value, @unit, @confidence, @variance_policy, @source, @accepted_candidate_id,
        @needs_review, @overridden, @constraints
      )
      ON CONFLICT(category, component_type, component_name, component_maker, property_key) DO UPDATE SET
        component_identity_id = COALESCE(excluded.component_identity_id, component_identity_id),
        value = excluded.value,
        unit = COALESCE(excluded.unit, unit),
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

    _upsertProduct: db.prepare(`
      INSERT INTO products (
        category, product_id, brand, model, base_model, variant, status, identifier, brand_identifier
      ) VALUES (
        @category, @product_id, @brand, @model, @base_model, @variant, @status, @identifier, @brand_identifier
      )
      ON CONFLICT(category, product_id) DO UPDATE SET
        brand = COALESCE(excluded.brand, brand),
        model = COALESCE(excluded.model, model),
        base_model = COALESCE(NULLIF(excluded.base_model, ''), base_model),
        variant = COALESCE(excluded.variant, variant),
        status = excluded.status,
        identifier = COALESCE(excluded.identifier, identifier),
        brand_identifier = COALESCE(NULLIF(excluded.brand_identifier, ''), brand_identifier),
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
        stage_cursor,
        identity_fingerprint, identity_lock_status, dedupe_mode,
        s3key, out_root, counters,
        updated_at
      ) VALUES (
        @run_id, @category, @product_id, @status, @started_at, @ended_at,
        @stage_cursor,
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
        stage_cursor = excluded.stage_cursor,
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

    // --- Artifact store (crawl_sources, source_screenshots, source_videos) ---

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
      INSERT INTO query_index (category, run_id, product_id, query, provider, result_count, field_yield, tier, ts)
      VALUES (@category, @run_id, @product_id, @query, @provider, @result_count, @field_yield, @tier, @ts)
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
    // URL crawl ledger
    _upsertUrlCrawlEntry: db.prepare(`
      INSERT INTO url_crawl_ledger (
        canonical_url, product_id, category, original_url, domain, path_sig,
        final_url, content_hash, content_type, http_status, bytes, elapsed_ms,
        fetch_count, ok_count, blocked_count, timeout_count, server_error_count,
        redirect_count, notfound_count, gone_count,
        first_seen_ts, last_seen_ts, first_seen_run_id, last_seen_run_id
      ) VALUES (
        @canonical_url, @product_id, @category, @original_url, @domain, @path_sig,
        @final_url, @content_hash, @content_type, @http_status, @bytes, @elapsed_ms,
        @fetch_count, @ok_count, @blocked_count, @timeout_count, @server_error_count,
        @redirect_count, @notfound_count, @gone_count,
        @first_seen_ts, @last_seen_ts, @first_seen_run_id, @last_seen_run_id
      )
      ON CONFLICT(canonical_url, product_id) DO UPDATE SET
        final_url = excluded.final_url,
        content_hash = CASE WHEN excluded.content_hash != '' THEN excluded.content_hash ELSE url_crawl_ledger.content_hash END,
        content_type = CASE WHEN excluded.content_type != '' THEN excluded.content_type ELSE url_crawl_ledger.content_type END,
        http_status = excluded.http_status,
        bytes = excluded.bytes,
        elapsed_ms = excluded.elapsed_ms,
        fetch_count = url_crawl_ledger.fetch_count + excluded.fetch_count,
        ok_count = url_crawl_ledger.ok_count + excluded.ok_count,
        blocked_count = url_crawl_ledger.blocked_count + excluded.blocked_count,
        timeout_count = url_crawl_ledger.timeout_count + excluded.timeout_count,
        server_error_count = url_crawl_ledger.server_error_count + excluded.server_error_count,
        redirect_count = url_crawl_ledger.redirect_count + excluded.redirect_count,
        notfound_count = url_crawl_ledger.notfound_count + excluded.notfound_count,
        gone_count = url_crawl_ledger.gone_count + excluded.gone_count,
        last_seen_ts = excluded.last_seen_ts,
        last_seen_run_id = excluded.last_seen_run_id
    `),
    _getUrlCrawlEntry: db.prepare(`
      SELECT * FROM url_crawl_ledger WHERE canonical_url = ? AND product_id = ?
    `),
    _getUrlCrawlEntriesByProduct: db.prepare(`
      SELECT * FROM url_crawl_ledger WHERE product_id = ? ORDER BY last_seen_ts DESC
    `),
    _aggregateDomainStats: db.prepare(`
      SELECT
        domain,
        SUM(fetch_count) AS fetch_count,
        SUM(ok_count) AS ok_count,
        SUM(blocked_count) AS blocked_count,
        SUM(timeout_count) AS timeout_count,
        SUM(server_error_count) AS server_error_count,
        CASE WHEN SUM(fetch_count) > 0 THEN CAST(SUM(ok_count) AS REAL) / SUM(fetch_count) ELSE 0 END AS success_rate,
        CASE WHEN SUM(fetch_count) > 0 THEN SUM(elapsed_ms) / SUM(fetch_count) ELSE 0 END AS avg_latency_ms,
        MAX(last_seen_ts) AS last_seen_ts
      FROM url_crawl_ledger
      WHERE domain = ? AND product_id = ?
      GROUP BY domain
    `),

    // Query cooldowns
    _upsertQueryCooldown: db.prepare(`
      INSERT INTO query_cooldowns (
        query_hash, product_id, category, query_text, provider,
        tier, group_key, normalized_key, hint_source,
        attempt_count, result_count, last_executed_at, cooldown_until
      ) VALUES (
        @query_hash, @product_id, @category, @query_text, @provider,
        @tier, @group_key, @normalized_key, @hint_source,
        @attempt_count, @result_count, @last_executed_at, @cooldown_until
      )
      ON CONFLICT(query_hash, product_id) DO UPDATE SET
        provider = excluded.provider,
        tier = COALESCE(excluded.tier, query_cooldowns.tier),
        group_key = COALESCE(excluded.group_key, query_cooldowns.group_key),
        normalized_key = COALESCE(excluded.normalized_key, query_cooldowns.normalized_key),
        hint_source = COALESCE(excluded.hint_source, query_cooldowns.hint_source),
        attempt_count = query_cooldowns.attempt_count + excluded.attempt_count,
        result_count = excluded.result_count,
        last_executed_at = excluded.last_executed_at,
        cooldown_until = excluded.cooldown_until
    `),
    _getQueryCooldown: db.prepare(`
      SELECT * FROM query_cooldowns WHERE query_hash = ? AND product_id = ? AND cooldown_until > ?
    `),
    _getQueryCooldownRaw: db.prepare(`
      SELECT * FROM query_cooldowns WHERE query_hash = ? AND product_id = ?
    `),
    _getQueryCooldownsByProduct: db.prepare(`
      SELECT * FROM query_cooldowns WHERE product_id = ? ORDER BY last_executed_at DESC
    `),
    _purgeExpiredCooldowns: db.prepare(`
      DELETE FROM query_cooldowns WHERE cooldown_until <= ?
    `),

    // Field studio map (per-category control-plane config)
    _getFieldStudioMap: db.prepare(
      'SELECT map_json, map_hash, compiled_rules, boot_config, updated_at FROM field_studio_map WHERE id = 1'
    ),
    // WHY: only bump updated_at when the hash actually changes — the compile
    // re-sync (compileProcessCompletion) upserts the normalized map after every
    // compile, and unconditionally bumping updated_at would always set it AFTER
    // manifest.generated_at, making the compileStale indicator permanently orange.
    _upsertFieldStudioMap: db.prepare(`
      INSERT INTO field_studio_map (id, map_json, map_hash, updated_at)
      VALUES (1, @map_json, @map_hash, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        map_json = excluded.map_json,
        map_hash = excluded.map_hash,
        updated_at = CASE
          WHEN field_studio_map.map_hash != excluded.map_hash THEN datetime('now')
          ELSE field_studio_map.updated_at
        END
    `),
    // WHY: Separate statement so compile/reseed can update compiled_rules + boot_config
    // without touching map_json/map_hash/updated_at (those are studio-edit concerns).
    _upsertCompiledRules: db.prepare(`
      INSERT INTO field_studio_map (id, compiled_rules, boot_config)
      VALUES (1, @compiled_rules, @boot_config)
      ON CONFLICT(id) DO UPDATE SET
        compiled_rules = excluded.compiled_rules,
        boot_config = excluded.boot_config
    `),

    _getFieldKeyOrder: db.prepare(
      'SELECT order_json, updated_at FROM field_key_order WHERE category = ?'
    ),
    _setFieldKeyOrder: db.prepare(`
      INSERT INTO field_key_order (category, order_json, updated_at)
      VALUES (@category, @order_json, datetime('now'))
      ON CONFLICT(category) DO UPDATE SET
        order_json = excluded.order_json,
        updated_at = datetime('now')
    `),
    _deleteFieldKeyOrder: db.prepare(
      'DELETE FROM field_key_order WHERE category = ?'
    ),

    // --- Color & Edition Finder ---
    _upsertColorEditionFinder: db.prepare(`
      INSERT INTO color_edition_finder (
        category, product_id, colors, editions, default_color,
        cooldown_until, latest_ran_at, run_count
      ) VALUES (
        @category, @product_id, @colors, @editions, @default_color,
        @cooldown_until, @latest_ran_at, @run_count
      )
      ON CONFLICT(category, product_id) DO UPDATE SET
        colors = excluded.colors,
        editions = excluded.editions,
        default_color = excluded.default_color,
        cooldown_until = excluded.cooldown_until,
        latest_ran_at = excluded.latest_ran_at,
        run_count = excluded.run_count
    `),
    _getColorEditionFinder: db.prepare(
      'SELECT * FROM color_edition_finder WHERE category = ? AND product_id = ?'
    ),
    _listColorEditionFinderByCategory: db.prepare(
      'SELECT * FROM color_edition_finder WHERE category = ? ORDER BY product_id'
    ),
    _getColorEditionFinderOnCooldown: db.prepare(
      'SELECT * FROM color_edition_finder WHERE category = ? AND product_id = ? AND cooldown_until > ?'
    ),
    _deleteColorEditionFinder: db.prepare(
      'DELETE FROM color_edition_finder WHERE category = ? AND product_id = ?'
    ),

    // --- Color & Edition Finder Runs ---
    _insertColorEditionFinderRun: db.prepare(`
      INSERT INTO color_edition_finder_runs (
        category, product_id, run_number, ran_at, model,
        fallback_used, cooldown_until, selected_json, prompt_json, response_json
      ) VALUES (
        @category, @product_id, @run_number, @ran_at, @model,
        @fallback_used, @cooldown_until, @selected_json, @prompt_json, @response_json
      )
      ON CONFLICT(category, product_id, run_number) DO UPDATE SET
        ran_at = excluded.ran_at, model = excluded.model,
        fallback_used = excluded.fallback_used, cooldown_until = excluded.cooldown_until,
        selected_json = excluded.selected_json, prompt_json = excluded.prompt_json,
        response_json = excluded.response_json
    `),
    _listColorEditionFinderRuns: db.prepare(
      'SELECT * FROM color_edition_finder_runs WHERE category = ? AND product_id = ? ORDER BY run_number ASC'
    ),
    _getLatestColorEditionFinderRun: db.prepare(
      'SELECT * FROM color_edition_finder_runs WHERE category = ? AND product_id = ? ORDER BY run_number DESC LIMIT 1'
    ),
    _deleteColorEditionFinderRunByNumber: db.prepare(
      'DELETE FROM color_edition_finder_runs WHERE category = ? AND product_id = ? AND run_number = ?'
    ),
    _deleteAllColorEditionFinderRuns: db.prepare(
      'DELETE FROM color_edition_finder_runs WHERE category = ? AND product_id = ?'
    ),

    // --- Field Candidates ---

    _upsertFieldCandidate: db.prepare(`
      INSERT INTO field_candidates (
        category, product_id, field_key, value, unit,
        confidence, source_count, sources_json, validation_json, metadata_json, status
      ) VALUES (
        @category, @product_id, @field_key, @value, @unit,
        @confidence, @source_count, @sources_json, @validation_json, @metadata_json, @status
      )
      ON CONFLICT(category, product_id, field_key, value) DO UPDATE SET
        confidence = MAX(excluded.confidence, field_candidates.confidence),
        unit = COALESCE(excluded.unit, unit),
        source_count = excluded.source_count,
        sources_json = excluded.sources_json,
        validation_json = excluded.validation_json,
        metadata_json = excluded.metadata_json,
        status = excluded.status,
        updated_at = datetime('now')
    `),
    _getFieldCandidate: db.prepare(
      'SELECT * FROM field_candidates WHERE category = ? AND product_id = ? AND field_key = ? AND value = ?'
    ),
    _getFieldCandidatesByProductAndField: db.prepare(
      'SELECT * FROM field_candidates WHERE category = ? AND product_id = ? AND field_key = ? ORDER BY confidence DESC'
    ),
    _getAllFieldCandidatesByProduct: db.prepare(
      'SELECT * FROM field_candidates WHERE category = ? AND product_id = ? ORDER BY field_key, confidence DESC'
    ),
    _deleteFieldCandidatesByProduct: db.prepare(
      'DELETE FROM field_candidates WHERE category = ? AND product_id = ?'
    ),
    _deleteFieldCandidatesByProductAndField: db.prepare(
      'DELETE FROM field_candidates WHERE category = ? AND product_id = ? AND field_key = ?'
    ),

    // --- Field Candidates — paginated (publisher GUI) ---

    _getFieldCandidatesPaginated: db.prepare(`
      SELECT fc.*, p.brand, p.model, p.variant
      FROM field_candidates fc
      LEFT JOIN products p ON fc.product_id = p.product_id AND fc.category = p.category
      WHERE fc.category = ?
      ORDER BY fc.submitted_at DESC
      LIMIT ? OFFSET ?
    `),

    _countFieldCandidates: db.prepare(
      'SELECT COUNT(*) AS total FROM field_candidates WHERE category = ?'
    ),

    _getFieldCandidatesStats: db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved,
        SUM(CASE WHEN status = 'candidate' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN json_array_length(json_extract(validation_json, '$.repairs')) > 0 THEN 1 ELSE 0 END) AS repaired,
        COUNT(DISTINCT product_id) AS products
      FROM field_candidates WHERE category = ?
    `),
  };
}
