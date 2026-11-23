/**
 * Map3DView – Apple Maps-inspired Advanced 3D GIS for India
 *
 * Features:
 *  - India-focused 3D globe with satellite imagery (ESRI free tiles, no key)
 *  - OSM 3D buildings via OpenFreeMap vector tiles (fill-extrusion, real OSM heights)
 *  - Multiple basemap styles: Satellite, Street, Terrain, Dark
 *  - Land parcel boundaries as GeoJSON overlays with 3D extrusion
 *  - Encroachment detection overlays colour-coded by review status
 *  - 4-status detection pipeline: AI-detected / Citizen-reported / Field-verified / Official
 *  - India location search (state, district, village, parcel, survey number)
 *  - Camera controls: zoom, tilt, rotate, reset, compass
 *  - Smooth fly-to animation when selecting parcels
 *  - Layer toggles: Buildings, Parcels, Encroachments, Roads, Labels
 *  - Parcel detail panel with full GIS metadata
 *  - Encroachment analysis panel: registered vs observed area, overlap
 *  - Data-source provenance panel
 *  - Responsive layout – laptop, tablet, mobile
 *  - Fullscreen mode
 *
 * Attribution:
 *  - Satellite tiles: © Esri, Maxar, Earthstar Geographics (free, no key)
 *  - Street tiles:    © OpenStreetMap contributors (free, no key)
 *  - Building data:   © OpenStreetMap contributors via OpenFreeMap
 *  - Labels:          © Esri – Esri, DeLorme, NAVTEQ
 *
 * DISCLAIMER:
 *  Building heights shown from OSM data where available; estimated 10 m otherwise.
 *  All encroachment detections are PRELIMINARY – not legal findings.
 *  Never claim AI output as official government determination.
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  RotateCcw, Maximize2, Minimize2, Layers, Building2,
  Map, AlertTriangle, X, Info, ChevronUp, ChevronDown,
  Compass, ZoomIn, ZoomOut, Eye, EyeOff, Search,
  MapPin, Navigation, Database, Shield, FileText,
  Camera, ChevronRight, Globe, Satellite, TreePine,
  RefreshCw, ExternalLink, CheckCircle2, Clock, User,
} from 'lucide-react'
import type { LandParcel, EncroachmentDetection } from '../../types'

// ── Colour palette ──────────────────────────────────────────────────────────

const LAND_USE_COLORS: Record<string, string> = {
  Residential:  '#3b82f6',
  Commercial:   '#8b5cf6',
  Agriculture:  '#22c55e',
  Road:         '#94a3b8',
  'Water Body': '#06b6d4',
  Forest:       '#16a34a',
  Industrial:   '#f97316',
  Other:        '#64748b',
  Unknown:      '#374151',
}

const DETECTION_STATUS_COLORS: Record<string, string> = {
  'Pending Review':                  '#eab308',   // AI-detected – unverified
  'Under Investigation':             '#f97316',   // citizen-reported or under review
  'Field Survey Assigned':           '#3b82f6',   // field team dispatched
  'Verified by Authorized Surveyor': '#ef4444',   // human-confirmed encroachment
  'False Positive':                  '#6b7280',   // cleared
  'Resolved':                        '#22c55e',   // resolved
}

// Detection source labels (4-status pipeline)
const DETECTION_PIPELINE: Array<{key: string; label: string; icon: string; color: string}> = [
  { key: 'ai',       label: 'AI-Detected Candidate',   icon: '🤖', color: '#eab308' },
  { key: 'citizen',  label: 'Citizen-Reported',         icon: '👤', color: '#f97316' },
  { key: 'field',    label: 'Field-Verified Finding',   icon: '🔍', color: '#ef4444' },
  { key: 'official', label: 'Official Determination',   icon: '🏛️', color: '#7c3aed' },
]

// ── India geography ──────────────────────────────────────────────────────────

const INDIA_CENTER: [number, number] = [78.9629, 20.5937]
const INDIA_ZOOM   = 4.8
const INDIA_MIN_ZOOM = 4.0
const INDIA_MAX_ZOOM = 20

// Quick-search India landmark locations
const INDIA_QUICK_LOCATIONS: Array<{name: string; coords: [number, number]; zoom: number}> = [
  { name: 'All India',       coords: [78.9629, 20.5937],  zoom: 4.8  },
  { name: 'Hyderabad',       coords: [78.4867, 17.3850],  zoom: 12   },
  { name: 'Bengaluru',       coords: [77.5946, 12.9716],  zoom: 12   },
  { name: 'Mumbai',          coords: [72.8777, 19.0760],  zoom: 12   },
  { name: 'Delhi',           coords: [77.1025, 28.7041],  zoom: 12   },
  { name: 'Chennai',         coords: [80.2707, 13.0827],  zoom: 12   },
  { name: 'Kolkata',         coords: [88.3639, 22.5726],  zoom: 12   },
  { name: 'Pune',            coords: [73.8567, 18.5204],  zoom: 12   },
  { name: 'Ahmedabad',       coords: [72.5714, 23.0225],  zoom: 12   },
  { name: 'Visakhapatnam',   coords: [83.3185, 17.6868],  zoom: 12   },
  { name: 'Amaravati',       coords: [80.4538, 16.5062],  zoom: 12   },
  { name: 'Vijayawada',      coords: [80.6480, 16.5062],  zoom: 12   },
]

// ── Basemap styles ───────────────────────────────────────────────────────────

type BasemapStyle = 'satellite' | 'street' | 'dark' | 'terrain'

function buildMapStyle(style: BasemapStyle, showLabels: boolean): maplibregl.StyleSpecification {
  const sources: Record<string, maplibregl.SourceSpecification> = {
    'esri-satellite': {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: '© Esri, Maxar, Earthstar Geographics, CNES/Airbus DS, USDA, USGS',
      maxzoom: 19,
    },
    'esri-street': {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: '© Esri, HERE, Garmin, © OpenStreetMap contributors',
      maxzoom: 19,
    },
    'carto-dark': {
      type: 'raster',
      tiles: ['https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors, © CARTO',
      maxzoom: 19,
    },
    'esri-topo': {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: '© Esri, HERE, Garmin, © OpenStreetMap contributors, USGS',
      maxzoom: 19,
    },
    'esri-labels': {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: '© Esri',
      maxzoom: 19,
    },
    // OSM vector tiles for real 3D building data
    'osm-buildings': {
      type: 'vector',
      tiles: ['https://tiles.openfreemap.org/planet/{z}/{x}/{y}'],
      attribution: '© OpenStreetMap contributors',
      maxzoom: 14,
    },
  }

  // Pick base raster source
  const baseSourceId = style === 'satellite' ? 'esri-satellite'
                     : style === 'street'    ? 'esri-street'
                     : style === 'dark'      ? 'carto-dark'
                     :                         'esri-topo'

  const layers: maplibregl.LayerSpecification[] = [
    { id: 'base-layer', type: 'raster', source: baseSourceId, minzoom: 0, maxzoom: 22 },
  ]

  if (showLabels && style !== 'street' && style !== 'dark' && style !== 'terrain') {
    layers.push({
      id: 'esri-labels-layer', type: 'raster', source: 'esri-labels',
      minzoom: 0, maxzoom: 22,
      paint: { 'raster-opacity': 0.95 },
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

// ── GeoJSON helpers ──────────────────────────────────────────────────────────

function buildParcelGeoJSON(parcels: LandParcel[], selectedId?: string) {
  return {
    type: 'FeatureCollection' as const,
    features: parcels
      .filter(p => p.boundary_geojson)
      .map(p => ({
        type: 'Feature' as const,
        geometry: p.boundary_geojson as unknown as GeoJSON.Geometry,
        properties: {
          parcel_id:     p.parcel_id,
          id:            p.id,
          land_use:      p.registered_land_use || 'Unknown',
          is_flagged:    p.is_flagged,
          area_sqm:      p.registered_area_sqm,
          obs_area_sqm:  p.registered_area_sqm,  // placeholder until observed comes through
          district:      p.district || '',
          state:         p.state || '',
          owner:         p.owner?.owner_name || '',
          detection_count: p.detection_count,
          selected:      p.id === selectedId,
          color:         p.is_flagged
            ? '#ef4444'
            : (LAND_USE_COLORS[p.registered_land_use || 'Unknown'] || '#3b82f6'),
          is_simulated:  p.is_simulated,
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
          id:            d.id,
          parcel_id:     d.parcel_id,
          review_status: d.review_status,
          severity:      d.severity,
          confidence:    d.model_confidence,
          area_diff_pct: d.area_difference_pct,
          overlap_sqm:   d.overlap_area_sqm,
          reg_area:      d.registered_area_sqm,
          obs_area:      d.observed_area_sqm,
          color:         DETECTION_STATUS_COLORS[d.review_status] || '#eab308',
        },
      })),
  }
}

// ── Props ────────────────────────────────────────────────────────────────────

interface Map3DViewProps {
  parcels:        LandParcel[]
  detections:     EncroachmentDetection[]
  selectedParcel: LandParcel | null
  onParcelSelect: (p: LandParcel) => void
  onClose:        () => void
}

// ── Layer state ──────────────────────────────────────────────────────────────

interface LayerState {
  buildings:   boolean
  parcels:     boolean
  detections:  boolean
  labels:      boolean
  roads:       boolean
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Map3DView({
  parcels, detections, selectedParcel, onParcelSelect, onClose,
}: Map3DViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<maplibregl.Map | null>(null)
  const popupRef     = useRef<maplibregl.Popup | null>(null)
  const markerRef    = useRef<maplibregl.Marker | null>(null)

  // Map state
  const [mapReady,     setMapReady]     = useState(false)
  const [tilt,         setTilt]         = useState(45)
  const [bearing,      setBearing]      = useState(0)
  const [zoom,         setZoom]         = useState(INDIA_ZOOM)
  const [basemap,      setBasemap]      = useState<BasemapStyle>('satellite')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [layers, setLayers] = useState<LayerState>({
    buildings: true, parcels: true, detections: true, labels: true, roads: false,
  })

  // UI panels
  const [showLayerPanel,  setShowLayerPanel]  = useState(false)
  const [showSearchPanel, setShowSearchPanel] = useState(false)
  const [showLegend,      setShowLegend]      = useState(true)
  const [showDataPanel,   setShowDataPanel]   = useState(false)
  const [selectedInfo,    setSelectedInfo]    = useState<LandParcel | null>(null)
  const [selectedDetection, setSelectedDetection] = useState<EncroachmentDetection | null>(null)

  // Search
  const [searchQuery,   setSearchQuery]   = useState('')
  const [searchResults, setSearchResults] = useState<Array<{name: string; coords: [number, number]; zoom: number}>>([])
  const [isSearching,   setIsSearching]   = useState(false)

  // ── Initialise MapLibre ──────────────────────────────────────────────────

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return

    const map = new maplibregl.Map({
      container:  mapContainer.current,
      style:      buildMapStyle('satellite', true),
      center:     INDIA_CENTER,
      zoom:       INDIA_ZOOM,
      pitch:      45,
      bearing:    0,
      minZoom:    INDIA_MIN_ZOOM,
      maxZoom:    INDIA_MAX_ZOOM,
      antialias:  true,
    })

    mapRef.current = map

    // Track camera state for UI indicators
    map.on('pitch',   () => setTilt(Math.round(map.getPitch())))
    map.on('bearing', () => setBearing(Math.round(map.getBearing())))
    map.on('zoom',    () => setZoom(Math.round(map.getZoom() * 10) / 10))

    map.on('style.load', () => {
      addAllLayers(map)
      setMapReady(true)
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Add all GIS layers ───────────────────────────────────────────────────

  const addAllLayers = useCallback((map: maplibregl.Map) => {
    // ── 3D Buildings (OSM via OpenFreeMap vector tiles) ───────────────────
    if (!map.getSource('osm-buildings')) {
      map.addSource('osm-buildings', {
        type:        'vector',
        tiles:       ['https://tiles.openfreemap.org/planet/{z}/{x}/{y}'],
        attribution: '© OpenStreetMap contributors',
        maxzoom:     14,
      })
    }

    if (!map.getLayer('3d-buildings')) {
      map.addLayer({
        id:          '3d-buildings',
        type:        'fill-extrusion',
        source:      'osm-buildings',
        'source-layer': 'building',
        minzoom:     13,
        filter:      ['==', ['get', 'extrude'], 'true'],
        paint: {
          'fill-extrusion-color': [
            'interpolate', ['linear'], ['get', 'render_height'],
            0,   '#1e3a5f',
            10,  '#1d4ed8',
            20,  '#2563eb',
            50,  '#3b82f6',
            100, '#60a5fa',
          ],
          'fill-extrusion-height': [
            'coalesce',
            ['get', 'height'],
            ['*', ['coalesce', ['get', 'building:levels'], 3], 3.5],
            10,
          ],
          'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
          'fill-extrusion-opacity': 0.82,
        },
        layout: { visibility: layers.buildings ? 'visible' : 'none' },
      })
    }

    // ── Parcels GeoJSON ───────────────────────────────────────────────────
    const parcelGeo = buildParcelGeoJSON(parcels, selectedParcel?.id)
    if (!map.getSource('parcels')) {
      map.addSource('parcels', { type: 'geojson', data: parcelGeo as GeoJSON.GeoJSON })
    }

    if (!map.getLayer('parcels-fill-3d')) {
      map.addLayer({
        id:     'parcels-fill-3d',
        type:   'fill-extrusion',
        source: 'parcels',
        paint: {
          'fill-extrusion-color': [
            'case',
            ['get', 'selected'], '#f59e0b',
            ['get', 'is_flagged'], '#ef4444',
            ['get', 'color'],
          ],
          'fill-extrusion-height': ['case', ['get', 'selected'], 4, 2],
          'fill-extrusion-base':   0,
          'fill-extrusion-opacity': ['case', ['get', 'selected'], 0.75, 0.3],
        },
        layout: { visibility: layers.parcels ? 'visible' : 'none' },
      })
    }

    if (!map.getLayer('parcels-outline')) {
      map.addLayer({
        id:     'parcels-outline',
        type:   'line',
        source: 'parcels',
        paint: {
          'line-color': [
            'case',
            ['get', 'selected'], '#f59e0b',
            ['get', 'is_flagged'], '#ef4444',
            ['get', 'color'],
          ],
          'line-width':     ['case', ['get', 'selected'], 3.5, ['get', 'is_flagged'], 2.5, 1.5],
          'line-dasharray': ['case', ['get', 'is_flagged'], ['literal', [6, 4]], ['literal', [1, 0]]],
        },
        layout: { visibility: layers.parcels ? 'visible' : 'none' },
      })
    }

    if (!map.getLayer('parcels-labels')) {
      map.addLayer({
        id:      'parcels-labels',
        type:    'symbol',
        source:  'parcels',
        minzoom: 14,
        layout: {
          'text-field':  ['get', 'parcel_id'],
          'text-size':   11,
          'text-anchor': 'center',
          visibility:    layers.parcels ? 'visible' : 'none',
        },
        paint: {
          'text-color':      '#ffffff',
          'text-halo-color': '#1e3a5f',
          'text-halo-width': 1.5,
        },
      })
    }

    // Parcel click / hover
    map.on('click', 'parcels-fill-3d', (e) => {
      const feat = e.features?.[0]
      if (!feat) return
      const parcelId = feat.properties?.id as string
      const parcel   = parcels.find(p => p.id === parcelId)
      if (parcel) {
        onParcelSelect(parcel)
        setSelectedInfo(parcel)
        setSelectedDetection(null)
        // fly to parcel centroid
        if (parcel.centroid_lat && parcel.centroid_lng) {
          map.flyTo({
            center:  [parcel.centroid_lng, parcel.centroid_lat],
            zoom:    Math.max(map.getZoom(), 16),
            pitch:   60,
            bearing: map.getBearing(),
            duration: 1200,
          })
        }
      }
    })
    map.on('mouseenter', 'parcels-fill-3d', () => { map.getCanvas().style.cursor = 'pointer' })
    map.on('mouseleave', 'parcels-fill-3d', () => { map.getCanvas().style.cursor = '' })

    // ── Encroachment detections ──────────────────────────────────────────
    const detGeo = buildDetectionGeoJSON(detections)
    if (!map.getSource('detections')) {
      map.addSource('detections', { type: 'geojson', data: detGeo as GeoJSON.GeoJSON })
    }

    if (!map.getLayer('detections-fill')) {
      map.addLayer({
        id:     'detections-fill',
        type:   'fill',
        source: 'detections',
        paint: {
          'fill-color':   ['get', 'color'],
          'fill-opacity': 0.28,
        },
        layout: { visibility: layers.detections ? 'visible' : 'none' },
      })
    }

    if (!map.getLayer('detections-outline')) {
      map.addLayer({
        id:     'detections-outline',
        type:   'line',
        source: 'detections',
        paint: {
          'line-color':     ['get', 'color'],
          'line-width':     2.5,
          'line-dasharray': [5, 4],
        },
        layout: { visibility: layers.detections ? 'visible' : 'none' },
      })
    }

    // Detection hover tooltip
    map.on('mouseenter', 'detections-fill', (e) => {
      const feat = e.features?.[0]
      if (!feat) return
      map.getCanvas().style.cursor = 'pointer'
      const p = feat.properties || {}
      if (popupRef.current) popupRef.current.remove()
      popupRef.current = new maplibregl.Popup({ closeButton: false, offset: [0, -8], maxWidth: '280px' })
        .setLngLat(e.lngLat)
        .setHTML(`
          <div style="font-family:Inter,system-ui,sans-serif;font-size:12px;min-width:200px;line-height:1.5">
            <div style="font-weight:700;color:${p.color};margin-bottom:4px">⚠ Suspected Encroachment</div>
            <div><span style="color:#94a3b8">Status:</span> ${p.review_status}</div>
            <div><span style="color:#94a3b8">Severity:</span> ${p.severity}</div>
            <div><span style="color:#94a3b8">Confidence:</span> ${p.confidence != null ? (Number(p.confidence)*100).toFixed(0)+'%' : '—'}</div>
            ${p.reg_area ? `<div><span style="color:#94a3b8">Reg. Area:</span> ${Number(p.reg_area).toFixed(0)} m²</div>` : ''}
            ${p.overlap_sqm ? `<div><span style="color:#ef4444">Overlap:</span> ${Number(p.overlap_sqm).toFixed(1)} m²</div>` : ''}
            ${p.area_diff_pct ? `<div><span style="color:#ef4444">Area Diff:</span> ${Number(p.area_diff_pct).toFixed(1)}%</div>` : ''}
            <div style="color:#64748b;font-size:10px;margin-top:6px;border-top:1px solid #334155;padding-top:4px">
              ⚠ PRELIMINARY — Not a legal finding. Requires field verification.
            </div>
          </div>`)
        .addTo(map)
    })
    map.on('mouseleave', 'detections-fill', () => {
      map.getCanvas().style.cursor = ''
      if (popupRef.current) { popupRef.current.remove(); popupRef.current = null }
    })

    // Detection click → show analysis panel
    map.on('click', 'detections-fill', (e) => {
      const feat = e.features?.[0]
      if (!feat) return
      const detId = feat.properties?.id as string
      const det   = detections.find(d => d.id === detId)
      if (det) {
        setSelectedDetection(det)
        // also select linked parcel
        const parcel = parcels.find(p => p.id === det.parcel_id)
        if (parcel) { onParcelSelect(parcel); setSelectedInfo(parcel) }
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parcels, detections, selectedParcel])

  // ── Update parcel data when selection changes ────────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const src = map.getSource('parcels') as maplibregl.GeoJSONSource | undefined
    if (src) {
      src.setData(buildParcelGeoJSON(parcels, selectedParcel?.id) as GeoJSON.GeoJSON)
    }
  }, [selectedParcel, parcels, mapReady])

  // ── Update detections data ───────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const src = map.getSource('detections') as maplibregl.GeoJSONSource | undefined
    if (src) {
      src.setData(buildDetectionGeoJSON(detections) as GeoJSON.GeoJSON)
    }
  }, [detections, mapReady])

  // ── Fly to selectedParcel when prop changes from outside ─────────────────

  useEffect(() => {
    if (!selectedParcel || !mapRef.current || !mapReady) return
    if (selectedParcel.centroid_lat && selectedParcel.centroid_lng) {
      mapRef.current.flyTo({
        center:   [selectedParcel.centroid_lng, selectedParcel.centroid_lat],
        zoom:     Math.max(mapRef.current.getZoom(), 16),
        pitch:    60,
        duration: 1200,
      })
    }
    setSelectedInfo(selectedParcel)
  }, [selectedParcel, mapReady])

  // ── Basemap switcher ─────────────────────────────────────────────────────

  const switchBasemap = useCallback((style: BasemapStyle) => {
    const map = mapRef.current
    if (!map) return
    setBasemap(style)
    setMapReady(false)
    map.setStyle(buildMapStyle(style, layers.labels))
    map.once('style.load', () => {
      addAllLayers(map)
      setMapReady(true)
    })
  }, [layers.labels, addAllLayers])

  // ── Layer toggle ─────────────────────────────────────────────────────────

  const toggleLayer = useCallback((key: keyof LayerState) => {
    const map = mapRef.current
    if (!map || !mapReady) return

    setLayers(prev => {
      const next = { ...prev, [key]: !prev[key] }
      const vis  = (on: boolean) => on ? 'visible' : 'none'

      if (key === 'buildings') {
        if (map.getLayer('3d-buildings')) map.setLayoutProperty('3d-buildings', 'visibility', vis(next.buildings))
      }
      if (key === 'parcels') {
        ['parcels-fill-3d', 'parcels-outline', 'parcels-labels'].forEach(id => {
          if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis(next.parcels))
        })
      }
      if (key === 'detections') {
        ['detections-fill', 'detections-outline'].forEach(id => {
          if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis(next.detections))
        })
      }
      if (key === 'labels') {
        // Requires style rebuild (raster layer toggle)
        setMapReady(false)
        setTimeout(() => {
          map.setStyle(buildMapStyle(basemap, next.labels))
          map.once('style.load', () => { addAllLayers(map); setMapReady(true) })
        }, 50)
      }
      return next
    })
  }, [mapReady, basemap, addAllLayers])

  // ── Camera controls ──────────────────────────────────────────────────────

  const adjustZoom  = useCallback((d: number) => {
    mapRef.current?.easeTo({ zoom: (mapRef.current.getZoom() ?? 10) + d, duration: 250 })
  }, [])

  const adjustTilt  = useCallback((d: number) => {
    const map = mapRef.current
    if (!map) return
    map.easeTo({ pitch: Math.min(85, Math.max(0, map.getPitch() + d)), duration: 250 })
  }, [])

  const adjustBearing = useCallback((d: number) => {
    mapRef.current?.easeTo({ bearing: (mapRef.current.getBearing() ?? 0) + d, duration: 250 })
  }, [])

  const resetCamera = useCallback(() => {
    mapRef.current?.flyTo({
      center:   INDIA_CENTER,
      zoom:     INDIA_ZOOM,
      pitch:    45,
      bearing:  0,
      duration: 1500,
    })
  }, [])

  const toggleFullscreen = useCallback(() => {
    const el = mapContainer.current?.parentElement
    if (!el) return
    if (!document.fullscreenElement) {
      el.requestFullscreen?.()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen?.()
      setIsFullscreen(false)
    }
  }, [])

  // ── Nominatim search (OSM geocoding, free) ───────────────────────────────

  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return }
    // First check quick locations
    const quick = INDIA_QUICK_LOCATIONS.filter(l =>
      l.name.toLowerCase().includes(q.toLowerCase())
    )
    // Also check parcels
    const matchedParcels = parcels
      .filter(p =>
        p.parcel_id.toLowerCase().includes(q.toLowerCase()) ||
        (p.district  || '').toLowerCase().includes(q.toLowerCase()) ||
        (p.state     || '').toLowerCase().includes(q.toLowerCase()) ||
        (p.address   || '').toLowerCase().includes(q.toLowerCase()) ||
        (p.owner?.owner_name || '').toLowerCase().includes(q.toLowerCase())
      )
      .slice(0, 5)
      .map(p => ({
        name:   `📍 ${p.parcel_id}${p.district ? ` — ${p.district}` : ''}`,
        coords: [p.centroid_lng || 78.9, p.centroid_lat || 20.5] as [number, number],
        zoom:   16,
        parcel: p,
      }))

    const combined = [
      ...quick.map(l => ({ ...l, parcel: undefined })),
      ...matchedParcels,
    ]
    setSearchResults(combined)

    // If not found locally, try Nominatim
    if (combined.length === 0 && q.length > 3) {
      setIsSearching(true)
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q+', India')}&format=json&limit=5&countrycodes=in`
        const res = await fetch(url, { headers: { 'Accept-Language': 'en' } })
        const data = await res.json()
        const remote = (data as Array<{display_name: string; lon: string; lat: string}>).map(r => ({
          name:   r.display_name.split(',').slice(0, 3).join(', '),
          coords: [parseFloat(r.lon), parseFloat(r.lat)] as [number, number],
          zoom:   14,
          parcel: undefined,
        }))
        setSearchResults(remote)
      } catch { /* ignore */ }
      setIsSearching(false)
    }
  }, [parcels])

  const flyToResult = useCallback((result: {name: string; coords: [number, number]; zoom: number; parcel?: LandParcel}) => {
    setShowSearchPanel(false)
    setSearchQuery('')
    setSearchResults([])
    mapRef.current?.flyTo({ center: result.coords, zoom: result.zoom, pitch: 55, duration: 1400 })

    // Drop a marker
    if (markerRef.current) markerRef.current.remove()
    markerRef.current = new maplibregl.Marker({ color: '#ef4444' })
      .setLngLat(result.coords)
      .addTo(mapRef.current!)

    if (result.parcel) {
      onParcelSelect(result.parcel)
      setSelectedInfo(result.parcel)
    }
  }, [onParcelSelect])

  // ── Flagged parcels count ────────────────────────────────────────────────

  const flaggedCount  = useMemo(() => parcels.filter(p => p.is_flagged).length, [parcels])
  const pendingCount  = useMemo(() => detections.filter(d => d.review_status === 'Pending Review').length, [detections])

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="relative w-full h-full bg-slate-900 overflow-hidden select-none">

      {/* ── Map container ─────────────────────────────────────────────────── */}
      <div ref={mapContainer} className="absolute inset-0" />

      {/* ── Top toolbar ───────────────────────────────────────────────────── */}
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center gap-2 pointer-events-none">

        {/* Back to 2D button */}
        <button
          onClick={onClose}
          className="pointer-events-auto flex items-center gap-1.5 bg-white/95 backdrop-blur
                     text-slate-700 text-xs font-semibold px-3 py-2 rounded-xl shadow-lg
                     border border-slate-200 hover:bg-white transition-all"
        >
          <Map size={13} /> 2D Map
        </button>

        {/* Search bar */}
        <div className="pointer-events-auto flex-1 max-w-sm relative">
          <div className="flex items-center bg-white/95 backdrop-blur rounded-xl shadow-lg border border-slate-200 px-3 py-2 gap-2">
            <Search size={13} className="text-slate-400 shrink-0" />
            <input
              className="flex-1 text-xs bg-transparent outline-none text-slate-800 placeholder-slate-400"
              placeholder="Search state, district, parcel ID, survey number…"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); handleSearch(e.target.value) }}
              onFocus={() => setShowSearchPanel(true)}
            />
            {isSearching && <div className="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin" />}
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); setSearchResults([]) }} className="text-slate-400 hover:text-slate-600">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Search results dropdown */}
          {showSearchPanel && searchResults.length > 0 && (
            <div className="absolute top-full mt-1 left-0 right-0 bg-white/98 backdrop-blur
                            rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50">
              {searchResults.map((r, i) => (
                <button
                  key={i}
                  onClick={() => flyToResult(r)}
                  className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-blue-50
                             flex items-center gap-2 border-b border-slate-100 last:border-0 transition-colors"
                >
                  <MapPin size={11} className="text-slate-400 shrink-0" />
                  <span className="truncate">{r.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* Quick location pills */}
          {showSearchPanel && searchResults.length === 0 && searchQuery.length === 0 && (
            <div className="absolute top-full mt-1 left-0 right-0 bg-white/98 backdrop-blur
                            rounded-xl shadow-xl border border-slate-200 p-2 z-50">
              <div className="text-[10px] text-slate-400 uppercase font-semibold mb-1.5 px-1">Quick jump</div>
              <div className="flex flex-wrap gap-1.5">
                {INDIA_QUICK_LOCATIONS.map(loc => (
                  <button
                    key={loc.name}
                    onClick={() => flyToResult(loc)}
                    className="text-[11px] bg-slate-100 hover:bg-blue-100 text-slate-700
                               px-2 py-1 rounded-lg transition-colors"
                  >
                    {loc.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Basemap switcher */}
        <div className="pointer-events-auto flex items-center bg-white/95 backdrop-blur rounded-xl shadow-lg border border-slate-200 overflow-hidden">
          {([
            { key: 'satellite', icon: <Satellite size={12}/>, label: 'Sat'    },
            { key: 'street',    icon: <Map       size={12}/>, label: 'Street' },
            { key: 'terrain',   icon: <Globe     size={12}/>, label: 'Topo'   },
            { key: 'dark',      icon: <Globe     size={12}/>, label: 'Dark'   },
          ] as Array<{key: BasemapStyle; icon: React.ReactNode; label: string}>).map(b => (
            <button
              key={b.key}
              onClick={() => switchBasemap(b.key)}
              className={`flex items-center gap-1 px-2 py-2 text-[10px] font-medium transition-colors
                ${basemap === b.key ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {b.icon} {b.label}
            </button>
          ))}
        </div>

        {/* Stat badges */}
        <div className="pointer-events-auto flex gap-1.5">
          {flaggedCount > 0 && (
            <div className="flex items-center gap-1 bg-red-600/90 backdrop-blur text-white text-[10px]
                            font-semibold px-2 py-1.5 rounded-xl shadow-lg">
              <AlertTriangle size={10}/> {flaggedCount} Flagged
            </div>
          )}
          {pendingCount > 0 && (
            <div className="flex items-center gap-1 bg-amber-500/90 backdrop-blur text-white text-[10px]
                            font-semibold px-2 py-1.5 rounded-xl shadow-lg">
              <Clock size={10}/> {pendingCount} Pending
            </div>
          )}
        </div>

        {/* Fullscreen */}
        <button
          onClick={toggleFullscreen}
          className="pointer-events-auto map-ctrl-btn"
        >
          {isFullscreen ? <Minimize2 size={14}/> : <Maximize2 size={14}/>}
        </button>
      </div>

      {/* ── Right: Camera controls ────────────────────────────────────────── */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-1.5">
        {/* Compass / bearing reset */}
        <button
          onClick={() => mapRef.current?.easeTo({ bearing: 0, duration: 400 })}
          className="map-ctrl-btn"
          title="Reset bearing North"
        >
          <div
            className="relative w-5 h-5"
            style={{ transform: `rotate(${-bearing}deg)`, transition: 'transform 0.2s' }}
          >
            <Compass size={18} className="text-slate-700" />
          </div>
        </button>

        <div className="w-px h-3 bg-slate-200 mx-auto" />

        <button onClick={() => adjustZoom(1)}   className="map-ctrl-btn" title="Zoom in">
          <ZoomIn  size={15} />
        </button>
        <button onClick={() => adjustZoom(-1)}  className="map-ctrl-btn" title="Zoom out">
          <ZoomOut size={15} />
        </button>

        <div className="w-px h-3 bg-slate-200 mx-auto" />

        <button onClick={() => adjustTilt(10)}  className="map-ctrl-btn" title="Tilt up">
          <ChevronUp   size={15}/>
        </button>
        <button onClick={() => adjustTilt(-10)} className="map-ctrl-btn" title="Tilt down">
          <ChevronDown size={15}/>
        </button>

        <div className="w-px h-3 bg-slate-200 mx-auto" />

        <button onClick={() => adjustBearing(-15)} className="map-ctrl-btn" title="Rotate left">
          ↺
        </button>
        <button onClick={() => adjustBearing(15)}  className="map-ctrl-btn" title="Rotate right">
          ↻
        </button>

        <div className="w-px h-3 bg-slate-200 mx-auto" />

        <button onClick={resetCamera} className="map-ctrl-btn" title="Reset to India view">
          <RotateCcw size={14}/>
        </button>
      </div>

      {/* ── Left: Layer toggle + Data panel buttons ───────────────────────── */}
      <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-1.5">
        <button
          onClick={() => { setShowLayerPanel(p => !p); setShowDataPanel(false) }}
          className={`map-ctrl-btn ${showLayerPanel ? 'bg-blue-600 text-white border-blue-600' : ''}`}
          title="Layers"
        >
          <Layers size={15}/>
        </button>
        <button
          onClick={() => { setShowDataPanel(p => !p); setShowLayerPanel(false) }}
          className={`map-ctrl-btn ${showDataPanel ? 'bg-blue-600 text-white border-blue-600' : ''}`}
          title="Data sources"
        >
          <Database size={15}/>
        </button>
      </div>

      {/* ── Layer panel ──────────────────────────────────────────────────── */}
      {showLayerPanel && (
        <div className="absolute left-14 top-1/2 -translate-y-1/2 z-10 bg-white/97 backdrop-blur
                        rounded-2xl shadow-xl border border-slate-200 p-4 w-52">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <Layers size={12}/> Map Layers
            </span>
            <button onClick={() => setShowLayerPanel(false)} className="text-slate-400 hover:text-slate-700">
              <X size={13}/>
            </button>
          </div>
          <div className="space-y-2">
            {([
              { key: 'buildings',  label: '3D Buildings',       icon: <Building2    size={12}/> },
              { key: 'parcels',    label: 'Land Parcels',        icon: <MapPin       size={12}/> },
              { key: 'detections', label: 'Encroachments',       icon: <AlertTriangle size={12}/> },
              { key: 'labels',     label: 'Geographic Labels',   icon: <Globe        size={12}/> },
            ] as Array<{key: keyof LayerState; label: string; icon: React.ReactNode}>).map(l => (
              <button
                key={l.key}
                onClick={() => toggleLayer(l.key)}
                className="w-full flex items-center justify-between px-2 py-1.5
                           rounded-lg hover:bg-slate-50 transition-colors"
              >
                <span className="flex items-center gap-2 text-xs text-slate-700">
                  {l.icon} {l.label}
                </span>
                {layers[l.key]
                  ? <Eye     size={13} className="text-blue-500"/>
                  : <EyeOff  size={13} className="text-slate-300"/>
                }
              </button>
            ))}
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100">
            <div className="text-[10px] text-slate-400 uppercase font-semibold mb-1.5">Map style</div>
            <div className="grid grid-cols-2 gap-1">
              {([
                { k: 'satellite', label: 'Satellite' },
                { k: 'street',    label: 'Street'    },
                { k: 'terrain',   label: 'Topo'      },
                { k: 'dark',      label: 'Dark'      },
              ] as Array<{k: BasemapStyle; label: string}>).map(b => (
                <button
                  key={b.k}
                  onClick={() => switchBasemap(b.k)}
                  className={`text-[10px] py-1 rounded-lg font-medium transition-colors
                    ${basemap === b.k ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Data sources panel ───────────────────────────────────────────── */}
      {showDataPanel && (
        <div className="absolute left-14 top-1/2 -translate-y-1/2 z-10 bg-white/97 backdrop-blur
                        rounded-2xl shadow-xl border border-slate-200 p-4 w-64">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <Database size={12}/> Data Sources
            </span>
            <button onClick={() => setShowDataPanel(false)} className="text-slate-400 hover:text-slate-700">
              <X size={13}/>
            </button>
          </div>
          <div className="space-y-2.5">
            {[
              {
                label: 'Satellite Imagery',
                src:   'ESRI World Imagery',
                status: 'Live',
                note:  'Free XYZ tiles — no API key',
                color: '#22c55e',
              },
              {
                label: '3D Building Data',
                src:   'OpenStreetMap via OpenFreeMap',
                status: 'Live',
                note:  'Heights from OSM tags; estimated 10 m where absent',
                color: '#22c55e',
              },
              {
                label: 'Land Parcel Boundaries',
                src:   'LandGuard DB (registered cadastral data)',
                status: `${parcels.length} parcels`,
                note:  'From backend — official registered boundaries',
                color: '#3b82f6',
              },
              {
                label: 'Encroachment Detections',
                src:   'LandGuard AI Detection Engine',
                status: `${detections.length} records`,
                note:  'Preliminary — requires field verification',
                color: '#eab308',
              },
              {
                label: 'Geographic Labels',
                src:   'ESRI World Boundaries & Places',
                status: 'Live',
                note:  'Free tile service — cities, districts, states',
                color: '#22c55e',
              },
              {
                label: 'Terrain / Elevation',
                src:   'ESRI World Topographic Map',
                status: 'Available',
                note:  'Switch to Topo basemap to view',
                color: '#8b5cf6',
              },
            ].map((d, i) => (
              <div key={i} className="bg-slate-50 rounded-xl p-2.5">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-semibold text-slate-700">{d.label}</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                        style={{ background: d.color+'22', color: d.color }}>
                    {d.status}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500">{d.src}</div>
                <div className="text-[10px] text-slate-400 italic mt-0.5">{d.note}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-[9px] text-slate-400 text-center">
            Building heights are estimated where OSM data is unavailable. Not legal evidence.
          </div>
        </div>
      )}

      {/* ── Legend (bottom-left) ─────────────────────────────────────────── */}
      {showLegend ? (
        <div className="absolute bottom-10 left-3 z-10 bg-white/97 backdrop-blur rounded-2xl
                        shadow-xl border border-slate-200 p-3 w-52">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-slate-700 flex items-center gap-1">
              <Layers size={10}/> Legend
            </span>
            <button onClick={() => setShowLegend(false)} className="text-slate-400 hover:text-slate-600">
              <X size={11}/>
            </button>
          </div>

          {/* Land use */}
          <div className="text-[9px] text-slate-400 uppercase font-semibold mb-1">Land Use</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 mb-2">
            {Object.entries(LAND_USE_COLORS).map(([k, c]) => (
              <div key={k} className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: c }}/>
                <span className="text-[9px] text-slate-600 truncate">{k}</span>
              </div>
            ))}
          </div>

          {/* Detection pipeline */}
          <div className="text-[9px] text-slate-400 uppercase font-semibold mb-1 pt-1.5 border-t border-slate-100">
            Detection Pipeline
          </div>
          <div className="space-y-1">
            {DETECTION_PIPELINE.map(p => (
              <div key={p.key} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: p.color }}/>
                <span className="text-[9px] text-slate-600">{p.label}</span>
              </div>
            ))}
          </div>

          <div className="mt-2 pt-1.5 border-t border-slate-100 text-[9px] text-amber-600 font-semibold">
            ⚠ Heights estimated — Not legal evidence
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowLegend(true)}
          className="absolute bottom-10 left-3 z-10 bg-white/95 backdrop-blur px-3 py-1.5
                     rounded-xl border border-slate-200 shadow text-xs text-slate-500
                     flex items-center gap-1.5 hover:text-slate-800"
        >
          <Layers size={12}/> Legend
        </button>
      )}

      {/* ── Parcel info panel (bottom-right) ─────────────────────────────── */}
      {selectedInfo && (
        <div className="absolute bottom-10 right-3 z-10 bg-white/97 backdrop-blur rounded-2xl
                        border border-slate-200 shadow-xl p-4 w-72 max-h-[60vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <MapPin size={13} className="text-blue-500"/> Parcel Details
            </h3>
            <button onClick={() => { setSelectedInfo(null); setSelectedDetection(null) }}
                    className="text-slate-400 hover:text-slate-700">
              <X size={14}/>
            </button>
          </div>

          {/* Parcel ID */}
          <div className="bg-blue-50 rounded-xl px-3 py-2 mb-3">
            <div className="text-[10px] text-blue-500 font-semibold uppercase">Parcel ID</div>
            <div className="font-mono text-blue-700 font-bold text-sm">{selectedInfo.parcel_id}</div>
          </div>

          {/* Encroachment alert */}
          {selectedInfo.is_flagged && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3
                            flex items-center gap-2 text-red-700 text-xs">
              <AlertTriangle size={13}/>
              <span className="font-semibold">Encroachment Flagged</span>
              <span className="text-red-500">({selectedInfo.detection_count} detection{selectedInfo.detection_count !== 1 ? 's' : ''})</span>
            </div>
          )}

          {/* Core fields */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs mb-3">
            {[
              ['Land Use',  selectedInfo.registered_land_use || '—'],
              ['Reg. Area', selectedInfo.registered_area_sqm ? `${selectedInfo.registered_area_sqm.toFixed(0)} m²` : '—'],
              ['District',  selectedInfo.district || '—'],
              ['State',     selectedInfo.state     || '—'],
              ['Owner',     selectedInfo.owner?.owner_name || '—'],
              ['Review',    selectedInfo.review_status || '—'],
            ].map(([label, val]) => (
              <div key={label}>
                <div className="text-slate-400">{label}</div>
                <div className="text-slate-700 font-semibold truncate" title={String(val)}>{val}</div>
              </div>
            ))}
          </div>

          {/* Coordinates */}
          {selectedInfo.centroid_lat && selectedInfo.centroid_lng && (
            <div className="bg-slate-50 rounded-xl px-3 py-2 mb-3">
              <div className="text-[10px] text-slate-400 font-semibold uppercase mb-0.5">Coordinates</div>
              <div className="font-mono text-slate-600 text-[11px]">
                {selectedInfo.centroid_lat.toFixed(6)}°N, {selectedInfo.centroid_lng.toFixed(6)}°E
              </div>
            </div>
          )}

          {/* Address */}
          {selectedInfo.address && (
            <div className="text-xs text-slate-500 mb-2">
              <span className="text-slate-400">Address: </span>{selectedInfo.address}
            </div>
          )}

          {/* Detection analysis */}
          {selectedDetection && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <div className="text-[10px] text-slate-400 uppercase font-semibold mb-2 flex items-center gap-1">
                <AlertTriangle size={10} className="text-amber-500"/> Encroachment Analysis
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Registered Area</span>
                  <span className="font-semibold">
                    {selectedDetection.registered_area_sqm?.toFixed(0) ?? '—'} m²
                  </span>
                </div>
                {selectedDetection.observed_area_sqm && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Observed Area</span>
                    <span className="font-semibold">{selectedDetection.observed_area_sqm.toFixed(0)} m²</span>
                  </div>
                )}
                {selectedDetection.overlap_area_sqm && (
                  <div className="flex justify-between text-red-700">
                    <span>Overlap / Encroachment</span>
                    <span className="font-bold">{selectedDetection.overlap_area_sqm.toFixed(1)} m²</span>
                  </div>
                )}
                {selectedDetection.area_difference_pct && (
                  <div className="flex justify-between text-red-700">
                    <span>Area Difference</span>
                    <span className="font-bold">{selectedDetection.area_difference_pct.toFixed(1)}%</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">Severity</span>
                  <span className={`font-bold ${
                    selectedDetection.severity === 'Critical' ? 'text-red-700'
                    : selectedDetection.severity === 'High'   ? 'text-orange-600'
                    : selectedDetection.severity === 'Medium' ? 'text-amber-600'
                    :                                           'text-green-600'
                  }`}>{selectedDetection.severity}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Confidence</span>
                  <span className="font-semibold">
                    {selectedDetection.model_confidence != null
                      ? `${(selectedDetection.model_confidence * 100).toFixed(0)}%`
                      : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Status</span>
                  <span className="font-semibold" style={{ color: DETECTION_STATUS_COLORS[selectedDetection.review_status] }}>
                    {selectedDetection.review_status}
                  </span>
                </div>
                {selectedDetection.detection_reason && (
                  <div className="mt-1.5 text-[10px] text-slate-500 italic border-t border-amber-200 pt-1.5">
                    {selectedDetection.detection_reason}
                  </div>
                )}
              </div>
              <div className="mt-2 text-[10px] text-amber-700 font-semibold text-center">
                ⚠ PRELIMINARY — Requires authorized field verification
              </div>
            </div>
          )}

          {/* Simulated notice */}
          {selectedInfo.is_simulated && (
            <div className="mt-2 text-[10px] text-slate-400 italic text-center">
              Simulated record — demonstration only
            </div>
          )}
        </div>
      )}

      {/* ── Camera info (bottom-centre) ───────────────────────────────────── */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 bg-black/50 backdrop-blur
                      text-white text-[10px] px-3 py-1 rounded-full flex items-center gap-3">
        <span>Zoom {zoom.toFixed(1)}</span>
        <span>Pitch {tilt}°</span>
        <span>Bearing {((bearing % 360) + 360) % 360}°</span>
        <span className="text-slate-400">Drag to pan · Ctrl+drag to tilt/rotate</span>
      </div>

      {/* ── Loading overlay ───────────────────────────────────────────────── */}
      {!mapReady && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/85 z-20">
          <div className="text-white text-sm flex items-center gap-3 mb-2">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
            Loading 3D India map…
          </div>
          <div className="text-slate-400 text-xs">Fetching satellite imagery and building data</div>
        </div>
      )}

      {/* ── Attribution ───────────────────────────────────────────────────── */}
      <div className="absolute bottom-1 right-3 z-10 text-[9px] text-white/60">
        © Esri · © OpenStreetMap contributors · © CARTO
      </div>
    </div>
  )
}
