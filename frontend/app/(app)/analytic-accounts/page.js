'use client'

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
