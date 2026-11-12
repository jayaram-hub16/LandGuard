// Cases Management Page — full case workflow board
import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Briefcase, Plus, RefreshCw, Loader2, AlertTriangle,
  Clock, CheckCircle, Filter, Search, ChevronRight, Users
} from 'lucide-react'
import { casesAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { useLang } from '../../context/LangContext'
import type { Case } from '../../types'

const STATUS_COLORS: Record<string, string> = {
  'Reported':              'bg-blue-50 text-blue-700 border-blue-200',
  'Under Review':          'bg-amber-50 text-amber-700 border-amber-200',
  'Field Survey Assigned': 'bg-violet-50 text-violet-700 border-violet-200',
  'Survey Submitted':      'bg-cyan-50 text-cyan-700 border-cyan-200',
  'Decision Pending':      'bg-orange-50 text-orange-700 border-orange-200',
  'Resolved':              'bg-green-50 text-green-700 border-green-200',
  'Disputed':              'bg-red-50 text-red-700 border-red-200',
  'Referred for Appeal':   'bg-slate-100 text-slate-700 border-slate-200',
}

const PRIORITY_COLORS: Record<string, string> = {
  Critical: 'text-red-600 font-semibold',
  High:     'text-orange-600 font-semibold',
  Medium:   'text-amber-600 font-medium',
  Low:      'text-green-600 font-medium',
}

const ALL_STATUSES = [
  'Reported', 'Under Review', 'Field Survey Assigned', 'Survey Submitted',
  'Decision Pending', 'Resolved', 'Disputed', 'Referred for Appeal',
]

export default function CasesPage() {
  const { user } = useAuth()
  const { t } = useLang()
  const navigate = useNavigate()
  const [cases, setCases] = useState<Case[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ title: '', description: '', priority: 'Medium', parcel_id: '' })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  useEffect(() => { load() }, [statusFilter])

  const load = async () => {
    setLoading(true)
    try {
      const res = await casesAPI.list({ per_page: 50, status: statusFilter, search })
      setCases(res.data.cases || [])
      setTotal(res.data.total || 0)
    } catch { /* handled by interceptor */ }
    finally { setLoading(false) }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createForm.title.trim()) { setCreateError('Case title is required.'); return }
    setCreating(true); setCreateError('')
    try {
      const res = await casesAPI.create(createForm)
      setCases(c => [res.data, ...c])
      setShowCreate(false)
      setCreateForm({ title: '', description: '', priority: 'Medium', parcel_id: '' })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string; errors?: Record<string, string> } } })?.response?.data
      setCreateError(msg?.error || Object.values(msg?.errors || {}).join(' ') || 'Failed to create case.')
    } finally { setCreating(false) }
  }

  const canCreate = user?.role === 'ADMIN' || user?.role === 'REVIEWER'

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Briefcase size={20} className="text-violet-400" /> {t.cases_title}
          </h1>
          <p className="text-slate-400 text-sm">{total} cases total</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => load()} className="btn-ghost p-2" id="cases-refresh-btn"><RefreshCw size={16} /></button>
          {canCreate && (
            <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 text-sm px-4 py-2" id="cases-create-btn">
              <Plus size={15} /> {t.case_open}
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card p-3 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
          <input id="cases-search" type="text" placeholder="Search case number or title..."
            className="input-field pl-8 text-xs py-2 w-full" value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()} />
        </div>
        <select className="input-field text-xs py-2 w-48" value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)} id="cases-status-filter">
          <option value="">All Statuses</option>
          {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={() => load()} className="btn-secondary text-xs px-3 py-2" id="cases-filter-btn">
          <Filter size={13} className="inline mr-1" /> Filter
        </button>
      </div>

      {/* Cases Table */}
      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-slate-500">
            <Loader2 size={18} className="animate-spin" /> {t.loading}
          </div>
        ) : cases.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Briefcase size={32} className="mx-auto mb-3 opacity-30" />
            <p>{t.nodata}</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.case_number}</th>
                <th>{t.case_title}</th>
                <th>{t.case_status}</th>
                <th>{t.case_priority}</th>
                <th>{t.case_surveyor}</th>
                <th>Deadline</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cases.map(c => (
                <tr key={c.id} className="cursor-pointer hover:bg-white/30"
                  onClick={() => navigate(`/cases/${c.id}`)}>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs text-blue-600 font-semibold">{c.case_number}</span>
                      {c.is_overdue && <span className="badge text-[9px] bg-red-500/20 text-red-400 border-red-500/30">{t.case_overdue}</span>}
                    </div>
                  </td>
                  <td className="max-w-[200px]">
                    <div className="text-sm text-slate-800 truncate">{c.title}</div>
                    {c.parcel && <div className="text-xs text-slate-400 truncate">{c.parcel.parcel_id}</div>}
                  </td>
                  <td>
                    <span className={`badge border text-xs ${STATUS_COLORS[c.status] || 'badge-user'}`}>{c.status}</span>
                  </td>
                  <td>
                    <span className={`text-xs font-semibold ${PRIORITY_COLORS[c.priority] || ''}`}>{c.priority}</span>
                  </td>
                  <td className="text-xs text-slate-500">{c.surveyor_name || '—'}</td>
                  <td className="text-xs text-slate-400">
                    {c.deadline ? (
                      <span className={c.is_overdue ? 'text-red-400' : ''}>
                        {new Date(c.deadline).toLocaleDateString()}
                      </span>
                    ) : '—'}
                  </td>
                  <td><ChevronRight size={14} className="text-slate-400" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Case Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-card w-full max-w-lg p-6 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-900 flex items-center gap-2">
                <Briefcase size={18} className="text-violet-400" /> Open New Case
              </h2>
              <button onClick={() => setShowCreate(false)} className="btn-ghost p-1.5"><span>✕</span></button>
            </div>
            {createError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
                {createError}
              </div>
            )}
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold block mb-1">Case Title *</label>
                <input id="create-case-title" type="text" className="input-field text-sm"
                  value={createForm.title} onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Brief description of the encroachment issue" />
              </div>
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold block mb-1">Description</label>
                <textarea id="create-case-desc" className="input-field text-sm h-24 resize-none"
                  value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Detailed description, evidence references, concerned parties..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold block mb-1">Priority</label>
                  <select id="create-case-priority" className="input-field text-sm"
                    value={createForm.priority} onChange={e => setCreateForm(f => ({ ...f, priority: e.target.value }))}>
                    {['Low', 'Medium', 'High', 'Critical'].map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold block mb-1">Parcel ID (optional)</label>
                  <input id="create-case-parcel" type="text" className="input-field text-sm"
                    value={createForm.parcel_id} onChange={e => setCreateForm(f => ({ ...f, parcel_id: e.target.value }))}
                    placeholder="Link to a land parcel" />
                </div>
              </div>
              <p className="text-xs text-slate-400 italic">
                A unique case number will be assigned automatically. This action is logged.
              </p>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={creating}
                  className="btn-primary flex items-center gap-2 text-sm flex-1" id="create-case-submit">
                  {creating && <Loader2 size={14} className="animate-spin" />}
                  {creating ? 'Opening...' : t.case_open}
                </button>
                <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary text-sm px-4">{t.cancel}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
