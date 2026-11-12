// Login Page
import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Shield, Mail, Lock, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(form.email.trim(), form.password.trim())
      navigate('/dashboard')
    } catch (err: unknown) {
      const axiosErr = err as {
        code?: string
        message?: string
        response?: { status?: number; data?: { error?: string; message?: string } }
      }
      if (axiosErr.code === 'ERR_NETWORK' || !axiosErr.response || axiosErr.response.status === 502 || axiosErr.response.status === 504) {
        setError('Cannot connect to the LandGuard backend server. Please verify that the backend is running at http://127.0.0.1:5000.')
      } else {
        const msg = axiosErr.response?.data?.error || axiosErr.response?.data?.message || 'Login failed. Please check your credentials.'
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center px-4 py-12">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px]
                        rounded-full bg-navy-900/30 blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10 animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl
                          bg-gradient-to-br from-navy-600 to-accent-blue mb-4 shadow-glow-blue">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold gradient-text">LandGuard</h1>
          <p className="text-dark-500 text-sm mt-1">GIS Encroachment Detection Platform</p>
        </div>

        {/* Card */}
        <div className="glass-card p-8">
          <h2 className="text-xl font-bold text-dark-100 mb-6">Sign in to your account</h2>

          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30
                            rounded-lg p-3 mb-5 text-red-400 text-sm">
              <AlertCircle size={16} className="flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-dark-400 mb-1.5 uppercase tracking-wider">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" size={16} />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  className="input-field pl-10"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-dark-400 mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" size={16} />
                <input
                  id="login-password"
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="input-field pl-10 pr-10"
                  placeholder="Your password"
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-500 hover:text-dark-300"
                  onClick={() => setShowPwd(!showPwd)}
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              id="login-submit-btn"
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3 mt-2"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : null}
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-dark-500 text-sm mt-6">
            Don't have an account?{' '}
            <Link to="/signup" className="text-accent-blue hover:text-accent-cyan transition-colors font-medium">
              Create account
            </Link>
          </p>
        </div>

        {/* Demo credentials */}
        <div className="glass-card p-4 mt-4 text-xs text-dark-500">
          <div className="font-semibold text-dark-400 mb-1">Demo Setup:</div>
          <div>Run <code className="text-accent-cyan">flask create-admin --email admin@demo.com --password Admin1234!</code></div>
          <div>then <code className="text-accent-cyan">flask seed-data</code> to populate sample data.</div>
        </div>
      </div>
    </div>
  )
}
