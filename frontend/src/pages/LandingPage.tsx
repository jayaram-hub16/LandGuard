// Public Landing Page
import React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Shield, Map, AlertTriangle, BarChart3, ArrowRight,
  CheckCircle, Globe, Lock, Zap, ChevronRight
} from 'lucide-react'

const features = [
  { icon: <Map className="w-6 h-6" />, title: 'Interactive GIS Map', desc: 'Visualize registered boundaries, observed land-use polygons, and encroachment overlays in real time using OpenStreetMap tiles.' },
  { icon: <AlertTriangle className="w-6 h-6" />, title: 'Encroachment Detection', desc: 'Automated spatial analysis compares registered boundaries against observed land use to flag geometric mismatches.' },
  { icon: <BarChart3 className="w-6 h-6" />, title: 'ML Classification', desc: 'Random Forest classifier categorizes land use into Residential, Commercial, Agriculture, Water Body, and more.' },
  { icon: <Lock className="w-6 h-6" />, title: 'Role-Based Access', desc: 'Separate USER and ADMIN roles with strict server-side enforcement. Secure JWT authentication.' },
  { icon: <Globe className="w-6 h-6" />, title: 'GIS Data Uploads', desc: 'Upload GeoJSON datasets, validate geometries and CRS, preview features, and process them into the detection pipeline.' },
  { icon: <Zap className="w-6 h-6" />, title: 'Instant Reports', desc: 'Generate professional PDF and CSV reports with parcel summaries, detection findings, and methodology disclaimers.' },
]

const stats = [
  { label: 'Parcels Tracked', value: '48+' },
  { label: 'Detection Accuracy', value: '87%' },
  { label: 'Cities Covered', value: '8' },
  { label: 'Reports Generated', value: '∞' },
]

export default function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 overflow-x-hidden">
      {/* ── Nav ────────────────────────────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-slate-50/90 backdrop-blur-md
                      border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-sky-500
                            flex items-center justify-center shadow-sm">
              <Shield className="w-4.5 h-4.5 text-white" size={18} />
            </div>
            <span className="text-lg font-bold gradient-text">LandGuard</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/login')}
              className="btn-ghost text-sm px-4 py-2"
              id="landing-login-btn"
            >
              Sign In
            </button>
            <button
              onClick={() => navigate('/signup')}
              className="btn-primary text-sm px-4 py-2"
              id="landing-signup-btn"
            >
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────── */}
      <section className="pt-32 pb-24 px-4 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px]
                          rounded-full bg-blue-100/40 blur-3xl" />
          <div className="absolute top-1/3 left-1/4 w-[300px] h-[300px]
                          rounded-full bg-blue-50/50 blur-3xl" />
          <div className="absolute top-1/3 right-1/4 w-[300px] h-[300px]
                          rounded-full bg-sky-50/50 blur-3xl" />
        </div>

        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200/60
                          rounded-full px-4 py-1.5 text-sm text-blue-700 mb-8 animate-fade-in shadow-sm">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            SIMULATED DATA — Municipal Survey Intelligence Platform
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black leading-tight mb-6 animate-fade-in">
            <span className="text-slate-900">Detect Land</span><br />
            <span className="gradient-text">Encroachment</span><br />
            <span className="text-slate-900">with GIS Precision</span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-500 max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-in">
            LandGuard helps municipal survey departments identify unauthorized construction,
            boundary disputes, and land-use mismatches by comparing registered boundaries
            against observed satellite and GIS data.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center animate-fade-in">
            <button
              onClick={() => navigate('/signup')}
              className="btn-primary flex items-center gap-2 justify-center px-8 py-3 text-base"
              id="hero-signup-btn"
            >
              Start Free <ArrowRight size={18} />
            </button>
            <button
              onClick={() => navigate('/login')}
              className="btn-secondary flex items-center gap-2 justify-center px-8 py-3 text-base"
              id="hero-login-btn"
            >
              Sign In <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </section>

      {/* ── Stats ──────────────────────────────────── */}
      <section className="py-12 border-y border-slate-100 bg-white/40">
        <div className="max-w-5xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-6">
          {stats.map(s => (
            <div key={s.label} className="text-center">
              <div className="text-3xl font-black gradient-text mb-1">{s.value}</div>
              <div className="text-sm text-slate-400">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ───────────────────────────────── */}
      <section className="py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Full-Stack GIS Detection Platform
            </h2>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto">
              Everything a municipal survey department needs to systematically identify
              and track potential land encroachments.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f, i) => (
              <div key={i} className="glass-card-hover p-6">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-100 to-sky-100
                                border border-blue-200 flex items-center justify-center mb-4
                                text-blue-600 shadow-sm">
                  {f.icon}
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">{f.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Disclaimer ─────────────────────────────── */}
      <section className="py-10 px-4 bg-white/40 border-y border-slate-100">
        <div className="max-w-4xl mx-auto">
          <div className="disclaimer-box">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold mb-1">Important Disclaimer</div>
                <p className="leading-relaxed">
                  LandGuard uses SIMULATED/SYNTHETIC datasets for demonstration purposes only.
                  All detection results are preliminary geometric findings and do NOT constitute
                  proof of illegal encroachment or establish legal land ownership.
                  All findings require independent verification by a qualified, authorized land surveyor.
                  Do not use this tool for legal proceedings without professional survey validation.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────── */}
      <section className="py-24 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Ready to get started?
          </h2>
          <p className="text-slate-500 mb-8">
            Create your free account and explore the GIS detection platform.
          </p>
          <button
            onClick={() => navigate('/signup')}
            className="btn-primary px-10 py-3 text-base"
            id="cta-signup-btn"
          >
            Create Account
          </button>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────── */}
      <footer className="border-t border-slate-100 py-8 px-4 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Shield size={16} className="text-blue-600" />
          <span className="text-slate-500 text-sm font-semibold">LandGuard</span>
        </div>
        <p className="text-slate-400 text-xs">
          GIS-Based Land Encroachment Detection Platform · Simulated Data Only · v1.0.0
        </p>
      </footer>
    </div>
  )
}
