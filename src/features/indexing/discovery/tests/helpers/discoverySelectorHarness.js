// WHY: Discovery integration tests share the same LLM-only SERP selector mock.
// Keeping it in one place prevents response-shape drift across files.
export function buildMockSerpSelectorResponse(requestBody) {
  let input;
  try {
    const parsed = JSON.parse(requestBody);
    const userMsg = parsed?.messages?.find((message) => message.role === 'user');
    input = JSON.parse(userMsg?.content || '{}');
  } catch {
    input = { candidates: [] };
  }

  const candidates = Array.isArray(input?.candidates) ? input.candidates : [];
  const maxKeep = input?.selection_limits?.max_total_keep || 60;
  const approvedIds = candidates.slice(0, maxKeep).map((candidate) => candidate.id);
  const rejectIds = candidates.slice(maxKeep).map((candidate) => candidate.id);
  const results = candidates.map((candidate, index) => ({
    id: candidate.id,
    decision: index < maxKeep ? 'approved' : 'reject',
    score: index < maxKeep ? 0.8 : 0.1,
    confidence: index < maxKeep ? 'high' : 'low',
    fetch_rank: index < maxKeep ? index + 1 : null,
    page_type: candidate.page_type_hint || 'unknown',
    authority_bucket: candidate.pinned ? 'official' : 'unknown',
    likely_field_keys: [],
    reason_code: index < maxKeep ? 'relevant' : 'low_signal',
    reason: index < maxKeep ? 'mock approved' : 'mock rejected',
  }));

  const selectorOutput = {
    schema_version: 'serp_selector_output.v1',
    keep_ids: [...approvedIds],
    approved_ids: approvedIds,
    candidate_ids: [],
    reject_ids: rejectIds,
    results,
    summary: {
      input_count: candidates.length,
      approved_count: approvedIds.length,
      candidate_count: 0,
      reject_count: rejectIds.length,
    },
  };

  return {
    choices: [{
      message: { content: JSON.stringify(selectorOutput) },
    }],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    model: 'mock-selector',
  };
}

export function isLlmEndpoint(url) {
  return String(url || '').includes('/v1/chat/completions');
}
