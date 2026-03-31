export function candidateAction(page, action, candidateId) {
  return page.locator(`[data-review-action="${action}"][data-candidate-id="${candidateId}"]`).first();
}

export async function clickFirstCandidateAction(page, action, candidateIds) {
  for (const candidateId of candidateIds) {
    const button = candidateAction(page, action, candidateId);
    if ((await button.count()) > 0) {
      await button.click();
      return candidateId;
    }
  }
  throw new Error(`missing_candidate_action:${action}:${candidateIds.join(',')}`);
}
