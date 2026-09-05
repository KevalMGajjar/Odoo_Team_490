import PDFDocument from 'pdfkit'
import { createWriteStream } from 'node:fs'
import path from 'node:path'

/**
 * Generates realistic GST vendor invoices as PDFs, for exercising the OCR
 * scanner end to end.
 *
 * Built to match what `frontend/lib/ocr/invoice-parser.js` actually looks for
 * rather than to look plausible to a person: the GSTIN in the exact
 * 2-5-4-1-1-Z-1 shape its regex requires, "Invoice No"/"Invoice Date"/"Due
 * Date" as labelled fields, tax lines as `IGST @ 18%`, and table rows laid out
 * so the columns land in the order the line-item regex reads them — S.No,
 * Description, HSN, Qty, Unit, Rate, Amount.
 *
 * Two presets, because the interesting paths are different:
 *
 *   known  — a seeded vendor and seeded products. Everything should match, so
 *            this covers extraction plus the matcher's happy path.
 *   new    — a vendor nobody has entered and one product nobody stocks, from
 *            another state so the tax is IGST rather than CGST/SGST. This is
 *            the path where the scanner has to offer to create records, which
 *            is the half more likely to be wrong.
 *
 *   npm run sample:invoice
 *   npm run sample:invoice -- --preset=new
 *   npm run sample:invoice -- --preset=new --out=D:/somewhere/bill.pdf
 */

const PRESETS = {
  known: {
    file: 'sample-vendor-invoice.pdf',
    vendor: {
      name: 'Azure Furniture Pvt Ltd',
      address: '14 Ashram Road, Navrangpura',
      city: 'Ahmedabad, Gujarat 380009',
      gstin: '24AAACA1234A1Z5',
      phone: '+91 98240 11223',
      email: 'accounts@azurefurniture.in',
    },
    // Intra-state: Gujarat to Gujarat, so the tax splits into CGST + SGST.
    interState: false,
    invoice: { number: 'AZ/2026/0042', date: '12/08/2026', dueDate: '11/09/2026', poNumber: 'PO/2026/0007' },
    // Cost prices AND GST rates from the seed. The rates have to agree: the
    // bill form takes each line's tax from the product master, not from the
    // document, so a blanket rate here produces a bill whose total quietly
    // differs from the vendor's.
    items: [
      { description: 'Bar Stool', hsn: '94036000', qty: 10, unit: 'pcs', rate: 1700, gst: 18 },
      { description: 'Coffee Table', hsn: '94033000', qty: 4, unit: 'pcs', rate: 3200, gst: 18 },
      { description: 'Wooden Dining Table', hsn: '94036000', qty: 3, unit: 'pcs', rate: 11500, gst: 18 },
      { description: 'Shoe Cabinet', hsn: '94035000', qty: 6, unit: 'pcs', rate: 2500, gst: 12 },
    ],
  },

  new: {
    file: 'sample-vendor-invoice-new.pdf',
    vendor: {
      name: 'Meridian Woodcraft LLP',
      address: 'Plot 42, Sitapura Industrial Area',
      city: 'Jaipur, Rajasthan 302022',
      gstin: '08AACCM5678K1Z3',
      phone: '+91 94140 55210',
      email: 'billing@meridianwoodcraft.in',
    },
    // Rajasthan to Gujarat is inter-state, so a single IGST line rather than a
    // CGST/SGST pair — which also exercises the IGST branch of the tax regex.
    interState: true,
    invoice: { number: 'MW/2026/0318', date: '19/08/2026', dueDate: '18/09/2026', poNumber: 'PO/2026/0011' },
    items: [
      { description: 'Queen Bed Frame', hsn: '94035000', qty: 2, unit: 'pcs', rate: 13800, gst: 18 },
      { description: 'Wardrobe (3 Door)', hsn: '94035000', qty: 1, unit: 'pcs', rate: 16000, gst: 18 },
      // Not in the catalogue — the review modal should leave this line's
      // product empty for someone to pick or create.
      { description: 'Teak Wood Polish 5L', hsn: '32100000', qty: 12, unit: 'nos', rate: 850, gst: 18 },
    ],
  },
}

const BUYER = {
  name: 'Urban Furniture',
  address: '22 Prahlad Nagar, Ahmedabad, Gujarat 380015',
  gstin: '24AABCU9603R1ZM',
}

const money = (n) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Column x-positions. pdf.js groups text by y and orders by x, so what these
// really control is the order the parser sees each row in.
const COL = { sno: 40, desc: 70, hsn: 250, qty: 320, unit: 360, rate: 400, amount: 480 }

