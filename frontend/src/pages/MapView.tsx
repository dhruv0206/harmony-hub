import { useEffect, useRef, useState, useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Filter } from "lucide-react";
import { Constants } from "@/integrations/supabase/types";
import { US_STATES } from "@/lib/us-states";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import "leaflet.heat";

import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";
const DefaultIcon = L.icon({ iconUrl: icon, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e", contracted: "#3b82f6", in_negotiation: "#eab308",
  prospect: "#f97316", churned: "#ef4444", suspended: "#6b7280",
};

const TIER_COLORS: Record<string, string> = {
  ASSOCIATE: "#3b82f6", MEMBER: "#f59e0b", PREMIER: "#8b5cf6",
};

const BILLING_STATUS_COLORS: Record<string, string> = {
  active: "#22c55e", past_due: "#f97316", suspended: "#ef4444", pending: "#6b7280",
};

type ColorMode = "status" | "tier" | "billing" | "health";
type ViewMode = "providers" | "law_firms" | "both";

function createCircleIcon(color: string) {
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
    iconSize: [14, 14], iconAnchor: [7, 7],
  });
}

function createDiamondIcon(color: string) {
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="width:14px;height:14px;transform:rotate(45deg);background:${color};border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
    iconSize: [14, 14], iconAnchor: [7, 7],
  });
}

function getLegendItems(mode: ColorMode): { label: string; color: string }[] {
  switch (mode) {
    case "status": return Object.entries(STATUS_COLORS).map(([k, v]) => ({ label: k.replace(/_/g, " "), color: v }));
    case "tier": return [
      { label: "Associate", color: TIER_COLORS.ASSOCIATE },
      { label: "Member", color: TIER_COLORS.MEMBER },
      { label: "Premier", color: TIER_COLORS.PREMIER },
      { label: "No Subscription", color: "#6b7280" },
    ];
    case "billing": return [
      { label: "Active", color: BILLING_STATUS_COLORS.active },
      { label: "Past Due", color: BILLING_STATUS_COLORS.past_due },
      { label: "Suspended", color: BILLING_STATUS_COLORS.suspended },
      { label: "Pending", color: BILLING_STATUS_COLORS.pending },
    ];
    case "health": return [
      { label: "Healthy (80+)", color: "#22c55e" },
      { label: "Warning (60-79)", color: "#eab308" },
      { label: "At Risk (40-59)", color: "#f97316" },
      { label: "Critical (<40)", color: "#ef4444" },
      { label: "No Score", color: "#6b7280" },
    ];
  }
}

