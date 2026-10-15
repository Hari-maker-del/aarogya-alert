import { useEffect, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { latLngBounds } from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../services/api";
import "../map.css";

export type Region = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  priority: "High" | "Medium" | "Low" | "Normal";
  change: number;
  indicator: string;
  note: string;
};

const demoRegions: Region[] = [
  { id: "REG-01", name: "Demo North", latitude: 13.18, longitude: 80.24, priority: "High", change: 61, indicator: "Respiratory medicine demand", note: "Simulated pharmacy anomaly. Clinical corroboration pending." },
  { id: "REG-02", name: "Demo East", latitude: 13.04, longitude: 80.31, priority: "Medium", change: 34, indicator: "Fever clinic visits", note: "Simulated clinic indicator above its demo baseline." },
  { id: "REG-03", name: "Demo Central", latitude: 13.07, longitude: 80.21, priority: "Low", change: 18, indicator: "Gastrointestinal clinic visits", note: "Small simulated deviation. Further observations are needed." },
  { id: "REG-04", name: "Demo South", latitude: 12.91, longitude: 80.22, priority: "Medium", change: 29, indicator: "Respiratory medicine demand", note: "Simulated demand increase. Independent evidence is incomplete." },
  { id: "REG-05", name: "Demo West", latitude: 13.08, longitude: 80.12, priority: "Normal", change: 4, indicator: "Combined demo indicators", note: "No significant deviation in this synthetic scenario." }
];

const colors: Record<Region["priority"], string> = {
  High: "#dc514b", Medium: "#e49a32", Low: "#c7ae35", Normal: "#36a477"
};

function FitMapToRegions({ regions, selected }: { regions: Region[]; selected: Region | null }) {
  const map = useMap();
  useEffect(() => {
    if (selected) return;
    const validRegions = regions.filter((region) => Number.isFinite(region.latitude) && Number.isFinite(region.longitude));
    if (!validRegions.length) return;

    if (validRegions.length === 1) {
      map.setView([validRegions[0].latitude, validRegions[0].longitude], 8, { animate: false });
    } else {
      const bounds = latLngBounds(validRegions.map((region) => [region.latitude, region.longitude] as [number, number]));
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 7, animate: false });
    }
    map.invalidateSize();
  }, [map, regions, selected]);
  return null;
}

function FlyToRegion({ region }: { region: Region | null }) {
  const map = useMap();
  useEffect(() => {
    if (region) map.flyTo([region.latitude, region.longitude], 13, { duration: 0.6 });
  }, [map, region]);
  return null;
}

export default function RegionalMap() {
  const [selected, setSelected] = useState<Region | null>(null);
  const [filter, setFilter] = useState("All");
  const [regions, setRegions] = useState<Region[]>(demoRegions);

  useEffect(() => {
    let cancelled = false;
    const loadRegions = async () => {
      try {
        const [regionRecords, alerts] = await Promise.all([api.regions(), api.alerts()]);
        const rank: Record<string, number> = { priority_review: 4, needs_review: 3, watch: 2, normal: 1 };
        const mapped: Region[] = regionRecords.map((record) => {
          const alert = alerts
            .filter((item) => item.region_id === record.region_id)
            .sort((a, b) => (rank[b.review_priority] ?? 0) - (rank[a.review_priority] ?? 0))[0];
          const priority: Region["priority"] = !alert || alert.review_priority === "normal"
            ? "Normal"
            : alert.review_priority === "priority_review"
              ? "High"
              : alert.review_priority === "needs_review"
                ? "Medium"
                : "Low";
          const note = alert?.supporting_evidence?.[0] ?? "No active synthetic alert for this region.";
          return {
            id: record.region_id,
            name: record.region_name,
            latitude: record.latitude,
            longitude: record.longitude,
            priority,
            change: Math.round(alert?.percentage_change ?? 0),
            indicator: alert
              ? alert.indicator_type.replace(/_/g, " ").replace(/\\b\\w/g, (letter) => letter.toUpperCase())
              : "Combined demo indicators",
            note,
          };
        });
        if (!cancelled && mapped.length) {
          setRegions(mapped);
          setSelected((current) => current ? mapped.find((r) => r.id === current.id) ?? null : null);
        }
      } catch {
        // Keep the bundled fictional demo map available when the API is unreachable.
      }
    };
    void loadRegions();
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleRegions = regions.filter((r) => filter === "All" || r.priority === filter);
  const mapCenter = useMemo<[number, number]>(() => {
    if (!regions.length) return [13.05, 80.22];
    return [
      regions.reduce((sum, region) => sum + region.latitude, 0) / regions.length,
      regions.reduce((sum, region) => sum + region.longitude, 0) / regions.length,
    ];
  }, [regions]);

  return (
    <div className="regional-map-layout">
      <section className="regional-map-panel">
        <div className="regional-map-toolbar">
          <div>
            <h3>Regional signal map</h3>
            <p>All available regions are pinned; choose a marker for details.</p>
          </div>
          <select aria-label="Filter map by priority" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option>All</option><option>High</option><option>Medium</option><option>Low</option><option>Normal</option>
          </select>
          <span className="map-pin-count">{visibleRegions.length} / {regions.length} pins</span>
        </div>
        <div className="regional-map-canvas">
          <MapContainer center={mapCenter} zoom={6} minZoom={3} maxZoom={14} scrollWheelZoom className="leaflet-map">
            <FitMapToRegions regions={visibleRegions} selected={selected} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {visibleRegions.map((region) => (
              <CircleMarker
                key={region.id}
                center={[region.latitude, region.longitude]}
                radius={selected?.id === region.id ? 12 : 9}
                pathOptions={{ color: "#fff", weight: 2, fillColor: colors[region.priority], fillOpacity: 0.9 }}
                eventHandlers={{ click: () => setSelected(region) }}
              >
                <Popup>
                  <strong>{region.name}</strong><br />
                  Priority: {region.priority}<br />
                  Demo change: +{region.change}%<br />
                  {region.indicator}
                </Popup>
              </CircleMarker>
            ))}
            <FlyToRegion region={selected} />
          </MapContainer>
        </div>
        <div className="map-legend">
          {(["High", "Medium", "Low", "Normal"] as const).map((p) => (
            <span key={p}><i style={{ background: colors[p] }} />{p}</span>
          ))}
        </div>
      </section>
      <aside className="region-detail-panel">
        <h3>Region details</h3>
        <p className="map-detail-subtitle">Select a marker to inspect its synthetic indicator.</p>
        {selected ? (
          <>
            <div className="selected-region-name">{selected.name}</div>
            <div className={`map-priority priority-${selected.priority.toLowerCase()}`}>{selected.priority} review priority</div>
            <div className="region-detail-stat"><span>Change from demo baseline</span><strong>+{selected.change}%</strong></div>
            <div className="region-detail-stat"><span>Region identifier</span><strong>{selected.id}</strong></div>
            <div className="region-detail-copy"><span>Indicator</span><p>{selected.indicator}</p></div>
            <div className="region-detail-copy"><span>Evidence note</span><p>{selected.note}</p></div>
            <button className="map-clear-button" onClick={() => setSelected(null)}>Clear selection</button>
          </>
        ) : (
          <div className="map-empty-selection"><MapPin size={30} /><p>Select a colored marker on the map to see regional details.</p></div>
        )}
        <div className="map-data-warning">Fictional demo regions and simulated observations only. These are not real outbreak locations or real health data.</div>
      </aside>
    </div>
  );
}
