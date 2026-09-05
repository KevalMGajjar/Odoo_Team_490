import PDFDocument from 'pdfkit'
import { createWriteStream } from 'node:fs'
import path from 'node:path'

/**
 * Generates a realistic GST vendor invoice as a PDF, for exercising the OCR
 * scanner end to end.
 *
 * Built to match what `lib/ocr/invoice-parser.js` actually looks for, rather
 * than to look plausible to a person: the GSTIN in the exact
 * 2-5-4-1-1-Z-1 shape its regex requires, "Invoice No"/"Invoice Date"/"Due
 * Date" as labelled fields, tax lines as `CGST @ 9% 4,923.00`, and table rows
 * laid out so the columns land in the order the line-item regex expects —
 * S.No, Description, HSN, Qty, Unit, Rate, Amount.
 *
 * The vendor and the products are ones the seed actually creates, so the
 * scanner's matcher has something real to match against. A test invoice full
 * of invented names would exercise the parser but never the matching, which
 * is the half more likely to be wrong.
 *
 *   npm run sample:invoice            → backend/storage/sample-vendor-invoice.pdf
 *   npm run sample:invoice out.pdf
 */

const VENDOR = {
  name: 'Azure Furniture Pvt Ltd',
  address: '14 Ashram Road, Navrangpura',
  city: 'Ahmedabad, Gujarat 380009',
  gstin: '24AAACA1234A1Z5',
  phone: '+91 98240 11223',
  email: 'accounts@azurefurniture.in',
}

const BUYER = {
  name: 'Urban Furniture',
  address: '22 Prahlad Nagar, Ahmedabad, Gujarat 380015',
  gstin: '24AABCU9603R1ZM',
}

const INVOICE = {
  number: 'AZ/2026/0042',
  date: '12/08/2026',
  dueDate: '11/09/2026',
  poNumber: 'PO/2026/0007',
}

// Cost prices AND GST rates from the seed, so a matched product lines up with
// its real rate. The rates have to agree: the bill form takes each line's tax
// from the product master, not from the document, so an invoice that applies a
// blanket rate produces a bill whose total quietly differs from the vendor's.
// Shoe Cabinet is a 12% good among 18% ones, which is what makes this worth
// getting right rather than assuming.
const ITEMS = [
  { sno: 1, description: 'Bar Stool', hsn: '94036000', qty: 10, unit: 'pcs', rate: 1700, gst: 18 },
  { sno: 2, description: 'Coffee Table', hsn: '94033000', qty: 4, unit: 'pcs', rate: 3200, gst: 18 },
  { sno: 3, description: 'Wooden Dining Table', hsn: '94036000', qty: 3, unit: 'pcs', rate: 11500, gst: 18 },
  { sno: 4, description: 'Shoe Cabinet', hsn: '94035000', qty: 6, unit: 'pcs', rate: 2500, gst: 12 },
]

const money = (n) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Column x-positions. pdf.js groups text by y and orders by x, so what these
// really control is the order the parser sees the row in.
const COL = { sno: 40, desc: 70, hsn: 250, qty: 320, unit: 360, rate: 400, amount: 480 }

