function normalizePart(value) {
  return String(value ?? '').trim();
}

/** Canonical key for component identity (type::name::maker). */
export function buildComponentIdentifier(componentType, componentName, componentMaker = '') {
  const type = normalizePart(componentType);
  const name = normalizePart(componentName);
  const maker = normalizePart(componentMaker);
  return `${type}::${name}::${maker}`;
}
