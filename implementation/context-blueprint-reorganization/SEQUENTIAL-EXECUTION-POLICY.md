# Sequential Execution and Audit Policy

## Rule

No phase may start until the prior phase is both:

1. Completed against its documented exit criteria.
2. Audited and approved in that phase's `AUDIT-SIGNOFF.md`.

Audit approval is an internal engineering checkpoint and does not require explicit user signoff unless requested.

## Mandatory Sequence

1. `phase-01-baseline-and-freeze`
2. `phase-02-context-contracts`
3. `phase-03-composition-root-split`
4. `phase-04-backend-wave-a`
5. `phase-05-backend-wave-b`
6. `phase-06-frontend-feature-slicing`
7. `phase-07-enforcement-and-cutover`

## Audit Standard

- Every phase must include objective evidence:
  - tests run
  - baseline deltas (if applicable)
  - unresolved risks
  - explicit go/no-go decision
- Signoff must include date and owner.

## Reporting Quality Gate

- For active implementation work, run focused characterization suites as each slice lands.
- Before any progress/completion report to the user, execute a full repository regression sweep (`npm test`) and include the result in the report.
- If the full sweep cannot be executed, the report must explicitly state why and be treated as provisional.

## Exception Rule

Any sequence break is a policy exception and must be logged with reason and risk impact before work proceeds.
