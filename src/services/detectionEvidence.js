const numberText = (value) => value == null || !Number.isFinite(Number(value)) ? "Not recorded" : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(value));

const label = (value, labels) => {
  if (!value) return "Not recorded";
  return labels[value] ?? String(value).replace(/_/g, " ");
};

export function buildDetectionEvidence(alert) {
  const baseline = alert.expected_baseline;
  const percentageMeaningful = baseline != null && Number.isFinite(Number(baseline)) && Number(baseline) >= 1
    && alert.percentage_change != null && Number.isFinite(Number(alert.percentage_change));
  return {
    observed: numberText(alert.observed_value),
    baseline: numberText(baseline),
    difference: numberText(alert.absolute_difference ?? (
      alert.observed_value != null && baseline != null ? Number(alert.observed_value) - Number(baseline) : null
    )),
    percentageChange: percentageMeaningful ? `${numberText(alert.percentage_change)}%` : "Not meaningful for a zero or unavailable baseline",
    anomalyScore: numberText(alert.anomaly_score),
    threshold: numberText(alert.detection_threshold),
    historyCount: alert.baseline_observation_count == null ? "Not recorded" : numberText(alert.baseline_observation_count),
    baselineMethod: label(alert.baseline_method, {
      day_of_week_median_mad: "Same weekday · median and MAD",
      rolling_28_day_median_mad: "Rolling 28-day · median and MAD",
      no_history: "No eligible historical data",
      not_recorded: "Not recorded (legacy alert)",
    }),
    evidenceSufficiency: label(alert.evidence_sufficiency, {
      adequate: "Adequate",
      limited: "Limited",
      insufficient: "Insufficient",
      not_recorded: "Not recorded (legacy alert)",
    }),
    detectionStatus: label(alert.detection_status, {
      signal: "Signal detected",
      insufficient_data: "Insufficient data",
      below_minimum_count: "Below minimum count",
      within_baseline: "Within baseline",
      below_threshold: "Below threshold",
      excluded: "Excluded",
      not_recorded: "Not recorded (legacy alert)",
    }),
    detectionReason: alert.detection_reason?.trim() || "Detection explanation not recorded for this legacy alert.",
    dataQuality: label(alert.data_quality_status, {
      acceptable: "Acceptable",
      delayed: "Delayed",
      missing: "Missing",
      suppressed: "Suppressed",
    }),
  };
}
