'use client'

import { ControlPanel } from '@/components/layout/ControlPanel'
import { ProductForm } from '@/components/products/ProductForm'

export default function NewProductPage() {
  return (
    <div className="flex h-full flex-col">
      <ControlPanel breadcrumb="Product" title="New Product" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <ProductForm />
      </div>
    </div>
  )
}
