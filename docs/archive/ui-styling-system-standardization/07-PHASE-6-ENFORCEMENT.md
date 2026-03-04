# Phase 6 - Enforcement and CI Guardrails

## Objective
Prevent future styling drift by adding automated checks and strict contribution rules.

## How I will execute
1. Implement style policy checks as scripts.
2. Wire checks into local workflow and CI.
3. Define a narrow exception process.

## Policy rules to enforce
1. No raw hex color literals in TSX files.
2. No unapproved arbitrary font sizes (`text-[Npx]`) outside tokenized allowlist.
3. No unapproved arbitrary spacing/radius values.
4. Status UI colors must use semantic status classes/tokens.
5. New shared UI should use primitives before ad-hoc utility bundles.

## Detailed steps
1. Add a script (example path: `tools/gui-react/scripts/style-token-guard.mjs`) that scans:
1. `src/**/*.tsx`
2. `src/**/*.ts`
3. `src/**/*.css`
2. Script should fail if patterns violate policy:
1. `#[0-9a-fA-F]{3,8}` in TSX/TS (except approved files)
2. `text-\[[^\]]+\]` not in allowlist
3. `p[xytrbl]?-\[[^\]]+\]` and `rounded-\[[^\]]+\]` not in allowlist
3. Add npm scripts:
1. `lint:style-tokens`
2. optional `lint:style-tokens:report`
4. Add CI wiring to run style guard with build/test checks.
5. Add violation reporting guidance:
1. file
2. line
3. rule ID
4. suggested token/primitives replacement

## Deliverables
1. Automated style guard script
2. Package scripts and CI integration
3. Policy reference doc linked in contributor flow

## Exit criteria
1. Non-compliant styling fails CI.
2. Developers get clear remediation output.
3. Exceptions are explicit, documented, and rare.

## Risks and mitigation
1. Risk: high false positives early.
Mitigation: introduce allowlist with planned burn-down and remove entries over time.
2. Risk: policy friction slows delivery.
Mitigation: include direct replacement hints in script output.

