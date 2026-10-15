import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  Database,
  FileText,
  Filter,
  FlaskConical,
  HeartPulse,
  Info,
  Layers,
  MapPin,
  MapPinned,
  Menu,
  Radio,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Stethoscope,
  Thermometer,
  Users,
  Waves,
  X,
  Pill,
  Send,
  CircleGauge,
  BarChart3,
  Bookmark,
  BookmarkCheck,
  Download,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { latLngBounds } from "leaflet";
import RegionalMap from "./components/RegionalMap";
import LandingPage from "./components/LandingPage";
import { api, type BackendAlert, type BackendHealth, type InvestigationRecord, type RegionRecord, type ReviewerProfile, type ReviewerRole, type TrendRecord } from "./services/api";
import { consumeAuthRedirect, getValidAuthSession, isAuthConfigured, signInWithPassword, signOutReviewer, signUpReviewer, type AuthUser } from "./services/auth";
import "./App.css";
import type { AlertItem } from "./types";

type Page = "Signal Room" | "Regional Map" | "Alert Queue" | "Investigations" | "Watchlist" | "Data Governance" | "Settings" | "Access Review";
type PriorityFilter = "All" | "Urgent" | "Elevated" | "Watch" | "Baseline";

const fallbackAlerts: BackendAlert[] = [
  {
    alert_id: "ALT-DEMO-01",
    region_id: "REG-DEMO-01",
    region_name: "Demo North",
    indicator_type: "respiratory_medicine_demand",
    observed_value: 61,
    expected_baseline: 38,
    absolute_difference: 23,
    percentage_change: 61,
    anomaly_score: 4.2,
    review_priority: "priority_review",
    contributing_signals: ["pharmacy_demand_anomaly"],
    supporting_evidence: ["Synthetic pharmacy demand is above its illustrative baseline."],
    uncertainty_notes: ["Local fallback scenario only; not a confirmed illness event or outbreak."],
    recommended_verification_steps: ["Verify data completeness and look for independent aggregate signals."],
    data_quality_status: "demo",
    investigation_status: "new",
    active: true,
  },
  {
    alert_id: "ALT-DEMO-02",
    region_id: "REG-DEMO-02",
    region_name: "Demo East",
    indicator_type: "fever_clinic_visits",
    observed_value: 42,
    expected_baseline: 31,
    absolute_difference: 11,
    percentage_change: 35,
    anomaly_score: 2.8,
    review_priority: "needs_review",
    contributing_signals: ["clinic_indicator_anomaly"],
    supporting_evidence: ["Synthetic clinic activity differs from its illustrative historical baseline."],
    uncertainty_notes: ["The example requires human review and independent corroboration."],
    recommended_verification_steps: ["Check completeness and delayed reporting in the demo feed."],
    data_quality_status: "demo",
    investigation_status: "investigating",
    active: true,
  },
  {
    alert_id: "ALT-DEMO-03",
    region_id: "REG-DEMO-03",
    region_name: "Demo Central",
    indicator_type: "gastrointestinal_clinic_visits",
    observed_value: 28,
    expected_baseline: 25,
    absolute_difference: 3,
    percentage_change: 12,
    anomaly_score: 1.9,
    review_priority: "watch",
    contributing_signals: ["single_indicator_watch"],
    supporting_evidence: ["A small illustrative deviation was included for watch-list demonstration."],
    uncertainty_notes: ["More observations would be needed even in a real-world review."],
    recommended_verification_steps: ["Continue routine review of future aggregate observations."],
    data_quality_status: "demo",
    investigation_status: "assigned",
    active: true,
  },
];

const fallbackRegions: RegionRecord[] = [
  { region_id: "REG-DEMO-01", region_name: "Demo North", latitude: 13.18, longitude: 80.24, population_band: "synthetic" },
  { region_id: "REG-DEMO-02", region_name: "Demo East", latitude: 13.04, longitude: 80.31, population_band: "synthetic" },
  { region_id: "REG-DEMO-03", region_name: "Demo Central", latitude: 13.07, longitude: 80.21, population_band: "synthetic" },
  { region_id: "REG-DEMO-04", region_name: "Demo South", latitude: 12.91, longitude: 80.22, population_band: "synthetic" },
  { region_id: "REG-DEMO-05", region_name: "Demo West", latitude: 13.08, longitude: 80.12, population_band: "synthetic" },
];

const navigation: { label: Page; icon: typeof Activity }[] = [
  { label: "Signal Room", icon: Radio },
  { label: "Regional Map", icon: MapPinned },
  { label: "Alert Queue", icon: Bell },
  { label: "Investigations", icon: FlaskConical },
  { label: "Watchlist", icon: Bookmark },
  { label: "Data Governance", icon: ShieldCheck },
  { label: "Settings", icon: Settings },
  { label: "Access Review", icon: Users },
];

const priorityRank: Record<string, number> = {
  priority_review: 4,
  needs_review: 3,
  watch: 2,
  normal: 1,
};

const indicatorLabels: Record<string, string> = {
  respiratory_medicine_demand: "Respiratory medicine demand",
  fever_clinic_visits: "Fever clinic visits",
  gastrointestinal_clinic_visits: "Gastrointestinal clinic visits",
};

function formatIndicator(value: string) {
  return indicatorLabels[value] ?? value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function priorityLabel(priority: string): string {
  if (priority === "priority_review") return "Urgent";
  if (priority === "needs_review") return "Elevated";
  if (priority === "watch") return "Watch";
  return "Baseline";
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    new: "Needs review",
    assigned: "Assigned",
    investigating: "Under review",
    escalated: "Escalated",
    closed: "Closed",
    dismissed: "Dismissed",
  };
  return labels[status] ?? status.replace(/_/g, " ");
}

function priorityClass(priority: string): string {
  return "severity-" + priorityLabel(priority).toLowerCase();
}

