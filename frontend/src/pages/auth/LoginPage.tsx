// Advanced Role-Based Login Page with Infinite Circular 3D Carousel, Day/Night Mode & Project Credits
import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Shield, Mail, Lock, Eye, EyeOff, AlertCircle, Loader2,
  ChevronLeft, ChevronRight, CheckCircle2, ArrowRight,
  Sun, Moon, RotateCcw, ShieldCheck, Compass, UserCheck,
  Award, HelpCircle, Check, ArrowDown, X
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { authAPI } from '../../services/api'
import { useTheme } from '../../context/ThemeContext'
import GISSecurityIntro from '../../components/auth/GISSecurityIntro'
import ProjectCreditsModal, { PROJECT_CREDITS } from '../../components/ui/ProjectCreditsModal'

export interface RoleIdentity {
  id: 'ADMIN' | 'SURVEYOR' | 'CITIZEN'
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

export const ROLES: RoleIdentity[] = [
  {
    id: 'ADMIN',
    backendRole: 'ADMIN',
    title: 'System Administrator',
    roleTag: 'Full Authorised System Administration',
    badge: 'Executive Admin',
    icon: <ShieldCheck className="w-7 h-7 text-blue-500 dark:text-blue-400" />,
    accentColor: 'from-blue-600 to-indigo-600',
    accentBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    borderColor: 'border-blue-500/50',
    glowColor: 'shadow-blue-500/25',
    description: 'Full authorised system administration according to backend permissions. Manage land registration records, user accounts, complaints, survey reports and official decisions.',
    capabilities: [
      'Full Authorised System Administration',
      'Manage Land Registration Records',
      'User Accounts & Permission Governance',
      'Survey Reports & Official Decisions'
    ],
    recommendedRoute: '/dashboard',
    sampleCredentialHint: 'jayaramrangam162007@gmail.com'
  },
  {
    id: 'SURVEYOR',
    backendRole: 'SURVEYOR',
    title: 'Surveyor / Field Officer',
    roleTag: 'Ground Inspections & GPS Plots',
    badge: 'Field Operations',
    icon: <Compass className="w-7 h-7 text-emerald-500 dark:text-emerald-400" />,
    accentColor: 'from-emerald-600 to-teal-600',
    accentBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    borderColor: 'border-emerald-500/50',
    glowColor: 'shadow-emerald-500/25',
    description: 'Field inspections, assigned land parcels, survey reports and evidence submissions. Conduct GPS boundary verification and photograph uploads.',
    capabilities: [
      'Access Assigned Land Parcels',
      'Conduct Ground Field Surveys',
      'Upload Survey Evidence & Photographs',
      'Report Suspected Encroachments'
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
    icon: <UserCheck className="w-7 h-7 text-sky-500 dark:text-sky-400" />,
    accentColor: 'from-sky-500 to-cyan-600',
    accentBg: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
    borderColor: 'border-sky-500/50',
    glowColor: 'shadow-sky-500/25',
    description: 'Personal land records, complaints and complaint tracking. View registered property boundaries, submit grievances and upload supporting documents.',
    capabilities: [
      'Personal Land Registration Records',
      'Submit Encroachment Complaints',
      'Upload Supporting Property Documents',
      'Track Complaint Status in Real Time'
    ],
    recommendedRoute: '/complaints',
    sampleCredentialHint: 'citizen@example.com'
  }
]

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const { theme, toggleTheme, isDark } = useTheme()

  // Intro state
  const [showIntro, setShowIntro] = useState<boolean>(() => {
    try {
      return !sessionStorage.getItem('landguard_intro_seen')
    } catch {
      return true
    }
  })

  // Circular Carousel Active Index: 0 = Admin, 1 = Surveyor, 2 = Citizen
  const [activeIndex, setActiveIndex] = useState<number>(0)
  const [showLoginForm, setShowLoginForm] = useState<boolean>(false)

  // Credits Modal
  const [creditsOpen, setCreditsOpen] = useState<boolean>(false)

  // Form State
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

  // OTP Password Recovery State
  const [forgotStep, setForgotStep] = useState<'email'|'otp'|'reset'|'done'>('email')
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotOtp, setForgotOtp] = useState('')
  const [forgotResetToken, setForgotResetToken] = useState('')
  const [forgotNewPwd, setForgotNewPwd] = useState('')
  const [forgotConfirmPwd, setForgotConfirmPwd] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotError, setForgotError] = useState('')
  const [forgotSuccess, setForgotSuccess] = useState('')
  const [forgotResendCooldown, setForgotResendCooldown] = useState(0)
  const [forgotShowPwd, setForgotShowPwd] = useState(false)

  // Touch Swipe Refs
  const touchStartX = useRef<number | null>(null)
  const formRef = useRef<HTMLDivElement | null>(null)

  // Load remembered email
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

  // Circular navigation: Prev & Next modulo 3
  const handlePrev = () => {
    setActiveIndex(prev => (prev - 1 + ROLES.length) % ROLES.length)
    setError('')
    setMismatchedRole(null)
  }

  const handleNext = () => {
    setActiveIndex(prev => (prev + 1) % ROLES.length)
    setError('')
    setMismatchedRole(null)
  }

  const handleSelectRole = (idx: number) => {
    if (idx === activeIndex) {
      setShowLoginForm(true)
      setTimeout(() => {
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 100)
    } else {
      setActiveIndex(idx)
      setError('')
      setMismatchedRole(null)
    }
  }

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showIntro || forgotModalOpen || creditsOpen) return
      if (e.key === 'ArrowLeft') {
        handlePrev()
      } else if (e.key === 'ArrowRight') {
        handleNext()
      } else if (e.key === 'Enter' && !showLoginForm) {
        setShowLoginForm(true)
      } else if (e.key === 'Escape' && showLoginForm) {
        setShowLoginForm(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showIntro, showLoginForm, activeIndex, forgotModalOpen, creditsOpen])

  // Touch swipe
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

  // Submit Handler
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
        navigate('/dashboard')
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
        setError(resData.error || 'Access denied: Credentials belong to another role.')
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
          'Cannot reach the LandGuard cloud backend. The server may be waking up from sleep (~30s on free tier). Please wait a moment and try again.'
        )
      } else {
        const msg = resData?.error || resData?.message || 'Login failed. Please verify your credentials and role.'
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  // OTP resend countdown
  useEffect(() => {
    if (forgotResendCooldown <= 0) return
    const t = setTimeout(() => setForgotResendCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [forgotResendCooldown])

  // OTP Recovery Handlers
  const handleCloseForgot = () => {
    setForgotModalOpen(false)
    setForgotStep('email')
    setForgotEmail('')
    setForgotOtp('')
    setForgotResetToken('')
    setForgotNewPwd('')
    setForgotConfirmPwd('')
    setForgotError('')
    setForgotSuccess('')
    setForgotResendCooldown(0)
  }

  const handleForgotSendOtp = async () => {
    if (!forgotEmail.trim()) { setForgotError('Please enter your email address.'); return }
    setForgotLoading(true); setForgotError('')
    try {
      await authAPI.forgotPassword({ email: forgotEmail.trim().toLowerCase() })
      setForgotStep('otp'); setForgotResendCooldown(60)
      setForgotSuccess('Recovery code sent. Please check your inbox.')
    } catch { setForgotError('Failed to send recovery code. Please verify the email and try again.') }
    finally { setForgotLoading(false) }
  }

  const handleForgotVerifyOtp = async () => {
    if (!forgotOtp.trim() || forgotOtp.length !== 6) { setForgotError('Please enter the 6-digit OTP.'); return }
    setForgotLoading(true); setForgotError('')
    try {
      const res = await authAPI.verifyOtp({ email: forgotEmail, otp: forgotOtp })
      setForgotResetToken(res.data.reset_token)
      setForgotStep('reset'); setForgotSuccess('')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Invalid OTP. Please try again.'
      setForgotError(msg)
    } finally { setForgotLoading(false) }
  }

  const handleForgotResetPassword = async () => {
    if (!forgotNewPwd || !forgotConfirmPwd) { setForgotError('Please fill in both password fields.'); return }
    if (forgotNewPwd !== forgotConfirmPwd) { setForgotError('Passwords do not match.'); return }
    if (forgotNewPwd.length < 8) { setForgotError('Password must be at least 8 characters.'); return }
    setForgotLoading(true); setForgotError('')
    try {
      await authAPI.resetPassword({
        email: forgotEmail,
        reset_token: forgotResetToken,
        new_password: forgotNewPwd,
        confirm_password: forgotConfirmPwd
      })
      setForgotStep('done')
      setForgotSuccess('Password reset successfully. Please log in with your new password.')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Password reset failed. Please try again.'
      setForgotError(msg)
    } finally { setForgotLoading(false) }
  }

  const currentRole = ROLES[activeIndex]

  // Calculate circular position for each card
  const getCardPosition = (idx: number): 'left' | 'center' | 'right' => {
    const diff = (idx - activeIndex + ROLES.length) % ROLES.length
    if (diff === 0) return 'center'
    if (diff === 1) return 'right'
    return 'left' // diff === 2
  }

  return (
    <>
      {/* ── Animated GIS Security Identity Intro ── */}
      {showIntro && <GISSecurityIntro onComplete={handleIntroComplete} />}

      <div className="min-h-screen bg-slate-50 dark:bg-[#070d19] text-slate-900 dark:text-slate-100 flex flex-col justify-between transition-colors duration-300 relative overflow-x-hidden font-sans">
        {/* Background Animated Contour Pattern */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-30 dark:opacity-20">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="lg-grid" width="80" height="80" patternUnits="userSpaceOnUse">
                <path d="M 80 0 L 0 0 0 80" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-slate-300 dark:text-slate-700" />
                <circle cx="0" cy="0" r="1.5" fill="currentColor" className="text-blue-500/40" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#lg-grid)" />
            <path d="M -100 200 C 300 100, 600 350, 1200 180 S 1800 400, 2200 250" fill="none" stroke="currentColor" strokeWidth="1" className="text-blue-400/20 dark:text-cyan-400/20" />
            <path d="M -100 350 C 400 250, 700 500, 1300 300 S 1900 550, 2200 400" fill="none" stroke="currentColor" strokeWidth="1" className="text-emerald-400/20 dark:text-emerald-400/20" />
          </svg>
        </div>

        {/* ── Top Navigation Bar ── */}
        <header className="relative z-20 max-w-7xl w-full mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
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
                  SECURITY NODE
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 tracking-wide font-medium hidden sm:block">
                GIS Security &amp; Public Land Protection System
              </p>
            </div>
          </Link>

          {/* Header Controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Project Credits Trigger */}
            <button
              onClick={() => setCreditsOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-cyan-400 bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm transition-all duration-200 hover:scale-105"
              title="Project Team Credits (Jayaram, Aslesha, Dr. Kiran Rao Patika)"
            >
              <Award size={14} className="text-blue-600 dark:text-cyan-400" />
              <span className="hidden sm:inline">Project Credits</span>
            </button>

            {/* Replay Intro */}
            <button
              onClick={handleReplayIntro}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-cyan-400 bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm transition-all duration-200 hover:scale-105"
              title="Replay Animated GIS Security Intro"
            >
              <RotateCcw size={13} />
              <span className="hidden sm:inline">Replay Intro</span>
            </button>

            {/* Day / Night Theme Switch */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 shadow-sm hover:border-blue-400 dark:hover:border-cyan-400 transition-all duration-200 hover:scale-105"
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

        {/* ── Main Stage ── */}
        <main className="relative z-10 max-w-7xl w-full mx-auto px-4 sm:px-6 py-4 sm:py-6 flex flex-col items-center justify-center flex-1">
          {/* Headline */}
          <div className="text-center max-w-2xl mx-auto mb-6 sm:mb-8 animate-fade-in">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/80 mb-3 shadow-sm">
              <Shield size={13} className="text-blue-600 dark:text-blue-400" />
              <span>ROLE-BASED GIS IDENTITY PORTAL</span>
            </div>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Select Your Operational Identity
            </h2>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mt-1.5">
              Continuous 3D circular rotation. Select a card to center your designated access portal.
            </p>
          </div>

          {/* ─────────────────────────────────────────────────────────────
             2. CONTINUOUS CIRCULAR 3D CAROUSEL STAGE
             ───────────────────────────────────────────────────────────── */}
          <div className="w-full max-w-5xl flex flex-col items-center">
            <div
              className="relative w-full py-6 px-2 flex items-center justify-center select-none overflow-visible min-h-[440px] sm:min-h-[470px]"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              style={{ perspective: '1200px' }}
            >
              {/* Previous Arrow Button */}
              <button
                type="button"
                onClick={handlePrev}
                className="absolute left-1 sm:left-6 z-40 p-3 sm:p-3.5 rounded-full bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 shadow-xl hover:scale-110 active:scale-95 transition-all duration-200 hover:bg-blue-50 dark:hover:bg-slate-800 hover:border-blue-400 dark:hover:border-cyan-400"
                aria-label="Previous Role (Circular Loop)"
              >
                <ChevronLeft size={22} />
              </button>

              {/* Next Arrow Button */}
              <button
                type="button"
                onClick={handleNext}
                className="absolute right-1 sm:right-6 z-40 p-3 sm:p-3.5 rounded-full bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 shadow-xl hover:scale-110 active:scale-95 transition-all duration-200 hover:bg-blue-50 dark:hover:bg-slate-800 hover:border-blue-400 dark:hover:border-cyan-400"
                aria-label="Next Role (Circular Loop)"
              >
                <ChevronRight size={22} />
              </button>

              {/* 3 Circular Cards Stage */}
              <div className="relative w-full max-w-[340px] sm:max-w-[380px] h-[390px] sm:h-[420px] flex items-center justify-center">
                {ROLES.map((role, idx) => {
                  const pos = getCardPosition(idx)
                  const isCenter = pos === 'center'
                  const isLeft = pos === 'left'
                  const isRight = pos === 'right'

                  // Transform calculations for the 3 positions
                  let transformClass = ''
                  let zIndex = 10
                  let opacity = 0.7

                  if (isCenter) {
                    transformClass = 'translate-x-0 scale-100 sm:scale-105 rotate-y-0 shadow-2xl'
                    zIndex = 30
                    opacity = 1
                  } else if (isLeft) {
                    transformClass = '-translate-x-[92%] sm:-translate-x-[102%] scale-85 sm:scale-90 rotate-y-[16deg] shadow-lg'
                    zIndex = 20
                    opacity = 0.65
                  } else if (isRight) {
                    transformClass = 'translate-x-[92%] sm:translate-x-[102%] scale-85 sm:scale-90 -rotate-y-[16deg] shadow-lg'
                    zIndex = 20
                    opacity = 0.65
                  }

                  return (
                    <div
                      key={role.id}
                      onClick={() => handleSelectRole(idx)}
                      style={{
                        zIndex,
                        transition: 'transform 0.5s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.5s ease, box-shadow 0.5s ease',
                      }}
                      className={`absolute inset-0 w-full h-full flex flex-col justify-between rounded-2xl p-6 sm:p-7 cursor-pointer border backdrop-blur-xl transition-all ${transformClass} ${
                        isCenter
                          ? `bg-white dark:bg-slate-900 border-2 ${role.borderColor} ${role.glowColor}`
                          : 'bg-white/85 dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 hover:opacity-90'
                      }`}
                    >
                      <div>
                        {/* Header: Clearance Badge & Circular Position Index */}
                        <div className="flex items-center justify-between gap-2 mb-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold tracking-wider uppercase ${role.accentBg}`}>
                            {role.badge}
                          </span>
                          <span className="text-[11px] font-mono font-semibold text-slate-400 dark:text-slate-400">
                            {isCenter ? 'CURRENT CENTER' : isLeft ? '← LEFT' : 'RIGHT →'}
                          </span>
                        </div>

                        {/* Title & Icon */}
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
                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
                          {role.description}
                        </p>

                        {/* Authorized operations */}
                        <div className="space-y-1.5 border-t border-slate-100 dark:border-slate-800/80 pt-3">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400 mb-1">
                            Operational Scope
                          </div>
                          {role.capabilities.slice(0, 3).map((cap, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200 truncate">
                              <Check size={13} className="text-emerald-500 flex-shrink-0" />
                              <span className="truncate">{cap}</span>
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
                        }}
                        className={`w-full py-2.5 sm:py-3 px-4 rounded-xl font-bold text-xs sm:text-sm text-white flex items-center justify-center gap-2 shadow-md transition-all duration-200 hover:scale-[1.02] active:scale-95 bg-gradient-to-r ${role.accentColor}`}
                      >
                        {isCenter ? (
                          <>
                            <span>{showLoginForm ? 'Portal Open Below' : `Enter ${role.title.split('/')[0].trim()} Portal`}</span>
                            {showLoginForm ? <ArrowDown size={15} /> : <ArrowRight size={15} />}
                          </>
                        ) : (
                          <span>Rotate to Center</span>
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Circular Role Shortcut Pills */}
            <div className="flex flex-wrap items-center justify-center gap-2.5 mt-2">
              {ROLES.map((r, i) => {
                const isActive = i === activeIndex
                return (
                  <button
                    key={r.id}
                    onClick={() => handleSelectRole(i)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all duration-200 ${
                      isActive
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-md scale-105'
                        : 'bg-white/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-blue-400'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`} />
                    <span>{r.title}</span>
                  </button>
                )
              })}
            </div>

            {/* Navigation guidance */}
            <div className="text-center text-[11px] text-slate-500 dark:text-slate-400 mt-3 flex items-center justify-center gap-2">
              <span>Click any card or use <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 font-mono text-[10px]">←</kbd> <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 font-mono text-[10px]">→</kbd> to rotate circularly</span>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────────
             3. DEDICATED ROLE LOGIN FORM (Reveals below or on click)
             ───────────────────────────────────────────────────────────── */}
          <div ref={formRef} className="w-full max-w-md mt-8 animate-fade-in">
            <div className="glass-card p-6 sm:p-8 relative border-2 border-slate-200 dark:border-slate-700/80 shadow-2xl rounded-2xl">
              {/* Role Header Banner */}
              <div className="flex items-center gap-3.5 mb-6 p-3.5 rounded-xl bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center p-2 flex-shrink-0 ${currentRole.accentBg}`}>
                  {currentRole.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {currentRole.title}
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                      {currentRole.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    Authorized Access Gateway
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

              {/* Login Form */}
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
                      placeholder="user@domain.gov / user@example.com"
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
                      placeholder="Enter security password"
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

                {/* Remember Me & TLS */}
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
                  <span>{loading ? 'Authenticating Role...' : `Sign In as ${currentRole.title.split('/')[0].trim()}`}</span>
                </button>
              </form>

              {/* Citizen registration link */}
              <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
                Need a new citizen account?{' '}
                <Link to="/signup" className="font-semibold text-blue-600 dark:text-cyan-400 hover:underline">
                  Register as Citizen
                </Link>
              </div>
            </div>
          </div>
        </main>

        {/* ─────────────────────────────────────────────────────────────
           4. EXACT PROJECT TEAM CREDITS & FOOTER
           ───────────────────────────────────────────────────────────── */}
        <footer className="relative z-20 border-t border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-950/70 backdrop-blur-md py-6 px-4 sm:px-6">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-5 text-center md:text-left">
            {/* Exact Required Project Name */}
            <div>
              <div className="text-xs sm:text-sm font-extrabold tracking-wider text-slate-800 dark:text-slate-200 uppercase">
                LANDGUARD
              </div>
              <div className="text-[11px] font-bold text-blue-600 dark:text-cyan-400 tracking-wide uppercase">
                GIS SECURITY &amp; PUBLIC LAND PROTECTION SYSTEM
              </div>
            </div>

            {/* Exact Required Developers & Mentor Names */}
            <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-6 text-xs text-slate-600 dark:text-slate-300">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 dark:text-slate-400 font-bold uppercase tracking-wider text-[11px]">PROJECT DEVELOPERS:</span>
                <span className="font-extrabold text-slate-900 dark:text-white">R. Jayaram | C. Aslesha</span>
              </div>
              <div className="hidden sm:block text-slate-300 dark:text-slate-700">•</div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 dark:text-slate-400 font-bold uppercase tracking-wider text-[11px]">PROJECT MENTOR:</span>
                <span className="font-extrabold text-emerald-600 dark:text-emerald-400">Dr. Kiran Rao Patika</span>
              </div>
            </div>

            {/* View Full Credits Modal Trigger */}
            <button
              onClick={() => setCreditsOpen(true)}
              className="text-[11px] font-bold text-blue-600 dark:text-cyan-400 hover:underline flex items-center gap-1"
            >
              <Award size={13} />
              <span>View Full Credits</span>
            </button>
          </div>
        </footer>

        {/* ── Forgot Password Modal (Multi-Step OTP Recovery) ── */}
        {forgotModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="glass-card max-w-md w-full p-6 space-y-5 relative">

              {/* Close Button */}
              <button
                type="button"
                onClick={handleCloseForgot}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                title="Close"
              >
                <X size={18} />
              </button>

              {/* Header */}
              <div className="flex items-center gap-3 pr-8">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
                  <Lock size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white">Password Recovery</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {forgotStep === 'email' && 'Enter your registered email address'}
                    {forgotStep === 'otp' && 'Enter the 6-digit code sent to your inbox'}
                    {forgotStep === 'reset' && 'Set your new password'}
                    {forgotStep === 'done' && 'Recovery complete'}
                  </p>
                </div>
              </div>

              {/* Step Progress Dots */}
              {forgotStep !== 'done' && (
                <div className="flex items-center justify-center gap-2">
                  {(['email', 'otp', 'reset'] as const).map((s) => (
                    <div
                      key={s}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        s === forgotStep
                          ? 'w-6 bg-blue-500'
                          : (forgotStep === 'otp' && s === 'email') || (forgotStep === 'reset' && (s === 'email' || s === 'otp'))
                          ? 'w-3 bg-blue-300'
                          : 'w-3 bg-slate-200 dark:bg-slate-700'
                      }`}
                    />
                  ))}
                </div>
              )}

              {/* Error Banner */}
              {forgotError && (
                <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-xl px-3 py-2.5 text-xs">
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                  <span>{forgotError}</span>
                </div>
              )}

              {/* Success Banner */}
              {forgotSuccess && !forgotError && (
                <div className="flex items-start gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 rounded-xl px-3 py-2.5 text-xs">
                  <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" />
                  <span>{forgotSuccess}</span>
                </div>
              )}

              {/* ── Step: Email ── */}
              {forgotStep === 'email' && (
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Email Address
                  </label>
                  <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 dark:focus-within:ring-blue-900 transition-all">
                    <Mail size={15} className="text-slate-400 flex-shrink-0" />
                    <input
                      type="email"
                      autoFocus
                      placeholder="your@email.com"
                      className="flex-1 text-sm bg-transparent outline-none text-slate-800 dark:text-white placeholder:text-slate-400"
                      value={forgotEmail}
                      onChange={e => { setForgotEmail(e.target.value); setForgotError('') }}
                      onKeyDown={e => { if (e.key === 'Enter') handleForgotSendOtp() }}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={forgotLoading}
                    onClick={handleForgotSendOtp}
                    className="btn-primary w-full py-2.5 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {forgotLoading ? <Loader2 size={16} className="animate-spin" /> : <Mail size={15} />}
                    {forgotLoading ? 'Sending...' : 'Send Recovery Code'}
                  </button>
                </div>
              )}

              {/* ── Step: OTP ── */}
              {forgotStep === 'otp' && (
                <div className="space-y-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 rounded-xl px-3 py-2 border border-slate-200 dark:border-slate-700">
                    Code sent to <span className="font-semibold text-slate-700 dark:text-slate-200">{forgotEmail}</span>. Valid for 5 minutes.
                  </div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    6-Digit OTP Code
                  </label>
                  <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 dark:focus-within:ring-blue-900 transition-all">
                    <ShieldCheck size={15} className="text-slate-400 flex-shrink-0" />
                    <input
                      type="text"
                      autoFocus
                      maxLength={6}
                      placeholder="000000"
                      className="flex-1 text-sm bg-transparent outline-none text-slate-800 dark:text-white placeholder:text-slate-400 font-mono tracking-widest"
                      value={forgotOtp}
                      onChange={e => { setForgotOtp(e.target.value.replace(/\D/g, '')); setForgotError('') }}
                      onKeyDown={e => { if (e.key === 'Enter') handleForgotVerifyOtp() }}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={forgotLoading}
                    onClick={handleForgotVerifyOtp}
                    className="btn-primary w-full py-2.5 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {forgotLoading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={15} />}
                    {forgotLoading ? 'Verifying...' : 'Verify Code'}
                  </button>
                  <div className="text-center text-xs text-slate-500 dark:text-slate-400">
                    {forgotResendCooldown > 0 ? (
                      <span>Resend available in <span className="font-semibold text-blue-600 dark:text-blue-400">{forgotResendCooldown}s</span></span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setForgotError(''); setForgotSuccess(''); handleForgotSendOtp() }}
                        className="text-blue-600 dark:text-cyan-400 hover:underline font-medium"
                      >
                        Resend recovery code
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* ── Step: Reset Password ── */}
              {forgotStep === 'reset' && (
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">New Password</label>
                  <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 dark:focus-within:ring-blue-900 transition-all">
                    <Lock size={15} className="text-slate-400 flex-shrink-0" />
                    <input
                      type={forgotShowPwd ? 'text' : 'password'}
                      autoFocus
                      placeholder="At least 8 characters"
                      className="flex-1 text-sm bg-transparent outline-none text-slate-800 dark:text-white placeholder:text-slate-400"
                      value={forgotNewPwd}
                      onChange={e => { setForgotNewPwd(e.target.value); setForgotError('') }}
                    />
                    <button type="button" onClick={() => setForgotShowPwd(v => !v)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                      {forgotShowPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Confirm Password</label>
                  <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 dark:focus-within:ring-blue-900 transition-all">
                    <Lock size={15} className="text-slate-400 flex-shrink-0" />
                    <input
                      type={forgotShowPwd ? 'text' : 'password'}
                      placeholder="Repeat new password"
                      className="flex-1 text-sm bg-transparent outline-none text-slate-800 dark:text-white placeholder:text-slate-400"
                      value={forgotConfirmPwd}
                      onChange={e => { setForgotConfirmPwd(e.target.value); setForgotError('') }}
                      onKeyDown={e => { if (e.key === 'Enter') handleForgotResetPassword() }}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={forgotLoading}
                    onClick={handleForgotResetPassword}
                    className="btn-primary w-full py-2.5 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {forgotLoading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={15} />}
                    {forgotLoading ? 'Resetting...' : 'Reset Password'}
                  </button>
                </div>
              )}

              {/* ── Step: Done ── */}
              {forgotStep === 'done' && (
                <div className="space-y-4 text-center">
                  <div className="flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                      <CheckCircle2 size={32} className="text-emerald-600 dark:text-emerald-400" />
                    </div>
                  </div>
                  <div>
                    <h5 className="font-bold text-slate-900 dark:text-white text-base">Password Reset!</h5>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">You can now sign in with your new credentials.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCloseForgot}
                    className="btn-primary w-full py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
                  >
                    <ArrowRight size={15} />
                    Back to Login
                  </button>
                </div>
              )}

            </div>
          </div>
        )}

        {/* ── Project Team Credits Modal ── */}
        <ProjectCreditsModal isOpen={creditsOpen} onClose={() => setCreditsOpen(false)} />
      </div>
    </>
  )
}
