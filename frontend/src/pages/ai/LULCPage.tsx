/**
 * LULC Classification page — Model 3.
 * Runs scikit-learn Random Forest classifier on parcels (simulated geometric features).
 * Displays colour-coded GeoJSON overlay on a Leaflet map + results table.
 */
import React, { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, GeoJSON, Tooltip } from 'react-leaflet'
import {
  Layers, Play, ChevronLeft, AlertTriangle, Download, Info, CheckCircle2, Loader2,
} from 'lucide-react'
import { aiModelsAPI } from '../../services/api'
import type { AIModelRun } from '../../types'
import 'leaflet/dist/leaflet.css'

// Colour map — mirrors backend LULC_COLORS
const LULC_COLORS: Record<string, string> = {
  'Residential': '#ef4444',
  'Commercial':  '#f97316',
  'Agriculture': '#22c55e',
  'Road':        '#6b7280',
  'Water Body':  '#3b82f6',
  'Forest':      '#16a34a',
  'Industrial':  '#8b5cf6',
  'Other':       '#d97706',
  'Unknown':     '#9ca3af',
}

interface LULCFeatureProps {
  parcel_id: string
  id: string
  land_use: string
  confidence: number
  color: string
  registered_land_use: string
  area_sqm: number
  district: string
}

export default function LULCPage() {
  const navigate = useNavigate()
  const [run, setRun] = useState<AIModelRun | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRun = useCallback(async () => {
    setRunning(true)
    setError(null)
    setRun(null)
    try {
      const res = await aiModelsAPI.runLULC()
      // Merge API shape into AIModelRun
      setRun({
        ...res.data,
        status: 'completed',
        output_summary: res.data.summary,
        result_geojson: res.data.geojson,
      } as AIModelRun)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg ?? 'LULC analysis failed. Check backend connection.')
    } finally {
      setRunning(false)
    }
  }, [])

  const features = (run?.result_geojson as { features?: unknown[] } | undefined)?.features ?? []

  // Download CSV
  const downloadCSV = () => {
    if (!features.length) return
    const header = 'parcel_id,land_use,confidence,registered_land_use,area_sqm,district'
    const rows = features.map((f: unknown) => {
      const feat = f as { properties: LULCFeatureProps }
      const p = feat.properties
      return `${p.parcel_id},${p.land_use},${p.confidence},${p.registered_land_use},${p.area_sqm ?? ''},${p.district ?? ''}`
    })
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'lulc_classification.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const summary = run?.output_summary as {
    parcels_classified?: number; parcels_total?: number; average_confidence?: number; disclaimer?: string
  } | undefined

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/ai-models')}
          className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition">
          <ChevronLeft size={16} />
        </button>
        <div className="p-2 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600">
          <Layers size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Land Use &amp; Land Cover (LULC) Classification</h1>
          <p className="text-slate-400 text-xs">Model 3 · Geometric Feature Classifier · scikit-learn Random Forest</p>
        </div>
      </div>

      {/* Disclaimer banner */}
      <div className="bg-amber-950/40 border border-amber-700/60 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle size={18} className="text-amber-400 mt-0.5 shrink-0" />
        <div className="text-amber-300 text-xs leading-relaxed">
          <strong>SIMULATED MODEL —</strong> This classifier is trained on synthetic geometric features only.
          It does NOT use real satellite imagery. Classifications are for demonstration purposes and do not
          reflect actual on-ground land use.
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleRun}
          disabled={running}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition disabled:opacity-50"
        >
          {running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
          {running ? 'Running Classification…' : 'Run LULC Classification'}
        </button>
        {features.length > 0 && (
          <button
            onClick={downloadCSV}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm transition"
          >
            <Download size={14} /> Download CSV
          </button>
        )}
        {run?.status === 'completed' && (
          <span className="flex items-center gap-1.5 text-green-400 text-sm">
            <CheckCircle2 size={15} /> Classification complete
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 text-red-300 text-sm">{error}</div>
      )}

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Parcels Classified', value: summary.parcels_classified ?? 0, color: 'text-green-400' },
            { label: 'Total Parcels',      value: summary.parcels_total ?? 0,      color: 'text-blue-400' },
            { label: 'Avg Confidence',     value: `${((summary.average_confidence ?? 0) * 100).toFixed(1)}%`, color: 'text-purple-400' },
          ].map(s => (
            <div key={s.label} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-slate-400 text-xs mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Map + Legend */}
      {features.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 rounded-xl overflow-hidden border border-slate-700" style={{ height: 460 }}>
            <MapContainer
              center={[17.3850, 78.4867]}
              zoom={11}
              style={{ height: '100%', width: '100%' }}
              zoomControl
            >
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                attribution="ESRI World Imagery"
              />
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
                attribution="ESRI Reference Labels"
              />
              <GeoJSON
                key={run?.id}
                data={run!.result_geojson as Parameters<typeof GeoJSON>[0]['data']}
                style={(feature) => ({
                  color: (feature?.properties as LULCFeatureProps)?.color ?? '#9ca3af',
                  fillColor: (feature?.properties as LULCFeatureProps)?.color ?? '#9ca3af',
                  weight: 2,
                  opacity: 0.9,
                  fillOpacity: 0.45,
                })}
                onEachFeature={(feature, layer) => {
                  const p = feature.properties as LULCFeatureProps
                  layer.bindTooltip(
                    `<b>${p.parcel_id}</b><br/>Land Use: ${p.land_use}<br/>Confidence: ${(p.confidence * 100).toFixed(0)}%`,
                    { permanent: false, className: 'leaflet-tooltip-dark' }
                  )
                }}
              />
            </MapContainer>
          </div>

          {/* Legend */}
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5">
            <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
              <Info size={15} className="text-indigo-400" /> Land Use Legend
            </h3>
            <div className="space-y-2">
              {Object.entries(LULC_COLORS).map(([cat, color]) => (
                <div key={cat} className="flex items-center gap-2 text-xs text-slate-300">
                  <span className="w-4 h-4 rounded shrink-0" style={{ background: color }} />
                  {cat}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Results table */}
      {features.length > 0 && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-700 text-sm font-semibold text-white">
            Classification Results ({features.length} parcels)
          </div>
          <div className="overflow-x-auto max-h-72">
            <table className="w-full text-xs">
              <thead className="bg-slate-900/50">
                <tr>
                  {['Parcel ID', 'Classified Land Use', 'Confidence', 'Registered Use', 'Area (m²)', 'District'].map(h => (
                    <th key={h} className="px-4 py-2 text-left text-slate-400 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {features.map((f: unknown) => {
                  const feat = f as { properties: LULCFeatureProps }
                  const p = feat.properties
                  return (
                    <tr key={p.parcel_id} className="hover:bg-slate-700/30">
                      <td className="px-4 py-2 text-slate-300 font-mono">{p.parcel_id}</td>
                      <td className="px-4 py-2">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />
                          <span className="text-slate-200">{p.land_use}</span>
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-slate-700 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-green-500"
                              style={{ width: `${(p.confidence * 100).toFixed(0)}%` }}
                            />
                          </div>
                          <span className="text-slate-300">{(p.confidence * 100).toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-slate-400">{p.registered_land_use}</td>
                      <td className="px-4 py-2 text-slate-400">{p.area_sqm ? p.area_sqm.toFixed(0) : '—'}</td>
                      <td className="px-4 py-2 text-slate-400">{p.district ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Idle state */}
      {!running && !run && !error && (
        <div className="text-center py-14 text-slate-500">
          <Layers size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Click "Run LULC Classification" to classify all registered parcels.</p>
        </div>
      )}
    </div>
  )
}

