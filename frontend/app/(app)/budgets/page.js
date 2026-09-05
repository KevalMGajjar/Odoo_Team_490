'use client'

import { SimpleMasterPage } from '@/components/masters/SimpleMasterPage'
import { FormField, TextInput } from '@/components/ui/FormField'
import { SearchSelect } from '@/components/ui/SearchSelect'
import { FormGrid } from '@/components/layout/FormSheet'
import { formatMoney, formatDate, toDateInput } from '@/lib/format'

export default function BudgetsPage() {
  return (
    <SimpleMasterPage
      title="Budgets"
      breadcrumb="Account"
      apiPath="/budgets"
      emptyForm={{ name: '', analyticAccount: null, startDate: toDateInput(new Date()), endDate: '', plannedAmount: '' }}
      toForm={(row) => ({
        name: row.name, analyticAccount: row.analyticAccount,
        startDate: toDateInput(row.startDate), endDate: toDateInput(row.endDate), plannedAmount: row.plannedAmount,
      })}
      toPayload={(form) => ({
        name: form.name, analyticAccountId: form.analyticAccount?.id,
        startDate: form.startDate, endDate: form.endDate, plannedAmount: form.plannedAmount,
      })}
      columns={[
        { key: 'name', header: 'Name' },
        { key: 'analyticAccount', header: 'Analytic Account', hideOnMobile: true, render: (r) => r.analyticAccount?.name },
        { key: 'period', header: 'Period', hideOnMobile: true, render: (r) => `${formatDate(r.startDate)} – ${formatDate(r.endDate)}` },
        { key: 'plannedAmount', header: 'Planned', align: 'right', render: (r) => formatMoney(r.plannedAmount) },
      ]}
      Fields={({ form, setForm, errors, readOnly }) => (
        <FormGrid>
          <FormField label="Name" required error={errors.name} className="col-span-2">
            <TextInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} disabled={readOnly} autoFocus required />
          </FormField>
          <FormField label="Analytic Account" required error={errors.analyticAccountId} className="col-span-2">
            <SearchSelect
              path="/analytic-accounts"
              resolvedOption={form.analyticAccount}
              onChange={(opt) => setForm((f) => ({ ...f, analyticAccount: opt }))}
              disabled={readOnly}
            />
          </FormField>
          <FormField label="Start Date" required error={errors.startDate}>
            <TextInput type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} disabled={readOnly} required />
          </FormField>
          <FormField label="End Date" required error={errors.endDate}>
            <TextInput type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} disabled={readOnly} required />
          </FormField>
          <FormField label="Planned Amount" required error={errors.plannedAmount} className="col-span-2">
            <TextInput type="number" step="0.01" value={form.plannedAmount} onChange={(e) => setForm((f) => ({ ...f, plannedAmount: e.target.value }))} disabled={readOnly} required />
          </FormField>
        </FormGrid>
      )}
    />
  )
}
