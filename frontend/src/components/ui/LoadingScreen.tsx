// LoadingScreen — shown during lazy load and auth check
import React from 'react'
import { Shield } from 'lucide-react'

export default function LoadingScreen() {
  return (
    <div className="fixed inset-0 bg-slate-50 flex flex-col items-center justify-center z-50">
      <div className="flex flex-col items-center gap-4 animate-fade-in">
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-sky-500
                          flex items-center justify-center shadow-sm">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-blue-600/20 to-sky-500/20
                          blur-md animate-pulse-slow" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-xl font-bold gradient-text">LandGuard</span>
          <span className="text-slate-500 text-sm">Loading platform...</span>
        </div>
        <div className="flex gap-1 mt-2">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-blue-600 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
