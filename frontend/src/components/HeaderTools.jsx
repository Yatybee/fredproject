import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useAuth } from '../auth.jsx'
import { useUnread } from './notifContext.js'

/** Bell + avatar shown at the top-right of every page on desktop. */
export default function HeaderTools() {
  const { user, can } = useAuth()
  const unread = useUnread()
  if (!user) return null
  return (
    <div className="no-print hidden items-center gap-3 lg:flex">
      {can('notify') && (
        <Link to="/notifications" aria-label={`Notifications, ${unread} unread`}
          className="relative grid h-10 w-10 place-items-center rounded-lg border border-slate-200/70 bg-white text-navy-800 shadow-sm transition-colors hover:bg-blue-50">
          <Bell className="h-5 w-5" />
          {unread > 0 && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />}
        </Link>
      )}
      <div title={user.username} className="grid h-10 w-10 place-items-center rounded-full bg-navy-800 text-sm font-semibold uppercase text-white">
        {user.username.slice(0, 2)}
      </div>
    </div>
  )
}
