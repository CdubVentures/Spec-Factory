// WHY: Per-component color tinting for the key-type icon strip. Every key
// related to a given component (the component itself + its <component>_brand
// / <component>_link projections + its sibling attributes) shares one tint
// so the navigator and review grid read at a glance as "this family of keys
// belongs to component X".
//
// Deterministic hash (FNV-1a 32-bit) -> palette slot keeps the color stable
// across reloads. Random would mean a different scheme every visit, which
// is worse UX than picking a memorable color and keeping it.

const PALETTE: readonly string[] = Object.freeze([
  'text-rose-500',
  'text-amber-500',
  'text-yellow-500',
  'text-lime-600',
  'text-emerald-500',
  'text-teal-500',
  'text-cyan-500',
  'text-sky-500',
  'text-violet-500',
  'text-fuchsia-500',
]);

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV prime mul; force u32 with `>>> 0`.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

export function componentColorClass(componentType: string): string {
  const trimmed = String(componentType || '').trim();
  if (!trimmed) return '';
  const idx = fnv1a32(trimmed) % PALETTE.length;
  return PALETTE[idx];
}
