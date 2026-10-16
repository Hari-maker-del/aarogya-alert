const COMPLETED_STATUSES = new Set(["closed", "dismissed"]);

export function isCompletedInvestigation(alert) {
  return COMPLETED_STATUSES.has(alert.investigation_status);
}

export function getInvestigationCounts(alerts, authenticatedUserId) {
  return {
    active: alerts.filter((alert) => alert.active !== false && !isCompletedInvestigation(alert)).length,
    mine: authenticatedUserId
      ? alerts.filter((alert) => alert.assigned_reviewer_id === authenticatedUserId).length
      : 0,
    completed: alerts.filter(isCompletedInvestigation).length,
    all: alerts.length,
  };
}

export function filterInvestigationAlerts(alerts, view, authenticatedUserId) {
  return alerts.filter((alert) => {
    if (view === "active") return alert.active !== false && !isCompletedInvestigation(alert);
    if (view === "mine") return Boolean(authenticatedUserId && alert.assigned_reviewer_id === authenticatedUserId);
    if (view === "completed") return isCompletedInvestigation(alert);
    return true;
  });
}
