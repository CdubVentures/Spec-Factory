function clamp01(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(1, Math.max(0, num));
}

function round(value, digits = 6) {
  if (value == null) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeToken(value) {
  return String(value ?? '').trim().toLowerCase();
}

function isCorrectPrediction(prediction, expectedValue) {
  return normalizeToken(prediction?.value) === normalizeToken(expectedValue);
}

function createBins() {
  return Array.from({ length: 10 }, (_, index) => ({
    start: index / 10,
    end: (index + 1) / 10,
    count: 0,
    covered_count: 0,
    correct_count: 0,
    avg_confidence: null,
    accuracy: null,
    calibration_gap: null,
  }));
}

function binIndexFor(confidence) {
  const bounded = clamp01(confidence);
  return Math.min(9, Math.floor(bounded * 10));
}

export function computeCalibrationReport({ predictions = [], groundTruth = {} } = {}) {
  const bins = createBins();

  let coveredCount = 0;
  let correctCount = 0;
  let confidenceSum = 0;
  let coveredConfidenceSum = 0;
  let brierSum = 0;

  for (const prediction of predictions) {
    const confidence = clamp01(prediction?.confidence);
    const bin = bins[binIndexFor(confidence)];
    bin.count += 1;
    bin.avg_confidence = round(((bin.avg_confidence ?? 0) * (bin.count - 1) + confidence) / bin.count);

    const field = String(prediction?.field || '').trim();
    if (!Object.prototype.hasOwnProperty.call(groundTruth, field)) {
      continue;
    }

    const correct = isCorrectPrediction(prediction, groundTruth[field]) ? 1 : 0;
    coveredCount += 1;
    correctCount += correct;
    confidenceSum += confidence;
    coveredConfidenceSum += confidence;
    brierSum += (confidence - correct) ** 2;

    bin.covered_count += 1;
    bin.correct_count += correct;
  }

  let ece = 0;
  for (const bin of bins) {
    if (bin.covered_count === 0) continue;
    const binConfidenceSum = predictions
      .filter((prediction) => {
        const field = String(prediction?.field || '').trim();
        return Object.prototype.hasOwnProperty.call(groundTruth, field)
          && binIndexFor(prediction?.confidence) === binIndexFor(bin.start + 0.000001);
      })
      .reduce((sum, prediction) => sum + clamp01(prediction?.confidence), 0);
    const avgConfidence = binConfidenceSum / bin.covered_count;
    const accuracy = bin.correct_count / bin.covered_count;
    bin.avg_confidence = round(bin.count > 0 ? (bin.avg_confidence ?? 0) : avgConfidence);
    bin.accuracy = round(accuracy);
    bin.calibration_gap = round(Math.abs(avgConfidence - accuracy));
    ece += (bin.covered_count / Math.max(1, coveredCount)) * Math.abs(avgConfidence - accuracy);
  }

  return {
    total_predictions: predictions.length,
    covered_predictions: coveredCount,
    correct_predictions: correctCount,
    accuracy: coveredCount > 0 ? round(correctCount / coveredCount) : null,
    mean_confidence: predictions.length > 0 ? round(confidenceSum / Math.max(1, coveredCount)) : null,
    brier_score: coveredCount > 0 ? round(brierSum / coveredCount) : null,
    expected_calibration_error: coveredCount > 0 ? round(ece) : null,
    bins,
  };
}
