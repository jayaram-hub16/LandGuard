// Admin Occupation Monitoring Page — Unauthorized Land Occupation Detection Dashboard
// Shows all detection groups, recent findings, and links to cases/detections.
import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, Eye, CheckCircle, XCircle, Search,
  RefreshCw, Loader2, Shield, FileText, Bell, MapPin,
  Clock, Activity, TrendingUp, AlertOctagon
} from 'lucide-react'
import { occupationAPI, detectionsAPI } from '../../services/api'
import type { OccupationMonitorStats, EncroachmentDetection } from '../../types'

const DISCLAIMER =
  'PRELIMINARY FINDINGS — All detections are automated geometric analysis results. ' +
  'They do NOT constitute proof of illegal encroachment or any legal determination. ' +
  'All findings require verification by an authorized surveyor before any action is taken.'

const STATUS_COLORS: Record<string, string> = {
  'Pending Review':                   'text-amber-700 bg-amber-50 border-amber-200',
  'Under Investigation':              'text-orange-700 bg-orange-50 border-orange-200',
  'Field Survey Assigned':            'text-blue-700 bg-blue-50 border-blue-200',
  'Verified by Authorized Surveyor':  'text-red-700 bg-red-50 border-red-200',
  'False Positive':                   'text-slate-600 bg-slate-100 border-slate-200',
  'Resolved':                         'text-green-700 bg-green-50 border-green-200',
}

const SEV_COLORS: Record<string, string> = {
  Critical: 'text-red-700 bg-red-50 border-red-200',
  High:     'text-orange-700 bg-orange-50 border-orange-200',
  Medium:   'text-amber-700 bg-amber-50 border-amber-200',
  Low:      'text-green-700 bg-green-50 border-green-200',
}

const MAP_STATUS_INDICATOR: Record<string, { dot: string; label: string }> = {
  'Pending Review':                   { dot: 'bg-yellow-400', label: 'AI-Detected (Unverified)' },
  'Under Investigation':              { dot: 'bg-orange-400', label: 'Under Investigation' },
  'Field Survey Assigned':            { dot: 'bg-blue-400',   label: 'Field Inspection Required' },
  'Verified by Authorized Surveyor':  { dot: 'bg-red-500',    label: 'Human-Verified Encroachment' },
  'False Positive':                   { dot: 'bg-slate-400',   label: 'Rejected / False Positive' },
  'Resolved':                         { dot: 'bg-green-500',  label: 'Resolved' },
}

interface SummaryCardProps {
  label: string
  count: number
  icon: React.ReactNode
  color: string
  onClick?: () => void
}

