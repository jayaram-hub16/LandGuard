// Admin Users Management Page — list, create, activate/deactivate, promote/demote
import React, { useEffect, useState } from 'react'
import {
  Users, RefreshCw, Loader2, ShieldCheck, UserX, UserCheck,
  AlertCircle, Plus, X, Eye, EyeOff, CheckCircle, Search
} from 'lucide-react'
import { adminAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import type { User } from '../../types'

interface AddUserForm {
  full_name: string
  email: string
  password: string
  confirm_password: string
  organization: string
  role: 'USER' | 'ADMIN' | 'SURVEYOR' | 'REVIEWER' | 'CITIZEN'
}

const EMPTY_FORM: AddUserForm = {
  full_name: '', email: '', password: '', confirm_password: '',
  organization: '', role: 'USER',
}

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [actionMsg, setActionMsg] = useState('')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  // Add user modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState<AddUserForm>(EMPTY_FORM)
  const [addErrors, setAddErrors] = useState<Record<string, string>>({})
  const [addSaving, setAddSaving] = useState(false)
  const [addSuccess, setAddSuccess] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => { load() }, [])

  const load = async (q = search) => {
    setLoading(true)
    try {
      const res = await adminAPI.users({ per_page: 100, search: q })
      setUsers(res.data.users || [])
      setTotal(res.data.total || 0)
    } catch { /* handled */ }
    finally { setLoading(false) }
  }

  const updateStatus = async (user: User, newStatus: 'ACTIVE' | 'INACTIVE') => {
    setError(''); setActionMsg('')
    try {
      await adminAPI.updateUserStatus(user.id, newStatus)
      setActionMsg(`User ${user.email} ${newStatus === 'ACTIVE' ? 'activated' : 'deactivated'}.`)
      load()
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to update status.')
    }
  }

  const updateRole = async (user: User, newRole: 'USER' | 'ADMIN') => {
    setError(''); setActionMsg('')
    try {
      await adminAPI.updateUserRole(user.id, newRole)
      setActionMsg(`Role updated for ${user.email}.`)
      load()
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to update role.')
    }
  }

  // ── Add User ──
  const setF = (field: keyof AddUserForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setAddForm(f => ({ ...f, [field]: e.target.value }))
    if (addErrors[field]) setAddErrors(e2 => { const n = { ...e2 }; delete n[field]; return n })
  }

  const validateAddForm = (): boolean => {
    const e: Record<string, string> = {}
    if (!addForm.full_name.trim()) e.full_name = 'Full name is required.'
    if (!addForm.email.trim() || !addForm.email.includes('@')) e.email = 'Valid email is required.'
    if (!addForm.password || addForm.password.length < 8) e.password = 'Password must be at least 8 characters.'
    if (addForm.password !== addForm.confirm_password) e.confirm_password = 'Passwords do not match.'
    setAddErrors(e)
    return Object.keys(e).length === 0
  }

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateAddForm()) return
    setAddSaving(true); setAddSuccess('')
    try {
      await adminAPI.createUser({
        full_name: addForm.full_name.trim(),
        email: addForm.email.trim().toLowerCase(),
        password: addForm.password,
        organization: addForm.organization.trim() || undefined,
        role: addForm.role,
      })
      setAddSuccess(`✅ Account created for ${addForm.email}`)
      setAddForm(EMPTY_FORM)
      setTimeout(() => {
        setShowAddModal(false)
        setAddSuccess('')
        load()
      }, 1800)
    } catch (err: unknown) {
      const resp = (err as { response?: { data?: { errors?: Record<string, string>; error?: string } } })?.response
      if (resp?.data?.errors) {
        setAddErrors(resp.data.errors as Record<string, string>)
      } else {
        setAddErrors({ email: resp?.data?.error || 'Failed to create account.' })
      }
    } finally {
      setAddSaving(false)
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-dark-100 flex items-center gap-2">
            <Users size={20} className="text-violet-400" /> User Management
          </h1>
          <p className="text-dark-500 text-sm">{total} registered accounts</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => load()} className="btn-ghost p-2" id="users-refresh-btn">
            <RefreshCw size={16} />
          </button>
          <button
            onClick={() => { setShowAddModal(true); setAddErrors({}); setAddSuccess('') }}
            className="btn-primary flex items-center gap-2 text-sm px-4 py-2"
            id="add-user-btn"
          >
            <Plus size={15} /> Add User
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="glass-card p-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" size={14} />
          <input
            id="users-search-input"
            type="text"
            placeholder="Search by name or email..."
            className="input-field pl-9 text-sm py-2"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') load(search) }}
          />
        </div>
        <button onClick={() => load(search)} className="btn-secondary text-sm px-4 py-2" id="users-search-btn">
          Search
        </button>
      </div>

      {actionMsg && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-green-400 text-sm flex items-center gap-2">
          <CheckCircle size={14} /> {actionMsg}
        </div>
      )}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Table */}
      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-dark-400">
            <Loader2 size={18} className="animate-spin" /> Loading users...
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Organization</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-dark-500 py-8">No users found.</td></tr>
              ) : users.map(u => (
                <tr key={u.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-navy-600 to-accent-blue
                                      flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {u.full_name?.charAt(0) || '?'}
                      </div>
                      <span className="text-sm font-medium text-dark-200">{u.full_name}</span>
                      {u.id === currentUser?.id && (
                        <span className="badge badge-user text-[10px]">You</span>
                      )}
                    </div>
                  </td>
                  <td className="text-xs text-dark-400">{u.email}</td>
                  <td className="text-xs text-dark-500">{u.organization || '—'}</td>
                  <td>
                    <span className={u.role === 'ADMIN' ? 'badge badge-admin' : 'badge badge-user'}>
                      {u.role}
                    </span>
                  </td>
                  <td>
                    <span className={u.status === 'ACTIVE' ? 'badge badge-verified' : 'badge badge-false-positive'}>
                      {u.status}
                    </span>
                  </td>
                  <td className="text-xs text-dark-500">
                    {u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}
                  </td>
                  <td>
                    {u.id !== currentUser?.id ? (
                      <div className="flex items-center gap-1">
                        {u.status === 'ACTIVE' ? (
                          <button onClick={() => updateStatus(u, 'INACTIVE')}
                            className="btn-ghost p-1.5 text-dark-500 hover:text-red-400"
                            title="Deactivate" id={`deactivate-${u.id.slice(0, 8)}`}>
                            <UserX size={14} />
                          </button>
                        ) : (
                          <button onClick={() => updateStatus(u, 'ACTIVE')}
                            className="btn-ghost p-1.5 text-dark-500 hover:text-green-400"
                            title="Activate" id={`activate-${u.id.slice(0, 8)}`}>
                            <UserCheck size={14} />
                          </button>
                        )}
                        {u.role === 'USER' ? (
                          <button onClick={() => updateRole(u, 'ADMIN')}
                            className="btn-ghost p-1.5 text-dark-500 hover:text-violet-400"
                            title="Promote to Admin" id={`promote-${u.id.slice(0, 8)}`}>
                            <ShieldCheck size={14} />
                          </button>
                        ) : (
                          <button onClick={() => updateRole(u, 'USER')}
                            className="btn-ghost p-1.5 text-dark-500 hover:text-amber-400"
                            title="Demote to User" id={`demote-${u.id.slice(0, 8)}`}>
                            <Users size={14} />
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-dark-600 italic">Self</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Add User Modal ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-card w-full max-w-md p-6 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-dark-100 flex items-center gap-2">
                <Users size={18} className="text-violet-400" /> Create New Account
              </h2>
              <button onClick={() => setShowAddModal(false)} className="btn-ghost p-1.5">
                <X size={18} />
              </button>
            </div>

            {addSuccess && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-green-400 text-sm flex items-center gap-2">
                <CheckCircle size={14} /> {addSuccess}
              </div>
            )}

            <form onSubmit={handleAddUser} className="space-y-3" id="add-user-form" noValidate>
              <AddField label="Full Name *" error={addErrors.full_name}>
                <input id="add-user-name" type="text" className="input-field text-sm py-2"
                  placeholder="Jane Smith" value={addForm.full_name} onChange={setF('full_name')} />
              </AddField>
              <AddField label="Email Address *" error={addErrors.email}>
                <input id="add-user-email" type="email" className="input-field text-sm py-2"
                  placeholder="jane@example.com" value={addForm.email} onChange={setF('email')} />
              </AddField>
              <AddField label="Organization" error={undefined}>
                <input id="add-user-org" type="text" className="input-field text-sm py-2"
                  placeholder="Department / Organization name" value={addForm.organization} onChange={setF('organization')} />
              </AddField>
              <AddField label="Role *" error={addErrors.role}>
                <select id="add-user-role" className="input-field text-sm py-2"
                  value={addForm.role} onChange={setF('role')}>
                  <option value="USER">USER — View and search parcels</option>
                  <option value="SURVEYOR">SURVEYOR — Submit field surveys for assigned cases</option>
                  <option value="REVIEWER">REVIEWER — Review cases and approve findings</option>
                  <option value="CITIZEN">CITIZEN — Submit and track complaints</option>
                  <option value="ADMIN">ADMIN — Full management access</option>
                </select>
              </AddField>

              <AddField label="Password * (min 8 chars)" error={addErrors.password}>
                <div className="relative">
                  <input id="add-user-password"
                    type={showPassword ? 'text' : 'password'}
                    className="input-field text-sm py-2 pr-10"
                    placeholder="••••••••" value={addForm.password} onChange={setF('password')} />
                  <button type="button" onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-500">
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </AddField>
              <AddField label="Confirm Password *" error={addErrors.confirm_password}>
                <input id="add-user-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  className="input-field text-sm py-2"
                  placeholder="••••••••" value={addForm.confirm_password} onChange={setF('confirm_password')} />
              </AddField>

              <p className="text-xs text-dark-600 italic">
                Passwords are stored as secure hashes. They cannot be retrieved later.
              </p>

              <div className="flex gap-3 pt-2">
                <button id="add-user-submit-btn" type="submit" disabled={addSaving}
                  className="btn-primary flex items-center gap-2 text-sm flex-1">
                  {addSaving && <Loader2 size={14} className="animate-spin" />}
                  {addSaving ? 'Creating...' : 'Create Account'}
                </button>
                <button type="button" onClick={() => setShowAddModal(false)} className="btn-secondary text-sm px-4">
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

function AddField({ label, error, children }: {
  label: string; error?: string; children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-dark-400 mb-1 uppercase tracking-wider">{label}</label>
      {children}
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  )
}
