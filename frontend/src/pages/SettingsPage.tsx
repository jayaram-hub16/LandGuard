interface EmailTestResult {
  smtp_host: string
  smtp_port: number
  smtp_username: string
  smtp_from_email: string
  smtp_from_name: string
  use_tls: boolean
  config_ok: boolean
  connection_ok: boolean
  auth_ok: boolean
  send_ok: boolean
  error: string | null
  to_email: string
}

// Settings / Account Page
import React, { useState } from 'react'
import { Settings, User, Lock, Loader2, CheckCircle, AlertCircle, Mail, Send } from 'lucide-react'
import { authAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'

export default function SettingsPage() {
  const { user, isAdmin } = useAuth()
  const [pwdForm, setPwdForm] = useState({ current_password: '', new_password: '', confirm: '' })
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  // Email config test state (admin only)
  const [emailTestAddr, setEmailTestAddr]   = useState('')
  const [emailTesting, setEmailTesting]     = useState(false)
  const [emailTestResult, setEmailTestResult] = useState<EmailTestResult | null>(null)

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pwdForm.new_password !== pwdForm.confirm) {
      setError('New passwords do not match.')
      return
    }
    if (pwdForm.new_password.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }
    setSaving(true); setError(''); setSuccess('')
    try {
      await authAPI.changePassword({
        current_password: pwdForm.current_password,
        new_password: pwdForm.new_password,
      })
      setSuccess('Password changed successfully.')
      setPwdForm({ current_password: '', new_password: '', confirm: '' })
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to change password.')
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-5 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Settings size={20} className="text-slate-500" /> Account Settings
        </h1>
        <p className="text-slate-400 text-sm mt-1">Manage your account preferences</p>
      </div>

      {/* Profile */}
      <div className="glass-card p-6">
        <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <User size={16} className="text-blue-600" /> Profile Information
        </h2>
        <div className="flex items-center gap-4 mb-5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-sky-500
                          flex items-center justify-center text-white text-xl font-black">
            {user?.full_name?.charAt(0) || 'U'}
          </div>
          <div>
            <div className="text-lg font-semibold text-slate-900">{user?.full_name}</div>
            <div className="text-slate-400 text-sm">{user?.email}</div>
            <div className="flex gap-2 mt-1">
              <span className={user?.role === 'ADMIN' ? 'badge badge-admin' : 'badge badge-user'}>
                {user?.role}
              </span>
              <span className="badge badge-verified">{user?.status}</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          {[
            ['Full Name', user?.full_name || '—'],
            ['Email', user?.email || '—'],
            ['Organization', user?.organization || '—'],
            ['Last Login', user?.last_login ? new Date(user.last_login).toLocaleString() : 'N/A'],
          ].map(([label, val]) => (
            <div key={label} className="bg-slate-50 border border-slate-200/60 rounded-lg p-3">
              <div className="text-xs text-slate-400 mb-0.5">{label}</div>
              <div className="text-slate-800">{val}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-4 italic">
          Contact an administrator to update profile information.
        </p>
      </div>

      {/* Change Password */}
      <div className="glass-card p-6">
        <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <Lock size={16} className="text-sky-600" /> Change Password
        </h2>

        {success && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200
                          rounded-lg p-3 mb-4 text-green-700 text-sm">
            <CheckCircle size={15} /> {success}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200
                          rounded-lg p-3 mb-4 text-red-700 text-sm">
            <AlertCircle size={15} /> {error}
          </div>
        )}

        <form onSubmit={handlePasswordChange} className="space-y-4">
          {([
            ['current_password', 'Current Password', 'Your current password'],
            ['new_password', 'New Password', 'Minimum 8 characters'],
            ['confirm', 'Confirm New Password', 'Repeat new password'],
          ] as [keyof typeof pwdForm, string, string][]).map(([key, label, placeholder]) => (
            <div key={key}>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                {label}
              </label>
              <input
                id={`settings-${key}`}
                type="password"
                className="input-field text-sm py-2"
                placeholder={placeholder}
                value={pwdForm[key]}
                onChange={e => setPwdForm(p => ({ ...p, [key]: e.target.value }))}
                required
              />
            </div>
          ))}

          <button
            id="settings-change-password-btn"
            type="submit"
            disabled={saving}
            className="btn-primary flex items-center gap-2 text-sm px-6 py-2"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            Change Password
          </button>
        </form>
      </div>

      {/* ── Email Configuration Test (Admin only) ── */}
      {isAdmin() && (
        <div className="glass-card p-6">
          <h2 className="font-semibold text-slate-800 dark:text-slate-100 mb-1 flex items-center gap-2">
            <Mail size={16} className="text-indigo-600" /> Email / SMTP Configuration Test
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
            Verify that the backend SMTP settings are correct and OTP emails can be delivered.
            Results are shown here only — SMTP credentials are never exposed.
          </p>

          <div className="flex gap-2 mb-4">
            <input
              type="email"
              placeholder={`Send test to ${user?.email || 'your@email.com'}`}
              className="input-field text-sm py-2 flex-1"
              value={emailTestAddr}
              onChange={e => setEmailTestAddr(e.target.value)}
            />
            <button
              type="button"
              disabled={emailTesting}
              onClick={async () => {
                setEmailTesting(true); setEmailTestResult(null)
                try {
                  const res = await authAPI.testEmail(emailTestAddr ? { to_email: emailTestAddr } : {})
                  setEmailTestResult(res.data as EmailTestResult)
                } catch (err: unknown) {
                  const e = err as { response?: { data?: Record<string, string | boolean | number | null> } }
                  setEmailTestResult((e?.response?.data || { error: 'Request failed.' }) as unknown as EmailTestResult)
                } finally { setEmailTesting(false) }
              }}
              className="btn-primary flex items-center gap-2 text-sm px-4 py-2 whitespace-nowrap"
            >
              {emailTesting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {emailTesting ? 'Testing…' : 'Test Email'}
            </button>
          </div>

          {emailTestResult && (
            <div className="space-y-3 text-sm">
              {/* Config row */}
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-2">
                <div className="font-semibold text-slate-700 dark:text-slate-200 text-xs uppercase tracking-wider mb-2">
                  SMTP Configuration
                </div>
                {[
                  ['Host', emailTestResult.smtp_host],
                  ['Port', emailTestResult.smtp_port],
                  ['Username', emailTestResult.smtp_username],
                  ['From Address', emailTestResult.smtp_from_email],
                  ['From Name', emailTestResult.smtp_from_name],
                  ['TLS', emailTestResult.use_tls ? 'Yes (STARTTLS)' : 'No (SSL)'],
                ].map(([label, val]) => (
                  <div key={label as string} className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">{label as string}</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200">{String(val ?? '—')}</span>
                  </div>
                ))}
              </div>

              {/* Status indicators */}
              <div className="grid grid-cols-4 gap-2">
                {(['config_ok', 'connection_ok', 'auth_ok', 'send_ok'] as const).map((key) => {
                  const labels: Record<string, string> = {
                    config_ok: 'Config', connection_ok: 'Connection',
                    auth_ok: 'Auth', send_ok: 'Email Sent',
                  }
                  const ok = !!emailTestResult[key]
                  return (
                    <div
                      key={key}
                      className={`flex flex-col items-center gap-1 rounded-xl p-3 border text-xs font-semibold ${ok
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                        : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'}`}
                    >
                      {ok ? <CheckCircle size={14}/> : <AlertCircle size={14}/>}
                      <span>{labels[key]}</span>
                      <span>{ok ? 'OK' : 'FAIL'}</span>
                    </div>
                  )
                })}
              </div>

              {/* Error message */}
              {emailTestResult.error && (
                <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-xl px-4 py-3 text-xs">
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-semibold mb-0.5">Error</div>
                    <div>{String(emailTestResult.error)}</div>
                  </div>
                </div>
              )}

              {/* Success */}
              {emailTestResult.send_ok && (
                <div className="flex items-start gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 rounded-xl px-4 py-3 text-xs">
                  <CheckCircle size={14} className="mt-0.5 flex-shrink-0" />
                  <div>
                    Test email sent to <strong>{String(emailTestResult.to_email)}</strong>.
                    Check inbox (and spam folder).
                    OTP delivery is working correctly.
                  </div>
                </div>
              )}

              {/* Setup hint when not configured */}
              {!emailTestResult.config_ok && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                  <div className="font-semibold">How to configure SMTP on Render:</div>
                  <ol className="list-decimal list-inside space-y-0.5">
                    <li>Go to your Render service → Environment</li>
                    <li>Add: <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">SMTP_HOST</code> = smtp.gmail.com</li>
                    <li>Add: <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">SMTP_PORT</code> = 587</li>
                    <li>Add: <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">SMTP_USERNAME</code> = your Gmail address</li>
                    <li>Add: <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">SMTP_PASSWORD</code> = 16-char App Password (not login password)</li>
                    <li>Add: <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">SMTP_FROM_EMAIL</code> = same Gmail address</li>
                    <li>Redeploy the backend service, then test again here.</li>
                  </ol>
                  <div className="mt-2 font-semibold">Generate Gmail App Password:</div>
                  <div>Google Account → Security → 2-Step Verification → App Passwords → Select app: Mail → Generate</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
