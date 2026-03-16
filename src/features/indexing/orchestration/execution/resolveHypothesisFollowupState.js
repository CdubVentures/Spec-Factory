export function resolveHypothesisFollowupState({
  followupResult = {},
} = {}) {
  return {
    hypothesisFollowupRoundsExecuted: followupResult.hypothesisFollowupRoundsExecuted,
    hypothesisFollowupSeededUrls: followupResult.hypothesisFollowupSeededUrls,
  };
}
