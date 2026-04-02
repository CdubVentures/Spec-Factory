export interface ColorEditionFinderColorDetail {
  readonly found_run: number;
  readonly found_at: string;
  readonly model: string;
}

export interface ColorEditionFinderEditionDetail {
  readonly found_run: number;
  readonly found_at: string;
  readonly model: string;
}

export interface ColorEditionFinderResult {
  readonly product_id: string;
  readonly category: string;
  readonly colors: readonly string[];
  readonly editions: readonly string[];
  readonly default_color: string;
  readonly cooldown_until: string;
  readonly on_cooldown: boolean;
  readonly run_count: number;
  readonly last_ran_at: string;
  readonly color_details: Readonly<Record<string, ColorEditionFinderColorDetail>>;
  readonly edition_details: Readonly<Record<string, ColorEditionFinderEditionDetail>>;
}

export interface ColorEditionFinderRunResponse {
  readonly ok: boolean;
  readonly colors: readonly string[];
  readonly editions: readonly string[];
  readonly newColorsRegistered: ReadonlyArray<{ readonly name: string; readonly hex: string }>;
  readonly fallbackUsed: boolean;
}

export interface ColorRegistryEntry {
  readonly name: string;
  readonly hex: string;
  readonly css_var: string;
}
