// Loaded lazily by the dashboard so recharts stays out of the initial bundle.
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { STATUS } from '../lib.js'

const axis = { fontSize: 11, fill: '#64748b' }
const tip = { borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 4px 14px rgba(15,42,71,0.08)', fontSize: 12 }

export function TrendChart({ data, step }) {
  return (
    <div className="h-64" role="img" aria-label={`Referrals over time, ${data.reduce((n, d) => n + d.count, 0)} in total`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563b0" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#2563b0" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8edf3" />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
          <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tip} cursor={{ stroke: '#cbd5e1' }}
            labelFormatter={(l) => (step > 1 ? `Week of ${l}` : l)} formatter={(v) => [v, 'Referrals']} />
          <Area type="monotone" dataKey="count" name="Referrals" stroke="#2563b0" strokeWidth={2} fill="url(#trendFill)"
            dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export function StatusDonut({ byStatus, total }) {
  const data = Object.keys(STATUS).filter((k) => byStatus[k]).map((k) => ({ key: k, name: STATUS[k].label, value: byStatus[k], color: STATUS[k].color }))
  return (
    <div>
      <div className="relative mx-auto h-48 w-48" role="img" aria-label={`Referral status: ${data.map((d) => `${d.name} ${d.value}`).join(', ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={82} paddingAngle={2} stroke="none" isAnimationActive={false}>
              {data.map((d) => <Cell key={d.key} fill={d.color} />)}
            </Pie>
            <Tooltip contentStyle={tip} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-2xl font-semibold leading-none text-navy-900">{total}</p>
            <p className="mt-1 text-xs text-slate-500">referrals</p>
          </div>
        </div>
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        {data.map((d) => (
          <li key={d.key} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} />{d.name}</span>
            <span className="font-medium text-navy-900">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function FacilityBars({ data }) {
  const rows = data.slice(0, 6)
  return (
    <div style={{ height: Math.max(180, rows.length * 44) }} role="img"
      aria-label={`Referrals by receiving facility: ${rows.map((d) => `${d.name} ${d.count}`).join(', ')}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e8edf3" />
          <XAxis type="number" allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="name" width={150} tick={axis} tickLine={false} axisLine={false}
            tickFormatter={(n) => (n.length > 24 ? `${n.slice(0, 23)}…` : n)} />
          <Tooltip contentStyle={tip} cursor={{ fill: '#f1f5f9' }} formatter={(v) => [v, 'Referrals']} />
          <Bar dataKey="count" name="Referrals" fill="#0d9488" radius={[0, 4, 4, 0]} barSize={18} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
