// Advanced Role-Based Login Page with Animated GIS Security Identity Intro, Day/Night Mode & 3D Carousel
import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Shield, Mail, Lock, Eye, EyeOff, AlertCircle, Loader2,
  ChevronLeft, ChevronRight, CheckCircle2, ArrowRight,
  Sun, Moon, RotateCcw, ShieldCheck, Compass, UserCheck,
  Cpu, Building2, ExternalLink, Info, Check, HelpCircle
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import GISSecurityIntro from '../../components/auth/GISSecurityIntro'

interface RoleIdentity {
  id: 'ADMIN' | 'SURVEYOR' | 'CITIZEN' | 'SUPER_ADMIN'
  backendRole: string
  title: string
  roleTag: string
  badge: string
  icon: React.ReactNode
  accentColor: string
  accentBg: string
  borderColor: string
  glowColor: string
  description: string
  capabilities: string[]
  recommendedRoute: string
  sampleCredentialHint: string
}

const ROLES: RoleIdentity[] = [
  {
    id: 'ADMIN',
    backendRole: 'ADMIN',
    title: 'System Administrator',
    roleTag: 'Official Administration',
    badge: 'High Clearance',
    icon: <ShieldCheck className="w-6 h-6 text-blue-500 dark:text-blue-400" />,
    accentColor: 'from-blue-600 to-indigo-600',
    accentBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    borderColor: 'border-blue-500/40 hover:border-blue-500',
    glowColor: 'shadow-blue-500/20',
    description: 'Manage land registration records, user accounts, complaints, survey reports and official decisions according to existing permissions.',
    capabilities: [
      'Land parcel registration & validation',
      'User role assignment & audit oversight',
      'Complaint reviews & official decisions',
      'GIS detection approvals & report generation'
    ],
    recommendedRoute: '/dashboard',
    sampleCredentialHint: 'jayaramrangam162007@gmail.com'
  },
  {
    id: 'SURVEYOR',
    backendRole: 'SURVEYOR',
    title: 'Surveyor / Field Officer',
    roleTag: 'Field Verification & Inspection',
    badge: 'Field Operations',
    icon: <Compass className="w-6 h-6 text-emerald-500 dark:text-emerald-400" />,
    accentColor: 'from-emerald-600 to-teal-600',
    accentBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    borderColor: 'border-emerald-500/40 hover:border-emerald-500',
    glowColor: 'shadow-emerald-500/20',
    description: 'Access assigned land parcels, conduct field surveys, submit survey evidence, upload photographs and report suspected encroachments.',
    capabilities: [
      'Inspect assigned cadastral parcels',
      'Upload georeferenced photographic evidence',
      'Conduct ground-truth boundary surveys',
      'Flag suspected encroachment areas'
    ],
    recommendedRoute: '/surveys',
    sampleCredentialHint: 'surveyor@landguard.gov.in'
  },
  {
    id: 'CITIZEN',
    backendRole: 'CITIZEN',
    title: 'Landowner / Citizen',
    roleTag: 'Public Property & Grievance',
    badge: 'Citizen Access',
    icon: <UserCheck className="w-6 h-6 text-sky-500 dark:text-sky-400" />,
    accentColor: 'from-sky-500 to-cyan-600',
    accentBg: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
    borderColor: 'border-sky-500/40 hover:border-sky-500',
    glowColor: 'shadow-sky-500/20',
    description: 'View personal land registration records, submit complaints, upload supporting documents and track complaint progress.',
    capabilities: [
      'Verify registered land parcel boundaries',
      'Lodge public encroachment grievances',
      'Upload ownership deeds and evidence',
      'Track real-time complaint status'
    ],
    recommendedRoute: '/complaints',
    sampleCredentialHint: 'citizen@example.com'
  },
  {
    id: 'SUPER_ADMIN',
    backendRole: 'ADMIN',
    title: 'Super Administrator',
    roleTag: 'Executive Security Governance',
    badge: 'Executive Clearance',
    icon: <Cpu className="w-6 h-6 text-purple-500 dark:text-purple-400" />,
    accentColor: 'from-purple-600 to-fuchsia-600',
    accentBg: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    borderColor: 'border-purple-500/40 hover:border-purple-500',
    glowColor: 'shadow-purple-500/20',
    description: 'Root system oversight, cryptographic audit governance, AI model control and nationwide cadastral policy enforcement.',
    capabilities: [
      'Root system configuration & database security',
      'AI & GIS classification model orchestration',
      'Cryptographic tamper-evident audit logs',
      'Emergency lockdown & policy enforcement'
    ],
    recommendedRoute: '/admin',
    sampleCredentialHint: 'Executive Admin Account'
  }
]

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const { theme, toggleTheme, isDark } = useTheme()

  // Intro state — display once per session unless replayed
  const [showIntro, setShowIntro] = useState<boolean>(() => {
    try {
      return !sessionStorage.getItem('landguard_intro_seen')
    } catch {
      return true
    }
  })

  // Selected Role Carousel State
  const [activeIndex, setActiveIndex] = useState<number>(0)
  const [showLoginForm, setShowLoginForm] = useState<boolean>(false)

  // Login form state
  const [form, setForm] = useState({
    email: '',
    password: ''
  })
  const [rememberMe, setRememberMe] = useState<boolean>(false)
  const [showPwd, setShowPwd] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string>('')
  const [mismatchedRole, setMismatchedRole] = useState<string | null>(null)
  const [forgotModalOpen, setForgotModalOpen] = useState<boolean>(false)

  // Touch swipe support
  const touchStartX = useRef<number | null>(null)

  // Load remembered email on mount
  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem('landguard_remember_email')
      if (savedEmail) {
        setForm(f => ({ ...f, email: savedEmail }))
        setRememberMe(true)
      }
    } catch {
      // ignore
    }
  }, [])

  const handleIntroComplete = () => {
    setShowIntro(false)
    try {
      sessionStorage.setItem('landguard_intro_seen', 'true')
    } catch {
      // ignore
    }
  }

  const handleReplayIntro = () => {
    setShowIntro(true)
  }

  // Keyboard navigation for carousel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showIntro || forgotModalOpen) return
      if (!showLoginForm) {
        if (e.key === 'ArrowLeft') {
          handlePrev()
        } else if (e.key === 'ArrowRight') {
          handleNext()
        } else if (e.key === 'Enter') {
          setShowLoginForm(true)
        }
      } else if (e.key === 'Escape') {
        setShowLoginForm(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showIntro, showLoginForm, activeIndex, forgotModalOpen])

  const handlePrev = () => {
    setActiveIndex(prev => (prev === 0 ? ROLES.length - 1 : prev - 1))
    setError('')
    setMismatchedRole(null)
  }

  const handleNext = () => {
    setActiveIndex(prev => (prev === ROLES.length - 1 ? 0 : prev + 1))
    setError('')
    setMismatchedRole(null)
  }

  const handleSelectRole = (idx: number) => {
    setActiveIndex(idx)
    setError('')
    setMismatchedRole(null)
  }

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const touchEndX = e.changedTouches[0].clientX
    const diff = touchStartX.current - touchEndX
    if (Math.abs(diff) > 40) {
      if (diff > 0) handleNext()
      else handlePrev()
    }
    touchStartX.current = null
  }

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMismatchedRole(null)
    setLoading(true)

    const selectedRole = ROLES[activeIndex]

    try {
      const user = await login(
        form.email.trim(),
        form.password.trim(),
        selectedRole.backendRole
      )

      // Handle remember me
      try {
        if (rememberMe) {
          localStorage.setItem('landguard_remember_email', form.email.trim())
        } else {
          localStorage.removeItem('landguard_remember_email')
        }
      } catch {
        // ignore
      }

      // Role-based smart redirection
      if (user.role === 'ADMIN') {
        navigate(selectedRole.id === 'SUPER_ADMIN' ? '/admin' : '/dashboard')
      } else if (user.role === 'SURVEYOR') {
        navigate('/surveys')
      } else if (user.role === 'CITIZEN' || user.role === 'USER') {
        navigate('/complaints')
      } else {
        navigate('/dashboard')
      }
    } catch (err: unknown) {
      const axiosErr = err as {
        code?: string
        message?: string
        response?: {
          status?: number
          data?: { error?: string; message?: string; code?: string; actual_role?: string }
        }
      }

      const resData = axiosErr.response?.data
      if (resData?.code === 'ROLE_MISMATCH') {
        setError(resData.error || 'Role mismatch: Your account does not have clearance for this portal.')
        if (resData.actual_role) {
          setMismatchedRole(resData.actual_role)
        }
      } else if (
        axiosErr.code === 'ERR_NETWORK' ||
        !axiosErr.response ||
        axiosErr.response.status === 502 ||
        axiosErr.response.status === 503 ||
        axiosErr.response.status === 504
      ) {
        setError(
          'Cannot reach the LandGuard cloud backend. The server may be spinning up from idle (~30s on free tier). Please wait a moment and try again.'
        )
      } else {
        const msg = resData?.error || resData?.message || 'Login failed. Please verify your credentials and role.'
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  const currentRole = ROLES[activeIndex]

  return (
    <>
      {/* ── 3. ANIMATED GIS SECURITY IDENTITY INTRO ── */}
      {showIntro && <GISSecurityIntro onComplete={handleIntroComplete} />}

      <div className="min-h-screen bg-slate-50 dark:bg-[#070d19] text-slate-900 dark:text-slate-100 flex flex-col justify-between transition-colors duration-300 relative overflow-x-hidden font-sans">
        {/* Animated Geographic Contour Background Decoration */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-35 dark:opacity-25">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid-pattern" width="80" height="80" patternUnits="userSpaceOnUse">
                <path d="M 80 0 L 0 0 0 80" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-slate-300 dark:text-slate-700" />
                <circle cx="0" cy="0" r="1.5" fill="currentColor" className="text-blue-500/40" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid-pattern)" />
            {/* Topographic Contours */}
            <path d="M -100 200 C 300 100, 600 350, 1200 180 S 1800 400, 2200 250" fill="none" stroke="currentColor" strokeWidth="1" className="text-blue-400/20 dark:text-cyan-400/20" />
            <path d="M -100 350 C 400 250, 700 500, 1300 300 S 1900 550, 2200 400" fill="none" stroke="currentColor" strokeWidth="1" className="text-emerald-400/20 dark:text-emerald-400/20" />
            <path d="M -100 500 C 250 400, 800 650, 1400 450 S 1800 700, 2200 550" fill="none" stroke="currentColor" strokeWidth="0.75" className="text-cyan-400/20 dark:text-sky-400/15" />
          </svg>
        </div>

        {/* ── Top Navigation Bar ── */}
        <header className="relative z-20 max-w-7xl w-full mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          {/* Logo & Platform Name */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 via-sky-500 to-emerald-500 flex items-center justify-center shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform duration-200">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-lg font-black tracking-tight flex items-center gap-1.5">
                <span className="bg-gradient-to-r from-blue-600 via-sky-600 to-emerald-600 dark:from-blue-400 dark:via-sky-300 dark:to-emerald-400 bg-clip-text text-transparent">
                  LANDGUARD
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  GIS SECURE
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 tracking-wide font-medium hidden sm:block">
                GIS Security &amp; Public Land Protection Platform
              </p>
            </div>
          </Link>

          {/* Header Controls: Live Coordinates, Replay Intro & Day/Night Toggle */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            {/* Live Visual Coordinates Badge (hidden on smallest screens) */}
            <div className="hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono text-slate-500 dark:text-slate-400 bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>17.3850° N, 78.4867° E • EPSG:4326</span>
            </div>

            {/* Replay Intro Button */}
            <button
              onClick={handleReplayIntro}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-cyan-400 bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm transition-all duration-200 hover:scale-105 active:scale-95"
              title="Replay Animated GIS Security Intro"
            >
              <RotateCcw size={13} />
              <span className="hidden sm:inline">Replay Intro</span>
            </button>

            {/* Day / Night Theme Switch */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 shadow-sm hover:border-blue-400 dark:hover:border-cyan-400 transition-all duration-200 hover:scale-105 active:scale-95"
              title={isDark ? 'Switch to Day Mode (Light)' : 'Switch to Night Mode (Dark)'}
              aria-label="Toggle theme"
            >
              {isDark ? (
                <Sun size={17} className="text-amber-400 animate-fade-in" />
              ) : (
                <Moon size={17} className="text-slate-700 animate-fade-in" />
              )}
            </button>
          </div>
        </header>

        {/* ── Main Content Stage ── */}
        <main className="relative z-10 max-w-7xl w-full mx-auto px-4 sm:px-6 py-4 sm:py-6 flex flex-col items-center justify-center flex-1">
          {/* Section Header */}
          <div className="text-center max-w-2xl mx-auto mb-6 sm:mb-8 animate-fade-in">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/80 mb-3 shadow-sm">
              <Shield size={13} className="text-blue-600 dark:text-blue-400" />
              <span>ROLE-BASED GIS IDENTITY PORTAL</span>
            </div>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Select Your Access Identity
            </h2>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mt-1.5">
              Authenticate into your designated operational tier with verified role-based permissions.
            </p>
          </div>

          {!showLoginForm ? (
            /* ─────────────────────────────────────────────────────────────
               1. HORIZONTAL 3D ROLE CAROUSEL VIEW
               ───────────────────────────────────────────────────────────── */
            <div className="w-full max-w-5xl flex flex-col items-center">
              {/* Carousel Container */}
              <div
                className="relative w-full py-4 px-2 flex items-center justify-center select-none"
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
              >
                {/* Left Navigation Arrow */}
                <button
                  onClick={handlePrev}
                  className="absolute left-1 sm:left-4 z-30 p-2.5 sm:p-3 rounded-full bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-200 shadow-lg hover:bg-blue-50 dark:hover:bg-slate-800 hover:scale-110 active:scale-95 transition-all duration-200"
                  aria-label="Previous Identity"
                >
                  <ChevronLeft size={20} />
                </button>

                {/* Right Navigation Arrow */}
                <button
                  onClick={handleNext}
                  className="absolute right-1 sm:right-4 z-30 p-2.5 sm:p-3 rounded-full bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-200 shadow-lg hover:bg-blue-50 dark:hover:bg-slate-800 hover:scale-110 active:scale-95 transition-all duration-200"
                  aria-label="Next Identity"
                >
                  <ChevronRight size={20} />
                </button>

                {/* Cards Deck */}
                <div className="w-full flex items-center justify-center gap-3 sm:gap-6 min-h-[380px] sm:min-h-[420px] overflow-visible perspective-[1200px]">
                  {ROLES.map((role, idx) => {
                    const isSelected = idx === activeIndex
                    const isLeft = idx === (activeIndex === 0 ? ROLES.length - 1 : activeIndex - 1)
                    const isRight = idx === (activeIndex === ROLES.length - 1 ? 0 : activeIndex + 1)

                    // On mobile, only show the selected card or slightly visible neighbors
                    let visibilityClass = 'hidden'
                    let transformStyle = ''

                    if (isSelected) {
                      visibilityClass = 'flex z-20 scale-100 sm:scale-105 opacity-100'
                      transformStyle = 'translateZ(0px) rotateY(0deg)'
                    } else if (isLeft) {
                      visibilityClass = 'hidden md:flex z-10 scale-90 opacity-60 hover:opacity-85'
                      transformStyle = 'rotateY(14deg) translateX(20px)'
                    } else if (isRight) {
                      visibilityClass = 'hidden md:flex z-10 scale-90 opacity-60 hover:opacity-85'
                      transformStyle = 'rotateY(-14deg) translateX(-20px)'
                    }

                    return (
                      <div
                        key={role.id}
                        onClick={() => {
                          if (isSelected) {
                            setShowLoginForm(true)
                          } else {
                            handleSelectRole(idx)
                          }
                        }}
                        style={{ transform: transformStyle }}
                        className={`w-full max-w-[340px] sm:max-w-[370px] flex-col justify-between rounded-2xl p-6 sm:p-7 cursor-pointer transition-all duration-400 ease-out border backdrop-blur-md ${visibilityClass} ${
                          isSelected
                            ? `bg-white dark:bg-slate-900/95 border-2 ${role.borderColor} shadow-2xl ${role.glowColor}`
                            : 'bg-white/80 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 shadow-md'
                        }`}
                      >
                        <div>
                          {/* Card Top: Role Badge & Clearance Tag */}
                          <div className="flex items-center justify-between gap-2 mb-4">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold tracking-wider uppercase ${role.accentBg}`}>
                              {role.badge}
                            </span>
                            <span className="text-[11px] font-mono text-slate-400 dark:text-slate-400">
                              TIER 0{idx + 1}
                            </span>
                          </div>

                          {/* Role Icon & Title */}
                          <div className="flex items-start gap-4 mb-4">
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center p-3 flex-shrink-0 shadow-inner ${role.accentBg}`}>
                              {role.icon}
                            </div>
                            <div>
                              <h3 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">
                                {role.title}
                              </h3>
                              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                                {role.roleTag}
                              </p>
                            </div>
                          </div>

                          {/* Description */}
                          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-5">
                            {role.description}
                          </p>

                          {/* Capabilities List */}
                          <div className="space-y-2 mb-6 border-t border-slate-100 dark:border-slate-800/80 pt-4">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
                              Authorized Operations
                            </div>
                            {role.capabilities.map((cap, i) => (
                              <div key={i} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200">
                                <Check size={13} className="text-emerald-500 flex-shrink-0" />
                                <span>{cap}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Card Action Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleSelectRole(idx)
                            setShowLoginForm(true)
                          }}
                          className={`w-full py-3 px-4 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 shadow-lg transition-all duration-200 hover:scale-[1.02] active:scale-95 bg-gradient-to-r ${role.accentColor}`}
                        >
                          <span>Sign in as {role.title.split('/')[0].trim()}</span>
                          <ArrowRight size={16} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Role-Selection Shortcut Pills underneath Carousel */}
              <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-2.5 mt-5">
                {ROLES.map((r, i) => {
                  const isActive = i === activeIndex
                  return (
                    <button
                      key={r.id}
                      onClick={() => handleSelectRole(i)}
                      className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${
                        isActive
                          ? `bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-md scale-105`
                          : 'bg-white/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-blue-400'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`} />
                      <span>{r.title}</span>
                    </button>
                  )
                })}
              </div>

              {/* Keyboard & Swipe Hint */}
              <div className="text-center text-[11px] text-slate-400 dark:text-slate-400 mt-4 flex items-center justify-center gap-3">
                <span>Use <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-[10px] font-mono">←</kbd> <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-[10px] font-mono">→</kbd> to browse roles</span>
                <span>•</span>
                <span>Press <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-[10px] font-mono">Enter</kbd> to open portal</span>
              </div>
            </div>
          ) : (
            /* ─────────────────────────────────────────────────────────────
               2. ROLE-SPECIFIC LOGIN FORM VIEW
               ───────────────────────────────────────────────────────────── */
            <div className="w-full max-w-md animate-fade-in">
              <div className="glass-card p-6 sm:p-8 relative">
                {/* Back to Role Selection Button */}
                <button
                  type="button"
                  onClick={() => setShowLoginForm(false)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-cyan-400 mb-5 transition-colors group"
                >
                  <ChevronLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
                  <span>Switch Access Role</span>
                </button>

                {/* Role Header Banner */}
                <div className="flex items-center gap-3.5 mb-6 p-3 rounded-xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center p-2 flex-shrink-0 ${currentRole.accentBg}`}>
                    {currentRole.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {currentRole.title}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                        {currentRole.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {currentRole.roleTag}
                    </p>
                  </div>
                </div>

                {/* Error Banner */}
                {error && (
                  <div className="mb-5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs flex flex-col gap-2">
                    <div className="flex items-start gap-2">
                      <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                      <div className="leading-relaxed">{error}</div>
                    </div>
                    {/* Role Mismatch Quick-Switch Shortcut */}
                    {mismatchedRole && (
                      <div className="pt-2 border-t border-red-500/20 flex items-center justify-between">
                        <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                          Account Role: <strong>{mismatchedRole}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const foundIdx = ROLES.findIndex(r => r.backendRole === mismatchedRole || (mismatchedRole === 'USER' && r.id === 'CITIZEN'))
                            if (foundIdx !== -1) {
                              setActiveIndex(foundIdx)
                              setError('')
                              setMismatchedRole(null)
                            }
                          }}
                          className="px-2.5 py-1 rounded bg-red-600 text-white font-bold text-[10px] hover:bg-red-700"
                        >
                          Switch to {mismatchedRole} Portal
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Actual Login Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Email / Username */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5 uppercase tracking-wider">
                      Official Email / Username
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input
                        id="login-email"
                        type="email"
                        autoComplete="email"
                        required
                        className="input-field pl-10 pr-4 text-sm"
                        placeholder="you@domain.gov / user@example.com"
                        value={form.email}
                        onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => setForgotModalOpen(true)}
                        className="text-xs font-medium text-blue-600 dark:text-cyan-400 hover:underline"
                      >
                        Forgot Password?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input
                        id="login-password"
                        type={showPwd ? 'text' : 'password'}
                        autoComplete="current-password"
                        required
                        className="input-field pl-10 pr-10 text-sm"
                        placeholder="Enter your security password"
                        value={form.password}
                        onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPwd(!showPwd)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                        title={showPwd ? 'Hide password' : 'Show password'}
                      >
                        {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Remember Me & Security Status */}
                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={e => setRememberMe(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                      />
                      <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                        Remember this device
                      </span>
                    </label>

                    <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      TLS 1.3 Active
                    </span>
                  </div>

                  {/* Submit Button */}
                  <button
                    id="login-submit-btn"
                    type="submit"
                    disabled={loading}
                    className={`w-full py-3 px-4 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 shadow-lg transition-all duration-200 hover:scale-[1.01] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r ${currentRole.accentColor} mt-2`}
                  >
                    {loading ? <Loader2 size={18} className="animate-spin" /> : null}
                    <span>{loading ? 'Authenticating Clearance...' : `Sign in to ${currentRole.title.split('/')[0].trim()}`}</span>
                  </button>
                </form>

                {/* Additional Portal Links */}
                <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2 text-center text-xs text-slate-500 dark:text-slate-400">
                  <div>
                    Need a new citizen account?{' '}
                    <Link to="/signup" className="font-semibold text-blue-600 dark:text-cyan-400 hover:underline">
                      Register as Citizen
                    </Link>
                  </div>
                  <div className="text-[11px] text-slate-400 dark:text-slate-400">
                    Administrator and Surveyor credentials are provisioned exclusively by authorized system officers.
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* ── 6. ADVANCED FOOTER DETAILS ── */}
        <footer className="relative z-20 border-t border-slate-200/80 dark:border-slate-800/80 bg-white/60 dark:bg-slate-950/60 backdrop-blur-md py-6 px-4 sm:px-6">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
            {/* Exact Required Project Name */}
            <div>
              <div className="text-xs sm:text-sm font-bold tracking-wider text-slate-800 dark:text-slate-200 uppercase">
                LANDGUARD — GIS SECURITY &amp; PUBLIC LAND PROTECTION SYSTEM
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Government-grade Cadastral Encroachment &amp; Boundary Defense Architecture
              </div>
            </div>

            {/* Exact Required Credits */}
            <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-6 text-xs text-slate-600 dark:text-slate-300">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 font-medium">Designed &amp; Developed by:</span>
                <span className="font-bold text-slate-900 dark:text-white">R. Jayaram | C. Aslesha</span>
              </div>
              <div className="hidden sm:block text-slate-300 dark:text-slate-700">•</div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 font-medium">Guided by:</span>
                <span className="font-bold text-blue-600 dark:text-cyan-400">Dr. Kiran Rao Patika</span>
              </div>
            </div>
          </div>
        </footer>

        {/* ── Forgot Password Dialog Modal ── */}
        {forgotModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="glass-card max-w-md w-full p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <HelpCircle size={22} />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white">Password Recovery</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">LandGuard Security Clearance</p>
                </div>
              </div>

              <div className="text-xs text-slate-600 dark:text-slate-300 space-y-2.5 leading-relaxed bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
                <p>
                  <strong>Administrative &amp; Field Staff:</strong> For security reasons, password resets for Admin and Surveyor roles must be verified by the Security Administrator.
                </p>
                <p>
                  <strong>Citizens &amp; Landowners:</strong> If email services are configured on your deployment, reset links are dispatched to your registered address.
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-400">
                  Please reach out to your designated LandGuard IT Administrator or support desk.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setForgotModalOpen(false)}
                className="btn-primary w-full py-2.5 text-xs font-semibold"
              >
                Understood / Close
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
