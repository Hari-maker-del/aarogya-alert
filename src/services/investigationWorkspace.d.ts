import type { BackendAlert } from "./api";
export type InvestigationView = "active" | "mine" | "completed" | "all";
export function isCompletedInvestigation(alert: BackendAlert): boolean;
export function getInvestigationCounts(alerts: BackendAlert[], authenticatedUserId: string | null): { active: number; mine: number; completed: number; all: number };
export function filterInvestigationAlerts(alerts: BackendAlert[], view: InvestigationView, authenticatedUserId: string | null): BackendAlert[];
