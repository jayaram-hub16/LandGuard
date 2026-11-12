// Citizen Portal — complaint submission, status tracking, and landowner alerts (login optional)
import React, { useState, useEffect, useCallback } from 'react'
import {
  MessageSquare, Search, CheckCircle, AlertTriangle, Loader2, Globe,
  Bell, Shield, Link2, MapPin, FileText, RefreshCw, Info, XCircle,
} from 'lucide-react'
import { complaintsAPI, uploadsAPI, notificationsAPI, parcelsAPI } from '../../services/api'
import { useLang } from '../../context/LangContext'
import { useAuth } from '../../context/AuthContext'
import type { Notification } from '../../types'

const STATUS_DESCRIPTIONS: Record<string, { color: string; icon: React.ReactNode }> = {
  'Submitted':    { color: 'text-blue-600',   icon: <CheckCircle size={16} /> },
  'Acknowledged': { color: 'text-sky-600',    icon: <CheckCircle size={16} /> },
  'Under Review': { color: 'text-amber-600',  icon: <AlertTriangle size={16} /> },
  'Resolved':     { color: 'text-green-600',  icon: <CheckCircle size={16} /> },
  'Closed':       { color: 'text-slate-500',  icon: <CheckCircle size={16} /> },
}

export default function CitizenPortalPage() {
  const { t, lang, toggleLang } = useLang()
  const { user } = useAuth()
  const [tab, setTab] = useState<'submit' | 'track' | 'alerts'>('submit')

  // Submit form
  const [form, setForm] = useState({
    complainant_name: '', complainant_email: '', complainant_phone: '',
    description: '', location_address: '', parcel_ref: '',
    location_lat: '', location_lng: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitErrors, setSubmitErrors] = useState<Record<string, string>>({})
  const [ackNumber, setAckNumber] = useState('')
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)

  // Track form
  const [trackAck, setTrackAck] = useState('')
  const [tracking, setTracking] = useState(false)
  const [trackResult, setTrackResult] = useState<{
    ack_number: string; status: string; description: string;
    submitted_at?: string; has_case: boolean
  } | null>(null)
  const [trackError, setTrackError] = useState('')

  // ── Landowner Alerts (requires login) ─────────────────────────
  const [myParcels, setMyParcels] = useState<{ id: string; parcel_id: string; district?: string; registered_land_use?: string; detection_count: number }[]>([])
  const [alerts, setAlerts] = useState<Notification[]>([])
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [alertsError, setAlertsError] = useState<string | null>(null)
  const [claimParcelId, setClaimParcelId] = useState('')
  const [claimOwnerRef, setClaimOwnerRef] = useState('')
  const [claiming, setClaiming] = useState(false)
  const [claimMsg, setClaimMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const loadAlerts = useCallback(async () => {
    if (!user) return
    setAlertsLoading(true); setAlertsError(null)
    try {
      const [parcelsRes, notifsRes] = await Promise.all([
        parcelsAPI.myParcels(),
        notificationsAPI.list({ per_page: 20 }),
      ])
      setMyParcels(parcelsRes.data?.parcels ?? [])
      setAlerts(notifsRes.data?.notifications ?? [])
    } catch {
      setAlertsError('Could not load your parcel alerts. Make sure you are logged in.')
    } finally {
      setAlertsLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (tab === 'alerts' && user) loadAlerts()
  }, [tab, user, loadAlerts])

  const handleClaimParcel = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!claimParcelId.trim()) return
    setClaiming(true); setClaimMsg(null)
    try {
      await parcelsAPI.claim({ parcel_id: claimParcelId.trim(), owner_reference: claimOwnerRef.trim() || undefined })
      setClaimMsg({ ok: true, text: 'Parcel linked successfully. Refreshing your parcel list…' })
      setClaimParcelId(''); setClaimOwnerRef('')
      await loadAlerts()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setClaimMsg({ ok: false, text: msg ?? 'Could not link parcel. Check the Parcel ID and try again.' })
    } finally {
      setClaiming(false) }
  }

  const setF = (field: string) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setForm(f => ({ ...f, [field]: e.target.value }))
    if (submitErrors[field]) setSubmitErrors(e2 => { const n = { ...e2 }; delete n[field]; return n })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true); setSubmitErrors({})
    try {
      const res = await complaintsAPI.submit({
        ...form,
        location_lat: form.location_lat ? parseFloat(form.location_lat) : undefined,
        location_lng: form.location_lng ? parseFloat(form.location_lng) : undefined,
      })
      if (attachmentFile && res.data.id) {
        try {
          const fd = new FormData()
          fd.append('file', attachmentFile)
          await uploadsAPI.uploadComplaintAttachment(res.data.id, fd)
        } catch { /* upload non-fatal */ }
      }
      setAckNumber(res.data.ack_number)
      setAttachmentFile(null)
      setForm({
        complainant_name: '', complainant_email: '', complainant_phone: '',
        description: '', location_address: '', parcel_ref: '',
        location_lat: '', location_lng: '',
      })
    } catch (err: unknown) {
      const resp = (err as { response?: { data?: { errors?: Record<string, string>; error?: string } } })?.response
      if (resp?.data?.errors) {
        setSubmitErrors(resp.data.errors)
      } else if (resp?.data?.error) {
        setSubmitErrors({ description: resp.data.error })
      }
    } finally { setSubmitting(false) }
  }

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!trackAck.trim()) return
    setTracking(true); setTrackError(''); setTrackResult(null)
    try {
      const res = await complaintsAPI.checkStatus(trackAck.trim().toUpperCase())
      setTrackResult(res.data)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setTrackError(msg || 'No complaint found with that number.')
    } finally { setTracking(false) }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-sky-500
                          flex items-center justify-center shadow-sm">
            <MessageSquare className="w-6 h-6 text-white" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">{t.portal_title}</h1>
        <p className="text-slate-500 text-sm max-w-md mx-auto">{t.portal_subtitle}</p>
        <button onClick={toggleLang}
          className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline mt-1"
          id="portal-lang-toggle-btn">
          <Globe size={12} /> {lang === 'en' ? 'తెలుగులో చదవండి' : 'Read in English'}
        </button>
      </div>

      {/* Disclaimer */}
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 text-amber-400 text-sm flex items-start gap-3">
        <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
        <p>{t.disclaimer_complaint}</p>
      </div>

      {/* Tab Switcher */}
      <div className="flex rounded-xl bg-white/80 p-1 gap-1">
        <button onClick={() => setTab('submit')}
          className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${tab === 'submit' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-700'}`}
          id="tab-submit-btn">
          {t.complaint_submit}
        </button>
        <button onClick={() => setTab('track')}
          className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${tab === 'track' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-700'}`}
          id="tab-track-btn">
          {t.complaint_track}
        </button>
        {user && (
          <button onClick={() => setTab('alerts')}
            className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${tab === 'alerts' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-700'}`}
            id="tab-alerts-btn">
            <Bell size={13} /> My Alerts
          </button>
        )}
      </div>

      {/* ── Submit Tab ── */}
      {tab === 'submit' && (
        <div className="glass-card p-6 space-y-4">
          {ackNumber ? (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
                <CheckCircle size={32} className="text-green-400" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">Complaint Received</h2>
              <div className="bg-white/80 rounded-xl p-4 border border-slate-200">
                <p className="text-xs text-slate-400 mb-1">{t.complaint_ack}</p>
                <p className="text-2xl font-mono font-bold text-blue-600 tracking-widest">{ackNumber}</p>
              </div>
              <p className="text-slate-500 text-sm">
                Keep this number safe. Use the "{t.complaint_track}" tab to check your complaint status.
              </p>
              <div className="flex gap-3 justify-center">
                <button onClick={() => setAckNumber('')} className="btn-secondary text-sm px-4 py-2" id="complaint-new-btn">
                  Submit Another
                </button>
                <button onClick={() => { setTrackAck(ackNumber); setTab('track') }}
                  className="btn-primary text-sm px-4 py-2" id="complaint-track-now-btn">
                  Track This Complaint
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" id="complaint-form" noValidate>
              <Field label={`${t.complaint_name} *`} error={submitErrors.complainant_name}>
                <input id="complaint-name" type="text" className="input-field py-2"
                  value={form.complainant_name} onChange={setF('complainant_name')}
                  placeholder="Your full name" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t.complaint_email} error={submitErrors.complainant_email}>
                  <input id="complaint-email" type="email" className="input-field py-2"
                    value={form.complainant_email} onChange={setF('complainant_email')}
                    placeholder="name@example.com" />
                </Field>
                <Field label={t.complaint_phone} error={undefined}>
                  <input id="complaint-phone" type="tel" className="input-field py-2"
                    value={form.complainant_phone} onChange={setF('complainant_phone')}
                    placeholder="+91 9876543210" />
                </Field>
              </div>
              <Field label={`${t.complaint_desc} *`} error={submitErrors.description}>
                <textarea id="complaint-desc" className="input-field py-2 h-32 resize-none"
                  value={form.description} onChange={setF('description')}
                  placeholder="Describe what you observed. Include dates, boundaries, and any evidence you have. Minimum 20 characters." />
                <p className="text-xs text-slate-400 mt-1">{form.description.length} characters</p>
              </Field>
              <Field label={t.complaint_location} error={undefined}>
                <input id="complaint-location" type="text" className="input-field py-2"
                  value={form.location_address} onChange={setF('location_address')}
                  placeholder="Village, Mandal, District" />
              </Field>
              <Field label={t.complaint_parcel} error={undefined}>
                <input id="complaint-parcel-ref" type="text" className="input-field py-2"
                  value={form.parcel_ref} onChange={setF('parcel_ref')}
                  placeholder="e.g. PRC-2024-001 (optional)" />
              </Field>
              <Field label="Supporting Photo or Document (optional, max 5MB)" error={undefined}>
                <div className="relative">
                  <input
                    type="file"
                    id="complaint-attachment"
                    onChange={e => setAttachmentFile(e.target.files?.[0] || null)}
                    className="input-field text-xs py-2 file:mr-3 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-800"
                  />
                </div>
              </Field>
              <p className="text-xs text-slate-400 italic">
                Your contact information will only be used for complaint follow-up and will not be publicly disclosed.
              </p>
              <button type="submit" disabled={submitting}
                className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-sm" id="complaint-submit-btn">
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <MessageSquare size={16} />}
                {submitting ? 'Submitting...' : t.complaint_submit}
              </button>
            </form>
          )}
        </div>
      )}

      {/* ── Track Tab ── */}
      {tab === 'track' && (        <div className="glass-card p-6 space-y-4">
          <h2 className="font-semibold text-slate-800">{t.complaint_status}</h2>
          <form onSubmit={handleTrack} className="flex gap-2" id="track-form">
            <input id="track-ack-input" type="text" className="input-field flex-1 py-2 font-mono"
              value={trackAck} onChange={e => setTrackAck(e.target.value.toUpperCase())}
              placeholder="COMP-XXXXXXXX" />
            <button type="submit" disabled={tracking}
              className="btn-primary px-4 py-2 flex items-center gap-2 text-sm" id="track-check-btn">
              {tracking ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              {t.complaint_check}
            </button>
          </form>

          {trackError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
              {trackError}
            </div>
          )}

          {trackResult && (
            <div className="space-y-4">
              <div className="bg-white/50 rounded-xl p-4 border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400">{t.complaint_ack}</p>
                    <p className="font-mono font-bold text-blue-600">{trackResult.ack_number}</p>
                  </div>
                  <div className={`flex items-center gap-2 font-semibold text-sm ${STATUS_DESCRIPTIONS[trackResult.status]?.color || 'text-slate-700'}`}>
                    {STATUS_DESCRIPTIONS[trackResult.status]?.icon}
                    {trackResult.status}
                  </div>
                </div>
                <p className="text-slate-700 text-sm">{trackResult.description}</p>
                {trackResult.has_case && (
                  <div className="text-xs text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded p-2">
                    A formal case has been opened for this complaint and is under active review.
                  </div>
                )}
                {trackResult.submitted_at && (
                  <p className="text-xs text-slate-400">
                    Submitted: {new Date(trackResult.submitted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Alerts Tab (login required) ── */}
      {tab === 'alerts' && user && (
        <div className="space-y-4">
          {/* Disclaimer */}
          <div className="bg-blue-900/20 border border-blue-700/40 rounded-xl p-4 flex items-start gap-3">
            <Info size={16} className="text-blue-400 mt-0.5 shrink-0" />
            <p className="text-blue-300 text-xs leading-relaxed">
              <strong>PRELIMINARY FINDINGS ONLY —</strong> Alerts shown here are based on automated
              geometric analysis and do NOT constitute proof of illegal encroachment or establish
              legal ownership. All findings require verification by an authorised surveyor.
            </p>
          </div>

          {/* Error */}
          {alertsError && (
            <div className="bg-red-900/20 border border-red-700/40 rounded-xl p-4 text-red-300 text-sm">
              {alertsError}
            </div>
          )}

          {/* Loading */}
          {alertsLoading && (
            <div className="text-center py-10 text-slate-400">
              <Loader2 size={24} className="animate-spin mx-auto mb-2" />
              Loading your alerts…
            </div>
          )}

          {!alertsLoading && (
            <>
              {/* My Linked Parcels */}
              <div className="glass-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                    <MapPin size={16} className="text-green-400" /> My Linked Parcels
                  </h2>
                  <button onClick={loadAlerts}
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 transition">
                    <RefreshCw size={13} />
                  </button>
                </div>

                {myParcels.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-sm">
                    <Shield size={28} className="mx-auto mb-2 opacity-30" />
                    <p>No parcels linked to your account yet.</p>
                    <p className="text-xs mt-1">Use the form below to link a registered parcel.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {myParcels.map(p => (
                      <div key={p.id}
                        className="flex items-center justify-between bg-white/80 rounded-lg px-4 py-3 border border-slate-200/80">
                        <div>
                          <span className="font-mono text-sm text-slate-800">{p.parcel_id}</span>
                          {p.district && <span className="text-xs text-slate-400 ml-2">· {p.district}</span>}
                          {p.registered_land_use && <span className="text-xs text-slate-400 ml-1">· {p.registered_land_use}</span>}
                        </div>
                        {p.detection_count > 0 ? (
                          <span className="text-xs bg-red-900/50 text-red-300 border border-red-700/50 px-2 py-0.5 rounded-full">
                            {p.detection_count} detection{p.detection_count > 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span className="text-xs bg-green-900/40 text-green-400 border border-green-700/40 px-2 py-0.5 rounded-full">
                            Clear
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Link parcel form */}
                <div className="mt-4 pt-4 border-t border-slate-200/80">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Link2 size={12} /> Link a Parcel to Your Account
                  </h3>
                  <form onSubmit={handleClaimParcel} className="space-y-2">
                    <input
                      type="text"
                      className="input-field py-2 text-sm font-mono"
                      placeholder="Parcel ID (e.g. PRC-2024-001)"
                      value={claimParcelId}
                      onChange={e => setClaimParcelId(e.target.value)}
                    />
                    <input
                      type="text"
                      className="input-field py-2 text-sm"
                      placeholder="Owner Reference (optional — from your sale deed)"
                      value={claimOwnerRef}
                      onChange={e => setClaimOwnerRef(e.target.value)}
                    />
                    {claimMsg && (
                      <div className={`text-xs p-2 rounded ${claimMsg.ok ? 'text-green-400 bg-green-900/20' : 'text-red-400 bg-red-900/20'}`}>
                        {claimMsg.ok ? <CheckCircle size={12} className="inline mr-1" /> : <XCircle size={12} className="inline mr-1" />}
                        {claimMsg.text}
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={claiming || !claimParcelId.trim()}
                      className="btn-primary w-full py-2 text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {claiming ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                      {claiming ? 'Linking…' : 'Link This Parcel'}
                    </button>
                  </form>
                </div>
              </div>

              {/* Notifications / Alerts */}
              <div className="glass-card p-5">
                <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-4">
                  <Bell size={16} className="text-amber-400" /> Encroachment Alerts
                  {alerts.length > 0 && (
                    <span className="ml-auto text-xs bg-amber-900/40 text-amber-300 border border-amber-700/50 px-2 py-0.5 rounded-full">
                      {alerts.filter(a => !a.is_read).length} unread
                    </span>
                  )}
                </h2>

                {alerts.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-sm">
                    <Bell size={28} className="mx-auto mb-2 opacity-30" />
                    <p>No alerts at this time.</p>
                    <p className="text-xs mt-1">
                      {myParcels.length === 0
                        ? 'Link a parcel above to receive monitoring alerts.'
                        : 'Your linked parcels have no pending alerts.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {alerts.map(n => (
                      <div key={n.id}
                        className={`rounded-lg px-4 py-3 border text-sm ${
                          n.is_read
                            ? 'bg-white/40 border-slate-200/30 text-slate-500'
                            : 'bg-amber-900/10 border-amber-700/30 text-slate-800'
                        }`}>
                        <div className="flex items-start gap-2">
                          {n.is_read
                            ? <CheckCircle size={14} className="text-slate-400 mt-0.5 shrink-0" />
                            : <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-xs">{n.title}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{n.message}</p>
                            <p className="text-xs text-slate-400 mt-1">
                              {n.created_at ? new Date(n.created_at).toLocaleDateString('en-IN', {
                                day: 'numeric', month: 'short', year: 'numeric',
                              }) : ''}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Case management note */}
                <div className="mt-4 pt-4 border-t border-slate-200/80">
                  <div className="flex items-start gap-2 text-xs text-slate-400">
                    <FileText size={12} className="mt-0.5 shrink-0" />
                    <p>
                      If a formal case has been opened on your parcel, the assigned officer will
                      contact you directly. All alerts are preliminary findings and require
                      field verification.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Prompt login for Alerts tab if not logged in ── */}
      {tab === 'alerts' && !user && (
        <div className="glass-card p-8 text-center space-y-4">
          <Shield size={40} className="mx-auto text-slate-400" />
          <h2 className="text-lg font-semibold text-slate-800">Login Required</h2>
          <p className="text-slate-500 text-sm max-w-xs mx-auto">
            Sign in to your LandGuard account to view encroachment alerts for your registered land parcels.
          </p>
          <a href="/login"
            className="btn-primary inline-block px-6 py-2.5 text-sm">
            Sign In
          </a>
        </div>
      )}
    </div>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">{label}</label>
      {children}
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  )
}
