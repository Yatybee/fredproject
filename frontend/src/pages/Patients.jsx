import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, UserPlus, Users } from 'lucide-react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { Alert, Button, Card, EmptyState, ErrorState, Input, Modal, PageHeader, Spinner, bareInput, useToast } from '../components/ui.jsx'
import { fmtDate, today, useDebounced, useLoad } from '../lib.js'

function PatientForm({ onClose, onDone }) {
  const toast = useToast()
  const [form, setForm] = useState({ full_name: '', date_of_birth: '', phone: '', address: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { id, patient_no } = await api.addPatient(form)
      toast(`${form.full_name.trim()} registered as ${patient_no}.`)
      onDone(id)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title="Register patient" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Alert>{error}</Alert>
        <Input label="Patient ID" disabled readOnly value="Assigned automatically when saved" />
        <Input label="Full name" required maxLength={100} value={form.full_name} onChange={set('full_name')} autoFocus />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Date of birth" type="date" required max={today()} value={form.date_of_birth} onChange={set('date_of_birth')} />
          <Input label="Phone" type="tel" required value={form.phone} onChange={set('phone')} hint="7-15 digits" />
        </div>
        <Input label="Address" maxLength={200} value={form.address} onChange={set('address')} hint="Optional." />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy} icon={UserPlus}>Register patient</Button>
        </div>
      </form>
    </Modal>
  )
}

export default function Patients() {
  const { can } = useAuth()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const q = useDebounced(search)
  const list = useLoad(() => api.patients(q.trim()), [q])

  return (
    <>
      <PageHeader title="Patients" subtitle="Register and look up patients. Referrals are created from the New referral page."
        actions={can('write_referral') && <Button icon={UserPlus} onClick={() => setAdding(true)}>Register patient</Button>} />

      <Card padded={false}>
        <div className="border-b border-slate-100 p-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input aria-label="Search patients" placeholder="Search by name, phone or patient ID…" value={search}
              onChange={(e) => setSearch(e.target.value)} className={`${bareInput} pl-9`} />
          </div>
        </div>
        {list.loading && !list.data ? <Spinner /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> :
          list.data.length === 0 ? (
            <EmptyState icon={Users} title={q ? 'No patients match your search' : 'No patients registered yet'}
              hint={q ? 'Check the spelling, or search by phone number or patient ID.' : 'Patients are registered here or while creating a referral.'}
              action={!q && can('write_referral') ? <Button icon={UserPlus} onClick={() => setAdding(true)}>Register patient</Button> : null} />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Patient ID</th>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="hidden px-4 py-3 font-medium sm:table-cell">Date of birth</th>
                    <th className="px-4 py-3 font-medium">Phone</th>
                    <th className="px-4 py-3 text-right font-medium">Referrals</th>
                    <th className="hidden px-4 py-3 font-medium md:table-cell">Last referral</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.data.map((p) => (
                    <tr key={p.id} onClick={() => navigate(`/patients/${p.id}`)} className="cursor-pointer hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-500">{p.patient_no}</td>
                      <td className="px-4 py-3 font-medium text-ink">{p.full_name}</td>
                      <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">{fmtDate(p.date_of_birth)}</td>
                      <td className="px-4 py-3 text-slate-600">{p.phone}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{p.referral_count}</td>
                      <td className="hidden px-4 py-3 text-slate-600 md:table-cell">{fmtDate(p.last_referral)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">{list.data.length} patient(s)</p>
            </div>
          )}
      </Card>

      {adding && <PatientForm onClose={() => setAdding(false)} onDone={(id) => { setAdding(false); navigate(`/patients/${id}`) }} />}
    </>
  )
}
