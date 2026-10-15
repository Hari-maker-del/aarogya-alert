/**
 * Pure Markdown case-file builder. Kept browser-independent so report contents
 * can be covered by Node's built-in test runner without mocking the DOM.
 */
export function buildInvestigationCaseFile({
  alert,
  auditEvents = [],
  backendConnected,
  generatedAt,
  historyCoverage,
  formatIndicator,
  priorityLabel,
  statusLabel,
  percentText,
}) {
  const list = (values) =>
    values?.length ? values.map((value) => "- " + value).join("\n") : "- None recorded";
  const value = (item) =>
    item === null || item === undefined || item === "" ? "Not available" : String(item);
  const fence = String.fromCharCode(96).repeat(3);
  const jsonBlock = (item) =>
    item === null || item === undefined
      ? "Not recorded"
      : [fence + "json", JSON.stringify(item, null, 2), fence].join(String.fromCharCode(10));

  const investigations = alert.investigations?.length
    ? alert.investigations
        .map((record, index) =>
          [
            (index + 1) + ". **" + record.investigation_id + "**",
            "   - Status: " + value(record.status),
            "   - Reviewer ID: " + value(record.reviewer_id),
            "   - Created: " + value(record.created_at),
            "   - Updated: " + value(record.updated_at),
            "   - Findings: " + value(record.findings),
            "   - Outcome: " + value(record.outcome),
          ].join("\n"),
        )
        .join("\n")
    : "No investigation records were included in this alert response.";

  const orderedEvents = [...auditEvents].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const audit = orderedEvents.length
    ? orderedEvents
        .map((event, index) =>
          [
            "### " + (index + 1) + ". " + event.action.replace(/_/g, " "),
            "- Event ID: " + value(event.event_id),
            "- Occurred at: " + value(event.occurred_at),
            "- Actor ID: " + value(event.actor_id),
            "- Investigation ID: " + value(event.investigation_id),
            "- Note: " + value(event.note),
            "- Before state:",
            jsonBlock(event.before),
            "- After state:",
            jsonBlock(event.after),
          ].join("\n"),
        )
        .join("\n\n")
    : "No audit events were included in this export.";

  return [
    "# AAROGYA ALERT — Investigation case file",
    "",
    "- Generated at (UTC): " + generatedAt,
    "- Export source: " + (backendConnected ? "Connected API" : "Local synthetic fallback"),
    "- Audit coverage: " + historyCoverage,
    "",
    "> SAFEGUARD: This prototype uses synthetic aggregate demo observations. A signal is not a diagnosis or a confirmed outbreak. This case file is for review demonstration only.",
    "",
    "## Signal summary",
    "- Alert ID: " + alert.alert_id,
    "- Region: " + alert.region_name + " (" + alert.region_id + ")",
    "- Indicator: " + formatIndicator(alert.indicator_type),
    "- Priority: " + priorityLabel(alert.review_priority),
    "- Investigation status: " + statusLabel(alert.investigation_status),
    "- Active: " + (alert.active === undefined ? "Not available" : String(alert.active)),
    "- Observation date: " + value(alert.observation_date ?? alert.detected_at),
    "- Data quality: " + value(alert.data_quality_status),
    "- Assigned reviewer ID: " + value(alert.assigned_reviewer_id),
    "",
    "## Aggregate measurements",
    "- Observed value: " + value(alert.observed_value),
    "- Expected baseline: " + value(alert.expected_baseline),
    "- Absolute difference: " + value(alert.absolute_difference),
    "- Percentage change: " + percentText(alert.percentage_change),
    "- Anomaly score: " + value(alert.anomaly_score),
    "- Detection threshold: " + value(alert.detection_threshold),
    "",
    "## Contributing signals",
    list(alert.contributing_signals),
    "",
    "## Supporting evidence",
    list(alert.supporting_evidence),
    "",
    "## Uncertainty and limitations",
    list(alert.uncertainty_notes),
    "",
    "## Suggested verification",
    list(alert.recommended_verification_steps),
    "",
    "## Investigation records",
    investigations,
    "",
    "## Audit history",
    historyCoverage,
    "",
    audit,
    "",
    "---",
    "End of case file. Retain the synthetic-data and uncertainty notice when sharing this report.",
    "",
  ].join("\n");
}
