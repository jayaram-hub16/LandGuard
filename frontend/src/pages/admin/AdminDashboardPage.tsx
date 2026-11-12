// Admin Dashboard Page
import React, { useEffect, useState } from 'react'
import {
  Users, FileText, AlertTriangle, Database, Activity,
  RefreshCw, Loader2, BarChart3, AlertCircle, Play
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts'
import { adminAPI, detectionsAPI } from '../../services/api'
import type { DashboardStats } from '../../types'

const COLORS = ['#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899']

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [runningDetection, setRunningDetection] = useState(false)
  const [detectionMsg, setDetectionMsg] = useState('')

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const res = await adminAPI.dashboard()
      setStats(res.data)
    } catch { /* handled */ }
    finally { setLoading(false) }
  }

  const runDetection = async () => {
    setRunningDetection(true)
    setDetectionMsg('')
    try {
      const res = await detectionsAPI.runDetection()
      setDetectionMsg(res.data.message)
      await load()
    } catch { setDetectionMsg('Detection run failed.') }
    finally { setRunningDetection(false) }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={24} className="animate-spin text-slate-400" />
    </div>
  )

  const luData = Object.entries(stats?.land_use_distribution || {}).map(([name, value]) => ({ name, value }))
  const sevData = Object.entries(stats?.severity_distribution || {}).map(([name, value]) => ({
    name, value,
    fill: { Critical: '#ef4444', High: '#f97316', Medium: '#eab308', Low: '#22c55e' }[name] || '#64748b'
  }))

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <AlertCircle size={20} className="text-violet-400" /> Admin Dashboard
          </h1>
          <p className="text-slate-400 text-sm">System overview and management controls</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-ghost p-2" id="admin-refresh-btn"><RefreshCw size={16} /></button>
          <button
            onClick={runDetection}
            disabled={runningDetection}
            className="btn-primary flex items-center gap-2 text-sm px-4 py-2"
            id="admin-run-detection-btn"
          >
            {runningDetection ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
            {runningDetection ? 'Running...' : 'Run Detection'}
          </button>
        </div>
      </div>

      {detectionMsg && (
        <div className="disclaimer-box">{detectionMsg}</div>
      )}

      {/* Stat grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: <FileText size={20} />, label: 'Total Parcels', value: stats?.parcels.total || 0,
            sub: `${stats?.parcels.flagged || 0} flagged`, color: 'from-blue-700 to-blue-500' },
          { icon: <AlertTriangle size={20} />, label: 'Detections', value: stats?.detections.total || 0,
            sub: `${stats?.detections.pending || 0} pending`, color: 'from-amber-700 to-amber-500' },
          { icon: <Users size={20} />, label: 'Users', value: stats?.users.total || 0,
            sub: `${stats?.users.active || 0} active`, color: 'from-violet-700 to-violet-500' },
          { icon: <Database size={20} />, label: 'Datasets', value: stats?.datasets.total || 0,
            sub: 'Uploaded GIS data', color: 'from-cyan-700 to-cyan-500' },
        ].map(s => (
          <div key={s.label} className="stat-card-3d flex items-start gap-4 group cursor-default">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center text-white flex-shrink-0 shadow-sm`}>
              {s.icon}
            </div>
            <div>
              <div className="text-2xl font-black text-slate-900">{s.value}</div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{s.label}</div>
              <div className="text-xs text-slate-300 mt-0.5">{s.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="glass-card p-5">
          <h3 className="font-semibold text-slate-800 mb-4">Land-Use Distribution</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={luData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} angle={-20} textAnchor="end" height={45} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8 }} labelStyle={{ color: '#1e293b' }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {luData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card p-5">
          <h3 className="font-semibold text-slate-800 mb-4">Detection Severity Breakdown</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={sevData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8 }} labelStyle={{ color: '#1e293b' }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {sevData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent activity */}
      {stats?.recent_activity && stats.recent_activity.length > 0 && (
        <div className="glass-card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-2">
            <Activity size={16} className="text-sky-500" />
            <h3 className="font-semibold text-slate-800">Recent Audit Activity</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {stats.recent_activity.slice(0, 8).map(log => (
              <div key={log.id} className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs text-slate-500 flex-shrink-0">
                  {log.actor_email?.charAt(0).toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-800">
                    <span className="font-medium text-slate-900">{log.actor_email || 'system'}</span>
                    {' — '}
                    <span className="text-blue-600 font-mono text-xs">{log.action}</span>
                  </div>
                  <div className="text-xs text-slate-300 mt-0.5">
                    {log.entity_type} {log.entity_id?.slice(0, 8)}
                  </div>
                </div>
                <div className="text-xs text-slate-300 flex-shrink-0">
                  {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
