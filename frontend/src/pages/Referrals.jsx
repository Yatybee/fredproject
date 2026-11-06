import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { FilePlus2, Search, X } from 'lucide-react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { Button, Card, EmptyState, ErrorState, PageHeader, Spinner, StatusBadge, UrgencyBadge, bareInput } from '../components/ui.jsx'
import { STATUS, URGENCY, daysFromToday, fmtDate, useDebounced, useLoad } from '../lib.js'

export default function Referrals() {
  const { can } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const initial = params.get('status')
  const [filters, setFilters] = useState({ q: '', status: initial in STATUS ? initial : '', urgency: '', facility_id: '' })
  const q = useDebounced(filters.q)
  const facilities = useLoad(() => api.facilities())
  const list = useLoad(() => api.referrals({ ...filters, q }), [q, filters.status, filters.urgency, filters.facility_id])

  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value })
  const active = filters.q || filters.status || filters.urgency || filters.facility_id
  const clear = () => setFilters({ q: '', status: '', urgency: '', facility_id: '' })

  return (
    <>
      <PageHeader title="Referrals" subtitle="Search, filter and open any referral."
        actions={can('write_referral') && <Link to="/referrals/new"><Button icon={FilePlus2}>New referral</Button></Link>} />

      <Card padded={false}>
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input aria-label="Search referrals" placeholder="Search patient, phone, reason or #id…" value={filters.q}
              onChange={set('q')} className={`${bareInput} pl-9`} />
          </div>
          <select aria-label="Filter by status" value={filters.status} onChange={set('status')} className={bareInput}>
            <option value="">All statuses</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select aria-label="Filter by urgency" value={filters.urgency} onChange={set('urgency')} className={bareInput}>
            <option value="">All urgencies</option>
            {Object.entries(URGENCY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select aria-label="Filter by facility" value={filters.facility_id} onChange={set('facility_id')} className={bareInput}>
            <option value="">All facilities</option>
            {(facilities.data || []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          {active && <Button variant="ghost" icon={X} onClick={clear}>Clear</Button>}
        </div>

        {list.loading && !list.data ? <Spinner /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> :
          list.data.length === 0 ? (
            <EmptyState title={active ? 'No referrals match your filters' : 'No referrals yet'}
              hint={active ? 'Try a different search or clear the filters.' : 'Referrals you create will be listed here.'}
              action={active ? <Button variant="secondary" onClick={clear}>Clear filters</Button> : null} />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">#</th>
                    <th className="px-4 py-3 font-medium">Patient</th>
                    <th className="hidden px-4 py-3 font-medium md:table-cell">Facility</th>
                    <th className="hidden px-4 py-3 font-medium sm:table-cell">Urgency</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="hidden px-4 py-3 font-medium lg:table-cell">Referred</th>
                    <th className="px-4 py-3 font-medium">Expected by</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.data.map((r) => {
                    const overdue = ['PENDING', 'NO_SHOW'].includes(r.status) && daysFromToday(r.expected_by) < 0
                    return (
                      <tr key={r.id} onClick={() => navigate(`/referrals/${r.id}`)} className="cursor-pointer hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-500">{r.id}</td>
                        <td className="px-4 py-3">
                          <Link to={`/referrals/${r.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-navy-900 hover:text-blue-600">{r.patient_name}</Link>
                          <p className="max-w-xs truncate text-xs text-slate-500">{r.reason}</p>
                        </td>
                        <td className="hidden px-4 py-3 text-slate-700 md:table-cell">{r.facility_name}</td>
                        <td className="hidden px-4 py-3 sm:table-cell"><UrgencyBadge urgency={r.urgency} /></td>
                        <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                        <td className="hidden px-4 py-3 text-slate-600 lg:table-cell">{fmtDate(r.referral_date)}</td>
                        <td className={`whitespace-nowrap px-4 py-3 ${overdue ? 'font-medium text-red-600' : 'text-slate-600'}`}>
                          {fmtDate(r.expected_by)}{overdue && ' · overdue'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">{list.data.length} referral(s)</p>
            </div>
          )}
      </Card>
    </>
  )
}