function buildPdf(outPath) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 })
  doc.pipe(createWriteStream(outPath))

  // ── letterhead ──
  // The vendor's name has to be the first substantial line: the parser reads
  // the letterhead to identify the vendor, skipping anything containing
  // "invoice", "gstin", "date" and the like.
  doc.font('Helvetica-Bold').fontSize(18).text(VENDOR.name, 40, 45)
  doc.font('Helvetica').fontSize(9.5)
  doc.text(VENDOR.address, 40, 70)
  doc.text(VENDOR.city, 40, 84)
  doc.text(`Phone: ${VENDOR.phone}`, 40, 98)
  doc.text(`Email: ${VENDOR.email}`, 40, 112)
  doc.font('Helvetica-Bold').text(`GSTIN: ${VENDOR.gstin}`, 40, 128)

  doc.font('Helvetica-Bold').fontSize(15).text('TAX INVOICE', 380, 48, { width: 175, align: 'right' })

  // ── invoice meta ──
  doc.font('Helvetica').fontSize(9.5)
  doc.text(`Invoice No: ${INVOICE.number}`, 340, 80, { width: 215, align: 'right' })
  doc.text(`Invoice Date: ${INVOICE.date}`, 340, 96, { width: 215, align: 'right' })
  doc.text(`Due Date: ${INVOICE.dueDate}`, 340, 112, { width: 215, align: 'right' })
  doc.text(`PO Reference: ${INVOICE.poNumber}`, 340, 128, { width: 215, align: 'right' })

  doc.moveTo(40, 152).lineTo(555, 152).strokeColor('#999').stroke()

  // ── bill to ──
  doc.font('Helvetica-Bold').fontSize(9.5).text('Bill To', 40, 164)
  doc.font('Helvetica').text(BUYER.name, 40, 180)
  doc.text(BUYER.address, 40, 194)
  doc.text(`GSTIN: ${BUYER.gstin}`, 40, 208)

  // ── line-item table ──
  let y = 246
  doc.font('Helvetica-Bold').fontSize(9)
  doc.text('S.No', COL.sno, y)
  doc.text('Description', COL.desc, y)
  doc.text('HSN', COL.hsn, y)
  doc.text('Qty', COL.qty, y)
  doc.text('Unit', COL.unit, y)
  doc.text('Rate', COL.rate, y)
  doc.text('Amount', COL.amount, y)
  y += 14
  doc.moveTo(40, y).lineTo(555, y).strokeColor('#bbb').stroke()
  y += 8

  let subtotal = 0
  doc.font('Helvetica').fontSize(9.5)
  for (const item of ITEMS) {
    const amount = item.qty * item.rate
    subtotal += amount
    doc.text(String(item.sno), COL.sno, y)
    doc.text(item.description, COL.desc, y)
    doc.text(item.hsn, COL.hsn, y)
    doc.text(String(item.qty), COL.qty, y)
    doc.text(item.unit, COL.unit, y)
    doc.text(money(item.rate), COL.rate, y)
    doc.text(money(amount), COL.amount, y)
    y += 20
  }

  doc.moveTo(40, y).lineTo(555, y).strokeColor('#bbb').stroke()
  y += 12

  // ── totals ──
  // A rate-wise summary, which is how GST invoices actually present mixed
  // rates: each slab gets its own CGST and SGST line rather than one blended
  // percentage that matches nothing on the return.
  const bySlab = new Map()
  for (const item of ITEMS) {
    const amount = item.qty * item.rate
    bySlab.set(item.gst, (bySlab.get(item.gst) ?? 0) + amount)
  }

  const totalRow = (label, value, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9.5)
    doc.text(label, 320, y, { width: 140, align: 'right' })
    doc.text(money(value), 465, y, { width: 90, align: 'right' })
    y += bold ? 20 : 16
  }

  totalRow('Sub Total', subtotal)

  let taxTotal = 0
  for (const slab of [...bySlab.keys()].sort((a, b) => b - a)) {
    const base = bySlab.get(slab)
    const half = Math.round(base * (slab / 2 / 100) * 100) / 100
    taxTotal += half * 2
    totalRow(`CGST @ ${slab / 2}%`, half)
    totalRow(`SGST @ ${slab / 2}%`, half)
  }

  const total = subtotal + taxTotal
  doc.moveTo(320, y + 2).lineTo(555, y + 2).strokeColor('#999').stroke()
  y += 8
  totalRow('Grand Total', total, true)

  const slabs = [...bySlab.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([slab, base]) => ({ slab, base, half: Math.round(base * (slab / 2 / 100) * 100) / 100 }))

  // ── footer ──
  y += 24
  doc.font('Helvetica').fontSize(8.5).fillColor('#555')
  doc.text('Payment due within 30 days. Goods once sold will not be taken back.', 40, y)
  doc.text('Bank: HDFC Bank, A/c 50200012345678, IFSC HDFC0001234', 40, y + 14)
  doc.text('This is a computer-generated invoice.', 40, y + 28)

  doc.end()

  return { subtotal, slabs, taxTotal, total }
}

const bySlabBase = (totals, slab) => totals.slabs.find((s) => s.slab === slab).base

const target = process.argv[2] || path.resolve(process.cwd(), 'storage', 'sample-vendor-invoice.pdf')
const totals = buildPdf(target)

console.log(`\n  Wrote ${target}\n`)
console.log('  What the scanner should pull out of it:')
console.log(`    vendor        ${VENDOR.name}   (a seeded vendor — should match, not create)`)
console.log(`    GSTIN         ${VENDOR.gstin}`)
console.log(`    invoice no    ${INVOICE.number}`)
console.log(`    invoice date  ${INVOICE.date}  ->  2026-08-12`)
console.log(`    due date      ${INVOICE.dueDate}  ->  2026-09-11`)
console.log(`    line items    ${ITEMS.length}   (all four are seeded products)`)
console.log(`    sub total     ${money(totals.subtotal)}`)
for (const { slab, half } of totals.slabs) {
  console.log(`    CGST @ ${String(slab / 2).padEnd(2)}%      ${money(half)}   (on ${money(bySlabBase(totals, slab))} of ${slab}% goods)`)
  console.log(`    SGST @ ${String(slab / 2).padEnd(2)}%      ${money(half)}`)
}
console.log(`    grand total   ${money(totals.total)}`)
console.log('\n  Confidence should read 97 — every field the parser scores is present.\n')
