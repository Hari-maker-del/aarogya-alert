import { getValidAuthSession } from "./auth";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").replace(/\/+$/, "");

export interface BackendHealth {
  status: string;
  api_version: string;
  dataset: {
    status: string;
    region_count: number;
    observation_count: number;
    latest_observation_date: string | null;
    synthetic_only: boolean;
  };
}

export type BackendPriority = "priority_review" | "needs_review" | "watch" | "normal" | string;
export type BackendInvestigationStatus = "new" | "assigned" | "investigating" | "escalated" | "closed" | "dismissed" | string;

export interface BackendAlert {
  alert_id: string;
  region_id: string;
  region_name: string;
  detected_at?: string;
  observation_date?: string;
  indicator_type: string;
  observed_value: number | null;
  expected_baseline: number | null;
  absolute_difference?: number | null;
  percentage_change: number | null;
  anomaly_score: number | null;
  detection_threshold?: number | null;
  baseline_observation_count?: number | null;
  baseline_method?: string | null;
  evidence_sufficiency?: string | null;
  detection_status?: string | null;
  detection_reason?: string | null;
  review_priority: BackendPriority;
  contributing_signals?: string[];
  supporting_evidence: string[];
  uncertainty_notes: string[];
  recommended_verification_steps?: string[];
  data_quality_status: string;
  investigation_status: BackendInvestigationStatus;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
  investigations?: InvestigationRecord[];
  assigned_reviewer_id?: string | null;
  audit_events?: AuditEventRecord[];
}

export interface RegionRecord {
  region_id: string;
  region_name: string;
  latitude: number;
  longitude: number;
  population_band?: string;
  neighbor_ids?: string[];
}

export interface TrendRecord {
  region_id: string;
  region_name: string;
  observation_date: string;
  indicator_type: string;
  aggregated_count: number | null;
  source_type?: string;
  data_quality_status?: string;
  is_suppressed?: boolean;
}

export interface InvestigationRecord {
  investigation_id: string;
  alert_id: string;
  status: string;
  reviewer_id?: string | null;
  findings?: string | null;
  outcome?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AuditEventRecord {
  event_id: string;
  alert_id: string;
  investigation_id?: string | null;
  actor_id: string;
  action: string;
  occurred_at: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  note?: string | null;
}

export interface AlertSummary {
  active_alert_count: number;
  by_review_priority: Record<string, number>;
  by_investigation_status: Record<string, number>;
}

export type ReviewerRole = "pending" | "reviewer" | "admin";

export interface ReviewerProfile {
  user_id: string;
  email?: string | null;
  role: ReviewerRole;
  requested_at?: string;
  approved_by?: string | null;
  approved_at?: string | null;
  updated_at?: string;
}

export interface CurrentReviewer {
  user_id: string;
  email?: string | null;
  role: ReviewerRole;
  can_review: boolean;
  is_admin: boolean;
}


async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const session = await getValidAuthSession();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`API request failed (${response.status}): ${message || response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  health: () => request<BackendHealth>("/api/health"),

  regions: async (): Promise<RegionRecord[]> => {
    const response = await request<{ items: RegionRecord[]; synthetic_only: boolean }>("/api/regions");
    return response.items;
  },

  mapData: () => request<unknown>("/api/regions/map-data"),

  alerts: async (params?: {
    region_id?: string;
    review_priority?: string;
    investigation_status?: string;
  }): Promise<BackendAlert[]> => {
    const query = new URLSearchParams();
    if (params?.region_id) query.set("region_id", params.region_id);
    if (params?.review_priority) query.set("review_priority", params.review_priority);
    if (params?.investigation_status) query.set("investigation_status", params.investigation_status);
    const response = await request<{ items: BackendAlert[] }>(
      `/api/alerts${query.size ? `?${query.toString()}` : ""}`,
    );
    return response.items;
  },

  alertDetails: (id: string) =>
    request<BackendAlert>(`/api/alerts/${encodeURIComponent(id)}`),

  alertSummary: () => request<AlertSummary>("/api/alerts/summary"),

  trends: async (regionId: string, days = 7): Promise<TrendRecord[]> => {
    const response = await request<{ region_id: string; days: number; series: TrendRecord[] }>(
      `/api/regions/${encodeURIComponent(regionId)}/trends?days=${days}`,
    );
    return response.series;
  },

  runDetection: () =>
    request<{
      run_id: string;
      status: string;
      observations_evaluated: number;
      alerts_created: number;
      alerts_updated: number;
      alerts?: Array<{ alert_id: string; region_id: string; review_priority: string }>;
    }>("/api/detection/run", { method: "POST" }),

  updateAlertStatus: (id: string, status: string, findings?: string, outcome?: string) =>
    request<{ investigation: InvestigationRecord }>(`/api/alerts/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      body: JSON.stringify({
        status,
        ...(findings !== undefined ? { findings } : {}),
        ...(outcome !== undefined ? { outcome } : {}),
      }),
    }),

  createInvestigation: (id: string, findings: string) =>
    request<{ investigation: InvestigationRecord }>(`/api/alerts/${encodeURIComponent(id)}/investigations`, {
      method: "POST",
      body: JSON.stringify({
        status: "assigned",
        findings,
      }),
    }),

  assignReviewer: (id: string, reviewerId: string, note?: string) =>
    request<{ investigation: InvestigationRecord }>(`/api/alerts/${encodeURIComponent(id)}/assignment`, {
      method: "PATCH",
      body: JSON.stringify({ reviewer_id: reviewerId, ...(note ? { note } : {}) }),
    }),

  addInvestigationNote: (id: string, note: string) =>
    request<{ event: AuditEventRecord }>(`/api/alerts/${encodeURIComponent(id)}/notes`, {
      method: "POST",
      body: JSON.stringify({ note }),
    }),

  auditHistory: (id: string, limit = 100) =>
    request<{ alert_id: string; items: AuditEventRecord[] }>(
      `/api/alerts/${encodeURIComponent(id)}/history?limit=${limit}`,
    ),

  reviewerMe: () => request<CurrentReviewer>("/api/reviewers/me"),

  assignableReviewers: async (): Promise<ReviewerProfile[]> => {
    const response = await request<{ items: ReviewerProfile[] }>("/api/reviewers/assignable");
    return response.items;
  },

  reviewers: async (): Promise<ReviewerProfile[]> => {
    const response = await request<{ items: ReviewerProfile[] }>("/api/reviewers");
    return response.items;
  },

  setReviewerRole: (userId: string, role: "pending" | "reviewer") =>
    request<{ reviewer: ReviewerProfile }>(`/api/reviewers/${encodeURIComponent(userId)}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),
};
