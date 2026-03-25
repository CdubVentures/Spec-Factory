import { toJSONSchema } from 'zod';

// WHY: 8+ adapters repeat `const { $schema, ...schema } = toJSONSchema(zodSchema)`.
// OpenAI's API does not expect the `$schema` key; stripping it is mechanical boilerplate.
export function zodToLlmSchema(zodSchema) {
  const { $schema, ...schema } = toJSONSchema(zodSchema);
  return schema;
}
