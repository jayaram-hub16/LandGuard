// Signup Page
import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Shield, Mail, Lock, User, Building, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

export default function SignupPage() {
  const navigate = useNavigate()
  const { signup } = useAuth()
  const [form, setForm] = useState({
    full_name: '', email: '', organization: '', password: '', confirm: ''
  })
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.full_name.trim()) e.full_name = 'Full name required.'
    if (!form.email.match(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)) e.email = 'Valid email required.'
    if (form.password.length < 8) e.password = 'Minimum 8 characters.'
    if (form.password !== form.confirm) e.confirm = 'Passwords do not match.'
    return e
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    setLoading(true)
    try {
      await signup({
        email: form.email, password: form.password,
        full_name: form.full_name, organization: form.organization
      })
      navigate('/dashboard')
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { errors?: Record<string, string>; error?: string } } })
        ?.response?.data
      if (data?.errors) setErrors(data.errors)
      else setErrors({ _: data?.error || 'Signup failed.' })
    } finally {
      setLoading(false)
    }
  }

  const field = (name: keyof typeof form) => ({
    value: form[name],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(p => ({ ...p, [name]: e.target.value }))
  })

  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center px-4 py-12">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px]
                        rounded-full bg-navy-900/30 blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10 animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl
                          bg-gradient-to-br from-navy-600 to-accent-blue mb-4 shadow-glow-blue">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold gradient-text">LandGuard</h1>
          <p className="text-dark-500 text-sm mt-1">Create your account</p>
        </div>

        <div className="glass-card p-8">
          <h2 className="text-xl font-bold text-dark-100 mb-2">Get Started</h2>
          <p className="text-dark-500 text-sm mb-6">New accounts are granted USER access. Contact an admin to request elevated permissions.</p>

          {errors._ && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30
                            rounded-lg p-3 mb-4 text-red-400 text-sm">
              <AlertCircle size={16} /> {errors._}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-dark-400 mb-1.5 uppercase tracking-wider">Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" size={16} />
                <input id="signup-name" type="text" className="input-field pl-10"
                       placeholder="Your full name" {...field('full_name')} required />
              </div>
              {errors.full_name && <p className="text-red-400 text-xs mt-1">{errors.full_name}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-dark-400 mb-1.5 uppercase tracking-wider">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" size={16} />
                <input id="signup-email" type="email" className="input-field pl-10"
                       placeholder="you@example.com" {...field('email')} required />
              </div>
              {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-dark-400 mb-1.5 uppercase tracking-wider">Organization (optional)</label>
              <div className="relative">
                <Building className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" size={16} />
                <input id="signup-org" type="text" className="input-field pl-10"
                       placeholder="Municipal Corporation, Survey Dept..." {...field('organization')} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-dark-400 mb-1.5 uppercase tracking-wider">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" size={16} />
                <input id="signup-password" type={showPwd ? 'text' : 'password'} className="input-field pl-10 pr-10"
                       placeholder="Min 8 characters" {...field('password')} required />
                <button type="button" onClick={() => setShowPwd(!showPwd)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-500 hover:text-dark-300">
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-dark-400 mb-1.5 uppercase tracking-wider">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" size={16} />
                <input id="signup-confirm" type={showPwd ? 'text' : 'password'} className="input-field pl-10"
                       placeholder="Repeat password" {...field('confirm')} required />
              </div>
              {errors.confirm && <p className="text-red-400 text-xs mt-1">{errors.confirm}</p>}
            </div>

            <button id="signup-submit-btn" type="submit" disabled={loading}
                    className="btn-primary w-full flex items-center justify-center gap-2 py-3 mt-2">
              {loading && <Loader2 size={18} className="animate-spin" />}
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-dark-500 text-sm mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-accent-blue hover:text-accent-cyan transition-colors font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
