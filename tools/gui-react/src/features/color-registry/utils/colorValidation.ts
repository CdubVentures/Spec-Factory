const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function isValidColorName(name: string): boolean {
  return NAME_PATTERN.test(name) && name.length <= 50;
}

export function isValidHex(hex: string): boolean {
  return HEX_PATTERN.test(hex);
}

export function normalizeColorName(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, '-');
}
