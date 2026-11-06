import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Ban, CalendarPlus, CheckCheck, CheckCircle2, UserCheck, UserX } from 'lucide-react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import FollowupForm from '../components/FollowupForm.jsx'
import { Alert, Async, Badge, Button, Card, EmptyState, Input, Modal, StatusBadge, Textarea, UrgencyBadge, useToast } from '../components/ui.jsx'
import { daysFromToday, fmtDate, fmtDateTime, STATUS, today, useLoad } from '../lib.js'

const ACTIONS = {
  ATTENDED:  { label: 'Confirm attendance', icon: UserCheck, variant: 'primary' },
  COMPLETED: { label: 'Mark completed', icon: CheckCheck, variant: 'primary' },
  NO_SHOW:   { label: 'Mark no-show', icon: UserX, variant: 'secondary' },
  CANCELLED: { label: 'Cancel referral', icon: Ban, variant: 'danger' },
}

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-2.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="col-span-2 break-words text-slate-900">{children || '—'}</dd>
    </div>
  )
}

function StatusDialog({ referral, status, onClose, onDone }) {
  const toast = useToast()
  const [outcome, setOutcome] = useState('')
  const [date, setDate] = useState(today())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const needsText = status === 'COMPLETED' || status === 'CANCELLED'
  const { label } = ACTIONS[status]

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.setStatus(referral.id, {
        status,
        ...(status === 'ATTENDED' ? { attended_on: date } : {}),
        ...(needsText ? { outcome } : {}),
      })
      toast(`Referral #${referral.id}: ${STATUS[status].label.toLowerCase()}.`)
      onDone()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title={label} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Alert>{error}</Alert>
        {status === 'ATTENDED' && (
          <Input label="Date patient attended" type="date" required min={referral.referral_date} max={today()} value={date}
            onChange={(e) => setDate(e.target.value)} hint="Confirms the patient reached the receiving facility." />
        )}
        {status === 'COMPLETED' && (
          <Textarea label="Outcome" required maxLength={500} value={outcome} onChange={(e) => setOutcome(e.target.value)}
            placeholder="e.g. Treated and discharged; review in 2 weeks" />
        )}
        {status === 'CANCELLED' && (
          <Textarea label="Reason for cancelling" required maxLength={500} value={outcome} onChange={(e) => setOutcome(e.target.value)} />
        )}
        {status === 'NO_SHOW' && <p className="text-sm text-slate-600">Record that {referral.patient_name} did not attend by the expected date. You can still confirm attendance later if they turn up.</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Back</Button>
          <Button type="submit" loading={busy} variant={ACTIONS[status].variant === 'danger' ? 'danger' : 'primary'}>{label}</Button>
        </div>
      </form>
    </Modal>
  )
}

