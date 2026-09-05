'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ReportShell, ReportFilterField, ReportTable } from '@/components/reports/ReportShell'
import { Select } from '@/components/ui/FormField'
import { useApiGet } from '@/lib/useApi'
import { formatMoney, formatDate } from '@/lib/format'
import { downloadCsv } from '@/lib/downloadCsv'

const VOUCHER_TYPES = ['BReceipt', 'BPayment', 'CReceipt', 'CPayment', 'Journal']

/**
 * The flat voucher projection: date, voucher_no, voucher_type, accountid,
 * amount, reference, narration. SIGN CONVENTION: amount = credit − debit,
 * so a positive figure is a credit and a negative one is a debit.
 */
export default function TransactionsPage() {
  const [voucherType, setVoucherType] = useState('')
  const [range, setRange] = useState({ from: '', to: '' })
  const { data, loading } = useApiGet('/reports/transactions', {
    voucherType: voucherType || undefined, from: range.from || undefined, to: range.to || undefined, limit: 300,
  })

  const cols = [
    { key: 'date', header: 'Date', render: (r) => formatDate(r.date) },
    { key: 'voucher', header: 'Voucher', render: (r) => (
      <Link href={`/journal-entries/${r.entry_id}`} className="text-secondary hover:underline">{r.voucher_type} #{r.voucher_no}</Link>
    ) },
    { key: 'account_name', header: 'Account' },
    {
      key: 'amount', header: 'Amount (Cr +/Dr −)', align: 'right',
      render: (r) => (
        <span className={Number(r.amount) >= 0 ? 'text-ledger-credit' : 'text-ledger-debit'}>{formatMoney(r.amount, { signed: true })}</span>
      ),
    },
    { key: 'reference', header: 'Reference', render: (r) => r.reference || '—' },
    { key: 'narration', header: 'Narration', render: (r) => r.narration || '—' },
  ]

  return (
    <ReportShell
      title="Transactions"
      loading={loading}
      onExportCsv={() => downloadCsv('/reports/transactions', { voucherType, ...range }, 'transactions.csv')}
      filters={
        <>
          <ReportFilterField label="Voucher Type">
            <Select value={voucherType} onChange={(e) => setVoucherType(e.target.value)}>
              <option value="">All</option>
              {VOUCHER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </ReportFilterField>
          <ReportFilterField label="From">
            <input type="date" className="field-input" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
          </ReportFilterField>
          <ReportFilterField label="To">
            <input type="date" className="field-input" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
          </ReportFilterField>
        </>
      }
    >
      {data && <ReportTable columns={cols} rows={data.rows} emptyText="No vouchers match this filter." />}
    </ReportShell>
  )
}
