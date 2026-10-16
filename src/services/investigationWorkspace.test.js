import assert from "node:assert/strict";
import test from "node:test";
import { filterInvestigationAlerts, getInvestigationCounts } from "./investigationWorkspace.js";

const alerts = [
  { alert_id: "A", investigation_status: "new", active: true, assigned_reviewer_id: "user-1" },
  { alert_id: "B", investigation_status: "investigating", active: true, assigned_reviewer_id: "user-2" },
  { alert_id: "C", investigation_status: "closed", active: false, assigned_reviewer_id: "user-1" },
  { alert_id: "D", investigation_status: "dismissed", active: true, assigned_reviewer_id: null },
  { alert_id: "E", investigation_status: "assigned", active: false, assigned_reviewer_id: "user-1" },
];

test("counts active, assigned-to-current-user, completed and all cases accurately", () => {
  assert.deepEqual(getInvestigationCounts(alerts, "user-1"), { active: 2, mine: 3, completed: 2, all: 5 });
});

test("does not infer an assignee when the user is signed out", () => {
  assert.equal(getInvestigationCounts(alerts, null).mine, 0);
  assert.deepEqual(filterInvestigationAlerts(alerts, "mine", null), []);
});

test("filters active and completed views while preserving all cases", () => {
  assert.deepEqual(filterInvestigationAlerts(alerts, "active", "user-1").map((alert) => alert.alert_id), ["A", "B"]);
  assert.deepEqual(filterInvestigationAlerts(alerts, "completed", "user-1").map((alert) => alert.alert_id), ["C", "D"]);
  assert.equal(filterInvestigationAlerts(alerts, "all", "user-1").length, 5);
});

test("assigned-to-me view compares the backend assignment ID to the authenticated user ID", () => {
  assert.deepEqual(filterInvestigationAlerts(alerts, "mine", "user-1").map((alert) => alert.alert_id), ["A", "C", "E"]);
});
