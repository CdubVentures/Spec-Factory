import test from 'node:test';
import assert from 'node:assert/strict';

import { selectBatchEvidence } from '../batchEvidenceSelection.js';

test('selectBatchEvidence excludes websearch rows when route policy disables websearch', () => {
  const result = selectBatchEvidence({
    evidencePack: {
      references: [
        {
          id: 'manufacturer-ref',
          source_id: 'manufacturer',
          url: 'https://brand.example/specs',
          type: 'text'
        },
        {
          id: 'search-ref',
          source_id: 'google_search',
          url: 'https://www.google.com/search?q=mouse+sensor',
          type: 'search_result'
        }
      ],
      snippets: [
        {
          id: 'manufacturer-ref',
          source_id: 'manufacturer',
          type: 'text',
          field_hints: ['sensor'],
          normalized_text: 'Sensor: Focus Pro 35K'
        },
        {
          id: 'search-ref',
          source_id: 'google_search',
          type: 'text',
          field_hints: ['sensor'],
          normalized_text: 'Search result snippet mentioning Focus Pro 35K'
        }
      ]
    },
    batchFields: ['sensor'],
    config: {},
    routePolicy: {
      enable_websearch: false,
      single_source_data: false,
      all_source_data: false
    }
  });

  assert.deepEqual(
    result.references.map((row) => row.id).sort(),
    ['manufacturer-ref']
  );
  assert.deepEqual(
    result.snippets.map((row) => row.id).sort(),
    ['manufacturer-ref']
  );
});

test('selectBatchEvidence narrows to a single dominant source when single_source_data is enabled', () => {
  const result = selectBatchEvidence({
    evidencePack: {
      references: [
        {
          id: 'source-a-1',
          source_id: 'manufacturer',
          url: 'https://brand.example/specs',
          type: 'text'
        },
        {
          id: 'source-a-2',
          source_id: 'manufacturer',
          url: 'https://brand.example/specs/details',
          type: 'text'
        },
        {
          id: 'source-b-1',
          source_id: 'review_lab',
          url: 'https://review.example/mouse',
          type: 'text'
        }
      ],
      snippets: [
        {
          id: 'source-a-1',
          source_id: 'manufacturer',
          type: 'text',
          field_hints: ['sensor'],
          normalized_text: 'Sensor: Focus Pro 35K'
        },
        {
          id: 'source-a-2',
          source_id: 'manufacturer',
          type: 'window',
          field_hints: ['sensor'],
          normalized_text: 'Focus Pro 35K optical sensor'
        },
        {
          id: 'source-b-1',
          source_id: 'review_lab',
          type: 'text',
          field_hints: ['sensor'],
          normalized_text: 'Sensor under test: Focus Pro 35K'
        }
      ]
    },
    batchFields: ['sensor'],
    config: {
      llmExtractMaxSnippetsPerBatch: 6
    },
    routePolicy: {
      enable_websearch: true,
      single_source_data: true,
      all_source_data: false
    }
  });

  assert.deepEqual(
    result.snippets.map((row) => row.id).sort(),
    ['source-a-1', 'source-a-2']
  );
  assert.deepEqual(
    result.references.map((row) => row.id).sort(),
    ['source-a-1', 'source-a-2']
  );
});

test('selectBatchEvidence correlates visual assets by selected source identity and host', () => {
  const result = selectBatchEvidence({
    evidencePack: {
      references: [
        {
          id: 'sensor-ref',
          source_id: 'manufacturer',
          url: 'https://brand.example/specs',
          type: 'text'
        }
      ],
      snippets: [
        {
          id: 'sensor-ref',
          source_id: 'manufacturer',
          type: 'text',
          field_hints: ['sensor'],
          normalized_text: 'Sensor: Focus Pro 35K'
        }
      ],
      visual_assets: [
        {
          id: 'visual-by-source',
          source_id: 'manufacturer',
          source_url: 'https://brand.example/specs',
          file_uri: 'file:///tmp/by-source.png',
          mime_type: 'image/png'
        },
        {
          id: 'visual-by-host',
          source_id: 'other_token',
          source_url: 'https://brand.example/gallery',
          file_uri: 'file:///tmp/by-host.png',
          mime_type: 'image/png'
        },
        {
          id: 'visual-other-host',
          source_id: 'foreign',
          source_url: 'https://elsewhere.example/specs',
          file_uri: 'file:///tmp/other-host.png',
          mime_type: 'image/png'
        }
      ]
    },
    batchFields: ['sensor'],
    config: {},
    routePolicy: {
      enable_websearch: true,
      single_source_data: false,
      all_source_data: false
    }
  });

  assert.deepEqual(
    result.visual_assets.map((row) => row.id).sort(),
    ['visual-by-host', 'visual-by-source']
  );
});
