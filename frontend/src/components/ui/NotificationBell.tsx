// NotificationBell — real-time unread count with dropdown list
// Polls every 60 seconds for new notifications.
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Bell, X, CheckCheck, AlertTriangle, Info, Briefcase, MapPin } from 'lucide-react'
import { notificationsAPI } from '../../services/api'
import type { Notification } from '../../types'

const TYPE_ICON: Record<string, React.ReactNode> = {
  detection_alert: <AlertTriangle size={13} className="text-orange-400 flex-shrink-0" />,
  case_update:     <Briefcase size={13} className="text-blue-400 flex-shrink-0" />,
  survey_assigned: <MapPin size={13} className="text-purple-400 flex-shrink-0" />,
  complaint_update:<AlertTriangle size={13} className="text-yellow-400 flex-shrink-0" />,
  info:            <Info size={13} className="text-slate-500 flex-shrink-0" />,
}

export default function NotificationBell() {
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const fetchCount = useCallback(async () => {
    try {
      const res = await notificationsAPI.unreadCount()
      setUnread(res.data.unread_count ?? 0)
    } catch { /* ignore */ }
  }, [])

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await notificationsAPI.list({ per_page: 15 })
      setNotifications(res.data.notifications || [])
      setUnread(res.data.unread_count ?? 0)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchCount()
    // Poll every 60 s
    const interval = setInterval(fetchCount, 60_000)
    return () => clearInterval(interval)
  }, [fetchCount])

  useEffect(() => {
    if (open) fetchList()
  }, [open, fetchList])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const markRead = async (id: string) => {
    try {
      await notificationsAPI.markRead(id)
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
      setUnread(prev => Math.max(0, prev - 1))
    } catch { /* ignore */ }
  }

  const markAllRead = async () => {
    try {
      await notificationsAPI.markAllRead()
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      setUnread(0)
    } catch { /* ignore */ }
  }

  return (
    <div ref={ref} className="relative">
      <button
        className="btn-ghost p-1.5 relative"
        onClick={() => setOpen(o => !o)}
        id="notif-bell-btn"
        title="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full
                           bg-orange-500 text-white text-[9px] font-bold
                           flex items-center justify-center px-0.5 leading-none">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-9 w-80 sm:w-96 bg-white border border-slate-200 rounded-xl
                        shadow-2xl z-[2000] overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="text-sm font-semibold text-slate-800">Notifications</span>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                  title="Mark all as read"
                >
                  <CheckCheck size={12} /> All read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-100">
            {loading ? (
              <div className="p-6 text-center text-slate-400 text-sm">Loading…</div>
            ) : notifications.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-sm">No notifications</div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className={`px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer
                    ${!n.is_read ? 'bg-orange-500/5 border-l-2 border-l-orange-500' : ''}`}
                  onClick={() => !n.is_read && markRead(n.id)}
                >
                  <div className="flex items-start gap-2">
                    {TYPE_ICON[n.notification_type] || TYPE_ICON.info}
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs font-semibold truncate ${!n.is_read ? 'text-slate-900' : 'text-slate-700'}`}>
                        {n.title}
                      </div>
                      {n.incident_ref && (
                        <div className="text-xs text-orange-400 font-mono mt-0.5">{n.incident_ref}</div>
                      )}
                      <div className="text-xs text-slate-400 mt-0.5 line-clamp-2">
                        {n.message.split('\n')[0]}
                      </div>
                      <div className="text-xs text-slate-300 mt-1">
                        {n.created_at ? new Date(n.created_at).toLocaleString('en-IN') : ''}
                      </div>
                    </div>
                    {!n.is_read && (
                      <div className="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0 mt-1" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {notifications.length > 0 && (
            <div className="px-4 py-2 border-t border-slate-100 text-center">
              <span className="text-xs text-slate-400">Showing last {notifications.length} notifications</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

