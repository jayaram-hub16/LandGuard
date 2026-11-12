// Parcel Detail Page — view a single land parcel with its map, owner info, and detection records
import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet'
import {
  ArrowLeft, AlertTriangle, MapPin, FileText, User,
  Edit, Loader2, Download, Printer, History, Layers
} from 'lucide-react'
import api, { parcelsAPI, detectionsAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import type { LandParcel, EncroachmentDetection } from '../../types'
import 'leaflet/dist/leaflet.css'

export default function ParcelDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const [parcel, setParcel] = useState<LandParcel | null>(null)
  const [detections, setDetections] = useState<EncroachmentDetection[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [boundaryHistory, setBoundaryHistory] = useState<{
    id: string; changed_by?: string; actor_name: string;
    old_area_sqm?: number; new_area_sqm?: number;
    change_reason?: string; changed_at?: string;
  }[]>([])

  useEffect(() => {
    if (!id) return
    const fetchData = async () => {
      try {
        const [pRes, dRes, hRes] = await Promise.all([
          parcelsAPI.get(id),
          detectionsAPI.list({ per_page: 50 }),
          api.get(`/parcels/${id}/boundary-history`).catch(() => ({ data: { history: [] } })),
        ])
        const fetchedParcel: LandParcel = pRes.data
        setParcel(fetchedParcel)
        setBoundaryHistory(hRes.data.history || [])
        const allDetections: EncroachmentDetection[] = dRes.data.detections || []
        setDetections(
          allDetections.filter(
            (d) =>
              d.parcel?.parcel_id === id ||
              d.parcel_id === fetchedParcel.id
          )
        )
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status
        if (status === 404) setNotFound(true)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [id])

  const handleDownloadPdf = async () => {
    if (!parcel) return
    setDownloading(true)
    try {
      const res = await parcelsAPI.downloadPdf(parcel.parcel_id)
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `LandRecord_${parcel.parcel_id}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch {
      alert('PDF download failed. Ensure the backend is running and reportlab is installed.')
    } finally {
      setDownloading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-slate-500" />
      </div>
    )
  }

  if (notFound || !parcel) {
    return (
      <div className="text-center py-20">
        <FileText size={40} className="text-slate-300 mx-auto mb-3" />
        <p className="text-slate-400">Parcel not found.</p>
        <button onClick={() => navigate('/parcels')} className="btn-secondary mt-4 text-sm px-4 py-2">
          Back to Parcels
        </button>
      </div>
    )
  }

  const mapCenter: [number, number] =
    parcel.centroid_lat != null && parcel.centroid_lng != null
      ? [parcel.centroid_lat, parcel.centroid_lng]
      : [20.5937, 78.9629]

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/parcels')}
          className="btn-ghost p-2"
          id="parcel-back-btn"
          aria-label="Back to parcels"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-slate-900 font-mono">{parcel.parcel_id}</h1>
            {parcel.is_flagged && (
              <span className="badge badge-critical">
                <AlertTriangle size={12} /> Flagged
              </span>
            )}
            {parcel.is_simulated && (
              <span className="badge badge-user text-[10px]">SIMULATED</span>
            )}
          </div>
          <p className="text-slate-400 text-sm mt-0.5">
            {parcel.address || [parcel.district, parcel.state].filter(Boolean).join(', ') || '—'}
          </p>
        </div>
        {isAdmin() && (
          <button
            className="btn-secondary flex items-center gap-2 text-sm"
            id="parcel-edit-btn"
          >
            <Edit size={15} /> Edit
          </button>
        )}
        <button
          onClick={handleDownloadPdf}
          disabled={downloading}
          className="btn-secondary flex items-center gap-2 text-sm"
          id="parcel-download-pdf-btn"
        >
          {downloading
            ? <Loader2 size={15} className="animate-spin" />
            : <Download size={15} />}
          {downloading ? 'Generating...' : 'Download PDF'}
        </button>
        <button
          onClick={() => window.print()}
          className="btn-secondary flex items-center gap-2 text-sm"
          id="parcel-print-btn"
        >
          <Printer size={15} /> Print
        </button>
      </div>

      {/* ── Encroachment warning ── */}
      {parcel.is_flagged && (
        <div className="disclaimer-box">
          <div className="flex items-start gap-2">
            <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">⚠ Potential Encroachment Detected</div>
              <div className="mt-1">
                This parcel has {detections.length} detection record
                {detections.length !== 1 ? 's' : ''}. All findings are{' '}
                <strong>PRELIMINARY</strong> and require verification by an authorized
                surveyor. This does not constitute proof of illegal activity.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: info + detections */}
        <div className="lg:col-span-2 space-y-4">
          {/* Parcel info */}
          <div className="glass-card p-5">
            <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <FileText size={16} className="text-blue-600" /> Parcel Information
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {(
                [
                  ['Parcel ID', parcel.parcel_id],
                  [
                    'Registered Area',
                    parcel.registered_area_sqm != null
                      ? `${parcel.registered_area_sqm.toFixed(0)} m²`
                      : '—',
                  ],
                  ['District', parcel.district || '—'],
                  ['State', parcel.state || '—'],
                  ['Registered Use', parcel.registered_land_use || '—'],
                  ['Observed Use', parcel.observed_land_use || '—'],
                  ['Review Status', parcel.review_status || '—'],
                  ['Detections', String(parcel.detection_count)],
                  [
                    'Created',
                    parcel.created_at
                      ? new Date(parcel.created_at).toLocaleDateString()
                      : '—',
                  ],
                ] as [string, string][]
              ).map(([label, val]) => (
                <div key={label} className="bg-white/40 rounded-lg p-3">
                  <div className="text-xs text-slate-400 mb-0.5">{label}</div>
                  <div className="text-sm font-semibold text-slate-800 break-words">{val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Owner info */}
          {parcel.owner && (
            <div className="glass-card p-5">
              <h2 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <User size={16} className="text-sky-600" /> Ownership Record
                <span className="badge badge-user text-[10px]">SIMULATED</span>
              </h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-slate-400">Owner Name</div>
                  <div className="text-slate-800 font-medium mt-0.5">{parcel.owner.owner_name}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Owner Reference</div>
                  <div className="font-mono text-blue-600 text-sm mt-0.5">
                    {parcel.owner.owner_reference}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Registration Ref.</div>
                  <div className="text-slate-700 text-sm mt-0.5">
                    {parcel.owner.registration_reference || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Registered Date</div>
                  <div className="text-slate-700 text-sm mt-0.5">
                    {parcel.owner.registered_date || '—'}
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-400 italic mt-3">
                This ownership information is SIMULATED for demonstration only. Do not use for
                legal purposes.
              </p>
            </div>
          )}

          {/* Detection records */}
          {detections.length > 0 && (
            <div className="glass-card overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-200/80">
                <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-400" />
                  Detection Records ({detections.length})
                </h2>
              </div>
              <div className="divide-y divide-slate-100">
                {detections.map((d) => (
                  <div key={d.id} className="p-4 hover:bg-slate-100/20 transition-all">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <span className={`badge badge-${d.severity.toLowerCase()}`}>{d.severity}</span>
                      <span className="text-xs text-slate-400">{d.review_status}</span>
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed">{d.detection_reason}</p>
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      <div className="text-xs">
                        <span className="text-slate-400">Reg. Area: </span>
                        {d.registered_area_sqm != null
                          ? `${d.registered_area_sqm.toFixed(0)} m²`
                          : '—'}
                      </div>
                      <div className="text-xs">
                        <span className="text-slate-400">Obs. Area: </span>
                        {d.observed_area_sqm != null
                          ? `${d.observed_area_sqm.toFixed(0)} m²`
                          : '—'}
                      </div>
                      <div className="text-xs">
                        <span className="text-slate-400">Diff: </span>
                        {d.area_difference_pct != null
                          ? `${d.area_difference_pct.toFixed(1)}%`
                          : '—'}
                      </div>
                    </div>
                    {d.model_confidence != null && (
                      <div className="text-xs text-slate-400 mt-1">
                        Model confidence: {(d.model_confidence * 100).toFixed(0)}% (SIMULATED)
                      </div>
                    )}
                    {d.disclaimer && (
                      <p className="text-xs text-amber-600 mt-2 italic">{d.disclaimer}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Boundary Version History */}
          <div className="glass-card p-5">
            <h2 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <History size={16} className="text-violet-400" /> Boundary Revision History
            </h2>
            {boundaryHistory.length === 0 ? (
              <p className="text-xs text-slate-400 italic">
                Initial boundary registered. No subsequent boundary revisions recorded.
              </p>
            ) : (
              <div className="space-y-3">
                {boundaryHistory.map((h, i) => (
                  <div key={h.id || i} className="bg-white/40 rounded-lg p-3 border border-slate-200/40 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700">Revision by {h.actor_name}</span>
                      <span className="text-slate-400 font-mono">
                        {h.changed_at ? new Date(h.changed_at).toLocaleString() : '—'}
                      </span>
                    </div>
                    {h.change_reason && <p className="text-slate-500 italic">{h.change_reason}</p>}
                    <div className="flex gap-4 text-slate-500 pt-1">
                      {h.old_area_sqm != null && (
                        <span>Previous Area: <strong className="text-slate-800">{h.old_area_sqm.toFixed(0)} m²</strong></span>
                      )}
                      {h.new_area_sqm != null && (
                        <span>Updated Area: <strong className="text-slate-800">{h.new_area_sqm.toFixed(0)} m²</strong></span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: mini-map + coordinates */}
        <div className="space-y-4">
          <div className="glass-card overflow-hidden" style={{ height: 300 }}>
            <MapContainer center={mapCenter} zoom={15} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              />
              {parcel.boundary_geojson && (
                <GeoJSON
                  data={parcel.boundary_geojson as unknown as GeoJSON.GeoJsonObject}
                  style={{
                    color: parcel.is_flagged ? '#ef4444' : '#3b82f6',
                    weight: 2,
                    fillOpacity: 0.2,
                    dashArray: parcel.is_flagged ? '6 4' : undefined,
                  }}
                />
              )}
            </MapContainer>
          </div>

          <div className="glass-card p-4 text-xs text-slate-400">
            <div className="flex items-center gap-1.5 mb-2">
              <MapPin size={12} className="text-blue-600" />
              <span className="font-semibold text-slate-500">Coordinates</span>
            </div>
            <div>Lat: {parcel.centroid_lat?.toFixed(6) ?? '—'}</div>
            <div>Lng: {parcel.centroid_lng?.toFixed(6) ?? '—'}</div>
            <div className="mt-2 italic">
              Basemap: © OpenStreetMap contributors via CARTO
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
