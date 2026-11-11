// Field Survey Page — surveyor field submission form with draft/submit workflow
import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ClipboardList, MapPin, Loader2, Save, Send, RefreshCw,
  CheckCircle, AlertTriangle, ChevronDown
} from 'lucide-react'
import { surveysAPI, casesAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { useLang } from '../../context/LangContext'
import type { FieldSurvey, Case } from '../../types'

const LAND_USE_OPTIONS = [
  'Residential', 'Commercial', 'Agriculture', 'Road', 'Water Body',
  'Forest', 'Industrial', 'Other', 'Unknown',
]

export default function FieldSurveyPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const { t } = useLang()

  const caseIdParam = searchParams.get('case_id') || ''
  const editId      = searchParams.get('edit')    || ''

  const [surveys, setSurveys] = useState<FieldSurvey[]>([])
  const [loading, setLoading]   = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess]   = useState('')
  const [error, setError]       = useState('')
  const [myCase, setMyCase]     = useState<Case | null>(null)
  const [editingSurvey, setEditingSurvey] = useState<FieldSurvey | null>(null)

  const [form, setForm] = useState({
    case_id:            caseIdParam,
    parcel_id:          '',
    survey_number:      '',
    survey_date:        new Date().toISOString().slice(0, 10),
    land_use_observed:  '',
    observed_area_sqm:  '',
    measurement_unit:   'sqm',
    accuracy_meters:    '',
    centroid_lat:       '',
    centroid_lng:       '',
    encroachment_found: false,
    notes:              '',
    recommendations:    '',
  })

  useEffect(() => { loadData() }, [])
  useEffect(() => {
    if (caseIdParam) fetchCase(caseIdParam)
  }, [caseIdParam])

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await surveysAPI.list({ per_page: 50 })
      setSurveys(res.data.surveys || [])
    } catch { /* handled */ }
    finally { setLoading(false) }
  }

  const fetchCase = async (id: string) => {
    try {
      const res = await casesAPI.get(id)
      setMyCase(res.data)
    } catch { /* ignore */ }
  }

  const setF = (field: string) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm(f => ({ ...f, [field]: e.target.value }))

  const useGPS = () => {
    if (!navigator.geolocation) {
      setError('Location services not available on this device.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        setForm(f => ({
          ...f,
          centroid_lat:    pos.coords.latitude.toFixed(7),
          centroid_lng:    pos.coords.longitude.toFixed(7),
          accuracy_meters: pos.coords.accuracy.toFixed(1),
        }))
      },
      () => setError('Could not get GPS location. Enter coordinates manually.')
    )
  }

  const handleSaveDraft = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true); setError(''); setSuccess('')
    try {
      const payload = {
        ...form,
        observed_area_sqm: form.observed_area_sqm ? parseFloat(form.observed_area_sqm) : null,
        accuracy_meters:   form.accuracy_meters   ? parseFloat(form.accuracy_meters)   : null,
        centroid_lat:      form.centroid_lat      ? parseFloat(form.centroid_lat)      : null,
        centroid_lng:      form.centroid_lng      ? parseFloat(form.centroid_lng)      : null,
      }
      if (editingSurvey) {
        await surveysAPI.update(editingSurvey.id, payload)
        setSuccess('Draft saved successfully.')
      } else {
        const res = await surveysAPI.create(payload)
        setEditingSurvey(res.data)
        setSuccess('Draft created. You can submit when ready.')
      }
      loadData()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string; errors?: Record<string, string> } } })?.response?.data
      setError(msg?.error || Object.values(msg?.errors || {}).join(', ') || 'Save failed.')
    } finally { setSubmitting(false) }
  }

  const handleSubmit = async () => {
    if (!editingSurvey) { setError('Save as draft first.'); return }
    if (!form.survey_date) { setError('Survey date is required before submitting.'); return }
    setSubmitting(true); setError('')
    try {
      // Save latest edits first
      await surveysAPI.update(editingSurvey.id, {
        ...form,
        observed_area_sqm: form.observed_area_sqm ? parseFloat(form.observed_area_sqm) : null,
        accuracy_meters:   form.accuracy_meters   ? parseFloat(form.accuracy_meters)   : null,
        centroid_lat:      form.centroid_lat      ? parseFloat(form.centroid_lat)      : null,
        centroid_lng:      form.centroid_lng      ? parseFloat(form.centroid_lng)      : null,
      })
      await surveysAPI.submit(editingSurvey.id)
      setSuccess('Survey submitted for review. The case status has been updated.')
      loadData()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg || 'Submission failed.')
    } finally { setSubmitting(false) }
  }

  const loadEdit = (s: FieldSurvey) => {
    setEditingSurvey(s)
    setForm({
      case_id:           s.case_id || '',
      parcel_id:         s.parcel_id || '',
      survey_number:     s.survey_number || '',
      survey_date:       s.survey_date || '',
      land_use_observed: s.land_use_observed || '',
      observed_area_sqm: s.observed_area_sqm?.toString() || '',
      measurement_unit:  s.measurement_unit || 'sqm',
      accuracy_meters:   s.accuracy_meters?.toString() || '',
      centroid_lat:      s.centroid_lat?.toString() || '',
      centroid_lng:      s.centroid_lng?.toString() || '',
      encroachment_found:s.encroachment_found,
      notes:             s.notes || '',
      recommendations:   s.recommendations || '',
    })
    if (s.case_id) fetchCase(s.case_id)
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-dark-100 flex items-center gap-2">
            <ClipboardList size={20} className="text-cyan-400" /> {t.surveys_title}
          </h1>
          <p className="text-dark-500 text-sm">
            {editingSurvey ? `Editing draft: ${editingSurvey.id.slice(0, 8)}` : 'New Field Survey'}
            {myCase && <span className="ml-2 text-accent-blue">• Case {myCase.case_number}</span>}
          </p>
        </div>
        <button onClick={loadData} className="btn-ghost p-2" id="surveys-refresh-btn"><RefreshCw size={16} /></button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Form */}
        <div className="lg:col-span-2">
          <div className="glass-card p-5">
            <h2 className="font-semibold text-dark-200 mb-4 text-sm">{editingSurvey ? 'Edit Draft Survey' : 'New Survey'}</h2>

            {success && (
              <div className="mb-4 bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-green-400 text-sm flex items-center gap-2">
                <CheckCircle size={14} /> {success}
              </div>
            )}
            {error && (
              <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm flex items-center gap-2">
                <AlertTriangle size={14} /> {error}
              </div>
            )}

            <form onSubmit={handleSaveDraft} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">{t.survey_number}</label>
                  <input id="survey-number" type="text" className="input-field text-sm py-2"
                    value={form.survey_number} onChange={setF('survey_number')}
                    placeholder="e.g. SV-2024-001" />
                </div>
                <div>
                  <label className="field-label">{t.survey_date} *</label>
                  <input id="survey-date" type="date" className="input-field text-sm py-2"
                    value={form.survey_date} onChange={setF('survey_date')} required />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Case ID</label>
                  <input id="survey-case" type="text" className="input-field text-sm py-2"
                    value={form.case_id} onChange={setF('case_id')}
                    placeholder="Link to case (optional)" />
                </div>
                <div>
                  <label className="field-label">Parcel ID</label>
                  <input id="survey-parcel" type="text" className="input-field text-sm py-2"
                    value={form.parcel_id} onChange={setF('parcel_id')}
                    placeholder="Parcel registration ID" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="field-label">{t.survey_area}</label>
                  <input id="survey-area" type="number" className="input-field text-sm py-2"
                    value={form.observed_area_sqm} onChange={setF('observed_area_sqm')}
                    placeholder="0.00" step="0.01" />
                </div>
                <div>
                  <label className="field-label">Unit</label>
                  <select id="survey-unit" className="input-field text-sm py-2"
                    value={form.measurement_unit} onChange={setF('measurement_unit')}>
                    <option value="sqm">m²</option>
                    <option value="acres">Acres</option>
                    <option value="hectares">Hectares</option>
                    <option value="cents">Cents</option>
                  </select>
                </div>
                <div>
                  <label className="field-label">{t.survey_accuracy}</label>
                  <input id="survey-accuracy" type="number" className="input-field text-sm py-2"
                    value={form.accuracy_meters} onChange={setF('accuracy_meters')}
                    placeholder="±m" step="0.1" />
                </div>
              </div>

              {/* GPS Coordinates */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="field-label">GPS Coordinates</label>
                  <button type="button" onClick={useGPS}
                    className="text-xs text-accent-blue hover:underline flex items-center gap-1" id="use-gps-btn">
                    <MapPin size={11} /> Use Device GPS
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input id="survey-lat" type="number" className="input-field text-sm py-2"
                    value={form.centroid_lat} onChange={setF('centroid_lat')}
                    placeholder="Latitude (e.g. 17.385044)" step="0.0000001" />
                  <input id="survey-lng" type="number" className="input-field text-sm py-2"
                    value={form.centroid_lng} onChange={setF('centroid_lng')}
                    placeholder="Longitude (e.g. 78.486671)" step="0.0000001" />
                </div>
                <p className="text-xs text-dark-600 mt-1">
                  If GPS is unavailable, enter coordinates manually or leave blank.
                </p>
              </div>

              <div>
                <label className="field-label">{t.survey_land_use}</label>
                <select id="survey-land-use" className="input-field text-sm py-2"
                  value={form.land_use_observed} onChange={setF('land_use_observed')}>
                  <option value="">— Select land use observed —</option>
                  {LAND_USE_OPTIONS.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>

              <div>
                <label className="field-label flex items-center gap-2 cursor-pointer select-none">
                  <input id="survey-encroach-check" type="checkbox"
                    className="w-4 h-4 rounded border-dark-600 bg-dark-800"
                    checked={form.encroachment_found}
                    onChange={e => setForm(f => ({ ...f, encroachment_found: e.target.checked }))} />
                  <span>{t.survey_encroach}</span>
                </label>
              </div>

              <div>
                <label className="field-label">{t.notes}</label>
                <textarea id="survey-notes" className="input-field text-sm py-2 h-28 resize-none"
                  value={form.notes} onChange={setF('notes')}
                  placeholder="Detailed field observations, measurements, boundary discrepancies..." />
              </div>

              <div>
                <label className="field-label">Recommendations</label>
                <textarea id="survey-recommendations" className="input-field text-sm py-2 h-20 resize-none"
                  value={form.recommendations} onChange={setF('recommendations')}
                  placeholder="Recommended follow-up actions for the reviewer..." />
              </div>

              <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-400">
                {t.survey_disclaimer}
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={submitting}
                  className="btn-secondary flex items-center gap-2 text-sm flex-1" id="survey-save-draft-btn">
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {t.survey_draft}
                </button>
                {editingSurvey && editingSurvey.status === 'draft' && (
                  <button type="button" onClick={handleSubmit} disabled={submitting}
                    className="btn-primary flex items-center gap-2 text-sm flex-1" id="survey-submit-btn">
                    {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    {t.survey_submit}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>

        {/* My Surveys List */}
        <div className="space-y-3">
          <div className="glass-card p-4">
            <h3 className="font-semibold text-dark-200 text-sm mb-3">My Surveys</h3>
            {loading ? (
              <div className="flex items-center gap-2 text-dark-500 text-xs">
                <Loader2 size={12} className="animate-spin" /> Loading...
              </div>
            ) : surveys.length === 0 ? (
              <p className="text-dark-600 text-xs italic">No surveys yet.</p>
            ) : surveys.map(s => (
              <button key={s.id} onClick={() => loadEdit(s)}
                className={`w-full text-left p-2.5 rounded-lg border transition-all mb-2
                  ${editingSurvey?.id === s.id
                    ? 'bg-navy-600/20 border-accent-blue/40'
                    : 'bg-dark-800/40 border-dark-700/40 hover:border-dark-600'}`}
                id={`survey-item-${s.id.slice(0, 8)}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-dark-300">{s.id.slice(0, 12)}…</span>
                  <span className={`badge text-[10px] ${
                    s.status === 'submitted' ? 'badge-verified' :
                    s.status === 'accepted'  ? 'badge-verified' :
                    s.status === 'rejected'  ? 'badge-false-positive' : 'badge-user'
                  }`}>{s.status}</span>
                </div>
                {s.survey_date && <div className="text-xs text-dark-500 mt-0.5">{s.survey_date}</div>}
                {s.encroachment_found && (
                  <div className="text-xs text-red-400 mt-0.5 flex items-center gap-1">
                    <AlertTriangle size={9} /> Encroachment found
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
