import test from "node:test";
import assert from "node:assert/strict";
import { buildDetectionEvidence } from "./detectionEvidence.js";

const alert = {
  observed_value: 30,
  expected_baseline: 10,
  absolute_difference: 20,
  percentage_change: 200,
  anomaly_score: 4.2,
  detection_threshold: 3.5,
  baseline_observation_count: 8,
  baseline_method: "day_of_week_median_mad",
  evidence_sufficiency: "adequate",
  detection_status: "signal",
  detection_reason: "Observed count exceeds the baseline and configured anomaly-score threshold; reviewer verification is required.",
  data_quality_status: "acceptable",
};

test("formats a complete detection evidence view without changing source values", () => {
  const view = buildDetectionEvidence(alert);
  assert.equal(view.observed, "30");
  assert.equal(view.baseline, "10");
  assert.equal(view.difference, "20");
  assert.equal(view.percentageChange, "200%");
  assert.equal(view.historyCount, "8");
  assert.equal(view.baselineMethod, "Same weekday · median and MAD");
  assert.equal(view.evidenceSufficiency, "Adequate");
  assert.equal(view.detectionStatus, "Signal detected");
  assert.match(view.detectionReason, /reviewer verification is required/);
});

test("does not invent percentage change for a zero baseline", () => {
  const view = buildDetectionEvidence({ ...alert, expected_baseline: 0, percentage_change: null });
  assert.equal(view.percentageChange, "Not meaningful for a zero or unavailable baseline");
});

test("legacy alerts receive explicit unavailable labels", () => {
  const view = buildDetectionEvidence({
    observed_value: null, expected_baseline: null, absolute_difference: null,
    percentage_change: null, anomaly_score: null, detection_threshold: null,
    data_quality_status: "acceptable",
  });
  assert.equal(view.baselineMethod, "Not recorded (legacy alert)");
  assert.equal(view.evidenceSufficiency, "Not recorded (legacy alert)");
  assert.equal(view.detectionStatus, "Not recorded (legacy alert)");
  assert.match(view.detectionReason, /legacy alert/);
});
