import React, { useEffect, useRef, useState } from 'react'
import { Shield, MapPin, Radio, FastForward, Play } from 'lucide-react'

interface GISSecurityIntroProps {
  onComplete: () => void
}

export default function GISSecurityIntro({ onComplete }: GISSecurityIntroProps) {
  const [phase, setPhase] = useState<number>(1)
  const [isFadingOut, setIsFadingOut] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // Check for reduced motion preference
  useEffect(() => {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onComplete()
    }
  }, [onComplete])

  // Sequenced animation timeline
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(2), 1200) // Grid & Parcels draw
    const t2 = setTimeout(() => setPhase(3), 2400) // Radar sweep & green highlights
    const t3 = setTimeout(() => setPhase(4), 3800) // Shield formation & Branding
    const t4 = setTimeout(() => {
      setIsFadingOut(true)
    }, 5600)
    const t5 = setTimeout(() => {
      onComplete()
    }, 6200)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      clearTimeout(t4)
      clearTimeout(t5)
    }
  }, [onComplete])

  // Handle keyboard skip (Escape or Space)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
        handleSkip()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleSkip = () => {
    setIsFadingOut(true)
    setTimeout(() => {
      onComplete()
    }, 300)
  }

  // Interactive high-performance Canvas for radar and digital Earth grid
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    let width = (canvas.width = window.innerWidth)
    let height = (canvas.height = window.innerHeight)

    const handleResize = () => {
      if (!canvas) return
      width = canvas.width = window.innerWidth
      height = canvas.height = window.innerHeight
    }
    window.addEventListener('resize', handleResize)

    // Generate terrain coordinate points
    const points: { x: number; y: number; s: number; alpha: number }[] = []
    const cols = 26
    const rows = 16
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        points.push({
          x: (c / (cols - 1)) * width,
          y: (r / (rows - 1)) * height,
          s: Math.random() * 2 + 1,
          alpha: Math.random() * 0.4 + 0.15,
        })
      }
    }

    let radarAngle = 0
    let scanLineY = 0

    const render = () => {
      ctx.clearRect(0, 0, width, height)

      // 1. Digital Earth dark gradient base
      const bgGrad = ctx.createRadialGradient(
        width / 2, height / 2, 50,
        width / 2, height / 2, Math.max(width, height) * 0.8
      )
      bgGrad.addColorStop(0, '#0c1a30')
      bgGrad.addColorStop(0.5, '#060d1b')
      bgGrad.addColorStop(1, '#020611')
      ctx.fillStyle = bgGrad
      ctx.fillRect(0, 0, width, height)

      // 2. Animated Geographic Coordinate Grid (Phase >= 1)
      ctx.strokeStyle = 'rgba(14, 165, 233, 0.08)'
      ctx.lineWidth = 1
      const gridSize = 70
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()
      }

      // Draw grid nodes
      for (let i = 0; i < points.length; i++) {
        const p = points[i]
        ctx.fillStyle = `rgba(56, 189, 248, ${p.alpha})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2)
        ctx.fill()
      }

      // 3. Radar Scanning Sweep (Phase >= 2)
      radarAngle += 0.025
      const centerX = width / 2
      const centerY = height / 2
      const radarRadius = Math.min(width, height) * 0.45

      // Radar concentric circles
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.15)'
      ctx.lineWidth = 1
      for (let r = 0.25; r <= 1; r += 0.25) {
        ctx.beginPath()
        ctx.arc(centerX, centerY, radarRadius * r, 0, Math.PI * 2)
        ctx.stroke()
      }

      // Radar sweeping beam
      const sweepEndAngle = radarAngle
      const sweepStartAngle = radarAngle - 0.55
      const sweepGrad = ctx.createRadialGradient(
        centerX, centerY, 10,
        centerX, centerY, radarRadius
      )
      sweepGrad.addColorStop(0, 'rgba(6, 182, 212, 0.25)')
      sweepGrad.addColorStop(1, 'rgba(16, 185, 129, 0)')

      ctx.save()
      ctx.beginPath()
      ctx.moveTo(centerX, centerY)
      ctx.arc(centerX, centerY, radarRadius, sweepStartAngle, sweepEndAngle)
      ctx.closePath()
      ctx.fillStyle = sweepGrad
      ctx.fill()
      ctx.restore()

      // Scanning raster line
      scanLineY = (scanLineY + 2.5) % height
      const scanGrad = ctx.createLinearGradient(0, scanLineY - 20, 0, scanLineY + 20)
      scanGrad.addColorStop(0, 'rgba(6, 182, 212, 0)')
      scanGrad.addColorStop(0.5, 'rgba(6, 182, 212, 0.18)')
      scanGrad.addColorStop(1, 'rgba(6, 182, 212, 0)')
      ctx.fillStyle = scanGrad
      ctx.fillRect(0, scanLineY - 20, width, 40)

      animId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center overflow-hidden transition-opacity duration-700 select-none ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      style={{ backgroundColor: '#020611' }}
      aria-label="ANIMATED GIS SECURITY IDENTITY INTRO"
    >
      {/* Background Radar Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />

      {/* Coordinate HUD Telemetry Corners */}
      <div className="absolute top-5 left-6 text-[11px] font-mono text-cyan-400/80 tracking-widest space-y-1 hidden sm:block">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          <span>LAT: 17.3850° N • LON: 78.4867° E</span>
        </div>
        <div className="text-slate-400 text-[10px]">CRS: EPSG:4326 (WGS 84) • ORBIT: POLAR-SCAN-9</div>
        <div className="text-emerald-400 text-[10px]">SYS: DEFENSE-GRADE GIS TELEMETRY MATRIX</div>
      </div>

      <div className="absolute top-5 right-6 flex items-center gap-4 z-20">
        <div className="text-right text-[11px] font-mono text-slate-400 hidden md:block">
          <div>NODE ID: LG-SEC-INTR-2026</div>
          <div className="text-cyan-400/80 font-bold">IDENTITY INTRO SEQUENCE</div>
        </div>

        {/* Skip Intro Button */}
        <button
          onClick={handleSkip}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold
                     bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-200
                     shadow-lg shadow-cyan-950/50 backdrop-blur-md transition-all duration-200
                     hover:scale-105 active:scale-95"
          title="Press Esc or Space to Skip"
        >
          <FastForward size={13} className="text-cyan-400" />
          <span>Skip Intro</span>
          <span className="text-[10px] text-cyan-400/60 ml-1 hidden sm:inline">(Esc)</span>
        </button>
      </div>

      <div className="absolute bottom-5 left-6 text-[10px] font-mono text-slate-400/80 hidden sm:block">
        <div>STATUS: {phase === 1 ? 'INITIALIZING CADASTRE GRID' : phase === 2 ? 'SCANNING PARCEL BOUNDARIES' : phase === 3 ? 'VERIFYING GEODETIC OVERLAYS' : 'IDENTITY VERIFIED • READY'}</div>
        <div className="text-slate-400/80">AUTHENTICATION: 256-BIT ENCRYPTED SESSION</div>
      </div>

      <div className="absolute bottom-5 right-6 text-[10px] font-mono text-slate-400/80 text-right hidden sm:block">
        <div>LANDGUARD GIS SECURITY MATRIX</div>
        <div className="text-cyan-400/60">GOVERNMENT LAND PROTECTION ARCHITECTURE</div>
      </div>

      {/* Main Holographic Center Stage */}
      <div className="relative z-10 max-w-2xl w-full px-6 flex flex-col items-center text-center">
        {/* SVG Land Parcel Cadastral Boundaries Overlay */}
        <div className="relative w-72 h-72 sm:w-88 sm:h-88 flex items-center justify-center mb-6">
          <svg
            viewBox="0 0 300 300"
            className="w-full h-full absolute inset-0 pointer-events-none"
          >
            {/* Outer Coordinate Target Reticle */}
            <circle
              cx="150"
              cy="150"
              r="140"
              fill="none"
              stroke="rgba(6, 182, 212, 0.2)"
              strokeWidth="1.5"
              strokeDasharray="6 6"
              className={phase >= 2 ? 'animate-spin' : ''}
              style={{ animationDuration: '40s' }}
            />
            <circle
              cx="150"
              cy="150"
              r="105"
              fill="none"
              stroke="rgba(16, 185, 129, 0.25)"
              strokeWidth="1"
            />

            {/* Glowing Land Parcel Polygon 1 (Cadastral Boundary) */}
            <polygon
              points="60,90 120,50 180,75 160,140 85,130"
              fill={phase >= 3 ? 'rgba(6, 182, 212, 0.16)' : 'none'}
              stroke={phase >= 2 ? '#06b6d4' : 'rgba(6, 182, 212, 0.2)'}
              strokeWidth={phase >= 3 ? '2.5' : '1.5'}
              className="transition-all duration-700"
              style={{
                filter: phase >= 3 ? 'drop-shadow(0 0 8px rgba(6, 182, 212, 0.8))' : 'none',
              }}
            />

            {/* Glowing Land Parcel Polygon 2 (Adjacent Registered Parcel) */}
            <polygon
              points="160,140 230,110 250,185 190,220 140,195"
              fill={phase >= 3 ? 'rgba(16, 185, 129, 0.18)' : 'none'}
              stroke={phase >= 2 ? '#10b981' : 'rgba(16, 185, 129, 0.2)'}
              strokeWidth={phase >= 3 ? '2.5' : '1.5'}
              className="transition-all duration-700"
              style={{
                filter: phase >= 3 ? 'drop-shadow(0 0 8px rgba(16, 185, 129, 0.8))' : 'none',
              }}
            />

            {/* Glowing Land Parcel Polygon 3 (Verification Zone) */}
            <polygon
              points="85,130 160,140 140,195 95,240 50,190"
              fill={phase >= 3 ? 'rgba(14, 165, 233, 0.12)' : 'none'}
              stroke={phase >= 2 ? '#38bdf8' : 'rgba(14, 165, 233, 0.2)'}
              strokeWidth="1.5"
              className="transition-all duration-700"
            />

            {/* Crosshairs & Centroid Markers */}
            {phase >= 2 && (
              <>
                <line x1="150" y1="10" x2="150" y2="290" stroke="rgba(6, 182, 212, 0.2)" strokeWidth="1" />
                <line x1="10" y1="150" x2="290" y2="150" stroke="rgba(6, 182, 212, 0.2)" strokeWidth="1" />
                <circle cx="120" cy="100" r="4" fill="#06b6d4" className="animate-ping" />
                <circle cx="195" cy="170" r="4" fill="#10b981" className="animate-ping" />
              </>
            )}
          </svg>

          {/* Central Holographic Shield with Location Pin Formation (Phase >= 4) */}
          <div
            className={`relative flex items-center justify-center transition-all duration-1000 transform ${
              phase >= 4 ? 'opacity-100 scale-100 rotate-0' : 'opacity-0 scale-75 rotate-12'
            }`}
          >
            {/* Glowing Outer Hexagonal Shield Ring */}
            <div className="absolute w-32 h-32 rounded-3xl bg-gradient-to-tr from-cyan-500/20 via-blue-500/30 to-emerald-500/20 blur-xl animate-pulse" />

            <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-gradient-to-b from-slate-900/90 via-slate-950/95 to-slate-900/90 border-2 border-cyan-400/80 shadow-2xl shadow-cyan-500/50 flex items-center justify-center backdrop-blur-xl">
              {/* Inner Shield Icon */}
              <Shield className="w-12 h-12 text-cyan-300 drop-shadow-[0_0_12px_rgba(6,182,212,0.9)]" />

              {/* Geographic Pin Centered in Shield */}
              <div className="absolute flex items-center justify-center">
                <MapPin className="w-6 h-6 text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.9)] animate-bounce" />
              </div>
            </div>
          </div>
        </div>

        {/* Phase 4: Project Title & Exact Tagline Reveal */}
        <div
          className={`space-y-3 transition-all duration-1000 transform ${
            phase >= 4 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          {/* Identity Header Label */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-mono font-semibold tracking-wider uppercase bg-cyan-950/70 border border-cyan-500/40 text-cyan-300 shadow-md">
            <Radio size={12} className="text-cyan-400 animate-pulse" />
            <span>ANIMATED GIS SECURITY IDENTITY INTRO</span>
          </div>

          {/* Project Title */}
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white drop-shadow-[0_2px_16px_rgba(6,182,212,0.5)]">
            LAND<span className="bg-gradient-to-r from-cyan-400 via-sky-300 to-emerald-400 bg-clip-text text-transparent">GUARD</span>
          </h1>

          {/* Exact Required Tagline */}
          <p className="text-xs sm:text-sm md:text-base font-semibold tracking-widest text-cyan-100/90 max-w-xl mx-auto uppercase drop-shadow">
            "SECURE LAND. TRUSTED RECORDS. PROTECTING PUBLIC PROPERTY."
          </p>

          <p className="text-[11px] text-slate-400 font-mono pt-1">
            Visual Identity Animation • Initializing LandGuard Role Portals...
          </p>
        </div>
      </div>
    </div>
  )
}
