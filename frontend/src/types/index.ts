// TypeScript type definitions for LandGuard
// Extended with Case, FieldSurvey, Complaint types and new roles

export interface User {
  id: string
  email: string
  full_name: string
  organization?: string
  role: 'USER' | 'ADMIN' | 'SURVEYOR' | 'REVIEWER' | 'CITIZEN'
  status: 'ACTIVE' | 'INACTIVE'
  last_login?: string
  created_at?: string
}

export interface OwnershipRecord {
  id: string
  owner_name: string
  owner_reference: string
  registration_reference?: string
  registered_date?: string
  notes?: string
  is_simulated: boolean
  parcel_count: number
}

export interface LandParcel {
  id: string
  parcel_id: string
  ownership_id?: string
  owner?: OwnershipRecord
  registered_area_sqm?: number
  boundary_geojson?: Record<string, unknown>
  centroid_lat?: number
  centroid_lng?: number
  administrative_area?: string
  district?: string
  state?: string
  address?: string
  registered_land_use?: string
  observed_land_use?: string
  review_status?: string
  is_flagged: boolean
  is_simulated: boolean
  detection_count: number
  created_at?: string
  updated_at?: string
}

export interface EncroachmentDetection {
  id: string
  parcel_id: string
  parcel?: LandParcel
  registered_area_sqm?: number
  observed_area_sqm?: number
  overlap_area_sqm?: number
  area_difference_sqm?: number
  area_difference_pct?: number
  detected_land_use?: string
  registered_land_use?: string
  detection_reason: string
  model_confidence?: number
  review_status: string
  reviewer_id?: string
  reviewer_notes?: string
  reviewed_at?: string
  severity: 'Low' | 'Medium' | 'High' | 'Critical'
  detected_at?: string
  disclaimer?: string
  encroachment_boundary_geojson?: Record<string, unknown>
}

export interface Dataset {
  id: string
  name: string
  description?: string
  file_type?: string
  file_size_bytes?: number
  feature_count?: number
  status: string
  validation_errors?: string
  crs?: string
  uploaded_by?: string
  processed_at?: string
  created_at?: string
}

export interface Report {
  id: string
  title: string
  report_type: string
  format: 'pdf' | 'csv'
  filters_applied?: string
  created_by?: string
  created_at?: string
}

export interface AuditLog {
  id: string
  actor_id?: string
  actor_email?: string
  action: string
  entity_type?: string
  entity_id?: string
  details?: string
  ip_address?: string
  timestamp?: string
}

export interface DashboardStats {
  parcels: { total: number; flagged: number }
  detections: { total: number; pending: number }
  users: { total: number; active: number }
  datasets: { total: number }
  land_use_distribution: Record<string, number>
  severity_distribution: Record<string, number>
  recent_activity: AuditLog[]
}

// ── Case Management ──────────────────────────────────────────────

export type CaseStatus =
  | 'Reported'
  | 'Under Review'
  | 'Field Survey Assigned'
  | 'Survey Submitted'
  | 'Decision Pending'
  | 'Resolved'
  | 'Disputed'
  | 'Referred for Appeal'

export interface CaseHistoryEntry {
  id: string
  case_id: string
  changed_by?: string
  actor_name: string
  old_status?: string
  new_status: string
  notes?: string
  changed_at?: string
}

export interface CaseEvidence {
  id: string
  case_id: string
  submitted_by?: string
  submitter_name?: string
  evidence_type: string
  file_name?: string
  file_mime?: string
  description?: string
  coordinates_lat?: number
  coordinates_lng?: number
  capture_date?: string
  is_verified: boolean
  created_at?: string
}

export interface Case {
  id: string
  case_number: string
  title: string
  description?: string
  parcel_id?: string
  parcel?: LandParcel
  detection_id?: string
  complaint_id?: string
  opened_by?: string
  opener_name?: string
  assigned_surveyor?: string
  surveyor_name?: string
  assigned_reviewer?: string
  reviewer_name?: string
  status: CaseStatus
  priority: 'Low' | 'Medium' | 'High' | 'Critical'
  decision_reason?: string
  deadline?: string
  resolved_at?: string
  is_overdue: boolean
  evidence_count: number
  created_at?: string
  updated_at?: string
  // Detail view only:
  history?: CaseHistoryEntry[]
  evidence?: CaseEvidence[]
  surveys?: FieldSurvey[]
}

// ── Field Surveys ────────────────────────────────────────────────

export interface FieldSurvey {
  id: string
  case_id?: string
  parcel_id?: string
  parcel_parcel_id?: string
  surveyor_id: string
  surveyor_name?: string
  survey_number?: string
  survey_date?: string
  status: 'draft' | 'submitted' | 'accepted' | 'rejected'
  observed_area_sqm?: number
  measurement_unit?: string
  accuracy_meters?: number
  centroid_lat?: number
  centroid_lng?: number
  land_use_observed?: string
  encroachment_found: boolean
  notes?: string
  recommendations?: string
  submitted_at?: string
  created_at?: string
  disclaimer?: string
}

// ── Complaints ───────────────────────────────────────────────────

export interface Complaint {
  id: string
  ack_number: string
  complainant_name: string
  complainant_email?: string   // admin view only
  complainant_phone?: string   // admin view only
  description: string
  location_address?: string
  location_lat?: number
  location_lng?: number
  parcel_ref?: string
  status: string
  admin_notes?: string        // admin view only
  case_id?: string
  submitted_at?: string
  updated_at?: string
}

export type SeverityLevel = 'Low' | 'Medium' | 'High' | 'Critical'
export type ReviewStatusType =
  | 'Pending Review'
  | 'Under Investigation'
  | 'Verified by Authorized Surveyor'
  | 'False Positive'
  | 'Resolved'

// ── Notifications ────────────────────────────────────────────────

export interface Notification {
  id: string
  user_id: string
  title: string
  message: string
  notification_type: 'detection_alert' | 'case_update' | 'survey_assigned' | 'complaint_update' | 'info'
  detection_id?: string
  case_id?: string
  parcel_id?: string
  incident_ref?: string
  is_read: boolean
  read_at?: string
  created_at?: string
}

// ── Occupation Monitor Stats ─────────────────────────────────────

export interface OccupationMonitorStats {
  summary: {
    newly_detected: number
    under_investigation: number
    field_inspection: number
    human_verified: number
    rejected_false: number
    resolved: number
    total_detections: number
    total_cases: number
    open_cases: number
  }
  severity_counts: Record<string, number>
  recent_detections: EncroachmentDetection[]
}

// ── AI & GIS Model Types ──────────────────────────────────────────

export interface AIModelRun {
  id: string
  model_name: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  confidence?: number
  error_message?: string
  started_at?: string
  completed_at?: string
  created_by?: string
  creator_name?: string
  report_path?: string
  input_params?: Record<string, unknown>
  output_summary?: Record<string, unknown>
  result_geojson?: GeoJSONFeatureCollection
}

export interface AIModelStatus {
  name: string
  description: string
  status: 'available' | 'not_configured' | 'processing' | 'completed' | 'failed'
  requirements: string[]
  disclaimer?: string
  reason?: string
  last_run?: {
    id: string
    run_status: string
    started_at?: string
    completed_at?: string
    confidence?: number
    summary?: Record<string, unknown>
  } | null
}

export interface GeoJSONFeature {
  type: 'Feature'
  geometry: Record<string, unknown>
  properties: Record<string, unknown>
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection'
  features: GeoJSONFeature[]
}
