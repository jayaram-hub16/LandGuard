// Add Parcel Page — full form for creating a new land parcel record
import React, { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Loader2, AlertCircle, CheckCircle, MapPin } from 'lucide-react'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { parcelsAPI } from '../../services/api'
import 'leaflet/dist/leaflet.css'

// Fix leaflet marker icons in Vite
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const LAND_USES = ['Residential', 'Commercial', 'Agriculture', 'Road', 'Water Body', 'Forest', 'Industrial', 'Other', 'Unknown']
const STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
  'Uttarakhand', 'West Bengal', 'Delhi', 'Jammu & Kashmir', 'Ladakh', 'Puducherry',
]

// Map click handler for coordinate picking
function LocationPicker({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) { onPick(e.latlng.lat, e.latlng.lng) },
  })
  return null
}

interface FormData {
  parcel_id: string
  owner_name: string
  owner_reference: string
  contact_phone: string
  contact_email: string
  registration_reference: string
  registered_date: string
  survey_number: string
  subdivision_number: string
  state: string
  district: string
  administrative_area: string
  address: string
  centroid_lat: string
  centroid_lng: string
  registered_area_sqm: string
  area_unit: string
  registered_land_use: string
  observed_land_use: string
  notes: string
}

const EMPTY: FormData = {
  parcel_id: '', owner_name: '', owner_reference: '', contact_phone: '',
  contact_email: '', registration_reference: '', registered_date: '',
  survey_number: '', subdivision_number: '', state: '', district: '',
  administrative_area: '', address: '', centroid_lat: '', centroid_lng: '',
  registered_area_sqm: '', area_unit: 'sqm', registered_land_use: 'Unknown',
  observed_land_use: 'Unknown', notes: '',
}

// Convert area to sqm
function toSqm(value: string, unit: string): number | undefined {
  const n = parseFloat(value)
  if (isNaN(n)) return undefined
  if (unit === 'sqm') return n
  if (unit === 'acres') return n * 4046.86
  if (unit === 'hectares') return n * 10000
  if (unit === 'cents') return n * 40.4686
  return n
}

