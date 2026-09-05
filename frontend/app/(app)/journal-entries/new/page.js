'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ControlPanel } from '@/components/layout/ControlPanel'
import { FormSheet, FormGrid, FormSection } from '@/components/layout/FormSheet'
import { FormField, TextInput } from '@/components/ui/FormField'
import { SearchSelect } from '@/components/ui/SearchSelect'
import { Button } from '@/components/ui/Button'
import { DebitCreditGrid, blankRow, gridIsBalanced } from '@/components/documents/DebitCreditGrid'
import { api, ApiError } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { toDateInput } from '@/lib/format'

export default function NewJournalEntryPage() {
  const router = useRouter()
  const { push } = useToast()

  const [journal, setJournal] = useState(null)
  const [date, setDate] = useState(toDateInput(new Date()))
  const [reference, setReference] = useState('')
  const [narration, setNarration] = useState('')
  const [items, setItems] = useState([blankRow(), blankRow()])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const balanced = gridIsBalanced(items)
  const canSubmit = balanced && journal && items.every((i) => i.accountId)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!canSubmit) return
    setSaving(true)
    try {
      const entry = await api.post('/journal-entries', {
        journalId: journal.id,
        date,
        reference: reference || undefined,
        narration: narration || undefined,
        items: items
          .filter((i) => i.accountId)
          .map((i) => ({
            accountId: i.accountId,
            partnerId: i.partnerId || undefined,
            analyticAccountId: i.analyticAccountId || undefined,
            label: i.label || undefined,
            debit: Number(i.debit) || 0,
            credit: Number(i.credit) || 0,
          })),
      })
      push(`Entry ${entry.number} posted`, { type: 'success' })
      router.replace(`/journal-entries/${entry.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not post entry')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ControlPanel breadcrumb="Accounting" title="New Journal Entry" />
      <form onSubmit={submit} className="flex-1 overflow-y-auto p-4 sm:p-6">
        <FormSheet className="max-w-[1100px]">
          <FormSection>
            <FormGrid>
              <FormField label="Journal" required>
                <SearchSelect
                  path="/journals"
                  resolvedOption={journal}
                  onChange={setJournal}
                  getLabel={(o) => `${o.code} — ${o.name}`}
                  placeholder="Select journal"
                />
              </FormField>
              <FormField label="Accounting Date" required>
                <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </FormField>
              <FormField label="Reference" hint="Optional — source document number">
                <TextInput value={reference} onChange={(e) => setReference(e.target.value)} />
              </FormField>
              <FormField label="Narration">
                <TextInput value={narration} onChange={(e) => setNarration(e.target.value)} />
              </FormField>
            </FormGrid>
          </FormSection>

          <FormSection title="Journal Items">
            <DebitCreditGrid items={items} onChange={setItems} />
          </FormSection>

          {error && <p className="mt-3 rounded-sm bg-state-overdue/10 px-2 py-1.5 text-xs text-state-overdue">{error}</p>}

          <div className="mt-5 flex items-center justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
            <Button
              type="submit"
              variant="primary"
              loading={saving}
              disabled={!canSubmit}
              title={!balanced ? 'Debit and credit must be equal before posting' : undefined}
            >
              Post Entry
            </Button>
          </div>
        </FormSheet>
      </form>
    </div>
  )
}
