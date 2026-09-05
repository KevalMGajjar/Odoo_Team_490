'use client'

import { useState } from 'react'
import { RefreshCw, UploadCloud, ArrowLeftRight, CheckCircle2, XCircle } from 'lucide-react'
import { ControlPanel } from '@/components/layout/ControlPanel'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DataTable } from '@/components/ui/DataTable'
import { Skeleton } from '@/components/ui/Skeleton'
import { useApiGet } from '@/lib/useApi'
import { useToast } from '@/components/ui/Toast'
import { api, ApiError } from '@/lib/api'
import { formatMoney, formatDate } from '@/lib/format'
import { useGuardedAction } from '@/lib/useGuardedAction'

/**
 * One-directional, manually-triggered mirror to a live Odoo instance —
 * PLAN.md's own resilience principle: our ledger is always the source of
 * truth, Odoo is a best-effort demo mirror. Every action here is explicit
 * so the sync is something you can point at and explain, not invisible
 * background plumbing.
 */
export default function OdooSyncPage() {
  const { push } = useToast()
  const { data: status, loading: statusLoading, reload: reloadStatus, error: statusError } = useApiGet('/odoo/status')
  const { data: entriesData, loading: entriesLoading, reload: reloadEntries } = useApiGet('/odoo/entries', undefined, { skip: Boolean(statusError) })
  const [syncingRow, setSyncingRow] = useState(null)
  const [comparison, setComparison] = useState(null)

  const reloadAll = () => { reloadStatus(); reloadEntries() }

  if (statusError instanceof ApiError && statusError.status === 503) {
    return (
      <div className="flex h-full flex-col">
        <ControlPanel breadcrumb="Admin" title="Odoo Sync" />
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="form-sheet max-w-[560px] text-center">
            <p className="text-sm font-medium text-ink">Odoo integration is disabled</p>
            <p className="mt-1 text-xs text-ink-faint">
              Set ERP_ENABLED=true in the backend .env and point ERP_BASE_URL at a running Odoo
              instance to enable this. The app is fully functional without it.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const [syncMasters, syncingMasters] = useGuardedAction(async () => {
    try {
      const res = await api.post('/odoo/sync-masters')
      const total = Object.values(res.counts).reduce((a, b) => a + b, 0)
      push(`Synced ${total} master records to Odoo`, { type: 'success' })
      reloadAll()
    } catch (err) {
      push(err.message || 'Master sync failed', { type: 'error' })
    }
  })

  const [syncAllEntries, syncingAll] = useGuardedAction(async () => {
    try {
      const res = await api.post('/odoo/sync-all-entries')
      if (res.total === 0) {
        push('Nothing to sync — every posted entry is already mirrored', { type: 'info' })
      } else if (res.succeeded === res.total) {
        push(`Synced ${res.succeeded} of ${res.total} entries to Odoo`, { type: 'success' })
      } else {
        push(`Synced ${res.succeeded} of ${res.total} entries — ${res.total - res.succeeded} failed`, { type: 'error' })
      }
      reloadAll()
    } catch (err) {
      push(err.message || 'Bulk sync failed', { type: 'error' })
    }
  })

  const syncOne = async (id) => {
    setSyncingRow(id)
    try {
      await api.post(`/odoo/sync-entry/${id}`)
      push('Entry synced to Odoo', { type: 'success' })
      reloadAll()
    } catch (err) {
      push(err.message || 'Sync failed', { type: 'error' })
    } finally {
      setSyncingRow(null)
    }
  }

  const [compareTrialBalance, comparing] = useGuardedAction(async () => {
    try {
      const [ours, theirs] = await Promise.all([
        api.get('/reports/trial-balance'),
        api.get('/odoo/trial-balance'),
      ])
      const byName = new Map(theirs.rows.map((r) => [r.account, r]))
      const rows = ours.rows.map((r) => {
        const odoo = byName.get(r.name)
        const match = odoo && Math.abs(Number(r.debit) - odoo.debit) < 0.005 && Math.abs(Number(r.credit) - odoo.credit) < 0.005
        return { ...r, odooDebit: odoo?.debit ?? null, odooCredit: odoo?.credit ?? null, match: Boolean(match) }
      })
      setComparison(rows)
      const mismatches = rows.filter((r) => !r.match).length
      push(mismatches === 0 ? 'Ledgers match to the paisa across every account' : `${mismatches} account(s) differ from Odoo`, {
        type: mismatches === 0 ? 'success' : 'error',
      })
    } catch (err) {
      push(err.message || 'Could not fetch Odoo trial balance', { type: 'error' })
    }
  })

  const columns = [
    { key: 'number', header: 'Entry', render: (r) => <span className="font-mono text-xs">{r.number}</span> },
    { key: 'date', header: 'Date', render: (r) => formatDate(r.date) },
    { key: 'narration', header: 'Narration', hideOnMobile: true, render: (r) => <span className="text-ink-muted">{r.narration ?? '—'}</span> },
    {
      key: 'odooSyncStatus', header: 'Odoo Status',
      render: (r) => (
        <div>
          <StatusBadge status={r.odooSyncStatus} />
          {r.odooMoveId && <p className="mt-0.5 text-[11px] text-ink-faint">move #{r.odooMoveId}</p>}
          {r.odooSyncError && <p className="mt-0.5 max-w-[220px] truncate text-[11px] text-state-overdue" title={r.odooSyncError}>{r.odooSyncError}</p>}
        </div>
      ),
    },
    {
      key: 'action', header: '', sortable: false,
      render: (r) => (
        <Button size="sm" variant="ghost" loading={syncingRow === r.id} onClick={() => syncOne(r.id)}>
          {r.odooSyncStatus === 'synced' ? 'Re-sync' : 'Sync'}
        </Button>
      ),
    },
  ]

  return (
    <div className="flex h-full flex-col">
      <ControlPanel
        breadcrumb="Admin"
        title="Odoo Sync"
        actions={
          <>
            <Button variant="secondary" size="sm" icon={UploadCloud} loading={syncingMasters} onClick={syncMasters}>
              Sync Masters
            </Button>
            <Button variant="primary" size="sm" icon={ArrowLeftRight} loading={syncingAll} onClick={syncAllEntries}>
              Sync All Entries
            </Button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {/* connection + counts */}
        {statusLoading ? (
          <Skeleton className="h-20" />
        ) : (
          <div className="form-sheet flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              {status?.reachable ? <CheckCircle2 size={16} className="text-state-paid" /> : <XCircle size={16} className="text-state-overdue" />}
              <span className="text-sm font-medium text-ink">{status?.reachable ? 'Connected to Odoo' : 'Odoo unreachable'}</span>
              {status?.latencyMs != null && <span className="text-xs text-ink-faint">{status.latencyMs}ms</span>}
            </div>
            <Stat label="Not synced" value={status?.counts?.unsynced} tone="text-ink" />
            <Stat label="Synced" value={status?.counts?.synced} tone="text-state-paid" />
            <Stat label="Failed" value={status?.counts?.failed} tone="text-state-overdue" />
            <button onClick={reloadAll} className="ml-auto text-ink-faint hover:text-ink" title="Refresh">
              <RefreshCw size={15} />
            </button>
          </div>
        )}

        {/* trial balance cross-check — the demo payoff */}
        <div className="form-sheet">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-ink">Trial Balance Cross-Check</p>
              <p className="text-xs text-ink-faint">Pulls Odoo&apos;s own trial balance live and compares it to ours, account by account.</p>
            </div>
            <Button variant="secondary" size="sm" loading={comparing} onClick={compareTrialBalance}>Compare Now</Button>
          </div>

          {comparison && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase text-ink-faint">
                    <th className="py-1.5 pr-3 font-medium">Account</th>
                    <th className="py-1.5 px-3 text-right font-medium">Our Debit</th>
                    <th className="py-1.5 px-3 text-right font-medium">Our Credit</th>
                    <th className="py-1.5 px-3 text-right font-medium">Odoo Debit</th>
                    <th className="py-1.5 px-3 text-right font-medium">Odoo Credit</th>
                    <th className="py-1.5 pl-3 text-center font-medium">Match</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.map((r) => (
                    <tr key={r.accountId} className="h-8 border-b border-line/60">
                      <td className="pr-3 text-ink">{r.code} · {r.name}</td>
                      <td className="px-3 text-right tabular text-ink-muted">{formatMoney(r.debit)}</td>
                      <td className="px-3 text-right tabular text-ink-muted">{formatMoney(r.credit)}</td>
                      <td className="px-3 text-right tabular text-ink-muted">{r.odooDebit != null ? formatMoney(r.odooDebit) : '—'}</td>
                      <td className="px-3 text-right tabular text-ink-muted">{r.odooCredit != null ? formatMoney(r.odooCredit) : '—'}</td>
                      <td className="pl-3 text-center">
                        {r.match ? <CheckCircle2 size={14} className="mx-auto text-state-paid" /> : <XCircle size={14} className="mx-auto text-state-overdue" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* per-entry sync status */}
        <div className="rounded border border-line">
          <DataTable
            columns={columns}
            rows={entriesData?.rows ?? []}
            loading={entriesLoading}
            emptyTitle="No posted entries yet."
          />
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, tone }) {
  return (
    <div>
      <p className="text-[11px] uppercase text-ink-faint">{label}</p>
      <p className={`text-lg font-semibold tabular ${tone}`}>{value ?? '—'}</p>
    </div>
  )
}
