import test from 'node:test';
import assert from 'node:assert/strict';

import { PHASE_SCHEMA_REGISTRY } from '../phaseSchemaRegistry.js';
import {
  WRITER_MODEL_TEST_JSON_SCHEMA,
  WRITER_MODEL_TEST_SYSTEM_PROMPT,
  WRITER_MODEL_TEST_USER_PROMPT,
} from '../../../../../core/llm/writerModelTest.js';

test('phase schema registry exposes the Writer model test prompt in LLM Config', () => {
  const writer = PHASE_SCHEMA_REGISTRY.writer;

  assert.ok(writer);
  assert.equal(writer.system_prompt, WRITER_MODEL_TEST_SYSTEM_PROMPT);
  assert.equal(writer.user_message, WRITER_MODEL_TEST_USER_PROMPT);
  assert.deepEqual(writer.response_schema, WRITER_MODEL_TEST_JSON_SCHEMA);
});
