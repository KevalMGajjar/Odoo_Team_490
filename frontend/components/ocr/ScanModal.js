'use client'

import { useRef, useState } from 'react'
import { UploadCloud, FileText, CheckCircle2, AlertTriangle, ChevronDown, Trash2, Plus } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { FormField, TextInput } from '@/components/ui/FormField'
import { SearchSelect } from '@/components/ui/SearchSelect'
import { api } from '@/lib/api'
import { formatMoney } from '@/lib/format'
import { runOcrPipeline } from '@/lib/ocr/ocr-engine'
import { parseInvoice } from '@/lib/ocr/invoice-parser'
import { matchContact, matchProduct } from '@/lib/ocr/match'
import { useGuardedAction } from '@/lib/useGuardedAction'

const STAGE_LABEL = {
  reading: 'Reading PDF text…',
  rendering: 'Rendering pages…',
  ocr: 'Recognizing text (OCR, running locally)…',
  normalizing: 'Preparing image…',
  matching: 'Matching vendor & products…',
}

/**
 * Upload → progress → editable review → Fill Form. Never auto-saves
 * (PLAN.md §11b): "Fill Form" only pushes structured values into the host
 * page's own state — the user still reviews and clicks Save Draft there,
 * and the same Zod schemas + postEntry() rules apply on that save exactly
 * as if they'd typed it by hand.
 *
 * @param {'vendor'|'customer'} partyRole — which master to match/create against.
 */
