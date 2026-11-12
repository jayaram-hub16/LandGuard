// Reports Page — generate and download PDF/CSV reports
import React, { useEffect, useState } from 'react'
import { BarChart3, Download, Plus, FileText, Loader2, RefreshCw, X, AlertTriangle } from 'lucide-react'
import { reportsAPI } from '../../services/api'
import api from '../../services/api'
import type { Report } from '../../types'

const REPORT_TYPES = [
  { value: 'detection_summary', label: 'Detection Summary' },
  { value: 'parcel_summary', label: 'Land Parcel Summary' },
]

interface CreateReportModalProps {
  onClose: () => void
  onCreated: () => void
}

function CreateReportModal({ onClose, onCreated }: CreateReportModalProps) {
  const [form, setForm] = useState({ title: '', report_type: 'detection_summary', format: 'pdf' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setSaving(true)
    try {
      await reportsAPI.create({ ...form })
      onCreated()
      onClose()
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to generate report.')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-card w-full max-w-md p-6 z-10 animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-900">Generate New Report</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Report Title</label>
            <input
              id="report-title-input"
              type="text"
              className="input-field text-sm py-2"
              placeholder="My Report Title"
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Report Type</label>
            <select id="report-type-select" className="input-field text-sm py-2"
                    value={form.report_type}
                    onChange={e => setForm(p => ({ ...p, report_type: e.target.value }))}>
              {REPORT_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Format</label>
            <div className="flex gap-3">
              {['pdf', 'csv'].map(fmt => (
                <button
                  key={fmt}
                  onClick={() => setForm(p => ({ ...p, format: fmt }))}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${
                    form.format === fmt
                      ? 'bg-blue-50 border-blue-200 text-blue-600'
                      : 'bg-white border-slate-300 text-slate-500 hover:border-slate-300'
                  }`}
                  id={`report-format-${fmt}`}
                >
                  {fmt.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="disclaimer-box text-xs">
            <AlertTriangle size={12} className="inline mr-1" />
            Reports include a mandatory disclaimer: findings are preliminary and require field verification.
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary flex-1 text-sm">Cancel</button>
            <button id="report-generate-btn" onClick={submit} disabled={saving}
                    className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm">
              {saving && <Loader2 size={14} className="animate-spin" />}
              Generate
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const res = await reportsAPI.list()
      setReports(res.data.reports || [])
    } catch { /* handled */ }
    finally { setLoading(false) }
  }

  const handleDownload = async (report: Report) => {
    setDownloading(report.id)
    try {
      const res = await reportsAPI.download(report.id)
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `landguard_${report.report_type}_${report.id.slice(0, 8)}.${report.format}`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch { /* handled */ }
    finally { setDownloading(null) }
  }

  const handleExportParcelsCSV = async () => {
    try {
      const res = await api.get('/parcels/export/csv', { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
      const a = document.createElement('a')
      a.href = url
      a.download = 'landguard_parcels.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('CSV export failed. Please try again.')
    }
  }

  const handleExportDetectionsCSV = async () => {
    try {
      const res = await api.get('/detections/export/csv', { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
      const a = document.createElement('a')
      a.href = url
      a.download = 'landguard_detections.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('CSV export failed. Please try again.')
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Reports & Exports</h1>
          <p className="text-slate-400 text-sm">Generate and download PDF/CSV reports</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={load} className="btn-ghost p-2" id="reports-refresh-btn"><RefreshCw size={16} /></button>
          <button
            onClick={handleExportParcelsCSV}
            className="btn-secondary flex items-center gap-2 text-sm px-4 py-2"
            id="reports-export-parcels-csv-btn"
          >
            <Download size={15} /> Parcels CSV
          </button>
          <button
            onClick={handleExportDetectionsCSV}
            className="btn-secondary flex items-center gap-2 text-sm px-4 py-2"
            id="reports-export-detections-csv-btn"
          >
            <Download size={15} /> Detections CSV
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="btn-primary flex items-center gap-2 text-sm px-4 py-2"
            id="reports-create-btn"
          >
            <Plus size={15} /> New Report
          </button>
        </div>
      </div>

      <div className="disclaimer-box">
        <AlertTriangle size={13} className="inline mr-1" />
        All reports include a mandatory disclaimer: results are based on simulated data and geometric analysis only.
        Reports are NOT legal documents and require field verification.
      </div>

      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-slate-500">
            <Loader2 size={18} className="animate-spin" /> Loading reports...
          </div>
        ) : reports.length === 0 ? (
          <div className="py-16 text-center">
            <BarChart3 size={40} className="text-slate-300 mx-auto mb-3" />
            <p className="text-slate-400 mb-4">No reports yet. Generate your first report.</p>
            <button onClick={() => setShowCreate(true)} className="btn-primary text-sm px-4 py-2">
              Generate Report
            </button>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Format</th>
                <th>Created</th>
                <th>Download</th>
              </tr>
            </thead>
            <tbody>
              {reports.map(r => (
                <tr key={r.id}>
                  <td className="font-medium text-slate-800">{r.title}</td>
                  <td className="text-xs text-slate-500">{r.report_type?.replace('_', ' ')}</td>
                  <td>
                    <span className={`badge text-xs ${r.format === 'pdf' ? 'badge-high' : 'badge-verified'}`}>
                      {r.format?.toUpperCase()}
                    </span>
                  </td>
                  <td className="text-xs text-slate-400">
                    {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
                  </td>
                  <td>
                    <button
                      onClick={() => handleDownload(r)}
                      disabled={downloading === r.id}
                      className="btn-ghost p-1.5 text-slate-500 hover:text-blue-600"
                      title="Download"
                      id={`download-report-${r.id.slice(0, 8)}`}
                    >
                      {downloading === r.id
                        ? <Loader2 size={14} className="animate-spin" />
                        : <Download size={14} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <CreateReportModal onClose={() => setShowCreate(false)} onCreated={load} />
      )}
    </div>
  )
}
