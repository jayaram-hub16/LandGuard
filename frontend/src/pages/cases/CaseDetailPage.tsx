// Case Detail Page — full case view with history, evidence, surveys, status management
import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Briefcase, Clock, CheckCircle, AlertTriangle,
  Users, FileText, MapPin, Loader2, ChevronDown, Plus,
  ClipboardList, PenLine, Upload, Download, UserCheck
} from 'lucide-react'
import api, { casesAPI, surveysAPI, uploadsAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import type { Case, CaseHistoryEntry, FieldSurvey } from '../../types'

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

const NEXT_STATUSES: Record<string, string[]> = {
  'Reported':              ['Under Review', 'Field Survey Assigned'],
  'Under Review':          ['Field Survey Assigned', 'Decision Pending', 'Disputed'],
  'Field Survey Assigned': ['Survey Submitted', 'Under Review'],
  'Survey Submitted':      ['Decision Pending', 'Disputed'],
  'Decision Pending':      ['Resolved', 'Disputed', 'Referred for Appeal'],
  'Disputed':              ['Referred for Appeal', 'Decision Pending'],
  'Referred for Appeal':   ['Decision Pending'],
}

export default function CaseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [caseData, setCaseData] = useState<Case | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [statusForm, setStatusForm] = useState({ status: '', notes: '', decision_reason: '' })
  const [updating, setUpdating] = useState(false)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [addNote, setAddNote] = useState('')
  const [addingEvidence, setAddingEvidence] = useState(false)

  // Staff Assignment state
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [staffList, setStaffList] = useState<{ id: string; full_name: string; email: string; role: string }[]>([])
  const [assignSurveyorId, setAssignSurveyorId] = useState('')
  const [assignReviewerId, setAssignReviewerId] = useState('')
  const [assigning, setAssigning] = useState(false)

  // File Upload Evidence state
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [evidenceType, setEvidenceType] = useState('photo')
  const [uploadDesc, setUploadDesc] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  useEffect(() => { if (id) fetchCase() }, [id])

  const fetchCase = async () => {
    setLoading(true)
    try {
      const res = await casesAPI.get(id!)
      setCaseData(res.data)
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 404 || status === 403) setNotFound(true)
    } finally { setLoading(false) }
  }

  const handleStatusUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!statusForm.status || !caseData) return
    setUpdating(true)
    try {
      const res = await casesAPI.updateStatus(caseData.id, statusForm)
      setCaseData({ ...caseData, status: res.data.status, decision_reason: res.data.decision_reason })
      setShowStatusModal(false)
      fetchCase()
    } catch { /* handled */ }
    finally { setUpdating(false) }
  }

  const handleAddNote = async () => {
    if (!addNote.trim() || !caseData) return
    try {
      await casesAPI.addEvidence(caseData.id, { evidence_type: 'note', description: addNote.trim() })
      setAddNote('')
      fetchCase()
    } catch { /* handled */ }
  }

  const openAssignModal = async () => {
    if (!caseData) return
    setAssignSurveyorId(caseData.assigned_surveyor || '')
    setAssignReviewerId(caseData.assigned_reviewer || '')
    setShowAssignModal(true)
    try {
      const res = await api.get('/admin/staff')
      setStaffList(res.data.staff || [])
    } catch { /* handled */ }
  }

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!caseData) return
    setAssigning(true)
    try {
      await casesAPI.assign(caseData.id, {
        surveyor_id: assignSurveyorId || null,
        reviewer_id: assignReviewerId || null,
      })
      setShowAssignModal(false)
      fetchCase()
    } catch { /* handled */ }
    finally { setAssigning(false) }
  }

  const handleUploadEvidence = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!uploadFile || !caseData) {
      setUploadError('Please select a file to upload.')
      return
    }
    setUploading(true)
    setUploadError('')
    try {
      const formData = new FormData()
      formData.append('file', uploadFile)
      formData.append('evidence_type', evidenceType)
      formData.append('description', uploadDesc)

      await uploadsAPI.uploadCaseEvidence(caseData.id, formData)
      setShowUploadModal(false)
      setUploadFile(null)
      setUploadDesc('')
      fetchCase()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setUploadError(msg || 'Failed to upload evidence.')
    } finally { setUploading(false) }
  }

  const canManage = user?.role === 'ADMIN' || user?.role === 'REVIEWER'
  const nextStatuses = caseData ? NEXT_STATUSES[caseData.status] || [] : []

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={24} className="animate-spin text-blue-600" />
    </div>
  )
  if (notFound || !caseData) return (
    <div className="text-center py-16 text-slate-400">
      <Briefcase size={40} className="mx-auto mb-4 opacity-30" />
      <p className="text-lg">Case not found or access denied.</p>
      <button onClick={() => navigate('/cases')} className="btn-primary mt-4 text-sm px-4 py-2">Back to Cases</button>
    </div>
  )

  return (
    <div className="space-y-4 animate-fade-in max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/cases')} className="btn-ghost p-2"><ArrowLeft size={18} /></button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-lg font-bold text-slate-900">{caseData.case_number}</h1>
            <span className={`badge border text-xs ${STATUS_COLORS[caseData.status] || 'badge-user'}`}>{caseData.status}</span>
            {caseData.is_overdue && <span className="badge text-xs bg-red-500/20 text-red-400 border-red-500/30">OVERDUE</span>}
            <span className={`text-xs font-semibold ${
              caseData.priority === 'Critical' ? 'text-red-400' : caseData.priority === 'High' ? 'text-orange-400' :
              caseData.priority === 'Medium' ? 'text-amber-400' : 'text-green-400'
            }`}>● {caseData.priority} Priority</span>
          </div>
          <p className="text-slate-700 text-sm mt-0.5">{caseData.title}</p>
        </div>
        <div className="flex gap-2">
          {canManage && (
            <button onClick={openAssignModal}
              className="btn-secondary text-sm px-3 py-2 flex items-center gap-1.5" id="case-assign-staff-btn">
              <UserCheck size={15} /> Assign Staff
            </button>
          )}
          {canManage && nextStatuses.length > 0 && (
            <button onClick={() => { setStatusForm({ status: nextStatuses[0], notes: '', decision_reason: '' }); setShowStatusModal(true) }}
              className="btn-primary text-sm px-4 py-2 flex items-center gap-2" id="case-advance-status-btn">
              <ChevronDown size={15} /> Advance Status
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main Details */}
        <div className="lg:col-span-2 space-y-4">
          {/* Info Card */}
          <div className="glass-card p-4 space-y-3">
            <h3 className="font-semibold text-slate-800 text-sm">Case Details</h3>
            {caseData.description && <p className="text-slate-500 text-sm leading-relaxed">{caseData.description}</p>}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['Parcel', caseData.parcel?.parcel_id || '—'],
                ['Opened By', caseData.opener_name || '—'],
                ['Assigned Surveyor', caseData.surveyor_name || 'Not assigned'],
                ['Reviewer', caseData.reviewer_name || 'Not assigned'],
                ['Deadline', caseData.deadline ? new Date(caseData.deadline).toLocaleDateString() : '—'],
                ['Resolved', caseData.resolved_at ? new Date(caseData.resolved_at).toLocaleDateString() : '—'],
                ['Created', caseData.created_at ? new Date(caseData.created_at).toLocaleDateString() : '—'],
                ['Evidence Items', String(caseData.evidence_count)],
              ].map(([label, val]) => (
                <div key={label}>
                  <div className="text-xs text-slate-400">{label}</div>
                  <div className="text-slate-800 text-xs font-medium mt-0.5">{val}</div>
                </div>
              ))}
            </div>
            {caseData.decision_reason && (
              <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3">
                <div className="text-xs text-green-400 font-semibold mb-1">Decision Reason</div>
                <div className="text-slate-700 text-sm">{caseData.decision_reason}</div>
              </div>
            )}
          </div>

          {/* Evidence & Notes */}
          <div className="glass-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                <FileText size={14} className="text-violet-400" /> Evidence & Notes
              </h3>
              <button onClick={() => { setUploadError(''); setShowUploadModal(true) }}
                className="btn-secondary text-xs px-2.5 py-1 flex items-center gap-1" id="case-upload-evidence-btn">
                <Upload size={12} /> Upload File
              </button>
            </div>
            {(caseData.evidence || []).length === 0 ? (
              <p className="text-slate-400 text-xs italic">No evidence attached yet.</p>
            ) : (
              <div className="space-y-2">
                {(caseData.evidence || []).map(ev => (
                  <div key={ev.id} className="bg-white/40 rounded-lg px-3 py-2 border border-slate-200/40">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{ev.evidence_type}</span>
                      <span className="text-xs text-slate-400">{ev.submitter_name}</span>
                    </div>
                    {ev.description && <p className="text-slate-700 text-xs mt-1">{ev.description}</p>}
                    {ev.file_name && (
                      <div className="flex items-center gap-2 mt-1.5 text-xs text-blue-600 bg-white/40 px-2 py-1 rounded">
                        <FileText size={12} />
                        <span className="font-mono truncate max-w-[200px]">{ev.file_name}</span>
                        <button
                          onClick={async () => {
                            try {
                              const res = await uploadsAPI.downloadEvidence(ev.id)
                              const url = URL.createObjectURL(new Blob([res.data]))
                              const a = document.createElement('a')
                              a.href = url
                              a.download = ev.file_name || 'evidence'
                              a.click()
                              URL.revokeObjectURL(url)
                            } catch { alert('Download failed.') }
                          }}
                          className="hover:underline flex items-center gap-1 text-[11px] text-slate-700 ml-auto"
                        >
                          <Download size={11} /> Download
                        </button>
                      </div>
                    )}
                    {ev.coordinates_lat && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-slate-400">
                        <MapPin size={10} /> {ev.coordinates_lat.toFixed(5)}, {ev.coordinates_lng?.toFixed(5)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {/* Add Note */}
            <div className="flex gap-2 pt-2 border-t border-slate-200/40">
              <input type="text" placeholder="Add a note or observation..."
                className="input-field text-xs py-1.5 flex-1" value={addNote}
                onChange={e => setAddNote(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddNote()}
                id="case-add-note-input" />
              <button onClick={handleAddNote} className="btn-secondary text-xs px-3 py-1.5" id="case-add-note-btn">
                <Plus size={12} />
              </button>
            </div>
          </div>

          {/* Field Surveys */}
          {(caseData.surveys || []).length > 0 && (
            <div className="glass-card p-4 space-y-3">
              <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                <ClipboardList size={14} className="text-cyan-400" /> Field Surveys
              </h3>
              {(caseData.surveys || []).map((sv: FieldSurvey) => (
                <div key={sv.id} className="bg-white/40 rounded-lg p-3 border border-slate-200/40 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">{sv.surveyor_name}</span>
                    <span className={`badge text-xs ${sv.status === 'submitted' ? 'badge-verified' : sv.status === 'accepted' ? 'badge-verified' : sv.status === 'rejected' ? 'badge-false-positive' : 'badge-user'}`}>
                      {sv.status}
                    </span>
                  </div>
                  {sv.survey_date && <div className="text-xs text-slate-400">Date: {sv.survey_date}</div>}
                  {sv.encroachment_found && <div className="text-xs text-red-400 font-semibold">⚠ Encroachment found in field</div>}
                  {sv.notes && <p className="text-xs text-slate-500">{sv.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Status History */}
        <div className="space-y-4">
          <div className="glass-card p-4">
            <h3 className="font-semibold text-slate-800 text-sm mb-3 flex items-center gap-2">
              <Clock size={14} className="text-blue-600" /> Status History
            </h3>
            <div className="space-y-3">
              {(caseData.history || []).map((h: CaseHistoryEntry, i) => (
                <div key={h.id} className="relative pl-5">
                  <div className={`absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full border-2 ${
                    i === 0 ? 'bg-accent-blue border-accent-blue' : 'bg-slate-100 border-slate-300'
                  }`} />
                  {i < (caseData.history?.length || 0) - 1 && (
                    <div className="absolute left-1 top-4 w-px h-full bg-slate-100" />
                  )}
                  <div className="text-xs font-semibold text-slate-800">{h.new_status}</div>
                  <div className="text-xs text-slate-400">{h.actor_name}</div>
                  {h.notes && <div className="text-xs text-slate-400 italic">{h.notes}</div>}
                  <div className="text-xs text-slate-300 mt-0.5">
                    {h.changed_at ? new Date(h.changed_at).toLocaleDateString() : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Status Update Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-card w-full max-w-md p-6 space-y-4 animate-fade-in">
            <h2 className="font-bold text-slate-900">Advance Case Status</h2>
            <form onSubmit={handleStatusUpdate} className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold block mb-1">New Status *</label>
                <select className="input-field text-sm" id="status-select"
                  value={statusForm.status} onChange={e => setStatusForm(f => ({ ...f, status: e.target.value }))}>
                  {nextStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold block mb-1">Notes</label>
                <textarea className="input-field text-sm h-20 resize-none" id="status-notes"
                  value={statusForm.notes} onChange={e => setStatusForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Reason for status change..." />
              </div>
              {statusForm.status === 'Resolved' && (
                <div>
                  <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold block mb-1">Decision Reason *</label>
                  <textarea className="input-field text-sm h-20 resize-none" id="status-decision"
                    value={statusForm.decision_reason} onChange={e => setStatusForm(f => ({ ...f, decision_reason: e.target.value }))}
                    placeholder="Official decision and grounds for resolution..." />
                </div>
              )}
              <div className="flex gap-3">
                <button type="submit" disabled={updating} className="btn-primary text-sm flex-1 flex items-center justify-center gap-2" id="status-submit-btn">
                  {updating && <Loader2 size={14} className="animate-spin" />} Update Status
                </button>
                <button type="button" onClick={() => setShowStatusModal(false)} className="btn-secondary text-sm px-4">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Staff Assignment Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-card w-full max-w-md p-6 space-y-4 animate-fade-in">
            <h2 className="font-bold text-slate-900 flex items-center gap-2">
              <UserCheck size={18} className="text-blue-600" /> Assign Case Staff
            </h2>
            <form onSubmit={handleAssign} className="space-y-4">
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold block mb-1">
                  Assign Field Surveyor
                </label>
                <select className="input-field text-sm" id="assign-surveyor-select"
                  value={assignSurveyorId} onChange={e => setAssignSurveyorId(e.target.value)}>
                  <option value="">Unassigned</option>
                  {staffList.filter(s => s.role === 'SURVEYOR' || s.role === 'ADMIN').map(s => (
                    <option key={s.id} value={s.id}>{s.full_name} ({s.email}) - {s.role}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold block mb-1">
                  Assign Case Reviewer
                </label>
                <select className="input-field text-sm" id="assign-reviewer-select"
                  value={assignReviewerId} onChange={e => setAssignReviewerId(e.target.value)}>
                  <option value="">Unassigned</option>
                  {staffList.filter(s => s.role === 'REVIEWER' || s.role === 'ADMIN').map(s => (
                    <option key={s.id} value={s.id}>{s.full_name} ({s.email}) - {s.role}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-slate-400 italic">
                Assigning a surveyor automatically transitions cases to &ldquo;Field Survey Assigned&rdquo; status.
              </p>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={assigning}
                  className="btn-primary text-sm flex-1 flex items-center justify-center gap-2" id="assign-submit-btn">
                  {assigning && <Loader2 size={14} className="animate-spin" />} Save Assignment
                </button>
                <button type="button" onClick={() => setShowAssignModal(false)} className="btn-secondary text-sm px-4">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload Evidence Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-card w-full max-w-md p-6 space-y-4 animate-fade-in">
            <h2 className="font-bold text-slate-900 flex items-center gap-2">
              <Upload size={18} className="text-violet-400" /> Upload Case Evidence
            </h2>
            {uploadError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2.5 text-red-400 text-xs">
                {uploadError}
              </div>
            )}
            <form onSubmit={handleUploadEvidence} className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold block mb-1">
                  Evidence File * (Images, PDF, Docs up to 10MB)
                </label>
                <input
                  type="file"
                  id="evidence-file-input"
                  onChange={e => setUploadFile(e.target.files?.[0] || null)}
                  className="input-field text-xs py-2 file:mr-3 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-800"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold block mb-1">
                  Evidence Type
                </label>
                <select
                  value={evidenceType}
                  onChange={e => setEvidenceType(e.target.value)}
                  className="input-field text-sm"
                  id="evidence-type-select"
                >
                  <option value="photo">Photograph</option>
                  <option value="document">Legal / Survey Document</option>
                  <option value="measurement">Field Measurement Record</option>
                  <option value="note">Written Statement</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold block mb-1">
                  Description / Context
                </label>
                <textarea
                  value={uploadDesc}
                  onChange={e => setUploadDesc(e.target.value)}
                  className="input-field text-sm h-20 resize-none"
                  placeholder="Details regarding this evidence..."
                  id="evidence-desc-input"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={uploading}
                  className="btn-primary text-sm flex-1 flex items-center justify-center gap-2"
                  id="upload-evidence-submit-btn"
                >
                  {uploading && <Loader2 size={14} className="animate-spin" />} Upload Evidence
                </button>
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="btn-secondary text-sm px-4"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