export default function AddParcelPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState<FormData>(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [apiError, setApiError] = useState('')
  const [markerPos, setMarkerPos] = useState<[number, number] | null>(null)
  const [mapType, setMapType] = useState<'satellite-labels' | 'satellite' | 'osm' | 'street'>('satellite-labels')
  const [geocodeStatus, setGeocodeStatus] = useState<'idle'|'loading'|'success'|'partial'|'error'>('idle')
  const [geocodeMsg, setGeocodeMsg] = useState('')
  const geocodeAbortRef = useRef<AbortController|null>(null)

  const set = (field: keyof FormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setForm(f => ({ ...f, [field]: e.target.value }))
    if (errors[field]) setErrors(e2 => { const n = { ...e2 }; delete n[field]; return n })
  }

  const reverseGeocode = async (lat: number, lng: number) => {
    // Cancel any pending request
    if (geocodeAbortRef.current) geocodeAbortRef.current.abort()
    const controller = new AbortController()
    geocodeAbortRef.current = controller

    setGeocodeStatus('loading')
    setGeocodeMsg('Detecting location...')

    try {
      // Use Nominatim directly from frontend (backend proxy preferred but frontend fallback)
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&zoom=18&accept-language=en`
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'Accept-Language': 'en', 'User-Agent': 'LandGuard/1.0' }
      })
      if (!res.ok) throw new Error('Geocoding failed')
      const data = await res.json()
      const addr = data.address || {}

      // India-specific field mapping
      const state = addr.state || ''
      const district = addr.state_district || addr.county || addr.district || ''
      // Mandal: use county/suburb that differs from district
      let mandal = ''
      for (const key of ['county', 'suburb', 'town_district', 'village_district']) {
        const val = addr[key]
        if (val && val !== district) { mandal = val; break }
      }
      // Address: village/town + locality + postcode
      const placeParts = [
        addr.village || addr.hamlet || addr.neighbourhood || addr.locality || addr.town || addr.city || addr.suburb || '',
        district,
        state,
        addr.postcode || ''
      ].filter(Boolean)
      const addressText = placeParts.join(', ')

      // Check if aborted
      if (controller.signal.aborted) return

      // Update form fields
      setForm(f => ({
        ...f,
        state: state || f.state,
        district: district || f.district,
        administrative_area: mandal || f.administrative_area,
        address: addressText || f.address,
      }))

      const missing = !state || !district
      setGeocodeStatus(missing ? 'partial' : 'success')
      setGeocodeMsg(
        missing
          ? 'Location detected. Some fields could not be detected automatically — please fill them in.'
          : `Location detected: ${district}${state ? ', ' + state : ''}`
      )
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      setGeocodeStatus('error')
      setGeocodeMsg('Unable to detect location automatically. Please enter location details manually.')
    }
  }

  const handleMapPick = (lat: number, lng: number) => {
    setMarkerPos([lat, lng])
    setForm(f => ({
      ...f,
      centroid_lat: lat.toFixed(7),
      centroid_lng: lng.toFixed(7),
    }))
    if (errors.centroid_lat) setErrors(e => { const n = { ...e }; delete n.centroid_lat; return n })
    reverseGeocode(lat, lng)
  }

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (!form.parcel_id.trim()) e.parcel_id = 'Parcel / Registration ID is required.'
    if (!form.owner_name.trim()) e.owner_name = 'Landowner full name is required.'
    if (!form.state) e.state = 'State is required.'
    if (!form.district.trim()) e.district = 'District is required.'
    if (form.centroid_lat && isNaN(parseFloat(form.centroid_lat)))
      e.centroid_lat = 'Latitude must be a number.'
    if (form.centroid_lng && isNaN(parseFloat(form.centroid_lng)))
      e.centroid_lng = 'Longitude must be a number.'
    if (form.centroid_lat && (parseFloat(form.centroid_lat) < -90 || parseFloat(form.centroid_lat) > 90))
      e.centroid_lat = 'Latitude must be between -90 and 90.'
    if (form.centroid_lng && (parseFloat(form.centroid_lng) < -180 || parseFloat(form.centroid_lng) > 180))
      e.centroid_lng = 'Longitude must be between -180 and 180.'
    if (form.registered_area_sqm && isNaN(parseFloat(form.registered_area_sqm)))
      e.registered_area_sqm = 'Area must be a number.'
    if (form.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email))
      e.contact_email = 'Invalid email address.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSaving(true)
    setApiError('')
    setSuccess('')

    // Build reference string for owner
    const ownerRef = form.owner_reference.trim() ||
      `REF-${form.parcel_id.trim().toUpperCase()}-${Date.now()}`

    const payload = {
      parcel_id: form.parcel_id.trim(),
      registered_area_sqm: form.registered_area_sqm
        ? toSqm(form.registered_area_sqm, form.area_unit)
        : undefined,
      centroid_lat: form.centroid_lat ? parseFloat(form.centroid_lat) : undefined,
      centroid_lng: form.centroid_lng ? parseFloat(form.centroid_lng) : undefined,
      state: form.state,
      district: form.district.trim(),
      administrative_area: form.administrative_area.trim() || undefined,
      address: form.address.trim() || undefined,
      registered_land_use: form.registered_land_use,
      observed_land_use: form.observed_land_use,
      is_simulated: false,
      // Owner info packed into notes as a JSON block for now (backend stores owner separately)
      _owner_name: form.owner_name.trim(),
      _owner_reference: ownerRef,
      _contact_phone: form.contact_phone.trim() || undefined,
      _contact_email: form.contact_email.trim() || undefined,
      _registration_reference: form.registration_reference.trim() || undefined,
      _registered_date: form.registered_date || undefined,
      _survey_number: form.survey_number.trim() || undefined,
      _subdivision_number: form.subdivision_number.trim() || undefined,
      _notes: form.notes.trim() || undefined,
    }

    try {
      const res = await parcelsAPI.create(payload)
      const newParcel = res.data
      setSuccess(`✅ Parcel "${newParcel.parcel_id}" saved successfully!`)
      setTimeout(() => navigate(`/parcels/${newParcel.parcel_id}`), 1500)
    } catch (err: unknown) {
      const resp = (err as { response?: { data?: { errors?: Record<string, string>; error?: string } } })?.response
      if (resp?.data?.errors) {
        const serverErrors: Record<string, string> = {}
        Object.entries(resp.data.errors).forEach(([k, v]) => {
          serverErrors[k] = String(v)
        })
        setErrors(serverErrors)
        setApiError('Please fix the highlighted fields.')
      } else {
        setApiError(resp?.data?.error || 'Failed to save parcel. Check backend is running.')
      }
    } finally {
      setSaving(false)
    }
  }

  const mapCenter: [number, number] = markerPos ||
    (form.centroid_lat && form.centroid_lng
      ? [parseFloat(form.centroid_lat), parseFloat(form.centroid_lng)]
      : [20.5937, 78.9629])

  return (
    <div className="space-y-5 animate-fade-in max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/parcels')} className="btn-ghost p-2" id="add-parcel-back-btn">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Add Land Parcel</h1>
          <p className="text-slate-400 text-sm">Register a new land parcel in the system</p>
        </div>
      </div>

      {success && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-green-400 text-sm flex items-center gap-2">
          <CheckCircle size={16} /> {success}
        </div>
      )}
      {apiError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle size={16} /> {apiError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5" id="add-parcel-form" noValidate>

        {/* Section 1: Identification */}
        <div className="glass-card p-5">
          <h2 className="font-semibold text-slate-800 mb-4 text-sm uppercase tracking-wider border-b border-slate-200 pb-2">
            1. Land Identification
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Parcel / Registration ID *" error={errors.parcel_id}>
              <input id="field-parcel-id" type="text" className="input-field" placeholder="e.g. AP-GUNTUR-2024-001"
                value={form.parcel_id} onChange={set('parcel_id')} />
            </Field>
            <Field label="Survey Number" error={errors.survey_number}>
              <input id="field-survey-number" type="text" className="input-field" placeholder="e.g. 123/A"
                value={form.survey_number} onChange={set('survey_number')} />
            </Field>
            <Field label="Subdivision Number" error={errors.subdivision_number}>
              <input id="field-subdivision-number" type="text" className="input-field" placeholder="e.g. 4B"
                value={form.subdivision_number} onChange={set('subdivision_number')} />
            </Field>
            <Field label="Registration Reference" error={errors.registration_reference}>
              <input id="field-reg-ref" type="text" className="input-field" placeholder="Doc / deed reference"
                value={form.registration_reference} onChange={set('registration_reference')} />
            </Field>
            <Field label="Registered Date" error={errors.registered_date}>
              <input id="field-reg-date" type="date" className="input-field"
                value={form.registered_date} onChange={set('registered_date')} />
            </Field>
          </div>
        </div>

        {/* Section 2: Landowner */}
        <div className="glass-card p-5">
          <h2 className="font-semibold text-slate-800 mb-4 text-sm uppercase tracking-wider border-b border-slate-200 pb-2">
            2. Landowner Information
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Landowner Full Name *" error={errors.owner_name}>
              <input id="field-owner-name" type="text" className="input-field" placeholder="Full name as registered"
                value={form.owner_name} onChange={set('owner_name')} />
            </Field>
            <Field label="Owner Reference (auto-generated if blank)" error={errors.owner_reference}>
              <input id="field-owner-ref" type="text" className="input-field" placeholder="Owner ID / ref no."
                value={form.owner_reference} onChange={set('owner_reference')} />
            </Field>
            <Field label="Contact Phone" error={errors.contact_phone}>
              <input id="field-contact-phone" type="tel" className="input-field" placeholder="+91 98765 43210"
                value={form.contact_phone} onChange={set('contact_phone')} />
            </Field>
            <Field label="Contact Email" error={errors.contact_email}>
              <input id="field-contact-email" type="email" className="input-field" placeholder="owner@example.com"
                value={form.contact_email} onChange={set('contact_email')} />
            </Field>
          </div>
        </div>

        {/* Section 3: Location */}
        <div className="glass-card p-5">
          <h2 className="font-semibold text-slate-800 mb-4 text-sm uppercase tracking-wider border-b border-slate-200 pb-2">
            3. Location
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <Field label="State *" error={errors.state}>
              <select id="field-state" className="input-field" value={form.state} onChange={set('state')}>
                <option value="">Select state...</option>
                {STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="District *" error={errors.district}>
              <input id="field-district" type="text" className="input-field" placeholder="e.g. Guntur"
                value={form.district} onChange={set('district')} />
            </Field>
            <Field label="Mandal / Taluk / Block" error={errors.administrative_area}>
              <input id="field-mandal" type="text" className="input-field" placeholder="Mandal or Taluk name"
                value={form.administrative_area} onChange={set('administrative_area')} />
            </Field>
            <div className="sm:col-span-2 lg:col-span-3">
              <Field label="Full Address / Village" error={errors.address}>
                <input id="field-address" type="text" className="input-field" placeholder="Village, mandal, district, state, pincode"
                  value={form.address} onChange={set('address')} />
              </Field>
            </div>
          </div>

          {/* Coordinate inputs */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* Geocoding Status Banner */}
            {geocodeStatus !== 'idle' && (
              <div className={`col-span-2 flex items-center gap-2 px-3 py-2 rounded-lg text-xs mb-3 ${
                geocodeStatus === 'loading' ? 'bg-blue-50 border border-blue-200 text-blue-700' :
                geocodeStatus === 'success' ? 'bg-green-50 border border-green-200 text-green-700' :
                geocodeStatus === 'partial' ? 'bg-amber-50 border border-amber-200 text-amber-700' :
                'bg-red-50 border border-red-200 text-red-600'
              }`}>
                {geocodeStatus === 'loading' && <Loader2 size={12} className="animate-spin flex-shrink-0" />}
                {geocodeStatus === 'success' && <CheckCircle size={12} className="flex-shrink-0" />}
                {geocodeStatus === 'partial' && <AlertCircle size={12} className="flex-shrink-0" />}
                {geocodeStatus === 'error' && <AlertCircle size={12} className="flex-shrink-0" />}
                <span>{geocodeMsg}</span>
              </div>
            )}
            <Field label="Latitude" error={errors.centroid_lat}>
              <input id="field-lat" type="number" step="0.0000001" className="input-field font-mono"
                placeholder="e.g. 16.5062" value={form.centroid_lat} onChange={set('centroid_lat')} />
            </Field>
            <Field label="Longitude" error={errors.centroid_lng}>
              <input id="field-lng" type="number" step="0.0000001" className="input-field font-mono"
                placeholder="e.g. 80.6480" value={form.centroid_lng} onChange={set('centroid_lng')} />
            </Field>
          </div>

          {/* Map type selector */}
          <div className="flex flex-wrap gap-2 mb-2">
            {([
              ['satellite-labels', 'Satellite + Labels'],
              ['satellite', 'Satellite'],
              ['osm', 'OpenStreetMap'],
              ['street', 'Street Map'],
            ] as const).map(([type, label]) => (
              <button
                key={type}
                type="button"
                onClick={() => setMapType(type)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                  mapType === type
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-white border-slate-300 text-slate-500 hover:text-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Map picker */}
          <div className="rounded-xl overflow-hidden border border-slate-300" style={{ height: 280 }}>
            <div className="px-3 py-1.5 bg-slate-100/80 border-b border-slate-300 text-xs text-slate-500 flex items-center gap-1.5">
              <MapPin size={12} className="text-blue-600" />
              Click on the map to set coordinates
            </div>
            <MapContainer center={mapCenter} zoom={markerPos ? 15 : 5} style={{ height: 248, width: '100%' }}>
              {mapType === 'satellite-labels' && (
                <>
                  <TileLayer
                    attribution='Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Source: Esri, Maxar, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN'
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    maxZoom={19}
                  />
                  <TileLayer
                    attribution='Labels &copy; <a href="https://www.esri.com/">Esri</a>'
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
                    maxZoom={19}
                    opacity={1}
                  />
                </>
              )}
              {mapType === 'satellite' && (
                <TileLayer
                  attribution='Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Source: Esri, Maxar, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN'
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  maxZoom={19}
                />
              )}
              {mapType === 'osm' && (
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  maxZoom={19}
                />
              )}
              {mapType === 'street' && (
                <TileLayer
                  attribution='Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey'
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
                  maxZoom={20}
                />
              )}
              <LocationPicker onPick={handleMapPick} />
              {markerPos && <Marker position={markerPos} />}
            </MapContainer>
          </div>
        </div>

        {/* Section 4: Area & Classification */}
        <div className="glass-card p-5">
          <h2 className="font-semibold text-slate-800 mb-4 text-sm uppercase tracking-wider border-b border-slate-200 pb-2">
            4. Area &amp; Land Classification
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Land Area" error={errors.registered_area_sqm}>
              <input id="field-area" type="number" step="any" min="0" className="input-field"
                placeholder="0.00" value={form.registered_area_sqm} onChange={set('registered_area_sqm')} />
            </Field>
            <Field label="Unit" error={undefined}>
              <select id="field-area-unit" className="input-field" value={form.area_unit} onChange={set('area_unit')}>
                <option value="sqm">Square Metres (m²)</option>
                <option value="acres">Acres</option>
                <option value="hectares">Hectares</option>
                <option value="cents">Cents</option>
              </select>
            </Field>
            <Field label="Registered Land Use" error={undefined}>
              <select id="field-reg-land-use" className="input-field"
                value={form.registered_land_use} onChange={set('registered_land_use')}>
                {LAND_USES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
            <Field label="Observed / Current Land Use" error={undefined}>
              <select id="field-obs-land-use" className="input-field"
                value={form.observed_land_use} onChange={set('observed_land_use')}>
                {LAND_USES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
          </div>
        </div>

        {/* Section 5: Notes */}
        <div className="glass-card p-5">
          <h2 className="font-semibold text-slate-800 mb-4 text-sm uppercase tracking-wider border-b border-slate-200 pb-2">
            5. Additional Notes
          </h2>
          <Field label="Notes / Remarks" error={undefined}>
            <textarea id="field-notes" rows={3} className="input-field resize-y"
              placeholder="Survey remarks, boundary disputes, document references..."
              value={form.notes} onChange={set('notes')} />
          </Field>
          <p className="text-xs text-slate-400 italic mt-2">
            ⚠ All entries are stored in the LandGuard application database. Ensure accuracy.
            This system does not create legally certified land records.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pb-4">
          <button
            id="add-parcel-submit-btn"
            type="submit"
            disabled={saving}
            className="btn-primary flex items-center gap-2"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Saving...' : 'Save Parcel'}
          </button>
          <button type="button" onClick={() => navigate('/parcels')} className="btn-secondary">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

// Tiny helper wrapper for form fields
function Field({ label, error, children }: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
        {label}
      </label>
      {children}
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  )
}
