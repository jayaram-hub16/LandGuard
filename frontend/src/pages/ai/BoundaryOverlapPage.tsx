/**
 * Boundary Overlap Analysis page — Model 4.
 * Uses Shapely-based GIS service to detect overlapping parcel boundaries.
 * Displays colour-coded GeoJSON overlay + sortable results table.
 */
import React, { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet'
import {
  Map, Play, ChevronLeft, AlertTriangle, Download, Loader2, CheckCircle2,
} from 'lucide-react'
import { aiModelsAPI } from '../../services/api'
import type { AIModelRun } from '../../types'
import 'leaflet/dist/leaflet.css'

interface OverlapFeatureProps {
  parcel_id: string
  id: string
  has_overlap: boolean
  overlap_count: number
  max_overlap_area_sqm: number
  max_overlap_area_sqft: number
  top_severity: string
  color: string
  district: string
  area_sqm: number
  overlaps: {
    overlapping_parcel_id: string
    overlap_area_sqm: number
    overlap_area_sqft: number
    overlap_pct_this: number
    severity: string
  }[]
}

const SEVERITY_BADGE: Record<string, string> = {
  Critical: 'bg-red-900/50 text-red-300 border border-red-700',
  High:     'bg-orange-900/50 text-orange-300 border border-orange-700',
  Medium:   'bg-amber-900/50 text-amber-300 border border-amber-700',
  Low:      'bg-lime-900/50 text-lime-300 border border-lime-700',
  None:     'bg-green-900/50 text-green-300 border border-green-700',
}

export default function BoundaryOverlapPage() {
  const navigate = useNavigate()
  const [run, setRun] = useState<AIModelRun | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterOverlap, setFilterOverlap] = useState(false)

  const handleRun = useCallback(async () => {
    setRunning(true)
    setError(null)
    setRun(null)
    try {
      const res = await aiModelsAPI.runBoundaryOverlap()
      setRun({
        ...res.data,
        status: 'completed',
        output_summary: res.data.summary,
        result_geojson: res.data.geojson,
      } as AIModelRun)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg ?? 'Boundary overlap analysis failed.')
    } finally {
      setRunning(false)
    }
  }, [])

  const allFeatures: OverlapFeatureProps[] = (
    (run?.result_geojson as { features?: { properties: OverlapFeatureProps }[] } | undefined)?.features ?? []
  ).map(f => f.properties)

  const displayFeatures = filterOverlap ? allFeatures.filter(f => f.has_overlap) : allFeatures
  const summary = run?.output_summary as {
    parcels_analysed?: number; parcels_with_overlap?: number; disclaimer?: string
  } | undefined

  const downloadCSV = () => {
    if (!allFeatures.length) return
    const header = 'parcel_id,has_overlap,overlap_count,max_overlap_area_sqm,max_overlap_area_sqft,top_severity,district'
    const rows = allFeatures.map(p =>
      `${p.parcel_id},${p.has_overlap},${p.overlap_count},${p.max_overlap_area_sqm},${p.max_overlap_area_sqft},${p.top_severity},${p.district ?? ''}`
    )
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'boundary_overlap_analysis.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/ai-models')}
          className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition">
          <ChevronLeft size={16} />
        </button>
        <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600">
          <Map size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">GIS Parcel Boundary Overlap Analysis</h1>
          <p className="text-slate-400 text-xs">Model 4 · Shapely Geometric Intersection · Real boundary data</p>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="bg-blue-950/40 border border-blue-700/60 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle size={18} className="text-blue-400 mt-0.5 shrink-0" />
        <div className="text-blue-300 text-xs leading-relaxed">
          <strong>GEOMETRIC ANALYSIS ONLY —</strong> This is a spatial computation using registered boundary
          coordinates. It does NOT constitute legal proof of encroachment or establish land ownership.
          All findings require verification by an authorised surveyor.
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleRun}
          disabled={running}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition disabled:opacity-50"
        >
          {running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
          {running ? 'Running Analysis…' : 'Run Boundary Overlap Analysis'}
        </button>
        {allFeatures.length > 0 && (
          <>
            <button
              onClick={downloadCSV}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm text-sm transition"
            >
              <Download size={14} /> Download CSV
            </button>
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={filterOverlap}
                onChange={e => setFilterOverlap(e.target.checked)}
                className="w-4 h-4 accent-blue-500"
              />
              Show only parcels with overlaps
            </label>
          </>
        )}
        {run?.status === 'completed' && (
          <span className="flex items-center gap-1.5 text-green-400 text-sm">
            <CheckCircle2 size={15} /> Analysis complete
          </span>
        )}
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 text-red-300 text-sm">{error}</div>
      )}

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: 'Parcels Analysed',     value: summary.parcels_analysed ?? 0,   color: 'text-blue-400' },
            { label: 'Parcels with Overlap', value: summary.parcels_with_overlap ?? 0, color: 'text-red-400' },
          ].map(s => (
            <div key={s.label} className="glass-card rounded-xl p-4 text-center">
              <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-slate-400 text-xs mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Map */}
      {run?.result_geojson && (
        <div className="rounded-xl overflow-hidden border border-slate-700" style={{ height: 460 }}>
          <MapContainer center={[17.3850, 78.4867]} zoom={11} style={{ height: '100%', width: '100%' }} zoomControl>
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="ESRI World Imagery"
            />
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
              attribution="ESRI Reference Labels"
            />
            <GeoJSON
              key={run.id}
              data={run.result_geojson as Parameters<typeof GeoJSON>[0]['data']}
              style={(feature) => {
                const p = feature?.properties as OverlapFeatureProps
                return {
                  color: p?.color ?? '#22c55e',
                  fillColor: p?.color ?? '#22c55e',
                  weight: p?.has_overlap ? 2.5 : 1.5,
                  opacity: 0.9,
                  fillOpacity: p?.has_overlap ? 0.5 : 0.2,
                }
              }}
              onEachFeature={(feature, layer) => {
                const p = feature.properties as OverlapFeatureProps
                layer.bindTooltip(
                  `<b>${p.parcel_id}</b><br/>` +
                  (p.has_overlap
                    ? `Overlaps: ${p.overlap_count} parcel(s)<br/>Max area: ${p.max_overlap_area_sqm.toFixed(1)} m²<br/>Severity: ${p.top_severity}`
                    : 'No overlaps detected'),
                  { permanent: false, className: 'leaflet-tooltip-dark' }
                )
              }}
            />
          </MapContainer>
        </div>
      )}

      {/* Map legend */}
      {run?.result_geojson && (
        <div className="flex items-center gap-4 flex-wrap text-xs text-slate-400">
          {[
            { label: 'No overlap',   color: '#22c55e' },
            { label: 'Low',          color: '#65a30d' },
            { label: 'Medium',       color: '#d97706' },
            { label: 'High',         color: '#ea580c' },
            { label: 'Critical',     color: '#dc2626' },
          ].map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm" style={{ background: color }} />
              {label}
            </div>
          ))}
        </div>
      )}

      {/* Results table */}
      {displayFeatures.length > 0 && (
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-700 text-sm font-semibold text-white">
            Results ({displayFeatures.length} parcels{filterOverlap ? ' with overlaps' : ''})
          </div>
          <div className="overflow-x-auto max-h-80">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {['Parcel ID', 'Overlapping Parcels', 'Max Overlap (m²)', 'Max Overlap (ft²)', 'Overlap %', 'Severity', 'District'].map(h => (
                    <th key={h} className="px-4 py-2 text-left text-slate-400 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {displayFeatures.map(p => (
                  <tr key={p.parcel_id} className="hover:bg-blue-50/40">
                    <td className="px-4 py-2 text-slate-300 font-mono">{p.parcel_id}</td>
                    <td className="px-4 py-2 text-slate-400">{p.overlap_count}</td>
                    <td className="px-4 py-2 text-slate-400">{p.max_overlap_area_sqm.toFixed(1)}</td>
                    <td className="px-4 py-2 text-slate-400">{p.max_overlap_area_sqft.toFixed(1)}</td>
                    <td className="px-4 py-2 text-slate-400">
                      {p.overlaps[0]?.overlap_pct_this?.toFixed(1) ?? '—'}%
                    </td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SEVERITY_BADGE[p.top_severity] ?? SEVERITY_BADGE.None}`}>
                        {p.top_severity}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-400">{p.district ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!running && !run && !error && (
        <div className="text-center py-14 text-slate-500">
          <Map size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Click "Run Boundary Overlap Analysis" to check all parcel boundaries for geometric intersections.</p>
        </div>
      )}
    </div>
  )
}

