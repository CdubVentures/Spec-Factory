// WHY: Disambiguates brand-word collisions in SERP queries. Brand names like
// "Glorious", "Razer", "Apex" are also common English words — Google returns
// dictionary pages when we query them without product-category context.
// Appending "gaming mouse" / "gaming keyboard" / etc. to every query tells
// Google which sense we mean and biases toward product-spec results.
//
// Proven by audit on 2026-04-22: the Glorious Model O 2 run returned 5/10
// dictionary definitions of the word "glorious" (Merriam-Webster, Collins,
// Wiktionary, Vocabulary.com, TheFreeDictionary) because our queries were
// just "Glorious Model O 2 Wireless specifications" with no category signal.

const CATEGORY_CONTEXT = Object.freeze({
  mouse: 'gaming mouse',
  keyboard: 'gaming keyboard',
  monitor: 'gaming monitor',
  headset: 'gaming headset',
});

export function getCategorySearchContext(category) {
  const key = String(category || '').trim().toLowerCase();
  if (!key) return '';
  return CATEGORY_CONTEXT[key] || '';
}
