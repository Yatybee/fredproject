import { useState } from 'react'
import { HeartPulse, LogIn, ShieldCheck } from 'lucide-react'
import { useAuth } from '../auth.jsx'
import { Alert, Button, Input } from '../components/ui.jsx'

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
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-navy-900 p-12 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-blue-500/10" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-blue-400/10" />
        <div className="relative flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600"><HeartPulse className="h-6 w-6" /></div>
          <span className="text-lg font-semibold">Referral Tracker</span>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-4xl font-semibold leading-tight">Know that every referred patient got the care they were sent for.</h1>
          <p className="mt-4 text-navy-100/80">Track referrals to hospitals and specialist facilities, confirm attendance, schedule follow-up and be alerted when a referral is overdue.</p>
        </div>
        <p className="relative flex items-center gap-2 text-sm text-navy-100/70"><ShieldCheck className="h-4 w-4" /> Authorised health centre staff only</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5" aria-label="Sign in">
          <div className="lg:hidden flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 text-white"><HeartPulse className="h-6 w-6" /></div>
            <span className="text-lg font-semibold text-navy-900">Referral Tracker</span>
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-navy-900">Sign in</h2>
            <p className="mt-1 text-sm text-slate-500">Use the account issued to you by your administrator.</p>
          </div>
          <Alert>{error}</Alert>
          <Input label="Username" required autoComplete="username" autoFocus value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <Input label="Password" type="password" required autoComplete="current-password" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <Button type="submit" loading={busy} icon={LogIn} className="w-full">Sign in</Button>
          <p className="text-center text-xs text-slate-500">Forgot your password? Ask a centre administrator to reset your account.</p>
        </form>
      </div>
    </div>
  )
}
