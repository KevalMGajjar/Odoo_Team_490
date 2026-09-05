import { describe, it, expect, beforeAll } from 'vitest'
import { api, loginAllRoles, today } from '../../helpers/api'

describe('Purchase Chain (Purchase Trace)', () => {
  let vendorId: string
  let productId: string
  let initialStock: number
  let bankJournalId: string

  beforeAll(async () => {
    await loginAllRoles()
    const { rows: vendors } = await api('/contacts?q=Azure')
    const { rows: products } = await api('/products?q=Bar Stool')
    const { rows: journals } = await api('/journals')

    vendorId = vendors[0].id
    productId = products[0].id
    initialStock = Number(products[0].onHandQty)
    bankJournalId = journals.find((j: any) => j.type === 'bank').id
  })

  it('AC-PUR-01: Full purchase trace', async () => {
    // Create PO (10 × ₹1,800, product has 18% GST → untaxed 18,000, total 21,240)
    const po = await api('/purchase-orders', {
      method: 'POST',
      body: {
        vendorId,
        orderDate: today(),
        lines: [{ productId, quantity: 10, unitPrice: 1800 }]
      }
    })
    expect(po.status).toBe(201)
    expect(Number(po.untaxed)).toBe(18000)
    expect(Number(po.total)).toBe(21240)

    // Get JE count before confirm, confirm PO, get JE count after → assert NO new JE
    const entriesBefore = (await api('/journal-entries?pageSize=1')).total
    
    const confirm = await api(`/purchase-orders/${po.id}/confirm`, { method: 'POST' })
    expect([200, 204]).toContain(confirm.status)

    const entriesAfter = (await api('/journal-entries?pageSize=1')).total
    expect(entriesAfter).toBe(entriesBefore)

    // Create bill from PO → draft
    const draftBill = await api(`/purchase-orders/${po.id}/create-bill`, { method: 'POST' })
    expect(draftBill.status).toBe(201)
    expect(draftBill.state).toBe('draft')

    // Post bill → posted, journalEntryId exists
    const bill = await api(`/bills/${draftBill.id}/post`, { method: 'POST' })
    expect(bill.status).toBe(200)
    expect(bill.state).toBe('posted')
    expect(bill.journalEntryId).toBeDefined()

    // Verify stock increased by 10
    const afterReceipt = await api(`/products/${productId}`)
    expect(Number(afterReceipt.onHandQty)).toBe(initialStock + 10)

    // Post same bill again → 409
    const billAgain = await api(`/bills/${draftBill.id}/post`, { method: 'POST' })
    expect(billAgain.status).toBe(409)
  })

  it.todo('AC-PUR-02: Partial then full vendor payment')
  
  it.todo('AC-PUR-03: Cash payment to vendor')

  it('NEW EDGE: PO with zero quantity line', async () => {
    const po = await api('/purchase-orders', {
      method: 'POST',
      body: {
        vendorId,
        orderDate: today(),
        lines: [{ productId, quantity: 0, unitPrice: 1800 }]
      }
    })
    expect(po.status).toBe(422)
  })

  it('NEW EDGE: PO with negative unit price', async () => {
    const po = await api('/purchase-orders', {
      method: 'POST',
      body: {
        vendorId,
        orderDate: today(),
        lines: [{ productId, quantity: 10, unitPrice: -100 }]
      }
    })
    expect(po.status).toBe(422)
  })

  it('NEW EDGE: PO computation', async () => {
    // 10 × ₹1,800 = untaxed ₹18,000, GST 18% = ₹3,240, total = ₹21,240
    const po = await api('/purchase-orders', {
      method: 'POST',
      body: {
        vendorId,
        orderDate: today(),
        lines: [{ productId, quantity: 10, unitPrice: 1800 }]
      }
    })
    expect(po.status).toBe(201)
    expect(Number(po.untaxed)).toBe(18000)
    expect(Number(po.total)).toBe(21240)
  })

  it('NEW EDGE: Bill amount matches PO amount', async () => {
    const po = await api('/purchase-orders', {
      method: 'POST',
      body: {
        vendorId,
        orderDate: today(),
        lines: [{ productId, quantity: 5, unitPrice: 1800 }]
      }
    })
    
    await api(`/purchase-orders/${po.id}/confirm`, { method: 'POST' })

    const draftBillRef = await api(`/purchase-orders/${po.id}/create-bill`, { method: 'POST' })
    expect(draftBillRef.status).toBe(201)
    
    const bill = await api(`/bills/${draftBillRef.id}`)
    expect(Number(bill.total)).toBe(Number(po.total))
  })

  it('NEW EDGE: Stock receipt', async () => {
    const prod = await api(`/products/${productId}`)
    const stockBefore = Number(prod.onHandQty)

    const po = await api('/purchase-orders', {
      method: 'POST',
      body: {
        vendorId,
        orderDate: today(),
        lines: [{ productId, quantity: 7, unitPrice: 1800 }]
      }
    })
    
    await api(`/purchase-orders/${po.id}/confirm`, { method: 'POST' })
    const draftBill = await api(`/purchase-orders/${po.id}/create-bill`, { method: 'POST' })
    await api(`/bills/${draftBill.id}/post`, { method: 'POST' })

    const prodAfter = await api(`/products/${productId}`)
    expect(Number(prodAfter.onHandQty)).toBe(stockBefore + 7)
  })

  it('NEW EDGE: Double bill creation from same PO', async () => {
    const po = await api('/purchase-orders', {
      method: 'POST',
      body: {
        vendorId,
        orderDate: today(),
        lines: [{ productId, quantity: 2, unitPrice: 1800 }]
      }
    })
    
    await api(`/purchase-orders/${po.id}/confirm`, { method: 'POST' })
    
    const bill1 = await api(`/purchase-orders/${po.id}/create-bill`, { method: 'POST' })
    expect(bill1.status).toBe(201)

    const bill2 = await api(`/purchase-orders/${po.id}/create-bill`, { method: 'POST' })
    expect([201, 400, 403, 409, 422]).toContain(bill2.status)
  })

  it('NEW EDGE: PO for large quantities', async () => {
    // 10,000 × ₹999.99 = 9,999,900
    const po = await api('/purchase-orders', {
      method: 'POST',
      body: {
        vendorId,
        orderDate: today(),
        lines: [{ productId, quantity: 10000, unitPrice: 999.99 }]
      }
    })
    expect(po.status).toBe(201)
    expect(Number(po.untaxed)).toBe(9999900)
    // GST 18% of 9999900 = 1799982. Total = 11799882
    expect(Number(po.total)).toBeCloseTo(11799882, 2)
  })

  it('NEW EDGE: Confirming already-confirmed PO', async () => {
    const po = await api('/purchase-orders', {
      method: 'POST',
      body: {
        vendorId,
        orderDate: today(),
        lines: [{ productId, quantity: 2, unitPrice: 1800 }]
      }
    })
    
    const confirm1 = await api(`/purchase-orders/${po.id}/confirm`, { method: 'POST' })
    expect([200, 204]).toContain(confirm1.status)
    
    const confirm2 = await api(`/purchase-orders/${po.id}/confirm`, { method: 'POST' })
    expect([200, 204, 400, 409, 422]).toContain(confirm2.status)
  })
})
