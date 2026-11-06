import { Suspense, lazy, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Activity, AlertTriangle, ArrowRight, Bell, Building2, CalendarClock, CheckCircle2, ClipboardList, Clock,
  FilePlus2, Lightbulb, Siren, TrendingUp,
} from 'lucide-react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { Async, Button, Card, DeltaPill, EmptyState, PageHeader, Spinner, StatCard, StatusBadge, UrgencyBadge } from '../components/ui.jsx'
import { buildInsights, buildTrend } from '../insights.js'
import { daysFromToday, fmtDate, useLoad } from '../lib.js'

// recharts is large; the charts load after the first paint
const charts = import('../components/DashboardCharts.jsx')
const TrendChart = lazy(() => charts.then((m) => ({ default: m.TrendChart })))
const ActivityBars = lazy(() => charts.then((m) => ({ default: m.ActivityBars })))
const StatusRadial = lazy(() => charts.then((m) => ({ default: m.StatusRadial })))
const FacilityBubbles = lazy(() => charts.then((m) => ({ default: m.FacilityBubbles })))

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const PERIODS = [7, 30, 90]

const longDate = () => new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

const URGENCY_ROWS = [
  { key: 'ROUTINE', label: 'Routine', icon: Activity },
  { key: 'URGENT', label: 'Urgent', icon: AlertTriangle },
  { key: 'EMERGENCY', label: 'Emergency', icon: Siren },
]
const URGENCY_TONE = { ROUTINE: 'neutral', URGENT: 'neutral', EMERGENCY: 'down' }

/** Referred vs completed per month, for the months the API reports (stats.by_month). */
function buildMonthly(stats, referrals) {
  return (stats.by_month || []).map(([ym, count]) => ({
    label: new Date(`${ym}-01T00:00:00`).toLocaleDateString(undefined, { month: 'short' }),
    referred: count,
    completed: referrals.filter((r) => r.referral_date.startsWith(ym) && r.status === 'COMPLETED').length,
  }))
}

const TONE = {
  red: { box: 'bg-red-50 text-red-600', icon: AlertTriangle },
  amber: { box: 'bg-amber-50 text-amber-600', icon: CalendarClock },
  green: { box: 'bg-teal-50 text-teal-600', icon: CheckCircle2 },
  blue: { box: 'bg-blue-50 text-blue-600', icon: Building2 },
  navy: { box: 'bg-navy-50 text-navy-700', icon: TrendingUp },
}
const INSIGHT_ICON = { completion: CheckCircle2, facility: Building2, trend: TrendingUp, followups: CalendarClock, outstanding: AlertTriangle }

