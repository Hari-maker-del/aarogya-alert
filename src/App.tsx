import { useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArrowUpRight, Bell, CheckCircle2, Clock3,
  ClipboardList, LayoutDashboard, MapPinned, Menu, Search, ShieldCheck, Users, X
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import RegionalMap from "./components/RegionalMap";
import type { AlertItem } from "./types";
import "./App.css";

const trendData = [
  { day: "Oct 09", observed: 42, baseline: 40 },
  { day: "Oct 10", observed: 46, baseline: 41 },
  { day: "Oct 11", observed: 44, baseline: 42 },
  { day: "Oct 12", observed: 53, baseline: 42 },
  { day: "Oct 13", observed: 61, baseline: 43 },
  { day: "Oct 14", observed: 72, baseline: 44 },
  { day: "Oct 15", observed: 68, baseline: 45 }
];

const initialAlerts: AlertItem[] = [
  { id: "ALT-1001", region: "Demo North", indicator: "Respiratory medicine demand", change: 61, priority: "High", status: "Needs review", reason: "Pharmacy demand is above the simulated baseline. Clinical corroboration is pending." },
  { id: "ALT-1002", region: "Demo East", indicator: "Fever clinic visits", change: 34, priority: "Medium", status: "Under investigation", reason: "Aggregated clinic visits increased compared with the simulated historical baseline." },
  { id: "ALT-1003", region: "Demo Central", indicator: "Gastrointestinal clinic visits", change: 18, priority: "Low", status: "Monitoring", reason: "A small deviation was detected. More observations are needed." },
  { id: "ALT-1004", region: "Demo South", indicator: "Respiratory medicine demand", change: 29, priority: "Medium", status: "Needs review", reason: "Medicine demand increased, but independent clinical evidence is incomplete." }
];

const regions = [
  { name: "Demo North", level: "High", value: "+61%", color: "red" },
  { name: "Demo East", level: "Medium", value: "+34%", color: "orange" },
  { name: "Demo Central", level: "Low", value: "+18%", color: "yellow" },
  { name: "Demo South", level: "Medium", value: "+29%", color: "orange" },
  { name: "Demo West", level: "Normal", value: "+4%", color: "green" }
];

const navItems = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Regional Map", icon: MapPinned },
  { label: "Alert Center", icon: AlertTriangle },
  { label: "Investigations", icon: ClipboardList }
];

