'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { ControlPanel } from '@/components/layout/ControlPanel'
import { DataTable } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { FormField, TextInput } from '@/components/ui/FormField'
import { FormGrid } from '@/components/layout/FormSheet'
import { useApiList, useApiGet } from '@/lib/useApi'
import { useAuth, canWrite } from '@/lib/auth'
import { api, ApiError } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { formatDate, toDateInput } from '@/lib/format'
import { useGuardedAction } from '@/lib/useGuardedAction'

export default function CurrenciesPage() {
  const { user } = useAuth()
  const { push } = useToast()
  const { rows, loading, reload } = useApiList('/currencies', { pageSize: 100 })

  const [newOpen, setNewOpen] = useState(false)
  const [newForm, setNewForm] = useState({ code: '', name: '', symbol: '', decimalPlaces: 2 })
  const [errors, setErrors] = useState({})
  const [ratesFor, setRatesFor] = useState(null)

  const [createCurrency, saving] = useGuardedAction(async (e) => {
    e.preventDefault()
    setErrors({})
    try {
      await api.post('/currencies', newForm)
      push('Currency added', { type: 'success' })
      setNewOpen(false)
      setNewForm({ code: '', name: '', symbol: '', decimalPlaces: 2 })
      reload()
    } catch (err) {
      if (err instanceof ApiError && err.errors?.length) {
        setErrors(Object.fromEntries(err.errors.map((e) => [e.field, e.message])))
      } else {
        push(err.message || 'Could not add currency', { type: 'error' })
      }
    }
  })

  const columns = [
    { key: 'code', header: 'Code', render: (r) => <span className="font-medium">{r.code}</span> },
    { key: 'name', header: 'Name' },
    { key: 'symbol', header: 'Symbol', hideOnMobile: true },
    {
      key: 'rate', header: 'Latest Rate', align: 'right',
      render: (r) => (r.isBase ? <span className="text-ink-faint">base — 1.000000</span> : r.rates?.[0] ? `${Number(r.rates[0].rate).toFixed(6)} (${formatDate(r.rates[0].date)})` : <span className="text-state-overdue">No rate set</span>),
    },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.isBase ? 'active' : r.status}>{r.isBase ? 'Base' : undefined}</StatusBadge> },
  ]

  return (
    <div className="flex h-full flex-col">
      <ControlPanel
        breadcrumb="Account Masters"
        title="Currencies"
        actions={canWrite(user?.role) && <Button variant="primary" size="sm" icon={Plus} onClick={() => setNewOpen(true)}>New</Button>}
      />
      <div className="flex-1 overflow-hidden">
        <DataTable
          columns={columns}
          rows={rows}
          loading={loading}
          onRowClick={(r) => !r.isBase && setRatesFor(r)}
          emptyTitle="No currencies configured."
        />
      </div>

      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="New Currency"
        footer={
          <>
            <Button variant="ghost" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={createCurrency} loading={saving}>Save</Button>
          </>
        }
      >
        <FormGrid>
          <FormField label="Code" required error={errors.code} hint="3-letter ISO, e.g. USD">
            <TextInput value={newForm.code} onChange={(e) => setNewForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} maxLength={3} autoFocus required />
          </FormField>
          <FormField label="Symbol" required error={errors.symbol}>
            <TextInput value={newForm.symbol} onChange={(e) => setNewForm((f) => ({ ...f, symbol: e.target.value }))} required />
          </FormField>
          <FormField label="Name" required error={errors.name} className="col-span-2">
            <TextInput value={newForm.name} onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))} required />
          </FormField>
        </FormGrid>
      </Modal>

      {ratesFor && <RatesModal currency={ratesFor} onClose={() => setRatesFor(null)} />}
    </div>
  )
}

function RatesModal({ currency, onClose }) {
  const { push } = useToast()
  const { data, loading, reload } = useApiGet('/currency-rates', { currencyId: currency.id })
  const [date, setDate] = useState(toDateInput(new Date()))
  const [rate, setRate] = useState('')
  const [error, setError] = useState('')

  const [addRate, saving] = useGuardedAction(async (e) => {
    e.preventDefault()
    setError('')
    try {
      await api.post('/currency-rates', { currencyId: currency.id, date, rate })
      push(`Rate set for ${currency.code}`, { type: 'success' })
      setRate('')
      reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save rate')
    }
  })

  return (
    <Modal open onClose={onClose} title={`Exchange Rates — ${currency.code}`} size="sm">
      <p className="mb-3 text-xs text-ink-muted">
        1 {currency.code} = <span className="tabular">{rate || '?'}</span> base currency. Rates are business records —
        never fetched live — so historical documents stay reproducible.
      </p>

      <form onSubmit={addRate} className="mb-4 flex items-end gap-2">
        <FormField label="Date" className="flex-1">
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </FormField>
        <FormField label="Rate" className="flex-1">
          <TextInput type="number" step="0.000001" value={rate} onChange={(e) => setRate(e.target.value)} required />
        </FormField>
        <Button type="submit" variant="primary" loading={saving}>Add</Button>
      </form>
      {error && <p className="mb-3 text-xs text-state-overdue">{error}</p>}

      <div className="max-h-56 overflow-y-auto rounded border border-line">
        {loading ? (
          <p className="p-3 text-xs text-ink-faint">Loading…</p>
        ) : !data?.rows?.length ? (
          <p className="p-3 text-xs text-ink-faint">No rates recorded yet.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-b-0">
                  <td className="px-3 py-1.5 text-ink-muted">{formatDate(r.date)}</td>
                  <td className="px-3 py-1.5 text-right tabular font-medium">{Number(r.rate).toFixed(6)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  )
}
