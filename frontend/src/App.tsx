import React, { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import AppLayout from './components/layout/AppLayout'
import LoadingScreen from './components/ui/LoadingScreen'

// Lazy-load pages
const LandingPage        = lazy(() => import('./pages/LandingPage'))
const LoginPage          = lazy(() => import('./pages/auth/LoginPage'))
const SignupPage         = lazy(() => import('./pages/auth/SignupPage'))
const DashboardPage      = lazy(() => import('./pages/dashboard/DashboardPage'))
const MapPage            = lazy(() => import('./pages/MapPage'))
const ParcelsPage        = lazy(() => import('./pages/parcels/ParcelsPage'))
const AddParcelPage      = lazy(() => import('./pages/parcels/AddParcelPage'))
const ParcelDetailPage   = lazy(() => import('./pages/parcels/ParcelDetailPage'))
const DetectionsPage     = lazy(() => import('./pages/detections/DetectionsPage'))
const ReportsPage        = lazy(() => import('./pages/reports/ReportsPage'))
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'))
const AdminUsersPage     = lazy(() => import('./pages/admin/AdminUsersPage'))
const AdminAuditPage     = lazy(() => import('./pages/admin/AdminAuditPage'))
const SettingsPage       = lazy(() => import('./pages/SettingsPage'))
// New Feature Pages
const CasesPage          = lazy(() => import('./pages/cases/CasesPage'))
const CaseDetailPage     = lazy(() => import('./pages/cases/CaseDetailPage'))
const FieldSurveyPage    = lazy(() => import('./pages/surveys/FieldSurveyPage'))
const CitizenPortalPage  = lazy(() => import('./pages/citizen/CitizenPortalPage'))
const AIDetectionPage    = lazy(() => import('./pages/ai/AIDetectionPage'))
const AIGISModelCentrePage = lazy(() => import('./pages/ai/AIGISModelCentrePage'))
const LULCPage             = lazy(() => import('./pages/ai/LULCPage'))
const BoundaryOverlapPage  = lazy(() => import('./pages/ai/BoundaryOverlapPage'))
const ModelNotConfiguredPage = lazy(() => import('./pages/ai/ModelNotConfiguredPage'))
const WaterbodyPage        = lazy(() => import('./pages/ai/WaterbodyPage'))
const OccupationMonitorPage = lazy(() => import('./pages/admin/OccupationMonitorPage'))

/** Requires login. adminOnly = only ADMIN role; staffOnly = ADMIN | REVIEWER | SURVEYOR */
function ProtectedRoute({
  children,
  adminOnly  = false,
  staffOnly  = false,
}: {
  children: React.ReactNode
  adminOnly?: boolean
  staffOnly?: boolean
}) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && user.role !== 'ADMIN') return <Navigate to="/dashboard" replace />
  if (staffOnly && !['ADMIN', 'REVIEWER', 'SURVEYOR'].includes(user.role))
    return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <LoadingScreen />
  if (user) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        {/* Fully public routes */}
        <Route path="/"        element={<LandingPage />} />
        <Route path="/login"   element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/signup"  element={<PublicRoute><SignupPage /></PublicRoute>} />
        {/* Citizen portal — accessible without login */}
        <Route path="/portal"  element={<CitizenPortalPage />} />

        {/* Protected app shell */}
        <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="dashboard"   element={<DashboardPage />} />
          <Route path="map"         element={<MapPage />} />

          {/* Parcels */}
          <Route path="parcels"     element={<ParcelsPage />} />
          <Route path="parcels/new" element={<ProtectedRoute adminOnly><AddParcelPage /></ProtectedRoute>} />
          <Route path="parcels/:id" element={<ParcelDetailPage />} />

          {/* Detections & Reports */}
          <Route path="detections"  element={<DetectionsPage />} />
          <Route path="reports"     element={<ReportsPage />} />
          <Route path="settings"    element={<SettingsPage />} />

          {/* Case Management — staff only */}
          <Route path="cases"       element={<ProtectedRoute staffOnly><CasesPage /></ProtectedRoute>} />
          <Route path="cases/:id"   element={<ProtectedRoute staffOnly><CaseDetailPage /></ProtectedRoute>} />

          {/* Field Surveys — surveyors + admins */}
          <Route path="surveys"     element={<ProtectedRoute staffOnly><FieldSurveyPage /></ProtectedRoute>} />

          {/* Citizen portal inside shell (logged-in view) */}
          <Route path="complaints"  element={<CitizenPortalPage />} />

          {/* AI Detection — all authenticated staff */}
          <Route path="ai-detection" element={<ProtectedRoute staffOnly><AIDetectionPage /></ProtectedRoute>} />

          {/* AI & GIS Model Centre */}
          <Route path="ai-models"                     element={<ProtectedRoute staffOnly><AIGISModelCentrePage /></ProtectedRoute>} />
          <Route path="ai-models/lulc"               element={<ProtectedRoute staffOnly><LULCPage /></ProtectedRoute>} />
          <Route path="ai-models/boundary-overlap"   element={<ProtectedRoute staffOnly><BoundaryOverlapPage /></ProtectedRoute>} />
          <Route path="ai-models/waterbody"          element={<ProtectedRoute staffOnly><WaterbodyPage /></ProtectedRoute>} />
          <Route path="ai-models/change-detection"   element={<ProtectedRoute staffOnly><ModelNotConfiguredPage /></ProtectedRoute>} />
          <Route path="ai-models/building-detection" element={<ProtectedRoute staffOnly><ModelNotConfiguredPage /></ProtectedRoute>} />
          <Route path="ai-models/dem"                element={<ProtectedRoute staffOnly><ModelNotConfiguredPage /></ProtectedRoute>} />

          {/* Occupation Monitoring — admin only */}
          <Route path="monitoring" element={<ProtectedRoute adminOnly><OccupationMonitorPage /></ProtectedRoute>} />

          {/* Admin-only */}
          <Route path="admin"       element={<ProtectedRoute adminOnly><AdminDashboardPage /></ProtectedRoute>} />
          <Route path="admin/users" element={<ProtectedRoute adminOnly><AdminUsersPage /></ProtectedRoute>} />
          <Route path="admin/audit" element={<ProtectedRoute adminOnly><AdminAuditPage /></ProtectedRoute>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
