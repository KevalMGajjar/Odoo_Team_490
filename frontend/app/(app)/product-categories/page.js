'use client'

import { SimpleMasterPage } from '@/components/masters/SimpleMasterPage'
import { FormField, TextInput } from '@/components/ui/FormField'

export default function ProductCategoriesPage() {
  return (
    <SimpleMasterPage
      title="Product Categories"
      breadcrumb="Account"
      apiPath="/product-categories"
      emptyForm={{ name: '' }}
      columns={[{ key: 'name', header: 'Name' }]}
      Fields={({ form, setForm, errors, readOnly }) => (
        <FormField label="Name" required error={errors.name}>
          <TextInput
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            disabled={readOnly}
            autoFocus
            required
          />
        </FormField>
      )}
    />
  )
}
