// Dashboard Page — main user dashboard with stats and charts
import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileText, AlertTriangle, CheckCircle, Clock, TrendingUp,
  Map, Plus, RefreshCw, ArrowRight, Loader2, Briefcase, MessageSquare
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'
import { parcelsAPI, detectionsAPI } from '../../services/api'
import api from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import type { LandParcel, EncroachmentDetection } from '../../types'

const COLORS = ['#3b82f6', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#64748b']

const StatCard = ({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; color: string
}) => (
  <div className="glass-card p-5 flex items-start gap-4 hover:border-dark-600 transition-all">
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
      {icon}
    </div>
    <div>
      <div className="text-2xl font-black text-dark-100">{value}</div>
      <div className="text-xs font-semibold text-dark-400 uppercase tracking-wider mt-0.5">{label}</div>
      {sub && <div className="text-xs text-dark-600 mt-1">{sub}</div>}
    </div>
  </div>
)

export default function DashboardPage() {
  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [parcels, setParcels] = useState<LandParcel[]>([])
  const [detections, setDetections] = useState<EncroachmentDetection[]>([])
  const [loading, setLoading] = useState(true)
  const [runningDetection, setRunningDetection] = useState(false)
  const [detectionMsg, setDetectionMsg] = useState('')
  const [stats, setStats] = useState<{
    cases?: { total: number; open: number }
    complaints?: { total: number; open: number }
  } | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [pRes, dRes, sRes] = await Promise.all([
        parcelsAPI.list({ per_page: 100 }),
        detectionsAPI.list({ per_page: 100 }),
        api.get('/admin/stats').catch(() => ({ data: null })),
      ])
      setParcels(pRes.data.parcels || [])
      setDetections(dRes.data.detections || [])
      if (sRes.data) setStats(sRes.data)
    } catch { /* errors handled by interceptor */ }
    finally { setLoading(false) }
  }

  const handleRunDetection = async () => {
    setRunningDetection(true)
    setDetectionMsg('')
    try {
      const res = await detectionsAPI.runDetection()
      setDetectionMsg(res.data.message)
      await loadData()
    } catch (e: unknown) {
      setDetectionMsg('Detection run failed.')
    } finally {
      setRunningDetection(false)
    }
  }

  // Computed stats
  const totalParcels = parcels.length
  const flaggedParcels = parcels.filter(p => p.is_flagged).length
  const pendingDetections = detections.filter(d => d.review_status === 'Pending Review').length
  const criticalDetections = detections.filter(d => d.severity === 'Critical').length

  // Land-use chart data
  const luMap: Record<string, number> = {}
  parcels.forEach(p => {
    const k = p.registered_land_use || 'Unknown'
    luMap[k] = (luMap[k] || 0) + 1
  })
  const luData = Object.entries(luMap).map(([name, value]) => ({ name, value }))

  // Severity chart data
  const sevMap: Record<string, number> = {}
  detections.forEach(d => { sevMap[d.severity] = (sevMap[d.severity] || 0) + 1 })
  const sevData = Object.entries(sevMap).map(([name, value]) => ({ name, value }))

  const recentDetections = detections.slice(0, 8)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex items-center gap-3 text-dark-400">
        <Loader2 size={20} className="animate-spin" />
        Loading dashboard...
      </div>
    </div>
  )

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-dark-100">
            Welcome back, <span className="gradient-text">{user?.full_name?.split(' ')[0]}</span>
          </h1>
          <p className="text-dark-500 text-sm mt-1">LandGuard GIS Encroachment Detection Dashboard</p>
        </div>
        <div className="flex gap-3">
          <button onClick={loadData} className="btn-secondary flex items-center gap-2 text-sm px-4 py-2"
                  id="dashboard-refresh-btn">
            <RefreshCw size={15} /> Refresh
          </button>
          {isAdmin() && (
            <button
              onClick={handleRunDetection}
              disabled={runningDetection}
              className="btn-primary flex items-center gap-2 text-sm px-4 py-2"
              id="run-detection-btn"
            >
              {runningDetection
                ? <><Loader2 size={15} className="animate-spin" /> Running...</>
                : <><AlertTriangle size={15} /> Run Detection</>
              }
            </button>
          )}
        </div>
      </div>

      {detectionMsg && (
        <div className="disclaimer-box">
          <AlertTriangle size={14} className="inline mr-1" />
          {detectionMsg}
        </div>
      )}

      {/* Disclaimer */}
      <div className="disclaimer-box">
        <strong>⚠ Simulated Data:</strong> All parcel and detection data shown is synthetic, generated for demonstration purposes only.
        Detection results are preliminary geometric findings requiring field verification.
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          icon={<FileText size={22} className="text-white" />}
          label="Total Parcels" value={totalParcels}
          sub={`${flaggedParcels} flagged`}
          color="bg-gradient-to-br from-navy-600 to-accent-blue"
        />
        <StatCard
          icon={<AlertTriangle size={22} className="text-white" />}
          label="Detections" value={detections.length}
          sub={`${pendingDetections} pending review`}
          color="bg-gradient-to-br from-amber-600 to-orange-500"
        />
        <StatCard
          icon={<Clock size={22} className="text-white" />}
          label="Pending Review" value={pendingDetections}
          sub="Awaiting surveyor check"
          color="bg-gradient-to-br from-violet-600 to-accent-violet"
        />
        <StatCard
          icon={<TrendingUp size={22} className="text-white" />}
          label="Critical Flags" value={criticalDetections}
          sub="Immediate attention"
          color="bg-gradient-to-br from-red-700 to-red-500"
        />
        <StatCard
          icon={<Briefcase size={22} className="text-white" />}
          label="Open Cases" value={stats?.cases?.open ?? '—'}
          sub={`${stats?.cases?.total ?? '—'} total`}
          color="bg-gradient-to-br from-emerald-700 to-emerald-500"
        />
        <StatCard
          icon={<MessageSquare size={22} className="text-white" />}
          label="Complaints" value={stats?.complaints?.open ?? '—'}
          sub={`${stats?.complaints?.total ?? '—'} total`}
          color="bg-gradient-to-br from-rose-700 to-rose-500"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Land-use distribution */}
        <div className="glass-card p-5">
          <h3 className="font-semibold text-dark-200 mb-4">Land-Use Distribution</h3>
          {luData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={luData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }}
                       angle={-25} textAnchor="end" height={50} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                  labelStyle={{ color: '#e2e8f0' }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {luData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-dark-500 text-sm">
              No parcel data yet. Seed data or add parcels.
            </div>
          )}
        </div>

        {/* Detection severity */}
        <div className="glass-card p-5">
          <h3 className="font-semibold text-dark-200 mb-4">Detection Severity</h3>
          {sevData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={sevData} dataKey="value" nameKey="name"
                     cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) =>
                       `${name} ${(percent * 100).toFixed(0)}%`
                     }
                     labelLine={{ stroke: '#475569' }}>
                  {sevData.map((entry, i) => {
                    const c = { Critical: '#ef4444', High: '#f97316', Medium: '#eab308', Low: '#22c55e' }
                    return <Cell key={i} fill={c[entry.name as keyof typeof c] || COLORS[i % COLORS.length]} />
                  })}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-dark-500 text-sm">
              No detections yet. Run the detection engine to get started.
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <button onClick={() => navigate('/map')} className="glass-card-hover p-5 text-left flex items-center gap-4 group"
                id="quick-map-btn">
          <div className="w-10 h-10 rounded-xl bg-accent-blue/15 flex items-center justify-center text-accent-blue">
            <Map size={20} />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-dark-200 text-sm">Open GIS Map</div>
            <div className="text-dark-500 text-xs">View parcel boundaries</div>
          </div>
          <ArrowRight size={16} className="text-dark-600 group-hover:text-accent-blue transition-colors" />
        </button>

        <button onClick={() => navigate('/parcels')} className="glass-card-hover p-5 text-left flex items-center gap-4 group"
                id="quick-parcels-btn">
          <div className="w-10 h-10 rounded-xl bg-navy-600/20 flex items-center justify-center text-navy-400">
            <FileText size={20} />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-dark-200 text-sm">Browse Parcels</div>
            <div className="text-dark-500 text-xs">{totalParcels} registered parcels</div>
          </div>
          <ArrowRight size={16} className="text-dark-600 group-hover:text-navy-400 transition-colors" />
        </button>

        <button onClick={() => navigate('/detections')} className="glass-card-hover p-5 text-left flex items-center gap-4 group"
                id="quick-detections-btn">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-400">
            <AlertTriangle size={20} />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-dark-200 text-sm">Review Detections</div>
            <div className="text-dark-500 text-xs">{pendingDetections} pending</div>
          </div>
          <ArrowRight size={16} className="text-dark-600 group-hover:text-amber-400 transition-colors" />
        </button>

        <button onClick={() => navigate('/cases')} className="glass-card-hover p-5 text-left flex items-center gap-4 group"
                id="quick-cases-btn">
          <div className="w-10 h-10 rounded-xl bg-emerald-600/15 flex items-center justify-center text-emerald-400">
            <Briefcase size={20} />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-dark-200 text-sm">View Cases</div>
            <div className="text-dark-500 text-xs">{stats?.cases?.open ?? 0} open cases</div>
          </div>
          <ArrowRight size={16} className="text-dark-600 group-hover:text-emerald-400 transition-colors" />
        </button>
      </div>

      {/* Recent detections */}
      {recentDetections.length > 0 && (
        <div className="glass-card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700/50">
            <h3 className="font-semibold text-dark-200">Recent Detections</h3>
            <button onClick={() => navigate('/detections')} className="text-accent-blue text-xs hover:underline">
              View all →
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Parcel</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Area Diff</th>
                  <th>Detected</th>
                </tr>
              </thead>
              <tbody>
                {recentDetections.map(d => (
                  <tr key={d.id} className="cursor-pointer" onClick={() => navigate('/detections')}>
                    <td className="font-mono text-xs text-accent-blue">{d.parcel?.parcel_id || d.parcel_id?.slice(0, 8)}</td>
                    <td>
                      <span className={`badge badge-${d.severity.toLowerCase()}`}>{d.severity}</span>
                    </td>
                    <td>
                      <span className="text-xs text-dark-400">{d.review_status}</span>
                    </td>
                    <td className="font-mono text-xs">
                      {d.area_difference_pct != null ? `${d.area_difference_pct.toFixed(1)}%` : '—'}
                    </td>
                    <td className="text-xs text-dark-500">
                      {d.detected_at ? new Date(d.detected_at).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
