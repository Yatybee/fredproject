// Dashboard insights. Everything here is derived from records returned by the API
// (stats, outstanding referrals, pending follow-ups, referral list). Nothing is hard-coded, and
// an insight is only produced when there is data to support it.
import { daysFromToday, fmtDate, today } from './lib.js'

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

/** Referral counts per day (7/30 days) or per week (90 days) for the last `days` days, plus the previous period's total. */
export function buildTrend(referrals, days) {
  const end = today()
  const start = addDays(end, -(days - 1))
  const prevStart = addDays(start, -days)
  const step = days > 31 ? 7 : 1
  const inRange = (r, a, b) => r.referral_date >= a && r.referral_date <= b
  const series = []
  for (let offset = 0; offset < days; offset += step) {
    const from = addDays(start, offset)
    const to = addDays(from, Math.min(step, days - offset) - 1)
    const label = step === 1
      ? fmtDate(from).replace(/,? \d{4}$/, '')
      : `${fmtDate(from).replace(/,? \d{4}$/, '')}`
    series.push({ label, from, to, count: referrals.filter((r) => inRange(r, from, to)).length })
  }
  return {
    series,
    current: referrals.filter((r) => inRange(r, start, end)).length,
    previous: referrals.filter((r) => inRange(r, prevStart, addDays(start, -1))).length,
    step,
  }
}

/**
 * @returns {Array<{id, tone, title, detail, action?: {label, to}}>}  tone: red | amber | blue | green | navy
 */
export function buildInsights({ stats, overdue, followups, referrals, trendDays = 30 }) {
  if (!stats || stats.total === 0) return []
  const out = []

  // 1. Outstanding referrals (past expected date, attendance not confirmed)
  if (overdue.length > 0) {
    const oldest = [...overdue].sort((a, b) => a.expected_by.localeCompare(b.expected_by))[0]
    const days = -daysFromToday(oldest.expected_by)
    out.push({
      id: 'outstanding', tone: 'red',
      title: `${plural(overdue.length, 'referral')} awaiting confirmed attendance`,
      detail: `Oldest: ${oldest.patient_name}, ${plural(days, 'day')} past the expected date (${fmtDate(oldest.expected_by)}).`,
      action: { label: `Contact ${oldest.patient_name}${oldest.patient_phone ? ` on ${oldest.patient_phone}` : ''}`, to: `/referrals/${oldest.id}` },
    })
  } else {
    out.push({ id: 'outstanding', tone: 'green', title: 'No outstanding referrals', detail: 'Every unconfirmed referral is still within its expected time.' })
  }

  // 2. Follow-up reminders (pending follow-ups that are overdue or due within 7 days)
  const lateF = followups.filter((f) => daysFromToday(f.scheduled_for) < 0)
  const soonF = followups.filter((f) => { const d = daysFromToday(f.scheduled_for); return d >= 0 && d <= 7 })
  if (lateF.length || soonF.length) {
    const first = [...lateF, ...soonF].sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for))[0]
    const d = daysFromToday(first.scheduled_for)
    out.push({
      id: 'followups', tone: lateF.length ? 'red' : 'amber',
      title: lateF.length ? `${plural(lateF.length, 'follow-up')} overdue` : `${plural(soonF.length, 'follow-up')} due in the next 7 days`,
      detail: `${lateF.length && soonF.length ? `${soonF.length} more due within 7 days. ` : ''}Next: ${first.full_name}, ${d < 0 ? `${-d} day(s) overdue` : d === 0 ? 'today' : fmtDate(first.scheduled_for)}.`,
      action: { label: `Open ${first.full_name}'s referral`, to: `/referrals/${first.referral_id}` },
    })
  }

  // 3. Completion rate
  if (stats.completion_rate != null) {
    const done = stats.by_status.COMPLETED || 0
    out.push({
      id: 'completion', tone: 'green',
      title: `${stats.completion_rate}% of referrals completed`,
      detail: `${done} of ${plural(stats.total, 'referral')} have care received and an outcome recorded.`,
    })
  }

  // 4. Facility insight
  if (stats.by_facility.length > 0) {
    const [name, count] = stats.by_facility[0]
    const share = Math.round((100 * count) / stats.total)
    out.push({
      id: 'facility', tone: 'blue',
      title: `${name} receives the most referrals`,
      detail: `${plural(count, 'referral')} (${share}% of all referrals)${stats.by_facility.length > 1 ? `, ahead of ${stats.by_facility[1][0]} with ${stats.by_facility[1][1]}` : ''}.`,
    })
  }

  // 5. Trend over the selected period
  const t = buildTrend(referrals, trendDays)
  if (t.current > 0 || t.previous > 0) {
    let title, tone = 'navy'
    if (t.previous === 0) title = `${plural(t.current, 'new referral')} in the last ${trendDays} days`
    else {
      const change = Math.round((100 * (t.current - t.previous)) / t.previous)
      title = change === 0 ? `Referral volume unchanged over ${trendDays} days`
        : `Referrals ${change > 0 ? 'up' : 'down'} ${Math.abs(change)}% over ${trendDays} days`
      tone = change > 0 ? 'amber' : 'blue'
    }
    out.push({
      id: 'trend', tone, title,
      detail: `${t.current} in the last ${trendDays} days compared with ${t.previous} in the ${trendDays} days before.`,
    })
  }
  return out
}
