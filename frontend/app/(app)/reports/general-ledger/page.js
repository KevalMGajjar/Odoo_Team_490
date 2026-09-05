'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ReportShell, ReportFilterField, ReportTable } from '@/components/reports/ReportShell'
import { SearchSelect } from '@/components/ui/SearchSelect'
import { useApiGet } from '@/lib/useApi'
import { formatMoney, formatDate } from '@/lib/format'
import { downloadCsv } from '@/lib/downloadCsv'
import Link from 'next/link'

/**
 * useSearchParams() requires a Suspense boundary in the App Router — without
 * one this fails a production build even though dev mode lets it slide.
 */
export default function GeneralLedgerPage() {
  return (
    <Suspense fallback={<ReportShell title="General Ledger" loading />}>
      <GeneralLedgerContent />
    </Suspense>
  )
}

function GeneralLedgerContent() {
  const params = useSearchParams()
  const [account, setAccount] = useState(null)
  const [range, setRange] = useState(() => ({ from: params.get('from') || '', to: params.get('to') || '' }))

  const accountId = account?.id || params.get('accountId') || undefined
  const { data, loading } = useApiGet('/reports/general-ledger', {
    accountId, from: range.from || undefined, to: range.to || undefined, limit: 500,
  }, { skip: !accountId })

  // resolve the account name if we only have the id from the URL
  useEffect(() => {
    const idFromUrl = params.get('accountId')
    if (idFromUrl && !account) {
      import('@/lib/api').then(({ api }) => api.get(`/accounts/${idFromUrl}`).then(setAccount).catch(() => {}))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cols = [
    { key: 'date', header: 'Date', render: (r) => formatDate(r.date) },
    { key: 'entryNumber', header: 'Entry', render: (r) => <Link href={`/journal-entries/${r.entryId}`} className="text-secondary hover:underline">{r.voucher || r.entryNumber}</Link> },
    { key: 'partner', header: 'Partner', render: (r) => r.partner?.name ?? '—' },
    { key: 'narration', header: 'Narration', render: (r) => r.narration || r.label || '—' },
    { key: 'debit', header: 'Debit', align: 'right', render: (r) => (Number(r.debit) ? formatMoney(r.debit) : '—') },
    { key: 'credit', header: 'Credit', align: 'right', render: (r) => (Number(r.credit) ? formatMoney(r.credit) : '—') },
    { key: 'runningBalance', header: 'Balance', align: 'right', render: (r) => <span className="font-medium">{formatMoney(r.runningBalance)}</span> },
  ]

  return (
    <ReportShell
      title="General Ledger"
      loading={loading}
      onExportCsv={accountId ? () => downloadCsv('/reports/general-ledger', { accountId, ...range }, 'general-ledger.csv') : undefined}
      filters={
        <>
          <ReportFilterField label="Account">
            <SearchSelect
              path="/accounts"
              resolvedOption={account}
              onChange={setAccount}
              getLabel={(o) => `${o.code} ${o.name}`}
              placeholder="Select an account"
            />
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
      {!accountId ? (
        <p className="text-sm text-ink-muted">Select an account to view its ledger.</p>
      ) : data && (
        <>
          <div className="mb-3 flex gap-4 text-sm text-ink-muted">
            <span>Opening <span className="tabular font-medium text-ink">{formatMoney(data.opening)}</span></span>
            <span>Closing <span className="tabular font-medium text-ink">{formatMoney(data.closing)}</span></span>
          </div>
          <ReportTable columns={cols} rows={data.rows} emptyText="No movement in this period." />
        </>
      )}
    </ReportShell>
  )
}
