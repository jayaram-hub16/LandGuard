// AI Detection Demo Mode Page
// Clearly labelled as DEMONSTRATION — no real AI model or imagery
import React, { useState } from 'react'
import {
  Brain, AlertTriangle, Info, CheckCircle, XCircle,
  ZoomIn, FileSearch, Layers, RefreshCw
} from 'lucide-react'

interface DemoFinding {
  id: string
  parcelId: string
  confidence: number
  suspectedArea: string
  evidenceType: string
  status: 'suspected' | 'under_review' | 'verified' | 'false_positive'
  notes: string
}

const DEMO_FINDINGS: DemoFinding[] = [
  {
    id: 'DEMO-001',
    parcelId: 'LG-DEMO-001',
    confidence: 0.74,
    suspectedArea: '~380 m²',
    evidenceType: 'Geometric boundary mismatch',
    status: 'suspected',
    notes: 'Registered boundary does not match observed boundary data.',
  },
  {
    id: 'DEMO-002',
    parcelId: 'LG-DEMO-002',
    confidence: 0.88,
    suspectedArea: '~1,200 m²',
    evidenceType: 'Land-use classification change',
    status: 'under_review',
    notes: 'Registered as Agriculture; observed classification differs.',
  },
  {
    id: 'DEMO-003',
    parcelId: 'LG-DEMO-003',
    confidence: 0.91,
    suspectedArea: '~65 m²',
    evidenceType: 'Construction outside boundary',
    status: 'verified',
    notes: 'Field surveyor confirmed structure outside registered boundary.',
  },
  {
    id: 'DEMO-004',
    parcelId: 'LG-DEMO-004',
    confidence: 0.45,
    suspectedArea: '~20 m²',
    evidenceType: 'Minor boundary deviation',
    status: 'false_positive',
    notes: 'Reviewer determined deviation is within acceptable measurement error.',
  },
]

const STATUS_CONFIG: Record<DemoFinding['status'], {
  label: string; color: string; icon: React.ReactNode
}> = {
  suspected: {
    label: 'Suspected', color: 'text-amber-700 bg-amber-50 border-amber-200',
    icon: <AlertTriangle size={12} />,
  },
  under_review: {
    label: 'Under Review', color: 'text-blue-700 bg-blue-50 border-blue-200',
    icon: <FileSearch size={12} />,
  },
  verified: {
    label: 'Verified', color: 'text-green-700 bg-green-50 border-green-200',
    icon: <CheckCircle size={12} />,
  },
  false_positive: {
    label: 'False Positive', color: 'text-slate-600 bg-slate-100 border-slate-200',
    icon: <XCircle size={12} />,
  },
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = pct >= 80 ? 'bg-red-500' : pct >= 60 ? 'bg-amber-500' : 'bg-blue-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-100 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-slate-700 w-9 text-right">{pct}%</span>
    </div>
  )
}

