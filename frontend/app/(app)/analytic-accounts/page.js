'use client'

import { Wallet, TrendingUp } from 'lucide-react'
import { SimpleMasterPage } from '@/components/masters/SimpleMasterPage'
import { FormField, TextInput, Select } from '@/components/ui/FormField'
import { FormGrid } from '@/components/layout/FormSheet'

export default function AnalyticAccountsPage() {
  return (
    <SimpleMasterPage
      title="Analytic Accounts"
      breadcrumb="Account"
      apiPath="/analytic-accounts"
      archivable={false}
      emptyForm={{ name: '', type: 'expense' }}
      columns={[
        { key: 'name', header: 'Name' },
        { key: 'type', header: 'Type', render: (r) => (r.type === 'income' ? 'Income' : 'Expense') },
      ]}
      renderCard={(r) => (
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface-subtle">
            {r.type === 'income' ? <TrendingUp size={20} className="text-state-paid" /> : <Wallet size={20} className="text-ink-faint" />}
          </div>
          <p className="truncate w-full text-sm font-semibold text-ink">{r.name}</p>
          <p className="text-xs text-ink-faint">{r.type === 'income' ? 'Income' : 'Expense'}</p>
        </div>
      )}
      Fields={({ form, setForm, errors, readOnly }) => (
        <FormGrid>
          <FormField label="Name" required error={errors.name} className="col-span-2">
            <TextInput
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Showroom Operations"
              disabled={readOnly}
              autoFocus
              required
            />
          </FormField>
          <FormField label="Type" required error={errors.type}>
            <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} disabled={readOnly}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </Select>
          </FormField>
        </FormGrid>
      )}
    />
  )
}
