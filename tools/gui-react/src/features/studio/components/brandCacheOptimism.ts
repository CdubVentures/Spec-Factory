import type { Brand } from "../../../types/product.ts";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

export function removeCachedBrand(brands: readonly Brand[] | undefined, slug: string): Brand[] {
  return (brands ?? []).filter((brand) => brand.slug !== slug);
}

export function patchCachedBrand(
  brands: readonly Brand[] | undefined,
  slug: string,
  patch: Readonly<Record<string, unknown>>,
): Brand[] {
  return (brands ?? []).map((brand) => {
    if (brand.slug !== slug) {
      return brand;
    }

    return {
      ...brand,
      ...(typeof patch.name === "string" ? { canonical_name: patch.name } : {}),
      ...(isStringArray(patch.aliases) ? { aliases: patch.aliases } : {}),
      ...(isStringArray(patch.categories) ? { categories: patch.categories } : {}),
      ...(typeof patch.website === "string" ? { website: patch.website } : {}),
    };
  });
}
