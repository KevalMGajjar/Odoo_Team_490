import { formatMoney } from './format'

/**
 * Surfaces the server's non-blocking "Exceeds Approved Budget" check
 * (services/budget.js checkOverBudget) as toasts. Never blocks anything —
 * confirming/posting already succeeded by the time this runs.
 */
export function showBudgetWarnings(push, warnings) {
  for (const w of warnings ?? []) {
    push(
      `Exceeds Approved Budget: ${w.analyticAccountName} (${w.budgetName}) — committed ${formatMoney(w.committed)}, projected ${formatMoney(w.projected)}`,
      { type: 'info', duration: 8000 },
    )
  }
}
