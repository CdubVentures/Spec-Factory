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

/** The paired selected state: colors + editions with their colors + default. */
export interface ColorEditionFinderSelected {
  readonly colors: readonly string[];
  readonly editions: Readonly<Record<string, { readonly colors: readonly string[] }>>;
  readonly default_color: string;
}

/** A single historical run entry with full prompt/response audit trail. */
export interface ColorEditionFinderRunEntry {
  readonly run_number: number;
  readonly ran_at: string;
  readonly model: string;
  readonly fallback_used: boolean;
  readonly cooldown_until: string;
  readonly selected: ColorEditionFinderSelected;
  readonly prompt: { readonly system: string; readonly user: string };
  readonly response: ColorEditionFinderSelected;
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
  readonly selected: ColorEditionFinderSelected;
  readonly runs: readonly ColorEditionFinderRunEntry[];
  readonly color_details: Readonly<Record<string, ColorEditionFinderColorDetail>>;
  readonly edition_details: Readonly<Record<string, ColorEditionFinderEditionDetail>>;
}

export interface ColorEditionFinderRunResponse {
  readonly ok: boolean;
  readonly colors: readonly string[];
  readonly editions: readonly string[];
  readonly fallbackUsed: boolean;
}

export interface ColorEditionFinderDeleteRunResponse {
  readonly ok: boolean;
  readonly remaining_runs: number;
}

export interface ColorEditionFinderDeleteAllResponse {
  readonly ok: boolean;
}

export interface ColorRegistryEntry {
  readonly name: string;
  readonly hex: string;
  readonly css_var: string;
}