export default function MapView() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markersRef = useRef<L.MarkerClusterGroup | null>(null);
  const heatLayerRef = useRef<any>(null);
  const coverageLayerRef = useRef<L.LayerGroup | null>(null);
  const legendRef = useRef<L.Control | null>(null);
  const navigate = useNavigate();

  const [filterStatus, setFilterStatus] = useState("all");
  const [filterState, setFilterState] = useState("all");
  const [filterRep, setFilterRep] = useState("all");
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showCoverage, setShowCoverage] = useState(false);
  const [colorMode, setColorMode] = useState<ColorMode>("status");
  const [viewMode, setViewMode] = useState<ViewMode>("providers");

  const { data: providers } = useQuery({
    queryKey: ["map-v-provider-list"],
    queryFn: async () => {
      const { data } = await supabase.from("v_provider_list" as any).select("id, business_name, contact_email, latitude, longitude, city, state, status, provider_type, assigned_sales_rep, health_score, rep_name, billing_status, monthly_amount, tier_name, tier_code, category_name, active_contract_count");
      return ((data as any[]) ?? []).map(p => {
        if (!p.latitude && p.state) {
          const st = US_STATES.find(s => s.abbr === p.state || s.name === p.state);
          if (st) return { ...p, latitude: st.lat, longitude: st.lng };
        }
        return p;
      });
    },
  });

  const { data: lawFirms } = useQuery({
    queryKey: ["map-v-law-firm-list"],
    queryFn: async () => {
      const { data } = await supabase.from("v_law_firm_list" as any).select("id, firm_name, latitude, longitude, city, state, status, firm_size, practice_areas, rep_name, billing_status, monthly_amount, tier_name, tier_code");
      return ((data as any[]) ?? []).map(f => {
        if (!f.latitude && f.state) {
          const st = US_STATES.find(s => s.abbr === f.state || s.name === f.state);
          if (st) return { ...f, latitude: st.lat, longitude: st.lng };
        }
        return f;
      });
    },
  });

  const { data: salesReps } = useQuery({
    queryKey: ["map-sales-reps"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, user_roles(role)");
      return (data ?? []).filter((p: any) => (p.user_roles as any[])?.some((r: any) => r.role === "admin" || r.role === "sales_rep"));
    },
  });

  const uniqueStates = useMemo(() => [...new Set((providers ?? []).map((p: any) => p.state).filter(Boolean))].sort(), [providers]);

  const filtered = useMemo(() => {
    let result = (providers ?? []) as any[];
    if (filterStatus !== "all") result = result.filter((p: any) => p.status === filterStatus);
    if (filterState !== "all") result = result.filter((p: any) => p.state === filterState);
    if (filterRep !== "all") result = result.filter((p: any) => p.assigned_sales_rep === filterRep);
    return result;
  }, [providers, filterStatus, filterState, filterRep]);

  const filteredLawFirms = useMemo(() => {
    let result = (lawFirms ?? []) as any[];
    if (filterStatus !== "all") result = result.filter((f: any) => f.status === filterStatus);
    if (filterState !== "all") result = result.filter((f: any) => f.state === filterState);
    return result;
  }, [lawFirms, filterStatus, filterState]);

  function getProviderColor(p: any): string {
    switch (colorMode) {
      case "tier": {
        const tc = p.tier_code;
        return tc ? (TIER_COLORS[tc] || "#6b7280") : "#6b7280";
      }
      case "billing": {
        return p.billing_status ? (BILLING_STATUS_COLORS[p.billing_status] || "#6b7280") : "#6b7280";
      }
      case "health": {
        const score = p.health_score;
        if (score == null) return "#6b7280";
        if (score >= 80) return "#22c55e";
        if (score >= 60) return "#eab308";
        if (score >= 40) return "#f97316";
        return "#ef4444";
      }
      default:
        return STATUS_COLORS[p.status] || "#6b7280";
    }
  }

  function getLawFirmColor(f: any): string {
    if (colorMode === "billing") {
      return f.billing_status ? (BILLING_STATUS_COLORS[f.billing_status] || "#6b7280") : "#6b7280";
    }
    return STATUS_COLORS[f.status] || "#6b7280";
  }

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const map = L.map(mapRef.current, { center: [39.8283, -98.5795], zoom: 4, zoomControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 18,
    }).addTo(map);
    setTimeout(() => map.invalidateSize(), 100);
    mapInstance.current = map;
    return () => { map.remove(); mapInstance.current = null; };
  }, []);

  // Update legend
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    if (legendRef.current) { map.removeControl(legendRef.current); legendRef.current = null; }
    const legend = new L.Control({ position: "bottomright" });
    const items = getLegendItems(colorMode);
    legend.onAdd = () => {
      const div = L.DomUtil.create("div", "map-legend");
      const title = colorMode === "status" ? "Status" : colorMode === "tier" ? "Membership Tier" : colorMode === "billing" ? "Billing Status" : "Health Score";
      let html = `<h4>${title}</h4>`;
      html += items.map(i => `<div class="map-legend-item"><span class="map-legend-dot" style="background:${i.color}"></span>${i.label}</div>`).join("");
      if (viewMode === "both") {
        html += `<div style="margin-top:6px;border-top:1px solid #ddd;padding-top:4px;"><h4>Shape</h4><div class="map-legend-item"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#888;margin-right:6px;"></span>Provider</div><div class="map-legend-item"><span style="display:inline-block;width:10px;height:10px;transform:rotate(45deg);background:#888;margin-right:6px;"></span>Law Firm</div></div>`;
      }
      div.innerHTML = html;
      return div;
    };
    legend.addTo(map);
    legendRef.current = legend;
  }, [colorMode, viewMode]);

  // Update markers
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    if (markersRef.current) { map.removeLayer(markersRef.current); markersRef.current = null; }
    if (heatLayerRef.current) { map.removeLayer(heatLayerRef.current); heatLayerRef.current = null; }
    if (coverageLayerRef.current) { map.removeLayer(coverageLayerRef.current); coverageLayerRef.current = null; }

    const showProviders = viewMode === "providers" || viewMode === "both";
    const showLF = viewMode === "law_firms" || viewMode === "both";

    const providerCoords = showProviders ? filtered.filter((p: any) => p.latitude && p.longitude) : [];
    const lfCoords = showLF ? filteredLawFirms.filter((f: any) => f.latitude && f.longitude) : [];

    if (showHeatmap && (providerCoords.length > 0 || lfCoords.length > 0)) {
      try {
        const heatData = [
          ...providerCoords.map((p: any) => [p.latitude!, p.longitude!, 1]),
          ...lfCoords.map((f: any) => [f.latitude!, f.longitude!, 1]),
        ];
        // @ts-ignore
        const heat = L.heatLayer(heatData, { radius: 30, blur: 20, maxZoom: 10 });
        heat.addTo(map); heatLayerRef.current = heat;
      } catch {}
    }

    if (showCoverage) {
      const coverageGroup = L.layerGroup();
      const stateCounts: Record<string, number> = {};
      if (showProviders) (providers ?? []).forEach((p: any) => { if (p.state) stateCounts[p.state] = (stateCounts[p.state] || 0) + 1; });
      if (showLF) (lawFirms ?? []).forEach((f: any) => { if (f.state) stateCounts[f.state] = (stateCounts[f.state] || 0) + 1; });
      const maxCount = Math.max(...Object.values(stateCounts), 1);
      US_STATES.filter(s => s.abbr !== "AK" && s.abbr !== "HI").forEach(state => {
        const count = stateCounts[state.abbr] || stateCounts[state.name] || 0;
        const ratio = count / maxCount;
        let color = "#ef4444";
        if (ratio > 0.6) color = "#16a34a"; else if (ratio > 0.3) color = "#eab308"; else if (ratio > 0) color = "#f97316";
        L.circle([state.lat, state.lng], { radius: 80000, fillColor: color, fillOpacity: 0.25, stroke: true, color, weight: 1 }).bindTooltip(`${state.name}: ${count} ${viewMode === "law_firms" ? "law firms" : viewMode === "both" ? "total" : "providers"}`).addTo(coverageGroup);
      });
      coverageGroup.addTo(map); coverageLayerRef.current = coverageGroup;
    }

    if (!showHeatmap) {
      // @ts-ignore
      const clusterGroup = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 50 });

      // Provider markers
      if (showProviders) {
        providerCoords.forEach((p: any) => {
          const color = getProviderColor(p);
          const marker = L.marker([p.latitude!, p.longitude!], { icon: createCircleIcon(color) });
          const tierInfo = (p.tier_code || p.billing_status)
            ? `<p style="margin:0 0 2px;font-size:12px;">Tier: <strong>${p.tier_code || "—"}</strong> · Billing: <strong>${p.billing_status || "—"}</strong></p>`
            : "";
          marker.bindPopup(`
            <div style="min-width:200px;font-family:system-ui,sans-serif;">
              <h3 style="margin:0 0 4px;font-size:14px;font-weight:600;">${p.business_name}</h3>
              <p style="margin:0 0 2px;font-size:12px;color:#666;">${[p.city, p.state].filter(Boolean).join(", ") || "No location"}</p>
              <p style="margin:0 0 2px;font-size:12px;"><span style="display:inline-block;padding:2px 6px;border-radius:4px;background:${STATUS_COLORS[p.status] || "#6b7280"}20;color:${STATUS_COLORS[p.status] || "#6b7280"};font-size:11px;font-weight:500;text-transform:capitalize;">${(p.status || "prospect").replace(/_/g, " ")}</span></p>
              ${tierInfo}
              ${p.provider_type ? `<p style="margin:0 0 2px;font-size:12px;color:#666;">Type: ${p.provider_type}</p>` : ""}
              <p style="margin:0 0 4px;font-size:12px;">Active Contracts: <strong>${p.active_contract_count ?? 0}</strong></p>
              <p style="margin:0 0 2px;font-size:12px;color:#666;">Rep: ${p.rep_name || "Unassigned"}</p>
              <a href="/providers/${p.id}" style="font-size:12px;color:#3b82f6;text-decoration:none;" onclick="event.preventDefault();window.__navigateProvider('${p.id}')">View Details →</a>
            </div>
          `);
          clusterGroup.addLayer(marker);
        });
      }

      // Law firm markers
      if (showLF) {
        lfCoords.forEach((f: any) => {
          const color = getLawFirmColor(f);
          const marker = L.marker([f.latitude!, f.longitude!], { icon: createDiamondIcon(color) });
          const monthlyFee = f.monthly_amount != null ? `$${Number(f.monthly_amount).toLocaleString()}` : "—";
          const practiceAreas = (f.practice_areas as string[] | null)?.join(", ") || "—";
          marker.bindPopup(`
            <div style="min-width:200px;font-family:system-ui,sans-serif;">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                <span style="display:inline-block;width:10px;height:10px;transform:rotate(45deg);background:${color};border:1px solid white;"></span>
                <h3 style="margin:0;font-size:14px;font-weight:600;">${f.firm_name}</h3>
              </div>
              <p style="margin:0 0 2px;font-size:12px;color:#666;">${[f.city, f.state].filter(Boolean).join(", ") || "No location"}</p>
              <p style="margin:0 0 2px;font-size:12px;"><span style="display:inline-block;padding:2px 6px;border-radius:4px;background:${STATUS_COLORS[f.status] || "#6b7280"}20;color:${STATUS_COLORS[f.status] || "#6b7280"};font-size:11px;font-weight:500;text-transform:capitalize;">${(f.status || "prospect").replace(/_/g, " ")}</span></p>
              <p style="margin:0 0 2px;font-size:12px;">Size: <strong>${f.firm_size || "—"}</strong></p>
              <p style="margin:0 0 2px;font-size:12px;">Practice Areas: <strong>${practiceAreas}</strong></p>
              <p style="margin:0 0 4px;font-size:12px;">Monthly Fee: <strong>${monthlyFee}</strong></p>
              <a href="/law-firms/${f.id}" style="font-size:12px;color:#3b82f6;text-decoration:none;" onclick="event.preventDefault();window.__navigateLawFirm('${f.id}')">View Details →</a>
            </div>
          `);
          clusterGroup.addLayer(marker);
        });
      }

      map.addLayer(clusterGroup); markersRef.current = clusterGroup;
    }
  }, [filtered, filteredLawFirms, showHeatmap, showCoverage, colorMode, viewMode, providers, lawFirms]);

  useEffect(() => {
    (window as any).__navigateProvider = (id: string) => navigate(`/providers/${id}`);
    (window as any).__navigateLawFirm = (id: string) => navigate(`/law-firms/${id}`);
    return () => { delete (window as any).__navigateProvider; delete (window as any).__navigateLawFirm; };
  }, [navigate]);

  const shownProviderCount = viewMode !== "law_firms" ? filtered.filter((p: any) => p.latitude && p.longitude).length : 0;
  const shownLFCount = viewMode !== "providers" ? filteredLawFirms.filter((f: any) => f.latitude && f.longitude).length : 0;

  const isMobile = useIsMobile();
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const filterPanel = (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold mb-1">Map View</h2>
        <p className="text-xs text-muted-foreground">
          {viewMode === "both"
            ? `${shownProviderCount} providers + ${shownLFCount} law firms`
            : viewMode === "law_firms"
              ? `${shownLFCount} of ${lawFirms?.length ?? 0} law firms shown`
              : `${shownProviderCount} of ${providers?.length ?? 0} providers shown`}
        </p>
      </div>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">View</Label>
          <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="providers">Providers</SelectItem>
              <SelectItem value="law_firms">Law Firms</SelectItem>
              <SelectItem value="both">Both</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Color By</Label>
          <Select value={colorMode} onValueChange={(v) => setColorMode(v as ColorMode)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="status">Status</SelectItem>
              {viewMode !== "law_firms" && <SelectItem value="tier">Membership Tier</SelectItem>}
              <SelectItem value="billing">Billing Status</SelectItem>
              {viewMode !== "law_firms" && <SelectItem value="health">Health Score</SelectItem>}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Status</Label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {Constants.public.Enums.provider_status.map(s => (<SelectItem key={s} value={s} className="capitalize text-xs">{s.replace(/_/g, " ")}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">State</Label>
          <Select value={filterState} onValueChange={setFilterState}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All States</SelectItem>
              {uniqueStates.map(s => <SelectItem key={s} value={s!} className="text-xs">{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {viewMode !== "law_firms" && (
          <div className="space-y-1.5">
            <Label className="text-xs">Sales Rep</Label>
            <Select value={filterRep} onValueChange={setFilterRep}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Reps</SelectItem>
                {salesReps?.map(r => <SelectItem key={r.id} value={r.id} className="text-xs">{r.full_name || r.id.slice(0, 8)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="space-y-3 pt-2 border-t">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Heatmap</Label>
          <Switch checked={showHeatmap} onCheckedChange={setShowHeatmap} />
        </div>
        <div className="flex items-center justify-between">
          <Label className="text-xs">Coverage Overlay</Label>
          <Switch checked={showCoverage} onCheckedChange={setShowCoverage} />
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <div className="flex flex-col h-[calc(100vh-5rem)] -m-4">
        <div className="relative flex-1">
          <div ref={mapRef} className="absolute inset-0" />
          {/* Floating filter button */}
          <button
            onClick={() => setFilterSheetOpen(true)}
            className="absolute top-3 left-3 z-[1000] bg-card border border-border rounded-lg px-3 py-2 shadow-lg text-sm font-medium flex items-center gap-2"
          >
            <Filter className="h-4 w-4" />
            Filters
          </button>
        </div>
        {/* Bottom sheet for filters */}
        {filterSheetOpen && (
          <div className="fixed inset-0 z-[2000]" onClick={() => setFilterSheetOpen(false)}>
            <div className="absolute inset-0 bg-black/40" />
            <div
              className="absolute bottom-0 left-0 right-0 bg-card rounded-t-2xl p-4 max-h-[70vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {filterPanel}
              <Button className="w-full mt-4" onClick={() => setFilterSheetOpen(false)}>Apply</Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-5rem)] gap-4 -m-6">
      <div className="w-64 p-4 border-r bg-card overflow-y-auto shrink-0">
        {filterPanel}
      </div>
      <div className="flex-1 relative">
        <div ref={mapRef} className="absolute inset-0 rounded-lg" />
      </div>
    </div>
  );
}
