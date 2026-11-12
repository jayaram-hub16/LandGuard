// Land Parcels List Page
import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Filter, Plus, AlertTriangle, FileText, ChevronLeft,
  ChevronRight, Loader2, Eye, Trash2, RefreshCw, Map
} from 'lucide-react'
import { parcelsAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import type { LandParcel } from '../../types'
import clsx from 'clsx'

const LAND_USES = ['', 'Residential', 'Commercial', 'Agriculture', 'Road', 'Water Body', 'Forest', 'Industrial', 'Other']

export default function ParcelsPage() {
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const [parcels, setParcels] = useState<LandParcel[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [flaggedOnly, setFlaggedOnly] = useState(false)
  const [landUseFilter, setLandUseFilter] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  useEffect(() => { load() }, [page, flaggedOnly, landUseFilter])

  const load = async (q = search) => {
    setLoading(true)
    try {
      const res = await parcelsAPI.list({
        page, per_page: 20, search: q,
        flagged: flaggedOnly ? 'true' : '',
        land_use: landUseFilter,
      })
      setParcels(res.data.parcels || [])
      setTotal(res.data.total || 0)
      setPages(res.data.pages || 1)
    } catch { /* handled */ }
    finally { setLoading(false) }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    load(search)
  }

  const handleDelete = async (parcelId: string) => {
    try {
      await parcelsAPI.delete(parcelId)
      setDeleteConfirm(null)
      load()
    } catch { /* handled */ }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Land Parcels</h1>
          <p className="text-slate-400 text-sm">{total} registered parcels (simulated)</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate('/map')} className="btn-secondary flex items-center gap-2 text-sm px-3 py-2"
                  id="parcels-map-btn">
            <Map size={15} /> View on Map
          </button>
          {isAdmin() && (
            <button
              onClick={() => navigate('/parcels/new')}
              className="btn-primary flex items-center gap-2 text-sm px-3 py-2"
              id="add-parcel-btn"
            >
              <Plus size={15} /> Add Parcel
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card p-4 flex flex-wrap gap-3 items-end">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-[200px]">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              id="parcel-search-input"
              type="text"
              placeholder="Search parcel ID, district, address..."
              className="input-field pl-9 text-sm py-2"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-primary text-sm px-4 py-2" id="parcel-search-btn">Search</button>
        </form>

        <select
          id="parcels-landuse-filter"
          className="input-field text-sm py-2 w-40"
          value={landUseFilter}
          onChange={e => { setLandUseFilter(e.target.value); setPage(1) }}
        >
          {LAND_USES.map(lu => (
            <option key={lu} value={lu}>{lu || 'All Land Uses'}</option>
          ))}
        </select>

        <button
          id="parcels-flagged-filter"
          onClick={() => { setFlaggedOnly(!flaggedOnly); setPage(1) }}
          className={clsx(
            'flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border transition-all',
            flaggedOnly
              ? 'bg-red-500/20 border-red-500/40 text-red-400'
              : 'bg-white border-slate-300 text-slate-500 hover:border-slate-300'
          )}
        >
          <AlertTriangle size={14} /> Flagged Only
        </button>

        <button onClick={() => load()} className="btn-ghost p-2" title="Refresh">
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-500 gap-2">
              <Loader2 size={18} className="animate-spin" /> Loading parcels...
            </div>
          ) : parcels.length === 0 ? (
            <div className="py-16 text-center">
              <FileText size={40} className="text-slate-300 mx-auto mb-3" />
              <p className="text-slate-400">No parcels found.</p>
              {isAdmin() && (
                <button onClick={() => navigate('/parcels/new')} className="btn-primary mt-4 text-sm px-4 py-2">
                  Add First Parcel
                </button>
              )}
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Parcel ID</th>
                  <th>Owner</th>
                  <th>District</th>
                  <th>State</th>
                  <th>Area (m²)</th>
                  <th>Land Use</th>
                  <th>Flagged</th>
                  <th>Detections</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {parcels.map(p => (
                  <tr key={p.id}>
                    <td>
                      <span className="font-mono text-xs text-blue-600 font-semibold">{p.parcel_id}</span>
                    </td>
                    <td className="text-xs">{p.owner?.owner_name || '—'}</td>
                    <td className="text-xs">{p.district || '—'}</td>
                    <td className="text-xs">{p.state || '—'}</td>
                    <td className="font-mono text-xs">{p.registered_area_sqm?.toFixed(0) || '—'}</td>
                    <td>
                      <span className="text-xs text-slate-700">{p.registered_land_use || '—'}</span>
                    </td>
                    <td>
                      {p.is_flagged
                        ? <span className="badge badge-critical"><AlertTriangle size={10} /> Yes</span>
                        : <span className="text-xs text-slate-400">—</span>}
                    </td>
                    <td>
                      <span className="text-xs font-mono">{p.detection_count}</span>
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => navigate(`/parcels/${p.parcel_id}`)}
                          className="btn-ghost p-1.5 text-slate-500 hover:text-blue-600"
                          title="View"
                          id={`parcel-view-${p.parcel_id}`}
                        >
                          <Eye size={14} />
                        </button>
                        {isAdmin() && (
                          <>
                            {deleteConfirm === p.id ? (
                              <div className="flex items-center gap-1">
                                <button onClick={() => handleDelete(p.parcel_id)}
                                        className="text-xs text-red-400 hover:text-red-300 font-medium">Confirm</button>
                                <button onClick={() => setDeleteConfirm(null)}
                                        className="text-xs text-slate-400 hover:text-slate-700">Cancel</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDeleteConfirm(p.id)}
                                className="btn-ghost p-1.5 text-slate-400 hover:text-red-400"
                                title="Delete"
                                id={`parcel-delete-${p.parcel_id}`}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200/80">
            <span className="text-xs text-slate-400">Page {page} of {pages}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-ghost p-1.5 disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage(p => Math.min(pages, p + 1))}
                disabled={page === pages}
                className="btn-ghost p-1.5 disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
