// Admin Audit Logs Page
import React, { useEffect, useState } from 'react'
import { Activity, Search, RefreshCw, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { adminAPI } from '../../services/api'
import type { AuditLog } from '../../types'

const ACTION_COLORS: Record<string, string> = {
  USER_SIGNUP: 'text-green-400', USER_LOGIN: 'text-blue-400', USER_LOGOUT: 'text-slate-500',
  PARCEL_CREATED: 'text-cyan-400', PARCEL_UPDATED: 'text-amber-400', PARCEL_DELETED: 'text-red-400',
  DETECTION_REVIEWED: 'text-violet-400', DETECTION_RUN: 'text-orange-400',
  USER_STATUS_CHANGED: 'text-pink-400', USER_ROLE_CHANGED: 'text-yellow-400',
  REPORT_GENERATED: 'text-sky-400', DATASET_UPLOADED: 'text-teal-400',
}

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => { load() }, [page])

  const load = async (q = search) => {
    setLoading(true)
    try {
      const res = await adminAPI.auditLogs({ page, per_page: 50, action: q })
      setLogs(res.data.logs || [])
      setTotal(res.data.total || 0)
      setPages(res.data.pages || 1)
    } catch { /* handled */ }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Activity size={20} className="text-sky-600" /> Audit Logs
          </h1>
          <p className="text-slate-400 text-sm">{total} immutable audit records</p>
        </div>
        <button onClick={() => load()} className="btn-ghost p-2" id="audit-refresh-btn">
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="glass-card p-4 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input
            id="audit-search-input"
            type="text"
            placeholder="Filter by action (e.g. PARCEL_CREATED)..."
            className="input-field pl-9 text-sm py-2"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { setPage(1); load(search) } }}
          />
        </div>
        <button onClick={() => { setPage(1); load(search) }} className="btn-secondary text-sm px-4 py-2"
                id="audit-search-btn">Search</button>
      </div>

      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-slate-500">
            <Loader2 size={18} className="animate-spin" /> Loading audit logs...
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <Activity size={36} className="text-slate-300 mx-auto mb-3" />
            No audit records found.
          </div>
        ) : (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Entity ID</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td className="text-xs text-slate-400 font-mono whitespace-nowrap">
                      {log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}
                    </td>
                    <td className="text-xs text-slate-500">{log.actor_email || 'system'}</td>
                    <td>
                      <span className={`font-mono text-xs font-semibold ${ACTION_COLORS[log.action] || 'text-slate-500'}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="text-xs text-slate-400">{log.entity_type || '—'}</td>
                    <td className="font-mono text-xs text-slate-400">{log.entity_id?.slice(0, 12) || '—'}</td>
                    <td className="text-xs text-slate-400">{log.ip_address || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200/80">
                <span className="text-xs text-slate-400">Page {page} of {pages}</span>
                <div className="flex gap-2">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                          className="btn-ghost p-1.5 disabled:opacity-40"><ChevronLeft size={16} /></button>
                  <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
                          className="btn-ghost p-1.5 disabled:opacity-40"><ChevronRight size={16} /></button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
