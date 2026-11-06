import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

const KEY = 'theme'
const ThemeContext = createContext({ theme: 'light', toggle: () => {} })

/** Light is the default; only an explicit, saved "dark" choice turns dark mode on. */
function readSaved() {
  try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light' } catch { return 'light' }
}

function apply(theme) {
  const root = document.documentElement
  if (theme === 'dark') root.setAttribute('data-theme', 'dark')
  else root.removeAttribute('data-theme')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b1220' : '#0f2a4a')
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(readSaved)

  useEffect(() => { apply(theme) }, [theme])

  // Remember the choice, and follow it if it is changed in another tab.
  useEffect(() => {
    const onStorage = (e) => { if (e.key === KEY) setTheme(readSaved()) }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const toggle = useCallback(() => {
    // The colour-fade rules in index.css only apply while this class is present, so the
    // transition runs for the switch itself and never slows normal hover/focus effects.
    const root = document.documentElement
    root.classList.add('theme-transition')
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark'
      try { localStorage.setItem(KEY, next) } catch { /* private mode: still works for this visit */ }
      return next
    })
    window.setTimeout(() => root.classList.remove('theme-transition'), 400)
  }, [])

  const value = useMemo(() => ({ theme, toggle }), [theme, toggle])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)

/** Colours for Recharts, which draws SVG attributes that CSS classes cannot reach. */
export function useChartColors() {
  const { theme } = useTheme()
  return useMemo(() => (theme === 'dark'
    ? {
        axis: '#94a3b8', grid: '#26334d', cursorLine: '#475569', cursorFill: 'rgba(148,163,184,0.12)',
        primary: '#6b7cff', teal: '#14b8a6', muted: '#34405c', track: '#1b2740',
        bubble: { background: '#27324d', color: '#f1f5f9' },
        tip: { borderRadius: 8, border: '1px solid #33425f', background: '#162033', color: '#e2e8f0', boxShadow: '0 4px 14px rgba(0,0,0,0.4)', fontSize: 12 },
        tipLabel: { color: '#e2e8f0' }, tipItem: { color: '#cbd5e1' },
      }
    : {
        axis: '#64748b', grid: '#e8edf3', cursorLine: '#cbd5e1', cursorFill: '#f1f5f9',
        primary: '#4255e6', teal: '#0d9488', muted: '#d5d9e8', track: '#eceef7',
        bubble: { background: '#0f172a', color: '#ffffff' },
        tip: { borderRadius: 8, border: '1px solid #e2e8f0', background: '#ffffff', color: '#1e293b', boxShadow: '0 4px 14px rgba(15,42,71,0.08)', fontSize: 12 },
        tipLabel: { color: '#1e293b' }, tipItem: { color: '#334155' },
      }), [theme])
}

/** Sun/moon button. Shows the icon of the mode you will switch TO. */
export function ThemeToggle({ className = '' }) {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode'
  return (
    <button type="button" onClick={toggle} aria-label={label} title={label} aria-pressed={dark}
      className={`no-print relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-slate-200/60 bg-surface text-ink shadow-card transition-colors hover:bg-blue-50 ${className}`}>
      <Sun className={`absolute h-5 w-5 transition-all duration-300 ${dark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-50 opacity-0'}`} />
      <Moon className={`absolute h-5 w-5 transition-all duration-300 ${dark ? 'rotate-90 scale-50 opacity-0' : 'rotate-0 scale-100 opacity-100'}`} />
    </button>
  )
}
