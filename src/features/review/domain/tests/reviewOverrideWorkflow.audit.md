# Review Override Workflow Test Audit

Scope: `src/features/review/domain/tests/reviewOverrideWorkflow.test.js`

Disposition:

| Original block | Bucket | Why | Replacement / destination | Final disposition |
| --- | --- | --- | --- | --- |
| `setOverrideFromCandidate writes helper override file and finalize applies it to latest artifacts` | COLLAPSE | Mixed candidate-write, preview-finalize, and finalize-apply contracts into one setup-heavy test. | `reviewOverrideCandidateWriteContracts.test.js`; `reviewOverrideFinalizePreviewGuard.test.js`; `reviewOverrideFinalizeApplyContracts.test.js` | Preserved as smaller contract tests |
| `setOverrideFromCandidate accepts synthetic candidates when candidateValue is provided` | KEEP | Protects the synthetic-candidate acceptance path used by review mutation flows. | `reviewOverrideSyntheticCandidateContracts.test.js` | Preserved |
| `finalizeOverrides demotes invalid override values through runtime engine gate` | KEEP | Guards the runtime validation gate that prevents invalid finalized overrides. | `reviewOverrideFinalizeRuntimeGate.test.js` | Preserved |
| `readReviewArtifacts returns safe defaults when review files do not exist` | KEEP | Protects the safe-default artifact contract when review outputs are missing. | `reviewOverrideArtifactsContracts.test.js` | Preserved |
| `setManualOverride requires evidence and writes canonical manual override candidate id` | COLLAPSE | Mixed validation and persistence/id-shape contracts in one test. | `reviewManualOverrideValidation.test.js`; `reviewManualOverrideCanonicalId.test.js` | Preserved as smaller contract tests |
| `approveGreenOverrides writes candidate overrides only for green known fields` | KEEP | Protects bulk approval filtering and override write behavior. | `reviewOverrideApprovalContracts.test.js` | Preserved |
| `buildReviewMetrics reports throughput and override ratios from override docs` | KEEP | Public metrics contract consumed by CLI and analytics surfaces. | `reviewOverrideMetricsContracts.test.js` | Preserved |

Proof log:

| Step | Result |
| --- | --- |
| Targeted review-override tests | `node --test src/features/review/domain/tests/reviewOverrideCandidateWriteContracts.test.js src/features/review/domain/tests/reviewOverrideSyntheticCandidateContracts.test.js src/features/review/domain/tests/reviewOverrideFinalizePreviewGuard.test.js src/features/review/domain/tests/reviewOverrideFinalizeApplyContracts.test.js src/features/review/domain/tests/reviewOverrideFinalizeRuntimeGate.test.js src/features/review/domain/tests/reviewOverrideArtifactsContracts.test.js src/features/review/domain/tests/reviewManualOverrideValidation.test.js src/features/review/domain/tests/reviewManualOverrideCanonicalId.test.js src/features/review/domain/tests/reviewOverrideApprovalContracts.test.js src/features/review/domain/tests/reviewOverrideMetricsContracts.test.js` passed |
| Surrounding review domain tests | `node --test src/features/review/domain/tests/*.test.js` passed |
| Full suite | `npm test` passed |
