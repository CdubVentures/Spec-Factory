export declare const DEFAULT_CATEGORY: string;

export declare function coerceCategories(values: unknown, fallback?: string[]): string[];

export declare function resolveActiveCategory(args: {
  currentCategory: string;
  categories: unknown;
}): string;

