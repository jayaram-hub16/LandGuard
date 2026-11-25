/**
 * Map3DView — Apple Maps-inspired Advanced 3D GIS for India
 *
 * Architecture & Reliability Guarantees:
 *  - Uses MapLibre GL JS v4.7.1 with style specs validated against @maplibre/maplibre-gl-style-spec.
 *  - Satellite imagery loads FIRST cleanly without blocking on vector TileJSON or sprite files.
 *  - 3D Buildings (OpenFreeMap OSM) and 3D Terrain (AWS Terrarium DEM) load ASYNCHRONOUSLY and
 *    INDEPENDENTLY — failure of any optional provider never prevents the India map or parcels
 *    from rendering, and never leaves a loading spinner stuck indefinitely.
 *  - Parcel 3D extrusion opacity & flagged dashed outlines use separate filtered layers so no
 *    unsupported data expressions are emitted to WebGL.
 *
 * DISCLAIMER:
 *  - Building heights use OSM render_height where mapped and nominal 10 m otherwise; they are NOT legal evidence.
 *  - All encroachment detections are PRELIMINARY — verified surveyor inspection & official review required.
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  RotateCcw, Maximize2, Minimize2, Layers, Building2,
  Map, AlertTriangle, X, ChevronUp, ChevronDown,
  Compass, ZoomIn, ZoomOut, Eye, EyeOff, Search,
  MapPin, Database, Globe, Satellite, RefreshCw,
  Clock, Mountain,
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
  'Pending Review':                  '#eab308', // AI-detected – unverified
  'Under Investigation':             '#f97316', // Citizen-reported / investigating
  'Field Survey Assigned':           '#3b82f6', // Field team dispatched
  'Verified by Authorized Surveyor': '#ef4444', // Human-verified finding
  'False Positive':                  '#6b7280', // Cleared
  'Resolved':                        '#22c55e', // Resolved
}

const DETECTION_PIPELINE: Array<{ key: string; label: string; color: string }> = [
  { key: 'ai',       label: 'AI-Detected Candidate',  color: '#eab308' },
  { key: 'citizen',  label: 'Citizen-Reported',       color: '#f97316' },
  { key: 'field',    label: 'Field-Verified Finding', color: '#ef4444' },
  { key: 'official', label: 'Official Determination', color: '#7c3aed' },
]

// ── India geography ──────────────────────────────────────────────────────────

const INDIA_CENTER: [number, number] = [78.9629, 20.5937]
const INDIA_ZOOM = 4.8
const INDIA_MIN_ZOOM = 4.0
const INDIA_MAX_ZOOM = 20
// Keep panning & zoom centered around the Indian subcontinent without blocking border regions
const INDIA_MAX_BOUNDS: [[number, number], [number, number]] = [
  [55.0, -2.0],
  [108.0, 44.0],
]

const INDIA_QUICK_LOCATIONS: Array<{ name: string; coords: [number, number]; zoom: number }> = [
  { name: 'All India',     coords: [78.9629, 20.5937], zoom: 4.8 },
  { name: 'Hyderabad',     coords: [78.4867, 17.3850], zoom: 14  },
  { name: 'Bengaluru',     coords: [77.5946, 12.9716], zoom: 14  },
  { name: 'Mumbai',        coords: [72.8777, 19.0760], zoom: 14  },
  { name: 'Delhi',         coords: [77.2090, 28.6139], zoom: 14  },
  { name: 'Chennai',       coords: [80.2707, 13.0827], zoom: 14  },
  { name: 'Kolkata',       coords: [88.3639, 22.5726], zoom: 14  },
  { name: 'Pune',          coords: [73.8567, 18.5204], zoom: 14  },
  { name: 'Ahmedabad',     coords: [72.5714, 23.0225], zoom: 14  },
  { name: 'Visakhapatnam', coords: [83.3185, 17.6868], zoom: 14  },
  { name: 'Amaravati',     coords: [80.4538, 16.5062], zoom: 14  },
  { name: 'Vijayawada',    coords: [80.6480, 16.5062], zoom: 14  },
]

const OPENFREEMAP_TILEJSON_URL = 'https://tiles.openfreemap.org/planet'
const TERRARIUM_DEM_TILES = ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png']
const GLYPHS_URL = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf'

// ── Types & Interfaces ───────────────────────────────────────────────────────

type BasemapStyle = 'satellite' | 'street' | 'dark' | 'terrain'
type ProviderState = 'idle' | 'loading' | 'ready' | 'error'

interface Map3DViewProps {
  parcels:        LandParcel[]
  detections:     EncroachmentDetection[]
  selectedParcel: LandParcel | null
  onParcelSelect: (p: LandParcel) => void
  onClose:        () => void
}

interface LayerState {
  buildings:  boolean
  terrain:    boolean
  parcels:    boolean
  detections: boolean
  labels:     boolean
}

interface SelectedBuildingInfo {
  height:      number
  isEstimated: boolean
  minHeight:   number
  colour?:     string
  lngLat:      [number, number]
}

// ── Lightweight Base Style Builder (Satellite / Basemap First) ──────────────

function buildBaseStyle(style: BasemapStyle, showLabels: boolean): maplibregl.StyleSpecification {
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
  }

  const baseSourceId = style === 'satellite' ? 'esri-satellite'
                     : style === 'street'    ? 'esri-street'
                     : style === 'dark'      ? 'carto-dark'
                     :                         'esri-topo'

  const layers: maplibregl.LayerSpecification[] = [
    {
      id: 'base-layer',
      type: 'raster',
      source: baseSourceId,
      minzoom: 0,
      maxzoom: 22,
    },
    {
      id: 'esri-labels-layer',
      type: 'raster',
      source: 'esri-labels',
      minzoom: 0,
      maxzoom: 22,
      paint: { 'raster-opacity': 0.95 },
      layout: {
        // Other basemaps already render street/place names; show overlay only on satellite when enabled
        visibility: style === 'satellite' && showLabels ? 'visible' : 'none',
      },
    },
  ]

  return {
    version: 8,
    glyphs: GLYPHS_URL,
    sources,
    layers,
  }
}

// ── GeoJSON Normalizers ──────────────────────────────────────────────────────

function extractGeometry(raw: unknown): GeoJSON.Geometry | null {
  if (!raw) return null
  let obj: unknown = raw
  if (typeof obj === 'string') {
    try {
      obj = JSON.parse(obj)
    } catch {
      return null
    }
  }
  if (!obj || typeof obj !== 'object') return null
  const rec = obj as Record<string, unknown>

  if (rec.type === 'Feature' && rec.geometry && typeof rec.geometry === 'object') {
    return extractGeometry(rec.geometry)
  }
  if (rec.type === 'FeatureCollection' && Array.isArray(rec.features) && rec.features.length > 0) {
    return extractGeometry(rec.features[0])
  }
  if (
    typeof rec.type === 'string' &&
    ['Polygon', 'MultiPolygon', 'Point', 'MultiPoint', 'LineString', 'MultiLineString'].includes(rec.type) &&
    Array.isArray(rec.coordinates)
  ) {
    return rec as unknown as GeoJSON.Geometry
  }
  return null
}

function buildParcelGeoJSON(parcels: LandParcel[], selectedId?: string): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  for (const p of parcels) {
    const geom = extractGeometry(p.boundary_geojson)
    if (!geom) continue
    features.push({
      type: 'Feature',
      geometry: geom,
      properties: {
        parcel_id:       p.parcel_id,
        id:              p.id,
        land_use:        p.registered_land_use || 'Unknown',
        is_flagged:      Boolean(p.is_flagged),
        area_sqm:        p.registered_area_sqm ?? null,
        district:        p.district || '',
        state:           p.state || '',
        owner:           p.owner?.owner_name || '',
        detection_count: p.detection_count ?? 0,
        selected:        p.id === selectedId,
        color: p.is_flagged
          ? '#ef4444'
          : (LAND_USE_COLORS[p.registered_land_use || 'Unknown'] || '#3b82f6'),
        is_simulated: Boolean(p.is_simulated),
      },
    })
  }
  return { type: 'FeatureCollection', features }
}

function buildDetectionGeoJSON(detections: EncroachmentDetection[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  for (const d of detections) {
    const geom = extractGeometry(d.encroachment_boundary_geojson)
    if (!geom) continue
    features.push({
      type: 'Feature',
      geometry: geom,
      properties: {
        id:            d.id,
        parcel_id:     d.parcel_id,
        review_status: d.review_status,
        severity:      d.severity,
        confidence:    d.model_confidence ?? null,
        area_diff_pct: d.area_difference_pct ?? null,
        overlap_sqm:   d.overlap_area_sqm ?? null,
        reg_area:      d.registered_area_sqm ?? null,
        obs_area:      d.observed_area_sqm ?? null,
        color:         DETECTION_STATUS_COLORS[d.review_status] || '#eab308',
      },
    })
  }
  return { type: 'FeatureCollection', features }
}

function safeAddLayer(map: maplibregl.Map, layer: maplibregl.LayerSpecification, beforeId?: string): string | null {
  try {
    if (!map.getLayer(layer.id)) {
      map.addLayer(layer, beforeId && map.getLayer(beforeId) ? beforeId : undefined)
    }
    return null
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[Map3DView] Skipping layer "${layer.id}":`, msg)
    return `${layer.id}: ${msg}`
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Map3DView({
  parcels, detections, selectedParcel, onParcelSelect, onClose,
}: Map3DViewProps) {
  const mapContainer      = useRef<HTMLDivElement>(null)
  const mapRef            = useRef<maplibregl.Map | null>(null)
  const popupRef          = useRef<maplibregl.Popup | null>(null)
  const markerRef         = useRef<maplibregl.Marker | null>(null)
  const handlersBoundRef  = useRef(false)
  const styleGenRef       = useRef(0)
  const lastFlownIdRef    = useRef<string | null>(null)

  // Latest-state refs so one-time MapLibre event listeners never read stale closures
  const parcelsRef        = useRef(parcels)
  const detectionsRef     = useRef(detections)
  const selectedParcelRef = useRef(selectedParcel)
  const onParcelSelectRef = useRef(onParcelSelect)
  const layersRef         = useRef<LayerState>({
    buildings: true, terrain: true, parcels: true, detections: true, labels: true,
  })
  const basemapRef        = useRef<BasemapStyle>('satellite')

  parcelsRef.current        = parcels
  detectionsRef.current     = detections
  selectedParcelRef.current = selectedParcel
  onParcelSelectRef.current = onParcelSelect

  // Map & Provider status
  const [mapReady,         setMapReady]         = useState(false)
  const [fatalError,       setFatalError]       = useState<string | null>(null)
  const [basemapStatus,    setBasemapStatus]    = useState<ProviderState>('loading')
  const [buildingStatus,   setBuildingStatus]   = useState<ProviderState>('idle')
  const [terrainStatus,    setTerrainStatus]    = useState<ProviderState>('idle')
  const [providerWarnings, setProviderWarnings] = useState<string[]>([])
  const [dismissedWarn,    setDismissedWarn]    = useState(false)

  // Camera state
  const [tilt,         setTilt]         = useState(45)
  const [bearing,      setBearing]      = useState(0)
  const [zoom,         setZoom]         = useState(INDIA_ZOOM)
  const [basemap,      setBasemap]      = useState<BasemapStyle>('satellite')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [layers,       setLayers]       = useState<LayerState>({
    buildings: true, terrain: true, parcels: true, detections: true, labels: true,
  })

  layersRef.current  = layers
  basemapRef.current = basemap

  // MapLibre v4 terrain overscaling fails / blanks tiles past DEM maxzoom (z>14), so suspend terrain at high zoom
  const syncTerrainForZoom = useCallback((map: maplibregl.Map, targetZoom?: number) => {
    const z = targetZoom ?? map.getZoom()
    try {
      if (layersRef.current.terrain && z <= 14.0 && map.getSource('terrain-dem')) {
        if (!map.getTerrain()) {
          map.setTerrain({ source: 'terrain-dem', exaggeration: 1.5 })
        }
      } else if (map.getTerrain()) {
        map.setTerrain(null)
      }
    } catch {
      /* ignore */
    }
  }, [])

  // UI panels
  const [showLayerPanel,    setShowLayerPanel]    = useState(false)
  const [showSearchPanel,   setShowSearchPanel]   = useState(false)
  const [showLegend,        setShowLegend]        = useState(true)
  const [showDataPanel,     setShowDataPanel]     = useState(false)
  const [selectedInfo,      setSelectedInfo]      = useState<LandParcel | null>(selectedParcel)
  const [selectedDetection, setSelectedDetection] = useState<EncroachmentDetection | null>(null)
  const [selectedBuilding,  setSelectedBuilding]  = useState<SelectedBuildingInfo | null>(null)

  // Search
  const [searchQuery,   setSearchQuery]   = useState('')
  const [searchResults, setSearchResults] = useState<Array<{
    name: string; coords: [number, number]; zoom: number; parcel?: LandParcel
  }>>([])
  const [isSearching, setIsSearching] = useState(false)

  const addWarning = useCallback((msg: string) => {
    setProviderWarnings(prev => (prev.includes(msg) ? prev : [...prev, msg]))
    setDismissedWarn(false)
  }, [])

  // ── Core Parcel & Detection Vector Layers (Isolated from Buildings/Terrain) ─

  const ensureParcelAndDetectionLayers = useCallback((map: maplibregl.Map) => {
    const errs: string[] = []
    const parcelVis = layersRef.current.parcels ? 'visible' : 'none'
    const labelVis  = (layersRef.current.parcels && layersRef.current.labels) ? 'visible' : 'none'
    const detVis    = layersRef.current.detections ? 'visible' : 'none'

    // 1. Parcels source & layers
    try {
      const parcelGeo = buildParcelGeoJSON(parcelsRef.current, selectedParcelRef.current?.id)
      const existingSrc = map.getSource('parcels') as maplibregl.GeoJSONSource | undefined
      if (existingSrc) {
        existingSrc.setData(parcelGeo)
      } else {
        map.addSource('parcels', { type: 'geojson', data: parcelGeo })
      }

      // Base 3D extrusion — uses STATIC fill-extrusion-opacity (MapLibre v4 spec requirement)
      const e1 = safeAddLayer(map, {
        id: 'parcels-fill-3d',
        type: 'fill-extrusion',
        source: 'parcels',
        filter: ['!=', ['get', 'selected'], true],
        paint: {
          'fill-extrusion-color': [
            'case',
            ['==', ['get', 'is_flagged'], true], '#ef4444',
            ['get', 'color'],
          ],
          'fill-extrusion-height': 2,
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0.35,
        },
        layout: { visibility: parcelVis },
      })
      if (e1) errs.push(e1)

      // Selected parcel 3D extrusion — separate layer for higher height & static 0.72 opacity
      const e2 = safeAddLayer(map, {
        id: 'parcels-fill-3d-selected',
        type: 'fill-extrusion',
        source: 'parcels',
        filter: ['==', ['get', 'selected'], true],
        paint: {
          'fill-extrusion-color': '#f59e0b',
          'fill-extrusion-height': 4,
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0.72,
        },
        layout: { visibility: parcelVis },
      })
      if (e2) errs.push(e2)

      // Unflagged parcel solid outline
      const e3 = safeAddLayer(map, {
        id: 'parcels-outline',
        type: 'line',
        source: 'parcels',
        filter: ['!=', ['get', 'is_flagged'], true],
        paint: {
          'line-color': ['case', ['==', ['get', 'selected'], true], '#f59e0b', ['get', 'color']],
          'line-width': ['case', ['==', ['get', 'selected'], true], 3.5, 1.8],
        },
        layout: { visibility: parcelVis },
      })
      if (e3) errs.push(e3)

      // Flagged parcel dashed outline — STATIC line-dasharray [6, 4] (MapLibre v4 spec requirement)
      const e4 = safeAddLayer(map, {
        id: 'parcels-outline-flagged',
        type: 'line',
        source: 'parcels',
        filter: ['==', ['get', 'is_flagged'], true],
        paint: {
          'line-color': ['case', ['==', ['get', 'selected'], true], '#f59e0b', '#ef4444'],
          'line-width': ['case', ['==', ['get', 'selected'], true], 3.5, 2.5],
          'line-dasharray': [6, 4],
        },
        layout: { visibility: parcelVis },
      })
      if (e4) errs.push(e4)

      // Parcel ID labels (zoom 14+, Noto Sans matches OpenFreeMap fonts)
      const e5 = safeAddLayer(map, {
        id: 'parcels-labels',
        type: 'symbol',
        source: 'parcels',
        minzoom: 14,
        layout: {
          'text-field': ['get', 'parcel_id'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-anchor': 'center',
          'text-allow-overlap': false,
          visibility: labelVis,
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#1e3a5f',
          'text-halo-width': 1.5,
        },
      })
      if (e5) errs.push(e5)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errs.push(`Parcel layer setup failed: ${msg}`)
    }

    // 2. Encroachment detection overlays
    try {
      const detGeo = buildDetectionGeoJSON(detectionsRef.current)
      const existingDet = map.getSource('detections') as maplibregl.GeoJSONSource | undefined
      if (existingDet) {
        existingDet.setData(detGeo)
      } else {
        map.addSource('detections', { type: 'geojson', data: detGeo })
      }

      const d1 = safeAddLayer(map, {
        id: 'detections-fill',
        type: 'fill',
        source: 'detections',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': 0.28,
        },
        layout: { visibility: detVis },
      })
      if (d1) errs.push(d1)

      const d2 = safeAddLayer(map, {
        id: 'detections-outline',
        type: 'line',
        source: 'detections',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2.5,
          'line-dasharray': [5, 4],
        },
        layout: { visibility: detVis },
      })
      if (d2) errs.push(d2)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errs.push(`Detection layer setup failed: ${msg}`)
    }

    if (errs.length > 0) {
      addWarning(`Some GIS overlay layers could not load cleanly: ${errs[0]}`)
    }
  }, [addWarning])

  // ── Separate Async Loader: OSM 3D Buildings (OpenFreeMap) ────────────────

  const loadBuildingsAsync = useCallback(async (map: maplibregl.Map, generation: number) => {
    setBuildingStatus('loading')
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 8000)

      let tiles: string[] | null = null
      let minzoom = 0
      let maxzoom = 14

      try {
        const res = await fetch(OPENFREEMAP_TILEJSON_URL, { signal: controller.signal })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const tileJson = await res.json() as {
          tiles?: string[]; minzoom?: number; maxzoom?: number
        }
        if (Array.isArray(tileJson.tiles) && tileJson.tiles.length > 0) {
          tiles = tileJson.tiles
          if (typeof tileJson.minzoom === 'number') minzoom = tileJson.minzoom
          if (typeof tileJson.maxzoom === 'number') maxzoom = tileJson.maxzoom
        }
      } finally {
        clearTimeout(timer)
      }

      // Bail safely if unmounted or user switched basemap meanwhile
      if (styleGenRef.current !== generation || mapRef.current !== map) return

      if (!map.getSource('osm-buildings')) {
        map.addSource('osm-buildings', tiles
          ? {
              type: 'vector',
              tiles,
              minzoom,
              maxzoom,
              attribution: '© OpenStreetMap contributors',
            }
          : {
              type: 'vector',
              url: OPENFREEMAP_TILEJSON_URL,
              attribution: '© OpenStreetMap contributors',
            }
        )
      }

      // Render buildings underneath parcel fills/labels so cadastral boundaries remain crisp
      const beforeLayer = map.getLayer('parcels-fill-3d')
        ? 'parcels-fill-3d'
        : (map.getLayer('parcels-labels') ? 'parcels-labels' : undefined)

      const err = safeAddLayer(
        map,
        {
          id: '3d-buildings',
          type: 'fill-extrusion',
          source: 'osm-buildings',
          'source-layer': 'building',
          minzoom: 13,
          filter: ['!=', ['get', 'hide_3d'], true],
          paint: {
            'fill-extrusion-color': [
              'interpolate',
              ['linear'],
              ['coalesce', ['get', 'render_height'], 10],
              0,   '#cbd5e1',
              12,  '#93c5fd',
              30,  '#3b82f6',
              65,  '#2563eb',
              120, '#1d4ed8',
            ],
            'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 10],
            'fill-extrusion-base':   ['coalesce', ['get', 'render_min_height'], 0],
            'fill-extrusion-opacity': 0.82,
          },
          layout: {
            visibility: layersRef.current.buildings ? 'visible' : 'none',
          },
        },
        beforeLayer
      )

      if (err) {
        setBuildingStatus('error')
        addWarning(`3D buildings layer unavailable (${err}).`)
      } else {
        setBuildingStatus('ready')
      }
    } catch (err) {
      if (styleGenRef.current !== generation) return
      const msg = err instanceof Error ? err.message : 'Request failed'
      console.warn('[Map3DView] 3D Buildings provider unavailable:', msg)
      setBuildingStatus('error')
      addWarning(`3D buildings provider (OpenFreeMap) unavailable: ${msg}. Satellite & parcel boundaries remain active.`)
    }
  }, [addWarning])

  // ── Separate Async Loader: 3D Terrain DEM (AWS Open Data Terrarium) ──────

  const loadTerrainAsync = useCallback((map: maplibregl.Map, generation: number) => {
    setTerrainStatus('loading')
    try {
      if (styleGenRef.current !== generation || mapRef.current !== map) return
      if (!map.getSource('terrain-dem')) {
        map.addSource('terrain-dem', {
          type: 'raster-dem',
          tiles: TERRARIUM_DEM_TILES,
          encoding: 'terrarium',
          tileSize: 256,
          maxzoom: 15,
          attribution: '© Mapzen, AWS Open Data Terrain',
        })
      }
      syncTerrainForZoom(map)
      setTerrainStatus('ready')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('[Map3DView] 3D Terrain provider error:', msg)
      setTerrainStatus('error')
      addWarning(`3D terrain elevation unavailable: ${msg}`)
    }
  }, [addWarning, syncTerrainForZoom])

  // ── Bind Interactive Click & Hover Listeners Once ────────────────────────

  const bindMapEvents = useCallback((map: maplibregl.Map) => {
    if (handlersBoundRef.current) return
    handlersBoundRef.current = true

    const handleParcelClick = (e: maplibregl.MapLayerMouseEvent) => {
      const feat = e.features?.[0]
      if (!feat) return
      const parcelId = feat.properties?.id as string
      const parcel = parcelsRef.current.find(p => p.id === parcelId)
      if (!parcel) return

      onParcelSelectRef.current(parcel)
      lastFlownIdRef.current = parcel.id
      setSelectedInfo(parcel)
      setSelectedBuilding(null)
      // Select matching detection if any
      const det = detectionsRef.current.find(d => d.parcel_id === parcel.id) || null
      setSelectedDetection(det)

      if (parcel.centroid_lat && parcel.centroid_lng) {
        const tz = Math.max(map.getZoom(), 16)
        syncTerrainForZoom(map, tz)
        map.flyTo({
          center:   [parcel.centroid_lng, parcel.centroid_lat],
          zoom:     tz,
          pitch:    Math.max(map.getPitch(), 55),
          bearing:  map.getBearing(),
          duration: 1100,
        })
      }
    }

    for (const layerId of ['parcels-fill-3d', 'parcels-fill-3d-selected'] as const) {
      map.on('click', layerId, handleParcelClick)
      map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = '' })
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
            <div style="font-weight:700;color:${p.color};margin-bottom:4px">⚠ Potential Encroachment</div>
            <div><span style="color:#64748b">Status:</span> ${p.review_status}</div>
            <div><span style="color:#64748b">Severity:</span> ${p.severity}</div>
            <div><span style="color:#64748b">Confidence:</span> ${p.confidence != null ? (Number(p.confidence) * 100).toFixed(0) + '%' : '—'}</div>
            ${p.reg_area ? `<div><span style="color:#64748b">Reg. Area:</span> ${Number(p.reg_area).toFixed(0)} m²</div>` : ''}
            ${p.overlap_sqm ? `<div><span style="color:#dc2626">Overlap:</span> ${Number(p.overlap_sqm).toFixed(1)} m²</div>` : ''}
            ${p.area_diff_pct ? `<div><span style="color:#dc2626">Area Diff:</span> ${Number(p.area_diff_pct).toFixed(1)}%</div>` : ''}
            <div style="color:#64748b;font-size:10px;margin-top:6px;border-top:1px solid #cbd5e1;padding-top:4px">
              ⚠ PRELIMINARY — Not a legal conclusion. Requires field verification.
            </div>
          </div>
        `)
        .addTo(map)
    })

    map.on('mouseleave', 'detections-fill', () => {
      map.getCanvas().style.cursor = ''
      if (popupRef.current) {
        popupRef.current.remove()
        popupRef.current = null
      }
    })

    // Detection click → open analysis panel
    map.on('click', 'detections-fill', (e) => {
      const feat = e.features?.[0]
      if (!feat) return
      const detId = feat.properties?.id as string
      const det = detectionsRef.current.find(d => d.id === detId)
      if (det) {
        setSelectedDetection(det)
        setSelectedBuilding(null)
        const parcel = parcelsRef.current.find(p => p.id === det.parcel_id)
        if (parcel) {
          onParcelSelectRef.current(parcel)
          setSelectedInfo(parcel)
        }
      }
    })

    // Building click (only when user didn't click a parcel polygon)
    map.on('click', '3d-buildings', (e) => {
      const parcelLayers = ['parcels-fill-3d', 'parcels-fill-3d-selected'].filter(id => Boolean(map.getLayer(id)))
      if (parcelLayers.length > 0) {
        const hitParcel = map.queryRenderedFeatures(e.point, { layers: parcelLayers })
        if (hitParcel.length > 0) return
      }
      const feat = e.features?.[0]
      if (!feat) return
      const rawHeight = feat.properties?.render_height
      const hasOsmHeight = typeof rawHeight === 'number' && rawHeight > 0
      setSelectedBuilding({
        height:      hasOsmHeight ? Number(rawHeight) : 10,
        isEstimated: !hasOsmHeight,
        minHeight:   Number(feat.properties?.render_min_height || 0),
        colour:      typeof feat.properties?.colour === 'string' ? feat.properties.colour : undefined,
        lngLat:      [e.lngLat.lng, e.lngLat.lat],
      })
    })
    map.on('mouseenter', '3d-buildings', () => { map.getCanvas().style.cursor = 'pointer' })
    map.on('mouseleave', '3d-buildings', () => { map.getCanvas().style.cursor = '' })
  }, [])

  // ── Complete Stage-by-Stage Initialization Pipeline ──────────────────────

  const initializeStyleStages = useCallback((map: maplibregl.Map, generation: number) => {
    // Stage 1 finished (`style.load`): satellite/basemap tiles are ready to stream
    setBasemapStatus('ready')
    setMapReady(true)

    // Stage 2: Load parcel & encroachment overlays (isolated try/catch)
    ensureParcelAndDetectionLayers(map)
    bindMapEvents(map)

    // Stage 3a & 3b: Independently & asynchronously load 3D buildings and terrain
    void loadBuildingsAsync(map, generation)
    loadTerrainAsync(map, generation)

    // If a parcel was pre-selected before entering 3D view, fly to it smoothly
    const preSel = selectedParcelRef.current
    if (preSel?.centroid_lat && preSel?.centroid_lng) {
      map.flyTo({
        center:   [preSel.centroid_lng, preSel.centroid_lat],
        zoom:     Math.max(map.getZoom(), 16),
        pitch:    55,
        duration: 1200,
      })
      setSelectedInfo(preSel)
    }
  }, [ensureParcelAndDetectionLayers, bindMapEvents, loadBuildingsAsync, loadTerrainAsync])

  // ── Initialise MapLibre Once ─────────────────────────────────────────────

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return

    let map: maplibregl.Map
    const gen = ++styleGenRef.current

    try {
      map = new maplibregl.Map({
        container: mapContainer.current,
        style:     buildBaseStyle('satellite', true),
        center:    INDIA_CENTER,
        zoom:      INDIA_ZOOM,
        pitch:     45,
        bearing:   0,
        minZoom:   INDIA_MIN_ZOOM,
        maxZoom:   INDIA_MAX_ZOOM,
        maxBounds: INDIA_MAX_BOUNDS,
        antialias: true,
        attributionControl: false,
      })
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'WebGL initialization failed'
      setFatalError(`Unable to initialize 3D WebGL map (${msg}). Please use 2D Leaflet mode or enable hardware acceleration.`)
      setMapReady(true)
      return
    }

    mapRef.current = map
    setBasemapStatus('loading')

    // Track camera state (note: terrain sync happens only on moveend so active flyTo animations are never interrupted)
    map.on('pitch',   () => setTilt(Math.round(map.getPitch())))
    map.on('bearing', () => setBearing(Math.round(map.getBearing())))
    map.on('zoom',    () => setZoom(Math.round(map.getZoom() * 10) / 10))
    map.on('moveend', () => syncTerrainForZoom(map, map.getZoom()))

    // Non-blocking error listener: classify external provider errors cleanly
    map.on('error', (ev) => {
      const errMsg = ev.error?.message || 'External map provider error'
      const sourceId = (ev as unknown as { sourceId?: string }).sourceId
      console.warn('[Map3DView] Map event error:', sourceId || '', errMsg)

      if (sourceId === 'osm-buildings') {
        setBuildingStatus('error')
        addWarning('3D buildings tile service returned an error. Satellite imagery and parcels remain available.')
      } else if (sourceId === 'terrain-dem') {
        setTerrainStatus('error')
        try { map.setTerrain(null) } catch { /* ignore */ }
        addWarning('3D terrain tiles unavailable — switched to flat ground plane.')
      } else if (sourceId && ['esri-satellite', 'esri-street', 'esri-topo', 'carto-dark'].includes(sourceId)) {
        setBasemapStatus('error')
        addWarning(`Basemap tiles (${sourceId}) had a network error. Try switching basemap style or Retry.`)
      }
      // Guarantee spinner never remains stuck
      setMapReady(true)
    })

    map.on('style.load', () => {
      if (styleGenRef.current !== gen) return
      initializeStyleStages(map, gen)
    })

    // Safety fallback: never leave the loading spinner running indefinitely if a style asset stalls
    const fallbackTimer = setTimeout(() => {
      if (mapRef.current === map) {
        setMapReady(true)
        if (!map.getSource('parcels')) {
          try {
            ensureParcelAndDetectionLayers(map)
            bindMapEvents(map)
          } catch { /* ignore */ }
        }
      }
    }, 3500)

    return () => {
      clearTimeout(fallbackTimer)
      handlersBoundRef.current = false
      if (popupRef.current) { popupRef.current.remove(); popupRef.current = null }
      if (markerRef.current) { markerRef.current.remove(); markerRef.current = null }
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Sync Parcels GeoJSON when prop or selection changes ──────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const src = map.getSource('parcels') as maplibregl.GeoJSONSource | undefined
    if (src) {
      src.setData(buildParcelGeoJSON(parcels, selectedParcel?.id))
    } else if (map.isStyleLoaded()) {
      ensureParcelAndDetectionLayers(map)
    }
  }, [selectedParcel, parcels, mapReady, ensureParcelAndDetectionLayers])

  // ── Sync Detections GeoJSON when prop changes ────────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const src = map.getSource('detections') as maplibregl.GeoJSONSource | undefined
    if (src) {
      src.setData(buildDetectionGeoJSON(detections))
    }
  }, [detections, mapReady])

  // ── Fly to selectedParcel when selected externally (e.g., from 2D / search)

  useEffect(() => {
    if (!selectedParcel || !mapRef.current || !mapReady) return
    if (lastFlownIdRef.current !== selectedParcel.id && selectedParcel.centroid_lat && selectedParcel.centroid_lng) {
      lastFlownIdRef.current = selectedParcel.id
      const tz = Math.max(mapRef.current.getZoom(), 16)
      syncTerrainForZoom(mapRef.current, tz)
      mapRef.current.flyTo({
        center:   [selectedParcel.centroid_lng, selectedParcel.centroid_lat],
        zoom:     tz,
        pitch:    Math.max(mapRef.current.getPitch(), 55),
        duration: 1100,
      })
    }
    setSelectedInfo(selectedParcel)
    const det = detections.find(d => d.parcel_id === selectedParcel.id) || null
    setSelectedDetection(det)
  }, [selectedParcel, detections, mapReady, syncTerrainForZoom])

  // ── Basemap switcher ─────────────────────────────────────────────────────

  const switchBasemap = useCallback((style: BasemapStyle) => {
    const map = mapRef.current
    if (!map) return
    const gen = ++styleGenRef.current
    setBasemap(style)
    basemapRef.current = style
    setBasemapStatus('loading')
    setBuildingStatus('idle')
    setTerrainStatus('idle')

    const timer = setTimeout(() => {
      if (styleGenRef.current === gen) setMapReady(true)
    }, 3500)

    map.setStyle(buildBaseStyle(style, layersRef.current.labels))
    map.once('style.load', () => {
      clearTimeout(timer)
      if (styleGenRef.current !== gen) return
      initializeStyleStages(map, gen)
    })
  }, [initializeStyleStages])

  // ── Instant Layer Toggles (no full style rebuild!) ───────────────────────

  const toggleLayer = useCallback((key: keyof LayerState) => {
    const map = mapRef.current
    if (!map) return

    setLayers(prev => {
      const next = { ...prev, [key]: !prev[key] }
      layersRef.current = next
      const vis = (on: boolean) => (on ? 'visible' : 'none')

      try {
        if (key === 'buildings') {
          if (map.getLayer('3d-buildings')) {
            map.setLayoutProperty('3d-buildings', 'visibility', vis(next.buildings))
          } else if (next.buildings) {
            void loadBuildingsAsync(map, styleGenRef.current)
          }
        }
        if (key === 'terrain') {
          if (next.terrain) {
            if (map.getSource('terrain-dem')) {
              syncTerrainForZoom(map)
            } else {
              loadTerrainAsync(map, styleGenRef.current)
            }
          } else {
            map.setTerrain(null)
          }
        }
        if (key === 'parcels') {
          for (const id of ['parcels-fill-3d', 'parcels-fill-3d-selected', 'parcels-outline', 'parcels-outline-flagged']) {
            if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis(next.parcels))
          }
          if (map.getLayer('parcels-labels')) {
            map.setLayoutProperty('parcels-labels', 'visibility', vis(next.parcels && next.labels))
          }
        }
        if (key === 'detections') {
          for (const id of ['detections-fill', 'detections-outline']) {
            if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis(next.detections))
          }
        }
        if (key === 'labels') {
          if (map.getLayer('esri-labels-layer')) {
            map.setLayoutProperty('esri-labels-layer', 'visibility', vis(basemapRef.current === 'satellite' && next.labels))
          }
          if (map.getLayer('parcels-labels')) {
            map.setLayoutProperty('parcels-labels', 'visibility', vis(next.parcels && next.labels))
          }
        }
      } catch (err) {
        console.warn('[Map3DView] Toggle layer error:', err)
      }

      return next
    })
  }, [loadBuildingsAsync, loadTerrainAsync, syncTerrainForZoom])

  // ── Camera controls ──────────────────────────────────────────────────────

  const adjustZoom = useCallback((d: number) => {
    const map = mapRef.current
    if (!map) return
    const tz = Math.min(INDIA_MAX_ZOOM, Math.max(INDIA_MIN_ZOOM, map.getZoom() + d))
    syncTerrainForZoom(map, tz)
    map.easeTo({ zoom: tz, duration: 250 })
  }, [syncTerrainForZoom])

  const adjustTilt = useCallback((d: number) => {
    const map = mapRef.current
    if (!map) return
    map.easeTo({ pitch: Math.min(85, Math.max(0, map.getPitch() + d)), duration: 250 })
  }, [])

  const adjustBearing = useCallback((d: number) => {
    const map = mapRef.current
    if (!map) return
    map.easeTo({ bearing: map.getBearing() + d, duration: 250 })
  }, [])

  const resetCamera = useCallback(() => {
    mapRef.current?.flyTo({
      center:   INDIA_CENTER,
      zoom:     INDIA_ZOOM,
      pitch:    45,
      bearing:  0,
      duration: 1400,
    })
  }, [])

  const toggleFullscreen = useCallback(() => {
    const el = mapContainer.current?.parentElement
    if (!el) return
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => { /* ignore */ })
      setIsFullscreen(true)
    } else {
      document.exitFullscreen?.().catch(() => { /* ignore */ })
      setIsFullscreen(false)
    }
  }, [])

  // ── India Search (Quick Cities + Local Parcels + Nominatim India) ────────

  const handleSearch = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) {
      setSearchResults([])
      return
    }
    const lower = trimmed.toLowerCase()

    const quick = INDIA_QUICK_LOCATIONS
      .filter(l => l.name.toLowerCase().includes(lower))
      .map(l => ({ ...l, parcel: undefined }))

    const matchedParcels = parcels
      .filter(p =>
        p.parcel_id.toLowerCase().includes(lower) ||
        (p.district || '').toLowerCase().includes(lower) ||
        (p.administrative_area || '').toLowerCase().includes(lower) ||
        (p.state || '').toLowerCase().includes(lower) ||
        (p.address || '').toLowerCase().includes(lower) ||
        (p.owner?.owner_name || '').toLowerCase().includes(lower)
      )
      .slice(0, 6)
      .map(p => ({
        name:   `📍 ${p.parcel_id}${p.district ? ` — ${p.district}` : ''}${p.state ? `, ${p.state}` : ''}`,
        coords: [p.centroid_lng || INDIA_CENTER[0], p.centroid_lat || INDIA_CENTER[1]] as [number, number],
        zoom:   16,
        parcel: p,
      }))

    const combined = [...matchedParcels, ...quick]
    setSearchResults(combined)

    if (combined.length === 0 && trimmed.length >= 3) {
      setIsSearching(true)
      try {
        const isPin = /^\d{6}$/.test(trimmed)
        const url = isPin
          ? `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(trimmed)}&countrycodes=in&format=json&limit=5`
          : `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(trimmed)}&format=json&limit=5&countrycodes=in`
        const res = await fetch(url, { headers: { 'Accept-Language': 'en' } })
        if (res.ok) {
          const data = await res.json() as Array<{ display_name: string; lon: string; lat: string }>
          const remote = data.map(r => ({
            name:   r.display_name.split(',').slice(0, 3).join(', '),
            coords: [parseFloat(r.lon), parseFloat(r.lat)] as [number, number],
            zoom:   14,
            parcel: undefined,
          }))
          setSearchResults(remote)
        }
      } catch {
        // Nominatim failure must not break search input
      } finally {
        setIsSearching(false)
      }
    }
  }, [parcels])

  const flyToResult = useCallback((result: {
    name: string; coords: [number, number]; zoom: number; parcel?: LandParcel
  }) => {
    const map = mapRef.current
    setShowSearchPanel(false)
    setSearchQuery('')
    setSearchResults([])

    if (result.parcel) {
      lastFlownIdRef.current = result.parcel.id
      onParcelSelect(result.parcel)
      setSelectedInfo(result.parcel)
      const det = detections.find(d => d.parcel_id === result.parcel!.id) || null
      setSelectedDetection(det)
      setSelectedBuilding(null)
    }

    if (map) {
      syncTerrainForZoom(map, result.zoom)
      map.flyTo({ center: result.coords, zoom: result.zoom, pitch: 55, duration: 1300 })
      if (markerRef.current) markerRef.current.remove()
      markerRef.current = new maplibregl.Marker({ color: '#ef4444' })
        .setLngLat(result.coords)
        .addTo(map)
    }
  }, [onParcelSelect, detections, syncTerrainForZoom])

  // Retry external providers on demand
  const retryProviders = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    setProviderWarnings([])
    setDismissedWarn(false)
    if (basemapStatus === 'error') {
      switchBasemap(basemap)
      return
    }
    if (buildingStatus === 'error') void loadBuildingsAsync(map, styleGenRef.current)
    if (terrainStatus === 'error') loadTerrainAsync(map, styleGenRef.current)
  }, [basemapStatus, buildingStatus, terrainStatus, basemap, switchBasemap, loadBuildingsAsync, loadTerrainAsync])

  // Counts
  const flaggedCount = useMemo(() => parcels.filter(p => p.is_flagged).length, [parcels])
  const pendingCount = useMemo(() => detections.filter(d => d.review_status === 'Pending Review').length, [detections])

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="relative w-full h-full bg-slate-900 overflow-hidden select-none">

      {/* ── MapLibre Canvas ──────────────────────────────────────────────── */}
      <div ref={mapContainer} className="absolute inset-0 w-full h-full" />

      {/* ── Fatal WebGL Fallback ─────────────────────────────────────────── */}
      {fatalError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-900/95 p-6">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md p-6 text-center space-y-4">
            <AlertTriangle size={36} className="text-amber-500 mx-auto" />
            <h3 className="text-base font-bold text-slate-900">3D Map Unavailable</h3>
            <p className="text-xs text-slate-600 leading-relaxed">{fatalError}</p>
            <button
              onClick={onClose}
              className="w-full py-2.5 bg-indigo-600 text-white text-xs font-semibold rounded-xl hover:bg-indigo-700"
            >
              Switch Back to 2D Leaflet Map
            </button>
          </div>
        </div>
      )}

      {/* ── Top Toolbar ──────────────────────────────────────────────────── */}
      <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center gap-2 pointer-events-none">

        {/* Back to 2D */}
        <button
          onClick={onClose}
          id="map3d-back-2d-btn"
          className="pointer-events-auto flex items-center gap-1.5 bg-white/95 backdrop-blur
                     text-slate-700 text-xs font-semibold px-3 py-2 rounded-xl shadow-lg
                     border border-slate-200 hover:bg-white transition-all"
        >
          <Map size={13} /> 2D Map
        </button>

        {/* India Search */}
        <div className="pointer-events-auto flex-1 min-w-[180px] max-w-sm relative">
          <div className="flex items-center bg-white/95 backdrop-blur rounded-xl shadow-lg border border-slate-200 px-3 py-2 gap-2">
            <Search size={13} className="text-slate-400 shrink-0" />
            <input
              id="map3d-search-input"
              className="flex-1 text-xs bg-transparent outline-none text-slate-800 placeholder-slate-400"
              placeholder="Search state, district, village, parcel ID…"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); void handleSearch(e.target.value) }}
              onFocus={() => setShowSearchPanel(true)}
            />
            {isSearching && (
              <div className="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin" />
            )}
            {(searchQuery || showSearchPanel) && (
              <button
                onClick={() => { setSearchQuery(''); setSearchResults([]); setShowSearchPanel(false) }}
                className="text-slate-400 hover:text-slate-600"
                title="Close search"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {showSearchPanel && searchResults.length > 0 && (
            <div className="absolute top-full mt-1 left-0 right-0 bg-white/95 backdrop-blur
                            rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50 max-h-60 overflow-y-auto">
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

          {showSearchPanel && searchResults.length === 0 && searchQuery.length === 0 && (
            <div className="absolute top-full mt-1 left-0 right-0 bg-white/95 backdrop-blur
                            rounded-xl shadow-xl border border-slate-200 p-2.5 z-50">
              <div className="text-[10px] text-slate-400 uppercase font-semibold mb-1.5 px-1">Quick India Jump</div>
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
            { key: 'satellite', icon: <Satellite size={12} />, label: 'Sat' },
            { key: 'street',    icon: <Map       size={12} />, label: 'Street' },
            { key: 'terrain',   icon: <Globe     size={12} />, label: 'Topo' },
            { key: 'dark',      icon: <Globe     size={12} />, label: 'Dark' },
          ] as Array<{ key: BasemapStyle; icon: React.ReactNode; label: string }>).map(b => (
            <button
              key={b.key}
              onClick={() => switchBasemap(b.key)}
              className={`flex items-center gap-1 px-2.5 py-2 text-[10px] font-medium transition-colors
                ${basemap === b.key ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {b.icon} {b.label}
            </button>
          ))}
        </div>

        {/* Stat badges */}
        <div className="pointer-events-auto hidden sm:flex gap-1.5">
          {flaggedCount > 0 && (
            <div className="flex items-center gap-1 bg-red-600/90 backdrop-blur text-white text-[10px]
                            font-semibold px-2.5 py-1.5 rounded-xl shadow-lg">
              <AlertTriangle size={10} /> {flaggedCount} Flagged
            </div>
          )}
          {pendingCount > 0 && (
            <div className="flex items-center gap-1 bg-amber-500/90 backdrop-blur text-white text-[10px]
                            font-semibold px-2.5 py-1.5 rounded-xl shadow-lg">
              <Clock size={10} /> {pendingCount} Pending
            </div>
          )}
        </div>

        {/* Fullscreen */}
        <button
          onClick={toggleFullscreen}
          className="pointer-events-auto map-ctrl-btn"
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen 3D'}
        >
          {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>

      {/* ── External Provider Warnings Banner (Non-Blocking) ─────────────── */}
      {providerWarnings.length > 0 && !dismissedWarn && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 max-w-lg w-[92%]
                        bg-amber-50/95 backdrop-blur border border-amber-300 rounded-xl shadow-lg
                        px-3 py-2 flex items-start gap-2 text-xs text-amber-900">
          <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-0.5">
            {providerWarnings.map((w, idx) => (
              <div key={idx}>{w}</div>
            ))}
          </div>
          <button
            onClick={retryProviders}
            className="text-amber-800 hover:text-amber-950 font-semibold flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded hover:bg-amber-200/60"
            title="Retry external data providers"
          >
            <RefreshCw size={11} /> Retry
          </button>
          <button
            onClick={() => setDismissedWarn(true)}
            className="text-amber-600 hover:text-amber-900 shrink-0"
            title="Dismiss"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── Right: Camera Controls ───────────────────────────────────────── */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-1.5">
        <button
          onClick={() => mapRef.current?.easeTo({ bearing: 0, duration: 400 })}
          className="map-ctrl-btn"
          title="Reset bearing North"
        >
          <div
            className="relative w-5 h-5 flex items-center justify-center"
            style={{ transform: `rotate(${-bearing}deg)`, transition: 'transform 0.2s' }}
          >
            <Compass size={18} className="text-slate-700" />
          </div>
        </button>

        <div className="w-px h-2 bg-slate-200 mx-auto" />

        <button onClick={() => adjustZoom(1)}  className="map-ctrl-btn" title="Zoom in">
          <ZoomIn size={15} />
        </button>
        <button onClick={() => adjustZoom(-1)} className="map-ctrl-btn" title="Zoom out">
          <ZoomOut size={15} />
        </button>

        <div className="w-px h-2 bg-slate-200 mx-auto" />

        <button onClick={() => adjustTilt(10)}  className="map-ctrl-btn" title="Tilt camera up">
          <ChevronUp size={15} />
        </button>
        <button onClick={() => adjustTilt(-10)} className="map-ctrl-btn" title="Tilt camera down">
          <ChevronDown size={15} />
        </button>

        <div className="w-px h-2 bg-slate-200 mx-auto" />

        <button onClick={() => adjustBearing(-15)} className="map-ctrl-btn" title="Rotate left">↺</button>
        <button onClick={() => adjustBearing(15)}  className="map-ctrl-btn" title="Rotate right">↻</button>

        <div className="w-px h-2 bg-slate-200 mx-auto" />

        <button onClick={resetCamera} className="map-ctrl-btn" title="Reset camera to All India">
          <RotateCcw size={14} />
        </button>
      </div>

      {/* ── Left: Layer & Data Source Buttons ────────────────────────────── */}
      <div className="absolute left-3 top-16 z-10 flex flex-col gap-1.5">
        <button
          onClick={() => { setShowLayerPanel(p => !p); setShowDataPanel(false) }}
          className={`map-ctrl-btn ${showLayerPanel ? '!bg-blue-600 !text-white !border-blue-600' : ''}`}
          title="Map layers"
        >
          <Layers size={15} />
        </button>
        <button
          onClick={() => { setShowDataPanel(p => !p); setShowLayerPanel(false) }}
          className={`map-ctrl-btn ${showDataPanel ? '!bg-blue-600 !text-white !border-blue-600' : ''}`}
          title="Data sources & status"
        >
          <Database size={15} />
        </button>
      </div>

      {/* ── Layer Panel ──────────────────────────────────────────────────── */}
      {showLayerPanel && (
        <div className="absolute left-14 top-14 z-20 bg-white/95 backdrop-blur
                        rounded-2xl shadow-xl border border-slate-200 p-3 w-52 max-h-[calc(100%-6rem)] overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <Layers size={12} /> Map Layers
            </span>
            <button onClick={() => setShowLayerPanel(false)} className="text-slate-400 hover:text-slate-700">
              <X size={13} />
            </button>
          </div>
          <div className="space-y-1">
            {([
              { key: 'buildings',  label: 'OSM 3D Buildings (z13+)', icon: <Building2     size={12} /> },
              { key: 'terrain',    label: 'Terrain Relief (z≤14)',   icon: <Mountain      size={12} /> },
              { key: 'parcels',    label: 'Land Parcels (3D)',       icon: <MapPin        size={12} /> },
              { key: 'detections', label: 'Encroachments',           icon: <AlertTriangle size={12} /> },
              { key: 'labels',     label: 'Geographic Labels',       icon: <Globe         size={12} /> },
            ] as Array<{ key: keyof LayerState; label: string; icon: React.ReactNode }>).map(l => (
              <button
                key={l.key}
                onClick={() => toggleLayer(l.key)}
                className="w-full flex items-center justify-between px-2 py-1
                           rounded-lg hover:bg-slate-50 transition-colors"
              >
                <span className="flex items-center gap-2 text-[11px] text-slate-700">
                  {l.icon} {l.label}
                </span>
                {layers[l.key]
                  ? <Eye    size={13} className="text-blue-500" />
                  : <EyeOff size={13} className="text-slate-300" />
                }
              </button>
            ))}
          </div>

          <div className="mt-2 pt-2 border-t border-slate-100">
            <div className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Map style</div>
            <div className="grid grid-cols-2 gap-1">
              {([
                { k: 'satellite', label: 'Satellite' },
                { k: 'street',    label: 'Street' },
                { k: 'terrain',   label: 'Topo' },
                { k: 'dark',      label: 'Dark' },
              ] as Array<{ k: BasemapStyle; label: string }>).map(b => (
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

      {/* ── Data Sources Panel ───────────────────────────────────────────── */}
      {showDataPanel && (
        <div className="absolute left-14 top-16 z-20 bg-white/95 backdrop-blur
                        rounded-2xl shadow-xl border border-slate-200 p-4 w-72 max-h-[calc(100%-6rem)] overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <Database size={12} /> Data Sources &amp; Status
            </span>
            <button onClick={() => setShowDataPanel(false)} className="text-slate-400 hover:text-slate-700">
              <X size={13} />
            </button>
          </div>
          <div className="space-y-2.5">
            {[
              {
                label: 'Satellite / Base Imagery',
                src:   'ESRI World Imagery (XYZ)',
                status: basemapStatus === 'ready' ? 'Live' : basemapStatus === 'error' ? 'Unavailable' : 'Loading',
                note:  'Primary base map — free XYZ tiles',
                color: basemapStatus === 'ready' ? '#22c55e' : basemapStatus === 'error' ? '#ef4444' : '#3b82f6',
              },
              {
                label: '3D Building Data',
                src:   'OpenStreetMap via OpenFreeMap',
                status: buildingStatus === 'ready' ? 'Live (z13+)' : buildingStatus === 'error' ? 'Unavailable' : 'Loading',
                note:  'OSM render_height where tagged; 10 m nominal otherwise',
                color: buildingStatus === 'ready' ? '#22c55e' : buildingStatus === 'error' ? '#ef4444' : '#3b82f6',
              },
              {
                label: '3D Terrain Elevation',
                src:   'AWS Open Data Terrarium DEM',
                status: terrainStatus === 'ready' ? 'Live' : terrainStatus === 'error' ? 'Unavailable' : 'Loading',
                note:  'Loaded separately from base satellite map',
                color: terrainStatus === 'ready' ? '#22c55e' : terrainStatus === 'error' ? '#ef4444' : '#3b82f6',
              },
              {
                label: 'Land Parcel Boundaries',
                src:   'LandGuard DB (registered cadastral records)',
                status: `${parcels.length} parcels`,
                note:  'Authoritative DB geometries (not from satellite tiles)',
                color: '#3b82f6',
              },
              {
                label: 'Encroachment Detections',
                src:   'LandGuard Detection Engine',
                status: `${detections.length} records`,
                note:  'Preliminary — requires authorized field verification',
                color: '#eab308',
              },
            ].map((d, i) => (
              <div key={i} className="bg-slate-50 rounded-xl p-2.5">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-semibold text-slate-700">{d.label}</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                        style={{ background: d.color + '22', color: d.color }}>
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
        <div className="hidden sm:block absolute bottom-11 left-3 z-10 bg-white/95 backdrop-blur rounded-2xl
                        shadow-xl border border-slate-200 p-2.5 w-48">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-slate-700 flex items-center gap-1">
              <Layers size={10} /> Legend
            </span>
            <button onClick={() => setShowLegend(false)} className="text-slate-400 hover:text-slate-600">
              <X size={11} />
            </button>
          </div>

          <div className="text-[9px] text-slate-400 uppercase font-semibold mb-1">Land Use</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 mb-2">
            {Object.entries(LAND_USE_COLORS).map(([k, c]) => (
              <div key={k} className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: c }} />
                <span className="text-[9px] text-slate-600 truncate">{k}</span>
              </div>
            ))}
          </div>

          <div className="text-[9px] text-slate-400 uppercase font-semibold mb-1 pt-1.5 border-t border-slate-100">
            Detection Pipeline
          </div>
          <div className="space-y-1">
            {DETECTION_PIPELINE.map(p => (
              <div key={p.key} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: p.color }} />
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
          className="hidden sm:flex absolute bottom-11 left-3 z-10 bg-white/95 backdrop-blur px-3 py-1.5
                     rounded-xl border border-slate-200 shadow text-xs text-slate-500
                     items-center gap-1.5 hover:text-slate-800"
        >
          <Layers size={12} /> Legend
        </button>
      )}

      {/* ── Selected Building Info Panel ─────────────────────────────────── */}
      {selectedBuilding && !selectedInfo && (
        <div className="absolute bottom-10 right-14 z-10 bg-white/95 backdrop-blur rounded-2xl
                        border border-slate-200 shadow-xl p-4 w-64">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Building2 size={13} className="text-blue-500" /> OSM 3D Building
            </h3>
            <button onClick={() => setSelectedBuilding(null)} className="text-slate-400 hover:text-slate-700">
              <X size={13} />
            </button>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">Height</span>
              <span className="font-semibold text-slate-800">
                {selectedBuilding.height.toFixed(1)} m {selectedBuilding.isEstimated ? '(Nominal est.)' : '(OSM)'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Base elevation</span>
              <span className="font-semibold text-slate-800">{selectedBuilding.minHeight.toFixed(1)} m</span>
            </div>
            <div className="text-[11px] font-mono text-slate-500 pt-1">
              {selectedBuilding.lngLat[1].toFixed(5)}°N, {selectedBuilding.lngLat[0].toFixed(5)}°E
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] text-amber-700">
              ⚠ Height from OpenStreetMap where mapped; estimated 10 m otherwise. Not legal evidence.
            </div>
          </div>
        </div>
      )}

      {/* ── Parcel & Encroachment Detail Panel (bottom-right, left of camera controls) */}
      {selectedInfo && (
        <div className="absolute bottom-10 right-14 z-10 bg-white/95 backdrop-blur rounded-2xl
                        border border-slate-200 shadow-xl p-4 w-72 max-h-[calc(100%-6.5rem)] overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <MapPin size={13} className="text-blue-500" /> Parcel Details
            </h3>
            <button
              onClick={() => { setSelectedInfo(null); setSelectedDetection(null) }}
              className="text-slate-400 hover:text-slate-700"
            >
              <X size={14} />
            </button>
          </div>

          <div className="bg-blue-50 rounded-xl px-3 py-2 mb-3">
            <div className="text-[10px] text-blue-500 font-semibold uppercase">Parcel ID / Survey Ref</div>
            <div className="font-mono text-blue-700 font-bold text-sm">{selectedInfo.parcel_id}</div>
          </div>

          {selectedInfo.is_flagged && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3
                            flex items-center gap-2 text-red-700 text-xs">
              <AlertTriangle size={13} />
              <span className="font-semibold">Potential Encroachment</span>
              <span className="text-red-500">
                ({selectedInfo.detection_count} finding{selectedInfo.detection_count !== 1 ? 's' : ''})
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs mb-3">
            {[
              ['Land Use',  selectedInfo.registered_land_use || 'Data unavailable'],
              ['Reg. Area', selectedInfo.registered_area_sqm ? `${selectedInfo.registered_area_sqm.toFixed(0)} m²` : 'Data unavailable'],
              ['District',  selectedInfo.district || 'Data unavailable'],
              ['State',     selectedInfo.state || 'Data unavailable'],
              ['Owner',     selectedInfo.owner?.owner_name || 'Requires verification'],
              ['Status',    selectedInfo.review_status || 'Active'],
            ].map(([label, val]) => (
              <div key={label}>
                <div className="text-slate-400">{label}</div>
                <div className="text-slate-700 font-semibold truncate" title={String(val)}>{val}</div>
              </div>
            ))}
          </div>

          {selectedInfo.centroid_lat && selectedInfo.centroid_lng && (
            <div className="bg-slate-50 rounded-xl px-3 py-2 mb-3">
              <div className="text-[10px] text-slate-400 font-semibold uppercase mb-0.5">Coordinates</div>
              <div className="font-mono text-slate-600 text-[11px]">
                {selectedInfo.centroid_lat.toFixed(6)}°N, {selectedInfo.centroid_lng.toFixed(6)}°E
              </div>
            </div>
          )}

          {selectedInfo.address && (
            <div className="text-xs text-slate-500 mb-2">
              <span className="text-slate-400">Location: </span>{selectedInfo.address}
            </div>
          )}

          {selectedDetection && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <div className="text-[10px] text-slate-400 uppercase font-semibold mb-2 flex items-center gap-1">
                <AlertTriangle size={10} className="text-amber-500" /> Encroachment Analysis
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Registered Area</span>
                  <span className="font-semibold">
                    {selectedDetection.registered_area_sqm != null
                      ? `${selectedDetection.registered_area_sqm.toFixed(0)} m²`
                      : 'Data unavailable'}
                  </span>
                </div>
                {selectedDetection.observed_area_sqm != null && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Observed Area</span>
                    <span className="font-semibold">{selectedDetection.observed_area_sqm.toFixed(0)} m²</span>
                  </div>
                )}
                {selectedDetection.overlap_area_sqm != null && (
                  <div className="flex justify-between text-red-700">
                    <span>Potential Overlap</span>
                    <span className="font-bold">{selectedDetection.overlap_area_sqm.toFixed(1)} m²</span>
                  </div>
                )}
                {selectedDetection.area_difference_pct != null && (
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
                  <span
                    className="font-semibold"
                    style={{ color: DETECTION_STATUS_COLORS[selectedDetection.review_status] }}
                  >
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

          {selectedInfo.is_simulated && (
            <div className="mt-2 text-[10px] text-slate-400 italic text-center">
              Simulated record — demonstration only
            </div>
          )}
        </div>
      )}

      {/* ── Camera Telemetry Bar ─────────────────────────────────────────── */}
      <div className="absolute bottom-2.5 left-3 z-10 bg-black/70 backdrop-blur
                      text-white text-[10px] px-3 py-1 rounded-full flex items-center gap-2.5 whitespace-nowrap
                      max-w-[calc(100%-12rem)] shadow">
        <span>Zoom {zoom.toFixed(1)}</span>
        <span>Pitch {tilt}°</span>
        <span>Bearing {((bearing % 360) + 360) % 360}°</span>
        {layers.buildings && zoom < 13 && (
          <span className="text-sky-300 hidden md:inline">Zoom ≥13 for 3D buildings</span>
        )}
      </div>

      {/* ── Brief Initializer Overlay (Guaranteed Auto-Clear) ────────────── */}
      {!mapReady && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 z-20 pointer-events-none">
          <div className="text-white text-sm flex items-center gap-3 mb-2">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Initializing 3D India satellite map…
          </div>
          <div className="text-slate-400 text-xs">Loading ESRI imagery first; buildings &amp; terrain stream separately</div>
        </div>
      )}
    </div>
  )
}