function shortDate(value?: string | null): string {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function compactNumber(value?: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(value);
}

function percentText(value?: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Not available";
  return (value > 0 ? "+" : "") + compactNumber(value) + "%";
}

function toDisplayAlert(alert: BackendAlert): AlertItem {
  const priority = alert.review_priority === "priority_review" ? "High" : alert.review_priority === "needs_review" ? "Medium" : "Low";
  const status = ["investigating", "assigned", "escalated"].includes(alert.investigation_status)
    ? "Under investigation"
    : ["closed", "dismissed"].includes(alert.investigation_status)
      ? "Monitoring"
      : "Needs review";
  return {
    id: alert.alert_id,
    region: alert.region_name,
    regionId: alert.region_id,
    indicator: formatIndicator(alert.indicator_type),
    change: Math.round(alert.percentage_change ?? 0),
    priority,
    status,
    reason: [alert.supporting_evidence?.[0], alert.uncertainty_notes?.[0]].filter(Boolean).join(" "),
  };
}

function FitSignalMapRegions({ regions }: { regions: RegionRecord[] }) {
  const map = useMap();
  useEffect(() => {
    const validRegions = regions.filter((region) => Number.isFinite(region.latitude) && Number.isFinite(region.longitude));
    if (!validRegions.length) return;

    if (validRegions.length === 1) {
      map.setView([validRegions[0].latitude, validRegions[0].longitude], 8, { animate: false });
    } else {
      const bounds = latLngBounds(validRegions.map((region) => [region.latitude, region.longitude] as [number, number]));
      map.fitBounds(bounds, { padding: [26, 26], maxZoom: 7, animate: false });
    }
    map.invalidateSize();
  }, [map, regions]);
  return null;
}

function SignalMap({
  regions,
  alerts,
  selectedId,
  onSelectAlert,
}: {
  regions: RegionRecord[];
  alerts: BackendAlert[];
  selectedId: string | null;
  onSelectAlert: (alertId: string) => void;
}) {
  const center = useMemo<[number, number]>(() => {
    if (!regions.length) return [20.2, 78.4];
    return [
      regions.reduce((sum, region) => sum + region.latitude, 0) / regions.length,
      regions.reduce((sum, region) => sum + region.longitude, 0) / regions.length,
    ];
  }, [regions]);

  const regionRank = useMemo(() => {
    const result: Record<string, BackendAlert | undefined> = {};
    for (const region of regions) {
      result[region.region_id] = alerts
        .filter((alert) => alert.region_id === region.region_id)
        .sort((a, b) => (priorityRank[b.review_priority] ?? 0) - (priorityRank[a.review_priority] ?? 0))[0];
    }
    return result;
  }, [alerts, regions]);

  const pointColor = (priority?: string) => {
    if (priority === "priority_review") return "#b84040";
    if (priority === "needs_review") return "#c76c32";
    if (priority === "watch") return "#b77927";
    return "#36765c";
  };

  return (
    <div className="signal-map-canvas">
      {regions.length ? (
        <MapContainer center={center} zoom={5} minZoom={3} maxZoom={10} scrollWheelZoom className="signal-leaflet-map">
          <FitSignalMapRegions regions={regions} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {regions.map((region) => {
            const alert = regionRank[region.region_id];
            const selected = alert?.alert_id === selectedId;
            return (
              <CircleMarker
                key={region.region_id}
                center={[region.latitude, region.longitude]}
                radius={selected ? 10 : alert ? 8 : 5}
                pathOptions={{
                  color: "#fffdf8",
                  weight: selected ? 3 : 2,
                  fillColor: pointColor(alert?.review_priority),
                  fillOpacity: alert ? 0.94 : 0.58,
                }}
                eventHandlers={{
                  click: () => {
                    if (alert) onSelectAlert(alert.alert_id);
                  },
                }}
              >
                <Popup>
                  <strong>{region.region_name}</strong><br />
                  {alert ? priorityLabel(alert.review_priority) + " review · " + formatIndicator(alert.indicator_type) : "No active synthetic alert"}<br />
                  {alert ? "Change: " + percentText(alert.percentage_change) : "Synthetic region"}
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      ) : (
        <div className="map-loading"><span className="loading-mark" />Loading regional telemetry…</div>
      )}
      <div className="map-scale-note"><MapPin size={12} /> Fictional broad-region centroids · not facility locations</div>
    </div>
  );
}

function App() {
  const [activePage, setActivePage] = useState<Page>("Signal Room");
  const [health, setHealth] = useState<BackendHealth | null>(null);
  const [alerts, setAlerts] = useState<BackendAlert[]>([]);
  const [regions, setRegions] = useState<RegionRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetails, setSelectedDetails] = useState<BackendAlert | null>(null);
  const [trendRecords, setTrendRecords] = useState<TrendRecord[]>([]);
  const [backendConnected, setBackendConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [runningDetection, setRunningDetection] = useState(false);
  const [savingAction, setSavingAction] = useState(false);
  const [actorId, setActorId] = useState("demo-reviewer-1");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authRole, setAuthRole] = useState<ReviewerRole>("pending");
  const [reviewerAccounts, setReviewerAccounts] = useState<ReviewerProfile[]>([]);
  const [reviewersLoading, setReviewersLoading] = useState(false);
  const [reviewerActionId, setReviewerActionId] = useState<string | null>(null);
  const [showLanding, setShowLanding] = useState(true);
  const [showAuth, setShowAuth] = useState(false);
  const [showGettingStarted, setShowGettingStarted] = useState(() => {
    try {
      return window.localStorage.getItem("aarogya-alert-dashboard-intro-dismissed") !== "true";
    } catch {
      return true;
    }
  });
  const [authMode, setAuthMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [indicatorFilter, setIndicatorFilter] = useState("All");
  const [trendDays, setTrendDays] = useState(14);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [watchlistIds, setWatchlistIds] = useState<string[]>(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem("aarogya-alert-watchlist") ?? "[]");
      return Array.isArray(stored) ? stored.filter((value): value is string => typeof value === "string") : [];
    } catch { return []; }
  });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [auditNote, setAuditNote] = useState("");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [alertSummary, setAlertSummary] = useState<{ active_alert_count: number; by_review_priority: Record<string, number>; by_investigation_status: Record<string, number> } | null>(null);

  const refreshData = useCallback(async (announce = false) => {
    setRefreshing(true);
    setError("");
    try {
      const healthResult = await api.health();
      if (healthResult.status !== "ok") throw new Error("Backend health check did not return OK.");

      let alertResults = await api.alerts();
      if (alertResults.length === 0) {
        await api.runDetection();
        alertResults = await api.alerts();
      }
      const [regionResults, summaryResult] = await Promise.all([api.regions(), api.alertSummary()]);
      setHealth(healthResult);
      setAlerts(alertResults);
      setRegions(regionResults);
      setAlertSummary(summaryResult);
      setBackendConnected(true);
      setLastUpdated(new Date().toISOString());
      setSelectedId((current) => (current && alertResults.some((a) => a.alert_id === current) ? current : alertResults[0]?.alert_id ?? null));
      if (announce) setNotice("Backend sync complete. Loaded " + alertResults.length + " synthetic alert records.");
    } catch (err) {
      setBackendConnected(false);
      setHealth(null);
      setAlertSummary(null);
      setAlerts((current) => current.length ? current : fallbackAlerts);
      setRegions((current) => current.length ? current : fallbackRegions);
      setSelectedId((current) => current ?? fallbackAlerts[0].alert_id);
      setError("The live API could not be reached. The interface is showing clearly labelled local synthetic fallback data.");
      if (announce) setNotice("Showing local fallback data because the backend could not be reached.");
      void err;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function restoreReviewerSession() {
      try {
        const callbackSession = await consumeAuthRedirect();
        const session = callbackSession ?? await getValidAuthSession();
        if (cancelled || !session) return;
        setAuthUser(session.user);
        setActorId(session.user.id);
        const profile = await api.reviewerMe();
        if (cancelled) return;
        setAuthRole(profile.role);
        await refreshData(false);
      } catch (err) {
        if (!cancelled && err instanceof Error) setAuthMessage(err.message);
      }
    }
    void restoreReviewerSession();
    return () => { cancelled = true; };
  }, [refreshData]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  useEffect(() => {
    try { window.localStorage.setItem("aarogya-alert-watchlist", JSON.stringify(watchlistIds)); }
    catch { /* Keep saved IDs in memory if browser storage is unavailable. */ }
  }, [watchlistIds]);

  useEffect(() => {
    if (activePage !== "Access Review" || authRole !== "admin") return;
    let cancelled = false;
    setReviewersLoading(true);
    api.reviewers().then((items) => {
      if (!cancelled) setReviewerAccounts(items);
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : "Could not load reviewer accounts.");
    }).finally(() => {
      if (!cancelled) setReviewersLoading(false);
    });
    return () => { cancelled = true; };
  }, [activePage, authRole]);

  useEffect(() => {
    if (authRole !== "admin" && activePage === "Access Review") setActivePage("Signal Room");
  }, [authRole, activePage]);

  useEffect(() => {
    if (!autoRefresh) return;
    const intervalId = window.setInterval(() => { void refreshData(false); }, 60_000);
    return () => window.clearInterval(intervalId);
  }, [autoRefresh, refreshData]);

  const selectedAlert = useMemo(
    () => alerts.find((alert) => alert.alert_id === selectedId) ?? alerts[0] ?? null,
    [alerts, selectedId],
  );

  useEffect(() => {
    let cancelled = false;
    if (!backendConnected || !selectedAlert) {
      setSelectedDetails(null);
      return () => { cancelled = true; };
    }
    api.alertDetails(selectedAlert.alert_id).then((details) => {
      if (!cancelled) setSelectedDetails(details);
    }).catch(() => {
      if (!cancelled) setSelectedDetails(null);
    });
    return () => { cancelled = true; };
  }, [authUser?.id, backendConnected, selectedAlert?.alert_id]);

  const dossierAlert = selectedDetails?.alert_id === selectedAlert?.alert_id ? selectedDetails : selectedAlert;

  useEffect(() => {
    let cancelled = false;
    async function loadTrend() {
      if (!selectedAlert?.region_id || !backendConnected) {
        setTrendRecords([]);
        return;
      }
      try {
        const records = await api.trends(selectedAlert.region_id, trendDays);
        if (!cancelled) setTrendRecords(records.filter((record) => record.indicator_type === selectedAlert.indicator_type));
      } catch {
        if (!cancelled) setTrendRecords([]);
      }
    }
    void loadTrend();
    return () => {
      cancelled = true;
    };
  }, [backendConnected, selectedAlert?.indicator_type, selectedAlert?.region_id, trendDays]);

  const matchingAlerts = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return alerts.filter((alert) => {
      const matchesSearch = !normalized || [
        alert.alert_id,
        alert.region_name,
        alert.region_id,
        formatIndicator(alert.indicator_type),
        alert.review_priority,
      ].join(" ").toLowerCase().includes(normalized);
      const matchesPriority = priorityFilter === "All" || priorityLabel(alert.review_priority) === priorityFilter;
      const matchesStatus = statusFilter === "All" || alert.investigation_status === statusFilter;
      const matchesIndicator = indicatorFilter === "All" || alert.indicator_type === indicatorFilter;
      const matchesPage = activePage === "Watchlist"
        ? watchlistIds.includes(alert.alert_id)
        : activePage === "Signal Room"
        ? alert.active !== false && !["closed", "dismissed"].includes(alert.investigation_status)
        : activePage === "Investigations"
          ? ["assigned", "investigating", "escalated"].includes(alert.investigation_status)
          : true;
      return matchesSearch && matchesPriority && matchesStatus && matchesIndicator && matchesPage;
    }).sort((a, b) => (priorityRank[b.review_priority] ?? 0) - (priorityRank[a.review_priority] ?? 0));
  }, [activePage, alerts, indicatorFilter, priorityFilter, search, statusFilter, watchlistIds]);

  const activeAlerts = alerts.filter((alert) => alert.active !== false && !["closed", "dismissed"].includes(alert.investigation_status));
  const comparisonChartData = useMemo(() => {
    const bestByRegion = new Map<string, { alert: BackendAlert; observed: number; baseline: number }>();
    for (const alert of alerts) {
      const observed = alert.observed_value;
      const baseline = alert.expected_baseline;
      if (alert.active === false || ["closed", "dismissed"].includes(alert.investigation_status) || observed === null || baseline === null) continue;
      const previous = bestByRegion.get(alert.region_id);
      if (!previous || (priorityRank[alert.review_priority] ?? 0) > (priorityRank[previous.alert.review_priority] ?? 0)) {
        bestByRegion.set(alert.region_id, { alert, observed, baseline });
      }
    }
    return Array.from(bestByRegion.values())
      .sort((a, b) => (priorityRank[b.alert.review_priority] ?? 0) - (priorityRank[a.alert.review_priority] ?? 0))
      .slice(0, 8)
      .map(({ alert, observed, baseline }) => ({
        region: alert.region_name,
        indicator: formatIndicator(alert.indicator_type),
        observed,
        baseline,
      }));
  }, [alerts]);
  const urgentCount = activeAlerts.filter((alert) => alert.review_priority === "priority_review").length;
  const elevatedCount = activeAlerts.filter((alert) => alert.review_priority === "needs_review").length;
  const watchCount = activeAlerts.filter((alert) => alert.review_priority === "watch").length;
  const underReviewCount = alerts.filter((alert) => ["assigned", "investigating", "escalated"].includes(alert.investigation_status)).length;
  const currentTrend = useMemo(() => {
    const byDate = new Map<string, { day: string; observed: number | null }>();
    for (const record of [...trendRecords].sort((a, b) => a.observation_date.localeCompare(b.observation_date))) {
      byDate.set(record.observation_date, {
        day: shortDate(record.observation_date),
        observed: record.is_suppressed ? null : record.aggregated_count,
      });
    }
    return Array.from(byDate.values());
  }, [trendRecords]);

  const pageTitle: Record<Page, string> = {
    "Signal Room": "Public health signal room",
    "Regional Map": "Regional signal map",
    "Alert Queue": "Alert queue",
    Investigations: "Investigation workbench",
    Watchlist: "Saved alert watchlist",
    "Data Governance": "Data governance",
    Settings: "System settings",
    "Access Review": "Reviewer access approvals",
  };
  const pageDescription: Record<Page, string> = {
    "Signal Room": "Start with the signals needing attention, then compare observations, context and uncertainty.",
    "Regional Map": "Explore fictional regional centroids and inspect which aggregate signals are associated with each area.",
    "Alert Queue": "Search, filter and inspect individual signal records. A priority label is a review aid, not a confirmed event.",
    Investigations: "Track assigned work, record findings and keep investigation decisions traceable.",
    Watchlist: "Return to signals you saved in this browser for closer review.",
    "Data Governance": "Review dataset boundaries, privacy safeguards and the limitations of this demonstration.",
    Settings: "Check service connectivity, authentication status and refresh preferences.",
    "Access Review": "Approve or suspend reviewer accounts. Role changes are restricted to administrators and logged.",
  };

  async function updateAlertStatus(status: string) {
    if (!selectedAlert) return;
    setSavingAction(true);
    setError("");
    try {
      if (backendConnected) {
        await api.updateAlertStatus(selectedAlert.alert_id, status);
        await refreshData(false);
        setSelectedId(selectedAlert.alert_id);
        setSelectedDetails(await api.alertDetails(selectedAlert.alert_id));
        setNotice("Updated " + selectedAlert.alert_id + " to " + statusLabel(status) + ".");
      } else {
        setAlerts((current) => current.map((alert) => alert.alert_id === selectedAlert.alert_id ? { ...alert, investigation_status: status } : alert));
        setNotice("Updated the local synthetic fallback record.");
      }
    } catch {
      setError("The status change could not be saved. Check the connection and try again.");
    } finally {
      setSavingAction(false);
      window.setTimeout(() => setNotice(""), 4200);
    }
  }

  async function addAuditNote() {
    const note = auditNote.trim();
    if (!selectedAlert || !note) return;
    setSavingAction(true);
    setError("");
    try {
      if (backendConnected) {
        await api.addInvestigationNote(selectedAlert.alert_id, note);
        await refreshData(false);
        setSelectedId(selectedAlert.alert_id);
        setSelectedDetails(await api.alertDetails(selectedAlert.alert_id));
        setNotice("Investigation note saved to the audit history.");
      } else {
        setAlerts((current) => current.map((alert) => alert.alert_id === selectedAlert.alert_id
          ? { ...alert, investigation_status: "assigned", investigations: [...(alert.investigations ?? []), { investigation_id: "LOCAL-NOTE", alert_id: alert.alert_id, status: "assigned", reviewer_id: "demo-reviewer-1", findings: note }] as InvestigationRecord[] }
          : alert));
        setNotice("Note added to the local fallback session.");
      }
      setAuditNote("");
    } catch {
      setError("The note could not be saved. Please retry.");
    } finally {
      setSavingAction(false);
      window.setTimeout(() => setNotice(""), 4200);
    }
  }

  async function assignReviewer(reviewerId: string) {
    const normalized = reviewerId.trim();
    if (!selectedAlert || !normalized) return;
    setSavingAction(true);
    setError("");
    try {
      if (!backendConnected) throw new Error("A live backend connection is required to assign a reviewer.");
      await api.assignReviewer(selectedAlert.alert_id, normalized);
      await refreshData(false);
      setSelectedId(selectedAlert.alert_id);
      setSelectedDetails(await api.alertDetails(selectedAlert.alert_id));
      setNotice("Assigned " + selectedAlert.alert_id + " to " + normalized + ".");
    } catch {
      setError("Reviewer assignment could not be saved. Check the connection and try again.");
    } finally {
      setSavingAction(false);
      window.setTimeout(() => setNotice(""), 4200);
    }
  }


  async function submitReviewerAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthMessage("");
    try {
      if (authMode === "sign_in") {
        const session = await signInWithPassword(authEmail, authPassword);
        setAuthUser(session.user);
        setActorId(session.user.id);
        const profile = await api.reviewerMe();
        setAuthRole(profile.role);
        setShowAuth(false);
        setAuthPassword("");
        setNotice(profile.role === "pending"
          ? "Signed in. Your reviewer access is pending administrator approval."
          : "Reviewer signed in. Workflow changes will be attributed to your verified account.");
        await refreshData(false);
        if (selectedId) setSelectedDetails(await api.alertDetails(selectedId).catch(() => null));
      } else {
        const result = await signUpReviewer(authEmail, authPassword);
        if (result.session) {
          setAuthUser(result.session.user);
          setActorId(result.session.user.id);
          const profile = await api.reviewerMe();
          setAuthRole(profile.role);
          setShowAuth(false);
          setAuthPassword("");
          setNotice(profile.role === "pending"
            ? "Account created. Check your email if confirmation is required; reviewer access stays pending until an administrator approves it."
            : "Reviewer account created and signed in.");
          await refreshData(false);
        } else {
          setAuthMessage("Check your email and open the confirmation link. It will return you to AAROGYA ALERT. After confirmation, sign in; an administrator must approve reviewer access.");
          setAuthMode("sign_in");
        }
      }
    } catch (err) {
      setAuthMessage(err instanceof Error ? err.message : "Authentication failed. Please retry.");
    } finally {
      setAuthBusy(false);
      window.setTimeout(() => setNotice(""), 5000);
    }
  }

  async function handleReviewerSignOut() {
    await signOutReviewer();
    setAuthUser(null);
    setAuthRole("pending");
    setReviewerAccounts([]);
    setActorId("demo-reviewer-1");
    setAuthMessage("");
    setNotice("Signed out. Review changes are disabled until a reviewer signs in.");
    if (selectedId) setSelectedDetails(await api.alertDetails(selectedId).catch(() => null));
    window.setTimeout(() => setNotice(""), 4200);
  }

  async function changeReviewerRole(userId: string, role: "pending" | "reviewer") {
    setReviewerActionId(userId);
    setError("");
    try {
      await api.setReviewerRole(userId, role);
      setReviewerAccounts(await api.reviewers());
      setNotice(role === "reviewer" ? "Reviewer access approved." : "Reviewer access suspended.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update reviewer access.");
    } finally {
      setReviewerActionId(null);
      window.setTimeout(() => setNotice(""), 4500);
    }
  }

  function toggleWatchlist(alertId: string) {
    const wasSaved = watchlistIds.includes(alertId);
    setWatchlistIds((current) => wasSaved ? current.filter((id) => id !== alertId) : [...current, alertId]);
    setNotice(wasSaved ? "Alert removed from your saved watchlist." : "Alert saved to your browser watchlist.");
    window.setTimeout(() => setNotice(""), 3200);
  }

  function clearAlertFilters() {
    setSearch(""); setPriorityFilter("All"); setStatusFilter("All"); setIndicatorFilter("All");
  }

  function exportAlertsCsv() {
    if (!matchingAlerts.length) {
      setNotice("There are no matching alert records to export.");
      window.setTimeout(() => setNotice(""), 3200);
      return;
    }
    const rows: Array<Array<string | number | null | undefined>> = [
      ["Alert ID", "Region", "Region ID", "Indicator", "Priority", "Investigation status", "Observation date", "Observed aggregate", "Expected baseline", "Difference", "Percentage change", "Anomaly score", "Data quality", "Supporting evidence", "Uncertainty notes"],
      ...matchingAlerts.map((alert) => [alert.alert_id, alert.region_name, alert.region_id, formatIndicator(alert.indicator_type), priorityLabel(alert.review_priority), statusLabel(alert.investigation_status), alert.observation_date ?? alert.detected_at ?? "", alert.observed_value, alert.expected_baseline, alert.absolute_difference, alert.percentage_change, alert.anomaly_score, alert.data_quality_status, (alert.supporting_evidence ?? []).join(" | "), (alert.uncertainty_notes ?? []).join(" | ")]),
    ];
    const quote = String.fromCharCode(34);
    const csv = rows.map((row) => row.map((value) => {
      const cell = value == null ? "" : String(value);
      return quote + cell.split(quote).join(quote + quote) + quote;
    }).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "aarogya-alert-" + activePage.toLowerCase().replace(/\s+/g, "-") + "-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    setNotice("Exported " + matchingAlerts.length + " alert records to CSV.");
    window.setTimeout(() => setNotice(""), 3200);
  }

  async function runDetection() {
    setRunningDetection(true);
    setError("");
    try {
      if (!backendConnected) throw new Error("The backend is not connected.");
      const result = await api.runDetection();
      await refreshData(false);
      setNotice("Detection complete: " + result.observations_evaluated + " observations evaluated; " + result.alerts_created + " alerts created; " + result.alerts_updated + " updated.");
    } catch {
      setError("Detection requires a live backend connection. Local fallback data was left unchanged.");
    } finally {
      setRunningDetection(false);
      window.setTimeout(() => setNotice(""), 5200);
    }
  }

  const showWorkspace = activePage === "Signal Room" || activePage === "Regional Map" || activePage === "Alert Queue" || activePage === "Investigations" || activePage === "Watchlist";
  const primaryStatus = selectedAlert ? statusLabel(selectedAlert.investigation_status) : "No selection";
  const selectedTrend = currentTrend.length ? currentTrend : [
    { day: "Baseline", observed: selectedAlert?.expected_baseline ?? null },
    { day: "Observed", observed: selectedAlert?.observed_value ?? null },
  ];
  const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
  const canReview = authRole === "reviewer" || authRole === "admin";

  return (
    <div className="app-shell">
      {showAuth && <div role="presentation" onClick={() => setShowAuth(false)} style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(25, 27, 30, .45)", display: "grid", placeItems: "center", padding: 16 }}>
        <section role="dialog" aria-modal="true" aria-labelledby="reviewer-auth-title" onClick={(event) => event.stopPropagation()} style={{ width: "min(440px, 100%)", background: "#fffdf8", color: "#252524", padding: 24, borderRadius: 16, boxShadow: "0 24px 80px rgba(0,0,0,.24)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}><div><p style={{ margin: 0, fontSize: 11, letterSpacing: 1.4 }}>SECURE REVIEW WORKSPACE</p><h2 id="reviewer-auth-title" style={{ margin: "8px 0 4px" }}>{authMode === "sign_in" ? "Reviewer sign in" : "Create reviewer account"}</h2></div><button type="button" className="icon-button" aria-label="Close authentication" onClick={() => setShowAuth(false)}><X size={17} /></button></div>
          <p style={{ fontSize: 13, lineHeight: 1.5, color: "#686762" }}>Authenticated reviewers can assign investigations and add notes to the persistent audit trail. Your user UUID identifies the actor on each write.</p>
          {!isAuthConfigured() && <p role="alert">Authentication configuration is missing.</p>}
          <form onSubmit={submitReviewerAuth} style={{ display: "grid", gap: 12 }}>
            <label style={{ display: "grid", gap: 5, fontSize: 13 }}>Email<input type="email" autoComplete="email" required value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} style={{ padding: 11, border: "1px solid #d7d2c8", borderRadius: 8 }} /></label>
            <label style={{ display: "grid", gap: 5, fontSize: 13 }}>Password<input type="password" autoComplete={authMode === "sign_in" ? "current-password" : "new-password"} minLength={8} required value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} style={{ padding: 11, border: "1px solid #d7d2c8", borderRadius: 8 }} /></label>
            {authMessage && <p role="status" style={{ margin: 0, fontSize: 13, color: "#a33b32" }}>{authMessage}</p>}
            <button className="button button-primary" disabled={authBusy || !isAuthConfigured()} type="submit">{authBusy ? "Please wait…" : authMode === "sign_in" ? "Sign in securely" : "Create reviewer account"}</button>
          </form>
          <p style={{ fontSize: 13, marginBottom: 0 }}>{authMode === "sign_in" ? "New reviewer? " : "Already registered? "}<button type="button" className="text-link" onClick={() => { setAuthMode(authMode === "sign_in" ? "sign_up" : "sign_in"); setAuthMessage(""); }}>{authMode === "sign_in" ? "Create an account" : "Sign in"}</button></p>
        </section>
      </div>}
      {showLanding && !authUser ? (
        <LandingPage
          onExplore={() => setShowLanding(false)}
          onSignIn={() => {
            setAuthMode("sign_in");
            setAuthMessage("");
            setShowAuth(true);
          }}
        />
      ) : (
        <>
      {mobileNavOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
      <aside className={"sidebar " + (mobileNavOpen ? "sidebar-open" : "")}>
        <div className="brand">
          <div className="brand-mark"><Activity size={22} strokeWidth={2.1} /></div>
          <div className="brand-copy">
            <span className="brand-title">AAROGYA ALERT</span>
            <span className="brand-subtitle">PUBLIC HEALTH INTELLIGENCE</span>
          </div>
          <button className="icon-button sidebar-close" aria-label="Close menu" onClick={() => setMobileNavOpen(false)}><X size={18} /></button>
        </div>

        <div className="nav-heading">SURVEILLANCE DOMAINS</div>
        <nav className="main-navigation">
          {navigation.filter(({ label }) => label !== "Access Review" || authRole === "admin").map(({ label, icon: Icon }) => (
            <button
              key={label}
              aria-current={activePage === label ? "page" : undefined}
              className={"nav-item " + (activePage === label ? "nav-active" : "")}
              onClick={() => { setActivePage(label); setMobileNavOpen(false); }}
            >
              <Icon size={17} strokeWidth={1.8} />
              <span>{label}</span>
              {label === "Alert Queue" && <span className="nav-count">{activeAlerts.length}</span>}
              {label === "Investigations" && <span className="nav-meta">{underReviewCount}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="feed-status">
            <span className={"status-light " + (backendConnected ? "status-connected" : "status-fallback")} />
            <div className="feed-copy">
              <strong>{backendConnected ? "API connection active" : "Local demo mode"}</strong>
              <span>{backendConnected ? "Synthetic dataset loaded" : "Backend connection unavailable"}</span>
            </div>
            <span className="feed-live">{backendConnected ? "API" : "DEMO"}</span>
          </div>
          <div className="profile-row">
            <div className="profile-avatar">PH</div>
            <div className="profile-copy"><strong>Public Health Team</strong><span>Demo reviewer workspace</span></div>
            <ChevronDown size={14} />
          </div>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="topbar-primary">
            <div className="topbar-left">
              <button className="icon-button mobile-menu" aria-label="Open menu" onClick={() => setMobileNavOpen(true)}><Menu size={20} /></button>
              <div className="breadcrumb"><span>Surveillance</span><ChevronRight size={13} /><strong>{activePage}</strong></div>
            </div>
            <div className="topbar-actions">
              <div className="environment-note">
                <Info size={13} />
                <span>DEMO ENVIRONMENT</span>
                <i />
                <span>Data through {shortDate(health?.dataset.latest_observation_date)}</span>
              </div>
              <label className="global-search">
                <Search size={15} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search indicator, region or alert ID…" aria-label="Search alert records" />
                {search && <button aria-label="Clear search" onClick={() => setSearch("")}><X size={13} /></button>}
              </label>
              {authUser ? <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}><span title={authUser.id} style={{ maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>{authUser.email || authUser.id}</span><span className="small-tag">{authRole === "admin" ? "ADMIN" : authRole === "reviewer" ? "REVIEWER" : "PENDING"}</span><button className="button button-quiet" title={authUser.id} onClick={() => { void navigator.clipboard.writeText(authUser.id).then(() => setNotice("Reviewer UUID copied to clipboard.")).catch(() => setNotice("Reviewer UUID: " + authUser.id)); }}>Copy ID</button><button className="button button-secondary" onClick={() => void handleReviewerSignOut()}>Sign out</button></div> : <button className="button button-primary" onClick={() => { setAuthMode("sign_in"); setShowAuth(true); }}>Reviewer sign in</button>}
              <button className="icon-button notification-button" aria-label="Open alert queue" onClick={() => setActivePage("Alert Queue")}><Bell size={18} /><span className="notification-dot" /></button>
            </div>
          </div>
          <div className="integrity-banner">
            <ShieldCheck size={15} />
            <p><strong>Investigation signals, not diagnoses.</strong> Alerts support public-health review and are not confirmed diagnoses or outbreak declarations.</p>
            <span><Database size={13} /> SYNTHETIC AGGREGATES ONLY</span>
          </div>
        </header>

        <main className="page-content">
          <div className="page-title-row">
            <div>
              <div className="eyebrow"><span className={"eyebrow-dot " + (backendConnected ? "connected" : "")} /> SURVEILLANCE WORKSPACE / {activePage.toUpperCase()}</div>
              <h1>{pageTitle[activePage]}</h1>
              <p>{pageDescription[activePage]}</p>
            </div>
            <div className="page-actions">
              <button className="button button-secondary" onClick={() => void refreshData(true)} disabled={refreshing}>
                <RefreshCw size={15} className={refreshing ? "spin" : ""} /> Refresh
              </button>
              <button className="button button-primary" onClick={() => void runDetection()} disabled={runningDetection || !backendConnected}>
                <Activity size={15} className={runningDetection ? "spin" : ""} /> {runningDetection ? "Running…" : "Run detection"}
              </button>
            </div>
          </div>

          {activePage === "Signal Room" && showGettingStarted && (
            <section className="getting-started-panel" aria-labelledby="getting-started-title">
              <div className="getting-started-heading">
                <span className="getting-started-icon"><ClipboardCheck size={19} /></span>
                <div>
                  <span className="getting-started-kicker">FIRST VISIT · QUICK START</span>
                  <h2 id="getting-started-title">Know where to begin</h2>
                  <p>Use this workspace to review patterns, not to diagnose people or declare an outbreak.</p>
                </div>
                <button
                  className="getting-started-dismiss"
                  type="button"
                  onClick={() => {
                    setShowGettingStarted(false);
                    try { window.localStorage.setItem("aarogya-alert-dashboard-intro-dismissed", "true"); } catch { /* Keep the current-session preference. */ }
                  }}
                  aria-label="Dismiss quick start guide"
                  title="Dismiss quick start guide"
                ><X size={16} /></button>
              </div>
              <div className="getting-started-steps">
                <button type="button" className="getting-started-step" onClick={() => setActivePage("Alert Queue")}>
                  <span className="getting-started-step-number">01</span>
                  <span><strong>Find a signal</strong><small>Search and filter the alert queue.</small></span>
                  <ChevronRight size={15} />
                </button>
                <button type="button" className="getting-started-step" onClick={() => {
                  document.getElementById("selected-signal-dossier")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}>
                  <span className="getting-started-step-number">02</span>
                  <span><strong>Inspect the evidence</strong><small>Compare observed values with the expected baseline.</small></span>
                  <ChevronRight size={15} />
                </button>
                <button type="button" className="getting-started-step" onClick={() => setActivePage("Data Governance")}>
                  <span className="getting-started-step-number">03</span>
                  <span><strong>Check the limits</strong><small>Read the data-quality and uncertainty notes.</small></span>
                  <ChevronRight size={15} />
                </button>
              </div>
              <div className="getting-started-footer">
                <span><Info size={14} /> Demo values are synthetic. Human verification is required.</span>
                <button type="button" className="text-link" onClick={() => {
                  setShowGettingStarted(false);
                  try { window.localStorage.setItem("aarogya-alert-dashboard-intro-dismissed", "true"); } catch { /* Keep the current-session preference. */ }
                }}>Got it</button>
              </div>
            </section>
          )}

          {notice && <div className="notice-bar" role="status"><CheckCircle2 size={16} /><span>{notice}</span><button aria-label="Dismiss notification" onClick={() => setNotice("")}><X size={14} /></button></div>}
          {error && <div className="error-bar" role="status"><Info size={16} /><span>{error}</span><button aria-label="Dismiss warning" onClick={() => setError("")}><X size={14} /></button></div>}

          {activePage === "Signal Room" && (
            <>
              <section className="metrics-grid" aria-label="Operational metrics">
                <MetricCard
                  label="Active signals"
                  value={compactNumber(activeAlerts.length)}
                  eyebrow={backendConnected ? "LIVE API DATA" : "LOCAL FALLBACK"}
                  severity="urgent"
                  note={urgentCount + " urgent · " + elevatedCount + " elevated"}
                  icon={<Radio size={16} />}
                />
                <MetricCard
                  label="Priority review"
                  value={compactNumber(urgentCount)}
                  eyebrow="URGENT TRIAGE"
                  severity="elevated"
                  note={elevatedCount + " additional signals elevated"}
                  icon={<AlertTriangle size={16} />}
                />
                <MetricCard
                  label="Regions monitored"
                  value={compactNumber(health?.dataset.region_count ?? regions.length)}
                  eyebrow="SYNTHETIC REGIONS"
                  severity="plum"
                  note="Broad fictional centroids only"
                  icon={<MapPinned size={16} />}
                />
                <MetricCard
                  label="Observations loaded"
                  value={compactNumber(health?.dataset.observation_count)}
                  eyebrow={health?.dataset.status === "loaded" ? "DATASET LOADED" : "AWAITING API"}
                  severity="green"
                  note={health?.dataset.synthetic_only === false ? "Source status requires review" : "Aggregate demo observations"}
                  icon={<Database size={16} />}
                />
              </section>

              <section className="workbench-grid">
                <AlertRail
                  alerts={matchingAlerts}
                  selectedId={selectedAlert?.alert_id ?? null}
                  filter={priorityFilter}
                  onFilter={setPriorityFilter}
                  onSelect={setSelectedId}
                  totalCount={activeAlerts.length}
                />

                <div className="center-column">
                  <section className="panel telemetry-panel">
                    <div className="panel-header">
                      <div className="panel-title-group">
                        <span className="panel-icon"><MapPinned size={17} /></span>
                        <div><h2>Geospatial telemetry</h2><p>Fictional regions and aggregate signal markers</p></div>
                      </div>
                      <button className="icon-button compact" aria-label="Open full regional map" onClick={() => setActivePage("Regional Map")}><Layers size={16} /></button>
                    </div>
                    <div className="map-status-strip">
                      <span><i className="legend-dot urgent" /> Urgent</span>
                      <span><i className="legend-dot elevated" /> Elevated</span>
                      <span><i className="legend-dot watch" /> Watch</span>
                      <span><i className="legend-dot baseline" /> Baseline</span>
                    </div>
                    <SignalMap regions={regions} alerts={activeAlerts} selectedId={selectedAlert?.alert_id ?? null} onSelectAlert={setSelectedId} />
                    <div className="map-footer">
                      <span><MapPin size={13} /> {regions.length} synthetic regions</span>
                      <button className="text-link" onClick={() => setActivePage("Data Governance")}>Data limitations <ChevronRight size={13} /></button>
                    </div>
                  </section>

                  <section className="panel evidence-strip">
                    <div className="panel-header evidence-heading">
                      <div className="panel-title-group">
                        <span className="panel-icon"><Activity size={17} /></span>
                        <div><h2>Signal trend & baseline</h2><p>{selectedAlert ? formatIndicator(selectedAlert.indicator_type) + " · " + selectedAlert.region_name : "Select an alert to inspect the trend"}</p></div>
                      </div>
                      <label className="trend-window-control" title="Choose the history window"><span>WINDOW</span><select value={trendDays} onChange={(event) => setTrendDays(Number(event.target.value))} aria-label="Trend history window"><option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option></select></label>
                    </div>
                    <div className="trend-chart">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={selectedTrend} margin={{ top: 8, right: 12, left: -14, bottom: 0 }}>
                          <CartesianGrid stroke="#eee5eb" strokeDasharray="3 4" vertical={false} />
                          <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#786b76" }} axisLine={false} tickLine={false} dy={5} />
                          <YAxis tick={{ fontSize: 9, fill: "#877b86" }} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={{ border: "1px solid #e7dfe4", borderRadius: 0, fontSize: 13, backgroundColor: "#fffdf8" }} />
                          <Line type="monotone" dataKey="observed" name="Aggregate count" stroke="#814e72" strokeWidth={2.2} dot={{ r: 2.3, fill: "#814e72" }} connectNulls={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="chart-summary">
                      <div><span>Observed</span><strong>{compactNumber(selectedAlert?.observed_value)}</strong></div>
                      <div><span>Expected baseline</span><strong>{compactNumber(selectedAlert?.expected_baseline)}</strong></div>
                      <div><span>Change</span><strong className={selectedAlert && (selectedAlert.percentage_change ?? 0) > 0 ? "text-urgent" : ""}>{percentText(selectedAlert?.percentage_change)}</strong></div>
                    </div>
                    <p className="micro-disclaimer">Counts may be suppressed. Missing or withheld observations are not treated as zero.</p>
                  </section>

                  <section className="panel comparison-panel">
                    <div className="panel-header evidence-heading">
                      <div className="panel-title-group">
                        <span className="panel-icon"><BarChart3 size={18} /></span>
                        <div><h2>Observed vs expected baseline</h2><p>Highest-priority active signal per region</p></div>
                      </div>
                      <span className="small-tag">{comparisonChartData.length} REGIONS</span>
                    </div>
                    {comparisonChartData.length ? (
                      <div className="comparison-chart">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={comparisonChartData} layout="vertical" margin={{ top: 8, right: 16, left: 6, bottom: 8 }} barCategoryGap="22%">
                            <CartesianGrid stroke="#eee5eb" strokeDasharray="3 4" horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 11, fill: "#786b76" }} axisLine={false} tickLine={false} />
                            <YAxis type="category" dataKey="region" width={105} interval={0} tick={{ fontSize: 11, fill: "#786b76" }} axisLine={false} tickLine={false} />
                            <Tooltip
                              cursor={{ fill: "#f5edf3" }}
                              contentStyle={{ border: "1px solid #e7dfe4", borderRadius: 0, fontSize: 12, backgroundColor: "#fffdf9" }}
                              formatter={(value, name, item) => [compactNumber(typeof value === "number" ? value : Number(value)), name === "baseline" ? "Expected baseline" : "Observed aggregate"]}
                              labelFormatter={(label, payload) => payload?.[0]?.payload?.indicator ? `${label} · ${payload[0].payload.indicator}` : String(label)}
                            />
                            <Legend formatter={(value) => value === "baseline" ? "Expected baseline" : "Observed aggregate"} wrapperStyle={{ fontSize: 11, paddingTop: 5 }} />
                            <Bar dataKey="baseline" name="baseline" fill="#d6bfd0" maxBarSize={15} />
                            <Bar dataKey="observed" name="observed" fill="#814e72" maxBarSize={15} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="chart-empty-state"><BarChart3 size={22} /><strong>No comparable observations</strong><span>Both observed counts and expected baselines are needed to plot a region.</span></div>
                    )}
                    <p className="micro-disclaimer">Only records with both values present are charted. This is synthetic demo data, not an outbreak assessment.</p>
                  </section>

                  <section className="panel evidence-panel">
                    <div className="panel-header">
                      <div className="panel-title-group">
                        <span className="panel-icon"><ClipboardCheck size={17} /></span>
                        <div><h2>Evidence stream</h2><p>Signals supporting or limiting the current review</p></div>
                      </div>
                      <span className="small-tag">{selectedAlert?.contributing_signals?.length ?? 0} INPUTS</span>
                    </div>
                    <div className="evidence-rows">
                      <EvidenceRow icon={<Pill size={15} />} title="Pharmacy aggregate" status={selectedAlert?.contributing_signals?.some((s) => s.includes("pharmacy")) ? "Supporting signal" : "Not corroborated"} text={selectedAlert?.supporting_evidence?.[0] ?? "No pharmacy evidence provided for this signal."} />
                      <EvidenceRow icon={<Stethoscope size={15} />} title="Clinical indicator" status={selectedAlert?.contributing_signals?.some((s) => s.includes("clinic") || s.includes("clinical")) ? "Supporting signal" : "Not corroborated"} text={selectedAlert?.contributing_signals?.find((s) => s.includes("clinic") || s.includes("clinical"))?.replace(/_/g, " ") ?? "No separate clinical signal listed."} />
                      <EvidenceRow icon={<Waves size={15} />} title="Regional corroboration" status={selectedAlert?.contributing_signals?.some((s) => s.includes("neighbor") || s.includes("spatial")) ? "Supporting signal" : "Not corroborated"} text={selectedAlert?.contributing_signals?.find((s) => s.includes("neighbor") || s.includes("spatial"))?.replace(/_/g, " ") ?? "No neighbouring-region signal listed."} />
                    </div>
                  </section>
                </div>

                <Dossier
                  alert={dossierAlert}
                  connected={backendConnected}
                  authenticated={canReview}
                  authRole={authRole}
                  saving={savingAction}
                  note={auditNote}
                  setNote={setAuditNote}
                  onStatus={updateAlertStatus}
                  onAddNote={addAuditNote}
                  saved={Boolean(dossierAlert && watchlistIds.includes(dossierAlert.alert_id))}
                  onToggleSaved={() => dossierAlert && toggleWatchlist(dossierAlert.alert_id)}
                  actorId={actorId}
                  onAssignReviewer={assignReviewer}
                />
              </section>
            </>
          )}

          {activePage === "Regional Map" && <div className="map-page-wrap"><RegionalMap /></div>}

          {activePage === "Alert Queue" && (
            <section className="queue-workbench">
              <div className="panel queue-page-panel">
                <div className="panel-header queue-page-heading">
                  <div className="panel-title-group"><span className="panel-icon"><Bell size={17} /></span><div><h2>Alert queue</h2><p>Filterable synthetic anomaly records, ordered by review priority.</p></div></div>
                  <span className="small-tag">{matchingAlerts.length} RECORDS</span>
                </div>
                <AlertFilterToolbar statusFilter={statusFilter} onStatusFilter={setStatusFilter} indicatorFilter={indicatorFilter} onIndicatorFilter={setIndicatorFilter} indicators={[...new Set(alerts.map((alert) => alert.indicator_type))].sort()} priorityFilter={priorityFilter} onPriorityFilter={setPriorityFilter} onClear={clearAlertFilters} onExport={exportAlertsCsv} count={matchingAlerts.length} />
                <AlertTable alerts={matchingAlerts} selectedId={selectedAlert?.alert_id ?? null} onSelect={setSelectedId} watchlistIds={watchlistIds} onToggleWatchlist={toggleWatchlist} />
              </div>
              <Dossier alert={dossierAlert} connected={backendConnected} authenticated={canReview} authRole={authRole} saving={savingAction} note={auditNote} setNote={setAuditNote} onStatus={updateAlertStatus} onAddNote={addAuditNote} saved={Boolean(dossierAlert && watchlistIds.includes(dossierAlert.alert_id))} onToggleSaved={() => dossierAlert && toggleWatchlist(dossierAlert.alert_id)} actorId={actorId} onAssignReviewer={assignReviewer} />
            </section>
          )}

          {activePage === "Investigations" && (
            <section className="queue-workbench">
              <div className="panel queue-page-panel">
                <div className="panel-header queue-page-heading">
                  <div className="panel-title-group"><span className="panel-icon"><FlaskConical size={17} /></span><div><h2>Investigation workbench</h2><p>Assigned, under-review and escalated records. Updates are persisted through the API when connected.</p></div></div>
                  <span className="small-tag">{matchingAlerts.length} IN REVIEW</span>
                </div>
                <AlertFilterToolbar statusFilter={statusFilter} onStatusFilter={setStatusFilter} indicatorFilter={indicatorFilter} onIndicatorFilter={setIndicatorFilter} indicators={[...new Set(alerts.map((alert) => alert.indicator_type))].sort()} priorityFilter={priorityFilter} onPriorityFilter={setPriorityFilter} onClear={clearAlertFilters} onExport={exportAlertsCsv} count={matchingAlerts.length} />
                <AlertTable alerts={matchingAlerts} selectedId={selectedAlert?.alert_id ?? null} onSelect={setSelectedId} watchlistIds={watchlistIds} onToggleWatchlist={toggleWatchlist} />
              </div>
              <Dossier alert={dossierAlert} connected={backendConnected} authenticated={canReview} authRole={authRole} saving={savingAction} note={auditNote} setNote={setAuditNote} onStatus={updateAlertStatus} onAddNote={addAuditNote} saved={Boolean(dossierAlert && watchlistIds.includes(dossierAlert.alert_id))} onToggleSaved={() => dossierAlert && toggleWatchlist(dossierAlert.alert_id)} actorId={actorId} onAssignReviewer={assignReviewer} />
            </section>
          )}

          {activePage === "Watchlist" && (
            <section className="panel queue-page-panel watchlist-page-panel">
              <div className="panel-header queue-page-heading">
                <div className="panel-title-group"><span className="panel-icon"><BookmarkCheck size={17} /></span><div><h2>Saved alert watchlist</h2><p>Keep important records close at hand. Saved IDs remain in this browser.</p></div></div>
                <span className="small-tag">{watchlistIds.length} SAVED</span>
              </div>
              <AlertFilterToolbar statusFilter={statusFilter} onStatusFilter={setStatusFilter} indicatorFilter={indicatorFilter} onIndicatorFilter={setIndicatorFilter} indicators={[...new Set(alerts.map((alert) => alert.indicator_type))].sort()} priorityFilter={priorityFilter} onPriorityFilter={setPriorityFilter} onClear={clearAlertFilters} onExport={exportAlertsCsv} count={matchingAlerts.length} />
              {watchlistIds.length === 0 ? <div className="empty-state watchlist-empty"><Bookmark size={24} /><strong>Your watchlist is empty</strong><p>Open any alert dossier and save it with the bookmark control.</p></div> : <AlertTable alerts={matchingAlerts} selectedId={selectedAlert?.alert_id ?? null} onSelect={setSelectedId} watchlistIds={watchlistIds} onToggleWatchlist={toggleWatchlist} />}
            </section>
          )}

          {activePage === "Data Governance" && (
            <section className="governance-page-grid">
              <div className="panel governance-card">
                <div className="panel-title-group"><span className="panel-icon"><ShieldCheck size={17} /></span><div><h2>Privacy & data handling</h2><p>Boundaries for this early-warning demonstration</p></div></div>
                <div className="governance-rows">
                  <GovernanceRow label="Dataset type" value="Synthetic aggregate observations" />
                  <GovernanceRow label="Direct identifiers" value="Not part of the demo dataset" />
                  <GovernanceRow label="Regional geography" value="Fictional broad centroids" />
                  <GovernanceRow label="Small-count policy" value="Values below the configured threshold may be suppressed" />
                  <GovernanceRow label="Intended use" value="Review prioritization and investigation workflow demonstration" />
                  <GovernanceRow label="Clinical interpretation" value="No diagnosis, outbreak declaration or probability claim" />
                </div>
              </div>
              <div className="panel governance-card">
                <div className="panel-title-group"><span className="panel-icon"><Database size={17} /></span><div><h2>Dataset status</h2><p>Values reported by the connected backend</p></div></div>
                <div className="dataset-stat"><span>API health</span><strong className={backendConnected ? "value-green" : "value-urgent"}>{backendConnected ? "Connected" : "Unavailable"}</strong></div>
                <div className="dataset-stat"><span>Regions loaded</span><strong>{compactNumber(health?.dataset.region_count ?? regions.length)}</strong></div>
                <div className="dataset-stat"><span>Observations loaded</span><strong>{compactNumber(health?.dataset.observation_count)}</strong></div>
                <div className="dataset-stat"><span>Latest observation</span><strong>{shortDate(health?.dataset.latest_observation_date)}</strong></div>
                <div className="dataset-stat"><span>Dataset designation</span><strong>{health?.dataset.synthetic_only === false ? "Verify source" : "Synthetic only"}</strong></div>
                <div className="governance-note"><Info size={16} />Suppressed or missing values remain unavailable; the interface must not replace them with zero.</div>
              </div>
              <div className="panel governance-card">
                <div className="panel-title-group"><span className="panel-icon"><FileText size={17} /></span><div><h2>Interpretation safeguards</h2><p>Required context for every operational signal</p></div></div>
                <div className="safeguard-list">
                  <p><CheckCircle2 size={15} /> Anomaly scores are compared with configured historical baselines.</p>
                  <p><CheckCircle2 size={15} /> Evidence from independent streams should be reviewed before action.</p>
                  <p><CheckCircle2 size={15} /> Data quality and reporting delays can affect a signal.</p>
                  <p><CheckCircle2 size={15} /> Human investigation is required; this is not an autonomous public-health decision.</p>
                </div>
              </div>
            </section>
          )}

          {activePage === "Settings" && (
            <section className="panel settings-panel">
              <div className="panel-header"><div className="panel-title-group"><span className="panel-icon"><Settings size={17} /></span><div><h2>Connection settings</h2><p>Read-only environment details for this deployment.</p></div></div></div>
              <div className="settings-list">
                <div><span>Frontend API base URL</span><code>{apiBase}</code></div>
                <div><span>Connection status</span><strong className={backendConnected ? "value-green" : "value-urgent"}>{backendConnected ? "Connected" : "Unavailable — local fallback active"}</strong></div>
                <div><span>API version</span><strong>{health?.api_version ?? "Not available"}</strong></div>
                <div><span>Last successful sync</span><strong>{lastUpdated ? new Date(lastUpdated).toLocaleString() : "Not synced in this session"}</strong></div>
                <div><span>Authenticated reviewer</span><strong>{authUser?.email || "Not signed in"}</strong><small>Verified user ID: {authUser?.id || "—"}</small></div>
                <div><span>Access status</span><strong>{authRole === "admin" ? "Administrator" : authRole === "reviewer" ? "Approved reviewer" : authUser ? "Pending administrator approval" : "Sign in required"}</strong><small>Client-supplied actor IDs are not used for authorization.</small></div>
                <div><span>Automatic refresh</span><label className="auto-refresh-setting"><input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} /> Refresh every 60 seconds</label></div>
              </div>
              <div className="settings-actions"><button className="button button-secondary" onClick={() => void refreshData(true)} disabled={refreshing}><RefreshCw size={15} className={refreshing ? "spin" : ""} /> Recheck connection</button><a className="button button-secondary" href={apiBase + "/docs"} target="_blank" rel="noreferrer">Open API docs <ArrowUpRight size={14} /></a></div>
            </section>
          )}


          {activePage === "Access Review" && authRole === "admin" && (
            <section className="panel settings-panel">
              <div className="panel-header">
                <div className="panel-title-group"><span className="panel-icon"><Users size={17} /></span><div><h2>Reviewer access requests</h2><p>Only administrators can approve or suspend reviewer access. Changes are recorded in a separate append-only audit log.</p></div></div>
                <button className="button button-secondary" disabled={reviewersLoading} onClick={() => void api.reviewers().then(setReviewerAccounts).catch(() => setError("Could not refresh reviewer access requests."))}><RefreshCw size={14} className={reviewersLoading ? "spin" : ""} /> Refresh</button>
              </div>
              {reviewersLoading ? <p className="quiet-copy">Loading reviewer accounts…</p> : reviewerAccounts.length ? (
                <div className="table-wrap"><table className="signal-table">
                  <thead><tr><th>Account</th><th>User UUID</th><th>Role</th><th>Requested</th><th>Action</th></tr></thead>
                  <tbody>{reviewerAccounts.map((account) => (
                    <tr key={account.user_id}>
                      <td><strong>{account.email || "Email unavailable"}</strong><small>{account.approved_at ? "Approved " + new Date(account.approved_at).toLocaleString() : "Awaiting approval"}</small></td>
                      <td><code>{account.user_id}</code><button className="text-link" onClick={() => { void navigator.clipboard.writeText(account.user_id).then(() => setNotice("User UUID copied.")); }}>Copy UUID</button></td>
                      <td><span className="severity-pill">{account.role}</span></td>
                      <td>{account.requested_at ? new Date(account.requested_at).toLocaleString() : "—"}</td>
                      <td>{account.user_id === authUser?.id
                        ? <span className="quiet-copy">Current admin</span>
                        : account.role === "reviewer"
                          ? <button className="button button-quiet" disabled={reviewerActionId === account.user_id} onClick={() => void changeReviewerRole(account.user_id, "pending")}>{reviewerActionId === account.user_id ? "Saving…" : "Suspend"}</button>
                          : <button className="button button-primary" disabled={reviewerActionId === account.user_id} onClick={() => void changeReviewerRole(account.user_id, "reviewer")}>{reviewerActionId === account.user_id ? "Saving…" : "Approve reviewer"}</button>}
                      </td>
                    </tr>
                  ))}</tbody>
                </table></div>
              ) : <div className="empty-state"><Users size={23} /><strong>No accounts found</strong><p>New accounts appear here after signing up and confirming their email.</p></div>}
              <p className="history-caption">This page cannot promote accounts to administrator. The first administrator must be bootstrapped through the Supabase SQL Editor by the project owner.</p>
            </section>
          )}

          <footer className="page-footer">
            <span>© 2026 AAROGYA ALERT · Hackathon prototype</span>
            <span><ShieldCheck size={13} /> Synthetic signals require human verification</span>
            <span>{loading ? "Connecting…" : lastUpdated ? "Last sync " + new Date(lastUpdated).toLocaleTimeString() : "Offline demo session"}</span>
          </footer>
        </main>
      </div>
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value, eyebrow, severity, note, icon }: { label: string; value: string; eyebrow: string; severity: string; note: string; icon: React.ReactNode }) {
  return (
    <article className={"metric-card metric-" + severity}>
      <div className="metric-card-top"><span>{label}</span><span className="metric-icon">{icon}</span></div>
      <div className="metric-value-row"><strong>{value}</strong><span className="metric-eyebrow">{eyebrow}</span></div>
      <div className="metric-note">{note}</div>
      <span className="metric-rule" />
    </article>
  );
}

function AlertRail({ alerts, selectedId, filter, onFilter, onSelect, totalCount }: { alerts: BackendAlert[]; selectedId: string | null; filter: PriorityFilter; onFilter: (filter: PriorityFilter) => void; onSelect: (id: string) => void; totalCount: number }) {
  const filters: PriorityFilter[] = ["All", "Urgent", "Elevated", "Watch"];
  return (
    <section className="panel alert-rail" id="surveillance-rail" aria-label="Signals requiring assessment">
      <div className="panel-header rail-header">
        <div className="panel-title-group"><span className="panel-icon"><Radio size={16} /></span><div><h2>Surveillance rail</h2><p>Signals requiring assessment</p></div></div>
        <span className="count-tag">{alerts.length}</span>
      </div>
      <div className="rail-filter-row">
        {filters.map((item) => <button key={item} className={"filter-chip " + (filter === item ? "filter-chip-active" : "")} onClick={() => onFilter(item)}>{item}</button>)}
      </div>
      <div className="rail-summary"><span>PRIORITY SORT</span><span>{totalCount} ACTIVE</span></div>
      <div className="alert-list">
        {alerts.map((alert) => (
          <button key={alert.alert_id} className={"alert-card " + (alert.alert_id === selectedId ? "alert-card-selected" : "") + " " + priorityClass(alert.review_priority)} onClick={() => onSelect(alert.alert_id)}>
            <div className="alert-card-meta"><span className={"severity-pill " + priorityClass(alert.review_priority)}>{priorityLabel(alert.review_priority)}</span><span className="alert-id">{alert.alert_id}</span></div>
            <h3>{formatIndicator(alert.indicator_type)}</h3>
            <p className="alert-region"><MapPin size={12} />{alert.region_name}</p>
            <p className="alert-card-context">{alert.supporting_evidence?.[0] || "Compare this aggregate indicator with its expected baseline and review its uncertainty before taking action."}</p>
            <div className="alert-card-numbers">
              <span><small>CHANGE</small><strong className={(alert.percentage_change ?? 0) > 0 ? "text-urgent" : ""}>{percentText(alert.percentage_change)}</strong></span>
              <span><small>STATUS</small><strong>{statusLabel(alert.investigation_status)}</strong></span>
            </div>
            <div className="alert-card-footer"><span><Clock3 size={11} />{shortDate(alert.observation_date ?? alert.detected_at)}</span><ChevronRight size={14} /></div>
          </button>
        ))}
        {alerts.length === 0 && <div className="empty-state"><CircleHelp size={22} /><strong>No matching signals</strong><p>Try another priority filter or search term.</p></div>}
      </div>
      <div className="rail-footer"><span>Showing {alerts.length} of {totalCount} matching records</span><button className="text-link" onClick={() => onFilter("All")}>Clear filters <ArrowUpRight size={12} /></button></div>
    </section>
  );
}

function Dossier({ alert, connected, authenticated, authRole, saving, note, setNote, onStatus, onAddNote, saved, onToggleSaved, actorId, onAssignReviewer }: { alert: BackendAlert | null; connected: boolean; authenticated?: boolean; authRole: ReviewerRole; saving: boolean; note: string; setNote: (note: string) => void; onStatus: (status: string) => void; onAddNote: () => void; saved: boolean; onToggleSaved: () => void; actorId: string; onAssignReviewer: (reviewerId: string) => void }) {
  const [showNote, setShowNote] = useState(false);
  const [guidedStep, setGuidedStep] = useState(0);
  const [assigneeId, setAssigneeId] = useState(alert?.assigned_reviewer_id ?? "");
  useEffect(() => {
    setAssigneeId(alert?.assigned_reviewer_id ?? (authenticated ? actorId : ""));
  }, [alert?.alert_id, alert?.assigned_reviewer_id, authenticated, actorId]);
  useEffect(() => {
    setGuidedStep(0);
  }, [alert?.alert_id]);

  const guidedSteps = [
    { shortTitle: "Understand", title: "Understand the signal", target: "dossier-understand", instruction: "Compare the observed aggregate with its expected baseline. Read the priority and data-quality status before drawing conclusions." },
    { shortTitle: "Evidence", title: "Review supporting evidence", target: "dossier-evidence", instruction: "Read the supporting statements carefully. They provide context for review; they are not proof of a diagnosis or outbreak." },
    { shortTitle: "Limits", title: "Check uncertainty and verification", target: "dossier-limitations", instruction: "Review uncertainty notes and the suggested verification steps. Check data completeness and seek independent corroboration where appropriate." },
    { shortTitle: "Assign", title: "Assign and update", target: "dossier-dispatch", instruction: "Assign an approved reviewer and update the investigation status. Changes require a connected API and an approved reviewer account." },
    { shortTitle: "Document", title: "Document and audit", target: "dossier-documentation", instruction: "Record a concise finding or data-quality check, then inspect the audit history below. The guide tracks your place, not whether a review is complete." },
  ];

  function goToGuidedStep(index: number) {
    const safeIndex = Math.max(0, Math.min(guidedSteps.length - 1, index));
    setGuidedStep(safeIndex);
    document.getElementById(guidedSteps[safeIndex].target)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (!alert) {
    return <section className="panel dossier-panel"><div className="empty-state"><FileText size={24} /><strong>No signal selected</strong><p>Choose a record from the surveillance rail.</p></div></section>;
  }
  const excess = alert.absolute_difference ?? (alert.observed_value != null && alert.expected_baseline != null ? alert.observed_value - alert.expected_baseline : null);
  const evidence = alert.supporting_evidence ?? [];
  const uncertainty = alert.uncertainty_notes ?? [];
  const verification = alert.recommended_verification_steps ?? [];
  const statusOptions = [
    { value: "new", label: "Needs review" },
    { value: "assigned", label: "Assigned" },
    { value: "investigating", label: "Under review" },
    { value: "escalated", label: "Escalated" },
    { value: "closed", label: "Closed" },
    { value: "dismissed", label: "Dismissed" },
  ];
  return (
    <aside className="panel dossier-panel" id="selected-signal-dossier">
      <div className="dossier-topline"><span className="dossier-kicker">SIGNAL DOSSIER</span><button className={"watchlist-toggle " + (saved ? "watchlist-toggle-active" : "")} onClick={onToggleSaved} aria-label={saved ? "Remove alert from watchlist" : "Save alert to watchlist"} title={saved ? "Remove from watchlist" : "Save to watchlist"}>{saved ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}{saved ? "Saved" : "Save"}</button><span className={"severity-pill " + priorityClass(alert.review_priority)}>{priorityLabel(alert.review_priority)}</span></div>
      <div className="dossier-id">{alert.alert_id}</div>
      <h2>{formatIndicator(alert.indicator_type)}</h2>
      <p className="dossier-location"><MapPin size={13} />{alert.region_name} <span>·</span> {alert.region_id}</p>
      <div className="dossier-status-line"><span>Status</span><strong>{statusLabel(alert.investigation_status)}</strong></div>

      <section className="guided-review" aria-labelledby="guided-review-title">
        <div className="guided-review-heading">
          <div>
            <span className="guided-review-kicker">GUIDED INVESTIGATION</span>
            <h3 id="guided-review-title">A clear path through this signal</h3>
          </div>
          <span className="guided-review-counter">STEP {guidedStep + 1} / {guidedSteps.length}</span>
        </div>
        <div className="guided-review-progress" role="progressbar" aria-label="Position in guided review" aria-valuemin={1} aria-valuemax={guidedSteps.length} aria-valuenow={guidedStep + 1}>
          <span style={{ width: ((guidedStep + 1) / guidedSteps.length * 100) + "%" }} />
        </div>
        <nav className="guided-review-steps" aria-label="Investigation steps">
          {guidedSteps.map((step, index) => (
            <button
              key={step.shortTitle}
              type="button"
              className={"guided-review-step" + (guidedStep === index ? " guided-review-step-active" : "")}
              aria-current={guidedStep === index ? "step" : undefined}
              onClick={() => goToGuidedStep(index)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{step.shortTitle}</strong>
            </button>
          ))}
        </nav>
        <div className="guided-review-current" aria-live="polite">
          <strong>{guidedSteps[guidedStep].title}</strong>
          <p>{guidedSteps[guidedStep].instruction}</p>
        </div>
        <div className="guided-review-actions">
          <button className="button button-quiet" type="button" disabled={guidedStep === 0} onClick={() => goToGuidedStep(guidedStep - 1)}>Previous</button>
          <button className="button button-primary" type="button" onClick={() => goToGuidedStep(guidedStep === guidedSteps.length - 1 ? 0 : guidedStep + 1)}>
            {guidedStep === guidedSteps.length - 1 ? "Back to overview" : "Next: " + guidedSteps[guidedStep + 1].shortTitle}
            <ChevronRight size={14} />
          </button>
        </div>
      </section>

      <div className="dossier-data-grid" id="dossier-understand">
        <div><span>OBSERVED</span><strong>{compactNumber(alert.observed_value)}</strong><small>aggregate units</small></div>
        <div><span>EXPECTED BASELINE</span><strong>{compactNumber(alert.expected_baseline)}</strong><small>historical reference</small></div>
        <div><span>NET DIFFERENCE</span><strong className={excess !== null && excess > 0 ? "text-urgent" : ""}>{excess === null ? "—" : (excess > 0 ? "+" : "") + compactNumber(excess)}</strong><small>{percentText(alert.percentage_change)}</small></div>
        <div><span>ANOMALY SCORE</span><strong>{compactNumber(alert.anomaly_score)}</strong><small>{alert.detection_threshold != null ? "Threshold " + compactNumber(alert.detection_threshold) : "Configured baseline"}</small></div>
      </div>

      <section className="dossier-section">
        <div className="section-label"><span>01</span> ALGORITHMIC ASSESSMENT</div>
        <div className="assessment-row"><span>Review priority</span><strong className={"text-" + priorityLabel(alert.review_priority).toLowerCase()}>{priorityLabel(alert.review_priority)}</strong></div>
        <div className="assessment-row"><span>Data quality</span><strong>{alert.data_quality_status || "Not provided"}</strong></div>
        <div className="assessment-row"><span>Observation date</span><strong>{shortDate(alert.observation_date ?? alert.detected_at)}</strong></div>
        {alert.contributing_signals?.length ? <div className="signal-tags">{alert.contributing_signals.map((signal) => <span key={signal}>{signal.replace(/_/g, " ")}</span>)}</div> : null}
      </section>

      <section className="dossier-section" id="dossier-evidence">
        <div className="section-label"><span>02</span> SUPPORTING EVIDENCE</div>
        {evidence.length ? evidence.map((item, index) => <div key={index} className="dossier-note evidence-note"><CheckCircle2 size={14} /><p>{item}</p></div>) : <p className="quiet-copy">No supporting evidence attached to this record.</p>}
      </section>

      <section className="dossier-section" id="dossier-limitations">
        <div className="section-label"><span>03</span> UNCERTAINTY & LIMITATIONS</div>
        {uncertainty.length ? uncertainty.map((item, index) => <div key={index} className="dossier-note uncertainty-note"><Info size={14} /><p>{item}</p></div>) : <div className="dossier-note uncertainty-note"><Info size={14} /><p>Review the signal against independent evidence. This system does not confirm a diagnosis or outbreak.</p></div>}
        {verification.length > 0 && <div className="verification-list"><strong>Suggested verification</strong>{verification.map((item, index) => <p key={index}>• {item}</p>)}</div>}
      </section>

      <section className="dossier-section dispatch-section" id="dossier-dispatch">
        <div className="section-label"><span>04</span> OPERATIONAL DISPATCH</div>
        <label className="field-label" htmlFor="dossier-reviewer">Assigned reviewer ID</label>
        <div className="reviewer-assignment-control">
          <input id="dossier-reviewer" value={assigneeId} maxLength={100} onChange={(event) => setAssigneeId(event.target.value)} placeholder="Enter reviewer ID" disabled={saving || !connected || !authenticated} />
          <button className="button button-secondary" disabled={saving || !connected || !authenticated || !assigneeId.trim()} onClick={() => onAssignReviewer(assigneeId.trim())}>Assign reviewer</button>
        </div>
        <p className="form-hint">Verified acting reviewer: {authenticated ? actorId : "not authorized"}. Assigned reviewer must be an approved registered account UUID.</p>
        {!authenticated && <p className="form-hint">{authRole === "pending" && actorId !== "demo-reviewer-1" ? "Your account is pending administrator approval." : "Sign in with an approved reviewer account to change status, assign reviewers, or add notes."}</p>}
        <label className="field-label" htmlFor="dossier-status">Investigation status</label>
        <select id="dossier-status" value={alert.investigation_status} disabled={saving} onChange={(event) => onStatus(event.target.value)}>
          {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <div className="dispatch-buttons">
          <button className="button button-primary dispatch-main" disabled={saving || !connected || !authenticated} onClick={() => onStatus("investigating")}><ClipboardCheck size={14} /> Start review</button>
          <button className="button button-danger-outline" disabled={saving || !connected || !authenticated} onClick={() => onStatus("escalated")}><ArrowUpRight size={14} /> Escalate</button>
        </div>
        <div className="dispatch-buttons dispatch-secondary">
          <button className="button button-quiet" disabled={saving || !connected || !authenticated} onClick={() => onStatus("closed")}>Mark resolved</button>
          <button className="button button-quiet" disabled={saving || !connected || !authenticated} onClick={() => onStatus("dismissed")}>False positive</button>
        </div>
        {!connected && <p className="form-hint">Status changes are local only while the API is offline.</p>}
      </section>

      <section className="dossier-section audit-section" id="dossier-documentation">
        <div className="audit-heading"><div className="section-label"><span>05</span> INVESTIGATION NOTE</div><button className="text-link" onClick={() => setShowNote((visible) => !visible)}>{showNote ? "Cancel" : "+ Add note"}</button></div>
        {showNote && (
          <div className="note-form">
            <textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Record a review finding or data-quality check…" aria-label="Investigation note" />
            <button className="button button-primary" disabled={saving || !authenticated || !note.trim()} onClick={onAddNote}><Send size={13} /> Save note</button>
          </div>
        )}
        {(alert.audit_events ?? []).filter((event) => event.action === "note_added").length ? (
          <div className="investigation-note-list">{(alert.audit_events ?? []).filter((event) => event.action === "note_added").map((event) => (
            <div key={event.event_id}><span>{event.actor_id} · {new Date(event.occurred_at).toLocaleString()}</span><p>{event.note || "Investigation note recorded."}</p></div>
          ))}</div>
        ) : <p className="quiet-copy">Notes are saved as timestamped audit events and will appear here.</p>}
      </section>

      <section className="dossier-section history-section" id="dossier-history">
        <div className="section-label"><span>06</span> AUDIT TRAIL</div>
        <p className="history-caption">Append-only record of workflow actions, actor IDs and state changes.</p>
        {(alert.audit_events ?? []).length ? (
          <div className="audit-timeline">
            {(alert.audit_events ?? []).map((event) => (
              <article className="audit-event" key={event.event_id}>
                <div className="audit-event-marker" />
                <div className="audit-event-content">
                  <div className="audit-event-heading"><strong>{event.action.replace(/_/g, " ")}</strong><time dateTime={event.occurred_at}>{new Date(event.occurred_at).toLocaleString()}</time></div>
                  <span className="audit-event-actor">Actor: {event.actor_id}</span>
                  {event.note && <p>{event.note}</p>}
                  {(event.before || event.after) && <details><summary>View state change</summary><div className="audit-state-change"><span><b>Before</b><code>{event.before ? JSON.stringify(event.before, null, 2) : "—"}</code></span><span><b>After</b><code>{event.after ? JSON.stringify(event.after, null, 2) : "—"}</code></span></div></details>}
                </div>
              </article>
            ))}
          </div>
        ) : <p className="quiet-copy">No workflow audit events recorded for this alert yet.</p>}
        <p className="history-caption">Authenticated workflow writes are attributed server-side to the Supabase user UUID. Legacy local events may pre-date verified attribution.</p>
      </section>
    </aside>
  );
}

function EvidenceRow({ icon, title, status, text }: { icon: React.ReactNode; title: string; status: string; text: string }) {
  const unsupported = status === "Not corroborated";
  return (
    <div className="evidence-row">
      <span className="evidence-row-icon">{icon}</span>
      <div className="evidence-row-main"><strong>{title}</strong><p>{text}</p></div>
      <span className={"evidence-status " + (unsupported ? "evidence-pending" : "evidence-supporting")}>{status}</span>
    </div>
  );
}

function AlertTable({ alerts, selectedId, onSelect, watchlistIds, onToggleWatchlist }: { alerts: BackendAlert[]; selectedId: string | null; onSelect: (id: string) => void; watchlistIds: string[]; onToggleWatchlist: (id: string) => void }) {
  return (
    <div className="table-wrap">
      <table className="signal-table">
        <thead><tr><th>Alert / region</th><th>Indicator</th><th>Change</th><th>Priority</th><th>Status</th><th>Observed</th><th>Save</th><th /></tr></thead>
        <tbody>
          {alerts.map((alert) => (
            <tr key={alert.alert_id} className={selectedId === alert.alert_id ? "selected-row" : ""} onClick={() => onSelect(alert.alert_id)}>
              <td><strong>{alert.alert_id}</strong><small>{alert.region_name} · {alert.region_id}</small></td>
              <td>{formatIndicator(alert.indicator_type)}</td>
              <td className={(alert.percentage_change ?? 0) > 0 ? "text-urgent" : ""}>{percentText(alert.percentage_change)}</td>
              <td><span className={"severity-pill " + priorityClass(alert.review_priority)}>{priorityLabel(alert.review_priority)}</span></td>
              <td>{statusLabel(alert.investigation_status)}</td>
              <td>{shortDate(alert.observation_date ?? alert.detected_at)}</td>
              <td><button className={"table-bookmark " + (watchlistIds.includes(alert.alert_id) ? "table-bookmark-active" : "")} aria-label={watchlistIds.includes(alert.alert_id) ? "Remove from watchlist" : "Save to watchlist"} title={watchlistIds.includes(alert.alert_id) ? "Remove from watchlist" : "Save to watchlist"} onClick={(event) => { event.stopPropagation(); onToggleWatchlist(alert.alert_id); }}>{watchlistIds.includes(alert.alert_id) ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}</button></td>
              <td><button className="table-view" onClick={(event) => { event.stopPropagation(); onSelect(alert.alert_id); }}>Inspect <ChevronRight size={12} /></button></td>
            </tr>
          ))}
          {alerts.length === 0 && <tr><td colSpan={8}><div className="empty-state"><CircleHelp size={22} /><strong>No records match</strong><p>Change the search or priority filters above.</p></div></td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function AlertFilterToolbar({ statusFilter, onStatusFilter, indicatorFilter, onIndicatorFilter, indicators, priorityFilter, onPriorityFilter, onClear, onExport, count }: { statusFilter: string; onStatusFilter: (value: string) => void; indicatorFilter: string; onIndicatorFilter: (value: string) => void; indicators: string[]; priorityFilter: PriorityFilter; onPriorityFilter: (value: PriorityFilter) => void; onClear: () => void; onExport: () => void; count: number }) {
  const priorities: PriorityFilter[] = ["All", "Urgent", "Elevated", "Watch", "Baseline"];
  const statuses = ["new", "assigned", "investigating", "escalated", "closed", "dismissed"];
  return (
    <div className="alert-filter-toolbar">
      <div className="alert-filter-controls">
        <label><span>Priority</span><select value={priorityFilter} onChange={(event) => onPriorityFilter(event.target.value as PriorityFilter)}>{priorities.map((value) => <option key={value} value={value}>{value === "All" ? "All priorities" : value}</option>)}</select></label>
        <label><span>Status</span><select value={statusFilter} onChange={(event) => onStatusFilter(event.target.value)}><option value="All">All statuses</option>{statuses.map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></label>
        <label><span>Indicator</span><select value={indicatorFilter} onChange={(event) => onIndicatorFilter(event.target.value)}><option value="All">All indicators</option>{indicators.map((value) => <option key={value} value={value}>{formatIndicator(value)}</option>)}</select></label>
      </div>
      <div className="alert-filter-actions"><span>{count} results</span><button className="button button-secondary" onClick={onExport}><Download size={14} /> Export CSV</button><button className="button button-quiet" onClick={onClear}>Clear filters</button></div>
    </div>
  );
}

function GovernanceRow({ label, value }: { label: string; value: string }) {
  return <div className="governance-row"><span>{label}</span><strong>{value}</strong></div>;
}

export default App;
