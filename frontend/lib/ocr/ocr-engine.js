'use client'

/**
 * Everything here runs entirely in the browser — no cloud OCR API, no server
 * round-trip, no API key. pdf.js and tesseract.js are bundled via npm and
 * their worker/core/language assets are self-hosted under /public (see
 * PLAN.md §11b change #2), so this genuinely works with the network
 * unplugged.
 *
 * Digital PDFs (the vendor bill is a generated invoice, not a photo) go
 * through page.getTextContent() — instant and 100% accurate. OCR only runs
 * as a fallback for scans and photos, per PLAN.md §11b change #1.
 */

let pdfjsLibPromise = null
async function getPdfjs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import('pdfjs-dist').then((pdfjsLib) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs'
      return pdfjsLib
    })
  }
  return pdfjsLibPromise
}

let tesseractWorkerPromise = null
/** Reused across scans in a session — creation costs 2-3s (PLAN.md §11b Performance). */
async function getTesseractWorker(onProgress) {
  if (!tesseractWorkerPromise) {
    tesseractWorkerPromise = (async () => {
      const { createWorker } = await import('tesseract.js')
      return createWorker('eng', 1, {
        workerPath: '/tesseract/worker.min.js',
        corePath: '/tesseract/core',
        langPath: '/tesseract/lang',
        gzip: true,
        logger: (m) => {
          if (m.status === 'recognizing text' && onProgress) onProgress(m.progress)
        },
      })
    })()
  }
  return tesseractWorkerPromise
}

const Y_TOLERANCE = 3
/** A horizontal gap this wide means separate columns, not spacing. */
const COLUMN_GAP = 60
/** Anything holding a money figure is a table row, not a side-by-side block. */
const MONEY = /\d[\d,]*\.\d{2}/

/**
 * Reconstructs reading-order lines from pdf.js's flat, position-tagged text
 * items — needed because getTextContent() has no concept of rows, and the
 * invoice parser works line-by-line.
 *
 * Rows laid out as two columns get an extra line emitted for the left-hand
 * side, ahead of the joined one. A GST invoice puts the seller and the buyer
 * in blocks beside each other, and everything on one baseline flattens
 * together — so "Zuma Corporation" and "Urban Furniture" arrived as a single
 * line and the parser read the vendor as both companies at once.
 *
 * Only for rows with no money figure in them. Table rows and totals are
 * columnar too, and splitting those would hand the parser half a row and
 * double-count every tax line. The party block has no amounts in it, which
 * makes that a reliable way to tell the two apart.
 */
export function itemsToLines(items) {
  const rows = []
  for (const item of items) {
    const y = item.transform[5]
    const x = item.transform[4]
    let row = rows.find((r) => Math.abs(r.y - y) <= Y_TOLERANCE)
    if (!row) { row = { y, parts: [] }; rows.push(row) }
    row.parts.push({ x, text: item.str, width: item.width ?? 0 })
  }
  rows.sort((a, b) => b.y - a.y) // pdf coordinates are bottom-up

  const lines = []
  for (const row of rows) {
    const parts = row.parts.sort((a, b) => a.x - b.x)
    const joined = parts.map((p) => p.text).join(' ').replace(/\s+/g, ' ').trim()
    if (!joined) continue

    if (!MONEY.test(joined)) {
      const breakAt = parts.findIndex((p, i) =>
        i > 0 && p.x - (parts[i - 1].x + parts[i - 1].width) > COLUMN_GAP)
      if (breakAt > 0) {
        const left = parts.slice(0, breakAt).map((p) => p.text).join(' ').replace(/\s+/g, ' ').trim()
        if (left) lines.push(left)
      }
    }
    lines.push(joined)
  }
  return lines
}

/** Tries the instant, exact path first. Returns null if the PDF has no usable text layer (a scan). */
export async function extractDigitalText(file) {
  const pdfjsLib = await getPdfjs()
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise

  const lines = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    lines.push(...itemsToLines(content.items))
  }

  const text = lines.join('\n')
  const meaningfulChars = text.replace(/\s/g, '').length
  if (meaningfulChars < 40) return null // essentially empty text layer — this is a scan

  return { text, confidence: 97, method: 'digital', pageCount: pdf.numPages }
}

/** Renders every page of a PDF to a canvas at 2x scale (PLAN.md §11b Performance) for OCR. */
export async function pdfToImages(file) {
  const pdfjsLib = await getPdfjs()
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise

  const images = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
    images.push(canvas.toDataURL('image/png'))
  }
  return images
}

/** Downscales an oversized photo before OCR — large phone photos slow Tesseract for no accuracy gain. */
async function normalizeImage(file) {
  const MAX_WIDTH = 2000
  const bitmap = await createImageBitmap(file)
  if (bitmap.width <= MAX_WIDTH) {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    canvas.getContext('2d').drawImage(bitmap, 0, 0)
    return canvas.toDataURL('image/png')
  }
  const scale = MAX_WIDTH / bitmap.width
  const canvas = document.createElement('canvas')
  canvas.width = MAX_WIDTH
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

/** OCRs one or more page images (PSM 6 — single uniform block, per PLAN.md §11b Performance) and merges the result. */
export async function ocrMultiPage(images, onProgress) {
  const worker = await getTesseractWorker(onProgress)
  await worker.setParameters({ tessedit_pageseg_mode: '6' })

  const texts = []
  const confidences = []
  for (let i = 0; i < images.length; i++) {
    const { data } = await worker.recognize(images[i])
    texts.push(data.text)
    confidences.push(data.confidence)
    if (onProgress) onProgress((i + 1) / images.length)
  }

  return {
    text: texts.join('\n'),
    confidence: confidences.reduce((a, b) => a + b, 0) / confidences.length,
    method: 'ocr',
    pageCount: images.length,
  }
}

/**
 * The full pipeline: digital text first, OCR only if the PDF is a scan or
 * the file is a photo. `onProgress(fraction, stage)` reports 0-1 within
 * whichever stage is active.
 */
export async function runOcrPipeline(file, onProgress = () => {}) {
  const isPdf = file.type === 'application/pdf'

  if (isPdf) {
    onProgress(0, 'reading')
    const digital = await extractDigitalText(file)
    if (digital) {
      onProgress(1, 'reading')
      return digital
    }
    onProgress(0, 'rendering')
    const images = await pdfToImages(file)
    onProgress(1, 'rendering')
    onProgress(0, 'ocr')
    return ocrMultiPage(images, (p) => onProgress(p, 'ocr'))
  }

  onProgress(0, 'normalizing')
  const image = await normalizeImage(file)
  onProgress(1, 'normalizing')
  onProgress(0, 'ocr')
  return ocrMultiPage([image], (p) => onProgress(p, 'ocr'))
}
