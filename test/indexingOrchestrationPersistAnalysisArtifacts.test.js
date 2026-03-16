import test from 'node:test';
import assert from 'node:assert/strict';
import { persistAnalysisArtifacts } from '../src/features/indexing/orchestration/index.js';


function parseJsonBuffer(buffer) {
  return JSON.parse(Buffer.from(buffer).toString('utf8'));
}

