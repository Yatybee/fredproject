import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, CalendarPlus, Check } from 'lucide-react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import FollowupForm from '../components/FollowupForm.jsx'
import { Alert, Async, Badge, Button, Card, EmptyState, Modal, PageHeader, Select, useToast } from '../components/ui.jsx'
import { daysFromToday, fmtDate, useLoad } from '../lib.js'

const TABS = [
  ['upcoming', 'Upcoming'],
  ['overdue', 'Overdue'],
  ['done', 'Completed'],
]

function SchedulePicker({ onClose, onDone }) {
  const referrals = useLoad(() => api.referrals())
  const [referralId, setReferralId] = useState('')
  const open = (referrals.data || []).filter((r) => r.status !== 'CANCELLED')
  return (
    <Modal title="Schedule follow-up" onClose={onClose}>
      <div className="space-y-4">
        {referrals.error && <Alert>{referrals.error}</Alert>}
        <Select label="Referral" required value={referralId} onChange={(e) => setReferralId(e.target.value)}>
          <option value="">{referrals.loading ? 'Loading…' : 'Select a referral…'}</option>
          {open.map((r) => <option key={r.id} value={r.id}>#{r.id} · {r.patient_name} → {r.facility_name}</option>)}
        </Select>
        <FollowupForm referralId={referralId ? Number(referralId) : null} onCancel={onClose} onDone={onDone} />
      </div>
    </Modal>
  )
}

export default function FollowUps() {
  const { can } = useAuth()
  const toast = useToast()
  const [tab, setTab] = useState('upcoming')
  const [scheduling, setScheduling] = useState(false)
  const state = useLoad(() => api.followups({ state: tab === 'done' ? 'done' : 'pending' }), [tab])
  const canWrite = can('write_referral')

  const complete = async (id) => {
    try {
      await api.completeFollowup(id)
      toast('Follow-up marked done.')
      state.reload()
    } catch (err) { toast(err.message, 'error') }
  }

  return (
    <>
      <PageHeader title="Follow-ups" subtitle="Scheduled reviews of referred patients."
        actions={canWrite && <Button icon={CalendarPlus} onClick={() => setScheduling(true)}>Schedule follow-up</Button>} />

      <div role="tablist" className="mb-4 inline-flex gap-1 rounded-xl bg-slate-200/60 p-1">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium ${tab === k ? 'bg-white text-navy-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{label}</button>
        ))}
      </div>

      <Card padded={false}>
        <Async state={state}>
          {(all) => {
            const rows = all.filter((f) => tab === 'done' || (tab === 'overdue' ? daysFromToday(f.scheduled_for) < 0 : daysFromToday(f.scheduled_for) >= 0))
            if (rows.length === 0) {
              return <EmptyState icon={CalendarClock}
                title={tab === 'done' ? 'No completed follow-ups yet' : tab === 'overdue' ? 'No overdue follow-ups' : 'No upcoming follow-ups'}
                hint={tab === 'upcoming' ? 'Schedule a follow-up to see it here.' : undefined} />
            }
            return (
              <ul className="divide-y divide-slate-100">
                {rows.map((f) => {
                  const d = daysFromToday(f.scheduled_for)
                  return (
                    <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                      <div className="min-w-0">
                        <Link to={`/referrals/${f.referral_id}`} className="font-medium text-navy-900 hover:text-blue-600">{f.full_name}</Link>
                        <p className="text-sm text-slate-500">{f.facility_name} · Referral #{f.referral_id}</p>
                        {f.notes && <p className="mt-1 text-sm text-slate-600">{f.notes}</p>}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-sm font-medium text-slate-900">{fmtDate(f.scheduled_for)}</p>
                          {!f.done && <p className={`text-xs ${d < 0 ? 'text-red-600' : d === 0 ? 'text-amber-600' : 'text-slate-500'}`}>{d < 0 ? `${-d} day(s) overdue` : d === 0 ? 'Today' : `in ${d} day(s)`}</p>}
                        </div>
                        {f.done ? <Badge className="bg-emerald-50 text-emerald-800 ring-emerald-600/20">Done</Badge>
                          : canWrite && <Button size="sm" variant="secondary" icon={Check} onClick={() => complete(f.id)}>Mark done</Button>}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )
          }}
        </Async>
      </Card>

      {scheduling && <SchedulePicker onClose={() => setScheduling(false)} onDone={() => { setScheduling(false); state.reload() }} />}
    </>
  )
}
