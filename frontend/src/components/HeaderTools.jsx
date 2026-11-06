import { Link } from 'react-router-dom'
import { Bell, Search } from 'lucide-react'
import { useAuth } from '../auth.jsx'
import { ROLES } from '../lib.js'
import { useUnread } from './notifContext.js'
import { ThemeToggle } from '../theme.jsx'

const roundBtn = 'relative grid h-10 w-10 place-items-center rounded-full border border-slate-200/60 bg-surface text-ink shadow-card transition-colors hover:bg-blue-50'

/** Search, theme toggle, bell and the signed-in user, shown at the top-right of every page on desktop. */
export default function HeaderTools() {
  const { user, can } = useAuth()
  const unread = useUnread()
  if (!user) return null
  return (
    <div className="no-print hidden items-center gap-3 lg:flex">
      <Link to="/referrals" aria-label="Search referrals" title="Search referrals" className={roundBtn}>
        <Search className="h-[18px] w-[18px]" />
      </Link>
      <ThemeToggle />
      {can('notify') && (
        <Link to="/notifications" aria-label={`Notifications, ${unread} unread`} title="Notifications" className={roundBtn}>
          <Bell className="h-[18px] w-[18px]" />
          {unread > 0 && <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-surface" />}
        </Link>
      )}
      <div className="flex items-center gap-3 pl-1">
        <div title={user.username} className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-sm font-semibold uppercase text-white shadow-md shadow-blue-600/25">
          {user.username.slice(0, 2)}
        </div>
        <div className="hidden leading-tight xl:block">
          <p className="max-w-[120px] truncate text-sm font-semibold text-ink">{user.username}</p>
          <p className="text-xs text-slate-500">{ROLES[user.role]}</p>
        </div>
      </div>
    </div>
  )
}
