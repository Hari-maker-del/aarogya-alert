import assert from "node:assert/strict";
import test from "node:test";

import { buildInvestigationCaseFile } from "./caseFile.js";

const alert = {
  alert_id: "ALT-TEST-01",
  region_id: "REG-TEST-01",
  region_name: "Test North",
  indicator_type: "respiratory_medicine_demand",
  observed_value: 61,
  expected_baseline: 38,
  absolute_difference: 23,
  percentage_change: 60.5,
  anomaly_score: 4.2,
  detection_threshold: 3.5,
  review_priority: "priority_review",
  investigation_status: "investigating",
  active: true,
  observation_date: "2026-10-15",
  data_quality_status: "acceptable",
  assigned_reviewer_id: "reviewer-uuid",
  contributing_signals: ["pharmacy_demand_anomaly"],
  supporting_evidence: ["Aggregate demand is above the illustrative baseline."],
  uncertainty_notes: ["This is not confirmation of an outbreak."],
  recommended_verification_steps: ["Verify completeness and independent aggregate sources."],
  investigations: [{
    investigation_id: "INV-TEST-01",
    status: "investigating",
    reviewer_id: "reviewer-uuid",
    created_at: "2026-10-15T09:00:00Z",
    updated_at: "2026-10-15T09:30:00Z",
    findings: "Checked the sample window.",
    outcome: "Further verification required.",
  }],
};

const auditEvents = [
  {
    event_id: "EVT-LATER",
    alert_id: alert.alert_id,
    actor_id: "reviewer-uuid",
    action: "note_added",
    occurred_at: "2026-10-15T09:30:00Z",
    note: "Follow-up note.",
    before: { status: "investigating" },
    after: { status: "investigating", note: "Follow-up note." },
  },
  {
    event_id: "EVT-EARLIER",
    alert_id: alert.alert_id,
    actor_id: "reviewer-uuid",
    action: "status_updated",
    occurred_at: "2026-10-15T09:10:00Z",
    note: "Started a review.",
    before: { status: "assigned" },
    after: { status: "investigating" },
  },
];

function build(overrides = {}) {
  return buildInvestigationCaseFile({
    alert,
    auditEvents,
    backendConnected: true,
    generatedAt: "2026-10-15T10:00:00.000Z",
    historyCoverage: "All audit events returned by the API for this alert (2 event(s)).",
    formatIndicator: (value) => value.replace(/_/g, " "),
    priorityLabel: (value) => value === "priority_review" ? "Urgent" : value,
    statusLabel: (value) => value === "investigating" ? "Under review" : value,
    percentText: (value) => value == null ? "Not available" : (value > 0 ? "+" : "") + value + "%",
    ...overrides,
  });
}

test("case file includes signal measurements, evidence, uncertainty and verification", () => {
  const report = build();

  assert.match(report, /AAROGYA ALERT — Investigation case file/);
  assert.match(report, /synthetic aggregate demo observations/);
  assert.match(report, /not a diagnosis or a confirmed outbreak/i);
  assert.match(report, /ALT-TEST-01/);
  assert.match(report, /Observed value: 61/);
  assert.match(report, /Expected baseline: 38/);
  assert.match(report, /Absolute difference: 23/);
  assert.match(report, /Percentage change: \+60\.5%/);
  assert.match(report, /Aggregate demand is above the illustrative baseline/);
  assert.match(report, /This is not confirmation of an outbreak/);
  assert.match(report, /Verify completeness and independent aggregate sources/);
});

test("case file records investigation details and orders audit events chronologically", () => {
  const report = build();

  assert.match(report, /INV-TEST-01/);
  assert.match(report, /Checked the sample window/);
  assert.match(report, /Further verification required/);
  assert.ok(report.indexOf("EVT-EARLIER") < report.indexOf("EVT-LATER"));
  assert.match(report, /Actor ID: reviewer-uuid/);
  assert.match(report, /Started a review/);
  assert.match(report, /\`\`\`json/);
  assert.match(report, /"status": "assigned"/);
});

test("case file states when audit history is limited and labels offline fallback", () => {
  const limitedReport = build({
    historyCoverage: "Latest 100 audit events returned by the API; older events may exist.",
  });
  const fallbackReport = build({
    backendConnected: false,
    historyCoverage: "Local synthetic fallback only; workflow changes may not be persisted.",
    auditEvents: [],
  });

  assert.match(limitedReport, /older events may exist/);
  assert.match(fallbackReport, /Local synthetic fallback/);
  assert.match(fallbackReport, /workflow changes may not be persisted/);
  assert.match(fallbackReport, /No audit events were included in this export/);
});

test("case file handles optional fields without printing undefined", () => {
  const report = build({
    alert: {
      ...alert,
      observed_value: null,
      expected_baseline: null,
      absolute_difference: null,
      anomaly_score: null,
      detection_threshold: null,
      percentage_change: null,
      assigned_reviewer_id: null,
      contributing_signals: [],
      supporting_evidence: [],
      uncertainty_notes: [],
      recommended_verification_steps: [],
      investigations: [],
    },
    auditEvents: [],
  });

  assert.match(report, /Observed value: Not available/);
  assert.match(report, /Expected baseline: Not available/);
  assert.match(report, /Percentage change: Not available/);
  assert.match(report, /Assigned reviewer ID: Not available/);
  assert.match(report, /- None recorded/);
  assert.doesNotMatch(report, /undefined/);
});
