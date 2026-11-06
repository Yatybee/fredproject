import { useState } from 'react'
import { api } from '../api.js'
import { Alert, Button, Input, Modal, useToast } from './ui.jsx'

/** Add / edit dialog for a receiving facility. Used by the Facilities page and, as a pop-up,
 *  by the New Referral form (so the half-filled referral is never lost). */
export default function FacilityForm({ facility, onClose, onDone }) {
  const toast = useToast()
  const [form, setForm] = useState({ name: facility?.name || '', location: facility?.location || '', phone: facility?.phone || '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    e.stopPropagation() // this form can sit inside another page's <form>
    setBusy(true)
    setError('')
    try {
      let id = facility?.id
      if (facility) await api.updateFacility(facility.id, form)
      else ({ id } = await api.addFacility(form))
      toast(facility ? 'Facility updated.' : `${form.name.trim()} added.`)
      onDone(id)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title={facility ? 'Edit facility' : 'Add receiving facility'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Alert>{error}</Alert>
        <Input label="Facility name" required maxLength={200} value={form.name} onChange={set('name')} placeholder="e.g. City General Hospital" autoFocus />
        <Input label="Location" maxLength={200} value={form.location} onChange={set('location')} />
        <Input label="Phone" type="tel" value={form.phone} onChange={set('phone')} hint="Optional. 7-15 digits." />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>{facility ? 'Save changes' : 'Add facility'}</Button>
        </div>
      </form>
    </Modal>
  )
}
