import { toInt, toFloat } from '../shared/valueNormalizers.js';

function unwrapPayload(row) {
  if (!row) return {};
  const p = row.payload && typeof row.payload === 'object' ? row.payload : {};
  return { ...p, ...row, payload: undefined };
}

export function buildRoundSummaryFromEvents(events) {
  const rows = Array.isArray(events) ? events : [];

  const runCompleted = rows.find((r) => r?.event === 'run_completed');
  if (runCompleted) {
    const rc = unwrapPayload(runCompleted);
    const needsetRow = rows.find((r) => r?.event === 'needset_computed');
    const nd = unwrapPayload(needsetRow);
    const missingRequired = Array.isArray(rc.missing_required_fields)
      ? rc.missing_required_fields
      : [];
    const criticalBelow = Array.isArray(rc.critical_fields_below_pass_target)
      ? rc.critical_fields_below_pass_target
      : [];

    return {
      rounds: [{
        round: 0,
        needset_size: toInt(nd.needset_size, 0),
        missing_required_count: missingRequired.length,
        critical_count: criticalBelow.length,
        confidence: toFloat(rc.confidence, 0),
        validated: Boolean(rc.validated),
        improved: false,
        improvement_reasons: []
      }],
      stop_reason: null,
      round_count: 1
    };
  }

  return {
    rounds: [],
    stop_reason: null,
    round_count: 0
  };
}
