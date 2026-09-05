'use client'

import Link from 'next/link'
import { TrendingUp, TrendingDown, Wallet, Package, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { ControlPanel } from '@/components/layout/ControlPanel'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useApiGet } from '@/lib/useApi'
import { useRealtimeEvents } from '@/lib/useSocket'
import { formatMoney, formatDate } from '@/lib/format'

/**
 * KPI strip + real worklists (UI.md §1 anti-brief: "generic KPI card grid as
 * the whole dashboard" is a tell — this pairs numbers with something
 * actionable underneath, not six cards and nothing else).
 */
export default function DashboardPage() {
  const { data, loading, reload } = useApiGet('/reports/dashboard')

  useRealtimeEvents({
    'invoice:posted': reload,
    'bill:posted': reload,
    'payment:posted': reload,
    'voucher:posted': reload,
    'journalEntry:posted': reload,
  })

  const k = data?.kpis
  const c = data?.counts

  return (
    <div className="flex h-full flex-col">
      <ControlPanel title="Dashboard" breadcrumb={formatDate(new Date())} />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label="Cash & Bank"
            value={k?.cashAndBank}
            icon={Wallet}
            loading={loading}
          />
          <Kpi
            label="Receivables"
            value={k?.receivables}
            icon={ArrowUpRight}
            tone="text-ledger-debit"
            loading={loading}
            href="/reports/general-ledger"
          />
          <Kpi
            label="Payables"
            value={k?.payables}
            icon={ArrowDownRight}
            tone="text-ledger-credit"
            loading={loading}
          />
          <Kpi
            label="Inventory Value"
            value={k?.stockValue}
            icon={Package}
            loading={loading}
            href="/reports/inventory-valuation"
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="rounded border border-line bg-surface-sheet p-4 lg:col-span-1">
            <p className="field-label mb-2">This Financial Year</p>
            {loading ? (
              <Skeleton className="h-20" />
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  {Number(k?.netProfitYtd) >= 0 ? (
                    <TrendingUp size={16} className="text-state-paid" />
                  ) : (
                    <TrendingDown size={16} className="text-state-overdue" />
                  )}
                  <span className={'text-xl font-semibold tabular ' + (Number(k?.netProfitYtd) >= 0 ? 'text-state-paid' : 'text-state-overdue')}>
                    {formatMoney(k?.netProfitYtd, { signed: true })}
                  </span>
                  <span className="text-xs text-ink-muted">net profit</span>
                </div>
                <div className="mt-2 flex items-center gap-4 text-xs text-ink-muted">
                  <span>Revenue <span className="tabular text-ink">{formatMoney(k?.revenueYtd)}</span></span>
                  <span>Margin <span className="tabular text-ink">{Number(k?.grossMarginPct ?? 0).toFixed(1)}%</span></span>
                </div>
              </>
            )}
          </div>

          <div className="rounded border border-line bg-surface-sheet p-4">
            <p className="field-label mb-2">Open Documents</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <WorkItem label="Unpaid Invoices" value={c?.openInvoices} href="/invoices?settleState=not_paid" />
              <WorkItem label="Unpaid Bills" value={c?.openBills} href="/bills?settleState=not_paid" />
              <WorkItem
                label="Overdue"
                value={c?.overdueInvoices}
                href="/invoices?overdue=1"
                tone={c?.overdueInvoices > 0 ? 'text-state-overdue' : undefined}
              />
            </div>
          </div>

          <div className="rounded border border-line bg-surface-sheet p-4">
            <p className="field-label mb-2">Self-Verifying Reports</p>
            <div className="flex flex-col gap-1.5 text-sm">
              <Link href="/reports/trial-balance" className="flex items-center justify-between text-secondary hover:underline">
                Trial Balance <span className="text-ink-faint">Σdebit = Σcredit</span>
              </Link>
              <Link href="/reports/balance-sheet" className="flex items-center justify-between text-secondary hover:underline">
                Balance Sheet <span className="text-ink-faint">Assets = L + E</span>
              </Link>
              <Link href="/reports/inventory-valuation" className="flex items-center justify-between text-secondary hover:underline">
                Inventory Valuation <span className="text-ink-faint">ties to ledger</span>
              </Link>
            </div>
          </div>
        </div>

        {/* recent activity worklist — real data, not a placeholder chart */}
        <div className="mt-4 rounded border border-line bg-surface-sheet">
          <div className="border-b border-line px-4 py-2.5">
            <p className="text-md font-semibold text-ink">Recent Ledger Activity</p>
          </div>
          {loading ? (
            <div className="p-4"><Skeleton className="h-40" /></div>
          ) : !data?.recentEntries?.length ? (
            <p className="p-4 text-sm text-ink-muted">No entries posted yet.</p>
          ) : (
            <div className="divide-y divide-line">
              {data.recentEntries.map((e) => (
                <Link
                  key={e.id}
                  href={`/journal-entries/${e.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-surface-hover"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <StatusBadge status="posted" />
                    <span className="truncate text-sm font-medium text-ink">
                      {e.voucherType ? `${e.voucherType} #${e.voucherNo}` : e.number}
                    </span>
                    <span className="hidden truncate text-xs text-ink-muted sm:inline">{e.narration}</span>
                  </div>
                  <span className="shrink-0 text-xs text-ink-faint tabular">{formatDate(e.date)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value, icon: Icon, tone, loading, href }) {
  const content = (
    <div className="rounded border border-line bg-surface-sheet p-4 transition-colors duration-150 hover:border-line-strong">
      <div className="flex items-center justify-between">
        <span className="field-label mb-0">{label}</span>
        <Icon size={14} className={tone ?? 'text-ink-faint'} />
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-6 w-24" />
      ) : (
        <p className={'mt-1 text-xl font-semibold tabular ' + (tone ?? 'text-ink')}>{formatMoney(value)}</p>
      )}
    </div>
  )
  return href ? <Link href={href}>{content}</Link> : content
}

function WorkItem({ label, value, href, tone }) {
  return (
    <Link href={href} className="block rounded p-1.5 hover:bg-surface-hover">
      <p className={'text-lg font-semibold tabular ' + (tone ?? 'text-ink')}>{value ?? 0}</p>
      <p className="text-[11px] text-ink-faint leading-tight">{label}</p>
    </Link>
  )
}
