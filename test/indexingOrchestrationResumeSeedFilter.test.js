import test from 'node:test';
import assert from 'node:assert/strict';
import { filterResumeSeedUrls } from '../src/features/indexing/orchestration/index.js';

test('filterResumeSeedUrls keeps eligible urls and records frontier-cooled resume seeds', () => {
  const skippedUrls = new Set();
  const logs = [];

  const result = filterResumeSeedUrls({
    urls: [
      'https://cooldown.example/spec',
      'https://eligible.example/spec',
      'https://pathdead.example/spec'
    ],
    frontierDb: {
      shouldSkipUrl(url) {
        if (url === 'https://cooldown.example/spec') {
          return {
            skip: true,
            reason: 'cooldown',
            next_retry_ts: '2026-03-24T14:37:46.806Z'
          };
        }
        if (url === 'https://pathdead.example/spec') {
          return {
            skip: true,
            reason: 'path_dead_pattern',
            next_retry_ts: null
          };
        }
        return { skip: false, reason: null };
      }
    },
    resumeCooldownSkippedUrls: skippedUrls,
    logger: {
      info(eventName, payload) {
        logs.push({ eventName, payload });
      }
    },
    seedKind: 'resume_pending_seed'
  });

  assert.deepEqual(result, ['https://eligible.example/spec']);
  assert.deepEqual(
    [...skippedUrls],
    ['https://cooldown.example/spec', 'https://pathdead.example/spec']
  );
  assert.deepEqual(logs, [
    {
      eventName: 'indexing_resume_seed_skipped',
      payload: {
        url: 'https://cooldown.example/spec',
        seed_kind: 'resume_pending_seed',
        skip_reason: 'cooldown',
        next_retry_ts: '2026-03-24T14:37:46.806Z'
      }
    },
    {
      eventName: 'indexing_resume_seed_skipped',
      payload: {
        url: 'https://pathdead.example/spec',
        seed_kind: 'resume_pending_seed',
        skip_reason: 'path_dead_pattern',
        next_retry_ts: null
      }
    }
  ]);
});

test('filterResumeSeedUrls returns original urls unchanged when frontier state is unavailable', () => {
  const result = filterResumeSeedUrls({
    urls: ['https://eligible.example/spec'],
    frontierDb: null,
    resumeCooldownSkippedUrls: new Set(),
    logger: null,
    seedKind: 'resume_pending_seed'
  });

  assert.deepEqual(result, ['https://eligible.example/spec']);
});
