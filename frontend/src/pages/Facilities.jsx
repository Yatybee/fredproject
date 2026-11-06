import { useState } from 'react'
import { Building2, MapPin, Pencil, Phone, Plus, Trash2 } from 'lucide-react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import FacilityForm from '../components/FacilityForm.jsx'
import { Alert, Async, Button, Card, EmptyState, Modal, PageHeader, useToast } from '../components/ui.jsx'
import { useLoad } from '../lib.js'

export default function Facilities() {
  const { can } = useAuth()
  const toast = useToast()
  const state = useLoad(() => api.facilities())
  const [editing, setEditing] = useState(null) // null | 'new' | facility
  const [confirm, setConfirm] = useState(null)
  const [delError, setDelError] = useState('')
  const canAdd = can('add_facility')
  const canManage = can('manage_facilities') // edit + delete

  const remove = async () => {
    try {
      await api.deleteFacility(confirm.id)
      toast('Facility deleted.')
      setConfirm(null)
      state.reload()
    } catch (err) { setDelError(err.message) }
  }

  return (
    <>
      <PageHeader title="Facilities" subtitle="Hospitals and specialist units that receive referrals."
        actions={canAdd && <Button icon={Plus} onClick={() => setEditing('new')}>Add facility</Button>} />
      <Async state={state}>
        {(list) => list.length === 0 ? (
          <Card><EmptyState icon={Building2} title="No facilities yet"
            hint={canAdd ? 'Add the hospitals and specialist units you refer patients to.' : 'A health worker or administrator needs to add receiving facilities.'}
            action={canAdd && <Button icon={Plus} onClick={() => setEditing('new')}>Add facility</Button>} /></Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((f) => (
              <Card key={f.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="rounded-lg bg-blue-50 p-2.5 text-blue-700"><Building2 className="h-5 w-5" /></span>
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-navy-900">{f.name}</h3>
                      <p className="text-xs text-slate-500">{f.referral_count} referral(s)</p>
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex gap-1">
                      <button aria-label={`Edit ${f.name}`} onClick={() => setEditing(f)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button>
                      <button aria-label={`Delete ${f.name}`} onClick={() => { setDelError(''); setConfirm(f) }} className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  )}
                </div>
                <dl className="mt-4 space-y-1.5 text-sm text-slate-600">
                  <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-slate-400" />{f.location || 'No location'}</div>
                  <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-slate-400" />{f.phone || 'No phone'}</div>
                </dl>
              </Card>
            ))}
          </div>
        )}
      </Async>

      {editing && <FacilityForm facility={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); state.reload() }} />}
      {confirm && (
        <Modal title="Delete facility" onClose={() => setConfirm(null)}>
          <div className="space-y-4">
            <Alert>{delError}</Alert>
            <p className="text-sm text-slate-600">Delete <strong>{confirm.name}</strong>? This cannot be undone. Facilities that already have referrals cannot be deleted.</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
              <Button variant="danger" icon={Trash2} onClick={remove}>Delete</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
