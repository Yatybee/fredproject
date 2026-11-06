import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Bell, BarChart3, Building2, CalendarClock, ClipboardList, LayoutDashboard, LogOut, Menu,
  PanelLeftClose, PanelLeftOpen, Plus, FilePlus2, UserCog, Users, X,
} from 'lucide-react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { ROLES } from '../lib.js'
import { UnreadContext } from './notifContext.js'
import { ThemeToggle } from '../theme.jsx'

const COLLAPSE_KEY = 'sidebar-collapsed'

export default function Layout() {
  const { user, logout, can } = useAuth()
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1')
  const location = useLocation()

  useEffect(() => setOpen(false), [location.pathname])
  useEffect(() => { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0') }, [collapsed])

  // Unread-alert badge; refreshed on navigation and every minute.
  useEffect(() => {
    if (!can('notify')) return
    let live = true
    const load = () => api.notifications().then((n) => live && setUnread(n.length)).catch(() => {})
    load()
    const t = setInterval(load, 60000)
    return () => { live = false; clearInterval(t) }
  }, [can, location.pathname])

  // Grouped navigation. "New referral" is a button on the dashboard and referrals page, not a menu item.
  const groups = [
    { title: 'Main', items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/referrals', label: 'Referrals', icon: ClipboardList },
      { to: '/patients', label: 'Patients', icon: Users },
      { to: '/facilities', label: 'Facilities', icon: Building2 },
    ] },
    { title: 'Follow-up', items: [
      { to: '/follow-ups', label: 'Follow-up schedule', icon: CalendarClock },
      can('notify') && { to: '/notifications', label: 'Notifications', icon: Bell, badge: unread },
    ] },
    { title: 'Management', items: [
      { to: '/reports', label: 'Reports & analytics', icon: BarChart3 },
      can('manage_users') && { to: '/staff', label: 'User management', icon: UserCog },
    ] },
  ].map((g) => ({ ...g, items: g.items.filter(Boolean) }))

  /** `compact` = icon-only rail (desktop, collapsed). The mobile drawer is always expanded. */
  const sidebar = (compact) => (
    <div className="flex h-full flex-col">
      <div className={`flex h-16 items-center gap-2.5 ${compact ? 'justify-center' : 'px-5'}`}>
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-600/30"><Plus className="h-4 w-4" strokeWidth={3} /></div>
        {!compact && <p className="font-heading text-[15px] font-bold tracking-tight text-ink">Referral Tracker</p>}
      </div>

      <nav className={`flex-1 space-y-5 px-3 py-3 ${compact ? '' : 'overflow-y-auto overflow-x-hidden'}`} aria-label="Main">
        {groups.map((g) => (
          <div key={g.title}>
            {compact
              ? <div className="mx-3 mb-2 border-t border-slate-200/80" aria-hidden />
              : <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g.title}</p>}
            <div className="space-y-0.5">
              {g.items.map(({ to, label, icon: Icon, end, badge }) => (
                <NavLink key={to} to={to} end={end} aria-label={compact ? label : undefined}
                  className={({ isActive }) => `group relative flex items-center rounded-xl text-sm font-medium transition-colors duration-150 ${
                    compact ? 'h-11 justify-center' : 'gap-3 px-3.5 py-2.5'} ${
                    isActive ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'text-slate-600 hover:bg-slate-100 hover:text-ink'}`}>
                  {({ isActive }) => (
                    <>
                      <Icon className="h-[18px] w-[18px] shrink-0" />
                      {!compact && <span className="flex-1 truncate">{label}</span>}
                      {badge > 0 && (compact
                        ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-surface" />
                        : <span className="rounded-full bg-red-500 px-1.5 py-px text-[11px] font-semibold text-white">{badge}</span>)}
                      {compact && (
                        <span role="tooltip" className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-md bg-navy-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
                          {label}{badge > 0 ? ` (${badge})` : ''}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {can('write_referral') && (compact ? (
        <div className="px-3 pb-2">
          <Link to="/referrals/new" aria-label="New referral" title="New referral"
            className="grid h-11 w-full place-items-center rounded-xl bg-navy-950 text-white shadow-md transition-transform hover:-translate-y-0.5"><FilePlus2 className="h-[18px] w-[18px]" /></Link>
        </div>
      ) : (
        <div className="px-3 pb-2">
          <div className="relative overflow-hidden rounded-2xl bg-navy-950 p-4 text-white">
            <div className="pointer-events-none absolute -bottom-8 -right-6 h-28 w-28 rounded-full bg-blue-500/20" />
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10"><FilePlus2 className="h-4 w-4" /></span>
            <p className="mt-3 text-sm font-semibold">New referral</p>
            <p className="mt-1 text-xs leading-snug text-white/65">Refer a patient and track them through to follow-up.</p>
            <Link to="/referrals/new" className="relative mt-3 inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500">Create referral</Link>
          </div>
        </div>
      ))}

      <div className="border-t border-slate-200/70 p-3">
        <div className={`flex items-center gap-3 ${compact ? 'justify-center' : 'px-2 py-1'}`}>
          <div title={compact ? `${user.username} · ${ROLES[user.role]}` : undefined}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-navy-800 text-xs font-semibold uppercase text-white">{user.username.slice(0, 2)}</div>
          {!compact && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{user.username}</p>
              <p className="truncate text-xs text-slate-500">{ROLES[user.role]}</p>
            </div>
          )}
        </div>
        <button onClick={logout} aria-label="Sign out" title={compact ? 'Sign out' : undefined}
          className={`mt-1 flex w-full items-center rounded-lg text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-ink ${compact ? 'h-10 justify-center' : 'gap-3 px-3 py-2'}`}>
          <LogOut className="h-[18px] w-[18px]" />{!compact && 'Sign out'}
        </button>
      </div>
    </div>
  )

  return (
    <UnreadContext.Provider value={unread}>
      <div className="flex min-h-screen">
        <aside className={`no-print sticky top-0 hidden h-screen shrink-0 p-3 transition-[width] duration-200 lg:block ${collapsed ? 'w-[92px]' : 'w-[264px]'}`}>
          <div className="h-full rounded-2xl border border-slate-200/50 bg-surface shadow-card">{sidebar(collapsed)}</div>
          <button onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed}
            className="absolute right-0 top-[34px] z-10 grid h-6 w-6 place-items-center rounded-full border border-slate-200 bg-surface text-slate-500 shadow-sm transition-colors hover:text-ink">
            {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
          </button>
        </aside>

        {open && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-navy-950/50" onClick={() => setOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] rounded-r-2xl bg-surface shadow-xl">
              {sidebar(false)}
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="absolute right-3 top-4 rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </aside>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <header className="no-print sticky top-0 z-20 flex items-center justify-between border-b border-slate-200/70 bg-surface/90 px-4 py-3 backdrop-blur lg:hidden">
            <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-lg p-2 text-ink hover:bg-slate-100"><Menu className="h-5 w-5" /></button>
            <span className="text-sm font-semibold text-ink">Referral Tracker</span>
            <div className="flex items-center gap-1">
              <ThemeToggle className="!h-9 !w-9 !border-0 !bg-transparent !shadow-none hover:!bg-slate-100" />
              {can('notify') && (
                <NavLink to="/notifications" aria-label={`Notifications, ${unread} unread`} className="relative rounded-lg p-2 text-ink hover:bg-slate-100">
                  <Bell className="h-5 w-5" />
                  {unread > 0 && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-red-500" />}
                </NavLink>
              )}
            </div>
          </header>

          <main className="mx-auto max-w-[1400px] p-4 sm:p-6 lg:py-8 lg:pl-3 lg:pr-8">
            <Outlet />
          </main>
        </div>
      </div>
    </UnreadContext.Provider>
  )
}
