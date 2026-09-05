/**
 * Turns raw extracted text (from a digital PDF's text layer, or Tesseract's
 * OCR output) into a structured ParsedInvoice. This is heuristic, regex-based
 * extraction — it will not be perfect, especially on OCR'd photos, which is
 * exactly why every field lands in an editable review modal rather than
 * writing straight to the form (PLAN.md §11b change #3).
 *
 * ParsedInvoice: { vendorName, vendorGSTIN, vendorAddress, invoiceNumber,
 *   invoiceDate, dueDate, lineItems[], subtotal, taxes[], totalAmount,
 *   confidence, rawText }
 * LineItem: { sno, description, hsnCode, quantity, unit, rate, amount }
 * TaxDetail: { name, rate, amount }
 */

// The currency mark is whatever survived. A PDF whose font lacks the rupee
// glyph emits something else entirely (Helvetica turns it into "¹"), and OCR
// mangles it more often than not — so accept one or two non-numeric characters
// there rather than an explicit list, and never let it block the amount.
const GSTIN_RE = /\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]\b/

// `order no` and `po no` alongside the invoice wordings: the sales side scans
// a customer's purchase order, which never says "invoice number" anywhere, so
// without these the document number came through empty on every one of them.
const INVOICE_NO_RE = /(?:invoice|bill|inv|purchase\s*order|order|p\.?\s?o\.?)\s*(?:no\.?|number|#)\s*[:\-]?\s*([A-Z0-9/\-]{3,})/i
// `05-Sep-2026` is as common on a real invoice as `05/09/2026`, and the
// separator between a day and a month *name* is as often a hyphen as a space.
// String.raw so the pattern reads as a regex rather than as a string with
// every backslash doubled — the doubled form is where a typo hides silently,
// because an unrecognised escape in a quoted string just drops the backslash
// and the regex still compiles, matching something subtly different.
const DATE_TOKEN = String.raw`(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}|\d{1,2}[\s\-/.]+[A-Za-z]{3,9}\.?[\s\-/.]+\d{2,4}|[A-Za-z]{3,9}\.?[\s\-/.]+\d{1,2},?[\s\-/.]+\d{2,4})`
const INVOICE_DATE_RE = new RegExp(String.raw`(?:invoice date|bill date|dated?|date)\s*[:\-]?\s*${DATE_TOKEN}`, 'i')
const DUE_DATE_RE = new RegExp(String.raw`due date\s*[:\-]?\s*${DATE_TOKEN}`, 'i')

// The rate is optional. On a columnar invoice the percentage lives in the
// table header ("CGST (9%)") and the summary reads "Total CGST ₹ 22,050.00",
// so insisting on a rate beside the name found no taxes at all on those.
// Requiring decimals on the rate-less form keeps it from latching onto a
// header cell that has no amount after it.
const TAX_LINE_RE = /(CGST|SGST|IGST|GST)\s*(?:@?\s*(\d+(?:\.\d+)?)\s*%)?\s*[:\-]?\s*(?:Rs\.?|INR|[^\d\s,.:\-]{1,2})?\s*([\d,]+\.\d{2})/gi
const TOTAL_RE = /(?:grand total|total amount|amount payable|invoice total|total)\s*[:\-]?\s*(?:Rs\.?|INR|[^\d\s,.:\-]{1,2})?\s*([\d,]+\.\d{1,2}|[\d,]+)/gi
const SUBTOTAL_RE = /(?:sub[\s\-]?total|taxable value|taxable amount)\s*[:\-]?\s*(?:Rs\.?|INR|[^\d\s,.:\-]{1,2})?\s*([\d,]+\.\d{1,2}|[\d,]+)/i

/**
 * A line-item table row, loosely: S.No  Description  [HSN]  Qty  [Unit]  Rate  Amount
 * Columns are whitespace-separated because both the position-reconstructed
 * digital-PDF text and Tesseract's PSM-6 output land in roughly that shape.
 */
// Deliberately not anchored at the end. A GST invoice usually carries more
// columns than this cares about — Taxable Value, CGST, SGST, Line Total — and
// anchoring meant the last two numbers were read as rate and amount, so a row
// either failed outright or produced the tax figures as its price. Taking the
// first two money columns after the quantity is right for both shapes: a plain
// Qty/Rate/Amount table, and a wide one where those two are Rate and Taxable
// Value.
const LINE_ITEM_RE = /^(\d{1,3})[.)]?\s+(.+?)\s+(\d{4,8})?\s*(\d+(?:\.\d+)?)\s*(pcs?|nos?|units?|box(?:es)?|kg|ltr?|mtr?|ea)?\s+([\d,]+\.\d{1,2}|[\d,]+)\s+([\d,]+\.\d{1,2}|[\d,]+)/i

