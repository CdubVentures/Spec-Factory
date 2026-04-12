/**
 * Carousel Strategy Engine — pure function that evaluates carousel
 * completion and decides what to search for next.
 *
 * The view budget controls what we ASK for in the prompt.
 * It does NOT filter what we ACCEPT — any canonical view returned
 * by the LLM is kept regardless of budget.
 */

/**
 * Evaluate carousel completion for a single variant and decide next action.
 *
 * @param {object} opts
 * @param {Array<{view: string, variant_key: string, quality_pass?: boolean}>} opts.collectedImages
 * @param {string[]} opts.viewBudget        — which views to target (e.g. ['top','left','angle'])
 * @param {number}   opts.satisfactionThreshold — quality images per view to be "satisfied"
 * @param {boolean}  opts.heroEnabled
 * @param {number}   opts.heroCount         — target hero images
 * @param {string}   opts.variantKey        — which variant to evaluate
 * @param {number}   [opts.viewAttemptBudget=Infinity] — max LLM calls per view before giving up
 * @param {Record<string,number>} [opts.viewAttemptCounts={}] — calls made per view so far
 * @param {number}   [opts.heroAttemptBudget=Infinity] — max hero LLM calls
 * @param {number}   [opts.heroAttemptCount=0] — hero calls made so far
 *
 * @returns {{
 *   mode: 'view' | 'hero' | 'complete',
 *   focusView: string | null,
 *   viewsToSearch: string[],
 *   carouselProgress: {
 *     viewsFilled: number,
 *     viewsTotal: number,
 *     viewDetails: Record<string, {count: number, satisfied: boolean, attempts: number, exhausted: boolean}>,
 *     heroCount: number,
 *     heroTarget: number,
 *     heroSatisfied: boolean,
 *     heroAttempts: number,
 *     heroExhausted: boolean,
 *   },
 *   isComplete: boolean,
 *   estimatedCallsRemaining: number,
 * }}
 */
export function evaluateCarousel({
  collectedImages = [],
  viewBudget = [],
  satisfactionThreshold = 3,
  heroEnabled = true,
  heroCount = 3,
  variantKey,
  viewAttemptBudget = Infinity,
  viewAttemptCounts = {},
  heroAttemptBudget = Infinity,
  heroAttemptCount = 0,
}) {
  // Filter to matching variant + quality-passing images only.
  // quality_pass undefined treated as true for backward compat.
  const qualifying = collectedImages.filter(
    (img) => img.variant_key === variantKey && img.quality_pass !== false,
  );

  // Count per budgeted view + track attempts and exhaustion
  const viewDetails = {};
  for (const view of viewBudget) {
    const count = qualifying.filter((img) => img.view === view).length;
    const satisfied = count >= satisfactionThreshold;
    const attempts = viewAttemptCounts[view] || 0;
    const exhausted = !satisfied && attempts >= viewAttemptBudget;
    viewDetails[view] = { count, satisfied, attempts, exhausted };
  }

  const viewsFilled = Object.values(viewDetails).filter((d) => d.satisfied).length;
  const viewsTotal = viewBudget.length;
  // A view is "done" if satisfied OR exhausted
  const allViewsDone = viewBudget.every((v) => viewDetails[v].satisfied || viewDetails[v].exhausted);

  // Count hero images + track exhaustion
  const heroImageCount = qualifying.filter((img) => img.view === 'hero').length;
  const heroSatisfied = !heroEnabled || heroImageCount >= heroCount;
  const heroExhausted = !heroSatisfied && heroAttemptCount >= heroAttemptBudget;
  const heroDone = heroSatisfied || heroExhausted;

  // Unsatisfied non-exhausted views (for viewsToSearch and focusView)
  const actionableViews = viewBudget.filter((v) => !viewDetails[v].satisfied && !viewDetails[v].exhausted);

  // Decide mode
  let mode;
  if (!allViewsDone) {
    mode = 'view';
  } else if (!heroDone) {
    mode = 'hero';
  } else {
    mode = 'complete';
  }

  // focusView = highest-priority actionable view (budget array order)
  const focusView = mode === 'view' && actionableViews.length > 0 ? actionableViews[0] : null;

  // Estimate remaining calls
  let estimatedCallsRemaining = 0;
  for (const view of viewBudget) {
    const d = viewDetails[view];
    if (!d.satisfied && !d.exhausted) {
      const attemptsLeft = Math.max(0, viewAttemptBudget - d.attempts);
      const imagesNeeded = Math.max(0, satisfactionThreshold - d.count);
      estimatedCallsRemaining += Math.min(attemptsLeft, imagesNeeded);
    }
  }
  if (heroEnabled && !heroSatisfied && !heroExhausted) {
    const heroAttemptsLeft = Math.max(0, heroAttemptBudget - heroAttemptCount);
    const heroImagesNeeded = Math.max(0, heroCount - heroImageCount);
    estimatedCallsRemaining += Math.min(heroAttemptsLeft, heroImagesNeeded);
  }

  return {
    mode,
    focusView,
    viewsToSearch: mode === 'view' ? actionableViews : [],
    carouselProgress: {
      viewsFilled,
      viewsTotal,
      viewDetails,
      heroCount: heroImageCount,
      heroTarget: heroCount,
      heroSatisfied,
      heroAttempts: heroAttemptCount,
      heroExhausted,
    },
    isComplete: mode === 'complete',
    estimatedCallsRemaining,
  };
}
