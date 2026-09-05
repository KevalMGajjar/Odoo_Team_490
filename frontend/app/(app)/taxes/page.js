'use client'

import { SimpleMasterPage } from '@/components/masters/SimpleMasterPage'
import { FormField, TextInput } from '@/components/ui/FormField'
import { FormGrid } from '@/components/layout/FormSheet'

export default function TaxesPage() {
  return (
    <SimpleMasterPage
      title="Taxes"
      breadcrumb="Account Masters"
      apiPath="/taxes"
      archivable={false}
      emptyForm={{ name: '', rate: '' }}
      columns={[
        { key: 'name', header: 'Name' },
        { key: 'rate', header: 'Rate', align: 'right', render: (r) => `${Number(r.rate)}%` },
      ]}
      Fields={({ form, setForm, errors, readOnly }) => (
        <FormGrid>
          <FormField label="Name" required error={errors.name}>
            <TextInput
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="GST 18%"
              disabled={readOnly}
              autoFocus
              required
            />
          </FormField>
          <FormField label="Rate %" required error={errors.rate}>
            <TextInput
              type="number" step="0.01"
              value={form.rate}
              onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
              disabled={readOnly}
              required
            />
          </FormField>
        </FormGrid>
      )}
    />
  )
}