function App() {
  const [activePage, setActivePage] = useState("Overview");
  const [alerts, setAlerts] = useState(initialAlerts);
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [selectedAlert, setSelectedAlert] = useState<AlertItem | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const filteredAlerts = useMemo(() => alerts.filter((a) => {
    const matchesSearch = `${a.region} ${a.indicator} ${a.id}`.toLowerCase().includes(search.toLowerCase());
    const matchesPriority = priorityFilter === "All" || a.priority === priorityFilter;
    const matchesPage = activePage !== "Investigations" || a.status === "Under investigation";
    return matchesSearch && matchesPriority && matchesPage;
  }), [alerts, search, priorityFilter, activePage]);

  function updateStatus(id: string, status: AlertItem["status"]) {
    setAlerts((current) => current.map((a) => a.id === id ? { ...a, status } : a));
    setSelectedAlert((current) => current && current.id === id ? { ...current, status } : current);
    setNotice(`Demo alert ${id} updated to "${status}".`);
    window.setTimeout(() => setNotice(""), 3000);
  }

  const pageTitle = activePage === "Overview" ? "Public Health Overview" : activePage;

  return (
    <div className="app-shell">
      {sidebarOpen && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-icon"><Activity size={25} /></div>
          <div><div className="brand-name">AAROGYA</div><div className="brand-subtitle">ALERT INTELLIGENCE</div></div>
          <button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar"><X size={19} /></button>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="navigation">
          {navItems.map(({ label, icon: Icon }) => (
            <button key={label} className={`nav-item ${activePage === label ? "nav-active" : ""}`} onClick={() => { setActivePage(label); setSidebarOpen(false); }}>
              <Icon size={19} /><span>{label}</span>
              {label === "Alert Center" && <span className="nav-count">{alerts.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-card"><ShieldCheck size={21} /><div><strong>Privacy first</strong><p>Regional aggregates only</p></div></div>
          <div className="profile"><div className="avatar">PH</div><div className="profile-info"><strong>Public Health Team</strong><span>Demo reviewer</span></div></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Menu size={22} /></button>
            <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-separator">/</span><strong>{activePage}</strong></div>
          </div>
          <div className="topbar-right">
            <span className="demo-badge"><span className="demo-dot" /> DEMO DATA</span>
            <button className="icon-button notification-button" aria-label="View alerts" onClick={() => setActivePage("Alert Center")}><Bell size={19} /><span className="notification-dot" /></button>
            <div className="date-label">Synthetic demo</div>
          </div>
        </header>

        <div className="page-content">
          <section className="page-heading">
            <div><div className="eyebrow"><span className="live-dot" /> SURVEILLANCE WORKSPACE</div><h1>{pageTitle}</h1><p>Monitor unusual regional health patterns and review emerging signals.</p></div>
            <button className="primary-button" onClick={() => setActivePage("Alert Center")}><AlertTriangle size={17} /> Review alerts</button>
          </section>

          <div className="demo-notice"><ShieldCheck size={18} /><span><strong>Demonstration environment.</strong> All displayed observations and alerts are synthetic, not real health data.</span></div>
          {notice && <div className="toast" role="status"><CheckCircle2 size={18} />{notice}<button className="icon-button" onClick={() => setNotice("")} aria-label="Dismiss"><X size={16} /></button></div>}

          {activePage === "Regional Map" && <RegionalMap />}

          {activePage === "Overview" && <>
            <section className="stats-grid">
              <StatCard icon={<MapPinned size={20} />} label="Regions monitored" value="24" detail="Synthetic demo regions" tone="blue" />
              <StatCard icon={<Activity size={20} />} label="Patterns flagged" value={String(alerts.length)} detail="Across demo indicators" tone="orange" />
              <StatCard icon={<Clock3 size={20} />} label="Needs review" value={String(alerts.filter((a) => a.status === "Needs review").length)} detail="Awaiting reviewer action" tone="purple" />
              <StatCard icon={<CheckCircle2 size={20} />} label="Under investigation" value={String(alerts.filter((a) => a.status === "Under investigation").length)} detail="Demo workflow status" tone="green" />
            </section>
            <section className="analytics-grid">
              <div className="panel trend-panel">
                <div className="panel-heading"><div><h2>Health signal trends</h2><p>Observed activity compared with expected baseline</p></div><span className="period-badge">Last 7 days</span></div>
                <div className="chart-legend"><span><i className="legend-observed" />Observed</span><span><i className="legend-baseline" />Expected baseline</span></div>
                <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
                    <defs><linearGradient id="observedFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2878cf" stopOpacity={0.2} /><stop offset="95%" stopColor="#2878cf" stopOpacity={0.01} /></linearGradient></defs>
                    <CartesianGrid stroke="#e9edf3" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#8792a5" }} axisLine={false} tickLine={false} dy={10} />
                    <YAxis tick={{ fontSize: 11, fill: "#8792a5" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e6eaf0", fontSize: 12 }} />
                    <Area type="monotone" dataKey="observed" name="Observed" stroke="#2878cf" strokeWidth={2.5} fill="url(#observedFill)" />
                    <Area type="monotone" dataKey="baseline" name="Expected baseline" stroke="#a0aabc" strokeWidth={2} strokeDasharray="5 5" fill="none" />
                  </AreaChart>
                </ResponsiveContainer></div>
                <div className="chart-footnote"><AlertTriangle size={15} /><span>Illustrative signal trend. Not a confirmed outbreak.</span></div>
              </div>
              <div className="panel region-panel">
                <div className="panel-heading"><div><h2>Regional signals</h2><p>Example changes against baseline</p></div><button className="text-button" onClick={() => setActivePage("Regional Map")}>View map</button></div>
                <div className="region-list">{regions.map((r) => <button key={r.name} className="region-row" onClick={() => { setSearch(r.name); setActivePage("Alert Center"); }}><span className={`region-marker ${r.color}`} /><span className="region-name">{r.name}</span><span className={`region-change ${r.color}`}>{r.value}</span></button>)}</div>
                <div className="region-note"><Users size={16} /><span>Regional aggregates only. Small counts may be suppressed.</span></div>
              </div>
            </section>
          </>}

          {(activePage === "Overview" || activePage === "Alert Center" || activePage === "Investigations") && <section className="panel alerts-panel">
            <div className="panel-heading alerts-heading"><div><h2>{activePage === "Investigations" ? "Active investigations" : activePage === "Alert Center" ? "Alert center" : "Recent alerts"}</h2><p>Unusual indicators requiring human assessment.</p></div><span className="table-count">{filteredAlerts.length} records</span></div>
            <div className="table-toolbar">
              <div className="search-box"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search region, indicator or alert ID..." aria-label="Search alerts" />{search && <button className="icon-button" onClick={() => setSearch("")} aria-label="Clear search"><X size={15} /></button>}</div>
              <select className="filter-select" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} aria-label="Filter by priority"><option value="All">All priorities</option><option>High</option><option>Medium</option><option>Low</option></select>
            </div>
            <div className="table-scroll"><table><thead><tr><th>ALERT / REGION</th><th>INDICATOR</th><th>CHANGE</th><th>PRIORITY</th><th>STATUS</th><th /></tr></thead>
              <tbody>{filteredAlerts.map((a) => <tr key={a.id}><td><div className="alert-id">{a.id}</div><div className="cell-secondary">{a.region}</div></td><td className="indicator-cell">{a.indicator}</td><td><span className="change-value"><ArrowUpRight size={15} />+{a.change}%</span></td><td><span className={`priority-pill ${a.priority.toLowerCase()}`}><span />{a.priority}</span></td><td><span className={`status-pill ${a.status === "Needs review" ? "status-review" : a.status === "Under investigation" ? "status-investigating" : "status-monitoring"}`}>{a.status}</span></td><td><button className="view-button" onClick={() => setSelectedAlert(a)}>View</button></td></tr>)}
              {filteredAlerts.length === 0 && <tr><td colSpan={6} className="empty-state">No alerts match these filters.</td></tr>}</tbody>
            </table></div>
            <div className="table-footer"><span>Synthetic demo observations</span><span>Review required before public-health action</span></div>
          </section>}

          <footer className="page-footer"><span>© 2026 AAROGYA ALERT · Hackathon prototype</span><span><ShieldCheck size={14} />Privacy-aware regional analytics</span></footer>
        </div>
      </main>

      {selectedAlert && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedAlert(null); }}>
        <section className="alert-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal-heading"><div><span className="eyebrow">{selectedAlert.id}</span><h2 id="modal-title">{selectedAlert.region}</h2><p>{selectedAlert.indicator}</p></div><button className="icon-button" aria-label="Close alert details" onClick={() => setSelectedAlert(null)}><X size={20} /></button></div>
          <div className="modal-stats"><div><span>Observed change</span><strong>+{selectedAlert.change}%</strong></div><div><span>Review priority</span><strong>{selectedAlert.priority}</strong></div></div>
          <h3>Why was this flagged?</h3><p className="modal-reason">{selectedAlert.reason}</p>
          <div className="uncertainty-note"><ShieldCheck size={18} />Synthetic anomaly signal only, not a confirmed diagnosis or outbreak. Verify data and assess independent evidence.</div>
          <label className="field-label" htmlFor="alert-status">Investigation status</label>
          <select id="alert-status" className="status-select" value={selectedAlert.status} onChange={(e) => updateStatus(selectedAlert.id, e.target.value as AlertItem["status"])}><option>Needs review</option><option>Under investigation</option><option>Monitoring</option></select>
          <button className="primary-button modal-done" onClick={() => setSelectedAlert(null)}><CheckCircle2 size={17} />Done</button>
        </section>
      </div>}
    </div>
  );
}

function StatCard({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: string; detail: string; tone: string }) {
  return <article className="stat-card"><div className="stat-top"><span className={`stat-icon ${tone}`}>{icon}</span><span className="stat-context">DEMO</span></div><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-detail"><Activity size={15} />{detail}</div></article>;
}

export default App;
