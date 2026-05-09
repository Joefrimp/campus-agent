import { useState } from 'react'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { supabase } from '../../lib/supabase'

interface OnboardingFormProps {
  userId: string
  onComplete: () => void
}

export function OnboardingForm({ userId, onComplete }: OnboardingFormProps) {
  const [form, setForm] = useState({ first_name: '', last_name: '', business_name: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.first_name || !form.last_name || !form.business_name) {
      setError('All fields are required.')
      return
    }
    setLoading(true)
    setError('')
    const { error: err } = await supabase
      .from('profiles')
      .update({ first_name: form.first_name, last_name: form.last_name, business_name: form.business_name })
      .eq('id', userId)
    if (err) {
      setError(err.message)
    } else {
      onComplete()
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="First Name"
          value={form.first_name}
          onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
          placeholder="Kwame"
          autoFocus
        />
        <Input
          label="Last Name"
          value={form.last_name}
          onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
          placeholder="Mensah"
        />
      </div>
      <Input
        label="Business Name"
        value={form.business_name}
        onChange={e => setForm(f => ({ ...f, business_name: e.target.value }))}
        placeholder="Mensah Ventures Ltd"
        hint="This will appear on your dashboard"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <Button type="submit" className="w-full" size="lg" loading={loading}>
        Continue
      </Button>
    </form>
  )
}
