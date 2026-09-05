/**
 * Sidebar structure — exactly UI.md §4's grouped tree. Each group is
 * role-filtered at render time (an accountant never sees ADMIN; a portal
 * user gets an entirely different sidebar built separately in the portal layout).
 */

export const NAV = [
  {
    section: 'MASTERS',
    groups: [
      {
        label: 'Account Masters',
        icon: 'folder',
        items: [
          { label: 'Chart of Accounts', href: '/accounts' },
          { label: 'Journals', href: '/journals' },
          { label: 'Taxes', href: '/taxes' },
          { label: 'Currencies', href: '/currencies' },
        ],
      },
      {
        label: 'Business Masters',
        icon: 'folder',
        items: [
          { label: 'Contacts', href: '/contacts' },
          { label: 'Products', href: '/products' },
          { label: 'Product Categories', href: '/product-categories' },
          { label: 'Analytic Accounts', href: '/analytic-accounts' },
        ],
      },
    ],
  },
  {
    section: 'TRANSACTIONS',
    groups: [
      {
        label: 'Purchase',
        icon: 'folder',
        items: [
          { label: 'Purchase Orders', href: '/purchase-orders' },
          { label: 'Vendor Bills', href: '/bills' },
          { label: 'Payments Made', href: '/payments-made' },
        ],
      },
      {
        label: 'Sales',
        icon: 'folder',
        items: [
          { label: 'Sales Orders', href: '/sales-orders' },
          { label: 'Customer Invoices', href: '/invoices' },
          { label: 'Payments Received', href: '/payments-received' },
        ],
      },
      {
        label: 'Bank',
        icon: 'folder',
        items: [
          { label: 'Bank Receipt', href: '/vouchers/bank-receipt' },
          { label: 'Bank Payment', href: '/vouchers/bank-payment' },
        ],
      },
      {
        label: 'Cash',
        icon: 'folder',
        items: [
          { label: 'Cash Receipt', href: '/vouchers/cash-receipt' },
          { label: 'Cash Payment', href: '/vouchers/cash-payment' },
        ],
      },
      {
        label: 'Accounting',
        icon: 'folder',
        items: [
          { label: 'Journal Voucher', href: '/vouchers/journal' },
          { label: 'Journal Entries', href: '/journal-entries' },
          { label: 'Stock Moves', href: '/stock-moves' },
          { label: 'Stock Adjustments', href: '/stock-adjustments' },
        ],
      },
    ],
  },
  {
    section: 'REPORTS',
    flat: true,
    items: [
      { label: 'Trial Balance', href: '/reports/trial-balance' },
      { label: 'Profit & Loss', href: '/reports/profit-loss' },
      { label: 'Balance Sheet', href: '/reports/balance-sheet' },
      { label: 'Inventory Valuation', href: '/reports/inventory-valuation' },
      { label: 'Budget Report', href: '/reports/budget' },
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