function toNumber(str) {
  if (!str) return 0
  return Number(String(str).replace(/,/g, '')) || 0
}

function normalizeDate(raw) {
  if (!raw) return null
  const s = raw.trim().replace(/\./g, '')

  const dmy = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/)
  if (dmy) {
    let [, d, m, y] = dmy
    if (y.length === 2) y = `20${y}`
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // Hyphens between a day and a month name confuse Date(); spaces do not.
  const parsed = new Date(s.replace(/[-/.]+/g, ' '))
  if (!Number.isNaN(parsed.getTime())) {
    // Local components, not toISOString(). Date() reads "5 Sep 2026" as local
    // midnight, and converting that to UTC moves it backwards anywhere east of
    // Greenwich — in IST every such date came out a day early, silently.
    const y = parsed.getFullYear()
    const m = String(parsed.getMonth() + 1).padStart(2, '0')
    const d = String(parsed.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  return null
}

function extractVendorName(lines) {
  // Heuristic: the vendor's name is almost always the letterhead — one of the
  // first few non-empty lines, before "GSTIN"/"Invoice"/an address keyword.
  // `purchase order` is here for the same reason `tax invoice` is — it is a
  // document title that sits beside the letterhead. Note it is the full phrase
  // and not a bare "order": that would cut "Border Furnishings Ltd" down to a
  // single letter.
  //  - `billed\s*(by|to)`: "bill to" did not catch "Billed By (Seller)".
  //  - the copy markings: "Original for Recipient" sits under the title on
  //    most GST invoices and was being read as the company name.
  const stopWords = /gstin|invoice|bill(?:ed)?\s*(?:no|to|by)|date|tax invoice|purchase\s*order|address|(?:original|duplicate|triplicate)\s+for|recipient|transporter/i
  // Twelve rather than six: splitting side-by-side columns emits an extra
  // line per row, so on a two-column invoice the letterhead now sits further
  // down the list than it used to.
  for (const line of lines.slice(0, 12)) {
    // Cut the line at its first stop word rather than discarding the whole
    // row. Invoices routinely set "TAX INVOICE" beside the letterhead, and
    // both a PDF text layer and OCR flatten anything sharing a baseline into
    // one line — so the row arrives as "Azure Furniture Pvt Ltd TAX INVOICE".
    // Skipping it took the street address as the vendor instead, which is
    // both wrong and confidently wrong: the field is filled, so nothing about
    // the result invites a second look.
    const hit = line.search(stopWords)
    const candidate = (hit >= 0 ? line.slice(0, hit) : line).trim()
    if (candidate.length < 3 || candidate.length > 80) continue
    if (/^\d+$/.test(candidate)) continue
    return candidate
  }
  return null
}

/** How many following lines a wrapped row may absorb. Three covers a serial
 *  number alone on its own line plus a description over two. */
const MAX_ROW_SPAN = 3

function extractLineItems(lines) {
  const items = []
  // The last line index already folded into a row, so a continuation is never
  // stolen from the row before it.
  let consumedTo = -1
  for (let i = 0; i < lines.length; i++) {
    // A table row does not always arrive as one line. Narrow columns wrap the
    // description, and a centred serial number often lands on a line by
    // itself, so the row shows up as "1" / "Enterprise Software" /
    // "License - Annual 9973 1 150,000.00 …". Try the line alone first, then
    // with one and two of its followers joined on, and take the first that
    // parses — so unwrapped rows behave exactly as before.
    let m = null
    let span = 0
    for (; span < MAX_ROW_SPAN; span++) {
      const candidate = lines.slice(i, i + span + 1).join(' ').replace(/\s+/g, ' ').trim()
      m = candidate.match(LINE_ITEM_RE)
      if (m) break
    }
    if (!m) continue

    // A wrapped description can also start on the line *above* the serial
    // number, which is where a centred S.No column puts it. The row then
    // parses correctly but the description is only its tail — "- Annual"
    // rather than "Enterprise Software License - Annual", which is the half a
    // product match depends on. Reclaim that line when it is plainly a
    // continuation: plain text, not already used by the previous row, and not
    // a column header.
    const previous = i > 0 && i - 1 > consumedTo ? lines[i - 1].trim() : ''
    const isContinuation = previous
      && previous.length <= 60
      && !/\d[\d,]*\.\d{2}/.test(previous)
      && !/^\d/.test(previous)
      && !/^(s\.?\s?no|description|hsn|qty|rate|amount|total|sub)/i.test(previous)

    i += span
    consumedTo = i

    const [, sno, description, hsnCode, quantity, unit, rate, amount] = m
    items.push({
      sno: Number(sno),
      description: (isContinuation ? `${previous} ${description}` : description).replace(/\s+/g, ' ').trim(),
      hsnCode: hsnCode || null,
      quantity: toNumber(quantity),
      unit: unit ? unit.toLowerCase() : null,
      rate: toNumber(rate),
      amount: toNumber(amount),
    })
  }
  return items
}

function extractTaxes(text) {
  const taxes = []
  let m
  TAX_LINE_RE.lastIndex = 0
  while ((m = TAX_LINE_RE.exec(text)) !== null) {
    taxes.push({ name: m[1].toUpperCase(), rate: toNumber(m[2]), amount: toNumber(m[3]) })
  }
  return taxes
}

function extractTotal(text) {
  let best = null
  let m
  TOTAL_RE.lastIndex = 0
  while ((m = TOTAL_RE.exec(text)) !== null) {
    const value = toNumber(m[1])
    if (value > 0 && (best === null || value > best)) best = value
  }
  return best
}

export function parseInvoice(rawText, ocrConfidence = 97) {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean)
  const text = rawText

  const gstinMatch = text.match(GSTIN_RE)
  const invoiceNoMatch = text.match(INVOICE_NO_RE)
  const invoiceDateMatch = text.match(INVOICE_DATE_RE)
  const dueDateMatch = text.match(DUE_DATE_RE)
  const subtotalMatch = text.match(SUBTOTAL_RE)

  const lineItems = extractLineItems(lines)
  const taxes = extractTaxes(text)
  const totalAmount = extractTotal(text)
  const vendorName = extractVendorName(lines)

  // Confidence starts from OCR/text-layer quality, then loses points for
  // every key field that couldn't be found — a blank field is a signal to
  // "verify carefully", not a silent gap.
  let confidence = ocrConfidence
  if (!vendorName) confidence -= 15
  if (!invoiceNoMatch) confidence -= 10
  if (!invoiceDateMatch) confidence -= 10
  if (!totalAmount) confidence -= 20
  if (lineItems.length === 0) confidence -= 15
  confidence = Math.max(0, Math.min(100, Math.round(confidence)))

  return {
    vendorName,
    vendorGSTIN: gstinMatch ? gstinMatch[0].toUpperCase() : null,
    vendorAddress: null,
    invoiceNumber: invoiceNoMatch ? invoiceNoMatch[1] : null,
    invoiceDate: normalizeDate(invoiceDateMatch?.[1]),
    dueDate: normalizeDate(dueDateMatch?.[1]),
    lineItems,
    subtotal: subtotalMatch ? toNumber(subtotalMatch[1]) : null,
    taxes,
    totalAmount,
    confidence,
    rawText,
  }
}
