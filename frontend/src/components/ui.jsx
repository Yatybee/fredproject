import { createContext, useCallback, useContext, useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Inbox, Loader2, X } from 'lucide-react'
import { STATUS, URGENCY } from '../lib.js'
import HeaderTools from './HeaderTools.jsx'

const cx = (...c) => c.filter(Boolean).join(' ')

export function Card({ title, action, children, className = '', padded = true }) {
  return (
    <section className={cx('rounded-xl border border-slate-200/70 bg-white shadow-card', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-4">
          <h2 className="text-sm font-semibold text-navy-900">{title}</h2>
          {action}
        </div>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </section>
  )
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-navy-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      <div className="no-print flex flex-wrap items-center gap-3">
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        <HeaderTools />
      </div>
    </div>
  )
}

const VARIANTS = {
  primary: 'bg-blue-600 text-white shadow-sm hover:bg-blue-700 focus-visible:outline-blue-600',
  secondary: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 shadow-sm hover:bg-slate-50',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  ghost: 'text-slate-600 hover:bg-slate-100',
}

export function Button({ variant = 'primary', loading, icon: Icon, children, className = '', size = 'md', ...rest }) {
  return (
    <button
      {...rest}
      disabled={loading || rest.disabled}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60',
        size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2 text-sm',
        VARIANTS[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon && <Icon className="h-4 w-4" />}
      {children}
    </button>
  )
}

export function Badge({ className = '', children }) {
  return (
    <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', className)}>
      {children}
    </span>
  )
}
export const StatusBadge = ({ status }) => (
  <Badge className={STATUS[status]?.badge}>
    <span className={cx('mr-1.5 h-1.5 w-1.5 rounded-full', STATUS[status]?.dot)} />{STATUS[status]?.label || status}
  </Badge>
)
export const UrgencyBadge = ({ urgency }) => <Badge className={URGENCY[urgency]?.badge}>{URGENCY[urgency]?.label || urgency}</Badge>

export function Spinner({ label = 'Loading…' }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
      <Loader2 className="h-5 w-5 animate-spin text-blue-600" /> {label}
    </div>
  )
}

export function EmptyState({ title, hint, action, icon: Icon = Inbox }) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      <div className="mb-3 rounded-full bg-navy-50 p-3 text-navy-700"><Icon className="h-6 w-6" /></div>
      <p className="text-sm font-medium text-slate-800">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-slate-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <AlertCircle className="h-8 w-8 text-red-500" />
      <p className="text-sm text-slate-700">{message}</p>
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button>}
    </div>
  )
}

export function Alert({ kind = 'error', children }) {
  if (!children) return null
  const styles = kind === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
  return <div role="alert" className={cx('flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm', styles)}>
    {kind === 'error' ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
    <span>{children}</span>
  </div>
}

/** Load-state switch used by every page: spinner -> error -> children. */
export function Async({ state, children }) {
  if (state.loading && !state.data) return <Spinner />
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />
  return children(state.data)
}

// ---------- form controls ----------
const inputCls = 'block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-600 disabled:bg-slate-50'

export function Field({ label, hint, required, children }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children(id)}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}
export const Input = ({ label, hint, required, className = '', ...p }) => (
  <Field label={label} hint={hint} required={required}>{(id) => <input id={id} required={required} className={cx(inputCls, className)} {...p} />}</Field>
)
export const Select = ({ label, hint, required, children, ...p }) => (
  <Field label={label} hint={hint} required={required}>{(id) => <select id={id} required={required} className={inputCls} {...p}>{children}</select>}</Field>
)
export const Textarea = ({ label, hint, required, ...p }) => (
  <Field label={label} hint={hint} required={required}>{(id) => <textarea id={id} rows={3} required={required} className={inputCls} {...p} />}</Field>
)
export const bareInput = inputCls

// ---------- modal ----------
export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-950/50 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-navy-900">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

// ---------- toasts ----------
const ToastContext = createContext(() => {})
export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const push = useCallback((message, kind = 'success') => {
    const id = Math.random()
    setToasts((t) => [...t, { id, message, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500)
  }, [])
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6">
        {toasts.map((t) => (
          <div key={t.id} className={cx('flex max-w-sm items-start gap-2 rounded-lg px-4 py-3 text-sm text-white shadow-lg', t.kind === 'error' ? 'bg-red-600' : 'bg-navy-900')}>
            {t.kind === 'error' ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

const TONES = {
  blue: { icon: 'bg-blue-50 text-blue-600', bar: 'bg-blue-500' },
  amber: { icon: 'bg-amber-50 text-amber-600', bar: 'bg-amber-400' },
  red: { icon: 'bg-red-50 text-red-600', bar: 'bg-red-400' },
  green: { icon: 'bg-teal-50 text-teal-600', bar: 'bg-teal-500' },
  navy: { icon: 'bg-navy-50 text-navy-700', bar: 'bg-navy-700' },
}

/** KPI tile: small tinted icon, big number, hint line and an optional thin progress indicator (0-100). */
export function StatCard({ label, value, hint, icon: Icon, tone = 'blue', progress, to }) {
  const t = TONES[tone] || TONES.blue
  const body = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {Icon && <span className={cx('grid h-9 w-9 place-items-center rounded-lg', t.icon)}><Icon className="h-[18px] w-[18px]" /></span>}
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-navy-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {progress != null && (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-100" role="presentation">
          <div className={cx('h-full rounded-full transition-all duration-500', t.bar)} style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      )}
    </>
  )
  const cls = 'block rounded-xl border border-slate-200/70 bg-white p-5 shadow-card transition-shadow duration-200'
  return to
    ? <Link to={to} className={cx(cls, 'hover:shadow-card-hover')}>{body}</Link>
    : <div className={cls}>{body}</div>
}
