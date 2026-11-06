import { Printer } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api.js'
import { Async, Button, Card, EmptyState, PageHeader, StatCard } from '../components/ui.jsx'
import { STATUS, URGENCY, monthLabel, useLoad } from '../lib.js'

const pct = (v) => (v == null ? '—' : `${v}%`)
const axis = { fontSize: 12, fill: '#64748b' }

function ChartCard({ title, empty, children, height = 260 }) {
  return (
    <Card title={title}>
      {empty ? <EmptyState title="No data yet" hint="This chart fills in as referrals are recorded." /> : (
        <div style={{ height }}><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>
      )}
    </Card>
  )
}

export default function Reports() {
  const state = useLoad(() => api.stats())

  return (
    <>
      <PageHeader title="Reports & analytics" subtitle="Referral statistics calculated live from the database."
        actions={<Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print</Button>} />
      <Async state={state}>
        {(s) => {
          const status = Object.keys(STATUS).filter((k) => s.by_status[k]).map((k) => ({ name: STATUS[k].label, value: s.by_status[k], color: STATUS[k].color }))
          const urgency = Object.keys(URGENCY).map((k) => ({ name: URGENCY[k].label, count: s.by_urgency[k] || 0, color: URGENCY[k].color }))
          const facility = s.by_facility.map(([name, count]) => ({ name, count }))
          const month = s.by_month.map(([m, count]) => ({ name: monthLabel(m), count }))
          return (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <StatCard label="Total referrals" value={s.total} tone="navy" />
                <StatCard label="Attendance rate" value={pct(s.attendance_rate)} tone="green" hint="Attended or completed, of those decided" />
                <StatCard label="Completion rate" value={pct(s.completion_rate)} tone="green" />
                <StatCard label="Avg. days to attend" value={s.avg_days_to_attendance ?? '—'} tone="blue" />
                <StatCard label="Overdue now" value={s.overdue} tone={s.overdue ? 'red' : 'green'} hint={`${s.followups_pending} follow-up(s) pending`} />
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <ChartCard title="Referrals by status" empty={s.total === 0}>
                  <PieChart>
                    <Pie isAnimationActive={false} data={status} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                      {status.map((d) => <Cell key={d.name} fill={d.color} />)}
                    </Pie>
                    <Tooltip /><Legend formatter={(v) => <span className="text-xs text-slate-600">{v}</span>} />
                  </PieChart>
                </ChartCard>

                <ChartCard title="Referrals by month" empty={month.length === 0}>
                  <BarChart data={month}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={axis} /><YAxis allowDecimals={false} tick={axis} />
                    <Tooltip cursor={{ fill: '#f1f5f9' }} />
                    <Bar isAnimationActive={false} dataKey="count" name="Referrals" fill="#2563b0" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ChartCard>

                <ChartCard title="Referrals by urgency" empty={s.total === 0}>
                  <BarChart data={urgency}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={axis} /><YAxis allowDecimals={false} tick={axis} />
                    <Tooltip cursor={{ fill: '#f1f5f9' }} />
                    <Bar isAnimationActive={false} dataKey="count" name="Referrals" radius={[6, 6, 0, 0]}>
                      {urgency.map((d) => <Cell key={d.name} fill={d.color} />)}
                    </Bar>
                  </BarChart>
                </ChartCard>

                <ChartCard title="Referrals by receiving facility" empty={facility.length === 0} height={Math.max(260, facility.length * 44)}>
                  <BarChart data={facility} layout="vertical" margin={{ left: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" allowDecimals={false} tick={axis} />
                    <YAxis type="category" dataKey="name" width={130} tick={axis} />
                    <Tooltip cursor={{ fill: '#f1f5f9' }} />
                    <Bar isAnimationActive={false} dataKey="count" name="Referrals" fill="#0d9488" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ChartCard>
              </div>

              <Card title="Summary table" padded={false}>
                <table className="min-w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {Object.keys(STATUS).map((k) => (
                      <tr key={k}><td className="px-5 py-2.5 text-slate-600">{STATUS[k].label}</td><td className="px-5 py-2.5 text-right font-medium text-navy-900">{s.by_status[k] || 0}</td></tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          )
        }}
      </Async>
    </>
  )
}
