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

  // ── sales side ──
  // What gets scanned on invoices/new is a purchase order the customer sent
  // us, so the letterhead is theirs and the matcher is looking for a customer
  // rather than a vendor. Prices are the seeded sale prices, not costs.
  sales: {
    file: 'sample-customer-order.pdf',
    kind: 'order',
    vendor: {
      name: 'Gateway Hotels Ltd',
      address: '5th Floor, Trade Centre, Bund Garden Road',
      city: 'Pune, Maharashtra 411001',
      gstin: '27AAACG7654L1ZP',
      phone: '+91 98200 33445',
      email: 'purchase@gatewayhotels.com',
    },
    // Gujarat to Maharashtra, so IGST.
    interState: true,
    invoice: { number: 'GH/PO/2026/0219', date: '21/08/2026', dueDate: '20/09/2026', poNumber: null },
    items: [
      { description: 'Queen Bed Frame', hsn: '94035000', qty: 6, unit: 'pcs', rate: 21000, gst: 18 },
      { description: 'Wardrobe (3 Door)', hsn: '94035000', qty: 4, unit: 'pcs', rate: 24500, gst: 18 },
      { description: 'Delivery Service', hsn: '99672000', qty: 1, unit: 'nos', rate: 1200, gst: 5 },
    ],
  },

  'sales-new': {
    file: 'sample-customer-order-new.pdf',
    kind: 'order',
    vendor: {
      name: 'Lakeview Hospitality Pvt Ltd',
      address: '7 Fateh Sagar Road',
      city: 'Udaipur, Rajasthan 313001',
      gstin: '08AAFCL3321H1Z9',
      phone: '+91 94130 77820',
      email: 'projects@lakeviewhospitality.in',
    },
    interState: true,
    invoice: { number: 'LV/PO/2026/0044', date: '25/08/2026', dueDate: '24/09/2026', poNumber: null },
    items: [
      { description: 'Coffee Table', hsn: '94033000', qty: 8, unit: 'pcs', rate: 5400, gst: 18 },
      { description: 'Bar Stool', hsn: '94036000', qty: 20, unit: 'pcs', rate: 2900, gst: 18 },
      // Not in the catalogue.
      { description: 'Custom Reception Desk', hsn: '94033000', qty: 1, unit: 'nos', rate: 68000, gst: 18 },
    ],
  },

  // A layout copied from a real invoice rather than shaped to suit the parser:
  // seller and buyer in blocks beside each other, a wide tax table whose
  // descriptions wrap, serial numbers on their own line, `05-Sep-2026` dates,
  // and a summary that reads "Total CGST" with the percentage left up in the
  // column header. Every one of those broke the parser when first tried.
  columnar: {
    file: 'sample-columnar-invoice.pdf',
    layout: 'columnar',
    vendor: {
      name: 'Zuma Corporation',
      address: '45 Tech Park, Andheri East',
      city: 'Mumbai, Maharashtra 400069',
      gstin: '27AAACZ1234A1Z5',
      pan: 'AAACZ1234A',
    },
    interState: false,
    invoice: { number: 'ZUMA/2026/102', date: '05-Sep-2026', dueDate: null, poNumber: null },
    items: [
      { description: 'Enterprise Software License - Annual', hsn: '9973', qty: 1, unit: null, rate: 150000, gst: 18 },
      { description: 'Cloud Infrastructure Setup', hsn: '9983', qty: 1, unit: null, rate: 45000, gst: 18 },
      { description: 'Monthly IT Support Retainer', hsn: '9983', qty: 2, unit: null, rate: 25000, gst: 18 },
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
  const { vendor, invoice, items, interState, kind = 'invoice' } = preset
  const isOrder = kind === 'order'
  const title = isOrder ? 'PURCHASE ORDER' : 'TAX INVOICE'
  const numberLabel = isOrder ? 'Order No' : 'Invoice No'
  const dateLabel = isOrder ? 'Order Date' : 'Invoice Date'
  const counterparty = isOrder ? 'Supplier' : 'Bill To'
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

  doc.font('Helvetica-Bold').fontSize(15).text(title, 380, 48, { width: 175, align: 'right' })

  doc.font('Helvetica').fontSize(9.5)
  doc.text(`${numberLabel}: ${invoice.number}`, 340, 80, { width: 215, align: 'right' })
  doc.text(`${dateLabel}: ${invoice.date}`, 340, 96, { width: 215, align: 'right' })
  doc.text(`Due Date: ${invoice.dueDate}`, 340, 112, { width: 215, align: 'right' })
  if (invoice.poNumber) doc.text(`PO Reference: ${invoice.poNumber}`, 340, 128, { width: 215, align: 'right' })

  doc.moveTo(40, 152).lineTo(555, 152).strokeColor('#999').stroke()

  doc.font('Helvetica-Bold').fontSize(9.5).text(counterparty, 40, 164)
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


/**
 * The columnar layout: seller and buyer side by side, a wide tax table, and a
 * totals block whose labels carry no percentage. Kept separate from buildPdf
 * rather than folded into it with flags — they share almost no positioning,
 * and the point of this one is to be shaped like a real invoice rather than
 * like something the parser already handles.
 */
function buildColumnarPdf(preset, outPath) {
  const { vendor, invoice, items } = preset
  const doc = new PDFDocument({ size: 'A4', margin: 40 })
  doc.pipe(createWriteStream(outPath))

  doc.font('Helvetica-Bold').fontSize(17).text('TAX INVOICE', 40, 44, { width: 515, align: 'center' })
  doc.font('Helvetica').fontSize(9).text('Original for Recipient', 40, 66, { width: 515, align: 'center' })
  doc.moveTo(40, 88).lineTo(555, 88).lineWidth(1.5).strokeColor('#222').stroke()

  doc.font('Helvetica-Bold').fontSize(9.5).text('Invoice No:', 40, 106, { continued: true })
  doc.font('Helvetica').text(` ${invoice.number}`)
  doc.font('Helvetica-Bold').text('Date:', 40, 119, { continued: true })
  doc.font('Helvetica').text(` ${invoice.date}`)
  doc.font('Helvetica-Bold').fontSize(9.5).text('Place of Supply:', 330, 106, { continued: true })
  doc.font('Helvetica').text(' Maharashtra (Code: 27)')

  // Two boxes side by side — the layout the flattened text layer merges.
  const boxY = 142
  doc.rect(40, boxY, 257, 22).fillAndStroke('#f2f2f2', '#bbb')
  doc.rect(297, boxY, 258, 22).fillAndStroke('#f2f2f2', '#bbb')
  doc.fillColor('#000').font('Helvetica-Bold').fontSize(9.5)
  doc.text('Billed By (Seller)', 48, boxY + 7)
  doc.text('Billed To (Buyer)', 305, boxY + 7)
  doc.rect(40, boxY + 22, 257, 74).stroke('#bbb')
  doc.rect(297, boxY + 22, 258, 74).stroke('#bbb')

  const party = (p, x, y) => {
    doc.font('Helvetica-Bold').fontSize(11).text(p.name, x, y)
    doc.font('Helvetica').fontSize(8.5)
    doc.text(p.address, x, y + 16)
    doc.text(p.city, x, y + 27)
    doc.font('Helvetica-Bold').text('GSTIN:', x, y + 38, { continued: true })
    doc.font('Helvetica').text(` ${p.gstin}`)
    doc.font('Helvetica-Bold').text('PAN:', x, y + 49, { continued: true })
    doc.font('Helvetica').text(` ${p.pan}`)
  }
  party(vendor, 48, boxY + 30)
  party({ ...BUYER, pan: 'AAACU5678B' }, 305, boxY + 30)

  // Wide table: Rate, Taxable Value, CGST, SGST and Line Total — five numeric
  // columns where the simpler layout has two.
  const C = { sno: 46, desc: 76, hsn: 196, qty: 230, rate: 262, taxable: 330, cgst: 396, sgst: 444, total: 492 }
  let y = 262
  doc.rect(40, y - 8, 515, 30).fillAndStroke('#f2f2f2', '#bbb')
  doc.fillColor('#000').font('Helvetica-Bold').fontSize(7.5)
  doc.text('S.No', C.sno, y - 1)
  doc.text('Description of Goods/', C.desc, y - 5)
  doc.text('Services', C.desc, y + 4)
  doc.text('HSN/', C.hsn, y - 5)
  doc.text('SAC', C.hsn, y + 4)
  doc.text('Qty', C.qty, y - 1)
  doc.text('Rate', C.rate, y - 1)
  doc.text('Taxable Value', C.taxable, y - 1)
  doc.text('CGST', C.cgst, y - 5)
  doc.text('(9%)', C.cgst, y + 4)
  doc.text('SGST', C.sgst, y - 5)
  doc.text('(9%)', C.sgst, y + 4)
  doc.text('Total', C.total, y - 1)
  y += 26

  let subtotal = 0
  let cgstTotal = 0
  items.forEach((item, i) => {
    const taxable = item.qty * item.rate
    const half = Math.round(taxable * (item.gst / 2 / 100) * 100) / 100
    subtotal += taxable
    cgstTotal += half

    // Description over two lines and the serial number on its own baseline —
    // exactly how a narrow column wraps, and what the single-line row pattern
    // could not read.
    const words = item.description.split(' ')
    const mid = Math.ceil(words.length / 2)
    doc.font('Helvetica').fontSize(8)
    doc.text(String(i + 1), C.sno, y + 5)
    doc.text(words.slice(0, mid).join(' '), C.desc, y - 5, { width: 115 })
    doc.text(words.slice(mid).join(' '), C.desc, y + 5, { width: 115 })
    doc.text(item.hsn, C.hsn, y + 5)
    doc.text(String(item.qty), C.qty, y + 5)
    doc.text(money(item.rate), C.rate, y + 5)
    doc.text(money(taxable), C.taxable, y + 5)
    doc.text(money(half), C.cgst, y + 5)
    doc.text(money(half), C.sgst, y + 5)
    doc.text(money(taxable + half * 2), C.total, y + 5)
    doc.rect(40, y - 10, 515, 30).stroke('#ddd')
    y += 30
  })

  // Totals block: labels carry no percentage — the 9% is up in the header.
  y += 24
  const totalRow = (label, value, bold = false) => {
    doc.rect(300, y - 6, 255, 22).stroke('#bbb')
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 10 : 9)
    doc.text(label, 310, y)
    // Helvetica has no rupee glyph and silently emits "¹" instead, which is
    // exactly the kind of thing that makes a fixture test something other than
    // what it claims to. "Rs." is what a document in this font would print.
    doc.text(`Rs. ${money(value)}`, 380, y, { width: 165, align: 'right' })
    y += 22
  }
  const total = subtotal + cgstTotal * 2
  totalRow('Total Taxable Value', subtotal)
  totalRow('Total CGST', cgstTotal)
  totalRow('Total SGST', cgstTotal)
  totalRow('Grand Total', total, true)

  y += 30
  doc.font('Helvetica-Bold').fontSize(8.5).text('Declaration:', 40, y)
  doc.font('Helvetica').text('We declare that this invoice shows the actual price of the', 40, y + 12)
  doc.text('goods/services described and that all particulars are true and correct.', 40, y + 23)
  doc.font('Helvetica').fontSize(9).text(`For ${vendor.name}`, 330, y + 12, { width: 225, align: 'right' })
  doc.text('Authorized Signatory', 330, y + 70, { width: 225, align: 'right' })

  doc.end()
  return {
    subtotal,
    taxLines: [
      { label: 'Total CGST', amount: cgstTotal, base: subtotal },
      { label: 'Total SGST', amount: cgstTotal, base: subtotal },
    ],
    taxTotal: cgstTotal * 2,
    total,
  }
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
const totals = (preset.layout === 'columnar' ? buildColumnarPdf : buildPdf)(preset, target)

// The summary echoes what the parser should produce, so it has to understand
// every date form the presets use, not just dd/mm/yyyy.
const iso = (d) => {
  if (!d) return '—'
  const parsed = new Date(/^\d{1,2}\/\d{1,2}\//.test(d) ? d.split('/').reverse().join('-') : d.replace(/-/g, ' '))
  if (Number.isNaN(parsed.getTime())) return d
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
}

console.log(`\n  Wrote ${target}   (preset: ${presetName})\n`)
console.log('  What the scanner should pull out of it:')
console.log(`    ${preset.kind === 'order' ? 'customer     ' : 'vendor       '} ${preset.vendor.name}`)
console.log(`    GSTIN         ${preset.vendor.gstin}`)
console.log(`    invoice no    ${preset.invoice.number}`)
console.log(`    invoice date  ${preset.invoice.date}  ->  ${iso(preset.invoice.date)}`)
if (preset.invoice.dueDate) console.log(`    due date      ${preset.invoice.dueDate}  ->  ${iso(preset.invoice.dueDate)}`)
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
