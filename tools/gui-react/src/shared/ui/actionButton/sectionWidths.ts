/**
 * Shared width tokens for action-button clusters across the indexing lab.
 *
 * Each cluster of sibling buttons (a panel header, a variant row, a key-group
 * header) passes a single value from this map to every button it contains, so
 * columns line up cleanly. Change one value here and every button in that
 * cluster updates — no per-call-site edits.
 */

export const ACTION_BUTTON_WIDTH = {
  /** Pipeline header: Run + Stop (short labels). */
  pipelineHeader: 'w-32',
  /** CEF / PIF / Scalar panel headers: Run/Loop/Eval All + History + Prompt. */
  standardHeader: 'w-40',
  /** Key panel header: Run all groups + Loop all groups + History (long labels). */
  keyHeader: 'w-44',
  /** Key group header: History + Run group + Loop group. */
  keyGroup: 'w-36',
  /** PIF / Scalar variant rows + PromptDrawerChevron actions (short labels). */
  standardRow: 'w-14',
  /** Key row: Run + Loop + Prompt (fits 'Prompt' cleanly). */
  keyRow: 'w-20',
  /** Key row History button — wider to fit "History (NNqu)(NNurl)" counts. */
  keyRowHistory: 'w-32',
} as const;

export type ActionButtonWidth = typeof ACTION_BUTTON_WIDTH[keyof typeof ACTION_BUTTON_WIDTH];
