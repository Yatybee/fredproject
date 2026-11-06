import { useCallback, useEffect, useState } from 'react'

export const STATUS = {
  PENDING:   { label: 'Pending',   badge: 'bg-amber-50 text-amber-800 ring-amber-600/20',   dot: 'bg-amber-500',   color: '#e0a030' },
  ATTENDED:  { label: 'Attended',  badge: 'bg-blue-50 text-blue-800 ring-blue-600/20',      dot: 'bg-blue-500',    color: '#3b82d6' },
  COMPLETED: { label: 'Completed', badge: 'bg-teal-50 text-teal-800 ring-teal-600/20',      dot: 'bg-teal-600',    color: '#0d9488' },
  NO_SHOW:   { label: 'No-show',   badge: 'bg-red-50 text-red-800 ring-red-600/20',         dot: 'bg-red-500',     color: '#dc5a5a' },
  CANCELLED: { label: 'Cancelled', badge: 'bg-slate-100 text-slate-700 ring-slate-500/20',  dot: 'bg-slate-400',   color: '#94a3b8' },
}

export const URGENCY = {
  ROUTINE:   { label: 'Routine',   badge: 'bg-slate-100 text-slate-700 ring-slate-500/20',   color: '#64748b' },
  URGENT:    { label: 'Urgent',    badge: 'bg-orange-50 text-orange-800 ring-orange-600/20', color: '#ea580c' },
  EMERGENCY: { label: 'Emergency', badge: 'bg-red-50 text-red-800 ring-red-600/20',          color: '#dc2626' },
}

export const ROLES = { ADMIN: 'Administrator', HEALTH_WORKER: 'Health worker', VIEWER: 'Viewer (read-only)' }

export const today = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export const fmtDate = (iso) => {
  if (!iso) return '—'
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`)
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export const fmtDateTime = (iso) => {
  if (!iso) return '—'
  // SQLite datetime('now') is UTC without a zone marker
  const d = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`)
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export const daysFromToday = (iso) =>
  Math.round((new Date(`${iso}T00:00:00`) - new Date(`${today()}T00:00:00`)) / 86400000)

export const monthLabel = (ym) =>
  new Date(`${ym}-01T00:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })

/** Run an async loader on mount (and when deps change) and expose {data, error, loading, reload}. */
export function useLoad(loader, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  const run = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      setState({ data: await loader(), error: null, loading: false })
    } catch (e) {
      setState({ data: null, error: e.message, loading: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => { run() }, [run])
  return { ...state, reload: run }
}

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}
