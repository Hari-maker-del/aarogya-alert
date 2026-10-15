const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").replace(/\/+$/, "");

export interface AlertRecord {
  alert_id: string;
  region_id: string;
  region_name: string;
  indicator_type: string;
  observed_value: number;
  expected_baseline: number;
  percentage_change: number;
  anomaly_score: number;
  review_priority: string;
  supporting_evidence: string[];
  uncertainty_notes: string[];
  data_quality_status: string;
  investigation_status: string;
}

export interface RegionRecord {
  region_id: string;
  region_name: string;
  latitude?: number;
  longitude?: number;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    }
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`API request failed (${response.status}): ${message || response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  health: () => request<{ status: string; version?: string }>("/api/health"),
  regions: () => request<RegionRecord[]>("/api/regions"),
  mapData: () => request<unknown>("/api/regions/map-data"),
  alerts: (params?: { region_id?: string; review_priority?: string; investigation_status?: string }) => {
    const query = new URLSearchParams();
    if (params?.region_id) query.set("region_id", params.region_id);
    if (params?.review_priority) query.set("review_priority", params.review_priority);
    if (params?.investigation_status) query.set("investigation_status", params.investigation_status);
    return request<AlertRecord[]>(`/api/alerts${query.size ? `?${query.toString()}` : ""}`);
  },
  alertDetails: (id: string) => request<AlertRecord>(`/api/alerts/${encodeURIComponent(id)}`),
  alertSummary: () => request<Record<string, unknown>>("/api/alerts/summary"),
  updateAlertStatus: (id: string, status: string) =>
    request<AlertRecord>(`/api/alerts/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ investigation_status: status })
    })
};
