# Phase 03 Risk Register

## R1 - Composition-Root Behavior Drift

- Risk: split moves unintentionally alter command/route behavior.
- Impact: operator workflows break despite successful builds.
- Mitigation: characterize root behavior before each extraction and re-run focused suites after each move.

## R2 - Adapter Layer Bloat

- Risk: temporary adapters become permanent and preserve hidden coupling.
- Impact: root files shrink but complexity relocates without true boundary gains.
- Mitigation: every seam in `04-ADAPTER-REGISTRY.md` has owner and expiry phase; unresolved seams block phase closure.

## R3 - Partial Root Thinning

- Risk: only superficial extraction occurs while mixed logic remains in roots.
- Impact: Phase 04 enters with ambiguous backend extraction seams.
- Mitigation: define explicit "thin root" criteria and track them in `08-EXIT-GATES-AND-HANDOFF.md`.

## R4 - Process/WS Lifecycle Regression

- Risk: moving API runtime lifecycle orchestration changes start/stop/ws behavior.
- Impact: runtime operations become unstable or inconsistent.
- Mitigation: add characterization coverage for lifecycle and ws fanout before extracting these seams.

## R5 - Command Dispatch Contract Regression

- Risk: CLI command dispatch refactor alters argument handling or error semantics.
- Impact: automation and operator scripts break.
- Mitigation: lock command dispatch behavior with characterization tests and phased rollouts.

## R6 - Test Blind Spots

- Risk: extraction proceeds before sufficient entrypoint coverage exists.
- Impact: regressions are discovered late in downstream phases.
- Mitigation: enforce checklist gate requiring characterization plan and focused runs for each seam completion.

## Exception Log

Use this format:

- Date:
- Seam/Rule exception:
- Owner:
- Legacy path:
- Replacement contract:
- Expiry phase:
- Tests run:
- Rollback or cleanup task:
