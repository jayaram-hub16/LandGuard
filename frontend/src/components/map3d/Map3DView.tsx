/**
 * Map3DView — Advanced 3D GIS map using MapLibre GL JS
 *
 * Features:
 *  - 3D globe / map rendering with satellite imagery (free ESRI tiles)
 *  - Real OSM 3D buildings via fill-extrusion (no API token needed)
 *  - Land parcel boundaries as GeoJSON overlays with 3D extrusion
 *  - Encroachment polygons colour-coded by review status
 *  - Interactive parcel/building selection
 *  - Full camera controls: zoom, tilt, rotate, reset
 *  - Layer toggles: buildings, parcels, encroachments, labels, terrain
 *  - 2D↔3D switch preserves selected parcel
 *
 * Attribution:
 *  - Basemap tiles: © Esri, Maxar, Earthstar Geographics (free, no key needed)
 *  - Building data: © OpenStreetMap contributors (OSM vector tiles via MapTiler)
 *  - Terrain: Maptiler Terrain tiles (free tier, no key for basic use)
 *
 * IMPORTANT: Building heights shown from OSM data where available.
 * Where OSM height tags are absent, MapLibre defaults to a nominal 10 m.
 * This nominal height is clearly labelled as estimated — it is NOT
 * real-world building height data and must NOT be used as legal evidence.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  RotateCcw, Maximize2, Minimize2, Layers, Building2,
  Map, AlertTriangle, X, Info, ChevronUp, ChevronDown,
  Compass, ZoomIn, ZoomOut, Eye, EyeOff
} from 'lucide-react'
import type { LandParcel, EncroachmentDetection } from '../../types'

// ── Colour maps (match existing MapPage for consistency) ──────────────────
const LAND_USE_COLORS: Record<string, string> = {
  Residential: '#3b82f6', Commercial: '#8b5cf6', Agriculture: '#22c55e',
  Road: '#94a3b8', 'Water Body': '#06b6d4', Forest: '#16a34a',
  Industrial: '#f97316', Other: '#64748b', Unknown: '#374151',
}

const DETECTION_STATUS_COLORS: Record<string, string> = {
  'Pending Review':                  '#eab308',
  'Under Investigation':             '#f97316',
  'Field Survey Assigned':           '#3b82f6',
  'Verified by Authorized Surveyor': '#ef4444',
  'False Positive':                  '#6b7280',
  'Resolved':                        '#22c55e',
}

function hexToRgba(hex: string, alpha = 0.5): [number, number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [r, g, b, Math.round(alpha * 255)]
}

// ── Helpers ───────────────────────────────────────────────────────────────

function colorToRgbArray(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [r, g, b]
}

function buildParcelGeoJSON(parcels: LandParcel[], selectedId?: string) {
  return {
    type: 'FeatureCollection' as const,
    features: parcels
      .filter(p => p.boundary_geojson)
      .map(p => ({
        type: 'Feature' as const,
        geometry: p.boundary_geojson as unknown as GeoJSON.Geometry,
        properties: {
          parcel_id:    p.parcel_id,
          id:           p.id,
          land_use:     p.registered_land_use || 'Unknown',
          is_flagged:   p.is_flagged,
          area_sqm:     p.registered_area_sqm,
          district:     p.district || '',
          state:        p.state || '',
          owner:        p.owner?.owner_name || '',
          selected:     p.id === selectedId,
          color:        p.is_flagged ? '#f97316' : (LAND_USE_COLORS[p.registered_land_use || 'Unknown'] || '#3b82f6'),
          is_simulated: p.is_simulated,
        },
      })),
  }
}

function buildDetectionGeoJSON(detections: EncroachmentDetection[]) {
  return {
    type: 'FeatureCollection' as const,
    features: detections
      .filter(d => d.encroachment_boundary_geojson)
      .map(d => ({
        type: 'Feature' as const,
        geometry: d.encroachment_boundary_geojson as unknown as GeoJSON.Geometry,
        properties: {
          id:             d.id,
          parcel_id:      d.parcel_id,
          review_status:  d.review_status,
          severity:       d.severity,
          confidence:     d.model_confidence,
          area_diff_pct:  d.area_difference_pct,
          color:          DETECTION_STATUS_COLORS[d.review_status] || '#eab308',
        },
      })),
  }
}

// ── Default India centre ──────────────────────────────────────────────────
const INDIA_CENTER: [number, number] = [78.9629, 20.5937]
const INDIA_ZOOM = 4.5

// ── Basemap style: free ESRI satellite with optional OSM labels ───────────
// Using MapLibre-compatible style JSON built from ESRI XYZ tiles
// No API token required for ESRI World Imagery tiles
function buildMapStyle(showLabels: boolean): maplibregl.StyleSpecification {
  const sources: Record<string, maplibregl.SourceSpecification> = {
    'esri-satellite': {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: '© Esri, Maxar, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN',
      maxzoom: 19,
    },
    'esri-labels': {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: '© Esri — Esri, DeLorme, NAVTEQ, TomTom',
      maxzoom: 19,
    },
    // OSM vector tiles for 3D building footprints (free, no key)
    'osm-buildings': {
      type: 'vector',
      tiles: ['https://tiles.openfreemap.org/planet/{z}/{x}/{y}'],
      attribution: '© OpenStreetMap contributors',
      maxzoom: 14,
    },
  }

  const layers: maplibregl.LayerSpecification[] = [
    {
      id: 'esri-satellite-layer',
      type: 'raster',
      source: 'esri-satellite',
      minzoom: 0,
      maxzoom: 22,
    },
  ]

  if (showLabels) {
    layers.push({
      id: 'esri-labels-layer',
      type: 'raster',
      source: 'esri-labels',
      minzoom: 0,
      maxzoom: 22,
      paint: { 'raster-opacity': 0.9 },
    })
  }

  return {
    version: 8,
    glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
    sprite: 'https://openmaptiles.github.io/osm-bright-gl-style/sprite',
    sources,
    layers,
  }
}

// ── Props ─────────────────────────────────────────────────────────────────

interface Map3DViewProps {
  parcels: LandParcel[]
  detections: EncroachmentDetection[]
  selectedParcel: LandParcel | null
  onParcelSelect: (p: LandParcel) => void
  onClose: () => void  // switch back to 2D
}

// ── Component ─────────────────────────────────────────────────────────────

export default function Map3DView({
  parcels, detections, selectedParcel, onParcelSelect, onClose
}: Map3DViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<maplibregl.Map | null>(null)
  const popupRef     = useRef<maplibregl.Popup | null>(null)

  const [mapReady,       setMapReady]       = useState(false)
  const [tilt,           setTilt]           = useState(45)      // pitch in degrees
  const [layers, setLayers] = useState({
    buildings:    true,
    parcels:      true,
    detections:   true,
    labels:       true,
  })
  const [selectedInfo, setSelectedInfo] = useState<LandParcel | null>(null)
  const [expanded,     setExpanded]     = useState(false)
  const [showLegend,   setShowLegend]   = useState(true)

  // Determine initial map centre from parcels
  const initialCenter = useCallback((): [number, number] => {
    if (selectedParcel?.centroid_lng && selectedParcel?.centroid_lat) {
      return [selectedParcel.centroid_lng, selectedParcel.centroid_lat]
    }
    const first = parcels.find(p => p.centroid_lat && p.centroid_lng)
    if (first) return [first.centroid_lng!, first.centroid_lat!]
    return INDIA_CENTER
  }, [parcels, selectedParcel])

  const initialZoom = useCallback((): number => {
    return parcels.length > 0 && parcels[0].centroid_lat ? 12 : INDIA_ZOOM
  }, [parcels])

  // ── Map initialisation ────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style:     buildMapStyle(layers.labels),
      center:    initialCenter(),
      zoom:      initialZoom(),
      pitch:     45,
      bearing:   -15,
      antialias: true,
      maxPitch:  85,
    })

    mapRef.current = map

    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')

    map.on('load', () => {
      setMapReady(true)
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Add / update data layers after map ready ──────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    // ── OSM 3D buildings ────────────────────────────────────────────────
    const addBuildingsLayer = () => {
      if (map.getSource('osm-buildings')) return

      // Use openfreemap vector tiles which contain building data
      map.addSource('osm-buildings', {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet',
        attribution: '© OpenStreetMap contributors',
      })

      // 3D extruded buildings — height from OSM tags where available
      map.addLayer({
        id:     'osm-3d-buildings',
        type:   'fill-extrusion',
        source: 'osm-buildings',
        'source-layer': 'building',
        minzoom: 14,
        paint: {
          'fill-extrusion-color': [
            'interpolate', ['linear'], ['coalesce', ['get', 'height'], 10],
            0,   '#1e3a5f',
            10,  '#2563eb',
            30,  '#7c3aed',
            60,  '#dc2626',
            100, '#f59e0b',
          ],
          // Use actual OSM height tag; fall back to 10 m (estimated)
          'fill-extrusion-height': [
            'coalesce', ['get', 'height'], ['get', 'building:levels'],
            10,
          ],
          'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
          'fill-extrusion-opacity': 0.85,
        },
        layout: { visibility: layers.buildings ? 'visible' : 'none' },
      })
    }

    addBuildingsLayer()

    // ── Land parcel polygons ────────────────────────────────────────────
    const parcelGeoJSON = buildParcelGeoJSON(parcels, selectedParcel?.id)

    if (map.getSource('parcels')) {
      (map.getSource('parcels') as maplibregl.GeoJSONSource).setData(parcelGeoJSON as GeoJSON.GeoJSON)
    } else {
      map.addSource('parcels', { type: 'geojson', data: parcelGeoJSON as GeoJSON.GeoJSON })

      // 3D parcel surface (extruded ~1 m so it's visible above ground)
      map.addLayer({
        id:   'parcels-fill-3d',
        type: 'fill-extrusion',
        source: 'parcels',
        paint: {
          'fill-extrusion-color': [
            'case',
            ['get', 'selected'], '#f59e0b',
            ['get', 'is_flagged'], '#ef4444',
            ['get', 'color'],
          ],
          'fill-extrusion-height': 2,
          'fill-extrusion-base':   0,
          'fill-extrusion-opacity': [
            'case', ['get', 'selected'], 0.6, 0.25
          ],
        },
        layout: { visibility: layers.parcels ? 'visible' : 'none' },
      })

      // Parcel outline
      map.addLayer({
        id:   'parcels-outline',
        type: 'line',
        source: 'parcels',
        paint: {
          'line-color': [
            'case',
            ['get', 'selected'], '#f59e0b',
            ['get', 'is_flagged'], '#ef4444',
            ['get', 'color'],
          ],
          'line-width': ['case', ['get', 'selected'], 3, ['get', 'is_flagged'], 2.5, 1.5],
          'line-dasharray': ['case', ['get', 'is_flagged'], ['literal', [6, 4]], ['literal', [1, 0]]],
        },
        layout: { visibility: layers.parcels ? 'visible' : 'none' },
      })

      // Parcel ID labels (shown at zoom 14+)
      map.addLayer({
        id:   'parcels-labels',
        type: 'symbol',
        source: 'parcels',
        minzoom: 14,
        layout: {
          'text-field':  ['get', 'parcel_id'],
          'text-size':   11,
          'text-anchor': 'center',
          visibility: layers.parcels ? 'visible' : 'none',
        },
        paint: {
          'text-color':       '#ffffff',
          'text-halo-color':  '#1e3a5f',
          'text-halo-width':  1.5,
        },
      })

      // Click handler for parcel selection
      map.on('click', 'parcels-fill-3d', (e) => {
        const feat = e.features?.[0]
        if (!feat) return
        const parcelId = feat.properties?.id as string
        const parcel = parcels.find(p => p.id === parcelId)
        if (parcel) {
          onParcelSelect(parcel)
          setSelectedInfo(parcel)
        }
      })
      map.on('mouseenter', 'parcels-fill-3d', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'parcels-fill-3d', () => { map.getCanvas().style.cursor = '' })
    }

    // ── Encroachment polygons ───────────────────────────────────────────
    const detGeoJSON = buildDetectionGeoJSON(detections)
    if (map.getSource('detections')) {
      (map.getSource('detections') as maplibregl.GeoJSONSource).setData(detGeoJSON as GeoJSON.GeoJSON)
    } else {
      map.addSource('detections', { type: 'geojson', data: detGeoJSON as GeoJSON.GeoJSON })

      map.addLayer({
        id:   'detections-fill',
        type: 'fill',
        source: 'detections',
        paint: {
          'fill-color':   ['get', 'color'],
          'fill-opacity': 0.3,
        },
        layout: { visibility: layers.detections ? 'visible' : 'none' },
      })

      map.addLayer({
        id:   'detections-outline',
        type: 'line',
        source: 'detections',
        paint: {
          'line-color':      ['get', 'color'],
          'line-width':      2,
          'line-dasharray':  [5, 4],
        },
        layout: { visibility: layers.detections ? 'visible' : 'none' },
      })

      // Tooltip on hover
      map.on('mouseenter', 'detections-fill', (e) => {
        const feat = e.features?.[0]
        if (!feat) return
        map.getCanvas().style.cursor = 'pointer'
        const p = feat.properties || {}
        if (popupRef.current) popupRef.current.remove()
        popupRef.current = new maplibregl.Popup({ closeButton: false, offset: [0, -10] })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="font-family:Inter,sans-serif;font-size:12px;min-width:160px">
              <b style="color:${p.color}">⚠ Suspected Encroachment</b><br/>
              Status: ${p.review_status}<br/>
              Severity: ${p.severity}<br/>
              Confidence: ${p.confidence != null ? (Number(p.confidence) * 100).toFixed(0) + '%' : '—'}<br/>
              Area diff: ${p.area_diff_pct != null ? Number(p.area_diff_pct).toFixed(1) + '%' : '—'}<br/>
              <span style="color:#94a3b8;font-size:11px">PRELIMINARY — Not a legal finding</span>
            </div>
          `)
          .addTo(map)
      })
      map.on('mouseleave', 'detections-fill', () => {
        map.getCanvas().style.cursor = ''
        popupRef.current?.remove()
        popupRef.current = null
      })
    }

  }, [mapReady, parcels, detections, selectedParcel, onParcelSelect, layers.parcels, layers.detections, layers.buildings])

  // ── Fly to selected parcel when it changes ────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    if (!selectedParcel?.centroid_lat || !selectedParcel?.centroid_lng) return
    setSelectedInfo(selectedParcel)
    map.flyTo({
      center:   [selectedParcel.centroid_lng, selectedParcel.centroid_lat],
      zoom:     16,
      pitch:    60,
      bearing:  -20,
      duration: 1800,
      essential: true,
    })
  }, [selectedParcel, mapReady])

  // ── Layer toggle handlers ─────────────────────────────────────────────
  const toggleLayer = useCallback((key: keyof typeof layers) => {
    const map = mapRef.current
    if (!map || !mapReady) return

    setLayers(prev => {
      const next = { ...prev, [key]: !prev[key] }
      const vis = (next[key] ? 'visible' : 'none') as 'visible' | 'none'

      if (key === 'buildings') {
        if (map.getLayer('osm-3d-buildings')) map.setLayoutProperty('osm-3d-buildings', 'visibility', vis)
      }
      if (key === 'parcels') {
        ['parcels-fill-3d', 'parcels-outline', 'parcels-labels'].forEach(id => {
          if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis)
        })
      }
      if (key === 'detections') {
        ['detections-fill', 'detections-outline'].forEach(id => {
          if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis)
        })
      }
      if (key === 'labels') {
        // Rebuild the entire style to toggle the label tile layer
        map.setStyle(buildMapStyle(next.labels))
        // After style reload the GeoJSON layers are removed — mark as not ready
        // so they are re-added in the next effect cycle
        setMapReady(false)
        setTimeout(() => { map.once('style.load', () => setMapReady(true)) }, 100)
      }
      return next
    })
  }, [mapReady])

  // ── Camera controls ───────────────────────────────────────────────────
  const zoom = (delta: number) => {
    const map = mapRef.current
    if (!map) return
    map.easeTo({ zoom: map.getZoom() + delta, duration: 250 })
  }

  const tiltMap = (delta: number) => {
    const map = mapRef.current
    if (!map) return
    const newPitch = Math.max(0, Math.min(85, map.getPitch() + delta))
    map.easeTo({ pitch: newPitch, duration: 300 })
    setTilt(newPitch)
  }

  const rotate = (delta: number) => {
    const map = mapRef.current
    if (!map) return
    map.easeTo({ bearing: map.getBearing() + delta, duration: 300 })
  }

  const resetCamera = () => {
    const map = mapRef.current
    if (!map) return
    const center = initialCenter()
    map.flyTo({ center, zoom: initialZoom(), pitch: 45, bearing: -15, duration: 1500 })
    setTilt(45)
  }

  const toggleFullscreen = () => setExpanded(e => !e)

  // ── Render ────────────────────────────────────────────────────────────
  const mapHeight = expanded ? '100vh' : 'calc(100vh - 190px)'

  return (
    <div
      style={{ height: mapHeight, position: expanded ? 'fixed' : 'relative', inset: expanded ? 0 : undefined, zIndex: expanded ? 9999 : 1 }}
      className="w-full rounded-xl overflow-hidden border border-slate-200/80 bg-slate-900"
    >
      {/* Map canvas */}
      <div ref={mapContainer} className="absolute inset-0" />

      {/* ── Top-left: 2D/3D switch ─────────────────────────────────── */}
      <div className="absolute top-3 left-3 z-10 flex gap-2">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 bg-white/95 backdrop-blur text-slate-700 text-xs font-semibold
                     px-3 py-2 rounded-lg border border-slate-300 shadow-lg hover:bg-blue-50 transition-all"
          title="Switch to 2D map"
        >
          <Map size={13} /> 2D Map
        </button>
        <div className="flex items-center gap-1.5 bg-indigo-600 text-white text-xs font-semibold
                        px-3 py-2 rounded-lg shadow-lg">
          <Building2 size={13} /> 3D View
        </div>
      </div>

      {/* ── Top-right: layer toggles ───────────────────────────────── */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5">
        <button onClick={toggleFullscreen} className="map-ctrl-btn" title={expanded ? 'Exit fullscreen' : 'Fullscreen'}>
          {expanded ? <Minimize2 size={14}/> : <Maximize2 size={14}/>}
        </button>

        {/* Layer panel */}
        <div className="bg-white/95 backdrop-blur rounded-xl border border-slate-200 shadow-xl p-3 flex flex-col gap-1.5">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Layers</div>
          {(
            [
              { key: 'buildings',  icon: <Building2 size={12}/>,   label: '3D Buildings' },
              { key: 'parcels',    icon: <Map size={12}/>,          label: 'Land Parcels' },
              { key: 'detections', icon: <AlertTriangle size={12}/>, label: 'Encroachments' },
              { key: 'labels',     icon: <Info size={12}/>,          label: 'Labels' },
            ] as { key: keyof typeof layers; icon: React.ReactNode; label: string }[]
          ).map(({ key, icon, label }) => (
            <button
              key={key}
              onClick={() => toggleLayer(key)}
              className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg transition-all
                ${layers[key]
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                  : 'text-slate-400 hover:bg-slate-50 border border-transparent'}`}
            >
              {layers[key] ? <Eye size={11}/> : <EyeOff size={11}/>}
              {icon}
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Right-centre: camera controls ─────────────────────────── */}
      <div className="absolute top-1/2 right-3 -translate-y-1/2 z-10 flex flex-col gap-1.5">
        <button onClick={() => zoom(1)}      className="map-ctrl-btn" title="Zoom in">   <ZoomIn  size={14}/> </button>
        <button onClick={() => zoom(-1)}     className="map-ctrl-btn" title="Zoom out">  <ZoomOut size={14}/> </button>
        <button onClick={() => tiltMap(10)}  className="map-ctrl-btn" title="Tilt up">   <ChevronUp size={14}/> </button>
        <button onClick={() => tiltMap(-10)} className="map-ctrl-btn" title="Tilt down"> <ChevronDown size={14}/> </button>
        <button onClick={() => rotate(-15)}  className="map-ctrl-btn" title="Rotate left">  <RotateCcw size={14}/> </button>
        <button onClick={() => rotate(15)}   className="map-ctrl-btn" title="Rotate right">
          <RotateCcw size={14} className="scale-x-[-1]"/>
        </button>
        <button onClick={resetCamera}        className="map-ctrl-btn" title="Reset camera"> <Compass size={14}/> </button>
      </div>

      {/* ── Bottom-left: legend ───────────────────────────────────── */}
      {showLegend ? (
        <div className="absolute bottom-8 left-3 z-10 bg-white/95 backdrop-blur rounded-xl
                        border border-slate-200 shadow-xl p-3 min-w-[150px]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Legend</span>
            <button onClick={() => setShowLegend(false)} className="text-slate-400 hover:text-slate-600">
              <X size={11}/>
            </button>
          </div>
          <div className="space-y-1.5">
            {Object.entries(LAND_USE_COLORS).slice(0, 7).map(([use, color]) => (
              <div key={use} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: color }}/>
                <span className="text-[11px] text-slate-500">{use}</span>
              </div>
            ))}
            <div className="border-t border-slate-200 pt-1.5 mt-1 space-y-1">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Encroachment</div>
              {Object.entries(DETECTION_STATUS_COLORS).slice(0,4).map(([status, color]) => (
                <div key={status} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm border-2 border-dashed flex-shrink-0" style={{ borderColor: color }}/>
                  <span className="text-[10px] text-slate-500 leading-tight">{status.replace('Verified by Authorized ', '')}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-200 pt-1.5 mt-1">
              <div className="text-[10px] text-amber-600 font-semibold">
                ⚠ Building heights: OSM data where available; estimated 10 m otherwise. Not legal evidence.
              </div>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowLegend(true)}
          className="absolute bottom-8 left-3 z-10 bg-white/95 backdrop-blur px-3 py-1.5
                     rounded-xl border border-slate-200 shadow text-xs text-slate-500
                     flex items-center gap-1.5 hover:text-slate-800"
        >
          <Layers size={12}/> Legend
        </button>
      )}

      {/* ── Selected parcel info panel ─────────────────────────────── */}
      {selectedInfo && (
        <div className="absolute bottom-8 right-16 z-10 bg-white/95 backdrop-blur rounded-xl
                        border border-slate-200 shadow-xl p-4 w-64">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-800">Parcel Details</h3>
            <button onClick={() => setSelectedInfo(null)} className="text-slate-400 hover:text-slate-700">
              <X size={14}/>
            </button>
          </div>
          <div className="space-y-1.5 text-xs">
            <div>
              <span className="text-slate-400">Parcel ID</span>
              <div className="font-mono text-blue-600 font-semibold">{selectedInfo.parcel_id}</div>
            </div>
            {selectedInfo.is_flagged && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-2 py-1 text-red-700 text-xs flex items-center gap-1">
                <AlertTriangle size={11}/> Encroachment Flagged
              </div>
            )}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {[
                ['Land Use',  selectedInfo.registered_land_use || '—'],
                ['Area',      selectedInfo.registered_area_sqm ? `${selectedInfo.registered_area_sqm.toFixed(0)} m²` : '—'],
                ['District',  selectedInfo.district || '—'],
                ['State',     selectedInfo.state || '—'],
                ['Owner',     selectedInfo.owner?.owner_name || '—'],
                ['Detections', String(selectedInfo.detection_count)],
              ].map(([label, val]) => (
                <div key={label}>
                  <div className="text-slate-400">{label}</div>
                  <div className="text-slate-700 font-medium truncate" title={String(val)}>{val}</div>
                </div>
              ))}
            </div>
            {selectedInfo.centroid_lat && selectedInfo.centroid_lng && (
              <div>
                <span className="text-slate-400">Coordinates</span>
                <div className="font-mono text-slate-500">
                  {selectedInfo.centroid_lat.toFixed(6)}, {selectedInfo.centroid_lng.toFixed(6)}
                </div>
              </div>
            )}
            {selectedInfo.is_simulated && (
              <div className="text-slate-400 italic">Simulated data — demonstration only.</div>
            )}
          </div>
        </div>
      )}

      {/* ── Loading overlay ────────────────────────────────────────── */}
      {!mapReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 z-20">
          <div className="text-white text-sm flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
            Loading 3D map…
          </div>
        </div>
      )}

      {/* ── Tilt indicator ─────────────────────────────────────────── */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 bg-white/80 backdrop-blur
                      text-xs text-slate-500 px-2 py-0.5 rounded-full border border-slate-200 shadow">
        Pitch {Math.round(tilt)}° · Drag to pan · Ctrl+drag to rotate/tilt
      </div>
    </div>
  )
}
