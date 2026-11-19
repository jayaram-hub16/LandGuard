// API service layer — all backend communication
import axios from 'axios'

const PROD_BACKEND_URL = 'https://landguard-l6j1.onrender.com'

const getApiBase = (): string => {
  const envUrl = (import.meta.env.VITE_API_URL || '').trim()
  if (envUrl) {
    return envUrl.endsWith('/api') ? envUrl : `${envUrl.replace(/\/+$/, '')}/api`
  }
  if (import.meta.env.DEV) {
    return '/api'
  }
  return `${PROD_BACKEND_URL}/api`
}

const API_BASE = getApiBase()

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

// Attach Bearer token automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('landguard_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Handle 401 globally
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('landguard_token')
      localStorage.removeItem('landguard_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api

// ── Auth ─────────────────────────────────────────
export const authAPI = {
  signup: (data: Record<string, string>) => api.post('/auth/signup', data),
  login: (data: Record<string, string>) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  changePassword: (data: Record<string, string>) => api.post('/auth/change-password', data),
  // Password recovery via email OTP (all roles supported)
  forgotPassword: (data: { email: string }) => api.post('/auth/forgot-password', data),
  verifyOtp: (data: { email: string; otp: string }) => api.post('/auth/verify-otp', data),
  resetPassword: (data: { email: string; reset_token: string; new_password: string; confirm_password: string }) =>
    api.post('/auth/reset-password', data),
  // Admin SMTP config test (admin only)
  testEmail: (data?: { to_email?: string }) => api.post('/auth/test-email', data || {}),
}

// ── Parcels ───────────────────────────────────────
export const parcelsAPI = {
  list: (params?: Record<string, unknown>) => api.get('/parcels', { params }),
  myParcels: () => api.get('/parcels/my-parcels'),
  claim: (data: { parcel_id: string; owner_reference?: string }) => api.post('/parcels/claim', data),
  get: (id: string) => api.get(`/parcels/${id}`),
  create: (data: Record<string, unknown>) => api.post('/parcels', data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/parcels/${id}`, data),
  delete: (id: string) => api.delete(`/parcels/${id}`),
  downloadPdf: (id: string) => api.get(`/parcels/${id}/pdf`, { responseType: 'blob' }),
}


// ── Detections ────────────────────────────────────
export const detectionsAPI = {
  list: (params?: Record<string, unknown>) => api.get('/detections', { params }),
  get: (id: string) => api.get(`/detections/${id}`),
  review: (id: string, data: Record<string, string>) => api.patch(`/detections/${id}/review`, data),
  runDetection: () => api.post('/detections/run'),
}

// ── Datasets ──────────────────────────────────────
export const datasetsAPI = {
  list: () => api.get('/datasets'),
  get: (id: string) => api.get(`/datasets/${id}`),
  upload: (formData: FormData) => api.post('/datasets', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
}

// ── Admin ─────────────────────────────────────────
export const adminAPI = {
  dashboard: () => api.get('/admin/dashboard'),
  users: (params?: Record<string, unknown>) => api.get('/admin/users', { params }),
  createUser: (data: Record<string, unknown>) => api.post('/admin/users', data),
  updateUserStatus: (id: string, status: string) =>
    api.patch(`/admin/users/${id}/status`, { status }),
  updateUserRole: (id: string, role: string) =>
    api.patch(`/admin/users/${id}/role`, { role }),
  auditLogs: (params?: Record<string, unknown>) => api.get('/admin/audit-logs', { params }),
}

// ── Classification ────────────────────────────────
export const classificationAPI = {
  predict: (features: Record<string, number>[]) => api.post('/classification/predict', { features }),
  info: () => api.get('/classification/info'),
  train: () => api.post('/classification/train'),
}

// ── Reports ───────────────────────────────────────
export const reportsAPI = {
  list: () => api.get('/reports'),
  create: (data: Record<string, unknown>) => api.post('/reports', data),
  download: (id: string) => api.get(`/reports/${id}/download`, { responseType: 'blob' }),
}

// ── Cases ─────────────────────────────────────────
export const casesAPI = {
  list:         (params?: Record<string, unknown>) => api.get('/cases', { params }),
  get:          (id: string) => api.get(`/cases/${id}`),
  create:       (data: Record<string, unknown>) => api.post('/cases', data),
  updateStatus: (id: string, data: Record<string, unknown>) => api.patch(`/cases/${id}/status`, data),
  assign:       (id: string, data: Record<string, unknown>) => api.patch(`/cases/${id}/assign`, data),
  addEvidence:  (id: string, data: Record<string, unknown>) => api.post(`/cases/${id}/evidence`, data),
  stats:        () => api.get('/cases/stats'),
}

// ── Field Surveys ──────────────────────────────────
export const surveysAPI = {
  list:   (params?: Record<string, unknown>) => api.get('/surveys', { params }),
  get:    (id: string) => api.get(`/surveys/${id}`),
  create: (data: Record<string, unknown>) => api.post('/surveys', data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/surveys/${id}`, data),
  submit: (id: string) => api.post(`/surveys/${id}/submit`),
  review: (id: string, data: Record<string, unknown>) => api.patch(`/surveys/${id}/review`, data),
}

// ── Complaints ────────────────────────────────────
export const complaintsAPI = {
  // Public — no auth needed
  submit:      (data: Record<string, unknown>) => api.post('/complaints', data),
  checkStatus: (ackNumber: string) => api.get(`/complaints/status/${ackNumber}`),
  // Admin / Reviewer
  list:         (params?: Record<string, unknown>) => api.get('/complaints', { params }),
  get:          (id: string) => api.get(`/complaints/${id}`),
  updateStatus: (id: string, data: Record<string, unknown>) => api.patch(`/complaints/${id}/status`, data),
}

// ── Uploads ───────────────────────────────────────────────────────
export const uploadsAPI = {
  uploadCaseEvidence: (caseId: string, formData: FormData) =>
    api.post(`/uploads/case-evidence/${caseId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  downloadEvidence: (evidenceId: string) =>
    api.get(`/uploads/case-evidence/download/${evidenceId}`, { responseType: 'blob' }),
  uploadComplaintAttachment: (complaintId: string, formData: FormData) =>
    api.post(`/uploads/complaint-attachment/${complaintId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
}

// ── Export helpers ────────────────────────────────────────────────
export const exportAPI = {
  parcelsCSV: (params?: Record<string, unknown>) =>
    api.get('/parcels/export/csv', { params, responseType: 'blob' }),
  detectionsCSV: (params?: Record<string, unknown>) =>
    api.get('/detections/export/csv', { params, responseType: 'blob' }),
  boundaryHistory: (parcelId: string) =>
    api.get(`/parcels/${parcelId}/boundary-history`),
  adminStats: () => api.get('/admin/stats'),
}

// ── Notifications ─────────────────────────────────────────────────
export const notificationsAPI = {
  list:         (params?: Record<string, unknown>) => api.get('/notifications', { params }),
  unreadCount:  () => api.get('/notifications/unread-count'),
  markRead:     (id: string) => api.patch(`/notifications/${id}/read`),
  markAllRead:  () => api.patch('/notifications/mark-all-read'),
}

// ── Occupation Monitor ────────────────────────────────────────────
export const occupationAPI = {
  monitorStats: () => api.get('/admin/occupation-monitor'),
}

// ── AI & GIS Models ───────────────────────────────────────────────
export const aiModelsAPI = {
  status:              ()                       => api.get('/ai-models/status'),
  info:                (model: string)          => api.get(`/ai-models/${model}/info`),
  runLULC:             ()                       => api.post('/ai-models/lulc/run'),
  runBoundaryOverlap:  ()                       => api.post('/ai-models/boundary-overlap/run'),
  fetchWaterbodies:    ()                       => api.post('/ai-models/waterbody/fetch'),
  getRuns:             (model: string)          => api.get(`/ai-models/${model}/runs`),
  getRun:              (model: string, id: string) => api.get(`/ai-models/${model}/runs/${id}`),
}

// ── Health ────────────────────────────────────────────────────────
export const healthAPI = {
  check: () => api.get('/health'),
}


