'use client'

import { Plus, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { SearchSelect } from '@/components/ui/SearchSelect'
import { formatMoney } from '@/lib/format'

/**
 * THE SIGNATURE SCREEN (UI.md §5.5).
 *
 * Account · Partner · Analytic · Label · Debit · Credit, with a sticky
 * footer that runs Σdebit/Σcredit live as the user types. This live
 * indicator IS the mockup's blocking-warning callout — never an
 * alert-on-save. Rounded to 2dp before comparing so a float epsilon from
 * summing many rows client-side can never show a false imbalance.
 */
export function DebitCreditGrid({ items, onChange, disabled }) {
  const totalDebit = round2(items.reduce((s, i) => s + (Number(i.debit) || 0), 0))
  const totalCredit = round2(items.reduce((s, i) => s + (Number(i.credit) || 0), 0))
  const difference = round2(totalDebit - totalCredit)
  const balanced = difference === 0 && totalDebit > 0

  const update = (idx, patch) => {
    const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it))
    onChange(next)
  }

  const setAmount = (idx, field, raw) => {
    const value = raw === '' ? '' : raw
    // typing a debit clears credit on the same line and vice versa —
    // "a line cannot have both", enforced here as well as server-side
    update(idx, field === 'debit' ? { debit: value, credit: value ? '' : items[idx].credit } : { credit: value, debit: value ? '' : items[idx].debit })
  }

  const addRow = () => onChange([...items, blankRow()])
  const removeRow = (idx) => onChange(items.length > 2 ? items.filter((_, i) => i !== idx) : items)

  return (
    <div className="rounded border border-line">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead className="bg-surface-subtle">
            <tr>
              <Th>Account</Th>
              <Th>Partner</Th>
              <Th>Analytic</Th>
              <Th>Label</Th>
              <Th align="right" tone="debit">Debit</Th>
              <Th align="right" tone="credit">Credit</Th>
              <Th width={32} />
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item._key} className="border-b border-line last:border-b-0">
                <Td>
                  <SearchSelect
                    path="/accounts"
                    value={item.accountId}
                    resolvedOption={item.account}
                    onChange={(opt) => update(idx, { accountId: opt?.id ?? '', account: opt })}
                    getLabel={(o) => `${o.code} ${o.name}`}
                    placeholder="Select account"
                    disabled={disabled}
                  />
                </Td>
                <Td>
                  <SearchSelect
                    path="/contacts"
                    value={item.partnerId}
                    resolvedOption={item.partner}
                    onChange={(opt) => update(idx, { partnerId: opt?.id ?? '', partner: opt })}
                    placeholder="Optional"
                    disabled={disabled}
                  />
                </Td>
                <Td>
                  <SearchSelect
                    path="/analytic-accounts"
                    value={item.analyticAccountId}
                    resolvedOption={item.analyticAccount}
                    onChange={(opt) => update(idx, { analyticAccountId: opt?.id ?? '', analyticAccount: opt })}
                    placeholder="Optional"
                    disabled={disabled}
                  />
                </Td>
                <Td>
                  <input
                    className="field-input"
                    value={item.label ?? ''}
                    onChange={(e) => update(idx, { label: e.target.value })}
                    disabled={disabled}
                  />
                </Td>
                <Td>
                  <input
                    type="number"
                    step="0.01"
                    className="field-input text-right tabular text-ledger-debit"
                    value={item.debit}
                    onChange={(e) => setAmount(idx, 'debit', e.target.value)}
                    disabled={disabled}
                    placeholder="0.00"
                  />
                </Td>
                <Td>
                  <input
                    type="number"
                    step="0.01"
                    className="field-input text-right tabular text-ledger-credit"
                    value={item.credit}
                    onChange={(e) => setAmount(idx, 'credit', e.target.value)}
                    disabled={disabled}
                    placeholder="0.00"
                  />
                </Td>
                <Td>
                  {!disabled && (
                    <button type="button" onClick={() => removeRow(idx)} className="p-1 text-ink-faint hover:text-state-overdue">
                      <Trash2 size={13} />
                    </button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!disabled && (
        <button
          type="button"
          onClick={addRow}
          className="flex w-full items-center gap-1.5 border-t border-dashed border-line px-3 py-2 text-xs text-ink-faint hover:bg-surface-hover hover:text-secondary"
        >
          <Plus size={12} /> Add a line
        </button>
      )}

      {/* sticky live balance footer — the mockup's blocking-warning callout */}
      <div
        className={
          'flex flex-wrap items-center justify-end gap-x-6 gap-y-1 border-t px-4 py-2.5 text-sm ' +
          (totalDebit === 0 && totalCredit === 0
            ? 'border-line bg-surface-subtle'
            : balanced
              ? 'border-state-paid/30 bg-state-paid/5'
              : 'border-state-overdue/30 bg-state-overdue/8')
        }
      >
        <span className="text-ink-muted">Σ Debit <span className="tabular font-semibold text-ledger-debit">{formatMoney(totalDebit)}</span></span>
        <span className="text-ink-muted">Σ Credit <span className="tabular font-semibold text-ledger-credit">{formatMoney(totalCredit)}</span></span>
        {totalDebit === 0 && totalCredit === 0 ? null : balanced ? (
          <span className="flex items-center gap-1 font-medium text-state-paid">
            <CheckCircle2 size={14} /> Balanced
          </span>
        ) : (
          <span className="flex items-center gap-1 font-medium text-state-overdue" title="The entry cannot be posted until debit equals credit">
            <AlertTriangle size={14} /> Difference: {formatMoney(Math.abs(difference))}
          </span>
        )}
      </div>
    </div>
  )
}

export function blankRow() {
  return { _key: Math.random().toString(36).slice(2), accountId: '', partnerId: '', analyticAccountId: '', label: '', debit: '', credit: '' }
}

/** Exported so the parent screen's Post button can gate on the same rule the grid displays. */
export function gridIsBalanced(items) {
  const totalDebit = round2(items.reduce((s, i) => s + (Number(i.debit) || 0), 0))
  const totalCredit = round2(items.reduce((s, i) => s + (Number(i.credit) || 0), 0))
  return totalDebit === totalCredit && totalDebit > 0
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function Th({ children, align, width, tone }) {
  return (
    <th
      className={
        'whitespace-nowrap px-2 py-2 text-left text-xs font-semibold uppercase text-ink-muted ' +
        (align === 'right' ? 'text-right ' : '') +
        (tone === 'debit' ? 'text-ledger-debit ' : tone === 'credit' ? 'text-ledger-credit ' : '')
      }
      style={{ letterSpacing: '0.03em', width }}
    >
      {children}
    </th>
  )
}

function Td({ children }) {
  return <td className="px-2 py-1.5 align-top">{children}</td>
}