function buildPdf(preset, outPath) {
  const { vendor, invoice, items, interState } = preset
  const doc = new PDFDocument({ size: 'A4', margin: 40 })
  doc.pipe(createWriteStream(outPath))

  // ── letterhead ──
  // The vendor's name has to be the first substantial line: the parser reads
  // the letterhead to identify the vendor.
  doc.font('Helvetica-Bold').fontSize(18).text(vendor.name, 40, 45)
  doc.font('Helvetica').fontSize(9.5)
  doc.text(vendor.address, 40, 70)
  doc.text(vendor.city, 40, 84)
  doc.text(`Phone: ${vendor.phone}`, 40, 98)
  doc.text(`Email: ${vendor.email}`, 40, 112)
  doc.font('Helvetica-Bold').text(`GSTIN: ${vendor.gstin}`, 40, 128)

  doc.font('Helvetica-Bold').fontSize(15).text('TAX INVOICE', 380, 48, { width: 175, align: 'right' })

  doc.font('Helvetica').fontSize(9.5)
  doc.text(`Invoice No: ${invoice.number}`, 340, 80, { width: 215, align: 'right' })
  doc.text(`Invoice Date: ${invoice.date}`, 340, 96, { width: 215, align: 'right' })
  doc.text(`Due Date: ${invoice.dueDate}`, 340, 112, { width: 215, align: 'right' })
  doc.text(`PO Reference: ${invoice.poNumber}`, 340, 128, { width: 215, align: 'right' })

  doc.moveTo(40, 152).lineTo(555, 152).strokeColor('#999').stroke()

  doc.font('Helvetica-Bold').fontSize(9.5).text('Bill To', 40, 164)
  doc.font('Helvetica').text(BUYER.name, 40, 180)
  doc.text(BUYER.address, 40, 194)
  doc.text(`GSTIN: ${BUYER.gstin}`, 40, 208)
  doc.text('Place of Supply: Gujarat (24)', 40, 222)

  // ── line-item table ──
  let y = 252
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
  items.forEach((item, i) => {
    const amount = item.qty * item.rate
    subtotal += amount
    doc.text(String(i + 1), COL.sno, y)
    doc.text(item.description, COL.desc, y)
    doc.text(item.hsn, COL.hsn, y)
    doc.text(String(item.qty), COL.qty, y)
    doc.text(item.unit, COL.unit, y)
    doc.text(money(item.rate), COL.rate, y)
    doc.text(money(amount), COL.amount, y)
    y += 20
  })

  doc.moveTo(40, y).lineTo(555, y).strokeColor('#bbb').stroke()
  y += 12

  // ── totals ──
  // A rate-wise summary, which is how a GST invoice with mixed slabs is
  // actually laid out: each slab gets its own tax lines rather than one
  // blended percentage that matches nothing on the return.
  const bySlab = new Map()
  for (const item of items) bySlab.set(item.gst, (bySlab.get(item.gst) ?? 0) + item.qty * item.rate)

  const totalRow = (label, value, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9.5)
    doc.text(label, 320, y, { width: 140, align: 'right' })
    doc.text(money(value), 465, y, { width: 90, align: 'right' })
    y += bold ? 20 : 16
  }

  totalRow('Sub Total', subtotal)

  const taxLines = []
  let taxTotal = 0
  for (const slab of [...bySlab.keys()].sort((a, b) => b - a)) {
    const base = bySlab.get(slab)
    if (interState) {
      const amount = Math.round(base * (slab / 100) * 100) / 100
      taxLines.push({ label: `IGST @ ${slab}%`, amount, base })
      taxTotal += amount
    } else {
      const half = Math.round(base * (slab / 2 / 100) * 100) / 100
      taxLines.push({ label: `CGST @ ${slab / 2}%`, amount: half, base })
      taxLines.push({ label: `SGST @ ${slab / 2}%`, amount: half, base })
      taxTotal += half * 2
    }
  }
  for (const line of taxLines) totalRow(line.label, line.amount)

  const total = subtotal + taxTotal
  doc.moveTo(320, y + 2).lineTo(555, y + 2).strokeColor('#999').stroke()
  y += 8
  totalRow('Grand Total', total, true)

  // ── footer ──
  y += 24
  doc.font('Helvetica').fontSize(8.5).fillColor('#555')
  doc.text('Payment due within 30 days. Goods once sold will not be taken back.', 40, y)
  doc.text('Bank: HDFC Bank, A/c 50200012345678, IFSC HDFC0001234', 40, y + 14)
  doc.text('This is a computer-generated invoice.', 40, y + 28)

  doc.end()
  return { subtotal, taxLines, taxTotal, total }
}

// ── run ──
const args = process.argv.slice(2)
const arg = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=')

const presetName = arg('preset') || 'known'
const preset = PRESETS[presetName]
if (!preset) {
  console.error(`\n  Unknown preset "${presetName}". Available: ${Object.keys(PRESETS).join(', ')}\n`)
  process.exit(1)
}

const target = arg('out') || path.resolve(process.cwd(), 'storage', preset.file)
const totals = buildPdf(preset, target)

const iso = (d) => { const [dd, mm, yy] = d.split('/'); return `${yy}-${mm}-${dd}` }

console.log(`\n  Wrote ${target}   (preset: ${presetName})\n`)
console.log('  What the scanner should pull out of it:')
console.log(`    vendor        ${preset.vendor.name}`)
console.log(`    GSTIN         ${preset.vendor.gstin}`)
console.log(`    invoice no    ${preset.invoice.number}`)
console.log(`    invoice date  ${preset.invoice.date}  ->  ${iso(preset.invoice.date)}`)
console.log(`    due date      ${preset.invoice.dueDate}  ->  ${iso(preset.invoice.dueDate)}`)
console.log(`    line items    ${preset.items.length}`)
for (const item of preset.items) {
  console.log(`                  ${item.description.padEnd(22)} ${String(item.qty).padStart(3)} x ${money(item.rate).padStart(10)} @ ${item.gst}%`)
}
console.log(`    sub total     ${money(totals.subtotal)}`)
for (const line of totals.taxLines) {
  console.log(`    ${line.label.padEnd(13)} ${money(line.amount)}   (on ${money(line.base)})`)
}
console.log(`    grand total   ${money(totals.total)}`)
console.log('\n  Confidence should read 97 — every field the parser scores is present.\n')
