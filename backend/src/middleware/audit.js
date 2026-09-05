/**
 * Immutable activity log.
 *
 * Always called with the surrounding transaction client (`tx`) so an audit row
 * commits or rolls back with the mutation it describes — never independently.
 * Writing the log must never break the request, so failures are swallowed and
 * logged rather than thrown.
 */

export const AUDIT_ACTIONS = Object.freeze({
  // auth
  user_registered: 'user_registered',
  user_logged_in: 'user_logged_in',
  user_updated: 'user_updated',
  user_archived: 'user_archived',
  user_unarchived: 'user_unarchived',
  password_reset: 'password_reset',

  // master data
  contact_created: 'contact_created',
  contact_updated: 'contact_updated',
  contact_archived: 'contact_archived',
  product_created: 'product_created',
  product_updated: 'product_updated',
  product_archived: 'product_archived',
  account_created: 'account_created',
  account_updated: 'account_updated',
  account_archived: 'account_archived',
  journal_created: 'journal_created',
  journal_updated: 'journal_updated',
  tax_created: 'tax_created',
  currency_created: 'currency_created',
  currency_rate_set: 'currency_rate_set',
  analytic_account_created: 'analytic_account_created',
  budget_created: 'budget_created',
  budget_updated: 'budget_updated',

  // ledger
  journal_entry_posted: 'journal_entry_posted',
  journal_entry_reversed: 'journal_entry_reversed',

  // documents
  purchase_order_created: 'purchase_order_created',
  purchase_order_confirmed: 'purchase_order_confirmed',
  vendor_bill_created: 'vendor_bill_created',
  vendor_bill_posted: 'vendor_bill_posted',
  sales_order_created: 'sales_order_created',
  sales_order_confirmed: 'sales_order_confirmed',
  customer_invoice_created: 'customer_invoice_created',
  customer_invoice_posted: 'customer_invoice_posted',
  payment_posted: 'payment_posted',

  // inventory
  stock_move_created: 'stock_move_created',
  stock_adjustment_posted: 'stock_adjustment_posted',
})

/**
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 */
/**
 * `tx` is almost always an interactive-transaction client, where a failed
 * statement poisons the whole transaction at the Postgres level — a plain
 * JS try/catch here does NOT undo that, so a swallowed audit-log error would
 * silently doom the real mutation's COMMIT while the route still reports
 * success. A SAVEPOINT is what actually makes "this one write may fail
 * without touching the rest of the transaction" true at the SQL level.
 */
export const writeAuditLog = async (tx, payload) => {
  const savepoint = `audit_${Math.random().toString(36).slice(2, 10)}`
  try {
    await tx.$executeRawUnsafe(`SAVEPOINT "${savepoint}"`)
    const { action, entity_type, entity_id, old_value, new_value, performed_by } = payload
    await tx.auditLog.create({
      data: {
        action,
        entityType: entity_type,
        entityId: entity_id ?? null,
        oldValue: old_value ?? null,
        newValue: new_value ?? null,
        performedBy: performed_by ?? null,
      },
    })
  } catch (err) {
    console.error('[audit] failed to write log:', err.message)
    try {
      await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT "${savepoint}"`)
    } catch (rollbackErr) {
      console.error('[audit] failed to roll back to savepoint:', rollbackErr.message)
    }
  }
}
