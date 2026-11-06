import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, BellRing, CalendarClock, Check, CheckCheck, RefreshCw } from 'lucide-react'
import { api } from '../api.js'
import { Async, Badge, Button, Card, EmptyState, PageHeader, UrgencyBadge, useToast } from '../components/ui.jsx'
import { daysFromToday, fmtDate, useLoad } from '../lib.js'

const KIND = {
  OVERDUE_REFERRAL: { label: 'Attendance not confirmed', icon: AlertTriangle, tone: 'bg-red-50 text-red-700' },
  FOLLOWUP_DUE: { label: 'Follow-up due', icon: CalendarClock, tone: 'bg-amber-50 text-amber-700' },
}

function ReferralList({ list, empty, note }) {
  if (list.length === 0) return <EmptyState title={empty.title} hint={empty.hint} />
  return (
    <ul className="divide-y divide-slate-100">
      {list.map((r) => (
        <li key={r.id}>
          <Link to={`/referrals/${r.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">{r.patient_name}</p>
              <p className="truncate text-xs text-slate-500">{r.facility_name}</p>
              {note(r)}
            </div>
            <UrgencyBadge urgency={r.urgency} />
          </Link>
        </li>
      ))}
    </ul>
  )
}

function FollowupList({ list, empty }) {
  if (list.length === 0) return <EmptyState icon={CalendarClock} title={empty} />
  return (
    <ul className="divide-y divide-slate-100">
      {list.slice(0, 8).map((f) => {
        const d = daysFromToday(f.scheduled_for)
        return (
          <li key={f.id}>
            <Link to={`/referrals/${f.referral_id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{f.full_name}</p>
                <p className="truncate text-xs text-slate-500">{f.notes || f.facility_name}</p>
              </div>
              <span className={`whitespace-nowrap text-xs font-medium ${d < 0 ? 'text-red-600' : d === 0 ? 'text-amber-600' : 'text-slate-600'}`}>
                {d < 0 ? `${-d}d overdue` : d === 0 ? 'Today' : fmtDate(f.scheduled_for)}
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

export default function Notifications() {
  const toast = useToast()
  const [showRead, setShowRead] = useState(false)
  const [busy, setBusy] = useState(false)
  const alerts = useLoad(() => api.notifications(showRead), [showRead])
  const overdue = useLoad(() => api.outstanding())
  const pending = useLoad(() => api.referrals({ status: 'PENDING' }))
  const followups = useLoad(() => api.followups({ state: 'pending' }))

  const reloadAll = () => { alerts.reload(); overdue.reload(); pending.reload(); followups.reload() }

  const generate = async () => {
    setBusy(true)
    try {
      const { created } = await api.generateNotifications()
      toast(created ? `${created} new alert(s) generated.` : 'No new alerts. Everything is up to date.')
      reloadAll()
    } catch (err) { toast(err.message, 'error') }
    setBusy(false)
  }
  const markRead = async (id) => {
    try { await api.readNotification(id); alerts.reload() } catch (err) { toast(err.message, 'error') }
  }
  const markAll = async () => {
    try { await api.readAllNotifications(); toast('All alerts marked as read.'); alerts.reload() } catch (err) { toast(err.message, 'error') }
  }

  const count = (s) => <Badge className="bg-slate-100 text-slate-700 ring-slate-500/20">{s.data?.length ?? '…'}</Badge>

  return (
    <>
      <PageHeader title="Notifications" subtitle="Pending referrals, unconfirmed attendance and overdue follow-ups that need attention."
        actions={<Button icon={RefreshCw} loading={busy} onClick={generate}>Check for new alerts</Button>} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3 lg:self-start" padded={false} title="Your alerts"
          action={
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={showRead} onChange={(e) => setShowRead(e.target.checked)} className="rounded border-slate-300" /> Show read
              </label>
              <Button size="sm" variant="ghost" icon={CheckCheck} onClick={markAll}>Mark all read</Button>
            </div>
          }>
          <Async state={alerts}>
            {(list) => list.length === 0 ? (
              <EmptyState icon={BellRing} title="No alerts" hint="Select “Check for new alerts” to scan for referrals whose attendance is unconfirmed and for follow-ups that are due." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {list.map((n) => {
                  const k = KIND[n.kind] || KIND.FOLLOWUP_DUE
                  return (
                    <li key={n.id} className={`flex items-start gap-3 px-5 py-4 ${n.read ? 'opacity-60' : ''}`}>
                      <span className={`mt-0.5 rounded-lg p-2 ${k.tone}`}><k.icon className="h-4 w-4" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-slate-900">{k.label}</span>
                          <span className="text-xs text-slate-500">{fmtDate(n.created_on)}</span>
                        </div>
                        <p className="mt-0.5 text-sm text-slate-600">{n.message}</p>
                        <Link to={`/referrals/${n.referral_id}`} className="mt-1 inline-block text-sm font-medium text-blue-600 hover:underline">Open referral #{n.referral_id}</Link>
                      </div>
                      {!n.read && <Button size="sm" variant="ghost" icon={Check} onClick={() => markRead(n.id)} aria-label="Mark as read">Read</Button>}
                    </li>
                  )
                })}
              </ul>
            )}
          </Async>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card title="Attendance not confirmed" padded={false} action={count(overdue)}>
            <Async state={overdue}>
              {(list) => <ReferralList list={list} empty={{ title: 'Nothing outstanding', hint: 'No referral is past its expected date.' }}
                note={(r) => <p className="text-xs text-red-600">{r.status === 'NO_SHOW' ? 'No-show · ' : ''}{-daysFromToday(r.expected_by)} day(s) overdue</p>} />}
            </Async>
          </Card>

          <Card title="Overdue follow-ups" padded={false}
            action={count({ data: followups.data?.filter((f) => daysFromToday(f.scheduled_for) < 0) })}>
            <Async state={followups}>
              {(list) => <FollowupList list={list.filter((f) => daysFromToday(f.scheduled_for) < 0)} empty="No overdue follow-ups" />}
            </Async>
          </Card>

          <Card title="Pending referrals" padded={false}
            action={count({ data: pending.data?.filter((r) => daysFromToday(r.expected_by) >= 0) })}>
            <Async state={pending}>
              {(list) => <ReferralList list={list.filter((r) => daysFromToday(r.expected_by) >= 0)}
                empty={{ title: 'No pending referrals within their expected time', hint: 'Late ones appear under “Attendance not confirmed”.' }}
                note={(r) => <p className="text-xs text-slate-500">Expected by {fmtDate(r.expected_by)}</p>} />}
            </Async>
          </Card>

          <Card title="Upcoming follow-ups" padded={false}>
            <Async state={followups}>
              {(list) => <FollowupList list={list.filter((f) => daysFromToday(f.scheduled_for) >= 0)} empty="No upcoming follow-ups" />}
            </Async>
          </Card>
        </div>
      </div>
    </>
  )
}
