import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { Alert, Async, Badge, Button, Card, Input, Modal, PageHeader, Select, useToast } from '../components/ui.jsx'
import { ROLES, useLoad } from '../lib.js'

function StaffForm({ onClose, onDone }) {
  const toast = useToast()
  const [form, setForm] = useState({ username: '', password: '', role: 'HEALTH_WORKER' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.addUser(form)
      toast(`Account ${form.username} created.`)
      onDone()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  return (
    <Modal title="Add staff account" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Alert>{error}</Alert>
        <Input label="Username" required value={form.username} onChange={set('username')} autoComplete="off" hint="3-32 letters, digits, _ . -" />
        <Input label="Temporary password" type="password" required minLength={8} value={form.password} onChange={set('password')} autoComplete="new-password" hint="At least 8 characters." />
        <Select label="Role" value={form.role} onChange={set('role')}>
          {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Create account</Button>
        </div>
      </form>
    </Modal>
  )
}

export default function Staff() {
  const { user } = useAuth()
  const toast = useToast()
  const state = useLoad(() => api.users())
  const [adding, setAdding] = useState(false)

  const toggle = async (u) => {
    try {
      await api.setUserActive(u.id, !u.active)
      toast(`${u.username} ${u.active ? 'deactivated' : 'reactivated'}.`)
      state.reload()
    } catch (err) { toast(err.message, 'error') }
  }

  return (
    <>
      <PageHeader title="Staff accounts" subtitle="Only administrators create accounts. There is no public sign-up."
        actions={<Button icon={UserPlus} onClick={() => setAdding(true)}>Add staff</Button>} />
      <Card padded={false}>
        <Async state={state}>
          {(list) => (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr><th className="px-5 py-3 font-medium">Username</th><th className="px-5 py-3 font-medium">Role</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3" /></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.map((u) => (
                    <tr key={u.id}>
                      <td className="px-5 py-3 font-medium text-navy-900">{u.username}{u.id === user.id && <span className="ml-2 text-xs text-slate-500">(you)</span>}</td>
                      <td className="px-5 py-3 text-slate-600">{ROLES[u.role]}</td>
                      <td className="px-5 py-3">{u.active ? <Badge className="bg-emerald-50 text-emerald-800 ring-emerald-600/20">Active</Badge> : <Badge className="bg-slate-100 text-slate-600 ring-slate-500/20">Deactivated</Badge>}</td>
                      <td className="px-5 py-3 text-right">{u.id !== user.id && <Button size="sm" variant="secondary" onClick={() => toggle(u)}>{u.active ? 'Deactivate' : 'Reactivate'}</Button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Async>
      </Card>
      {adding && <StaffForm onClose={() => setAdding(false)} onDone={() => { setAdding(false); state.reload() }} />}
    </>
  )
}
