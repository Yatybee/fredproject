import { useState } from 'react'
import { CalendarPlus } from 'lucide-react'
import { api } from '../api.js'
import { Alert, Button, Input, Textarea, useToast } from './ui.jsx'
import { today } from '../lib.js'

/** Schedules a follow-up for one referral. `children` may render extra fields (e.g. a referral picker). */
export default function FollowupForm({ referralId, onDone, onCancel }) {
  const toast = useToast()
  const [form, setForm] = useState({ scheduled_for: '', notes: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!referralId) return setError('Choose a referral.')
    setBusy(true)
    setError('')
    try {
      await api.addFollowup(referralId, form)
      toast('Follow-up scheduled.')
      onDone()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Alert>{error}</Alert>
      <Input label="Follow-up date" type="date" required min={today()} value={form.scheduled_for}
        onChange={(e) => setForm({ ...form, scheduled_for: e.target.value })} />
      <Textarea label="Notes" maxLength={500} value={form.notes} placeholder="What should happen at this follow-up?"
        onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      <div className="flex justify-end gap-2">
        {onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" loading={busy} icon={CalendarPlus}>Schedule</Button>
      </div>
    </form>
  )
}
