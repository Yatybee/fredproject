import { Suspense, lazy, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle, ArrowRight, Bell, Building2, CalendarClock, CheckCircle2, ClipboardList, Clock,
  FilePlus2, Lightbulb, TrendingUp,
} from 'lucide-react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { Async, Button, Card, EmptyState, PageHeader, Spinner, StatCard, StatusBadge, UrgencyBadge } from '../components/ui.jsx'
import { buildInsights, buildTrend } from '../insights.js'
import { daysFromToday, fmtDate, useLoad } from '../lib.js'

// recharts is large; the charts load after the first paint
const charts = import('../components/DashboardCharts.jsx')
const TrendChart = lazy(() => charts.then((m) => ({ default: m.TrendChart })))
const StatusDonut = lazy(() => charts.then((m) => ({ default: m.StatusDonut })))
const FacilityBars = lazy(() => charts.then((m) => ({ default: m.FacilityBars })))

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const PERIODS = [7, 30, 90]

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
    <div className="flex gap-3 rounded-lg border border-slate-200/70 bg-white p-4 transition-shadow duration-200 hover:shadow-card-hover">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tone.box}`}><Icon className="h-[18px] w-[18px]" /></span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-navy-900">{insight.title}</p>
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
          className={`rounded-md px-2.5 py-1 transition-colors ${value === o ? 'bg-white text-navy-900 shadow-sm' : 'text-slate-500 hover:text-navy-900'}`}>
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
        const summary = stats.total === 0
          ? 'No referrals have been recorded yet. Create the first one to start tracking.'
          : `${plural(pending, 'referral')} pending, ${overdue.length} overdue and ${plural(followToday, 'follow-up')} due today or earlier.`

        return (
          <>
            <PageHeader title={`${greeting()}, ${user.username}`} subtitle={summary}
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Total referrals" value={stats.total} icon={ClipboardList} tone="navy" hint="All time" to="/referrals" />
                <StatCard label="Completed referrals" value={completed} icon={CheckCircle2} tone="green" to="/referrals?status=COMPLETED"
                  hint={stats.completion_rate != null ? `${stats.completion_rate}% completion rate` : 'None recorded yet'} progress={stats.completion_rate ?? 0} />
                <StatCard label="Pending referrals" value={pending} icon={Clock} tone="amber" to="/referrals?status=PENDING"
                  hint="Attendance not yet confirmed" progress={stats.total ? (100 * pending) / stats.total : 0} />
                <StatCard label="Requiring follow-up" value={stats.needing_followup} icon={CalendarClock} tone={stats.followups_overdue ? 'red' : 'blue'} to="/follow-ups"
                  hint={stats.followups_overdue ? `${stats.followups_overdue} follow-up(s) overdue` : `${stats.followups_pending} follow-up(s) scheduled`} />
              </div>

              <Card title="Insights and recommendations"
                action={<span className="text-xs text-slate-400">Calculated from current records</span>}>
                {insights.length === 0 ? (
                  <EmptyState icon={Lightbulb} title="Not enough data for insights yet" hint="Insights about outstanding referrals, follow-ups, facilities and trends appear once referrals are recorded." />
                ) : (
                  <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {insights.map((i) => <InsightTile key={i.id} insight={i} />)}
                  </div>
                )}
              </Card>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <Card title="Referral trend" className="xl:col-span-2"
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

                <Card title="Status distribution">
                  {stats.total === 0
                    ? <EmptyState icon={ClipboardList} title="No referrals yet" hint="The chart fills in as referrals are created." />
                    : <div className="pt-3"><Suspense fallback={<ChartFallback h="h-60" />}><StatusDonut byStatus={stats.by_status} total={stats.total} /></Suspense></div>}
                </Card>
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <Card title="Referrals by receiving facility" className="xl:col-span-2">
                  {stats.by_facility.length === 0
                    ? <EmptyState icon={Building2} title="No referrals yet" hint="Shows which facilities receive the most patients." />
                    : <div className="pt-3"><Suspense fallback={<ChartFallback h="h-44" />}><FacilityBars data={stats.by_facility.map(([name, count]) => ({ name, count }))} /></Suspense></div>}
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
                                <p className="truncate text-sm font-medium text-navy-900">{f.full_name}</p>
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
                            <td className="px-5 py-3 font-medium text-navy-900">{r.patient_name}</td>
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
                            <td className="px-3 py-3 font-medium text-navy-900">{r.patient_name}</td>
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