export function ScanModal({ open, onClose, partyRole, onFill }) {
  const [stage, setStage] = useState('upload') // upload | processing | review
  const [progress, setProgress] = useState({ fraction: 0, label: '' })
  const [parsed, setParsed] = useState(null)
  const [party, setParty] = useState(null)
  const [date, setDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [lines, setLines] = useState([])
  const [showRawText, setShowRawText] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [fileError, setFileError] = useState('')
  const fileInputRef = useRef(null)

  const reset = () => {
    setStage('upload')
    setProgress({ fraction: 0, label: '' })
    setParsed(null)
    setParty(null)
    setDate('')
    setDueDate('')
    setLines([])
    setShowRawText(false)
    setFileError('')
  }

  const close = () => {
    reset()
    onClose()
  }

  const processFile = async (file) => {
    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
      setFileError('Upload a PDF or a photo (JPG/PNG) of the invoice.')
      return
    }
    setFileError('')
    setStage('processing')
    try {
      const result = await runOcrPipeline(file, (fraction, label) => setProgress({ fraction, label: STAGE_LABEL[label] ?? label }))
      const invoice = parseInvoice(result.text, result.confidence)

      setProgress({ fraction: 0, label: STAGE_LABEL.matching })
      const [vendorMatch, ...productMatches] = await Promise.all([
        matchContact(invoice.vendorName),
        ...invoice.lineItems.map((li) => matchProduct(li.description)),
      ])
      setProgress({ fraction: 1, label: STAGE_LABEL.matching })

      setParsed(invoice)
      setParty(vendorMatch?.record ?? null)
      setDate(invoice.invoiceDate || '')
      setDueDate(invoice.dueDate || '')

      const combinedTaxRate = invoice.taxes.reduce((sum, t) => sum + t.rate, 0)
      setLines(
        invoice.lineItems.length > 0
          ? invoice.lineItems.map((li, idx) => {
              const match = productMatches[idx]?.record ?? null
              const computedAmount = li.quantity * li.rate
              const mismatch = li.amount > 0 && Math.abs(computedAmount - li.amount) / li.amount > 0.05
              return {
                _key: Math.random().toString(36).slice(2),
                productId: match?.id ?? '',
                product: match,
                description: li.description,
                quantity: String(li.quantity || 1),
                unitPrice: String(li.rate || match?.cost || match?.salesPrice || '0'),
                taxRate: String(match?.gstRate ?? combinedTaxRate ?? 0),
                mismatch,
              }
            })
          : [],
      )

      setStage('review')
    } catch (err) {
      setFileError(err.message || 'Could not read this file — try a clearer photo or a different PDF.')
      setStage('upload')
    }
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  const updateLine = (idx, patch) => setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  const removeLine = (idx) => setLines((prev) => prev.filter((_, i) => i !== idx))
  const addLine = () => setLines((prev) => [...prev, { _key: Math.random().toString(36).slice(2), productId: '', product: null, description: '', quantity: '1', unitPrice: '0', taxRate: '0' }])

  const [createParty, creatingParty] = useGuardedAction(async () => {
    if (!parsed?.vendorName) return
    try {
      const created = await api.post('/contacts', { name: parsed.vendorName, type: partyRole })
      setParty(created)
    } catch {
      setFileError('Could not create the contact — pick or create one manually instead.')
    }
  })

  const confidenceTone = parsed
    ? parsed.confidence >= 80 ? 'text-state-paid bg-[#28a7451f]'
    : parsed.confidence >= 50 ? 'text-[#a06a1f] bg-[#f0ad4e1f]'
    : 'text-state-overdue bg-[#d9534f1f]'
    : ''

  const canFill = Boolean(party) && lines.length > 0 && lines.every((l) => l.productId)

  const submit = () => {
    onFill({
      party,
      date,
      dueDate,
      lines: lines.map((l) => ({ productId: l.productId, product: l.product, quantity: l.quantity, unitPrice: l.unitPrice, taxRate: l.taxRate })),
    })
    close()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Scan Invoice"
      size="xl"
      footer={
        stage === 'review' && (
          <>
            <Button variant="ghost" onClick={reset}>Start Over</Button>
            <Button variant="primary" onClick={submit} disabled={!canFill}>Fill Form</Button>
          </>
        )
      }
    >
      {stage === 'upload' && (
        <div>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center gap-2 rounded border-2 border-dashed px-6 py-12 text-center transition-colors ${dragOver ? 'border-brand bg-brand-light' : 'border-line hover:bg-surface-hover'}`}
          >
            <UploadCloud size={28} className="text-ink-faint" />
            <p className="text-sm font-medium text-ink">Drop a scanned bill or photo here, or click to browse</p>
            <p className="text-xs text-ink-faint">PDF, JPG or PNG · processed entirely on this device, nothing is uploaded</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
            />
          </div>
          {fileError && <p className="mt-3 rounded-sm bg-state-overdue/10 px-2 py-1.5 text-xs text-state-overdue">{fileError}</p>}
        </div>
      )}

      {stage === 'processing' && (
        <div className="flex flex-col items-center gap-3 py-16">
          <FileText size={28} className="text-brand" />
          <p className="text-sm font-medium text-ink">{progress.label}</p>
          <div className="h-1.5 w-64 overflow-hidden rounded-full bg-surface-subtle">
            <div className="h-full bg-brand transition-[width] duration-200" style={{ width: `${Math.round(progress.fraction * 100)}%` }} />
          </div>
        </div>
      )}

      {stage === 'review' && parsed && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className={`badge ${confidenceTone}`}>Confidence {parsed.confidence}%</span>
            {parsed.confidence < 50 && (
              <span className="flex items-center gap-1 text-xs text-state-overdue">
                <AlertTriangle size={12} /> Low confidence — verify every field carefully
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label={partyRole === 'vendor' ? 'Vendor' : 'Customer'} required>
              <SearchSelect
                path="/contacts"
                resolvedOption={party}
                onChange={setParty}
                placeholder={parsed.vendorName || 'Select'}
              />
              {!party && parsed.vendorName && (
                <div className="mt-1.5 flex items-center justify-between rounded-sm bg-surface-subtle px-2 py-1.5 text-xs text-ink-muted">
                  <span>&ldquo;{parsed.vendorName}&rdquo; — new, not in system</span>
                  <button type="button" onClick={createParty} disabled={creatingParty} className="font-medium text-secondary hover:underline disabled:opacity-50">
                    {creatingParty ? 'Creating…' : 'Create'}
                  </button>
                </div>
              )}
            </FormField>
            <FormField label="Date">
              <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </FormField>
            <FormField label="Due Date">
              <TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </FormField>
          </div>

          {parsed.vendorGSTIN && (
            <p className="text-xs text-ink-faint">GSTIN detected: <span className="font-mono text-ink-muted">{parsed.vendorGSTIN}</span></p>
          )}

          <div>
            <p className="field-label mb-1">Line Items</p>
            {lines.length === 0 && (
              <p className="mb-2 flex items-center gap-1.5 text-xs text-state-overdue">
                <AlertTriangle size={12} /> No line items detected — add rows manually.
              </p>
            )}
            <div className="rounded border border-line">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead className="bg-surface-subtle">
                    <tr>
                      <th className="px-2 py-2 text-left text-xs font-semibold uppercase text-ink-muted">Product</th>
                      <th className="w-24 px-2 py-2 text-right text-xs font-semibold uppercase text-ink-muted">Qty</th>
                      <th className="w-32 px-2 py-2 text-right text-xs font-semibold uppercase text-ink-muted">Rate</th>
                      <th className="w-20 px-2 py-2 text-right text-xs font-semibold uppercase text-ink-muted">Tax %</th>
                      <th className="w-32 px-2 py-2 text-right text-xs font-semibold uppercase text-ink-muted">Amount</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, idx) => {
                      const amount = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0)
                      return (
                        <tr key={line._key} className={`border-b border-line last:border-b-0 ${line.mismatch ? 'bg-[#f0ad4e1f]' : ''}`}>
                          <td className="px-2 py-1.5">
                            <div className="flex items-center gap-1.5">
                              {line.product && <CheckCircle2 size={13} className="shrink-0 text-state-paid" />}
                              <SearchSelect
                                path="/products"
                                value={line.productId}
                                resolvedOption={line.product}
                                onChange={(p) => updateLine(idx, { productId: p?.id ?? '', product: p })}
                                placeholder={line.description || 'Select product'}
                              />
                            </div>
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" step="1" min="0" className="field-input text-right tabular" value={line.quantity} onChange={(e) => updateLine(idx, { quantity: e.target.value })} />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" step="1" min="0" className="field-input text-right tabular" value={line.unitPrice} onChange={(e) => updateLine(idx, { unitPrice: e.target.value })} />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" step="0.01" min="0" className="field-input text-right tabular bg-surface-subtle text-ink-muted" value={line.taxRate} readOnly title="Set from the product's GST rate once matched" />
                          </td>
                          <td className="px-3 py-1.5 text-right tabular text-ink">{formatMoney(amount)}</td>
                          <td className="px-2 py-1.5">
                            <button type="button" onClick={() => removeLine(idx)} className="p-1 text-ink-faint hover:text-state-overdue">
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={addLine} className="flex w-full items-center gap-1.5 border-t border-dashed border-line px-3 py-2 text-xs text-ink-faint hover:bg-surface-hover hover:text-secondary">
                <Plus size={12} /> Add a line
              </button>
            </div>
            {lines.some((l) => l.mismatch) && (
              <p className="mt-1.5 text-xs text-[#a06a1f]">Highlighted rows: qty × rate didn&apos;t match the amount printed on the bill by more than 5% — double-check these.</p>
            )}
          </div>

          {parsed.taxes.length > 0 && (
            <div className="rounded border border-line p-3 text-sm">
              <p className="mb-1.5 text-xs font-semibold uppercase text-ink-faint">Taxes Detected</p>
              {parsed.taxes.map((t, i) => (
                <div key={i} className="flex justify-between text-ink-muted">
                  <span>{t.name} @ {t.rate}%</span><span className="tabular">{formatMoney(t.amount)}</span>
                </div>
              ))}
            </div>
          )}

          <button type="button" onClick={() => setShowRawText((v) => !v)} className="flex items-center gap-1 text-xs text-ink-faint hover:text-ink">
            <ChevronDown size={12} className={showRawText ? 'rotate-180' : ''} /> {showRawText ? 'Hide' : 'Show'} raw extracted text
          </button>
          {showRawText && (
            <pre className="max-h-48 overflow-auto rounded bg-surface-subtle p-2 text-xs text-ink-muted whitespace-pre-wrap">{parsed.rawText}</pre>
          )}
        </div>
      )}
    </Modal>
  )
}
