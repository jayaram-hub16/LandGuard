/**
 * Reusable page for AI models that require external data/configuration.
 * Shows a clear "NOT CONFIGURED" banner, requirements, and explanation.
 * Used for Models 1 (Change Detection), 2 (Building Detection), 5 (DEM).
 */
import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Satellite, Building2, Mountain, ChevronLeft, AlertTriangle,
  CheckSquare, Info,
} from 'lucide-react'
import { aiModelsAPI } from '../../services/api'
import type { AIModelStatus } from '../../types'

// ── Static per-model config ───────────────────────────────────────

interface ModelStaticInfo {
  key: string
  icon: React.ReactNode
  iconBg: string
  number: number
  title: string
  purpose: string
  dataSources: string[]
  useCases: string[]
}

const STATIC_INFO: Record<string, ModelStaticInfo> = {
  'change-detection': {
    key: 'change-detection',
    icon: <Satellite size={22} />,
    iconBg: 'from-violet-500 to-purple-600',
    number: 1,
    title: 'AI Satellite Image Change Detection',
    purpose:
      'Compares a historical satellite image against a more recent one to automatically detect ' +
      'newly constructed buildings, walls, structures, significant vegetation clearing, land-use ' +
      'changes, and potential boundary modifications. Detected changes are highlighted as coloured ' +
      'polygons on the GIS map with before/after imagery.',
    dataSources: [
      'ISRO Bhuvan — free, requires registration (bhuvan.nrsc.gov.in)',
      'Sentinel-2 (Copernicus Open Access Hub) — free, 10 m resolution (scihub.copernicus.eu)',
      'Google Earth Engine — free for academic/research use',
      'USGS Earth Explorer — free Landsat imagery (earthexplorer.usgs.gov)',
    ],
    useCases: [
      'Detect new buildings inside a registered agricultural parcel',
      'Identify cleared forest or vegetation inside a protected area',
      'Compare registered vs current parcel boundary alignment',
      'Provide visual before/after evidence for encroachment cases',
    ],
  },
  'building-detection': {
    key: 'building-detection',
    icon: <Building2 size={22} />,
    iconBg: 'from-orange-500 to-red-600',
    number: 2,
    title: 'AI Building Footprint Detection',
    purpose:
      'Identifies individual buildings and structures from high-resolution satellite imagery ' +
      'using a deep learning segmentation model (U-Net or DeepLabV3). Generates building footprint ' +
      'polygons, compares them against registered land boundaries, and flags structures that appear ' +
      'inside parcels classified for incompatible land use (e.g., residential construction on agricultural land).',
    dataSources: [
      'High-resolution satellite image GeoTIFF (≤1 m/px) — ISRO Bhuvan Cartosat, Planet (commercial)',
      'Open Buildings dataset — Google Research (open-buildings.oss.fh.de)',
      'Microsoft Building Footprints — Bing Maps team (GitHub: microsoft/GlobalMLBuildingFootprints)',
    ],
    useCases: [
      'Detect unauthorised construction inside registered parcels',
      'Generate building footprint polygons for new structures',
      'Estimate built-up area from satellite imagery',
      'Identify structures in protected zones (buffer areas, water bodies)',
    ],
  },
  'dem': {
    key: 'dem',
    icon: <Mountain size={22} />,
    iconBg: 'from-amber-500 to-yellow-600',
    number: 5,
    title: '3D Digital Elevation Model (DEM) Terrain Visualisation',
    purpose:
      'Renders terrain elevation data as a colour-gradient or hillshade overlay on the GIS map. ' +
      'Shows slope, aspect, and watercourse flow direction over registered parcel boundaries. ' +
      'Useful for identifying low-lying areas prone to flooding, steep slopes unsuitable for ' +
      'construction, and natural drainage paths that should not be blocked.',
    dataSources: [
      'SRTM (Shuttle Radar Topography Mission) — NASA, 30 m resolution, free (earthdata.nasa.gov)',
      'ASTER GDEM — NASA/METI, 30 m resolution, free (earthdata.nasa.gov)',
      'Copernicus DEM — ESA, 30 m resolution, free (spacedata.copernicus.eu)',
      'ALOS PALSAR DEM — JAXA, 12.5 m resolution (vertex.daac.asf.alaska.edu)',
    ],
    useCases: [
      'Identify flood-prone low-lying parcels',
      'Visualise terrain slope across parcel boundaries',
      'Detect natural watercourse paths running through registered land',
      'Assess land suitability for construction or agriculture',
    ],
  },
}

