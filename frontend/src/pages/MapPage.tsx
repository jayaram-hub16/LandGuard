// Interactive GIS Map Page — improved basemaps, real parcel overlays, map search, occupation detection overlays
import React, { useEffect, useState, useCallback, lazy, Suspense } from 'react'
import {
  MapContainer, TileLayer, GeoJSON, Marker, Popup,
  LayersControl, LayerGroup, useMap
} from 'react-leaflet'
import L from 'leaflet'
import {
  Search, Layers, AlertTriangle, X, Filter, RefreshCw,
  MapPin, Maximize2, Minimize2, Loader2, Shield, Building2
} from 'lucide-react'
import { parcelsAPI, detectionsAPI } from '../services/api'
import type { LandParcel, EncroachmentDetection } from '../types'
import 'leaflet/dist/leaflet.css'

// Lazy-load the 3D view to avoid loading MapLibre GL until needed
const Map3DView = lazy(() => import('../components/map3d/Map3DView'))

// Fix leaflet icon in Vite
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const SEVERITY_COLORS: Record<string, string> = {
  Critical: '#ef4444', High: '#f97316', Medium: '#eab308', Low: '#22c55e',
}

const LAND_USE_COLORS: Record<string, string> = {
  Residential: '#3b82f6', Commercial: '#8b5cf6', Agriculture: '#22c55e',
  Road: '#94a3b8', 'Water Body': '#06b6d4', Forest: '#16a34a',
  Industrial: '#f97316', Other: '#64748b', Unknown: '#374151',
}

// Occupation detection status → map colour
const DETECTION_STATUS_COLORS: Record<string, string> = {
  'Pending Review':                   '#eab308', // yellow — AI-detected unverified
  'Under Investigation':              '#f97316', // orange — under investigation
  'Field Survey Assigned':            '#3b82f6', // blue — field inspection required
  'Verified by Authorized Surveyor':  '#ef4444', // red — human-verified encroachment
  'False Positive':                   '#6b7280', // grey — rejected
  'Resolved':                         '#22c55e', // green — resolved
}

// Overlay one detection's encroachment polygon on the map
function DetectionPolygon({ detection }: { detection: EncroachmentDetection }) {
  const geo = detection.encroachment_boundary_geojson
  if (!geo) return null
  const color = DETECTION_STATUS_COLORS[detection.review_status] || '#eab308'
  return (
    <GeoJSON
      key={detection.id}
      data={geo as unknown as GeoJSON.GeoJsonObject}
      style={{
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.25,
        dashArray: '5 4',
      }}
      onEachFeature={(_, layer) => {
        layer.bindTooltip(
          `<div style="font-family:Inter,sans-serif;font-size:12px;min-width:160px">
            <b style="color:${color}">⚠ Detected Occupation</b><br/>
            Status: ${detection.review_status}<br/>
            Severity: ${detection.severity}<br/>
            Confidence: ${detection.model_confidence != null ? (detection.model_confidence * 100).toFixed(0) + '%' : '—'}<br/>
            <span style="color:#94a3b8;font-size:11px">PRELIMINARY — Not a legal finding</span>
          </div>`,
          { permanent: false, direction: 'top', className: 'leaflet-tooltip-dark' }
        )
      }}
    />
  )
}

// Fly-to controller
function MapController({ center, zoom }: { center: [number, number] | null; zoom?: number }) {
  const map = useMap()
  useEffect(() => {
    if (center) map.flyTo(center, zoom ?? 15, { duration: 1.2 })
  }, [center, zoom, map])
  return null
}

