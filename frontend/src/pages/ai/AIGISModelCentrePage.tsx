/**
 * AI & GIS Model Centre — Overview page with 6 model cards.
 * Models 1, 2, 5 are "Not Configured" (require external data).
 * Models 3 (LULC), 4 (Boundary Overlap) and 6 (Waterbody) are available.
 */
import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Cpu, Satellite, Building2, Map, Layers, Mountain, Droplets,
  CheckCircle2, AlertTriangle, XCircle, Loader2, ChevronRight,
  RefreshCw, Info,
} from 'lucide-react'
import { aiModelsAPI } from '../../services/api'
import type { AIModelStatus } from '../../types'

// ── Model card configuration ──────────────────────────────────────

interface ModelCard {
  key: string
  icon: React.ReactNode
  route: string
  iconBg: string
}

const MODEL_CARDS: ModelCard[] = [
  {
    key: 'change-detection',
    icon: <Satellite size={28} />,
    route: '/ai-models/change-detection',
    iconBg: 'from-violet-500 to-purple-600',
  },
  {
    key: 'building-detection',
    icon: <Building2 size={28} />,
    route: '/ai-models/building-detection',
    iconBg: 'from-orange-500 to-red-600',
  },
  {
    key: 'lulc',
    icon: <Layers size={28} />,
    route: '/ai-models/lulc',
    iconBg: 'from-green-500 to-emerald-600',
  },
  {
    key: 'boundary-overlap',
    icon: <Map size={28} />,
    route: '/ai-models/boundary-overlap',
    iconBg: 'from-blue-500 to-cyan-600',
  },
  {
    key: 'dem',
    icon: <Mountain size={28} />,
    route: '/ai-models/dem',
    iconBg: 'from-amber-500 to-yellow-600',
  },
  {
    key: 'waterbody',
    icon: <Droplets size={28} />,
    route: '/ai-models/waterbody',
    iconBg: 'from-sky-500 to-blue-600',
  },
]

// ── Status badge ──────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    available:      { label: 'Available',      cls: 'bg-green-50 text-green-700 border border-green-200',   icon: <CheckCircle2 size={12} /> },
    not_configured: { label: 'Not Configured', cls: 'bg-amber-50 text-amber-700 border border-amber-200',   icon: <AlertTriangle size={12} /> },
    processing:     { label: 'Processing',     cls: 'bg-blue-50 text-blue-700 border border-blue-200',      icon: <Loader2 size={12} className="animate-spin" /> },
    error:          { label: 'Error',          cls: 'bg-red-50 text-red-700 border border-red-200',         icon: <XCircle size={12} /> },
    completed:      { label: 'Completed',      cls: 'bg-green-50 text-green-700 border border-green-200',   icon: <CheckCircle2 size={12} /> },
    failed:         { label: 'Failed',         cls: 'bg-red-50 text-red-700 border border-red-200',         icon: <XCircle size={12} /> },
  }
  const { label, cls, icon } = map[status] ?? map.not_configured
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {icon}{label}
    </span>
  )
}

// ── Main page ─────────────────────────────────────────────────────

export default function AIGISModelCentrePage() {
  const navigate = useNavigate()
  const [catalogue, setCatalogue] = useState<Record<string, AIModelStatus>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await aiModelsAPI.status()
      setCatalogue(res.data)
    } catch {
      setError('Could not load model status. Ensure the backend is running.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  const availableCount  = Object.values(catalogue).filter(m => m.status === 'available').length
  const completedCount  = Object.values(catalogue).filter(m => m.last_run?.run_status === 'completed').length
  const notConfigCount  = Object.values(catalogue).filter(m => m.status === 'not_configured').length

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600">
              <Cpu size={22} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">AI &amp; GIS Model Centre</h1>
          </div>
          <p className="text-slate-400 text-sm max-w-2xl">
            Advanced spatial intelligence models for land monitoring, encroachment detection,
            and GIS analysis. Models requiring external data show their configuration requirements.
          </p>
        </div>
        <button
          onClick={fetchStatus}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm transition disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Models Available',   value: availableCount,  color: 'text-green-400' },
          { label: 'Runs Completed',     value: completedCount,  color: 'text-blue-400'  },
          { label: 'Need Configuration', value: notConfigCount,  color: 'text-amber-400' },
        ].map(s => (
          <div key={s.label} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-center">
            <div className={`text-3xl font-bold ${s.color}`}>{loading ? '—' : s.value}</div>
            <div className="text-slate-400 text-xs mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Model cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {MODEL_CARDS.map(card => {
          const info = catalogue[card.key]
          const hasLastRun = info?.last_run != null
          const lastRunCompleted = info?.last_run?.run_status === 'completed'
          const dateStr = info?.last_run?.completed_at
            ? new Date(info.last_run.completed_at).toLocaleDateString('en-IN', {
                day: '2-digit', month: 'short', year: 'numeric',
              })
            : null

          return (
            <div
              key={card.key}
              className="glass-card-hover p-5 flex flex-col gap-4 group"
            >
              {/* Card header */}
              <div className="flex items-start gap-3">
                <div className={`p-2.5 rounded-xl bg-gradient-to-br ${card.iconBg} text-white shrink-0 shadow-sm`}>
                  {card.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h2 className="text-slate-900 font-semibold text-sm leading-tight">
                      {loading ? <span className="text-slate-400">Loading…</span> : (info?.name ?? card.key)}
                    </h2>
                  </div>
                  {!loading && info && <StatusBadge status={info.status} />}
                </div>
              </div>

              {/* Description */}
              {!loading && info && (
                <p className="text-slate-500 text-xs leading-relaxed flex-1">
                  {info.description}
                </p>
              )}

              {/* Not-configured requirements */}
              {!loading && info?.status === 'not_configured' && info.reason && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 text-amber-700 text-xs font-semibold mb-1">
                    <Info size={12} /> Configuration Required
                  </div>
                  <p className="text-amber-800/80 text-xs leading-relaxed">{info.reason}</p>
                </div>
              )}

              {/* Last run info */}
              {!loading && hasLastRun && (
                <div className="text-xs text-slate-500">
                  Last run:{' '}
                  <span className={lastRunCompleted ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                    {info.last_run!.run_status}
                  </span>
                  {dateStr && <span className="ml-1 text-slate-400">· {dateStr}</span>}
                  {info.last_run?.confidence != null && (
                    <span className="ml-1 text-slate-400">
                      · {(info.last_run.confidence * 100).toFixed(0)}% avg confidence
                    </span>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-2 mt-auto">
                <button
                  onClick={() => navigate(card.route)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg btn-primary text-xs font-medium transition"
                >
                  {info?.status === 'not_configured' ? 'View Requirements' : 'Open Model'}
                  <ChevronRight size={13} />
                </button>
                {!loading && lastRunCompleted && (
                  <button
                    onClick={() => navigate(card.route)}
                    className="py-2 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition border border-slate-200"
                  >
                    Results
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer note */}
      <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-4 text-xs text-slate-500">
        <strong className="text-slate-400">Important:</strong> AI and GIS analysis results are
        preliminary findings only. They do not constitute legal proof of encroachment or establish
        land ownership. All findings must be verified by an authorised surveyor before any legal action.
      </div>
    </div>
  )
}

