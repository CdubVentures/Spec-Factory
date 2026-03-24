import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCalibrationReport } from '../confidenceCalibrator.js';

test('computeCalibrationReport summarizes covered predictions, correctness, and calibration bins', () => {
  const report = computeCalibrationReport({
    predictions: [
      { field: 'weight', value: '59', confidence: 0.9 },
      { field: 'dpi', value: '26000', confidence: 0.8 },
      { field: 'sensor', value: 'wrong', confidence: 0.7 },
      { field: 'coating', value: 'matte', confidence: 0.4 },
    ],
    groundTruth: {
      weight: '59',
      dpi: '26000',
      sensor: 'focus pro',
    },
  });

  assert.equal(report.total_predictions, 4);
  assert.equal(report.covered_predictions, 3);
  assert.equal(report.correct_predictions, 2);
  assert.equal(report.accuracy, 0.666667);
  assert.equal(report.mean_confidence, 0.8);
  assert.equal(report.expected_calibration_error, 0.333333);
  assert.equal(report.brier_score, 0.18);
  assert.equal(Array.isArray(report.bins), true);
  assert.equal(report.bins.length, 10);
  assert.deepEqual(
    report.bins.filter((bin) => bin.count > 0).map((bin) => ({
      start: bin.start,
      end: bin.end,
      count: bin.count,
      accuracy: bin.accuracy,
      avg_confidence: bin.avg_confidence,
    })),
    [
      { start: 0.4, end: 0.5, count: 1, accuracy: null, avg_confidence: 0.4 },
      { start: 0.7, end: 0.8, count: 1, accuracy: 0, avg_confidence: 0.7 },
      { start: 0.8, end: 0.9, count: 1, accuracy: 1, avg_confidence: 0.8 },
      { start: 0.9, end: 1, count: 1, accuracy: 1, avg_confidence: 0.9 },
    ],
  );
});
