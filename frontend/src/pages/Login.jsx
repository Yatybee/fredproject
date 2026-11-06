import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, HeartPulse, LogIn, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useAuth } from '../auth.jsx'

const field = [
  'h-12 w-full rounded-full border border-white/20 bg-white/[0.04] px-5 text-sm text-white placeholder:text-white/60',
  'outline-none transition duration-200 hover:border-white/30 focus:border-blue-400 focus:bg-white/[0.07] focus:ring-4 focus:ring-blue-500/25',
  '[&:-webkit-autofill]:[-webkit-text-fill-color:#fff] [&:-webkit-autofill]:shadow-[inset_0_0_0_100px_#0c1235]',
].join(' ')

const ring = 'pointer-events-none absolute h-[100vmin] w-[100vmin] rounded-full border-[10px] border-[#1677ff] shadow-[0_0_60px_rgba(22,119,255,0.45),inset_0_0_80px_rgba(22,119,255,0.25)]'

export default function Login() {
  const { login } = useAuth()
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(form.username.trim(), form.password)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black px-4 py-10 text-white">
      {/* two glowing arcs and a faint diagonal, after the reference */}
      <div className={ring + ' -right-[28vmin] -top-[38vmin] bg-[radial-gradient(circle_at_65%_45%,rgba(26,36,170,0.55),transparent_68%)]'} aria-hidden />
      <div className={ring + ' -bottom-[38vmin] -left-[28vmin] bg-[radial-gradient(circle_at_35%_55%,rgba(26,36,170,0.55),transparent_68%)]'} aria-hidden />
      <div className="pointer-events-none absolute left-[-10%] top-[22%] h-px w-[60%] origin-left rotate-[38deg] bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" aria-hidden />
      <div className="pointer-events-none absolute bottom-[22%] right-[-10%] h-px w-[60%] origin-right rotate-[38deg] bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" aria-hidden />

      <div className="relative z-10 w-full max-w-[400px]">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2.5" aria-label="Referral Tracker home">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-500 shadow-lg shadow-blue-600/30 ring-1 ring-inset ring-white/20"><HeartPulse className="h-5 w-5" /></span>
          <span className="font-heading text-lg font-bold tracking-tight">Referral Tracker</span>
        </Link>

        <form onSubmit={submit} aria-label="Sign in"
          className="relative overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-white/[0.07] via-[#0a1040]/60 to-white/[0.03] p-7 shadow-2xl shadow-black/60 backdrop-blur-xl sm:p-9">
          <div className="pointer-events-none absolute -inset-x-10 top-1/3 h-24 -rotate-[35deg] bg-gradient-to-r from-transparent via-blue-500/15 to-transparent blur-xl" aria-hidden />
          <div className="relative space-y-5">
            <div className="text-center">
              <h1 className="text-3xl font-bold tracking-tight">Sign in</h1>
              <p className="mt-2 text-sm text-white/65">Use the account issued to you by your administrator.</p>
            </div>

            {error && (
              <div role="alert" className="flex items-start gap-2.5 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> <span>{error}</span>
              </div>
            )}

            <div className="space-y-4">
              <label className="block">
                <span className="sr-only">Username</span>
                <input className={field} placeholder="Username" required autoComplete="username" autoFocus value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })} />
              </label>
              <label className="block">
                <span className="sr-only">Password</span>
                <input className={field} type="password" placeholder="Password" required autoComplete="current-password" value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </label>
            </div>

            <button type="submit" disabled={busy}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-slate-900 shadow-lg shadow-blue-900/30 transition duration-200 hover:-translate-y-0.5 hover:bg-blue-50 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-70">
              {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" aria-hidden /> : <LogIn className="h-4 w-4" />}
              {busy ? 'Signing in…' : 'Sign in'}
            </button>

            <p className="text-center text-xs leading-relaxed text-white/55">Forgot your password? Ask a centre administrator to reset your account.</p>
          </div>
        </form>

        <div className="mt-6 flex flex-col items-center gap-3 text-xs text-white/55 sm:flex-row sm:justify-between">
          <Link to="/" className="inline-flex items-center gap-1.5 transition-colors duration-200 hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> Back to home</Link>
          <p className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Authorised health centre staff only</p>
        </div>
      </div>
    </div>
  )
}