function InsightTile({ insight }) {
  const tone = TONE[insight.tone] || TONE.navy
  const Icon = INSIGHT_ICON[insight.id] || tone.icon
  return (
    <div className="flex gap-3 rounded-xl border border-slate-200/70 bg-surface p-4 transition-shadow duration-200 hover:shadow-card-hover">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tone.box}`}><Icon className="h-[18px] w-[18px]" /></span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{insight.title}</p>
        <p className="mt-0.5 text-[13px] leading-snug text-slate-500">{insight.detail}</p>
        {insight.action && (
          <Link to={insight.action.to} className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-blue-600 hover:text-blue-700 hover:underline">
            {insight.action.label} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </div>
  )
}

function ChartFallback({ h = 'h-64' }) {
  return <div className={`${h} grid place-items-center`}><Spinner label="Loading chart…" /></div>
}

function Segmented({ value, onChange, options, label }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onChange(o)} aria-pressed={value === o}
          className={`rounded-md px-2.5 py-1 transition-colors ${value === o ? 'bg-surface text-ink shadow-sm' : 'text-slate-500 hover:text-ink'}`}>
          {o} days
        </button>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const { user, can } = useAuth()
  const navigate = useNavigate()
  const [days, setDays] = useState(30)
  const state = useLoad(async () => {
    const [stats, overdue, followups, referrals] = await Promise.all([
      api.stats(), api.outstanding(), api.followups({ state: 'pending' }), api.referrals(),
    ])
    return { stats, overdue, followups, referrals }
  })

  const d = state.data
  const trend = useMemo(() => (d ? buildTrend(d.referrals, days) : null), [d, days])
  const insights = useMemo(() => (d ? buildInsights({ ...d, trendDays: days }) : []), [d, days])

  return (
    <Async state={state}>
      {({ stats, overdue, followups, referrals }) => {
        const pending = stats.by_status.PENDING || 0
        const completed = stats.by_status.COMPLETED || 0
        const followToday = followups.filter((f) => daysFromToday(f.scheduled_for) <= 0).length
        const nextFollow = {}
        followups.forEach((f) => {
          if (!nextFollow[f.referral_id] || f.scheduled_for < nextFollow[f.referral_id]) nextFollow[f.referral_id] = f.scheduled_for
        })
        const recent = referrals.slice(0, 6)
        const monthly = buildMonthly(stats, referrals)
        let trendDelta = null
        if (trend.previous > 0) {
          const pct = Math.round((100 * (trend.current - trend.previous)) / trend.previous)
          trendDelta = { text: `${pct > 0 ? '+' : ''}${pct}%`, tone: pct >= 0 ? 'up' : 'down' }
        }
        const summary = stats.total === 0
          ? 'No referrals have been recorded yet. Create the first one to start tracking.'
          : `${plural(pending, 'referral')} pending, ${overdue.length} overdue and ${plural(followToday, 'follow-up')} due today or earlier.`

        return (
          <>
            <PageHeader title={`${greeting()}, ${user.username}`} subtitle={`${longDate()} · ${summary}`}
              actions={(
                <>
                  {overdue.length > 0 && (
                    <Link to={can('notify') ? '/notifications' : '/referrals'}
                      className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100">
                      <Bell className="h-4 w-4" /> {overdue.length} outstanding
                    </Link>
                  )}
                  {can('write_referral') && <Link to="/referrals/new"><Button icon={FilePlus2}>New referral</Button></Link>}
                </>
              )} />

            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
                {/* left: KPI tiles and monthly activity */}
                <div className="min-w-0 space-y-6">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <StatCard variant="primary" label="Total referrals" value={stats.total} icon={ClipboardList} to="/referrals"
                      hint={`${trend.current} in the last ${days} days`} delta={trendDelta} />
                    <StatCard label="Completed referrals" value={completed} icon={CheckCircle2} tone="green" to="/referrals?status=COMPLETED"
                      hint={stats.total ? `of ${stats.total} referrals` : 'None recorded yet'}
                      delta={stats.completion_rate != null ? { text: `${stats.completion_rate}%`, tone: 'up' } : null} />
                    <StatCard label="Pending referrals" value={pending} icon={Clock} tone="amber" to="/referrals?status=PENDING"
                      hint="Attendance not yet confirmed"
                      delta={overdue.length ? { text: `${overdue.length} overdue`, tone: 'down' } : { text: 'On track', tone: 'up' }} />
                    <StatCard label="Requiring follow-up" value={stats.needing_followup} icon={CalendarClock} tone={stats.followups_overdue ? 'red' : 'blue'} to="/follow-ups"
                      hint={`${stats.followups_pending} scheduled`}
                      delta={stats.followups_overdue ? { text: `${stats.followups_overdue} overdue`, tone: 'down' } : { text: 'On time', tone: 'up' }} />
                  </div>

                  <Card title="Referral activity" subtitle="Referrals received and completed each month">
                    {monthly.length === 0
                      ? <EmptyState icon={TrendingUp} title="No referrals yet" hint="Monthly activity appears once referrals are recorded." />
                      : <div className="pt-3"><Suspense fallback={<ChartFallback />}><ActivityBars data={monthly} /></Suspense></div>}
                  </Card>
                </div>

                {/* right: status rings and facility cluster */}
                <div className="min-w-0 space-y-6">
                  <Card title="Referral statistics" subtitle="Share of referrals by status">
                    {stats.total === 0
                      ? <EmptyState icon={ClipboardList} title="No referrals yet" hint="The chart fills in as referrals are created." />
                      : (
                        <>
                          <div className="pt-3"><Suspense fallback={<ChartFallback h="h-56" />}>
                            <StatusRadial byStatus={stats.by_status} total={stats.total} completionRate={stats.completion_rate} />
                          </Suspense></div>
                          <ul className="mt-4 space-y-2.5 border-t border-slate-100 pt-4">
                            {URGENCY_ROWS.map(({ key, label, icon: Icon }) => {
                              const n = stats.by_urgency[key] || 0
                              return (
                                <li key={key} className="flex items-center gap-3 text-sm">
                                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-50 text-slate-600 ring-1 ring-slate-200/70"><Icon className="h-4 w-4" /></span>
                                  <span className="flex-1 font-medium text-ink">{label}</span>
                                  <span className="font-semibold text-ink">{n}</span>
                                  <DeltaPill tone={URGENCY_TONE[key]} className="w-14 justify-center">{Math.round((100 * n) / stats.total)}%</DeltaPill>
                                </li>
                              )
                            })}
                          </ul>
                        </>
                      )}
                  </Card>

                  <Card title="Referrals by facility" subtitle="Where patients are being sent">
                    {stats.by_facility.length === 0
                      ? <EmptyState icon={Building2} title="No referrals yet" hint="Shows which facilities receive the most patients." />
                      : <div className="pt-3"><Suspense fallback={<ChartFallback h="h-44" />}><FacilityBubbles data={stats.by_facility.map(([name, count]) => ({ name, count }))} /></Suspense></div>}
                  </Card>
                </div>
              </div>

              <Card title="Insights and recommendations" subtitle="Calculated from current records">
                {insights.length === 0 ? (
                  <EmptyState icon={Lightbulb} title="Not enough data for insights yet" hint="Insights about outstanding referrals, follow-ups, facilities and trends appear once referrals are recorded." />
                ) : (
                  <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {insights.map((i) => <InsightTile key={i.id} insight={i} />)}
                  </div>
                )}
              </Card>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <Card title="Referral trend" subtitle="New referrals over time" className="xl:col-span-2"
                  action={<Segmented label="Trend period" value={days} onChange={setDays} options={PERIODS} />}>
                  {trend.current === 0 && trend.previous === 0 ? (
                    <EmptyState icon={TrendingUp} title={`No referrals in the last ${days} days`} hint="Choose a longer period, or create a referral." />
                  ) : (
                    <>
                      <p className="mb-2 mt-1 text-xs text-slate-500">
                        {trend.current} referral(s) in the last {days} days{trend.step > 1 ? ', grouped by week' : ''}
                      </p>
                      <Suspense fallback={<ChartFallback />}><TrendChart data={trend.series} step={trend.step} /></Suspense>
                    </>
                  )}
                </Card>

                <Card title="Upcoming follow-ups" padded={false}
                  action={<Link to="/follow-ups" className="text-xs font-medium text-blue-600 hover:underline">View all</Link>}>
                  {followups.length === 0 ? <EmptyState icon={CalendarClock} title="No follow-ups scheduled" hint="Schedule follow-ups from a referral's detail page." /> : (
                    <ul className="px-2 pb-2 pt-1">
                      {followups.slice(0, 5).map((f) => {
                        const n = daysFromToday(f.scheduled_for)
                        return (
                          <li key={f.id}>
                            <Link to={`/referrals/${f.referral_id}`} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-slate-50">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-ink">{f.full_name}</p>
                                <p className="truncate text-xs text-slate-400">{f.notes || f.facility_name}</p>
                              </div>
                              <span className={`whitespace-nowrap text-xs font-semibold ${n < 0 ? 'text-red-600' : n === 0 ? 'text-amber-600' : 'text-slate-600'}`}>
                                {n < 0 ? `${-n}d overdue` : n === 0 ? 'Today' : fmtDate(f.scheduled_for)}
                              </span>
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </Card>
              </div>

              <Card title="Recent referrals" padded={false}
                action={<Link to="/referrals" className="text-xs font-medium text-blue-600 hover:underline">View all</Link>}>
                {recent.length === 0 ? <EmptyState title="No referrals yet" hint="Create the first referral to start tracking." /> : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                          <th className="px-5 py-3 font-medium">Patient</th>
                          <th className="hidden px-3 py-3 font-medium sm:table-cell">Referral ID</th>
                          <th className="hidden px-3 py-3 font-medium md:table-cell">Receiving facility</th>
                          <th className="hidden px-3 py-3 font-medium sm:table-cell">Referral date</th>
                          <th className="px-3 py-3 font-medium">Status</th>
                          <th className="hidden px-3 py-3 font-medium lg:table-cell">Follow-up</th>
                          <th className="px-5 py-3 text-right font-medium"><span className="sr-only">Action</span></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {recent.map((r) => (
                          <tr key={r.id} className="transition-colors hover:bg-slate-50/70">
                            <td className="px-5 py-3 font-medium text-ink">{r.patient_name}</td>
                            <td className="hidden px-3 py-3 text-slate-500 sm:table-cell">#{r.id}</td>
                            <td className="hidden px-3 py-3 text-slate-600 md:table-cell">{r.facility_name}</td>
                            <td className="hidden whitespace-nowrap px-3 py-3 text-slate-600 sm:table-cell">{fmtDate(r.referral_date)}</td>
                            <td className="px-3 py-3"><StatusBadge status={r.status} /></td>
                            <td className="hidden whitespace-nowrap px-3 py-3 text-slate-600 lg:table-cell">{nextFollow[r.id] ? fmtDate(nextFollow[r.id]) : '—'}</td>
                            <td className="px-5 py-3 text-right">
                              <Link to={`/referrals/${r.id}`} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50">
                                View<span className="sr-only"> referral {r.id}</span> <ArrowRight className="h-3.5 w-3.5" />
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              {overdue.length > 0 && (
                <Card title="Overdue referrals" padded={false}
                  action={<Link to={can('notify') ? '/notifications' : '/referrals'} className="text-xs font-medium text-blue-600 hover:underline">View all</Link>}>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                          <th className="px-5 py-3 font-medium">Expected by</th>
                          <th className="px-3 py-3 font-medium">Referral</th>
                          <th className="px-3 py-3 font-medium">Patient</th>
                          <th className="hidden px-3 py-3 font-medium md:table-cell">Facility</th>
                          <th className="px-3 py-3 font-medium">Urgency</th>
                          <th className="px-5 py-3 text-right font-medium">Overdue by</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {overdue.slice(0, 6).map((r) => (
                          <tr key={r.id} onClick={() => navigate(`/referrals/${r.id}`)} className="cursor-pointer transition-colors hover:bg-slate-50/70">
                            <td className="whitespace-nowrap px-5 py-3 text-slate-600">{fmtDate(r.expected_by)}</td>
                            <td className="px-3 py-3 text-slate-500">#{r.id}</td>
                            <td className="px-3 py-3 font-medium text-ink">{r.patient_name}</td>
                            <td className="hidden px-3 py-3 text-slate-600 md:table-cell">{r.facility_name}</td>
                            <td className="px-3 py-3"><UrgencyBadge urgency={r.urgency} /></td>
                            <td className="whitespace-nowrap px-5 py-3 text-right font-semibold text-red-600">{-daysFromToday(r.expected_by)} day(s)</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </div>
          </>
        )
      }}
    </Async>
  )
}