function SummaryCard({ label, count, icon, color, onClick }: SummaryCardProps) {
  return (
    <button
      onClick={onClick}
      className={`glass-card p-4 text-left hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-300 w-full ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <div className="flex items-start justify-between">
        <div className={`p-2 rounded-lg shadow-sm ${color}`}>{icon}</div>
        <span className="text-2xl font-bold text-slate-900">{count}</span>
      </div>
      <div className="mt-2 text-xs text-slate-500 font-medium">{label}</div>
    </button>
  )
}

export default function OccupationMonitorPage() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<OccupationMonitorStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSeverity, setFilterSeverity] = useState('')
  const [runningDetection, setRunningDetection] = useState(false)
  const [detectionMsg, setDetectionMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await occupationAPI.monitorStats()
      setStats(res.data)
    } catch { /* handled */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const runDetection = async () => {
    setRunningDetection(true)
    setDetectionMsg('')
    try {
      const res = await detectionsAPI.runDetection()
      setDetectionMsg(res.data.message)
      await load()
    } catch { setDetectionMsg('Detection run failed. Check backend logs.') }
    finally { setRunningDetection(false) }
  }

  const filtered = (stats?.recent_detections || []).filter(d => {
    const statusOk = !filterStatus || d.review_status === filterStatus
    const sevOk = !filterSeverity || d.severity === filterSeverity
    return statusOk && sevOk
  })

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={24} className="animate-spin text-slate-500" />
    </div>
  )

  const s = stats?.summary

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Shield size={20} className="text-orange-400" />
            Unauthorized Occupation Monitoring
          </h1>
          <p className="text-slate-400 text-xs mt-0.5">
            AI-assisted detection · Requires surveyor verification · Not a legal determination
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={load} className="btn-ghost p-2" title="Refresh">
            <RefreshCw size={16} />
          </button>
          <button
            onClick={runDetection}
            disabled={runningDetection}
            className="btn-primary flex items-center gap-2 text-sm"
            id="run-detection-btn"
          >
            {runningDetection
              ? <Loader2 size={14} className="animate-spin" />
              : <Activity size={14} />}
            {runningDetection ? 'Scanning...' : 'Run Detection Scan'}
          </button>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="disclaimer-box text-xs leading-relaxed">
        <div className="flex items-start gap-2">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <span>{DISCLAIMER}</span>
        </div>
      </div>

      {detectionMsg && (
        <div className="glass-card p-3 text-sm text-green-400 border border-green-500/30">
          ✅ {detectionMsg}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryCard
          label="Newly Detected"
          count={s?.newly_detected ?? 0}
          icon={<AlertTriangle size={16} />}
          color="bg-yellow-500/15 text-yellow-400"
          onClick={() => { setFilterStatus('Pending Review'); setFilterSeverity('') }}
        />
        <SummaryCard
          label="Under Investigation"
          count={s?.under_investigation ?? 0}
          icon={<Search size={16} />}
          color="bg-orange-500/15 text-orange-400"
          onClick={() => { setFilterStatus('Under Investigation'); setFilterSeverity('') }}
        />
        <SummaryCard
          label="Field Inspection"
          count={s?.field_inspection ?? 0}
          icon={<MapPin size={16} />}
          color="bg-blue-500/15 text-blue-400"
        />
        <SummaryCard
          label="Human-Verified"
          count={s?.human_verified ?? 0}
          icon={<AlertOctagon size={16} />}
          color="bg-red-500/15 text-red-400"
          onClick={() => { setFilterStatus('Verified by Authorized Surveyor'); setFilterSeverity('') }}
        />
        <SummaryCard
          label="Rejected / False"
          count={s?.rejected_false ?? 0}
          icon={<XCircle size={16} />}
          color="bg-slate-100 text-slate-500"
          onClick={() => { setFilterStatus('False Positive'); setFilterSeverity('') }}
        />
        <SummaryCard
          label="Resolved"
          count={s?.resolved ?? 0}
          icon={<CheckCircle size={16} />}
          color="bg-green-500/15 text-green-400"
          onClick={() => { setFilterStatus('Resolved'); setFilterSeverity('') }}
        />
      </div>

      {/* Case & Detection totals */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="glass-card p-4 flex items-center gap-3">
          <TrendingUp size={20} className="text-blue-600" />
          <div>
            <div className="text-xl font-bold text-slate-900">{s?.total_detections ?? 0}</div>
            <div className="text-xs text-slate-400">Total Detections</div>
          </div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <FileText size={20} className="text-purple-400" />
          <div>
            <div className="text-xl font-bold text-slate-900">{s?.total_cases ?? 0}</div>
            <div className="text-xs text-slate-400">Total Cases</div>
          </div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <Clock size={20} className="text-orange-400" />
          <div>
            <div className="text-xl font-bold text-slate-900">{s?.open_cases ?? 0}</div>
            <div className="text-xs text-slate-400">Open Cases</div>
          </div>
        </div>
      </div>

      {/* Map Legend */}
      <div className="glass-card p-4">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          GIS Map Colour Code — Detection Status
        </div>
        <div className="flex flex-wrap gap-4">
          {Object.entries(MAP_STATUS_INDICATOR).map(([status, { dot, label }]) => (
            <div key={status} className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full flex-shrink-0 ${dot}`} />
              <span className="text-xs text-slate-500">{label}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 text-xs text-slate-400">
          → View colour-coded detections on the <button
            onClick={() => navigate('/map')}
            className="text-blue-600 hover:underline"
          >GIS Map</button>
        </div>
      </div>

      {/* Recent Detections Table */}
      <div className="glass-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 border-b border-slate-200/80">
          <div className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Bell size={14} className="text-orange-400" />
            Recent Detection Findings ({filtered.length} shown)
          </div>
          <div className="flex gap-2 flex-wrap">
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="input-field text-xs py-1.5 min-w-[160px]"
            >
              <option value="">All Statuses</option>
              <option value="Pending Review">Pending Review</option>
              <option value="Under Investigation">Under Investigation</option>
              <option value="Verified by Authorized Surveyor">Human Verified</option>
              <option value="False Positive">False Positive</option>
              <option value="Resolved">Resolved</option>
            </select>
            <select
              value={filterSeverity}
              onChange={e => setFilterSeverity(e.target.value)}
              className="input-field text-xs py-1.5"
            >
              <option value="">All Severities</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
            {(filterStatus || filterSeverity) && (
              <button
                onClick={() => { setFilterStatus(''); setFilterSeverity('') }}
                className="btn-ghost text-xs px-2 py-1.5"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            {stats?.summary.total_detections === 0
              ? 'No detections yet. Click "Run Detection Scan" to analyse parcels.'
              : 'No detections match the current filter.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-wide">
                  <th className="text-left px-4 py-2">Parcel ID</th>
                  <th className="text-left px-4 py-2">Location</th>
                  <th className="text-left px-4 py-2">Severity</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-left px-4 py-2">Confidence</th>
                  <th className="text-left px-4 py-2">Detected</th>
                  <th className="text-left px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(d => (
                  <DetectionRow key={d.id} detection={d} navigate={navigate} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => navigate('/detections')}
          className="btn-secondary text-xs flex items-center gap-2"
        >
          <Eye size={14} /> All Detections
        </button>
        <button
          onClick={() => navigate('/cases')}
          className="btn-secondary text-xs flex items-center gap-2"
        >
          <FileText size={14} /> Case Management
        </button>
        <button
          onClick={() => navigate('/surveys')}
          className="btn-secondary text-xs flex items-center gap-2"
        >
          <MapPin size={14} /> Field Surveys
        </button>
        <button
          onClick={() => navigate('/map')}
          className="btn-secondary text-xs flex items-center gap-2"
        >
          <Shield size={14} /> GIS Map
        </button>
      </div>
    </div>
  )
}

function DetectionRow({
  detection: d, navigate
}: { detection: EncroachmentDetection; navigate: (path: string) => void }) {
  const parcel = d.parcel
  const loc = [
    parcel?.administrative_area, parcel?.district, parcel?.state
  ].filter(Boolean).join(', ') || '—'

  return (
    <tr className="border-b border-slate-100/40 hover:bg-white/30 transition-colors">
      <td className="px-4 py-3">
        <span className="font-mono text-blue-600 font-semibold">
          {parcel?.parcel_id || '—'}
        </span>
      </td>
      <td className="px-4 py-3 text-slate-500 max-w-[180px] truncate" title={loc}>
        {loc}
      </td>
      <td className="px-4 py-3">
        <span className={`px-2 py-0.5 rounded border text-xs font-medium ${SEV_COLORS[d.severity] || ''}`}>
          {d.severity}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className={`px-2 py-0.5 rounded border text-xs ${STATUS_COLORS[d.review_status] || ''}`}>
          {d.review_status}
        </span>
      </td>
      <td className="px-4 py-3 text-slate-500">
        {d.model_confidence != null ? `${(d.model_confidence * 100).toFixed(0)}%` : '—'}
      </td>
      <td className="px-4 py-3 text-slate-400">
        {d.detected_at ? new Date(d.detected_at).toLocaleDateString('en-IN') : '—'}
      </td>
      <td className="px-4 py-3">
        <button
          onClick={() => navigate('/detections')}
          className="text-blue-600 hover:underline text-xs"
        >
          Review →
        </button>
      </td>
    </tr>
  )
}

