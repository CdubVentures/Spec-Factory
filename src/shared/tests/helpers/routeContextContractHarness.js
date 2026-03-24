import assert from 'node:assert/strict';

export function assertRouteContextRejectsInvalidInput(createContext) {
  assert.throws(() => createContext(null), TypeError);
  assert.throws(() => createContext('str'), TypeError);
  assert.throws(() => createContext([1]), TypeError);
}

export function buildRouteContextOptions(keys) {
  return Object.fromEntries(
    keys.map((key) => [key, { contractKey: key }]),
  );
}

export function assertRouteContextContract({
  createContext,
  forwardedKeys,
  helperKeys = [],
}) {
  const options = buildRouteContextOptions(forwardedKeys);
  const ctx = createContext({
    ...options,
    extra: { contractKey: 'extra' },
  });

  for (const key of forwardedKeys) {
    assert.equal(ctx[key], options[key], `${key} should be forwarded by reference`);
  }

  for (const key of helperKeys) {
    assert.equal(typeof ctx[key], 'function', `${key} should be exposed as a function`);
  }

  for (const key of [...forwardedKeys, ...helperKeys]) {
    assert.ok(Object.hasOwn(ctx, key), `${key} should be exposed`);
  }

  assert.equal(Object.hasOwn(ctx, 'extra'), false);
}