// GeoJSON polygon for one parcel
function ParcelGeoJSON({ parcel, selected, onClick }: {
  parcel: LandParcel; selected: boolean; onClick: () => void
}) {
  const geojson = parcel.boundary_geojson
  if (!geojson) return null
  const color = parcel.is_flagged
    ? (SEVERITY_COLORS['High'])
    : LAND_USE_COLORS[parcel.registered_land_use || 'Unknown'] || '#3b82f6'

  return (
    <GeoJSON
      key={`${parcel.id}-${selected}`}
      data={geojson as unknown as GeoJSON.GeoJsonObject}
      style={{
        color: selected ? '#f59e0b' : color,
        weight: selected ? 3 : (parcel.is_flagged ? 2.5 : 1.5),
        fillColor: selected ? '#f59e0b' : color,
        fillOpacity: selected ? 0.3 : (parcel.is_flagged ? 0.25 : 0.12),
        dashArray: parcel.is_flagged ? '6 4' : undefined,
      }}
      onEachFeature={(_, layer) => {
        layer.on('click', onClick)
        layer.bindTooltip(
          `<div style="font-family:Inter,sans-serif;font-size:12px;min-width:140px">
            <b style="color:#60a5fa">${parcel.parcel_id}</b><br/>
            ${parcel.registered_land_use || 'Unknown land use'}<br/>
            ${parcel.district ? `<span style="color:#94a3b8">${parcel.district}, ${parcel.state}</span>` : ''}
            ${parcel.is_flagged ? '<br/><span style="color:#ef4444;font-weight:bold">⚠ ENCROACHMENT FLAGGED</span>' : ''}
          </div>`,
          { permanent: false, direction: 'top', className: 'leaflet-tooltip-dark' }
        )
      }}
    />
  )
}

// Geocoding via Nominatim — supports address, village, mandal, city, district, state, PIN code
async function geocodeAddress(query: string): Promise<{ lat: number; lng: number; display: string } | null> {
  try {
    const trimmed = query.trim()
    // Detect 6-digit PIN code (India postal code)
    const isPinCode = /^\d{6}$/.test(trimmed)
    const baseUrl = 'https://nominatim.openstreetmap.org/search'
    const params = isPinCode
      ? `?postalcode=${encodeURIComponent(trimmed)}&countrycodes=in&format=json&limit=1&addressdetails=1`
      : `?q=${encodeURIComponent(trimmed)}&format=json&limit=1&countrycodes=in&addressdetails=1`
    const res = await fetch(baseUrl + params, { headers: { 'Accept-Language': 'en' } })
    const data = await res.json()
    if (data.length > 0) {
      const r = data[0]
      const addr = r.address || {}
      // Build a readable label from address components
      const parts = [
        addr.village || addr.town || addr.suburb || addr.neighbourhood || addr.hamlet,
        addr.county || addr.state_district,
        addr.state,
        addr.postcode,
      ].filter(Boolean)
      const display = parts.length > 0 ? parts.join(', ') : r.display_name
      return { lat: parseFloat(r.lat), lng: parseFloat(r.lon), display }
    }
  } catch { /* ignore */ }
  return null
}

