// WHY: Single source of truth for storage key-path prefixes.
// These are namespace constants, not user-configurable settings.
// All code that builds storage keys (toPosixKey calls) imports from here.
export const INPUT_KEY_PREFIX = 'specs/inputs';
export const OUTPUT_KEY_PREFIX = 'specs/outputs';
