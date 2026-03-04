# Phase 03 Scope and Objectives

## Scope

- Split backend composition roots:
  - `src/cli/spec.js`
  - `src/api/guiServer.js`
- Define thin-root delegation seams for command and route wiring.
- Preserve route/command signatures and external behavior.
- Define characterization-test coverage to detect behavior drift during splitting.
- Prepare handoff package for Phase 04 backend migration wave A.

## Out of Scope

- Feature behavior redesign.
- Route path or payload contract redesign.
- Full domain extraction of backend contexts (Phase 04/05 scope).
- CI blocking enforcement of architecture checks (Phase 07 scope).

## Objectives

1. Convert composition roots into orchestration-only layers.
2. Isolate domain logic behind contract-aware adapters.
3. Minimize blast radius by splitting one seam at a time.
4. Preserve behavior with characterization and targeted regression suites.
5. Deliver a Phase 04-ready split plan and risk-controlled handoff.

## Deliverables

- Composition-root baseline inventory:
  - `02-COMPOSITION-ROOT-INVENTORY.md`
- Delegation and seam rules:
  - `03-DELEGATION-SEAM-RULEBOOK.md`
- Transitional adapter registry:
  - `04-ADAPTER-REGISTRY.md`
- Entry-point characterization plan:
  - `05-ENTRYPOINT-CHARACTERIZATION-TEST-PLAN.md`
- Phase controls and handoff:
  - `06-RISK-REGISTER.md`
  - `07-EXECUTION-CHECKLIST.md`
  - `08-EXIT-GATES-AND-HANDOFF.md`
