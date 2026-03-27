// WHY: Store module for the `run_artifacts` table — per-run artifact payloads
// (needset, search_profile, brand_resolution) that replace mid-run JSON files (Wave 3).

export function createRunArtifactStore({ stmts }) {

  function upsertRunArtifact({ run_id, artifact_type, category, payload }) {
    stmts._upsertRunArtifact.run({
      run_id: run_id || '',
      artifact_type: artifact_type || '',
      category: category || '',
      payload: typeof payload === 'string' ? payload : JSON.stringify(payload || {}),
    });
  }

  function getRunArtifact(runId, artifactType) {
    const row = stmts._getRunArtifact.get(String(runId || ''), String(artifactType || ''));
    if (!row) return null;
    let parsed = {};
    try { parsed = JSON.parse(row.payload); } catch { /* default {} */ }
    return { ...row, payload: parsed };
  }

  function getRunArtifactsByRunId(runId) {
    return stmts._getRunArtifactsByRunId.all(String(runId || '')).map(row => {
      let parsed = {};
      try { parsed = JSON.parse(row.payload); } catch { /* default {} */ }
      return { ...row, payload: parsed };
    });
  }

  return { upsertRunArtifact, getRunArtifact, getRunArtifactsByRunId };
}
