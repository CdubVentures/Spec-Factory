# Review Override Workflow Test Audit

Scope: `src/features/review/domain/tests/reviewOverrideWorkflow.test.js`

Disposition:

| Original block | Bucket | Why | Replacement / destination | Final disposition |
| --- | --- | --- | --- | --- |
| `setOverrideFromCandidate writes helper override file and finalize applies it to latest artifacts` | COLLAPSE | Mixed candidate-write, preview-finalize, and finalize-apply contracts into one setup-heavy test. | `reviewOverrideCandidateContracts.test.js`; `reviewOverrideFinalizeContracts.test.js` | Preserved as smaller contract tests |
| `setOverrideFromCandidate accepts synthetic candidates when candidateValue is provided` | KEEP | Protects the synthetic-candidate acceptance path used by review mutation flows. | `reviewOverrideCandidateContracts.test.js` | Preserved |
| `finalizeOverrides demotes invalid override values through runtime engine gate` | KEEP | Guards the runtime validation gate that prevents invalid finalized overrides. | `reviewOverrideFinalizeContracts.test.js` | Preserved |
| `readReviewArtifacts returns safe defaults when review files do not exist` | KEEP | Protects the safe-default artifact contract when review outputs are missing. | `reviewOverrideArtifactsContracts.test.js` | Preserved |
| `setManualOverride requires evidence and writes canonical manual override candidate id` | COLLAPSE | Mixed validation and persistence/id-shape contracts in one test. | `reviewManualOverrideContracts.test.js` | Preserved as smaller contract tests |
| `approveGreenOverrides writes candidate overrides only for green known fields` | KEEP | Protects bulk approval filtering and override write behavior. | `reviewOverrideApprovalContracts.test.js` | Preserved |
| `buildReviewMetrics reports throughput and override ratios from override docs` | KEEP | Public metrics contract consumed by CLI and analytics surfaces. | `reviewOverrideMetricsContracts.test.js` | Preserved |

Proof log:

| Step | Result |
| --- | --- |
| Targeted review-override tests | `node --test src/features/review/domain/tests/reviewOverrideCandidateContracts.test.js src/features/review/domain/tests/reviewOverrideFinalizeContracts.test.js src/features/review/domain/tests/reviewOverrideArtifactsContracts.test.js src/features/review/domain/tests/reviewManualOverrideContracts.test.js src/features/review/domain/tests/reviewOverrideApprovalContracts.test.js src/features/review/domain/tests/reviewOverrideMetricsContracts.test.js` passed |
| Surrounding review domain tests | `node --test src/features/review/domain/tests/*.test.js` passed |
| Full suite | `npm test` passed |
