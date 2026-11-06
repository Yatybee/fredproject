// Loaded lazily by the dashboard so recharts stays out of the initial bundle.
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, PolarAngleAxis, RadialBar, RadialBarChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { STATUS } from '../lib.js'
import { useChartColors } from '../theme.jsx'

/** Theme-aware chart styling (axis text, grid, tooltip) from the active light/dark theme. */
function useStyle() {
  const c = useChartColors()
  return { c, axis: { fontSize: 11, fill: c.axis }, tipProps: { contentStyle: c.tip, labelStyle: c.tipLabel, itemStyle: c.tipItem } }
}

// ---------- Referral trend (area, 7 / 30 / 90 days) ----------
export function TrendChart({ data, step }) {
  const { c, axis, tipProps } = useStyle()
  return (
    <div className="h-64" role="img" aria-label={`Referrals over time, ${data.reduce((n, d) => n + d.count, 0)} in total`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c.primary} stopOpacity={0.22} />
              <stop offset="100%" stopColor={c.primary} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={c.grid} />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
          <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
          <Tooltip {...tipProps} cursor={{ stroke: c.cursorLine }}
            labelFormatter={(l) => (step > 1 ? `Week of ${l}` : l)} formatter={(v) => [v, 'Referrals']} />
          <Area type="monotone" dataKey="count" name="Referrals" stroke={c.primary} strokeWidth={2} fill="url(#trendFill)"
            dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ---------- Referral activity: referred vs completed per month (paired rounded bars) ----------
function ActivityTip({ active, payload, label, bubble }) {
  if (!active || !payload?.length) return null
  return (
    <div style={bubble} className="rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium opacity-70">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 font-semibold">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.value} <span className="font-normal opacity-80">{p.name}</span>
        </p>
      ))}
    </div>
  )
}

export function ActivityBars({ data }) {
  const { c, axis } = useStyle()
  const summary = data.map((d) => `${d.label}: ${d.referred} referred, ${d.completed} completed`).join('; ')
  return (
    <div>
      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c.muted }} />Referred</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c.primary }} />Completed</span>
      </div>
      <div className="mt-2 h-64" role="img" aria-label={`Referrals referred and completed per month. ${summary}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, left: -22, bottom: 0 }} barGap={4} barCategoryGap="22%">
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={c.grid} />
            <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
            <Tooltip cursor={{ fill: c.cursorFill, radius: 8 }} content={<ActivityTip bubble={c.bubble} />} />
            <Bar dataKey="referred" name="Referred" fill={c.muted} radius={[8, 8, 8, 8]} maxBarSize={26} isAnimationActive={false} />
            <Bar dataKey="completed" name="Completed" fill={c.primary} radius={[8, 8, 8, 8]} maxBarSize={26} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ---------- Referral statistics: concentric rings, one per status (share of all referrals) ----------
const RING_ORDER = ['NO_SHOW', 'PENDING', 'ATTENDED', 'COMPLETED'] // innermost -> outermost

export function StatusRadial({ byStatus, total, completionRate }) {
  const { c } = useStyle()
  const rings = RING_ORDER.map((k) => ({
    key: k, name: STATUS[k].label, value: byStatus[k] || 0,
    pct: total ? Math.round((1000 * (byStatus[k] || 0)) / total) / 10 : 0, fill: STATUS[k].color,
  }))
  const label = `Referral status: ${Object.keys(STATUS).filter((k) => byStatus[k]).map((k) => `${STATUS[k].label} ${byStatus[k]}`).join(', ')}`
  return (
    <div>
      <div className="relative mx-auto h-56 w-56" role="img" aria-label={label}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart data={rings} innerRadius="36%" outerRadius="100%" startAngle={90} endAngle={-270} barSize={13}>
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar dataKey="pct" background={{ fill: c.track }} cornerRadius={10} isAnimationActive={false} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-3xl font-semibold leading-none text-ink">{total}</p>
            <p className="mt-1 text-xs text-slate-500">Referrals</p>
            {completionRate != null && (
              <span className="mt-1.5 inline-block rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800">{completionRate}% done</span>
            )}
          </div>
        </div>
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        {[...rings].reverse().concat(byStatus.CANCELLED ? [{ key: 'CANCELLED', name: STATUS.CANCELLED.label, value: byStatus.CANCELLED, fill: STATUS.CANCELLED.color }] : []).map((d) => (
          <li key={d.key} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 rounded-full" style={{ background: d.fill }} />{d.name}</span>
            <span className="font-medium text-ink">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------- Referrals by facility: overlapping bubbles (top 3) + ranked list with bars ----------
const BUBBLE_FILL = ['#4255e6', '#5b6cf0', '#8b97f5']
// Fixed slots so the bubbles overlap the way a cluster does: big on the left, smaller ones tucked in.
const SLOTS = [{ x: 72, y: 80 }, { x: 148, y: 56 }, { x: 140, y: 118 }]

export function FacilityBubbles({ data }) {
  const rows = data.slice(0, 5)
  const top = rows.slice(0, 3)
  const max = Math.max(...rows.map((r) => r.count), 1)
  const radius = (n) => 20 + 30 * Math.sqrt(n / max)
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center xl:flex-col xl:items-stretch">
      <svg viewBox="0 0 220 165" className="mx-auto h-40 w-full max-w-[240px] shrink-0" role="img"
        aria-label={`Referrals by facility: ${rows.map((r) => `${r.name} ${r.count}`).join(', ')}`}>
        {top.map((r, i) => (
          <g key={r.name}>
            <circle cx={SLOTS[i].x} cy={SLOTS[i].y} r={radius(r.count)} fill={BUBBLE_FILL[i]} fillOpacity={i === 0 ? 1 : 0.92} stroke="var(--color-surface)" strokeWidth="3" />
            <text x={SLOTS[i].x} y={SLOTS[i].y} textAnchor="middle" dominantBaseline="central" fill="#fff"
              fontSize={i === 0 ? 20 : 15} fontWeight="600">{r.count}</text>
          </g>
        ))}
      </svg>
      <ul className="min-w-0 flex-1 space-y-3">
        {rows.map((r, i) => (
          <li key={r.name}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2 text-slate-700">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: BUBBLE_FILL[Math.min(i, 2)] }} />
                <span className="truncate" title={r.name}>{r.name}</span>
              </span>
              <span className="font-semibold text-ink">{r.count}</span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full" style={{ width: `${(100 * r.count) / max}%`, background: BUBBLE_FILL[Math.min(i, 2)] }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
