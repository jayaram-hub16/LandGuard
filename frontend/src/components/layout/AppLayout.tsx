// AppLayout — sidebar + topbar shell for authenticated pages
import React, { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  Shield, LayoutDashboard, Map, FileText, AlertTriangle,
  Users, Activity, Settings, LogOut, Menu, X,
  ChevronRight, Database, BarChart3, Search, Briefcase,
  ClipboardList, MessageSquare, Globe, Brain, ShieldAlert, Cpu
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useLang } from '../../context/LangContext'
import NotificationBell from '../ui/NotificationBell'
import clsx from 'clsx'

interface NavItem {
  to: string
  icon: React.ReactNode
  label: string
  adminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard',  icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
  { to: '/map',        icon: <Map size={18} />,             label: 'GIS Map' },
  { to: '/parcels',    icon: <FileText size={18} />,        label: 'Land Parcels' },
  { to: '/detections', icon: <AlertTriangle size={18} />,   label: 'Detections' },
  { to: '/monitoring', icon: <ShieldAlert size={18} />,     label: 'Occupation Monitor' },
  { to: '/cases',      icon: <Briefcase size={18} />,       label: 'Cases' },
  { to: '/surveys',    icon: <ClipboardList size={18} />,   label: 'Field Surveys' },
  { to: '/complaints', icon: <MessageSquare size={18} />,   label: 'Citizen Portal' },
  { to: '/ai-detection', icon: <Brain size={18} />,         label: 'AI Detection' },
  { to: '/ai-models',    icon: <Cpu size={18} />,           label: 'AI & GIS Models' },
  { to: '/reports',    icon: <BarChart3 size={18} />,       label: 'Reports' },
]

const ADMIN_ITEMS: NavItem[] = [
  { to: '/admin',           icon: <Database size={18} />,    label: 'Admin Dashboard', adminOnly: true },
  { to: '/admin/users',     icon: <Users size={18} />,       label: 'User Management', adminOnly: true },
  { to: '/admin/audit',     icon: <Activity size={18} />,    label: 'Audit Logs',      adminOnly: true },
  { to: '/monitoring',      icon: <ShieldAlert size={18} />, label: 'Occupation Monitor', adminOnly: true },
]

export default function AppLayout() {
  const { user, logout, isAdmin } = useAuth()
  const { lang, toggleLang } = useLang()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const NavItems = ({ items }: { items: NavItem[] }) => (
    <>
      {items.map(item => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/admin'}
          className={({ isActive }) => clsx(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-sm transition-all duration-200',
            isActive
              ? 'bg-blue-50 text-blue-700 border border-blue-100 font-semibold'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
          )}
          onClick={() => setMobileOpen(false)}
        >
          {item.icon}
          <span className={clsx('transition-all duration-200', !sidebarOpen && 'lg:hidden')}>
            {item.label}
          </span>
        </NavLink>
      ))}
    </>
  )

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-100">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-sky-500
                        flex items-center justify-center flex-shrink-0 shadow-blue-200">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div className={clsx('transition-all duration-200', !sidebarOpen && 'lg:hidden')}>
          <div className="text-sm font-bold gradient-text leading-tight">LandGuard</div>
          <div className="text-xs text-slate-400">GIS Platform</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <NavItems items={NAV_ITEMS} />

        {isAdmin() && (
          <>
            <div className={clsx(
              'mt-4 mb-2 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider',
              !sidebarOpen && 'lg:hidden'
            )}>
              Administration
            </div>
            <NavItems items={ADMIN_ITEMS} />
          </>
        )}
      </nav>

      {/* User */}
      <div className="border-t border-slate-100 p-3">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-50 cursor-pointer"
             onClick={() => navigate('/settings')}>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-sky-500
                          flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {user?.full_name?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className={clsx('flex-1 min-w-0', !sidebarOpen && 'lg:hidden')}>
            <div className="text-xs font-semibold text-slate-800 truncate">{user?.full_name}</div>
            <div className="text-xs text-slate-400 truncate">{user?.role}</div>
          </div>
          <ChevronRight size={14} className={clsx('text-slate-300 flex-shrink-0', !sidebarOpen && 'lg:hidden')} />
        </div>

        <button
          onClick={handleLogout}
          className="w-full mt-1 flex items-center gap-3 px-2 py-2 rounded-lg text-slate-500
                     hover:bg-red-50 hover:text-red-600 transition-all duration-200 text-sm font-medium"
        >
          <LogOut size={16} />
          <span className={clsx(!sidebarOpen && 'lg:hidden')}>Sign Out</span>
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Desktop Sidebar */}
      <aside className={clsx(
        'hidden lg:flex flex-col bg-white border-r border-slate-200 shadow-sm',
        'transition-all duration-300 flex-shrink-0',
        sidebarOpen ? 'w-60' : 'w-16'
      )}>
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm"
               onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 bg-white border-r border-slate-200 flex flex-col z-10">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Topbar */}
        <header className="h-14 bg-white/95 backdrop-blur-sm border-b border-slate-200 shadow-sm
                           flex items-center gap-3 px-4 flex-shrink-0">
          {/* Mobile menu */}
          <button
            className="lg:hidden btn-ghost p-1.5"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={20} />
          </button>

          {/* Desktop sidebar toggle */}
          <button
            className="hidden lg:flex btn-ghost p-1.5"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          {/* Search */}
          <div className="flex-1 max-w-md relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="Search parcels, detections..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-700
                         placeholder-slate-400 rounded-lg pl-9 pr-4 py-1.5 text-sm
                         focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30"
            />
          </div>

          <div className="flex-1" />

          {/* Notifications */}
          <NotificationBell />

          {/* Language Toggle */}
          <button
            onClick={toggleLang}
            className="btn-ghost p-1.5 flex items-center gap-1 text-xs font-semibold text-slate-500"
            id="lang-toggle-btn"
            title={lang === 'en' ? 'Switch to Telugu' : 'Switch to English'}
          >
            <Globe size={15} />
            <span className="hidden sm:inline">{lang === 'en' ? 'తె' : 'EN'}</span>
          </button>

          {/* User avatar */}
          <button
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            onClick={() => navigate('/settings')}
            id="user-menu-btn"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-sky-500
                            flex items-center justify-center text-white text-xs font-bold">
              {user?.full_name?.charAt(0).toUpperCase() || 'U'}
            </div>
            {user?.role === 'ADMIN' && (
              <span className="hidden sm:block badge badge-admin text-[10px] py-0.5">ADMIN</span>
            )}
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 lg:p-6 page-enter">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
