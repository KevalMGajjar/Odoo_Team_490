/**
 * Sidebar structure — regrouped as Sales / Purchase / Account / Report to
 * match the exact Odoo-style menu naming from the wireframes, while keeping
 * the existing collapsible-group sidebar mechanics (no layout change). Every
 * screen the app has that the wireframe doesn't explicitly name lives under
 * Account or Report, grouped sensibly rather than dumped flat. Each group is
 * role-filtered at render time (an accountant never sees ADMIN; a portal
 * user gets an entirely different sidebar built separately in the portal layout).
 */

export const NAV = [
  {
    section: 'SALES',
    flat: true,
    items: [
      { label: 'Sales order', href: '/sales-orders' },
      { label: 'Sale Invoice', href: '/invoices' },
      { label: 'Receipt', href: '/payments-received' },
    ],
  },
  {
    section: 'PURCHASE',
    flat: true,
    items: [
      { label: 'Purchase Order', href: '/purchase-orders' },
      { label: 'Purchase Bill', href: '/bills' },
      { label: 'Payment', href: '/payments-made' },
    ],
  },
  {
    section: 'ACCOUNT',
    groups: [
      {
        label: 'Masters',
        icon: 'folder',
        items: [
          { label: 'Contact', href: '/contacts' },
          { label: 'Product', href: '/products' },
          { label: 'Product Categories', href: '/product-categories' },
          { label: 'Analyticals', href: '/analytic-accounts' },
          { label: 'Chart of Account', href: '/accounts' },
          { label: 'Journals', href: '/journals' },
          { label: 'Taxes', href: '/taxes' },
          { label: 'Currencies', href: '/currencies' },
        ],
      },
      {
        label: 'Entries',
        icon: 'folder',
        items: [
          { label: 'Journal Entries', href: '/journal-entries' },
          { label: 'Journal Voucher', href: '/vouchers/journal' },
          { label: 'Analytical Budget', href: '/budgets' },
        ],
      },
      {
        label: 'Bank & Cash',
        icon: 'folder',
        items: [
          { label: 'Bank Receipt', href: '/vouchers/bank-receipt' },
          { label: 'Bank Payment', href: '/vouchers/bank-payment' },
          { label: 'Cash Receipt', href: '/vouchers/cash-receipt' },
          { label: 'Cash Payment', href: '/vouchers/cash-payment' },
        ],
      },
      {
        label: 'Stock',
        icon: 'folder',
        items: [
          { label: 'Stock Moves', href: '/stock-moves' },
          { label: 'Stock Adjustments', href: '/stock-adjustments' },
        ],
      },
    ],
  },
  {
    section: 'REPORT',
    flat: true,
    items: [
      { label: 'Balancesheet', href: '/reports/balance-sheet' },
      { label: 'Profit and Loss', href: '/reports/profit-loss' },
      { label: 'Budget Report', href: '/reports/budget' },
      { label: 'Trial Balance', href: '/reports/trial-balance' },
      { label: 'Inventory Valuation', href: '/reports/inventory-valuation' },
      { label: 'General Ledger', href: '/reports/general-ledger' },
      { label: 'Transactions', href: '/reports/transactions' },
    ],
  },
  {
    section: 'ADMIN',
    flat: true,
    adminOnly: true,
    items: [
      { label: 'Users', href: '/users' },
      { label: 'Audit Log', href: '/audit' },
      { label: 'Odoo Sync', href: '/odoo-sync' },
      { label: 'Health', href: '/health' },
    ],
  },
]

/** Portal (contact role) gets a completely different, minimal sidebar. */
export const PORTAL_NAV = [
  {
    section: 'MY ACCOUNT',
    flat: true,
    items: [
      { label: 'My Documents', href: '/portal' },
    ],
  },
]

/** Filter the nav tree by role — an `accountant` never sees ADMIN. */
export function navForRole(role) {
  return NAV.filter((section) => !section.adminOnly || role === 'admin')
}
