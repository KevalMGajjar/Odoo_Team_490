'use client'

import { useParams, useRouter } from 'next/navigation'
import { ControlPanel } from '@/components/layout/ControlPanel'
import { ProductForm } from '@/components/products/ProductForm'
import { Skeleton } from '@/components/ui/Skeleton'
import { useApiGet } from '@/lib/useApi'

export default function ProductDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const { data: product, loading, error } = useApiGet(`/products/${id}`)

  return (
    <div className="flex h-full flex-col">
      <ControlPanel breadcrumb="Product" title={loading ? 'Loading…' : product?.name} />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {loading ? (
          <div className="form-sheet"><Skeleton className="h-64" /></div>
        ) : error ? (
          <div className="form-sheet">
            <p className="text-sm text-state-overdue">Product not found.</p>
            <button className="btn-secondary btn-sm mt-3" onClick={() => router.push('/products')}>Back to Products</button>
          </div>
        ) : (
          <ProductForm product={product} />
        )}
      </div>
    </div>
  )
}
