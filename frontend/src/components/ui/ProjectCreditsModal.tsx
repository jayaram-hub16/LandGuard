import React from 'react'
import { Shield, Award, User, GraduationCap, X, CheckCircle2 } from 'lucide-react'

interface ProjectCreditsModalProps {
  isOpen: boolean
  onClose: () => void
}

export const PROJECT_CREDITS = {
  title: 'LANDGUARD',
  subtitle: 'GIS SECURITY & PUBLIC LAND PROTECTION SYSTEM',
  tagline: 'SECURE LAND. TRUSTED RECORDS. PROTECTING PUBLIC PROPERTY.',
  developers: [
    { name: 'R. Jayaram', role: 'Full-Stack & GIS Architect' },
    { name: 'C. Aslesha', role: 'AI Spatial & Data Engineer' },
  ],
  mentor: {
    name: 'Dr. Kiran Rao Patika',
    designation: 'Project Mentor & Academic Supervisor',
  },
}

export default function ProjectCreditsModal({ isOpen, onClose }: ProjectCreditsModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="glass-card max-w-lg w-full p-6 sm:p-8 relative shadow-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-2xl overflow-hidden">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {/* Header with Project Logo */}
        <div className="flex items-center gap-3.5 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 via-sky-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-blue-500/20 flex-shrink-0">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">
              {PROJECT_CREDITS.title}
            </h3>
            <p className="text-xs font-bold text-blue-600 dark:text-cyan-400 tracking-wider uppercase">
              {PROJECT_CREDITS.subtitle}
            </p>
          </div>
        </div>

        {/* Tagline */}
        <div className="p-3 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/50 mb-6 text-center">
          <p className="text-xs font-semibold text-blue-900 dark:text-blue-200 font-mono tracking-wide">
            "{PROJECT_CREDITS.tagline}"
          </p>
        </div>

        {/* Developers Section */}
        <div className="space-y-4 mb-6">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
            <User size={14} className="text-blue-500" />
            <span>PROJECT DEVELOPERS</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PROJECT_CREDITS.developers.map((dev, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-lg bg-blue-500/10 dark:bg-blue-400/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-sm">
                  {dev.name.charAt(0)}
                </div>
                <div>
                  <div className="font-bold text-sm text-slate-900 dark:text-white">
                    {dev.name}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {dev.role}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Mentor Section */}
        <div className="space-y-3 mb-6">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
            <GraduationCap size={15} className="text-emerald-500" />
            <span>PROJECT MENTOR</span>
          </div>
          <div className="p-3.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 dark:bg-emerald-400/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-base flex-shrink-0">
              <Award size={20} />
            </div>
            <div>
              <div className="font-extrabold text-sm text-slate-900 dark:text-white">
                {PROJECT_CREDITS.mentor.name}
              </div>
              <div className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                {PROJECT_CREDITS.mentor.designation}
              </div>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-400">
          <span>Cadastral Boundary Defense Node</span>
          <span>Version 1.0.0 Production</span>
        </div>
      </div>
    </div>
  )
}
