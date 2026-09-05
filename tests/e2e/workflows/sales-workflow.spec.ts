import { test } from '@playwright/test'

test.describe('Sales Workflow Scenario 2', () => {
  test.todo('Step-1: Create customer John Doe — appears in Contact List as Customer')
  test.todo('Step-2: Create product Dining Table, price ₹5000 — appears in Product List')
  test.todo('Step-3: Create Sales Order for 2 Dining Tables')
  test.todo('Step-4: Confirm Sales Order — status changes to Sales Order')
  test.todo('Step-5: Deliver Products from Inventory — stock decreases by 2')
  test.todo('Step-6: Create Customer Invoice from SO — draft invoice created for ₹10000')
  test.todo('Step-7: Post Customer Invoice — status changes to Posted, accounting entries generated')
  test.todo('Step-8: Register Payment for Invoice — amount ₹10000')
  test.todo('Step-9: Check Invoice status — changes to Paid, Outstanding is ₹0')
  test.todo('Step-10: Check Customer Ledger and Bank Account — balances reflect the payment correctly')
})
