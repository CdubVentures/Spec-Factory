import { buildProcessStartLaunchPlan } from '../../../../features/indexing/api/builders/processStartLaunchPlan.js';
import { defaultSnapshotRoot } from '../../../../core/config/runtimeArtifactRoots.js';

async function ensureGeneratedRulesPresent({ fs, generatedRulesCandidates = [] } = {}) {
  for (const rulesPath of generatedRulesCandidates) {
    try {
      await fs.access(rulesPath);
      return true;
    } catch {
      // try next candidate
    }
  }
  return false;
}

function normalizeRunStatus(status = {}, requestedRunId = '') {
  const resolvedRunId = String(status?.run_id || status?.runId || requestedRunId || '');
  return {
    ...status,
    run_id: resolvedRunId,
    runId: resolvedRunId,
  };
}

export function createInfraProcessRoutes({
  jsonRes,
  readJsonBody,
  HELPER_ROOT,
  OUTPUT_ROOT,
  INDEXLAB_ROOT,
  snapshotsDir,
  fs,
  pathApi,
  startProcess,
  stopProcess,
  processStatus,
  isProcessRunning,
  waitForProcessExit,
  buildProcessStartLaunchPlanFn = buildProcessStartLaunchPlan,
  processRef = process,
} = {}) {
  const resolvedSnapshotsDir = snapshotsDir || defaultSnapshotRoot();
  return async function handleInfraProcess(parts, _params, method, req, res) {
    if (parts[0] !== 'process') {
      return false;
    }

    if (parts[1] === 'start' && method === 'POST') {
      const body = await readJsonBody(req);
      const plan = buildProcessStartLaunchPlanFn({
        body,
        helperRoot: HELPER_ROOT,
        outputRoot: OUTPUT_ROOT,
        indexLabRoot: INDEXLAB_ROOT,
        snapshotsDir: resolvedSnapshotsDir,
        env: processRef.env,
        pathApi,
      });
      if (!plan.ok) {
        return jsonRes(res, plan.status, plan.body);
      }

      const {
        requestedRunId,
        cliArgs,
        envOverrides,
        replaceRunning,
        effectiveHelperRoot,
        generatedRulesCandidates,
      } = plan;

      const hasGeneratedRules = await ensureGeneratedRulesPresent({
        fs,
        generatedRulesCandidates,
      });
      if (!hasGeneratedRules) {
        return jsonRes(res, 409, {
          error: 'missing_generated_field_rules',
          message: `Missing generated field rules for category '${String(body?.category || 'mouse')}' under helper root '${effectiveHelperRoot}'. Expected one of: ${generatedRulesCandidates.join(', ')}`,
          field_rules_paths: generatedRulesCandidates,
          helper_root: effectiveHelperRoot,
        });
      }

      try {
        if (replaceRunning && isProcessRunning()) {
          const stopResult = await stopProcess(9000);
          // WHY: stopProcess already waits for exit internally — no redundant wait needed.
          // Previous code called waitForProcessExit(8000) which passed 8000 as the proc arg
          // (a number, not a process), causing a guaranteed 7s timeout doing nothing.
          if (!stopResult.stop_confirmed && isProcessRunning()) {
            return jsonRes(res, 409, {
              error: 'process_replace_timeout',
              message: 'Existing process did not stop in time',
            });
          }
        }

        const status = startProcess('src/app/cli/spec.js', cliArgs, envOverrides);
        return jsonRes(res, 200, normalizeRunStatus(status, requestedRunId));
      } catch (err) {
        return jsonRes(res, 409, { error: err.message });
      }
    }

    if (parts[1] === 'stop' && method === 'POST') {
      let body = {};
      try {
        body = await readJsonBody(req);
      } catch {
        body = {};
      }
      const force = Boolean(body?.force);
      const status = await stopProcess(9000, { force });
      return jsonRes(res, 200, status);
    }

    if (parts[1] === 'status' && method === 'GET') {
      return jsonRes(res, 200, processStatus());
    }

    return false;
  };
}