export default function ReferralDetail() {
  const { id } = useParams()
  const { can } = useAuth()
  const toast = useToast()
  const state = useLoad(() => api.referral(id), [id])
  const [dialog, setDialog] = useState(null)
  const [scheduling, setScheduling] = useState(false)
  const canWrite = can('write_referral')

  const finishFollowup = async (fid) => {
    try {
      await api.completeFollowup(fid)
      toast('Follow-up marked done.')
      state.reload()
    } catch (err) { toast(err.message, 'error') }
  }

  return (
    <>
      <Link to="/referrals" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"><ArrowLeft className="h-4 w-4" /> Referrals</Link>
      <Async state={state}>
        {(r) => {
          const overdue = ['PENDING', 'NO_SHOW'].includes(r.status) && daysFromToday(r.expected_by) < 0
          return (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-semibold text-navy-900">Referral #{r.id}</h1>
                    <StatusBadge status={r.status} /> <UrgencyBadge urgency={r.urgency} />
                    {overdue && <Badge className="bg-red-600 text-white ring-red-700">Overdue</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{r.patient_name} → {r.facility_name}</p>
                </div>
                {canWrite && (
                  <div className="flex flex-wrap gap-2">
                    {r.allowed_transitions.map((s) => {
                      const a = ACTIONS[s]
                      return <Button key={s} variant={a.variant} icon={a.icon} onClick={() => setDialog(s)}>{a.label}</Button>
                    })}
                  </div>
                )}
              </div>

              {overdue && <Alert>This referral was expected by {fmtDate(r.expected_by)} and attendance has not been confirmed. Contact the patient or the facility.</Alert>}

              <div className="grid gap-6 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-2">
                  <Card title="Referral details">
                    <dl className="divide-y divide-slate-100">
                      <Row label="Reason">{r.reason}</Row>
                      <Row label="Notes">{r.notes}</Row>
                      <Row label="Referring facility">{r.referring_facility}</Row>
                      <Row label="Receiving facility">{r.facility_name}</Row>
                      <Row label="Responsible worker">{r.referred_by_name}</Row>
                      <Row label="Referral date">{fmtDate(r.referral_date)}</Row>
                      <Row label="Expected by">{fmtDate(r.expected_by)}</Row>
                      <Row label="Attended on">{r.attended_on ? fmtDate(r.attended_on) : null}</Row>
                      <Row label="Outcome / notes">{r.outcome}</Row>
                    </dl>
                  </Card>

                  <Card title="Follow-ups" padded={false}
                    action={canWrite && r.status !== 'CANCELLED' && <Button size="sm" variant="secondary" icon={CalendarPlus} onClick={() => setScheduling(true)}>Schedule</Button>}>
                    {r.followups.length === 0 ? <EmptyState icon={CalendarPlus} title="No follow-ups scheduled" hint="Schedule one to make sure the patient is reviewed after the referral." /> : (
                      <ul className="divide-y divide-slate-100">
                        {r.followups.map((f) => {
                          const late = !f.done && daysFromToday(f.scheduled_for) < 0
                          return (
                            <li key={f.id} className="flex items-center justify-between gap-3 px-5 py-3">
                              <div>
                                <p className="text-sm font-medium text-slate-900">{fmtDate(f.scheduled_for)}</p>
                                <p className="text-xs text-slate-500">{f.notes || 'No notes'}</p>
                              </div>
                              {f.done ? <Badge className="bg-emerald-50 text-emerald-800 ring-emerald-600/20"><CheckCircle2 className="mr-1 h-3 w-3" />Done</Badge> : (
                                <div className="flex items-center gap-2">
                                  {late && <Badge className="bg-red-50 text-red-800 ring-red-600/20">Overdue</Badge>}
                                  {canWrite && <Button size="sm" variant="secondary" onClick={() => finishFollowup(f.id)}>Mark done</Button>}
                                </div>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </Card>
                </div>

                <div className="space-y-6">
                  <Card title="Patient">
                    <dl className="divide-y divide-slate-100">
                      <Row label="Patient ID"><Link className="font-mono text-xs text-blue-600 hover:underline" to={`/patients/${r.patient_id}`}>{r.patient_no}</Link></Row>
                      <Row label="Name">{r.patient_name}</Row>
                      <Row label="Date of birth">{r.patient_dob ? fmtDate(r.patient_dob) : null}</Row>
                      <Row label="Phone"><a className="text-blue-600 hover:underline" href={`tel:${r.patient_phone}`}>{r.patient_phone}</a></Row>
                      <Row label="Address">{r.patient_address}</Row>
                    </dl>
                  </Card>
                  <Card title="Status history">
                    <ol className="relative space-y-5 border-l border-slate-200 pl-5">
                      {r.history.map((h) => (
                        <li key={h.id} className="relative">
                          <span className="absolute -left-[26px] top-1 h-3 w-3 rounded-full ring-4 ring-white" style={{ background: STATUS[h.to_status]?.color }} />
                          <p className="text-sm font-medium text-slate-900">{STATUS[h.to_status]?.label || h.to_status}</p>
                          <p className="text-xs text-slate-500">{fmtDateTime(h.at)} · {h.changed_by_name}</p>
                          {h.note && <p className="mt-1 text-sm text-slate-600">{h.note}</p>}
                        </li>
                      ))}
                    </ol>
                  </Card>
                </div>
              </div>

              {dialog && <StatusDialog referral={r} status={dialog} onClose={() => setDialog(null)} onDone={() => { setDialog(null); state.reload() }} />}
              {scheduling && (
                <Modal title="Schedule follow-up" onClose={() => setScheduling(false)}>
                  <FollowupForm referralId={r.id} onCancel={() => setScheduling(false)} onDone={() => { setScheduling(false); state.reload() }} />
                </Modal>
              )}
            </div>
          )
        }}
      </Async>
    </>
  )
}
