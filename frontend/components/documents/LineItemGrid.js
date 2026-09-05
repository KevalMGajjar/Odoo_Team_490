'use client'

import { Plus, Trash2 } from 'lucide-react'
import { SearchSelect } from '@/components/ui/SearchSelect'
import { formatMoney } from '@/lib/format'

/**
 * Editable inline table for product-based document lines — Purchase/Sales
 * Orders, Vendor Bills, Customer Invoices (UI.md §5.4). Subtotal is always
 * computed client-side for display only; the server recomputes it from
 * quantity x unit price and ignores anything sent — a tampered payload
 * can't move money.
 *
 * `showAccountColumn` — a PO/SO is a commitment, not an accounting document
 * (it never touches an account, per transactions.js), so Purchase/Sales
 * Order screens pass `false`; Bill/Invoice screens leave it `true` since
 * their lines already carry a real accountId, defaulted from the product.
 */
export function LineItemGrid({ lines, onChange, disabled, showAccountColumn = true }) {
  const update = (idx, patch) => onChange(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  const addLine = () => onChange([...lines, blankProductLine()])
  const removeLine = (idx) => onChange(lines.filter((_, i) => i !== idx))

  const pickProduct = (idx, product) => {
    update(idx, {
      productId: product?.id ?? '',
      product,
      unitPrice: product ? String(product.salesPrice ?? product.cost ?? '0') : lines[idx].unitPrice,
      taxRate: product ? String(product.gstRate ?? '0') : lines[idx].taxRate,
    })
  }

  const totals = lines.reduce(
    (acc, l) => {
      const qty = Number(l.quantity) || 0
      const price = Number(l.unitPrice) || 0
      const rate = Number(l.taxRate) || 0
      const subtotal = qty * price
      acc.untaxed += subtotal
      acc.tax += (subtotal * rate) / 100
      return acc
    },
    { untaxed: 0, tax: 0 },
  )
  const total = totals.untaxed + totals.tax

  return (
    <div className="rounded border border-line">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead className="bg-surface-subtle">
            <tr>
              <th className="w-10 px-2 py-2 text-left text-xs font-semibold uppercase text-ink-muted">Sr</th>
              <th className="px-2 py-2 text-left text-xs font-semibold uppercase text-ink-muted">Product</th>
              {showAccountColumn && <th className="px-2 py-2 text-left text-xs font-semibold uppercase text-ink-muted">Chart of Account</th>}
              <th className="px-2 py-2 text-left text-xs font-semibold uppercase text-ink-muted">Budget Analytics</th>
              <th className="w-24 px-2 py-2 text-right text-xs font-semibold uppercase text-ink-muted">Qty</th>
              <th className="w-32 px-2 py-2 text-right text-xs font-semibold uppercase text-ink-muted">Unit Price</th>
              <th className="w-20 px-2 py-2 text-right text-xs font-semibold uppercase text-ink-muted">Tax %</th>
              <th className="w-32 px-2 py-2 text-right text-xs font-semibold uppercase text-ink-muted">Subtotal</th>
              {!disabled && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => {
              const subtotal = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0)
              return (
                <tr key={line._key ?? line.id ?? idx} className="border-b border-line last:border-b-0">
                  <td className="px-2 py-1.5 text-ink-faint tabular">{idx + 1}</td>
                  <td className="px-2 py-1.5">
                    <SearchSelect
                      path="/products"
                      value={line.productId}
                      resolvedOption={line.product}
                      onChange={(p) => pickProduct(idx, p)}
                      placeholder="Select product"
                      disabled={disabled}
                    />
                  </td>
                  {showAccountColumn && (
                    <td className="px-2 py-1.5">
                      <SearchSelect
                        path="/accounts"
                        value={line.accountId}
                        resolvedOption={line.account}
                        onChange={(opt) => update(idx, { accountId: opt?.id ?? '', account: opt })}
                        getLabel={(o) => `${o.code} ${o.name}`}
                        placeholder="Default account"
                        disabled={disabled}
                      />
                    </td>
                  )}
                  <td className="px-2 py-1.5">
                    <SearchSelect
                      path="/analytic-accounts"
                      value={line.analyticAccountId}
                      resolvedOption={line.analyticAccount}
                      onChange={(opt) => update(idx, { analyticAccountId: opt?.id ?? '', analyticAccount: opt })}
                      placeholder="Optional"
                      disabled={disabled}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number" step="1" min="0"
                      className="field-input text-right tabular"
                      value={line.quantity}
                      onChange={(e) => update(idx, { quantity: e.target.value })}
                      disabled={disabled}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number" step="1" min="0"
                      className="field-input text-right tabular"
                      value={line.unitPrice}
                      onChange={(e) => update(idx, { unitPrice: e.target.value })}
                      disabled={disabled}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number" step="0.01" min="0"
                      className="field-input text-right tabular bg-surface-subtle text-ink-muted"
                      value={line.taxRate}
                      readOnly
                      disabled={disabled}
                      title="Set from the product's GST rate"
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right tabular text-ink">{formatMoney(subtotal)}</td>
                  {!disabled && (
                    <td className="px-2 py-1.5">
                      <button type="button" onClick={() => removeLine(idx)} className="p-1 text-ink-faint hover:text-state-overdue">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {!disabled && (
        <button
          type="button"
          onClick={addLine}
          className="flex w-full items-center gap-1.5 border-t border-dashed border-line px-3 py-2 text-xs text-ink-faint hover:bg-surface-hover hover:text-secondary"
        >
          <Plus size={12} /> Add a line
        </button>
      )}

      <div className="flex justify-end border-t border-line px-4 py-3">
        <div className="w-56 space-y-1 text-sm">
          <div className="flex justify-between text-ink-muted">
            <span>Untaxed</span><span className="tabular">{formatMoney(totals.untaxed)}</span>
          </div>
          <div className="flex justify-between text-ink-muted">
            <span>Tax</span><span className="tabular">{formatMoney(totals.tax)}</span>
          </div>
          <div className="flex justify-between border-t border-line pt-1 text-md font-semibold text-ink">
            <span>Total</span><span className="tabular">{formatMoney(total)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function blankProductLine() {
  return {
    _key: Math.random().toString(36).slice(2),
    productId: '', product: null,
    accountId: '', account: null,
    analyticAccountId: '', analyticAccount: null,
    quantity: '1', unitPrice: '0', taxRate: '0',
  }
}