export default function AIDetectionPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'findings' | 'how'>('overview')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')

  const filtered = selectedStatus === 'all'
    ? DEMO_FINDINGS
    : DEMO_FINDINGS.filter(f => f.status === selectedStatus)

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Brain size={22} className="text-violet-400" />
            AI-Assisted Encroachment Detection
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Automated geometric analysis and land-use comparison
          </p>
        </div>
      </div>

      {/* DEMO MODE BANNER — always visible */}
      <div className="rounded-xl border-2 border-amber-500/60 bg-amber-500/10 p-4 flex gap-3">
        <AlertTriangle className="text-amber-400 flex-shrink-0 mt-0.5" size={20} />
        <div>
          <div className="font-bold text-amber-300 text-sm">DEMONSTRATION MODE</div>
          <p className="text-amber-200/80 text-xs mt-1 leading-relaxed">
            This page shows <strong>sample data only</strong> to illustrate how AI-assisted detection
            would work. No real satellite imagery, trained AI model, or live analysis is running.
            Findings shown here are fabricated examples for UI demonstration purposes only.
            Actual AI encroachment detection requires licensed satellite data, a trained detection
            model, and field verification by an authorized surveyor.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-lg p-1 w-fit">
        {(['overview', 'findings', 'how'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all capitalize ${
              activeTab === tab
                ? 'bg-slate-200 text-slate-900 shadow'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab === 'how' ? 'How It Works' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Parcels Analysed', value: '4', sub: 'DEMO only', color: 'from-blue-600 to-sky-500' },
              { label: 'Suspected Cases', value: '1', sub: 'Pending review', color: 'from-amber-700 to-amber-500' },
              { label: 'Under Review', value: '1', sub: 'Assigned to reviewer', color: 'from-blue-700 to-blue-500' },
              { label: 'Verified', value: '1', sub: 'Confirmed by surveyor', color: 'from-green-700 to-green-500' },
            ].map(s => (
              <div key={s.label} className="glass-card p-5">
                <div className={`text-2xl font-black bg-gradient-to-r ${s.color} bg-clip-text text-transparent`}>
                  {s.value}
                </div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">{s.label}</div>
                <div className="text-xs text-slate-400 mt-0.5">{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Capability overview cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                icon: <Layers size={20} className="text-violet-400" />,
                title: 'Boundary Comparison',
                desc: 'Compares registered parcel boundaries with available survey geometry using appropriate coordinate reference systems (CRS). Calculates overlaps and area differences.',
                ready: true,
              },
              {
                icon: <ZoomIn size={20} className="text-blue-400" />,
                title: 'Land-Use Classification',
                desc: 'Uses the existing scikit-learn classification engine to compare registered vs. observed land use. Existing model works on geometric features.',
                ready: true,
              },
              {
                icon: <Brain size={20} className="text-amber-400" />,
                title: 'Building Detection (AI)',
                desc: 'Deep-learning-based building detection from satellite imagery. Requires licensed satellite data and a trained model. Not yet integrated — requires external data source.',
                ready: false,
              },
            ].map(c => (
              <div key={c.title} className="glass-card p-5">
                <div className="flex items-center gap-2 mb-3">
                  {c.icon}
                  <span className="font-semibold text-slate-800 text-sm">{c.title}</span>
                  <span className={`ml-auto text-xs px-2 py-0.5 rounded-full border ${
                    c.ready
                      ? 'text-green-400 bg-green-400/10 border-green-400/30'
                      : 'text-amber-400 bg-amber-400/10 border-amber-400/30'
                  }`}>
                    {c.ready ? 'Available' : 'Requires external data'}
                  </span>
                </div>
                <p className="text-slate-500 text-xs leading-relaxed">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Findings Tab */}
      {activeTab === 'findings' && (
        <div className="space-y-4">
          {/* Status filter */}
          <div className="flex flex-wrap gap-2">
            {['all', 'suspected', 'under_review', 'verified', 'false_positive'].map(s => (
              <button
                key={s}
                onClick={() => setSelectedStatus(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all capitalize ${
                  selectedStatus === s
                    ? 'bg-accent-blue/20 border-accent-blue text-blue-600'
                    : 'border-slate-300 text-slate-500 hover:border-slate-300'
                }`}
              >
                {s === 'all' ? 'All Findings' : s.replace('_', ' ')}
              </button>
            ))}
          </div>

          <div className="disclaimer-box mb-2">
            <Info size={13} className="inline mr-1" />
            All findings below are <strong>fabricated sample data</strong> for demonstration only.
            They do not represent real parcels, real encroachments, or legal findings.
          </div>

          {filtered.map(f => {
            const cfg = STATUS_CONFIG[f.status]
            return (
              <div key={f.id} className="glass-card p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div>
                    <div className="font-mono text-sm font-bold text-slate-900">{f.id}</div>
                    <div className="text-xs text-slate-400 mt-0.5">Parcel: {f.parcelId}</div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border flex items-center gap-1 w-fit ${cfg.color}`}>
                    {cfg.icon} {cfg.label}
                  </span>
                  <div className="sm:ml-auto text-xs text-slate-500">
                    Suspected area: <span className="font-semibold text-slate-800">{f.suspectedArea}</span>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-400 mb-1">Detection Confidence</div>
                  <ConfidenceBar value={f.confidence} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-slate-400 mb-0.5">Evidence Type</div>
                    <div className="text-slate-800">{f.evidenceType}</div>
                  </div>
                  <div>
                    <div className="text-slate-400 mb-0.5">Analyst Notes</div>
                    <div className="text-slate-800">{f.notes}</div>
                  </div>
                </div>

                {f.status === 'suspected' && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-200">
                    <AlertTriangle size={12} className="inline mr-1" />
                    This is a suspected finding only. Field verification by an authorized surveyor
                    is required before any official determination can be made.
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* How It Works Tab */}
      {activeTab === 'how' && (
        <div className="space-y-4">
          <div className="glass-card p-6 space-y-5">
            <h2 className="font-semibold text-slate-800">How AI-Assisted Detection Works</h2>

            {[
              {
                step: '1',
                title: 'Spatial Data Ingestion',
                desc: 'Upload GeoJSON or CSV datasets containing registered boundary data. The system validates geometry, checks coordinate reference systems (CRS), and stores validated boundaries.',
              },
              {
                step: '2',
                title: 'Geometric Boundary Comparison',
                desc: 'The detection engine compares registered boundaries with observed data using Shapely and pyproj. It calculates overlap areas, area differences, and percentage deviations using appropriate projected CRS for accuracy.',
              },
              {
                step: '3',
                title: 'Land-Use Classification',
                desc: 'The existing scikit-learn model classifies land use from geometric features. Discrepancies between registered and observed land use are flagged as suspected changes.',
              },
              {
                step: '4',
                title: 'Building Detection (Future — Requires External Data)',
                desc: 'Deep-learning models (e.g., U-Net, ResNet) can detect structures in satellite imagery. This requires licensed satellite imagery (e.g., from ISRO Bhuvan, Google Earth Engine, or commercial providers) and a trained model. This capability is NOT currently available in LandGuard without external data.',
              },
              {
                step: '5',
                title: 'Reviewer Workflow',
                desc: 'All automated findings are marked as "Suspected" — not verified. Authorized reviewers inspect findings, request field surveys, and make determinations. Only field-verified findings become "Confirmed Encroachments".',
              },
              {
                step: '6',
                title: 'Legal Disclaimer',
                desc: 'No automated algorithm, satellite image, or AI model can legally establish encroachment or land ownership. All findings are preliminary indicators only. Legal determination requires field survey, government records comparison, and authorized review.',
              },
            ].map(s => (
              <div key={s.step} className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-accent-blue/20 border border-accent-blue/40 flex items-center justify-center flex-shrink-0 text-blue-600 text-sm font-bold">
                  {s.step}
                </div>
                <div>
                  <div className="font-semibold text-slate-800 text-sm mb-1">{s.title}</div>
                  <p className="text-slate-500 text-xs leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="glass-card p-5">
            <h3 className="font-semibold text-slate-800 text-sm mb-3">
              External Requirements for Full AI Integration
            </h3>
            <div className="space-y-2 text-xs text-slate-500">
              {[
                'Licensed satellite imagery (ISRO Bhuvan, Planet, Maxar, Google Earth Engine)',
                'Trained building/structure detection model (or cloud API)',
                'Sufficient server GPU/CPU resources for inference',
                'Legal authorization to use and process geospatial imagery',
                'Data privacy compliance for land parcel information',
              ].map(r => (
                <div key={r} className="flex items-start gap-2">
                  <span className="text-amber-400 mt-0.5">⚠</span>
                  <span>{r}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

