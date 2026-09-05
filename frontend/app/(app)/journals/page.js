'use client'

import { SimpleMasterPage } from '@/components/masters/SimpleMasterPage'
import { FormField, TextInput, Select } from '@/components/ui/FormField'
import { SearchSelect } from '@/components/ui/SearchSelect'
import { FormGrid } from '@/components/layout/FormSheet'

export default function JournalsPage() {
  return (
    <SimpleMasterPage
      title="Journals"
      breadcrumb="Account Masters"
      apiPath="/journals"
      archivable={false}
      emptyForm={{ code: '', name: '', type: 'miscellaneous', defaultDebit: null, defaultCredit: null }}
      toForm={(row) => ({
        code: row.code, name: row.name, type: row.type,
        defaultDebit: row.defaultDebit, defaultCredit: row.defaultCredit,
      })}
      toPayload={(form) => ({
        code: form.code, name: form.name, type: form.type,
        defaultDebitId: form.defaultDebit?.id || null,
        defaultCreditId: form.defaultCredit?.id || null,
      })}
      columns={[
        { key: 'code', header: 'Code', render: (r) => <span className="tabular font-medium">{r.code}</span> },
        { key: 'name', header: 'Name' },
        { key: 'type', header: 'Type', hideOnMobile: true, render: (r) => r.type },
      ]}
      Fields={({ form, setForm, errors, readOnly }) => (
        <FormGrid>
          <FormField label="Code" required error={errors.code}>
            <TextInput
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="BNK"
              disabled={readOnly}
              autoFocus
              required
            />
          </FormField>
          <FormField label="Type" required error={errors.type}>
            <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} disabled={readOnly}>
              <option value="sales">Sales</option>
              <option value="purchase">Purchase</option>
              <option value="bank">Bank</option>
              <option value="cash">Cash</option>
              <option value="miscellaneous">Miscellaneous</option>
            </Select>
          </FormField>
          <FormField label="Name" required error={errors.name} className="col-span-2">
            <TextInput
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              disabled={readOnly}
              required
            />
          </FormField>
          <FormField label="Default Debit Account" error={errors.defaultDebitId}>
            <SearchSelect
              path="/accounts"
              resolvedOption={form.defaultDebit}
              onChange={(opt) => setForm((f) => ({ ...f, defaultDebit: opt }))}
              getLabel={(o) => `${o.code} ${o.name}`}
              placeholder="Optional"
              disabled={readOnly}
            />
          </FormField>
          <FormField label="Default Credit Account" error={errors.defaultCreditId} hint="Used as the bank/cash side for receipt & payment vouchers">
            <SearchSelect
              path="/accounts"
              resolvedOption={form.defaultCredit}
              onChange={(opt) => setForm((f) => ({ ...f, defaultCredit: opt }))}
              getLabel={(o) => `${o.code} ${o.name}`}
              placeholder="Optional"
              disabled={readOnly}
            />
          </FormField>
        </FormGrid>
      )}
    />
  )
}
