/**
 * Waterbody Monitoring page — Model 6.
 * Fetches OpenStreetMap waterbody polygons for the parcel region via Overpass API.
 * Displays blue polygons on the GIS map.
 * Note: Requires backend network access to reach overpass-api.de
 */
import React, { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet'
import {
  Droplets, ChevronLeft, AlertTriangle, Loader2, CheckCircle2, Info, RefreshCw,
} from 'lucide-react'
import { aiModelsAPI } from '../../services/api'
import type { AIModelRun } from '../../types'
import 'leaflet/dist/leaflet.css'

interface WaterbodyProps {
  osm_id: number
  name: string
  natural?: string
  waterway?: string
  color: string
  fill_opacity: number
}

export default function WaterbodyPage() {
  const navigate = useNavigate()
  const [run, setRun] = useState<AIModelRun | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFetch = useCallback(async () => {
    setRunning(true)
    setError(null)
    setRun(null)
    try {
      const res = await aiModelsAPI.fetchWaterbodies()
      setRun({
        ...res.data,
        status: 'completed',
        output_summary: res.data.summary,
        result_geojson: res.data.geojson,
      } as AIModelRun)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string; hint?: string; error?: string } } })?.response?.data
      const msg = detail?.error ?? 'Waterbody fetch failed.'
      const hint = detail?.hint
      setError(hint ? `${msg}\n\n${hint}` : msg)
    } finally {
      setRunning(false)
    }
  }, [])

  const features = (
    run?.result_geojson as { features?: unknown[] } | undefined
  )?.features ?? []

  const summary = run?.output_summary as {
    waterbodies_found?: number
    source?: string
    disclaimer?: string
    bbox?: { min_lat: number; max_lat: number; min_lng: number; max_lng: number }
  } | undefined

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/ai-models')}
          className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition">
          <ChevronLeft size={16} />
        </button>
        <div className="p-2 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600">
          <Droplets size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">River &amp; Waterbody Monitoring</h1>
          <p className="text-slate-400 text-xs">Model 6 · OpenStreetMap Overpass API · Free / CC BY-SA</p>
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-blue-950/40 border border-blue-700/60 rounded-xl p-4 flex items-start gap-3">
        <Info size={18} className="text-blue-400 mt-0.5 shrink-0" />
        <div className="text-blue-300 text-xs leading-relaxed">
          <strong>DATA SOURCE:</strong> This model fetches waterbody polygons (rivers, lakes, ponds,
          canals) from OpenStreetMap via the Overpass API. Data is community-maintained under the
          CC BY-SA licence. It is NOT authoritative hydrological data and may be incomplete.
          <br /><strong>Network access required</strong> — the backend must have outbound internet connectivity.
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleFetch}
          disabled={running}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition disabled:opacity-50"
        >
          {running ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          {running ? 'Fetching from OpenStreetMap…' : (run ? 'Re-fetch Waterbodies' : 'Fetch Waterbodies (OSM)')}
        </button>
        {run?.status === 'completed' && (
          <span className="flex items-center gap-1.5 text-green-400 text-sm">
            <CheckCircle2 size={15} /> Fetch complete
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 text-red-300 text-xs whitespace-pre-line">{error}</div>
      )}

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: 'Waterbodies Found', value: summary.waterbodies_found ?? 0, color: 'text-sky-400' },
            { label: 'Data Source',       value: summary.source ?? 'OSM',        color: 'text-blue-400' },
          ].map(s => (
            <div key={s.label} className="glass-card rounded-xl p-4 text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-slate-400 text-xs mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Map */}
      {run?.result_geojson && (
        <div className="rounded-xl overflow-hidden border border-slate-700" style={{ height: 480 }}>
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
              key={run.id ?? 'waterbody'}
              data={run.result_geojson as Parameters<typeof GeoJSON>[0]['data']}
              style={() => ({
                color: '#3b82f6',
                fillColor: '#60a5fa',
                weight: 2,
                opacity: 0.9,
                fillOpacity: 0.4,
              })}
              onEachFeature={(feature, layer) => {
                const p = feature.properties as WaterbodyProps
                layer.bindTooltip(
                  `<b>${p.name ?? 'Unnamed'}</b><br/>${p.natural ?? p.waterway ?? 'Water body'}`,
                  { permanent: false }
                )
              }}
            />
          </MapContainer>
        </div>
      )}

      {/* Waterbody list */}
      {features.length > 0 && (
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-700 text-sm font-semibold text-white">
            Detected Waterbodies ({features.length})
          </div>
          <div className="overflow-x-auto max-h-56">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {['Name', 'Type', 'OSM ID'].map(h => (
                    <th key={h} className="px-4 py-2 text-left text-slate-400 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {features.map((f: unknown) => {
                  const feat = f as { properties: WaterbodyProps }
                  const p = feat.properties
                  return (
                    <tr key={p.osm_id} className="hover:bg-blue-50/40">
                      <td className="px-4 py-2 text-slate-300">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                          {p.name ?? 'Unnamed waterbody'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-400 capitalize">{p.natural ?? p.waterway ?? '—'}</td>
                      <td className="px-4 py-2 text-slate-500 font-mono">{p.osm_id}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Disclaimer */}
      {summary?.disclaimer && (
        <div className="glass-card rounded-xl bg-slate-50/50 p-4 text-xs text-slate-500">
          {summary.disclaimer}
        </div>
      )}

      {!running && !run && !error && (
        <div className="text-center py-14 text-slate-500">
          <Droplets size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Click "Fetch Waterbodies" to retrieve OpenStreetMap waterbody data<br />for the area covered by registered land parcels.</p>
          <p className="text-xs mt-2 text-slate-600">Requires backend internet access to overpass-api.de</p>
        </div>
      )}
    </div>
  )
}

