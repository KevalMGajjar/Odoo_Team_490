'use client'

import { CheckCircle2, XCircle, MinusCircle } from 'lucide-react'
import { ControlPanel } from '@/components/layout/ControlPanel'
import { Skeleton } from '@/components/ui/Skeleton'
import { useApiGet } from '@/lib/useApi'

/**
 * Green/amber/red for every dependency (PLAN.md §12b) — proves the
 * graceful-degradation story in five seconds: the app runs on the database
 * alone, and Odoo / the AI agent are optional extras.
 */
export default function HealthPage() {
  const { data, loading, reload } = useApiGet('/health')

  return (
    <div className="flex h-full flex-col">
      <ControlPanel breadcrumb="Admin" title="System Health" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="form-sheet max-w-[720px]">
          {loading ? (
            <Skeleton className="h-48" />
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between">
                <p className="text-xl font-semibold text-ink">
                  {data?.status === 'ok' ? 'All systems operational' : 'Degraded'}
                </p>
                <button onClick={reload} className="btn-secondary btn-sm">Refresh</button>
              </div>
              <div className="space-y-2">
                <HealthRow name="Database" check={data?.checks?.database} required />
                <HealthRow name="Odoo ERP" check={data?.checks?.erp} />
                <HealthRow name="AI Agent" check={data?.checks?.ai} />
              </div>
              <p className="mt-4 text-xs text-ink-faint">
                Uptime: {data?.uptimeSec ? `${Math.floor(data.uptimeSec / 60)}m ${data.uptimeSec % 60}s` : '—'}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function HealthRow({ name, check, required }) {
  const status = check?.status
  const Icon = status === 'up' || status === 'configured' ? CheckCircle2 : status === 'down' ? XCircle : MinusCircle
  const tone = status === 'up' || status === 'configured' ? 'text-state-paid' : status === 'down' ? 'text-state-overdue' : 'text-ink-faint'

  return (
    <div className="flex items-center justify-between rounded border border-line px-4 py-3">
      <div className="flex items-center gap-2">
        <Icon size={16} className={tone} />
        <span className="text-sm font-medium text-ink">{name}</span>
        {required && <span className="text-xs text-ink-faint">(required)</span>}
      </div>
      <div className="text-right text-xs text-ink-muted">
        <p className={tone + ' font-medium'}>{status ?? 'unknown'}</p>
        {check?.detail && <p className="text-ink-faint">{check.detail}</p>}
        {check?.latencyMs != null && <p className="text-ink-faint">{check.latencyMs}ms</p>}
      </div>
    </div>
  )
}
