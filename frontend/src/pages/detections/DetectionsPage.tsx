// Detections Page — view, filter, and review encroachment detections
import React, { useEffect, useState } from 'react'
import {
  AlertTriangle, Filter, Search, RefreshCw, ChevronLeft, ChevronRight,
  Loader2, CheckCircle, Eye, Edit3, X
} from 'lucide-react'
import { detectionsAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import type { EncroachmentDetection } from '../../types'
import clsx from 'clsx'

const STATUSES = [
  '', 'Pending Review', 'Under Investigation',
  'Verified by Authorized Surveyor', 'False Positive', 'Resolved'
]
const SEVERITIES = ['', 'Critical', 'High', 'Medium', 'Low']

interface ReviewModalProps {
  detection: EncroachmentDetection
  onClose: () => void
  onSaved: () => void
}

function ReviewModal({ detection, onClose, onSaved }: ReviewModalProps) {
  const [status, setStatus] = useState(detection.review_status)
  const [notes, setNotes] = useState(detection.reviewer_notes || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    setSaving(true)
    try {
      await detectionsAPI.review(detection.id, { review_status: status, reviewer_notes: notes })
      onSaved()
      onClose()
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Save failed.')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-card w-full max-w-lg p-6 z-10 animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-dark-100">Review Detection</h3>
          <button onClick={onClose} className="text-dark-500 hover:text-dark-300"><X size={18} /></button>
        </div>

        <div className="disclaimer-box mb-4 text-xs">{detection.disclaimer}</div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-dark-400 mb-1.5 uppercase tracking-wider">Reason</label>
            <p className="text-sm text-dark-300 bg-dark-800/50 rounded-lg p-3 leading-relaxed">
              {detection.detection_reason}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-dark-800/40 rounded-lg p-3">
              <div className="text-xs text-dark-500">Severity</div>
              <span className={`badge badge-${detection.severity.toLowerCase()} mt-1`}>{detection.severity}</span>
            </div>
            <div className="bg-dark-800/40 rounded-lg p-3">
              <div className="text-xs text-dark-500">Area Diff</div>
              <div className="font-mono text-sm mt-0.5">{detection.area_difference_pct?.toFixed(1)}%</div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-dark-400 mb-1.5 uppercase tracking-wider">
              Review Status
            </label>
            <select
              id="review-status-select"
              className="input-field text-sm py-2"
              value={status}
              onChange={e => setStatus(e.target.value)}
            >
              {STATUSES.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-dark-400 mb-1.5 uppercase tracking-wider">
              Reviewer Notes
            </label>
            <textarea
              id="review-notes-input"
              className="input-field text-sm py-2 h-24 resize-none"
              placeholder="Add notes from field verification..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="btn-secondary flex-1 text-sm">Cancel</button>
            <button
              id="review-save-btn"
              onClick={save}
              disabled={saving}
              className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Save Review
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function DetectionsPage() {
  const { isAdmin } = useAuth()
  const [detections, setDetections] = useState<EncroachmentDetection[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [severityFilter, setSeverityFilter] = useState('')
  const [search, setSearch] = useState('')
  const [reviewTarget, setReviewTarget] = useState<EncroachmentDetection | null>(null)

  useEffect(() => { load() }, [page, statusFilter, severityFilter])

  const load = async () => {
    setLoading(true)
    try {
      const res = await detectionsAPI.list({
        page, per_page: 20,
        status: statusFilter,
        severity: severityFilter,
        parcel_id: search,
      })
      setDetections(res.data.detections || [])
      setTotal(res.data.total || 0)
      setPages(res.data.pages || 1)
    } catch { /* handled */ }
    finally { setLoading(false) }
  }

  const severityBadge = (s: string) => {
    const map: Record<string, string> = {
      Critical: 'badge-critical', High: 'badge-high', Medium: 'badge-medium', Low: 'badge-low'
    }
    return <span className={`badge ${map[s] || 'badge'}`}>{s}</span>
  }

  const statusColor = (s: string) => {
    if (s.includes('Verified')) return 'text-green-400'
    if (s.includes('False')) return 'text-dark-500'
    if (s.includes('Resolved')) return 'text-blue-400'
    if (s.includes('Investigation')) return 'text-amber-400'
    return 'text-dark-400'
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-dark-100">Encroachment Detections</h1>
          <p className="text-dark-500 text-sm">{total} detection records — preliminary findings only</p>
        </div>
        <button onClick={load} className="btn-ghost p-2 self-start" id="detections-refresh-btn">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Disclaimer */}
      <div className="disclaimer-box">
        <AlertTriangle size={13} className="inline mr-1" />
        <strong>Preliminary Findings Only.</strong> All detections are automated geometric mismatches.
        They do NOT establish legal ownership or prove encroachment. Authorized surveyor verification is required.
      </div>

      {/* Filters */}
      <div className="glass-card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" size={14} />
          <input
            id="detections-search"
            type="text"
            placeholder="Search by parcel ID..."
            className="input-field pl-9 text-sm py-2"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { setPage(1); load() } }}
          />
        </div>
        <select id="detections-status-filter" className="input-field text-sm py-2 w-48"
                value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}>
          {STATUSES.map(s => <option key={s} value={s}>{s || 'All Statuses'}</option>)}
        </select>
        <select id="detections-severity-filter" className="input-field text-sm py-2 w-36"
                value={severityFilter} onChange={e => { setSeverityFilter(e.target.value); setPage(1) }}>
          {SEVERITIES.map(s => <option key={s} value={s}>{s || 'All Severities'}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-dark-400 gap-2">
              <Loader2 size={18} className="animate-spin" /> Loading detections...
            </div>
          ) : detections.length === 0 ? (
            <div className="py-16 text-center">
              <AlertTriangle size={40} className="text-dark-700 mx-auto mb-3" />
              <p className="text-dark-500">No detections found. Run the detection engine from the dashboard.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Parcel</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Land Use</th>
                  <th>Reg. Area</th>
                  <th>Obs. Area</th>
                  <th>Diff %</th>
                  <th>Confidence</th>
                  <th>Detected</th>
                  {isAdmin() && <th>Review</th>}
                </tr>
              </thead>
              <tbody>
                {detections.map(d => (
                  <tr key={d.id} title={d.detection_reason}>
                    <td className="font-mono text-xs text-accent-blue">{d.parcel?.parcel_id || d.parcel_id?.slice(0, 8)}</td>
                    <td>{severityBadge(d.severity)}</td>
                    <td><span className={`text-xs ${statusColor(d.review_status)}`}>{d.review_status}</span></td>
                    <td className="text-xs">{d.detected_land_use || '—'}</td>
                    <td className="font-mono text-xs">{d.registered_area_sqm?.toFixed(0) || '—'}</td>
                    <td className="font-mono text-xs">{d.observed_area_sqm?.toFixed(0) || '—'}</td>
                    <td className="font-mono text-xs font-semibold">
                      {d.area_difference_pct != null
                        ? <span className={d.area_difference_pct > 20 ? 'text-red-400' : 'text-amber-400'}>
                            {d.area_difference_pct.toFixed(1)}%
                          </span>
                        : '—'}
                    </td>
                    <td className="text-xs text-dark-500">
                      {d.model_confidence ? `${(d.model_confidence * 100).toFixed(0)}%` : '—'}
                    </td>
                    <td className="text-xs text-dark-500">
                      {d.detected_at ? new Date(d.detected_at).toLocaleDateString() : '—'}
                    </td>
                    {isAdmin() && (
                      <td>
                        <button
                          onClick={() => setReviewTarget(d)}
                          className="btn-ghost p-1.5 text-dark-400 hover:text-accent-blue"
                          title="Review"
                          id={`review-btn-${d.id.slice(0, 8)}`}
                        >
                          <Edit3 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-dark-700/50">
            <span className="text-xs text-dark-500">Page {page} of {pages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                      className="btn-ghost p-1.5 disabled:opacity-40"><ChevronLeft size={16} /></button>
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
                      className="btn-ghost p-1.5 disabled:opacity-40"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>

      {reviewTarget && (
        <ReviewModal
          detection={reviewTarget}
          onClose={() => setReviewTarget(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}
