import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Search, Send, UserPlus, Users } from 'lucide-react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import FacilityForm from '../components/FacilityForm.jsx'
import { Alert, Button, Card, Input, PageHeader, Select, Spinner, Textarea, useToast } from '../components/ui.jsx'
import { URGENCY, today, useDebounced, useLoad } from '../lib.js'

const blankPatient = { full_name: '', date_of_birth: '', phone: '', address: '' }

export default function NewReferral() {
  const navigate = useNavigate()
  const toast = useToast()
  const { user, can } = useAuth()
  const [params] = useSearchParams()

  // everything the form needs comes from the database
  const setup = useLoad(async () => {
    const [facilities, staff, config] = await Promise.all([api.facilities(), api.staff(), api.config()])
    return { staff, config, initialFacilities: facilities }
  })
  const [facilities, setFacilities] = useState(null)
  useEffect(() => { if (setup.data) setFacilities(setup.data.initialFacilities) }, [setup.data])

  const [mode, setMode] = useState('new') // 'new' | 'existing'
  const [patient, setPatient] = useState(blankPatient)
  const [search, setSearch] = useState('')
  const [matches, setMatches] = useState([])
  const [chosen, setChosen] = useState(null)
  const [ref, setRef] = useState({
    referral_date: today(), referring_facility: '', facility_id: '', urgency: 'ROUTINE',
    expected_by: '', reason: '', notes: '', responsible_id: String(user.id),
  })
  const [addingFacility, setAddingFacility] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // default referring facility = this health centre
  useEffect(() => {
    if (setup.data) setRef((r) => (r.referring_facility ? r : { ...r, referring_facility: setup.data.config.centre_name }))
  }, [setup.data])

  // arriving from a patient's page: ?patient=ID pre-selects them
  const presetId = params.get('patient')
  useEffect(() => {
    if (!presetId) return
    api.patient(presetId).then((p) => { setMode('existing'); setChosen(p) }).catch(() => {})
  }, [presetId])

  const q = useDebounced(search)
  useEffect(() => {
    if (mode !== 'existing' || q.trim().length < 2) { setMatches([]); return }
    api.patients(q.trim()).then(setMatches).catch(() => setMatches([]))
  }, [q, mode])

  const setR = (k) => (e) => setRef({ ...ref, [k]: e.target.value })
  const setP = (k) => (e) => setPatient({ ...patient, [k]: e.target.value })

  const facilityAdded = async (id) => {
    setAddingFacility(false)
    setFacilities(await api.facilities())
    setRef((r) => ({ ...r, facility_id: String(id) })) // select it; everything else stays as typed
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (mode === 'existing' && !chosen) return setError('Search for and select an existing patient, or switch to “New patient”.')
    setBusy(true)
    try {
      const body = {
        facility_id: Number(ref.facility_id),
        reason: ref.reason,
        urgency: ref.urgency,
        referral_date: ref.referral_date || null,
        expected_by: ref.expected_by || null,
        referring_facility: ref.referring_facility,
        notes: ref.notes,
        responsible_id: ref.responsible_id ? Number(ref.responsible_id) : null,
        ...(mode === 'new' ? { patient } : { patient_id: chosen.id }),
      }
      const { id } = await api.createReferral(body)
      toast(`Referral #${id} created and marked Pending.`)
      navigate(`/referrals/${id}`)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const tab = (key, label, Icon) => (
    <button type="button" onClick={() => { setMode(key); setError('') }} aria-pressed={mode === key}
      className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${mode === key ? 'bg-surface text-ink shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
      <Icon className="h-4 w-4" /> {label}
    </button>
  )

  return (
    <>
      <PageHeader title="New referral" subtitle="Record who is being referred, why, and where they are going." />
      {setup.loading && !setup.data && <Spinner />}
      {setup.error && <Alert>{setup.error}</Alert>}

      {setup.data && facilities && (
        <form onSubmit={submit} className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card title="1. Patient information">
            <div className="mb-4 flex gap-1 rounded-xl bg-shell p-1">
              {tab('new', 'New patient', UserPlus)}
              {tab('existing', 'Existing patient', Users)}
            </div>
            {mode === 'new' ? (
              <div className="space-y-4">
                <Input label="Patient ID" disabled value="Assigned automatically when saved" hint="Unique ID in the form PT-00001." readOnly />
                <Input label="Full name" required value={patient.full_name} maxLength={100} onChange={setP('full_name')} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input label="Date of birth" type="date" required max={today()} value={patient.date_of_birth} onChange={setP('date_of_birth')} />
                  <Input label="Phone" type="tel" required placeholder="0700 111 222" value={patient.phone} onChange={setP('phone')} hint="7-15 digits" />
                </div>
                <Input label="Address" maxLength={200} value={patient.address} onChange={setP('address')} hint="Optional. Helps trace the patient if they do not attend." />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input aria-label="Search patients" placeholder="Search by name, phone or patient ID…" value={search}
                    onChange={(e) => { setSearch(e.target.value); setChosen(null) }}
                    className="block w-full rounded-lg border-0 py-2 pl-9 pr-3 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-blue-600" />
                </div>
                {chosen ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm">
                    <span className="min-w-0"><strong>{chosen.full_name}</strong> · {chosen.patient_no} · {chosen.phone}{chosen.address ? ` · ${chosen.address}` : ''}</span>
                    <button type="button" className="shrink-0 text-blue-700 hover:underline" onClick={() => setChosen(null)}>Change</button>
                  </div>
                ) : q.trim().length < 2 ? (
                  <p className="text-sm text-slate-500">Type at least 2 characters.</p>
                ) : matches.length === 0 ? (
                  <p className="text-sm text-slate-500">No matching patients. Choose “New patient” to register them.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {matches.map((p) => (
                      <li key={p.id}>
                        <button type="button" onClick={() => setChosen(p)} className="flex w-full flex-wrap justify-between gap-x-3 px-3 py-2.5 text-left text-sm hover:bg-slate-50">
                          <span className="font-medium text-slate-900">{p.full_name} <span className="font-normal text-slate-500">{p.patient_no}</span></span>
                          <span className="text-slate-500">{p.phone} · born {p.date_of_birth}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Card>

          <Card title="2. Referral details">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Referral date" type="date" required max={today()} value={ref.referral_date} onChange={setR('referral_date')} />
                <Select label="Urgency" value={ref.urgency} onChange={setR('urgency')}>
                  {Object.entries(URGENCY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </Select>
              </div>
              <Input label="Referring facility" required maxLength={200} value={ref.referring_facility} onChange={setR('referring_facility')} hint="The facility sending the patient (this health centre by default)." />
              <Select label="Receiving facility" required value={ref.facility_id} onChange={setR('facility_id')}
                hint={
                  <span>
                    {facilities.length === 0 ? 'No facilities are registered yet. ' : 'Not in the list? '}
                    {can('add_facility')
                      ? <button type="button" onClick={() => setAddingFacility(true)} className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline"><Plus className="h-3 w-3" />Add a new facility</button>
                      : 'Ask an administrator to add it.'}
                    {' '}Your entries on this form are kept.
                  </span>
                }>
                <option value="">Select a facility…</option>
                {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}{f.location ? ` — ${f.location}` : ''}</option>)}
              </Select>
              <Textarea label="Reason for referral" required maxLength={500} value={ref.reason} onChange={setR('reason')}
                placeholder="Clinical reason, e.g. suspected fracture needing X-ray" />
              <Textarea label="Notes / additional information" maxLength={1000} value={ref.notes} onChange={setR('notes')}
                placeholder="Optional: history, medication, transport arrangements…" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Select label="Responsible health worker" value={ref.responsible_id} onChange={setR('responsible_id')}>
                  {setup.data.staff.map((s) => <option key={s.id} value={s.id}>{s.username}{s.id === user.id ? ' (you)' : ''}</option>)}
                </Select>
                <Input label="Expected by" type="date" min={ref.referral_date || today()} value={ref.expected_by} onChange={setR('expected_by')}
                  hint="Optional. Defaults to 1 / 3 / 14 days for emergency / urgent / routine." />
              </div>
              <p className="text-xs text-slate-500">The referral is saved with the status <strong>Pending</strong> until attendance is confirmed. The responsible health worker receives the reminders.</p>
            </div>
          </Card>

          <div className="space-y-3 lg:col-span-2">
            <Alert>{error}</Alert>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => navigate('/referrals')}>Cancel</Button>
              <Button type="submit" loading={busy} icon={Send}>Create referral</Button>
            </div>
          </div>
        </form>
      )}

      {/* rendered outside the <form> (forms cannot nest) but inside this page's state, so nothing is lost */}
      {addingFacility && <FacilityForm onClose={() => setAddingFacility(false)} onDone={facilityAdded} />}
    </>
  )
}
