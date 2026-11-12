// Settings / Account Page
import React, { useState } from 'react'
import { Settings, User, Lock, Building, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { authAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'

export default function SettingsPage() {
  const { user } = useAuth()
  const [pwdForm, setPwdForm] = useState({ current_password: '', new_password: '', confirm: '' })
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

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
    </div>
  )
}