export default function MapPage() {
  const [parcels, setParcels] = useState<LandParcel[]>([])
  const [detections, setDetections] = useState<EncroachmentDetection[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedParcel, setSelectedParcel] = useState<LandParcel | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterFlagged, setFilterFlagged] = useState(false)
  const [flyTo, setFlyTo] = useState<[number, number] | null>(null)
  const [flyZoom, setFlyZoom] = useState<number>(15)
  const [showLegend, setShowLegend] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [geocodeResult, setGeocodeResult] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [is3D, setIs3D] = useState(false)
  const [layers, setLayers] = useState({
    parcels: true,
    detections: true,
    complaints: false,
  })

  useEffect(() => { loadParcels() }, [])

  const loadParcels = async () => {
    setLoading(true)
    try {
      // Load up to 500 parcels for the map
      const res = await parcelsAPI.list({ per_page: 500 })
      setParcels(res.data.parcels || [])
      // Also load detections with boundary polygons
      const dRes = await detectionsAPI.list({ per_page: 200 })
      setDetections(
        (dRes.data.detections || []).filter(
          (d: EncroachmentDetection) => d.encroachment_boundary_geojson
        )
      )
    } catch { /* handled by interceptor */ }
    finally { setLoading(false) }
  }

  const filteredParcels = parcels.filter(p => {
    const q = searchQuery.toLowerCase()
    const matchSearch = !q ||
      p.parcel_id.toLowerCase().includes(q) ||
      (p.district || '').toLowerCase().includes(q) ||
      (p.administrative_area || '').toLowerCase().includes(q) ||
      (p.state || '').toLowerCase().includes(q) ||
      (p.owner?.owner_name || '').toLowerCase().includes(q) ||
      (p.address || '').toLowerCase().includes(q)
    const matchFlag = !filterFlagged || p.is_flagged
    return matchSearch && matchFlag
  })

  const handleParcelSelect = useCallback((p: LandParcel) => {
    setSelectedParcel(p)
    setGeocodeResult(null)
    if (p.centroid_lat && p.centroid_lng) {
      setFlyZoom(16)
      setFlyTo([p.centroid_lat, p.centroid_lng])
    }
  }, [])

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    setGeocodeResult(null)

    // First: try to find a matching parcel
    const match = parcels.find(p =>
      p.parcel_id.toLowerCase() === searchQuery.toLowerCase() ||
      p.parcel_id.toLowerCase().includes(searchQuery.toLowerCase())
    )
    if (match) {
      handleParcelSelect(match)
      return
    }

    // Second: geocode the query as an address (Nominatim, no key required)
    setSearching(true)
    const geo = await geocodeAddress(searchQuery)
    setSearching(false)
    if (geo) {
      setFlyZoom(14)
      setFlyTo([geo.lat, geo.lng])
      setGeocodeResult(`📍 ${geo.display} (no registered parcel at this location)`)
    } else {
      setGeocodeResult('No matching parcel or location found for that query.')
    }
  }

  const defaultCenter: [number, number] = [20.5937, 78.9629]
  const mapCenter = parcels.length > 0 && parcels[0].centroid_lat && parcels[0].centroid_lng
    ? [parcels[0].centroid_lat, parcels[0].centroid_lng] as [number, number]
    : defaultCenter

  const mapHeight = expanded ? 'calc(100vh - 130px)' : 'calc(100vh - 210px)'

  return (
    <div className="flex flex-col gap-3 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Interactive GIS Map</h1>
          <p className="text-slate-400 text-xs mt-0.5">
            {loading ? 'Loading...' : `${parcels.length} parcels loaded`} ·
            Basemap tiles: ESRI World Imagery + Labels, © OpenStreetMap / CARTO contributors
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={loadParcels} className="btn-ghost p-2" id="map-refresh-btn" title="Refresh parcels">
            <RefreshCw size={16} />
          </button>
          <button
            onClick={() => setFilterFlagged(!filterFlagged)}
            className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-all
              ${filterFlagged ? 'bg-red-500/20 border-red-500/40 text-red-400' : 'bg-white border-slate-300 text-slate-500'}`}
            id="map-filter-flagged-btn"
          >
            <Filter size={14} /> {filterFlagged ? 'Flagged Only' : 'Show All'}
          </button>
          {/* ── 2D / 3D map toggle ── */}
          <div className="flex rounded-lg border border-slate-300 overflow-hidden text-xs font-semibold">
            <button
              onClick={() => setIs3D(false)}
              className={`flex items-center gap-1.5 px-3 py-2 transition-all
                ${!is3D ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              id="map-2d-btn" title="2D map"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M3 9h18M9 3v18"/>
              </svg>
              2D
            </button>
            <button
              onClick={() => setIs3D(true)}
              className={`flex items-center gap-1.5 px-3 py-2 transition-all
                ${is3D ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              id="map-3d-btn" title="3D map"
            >
              <Building2 size={13} /> 3D
            </button>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="btn-ghost p-2"
            title={expanded ? 'Collapse map' : 'Expand map'}
            id="map-expand-btn"
          >
            {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      <div className="flex gap-3" style={{ height: mapHeight }}>
        {/* ── 3D map (lazy-loaded MapLibre GL) ─────────────────────── */}
        {is3D && (
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center bg-slate-900 rounded-xl border border-slate-200/80">
              <div className="text-white text-sm flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                Loading 3D engine…
              </div>
            </div>
          }>
            <Map3DView
              parcels={filteredParcels}
              detections={detections}
              selectedParcel={selectedParcel}
              onParcelSelect={handleParcelSelect}
              onClose={() => setIs3D(false)}
            />
          </Suspense>
        )}
        {/* ── 2D map layout ─────────────────────────────────────────── */}
        {!is3D && (<>
        {/* Sidebar — collapsible on mobile via CSS */}
        {!expanded && (
          <div className="w-64 flex-shrink-0 flex flex-col gap-2 overflow-hidden">
            {/* Search */}
            <form onSubmit={handleSearch} className="flex gap-1.5">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                <input
                  id="map-search-input"
                  type="text"
                  placeholder="Parcel ID, village, district, PIN code..."
                  className="input-field pl-8 text-xs py-2"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              <button type="submit" className="btn-primary px-2 py-2" disabled={searching} id="map-search-btn">
                {searching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
              </button>
            </form>

            {geocodeResult && (
              <div className="glass-card px-2 py-1.5 text-xs text-slate-500 leading-relaxed">
                {geocodeResult}
              </div>
            )}

            {/* Parcel list */}
            <div className="glass-card flex-1 overflow-y-auto">
              <div className="px-3 py-2 border-b border-slate-200/80 text-xs font-semibold text-slate-500 uppercase tracking-wider sticky top-0 bg-white/90 backdrop-blur-sm">
                {filteredParcels.length} / {parcels.length} Parcels
              </div>
              {loading ? (
                <div className="p-4 text-center text-slate-400 text-sm flex items-center gap-2 justify-center">
                  <Loader2 size={14} className="animate-spin" /> Loading...
                </div>
              ) : filteredParcels.length === 0 ? (
                <div className="p-4 text-center text-slate-400 text-sm">
                  {parcels.length === 0
                    ? 'No parcels yet. Add parcels from the Parcels page.'
                    : 'No parcels match the filter.'}
                </div>
              ) : (
                filteredParcels.map(p => (
                  <button
                    key={p.id}
                    className={`w-full text-left px-3 py-2.5 border-b border-slate-100/40 hover:bg-slate-50
                      transition-all ${selectedParcel?.id === p.id ? 'bg-blue-50 border-l-2 border-l-accent-blue' : ''}`}
                    onClick={() => handleParcelSelect(p)}
                    id={`parcel-list-item-${p.parcel_id}`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono text-xs text-blue-600 font-semibold truncate">{p.parcel_id}</span>
                      {p.is_flagged && <AlertTriangle size={11} className="text-red-400 flex-shrink-0" />}
                    </div>
                    <div className="text-slate-400 text-xs mt-0.5 truncate">
                      {p.owner?.owner_name || p.administrative_area || p.district}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <div className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: LAND_USE_COLORS[p.registered_land_use || 'Unknown'] }} />
                      <span className="text-slate-400 text-xs truncate">{p.registered_land_use || 'Unknown'}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Map */}
        <div className="flex-1 relative rounded-xl overflow-hidden border border-slate-200/80">
          <MapContainer
            center={mapCenter}
            zoom={parcels.length > 0 ? 10 : 5}
            style={{ height: '100%', width: '100%' }}
            zoomControl={true}
          >
            <MapController center={flyTo} zoom={flyZoom} />

            {/* ── Basemap layer control ── */}
            <LayersControl position="topright">
              {/* Satellite + Labels — default selection */}
              <LayersControl.BaseLayer checked name="Satellite + Labels">
                <LayerGroup>
                  <TileLayer
                    attribution='Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Source: Esri, Maxar, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN'
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    maxZoom={19}
                  />
                  <TileLayer
                    attribution='Labels &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey'
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
                    maxZoom={19}
                    opacity={1}
                  />
                </LayerGroup>
              </LayersControl.BaseLayer>

              {/* Satellite without labels */}
              <LayersControl.BaseLayer name="Satellite (No Labels)">
                <TileLayer
                  attribution='Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Source: Esri, Maxar, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN'
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  maxZoom={19}
                />
              </LayersControl.BaseLayer>

              <LayersControl.BaseLayer name="CartoDB Dark">
                <TileLayer
                  attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                  maxZoom={20}
                />
              </LayersControl.BaseLayer>

              <LayersControl.BaseLayer name="OpenStreetMap">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  maxZoom={19}
                />
              </LayersControl.BaseLayer>

              <LayersControl.BaseLayer name="CartoDB Light">
                <TileLayer
                  attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                  url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                  maxZoom={20}
                />
              </LayersControl.BaseLayer>

              <LayersControl.BaseLayer name="Topo / Terrain (ESRI)">
                <TileLayer
                  attribution='Tiles &copy; <a href="https://www.esri.com/">Esri</a>, USGS, NOAA'
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
                  maxZoom={18}
                />
              </LayersControl.BaseLayer>

              <LayersControl.BaseLayer name="OSM Humanitarian">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Tiles &copy; <a href="https://www.hotosm.org/">HOT</a>'
                  url="https://tile-a.openstreetmap.fr/hot/{z}/{x}/{y}.png"
                  maxZoom={19}
                />
              </LayersControl.BaseLayer>
            </LayersControl>

            {/* Parcel polygons */}
            {layers.parcels && filteredParcels.map(p => (
              <ParcelGeoJSON
                key={p.id}
                parcel={p}
                selected={selectedParcel?.id === p.id}
                onClick={() => handleParcelSelect(p)}
              />
            ))}

            {/* Occupation detection overlays — colour-coded by review status */}
            {layers.detections && detections.map(d => (
              <DetectionPolygon key={d.id} detection={d} />
            ))}

            {/* Selected parcel marker (for parcels without boundary polygon) */}
            {layers.parcels && selectedParcel && !selectedParcel.boundary_geojson &&
              selectedParcel.centroid_lat && selectedParcel.centroid_lng && (
                <Marker position={[selectedParcel.centroid_lat, selectedParcel.centroid_lng]}>
                  <Popup>
                    <div style={{ minWidth: 160, fontFamily: 'Inter, sans-serif', fontSize: 12 }}>
                      <div style={{ fontWeight: 700, color: '#60a5fa', marginBottom: 4 }}>{selectedParcel.parcel_id}</div>
                      <div>Area: {selectedParcel.registered_area_sqm?.toFixed(0) ?? '—'} m²</div>
                      <div>Use: {selectedParcel.registered_land_use ?? '—'}</div>
                      <div>District: {selectedParcel.district ?? '—'}</div>
                      {selectedParcel.is_flagged && (
                        <div style={{ color: '#ef4444', fontWeight: 600, marginTop: 4 }}>⚠ ENCROACHMENT FLAGGED</div>
                      )}
                    </div>
                  </Popup>
                </Marker>
              )
            }
          </MapContainer>

          {/* Layer Controls — positioned at bottom-right above map attribution */}
          <div
            id="map-layers-control"
            className="absolute bottom-8 right-3 sm:right-4 z-[1000] bg-white/95 backdrop-blur rounded-xl p-3 border border-slate-200 shadow-xl"
          >
            <div className="text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wider">Layers</div>
            {(Object.entries(layers) as [keyof typeof layers, boolean][]).map(([key, visible]) => (
              <label key={key} className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer hover:text-slate-800 py-0.5">
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={() => setLayers(prev => ({ ...prev, [key]: !prev[key] }))}
                  className="w-3 h-3 accent-accent-blue"
                />
                <span className="capitalize">{key}</span>
              </label>
            ))}
          </div>

          {/* Legend overlay */}
          {showLegend && (
            <div className="absolute bottom-4 left-4 glass-card p-3 z-[1000] min-w-[140px]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500">Legend</span>
                <button onClick={() => setShowLegend(false)} className="text-slate-400 hover:text-slate-500">
                  <X size={12} />
                </button>
              </div>
              <div className="space-y-1.5">
                {Object.entries(LAND_USE_COLORS).slice(0, 7).map(([use, color]) => (
                  <div key={use} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: color }} />
                    <span className="text-xs text-slate-500">{use}</span>
                  </div>
                ))}
                <div className="flex items-center gap-2 mt-1 pt-1 border-t border-slate-200">
                  <div className="w-3 h-3 rounded-sm border-2 border-dashed border-amber-400 flex-shrink-0" />
                  <span className="text-xs text-amber-400">Selected Parcel</span>
                </div>
                <div className="mt-1 pt-1 border-t border-slate-200">
                  <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Occupation Status</div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm bg-yellow-400 flex-shrink-0" />
                      <span className="text-[11px] text-amber-700 font-medium">AI Suspected</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm bg-orange-500 flex-shrink-0" />
                      <span className="text-[11px] text-orange-700 font-medium">Field Inspection</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm bg-red-500 flex-shrink-0" />
                      <span className="text-[11px] text-red-700 font-medium">Human-Verified</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm bg-green-500 flex-shrink-0" />
                      <span className="text-[11px] text-green-700 font-medium">Resolved</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {!showLegend && (
            <button
              onClick={() => setShowLegend(true)}
              className="absolute bottom-4 left-4 glass-card px-3 py-1.5 text-xs text-slate-500
                         hover:text-slate-800 z-[1000] flex items-center gap-1.5"
            >
              <Layers size={12} /> Legend
            </button>
          )}

          {/* Loading overlay */}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-50/60 z-[900]">
              <div className="glass-card px-4 py-3 flex items-center gap-2 text-slate-700 text-sm">
                <Loader2 size={16} className="animate-spin text-blue-600" /> Loading parcels...
              </div>
            </div>
          )}
        </div>

        {/* Parcel detail panel */}
        {selectedParcel && !expanded && (
          <div className="w-64 flex-shrink-0 glass-card overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/80 sticky top-0 bg-white/90 backdrop-blur-sm">
              <h3 className="font-semibold text-slate-800 text-sm">Parcel Details</h3>
              <button onClick={() => setSelectedParcel(null)} className="text-slate-400 hover:text-slate-700">
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <div className="text-xs text-slate-400 mb-0.5">Parcel ID</div>
                <div className="font-mono text-blue-600 font-semibold text-sm">{selectedParcel.parcel_id}</div>
              </div>
              {selectedParcel.is_flagged && (
                <div className="disclaimer-box">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle size={13} /> Encroachment Flagged
                  </div>
                  <div className="mt-1">{selectedParcel.detection_count} detection(s) pending review.</div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['Area', selectedParcel.registered_area_sqm ? `${selectedParcel.registered_area_sqm.toFixed(0)} m²` : '—'],
                  ['Reg. Use', selectedParcel.registered_land_use || '—'],
                  ['Obs. Use', selectedParcel.observed_land_use || '—'],
                  ['District', selectedParcel.district || '—'],
                  ['State', selectedParcel.state || '—'],
                  ['Detections', String(selectedParcel.detection_count)],
                ].map(([label, val]) => (
                  <div key={label}>
                    <div className="text-xs text-slate-400">{label}</div>
                    <div className="text-slate-800 text-xs font-medium mt-0.5 truncate" title={String(val)}>{val}</div>
                  </div>
                ))}
              </div>
              {selectedParcel.owner && (
                <div>
                  <div className="text-xs text-slate-400 mb-0.5">Owner</div>
                  <div className="text-slate-700 text-xs">{selectedParcel.owner.owner_name}</div>
                </div>
              )}
              {selectedParcel.centroid_lat && selectedParcel.centroid_lng && (
                <div>
                  <div className="text-xs text-slate-400 mb-0.5 flex items-center gap-1">
                    <MapPin size={10} /> Coordinates
                  </div>
                  <div className="font-mono text-xs text-slate-500">
                    {selectedParcel.centroid_lat.toFixed(6)}, {selectedParcel.centroid_lng.toFixed(6)}
                  </div>
                </div>
              )}
              <div className="text-xs text-slate-400 italic mt-2">
                {selectedParcel.is_simulated ? 'Simulated data — demonstration only.' : 'Application record.'}
              </div>
            </div>
          </div>
        )}
        </>)}
      </div>
    </div>
  )
}