export default function ModelNotConfiguredPage() {
  const { model } = useParams<{ model: string }>()
  const navigate = useNavigate()
  const [catalogueInfo, setCatalogueInfo] = useState<AIModelStatus | null>(null)

  const staticInfo = STATIC_INFO[model ?? '']

  useEffect(() => {
    if (!model) return
    aiModelsAPI.info(model)
      .then(res => setCatalogueInfo(res.data))
      .catch(() => {/* ignore — static info still shown */})
  }, [model])

  if (!staticInfo) {
    return (
      <div className="p-6 text-slate-400 text-sm">
        Unknown model: {model}.{' '}
        <button onClick={() => navigate('/ai-models')} className="text-indigo-400 underline">Back to Model Centre</button>
      </div>
    )
  }

  const requirements = catalogueInfo?.requirements ?? staticInfo.dataSources

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/ai-models')}
          className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition">
          <ChevronLeft size={16} />
        </button>
        <div className={`p-2 rounded-xl bg-gradient-to-br ${staticInfo.iconBg} text-white`}>
          {staticInfo.icon}
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Model {staticInfo.number}: {staticInfo.title}</h1>
          <p className="text-slate-400 text-xs">AI &amp; GIS Model Centre · Status: Not Configured</p>
        </div>
      </div>

      {/* NOT CONFIGURED banner */}
      <div className="bg-amber-950/40 border-2 border-amber-600/60 rounded-2xl p-6 text-center">
        <AlertTriangle size={36} className="mx-auto text-amber-400 mb-3" />
        <div className="text-amber-300 text-lg font-bold mb-2">MODEL NOT CONFIGURED</div>
        <p className="text-amber-200/70 text-sm max-w-xl mx-auto leading-relaxed">
          {catalogueInfo?.reason ?? `This model requires external data to function. No fake predictions will be shown.`}
        </p>
      </div>

      {/* What this model does */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6">
        <h2 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
          <Info size={16} className="text-indigo-400" /> What This Model Does
        </h2>
        <p className="text-slate-300 text-sm leading-relaxed">{staticInfo.purpose}</p>
      </div>

      {/* Requirements */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6">
        <h2 className="text-white font-semibold text-sm mb-4 flex items-center gap-2">
          <CheckSquare size={16} className="text-amber-400" /> Required Data / Resources
        </h2>
        <ul className="space-y-3">
          {requirements.map((req, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="mt-0.5 w-5 h-5 rounded-full bg-amber-900/50 border border-amber-700 flex items-center justify-center text-amber-400 text-xs font-bold shrink-0">
                {i + 1}
              </span>
              <span className="text-slate-300 text-sm leading-relaxed">{req}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Use cases */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6">
        <h2 className="text-white font-semibold text-sm mb-4">Use Cases for LandGuard</h2>
        <ul className="space-y-2">
          {staticInfo.useCases.map((uc, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
              <span className="text-green-400 mt-0.5">✓</span> {uc}
            </li>
          ))}
        </ul>
      </div>

      {/* How to enable */}
      <div className="bg-indigo-950/40 border border-indigo-700/50 rounded-2xl p-6">
        <h2 className="text-indigo-300 font-semibold text-sm mb-2">How to Enable This Model</h2>
        <ol className="space-y-2 text-sm text-slate-300">
          <li>1. Download the required dataset(s) from the sources listed above.</li>
          <li>2. Contact the LandGuard system administrator to upload the data files.</li>
          <li>3. The backend will process and register the data, making this model available.</li>
          <li>4. Return to this page — the status will update to <strong className="text-green-400">Available</strong>.</li>
        </ol>
      </div>

      {/* Footer */}
      <div className="text-xs text-slate-500 text-center">
        No fake AI predictions will ever be displayed in LandGuard. Only real, verified data produces results.
      </div>
    </div>
  )
}

