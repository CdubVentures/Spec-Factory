# Claude Statusline Remediation Log

Last updated: 2026-03-15

## Contract

- The statusline reads Claude's JSON payload from stdin.
- Context remaining prefers `context_window.remaining_percentage`, then derives from `context_window.used_percentage`, then derives from `context_window.current_usage` input-side tokens only. Cumulative `total_input_tokens` and `total_output_tokens` are not used for the live context bar.
- Effort prefers the latest live transcript command result for the active session and only falls back to project or home `effortLevel` when no transcript effort is available.
- The richer model label from the latest `/model` transcript result should be surfaced when available.
- `C:\Users\Chris\.claude\statusline.mjs` is the fast Windows source of truth for the live command.
- `C:\Users\Chris\.claude\statusline.sh` remains a compatibility wrapper only.
- `C:\Users\Chris\Desktop\Spec Factory` must point its Claude settings at the direct `node C:/Users/Chris/.claude/statusline.mjs` command.

## Red Matrix

- [x] Global script uses `remaining_percentage` directly.
- [x] Global script derives remaining from `used_percentage`.
- [x] Global script derives remaining from `current_usage` when percentage fields are unavailable.
- [x] Global script shows unknown context when Claude has not exposed live context usage yet.
- [x] Global script picks the latest transcript effort instead of stale settings.
- [x] Global script parses escaped ANSI transcript payloads.
- [x] Global script surfaces the latest transcript model label.
- [x] Spec Factory local statusline entrypoint matches the global output contract.
- [x] Spec Factory Claude settings target the direct home Node command.

## Execution Log

- 2026-03-15: Added `test/claudeStatusline.test.js` to lock the global and Spec Factory statusline contract before implementation.
- 2026-03-15: Replaced the home shell parser with `C:\Users\Chris\.claude\statusline.mjs` and converted both statusline shell entrypoints into thin wrappers over the home implementation.
- 2026-03-15: Updated `C:\Users\Chris\Desktop\Spec Factory\.claude\settings.json` to call `node C:/Users/Chris/.claude/statusline.mjs` directly instead of the slower bash wrapper.
- 2026-03-15: Corrected the context contract after validating the official docs: cumulative totals are not used for live context, and `current_usage` excludes output tokens for the bar calculation.
- 2026-03-15: `node --test test/claudeStatusline.test.js` passed with 8/8 tests green.
- 2026-03-15: Live replay validation passed for the real `085ca51f-fe68-49ad-af01-15c142d8e5f3` transcript, producing `Opus 4.6 (1M context) | 100% [########] | Max`.
- 2026-03-15: Live replay of the current `statusline.last-input.json` now shows unknown context (`--`) instead of a false `0%` when Claude has not yet populated live context usage.
- 2026-03-15: Added transcript-state caching with append-only updates and cached-state fallback when the transcript is temporarily unavailable.
- 2026-03-15: Direct `node C:/Users/Chris/.claude/statusline.mjs` replays benchmarked at roughly 85-90ms on the current `Spec Factory` and `EG - Convert` inputs, versus roughly 900-1100ms through the bash/WSL wrapper.
