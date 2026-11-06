import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ClipboardList, FilePlus2 } from 'lucide-react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { Async, Button, Card, EmptyState, StatusBadge, UrgencyBadge } from '../components/ui.jsx'
import { fmtDate, useLoad } from '../lib.js'

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-2.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="col-span-2 break-words text-slate-900">{children || '—'}</dd>
    </div>
  )
}

export default function PatientDetail() {
  const { id } = useParams()
  const { can } = useAuth()
  const state = useLoad(() => api.patient(id), [id])

  return (
    <>
      <Link to="/patients" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"><ArrowLeft className="h-4 w-4" /> All patients</Link>
      <Async state={state}>
        {(p) => (
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold text-ink">{p.full_name}</h1>
                <p className="mt-1 font-mono text-sm text-slate-500">{p.patient_no}</p>
              </div>
              {can('write_referral') && (
                <Link to={`/referrals/new?patient=${p.id}`}><Button icon={FilePlus2}>New referral for this patient</Button></Link>
              )}
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <Card title="Patient information">
                <dl className="divide-y divide-slate-100">
                  <Row label="Patient ID">{p.patient_no}</Row>
                  <Row label="Date of birth">{fmtDate(p.date_of_birth)}</Row>
                  <Row label="Phone"><a className="text-blue-600 hover:underline" href={`tel:${p.phone}`}>{p.phone}</a></Row>
                  <Row label="Address">{p.address}</Row>
                  <Row label="Registered">{fmtDate(p.created_at)}</Row>
                </dl>
              </Card>

              <Card title="Referral history" className="lg:col-span-2" padded={false}>
                {p.referrals.length === 0 ? (
                  <EmptyState icon={ClipboardList} title="No referrals for this patient" hint="Create one with “New referral for this patient”." />
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {p.referrals.map((r) => (
                      <li key={r.id}>
                        <Link to={`/referrals/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 hover:bg-slate-50">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900">#{r.id} → {r.facility_name}</p>
                            <p className="truncate text-xs text-slate-500">{fmtDate(r.referral_date)} · {r.reason}</p>
                          </div>
                          <div className="flex items-center gap-2"><UrgencyBadge urgency={r.urgency} /><StatusBadge status={r.status} /></div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        )}
      </Async>
    </>
  )
}
