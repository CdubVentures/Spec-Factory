// WHY: O(1) Feature Scaling — types are generic, not per-field. Adding a new
// setting to the registry requires zero changes to this file.

import type { RuntimeSettingsNumericBaseline } from './runtimeSettingsAuthority.ts';

// --- Hydration binding types (structural, not per-field) ---

type RuntimeStringHydrationBinding = {
  key: string;
  allowEmpty?: boolean;
  apply: (value: string) => void;
};

type RuntimeNumberHydrationBinding = {
  key: string;
  apply: (value: number) => void;
};

type RuntimeBooleanHydrationBinding = {
  key: string;
  apply: (value: boolean) => void;
};

export interface RuntimeHydrationBindings {
  stringBindings: RuntimeStringHydrationBinding[];
  numberBindings: RuntimeNumberHydrationBinding[];
  booleanBindings: RuntimeBooleanHydrationBinding[];
}

// WHY: Generic setter map — hydration does dynamic lookup by `set${Capitalize(key)}`.
// Callers provide an object with `setXxx` methods; the registry determines which are used.
export type RuntimeHydrationBindingSetters = Record<
  string,
  ((value: string) => void) | ((value: number) => void) | ((value: boolean) => void) | undefined
>;

// --- Token defaults (structural, not per-field) ---

export interface RuntimeModelTokenDefaults {
  default_output_tokens: number;
  max_output_tokens: number;
}

export type RuntimeModelTokenDefaultsResolver = (
  model: string,
) => RuntimeModelTokenDefaults;

// WHY: Generic input type — payload serializer iterates registry entries and
// reads values by key. The draft object provides all settings as string | number | boolean.
// Two extra fields provide model-aware token clamping and numeric baselines.
export interface RuntimeSettingsPayloadSerializerInput {
  [key: string]: unknown;
  runtimeSettingsFallbackBaseline: RuntimeSettingsNumericBaseline;
  resolveModelTokenDefaults: RuntimeModelTokenDefaultsResolver;
}
